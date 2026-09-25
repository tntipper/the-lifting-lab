# Stage 3: next broker-rotation gate (preparation only)

**Status:** HOLD for execution. This plan does not authorize a credential window, provider update, account/cart activation, or Git publication.

## What is established

- The official one-use staging read on 25 September returned `SAFE_HELD_PROVIDER_OBSERVED`: the custom OAuth2 provider is disabled, the exact retained JWKS address is present, the broker secret name is absent, and database controls are off. Its journal is consumed. The earlier two-field update did not satisfy its acceptance condition and must not be replayed.
- The signed-in Supabase editor still showed the provider disabled with that address on 25 September. The Vercel dashboard showed protected Preview `dpl_9CFPQG6JChoGrkWidhh73BY1Qj1b` Ready from source `abd5a5258dd1072daf83a4447ce7110465f445e1`. These UI observations do not replace the official API or protected runtime proofs.
- The original disabled compatibility source is `adda1f54d060a4564325d5e5ae5109e812ec56de`. Its rotation code pins the retained address and omits `jwks_uri` from a future update. The subsequent disabled guard change requires all permitted starting settings before generating a credential; its focused/full tests, typecheck, targeted lint, both manifest checks and live-boundary check passed. Neither change has been deployed to Preview.
- Independent publication review found no actionable runtime defect in the 72-commit local/remote gap, but recommended **no automatic push**. The existing publisher has empty source-selection fields and its previous journal is consumed. A new publication package would be required if later proof actually needs the deployed source to equal local HEAD.

## Smallest next slice

1. Keep the current protected Preview. Its sign-in runtime and readiness contract are unchanged by the local retained-JWKS repair. Check the remote branch and deployment identity again immediately before any hosted read; stop if either moved.
2. **Completed in disabled source:** the rotation function now requires the complete permitted starting provider configuration **before** credential generation. It accepts the two scope states observed by the safe-held reader, while unexpected scopes, endpoints and other projected settings stop with zero generated credentials, journal or host writes. Focused and full tests passed; an independent review returned GO for disabled preparation. The eventual update still omits `jwks_uri` and the old failed normalization contract remains untouched.
3. Prepare one fresh, bounded execution package only after the review: exact source commit, isolated checkout, all required gates initially off, pinned targets, direct launcher, finite parent and child deadlines, no inherited credentials, and an exact minimal arming/disarming diff. In addition to the existing rotation journal, require a private durable phase receipt recorded before work and before each host write/provider update, with the deadline and categorical outcome. A separate read-only process must reconcile each phase after the run. Test startup and all dynamic imports offline before opening a credential window. A source-only state machine is not a live launcher.
4. Independently review the package and arming diff. Immediately before any run, obtain a new official read-only staging baseline and a protected Preview identity/readiness check. Require the exact disabled provider settings and retained JWKS address, absent broker secret names, database controls off, and four account/cart switches false. Bind the complete provider baseline to the package's pre-generation check; a mismatch stops without creating or staging credentials.
5. Seek separate action-time owner approval for the **specific** one-run credential and provider window. On an approved run, make at most one provider update. Verify every provider field and both host secret names through independent readback; record a terminal result; disarm. Never replay a consumed or uncertain journal. Account/cart activation remains a separate gate and requires an owner-email sign-in, logout and recovery journey without purchase.

## Publication decision

Do not publish `adda1f5` merely to repeat the current read-only provider check. If the next strict hosted baseline reports `CURRENT_SOURCE_NOT_DEPLOYED`, treat that as a source mismatch, not as a provider failure. Prepare a separate reviewed Preview-only publication selecting exactly `adda1f54d060a4564325d5e5ae5109e812ec56de` from remote predecessor `abd5a5258dd1072daf83a4447ce7110465f445e1`, with a fresh journal and post-deployment source/disabled-runtime proof. Never reuse the previous publication launcher state or journal.

## Stop conditions and evidence to keep

Stop on changed provider/Preview identity, source or manifest mismatch, any enabled account/cart control, missing dependency, stale token, Keychain denial, timeout, uncertain provider response, or incomplete readback. Preserve the private journal and report what was proved; do not retry under the same approval. This plan changes no hosted state and does not claim the real OAuth2 sign-in path has passed.

If a host write fails before the provider update, attempt removal within a separate finite cleanup budget. Only a confirmed absence of **both** secret entries permits `STOPPED_BEFORE_PROVIDER_UPDATE`. A failed removal, lost acknowledgement or exhausted cleanup deadline remains `RECONCILIATION_REQUIRED` and requires the separate read-only reconciliation process. Offline tests must cover all three cases; the existing focused tests do not.

**Next code slice:** implement and test the additional per-effect phase receipt and its separate read-only reconciliation, with live gates off. Do not arm the source-only rotation function or infer that the passing guard tests qualify a credential window.
