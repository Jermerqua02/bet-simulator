"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import BetModal from "./BetModal";
import type { Bet, LiveScoreData } from "@/lib/types";

interface TodaysBetsProps {
  bets: Bet[];
  liveScores: Map<string, LiveScoreData>;
  lastUpdated: Date | null;
}

function getSportColor(sport: string): string {
  switch (sport) {
    case "NBA":
      return "border-orange-500/30";
    case "MLB":
      return "border-red-500/30";
    case "NHL":
      return "border-blue-500/30";
    default:
      return "border-zinc-700";
  }
}

function getSportLabel(sport: string): { bg: string; text: string } {
  switch (sport) {
    case "NBA":
      return { bg: "bg-orange-500/15", text: "text-orange-400" };
    case "MLB":
      return { bg: "bg-red-500/15", text: "text-red-400" };
    case "NHL":
      return { bg: "bg-blue-500/15", text: "text-blue-400" };
    default:
      return { bg: "bg-zinc-700", text: "text-zinc-300" };
  }
}

function formatOdds(odds: number): string {
  return odds >= 0 ? `+${odds}` : `${odds}`;
}

/** Format a countdown string from an ISO start time */
function formatCountdown(startTime: string | undefined): string | null {
  if (!startTime) return null;
  const diff = new Date(startTime).getTime() - Date.now();
  if (diff <= 0) return null;

  const totalMin = Math.floor(diff / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

/** Get a status badge for the bet + game state */
function StatusBadge({
  bet,
  score,
}: {
  bet: Bet;
  score: LiveScoreData | undefined;
}) {
  const r = (bet.result ?? "").toUpperCase();

  if (r === "WIN") {
    return (
      <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-[10px]">
        WIN
      </Badge>
    );
  }
  if (r === "LOSS") {
    return (
      <Badge className="border-0 bg-rose-500/15 text-rose-400 text-[10px]">
        LOSS
      </Badge>
    );
  }
  if (r === "PUSH") {
    return (
      <Badge className="border-0 bg-zinc-500/15 text-zinc-300 text-[10px]">
        PUSH
      </Badge>
    );
  }

  if (score?.isLive) {
    return (
      <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-[10px] gap-1">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        LIVE
      </Badge>
    );
  }

  if (score?.isFinal) {
    return (
      <Badge className="border-0 bg-amber-500/15 text-amber-400 text-[10px]">
        FINAL
      </Badge>
    );
  }

  if (score?.isPreGame) {
    const countdown = formatCountdown(score.startTime);
    if (countdown) {
      return (
        <Badge className="border-0 bg-sky-500/20 text-sky-300 text-[11px] font-semibold gap-1.5 px-2 py-0.5">
          <svg
            className="h-3 w-3 text-sky-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {countdown}
        </Badge>
      );
    }
    return (
      <Badge className="border-0 bg-zinc-500/15 text-zinc-400 text-[10px]">
        PRE-GAME
      </Badge>
    );
  }

  return (
    <Badge className="border-0 bg-amber-500/15 text-amber-400 text-[10px]">
      PENDING
    </Badge>
  );
}

/** Render bet-specific live stats */
function BetContext({
  bet,
  score,
}: {
  bet: Bet;
  score: LiveScoreData | undefined;
}) {
  const betType = (bet.betType ?? "").toLowerCase();
  const hasScore = score && !score.isPreGame;
  const total = hasScore ? score.homeScore + score.awayScore : null;

  if (betType === "player_prop") {
    const side = bet.propSide ?? "over";
    const line = bet.line ?? 0;
    const propShort = (bet.propType ?? "").replace("Total ", "");
    return (
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
            PROP
          </span>
          <span className="text-xs text-zinc-300 font-medium">
            {bet.player}
          </span>
        </div>
        <div className="text-xs text-zinc-400">
          {side === "over" ? "Over" : "Under"} {line} {propShort}{" "}
          <span className="text-zinc-500">@ {formatOdds(bet.odds)}</span>
        </div>
        {hasScore && (
          <div className="text-[10px] text-zinc-500">
            Game: {score.awayTeam} {score.awayScore} - {score.homeTeam}{" "}
            {score.homeScore}
            {score.isLive && (
              <span className="ml-1 text-zinc-600">
                ({score.statusText})
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (betType === "spread") {
    // Parse spread from pick: "Team Name -2.5"
    const lastSpace = bet.pick.lastIndexOf(" ");
    const teamName = lastSpace > 0 ? bet.pick.slice(0, lastSpace) : bet.pick;
    const spreadLine =
      lastSpace > 0 ? parseFloat(bet.pick.slice(lastSpace + 1)) : NaN;

    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-zinc-300 font-medium">{bet.pick}</div>
        <div className="text-xs text-zinc-400">
          Spread{" "}
          <span className="text-zinc-500">@ {formatOdds(bet.odds)}</span>
        </div>
        {hasScore && !isNaN(spreadLine) && (
          <div className="text-[10px] text-zinc-500">
            {score.awayTeam} {score.awayScore} - {score.homeTeam}{" "}
            {score.homeScore}
            {(() => {
              const pickIsHome =
                teamName === bet.homeTeam ||
                bet.homeTeam.includes(teamName) ||
                teamName.includes(bet.homeTeam);
              const pickScore = pickIsHome
                ? score.homeScore
                : score.awayScore;
              const oppScore = pickIsHome
                ? score.awayScore
                : score.homeScore;
              const margin = pickScore - oppScore;
              const covering = margin + spreadLine > 0;
              return (
                <span
                  className={`ml-1.5 font-medium ${covering ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {covering ? "Covering" : "Not covering"} (margin{" "}
                  {margin > 0 ? "+" : ""}
                  {margin})
                </span>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  if (betType === "over" || betType === "under") {
    const parts = bet.pick.split(" ");
    const line = parseFloat(parts[parts.length - 1]);

    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-zinc-300 font-medium">{bet.pick}</div>
        <div className="text-xs text-zinc-400">
          Total{" "}
          <span className="text-zinc-500">@ {formatOdds(bet.odds)}</span>
        </div>
        {hasScore && !isNaN(line) && (
          <div className="text-[10px] text-zinc-500">
            {score.awayTeam} {score.awayScore} - {score.homeTeam}{" "}
            {score.homeScore}
            <span className="ml-1.5">
              Total: <span className="text-zinc-300 font-medium">{total}</span>
              {" / "}
              <span className="text-zinc-400">Line: {line}</span>
              {total !== null && (
                <span
                  className={`ml-1.5 font-medium ${
                    (betType === "over" && total > line) ||
                    (betType === "under" && total < line)
                      ? "text-emerald-400"
                      : total === line
                        ? "text-amber-400"
                        : "text-rose-400"
                  }`}
                >
                  {betType === "over"
                    ? total > line
                      ? "Over hit"
                      : `Need ${(line - total + 1).toFixed(1)} more`
                    : total < line
                      ? "Under holding"
                      : "Over the line"}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (betType.includes("parlay")) {
    return (
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
            PARLAY
          </span>
          <span className="text-xs text-zinc-400">
            {formatOdds(bet.odds)}
          </span>
        </div>
        <div className="text-xs text-zinc-300 font-medium truncate">
          {bet.pick}
        </div>
        {hasScore && (
          <div className="text-[10px] text-zinc-500">
            {score.awayTeam} {score.awayScore} - {score.homeTeam}{" "}
            {score.homeScore}
            {score.isLive && (
              <span className="ml-1 text-zinc-600">
                ({score.statusText})
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Moneyline / default
  return (
    <div className="mt-2 space-y-1">
      <div className="text-xs text-zinc-300 font-medium">{bet.pick}</div>
      <div className="text-xs text-zinc-400">
        Moneyline{" "}
        <span className="text-zinc-500">@ {formatOdds(bet.odds)}</span>
      </div>
      {hasScore && (
        <div className="text-[10px] text-zinc-500">
          {score.awayTeam} {score.awayScore} - {score.homeTeam}{" "}
          {score.homeScore}
          {score.isLive && (
            <span className="ml-1 text-zinc-600">
              ({score.statusText})
            </span>
          )}
          {(() => {
            const homeWinning = score.homeScore > score.awayScore;
            const pickIsHome =
              bet.pick === bet.homeTeam ||
              bet.homeTeam.includes(bet.pick) ||
              bet.pick.includes(bet.homeTeam);
            const pickIsAway =
              bet.pick === bet.awayTeam ||
              bet.awayTeam.includes(bet.pick) ||
              bet.pick.includes(bet.awayTeam);

            if (!pickIsHome && !pickIsAway) return null;
            const pickWinning = pickIsHome ? homeWinning : !homeWinning;
            const tied = score.homeScore === score.awayScore;

            if (tied) {
              return (
                <span className="ml-1.5 font-medium text-amber-400">
                  Tied
                </span>
              );
            }
            return (
              <span
                className={`ml-1.5 font-medium ${pickWinning ? "text-emerald-400" : "text-rose-400"}`}
              >
                {pickWinning ? "Winning" : "Losing"}
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/** Single bet card */
function BetCard({
  bet,
  score,
  onClick,
}: {
  bet: Bet;
  score: LiveScoreData | undefined;
  onClick: () => void;
}) {
  const sportColor = getSportColor(bet.sport);
  const sportLabel = getSportLabel(bet.sport);
  const r = (bet.result ?? "").toUpperCase();
  const isResolved = r === "WIN" || r === "LOSS" || r === "PUSH";

  // P&L display
  let pnlDisplay: string | null = null;
  let pnlColor = "text-zinc-500";
  if (isResolved && bet.pnl !== null && bet.pnl !== undefined) {
    const pnl = bet.pnl;
    pnlDisplay =
      (pnl >= 0 ? "+" : "-") +
      "$" +
      Math.abs(pnl).toFixed(2);
    pnlColor = pnl >= 0 ? "text-emerald-400" : "text-rose-400";
  }

  return (
    <div
      className={`rounded-lg border ${sportColor} bg-zinc-900/80 p-4 cursor-pointer transition-colors hover:bg-zinc-800/80 ${
        score?.isLive ? "ring-1 ring-emerald-500/20" : ""
      }`}
      onClick={onClick}
    >
      {/* Header: sport + status + P&L */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sportLabel.bg} ${sportLabel.text}`}
          >
            {bet.sport}
          </span>
          <StatusBadge bet={bet} score={score} />
        </div>
        {pnlDisplay && (
          <span className={`text-sm font-bold tabular-nums ${pnlColor}`}>
            {pnlDisplay}
          </span>
        )}
      </div>

      {/* Event name + start time */}
      <div className="text-sm text-zinc-300 font-medium mt-1">
        {bet.event}
      </div>
      {score?.isPreGame && score.startTime && (
        <div className="text-xs text-sky-400/70 font-medium mt-0.5">
          Starts{" "}
          {new Date(score.startTime).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      )}

      {/* Bet-specific context with live stats */}
      <BetContext bet={bet} score={score} />

      {/* Stake + edge footer */}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2">
        <span className="text-[10px] text-zinc-500">
          Stake: ${bet.stake.toFixed(2)}
        </span>
        <span className="text-[10px] text-zinc-500">
          Edge: {(bet.edge * 100).toFixed(1)}% &middot;{" "}
          {bet.strategy
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")}
        </span>
      </div>
    </div>
  );
}

export default function TodaysBets({
  bets,
  liveScores,
  lastUpdated,
}: TodaysBetsProps) {
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (bets.length === 0) {
    return null;
  }

  const hasLiveGames = bets.some((b) => liveScores.get(b.gameId)?.isLive);

  const secondsAgo = lastUpdated
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
    : null;

  // Count results
  const wins = bets.filter(
    (b) => (b.result ?? "").toUpperCase() === "WIN"
  ).length;
  const losses = bets.filter(
    (b) => (b.result ?? "").toUpperCase() === "LOSS"
  ).length;
  const pending = bets.length - wins - losses;

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">
            Today&apos;s Bets
          </h2>
          <span className="text-xs text-zinc-500">
            {bets.length} bets &middot; {wins}W {losses}L {pending > 0 ? `${pending} pending` : ""}
          </span>
          {hasLiveGames && (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-emerald-400">
                LIVE
              </span>
            </span>
          )}
        </div>
        {secondsAgo !== null && (
          <span className="text-xs text-zinc-500">
            Updated {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bets.map((bet) => (
          <BetCard
            key={bet.id}
            bet={bet}
            score={liveScores.get(bet.gameId)}
            onClick={() => {
              setSelectedBet(bet);
              setModalOpen(true);
            }}
          />
        ))}
      </div>

      <BetModal
        bet={selectedBet}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
