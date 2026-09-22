# V7 incident decision before any new hosted observer

## Current verdict: HOLD

The terminal v7 journal records `observation_validation_unavailable`, not
the failing validation stage. Its one-shot run ID is
`c66a7537-a63b-4071-baab-cd3442516ad2`; the journal remains mode 0600,
terminal and unchanged at SHA-256
`d53760204f68ca4949af4be340f2dadaf4e3442abe24b91a6eb66e5f6c4d6084`.
Separate successful serial reads cannot establish what the concurrent v7
process saw. Targeted retained `tll-v7*.log` files in `/private/tmp` contain
neither that run ID nor its terminal failure code. This search does not
prove no trace exists in another system.

The direct live trigger is therefore unknown. Under
`docs/ops/project-stage-execution-protocol.md`, the incident-learning gate
is not closed and no successor observer may be armed or executed. The
reviewed diagnostic change in `6f6f8c0` supplies finite, non-sensitive
stage labels for future observations. The offline concurrent replay in
`69f0a1c` returns the same HOLD/hash across three completion orders. Those
controls reduce ambiguity but do not retroactively identify v7's trigger.

## Available decisions

1. **Keep the strict HOLD.** Seek an existing v7 process trace or retained
   provider/Vercel response metadata through read-only access. If a direct
   cause is established, amend the incident record, prove the prevention
   with a synthetic counterexample, independently review, then plan the
   next one-shot observer under the existing protocol.
2. **Explicitly authorize a one-time diagnostic exception.** The owner may
   amend the incident gate for one *read-only staging observation* whose sole
   purpose is to identify the failure stage. This would be a new, separately
   approved credential window, journal and reviewed arming diff, with no
   provider enablement, secret write, deployment, purchase or production
   access. A terminal HOLD or failure ends the window; no automatic retry.
   The exception must be documented before code or credential changes.
   Even a successful observation would not authorize Stage 3 activation.

Neither decision has been made here. There is no v8 journal, token window,
arming diff or hosted action authorized by this record.
