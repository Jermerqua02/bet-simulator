"""
Six betting strategies.

Every strategy function has the same signature:

    strategy(games, standings, config, bankroll) -> list[dict]

Each returned dict is a bet recommendation with all required fields.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from .odds import (
    american_to_implied,
    american_to_decimal,
    decimal_to_american,
    calculate_true_probability,
    calculate_edge,
    calculate_ev,
    calculate_payout,
)
from .bankroll import get_sport_roi


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_bet(
    game: dict,
    bet_type: str,
    pick: str,
    odds: int,
    implied_prob: float,
    true_prob: float,
    stake: float,
    strategy: str,
    notes: str,
) -> dict:
    """Construct a standardized bet recommendation dict."""
    edge = calculate_edge(true_prob, implied_prob)
    return {
        "sport": game["sport"],
        "gameId": game["gameId"],
        "event": game["event"],
        "homeTeam": game["home"].get("name", ""),
        "awayTeam": game["away"].get("name", ""),
        "betType": bet_type,
        "pick": pick,
        "odds": odds,
        "impliedProb": round(implied_prob, 4),
        "trueProb": round(true_prob, 4),
        "edge": round(edge, 4),
        "ev": round(calculate_ev(odds, true_prob, stake), 2),
        "payout": round(calculate_payout(odds, stake), 2),
        "stake": round(stake, 2),
        "strategy": strategy,
        "notes": notes,
    }


def _team_line(game: dict, team_side: str) -> tuple[str, int | None]:
    """Return (team_name, moneyline_odds) for 'home' or 'away'."""
    team = game[team_side]
    ml_key = f"{team_side}Moneyline"
    return team.get("name", ""), game["odds"].get(ml_key)


def _compute_probs(game: dict, standings: dict):
    """
    Return (home_name, away_name, home_ml, away_ml,
            home_implied, away_implied, home_true, away_true).
    """
    home_name, home_ml = _team_line(game, "home")
    away_name, away_ml = _team_line(game, "away")

    if home_ml is None or away_ml is None:
        return None

    home_implied = american_to_implied(home_ml)
    away_implied = american_to_implied(away_ml)
    home_true = calculate_true_probability(
        home_name, away_name, standings, is_home=True, sport=game["sport"]
    )
    away_true = calculate_true_probability(
        away_name, home_name, standings, is_home=False, sport=game["sport"]
    )

    return (
        home_name, away_name,
        home_ml, away_ml,
        home_implied, away_implied,
        home_true, away_true,
    )


# ---------------------------------------------------------------------------
# 1. High Probability  -- moneyline on favorites with model prob > 65%
# ---------------------------------------------------------------------------

def high_probability(games: list, standings: dict, config: dict, bankroll: float) -> list:
    bets = []
    stake = config.get("defaultStake", 25)
    threshold = 0.65

    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        # Pick the side with higher true probability (if above threshold)
        for side, name, ml, imp, tp in [
            ("home", home_name, home_ml, home_implied, home_true),
            ("away", away_name, away_ml, away_implied, away_true),
        ]:
            if tp >= threshold:
                edge = calculate_edge(tp, imp)
                notes = (
                    f"HIGH PROBABILITY: {name} model prob {tp:.1%} exceeds "
                    f"{threshold:.0%} threshold. "
                    f"Implied prob from {ml:+d} line is {imp:.1%}, "
                    f"giving {edge:+.1%} edge. "
                    f"Record: {game[side].get('record', 'N/A')}, "
                    f"{'Home' if side == 'home' else 'Road'} record: "
                    f"{game[side].get('homeRecord' if side == 'home' else 'awayRecord', 'N/A')}."
                )
                bets.append(_build_bet(
                    game, "moneyline", name, ml, imp, tp, stake,
                    "high_probability", notes,
                ))

    return bets


# ---------------------------------------------------------------------------
# 2. Value Hunting  -- largest positive edge, min edge from config
# ---------------------------------------------------------------------------

def value_hunting(games: list, standings: dict, config: dict, bankroll: float) -> list:
    bets = []
    stake = config.get("defaultStake", 25)
    min_edge = config.get("minEdge", 0.03)

    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        for side, name, ml, imp, tp in [
            ("home", home_name, home_ml, home_implied, home_true),
            ("away", away_name, away_ml, away_implied, away_true),
        ]:
            edge = calculate_edge(tp, imp)
            if edge >= min_edge:
                team_stats = standings.get(name, {})
                notes = (
                    f"VALUE HUNT: {name} has {edge:+.1%} edge "
                    f"(model {tp:.1%} vs implied {imp:.1%} from {ml:+d}). "
                    f"Win%: {team_stats.get('winPct', 'N/A')}, "
                    f"Diff: {team_stats.get('pointDiff', 'N/A')}, "
                    f"Last 10: {team_stats.get('last10', 'N/A')}, "
                    f"Streak: {team_stats.get('streak', 'N/A')}. "
                    f"Minimum edge threshold: {min_edge:.1%}."
                )
                bets.append(_build_bet(
                    game, "moneyline", name, ml, imp, tp, stake,
                    "value_hunting", notes,
                ))

    return bets


# ---------------------------------------------------------------------------
# 3. Kelly Criterion  -- size bets using Kelly formula
# ---------------------------------------------------------------------------

def kelly_criterion(games: list, standings: dict, config: dict, bankroll: float) -> list:
    bets = []
    max_pct = config.get("maxStakePercent", 0.05)
    min_edge = config.get("minEdge", 0.03)

    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        for side, name, ml, imp, tp in [
            ("home", home_name, home_ml, home_implied, home_true),
            ("away", away_name, away_ml, away_implied, away_true),
        ]:
            edge = calculate_edge(tp, imp)
            if edge < min_edge:
                continue

            dec_odds = american_to_decimal(ml)
            # Kelly fraction: f* = (p * b - q) / b  where b = dec - 1, p = trueProb
            b = dec_odds - 1
            if b <= 0:
                continue
            kelly_f = (tp * b - (1 - tp)) / b
            if kelly_f <= 0:
                continue

            # Half-Kelly for safety, capped at maxStakePercent
            half_kelly = kelly_f / 2
            fraction = min(half_kelly, max_pct)
            stake = round(bankroll * fraction, 2)

            if stake < 1:
                continue

            notes = (
                f"KELLY CRITERION: {name} -- full Kelly {kelly_f:.2%}, "
                f"half Kelly {half_kelly:.2%}, capped at {max_pct:.1%}. "
                f"Stake = ${stake:.2f} ({fraction:.2%} of ${bankroll:.0f} bankroll). "
                f"Model prob {tp:.1%} vs implied {imp:.1%}, "
                f"edge {edge:+.1%}, decimal odds {dec_odds:.3f}."
                )
            bets.append(_build_bet(
                game, "moneyline", name, ml, imp, tp, stake,
                "kelly_criterion", notes,
            ))

    return bets


# ---------------------------------------------------------------------------
# 4. Safe Parlay  -- 2-3 leg parlays from picks with model prob > 60%
# ---------------------------------------------------------------------------

def safe_parlay(games: list, standings: dict, config: dict, bankroll: float) -> list:
    """Build 2-3 leg parlays from the best high-probability picks."""
    bets = []
    stake = config.get("defaultStake", 25)
    prob_threshold = 0.60

    # Collect all qualifying legs
    legs = []
    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        for side, name, ml, imp, tp in [
            ("home", home_name, home_ml, home_implied, home_true),
            ("away", away_name, away_ml, away_implied, away_true),
        ]:
            if tp >= prob_threshold:
                legs.append({
                    "game": game,
                    "side": side,
                    "name": name,
                    "ml": ml,
                    "implied": imp,
                    "true": tp,
                    "edge": calculate_edge(tp, imp),
                })

    # Sort by true probability descending
    legs.sort(key=lambda x: x["true"], reverse=True)

    # Build parlays of 2 and 3 legs (non-overlapping games)
    used_game_ids = set()

    for parlay_size in (2, 3):
        available = [l for l in legs if l["game"]["gameId"] not in used_game_ids]
        if len(available) < parlay_size:
            continue

        parlay_legs = available[:parlay_size]

        # Combined decimal odds = product of each leg's decimal odds
        combined_decimal = 1.0
        combined_true = 1.0
        combined_implied = 1.0
        leg_descriptions = []

        for leg in parlay_legs:
            dec = american_to_decimal(leg["ml"])
            combined_decimal *= dec
            combined_true *= leg["true"]
            combined_implied *= leg["implied"]
            used_game_ids.add(leg["game"]["gameId"])
            leg_descriptions.append(
                f"{leg['name']} ({leg['ml']:+d}, model {leg['true']:.1%})"
            )

        parlay_american = decimal_to_american(combined_decimal)
        parlay_edge = calculate_edge(combined_true, combined_implied)

        # Build a combined event name
        event_parts = [l["game"]["event"] for l in parlay_legs]
        combined_event = " + ".join(event_parts)

        notes = (
            f"SAFE PARLAY ({parlay_size}-leg): "
            + " | ".join(leg_descriptions)
            + f". Combined odds: {parlay_american:+d} (decimal {combined_decimal:.2f}). "
            + f"Combined true prob: {combined_true:.1%}, "
            + f"combined implied: {combined_implied:.1%}, "
            + f"parlay edge: {parlay_edge:+.1%}. "
            + f"Payout: ${calculate_payout(parlay_american, stake):.2f}."
        )

        # Use the first leg's game for the bet record (parlay is cross-game)
        primary_game = parlay_legs[0]["game"]
        pick_names = " + ".join(l["name"] for l in parlay_legs)

        bets.append(_build_bet(
            primary_game, f"parlay-{parlay_size}leg", pick_names,
            parlay_american, combined_implied, combined_true,
            stake, "safe_parlay", notes,
        ))

    return bets


# ---------------------------------------------------------------------------
# 5. Contrarian  -- underdog picks where model prob > implied + 5%
# ---------------------------------------------------------------------------

def contrarian(games: list, standings: dict, config: dict, bankroll: float) -> list:
    bets = []
    stake = config.get("defaultStake", 25)
    contrarian_edge = 0.05  # model must be at least 5% above implied

    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        for side, name, ml, imp, tp in [
            ("home", home_name, home_ml, home_implied, home_true),
            ("away", away_name, away_ml, away_implied, away_true),
        ]:
            # Must be the underdog (positive odds or higher implied prob for opp)
            is_underdog = ml is not None and ml > 0

            if not is_underdog:
                continue

            edge = calculate_edge(tp, imp)
            if edge < contrarian_edge:
                continue

            team_stats = standings.get(name, {})
            notes = (
                f"CONTRARIAN: {name} is an underdog at {ml:+d} "
                f"(implied {imp:.1%}) but model gives {tp:.1%} "
                f"-- edge of {edge:+.1%} exceeds {contrarian_edge:.0%} threshold. "
                f"Record: {game[side].get('record', 'N/A')}, "
                f"Streak: {team_stats.get('streak', 'N/A')}, "
                f"Last 10: {team_stats.get('last10', 'N/A')}. "
                f"Market may be overreacting to recent narratives."
            )
            bets.append(_build_bet(
                game, "moneyline", name, ml, imp, tp, stake,
                "contrarian", notes,
            ))

    return bets


# ---------------------------------------------------------------------------
# 6. Sport Specialist  -- overweight the sport with best trailing ROI
# ---------------------------------------------------------------------------

def sport_specialist(games: list, standings: dict, config: dict, bankroll: float) -> list:
    """
    Look at historical ROI per sport.  Give extra weight (larger stakes) to
    the sport where the model has been performing best.
    """
    bets = []
    base_stake = config.get("defaultStake", 25)
    min_edge = config.get("minEdge", 0.03)

    # Get historical sport ROI from bankroll data
    from .bankroll import load_bets
    historical_bets = load_bets()
    roi_by_sport = get_sport_roi(historical_bets)

    # Find best sport (default to equal if no history)
    best_sport = None
    best_roi = -999
    for sport, roi in roi_by_sport.items():
        if roi > best_roi:
            best_roi = roi
            best_sport = sport

    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        for side, name, ml, imp, tp in [
            ("home", home_name, home_ml, home_implied, home_true),
            ("away", away_name, away_ml, away_implied, away_true),
        ]:
            edge = calculate_edge(tp, imp)
            if edge < min_edge:
                continue

            # Boost stake for best-performing sport
            is_best = (game["sport"] == best_sport and best_roi > 0)
            multiplier = 1.5 if is_best else 0.8
            stake = round(base_stake * multiplier, 2)

            sport_roi_str = ", ".join(
                f"{s}: {r:+.1%}" for s, r in roi_by_sport.items()
            ) or "No history yet"

            notes = (
                f"SPECIALIST: {name} in {game['sport']} -- "
                f"edge {edge:+.1%} (model {tp:.1%} vs implied {imp:.1%}). "
                f"Historical sport ROI: [{sport_roi_str}]. "
                f"{'BOOSTED stake (best sport)' if is_best else 'Reduced stake (not best sport)'}. "
                f"Stake multiplier: {multiplier}x -> ${stake:.2f}."
            )
            bets.append(_build_bet(
                game, "moneyline", name, ml, imp, tp, stake,
                "sport_specialist", notes,
            ))

    return bets


# ---------------------------------------------------------------------------
# Strategy registry
# ---------------------------------------------------------------------------

STRATEGIES = {
    "high_probability": high_probability,
    "value": value_hunting,
    "kelly": kelly_criterion,
    "parlay": safe_parlay,
    "contrarian": contrarian,
    "specialist": sport_specialist,
}
