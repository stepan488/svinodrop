import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean);
const corsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
    // Direct API checks and same-origin production requests have no Origin.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
};
const io = new Server(server, { cors: corsOptions });
const PORT = Number(process.env.PORT || 5000);
const onlineSockets = new Set<string>();
const attempts = new Map<string, { count: number; reset: number }>();

type Session = { id: string; email: string; role: string };
type AuthedRequest = Request & { session?: Session };
const itemSelect = { id: true, name: true, wear: true, price: true, image: true, rarity: true, active: true } as const;

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV !== 'production') return 'local-development-secret-change-me';
  throw new Error('JWT_SECRET must be configured in production');
}
function money(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null; }
function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Требуется вход' });
  try { req.session = jwt.verify(token, secret()) as Session; next(); }
  catch { return res.status(401).json({ error: 'Сессия истекла' }); }
}
function admin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.session?.role !== 'ADMIN') return res.status(403).json({ error: 'Только для администратора' });
  next();
}
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown'; const now = Date.now(); const current = attempts.get(key);
  if (!current || current.reset < now) { attempts.set(key, { count: 1, reset: now + 60_000 }); return next(); }
  current.count += 1;
  if (current.count > 90) return res.status(429).json({ error: 'Слишком много запросов. Попробуйте через минуту.' });
  next();
}
function publicUser(user: { id: string; username: string; email: string; avatar: string | null; balance: number; role: string; createdAt: Date }) {
  return { id: user.id, username: user.username, email: user.email, avatar: user.avatar, balance: user.balance, role: user.role, createdAt: user.createdAt };
}
function pickWeighted<T extends { weight: number }>(list: T[]): T {
  const sum = list.reduce((n, item) => n + item.weight, 0);
  let cursor = crypto.randomInt(sum);
  for (const item of list) { cursor -= item.weight; if (cursor < 0) return item; }
  return list[list.length - 1];
}
type EconomyItem = { id: string; price: number };

function expectedReturn(items: Array<{ weight: number; item: EconomyItem }>) {
  const totalWeight = items.reduce((sum, entry) => sum + entry.weight, 0);
  return totalWeight ? items.reduce((sum, entry) => sum + entry.item.price * entry.weight, 0) / totalWeight : 0;
}

// Rebuild a broken odds table around a predictable 76% theoretical return.
// The target is clamped to the actual prize range, therefore each listed item
// remains obtainable and no imaginary prize can ever be selected.
function balancedWeights(items: EconomyItem[], casePrice: number) {
  const min = Math.min(...items.map((item) => item.price));
  const max = Math.max(...items.map((item) => item.price));
  const target = Math.min(max, Math.max(min, Math.round(casePrice * 0.76)));
  let low = -24; let high = 24;
  for (let iteration = 0; iteration < 56; iteration += 1) {
    const slope = (low + high) / 2;
    const raw = items.map((item) => Math.exp(-slope * item.price / Math.max(1, casePrice)));
    const average = raw.reduce((sum, weight, index) => sum + weight * items[index].price, 0) / raw.reduce((sum, weight) => sum + weight, 0);
    if (average > target) low = slope; else high = slope;
  }
  const raw = items.map((item) => Math.exp(-high * item.price / Math.max(1, casePrice)));
  const largest = Math.max(...raw);
  return items.map((item, index) => ({ itemId: item.id, weight: Math.max(1, Math.round(raw[index] / largest * 10_000)) }));
}

function evenlySpaced<T>(list: T[], maximum: number) {
  if (list.length <= maximum) return list;
  return Array.from({ length: maximum }, (_, index) => list[Math.round(index * (list.length - 1) / (maximum - 1))]);
}

