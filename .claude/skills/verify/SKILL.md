---
name: verify
description: Run the OOTDify verification suite (TypeScript, Jest, ESLint, backend pytest) and report each result. Use before claiming work is done or before committing code.
---

# Verify

Run from the repo root and report each result. Send long output to a file and
read its tail.

1. `npx tsc --noEmit` → no output.
2. `npm test` → all suites pass.
3. `npm run lint` → `0 errors`. Existing warnings are acceptable; new ones in
   files you touched are not.
4. `cd backend && .venv/Scripts/python -m pytest -q` (macOS/Linux:
   `.venv/bin/python`) → all pass.

Only when the change warrants it:

- New route or bundling-sensitive change:
  `npx expo export --platform android --output-dir <scratch dir>`. Expect
  "Android Bundled" and an `.hbc` file. Delete the output afterwards.
- Backend startup touched (`app.py`, `config.py`, model services): run
  `.venv/Scripts/python app.py` in the background, check that
  `http://127.0.0.1:5000/health` returns `{"status":"ok", ...}`, then stop it.

If a step fails, fix the cause (see `/debug-error`) and re-run the whole list.
Never report success for a step you did not run.
