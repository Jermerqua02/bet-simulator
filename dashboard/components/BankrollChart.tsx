"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { BankrollEntry } from "@/lib/types";

interface BankrollChartProps {
  history: BankrollEntry[];
  startingBankroll: number;
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

interface TooltipPayloadEntry {
  value: number;
  payload: {
    date: string;
    bankroll: number;
    dailyPnl: number;
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;
  const pnl = data.dailyPnl;
  const pnlColor = pnl >= 0 ? "text-emerald-400" : "text-rose-400";
  const pnlSign = pnl >= 0 ? "+" : "";

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-zinc-400">
        {formatDateShort(data.date)}
      </p>
      <p className="mt-1 text-sm font-bold text-zinc-100">
        {formatCurrency(data.bankroll)}
      </p>
      <p className={`text-xs font-medium ${pnlColor}`}>
        {pnlSign}
        {formatCurrency(pnl)} today
      </p>
    </div>
  );
}

export default function BankrollChart({
  history,
  startingBankroll,
}: BankrollChartProps) {
  if (history.length === 0) {
    return (
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Bankroll History
        </h2>
        <div className="flex h-64 items-center justify-center text-zinc-500">
          <p>No bankroll history yet. Place some bets to see the chart.</p>
        </div>
      </div>
    );
  }

  const lastBankroll = history[history.length - 1]?.bankroll ?? startingBankroll;
  const isAboveStart = lastBankroll >= startingBankroll;
  const gradientColor = isAboveStart ? "16, 185, 129" : "244, 63, 94";
  const strokeColor = isAboveStart ? "#10b981" : "#f43f5e";

  const minBankroll = Math.min(...history.map((h) => h.bankroll));
  const maxBankroll = Math.max(...history.map((h) => h.bankroll));
  const padding = (maxBankroll - minBankroll) * 0.1 || 500;
  const yMin = Math.floor((minBankroll - padding) / 100) * 100;
  const yMax = Math.ceil((maxBankroll + padding) / 100) * 100;

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">
        Bankroll History
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={history}
          margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
        >
          <defs>
            <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={`rgb(${gradientColor})`}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={`rgb(${gradientColor})`}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#27272a"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            stroke="#52525b"
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={formatCurrency}
            stroke="#52525b"
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={startingBankroll}
            stroke="#52525b"
            strokeDasharray="4 4"
            label={{
              value: `Start: ${formatCurrency(startingBankroll)}`,
              position: "right",
              fill: "#71717a",
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="bankroll"
            stroke={strokeColor}
            strokeWidth={2}
            fill="url(#bankrollGradient)"
            dot={false}
            activeDot={{
              r: 4,
              stroke: strokeColor,
              strokeWidth: 2,
              fill: "#09090b",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
