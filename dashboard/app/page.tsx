import {
  getBetsData,
  getBankrollData,
  getConfigData,
} from "@/lib/data";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [betsData, bankrollData, configData] = await Promise.all([
    getBetsData(),
    getBankrollData(),
    getConfigData(),
  ]);

  return (
    <DashboardClient
      initialBets={betsData.bets}
      initialBankroll={bankrollData}
      initialConfig={configData}
    />
  );
}
