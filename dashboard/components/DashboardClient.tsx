"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import StatsRow from "@/components/StatsRow";
import BankrollChart from "@/components/BankrollChart";
import StrategyTable from "@/components/StrategyTable";
import BetsTable from "@/components/BetsTable";
import AllBetsLog from "@/components/AllBetsLog";
import LiveScores from "@/components/LiveScores";
import { calculateStats, getStrategyStats } from "@/lib/data";
import type {
  Bet,
  BankrollData,
  ConfigData,
  DashboardStats,
  StrategyStats as StrategyStatsType,
  LiveScoreData,
} from "@/lib/types";

/** ESPN scoreboard URL builder */
const ESPN_SPORT_MAP: Record<string, { sport: string; league: string }> = {
  NBA: { sport: "basketball", league: "nba" },
  MLB: { sport: "baseball", league: "mlb" },
  NHL: { sport: "hockey", league: "nhl" },
};

function buildEspnUrl(sport: string, league: string, dateStr: string): string {
  const yyyymmdd = dateStr.replace(/-/g, "");
  return `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${yyyymmdd}`;
}

/** Parse an ESPN competition into our LiveScoreData shape */
function parseEspnEvent(
  event: EspnEvent
): LiveScoreData | null {
  const competition = event.competitions?.[0];
  if (!competition) return null;

  const homeComp = competition.competitors?.find(
    (c: EspnCompetitor) => c.homeAway === "home"
  );
  const awayComp = competition.competitors?.find(
    (c: EspnCompetitor) => c.homeAway === "away"
  );
  if (!homeComp || !awayComp) return null;

  const status = event.status;
  const stateStr = status?.type?.state ?? "pre"; // "pre", "in", "post"
  const statusDetail = status?.type?.shortDetail ?? status?.type?.detail ?? "";

  return {
    gameId: event.id,
    homeTeam: homeComp.team?.displayName ?? homeComp.team?.shortDisplayName ?? "Home",
    awayTeam: awayComp.team?.displayName ?? awayComp.team?.shortDisplayName ?? "Away",
    homeScore: parseInt(homeComp.score ?? "0", 10),
    awayScore: parseInt(awayComp.score ?? "0", 10),
    statusText: statusDetail,
    isLive: stateStr === "in",
    isFinal: stateStr === "post",
    isPreGame: stateStr === "pre",
  };
}

// ESPN API response types (partial, only what we need)
interface EspnCompetitor {
  homeAway: string;
  score?: string;
  team?: {
    displayName?: string;
    shortDisplayName?: string;
  };
}

