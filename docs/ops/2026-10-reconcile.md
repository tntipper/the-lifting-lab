# T01 — October reconciliation for Toby

**11 October 2026 · Signed off by Toby, 11 Oct 2026.** Decisions below follow [launch pack v2](../launch-pack/LAUNCH-DEFINITION.md) and [T01](../launch-pack/TASK-QUEUE.md). PR recommendations need Toby’s approval; no merge, closure, push or live action is authorised by this page.

## Decisions table

| Topic | Decision and practical effect |
| --- | --- |
| Delivery — settled | Customer pays **£4.99 once per order**. TLL records the full supplier dispatch cost separately, offset by that single receipt. TropShip costs £6 per supplier order: **£1.01 absorbed shipping** for one order, before fees/other costs. |
| Multiple suppliers — settled | Customer still pays £4.99 once. Each additional supplier order adds its verified dispatch cost to TLL’s margin calculation; do not assume other suppliers charge £6. Show total absorbed shipping in basket/margin reporting. |
| Supplier harness — Option B | Build the supplier connection in TypeScript alongside the existing site. Reuse `lib/commerce/{supplier-feed,catalogue-eligibility,shopify-admin,shopify-variant-snapshot,inventory-ledger,pricing-policy,commercial-burden}.ts`. Existing pricing supports TropShip order groups, not different supplier tariffs or a finished absorbed-shipping report. Extend under later tickets; Python connector PRs #1–#2 remain reference only. |
| Evidence window — settled | **3 consecutive clean days** of ingestion, stock reconciliation and supervised orders before unattended dispatch, replacing the old seven-day requirement. Supervised dispatch may start day 1 once applicable gates and specific approvals are satisfied. This page does not switch dispatch on. |
| v18 — diagnose only | Cause remains unknown; [incident record](incidents/2026-09-29-gen23-v18-readonly-diagnosis.md) records recovery and a stop about 132 seconds after acknowledgement, not proof of a build timeout. Preserve evidence; no replay, successor or extension. It **does not block the Shopify store launch** under Gates A–E; linked accounts/My Stack belong to T15. No current live-state read was performed. |
| Brand price / RRP | **UK brand reference price** means the exact option’s dated UK brand-store selling price; public wording: “Brand UK price”. **RRP** means explicitly evidenced recommended retail price, separately nullable. A brand price is neither an invented RRP nor TLL’s own “was” price. |
| Local work | Start: clean `codex/t01-reconcile` at `5c0d8e2`, based on local `codex/tll-integration` **`42a16dd`**. No uncommitted work to stash. Commit only this page, the corrected [5 October plan](stage-plans/2026-10-05-catalogue-to-launch-completion.md) and the ≤10-line HANDOVER. The launch-pack/AGENTS changes are already committed. |

## Draft PRs — proposed keep / merge / park list

“Keep” preserves work/evidence; “park” means no further launch work, without closing the PR. GitHub read-only PR metadata and comparisons on 11 October show **all eight open, draft and unmerged**. Remote integration is **`3f603e757050133d4dd65c2b6238767d44864533`** ([PR18](https://github.com/tntipper/the-lifting-lab/pull/18)), different from this local base. Comparisons show #60–#66 heads are already ancestors of remote integration; an ancestor is a commit already included in that branch’s history. Recheck the target before any T03 action.

| PR / head | Recommendation | Reason / later merge order |
| --- | --- | --- |
| [#54](https://github.com/tntipper/the-lifting-lab/pull/54) · `7a60d39` | **Keep → merge candidate** | Tests prove shop eligibility does not grant scientific approval. Remote comparison has one separate PR commit; review against the agreed target and require CI before T03 merge. |
| [#60](https://github.com/tntipper/the-lifting-lab/pull/60) · `9844bb7` | **Park** | Disabled owner journey, stacked on #59; already in remote integration. Retain for T15, no new merge/activation. |
| [#61](https://github.com/tntipper/the-lifting-lab/pull/61) · `50e50d2` | **Keep** | Analytics choice/privacy, based on main; already in remote integration. Historical chain starts here. |
| [#62](https://github.com/tntipper/the-lifting-lab/pull/62) · `808dc9a` | **Park** | Owner successor/fixture work, stacked on #60; already in remote integration. Preserve evidence, no expansion. |
| [#63](https://github.com/tntipper/the-lifting-lab/pull/63) · `8fbb325` | **Keep** | Dependency fixes, stacked on #61; already in remote integration. |
| [#64](https://github.com/tntipper/the-lifting-lab/pull/64) · `ae436d7` | **Keep** | Lint/navigation fixes, stacked on #63; already in remote integration. |
| [#65](https://github.com/tntipper/the-lifting-lab/pull/65) · `e582f8a` | **Keep evidence; park new work** | Broad combined staging/CI draft against Stage0, already in remote integration; do not merge it as an independent small fix. |
| [#66](https://github.com/tntipper/the-lifting-lab/pull/66) · `d470554` | **Keep** | Newer dependency patches against Stage0; already in remote integration, with further commits after it. Do not replay the broad cumulative diff. |

**Proposed T03 order:** agree/reconcile the target first → retain already-included fixes → review #54 → run CI after each approved integration. If reconstructing absent fixes is approved, preserve **#61 → #63 → #64**, then assess #66’s newer dependency changes; #65 overlaps that history. No blanket merge of all drafts. Parking #60/#62 does not remove inherited code.

## Evidence and open questions for Toby

- Local tests: `node --experimental-strip-types --test tests/{pricing-policy,commercial-burden,catalogue-eligibility,supplier-feed}.test.mjs` — **276 passed, 0 failed/skipped**. `npm run check:live-boundaries` and `git diff --check` passed; document/link/scope checks passed. These prove local foundations/document consistency, not launch readiness. No new code or tests added.
- GitHub CLI could not connect; Git’s missing-object lookup also failed DNS. Read-only GitHub connector supplied PR metadata, filenames and ancestry instead. Comparing local `42a16dd` remotely returned 404, so its relationship to the remote tip is unverified. Proposed fix: T03 reconcile both histories through authorised Git access before integration; no repeated fetch or branch rewrite here.
- **Commit blocked:** `git add` could not create `audit-code/.git/worktrees/implementation-integration/index.lock`: Operation not permitted. This linked checkout’s Git records are outside the allowed writable folders. Nothing was staged or committed; proposed fix: allow that Git metadata folder in a new authorised session, or commit these three files locally from an unrestricted terminal. No retry or metadata relocation.
- **Acceptance pending:** Toby’s sign-off. No push means no new hosted CI/PR evidence for this commit; earlier PR test claims are not a fresh T01 CI pass.
- **Toby:** approve or amend the PR dispositions/order, and confirm T03 should reconcile this local base with remote integration before applying #54. Sign-off: **Signed off by Toby, 11 Oct 2026** (PR keep/park list and reconcile-branches-first approved). Delivery is settled and needs no further choice.
