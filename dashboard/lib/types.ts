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
  impliedProbability: number;
  trueProbability: number;
  edge: number;
  expectedValue: number;
  stake: number;
  strategy: string;
  result: "win" | "loss" | "pending" | null;
  pnl: number | null;
  notes: string;
}

export interface BetsData {
  bets: Bet[];
}

export interface BankrollEntry {
  date: string;
  bankroll: number;
  dailyPnl: number;
  betsPlaced?: number;
  wins?: number;
  losses?: number;
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
  /** e.g. "Q3 8:42", "Top 5th", "2nd Period 12:30", "Pre-game 7:10 PM ET", "Final" */
  statusText: string;
  /** Whether the game is currently in progress */
  isLive: boolean;
  /** Whether the game has finished */
  isFinal: boolean;
  /** Whether the game hasn't started yet */
  isPreGame: boolean;
}
