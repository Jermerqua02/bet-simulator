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
      <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-xs px-2 py-0.5">
        WIN
      </Badge>
    );
  }
  if (r === "LOSS") {
    return (
      <Badge className="border-0 bg-rose-500/15 text-rose-400 text-xs px-2 py-0.5">
        LOSS
      </Badge>
    );
  }
  if (r === "PUSH") {
    return (
      <Badge className="border-0 bg-zinc-500/15 text-zinc-300 text-xs px-2 py-0.5">
        PUSH
      </Badge>
    );
  }

  if (score?.isLive) {
    return (
      <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-xs gap-1.5 px-2 py-0.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        LIVE
      </Badge>
    );
  }

  if (score?.isFinal) {
    return (
      <Badge className="border-0 bg-amber-500/15 text-amber-400 text-xs px-2 py-0.5">
        FINAL
      </Badge>
    );
  }

  if (score?.isPreGame) {
    const countdown = formatCountdown(score.startTime);
    if (countdown) {
      return (
        <Badge className="border-0 bg-sky-500/20 text-sky-300 text-xs font-semibold gap-1.5 px-2.5 py-0.5">
          <svg
            className="h-3.5 w-3.5 text-sky-400"
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
      <Badge className="border-0 bg-zinc-500/15 text-zinc-400 text-xs px-2 py-0.5">
        PRE-GAME
      </Badge>
    );
  }

  return (
    <Badge className="border-0 bg-amber-500/15 text-amber-400 text-xs px-2 py-0.5">
      PENDING
    </Badge>
  );
}

/** Scoreboard display — prominent score */
function Scoreboard({ score }: { score: LiveScoreData }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-950/80 px-4 py-3 mt-3">
      <div className="text-center flex-1">
        <p className="text-xs text-zinc-500 mb-0.5 truncate">{score.awayTeam}</p>
        <p className="text-2xl font-bold tabular-nums text-zinc-100">
          {score.awayScore}
        </p>
      </div>
      <div className="text-center px-3">
        <p className="text-xs font-medium text-zinc-500">
          {score.isLive ? score.statusText : score.isFinal ? "FINAL" : "VS"}
        </p>
      </div>
      <div className="text-center flex-1">
        <p className="text-xs text-zinc-500 mb-0.5 truncate">{score.homeTeam}</p>
        <p className="text-2xl font-bold tabular-nums text-zinc-100">
          {score.homeScore}
        </p>
      </div>
    </div>
  );
}

