# Generation 23 v7 supervised staging run and recovery

Date: 27 September 2026. Staging only (`qdmvngjwkcsilzmqksme`); no purchase, customer message, or production change.

## Actual result

- Reviewed disabled source `49fa1fee9866f265ebbbd892538bf5549c607d78` was published to the protected staging branch. The exact local arming commit `3f2a4fc9a42cd6f3693c300746fe8d4fd1ffa957` was never pushed; local revert `069fbe420d9c4058b7335876468c9aee56e36508` switched its 64 paths off again.
- One supervised launcher invocation ended `RECONCILIATION_REQUIRED`. Its whole-route journal is `HOLD` at `consumerReadiness` (21:51:13.578 UTC). Earlier baseline, settings, database setup, and restricted-connection phases are `VERIFIED`. Provider, database controls, customer account/cart, checkout, and owner sign-in phases were never dispatched.
- The new protected held Preview build `dpl_Ga4X3qkmiN4ZvwunDRCfCNfDyVFA` is `READY`, source `49fa1fee...`, with all four account/cart flags OFF. Its one-use consumer-build journal is `VERIFIED` at 21:51:05.964 UTC. Vercel request evidence shows `/api/staging/consumer-readiness` returned HTTP 200 after all four website role reads, with the serverless function completing about 21:51:10.224 UTC. The failure followed about 3.35 seconds later, before any customer-facing activation.
- Supabase function invocation logs queried for 21:00–22:00 UTC showed no invocation at 21:51 (a later independent held GET at 21:55 appeared). The exact cause is not proved. The strongest current area to inspect is the broker service-key/Edge read or its response handling. Do not describe the website build or database role connections as failed.

## Verified recovery

- Immediately after HOLD, a fresh read showed all five temporary staging logins/passwords still present, four sessions, and all five database controls OFF. A later read showed zero sessions.
- A separately reviewed one-use broker-gate removal was dispatched. Its journal `tll-generation-23-broker-gate-retire-v7.json` is `HOLD` because the deletion reply did not satisfy the strict response contract. Do not replay it. Independent Supabase secret-name inventory shows `TLL_STAGING_BROKER_READINESS_WINDOW` absent; an authenticated broker GET returned HTTP 404 `{"status":"held"}`. The retained broker database-password setting remains.
- A separately reviewed one-use database retirement used the existing exact v7 recovery SQL, host, transport and retirement journal. It returned `RETIREMENT_VERIFIED`, receipt SHA-256 `0b621bdcd1f9fd1fbb70dbafd140adc847fe17e743bf9ec1012b21d4159f4a55`. An independent read confirmed zero logins, zero passwords, zero sessions, zero controls ON, and five retired role markers.
- An independent provider GET returned `enabled:false`. A protected GET to the held Preview `/api/staging/readiness` returned HTTP 200 with private and public customer/cart flags all false and the exact deployment ID. Unauthenticated Preview access remains login-gated (verified before the run).

## Before another supervised customer run

1. Preserve every v7 one-use journal and the v7 arming/revert commits. Do not replay the v7 launcher, Preview build, settings, broker-gate deletion, or retirement.
2. Make the consumer/broker pre-activation checks report a small secret-free substep outcome, so a new stop identifies whether the website response, service-key read, Edge request, or Edge response failed. Keep the source switches OFF by default.
3. Prove the broker's held path and the website transport against the real protected Preview, then run a complete local network-fake rehearsal and independent review of the exact successor source and arming patch.
4. Obtain a fresh read-only staging baseline and only then open a new one-use supervised window. A new staging source publication and a new window are separate actions under the Stage 3 gate. No production deployment or purchase is authorized.

The local temporary diagnosis programs under `/tmp/tll-gen23-v7-*` are disposable and are not the durable evidence. The private one-use journals in `../implementation-state/staging/` are the source of truth for dispatched actions.
