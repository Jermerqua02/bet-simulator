import {
  Target,
  Percent,
  DollarSign,
  Brain,
  Trophy,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardStats } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/data";

interface StatsRowProps {
  stats: DashboardStats;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: "emerald" | "rose" | "amber" | "blue" | "zinc";
  subtext?: string;
}

function StatCard({
  icon,
  label,
  value,
  color = "zinc",
  subtext,
}: StatCardProps) {
  const colorMap = {
    emerald: "text-emerald-400 bg-emerald-500/10",
    rose: "text-rose-400 bg-rose-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    blue: "text-blue-400 bg-blue-500/10",
    zinc: "text-zinc-400 bg-zinc-700/50",
  };

  const valueColorMap = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    zinc: "text-zinc-100",
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[color]}`}
          >
            {icon}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p
            className={`mt-1 text-xl font-bold tabular-nums ${valueColorMap[color]}`}
          >
            {value}
          </p>
          {subtext && (
            <p className="mt-0.5 text-xs text-zinc-500">{subtext}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatsRow({ stats }: StatsRowProps) {
  const pnlColor = stats.totalPnl >= 0 ? "emerald" : "rose";
  const streakColor =
    stats.currentStreak.type === "win"
      ? "emerald"
      : stats.currentStreak.type === "loss"
      ? "rose"
      : "zinc";
  const streakText =
    stats.currentStreak.type === "none"
      ? "--"
      : `${stats.currentStreak.count}${stats.currentStreak.type === "win" ? "W" : "L"}`;

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard
        icon={<Target className="h-4 w-4" />}
        label="Total Bets"
        value={stats.totalBets.toString()}
        color="blue"
        subtext={
          stats.pending > 0 ? `${stats.pending} pending` : undefined
        }
      />
      <StatCard
        icon={<Percent className="h-4 w-4" />}
        label="Win Rate"
        value={stats.totalBets > 0 ? `${stats.winRate.toFixed(1)}%` : "--"}
        color={stats.winRate >= 50 ? "emerald" : stats.winRate > 0 ? "amber" : "zinc"}
        subtext={
          stats.totalBets > 0
            ? `${stats.wins}W - ${stats.losses}L`
            : undefined
        }
      />
      <StatCard
        icon={<DollarSign className="h-4 w-4" />}
        label="Total P&L"
        value={stats.totalBets > 0 ? formatCurrency(stats.totalPnl) : "--"}
        color={pnlColor}
        subtext={stats.totalBets > 0 ? formatPercent(stats.roi) + " ROI" : undefined}
      />
      <StatCard
        icon={<Brain className="h-4 w-4" />}
        label="Best Strategy"
        value={stats.bestStrategy}
        color="amber"
      />
      <StatCard
        icon={<Trophy className="h-4 w-4" />}
        label="Best Sport"
        value={stats.bestSport}
        color="blue"
      />
      <StatCard
        icon={<Flame className="h-4 w-4" />}
        label="Current Streak"
        value={streakText}
        color={streakColor}
      />
      <StatCard
        icon={<ArrowUpRight className="h-4 w-4" />}
        label="Best Day P&L"
        value={stats.daysActive > 0 ? formatCurrency(stats.bestDayPnl) : "--"}
        color="emerald"
      />
      <StatCard
        icon={<ArrowDownRight className="h-4 w-4" />}
        label="Worst Day P&L"
        value={stats.daysActive > 0 ? formatCurrency(stats.worstDayPnl) : "--"}
        color="rose"
      />
    </div>
  );
}
