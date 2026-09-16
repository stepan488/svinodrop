import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import './App.css'
import './animations.css'
import './refinement.css'

type Skin = { id: string; name: string; wear: string; price: number; image: string; rarity: string }
type Case = { id: string; name: string; slug: string; image: string; price: number; collection: string; openingStyle?: 'REEL' | 'MAGIC'; maxOpen?: number; contentsHidden?: boolean; items: { id: string; weight: number; chance?: number; item: Skin }[] }
type Inventory = { id: string; obtainedAt: string; obtainedFrom: string; item: Skin }
type User = { id: string; username: string; email: string; avatar?: string | null; nickColor?: string; balance: number; role: string; createdAt: string }
type Drop = { dropId: string; inventoryId: string; item: Skin }
type Feed = { username: string; item: Skin; kind: string }
type LeaderboardRow = { id: string; username: string; avatar: string | null; balance: number; inventoryValue: number; skins: number; total: number; rank: number }
type SpinMode = 'FAST' | 'SLOW' | 'RISK'
type Giveaway = { id: string; title: string; kind: string; entryPrice: number; startsAt: string; endsAt: string; prizeItem: Skin; entries: number; automatic: boolean }
type Battle = { id: string; status: string; mode: 'NORMAL' | 'CURSED' | 'JACKPOT' | 'LAST'; playerLimit: number; private: boolean; fast?: boolean; inviteCode: string; creatorId: string; players: { id: string; userId: string | null; username: string; avatar: string | null }[]; cases: Pick<Case, 'id' | 'name' | 'image' | 'price' | 'items'>[]; results?: { rounds: { player: { username: string; avatar?: string | null }; drops: { caseId?: string; caseName?: string; item: Skin; value: number }[]; total: number }[]; winnerIndex: number; jackpotPlayerIndexes?: number[] }; winnerUserId?: string | null; isMine: boolean }
type NavalShot = { x: number; y: number; hit: boolean; sunk?: boolean; blocked?: boolean }
type NavalGame = { id: string; stake: number; status: string; turnUserId: string | null; turnEndsAt?: string | null; winnerUserId: string | null; mine: { ready: boolean; ships: { x: number; y: number }[]; shots: NavalShot[] }; opponent: { username: string; avatar: string | null; ready: boolean; bot?: boolean; shots: NavalShot[] } | null }

// Local development uses the separate API; a production build can use a
// configured API subdomain or the same origin without shipping localhost.
// The public site uses a separate Render service, never the Vercel origin.
// Local development may still point at a different API through .env.
const API = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || 'http://localhost:5000') : 'https://svinodrop-api.onrender.com'
const rarity = (value: string) => `rarity-${value.toLowerCase().replaceAll('-', '')}`
const coins = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value / 100)
const spinDuration: Record<SpinMode, number> = { FAST: 2000, SLOW: 6800, RISK: 9400 }
const spinModeLabel: Record<SpinMode, string> = { FAST: 'Быстрый', SLOW: 'Плавный', RISK: 'Азартный' }
const fallbackCases: Case[] = [
  ['Генста Свин!', 'gensta-svin', 499, 'https://i.ibb.co/tPW2Xyys/b4f6cb58-752e-44ae-885c-bbbe73098ba9-removebg-preview.png'],
  ['Хакер Свин!', 'hacker-svin', 999, 'https://i.ibb.co/LhSVn6Ct/48eb32a1-02f8-438f-b615-996134c84736.png'],
  ['Мапер Свин!', 'mapper-svin', 1999, 'https://i.ibb.co/gZpjvqCG/9129ec80-5503-466d-ad65-5a61220e8d5c.png'],
  ['Пиратский Свин!', 'pirate-svin', 3499, 'https://i.ibb.co/tpc6jfbr/9ff2456a-8ed4-43f4-883d-0d98633f1de0.png'],
].map(([name, slug, price, image], index) => ({ id: `offline-${index}`, name: String(name), slug: String(slug), price: Number(price) * 100, image: String(image), collection: 'Свиноохотники', items: [] }))

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function request(path: string, token?: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(body.error || 'Свиносервер временно недоступен', response.status)
  return body
}

