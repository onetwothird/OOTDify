# CLAUDE.md

> Full agent instructions live in [AGENTS.md](./AGENTS.md). **Read it before
> writing any code** — this repo intentionally keeps most guidance there so it
> applies to every AI agent, not just Claude Code.

## Workspace setup

The Claude Code workspace enables the Expo plugin via `.claude/settings.json`
(`expo@claude-plugins-official`). No additional setup is required.

## Key facts

- **Expo has changed.** Read the exact versioned docs at
  https://docs.expo.dev/versions/v56.0.0/ before writing any code.
- TypeScript end to end. Run `npx tsc --noEmit` before finishing a task, then
  `npm test` (Jest) and `cd backend && python -m pytest -q` (backend tests).
- The Flask AI backend lives in `backend/` — run `python app.py` and verify
  `http://127.0.0.1:5000/health` returns `{"status":"ok", ...}`.
- One conventional commit per file (`feat|fix|docs|chore|refactor|test|style`
  with a scope), matching the repo's commit history.