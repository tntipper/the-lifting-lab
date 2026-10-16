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

The runner creates a temporary project outside the checkout, with the fixed project ID `tll-local-integration`. Its dedicated Docker bridge remains internal and sets `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. Docker 28 does not publish ports on an internal bridge; verified Linux loopback relays provide the host-side connectivity needed by the CLI while preserving container egress isolation. API HTTPS uses port 55521, database 55522 and Mailpit HTTP 55524. Container/network identities and addresses are checked before synthetic signup. Existing unrelated Docker containers are preserved and checked after the run.

On Linux, Docker 28 skips host port publication for an internal-only bridge. The harness therefore opens three built-in Node TCP relays on **127.0.0.1 only**, before the CLI's first host-side bootstrap query. They forward to the dedicated PostgreSQL container on 5432, Kong on 8443 and Mailpit on 8025. A local Unix-socket Docker daemon is required; remote TCP/SSH Docker contexts are refused. Each connection freshly verifies the exact allowlisted container name, project label, running state, sole network identity, network ownership/internal flag, private IPv4 subnet and matching network membership before opening its upstream socket. Unknown or invalid destinations close the connection. There is no relay image, second Docker network, SMTP host listener or external network access. macOS/Windows retain the existing Docker Desktop path because their hosts cannot directly route to the VM's bridge addresses.

These relays copy raw bytes, so HTTPS still terminates at Kong and the client's explicit CA and hostname verification still apply. They close all listeners and active connections before fixture shutdown, including failures and retained-container runs. `--reuse` opens them again for the duration of the run. Occupied local ports fail rather than reusing an unknown listener.

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

The harness was prepared and syntax-checked on macOS. **The Auth/Storage suite has not yet executed successfully there**: Docker left new containers in `Created` while `docker start` hung. The same happened with tiny no-bind probes, a separate internal network and a non-internal loopback network. Moving the CLI runtime out of iCloud to `/tmp` did not resolve it. The already running PostgreSQL/PostgREST fixtures remained healthy; the Docker daemon was not reset. The first Linux CI attempt reached database startup, then failed its host connection on 127.0.0.1:55522; Docker 28's internal-network port-publication behavior accounts for this. The relay fix has 31 passing network-isolation and local socket regression tests, including binary round-trip, half-close, occupied ports and cleanup during an unresolved destination. Run them with `node --test tests/local-supabase-relay.test.mjs`; no Docker or external network is needed. The full Linux service run remains pending. Do not report the real Auth/Storage assertions as passed until that run succeeds.

This fixture is not hosted staging, a production migration approval, an email deliverability test or a browser/customer-journey test. It does not upload a Shopify theme, connect accounts across sites, or contact a real mailbox. The avatar guard's existing URL-host limitation remains: it validates an HTTPS avatar path and caller folder, but does not pin the origin. This suite tests the currently implemented folder/unlock boundary; origin hardening needs a separately defined trusted storage-origin policy.

References: [Supabase CLI configuration](https://supabase.com/docs/guides/local-development/cli/config), [Docker internal network host access](https://docs.docker.com/reference/cli/docker/network/create/#network-internal-mode---internal), [Docker 28.0.4 internal-network publication gate](https://github.com/moby/moby/blob/v28.0.4/libnetwork/endpoint.go#L698-L707), [Docker bridge binding options](https://docs.docker.com/engine/network/drivers/bridge/#default-host-binding-address), [pinned CLI database startup](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/db-bootstrap/start-database.ts), and [pinned CLI Kong service](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/commands/start/services/kong.service.ts).
