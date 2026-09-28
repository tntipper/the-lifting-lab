# Protected browser admission delivery

`createCustomerAdmissionBrowserDelivery` owns the actual admission-to-registration continuation and actual broker repository. It is an unmounted Node `Request` → `Response` adapter with `liveEnabled: false`; only explicit synthetic execution runs against offline/local test ports. This slice creates no route, UI, hosted call, provider registration, runtime access, production key or authenticated application session. The existing `/auth/shopify/callback` is unchanged.

## Request contract

The constructor captures the exact approved staging `applicationOrigin`, bounded provisional/bridge/broker pools, provisional vault, separate existing `EnvelopeVault` for cookie custody, publishable key and request-scoped real SSR token accessor. Construct it from trusted server configuration, never request fields. It owns the real coordinator/continuation and session reader; no caller-provided verified flag, candidate, UUID or release digest is accepted. Use an independently held cookie keyring; object separation is checked, while keyring custody remains the server composition's responsibility.

The four methods have fixed paths, independent of deployment headers:

| Method | Fixed request | Response |
| --- | --- | --- |
| `prepare(request)` | `POST /auth/customer/prepare`, form `mode=sign_in` or `mode=migration` | CSRF nonce and sealed bootstrap cookie; a valid existing binding is retained. With a transaction cookie, only the same CSRF nonce is reread, without any cookie replacement. |
| `start(request)` | `POST /auth/customer/start`, form `mode` and `csrf` | Only an acknowledged continuation produces `303` to the exact returned broker URL and a sealed transaction cookie. A retained transaction cookie rejects another start. |
| `admit(request)` | Top-level same-origin `GET /auth/customer/authorize` with exactly the released query | Actual 007/010 one-use admission; `204` and a replacement capsule without the consumed release secret. This acknowledges broker browser admission only; no Shopify continuation exists yet. |
| `recover(request)` | `POST /auth/customer/recover`, form `action=inspect`, `hold` or `cancel`, plus `csrf` | Minimal metadata or terminal status; never an authorization URL, release capability or registration retry. |

POST requires the exact `Origin` and `Sec-Fetch-Site: same-origin`. The authorize navigation additionally requires `Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`. These are strict requirements, not a fallback to cookies alone. Bodies use `application/x-www-form-urlencoded`, at most 512 UTF-8 bytes, one total one-second read deadline, exactly the documented fields and no duplicates. Unknown modes, caller secrets/proofs, encoded alternate paths, query-bearing POSTs, duplicate private cookies and malformed ciphertext fail closed. Every response is private/no-store and sets `Referrer-Policy: no-referrer`.

The only JSON nonce returned to browser code is the anti-CSRF nonce. The browser-binding secret, release secret, retained transaction/claim tuple, migration token and PKCE verifier never appear in generic JSON, URLs or diagnostics. The broker authorization query contains only the already validated OAuth outer request.

## Cookie custody and expiry

Both `__Host-tll-customer-start` and `__Host-tll-customer-transaction` use `HttpOnly; Secure; SameSite=Lax; Path=/`, no Domain, a bounded Max-Age and explicit expiry. Lax permits the later top-level OAuth return; strict origin/CSRF protection applies independently to POST. Encryption/authentication uses the existing AES-GCM envelope vault, with AAD ordered as `['tll-customer-browser-cookie/v1', exactOrigin, exactCookieName, '/']`. The encrypted envelope is canonically base64url encoded and capped below the ordinary 4 KiB cookie limit. Cookies are bound to their origin, purpose and original bootstrap, so a foreign capsule cannot be paired with another bootstrap.

Prepare generates a canonical random 32-byte browser secret and independent CSRF nonce. The sealed bootstrap fixes mode, issue time, a five-minute **entry window** and a ten-minute **absolute fence**. Repeating prepare rereads the same binding; it does not extend either time or mint a replacement. A present invalid/expired cookie is not silently replaced. A start must enter within five minutes, but asynchronous verification may finish later. Its immutable metadata expiry is `min(createdAt + five minutes, absolute fence)`. The trusted constructor-only `transactionExpiresAt` carries that fence through the actual coordinator and continuation, with fresh checks after verification and SQL's post-lock expiry check before preparation. Browser fields cannot override it.

Cookie Max-Age rounds upward to avoid dropping the bootstrap before its exact absolute fence. The server still rejects expired ciphertext by its exact retained millisecond expiry. The transaction capsule ends at the original source expiry, never a new delivery-relative deadline. A source expiry, aborted request or encryption failure after registration ACK quarantines that exact original transaction and releases no response capability.