async function repairCaseEconomy() {
  // "Дорфус" was created with a single record, which made the UI say that its
  // contents were missing and guaranteed the same outcome. Fill only this
  // damaged public case from the live catalogue; magic cases are never read or
  // changed by this repair.
  let repairedDorfus = false;
  const catalogue = await prisma.item.findMany({ where: { active: true }, select: { id: true, price: true }, orderBy: { price: 'asc' } });
  const dorfus = await prisma.case.findUnique({
    where: { slug: 'ok-daa' },
    include: { items: { include: { item: { select: { id: true, price: true, active: true } } } } },
  });
  if (dorfus && dorfus.openingStyle === 'REEL' && dorfus.items.filter((entry) => entry.item.active).length < 6) {
    const existing = new Set(dorfus.items.map((entry) => entry.itemId));
    const nearby = catalogue.filter((item) => item.price >= Math.round(dorfus.price * 0.10) && item.price <= Math.round(dorfus.price * 3));
    const additions = evenlySpaced((nearby.length >= 6 ? nearby : catalogue).filter((item) => !existing.has(item.id)), 9);
    if (additions.length) {
      await prisma.caseItem.createMany({ data: additions.map((item) => ({ caseId: dorfus.id, itemId: item.id, weight: 1 })), skipDuplicates: true });
      repairedDorfus = true;
    }
  }

  const cases = await prisma.case.findMany({
    where: { active: true, openingStyle: 'REEL' },
    include: { items: { include: { item: { select: { id: true, price: true, active: true } } } } },
  });
  let corrected = 0;
  for (const caseData of cases) {
    const active = caseData.items.filter((entry) => entry.item.active);
    if (active.length < 2) continue;
    let economyItems: EconomyItem[] = active.map((entry) => ({ id: entry.item.id, price: entry.item.price }));
    const currentMin = Math.min(...economyItems.map((item) => item.price));
    const currentMax = Math.max(...economyItems.map((item) => item.price));
    // Some legacy cases contained only cheap or only expensive prizes. In
    // that situation weight changes alone cannot create fair odds, so add a
    // small, price-appropriate bridge from the active catalogue first.
    const needsLower = currentMin > caseData.price * 0.76;
    const needsHigher = currentMax < caseData.price * 0.76;
    if (needsLower || needsHigher) {
      const known = new Set(economyItems.map((item) => item.id));
      const candidates = catalogue.filter((item) => !known.has(item.id) && (
        needsLower ? item.price <= Math.round(caseData.price * 0.72) : item.price >= Math.round(caseData.price * 0.82)
      ));
      const additions = evenlySpaced(candidates, 3);
      if (additions.length) {
        await prisma.caseItem.createMany({ data: additions.map((item) => ({ caseId: caseData.id, itemId: item.id, weight: 1 })), skipDuplicates: true });
        economyItems = [...economyItems, ...additions];
      }
    }
    const ratio = expectedReturn(active) / Math.max(1, caseData.price);
    // Keep hand-tuned, already sane cases intact. Only economically broken
    // tables (or the repaired singleton) are normalised once at API boot.
    if (!repairedDorfus && ratio >= 0.55 && ratio <= 0.92) continue;
    const weights = balancedWeights(economyItems, caseData.price);
    await prisma.$transaction(weights.map((entry) => prisma.caseItem.update({
      where: { caseId_itemId: { caseId: caseData.id, itemId: entry.itemId } },
      data: { weight: entry.weight },
    })));
    corrected += 1;
  }
  if (corrected) console.log(`Исправлены шансы в ${corrected} кейсах.`);
}
function upgradeLandingAngle(chance: number, success: boolean) {
  // The visible green sector is centred at 180°. The server chooses a random
  // point inside it for a win, or anywhere outside it for a loss, so the
  // animation reflects the protected result without always landing dead-centre.
  const successArc = Math.max(8, Math.min(324, chance * 3.6));
  const start = 180 - successArc / 2;
  const arcSteps = Math.max(1, Math.round(successArc));
  const angle = success
    ? start + crypto.randomInt(arcSteps)
    : (start + successArc + crypto.randomInt(Math.max(1, Math.round(360 - successArc)))) % 360;
  return Math.round(1440 + angle);
}
function dailyStatus(lastClaim: Date | null) {
  const nextAt = lastClaim ? new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000) : null;
  return { available: !nextAt || nextAt <= new Date(), nextAt, maxValue: 150000 };
}
type AutoGiveaway = { kind: 'HOURLY' | 'DAILY' | 'WEEKLY'; title: string; entryPrice: number; min: number; max: number; start: Date; end: Date };
function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function automaticGiveawayWindows(now = new Date()): AutoGiveaway[] {
  const hour = new Date(now); hour.setMinutes(0, 0, 0);
  const day = startOfDay(now);
  const week = startOfDay(now); week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  return [
    { kind: 'HOURLY', title: 'Часовой хрюк-розыгрыш', entryPrice: 2500, min: 50000, max: 350000, start: hour, end: new Date(hour.getTime() + 3_600_000) },
    { kind: 'DAILY', title: 'Ежедневный свиноприз', entryPrice: 10000, min: 250000, max: 1_250_000, start: day, end: new Date(day.getTime() + 86_400_000) },
    { kind: 'WEEKLY', title: 'Еженедельный свинокуш', entryPrice: 50000, min: 750000, max: 3_500_000, start: week, end: new Date(week.getTime() + 604_800_000) },
  ];
}
async function settleGiveaways(now = new Date()) {
  const finished = await prisma.giveaway.findMany({ where: { active: true, endsAt: { lte: now } }, include: { entries: { select: { userId: true } } } });
  for (const giveaway of finished) {
    const entry = giveaway.entries.length ? giveaway.entries[crypto.randomInt(giveaway.entries.length)] : null;
    // Mark it closed first. Only the transaction that changes ACTIVE -> closed
    // gets to issue a prize, even if two visitors open the page at once.
    await prisma.$transaction(async (tx) => {
      const locked = await tx.giveaway.updateMany({ where: { id: giveaway.id, active: true, endsAt: { lte: now } }, data: { active: false, winnerUserId: entry?.userId || null } });
      if (!locked.count || !entry) return;
      await tx.inventory.create({ data: { userId: entry.userId, itemId: giveaway.prizeItemId, obtainedFrom: `giveaway:${giveaway.id}`, revealed: true } });
      await tx.transaction.create({ data: { userId: entry.userId, type: 'GIVEAWAY_WIN', amount: 0, description: `Победа в розыгрыше «${giveaway.title}»` } });
    });
  }
}
async function repairDuplicateAutomaticGiveaways() {
  const automatic = await prisma.giveaway.findMany({
    where: { active: true, automatic: true, kind: { in: ['HOURLY', 'DAILY', 'WEEKLY'] } },
    include: { entries: { select: { userId: true } } },
    // If an old deployment created two rounds, preserve the freshest one.
    // Older rounds are cancelled below and all of their tickets refunded.
    orderBy: { startsAt: 'desc' },
  });
  const kept = new Set<string>();
  for (const giveaway of automatic) {
    if (!kept.has(giveaway.kind)) { kept.add(giveaway.kind); continue; }
    // Historic duplicate rounds are cancelled, never drawn twice. Every paid
    // ticket is returned automatically so no player loses coins to the repair.
    await prisma.$transaction(async (tx) => {
      const closed = await tx.giveaway.updateMany({ where: { id: giveaway.id, active: true }, data: { active: false } });
      if (!closed.count) return;
      for (const entry of giveaway.entries) {
        await tx.user.update({ where: { id: entry.userId }, data: { balance: { increment: giveaway.entryPrice } } });
        await tx.transaction.create({ data: { userId: entry.userId, type: 'GIVEAWAY_REFUND', amount: giveaway.entryPrice, description: `Возврат за дублирующий розыгрыш «${giveaway.title}»` } });
      }
    });
  }
}
async function syncAutomaticGiveaways() {
  const now = new Date();
  await settleGiveaways(now);
  await repairDuplicateAutomaticGiveaways();
  for (const config of automaticGiveawayWindows(now)) {
    // Exactly one live automatic draw of each kind is allowed. A new draw is
    // created only after the previous one was settled and its prize issued.
    // This also makes a restarted server safe: it cannot spawn duplicates.
    const activeRound = await prisma.giveaway.findFirst({
      where: { active: true, automatic: true, kind: config.kind },
      select: { id: true },
    });
    if (activeRound) continue;
    const id = `auto-${config.kind}-${config.start.toISOString()}`;
    const exists = await prisma.giveaway.findUnique({ where: { id } });
    if (exists) continue;
    const prizes = await prisma.item.findMany({ where: { active: true, price: { gte: config.min, lte: config.max } }, select: { id: true } });
    if (!prizes.length) continue;
    await prisma.giveaway.create({ data: { id, title: config.title, kind: config.kind, prizeItemId: prizes[crypto.randomInt(prizes.length)].id, entryPrice: config.entryPrice, startsAt: config.start, endsAt: config.end, automatic: true } }).catch(() => undefined);
  }
}
// The scheduler, the public page and the "enter" button can all request a
// refresh at the same time. One shared task makes this a single queue, so a
// second automatic round can never be created by a race between requests.
let automaticGiveawaySync: Promise<void> | null = null;
function ensureAutomaticGiveaways() {
  if (!automaticGiveawaySync) {
    automaticGiveawaySync = syncAutomaticGiveaways().finally(() => { automaticGiveawaySync = null; });
  }
  return automaticGiveawaySync;
}
async function settlePendingRewards(userId: string) {
  // A case/upgrade result is already decided inside its DB transaction. If a
  // player refreshes mid-animation, reveal every protected prize on login.
  await prisma.$transaction([
    prisma.inventory.updateMany({ where: { userId, revealed: false, removedAt: null }, data: { revealed: true } }),
    prisma.upgrade.updateMany({ where: { userId, result: true, revealed: false }, data: { revealed: true } }),
  ]);
}

app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: '32kb' }));
app.use(rateLimit);

app.get('/api/health', (_req, res) => res.json({ ok: true, online: onlineSockets.size }));
app.get('/api/cases', async (_req, res) => {
  const cases = await prisma.case.findMany({ where: { active: true }, include: { items: { include: { item: { select: itemSelect } }, orderBy: { weight: 'desc' } } }, orderBy: { price: 'asc' } });
  // Magical cases deliberately keep the possible prizes secret from players.
  res.json(cases.map((entry) => {
    if (entry.contentsHidden) return { ...entry, items: [] };
    const totalWeight = entry.items.reduce((sum, item) => sum + item.weight, 0);
    return { ...entry, items: entry.items.map((item) => ({ ...item, chance: totalWeight ? Math.round(item.weight / totalWeight * 10_000) / 100 : 0 })) };
  }));
});
app.get('/api/site-settings', async (_req, res) => res.json(Object.fromEntries((await prisma.siteSetting.findMany()).map((entry) => [entry.key, entry.value]))));
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
app.get('/api/giveaways', async (_req, res) => {
  await ensureAutomaticGiveaways();
  const giveaways = await prisma.giveaway.findMany({ where: { active: true }, include: { prizeItem: { select: itemSelect }, _count: { select: { entries: true } } }, orderBy: { endsAt: 'asc' } });
  // A final output guard keeps the public page clean even while a historic
  // duplicate is being repaired. Custom admin giveaways stay untouched.
  const shownKinds = new Set<string>();
  const visible = giveaways.filter((giveaway) => {
    if (!giveaway.automatic || !['HOURLY', 'DAILY', 'WEEKLY'].includes(giveaway.kind)) return true;
    if (shownKinds.has(giveaway.kind)) return false;
    shownKinds.add(giveaway.kind);
    return true;
  });
  res.json(visible.map((giveaway) => ({ ...giveaway, entries: giveaway._count.entries })));
});
app.post('/api/giveaways/:id/enter', auth, async (req: AuthedRequest, res) => {
  try {
    await ensureAutomaticGiveaways();
    const result = await prisma.$transaction(async (tx) => {
      const giveaway = await tx.giveaway.findFirst({ where: { id: req.params.id, active: true, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } });
      if (!giveaway) throw new Error('Этот розыгрыш уже завершён или ещё не начался.');
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } });
      if (user.balance < giveaway.entryPrice) throw new Error('Недостаточно свинокоинов для участия.');
      const previous = await tx.giveawayEntry.findUnique({ where: { giveawayId_userId: { giveawayId: giveaway.id, userId: user.id } } });
      if (previous) throw new Error('Ты уже участвуешь в этом розыгрыше.');
      await tx.giveawayEntry.create({ data: { giveawayId: giveaway.id, userId: user.id } });
      const updated = await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: giveaway.entryPrice } } });
      await tx.transaction.create({ data: { userId: user.id, type: 'GIVEAWAY_ENTRY', amount: -giveaway.entryPrice, description: `Участие в «${giveaway.title}»` } });
      return { balance: updated.balance, giveawayId: giveaway.id };
    }, { isolationLevel: 'Serializable' });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось принять участие.' }); }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (typeof username !== 'string' || !/^[\w-]{3,24}$/.test(username) || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Проверьте ник, email и пароль (минимум 8 символов).' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { username, email: email.toLowerCase(), passwordHash, balance: 100000, role: 'USER' } });
    await prisma.transaction.create({ data: { userId: user.id, type: 'WELCOME_BONUS', amount: 100000, description: 'Стартовый бонус' } });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, secret(), { expiresIn: '30d' });
    res.status(201).json({ token, user: publicUser(user) });
  } catch { res.status(409).json({ error: 'Этот email или ник уже занят.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  try {
    const user = typeof email === 'string' ? await prisma.user.findUnique({ where: { email: email.toLowerCase() } }) : null;
    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Неверный email или пароль.' });
    if (user.isBanned) return res.status(403).json({ error: 'Аккаунт заблокирован.' });
    await prisma.user.update({ where: { id: user.id }, data: { lastOnline: new Date() } });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, secret(), { expiresIn: '30d' });
    res.json({ token, user: publicUser(user) });
  } catch {
    res.status(503).json({ error: 'База данных временно недоступна. Попробуйте ещё раз.' });
  }
});
app.get('/api/auth/me', auth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session!.id } });
  if (!user || user.isBanned) return res.status(401).json({ error: 'Сессия недоступна.' });
  res.json({ user: publicUser(user) });
});

