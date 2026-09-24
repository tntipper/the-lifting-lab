# Agent handover — The Lifting Lab integration

Updated: 2026-09-24. Verify every claim against Git and hosted systems before acting.

## Objective and boundary

Deliver the staged comparison-site/Shopify integration in `docs/ops/integration-release-candidate.md` under `docs/ops/project-stage-execution-protocol.md`. The immediate gate is Stage 3 staging account/cart acceptance, followed by the remaining inventory/order, pricing/affiliate, scoring, design and public-release work. No purchase, supplier order, promotional customer send, production provider change or public launch has been authorized. Connected-branch pushes and hosted credential windows need a reviewed exact plan and fresh action-time approval. Keep customer/cart/Edge activation held until all evidence passes.

## Current state

- Repository: `implementation-integration`, branch `codex/tll-integration`. The parent of this checkpoint is `84b5e6bd4c20c72cde7c0493db885f82f037ec27`; check current HEAD and status. The remote branch was last observed at `0f8027288ac52667089a094b73a2c03ff63ca916`, behind local source. There has been no push or deployment in this checkpoint.
- Current unit: `scripts/staging-preview-git-acceptance.mjs` is a pure, disabled comparator. It requires the selected full SHA and Git manifest digest, matching before/after Vercel source proof, fixed project/team/repository/branch/Preview identity, one matching deployment-bound surface read, and all four customer/cart plus Edge controls disabled. It returns only `SOURCE_PROVEN_RUNTIME_HELD` or fixed HOLD. It does not activate sign-in. See `docs/ops/stage-plans/2026-09-24-stage3-git-preview-source-proof.md` and tests. Independent review: GO for this disabled unit, HOLD for hosted integration. The consumed v8 hosted-baseline journal/launcher/core were not changed or replayed.
- Previous live staging observation: the protected Preview alias resolved to Ready deployment `dpl_4M6P7P6rbG9w2Q9kC6y65rRzWB3V` at old source `536d36a515ad39449338748b5739b0dcdedf8256`, with no custom manifest metadata. Repository ID matched `1264363509`, but current source was unproven. See `docs/ops/evidence/2026-09-23-preview-source-read-result.md`. The one-use journal was consumed; native gates were disarmed. Re-observe before any external action.
- Staging Supabase read-only probe established the provider precondition and retired database/secret state, but provider normalization and account activation remain held. See `docs/ops/evidence/2026-09-23-stage3-provider-readonly-probe-result.md` and the Stage 3 plans. No live account/cart acceptance has passed.
- Six unrelated untracked paths are present and must be preserved: `.agent/HANDOVER 2.md`, `.agent/gen11-journal-watch.mjs`, `config/staging-account-hosted-baseline-manifest 2.json`, `implementation-state/`, `scripts/staging-account-hosted-baseline-keychain 2.py`, `scripts/staging-account-hosted-baseline-live-launcher 2.mjs`.

## Decisions and validation

- Use a normal Git-triggered Vercel Preview plus independent immutable Git source/manifest proof and deployment-bound runtime readback. Do not use the custom POST metadata route as an unreviewed fallback: metadata is a self-asserted claim. The v8 broad hosted baseline still HOLDs and should not be made to pass by retrofitting a consumed diagnostic.
- The pure comparator cannot establish observation timing, protected-alias settings or absence of intermediate alias movement. The future orchestrator must supply ordered, bounded, authoritative receipts and bind `selectedSource` to a one-use publication journal.
- Final focused checks passed 12/12 after the accessor assertion and manifest refresh. The full suite passed 2,382, skipped 2, failed 0; typecheck, both manifest checks, live-boundary and diff checks passed. Lint had zero errors and the same 20 warnings. A generated `.next/types` duplicate caused an initial typecheck failure; two byte-identical ignored duplicate files were removed, then typecheck passed. This was not a source defect. Local build passed at `aba39d7` before this pure unit; no app route changed.
- `/usr/bin/git` is blocked by the unaccepted Xcode license. Local inspection uses `/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git`. Do not accept the owner's license implicitly. A constrained reviewed Git runner is required for the future source-proof/publish path.

## External state and remaining work

The live Shopify pre-launch email capture, double opt-in and authorized sender DNS were previously changed and tested using the owner's address; do not repeat the customer send without a new test purpose. Current hosted state may have drifted. No credential window is open. No new provider change, Preview publish, production deployment or purchase occurred in this checkpoint.

After Stage 3, the broader release plan still needs verified unified account/cart/orders/logout, inventory and order workers, supplier commercial/VAT basis, retail pricing and flash sales, affiliate attribution/discount/refund ledger, backup/restore, consent/email operations, research-backed score evidence review, consistent theme/customer journey, and production release checks. The offline Stage 6 pricing/affiliate modules are not connected to Shopify checkout or payouts. Obtain wholesale VAT basis, payment tariff, Shopify discount allocation and affiliate terms before live pricing. Product-level scoring remains on hold pending source labels/Path A evidence.

## Next action

1. Verify branch/HEAD/status and the exact disabled diff, then plan and implement the next disabled unit: constrained Git read/publish runner and exclusive mode-0600 one-use publication journal. Require selected SHA, remote predecessor and manifest digest before at most one fast-forward push. On uncertain acknowledgement, reconcile `ls-remote` read-only; never blind-retry. Cover real command boundary and negative cases, then independent review.
2. Before any connected-branch push, inspect the entire remote-to-selected-source diff, fresh Vercel project/build/root/production branch/Preview variables/protection/alias settings, and fresh Shopify/Supabase frozen state. Review the minimal arming diff and obtain separate action-time approval. One push maximum; observe current Ready immutable Preview, exact Git proof and deployment-bound disabled runtime. Stop on uncertainty and leave activation held.