## Durable start fencing: additive migration 011

`202609170011_customer_browser_admission_once.sql` is local-reviewed and unapplied to hosted staging. It adds one immediate permanent `UNIQUE(browser_hash)` constraint to 008 intents after 010. Existing 008 and 010 source remains unchanged. The complete 010 security guard runs before and after; 20 pinned function bodies/search paths must match. The migration opens a scoped owner maintenance window, acquires G → B → P locks, requires all repositories disabled, creates the constraint and restores the original ADMIN-only role edges. No function, ACL, role, LOGIN or control is added or activated. Existing duplicate browser bindings cause rollback; the migration does not clean or replace them.

Every start using the retained bootstrap hashes the same server-issued secret. Actual 008 prepare must commit before any upstream authorize/link request. Its `ON CONFLICT DO NOTHING` plus checked acknowledgement lets only one intent reserve that browser hash. Concurrent/replayed starts generate different transaction UUIDs, so a loser's exact hold cannot select or alter the winner. Tombstones retain uniqueness too. A lost preparation, admission finish or registration acknowledgement cannot turn a retry into another upstream dispatch. A committed rejection is not evidence of a recoverable candidate.

This fence covers requests sharing the issued bootstrap. A browser deliberately discarding all custody, or independent browsers, is a new browser identity; it is not an account-wide deduplication mechanism. Future route composition must serialize bootstrap issuance and retain the issued cookie before submitting start. It must not automatically delete/reissue cookies or blindly repeat a failed start. Existing server quotas remain unchanged.

## Admission, recovery and unknown acknowledgements

Only the owning continuation's immediate registration commit ACK can deliver a URL and encrypted release secret. The capsule retains the exact original browser/config/application-PKCE/outer/claim/generation/registration tuple. Admit derives the existing ordered release hash from that authenticated capsule and calls the actual broker adapter. A committed rejection or replay returns a generic held response without changing the admitted winner. An uncertain dispatched admit or failed post-ACK cookie delivery makes one hold attempt against the exact retained bridge binding; the failed connection is discarded by the repository. There is no outer retry.

Inspection is metadata only. It neither reconstructs a lost cookie nor returns/reseals a release capability, even when SQL reports pending browser authority. Hold/cancel require the retained CSRF and matching private cookies. An acknowledged terminal result clears both cookies, permitting a later explicit new prepare; an unknown terminal result retains a sealed held capsule without a release secret. If no usable recovery capsule arrived, retain the bootstrap until its absolute fence. A fresh explicit prepare after that fence cannot overlap live authority from that bootstrap. An unknown hold is not reported as proven revocation; no automatic replacement transaction follows it.

## Remaining integration and verification

Before mounting anything: independently review/apply 011 in the ordered disabled staging package; provide reviewed runtime pools, separate held vaults and genuine SSR token extraction; wire the exact four paths in the Node runtime; add the inner Shopify continuation after the admitted receipt; and complete provider/configuration/final reconciliation/session acceptance gates. `204` does not log a customer in or start Shopify. All existing live/provider activation gates remain closed.

The installed Next 15.5.25 package has no `node_modules/next/dist/docs` directory requested by AGENTS.md. The shipped `NextResponse`/cookie types and the [version 15 cookie guide](https://nextjs.org/docs/15/app/api-reference/functions/cookies) were checked instead. This adapter uses standard Response headers; a future Route Handler must return the response and its separate Set-Cookie headers before streaming, without exposing those headers to client JavaScript or combining them with another authentication cookie writer.

Offline request/cookie tests run with the ordinary unit suite. In the existing marked `tll_admission_bridge` fixture, run these sequentially after continuation acceptance:

```sh
node tests/admission-bridge/browser-once-regression.mjs
node --experimental-strip-types --test tests/admission-bridge/browser-delivery.test.mjs
```

The first reconstructs canonical 011 only inside rollback and verifies exact security/catalog/role/data restoration, including applied negative probes. The second adds only the reviewed constraint, runs actual coordinator/008/010/007 behavior with synthetic signed HTTP, and removes that owned constraint in final cleanup even after test failure. It restores disabled/empty workload, original function/role/constraint fingerprint and zero other sessions. The fresh Linux CI job runs both after continuation and before the managed-admin harness; no new local fixture is created.