app.get('/api/inventory', auth, async (req: AuthedRequest, res) => {
  await settlePendingRewards(req.session!.id);
  const items = await prisma.inventory.findMany({ where: { userId: req.session!.id, removedAt: null, revealed: true }, include: { item: { select: itemSelect } }, orderBy: { obtainedAt: 'desc' } });
  res.json(items);
});
app.post('/api/inventory/:id/sell', auth, async (req: AuthedRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findFirst({ where: { id: req.params.id, userId: req.session!.id, removedAt: null, revealed: true }, include: { item: true } });
      if (!inventory) throw new Error('Предмет уже продан или недоступен.');
      const payout = inventory.item.price;
      // Conditional update is the actual anti-double-sale lock. PostgreSQL
      // re-checks removedAt after a competing request releases its row lock.
      const marked = await tx.inventory.updateMany({ where: { id: inventory.id, userId: req.session!.id, removedAt: null, revealed: true }, data: { removedAt: new Date() } });
      if (marked.count !== 1) throw new Error('Предмет уже продан или обрабатывается.');
      const user = await tx.user.update({ where: { id: req.session!.id }, data: { balance: { increment: payout } } });
      await tx.transaction.create({ data: { userId: user.id, type: 'ITEM_SALE', amount: payout, description: `Продажа «${inventory.item.name}»` } });
      return { payout, balance: user.balance };
    }, { isolationLevel: 'Serializable' });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось продать предмет.' }); }
});
app.post('/api/inventory/sell-all', auth, async (req: AuthedRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findMany({ where: { userId: req.session!.id, removedAt: null, revealed: true }, include: { item: true } });
      if (!inventory.length) throw new Error('В инвентаре нет доступных предметов.');
      const payout = inventory.reduce((total, entry) => total + entry.item.price, 0);
      const marked = await tx.inventory.updateMany({ where: { id: { in: inventory.map((entry) => entry.id) }, userId: req.session!.id, removedAt: null, revealed: true }, data: { removedAt: new Date() } });
      if (marked.count !== inventory.length) throw new Error('Инвентарь уже изменился. Обнови страницу и попробуй снова.');
      const user = await tx.user.update({ where: { id: req.session!.id }, data: { balance: { increment: payout } } });
      await tx.transaction.create({ data: { userId: user.id, type: 'INVENTORY_SALE', amount: payout, description: `Продажа всех предметов ×${inventory.length}` } });
      return { sold: inventory.length, payout, balance: user.balance };
    }, { isolationLevel: 'Serializable' });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось продать предметы.' }); }
});
app.get('/api/profile', auth, async (req: AuthedRequest, res) => {
  const userId = req.session!.id;
  const [user, opens, upgrades, itemCount, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }), prisma.drop.count({ where: { userId } }), prisma.upgrade.count({ where: { userId } }), prisma.inventory.count({ where: { userId, removedAt: null, revealed: true } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 })
  ]);
  res.json({ user: publicUser(user), stats: { opens, upgrades, itemCount }, transactions, daily: dailyStatus(user.dailyCaseClaimedAt) });
});

app.get('/api/daily-case', auth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session!.id }, select: { dailyCaseClaimedAt: true } });
  res.json(dailyStatus(user.dailyCaseClaimedAt));
});
app.post('/api/daily-case/open', auth, async (req: AuthedRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } });
      const status = dailyStatus(user.dailyCaseClaimedAt);
      if (!status.available) throw new Error(`Свинячий ежедневный кейс будет доступен ${status.nextAt!.toLocaleString('ru-RU')}`);
      const items = await tx.item.findMany({ where: { active: true, price: { lte: 150000 } }, select: itemSelect, orderBy: { price: 'asc' } });
      if (!items.length) throw new Error('В ежедневном кейсе пока нет предметов.');
      const winner = pickWeighted(items.map((item) => ({ ...item, weight: Math.max(1, Math.round(100_000 / (item.price / 100)))})));
      const inventory = await tx.inventory.create({ data: { userId: user.id, itemId: winner.id, obtainedFrom: 'daily-case', revealed: true } });
      const claimedAt = new Date();
      await tx.user.update({ where: { id: user.id }, data: { dailyCaseClaimedAt: claimedAt } });
      await tx.transaction.create({ data: { userId: user.id, type: 'DAILY_CASE', amount: 0, description: `Ежедневный кейс: «${winner.name}»` } });
      return { item: winner, inventoryId: inventory.id, daily: dailyStatus(claimedAt) };
    }, { isolationLevel: 'Serializable' });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось открыть ежедневный кейс.' }); }
});

app.post('/api/cases/:caseId/open', auth, async (req: AuthedRequest, res) => {
  const count = Number(req.body?.count); const requestKey = req.headers['idempotency-key'];
  if (!Number.isInteger(count) || count < 1 || count > 4 || typeof requestKey !== 'string' || requestKey.length < 12) return res.status(400).json({ error: 'Некорректный запрос открытия.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const replay = await tx.opening.findUnique({ where: { userId_key: { userId: req.session!.id, key: requestKey } } });
      if (replay) return replay.response as unknown as { balance: number; caseName: string; drops: Array<{ dropId: string; inventoryId: string; item: typeof itemSelect }> };
      const caseData = await tx.case.findFirst({ where: { id: req.params.caseId, active: true }, include: { items: { include: { item: { select: itemSelect } } } } });
      if (!caseData) throw new Error('Кейс недоступен');
      if (count > caseData.maxOpen) throw new Error(caseData.maxOpen === 1 ? 'Этот магический кейс можно открыть только по одному.' : `За раз можно открыть до ${caseData.maxOpen} кейсов.`);
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } });
      if (user.isBanned) throw new Error('Аккаунт заблокирован');
      const total = caseData.price * count;
      if (user.balance < total) throw new Error('Недостаточно свинокоинов');
      const eligible = caseData.items.filter((entry) => entry.item.active);
      if (!eligible.length) throw new Error('В кейсе нет предметов');
      const magic = caseData.openingStyle === 'MAGIC';
      // Magic remains exciting, but is not a profit generator: most casts
      // reveal one reward and the rare balance bonus only softens a bad roll.
      const magicRoll = crypto.randomInt(100);
      const magicDropCount = !magic ? count : (magicRoll < 68 ? 1 : magicRoll < 93 ? 2 : 3);
      const magicBalanceReward = magic && crypto.randomInt(100) < 18
        ? Math.max(100, Math.round(caseData.price * (7 + crypto.randomInt(9)) / 100)) : 0;
      await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: total - magicBalanceReward } } });
      await tx.transaction.create({ data: { userId: user.id, type: 'CASE_PURCHASE', amount: -total, description: `Открытие «${caseData.name}» ×${count}` } });
      if (magicBalanceReward) await tx.transaction.create({ data: { userId: user.id, type: 'MAGIC_CASE_COINS', amount: magicBalanceReward, description: `Магический бонус из «${caseData.name}»` } });
      const drops = [] as Array<{ dropId: string; inventoryId: string; item: typeof eligible[number]['item'] }>;
      for (let i = 0; i < magicDropCount; i += 1) {
        const winner = pickWeighted(eligible);
        const drop = await tx.drop.create({ data: { userId: user.id, itemId: winner.itemId, caseId: caseData.id } });
        // A prize belongs to the player as soon as this transaction commits.
        // The separate Drop.revealed flag still controls the animation/feed,
        // but an interrupted animation can never hide the actual inventory item.
        const inventory = await tx.inventory.create({ data: { userId: user.id, itemId: winner.itemId, dropId: drop.id, obtainedFrom: `case:${caseData.slug}`, revealed: true } });
        drops.push({ dropId: drop.id, inventoryId: inventory.id, item: winner.item! });
      }
      const response = { balance: user.balance - total + magicBalanceReward, caseName: caseData.name, drops, balanceReward: magicBalanceReward, openingStyle: caseData.openingStyle };
      await tx.opening.create({ data: { userId: user.id, key: requestKey, response } });
      return response;
    }, { isolationLevel: 'Serializable' });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось открыть кейс' }); }
});
app.post('/api/drops/:dropId/reveal', auth, async (req: AuthedRequest, res) => {
  const drop = await prisma.drop.findFirst({ where: { id: req.params.dropId, userId: req.session!.id }, include: { user: true, item: { select: itemSelect } } });
  if (!drop) return res.status(404).json({ error: 'Дроп не найден' });
  if (!drop.revealed) {
    await prisma.$transaction([prisma.drop.update({ where: { id: drop.id }, data: { revealed: true } }), prisma.inventory.updateMany({ where: { dropId: drop.id, revealed: false }, data: { revealed: true } })]);
    io.emit('drop:revealed', { username: drop.user.username, item: drop.item, kind: 'кейс' });
  }
  res.json({ ok: true });
});

