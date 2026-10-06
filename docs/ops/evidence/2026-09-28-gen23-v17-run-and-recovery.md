# Generation 23 v17 live staging run and recovery

Date: 28 September 2026

## Outcome

The owner-approved v17 staging run made substantial progress beyond v16. It passed the opening baseline, temporary settings, database setup, all five restricted database-role checks, the protected consumer Preview, website and broker consumer readiness, provider enable, and database-control enable.

The run stopped during `surfaceEnable`, before the owner browser opened. Vercel accepted enabled Preview deployment `dpl_CZL7yNxWaS8PE3Nzi2DZredjRNvk`, and later reported it Ready, but the single 180-second verifier budget also covered all post-Ready identity, protected-runtime, public-protection and alias checks. The one-use Preview record remained at `POST_ACK`; the surface record remained at `INTENT_RECORDED`; and the whole-route record remained active with `surfaceEnable` dispatched. These records are consumed and must never be replayed.

No Shopify sign-in, owner journey, checkout request, payment request, purchase or production change occurred.

## Source and deployment identities

- Published disabled source: `6cebcb571d04387c499df840f81967a753b25574`
- Local-only v17 arming commit: `67c605abd7ec2087ef4ca7bb80668c25257cb403`
- Evidence branch: `codex/gen23-v17-armed-evidence`
- Consumer Preview: `dpl_GuoYmkJp5qKxksMkJzJ59Vmw5HAJ`
- Enabled Preview accepted before the stop: `dpl_CZL7yNxWaS8PE3Nzi2DZredjRNvk`
- Recovered held Preview: `dpl_EgJ21dtNGXNnJNo2ZnStLEmzNnV3`
- Held immutable URL: `https://the-lifting-3xz9gcuic-my-lifting-lab-s-projects.vercel.app`
- Edge revision: `tll-gen23-v17-cart-route-1`

The local and remote integration branch were returned to the disabled source. The arming commit was never pushed.

## Recovery

The whole route was not replayed. Because the surface mutation had an accepted deployment but no verified reply, containment used fresh reads and the separately reserved OFF records:

1. All five branch-scoped Vercel settings were written to `false` and read back decrypted as `false`: private customer, private cart, public customer, public cart and checkout handoff.
2. The database shutdown transaction returned `SHUTDOWN_VERIFIED`.
3. The provider disable operation returned `PROVIDER_DISABLED_VERIFIED`.
4. A readback proved database controls disabled and zero runtime sessions at that point.
5. A new held Preview was accepted. Its strict one-use verifier also exhausted the shared post-Ready budget, leaving its record at `POST_ACK`, but a fresh authenticated read then proved the Ready deployment itself, all four runtime flags false, checkout handoff false and the branch alias attached to that held deployment.
6. After the held-Preview probe sessions drained to zero, database retirement returned `RETIREMENT_VERIFIED`.
7. Broker-window removal returned `BROKER_GATE_RETIRED_VERIFIED`.
8. The independent final database read returned `PASS_FINAL_RETIRED`.
9. A fresh provider read proved `enabled: false`; a fresh secret-name read proved the readiness window absent.
10. The v17 broker endpoint returned HTTP 404 with `{ "status": "held" }` and revision `tll-gen23-v17-cart-route-1`.

The stable protected alias resolved to the held Preview URL. The running held Preview reported private customer, private cart, public customer and public cart all false; its checkout-readiness route reported checkout handoff false.

## Root cause and correction

The enabled build became Ready after 124.555 seconds. The recovery held build became Ready after 165.175 seconds. Both were inside the old 180-second build deadline, but that same deadline also included every post-Ready safety check, leaving only about 55 seconds and 15 seconds respectively.

The disabled successor correction separates these concerns. Vercel build polling receives a ten-minute allowance, and the required post-Ready identity/security proof receives its own two-minute allowance. The outer whole-run supervisor and shutdown reserve remain authoritative, so normal deployment slowness is recorded and tolerated while an actual identity mismatch, public exposure, terminal deployment failure or loss of shutdown time still stops the run.

## Record digests

- Whole route: `bd23fe16ff011f1d23cb4aa64f4cbbb59957205b1c7e19005ee9d8af9c7f3064`
- Restricted connections PASS: `6a6989cbefe8aa3219fc75fa395378987c047f48319add7f33ab4d53921cf5fa`
- Consumer diagnostic PASS: `b35edd8dc5ddd5cb405d6dd27e4ab8feb527da249be3306df12140cb98d29eff`
- Database shutdown FINISHED: `22c5b7051622faa995ed96ddfd4cf13b798c9bef43f3d81c668a88470c58b4a0`
- Provider disable VERIFIED: `a8b32376ec11ff35989d2c4ffd61eef619a2471839ded35c2cc6375281ea98c7`
- Database retirement FINISHED: `b18d50d56a634508c498450b10611a069a0d4d50a68f2fec6af23083af32688c`
- Final retired read FINISHED: `31a2c93ee5333edc74d9f9c85bbf4604fde1c4a9302410c3074bc5eb2930ec33`
- Broker-window removal VERIFIED: `cb6017d19b2306f4c4d6ecb0a472e86685cb8fda86613bbd75919bb84ac6ecb5`

## Next action

Do not replay v17. Publish and verify a fresh disabled successor with new window, Edge revision and one-use record names. Its live run should continue through ordinary Vercel slowness, recording elapsed time, and stop only for a terminal deployment/service failure, identity or protection mismatch, or loss of the reserved shutdown budget.
