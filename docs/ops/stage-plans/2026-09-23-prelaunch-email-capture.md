# Prelaunch email capture and launch-list readiness

## Outcome and acceptance

Make the password-page invitation specific about launch and later product offers, record an affirmative Shopify email-marketing opt-in, verify one owner-controlled test signup end to end, authenticate the sender domain, and prepare (but do not send) a welcome/launch sequence. A real customer must see accurate consent and confirmation text; a test subscriber must appear in Shopify's Email subscribers segment with the expected status. The public password remains enabled.

## Boundary and starting state

No purchase, supplier order, production-store opening, bulk customer communication, campaign activation, or use of existing addresses without valid consent. The live password page currently has a Shopify `customer` email form and generic newsletter copy. Shopify Admin shows a verified sender address but sender-domain authentication `Needs setup`; double opt-in is inactive and no welcome-new-subscriber automation is active. This plan changes the local `implementation-theme` password template/block and, after separate preview/review, the live Shopify password template and marketing settings. DNS may change only after checking the exact Shopify records and existing DNS state.

## Pre-mutation checks

1. Verify both repository identities, heads and clean/dirty status; preserve unrelated files.
2. Confirm the local theme password template matches the current live page and identify the published theme. Check the privacy-policy link and customer marketing state in Shopify.
3. Confirm Shopify's current double-opt-in and sender-domain values. Confirm an owner-controlled test mailbox before signup.
4. Check authoritative Shopify/ICO guidance for consent wording, confirmation and sender records.

## Execution and stop gates

Implement one small local theme copy/consent change, then inspect its diff and run applicable theme checks. Review the exact live theme edit before publishing. Update double opt-in only once the confirmation text is aligned; this may send a confirmation to future registrants. Enter DNS records only after exact admin readback and existing DNS inspection; never overwrite MX or unrelated records. Prepare the welcome/launch messages as drafts. Maximum one owned-mailbox form submission and one confirmation click for the end-to-end test. Stop on theme identity mismatch, unclear consent status, unverified mailbox, surprising DNS, unsolicited sends, or any request for a purchase. Diagnose before retrying.

## Verification and recovery

Check the anonymous password page at desktop/mobile sizes, keyboard and error/success paths, Shopify subscriber status/timeline, and receipt of any double-opt-in email. Check SPF/DKIM/DMARC recognition after DNS propagation without claiming immediate deliverability. Verify drafts are inactive and no campaign was sent. Record exact hosted settings, tests, changed files, uncertainties and next action in the repo handover. If publication cannot be verified, leave the local change staged for review and report that the live page is unchanged.

## 2026-09-23 executed checkpoint

- Published theme ID `207410200906` remains password protected. Its password-page invitation now explicitly describes launch news and occasional product offers/promotions, Shopify storage, unsubscribe and data-request contact; the button says “Join the launch list.” The anonymous page and Shopify editor both showed the saved wording. The shop privacy policy is published in Admin but redirects anonymous visitors to the password page, so the on-page notice is essential until a public unified notice is released.
- Changed the theme's English email-signup success text to “Check your inbox and confirm your email to join the launch list.” Admin confirmed “Theme content updated.” The local exported theme copy mirrors both content edits. No code upload occurred.
- Enabled Shopify marketing double opt-in for **new email subscribers only**. Reloaded Admin state was enabled=true, email=true, SMS=false. The standard confirmation template contains no promotional offer.
- The single approved owner-mailbox signup showed Shopify's success message. Customer list first showed `Pending`; the confirmation email arrived, and its Subscribe action led to the password page. A subsequent customer marketing-status dialog showed Email **Subscribed**, SMS/WhatsApp **Not subscribed**. This verifies capture and confirmation; it does not test another person's deliverability or future campaigns. No order or purchase was made.
- The confirmation arrived from Shopify's fallback sender before sender-domain setup. The owner separately approved the exact seven DNS records below. All six Shopify CNAMEs and `_dmarc` TXT were saved in Netlify, read back under the expected full hostnames, and resolved with the exact target/value from authoritative `dns1.p03.nsone.net`. Microsoft 365 MX and the existing apex SPF were unchanged in that authoritative read. Only after this readback, clicked Shopify Admin's “I updated DNS records” once. Its status changed from `Needs setup` to **`Propagating`**, with a notice that it may take up to 48 hours to become `Authenticated`. Do not claim authenticated sending or enable promotional sends until Admin reports `Authenticated` and a fresh test message's authentication headers pass.
- Shopify Flow is not installed, so the custom subscriber automation builder is unavailable. The available welcome templates include discounts that have not been commercially approved. No welcome automation or campaign was activated or sent.
- Netlify access was restored by the owner. The existing zone was inspected for conflicts before the authorized additions. No existing record was removed or edited.

