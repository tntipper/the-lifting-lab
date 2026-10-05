# Website analytics choice contract

Scope: `www.theliftinglab.co.uk` application only. Optional analytics stays OFF until an explicit, successfully persisted acceptance. No Consent Mode pre-consent pings. The Shopify shop and GA administrative settings are outside this patch.

## UI and preference

The root layout renders an **Analytics preferences** button on every page. Its inline, non-modal region offers **Reject analytics**, **Accept analytics**, and **Close preferences**. When accepted, rejection is named **Withdraw analytics consent**. Closing, navigation and elapsed time do not grant acceptance. Reopening focuses the heading; closing/saving returns focus to the button. No modal focus trap applies. Controls wrap at narrow widths and have focus outlines.

The essential host-only rejection fallback cookie `tll_analytics_rejected_v1=1` (Path `/`, SameSite Lax, Secure on HTTPS, maximum 180 days) overrides an older acceptance if localStorage writes fail during withdrawal. It never grants acceptance. Successful reacceptance must remove it.

Only localStorage key `tll.analytics-choice.v1` enables analytics: `{version: 1, choice: "accepted" | "rejected", expiresAt: <epoch milliseconds>}`. Lifetime is 180 days from the most recent choice. Missing, malformed, unknown-version, invalid-choice, expired, overlong or unreadable records default OFF. Failed persistence also remains OFF (no volatile acceptance). Rejection persists on reload and new tabs in the same browser origin. The preference is host/origin scoped; it is not propagated to Shopify.

## Network and events

- Google loader: `https://www.googletagmanager.com/gtag/js?id=G-R3YMG6TYXF`.
- GA collection: Google Analytics `/g/collect` endpoints (observed `region1.google-analytics.com`); the browser tests also detect other `google-analytics`, Tag Manager and DoubleClick URLs and any request containing the measurement ID.
- No first-party analytics proxy or analytics resource hints are added.
- Existing `track()` calls are gated by the current accepted record. OFF-period events are not queued or replayed.
- Exactly one initialisation per document; Automatic initial page views are disabled with `send_page_view: false`; the app sends one initial current-page view and one view per subsequent pathname navigation, deduplicated against the current URL. Query-only changes on the same pathname do not add a view. Reload starts one new document/view. The current property did not emit an enhanced-history view in the measured navigation case; later GA configuration changes need re-verification for duplicates. Saving unchanged acceptance adds no initialisation/view.
- The code requests `allow_google_signals: false` and `allow_ad_personalization_signals: false`; this is not evidence of the GA property's administrative advertising/sharing configuration.

## Cookies and withdrawal

App-owned names are `_ga` and `_ga_R3YMG6TYXF`, Path `/`. New cookies use `cookie_domain: 'none'` and `SameSite=Lax;Secure`, keeping identifiers on the main host. Cleanup targets only these names at host-only/current-host, `theliftinglab.co.uk`, and `.theliftinglab.co.uk`, Path `/`; legacy parent-domain identifiers are cleared even before an undecided visitor makes a choice. An accepted returning visitor keeps host-only identifiers but legacy parent-domain variants are cleared.

The baseline measured GA cookies only at Path `/`. Cookies at another path or a different host, HttpOnly cookies, Shopify-owned cookies, and other GA property names are not deleted or certified by this patch. Authentication, cart, saved-stack storage and unrelated cookies are not cleared.

Withdrawal immediately sets `ga-disable-G-R3YMG6TYXF`, disables the event helper, empties the pending data layer, deletes app-owned cookies and reloads the page to discard Google's code, timers and listeners. Accepted tabs respond to the origin's storage event, with focus and one-second expiry polling as fallbacks. A late script callback checks the current choice before initialising. Requests already sent cannot be undone; withdrawal does not erase server-side Google records. If both localStorage writes and cookies are blocked, the current document is disabled without reloading and shows a persistence error. Durable preference changes cannot be promised when all persistence is unavailable; this extreme case remains an independent verification limitation.

## Verification and review

Run `node --test tests/privacy/consent.test.mjs`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Browser harness: `PRIVACY_APP_URL=http://localhost:<owned-port> PLAYWRIGHT_MODULE=<existing-playwright-module> node tests/privacy/analytics-choice.mjs`. It uses owned, empty, non-persistent contexts, records sanitized network/cookie metadata, and writes `evidence/privacy/runtime.json` plus a mobile screenshot. It installs no dependency. HTTPS main-host mapping and delayed script loading are explicitly synthetic local-app cases; natural accepted GA traffic is not blocked.

This branch starts at main `e12f0ed6cface85416771e25d8f94413710b0092`, preserving PR #58. It must be independently reviewed at its frozen SHA and reconciled with the website integration branch before eventual landing; do not cherry-pick or merge without approval. Preserve the integration branch's isolation/test-mode guards while reconciling root layout and analytics imports. No staging fixture files are changed.

Unresolved gates: complete independent A01–A12 coverage (including actual shop headers/password gate, browser zoom and region/browser variations), GA retention/sharing/admin configuration, and baseline dependency/lint findings. No legal-compliance certification is asserted.

## URL and event data minimisation (local successor, publication HOLD)

Only known static pathname identities are retained, with no query-string allowlist and no fragments. Dynamic pages are labelled by route template (`/products/:item`, etc.); unknown paths become `/other`. All page fields use these identities, with a generic path-based title rather than arbitrary document text. Same-origin referrers follow the same contract; external referrers are omitted. Config, global defaults, manual views and helper events all receive minimised page fields. The loader has no-referrer policy.

Arbitrary UTM/campaign attribution is deliberately disabled with fixed campaign fields; incoming linker acceptance, link decoration and URL passthrough are disabled. No UTM or `_gl` value is considered safe by its name alone. The natural-request synthetic harness checks URL/body/complete-header markers, including GA campaign fields and query site-search. Free-text search helper parameters become capped numeric length only; helper `href` fields become a public route class or `external`. No event caller can override reserved page/campaign/linker fields. Other Google enhanced-measurement/admin features remain a separate configuration review; this contract does not certify all possible remote-property changes.

References: [Google configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config), [linker controls](https://developers.google.com/tag-platform/devguides/cross-domain). Natural outbound checks must be rerun if GA settings or event inputs change.

The Google library now runs only in an inert same-origin analytics frame with no query, inputs or referrer. It never starts on direct navigation, before accepted storage, or without the root controller. The controller sends only minimised commands; it synchronously disables the frame before withdrawal/unmount/reload and late loads recheck active choice. This is needed because a natural positive-control test proved enhanced site-search reads the main document `q` independently of `page_location` overrides. Automatic measurement of main-page inputs/links/scroll is no longer relied on; only declared app events and manual views are forwarded. The frame uses an ordinary script loader because it is a standalone static document, not a Next.js-rendered page. No first-party forwarding proxy, GA admin change or runtime dependency was added.

The frame separates automatic measurement context; it is **not** a cross-origin security sandbox. The trusted Google script still has same-origin browser privileges. Current-script marker/request tests are required evidence, and future SDK/property changes require re-verification. Automatic frame engagement/scroll events can still occur after acceptance under the property settings; they must not be interpreted as measured main-page interactions. Google administrative enhanced-measurement settings remain a separate review.
