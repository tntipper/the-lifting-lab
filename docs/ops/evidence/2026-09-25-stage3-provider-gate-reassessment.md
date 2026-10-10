# Stage 3 provider gate — current-state reassessment

**Decision: HOLD on provider change and account/cart activation.** The synthetic Keychain fixture cleanup is complete and consumed, but it does not prove reliable access to the three real credentials used by the provider-normalisation launcher. No provider-update attempt has been made.

## What is verified now

- Main checkout `codex/tll-integration` at `8638c6c` started this review with clean tracked files and the same six unrelated untracked paths. The [V2 fixture result](2026-09-25-stage3-fixture-recovery-v2-one-run-result.md) is terminal PASS, both cleanup switches are off, and the synthetic fixture is absent. No fixture retry is required or permitted.
- Both private provider-normalisation mutation journals are **absent**. The older provider read-only probe, credential-readiness check and fixture recovery records are present as owner-only private files; the latter records are consumed.
- The direct provider-normalisation launcher returned `PROVIDER_NORMALIZATION_LIVE_DISABLED`. The activation manifest and project live-boundary check passed. The bundled Python executable is present and still has the expected hash. Focused provider-normalisation and native-reader tests passed **37/37**. These results prove the disabled local code has not regressed; they do not prove a live provider update would succeed.
- The last official staging provider read-only probe, on **24 September**, found `custom:tll-staging-subject-broker-v1` enabled with a JWKS address, with strict database conditions passing. Its one-use journal is terminal and cannot be replayed. The last recorded protected Preview source and disabled controls are also from 24 September. Neither is a fresh hosted baseline for a mutation now.

## Why the hold remains

The earlier exact Python Keychain reader failed after a direct credential read had succeeded. A later one-time all-selector readiness check passed, but neither established the cause of that intermittent failure nor guaranteed the next read. The alternative noninteractive native reader has passed offline tests only; it has not been qualified against a disposable non-secret item on this Mac or connected to the launcher. The fixture cleanup tested a different fixed synthetic file and does not close that credential incident. The prior one-hour Vercel token cannot be assumed valid.

A signed-in browser read was attempted once for a fresh staging dashboard observation during this reassessment. The computer-use connection timed out before returning a page, so **no current hosted provider or Preview state was observed**. No credentials were read, no journal created, and no hosted change made.

## Smallest safe route forward

1. When a signed-in staging browser session is available, read the exact staging project/provider and protected Preview identity and disabled controls. This is observation only; stop if the project or deployment differs from the pinned plan.
2. Choose and prove one reliable, noninteractive credential path **before** another provider-mutation window. The current `/usr/bin/security -w` helper has an unresolved intermittent failure. The separate native reader is a candidate but needs a disposable, non-secret Mac qualification and an independently reviewed parent timeout/launcher integration. A dashboard-only route may be considered only if its field-preservation and one-attempt guarantees can be demonstrated from the actual UI. Do not spend a new token or provider journal merely to discover which route works.
3. After that proof, refresh the official full provider/database/secret/Preview baseline, review a new exact two-field provider-update plan and arming diff, obtain separate owner approval, and make at most one provider update. Account/cart activation and customer-journey testing remain separate later gates.

This reassessment changes no application code or hosted setting. It does not reauthorise any historical arming commit, expired credential, or consumed diagnostic.
