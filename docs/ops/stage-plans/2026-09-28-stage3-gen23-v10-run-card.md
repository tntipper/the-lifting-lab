# Generation 23 v10: one complete supervised staging run

This card records the next complete Stage 3 attempt. It is **not permission to activate**. The owner must be present for the visible Shopify sign-in and any Keychain prompt. No production change, purchase, customer campaign, or push of a local arming commit is included. Report results against the [single Stage 3 completion register](2026-09-28-stage3-completion-register.md), not as another separate generation checklist.

## Already proved and to preserve

- The v9 attempt stopped at broker HTTP 404 before customer sign-in. Its one-use records are consumed. A separate recovery proved the five temporary staging roles retired/passwordless with zero sessions and controls OFF. Never replay v9.
- Disabled v10 source `af7efca` is published to the protected `codex/tll-integration` Preview, and its exact deployment, login protection and account/cart/checkout controls OFF passed the first live check. The staging broker served revision `tll-gen23-v10-secret-key-1`; an authenticated named-key guard read returned broker OFF and window absent.
- Local commit `92328f4` adds an authenticated active-window guard immediately after settings readback and before temporary database setup. The serial full suite, build, typecheck, lint and activation-manifest check passed. It must be separately published as **disabled** source and its protected Preview rechecked before activation.

## Pre-activation decision gates

An independent Astra source review of local commit `92328f4` found **GO for disabled publication** and **HOLD for activation** until the exact temporary arming change, fresh expiry, protected build and current hosted starting state are reviewed. The review found no material defect in the active-window guard; it did not read credentials or contact hosted services. This finding is limited to the reviewed source and does not itself prove the enabled customer journey.

1. Verify the branch, local/remote source, tracked and untracked state, exact disabled commit, generated manifests, unused v10 one-use records, prior v9 HOLD fingerprint, provider and broker window absent, all five database roles retired, and all customer controls OFF. Preserve unrelated untracked files.
2. Publish only the reviewed disabled guard source after separate action-time approval. Confirm the new Vercel deployment is Ready, login-protected, its Git SHA matches exactly, and account/cart/checkout remain OFF. Do not redeploy the broker if its source has not changed.
3. Review the **complete** v10 route and one minimal local arming diff together, including fresh expiry, all approved switches, source pin, staging-only project identities, one-use records, bounded shutdown and no-purchase browser guard. Require an independent review before arming. If any check fails, do not arm.
4. Obtain separate action-time approval for the exact supervised activation. Confirm the owner is at the Mac, saved credentials can be read privately, and there is sufficient time for the full journey and shutdown. Do not reuse an expired approval or consumed record.

## One supervised run and result

Run the fixed parent launcher **once**. It installs temporary staging settings, reads them back, and proves the broker recognises this exact active window **before** creating any temporary database login. It then proves restricted connections and the broker, activates only protected staging account/cart controls, and completes the guest product/cart, owner Shopify sign-in, owner-only orders, guest-cart transfer, GET/HEAD-only checkout page, and logout checks. It then switches database/provider/site controls OFF, retires all five passwords/logins/grants, removes the broker window and independently reads the final state. Record each of the eight completion-register results and the exact customer-visible defect, if any.

If a write outcome is uncertain, preserve the one-use record and do not replay the run. Use fresh read-only inventory and a separately reviewed recovery action. Expiry alone does not prove login retirement. If the same defect survives two evidence-led attempts, stop speculative edits and document the exact remaining cause or dependency.