export default function App() {
  const [page, setPage] = useState<'cases' | 'games' | 'upgrade' | 'battles' | 'naval' | 'giveaways' | 'inventory' | 'profile' | 'chat' | 'leaderboard' | 'admin'>('cases')
  const [cases, setCases] = useState<Case[]>(fallbackCases)
  const [casesReady, setCasesReady] = useState(false)
  const [skins, setSkins] = useState<Skin[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState(() => localStorage.getItem('svino-token') || '')
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [sellingIds, setSellingIds] = useState<Set<string>>(() => new Set())
  const [sellingAll, setSellingAll] = useState(false)
  const [feed, setFeed] = useState<Feed[]>([])
  const [online, setOnline] = useState(0)
  const [selectedCase, setSelectedCase] = useState<Case | null>(null)
  const [count, setCount] = useState(1)
  const [opening, setOpening] = useState<Drop[] | null>(null)
  const [caseBalanceReward, setCaseBalanceReward] = useState(0)
  const [casePhase, setCasePhase] = useState<'idle' | 'spinning' | 'result'>('idle')
  const [caseMode, setCaseMode] = useState<SpinMode>('SLOW')
  const [upgradeResult, setUpgradeResult] = useState<{ upgradeId: string; success: boolean; chance: number; landingAngle: number; target: Skin } | null>(null)
  const [upgradePhase, setUpgradePhase] = useState<'idle' | 'spinning' | 'result'>('idle')
  const [upgradeMode, setUpgradeMode] = useState<SpinMode>('SLOW')
  const [sources, setSources] = useState<Inventory[]>([])
  const [target, setTarget] = useState<Skin | null>(null)
  const [upgradeBalance, setUpgradeBalance] = useState(0)
  const [upgradeSettingsOpen, setUpgradeSettingsOpen] = useState(false)
  const [upgradePigOrbit, setUpgradePigOrbit] = useState(() => localStorage.getItem('svino-upgrade-pig-orbit') !== 'off')
  const [sellingCaseDrops, setSellingCaseDrops] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [profile, setProfile] = useState<{ stats: { opens: number; upgrades: number; itemCount: number }; transactions: { id: string; type: string; amount: number; description: string; createdAt: string }[]; daily: { available: boolean; nextAt: string | null; maxValue: number } } | null>(null)
  const [chat, setChat] = useState<{ id: string; message: string; createdAt: string; user: { username: string } }[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [publicProfile, setPublicProfile] = useState<{ id: string; username: string; avatar: string | null; nickColor: string; createdAt: string; stats: { opens: number; upgrades: number; itemCount: number } } | null>(null)
  const [giveaways, setGiveaways] = useState<Giveaway[]>([])
  const [collectionTitle, setCollectionTitle] = useState('Стартовая свиноколлекция')

  const toast = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3600) }
  const refreshPrivate = async () => {
    if (!token) return
    try {
      // Only the dedicated session check may log a player out. A temporary
      // failure in a background request must never destroy their local session.
      const me = await request('/api/auth/me', token)
      setUser(me.user)
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        localStorage.removeItem('svino-token'); setToken(''); setUser(null)
      }
      return
    }
    try {
      // Claims server-finalized case/upgrade rewards after a refresh during animation.
      await request('/api/recover-pending', token, { method: 'POST' })
      const [items, info] = await Promise.all([request('/api/inventory', token), request('/api/profile', token)])
      setInventory(items); setProfile(info)
    } catch {
      // The account stays signed in; the next private refresh retries recovery.
    }
  }
  useEffect(() => { request('/api/cases').then((data) => { setCases(data); setCasesReady(true) }).catch(() => toast('Не удалось загрузить кейсы — проверь API.')); request('/api/items').then(setSkins).catch(() => undefined); request('/api/chat').then(setChat).catch(() => undefined); request('/api/leaderboard').then(setLeaderboard).catch(() => undefined); request('/api/site-settings').then((settings) => { if (settings.collectionTitle) setCollectionTitle(settings.collectionTitle) }).catch(() => undefined) }, [])
  useEffect(() => { refreshPrivate() }, [token])
  useEffect(() => {
    const socket = io(API)
    socket.on('online:count', setOnline)
    socket.on('drop:revealed', (drop: Feed) => setFeed((items) => [drop, ...items].slice(0, 6)))
    socket.on('chat:message', (message) => setChat((messages) => [message, ...messages].slice(0, 50)))
    socket.on('chat:deleted', ({ id }: { id: string }) => setChat((messages) => messages.filter((message) => message.id !== id)))
    return () => { socket.disconnect() }
  }, [])
  useEffect(() => { if (page === 'leaderboard') request('/api/leaderboard').then(setLeaderboard).catch(() => toast('Не удалось обновить лидерборд')) }, [page])
  useEffect(() => { if (page === 'giveaways') request('/api/giveaways').then(setGiveaways).catch(() => toast('Не удалось загрузить розыгрыши')) }, [page])
  const upgradeStake = sources.reduce((total, source) => total + source.item.price, 0) + upgradeBalance
  const upgradeChance = useMemo(() => sources.length && target && target.price > upgradeStake ? Math.max(2, Math.min(90, Math.round(upgradeStake / target.price * 90))) : 0, [sources, target, upgradeStake])
  const toggleUpgradeSource = (entry: Inventory) => {
    const alreadySelected = sources.some((source) => source.id === entry.id)
    if (!alreadySelected && sources.length >= 8) return toast('В один апгрейд можно добавить максимум 8 скинов.')
    const nextSources = alreadySelected ? sources.filter((source) => source.id !== entry.id) : [...sources, entry]
    const nextStake = nextSources.reduce((total, source) => total + source.item.price, 0) + upgradeBalance
    setSources(nextSources)
    if (target && target.price <= nextStake) setTarget(null)
    setUpgradePhase('idle'); setUpgradeResult(null)
  }
  const login = async (email: string, password: string, username?: string) => {
    const endpoint = username ? '/api/auth/register' : '/api/auth/login'
    const body = username ? { username, email, password } : { email, password }
    const data = await request(endpoint, undefined, { method: 'POST', body: JSON.stringify(body) })
    localStorage.setItem('svino-token', data.token); setToken(data.token); setUser(data.user); setAuthOpen(false); toast(username ? 'Добро пожаловать в стаю! +1 000 свинокоинов' : 'С возвращением, свинка!')
  }
  const openCase = async () => {
    if (!selectedCase) return
    if (!token) return setAuthOpen(true)
    if (selectedCase.id.startsWith('offline')) return toast('Запусти базу данных и сервер, чтобы открыть кейс.')
    try {
      setCasePhase('spinning')
      setOpening(null)
      const data = await request(`/api/cases/${selectedCase.id}/open`, token, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ count }) })
      setOpening(data.drops); setCaseBalanceReward(data.balanceReward || 0); setCasePhase('spinning'); setUser((current) => current ? { ...current, balance: data.balance } : current)
    } catch (error) { setCasePhase('idle'); toast(error instanceof Error ? error.message : 'Не удалось открыть кейс') }
  }
  const upgrade = async () => {
    if (!token) return setAuthOpen(true)
    if (!sources.length || !target) return toast('Сначала выбери предметы и цель.')
    try {
      setUpgradePhase('spinning')
      const result = await request('/api/upgrades', token, { method: 'POST', body: JSON.stringify({ sourceInventoryIds: sources.map((source) => source.id), targetItemId: target.id, balanceStake: upgradeBalance }) })
      setUpgradeResult(result); setUpgradePhase('spinning'); setUser((current) => current ? { ...current, balance: result.balance } : current)
    } catch (error) { setUpgradePhase('idle'); toast(error instanceof Error ? error.message : 'Апгрейд не выполнен') }
  }
  const redeem = async (code: string) => { try { const data = await request('/api/promos/redeem', token, { method: 'POST', body: JSON.stringify({ code }) }); toast(data.message); refreshPrivate() } catch (error) { toast(error instanceof Error ? error.message : 'Ошибка промокода') } }
  const claimDaily = async () => { try { const data = await request('/api/daily-case/open', token, { method: 'POST' }); toast(`Ежедневный кейс: ${data.item.name} уже в инвентаре 🐷`); await refreshPrivate() } catch (error) { toast(error instanceof Error ? error.message : 'Ежедневный кейс пока недоступен') } }
  const sendChat = async (message: string) => { try { await request('/api/chat', token, { method: 'POST', body: JSON.stringify({ message }) }) } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось отправить') } }
  const sell = async (inventoryId: string) => { if (sellingAll || sellingIds.has(inventoryId)) return; setSellingIds((current) => new Set(current).add(inventoryId)); try { const data = await request(`/api/inventory/${inventoryId}/sell`, token, { method: 'POST' }); setInventory((current) => current.filter((item) => item.id !== inventoryId)); setUser((current) => current ? { ...current, balance: data.balance } : current); toast(`Продано за ${coins(data.payout)} SC`); await refreshPrivate() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось продать предмет') } finally { setSellingIds((current) => { const next = new Set(current); next.delete(inventoryId); return next }) } }
  const sellAll = async () => { if (sellingAll || !inventory.length || !window.confirm(`Продать все ${inventory.length} предметов за полную стоимость?`)) return; setSellingAll(true); try { const data = await request('/api/inventory/sell-all', token, { method: 'POST' }); setInventory([]); setUser((current) => current ? { ...current, balance: data.balance } : current); toast(`Продано предметов: ${data.sold}. Получено ${coins(data.payout)} SC`); await refreshPrivate() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось продать предметы') } finally { setSellingAll(false) } }
  const sellCaseDrops = async () => {
    if (!opening?.length || sellingCaseDrops) return
    setSellingCaseDrops(true)
    try {
      let balance = user?.balance || 0
      for (const drop of opening) {
        const data = await request(`/api/inventory/${drop.inventoryId}/sell`, token, { method: 'POST' })
        balance = data.balance
      }
      setInventory((current) => current.filter((entry) => !opening.some((drop) => drop.inventoryId === entry.id)))
      setUser((current) => current ? { ...current, balance } : current)
      toast(`Продано дропов: ${opening.length}. Свинокоины уже на балансе.`)
      setSelectedCase(null); setCasePhase('idle'); setOpening(null); setCaseBalanceReward(0)
      await refreshPrivate()
    } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось продать выпавшие предметы') }
    finally { setSellingCaseDrops(false) }
  }
  const enterGiveaway = async (id: string) => { if (!token) return setAuthOpen(true); try { const data = await request(`/api/giveaways/${id}/enter`, token, { method: 'POST' }); setUser((current) => current ? { ...current, balance: data.balance } : current); setGiveaways(await request('/api/giveaways')); toast('Ты в списке участников. Удачи, свинка! 🐷') } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось участвовать') } }
  const finishCaseAnimation = async () => { if (casePhase !== 'spinning' || !opening) return; setCasePhase('result'); await Promise.all(opening.map((drop) => request(`/api/drops/${drop.dropId}/reveal`, token, { method: 'POST' }))); await refreshPrivate(); toast('Дроп уже в твоём инвентаре!') }
  const finishUpgradeAnimation = async () => { if (upgradePhase !== 'spinning' || !upgradeResult) return; setUpgradePhase('result'); setUpgradeBalance(0); setSources([]); setTarget(null); await request(`/api/upgrades/${upgradeResult.upgradeId}/reveal`, token, { method: 'POST' }); await refreshPrivate() }
  // CSS animation events can be suppressed by reduced-motion/browser focus
  // changes. The timer is the authority: an upgrade can never stay locked.
  useEffect(() => {
    if (upgradePhase !== 'spinning' || !upgradeResult) return
    const timer = window.setTimeout(() => { void finishUpgradeAnimation() }, spinDuration[upgradeMode] + 180)
    return () => window.clearTimeout(timer)
  }, [upgradePhase, upgradeResult?.upgradeId, upgradeMode])
  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <button className="brand" onClick={() => setPage('cases')}><span className="brand-mark">🐷</span><span>SVINO<span>DROP</span></span></button>
      <nav>{([['cases', 'Кейсы'], ['games', 'Игры'], ['giveaways', 'Розыгрыши'], ['leaderboard', 'Лидерборд'], ['inventory', 'Инвентарь'], ...(user?.role === 'ADMIN' ? [['admin', 'Админ-панель'] as const] : [])] as const).map(([id, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{label}</button>)}</nav>
      <div className="top-actions"><span className="online"><i /> {online} свинок онлайн</span>{user ? <button className="user-chip" onClick={() => setPage('profile')}><span className="avatar">🐽</span><b>{coins(user.balance)} <small>SC</small></b><em>{user.username}</em></button> : <button className="login" onClick={() => setAuthOpen(true)}>Войти</button>}</div>
    </header>

    {page === 'cases' && <section className="page intro-page">
      <div className="hero-copy"><p className="eyebrow">СВИНСКАЯ КОЛЛЕКЦИЯ #01</p><h1>Кейсы без<br/><strong>скучных</strong> дропов.</h1><p className="hero-text">Свиньи. Кейсы. Скины. И немного свинского безумия.</p><div className="hero-buttons"><button className="pig-button" onClick={() => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth' })}>Открыть кейсы <span>→</span></button><button className="ghost-button" onClick={() => setPage('upgrade')}>Апгрейд <span>↗</span></button></div><div className="hero-stats"><span><b>32</b> скина</span><span><b>16</b> кейсов</span><span><b>100%</b> виртуально</span></div></div>
      <div className="pig-hero"><div className="hero-crown">♕</div><div className="hero-pig">🐷</div><div className="hero-sticker one">+ DROP</div><div className="hero-sticker two">✦ 2X</div><div className="hero-card"><span>СЕГОДНЯ ВЫПАЛО</span><b>★ Karambit</b><em>1 030 SC</em></div></div>
      <section className="feature-scroller" aria-label="Режимы сайта">{[['🎁','Розыгрыши','Забирай призы','giveaways'],['🎯','Апгрейды','Рискуй скинами','upgrade'],['📦','Кейс-баттлы','Победа забирает банк','battles'],['⚓','Морской бой','Ставка один на один','naval']].map(([icon,title,text,id]) => <button key={title} onClick={() => setPage(id as typeof page)}><span>{icon}</span><b>{title}</b><small>{text}</small><em>→</em></button>)}</section>
      <section id="cases" className="case-section"><div className="section-heading"><div><p className="eyebrow">СВИНСКИЙ ВЫБОР</p><h2>Выбери свой кейс</h2></div><span>{casesReady ? 'Каждый дроп определяется сервером' : 'Подключаем свинобазу...'}</span></div><div className="case-collections">{Object.entries(cases.reduce<Record<string, Case[]>>((groups, item) => { (groups[item.collection] ||= []).push(item); return groups }, {})).map(([collection, collectionCases]) => <section className="case-collection" key={collection}><div className="collection-head"><span>{collection === 'Магические Свиньи' ? '🪄' : collection === 'Свинки Пепы' ? '👑' : collection === 'От рубля до ножа' ? '🔪' : '🐷'}</span><div><p className="eyebrow">КОЛЛЕКЦИЯ</p><h3>{collection}</h3></div><small>{collection === 'Магические Свиньи' ? 'Секретный дроп · до 3 наград' : collection === 'Свинячий Окуп' ? 'Сочные шансы · дорогой лут' : collection === 'Свинки Пепы' ? 'Богатая коллекция · королевский лут' : collection === 'От рубля до ножа' ? 'Четыре ступени к ножу' : collectionTitle}</small></div><div className="case-grid">{collectionCases.map((item, index) => <article className={`case-card case-${index} ${item.openingStyle === 'MAGIC' ? `magic-case-card magic-${item.slug}` : ''} ${casesReady ? '' : 'loading-case'}`} key={item.id} onClick={() => { if (!casesReady) return toast('Кейсы загружаются, одну секунду 🐷'); setSelectedCase(item); setCount(item.maxOpen === 1 ? 1 : Math.min(4, item.maxOpen || 4, count)); setOpening(null); setCaseBalanceReward(0) }}><div className="case-no">{item.openingStyle === 'MAGIC' ? '✦' : String(index + 1).padStart(2, '0')}</div><img src={item.image} alt={item.name} /><div className="case-footer"><div><h3>{item.name}</h3><p>{item.openingStyle === 'MAGIC' ? 'Секретное открытие' : `Коллекция ${item.collection}`}</p></div><b>{coins(item.price)} <small>SC</small></b></div><button disabled={!casesReady}>{casesReady ? <>{item.openingStyle === 'MAGIC' ? 'КОЛДОВАТЬ' : 'ОТКРЫТЬ'} <span>→</span></> : 'ЗАГРУЗКА...'}</button></article>)}</div></section>)}</div></section>
      <section className="feed-section"><div className="section-heading"><div><p className="eyebrow">LIVE DROP FEED</p><h2>Последние находки</h2></div><span>Без спойлеров до конца анимации</span></div><div className="feed-list">{feed.length ? feed.map((drop, index) => <div className="feed-item" key={`${drop.username}-${index}`}><span className="feed-avatar">🐷</span><span><b>{drop.username}</b> выбил через {drop.kind}</span><strong className={rarity(drop.item.rarity)}>{drop.item.name}</strong></div>) : <div className="empty-feed">Пока здесь тихо... 🐷 Открой первый кейс и зажги ленту.</div>}</div></section>
    </section>}

    {page === 'upgrade' && <section className="page upgrade-page">
      <div className="page-title"><p className="eyebrow">RISK IT FOR THE BACON</p><h1>Свинский <strong>апгрейд</strong></h1><p>Выбери предмет, добавь при желании баланс и поставь цель.</p></div>
      <div className="upgrade-board">
        <UpgradeColumn title="ТВОИ ПРЕДМЕТЫ" subtitle="Можно объединить до 8 скинов" selectedSkins={sources.map((source) => source.item)} selectedCaption={sources.length > 1 ? `${sources.length} предметов в ставке` : 'Твоя ставка'} selectionLimit={8} onClear={sources.length ? () => { setSources([]); setUpgradePhase('idle'); setUpgradeResult(null) } : undefined} empty={!inventory.length ? 'Открой кейс, чтобы начать.' : undefined}>{inventory.map((entry) => <SkinCard key={entry.id} skin={entry.item} selected={sources.some((source) => source.id === entry.id)} onClick={() => toggleUpgradeSource(entry)} />)}</UpgradeColumn>
        <div className="upgrade-core">
          <UpgradeDial key={`${upgradeResult?.upgradeId || 'idle'}-${upgradeMode}`} chance={upgradeChance} phase={upgradePhase} result={upgradeResult} mode={upgradeMode} showPigOrbit={upgradePigOrbit}/>
          <div className="upgrade-copy"><b>{upgradePhase === 'spinning' ? (upgradeResult ? 'СТРЕЛКА В ПОЛЁТЕ…' : 'ФИКСИРУЕМ РЕЗУЛЬТАТ…') : upgradePhase === 'result' ? (upgradeResult?.success ? 'АПГРЕЙД УСПЕШЕН! 🔥' : 'В ЭТОТ РАЗ НЕ ПОВЕЗЛО') : 'ВЫБЕРИ СТАВКУ И ЦЕЛЬ'}</b><span>{upgradePhase === 'idle' ? `Шанс попадания: ${upgradeChance || 0}%` : 'Результат уже защищён сервером'}</span></div>
          <div className="upgrade-settings"><button type="button" className="upgrade-settings-toggle" onClick={() => setUpgradeSettingsOpen((open) => !open)}>⚙ Настройки {upgradeSettingsOpen ? '⌃' : '⌄'}</button>{upgradeSettingsOpen && <div className="upgrade-settings-menu"><label><input type="checkbox" checked={upgradePigOrbit} onChange={(event) => { const visible = event.target.checked; setUpgradePigOrbit(visible); localStorage.setItem('svino-upgrade-pig-orbit', visible ? 'on' : 'off') }}/> Летающие свинки вокруг колеса</label><small>Скорость анимации</small><div className="spin-modes">{(['FAST','SLOW','RISK'] as SpinMode[]).map((mode) => <button key={mode} disabled={upgradePhase === 'spinning'} className={upgradeMode === mode ? 'chosen' : ''} onClick={() => setUpgradeMode(mode)}>{spinModeLabel[mode]}{mode === 'FAST' ? ' · 2с' : ''}</button>)}</div></div>}</div>
          <div className="upgrade-stake"><div><label htmlFor="upgrade-balance">Добавить балансом</label><input id="upgrade-balance" type="range" min="0" max={Math.floor((user?.balance || 0) / 100)} step="1" value={upgradeBalance / 100} disabled={upgradePhase === 'spinning'} onChange={(event) => { setUpgradeBalance(Number(event.target.value) * 100); setUpgradePhase('idle'); setUpgradeResult(null) }}/><div className="stake-marks"><button type="button" onClick={() => setUpgradeBalance(0)}>0</button><button type="button" onClick={() => setUpgradeBalance(Math.floor((user?.balance || 0) * .25 / 100) * 100)}>25%</button><button type="button" onClick={() => setUpgradeBalance(Math.floor((user?.balance || 0) * .5 / 100) * 100)}>50%</button><button type="button" onClick={() => setUpgradeBalance(Math.floor((user?.balance || 0) / 100) * 100)}>MAX</button></div></div><strong>{coins(upgradeBalance)} <small>SC</small></strong><span>Общая ставка: {coins(upgradeStake)} SC</span></div>
          <div className="quick-row">{[2, 3, 5, 10, 25].map((x) => <button key={x} disabled={upgradePhase === 'spinning' || !sources.length} onClick={() => { if (sources.length) { setTarget(skins.find((skin) => skin.price > upgradeStake && skin.price >= upgradeStake * x) || null); setUpgradePhase('idle'); setUpgradeResult(null) } }}>×{x}</button>)}</div>
          {upgradePhase === 'spinning' && upgradeResult && <button className="skip-upgrade" onClick={finishUpgradeAnimation}>Пропустить анимацию ↷</button>}
          <button className="pig-button upgrade-button" disabled={upgradePhase === 'spinning'} onClick={() => { if (upgradePhase === 'result') { setUpgradePhase('idle'); setUpgradeResult(null); return } upgrade() }}>{upgradePhase === 'spinning' ? 'СТРЕЛКА КРУТИТСЯ…' : upgradePhase === 'result' ? 'ЕЩЁ ОДНА ПОПЫТКА →' : `АПГРЕЙД · ${spinModeLabel[upgradeMode].toUpperCase()} →`}</button>
        </div>
        <UpgradeColumn title="ЦЕЛЬ" subtitle="Предмет, который получишь при успехе" selectedSkins={target ? [target] : []} selectedCaption="Твоя цель">{skins.filter((skin) => skin.price > upgradeStake).slice(0, 12).map((skin) => <SkinCard key={skin.id} skin={skin} selected={target?.id === skin.id} onClick={() => { setTarget(skin); setUpgradePhase('idle'); setUpgradeResult(null) }} />)}</UpgradeColumn>
      </div>
    </section>}

    {page === 'inventory' && <section className="page compact-page"><div className="page-title left"><p className="eyebrow">МОЯ КОЛЛЕКЦИЯ</p><h1>Мои <strong>предметы</strong></h1><p>{user ? `${inventory.length} предметов в свинкопарке · продажа за полную цену` : 'Войди, чтобы увидеть инвентарь'}</p>{inventory.length > 0 && <button className="pig-button sell-all" disabled={sellingAll} onClick={sellAll}>{sellingAll ? 'Продаём предметы…' : `Продать всё · ${coins(inventory.reduce((sum, entry) => sum + entry.item.price, 0))} SC`}</button>}</div>{inventory.length ? <div className="inventory-grid">{inventory.map((entry) => <InventoryCard key={entry.id} entry={entry} selling={sellingAll || sellingIds.has(entry.id)} onSell={sell} />)}</div> : <EmptyInventory onClick={() => setPage('cases')} />}</section>}
    {page === 'profile' && <section className="page compact-page"><div className="profile-banner"><div className="profile-pig">🐷</div><div><p className="eyebrow">СВИНОПРОФИЛЬ</p><h1>{user?.username || 'Гость'}</h1><p>{user ? `В стае с ${new Date(user.createdAt).toLocaleDateString('ru-RU')}` : 'Войди в аккаунт, чтобы сохранить свою коллекцию.'}</p></div><button className="login" onClick={() => user ? (localStorage.removeItem('svino-token'), setToken(''), setUser(null)) : setAuthOpen(true)}>{user ? 'Выйти' : 'Войти'}</button></div>{user && <><div className="stat-row"><Stat value={coins(user.balance)} label="свинокоинов"/><Stat value={profile?.stats.opens || 0} label="открытий"/><Stat value={profile?.stats.upgrades || 0} label="апгрейдов"/><Stat value={profile?.stats.itemCount || 0} label="предметов"/></div><div className="profile-columns"><section className="panel daily-case"><span>🎁</span><div><p className="eyebrow">КАЖДЫЕ 24 ЧАСА</p><h3>Ежедневный кейс</h3><p>Один предмет стоимостью до 1 500 SC.</p>{profile?.daily?.available ? <button className="pig-button" onClick={claimDaily}>Забрать кейс →</button> : <small>Следующий: {profile?.daily?.nextAt ? new Date(profile.daily.nextAt).toLocaleString('ru-RU') : 'скоро'}</small>}</div></section><section className="panel"><h3>Промокод</h3><p>У свинок есть секретные коды.</p><PromoForm onSubmit={redeem}/></section><section className="panel"><h3>Последние операции</h3>{profile?.transactions.map((transaction) => <div className="transaction" key={transaction.id}><span>{transaction.description}</span><b className={transaction.amount >= 0 ? 'positive' : 'negative'}>{transaction.amount >= 0 ? '+' : ''}{coins(transaction.amount)} SC</b></div>)}</section></div></>}</section>}
    {page === 'profile' && user && <ProfileCustomizer user={user} token={token} onSaved={setUser} toast={toast}/>}
    {page === 'chat' && <section className="page compact-page chat-page"><div className="page-title left"><p className="eyebrow">СВИНОЧАТ</p><h1>Стая <strong>онлайн</strong></h1><p>Будь милым, не спамь — свинки всё видят.</p></div><div className="chat-box"><div className="messages">{chat.length ? chat.map((message) => <div className="message" key={message.id}><span>🐷</span><div><b>{message.user.username}</b><p>{message.message}</p></div><time>{new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time></div>) : <div className="empty-feed">Пока здесь тихо... 🐷</div>}</div><ChatForm disabled={!user} onSubmit={sendChat}/></div></section>}
    {page === 'giveaways' && <Giveaways giveaways={giveaways} onEnter={enterGiveaway}/>} 
    {page === 'games' && <GamesHub onOpen={(game) => setPage(game)}/>}
    {page === 'battles' && <BattlePage token={token} cases={cases.filter((item) => item.openingStyle !== 'MAGIC')} user={user} onRequireAuth={() => setAuthOpen(true)} onBalance={refreshPrivate} toast={toast}/>}
    {page === 'naval' && <NavalPage token={token} user={user} onRequireAuth={() => setAuthOpen(true)} onBalance={refreshPrivate} toast={toast}/>}
    {page === 'leaderboard' && <Leaderboard rows={leaderboard} currentUserId={user?.id} onOpen={(id) => request(`/api/users/${id}`).then(setPublicProfile).catch((error) => toast(error instanceof Error ? error.message : 'Профиль недоступен'))}/>}
    {page === 'admin' && user?.role === 'ADMIN' && <AdminPanelV2 token={token} toast={toast}/>} 

    {selectedCase && <CaseModal data={selectedCase} count={count} setCount={setCount} opening={opening} balanceReward={caseBalanceReward} phase={casePhase} mode={caseMode} setMode={setCaseMode} onFinished={finishCaseAnimation} onClose={() => { if (casePhase !== 'spinning') { setSelectedCase(null); setCasePhase('idle'); setOpening(null); setCaseBalanceReward(0) } }} onOpen={openCase} onSellDrops={sellCaseDrops} sellingCaseDrops={sellingCaseDrops} />}
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSubmit={login} />}
    {publicProfile && <PublicProfileModal profile={publicProfile} onClose={() => setPublicProfile(null)}/>}
    <button className="chat-fab" aria-label="Открыть чат" onClick={() => setPage('chat')}>💬</button>
    {notice && <div className="toast">🐷 {notice}</div>}
  </main>
}

function SkinCard({ skin, selected, onClick, note }: { skin: Skin; selected?: boolean; onClick?: () => void; note?: string }) { return <button className={`skin-card ${rarity(skin.rarity)} ${selected ? 'selected' : ''}`} onClick={onClick}><img src={skin.image} alt="" loading="lazy" onError={({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg' }}/><span>{skin.wear}</span><div><b>{skin.name}</b><em>{coins(skin.price)} SC</em>{note && <small>{note}</small>}</div></button> }
function InventoryCard({ entry, selling, onSell }: { entry: Inventory; selling: boolean; onSell: (id: string) => void }) { return <article className={`inventory-card ${rarity(entry.item.rarity)}`}><img src={entry.item.image} alt="" onError={({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg' }}/><span>{entry.item.wear}</span><b>{entry.item.name}</b><em>{coins(entry.item.price)} SC</em><small>Продажа: {coins(entry.item.price)} SC</small><button className="login" disabled={selling} onClick={() => onSell(entry.id)}>{selling ? 'Продажа…' : 'Продать'}</button></article> }
function UpgradeColumn({ title, subtitle, children, empty, selectedSkins = [], selectedCaption, selectionLimit, onClear }: { title: string; subtitle: string; children: React.ReactNode; empty?: string; selectedSkins?: Skin[]; selectedCaption?: string; selectionLimit?: number; onClear?: () => void }) { const total = selectedSkins.reduce((sum, skin) => sum + skin.price, 0); return <section className="upgrade-column"><div className="board-label"><span>🐷</span><div><b>{title}</b><small>{subtitle}</small></div></div><div className={`upgrade-selected ${selectedSkins.length ? 'has-skin' : ''}`}>{selectedSkins.length ? <><small>{selectedCaption}</small><div className="upgrade-selected-skins">{selectedSkins.slice(0, 5).map((skin) => <img src={skin.image} alt="" key={skin.id}/>)}{selectedSkins.length > 5 && <b>+{selectedSkins.length - 5}</b>}</div><b>{selectedSkins.length === 1 ? selectedSkins[0].name : `${selectedSkins.length} скинов вместе`}</b><em>{coins(total)} SC</em></> : <span>{title === 'ЦЕЛЬ' ? 'Выбери желаемый скин' : 'Выбери скины из инвентаря'}</span>}</div>{selectionLimit && <div className="upgrade-selection-bar"><span>Выбрано: <b>{selectedSkins.length}/{selectionLimit}</b></span>{onClear && <button type="button" onClick={onClear}>Очистить</button>}</div>}{empty ? <p className="select-empty">{empty}</p> : <div className="choice-list">{children}</div>}</section> }
function Stat({ value, label }: { value: number | string; label: string }) { return <div className="stat"><b>{value}</b><span>{label}</span></div> }
function Leaderboard({ rows, currentUserId, onOpen }: { rows: LeaderboardRow[]; currentUserId?: string; onOpen: (id: string) => void }) { return <section className="page compact-page leaderboard-page"><div className="leaderboard-hero"><div><p className="eyebrow">ОБЩИЙ РЕЙТИНГ · ДОСТУПЕН КАЖДОМУ</p><h1>Лидер<strong>борд</strong></h1><p>Место определяется всем состоянием свинки: балансом и полной стоимостью скинов в инвентаре.</p></div><div className="leaderboard-cup">🏆<span>TOP<br/>PIGS</span></div></div><div className="leaderboard-table"><div className="leaderboard-head"><span>#</span><span>Игрок</span><span>Скины</span><span>Баланс</span><span>Капитал</span></div>{rows.length ? rows.map((row) => <article className={`leaderboard-row ${row.id === currentUserId ? 'is-me' : ''}`} key={row.id} onClick={() => onOpen(row.id)}><b className={`rank rank-${Math.min(row.rank, 3)}`}>{row.rank}</b><div className="leader-name"><span>{row.avatar || '🐷'}</span><b>{row.username}{row.id === currentUserId && <small>это ты</small>}</b></div><span>{row.skins} шт. · {coins(row.inventoryValue)} SC</span><span>{coins(row.balance)} SC</span><strong>{coins(row.total)} <small>SC</small></strong></article>) : <div className="empty-feed">Лидерборд загружается…</div>}</div></section> }
function ProfileCustomizer({ user, token, onSaved, toast }: { user: User; token: string; onSaved: (user: User) => void; toast: (text: string) => void }) { const avatars = ['🐷','🐽','👑','🎰','⚔️','🦄','🐸','🦊','🐯','🦈','👾','🤖']; const [avatar, setAvatar] = useState(user.avatar || '🐷'); const [nickColor, setNickColor] = useState(user.nickColor || '#ffffff'); const save = async () => { try { const data = await request('/api/profile/customize', token, { method: 'PATCH', body: JSON.stringify({ avatar, nickColor }) }); onSaved(data.user); toast('Профиль обновлён') } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось обновить профиль') } }; const remove = async () => { if (window.prompt(`Напиши ${user.username}, чтобы удалить аккаунт вместе со всеми предметами и историей:`) !== user.username) return; try { await request('/api/profile', token, { method: 'DELETE' }); localStorage.removeItem('svino-token'); window.location.reload() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось удалить аккаунт') } }; return <section className="page compact-page profile-customizer"><div className="panel"><p className="eyebrow">СВИНОСТИЛЬ</p><h2>Настрой профиль</h2><div className="avatar-gallery">{avatars.map((item) => <button className={avatar === item ? 'chosen' : ''} onClick={() => setAvatar(item)} key={item}>{item}</button>)}</div><label>Цвет ника <input type="color" value={nickColor} onChange={(event) => setNickColor(event.target.value)}/><b style={{ color: nickColor }}>{user.username}</b></label><button className="pig-button" onClick={save}>Сохранить стиль →</button><button className="admin-danger" onClick={remove}>Удалить аккаунт</button></div></section> }
function PublicProfileModal({ profile, onClose }: { profile: { username: string; avatar: string | null; nickColor: string; createdAt: string; stats: { opens: number; upgrades: number; itemCount: number } }; onClose: () => void }) { return <div className="modal-backdrop"><section className="auth-modal public-profile"><button className="close" onClick={onClose}>×</button><div className="auth-pig">{profile.avatar || '🐷'}</div><p className="eyebrow">ПУБЛИЧНЫЙ СВИНОПРОФИЛЬ</p><h2 style={{ color: profile.nickColor }}>{profile.username}</h2><p>В стае с {new Date(profile.createdAt).toLocaleDateString('ru-RU')}</p><div className="stat-row"><Stat value={profile.stats.opens} label="открытий"/><Stat value={profile.stats.upgrades} label="апгрейдов"/><Stat value={profile.stats.itemCount} label="предметов"/></div></section></div> }

function GamesHub({ onOpen }: { onOpen: (game: 'upgrade' | 'battles' | 'naval') => void }) { const games: Array<{ id: 'upgrade' | 'battles' | 'naval'; icon: string; eyebrow: string; title: string; text: string; action: string }> = [{ id: 'upgrade', icon: '🎯', eyebrow: 'RISK IT FOR THE BACON', title: 'Свинский апгрейд', text: 'Собери до 8 скинов, выбери цель и рискни на красивом колесе.', action: 'К апгрейду' }, { id: 'battles', icon: '⚔️', eyebrow: 'CASE BATTLE', title: 'Кейс-баттлы', text: 'Создавай комнаты, зови игроков или свиноботов и забирай весь банк.', action: 'В баттлы' }, { id: 'naval', icon: '⚓', eyebrow: 'PIGGY NAVAL', title: 'Морской бой', text: 'Расставь флот, стреляй по скрытой доске и забери двойной банк.', action: 'В море' }]; return <section className="page compact-page games-hub"><div className="page-title"><p className="eyebrow">SVINODROP GAME ROOM</p><h1>Выбери свою <strong>игру</strong></h1><p>Три режима, один свинобаланс и настоящая конкуренция с игроками.</p></div><div className="games-grid">{games.map((game) => <button className={`game-hub-card ${game.id}`} key={game.id} onClick={() => onOpen(game.id)}><span>{game.icon}</span><p>{game.eyebrow}</p><h2>{game.title}</h2><small>{game.text}</small><b>{game.action} <em>→</em></b></button>)}</div></section> }

const battleLabels: Record<Battle['mode'], string> = { NORMAL: 'Обычный', CURSED: 'Проклятый', JACKPOT: 'Джекпот', LAST: 'Последний' }

function BattleShowcase({ battle }: { battle: Battle }) {
  const results = battle.results!;
  const rounds = results.rounds;
  const maxDrops = Math.max(0, ...rounds.map((round) => round.drops.length));
  const [roundIndex, setRoundIndex] = useState(0);
  const [stage, setStage] = useState<'spin' | 'reveal' | 'finale'>('spin');
  const [finale, setFinale] = useState(false);
  const [jackpotFinished, setJackpotFinished] = useState(false);
  const fast = Boolean(battle.fast)
  const spinMs = fast ? 1350 : 3600
  const revealMs = fast ? 520 : 1150
  const jackpotMs = 10_000
  const jackpotPlayerIndexes = results.jackpotPlayerIndexes?.length ? results.jackpotPlayerIndexes : battle.mode === 'JACKPOT' ? rounds.map((_, index) => index) : [];
  const isJackpotFinish = jackpotPlayerIndexes.length > 0;
  const isTieBreaker = isJackpotFinish && battle.mode !== 'JACKPOT';
  useEffect(() => {
    setRoundIndex(0);
    setStage('spin');
    setFinale(false);
    setJackpotFinished(false);
    if (!maxDrops) return;
    const timers: number[] = [];
    const after = (delay: number, callback: () => void) => timers.push(window.setTimeout(callback, delay));
    const playRound = (index: number) => {
      setRoundIndex(index); setStage('spin');
      // A complete reel has time to accelerate, cross real item cards, and slow
      // down on the server-selected drop before the next case begins.
      after(spinMs, () => {
        setStage('reveal');
        after(revealMs, () => {
          if (index + 1 < maxDrops) playRound(index + 1);
          else {
            setStage('finale'); setFinale(true);
            if (isJackpotFinish) after(jackpotMs, () => setJackpotFinished(true));
          }
        });
      });
    };
    after(fast ? 150 : 420, () => playRound(0));
    return () => timers.forEach(window.clearTimeout);
  }, [battle.id, battle.fast, maxDrops, isJackpotFinish]);
  const jackpotTotal = jackpotPlayerIndexes.reduce((sum, index) => sum + Math.max(1, rounds[index].total), 0);
  const activeRound = Math.min(roundIndex, Math.max(0, maxDrops - 1));
  const isOpening = stage === 'spin';
  const visibleDrops = stage === 'spin' ? activeRound : Math.min(maxDrops, activeRound + 1);
  const winner = rounds[results.winnerIndex];
  const scoreTo = (round: typeof rounds[number], count: number) => round.drops.slice(0, count).reduce((sum, drop) => sum + drop.value, 0);
  const activeCase = battle.cases[activeRound];
  const reelPool = activeCase?.items?.map((entry) => entry.item) || [];
  const decisive = battle.mode === 'LAST' && activeRound === maxDrops - 1;
  const winnerKnown = !isJackpotFinish || jackpotFinished;
  const chanceSlots = jackpotPlayerIndexes.flatMap((playerIndex) => Array.from({ length: Math.max(1, Math.round(Math.max(1, rounds[playerIndex].total) / jackpotTotal * 24)) }, () => playerIndex));
  const winnerSlot = chanceSlots.findIndex((entry) => entry === results.winnerIndex);
  const jackpotCycles = 9;
  const jackpotTarget = chanceSlots.length * (jackpotCycles - 2) + Math.max(0, winnerSlot);
  const jackpotStart = Math.min(8, jackpotTarget);
  const jackpotEntries = Array.from({ length: chanceSlots.length * jackpotCycles }, (_, index) => chanceSlots[index % chanceSlots.length]);
  return <div className={`battle-showcase battle-case-window ${battle.mode === 'LAST' ? 'battle-last-mode' : ''} ${fast ? 'battle-fast-mode' : ''} ${stage === 'finale' && isJackpotFinish ? 'jackpot-focus' : ''}`}>
    <div className="battle-rounds-strip">{battle.cases.map((caseData, index) => <div className={`${index < visibleDrops ? 'done' : ''} ${index === activeRound && isOpening ? 'current' : ''} ${battle.mode === 'LAST' && index === maxDrops - 1 ? 'decisive' : ''}`} key={`${caseData.id}-${index}`}><small>{index + 1}</small><img src={caseData.image} alt={caseData.name}/></div>)}</div>
    <div className="battle-round-status"><span>{isOpening ? decisive ? '🔥 РЕШАЮЩИЙ КЕЙС · ПОСЛЕДНИЙ ДРОП ОПРЕДЕЛИТ ПОБЕДИТЕЛЯ' : 'КРУТИМ ОДИНАКОВЫЙ КЕЙС ДЛЯ ВСЕХ' : isJackpotFinish && !jackpotFinished ? isTieBreaker ? 'НИЧЬЯ · ДЖЕКПОТ ВРАЩАЕТСЯ · ВЫБИРАЕМ ПОБЕДИТЕЛЯ' : 'ДЖЕКПОТ ВРАЩАЕТСЯ · ВЫБИРАЕМ ПОБЕДИТЕЛЯ' : 'РАУНД ЗАВЕРШЁН'}</span><b>{isOpening ? `${decisive ? 'РЕШАЮЩИЙ · ' : ''}РАУНД ${activeRound + 1} / ${maxDrops}` : isTieBreaker ? 'НИЧЬЯ · ФИНАЛЬНЫЙ РОЗЫГРЫШ' : 'ВСЕ КЕЙСЫ ОТКРЫТЫ'}</b></div>
    <div className="battle-active-case">{activeCase && <><img src={activeCase.image} alt=""/><div><small>{isOpening ? 'СЕЙЧАС ОТКРЫВАЕМ' : 'ПОСЛЕДНИЙ ОТКРЫТЫЙ КЕЙС'}</small><b>{activeCase.name}</b></div>{decisive && <strong>🔥 РЕШАЮЩИЙ</strong>}</>}</div>
    <div className="battle-arena">{rounds.map((round, playerIndex) => {
      const drop = round.drops[activeRound]; const visible = !isOpening && drop;
      return <article className={`player-color-${playerIndex % 4} ${finale && winnerKnown && playerIndex === results.winnerIndex ? 'winner' : ''} ${isOpening ? 'spinning' : ''} ${decisive ? 'decisive' : ''}`} key={`${round.player.username}-${playerIndex}`}>
        <header><span>{round.player.avatar || '🐷'}</span><div><b>{round.player.username}</b><small>{playerIndex === results.winnerIndex && finale && winnerKnown ? 'ЗАБИРАЕТ БАНК' : decisive ? 'решающий раунд' : `игрок ${playerIndex + 1}`}</small></div><strong>{coins(scoreTo(round, visibleDrops))} SC</strong></header>
        <div className="battle-case-reel" style={{ '--reel-duration': `${spinMs}ms` } as React.CSSProperties}>
          {isOpening && drop ? <CaseReel key={`${battle.id}-${activeRound}-${playerIndex}`} pool={reelPool.length ? reelPool : [drop.item]} winner={drop.item} phase="spinning" compact/> : visible ? <div className="battle-winning-card"><img src={drop.item.image} alt=""/><b>{drop.item.name}</b><em>{coins(drop.value)} SC</em></div> : <div className="battle-rolling-card"><span>📦</span><b>ГОТОВИМ СЛЕДУЮЩИЙ КЕЙС</b><i/></div>}
        </div>
        <div className="battle-history">{round.drops.slice(0, visibleDrops).map((pastDrop, index) => <span key={`${pastDrop.item.id}-${index}`} title={pastDrop.item.name}><img src={pastDrop.item.image} alt=""/><em>{coins(pastDrop.value)}</em></span>)}</div>
      </article>
    })}</div>
    {stage === 'finale' && isJackpotFinish && <div className={`battle-jackpot-finale ${jackpotFinished ? 'finished' : 'spinning'}`} style={{ '--jackpot-duration': `${jackpotMs}ms` } as React.CSSProperties} aria-label="Финальный джекпот">
      <div className="battle-jackpot-head"><span>🎰</span><div><small>{isTieBreaker ? 'НИЧЬЯ · ФИНАЛЬНЫЙ РОЗЫГРЫШ' : 'ФИНАЛЬНЫЙ РОЗЫГРЫШ'}</small><b>Джекпот банка</b></div><em>{isTieBreaker ? 'В джекпоте только игроки с одинаковым результатом' : 'Шанс зависит от стоимости всех дропов'}</em></div><div className="battle-jackpot-players">{jackpotPlayerIndexes.map((playerIndex) => { const round = rounds[playerIndex]; const percent = Math.max(1, round.total) / jackpotTotal * 100; return <span className={`ticket-${playerIndex % 4} ${jackpotFinished && playerIndex === results.winnerIndex ? 'winner' : ''}`} key={round.player.username}><i>{round.player.avatar || '🐷'}</i><b>{round.player.username}</b><em>{percent.toFixed(0)}%</em></span> })}</div>
      <i className="jackpot-pointer">▼</i><div className="battle-jackpot-reel"><div className="battle-jackpot-rail" style={{ '--jackpot-start': `-${jackpotStart * 76 + 38}px`, '--jackpot-end': `-${jackpotTarget * 76 + 38}px` } as React.CSSProperties}>{jackpotEntries.map((playerIndex, index) => { const round = rounds[playerIndex]; const percent = Math.max(1, round.total) / jackpotTotal * 100; return <span className={`jackpot-ticket ticket-${playerIndex % 4} ${playerIndex === results.winnerIndex ? 'winner-ticket' : ''}`} key={`${playerIndex}-${index}`}><b>{round.player.avatar || '🐷'}</b><small>{percent.toFixed(0)}%</small></span> })}</div></div>{jackpotFinished ? <strong>🏆 {winner.player.username} забирает весь банк · все скины уже в инвентаре</strong> : <small className="battle-jackpot-note">Лента замедляется — стрелка выберет получателя банка</small>}</div>}
    {stage === 'finale' && !isJackpotFinish && finale && <div className="battle-winner-banner">🏆 Победитель: <b>{winner.player.username}</b> · весь дроп уже в инвентаре</div>}
  </div>
}

function BattleWaitingRoom({ battle, busy, onAddBot }: { battle: Battle; busy: boolean; onAddBot: () => void }) {
  const slots = Array.from({ length: battle.playerLimit }, (_, index) => battle.players[index]);
  return <div className="battle-waiting-room">
    <div className="battle-waiting-cases">{battle.cases.map((item, index) => <div key={`${item.id}-${index}`}><small>РАУНД {index + 1}</small><img src={item.image} alt=""/><b>{item.name}</b></div>)}</div>
    <div className="battle-waiting-slots">{slots.map((player, index) => player ? <article className="filled" key={player.id}><span>{player.avatar || '🐷'}</span><div><small>ИГРОК {index + 1}</small><b>{player.username}</b></div><em>ГОТОВ</em></article> : <article className="empty" key={`slot-${index}`}><span>🐷</span><div><small>СВОБОДНОЕ МЕСТО</small><b>Ждём игрока или бота</b></div>{battle.isMine && <button className="login" disabled={busy} onClick={onAddBot}>{busy ? 'Добавляем…' : '+ Свинобот'}</button>}</article>)}</div>
    <div className="battle-waiting-note"><span>🐽</span><div><b>Баттл создан — ты уже в комнате</b><small>Добавь свиноботов или дождись игроков. Когда места заполнятся, кейсы автоматически начнут крутиться у всех.</small></div>{battle.private && <em>Код: <strong>{battle.inviteCode}</strong></em>}</div>
  </div>
}

function BattlePage({ token, cases, user, onRequireAuth, onBalance, toast }: { token: string; cases: Case[]; user: User | null; onRequireAuth: () => void; onBalance: () => void; toast: (text: string) => void }) {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<Battle['mode']>('NORMAL');
  const [players, setPlayers] = useState(2);
  const [privateBattle, setPrivateBattle] = useState(false);
  const [fastBattle, setFastBattle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState<Battle | null>(null);
  const load = () => { if (token) request('/api/battles', token).then(setBattles).catch(() => undefined) };
  useEffect(() => { load(); const timer = window.setInterval(load, 3500); return () => window.clearInterval(timer) }, [token]);
  useEffect(() => { if (!watching) return; const fresh = battles.find((battle) => battle.id === watching.id); if (fresh && fresh !== watching) setWatching(fresh) }, [battles, watching]);
  const create = async () => {
    if (!user) return onRequireAuth();
    if (!picked.length) return toast('Добавь хотя бы один кейс в баттл.');
    setBusy(true);
    try { const created = await request('/api/battles', token, { method: 'POST', body: JSON.stringify({ caseIds: picked, mode, playerLimit: players, private: privateBattle, fast: fastBattle }) }) as Battle; setPicked([]); setWatching(created); await onBalance(); load(); toast('Баттл создан — добавь бота или дождись игроков.') }
    catch (error) { toast(error instanceof Error ? error.message : 'Не удалось создать баттл') }
    finally { setBusy(false) }
  };
  const action = async (id: string, actionName: 'join' | 'bot') => { if (!user) return onRequireAuth(); try { const updated = await request(`/api/battles/${id}/${actionName}`, token, { method: 'POST' }) as Battle; if (actionName === 'bot' || watching?.id === id) setWatching(updated); await onBalance(); load() } catch (error) { toast(error instanceof Error ? error.message : 'Действие не выполнено') } };
  const selectedCost = picked.reduce((sum, id) => sum + (cases.find((item) => item.id === id)?.price || 0), 0);
  return <section className="page compact-page battle-page">
    <div className="page-title left"><p className="eyebrow">CASE BATTLE · SERVER VERIFIED</p><h1>Кейс <strong>баттлы</strong></h1><p>Добавляй один и тот же кейс несколько раз: каждая иконка — отдельный раунд для всех игроков.</p></div>
    <div className="battle-layout"><section className="battle-builder"><div className="battle-top"><h2>Создание баттла</h2><div className="battle-top-toggles"><label className="private-toggle"><input type="checkbox" checked={privateBattle} onChange={(event) => setPrivateBattle(event.target.checked)}/> Приватный</label><label className="private-toggle fast-toggle"><input type="checkbox" checked={fastBattle} onChange={(event) => setFastBattle(event.target.checked)}/> ⚡ Быстрый</label></div></div><div className="battle-mode-row">{(Object.keys(battleLabels) as Battle['mode'][]).map((entry) => <button key={entry} className={`${mode === entry ? 'chosen' : ''} ${entry === 'LAST' ? 'last-mode-choice' : ''}`} onClick={() => setMode(entry)}><b>{entry === 'LAST' ? '🔥 ' : ''}{battleLabels[entry]}</b><small>{entry === 'NORMAL' ? 'Больше — победа' : entry === 'CURSED' ? 'Меньше — победа' : entry === 'JACKPOT' ? 'Шанс по сумме' : 'Решает последний'}</small></button>)}</div><div className="battle-player-row"><span>Игроков</span>{[2,3,4].map((count) => <button className={players === count ? 'chosen' : ''} key={count} onClick={() => setPlayers(count)}>{count}</button>)}<b>Вход: {coins(selectedCost)} SC</b></div><div className="battle-case-picker">{cases.slice(0,24).map((item) => { const count = picked.filter((id) => id === item.id).length; return <button key={item.id} className={count ? 'picked' : ''} onClick={() => setPicked((current) => current.length < 12 ? [...current, item.id] : current)}><img src={item.image} alt=""/>{count > 0 && <i>×{count}</i>}<span>{item.name}</span><b>{coins(item.price)} SC</b></button> })}</div><div className="battle-selected-cases">{picked.map((id, index) => { const item = cases.find((entry) => entry.id === id); return item ? <button key={`${id}-${index}`} title="Убрать этот раунд" onClick={() => setPicked((current) => current.filter((_, itemIndex) => itemIndex !== index))}><img src={item.image} alt=""/><span>{index + 1}</span><b>×</b></button> : null })}</div><div className="battle-builder-footer"><small>Добавлено кейсов: {picked.length}/12 · нажми иконку кейса ещё раз, чтобы повторить его</small><button className="pig-button" disabled={busy || !picked.length} onClick={create}>{busy ? 'Создаём…' : 'Создать баттл →'}</button></div></section>
    <section className="battle-list"><div className="section-heading"><div><p className="eyebrow">LIVE BATTLES</p><h2>Комнаты</h2></div><span>{battles.length} активно</span></div>{battles.length ? battles.map((battle) => <article className="battle-room" key={battle.id}><div className="battle-room-head"><span>⚔</span><div><b>{battleLabels[battle.mode]} баттл</b><small>{battle.players.length}/{battle.playerLimit} игроков · {battle.private ? 'приватный' : 'публичный'}</small></div><em>{battle.status === 'FINISHED' ? 'ЗАВЕРШЁН' : 'ОЖИДАНИЕ'}</em></div><div className="battle-case-strip">{battle.cases.map((item, index) => <img key={`${item.id}-${index}`} src={item.image} title={`${index + 1}. ${item.name}`} />)}</div><div className="battle-players">{battle.players.map((player) => <span key={player.id}>{player.avatar || '🐷'} {player.username}</span>)}</div>{battle.results && <button className="battle-watch" onClick={() => setWatching(battle)}>Смотреть открытие →</button>} {battle.status === 'WAITING' && <div className="battle-actions">{!battle.isMine && <button className="pig-button" onClick={() => action(battle.id,'join')}>Войти</button>}{battle.isMine && battle.players.length < battle.playerLimit && <button className="login" onClick={() => action(battle.id,'bot')}>+ Свинобот</button>}{battle.isMine && battle.private && <small>Код: <b>{battle.inviteCode}</b></small>}</div>}</article>) : <div className="empty-feed">Пока нет баттлов — создай первый.</div>}</section></div>
    {watching && <div className="modal-backdrop battle-modal-backdrop"><section className="case-modal battle-modal"><button className="close" onClick={() => setWatching(null)}>×</button><div className={`battle-modal-head ${watching.mode === 'LAST' ? 'last-mode-head' : ''}`}><span>{watching.mode === 'LAST' ? '🔥' : '⚔️'}</span><div><p className="eyebrow">CASE BATTLE · SERVER VERIFIED</p><h2>{watching.mode === 'LAST' ? 'РЕШАЮЩИЙ · ' : ''}{battleLabels[watching.mode]} баттл</h2><p>{watching.results ? 'Один и тот же кейс крутится у всех игроков в каждом раунде.' : 'Добавь свиноботов — после заполнения комнаты прокрутка начнётся сама.'}</p></div><b>{watching.players.length} <small>ИГРОКА</small></b></div>{watching.results ? <BattleShowcase battle={watching}/> : <BattleWaitingRoom battle={watching} busy={busy} onAddBot={() => action(watching.id, 'bot')}/>}</section></div>}
  </section>
}

type FleetShip = { id: string; size: number; x: number; y: number; vertical: boolean }
const fleetSizes = [3, 2, 2, 1, 1]
const emptyFleet = (): FleetShip[] => fleetSizes.map((size, index) => ({ id: `fleet-${index}`, size, x: -1, y: -1, vertical: size > 1 }))
const shipCells = (ship: FleetShip) => ship.x < 0 || ship.y < 0 ? [] : Array.from({ length: ship.size }, (_, index) => ({ x: ship.x + (ship.vertical ? 0 : index), y: ship.y + (ship.vertical ? index : 0) }))
const fleetCells = (fleet: FleetShip[]) => fleet.flatMap(shipCells)
function canPlaceShip(fleet: FleetShip[], candidate: FleetShip) { const cells = shipCells(candidate); if (cells.length !== candidate.size || cells.some((cell) => cell.x < 0 || cell.x > 7 || cell.y < 0 || cell.y > 7)) return false; const others = fleet.filter((ship) => ship.id !== candidate.id).flatMap(shipCells); return cells.every((cell) => others.every((occupied) => Math.abs(cell.x - occupied.x) > 1 || Math.abs(cell.y - occupied.y) > 1)) }
function randomFleet() { const fleet: FleetShip[] = []; for (const [index, size] of fleetSizes.entries()) { let placed = false; for (let attempt = 0; attempt < 700 && !placed; attempt += 1) { const vertical = size > 1 && Math.random() > .5; const candidate = { id: `fleet-${index}`, size, vertical, x: Math.floor(Math.random() * (vertical ? 8 : 9 - size)), y: Math.floor(Math.random() * (vertical ? 9 - size : 8)) }; if (canPlaceShip(fleet, candidate)) { fleet.push(candidate); placed = true } } } return fleet.length === fleetSizes.length ? fleet : emptyFleet() }
type PlacementHint = { x: number; y: number; valid: boolean }
function NavalBoard({ ships = [], shots = [], enemy, disabled, onCell, onDropCell, placementHints = [] }: { ships?: { x: number; y: number }[]; shots?: NavalShot[]; enemy?: boolean; disabled?: boolean; onCell?: (x: number, y: number) => void; onDropCell?: (x: number, y: number, shipId: string) => void; placementHints?: PlacementHint[] }) { return <div className={`naval-board naval-board-8 ${enemy ? 'enemy' : ''}`}>{Array.from({ length: 64 }, (_, index) => { const x = index % 8; const y = Math.floor(index / 8); const ship = ships.some((cell) => cell.x === x && cell.y === y); const shot = shots.find((cell) => cell.x === x && cell.y === y); const hint = placementHints.find((cell) => cell.x === x && cell.y === y); return <button aria-label={hint ? `${String.fromCharCode(65 + y)}${x + 1}: ${hint.valid ? 'можно поставить' : 'нельзя поставить'}` : undefined} disabled={disabled || !!shot} className={`${ship && !enemy ? 'ship' : ''} ${hint?.valid ? 'place-ok' : hint ? 'place-no' : ''} ${shot?.hit ? 'hit' : shot ? 'miss' : ''} ${shot?.blocked ? 'blocked' : ''} ${shot?.sunk ? 'sunk' : ''}`} key={`${x}:${y}`} onDragOver={(event) => { if (onDropCell) event.preventDefault() }} onDrop={(event) => { const shipId = event.dataTransfer.getData('text/plain'); if (shipId) onDropCell?.(x, y, shipId) }} onClick={() => onCell?.(x,y)}>{ship && !enemy && !shot ? <i>⚓</i> : shot?.hit ? '✹' : shot?.blocked ? '•' : shot ? '·' : hint?.valid ? '•' : ''}</button> })}</div> }
function NavalPage({ token, user, onRequireAuth, onBalance, toast }: { token: string; user: User | null; onRequireAuth: () => void; onBalance: () => void; toast: (text: string) => void }) {
  const [games, setGames] = useState<any[]>([]); const [current, setCurrent] = useState<NavalGame | null>(null); const [savedGameId, setSavedGameId] = useState(() => localStorage.getItem('svino-naval-game') || ''); const [stake, setStake] = useState('100'); const [fleet, setFleet] = useState<FleetShip[]>(emptyFleet); const [selectedShipId, setSelectedShipId] = useState('fleet-0'); const [clockNow, setClockNow] = useState(Date.now());
  const load = async () => { if (!token) return; try { const list = await request('/api/naval/games', token); setGames(list); if (current) setCurrent(await request(`/api/naval/${current.id}`, token)) } catch { undefined } };
  useEffect(() => { load(); const timer = window.setInterval(load, 2500); return () => window.clearInterval(timer) }, [token, current?.id]);
  useEffect(() => { const timer = window.setInterval(() => setClockNow(Date.now()), 1000); return () => window.clearInterval(timer) }, []);
  useEffect(() => { if (!token || !savedGameId || current) return; request(`/api/naval/${savedGameId}`, token).then(setCurrent).catch(() => { localStorage.removeItem('svino-naval-game'); setSavedGameId('') }) }, [token, savedGameId, current]);
  useEffect(() => { if (current?.id && current.status !== 'FINISHED') { localStorage.setItem('svino-naval-game', current.id); setSavedGameId(current.id) } else if (current?.status === 'FINISHED') { localStorage.removeItem('svino-naval-game'); setSavedGameId('') } }, [current?.id, current?.status]);
  const resume = async () => { if (!savedGameId) return; try { setCurrent(await request(`/api/naval/${savedGameId}`, token)) } catch { localStorage.removeItem('svino-naval-game'); setSavedGameId(''); toast('Эта игра уже недоступна') } };
  const create = async () => { if (!user) return onRequireAuth(); try { const data = await request('/api/naval', token, { method: 'POST', body: JSON.stringify({ stake: Math.round(Number(stake) * 100) }) }); setFleet(emptyFleet()); setSelectedShipId('fleet-0'); setCurrent(data); await onBalance(); load() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось создать игру') } };
  const join = async (id: string) => { if (!user) return onRequireAuth(); try { const data = await request(`/api/naval/${id}/join`, token, { method: 'POST' }); setFleet(emptyFleet()); setSelectedShipId('fleet-0'); setCurrent(data); await onBalance(); load() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось войти') } };
  const ready = async () => { if (!current) return; if (fleetCells(fleet).length !== 9) return toast('Сначала расставь все 9 клеток короткого флота.'); try { setCurrent(await request(`/api/naval/${current.id}/ships`, token, { method: 'POST', body: JSON.stringify({ ships: fleetCells(fleet) }) })); load() } catch (error) { toast(error instanceof Error ? error.message : 'Проверь расстановку кораблей') } };
  const shot = async (x: number, y: number) => { if (!current) return; try { setCurrent(await request(`/api/naval/${current.id}/shot`, token, { method: 'POST', body: JSON.stringify({ x, y }) })); await onBalance(); load() } catch (error) { toast(error instanceof Error ? error.message : 'Выстрел не прошёл') } };
  const moveShip = (id: string, x: number, y: number) => setFleet((currentFleet) => { const ship = currentFleet.find((entry) => entry.id === id); if (!ship) return currentFleet; const candidate = { ...ship, x, y }; return canPlaceShip(currentFleet, candidate) ? currentFleet.map((entry) => entry.id === id ? candidate : entry) : currentFleet });
  const placeSelected = (x: number, y: number) => { const ship = fleet.find((entry) => entry.id === selectedShipId); if (!ship) return; if (!canPlaceShip(fleet, { ...ship, x, y })) return toast('Сюда нельзя: корабли не должны касаться друг друга и края за пределами поля.'); moveShip(selectedShipId, x, y) };
  const rotateShip = () => setFleet((currentFleet) => { const ship = currentFleet.find((entry) => entry.id === selectedShipId); if (!ship || ship.size === 1) return currentFleet; const vertical = !ship.vertical; if (ship.x < 0 || ship.y < 0) return currentFleet.map((entry) => entry.id === ship.id ? { ...entry, vertical } : entry); const candidate = { ...ship, vertical, x: Math.min(ship.x, vertical ? 7 : 8 - ship.size), y: Math.min(ship.y, vertical ? 8 - ship.size : 7) }; return canPlaceShip(currentFleet, candidate) ? currentFleet.map((entry) => entry.id === ship.id ? candidate : entry) : currentFleet });
  const lastShot = current?.opponent?.shots.filter((shot) => !shot.blocked).at(-1) || null; const mineLastShot = current?.mine.shots.filter((shot) => !shot.blocked).at(-1) || null; const selectedShip = fleet.find((ship) => ship.id === selectedShipId); const placementHints = current?.status === 'SETUP' && !current.mine.ready && selectedShip ? Array.from({ length: 64 }, (_, index) => { const x = index % 8; const y = Math.floor(index / 8); return { x, y, valid: canPlaceShip(fleet, { ...selectedShip, x, y }) } }) : []; const secondsLeft = current?.turnEndsAt ? Math.max(0, Math.ceil((new Date(current.turnEndsAt).getTime() - clockNow) / 1000)) : 30;
  return <section className="page compact-page naval-page">
    <div className="page-title left"><p className="eyebrow">PIGGY NAVAL · 1V1 ONLINE</p><h1>Морской <strong>бой</strong></h1><p>Собери флот с пустого поля, расставь его без касаний и забери виртуальный банк ×2.</p></div>
    {!current ? <div className="naval-lobby">
      <section className="naval-create"><h2>Создать игру</h2><label>Ставка, SC<input type="number" min="100" max="500000" value={stake} onChange={(event) => setStake(event.target.value)}/></label><small>Минимум 100 · максимум 500 000 SC. Победитель получает ×2.</small><button className="pig-button" onClick={create}>Создать стол →</button></section>
      <section className="naval-rooms"><h2>Открытые столы</h2>{savedGameId && <button className="pig-button naval-return" onClick={resume}>↩ Вернуться в свою игру</button>}{games.length ? games.map((game) => <article key={game.id}><span>⚓</span><div><b>{game.players?.[0]?.user?.username || 'Свинка'}</b><small>Ставка {coins(game.stake)} SC · ожидание соперника</small></div><button className="login" onClick={() => join(game.id)}>Войти</button></article>) : <div className="empty-feed">Свободных столов пока нет.</div>}</section>
    </div> : <section className="naval-game">
      <div className="naval-status"><b>{current.status === 'WAITING' ? 'Ждём соперника…' : current.status === 'SETUP' ? 'Расставьте короткий флот' : current.status === 'FINISHED' ? current.winnerUserId === user?.id ? 'ПОБЕДА · банк зачислен!' : 'Игра завершена' : current.turnUserId === user?.id ? `Твой ход · ${secondsLeft} сек.` : `Ход соперника · ${secondsLeft} сек.`}</b><span>Банк: {coins(current.stake * 2)} SC</span><button className="login" onClick={() => setCurrent(null)}>К столам</button></div>
      {current.status === 'FINISHED' && <div className={`naval-finish-modal ${current.winnerUserId === user?.id ? 'victory' : 'defeat'}`}><span>{current.winnerUserId === user?.id ? '🏆' : '⚓'}</span><p className="eyebrow">МОРСКОЙ БОЙ ЗАВЕРШЁН</p><h2>{current.winnerUserId === user?.id ? 'Победа!' : 'Бой завершён'}</h2><p>{current.winnerUserId === user?.id ? `Ты уничтожил весь флот и забрал ${coins(current.stake * 2)} SC.` : 'Все корабли уничтожены. В следующий раз свинки возьмут реванш!'}</p><button className="pig-button" onClick={() => setCurrent(null)}>К столам →</button></div>}
      {current.status === 'WAITING' ? <div className="empty-feed">Поделись столом — второй игрок появится здесь автоматически.</div> : <div className="naval-fields">
        <div><h3>Твой флот</h3>
          <NavalBoard ships={current.mine.ready ? current.mine.ships : fleetCells(fleet)} shots={current.mine.shots} disabled={current.mine.ready || current.status !== 'SETUP'} placementHints={placementHints} onCell={placeSelected} onDropCell={(x, y, shipId) => { setSelectedShipId(shipId); moveShip(shipId, x, y) }}/>
          {!current.mine.ready && <>
            <div className="fleet-dock">{fleet.map((ship) => <button draggable key={ship.id} className={`${selectedShipId === ship.id ? 'selected' : ''} ${shipCells(ship).length ? 'placed' : 'unplaced'}`} onDragStart={(event) => event.dataTransfer.setData('text/plain', ship.id)} onClick={() => setSelectedShipId(ship.id)}><span>{Array.from({ length: ship.size }, (_, index) => <i key={index}/>)}</span><b>×{ship.size}</b><small>{shipCells(ship).length ? 'на поле' : 'выбрать'}</small></button>)}</div>
            <div className="fleet-actions"><button className="login" disabled={selectedShip?.size === 1} onClick={rotateShip}>↻ Повернуть</button><button className="login" onClick={() => { setFleet(emptyFleet()); setSelectedShipId('fleet-0') }}>Очистить поле</button><button className="login" onClick={() => { const mixed = randomFleet(); setFleet(mixed); setSelectedShipId(mixed[0].id) }}>↻ Расставить случайно</button><button className="pig-button" disabled={fleetCells(fleet).length !== 9} onClick={ready}>Готово · {fleetCells(fleet).length}/9</button></div>
          </>}
          {mineLastShot && <div className={`naval-shot-info ${mineLastShot.hit ? 'hit' : 'miss'}`}>{mineLastShot.sunk ? '💥 ТВОЙ КОРАБЛЬ УНИЧТОЖЕН · КЛЕТКИ ВОКРУГ ОТМЕЧЕНЫ' : mineLastShot.hit ? '🎯 СОПЕРНИК ПОПАЛ В ТВОЙ КОРАБЛЬ' : '🌊 СОПЕРНИК ПРОМАХНУЛСЯ'}</div>}<small className="naval-hint naval-placement-hint"><b>1.</b> Выбери корабль снизу. <b className="hint-green">Зелёные</b> клетки подходят, <b className="hint-red">розовые</b> — нет. <b>2.</b> Кликни по зелёной клетке или перетащи корабль; поворот — отдельной кнопкой.</small>
        </div>
        <div><h3>{current.opponent?.username || 'Соперник'}</h3><NavalBoard enemy shots={current.opponent?.shots || []} disabled={current.status !== 'PLAYING' || current.turnUserId !== user?.id} onCell={shot}/>{lastShot && <div className={`naval-shot-info ${lastShot.hit ? 'hit' : 'miss'}`}>{lastShot.sunk ? '💥 Корабль уничтожен! Клетки вокруг отмечены точками.' : lastShot.hit ? '🎯 Попадание — стреляй ещё!' : '🌊 Мимо — ход соперника'}</div>}<small className="naval-hint">Корабли противника скрыты. ✹ — попадание, · — мимо, • — клетка рядом с уничтоженным кораблём.</small></div>
      </div>}
    </section>}
  </section>
}
/* Removed casino wheel implementation; it is not compiled or exposed.
  const [target, setTarget] = useState(2)
  const [amount, setAmount] = useState('100')
  const segments = [
    ...Array(22).fill({ value: 2, color: '#ff4ea9' }), ...Array(11).fill({ value: 3, color: '#7d6dff' }), ...Array(7).fill({ value: 5, color: '#4daaff' }), ...Array(5).fill({ value: 8, color: '#52e6a0' }), ...Array(3).fill({ value: 10, color: '#ffd15d' }), ...Array(2).fill({ value: 20, color: '#ff8d51' }), { value: 30, color: '#ff4b68' },
  ] as { value: number; color: string }[]
  const slice = 360 / segments.length
  const gradient = `conic-gradient(${segments.map((entry, index) => `${entry.color} ${index * slice}deg ${(index + 1) * slice}deg`).join(',')})`
  const now = Date.now(); const round = state?.current
  const seconds = round ? Math.max(0, Math.ceil(((round.status === 'BETTING' ? new Date(round.bettingClosesAt) : new Date(round.settlesAt)).getTime() - now) / 1000)) : 0
  const betting = round?.status === 'BETTING'
  const wager = Math.round(Number(amount || 0) * 100)
  const valid = state && wager >= state.limits.min && wager <= state.limits.max && wager <= balance
  return <section className="page wheel-page"><div className="wheel-heading"><div><p className="eyebrow">PIGGY LUCK · РАУНД КАЖДЫЕ 15 СЕКУНД</p><h1>Свинячье <strong>колесо</strong></h1><p>Угадай цвет. Когда он выпадет, бонус-барабан умножит твою ставку.</p></div><div className={`wheel-clock ${betting ? '' : 'spinning'}`}><span>{betting ? 'СТАВКИ' : 'КРУТИМ'}</span><b>{seconds}</b><small>сек.</small></div></div><div className="wheel-layout"><section className="wheel-stage"><div className="wheel-note"><span>🐷</span> {betting ? 'Выбери цвет до сигнала' : 'Ставки закрыты · барабаны крутятся'}</div><div className="wheel-machines"><div className="pig-wheel-shell"><div className="wheel-pointer">▼</div><div key={`${round?.id || 'warm'}-${round?.status || ''}`} className={`pig-wheel ${round?.status === 'SPINNING' ? 'spinning' : ''}`} style={{ background: gradient }}><div className="wheel-rim"/><div className="wheel-core"><span>🐽</span><b>{round?.status === 'SPINNING' ? `×${round.targetMultiplier || '?'}` : 'УГАДАЙ'}</b><small>{round?.status === 'SPINNING' ? 'ВЫПАВШИЙ ЦВЕТ' : 'СВОЙ ЦВЕТ'}</small></div></div></div><div className="bonus-machine"><span className="bonus-arrow">▼</span><div key={`${round?.id || 'warm'}-${round?.status || ''}`} className={`bonus-drum ${round?.status === 'SPINNING' ? 'spinning' : ''}`}><span>🎁</span><b>{round?.status === 'SPINNING' ? `×${round.bonusMultiplier || '?'}` : '×?'}</b><small>БОНУС</small></div><p>Выплата = ставка × бонус</p></div></div><div className="wheel-legend">{Object.entries(state?.targets || {}).map(([value, count]) => <span className={`legend-x x-${value}`} key={value}>×{value}<small>{count} цветов</small></span>)}</div></section><aside className="wheel-bet-panel"><p className="eyebrow">ПОСТАВИТЬ НА ЦВЕТ</p><h2>Твоя свиная ставка</h2><div className="wheel-targets">{[2, 3, 5, 8, 10, 20, 30].map((value) => <button key={value} className={`${target === value ? 'selected' : ''} wheel-target x-${value}`} disabled={!betting} onClick={() => setTarget(value)}><b>×{value}</b><small>{state?.targets[String(value)] || 0} ячеек</small></button>)}</div><label className="wheel-amount">Ставка, SC<input type="number" min="100" max="100000" value={amount} disabled={!betting} onChange={(event) => setAmount(event.target.value)}/><div><button onClick={() => setAmount('100')}>MIN</button><button onClick={() => setAmount(String(Math.min(100000, Math.floor(balance / 200))))}>50%</button><button onClick={() => setAmount(String(Math.min(100000, Math.floor(balance / 100))))}>MAX</button></div></label><p className="wheel-balance">Баланс: <b>{coins(balance)} SC</b></p><button className="pig-button wheel-bet" disabled={!betting || !valid} onClick={() => onBet(target, wager)}>{betting ? `ПОСТАВИТЬ ${coins(wager)} SC НА ×${target}` : 'БАРАБАНЫ КРУТЯТСЯ…'} →</button>{state?.myBets.length ? <div className="my-wheel-bets"><small>ТВОИ СТАВКИ В ЭТОМ РАУНДЕ</small>{state.myBets.map((bet) => <span key={bet.id}>×{bet.targetMultiplier} · {coins(bet.amount)} SC</span>)}</div> : <p className="wheel-hint">Минимум 100 SC · максимум 100 000 SC</p>}</aside></div><section className="wheel-history"><div><p className="eyebrow">ПОСЛЕДНИЕ РАУНДЫ</p><h2>История множителей</h2></div><div className="history-list">{state?.history.length ? state.history.map((entry) => <article key={entry.id}><span className={`history-color x-${entry.targetMultiplier}`}>×{entry.targetMultiplier}</span><b>Бонус ×{entry.bonusMultiplier}</b><small>{entry.settledAt ? new Date(entry.settledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</small></article>) : <div className="empty-feed">Колесо разогревается…</div>}</div></section></section> }
*/
function EmptyInventory({ onClick }: { onClick: () => void }) { return <div className="empty-inventory"><span>🐷</span><h2>ТВОЯ СВИНКА ПОКА ПУСТА</h2><p>Открой первый кейс и начни коллекцию!</p><button className="pig-button" onClick={onClick}>Открыть кейсы →</button></div> }
function PromoForm({ onSubmit }: { onSubmit: (code: string) => void }) { const [value, setValue] = useState(''); return <form className="promo-form" onSubmit={(event) => { event.preventDefault(); if (value) onSubmit(value) }}><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Введите промокод"/><button>АКТИВИРОВАТЬ</button></form> }
function ChatForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (message: string) => void }) { const [value, setValue] = useState(''); return <form className="chat-form" onSubmit={(event) => { event.preventDefault(); if (value && !disabled) { onSubmit(value); setValue('') } }}><input disabled={disabled} value={value} onChange={(event) => setValue(event.target.value)} placeholder={disabled ? 'Войди, чтобы писать в чат' : 'Напиши что-нибудь стае...'}/><button disabled={disabled}>Отправить ↑</button></form> }
function AuthModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (email: string, password: string, username?: string) => Promise<void> }) { const [register, setRegister] = useState(false); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [username, setUsername] = useState(''); const [error, setError] = useState(''); return <div className="modal-backdrop"><form className="auth-modal" onSubmit={async (event) => { event.preventDefault(); try { await onSubmit(email, password, register ? username : undefined) } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка') } }}><button className="close" type="button" onClick={onClose}>×</button><div className="auth-pig">🐷</div><p className="eyebrow">СВИНОПРОПУСК</p><h2>{register ? 'Вступить в стаю' : 'С возвращением!'}</h2>{register && <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Никнейм" required/>}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required/><input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль (от 8 символов)" required/>{error && <p className="form-error">{error}</p>}<button className="pig-button">{register ? 'Создать аккаунт' : 'Войти'} →</button><button type="button" className="text-button" onClick={() => { setRegister(!register); setError('') }}>{register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Вступить в стаю'}</button></form></div> }
function UpgradeDial({ chance, phase, result, mode, showPigOrbit }: { chance: number; phase: 'idle' | 'spinning' | 'result'; result: { success: boolean; landingAngle: number } | null; mode: SpinMode; showPigOrbit: boolean }) {
  const safeChance = Math.max(2, chance || 2)
  // The arrow itself moves; the green success segment is fixed below.
  // The final angle is decided by the server result before this animation begins.
  const endAngle = result?.landingAngle || 0
  // Do not attach an outcome class while the arrow is moving: a green centre
  // used to reveal a win before the animation had finished.
  const outcomeClass = phase === 'result' ? (result?.success ? 'success' : 'failure') : ''
  return <div className={`sd-upgrade ${phase} ${result ? 'ready' : ''} ${outcomeClass}`} style={{ '--success-size': `${safeChance * 3.6}deg`, '--needle-end': `${endAngle}deg`, '--motion-duration': `${spinDuration[mode]}ms` } as React.CSSProperties}>
    <div className="sd-upgrade-disc"><div className="sd-ticks"/><div className="sd-core"><span className="sd-snout">🐽</span><small>{phase === 'spinning' ? 'СТРЕЛКА В ПОЛЁТЕ' : phase === 'result' ? (result?.success ? 'СОЧНОЕ ПОПАДАНИЕ' : 'БЕКОН УСКОЛЬЗНУЛ') : 'ТВОЙ ШАНС'}</small><b>{phase === 'result' ? (result?.success ? 'WIN' : 'FAIL') : `${safeChance}%`}</b><em>SVINO LUCK</em></div></div>
    {showPigOrbit && <div className="sd-pig-halo" aria-hidden="true"><div className="sd-pig-orbit"><i>🐷</i><i>🐽</i><i>🐷</i><i>🐽</i></div></div>}
    <div className="sd-needle"><i/></div>
  </div>
}

function CaseReel({ pool, winner, phase, compact, onFinished }: { pool: Skin[]; winner?: Skin; phase: 'idle' | 'spinning' | 'result'; compact?: boolean; onFinished?: () => void }) {
  const reel = winner ? Array.from({ length: 36 }, (_, index) => index === 20 ? winner : pool[(index * 7 + 3) % Math.max(pool.length, 1)]).filter(Boolean) as Skin[] : pool.slice(0, 12)
  const state = phase === 'spinning' && winner ? 'rolling' : phase === 'result' && winner ? 'finished' : ''
  return <div className={`sd-case-reel ${compact ? 'compact' : ''} ${state}`}><div className="sd-case-pointer"/><div key={winner?.id || 'preview'} className={`sd-case-track ${state}`} onAnimationEnd={() => { if (phase === 'spinning' && winner) onFinished?.() }}>
    {reel.map((skin, index) => <article className={`sd-case-card ${rarity(skin.rarity)}`} key={`${skin.id}-${index}`}><img src={skin.image} alt="" onError={({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg' }}/><small>{skin.wear}</small><b>{skin.name}</b><em>{coins(skin.price)} SC</em></article>)}
  </div></div>
}

function RiskReveal({ pool, winner, phase, onFinished }: { pool: Skin[]; winner?: Skin; phase: 'idle' | 'spinning' | 'result'; onFinished: () => void }) {
  const seed = winner ? [...winner.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) : 1
  const attempts = 1 + seed % 5
  const fogSlots = 5
  const [revealed, setRevealed] = useState(0)
  useEffect(() => {
    setRevealed(0)
    if (phase !== 'spinning' || !winner) return
    const timers = Array.from({ length: attempts }, (_, index) => window.setTimeout(() => setRevealed(index + 1), (index + 1) * 980))
    const finish = window.setTimeout(onFinished, attempts * 980 + 640)
    return () => { timers.forEach(window.clearTimeout); window.clearTimeout(finish) }
  }, [phase, winner?.id, attempts])
  const distinctPool = Array.from(new Map(pool.map((skin) => [skin.id, skin])).values())
  const path = Array.from({ length: attempts }, (_, index) => (seed + index * 2) % fogSlots)
  const finalIndex = path.at(-1) || 0
  const previews = Array.from({ length: fogSlots }, (_, index) => index === finalIndex ? winner : distinctPool[(seed + index * 3) % Math.max(distinctPool.length, 1)] || winner)
  const pointerIndex = phase === 'spinning' ? path[Math.min(revealed, attempts - 1)] : finalIndex
  return <section className={`risk-reveal ${phase} ${winner ? 'ready' : 'waiting'}`} style={{ '--risk-columns': fogSlots, '--risk-pointer': `${(pointerIndex + .5) / fogSlots * 100}%` } as React.CSSProperties}>
    <div className="risk-reveal-head"><span>🎲</span><div><small>АЗАРТНАЯ ПРОВЕРКА</small><b>{winner ? 'СТРЕЛКА ВЫБИРАЕТ ЯЧЕЙКУ' : 'СВИНОСЕРВЕР ПРЯЧЕТ ПРИЗ'}</b></div></div>
    <div className="risk-question-reel"><i className="risk-pointer">▼</i><div className="risk-question-row">{previews.map((skin, index) => { const open = phase === 'result' || path.slice(0, revealed).includes(index); const final = index === finalIndex; return <article className={`${open ? 'opened' : ''} ${index === pointerIndex && phase === 'spinning' ? 'active' : ''} ${open && final ? 'final' : ''}`} key={`${skin?.id || 'question'}-${index}`}>{open && skin ? <><img src={skin.image} alt=""/><small>{final ? 'ТВОЙ ПРИЗ' : 'ЛОЖНЫЙ СЛЕД'}</small></> : <span>?</span>}</article> })}</div></div>
    <p>{phase === 'spinning' ? 'Приз может оказаться в любой ячейке — даже в первой.' : 'Барабан остановился: остальные ячейки раскрыты, а приз уже в твоём инвентаре.'}</p>
  </section>
}

function MagicReveal({ data, opening, phase, balanceReward, onFinished }: { data: Case; opening: Drop[] | null; phase: 'idle' | 'spinning' | 'result'; balanceReward: number; onFinished: () => void }) {
  const rewardCount = (opening?.length || 0) + (balanceReward > 0 ? 1 : 0)
  return <div className={`magic-reveal magic-${data.slug} ${phase}`} onAnimationEnd={(event) => { if (event.currentTarget === event.target && phase === 'spinning' && opening) onFinished() }}>
    {phase !== 'result' && <><div className="magic-spark one">✦</div><div className="magic-spark two">✧</div><div className="magic-spark three">✦</div><img src={data.image} alt=""/><div className="magic-runes">✧ ✦ ✧</div>{phase === 'idle' && <b>СОСТАВ СКРЫТ<br/><small>1–3 предмета или свинокоинов</small></b>}{phase === 'spinning' && <b>МАГИЯ ВНУТРИ…<br/><small>СВИНОЗАКЛИНАНИЕ РАБОТАЕТ</small></b>}</>}
    {phase === 'result' && <div className={`magic-rewards rewards-${Math.min(4, Math.max(1, rewardCount))}`}>{opening?.map((drop, index) => <article key={drop.inventoryId} style={{ '--delay': `${index * 160}ms` } as React.CSSProperties}><img src={drop.item.image} alt=""/><b>{drop.item.name}</b><em>{coins(drop.item.price)} SC</em></article>)}{balanceReward > 0 && <article className="magic-coins"><span>🐷</span><b>Магический баланс</b><em>+{coins(balanceReward)} SC</em></article>}</div>}
  </div>
}
function CaseModal({ data, count, setCount, opening, balanceReward, phase, mode, setMode, onFinished, onClose, onOpen, onSellDrops, sellingCaseDrops }: { data: Case; count: number; setCount: (n: number) => void; opening: Drop[] | null; balanceReward: number; phase: 'idle' | 'spinning' | 'result'; mode: SpinMode; setMode: (mode: SpinMode) => void; onFinished: () => void; onClose: () => void; onOpen: () => void; onSellDrops: () => void; sellingCaseDrops: boolean }) {
  const pool = data.items.map((entry) => entry.item)
  const magic = data.openingStyle === 'MAGIC'
  const risk = !magic && mode === 'RISK'
  const multi = (opening?.length || count) > 1
  const reels = opening?.map((drop) => drop.item) || [undefined]
  const contents = [...data.items].sort((left, right) => left.item.price - right.item.price)
  const totalWeight = data.items.reduce((sum, entry) => sum + entry.weight, 0)
  // The question path has one auditable final drop, so it deliberately opens
  // one case at a time instead of disguising several outcomes at once.
  useEffect(() => { if (risk && count !== 1) setCount(1) }, [risk, count, setCount])
  return <div className="modal-backdrop"><section className={`case-modal cinematic-case ${magic ? `magic-case magic-${data.slug}` : ''} ${phase} ${multi ? 'multi-opening' : ''} mode-${mode.toLowerCase()}`} style={{ '--reel-duration': `${spinDuration[mode]}ms` } as React.CSSProperties}>
    <button className="close" onClick={onClose} disabled={phase === 'spinning'}>×</button>
    <div className="case-modal-head"><img src={data.image} alt=""/><div><p className="eyebrow">{magic ? 'МАГИЧЕСКИЕ СВИНЬИ · SECRET DROP' : risk ? 'AZART MODE · QUESTION PATH' : 'СВИНООХОТНИКИ · SERVER DROP'}</p><h2>{data.name}</h2><p>{magic ? 'Содержимое скрыто. За одно заклинание — до трёх предметов и редкий балансный бонус.' : risk && phase === 'spinning' ? 'Приз уже защищён сервером. Сколько остановок сделает стрелка — скрыто в тумане.' : phase === 'spinning' ? 'Все результаты уже зафиксированы сервером. Ленты плавно замедляются…' : 'Состав и веса открыты: дорогие предметы встречаются реже.'}</p></div><b>{coins(data.price)} <small>SC</small></b></div>
    {magic ? <MagicReveal data={data} opening={opening} phase={phase} balanceReward={balanceReward} onFinished={onFinished}/> : <><div className="reel-status"><span className="pulse-dot"/>{phase === 'spinning' ? risk ? 'ПРОХОДИМ ВОПРОСЫ' : 'КРУТИМ РУЛЕТКУ' : phase === 'result' ? 'ДРОП РАСКРЫТ' : 'ГОТОВ К ОТКРЫТИЮ'}<em>SERVER VERIFIED</em></div>{risk ? <RiskReveal pool={pool} winner={reels[0]} phase={phase} onFinished={onFinished}/> : <div className={`case-reels ${multi ? 'multiple' : ''}`}>{reels.map((winner, index) => <CaseReel key={`${winner?.id || 'empty'}-${index}`} pool={pool} winner={winner} phase={phase} compact={multi} onFinished={index === 0 ? onFinished : undefined}/>)}</div>}{phase === 'idle' && <section className="case-contents"><div><b>СОДЕРЖИМОЕ КЕЙСА</b><span>{contents.length} предметов · от {coins(contents[0]?.item.price || 0)} до {coins(contents.at(-1)?.item.price || 0)} SC</span></div><div className="case-contents-grid">{contents.map((entry) => <article className={rarity(entry.item.rarity)} key={entry.id}><img src={entry.item.image} alt="" onError={({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg' }}/><span><b>{entry.item.name}</b><small>{entry.item.wear} · шанс {(entry.chance ?? (totalWeight ? entry.weight / totalWeight * 100 : 0)).toFixed(2)}%</small></span><em>{coins(entry.item.price)} SC</em></article>)}</div></section>}</>}
    {phase === 'result' && opening && <div className="case-result"><span>🐷</span><div><small>{opening.length > 1 ? `ТВОИ ${opening.length} НОВЫХ ДРОПОВ` : 'ТВОЙ НОВЫЙ ДРОП'}</small><b>{opening.map((drop) => drop.item.name).join(' · ')}</b><em>Оставь в инвентаре или продай сразу за полную цену.</em></div><div className="case-result-actions"><button className="login" onClick={onClose}>В инвентарь</button><button className="case-sell-now" disabled={sellingCaseDrops} onClick={onSellDrops}>{sellingCaseDrops ? 'Продаём…' : `Продать · ${coins(opening.reduce((sum, drop) => sum + drop.item.price, 0))} SC`}</button></div></div>}
    {phase !== 'result' && <div className="case-controls"><div className="case-options">{magic ? <small>ТОЛЬКО ОДНО ЗАКЛИНАНИЕ ЗА РАЗ</small> : <><small>ОТКРЫТЬ СЕРИЕЙ</small><div className="count-picker">{[1, 2, 3, 4].map((value) => <button key={value} disabled={phase === 'spinning'} className={count === value ? 'chosen' : ''} onClick={() => setCount(value)}>×{value}</button>)}</div><div className="spin-modes case-modes">{(['FAST','SLOW','RISK'] as SpinMode[]).map((speed) => <button disabled={phase === 'spinning'} className={mode === speed ? 'chosen' : ''} key={speed} onClick={() => setMode(speed)}>{spinModeLabel[speed]}</button>)}</div></>}</div><div className="case-buy"><span>{magic ? 'Секретное открытие · 1–3 награды' : count > 1 ? `${count} кейса · ${spinModeLabel[mode].toLowerCase()} режим` : `${spinModeLabel[mode]} режим`}</span><button className="pig-button case-launch" onClick={onOpen} disabled={phase === 'spinning'}>{phase === 'spinning' ? (opening ? (magic ? 'ЗАКЛИНАНИЕ РАСКРЫВАЕТСЯ…' : 'ЛЕНТЫ КРУТЯТСЯ…') : 'ФИКСИРУЕМ ДРОП…') : `ОТКРЫТЬ ЗА ${coins(data.price * (magic ? 1 : count))} SC`} <span>→</span></button></div></div>}
  </section></div>
}
function Giveaways({ giveaways, onEnter }: { giveaways: Giveaway[]; onEnter: (id: string) => void }) {
  const kinds: Record<string, string> = { HOURLY: 'КАЖДЫЙ ЧАС', DAILY: 'КАЖДЫЙ ДЕНЬ', WEEKLY: 'КАЖДУЮ НЕДЕЛЮ', CUSTOM: 'ОСОБЫЙ РОЗЫГРЫШ' }
  return <section className="page compact-page giveaways-page"><div className="page-title left"><p className="eyebrow">PIGGY GIVEAWAYS</p><h1>Свинские <strong>розыгрыши</strong></h1><p>Один билет на розыгрыш — один шанс забрать приз. Победитель выбирается сервером после окончания.</p></div><div className="giveaway-grid">{giveaways.map((giveaway) => <article className={`giveaway-card giveaway-${giveaway.kind.toLowerCase()}`} key={giveaway.id}><div className="giveaway-tag">🐷 {kinds[giveaway.kind] || kinds.CUSTOM}</div><img src={giveaway.prizeItem.image} alt="" onError={({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg' }}/><div><small>ПРИЗ</small><h3>{giveaway.prizeItem.name}</h3><em>{coins(giveaway.prizeItem.price)} SC</em></div><div className="giveaway-meta"><span>👥 {giveaway.entries} участников</span><span>⌛ до {new Date(giveaway.endsAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div><button className="pig-button" onClick={() => onEnter(giveaway.id)}>Участвовать · {coins(giveaway.entryPrice)} SC →</button></article>)}{!giveaways.length && <div className="empty-feed">Свиньи уже готовят первый розыгрыш…</div>}</div></section>
}
function AdminPanel({ token, toast }: { token: string; toast: (text: string) => void }) { const [users, setUsers] = useState<{ id: string; username: string; email: string; balance: number; isBanned: boolean; muteUntil: string | null }[]>([]); const [tab, setTab] = useState<'users' | 'cases' | 'promos'>('users'); const [records, setRecords] = useState<{ id: string; name?: string; code?: string; active: boolean; price?: number; uses?: number; maxUses?: number }[]>([]); const load = () => request(tab === 'users' ? '/api/admin/users' : `/api/admin/${tab}`, token).then(tab === 'users' ? setUsers : setRecords).catch((error) => toast(error.message)); useEffect(() => { load() }, [tab]); const changeBalance = async (id: string, direction: 'ADD' | 'REMOVE') => { const raw = window.prompt(direction === 'ADD' ? 'Сколько выдать (в свинокоинах)?' : 'Сколько списать?'); const amount = Math.round(Number(raw) * 100); if (!amount) return; try { await request(`/api/admin/users/${id}/balance`, token, { method: 'POST', body: JSON.stringify({ direction, amount }) }); toast('Баланс изменён'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Ошибка') } }; return <section className="page compact-page"><div className="page-title left"><p className="eyebrow">ADMIN ONLY</p><h1>Панель <strong>свинобосса</strong></h1><p>Управление игроками, виртуальной экономикой и контентом.</p></div><div className="admin-tabs">{(['users', 'cases', 'promos'] as const).map((id) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{id === 'users' ? 'Пользователи' : id === 'cases' ? 'Кейсы' : 'Промокоды'}</button>)}</div><div className="admin-table">{tab === 'users' ? users.map((item) => <div className="admin-row" key={item.id}><span>🐷</span><div><b>{item.username} {item.isBanned && <em>БАН</em>}</b><small>{item.email}</small></div><strong>{coins(item.balance)} SC</strong><button onClick={() => changeBalance(item.id, 'ADD')}>+ Баланс</button><button onClick={() => changeBalance(item.id, 'REMOVE')}>− Баланс</button></div>) : records.map((item) => <div className="admin-row" key={item.id}><span>{tab === 'cases' ? '📦' : '🎟️'}</span><div><b>{item.name || item.code}</b><small>{item.active ? 'Активен' : 'Отключён'}</small></div><strong>{item.price ? `${coins(item.price)} SC` : `${item.uses || 0}/${item.maxUses || 0}`}</strong></div>)}</div></section> }
function AdminPanelV2({ token, toast }: { token: string; toast: (text: string) => void }) {
  void AdminPanel
  const [tab, setTab] = useState<'users' | 'cases' | 'items' | 'promos' | 'giveaways' | 'chat' | 'logs'>('users')
  const [users, setUsers] = useState<{ id: string; username: string; email: string; balance: number; isBanned: boolean; muteUntil: string | null }[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [caseEditor, setCaseEditor] = useState<any | null | undefined>(undefined)
  const load = async () => { try { if (tab === 'users') setUsers(await request('/api/admin/users', token)); else setRows(await request(`/api/admin/${tab}`, token)) } catch (error) { toast(error instanceof Error ? error.message : 'Ошибка загрузки') } }
  useEffect(() => { load() }, [tab])
  const balance = async (userId: string, direction: 'ADD' | 'REMOVE') => { const value = Number(window.prompt(direction === 'ADD' ? 'Выдать свинокоины:' : 'Списать свинокоины:')); if (!value) return; await request(`/api/admin/users/${userId}/balance`, token, { method: 'POST', body: JSON.stringify({ direction, amount: Math.round(value * 100) }) }); toast('Баланс обновлён'); load() }
  const status = async (userId: string, body: object, message: string) => { try { await request(`/api/admin/users/${userId}/status`, token, { method: 'PATCH', body: JSON.stringify(body) }); toast(message); load() } catch (error) { toast(error instanceof Error ? error.message : 'Ошибка') } }
  const details = async (userId: string) => { try { const data = await request(`/api/admin/users/${userId}/inventory`, token); window.alert(data.length ? data.map((entry: { item: Skin }) => `${entry.item.name} — ${coins(entry.item.price)} SC`).join('\n') : 'Инвентарь пуст.') } catch { toast('Не удалось открыть инвентарь') } }
  const toggleCase = async (item: { id: string; active: boolean }) => { await request(`/api/admin/cases/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) }); toast(item.active ? 'Кейс отключён' : 'Кейс включён'); load() }
  const toggleItem = async (item: { id: string; active: boolean }) => { try { await request(`/api/admin/items/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) }); toast(item.active ? 'Предмет скрыт из выпадений' : 'Предмет возвращён в выпадения'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Ошибка') } }
  const addItem = async () => { const id = window.prompt('Уникальный ID предмета:'); const name = window.prompt('Название предмета:'); const price = Number(window.prompt('Цена в свинокоинах:')); const image = window.prompt('Ссылка на изображение:'); if (!id || !name || !price || !image) return; try { await request('/api/admin/items', token, { method: 'POST', body: JSON.stringify({ id, name, price: Math.round(price * 100), image, wear: 'FN', rarity: 'CLASSIFIED' }) }); toast('Предмет добавлен'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось добавить предмет') } }
  const editItem = async (item: { id: string; name: string; price: number; image: string; wear: string; rarity: string }) => { const name = window.prompt('Название предмета:', item.name); const price = Number(window.prompt('Цена в свинокоинах:', String(item.price / 100))); const image = window.prompt('Ссылка на изображение:', item.image); const wear = window.prompt('Wear:', item.wear); const rarity = window.prompt('Редкость:', item.rarity); if (!name || !price || !image || !wear || !rarity) return; try { await request(`/api/admin/items/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ name, price: Math.round(price * 100), image, wear, rarity }) }); toast('Предмет сохранён'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось сохранить предмет') } }
  const togglePromo = async (item: { id: string; active: boolean }) => { try { await request(`/api/admin/promos/${item.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !item.active }) }); toast(item.active ? 'Промокод отключён' : 'Промокод включён'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Ошибка') } }
  const removeMessage = async (id: string) => { try { await request(`/api/admin/chat/${id}`, token, { method: 'DELETE' }); toast('Сообщение удалено'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Ошибка') } }
  const newPromo = async () => { const code = window.prompt('Код промокода, например PIG2026')?.toUpperCase(); const coinsValue = Number(window.prompt('Награда в свинокоинах:')); const maxUses = Number(window.prompt('Сколько раз можно активировать:')); if (!code || !coinsValue || !maxUses) return; try { await request('/api/admin/promos', token, { method: 'POST', body: JSON.stringify({ code, rewardType: 'BALANCE', rewardValue: Math.round(coinsValue * 100), maxUses }) }); toast('Промокод создан'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось создать промокод') } }
  const newGiveaway = async () => { const title = window.prompt('Название розыгрыша:'); const prizeItemId = window.prompt('ID предмета-приза (посмотри его во вкладке «Предметы»):'); const entryCoins = Number(window.prompt('Стоимость входа, SC:')); const startsAt = window.prompt('Начало (например 2026-09-15T18:00):', new Date().toISOString().slice(0, 16)); const endsAt = window.prompt('Окончание (например 2026-09-16T18:00):'); if (!title || !prizeItemId || !entryCoins || !startsAt || !endsAt) return; try { await request('/api/admin/giveaways', token, { method: 'POST', body: JSON.stringify({ title, prizeItemId, entryPrice: Math.round(entryCoins * 100), startsAt, endsAt }) }); toast('Розыгрыш создан'); load() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось создать розыгрыш') } }
  const resetEconomy = async () => { if (window.prompt('Введите RESET_ALL_BALANCES_AND_SKINS для очистки балансов и скинов у ВСЕХ игроков:') !== 'RESET_ALL_BALANCES_AND_SKINS') return; try { const result = await request('/api/admin/economy/reset', token, { method: 'POST', body: JSON.stringify({ confirmation: 'RESET_ALL_BALANCES_AND_SKINS' }) }); toast(`Очищено: ${result.users} игроков, ${result.skins} скинов`); load() } catch (error) { toast(error instanceof Error ? error.message : 'Не удалось очистить экономику') } }
  return <section className="page compact-page"><div className="page-title left"><p className="eyebrow">ADMIN ONLY · REAL DATABASE</p><h1>Панель <strong>свинобосса</strong></h1><p>Управляй игроками, кейсами, предметами, розыгрышами, промокодами, чатом и журналом действий.</p></div>{tab === 'cases' && caseEditor !== undefined && <CaseWorkshop token={token} existing={caseEditor || undefined} onClose={() => setCaseEditor(undefined)} onSaved={() => { setCaseEditor(undefined); load(); toast('Кейс и его состав сохранены') }}/>}<div className="profile-columns"><section className="panel"><h3>Разделы</h3>{([['users','Игроки'],['cases','Кейсы'],['items','Предметы'],['giveaways','Розыгрыши'],['promos','Промокоды'],['chat','Модерация чата'],['logs','Логи']] as const).map(([id,label]) => <button className="login" style={{ display: 'block', width: '100%', margin: '7px 0', textAlign: 'left' }} key={id} onClick={() => { setTab(id); setCaseEditor(undefined) }}>{tab === id ? '● ' : '○ '}{label}</button>)}</section><section className="panel"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><h3>{tab === 'users' ? 'Игроки' : tab === 'cases' ? 'Кейсы' : tab === 'items' ? 'Предметы' : tab === 'giveaways' ? 'Розыгрыши' : tab === 'promos' ? 'Промокоды' : tab === 'chat' ? 'Модерация чата' : 'Журнал'}</h3>{tab === 'cases' && <button className="pig-button" onClick={() => setCaseEditor(null)}>+ Кейс</button>}{tab === 'giveaways' && <button className="pig-button" onClick={newGiveaway}>+ Розыгрыш</button>}{tab === 'promos' && <button className="pig-button" onClick={newPromo}>+ Промокод</button>}{tab === 'items' && <button className="pig-button" onClick={addItem}>+ Предмет</button>}</div>{tab === 'users' && <><button className="admin-danger" onClick={resetEconomy}>⚠ Очистить всем баланс и скины</button>{users.map((item) => <div className="transaction" key={item.id}><span><b>{item.username}</b><br/><small>{item.email} · {item.isBanned ? '🚫 Забанен' : item.muteUntil ? '🔇 Мут' : '✅ Активен'}</small></span><b>{coins(item.balance)} SC</b><button className="login" onClick={() => balance(item.id, 'ADD')}>+SC</button><button className="login" onClick={() => balance(item.id, 'REMOVE')}>−SC</button><button className="login" onClick={() => status(item.id, { isBanned: !item.isBanned }, item.isBanned ? 'Бан снят' : 'Игрок забанен')}>{item.isBanned ? 'Разбан' : 'Бан'}</button><button className="login" onClick={() => status(item.id, { muteMinutes: item.muteUntil ? 0 : 60 }, item.muteUntil ? 'Мут снят' : 'Мут на 60 минут')}>{item.muteUntil ? 'Снять мут' : 'Мут'}</button><button className="login" onClick={() => details(item.id)}>Инвентарь</button></div>)}</>}{tab === 'cases' && rows.map((item) => <div className="transaction" key={item.id}><span><b>{item.name}</b><br/><small>{item.active ? '✅ Активен' : '⏸ Отключён'} · {item.items?.length || 0} предметов · {item.collection}</small></span><b>{coins(item.price)} SC</b><button className="login" onClick={() => setCaseEditor(item)}>Редактор</button><button className="login" onClick={() => toggleCase(item)}>{item.active ? 'Отключить' : 'Включить'}</button></div>)}{tab === 'items' && rows.map((item) => <div className="transaction" key={item.id}><span><b>{item.name}</b><br/><small>{item.rarity} · {item.wear} · {item.active ? '✅ В дропе' : '⏸ Скрыт'}</small></span><b>{coins(item.price)} SC</b><button className="login" onClick={() => editItem(item)}>Изменить</button><button className="login" onClick={() => toggleItem(item)}>{item.active ? 'Скрыть' : 'Включить'}</button></div>)}{tab === 'giveaways' && rows.map((item) => <div className="transaction" key={item.id}><span><b>{item.title}</b><br/><small>{item.kind} · приз: {item.prizeItem?.name} · до {new Date(item.endsAt).toLocaleString('ru-RU')}</small></span><b>{coins(item.entryPrice)} SC</b><small>{item._count?.entries || 0} участников</small></div>)}{tab === 'promos' && rows.map((item) => <div className="transaction" key={item.id}><span><b>{item.code}</b><br/><small>{item.active ? '✅ Активен' : '⏸ Отключён'} · {coins(Number(item.rewardValue || 0))} SC</small></span><b>{item.uses}/{item.maxUses}</b><button className="login" onClick={() => togglePromo(item)}>{item.active ? 'Отключить' : 'Включить'}</button></div>)}{tab === 'chat' && rows.map((item) => <div className="transaction" key={item.id}><span><b>{item.user?.username}</b><br/><small>{item.message} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small></span><button className="login" onClick={() => removeMessage(item.id)}>Удалить</button></div>)}{tab === 'logs' && rows.map((item) => <div className="transaction" key={item.id}><span><b>{item.action}</b><br/><small>{item.admin?.email || 'admin'} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small></span></div>)}</section></div></section>
}

function CaseWorkshop({ token, existing, onClose, onSaved, onError }: { token: string; existing?: any; onClose: () => void; onSaved: () => void; onError?: (message: string) => void }) {
  const [items, setItems] = useState<(Skin & { active: boolean })[]>([])
  const [draft, setDraft] = useState({ name: existing?.name || '', slug: existing?.slug || '', price: existing?.price ? String(existing.price / 100) : '', image: existing?.image || '', collection: existing?.collection || 'Свиноохотники' })
  const [weights, setWeights] = useState<Record<string, number>>(() => Object.fromEntries((existing?.items || []).map((entry: any) => [entry.itemId || entry.item?.id, entry.weight])))
  const [saving, setSaving] = useState(false)
  useEffect(() => { request('/api/admin/items', token).then(setItems).catch(() => undefined) }, [token])
  const selected = Object.entries(weights).filter(([, weight]) => weight > 0)
  const setWeight = (id: string, weight: number) => setWeights((current) => ({ ...current, [id]: weight }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const price = Math.round(Number(draft.price) * 100)
    if (!draft.name || !draft.slug || !draft.image || !draft.collection || !price || !selected.length) return
    setSaving(true)
    try {
      const payload = { ...draft, price, items: selected.map(([itemId, weight]) => ({ itemId, weight })) }
      if (existing?.id) {
        await request(`/api/admin/cases/${existing.id}`, token, { method: 'PATCH', body: JSON.stringify(payload) })
        await request(`/api/admin/cases/${existing.id}/items`, token, { method: 'PUT', body: JSON.stringify({ items: payload.items }) })
      } else await request('/api/admin/cases', token, { method: 'POST', body: JSON.stringify(payload) })
      onSaved()
    } catch (error) { onError?.(error instanceof Error ? error.message : 'Не удалось сохранить состав кейса') } finally { setSaving(false) }
  }
  return <form className="case-workshop" onSubmit={submit}><div className="workshop-head"><div><p className="eyebrow">КОНСТРУКТОР КЕЙСОВ</p><h2>{existing ? `Редактор: ${existing.name}` : 'Новый кейс'}</h2><p>Выбери предметы, укажи им веса и сохрани всё одной кнопкой.</p></div><button type="button" className="login" onClick={onClose}>Закрыть ×</button></div><div className="workshop-fields"><label>Название<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label>Slug<input required disabled={!!existing} pattern="[a-z0-9-]{3,64}" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase() })}/></label><label>Цена, SC<input required type="number" min="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })}/></label><label>Коллекция<input required value={draft.collection} onChange={(event) => setDraft({ ...draft, collection: event.target.value })}/></label><label className="wide">Ссылка на обложку<input required type="url" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })}/></label></div><div className="workshop-actions"><span>В составе: <b>{selected.length}</b> · Сумма весов: <b>{selected.reduce((sum, [, weight]) => sum + weight, 0)}</b></span><button type="button" className="login" onClick={() => setWeights(Object.fromEntries(items.slice(0, 12).map((item, index) => [item.id, Math.max(1, Math.round(500 / (index + 1)))])))}>Быстрая основа</button><button className="pig-button" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить кейс →'}</button></div><div className="workshop-items">{items.map((item) => <label className={`workshop-item ${weights[item.id] ? 'picked' : ''}`} key={item.id}><input type="checkbox" checked={!!weights[item.id]} onChange={(event) => setWeight(item.id, event.target.checked ? Math.max(weights[item.id] || 0, 10) : 0)}/><img src={item.image} alt="" onError={({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = '/skin-fallback.svg' }}/><span><b>{item.name}</b><small>{item.wear} · {coins(item.price)} SC</small></span><input aria-label={`Вес ${item.name}`} disabled={!weights[item.id]} type="number" min="1" value={weights[item.id] || ''} onChange={(event) => setWeight(item.id, Math.max(1, Number(event.target.value)))}/></label>)}</div></form>
}
