# Hosted Generation 19 retirement remediation

Date: 2026-09-22

Status: **COMPLETE — PASS_RETIRED**. Evidence is recorded in
`docs/ops/evidence/2026-09-22-generation-19-retirement.md`.

Authority: the owner requested completion of the five documented staging gates, including the required remediation and no-purchase journey. This plan is limited to staging project `qdmvngjwkcsilzmqksme`; production project `wrhgscovsgsudtedbljr` is excluded.

## Trigger and diagnosis

The fresh secret-free hosted baseline contradicted the prior handover:

- migrations 002-016 are present;
- all five customer/cart/broker/provisional/bridge controls are enabled;
- all five restricted runtime identities have LOGIN, a password and future expiry;
- all five have zero active sessions;
- the Generation 19 window is recorded as consumed and non-replayable.

The first repository-pinned preflight failed closed before mutation. A narrower
aggregate diagnosis then proved all five markers share the expired timestamp
`2026-09-21 11:08:34+00`, while all five PostgreSQL roles have
`VALID UNTIL infinity`, LOGIN and a configured password. The retirement gate is
therefore pinned to this exact drift shape and exact canonical expiry
`2026-09-21T11:08:34.000Z`; it must reject any other marker expiry,
finite/different role expiry, missing password, missing LOGIN or mixed state.

This is a drifted post-window state. It must be retired before any account, cart or orders journey. Generation 19 must not be replayed and Generation 20 must not be created.

## Surface freeze completed before database work

The four Vercel enable-last values for the `codex/tll-integration` Preview branch were returned to:

- `TLL_STAGING_CUSTOMER_ENABLED=false`
- `TLL_STAGING_CART_ENABLED=false`
- `NEXT_PUBLIC_TLL_STAGING_CUSTOMER=disabled`
- `NEXT_PUBLIC_TLL_STAGING_CART=disabled`

Disabled immutable Preview:

- deployment: `dpl_HZpi1F8yLcgYVvaUxAJyt7qPdBs6`
- immutable URL: `https://the-lifting-tvyw2abny-my-lifting-lab-s-projects.vercel.app`
- stable alias: `https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app`
- source: `ab3eda9f57acbf38ab3fd5eac3d263258b278fda`
- activation-manifest SHA-256: `201f47c9bbbf0b8b65cdaabc33e26c61d1fea1724dd52dd948205391c705b048`

The stable alias resolves to this deployment and `/auth` shows the ordinary signed-out form, proving the staging Customer Account public entry is held.

## Required read-only preflight

Use only the checked-in generated artifact
`config/staging-generation-19-retirement-preflight.sql`. Its generator and
validator are `scripts/staging-generation-19-retirement-preflight.mjs`; its
focused contract is `tests/staging-generation-19-retirement-preflight.test.mjs`.
The artifact is read-only, has no caller-controlled project/query surface and
returns aggregate state counts only.

Proceed only when that bounded query returns `PASS_EXACT_ACTIVE_DRIFT` with
`credentialDrift=MARKER_EXPIRED_ROLE_UNBOUNDED` and proves all
of the following without returning credential or customer material:

1. exact staging project binding and migrations 002-016;
2. exactly five runtime roles;
3. every role marker is the exact active Generation 19 marker:
   - project `qdmvngjwkcsilzmqksme`
   - generation `19`
   - window `51809dd4-bd4b-44c7-8609-7dd8ca063679`
   - state `active`
   - one consistent expired `expiresAt`;
   - every role remains LOGIN/password-configured with `VALID UNTIL infinity`;
4. exactly five expected executor/gateway-to-runtime memberships and five
   reviewed runtime-role-to-operator ADMIN-only management edges, with no other
   edge touching a runtime role; executor/gateway edges are exactly
   `ADMIN FALSE / INHERIT TRUE / SET FALSE`, granted by `postgres`;
5. zero active sessions for the runtime roles;
6. current five control states and private-work counts by state.

Any mixed/missing marker, unexpected grant, live session, or wrong binding is a hard stop. Do not weaken the recovery assertions.

The first dashboard inventory described the five required ADMIN-only operator
edges as unexpected `runtime -> postgres` edges. That label reflected the
`pg_auth_members` direction, not an extra privilege: the runtime role is the
granted role and `postgres` is its ADMIN-only member. The checked-in preflight
requires those five edges and separately rejects any extra edge in which a
runtime identity is the member.

## Bounded retirement action

After independent review and exact-active preflight PASS, execute once:

1. `config/staging-generation-19-recovery.sql`
2. in a fresh SQL session, `config/staging-generation-19-recovery-postcommit.sql`

The generated transaction is pinned to the exact project/generation/window. It:

- disables all five controls;
- holds or cancels unfinished executable private work while retaining diagnostic rows;
- advances fences/generations as defined by the recovery;
- changes the five runtime roles to `NOLOGIN PASSWORD NULL`;
- revokes runtime executor/gateway memberships;
- changes exact active Gen 19 markers to exact retired markers;
- restores the operator management graph before commit.

The recovery and fresh-session proof explicitly verify `rolpassword IS NULL`,
the five inert ADMIN-only runtime-to-operator management edges, absence of every
executor/gateway membership, exact retired markers and zero sessions. The
first bounded attempt's combined assertion produced a misleading missing-edge
message because its password-null check used the redacted `pg_roles` view. A
second correction wrongly required zero management edges and also rolled back.
The final proof separates these conditions: it checks `rolcanlogin` in
`pg_roles`, password presence only in authoritative `pg_authid`, requires the
five ADMIN-only management edges, and rejects every other runtime membership.
The post-commit
artifact returns the fixed aggregate receipt
`tll-staging-generation-19-retirement-postcommit/v1`. It must not terminate
sessions or add privileges.

## Failure and uncertainty

- Main transaction failure means rollback: keep Vercel flags held, retain the sanitized receipt and do not retry altered SQL.
- Commit acknowledged but post-commit uncertainty: keep flags held and repeat only the unchanged read-only post-commit proof after natural session drain.
- Any marker/grant mismatch: stop and prepare a new independently reviewed drift plan.
- No purchase, checkout, customer email merge, production access, Gen 19 replay or Gen 20 creation.

## After successful retirement

Record the sanitized post-commit receipt. Provider cleanup may remove only exact Gen 19 generated runtime secret names using the repository cleanup contract; long-lived Shopify client, Storefront token, CA and project configuration are excluded.

Retirement does not authorize account activation. A fresh successor requires a new boundary review, new independently reviewed credential window, disabled-first deployment, current Shopify proof, and public flags enabled last. Only then may the single owned-email no-purchase browser journey run.
