# Generation 22 password-bearing process containment

This is a local design gate, not permission to contact a hosted service. All Generation 22 switches remain off.

## Finding

The setup coordinator currently erases generated passwords on exit and has no five-login proof. A first attempt to add that proof in-process failed independent review: a database runtime can reject or hang while closing, so an in-process timeout cannot both prove the connection has stopped and safely return a normal result. The attempted change was withdrawn before commit. No Gen22 credential or hosted request was made.

## Minimum compatible design

Keep the existing disabled setup and recovery components. Put all password-bearing Generation 22 work in a single one-use child process. The parent supervisor must never import credential material, read a token, or forward child output. It starts the fixed child as a detached process group, enforces a hard deadline outside the child, sends TERM then KILL to the group when necessary, and waits for `close` before reporting reconciliation. A successful outcome requires a zero exit, an exact small secret-free terminal receipt proving all five connection probes were drained, and no deadline or output violation. A nonzero/uncertain result never triggers an automatic replay. Database-role recovery remains separately gated by a fresh exact active-state read and the reserved one-use recovery record.

Build in order: (1) disabled parent state machine and synthetic child-process tests; (2) fixed child binding with existing setup/recovery journals, credentials and hosts; (3) connection proof within the child before its passwords are erased; (4) whole-sequence fake-network success and failure tests; (5) independent review, fresh staging baselines, exact arming diff and separate action-time approval. Do not arm after only step 1.

The parent tests must cover no child while disabled, exact success after child close, a child ignoring TERM followed by group KILL and observed close, oversized or secret-bearing output never forwarded, failure to close never presented as success, and no parent-side recovery before exit. The child tests must cover runtime close rejection/hang, no post-abort host step, five-login success, and one-use recovery after any uncertain setup.

## Whole-run map before the next connector

This section is the review checklist for the complete run. A component-level PASS does not satisfy a later row. No row authorises hosted access.

| Point in the run | Proof before continuing | Failure handling |
| --- | --- | --- |
| Before worker creation | Fresh Supabase and Vercel disabled-state baseline; exact one-use identities, deadlines and unconsumed records; reviewed fixed worker path | Stop without creating passwords or a worker if any input drifts |
| Parent starts worker | One fixed absolute script, detached process group, minimal secret-free arguments and environment; supervisor-loss pipe held open | Kill the whole process group on timeout, parent loss, invalid output or worker error; no automatic replay |
| Worker begins | Claim setup and reserve recovery record before credential generation or hosted side effect | A claim failure stops before any host call; preserve both records for reconciliation |
| Setup | One credential installation and 21 setting writes in journal order, exact receipt after each; controls remain OFF | Uncertain write stops further writes, marks HOLD where durable, and preserves evidence; never repeat a spent capability |
| Settings readback | Exact staging project/branch, 16 secret names and classifications, Edge name and four OFF values | Do not call this a completed setup merely because the 22 write receipts exist |
| Five restricted logins | Each temporary password works against the pinned staging database with the expected identity and limited permissions; all five connections and their runtimes close before password erasure | Failure, rejected close or hung close cannot yield success; parent kills the group at the hard deadline and reports reconciliation |
| Recovery while the owning worker is alive | Fresh exact active-state read, at most one reserved retirement write, then a separate retired-state read after confirmed write | Lost or uncertain retirement response stays HOLD; read-only reconciliation only, never repeat the write |
| Worker crash before recovery | Temporary database passwords expire at the pinned active deadline, but the original recovery record's in-memory owner and capability are lost | Keep account/cart OFF; mark the run for read-only reconciliation and a separately reviewed recovery action. Never pretend the original record can be replayed or that expired passwords imply roles were retired |
| Child terminal | Only after drained connections, erased password buffers, disposed hosts and verified recovery: exact small secret-free JSON and zero exit | Any missing proof, output anomaly or nonzero exit is reconciliation, not success |
| Parent close | Observe child close and ensure no descendant in its process group can survive a successful leader exit | Kill residual group members; if group containment cannot be established, do not accept success |

### Failure cases to rehearse end to end with fake services

