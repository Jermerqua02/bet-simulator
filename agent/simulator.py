"""
Core orchestration: place daily bets and resolve pending bets.
"""

from __future__ import annotations

import json
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional

from .espn import fetch_scoreboard, fetch_standings, parse_games, parse_standings
from .odds import calculate_edge
from .strategies import STRATEGIES
from .bankroll import (
    load_bankroll, save_bankroll,
    load_bets, save_bets,
    update_bankroll,
    REPO_ROOT, DATA_DIR,
)

# ANSI colour helpers
_GREEN = "\033[92m"
_RED = "\033[91m"
_YELLOW = "\033[93m"
_CYAN = "\033[96m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RESET = "\033[0m"


def _load_config() -> dict:
    config_path = DATA_DIR / "config.json"
    try:
        return json.loads(config_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        print(f"{_RED}Could not load config from {config_path}{_RESET}")
        return {}


def _today_str() -> str:
    """Return today's date as YYYYMMDD."""
    return date.today().strftime("%Y%m%d")


def _today_iso() -> str:
    """Return today's date in ISO format (YYYY-MM-DD)."""
    return date.today().isoformat()


# ---------------------------------------------------------------------------
# place_bets
# ---------------------------------------------------------------------------

def place_bets(target_date: str | None = None) -> None:
    """
    Main daily bet-placement flow.

    1. Load config and existing bets
    2. Fetch scoreboards + standings for each sport
    3. Run each enabled strategy
    4. Deduplicate, rank, and select top N
    5. Persist to bets.json and update bankroll history
    """
    config = _load_config()
    if not config:
        return

    dt = target_date or _today_str()
    iso_date = f"{dt[:4]}-{dt[4:6]}-{dt[6:8]}"
    sports = config.get("sports", ["NBA", "MLB", "NHL"])
    strategies_cfg = config.get("strategies", {})
    daily_target = config.get("dailyBetTarget", 8)
    bankroll_data = load_bankroll()
    current_bankroll = bankroll_data.get("currentBankroll", 10000)
    existing_bets = load_bets()

    print()
    print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print(f"{_BOLD}{_CYAN}  PLACING BETS FOR {iso_date}{_RESET}")
    print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print(f"  Bankroll: ${current_bankroll:,.2f}  |  Target: {daily_target} bets")
    print(f"  Sports: {', '.join(sports)}")
    print()

    # Collect all pre-game data
    all_games: list[dict] = []
    all_standings: dict = {}

    for sport in sports:
        print(f"  {_DIM}Fetching {sport} scoreboard...{_RESET}", end=" ", flush=True)
        raw_sb = fetch_scoreboard(sport, dt)
        games = parse_games(raw_sb, sport)
        pre_games = [g for g in games if g["status"] == "pre"]
        print(f"{_GREEN}{len(pre_games)}/{len(games)} pre-game{_RESET}")

        print(f"  {_DIM}Fetching {sport} standings...{_RESET}", end=" ", flush=True)
        raw_st = fetch_standings(sport)
        standings = parse_standings(raw_st, sport)
        print(f"{_GREEN}{len(standings)} teams{_RESET}")

        all_games.extend(pre_games)
        all_standings.update(standings)

    if not all_games:
        print(f"\n  {_YELLOW}No pre-game events found for {iso_date}. Nothing to bet on.{_RESET}")
        return

    print(f"\n  Total pre-game events: {_BOLD}{len(all_games)}{_RESET}")

    # Run each enabled strategy
    all_recs: list[dict] = []

    for strat_key, strat_cfg in strategies_cfg.items():
        if not strat_cfg.get("enabled", False):
            continue
        strat_fn = STRATEGIES.get(strat_key)
        if not strat_fn:
            print(f"  {_YELLOW}Unknown strategy: {strat_key}{_RESET}")
            continue

        print(f"  {_DIM}Running {strat_key}...{_RESET}", end=" ", flush=True)
        try:
            recs = strat_fn(all_games, all_standings, config, current_bankroll)
            print(f"{_GREEN}{len(recs)} recommendations{_RESET}")
            all_recs.extend(recs)
        except Exception as exc:
            print(f"{_RED}ERROR: {exc}{_RESET}")

    if not all_recs:
        print(f"\n  {_YELLOW}No recommendations generated.{_RESET}")
        return

    # Deduplicate: same gameId + pick keeps the one with highest edge
    seen: dict[str, dict] = {}
    for rec in all_recs:
        key = f"{rec['gameId']}:{rec['pick']}:{rec['betType']}"
        if key not in seen or rec["edge"] > seen[key]["edge"]:
            seen[key] = rec
    deduped = list(seen.values())

    # Rank by edge descending, take top N
    deduped.sort(key=lambda r: r["edge"], reverse=True)
    selected = deduped[:daily_target]

    print(f"\n  {_BOLD}Selected {len(selected)}/{len(deduped)} unique recommendations:{_RESET}")
    print(f"  {'#':<4} {'Event':<30} {'Pick':<22} {'Odds':>6} {'Edge':>7} {'Stake':>8} {'Strategy':<18}")
    print(f"  {'-' * 100}")

    total_stake = 0.0
    new_bets = []

    for i, rec in enumerate(selected, 1):
        bet_id = f"{dt}-{rec['sport']}-{i:03d}"
        bet = {
            "id": bet_id,
            "date": iso_date,
            "sport": rec["sport"],
            "gameId": rec["gameId"],
            "event": rec["event"],
            "homeTeam": rec["homeTeam"],
            "awayTeam": rec["awayTeam"],
            "betType": rec["betType"],
            "pick": rec["pick"],
            "odds": rec["odds"],
            "impliedProb": rec["impliedProb"],
            "trueProb": rec["trueProb"],
            "edge": rec["edge"],
            "ev": rec["ev"],
            "stake": rec["stake"],
            "payout": rec["payout"],
            "strategy": rec["strategy"],
            "notes": rec["notes"],
            "result": "PENDING",
            "pnl": 0,
            "resolvedAt": None,
        }
        new_bets.append(bet)
        total_stake += rec["stake"]

        edge_color = _GREEN if rec["edge"] > 0.05 else (_YELLOW if rec["edge"] > 0 else _RED)
        print(
            f"  {i:<4} {rec['event']:<30} {rec['pick']:<22} "
            f"{rec['odds']:>+6d} {edge_color}{rec['edge']:>+6.1%}{_RESET} "
            f"${rec['stake']:>7.2f} {_DIM}{rec['strategy']:<18}{_RESET}"
        )

    # Persist
    existing_bets.extend(new_bets)
    save_bets(existing_bets)

    # Update bankroll history (stakes go out, pending until resolved)
    update_bankroll(
        date=iso_date,
        pnl=0,  # PnL is 0 at placement time; updated on resolution
        bets_placed=len(new_bets),
        wins=0,
        losses=0,
        pending=len(new_bets),
    )

    print(f"\n  {_BOLD}Total staked: ${total_stake:,.2f}{_RESET}")
    print(f"  {_GREEN}Wrote {len(new_bets)} bets to data/bets.json{_RESET}")
    print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print()


# ---------------------------------------------------------------------------
# resolve_bets
# ---------------------------------------------------------------------------

def resolve_bets() -> None:
    """
    Resolve all PENDING bets by checking final scores from ESPN.

    1. Load pending bets
    2. Group by (sport, date) to minimize API calls
    3. Fetch scoreboards and match game results
    4. Mark WIN/LOSS, calculate PnL
    5. Update bankroll
    """
    bets = load_bets()
    pending = [b for b in bets if b.get("result") == "PENDING"]

    if not pending:
        print(f"\n  {_YELLOW}No pending bets to resolve.{_RESET}\n")
        return

    print()
    print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print(f"{_BOLD}{_CYAN}  RESOLVING {len(pending)} PENDING BETS{_RESET}")
    print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print()

    # Group pending bets by (sport, date_yyyymmdd) for efficient fetching
    groups: dict[tuple[str, str], list[dict]] = {}
    for bet in pending:
        iso = bet.get("date", "")
        yyyymmdd = iso.replace("-", "")
        key = (bet.get("sport", ""), yyyymmdd)
        groups.setdefault(key, []).append(bet)

    # Fetch scoreboards for each group
    scoreboard_cache: dict[tuple[str, str], list[dict]] = {}
    for (sport, dt), group_bets in groups.items():
        if (sport, dt) not in scoreboard_cache:
            print(f"  {_DIM}Fetching {sport} results for {dt}...{_RESET}", flush=True)
            raw = fetch_scoreboard(sport, dt)
            games = parse_games(raw, sport)
            scoreboard_cache[(sport, dt)] = games

    # Resolve each pending bet
    total_pnl = 0.0
    wins = 0
    losses = 0
    still_pending = 0
    resolved_today = []

    for bet in bets:
        if bet.get("result") != "PENDING":
            continue

        iso = bet.get("date", "")
        yyyymmdd = iso.replace("-", "")
        sport = bet.get("sport", "")
        game_id = bet.get("gameId", "")

        games = scoreboard_cache.get((sport, yyyymmdd), [])
        matched_game = None
        for g in games:
            if g["gameId"] == game_id:
                matched_game = g
                break

        if not matched_game:
            still_pending += 1
            continue

        if matched_game["status"] != "post":
            still_pending += 1
            continue

        winner = matched_game.get("winner")
        if not winner:
            # Try to determine winner from scores
            home_score = int(matched_game["home"].get("score", 0) or 0)
            away_score = int(matched_game["away"].get("score", 0) or 0)
            if home_score > away_score:
                winner = matched_game["home"]["name"]
            elif away_score > home_score:
                winner = matched_game["away"]["name"]
            else:
                still_pending += 1
                continue

        # Handle parlays (pick may be "Team A + Team B + Team C")
        pick = bet.get("pick", "")
        bet_type = bet.get("betType", "")

        if "parlay" in bet_type:
            # For parlays, all legs must win.  We stored combined pick names
            # but only have one gameId -- simplified: check if pick team won
            # In a real system each leg would be tracked separately
            parlay_picks = [p.strip() for p in pick.split("+")]
            # We can only verify the primary game here
            primary_won = any(p == winner for p in parlay_picks)
            if primary_won:
                # Optimistic: mark as win (simplified -- real parlays need all legs)
                bet["result"] = "WIN"
                pnl = bet.get("payout", 0) - bet.get("stake", 0)
            else:
                bet["result"] = "LOSS"
                pnl = -bet.get("stake", 0)
        else:
            # Standard moneyline
            if pick == winner:
                bet["result"] = "WIN"
                pnl = bet.get("payout", 0) - bet.get("stake", 0)
            else:
                bet["result"] = "LOSS"
                pnl = -bet.get("stake", 0)

        bet["pnl"] = round(pnl, 2)
        bet["resolvedAt"] = datetime.now().isoformat()
        total_pnl += pnl
        resolved_today.append(bet)

        if bet["result"] == "WIN":
            wins += 1
        else:
            losses += 1

    # Print results
    if resolved_today:
        print(f"\n  {'ID':<22} {'Event':<30} {'Pick':<22} {'Result':>7} {'P&L':>10}")
        print(f"  {'-' * 95}")
        for b in resolved_today:
            r_color = _GREEN if b["result"] == "WIN" else _RED
            pnl_str = f"{'+'if b['pnl']>=0 else ''}${b['pnl']:,.2f}"
            print(
                f"  {b['id']:<22} {b['event']:<30} {b['pick']:<22} "
                f"{r_color}{b['result']:>7}{_RESET} {r_color}{pnl_str:>10}{_RESET}"
            )

    # Save updated bets
    save_bets(bets)

    # Update bankroll
    if wins + losses > 0:
        bankroll_data = load_bankroll()
        bankroll_data["currentBankroll"] = round(
            bankroll_data["currentBankroll"] + total_pnl, 2
        )

        # Append resolution history entry
        bankroll_data["history"].append({
            "date": _today_iso(),
            "type": "resolution",
            "pnl": round(total_pnl, 2),
            "betsPlaced": 0,
            "wins": wins,
            "losses": losses,
            "pending": still_pending,
            "bankroll": bankroll_data["currentBankroll"],
        })
        save_bankroll(bankroll_data)

    pnl_color = _GREEN if total_pnl >= 0 else _RED
    print(f"\n  {_BOLD}Results:{_RESET}")
    print(f"    {_GREEN}Wins:    {wins}{_RESET}")
    print(f"    {_RED}Losses:  {losses}{_RESET}")
    print(f"    Pending: {still_pending}")
    print(f"    P&L:     {pnl_color}{_BOLD}{'+'if total_pnl>=0 else ''}${total_pnl:,.2f}{_RESET}")
    print(f"    Bankroll: {_BOLD}${load_bankroll()['currentBankroll']:,.2f}{_RESET}")
    print(f"\n{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print()
