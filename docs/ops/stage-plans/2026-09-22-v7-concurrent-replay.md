# V7 concurrent observer replay while disabled

## Outcome and acceptance

Test whether successful staging-shaped port results become a different
receipt solely because the concurrent reads finish in a different order.
Use deterministic injected promises and the exact composition/core path.
Accept only the same projected HOLD receipt and one surface read for each
release order. A failure requires a cause, correction and repeated checks;
a pass narrows uncertainty but cannot identify v7's historical live input.

## Boundary and starting state

At `6f6f8c0` on `codex/tll-integration`, the v7 journal is terminal with
SHA-256 `d53760204f68ca4949af4be340f2dadaf4e3442abe24b91a6eb66e5f6c4d6084`.
The live launcher, Keychain gate and manifest approval are false. The
previous diagnostic received independent GO, but v7's exact failure stage
remains unknown. Preserve unrelated untracked files.

This unit has no hosted reads, credentials, database writes, Shopify writes,
customer messages, purchases or production changes. Do not create a v8
journal or arm the launcher. Only the composition test, generated hosted
manifest, this plan and handover may change. No application source should
change unless a deterministic counterexample first demonstrates a defect;
revise this plan before such a change.

## Work order and stop rules

Before mutation verify Git state, disabled gates, v7 journal hash and
manifest check. Add a test with deferred provider, two secret, project and
shared-surface reads. Release them in several contrasting orders after all
five are in flight; assert one surface read, disposal, the same HOLD receipt
hash, and no private payload. Use fixed synthetic data only. A hanging
read, mismatched receipt or generic failure stops the unit for diagnosis.

Regenerate the hosted manifest, run focused tests, the full disabled suite,
manifest and live-boundary checks. Obtain independent read-only review of
the exact test and result. Record what the test proves and does not prove,
then update the handover. Do not treat a passing offline replay as closure
of the incident-learning gate or as authority for another hosted run.

## Result and limitation

The five post-database reads were all in flight before release in each
case. Forward, reverse and surface-first release orders each returned the
same three-reason HOLD and observation hash, with exactly one shared
surface read and one disposal per binding. The focused composition suite
passed 10/10; the full disabled suite passed 2,257/2,257. The hosted and
activation manifests passed check mode, and the live-boundary check reported
zero violations. Independent read-only review returned GO; it verified all
23 hosted manifest pins, false native gates and the unchanged v7 journal.

This checks the composition/core observer against three deterministic
completion orders with synthetic staging-shaped inputs. It does not run the
session's separate receipt projector, cover every possible schedule, or
recover the live v7 responses. No direct technical cause for v7 was found,
so the incident-learning gate remains open and a successor observer remains
blocked.
