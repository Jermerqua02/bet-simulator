import fs from "fs";
import path from "path";
import type {
  BetsData,
  BankrollData,
  ConfigData,
  Bet,
  DashboardStats,
  StrategyStats,
} from "./types";

function getDataDir(): string {
  // Build step copies ../data into ./data
  // Check multiple possible locations for the data directory
  const candidates = [
    path.join(process.cwd(), "data"),
    path.join(process.cwd(), "..", "data"),
    path.join(__dirname, "..", "data"),
    path.join(__dirname, "..", "..", "data"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "bets.json"))) return dir;
    } catch {
      continue;
    }
  }
  // Default fallback
  return path.join(process.cwd(), "data");
}

function readJsonFile<T>(filename: string): T {
  const filePath = path.join(getDataDir(), filename);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    // Return empty defaults if file not found
    if (filename === "bets.json") return { bets: [] } as T;
    if (filename === "bankroll.json")
      return { startingBankroll: 10000, currentBankroll: 10000, history: [] } as T;
    if (filename === "config.json")
      return { sports: [], defaultStake: 25, maxStakePercent: 0.05, startingBankroll: 10000, strategies: {}, minEdge: 0.03, dailyBetTarget: 8 } as T;
    return {} as T;
  }
}

export function getBetsData(): BetsData {
  return readJsonFile<BetsData>("bets.json");
}

export function getBankrollData(): BankrollData {
  return readJsonFile<BankrollData>("bankroll.json");
}

export function getConfigData(): ConfigData {
  return readJsonFile<ConfigData>("config.json");
}

export function formatStrategyName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatOdds(odds: number): string {
  if (odds >= 0) return `+${odds}`;
  return `${odds}`;
}

export function formatCurrency(amount: number): string {
  const sign = amount >= 0 ? "" : "-";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function calculateStats(
  bets: Bet[],
  bankroll: BankrollData
): DashboardStats {
  const settledBets = bets.filter(
    (b) => b.result === "win" || b.result === "loss"
  );
  const wins = settledBets.filter((b) => b.result === "win").length;
  const losses = settledBets.filter((b) => b.result === "loss").length;
  const pending = bets.filter(
    (b) => b.result === "pending" || b.result === null
  ).length;
  const winRate = settledBets.length > 0 ? (wins / settledBets.length) * 100 : 0;

  const totalPnl = settledBets.reduce((sum, b) => sum + (b.pnl ?? 0), 0);
  const totalStaked = settledBets.reduce((sum, b) => sum + b.stake, 0);
  const roi = totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0;

  const uniqueDates = new Set(bets.map((b) => b.date));
  const daysActive = uniqueDates.size;

  // Best/worst day from bankroll history
  let bestDayPnl = 0;
  let worstDayPnl = 0;
  if (bankroll.history.length > 0) {
    bestDayPnl = Math.max(...bankroll.history.map((h) => h.dailyPnl));
    worstDayPnl = Math.min(...bankroll.history.map((h) => h.dailyPnl));
  }

  // Best strategy by ROI
  const strategyMap = getStrategyStats(bets);
  const profitableStrategies = strategyMap.filter((s) => s.bets > 0);
  const bestStrategy =
    profitableStrategies.length > 0
      ? profitableStrategies.sort((a, b) => b.roi - a.roi)[0].displayName
      : "N/A";

  // Best sport by ROI
  const sportStats = getSportStats(bets);
  const bestSportEntry = Object.entries(sportStats).sort(
    ([, a], [, b]) => b.roi - a.roi
  )[0];
  const bestSport = bestSportEntry ? bestSportEntry[0] : "N/A";

  // Current streak
  const sortedSettled = [...settledBets].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  let currentStreak: { type: "win" | "loss" | "none"; count: number } = {
    type: "none",
    count: 0,
  };
  if (sortedSettled.length > 0) {
    const streakType = sortedSettled[0].result as "win" | "loss";
    let count = 0;
    for (const bet of sortedSettled) {
      if (bet.result === streakType) count++;
      else break;
    }
    currentStreak = { type: streakType, count };
  }

  return {
    totalBets: bets.length,
    wins,
    losses,
    pending,
    winRate,
    totalPnl,
    roi,
    daysActive,
    bestDayPnl,
    worstDayPnl,
    bestStrategy,
    bestSport,
    currentStreak,
    currentBankroll: bankroll.currentBankroll,
    startingBankroll: bankroll.startingBankroll,
    totalStaked,
  };
}

export function getStrategyStats(bets: Bet[]): StrategyStats[] {
  const map: Record<string, StrategyStats> = {};

  for (const bet of bets) {
    const key = bet.strategy;
    if (!map[key]) {
      map[key] = {
        name: key,
        displayName: formatStrategyName(key),
        bets: 0,
        wins: 0,
        losses: 0,
        pending: 0,
        winRate: 0,
        pnl: 0,
        roi: 0,
        totalStaked: 0,
      };
    }
    map[key].bets++;
    if (bet.result === "win") {
      map[key].wins++;
      map[key].pnl += bet.pnl ?? 0;
      map[key].totalStaked += bet.stake;
    } else if (bet.result === "loss") {
      map[key].losses++;
      map[key].pnl += bet.pnl ?? 0;
      map[key].totalStaked += bet.stake;
    } else {
      map[key].pending++;
    }
  }

  return Object.values(map).map((s) => {
    const settled = s.wins + s.losses;
    s.winRate = settled > 0 ? (s.wins / settled) * 100 : 0;
    s.roi = s.totalStaked > 0 ? (s.pnl / s.totalStaked) * 100 : 0;
    return s;
  });
}

function getSportStats(
  bets: Bet[]
): Record<string, { pnl: number; totalStaked: number; roi: number }> {
  const map: Record<string, { pnl: number; totalStaked: number; roi: number }> =
    {};

  for (const bet of bets) {
    const key = bet.sport;
    if (!map[key]) {
      map[key] = { pnl: 0, totalStaked: 0, roi: 0 };
    }
    if (bet.result === "win" || bet.result === "loss") {
      map[key].pnl += bet.pnl ?? 0;
      map[key].totalStaked += bet.stake;
    }
  }

  for (const key of Object.keys(map)) {
    map[key].roi =
      map[key].totalStaked > 0
        ? (map[key].pnl / map[key].totalStaked) * 100
        : 0;
  }

  return map;
}
