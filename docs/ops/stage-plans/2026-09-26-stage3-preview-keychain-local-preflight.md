# Stage 3 — local Keychain preflight after Preview inventory v1 stopped

## Evidence and purpose

The approved Preview inventory v1 ended `FINISHED/READ_UNAVAILABLE` after 10.3 seconds, before any Vercel request. Its Keychain helper has a 10-second timeout. The owner saw a macOS permission prompt during the run. The v1 journal is terminal and must never be removed or replayed.

The next proof is **local only**: determine whether the saved short-lived Vercel token can be read by the exact `/usr/bin/security` access path when the owner can answer its prompt. This does not establish token validity at Vercel or inventory completeness. It avoids spending another hosted one-use observation on an untested Keychain prompt.

## One-use diagnostic boundary

The disabled script `/tmp/tll-preview-keychain-preflight-v1.py` uses the fixed login-Keychain selector `TLL Hosted Baseline Vercel API` / `prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4`. Its only live operation is one `/usr/bin/security find-generic-password -w` call, with a 45-second timeout and no network code. It captures the token in process memory to check its format, then overwrites the mutable copy. It prints only `READABLE`, `READ_UNAVAILABLE`, `DISABLED` or `REPLAY_REJECTED`; it never prints or writes the token. Its private one-use record is `../implementation-state/staging/tll-preview-keychain-preflight-v1.json`, created before the credential read. Any record forbids replay.

The script has `APPROVED_LOCAL_KEYCHAIN_READ = False`. Disabled syntax and no-side-effect execution have been checked. Before a real run: verify main checkout remains disarmed, both manifests and boundary check pass, v1 inventory is terminal, diagnostic journal absent, script hash and exact one-line arming change reviewed, and the Keychain item still has the intended selector. Obtain fresh owner approval for the one local read. Have the owner ready to answer the macOS prompt **Allow** for this item and `/usr/bin/security`; do not select broad access or enter a password in chat. If the token has expired, a successful local read still cannot authorize Vercel access.

After the single run, turn the diagnostic switch false, preserve its journal, and record its status. If the prompt is late, denied or times out, stop and inspect the recorded state rather than retrying. Only after `READABLE` may a separately reviewed v2 Preview inventory be prepared with enough prompt time; it requires new action-time approval and a fresh hosted one-use journal. Do not change Vercel settings, Supabase, account/cart activation, customer data, Production or purchases in this diagnostic.
