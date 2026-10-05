# Stage 3 synthetic fixture recovery V2 — one-run result

**Outcome: PASS, consumed, disarmed.** On 25 September 2026, after explicit owner approval and independent review of the [exact one-run proposal](../arming-previews/2026-09-25-stage3-fixture-recovery-v2-903b975.md), one V2 armed build and one launcher invocation completed. The launcher returned `{"status":"PASS","category":null}`. No retry was made. No production, Shopify, Supabase, Vercel, purchase, customer-message or account/cart change occurred.

## Before the attempt

- Main checkout branch `codex/tll-integration` was at `b19a1c05fcfb75e46fd541c25fd46cbd91ef9c2a`; tracked files were clean, and only the six previously preserved unrelated untracked paths existed.
- Fresh fixed-target read-only checks passed: exact synthetic directory/main/sidecar metadata and hashes, default login Keychain, one explicit user-domain search-list entry, both V1 records terminal/HOLD, private state directories, and absent V2 journal/baseline/armed binary/receipt.
- The patch SHA-256 was `e19427655b95df63b1e212ca0a84c7f90257d84b7fea0758df1525cccd15c06c`. It applied as exactly two switches and two manifest hashes, with the activation manifest check passing.
- The one armed executable passed its build/readback checks: arm64, strict ad-hoc signature, source hash `c39bec70c0167a0e8778f930829bf714f8ea07ab31fbbcd0d746208e1d2a2cf8` and binary hash `c8f285255f5bdd1c980ba8768dd09539eaf996bbed2b5515ad8448cf40f0e41d`.

## After the attempt

- The V2 private journal reads terminal `PASS`, phase `FINAL_VERIFY`, sequence 6. The full run-start baseline remains private, is digest-bound to the same run/source/binary and recorded two effective Keychain entries. The native final phase compared that full baseline before returning PASS.
- Independent read-only reconciliation found the synthetic fixture directory and both fixed children absent; the login Keychain remains the default and the explicit user-domain list still has one entry. The private binary and receipt match the journal identities.
- The reviewed patch was reversed immediately. Both V2 switches are false; tracked files are clean, activation manifest check and live-boundary check pass. The six unrelated untracked paths were preserved.

The V2 journal is one-use terminal evidence. **Do not rerun or reapply this patch.** This result retires only the synthetic fixture cleanup blocker. Stage 3 provider normalisation and account/cart activation still require their own current-state checks, reviews and approvals; they remain HOLD.
