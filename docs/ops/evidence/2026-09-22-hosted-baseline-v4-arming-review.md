# Hosted baseline v4 arming review

- Disabled base: `0475593f844e39b9dca4d75cf8d6bd667584f3dc` on `codex/tll-integration`.
- Exact candidate: `2026-09-22-hosted-baseline-arming-review-v4.patch`, SHA-256 `511a7e4f3e67d2110040f633b47c775f0b887d3e9d7a9acbcbc8491e0846cf93`.
- The patch touches exactly the two native gate literals and the corresponding generated manifest approval/source hashes in three files. It contains no endpoint, target, secret, transport, journal or timeout change.
- Removing Git's `index` metadata gives the same SHA-256 for the v4 and previously independently accepted v3 diffs: `69c944f5c8b3dabc65a27982f64703e81237df8f2a36dd73fd83fb436371a5ff`. The metadata change reflects the newer disabled manifest with its updated stage-plan pin. The v4 patch applies cleanly to the disabled base; the armed manifest check passed in an isolated review worktree.
- Both Vercel Keychain items retain `Confirm before allowing access` and list only `/usr/bin/security`; `Allow all applications` is off. The bounded exact armed helper from that isolated worktree returned `READABLE` for `supabase`, `vercel`, and `vercel-bypass` with all output discarded. No journal or hosted request was made during this review.
- Disabled validation: 2231/2231 tests, typecheck and build passed; lint had zero errors and 20 existing warnings; production audit found zero vulnerabilities; both manifest and live-boundary checks passed.

This is a mechanical equivalence review of the v4 candidate against the earlier independently reviewed functional diff, plus a new exact-helper credential preflight. Before the one live invocation, verify the base, patch hash, absent journal and all target pins again. Do not use the v1, v2 or v3 arming patches for the new window. Stop after one invocation regardless of result, disarm, inspect the secret-free receipt or absence, then restore the temporary Keychain allowlists.
