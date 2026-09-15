# Stage 0 release controls

This branch is implementation work. A passing local check does not establish a production release, hosted staging isolation, or complete operational acceptance.

## Supported runtime and dependencies

Use Node 24 and npm 11.19 with the committed lockfile. The project declares the npm version because older npm 11 builds can omit transitive WASM dependency records that the Linux runner requires. If the system npm is older, use `npx --yes npm@11.19.0 ci` without changing the global installation. Next and its ESLint configuration use the same maintained 15.5.25 release. The stable Next 15 lint configuration is loaded through FlatCompat; builds no longer bypass ESLint errors.

Next 15 pins older transitive image/CSS packages. Scoped overrides select PostCSS 8.5.28 and sharp 0.35.4, and compatible transitive updates resolve the remaining advisory ranges. Retain the scoped overrides until an upstream framework release supplies safe versions. Re-run the complete build, image and auth tests before changing them. The local audit on 15 September 2026 reported zero vulnerabilities; dependency advisories are checked again in CI rather than treating that snapshot as permanent.

The repository's AGENTS.md requests framework docs inside `node_modules/next/dist/docs/`. That directory is absent from the installed Next 15 package. Use the official version-15 documentation for this branch; do not infer Next 16 APIs from the old prerelease ESLint configuration.

## Preview isolation

`next.config.ts` checks preview configuration before the build. A Vercel preview must set all three variables below for **Preview only**:

- `NEXT_PUBLIC_TLL_ENVIRONMENT=staging`
- `TLL_STAGING_SUPABASE_PROJECT_REF` set to a separate hosted staging project's reference.
- `NEXT_PUBLIC_SUPABASE_URL` set to that project's HTTPS origin, with its matching public key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The staging reference must not be the existing production project's public reference. An explicitly declared staging project must use its matching HTTPS origin. Misleading origins and partial staging settings are rejected. Existing production deployments are unchanged. Environment-variable values and credentials must not be committed or printed in logs.

When Vercel Preview has no staging configuration, or inherits the known production project, it builds in **synthetic visual-preview mode**. This preserves the follow-up preview-build work added in commit `9434539`, while making the resulting deployment visibly inert:

- `NEXT_PUBLIC_TLL_ENVIRONMENT=synthetic-preview` distinguishes a visual preview from configured staging. The fallback removes the staging project marker and uses the reserved `https://tll-preview.invalid` origin, never a guessed Supabase tenant.
- Every direct Supabase client has a shared transport guard. In synthetic mode it returns a controlled 403 locally, before network access or Auth retry loops. This also covers server rendering outside route handlers.
- Middleware returns a clear 503 response for all API paths and non-GET/HEAD requests before application handlers. Sign-in, account, rewards, contact and submission pages show an explicit unavailable page. The auth/contact/submission client pages also have their own visual-mode boundary.
- Every page has a visible preview notice explaining that data, accounts, forms and purchases are disabled and that empty product lists do not represent the live catalogue. Retailer buy-link helpers stay on the local preview information page.
- The production Google Analytics scripts and event helper are disabled. Preview responses are marked `noindex, nofollow`; robots disallows crawling. A preview-only CSP permits application connections only to the same origin and blocks form submissions and frames.

This does not create hosted staging. An explicit isolated project still needs its own Auth callbacks, sender recipient allowlist, Storage, policies and supplier test endpoints. A correct URL alone does not prove those controls. Remove inherited production secrets from the Vercel Preview environment separately: build-time public-value replacement does not change the platform's stored runtime credentials, and the current isolation must not be treated as permission for future standalone scripts or integrations to use them.

Run the preview regression checks with:

```sh
node --experimental-strip-types --test tests/preview-isolation.test.mjs tests/preview-mode.test.mjs
node tests/preview-build-runtime.mjs
```

Run the second command serially with other Next build/dev tests because it uses this checkout's `.next`. It mocks Google Fonts with Next's bundled local font and blocks every external socket/fetch in Next workers. It builds with an inherited production URL and fake credentials, checks compiled server/browser output for the reserved origin, starts the real build with deliberately conflicting runtime environment values, and verifies the notice, form/account containment, API denials, absent GA script and robots policy. No production credential or live-service call is used.

## Required checks and release record

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm audit --omit=dev --audit-level=high`, then `npm run build`. Auth integration starts an isolated Next process and loopback fake auth provider; do not run it concurrently with a build sharing the same `.next` directory. CI uses synthetic loopback configuration and has no production credentials.

The separate database CI job runs `bash tests/database/run-local.sh`. It creates uniquely named disposable PostgreSQL 17 and PostgREST 16.3 containers, bootstraps only synthetic users, applies and tests the migration twice, runs real competing-session reward checks, then exercises the direct Data API with signed fixture JWTs. The trap removes only containers/network created by that run; it does not reset an existing local database. Docker, Python 3, Node 24 and curl are required. The fixture password and JWT signing secret are public test constants and must never be reused in a hosted environment. The database guide explains the assertions and remaining real Supabase Auth/Storage acceptance.

Before production, retain the exact commit, migration identity, private backup/preflight record, passing check output, intended environment/target and compatible rollback revision. Recheck the remote main branch and deployment state to avoid overwriting another release. Review actual hosted staging and production smoke results before closing the finding. Production account creation, emails or paid fulfilment are not implied by offline tests.

## References

- [Next image-optimization advisory and patched ranges](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
- [Next.js 15 ESLint configuration](https://nextjs.org/docs/15/app/api-reference/config/eslint)
