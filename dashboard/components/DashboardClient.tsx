"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import StatsRow from "@/components/StatsRow";
import BankrollChart from "@/components/BankrollChart";
import StrategyTable from "@/components/StrategyTable";
import BetsTable from "@/components/BetsTable";
import TodaysBets from "@/components/TodaysBets";
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

  const startTime = competition.date ?? event.date;

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
    startTime,
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
  date?: string;
  competitions?: Array<{
    date?: string;
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

/** Map prop types to ESPN box score stat labels, per sport */
const PROP_STAT_LABELS: Record<string, Record<string, string>> = {
  NBA: {
    "Total Points": "PTS",
    "Total Rebounds": "REB",
    "Total Assists": "AST",
    "Total 3-Point Field Goals Made": "3PT",
    "Total Steals": "STL",
    "Total Blocks": "BLK",
    "Total Turnovers": "TO",
  },
  NHL: {
    "Total Goals": "G",
    "Total Assists": "A",
    "Total Shots on Goal": "S",
  },
  MLB: {
    "Total Hits": "H",
    "Total Runs Batted In": "RBI",
    "Total Bases": "TB",
    "Total Strikeouts": "K",
  },
};

/** Parse a box score stat value (handles "3-7" made-attempted format) */
function parseStatValue(raw: string): number {
  if (/^\d+-\d+$/.test(raw)) {
    return parseInt(raw.split("-")[0], 10) || 0;
  }
  return parseFloat(raw) || 0;
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
  // Live player stats from ESPN box scores (key: "playerId_propType" → stat value)
  const [playerStats, setPlayerStats] = useState<Map<string, number>>(
    new Map()
  );
  // Force re-render for the "seconds ago" display
  const [, setTick] = useState(0);
  const espnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boxScoreTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pendingBets = bets.filter(
    (b) => (b.result ?? "").toUpperCase() === "PENDING" || b.result === null
  );

  // Today's bets sorted by game start time (chronological).
  // Group by gameId so all bets on the same game stay together.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todaysBets = (() => {
    const filtered = bets.filter((b) => b.date === todayStr);

    // Build a start-time lookup per gameId
    const gameStartTime = new Map<string, number>();
    for (const bet of filtered) {
      if (!gameStartTime.has(bet.gameId)) {
        const s = liveScores.get(bet.gameId);
        gameStartTime.set(
          bet.gameId,
          s?.startTime ? new Date(s.startTime).getTime() : Infinity
        );
      }
    }

    return filtered.sort((a, b) => {
      const ta = gameStartTime.get(a.gameId) ?? Infinity;
      const tb = gameStartTime.get(b.gameId) ?? Infinity;
      if (ta !== tb) return ta - tb;
      // Same game — keep together, sort by gameId then bet id
      if (a.gameId !== b.gameId) return a.gameId.localeCompare(b.gameId);
      return a.id.localeCompare(b.id);
    });
  })();

  /** Auto-resolve pending bets when ESPN shows game as FINAL */
  useEffect(() => {
    if (liveScores.size === 0) return;

    const updates: Array<{ id: string; result: string; pnl: number }> = [];

    for (const bet of bets) {
      const r = (bet.result ?? "").toUpperCase();
      if (r === "WIN" || r === "LOSS") continue;

      const betType = (bet.betType ?? "").toLowerCase();
      // Only auto-resolve known bet types from game score.
      // "player_prop" is excluded here — props require box score data
      // and are resolved server-side by the Python agent.
      if (!["moneyline", "spread", "over", "under"].includes(betType)) continue;

      const score = liveScores.get(bet.gameId);
      if (!score?.isFinal) continue;

      let won: boolean | null = null;

      if (betType === "moneyline") {
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
        won = pickMatchesHome ? homeWon : !homeWon;
      } else if (betType === "spread") {
        // Pick format: "Team Name -2.5" or "Team Name +2.5"
        // Split on the last space to separate team name from spread line
        const lastSpace = bet.pick.lastIndexOf(" ");
        if (lastSpace === -1) continue;
        const teamName = bet.pick.slice(0, lastSpace);
        const spreadLine = parseFloat(bet.pick.slice(lastSpace + 1));
        if (isNaN(spreadLine)) continue;

        // Determine if picked team is home or away
        const pickMatchesHome =
          teamName === bet.homeTeam ||
          bet.homeTeam.includes(teamName) ||
          teamName.includes(bet.homeTeam);
        const pickMatchesAway =
          teamName === bet.awayTeam ||
          bet.awayTeam.includes(teamName) ||
          teamName.includes(bet.awayTeam);
        if (!pickMatchesHome && !pickMatchesAway) continue;

        const pickScore = pickMatchesHome ? score.homeScore : score.awayScore;
        const oppScore = pickMatchesHome ? score.awayScore : score.homeScore;
        const adjustedScore = pickScore + spreadLine;

        // Push (exact tie) = no action
        if (adjustedScore === oppScore) continue;
        won = adjustedScore > oppScore;
      } else if (betType === "over" || betType === "under") {
        // Pick format: "Over 221.5" or "Under 7.5"
        const parts = bet.pick.split(" ");
        if (parts.length < 2) continue;
        const line = parseFloat(parts[parts.length - 1]);
        if (isNaN(line)) continue;

        const total = score.homeScore + score.awayScore;

        // Push (exact tie with line) = no action
        if (total === line) continue;

        if (betType === "over") {
          won = total > line;
        } else {
          won = total < line;
        }
      }

      if (won === null) continue;

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

  /** Fetch live scores from ESPN for all of today's bets */
  const fetchLiveScores = useCallback(async () => {
    if (todaysBets.length === 0) return;

    // Group today's bets by sport + date to minimize API calls
    const fetchGroups = new Map<
      string,
      { sport: string; league: string; date: string; gameIds: Set<string> }
    >();

    for (const bet of todaysBets) {
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
  }, [todaysBets]);

  /** Fetch ESPN box scores for player prop bets to get live stat lines */
  const fetchBoxScores = useCallback(async () => {
    const propBets = todaysBets.filter(
      (b) =>
        (b.betType ?? "").toLowerCase() === "player_prop" &&
        b.playerId &&
        b.propType
    );
    if (propBets.length === 0) return;

    // Group by gameId
    const gameProps = new Map<string, Bet[]>();
    for (const bet of propBets) {
      if (!gameProps.has(bet.gameId)) gameProps.set(bet.gameId, []);
      gameProps.get(bet.gameId)!.push(bet);
    }

    const newStats = new Map<string, number>();

    await Promise.all(
      Array.from(gameProps.entries()).map(async ([gameId, betsForGame]) => {
        const sport = betsForGame[0].sport;
        const espn = ESPN_SPORT_MAP[sport];
        if (!espn) return;

        try {
          const res = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/${espn.sport}/${espn.league}/summary?event=${gameId}`
          );
          if (!res.ok) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = await res.json();

          const teams = data.boxscore?.players ?? [];
          for (const team of teams) {
            for (const statGroup of team.statistics ?? []) {
              const labels: string[] = statGroup.labels ?? [];
              for (const ath of statGroup.athletes ?? []) {
                const id = ath.athlete?.id;
                if (!id) continue;

                const matching = betsForGame.filter(
                  (b) => b.playerId === id
                );
                if (matching.length === 0) continue;

                const stats: string[] = ath.stats ?? [];
                for (const bet of matching) {
                  const label =
                    PROP_STAT_LABELS[sport]?.[bet.propType!];
                  if (!label) continue;
                  const idx = labels.indexOf(label);
                  if (idx === -1 || idx >= stats.length) continue;
                  newStats.set(
                    `${id}_${bet.propType}`,
                    parseStatValue(stats[idx])
                  );
                }
              }
            }
          }
        } catch (err) {
          console.error(
            `Error fetching box score for game ${gameId}:`,
            err
          );
        }
      })
    );

    if (newStats.size > 0) {
      setPlayerStats((prev) => {
        const merged = new Map(prev);
        newStats.forEach((v, k) => merged.set(k, v));
        return merged;
      });
    }
  }, [todaysBets]);

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
    // Fetch box scores for player props (slight delay to let scores load first)
    const boxScoreInit = setTimeout(fetchBoxScores, 2_000);

    // Poll ESPN every 30 seconds
    espnTimerRef.current = setInterval(fetchLiveScores, 30_000);

    // Poll box scores every 30 seconds (offset by 5s from scoreboard)
    boxScoreTimerRef.current = setInterval(fetchBoxScores, 30_000);

    // Poll our API for bet data every 60 seconds
    dataTimerRef.current = setInterval(refreshData, 60_000);

    // Tick every 5 seconds to update the "last updated" display
    tickTimerRef.current = setInterval(() => setTick((t) => t + 1), 5_000);

    return () => {
      clearTimeout(boxScoreInit);
      if (espnTimerRef.current) clearInterval(espnTimerRef.current);
      if (boxScoreTimerRef.current) clearInterval(boxScoreTimerRef.current);
      if (dataTimerRef.current) clearInterval(dataTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, [fetchLiveScores, fetchBoxScores, refreshData]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Header stats={stats} />

      <StatsRow stats={stats} />

      {/* Today's Bets — all bets placed today with live stats */}
      <TodaysBets
        bets={todaysBets}
        liveScores={liveScores}
        lastUpdated={lastUpdated}
        playerStats={playerStats}
      />

      <BankrollChart
        history={bankroll.history}
        startingBankroll={bankroll.startingBankroll}
      />
      <StrategyTable strategies={strategyStats} />
      <BetsTable bets={bets} liveScores={liveScores} />

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
