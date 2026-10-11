# F09 active stack integrity and recovery

Status: candidate implementation; production application is a separate release decision. No hosted database change, purchase, email or customer data export is performed by these scripts.

## Deployment sequence

1. Keep browser stack writes out of service during the migration/release window. Confirm the hosted migration administrator owns `user_stacks` and `stack_products`, can create in `public` and create the private schema, can read `auth.users`, `products` and `product_nutrients`, and has `REFERENCES` on `auth.users`. The migration creates no role and transfers no ownership. RPCs and their trigger retain the migration administrator as owner, with an empty `search_path` and qualified names. They expose only the current `auth.uid()` owner's stack and fixed public product metadata.
2. Run `active-stack-preview.sql` as a **read-only** preview. Save its output privately. Review the duplicate groups, their deterministic canonical IDs, differing/invalid serving amounts and constraints before application. Take and verify the usual private database backup. Never commit the output or a dump to the public repository.
3. Test migration `202609150003_active_stack_integrity.sql` on a representative isolated/staging schema. It deliberately fails if schema/order/type, required item uniqueness, existing references or effective browser privileges drift. It revokes cumulative table and column grants, preserves named staff access, replaces browser policies with own-user SELECT and checks effective inherited privileges again for the new private objects. It must not be made permissive to work around a failed preflight.
4. Apply once under migration history. Lock timeout is 5 seconds and statement timeout 60 seconds; a contention/large-data failure rolls the transaction back. Check the private repair journal and resulting one-active-stack index. Repeat application is deliberately rejected before writes; the SQL suite verifies an unchanged whole-database dump. Do not blindly replay it or silently add `IF NOT EXISTS`.
5. Release migration, route and shared client together. `/api/stack` writes now require `Idempotency-Key`, strict JSON and the new revision protocol. Every POST, DELETE and PATCH also requires `X-Stack-Expected-User` matching the verified session account; see the [authenticated addition outbox](stack-addition-outbox.md). Old clients fail safely and need a reload; the old server route cannot write directly after the privilege change. On missing migration/provider errors the route returns 503, never a pretend empty/saved stack. Verify signed-in page, product-card and floating stack views using synthetic accounts before reopening writes.
6. Exercise the actual hosted Supabase/PostgREST and browser journey gates below. SQL-only success does not prove hosted authentication, PostgREST schema caching, cookie handling or browser behaviour.

## Recovery policy

Each user has at most one row with `is_active IS TRUE`, enforced by a partial unique index even for privileged SQL. Existing false/NULL activity values remain unchanged. The earliest creation time (NULL timestamps sort last), then UUID, selects the canonical active row. This is deterministic recovery, not a guess about the customer's newest intention.

Every original duplicate stack row and every original item remain. Extra active stacks are archived by setting `is_active=false`. A missing product is copied into the canonical row only when all source amounts agree numerically and are valid under the existing 1–10 whole-serving input range. Existing canonical amounts are never overwritten and amounts are never summed. Conflicting, missing or invalid amounts remain in their original archived rows for review; the journal records before/after stack and item JSON plus product-level amount variants. Existing invalid canonical values are flagged by the preview and retained for review, not silently repaired. The shared client also detects invalid serving values in a single active stack (which has no duplicate-repair journal), labels them unresolved, and excludes them from totals and analysis without substituting a default dose.

The customer sees a recovery notice when that journal identifies serving conflicts. Support must privately review the originals with the customer before deciding the intended amount. The UI does not expose archived private JSON or invent a resolved amount. No self-service archive browser or conflict-resolution workflow is claimed in this change. The notice persists until an explicitly reviewed follow-up records resolution.

`active-stack-repair-rollback.sql` reverses only the **data repair** after explicit operator opt-in. It locks the tables, compares every affected row/item with the recorded after-state, and refuses if newer changes exist. It removes only copied items, restores original active flags, and leaves direct browser writes closed. It disables the mutation RPC and removes the singleton index/revision trigger for that reversal. This is a maintenance-only recovery state requiring a forward repair before writes reopen, not an application downgrade script. Never restore the old broad grants or use this reversal after newer customer changes; reconcile forward from the journal instead.

## Save protocol and limits

