# Stage 3 sign-in handover audit corrections

## Scope and stop conditions

This work unit audits the developer handover against source commit `be6d3c95be22eaffeb0c9a591cdff63ec82dda3c` and corrects defects that can be proven locally. It does not arm a credential generation, alter hosted secrets, deploy, contact customers, or make a purchase.

The work stops fail-closed if the repository is armed, the generated activation manifest cannot be reproduced, or any focused/full verification fails.

## Findings to correct

1. Browser `fetch(..., { redirect: 'manual' })` exposes a redirect as an opaque response, so the sign-in component cannot read the start route's `303 Location` and cannot reach Shopify in a real browser.
2. Shopify logout returns to `/auth`, where the staging component immediately starts another sign-in attempt.
3. The Edge subject-broker entrypoint permits the reviewed PostgreSQL CA pair to be absent even though the activation manifest requires it.
4. The live-boundary checker does not explicitly verify Generation 15-19 replay holds, and generated stage-safety fields duplicate policy values instead of deriving them.
5. The proof timestamp predicate has an incorrect TypeScript type guard.
6. The attached handover overstates the missing Shopify client secret as the only likely blocker. Runtime admission depends on the complete reviewed Preview configuration and a current proof window; hosted evidence referenced under `/workspace/tll-afk` is not present on this Mac.

## Implementation sequence

1. Replace the unreadable fetch redirect with a same-origin document form POST. Keep prepare as a fetch so failures remain generic and fail-closed.
2. Make `/auth` a passive signed-out screen in staging and require an explicit button press; keep `/auth/customer` as the intentional auto-start entry.
3. Require the CA PEM and SHA-256 in the Edge entrypoint before creating a database runtime.
4. Extend policy checks through Generation 19 and derive manifest stage-safety values from the parsed policy.
5. Correct the timestamp type predicate.
6. Add regression tests for opaque redirect avoidance, passive logout landing, explicit form navigation, required CA configuration, and complete replay holds.
7. Regenerate the activation manifest, then run focused tests, manifest check, boundary check, full tests, typecheck, lint, build, and production dependency audit.
8. Update the repository handover with the exact audited commit, verified results, unresolved hosted prerequisites, and the next stage gate.

## Acceptance

- A real browser no longer needs to inspect a manual redirect response.
- Landing on `/auth` cannot automatically reopen Shopify login.
- Missing CA configuration returns the fixed `503` response without opening a pool.
- Generation 10-19 replay flags and Generation 11-19 armed flags are all checked from the policy.
- Generated stage-safety values match policy values by construction.
- All verification commands pass with controls disabled and no live action.
