# The Lifting Lab — Path B Launch Action List

Status as of 2026-06-14: all 7 build phases complete, `npm run build` GREEN, committed **locally only** (not pushed/deployed). Spec v1.4 (accounts + points + leaderboard + avatars + reviews + share) is feature-complete in code.

## What's built
- **P1** Accounts/points DB schema, RLS, profile auto-create trigger
- **P2** Points engine (SECURITY DEFINER, keyed off `auth.uid()` — no service-role key in app code) + trigger wiring + referral fn
- **P3** Product reviews (star + 280-char) with points award
- **P4** Seasonal leaderboard (`/leaderboard`)
- **P5** Avatar store (catalog, unlock, select, custom photo upload)
- **P6** Dashboard rebuild, account settings, rewards shell
- **P7** Share modal + `/api/share` claim (honour-system, 25 pts, DB-enforced 24h cooldown), wired into product page

## TOBY ACTION LIST (do these to go live)

### 1. Run SQL in Supabase SQL editor — IN THIS ORDER
1. `scripts/accounts-01-schema.sql` — tables, RLS, indexes, profile trigger
2. `scripts/accounts-02-functions.sql` — points engine, leaderboard, avatar fns
3. `scripts/accounts-03-seed.sql` — points_config rules, 2026 seasons, avatar catalog
4. `scripts/accounts-04-referral-fn.sql` — referral + profile-ensure fns
5. `scripts/accounts-05-reviews-fn.sql` — reviews read fn
6. `scripts/accounts-06-storage.sql` — avatar storage bucket + policies
7. `scripts/accounts-07-account-fn.sql` — self-service account deletion
8. `scripts/accounts-08-security-patch.sql` — **REQUIRED** profile-privacy / season-snapshot hardening
9. `scripts/accounts-09-points-hardening.sql` — **REQUIRED** anti-farming `award_points` rebuild (blocks direct-RPC self-award, NULL-ref farming, cooldown races). **Must run — `accounts-02` alone leaves the points engine exploitable.**

### 2. Supabase dashboard settings
- Enable **Email** auth provider (Authentication → Providers) if not already on
- Confirm the avatar **Storage bucket** from script 06 exists and is public-read
- Set the site URL / redirect URLs for the auth callback (production domain)

### 3. Deploy
- Code is committed locally only. Push to trigger Vercel deploy when ready: `git push`
- After deploy, smoke-test: sign up (should award 100 pts), favourite a product (10), build a stack (50), leave a review (75), share+claim (25), check `/leaderboard` and `/dashboard`.

### Guardrails honoured during build
- No SQL run against prod DB
- No push/deploy
- No secrets touched, no paused crons re-enabled
