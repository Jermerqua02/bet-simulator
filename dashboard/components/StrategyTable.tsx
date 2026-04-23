import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StrategyStats } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/data";

interface StrategyTableProps {
  strategies: StrategyStats[];
}

export default function StrategyTable({ strategies }: StrategyTableProps) {
  const sorted = [...strategies].sort((a, b) => b.roi - a.roi);

  if (sorted.length === 0) {
    return (
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Strategy Performance
        </h2>
        <p className="text-zinc-500">No bets placed yet.</p>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">
        Strategy Performance
      </h2>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Strategy</TableHead>
              <TableHead className="text-right text-zinc-400">Bets</TableHead>
              <TableHead className="text-right text-zinc-400">Wins</TableHead>
              <TableHead className="text-right text-zinc-400">Losses</TableHead>
              <TableHead className="text-right text-zinc-400">
                Win Rate
              </TableHead>
              <TableHead className="text-right text-zinc-400">P&L</TableHead>
              <TableHead className="text-right text-zinc-400">ROI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((strategy) => (
              <TableRow
                key={strategy.name}
                className="border-zinc-800 hover:bg-zinc-800/50"
              >
                <TableCell className="font-medium text-zinc-200">
                  {strategy.displayName}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-300">
                  {strategy.bets}
                </TableCell>
                <TableCell className="text-right tabular-nums text-emerald-400">
                  {strategy.wins}
                </TableCell>
                <TableCell className="text-right tabular-nums text-rose-400">
                  {strategy.losses}
                </TableCell>
                <TableCell className="text-right tabular-nums text-zinc-300">
                  {strategy.bets > 0
                    ? `${strategy.winRate.toFixed(1)}%`
                    : "--"}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${
                    strategy.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatCurrency(strategy.pnl)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${
                    strategy.roi >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatPercent(strategy.roi)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
