"""
ESPN API client for fetching live scoreboards, standings, and odds.

Uses ESPN's public site API endpoints -- no authentication required.
"""

from __future__ import annotations

import requests
from datetime import datetime
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Sport / league mapping
# ---------------------------------------------------------------------------

SPORT_MAP = {
    "NBA": {"sport": "basketball", "league": "nba"},
    "MLB": {"sport": "baseball",   "league": "mlb"},
    "NHL": {"sport": "hockey",     "league": "nhl"},
}

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "BetSimulator/1.0",
    "Accept": "application/json",
})

REQUEST_TIMEOUT = 15  # seconds


# ---------------------------------------------------------------------------
# Low-level fetchers
# ---------------------------------------------------------------------------

def _get_json(url: str, params: Optional[dict] = None) -> dict:
    """GET *url* and return the parsed JSON, or an empty dict on failure."""
    try:
        resp = _SESSION.get(url, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except (requests.RequestException, ValueError) as exc:
        print(f"\033[91m  [ESPN] Request failed: {url} -- {exc}\033[0m")
        return {}


def fetch_scoreboard(sport_key: str, date: Optional[str] = None) -> dict:
    """
    Fetch the ESPN scoreboard for *sport_key* (e.g. "NBA") on *date*
    (YYYYMMDD).  Returns the raw JSON dict.
    """
    mapping = SPORT_MAP.get(sport_key.upper())
    if not mapping:
        print(f"\033[93m  [ESPN] Unknown sport: {sport_key}\033[0m")
        return {}

    url = (
        f"https://site.api.espn.com/apis/site/v2/sports/"
        f"{mapping['sport']}/{mapping['league']}/scoreboard"
    )
    params = {}
    if date:
        params["dates"] = date
    return _get_json(url, params)


def fetch_standings(sport_key: str) -> dict:
    """
    Fetch current standings for *sport_key*.  Returns the raw JSON dict.
    """
    mapping = SPORT_MAP.get(sport_key.upper())
    if not mapping:
        print(f"\033[93m  [ESPN] Unknown sport: {sport_key}\033[0m")
        return {}

    url = (
        f"https://site.api.espn.com/apis/v2/sports/"
        f"{mapping['sport']}/{mapping['league']}/standings"
    )
    return _get_json(url)


# ---------------------------------------------------------------------------
# Scoreboard parsing
# ---------------------------------------------------------------------------

def _safe_get(d: dict, *keys, default=None):
    """Walk nested dicts/lists safely, returning *default* on any miss."""
    cur = d
    for k in keys:
        try:
            cur = cur[k]
        except (KeyError, IndexError, TypeError):
            return default
    return cur


def _parse_competitor(comp: dict) -> dict:
    """Extract a flat dict from a single competitor entry."""
    team_data = comp.get("team", {})
    record_items = comp.get("records", [])
    overall_record = ""
    home_record = ""
    away_record = ""
    for rec in record_items:
        rec_name = rec.get("name", "").lower()
        rec_type = rec.get("type", "").lower()
        summary = rec.get("summary", "")
        if rec_type == "total" or rec_name == "overall":
            overall_record = summary
        elif rec_name == "home" or rec_type == "home":
            home_record = summary
        elif rec_name == "road" or rec_name == "away" or rec_type == "road":
            away_record = summary

    return {
        "id": team_data.get("id", ""),
        "name": team_data.get("displayName", team_data.get("name", "Unknown")),
        "abbreviation": team_data.get("abbreviation", ""),
        "score": comp.get("score", "0"),
        "winner": comp.get("winner", False),
        "homeAway": comp.get("homeAway", ""),
        "record": overall_record,
        "homeRecord": home_record,
        "awayRecord": away_record,
    }


def _parse_odds(event: dict) -> dict:
    """
    Pull DraftKings odds out of the event's competitions[0].odds array.
    Returns a dict with moneyline, spread, and overUnder info, or empty
    values when odds are unavailable.
    """
    odds_list = _safe_get(event, "competitions", 0, "odds", default=[])
    dk_odds = {}
    for provider in odds_list:
        name = _safe_get(provider, "provider", "name", default="")
        if "draftkings" in name.lower():
            dk_odds = provider
            break
    # Fallback: use first provider if DraftKings not found
    if not dk_odds and odds_list:
        dk_odds = odds_list[0]

    empty = {
        "homeMoneyline": None,
        "awayMoneyline": None,
        "spread": None,
        "spreadOdds": None,
        "spreadAwayOdds": None,
        "overUnder": None,
        "overOdds": None,
        "underOdds": None,
        "provider": None,
    }

    if not dk_odds:
        return empty

    home_ml = None
    away_ml = None

    # Primary path: moneyline.home.close.odds / moneyline.away.close.odds
    ml_obj = dk_odds.get("moneyline", {})
    if ml_obj:
        home_ml = _safe_get(ml_obj, "home", "close", "odds")
        away_ml = _safe_get(ml_obj, "away", "close", "odds")

    # Fallback: homeTeamOdds / awayTeamOdds (older ESPN structure)
    if home_ml is None and away_ml is None:
        home_team_odds = dk_odds.get("homeTeamOdds", {})
        away_team_odds = dk_odds.get("awayTeamOdds", {})
        if home_team_odds:
            home_ml = home_team_odds.get("moneyLine")
        if away_team_odds:
            away_ml = away_team_odds.get("moneyLine")

    # Fallback: parse from "details" string like "PHI -115"
    if home_ml is None and away_ml is None:
        details = dk_odds.get("details", "")
        if details:
            # details often shows the favorite, but we can't reliably
            # extract both lines from it, so skip this fallback
            pass

    # Spread info from pointSpread object
    spread_val = _try_float(dk_odds.get("spread"))
    spread_home_odds = _try_int(_safe_get(dk_odds, "pointSpread", "home", "close", "odds"))
    spread_away_odds = _try_int(_safe_get(dk_odds, "pointSpread", "away", "close", "odds"))

    # Over/under from total object
    over_under = _try_float(dk_odds.get("overUnder"))
    over_odds = _try_int(_safe_get(dk_odds, "total", "over", "close", "odds"))
    under_odds = _try_int(_safe_get(dk_odds, "total", "under", "close", "odds"))

    return {
        "homeMoneyline": _try_int(home_ml),
        "awayMoneyline": _try_int(away_ml),
        "spread": spread_val,
        "spreadOdds": spread_home_odds,
        "spreadAwayOdds": spread_away_odds,
        "overUnder": over_under,
        "overOdds": over_odds,
        "underOdds": under_odds,
        "provider": _safe_get(dk_odds, "provider", "name", default="Unknown"),
    }


def _try_int(val) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _try_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_games(scoreboard: dict, sport_key: str) -> list[dict]:
    """
    Parse the raw scoreboard JSON into a clean list of game dicts.

    Each game dict contains:
        gameId, sport, event, status, startTime,
        home (team dict), away (team dict), odds dict,
        winner (team name or None)
    """
    events = scoreboard.get("events", [])
    games = []

    for event in events:
        try:
            game_id = event.get("id", "")
            name = event.get("name", "")
            short_name = event.get("shortName", name)

            competition = _safe_get(event, "competitions", 0, default={})
            status_obj = competition.get("status", event.get("status", {}))
            status_type = _safe_get(status_obj, "type", "name", default="STATUS_UNKNOWN")
            status_desc = _safe_get(status_obj, "type", "description", default="Unknown")
            start_time = competition.get("date", event.get("date", ""))

            # Map ESPN status names to simple categories
            if status_type in ("STATUS_SCHEDULED", "STATUS_PREGAME"):
                status_cat = "pre"
            elif status_type in ("STATUS_FINAL", "STATUS_FULL_TIME",
                                 "STATUS_FINAL_OVERTIME", "STATUS_POSTPONED",
                                 "STATUS_CANCELED", "STATUS_END_PERIOD"):
                status_cat = "post"
            else:
                status_cat = "in"

            # Parse competitors
            competitors = competition.get("competitors", [])
            home = {}
            away = {}
            winner_name = None

            for comp in competitors:
                parsed = _parse_competitor(comp)
                if parsed["homeAway"] == "home":
                    home = parsed
                else:
                    away = parsed
                if parsed["winner"] is True and status_cat == "post":
                    winner_name = parsed["name"]

            odds = _parse_odds(event)

            games.append({
                "gameId": game_id,
                "sport": sport_key.upper(),
                "event": short_name,
                "status": status_cat,
                "statusDetail": status_desc,
                "startTime": start_time,
                "home": home,
                "away": away,
                "odds": odds,
                "winner": winner_name,
            })
        except Exception as exc:
            print(f"\033[93m  [ESPN] Skipping malformed event: {exc}\033[0m")
            continue

    return games


# ---------------------------------------------------------------------------
# Standings parsing
# ---------------------------------------------------------------------------

def parse_standings(raw: dict, sport_key: str) -> dict:
    """
    Parse standings JSON into a dict keyed by team display name.

    Each value contains:
        wins, losses, winPct, streak, last10, pointDiff,
        homeRecord, awayRecord, divisionRecord, conferenceRecord
    """
    teams = {}

    children = raw.get("children", [])
    for group in children:
        # Each group is a conference/division
        standings_list = _safe_get(group, "standings", "entries", default=[])
        if not standings_list:
            # Try one level deeper (some sports nest by division)
            for subgroup in group.get("children", []):
                standings_list += _safe_get(subgroup, "standings", "entries", default=[])

        for entry in standings_list:
            try:
                team_info = entry.get("team", {})
                team_name = team_info.get("displayName", team_info.get("name", "Unknown"))

                stats_list = entry.get("stats", [])
                stats = {}
                for s in stats_list:
                    stat_name = s.get("name", s.get("abbreviation", ""))
                    stat_val = s.get("value", s.get("displayValue", ""))
                    stats[stat_name] = stat_val
                    # Also store by abbreviation for easier lookup
                    abbr = s.get("abbreviation", "")
                    if abbr:
                        stats[abbr] = stat_val

                wins = _try_float(stats.get("wins", stats.get("W", 0))) or 0
                losses = _try_float(stats.get("losses", stats.get("L", 0))) or 0
                total = wins + losses
                win_pct = wins / total if total > 0 else 0.5

                # Point / run / goal differential
                diff = _try_float(
                    stats.get("pointDifferential",
                    stats.get("differential",
                    stats.get("DIFF",
                    stats.get("runDifferential",
                    stats.get("goalDifferential", 0)))))
                ) or 0.0

                # Streak
                streak_raw = stats.get("streak", stats.get("STRK", ""))
                if isinstance(streak_raw, (int, float)):
                    streak_raw = str(int(streak_raw))

                # Last 10 / recent record
                last10 = stats.get("Last Ten Games Record",
                         stats.get("record",
                         stats.get("L10", "")))
                if isinstance(last10, (int, float)):
                    last10 = ""

                # Home / road records
                home_rec = stats.get("Home",
                           stats.get("homeRecord",
                           stats.get("HOME", "")))
                road_rec = stats.get("Road",
                           stats.get("awayRecord",
                           stats.get("AWAY",
                           stats.get("Away", ""))))

                # Division / conference records
                div_rec = stats.get("vs. Division",
                          stats.get("divisionRecord",
                          stats.get("DIV", "")))
                conf_rec = stats.get("vs. Conference",
                           stats.get("conferenceRecord",
                           stats.get("CONF", "")))

                teams[team_name] = {
                    "sport": sport_key.upper(),
                    "wins": int(wins),
                    "losses": int(losses),
                    "winPct": round(win_pct, 4),
                    "pointDiff": round(diff, 1),
                    "streak": str(streak_raw),
                    "last10": str(last10),
                    "homeRecord": str(home_rec),
                    "awayRecord": str(road_rec),
                    "divisionRecord": str(div_rec),
                    "conferenceRecord": str(conf_rec),
                }
            except Exception as exc:
                print(f"\033[93m  [ESPN] Skipping standings entry: {exc}\033[0m")
                continue

    return teams
