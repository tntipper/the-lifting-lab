# Website CI readiness — 5 October 2026

Scope: repair PR18 application checks in an isolated nonsynced checkout, without runtime or release changes.

- Base: `4bc8a7a28e4704f738a0b4dc1ec81717803aa622`, PR18 `codex/tll-integration` → `codex/tll-stage0` (draft).
- Repair branch: `codex/tll-website-ci-20261005`; draft repair targets integration, not main.
- Main/PR58: `e12f0ed6cface85416771e25d8f94413710b0092`; preserved and excluded from this bounded CI patch. A later integration release must retain the mobile fix.
- Discovery: task workspace initially empty; no attached worktrees. Visible related TLL local tasks idle/unloaded, with synced paths excluded from access. One clean clone created here; no existing checkout modified.
- Failure baseline: run 36481290757 / application job 109127293542 at exact PR18 SHA: seven failures; integration/audit/build/runtime skipped. Other jobs passed.

## Repairs and proof

Four helper/CLI tests now execute synthetic Python copies with a platform-appropriate interpreter; the production credential reader remains unchanged. The path test checks the fixed sibling relationship independently of checkout basename. The extended-worker test consumes the real supervisor proof before returning success. The application job installs Chromium and PostgreSQL image, and uses a fresh-runner-only wrapper to create synthetic account/cart databases; ownership-labelled cleanup refuses unrelated containers. The composite uses Playwright's installed default Chromium instead of forcing system Chrome. All failing tests retained. Manifest refresh changes only five test hashes.

Local proof: 26 Python/CLI/publish tests pass, plus the focused extended-worker proof. Live-boundary policy passes with zero violations; both manifests match. Lint: zero errors, 23 existing warnings. Shell syntax and diff checks pass. CI fixture wrapper correctly rejects a local Mac before Docker access.

Local limitations: Docker inspection could not proceed because automatic approval review model was at capacity; no existing container was adopted. An unchanged supervisor-loss test fails under restricted local execution and needs Linux confirmation. Full composite requires Docker/PostgreSQL/browser fixtures; exact-SHA Linux CI is authoritative for that proof. Independent review caught and corrected wrapper working directory. Final review and remote CI pending.

## Release boundaries

No gates enabled, credentials changed, hosted calls made, supplier integration added, merge or production deployment performed. v17 recovery is evidence of all-off recovery; v18 successor has no current live-journey proof. Customer account/cart/checkout and supplier fulfilment still need staged independent acceptance before release approval. No landing recommendation until exact candidate CI and independent review pass.

## First hosted candidate and correction

Exact commit `e6f890e99539de0250c595d959a4a5de61b165c9` received independent review PASS. Draft PR59 targets integration. Run 37300805696 passed the complete Gen23 offline rehearsal in 26.5 seconds, and repaired process/path tests. Application recorded 3263 pass / 3 fail / 16 skip: the synthetic Python copies still hit the real helper's `sys.platform != "darwin"` guard on Linux. Follow-up changes the platform only inside disposable copied helpers after asserting the production guard is present; production source and its Mac-only restriction remain unchanged. Exact follow-up Linux run pending. Branch Preview was automatically built by the existing Vercel GitHub integration; no production deploy or control activation requested.

## Second hosted candidate

`9c0d5cab598b514e54f932421e31e8381c1881c4` independently reviewed PASS; run 37301322962 passed all 3266 application tests (16 existing Linux skips), including the full Gen23 rehearsal (26.2s). It then exposed an older auth integration expectation: next.config.ts redirects `/dashboard` to canonical `/account`, but the test expected immediate `/auth`. Follow-up verifies both redirect hops and no anonymous account/user fetch; no runtime change. Build/audit/runtime remained skipped after integration failed; final candidate checks pending.

## Third hosted candidate and Preview asset isolation

`665676db9104b74760c47b224f1c6ae123b0f485` independently reviewed PASS. Run 37301958376 passed application tests, auth integration, audit and production build. Post-build inherited-production Preview proof then failed the existing security assertion: production Supabase image origins were compiled from `lib/preview-products.ts`. Local reproduction confirmed only the bundled preview product image strings caused the full-origin matches. Correction retains the byte scan/network guards and replaces seven images with existing exact-ID public/catalogue files; three absent exact files use null and the honest image fallback. No catalogue values, offers or production database are modified. Added regression verifies exact-ID local assets, existence and absent buy links. Final exact-SHA proof pending.
