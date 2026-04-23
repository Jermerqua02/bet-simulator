import { getBetsData, getBankrollData, getConfigData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bets = getBetsData();
    const bankroll = getBankrollData();
    const config = getConfigData();

    return Response.json(
      { bets, bankroll, config },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Error reading data files:", error);
    return Response.json(
      { error: "Failed to read data files" },
      { status: 500 }
    );
  }
}
