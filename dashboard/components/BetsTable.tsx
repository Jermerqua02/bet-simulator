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
import type { Bet } from "@/lib/types";
import { Filter } from "lucide-react";

interface BetsTableProps {
  bets: Bet[];
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

function getResultBadge(result: string | null) {
  switch (result) {
    case "win":
      return (
        <Badge className="border-0 bg-emerald-500/15 text-emerald-400 text-xs">
          WIN
        </Badge>
      );
    case "loss":
      return (
        <Badge className="border-0 bg-rose-500/15 text-rose-400 text-xs">
          LOSS
        </Badge>
      );
    default:
      return (
        <Badge className="border-0 bg-amber-500/15 text-amber-400 text-xs">
          PENDING
        </Badge>
      );
  }
}

export default function BetsTable({ bets }: BetsTableProps) {
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
          (b) => b.result === "pending" || b.result === null
        );
      } else {
        filtered = filtered.filter((b) => b.result === resultFilter);
      }
    }

    // Sort by date descending
    filtered.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return filtered;
  }, [bets, sportFilter, strategyFilter, resultFilter]);

  const handleRowClick = (bet: Bet) => {
    setSelectedBet(bet);
    setModalOpen(true);
  };

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
            {filteredBets.map((bet) => (
              <TableRow
                key={bet.id}
                className="cursor-pointer border-zinc-800 transition-colors hover:bg-zinc-800/60"
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
                <TableCell className="text-sm text-zinc-300 max-w-[220px] truncate">
                  {bet.event}
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
                  {getResultBadge(bet.result)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums text-sm font-medium ${
                    bet.pnl === null || bet.pnl === undefined
                      ? "text-zinc-500"
                      : bet.pnl >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {bet.pnl !== null && bet.pnl !== undefined
                    ? formatCurrency(bet.pnl)
                    : "--"}
                </TableCell>
              </TableRow>
            ))}
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
