---
name: implement-feature
description: Implement an OOTDify feature or hand-off task end to end (find the spec, reuse existing patterns, test first, verify, commit per file). Use when asked to build or continue a feature from FEATURE_GUIDE.md, REMAINING_TASKS.md or a plan in docs/superpowers/plans/.
argument-hint: "<feature name, section number, or plan path>"
---

# Implement a feature

1. **Find the spec.** Grep `FEATURE_GUIDE.md`, `REMAINING_TASKS.md` and
   `docs/superpowers/plans/` for `$ARGUMENTS`. Read only the matching
   section. If its "open questions" are unanswered, ask before coding.
2. **Find what to reuse.** Before writing a helper, component or endpoint, grep
   for an existing one (`src/shared/lib`, `src/shared/components`,
   `src/services/aiApi.ts`, `backend/services`). Extend it rather than add a
   near-copy.
3. **Place code by convention:** routes in `src/app/`, everything else in
   `src/features/<feature>/`, backend logic in `backend/services/`, HTTP in
   `backend/routes/`.
4. **Test first** for every piece of logic (see the testing rule). Split pure
   logic from Expo/RN code so Jest can load it.
5. **Run `/verify`.**
6. **Commit** one file per conventional commit (`AGENTS.md`). Commit only when
   the user asked for commits in this session.
7. **Hand off:** tick or update the matching checklist in `REMAINING_TASKS.md`,
   including anything that still needs a phone or Railway check. Never claim
   device behaviour you did not see.
