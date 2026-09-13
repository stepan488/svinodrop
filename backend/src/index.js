"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const socket_io_1 = require("socket.io");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const server = node_http_1.default.createServer(app);
const io = new socket_io_1.Server(server, { cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' } });
const PORT = Number(process.env.PORT || 5000);
const onlineSockets = new Set();
const attempts = new Map();
const itemSelect = { id: true, name: true, wear: true, price: true, image: true, rarity: true, active: true };
function secret() {
    if (process.env.JWT_SECRET)
        return process.env.JWT_SECRET;
    if (process.env.NODE_ENV !== 'production')
        return 'local-development-secret-change-me';
    throw new Error('JWT_SECRET must be configured in production');
}
function money(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null; }
function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token)
        return res.status(401).json({ error: 'Требуется вход' });
    try {
        req.session = jsonwebtoken_1.default.verify(token, secret());
        next();
    }
    catch {
        return res.status(401).json({ error: 'Сессия истекла' });
    }
}
function admin(req, res, next) {
    if (req.session?.role !== 'ADMIN')
        return res.status(403).json({ error: 'Только для администратора' });
    next();
}
function rateLimit(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.reset < now) {
        attempts.set(key, { count: 1, reset: now + 60_000 });
        return next();
    }
    current.count += 1;
    if (current.count > 90)
        return res.status(429).json({ error: 'Слишком много запросов. Попробуйте через минуту.' });
    next();
}
function publicUser(user) {
    return { id: user.id, username: user.username, email: user.email, avatar: user.avatar, balance: user.balance, role: user.role, createdAt: user.createdAt };
}
function pickWeighted(list) {
    const sum = list.reduce((n, item) => n + item.weight, 0);
    let cursor = node_crypto_1.default.randomInt(sum);
    for (const item of list) {
        cursor -= item.weight;
        if (cursor < 0)
            return item;
    }
    return list[list.length - 1];
}
function dailyStatus(lastClaim) {
    const nextAt = lastClaim ? new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000) : null;
    return { available: !nextAt || nextAt <= new Date(), nextAt, maxValue: 150000 };
}
async function settlePendingUpgradeRewards(userId) {
    // An upgrade is already decided inside the DB transaction. If the player
    // refreshes mid-animation, reveal the protected prize instead of hiding it.
    await prisma.$transaction([
        prisma.inventory.updateMany({ where: { userId, upgradeId: { not: null }, revealed: false, removedAt: null }, data: { revealed: true } }),
        prisma.upgrade.updateMany({ where: { userId, result: true, revealed: false }, data: { revealed: true } }),
    ]);
}
app.set('trust proxy', 1);
app.use((0, cors_1.default)({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express_1.default.json({ limit: '32kb' }));
app.use(rateLimit);
app.get('/api/health', (_req, res) => res.json({ ok: true, online: onlineSockets.size }));
app.get('/api/cases', async (_req, res) => {
    const cases = await prisma.case.findMany({ where: { active: true }, include: { items: { include: { item: { select: itemSelect } }, orderBy: { weight: 'desc' } } }, orderBy: { price: 'asc' } });
    res.json(cases);
});
app.get('/api/items', async (_req, res) => res.json(await prisma.item.findMany({ where: { active: true }, select: itemSelect, orderBy: { price: 'asc' } })));
app.get('/api/leaderboard', async (_req, res) => {
    const users = await prisma.user.findMany({
        where: { isBanned: false },
        select: {
            id: true, username: true, avatar: true, balance: true,
            inventory: { where: { removedAt: null, revealed: true }, select: { item: { select: { price: true } } } },
        },
    });
    const board = users
        .map((user) => {
        const inventoryValue = user.inventory.reduce((sum, entry) => sum + entry.item.price, 0);
        return { id: user.id, username: user.username, avatar: user.avatar, balance: user.balance, inventoryValue, skins: user.inventory.length, total: user.balance + inventoryValue };
    })
        .sort((left, right) => right.total - left.total || right.inventoryValue - left.inventoryValue || left.username.localeCompare(right.username))
        .slice(0, 100)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
    res.json(board);
});
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body ?? {};
    if (typeof username !== 'string' || !/^[\w-]{3,24}$/.test(username) || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8)
        return res.status(400).json({ error: 'Проверьте ник, email и пароль (минимум 8 символов).' });
    try {
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const user = await prisma.user.create({ data: { username, email: email.toLowerCase(), passwordHash, balance: 100000, role: 'USER' } });
        await prisma.transaction.create({ data: { userId: user.id, type: 'WELCOME_BONUS', amount: 100000, description: 'Стартовый бонус' } });
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, secret(), { expiresIn: '30d' });
        res.status(201).json({ token, user: publicUser(user) });
    }
    catch {
        res.status(409).json({ error: 'Этот email или ник уже занят.' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    try {
        const user = typeof email === 'string' ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : null;
        if (!user || typeof password !== 'string' || !(await bcryptjs_1.default.compare(password, user.passwordHash)))
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        if (user.isBanned)
            return res.status(403).json({ error: 'Аккаунт заблокирован.' });
        await prisma.user.update({ where: { id: user.id }, data: { lastOnline: new Date() } });
        const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, secret(), { expiresIn: '30d' });
        res.json({ token, user: publicUser(user) });
    }
    catch {
        res.status(503).json({ error: 'База данных временно недоступна. Попробуйте ещё раз.' });
    }
});
app.get('/api/auth/me', auth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.session.id } });
    if (!user || user.isBanned)
        return res.status(401).json({ error: 'Сессия недоступна.' });
    res.json({ user: publicUser(user) });
});
app.get('/api/inventory', auth, async (req, res) => {
    await settlePendingUpgradeRewards(req.session.id);
    const items = await prisma.inventory.findMany({ where: { userId: req.session.id, removedAt: null, revealed: true }, include: { item: { select: itemSelect } }, orderBy: { obtainedAt: 'desc' } });
    res.json(items);
});
app.post('/api/inventory/:id/sell', auth, async (req, res) => {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const inventory = await tx.inventory.findFirst({ where: { id: req.params.id, userId: req.session.id, removedAt: null, revealed: true }, include: { item: true } });
            if (!inventory)
                throw new Error('Предмет уже продан или недоступен.');
            const payout = inventory.item.price;
            await tx.inventory.update({ where: { id: inventory.id }, data: { removedAt: new Date() } });
            const user = await tx.user.update({ where: { id: req.session.id }, data: { balance: { increment: payout } } });
            await tx.transaction.create({ data: { userId: user.id, type: 'ITEM_SALE', amount: payout, description: `Продажа «${inventory.item.name}»` } });
            return { payout, balance: user.balance };
        });
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось продать предмет.' });
    }
});
app.post('/api/inventory/sell-all', auth, async (req, res) => {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const inventory = await tx.inventory.findMany({ where: { userId: req.session.id, removedAt: null, revealed: true }, include: { item: true } });
            if (!inventory.length)
                throw new Error('В инвентаре нет доступных предметов.');
            const payout = inventory.reduce((total, entry) => total + entry.item.price, 0);
            await tx.inventory.updateMany({ where: { id: { in: inventory.map((entry) => entry.id) } }, data: { removedAt: new Date() } });
            const user = await tx.user.update({ where: { id: req.session.id }, data: { balance: { increment: payout } } });
            await tx.transaction.create({ data: { userId: user.id, type: 'INVENTORY_SALE', amount: payout, description: `Продажа всех предметов ×${inventory.length}` } });
            return { sold: inventory.length, payout, balance: user.balance };
        });
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось продать предметы.' });
    }
});
app.get('/api/profile', auth, async (req, res) => {
    const userId = req.session.id;
    const [user, opens, upgrades, itemCount, transactions] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId } }), prisma.drop.count({ where: { userId } }), prisma.upgrade.count({ where: { userId } }), prisma.inventory.count({ where: { userId, removedAt: null, revealed: true } }),
        prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 })
    ]);
    res.json({ user: publicUser(user), stats: { opens, upgrades, itemCount }, transactions, daily: dailyStatus(user.dailyCaseClaimedAt) });
});
app.get('/api/daily-case', auth, async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session.id }, select: { dailyCaseClaimedAt: true } });
    res.json(dailyStatus(user.dailyCaseClaimedAt));
});
app.post('/api/daily-case/open', auth, async (req, res) => {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUniqueOrThrow({ where: { id: req.session.id } });
            const status = dailyStatus(user.dailyCaseClaimedAt);
            if (!status.available)
                throw new Error(`Свинячий ежедневный кейс будет доступен ${status.nextAt.toLocaleString('ru-RU')}`);
            const items = await tx.item.findMany({ where: { active: true, price: { lte: 150000 } }, select: itemSelect, orderBy: { price: 'asc' } });
            if (!items.length)
                throw new Error('В ежедневном кейсе пока нет предметов.');
            const winner = pickWeighted(items.map((item) => ({ ...item, weight: Math.max(1, Math.round(100_000 / (item.price / 100))) })));
            const inventory = await tx.inventory.create({ data: { userId: user.id, itemId: winner.id, obtainedFrom: 'daily-case', revealed: true } });
            const claimedAt = new Date();
            await tx.user.update({ where: { id: user.id }, data: { dailyCaseClaimedAt: claimedAt } });
            await tx.transaction.create({ data: { userId: user.id, type: 'DAILY_CASE', amount: 0, description: `Ежедневный кейс: «${winner.name}»` } });
            return { item: winner, inventoryId: inventory.id, daily: dailyStatus(claimedAt) };
        }, { isolationLevel: 'Serializable' });
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось открыть ежедневный кейс.' });
    }
});
app.post('/api/cases/:caseId/open', auth, async (req, res) => {
    const count = Number(req.body?.count);
    const requestKey = req.headers['idempotency-key'];
    if (!Number.isInteger(count) || count < 1 || count > 5 || typeof requestKey !== 'string' || requestKey.length < 12)
        return res.status(400).json({ error: 'Некорректный запрос открытия.' });
    try {
        const result = await prisma.$transaction(async (tx) => {
            const replay = await tx.opening.findUnique({ where: { userId_key: { userId: req.session.id, key: requestKey } } });
            if (replay)
                return replay.response;
            const caseData = await tx.case.findFirst({ where: { id: req.params.caseId, active: true }, include: { items: { include: { item: { select: itemSelect } } } } });
            if (!caseData)
                throw new Error('Кейс недоступен');
            const user = await tx.user.findUniqueOrThrow({ where: { id: req.session.id } });
            if (user.isBanned)
                throw new Error('Аккаунт заблокирован');
            const total = caseData.price * count;
            if (user.balance < total)
                throw new Error('Недостаточно свинокоинов');
            const eligible = caseData.items.filter((entry) => entry.item.active);
            if (!eligible.length)
                throw new Error('В кейсе нет предметов');
            await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: total } } });
            await tx.transaction.create({ data: { userId: user.id, type: 'CASE_PURCHASE', amount: -total, description: `Открытие «${caseData.name}» ×${count}` } });
            const drops = [];
            for (let i = 0; i < count; i += 1) {
                const winner = pickWeighted(eligible);
                const drop = await tx.drop.create({ data: { userId: user.id, itemId: winner.itemId, caseId: caseData.id } });
                const inventory = await tx.inventory.create({ data: { userId: user.id, itemId: winner.itemId, dropId: drop.id, obtainedFrom: `case:${caseData.slug}`, revealed: false } });
                drops.push({ dropId: drop.id, inventoryId: inventory.id, item: winner.item });
            }
            const response = { balance: user.balance - total, caseName: caseData.name, drops };
            await tx.opening.create({ data: { userId: user.id, key: requestKey, response } });
            return response;
        }, { isolationLevel: 'Serializable' });
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось открыть кейс' });
    }
});
app.post('/api/drops/:dropId/reveal', auth, async (req, res) => {
    const drop = await prisma.drop.findFirst({ where: { id: req.params.dropId, userId: req.session.id }, include: { user: true, item: { select: itemSelect } } });
    if (!drop)
        return res.status(404).json({ error: 'Дроп не найден' });
    if (!drop.revealed) {
        await prisma.$transaction([prisma.drop.update({ where: { id: drop.id }, data: { revealed: true } }), prisma.inventory.updateMany({ where: { dropId: drop.id, revealed: false }, data: { revealed: true } })]);
        io.emit('drop:revealed', { username: drop.user.username, item: drop.item, kind: 'кейс' });
    }
    res.json({ ok: true });
});
app.post('/api/upgrades', auth, async (req, res) => {
    const { sourceInventoryId, targetItemId, balanceStake = 0 } = req.body ?? {};
    if (typeof sourceInventoryId !== 'string' || typeof targetItemId !== 'string' || !Number.isSafeInteger(balanceStake) || balanceStake < 0)
        return res.status(400).json({ error: 'Выберите предмет, цель и корректную ставку.' });
    try {
        const outcome = await prisma.$transaction(async (tx) => {
            const source = await tx.inventory.findFirst({ where: { id: sourceInventoryId, userId: req.session.id, removedAt: null, revealed: true }, include: { item: true } });
            const target = await tx.item.findFirst({ where: { id: targetItemId, active: true } });
            if (!source || !target)
                throw new Error('Предмет больше недоступен');
            const user = await tx.user.findUniqueOrThrow({ where: { id: req.session.id } });
            if (balanceStake > user.balance)
                throw new Error('На балансе недостаточно свинокоинов для ставки.');
            const totalStake = source.item.price + balanceStake;
            if (target.price <= totalStake)
                throw new Error('Цель должна быть дороже общей ставки.');
            const chance = Math.max(2, Math.min(90, Math.round((totalStake / target.price) * 90)));
            const success = node_crypto_1.default.randomInt(100) < chance;
            await tx.inventory.update({ where: { id: source.id }, data: { removedAt: new Date() } });
            if (balanceStake) {
                await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: balanceStake } } });
                await tx.transaction.create({ data: { userId: user.id, type: 'UPGRADE_STAKE', amount: -balanceStake, description: `Ставка балансом на апгрейд «${target.name}»` } });
            }
            const upgrade = await tx.upgrade.create({ data: { userId: req.session.id, sourceItemId: source.itemId, targetItemId: target.id, chance, balanceStake, result: success } });
            if (success)
                await tx.inventory.create({ data: { userId: req.session.id, itemId: target.id, upgradeId: upgrade.id, obtainedFrom: 'upgrade', revealed: false } });
            return { upgradeId: upgrade.id, success, chance, source: source.item, target, balance: user.balance - balanceStake, balanceStake };
        }, { isolationLevel: 'Serializable' });
        res.json(outcome);
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Апгрейд не выполнен' });
    }
});
app.post('/api/upgrades/:id/reveal', auth, async (req, res) => {
    const upgrade = await prisma.upgrade.findFirst({ where: { id: req.params.id, userId: req.session.id }, include: { user: true, targetItem: { select: itemSelect } } });
    if (!upgrade)
        return res.status(404).json({ error: 'Апгрейд не найден' });
    if (!upgrade.revealed) {
        await prisma.$transaction([prisma.upgrade.update({ where: { id: upgrade.id }, data: { revealed: true } }), ...(upgrade.result ? [prisma.inventory.updateMany({ where: { upgradeId: upgrade.id, revealed: false }, data: { revealed: true } })] : [])]);
        if (upgrade.result)
            io.emit('drop:revealed', { username: upgrade.user.username, item: upgrade.targetItem, kind: 'апгрейд' });
    }
    res.json({ ok: true });
});
app.post('/api/promos/redeem', auth, async (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code))
        return res.status(400).json({ error: 'Некорректный промокод.' });
    try {
        const promo = await prisma.$transaction(async (tx) => {
            const promoCode = await tx.promoCode.findUnique({ where: { code } });
            if (!promoCode || !promoCode.active || promoCode.uses >= promoCode.maxUses || (promoCode.expiresAt && promoCode.expiresAt < new Date()))
                throw new Error('Промокод недоступен');
            const existing = await tx.promoRedemption.findUnique({ where: { promoId_userId: { promoId: promoCode.id, userId: req.session.id } } });
            if (existing)
                throw new Error('Вы уже использовали этот промокод');
            if (promoCode.rewardType !== 'BALANCE')
                throw new Error('Этот тип награды пока не поддерживается');
            const amount = Number(promoCode.rewardValue);
            if (!Number.isSafeInteger(amount) || amount < 1)
                throw new Error('Некорректная награда');
            await tx.user.update({ where: { id: req.session.id }, data: { balance: { increment: amount } } });
            await tx.transaction.create({ data: { userId: req.session.id, type: 'PROMO_REWARD', amount, description: `Промокод ${code}` } });
            await tx.promoRedemption.create({ data: { promoId: promoCode.id, userId: req.session.id } });
            return tx.promoCode.update({ where: { id: promoCode.id }, data: { uses: { increment: 1 } } });
        });
        res.json({ message: 'Промокод активирован!', promo });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось активировать промокод' });
    }
});
app.get('/api/chat', async (_req, res) => res.json(await prisma.chatMessage.findMany({ where: { deleted: false }, include: { user: { select: { username: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, take: 50 })));
app.post('/api/chat', auth, async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 280)
        return res.status(400).json({ error: 'Сообщение должно быть от 1 до 280 символов.' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session.id } });
    if (user.muteUntil && user.muteUntil > new Date())
        return res.status(403).json({ error: 'Вы временно не можете писать в чат.' });
    const chatMessage = await prisma.chatMessage.create({ data: { userId: user.id, message }, include: { user: { select: { username: true, avatar: true } } } });
    io.emit('chat:message', chatMessage);
    res.status(201).json(chatMessage);
});
app.get('/api/admin/users', auth, admin, async (_req, res) => res.json(await prisma.user.findMany({ select: { id: true, username: true, email: true, balance: true, role: true, isBanned: true, muteUntil: true, lastOnline: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 })));
app.post('/api/admin/economy/reset', auth, admin, async (req, res) => {
    // This deliberately needs an exact phrase: it is the only irreversible-looking action in the panel.
    if (req.body?.confirmation !== 'RESET_ALL_BALANCES_AND_SKINS')
        return res.status(400).json({ error: 'Подтвердите очистку контрольной фразой.' });
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
        const [balances, inventory] = await Promise.all([
            tx.user.updateMany({ data: { balance: 0 } }),
            tx.inventory.updateMany({ where: { removedAt: null }, data: { removedAt: now } }),
        ]);
        await tx.adminLog.create({ data: { adminId: req.session.id, action: 'ECONOMY_RESET_ALL', metadata: { users: balances.count, inventory: inventory.count } } });
        return { users: balances.count, skins: inventory.count };
    });
    io.emit('economy:reset', { at: now.toISOString() });
    res.json({ ok: true, ...result });
});
app.post('/api/admin/users/:id/balance', auth, admin, async (req, res) => {
    const amount = money(req.body?.amount);
    const direction = req.body?.direction;
    if (!amount || !['ADD', 'REMOVE'].includes(direction))
        return res.status(400).json({ error: 'Некорректная сумма.' });
    try {
        const user = await prisma.$transaction(async (tx) => {
            const target = await tx.user.findUniqueOrThrow({ where: { id: req.params.id } });
            if (direction === 'REMOVE' && target.balance < amount)
                throw new Error('Недостаточно баланса');
            const updated = await tx.user.update({ where: { id: target.id }, data: { balance: { [direction === 'ADD' ? 'increment' : 'decrement']: amount } } });
            await tx.transaction.create({ data: { userId: target.id, type: `ADMIN_${direction}`, amount: direction === 'ADD' ? amount : -amount, description: 'Изменено администратором' } });
            await tx.adminLog.create({ data: { adminId: req.session.id, action: `BALANCE_${direction}`, targetUserId: target.id, metadata: { amount } } });
            return updated;
        });
        res.json({ user: publicUser(user) });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Ошибка' });
    }
});
app.get('/api/admin/users/:id/inventory', auth, admin, async (req, res) => res.json(await prisma.inventory.findMany({ where: { userId: req.params.id }, include: { item: { select: itemSelect } }, orderBy: { obtainedAt: 'desc' } })));
app.get('/api/admin/users/:id/transactions', auth, admin, async (req, res) => res.json(await prisma.transaction.findMany({ where: { userId: req.params.id }, orderBy: { createdAt: 'desc' } })));
app.patch('/api/admin/users/:id/status', auth, admin, async (req, res) => {
    const { isBanned, muteMinutes } = req.body ?? {};
    if (typeof isBanned !== 'undefined' && typeof isBanned !== 'boolean')
        return res.status(400).json({ error: 'Некорректный статус.' });
    if (typeof muteMinutes !== 'undefined' && (!Number.isInteger(muteMinutes) || muteMinutes < 0 || muteMinutes > 43_200))
        return res.status(400).json({ error: 'Некорректное время мута.' });
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { ...(typeof isBanned === 'boolean' ? { isBanned } : {}), ...(typeof muteMinutes === 'number' ? { muteUntil: muteMinutes ? new Date(Date.now() + muteMinutes * 60_000) : null } : {}) } });
    await prisma.adminLog.create({ data: { adminId: req.session.id, action: isBanned === true ? 'USER_BAN' : isBanned === false ? 'USER_UNBAN' : muteMinutes ? 'CHAT_MUTE' : 'CHAT_UNMUTE', targetUserId: user.id } });
    res.json({ user: publicUser(user) });
});
app.get('/api/admin/promos', auth, admin, async (_req, res) => res.json(await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { redemptions: true } } } })));
app.post('/api/admin/promos', auth, admin, async (req, res) => {
    const { code, rewardType, rewardValue, maxUses, expiresAt } = req.body ?? {};
    if (typeof code !== 'string' || !/^[A-Z0-9_-]{3,32}$/.test(code.toUpperCase()) || rewardType !== 'BALANCE' || !Number.isSafeInteger(Number(rewardValue)) || !Number.isInteger(maxUses) || maxUses < 1)
        return res.status(400).json({ error: 'Проверьте поля промокода.' });
    try {
        const promo = await prisma.promoCode.create({ data: { code: code.toUpperCase(), rewardType, rewardValue: String(rewardValue), maxUses, expiresAt: expiresAt ? new Date(expiresAt) : null } });
        await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'PROMO_CREATE', metadata: { code: promo.code } } });
        res.status(201).json(promo);
    }
    catch {
        res.status(409).json({ error: 'Такой промокод уже существует.' });
    }
});
app.patch('/api/admin/promos/:id', auth, admin, async (req, res) => { const { active, rewardValue, maxUses, expiresAt } = req.body ?? {}; const promo = await prisma.promoCode.update({ where: { id: req.params.id }, data: { ...(typeof active === 'boolean' ? { active } : {}), ...(rewardValue !== undefined ? { rewardValue: String(rewardValue) } : {}), ...(Number.isInteger(maxUses) ? { maxUses } : {}), ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}) } }); await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'PROMO_UPDATE', metadata: { promoId: promo.id } } }); res.json(promo); });
app.get('/api/admin/items', auth, admin, async (_req, res) => res.json(await prisma.item.findMany({ orderBy: { price: 'asc' } })));
app.post('/api/admin/items', auth, admin, async (req, res) => { const { id, name, wear, price, image, rarity } = req.body ?? {}; if (![id, name, wear, image, rarity].every((value) => typeof value === 'string') || !money(price))
    return res.status(400).json({ error: 'Проверьте данные предмета.' }); const item = await prisma.item.create({ data: { id, name, wear, price, image, rarity } }); await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'ITEM_CREATE', metadata: { itemId: item.id } } }); res.status(201).json(item); });
