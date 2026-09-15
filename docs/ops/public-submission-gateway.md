# Public submission gateway (F21)

The contact and supplement forms now submit through a validated server gateway and a narrowly authorized database function. Both application and database switches default to disabled. This commit contains no live credentials, notification integration or activation. Deploying these routes without provisioning the gateway deliberately returns a temporary-unavailability message.

## Request and privilege boundaries

The existing `/api/contact` and `/api/submit-supplement` URLs remain. Their shared Node handler requires an allowed origin, JSON content type, a bounded streamed body, a UUIDv4 idempotency header and validated fields. The contact limits are 120 characters for name, 254 for email and 8,000 for message. Supplement limits are 120 for brand, 200 for product, 2,048 for URL, 4,000 for notes and 254 for optional email. Unknown properties, wrong types, invalid category/email/URL, control characters and unpaired surrogates are rejected. URLs are HTTPS references only; the gateway never fetches them. Submitted text remains untrusted when displayed by future staff tools.

Runtime identity comes only from `x-vercel-forwarded-for`, with `VERCEL=1` and `VERCEL_ENV` equal to `production` or `preview`. It must contain exactly one valid IP address. Generic `x-forwarded-for` and `x-real-ip` are not fallbacks. IPv6 spellings are canonicalized before hashing. This relies on Vercel's documented proxy boundary; it is not portable to an arbitrary self-hosted server merely by copying headers. A preview test must prove the actual platform overwrites spoofed client headers before release. Test identity injection exists only through the explicit handler dependency seam; there is no environment-variable fixture identity or runtime fallback. See [Vercel request headers](https://vercel.com/docs/headers/request-headers) and [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

