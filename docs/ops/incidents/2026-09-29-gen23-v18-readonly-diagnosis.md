# Generation 23 v18: read-only diagnosis after recovery

Date: 29 September 2026. This is a diagnostic checkpoint, not permission to repeat the test. The [v18 outcome and recovery record](../evidence/2026-09-28-gen23-v18-run-and-recovery.md) remains the authority for the completed shutdown.

## What the preserved records prove

| Record | Last durable state | Meaning |
| --- | --- | --- |
| `tll-generation-23-whole-route-v18.json` | `ACTIVE`, `surfaceEnable` dispatched, `nextIndex: 7`; last update 20:58:02 UTC | The overall route did not verify surface activation or begin the owner browser journey. |
| `tll-generation-23-surface-enable-v18.json` | `INTENT_RECORDED` at 20:58:08 UTC | The customer-facing surface change was attempted but not verified by its one-use record. |
| `tll-generation-23-preview-enabled-v18.json` | `POST_ACK` at 20:58:17 UTC for `dpl_CaxbDz4Z3ofVSat46LjVHvoVUdF9` | Vercel acknowledged the enabled Preview request. The record did not reach `VERIFIED`. |

The v18 recovery record separately proves that all five Preview settings, the database controls and provider were disabled; five temporary database roles were retired with zero sessions; the Edge readiness window was removed; and the protected alias was restored to held Preview `dpl_HNvrJ1JpHGdf3kGpafqsiVnNP6aQ` from disabled source `4bc8a7a`. No customer browser step, checkout request, order, payment or purchase occurred.

## Cause classification

**Direct initiating cause: unknown.** The preserved records locate the stop after the Preview POST acknowledgement and before protected Preview verification. A 29 September read-only Vercel deployment lookup confirms that `dpl_CaxbDz4Z3ofVSat46LjVHvoVUdF9` eventually reached `READY` at **21:00:23 UTC** (created at 20:58:17 UTC), with no Vercel deployment error code. This proves the backend build completed; it does not prove the supervised process stayed alive until then or identify a failed post-ready check. The records still cannot distinguish a process deadline, deployment identity, protected runtime, public-access check, alias check or another post-acknowledgement failure. The v17 shared-deadline fault cannot be assigned to v18 without evidence: v18 used separate build and post-ready limits.

**Confirmed diagnostic weakness:** `staging-surface-preview-deployment-verifier.mjs` catches all failures after acknowledgement and stops the worker group while leaving the one-use Preview record at `POST_ACK`. That fail-closed behaviour prevents an uncertain deployment from being replayed, but the record contains no non-secret substep or failure category. The whole-route and surface records likewise do not identify the failing post-acknowledgement check. This explains why the saved local records alone cannot establish the initiating cause; it does not establish what caused the deployment check to fail.

## Checks performed without external effects

- Local source was `c66c056` on `codex/tll-integration`. GitHub's integration ref was `4bc8a7a`; `main` was `727c4f9`. The local commit is documentation only.
- `npm run check:live-boundaries` passed with zero violations.
- Twelve focused Preview verifier/build-port tests passed, including slow healthy builds, wrong identity and protection, uncertain POST, and no replay. These are simulated tests, not hosted acceptance.
- The existing Vercel Keychain token allowed the fixed deployment-state GET, but Vercel returned HTTP 403 for the deployment-events endpoint and for protected/public alias lookups. No raw event, token or environment value was printed. The current alias bindings therefore remain unverified here.
- No v18 launcher, credential reader, Vercel write, Shopify cart, database operation or customer session was invoked during this diagnosis.

## Connected readback on 30 September