1. Claim or recovery reservation fails before the first host call.
2. Database installation is accepted but its reply is lost; no later setting write or automatic retry occurs.
3. A middle setting write is uncertain; later writes stop and the one-use records remain attributable.
4. Settings readback disagrees with receipts; no restricted-login or success claim follows without reconciliation.
5. Login 1–5 succeeds or fails independently; a connection that ignores abort, rejects close or hangs close cannot outlive the worker group.
6. Parent dies while the worker or a subprocess is active; the worker's supervisor-loss watcher kills its group.
7. Worker exits while a helper has no inherited output pipe; the parent still kills the group before accepting a terminal.
8. Active-state precheck is wrong, retirement response is lost, or final retired-state read fails; no retirement replay and no success terminal.
9. Clock moves backwards, deadline expires, output is too large or contains extra fields, or the terminal is duplicated; parent reports reconciliation.
10. Worker is killed after setup but before retirement; a new process cannot reuse the reserved recovery record. Prove the response is reconciliation and that a separately authorised recovery plan is needed after a fresh read.

The first child-binding slice should prove process-group ownership and cases 6–7 before credential or hosted code is added. The worker slice then proves cases 1–5 and 8–9 in a complete fake-service rehearsal. The fixed Storefront-token classification and protected Preview build remain separate later gates.

The first whole-run review exposed case 7 in the existing disabled parent: child `close` alone did not stop a helper with no inherited pipe. The parent now kills residual process-group members on leader exit or close and refuses success if that group stop fails for a reason other than the group already being absent. A real local worker-plus-helper test proves this containment; the fixed child binding and supervisor-loss pipe are still absent. This is a corrected offline safety slice, not a completed Gen22 worker or staging gate.

The second whole-run review exposed case 10: the recovery journal owns its capability in process memory. After worker death, a replacement process may read the record but cannot dispatch retirement through that original capability. This is deliberate replay protection, not a reason to weaken the journal. Normal retirement is available only while the worker still owns the record and has proved every connection drained. A crash, hung close or uncertain host response closes the automatic path; the parent reports reconciliation, the fixed login expiry limits access, and a fresh read-only role inventory plus separately reviewed recovery action is required. A future live arming review must confirm this operator path and must not claim automatic cleanup on worker loss.

The disabled setup now requires a five-login result that explicitly says all connections are drained after the 22 write receipts and OFF-value readback. It awaits that call directly, so a hung close cannot be transformed into a successful timeout response in the password-owning process; the future external parent must contain a hang. The disabled worker core joins verified setup to one recovery invocation and emits the parent's exact success terminal only after confirmed retirement. It returns reconciliation without starting recovery if setup or the login proof is uncertain, because a still-running database connection must not overlap with role retirement. A fake-service full run now uses the real one-use setup and recovery journals and proves the success order. The connection service in that rehearsal is simulated: real database draining, parent-loss containment and failure-path process rehearsals remain before any arming.

The existing five-role verifier is now wrapped by a disabled Gen22 adapter. It accepts only the pinned expiry, five encoded passwords and a verified CA, then maps the verifier's exact PASS after it has awaited every runtime close to `PASS_DRAINED`. A rejected close fails; a hung close remains pending until the future external parent terminates the worker group. The adapter has not yet been bound to a real child or a real database runtime. Do not treat its injected tests as live connection evidence.

The fixed child binding and worker entry now exist, with both switches OFF. The binding starts only the fixed entry path in a detached group, passes no credential in arguments or environment, and keeps the supervisor-loss pipe open. The entry exposes the existing watcher but deliberately has no hosted assembly, so even enabling the binding alone cannot run Gen22. Local process tests prove exact spawn inputs, parent-loss termination of the worker and its helper, and termination of a worker stuck in a simulated connection close. A pipe error marks the child unsafe; a late error after close cannot signal a reused process ID. This proves the process boundary, not the final credential-owning child. The next whole-run slice is to connect the real setup, five-role adapter, recovery and fixed hosts inside this entry; then repeat success and all failure cases through that exact entry before an arming review.
