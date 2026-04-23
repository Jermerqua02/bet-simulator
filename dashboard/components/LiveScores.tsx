"use client";

import type { Bet, LiveScoreData } from "@/lib/types";

interface LiveScoresProps {
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

function ScoreCard({
  bet,
  score,
}: {
  bet: Bet;
  score: LiveScoreData | undefined;
}) {
  const sportColor = getSportColor(bet.sport);
  const sportLabel = getSportLabel(bet.sport);

  if (!score) {
    return (
      <div
        className={`rounded-lg border ${sportColor} bg-zinc-900/80 p-4`}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sportLabel.bg} ${sportLabel.text}`}
          >
            {bet.sport}
          </span>
          <span className="text-xs text-zinc-500">Loading...</span>
        </div>
        <div className="text-sm text-zinc-400">{bet.event}</div>
      </div>
    );
  }

  const homeWinning = score.homeScore > score.awayScore;
  const awayWinning = score.awayScore > score.homeScore;

  return (
    <div
      className={`rounded-lg border ${sportColor} bg-zinc-900/80 p-4`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${sportLabel.bg} ${sportLabel.text}`}
        >
          {bet.sport}
        </span>
        <div className="flex items-center gap-2">
          {score.isLive && (
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
          {score.isFinal && (
            <span className="text-xs font-semibold text-zinc-400">
              FINAL
            </span>
          )}
          {score.isPreGame && (
            <span className="text-xs text-zinc-500">PRE-GAME</span>
          )}
        </div>
      </div>

      {/* Score display */}
      <div className="space-y-2">
        {/* Away team */}
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-medium ${
              awayWinning && (score.isLive || score.isFinal)
                ? "text-emerald-400"
                : "text-zinc-300"
            }`}
          >
            {score.awayTeam}
          </span>
          <span
            className={`text-lg font-bold tabular-nums ${
              awayWinning && (score.isLive || score.isFinal)
                ? "text-emerald-400"
                : "text-zinc-200"
            }`}
          >
            {score.isPreGame ? "-" : score.awayScore}
          </span>
        </div>

        {/* Home team */}
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-medium ${
              homeWinning && (score.isLive || score.isFinal)
                ? "text-emerald-400"
                : "text-zinc-300"
            }`}
          >
            {score.homeTeam}
          </span>
          <span
            className={`text-lg font-bold tabular-nums ${
              homeWinning && (score.isLive || score.isFinal)
                ? "text-emerald-400"
                : "text-zinc-200"
            }`}
          >
            {score.isPreGame ? "-" : score.homeScore}
          </span>
        </div>
      </div>

      {/* Status line */}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2">
        <span className="text-xs text-zinc-500">{score.statusText}</span>
        {score.isFinal &&
          (bet.result ?? "").toUpperCase() !== "WIN" &&
          (bet.result ?? "").toUpperCase() !== "LOSS" && (
            <span className="text-[10px] font-semibold uppercase text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
              AWAITING RESOLUTION
            </span>
          )}
      </div>

      {/* Bet pick info */}
      <div className="mt-2 text-xs text-zinc-500">
        Your pick: <span className="text-zinc-300">{bet.pick}</span>
      </div>
    </div>
  );
}

export default function LiveScores({
  bets,
  liveScores,
  lastUpdated,
}: LiveScoresProps) {
  if (bets.length === 0) {
    return null;
  }

  const hasLiveGames = bets.some((b) => {
    const score = liveScores.get(b.gameId);
    return score?.isLive;
  });

  const secondsAgo = lastUpdated
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
    : null;

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">
            Live Scores
          </h2>
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
          <ScoreCard
            key={bet.id}
            bet={bet}
            score={liveScores.get(bet.gameId)}
          />
        ))}
      </div>
    </div>
  );
}
