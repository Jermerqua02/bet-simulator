"""
ESPN API client for fetching live scoreboards, standings, and odds.

Uses ESPN's public site API endpoints -- no authentication required.
"""

from __future__ import annotations

import requests
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import re


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

# Cache for athlete name lookups (athlete_id -> display name)
_ATHLETE_CACHE: dict[str, str] = {}

# Prop types we can resolve from box scores, keyed by sport
RESOLVABLE_PROPS: dict[str, set[str]] = {
    "NBA": {
        "Total Points", "Total Assists", "Total Rebounds",
        "Pts + Rebs + Asts",
    },
    "MLB": {
        "Total Strikeouts", "Total Bases",
    },
    "NHL": {
        "Total Goals", "Total Assists", "Total Points",
    },
}

# Map prop type names to the box-score stat key(s) needed for resolution
PROP_STAT_MAP: dict[str, list[str]] = {
    "Total Points": ["points"],
    "Total Assists": ["assists"],
    "Total Rebounds": ["rebounds"],
    "Pts + Rebs + Asts": ["points", "rebounds", "assists"],
    "Total Strikeouts": ["strikeouts"],
    "Total Bases": ["totalBases"],
    "Total Goals": ["goals"],
    # NHL "Total Assists" and "Total Points" use the same keys as NBA
    # but they are sport-contextual; handled in fetch_box_score parsing
}


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


# ---------------------------------------------------------------------------
# Player props
# ---------------------------------------------------------------------------

def _resolve_athlete(ref_url: str) -> tuple[str, str]:
    """
    Fetch an athlete's display name from an ESPN ``$ref`` URL.

    Returns ``(athlete_id, display_name)``.  Results are cached in
    ``_ATHLETE_CACHE`` so we only hit the network once per player.
    """
    # Extract athlete ID from the URL (last numeric segment)
    match = re.search(r"/athletes/(\d+)", ref_url)
    if not match:
        return ("", "Unknown")
    athlete_id = match.group(1)

    if athlete_id in _ATHLETE_CACHE:
        return (athlete_id, _ATHLETE_CACHE[athlete_id])

    data = _get_json(ref_url)
    name = data.get("displayName", data.get("fullName", "Unknown"))
    _ATHLETE_CACHE[athlete_id] = name
    return (athlete_id, name)


