# Agent handover — The Lifting Lab

Updated: 2026-09-22 after independent audit of the Stage 3 Sign In developer handover

## Exact repository state

- Branch: `codex/tll-integration`
- Remote handover source: `be6d3c95be22eaffeb0c9a591cdff63ec82dda3c`
- Local audited correction commit: `7c55872a8e2ccc34cf3c3cdbc6859d5fe7e7bf2e`
- Remote branch remains at `be6d3c95`; correction commit has not been pushed or deployed.
- Preserved local-only files `.agent/gen11-journal-watch.mjs` and `implementation-state/` are untracked and were not modified or committed.

## Audit outcome

The attached `TLL-Stage3-SignIn-Developer-Handoff-2026-09-21.docx` was treated as evidence, not as authority. Full findings and corrections are in:

- `docs/ops/evidence/2026-09-21-stage-3-sign-in-handover-audit.md`
- `docs/ops/stage-plans/2026-09-21-stage-3-sign-in-handover-audit-corrections.md`

The handover-tip suite was green, but independent source review found defects its synthetic tests missed:

1. Browser manual redirect filtering made the new Sign In UI unable to read the start route's `303 Location`.
2. Shopify logout returned to `/auth`, which immediately started sign-in again.
3. The Edge broker could omit the manifest-required reviewed CA pair.
4. The live-boundary checker omitted Generation 15-19 replay flags, and the generated manifest duplicated policy state.
5. The staging proof timestamp type guard declared the wrong narrowed type.

Commit `7c55872` fixes all five locally: prepare is fetched, start is a real same-origin document form POST, `/auth` is passive, `/auth/customer` remains intentional auto-start, Edge requires the CA pair, stage-safety is derived from policy, all Generation 10-19 replay holds are checked, and the type guard is correct.

An independent post-correction review found no P0/P1 security or correctness regressions and judged `7c55872` safe to hand over and push as a still-disabled corrective commit. It repeated the boundary, manifest, type, focused (50/50), and full (1,986/1,986) checks. Hosted browser and deployed valid-broker proofs remain activation gates.

## Verification at `7c55872`

- `npm test`: **1,986/1,986 PASS**
- `npm run typecheck`: **PASS**
- `npm run lint`: **0 errors, 19 pre-existing warnings**
- `npm run build`: **PASS**, 153 static pages generated
- `npm audit`: **0 vulnerabilities**, including development dependencies
- `node scripts/staging-account-activation-manifest.mjs --check`: **PASS**
- `npm run check:live-boundaries`: **PASS**, all controls disabled
- `git diff --check`: **PASS**
- Targeted secret-pattern scan: no credentials; matches were deliberate negative-test sentinels

## Stage status

- Generation 19 is consumed, disarmed and non-replayable. Do not run its live launcher.
- Generation 20 is not permitted before a new boundary review.
- Stage 3 offline mount/composition coverage exists, but Stage 3 is **not closed**.
- The hosted no-purchase journey is still unproven on the corrected code.
- `/workspace/tll-afk/` and `/workspace/tll-tip/` evidence cited by the attached handover is absent on this Mac, so hosted PASS claims require fresh verification.
- The observed prepare `409` cannot be attributed solely to `TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET`. Runtime composition requires the complete reviewed Preview configuration, current proof window, hosted migrations/controls, and restricted application identities.

## Required next gate

1. Push/review correction commit `7c55872` and deploy an immutable Preview with public features still held until server readiness is proven.
2. Obtain a fresh **read-only, secret-free** baseline covering:
   - immutable deployment/source identity and alias resolution;
   - presence of all required Vercel environment names without values;
   - hosted migrations `002`-`016`, controls, restricted roles and login/expiry state;
   - current Shopify proof evidence/config hash window;
   - Supabase Edge function deployment/configuration and fixed disabled response.
3. If application credentials or controls need replacement, write a new reviewed activation plan. Do not replay Generation 19 and do not create Generation 20 under the current policy.
4. Only after readiness is proven, run the bounded owned-email browser journey on staging: Sign In → Shopify → unified session → cart/account/orders → logout, stopping before checkout/purchase. Record exact immutable deployment evidence.

## Programme holds beyond Stage 3

- No purchase, production Supabase `wrhgscovsgsudtedbljr`, customer email identity merge, or production release.
- Scientific recommendations remain contained. `docs/ops/integration-release-candidate.md` and `docs/ops/scoring-foundation.md` record that no approved assessment dataset exists; citation registers under `docs/research/guide-citations-*.md` still contain category evidence gaps.
- Storefront cart token/purchase path and hosted cart/account persistence remain unproven.
- Product/pricing automation must remain fail-closed wherever supplier cost, tax basis, freshness, mapping, stock, or margin inputs are not independently approved.

## Authoritative pointers

| Item | Path |
|---|---|
| Audit report | `docs/ops/evidence/2026-09-21-stage-3-sign-in-handover-audit.md` |
| Correction plan | `docs/ops/stage-plans/2026-09-21-stage-3-sign-in-handover-audit-corrections.md` |
| Sign In component | `components/StagingCustomerSignInEntry.tsx` |
| Browser preparation contract | `lib/identity/staging-customer-sign-in.ts` |
| Edge broker boundary | `lib/identity/customer-subject-broker-edge.ts` |
| Stage policy | `config/project-stage-gate-policy.json` |
| Generated activation manifest | `config/staging-account-activation-manifest.json` |
| Activation runbook | `docs/ops/staging-account-activation.md` |
| Project execution protocol | `docs/ops/project-stage-execution-protocol.md` |
