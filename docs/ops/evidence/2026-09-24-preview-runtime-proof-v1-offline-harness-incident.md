# Stage 3 Preview runtime proof V1 offline-harness incident

The approved read-only runtime check did **not** contact Vercel or read the retained Preview bypass. Its final preflight found the V1 one-use journal already consumed and stopped. The published source Preview remains at `abd5a5258dd1072daf83a4447ce7110465f445e1`; account/cart activation remains disabled and unaccepted.

## Cause and resulting state

The first offline deadline test used `runpy.run_path` and called a reconstructed `main` function with an assumed replacement globals dictionary. That dictionary did not reliably replace the function's real module globals. The test therefore created `implementation-state/staging/preview-runtime-proof-v1.json`, the real one-use journal. Its terminal receipt is `RUNTIME_PROOF_HOLD`, with a past deadline and no Keychain/network phase. The test failed on its attempted read of its expected temporary receipt. The subsequent corrected `importlib` test ran in a private temporary directory and passed, but the initial consumed V1 receipt remained. The final preflight caught it before the approved credential check. There is no reason to infer any hosted runtime result from this receipt.

The process mistake was running an injected test against the real script path without verifying the effective journal binding before invoking `main`. The script's exclusive one-use journal and final preflight worked as intended: V1 cannot be retried. An unaccepted Xcode license also blocks system Python/Git on this Mac, so the pinned bundled executables must be used for local checks; that condition did not cause this incident.

## Prevention and recovery gate

V1 journal is preserved; do not delete, rename, replay or reinterpret it. A successor uses a distinct V2 script and journal. Every dynamic offline test must run a **copy** of V2 from a private temporary directory, verify that copy's derived journal path before execution, and check that the real V2 journal remains absent afterward. Static checks may read the real V2 file. The V2 plan must receive independent review, and the owner must approve the exact V2 credential window separately before any Keychain read or network request. If any preflight differs, stop rather than retry.

The retained `implementation-state/staging/preview-runtime-proof-v2-offline-test.py` implements that copy-only check. It ran with the bundled Python and returned `V2_ISOLATED_OFFLINE_EXPIRY_AND_REPLAY_PASS`: the expired copy produced a terminal HOLD without reaching Keychain, replay against its consumed temporary receipt failed, and the real V2 receipt was absent before and after. The test file itself is subject to independent review before using V2.

The incident has no observed effect on Shopify, Supabase, Vercel, the Git remote or customers. The remaining uncertainty is the protected Preview runtime's actual readiness response; source and Ready-deployment evidence alone do not settle Stage 3 acceptance.

## Independent audit follow-up

After V2's successful, separately approved hosted read, an independent Astra audit found that the first V2 **offline** harness isolated its journal but retained the real Keychain and HTTP implementations in the temporary copy. A regression in the deadline guard under test could therefore reach those effects before marker assertions failed. This is a conditional test-safety defect, not evidence that the recorded test did so; the expired V1 receipt and successful V2 terminal receipt remain unchanged. Do not reuse or rerun that harness.

The replacement private harness `implementation-state/staging/preview-runtime-proof-safety-offline-v3.py` removes both native credential and network functions from a temporary copy **before** executing it. It asserts the copy contains neither `/usr/bin/security` nor `opener.open(`, exercises an expired window with no stub calls, an unexpired window that reaches only the two stubs, and consumed-journal replay refusal. It checks the real V2 receipt's digest before and after and never invokes V1/V2 against their real receipt paths. The isolated command returned `ISOLATED_V2_DEADLINE_AND_REPLAY_PASS`. Independent re-review of this corrective harness and the handover correction is required before carrying the pattern into the next provider preflight.
