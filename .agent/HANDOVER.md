# Agent handover — The Lifting Lab integration

Updated: 2026-09-22 after the staging database baseline passed. Verify against Git and hosted state before acting.

## Objective and boundary

Continue the staged comparison-site/Shopify integration under `docs/ops/project-stage-execution-protocol.md` and the release criteria in `docs/ops/integration-release-candidate.md`. No purchase, production change, supplier order, customer message, provider enablement, or deployment occurred in this work unit. Public launch remains held.

## Current repository and external state

- Repo `implementation-integration`, branch `codex/tll-integration`. Verify `pwd`, HEAD, status, upstream, and current source before acting. The v5 disabled correction is `38de3fb`; its one-line arming commit is `893b40f`; later disarm/closeout may advance HEAD.
- Diagnostic launcher `NATIVE_DB_DIAGNOSTIC_ENABLED=false`, full observer `HOSTED_BASELINE_LIVE_ENABLED=false`, and Keychain helper `APPROVED_NATIVE_READ=False`. The generated full-observer manifest has `nativeAccessApproved:false`. Disabled live-boundary and manifest checks pass.
- Preserve untracked `implementation-state/`, `.agent/gen11-journal-watch.mjs`, and iCloud ` 2` copies. Do not stage by wildcard. The v4 full-observer journal and v2/v3/v4 database rehearsal journals are consumed failures/holds. The v5 journal at `../implementation-state/staging/tll-hosted-baseline-v5-db-chunked.json` is consumed PASS. Never delete or replay any of them.
- Retained non-expiring Vercel Preview bypass remains at the user's request. The previous one-hour Vercel API token was left to expire. No Vercel credential was used in the v5 database check.

## Verified outcome and learning

- V2 database SQL checks read-only execution identity and runtime sessions by visible username; independent review and a restricted-role PostgreSQL regression accepted that correction. The exact SQL SHA-256 is `1a53d5f9881d0ab791dc4741548957df154b2fdac2a98007fdec32e3bdad1c1e`.
- The v2 rehearsal failed opaquely. V3 returned HTTP 201 but rejected response framing. V4 isolated transfer encoding. The client had rejected every transfer-encoding header; v5 accepts only standard `chunked`, retaining 1 MiB bounded streaming, abort cleanup, redirect/content-encoding/length checks, and exact receipt validation. This correction was independently reviewed. All 2,250 disabled tests passed.
- V5 was armed by an independently reviewed one-line diff and invoked exactly once at 20:43 UTC. Its mode-0600 journal is terminal PASS for staging `qdmvngjwkcsilzmqksme`, run ID `1a094fad-24b1-4c1d-80f4-08fd954a24a7`, hash `04ee2fe8a104a319c44ababed0faed0737b6d983fb724567da6b50c4f5ea0670`, no reason codes. A separate local PostgreSQL JSONB canonicalization produced the same hash. The launcher was immediately disarmed. The exact read-only staging database baseline gate is **passed**.
- Incident records and cause/correction are in `docs/ops/stage-plans/2026-09-22-v3-hosted-database-diagnostic.md`, `2026-09-22-v4-framing-classification.md`, and `2026-09-22-v5-chunked-baseline.md`. Older journals are preserved as evidence.

## Next coherent unit

Plan a **new full hosted observer** with its own journal identity and credential window. The database PASS does not establish Supabase provider, Vercel environment/project, readiness surface, Edge, or deployment state. Verify the full observer's disabled source and manifest against the corrected Supabase binding; prepare/review a fresh one-shot arming diff; obtain any needed temporary Vercel API credential under the user's existing access preference; then run once and disarm/reconcile. Do not reuse the failed v4 full-observer journal, an old arming patch, or expired tokens. Provider repair, deployment creation, Generation 22, and public release remain separate downstream gates.

The broader product backlog remains in `docs/ops/integration-release-candidate.md`: unified account/cart/orders/logout, inventory and order workers, supplier-cost/VAT basis, retail pricing/flash sales, affiliate attribution/discount/refunds, backup/restore, consent/email, scientific scoring review, theme publication, and production release checks.