The newly connected Vercel app resolves the protected branch alias directly to held deployment `dpl_HNvrJ1JpHGdf3kGpafqsiVnNP6aQ`, `READY`, from source `4bc8a7a`. It resolves `www.theliftinglab.co.uk` to production deployment `dpl_4AebhGSLSpthdZRoyMt3EAcE7NpV`, `READY`, from `main` source `727c4f9`. The v18 enabled deployment remains `READY` and its immutable identity is unchanged. The connector's build-log call returned `Tool get_deployment_build_logs not found`; a filtered runtime-error read for that deployment from 20:58 to 21:03 UTC returned no logs. Neither result identifies the supervising process's exit reason. Vercel's deployment metadata lists the branch alias on both the old enabled deployment and the held deployment; the **direct alias lookup** is the current binding proof.

The connected Supabase app identifies `qdmvngjwkcsilzmqksme` as healthy staging project `tll-staging` in `eu-west-2`. A read-only aggregate of its five private control tables returned zero enabled controls, zero active sessions for the five temporary runtime roles and zero roles allowed to log in. This reconfirms those database parts of the hold on 30 September; it does not freshly prove the external provider, Edge secret, Shopify configuration or all Vercel environment values. GitHub still reports the integration ref at `4bc8a7a`.

The new readbacks settle the current deployment bindings and database controls, but the **direct v18 initiating cause remains unknown**. Do not prepare or approve a successor on the strength of a successful build or an empty application-error log. The missing evidence is an error or Vercel event tied to the exact post-acknowledgement check; the parent process's exit time was later recovered from its retained transcript below. The diagnostic weakness described above remains open for a disabled, reviewed correction.

## Retained process transcript checked on 30 September

The original local Codex session transcript at `/Users/tobiastipper/.codex/sessions/2026/09/28/rollout-2026-09-28T13-05-14-01a0e7b0-bd31-7f00-b5da-40fe57fbfd49.jsonl` preserves the parent process result. Its response item around line 14480 shows that the v18 launcher exited with code `1` and only `{"status":"RECONCILIATION_REQUIRED"}` at **21:00:29 UTC**. A separate deployment-state read in that same transcript at **21:00:23 UTC** still reported `BUILDING`. Later Vercel deployment metadata gives a `READY` time of 21:00:23 UTC; those observations do not reveal which state the worker itself saw or which check failed during the final six seconds. The last durable Preview record remains `POST_ACK` at 20:58:17 UTC.

The active window in the preserved local-only v18 arming source expired at **21:47:00 UTC**, and `staging-surface-preview-deployment-verifier.mjs` allowed **600 seconds** for build polling. The process ended roughly **132 seconds** after acknowledgement, so neither that 600-second limit nor the 21:47 window expiry was reached. This rules out those two specific timers as direct triggers, but it does **not** distinguish an individual read failure, unexpected deployment response, process abort, protected-runtime check or other post-acknowledgement failure. The generic failure catch and parent result suppressed the substep and error category, so the initiating cause remains unknown. No replay or live probe was used for this finding.

One further read-only GET to the exact Vercel deployment API on 30 September returned HTTP 200. Its raw metadata includes the custom `tllManifestSha256` value required by the deployment identity check; `readyState` is `READY`, `target` is null and Git source data is present. The connected app's shorter deployment view had omitted that custom field, so its omission there is **not** evidence of a missing manifest. This later GET does not prove which metadata or state the v18 worker received before it stopped. No response body, token or secret was saved in this record.

## Gate and next evidence

The Stage 3 incident remains **OPEN / P0** as issue `I01` in the delivery register. No successor run may be armed or published. The next investigation needs authorised access to the exact Vercel deployment events for `dpl_CaxbDz4Z3ofVSat46LjVHvoVUdF9` and any retained, secret-free worker error or substep evidence from approximately 20:58–21:01 UTC. The current token's HTTP 403 is an access limit, not proof that events are absent. Compare any retrieved facts with the post-acknowledgement code path. If they still do not establish a cause, retain the hold and report that limit.

Before proposing any later successor, record the direct technical and process causes, prove a specific preventive control in disabled tests, independently review its exact source, verify a fresh held baseline, and request the owner's approval for the exact new supervised run. Do not reuse any v18 record, identifier or arming commit.
