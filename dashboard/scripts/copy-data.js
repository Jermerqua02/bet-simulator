const fs = require("fs");
const path = require("path");

const dst = path.join(__dirname, "..", "data");
const src = path.join(__dirname, "..", "..", "data");

if (fs.existsSync(dst)) {
  console.log("data/ already exists, skipping copy");
  process.exit(0);
}

if (fs.existsSync(src)) {
  fs.cpSync(src, dst, { recursive: true });
  console.log("Copied ../data → ./data");
} else {
  console.log("No ../data found, creating empty defaults");
  fs.mkdirSync(dst, { recursive: true });
  fs.writeFileSync(
    path.join(dst, "bets.json"),
    JSON.stringify({ bets: [] }, null, 2)
  );
  fs.writeFileSync(
    path.join(dst, "bankroll.json"),
    JSON.stringify({ startingBankroll: 10000, currentBankroll: 10000, history: [] }, null, 2)
  );
  fs.writeFileSync(
    path.join(dst, "config.json"),
    JSON.stringify({
      sports: ["NBA", "MLB", "NHL"],
      defaultStake: 25,
      maxStakePercent: 0.05,
      startingBankroll: 10000,
      strategies: {},
      minEdge: 0.03,
      dailyBetTarget: 8,
    }, null, 2)
  );
}
