"""Remove duplicated seed rows from public.clothing (Phase 3.1 repair).

Background: the original schema.sql seed insert used `on conflict do nothing`
against a table whose only key is a random generated id — so every re-run of
the file duplicated all 10 seed rows. schema.sql is now guarded, but rows
already duplicated in the live DB must be cleaned up manually.

Safety model:
  1. Group seed rows (metadata.source = 'seed') by (name, image_url).
  2. Keep the earliest row of each group; back up every row to be deleted
     (JSON, backend/data/) BEFORE deleting, so the operation is reversible.
  3. Repoint all references (recently_viewed, clothing_items.clothing_id,
     favorites, saved_outfits.clothing_ids, try_on_jobs.clothing_ids) from
     the duplicates to the kept row, so no user data dangles or disappears.
  4. Delete only rows that are in a duplicate group. Never touches
     kaggle/HF-ingested rows.

Run:
    cd backend
    python scripts/cleanup_seed_duplicates.py [--dry-run]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.supabase_client import get_supabase  # noqa: E402

DRY_RUN = "--dry-run" in sys.argv


def main() -> int:
    sb = get_supabase()

    rows = (
        sb.table("clothing")
        .select("id,name,image_url,created_at,metadata")
        .eq("metadata->>source", "seed")
        .execute()
        .data
        or []
    )

    # --- group duplicates ---------------------------------------------------
    groups: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        groups.setdefault((r["name"], r.get("image_url") or ""), []).append(r)

    dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
    to_delete: dict[str, dict] = {}  # id -> row
    keep_of_group: dict[str, str] = {}  # deleted id -> kept id
    for members in dup_groups.values():
        members.sort(key=lambda r: (r.get("created_at") or "", r["id"]))
        keeper = members[0]
        for dupe in members[1:]:
            to_delete[dupe["id"]] = dupe
            keep_of_group[dupe["id"]] = keeper["id"]

    if not to_delete:
        print("No duplicate seed rows found — nothing to do.")
        return 0

    print(f"Duplicate seed rows to remove: {len(to_delete)} "
          f"(across {len(dup_groups)} distinct items)")

    # --- back up rows before touching anything -----------------------------
    if not DRY_RUN:
        backup_dir = BACKEND_DIR / "data"
        backup_dir.mkdir(exist_ok=True)
        backup_file = backup_dir / (
            f"seed_dedupe_backup_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.json"
        )
        backup_file.write_text(
            json.dumps(list(to_delete.values()), indent=2, default=str),
            encoding="utf-8",
        )
        print(f"Backup written: {backup_file}")

    def remap(ids: list) -> list:
        """Replace deleted ids with their keeper, preserving order."""
        return [keep_of_group.get(i, i) if isinstance(i, str) else i for i in ids]

    # --- repoint references --------------------------------------------------
    repointed = 0

    # recently_viewed (unique(user_id, clothing_id) — fall back to deleting the source row)
    for rv in sb.table("recently_viewed").select("id,user_id,clothing_id").execute().data or []:
        if rv["clothing_id"] in keep_of_group:
            if DRY_RUN:
                repointed += 1
                continue
            new_cid = keep_of_group[rv["clothing_id"]]
            clash = (
                sb.table("recently_viewed")
                .select("id")
                .eq("user_id", rv["user_id"])
                .eq("clothing_id", new_cid)
                .limit(1)
                .execute()
                .data
            )
            if clash:
                sb.table("recently_viewed").delete().eq("id", rv["id"]).execute()
            else:
                sb.table("recently_viewed").update({"clothing_id": new_cid}).eq("id", rv["id"]).execute()
            repointed += 1

    # clothing_items.clothing_id (on delete set null — repoint instead)
    for it in sb.table("clothing_items").select("id,clothing_id").execute().data or []:
        if it.get("clothing_id") in keep_of_group:
            if DRY_RUN:
                repointed += 1
                continue
            sb.table("clothing_items").update(
                {"clothing_id": keep_of_group[it["clothing_id"]]}
            ).eq("id", it["id"]).execute()
            repointed += 1

    # favorites (unique(user_id, target_type, target_id) — clash => delete source)
    for fav in sb.table("favorites").select("id,user_id,target_type,target_id").execute().data or []:
        if fav["target_type"] == "clothing" and fav["target_id"] in keep_of_group:
            if DRY_RUN:
                repointed += 1
                continue
            new_tid = keep_of_group[fav["target_id"]]
            clash = (
                sb.table("favorites")
                .select("id")
                .eq("user_id", fav["user_id"])
                .eq("target_type", "clothing")
                .eq("target_id", new_tid)
                .limit(1)
                .execute()
                .data
            )
            if clash:
                sb.table("favorites").delete().eq("id", fav["id"]).execute()
            else:
                sb.table("favorites").update({"target_id": new_tid}).eq("id", fav["id"]).execute()
            repointed += 1

    # jsonb id lists (saved_outfits, try_on_jobs)
    for table in ("saved_outfits", "try_on_jobs"):
        for row in sb.table(table).select("id,clothing_ids").execute().data or []:
            ids = row.get("clothing_ids") or []
            if any(i in keep_of_group for i in ids if isinstance(i, str)):
                if DRY_RUN:
                    repointed += 1
                    continue
                sb.table(table).update({"clothing_ids": remap(ids)}).eq("id", row["id"]).execute()
                repointed += 1

    print(f"References repointed to keeper rows: {repointed}")

    # --- delete duplicates ---------------------------------------------------
    if DRY_RUN:
        print("DRY RUN — no rows deleted.")
        return 0

    for dupe_id, dupe in to_delete.items():
        sb.table("clothing").delete().eq("id", dupe_id).execute()
    print(f"Deleted {len(to_delete)} duplicate seed rows.")

    # --- verify ---------------------------------------------------------------
    remaining = (
        sb.table("clothing").select("id,name,image_url,metadata")
        .eq("metadata->>source", "seed")
        .execute().data or []
    )
    seen: set[tuple[str, str]] = set()
    still_duped = []
    for r in remaining:
        key = (r["name"], r.get("image_url") or "")
        if key in seen:
            still_duped.append(r["name"])
        seen.add(key)
    if still_duped:
        print(f"FAIL — duplicates remain: {still_duped}")
        return 1
    print(f"OK — {len(remaining)} unique seed rows remain, no duplicates.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
