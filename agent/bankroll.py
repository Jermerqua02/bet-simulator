"""
Bankroll management: load/save bankroll state, calculate stats, pretty-print.
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Union

# Repo root is two levels up from this file: agent/ -> bet-simulator/
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

# ANSI colour helpers
_GREEN = "\033[92m"
_RED = "\033[91m"
_YELLOW = "\033[93m"
_CYAN = "\033[96m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RESET = "\033[0m"


# ---------------------------------------------------------------------------
# JSON I/O
# ---------------------------------------------------------------------------

def _read_json(path: Path) -> dict | list:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


# ---------------------------------------------------------------------------
# Bankroll
# ---------------------------------------------------------------------------

def load_bankroll() -> dict:
    data = _read_json(DATA_DIR / "bankroll.json")
    if not data:
        data = {
            "startingBankroll": 10000,
            "currentBankroll": 10000,
            "history": [],
        }
    return data


def save_bankroll(data: dict) -> None:
    _write_json(DATA_DIR / "bankroll.json", data)


def update_bankroll(
    date: str,
    pnl: float,
    bets_placed: int,
    wins: int,
    losses: int,
    pending: int,
) -> dict:
    """Update the bankroll history for *date*, merging into an existing entry if one exists."""
    data = load_bankroll()
    data["currentBankroll"] = round(data["currentBankroll"] + pnl, 2)

    # Find existing entry for this date and merge, or create new
    existing = None
    for entry in data["history"]:
        if entry.get("date") == date and "type" not in entry:
            existing = entry
            break

    if existing:
        existing["pnl"] = round(existing.get("pnl", 0) + pnl, 2)
        existing["betsPlaced"] = bets_placed or existing.get("betsPlaced", 0)
        existing["wins"] = existing.get("wins", 0) + wins
        existing["losses"] = existing.get("losses", 0) + losses
        existing["pending"] = pending
        existing["bankroll"] = data["currentBankroll"]
    else:
        data["history"].append({
            "date": date,
            "pnl": round(pnl, 2),
            "betsPlaced": bets_placed,
            "wins": wins,
            "losses": losses,
            "pending": pending,
            "bankroll": data["currentBankroll"],
        })

    save_bankroll(data)
    return data


# ---------------------------------------------------------------------------
# Bets I/O
# ---------------------------------------------------------------------------

def load_bets() -> list:
    data = _read_json(DATA_DIR / "bets.json")
    if isinstance(data, dict):
        return data.get("bets", [])
    return []


def save_bets(bets: list) -> None:
    _write_json(DATA_DIR / "bets.json", {"bets": bets})


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def get_sport_roi(bets: list) -> dict:
    """Return ROI broken down by sport from a list of bet dicts."""
    sport_totals: dict[str, dict] = {}
    for bet in bets:
        if bet.get("result") not in ("WIN", "LOSS"):
            continue
        sport = bet.get("sport", "UNKNOWN")
        if sport not in sport_totals:
            sport_totals[sport] = {"wagered": 0.0, "pnl": 0.0}
        sport_totals[sport]["wagered"] += bet.get("stake", 0)
        sport_totals[sport]["pnl"] += bet.get("pnl", 0)

    roi = {}
    for sport, t in sport_totals.items():
        if t["wagered"] > 0:
            roi[sport] = t["pnl"] / t["wagered"]
        else:
            roi[sport] = 0.0
    return roi


def get_stats() -> dict:
    """Calculate comprehensive bankroll statistics."""
    br = load_bankroll()
    bets = load_bets()

    resolved = [b for b in bets if b.get("result") in ("WIN", "LOSS")]
    wins = [b for b in resolved if b["result"] == "WIN"]
    losses = [b for b in resolved if b["result"] == "LOSS"]
    pending = [b for b in bets if b.get("result") == "PENDING"]

    total_wagered = sum(b.get("stake", 0) for b in resolved)
    total_pnl = sum(b.get("pnl", 0) for b in resolved)
    roi = total_pnl / total_wagered if total_wagered > 0 else 0.0
    win_rate = len(wins) / len(resolved) if resolved else 0.0

    # Best / worst day from history
    history = br.get("history", [])
    best_day = max(history, key=lambda h: h.get("pnl", 0)) if history else None
    worst_day = min(history, key=lambda h: h.get("pnl", 0)) if history else None

    # Current streak
    streak = 0
    streak_type = ""
    for b in reversed(resolved):
        if not streak_type:
            streak_type = b["result"]
            streak = 1
        elif b["result"] == streak_type:
            streak += 1
        else:
            break

    # Per-strategy stats
    strategy_stats = {}
    for b in resolved:
        strat = b.get("strategy", "unknown")
        if strat not in strategy_stats:
            strategy_stats[strat] = {"wins": 0, "losses": 0, "pnl": 0.0, "wagered": 0.0}
        s = strategy_stats[strat]
        s["wagered"] += b.get("stake", 0)
        s["pnl"] += b.get("pnl", 0)
        if b["result"] == "WIN":
            s["wins"] += 1
        else:
            s["losses"] += 1

    for strat, s in strategy_stats.items():
        total = s["wins"] + s["losses"]
        s["winRate"] = s["wins"] / total if total > 0 else 0.0
        s["roi"] = s["pnl"] / s["wagered"] if s["wagered"] > 0 else 0.0

    return {
        "startingBankroll": br.get("startingBankroll", 10000),
        "currentBankroll": br.get("currentBankroll", 10000),
        "totalBets": len(bets),
        "resolved": len(resolved),
        "wins": len(wins),
        "losses": len(losses),
        "pending": len(pending),
        "totalWagered": round(total_wagered, 2),
        "totalPnl": round(total_pnl, 2),
        "roi": round(roi, 4),
        "winRate": round(win_rate, 4),
        "bestDay": best_day,
        "worstDay": worst_day,
        "streak": streak,
        "streakType": streak_type,
        "strategyStats": strategy_stats,
        "sportRoi": get_sport_roi(bets),
    }


# ---------------------------------------------------------------------------
# Pretty-print
# ---------------------------------------------------------------------------

def print_status() -> None:
    """Print a coloured bankroll summary to the terminal."""
    stats = get_stats()

    pnl = stats["totalPnl"]
    pnl_color = _GREEN if pnl >= 0 else _RED
    roi = stats["roi"]
    roi_color = _GREEN if roi >= 0 else _RED

    print()
    print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print(f"{_BOLD}{_CYAN}  BANKROLL STATUS{_RESET}")
    print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print()
    print(f"  Starting Bankroll:  {_BOLD}${stats['startingBankroll']:,.2f}{_RESET}")
    print(f"  Current Bankroll:   {_BOLD}${stats['currentBankroll']:,.2f}{_RESET}")
    print(f"  Total P&L:          {pnl_color}{_BOLD}{'+'if pnl>=0 else ''}${pnl:,.2f}{_RESET}")
    print(f"  ROI:                {roi_color}{_BOLD}{roi:+.2%}{_RESET}")
    print()
    print(f"  {_DIM}Total Bets: {stats['totalBets']}  |  "
          f"Resolved: {stats['resolved']}  |  "
          f"Pending: {stats['pending']}{_RESET}")
    print(f"  {_GREEN}Wins: {stats['wins']}{_RESET}  |  "
          f"{_RED}Losses: {stats['losses']}{_RESET}  |  "
          f"Win Rate: {_BOLD}{stats['winRate']:.1%}{_RESET}")

    if stats["streak"]:
        s_color = _GREEN if stats["streakType"] == "WIN" else _RED
        print(f"  Current Streak:     {s_color}{stats['streak']} {stats['streakType']}{'S' if stats['streak']!=1 else ''}{_RESET}")

    if stats["totalWagered"] > 0:
        print(f"  Total Wagered:      ${stats['totalWagered']:,.2f}")

    # Best / worst day
    if stats["bestDay"]:
        bd = stats["bestDay"]
        print(f"\n  {_GREEN}Best Day:   {bd['date']}  P&L: +${bd['pnl']:,.2f}  "
              f"({bd.get('wins',0)}W-{bd.get('losses',0)}L){_RESET}")
    if stats["worstDay"]:
        wd = stats["worstDay"]
        print(f"  {_RED}Worst Day:  {wd['date']}  P&L: ${wd['pnl']:,.2f}  "
              f"({wd.get('wins',0)}W-{wd.get('losses',0)}L){_RESET}")

    # Strategy breakdown
    if stats["strategyStats"]:
        print(f"\n  {_BOLD}Strategy Breakdown:{_RESET}")
        print(f"  {'Strategy':<20} {'W':>4} {'L':>4} {'Win%':>7} {'P&L':>10} {'ROI':>8}")
        print(f"  {'-'*55}")
        for strat, s in sorted(stats["strategyStats"].items()):
            s_roi_color = _GREEN if s["roi"] >= 0 else _RED
            pnl_str = f"{'+'if s['pnl']>=0 else ''}${s['pnl']:,.2f}"
            print(f"  {strat:<20} {s['wins']:>4} {s['losses']:>4} "
                  f"{s['winRate']:>6.1%} {s_roi_color}{pnl_str:>10}{_RESET} "
                  f"{s_roi_color}{s['roi']:>+7.1%}{_RESET}")

    # Sport ROI
    if stats["sportRoi"]:
        print(f"\n  {_BOLD}Sport ROI:{_RESET}")
        for sport, sroi in sorted(stats["sportRoi"].items()):
            s_color = _GREEN if sroi >= 0 else _RED
            print(f"    {sport:<6} {s_color}{sroi:+.2%}{_RESET}")

    print(f"\n{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
    print()