def fetch_player_props(sport_key: str, event_id: str) -> list[dict]:
    """
    Fetch player prop bets for a specific game from ESPN's core API.

    ESPN returns props as consecutive pairs: first item is over, second is
    under, sharing the same athlete + prop type + line.  We group them and
    return one dict per prop with both sides' odds.
    """
    mapping = SPORT_MAP.get(sport_key.upper())
    if not mapping:
        return []

    sport = mapping["sport"]
    league = mapping["league"]
    resolvable = RESOLVABLE_PROPS.get(sport_key.upper(), set())

    url = (
        f"http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}"
        f"/events/{event_id}/competitions/{event_id}/odds/100/propBets"
    )
    params = {"lang": "en", "region": "us", "limit": "500"}

    data = _get_json(url, params)
    if not data:
        return []

    items = data.get("items", [])
    props: list[dict] = []

    # ESPN returns props as consecutive over/under pairs for the same
    # athlete + prop type + line.  Group by (athlete_id, prop_type, line)
    # and collect both sides' odds.
    raw_entries: list[dict] = []
    for item in items:
        try:
            prop_type_name = _safe_get(item, "type", "name", default="")
            if prop_type_name not in resolvable:
                continue

            athlete_ref = _safe_get(item, "athlete", "$ref", default="")
            if not athlete_ref:
                continue

            # Extract athlete ID from URL without fetching yet (for grouping)
            match = re.search(r"/athletes/(\d+)", athlete_ref)
            if not match:
                continue
            athlete_id = match.group(1)

            # Line is in odds.total.value
            odds_obj = item.get("odds", {})
            line = _try_float(_safe_get(odds_obj, "total", "value"))
            if line is None:
                # Fallback: try current.target.value
                line = _try_float(_safe_get(item, "current", "target", "value"))
            if line is None:
                continue

            american_str = _safe_get(odds_obj, "american", "value", default="")
            american_odds = _try_int(american_str)
            if american_odds is None:
                continue

            raw_entries.append({
                "athlete_id": athlete_id,
                "athlete_ref": athlete_ref,
                "propType": prop_type_name,
                "line": line,
                "american": american_odds,
            })
        except Exception:
            continue

    # Group consecutive pairs: same (athlete_id, propType, line)
    # First item in pair = over, second = under
    i = 0
    while i < len(raw_entries) - 1:
        a = raw_entries[i]
        b = raw_entries[i + 1]

        if (a["athlete_id"] == b["athlete_id"]
                and a["propType"] == b["propType"]
                and a["line"] == b["line"]):
            # Pair found: first is over, second is under
            over_odds = a["american"]
            under_odds = b["american"]

            # Resolve athlete name (cached after first lookup)
            athlete_id, player_name = _resolve_athlete(a["athlete_ref"])
            if not athlete_id or player_name == "Unknown":
                i += 2
                continue

            over_implied = _implied_from_american(over_odds)
            under_implied = _implied_from_american(under_odds)

            props.append({
                "player": player_name,
                "playerId": athlete_id,
                "propType": a["propType"],
                "line": a["line"],
                "overOdds": over_odds,
                "underOdds": under_odds,
                "overImplied": round(over_implied, 4),
                "underImplied": round(under_implied, 4),
            })
            i += 2
        else:
            # No pair — skip this entry
            i += 1

    return props


def _implied_from_american(odds: int) -> float:
    """Convert American odds to raw implied probability (includes vig)."""
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)
    elif odds > 0:
        return 100 / (odds + 100)
    return 0.5


# ---------------------------------------------------------------------------
# Box score for player prop resolution
# ---------------------------------------------------------------------------

def fetch_box_score(sport_key: str, event_id: str) -> dict[str, dict]:
    """
    Fetch box score from ESPN event summary for resolving player props.

    Returns a dict keyed by player ID, where each value is a dict of
    stat names to numeric values::

        {"1966": {"points": 28, "assists": 7, "rebounds": 9}, ...}
    """
    mapping = SPORT_MAP.get(sport_key.upper())
    if not mapping:
        return {}

    sport = mapping["sport"]
    league = mapping["league"]

    url = (
        f"https://site.api.espn.com/apis/site/v2/sports/"
        f"{sport}/{league}/summary"
    )
    data = _get_json(url, params={"event": event_id})
    if not data:
        return {}

    players: dict[str, dict] = {}

    # The boxscore structure differs by sport; handle each
    boxscore = data.get("boxscore", {})
    sport_upper = sport_key.upper()

    if sport_upper == "NBA":
        players = _parse_nba_box(boxscore)
    elif sport_upper == "MLB":
        players = _parse_mlb_box(boxscore, data)
    elif sport_upper == "NHL":
        players = _parse_nhl_box(boxscore)

    return players


def _parse_nba_box(boxscore: dict) -> dict[str, dict]:
    """Parse NBA box score into {playerId: {points, assists, rebounds, ...}}."""
    players: dict[str, dict] = {}

    for team_block in boxscore.get("players", []):
        for stat_group in team_block.get("statistics", []):
            stat_keys = stat_group.get("keys", [])
            athletes = stat_group.get("athletes", [])

            for athlete in athletes:
                athlete_info = athlete.get("athlete", {})
                pid = athlete_info.get("id", "")
                if not pid:
                    continue

                stats_vals = athlete.get("stats", [])
                stat_dict: dict[str, float] = {}

                for i, key in enumerate(stat_keys):
                    if i < len(stats_vals):
                        val = _try_float(stats_vals[i])
                        if val is not None:
                            stat_dict[key] = val

                # Map ESPN stat keys to our normalized names
                mapped: dict[str, float] = {}
                # NBA keys: points, assists, rebounds (or PTS, AST, REB)
                mapped["points"] = stat_dict.get("points",
                                   stat_dict.get("PTS",
                                   stat_dict.get("pts", 0.0)))
                mapped["assists"] = stat_dict.get("assists",
                                    stat_dict.get("AST",
                                    stat_dict.get("ast", 0.0)))
                mapped["rebounds"] = stat_dict.get("rebounds",
                                     stat_dict.get("REB",
                                     stat_dict.get("reb",
                                     stat_dict.get("totalRebounds", 0.0))))

                players[pid] = mapped

    return players


