# Activation safety boundary stage plan

## Outcome

Prevent ordinary verification from invoking live staging transports and require documented incident learning before another credential generation is considered.

## Acceptance criteria

- A machine-readable policy requires planning, pre-arm review, separate live execution, incident review and no replay.
- A repository check rejects native launcher calls from tests, live-launcher imports from tests, generated-artifact writes from tests, enabled native transport gates and enabled Keychain reads.
- The existing unsafe Generation 6 test pattern is removed as well as the corrected Generation 10 pattern.
- `npm test`, typecheck and lint pass, with any pre-existing warnings identified.
- The Generation 10 incident record identifies cause, recovery, preventive control and remaining uncertainty.
- Generation 10 remains disarmed and consumed; Generation 11 is not created.

## Exclusions

No hosted mutation, credential generation, provider change, deployment, production change, purchase, customer email or supplier order. No Generation 6--10 replay.

## Plan

1. Verify the recovered repository and journal state.
2. Inspect every ordinary test and native gate.
3. Add the policy, checker, negative tests, protocol and incident record.
4. Remove remaining ordinary-test native invocations.
5. Run the boundary check and focused tests, then the full test, typecheck and lint gates.
6. Correct only failures caused by this work and rerun the relevant gate.
7. Review the final diff against this plan, commit the coherent unit and update the handover.

## Stop conditions

Stop on any enabled native gate, live external request, unexpected working-tree change, failed recovery evidence, or check that could require credentials. This stage is local and read-only with respect to hosted systems.

## Verified result

Complete. The first full-suite run exposed a generated-artifact race: recovery tests rewrote pinned SQL while the manifest test ran in parallel. The cause was reviewed before correction. Those tests now use `--check` only, and the boundary rejects future test-side generator writes.

- Boundary check: pass, zero violations.
- Focused safety and recovery tests: 50 passed.
- Full repository tests after correction: 1,619 passed, zero failed.
- Typecheck: pass.
- Lint: zero errors and six pre-existing warnings.
- Hosted mutations, new credentials and successor generation: none.