interface EspnEvent {
  id: string;
  competitions?: Array<{
    competitors?: EspnCompetitor[];
  }>;
  status?: {
    type?: {
      state?: string;
      detail?: string;
      shortDetail?: string;
    };
  };
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

interface DashboardClientProps {
  initialBets: Bet[];
  initialBankroll: BankrollData;
  initialConfig: ConfigData;
}

export default function DashboardClient({
  initialBets,
  initialBankroll,
  initialConfig,
}: DashboardClientProps) {
  const [bets, setBets] = useState<Bet[]>(initialBets);
  const [bankroll, setBankroll] = useState<BankrollData>(initialBankroll);
  const [config, setConfig] = useState<ConfigData>(initialConfig);
  const [liveScores, setLiveScores] = useState<Map<string, LiveScoreData>>(
    new Map()
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Force re-render for the "seconds ago" display
  const [, setTick] = useState(0);
  const espnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pendingBets = bets.filter(
    (b) => (b.result ?? "").toUpperCase() === "PENDING" || b.result === null
  );

  /** Auto-resolve pending moneyline bets when ESPN shows game as FINAL */
  useEffect(() => {
    if (liveScores.size === 0) return;

    const updates: Array<{ id: string; result: string; pnl: number }> = [];

    for (const bet of bets) {
      const r = (bet.result ?? "").toUpperCase();
      if (r === "WIN" || r === "LOSS") continue;
      // Only auto-resolve simple moneyline bets (parlays need all legs)
      if (bet.betType !== "moneyline") continue;

      const score = liveScores.get(bet.gameId);
      if (!score?.isFinal) continue;

      // Determine winner from final score
      const homeWon = score.homeScore > score.awayScore;
      const pickIsHome = bet.pick === bet.homeTeam;
      const pickIsAway = bet.pick === bet.awayTeam;

      // Fuzzy fallback if exact match fails
      const pickMatchesHome =
        pickIsHome ||
        bet.homeTeam.includes(bet.pick) ||
        bet.pick.includes(bet.homeTeam);
      const pickMatchesAway =
        pickIsAway ||
        bet.awayTeam.includes(bet.pick) ||
        bet.pick.includes(bet.awayTeam);

      if (!pickMatchesHome && !pickMatchesAway) continue;

      const won = pickMatchesHome ? homeWon : !homeWon;

      let pnl: number;
      if (won) {
        if (bet.payout) {
          pnl = bet.payout - bet.stake;
        } else if (bet.odds > 0) {
          pnl = bet.stake * (bet.odds / 100);
        } else {
          pnl = bet.stake * (100 / Math.abs(bet.odds));
        }
      } else {
        pnl = -bet.stake;
      }

      updates.push({
        id: bet.id,
        result: won ? "WIN" : "LOSS",
        pnl: Math.round(pnl * 100) / 100,
      });
    }

    if (updates.length > 0) {
      setBets((prev) =>
        prev.map((bet) => {
          const update = updates.find((u) => u.id === bet.id);
          if (!update) return bet;
          return {
            ...bet,
            result: update.result,
            pnl: update.pnl,
            resolvedAt: new Date().toISOString(),
          };
        })
      );

      const totalPnl = updates.reduce((sum, u) => sum + u.pnl, 0);
      setBankroll((prev) => ({
        ...prev,
        currentBankroll: prev.currentBankroll + totalPnl,
      }));
    }
  }, [liveScores, bets]);

  const stats: DashboardStats = calculateStats(bets, bankroll);
  const strategyStats: StrategyStatsType[] = getStrategyStats(bets);

  /** Fetch live scores from ESPN for all pending bets */
  const fetchLiveScores = useCallback(async () => {
    if (pendingBets.length === 0) return;

    // Group pending bets by sport + date to minimize API calls
    const fetchGroups = new Map<
      string,
      { sport: string; league: string; date: string; gameIds: Set<string> }
    >();

    for (const bet of pendingBets) {
      const espnMap = ESPN_SPORT_MAP[bet.sport];
      if (!espnMap) continue;

      const key = `${bet.sport}_${bet.date}`;
      if (!fetchGroups.has(key)) {
        fetchGroups.set(key, {
          sport: espnMap.sport,
          league: espnMap.league,
          date: bet.date,
          gameIds: new Set(),
        });
      }
      fetchGroups.get(key)!.gameIds.add(bet.gameId);
    }

    const newScores = new Map<string, LiveScoreData>();

    const fetchPromises = Array.from(fetchGroups.values()).map(
      async (group) => {
        try {
          const url = buildEspnUrl(group.sport, group.league, group.date);
          const res = await fetch(url);
          if (!res.ok) return;

          const data: EspnScoreboardResponse = await res.json();
          if (!data.events) return;

          for (const event of data.events) {
            if (group.gameIds.has(event.id)) {
              const parsed = parseEspnEvent(event);
              if (parsed) {
                newScores.set(event.id, parsed);
              }
            }
          }
        } catch (error) {
          console.error(
            `Error fetching ESPN scores for ${group.league}:`,
            error
          );
        }
      }
    );

    await Promise.all(fetchPromises);

    if (newScores.size > 0) {
      setLiveScores((prev) => {
        const merged = new Map(prev);
        newScores.forEach((v, k) => merged.set(k, v));
        return merged;
      });
      setLastUpdated(new Date());
    }
  }, [pendingBets]);

  /** Refresh bet/bankroll data from our API */
  const refreshData = useCallback(async () => {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      if (data.bets?.bets) setBets(data.bets.bets);
      if (data.bankroll) setBankroll(data.bankroll);
      if (data.config) setConfig(data.config);
    } catch (error) {
      console.error("Error refreshing dashboard data:", error);
    }
  }, []);

  // Set up polling
  useEffect(() => {
    // Fetch live scores immediately on mount
    fetchLiveScores();

    // Poll ESPN every 30 seconds
    espnTimerRef.current = setInterval(fetchLiveScores, 30_000);

    // Poll our API for bet data every 60 seconds
    dataTimerRef.current = setInterval(refreshData, 60_000);

    // Tick every 5 seconds to update the "last updated" display
    tickTimerRef.current = setInterval(() => setTick((t) => t + 1), 5_000);

    return () => {
      if (espnTimerRef.current) clearInterval(espnTimerRef.current);
      if (dataTimerRef.current) clearInterval(dataTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, [fetchLiveScores, refreshData]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Header stats={stats} />

      {/* Global LIVE indicator when there are active games */}
      {pendingBets.some((b) => liveScores.get(b.gameId)?.isLive) && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm font-medium text-emerald-400">
            Games in progress &mdash; scores updating live
          </span>
        </div>
      )}

      <StatsRow stats={stats} />

      {/* Live Scores section (only shows when there are pending bets) */}
      <LiveScores
        bets={pendingBets}
        liveScores={liveScores}
        lastUpdated={lastUpdated}
      />

      <BankrollChart
        history={bankroll.history}
        startingBankroll={bankroll.startingBankroll}
      />
      <StrategyTable strategies={strategyStats} />
      <BetsTable bets={bets} liveScores={liveScores} />
      <AllBetsLog bets={bets} />

      {/* Footer */}
      <footer className="mt-8 border-t border-zinc-800 pt-6 text-center">
        <p className="text-xs text-zinc-600">
          Bet Simulator &mdash; All bets are simulated. No real money is
          wagered.
        </p>
        <p className="mt-1 text-xs text-zinc-700">
          Starting bankroll: ${config.startingBankroll.toLocaleString()} |
          Daily target: {config.dailyBetTarget} bets | Min edge:{" "}
          {(config.minEdge * 100).toFixed(0)}%
        </p>
      </footer>
    </main>
  );
}
