# Customer and cart repository CI

The `customer-cart-repositories` job exercises the real PostgreSQL boundaries for
the customer repository, bounded driver, anonymous staging cart, subject
broker and provisional admission repositories on a fresh GitHub-hosted Linux runner. It requires no project
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
is dispatched, and the fixture is again disabled and emptied. The enclosing owned
container and anonymous data volume are removed when the job exits. The separate
browser job covers the cart at six widths.

These results establish local synthetic database behavior against the tested
commit. They do not establish hosted migration, runtime credential, pooler, real
Shopify account/cart or production acceptance. An unexpected missing fixture or
role is a failure to investigate, not permission to use a hosted database.

Runner restrictions use the documented [GitHub Actions default variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables).
