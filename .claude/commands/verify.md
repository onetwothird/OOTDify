---
description: Run the repo verification suite (tsc, Jest, backend pytest)
argument_hint: optional package path
---

Verifies the OOTDify repository per AGENTS.md before finishing work.

Run, from the repo root:

```bash
npx tsc --noEmit
npm test
cd backend && python -m pytest -q
```

Report each result and fix any failure before asking the user to review.