### Exact Shopify DNS records added and verified on 2026-09-23

Names below are relative to `theliftinglab.co.uk`; CNAME targets are fully qualified. Netlify appended the zone to the entered relative names, and the resulting full hostnames and targets were verified in its zone and at the authoritative nameserver. The values came from Shopify Admin > Settings > Notifications > Email domain authentication on 2026-09-23.

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `mailerzyr` | `a7c7c47d491c.p825.email.myshopify.com` |
| CNAME | `zyr._domainkey` | `dkim1.a7c7c47d491c.p825.email.myshopify.com` |
| CNAME | `zyr2._domainkey` | `dkim2.a7c7c47d491c.p825.email.myshopify.com` |
| CNAME | `mailera2h` | `9698b3b4167e.p693.email.myshopify.com` |
| CNAME | `pdk1._domainkey.mailera2h` | `dkim3.9698b3b4167e.p693.email.myshopify.com` |
| CNAME | `pdk2._domainkey.mailera2h` | `dkim4.9698b3b4167e.p693.email.myshopify.com` |

Added one TXT record: `_dmarc` → `v=DMARC1; p=none;`. Shopify's [sender-email setup](https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/setup-your-email) says all displayed CNAMEs and one DMARC record are needed; it advises against a separate SPF record for Shopify because its CNAMEs handle that mechanism. Preserve the existing Microsoft 365 MX and apex SPF until separately reviewed. A future read-only check should confirm Shopify's `Authenticated` state; if it remains `Propagating` beyond the stated window, diagnose the exact failed record rather than adding more records blindly.

## Launch-email copy held as draft

**Immediate welcome, after sender authentication and an automation review:** Subject: `You're on The Lifting Lab launch list`. Body: `Thanks for joining. We'll email you when the shop opens and occasionally share supplement offers. Until then, you can compare products and see how we score them at theliftinglab.co.uk. We only send these messages to people who asked for them, and you can unsubscribe whenever you like.` Shopify's unsubscribe footer must be present. Do not promise a discount or purchase date.

**Launch announcement, only after the public-launch gate:** Subject: `The Lifting Lab shop is open`. Body should link to the verified live shop and a small number of approved, priced products; explain the comparison-to-checkout journey. Segment must be confirmed email subscribers, with suppression of unsubscribed/pending contacts. Any discount, affiliate code, product claim or delivery promise requires the corresponding commercial/scientific gate first. Send a test to the owner, inspect rendering and links, then require a separate campaign review before sending to customers.

**Comparison-site integration:** The current comparison-site `/privacy` page says email is used solely for authentication and does not describe the Shopify launch list. Do not reuse its account-email field or import `profiles.newsletter_opt_in` as marketing consent. Update and publish a unified privacy notice and explicit marketing choice before collecting comparison-site subscribers into the same list. Store consent source, text/version, timestamp and withdrawal state; keep Shopify's subscribed status authoritative for sends.

**Legacy subscription boundary:** At least one Shopify address was already marked Subscribed before the 2026-09-23 wording and double-opt-in change. The earlier page promised a newsletter/launch notice, not ongoing offers. Do not include legacy contacts in offers solely because Shopify says Subscribed; review their original consent evidence or obtain fresh consent. The owner test address has current-form confirmation evidence.

**Shareable prelaunch invitation (draft):** `The Lifting Lab shop is on its way. Join the launch list to hear when it opens and receive occasional supplement offers: https://shop.theliftinglab.co.uk/` Publish only after checking the public gate again. Do not mention discounts, dates, specific products, or delivery promises while commercial and launch gates remain held.
