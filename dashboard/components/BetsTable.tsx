"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BetModal from "./BetModal";
import type { Bet, LiveScoreData } from "@/lib/types";
import { Filter } from "lucide-react";

interface BetsTableProps {
  bets: Bet[];
  liveScores?: Map<string, LiveScoreData>;
}

function formatOdds(odds: number): string {
  return odds >= 0 ? `+${odds}` : `${odds}`;
}

function formatCurrency(amount: number): string {
  const sign = amount >= 0 ? "" : "-";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatStrategyName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getSportBadgeColor(sport: string): string {
  switch (sport) {
    case "NBA":
      return "bg-orange-500/15 text-orange-400 border-0";
    case "MLB":
      return "bg-red-500/15 text-red-400 border-0";
    case "NHL":
      return "bg-blue-500/15 text-blue-400 border-0";
    default:
      return "bg-zinc-700 text-zinc-300 border-0";
  }
}

/** Determine if a pending bet won or lost from the final score */
function computeResultFromScore(
  bet: Bet,
  score: LiveScoreData
): "WIN" | "LOSS" | null {
  if (!score.isFinal) return null;

  const betType = (bet.betType ?? "").toLowerCase();

  if (betType === "moneyline" || betType === "") {
    const homeWon = score.homeScore > score.awayScore;
    // Match pick to home or away team
    const pickIsHome =
      bet.pick === bet.homeTeam ||
      bet.homeTeam.includes(bet.pick) ||
      bet.pick.includes(bet.homeTeam);
    const pickIsAway =
      bet.pick === bet.awayTeam ||
      bet.awayTeam.includes(bet.pick) ||
      bet.pick.includes(bet.awayTeam);
    if (!pickIsHome && !pickIsAway) return null;
    const won = pickIsHome ? homeWon : !homeWon;
    return won ? "WIN" : "LOSS";
  }

  if (betType === "spread") {
    // Pick format: "Team Name -2.5" or "Team Name +2.5"
    const lastSpace = bet.pick.lastIndexOf(" ");
    if (lastSpace === -1) return null;
    const teamName = bet.pick.slice(0, lastSpace);
    const spreadLine = parseFloat(bet.pick.slice(lastSpace + 1));
    if (isNaN(spreadLine)) return null;

    const pickMatchesHome =
      teamName === bet.homeTeam ||
      bet.homeTeam.includes(teamName) ||
      teamName.includes(bet.homeTeam);
    const pickMatchesAway =
      teamName === bet.awayTeam ||
      bet.awayTeam.includes(teamName) ||
      teamName.includes(bet.awayTeam);
    if (!pickMatchesHome && !pickMatchesAway) return null;

    const pickScore = pickMatchesHome ? score.homeScore : score.awayScore;
    const oppScore = pickMatchesHome ? score.awayScore : score.homeScore;
    const adjustedScore = pickScore + spreadLine;

    // Push (exact tie) = no result
    if (adjustedScore === oppScore) return null;
    return adjustedScore > oppScore ? "WIN" : "LOSS";
  }

  if (betType === "over" || betType === "under") {
    // Pick format: "Over 221.5" or "Under 7.5"
    const parts = bet.pick.split(" ");
    if (parts.length < 2) return null;
    const line = parseFloat(parts[parts.length - 1]);
    if (isNaN(line)) return null;

    const total = score.homeScore + score.awayScore;

    // Push (exact tie with line) = no result
    if (total === line) return null;

    if (betType === "over") {
      return total > line ? "WIN" : "LOSS";
    } else {
      return total < line ? "WIN" : "LOSS";
    }
  }

  return null;
}

function getResultBadge(
  bet: Bet,
  liveScore: LiveScoreData | undefined
) {
  const r = (bet.result ?? "").toUpperCase();

  // Already resolved — show WIN/LOSS
  if (r === "WIN") {
    return (
      <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-xs">
        WIN
      </Badge>
    );
  }
  if (r === "LOSS") {
    return (
      <Badge className="border-0 bg-rose-500/15 text-rose-400 text-xs">
        LOSS
      </Badge>
    );
  }

  // Pending — use live score context
  if (liveScore?.isLive) {
    return (
      <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-xs gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        LIVE
      </Badge>
    );
  }

  // Game is final — compute WIN/LOSS immediately from score
  if (liveScore?.isFinal) {
    const computed = computeResultFromScore(bet, liveScore);
    if (computed === "WIN") {
      return (
        <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-xs">
          WIN
        </Badge>
      );
    }
    if (computed === "LOSS") {
      return (
        <Badge className="border-0 bg-rose-500/15 text-rose-400 text-xs">
          LOSS
        </Badge>
      );
    }
    // Can't determine (e.g. parlay) — show FINAL
    return (
      <Badge className="border-0 bg-zinc-500/15 text-zinc-300 text-xs">
        FINAL
      </Badge>
    );
  }

  return (
    <Badge className="border-0 bg-amber-500/15 text-amber-400 text-xs">
      PENDING
    </Badge>
  );
}

function LiveScoreInline({ score }: { score: LiveScoreData }) {
  const homeWinning = score.homeScore > score.awayScore;
  const awayWinning = score.awayScore > score.homeScore;

  return (
    <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-400">
      <span className={awayWinning ? "text-emerald-400 font-semibold" : ""}>
        {score.awayScore}
      </span>
      <span className="text-zinc-600">-</span>
      <span className={homeWinning ? "text-emerald-400 font-semibold" : ""}>
        {score.homeScore}
      </span>
      {score.isLive && (
        <span className="text-[10px] text-zinc-500 ml-1">
          {score.statusText}
        </span>
      )}
    </span>
  );
}

export default function BetsTable({ bets, liveScores }: BetsTableProps) {
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");
  const [resultFilter, setResultFilter] = useState<string>("all");

  const sports = useMemo(
    () => Array.from(new Set(bets.map((b) => b.sport))).sort(),
    [bets]
  );
  const strategies = useMemo(
    () => Array.from(new Set(bets.map((b) => b.strategy))).sort(),
    [bets]
  );

  const filteredBets = useMemo(() => {
    let filtered = [...bets];

    if (sportFilter !== "all") {
      filtered = filtered.filter((b) => b.sport === sportFilter);
    }
    if (strategyFilter !== "all") {
      filtered = filtered.filter((b) => b.strategy === strategyFilter);
    }
    if (resultFilter !== "all") {
      if (resultFilter === "pending") {
        filtered = filtered.filter(
          (b) => (b.result ?? "").toUpperCase() === "PENDING" || b.result === null
        );
      } else if (resultFilter === "live") {
        filtered = filtered.filter((b) => {
          const score = liveScores?.get(b.gameId);
          return ((b.result ?? "").toUpperCase() === "PENDING" || b.result === null) && score?.isLive;
        });
      } else {
        filtered = filtered.filter((b) => b.result === resultFilter);
      }
    }

    // Sort by date descending
    filtered.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return filtered;
  }, [bets, sportFilter, strategyFilter, resultFilter, liveScores]);

  const handleRowClick = (bet: Bet) => {
    setSelectedBet(bet);
    setModalOpen(true);
  };

  // Count live games for the filter label
  const liveCount = liveScores
    ? bets.filter((b) => {
        const score = liveScores.get(b.gameId);
        return ((b.result ?? "").toUpperCase() === "PENDING" || b.result === null) && score?.isLive;
      }).length
    : 0;

  if (bets.length === 0) {
    return (
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">All Bets</h2>
        <p className="text-zinc-500">
          No bets placed yet. The agent will start placing bets soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          All Bets{" "}
          <span className="text-sm font-normal text-zinc-500">
            ({filteredBets.length}
            {filteredBets.length !== bets.length
              ? ` of ${bets.length}`
              : ""})
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <Select value={sportFilter} onValueChange={(v) => setSportFilter(v ?? "all")}>
            <SelectTrigger className="h-8 w-28 border-zinc-700 bg-zinc-800 text-xs text-zinc-300">
              <SelectValue placeholder="Sport" />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-800 text-zinc-300">
              <SelectItem value="all">All Sports</SelectItem>
              {sports.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={strategyFilter} onValueChange={(v) => setStrategyFilter(v ?? "all")}>
            <SelectTrigger className="h-8 w-36 border-zinc-700 bg-zinc-800 text-xs text-zinc-300">
              <SelectValue placeholder="Strategy" />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-800 text-zinc-300">
              <SelectItem value="all">All Strategies</SelectItem>
              {strategies.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatStrategyName(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={resultFilter} onValueChange={(v) => setResultFilter(v ?? "all")}>
            <SelectTrigger className="h-8 w-28 border-zinc-700 bg-zinc-800 text-xs text-zinc-300">
              <SelectValue placeholder="Result" />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-800 text-zinc-300">
              <SelectItem value="all">All Results</SelectItem>
              <SelectItem value="win">Win</SelectItem>
              <SelectItem value="loss">Loss</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              {liveCount > 0 && (
                <SelectItem value="live">
                  Live ({liveCount})
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Date</TableHead>
              <TableHead className="text-zinc-400">Sport</TableHead>
              <TableHead className="text-zinc-400 min-w-[180px]">
                Event
              </TableHead>
              <TableHead className="text-zinc-400">Pick</TableHead>
              <TableHead className="text-right text-zinc-400">Odds</TableHead>
              <TableHead className="text-right text-zinc-400">Stake</TableHead>
              <TableHead className="text-zinc-400">Strategy</TableHead>
              <TableHead className="text-right text-zinc-400">Edge</TableHead>
              <TableHead className="text-center text-zinc-400">
                Result
              </TableHead>
              <TableHead className="text-right text-zinc-400">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBets.map((bet) => {
              const liveScore = liveScores?.get(bet.gameId);
              const showInlineScore =
                liveScore &&
                (liveScore.isLive || liveScore.isFinal) &&
                ((bet.result ?? "").toUpperCase() === "PENDING" || bet.result === null);

              return (
                <TableRow
                  key={bet.id}
                  className={`cursor-pointer border-zinc-800 transition-colors hover:bg-zinc-800/60 ${
                    liveScore?.isLive && ((bet.result ?? "").toUpperCase() === "PENDING" || bet.result === null)
                      ? "bg-emerald-500/[0.03]"
                      : ""
                  }`}
                  onClick={() => handleRowClick(bet)}
                >
                  <TableCell className="text-sm text-zinc-400 whitespace-nowrap">
                    {formatDate(bet.date)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-xs ${getSportBadgeColor(bet.sport)}`}
                    >
                      {bet.sport}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-300 max-w-[220px]">
                    <div className="flex items-center">
                      <span className="truncate">{bet.event}</span>
                      {showInlineScore && (
                        <LiveScoreInline score={liveScore} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-zinc-200 whitespace-nowrap">
                    {bet.pick}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-zinc-300">
                    {formatOdds(bet.odds)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-zinc-300">
                    {formatCurrency(bet.stake)}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-400 whitespace-nowrap">
                    {formatStrategyName(bet.strategy)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-emerald-400">
                    {(bet.edge * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">
                    {getResultBadge(bet, liveScore)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums text-sm font-medium ${(() => {
                      let pnl = bet.pnl;
                      // Compute P&L inline for final games not yet resolved in data
                      if ((pnl === null || pnl === undefined || pnl === 0) && liveScore?.isFinal) {
                        const computed = computeResultFromScore(bet, liveScore);
                        if (computed === "WIN") {
                          pnl = bet.payout ? bet.payout - bet.stake : bet.odds > 0 ? bet.stake * (bet.odds / 100) : bet.stake * (100 / Math.abs(bet.odds));
                        } else if (computed === "LOSS") {
                          pnl = -bet.stake;
                        }
                      }
                      if (pnl === null || pnl === undefined) return "text-zinc-500";
                      return pnl >= 0 ? "text-emerald-400" : "text-rose-400";
                    })()}`}
                  >
                    {(() => {
                      let pnl = bet.pnl;
                      if ((pnl === null || pnl === undefined || pnl === 0) && liveScore?.isFinal) {
                        const computed = computeResultFromScore(bet, liveScore);
                        if (computed === "WIN") {
                          pnl = bet.payout ? bet.payout - bet.stake : bet.odds > 0 ? bet.stake * (bet.odds / 100) : bet.stake * (100 / Math.abs(bet.odds));
                          pnl = Math.round(pnl * 100) / 100;
                        } else if (computed === "LOSS") {
                          pnl = -bet.stake;
                        }
                      }
                      return pnl !== null && pnl !== undefined
                        ? formatCurrency(pnl)
                        : "--";
                    })()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <BetModal
        bet={selectedBet}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
