"""
CLI entry point: python -m agent [place|resolve|status|push]
"""

from __future__ import annotations

import sys
import subprocess
from pathlib import Path

from .simulator import place_bets, resolve_bets
from .bankroll import print_status


def _get_repo_root() -> Path:
    """Return the bet-simulator repo root (parent of agent/)."""
    return Path(__file__).resolve().parent.parent


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m agent [place|resolve|status|push]")
        print()
        print("Commands:")
        print("  place    Fetch today's games and place bets")
        print("  resolve  Check results and resolve pending bets")
        print("  status   Print bankroll summary")
        print("  push     Git add/commit/push the data/ directory")
        sys.exit(1)

    command = sys.argv[1].lower()
    repo_root = str(_get_repo_root())

    if command == "place":
        # Optional: pass a date argument (YYYYMMDD)
        target_date = sys.argv[2] if len(sys.argv) > 2 else None
        place_bets(target_date)

    elif command == "resolve":
        resolve_bets()

    elif command == "status":
        print_status()

    elif command == "push":
        print("Pushing data/ to git...")
        subprocess.run(["git", "add", "data/"], cwd=repo_root)
        subprocess.run(
            ["git", "commit", "-m", "Update betting data"],
            cwd=repo_root,
        )
        subprocess.run(["git", "push"], cwd=repo_root)

    else:
        print(f"Unknown command: {command}")
        print("Valid commands: place, resolve, status, push")
        sys.exit(1)


if __name__ == "__main__":
    main()
