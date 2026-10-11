# Generation 23 v13 live staging run and recovery

Date: 28 September 2026

## Outcome

The owner-approved, staging-only v13 run was started once. It made material progress beyond v12: the five temporary database connections drained, the custom account provider was enabled, the database controls were enabled, and the separate checkout handoff setting was verified on.

The run then stopped safely at customer-surface activation because the Vercel command which changes the four customer/cart switches returned an uncertain result. The surface activation record is `RECONCILIATION_REQUIRED`, so the run did not claim that a customer-facing Preview was enabled. The owner browser journey never started. No Shopify sign-in, cart action, checkout-page request, order or purchase occurred.

The recovery is complete. Separate read-only checks prove the database roles retired, provider disabled, broker and Edge held, the temporary broker window absent, all five Vercel settings off, and the protected Preview runtime off.

## Source and deployment identities

- Published disabled source: `7552238bfc1b8333838352f482ac27bc85ba0553`
- Initial disabled Vercel Preview: `dpl_9FY9jgqPuBAqpEdetM1tPgzYLrDp`
- Fresh held consumer Preview: `dpl_HL7pDyrVHnThyn6iLuqSeAr6N3Xa`
- Fresh held consumer URL: `https://the-lifting-4mw724yue-my-lifting-lab-s-projects.vercel.app`
- Local-only arming commit: `3cdc139ce820556a36d0dc643c19078c455e429f`
- Preserved local evidence branch: `codex/gen23-v13-armed-evidence`
- Run ID: `a3f8d9f7-d030-4623-954b-a783c4197043`
- Window ID: `c216a47f-5445-4076-860c-451aa8d2931e`
- Window expiry: `2026-09-28T13:44:00.000Z`

The arming commit was never pushed. The protected remote remained at disabled source `7552238`.

## What passed before the hold

The durable whole-route record verifies these phases, in order:

1. disabled baseline;
2. temporary setting replacement;
3. database setup;
4. restricted connections for all five roles;
5. website and broker consumer readiness;
6. custom provider enable; and
7. database-control enable.

The v12 session-drain barrier was therefore cleared. The checkout handoff setting then reached `ENABLE_VERIFIED`. The next surface record reached `RECONCILIATION_REQUIRED`, and the whole route entered `HOLD` with `pendingPhase: surfaceEnable` and `nextIndex: 7`.

The practical meaning is important: backend activation succeeded, but customer-facing activation was not proved. The route stopped before the owner browser was opened.

## Recovery and final read-only audit

Recovery did not replay the whole run or any consumed record.

The existing one-use shutdown controls first returned:

- database shutdown `FINISHED`;
- provider disable `VERIFIED`; and
- zero database runtime sessions.

The original Vercel command path was unavailable during recovery, so the four exact, already-inventoried Preview setting IDs were set off through Vercel's fixed project API and each was read back in decrypted form without printing its value or credential. The separate checkout setting used its unused one-use freeze record and reached `FREEZE_VERIFIED`. The staging-only Edge flag was set off with the pinned Supabase command and its public token endpoint returned HTTP 503 with the expected disabled-control header.

The later held-state diagnosis reproduced the command failure exactly. The guarded command placed global `--yes` before the `env add` subcommand. Vercel CLI 60.1.3 consequently parsed the request as its default deployment command and rejected the otherwise valid `--git-branch` option before contacting Vercel. Moving `--yes` after `env add` made the exact command parse correctly. The corrected diagnostic unexpectedly reused Vercel's saved local login despite an intentionally empty environment, so it performed one same-value overwrite of `TLL_STAGING_CUSTOMER_ENABLED=false`. A fixed-ID decrypted API read immediately reconfirmed that exact setting remained `false`, and Edge remained held at HTTP 503. No setting was enabled.

After zero sessions were proved, the one-use database retirement returned `RETIREMENT_VERIFIED` and the broker-window removal returned `BROKER_GATE_RETIRED_VERIFIED`.

A final independent read-only audit returned `FINAL_HELD_VERIFIED` and proved:

- database result `PASS_FINAL_RETIRED`;
- five runtime roles have no login passwords, no enabled controls and zero sessions;
- custom account provider disabled;
- authenticated broker readiness held;
- broker readiness-window setting absent;
- Edge token service held;
- four private/public customer and cart environment settings off;
- checkout handoff environment setting off;
- the fixed branch alias points to held Preview `dpl_HL7pDyrVHnThyn6iLuqSeAr6N3Xa`;
- that protected Preview reports all four customer/cart runtime switches off; and
- that protected Preview reports checkout handoff off.

Two read-only swarm observers independently saw the held Edge response and the terminal retirement/freeze records. They made no hosted changes.

## Record digests

- Whole route HOLD: `3d8924e62840ae8357f11fe880eed197a659f8ffdc7cd8d837da0da7fd4045b7`
- Restricted connections PASS: `425d62eb56074e78a57493b711582cf4c07379fece56588bf691d965419c2dd0`
- Consumer diagnostic PASS: `15d6c5503ba4dbe879920f1316edff8ef083edaa9723f697ca688e6d2ea97848`
- Provider enable VERIFIED: `cbb7dcc6d7afdd55d63dad1f69b1b5c9b7eabf6ad74c2a473d2058b04203b901`
- Database activate FINISHED: `25c5570b0936654eeb303617876887421d429058a026ae2312ddf0762458fd75`
- Checkout enable VERIFIED: `5aef56e1e20b1631493e28910aa50ea66785dbfd5df923b452dc36fa93cf96a8`
- Surface enable reconciliation required: `3b0247bd54fa070f7f425cadb1c02871007d9c119a0d8deadd5a1cb2bf34424d`
- Database shutdown FINISHED: `a25944913f2d1e71b656785bbab29dcaedd8dc3b11dd6a7598c1a71a18382962`
- Provider disable VERIFIED: `b3345b2a1c49d869370111b6e053345b4724a4100d0748f034af772d9114e605`
- Checkout freeze VERIFIED: `7edf033cdcd8d5494db65c661ae426fd28561ff25c5aeaa4195dca8b74c9b5b6`
- Database retirement FINISHED: `12eebfbd5bba0b1a136a81e0499a054dd7e8a0b2703826f0c6059ca1688a38f1`
- Broker-gate retirement VERIFIED: `6361ced7f027670e0d2a60103f98ac19519c1b208c9d5bb6feb0d32469dab746`

## Remaining live work

The completion register remains at **1 of 8** required customer-journey checks. V13 proved more of the activation and shutdown machinery, but it did not prove the product/cart, owner sign-in, order isolation, guest-cart linking, guarded Shopify checkout page, or logout journeys.

Do not replay v13. Its one-use records are consumed. The successor must preserve the corrected Vercel argument order and use fresh identities and records. No production change or purchase is needed.
