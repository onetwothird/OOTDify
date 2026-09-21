# AGENTS.md

Guidance for AI agents working in this repository. Read this before writing code.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before
writing any code. Do not assume patterns from older Expo SDKs; verify against the
versioned docs for this project's SDK.

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
npx tsc --noEmit        # TypeScript
npm test                # Jest (outfit generator + compatibility)
cd backend && python -m pytest -q
```

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