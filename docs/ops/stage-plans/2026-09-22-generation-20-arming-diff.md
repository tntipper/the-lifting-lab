# Generation 20 one-window arming diff

This reviewed arming diff permits one bounded Generation 20 staging credential
window. It is an operator instruction for the named staging target only. It
never authorises a production change, purchase, customer email, checkout, or
replay of an earlier attempt.

## Exact reviewed contract

| Field | Value |
| --- | --- |
| Generation | `20` |
| Window ID | `a009f2b4-86df-4701-a8bc-1112597e3c42` |
| Active-window expiry | `2026-09-22T13:23:00.000Z` |
| Staging target | `qdmvngjwkcsilzmqksme` |
| Production excluded | `wrhgscovsgsudtedbljr` |
| Predecessor | Gen19 `51809dd4-bd4b-44c7-8609-7dd8ca063679`, retired at `2026-09-21T11:08:34.000Z` |
| Local secret-free evidence | `implementation-state/staging/tll-generation-20-predecessor-retirement-evidence.json` |

The shared `ACTIVE_WINDOW_EXPIRES_AT` source is the only runtime expiry value.
Transport, credential SQL, recovery, retirement preflight, and the generated
manifest consume it. PostgreSQL `VALID UNTIL` and every active role marker must
match it exactly. A finite matching expiry remains recoverable just after the
window closes; `infinity`, absent login/password, and any mixed role state fail
closed.

## Exact arming changes

Only these live-action gates are armed for this one window:

- `NATIVE_GENERATION_20_TRANSPORT_ENABLED = true`
- `NATIVE_GENERATION_20_DATABASE_TRANSPORT_ENABLED = true`
- `APPROVED_NATIVE_READ = True`
- `generation20Armed = true` with the bounded-window policy reason

Replay remains false for Generations 10–20. The operator must not alter the
project refs, predecessor identity, role graph, provider configuration, or
other controls.

## Required evidence and one supported entry

Before the attempt, verify the local predecessor evidence is secret-free and
matches the exact Gen19 retired contract. The only supported launch command is:

```sh
node scripts/staging-generation-20-run-live-once.mjs \
  --retirement-evidence implementation-state/staging/tll-generation-20-predecessor-retirement-evidence.json
```

Run it once in a foreground long-lived shell with a bounded wait. Use only the
separate read-only journal observer for progress. Do not invoke the live
launcher directly, use `nohup`, background the attempt, or run ordinary test
suites while the three gates are armed. Do not replay this Generation 20 window
if it is interrupted, uncertain, or consumes its dispatch journal.

## Immediate end-of-window procedure

After the single attempt, regardless of result:

1. Preserve the secret-free phase, dispatch, and connection-failure evidence.
2. Run the read-only retirement preflight when its exact-active conditions are
   present, then run the pinned recovery. The preflight may gate recovery but
   never substitutes for retirement. Do not retry installation.
3. Require a fresh-session `PASS_RETIRED` postcommit receipt before restoring
   the expiry sentinel or disarming. If recovery is uncertain, retain the exact
   expiry and recovery artefacts and stop for reconciliation while keeping all
   customer/cart flags held.
4. After `PASS_RETIRED`, immediately disarm all three native gates, restore the
   expiry sentinel, set `generation20Armed` false and the policy reason to the
   post-window retirement state, then regenerate the recovery/preflight SQL and
   activation manifest.
5. Only after disarm may ordinary checks run. Any follow-on work needs a new
   reviewed successor boundary; this plan grants no second window.
