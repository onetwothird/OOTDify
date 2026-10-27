---
paths:
  - "**/__tests__/**"
  - "backend/tests/**"
  - "jest.config.cjs"
---

# Tests

- **Jest** (ts-jest, `node` environment) only runs
  `src/**/__tests__/**/*.test.ts`. Code under test must not import Expo, React
  Native or `supabase`. Put logic in pure modules (e.g.
  `features/tryon/ar/liveLoop.ts`, `shared/i18n/translate.ts`) and wrap them in
  hooks/components. `import type` from such files is fine.
- **Backend route tests:** mount only the blueprint on a bare `Flask` app, seed
  `g.current_user` in `before_request`, patch
  `services.consent.has_required_consent`, reset `ratelimit._events`, and
  monkeypatch the route's `get_*_service` with a fake. Templates:
  `backend/tests/test_isolate_route.py`, `test_live_pose_route.py`.
- Watch each new test fail before implementing. A test that passes first, e.g.
  on a 404, is testing nothing.