app.post('/api/upgrades', auth, async (req: AuthedRequest, res) => {
  const { sourceInventoryIds, targetItemId, balanceStake = 0 } = req.body ?? {};
  if (!Array.isArray(sourceInventoryIds) || !sourceInventoryIds.length || sourceInventoryIds.length > 8 || new Set(sourceInventoryIds).size !== sourceInventoryIds.length || sourceInventoryIds.some((id) => typeof id !== 'string') || typeof targetItemId !== 'string' || !Number.isSafeInteger(balanceStake) || balanceStake < 0) return res.status(400).json({ error: 'Выберите от 1 до 8 разных предметов, цель и корректную ставку.' });
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const sources = await tx.inventory.findMany({ where: { id: { in: sourceInventoryIds }, userId: req.session!.id, removedAt: null, revealed: true }, include: { item: true } });
      const target = await tx.item.findFirst({ where: { id: targetItemId, active: true } });
      if (sources.length !== sourceInventoryIds.length || !target) throw new Error('Один из предметов больше недоступен');
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } });
      if (balanceStake > user.balance) throw new Error('На балансе недостаточно свинокоинов для ставки.');
      const itemsStake = sources.reduce((total, source) => total + source.item.price, 0);
      const totalStake = itemsStake + balanceStake;
      if (target.price <= totalStake) throw new Error('Цель должна быть дороже общей ставки.');
      const chance = Math.max(2, Math.min(90, Math.round((totalStake / target.price) * 90)));
      const success = crypto.randomInt(100) < chance;
      const landingAngle = upgradeLandingAngle(chance, success);
      await tx.inventory.updateMany({ where: { id: { in: sourceInventoryIds }, userId: req.session!.id, removedAt: null }, data: { removedAt: new Date() } });
      if (balanceStake) {
        await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: balanceStake } } });
        await tx.transaction.create({ data: { userId: user.id, type: 'UPGRADE_STAKE', amount: -balanceStake, description: `Ставка балансом на апгрейд «${target.name}»` } });
      }
      // sourceItemId keeps the legacy history relation; the full stake is
      // represented by the protected inventory records removed above.
      const upgrade = await tx.upgrade.create({ data: { userId: req.session!.id, sourceItemId: sources[0].itemId, targetItemId: target.id, chance, balanceStake, result: success } });
      if (success) await tx.inventory.create({ data: { userId: req.session!.id, itemId: target.id, upgradeId: upgrade.id, obtainedFrom: 'upgrade', revealed: true } });
      return { upgradeId: upgrade.id, success, chance, landingAngle, sources: sources.map((source) => source.item), target, balance: user.balance - balanceStake, balanceStake };
    }, { isolationLevel: 'Serializable' });
    res.json(outcome);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Апгрейд не выполнен' }); }
});
app.post('/api/upgrades/:id/reveal', auth, async (req: AuthedRequest, res) => {
  const upgrade = await prisma.upgrade.findFirst({ where: { id: req.params.id, userId: req.session!.id }, include: { user: true, targetItem: { select: itemSelect } } });
  if (!upgrade) return res.status(404).json({ error: 'Апгрейд не найден' });
  if (!upgrade.revealed) {
    await prisma.$transaction([prisma.upgrade.update({ where: { id: upgrade.id }, data: { revealed: true } }), ...(upgrade.result ? [prisma.inventory.updateMany({ where: { upgradeId: upgrade.id, revealed: false }, data: { revealed: true } })] : [])]);
    if (upgrade.result) io.emit('drop:revealed', { username: upgrade.user.username, item: upgrade.targetItem, kind: 'апгрейд' });
  }
  res.json({ ok: true });
});

