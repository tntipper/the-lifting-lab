# Generation 22 password-bearing process containment

This is a local design gate, not permission to contact a hosted service. All Generation 22 switches remain off.

## Finding

The setup coordinator currently erases generated passwords on exit and has no five-login proof. A first attempt to add that proof in-process failed independent review: a database runtime can reject or hang while closing, so an in-process timeout cannot both prove the connection has stopped and safely return a normal result. The attempted change was withdrawn before commit. No Gen22 credential or hosted request was made.

## Minimum compatible design

Keep the existing disabled setup and recovery components. Put all password-bearing Generation 22 work in a single one-use child process. The parent supervisor must never import credential material, read a token, or forward child output. It starts the fixed child as a detached process group, enforces a hard deadline outside the child, sends TERM then KILL to the group when necessary, and waits for `close` before reporting reconciliation. A successful outcome requires a zero exit, an exact small secret-free terminal receipt proving all five connection probes were drained, and no deadline or output violation. A nonzero/uncertain result never triggers an automatic replay. Database-role recovery remains separately gated by a fresh exact active-state read and the reserved one-use recovery record.

Build in order: (1) disabled parent state machine and synthetic child-process tests; (2) fixed child binding with existing setup/recovery journals, credentials and hosts; (3) connection proof within the child before its passwords are erased; (4) whole-sequence fake-network success and failure tests; (5) independent review, fresh staging baselines, exact arming diff and separate action-time approval. Do not arm after only step 1.

The parent tests must cover no child while disabled, exact success after child close, a child ignoring TERM followed by group KILL and observed close, oversized or secret-bearing output never forwarded, failure to close never presented as success, and no parent-side recovery before exit. The child tests must cover runtime close rejection/hang, no post-abort host step, five-login success, and one-use recovery after any uncertain setup.
