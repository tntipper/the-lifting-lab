# Temporary F21 Vercel forwarding-header proof

This branch temporarily adds `/api/staging/ip-proof` to test what reaches the existing `vercelClientIdentity` function after Vercel processes forwarding headers. It is disabled by default. It has no database, account, email, supplier or checkout side effects. Remove the route, client and their tests after acceptance, before any production release.

## Why a deployed proof is needed

The [Vercel request-header documentation](https://vercel.com/docs/headers/request-headers) says Vercel overwrites `x-forwarded-for` to prevent spoofing and describes `x-vercel-forwarded-for` as the same client address. The existing submission gateway considers only `x-vercel-forwarded-for`, requires a Vercel production/preview runtime, rejects missing/multiple/invalid addresses and canonicalises IPv6. It never falls back to generic forwarding headers.

The [reverse-proxy documentation](https://vercel.com/docs/security/reverse-proxy) explains that another proxy can change client identity visibility and that supported verified proxies use provider-specific headers. The local tests prove our parser and gates, not Vercel's edge behaviour. No existing application response supplies a suitable private proof. A signed header or a platform log is not, by itself, evidence that this handler used the intended identity.

The installed Next 15 package does not include the `node_modules/next/dist/docs` directory requested by `AGENTS.md`; the authorised fallback is the [official Next 15 route-handler reference](https://nextjs.org/docs/15/app/api-reference/file-conventions/route). This route explicitly uses the Node runtime, dynamic execution and no-store responses.

## Enable for one reviewed preview only

The release operator must first verify that the exact deployment is a **Preview**, uses the isolated hosted staging environment, and belongs to the reviewed branch/commit. Do not enable or run this proof against production, a custom commercial domain, or an unknown alias. Keep Vercel's existing deployment protection. This task does not authorise creating any additional bypass token.

Provision these **server-only, branch-scoped Preview variables** for a single acceptance run; none may have a `NEXT_PUBLIC_` prefix:

| Variable | Required value |
| --- | --- |
| `TLL_IP_PROOF_ENABLED` | `true` |
| `TLL_IP_PROOF_KEY_HEX` | Fresh cryptographically random 32-byte secret, lowercase hexadecimal; never reuse a submission signing/privacy key |
| `TLL_IP_PROOF_RUN_ID` | Fresh random 16-byte run identifier, lowercase hexadecimal |
| `TLL_IP_PROOF_EXPIRES_AT` | Unix time in **milliseconds**, about 30 minutes after provisioning; route refuses expired values or a remaining lifetime over one hour |

The route additionally requires `VERCEL=1`, `VERCEL_ENV=preview` and the compiled hosted-staging marker. A production runtime or disabled hosted-staging handler returns 404 even if other variables accidentally exist. In a synthetic visual preview, the existing middleware intentionally intercepts every API request first and returns its inert 503 response; this temporary route does not weaken that containment. Wrong/missing keys, run identifiers and supported non-GET methods also return 404. Credential comparison uses `timingSafeEqual` on fixed-length decoded keys. Do not enable debug request/header logging in the app or platform.

## Run and interpret

After the deployment is ready, the operator can feed a private in-memory JSON object to `node scripts/staging-ip-proof.mjs` over stdin. Do not put secrets in shell arguments, URLs, output, source files or this document. The object has `origin` (the exact reviewed HTTPS `*.vercel.app` origin), `verifiedEnvironment: "hosted-staging-preview"`, `keyHex`, `runId`, and optionally an **existing authorised** `deploymentProtectionBypass`. The client does not obtain or provision credentials. Its explicit context value is operator binding, not independent deployment attestation.

The client first requires missing-key and wrong-key requests to return 404. It then sends three requests for each spoof case: a baseline, the spoof and another baseline. Cases cover generic forwarding headers, all three IPv4 TEST-NET blocks, an IPv6 documentation address, a multi-address trusted-header value and combined forwarding/proxy headers. These are synthetic documentation addresses only.

An authenticated response contains exactly `matches_documentation_spoof` and an HMAC `fingerprint`, keyed by the temporary secret and scoped to the configured run. It never returns an IP, headers, cookies, JWTs or secret. A missing/invalid trusted identity yields a null fingerprint and fails proof. Generic-header changes must leave the fingerprint unchanged. A documentation-address match or changed probe fingerprint is failure. Changing unspoofed baselines makes the run inconclusive; repeat from stable egress rather than accepting it. All results are uncached.

Retain only the client's minimal result with the reviewed commit/deployment metadata and run time in private implementation evidence. No raw headers or credentials belong in the report. The HMAC is a temporary correlation signal, not a claim of irreversible anonymisation. A pass covers that tested preview origin and egress path; it does not establish production custom-domain/proxy behaviour, rate-limit configuration or the separate F21 database boundary.

## Disable and remove

1. Immediately unset all four `TLL_IP_PROOF_*` variables for the staging branch and deploy the branch with this route removed. Remove `scripts/staging-ip-proof.mjs` and `tests/staging-ip-proof*.test.mjs` with it. Retain only the acceptance result/runbook as appropriate.
2. Verify the exact acceptance URL returns 404 after removal/disable; do not assume editing project environment settings changes an existing immutable deployment. Remove or protect the temporary deployment if it remains reachable. The mandatory expiry independently closes its copied configuration.
3. Confirm the route and temporary secret are absent before production promotion. Do not place this instrumentation on the production release branch.
4. Delete local private copies of the temporary credential; retain only redacted acceptance evidence. No database cleanup is required.
