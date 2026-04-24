"""
Odds conversion, true-probability modelling, and expected-value calculations.
"""

from __future__ import annotations

from typing import Optional, Tuple


# ---------------------------------------------------------------------------
# Home-court / home-field / home-ice advantage adjustments
# ---------------------------------------------------------------------------

HOME_ADVANTAGE = {
    "NBA": 0.035,   # +3.5%
    "MLB": 0.040,   # +4.0%
    "NHL": 0.030,   # +3.0%
}


# ---------------------------------------------------------------------------
# Odds conversion helpers
# ---------------------------------------------------------------------------

def american_to_implied(odds: int) -> float:
    """
    Convert American odds to implied probability (0-1).

    -150 -> 0.60   (bet 150 to win 100)
    +150 -> 0.40   (bet 100 to win 150)
    """
    if odds is None:
        return 0.5
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)
    elif odds > 0:
        return 100 / (odds + 100)
    else:
        return 0.5


def implied_to_american(prob: float) -> int:
    """
    Convert implied probability (0-1) to American odds.
    """
    if prob <= 0 or prob >= 1:
        return 0
    if prob >= 0.5:
        return int(-100 * prob / (1 - prob))
    else:
        return int(100 * (1 - prob) / prob)


def american_to_decimal(odds: int) -> float:
    """
    Convert American odds to decimal odds.

    -150 -> 1.6667   (bet 1, get back 1.6667)
    +150 -> 2.50     (bet 1, get back 2.50)
    """
    if odds is None:
        return 2.0
    if odds < 0:
        return 1 + (100 / abs(odds))
    elif odds > 0:
        return 1 + (odds / 100)
    else:
        return 2.0


def decimal_to_american(dec: float) -> int:
    """Convert decimal odds back to American."""
    if dec <= 1.0:
        return 0
    if dec < 2.0:
        return int(-100 / (dec - 1))
    else:
        return int((dec - 1) * 100)


# ---------------------------------------------------------------------------
# Record parsing
# ---------------------------------------------------------------------------

def _parse_record(record_str: str) -> tuple[int, int]:
    """
    Parse a record string like '42-28' or '42-28-4' into (wins, losses).
    The third number (OT losses for NHL) is ignored.
    """
    if not record_str or not isinstance(record_str, str):
        return (0, 0)
    parts = record_str.strip().split("-")
    try:
        wins = int(parts[0])
        losses = int(parts[1]) if len(parts) > 1 else 0
        return (wins, losses)
    except (ValueError, IndexError):
        return (0, 0)


def _record_to_pct(record_str: str) -> float:
    """Convert a 'W-L' record string to a win percentage."""
    w, l = _parse_record(record_str)
    total = w + l
    return w / total if total > 0 else 0.5


# ---------------------------------------------------------------------------
# True probability model
# ---------------------------------------------------------------------------

def calculate_true_probability(
    team_name: str,
    opponent_name: str,
    standings: dict,
    is_home: bool = True,
    sport: str = "NBA",
) -> float:
    """
    Build a blended "true probability" estimate for *team_name* beating
    *opponent_name*.

    Model blend:
        50%  adjusted win-percentage (uses home/road splits + HA boost)
        25%  recent form (last-10 record)
        25%  point-differential-based estimate

    Returns a probability between 0.05 and 0.95 (clamped).
    """
    team_stats = standings.get(team_name, {})
    opp_stats = standings.get(opponent_name, {})

    # ---- Component 1: Adjusted Win % (50%) ---------------------------------
    if is_home:
        team_rec = team_stats.get("homeRecord", "")
        opp_rec = opp_stats.get("awayRecord", "")
    else:
        team_rec = team_stats.get("awayRecord", "")
        opp_rec = opp_stats.get("homeRecord", "")

    team_pct = _record_to_pct(team_rec) if team_rec else team_stats.get("winPct", 0.5)
    opp_pct = _record_to_pct(opp_rec) if opp_rec else opp_stats.get("winPct", 0.5)

    # Log5 formula: P(A beats B) = (pA - pA*pB) / (pA + pB - 2*pA*pB)
    pa, pb = float(team_pct), float(opp_pct)
    denom = pa + pb - 2 * pa * pb
    if abs(denom) < 1e-9:
        base_pct = 0.5
    else:
        base_pct = (pa - pa * pb) / denom

    # Home advantage
    ha = HOME_ADVANTAGE.get(sport.upper(), 0.035)
    if is_home:
        adjusted_pct = base_pct + ha
    else:
        adjusted_pct = base_pct - ha

    # ---- Component 2: Recent Form (25%) ------------------------------------
    team_l10 = team_stats.get("last10", "")
    opp_l10 = opp_stats.get("last10", "")
    team_recent = _record_to_pct(team_l10) if team_l10 else 0.5
    opp_recent = _record_to_pct(opp_l10) if opp_l10 else 0.5
    # Simple relative form
    form_prob = 0.5 + (team_recent - opp_recent) * 0.5

    # ---- Component 3: Differential-Based (25%) -----------------------------
    team_diff = float(team_stats.get("pointDiff", 0))
    opp_diff = float(opp_stats.get("pointDiff", 0))

    # Approximate: every ~3 points of differential gap ~ 10% win prob swing
    # (rough heuristic, works decently across NBA/MLB/NHL)
    diff_gap = team_diff - opp_diff
    team_games = team_stats.get("wins", 0) + team_stats.get("losses", 0)
    opp_games = opp_stats.get("wins", 0) + opp_stats.get("losses", 0)

    # Normalize to per-game differential
    if team_games > 0:
        team_diff_pg = team_diff / team_games
    else:
        team_diff_pg = 0
    if opp_games > 0:
        opp_diff_pg = opp_diff / opp_games
    else:
        opp_diff_pg = 0

    pg_gap = team_diff_pg - opp_diff_pg
    diff_prob = 0.5 + (pg_gap * 0.033)  # ~3.3% per per-game point of diff

    # ---- Blend --------------------------------------------------------------
    true_prob = (0.50 * adjusted_pct) + (0.25 * form_prob) + (0.25 * diff_prob)

    # Clamp to [0.05, 0.95]
    return max(0.05, min(0.95, true_prob))


