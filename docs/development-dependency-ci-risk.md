# Accepted integration: development dependency risk and regression coverage

Read-only assessment on 5 October 2026. Integration checkout HEAD is accepted native `9006e97dc49d402764edab808900048becb4176f`, with accepted privacy `ae436d79aced41487ace1fa3c51cb9a3105da543` being reconciled. This is not a final merged-SHA test receipt, landing approval, or production activation approval.

The resolved working lockfile is byte-identical to native HEAD: SHA-256 `40e1262c6290bc408c112bfd0d5bbd15d5c1ae2cb84d379125bd6f9fb407e0b9`. It retains Next/eslint-config-next 15.5.25, PostCSS 8.5.28, Nanoid 3.3.19 and sharp 0.35.4. Package manager/engines retain npm 11.19.0 and Node 24. No downgrade, override, install, repository edit, credential read, or hosted write was performed for this assessment.

## Observed audit result

The public npm audit endpoint was queried using a temporary copy of that actual lockfile, with scripts disabled and no user npm configuration. Audit client was the available npm 11.6.2; final verification must use the project's pinned Node 24/npm 11.19.0. Temporary audit material is not a committed artifact.

* `npm audit --package-lock-only --ignore-scripts --json`: **37 dependency vulnerability entries: 27 high, 8 moderate, 2 low; 0 critical, 0 informational**. These include transitive/metavulnerability entries, not necessarily 37 distinct advisories.
* Same lock with `--omit=dev`: **0 vulnerabilities in every severity category**. All 37 disappear from the production-only audit; this does not make development/build execution risk-free.

Braces 3.0.3 is marked `dev: true` and is affected by [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Deeply nested brace patterns can exhaust the Node call stack. The advisory affects versions through 3.0.3 and lists **no patched version** (updated 2 October 2026). The returned automated fix suggestion changes eslint-config-next to 14.2.35 with a major-version warning; it is not an acceptable automatic fix for this integration.

Exact affected chains in the lockfile:

* eslint-config-next 15.5.25 → @next/eslint-plugin-next 15.5.25 → fast-glob 3.3.1 → micromatch 4.0.8 → braces 3.0.3.
* vercel 60.1.3 → @vercel/backends 11.0.1 (and several framework builders) → ts-morph 12.0.0 → @ts-morph/common 0.11.1 → the same fast-glob/micromatch/braces chain.

The development portfolio is broader than braces. Direct advisory-bearing entries also include undici (5.29.0 and the nested 5.28.4), its @fastify/busboy dependency, path-to-regexp in Vercel builders, @vercel/python-analysis's js-yaml/minimatch/smol-toml, @vercel/static-config's ajv, @tootallnate/once, and tsx's nested esbuild. This note does not independently close those advisories.

## Bounded CI risk treatment and remaining decision

The existing application workflow uses GitHub-hosted Ubuntu, `permissions: contents: read`, SHA-pinned checkout/setup-node actions, concurrency cancellation, and job timeouts of 10–20 minutes (application 20, accessibility 10). It uses locked `npm ci`, Node 24, synthetic loopback Supabase values and `NEXT_TELEMETRY_DISABLED=1`; the application job does not declare hosted secrets or supplier access. The fresh SQL fixture script refuses existing containers and remote Docker, labels its own container with a UUID, and removes only that labelled container on exit.

Toolchain qualification remains explicit: accessibility and customer/cart jobs install npm 11.19.0 globally; the current application job selects Node 24 but has no corresponding npm-install step. A packageManager/engine declaration alone does not prove the executing npm version. Record Node/npm versions in final evidence and verify the required npm 11.19.0 before calling that run pinned.

For this bounded verification, run reviewed locked source in disposable workers, accept no untrusted uploads or supplied glob/config patterns, provide no hosted credentials, allow no supplier traffic, retain timeouts, and dispose only owned fixtures. Do not claim that a read-only GitHub token makes hostile dependency/source execution harmless. `npm ci` in the application job runs install scripts; the reviewed lock and ephemeral runner are therefore material controls, not a claim of sandboxed package execution. Do not replace the production audit gate with a blanket ignore or unreviewed downgrade.

**Remaining decision:** parent aggregate approval should explicitly acknowledge the 37-entry development portfolio and bounded CI exposure, with braces upstream-unpatched. Production audit is green; development audit is not. Final exact merged-SHA checks and independent review remain required. This document neither accepts production risk nor authorizes activation, deployment, purchases or marketing spend.

## Existing regression commands; no new machinery

Run on the final reconciled SHA using Node 24/npm 11.19.0 and owned synthetic fixtures. These commands are proposed coverage, not results from this read-only assessment.

```sh
npm run lint
npm run typecheck
node --experimental-strip-types --test tests/privacy/*.test.mjs tests/dependencies/native-css.test.mjs
node --experimental-strip-types --test tests/auth-flow.test.mjs tests/customer-auth-mount.test.mjs tests/customer-auth-callback-mount.test.mjs tests/staging-cart.test.mjs tests/staging-cart-transition.test.mjs tests/staging-checkout-readiness-route.test.mjs tests/offer-routing.test.mjs tests/preview-product-assets.test.mjs tests/image-pipeline.test.mjs
npm run test:integration
node tests/browser/staging-cart.mjs
node tests/browser/comparison-reconciliation.mjs
npm audit --omit=dev --audit-level=high
npm run build
node tests/preview-build-runtime.mjs
```

The existing full application composite remains required: `bash tests/run-application-ci.sh` on its permitted fresh GitHub-hosted Linux runner (or the already reviewed owned local/Linux composite). Do not fake its GitHub environment or adopt shared containers. Its `npm test` root glob includes boundary/manifest checks and native tests, but **does not include the new nested privacy/dependency suites**; their explicit command above is necessary. The comparison browser harness covers PR58's six widths and keyboard/scroll semantics with external requests blocked. The cart browser harness uses synthetic API responses and blocks external requests; it also observes and aborts checkout navigation. Integration auth tests use a loopback provider.

For natural privacy behavior, the existing scripts are:

```sh
PRIVACY_APP_URL=http://localhost:3177 node tests/privacy/analytics-choice.mjs
PRIVACY_APP_URL=http://localhost:3177 node tests/privacy/url-minimisation.mjs
```

They require a running local app, installed Chromium and an existing `evidence/privacy` directory; they write evidence there. They contact real Google analytics after synthetic acceptance, so they are separate from offline/no-hosted-write checks and were not executed here. Use the accepted privacy lane's explicit authority before repeating that external telemetry. Intercepted Google responses cannot substitute for their natural-network positive proof. Optional accessibility command already exists as `npm run test:accessibility`.

Integration resolution retains the newer native dependency versions instead of the older main-based privacy pins; consent, minimisation and native CSS/image regressions must pass on the final combined SHA. The unsupported newer hooks-rule suppression was removed to retain the pinned compatible eslint-config-next15.5.25; preference behavior is unchanged. Local verification explicitly installs and logs npm11.19.0. No official-CI execution version is inferred from that local proof.
