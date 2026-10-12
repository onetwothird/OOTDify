"""Smoke-test the recommendation + outfit-composition stack against the live catalog.

Loads a balanced slice of `public.clothing`, ranks it with the rule-based
scorer, composes complete looks, and prints a couple of outfits including real
image URLs. No HTTP/auth involved (service-role client, like the API backend).

Usage (from the backend/ folder, with the venv active):

    python scripts/smoke_outfits.py [occasion] [--count 3]

Example:

    python scripts/smoke_outfits.py Casual --count 2
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.catalog_service import catalog_stats, load_candidates  # noqa: E402
from services.outfit_service import compose  # noqa: E402
from services.recommender_service import recommend  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test the compose stack against the live catalog.")
    parser.add_argument("occasion", nargs="?", default="Casual")
    parser.add_argument("--count", type=int, default=2)
    args = parser.parse_args()

    rows = load_candidates()
    if not rows:
        print("[!] Catalog is empty — run scripts/ingest_fashion.py first.")
        return 1

    ranked = recommend(rows, {}, args.occasion or None, limit=len(rows))
    outfits = compose(ranked, occasion=args.occasion or None, count=args.count, seed=1234)

    print(f"[*] Pool: {len(ranked)} items — {catalog_stats(ranked)}")
    print(f"[*] Composed {len(outfits)} outfit(s) for “{args.occasion}”\n")
    for outfit in outfits:
        print(f"  {outfit['id']}  score={outfit['score']}  {outfit['reason']}")
        for item in outfit["items"]:
            image = item.get("image_url") or "(no image)"
            print(f"    - {item.get('category')} / {item.get('subcategory'):12} "
                  f"{item.get('name', '')[:40]}")
            print(f"      {image}")
        if outfit["missing"]:
            print(f"    missing: {', '.join(outfit['missing'])}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())