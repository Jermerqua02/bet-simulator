import {
  getBetsData,
  getBankrollData,
  getConfigData,
  calculateStats,
  getStrategyStats,
} from "@/lib/data";
import Header from "@/components/Header";
import StatsRow from "@/components/StatsRow";
import BankrollChart from "@/components/BankrollChart";
import StrategyTable from "@/components/StrategyTable";
import BetsTable from "@/components/BetsTable";
import AllBetsLog from "@/components/AllBetsLog";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const betsData = getBetsData();
  const bankrollData = getBankrollData();
  const configData = getConfigData();

  const stats = calculateStats(betsData.bets, bankrollData);
  const strategyStats = getStrategyStats(betsData.bets);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Header stats={stats} />
      <StatsRow stats={stats} />
      <BankrollChart
        history={bankrollData.history}
        startingBankroll={bankrollData.startingBankroll}
      />
      <StrategyTable strategies={strategyStats} />
      <BetsTable bets={betsData.bets} />
      <AllBetsLog bets={betsData.bets} />

      {/* Footer */}
      <footer className="mt-8 border-t border-zinc-800 pt-6 text-center">
        <p className="text-xs text-zinc-600">
          Bet Simulator &mdash; All bets are simulated. No real money is
          wagered.
        </p>
        <p className="mt-1 text-xs text-zinc-700">
          Starting bankroll: ${configData.startingBankroll.toLocaleString()} |
          Daily target: {configData.dailyBetTarget} bets | Min edge:{" "}
          {(configData.minEdge * 100).toFixed(0)}%
        </p>
      </footer>
    </main>
  );
}
