# Live AR Try-On — Handoff (read this first when resuming)

**Paused by the user on 2026-10-29.** Do not start new work until the user says to continue.

## What the user asked for

"I want it to be accurate, like an AR — the image shows on the video and fits
the body of the person." Rebuild the live try-on (`/tryon/live`) so the garment
follows the person on the camera video at frame rate and is warped onto the body.

## Decisions already made with the user (don't ask again)

- Tracking runs on the phone, not the server; the app may require the dev build (no Expo Go).
- Android only.
- Approach A: VisionCamera v5 + react-native-fast-tflite (MoveNet Lightning) + Skia draws the warped garment.
- The user delegated the remaining design choices and approved the spec.
- Execution: **separate helper agents** (superpowers:subagent-driven-development):
  one implementer per task, then one task reviewer, and a final whole-branch review.

## Documents

- Spec: `docs/superpowers/specs/2026-10-29-live-ar-tryon-design.md`
- Plan (9 tasks): `docs/superpowers/plans/2026-10-29-live-ar-tryon.md`
- Ledger, task briefs and rulings (git-ignored, local only):
  `.superpowers/sdd/2026-10-29-live-ar-tryon/progress.md` and the `task-N-brief.md` files there

## Where things stand

- Branch: `feat/live-ar-tryon` (cut from `main` at `1864c02`). No task commits yet.
- **Task 1 (native setup) was in progress and not reviewed.** Its helper agent was
  waiting on a long Android Gradle build. Uncommitted Task 1 work in the tree:
  `package.json`, `package-lock.json`, `app.json`, `metro.config.js`,
  `assets/models/` (MoveNet model), `src/app/tryon/spike.tsx` (test screen; stays
  uncommitted on purpose), `android-build.log` (build output; delete, don't commit).
- **Never commit** the user's own pending changes: `src/features/profile/onboarding.ts`
  and `assets/images/mascot-penggi(copy).png`. `android/` is gitignored.

## How to resume

1. Check `git status` and `android-build.log` (the tail shows whether the build passed).
2. Finish Task 1 per `task-1-brief.md` and the controller rulings in `progress.md`.
   Run `npx expo prebuild --platform android --clean` and `cd android && ./gradlew assembleDebug`
   with `ANDROID_HOME=C:\Users\USER\AppData\Local\Android\Sdk`. Commit one file per commit
   (package.json + lockfile together). Leave `spike.tsx` uncommitted.
3. Review Task 1 (task reviewer), then continue in this order:
   **T2 → T3 → T4 → T5 → T6 → T8**, each with an implementer and then a reviewer.
4. **Stop and ask the user for the phone test** before T7: run
   `npx expo run:android`, open `/tryon/spike`, and report the FPS, whether the red dot
   sits on the left shoulder, and whether front/back camera need flipping/rotating.
   Record the result in `REMAINING_TASKS.md` §3.
5. Then **T7** (tracker + Skia layer + screen; deletes `spike.tsx`) → **T9** (docs).
6. Final whole-branch review on the most capable model, one fix pass, then
   superpowers:finishing-a-development-branch. List every `Ruling:` from the ledger to the user.

## Verification before finishing

`npx tsc --noEmit`, `npm test`, `npm run lint` (0 errors),
`cd backend && .venv/Scripts/python -m pytest -q`, and `npx expo run:android`.
