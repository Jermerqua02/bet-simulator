# Bet Simulator

Automated sports betting simulation system. Tracks simulated bets across NBA, MLB, and NHL using real odds from ESPN/DraftKings. **No real money involved.**

## Components

- **`agent/`** - Python CLI that fetches real odds, builds a probability model, places simulated bets, and resolves outcomes
- **`dashboard/`** - Next.js app deployed on Vercel that visualizes all bets, bankroll, and strategy performance
- **`data/`** - Append-only JSON files (bets, bankroll history, config)

## Quick Start

### Place Bets
```bash
cd bet-simulator
python -m agent place          # Fetch today's games and place simulated bets
python -m agent resolve        # Resolve pending bets with final scores
python -m agent status         # Print bankroll summary
python -m agent push           # Commit and push data changes
```

### Run Dashboard Locally
```bash
cd dashboard
npm install
npm run dev
```

## Betting Strategies

| Strategy | Description |
|----------|-------------|
| High Probability | Moneyline bets on heavy favorites (model prob > 65%) |
| Value Hunting | Largest edge between model and market probability |
| Kelly Criterion | Optimal stake sizing based on edge and odds |
| Safe Parlay | 2-3 leg parlays from high-confidence picks |
| Contrarian | Underdogs where model sees hidden value |
| Sport Specialist | Overweight the sport with best trailing ROI |

## How It Works

1. ESPN API provides real game schedules, DraftKings odds, team records, and final scores
2. Agent builds a "true probability" model from team stats (win%, home/road splits, recent form, point differential)
3. Compares model probability to market implied probability to find edges
4. Places bets through 6 different strategies, each with different selection criteria
5. After games complete, resolves bets against actual results
6. Dashboard auto-updates on push via Vercel

## Data Sources

- ESPN Scoreboard API (games, odds, scores)
- ESPN Standings API (records, differentials, streaks)
- No API keys required
