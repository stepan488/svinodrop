import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";
import "./animations.css";
import "./refinement.css";

type Skin = {
  id: string;
  name: string;
  wear: string;
  price: number;
  image: string;
  rarity: string;
  upgradeEligible?: boolean;
};
type Case = {
  id: string;
  name: string;
  slug: string;
  image: string;
  price: number;
  collection: string;
  openingStyle?: "REEL" | "MAGIC";
  maxOpen?: number;
  contentsHidden?: boolean;
  items: { id: string; weight: number; chance?: number; item: Skin }[];
};
type Inventory = {
  id: string;
  obtainedAt: string;
  obtainedFrom: string;
  item: Skin;
};
type User = {
  id: string;
  username: string;
  email: string;
  avatar?: string | null;
  nickColor?: string;
  balance: number;
  role: string;
  createdAt: string;
};
type Drop = { dropId: string; inventoryId: string; item: Skin };
type Feed = { username: string; item: Skin; kind: string };
type LeaderboardRow = {
  id: string;
  username: string;
  avatar: string | null;
  balance: number;
  inventoryValue: number;
  skins: number;
  total: number;
  rank: number;
};
type DailyWinner = {
  id: string;
  username: string;
  avatar: string | null;
  nickColor: string;
  raised: number;
  rank: number;
};
type OnlinePig = {
  id: string;
  username: string;
  avatar: string | null;
  nickColor: string;
};
type ProfileTopDrop = { item: Skin; createdAt: string } | null;
type BossAttackOption = {
  key: "SEND" | "BAIT" | "SLAP" | "KUNGFU" | "ROCKET" | "NUCLEAR";
  label: string;
  cost: number;
  damage: number;
  icon: string;
  quote: string;
};
type BossFight = {
  event: {
    key: string;
    title: string;
    startsAt: string;
    endsAt: string;
    maxHp: number;
    active: boolean;
    rewards: string[];
  };
  totalDamage: number;
  remainingHp: number;
  attacks: BossAttackOption[];
  leaderboard: Array<OnlinePig & { damage: number; rank: number }>;
  myDamage: number;
};
type SpinMode = "FAST" | "SLOW" | "RISK";
type Giveaway = {
  id: string;
  title: string;
  kind: string;
  entryPrice: number;
  startsAt: string;
  endsAt: string;
  prizeItem: Skin;
  entries: number;
  automatic: boolean;
};
type Battle = {
  id: string;
  status: string;
  mode: "NORMAL" | "CURSED" | "JACKPOT" | "LAST";
  playerLimit: number;
  private: boolean;
  fast?: boolean;
  inviteCode: string;
  creatorId: string;
  players: {
    id: string;
    userId: string | null;
    username: string;
    avatar: string | null;
  }[];
  cases: Pick<Case, "id" | "name" | "image" | "price" | "items">[];
  results?: {
    rounds: {
      player: { username: string; avatar?: string | null };
      drops: {
        caseId?: string;
        caseName?: string;
        item: Skin;
        value: number;
      }[];
      total: number;
    }[];
    winnerIndex: number;
    jackpotPlayerIndexes?: number[];
  };
  winnerUserId?: string | null;
  isMine: boolean;
};
type NavalShot = {
  x: number;
  y: number;
  hit: boolean;
  sunk?: boolean;
  blocked?: boolean;
};
type NavalGame = {
  id: string;
  stake: number;
  status: string;
  turnUserId: string | null;
  turnEndsAt?: string | null;
  winnerUserId: string | null;
  mine: {
    ready: boolean;
    ships: { x: number; y: number }[];
    shots: NavalShot[];
  };
  opponent: {
    username: string;
    avatar: string | null;
    ready: boolean;
    bot?: boolean;
    shots: NavalShot[];
  } | null;
};
type UpgradeHistory = {
  id: string;
  chance: number;
  balanceStake: number;
  result: boolean;
  createdAt: string;
  sourceItem: Skin;
  targetItem: Skin;
};
type MinesStatus = "PLAYING" | "LOST" | "CASHED_OUT" | "WON";
type MinesGame = {
  status: MinesStatus;
  mineCount: 3 | 6 | 9;
  wager: number;
  opened: number[];
  mines?: number[];
  multiplier: number;
  payout: number;
  safeTotal: number;
  createdAt: string;
  completedAt?: string;
};
type PigstyStatus = "PLAYING" | "LOST" | "CASHED_OUT";
type PigstyGame = {
  status: PigstyStatus;
  bombCount: 1 | 2 | 3;
  stakeItem: Skin;
  choices: Array<{ choice: number; safe: boolean }>;
  round: number;
  multiplier: number;
  payout: number;
  revealedBombs?: number[];
  createdAt: string;
  completedAt?: string;
};
type CreditStatus = {
  limit: number;
  claimed: number;
  remaining: number;
  dayKey: string;
};
type DailyStreakReward = { day: number };
type DailyStreakPrize =
  | { day: number; rewardDay: number; type: "COINS"; amount: number }
  | { day: number; rewardDay: number; type: "ITEM"; item: Skin };
type DailyStreak = {
  available: boolean;
  claimDay: number;
  rewardDay: number;
  progressDay: number;
  progressRewardDay: number;
  reset: boolean;
  today: string;
  cycleLength: number;
  rewards: DailyStreakReward[];
};
type CrashRound = {
  id: string;
  phase: "BETTING" | "RUNNING" | "CRASHED";
  bettingEndsAt: string;
  startedAt?: string;
  crashedAt?: string;
  currentMultiplier: number;
  crashMultiplier?: number;
};
type CrashBet = {
  status: "BET" | "CASHED_OUT" | "LOST";
  stake: number;
  balanceStake: number;
  skinStake: number;
  skinIds: string[];
  payout?: number;
  cashoutMultiplier?: number;
  livePayout?: number;
};
type RoadStatus = "PLAYING" | "LOST" | "CASHED_OUT" | "WON";
type RoadGame = {
  status: RoadStatus;
  wager: number;
  steps: number[];
  multiplier: number;
  payout: number;
  last?: { choice: number; safe: boolean };
  maxSteps: number;
};

// Local development uses the separate API; a production build can use a
// configured API subdomain or the same origin without shipping localhost.
// The public site uses a separate Render service, never the Vercel origin.
// Local development may still point at a different API through .env.
const API = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || "http://localhost:5000"
  : "https://svinodrop-api.onrender.com";
const rarity = (value: string) =>
  `rarity-${value.toLowerCase().replaceAll("-", "")}`;
const coins = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value / 100,
  );
const multiplier = (value: number) =>
  `×${new Intl.NumberFormat("ru-RU", { minimumFractionDigits: value < 10 ? 2 : 0, maximumFractionDigits: 2 }).format(value)}`;
const spinDuration: Record<SpinMode, number> = {
  FAST: 1000,
  SLOW: 6800,
  RISK: 9400,
};
const spinModeLabel: Record<SpinMode, string> = {
  FAST: "Быстрый",
  SLOW: "Плавный",
  RISK: "Азартный",
};
type SiteSound =
  | "case"
  | "reveal"
  | "upgrade"
  | "win"
  | "sell"
  | "contract"
  | "shot"
  | "hit"
  | "card"
  | "cashout";
const playSiteSound = (sound: SiteSound) =>
  window.dispatchEvent(
    new CustomEvent<SiteSound>("svino-sound", { detail: sound }),
  );
const soundTones: Record<SiteSound, number[]> = {
  case: [180, 240, 320],
  reveal: [420, 560, 760],
  upgrade: [220, 330, 440],
  win: [520, 660, 880],
  sell: [580, 740],
  contract: [170, 230, 310, 410],
  shot: [145, 90],
  hit: [110, 180, 90],
  card: [360, 520],
  cashout: [480, 640, 920],
};
function playSynthSound(sound: SiteSound) {
  const Context =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Context) return;
  const context = new Context();
  void context.resume();
  const now = context.currentTime;
  if (sound === "case" || sound === "upgrade") {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const duration = sound === "upgrade" ? 3.4 : 2.2;
    oscillator.type = sound === "upgrade" ? "triangle" : "sawtooth";
    oscillator.frequency.setValueAtTime(sound === "upgrade" ? 170 : 120, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      sound === "upgrade" ? 680 : 390,
      now + duration * 0.82,
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      sound === "upgrade" ? 300 : 220,
      now + duration,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.04);
    gain.gain.setValueAtTime(0.038, now + duration * 0.72);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }
  if (sound === "hit") {
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(145, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.23);
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.17, now + 0.008);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    thump.connect(thumpGain).connect(context.destination);
    thump.start(now);
    thump.stop(now + 0.3);

    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.12), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(0.09, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    noise.connect(noiseGain).connect(context.destination);
    noise.start(now);
    window.setTimeout(() => void context.close(), 400);
    return;
  }
  soundTones[sound].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = sound === "shot" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.075);
    gain.gain.setValueAtTime(0.0001, now + index * 0.075);
    gain.gain.exponentialRampToValueAtTime(0.075, now + index * 0.075 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.075 + 0.11);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + index * 0.075);
    oscillator.stop(now + index * 0.075 + 0.12);
  });
  window.setTimeout(
    () => void context.close(),
    sound === "upgrade" ? 3900 : sound === "case" ? 2700 : 700,
  );
}
const fallbackCases: Case[] = [
  [
    "Генста Свин!",
    "gensta-svin",
    499,
    "https://i.ibb.co/tPW2Xyys/b4f6cb58-752e-44ae-885c-bbbe73098ba9-removebg-preview.png",
  ],
  [
    "Хакер Свин!",
    "hacker-svin",
    999,
    "https://i.ibb.co/LhSVn6Ct/48eb32a1-02f8-438f-b615-996134c84736.png",
  ],
  [
    "Мапер Свин!",
    "mapper-svin",
    1999,
    "https://i.ibb.co/gZpjvqCG/9129ec80-5503-466d-ad65-5a61220e8d5c.png",
  ],
  [
    "Пиратский Свин!",
    "pirate-svin",
    3499,
    "https://i.ibb.co/tpc6jfbr/9ff2456a-8ed4-43f4-883d-0d98633f1de0.png",
  ],
].map(([name, slug, price, image], index) => ({
  id: `offline-${index}`,
  name: String(name),
  slug: String(slug),
  price: Number(price) * 100,
  image: String(image),
  collection: "Свиноохотники",
  items: [],
}));

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function DailyStreakCalendar({
  streak,
  busy,
  onClaim,
}: {
  streak: DailyStreak | null;
  busy: boolean;
  onClaim: () => void;
}) {
  if (!streak) return null;
  return (
    <section className="daily-streak-calendar">
      <header>
        <div>
          <p className="eyebrow">🐷 ЕЖЕДНЕВНАЯ СЕРИЯ · 14 ДНЕЙ</p>
          <h2>Свинки любят, когда ты возвращаешься</h2>
          <p>
            Забирай подарок каждый календарный день. Пропустишь день — серия
            вернётся к первому подарку.
          </p>
        </div>
        <div className="streak-counter">
          <small>ДНЕЙ В СЕРИИ</small>
          <b>{streak.available ? streak.claimDay : streak.progressDay}</b>
        </div>
      </header>
      <div className="streak-days">
        {streak.rewards.map((reward) => {
          const current = streak.available && reward.day === streak.rewardDay;
          const claimed = !current && !streak.reset && reward.day <= streak.progressRewardDay;
          return (
            <article
              className={`${claimed ? "claimed " : ""}${current ? "current" : ""}`}
              key={reward.day}
            >
              <small>
                ДЕНЬ {String(current ? streak.claimDay : reward.day).padStart(2, "0")}
              </small>
              <div className="streak-reward-art">
                <span>?</span>
              </div>
              <b>СЮРПРИЗ</b>
              {claimed && <i>✓</i>}
              {current && <em>ЗАБРАТЬ</em>}
            </article>
          );
        })}
      </div>
      <footer>
        <span>
          {streak.available
            ? `Сегодня доступен закрытый подарок за день ${streak.claimDay}.`
            : `День ${streak.progressDay} уже забран — следующий подарок завтра.`}
        </span>
        <button
          className="pig-button"
          disabled={!streak.available || busy}
          onClick={onClaim}
        >
          {busy
            ? "ГОТОВИМ ПОДАРОК…"
            : streak.available
              ? `ЗАБРАТЬ ДЕНЬ ${streak.claimDay} →`
              : "ПОДАРОК УЖЕ ЗАБРАН"}
        </button>
      </footer>
    </section>
  );
}

function DailyStreakPrizeModal({
  prize,
  onClose,
}: {
  prize: DailyStreakPrize;
  onClose: () => void;
}) {
  const isItem = prize.type === "ITEM";
  return (
    <div className="daily-streak-prize-backdrop" role="presentation">
      <section className="daily-streak-prize-modal" role="dialog" aria-modal="true">
        <span className="daily-streak-prize-sparkles">✦ ✧ ✦</span>
        <small>ЕЖЕДНЕВНАЯ СЕРИЯ · ДЕНЬ {prize.day}</small>
        <h2>{isItem ? "Свинка открыла скин!" : "Свинка принесла монеты!"}</h2>
        <div className="daily-streak-prize-art">
          {isItem ? <img src={prize.item.image} alt="" /> : <span>🐷</span>}
        </div>
        <b>{isItem ? prize.item.name : `${coins(prize.amount)} SC`}</b>
        <p>
          {isItem
            ? `${prize.item.wear} · ${coins(prize.item.price)} SC · уже в инвентаре`
            : "Свинокоины уже на твоём балансе"}
        </p>
        <button className="pig-button" onClick={onClose}>
          ЗАБРАТЬ ПОДАРОК →
        </button>
      </section>
    </div>
  );
}

function ProfileUpgradeHistory({ upgrades }: { upgrades: UpgradeHistory[] }) {
  return (
    <section className="panel profile-upgrade-history">
      <h3>История апгрейдов</h3>
      {upgrades.length ? (
        upgrades.map((upgrade) => (
          <article
            className={`upgrade-history-row ${upgrade.result ? "success" : "failure"}`}
            key={upgrade.id}
          >
            <img src={upgrade.targetItem.image} alt="" />
            <div>
              <small>
                {new Date(upgrade.createdAt).toLocaleString("ru-RU")} · шанс{" "}
                {upgrade.chance}%
              </small>
              <b>
                {upgrade.sourceItem.name} <span>→</span>{" "}
                {upgrade.targetItem.name}
              </b>
              {upgrade.balanceStake > 0 && (
                <em>+{coins(upgrade.balanceStake)} SC балансом</em>
              )}
            </div>
            <strong>{upgrade.result ? "УСПЕХ" : "Мимо"}</strong>
          </article>
        ))
      ) : (
        <p className="profile-history-empty">
          Здесь появятся твои попытки апгрейда.
        </p>
      )}
    </section>
  );
}

async function request(
  path: string,
  token?: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      body.error || "Свиносервер временно недоступен",
      response.status,
    );
  return body;
}

