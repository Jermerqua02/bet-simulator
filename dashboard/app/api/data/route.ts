import { getBetsData, getBankrollData, getConfigData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [bets, bankroll, config] = await Promise.all([
      getBetsData(),
      getBankrollData(),
      getConfigData(),
    ]);

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
    console.error("Error fetching data:", error);
    return Response.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
