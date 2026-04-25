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
        <div className="flex items-center gap-4">
          {/* Gradient icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/20">
            <svg
              className="h-7 w-7 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8L8 14l-6-4.8h7.6z" />
              <circle cx="18" cy="5" r="2.5" fill="currentColor" opacity="0.7" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight">
                <span className="text-zinc-100">Bet</span>{" "}
                <span className="text-orange-400">Simulator</span>
              </h1>
              <span className="rounded-full bg-zinc-700/80 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                Demo
              </span>
            </div>
            <p className="text-sm text-zinc-500">
              Simulated sports betting &mdash; no real money on the line
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