type BattleMode = 'NORMAL' | 'CURSED' | 'JACKPOT' | 'LAST';
const battleModes = new Set<BattleMode>(['NORMAL', 'CURSED', 'JACKPOT', 'LAST']);
const publicPlayer = (player: { id: string; userId: string | null; botName: string | null; user?: { username: string; avatar: string | null } | null }) => ({ id: player.id, userId: player.userId, username: player.user?.username || player.botName || 'Бот-свин', avatar: player.user?.avatar || '🤖' });
async function battleView(id: string, userId?: string) {
  const battle = await prisma.battle.findUnique({ where: { id }, include: { players: { include: { user: { select: { username: true, avatar: true } } }, orderBy: { joinedAt: 'asc' } } } });
  if (!battle) return null;
  const caseIds = battle.caseIds as string[];
  const foundCases = await prisma.case.findMany({
    where: { id: { in: caseIds } },
    select: {
      id: true, name: true, image: true, price: true, openingStyle: true,
      // The battle client needs the public case pool to render the same real
      // reel that players see in a regular case opening.
      items: { where: { item: { active: true } }, select: { id: true, weight: true, item: { select: itemSelect } } },
    },
  });
  // Legacy rooms with a secret-pool case are hidden too: a magic case must
  // never expose its contents through a battle replay.
  if (foundCases.some((item) => item.openingStyle === 'MAGIC')) return null;
  const cases = caseIds.map((caseId) => foundCases.find((item) => item.id === caseId)).filter(Boolean);
  return { ...battle, caseIds, cases, players: battle.players.map(publicPlayer), isMine: battle.players.some((player) => player.userId === userId) };
}
async function settleBattle(id: string) {
  const settled = await prisma.$transaction(async (tx) => {
    const battle = await tx.battle.findUnique({ where: { id }, include: { players: { include: { user: { select: { username: true, avatar: true } } }, orderBy: { joinedAt: 'asc' } } } });
    if (!battle || battle.status !== 'WAITING' || battle.players.length < battle.playerLimit) return null;
    const locked = await tx.battle.updateMany({ where: { id, status: 'WAITING' }, data: { status: 'RUNNING' } });
    if (!locked.count) return null;
    const cases = await tx.case.findMany({ where: { id: { in: battle.caseIds as string[] }, active: true, openingStyle: { not: 'MAGIC' } }, include: { items: { include: { item: { select: itemSelect } } } } });
    if (cases.length !== new Set(battle.caseIds as string[]).size) throw new Error('Один из кейсов баттла недоступен.');
    const rounds = battle.players.map((player) => {
      const drops = (battle.caseIds as string[]).map((caseId) => {
        const source = cases.find((item) => item.id === caseId)!;
        const eligible = source.items.filter((entry) => entry.item.active);
        if (!eligible.length) throw new Error(`В кейсе «${source.name}» нет предметов.`);
        const win = pickWeighted(eligible).item;
        return { caseId, caseName: source.name, item: win, value: win.price };
      });
      return { player: publicPlayer(player), drops, total: drops.reduce((sum, drop) => sum + drop.value, 0) };
    });
    let winnerIndex = 0;
    if (battle.mode === 'CURSED') winnerIndex = rounds.reduce((best, row, index) => row.total < rounds[best].total ? index : best, 0);
    else if (battle.mode === 'LAST') winnerIndex = rounds.reduce((best, row, index) => row.drops.at(-1)!.value > rounds[best].drops.at(-1)!.value ? index : best, 0);
    else if (battle.mode === 'JACKPOT') {
      const total = rounds.reduce((sum, row) => sum + row.total, 0) || rounds.length;
      let point = crypto.randomInt(total);
      for (let index = 0; index < rounds.length; index += 1) { point -= rounds[index].total || 1; if (point < 0) { winnerIndex = index; break; } }
    } else winnerIndex = rounds.reduce((best, row, index) => row.total > rounds[best].total ? index : best, 0);
    const winner = battle.players[winnerIndex];
    const allDrops = rounds.flatMap((round) => round.drops);
    if (winner.userId) {
      await tx.inventory.createMany({ data: allDrops.map((drop) => ({ userId: winner.userId!, itemId: drop.item.id, obtainedFrom: `battle:${battle.id}`, revealed: true })) });
      await tx.transaction.create({ data: { userId: winner.userId, type: 'BATTLE_WIN', amount: 0, description: `Победа в кейс-баттле · ${allDrops.length} предметов` } });
    }
    await tx.battle.update({ where: { id: battle.id }, data: { status: 'FINISHED', winnerUserId: winner.userId, results: { rounds, winnerIndex }, settledAt: new Date() } });
    return { id: battle.id, winner: publicPlayer(winner), rounds, mode: battle.mode };
  }, { isolationLevel: 'Serializable' });
  if (settled) io.emit('battle:updated', { id: settled.id });
  return settled;
}
app.get('/api/battles', auth, async (req: AuthedRequest, res) => {
  const battles = await prisma.battle.findMany({ where: { OR: [{ private: false }, { creatorId: req.session!.id }, { players: { some: { userId: req.session!.id } } }] }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true } });
  res.json((await Promise.all(battles.map((battle) => battleView(battle.id, req.session!.id)))).filter(Boolean));
});
app.get('/api/battles/:id', auth, async (req: AuthedRequest, res) => { const battle = await battleView(req.params.id, req.session!.id); if (!battle || (battle.private && !battle.isMine && battle.creatorId !== req.session!.id)) return res.status(404).json({ error: 'Баттл не найден.' }); res.json(battle); });
app.post('/api/battles', auth, async (req: AuthedRequest, res) => {
  const { caseIds, playerLimit = 2, mode = 'NORMAL', private: privateBattle = false, fast = false } = req.body ?? {};
  if (!Array.isArray(caseIds) || !caseIds.length || caseIds.length > 12 || caseIds.some((id) => typeof id !== 'string') || ![2, 3, 4].includes(playerLimit) || !battleModes.has(mode) || typeof fast !== 'boolean') return res.status(400).json({ error: 'Выбери от 1 до 12 кейсов, 2–4 игроков и режим.' });
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Magic cases intentionally conceal their pool and can reveal several
      // rewards, so they are a solo-only mode and must never enter a battle.
      const cases = await tx.case.findMany({ where: { id: { in: caseIds }, active: true, openingStyle: { not: 'MAGIC' } }, select: { id: true, price: true } });
      if (cases.length !== new Set(caseIds).size) throw new Error('Магические и недоступные кейсы нельзя добавлять в баттл.');
      const cost = caseIds.reduce((sum, caseId) => sum + (cases.find((item) => item.id === caseId)?.price || 0), 0);
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } });
      if (user.balance < cost) throw new Error('Недостаточно свинокоинов для создания баттла.');
      await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: cost } } });
      await tx.transaction.create({ data: { userId: user.id, type: 'BATTLE_ENTRY', amount: -cost, description: 'Вход в кейс-баттл' } });
      return tx.battle.create({ data: { creatorId: user.id, mode, playerLimit, private: Boolean(privateBattle), fast, inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(), caseIds, players: { create: { userId: user.id } } } });
    }, { isolationLevel: 'Serializable' });
    io.emit('battle:updated', { id: created.id }); res.status(201).json(await battleView(created.id, req.session!.id));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось создать баттл.' }); }
});
app.post('/api/battles/:id/join', auth, async (req: AuthedRequest, res) => {
  try {
    const joined = await prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({ where: { id: req.params.id }, include: { players: true } });
      if (!battle || battle.status !== 'WAITING') throw new Error('В этот баттл уже нельзя войти.');
      if (battle.players.some((player) => player.userId === req.session!.id)) throw new Error('Ты уже в этом баттле.');
      if (battle.players.length >= battle.playerLimit) throw new Error('Все места уже заняты.');
      const caseIds = battle.caseIds as string[];
      const cases = await tx.case.findMany({ where: { id: { in: caseIds }, active: true }, select: { id: true, price: true } });
      if (cases.length !== new Set(caseIds).size) throw new Error('Один из кейсов баттла недоступен.');
      const cost = caseIds.reduce((sum, caseId) => sum + (cases.find((item) => item.id === caseId)?.price || 0), 0);
      const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } }); if (user.balance < cost) throw new Error('Недостаточно свинокоинов для входа.');
      await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: cost } } }); await tx.transaction.create({ data: { userId: user.id, type: 'BATTLE_ENTRY', amount: -cost, description: 'Вход в кейс-баттл' } });
      await tx.battlePlayer.create({ data: { battleId: battle.id, userId: user.id } }); return battle.players.length + 1 >= battle.playerLimit;
    }, { isolationLevel: 'Serializable' });
    if (joined) await settleBattle(req.params.id); io.emit('battle:updated', { id: req.params.id }); res.json(await battleView(req.params.id, req.session!.id));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось войти в баттл.' }); }
});
app.post('/api/battles/:id/bot', auth, async (req: AuthedRequest, res) => {
  try { await prisma.$transaction(async (tx) => { const battle = await tx.battle.findUnique({ where: { id: req.params.id }, include: { players: true } }); if (!battle || battle.creatorId !== req.session!.id || battle.status !== 'WAITING') throw new Error('Добавить бота нельзя.'); if (battle.players.length >= battle.playerLimit) throw new Error('Нет свободного места.'); await tx.battlePlayer.create({ data: { battleId: battle.id, botName: `Свинобот #${crypto.randomInt(100, 999)}` } }); }); await settleBattle(req.params.id); res.json(await battleView(req.params.id, req.session!.id)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось добавить бота.' }); }
});

type Cell = { x: number; y: number };
function fleetGroups(cells: Cell[]) {
  const remaining = new Set(cells.map((cell) => `${cell.x}:${cell.y}`)); const groups: Cell[][] = [];
  while (remaining.size) { const first = remaining.values().next().value as string; const stack = [first]; remaining.delete(first); const group: Cell[] = []; while (stack.length) { const key = stack.pop()!; const [x, y] = key.split(':').map(Number); group.push({ x, y }); for (const next of [`${x + 1}:${y}`, `${x - 1}:${y}`, `${x}:${y + 1}`, `${x}:${y - 1}`]) if (remaining.delete(next)) stack.push(next); } groups.push(group); }
  return groups;
}
function validFleet(cells: unknown): cells is Cell[] {
  if (!Array.isArray(cells) || cells.length !== 20) return false;
  const result = cells as Cell[]; if (result.some((cell) => !Number.isInteger(cell?.x) || !Number.isInteger(cell?.y) || cell.x < 0 || cell.x > 9 || cell.y < 0 || cell.y > 9) || new Set(result.map((cell) => `${cell.x}:${cell.y}`)).size !== 20) return false;
  const sizes: number[] = [];
  const groups = fleetGroups(result);
  for (const group of groups) { const sameX = group.every((cell) => cell.x === group[0].x); const sameY = group.every((cell) => cell.y === group[0].y); if ((!sameX && !sameY) || group.length > 4) return false; sizes.push(group.length); }
  // Ships never touch, including diagonally. This makes sunk-ship detection
  // unambiguous and prevents players from submitting malformed clusters.
  for (let left = 0; left < groups.length; left += 1) for (let right = left + 1; right < groups.length; right += 1) {
    if (groups[left].some((first) => groups[right].some((second) => Math.abs(first.x - second.x) <= 1 && Math.abs(first.y - second.y) <= 1))) return false;
  }
  return sizes.sort((a, b) => a - b).join(',') === '1,1,1,1,2,2,2,3,3,4';
}
async function navalView(id: string, userId: string) {
  const game = await prisma.navalGame.findUnique({ where: { id }, include: { players: { include: { user: { select: { username: true, avatar: true } } } } } }); if (!game) return null;
  const mine = game.players.find((player) => player.userId === userId); if (!mine) return null; const opponent = game.players.find((player) => player.userId !== userId);
  return { id: game.id, stake: game.stake, status: game.status, turnUserId: game.turnUserId, winnerUserId: game.winnerUserId, mine: { ready: mine.ready, ships: mine.ships || [], shots: mine.shots }, opponent: opponent ? { username: opponent.user.username, avatar: opponent.user.avatar, ready: opponent.ready, shots: opponent.shots } : null };
}
app.get('/api/naval/games', auth, async (_req, res) => res.json(await prisma.navalGame.findMany({ where: { status: { in: ['WAITING', 'SETUP', 'PLAYING'] } }, include: { players: { include: { user: { select: { username: true } } } } }, orderBy: { createdAt: 'desc' }, take: 20 })));
app.get('/api/naval/:id', auth, async (req: AuthedRequest, res) => { const game = await navalView(req.params.id, req.session!.id); if (!game) return res.status(404).json({ error: 'Игра не найдена.' }); res.json(game); });
app.post('/api/naval', auth, async (req: AuthedRequest, res) => { const stake = Number(req.body?.stake); if (!Number.isSafeInteger(stake) || stake < 10_000 || stake > 50_000_000) return res.status(400).json({ error: 'Ставка — от 100 до 500 000 SC.' }); try { const game = await prisma.$transaction(async (tx) => { const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } }); if (user.balance < stake) throw new Error('Недостаточно свинокоинов.'); await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: stake } } }); await tx.transaction.create({ data: { userId: user.id, type: 'NAVAL_ENTRY', amount: -stake, description: 'Ставка в морском бою' } }); return tx.navalGame.create({ data: { creatorId: user.id, stake, players: { create: { userId: user.id } } } }); }, { isolationLevel: 'Serializable' }); io.emit('naval:updated', { id: game.id }); res.status(201).json(await navalView(game.id, req.session!.id)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось создать игру.' }); } });
app.post('/api/naval/:id/join', auth, async (req: AuthedRequest, res) => { try { await prisma.$transaction(async (tx) => { const game = await tx.navalGame.findUnique({ where: { id: req.params.id }, include: { players: true } }); if (!game || game.status !== 'WAITING' || game.players.length !== 1 || game.creatorId === req.session!.id) throw new Error('Войти в эту игру нельзя.'); const user = await tx.user.findUniqueOrThrow({ where: { id: req.session!.id } }); if (user.balance < game.stake) throw new Error('Недостаточно свинокоинов.'); await tx.user.update({ where: { id: user.id }, data: { balance: { decrement: game.stake } } }); await tx.transaction.create({ data: { userId: user.id, type: 'NAVAL_ENTRY', amount: -game.stake, description: 'Ставка в морском бою' } }); await tx.navalPlayer.create({ data: { gameId: game.id, userId: user.id } }); await tx.navalGame.update({ where: { id: game.id }, data: { status: 'SETUP' } }); }, { isolationLevel: 'Serializable' }); io.emit('naval:updated', { id: req.params.id }); res.json(await navalView(req.params.id, req.session!.id)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось войти в игру.' }); } });
app.post('/api/naval/:id/ships', auth, async (req: AuthedRequest, res) => { if (!validFleet(req.body?.ships)) return res.status(400).json({ error: 'Расставь флот: 4 однопалубных, 3 двухпалубных, 2 трёхпалубных и 1 четырёхпалубный корабль.' }); try { await prisma.$transaction(async (tx) => { const game = await tx.navalGame.findUnique({ where: { id: req.params.id }, include: { players: true } }); const player = game?.players.find((item) => item.userId === req.session!.id); if (!game || !player || !['SETUP', 'WAITING'].includes(game.status)) throw new Error('Расстановка недоступна.'); await tx.navalPlayer.update({ where: { id: player.id }, data: { ships: req.body.ships, ready: true } }); const ready = await tx.navalPlayer.count({ where: { gameId: game.id, ready: true } }); if (ready === 2) await tx.navalGame.update({ where: { id: game.id }, data: { status: 'PLAYING', turnUserId: game.creatorId } }); }); io.emit('naval:updated', { id: req.params.id }); res.json(await navalView(req.params.id, req.session!.id)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось сохранить корабли.' }); } });
app.post('/api/naval/:id/shot', auth, async (req: AuthedRequest, res) => { const x = Number(req.body?.x); const y = Number(req.body?.y); if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 9 || y < 0 || y > 9) return res.status(400).json({ error: 'Некорректная клетка.' }); try { await prisma.$transaction(async (tx) => { const game = await tx.navalGame.findUnique({ where: { id: req.params.id }, include: { players: true } }); if (!game || game.status !== 'PLAYING' || game.turnUserId !== req.session!.id) throw new Error('Сейчас ход соперника.'); const enemy = game.players.find((player) => player.userId !== req.session!.id)!; const hits = (enemy.shots as Array<{ x: number; y: number; hit: boolean; sunk?: boolean }>) || []; if (hits.some((shot) => shot.x === x && shot.y === y)) throw new Error('Ты уже стрелял в эту клетку.'); const shipCells = enemy.ships as Cell[]; const hit = shipCells.some((cell) => cell.x === x && cell.y === y); const priorHits = hits.filter((shot) => shot.hit); const ship = hit ? fleetGroups(shipCells).find((group) => group.some((cell) => cell.x === x && cell.y === y)) : undefined; const sunkShip = Boolean(ship && ship.every((cell) => [...priorHits, { x, y, hit }].some((shot) => shot.hit && shot.x === cell.x && shot.y === cell.y))); const shots = [...hits, { x, y, hit, sunk: sunkShip }]; await tx.navalPlayer.update({ where: { id: enemy.id }, data: { shots } }); const sunk = shipCells.every((cell) => shots.some((shot) => shot.hit && shot.x === cell.x && shot.y === cell.y)); if (sunk) { await tx.navalGame.update({ where: { id: game.id }, data: { status: 'FINISHED', winnerUserId: req.session!.id, finishedAt: new Date() } }); await tx.user.update({ where: { id: req.session!.id }, data: { balance: { increment: game.stake * 2 } } }); await tx.transaction.create({ data: { userId: req.session!.id, type: 'NAVAL_WIN', amount: game.stake * 2, description: 'Победа в морском бою' } }); } else if (!hit) await tx.navalGame.update({ where: { id: game.id }, data: { turnUserId: enemy.userId } }); }); io.emit('naval:updated', { id: req.params.id }); res.json(await navalView(req.params.id, req.session!.id)); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Выстрел не выполнен.' }); } });
// Results are created before their animation starts. If a browser is refreshed
// mid-animation, reveal any pending reward on the next authenticated request so
// a successful upgrade can never leave an invisible item in the database.
app.post('/api/recover-pending', auth, async (req: AuthedRequest, res) => {
  const userId = req.session!.id;
  const [upgrades, drops] = await Promise.all([
    prisma.upgrade.findMany({ where: { userId, revealed: false }, select: { id: true, result: true } }),
    prisma.drop.findMany({ where: { userId, revealed: false }, select: { id: true } }),
  ]);
  if (!upgrades.length && !drops.length) return res.json({ recoveredUpgrades: 0, recoveredDrops: 0 });
  await prisma.$transaction([
    ...(upgrades.length ? [prisma.upgrade.updateMany({ where: { id: { in: upgrades.map((upgrade) => upgrade.id) } }, data: { revealed: true } })] : []),
    ...(drops.length ? [prisma.drop.updateMany({ where: { id: { in: drops.map((drop) => drop.id) } }, data: { revealed: true } })] : []),
    ...(upgrades.some((upgrade) => upgrade.result) ? [prisma.inventory.updateMany({ where: { userId, upgradeId: { in: upgrades.filter((upgrade) => upgrade.result).map((upgrade) => upgrade.id) }, revealed: false }, data: { revealed: true } })] : []),
    ...(drops.length ? [prisma.inventory.updateMany({ where: { userId, dropId: { in: drops.map((drop) => drop.id) }, revealed: false }, data: { revealed: true } })] : []),
  ]);
  res.json({ recoveredUpgrades: upgrades.length, recoveredDrops: drops.length });
});

app.post('/api/promos/redeem', auth, async (req: AuthedRequest, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return res.status(400).json({ error: 'Некорректный промокод.' });
  try {
    const promo = await prisma.$transaction(async (tx) => {
      const promoCode = await tx.promoCode.findUnique({ where: { code } });
      if (!promoCode || !promoCode.active || promoCode.uses >= promoCode.maxUses || (promoCode.expiresAt && promoCode.expiresAt < new Date())) throw new Error('Промокод недоступен');
      const existing = await tx.promoRedemption.findUnique({ where: { promoId_userId: { promoId: promoCode.id, userId: req.session!.id } } });
      if (existing) throw new Error('Вы уже использовали этот промокод');
      if (promoCode.rewardType !== 'BALANCE') throw new Error('Этот тип награды пока не поддерживается');
      const amount = Number(promoCode.rewardValue); if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Некорректная награда');
      await tx.user.update({ where: { id: req.session!.id }, data: { balance: { increment: amount } } });
      await tx.transaction.create({ data: { userId: req.session!.id, type: 'PROMO_REWARD', amount, description: `Промокод ${code}` } });
      await tx.promoRedemption.create({ data: { promoId: promoCode.id, userId: req.session!.id } });
      return tx.promoCode.update({ where: { id: promoCode.id }, data: { uses: { increment: 1 } } });
    });
    res.json({ message: 'Промокод активирован!', promo });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось активировать промокод' }); }
});

app.get('/api/chat', async (_req, res) => res.json(await prisma.chatMessage.findMany({ where: { deleted: false }, include: { user: { select: { username: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, take: 50 })));
app.post('/api/chat', auth, async (req: AuthedRequest, res) => {
  const message = String(req.body?.message || '').trim(); if (!message || message.length > 280) return res.status(400).json({ error: 'Сообщение должно быть от 1 до 280 символов.' });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session!.id } });
  if (user.muteUntil && user.muteUntil > new Date()) return res.status(403).json({ error: 'Вы временно не можете писать в чат.' });
  const chatMessage = await prisma.chatMessage.create({ data: { userId: user.id, message }, include: { user: { select: { username: true, avatar: true } } } });
  io.emit('chat:message', chatMessage); res.status(201).json(chatMessage);
});

app.get('/api/admin/users', auth, admin, async (_req, res) => res.json(await prisma.user.findMany({ select: { id: true, username: true, email: true, balance: true, role: true, isBanned: true, muteUntil: true, lastOnline: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 })));
app.post('/api/admin/economy/reset', auth, admin, async (req: AuthedRequest, res) => {
  // This deliberately needs an exact phrase: it is the only irreversible-looking action in the panel.
  if (req.body?.confirmation !== 'RESET_ALL_BALANCES_AND_SKINS') return res.status(400).json({ error: 'Подтвердите очистку контрольной фразой.' });
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [balances, inventory] = await Promise.all([
      tx.user.updateMany({ data: { balance: 0 } }),
      tx.inventory.updateMany({ where: { removedAt: null }, data: { removedAt: now } }),
    ]);
    await tx.adminLog.create({ data: { adminId: req.session!.id, action: 'ECONOMY_RESET_ALL', metadata: { users: balances.count, inventory: inventory.count } } });
    return { users: balances.count, skins: inventory.count };
  });
  io.emit('economy:reset', { at: now.toISOString() });
  res.json({ ok: true, ...result });
});
app.post('/api/admin/users/:id/balance', auth, admin, async (req: AuthedRequest, res) => {
  const amount = money(req.body?.amount); const direction = req.body?.direction;
  if (!amount || !['ADD', 'REMOVE'].includes(direction)) return res.status(400).json({ error: 'Некорректная сумма.' });
  try {
    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUniqueOrThrow({ where: { id: req.params.id } });
      if (direction === 'REMOVE' && target.balance < amount) throw new Error('Недостаточно баланса');
      const updated = await tx.user.update({ where: { id: target.id }, data: { balance: { [direction === 'ADD' ? 'increment' : 'decrement']: amount } } });
      await tx.transaction.create({ data: { userId: target.id, type: `ADMIN_${direction}`, amount: direction === 'ADD' ? amount : -amount, description: 'Изменено администратором' } });
      await tx.adminLog.create({ data: { adminId: req.session!.id, action: `BALANCE_${direction}`, targetUserId: target.id, metadata: { amount } } });
      return updated;
    }); res.json({ user: publicUser(user) });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Ошибка' }); }
});
app.get('/api/admin/users/:id/inventory', auth, admin, async (req, res) => res.json(await prisma.inventory.findMany({ where: { userId: req.params.id }, include: { item: { select: itemSelect } }, orderBy: { obtainedAt: 'desc' } })));
app.get('/api/admin/users/:id/transactions', auth, admin, async (req, res) => res.json(await prisma.transaction.findMany({ where: { userId: req.params.id }, orderBy: { createdAt: 'desc' } })));
app.patch('/api/admin/users/:id/status', auth, admin, async (req: AuthedRequest, res) => {
  const { isBanned, muteMinutes } = req.body ?? {};
  if (typeof isBanned !== 'undefined' && typeof isBanned !== 'boolean') return res.status(400).json({ error: 'Некорректный статус.' });
  if (typeof muteMinutes !== 'undefined' && (!Number.isInteger(muteMinutes) || muteMinutes < 0 || muteMinutes > 43_200)) return res.status(400).json({ error: 'Некорректное время мута.' });
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { ...(typeof isBanned === 'boolean' ? { isBanned } : {}), ...(typeof muteMinutes === 'number' ? { muteUntil: muteMinutes ? new Date(Date.now() + muteMinutes * 60_000) : null } : {}) } });
  await prisma.adminLog.create({ data: { adminId: req.session!.id, action: isBanned === true ? 'USER_BAN' : isBanned === false ? 'USER_UNBAN' : muteMinutes ? 'CHAT_MUTE' : 'CHAT_UNMUTE', targetUserId: user.id } });
  res.json({ user: publicUser(user) });
});
app.get('/api/admin/promos', auth, admin, async (_req, res) => res.json(await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { redemptions: true } } } })));
app.post('/api/admin/promos', auth, admin, async (req: AuthedRequest, res) => {
  const { code, rewardType, rewardValue, maxUses, expiresAt } = req.body ?? {};
  if (typeof code !== 'string' || !/^[A-Z0-9_-]{3,32}$/.test(code.toUpperCase()) || rewardType !== 'BALANCE' || !Number.isSafeInteger(Number(rewardValue)) || !Number.isInteger(maxUses) || maxUses < 1) return res.status(400).json({ error: 'Проверьте поля промокода.' });
  try { const promo = await prisma.promoCode.create({ data: { code: code.toUpperCase(), rewardType, rewardValue: String(rewardValue), maxUses, expiresAt: expiresAt ? new Date(expiresAt) : null } }); await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'PROMO_CREATE', metadata: { code: promo.code } } }); res.status(201).json(promo); }
  catch { res.status(409).json({ error: 'Такой промокод уже существует.' }); }
});
app.patch('/api/admin/promos/:id', auth, admin, async (req: AuthedRequest, res) => { const { active, rewardValue, maxUses, expiresAt } = req.body ?? {}; const promo = await prisma.promoCode.update({ where: { id: req.params.id }, data: { ...(typeof active === 'boolean' ? { active } : {}), ...(rewardValue !== undefined ? { rewardValue: String(rewardValue) } : {}), ...(Number.isInteger(maxUses) ? { maxUses } : {}), ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}) } }); await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'PROMO_UPDATE', metadata: { promoId: promo.id } } }); res.json(promo); });
app.get('/api/admin/items', auth, admin, async (_req, res) => res.json(await prisma.item.findMany({ orderBy: { price: 'asc' } })));
app.get('/api/admin/giveaways', auth, admin, async (_req, res) => {
  await ensureAutomaticGiveaways();
  res.json(await prisma.giveaway.findMany({ include: { prizeItem: { select: itemSelect }, winner: { select: { username: true } }, _count: { select: { entries: true } } }, orderBy: { endsAt: 'asc' }, take: 100 }));
});
app.post('/api/admin/giveaways', auth, admin, async (req: AuthedRequest, res) => {
  const { title, prizeItemId, entryPrice, startsAt, endsAt } = req.body ?? {};
  const start = new Date(startsAt); const end = new Date(endsAt);
  if (typeof title !== 'string' || title.trim().length < 3 || typeof prizeItemId !== 'string' || !money(entryPrice) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return res.status(400).json({ error: 'Проверьте название, приз, цену входа и даты.' });
  try {
    const prize = await prisma.item.findFirst({ where: { id: prizeItemId, active: true } });
    if (!prize) throw new Error('Выбранный приз недоступен.');
    const giveaway = await prisma.giveaway.create({ data: { title: title.trim(), kind: 'CUSTOM', prizeItemId, entryPrice, startsAt: start, endsAt: end } });
    await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'GIVEAWAY_CREATE', metadata: { giveawayId: giveaway.id, prizeItemId, entryPrice } } });
    res.status(201).json(giveaway);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось создать розыгрыш.' }); }
});
app.get('/api/admin/items', auth, admin, async (_req, res) => res.json(await prisma.item.findMany({ select: itemSelect, orderBy: [{ active: 'desc' }, { price: 'asc' }] })));
app.post('/api/admin/items', auth, admin, async (req: AuthedRequest, res) => { const { id, name, wear, price, image, rarity } = req.body ?? {}; if (![id, name, wear, image, rarity].every((value) => typeof value === 'string') || !money(price)) return res.status(400).json({ error: 'Проверьте данные предмета.' }); try { const item = await prisma.$transaction(async (tx) => { const created = await tx.item.create({ data: { id, name, wear, price, image, rarity } }); const cases = await tx.case.findMany({ where: { active: true }, select: { id: true } }); await tx.caseItem.createMany({ data: cases.map((caseData) => ({ caseId: caseData.id, itemId: created.id, weight: Math.max(1, Math.round(100_000 / Math.max(1, created.price / 100))) })), skipDuplicates: true }); return created; }); await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'ITEM_CREATE_AND_INJECT', metadata: { itemId: item.id } } }); res.status(201).json(item); } catch { res.status(409).json({ error: 'Предмет с таким ID уже существует.' }); } });
app.get('/api/admin/site-settings', auth, admin, async (_req, res) => res.json(Object.fromEntries((await prisma.siteSetting.findMany()).map((entry) => [entry.key, entry.value]))));
app.put('/api/admin/site-settings', auth, admin, async (req: AuthedRequest, res) => { const collectionTitle = String(req.body?.collectionTitle || '').trim(); if (!collectionTitle || collectionTitle.length > 64) return res.status(400).json({ error: 'Название должно быть от 1 до 64 символов.' }); await prisma.siteSetting.upsert({ where: { key: 'collectionTitle' }, create: { key: 'collectionTitle', value: collectionTitle }, update: { value: collectionTitle } }); await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'COLLECTION_TITLE_UPDATE', metadata: { collectionTitle } } }); res.json({ collectionTitle }); });
app.patch('/api/admin/items/:id', auth, admin, async (req: AuthedRequest, res) => { const { name, wear, price, image, rarity, active } = req.body ?? {}; const item = await prisma.item.update({ where: { id: req.params.id }, data: { ...(typeof name === 'string' ? { name } : {}), ...(typeof wear === 'string' ? { wear } : {}), ...(money(price) ? { price } : {}), ...(typeof image === 'string' ? { image } : {}), ...(typeof rarity === 'string' ? { rarity } : {}), ...(typeof active === 'boolean' ? { active } : {}) } }); await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'ITEM_UPDATE', metadata: { itemId: item.id } } }); res.json(item); });
app.get('/api/admin/cases', auth, admin, async (_req, res) => res.json(await prisma.case.findMany({ include: { items: { include: { item: { select: itemSelect } } } } })));
app.post('/api/admin/cases', auth, admin, async (req: AuthedRequest, res) => {
  const { name, slug, price, image, collection, items } = req.body ?? {};
  if (![name, slug, image, collection].every((value) => typeof value === 'string') || !/^[a-z0-9-]{3,64}$/.test(slug) || !money(price) || (items !== undefined && (!Array.isArray(items) || !items.length || items.some((item) => typeof item?.itemId !== 'string' || !Number.isInteger(item?.weight) || item.weight < 1)))) return res.status(400).json({ error: 'Проверьте название, slug, цену, изображение и состав кейса.' });
  try {
    const created = await prisma.$transaction(async (tx) => {
      const caseData = await tx.case.create({ data: { name, slug, price, image, collection } });
      if (Array.isArray(items)) {
        const available = await tx.item.count({ where: { id: { in: items.map((item) => item.itemId) }, active: true } });
        if (available !== items.length) throw new Error('В составе есть недоступный предмет.');
        await tx.caseItem.createMany({ data: items.map((item) => ({ caseId: caseData.id, itemId: item.itemId, weight: item.weight })) });
      } else {
        const available = await tx.item.findMany({ where: { active: true }, select: { id: true, price: true } });
        if (available.length) await tx.caseItem.createMany({ data: available.map((item) => ({ caseId: caseData.id, itemId: item.id, weight: Math.max(1, Math.round(100_000 / (item.price / 100)))})) });
      }
      return caseData;
    });
    await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'CASE_CREATE', metadata: { caseId: created.id, slug } } });
    res.status(201).json(created);
  } catch { res.status(409).json({ error: 'Кейс с таким slug уже существует.' }); }
});
app.patch('/api/admin/cases/:id', auth, admin, async (req: AuthedRequest, res) => { const { name, price, image, collection, active } = req.body ?? {}; const item = await prisma.case.update({ where: { id: req.params.id }, data: { ...(typeof name === 'string' ? { name } : {}), ...(money(price) ? { price } : {}), ...(typeof image === 'string' ? { image } : {}), ...(typeof collection === 'string' ? { collection } : {}), ...(typeof active === 'boolean' ? { active } : {}) } }); await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'CASE_UPDATE', metadata: { caseId: item.id } } }); res.json(item); });
app.put('/api/admin/cases/:id/items', auth, admin, async (req: AuthedRequest, res) => { const input = req.body?.items; if (!Array.isArray(input) || !input.length || input.some((item) => typeof item?.itemId !== 'string' || !Number.isInteger(item?.weight) || item.weight < 1)) return res.status(400).json({ error: 'Добавьте хотя бы один предмет с весом от 1.' }); const weights = new Map<string, number>(); input.forEach((item) => weights.set(item.itemId, item.weight)); const items = [...weights].map(([itemId, weight]) => ({ itemId, weight })); try { await prisma.$transaction(async (tx) => { const caseExists = await tx.case.findUnique({ where: { id: req.params.id }, select: { id: true } }); if (!caseExists) throw new Error('Кейс не найден.'); const available = await tx.item.count({ where: { id: { in: items.map((item) => item.itemId) }, active: true } }); if (available !== items.length) throw new Error('Один или несколько выбранных предметов выключены или не существуют. Включи их во вкладке «Предметы».'); await tx.caseItem.deleteMany({ where: { caseId: req.params.id } }); await tx.caseItem.createMany({ data: items.map((item) => ({ caseId: req.params.id, itemId: item.itemId, weight: item.weight })) }); }); await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'CASE_WEIGHTS_UPDATE', metadata: { caseId: req.params.id, itemCount: items.length } } }); res.json({ ok: true, itemCount: items.length }); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Не удалось обновить состав.' }); } });
app.get('/api/admin/logs', auth, admin, async (_req, res) => res.json(await prisma.adminLog.findMany({ include: { admin: { select: { email: true, username: true } } }, orderBy: { createdAt: 'desc' }, take: 250 })));
app.get('/api/admin/chat', auth, admin, async (_req, res) => res.json(await prisma.chatMessage.findMany({ include: { user: { select: { username: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })));
app.delete('/api/admin/chat/:id', auth, admin, async (req: AuthedRequest, res) => {
  const message = await prisma.chatMessage.update({ where: { id: req.params.id }, data: { deleted: true } });
  await prisma.adminLog.create({ data: { adminId: req.session!.id, action: 'CHAT_MESSAGE_DELETE', metadata: { messageId: message.id, userId: message.userId } } });
  io.emit('chat:deleted', { id: message.id });
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  onlineSockets.add(socket.id); io.emit('online:count', onlineSockets.size);
  socket.on('disconnect', () => { onlineSockets.delete(socket.id); io.emit('online:count', onlineSockets.size); });
});
// Keep scheduled giveaways moving even when nobody has the giveaways page open.
// If a host was asleep, the first run after wake-up safely settles overdue rounds.
void ensureAutomaticGiveaways();
setInterval(() => { void ensureAutomaticGiveaways().catch((error) => console.error('Giveaway scheduler:', error)); }, 60_000).unref();
async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({ data: { username: 'PigAdmin', email, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } });
    console.log('Администратор создан из переменных окружения.');
  } else {
    // The deployment secret is authoritative: this both keeps the role intact
    // and lets the owner rotate the initial local password safely on deploy.
    const passwordMatches = await bcrypt.compare(password, existing.passwordHash);
    if (existing.role !== 'ADMIN' || !passwordMatches) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN', ...(passwordMatches ? {} : { passwordHash: await bcrypt.hash(password, 12) }) },
      });
      console.log('Учётные данные администратора обновлены из переменных окружения.');
    }
  }
}
bootstrapAdmin().then(async () => {
  await repairCaseEconomy();
  server.listen(PORT, () => console.log(`SvinoDrop API: http://localhost:${PORT}`));
}).catch((error) => { console.error('Не удалось инициализировать сервер', error); process.exit(1); });
