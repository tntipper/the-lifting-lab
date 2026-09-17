# Customer and cart repository CI

The `customer-cart-repositories` job exercises the real PostgreSQL boundaries for
the customer repository, bounded driver, anonymous staging cart, subject
broker, provisional admission and atomic registration bridge repositories on a fresh GitHub-hosted Linux runner. It requires no project
credentials or hosted services.

`tests/customer-repository/run-ci.sh` refuses ordinary local/self-hosted execution,
remote Docker endpoints and an existing `tll-stage0-postgres` container. It creates
only its own labelled PG17 fixture with the synthetic password and loopback55432
binding required by the existing tests. Cleanup requires the exact random owner
label. It never adopts or resets the owner's Mac fixture.

The job installs005 under a non-superuser, runs its rollback-only migration/ACL
regression and actual adapter suite, checks the real pg driver's transaction
behavior, and runs006's disposable-database acceptance. The customer runner leaves
its control disabled; the cart runner drops only its own database and roles.
Migration007's separate marked database then receives the same
non-superuser installation, rollback regression and actual repository suite,
leaving its control disabled and its synthetic rows empty. Migration008 then
receives its own marked database and the same installation, migration regression
and actual repository checks. This proves encrypted admission intents, one-use
claims and uncertainty holds without dispatching a provider request; the fixture
finishes disabled and empty. The admission coordinator then uses that fixture
with signed synthetic HTTP to verify real session-reader/admission adapters,
commit ordering, account changes and lost acknowledgements. No hosted request
is dispatched, and the fixture is again disabled and emptied.

Finally, the bridge setup installs source-verified 007/008/010 together under a
non-superuser in the separate marked `tll_admission_bridge` database, using its
fixed `tll_ab_*` role mapping. The rollback-only 010 reconstruction runs first,
checking the exact installed function bodies, ACL mutation rejection and baseline
restoration. The bridge acceptance suite then exercises the real repositories and
coordinator with synthetic signed HTTP, including release capability checks,
atomic terminal propagation, disable epochs, lock ordering and post-lock expiry.
These two bridge suites run sequentially and leave all three controls disabled
and private workload empty. Standalone 007/008 fixtures remain separate.

The bridge helper accepts the same exact `tll-stage0-postgres` container name as
this runner and preserves the local `tll_admission_bridge` database identity; no
arbitrary container or database override is introduced. The enclosing owned
container and anonymous data volume are removed on job exit, including failures,
only after the ownership label matches. The separate browser job covers the cart
at six widths.

These results establish local synthetic database behavior against the tested
commit. They do not establish hosted migration, runtime credential, pooler, real
Shopify account/cart or production acceptance. An unexpected missing fixture or
role is a failure to investigate, not permission to use a hosted database.

Runner restrictions use the documented [GitHub Actions default variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).
