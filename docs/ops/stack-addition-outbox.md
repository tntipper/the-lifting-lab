# F09 authenticated addition outbox

This follow-up closes the loss of an authenticated product-addition retry when a tab reloads after a failed or uncertain request. It changes only the browser addition protocol and its account guard; it adds no database migration, service, credential or email sender.

## Review contract

Before an authenticated addition is sent, the client stores and reads back an immutable record containing version, originating account UUID, request UUID and product UUID. One `tll_stack_v3_add:<account>:<request>` localStorage key per operation prevents unrelated tab additions from replacing a shared array. The record contains no session token, email, product label, score or serving recommendation. Its exact request ID and `{productId}` payload are reused after reload; version 1 always uses the existing default addition semantics and never overwrites an existing serving amount.

The client loads only the verified current account's records after a successful own-account GET. Sign-out and account changes invalidate in-memory operations and leave their durable records attached to the original account. Those records never enter guest membership or another account's merge. Returning to the original account, reloading, reconnecting, refocusing, a storage event or an explicit retry can resume them. An unverified identity or missing initial account snapshot still prevents additions.

Every POST, DELETE and PATCH to `/api/stack`, including a guest merge, now requires `X-Stack-Expected-User` to equal the user returned by server `auth.getUser()`. Missing or mismatched headers return 409 before the RPC or reward call. This header is an equality guard, not an authority or account selector: the session and existing database `auth.uid()` remain authoritative. It closes the race where cookies switch accounts before the client's auth event arrives, including destructive edits when two accounts happen to have the same revision. GET is unchanged. Update direct staging mutation fixtures with their verified synthetic user's UUID; older loaded clients fail safely and need a reload.

A pending record is removed only after an applied response for its own account explicitly accepts or rejects that product. Non-duplicate acceptance must include the product in the confirmed snapshot. A duplicate receipt can accompany a newer snapshot where another device removed the product; it confirms the original operation without inserting it again. Failed responses, malformed acknowledgements or unavailable acknowledgement storage retain the original operation. Rejected unavailable products are terminally acknowledged and reported as not added.

Same-tab writes remain serialised. A visible unconfirmed addition blocks later edits until it is resolved. Concurrent tabs may send the same request ID; the existing per-account database receipt prevents a second application. Removing one confirmed request never removes a different pending request for the same product. The client checks for visible pending additions before a destructive write, while the existing database compare-and-swap revision remains the cross-client authority. There is no new claim of global ordering for independent future writes on another device.

## Failure handling and limits

- A failed, ignored or unreadable storage write prevents a new authenticated request. There is no memory-only fallback claiming reload durability.
- Corrupt records remain untouched and are not sent. Another account's records do not block the current account. Storage repair requires restoring access or reviewed local cleanup; the code does not delete guest data to make room.
- New writes stop at 100 pending records per account. Since simultaneous tabs can briefly exceed that advisory cap, replay drains up to 100 records per pass and leaves the remainder available for another retry.
- localStorage is device/browser/origin-specific and can be cleared or evicted. Closing private browsing, clearing site data or browser/OS storage loss can erase unconfirmed intent. This is not an account backup, encrypted local vault or background service worker; a page must run with the originating account signed in to resume.
- Remove, clear and serving-edit retry keys remain in memory. Their existing explicit retry, stale-revision review and fresh-read-on-reload behavior are unchanged. Guest token acknowledgements are unchanged. This patch does not claim durable destructive intent or change the prior guest-merge protocol.
- Server receipt retention remains necessary. Pruning a receipt while a browser can replay its old request would break replay safety; no receipt cleanup is introduced.

## Acceptance evidence

Run `node --experimental-strip-types --test tests/stack-outbox.test.mjs tests/stack-sync.test.mjs tests/stack-routes.test.mjs`. The actual client service/store tests cover failed request then reload, successful commit with lost response, later removal before retry, returning account, cookie-switch race, concurrent identical requests, independent tab records, storage write/read/acknowledgement failures, unavailable products, malformed acknowledgements, corrupt owner records, disposal and destructive-operation blocking. Existing guest, servings and compare-and-swap regressions remain included. The actual route test rejects missing and mismatched account headers before any RPC or award.

`TEST_BROWSER_CHANNEL=chrome npm run test:accessibility` runs actual React, provider subscriptions, browser localStorage and reloads in a fresh headless profile with a synthetic API boundary. The outbox journey checks account switching, a lost successful response, persistent nonce/payload and two tabs concurrently resuming one record. Existing assessment/navigation/dialog tests still run at all six widths. No existing user browser, customer record, hosted provider, email, share publication or purchase is used. Browser quota/security exceptions are deterministically injected in the client tests; the browser test does not exhaust actual disk space or claim Safari/iOS, browser-crash or screen-reader certification.

Hosted release acceptance still requires the integrated exact-head staging deployment and real cookie/session flow. The source and local fixtures do not constitute hosted acceptance.
