# Gen 12 interrupted live — learning review

Date: 2026-09-20 / 2026-09-21 (Europe/Madrid)
Window: `6d4c5ed4-08a3-4d20-b580-cd03ab000e83` (INTENT_RECORDED — no replay)

## What happened

1. Gen 12 Phase 2 armed (PR #23 merged).
2. Phase 3 started the dedicated live launcher.
3. Phase journal claimed and advanced to `VERCEL_STAGE` (within 660s bound).
4. Creator process exited with no terminal journal outcome.
5. Operator waited until `STALE_REQUIRES_RECONCILIATION`, then read-only recover:
   - generated Vercel values present: 0
   - generated Supabase secrets present: 0
   - zero sessions: true
   - cleanup CLI attempts: ATTEMPTED_ERROR / PROVIDER_VALIDATION (same class as Gen 11)
6. Disarm + fresh successor required. Replay forbidden.

## Root cause (ops, not product code)

Gen 12 **code** already documented the Gen 11 lesson (long-lived session, separate journal watch, never kill while `ACTIVE_WITHIN_PHASE_BOUND`, no short-lived nohup).

The **operator start method** still used a detached `nohup`/`caffeinate` parent that returned when the remote Shell tool session ended. The launcher was killed mid-`VERCEL_STAGE` again.

So: documentation/lesson in-repo ≠ enforced run contract. Prevention must make the bad start path hard or impossible.

## Defects / issues in the phase loop

| # | Issue | Impact |
|---|--------|--------|
| 1 | Live start used short-lived detached shell again | Process death mid-phase |
| 2 | Lesson lived in comments/docs only | Same mistake repeatable |
| 3 | No preflight that refuses start unless long-session contract is proven | Operator can still nohup |
| 4 | Journal watcher is one-shot, not a continuous observer by default | Easy to “watch” poorly |
| 5 | Overnight / unattended live is high risk without a true service supervisor | Human asleep cannot recover mid-flight |

## Prevention actions (implement in Gen 13)

### Must ship with Gen 13 Phase 1 (disabled package)

1. **Hard start contract in the launcher CLI**
   - Refuse to begin native work unless env `TLL_LIVE_LONG_SESSION=1` is set **and** a session keepalive file/fd is held open by the parent for the whole run.
   - Document that remote Shell must use a single foreground `block_until` covering full phase budgets (~45–55 minutes), not nohup.
   - Print a one-line FATAL if started under nohup/orphan without the keepalive (detect `PPID=1` or missing keepalive).

2. **`scripts/staging-generation-13-run-live-once.sh` (or .mjs wrapper)**
   - The *only* supported operator entry for Phase 3.
   - Foreground: starts journal poller in-process or as child of the same session, runs launcher, waits for exit, writes session summary.
   - Explicitly rejects `nohup`, background `&` without wait, and Shell `block_until_ms: 0` patterns in its header comments + a runtime check.

3. **Continuous journal observer mode**
   - Extend journal-watch with `--follow --interval 20` that loops until TERMINAL or STALE, so “separate observer” is real, not a one-shot JSON print.

4. **Ops checklist file** in stage plan: “Phase 3 start checklist” with pass/fail lines the operator must satisfy before arming merge is even requested.

5. **Do not run Phase 3 unattended overnight** unless launchd/tmux supervised session is proven in a dry drill (keepalive held). Default: arm+live only when operator is awake.

### Process (Optimus / EA)

6. After two identical ops failures (Gen 11 + Gen 12), treat “lesson in comments only” as a **QC fail** for Phase 1 of the next gen until a runtime guard exists.
7. Morning digest should surface: Gen N armed? live in flight? stale journal?
8. Never claim Phase 3 “started correctly” until journal shows progress *and* `ps` shows launcher alive after 60s.

## What we will NOT do

- Replay Generation 12.
- Arm Gen 13 or run live while Toby sleeps (overnight plan).
- Run full `npm test` while any generation is armed.

## Success check for Gen 13 prevention

- Launcher refuses to start without long-session keepalive.
- Wrapper script is the documented Phase 3 entry.
- Journal-watch supports `--follow`.
- Interrupted-live doc for Gen 12 filed; Gen 13 stage plan cites these actions by number.
