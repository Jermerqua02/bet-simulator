import { TrendingUp, TrendingDown, BarChart3, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ThemeToggle from "@/components/ThemeToggle";
import type { DashboardStats } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/data";

interface HeaderProps {
  stats: DashboardStats;
}

export default function Header({ stats }: HeaderProps) {
  const pnlDiff = stats.currentBankroll - stats.startingBankroll;
  const isUp = pnlDiff > 0;
  const isDown = pnlDiff < 0;

  return (
    <header className="mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Bet Simulator</h1>
            <p className="text-sm text-zinc-500">
              Simulated Sports Betting &bull; No Real Money
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Current Bankroll
            </p>
            <p
              className={`text-3xl font-bold tabular-nums ${
                isUp
                  ? "text-emerald-400"
                  : isDown
                  ? "text-rose-400"
                  : "text-zinc-100"
              }`}
            >
              {formatCurrency(stats.currentBankroll)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <Badge
              className={`flex items-center gap-1 border-0 px-2 py-0.5 text-xs font-semibold ${
                stats.roi >= 0
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {stats.roi >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {formatPercent(stats.roi)} ROI
            </Badge>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" />
              {stats.daysActive} {stats.daysActive === 1 ? "day" : "days"}{" "}
              active
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