/** The key data point for each bet — big, highlighted, the star of the card */
function KeyInsight({
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
      <div className="mt-3 rounded-lg bg-violet-500/10 border border-violet-500/20 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
            PROP
          </span>
          <span className="text-sm font-semibold text-zinc-200">
            {bet.player}
          </span>
        </div>
        <p className="text-lg font-bold text-zinc-100">
          {side === "over" ? "Over" : "Under"} {line}{" "}
          <span className="text-sm font-medium text-zinc-400">{propShort}</span>
        </p>
        <p className="text-sm text-zinc-500 mt-0.5">
          {formatOdds(bet.odds)}
        </p>
      </div>
    );
  }

  if (betType === "spread") {
    const lastSpace = bet.pick.lastIndexOf(" ");
    const teamName = lastSpace > 0 ? bet.pick.slice(0, lastSpace) : bet.pick;
    const spreadLine =
      lastSpace > 0 ? parseFloat(bet.pick.slice(lastSpace + 1)) : NaN;

    let statusText: string | null = null;
    let statusColor = "text-zinc-400";

    if (hasScore && !isNaN(spreadLine)) {
      const pickIsHome =
        teamName === bet.homeTeam ||
        bet.homeTeam.includes(teamName) ||
        teamName.includes(bet.homeTeam);
      const pickScore = pickIsHome ? score.homeScore : score.awayScore;
      const oppScore = pickIsHome ? score.awayScore : score.homeScore;
      const margin = pickScore - oppScore;
      const covering = margin + spreadLine > 0;
      statusText = covering
        ? `Covering (${margin > 0 ? "+" : ""}${margin})`
        : `Not covering (${margin > 0 ? "+" : ""}${margin})`;
      statusColor = covering ? "text-emerald-400" : "text-rose-400";
    }

    return (
      <div className="mt-3">
        <p className="text-base font-semibold text-zinc-200">{bet.pick}</p>
        <p className="text-sm text-zinc-500">
          Spread @ {formatOdds(bet.odds)}
        </p>
        {statusText && (
          <p className={`text-lg font-bold mt-1 ${statusColor}`}>
            {statusText}
          </p>
        )}
      </div>
    );
  }

  if (betType === "over" || betType === "under") {
    const parts = bet.pick.split(" ");
    const line = parseFloat(parts[parts.length - 1]);

    let statusText: string | null = null;
    let statusColor = "text-zinc-400";

    if (hasScore && !isNaN(line) && total !== null) {
      const onTrack =
        (betType === "over" && total > line) ||
        (betType === "under" && total < line);
      const push = total === line;

      if (push) {
        statusText = `Total: ${total} (push)`;
        statusColor = "text-amber-400";
      } else if (betType === "over") {
        statusText = total > line
          ? `Total: ${total} — Over hit!`
          : `Total: ${total} — Need ${(line - total + 1).toFixed(1)} more`;
        statusColor = onTrack ? "text-emerald-400" : "text-rose-400";
      } else {
        statusText = total < line
          ? `Total: ${total} — Under holding`
          : `Total: ${total} — Over the line`;
        statusColor = onTrack ? "text-emerald-400" : "text-rose-400";
      }
    }

    return (
      <div className="mt-3">
        <p className="text-base font-semibold text-zinc-200">{bet.pick}</p>
        <p className="text-sm text-zinc-500">
          Total @ {formatOdds(bet.odds)}
          {!isNaN(line) && (
            <span className="ml-1.5 text-zinc-600">Line: {line}</span>
          )}
        </p>
        {statusText && (
          <p className={`text-lg font-bold mt-1 ${statusColor}`}>
            {statusText}
          </p>
        )}
      </div>
    );
  }

  if (betType.includes("parlay")) {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
            PARLAY
          </span>
          <span className="text-sm font-medium text-zinc-400">
            {formatOdds(bet.odds)}
          </span>
        </div>
        <p className="text-sm font-medium text-zinc-200 leading-relaxed">
          {bet.pick}
        </p>
      </div>
    );
  }

  // Moneyline / default
  let statusText: string | null = null;
  let statusColor = "text-zinc-400";

  if (hasScore) {
    const homeWinning = score.homeScore > score.awayScore;
    const pickIsHome =
      bet.pick === bet.homeTeam ||
      bet.homeTeam.includes(bet.pick) ||
      bet.pick.includes(bet.homeTeam);
    const pickIsAway =
      bet.pick === bet.awayTeam ||
      bet.awayTeam.includes(bet.pick) ||
      bet.pick.includes(bet.awayTeam);

    if (pickIsHome || pickIsAway) {
      const pickWinning = pickIsHome ? homeWinning : !homeWinning;
      const tied = score.homeScore === score.awayScore;

      if (tied) {
        statusText = "Tied";
        statusColor = "text-amber-400";
      } else {
        statusText = pickWinning ? "Winning" : "Losing";
        statusColor = pickWinning ? "text-emerald-400" : "text-rose-400";
      }
    }
  }

  return (
    <div className="mt-3">
      <p className="text-base font-semibold text-zinc-200">{bet.pick}</p>
      <p className="text-sm text-zinc-500">
        Moneyline @ {formatOdds(bet.odds)}
      </p>
      {statusText && (
        <p className={`text-lg font-bold mt-1 ${statusColor}`}>
          {statusText}
        </p>
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
  const hasScore = score && !score.isPreGame;

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
      className={`rounded-xl border ${sportColor} bg-zinc-900/80 p-5 cursor-pointer transition-colors hover:bg-zinc-800/80 ${
        score?.isLive ? "ring-1 ring-emerald-500/20" : ""
      }`}
      onClick={onClick}
    >
      {/* Header: sport + status + P&L */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${sportLabel.bg} ${sportLabel.text}`}
          >
            {bet.sport}
          </span>
          <StatusBadge bet={bet} score={score} />
        </div>
        {pnlDisplay && (
          <span className={`text-base font-bold tabular-nums ${pnlColor}`}>
            {pnlDisplay}
          </span>
        )}
      </div>

      {/* Event name + start time */}
      <div className="text-sm text-zinc-400 mt-2">
        {bet.event}
      </div>
      {score?.isPreGame && score.startTime && (
        <div className="text-sm text-sky-400/80 font-medium mt-1">
          Starts{" "}
          {new Date(score.startTime).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      )}

      {/* Live scoreboard */}
      {hasScore && <Scoreboard score={score} />}

      {/* Key data point — the star of the card */}
      <KeyInsight bet={bet} score={score} />

      {/* Stake + edge footer */}
      <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
        <span className="text-xs text-zinc-500">
          Stake: ${bet.stake.toFixed(2)}
        </span>
        <span className="text-xs text-zinc-500">
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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">
            Today&apos;s Bets
          </h2>
          <span className="text-sm text-zinc-500">
            {bets.length} bets &middot; {wins}W {losses}L {pending > 0 ? `${pending} pending` : ""}
          </span>
          {hasLiveGames && (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-sm font-semibold text-emerald-400">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
