# Generation 23 v18 live staging run and recovery

Date: 28 September 2026

## Owner instruction

Do not begin another run. The v18 route and all of its one-use records are consumed and must never be replayed. This document records the completed containment only; it does not authorise a successor run.

## Outcome

The single v18 invocation made genuine progress. It passed the opening baseline, temporary settings, database setup, all five restricted database-role checks, the protected consumer Preview, website and broker consumer checks, provider enablement, database-control enablement and checkout enablement.

It then stopped at `surfaceEnable` with `RECONCILIATION_REQUIRED`. Vercel had accepted enabled Preview `dpl_CaxbDz4Z3ofVSat46LjVHvoVUdF9`, and the one-use Preview record had reached `POST_ACK`. The whole-route record remained held with `surfaceEnable` pending. The exact initiating cause has not yet been established from the preserved records, so it must not be labelled as another confirmed timeout without further read-only diagnosis.

The owner browser journey never started. No customer sign-in, product journey, checkout-page request, payment request, order or purchase occurred. Production was not changed.

## Identities

- Window: `d5180b08-79ee-43e8-96d4-4f73621fecbf`
- Whole-route run: `5d70cb99-210c-48e5-bd5e-c4a54ae3867e`
- Published disabled source: `4bc8a7a28e4704f738a0b4dc1ec81717803aa622`
- Local-only v18 arming commit: `33bd1940fea7dd12671f21f38a2ee7803020dc18`
- Evidence branch: `codex/gen23-v18-armed-evidence`
- Consumer Preview: `dpl_Ekseo8fER38fMH841A3hYvrTpEN3`
- Enabled Preview accepted before the stop: `dpl_CaxbDz4Z3ofVSat46LjVHvoVUdF9`
- Recovered held Preview: `dpl_HNvrJ1JpHGdf3kGpafqsiVnNP6aQ`
- Held immutable URL: `https://the-lifting-z6es30yzl-my-lifting-lab-s-projects.vercel.app`
- Edge revision: `tll-gen23-v18-cart-route-1`

The arming commit was never pushed. The local integration branch and the GitHub integration branch were both returned to the disabled source before this documentation-only commit was made locally.

## Recovery performed without replay

The whole route was not rerun. Recovery used separate reads and shutdown operations:

1. All five branch-scoped Vercel controls were set to their disabled values and read back in their decrypted form: private customer false, private cart false, public customer disabled, public cart disabled and checkout handoff false.
2. Database shutdown returned `SHUTDOWN_VERIFIED` with receipt SHA-256 `06089e73d95d21c5a39f4c1073c5dc8d296d4491599f41885108a08aacbd5571`.
3. Provider disable returned `PROVIDER_DISABLED_VERIFIED`.
4. A backend read proved database controls disabled and zero runtime sessions.
5. Database retirement returned `RETIREMENT_VERIFIED` with receipt SHA-256 `dfe964503fee3465127da10a4dd2710a172614a7a555f0dc3d26f5b46fecf3d7`.
6. The final database read returned `PASS_FINAL_RETIRED`.
7. The exact Edge readiness-window secret was removed.
8. A new held Preview was built from the disabled source and the protected branch alias was attached to it.
9. Temporary local recovery and verification scripts were deleted after use.

## Final independent held-state proof

The final read-only verification returned:

- Protected alias deployment: `dpl_HNvrJ1JpHGdf3kGpafqsiVnNP6aQ`, `READY`, source `4bc8a7a28e4704f738a0b4dc1ec81717803aa622`.
- Unauthenticated HTTP response: `302`, confirming the Preview remained behind Vercel authentication.
- Preview runtime: private customer false, private cart false, public customer false and public cart false.
- Checkout readiness: checkout handoff false.
- Vercel environment readback: both private flags `false`, both public flags `disabled`, and checkout handoff `false`.
- Edge guard: HTTP 200, revision `tll-gen23-v18-cart-route-1`, project match true, broker flag off and readiness window absent.
- External provider readback: HTTP 200 and `enabled: false`.
- Local active source and GitHub integration source: `4bc8a7a28e4704f738a0b4dc1ec81717803aa622` before this documentation-only local commit.

## Required next action

There is no authorised next live action. Do not start a successor, do not replay v18, and do not reuse its window or one-use records. If the owner later requests more work, begin with read-only diagnosis of the preserved v18 stop and explain the evidence before proposing any new live activity.
