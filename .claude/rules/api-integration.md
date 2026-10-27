---
paths:
  - "src/services/**"
  - "backend/routes/**"
---

# App ↔ backend contract

- The app calls Flask only through `apiRequest()` (`src/services/apiClient.ts`).
  Typed wrappers live in `src/services/aiApi.ts`. Failures are `ApiError` with
  a `kind`, and the UI shows its friendly message, never raw server text. On a
  429, `err.retryAfterSeconds` carries the `Retry-After` value.
- Wrappers validate the response shape and throw `invalid-response` rather than
  returning partial data. Map snake_case fields to camelCase in the wrapper.
- `src/services/` must not import from `src/features/`.
- A contract change touches the route, its `aiApi.ts` type and its tests in the
  same change.
- The app talks to Supabase directly via `src/shared/lib/supabase.ts` under RLS.
  Anything needing the service role goes through the backend.
