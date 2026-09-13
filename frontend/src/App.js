import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import './animations.css';
import './refinement.css';
// Local development uses the separate API; a production build can use a
// configured API subdomain or the same origin without shipping localhost.
const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');
const rarity = (value) => `rarity-${value.toLowerCase().replaceAll('-', '')}`;
const coins = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value / 100);
const spinDuration = { FAST: 2200, SLOW: 5200, RISK: 8000 };
const spinModeLabel = { FAST: 'Быстрый', SLOW: 'Плавный', RISK: 'Азартный' };
const fallbackCases = [
    ['Генста Свин!', 'gensta-svin', 499, 'https://i.ibb.co/gb4r4CLF/b4f6cb58-752e-44ae-885c-bbbe73098ba9.png'],
    ['Хакер Свин!', 'hacker-svin', 999, 'https://i.ibb.co/LhSVn6Ct/48eb32a1-02f8-438f-b615-996134c84736.png'],
    ['Мапер Свин!', 'mapper-svin', 1999, 'https://i.ibb.co/gZpjvqCG/9129ec80-5503-466d-ad65-5a61220e8d5c.png'],
    ['Пиратский Свин!', 'pirate-svin', 3499, 'https://i.ibb.co/tpc6jfbr/9ff2456a-8ed4-43f4-883d-0d98633f1de0.png'],
].map(([name, slug, price, image], index) => ({ id: `offline-${index}`, name: String(name), slug: String(slug), price: Number(price) * 100, image: String(image), collection: 'Свиноохотники', items: [] }));
class ApiError extends Error {
    status;
    constructor(message, status) { super(message); this.status = status; }
}
async function request(path, token, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new ApiError(body.error || 'Свиносервер временно недоступен', response.status);
    return body;
}
export default function App() {
    const [page, setPage] = useState('cases');
    const [cases, setCases] = useState(fallbackCases);
    const [casesReady, setCasesReady] = useState(false);
    const [skins, setSkins] = useState([]);
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('svino-token') || '');
    const [inventory, setInventory] = useState([]);
    const [feed, setFeed] = useState([]);
    const [online, setOnline] = useState(0);
    const [selectedCase, setSelectedCase] = useState(null);
    const [count, setCount] = useState(1);
    const [opening, setOpening] = useState(null);
    const [casePhase, setCasePhase] = useState('idle');
    const [caseMode, setCaseMode] = useState('SLOW');
    const [upgradeResult, setUpgradeResult] = useState(null);
    const [upgradePhase, setUpgradePhase] = useState('idle');
    const [upgradeMode, setUpgradeMode] = useState('SLOW');
    const [source, setSource] = useState(null);
    const [target, setTarget] = useState(null);
    const [upgradeBalance, setUpgradeBalance] = useState(0);
    const [authOpen, setAuthOpen] = useState(false);
    const [notice, setNotice] = useState('');
    const [profile, setProfile] = useState(null);
    const [chat, setChat] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const toast = (text) => { setNotice(text); window.setTimeout(() => setNotice(''), 3600); };
    const refreshPrivate = async () => {
        if (!token)
            return;
        try {
            const [me, items, info] = await Promise.all([request('/api/auth/me', token), request('/api/inventory', token), request('/api/profile', token)]);
            setUser(me.user);
            setInventory(items);
            setProfile(info);
        }
        catch (error) {
            // A restarted/local server must not wipe a valid login from the browser.
            // Only a real revoked or expired session signs the player out.
            if (error instanceof ApiError && [401, 403].includes(error.status)) {
                localStorage.removeItem('svino-token');
                setToken('');
                setUser(null);
            }
        }
    };
    useEffect(() => { request('/api/cases').then((data) => { setCases(data); setCasesReady(true); }).catch(() => toast('Не удалось загрузить кейсы — проверь API.')); request('/api/items').then(setSkins).catch(() => undefined); request('/api/chat').then(setChat).catch(() => undefined); request('/api/leaderboard').then(setLeaderboard).catch(() => undefined); }, []);
    useEffect(() => { refreshPrivate(); }, [token]);
    useEffect(() => {
        const socket = io(API);
        socket.on('online:count', setOnline);
        socket.on('drop:revealed', (drop) => setFeed((items) => [drop, ...items].slice(0, 6)));
        socket.on('chat:message', (message) => setChat((messages) => [message, ...messages].slice(0, 50)));
        socket.on('chat:deleted', ({ id }) => setChat((messages) => messages.filter((message) => message.id !== id)));
        return () => { socket.disconnect(); };
    }, []);
    useEffect(() => { if (page === 'leaderboard')
        request('/api/leaderboard').then(setLeaderboard).catch(() => toast('Не удалось обновить лидерборд')); }, [page]);
    const upgradeStake = (source?.item.price || 0) + upgradeBalance;
    const upgradeChance = useMemo(() => source && target && target.price > upgradeStake ? Math.max(2, Math.min(90, Math.round(upgradeStake / target.price * 90))) : 0, [source, target, upgradeStake]);
    const login = async (email, password, username) => {
        const endpoint = username ? '/api/auth/register' : '/api/auth/login';
        const body = username ? { username, email, password } : { email, password };
        const data = await request(endpoint, undefined, { method: 'POST', body: JSON.stringify(body) });
        localStorage.setItem('svino-token', data.token);
        setToken(data.token);
        setUser(data.user);
        setAuthOpen(false);
        toast(username ? 'Добро пожаловать в стаю! +1 000 свинокоинов' : 'С возвращением, свинка!');
    };
    const openCase = async () => {
        if (!selectedCase)
            return;
        if (!token)
            return setAuthOpen(true);
        if (selectedCase.id.startsWith('offline'))
            return toast('Запусти базу данных и сервер, чтобы открыть кейс.');
        try {
            setCasePhase('spinning');
            setOpening(null);
            const data = await request(`/api/cases/${selectedCase.id}/open`, token, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ count }) });
            setOpening(data.drops);
            setCasePhase('spinning');
            setUser((current) => current ? { ...current, balance: data.balance } : current);
        }
        catch (error) {
            setCasePhase('idle');
            toast(error instanceof Error ? error.message : 'Не удалось открыть кейс');
        }
    };
    const upgrade = async () => {
        if (!token)
            return setAuthOpen(true);
        if (!source || !target)
            return toast('Сначала выбери предмет и цель.');
        try {
            setUpgradePhase('spinning');
            const result = await request('/api/upgrades', token, { method: 'POST', body: JSON.stringify({ sourceInventoryId: source.id, targetItemId: target.id, balanceStake: upgradeBalance }) });
            setUpgradeResult(result);
            setUpgradePhase('spinning');
            setUser((current) => current ? { ...current, balance: result.balance } : current);
        }
        catch (error) {
            setUpgradePhase('idle');
            toast(error instanceof Error ? error.message : 'Апгрейд не выполнен');
        }
    };
    const redeem = async (code) => { try {
        const data = await request('/api/promos/redeem', token, { method: 'POST', body: JSON.stringify({ code }) });
        toast(data.message);
        refreshPrivate();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Ошибка промокода');
    } };
    const claimDaily = async () => { try {
        const data = await request('/api/daily-case/open', token, { method: 'POST' });
        toast(`Ежедневный кейс: ${data.item.name} уже в инвентаре 🐷`);
        await refreshPrivate();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Ежедневный кейс пока недоступен');
    } };
    const sendChat = async (message) => { try {
        await request('/api/chat', token, { method: 'POST', body: JSON.stringify({ message }) });
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось отправить');
    } };
    const sell = async (inventoryId) => { try {
        const data = await request(`/api/inventory/${inventoryId}/sell`, token, { method: 'POST' });
        setUser((current) => current ? { ...current, balance: data.balance } : current);
        toast(`Продано за ${coins(data.payout)} SC`);
        await refreshPrivate();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось продать предмет');
    } };
    const sellAll = async () => { if (!inventory.length || !window.confirm(`Продать все ${inventory.length} предметов за полную стоимость?`))
        return; try {
        const data = await request('/api/inventory/sell-all', token, { method: 'POST' });
        setUser((current) => current ? { ...current, balance: data.balance } : current);
        toast(`Продано предметов: ${data.sold}. Получено ${coins(data.payout)} SC`);
        await refreshPrivate();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось продать предметы');
    } };
    const finishCaseAnimation = async () => { if (casePhase !== 'spinning' || !opening)
        return; setCasePhase('result'); await Promise.all(opening.map((drop) => request(`/api/drops/${drop.dropId}/reveal`, token, { method: 'POST' }))); await refreshPrivate(); toast('Дроп уже в твоём инвентаре!'); };
    const finishUpgradeAnimation = async () => { if (upgradePhase !== 'spinning' || !upgradeResult)
        return; setUpgradePhase('result'); await request(`/api/upgrades/${upgradeResult.upgradeId}/reveal`, token, { method: 'POST' }); await refreshPrivate(); };
    return _jsxs("main", { className: "app-shell", children: [_jsx("div", { className: "ambient ambient-one" }), _jsx("div", { className: "ambient ambient-two" }), _jsxs("header", { className: "topbar", children: [_jsxs("button", { className: "brand", onClick: () => setPage('cases'), children: [_jsx("span", { className: "brand-mark", children: "\uD83D\uDC37" }), _jsxs("span", { children: ["SVINO", _jsx("span", { children: "DROP" })] })] }), _jsx("nav", { children: [['cases', 'Кейсы'], ['upgrade', 'Апгрейд'], ['leaderboard', 'Лидерборд'], ['inventory', 'Инвентарь'], ['chat', 'Чат'], ...(user?.role === 'ADMIN' ? [['admin', 'Админ-панель']] : [])].map(([id, label]) => _jsx("button", { className: page === id ? 'active' : '', onClick: () => setPage(id), children: label }, id)) }), _jsxs("div", { className: "top-actions", children: [_jsxs("span", { className: "online", children: [_jsx("i", {}), " ", online, " \u0441\u0432\u0438\u043D\u043E\u043A \u043E\u043D\u043B\u0430\u0439\u043D"] }), user ? _jsxs("button", { className: "user-chip", onClick: () => setPage('profile'), children: [_jsx("span", { className: "avatar", children: "\uD83D\uDC3D" }), _jsxs("b", { children: [coins(user.balance), " ", _jsx("small", { children: "SC" })] }), _jsx("em", { children: user.username })] }) : _jsx("button", { className: "login", onClick: () => setAuthOpen(true), children: "\u0412\u043E\u0439\u0442\u0438" })] })] }), page === 'cases' && _jsxs("section", { className: "page intro-page", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "\u0421\u0412\u0418\u041D\u0421\u041A\u0410\u042F \u041A\u041E\u041B\u041B\u0415\u041A\u0426\u0418\u042F #01" }), _jsxs("h1", { children: ["\u041A\u0435\u0439\u0441\u044B \u0431\u0435\u0437", _jsx("br", {}), _jsx("strong", { children: "\u0441\u043A\u0443\u0447\u043D\u044B\u0445" }), " \u0434\u0440\u043E\u043F\u043E\u0432."] }), _jsx("p", { className: "hero-text", children: "\u0421\u0432\u0438\u043D\u044C\u0438. \u041A\u0435\u0439\u0441\u044B. \u0421\u043A\u0438\u043D\u044B. \u0418 \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u0441\u0432\u0438\u043D\u0441\u043A\u043E\u0433\u043E \u0431\u0435\u0437\u0443\u043C\u0438\u044F." }), _jsxs("div", { className: "hero-buttons", children: [_jsxs("button", { className: "pig-button", onClick: () => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth' }), children: ["\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0435\u0439\u0441\u044B ", _jsx("span", { children: "\u2192" })] }), _jsxs("button", { className: "ghost-button", onClick: () => setPage('upgrade'), children: ["\u0410\u043F\u0433\u0440\u0435\u0439\u0434 ", _jsx("span", { children: "\u2197" })] })] }), _jsxs("div", { className: "hero-stats", children: [_jsxs("span", { children: [_jsx("b", { children: "35+" }), " \u0441\u043A\u0438\u043D\u043E\u0432"] }), _jsxs("span", { children: [_jsx("b", { children: "8" }), " \u043A\u0435\u0439\u0441\u043E\u0432"] }), _jsxs("span", { children: [_jsx("b", { children: "100%" }), " \u0432\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u043E"] })] })] }), _jsxs("div", { className: "pig-hero", children: [_jsx("div", { className: "hero-crown", children: "\u2655" }), _jsx("div", { className: "hero-pig", children: "\uD83D\uDC37" }), _jsx("div", { className: "hero-sticker one", children: "+ DROP" }), _jsx("div", { className: "hero-sticker two", children: "\u2726 2X" }), _jsxs("div", { className: "hero-card", children: [_jsx("span", { children: "\u0421\u0415\u0413\u041E\u0414\u041D\u042F \u0412\u042B\u041F\u0410\u041B\u041E" }), _jsx("b", { children: "\u2605 Karambit" }), _jsx("em", { children: "1 030 SC" })] })] }), _jsxs("section", { id: "cases", className: "case-section", children: [_jsxs("div", { className: "section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "\u0421\u0412\u0418\u041D\u0421\u041A\u0418\u0419 \u0412\u042B\u0411\u041E\u0420" }), _jsx("h2", { children: "\u0412\u044B\u0431\u0435\u0440\u0438 \u0441\u0432\u043E\u0439 \u043A\u0435\u0439\u0441" })] }), _jsx("span", { children: casesReady ? 'Каждый дроп определяется сервером' : 'Подключаем свинобазу...' })] }), _jsx("div", { className: "case-collections", children: Object.entries(cases.reduce((groups, item) => { (groups[item.collection] ||= []).push(item); return groups; }, {})).map(([collection, collectionCases]) => _jsxs("section", { className: "case-collection", children: [_jsxs("div", { className: "collection-head", children: [_jsx("span", { children: "\uD83D\uDC37" }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "\u041A\u041E\u041B\u041B\u0415\u041A\u0426\u0418\u042F" }), _jsx("h3", { children: collection })] }), _jsx("small", { children: collection === 'Свинячий Окуп' ? 'Сочные шансы · дорогой лут' : 'Стартовая свиноколлекция' })] }), _jsx("div", { className: "case-grid", children: collectionCases.map((item, index) => _jsxs("article", { className: `case-card case-${index} ${casesReady ? '' : 'loading-case'}`, onClick: () => { if (!casesReady)
                                                    return toast('Кейсы загружаются, одну секунду 🐷'); setSelectedCase(item); setOpening(null); }, children: [_jsx("div", { className: "case-no", children: String(index + 1).padStart(2, '0') }), _jsx("img", { src: item.image, alt: item.name }), _jsxs("div", { className: "case-footer", children: [_jsxs("div", { children: [_jsx("h3", { children: item.name }), _jsxs("p", { children: ["\u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044F ", item.collection] })] }), _jsxs("b", { children: [coins(item.price), " ", _jsx("small", { children: "SC" })] })] }), _jsx("button", { disabled: !casesReady, children: casesReady ? _jsxs(_Fragment, { children: ["\u041E\u0422\u041A\u0420\u042B\u0422\u042C ", _jsx("span", { children: "\u2192" })] }) : 'ЗАГРУЗКА...' })] }, item.id)) })] }, collection)) })] }), _jsxs("section", { className: "feed-section", children: [_jsxs("div", { className: "section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "LIVE DROP FEED" }), _jsx("h2", { children: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438" })] }), _jsx("span", { children: "\u0411\u0435\u0437 \u0441\u043F\u043E\u0439\u043B\u0435\u0440\u043E\u0432 \u0434\u043E \u043A\u043E\u043D\u0446\u0430 \u0430\u043D\u0438\u043C\u0430\u0446\u0438\u0438" })] }), _jsx("div", { className: "feed-list", children: feed.length ? feed.map((drop, index) => _jsxs("div", { className: "feed-item", children: [_jsx("span", { className: "feed-avatar", children: "\uD83D\uDC37" }), _jsxs("span", { children: [_jsx("b", { children: drop.username }), " \u0432\u044B\u0431\u0438\u043B \u0447\u0435\u0440\u0435\u0437 ", drop.kind] }), _jsx("strong", { className: rarity(drop.item.rarity), children: drop.item.name })] }, `${drop.username}-${index}`)) : _jsx("div", { className: "empty-feed", children: "\u041F\u043E\u043A\u0430 \u0437\u0434\u0435\u0441\u044C \u0442\u0438\u0445\u043E... \uD83D\uDC37 \u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0435\u0440\u0432\u044B\u0439 \u043A\u0435\u0439\u0441 \u0438 \u0437\u0430\u0436\u0433\u0438 \u043B\u0435\u043D\u0442\u0443." }) })] })] }), page === 'upgrade' && _jsxs("section", { className: "page upgrade-page", children: [_jsxs("div", { className: "page-title", children: [_jsx("p", { className: "eyebrow", children: "RISK IT FOR THE BACON" }), _jsxs("h1", { children: ["\u0421\u0432\u0438\u043D\u0441\u043A\u0438\u0439 ", _jsx("strong", { children: "\u0430\u043F\u0433\u0440\u0435\u0439\u0434" })] }), _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442, \u0434\u043E\u0431\u0430\u0432\u044C \u043F\u0440\u0438 \u0436\u0435\u043B\u0430\u043D\u0438\u0438 \u0431\u0430\u043B\u0430\u043D\u0441 \u0438 \u043F\u043E\u0441\u0442\u0430\u0432\u044C \u0446\u0435\u043B\u044C." })] }), _jsxs("div", { className: "upgrade-board", children: [_jsx(UpgradeColumn, { title: "\u0422\u0412\u041E\u0419 \u041F\u0420\u0415\u0414\u041C\u0415\u0422", subtitle: "\u0412\u044B\u0431\u0435\u0440\u0438 \u0438\u0437 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u044F", selectedSkin: source?.item, selectedCaption: "\u0422\u0432\u043E\u044F \u0441\u0442\u0430\u0432\u043A\u0430", empty: !inventory.length ? 'Открой кейс, чтобы начать.' : undefined, children: inventory.slice(0, 6).map((entry) => _jsx(SkinCard, { skin: entry.item, selected: source?.id === entry.id, onClick: () => { setSource(entry); setUpgradePhase('idle'); setUpgradeResult(null); } }, entry.id)) }), _jsxs("div", { className: "upgrade-core", children: [_jsx(UpgradeDial, { chance: upgradeChance, phase: upgradePhase, result: upgradeResult, mode: upgradeMode, onFinished: finishUpgradeAnimation }, `${upgradeResult?.upgradeId || 'idle'}-${upgradeMode}`), _jsxs("div", { className: "upgrade-copy", children: [_jsx("b", { children: upgradePhase === 'spinning' ? (upgradeResult ? 'СТРЕЛКА В ПОЛЁТЕ…' : 'ФИКСИРУЕМ РЕЗУЛЬТАТ…') : upgradePhase === 'result' ? (upgradeResult?.success ? 'АПГРЕЙД УСПЕШЕН! 🔥' : 'В ЭТОТ РАЗ НЕ ПОВЕЗЛО') : 'ВЫБЕРИ СТАВКУ И ЦЕЛЬ' }), _jsx("span", { children: upgradePhase === 'idle' ? `Шанс попадания: ${upgradeChance || 0}%` : 'Результат уже защищён сервером' })] }), _jsxs("div", { className: "upgrade-stake", children: [_jsxs("label", { children: ["\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0431\u0430\u043B\u0430\u043D\u0441\u043E\u043C ", _jsx("input", { type: "number", min: "0", max: Math.floor((user?.balance || 0) / 100), step: "1", value: upgradeBalance / 100 || '', placeholder: "0", disabled: upgradePhase === 'spinning', onChange: (event) => { const value = Math.max(0, Math.min(Number(event.target.value || 0), Math.floor((user?.balance || 0) / 100))); setUpgradeBalance(Math.round(value * 100)); setUpgradePhase('idle'); setUpgradeResult(null); } }), _jsx("small", { children: "SC" })] }), _jsxs("span", { children: ["\u041E\u0431\u0449\u0430\u044F \u0441\u0442\u0430\u0432\u043A\u0430: ", coins(upgradeStake), " SC"] })] }), _jsx("div", { className: "spin-modes", children: ['FAST', 'SLOW', 'RISK'].map((mode) => _jsx("button", { disabled: upgradePhase === 'spinning', className: upgradeMode === mode ? 'chosen' : '', onClick: () => setUpgradeMode(mode), children: spinModeLabel[mode] }, mode)) }), _jsx("div", { className: "quick-row", children: [2, 3, 5, 10, 25].map((x) => _jsxs("button", { disabled: upgradePhase === 'spinning', onClick: () => { if (source) {
                                                setTarget(skins.find((skin) => skin.price > upgradeStake && skin.price >= upgradeStake * x) || null);
                                                setUpgradePhase('idle');
                                                setUpgradeResult(null);
                                            } }, children: ["\u00D7", x] }, x)) }), _jsx("button", { className: "pig-button upgrade-button", disabled: upgradePhase === 'spinning', onClick: () => { if (upgradePhase === 'result') {
                                            setUpgradePhase('idle');
                                            setUpgradeResult(null);
                                            return;
                                        } upgrade(); }, children: upgradePhase === 'spinning' ? 'СТРЕЛКА КРУТИТСЯ…' : upgradePhase === 'result' ? 'ЕЩЁ ОДНА ПОПЫТКА →' : `АПГРЕЙД · ${spinModeLabel[upgradeMode].toUpperCase()} →` })] }), _jsx(UpgradeColumn, { title: "\u0426\u0415\u041B\u042C", subtitle: "\u041F\u0440\u0435\u0434\u043C\u0435\u0442, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043F\u043E\u043B\u0443\u0447\u0438\u0448\u044C \u043F\u0440\u0438 \u0443\u0441\u043F\u0435\u0445\u0435", selectedSkin: target, selectedCaption: "\u0422\u0432\u043E\u044F \u0446\u0435\u043B\u044C", children: skins.filter((skin) => skin.price > upgradeStake).slice(0, 6).map((skin) => _jsx(SkinCard, { skin: skin, selected: target?.id === skin.id, onClick: () => { setTarget(skin); setUpgradePhase('idle'); setUpgradeResult(null); } }, skin.id)) })] })] }), page === 'inventory' && _jsxs("section", { className: "page compact-page", children: [_jsxs("div", { className: "page-title left", children: [_jsx("p", { className: "eyebrow", children: "\u041C\u041E\u042F \u041A\u041E\u041B\u041B\u0415\u041A\u0426\u0418\u042F" }), _jsxs("h1", { children: ["\u041C\u043E\u0438 ", _jsx("strong", { children: "\u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B" })] }), _jsx("p", { children: user ? `${inventory.length} предметов в свинкопарке · продажа за полную цену` : 'Войди, чтобы увидеть инвентарь' }), inventory.length > 0 && _jsxs("button", { className: "pig-button sell-all", onClick: sellAll, children: ["\u041F\u0440\u043E\u0434\u0430\u0442\u044C \u0432\u0441\u0451 \u00B7 ", coins(inventory.reduce((sum, entry) => sum + entry.item.price, 0)), " SC"] })] }), inventory.length ? _jsx("div", { className: "inventory-grid", children: inventory.map((entry) => _jsx(InventoryCard, { entry: entry, onSell: sell }, entry.id)) }) : _jsx(EmptyInventory, { onClick: () => setPage('cases') })] }), page === 'profile' && _jsxs("section", { className: "page compact-page", children: [_jsxs("div", { className: "profile-banner", children: [_jsx("div", { className: "profile-pig", children: "\uD83D\uDC37" }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "\u0421\u0412\u0418\u041D\u041E\u041F\u0420\u041E\u0424\u0418\u041B\u042C" }), _jsx("h1", { children: user?.username || 'Гость' }), _jsx("p", { children: user ? `В стае с ${new Date(user.createdAt).toLocaleDateString('ru-RU')}` : 'Войди в аккаунт, чтобы сохранить свою коллекцию.' })] }), _jsx("button", { className: "login", onClick: () => user ? (localStorage.removeItem('svino-token'), setToken(''), setUser(null)) : setAuthOpen(true), children: user ? 'Выйти' : 'Войти' })] }), user && _jsxs(_Fragment, { children: [_jsxs("div", { className: "stat-row", children: [_jsx(Stat, { value: coins(user.balance), label: "\u0441\u0432\u0438\u043D\u043E\u043A\u043E\u0438\u043D\u043E\u0432" }), _jsx(Stat, { value: profile?.stats.opens || 0, label: "\u043E\u0442\u043A\u0440\u044B\u0442\u0438\u0439" }), _jsx(Stat, { value: profile?.stats.upgrades || 0, label: "\u0430\u043F\u0433\u0440\u0435\u0439\u0434\u043E\u0432" }), _jsx(Stat, { value: profile?.stats.itemCount || 0, label: "\u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043E\u0432" })] }), _jsxs("div", { className: "profile-columns", children: [_jsxs("section", { className: "panel daily-case", children: [_jsx("span", { children: "\uD83C\uDF81" }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "\u041A\u0410\u0416\u0414\u042B\u0415 24 \u0427\u0410\u0421\u0410" }), _jsx("h3", { children: "\u0415\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u044B\u0439 \u043A\u0435\u0439\u0441" }), _jsx("p", { children: "\u041E\u0434\u0438\u043D \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C\u044E \u0434\u043E 1 500 SC." }), profile?.daily?.available ? _jsx("button", { className: "pig-button", onClick: claimDaily, children: "\u0417\u0430\u0431\u0440\u0430\u0442\u044C \u043A\u0435\u0439\u0441 \u2192" }) : _jsxs("small", { children: ["\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439: ", profile?.daily?.nextAt ? new Date(profile.daily.nextAt).toLocaleString('ru-RU') : 'скоро'] })] })] }), _jsxs("section", { className: "panel", children: [_jsx("h3", { children: "\u041F\u0440\u043E\u043C\u043E\u043A\u043E\u0434" }), _jsx("p", { children: "\u0423 \u0441\u0432\u0438\u043D\u043E\u043A \u0435\u0441\u0442\u044C \u0441\u0435\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u043A\u043E\u0434\u044B." }), _jsx(PromoForm, { onSubmit: redeem })] }), _jsxs("section", { className: "panel", children: [_jsx("h3", { children: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438" }), profile?.transactions.map((transaction) => _jsxs("div", { className: "transaction", children: [_jsx("span", { children: transaction.description }), _jsxs("b", { className: transaction.amount >= 0 ? 'positive' : 'negative', children: [transaction.amount >= 0 ? '+' : '', coins(transaction.amount), " SC"] })] }, transaction.id))] })] })] })] }), page === 'chat' && _jsxs("section", { className: "page compact-page chat-page", children: [_jsxs("div", { className: "page-title left", children: [_jsx("p", { className: "eyebrow", children: "\u0421\u0412\u0418\u041D\u041E\u0427\u0410\u0422" }), _jsxs("h1", { children: ["\u0421\u0442\u0430\u044F ", _jsx("strong", { children: "\u043E\u043D\u043B\u0430\u0439\u043D" })] }), _jsx("p", { children: "\u0411\u0443\u0434\u044C \u043C\u0438\u043B\u044B\u043C, \u043D\u0435 \u0441\u043F\u0430\u043C\u044C \u2014 \u0441\u0432\u0438\u043D\u043A\u0438 \u0432\u0441\u0451 \u0432\u0438\u0434\u044F\u0442." })] }), _jsxs("div", { className: "chat-box", children: [_jsx("div", { className: "messages", children: chat.length ? chat.map((message) => _jsxs("div", { className: "message", children: [_jsx("span", { children: "\uD83D\uDC37" }), _jsxs("div", { children: [_jsx("b", { children: message.user.username }), _jsx("p", { children: message.message })] }), _jsx("time", { children: new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) })] }, message.id)) : _jsx("div", { className: "empty-feed", children: "\u041F\u043E\u043A\u0430 \u0437\u0434\u0435\u0441\u044C \u0442\u0438\u0445\u043E... \uD83D\uDC37" }) }), _jsx(ChatForm, { disabled: !user, onSubmit: sendChat })] })] }), page === 'leaderboard' && _jsx(Leaderboard, { rows: leaderboard, currentUserId: user?.id }), page === 'admin' && user?.role === 'ADMIN' && _jsx(AdminPanelV2, { token: token, toast: toast }), selectedCase && _jsx(CaseModal, { data: selectedCase, count: count, setCount: setCount, opening: opening, phase: casePhase, mode: caseMode, setMode: setCaseMode, onFinished: finishCaseAnimation, onClose: () => { if (casePhase !== 'spinning') {
                    setSelectedCase(null);
                    setCasePhase('idle');
                    setOpening(null);
                } }, onOpen: openCase }), authOpen && _jsx(AuthModal, { onClose: () => setAuthOpen(false), onSubmit: login }), notice && _jsxs("div", { className: "toast", children: ["\uD83D\uDC37 ", notice] })] });
}
function SkinCard({ skin, selected, onClick, note }) { return _jsxs("button", { className: `skin-card ${rarity(skin.rarity)} ${selected ? 'selected' : ''}`, onClick: onClick, children: [_jsx("img", { src: skin.image, alt: "", loading: "lazy", onError: ({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg'; } }), _jsx("span", { children: skin.wear }), _jsxs("div", { children: [_jsx("b", { children: skin.name }), _jsxs("em", { children: [coins(skin.price), " SC"] }), note && _jsx("small", { children: note })] })] }); }
function InventoryCard({ entry, onSell }) { return _jsxs("article", { className: `inventory-card ${rarity(entry.item.rarity)}`, children: [_jsx("img", { src: entry.item.image, alt: "", onError: ({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg'; } }), _jsx("span", { children: entry.item.wear }), _jsx("b", { children: entry.item.name }), _jsxs("em", { children: [coins(entry.item.price), " SC"] }), _jsxs("small", { children: ["\u041F\u0440\u043E\u0434\u0430\u0436\u0430: ", coins(entry.item.price), " SC"] }), _jsx("button", { className: "login", onClick: () => onSell(entry.id), children: "\u041F\u0440\u043E\u0434\u0430\u0442\u044C" })] }); }
function UpgradeColumn({ title, subtitle, children, empty, selectedSkin, selectedCaption }) { return _jsxs("section", { className: "upgrade-column", children: [_jsxs("div", { className: "board-label", children: [_jsx("span", { children: "\uD83D\uDC37" }), _jsxs("div", { children: [_jsx("b", { children: title }), _jsx("small", { children: subtitle })] })] }), _jsx("div", { className: `upgrade-selected ${selectedSkin ? 'has-skin' : ''}`, children: selectedSkin ? _jsxs(_Fragment, { children: [_jsx("small", { children: selectedCaption }), _jsx("img", { src: selectedSkin.image, alt: "" }), _jsx("b", { children: selectedSkin.name }), _jsxs("em", { children: [coins(selectedSkin.price), " SC"] })] }) : _jsx("span", { children: title === 'ЦЕЛЬ' ? 'Выбери желаемый скин' : 'Выбери скин из инвентаря' }) }), empty ? _jsx("p", { className: "select-empty", children: empty }) : _jsx("div", { className: "choice-list", children: children })] }); }
function Stat({ value, label }) { return _jsxs("div", { className: "stat", children: [_jsx("b", { children: value }), _jsx("span", { children: label })] }); }
function Leaderboard({ rows, currentUserId }) { return _jsxs("section", { className: "page compact-page leaderboard-page", children: [_jsxs("div", { className: "leaderboard-hero", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "\u041E\u0411\u0429\u0418\u0419 \u0420\u0415\u0419\u0422\u0418\u041D\u0413 \u00B7 \u0414\u041E\u0421\u0422\u0423\u041F\u0415\u041D \u041A\u0410\u0416\u0414\u041E\u041C\u0423" }), _jsxs("h1", { children: ["\u041B\u0438\u0434\u0435\u0440", _jsx("strong", { children: "\u0431\u043E\u0440\u0434" })] }), _jsx("p", { children: "\u041C\u0435\u0441\u0442\u043E \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442\u0441\u044F \u0432\u0441\u0435\u043C \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435\u043C \u0441\u0432\u0438\u043D\u043A\u0438: \u0431\u0430\u043B\u0430\u043D\u0441\u043E\u043C \u0438 \u043F\u043E\u043B\u043D\u043E\u0439 \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C\u044E \u0441\u043A\u0438\u043D\u043E\u0432 \u0432 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0435." })] }), _jsxs("div", { className: "leaderboard-cup", children: ["\uD83C\uDFC6", _jsxs("span", { children: ["TOP", _jsx("br", {}), "PIGS"] })] })] }), _jsxs("div", { className: "leaderboard-table", children: [_jsxs("div", { className: "leaderboard-head", children: [_jsx("span", { children: "#" }), _jsx("span", { children: "\u0418\u0433\u0440\u043E\u043A" }), _jsx("span", { children: "\u0421\u043A\u0438\u043D\u044B" }), _jsx("span", { children: "\u0411\u0430\u043B\u0430\u043D\u0441" }), _jsx("span", { children: "\u041A\u0430\u043F\u0438\u0442\u0430\u043B" })] }), rows.length ? rows.map((row) => _jsxs("article", { className: `leaderboard-row ${row.id === currentUserId ? 'is-me' : ''}`, children: [_jsx("b", { className: `rank rank-${Math.min(row.rank, 3)}`, children: row.rank }), _jsxs("div", { className: "leader-name", children: [_jsx("span", { children: row.avatar || '🐷' }), _jsxs("b", { children: [row.username, row.id === currentUserId && _jsx("small", { children: "\u044D\u0442\u043E \u0442\u044B" })] })] }), _jsxs("span", { children: [row.skins, " \u0448\u0442. \u00B7 ", coins(row.inventoryValue), " SC"] }), _jsxs("span", { children: [coins(row.balance), " SC"] }), _jsxs("strong", { children: [coins(row.total), " ", _jsx("small", { children: "SC" })] })] }, row.id)) : _jsx("div", { className: "empty-feed", children: "\u041B\u0438\u0434\u0435\u0440\u0431\u043E\u0440\u0434 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442\u0441\u044F\u2026" })] })] }); }
function EmptyInventory({ onClick }) { return _jsxs("div", { className: "empty-inventory", children: [_jsx("span", { children: "\uD83D\uDC37" }), _jsx("h2", { children: "\u0422\u0412\u041E\u042F \u0421\u0412\u0418\u041D\u041A\u0410 \u041F\u041E\u041A\u0410 \u041F\u0423\u0421\u0422\u0410" }), _jsx("p", { children: "\u041E\u0442\u043A\u0440\u043E\u0439 \u043F\u0435\u0440\u0432\u044B\u0439 \u043A\u0435\u0439\u0441 \u0438 \u043D\u0430\u0447\u043D\u0438 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044E!" }), _jsx("button", { className: "pig-button", onClick: onClick, children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0435\u0439\u0441\u044B \u2192" })] }); }
function PromoForm({ onSubmit }) { const [value, setValue] = useState(''); return _jsxs("form", { className: "promo-form", onSubmit: (event) => { event.preventDefault(); if (value)
        onSubmit(value); }, children: [_jsx("input", { value: value, onChange: (event) => setValue(event.target.value), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0440\u043E\u043C\u043E\u043A\u043E\u0434" }), _jsx("button", { children: "\u0410\u041A\u0422\u0418\u0412\u0418\u0420\u041E\u0412\u0410\u0422\u042C" })] }); }
function ChatForm({ disabled, onSubmit }) { const [value, setValue] = useState(''); return _jsxs("form", { className: "chat-form", onSubmit: (event) => { event.preventDefault(); if (value && !disabled) {
        onSubmit(value);
        setValue('');
    } }, children: [_jsx("input", { disabled: disabled, value: value, onChange: (event) => setValue(event.target.value), placeholder: disabled ? 'Войди, чтобы писать в чат' : 'Напиши что-нибудь стае...' }), _jsx("button", { disabled: disabled, children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u2191" })] }); }
function AuthModal({ onClose, onSubmit }) { const [register, setRegister] = useState(false); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [username, setUsername] = useState(''); const [error, setError] = useState(''); return _jsx("div", { className: "modal-backdrop", children: _jsxs("form", { className: "auth-modal", onSubmit: async (event) => { event.preventDefault(); try {
            await onSubmit(email, password, register ? username : undefined);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка');
        } }, children: [_jsx("button", { className: "close", type: "button", onClick: onClose, children: "\u00D7" }), _jsx("div", { className: "auth-pig", children: "\uD83D\uDC37" }), _jsx("p", { className: "eyebrow", children: "\u0421\u0412\u0418\u041D\u041E\u041F\u0420\u041E\u041F\u0423\u0421\u041A" }), _jsx("h2", { children: register ? 'Вступить в стаю' : 'С возвращением!' }), register && _jsx("input", { value: username, onChange: (event) => setUsername(event.target.value), placeholder: "\u041D\u0438\u043A\u043D\u0435\u0439\u043C", required: true }), _jsx("input", { type: "email", value: email, onChange: (event) => setEmail(event.target.value), placeholder: "Email", required: true }), _jsx("input", { type: "password", minLength: 8, value: password, onChange: (event) => setPassword(event.target.value), placeholder: "\u041F\u0430\u0440\u043E\u043B\u044C (\u043E\u0442 8 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432)", required: true }), error && _jsx("p", { className: "form-error", children: error }), _jsxs("button", { className: "pig-button", children: [register ? 'Создать аккаунт' : 'Войти', " \u2192"] }), _jsx("button", { type: "button", className: "text-button", onClick: () => { setRegister(!register); setError(''); }, children: register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Вступить в стаю' })] }) }); }
function UpgradeDial({ chance, phase, result, mode, onFinished }) {
    const safeChance = Math.max(2, chance || 2);
    const endAngle = result?.success ? 1620 : 1470;
    return _jsxs("div", { className: `sd-upgrade ${phase} ${result ? 'ready' : ''} ${result?.success ? 'success' : 'failure'}`, style: { '--success-size': `${safeChance * 3.6}deg`, '--needle-end': `${endAngle}deg`, '--motion-duration': `${spinDuration[mode]}ms` }, children: [_jsxs("div", { className: "sd-upgrade-disc", children: [_jsx("div", { className: "sd-ticks" }), _jsx("div", { className: "sd-pig-halo", children: _jsxs("div", { className: "sd-pig-orbit", children: [_jsx("i", { children: "\uD83D\uDC37" }), _jsx("i", { children: "\uD83D\uDC3D" }), _jsx("i", { children: "\uD83D\uDC37" }), _jsx("i", { children: "\uD83D\uDC3D" })] }) }), _jsxs("div", { className: "sd-core", children: [_jsx("span", { className: "sd-snout", children: "\uD83D\uDC3D" }), _jsx("small", { children: phase === 'spinning' ? 'ХРЮК УДАЧИ ЛЕТИТ' : phase === 'result' ? (result?.success ? 'СОЧНОЕ ПОПАДАНИЕ' : 'БЕКОН УСКОЛЬЗНУЛ') : 'ТВОЙ ШАНС' }), _jsx("b", { children: phase === 'result' ? (result?.success ? 'WIN' : 'FAIL') : `${safeChance}%` }), _jsx("em", { children: "SVINO LUCK" })] })] }), _jsx("div", { className: "sd-needle", onAnimationEnd: () => { if (phase === 'spinning' && result)
                    onFinished(); }, children: _jsx("i", {}) })] });
}
function CaseReel({ pool, winner, phase, compact, onFinished }) {
    const reel = winner ? Array.from({ length: 36 }, (_, index) => index === 20 ? winner : pool[(index * 7 + 3) % Math.max(pool.length, 1)]).filter(Boolean) : pool.slice(0, 12);
    const state = phase === 'spinning' && winner ? 'rolling' : phase === 'result' && winner ? 'finished' : '';
    return _jsxs("div", { className: `sd-case-reel ${compact ? 'compact' : ''} ${state}`, children: [_jsx("div", { className: "sd-case-pointer" }), _jsx("div", { className: `sd-case-track ${state}`, onAnimationEnd: () => { if (phase === 'spinning' && winner)
                    onFinished?.(); }, children: reel.map((skin, index) => _jsxs("article", { className: `sd-case-card ${rarity(skin.rarity)}`, children: [_jsx("img", { src: skin.image, alt: "", onError: ({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg'; } }), _jsx("small", { children: skin.wear }), _jsx("b", { children: skin.name }), _jsxs("em", { children: [coins(skin.price), " SC"] })] }, `${skin.id}-${index}`)) }, winner?.id || 'preview')] });
}
function CaseModal({ data, count, setCount, opening, phase, mode, setMode, onFinished, onClose, onOpen }) {
    const pool = data.items.map((entry) => entry.item);
    const multi = (opening?.length || count) > 1;
    const reels = opening?.map((drop) => drop.item) || [undefined];
    const contents = [...data.items].sort((left, right) => left.item.price - right.item.price);
    return _jsx("div", { className: "modal-backdrop", children: _jsxs("section", { className: `case-modal cinematic-case ${phase} ${multi ? 'multi-opening' : ''} mode-${mode.toLowerCase()}`, style: { '--reel-duration': `${spinDuration[mode]}ms` }, children: [_jsx("button", { className: "close", onClick: onClose, disabled: phase === 'spinning', children: "\u00D7" }), _jsxs("div", { className: "case-modal-head", children: [_jsx("img", { src: data.image, alt: "" }), _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "\u0421\u0412\u0418\u041D\u041E\u041E\u0425\u041E\u0422\u041D\u0418\u041A\u0418 \u00B7 SERVER DROP" }), _jsx("h2", { children: data.name }), _jsx("p", { children: phase === 'spinning' ? 'Все результаты уже зафиксированы сервером. Ленты плавно замедляются…' : 'Состав и веса открыты: дорогие предметы встречаются реже.' })] }), _jsxs("b", { children: [coins(data.price), " ", _jsx("small", { children: "SC" })] })] }), _jsxs("div", { className: "reel-status", children: [_jsx("span", { className: "pulse-dot" }), phase === 'spinning' ? 'КРУТИМ РУЛЕТКУ' : phase === 'result' ? 'ДРОП РАСКРЫТ' : 'ГОТОВ К ОТКРЫТИЮ', _jsx("em", { children: "SERVER VERIFIED" })] }), _jsx("div", { className: `case-reels ${multi ? 'multiple' : ''}`, children: reels.map((winner, index) => _jsx(CaseReel, { pool: pool, winner: winner, phase: phase, compact: multi, onFinished: index === 0 ? onFinished : undefined }, `${winner?.id || 'empty'}-${index}`)) }), phase === 'idle' && _jsxs("section", { className: "case-contents", children: [_jsxs("div", { children: [_jsx("b", { children: "\u0421\u041E\u0414\u0415\u0420\u0416\u0418\u041C\u041E\u0415 \u041A\u0415\u0419\u0421\u0410" }), _jsxs("span", { children: [contents.length, " \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043E\u0432 \u00B7 \u043E\u0442 ", coins(contents[0]?.item.price || 0), " \u0434\u043E ", coins(contents.at(-1)?.item.price || 0), " SC"] })] }), _jsx("div", { className: "case-contents-grid", children: contents.map((entry) => _jsxs("article", { className: rarity(entry.item.rarity), children: [_jsx("img", { src: entry.item.image, alt: "", onError: ({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg'; } }), _jsxs("span", { children: [_jsx("b", { children: entry.item.name }), _jsxs("small", { children: [entry.item.wear, " \u00B7 \u0432\u0435\u0441 ", entry.weight] })] }), _jsxs("em", { children: [coins(entry.item.price), " SC"] })] }, entry.id)) })] }), phase === 'result' && opening && _jsxs("div", { className: "case-result", children: [_jsx("span", { children: "\uD83D\uDC37" }), _jsxs("div", { children: [_jsx("small", { children: opening.length > 1 ? `ТВОИ ${opening.length} НОВЫХ ДРОПОВ` : 'ТВОЙ НОВЫЙ ДРОП' }), _jsx("b", { children: opening.map((drop) => drop.item.name).join(' · ') }), _jsx("em", { children: "\u0412\u0441\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B \u0443\u0436\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B \u0432 \u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u044C" })] }), _jsx("button", { className: "login", onClick: onClose, children: "\u0417\u0430\u0431\u0440\u0430\u0442\u044C \u2192" })] }), _jsxs("div", { className: "case-controls", children: [_jsxs("div", { children: [_jsx("div", { className: "count-picker", children: [1, 2, 3, 4, 5].map((value) => _jsxs("button", { disabled: phase === 'spinning', className: count === value ? 'chosen' : '', onClick: () => setCount(value), children: ["\u00D7", value] }, value)) }), _jsx("div", { className: "spin-modes case-modes", children: ['FAST', 'SLOW', 'RISK'].map((speed) => _jsx("button", { disabled: phase === 'spinning', className: mode === speed ? 'chosen' : '', onClick: () => setMode(speed), children: spinModeLabel[speed] }, speed)) })] }), _jsxs("button", { className: "pig-button case-launch", onClick: onOpen, disabled: phase === 'spinning', children: [phase === 'spinning' ? (opening ? 'ЛЕНТЫ КРУТЯТСЯ…' : 'ФИКСИРУЕМ ДРОП…') : `ОТКРЫТЬ ЗА ${coins(data.price * count)} SC`, " ", _jsx("span", { children: "\u2192" })] })] })] }) });
}
function AdminPanel({ token, toast }) { const [users, setUsers] = useState([]); const [tab, setTab] = useState('users'); const [records, setRecords] = useState([]); const load = () => request(tab === 'users' ? '/api/admin/users' : `/api/admin/${tab}`, token).then(tab === 'users' ? setUsers : setRecords).catch((error) => toast(error.message)); useEffect(() => { load(); }, [tab]); const changeBalance = async (id, direction) => { const raw = window.prompt(direction === 'ADD' ? 'Сколько выдать (в свинокоинах)?' : 'Сколько списать?'); const amount = Math.round(Number(raw) * 100); if (!amount)
    return; try {
    await request(`/api/admin/users/${id}/balance`, token, { method: 'POST', body: JSON.stringify({ direction, amount }) });
    toast('Баланс изменён');
    load();
}
catch (error) {
    toast(error instanceof Error ? error.message : 'Ошибка');
} }; return _jsxs("section", { className: "page compact-page", children: [_jsxs("div", { className: "page-title left", children: [_jsx("p", { className: "eyebrow", children: "ADMIN ONLY" }), _jsxs("h1", { children: ["\u041F\u0430\u043D\u0435\u043B\u044C ", _jsx("strong", { children: "\u0441\u0432\u0438\u043D\u043E\u0431\u043E\u0441\u0441\u0430" })] }), _jsx("p", { children: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0438\u0433\u0440\u043E\u043A\u0430\u043C\u0438, \u0432\u0438\u0440\u0442\u0443\u0430\u043B\u044C\u043D\u043E\u0439 \u044D\u043A\u043E\u043D\u043E\u043C\u0438\u043A\u043E\u0439 \u0438 \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u043E\u043C." })] }), _jsx("div", { className: "admin-tabs", children: ['users', 'cases', 'promos'].map((id) => _jsx("button", { className: tab === id ? 'active' : '', onClick: () => setTab(id), children: id === 'users' ? 'Пользователи' : id === 'cases' ? 'Кейсы' : 'Промокоды' }, id)) }), _jsx("div", { className: "admin-table", children: tab === 'users' ? users.map((item) => _jsxs("div", { className: "admin-row", children: [_jsx("span", { children: "\uD83D\uDC37" }), _jsxs("div", { children: [_jsxs("b", { children: [item.username, " ", item.isBanned && _jsx("em", { children: "\u0411\u0410\u041D" })] }), _jsx("small", { children: item.email })] }), _jsxs("strong", { children: [coins(item.balance), " SC"] }), _jsx("button", { onClick: () => changeBalance(item.id, 'ADD'), children: "+ \u0411\u0430\u043B\u0430\u043D\u0441" }), _jsx("button", { onClick: () => changeBalance(item.id, 'REMOVE'), children: "\u2212 \u0411\u0430\u043B\u0430\u043D\u0441" })] }, item.id)) : records.map((item) => _jsxs("div", { className: "admin-row", children: [_jsx("span", { children: tab === 'cases' ? '📦' : '🎟️' }), _jsxs("div", { children: [_jsx("b", { children: item.name || item.code }), _jsx("small", { children: item.active ? 'Активен' : 'Отключён' })] }), _jsx("strong", { children: item.price ? `${coins(item.price)} SC` : `${item.uses || 0}/${item.maxUses || 0}` })] }, item.id)) })] }); }
function AdminPanelV2({ token, toast }) {
    void AdminPanel;
    const [tab, setTab] = useState('users');
    const [users, setUsers] = useState([]);
    const [rows, setRows] = useState([]);
    const [caseEditor, setCaseEditor] = useState(undefined);
    const load = async () => { try {
        if (tab === 'users')
            setUsers(await request('/api/admin/users', token));
        else
            setRows(await request(`/api/admin/${tab}`, token));
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Ошибка загрузки');
    } };
    useEffect(() => { load(); }, [tab]);
    const balance = async (userId, direction) => { const value = Number(window.prompt(direction === 'ADD' ? 'Выдать свинокоины:' : 'Списать свинокоины:')); if (!value)
        return; await request(`/api/admin/users/${userId}/balance`, token, { method: 'POST', body: JSON.stringify({ direction, amount: Math.round(value * 100) }) }); toast('Баланс обновлён'); load(); };
    const status = async (userId, body, message) => { try {
        await request(`/api/admin/users/${userId}/status`, token, { method: 'PATCH', body: JSON.stringify(body) });
        toast(message);
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Ошибка');
    } };
    const details = async (userId) => { try {
        const data = await request(`/api/admin/users/${userId}/inventory`, token);
        window.alert(data.length ? data.map((entry) => `${entry.item.name} — ${coins(entry.item.price)} SC`).join('\n') : 'Инвентарь пуст.');
    }
    catch {
        toast('Не удалось открыть инвентарь');
    } };
    const toggleCase = async (item) => { await request(`/api/admin/cases/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) }); toast(item.active ? 'Кейс отключён' : 'Кейс включён'); load(); };
    const toggleItem = async (item) => { try {
        await request(`/api/admin/items/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
        toast(item.active ? 'Предмет скрыт из выпадений' : 'Предмет возвращён в выпадения');
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Ошибка');
    } };
    const addItem = async () => { const id = window.prompt('Уникальный ID предмета:'); const name = window.prompt('Название предмета:'); const price = Number(window.prompt('Цена в свинокоинах:')); const image = window.prompt('Ссылка на изображение:'); if (!id || !name || !price || !image)
        return; try {
        await request('/api/admin/items', token, { method: 'POST', body: JSON.stringify({ id, name, price: Math.round(price * 100), image, wear: 'FN', rarity: 'CLASSIFIED' }) });
        toast('Предмет добавлен');
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось добавить предмет');
    } };
    const editItem = async (item) => { const name = window.prompt('Название предмета:', item.name); const price = Number(window.prompt('Цена в свинокоинах:', String(item.price / 100))); const image = window.prompt('Ссылка на изображение:', item.image); const wear = window.prompt('Wear:', item.wear); const rarity = window.prompt('Редкость:', item.rarity); if (!name || !price || !image || !wear || !rarity)
        return; try {
        await request(`/api/admin/items/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ name, price: Math.round(price * 100), image, wear, rarity }) });
        toast('Предмет сохранён');
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось сохранить предмет');
    } };
    const togglePromo = async (item) => { try {
        await request(`/api/admin/promos/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) });
        toast(item.active ? 'Промокод отключён' : 'Промокод включён');
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Ошибка');
    } };
    const removeMessage = async (id) => { try {
        await request(`/api/admin/chat/${id}`, token, { method: 'DELETE' });
        toast('Сообщение удалено');
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Ошибка');
    } };
    const newPromo = async () => { const code = window.prompt('Код промокода, например PIG2026')?.toUpperCase(); const coinsValue = Number(window.prompt('Награда в свинокоинах:')); const maxUses = Number(window.prompt('Сколько раз можно активировать:')); if (!code || !coinsValue || !maxUses)
        return; try {
        await request('/api/admin/promos', token, { method: 'POST', body: JSON.stringify({ code, rewardType: 'BALANCE', rewardValue: Math.round(coinsValue * 100), maxUses }) });
        toast('Промокод создан');
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось создать промокод');
    } };
    const resetEconomy = async () => { if (window.prompt('Введите RESET_ALL_BALANCES_AND_SKINS для очистки балансов и скинов у ВСЕХ игроков:') !== 'RESET_ALL_BALANCES_AND_SKINS')
        return; try {
        const result = await request('/api/admin/economy/reset', token, { method: 'POST', body: JSON.stringify({ confirmation: 'RESET_ALL_BALANCES_AND_SKINS' }) });
        toast(`Очищено: ${result.users} игроков, ${result.skins} скинов`);
        load();
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось очистить экономику');
    } };
    return _jsxs("section", { className: "page compact-page", children: [_jsxs("div", { className: "page-title left", children: [_jsx("p", { className: "eyebrow", children: "ADMIN ONLY \u00B7 REAL DATABASE" }), _jsxs("h1", { children: ["\u041F\u0430\u043D\u0435\u043B\u044C ", _jsx("strong", { children: "\u0441\u0432\u0438\u043D\u043E\u0431\u043E\u0441\u0441\u0430" })] }), _jsx("p", { children: "\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0439 \u0438\u0433\u0440\u043E\u043A\u0430\u043C\u0438, \u043A\u0435\u0439\u0441\u0430\u043C\u0438, \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0430\u043C\u0438, \u043F\u0440\u043E\u043C\u043E\u043A\u043E\u0434\u0430\u043C\u0438, \u0447\u0430\u0442\u043E\u043C \u0438 \u0436\u0443\u0440\u043D\u0430\u043B\u043E\u043C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439." })] }), tab === 'cases' && caseEditor !== undefined && _jsx(CaseWorkshop, { token: token, existing: caseEditor || undefined, onClose: () => setCaseEditor(undefined), onSaved: () => { setCaseEditor(undefined); load(); toast('Кейс и его состав сохранены'); } }), _jsxs("div", { className: "profile-columns", children: [_jsxs("section", { className: "panel", children: [_jsx("h3", { children: "\u0420\u0430\u0437\u0434\u0435\u043B\u044B" }), [['users', 'Игроки'], ['cases', 'Кейсы'], ['items', 'Предметы'], ['promos', 'Промокоды'], ['chat', 'Модерация чата'], ['logs', 'Логи']].map(([id, label]) => _jsxs("button", { className: "login", style: { display: 'block', width: '100%', margin: '7px 0', textAlign: 'left' }, onClick: () => { setTab(id); setCaseEditor(undefined); }, children: [tab === id ? '● ' : '○ ', label] }, id))] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, children: [_jsx("h3", { children: tab === 'users' ? 'Игроки' : tab === 'cases' ? 'Кейсы' : tab === 'items' ? 'Предметы' : tab === 'promos' ? 'Промокоды' : tab === 'chat' ? 'Модерация чата' : 'Журнал' }), tab === 'cases' && _jsx("button", { className: "pig-button", onClick: () => setCaseEditor(null), children: "+ \u041A\u0435\u0439\u0441" }), tab === 'promos' && _jsx("button", { className: "pig-button", onClick: newPromo, children: "+ \u041F\u0440\u043E\u043C\u043E\u043A\u043E\u0434" }), tab === 'items' && _jsx("button", { className: "pig-button", onClick: addItem, children: "+ \u041F\u0440\u0435\u0434\u043C\u0435\u0442" })] }), tab === 'users' && _jsxs(_Fragment, { children: [_jsx("button", { className: "admin-danger", onClick: resetEconomy, children: "\u26A0 \u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0435\u043C \u0431\u0430\u043B\u0430\u043D\u0441 \u0438 \u0441\u043A\u0438\u043D\u044B" }), users.map((item) => _jsxs("div", { className: "transaction", children: [_jsxs("span", { children: [_jsx("b", { children: item.username }), _jsx("br", {}), _jsxs("small", { children: [item.email, " \u00B7 ", item.isBanned ? '🚫 Забанен' : item.muteUntil ? '🔇 Мут' : '✅ Активен'] })] }), _jsxs("b", { children: [coins(item.balance), " SC"] }), _jsx("button", { className: "login", onClick: () => balance(item.id, 'ADD'), children: "+SC" }), _jsx("button", { className: "login", onClick: () => balance(item.id, 'REMOVE'), children: "\u2212SC" }), _jsx("button", { className: "login", onClick: () => status(item.id, { isBanned: !item.isBanned }, item.isBanned ? 'Бан снят' : 'Игрок забанен'), children: item.isBanned ? 'Разбан' : 'Бан' }), _jsx("button", { className: "login", onClick: () => status(item.id, { muteMinutes: item.muteUntil ? 0 : 60 }, item.muteUntil ? 'Мут снят' : 'Мут на 60 минут'), children: item.muteUntil ? 'Снять мут' : 'Мут' }), _jsx("button", { className: "login", onClick: () => details(item.id), children: "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u044C" })] }, item.id))] }), tab === 'cases' && rows.map((item) => _jsxs("div", { className: "transaction", children: [_jsxs("span", { children: [_jsx("b", { children: item.name }), _jsx("br", {}), _jsxs("small", { children: [item.active ? '✅ Активен' : '⏸ Отключён', " \u00B7 ", item.items?.length || 0, " \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043E\u0432 \u00B7 ", item.collection] })] }), _jsxs("b", { children: [coins(item.price), " SC"] }), _jsx("button", { className: "login", onClick: () => setCaseEditor(item), children: "\u0420\u0435\u0434\u0430\u043A\u0442\u043E\u0440" }), _jsx("button", { className: "login", onClick: () => toggleCase(item), children: item.active ? 'Отключить' : 'Включить' })] }, item.id)), tab === 'items' && rows.map((item) => _jsxs("div", { className: "transaction", children: [_jsxs("span", { children: [_jsx("b", { children: item.name }), _jsx("br", {}), _jsxs("small", { children: [item.rarity, " \u00B7 ", item.wear, " \u00B7 ", item.active ? '✅ В дропе' : '⏸ Скрыт'] })] }), _jsxs("b", { children: [coins(item.price), " SC"] }), _jsx("button", { className: "login", onClick: () => editItem(item), children: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "login", onClick: () => toggleItem(item), children: item.active ? 'Скрыть' : 'Включить' })] }, item.id)), tab === 'promos' && rows.map((item) => _jsxs("div", { className: "transaction", children: [_jsxs("span", { children: [_jsx("b", { children: item.code }), _jsx("br", {}), _jsxs("small", { children: [item.active ? '✅ Активен' : '⏸ Отключён', " \u00B7 ", coins(Number(item.rewardValue || 0)), " SC"] })] }), _jsxs("b", { children: [item.uses, "/", item.maxUses] }), _jsx("button", { className: "login", onClick: () => togglePromo(item), children: item.active ? 'Отключить' : 'Включить' })] }, item.id)), tab === 'chat' && rows.map((item) => _jsxs("div", { className: "transaction", children: [_jsxs("span", { children: [_jsx("b", { children: item.user?.username }), _jsx("br", {}), _jsxs("small", { children: [item.message, " \u00B7 ", new Date(item.createdAt).toLocaleString('ru-RU')] })] }), _jsx("button", { className: "login", onClick: () => removeMessage(item.id), children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] }, item.id)), tab === 'logs' && rows.map((item) => _jsx("div", { className: "transaction", children: _jsxs("span", { children: [_jsx("b", { children: item.action }), _jsx("br", {}), _jsxs("small", { children: [item.admin?.email || 'admin', " \u00B7 ", new Date(item.createdAt).toLocaleString('ru-RU')] })] }) }, item.id))] })] })] });
}
function CaseWorkshop({ token, existing, onClose, onSaved }) {
    const [items, setItems] = useState([]);
    const [draft, setDraft] = useState({ name: existing?.name || '', slug: existing?.slug || '', price: existing?.price ? String(existing.price / 100) : '', image: existing?.image || '', collection: existing?.collection || 'Свиноохотники' });
    const [weights, setWeights] = useState(() => Object.fromEntries((existing?.items || []).map((entry) => [entry.itemId || entry.item?.id, entry.weight])));
    const [saving, setSaving] = useState(false);
    useEffect(() => { request('/api/admin/items', token).then(setItems).catch(() => undefined); }, [token]);
    const selected = Object.entries(weights).filter(([, weight]) => weight > 0);
    const setWeight = (id, weight) => setWeights((current) => ({ ...current, [id]: weight }));
    const submit = async (event) => {
        event.preventDefault();
        const price = Math.round(Number(draft.price) * 100);
        if (!draft.name || !draft.slug || !draft.image || !draft.collection || !price || !selected.length)
            return;
        setSaving(true);
        try {
            const payload = { ...draft, price, items: selected.map(([itemId, weight]) => ({ itemId, weight })) };
            if (existing?.id) {
                await request(`/api/admin/cases/${existing.id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
                await request(`/api/admin/cases/${existing.id}/items`, token, { method: 'PUT', body: JSON.stringify({ items: payload.items }) });
            }
            else
                await request('/api/admin/cases', token, { method: 'POST', body: JSON.stringify(payload) });
            onSaved();
        }
        finally {
            setSaving(false);
        }
    };
    return _jsxs("form", { className: "case-workshop", onSubmit: submit, children: [_jsxs("div", { className: "workshop-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "\u041A\u041E\u041D\u0421\u0422\u0420\u0423\u041A\u0422\u041E\u0420 \u041A\u0415\u0419\u0421\u041E\u0412" }), _jsx("h2", { children: existing ? `Редактор: ${existing.name}` : 'Новый кейс' }), _jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B, \u0443\u043A\u0430\u0436\u0438 \u0438\u043C \u0432\u0435\u0441\u0430 \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438 \u0432\u0441\u0451 \u043E\u0434\u043D\u043E\u0439 \u043A\u043D\u043E\u043F\u043A\u043E\u0439." })] }), _jsx("button", { type: "button", className: "login", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u00D7" })] }), _jsxs("div", { className: "workshop-fields", children: [_jsxs("label", { children: ["\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", _jsx("input", { required: true, value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("label", { children: ["Slug", _jsx("input", { required: true, disabled: !!existing, pattern: "[a-z0-9-]{3,64}", value: draft.slug, onChange: (event) => setDraft({ ...draft, slug: event.target.value.toLowerCase() }) })] }), _jsxs("label", { children: ["\u0426\u0435\u043D\u0430, SC", _jsx("input", { required: true, type: "number", min: "1", value: draft.price, onChange: (event) => setDraft({ ...draft, price: event.target.value }) })] }), _jsxs("label", { children: ["\u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044F", _jsx("input", { required: true, value: draft.collection, onChange: (event) => setDraft({ ...draft, collection: event.target.value }) })] }), _jsxs("label", { className: "wide", children: ["\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u043E\u0431\u043B\u043E\u0436\u043A\u0443", _jsx("input", { required: true, type: "url", value: draft.image, onChange: (event) => setDraft({ ...draft, image: event.target.value }) })] })] }), _jsxs("div", { className: "workshop-actions", children: [_jsxs("span", { children: ["\u0412 \u0441\u043E\u0441\u0442\u0430\u0432\u0435: ", _jsx("b", { children: selected.length }), " \u00B7 \u0421\u0443\u043C\u043C\u0430 \u0432\u0435\u0441\u043E\u0432: ", _jsx("b", { children: selected.reduce((sum, [, weight]) => sum + weight, 0) })] }), _jsx("button", { type: "button", className: "login", onClick: () => setWeights(Object.fromEntries(items.slice(0, 12).map((item, index) => [item.id, Math.max(1, Math.round(500 / (index + 1)))]))), children: "\u0411\u044B\u0441\u0442\u0440\u0430\u044F \u043E\u0441\u043D\u043E\u0432\u0430" }), _jsx("button", { className: "pig-button", disabled: saving, children: saving ? 'Сохраняем…' : 'Сохранить кейс →' })] }), _jsx("div", { className: "workshop-items", children: items.map((item) => _jsxs("label", { className: `workshop-item ${weights[item.id] ? 'picked' : ''}`, children: [_jsx("input", { type: "checkbox", checked: !!weights[item.id], onChange: (event) => setWeight(item.id, event.target.checked ? Math.max(weights[item.id] || 0, 10) : 0) }), _jsx("img", { src: item.image, alt: "", onError: ({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg'; } }), _jsxs("span", { children: [_jsx("b", { children: item.name }), _jsxs("small", { children: [item.wear, " \u00B7 ", coins(item.price), " SC"] })] }), _jsx("input", { "aria-label": `Вес ${item.name}`, disabled: !weights[item.id], type: "number", min: "1", value: weights[item.id] || '', onChange: (event) => setWeight(item.id, Math.max(1, Number(event.target.value))) })] }, item.id)) })] });
}
//# sourceMappingURL=App.js.map