# ---------------------------------------------------------------------------
# Edge & expected value
# ---------------------------------------------------------------------------

def calculate_edge(true_prob: float, implied_prob: float) -> float:
    """Edge = trueProb - impliedProb.  Positive means we have an advantage."""
    return true_prob - implied_prob


def calculate_ev(odds: int, true_prob: float, stake: float) -> float:
    """
    Expected value of a bet.

    EV = (trueProb * netProfit) - ((1 - trueProb) * stake)
    """
    payout = calculate_payout(odds, stake)
    net_profit = payout - stake
    return (true_prob * net_profit) - ((1 - true_prob) * stake)


# ---------------------------------------------------------------------------
# Spread & totals probability helpers
# ---------------------------------------------------------------------------

# Sport-specific spread factors (points of spread per % probability adjustment)
SPREAD_FACTOR = {
    "NBA": 0.028,   # ~2.8% per point of spread
    "MLB": 0.10,    # ~10% per run on run line
    "NHL": 0.10,    # ~10% per goal on puck line
}


def spread_cover_probability(win_prob: float, spread_line: float, sport: str = "NBA") -> float:
    """
    Estimate probability of covering a spread given moneyline win probability.

    If win_prob = 0.65 and spread = -3.5 (favorite by 3.5), the team needs to
    win by 4+, which is harder than just winning.

    spread_line is from the bettor's perspective:
      -3.5 means the team is favored (must win by 4+)
      +3.5 means the team is underdog (can lose by 3 and still cover)
    """
    factor = SPREAD_FACTOR.get(sport.upper(), 0.03)
    # Negative spread = harder to cover, positive = easier
    # adjustment = spread * factor (negative spread reduces probability)
    adjustment = spread_line * factor
    cover_prob = win_prob + adjustment
    return max(0.05, min(0.95, cover_prob))


def total_probability(
    team_diff_pg: float,
    opp_diff_pg: float,
    line: float,
    sport: str = "NBA",
) -> float:
    """
    Estimate probability that the total score goes OVER the line.

    Uses per-game point differentials as a proxy for scoring pace.
    Higher combined differentials suggest higher-scoring games.
    """
    # League average total scores
    LEAGUE_AVG_TOTAL = {
        "NBA": 224.0,
        "MLB": 8.5,
        "NHL": 5.8,
    }
    avg_total = LEAGUE_AVG_TOTAL.get(sport.upper(), 200)

    # Offensive proxy: teams with positive differential tend to score more
    # Combine both teams' differentials to estimate total scoring
    combined_diff = team_diff_pg + opp_diff_pg

    # Scale factor: how much differential affects total
    TOTAL_SCALE = {
        "NBA": 0.8,   # differential translates strongly to total
        "MLB": 0.3,
        "NHL": 0.4,
    }
    scale = TOTAL_SCALE.get(sport.upper(), 0.5)

    projected_total = avg_total + (combined_diff * scale)

    # Convert projected total vs line to probability
    # Using a sigmoid-like function based on distance from line
    diff_from_line = projected_total - line

    # Sensitivity: how much each point of difference changes probability
    SENSITIVITY = {
        "NBA": 0.04,   # each point = ~4% probability shift
        "MLB": 0.08,
        "NHL": 0.07,
    }
    sens = SENSITIVITY.get(sport.upper(), 0.05)

    over_prob = 0.5 + (diff_from_line * sens)
    return max(0.05, min(0.95, over_prob))


def calculate_payout(odds: int, stake: float) -> float:
    """
    Total payout (stake + profit) if the bet wins.
    """
    dec = american_to_decimal(odds)
    return round(stake * dec, 2)
