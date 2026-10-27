---
name: audit-duplication
description: Find duplicated or near-duplicate code in OOTDify (helpers, components, styles, API wrappers, backend services) and propose consolidations. Read-only report; no refactoring without approval. Use when asked to reduce duplication or before adding a new shared helper.
argument-hint: "[path to limit the audit, default src/ and backend/]"
allowed-tools: Bash(git ls-files:*) Bash(git grep:*) Read Grep Glob
---

# Audit duplication

Scope: `$ARGUMENTS`, or `src/` and `backend/` (skip `node_modules`, `.venv`,
`dist`, `.expo`).

1. **Inventory exports:** list exported functions/components per file
   (`export function|export const|^def `) and group them by similar names or
   purposes (file naming, MIME/extension helpers, URL resolution, image
   shrinking, date formatting, rate limiting, error mapping).
2. **Compare candidates:** read each group side by side. Flag them when the
   bodies do the same job, even under different names.
3. **UI and styles:** look for components that overlap (`src/shared/components`
   vs per-screen copies) and style blocks repeated across screens (buttons,
   cards, sheets) that a shared component or `makeStyles` helper could own.
4. **Backend:** repeated route boilerplate (upload → ingest → infer →
   cleanup) and repeated config parsing.
5. **Report:** for each finding give the locations (file:line), what differs,
   the proposed single owner, the callers to update, and the risk (behaviour
   differences, test coverage). Order by payoff. Do not edit. Consolidations
   go through `/implement-feature` once approved.
