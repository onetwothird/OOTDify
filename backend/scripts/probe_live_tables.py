"""Read-only probe: check which tables exist in the live Supabase DB."""
from pathlib import Path

import requests

url = key = None
for line in Path(__file__).resolve().parents[1].joinpath(".env").read_text(
    encoding="utf-8", errors="ignore"
).splitlines():
    line = line.strip()
    if line.startswith("SUPABASE_URL="):
        url = line.split("=", 1)[1].strip().strip('"')
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        key = line.split("=", 1)[1].strip().strip('"')

h = {"apikey": key, "Authorization": "Bearer " + key}
for t in ("outfit_plans", "user_profiles", "saved_outfits", "clothing_items"):
    r = requests.get(f"{url}/rest/v1/{t}?select=id&limit=1", headers=h, timeout=10)
    detail = r.json().get("code") if r.status_code >= 400 else "ok"
    print(t, r.status_code, detail)
