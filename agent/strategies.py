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
    spread_cover_probability,
    total_probability,
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
    """Build 2-3 leg parlays from the best high-probability picks (moneyline, spread, totals)."""
    bets = []
    stake = config.get("defaultStake", 25)
    prob_threshold = 0.60

    # Collect all qualifying legs (moneyline, spread, and totals)
    legs = []
    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        odds_data = game.get("odds", {})
        sport = game["sport"]

        # --- Moneyline legs ---
        for side, name, ml, imp, tp in [
            ("home", home_name, home_ml, home_implied, home_true),
            ("away", away_name, away_ml, away_implied, away_true),
        ]:
            if tp >= prob_threshold:
                legs.append({
                    "game": game,
                    "side": side,
                    "name": name,
                    "pick": name,
                    "betType": "moneyline",
                    "ml": ml,
                    "implied": imp,
                    "true": tp,
                    "edge": calculate_edge(tp, imp),
                })

        # --- Spread legs ---
        spread_line = odds_data.get("spread")
        spread_home_odds = odds_data.get("spreadOdds")
        spread_away_odds = odds_data.get("spreadAwayOdds")

        if spread_line is not None:
            if spread_home_odds is not None:
                home_cover = spread_cover_probability(home_true, spread_line, sport)
                home_spread_implied = american_to_implied(spread_home_odds)
                if home_cover >= prob_threshold:
                    legs.append({
                        "game": game,
                        "side": "home",
                        "name": f"{home_name} {spread_line:+g}",
                        "pick": f"{home_name} {spread_line:+g}",
                        "betType": "spread",
                        "ml": spread_home_odds,
                        "implied": home_spread_implied,
                        "true": home_cover,
                        "edge": calculate_edge(home_cover, home_spread_implied),
                    })

            if spread_away_odds is not None:
                away_spread_line = -spread_line
                away_cover = spread_cover_probability(away_true, away_spread_line, sport)
                away_spread_implied = american_to_implied(spread_away_odds)
                if away_cover >= prob_threshold:
                    legs.append({
                        "game": game,
                        "side": "away",
                        "name": f"{away_name} {away_spread_line:+g}",
                        "pick": f"{away_name} {away_spread_line:+g}",
                        "betType": "spread",
                        "ml": spread_away_odds,
                        "implied": away_spread_implied,
                        "true": away_cover,
                        "edge": calculate_edge(away_cover, away_spread_implied),
                    })

        # --- Totals legs ---
        ou_line = odds_data.get("overUnder")
        over_odds = odds_data.get("overOdds")
        under_odds = odds_data.get("underOdds")

        if ou_line is not None:
            home_stats = standings.get(home_name, {})
            away_stats = standings.get(away_name, {})
            home_games = home_stats.get("wins", 0) + home_stats.get("losses", 0)
            away_games = away_stats.get("wins", 0) + away_stats.get("losses", 0)
            home_diff_pg = float(home_stats.get("pointDiff", 0)) / home_games if home_games > 0 else 0
            away_diff_pg = float(away_stats.get("pointDiff", 0)) / away_games if away_games > 0 else 0

            over_prob = total_probability(home_diff_pg, away_diff_pg, ou_line, sport)
            under_prob = 1.0 - over_prob

            if over_odds is not None and over_prob >= prob_threshold:
                over_implied = american_to_implied(over_odds)
                legs.append({
                    "game": game,
                    "side": "over",
                    "name": f"Over {ou_line}",
                    "pick": f"Over {ou_line}",
                    "betType": "over",
                    "ml": over_odds,
                    "implied": over_implied,
                    "true": over_prob,
                    "edge": calculate_edge(over_prob, over_implied),
                })

            if under_odds is not None and under_prob >= prob_threshold:
                under_implied = american_to_implied(under_odds)
                legs.append({
                    "game": game,
                    "side": "under",
                    "name": f"Under {ou_line}",
                    "pick": f"Under {ou_line}",
                    "betType": "under",
                    "ml": under_odds,
                    "implied": under_implied,
                    "true": under_prob,
                    "edge": calculate_edge(under_prob, under_implied),
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
            bet_label = leg.get("betType", "moneyline")
            leg_descriptions.append(
                f"{leg['pick']} [{bet_label}] ({leg['ml']:+d}, model {leg['true']:.1%})"
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
        pick_names = " + ".join(l["pick"] for l in parlay_legs)

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
# 7. Spread Value  -- find spread bets where model cover prob > implied
# ---------------------------------------------------------------------------

def spread_value(games: list, standings: dict, config: dict, bankroll: float) -> list:
    """Find spread bets where our model's cover probability exceeds the implied odds."""
    bets = []
    stake = config.get("defaultStake", 25)
    min_edge = config.get("minEdge", 0.03)

    for game in games:
        info = _compute_probs(game, standings)
        if info is None:
            continue
        (home_name, away_name, home_ml, away_ml,
         home_implied, away_implied, home_true, away_true) = info

        odds_data = game.get("odds", {})
        spread_line = odds_data.get("spread")      # home team spread (e.g., -2.5)
        spread_home_odds = odds_data.get("spreadOdds")
        spread_away_odds = odds_data.get("spreadAwayOdds")

        if spread_line is None:
            continue

        sport = game["sport"]

        # --- Home team spread ---
        if spread_home_odds is not None:
            home_cover = spread_cover_probability(home_true, spread_line, sport)
            home_spread_implied = american_to_implied(spread_home_odds)
            home_edge = calculate_edge(home_cover, home_spread_implied)

            if home_edge >= min_edge:
                pick = f"{home_name} {spread_line:+g}"
                team_stats = standings.get(home_name, {})
                notes = (
                    f"SPREAD VALUE: {pick} -- model cover prob {home_cover:.1%} "
                    f"vs implied {home_spread_implied:.1%} from {spread_home_odds:+d} odds. "
                    f"Edge: {home_edge:+.1%}. "
                    f"Win prob: {home_true:.1%}, spread line: {spread_line:+g}. "
                    f"Record: {game['home'].get('record', 'N/A')}, "
                    f"Diff: {team_stats.get('pointDiff', 'N/A')}."
                )
                bets.append(_build_bet(
                    game, "spread", pick, spread_home_odds,
                    home_spread_implied, home_cover, stake,
                    "spread_value", notes,
                ))

        # --- Away team spread (opposite of home spread) ---
        if spread_away_odds is not None:
            away_spread_line = -spread_line  # away spread is inverse of home
            away_cover = spread_cover_probability(away_true, away_spread_line, sport)
            away_spread_implied = american_to_implied(spread_away_odds)
            away_edge = calculate_edge(away_cover, away_spread_implied)

            if away_edge >= min_edge:
                pick = f"{away_name} {away_spread_line:+g}"
                team_stats = standings.get(away_name, {})
                notes = (
                    f"SPREAD VALUE: {pick} -- model cover prob {away_cover:.1%} "
                    f"vs implied {away_spread_implied:.1%} from {spread_away_odds:+d} odds. "
                    f"Edge: {away_edge:+.1%}. "
                    f"Win prob: {away_true:.1%}, spread line: {away_spread_line:+g}. "
                    f"Record: {game['away'].get('record', 'N/A')}, "
                    f"Diff: {team_stats.get('pointDiff', 'N/A')}."
                )
                bets.append(_build_bet(
                    game, "spread", pick, spread_away_odds,
                    away_spread_implied, away_cover, stake,
                    "spread_value", notes,
                ))

    return bets


# ---------------------------------------------------------------------------
# 8. Totals Hunter  -- find over/under bets with edge
# ---------------------------------------------------------------------------

def totals_hunter(games: list, standings: dict, config: dict, bankroll: float) -> list:
    """Find over/under bets where our model's total probability exceeds implied odds."""
    bets = []
    stake = config.get("defaultStake", 25)
    min_edge = config.get("minEdge", 0.03)

    for game in games:
        odds_data = game.get("odds", {})
        ou_line = odds_data.get("overUnder")
        over_odds = odds_data.get("overOdds")
        under_odds = odds_data.get("underOdds")

        if ou_line is None:
            continue

        sport = game["sport"]
        home_name = game["home"].get("name", "")
        away_name = game["away"].get("name", "")

        home_stats = standings.get(home_name, {})
        away_stats = standings.get(away_name, {})

        # Calculate per-game differentials
        home_games = home_stats.get("wins", 0) + home_stats.get("losses", 0)
        away_games = away_stats.get("wins", 0) + away_stats.get("losses", 0)

        home_diff_pg = float(home_stats.get("pointDiff", 0)) / home_games if home_games > 0 else 0
        away_diff_pg = float(away_stats.get("pointDiff", 0)) / away_games if away_games > 0 else 0

        over_prob = total_probability(home_diff_pg, away_diff_pg, ou_line, sport)
        under_prob = 1.0 - over_prob

        # --- Check OVER ---
        if over_odds is not None:
            over_implied = american_to_implied(over_odds)
            over_edge = calculate_edge(over_prob, over_implied)

            if over_edge >= min_edge:
                pick = f"Over {ou_line}"
                notes = (
                    f"TOTALS HUNTER: {pick} in {game['event']} -- "
                    f"model over prob {over_prob:.1%} vs implied {over_implied:.1%} "
                    f"from {over_odds:+d} odds. Edge: {over_edge:+.1%}. "
                    f"Line: {ou_line}, home diff/g: {home_diff_pg:+.1f}, "
                    f"away diff/g: {away_diff_pg:+.1f}."
                )
                bets.append(_build_bet(
                    game, "over", pick, over_odds,
                    over_implied, over_prob, stake,
                    "totals", notes,
                ))

        # --- Check UNDER ---
        if under_odds is not None:
            under_implied = american_to_implied(under_odds)
            under_edge = calculate_edge(under_prob, under_implied)

            if under_edge >= min_edge:
                pick = f"Under {ou_line}"
                notes = (
                    f"TOTALS HUNTER: {pick} in {game['event']} -- "
                    f"model under prob {under_prob:.1%} vs implied {under_implied:.1%} "
                    f"from {under_odds:+d} odds. Edge: {under_edge:+.1%}. "
                    f"Line: {ou_line}, home diff/g: {home_diff_pg:+.1f}, "
                    f"away diff/g: {away_diff_pg:+.1f}."
                )
                bets.append(_build_bet(
                    game, "under", pick, under_odds,
                    under_implied, under_prob, stake,
                    "totals", notes,
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
    "spread_value": spread_value,
    "totals": totals_hunter,
}
