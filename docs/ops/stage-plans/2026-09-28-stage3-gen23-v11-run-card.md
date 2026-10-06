# Generation 23 v11: disabled successor and supervised staging run card

This card prepares the successor to the consumed v10 attempt. It is **not permission to publish, deploy the Edge function, activate staging, open temporary database logins, or start the owner journey**. Each external step keeps its existing action-time approval gate.

## Current verified starting point

- Protected branch `codex/tll-integration` and Vercel deployment `dpl_BmvewPvC5rRd8o3AB8cY6qNHrbC3` use disabled correction `7c1138f68776d3b44763214ba14198fa56b9c2c7`.
- The immutable deployment and fixed branch alias are login-protected. Authorised reads returned all four customer/cart flags and checkout handoff `false`.
- V10 is consumed and must never be replayed. Its whole-route journal is HOLD at provider enable, its database retirement record is FINISHED, and its broker-window removal record remains HOLD. Separate reads proved five roles retired, zero sessions, controls OFF and the broker window absent.
- The Stage 3 completion register remains **1 of 8 passed; 7 pending**.

## Disabled v11 identity

- New active/readiness window ID: `02f36f3c-8927-43cc-96a0-067bfa45a973`.
- Exact predecessor: retired v10 window `f1706e78-0b93-4cd5-8336-32e89b4291ad`, expiry `2026-09-28T11:28:00.000Z`.
- New Edge revision: `tll-gen23-v11-secret-key-1`.
- All twenty one-use records use new `-v11.json` paths. The launcher pins the preserved v10 whole-route HOLD, verified database-retirement record and held broker-removal record by SHA-256 before accepting any future arming.
- Every live gate and the expiry remain disabled/unset in ordinary source.

## Required gates before any supervised run

1. Finish the disabled successor source and documentation; regenerate both manifests and pass focused tests, the serial full suite, typecheck, lint, build, live-boundary and diff checks.
2. Obtain an independent review of the exact disabled candidate. The review must verify the v10 predecessor, fresh v11 identity, new record paths, source-off defaults, provider-session drain, dispatch deadlines, shutdown reserve, broker-removal readback and production exclusion.
3. Commit only the reviewed disabled package and durable evidence. Obtain separate action-time approval before publishing that exact commit to the protected branch.
4. Because the Edge source identity changes, obtain explicit approval before redeploying the still-disabled `tll-broker-readiness-g23-v9` function to staging. Prove the served revision is `tll-gen23-v11-secret-key-1`, the broker flag is OFF and the v11 window is absent. Do not accept management metadata alone as served-source proof.
5. Recheck the exact protected Vercel source, login protection, all account/cart/checkout controls OFF, provider disabled, v11 broker window absent, v10 predecessor retired, zero sessions and every v11 record absent.
6. Generate one fresh local-only arming change with a new expiry. Review the exact patch and require enough remaining time for the customer journey plus verified shutdown. Obtain a new action-time approval before running it once.

## Supervised no-purchase route

The fixed launcher first proves protected website and broker readiness while customer controls remain OFF. It then installs temporary staging credentials, proves restricted connections, waits for all Preview-probe sessions to drain, and enables the provider only within its fixed dispatch deadline and before the fifteen-minute shutdown reserve. It may then enable the protected Preview for the guest product/cart, owner Shopify sign-in, owner-only orders, guest-cart transfer, GET/HEAD-only checkout observation and logout checks.

The route must always finish by switching website, checkout, provider and database controls OFF; retiring all five logins/passwords/grants; removing the broker window; and independently reading the final held state. No purchase, payment request, customer campaign or production change is permitted.

If any write reply is uncertain, preserve the one-use record and do not retry. Use fresh read-only evidence and a separately reviewed recovery action. A local rehearsal is not a live customer pass.
