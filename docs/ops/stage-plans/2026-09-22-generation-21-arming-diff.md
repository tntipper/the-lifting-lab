# Generation 21 one-window arming diff

This reviewed arming diff permits one bounded Generation 21 staging credential
window. It applies only to the named staging target. It never authorises a
production change, purchase, customer email, checkout, or replay of an earlier
attempt.

## Exact reviewed contract

| Field | Value |
| --- | --- |
| Generation | `21` |
| Window ID | `a5511645-77af-4fc9-9e4c-f5c8a474d5fa` |
| Active-window expiry | `2026-09-22T14:00:00.000Z` |
| Staging target | `qdmvngjwkcsilzmqksme` |
| Production excluded | `wrhgscovsgsudtedbljr` |
| Role/database predecessor | Gen19 `51809dd4-bd4b-44c7-8609-7dd8ca063679`, retired marker expiry `2026-09-21T11:08:34.000Z`, role `VALID UNTIL infinity` |
| Consumed attempt lineage | Gen20 `a009f2b4-86df-4701-a8bc-1112597e3c42`, stopped before provider/database dispatch, no replay |
| Local aggregate evidence | `implementation-state/staging/tll-generation-21-predecessor-retirement-evidence.json` |

The shared `ACTIVE_WINDOW_EXPIRES_AT` source is the only active expiry. The
transport, credential SQL, recovery, retirement preflight, and generated
manifest consume it. PostgreSQL `VALID UNTIL` and every active role marker must
match it exactly. The entry gate requires the complete retired Gen19 contract:
five exact markers, five inert roles, five reviewed ADMIN-only operator edges,
no execution edges, no runtime sessions, and exactly five disabled singleton
control rows.

## Exact arming changes

Only these live-action gates are armed for this window:

- `NATIVE_GENERATION_21_TRANSPORT_ENABLED = true`
- `NATIVE_GENERATION_21_DATABASE_TRANSPORT_ENABLED = true`
- `APPROVED_NATIVE_READ = True`
- `generation21Armed = true` with the exact bounded-window policy reason

Replay remains false for Generations 10 through 21. This diff does not alter
project refs, predecessor identity, role graph, provider values, customer or
cart controls, or production configuration.

## Readiness evidence

Before arming, the operator verified:

- exact commit `32196c8` Ready on immutable Preview
  `the-lifting-e2kcd3hp8-my-lifting-lab-s-projects.vercel.app`, with the stable
  branch alias assigned to the same deployment;
- all required Vercel Preview variable names present without reading values;
- a fresh read-only Gen19 aggregate baseline with all exact retired-role counts;
- both Supabase broker functions held at fixed `503 temporarily_unavailable`
  with `no-store` and `no-cache` headers;
- no Supabase custom provider configured;
- the existing Shopify client is Confidential, uses only
  `customer_read_customers` and `customer_read_orders`, and has the exact stable
  alias callback and `/auth` logout URI.

## One supported entry

The only supported launch command is:

```sh
node scripts/staging-generation-21-run-live-once.mjs \
  --retirement-evidence implementation-state/staging/tll-generation-21-predecessor-retirement-evidence.json
```

Run it once in a foreground long-lived shell with a bounded wait. Use only the
separate read-only journal observer for progress. Do not invoke the live
launcher directly, use `nohup`, background the attempt, run ordinary test
suites while armed, or replay this generation if the result is failed,
interrupted, or uncertain.

## Live result and end-of-window procedure

After the single attempt, regardless of result:

1. Preserve the aggregate phase, dispatch, and connection-failure evidence.
2. If the result is `CREDENTIALS_VERIFIED_CONTROLS_DISABLED`, continue directly
   through the already reviewed provider, control, Edge, server, and no-purchase
   acceptance gates while the bounded roles remain valid. Do not generate or
   install another credential set.
3. Retire after acceptance, on any failed or uncertain later gate, or before
   expiry. The read-only retirement preflight applies only after all five
   controls were enabled and the complete exact-active contract exists. If the
   window is retired before controls are enabled, skip that inapplicable
   preflight and run the pinned recovery directly; recovery itself accepts the
   exact disabled-control active shape and proves disabled controls after
   retirement. Never retry installation.
4. If the attempt stops before database dispatch, Gen21 recovery and its
   `PASS_RETIRED` receipt do not apply because the database must still carry the
   exact retired Gen19 predecessor. Obtain a new read-only proof of that
   unchanged Gen19 contract, record Gen21 as consumed with no replay, then
   disarm. If dispatch occurrence is uncertain, do not infer this branch.
5. For any attempted Gen21 database dispatch, require a fresh-session
   `PASS_RETIRED` receipt before disarming. If recovery is uncertain, retain the
   exact expiry and stop for reconciliation with all customer and cart controls
   held.
6. After the applicable exact retired proof, set all three native gates false,
   restore the expiry
   sentinel, set `generation21Armed` false, record the consumed no-replay
   outcome, and regenerate recovery, preflight, and activation artifacts.
7. Run ordinary checks only after disarming.

## Recorded terminal outcome

The credential installer completed once with
`CREDENTIALS_VERIFIED_CONTROLS_DISABLED`. The subsequent fully loaded Supabase
provider readback found an existing enabled provider whose broker secret did
not match the newly staged Generation 21 value and whose required `subject`
scope was blank. No database control, Edge flag, customer flag or cart flag was
enabled. The pinned recovery returned `PASS_RETIRED`; all Generation 21
branch-scoped Vercel configuration entries and Supabase Edge secret entries
were removed and their names read back absent. No enabled deployment was
created. The pre-existing custom provider and its older retained secret were
not changed. Generation 21 is consumed and cannot be replayed.

The root cause and the controls required before another credential window are
recorded in
`docs/ops/evidence/2026-09-22-generation-21-provider-readback-incident.md`.
