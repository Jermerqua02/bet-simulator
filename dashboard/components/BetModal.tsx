"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Bet } from "@/lib/types";
import {
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Clock,
  Brain,
} from "lucide-react";

interface BetModalProps {
  bet: Bet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getEspnUrl(sport: string, gameId: string): string {
  const sportMap: Record<string, string> = {
    NBA: "nba",
    MLB: "mlb",
    NHL: "nhl",
  };
  const espnSport = sportMap[sport] || sport.toLowerCase();
  return `https://www.espn.com/${espnSport}/game/_/gameId/${gameId}`;
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

function getResultStyle(result: string | null): {
  bg: string;
  text: string;
  icon: React.ReactNode;
} {
  switch (result) {
    case "win":
      return {
        bg: "bg-emerald-500/10 border-emerald-500/30",
        text: "text-emerald-400",
        icon: <TrendingUp className="h-5 w-5 text-emerald-400" />,
      };
    case "loss":
      return {
        bg: "bg-rose-500/10 border-rose-500/30",
        text: "text-rose-400",
        icon: <TrendingDown className="h-5 w-5 text-rose-400" />,
      };
    default:
      return {
        bg: "bg-amber-500/10 border-amber-500/30",
        text: "text-amber-400",
        icon: <Clock className="h-5 w-5 text-amber-400" />,
      };
  }
}

function formatStrategyName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function BetModal({ bet, open, onOpenChange }: BetModalProps) {
  if (!bet) return null;

  const resultStyle = getResultStyle(bet.result);
  const resultLabel =
    bet.result === "win"
      ? "WIN"
      : bet.result === "loss"
      ? "LOSS"
      : "PENDING";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <div
            className={`mb-3 flex items-center gap-3 rounded-lg border p-3 ${resultStyle.bg}`}
          >
            {resultStyle.icon}
            <div>
              <p className={`text-lg font-bold ${resultStyle.text}`}>
                {resultLabel}
              </p>
              {bet.pnl !== null && bet.pnl !== undefined && (
                <p className={`text-sm font-medium ${resultStyle.text}`}>
                  {formatCurrency(bet.pnl)}
                </p>
              )}
            </div>
          </div>
          <DialogTitle className="text-lg text-zinc-100">
            {bet.event}
          </DialogTitle>
          <p className="text-sm text-zinc-400">{formatDate(bet.date)}</p>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Teams */}
          <div className="rounded-lg bg-zinc-900 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-300">
                  {bet.awayTeam}
                </p>
                {bet.awayRecord && (
                  <p className="text-xs text-zinc-500">{bet.awayRecord}</p>
                )}
              </div>
              <span className="text-xs text-zinc-600">@</span>
              <div className="text-right">
                <p className="text-sm font-medium text-zinc-300">
                  {bet.homeTeam}
                </p>
                {bet.homeRecord && (
                  <p className="text-xs text-zinc-500">{bet.homeRecord}</p>
                )}
              </div>
            </div>
          </div>

          {/* Bet Details Grid */}
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="Sport">
              <Badge className={`text-xs ${getSportBadgeColor(bet.sport)}`}>
                {bet.sport}
              </Badge>
            </DetailItem>
            <DetailItem label="Bet Type">
              <span className="text-sm text-zinc-200">{bet.betType}</span>
            </DetailItem>
            <DetailItem label="Pick">
              <span className="text-sm font-medium text-zinc-200">
                {bet.pick}
              </span>
            </DetailItem>
            <DetailItem label="Odds">
              <span className="text-sm font-mono text-zinc-200">
                {formatOdds(bet.odds)}
              </span>
            </DetailItem>
            <DetailItem label="Implied Prob">
              <span className="text-sm tabular-nums text-zinc-200">
                {(bet.impliedProbability * 100).toFixed(1)}%
              </span>
            </DetailItem>
            <DetailItem label="True Prob">
              <span className="text-sm tabular-nums text-zinc-200">
                {(bet.trueProbability * 100).toFixed(1)}%
              </span>
            </DetailItem>
            <DetailItem label="Edge">
              <span className="text-sm tabular-nums text-emerald-400">
                {(bet.edge * 100).toFixed(1)}%
              </span>
            </DetailItem>
            <DetailItem label="Expected Value">
              <span
                className={`text-sm tabular-nums ${
                  bet.expectedValue >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatCurrency(bet.expectedValue)}
              </span>
            </DetailItem>
            <DetailItem label="Stake">
              <span className="text-sm tabular-nums text-zinc-200">
                {formatCurrency(bet.stake)}
              </span>
            </DetailItem>
            <DetailItem label="Strategy">
              <span className="text-sm text-zinc-200">
                {formatStrategyName(bet.strategy)}
              </span>
            </DetailItem>
          </div>

          {/* AI Notes */}
          {bet.notes && (
            <div className="rounded-lg bg-zinc-900 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="h-4 w-4 text-amber-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  AI Rationale
                </p>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">
                {bet.notes}
              </p>
            </div>
          )}

          {/* Verification */}
          {bet.gameId && (
            <div className="border-t border-zinc-800 pt-3">
              <a
                href={getEspnUrl(bet.sport, bet.gameId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Verify on ESPN
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
