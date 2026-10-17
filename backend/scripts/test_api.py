"""Smoke-test the running Flask API from the command line.

Usage (with the server running):
    cd backend
    .venv\\Scripts\\python scripts\\test_api.py
    .venv\\Scripts\\python scripts\\test_api.py C:\\path\\to\\photo.jpg
    .venv\\Scripts\\python scripts\\test_api.py photo.jpg http://192.168.1.100:5000

/api/detect now requires auth (same as /api/analyze), so pass a Supabase
access token via the OOTDIFY_API_TOKEN env var:
    set OOTDIFY_API_TOKEN=<supabase_access_token>
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

BASE_URL = "http://127.0.0.1:5000"
PHOTO = "scripts/sample_person.jpg"


def auth_headers() -> dict:
    token = os.getenv("OOTDIFY_API_TOKEN", "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}


def main() -> int:
    args = sys.argv[1:]
    photo = Path(args[0]) if args else Path(PHOTO)
    base = args[1] if len(args) > 1 else BASE_URL

    if not photo.exists():
        print(f"[!] Photo not found: {photo} — pass a path to a photo of a person.")
        return 1

    if not auth_headers():
        print("[!] OOTDIFY_API_TOKEN is not set — /api/detect requires auth and will 401.")

    print(f"[*] Uploading {photo} to {base}/api/detect?annotated=true ...")
    with photo.open("rb") as handle:
        resp = requests.post(
            f"{base}/api/detect?annotated=true",
            files={"image": (photo.name, handle, "image/jpeg")},
            headers=auth_headers(),
            timeout=180,
        )

    print(f"[*] HTTP {resp.status_code}")
    if resp.status_code == 401:
        print("[!] Unauthorized — set OOTDIFY_API_TOKEN to a valid Supabase access token.")
        return 1
    data = resp.json()
    print("[*] Response:")
    import json

    print(json.dumps(data, indent=2))

    if not data.get("success"):
        print("[!] Detection failed:", data.get("error"))
        return 1

    if data.get("annotated_image_url"):
        full = base + data["annotated_image_url"]
        print(f"[*] Annotated image: {full}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())