# Generation 23 v12 live staging run and recovery

Date: 28 September 2026

## Outcome

The owner-approved, staging-only v12 run was started once. It did not reach customer sign-in or the shopping cart. It stopped at the provider-enable boundary and returned `RECONCILIATION_REQUIRED`.

The run did improve on v11: the streamlined five-role database proof completed successfully, a fresh protected Vercel Preview was built, and both website and broker consumer diagnostics passed. The whole-route record then entered `HOLD` at `providerEnable`, before any provider, database-control, customer/cart-surface, Shopify-account or checkout-handoff activation record was created.

No production system was targeted. No purchase was attempted.

## Published and local source identities

- Disabled source and protected staging branch: `d01b69a6b6dd317e76c289f3f3a5ad81cf080a6c`
- Disabled Vercel publication: `dpl_8ZFTFhNgZN8Eqkau9g5Y98m3WemR`
- Fresh consumer Preview created during the run: `dpl_3KUeetBerf7cFbQW7LhWfaTtvkno`
- Local-only arming commit: `3056a97c9715c3700e7c0b93424d3dc8ad338297`
- Preserved local evidence branch: `codex/gen23-v12-armed-evidence`
- The protected remote remained at the disabled source. The arming commit was never pushed.

## What passed before the hold

- Baseline and temporary-setting preparation passed.
- Database setup finished.
- The streamlined restricted-connection proof passed for all five roles. Its record finished `PASS` at sequence 57.
- The fresh protected consumer Preview finished its one-use deployment record.
- The consumer diagnostic finished `PASS` at sequence 14.
- The whole-route record stopped at `providerEnable`, with `nextIndex: 5`.
- No v12 provider-enable, database-activate, surface-enable, checkout-enable, owner-journey or purchase record was created.

The immediate stop condition was the route's bounded wait for temporary database sessions to drain before the provider step. The provider step deliberately leaves its write record untouched when that wait does not complete in time. This is why the whole-route record is a HOLD while no provider-enable record exists.

## Independent recovery and final live state

The route was not replayed. A separate read-only observation found:

- database controls disabled;
- zero runtime sessions;
- custom login provider disabled; and
- the temporary broker-readiness window still present.

With those safe preconditions proved, the existing one-use recovery components were used once:

- database retirement returned `RETIREMENT_VERIFIED`;
- the independent final database read returned `PASS_FINAL_RETIRED`;
- broker-gate retirement returned `BROKER_GATE_RETIRED_VERIFIED`;
- a separate secret-name read proved the readiness-window name absent; and
- the broker endpoint returned its held state.

A separate final storefront read then proved all controls held on consumer Preview `dpl_3KUeetBerf7cFbQW7LhWfaTtvkno`:

- private customer: off;
- private cart: off;
- public customer: off;
- public cart: off;
- customer-subject broker: off; and
- checkout handoff: off.

The branch was restored to disabled commit `d01b69a6b6dd317e76c289f3f3a5ad81cf080a6c`. The consumed v12 records must be preserved and must not be replayed.

## Record digests

- Whole route HOLD: `ac752c713ae96fb912dd5886e7092a0bd219b4bc1d7ee39037048b67ef756b45`
- Restricted connections PASS: `499cc51e940fcff9d14423b8898585c89f219e544cdd220eda5b328130db6802`
- Consumer diagnostic PASS: `f0bf095a875d67c41c7c828286a0a2828a57e1283450847cb2a29d3e705e6269`
- Database retirement FINISHED: `f4324da2b567885736d7ac1f05f58098ad5fcebca37f0883d88a16b05f9eba39`
- Final retired read FINISHED: `7f78e84a002acf2cd43403d5f02eb364dc1bdb61b35a8a5f7e4edaa006d168d4`
- Broker-gate retirement VERIFIED: `0aada09d97092dc1cf4059cc4b15c2f9da141959995cd6cc2865a5f5d22c9842`

## Next gate

The shopping-cart journey remains unproved: the completion register stays at 1 of 8 live checks. Do not replay v12. The next attempt needs a fresh successor identity and fresh one-use records, with a provider-drain timing change that still preserves the pre-provider safety check. Review and publish that disabled successor before seeking approval for another one-time staging run.