def _parse_mlb_box(boxscore: dict, full_data: dict) -> dict[str, dict]:
    """Parse MLB box score for batting (totalBases) and pitching (strikeouts)."""
    players: dict[str, dict] = {}

    for team_block in boxscore.get("players", []):
        for stat_group in team_block.get("statistics", []):
            stat_type = stat_group.get("type", "")
            stat_keys = stat_group.get("keys", [])
            athletes = stat_group.get("athletes", [])

            for athlete in athletes:
                athlete_info = athlete.get("athlete", {})
                pid = athlete_info.get("id", "")
                if not pid:
                    continue

                stats_vals = athlete.get("stats", [])
                stat_dict: dict[str, float] = {}

                for i, key in enumerate(stat_keys):
                    if i < len(stats_vals):
                        val = _try_float(stats_vals[i])
                        if val is not None:
                            stat_dict[key] = val

                if pid not in players:
                    players[pid] = {}

                if "batting" in stat_type.lower():
                    # Total bases: singles + 2*doubles + 3*triples + 4*HR
                    # ESPN may provide "totalBases" directly or we calculate
                    tb = stat_dict.get("totalBases",
                         stat_dict.get("TB", None))
                    if tb is not None:
                        players[pid]["totalBases"] = tb
                    else:
                        # Calculate from components if available
                        h = stat_dict.get("hits", stat_dict.get("H", 0))
                        doubles = stat_dict.get("doubles", stat_dict.get("2B", 0))
                        triples = stat_dict.get("triples", stat_dict.get("3B", 0))
                        hr = stat_dict.get("homeRuns", stat_dict.get("HR", 0))
                        singles = h - doubles - triples - hr
                        players[pid]["totalBases"] = singles + 2*doubles + 3*triples + 4*hr

                elif "pitching" in stat_type.lower():
                    so = stat_dict.get("strikeOuts",
                         stat_dict.get("strikeouts",
                         stat_dict.get("SO",
                         stat_dict.get("K", 0))))
                    players[pid]["strikeouts"] = so

    return players


def _parse_nhl_box(boxscore: dict) -> dict[str, dict]:
    """Parse NHL box score into {playerId: {goals, assists, points}}."""
    players: dict[str, dict] = {}

    for team_block in boxscore.get("players", []):
        for stat_group in team_block.get("statistics", []):
            stat_keys = stat_group.get("keys", [])
            athletes = stat_group.get("athletes", [])

            for athlete in athletes:
                athlete_info = athlete.get("athlete", {})
                pid = athlete_info.get("id", "")
                if not pid:
                    continue

                stats_vals = athlete.get("stats", [])
                stat_dict: dict[str, float] = {}

                for i, key in enumerate(stat_keys):
                    if i < len(stats_vals):
                        val = _try_float(stats_vals[i])
                        if val is not None:
                            stat_dict[key] = val

                mapped: dict[str, float] = {}
                mapped["goals"] = stat_dict.get("goals",
                                  stat_dict.get("G", 0.0))
                mapped["assists"] = stat_dict.get("assists",
                                    stat_dict.get("A", 0.0))
                mapped["points"] = stat_dict.get("points",
                                   stat_dict.get("PTS",
                                   stat_dict.get("P", 0.0)))

                players[pid] = mapped

    return players
