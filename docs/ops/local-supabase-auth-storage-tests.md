# Local Supabase Auth and Storage acceptance

This is a disposable, synthetic integration fixture. It starts the real Supabase GoTrue, Storage API, PostgreSQL, PostgREST, Kong and Mailpit services using **Supabase CLI 2.117.0**. It never links or logs into a hosted project and requires no production secrets. This adds coverage beyond the existing stub-Auth database tests and the Next callback mock server.

## Run locally or on Linux CI

Requirements: Node 24, npm/npx, Docker Engine with permission to create containers/networks, and internet access for the initial public CLI/container-image downloads. No extra npm dependencies or package-file changes are needed.

From the repository root:

```sh
node tests/local-supabase/run-local.mjs
```

The repository must contain the legacy `scripts/accounts-*.sql` files and the Stage 0 integrity migration at `supabase/migrations/202609150001_integrity_boundaries.sql`. To test these files from another checkout, set `TLL_SCHEMA_ROOT` to that checkout. This is a local source path, never a database URL.

A GitHub Actions job can run the same command after checkout and `actions/setup-node` with Node 24. Give the job a 20-minute timeout and `permissions: contents: read`; supply **no Supabase, SMTP or application credentials**. Do not run another instance of this fixture on the same Docker daemon concurrently. The runner pins the CLI version independently of project npm dependencies.

## Isolation and lifecycle

The runner creates a temporary project outside the checkout, with the fixed project ID `tll-local-integration`. Its dedicated Docker bridge is internal and sets `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`; the CLI uses it through `--network-id`. API HTTPS uses port 55521, database 55522 and Mailpit HTTP 55524. All published addresses and the container/network identity are checked before any synthetic signup. Existing unrelated Docker containers are not stopped, removed or reset, and their IDs and port mappings are checked after the run.

The CLI starts with these exclusions:

```text
realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

Realtime, Studio, edge runtime, analytics and vector features are also disabled in the checked-in fixture configuration. The SMTP listener stays inside the Docker network; only Mailpit's inbox HTTP endpoint is published. Before signup, tests assert that GoTrue points to this Mailpit container on port 1025, auto-confirmation is disabled, and Mailpit has no relay/forward setting.

HTTPS uses the CLI's local certificate, which includes `localhost` and `127.0.0.1`. The test reads that public certificate from its own Kong container and passes it as the HTTPS client's explicit `ca`. TLS certificate and hostname verification remain enabled. There is no `NODE_TLS_REJECT_UNAUTHORIZED=0`, browser interstitial bypass or system trust-store change. Requests are restricted to the two exact fixture origins, and redirects are inspected without being followed.

The runner boots only synthetic application prerequisites on top of the managed Auth and Storage schemas. It does **not** install the simplified `auth.users`/`auth.uid()` fixtures from `tests/database/bootstrap.sql`. It applies the actual integrity migration twice, records its SHA256 in the local fixture and prints that digest for traceability. The initial implementation targets the migration including commit `fe93f28` (the database replay entrypoint was updated in `4a56932`). Subsequent runs test the source migration supplied by the checked-out revision.

Synthetic users use random `@example.invalid` addresses and random passwords. Confirmation messages are read from the local Mailpit API; their verification URLs must point back to the local HTTPS API. Session tokens, passwords, credentials and email bodies are not printed. Test objects and users are deleted after the suite. The default runner then stops only this project with `supabase stop --no-backup` and removes its own network and temporary state.

For investigation, `TLL_KEEP_LOCAL_SUPABASE=1` retains this isolated fixture, and the runner prints its temporary path. A subsequent run can set `TLL_LOCAL_SUPABASE_DIR` to that path and pass `--reuse`; it verifies the exact configuration and applied migration digest. Stop a retained fixture using the pinned CLI and the same project directory:

```sh
npx --yes supabase@2.117.0 stop --workdir "$TLL_LOCAL_SUPABASE_DIR" --no-backup
```

The generated local CLI log can contain disposable service credentials. It is outside the repository; do not publish it as a public CI artifact. The acceptance test output contains no credentials.

## Assertions

1. Actual email signup inserts a profile through the real `auth.users` trigger before any fallback profile RPC. Unconfirmed accounts cannot sign in, and untrusted signup metadata cannot set points or a paid avatar.
2. Local email confirmation yields a verified GoTrue user and a working password login. The test captures the message and checks the returned local redirect without navigating it.
3. Real user JWTs permit own display-name edits, deny authoritative-column writes, hide another user's private profile and prevent another user changing it.
4. Concurrent authenticated signup-point calls award once. Referral metadata creates the protected relationship, and concurrent referral claims credit the referrer once.
5. Actual Storage permits own-folder PNG upload and intended public image read. Anonymous upload, cross-folder upload, overwrite and deletion cannot change the owner's object.
6. Custom-photo selection requires an earned unlock. A synthetic administrator credit enables a concurrent paid unlock, which spends once; the real HTTPS Storage URL can then be selected, and another user's folder or unowned premium avatar is rejected.

## Status and practical limits

The harness was prepared and syntax-checked on macOS. **The Auth/Storage suite has not yet executed successfully there**: Docker left new containers in `Created` while `docker start` hung. The same happened with tiny no-bind probes, a separate internal network and a non-internal loopback network. Moving the CLI runtime out of iCloud to `/tmp` did not resolve it. The already running PostgreSQL/PostgREST fixtures remained healthy; the Docker daemon was not reset. Linux CI is the intended next execution environment for this suite. Do not report these assertions as passed until its real service run succeeds.

This fixture is not hosted staging, a production migration approval, an email deliverability test or a browser/customer-journey test. It does not upload a Shopify theme, connect accounts across sites, or contact a real mailbox. The avatar guard's existing URL-host limitation remains: it validates an HTTPS avatar path and caller folder, but does not pin the origin. This suite tests the currently implemented folder/unlock boundary; origin hardening needs a separately defined trusted storage-origin policy.

References: [Supabase CLI configuration](https://supabase.com/docs/guides/local-development/cli/config), [Docker bridge binding options](https://docs.docker.com/engine/network/drivers/bridge/#default-host-binding-address), and [Supabase CLI Kong service source](https://github.com/supabase/cli/blob/develop/apps/cli/src/commands/start/services/kong.service.ts).
