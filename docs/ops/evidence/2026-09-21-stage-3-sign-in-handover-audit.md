# Stage 3 Sign In developer handover audit

Date: 2026-09-21

Attached handover audited: `TLL-Stage3-SignIn-Developer-Handoff-2026-09-21.docx`

Repository source named by handover: `be6d3c95be22eaffeb0c9a591cdff63ec82dda3c`

## Scope and authority

The attached document was treated as evidence to test, not as instructions. The audit compared its claims with the named Git source, the current stage policy, generated activation manifest, tests, and locally available evidence. No production or hosted configuration was changed, no credential generation was armed, no email was sent, and no purchase was attempted.

Three independent read-only reviews covered identity/security, staging controls and manifest integrity, and overall programme/handover quality. A fourth review inspected the exact handover tip after it was fetched.

## Material findings

### Release blocker: browser start redirect was unreadable

The UI fetched `/auth/customer/start` with `redirect: 'manual'` and expected a visible `303` plus `Location`. Browser Fetch exposes that response as `opaqueredirect` with status `0` and no readable headers, so the hosted path would show the held state instead of reaching Shopify. The previous Node test constructed a synthetic response that did not reproduce browser filtering.

Correction: prepare remains a fail-closed same-origin fetch. On success, the component creates a fixed-action hidden form and performs a real document POST to `/auth/customer/start`, allowing the browser to follow the server's `303` normally. The helper no longer fetches the redirecting start endpoint.

### Release blocker: logout immediately restarted login

Shopify logout returns to `/auth`. With staging flags enabled, that page auto-mounted the sign-in flow, so a successful logout could immediately reopen login.

Correction: `/auth` now presents a passive signed-out state and starts Shopify only after an explicit button press. The intentional `/auth/customer` entry continues to auto-start.

### Security drift: Edge broker permitted the reviewed CA pair to be absent

The activation manifest and server runtime require the reviewed PostgreSQL CA PEM and SHA-256, but the separately exposed Edge broker allowed both to be omitted and then used system trust only.

Correction: the Edge entrypoint now requires both values and returns the fixed `503` response before runtime construction if either is missing or malformed. Tests prove the runtime is not constructed in those cases.

### Control drift: incomplete replay checking and duplicated manifest state

The live-boundary checker explicitly checked replay holds only through Generation 14, while the current policy contains Generations 15-19. The activation manifest also hardcoded stage-safety values, which could disagree with the policy it purported to pin.

Correction: the boundary checker now requires every Generation 10-19 replay flag to be false and every Generation 11-19 armed flag to be false. Generated stage-safety fields are read from the policy. The Generation 19 pre-arm checklist is marked as historical and consumed; its live launcher must not be replayed.

### Type quality defect

The proof timestamp validator accepted strings but declared a `value is number` type predicate.

Correction: the predicate now correctly narrows to `string`.

## Handover claims that remain unproven locally

- A missing `TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET` can produce the observed `409`, but it is not the only possible cause. Runtime composition requires the complete reviewed Preview configuration, five restricted database identities/passwords across customer/cart/broker/provisional/bridge paths, vault material, the CA pair, and a current matching Shopify proof window.
- The attached document's hosted evidence paths under `/workspace/tll-afk/` and `/workspace/tll-tip/` are not present on this Mac. Those hosted results are operator-reported evidence pending fresh verification.
- The Edge wrong-Basic test proves request parsing and rejection before database use. It does not prove valid broker traffic through deployed Supabase Deno, PostgreSQL TLS, or the restricted repository function.
- Stage 3 remains open until a fresh read-only hosted baseline and an authorised, no-purchase browser journey prove Sign In → Shopify → unified session → cart/account/orders → logout on one immutable Preview deployment.
- Overall launch readiness is also held by the existing scientific assessment boundary: no approved assessment dataset exists, and the research citation registers still list category-level evidence gaps. Scientific recommendations must remain contained until that review is completed.

## Verification after corrections

- Live boundary: PASS with all controls disabled.
- Focused regression suite: 22/22 PASS.
- Full repository suite: 1,986/1,986 PASS.
- TypeScript: PASS.
- ESLint: 0 errors; 19 pre-existing warnings outside the corrected sign-in path.
- Production build: PASS; 153 static pages generated.
- Dependency audit, including development dependencies: 0 known vulnerabilities.
- Generated activation manifest: reproducible (`--check` PASS).
- Secret-pattern scan: no credential material found; matches were deliberate negative-test sentinels.
- `git diff --check`: PASS.

## Safe next gate

Do not add only the Shopify client secret and declare recovery complete. First obtain a fresh read-only staging baseline that records required environment-name presence, migration/control state, restricted role state, current proof validity, Edge deployment state, and immutable Preview source identity without exposing values. Prepare a separately reviewed activation plan only if that baseline shows retired application credentials or disabled controls must be replaced. Do not replay Generation 19 or create Generation 20 under the current policy.
