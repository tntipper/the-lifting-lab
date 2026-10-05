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