The route signs an exact UTF-8 JSON string using HMAC-SHA256. The envelope binds version, deployment-specific audience, form kind, issuance time, request UUID, separately keyed IP/email subjects, the exact normalized body string and its SHA-256. The string is transmitted unchanged. PostgreSQL verifies its original bytes before parsing, avoiding cross-runtime JSON canonicalization assumptions. A fresh random HMAC blinding key is used for the final signature comparison so equality timing does not reveal a stable expected-MAC prefix. Node and PostgreSQL use their built-in [HMAC implementations](https://www.postgresql.org/docs/current/pgcrypto.html).

The HTTP transport calls only `public.submit_public_form(text,text,text)` through the public Supabase API credential, plus the signed capability. It never loads a service-role key, opens a raw SQL connection or forwards browser authorization/cookies. The signing secret is not a request parameter. Production transport accepts only the configured HTTPS Supabase project origin, refuses redirects and times out after five seconds. Responses and application logs contain no submitted text, email, IP address, signatures or raw upstream errors.

The new function is owned by `tll_submission_owner`, a `NOLOGIN`, non-superuser, non-`BYPASSRLS` role with no role memberships. It has only the necessary insert columns on the two inboxes and access to its private policy, keys, quotas and receipt records. It has no inbox SELECT privileges and cannot edit keys or policy. The function uses fully qualified names, a fixed empty search path, a two-second lock timeout and no dynamic SQL. Its private helper and private schema are unavailable to browser roles. This follows [PostgreSQL function security guidance](https://www.postgresql.org/docs/current/sql-createfunction.html).

The migration removes table-level and column-level grants from `PUBLIC`, `anon` and `authenticated`. It checks their *effective* remaining permissions and aborts transactionally if a shared inherited role still supplies access. It does not silently modify that shared role. Client-applicable policies are removed; when a policy also explicitly names a separate staff/service role, that named role and its predicates are retained. Existing table ownership, rows, service grants and separate staff policies remain. An admin workflow implemented solely through the generic authenticated role must be identified before release and moved to a reviewed staff boundary; this migration does not grant every authenticated user inbox access. [PostgreSQL grants are cumulative, including PUBLIC defaults.](https://www.postgresql.org/docs/current/ddl-priv.html)

Effective privileges are checked again after creating all private objects, including inherited schema, table/column and function default ACLs. Any private browser authority aborts the whole migration rather than quietly granting access to a key table. Ownership transfer temporarily grants the migration role SET ROLE authority and the new function owner CREATE on `public`. PostgreSQL 16+ automatically gives a non-superuser role creator ADMIN membership recorded as granted by the bootstrap superuser; that creator cannot directly revoke it. For a newly created owner, this migration uses a transaction-only NOLOGIN/CREATEROLE setup role, revokes its temporary grant, and drops the setup role before commit. Dropping it also removes its automatic ADMIN membership. Final checks require no setup role, no owner memberships in either direction and no owner CREATE on `public`. The non-superuser regression uses session authorization, so a superuser session's SET ROLE powers cannot mask the transfer requirements. A non-superuser CREATEROLE/schema-owner fixture verifies the hosted permission requirements. Later function-owner changes require a migration administrator with authority to manage that role; no lasting membership is retained as a shortcut.

HTML character limits do not measure encoded request bytes. Both forms therefore use the browser-safe shared 16 KiB UTF-8 JSON limit before issuing a request and display a message asking the user to shorten oversized text. The server independently retains its streamed byte cap.

## Durable quotas, retries and retention

Every valid signed request is validated again in the database. The accepted envelope is at most 40 KB, allowing JSON escaping overhead; its decoded body string is limited to 16 KiB. A short transaction advisory lock serializes the global cap, all subject counters and idempotency decisions. Counter consumption, receipt creation and inbox insertion commit together. A failed insert rolls back all three. Neither process memory nor an instance-local cache decides admission.

Initial engineering limits are deliberately conservative and configurable in the private policy row:

| Scope | Window | Maximum accepted submissions |
| --- | --- | --- |
| Same IP digest across both forms | Fixed 10 minutes | 3 |
| Same IP digest across both forms | UTC day | 10 |
| Same normalized email digest across both forms, when present | UTC day | 5 |
| All subjects and both forms combined | UTC hour | 100 |
| All subjects and both forms combined | UTC day | 500 |

These are abuse-control settings, not an owner-approved marketing or commercial policy. Review legitimate traffic and shared-network effects before activation. Fixed windows allow a burst on either side of a boundary. Rotating IPs and emails can evade subject-specific quotas, while the global cap still limits accepted inbox growth. Origin checks do not authenticate non-browser clients. Invalid/unsigned traffic is rejected before quota storage; infrastructure request-volume protection remains necessary for volumetric attacks. No claim of comprehensive bot prevention is made.

Raw IP addresses are never stored in quota records. Email and IP subjects use domain-separated HMACs with a privacy key distinct from the signing key. Email normalization lowercases the whole address for conservative anti-abuse grouping; the original address is retained only in its private inbox. Do not treat hashes as anonymous data for policy purposes.

The forms retain the same UUID for retries of unchanged content. Successful duplicate requests return the same generic receipt without another row or quota charge. Reusing a UUID with changed content, form or subject returns conflict. Receipt records last 72 hours. Quota records expire one day after their window ends. Each successful request removes at most 1,000 expired records of each type. Cleanup pauses when traffic stops; operational retention monitoring should trigger a bounded privileged cleanup if needed. Inbox retention is separate and no historical inbox rows are deleted by this gateway. Inbox UUID uniqueness prevents an expired receipt ID from creating a second row; after the 72-hour replay window an old retry can fail and must not be silently reissued with a new ID by a worker.

`202` means received in the inbox; it does not mean emailed, published, scored or answered. The forms now say received for review and make no automatic-email or response-time promise. Errors distinguish invalid/oversized format, quota delay, conflict and temporary unavailability. `429` includes `Retry-After`; uncertain transport results retain the same form UUID for retry.

## Key lifecycle and activation gates

No key material belongs in Git, command output, issue comments or browser configuration. All environment names below are server-only except the existing public Supabase project URL/key. Each deployment environment needs its own isolated database, signing key and audience. Production secrets must not enter previews.

Required server configuration:

- `SUBMISSIONS_ENABLED=true` only after release acceptance; absent/false disables submissions.
- `SUBMISSIONS_ALLOWED_ORIGINS`: comma-separated exact canonical HTTPS origins, without trailing slash or wildcard.
- `SUBMISSIONS_AUDIENCE`: `tll-submissions:` followed by the reviewed environment identifier.
- `SUBMISSIONS_KEY_ID`: identifier matching the private key row.
- `SUBMISSIONS_SIGNING_KEY_HEX`: independently generated 32-byte random key encoded as 64 lowercase hex characters.
- `SUBMISSIONS_PRIVACY_KEY_HEX`: a different independently generated 32-byte key; keep stable across ordinary signing-key rotations so quotas remain continuous.
- Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for that environment.

The private database policy must separately have the matching audience and `enabled=true`. Signing-key rows hold only a key identifier, 32 secret bytes, activation/expiry times and revocation flag. The database enforces a maximum **30-day** lifetime. There is no embedded perpetual fallback key. Envelopes must be within **300 seconds old** or **30 seconds ahead**, and their issuance must fall within the key's validity interval. Unconfigured, expired, not-yet-valid and revoked keys fail closed.

Provision keys later using an approved secret-management channel. The private key table and database backups contain sensitive signing material; include them in restricted backup and incident procedures. To rotate an ordinary signing key: provision a fresh ID/key with bounded validity, deploy that ID/key to the corresponding server environment, prove successful synthetic receipt/retry tests, wait at least the 330-second envelope window plus in-flight request allowance, then revoke the old key. Keep overlap short. Set an operational expiry alert before day 30; this commit does not schedule one. For compromise, revoke immediately, disable admission if necessary and rotate without preserving an unsafe overlap.

Changing the privacy key changes quota subjects. Do not combine routine signing rotation with a privacy-key change. If a privacy rotation is required, disable both gateway switches, let all signed envelopes and in-flight requests expire, coordinate the switch at a UTC daily boundary, and preserve global counters. This prevents old and new subject hashes supplying separate allowances inside one active subject window.

Before production release:

1. Apply/replay the migration only against the isolated preview database. Inspect schema, all effective table/column grants, owner role configuration and staff compatibility; unexpected inherited privileges stop the migration.
2. Provision environment-specific keys privately, configure origins/audience, and enable only the preview policy/server switches.
3. Run the tests below and prove actual Vercel header provenance, public REST rejection, key rotation/expiry, valid contact/suggestion receipts and visible retry/error behaviour in that preview.
4. Assign a named triage owner, a monitored private queue and a retention policy. Verify the owner can see a synthetic receipt while ordinary users cannot. No notification service or staff UI is created here, so this monitoring gate remains open until separately implemented and verified.
5. Release the database boundary and server code as one controlled change. A route-only rollout leaves direct writes exposed; a database-only rollout breaks the old public-client routes. Keep submissions visibly unavailable during any transition rather than restoring broad grants.

Rollback means disable the gateway and revoke its signing keys while preserving private inbox records. Do not restore unconditional public INSERT/SELECT, undo existing integrity migrations, or replay the old submission-table script. A forward compatibility fix or reviewed staff-only path is safer than reopening the bypass.

## Synthetic local and Linux CI acceptance

Run the complete container suite on a Linux host with local Docker and Node 24:

```sh
node --test tests/submissions/harness.test.mjs
node tests/submissions/run-local.mjs
```

The independent `submissions` job in `.github/workflows/ci.yml` runs these commands. No npm dependencies, project credentials or live service connection are needed. `--help` and `--plan` inspect usage without Docker side effects. There are no options for alternate credentials, database URLs, service hosts, preserved containers or production targets.

The runner requires a local Unix Docker socket, rejecting remote Docker contexts before any connection or mutation. It pulls `postgres:17-alpine` and `postgrest/postgrest:v16.3`, creates a unique labelled network without external egress and starts two disposable containers. PostgreSQL has no published host port. The API publishes only an ephemeral `127.0.0.1` port; the runner verifies Docker's actual binding before making HTTP requests. All database content and credentials are synthetic. The API connects through a dedicated NOINHERIT authenticator granted only the two browser roles, not through a superuser or service-role API credential.

PostgreSQL readiness uses TCP so the image's temporary initialization server is insufficient. PostgREST readiness requires a successful OpenAPI response containing the migrated RPC. Each readiness check has a 60-second deadline; subprocesses also have bounded timeouts. Failure or interruption attempts cleanup of only this run's containers and network after verifying their ownership labels. Cleanup errors fail the job and identify unresolved task-owned resources; the runner never prunes unrelated Docker resources. It prints acceptance success only after successful cleanup.

The execution order is 55 gateway tests, 19 SQL suites (including bootstrap and initial migration), a guarded second migration attempt, and 5 HTTP tests. This migration is intentionally **one-time**, because its private schema/function must not already exist. The second attempt must stop at the exact collision guard. Complete before/after database and role dumps must have identical SHA-256 fingerprints, excluding only `pg_dump`'s random psql restriction tokens. A different failure, successful blind replay or changed dump is a failing check. Normal releases use migration history to skip an already-applied version; they do not replay this file blindly.

The 11 harness tests run without Docker and exercise argument/target restrictions, remote-context rejection, port binding checks, SQL/replay/HTTP ordering, bounded readiness, failure/interruption cleanup and ownership-label protection. These orchestration tests do not substitute for actual HTTP acceptance.

For an already-running local synthetic fixture, these focused checks remain available; only `tll_submission_test` within the known `tll-stage0-postgres` container is reset:

```sh
node --experimental-strip-types --test tests/submission-gateway.test.mjs
node --experimental-strip-types --test tests/submissions/database.test.mjs
node tests/submissions/verify-replay.mjs
```

The portable runner is Linux-only because the authoring Mac's Docker daemon stalled new containers in `Created`. No new Mac containers were retried for this change. Authoring validation used the existing SQL fixture and the side-effect-free harness tests. Actual execution of the 5 HTTP tests remains required in Linux CI before release. The Auth/Storage harness and Stage 0 database runner are separate and unchanged.

The suites cover route validation, byte limits, correct field bindings, disabled runtime, Vercel identity selection, exact MAC/audience/body binding, forged/stale/future capabilities, key lifetime/revocation/rotation, SQL and HTTP public-write bypasses, protected private reads, staff compatibility, duplicate/conflicting retries, real concurrent quota boundaries, multiple gateway instances, global caps, transactional rollback, inherited/default ACL failure and non-superuser ownership transfer. They do not establish deployed Vercel header provenance or operational queue monitoring; those remain preview/release gates.
