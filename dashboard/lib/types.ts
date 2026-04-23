export interface Bet {
  id: string;
  date: string;
  sport: "NBA" | "MLB" | "NHL";
  gameId: string;
  event: string;
  homeTeam: string;
  awayTeam: string;
  homeRecord?: string;
  awayRecord?: string;
  betType: string;
  pick: string;
  odds: number;
  impliedProb: number;
  trueProb: number;
  edge: number;
  ev: number;
  stake: number;
  payout?: number;
  strategy: string;
  result: string | null;
  pnl: number | null;
  notes: string;
  resolvedAt?: string | null;
}

export interface BetsData {
  bets: Bet[];
}

export interface BankrollEntry {
  date: string;
  bankroll: number;
  pnl: number;
  betsPlaced?: number;
  wins?: number;
  losses?: number;
  pending?: number;
}

export interface BankrollData {
  startingBankroll: number;
  currentBankroll: number;
  history: BankrollEntry[];
}

export interface StrategyConfig {
  enabled: boolean;
  weight: number;
}

export interface ConfigData {
  sports: string[];
  defaultStake: number;
  maxStakePercent: number;
  startingBankroll: number;
  strategies: Record<string, StrategyConfig>;
  minEdge: number;
  dailyBetTarget: number;
}

export interface StrategyStats {
  name: string;
  displayName: string;
  bets: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  pnl: number;
  roi: number;
  totalStaked: number;
}

export interface DashboardStats {
  totalBets: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  totalPnl: number;
  roi: number;
  daysActive: number;
  bestDayPnl: number;
  worstDayPnl: number;
  bestStrategy: string;
  bestSport: string;
  currentStreak: { type: "win" | "loss" | "none"; count: number };
  currentBankroll: number;
  startingBankroll: number;
  totalStaked: number;
}

export interface DashboardData {
  bets: BetsData;
  bankroll: BankrollData;
  config: ConfigData;
}

export interface LiveScoreData {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  statusText: string;
  isLive: boolean;
  isFinal: boolean;
  isPreGame: boolean;
}