export default function App() {
  const [page, setPage] = useState<
    | "cases"
    | "games"
    | "upgrade"
    | "battles"
    | "naval"
    | "mines"
    | "pigsty"
    | "road"
    | "contract"
    | "crash"
    | "boss"
    | "giveaways"
    | "inventory"
    | "profile"
    | "chat"
    | "leaderboard"
    | "admin"
  >(() => {
    const saved = localStorage.getItem("svino-page");
    const allowed = ["cases", "games", "upgrade", "battles", "naval", "mines", "pigsty", "road", "contract", "crash", "boss", "giveaways", "inventory", "profile", "chat", "leaderboard", "admin"];
    return (allowed.includes(saved || "") ? saved : "cases") as "cases";
  });
  const [cases, setCases] = useState<Case[]>(fallbackCases);
  const [casesReady, setCasesReady] = useState(false);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(
    () => localStorage.getItem("svino-token") || "",
  );
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [sellingIds, setSellingIds] = useState<Set<string>>(() => new Set());
  const [sellingAll, setSellingAll] = useState(false);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [online, setOnline] = useState(0);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [count, setCount] = useState(1);
  const [opening, setOpening] = useState<Drop[] | null>(null);
  const [caseBalanceReward, setCaseBalanceReward] = useState(0);
  const [casePhase, setCasePhase] = useState<"idle" | "spinning" | "result">(
    "idle",
  );
  const [caseMode, setCaseMode] = useState<SpinMode>("SLOW");
  const [upgradeResult, setUpgradeResult] = useState<{
    upgradeId: string;
    success: boolean;
    chance: number;
    landingAngle: number;
    target: Skin;
    compensation?: number;
  } | null>(null);
  const [upgradePhase, setUpgradePhase] = useState<
    "idle" | "spinning" | "result"
  >("idle");
  const [upgradeMode, setUpgradeMode] = useState<SpinMode>("SLOW");
  const [sources, setSources] = useState<Inventory[]>([]);
  const [target, setTarget] = useState<Skin | null>(null);
  const [upgradeBalance, setUpgradeBalance] = useState(0);
  const [upgradeSettingsOpen, setUpgradeSettingsOpen] = useState(false);
  const [sellingCaseDrops, setSellingCaseDrops] = useState(false);
  const [caseDropsSold, setCaseDropsSold] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<{
    stats: { opens: number; upgrades: number; itemCount: number };
    topDrop: ProfileTopDrop;
    transactions: {
      id: string;
      type: string;
      amount: number;
      description: string;
      createdAt: string;
    }[];
    upgradeHistory: UpgradeHistory[];
    daily: { available: boolean; nextAt: string | null; maxValue: number };
    credit: CreditStatus;
    streak: DailyStreak;
  } | null>(null);
  const [chat, setChat] = useState<
    {
      id: string;
      message: string;
      createdAt: string;
      user: { username: string };
    }[]
  >([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [dailyWinners, setDailyWinners] = useState<DailyWinner[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlinePig[]>([]);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [publicProfile, setPublicProfile] = useState<{
    id: string;
    username: string;
    avatar: string | null;
    nickColor: string;
    createdAt: string;
    stats: { opens: number; upgrades: number; itemCount: number };
    topDrop: ProfileTopDrop;
  } | null>(null);
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [collectionTitle, setCollectionTitle] = useState(
    "Стартовая свиноколлекция",
  );
  const [caseSearch, setCaseSearch] = useState("");
  const [favoriteCaseIds, setFavoriteCaseIds] = useState<string[]>([]);
  const [favoritesLoadedKey, setFavoritesLoadedKey] = useState("");
  const [creditAmount, setCreditAmount] = useState("150000");
  const [creditBusy, setCreditBusy] = useState(false);
  const [streakBusy, setStreakBusy] = useState(false);
  const [streakPrize, setStreakPrize] = useState<DailyStreakPrize | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem("svino-sound") !== "off",
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const toast = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3600);
  };
  const refreshPrivate = async () => {
    if (!token) return;
    try {
      // Only the dedicated session check may log a player out. A temporary
      // failure in a background request must never destroy their local session.
      const me = await request("/api/auth/me", token);
      setUser(me.user);
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        localStorage.removeItem("svino-token");
        setToken("");
        setUser(null);
      }
      return;
    }
    try {
      // Claims server-finalized case/upgrade rewards after a refresh during animation.
      await request("/api/recover-pending", token, { method: "POST" });
      const [items, info] = await Promise.all([
        request("/api/inventory", token),
        request("/api/profile", token),
      ]);
      setInventory(items);
      setProfile(info);
    } catch {
      // The account stays signed in; the next private refresh retries recovery.
    }
  };
  useEffect(() => {
    request("/api/cases")
      .then((data) => {
        setCases(data);
        setCasesReady(true);
      })
      .catch(() => toast("Не удалось загрузить кейсы — проверь API."));
    request("/api/items")
      .then(setSkins)
      .catch(() => undefined);
    request("/api/chat")
      .then(setChat)
      .catch(() => undefined);
    request("/api/leaderboard")
      .then(setLeaderboard)
      .catch(() => undefined);
    request("/api/daily-winners")
      .then(setDailyWinners)
      .catch(() => undefined);
    request("/api/online")
      .then(setOnlineUsers)
      .catch(() => undefined);
    request("/api/site-settings")
      .then((settings) => {
        if (settings.collectionTitle)
          setCollectionTitle(settings.collectionTitle);
      })
      .catch(() => undefined);
  }, []);
  const favoritesKey = `svino-favorite-cases:${user?.id || "guest"}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
      setFavoriteCaseIds(Array.isArray(saved) ? saved : []);
    } catch {
      setFavoriteCaseIds([]);
    } finally {
      setFavoritesLoadedKey(favoritesKey);
    }
  }, [favoritesKey]);
  useEffect(() => {
    if (favoritesLoadedKey === favoritesKey)
      localStorage.setItem(favoritesKey, JSON.stringify(favoriteCaseIds));
  }, [favoritesKey, favoriteCaseIds, favoritesLoadedKey]);
  useEffect(() => {
    refreshPrivate();
  }, [token]);
  useEffect(() => {
    localStorage.setItem("svino-page", page);
  }, [page]);
  // A case is a place in the app just like a game page.  Keep its id (never
  // the unrevealed result) so a refresh returns the player to the same case.
  useEffect(() => {
    if (!casesReady || selectedCase) return;
    const savedCaseId = localStorage.getItem("svino-open-case");
    if (!savedCaseId) return;
    const savedCase = cases.find((item) => item.id === savedCaseId);
    if (savedCase) {
      setSelectedCase(savedCase);
      setCount(savedCase.maxOpen === 1 ? 1 : 1);
    } else {
      localStorage.removeItem("svino-open-case");
    }
  }, [casesReady, cases, selectedCase]);
  useEffect(() => {
    localStorage.setItem("svino-sound", soundEnabled ? "on" : "off");
  }, [soundEnabled]);
  useEffect(() => {
    const handleSound = (event: Event) => {
      if (soundEnabled)
        playSynthSound((event as CustomEvent<SiteSound>).detail);
    };
    window.addEventListener("svino-sound", handleSound);
    return () => window.removeEventListener("svino-sound", handleSound);
  }, [soundEnabled]);
  useEffect(() => {
    const socket = io(API, { auth: { token } });
    socket.on("online:count", setOnline);
    socket.on("online:users", setOnlineUsers);
    socket.on("drop:revealed", (drop: Feed) =>
      setFeed((items) => [drop, ...items].slice(0, 6)),
    );
    socket.on("chat:message", (message) =>
      setChat((messages) => [message, ...messages].slice(0, 50)),
    );
    socket.on("chat:deleted", ({ id }: { id: string }) =>
      setChat((messages) => messages.filter((message) => message.id !== id)),
    );
    return () => {
      socket.disconnect();
    };
  }, [token]);
  useEffect(() => {
    if (page === "leaderboard")
      request("/api/leaderboard")
        .then(setLeaderboard)
        .catch(() => toast("Не удалось обновить лидерборд"));
  }, [page]);
  useEffect(() => {
    if (page === "giveaways")
      request("/api/giveaways")
        .then(setGiveaways)
        .catch(() => toast("Не удалось загрузить розыгрыши"));
  }, [page]);
  const upgradeStake =
    sources.reduce((total, source) => total + source.item.price, 0) +
    upgradeBalance;
  const upgradeChance = useMemo(
    () =>
      sources.length && target && target.price > upgradeStake
        ? Math.max(
            5,
            Math.min(90, Math.round((upgradeStake / target.price) * 90)),
          )
        : 0,
    [sources, target, upgradeStake],
  );
  const toggleUpgradeSource = (entry: Inventory) => {
    const alreadySelected = sources.some((source) => source.id === entry.id);
    if (!alreadySelected && sources.length >= 8)
      return toast("В один апгрейд можно добавить максимум 8 скинов.");
    const nextSources = alreadySelected
      ? sources.filter((source) => source.id !== entry.id)
      : [...sources, entry];
    const nextStake =
      nextSources.reduce((total, source) => total + source.item.price, 0) +
      upgradeBalance;
    setSources(nextSources);
    if (target && target.price <= nextStake) setTarget(null);
    setUpgradePhase("idle");
    setUpgradeResult(null);
  };
  const login = async (email: string, password: string, username?: string) => {
    const endpoint = username ? "/api/auth/register" : "/api/auth/login";
    const body = username ? { username, email, password } : { email, password };
    const data = await request(endpoint, undefined, {
      method: "POST",
      body: JSON.stringify(body),
    });
    localStorage.setItem("svino-token", data.token);
    setToken(data.token);
    setUser(data.user);
    setAuthOpen(false);
    if (username) setOnboardingOpen(true);
    toast(
      username
        ? "Добро пожаловать в стаю! +1 000 свинокоинов"
        : "С возвращением, свинка!",
    );
  };
  const openCase = async () => {
    if (!selectedCase) return;
    if (!token) return setAuthOpen(true);
    if (selectedCase.id.startsWith("offline"))
      return toast("Запусти базу данных и сервер, чтобы открыть кейс.");
    try {
      setCasePhase("spinning");
      setOpening(null);
      setCaseDropsSold(false);
      const data = await request(`/api/cases/${selectedCase.id}/open`, token, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ count }),
      });
      setOpening(data.drops);
      setCaseBalanceReward(data.balanceReward || 0);
      setCasePhase("spinning");
      setUser((current) =>
        current ? { ...current, balance: data.balance } : current,
      );
    } catch (error) {
      setCasePhase("idle");
      toast(error instanceof Error ? error.message : "Не удалось открыть кейс");
    }
  };
  const upgrade = async () => {
    if (!token) return setAuthOpen(true);
    if (!sources.length || !target)
      return toast("Сначала выбери предметы и цель.");
    try {
      setUpgradePhase("spinning");
      const result = await request("/api/upgrades", token, {
        method: "POST",
        body: JSON.stringify({
          sourceInventoryIds: sources.map((source) => source.id),
          targetItemId: target.id,
          balanceStake: upgradeBalance,
        }),
      });
      setUpgradeResult(result);
      setUpgradePhase("spinning");
      setUser((current) =>
        current ? { ...current, balance: result.balance } : current,
      );
    } catch (error) {
      setUpgradePhase("idle");
      toast(error instanceof Error ? error.message : "Апгрейд не выполнен");
    }
  };
  const redeem = async (code: string) => {
    try {
      const data = await request("/api/promos/redeem", token, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      toast(data.message);
      refreshPrivate();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка промокода");
    }
  };
  const claimDaily = async () => {
    try {
      const data = await request("/api/daily-case/open", token, {
        method: "POST",
      });
      toast(`Ежедневный кейс: ${data.item.name} уже в инвентаре 🐷`);
      await refreshPrivate();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Ежедневный кейс пока недоступен",
      );
    }
  };
  const claimDailyStreak = async () => {
    setStreakBusy(true);
    try {
      const data = await request("/api/daily-streak/claim", token, {
        method: "POST",
      });
      playSiteSound(data.reward.type === "ITEM" ? "win" : "cashout");
      const reward = data.reward as DailyStreakPrize;
      setStreakPrize(reward);
      const rewardText =
        reward.type === "ITEM" ? reward.item.name : `${coins(reward.amount)} SC`;
      toast(
        `${data.reset ? "Серия началась заново. " : ""}День ${reward.day}: ${rewardText} уже твой!`,
      );
      await refreshPrivate();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Не удалось забрать награду серии",
      );
    } finally {
      setStreakBusy(false);
    }
  };
  const takeCredit = async () => {
    const amount = Math.floor(Number(creditAmount) || 0) * 100;
    if (amount < 10_000 || amount > (profile?.credit.remaining || 0))
      return toast(
        `Можно взять от 100 до ${coins(profile?.credit.remaining || 0)} SC.`,
      );
    setCreditBusy(true);
    try {
      const data = await request("/api/balance-credit", token, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setUser((current) =>
        current ? { ...current, balance: data.balance } : current,
      );
      setCreditAmount(String(Math.floor(data.credit.remaining / 100)));
      await refreshPrivate();
      toast(`На баланс добавлено ${coins(amount)} SC.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось взять кредит");
    } finally {
      setCreditBusy(false);
    }
  };
  const sendChat = async (message: string) => {
    try {
      await request("/api/chat", token, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось отправить");
    }
  };
  const sell = async (inventoryId: string) => {
    if (sellingAll || sellingIds.has(inventoryId)) return;
    setSellingIds((current) => new Set(current).add(inventoryId));
    try {
      const data = await request(`/api/inventory/${inventoryId}/sell`, token, {
        method: "POST",
      });
      playSiteSound("sell");
      setInventory((current) =>
        current.filter((item) => item.id !== inventoryId),
      );
      setUser((current) =>
        current ? { ...current, balance: data.balance } : current,
      );
      toast(`Продано за ${coins(data.payout)} SC`);
      await refreshPrivate();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось продать предмет",
      );
    } finally {
      setSellingIds((current) => {
        const next = new Set(current);
        next.delete(inventoryId);
        return next;
      });
    }
  };
  const sellAll = async () => {
    if (
      sellingAll ||
      !inventory.length ||
      !window.confirm(
        `Продать все ${inventory.length} предметов за полную стоимость?`,
      )
    )
      return;
    setSellingAll(true);
    try {
      const data = await request("/api/inventory/sell-all", token, {
        method: "POST",
      });
      playSiteSound("sell");
      setInventory([]);
      setUser((current) =>
        current ? { ...current, balance: data.balance } : current,
      );
      toast(
        `Продано предметов: ${data.sold}. Получено ${coins(data.payout)} SC`,
      );
      await refreshPrivate();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось продать предметы",
      );
    } finally {
      setSellingAll(false);
    }
  };
  const sellCaseDrops = async () => {
    if (!opening?.length || sellingCaseDrops || caseDropsSold) return;
    setSellingCaseDrops(true);
    try {
      let balance = user?.balance || 0;
      for (const drop of opening) {
        const data = await request(
          `/api/inventory/${drop.inventoryId}/sell`,
          token,
          { method: "POST" },
        );
        balance = data.balance;
      }
      setInventory((current) =>
        current.filter(
          (entry) => !opening.some((drop) => drop.inventoryId === entry.id),
        ),
      );
      setUser((current) => (current ? { ...current, balance } : current));
      toast(`Продано дропов: ${opening.length}. Свинокоины уже на балансе.`);
      setCaseDropsSold(true);
      await refreshPrivate();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Не удалось продать выпавшие предметы",
      );
    } finally {
      setSellingCaseDrops(false);
    }
  };
  const enterGiveaway = async (id: string) => {
    if (!token) return setAuthOpen(true);
    try {
      const data = await request(`/api/giveaways/${id}/enter`, token, {
        method: "POST",
      });
      setUser((current) =>
        current ? { ...current, balance: data.balance } : current,
      );
      setGiveaways(await request("/api/giveaways"));
      toast("Ты в списке участников. Удачи, свинка! 🐷");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось участвовать");
    }
  };
  const finishCaseAnimation = async () => {
    if (casePhase !== "spinning" || !opening) return;
    setCasePhase("result");
    await Promise.all(
      opening.map((drop) =>
        request(`/api/drops/${drop.dropId}/reveal`, token, { method: "POST" }),
      ),
    );
    await refreshPrivate();
    toast("Дроп уже в твоём инвентаре!");
  };
  const finishUpgradeAnimation = async () => {
    if (upgradePhase !== "spinning" || !upgradeResult) return;
    playSiteSound(upgradeResult.success ? "win" : "reveal");
    setUpgradePhase("result");
    setUpgradeBalance(0);
    setSources([]);
    setTarget(null);
    await request(`/api/upgrades/${upgradeResult.upgradeId}/reveal`, token, {
      method: "POST",
    });
    await refreshPrivate();
  };
  // CSS animation events can be suppressed by reduced-motion/browser focus
  // changes. The timer is the authority: an upgrade can never stay locked.
  useEffect(() => {
    if (upgradePhase !== "spinning" || !upgradeResult) return;
    const timer = window.setTimeout(() => {
      void finishUpgradeAnimation();
    }, spinDuration[upgradeMode] + 180);
    return () => window.clearTimeout(timer);
  }, [upgradePhase, upgradeResult?.upgradeId, upgradeMode]);
  const selectCase = (item: Case) => {
    if (!casesReady) return toast("Кейсы загружаются, одну секунду 🐷");
    localStorage.setItem("svino-open-case", item.id);
    setSelectedCase(item);
    setCount(item.maxOpen === 1 ? 1 : [1, 2, 3, 4, 5, 10].includes(count) ? count : 1);
    setOpening(null);
    setCaseBalanceReward(0);
    setCaseDropsSold(false);
  };
  const toggleFavoriteCase = (caseId: string) =>
    setFavoriteCaseIds((current) =>
      current.includes(caseId)
        ? current.filter((id) => id !== caseId)
        : [...current, caseId],
    );
  const normalizedCaseSearch = caseSearch.trim().toLocaleLowerCase("ru-RU");
  const displayedCases = normalizedCaseSearch
    ? cases.filter((item) =>
        item.name.toLocaleLowerCase("ru-RU").includes(normalizedCaseSearch),
      )
    : cases;
  const favoriteCases = cases.filter((item) =>
    favoriteCaseIds.includes(item.id),
  );
  const openPublicProfile = (id: string) =>
    request(`/api/users/${id}`)
      .then(setPublicProfile)
      .catch((error) =>
        toast(
          error instanceof Error ? error.message : "Профиль недоступен",
        ),
      );
  const showOnlinePiggies = () => {
    setOnlineOpen(true);
    request("/api/online").then(setOnlineUsers).catch(() => undefined);
  };
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <button className="brand" onClick={() => setPage("cases")}>
          <span className="brand-mark">🐷</span>
          <span>
            SVINO<span>DROP</span>
          </span>
        </button>
        <nav>
          {(
            [
              ["cases", "Кейсы"],
              ["games", "Игры"],
              ["boss", "🔥 Босс"],
              ["giveaways", "Розыгрыши"],
              ["leaderboard", "Лидерборд"],
              ["inventory", "Инвентарь"],
              ...(user?.role === "ADMIN"
                ? [["admin", "Админ-панель"] as const]
                : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button
            className={`sound-toggle ${soundEnabled ? "on" : ""}`}
            onClick={() => {
              if (!soundEnabled) playSynthSound("reveal");
              setSoundEnabled((enabled) => !enabled);
            }}
            aria-label={soundEnabled ? "Выключить звуки" : "Включить звуки"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
          <button className="online" onClick={showOnlinePiggies}>
            <i /> {online} свинок онлайн
          </button>
          {user ? (
            <>
              <button
                className="balance-topup"
                onClick={() => setPage("profile")}
              >
                ＋ Пополнить баланс
              </button>
              <button className="user-chip" onClick={() => setPage("profile")}>
                <span className="avatar">🐽</span>
                <b>
                  {coins(user.balance)} <small>SC</small>
                </b>
                <em>{user.username}</em>
              </button>
            </>
          ) : (
            <button className="login" onClick={() => setAuthOpen(true)}>
              Войти
            </button>
          )}
        </div>
      </header>

      {page === "cases" && (
        <section className="page intro-page">
          <div className="hero-copy">
            <p className="eyebrow">СВИНСКАЯ КОЛЛЕКЦИЯ #01</p>
            <h1>
              Кейсы без
              <br />
              <strong>скучных</strong> дропов.
            </h1>
            <p className="hero-text">
              Свиньи. Кейсы. Скины. И немного свинского безумия.
            </p>
            <div className="hero-buttons">
              <button
                className="pig-button"
                onClick={() =>
                  document
                    .getElementById("cases")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Открыть кейсы <span>→</span>
              </button>
              <button
                className="ghost-button"
                onClick={() => setPage("upgrade")}
              >
                Апгрейд <span>↗</span>
              </button>
            </div>
            <div className="hero-stats">
              <span>
                <b>32</b> скина
              </span>
              <span>
                <b>28</b> кейсов
              </span>
              <span>
                <b>100%</b> виртуально
              </span>
            </div>
          </div>
          <div className="pig-hero">
            <div className="hero-crown">♕</div>
            <div className="hero-pig">🐷</div>
            <div className="hero-sticker one">+ DROP</div>
            <div className="hero-sticker two">✦ 2X</div>
            <div className="hero-card">
              <span>СЕГОДНЯ ВЫПАЛО</span>
              <b>★ Karambit</b>
              <em>1 030 SC</em>
            </div>
          </div>
          <section className="feature-scroller" aria-label="Режимы сайта">
            {[
              ["🎁", "Розыгрыши", "Забирай призы", "giveaways"],
              ["🎯", "Апгрейды", "Рискуй скинами", "upgrade"],
              ["📦", "Кейс-баттлы", "Победа забирает банк", "battles"],
              ["⚓", "Морской бой", "Ставка один на один", "naval"],
              ["💣", "Свиные мины", "Риск и множители", "mines"],
              ["🐔", "Свинарник", "Поймай курицу — не бомбу", "pigsty"],
              ["🐷", "Свиная дорога", "20 шагов до ×48", "road"],
              ["📜", "Контракт", "Собери скины", "contract"],
              ["🚀", "Свинокраш", "Успей забрать икс", "crash"],
            ].map(([icon, title, text, id]) => (
              <button key={title} onClick={() => setPage(id as typeof page)}>
                <span>{icon}</span>
                <b>{title}</b>
                <small>{text}</small>
                <em>→</em>
              </button>
            ))}
          </section>
          <section id="cases" className="case-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">СВИНСКИЙ ВЫБОР</p>
                <h2>Выбери свой кейс</h2>
              </div>
              <span>
                {casesReady
                  ? "Каждый дроп определяется сервером"
                  : "Подключаем свинобазу..."}
              </span>
            </div>
            <div className="case-tools">
              <label className="case-search">
                <span>⌕</span>
                <input
                  value={caseSearch}
                  onChange={(event) => setCaseSearch(event.target.value)}
                  placeholder="Поиск кейса по названию"
                  aria-label="Поиск кейсов"
                />
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => setCaseSearch("")}
                  className={caseSearch ? "visible" : ""}
                >
                  ×
                </button>
              </label>
              <div className="case-favorite-count">
                ♥ Избранное <b>{favoriteCaseIds.length}</b>
              </div>
            </div>
            {favoriteCases.length > 0 && (
              <section className="case-favorites">
                <header>
                  <div>
                    <p className="eyebrow">БЫСТРЫЙ ДОСТУП</p>
                    <h3>♥ Избранные кейсы</h3>
                  </div>
                  <button
                    className="login"
                    onClick={() => setFavoriteCaseIds([])}
                  >
                    Очистить
                  </button>
                </header>
                <div>
                  {favoriteCases.map((item) => (
                    <button
                      className="favorite-case-chip"
                      key={item.id}
                      onClick={() => selectCase(item)}
                    >
                      <img src={item.image} alt="" />
                      <span>
                        <b>{item.name}</b>
                        <small>{coins(item.price)} SC · открыть →</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {displayedCases.length ? (
              <div className="case-collections">
                {Object.entries(
                  displayedCases.reduce<Record<string, Case[]>>(
                    (groups, item) => {
                      (groups[item.collection] ||= []).push(item);
                      return groups;
                    },
                    {},
                  ),
                ).map(([collection, collectionCases]) => (
                  <section className="case-collection" key={collection}>
                    <div className="collection-head">
                      <span>
                        {collection === "Магические Свиньи"
                          ? "🪄"
                          : collection === "Свинки Пепы"
                            ? "👑"
                            : collection === "Ультра Богатый Свинки"
                              ? "💎"
                              : collection === "От рубля до ножа"
                                ? "🔪"
                                : "🐷"}
                      </span>
                      <div>
                        <p className="eyebrow">КОЛЛЕКЦИЯ</p>
                        <h3>{collection}</h3>
                      </div>
                      <small>
                        {collection === "Магические Свиньи"
                          ? "Секретный дроп · до 3 наград"
                          : collection === "Свинячий Окуп"
                            ? "Сочные шансы · дорогой лут"
                            : collection === "Свинки Пепы"
                              ? "Богатая коллекция · королевский лут"
                              : collection === "Ультра Богатый Свинки"
                                ? "Запредельный уровень · ультра-дорогой лут"
                                : collection === "От рубля до ножа"
                                  ? "Четыре ступени к ножу"
                                  : collectionTitle}
                      </small>
                    </div>
                    <div className="case-grid">
                      {collectionCases.map((item, index) => (
                        <article
                          className={`case-card case-${index} ${item.openingStyle === "MAGIC" ? `magic-case-card magic-${item.slug}` : ""} ${item.collection === "Ультра Богатый Свинки" ? `ultra-case ultra-${item.slug}` : ""} ${favoriteCaseIds.includes(item.id) ? "is-favorite" : ""} ${casesReady ? "" : "loading-case"}`}
                          key={item.id}
                          onClick={() => selectCase(item)}
                        >
                          <button
                            className={`case-favorite ${favoriteCaseIds.includes(item.id) ? "saved" : ""}`}
                            aria-label={
                              favoriteCaseIds.includes(item.id)
                                ? `Убрать ${item.name} из избранного`
                                : `Добавить ${item.name} в избранное`
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleFavoriteCase(item.id);
                            }}
                          >
                            ♥
                          </button>
                          <div className="case-no">
                            {item.openingStyle === "MAGIC"
                              ? "✦"
                              : String(index + 1).padStart(2, "0")}
                          </div>
                          <img src={item.image} alt={item.name} />
                          <div className="case-footer">
                            <div>
                              <h3>{item.name}</h3>
                              <p>
                                {item.openingStyle === "MAGIC"
                                  ? "Секретное открытие"
                                  : `Коллекция ${item.collection}`}
                              </p>
                            </div>
                            <b>
                              {coins(item.price)} <small>SC</small>
                            </b>
                          </div>
                          <button disabled={!casesReady}>
                            {casesReady ? (
                              <>
                                {item.openingStyle === "MAGIC"
                                  ? "КОЛДОВАТЬ"
                                  : "ОТКРЫТЬ"}{" "}
                                <span>→</span>
                              </>
                            ) : (
                              "ЗАГРУЗКА..."
                            )}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="case-search-empty">
                <span>🔎</span>
                <b>Кейсы не найдены</b>
                <small>Попробуй другое название или очисти поиск.</small>
                <button className="login" onClick={() => setCaseSearch("")}>
                  Показать все кейсы
                </button>
              </div>
            )}
          </section>
          <section className="feed-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LIVE DROP FEED</p>
                <h2>Последние находки</h2>
              </div>
              <span>Без спойлеров до конца анимации</span>
            </div>
            <div className="feed-list">
              {feed.length ? (
                feed.map((drop, index) => (
                  <div className="feed-item" key={`${drop.username}-${index}`}>
                    <span className="feed-avatar">🐷</span>
                    <span>
                      <b>{drop.username}</b> выбил через {drop.kind}
                    </span>
                    <strong className={rarity(drop.item.rarity)}>
                      {drop.item.name}
                    </strong>
                  </div>
                ))
              ) : (
                <div className="empty-feed">
                  Пока здесь тихо... 🐷 Открой первый кейс и зажги ленту.
                </div>
              )}
            </div>
          </section>
        </section>
      )}

      {page === "upgrade" && (
        <section className="page upgrade-page">
          <div className="page-title">
            <p className="eyebrow">RISK IT FOR THE BACON</p>
            <h1>
              Свинский <strong>апгрейд</strong>
            </h1>
            <p>Выбери предмет, добавь при желании баланс и поставь цель.</p>
          </div>
          <div className="upgrade-board">
            <UpgradeColumn
              title="ТВОИ ПРЕДМЕТЫ"
              subtitle="Можно объединить до 8 скинов"
              selectedSkins={sources.map((source) => source.item)}
              selectedCaption={
                sources.length > 1
                  ? `${sources.length} предметов в ставке`
                  : "Твоя ставка"
              }
              selectionLimit={8}
              onClear={
                sources.length
                  ? () => {
                      setSources([]);
                      setUpgradePhase("idle");
                      setUpgradeResult(null);
                    }
                  : undefined
              }
              empty={
                !inventory.length ? "Открой кейс, чтобы начать." : undefined
              }
            >
              {inventory.map((entry) => (
                <SkinCard
                  key={entry.id}
                  skin={entry.item}
                  selected={sources.some((source) => source.id === entry.id)}
                  onClick={() => toggleUpgradeSource(entry)}
                />
              ))}
            </UpgradeColumn>
            <div className="upgrade-core">
              <UpgradeDial
                key={`${upgradeResult?.upgradeId || "idle"}-${upgradeMode}`}
                chance={upgradeChance}
                phase={upgradePhase}
                result={upgradeResult}
                mode={upgradeMode}
              />
              <div className="upgrade-copy">
                <b>
                  {upgradePhase === "spinning"
                    ? upgradeResult
                      ? "СТРЕЛКА В ПОЛЁТЕ…"
                      : "ФИКСИРУЕМ РЕЗУЛЬТАТ…"
                    : upgradePhase === "result"
                      ? upgradeResult?.success
                        ? "АПГРЕЙД УСПЕШЕН! 🔥"
                        : "В ЭТОТ РАЗ НЕ ПОВЕЗЛО"
                      : "ВЫБЕРИ СТАВКУ И ЦЕЛЬ"}
                </b>
                <span>
                  {upgradePhase === "idle"
                    ? `Шанс попадания: ${upgradeChance || 0}%`
                    : upgradePhase === "result" &&
                        !upgradeResult?.success &&
                        upgradeResult?.compensation
                      ? `Компенсация 5%: +${coins(upgradeResult.compensation)} SC уже на балансе`
                      : "Результат уже защищён сервером"}
                </span>
              </div>
              {upgradePhase === "spinning" && upgradeResult && (
                <button
                  className="skip-upgrade"
                  onClick={finishUpgradeAnimation}
                >
                  Пропустить анимацию ↷
                </button>
              )}
              <button
                className="pig-button upgrade-button"
                disabled={upgradePhase === "spinning"}
                onClick={() => {
                  if (upgradePhase === "result") {
                    setUpgradePhase("idle");
                    setUpgradeResult(null);
                    return;
                  }
                  upgrade();
                }}
              >
                {upgradePhase === "spinning"
                  ? "СТРЕЛКА КРУТИТСЯ…"
                  : upgradePhase === "result"
                    ? "ЕЩЁ ОДНА ПОПЫТКА →"
                    : `АПГРЕЙД · ${spinModeLabel[upgradeMode].toUpperCase()} →`}
              </button>
              <div className="upgrade-settings">
                <button
                  type="button"
                  className="upgrade-settings-toggle"
                  onClick={() => setUpgradeSettingsOpen((open) => !open)}
                >
                  ⚙ Настройки {upgradeSettingsOpen ? "⌃" : "⌄"}
                </button>
                {upgradeSettingsOpen && (
                  <div className="upgrade-settings-menu">
                    <small>Скорость анимации</small>
                    <div className="spin-modes">
                      {(["FAST", "SLOW", "RISK"] as SpinMode[]).map((mode) => (
                        <button
                          key={mode}
                          disabled={upgradePhase === "spinning"}
                          className={upgradeMode === mode ? "chosen" : ""}
                          onClick={() => setUpgradeMode(mode)}
                        >
                          {spinModeLabel[mode]}
                          {mode === "FAST" ? " · 2с" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="upgrade-stake">
                <div>
                  <label htmlFor="upgrade-balance">Добавить балансом</label>
                  <input
                    id="upgrade-balance"
                    type="range"
                    min="0"
                    max={Math.floor((user?.balance || 0) / 100)}
                    step="1"
                    value={upgradeBalance / 100}
                    disabled={upgradePhase === "spinning"}
                    onChange={(event) => {
                      setUpgradeBalance(Number(event.target.value) * 100);
                      setUpgradePhase("idle");
                      setUpgradeResult(null);
                    }}
                  />
                  <div className="stake-marks">
                    <button type="button" onClick={() => setUpgradeBalance(0)}>
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUpgradeBalance(
                          Math.floor(((user?.balance || 0) * 0.25) / 100) * 100,
                        )
                      }
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUpgradeBalance(
                          Math.floor(((user?.balance || 0) * 0.5) / 100) * 100,
                        )
                      }
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUpgradeBalance(
                          Math.floor((user?.balance || 0) / 100) * 100,
                        )
                      }
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <strong>
                  {coins(upgradeBalance)} <small>SC</small>
                </strong>
                <span>Общая ставка: {coins(upgradeStake)} SC</span>
              </div>
              <div className="quick-row">
                {[2, 3, 5, 10].map((x) => (
                  <button
                    key={x}
                    disabled={upgradePhase === "spinning" || !sources.length}
                    onClick={() => {
                      if (sources.length) {
                        setTarget(
                          skins.find(
                            (skin) =>
                              skin.price > upgradeStake &&
                              skin.price >= upgradeStake * x && skin.price <= upgradeStake * 18,
                          ) || null,
                        );
                        setUpgradePhase("idle");
                        setUpgradeResult(null);
                      }
                    }}
                  >
                    ×{x}
                  </button>
                ))}
              </div>
            </div>
            <UpgradeColumn
              title="ЦЕЛЬ"
              subtitle="Предмет, который получишь при успехе"
              selectedSkins={target ? [target] : []}
              selectedCaption="Твоя цель"
            >
              {skins
                .filter(
                  (skin) =>
                    skin.upgradeEligible !== false &&
                    skin.price > upgradeStake &&
                    skin.price <= upgradeStake * 18,
                )
                .map((skin) => (
                  <SkinCard
                    key={skin.id}
                    skin={skin}
                    selected={target?.id === skin.id}
                    onClick={() => {
                      setTarget(skin);
                      setUpgradePhase("idle");
                      setUpgradeResult(null);
                    }}
                  />
                ))}
            </UpgradeColumn>
          </div>
        </section>
      )}

      {page === "inventory" && (
        <section className="page compact-page">
          <div className="page-title left">
            <p className="eyebrow">МОЯ КОЛЛЕКЦИЯ</p>
            <h1>
              Мои <strong>предметы</strong>
            </h1>
            <p>
              {user
                ? `${inventory.length} предметов в свинкопарке · продажа за полную цену`
                : "Войди, чтобы увидеть инвентарь"}
            </p>
            {inventory.length > 0 && (
              <button
                className="pig-button sell-all"
                disabled={sellingAll}
                onClick={sellAll}
              >
                {sellingAll
                  ? "Продаём предметы…"
                  : `Продать всё · ${coins(inventory.reduce((sum, entry) => sum + entry.item.price, 0))} SC`}
              </button>
            )}
          </div>
          {inventory.length ? (
            <div className="inventory-grid">
              {inventory.map((entry) => (
                <InventoryCard
                  key={entry.id}
                  entry={entry}
                  selling={sellingAll || sellingIds.has(entry.id)}
                  onSell={sell}
                />
              ))}
            </div>
          ) : (
            <EmptyInventory onClick={() => setPage("cases")} />
          )}
        </section>
      )}
      {page === "profile" && (
        <section className="page compact-page">
          <div className="profile-banner">
            <div className="profile-pig">🐷</div>
            <div>
              <p className="eyebrow">СВИНОПРОФИЛЬ</p>
              <h1>{user?.username || "Гость"}</h1>
              <p>
                {user
                  ? `В стае с ${new Date(user.createdAt).toLocaleDateString("ru-RU")}`
                  : "Войди в аккаунт, чтобы сохранить свою коллекцию."}
              </p>
            </div>
            <button
              className="login"
              onClick={() =>
                user
                  ? (localStorage.removeItem("svino-token"),
                    setToken(""),
                    setUser(null))
                  : setAuthOpen(true)
              }
            >
              {user ? "Выйти" : "Войти"}
            </button>
          </div>
          {user && (
            <>
              <div className="stat-row">
                <Stat value={coins(user.balance)} label="свинокоинов" />
                <Stat value={profile?.stats.opens || 0} label="открытий" />
                <Stat value={profile?.stats.upgrades || 0} label="апгрейдов" />
                <Stat value={profile?.stats.itemCount || 0} label="предметов" />
              </div>
              <DailyStreakCalendar
                streak={profile?.streak || null}
                busy={streakBusy}
                onClaim={claimDailyStreak}
              />
              <div className="profile-columns">
                <section className="panel profile-top-drop">
                  <p className="eyebrow">ЛИЧНЫЙ РЕКОРД</p>
                  <h3>Топ-дроп</h3>
                  {profile?.topDrop ? (
                    <div>
                      <img src={profile.topDrop.item.image} alt="" />
                      <span>
                        <b>{profile.topDrop.item.name}</b>
                        <small>
                          {profile.topDrop.item.wear} · {coins(profile.topDrop.item.price)} SC
                        </small>
                      </span>
                    </div>
                  ) : (
                    <small>Открой кейс — здесь появится самый дорогой дроп.</small>
                  )}
                </section>
                <section className="panel daily-case">
                  <span>🎁</span>
                  <div>
                    <p className="eyebrow">КАЖДЫЕ 24 ЧАСА</p>
                    <h3>Ежедневный кейс</h3>
                    <p>Один предмет стоимостью от 5 000 до 200 000 SC.</p>
                    {profile?.daily?.available ? (
                      <button className="pig-button" onClick={claimDaily}>
                        Забрать кейс →
                      </button>
                    ) : (
                      <small>
                        Следующий:{" "}
                        {profile?.daily?.nextAt
                          ? new Date(profile.daily.nextAt).toLocaleString(
                              "ru-RU",
                            )
                          : "скоро"}
                      </small>
                    )}
                  </div>
                </section>
                <section className="panel pig-credit">
                  <span>💳</span>
                  <div>
                    <p className="eyebrow">ЕЖЕДНЕВНЫЙ СВИНОКРЕДИТ</p>
                    <h3>Пополнить баланс</h3>
                    <p>
                      Сегодня доступно ещё{" "}
                      <b>{coins(profile?.credit.remaining || 0)} SC</b> из 150
                      000 SC. Бери частями, когда удобно.
                    </p>
                    <div>
                      <input
                        type="number"
                        min="100"
                        max={Math.floor((profile?.credit.remaining || 0) / 100)}
                        value={creditAmount}
                        onChange={(event) =>
                          setCreditAmount(event.target.value)
                        }
                      />
                      <button
                        className="pig-button"
                        disabled={creditBusy || !profile?.credit.remaining}
                        onClick={takeCredit}
                      >
                        {creditBusy ? "ВЫДАЁМ…" : "ВЗЯТЬ КРЕДИТ →"}
                      </button>
                    </div>
                    <small>Счётчик обновится по киевскому дню.</small>
                  </div>
                </section>
                <section className="panel">
                  <h3>Промокод</h3>
                  <p>У свинок есть секретные коды.</p>
                  <PromoForm onSubmit={redeem} />
                </section>
                <ProfileUpgradeHistory
                  upgrades={profile?.upgradeHistory || []}
                />
                <section className="panel">
                  <h3>Последние операции</h3>
                  {profile?.transactions.map((transaction) => (
                    <div className="transaction" key={transaction.id}>
                      <span>{transaction.description}</span>
                      <b
                        className={
                          transaction.amount >= 0 ? "positive" : "negative"
                        }
                      >
                        {transaction.amount >= 0 ? "+" : ""}
                        {coins(transaction.amount)} SC
                      </b>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
        </section>
      )}
      {page === "profile" && user && (
        <ProfileCustomizer
          user={user}
          token={token}
          onSaved={setUser}
          toast={toast}
        />
      )}
      {page === "profile" && streakPrize && (
        <DailyStreakPrizeModal
          prize={streakPrize}
          onClose={() => setStreakPrize(null)}
        />
      )}
      {page === "chat" && (
        <section className="page compact-page chat-page">
          <div className="page-title left">
            <p className="eyebrow">СВИНОЧАТ</p>
            <h1>
              Стая <strong>онлайн</strong>
            </h1>
            <p>Будь милым, не спамь — свинки всё видят.</p>
          </div>
          <div className="chat-box">
            <div className="messages">
              {chat.length ? (
                chat.map((message) => (
                  <div className="message" key={message.id}>
                    <span>🐷</span>
                    <div>
                      <b>{message.user.username}</b>
                      <p>{message.message}</p>
                    </div>
                    <time>
                      {new Date(message.createdAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                ))
              ) : (
                <div className="empty-feed">Пока здесь тихо... 🐷</div>
              )}
            </div>
            <ChatForm disabled={!user} onSubmit={sendChat} />
          </div>
        </section>
      )}
      {page === "giveaways" && (
        <Giveaways giveaways={giveaways} onEnter={enterGiveaway} />
      )}
      {page === "games" && (
        <GamesHub
          onOpen={(game) => setPage(game)}
          dailyWinners={dailyWinners}
          onOpenProfile={openPublicProfile}
        />
      )}
      {page === "battles" && (
        <BattlePage
          token={token}
          cases={cases.filter((item) => item.openingStyle !== "MAGIC")}
          user={user}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
        />
      )}
      {page === "naval" && (
        <NavalPage
          token={token}
          user={user}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
        />
      )}
      {page === "mines" && (
        <MinesPage
          token={token}
          user={user}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
        />
      )}
      {page === "pigsty" && (
        <PigstyPage
          token={token}
          user={user}
          inventory={inventory}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
        />
      )}
      {page === "road" && (
        <PigRoadPage
          token={token}
          user={user}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
        />
      )}
      {page === "contract" && (
        <ContractPage
          token={token}
          user={user}
          inventory={inventory}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
        />
      )}
      {page === "crash" && (
        <CrashPage
          token={token}
          user={user}
          inventory={inventory}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
        />
      )}
      {page === "boss" && (
        <BossFightPage
          token={token}
          user={user}
          onRequireAuth={() => setAuthOpen(true)}
          onBalance={refreshPrivate}
          toast={toast}
          onOpenProfile={openPublicProfile}
        />
      )}
      {page === "leaderboard" && (
        <Leaderboard
          rows={leaderboard}
          currentUserId={user?.id}
          onOpen={openPublicProfile}
        />
      )}
      {page === "admin" && user?.role === "ADMIN" && (
        <AdminPanelV2 token={token} toast={toast} />
      )}

      {selectedCase && (
        <CaseModal
          data={selectedCase}
          count={count}
          setCount={setCount}
          opening={opening}
          balanceReward={caseBalanceReward}
          phase={casePhase}
          mode={caseMode}
          setMode={setCaseMode}
          onFinished={finishCaseAnimation}
          onClose={() => {
            if (casePhase !== "spinning") {
              localStorage.removeItem("svino-open-case");
              setSelectedCase(null);
              setCasePhase("idle");
              setOpening(null);
              setCaseBalanceReward(0);
              setCaseDropsSold(false);
            }
          }}
          onOpen={openCase}
          onSellDrops={sellCaseDrops}
          sellingCaseDrops={sellingCaseDrops}
          caseDropsSold={caseDropsSold}
          onOpenAgain={() => {
            setCasePhase("idle");
            setOpening(null);
            setCaseBalanceReward(0);
            setCaseDropsSold(false);
          }}
        />
      )}
      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onSubmit={login} />
      )}
      {onboardingOpen && user && (
        <OnboardingModal
          username={user.username}
          onClose={() => {
            localStorage.setItem(`svino-onboarding:${user.id}`, "seen");
            setOnboardingOpen(false);
          }}
          onStart={() => {
            localStorage.setItem(`svino-onboarding:${user.id}`, "seen");
            setOnboardingOpen(false);
            setPage("cases");
          }}
        />
      )}
      {publicProfile && (
        <PublicProfileModal
          profile={publicProfile}
          onClose={() => setPublicProfile(null)}
        />
      )}
      {onlineOpen && (
        <OnlinePiggiesModal
          users={onlineUsers}
          onClose={() => setOnlineOpen(false)}
          onOpen={(id) => {
            setOnlineOpen(false);
            openPublicProfile(id);
          }}
        />
      )}
      <button
        className="chat-fab"
        aria-label="Открыть чат"
        onClick={() => setPage("chat")}
      >
        💬
      </button>
      {notice && <div className="toast">🐷 {notice}</div>}
    </main>
  );
}

function SkinCard({
  skin,
  selected,
  onClick,
  note,
}: {
  skin: Skin;
  selected?: boolean;
  onClick?: () => void;
  note?: string;
}) {
  return (
    <button
      className={`skin-card ${rarity(skin.rarity)} ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <img
        src={skin.image}
        alt=""
        loading="lazy"
        onError={({ currentTarget }) => {
          currentTarget.onerror = null;
          currentTarget.src = "/skin-fallback.svg";
        }}
      />
      <span>{skin.wear}</span>
      <div>
        <b>{skin.name}</b>
        <em>{coins(skin.price)} SC</em>
        {note && <small>{note}</small>}
      </div>
    </button>
  );
}
function InventoryCard({
  entry,
  selling,
  onSell,
}: {
  entry: Inventory;
  selling: boolean;
  onSell: (id: string) => void;
}) {
  return (
    <article className={`inventory-card ${rarity(entry.item.rarity)}`}>
      <img
        src={entry.item.image}
        alt=""
        onError={({ currentTarget }) => {
          currentTarget.onerror = null;
          currentTarget.src = "/skin-fallback.svg";
        }}
      />
      <span>{entry.item.wear}</span>
      <b>{entry.item.name}</b>
      <em>{coins(entry.item.price)} SC</em>
      <small>Продажа: {coins(entry.item.price)} SC</small>
      <button
        className="login"
        disabled={selling}
        onClick={() => onSell(entry.id)}
      >
        {selling ? "Продажа…" : "Продать"}
      </button>
    </article>
  );
}
function UpgradeColumn({
  title,
  subtitle,
  children,
  empty,
  selectedSkins = [],
  selectedCaption,
  selectionLimit,
  onClear,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  empty?: string;
  selectedSkins?: Skin[];
  selectedCaption?: string;
  selectionLimit?: number;
  onClear?: () => void;
}) {
  const total = selectedSkins.reduce((sum, skin) => sum + skin.price, 0);
  return (
    <section className="upgrade-column">
      <div className="board-label">
        <span>🐷</span>
        <div>
          <b>{title}</b>
          <small>{subtitle}</small>
        </div>
      </div>
      <div
        className={`upgrade-selected ${selectedSkins.length ? "has-skin" : ""}`}
      >
        {selectedSkins.length ? (
          <>
            <small>{selectedCaption}</small>
            <div className="upgrade-selected-skins">
              {selectedSkins.slice(0, 5).map((skin) => (
                <img src={skin.image} alt="" key={skin.id} />
              ))}
              {selectedSkins.length > 5 && <b>+{selectedSkins.length - 5}</b>}
            </div>
            <b>
              {selectedSkins.length === 1
                ? selectedSkins[0].name
                : `${selectedSkins.length} скинов вместе`}
            </b>
            <em>{coins(total)} SC</em>
          </>
        ) : (
          <span>
            {title === "ЦЕЛЬ"
              ? "Выбери желаемый скин"
              : "Выбери скины из инвентаря"}
          </span>
        )}
      </div>
      {selectionLimit && (
        <div className="upgrade-selection-bar">
          <span>
            Выбрано:{" "}
            <b>
              {selectedSkins.length}/{selectionLimit}
            </b>
          </span>
          {onClear && (
            <button type="button" onClick={onClear}>
              Очистить
            </button>
          )}
        </div>
      )}
      {empty ? (
        <p className="select-empty">{empty}</p>
      ) : (
        <div className="choice-list">{children}</div>
      )}
    </section>
  );
}
function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
function Leaderboard({
  rows,
  currentUserId,
  onOpen,
}: {
  rows: LeaderboardRow[];
  currentUserId?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="page compact-page leaderboard-page">
      <div className="leaderboard-hero">
        <div>
          <p className="eyebrow">ОБЩИЙ РЕЙТИНГ · ДОСТУПЕН КАЖДОМУ</p>
          <h1>
            Лидер<strong>борд</strong>
          </h1>
          <p>
            Место определяется всем состоянием свинки: балансом и полной
            стоимостью скинов в инвентаре.
          </p>
        </div>
        <div className="leaderboard-cup">
          🏆
          <span>
            TOP
            <br />
            PIGS
          </span>
        </div>
      </div>
      <div className="leaderboard-table">
        <div className="leaderboard-head">
          <span>#</span>
          <span>Игрок</span>
          <span>Скины</span>
          <span>Баланс</span>
          <span>Капитал</span>
        </div>
        {rows.length ? (
          rows.map((row) => (
            <article
              className={`leaderboard-row ${row.id === currentUserId ? "is-me" : ""}`}
              key={row.id}
              onClick={() => onOpen(row.id)}
            >
              <b className={`rank rank-${Math.min(row.rank, 3)}`}>{row.rank}</b>
              <div className="leader-name">
                <span>{row.avatar || "🐷"}</span>
                <b>
                  {row.username}
                  {row.id === currentUserId && <small>это ты</small>}
                </b>
              </div>
              <span>
                {row.skins} шт. · {coins(row.inventoryValue)} SC
              </span>
              <span>{coins(row.balance)} SC</span>
              <strong>
                {coins(row.total)} <small>SC</small>
              </strong>
            </article>
          ))
        ) : (
          <div className="empty-feed">Лидерборд загружается…</div>
        )}
      </div>
    </section>
  );
}
function ProfileCustomizer({
  user,
  token,
  onSaved,
  toast,
}: {
  user: User;
  token: string;
  onSaved: (user: User) => void;
  toast: (text: string) => void;
}) {
  const avatars = [
    "🐷",
    "🐽",
    "👑",
    "🎰",
    "⚔️",
    "🦄",
    "🐸",
    "🦊",
    "🐯",
    "🦈",
    "👾",
    "🤖",
  ];
  const [avatar, setAvatar] = useState(user.avatar || "🐷");
  const [nickColor, setNickColor] = useState(user.nickColor || "#ffffff");
  const save = async () => {
    try {
      const data = await request("/api/profile/customize", token, {
        method: "PATCH",
        body: JSON.stringify({ avatar, nickColor }),
      });
      onSaved(data.user);
      toast("Профиль обновлён");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось обновить профиль",
      );
    }
  };
  return (
    <section className="page compact-page profile-customizer">
      <div className="panel">
        <p className="eyebrow">СВИНОСТИЛЬ</p>
        <h2>Настрой профиль</h2>
        <div className="avatar-gallery">
          {avatars.map((item) => (
            <button
              className={avatar === item ? "chosen" : ""}
              onClick={() => setAvatar(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <label>
          Цвет ника{" "}
          <input
            type="color"
            value={nickColor}
            onChange={(event) => setNickColor(event.target.value)}
          />
          <b style={{ color: nickColor }}>{user.username}</b>
        </label>
        <button className="pig-button" onClick={save}>
          Сохранить стиль →
        </button>
      </div>
    </section>
  );
}
function PublicProfileModal({
  profile,
  onClose,
}: {
  profile: {
    username: string;
    avatar: string | null;
    nickColor: string;
    createdAt: string;
    stats: { opens: number; upgrades: number; itemCount: number };
    topDrop: ProfileTopDrop;
  };
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="auth-modal public-profile">
        <button className="close" onClick={onClose}>
          ×
        </button>
        <div className="auth-pig">{profile.avatar || "🐷"}</div>
        <p className="eyebrow">ПУБЛИЧНЫЙ СВИНОПРОФИЛЬ</p>
        <h2 style={{ color: profile.nickColor }}>{profile.username}</h2>
        <p>
          В стае с {new Date(profile.createdAt).toLocaleDateString("ru-RU")}
        </p>
        <div className="stat-row">
          <Stat value={profile.stats.opens} label="открытий" />
          <Stat value={profile.stats.upgrades} label="апгрейдов" />
          <Stat value={profile.stats.itemCount} label="предметов" />
        </div>
        <section className="public-top-drop">
          <small>ЛУЧШИЙ ДРОП</small>
          {profile.topDrop ? (
            <div>
              <img src={profile.topDrop.item.image} alt="" />
              <span>
                <b>{profile.topDrop.item.name}</b>
                <em>{coins(profile.topDrop.item.price)} SC</em>
              </span>
            </div>
          ) : <p>Этот поросёнок ещё не показал свой топ-дроп.</p>}
        </section>
      </section>
    </div>
  );
}

function OnlinePiggiesModal({
  users,
  onClose,
  onOpen,
}: {
  users: OnlinePig[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="modal-backdrop online-piggies-backdrop">
      <section className="auth-modal online-piggies-modal">
        <button className="close" onClick={onClose}>×</button>
        <p className="eyebrow">ЖИВАЯ СВИНОСТАЯ</p>
        <h2>Кто сейчас на сайте</h2>
        <p>Нажми на свинку, чтобы открыть её статистику и топ-дроп.</p>
        <div>
          {users.length ? users.map((pig) => (
            <button key={pig.id} onClick={() => onOpen(pig.id)}>
              <span>{pig.avatar || "🐷"}</span>
              <b style={{ color: pig.nickColor }}>{pig.username}</b>
              <em>Смотреть профиль →</em>
            </button>
          )) : <small>Сейчас в стае только гости. Авторизованные игроки появятся здесь сразу.</small>}
        </div>
      </section>
    </div>
  );
}

const roadMultipliers = [
  1.05, 1.11, 1.18, 1.27, 1.38, 1.51, 1.67, 1.86, 2.1, 2.4, 2.78, 3.28,
  3.94, 4.85, 6.15, 8.05, 10.95, 15.8, 25.1, 48,
];
const roadPigImage =
  "https://i.ibb.co/yBRpJjPv/ae3fd723-35f3-40aa-9ac4-3703fd5c274f.png";
const roadPlatformImage =
  "https://i.ibb.co/fYP0tkFM/6accbe3c-0217-424c-8534-b58ca6f69576.png";

const pigstyPigImage = "https://i.ibb.co/7dJVxczV/9113d86c-57fa-495d-a54a-a7a5d22eff74.png";
function PigstyPage({
  token,
  user,
  inventory,
  onRequireAuth,
  onBalance,
  toast,
}: {
  token: string;
  user: User | null;
  inventory: Inventory[];
  onRequireAuth: () => void;
  onBalance: () => Promise<void>;
  toast: (text: string) => void;
}) {
  const [game, setGame] = useState<PigstyGame | null>(null);
  const [bombCount, setBombCount] = useState<1 | 2 | 3>(1);
  const [inventoryId, setInventoryId] = useState("");
  const [stakeMode, setStakeMode] = useState<"item" | "balance">(() => (inventory.length ? "item" : "balance"));
  const [amount, setAmount] = useState(1000);
  const clampAmount = (value: number) => Math.max(500, Math.min(555000, Math.round(value)));
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const playing = game?.status === "PLAYING";
  const selectedItem = inventory.find((item) => item.id === inventoryId);
  const lastChoice = game?.choices[game.choices.length - 1];
  useEffect(() => {
    if (!inventoryId && inventory[0]) setInventoryId(inventory[0].id);
  }, [inventory, inventoryId]);
  useEffect(() => {
    if (!token) { setGame(null); return; }
    void request("/api/pigsty", token).then((data) => setGame(data.game)).catch(() => setGame(null));
  }, [token]);
  const start = async () => {
    if (!user) return onRequireAuth();
    if (stakeMode === "item" && !inventoryId) return toast("Выбери предмет из инвентаря для ставки.");
    if (stakeMode === "balance" && (amount < 500 || amount > 555000)) return toast("Ставка — от 500 до 555 000 SC.");
    if (stakeMode === "balance" && amount * 100 > (user.balance || 0)) return toast("Недостаточно свинокоинов для такой ставки.");
    setBusy(true);
    try {
      const body = stakeMode === "item" ? { inventoryId, bombCount } : { amount: amount * 100, bombCount };
      const data = await request("/api/pigsty/start", token, { method: "POST", body: JSON.stringify(body) });
      setGame(data.game);
      playSiteSound("contract");
      await onBalance();
      toast("Свинарник открыт. Поймай курицу и не трогай бомбу!");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось начать игру");
    } finally { setBusy(false); }
  };
  const [flash, setFlash] = useState<{ choice: number } | null>(null);
  const choose = async (choice: number) => {
    if (!playing || busy) return;
    setBusy(true);
    try {
      const data = await request("/api/pigsty/open", token, { method: "POST", body: JSON.stringify({ choice }) });
      if (data.game.status === "LOST") {
        setGame(data.game);
        playSiteSound("hit");
        toast("Бум! Все бомбы в этом окне раскрыты.");
        setBusy(false);
      } else {
        setFlash({ choice });
        playSiteSound("card");
        toast(`Курица поймана! Теперь ${multiplier(data.game.multiplier)}.`);
        window.setTimeout(() => { setGame(data.game); setFlash(null); setBusy(false); }, 700);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось открыть окно");
      setBusy(false);
    }
  };
  const cashout = async () => {
    if (!playing || !game?.choices.length || busy) return;
    setBusy(true);
    try {
      const data = await request("/api/pigsty/cashout", token, { method: "POST" });
      setGame(data.game);
      playSiteSound("cashout");
      await onBalance();
      toast(`Забрано ${coins(data.game.payout)} SC!`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось забрать выигрыш");
    } finally { setBusy(false); }
  };
  return (
    <section className="page compact-page pigsty-page">
      <header className="pigsty-hero">
        <div><p className="eyebrow">PIGSTY RISK · ЧЕТЫРЕ ОКНА</p><h1>Свинский <strong>Свинарник</strong></h1><p>Поставь предмет, лови куриц и остановись до того, как сработает бомба.</p></div>
        <button className="pigsty-rules-button" onClick={() => setRulesOpen((value) => !value)}>Как играть? {rulesOpen ? "⌃" : "⌄"}</button>
      </header>
      {rulesOpen && <div className="pigsty-rules"><b>Выбери предмет и 1–3 бомбы.</b><span>На каждом ходу открой одно окно из четырёх. Курица повышает множитель, бомба забирает предмет. Выигрыш можно забрать после любой пойманной курицы.</span></div>}
      <div className="pigsty-layout pigsty-split">
        <aside className={`pigsty-controls pigsty-left-panel ${game ? "in-round" : "setup"}`}>
          {!game ? (
            <div className="pigsty-panel-content pigsty-bet-panel">
              <p className="eyebrow">ТВОЯ СТАВКА</p>
              <h2>Собери ставку</h2>
              <div className="pigsty-bombs"><b>Количество бомб</b><div>{([1, 2, 3] as const).map((count) => <button className={bombCount === count ? "chosen" : ""} key={count} onClick={() => setBombCount(count)}><span className="pigsty-bomb-dots">{Array.from({ length: count }, (_, i) => <i key={i} />)}</span><small>{count} {count === 1 ? "бомба" : "бомбы"}</small></button>)}</div></div>
              <div className="pigsty-stake-tabs"><button className={stakeMode === "item" ? "chosen" : ""} onClick={() => setStakeMode("item")}>🗡 Инвентарь</button><button className={stakeMode === "balance" ? "chosen" : ""} onClick={() => setStakeMode("balance")}>💳 Баланс</button></div>
              {stakeMode === "item" ? <div className="pigsty-inventory">{inventory.length ? <div>{inventory.slice(0, 8).map((entry) => <button className={inventoryId === entry.id ? "chosen" : ""} onClick={() => setInventoryId(entry.id)} key={entry.id}><img src={entry.item.image} alt=""/><span><small>{entry.item.name}</small><em>{coins(entry.item.price)} SC</em></span></button>)}</div> : <p>Открой кейс, чтобы получить предмет для ставки.</p>}</div> : <div className="pigsty-amount"><div className="pigsty-amount-stepper"><button type="button" onClick={() => setAmount((value) => clampAmount(value - 100))}>−</button><span>🪙 {amount.toLocaleString("ru-RU")} SC</span><button type="button" onClick={() => setAmount((value) => clampAmount(value + 100))}>+</button></div><div className="pigsty-amount-presets"><button type="button" onClick={() => setAmount((value) => clampAmount(value / 2))}>1/2</button><button type="button" onClick={() => setAmount((value) => clampAmount(value * 2))}>×2</button><button type="button" onClick={() => setAmount((value) => clampAmount(value * 3))}>×3</button><button type="button" onClick={() => setAmount(clampAmount((user?.balance || 0) / 100))}>Всё</button></div></div>}
              <button className="pig-button pigsty-action" disabled={busy || (stakeMode === "item" ? !selectedItem : amount < 500)} onClick={start}>НАЧАТЬ ИГРУ →</button>
            </div>
          ) : (
            <div className="pigsty-panel-content pigsty-round-panel" aria-busy={busy}>
              <p className="eyebrow">СВИНАРНИК · ХОД {playing ? game.round : game.choices.length}</p>
              <div className="pigsty-stake-chip">{game.stakeItem.id === "BALANCE" ? <span className="pigsty-coin-icon">🐷</span> : <img src={game.stakeItem.image} alt=""/>}<span><small>СТАВКА</small><b>{game.stakeItem.id === "BALANCE" ? "Свинокоины" : game.stakeItem.name}</b></span><em>{coins(game.stakeItem.price)} SC</em></div>
              {playing ? <><div className="pigsty-prize"><span>МОЖЕШЬ ЗАБРАТЬ</span><b>{coins(game.payout)} SC</b><small>{multiplier(game.multiplier)} · поймано {game.choices.length}</small></div><div className="pigsty-choice-grid">{Array.from({ length: 4 }, (_, choice) => { const bomb = game.status === "LOST" && game.revealedBombs?.includes(choice); const caught = flash?.choice === choice; return <button key={choice} className={`pigsty-choice ${bomb ? "bomb" : caught ? "caught" : "hidden"}`} disabled={busy} onClick={() => choose(choice)}><i>{bomb ? "💣" : caught ? "🐔" : "?"}</i><b>{caught ? "ПОЙМАНА!" : `ОКНО ${choice + 1}`}</b><small>{caught ? `+${multiplier(game.multiplier)}` : "ОТКРЫТЬ"}</small></button>; })}</div><p className="pigsty-round-hint">Выбери одно окно: внутри курица или бомба.</p><button className="pig-button pigsty-action cashout" disabled={busy || !game.choices.length} onClick={cashout}>{game.choices.length ? `ЗАБРАТЬ ${coins(game.payout)} SC →` : "СНАЧАЛА ПОЙМАЙ КУРИЦУ"}</button></> : <><div className={`pigsty-result ${game.status === "LOST" ? "lost" : ""}`}><b>{game.status === "LOST" ? "Свинка попалась на бомбу" : "Свинка унесла приз"}</b><strong>{game.status === "LOST" ? "💥 Раунд завершён" : `${coins(game.payout)} SC`}</strong></div>{game.status === "LOST" && <div className="pigsty-choice-grid reveal">{Array.from({ length: 4 }, (_, choice) => { const bomb = game.revealedBombs?.includes(choice); const picked = lastChoice?.choice === choice; return <div key={choice} className={`pigsty-choice ${bomb ? "bomb" : "safe"} ${picked ? "picked" : ""}`}><i>{bomb ? "💣" : "🐔"}</i><b>{picked ? "ТВОЙ ВЫБОР" : bomb ? "БОМБА" : "БЕЗОПАСНО"}</b><small>{bomb ? "вот где она была" : "курица"}</small></div>; })}</div>}<button className="pig-button pigsty-action" onClick={() => { setGame(null); setFlash(null); }}>НОВЫЙ РАУНД →</button></>}
            </div>
          )}
        </aside>
        <section className={`pigsty-stage ${playing ? "playing" : ""} ${game ? game.status.toLowerCase() : "setup"}`}>
          <div className="pigsty-stage-top"><span>🐷 СВИНАРНИК</span><b>{playing ? "СВИНКА НА ОХОТЕ" : "ЧЕТЫРЕ ОКНА"}</b></div>
          <div className="pigsty-notice">{playing ? "Лови курицу, но не разбуди бомбу." : "Выбери ставку слева и начни раунд."}</div>
          <img className={`pigsty-pig ${flash ? "caught" : ""} ${game?.status === "LOST" ? "lost" : ""}`} src={pigstyPigImage} alt="Свинка-охотник" />
          {flash && <span className="pigsty-flying-chicken">🐔</span>}
          {game && <div className="pigsty-stage-footer"><span>Бомб: <b>{game.bombCount}</b></span><span>Следующая курица: <b>{playing ? multiplier(game.multiplier * ({ 1: 1.24, 2: 1.78, 3: 3.18 }[game.bombCount])) : "?"}</b></span></div>}
        </section>
      </div>
    </section>
  );
}

function PigRoadPage({
  token,
  user,
  onRequireAuth,
  onBalance,
  toast,
}: {
  token: string;
  user: User | null;
  onRequireAuth: () => void;
  onBalance: () => Promise<void>;
  toast: (text: string) => void;
}) {
  const [game, setGame] = useState<RoadGame | null>(null);
  const [stake, setStake] = useState("500");
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const [roadShift, setRoadShift] = useState(false);
  const [roadWin, setRoadWin] = useState<RoadGame | null>(null);
  const playing = game?.status === "PLAYING";
  const stakeCoins = Math.floor(Number(stake) || 0);
  const nextMultiplier = playing
    ? roadMultipliers[game.steps.length] || 48
    : roadMultipliers[0];
  const load = async () => {
    if (!token) {
      setGame(null);
      return;
    }
    try {
      const data = await request("/api/road", token);
      setGame(data.game);
      setRoundKey((key) => key + 1);
      if (data.game.last?.safe) {
        setRoadShift(true);
        window.setTimeout(() => setRoadShift(false), 680);
      }
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить Свинорейс",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [token]);
  const start = async () => {
    if (!user) return onRequireAuth();
    if (stakeCoins < 500 || stakeCoins > 555000)
      return toast("Ставка — от 500 до 555 000 SC");
    setBusy(true);
    try {
      const data = await request("/api/road/start", token, {
        method: "POST",
        body: JSON.stringify({ wager: stakeCoins * 100 }),
      });
      setGame(data.game);
      setRoundKey((key) => key + 1);
      await onBalance();
      toast("Свинья на старте. Выбери платформу!");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось начать Свинорейс",
      );
    } finally {
      setBusy(false);
    }
  };
  const step = async (choice: number) => {
    if (!playing || busy) return;
    setBusy(true);
    try {
      const data = await request("/api/road/step", token, {
        method: "POST",
        body: JSON.stringify({ choice }),
      });
      setGame(data.game);
      setRoundKey((key) => key + 1);
      playSiteSound(data.game.last?.safe ? "card" : "hit");
      await onBalance();
      if (!data.game.last?.safe)
        toast("Платформа была заминирована — ставка сгорела.");
      if (data.game.status === "WON") {
        setRoadWin(data.game);
        toast(`Свинья добралась до финиша: ${coins(data.game.payout)} SC!`);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Шаг не выполнен");
    } finally {
      setBusy(false);
    }
  };
  const cashout = async () => {
    if (!playing || !game.steps.length) return;
    setBusy(true);
    try {
      const data = await request("/api/road/cashout", token, {
        method: "POST",
      });
      setGame(data.game);
      playSiteSound("cashout");
      await onBalance();
      toast(`Забрано ${coins(data.game.payout)} SC!`);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось забрать выигрыш",
      );
    } finally {
      setBusy(false);
    }
  };
  const completedSteps = game?.steps.length || 0;
  const stepsToFinish = Math.max(0, (game?.maxSteps || roadMultipliers.length) - completedSteps);
  const visibleRoadSteps = [completedSteps - 1, completedSteps, completedSteps + 1, completedSteps + 2];
  return (
    <section className="page compact-page road-page">
      <header className="road-hero">
        <div>
          <p className="eyebrow">PIGGY ROAD · СРЕДНИЙ РЕЖИМ</p>
          <h1>
            Свиная <strong>дорога</strong>
          </h1>
          <p>
            Выбери платформу, проведи свинью по дороге из 20 шагов и забери
            выигрыш до ловушки.
          </p>
        </div>
        <button onClick={() => setRulesOpen((open) => !open)}>
          Как играть? {rulesOpen ? "⌃" : "⌄"}
        </button>
      </header>
      {rulesOpen && (
        <div className="road-rules">
          <b>Средний режим · до ×48.</b>
          <span>
            Ставь 500–555 000 SC, нажимай следующую платформу и забирай
            выигрыш после любого безопасного шага. Дальнейший путь всегда
            виден на карте дороги.
          </span>
        </div>
      )}
      <div className="road-game">
        <section
          className={`road-stage ${game?.status?.toLowerCase() || "idle"}`}
        >
          <div className="road-stage-top">
            <span>
              🐷 ШАГ{" "}
              {playing
                ? game.steps.length + 1
                : game?.status === "WON"
                  ? game.maxSteps
                  : 1}
              /{game?.maxSteps || 20}
            </span>
            <strong>
              {playing
                ? "ВЫБЕРИ ПЛАТФОРМУ"
                : game?.status === "LOST"
                  ? "СВИНЬЯ СНЯТА С ДИСТАНЦИИ"
                  : game?.status === "WON"
                    ? "ДОРОГА ПРОЙДЕНА!"
                    : "ДОРОГА ЖДЁТ СВИНЬЮ"}
            </strong>
          </div>
          <div
            className="road-route-preview"
            aria-label="Дорога из двадцати шагов"
          >
            {Array.from({ length: game?.maxSteps || roadMultipliers.length }, (_, index) => (
              <span
                className={
                  index < (game?.steps.length || 0)
                    ? "passed"
                    : index === (game?.steps.length || 0) && playing
                      ? "current"
                      : ""
                }
                key={index}
              >
                <img src={roadPlatformImage} alt="" />
                <b>{index + 1}</b>
              </span>
            ))}
          </div>
          <div className={`road-pig-lane ${game ? "in-run" : ""}`}>
            <img
              className="road-pig"
              src={roadPigImage}
              alt="Свинья на старте"
            />
            <div className="road-finish">
              <span>🏁</span>
              <b>
                {stepsToFinish === 0
                  ? "ФИНИШ ПОКОРЁН"
                  : stepsToFinish === 1
                    ? "ФИНИШ УЖЕ РЯДОМ"
                    : `ДО ФИНИША · ${stepsToFinish} ${stepsToFinish === 2 || stepsToFinish === 3 || stepsToFinish === 4 ? "ПЛАТФОРМЫ" : "ПЛАТФОРМ"}`}
              </b>
              {stepsToFinish > 0 && <small>главный приз ×48</small>}
            </div>
          </div>
          <div className={`road-platform-strip ${roadShift ? "slide-forward" : ""}`} key={roundKey}>
            {visibleRoadSteps.map((stepIndex, index) => {
              const start = stepIndex < 0;
              const passed = stepIndex >= 0 && stepIndex < completedSteps;
              const standing = passed && stepIndex === completedSteps - 1;
              const active = playing && stepIndex === completedSteps;
              const failed = game?.status === "LOST" && game.last?.choice === stepIndex;
              const future = stepIndex > completedSteps;
              const state = failed ? "mine" : passed ? "safe" : active ? "active" : future ? "future" : "start";
              const stepMultiplier = start ? 1 : roadMultipliers[Math.min(roadMultipliers.length - 1, stepIndex)] || 48;
              return (
                <button
                  disabled={!active || busy}
                  onClick={() => step(stepIndex)}
                  className={`road-platform ${state}`}
                  key={`${stepIndex}-${index}`}
                >
                  <img
                    className="road-platform-art"
                    src={roadPlatformImage}
                    alt="Платформа"
                  />
                  <span className="road-platform-grate">
                    {standing ? "🐷" : failed ? "💣" : active ? "➜" : start ? "🐷" : "✦"}
                  </span>
                  {standing && <img className="road-run-pig" src={roadPigImage} alt="Свинья на пройденной платформе"/>}
                  <b>{standing ? "ПРОЙДЕНО" : failed ? "ЛОВУШКА" : active ? "СДЕЛАТЬ ШАГ" : start ? "СТАРТ" : "ДАЛЬШЕ"}</b>
                  <em>{multiplier(stepMultiplier)}</em>
                </button>
              );
            })}
          </div>
          <div className="road-stage-footer">
            <span>
              Текущий множитель <b>{multiplier(game?.multiplier || 1)}</b>
            </span>
            <span>
              Следующий шаг <b>{multiplier(nextMultiplier)}</b>
            </span>
          </div>
        </section>
        <aside className="road-controls">
          <p className="eyebrow">СВИНОСТАВКА</p>
          <h2>
            {playing
              ? "Прыгай аккуратно"
              : game?.status === "LOST"
                ? "Попробовать снова"
                : game?.status === "WON"
                  ? "Дорога покорена"
                  : "Подготовь забег"}
          </h2>
          <label>
            Сумма ставки, SC
            <input
              type="number"
              min="500"
              max="555000"
              disabled={playing}
              value={stake}
              onChange={(event) => setStake(event.target.value)}
            />
          </label>
          <div className="road-quick">
            <button disabled={playing} onClick={() => setStake("500")}>
              500
            </button>
            <button
              disabled={playing}
              onClick={() =>
                setStake(
                  String(
                    Math.min(555000, Math.floor((user?.balance || 0) / 200)),
                  ),
                )
              }
            >
              50%
            </button>
            <button
              disabled={playing}
              onClick={() =>
                setStake(
                  String(
                    Math.min(555000, Math.floor((user?.balance || 0) / 100)),
                  ),
                )
              }
            >
              MAX
            </button>
          </div>
          <div className="road-odds">
            <strong>Максимум {multiplier(48)}</strong>
            <small>Каждая новая платформа повышает твой выигрыш.</small>
          </div>
          {playing && game.steps.length > 0 && (
            <div className="road-cashout-preview">
              Сейчас можно забрать{" "}
              <b>{coins(Math.floor(game.wager * game.multiplier))} SC</b>
            </div>
          )}
          <button
            className={`pig-button road-action ${playing ? "cashout" : ""}`}
            disabled={busy || (playing && !game.steps.length)}
            onClick={playing ? cashout : start}
          >
            {busy
              ? "СВИНЬЯ ДУМАЕТ…"
              : playing
                ? `ЗАБРАТЬ ${coins(Math.floor(game.wager * game.multiplier))} SC →`
                : `НАЧАТЬ ЗА ${coins(stakeCoins * 100)} SC →`}
          </button>
        </aside>
      </div>
      {roadWin && (
        <div className="road-win-backdrop" role="presentation">
          <section className="road-win-modal" role="dialog" aria-modal="true">
            <span className="road-win-sparkles">✦ ✧ ✦</span>
            <small>СВИНАЯ ДОРОГА · ФИНИШ</small>
            <div className="road-win-pig">
              <img src={roadPigImage} alt="Свинья-победитель" />
              <span>🏆</span>
            </div>
            <h2>Дорога пройдена!</h2>
            <p>Свинья прошла все {roadWin.maxSteps} платформ и забрала главный приз.</p>
            <b>{multiplier(roadWin.multiplier)} · {coins(roadWin.payout)} SC</b>
            <button className="pig-button" onClick={() => setRoadWin(null)}>
              ЗАБРАТЬ ПРИЗ →
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

const minesMultiplierTable: Record<3 | 6 | 9, number[]> = {
  3: [
    1.07, 1.22, 1.4, 1.62, 1.89, 2.22, 2.63, 3.15, 3.82, 4.7, 5.87, 7.47, 9.71,
    12.94, 17.79, 25.41, 38.11, 60.97, 106.69, 213.38, 533.45, 2133.8,
  ],
  6: [
    1.25, 1.66, 2.24, 3.08, 4.31, 6.15, 8.98, 13.47, 20.81, 33.29, 55.48, 97.09,
    180.31, 360.62, 793.36, 1983.4, 5950.2, 23800.8, 166605.6,
  ],
  9: [
    1.48, 2.36, 3.87, 6.54, 11.44, 20.8, 39.52, 79.04, 167.96, 383.9, 959.75,
    2687.3, 8733.72, 34934.88, 192141.84, 1921418.4,
  ],
};
function MinesPage({
  token,
  user,
  onRequireAuth,
  onBalance,
  toast,
}: {
  token: string;
  user: User | null;
  onRequireAuth: () => void;
  onBalance: () => Promise<void>;
  toast: (text: string) => void;
}) {
  const [game, setGame] = useState<MinesGame | null>(null);
  const [stake, setStake] = useState("500");
  const [mineCount, setMineCount] = useState<3 | 6 | 9>(3);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const playing = game?.status === "PLAYING";
  const stakeCoins = Math.floor(Number(stake) || 0);
  const table = minesMultiplierTable[playing ? game.mineCount : mineCount];
  const nextMultiplier = playing ? table[game.opened.length] : table[0];
  const load = async () => {
    if (!token) {
      setGame(null);
      return;
    }
    try {
      const data = await request("/api/mines", token);
      setGame(data.game);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось загрузить мины",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [token]);
  const start = async () => {
    if (!user) return onRequireAuth();
    if (stakeCoins < 500 || stakeCoins > 555000)
      return toast("Ставка — от 500 до 555 000 SC");
    setBusy(true);
    try {
      const data = await request("/api/mines/start", token, {
        method: "POST",
        body: JSON.stringify({ wager: stakeCoins * 100, mineCount }),
      });
      playSiteSound("contract");
      setGame(data.game);
      await onBalance();
      toast("Поле заряжено. Выбирай осторожно!");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось начать игру");
    } finally {
      setBusy(false);
    }
  };
  const openCell = async (cell: number) => {
    if (!playing || busy || game.opened.includes(cell)) return;
    setBusy(true);
    try {
      const data = await request("/api/mines/open", token, {
        method: "POST",
        body: JSON.stringify({ cell }),
      });
      playSiteSound(
        data.game.status === "LOST"
          ? "hit"
          : data.game.status === "WON"
            ? "win"
            : "card",
      );
      setGame(data.game);
      await onBalance();
      if (data.game.status === "LOST") toast("Бум! Эта клетка была миной.");
      if (data.game.status === "WON")
        toast(`Поле очищено — ${coins(data.game.payout)} SC твои!`);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось открыть клетку",
      );
    } finally {
      setBusy(false);
    }
  };
  const autoPick = () => {
    if (!playing || busy || !game) return;
    const closedCells = Array.from({ length: 25 }, (_, cell) => cell).filter(
      (cell) => !game.opened.includes(cell),
    );
    if (!closedCells.length) return;
    const cell = closedCells[Math.floor(Math.random() * closedCells.length)];
    void openCell(cell);
  };
  const cashout = async () => {
    if (!playing || !game.opened.length) return;
    setBusy(true);
    try {
      const data = await request("/api/mines/cashout", token, {
        method: "POST",
      });
      playSiteSound("cashout");
      setGame(data.game);
      await onBalance();
      toast(`Забрал ${coins(data.game.payout)} SC!`);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось забрать выигрыш",
      );
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setGame(null);
    setStake("500");
    setMineCount(3);
  };
  return (
    <section className="page compact-page mines-page">
      <header className="mines-hero">
        <div>
          <p className="eyebrow">PIGGY MINES · ИГРА НА ОСТОРОЖНОСТЬ</p>
          <h1>
            Свиные <strong>мины</strong>
          </h1>
          <p>
            Открывай клетки с поросятами, обходи бомбы и забирай выигрыш в любой
            момент.
          </p>
        </div>
        <button
          className="mines-rules"
          onClick={() => setRulesOpen((open) => !open)}
        >
          Как играть? <b>{rulesOpen ? "⌃" : "⌄"}</b>
        </button>
      </header>
      {rulesOpen && (
        <div className="mines-rules-copy">
          <b>🐷 Поросёнок повышает множитель, 💣 бомба забирает ставку.</b>
          <span>
            Чем больше мин на поле, тем выше награда. Очистишь все безопасные
            клетки — приз зачислится автоматически.
          </span>
        </div>
      )}
      <div className="mines-layout">
        <section className="mines-stage">
          <div className="mines-stage-head">
            <div>
              <span>🐽</span>
              <b>
                {playing ? `ХОД ${game.opened.length + 1}` : "ГОТОВ К РИСКУ"}
              </b>
            </div>
            <div>
              <small>
                {playing ? "ТЕКУЩИЙ МНОЖИТЕЛЬ" : "ПЕРВЫЙ МНОЖИТЕЛЬ"}
              </small>
              <strong>{multiplier(playing ? game.multiplier : 1)}</strong>
            </div>
          </div>
          <div className="mines-grid">
            {Array.from({ length: 25 }, (_, cell) => {
              const opened = Boolean(game?.opened.includes(cell));
              const mine = opened && Boolean(game?.mines?.includes(cell));
              return (
                <button
                  key={cell}
                  disabled={!playing || opened || busy}
                  onClick={() => openCell(cell)}
                  className={`mines-cell ${opened ? (mine ? "mine" : "safe") : ""}`}
                >
                  {opened ? mine ? "💣" : "🐷" : <span>🐽</span>}
                </button>
              );
            })}
          </div>
          {playing && (
            <div className="mines-progress">
              <span>
                Безопасных открыто:{" "}
                <b>
                  {game.opened.length}/{game.safeTotal}
                </b>
              </span>
              <span>
                Следующий шанс:{" "}
                <b>{nextMultiplier ? multiplier(nextMultiplier) : "финал"}</b>
              </span>
            </div>
          )}
          {game && !playing && (
            <div className={`mines-result ${game.status.toLowerCase()}`}>
              <span>{game.status === "LOST" ? "💣" : "🏆"}</span>
              <div>
                <b>
                  {game.status === "LOST"
                    ? "Мина поймала свинку"
                    : game.status === "WON"
                      ? "Поле полностью очищено!"
                      : "Выигрыш забран!"}
                </b>
                <small>
                  {game.status === "LOST"
                    ? "В этот раз ставка сгорела. Попробуешь снова?"
                    : `${multiplier(game.multiplier)} · ${coins(game.payout)} SC уже на балансе`}
                </small>
              </div>
              <button onClick={reset}>Новая игра →</button>
            </div>
          )}
        </section>
        <aside className="mines-controls">
          <p className="eyebrow">СВИНОСТАВКА</p>
          <h2>Настрой поле</h2>
          <label>
            Ставка, SC
            <input
              type="number"
              min="500"
              max="555000"
              disabled={playing}
              value={stake}
              onChange={(event) => setStake(event.target.value)}
            />
          </label>
          <div className="mines-quick">
            <button disabled={playing} onClick={() => setStake("500")}>
              MIN
            </button>
            <button
              disabled={playing}
              onClick={() =>
                setStake(
                  String(
                    Math.min(
                      555000,
                      Math.max(500, Math.floor((user?.balance || 0) / 200)),
                    ),
                  ),
                )
              }
            >
              50%
            </button>
            <button
              disabled={playing}
              onClick={() =>
                setStake(
                  String(
                    Math.min(555000, Math.floor((user?.balance || 0) / 100)),
                  ),
                )
              }
            >
              MAX
            </button>
          </div>
          <div className="mine-count">
            <span>💣 Количество мин</span>
            <div>
              {([3, 6, 9] as const).map((count) => (
                <button
                  disabled={playing}
                  className={mineCount === count ? "chosen" : ""}
                  key={count}
                  onClick={() => setMineCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
            <small>
              {25 - mineCount} безопасных клеток · первый ход{" "}
              {multiplier(minesMultiplierTable[mineCount][0])}
            </small>
          </div>
          <div className="mines-summary">
            <span>
              Баланс <b>{coins(user?.balance || 0)} SC</b>
            </span>
            <span>
              {playing
                ? `Можно забрать ${coins(game.payout)} SC`
                : `Ставка ${new Intl.NumberFormat("ru-RU").format(stakeCoins || 0)} SC`}
            </span>
          </div>
          {playing ? (
            <div className="mines-live-actions">
              <button
                className="mines-auto-pick"
                disabled={busy}
                onClick={autoPick}
                title="Открыть случайную закрытую клетку"
              >
                <span>🎲</span>
                <b>АВТОВЫБОР</b>
                <small>случайная клетка</small>
              </button>
              <button
                className="pig-button mines-action cashout"
                disabled={busy || !game.opened.length}
                onClick={cashout}
              >
                {game.opened.length
                  ? `ЗАБРАТЬ ${coins(game.payout)} SC →`
                  : "ОТКРОЙ ПЕРВУЮ КЛЕТКУ"}
              </button>
            </div>
          ) : (
            <button
              className="pig-button mines-action"
              disabled={busy}
              onClick={start}
            >
              {busy ? "ЗАРЯЖАЕМ ПОЛЕ…" : "НАЧАТЬ ИГРУ →"}
            </button>
          )}
          <div className="mines-ladder">
            <small>МНОЖИТЕЛИ В ЭТОЙ ИГРЕ</small>
            <div>
              {table.slice(0, 7).map((value, index) => (
                <span
                  className={
                    playing && game.opened.length === index + 1 ? "current" : ""
                  }
                  key={value}
                >
                  {multiplier(value)}
                </span>
              ))}
              <i>…</i>
              <span>{multiplier(table[table.length - 1])}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ScratchReveal({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const marks = useRef(new Set<number>());
  const done = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      const glow = context.createRadialGradient(
        rect.width / 2,
        rect.height * 0.4,
        2,
        rect.width / 2,
        rect.height / 2,
        Math.max(rect.width, rect.height) * 0.72,
      );
      glow.addColorStop(0, "#442040");
      glow.addColorStop(0.48, "#180d22");
      glow.addColorStop(1, "#07070c");
      context.fillStyle = glow;
      context.fillRect(0, 0, rect.width, rect.height);
      context.strokeStyle = "#8b457d";
      context.lineWidth = 2;
      context.strokeRect(2, 2, rect.width - 4, rect.height - 4);
      context.setLineDash([5, 7]);
      context.strokeStyle = "#f16eb37a";
      context.strokeRect(12, 12, rect.width - 24, rect.height - 24);
      context.setLineDash([]);
      context.fillStyle = "#ffd8eb";
      context.shadowColor = "#ff4da7";
      context.shadowBlur = 20;
      context.font = "900 76px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("?", rect.width / 2, rect.height * 0.46);
      context.shadowBlur = 0;
      context.fillStyle = "#d895bc";
      context.font = "900 10px sans-serif";
      context.fillText(
        "СОТРИ, ЧТОБЫ УЗНАТЬ",
        rect.width / 2,
        rect.height * 0.71,
      );
    };
    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, []);
  const erase = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (done.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, 25, 0, Math.PI * 2);
    context.fill();
    const col = Math.min(9, Math.max(0, Math.floor((x / rect.width) * 10)));
    const row = Math.min(9, Math.max(0, Math.floor((y / rect.height) * 10)));
    marks.current.add(row * 10 + col);
    const next = marks.current.size;
    if (next >= 60) {
      done.current = true;
      context.clearRect(0, 0, canvas.width, canvas.height);
      onComplete();
    }
  };
  return (
    <div className="contract-scratch">
      <canvas
        ref={canvasRef}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          erase(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            erase(event);
        }}
      />
    </div>
  );
}

function ContractPage({
  token,
  user,
  inventory,
  onRequireAuth,
  onBalance,
  toast,
}: {
  token: string;
  user: User | null;
  inventory: Inventory[];
  onRequireAuth: () => void;
  onBalance: () => Promise<void>;
  toast: (text: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    inventoryId: string;
    item: Skin;
    stake: number;
    multiplier: number;
  } | null>(null);
  const [phase, setPhase] = useState<"idle" | "mixing" | "result">("idle");
  const [sellingResult, setSellingResult] = useState(false);
  const [mixingItems, setMixingItems] = useState<Inventory[]>([]);
  const [riskMode, setRiskMode] = useState(false);
  const [scratchDone, setScratchDone] = useState(false);
  const selectedItems = inventory.filter((entry) =>
    selected.includes(entry.id),
  );
  const shownItems = phase === "mixing" ? mixingItems : selectedItems;
  const stake = selectedItems.reduce((sum, entry) => sum + entry.item.price, 0);
  const toggle = (id: string) =>
    setSelected((items) =>
      items.includes(id)
        ? items.filter((item) => item !== id)
        : items.length < 10
          ? [...items, id]
          : items,
    );
  useEffect(() => {
    if (!token) return;
    request("/api/contracts/pending", token)
      .then((data) => {
        if (data.result) {
          setResult(data.result);
          setRiskMode(Boolean(data.result.riskMode));
          setScratchDone(!data.result.riskMode);
          setPhase("result");
        }
      })
      .catch(() => undefined);
  }, [token]);
  const create = async () => {
    if (!user) return onRequireAuth();
    if (selected.length < 3)
      return toast("Для контракта нужно минимум 3 скина.");
    setBusy(true);
    try {
      const data = await request("/api/contracts", token, {
        method: "POST",
        body: JSON.stringify({ sourceInventoryIds: selected, riskMode }),
      });
      setResult(data);
      setScratchDone(!riskMode);
      setMixingItems(selectedItems);
      setSelected([]);
      setPhase("mixing");
      playSiteSound("contract");
      await onBalance();
      window.setTimeout(() => {
        playSiteSound("reveal");
        setPhase("result");
      }, 2400);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Контракт не выполнен");
    } finally {
      setBusy(false);
    }
  };
  const keepResult = async () => {
    try {
      await request("/api/contracts/reveal", token, { method: "POST" });
      playSiteSound("win");
      await onBalance();
      setMixingItems([]);
      setPhase("idle");
      setResult(null);
      toast("Предмет оставлен в инвентаре.");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось раскрыть предмет",
      );
    }
  };
  const sellResult = async () => {
    if (!result) return;
    setSellingResult(true);
    try {
      await request("/api/contracts/reveal", token, { method: "POST" });
      const data = await request(
        `/api/inventory/${result.inventoryId}/sell`,
        token,
        { method: "POST" },
      );
      playSiteSound("sell");
      await onBalance();
      setMixingItems([]);
      setPhase("idle");
      setResult(null);
      toast(`Предмет продан за ${coins(data.payout)} SC.`);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось продать предмет",
      );
    } finally {
      setSellingResult(false);
    }
  };
  return (
    <section className="page compact-page contract-page">
      <header className="contract-hero">
        <div>
          <p className="eyebrow">PIGGY CONTRACT · SERVER VERIFIED</p>
          <h1>
            Свинский <strong>контракт</strong>
          </h1>
          <p>
            Положи от 3 до 10 скинов. Итоговый предмет стоит от 10% до 1000%
            общей суммы — большой окуп редкий, но реальный.
          </p>
        </div>
        <span>📜</span>
      </header>
      <div className="contract-layout">
        <section
          className={`contract-workbench ${phase === "mixing" ? "mixing" : ""}`}
        >
          <div className="contract-slots">
            {Array.from({ length: 10 }, (_, index) => {
              const entry = shownItems[index];
              return (
                <div className={entry ? "filled" : ""} key={index}>
                  {entry ? (
                    <>
                      <img src={entry.item.image} alt="" />
                      <button
                        disabled={phase !== "idle"}
                        onClick={() => toggle(entry.id)}
                      >
                        ×
                      </button>
                      <small>{coins(entry.item.price)} SC</small>
                    </>
                  ) : (
                    <span>🐽</span>
                  )}
                </div>
              );
            })}
          </div>
          {phase === "mixing" && (
            <div className="contract-mixer">
              <i>✦</i>
              <span>🐷</span>
              <b>СВИНЬИ МЕШАЮТ КОНТРАКТ…</b>
              <em>Печать уже на сервере</em>
            </div>
          )}
          <div className="contract-total">
            <span>ОБЩАЯ СТОИМОСТЬ</span>
            <b>
              {coins(phase === "mixing" && result ? result.stake : stake)}{" "}
              <small>SC</small>
            </b>
            <em>
              {phase === "mixing"
                ? `${mixingItems.length}/10 скинов`
                : `${selected.length}/10 скинов`}
            </em>
          </div>
          <button
            className={`contract-risk-toggle ${riskMode ? "chosen" : ""}`}
            disabled={phase !== "idle"}
            onClick={() => setRiskMode((value) => !value)}
          >
            <span>{riskMode ? "✦" : "?"}</span>
            <div>
              <b>Азартный контракт</b>
              <small>
                {riskMode
                  ? "Сотри скрытый дроп после смешивания"
                  : "Включить скрытие награды"}
              </small>
            </div>
            <i>{riskMode ? "ВКЛ" : "ВЫКЛ"}</i>
          </button>
          <button
            className="pig-button contract-action"
            disabled={busy || phase !== "idle" || selected.length < 3}
            onClick={create}
          >
            {busy || phase === "mixing"
              ? "СВИНЬИ ПОДПИСЫВАЮТ…"
              : selected.length < 3
                ? `ДОБАВЬ ЕЩЁ ${3 - selected.length} СКИНА`
                : `СОЗДАТЬ КОНТРАКТ · ${coins(stake)} SC →`}
          </button>
        </section>
        <aside className="contract-inventory">
          <div>
            <p className="eyebrow">ТВОЙ ИНВЕНТАРЬ</p>
            <h2>Выбери скины</h2>
            <small>Кликни по предмету. Можно собрать до 10 ячеек.</small>
          </div>
          <div className="contract-items">
            {inventory.length ? (
              inventory.map((entry) => (
                <SkinCard
                  key={entry.id}
                  skin={entry.item}
                  selected={selected.includes(entry.id)}
                  onClick={() => phase === "idle" && toggle(entry.id)}
                />
              ))
            ) : (
              <p>Открой кейсы — и предметы появятся здесь.</p>
            )}
          </div>
        </aside>
      </div>
      {result && phase === "result" && (
        <div className="modal-backdrop contract-prize-backdrop">
          <section className="contract-prize-modal">
            <div className="contract-prize-rays">✦ ✦ ✦</div>
            <p className="eyebrow">
              {riskMode && !scratchDone
                ? "АЗАРТНЫЙ КОНТРАКТ · СОТРИ ПОКРЫТИЕ"
                : "КОНТРАКТ РАСКРЫТ"}
            </p>
            <h2>
              {riskMode && !scratchDone
                ? "Секретный свинодроп"
                : "Свиньи подписали сделку!"}
            </h2>
            <div className="contract-prize-art">
              <img src={result.item.image} alt="" />
              {riskMode && !scratchDone && (
                <ScratchReveal onComplete={() => setScratchDone(true)} />
              )}
            </div>
            {!riskMode || scratchDone ? (
              <>
                <b>{result.item.name}</b>
                <em>
                  {result.item.wear} · {coins(result.item.price)} SC ·{" "}
                  {multiplier(result.multiplier)}
                </em>
                <p>Предмет скрывался от инвентаря до этого решения.</p>
                <div>
                  <button className="ghost-button" onClick={keepResult}>
                    Оставить в инвентаре
                  </button>
                  <button
                    className="pig-button"
                    disabled={sellingResult}
                    onClick={sellResult}
                  >
                    {sellingResult
                      ? "ПРОДАЁМ…"
                      : `ПРОДАТЬ ЗА ${coins(result.item.price)} SC →`}
                  </button>
                </div>
              </>
            ) : (
              <p className="scratch-tip">
                Води мышкой или пальцем по чёрному вопросу. После 60% награда
                раскроется сама.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function CrashPage({
  token,
  user,
  inventory,
  onRequireAuth,
  onBalance,
  toast,
}: {
  token: string;
  user: User | null;
  inventory: Inventory[];
  onRequireAuth: () => void;
  onBalance: () => Promise<void>;
  toast: (text: string) => void;
}) {
  const [round, setRound] = useState<CrashRound | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string; multiplier: number }>
  >([]);
  const [bet, setBet] = useState<CrashBet | null>(null);
  const [balanceStake, setBalanceStake] = useState("500");
  const [skinIds, setSkinIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [displayMultiplier, setDisplayMultiplier] = useState(1);
  const multiplierRef = useRef(1);
  const [now, setNow] = useState(() => Date.now());
  const selectedSkins = inventory.filter((entry) => skinIds.includes(entry.id));
  const balanceValue = Math.max(0, Math.floor(Number(balanceStake) || 0)) * 100;
  const skinValue = selectedSkins.reduce(
    (sum, entry) => sum + entry.item.price,
    0,
  );
  const stake = balanceValue + skinValue;
  const reload = async () => {
    try {
      const data = await request("/api/crash");
      setRound(data.round);
      setHistory(data.history || []);
      if (token) {
        const mine = await request("/api/crash/me", token);
        setBet(mine.bet);
      } else setBet(null);
    } catch {
      /* transient polling failure must not wipe an active bet */
    }
  };
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => {
      void reload();
    }, 900);
    return () => window.clearInterval(timer);
  }, [token]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const target =
      round?.phase === "CRASHED"
        ? round.crashMultiplier || 1
        : round?.currentMultiplier || 1;
    const from = multiplierRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 920);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (target - from) * eased;
      multiplierRef.current = value;
      setDisplayMultiplier(value);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [round?.phase, round?.currentMultiplier, round?.crashMultiplier]);
  const toggleSkin = (id: string) =>
    setSkinIds((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  const placeBet = async () => {
    if (!user) return onRequireAuth();
    if (stake < 50_000 || stake > 55_500_000)
      return toast("Общая ставка — от 500 до 555 000 SC.");
    setBusy(true);
    try {
      const data = await request("/api/crash/bet", token, {
        method: "POST",
        body: JSON.stringify({
          balanceStake: balanceValue,
          skinInventoryIds: skinIds,
        }),
      });
      setBet(data.bet);
      setSkinIds([]);
      await onBalance();
      await reload();
      toast("Ставка принята. Ждём взлёт коэффициента!");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ставка не принята");
    } finally {
      setBusy(false);
    }
  };
  const cashout = async () => {
    setBusy(true);
    try {
      const data = await request("/api/crash/cashout", token, {
        method: "POST",
      });
      playSiteSound("cashout");
      setBet(data.bet);
      await onBalance();
      await reload();
      toast(`Забрано ${coins(data.payout)} SC!`);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось вывести ставку",
      );
    } finally {
      setBusy(false);
    }
  };
  const seconds =
    round?.phase === "BETTING"
      ? Math.max(0, (new Date(round.bettingEndsAt).getTime() - now) / 1_000)
      : 0;
  const current = displayMultiplier;
  const curveY = Math.max(
    24,
    166 - Math.min(130, Math.log(Math.max(current, 1)) * 98),
  );
  const canBet = round?.phase === "BETTING" && !bet;
  return (
    <section className="page compact-page crash-page">
      <header className="crash-hero">
        <div>
          <p className="eyebrow">PIGGY CRASH · SHARED LIVE ROUND</p>
          <h1>
            Свинский <strong>краш</strong>
          </h1>
          <p>
            Коэффициент растёт — выведи ставку до краша. Невыведенные свинокоины
            и скины сгорают.
          </p>
        </div>
        <button onClick={() => setRulesOpen((open) => !open)}>
          Как играть? {rulesOpen ? "⌃" : "⌄"}
        </button>
      </header>
      {rulesOpen && (
        <div className="crash-rules">
          <b>Ставка 500–555 000 SC.</b>
          <span>
            Во время 15-секундной подготовки можно поставить балансом, скинами
            или вместе. После старта вывод доступен в любую секунду, пока
            свинокраш не остановился.
          </span>
        </div>
      )}
      <div className="crash-history">
        {history.length ? (
          history.map((item) => (
            <span
              className={
                item.multiplier >= 5
                  ? "high"
                  : item.multiplier <= 1.3
                    ? "low"
                    : ""
              }
              key={item.id}
            >
              {multiplier(item.multiplier)}
            </span>
          ))
        ) : (
          <span>История первого раунда собирается…</span>
        )}
      </div>
      <div className="crash-layout">
        <section className={`crash-stage ${round?.phase?.toLowerCase() || ""}`}>
          <div className="crash-stage-head">
            <span>🐷 РАУНД #{round?.id.slice(-5) || "…"}</span>
            <b>
              {round?.phase === "BETTING"
                ? `СТАРТ ЧЕРЕЗ ${seconds.toFixed(1)} сек`
                : round?.phase === "RUNNING"
                  ? "СВИНЬЯ ЛЕТИТ!"
                  : "БАБАХ! РАУНД ЗАВЕРШЁН"}
            </b>
          </div>
          <div className="crash-chart">
            <div className="crash-grid" />
            <svg viewBox="0 0 620 210" preserveAspectRatio="none">
              <defs>
                <linearGradient id="crash-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop stopColor="#ff4e9d" stopOpacity=".42" />
                  <stop offset="1" stopColor="#ff4e9d" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={`M38 184 C 170 180, 380 ${Math.min(180, curveY + 66)}, 580 ${curveY}`}
                fill="none"
                stroke="#ff65b4"
                strokeWidth="4"
              />
              <path
                d={`M38 184 C 170 180, 380 ${Math.min(180, curveY + 66)}, 580 ${curveY} L 580 204 L38 204 Z`}
                fill="url(#crash-fill)"
              />
            </svg>
            <div className="crash-multiplier">
              <span>
                {round?.phase === "BETTING"
                  ? "ГОТОВИМ ВЗЛЁТ"
                  : round?.phase === "CRASHED"
                    ? "КРАШ НА"
                    : "ТЕКУЩИЙ ИКС"}
              </span>
              <b>
                {multiplier(
                  round?.phase === "CRASHED"
                    ? round.crashMultiplier || 1
                    : current,
                )}
              </b>
            </div>
          </div>
          {bet && (
            <div className={`crash-bet-status ${bet.status.toLowerCase()}`}>
              <span>
                {bet.status === "CASHED_OUT"
                  ? "🏆"
                  : bet.status === "LOST"
                    ? "💥"
                    : "🎲"}
              </span>
              <div>
                <b>
                  {bet.status === "CASHED_OUT"
                    ? `Вывел на ${multiplier(bet.cashoutMultiplier || 1)}`
                    : bet.status === "LOST"
                      ? "Ставка сгорела на краше"
                      : `Ставка ${coins(bet.stake)} SC в полёте`}
                </b>
                <small>
                  {bet.status === "BET"
                    ? `Сейчас можно забрать ${coins(bet.livePayout || Math.floor(bet.stake * current))} SC`
                    : bet.status === "CASHED_OUT"
                      ? `${coins(bet.payout || 0)} SC уже на балансе`
                      : "Следующий раунд через несколько секунд"}
                </small>
              </div>
              {bet.status === "BET" && round?.phase === "RUNNING" && (
                <button
                  className="pig-button"
                  disabled={busy}
                  onClick={cashout}
                >
                  ЗАБРАТЬ →
                </button>
              )}
            </div>
          )}
        </section>
        <aside className="crash-controls">
          <p className="eyebrow">СВИНОСТАВКА</p>
          <h2>
            {canBet
              ? "Поставь до старта"
              : round?.phase === "BETTING"
                ? "Ставка принята"
                : "Следи за полётом"}
          </h2>
          <label>
            Баланс, SC
            <input
              type="number"
              min="0"
              max="555000"
              disabled={!canBet}
              value={balanceStake}
              onChange={(event) => setBalanceStake(event.target.value)}
            />
          </label>
          <div className="crash-quick">
            <button disabled={!canBet} onClick={() => setBalanceStake("500")}>
              500
            </button>
            <button
              disabled={!canBet}
              onClick={() =>
                setBalanceStake(
                  String(
                    Math.min(555000, Math.floor((user?.balance || 0) / 200)),
                  ),
                )
              }
            >
              50%
            </button>
            <button
              disabled={!canBet}
              onClick={() =>
                setBalanceStake(
                  String(
                    Math.min(555000, Math.floor((user?.balance || 0) / 100)),
                  ),
                )
              }
            >
              MAX
            </button>
          </div>
          <div className="crash-skins">
            <span>
              Скины в ставке <small>необязательно</small>
            </span>
            <div>
              {inventory.slice(0, 12).map((entry) => (
                <button
                  disabled={!canBet}
                  className={skinIds.includes(entry.id) ? "chosen" : ""}
                  onClick={() => toggleSkin(entry.id)}
                  key={entry.id}
                >
                  <img src={entry.item.image} alt="" />
                  <em>{coins(entry.item.price)}</em>
                </button>
              ))}
            </div>
          </div>
          <div className="crash-summary">
            <span>
              Баланс <b>{coins(balanceValue)} SC</b>
            </span>
            <span>
              Скины <b>{coins(skinValue)} SC</b>
            </span>
            <strong>Всего {coins(stake)} SC</strong>
          </div>
          <button
            className="pig-button crash-action"
            disabled={!canBet || busy}
            onClick={placeBet}
          >
            {busy
              ? "ПРИНИМАЕМ…"
              : canBet
                ? "ПОСТАВИТЬ НА ВЗЛЁТ →"
                : "СТАВКИ ЗАКРЫТЫ"}
          </button>
        </aside>
      </div>
    </section>
  );
}

function BossFightPage({
  token,
  user,
  onRequireAuth,
  onBalance,
  toast,
  onOpenProfile,
}: {
  token: string;
  user: User | null;
  onRequireAuth: () => void;
  onBalance: () => Promise<void>;
  toast: (text: string) => void;
  onOpenProfile: (id: string) => void;
}) {
  const [boss, setBoss] = useState<BossFight | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hitKey, setHitKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [rulesOpen, setRulesOpen] = useState(false);
  const load = async () => {
    try {
      setBoss(await request("/api/boss-fight", token));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось загрузить босса");
    }
  };
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    const refresh = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(refresh);
    };
  }, [token]);
  const attack = async (attackKey: BossAttackOption["key"]) => {
    if (!user) return onRequireAuth();
    setBusyKey(attackKey);
    try {
      const data = await request("/api/boss-fight/attack", token, {
        method: "POST",
        body: JSON.stringify({ attackKey }),
      });
      setBoss(data.boss);
      setHitKey((key) => key + 1);
      playSiteSound("hit");
      window.setTimeout(() => setHitKey(0), 720);
      await onBalance();
      toast(`${data.attack.label}: ${data.attack.damage.toLocaleString("ru-RU")} урона!`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Атака не прошла");
    } finally {
      setBusyKey(null);
    }
  };
  if (!boss) {
    return <section className="page compact-page boss-page"><div className="boss-loading">Фалыч собирает QR-коды…</div></section>;
  }
  const secondsLeft = Math.max(0, Math.floor((new Date(boss.event.endsAt).getTime() - now) / 1_000));
  const days = Math.floor(secondsLeft / 86_400);
  const hours = Math.floor((secondsLeft % 86_400) / 3_600);
  const minutes = Math.floor((secondsLeft % 3_600) / 60);
  const hpPercent = Math.max(0, Math.min(100, (boss.remainingHp / boss.event.maxHp) * 100));
  const lastQuote = boss.attacks.find((attack) => attack.key === busyKey)?.quote || "Фалыч опять просит оплатить QR на казик по кейсам…";
  return (
    <section className="page compact-page boss-page">
      <header className="boss-page-head">
        <div>
          <p className="eyebrow">МЕСЯЧНЫЙ ИВЕНТ · ДО 19 ОКТЯБРЯ</p>
          <h1>Битва с <strong>Фалычем</strong></h1>
          <p>Отвечай на его просьбы оплатить QR по кейсам — каждая атака списывает SC и добавляет твой урон в месячный рейтинг.</p>
        </div>
        <button onClick={() => setRulesOpen((open) => !open)}>Как играть? {rulesOpen ? "⌃" : "⌄"}</button>
      </header>
      {rulesOpen && (
        <div className="boss-rules">
          <b>Шесть атак — шесть размеров урона.</b>
          <span>Победители определяются по личному урону к концу события: 250 ₽, 150 ₽ и 100 ₽ за первые три места.</span>
        </div>
      )}
      <div className={`boss-stage ${hitKey ? "hit" : ""}`}>
        <div className="boss-stage-top">
          <span>👹 ФАЛЫЧ · МЕСЯЧНЫЙ БОСС</span>
          <b>{boss.event.active ? `${days}д ${hours}ч ${minutes}м до финала` : "ИВЕНТ ЗАВЕРШЁН"}</b>
        </div>
        <div className="boss-hp-wrap">
          <div><b>HP ФАЛЫЧА</b><span>{boss.remainingHp.toLocaleString("ru-RU")} / {boss.event.maxHp.toLocaleString("ru-RU")}</span></div>
          <div className="boss-hp"><i style={{ width: `${hpPercent}%` }} /></div>
          <small>ВСЕГО НАНЕСЕНО · <strong>{boss.totalDamage.toLocaleString("ru-RU")} УРОНА</strong></small>
        </div>
        <div className="boss-portrait" aria-label="Фалыч">
          <div className="boss-quote">“{lastQuote}”</div>
        </div>
        <div className="boss-attacks">
          {boss.attacks.map((item) => (
            <button
              key={item.key}
              disabled={!boss.event.active || Boolean(busyKey) || (user?.balance || 0) < item.cost * 100}
              className={`boss-attack boss-${item.key.toLowerCase()}`}
              onClick={() => attack(item.key)}
            >
              <span>{item.icon}</span>
              <b>{item.label}</b>
              <small>{item.cost.toLocaleString("ru-RU")} SC</small>
              <em>−{item.damage.toLocaleString("ru-RU")} HP</em>
            </button>
          ))}
        </div>
      </div>
      <section className="boss-bottom">
        <div className="boss-my-damage">
          <p className="eyebrow">ТВОЙ ВКЛАД</p>
          <b>{boss.myDamage.toLocaleString("ru-RU")}</b>
          <span>единиц урона</span>
          <small>{user ? "Каждая атака сразу идёт в месячный рейтинг." : "Войди в аккаунт, чтобы участвовать."}</small>
        </div>
        <div className="boss-prizes">
          <p className="eyebrow">ПРИЗОВОЙ ТОП</p>
          {boss.event.rewards.map((reward, index) => <span key={reward}><b>#{index + 1}</b>{reward}</span>)}
        </div>
        <div className="boss-leaderboard">
          <p className="eyebrow">ТОП УРОНА ЗА МЕСЯЦ</p>
          {boss.leaderboard.length ? boss.leaderboard.slice(0, 8).map((entry) => (
            <button key={entry.id} onClick={() => onOpenProfile(entry.id)}>
              <i>#{entry.rank}</i><span>{entry.avatar || "🐷"}</span><b style={{ color: entry.nickColor }}>{entry.username}</b><strong>{entry.damage.toLocaleString("ru-RU")}</strong>
            </button>
          )) : <small>Будь первым, кто даст Фалычу отпор.</small>}
        </div>
      </section>
    </section>
  );
}

function GamesHub({
  onOpen,
  dailyWinners,
  onOpenProfile,
}: {
  onOpen: (
    game:
      | "upgrade" | "battles" | "naval" | "mines" | "pigsty" | "road" | "contract" | "crash" | "boss",
  ) => void;
  dailyWinners: DailyWinner[];
  onOpenProfile: (id: string) => void;
}) {
  const games: Array<{
    id:
      | "upgrade" | "battles" | "naval" | "mines" | "pigsty" | "road" | "contract" | "crash" | "boss";
    icon: string;
    eyebrow: string;
    title: string;
    text: string;
    action: string;
  }> = [
    {
      id: "upgrade",
      icon: "🎯",
      eyebrow: "RISK IT FOR THE BACON",
      title: "Свинский апгрейд",
      text: "Собери до 8 скинов, выбери цель и рискни на красивом колесе.",
      action: "К апгрейду",
    },
    {
      id: "battles",
      icon: "⚔️",
      eyebrow: "CASE BATTLE",
      title: "Кейс-баттлы",
      text: "Создавай комнаты, зови игроков или свиноботов и забирай весь банк.",
      action: "В баттлы",
    },
    {
      id: "naval",
      icon: "⚓",
      eyebrow: "PIGGY NAVAL",
      title: "Морской бой",
      text: "Расставь флот, стреляй по скрытой доске и забери двойной банк.",
      action: "В море",
    },
    {
      id: "mines",
      icon: "💣",
      eyebrow: "PIGGY MINES",
      title: "Свиные мины",
      text: "Открывай клетки, избегай бомб и забирай множитель когда захочешь.",
      action: "К минам",
    },
    {
      id: "pigsty",
      icon: "🐔",
      eyebrow: "PIGSTY RISK",
      title: "Свинарник",
      text: "Поставь скин, лови куриц в четырёх окнах и остановись до взрыва.",
      action: "В Свинарник",
    },
    {
      id: "road",
      icon: "🐷",
      eyebrow: "PIGGY ROAD",
      title: "Свиная дорога",
      text: "Прыгай по платформам, забирай множитель и не попадай на мину.",
      action: "К дороге",
    },
    {
      id: "contract",
      icon: "📜",
      eyebrow: "PIGGY CONTRACT",
      title: "Контракт",
      text: "Объедини 3–10 скинов и получи один новый предмет.",
      action: "К контракту",
    },
    {
      id: "crash",
      icon: "🚀",
      eyebrow: "PIGGY CRASH",
      title: "Свинокраш",
      text: "Поставь до старта и успей забрать множитель до краша.",
      action: "К крашу",
    },
  ];
  return (
    <section className="page compact-page games-hub">
      <div className="page-title">
        <p className="eyebrow">SVINODROP GAME ROOM</p>
        <h1>
          Выбери свою <strong>игру</strong>
        </h1>
        <p>
          Восемь режимов, один свинобаланс и настоящая конкуренция с игроками.
        </p>
      </div>
      <section className="daily-winners-strip">
        <div>
          <p className="eyebrow">СЕГОДНЯ ПОДНЯЛИ БОЛЬШЕ ВСЕХ</p>
          <h2>Топ подъёма за день</h2>
        </div>
        <div className="daily-winners-list">
          {dailyWinners.length ? dailyWinners.slice(0, 3).map((winner) => (
            <button key={winner.id} onClick={() => onOpenProfile(winner.id)}>
              <i>#{winner.rank}</i>
              <span>{winner.avatar || "🐷"}</span>
              <b style={{ color: winner.nickColor }}>{winner.username}</b>
              <strong>+{coins(winner.raised)} SC</strong>
            </button>
          )) : <small>Сегодня ещё никто не поднял банк. Возможно, это будешь ты.</small>}
        </div>
      </section>
      <div className="games-grid">
        {games.map((game) => (
          <button
            className={`game-hub-card ${game.id}`}
            key={game.id}
            onClick={() => onOpen(game.id)}
          >
            <span>{game.icon}</span>
            <p>{game.eyebrow}</p>
            <h2>{game.title}</h2>
            <small>{game.text}</small>
            <b>
              {game.action} <em>→</em>
            </b>
          </button>
        ))}
      </div>
    </section>
  );
}

const battleLabels: Record<Battle["mode"], string> = {
  NORMAL: "Обычный",
  CURSED: "Проклятый",
  JACKPOT: "Джекпот",
  LAST: "Последний",
};

function BattleShowcase({ battle }: { battle: Battle }) {
  const results = battle.results!;
  const rounds = results.rounds;
  const maxDrops = Math.max(0, ...rounds.map((round) => round.drops.length));
  const [roundIndex, setRoundIndex] = useState(0);
  const [stage, setStage] = useState<"spin" | "reveal" | "finale">("spin");
  const [finale, setFinale] = useState(false);
  const [jackpotFinished, setJackpotFinished] = useState(false);
  const fast = Boolean(battle.fast);
  const spinMs = fast ? 1350 : 3600;
  const revealMs = fast ? 520 : 1150;
  const jackpotMs = 10_000;
  const jackpotPlayerIndexes = results.jackpotPlayerIndexes?.length
    ? results.jackpotPlayerIndexes
    : battle.mode === "JACKPOT"
      ? rounds.map((_, index) => index)
      : [];
  const isJackpotFinish = jackpotPlayerIndexes.length > 0;
  const isTieBreaker = isJackpotFinish && battle.mode !== "JACKPOT";
  useEffect(() => {
    setRoundIndex(0);
    setStage("spin");
    setFinale(false);
    setJackpotFinished(false);
    if (!maxDrops) return;
    const timers: number[] = [];
    const after = (delay: number, callback: () => void) =>
      timers.push(window.setTimeout(callback, delay));
    const playRound = (index: number) => {
      setRoundIndex(index);
      setStage("spin");
      // A complete reel has time to accelerate, cross real item cards, and slow
      // down on the server-selected drop before the next case begins.
      after(spinMs, () => {
        setStage("reveal");
        after(revealMs, () => {
          if (index + 1 < maxDrops) playRound(index + 1);
          else {
            setStage("finale");
            setFinale(true);
            if (isJackpotFinish)
              after(jackpotMs, () => setJackpotFinished(true));
          }
        });
      });
    };
    after(fast ? 150 : 420, () => playRound(0));
    return () => timers.forEach(window.clearTimeout);
  }, [battle.id, battle.fast, maxDrops, isJackpotFinish]);
  const jackpotTotal = jackpotPlayerIndexes.reduce(
    (sum, index) => sum + Math.max(1, rounds[index].total),
    0,
  );
  const activeRound = Math.min(roundIndex, Math.max(0, maxDrops - 1));
  const isOpening = stage === "spin";
  const visibleDrops =
    stage === "spin" ? activeRound : Math.min(maxDrops, activeRound + 1);
  const winner = rounds[results.winnerIndex];
  const scoreTo = (round: (typeof rounds)[number], count: number) =>
    round.drops.slice(0, count).reduce((sum, drop) => sum + drop.value, 0);
  const activeCase = battle.cases[activeRound];
  const reelPool = activeCase?.items?.map((entry) => entry.item) || [];
  const decisive = battle.mode === "LAST" && activeRound === maxDrops - 1;
  const winnerKnown = !isJackpotFinish || jackpotFinished;
  const chanceSlots = jackpotPlayerIndexes.flatMap((playerIndex) =>
    Array.from(
      {
        length: Math.max(
          1,
          Math.round(
            (Math.max(1, rounds[playerIndex].total) / jackpotTotal) * 24,
          ),
        ),
      },
      () => playerIndex,
    ),
  );
  const winnerSlot = chanceSlots.findIndex(
    (entry) => entry === results.winnerIndex,
  );
  const jackpotCycles = 9;
  const jackpotTarget =
    chanceSlots.length * (jackpotCycles - 2) + Math.max(0, winnerSlot);
  const jackpotStart = Math.min(8, jackpotTarget);
  const jackpotEntries = Array.from(
    { length: chanceSlots.length * jackpotCycles },
    (_, index) => chanceSlots[index % chanceSlots.length],
  );
  return (
    <div
      className={`battle-showcase battle-case-window ${battle.mode === "LAST" ? "battle-last-mode" : ""} ${fast ? "battle-fast-mode" : ""} ${stage === "finale" && isJackpotFinish ? "jackpot-focus" : ""}`}
    >
      <div className="battle-rounds-strip">
        {battle.cases.map((caseData, index) => (
          <div
            className={`${index < visibleDrops ? "done" : ""} ${index === activeRound && isOpening ? "current" : ""} ${battle.mode === "LAST" && index === maxDrops - 1 ? "decisive" : ""}`}
            key={`${caseData.id}-${index}`}
          >
            <small>{index + 1}</small>
            <img src={caseData.image} alt={caseData.name} />
          </div>
        ))}
      </div>
      <div className="battle-round-status">
        <span>
          {isOpening
            ? decisive
              ? "🔥 РЕШАЮЩИЙ КЕЙС · ПОСЛЕДНИЙ ДРОП ОПРЕДЕЛИТ ПОБЕДИТЕЛЯ"
              : "КРУТИМ ОДИНАКОВЫЙ КЕЙС ДЛЯ ВСЕХ"
            : isJackpotFinish && !jackpotFinished
              ? isTieBreaker
                ? "НИЧЬЯ · ДЖЕКПОТ ВРАЩАЕТСЯ · ВЫБИРАЕМ ПОБЕДИТЕЛЯ"
                : "ДЖЕКПОТ ВРАЩАЕТСЯ · ВЫБИРАЕМ ПОБЕДИТЕЛЯ"
              : "РАУНД ЗАВЕРШЁН"}
        </span>
        <b>
          {isOpening
            ? `${decisive ? "РЕШАЮЩИЙ · " : ""}РАУНД ${activeRound + 1} / ${maxDrops}`
            : isTieBreaker
              ? "НИЧЬЯ · ФИНАЛЬНЫЙ РОЗЫГРЫШ"
              : "ВСЕ КЕЙСЫ ОТКРЫТЫ"}
        </b>
      </div>
      <div className="battle-active-case">
        {activeCase && (
          <>
            <img src={activeCase.image} alt="" />
            <div>
              <small>
                {isOpening ? "СЕЙЧАС ОТКРЫВАЕМ" : "ПОСЛЕДНИЙ ОТКРЫТЫЙ КЕЙС"}
              </small>
              <b>{activeCase.name}</b>
            </div>
            {decisive && <strong>🔥 РЕШАЮЩИЙ</strong>}
          </>
        )}
      </div>
      <div className="battle-arena">
        {rounds.map((round, playerIndex) => {
          const drop = round.drops[activeRound];
          const visible = !isOpening && drop;
          return (
            <article
              className={`player-color-${playerIndex % 4} ${finale && winnerKnown && playerIndex === results.winnerIndex ? "winner" : ""} ${isOpening ? "spinning" : ""} ${decisive ? "decisive" : ""}`}
              key={`${round.player.username}-${playerIndex}`}
            >
              <header>
                <span>{round.player.avatar || "🐷"}</span>
                <div>
                  <b>{round.player.username}</b>
                  <small>
                    {playerIndex === results.winnerIndex &&
                    finale &&
                    winnerKnown
                      ? "ЗАБИРАЕТ БАНК"
                      : decisive
                        ? "решающий раунд"
                        : `игрок ${playerIndex + 1}`}
                  </small>
                </div>
                <strong>{coins(scoreTo(round, visibleDrops))} SC</strong>
              </header>
              <div
                className="battle-case-reel"
                style={
                  { "--reel-duration": `${spinMs}ms` } as React.CSSProperties
                }
              >
                {isOpening && drop ? (
                  <CaseReel
                    key={`${battle.id}-${activeRound}-${playerIndex}`}
                    pool={reelPool.length ? reelPool : [drop.item]}
                    winner={drop.item}
                    phase="spinning"
                    compact
                  />
                ) : visible ? (
                  <div className="battle-winning-card">
                    <img src={drop.item.image} alt="" />
                    <b>{drop.item.name}</b>
                    <em>{coins(drop.value)} SC</em>
                  </div>
                ) : (
                  <div className="battle-rolling-card">
                    <span>📦</span>
                    <b>ГОТОВИМ СЛЕДУЮЩИЙ КЕЙС</b>
                    <i />
                  </div>
                )}
              </div>
              <div className="battle-history">
                {round.drops.slice(0, visibleDrops).map((pastDrop, index) => (
                  <span
                    key={`${pastDrop.item.id}-${index}`}
                    title={pastDrop.item.name}
                  >
                    <img src={pastDrop.item.image} alt="" />
                    <em>{coins(pastDrop.value)}</em>
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {stage === "finale" && isJackpotFinish && (
        <div
          className={`battle-jackpot-finale ${jackpotFinished ? "finished" : "spinning"}`}
          style={
            { "--jackpot-duration": `${jackpotMs}ms` } as React.CSSProperties
          }
          aria-label="Финальный джекпот"
        >
          <div className="battle-jackpot-head">
            <span>🎰</span>
            <div>
              <small>
                {isTieBreaker
                  ? "НИЧЬЯ · ФИНАЛЬНЫЙ РОЗЫГРЫШ"
                  : "ФИНАЛЬНЫЙ РОЗЫГРЫШ"}
              </small>
              <b>Джекпот банка</b>
            </div>
            <em>
              {isTieBreaker
                ? "В джекпоте только игроки с одинаковым результатом"
                : "Шанс зависит от стоимости всех дропов"}
            </em>
          </div>
          <div className="battle-jackpot-players">
            {jackpotPlayerIndexes.map((playerIndex) => {
              const round = rounds[playerIndex];
              const percent = (Math.max(1, round.total) / jackpotTotal) * 100;
              return (
                <span
                  className={`ticket-${playerIndex % 4} ${jackpotFinished && playerIndex === results.winnerIndex ? "winner" : ""}`}
                  key={round.player.username}
                >
                  <i>{round.player.avatar || "🐷"}</i>
                  <b>{round.player.username}</b>
                  <em>{percent.toFixed(0)}%</em>
                </span>
              );
            })}
          </div>
          {!jackpotFinished && (
            <div className="jackpot-launch">
              ✦ БАНК НА КОНУ · СВИНЬИ, ДЕРЖИТЕСЬ ✦
            </div>
          )}
          <div className="battle-jackpot-reel">
            <i className="jackpot-pointer" aria-hidden="true" />
            <div
              className="battle-jackpot-rail"
              style={
                {
                  "--jackpot-start": `-${jackpotStart * 76 + 38}px`,
                  "--jackpot-end": `-${jackpotTarget * 76 + 38}px`,
                } as React.CSSProperties
              }
            >
              {jackpotEntries.map((playerIndex, index) => {
                const round = rounds[playerIndex];
                const percent = (Math.max(1, round.total) / jackpotTotal) * 100;
                return (
                  <span
                    className={`jackpot-ticket ticket-${playerIndex % 4} ${playerIndex === results.winnerIndex ? "winner-ticket" : ""}`}
                    key={`${playerIndex}-${index}`}
                  >
                    <b>{round.player.avatar || "🐷"}</b>
                    <small>{percent.toFixed(0)}%</small>
                  </span>
                );
              })}
            </div>
          </div>
          {jackpotFinished ? (
            <strong>
              🏆 {winner.player.username} забирает весь банк · все скины уже в
              инвентаре
            </strong>
          ) : (
            <small className="battle-jackpot-note">
              Лента замедляется — стрелка выберет получателя банка
            </small>
          )}
        </div>
      )}
      {stage === "finale" && !isJackpotFinish && finale && (
        <div className="battle-winner-banner">
          🏆 Победитель: <b>{winner.player.username}</b> · весь дроп уже в
          инвентаре
        </div>
      )}
    </div>
  );
}

function BattleWaitingRoom({
  battle,
  busy,
  onAddBot,
  onLeave,
}: {
  battle: Battle;
  busy: boolean;
  onAddBot: () => void;
  onLeave?: () => void;
}) {
  const slots = Array.from(
    { length: battle.playerLimit },
    (_, index) => battle.players[index],
  );
  return (
    <div className="battle-waiting-room">
      <div className="battle-waiting-cases">
        {battle.cases.map((item, index) => (
          <div key={`${item.id}-${index}`}>
            <small>РАУНД {index + 1}</small>
            <img src={item.image} alt="" />
            <b>{item.name}</b>
          </div>
        ))}
      </div>
      <div className="battle-waiting-slots">
        {slots.map((player, index) =>
          player ? (
            <article className="filled" key={player.id}>
              <span>{player.avatar || "🐷"}</span>
              <div>
                <small>ИГРОК {index + 1}</small>
                <b>{player.username}</b>
              </div>
              <em>ГОТОВ</em>
            </article>
          ) : (
            <article className="empty" key={`slot-${index}`}>
              <span>🐷</span>
              <div>
                <small>СВОБОДНОЕ МЕСТО</small>
                <b>Ждём игрока или бота</b>
              </div>
              {battle.isMine && (
                <button className="login" disabled={busy} onClick={onAddBot}>
                  {busy ? "Добавляем…" : "+ Свинобот"}
                </button>
              )}
            </article>
          ),
        )}
      </div>
      <div className="battle-waiting-note">
        <span>🐽</span>
        <div>
          <b>Баттл создан — ты уже в комнате</b>
          <small>
            Добавь свиноботов или дождись игроков. Когда места заполнятся, кейсы
            автоматически начнут крутиться у всех.
          </small>
        </div>
        {battle.private && (
          <em>
            Код: <strong>{battle.inviteCode}</strong>
          </em>
        )}
        {onLeave && (
          <button className="login battle-leave" disabled={busy} onClick={onLeave}>
            Выйти · вернуть ставку
          </button>
        )}
      </div>
    </div>
  );
}

function BattlePage({
  token,
  cases,
  user,
  onRequireAuth,
  onBalance,
  toast,
}: {
  token: string;
  cases: Case[];
  user: User | null;
  onRequireAuth: () => void;
  onBalance: () => void;
  toast: (text: string) => void;
}) {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<Battle["mode"]>("NORMAL");
  const [players, setPlayers] = useState(2);
  const [privateBattle, setPrivateBattle] = useState(false);
  const [fastBattle, setFastBattle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState<Battle | null>(null);
  const load = () => {
    if (token)
      request("/api/battles", token)
        .then(setBattles)
        .catch(() => undefined);
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 3500);
    return () => window.clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (!watching) return;
    const fresh = battles.find((battle) => battle.id === watching.id);
    if (fresh && fresh !== watching) setWatching(fresh);
  }, [battles, watching]);
  const create = async () => {
    if (!user) return onRequireAuth();
    if (!picked.length) return toast("Добавь хотя бы один кейс в баттл.");
    setBusy(true);
    try {
      const created = (await request("/api/battles", token, {
        method: "POST",
        body: JSON.stringify({
          caseIds: picked,
          mode,
          playerLimit: players,
          private: privateBattle,
          fast: fastBattle,
        }),
      })) as Battle;
      setPicked([]);
      setWatching(created);
      await onBalance();
      load();
      toast("Баттл создан — добавь бота или дождись игроков.");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось создать баттл",
      );
    } finally {
      setBusy(false);
    }
  };
  const action = async (id: string, actionName: "join" | "bot" | "leave") => {
    if (!user) return onRequireAuth();
    setBusy(true);
    try {
      const updated = await request(
        `/api/battles/${id}/${actionName}`,
        token,
        { method: "POST" },
      );
      if (actionName === "leave") {
        if (watching?.id === id) setWatching(null);
        toast("Ты вышел из баттла — ставка уже возвращена.");
      } else if (actionName === "bot" || watching?.id === id) setWatching(updated as Battle);
      await onBalance();
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Действие не выполнено");
    } finally { setBusy(false); }
  };
  const selectedCost = picked.reduce(
    (sum, id) => sum + (cases.find((item) => item.id === id)?.price || 0),
    0,
  );
  return (
    <section className="page compact-page battle-page">
      <div className="page-title left">
        <p className="eyebrow">CASE BATTLE · SERVER VERIFIED</p>
        <h1>
          Кейс <strong>баттлы</strong>
        </h1>
        <p>
          Добавляй один и тот же кейс несколько раз: каждая иконка — отдельный
          раунд для всех игроков.
        </p>
      </div>
      <div className="battle-layout">
        <section className="battle-builder">
          <div className="battle-top">
            <h2>Создание баттла</h2>
            <div className="battle-top-toggles">
              <label className="private-toggle">
                <input
                  type="checkbox"
                  checked={privateBattle}
                  onChange={(event) => setPrivateBattle(event.target.checked)}
                />{" "}
                Приватный
              </label>
              <label className="private-toggle fast-toggle">
                <input
                  type="checkbox"
                  checked={fastBattle}
                  onChange={(event) => setFastBattle(event.target.checked)}
                />{" "}
                ⚡ Быстрый
              </label>
            </div>
          </div>
          <div className="battle-mode-row">
            {(Object.keys(battleLabels) as Battle["mode"][]).map((entry) => (
              <button
                key={entry}
                className={`${mode === entry ? "chosen" : ""} ${entry === "LAST" ? "last-mode-choice" : ""}`}
                onClick={() => setMode(entry)}
              >
                <b>
                  {entry === "LAST" ? "🔥 " : ""}
                  {battleLabels[entry]}
                </b>
                <small>
                  {entry === "NORMAL"
                    ? "Больше — победа"
                    : entry === "CURSED"
                      ? "Меньше — победа"
                      : entry === "JACKPOT"
                        ? "Шанс по сумме"
                        : "Решает последний"}
                </small>
              </button>
            ))}
          </div>
          <div className="battle-player-row">
            <span>Игроков</span>
            {[2, 3, 4].map((count) => (
              <button
                className={players === count ? "chosen" : ""}
                key={count}
                onClick={() => setPlayers(count)}
              >
                {count}
              </button>
            ))}
            <b>Вход: {coins(selectedCost)} SC</b>
          </div>
          <div className="battle-case-picker">
            {cases.slice(0, 24).map((item) => {
              const count = picked.filter((id) => id === item.id).length;
              return (
                <button
                  key={item.id}
                  className={count ? "picked" : ""}
                  onClick={() =>
                    setPicked((current) =>
                      current.length < 30 ? [...current, item.id] : current,
                    )
                  }
                >
                  <img src={item.image} alt="" />
                  {count > 0 && <i>×{count}</i>}
                  <span>{item.name}</span>
                  <b>{coins(item.price)} SC</b>
                </button>
              );
            })}
          </div>
          <div className="battle-selected-cases">
            {picked.map((id, index) => {
              const item = cases.find((entry) => entry.id === id);
              return item ? (
                <button
                  key={`${id}-${index}`}
                  title="Убрать этот раунд"
                  onClick={() =>
                    setPicked((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <img src={item.image} alt="" />
                  <span>{index + 1}</span>
                  <b>×</b>
                </button>
              ) : null;
            })}
          </div>
          <div className="battle-builder-footer">
            <small>
              Добавлено кейсов: {picked.length}/30 · нажми иконку кейса ещё раз,
              чтобы повторить его
            </small>
            <button
              className="pig-button"
              disabled={busy || !picked.length}
              onClick={create}
            >
              {busy ? "Создаём…" : "Создать баттл →"}
            </button>
          </div>
        </section>
        <section className="battle-list">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE BATTLES</p>
              <h2>Комнаты</h2>
            </div>
            <span>{battles.length} активно</span>
          </div>
          {battles.length ? (
            battles.map((battle) => (
              <article className="battle-room" key={battle.id}>
                <div className="battle-room-head">
                  <span>⚔</span>
                  <div>
                    <b>{battleLabels[battle.mode]} баттл</b>
                    <small>
                      {battle.players.length}/{battle.playerLimit} игроков ·{" "}
                      {battle.private ? "приватный" : "публичный"}
                    </small>
                  </div>
                  <em>
                    {battle.status === "FINISHED" ? "ЗАВЕРШЁН" : "ОЖИДАНИЕ"}
                  </em>
                </div>
                <div className="battle-case-strip">
                  {battle.cases.map((item, index) => (
                    <img
                      key={`${item.id}-${index}`}
                      src={item.image}
                      title={`${index + 1}. ${item.name}`}
                    />
                  ))}
                </div>
                <div className="battle-players">
                  {battle.players.map((player) => (
                    <span key={player.id}>
                      {player.avatar || "🐷"} {player.username}
                    </span>
                  ))}
                </div>
                {battle.results && (
                  <button
                    className="battle-watch"
                    onClick={() => setWatching(battle)}
                  >
                    Смотреть открытие →
                  </button>
                )}{" "}
                {battle.status === "WAITING" && (
                  <div className="battle-actions">
                    {!battle.isMine && (
                      <button
                        className="pig-button"
                        onClick={() => action(battle.id, "join")}
                      >
                        Войти
                      </button>
                    )}
                    {battle.isMine &&
                      battle.players.length < battle.playerLimit && (
                        <button
                          className="login"
                          onClick={() => action(battle.id, "bot")}
                        >
                          + Свинобот
                        </button>
                      )}
                    {battle.isMine && battle.creatorId !== user?.id && (
                      <button
                        className="login battle-leave"
                        disabled={busy}
                        onClick={() => action(battle.id, "leave")}
                      >
                        Выйти · вернуть ставку
                      </button>
                    )}
                    {battle.isMine && battle.private && (
                      <small>
                        Код: <b>{battle.inviteCode}</b>
                      </small>
                    )}
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="empty-feed">Пока нет баттлов — создай первый.</div>
          )}
        </section>
      </div>
      {watching && (
        <div className="modal-backdrop battle-modal-backdrop">
          <section className="case-modal battle-modal">
            <button className="close" onClick={() => setWatching(null)}>
              ×
            </button>
            <div
              className={`battle-modal-head ${watching.mode === "LAST" ? "last-mode-head" : ""}`}
            >
              <span>{watching.mode === "LAST" ? "🔥" : "⚔️"}</span>
              <div>
                <p className="eyebrow">CASE BATTLE · SERVER VERIFIED</p>
                <h2>
                  {watching.mode === "LAST" ? "РЕШАЮЩИЙ · " : ""}
                  {battleLabels[watching.mode]} баттл
                </h2>
                <p>
                  {watching.results
                    ? "Один и тот же кейс крутится у всех игроков в каждом раунде."
                    : "Добавь свиноботов — после заполнения комнаты прокрутка начнётся сама."}
                </p>
              </div>
              <b>
                {watching.players.length} <small>ИГРОКА</small>
              </b>
            </div>
            {watching.results ? (
              <BattleShowcase battle={watching} />
            ) : (
              <BattleWaitingRoom
                battle={watching}
                busy={busy}
                onAddBot={() => action(watching.id, "bot")}
                onLeave={watching.isMine && watching.creatorId !== user?.id ? () => action(watching.id, "leave") : undefined}
              />
            )}
          </section>
        </div>
      )}
    </section>
  );
}

type FleetShip = {
  id: string;
  size: number;
  x: number;
  y: number;
  vertical: boolean;
};
const fleetSizes = [3, 2, 2, 1, 1];
const emptyFleet = (): FleetShip[] =>
  fleetSizes.map((size, index) => ({
    id: `fleet-${index}`,
    size,
    x: -1,
    y: -1,
    vertical: size > 1,
  }));
const shipCells = (ship: FleetShip) =>
  ship.x < 0 || ship.y < 0
    ? []
    : Array.from({ length: ship.size }, (_, index) => ({
        x: ship.x + (ship.vertical ? 0 : index),
        y: ship.y + (ship.vertical ? index : 0),
      }));
const fleetCells = (fleet: FleetShip[]) => fleet.flatMap(shipCells);
function canPlaceShip(fleet: FleetShip[], candidate: FleetShip) {
  const cells = shipCells(candidate);
  if (
    cells.length !== candidate.size ||
    cells.some((cell) => cell.x < 0 || cell.x > 7 || cell.y < 0 || cell.y > 7)
  )
    return false;
  const others = fleet
    .filter((ship) => ship.id !== candidate.id)
    .flatMap(shipCells);
  return cells.every((cell) =>
    others.every(
      (occupied) =>
        Math.abs(cell.x - occupied.x) > 1 || Math.abs(cell.y - occupied.y) > 1,
    ),
  );
}
function randomFleet() {
  const fleet: FleetShip[] = [];
  for (const [index, size] of fleetSizes.entries()) {
    let placed = false;
    for (let attempt = 0; attempt < 700 && !placed; attempt += 1) {
      const vertical = size > 1 && Math.random() > 0.5;
      const candidate = {
        id: `fleet-${index}`,
        size,
        vertical,
        x: Math.floor(Math.random() * (vertical ? 8 : 9 - size)),
        y: Math.floor(Math.random() * (vertical ? 9 - size : 8)),
      };
      if (canPlaceShip(fleet, candidate)) {
        fleet.push(candidate);
        placed = true;
      }
    }
  }
  return fleet.length === fleetSizes.length ? fleet : emptyFleet();
}
type PlacementHint = { x: number; y: number; valid: boolean };
function NavalBoard({
  ships = [],
  shots = [],
  enemy,
  disabled,
  onCell,
  onDropCell,
  placementHints = [],
}: {
  ships?: { x: number; y: number }[];
  shots?: NavalShot[];
  enemy?: boolean;
  disabled?: boolean;
  onCell?: (x: number, y: number) => void;
  onDropCell?: (x: number, y: number, shipId: string) => void;
  placementHints?: PlacementHint[];
}) {
  return (
    <div className={`naval-board naval-board-8 ${enemy ? "enemy" : ""}`}>
      {Array.from({ length: 64 }, (_, index) => {
        const x = index % 8;
        const y = Math.floor(index / 8);
        const ship = ships.some((cell) => cell.x === x && cell.y === y);
        const shot = shots.find((cell) => cell.x === x && cell.y === y);
        const hint = placementHints.find(
          (cell) => cell.x === x && cell.y === y,
        );
        return (
          <button
            aria-label={
              hint
                ? `${String.fromCharCode(65 + y)}${x + 1}: ${hint.valid ? "можно поставить" : "нельзя поставить"}`
                : undefined
            }
            disabled={disabled || !!shot}
            className={`${ship && !enemy ? "ship" : ""} ${hint?.valid ? "place-ok" : hint ? "place-no" : ""} ${shot?.hit ? "hit" : shot ? "miss" : ""} ${shot?.blocked ? "blocked" : ""} ${shot?.sunk ? "sunk" : ""}`}
            key={`${x}:${y}`}
            onDragOver={(event) => {
              if (onDropCell) event.preventDefault();
            }}
            onDrop={(event) => {
              const shipId = event.dataTransfer.getData("text/plain");
              if (shipId) onDropCell?.(x, y, shipId);
            }}
            onClick={() => onCell?.(x, y)}
          >
            {ship && !enemy && !shot ? (
              <i>⚓</i>
            ) : shot?.hit ? (
              "✹"
            ) : shot?.blocked ? (
              "•"
            ) : shot ? (
              "·"
            ) : hint?.valid ? (
              "•"
            ) : (
              ""
            )}
          </button>
        );
      })}
    </div>
  );
}
function NavalPage({
  token,
  user,
  onRequireAuth,
  onBalance,
  toast,
}: {
  token: string;
  user: User | null;
  onRequireAuth: () => void;
  onBalance: () => void;
  toast: (text: string) => void;
}) {
  const [games, setGames] = useState<any[]>([]);
  const [current, setCurrent] = useState<NavalGame | null>(null);
  const [savedGameId, setSavedGameId] = useState(
    () => localStorage.getItem("svino-naval-game") || "",
  );
  const [stake, setStake] = useState("100");
  const [fleet, setFleet] = useState<FleetShip[]>(emptyFleet);
  const [selectedShipId, setSelectedShipId] = useState("fleet-0");
  const [clockNow, setClockNow] = useState(Date.now());
  const load = async () => {
    if (!token) return;
    try {
      const list = await request("/api/naval/games", token);
      setGames(list);
      if (current) setCurrent(await request(`/api/naval/${current.id}`, token));
    } catch {
      undefined;
    }
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [token, current?.id]);
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!token || !savedGameId || current) return;
    request(`/api/naval/${savedGameId}`, token)
      .then(setCurrent)
      .catch(() => {
        localStorage.removeItem("svino-naval-game");
        setSavedGameId("");
      });
  }, [token, savedGameId, current]);
  useEffect(() => {
    if (current?.id && current.status !== "FINISHED") {
      localStorage.setItem("svino-naval-game", current.id);
      setSavedGameId(current.id);
    } else if (current?.status === "FINISHED") {
      localStorage.removeItem("svino-naval-game");
      setSavedGameId("");
    }
  }, [current?.id, current?.status]);
  const resume = async () => {
    if (!savedGameId) return;
    try {
      setCurrent(await request(`/api/naval/${savedGameId}`, token));
    } catch {
      localStorage.removeItem("svino-naval-game");
      setSavedGameId("");
      toast("Эта игра уже недоступна");
    }
  };
  const create = async () => {
    if (!user) return onRequireAuth();
    try {
      const data = await request("/api/naval", token, {
        method: "POST",
        body: JSON.stringify({ stake: Math.round(Number(stake) * 100) }),
      });
      setFleet(emptyFleet());
      setSelectedShipId("fleet-0");
      setCurrent(data);
      await onBalance();
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось создать игру");
    }
  };
  const join = async (id: string) => {
    if (!user) return onRequireAuth();
    try {
      const data = await request(`/api/naval/${id}/join`, token, {
        method: "POST",
      });
      setFleet(emptyFleet());
      setSelectedShipId("fleet-0");
      setCurrent(data);
      await onBalance();
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось войти");
    }
  };
  const ready = async () => {
    if (!current) return;
    if (fleetCells(fleet).length !== 9)
      return toast("Сначала расставь все 9 клеток короткого флота.");
    try {
      setCurrent(
        await request(`/api/naval/${current.id}/ships`, token, {
          method: "POST",
          body: JSON.stringify({ ships: fleetCells(fleet) }),
        }),
      );
      load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Проверь расстановку кораблей",
      );
    }
  };
  const shot = async (x: number, y: number) => {
    if (!current) return;
    try {
      const next = await request(`/api/naval/${current.id}/shot`, token, {
        method: "POST",
        body: JSON.stringify({ x, y }),
      });
      const last = next.opponent?.shots
        ?.filter((entry: NavalShot) => !entry.blocked)
        .at(-1);
      playSiteSound(last?.sunk ? "win" : last?.hit ? "hit" : "shot");
      setCurrent(next);
      await onBalance();
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Выстрел не прошёл");
    }
  };
  const moveShip = (id: string, x: number, y: number) =>
    setFleet((currentFleet) => {
      const ship = currentFleet.find((entry) => entry.id === id);
      if (!ship) return currentFleet;
      const candidate = { ...ship, x, y };
      return canPlaceShip(currentFleet, candidate)
        ? currentFleet.map((entry) => (entry.id === id ? candidate : entry))
        : currentFleet;
    });
  const placeSelected = (x: number, y: number) => {
    const ship = fleet.find((entry) => entry.id === selectedShipId);
    if (!ship) return;
    if (!canPlaceShip(fleet, { ...ship, x, y }))
      return toast(
        "Сюда нельзя: корабли не должны касаться друг друга и края за пределами поля.",
      );
    moveShip(selectedShipId, x, y);
  };
  const rotateShip = () =>
    setFleet((currentFleet) => {
      const ship = currentFleet.find((entry) => entry.id === selectedShipId);
      if (!ship || ship.size === 1) return currentFleet;
      const vertical = !ship.vertical;
      if (ship.x < 0 || ship.y < 0)
        return currentFleet.map((entry) =>
          entry.id === ship.id ? { ...entry, vertical } : entry,
        );
      const candidate = {
        ...ship,
        vertical,
        x: Math.min(ship.x, vertical ? 7 : 8 - ship.size),
        y: Math.min(ship.y, vertical ? 8 - ship.size : 7),
      };
      return canPlaceShip(currentFleet, candidate)
        ? currentFleet.map((entry) =>
            entry.id === ship.id ? candidate : entry,
          )
        : currentFleet;
    });
  const lastShot =
    current?.opponent?.shots.filter((shot) => !shot.blocked).at(-1) || null;
  const mineLastShot =
    current?.mine.shots.filter((shot) => !shot.blocked).at(-1) || null;
  const selectedShip = fleet.find((ship) => ship.id === selectedShipId);
  const placementHints =
    current?.status === "SETUP" && !current.mine.ready && selectedShip
      ? Array.from({ length: 64 }, (_, index) => {
          const x = index % 8;
          const y = Math.floor(index / 8);
          return {
            x,
            y,
            valid: canPlaceShip(fleet, { ...selectedShip, x, y }),
          };
        })
      : [];
  const secondsLeft = current?.turnEndsAt
    ? Math.max(
        0,
        Math.ceil((new Date(current.turnEndsAt).getTime() - clockNow) / 1000),
      )
    : 30;
  return (
    <section className="page compact-page naval-page">
      <div className="page-title left">
        <p className="eyebrow">PIGGY NAVAL · 1V1 ONLINE</p>
        <h1>
          Морской <strong>бой</strong>
        </h1>
        <p>
          Собери флот с пустого поля, расставь его без касаний и забери
          виртуальный банк ×2.
        </p>
      </div>
      {!current ? (
        <div className="naval-lobby">
          <section className="naval-create">
            <h2>Создать игру</h2>
            <label>
              Ставка, SC
              <input
                type="number"
                min="100"
                max="500000"
                value={stake}
                onChange={(event) => setStake(event.target.value)}
              />
            </label>
            <small>
              Минимум 100 · максимум 500 000 SC. Победитель получает ×2.
            </small>
            <button className="pig-button" onClick={create}>
              Создать стол →
            </button>
          </section>
          <section className="naval-rooms">
            <h2>Открытые столы</h2>
            {savedGameId && (
              <button className="pig-button naval-return" onClick={resume}>
                ↩ Вернуться в свою игру
              </button>
            )}
            {games.length ? (
              games.map((game) => (
                <article key={game.id}>
                  <span>⚓</span>
                  <div>
                    <b>{game.players?.[0]?.user?.username || "Свинка"}</b>
                    <small>
                      Ставка {coins(game.stake)} SC · ожидание соперника
                    </small>
                  </div>
                  <button className="login" onClick={() => join(game.id)}>
                    Войти
                  </button>
                </article>
              ))
            ) : (
              <div className="empty-feed">Свободных столов пока нет.</div>
            )}
          </section>
        </div>
      ) : (
        <section className="naval-game">
          <div className="naval-status">
            <b>
              {current.status === "WAITING"
                ? "Ждём соперника…"
                : current.status === "SETUP"
                  ? "Расставьте короткий флот"
                  : current.status === "FINISHED"
                    ? current.winnerUserId === user?.id
                      ? "ПОБЕДА · банк зачислен!"
                      : "Игра завершена"
                    : current.turnUserId === user?.id
                      ? `Твой ход · ${secondsLeft} сек.`
                      : `Ход соперника · ${secondsLeft} сек.`}
            </b>
            <span>Банк: {coins(current.stake * 2)} SC</span>
            <button className="login" onClick={() => setCurrent(null)}>
              К столам
            </button>
          </div>
          {current.status === "FINISHED" && (
            <div
              className={`naval-finish-modal ${current.winnerUserId === user?.id ? "victory" : "defeat"}`}
            >
              <span>{current.winnerUserId === user?.id ? "🏆" : "⚓"}</span>
              <p className="eyebrow">МОРСКОЙ БОЙ ЗАВЕРШЁН</p>
              <h2>
                {current.winnerUserId === user?.id ? "Победа!" : "Бой завершён"}
              </h2>
              <p>
                {current.winnerUserId === user?.id
                  ? `Ты уничтожил весь флот и забрал ${coins(current.stake * 2)} SC.`
                  : "Все корабли уничтожены. В следующий раз свинки возьмут реванш!"}
              </p>
              <button className="pig-button" onClick={() => setCurrent(null)}>
                К столам →
              </button>
            </div>
          )}
          {current.status === "WAITING" ? (
            <div className="empty-feed">
              Поделись столом — второй игрок появится здесь автоматически.
            </div>
          ) : (
            <div className="naval-fields">
              <div>
                <h3>Твой флот</h3>
                <NavalBoard
                  ships={
                    current.mine.ready ? current.mine.ships : fleetCells(fleet)
                  }
                  shots={current.mine.shots}
                  disabled={current.mine.ready || current.status !== "SETUP"}
                  placementHints={placementHints}
                  onCell={placeSelected}
                  onDropCell={(x, y, shipId) => {
                    setSelectedShipId(shipId);
                    moveShip(shipId, x, y);
                  }}
                />
                {!current.mine.ready && (
                  <>
                    <div className="fleet-dock">
                      {fleet.map((ship) => (
                        <button
                          draggable
                          key={ship.id}
                          className={`${selectedShipId === ship.id ? "selected" : ""} ${shipCells(ship).length ? "placed" : "unplaced"}`}
                          onDragStart={(event) =>
                            event.dataTransfer.setData("text/plain", ship.id)
                          }
                          onClick={() => setSelectedShipId(ship.id)}
                        >
                          <span>
                            {Array.from({ length: ship.size }, (_, index) => (
                              <i key={index} />
                            ))}
                          </span>
                          <b>×{ship.size}</b>
                          <small>
                            {shipCells(ship).length ? "на поле" : "выбрать"}
                          </small>
                        </button>
                      ))}
                    </div>
                    <div className="fleet-actions">
                      <button
                        className="login"
                        disabled={selectedShip?.size === 1}
                        onClick={rotateShip}
                      >
                        ↻ Повернуть
                      </button>
                      <button
                        className="login"
                        onClick={() => {
                          setFleet(emptyFleet());
                          setSelectedShipId("fleet-0");
                        }}
                      >
                        Очистить поле
                      </button>
                      <button
                        className="login"
                        onClick={() => {
                          const mixed = randomFleet();
                          setFleet(mixed);
                          setSelectedShipId(mixed[0].id);
                        }}
                      >
                        ↻ Расставить случайно
                      </button>
                      <button
                        className="pig-button"
                        disabled={fleetCells(fleet).length !== 9}
                        onClick={ready}
                      >
                        Готово · {fleetCells(fleet).length}/9
                      </button>
                    </div>
                  </>
                )}
                {mineLastShot && (
                  <div
                    className={`naval-shot-info ${mineLastShot.hit ? "hit" : "miss"}`}
                  >
                    {mineLastShot.sunk
                      ? "💥 ТВОЙ КОРАБЛЬ УНИЧТОЖЕН · КЛЕТКИ ВОКРУГ ОТМЕЧЕНЫ"
                      : mineLastShot.hit
                        ? "🎯 СОПЕРНИК ПОПАЛ В ТВОЙ КОРАБЛЬ"
                        : "🌊 СОПЕРНИК ПРОМАХНУЛСЯ"}
                  </div>
                )}
                <small className="naval-hint naval-placement-hint">
                  <b>1.</b> Выбери корабль снизу.{" "}
                  <b className="hint-green">Зелёные</b> клетки подходят,{" "}
                  <b className="hint-red">розовые</b> — нет. <b>2.</b> Кликни по
                  зелёной клетке или перетащи корабль; поворот — отдельной
                  кнопкой.
                </small>
              </div>
              <div>
                <h3>{current.opponent?.username || "Соперник"}</h3>
                <NavalBoard
                  enemy
                  shots={current.opponent?.shots || []}
                  disabled={
                    current.status !== "PLAYING" ||
                    current.turnUserId !== user?.id
                  }
                  onCell={shot}
                />
                {lastShot && (
                  <div
                    className={`naval-shot-info ${lastShot.hit ? "hit" : "miss"}`}
                  >
                    {lastShot.sunk
                      ? "💥 Корабль уничтожен! Клетки вокруг отмечены точками."
                      : lastShot.hit
                        ? "🎯 Попадание — стреляй ещё!"
                        : "🌊 Мимо — ход соперника"}
                  </div>
                )}
                <small className="naval-hint">
                  Корабли противника скрыты. ✹ — попадание, · — мимо, • — клетка
                  рядом с уничтоженным кораблём.
                </small>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
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
function EmptyInventory({ onClick }: { onClick: () => void }) {
  return (
    <div className="empty-inventory">
      <span>🐷</span>
      <h2>ТВОЯ СВИНКА ПОКА ПУСТА</h2>
      <p>Открой первый кейс и начни коллекцию!</p>
      <button className="pig-button" onClick={onClick}>
        Открыть кейсы →
      </button>
    </div>
  );
}
function PromoForm({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="promo-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (value) onSubmit(value);
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Введите промокод"
      />
      <button>АКТИВИРОВАТЬ</button>
    </form>
  );
}
function ChatForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="chat-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (value && !disabled) {
          onSubmit(value);
          setValue("");
        }
      }}
    >
      <input
        disabled={disabled}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={
          disabled ? "Войди, чтобы писать в чат" : "Напиши что-нибудь стае..."
        }
      />
      <button disabled={disabled}>Отправить ↑</button>
    </form>
  );
}
function OnboardingModal({
  username,
  onClose,
  onStart,
}: {
  username: string;
  onClose: () => void;
  onStart: () => void;
}) {
  const [step, setStep] = useState(0);
  const slides = [
    {
      icon: "🐷",
      eyebrow: "ДОБРО ПОЖАЛОВАТЬ В СТАЮ",
      title: `Привет, ${username}!`,
      text: "Здесь всё виртуально: открывай кейсы, собирай скины и прокачивай свой свинобаланс в удобном темпе.",
      points: [
        "Стартовый баланс уже ждёт в профиле",
        "Все полученные скины лежат в инвентаре",
      ],
    },
    {
      icon: "📦",
      eyebrow: "КЕЙСЫ И ИНВЕНТАРЬ",
      title: "Начни с открытия",
      text: "Выбирай кейс, смотри шансы и открывай по одному или серией. Выпавший предмет можно оставить, продать или использовать в следующем режиме.",
      points: [
        "♥ Добавляй любимые кейсы в избранное",
        "Поиск поможет быстро найти нужный кейс",
      ],
    },
    {
      icon: "🎮",
      eyebrow: "ИГРОВАЯ КОМНАТА",
      title: "Шесть режимов риска",
      text: "Апгрейд, баттлы, морской бой, мины, контракт и краш — каждый режим подробно объясняет правила прямо на своей странице.",
      points: [
        "Не ставь больше, чем готов потерять",
        "В играх результат фиксируется сервером",
      ],
    },
    {
      icon: "💳",
      eyebrow: "БАЛАНС И ВОЗМОЖНОСТИ",
      title: "Баланс под контролем",
      text: "В профиле есть ежедневный кейс и свинокредит: можно получать до 150 000 SC в день частями. Там же меняются аватар, цвет ника и видна история апгрейдов.",
      points: [
        "Кнопка «Пополнить баланс» ведёт в профиль",
        "🔊 в шапке включает или выключает игровые звуки",
      ],
    },
  ];
  const current = slides[step];
  const last = step === slides.length - 1;
  return (
    <div className="modal-backdrop onboarding-backdrop">
      <section className="onboarding-modal" aria-label="Знакомство с сайтом">
        <button className="close" onClick={onClose}>
          ×
        </button>
        <div className="onboarding-art">
          <span>{current.icon}</span>
          <i>✦</i>
          <i>✦</i>
          <i>✦</i>
        </div>
        <p className="eyebrow">{current.eyebrow}</p>
        <h2>{current.title}</h2>
        <p className="onboarding-copy">{current.text}</p>
        <ul>
          {current.points.map((point) => (
            <li key={point}>
              <span>✓</span>
              {point}
            </li>
          ))}
        </ul>
        <div className="onboarding-footer">
          <div className="onboarding-dots">
            {slides.map((_, index) => (
              <button
                key={index}
                aria-label={`Шаг ${index + 1}`}
                className={index === step ? "active" : ""}
                onClick={() => setStep(index)}
              />
            ))}
          </div>
          <div>
            {step > 0 && (
              <button
                className="ghost-button onboarding-back"
                onClick={() => setStep((value) => value - 1)}
              >
                Назад
              </button>
            )}
            <button
              className="pig-button"
              onClick={() => (last ? onStart() : setStep((value) => value + 1))}
            >
              {last ? "К КЕЙСАМ →" : "ДАЛЬШЕ →"}
            </button>
          </div>
        </div>
        <button className="text-button onboarding-skip" onClick={onClose}>
          Пропустить знакомство
        </button>
      </section>
    </div>
  );
}

function AuthModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<void>;
}) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <form
        className="auth-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await onSubmit(email, password, register ? username : undefined);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка");
          }
        }}
      >
        <button className="close" type="button" onClick={onClose}>
          ×
        </button>
        <div className="auth-pig">🐷</div>
        <p className="eyebrow">СВИНОПРОПУСК</p>
        <h2>{register ? "Вступить в стаю" : "С возвращением!"}</h2>
        {register && (
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Никнейм"
            required
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль (от 8 символов)"
          required
        />
        {error && <p className="form-error">{error}</p>}
        <button className="pig-button">
          {register ? "Создать аккаунт" : "Войти"} →
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Уже есть аккаунт? Войти"
            : "Нет аккаунта? Вступить в стаю"}
        </button>
      </form>
    </div>
  );
}
function UpgradeDial({
  chance,
  phase,
  result,
  mode,
}: {
  chance: number;
  phase: "idle" | "spinning" | "result";
  result: { success: boolean; landingAngle: number } | null;
  mode: SpinMode;
}) {
  const safeChance = Math.max(5, chance || 5);
  // The pink landing arc follows the protected chance and remains readable
  // even at the protected 5% minimum.
  const successArc = Math.max(8, Math.min(324, safeChance * 3.6));
  const pointOnSuccessArc = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: 169 + 124 * Math.cos(radians),
      y: 169 + 124 * Math.sin(radians),
    };
  };
  const arcStart = pointOnSuccessArc(90 - successArc / 2);
  const arcEnd = pointOnSuccessArc(90 + successArc / 2);
  // The chance is a broad curved band on the lower rim. It expands from the
  // fixed bottom arrow in both directions, just like a real landing zone.
  const successArcPath = `M ${arcStart.x.toFixed(2)} ${arcStart.y.toFixed(2)} A 124 124 0 ${successArc > 180 ? 1 : 0} 1 ${arcEnd.x.toFixed(2)} ${arcEnd.y.toFixed(2)}`;
  // The arrow itself moves; the green success segment is fixed below.
  // The final angle is decided by the server result before this animation begins.
  const endAngle = result?.landingAngle || 0;
  // Do not attach an outcome class while the arrow is moving: a green centre
  // used to reveal a win before the animation had finished.
  const outcomeClass =
    phase === "result" ? (result?.success ? "success" : "failure") : "";
  return (
    <div
      className={`sd-upgrade mode-${mode.toLowerCase()} ${phase} ${result ? "ready" : ""} ${outcomeClass}`}
      style={
        {
          "--success-size": `${safeChance * 3.6}deg`,
          "--needle-end": `${endAngle}deg`,
          "--motion-duration": `${spinDuration[mode]}ms`,
        } as React.CSSProperties
      }
    >
      <img
        className="sd-wheel-art"
        src="https://i.ibb.co/s9TD5GbD/ebb7d6c8-4f78-42b1-af6b-0c803fe48b50.png"
        alt=""
        aria-hidden="true"
      />
      <div className="sd-success-ring" aria-hidden="true">
        <svg viewBox="0 0 338 338">
          <defs>
            <linearGradient id="svino-success-arc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff9bd3" />
              <stop offset=".48" stopColor="#ff4ca8" />
              <stop offset="1" stopColor="#d51a73" />
            </linearGradient>
            <clipPath id="svino-wheel-clip">
              <circle cx="169" cy="169" r="144" />
            </clipPath>
          </defs>
          <g clipPath="url(#svino-wheel-clip)">
            <path className="sd-success-arc-glow" d={successArcPath} />
            <path className="sd-success-arc-band" d={successArcPath} />
          </g>
        </svg>
      </div>
      <div className="sd-upgrade-disc">
        <div className="sd-ticks" />
        <div className="sd-core">
          <span className="sd-snout">🐽</span>
          <small>
            {phase === "spinning"
              ? "СТРЕЛКА В ПОЛЁТЕ"
              : phase === "result"
                ? result?.success
                  ? "СОЧНОЕ ПОПАДАНИЕ"
                  : "БЕКОН УСКОЛЬЗНУЛ"
                : "ТВОЙ ШАНС"}
          </small>
          <b>
            {phase === "result"
              ? result?.success
                ? "WIN"
                : "FAIL"
              : `${safeChance}%`}
          </b>
          <em>SVINO LUCK</em>
        </div>
      </div>
      <div className="sd-needle">
        <img
          src="https://i.ibb.co/23N6LSw7/cfb5f7f3-1a3e-43b9-a6b2-b11ec6b4e474.png"
          alt=""
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function CaseReel({
  pool,
  winner,
  phase,
  compact,
  onFinished,
}: {
  pool: Skin[];
  winner?: Skin;
  phase: "idle" | "spinning" | "result";
  compact?: boolean;
  onFinished?: () => void;
}) {
  const reel = winner
    ? (Array.from({ length: 36 }, (_, index) =>
        index === 20
          ? winner
          : pool[(index * 7 + 3) % Math.max(pool.length, 1)],
      ).filter(Boolean) as Skin[])
    : pool.slice(0, 12);
  const state =
    phase === "spinning" && winner
      ? "rolling"
      : phase === "result" && winner
        ? "finished"
        : "";
  return (
    <div className={`sd-case-reel ${compact ? "compact" : ""} ${state}`}>
      <div className="sd-case-pointer" />
      <div
        key={winner?.id || "preview"}
        className={`sd-case-track ${state}`}
        onAnimationEnd={() => {
          if (phase === "spinning" && winner) onFinished?.();
        }}
      >
        {reel.map((skin, index) => (
          <article
            className={`sd-case-card ${rarity(skin.rarity)}`}
            key={`${skin.id}-${index}`}
          >
            <img
              src={skin.image}
              alt=""
              onError={({ currentTarget }) => {
                currentTarget.onerror = null;
                currentTarget.src = "/skin-fallback.svg";
              }}
            />
            <small>{skin.wear}</small>
            <b>{skin.name}</b>
            <em>{coins(skin.price)} SC</em>
          </article>
        ))}
      </div>
    </div>
  );
}

function RiskReveal({
  pool,
  winner,
  phase,
  onFinished,
}: {
  pool: Skin[];
  winner?: Skin;
  phase: "idle" | "spinning" | "result";
  onFinished: () => void;
}) {
  const fogSlots = 5;
  const [revealed, setRevealed] = useState(0);
  const [run, setRun] = useState<{
    attempts: number;
    path: number[];
    previews: (Skin | undefined)[];
  }>({ attempts: 0, path: [], previews: [] });
  useEffect(() => {
    setRevealed(0);
    if (phase !== "spinning" || !winner) return;
    const distinctPool = Array.from(
      new Map(pool.map((skin) => [skin.id, skin])).values(),
    );
    const shuffle = <T,>(items: T[]) =>
      [...items].sort(() => Math.random() - 0.5);
    const attempts = 3 + Math.floor(Math.random() * 3);
    const path = shuffle(
      Array.from({ length: fogSlots }, (_, index) => index),
    ).slice(0, attempts);
    const finalIndex = path.at(-1) || 0;
    const falseDrops = shuffle(
      distinctPool.filter((skin) => skin.id !== winner.id),
    );
    let falseDropIndex = 0;
    const previews = Array.from({ length: fogSlots }, (_, index) =>
      index === finalIndex ? winner : falseDrops[falseDropIndex++] || winner,
    );
    setRun({ attempts, path, previews });
    const timers = Array.from({ length: attempts }, (_, index) =>
      window.setTimeout(
        () => {
          playSiteSound("card");
          setRevealed(index + 1);
        },
        (index + 1) * 980,
      ),
    );
    const finish = window.setTimeout(onFinished, attempts * 980 + 640);
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(finish);
    };
  }, [phase, winner?.id]);
  const finalIndex = run.path.at(-1) || 0;
  const pointerIndex =
    phase === "spinning"
      ? (run.path[Math.min(revealed, Math.max(0, run.attempts - 1))] ?? 0)
      : finalIndex;
  return (
    <section
      className={`risk-reveal ${phase} ${winner ? "ready" : "waiting"}`}
      style={
        {
          "--risk-columns": fogSlots,
          "--risk-pointer": `${((pointerIndex + 0.5) / fogSlots) * 100}%`,
        } as React.CSSProperties
      }
    >
      <div className="risk-reveal-head">
        <span>🎲</span>
        <div>
          <small>АЗАРТНАЯ ПРОВЕРКА</small>
          <b>
            {winner ? "СТРЕЛКА ВЫБИРАЕТ ЯЧЕЙКУ" : "СВИНОСЕРВЕР ПРЯЧЕТ ПРИЗ"}
          </b>
        </div>
      </div>
      <div className="risk-question-reel">
        <i className="risk-pointer">▼</i>
        <div className="risk-question-row">
          {Array.from({ length: fogSlots }, (_, index) => {
            const skin = run.previews[index];
            const open =
              phase === "result" || run.path.slice(0, revealed).includes(index);
            const final = index === finalIndex;
            return (
              <article
                className={`${open ? "opened" : ""} ${index === pointerIndex && phase === "spinning" ? "active" : ""} ${open && final ? "final" : ""}`}
                key={`${winner?.id || "question"}-${index}`}
              >
                {open && skin ? (
                  <>
                    <img src={skin.image} alt="" />
                    <small>{final ? "ТВОЙ ПРИЗ" : "ЛОЖНЫЙ СЛЕД"}</small>
                  </>
                ) : (
                  <span>?</span>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <p>
        {phase === "spinning"
          ? "Каждый запуск собирает новый набор из разных предметов кейса. Приз может оказаться в любой ячейке."
          : "Барабан остановился: все пять разных ячеек раскрыты, а приз уже в твоём инвентаре."}
      </p>
    </section>
  );
}

function MagicReveal({
  data,
  opening,
  phase,
  balanceReward,
  onFinished,
}: {
  data: Case;
  opening: Drop[] | null;
  phase: "idle" | "spinning" | "result";
  balanceReward: number;
  onFinished: () => void;
}) {
  const rewardCount = (opening?.length || 0) + (balanceReward > 0 ? 1 : 0);
  return (
    <div
      className={`magic-reveal magic-${data.slug} ${phase}`}
      onAnimationEnd={(event) => {
        if (
          event.currentTarget === event.target &&
          phase === "spinning" &&
          opening
        )
          onFinished();
      }}
    >
      {phase !== "result" && (
        <>
          <div className="magic-spark one">✦</div>
          <div className="magic-spark two">✧</div>
          <div className="magic-spark three">✦</div>
          <img src={data.image} alt="" />
          <div className="magic-runes">✧ ✦ ✧</div>
          {phase === "idle" && (
            <b>
              СОСТАВ СКРЫТ
              <br />
              <small>1–3 предмета или свинокоинов</small>
            </b>
          )}
          {phase === "spinning" && (
            <b>
              МАГИЯ ВНУТРИ…
              <br />
              <small>СВИНОЗАКЛИНАНИЕ РАБОТАЕТ</small>
            </b>
          )}
        </>
      )}
      {phase === "result" && (
        <div
          className={`magic-rewards rewards-${Math.min(4, Math.max(1, rewardCount))}`}
        >
          {opening?.map((drop, index) => (
            <article
              key={drop.inventoryId}
              style={{ "--delay": `${index * 160}ms` } as React.CSSProperties}
            >
              <img src={drop.item.image} alt="" />
              <b>{drop.item.name}</b>
              <em>{coins(drop.item.price)} SC</em>
            </article>
          ))}
          {balanceReward > 0 && (
            <article className="magic-coins">
              <span>🐷</span>
              <b>Магический баланс</b>
              <em>+{coins(balanceReward)} SC</em>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
function CaseModal({
  data,
  count,
  setCount,
  opening,
  balanceReward,
  phase,
  mode,
  setMode,
  onFinished,
  onClose,
  onOpen,
  onSellDrops,
  sellingCaseDrops,
  caseDropsSold,
  onOpenAgain,
}: {
  data: Case;
  count: number;
  setCount: (n: number) => void;
  opening: Drop[] | null;
  balanceReward: number;
  phase: "idle" | "spinning" | "result";
  mode: SpinMode;
  setMode: (mode: SpinMode) => void;
  onFinished: () => void;
  onClose: () => void;
  onOpen: () => void;
  onSellDrops: () => void;
  sellingCaseDrops: boolean;
  caseDropsSold: boolean;
  onOpenAgain: () => void;
}) {
  const pool = data.items.map((entry) => entry.item);
  const magic = data.openingStyle === "MAGIC";
  const risk = !magic && mode === "RISK";
  const multi = (opening?.length || count) > 1;
  const bulk = !magic && (opening?.length || count) >= 5;
  const batchCount = opening?.length || count;
  const reels = opening?.map((drop) => drop.item) || [undefined];
  const contents = [...data.items].sort(
    (left, right) => left.item.price - right.item.price,
  );
  const totalWeight = data.items.reduce((sum, entry) => sum + entry.weight, 0);
  // The question path has one auditable final drop, so it deliberately opens
  // one case at a time instead of disguising several outcomes at once.
  useEffect(() => {
    if (risk && count !== 1) setCount(1);
  }, [risk, count, setCount]);
  return (
    <div className="modal-backdrop">
      <section
        className={`case-modal cinematic-case ${magic ? `magic-case magic-${data.slug}` : ""} ${phase} ${multi ? "multi-opening" : ""} ${bulk ? "bulk-opening" : ""} mode-${mode.toLowerCase()}`}
        style={
          {
            "--reel-duration": `${spinDuration[mode]}ms`,
          } as React.CSSProperties
        }
      >
        <button
          className="close"
          onClick={onClose}
          disabled={phase === "spinning"}
        >
          ×
        </button>
        <div className="case-modal-head">
          <img src={data.image} alt="" />
          <div>
            <p className="eyebrow">
              {magic
                ? "МАГИЧЕСКИЕ СВИНЬИ · SECRET DROP"
                : risk
                  ? "AZART MODE · QUESTION PATH"
                  : "СВИНООХОТНИКИ · SERVER DROP"}
            </p>
            <h2>{data.name}</h2>
            <p>
              {magic
                ? "Содержимое скрыто. За одно заклинание — до трёх предметов и редкий балансный бонус."
                : risk && phase === "spinning"
                  ? "Приз уже защищён сервером. Сколько остановок сделает стрелка — скрыто в тумане."
                  : phase === "spinning"
                    ? "Все результаты уже зафиксированы сервером. Ленты плавно замедляются…"
                    : "Состав и веса открыты: дорогие предметы встречаются реже."}
            </p>
          </div>
          <b>
            {coins(data.price)} <small>SC</small>
          </b>
        </div>
        {magic ? (
          <MagicReveal
            data={data}
            opening={opening}
            phase={phase}
            balanceReward={balanceReward}
            onFinished={onFinished}
          />
        ) : (
          <>
            <div className="reel-status">
              <span className="pulse-dot" />
              {phase === "spinning"
                ? risk
                  ? "ПРОХОДИМ ВОПРОСЫ"
                  : "КРУТИМ РУЛЕТКУ"
                : phase === "result"
                  ? "ДРОП РАСКРЫТ"
                  : "ГОТОВ К ОТКРЫТИЮ"}
              <em>SERVER VERIFIED</em>
            </div>
            {phase === "spinning" && opening && (
              <button className="case-skip-animation" onClick={onFinished}>
                Пропустить анимацию <span>→</span>
              </button>
            )}
            {risk ? (
              <RiskReveal
                pool={pool}
                winner={reels[0]}
                phase={phase}
                onFinished={onFinished}
              />
            ) : (
              <>
                {bulk && (
                  <div className={`case-batch-head ${phase}`}>
                    <span>×{batchCount}</span>
                    <div><b>СВИНСКИЙ МУЛЬТИДРОП</b><small>{phase === "spinning" ? "Десять лент, один большой момент…" : phase === "result" ? "Вся серия уже в твоём инвентаре" : "Открой серию одним нажатием"}</small></div>
                    <em>{phase === "spinning" ? "КРУТИМ" : phase === "result" ? "ГОТОВО" : "ГОТОВ"}</em>
                  </div>
                )}
                <div className={`case-reels ${multi ? "multiple" : ""} ${bulk ? "bulk" : ""}`}>
                {reels.map((winner, index) => (
                  <CaseReel
                    key={`${winner?.id || "empty"}-${index}`}
                    pool={pool}
                    winner={winner}
                    phase={phase}
                    compact={multi}
                    onFinished={index === 0 ? onFinished : undefined}
                  />
                ))}
                </div>
              </>
            )}
            {phase === "idle" && (
              <section className="case-contents">
                <div>
                  <b>СОДЕРЖИМОЕ КЕЙСА</b>
                  <span>
                    {contents.length} предметов · от{" "}
                    {coins(contents[0]?.item.price || 0)} до{" "}
                    {coins(contents.at(-1)?.item.price || 0)} SC
                  </span>
                </div>
                <div className="case-contents-grid">
                  {contents.map((entry) => (
                    <article
                      className={rarity(entry.item.rarity)}
                      key={entry.id}
                    >
                      <img
                        src={entry.item.image}
                        alt=""
                        onError={({ currentTarget }) => {
                          currentTarget.onerror = null;
                          currentTarget.src = "/skin-fallback.svg";
                        }}
                      />
                      <span>
                        <b>{entry.item.name}</b>
                        <small>
                          {entry.item.wear} · шанс{" "}
                          {(
                            entry.chance ??
                            (totalWeight
                              ? (entry.weight / totalWeight) * 100
                              : 0)
                          ).toFixed(2)}
                          %
                        </small>
                      </span>
                      <em>{coins(entry.item.price)} SC</em>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        {phase === "result" && opening && (
          <div className={`case-result ${caseDropsSold ? "drops-sold" : ""} ${bulk ? "bulk-result" : ""}`}>
            <span>{caseDropsSold ? "🪙" : "🐷"}</span>
            <div className={bulk ? "case-batch-summary" : ""}>
              {!bulk && <small>{caseDropsSold ? "ДРОП ПРОДАН" : opening.length > 1 ? `ТВОИ ${opening.length} НОВЫХ ДРОПОВ` : "ТВОЙ НОВЫЙ ДРОП"}</small>}
              {bulk ? (
                <div className="case-batch-rewards">
                  {opening.map((drop, index) => (
                    <article className={rarity(drop.item.rarity)} key={drop.dropId}>
                      <span>#{index + 1}</span>
                      <img src={drop.item.image} alt="" onError={({ currentTarget }) => { currentTarget.onerror = null; currentTarget.src = "/skin-fallback.svg"; }} />
                      <b>{drop.item.name}</b>
                      <em>{coins(drop.item.price)} SC</em>
                    </article>
                  ))}
                </div>
              ) : <><b>{opening.map((drop) => drop.item.name).join(" · ")}</b><em>{caseDropsSold ? "Окно кейса остаётся открытым — можешь сразу открыть ещё." : "Оставь в инвентаре или продай сразу за полную цену."}</em></>}
            </div>
            <div className="case-result-actions">
              {caseDropsSold ? (
                <button className="login" onClick={onOpenAgain}>
                  Открыть ещё
                </button>
              ) : (
                <>
                  <button className="login" onClick={onClose}>
                    В инвентарь
                  </button>
                  <button
                    className="case-sell-now"
                    disabled={sellingCaseDrops}
                    onClick={onSellDrops}
                  >
                    {sellingCaseDrops
                      ? "Продаём…"
                      : `Продать · ${coins(opening.reduce((sum, drop) => sum + drop.item.price, 0))} SC`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {phase !== "result" && (
          <div className="case-controls">
            <div className="case-options">
              {magic ? (
                <small>ТОЛЬКО ОДНО ЗАКЛИНАНИЕ ЗА РАЗ</small>
              ) : (
                <>
                  <small>ОТКРЫТЬ СЕРИЕЙ</small>
                  <div className="count-picker">
                    {[1, 2, 3, 4, 5, 10].map((value) => (
                      <button
                        key={value}
                        disabled={phase === "spinning"}
                        className={count === value ? "chosen" : ""}
                        onClick={() => setCount(value)}
                      >
                        ×{value}
                      </button>
                    ))}
                  </div>
                  <div className="spin-modes case-modes">
                    {(["FAST", "SLOW", "RISK"] as SpinMode[]).map((speed) => (
                      <button
                        disabled={phase === "spinning"}
                        className={mode === speed ? "chosen" : ""}
                        key={speed}
                        onClick={() => setMode(speed)}
                      >
                        {spinModeLabel[speed]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="case-buy">
              <span>
                {magic
                  ? "Секретное открытие · 1–3 награды"
                  : count > 1
                    ? `${count} кейса · ${spinModeLabel[mode].toLowerCase()} режим`
                    : `${spinModeLabel[mode]} режим`}
              </span>
              <button
                className="pig-button case-launch"
                onClick={onOpen}
                disabled={phase === "spinning"}
              >
                {phase === "spinning"
                  ? opening
                    ? magic
                      ? "ЗАКЛИНАНИЕ РАСКРЫВАЕТСЯ…"
                      : "ЛЕНТЫ КРУТЯТСЯ…"
                    : "ФИКСИРУЕМ ДРОП…"
                  : `ОТКРЫТЬ ЗА ${coins(data.price * (magic ? 1 : count))} SC`}{" "}
                <span>→</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
function Giveaways({
  giveaways,
  onEnter,
}: {
  giveaways: Giveaway[];
  onEnter: (id: string) => void;
}) {
  const kinds: Record<string, string> = {
    HOURLY: "КАЖДЫЙ ЧАС",
    DAILY: "КАЖДЫЙ ДЕНЬ",
    WEEKLY: "КАЖДУЮ НЕДЕЛЮ",
    CUSTOM: "ОСОБЫЙ РОЗЫГРЫШ",
  };
  return (
    <section className="page compact-page giveaways-page">
      <div className="page-title left">
        <p className="eyebrow">PIGGY GIVEAWAYS</p>
        <h1>
          Свинские <strong>розыгрыши</strong>
        </h1>
        <p>
          Один билет на розыгрыш — один шанс забрать приз. Победитель выбирается
          сервером после окончания.
        </p>
      </div>
      <div className="giveaway-grid">
        {giveaways.map((giveaway) => (
          <article
            className={`giveaway-card giveaway-${giveaway.kind.toLowerCase()}`}
            key={giveaway.id}
          >
            <div className="giveaway-tag">
              🐷 {kinds[giveaway.kind] || kinds.CUSTOM}
            </div>
            <img
              src={giveaway.prizeItem.image}
              alt=""
              onError={({ currentTarget }) => {
                currentTarget.onerror = null;
                currentTarget.src = "/skin-fallback.svg";
              }}
            />
            <div>
              <small>ПРИЗ</small>
              <h3>{giveaway.prizeItem.name}</h3>
              <em>{coins(giveaway.prizeItem.price)} SC</em>
            </div>
            <div className="giveaway-meta">
              <span>👥 {giveaway.entries} участников</span>
              <span>
                ⌛ до{" "}
                {new Date(giveaway.endsAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <button className="pig-button" onClick={() => onEnter(giveaway.id)}>
              Участвовать · {coins(giveaway.entryPrice)} SC →
            </button>
          </article>
        ))}
        {!giveaways.length && (
          <div className="empty-feed">Свиньи уже готовят первый розыгрыш…</div>
        )}
      </div>
    </section>
  );
}
function AdminPanel({
  token,
  toast,
}: {
  token: string;
  toast: (text: string) => void;
}) {
  const [users, setUsers] = useState<
    {
      id: string;
      username: string;
      email: string;
      balance: number;
      isBanned: boolean;
      muteUntil: string | null;
    }[]
  >([]);
  const [tab, setTab] = useState<"users" | "cases" | "promos">("users");
  const [records, setRecords] = useState<
    {
      id: string;
      name?: string;
      code?: string;
      active: boolean;
      price?: number;
      uses?: number;
      maxUses?: number;
    }[]
  >([]);
  const load = () =>
    request(tab === "users" ? "/api/admin/users" : `/api/admin/${tab}`, token)
      .then(tab === "users" ? setUsers : setRecords)
      .catch((error) => toast(error.message));
  useEffect(() => {
    load();
  }, [tab]);
  const changeBalance = async (id: string, direction: "ADD" | "REMOVE") => {
    const raw = window.prompt(
      direction === "ADD"
        ? "Сколько выдать (в свинокоинах)?"
        : "Сколько списать?",
    );
    const amount = Math.round(Number(raw) * 100);
    if (!amount) return;
    try {
      await request(`/api/admin/users/${id}/balance`, token, {
        method: "POST",
        body: JSON.stringify({ direction, amount }),
      });
      toast("Баланс изменён");
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка");
    }
  };
  return (
    <section className="page compact-page">
      <div className="page-title left">
        <p className="eyebrow">ADMIN ONLY</p>
        <h1>
          Панель <strong>свинобосса</strong>
        </h1>
        <p>Управление игроками, виртуальной экономикой и контентом.</p>
      </div>
      <div className="admin-tabs">
        {(["users", "cases", "promos"] as const).map((id) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            {id === "users"
              ? "Пользователи"
              : id === "cases"
                ? "Кейсы"
                : "Промокоды"}
          </button>
        ))}
      </div>
      <div className="admin-table">
        {tab === "users"
          ? users.map((item) => (
              <div className="admin-row" key={item.id}>
                <span>🐷</span>
                <div>
                  <b>
                    {item.username} {item.isBanned && <em>БАН</em>}
                  </b>
                  <small>{item.email}</small>
                </div>
                <strong>{coins(item.balance)} SC</strong>
                <button onClick={() => changeBalance(item.id, "ADD")}>
                  + Баланс
                </button>
                <button onClick={() => changeBalance(item.id, "REMOVE")}>
                  − Баланс
                </button>
              </div>
            ))
          : records.map((item) => (
              <div className="admin-row" key={item.id}>
                <span>{tab === "cases" ? "📦" : "🎟️"}</span>
                <div>
                  <b>{item.name || item.code}</b>
                  <small>{item.active ? "Активен" : "Отключён"}</small>
                </div>
                <strong>
                  {item.price
                    ? `${coins(item.price)} SC`
                    : `${item.uses || 0}/${item.maxUses || 0}`}
                </strong>
              </div>
            ))}
      </div>
    </section>
  );
}
function AdminPanelV2({
  token,
  toast,
}: {
  token: string;
  toast: (text: string) => void;
}) {
  void AdminPanel;
  const [tab, setTab] = useState<
    "users" | "cases" | "items" | "promos" | "giveaways" | "chat" | "logs" | "maintenance"
  >("users");
  const [users, setUsers] = useState<
    {
      id: string;
      username: string;
      email: string;
      balance: number;
      isBanned: boolean;
      muteUntil: string | null;
    }[]
  >([]);
  const [rows, setRows] = useState<any[]>([]);
  const [caseEditor, setCaseEditor] = useState<any | null | undefined>(
    undefined,
  );
  const [giveawayEditor, setGiveawayEditor] = useState(false);
  const [maintenanceModes, setMaintenanceModes] = useState<string[]>([]);
  const MODE_LABELS: Record<string, string> = {
    cases: "Кейсы",
    upgrade: "Апгрейд",
    battles: "Батлы кейсов",
    naval: "Морской бой",
    mines: "Мины",
    pigsty: "Свинарник",
    road: "Свиная дорога",
    contract: "Контракт",
    crash: "Свинокраш",
    boss: "Босс Фалыч",
  };
  const toggleMaintenance = async (mode: string) => {
    const next = maintenanceModes.includes(mode)
      ? maintenanceModes.filter((item) => item !== mode)
      : [...maintenanceModes, mode];
    try {
      const data = await request("/api/admin/maintenance", token, {
        method: "PUT",
        body: JSON.stringify({ modes: next }),
      });
      setMaintenanceModes(data.modes);
      toast(
        next.includes(mode)
          ? "Режим отправлен на технический перерыв"
          : "Режим снова включён для всех",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось изменить статус");
    }
  };
  const load = async () => {
    try {
      if (tab === "users") setUsers(await request("/api/admin/users", token));
      else if (tab === "maintenance")
        setMaintenanceModes((await request("/api/admin/maintenance", token)).modes);
      else setRows(await request(`/api/admin/${tab}`, token));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка загрузки");
    }
  };
  useEffect(() => {
    load();
  }, [tab]);
  const balance = async (userId: string, direction: "ADD" | "REMOVE") => {
    const value = Number(
      window.prompt(
        direction === "ADD" ? "Выдать свинокоины:" : "Списать свинокоины:",
      ),
    );
    if (!value) return;
    await request(`/api/admin/users/${userId}/balance`, token, {
      method: "POST",
      body: JSON.stringify({ direction, amount: Math.round(value * 100) }),
    });
    toast("Баланс обновлён");
    load();
  };
  const status = async (userId: string, body: object, message: string) => {
    try {
      await request(`/api/admin/users/${userId}/status`, token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast(message);
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка");
    }
  };
  const details = async (userId: string) => {
    try {
      const data = await request(`/api/admin/users/${userId}/inventory`, token);
      window.alert(
        data.length
          ? data
              .map(
                (entry: { item: Skin }) =>
                  `${entry.item.name} — ${coins(entry.item.price)} SC`,
              )
              .join("\n")
          : "Инвентарь пуст.",
      );
    } catch {
      toast("Не удалось открыть инвентарь");
    }
  };
  const toggleCase = async (item: { id: string; active: boolean }) => {
    await request(`/api/admin/cases/${item.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ active: !item.active }),
    });
    toast(item.active ? "Кейс отключён" : "Кейс включён");
    load();
  };
  const toggleItem = async (item: { id: string; active: boolean }) => {
    try {
      await request(`/api/admin/items/${item.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      toast(
        item.active
          ? "Предмет скрыт из выпадений"
          : "Предмет возвращён в выпадения",
      );
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка");
    }
  };
  const addItem = async () => {
    const id = window.prompt("Уникальный ID предмета:");
    const name = window.prompt("Название предмета:");
    const price = Number(window.prompt("Цена в свинокоинах:"));
    const image = window.prompt("Ссылка на изображение:");
    const upgradeEligible = window.confirm(
      "Разрешить использовать этот предмет как цель апгрейда?",
    );
    if (!id || !name || !price || !image) return;
    try {
      await request("/api/admin/items", token, {
        method: "POST",
        body: JSON.stringify({
          id,
          name,
          price: Math.round(price * 100),
          image,
          wear: "FN",
          rarity: "CLASSIFIED",
          upgradeEligible,
        }),
      });
      toast(
        upgradeEligible
          ? "Предмет добавлен и доступен в апгрейдах"
          : "Предмет добавлен без доступа в апгрейдах",
      );
      load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось добавить предмет",
      );
    }
  };
  const editItem = async (item: {
    id: string;
    name: string;
    price: number;
    image: string;
    wear: string;
    rarity: string;
    upgradeEligible?: boolean;
  }) => {
    const name = window.prompt("Название предмета:", item.name);
    const price = Number(
      window.prompt("Цена в свинокоинах:", String(item.price / 100)),
    );
    const image = window.prompt("Ссылка на изображение:", item.image);
    const wear = window.prompt("Wear:", item.wear);
    const rarity = window.prompt("Редкость:", item.rarity);
    const upgradeEligible = window.confirm(
      `Разрешить «${item.name}» как цель апгрейда?`,
    );
    if (!name || !price || !image || !wear || !rarity) return;
    try {
      await request(`/api/admin/items/${item.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          price: Math.round(price * 100),
          image,
          wear,
          rarity,
          upgradeEligible,
        }),
      });
      toast(
        upgradeEligible
          ? "Предмет сохранён и доступен в апгрейдах"
          : "Предмет сохранён без доступа в апгрейдах",
      );
      load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось сохранить предмет",
      );
    }
  };
  const togglePromo = async (item: { id: string; active: boolean }) => {
    try {
      await request(`/api/admin/promos/${item.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      toast(item.active ? "Промокод отключён" : "Промокод включён");
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка");
    }
  };
  const removeMessage = async (id: string) => {
    try {
      await request(`/api/admin/chat/${id}`, token, { method: "DELETE" });
      toast("Сообщение удалено");
      load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка");
    }
  };
  const newPromo = async () => {
    const code = window
      .prompt("Код промокода, например PIG2026")
      ?.toUpperCase();
    const coinsValue = Number(window.prompt("Награда в свинокоинах:"));
    const maxUses = Number(window.prompt("Сколько раз можно активировать:"));
    if (!code || !coinsValue || !maxUses) return;
    try {
      await request("/api/admin/promos", token, {
        method: "POST",
        body: JSON.stringify({
          code,
          rewardType: "BALANCE",
          rewardValue: Math.round(coinsValue * 100),
          maxUses,
        }),
      });
      toast("Промокод создан");
      load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось создать промокод",
      );
    }
  };
  const newGiveaway = () => setGiveawayEditor(true);
  const removeGiveaway = async (item: {
    id: string;
    title: string;
    _count?: { entries?: number };
  }) => {
    if (
      !window.confirm(
        `Удалить розыгрыш «${item.title}»?${item._count?.entries ? ` Всем ${item._count.entries} участникам вернётся цена билета.` : ""}`,
      )
    )
      return;
    try {
      const data = await request(`/api/admin/giveaways/${item.id}`, token, {
        method: "DELETE",
      });
      toast(
        data.refunded
          ? `Розыгрыш удалён, билеты возвращены: ${data.refunded}`
          : "Розыгрыш удалён",
      );
      load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Не удалось удалить розыгрыш",
      );
    }
  };
  const resetEconomy = async () => {
    if (
      window.prompt(
        "Введите RESET_ALL_BALANCES_AND_SKINS для очистки балансов и скинов у ВСЕХ игроков:",
      ) !== "RESET_ALL_BALANCES_AND_SKINS"
    )
      return;
    try {
      const result = await request("/api/admin/economy/reset", token, {
        method: "POST",
        body: JSON.stringify({ confirmation: "RESET_ALL_BALANCES_AND_SKINS" }),
      });
      toast(`Очищено: ${result.users} игроков, ${result.skins} скинов`);
      load();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Не удалось очистить экономику",
      );
    }
  };
  if (giveawayEditor)
    return (
      <GiveawayWorkshop
        token={token}
        onClose={() => setGiveawayEditor(false)}
        onSaved={() => {
          setGiveawayEditor(false);
          load();
          toast("Розыгрыш создан и уже виден игрокам");
        }}
        onError={toast}
      />
    );
  return (
    <section className="page compact-page">
      <div className="page-title left">
        <p className="eyebrow">ADMIN ONLY · REAL DATABASE</p>
        <h1>
          Панель <strong>свинобосса</strong>
        </h1>
        <p>
          Управляй игроками, кейсами, предметами, розыгрышами, промокодами,
          чатом и журналом действий.
        </p>
      </div>
      {tab === "cases" && caseEditor !== undefined && (
        <CaseWorkshop
          token={token}
          existing={caseEditor || undefined}
          onClose={() => setCaseEditor(undefined)}
          onSaved={() => {
            setCaseEditor(undefined);
            load();
            toast("Кейс и его состав сохранены");
          }}
        />
      )}
      <div className="profile-columns">
        <section className="panel">
          <h3>Разделы</h3>
          {(
            [
              ["users", "Игроки"],
              ["cases", "Кейсы"],
              ["items", "Предметы"],
              ["giveaways", "Розыгрыши"],
              ["promos", "Промокоды"],
              ["chat", "Модерация чата"],
              ["logs", "Логи"],
              ["maintenance", "Технические работы"],
            ] as const
          ).map(([id, label]) => (
            <button
              className="login"
              style={{
                display: "block",
                width: "100%",
                margin: "7px 0",
                textAlign: "left",
              }}
              key={id}
              onClick={() => {
                setTab(id);
                setCaseEditor(undefined);
              }}
            >
              {tab === id ? "● " : "○ "}
              {label}
            </button>
          ))}
        </section>
        <section className="panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <h3>
              {tab === "users"
                ? "Игроки"
                : tab === "cases"
                  ? "Кейсы"
                  : tab === "items"
                    ? "Предметы"
                    : tab === "giveaways"
                      ? "Розыгрыши"
                      : tab === "promos"
                        ? "Промокоды"
                        : tab === "chat"
                          ? "Модерация чата"
                          : "Журнал"}
            </h3>
            {tab === "cases" && (
              <button
                className="pig-button"
                onClick={() => setCaseEditor(null)}
              >
                + Кейс
              </button>
            )}
            {tab === "giveaways" && (
              <button className="pig-button" onClick={newGiveaway}>
                + Розыгрыш
              </button>
            )}
            {tab === "promos" && (
              <button className="pig-button" onClick={newPromo}>
                + Промокод
              </button>
            )}
            {tab === "items" && (
              <button className="pig-button" onClick={addItem}>
                + Предмет
              </button>
            )}
          </div>
          {tab === "users" && (
            <>
              <button className="admin-danger" onClick={resetEconomy}>
                ⚠ Очистить всем баланс и скины
              </button>
              {users.map((item) => (
                <div className="transaction" key={item.id}>
                  <span>
                    <b>{item.username}</b>
                    <br />
                    <small>
                      {item.email} ·{" "}
                      {item.isBanned
                        ? "🚫 Забанен"
                        : item.muteUntil
                          ? "🔇 Мут"
                          : "✅ Активен"}
                    </small>
                  </span>
                  <b>{coins(item.balance)} SC</b>
                  <button
                    className="login"
                    onClick={() => balance(item.id, "ADD")}
                  >
                    +SC
                  </button>
                  <button
                    className="login"
                    onClick={() => balance(item.id, "REMOVE")}
                  >
                    −SC
                  </button>
                  <button
                    className="login"
                    onClick={() =>
                      status(
                        item.id,
                        { isBanned: !item.isBanned },
                        item.isBanned ? "Бан снят" : "Игрок забанен",
                      )
                    }
                  >
                    {item.isBanned ? "Разбан" : "Бан"}
                  </button>
                  <button
                    className="login"
                    onClick={() =>
                      status(
                        item.id,
                        { muteMinutes: item.muteUntil ? 0 : 60 },
                        item.muteUntil ? "Мут снят" : "Мут на 60 минут",
                      )
                    }
                  >
                    {item.muteUntil ? "Снять мут" : "Мут"}
                  </button>
                  <button className="login" onClick={() => details(item.id)}>
                    Инвентарь
                  </button>
                </div>
              ))}
            </>
          )}
          {tab === "cases" &&
            rows.map((item) => (
              <div className="transaction" key={item.id}>
                <span>
                  <b>{item.name}</b>
                  <br />
                  <small>
                    {item.active ? "✅ Активен" : "⏸ Отключён"} ·{" "}
                    {item.items?.length || 0} предметов · {item.collection}
                  </small>
                </span>
                <b>{coins(item.price)} SC</b>
                <button className="login" onClick={() => setCaseEditor(item)}>
                  Редактор
                </button>
                <button className="login" onClick={() => toggleCase(item)}>
                  {item.active ? "Отключить" : "Включить"}
                </button>
              </div>
            ))}
          {tab === "items" &&
            rows.map((item) => (
              <div className="transaction" key={item.id}>
                <span>
                  <b>{item.name}</b>
                  <br />
                  <small>
                    {item.rarity} · {item.wear} ·{" "}
                    {item.active ? "✅ В дропе" : "⏸ Скрыт"}
                  </small>
                </span>
                <b>{coins(item.price)} SC</b>
                <button className="login" onClick={() => editItem(item)}>
                  Изменить
                </button>
                <button className="login" onClick={() => toggleItem(item)}>
                  {item.active ? "Скрыть" : "Включить"}
                </button>
              </div>
            ))}
          {tab === "giveaways" &&
            rows.map((item) => (
              <div className="transaction" key={item.id}>
                <span>
                  <b>{item.title}</b>
                  <br />
                  <small>
                    {item.kind} · приз: {item.prizeItem?.name} · до{" "}
                    {new Date(item.endsAt).toLocaleString("ru-RU")}
                  </small>
                </span>
                <b>{coins(item.entryPrice)} SC</b>
                <small>{item._count?.entries || 0} участников</small>
                <button className="admin-danger" onClick={() => removeGiveaway(item)}>
                  Удалить
                </button>
              </div>
            ))}
          {tab === "promos" &&
            rows.map((item) => (
              <div className="transaction" key={item.id}>
                <span>
                  <b>{item.code}</b>
                  <br />
                  <small>
                    {item.active ? "✅ Активен" : "⏸ Отключён"} ·{" "}
                    {coins(Number(item.rewardValue || 0))} SC
                  </small>
                </span>
                <b>
                  {item.uses}/{item.maxUses}
                </b>
                <button className="login" onClick={() => togglePromo(item)}>
                  {item.active ? "Отключить" : "Включить"}
                </button>
              </div>
            ))}
          {tab === "chat" &&
            rows.map((item) => (
              <div className="transaction" key={item.id}>
                <span>
                  <b>{item.user?.username}</b>
                  <br />
                  <small>
                    {item.message} ·{" "}
                    {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </small>
                </span>
                <button
                  className="login"
                  onClick={() => removeMessage(item.id)}
                >
                  Удалить
                </button>
              </div>
            ))}
          {tab === "logs" &&
            rows.map((item) => (
              <div className="transaction" key={item.id}>
                <span>
                  <b>{item.action}</b>
                  <br />
                  <small>
                    {item.admin?.email || "admin"} ·{" "}
                    {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </small>
                </span>
              </div>
            ))}
          {tab === "maintenance" && (
            <div>
              <p style={{ color: "#af7e94", fontSize: 12, margin: "0 0 14px" }}>
                Включи тумблер — режим уйдёт на технический перерыв: игроки увидят
                заглушку и не смогут делать новые ставки. Уже идущие раунды
                доигрываются как обычно. Выключишь в любой момент — режим сразу
                снова доступен всем.
              </p>
              {Object.entries(MODE_LABELS).map(([id, label]) => {
                const blocked = maintenanceModes.includes(id);
                return (
                  <div
                    key={id}
                    className="transaction"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span>
                      <b>{label}</b>
                      <br />
                      <small style={{ color: blocked ? "#ff8ba3" : "#7fd9a0" }}>
                        {blocked ? "На техническом перерыве" : "Работает"}
                      </small>
                    </span>
                    <button
                      className="login"
                      style={
                        blocked
                          ? {
                              borderColor: "#ff5a6b",
                              color: "#ffd7dc",
                              background: "#3a0d16",
                            }
                          : {
                              borderColor: "#4bdc7e",
                              color: "#c9ffd9",
                              background: "#123a24",
                            }
                      }
                      onClick={() => toggleMaintenance(id)}
                    >
                      {blocked ? "Включить обратно" : "Отправить на перерыв"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function GiveawayWorkshop({
  token,
  onClose,
  onSaved,
  onError,
}: {
  token: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<Skin[]>([]);
  const [title, setTitle] = useState("Сочный свинорозыгрыш");
  const [prizeItemId, setPrizeItemId] = useState("");
  const [entryCoins, setEntryCoins] = useState("100");
  const [duration, setDuration] = useState(24);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    request("/api/admin/items", token)
      .then((data) => {
        const active = data.filter(
          (item: Skin & { active?: boolean }) => item.active !== false,
        );
        setItems(active);
        setPrizeItemId((current) => current || active[0]?.id || "");
      })
      .catch(() => onError("Не удалось загрузить каталог призов"));
  }, [token]);
  const prize = items.find((item) => item.id === prizeItemId);
  const endsAt = new Date(Date.now() + Math.max(1, duration) * 3_600_000);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const entryPrice = Math.round(Number(entryCoins) * 100);
    if (
      title.trim().length < 3 ||
      !prizeItemId ||
      entryPrice < 100 ||
      duration < 1
    )
      return onError("Заполни название, приз, цену от 1 SC и срок.");
    setSaving(true);
    try {
      await request("/api/admin/giveaways", token, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          prizeItemId,
          entryPrice,
          startsAt: new Date().toISOString(),
          endsAt: endsAt.toISOString(),
        }),
      });
      onSaved();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Не удалось создать розыгрыш",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="page compact-page giveaway-workshop-page">
      <form className="giveaway-workshop" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">КОНСТРУКТОР РОЗЫГРЫШЕЙ</p>
            <h1>
              Новый <strong>розыгрыш</strong>
            </h1>
            <p>
              Три простых шага: выбери приз, назначь цену билета и срок.
              Розыгрыш стартует сразу после сохранения.
            </p>
          </div>
          <button type="button" className="login" onClick={onClose}>
            ← К розыгрышам
          </button>
        </header>
        <div className="giveaway-steps">
          <span className="active">
            <b>1</b> Приз
          </span>
          <i />
          <span className="active">
            <b>2</b> Условия
          </span>
          <i />
          <span className="active">
            <b>3</b> Готово
          </span>
        </div>
        <div className="giveaway-workshop-grid">
          <section>
            <label>
              Название розыгрыша
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Например: Пятничный свинодроп"
              />
            </label>
            <label>
              Цена билета, SC
              <input
                type="number"
                min="1"
                value={entryCoins}
                onChange={(event) => setEntryCoins(event.target.value)}
              />
              <small>Каждый игрок может купить один билет.</small>
            </label>
            <div className="giveaway-duration">
              <b>Длительность</b>
              <div>
                {[
                  [1, "1 час"],
                  [24, "24 часа"],
                  [72, "3 дня"],
                  [168, "7 дней"],
                ].map(([hours, label]) => (
                  <button
                    type="button"
                    className={duration === hours ? "chosen" : ""}
                    key={hours}
                    onClick={() => setDuration(hours as number)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label>
                Свой срок в часах
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={duration}
                  onChange={(event) =>
                    setDuration(Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </label>
            </div>
          </section>
          <section className="giveaway-prize-picker">
            <div>
              <b>Выбери приз</b>
              <small>Только активные предметы из каталога.</small>
            </div>
            <div className="giveaway-prize-list">
              {items.map((item) => (
                <button
                  type="button"
                  className={item.id === prizeItemId ? "picked" : ""}
                  key={item.id}
                  onClick={() => setPrizeItemId(item.id)}
                >
                  <img src={item.image} alt="" />
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {item.wear} · {coins(item.price)} SC
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <aside className="giveaway-preview">
            <p className="eyebrow">ПРЕДПРОСМОТР</p>
            {prize ? (
              <>
                <img src={prize.image} alt="" />
                <small>ПРИЗ</small>
                <b>{prize.name}</b>
                <em>{coins(prize.price)} SC</em>
              </>
            ) : (
              <span>🎁</span>
            )}
            <div>
              <span>
                Билет <b>{entryCoins || 0} SC</b>
              </span>
              <span>
                Итоги{" "}
                <b>
                  {endsAt.toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </b>
              </span>
            </div>
            <button className="pig-button" disabled={saving || !prizeItemId}>
              {saving ? "СОЗДАЁМ…" : "ЗАПУСТИТЬ РОЗЫГРЫШ →"}
            </button>
          </aside>
        </div>
      </form>
    </section>
  );
}

function CaseWorkshop({
  token,
  existing,
  onClose,
  onSaved,
  onError,
}: {
  token: string;
  existing?: any;
  onClose: () => void;
  onSaved: () => void;
  onError?: (message: string) => void;
}) {
  const [items, setItems] = useState<(Skin & { active: boolean })[]>([]);
  const [draft, setDraft] = useState({
    name: existing?.name || "",
    slug: existing?.slug || "",
    price: existing?.price ? String(existing.price / 100) : "",
    image: existing?.image || "",
    collection: existing?.collection || "Свиноохотники",
  });
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (existing?.items || []).map((entry: any) => [
        entry.itemId || entry.item?.id,
        entry.weight,
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    request("/api/admin/items", token)
      .then(setItems)
      .catch(() => undefined);
  }, [token]);
  const selected = Object.entries(weights).filter(([, weight]) => weight > 0);
  const setWeight = (id: string, weight: number) =>
    setWeights((current) => ({ ...current, [id]: weight }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const price = Math.round(Number(draft.price) * 100);
    if (
      !draft.name ||
      !draft.slug ||
      !draft.image ||
      !draft.collection ||
      !price ||
      !selected.length
    )
      return;
    setSaving(true);
    try {
      const payload = {
        ...draft,
        price,
        items: selected.map(([itemId, weight]) => ({ itemId, weight })),
      };
      if (existing?.id) {
        await request(`/api/admin/cases/${existing.id}`, token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        await request(`/api/admin/cases/${existing.id}/items`, token, {
          method: "PUT",
          body: JSON.stringify({ items: payload.items }),
        });
      } else
        await request("/api/admin/cases", token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      onSaved();
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить состав кейса",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="case-workshop" onSubmit={submit}>
      <div className="workshop-head">
        <div>
          <p className="eyebrow">КОНСТРУКТОР КЕЙСОВ</p>
          <h2>{existing ? `Редактор: ${existing.name}` : "Новый кейс"}</h2>
          <p>Выбери предметы, укажи им веса и сохрани всё одной кнопкой.</p>
        </div>
        <button type="button" className="login" onClick={onClose}>
          Закрыть ×
        </button>
      </div>
      <div className="workshop-fields">
        <label>
          Название
          <input
            required
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </label>
        <label>
          Slug
          <input
            required
            disabled={!!existing}
            pattern="[a-z0-9-]{3,64}"
            value={draft.slug}
            onChange={(event) =>
              setDraft({ ...draft, slug: event.target.value.toLowerCase() })
            }
          />
        </label>
        <label>
          Цена, SC
          <input
            required
            type="number"
            min="1"
            value={draft.price}
            onChange={(event) =>
              setDraft({ ...draft, price: event.target.value })
            }
          />
        </label>
        <label>
          Коллекция
          <input
            required
            value={draft.collection}
            onChange={(event) =>
              setDraft({ ...draft, collection: event.target.value })
            }
          />
        </label>
        <label className="wide">
          Ссылка на обложку
          <input
            required
            type="url"
            value={draft.image}
            onChange={(event) =>
              setDraft({ ...draft, image: event.target.value })
            }
          />
        </label>
      </div>
      <div className="workshop-actions">
        <span>
          В составе: <b>{selected.length}</b> · Сумма весов:{" "}
          <b>{selected.reduce((sum, [, weight]) => sum + weight, 0)}</b>
        </span>
        <button
          type="button"
          className="login"
          onClick={() =>
            setWeights(
              Object.fromEntries(
                items
                  .slice(0, 12)
                  .map((item, index) => [
                    item.id,
                    Math.max(1, Math.round(500 / (index + 1))),
                  ]),
              ),
            )
          }
        >
          Быстрая основа
        </button>
        <button className="pig-button" disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить кейс →"}
        </button>
      </div>
      <div className="workshop-items">
        {items.map((item) => (
          <label
            className={`workshop-item ${weights[item.id] ? "picked" : ""}`}
            key={item.id}
          >
            <input
              type="checkbox"
              checked={!!weights[item.id]}
              onChange={(event) =>
                setWeight(
                  item.id,
                  event.target.checked
                    ? Math.max(weights[item.id] || 0, 10)
                    : 0,
                )
              }
            />
            <img
              src={item.image}
              alt=""
              onError={({ currentTarget }) => {
                currentTarget.onerror = null;
                currentTarget.src = "/skin-fallback.svg";
              }}
            />
            <span>
              <b>{item.name}</b>
              <small>
                {item.wear} · {coins(item.price)} SC
              </small>
            </span>
            <input
              aria-label={`Вес ${item.name}`}
              disabled={!weights[item.id]}
              type="number"
              min="1"
              value={weights[item.id] || ""}
              onChange={(event) =>
                setWeight(item.id, Math.max(1, Number(event.target.value)))
              }
            />
          </label>
        ))}
      </div>
    </form>
  );
}
