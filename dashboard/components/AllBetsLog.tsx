import { Badge } from "@/components/ui/badge";
import type { Bet } from "@/lib/types";
import { formatCurrency, formatDate, formatOdds, formatStrategyName } from "@/lib/data";

interface AllBetsLogProps {
  bets: Bet[];
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

function getResultDot(result: string | null): string {
  switch (result) {
    case "win":
      return "bg-emerald-400";
    case "loss":
      return "bg-rose-400";
    default:
      return "bg-amber-400";
  }
}

export default function AllBetsLog({ bets }: AllBetsLogProps) {
  if (bets.length === 0) {
    return null;
  }

  // Group bets by date, most recent first
  const sorted = [...bets].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const grouped: Record<string, Bet[]> = {};
  for (const bet of sorted) {
    if (!grouped[bet.date]) {
      grouped[bet.date] = [];
    }
    grouped[bet.date].push(bet);
  }

  const dateKeys = Object.keys(grouped).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">Bet Log</h2>
      <div className="space-y-6">
        {dateKeys.map((date) => {
          const dayBets = grouped[date];
          const dayPnl = dayBets.reduce((sum, b) => sum + (b.pnl ?? 0), 0);
          const settled = dayBets.filter(
            (b) => b.result === "win" || b.result === "loss"
          );
          const wins = settled.filter((b) => b.result === "win").length;

          return (
            <div key={date}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-300">
                  {formatDate(date)}
                </h3>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{dayBets.length} bets</span>
                  {settled.length > 0 && (
                    <>
                      <span>
                        {wins}W-{settled.length - wins}L
                      </span>
                      <span
                        className={
                          dayPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {formatCurrency(dayPnl)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                {dayBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-800/50 transition-colors"
                  >
                    <div
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${getResultDot(
                        bet.result
                      )}`}
                    />
                    <Badge
                      className={`text-[10px] px-1.5 ${getSportBadgeColor(
                        bet.sport
                      )}`}
                    >
                      {bet.sport}
                    </Badge>
                    <span className="text-sm text-zinc-300 truncate flex-1 min-w-0">
                      {bet.pick}
                    </span>
                    <span className="text-xs font-mono text-zinc-500 flex-shrink-0">
                      {formatOdds(bet.odds)}
                    </span>
                    <span className="text-xs text-zinc-500 flex-shrink-0">
                      {formatStrategyName(bet.strategy)}
                    </span>
                    <span
                      className={`text-xs tabular-nums font-medium flex-shrink-0 ${
                        bet.pnl === null || bet.pnl === undefined
                          ? "text-zinc-600"
                          : bet.pnl >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {bet.pnl !== null && bet.pnl !== undefined
                        ? formatCurrency(bet.pnl)
                        : "--"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
