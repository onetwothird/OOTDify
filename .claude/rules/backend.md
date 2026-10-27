---
paths:
  - "backend/**/*.py"
  - "backend/.env.example"
  - "backend/Dockerfile"
---

# Backend (Flask AI service)

- **Python:** always `backend/.venv/Scripts/python` (Windows) or
  `backend/.venv/bin/python`. System Python lacks the packages.
- **Route decorators, in order:** `@require_auth` → a limiter from
  `services/ratelimit.py` (`default_limits`, `upload_limits` (15/hour),
  `live_limits`) → `@require_consent`. Read identity from `g.current_user`.
- **Uploads:** `image_service.ingest_upload(...)`, then
  `image_service.cleanup(path)` in a `finally`. Routes keep nothing they don't
  have to.
- **Models:** lazy process-wide singletons (`configure()` in `app.py`,
  `get_*_service()` at call time). Routes never load weights. Tests replace the
  getter.
- **Honest failure:** a missing model or config returns a clear error (e.g.
  empty `TRYON_MODEL_PATH` → "model not configured"), never placeholder output.
- **Config:** new settings go in `config.py` (`os.getenv` with a default) and are
  documented in `.env.example`. Railway injects `PORT`, so never set
  `FLASK_PORT` there.
- Endpoints the app polls or loops on log at `debug`, not `info`.
