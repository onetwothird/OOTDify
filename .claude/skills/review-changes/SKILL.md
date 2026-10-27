---
name: review-changes
description: Review the current branch's changes against OOTDify's security, data, i18n, theming and testing conventions and report findings with file:line. Read-only. Use before a PR or merge, or when asked to review changes.
argument-hint: "[base branch, default main]"
allowed-tools: Bash(git diff:*) Bash(git log:*) Bash(git merge-base:*) Bash(git status:*) Read Grep Glob
---

# Review changes

1. Scope: `git diff $(git merge-base ${ARGUMENTS:-main} HEAD)...HEAD --stat`,
   plus `git status --short` for uncommitted work. Read the full diff only for
   files that matter.
2. Check each changed file against the matching `.claude/rules/` file, then
   these repo-wide risks:
   - Secrets or the service-role key reachable from `src/`; non-`EXPO_PUBLIC_*`
     env vars in the app.
   - Identity taken from a request body instead of `g.current_user`.
   - A temp upload not cleaned up in `finally`; new state stored without need.
   - Fake, placeholder or swallowed-error behaviour.
   - Strings missing from `en.ts` or `fil.ts`; hard-coded colours.
   - New logic without a test, or tests that cannot fail.
   - Helpers duplicating existing ones (`/audit-duplication` for a deeper pass).
   - Commits that are not one conventional commit per file.
3. Report findings most severe first:
   `severity | file:line | problem | concrete consequence`. Mark anything you
   could not confirm as "unverified". Do not edit files.
