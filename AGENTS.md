# AGENTS.md

Guidance for AI agents working in this repository. Read this before writing code.

## Expo HAS CHANGED

Read the versioned docs for the SDK in `package.json` (`expo` dependency,
currently SDK 58): https://docs.expo.dev/versions/v58.0.0/. Do not assume
patterns from older Expo SDKs.

## Repository conventions

- **Feature-first structure.** `src/features/<feature>/` owns types, services,
  hooks, and components; `src/app/` contains routes only (see `README.md`).
- **No fake data.** Screens render real Supabase rows; failures are surfaced
  honestly through the error-aware client (`src/services/apiClient.ts`,
  `ApiError`), never papered over.
- **Private keys never reach the client.** Only `EXPO_PUBLIC_*` variables exist
  in the Expo bundle; the Supabase service-role key lives exclusively in
  `backend/.env`. `backend/.env.example` documents the required variables.
- **Users only see their own data.** User-owned tables and policies scope rows
  by `auth.uid()`; the backend derives identity from the validated session
  token, never from a client-supplied `user_id`.

## Verification (before finishing work)

```bash
npx tsc --noEmit                                  # TypeScript
npm test                                          # Jest
npm run lint                                      # ESLint: 0 errors required
cd backend && .venv/Scripts/python -m pytest -q   # backend (macOS/Linux: .venv/bin/python)
```

The backend must run from `backend/.venv`; system Python lacks its packages.

## Commit style

One conventional commit per file:

- `feat(scope): subject`
- `fix(scope): subject`
- `docs(scope): subject`
- `chore(scope): subject`
- `test(scope): subject`
- `refactor(scope): subject`
- `style(scope): subject`

Example: `feat(wardrobe): add searchable closet screen`