app.patch('/api/admin/items/:id', auth, admin, async (req, res) => { const { name, wear, price, image, rarity, active } = req.body ?? {}; const item = await prisma.item.update({ where: { id: req.params.id }, data: { ...(typeof name === 'string' ? { name } : {}), ...(typeof wear === 'string' ? { wear } : {}), ...(money(price) ? { price } : {}), ...(typeof image === 'string' ? { image } : {}), ...(typeof rarity === 'string' ? { rarity } : {}), ...(typeof active === 'boolean' ? { active } : {}) } }); await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'ITEM_UPDATE', metadata: { itemId: item.id } } }); res.json(item); });
app.get('/api/admin/cases', auth, admin, async (_req, res) => res.json(await prisma.case.findMany({ include: { items: { include: { item: { select: itemSelect } } } } })));
app.post('/api/admin/cases', auth, admin, async (req, res) => {
    const { name, slug, price, image, collection, items } = req.body ?? {};
    if (![name, slug, image, collection].every((value) => typeof value === 'string') || !/^[a-z0-9-]{3,64}$/.test(slug) || !money(price) || (items !== undefined && (!Array.isArray(items) || !items.length || items.some((item) => typeof item?.itemId !== 'string' || !Number.isInteger(item?.weight) || item.weight < 1))))
        return res.status(400).json({ error: 'Проверьте название, slug, цену, изображение и состав кейса.' });
    try {
        const created = await prisma.$transaction(async (tx) => {
            const caseData = await tx.case.create({ data: { name, slug, price, image, collection } });
            if (Array.isArray(items)) {
                const available = await tx.item.count({ where: { id: { in: items.map((item) => item.itemId) }, active: true } });
                if (available !== items.length)
                    throw new Error('В составе есть недоступный предмет.');
                await tx.caseItem.createMany({ data: items.map((item) => ({ caseId: caseData.id, itemId: item.itemId, weight: item.weight })) });
            }
            else {
                const available = await tx.item.findMany({ where: { active: true }, select: { id: true, price: true } });
                if (available.length)
                    await tx.caseItem.createMany({ data: available.map((item) => ({ caseId: caseData.id, itemId: item.id, weight: Math.max(1, Math.round(100_000 / (item.price / 100))) })) });
            }
            return caseData;
        });
        await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'CASE_CREATE', metadata: { caseId: created.id, slug } } });
        res.status(201).json(created);
    }
    catch {
        res.status(409).json({ error: 'Кейс с таким slug уже существует.' });
    }
});
app.patch('/api/admin/cases/:id', auth, admin, async (req, res) => { const { name, price, image, collection, active } = req.body ?? {}; const item = await prisma.case.update({ where: { id: req.params.id }, data: { ...(typeof name === 'string' ? { name } : {}), ...(money(price) ? { price } : {}), ...(typeof image === 'string' ? { image } : {}), ...(typeof collection === 'string' ? { collection } : {}), ...(typeof active === 'boolean' ? { active } : {}) } }); await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'CASE_UPDATE', metadata: { caseId: item.id } } }); res.json(item); });
app.put('/api/admin/cases/:id/items', auth, admin, async (req, res) => { const items = req.body?.items; if (!Array.isArray(items) || !items.length || items.some((item) => typeof item?.itemId !== 'string' || !Number.isInteger(item?.weight) || item.weight < 1))
    return res.status(400).json({ error: 'Добавьте хотя бы один предмет с весом от 1.' }); try {
    await prisma.$transaction(async (tx) => { const available = await tx.item.count({ where: { id: { in: items.map((item) => item.itemId) }, active: true } }); if (available !== items.length)
        throw new Error('В составе есть недоступный предмет.'); await tx.caseItem.deleteMany({ where: { caseId: req.params.id } }); await tx.caseItem.createMany({ data: items.map((item) => ({ caseId: req.params.id, itemId: item.itemId, weight: item.weight })) }); });
    await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'CASE_WEIGHTS_UPDATE', metadata: { caseId: req.params.id } } });
    res.json({ ok: true });
}
catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось обновить состав.' });
} });
app.get('/api/admin/logs', auth, admin, async (_req, res) => res.json(await prisma.adminLog.findMany({ include: { admin: { select: { email: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 250 })));
app.get('/api/admin/chat', auth, admin, async (_req, res) => res.json(await prisma.chatMessage.findMany({ include: { user: { select: { username: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })));
app.delete('/api/admin/chat/:id', auth, admin, async (req, res) => {
    const message = await prisma.chatMessage.update({ where: { id: req.params.id }, data: { deleted: true } });
    await prisma.adminLog.create({ data: { adminId: req.session.id, action: 'CHAT_MESSAGE_DELETE', metadata: { messageId: message.id, userId: message.userId } } });
    io.emit('chat:deleted', { id: message.id });
    res.json({ ok: true });
});
io.on('connection', (socket) => {
    onlineSockets.add(socket.id);
    io.emit('online:count', onlineSockets.size);
    socket.on('disconnect', () => { onlineSockets.delete(socket.id); io.emit('online:count', onlineSockets.size); });
});
async function bootstrapAdmin() {
    const email = process.env.ADMIN_EMAIL?.toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password)
        return;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
        await prisma.user.create({ data: { username: 'PigAdmin', email, passwordHash: await bcryptjs_1.default.hash(password, 12), role: 'ADMIN' } });
        console.log('Администратор создан из переменных окружения.');
    }
    else if (existing.role !== 'ADMIN') {
        await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
    }
}
bootstrapAdmin().then(() => server.listen(PORT, () => console.log(`SvinoDrop API: http://localhost:${PORT}`))).catch((error) => { console.error('Не удалось инициализировать сервер', error); process.exit(1); });
//# sourceMappingURL=index.js.map