- GET is read-only, including the first visit. It returns `{userId, stackId, revision, items, recoveryConflicts}`; no active stack returns null ID, revision 0 and empty items. Unavailable product rows remain in saved membership but their product details are null.
- Add and batch guest merge are additive, transactional and commutative. A per-user transaction lock and the index prevent competing first-use inserts. Existing servings are preserved by `ON CONFLICT DO NOTHING`. Only active product IDs are accepted. A batch contains 1–100 UUIDs and returns explicit accepted/rejected IDs.
- Remove, clear and serving edits compare the displayed revision under a row lock. A stale request returns 409 with the latest own snapshot and requires the customer to review before choosing the action again. Row triggers increment revision for item changes through preserved staff paths as well. Privileged changes that replace/archive the active stack must run in a quiesced maintenance window; the browser protocol uses a revision of the active row, not a global account revision.
- An immutable UUID request key and exact payload fingerprint make retries safe. Reusing a key with different content is rejected. Replaying a successful removal after an intervening re-add returns the current stack without removing the re-added item. The receipt, all item changes and revision updates commit together.
- Request bodies are bounded at 8192 UTF-8 bytes; serving mutations accept integers 1–10. These are the previous API's stored whole-serving range, now rejected instead of coerced/clamped. They are not scientific dosing advice. Existing archived values are not rewritten.
- Receipt rows contain user/key/fingerprint/result/creation time; successful results contain product IDs, not product metadata. They currently persist until account deletion. Deleting receipts too early would permit an old successful destructive request to be replayed as a new mutation. A separate reviewed retention and maximum request-age policy is needed before automated pruning. The repair journal cascades on account/source-stack deletion and is accessible only to existing trusted administrator paths. No new general service-role transport is introduced.

## One browser state

`LocalStackProvider` owns authentication changes, one sync service, server snapshot, pending guest records and visible status. Main stack, product buttons and floating panel read the same membership. The main page separately loads public product details for analysis; failed detail requests preserve membership and show an error. Partial/unavailable product details are explicitly identified.

Guest storage uses individual product keys and immutable save tokens. Confirming an old token cannot delete a newer save by another tab. The legacy array is read without destructive rewriting; acknowledged legacy records do not resurrect. Browser tombstone acknowledgements and original legacy data are retained for safe recovery until the user clears site data; no automatic compaction is claimed. A storage failure is visible and cannot be reported as a successful add. Active browser membership is capped at 100 items; oversized legacy stores are merged in bounded batches on further explicit retries.

Only acknowledged guest IDs present in the confirmed own-user snapshot are cleared. Offline, HTTP 500, malformed acknowledgements and stale account responses leave guest records intact. A partial merge retains rejected products for review. Browser items are local to the device, and the UI labels pending items separately from confirmed account saves; they are not an account backup.

Same-tab writes are serialised; no destructive operation automatically retries with a newer revision. An uncertain operation blocks further writes until its exact request is retried or the page is reloaded. Destructive retry keys live in memory for that session; reloading performs a fresh read rather than automatically re-executing a lost destructive intent. Authenticated product additions use the [account-bound durable outbox](stack-addition-outbox.md) and resume with their original nonce and payload after reload. Guest token acknowledgements remain unchanged. Requests time out after 15 seconds. Focus, reconnect and storage events refresh the saved view and resume eligible additions; logout/account change and unmount invalidate late responses. Scientific scoring, recommendations and account federation are outside F09.

## Acceptance

Local existing-fixture command (synthetic **tll_stack_test** only):

```sh
node --test tests/stacks/database.test.mjs
node --experimental-strip-types --test tests/stack-routes.test.mjs tests/stack-sync.test.mjs
node --test tests/stacks/harness.test.mjs
npm run typecheck
npm run lint
```

Linux Docker owns new disposable PostgreSQL17/PostgREST16.3 resources:

```sh
node tests/stacks/run-local.mjs --plan
node tests/stacks/run-local.mjs
```

The runner accepts no custom endpoint, database URL, credentials or keep flag. It verifies a local Unix Docker endpoint, uses a labelled internal bridge, publishes no Docker ports, and relays an ephemeral 127.0.0.1 listener only to the verified running task-owned PostgREST IP. It reuses the tested socket transport from the submissions harness with its own identity validator. Cleanup closes sockets/listener first and verifies resource ownership labels before removal, including on failure. No new Mac containers should be attempted while the known daemon creation problem remains.

SQL acceptance covers 10 concurrent first-use connections, 8 concurrent nonce retries, compare-and-swap serving edits, stale clear, replay after re-add, cross-user denial, complete duplicate preservation, invalid archival values, inherited grants/default ACLs, staff writes, transaction rollback, guarded repair reversal, deliberate migration replay failure and non-superuser execution. Route/service tests cover strict inputs, honest errors, only confirmed local acknowledgements and stale/lost responses. Linux HTTP tests cover direct REST denial, actual owner claims, read-only GET, 8 concurrent saves, nonce replay, stale revision and forbidden owner parameters.

Before production, record the exact Git head and green Linux CI URL, apply to isolated hosted staging, and complete a real two-tab/synthetic-account browser journey: first add from both tabs, guest merge with a forced 500/offline interruption, retry, partial unavailable product, stale clear, logout while a response is pending, returning account hydration and matching main/floating membership. Actual hosted and browser acceptance remains a release gate until root records it; this document is not a claim that those journeys have run.

References: [PostgreSQL17 partial indexes](https://www.postgresql.org/docs/17/indexes-partial.html), [PostgreSQL17 INSERT/ON CONFLICT](https://www.postgresql.org/docs/17/sql-insert.html), [Next15 route handlers](https://nextjs.org/docs/15/app/api-reference/file-conventions/route).
