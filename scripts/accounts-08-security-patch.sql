-- =====================================================================
-- The Lifting Lab — Accounts & Points — SECURITY PATCH (code-review ultra)
-- Fixes four findings on an ALREADY-SEEDED prod DB. Additive + idempotent:
-- safe to run on top of accounts-01..07 and safe to re-run.
--
--   [P0-1] profiles email/private-column harvest via `using (true)` RLS
--   [P0-2] snapshot_season_results EXECUTE-able by PUBLIC
--   [P1-1] award_points / claim_referral double-award race
--   [P1-2] unlock_avatar overspend race
--
-- Run this ENTIRE file once in the Supabase SQL editor. No data is dropped.
-- =====================================================================

begin;

-- =====================================================================
-- [P0-1] Lock down public.profiles so anon/other users cannot read
--        private columns (email, newsletter_opt_in, referral_code, …).
--
-- Approach (lower-risk, RLS-enforced — NOT a column drop):
--   * Replace the `using (true)` public-read policy with an OWNER-ONLY
--     policy. RLS is row-level, so once the only SELECT policy is
--     `auth.uid() = id`, anon (no uid) reads zero rows and an
--     authenticated user can read ONLY their own row — every column,
--     including referral_code, stays available to the owner.
--   * All cross-user reads already go through SECURITY DEFINER RPCs
--     (get_leaderboard, get_user_rank, get_product_reviews), which are
--     unaffected by this policy. The one client path that read other
--     rows (dashboard referral count) is moved to get_referral_count()
--     below.
--   * A safe public view (public.public_profiles) is also provided for
--     any future client code that needs public profile fields.
-- =====================================================================

-- Owner-only direct read. Drops the leaky `using (true)` policy.
drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_select_own"    on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Keep the existing own-row update policy (no change; re-asserted for safety).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Safe public surface: ONLY non-sensitive columns. Excludes email,
-- newsletter_opt_in, referral_code, referred_by. Owned by the migration
-- role (postgres) so it bypasses the owner-only RLS above and can serve
-- public profile fields to anon/authenticated WITHOUT exposing private
-- columns. (Intentionally a definer-rights view — that is the point.)
create or replace view public.public_profiles as
  select
    id,
    username,
    display_name,
    avatar_type,
    avatar_id,
    avatar_url,
    total_points,
    points_spent,
    created_at
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- Referral count without exposing other users' rows (replaces the old
-- client `select id from profiles where referred_by = me`).
create or replace function public.get_referral_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.profiles where referred_by = auth.uid();
$$;

revoke execute on function public.get_referral_count() from public;
grant  execute on function public.get_referral_count() to authenticated;

-- =====================================================================
-- [P0-2] snapshot_season_results must NOT be callable by PUBLIC.
--        Postgres grants EXECUTE to PUBLIC by default; revoke it. The
--        snapshot is an admin/cron action run with the service key.
-- =====================================================================
revoke execute on function public.snapshot_season_results(uuid) from public, anon, authenticated;
-- (Optional) allow the service role explicitly; service_role already
-- bypasses, but this documents intent:
grant execute on function public.snapshot_season_results(uuid) to service_role;

-- =====================================================================
-- [P1-1] Atomic once / once_per_ref / referral awards.
--        DB-enforced uniqueness turns a concurrent duplicate into a
--        no-op; the function only adds points when a ledger row was
--        actually inserted. Cooldown rules (per_day, per_ref_cooldown)
--        keep their exists-check (not unique by nature).
--
-- NOTE: if these CREATE UNIQUE INDEX statements ERROR with a duplicate
-- key, pre-existing double-award rows exist — run the OPTIONAL dedupe
-- block at the bottom of this file first, then re-run this file.
-- =====================================================================

-- 'once' rule  -> signup (one row per user, ref_id is null)
create unique index if not exists points_ledger_once_uniq
  on public.points_ledger (user_id, action_type)
  where action_type in ('signup');

-- 'once_per_ref' + 'referral' -> one row per (user, action, ref_id)
create unique index if not exists points_ledger_once_per_ref_uniq
  on public.points_ledger (user_id, action_type, ref_id)
  where action_type in ('review', 'favourite', 'build_stack', 'referral');

create or replace function public.award_points(p_action text, p_ref_id text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_cfg     public.points_config%rowtype;
  v_season  uuid;
  v_exists  boolean;
  v_age_ok  boolean;
  v_rows    integer;
begin
  if v_user is null then
    return 0;
  end if;

  select * into v_cfg from public.points_config where action_type = p_action;
  if not found or not v_cfg.enabled then
    return 0;
  end if;

  -- Account-age guard (e.g. share requires account >= 24h old).
  if v_cfg.min_account_age_hours > 0 then
    select (now() - u.created_at) >= make_interval(hours => v_cfg.min_account_age_hours)
      into v_age_ok
      from auth.users u where u.id = v_user;
    if not coalesce(v_age_ok, false) then
      return 0;
    end if;
  end if;

  -- Cooldown-based rules keep the exists-check (no DB uniqueness possible).
  if v_cfg.limit_type = 'per_ref_cooldown' then
    select exists (
      select 1 from public.points_ledger
      where user_id = v_user and action_type = p_action
        and ref_id is not distinct from p_ref_id
        and created_at > now() - make_interval(hours => greatest(v_cfg.cooldown_hours, 1))
    ) into v_exists;
    if v_exists then return 0; end if;

  elsif v_cfg.limit_type = 'per_day' then
    select exists (
      select 1 from public.points_ledger
      where user_id = v_user and action_type = p_action
        and created_at::date = (now() at time zone 'utc')::date
    ) into v_exists;
    if v_exists then return 0; end if;

  elsif v_cfg.limit_type not in ('once', 'once_per_ref') then
    return 0; -- unknown rule => do not award
  end if;

  v_season := public.current_season();

  -- Atomic write. For 'once' / 'once_per_ref' the partial unique indexes
  -- make a concurrent duplicate a no-op; we award only if a row landed.
  insert into public.points_ledger (user_id, action_type, points, season_id, ref_id)
  values (v_user, p_action, v_cfg.points, v_season, p_ref_id)
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 0; -- duplicate blocked by unique index
  end if;

  update public.profiles
    set total_points = total_points + v_cfg.points
    where id = v_user;

  -- Honour-system share also records a share_claim for auditing/cooldown clarity.
  if p_action = 'share' and p_ref_id is not null then
    insert into public.share_claims (user_id, product_id) values (v_user, p_ref_id);
  end if;

  return v_cfg.points;
end;
$$;

revoke execute on function public.award_points(text, text) from public;
grant  execute on function public.award_points(text, text) to authenticated;

create or replace function public.claim_referral()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_ref    uuid;
  v_cfg    public.points_config%rowtype;
  v_season uuid;
  v_rows   integer;
begin
  if v_user is null then
    return 0;
  end if;

  select referred_by into v_ref from public.profiles where id = v_user;
  if v_ref is null or v_ref = v_user then
    return 0;
  end if;

  select * into v_cfg from public.points_config where action_type = 'referral';
  if not found or not v_cfg.enabled then
    return 0;
  end if;

  v_season := public.current_season();

  -- Atomic: the points_ledger_once_per_ref_uniq index guarantees the
  -- referrer is credited for this referred user exactly once even under
  -- concurrent calls. Award only if the row was actually inserted.
  insert into public.points_ledger (user_id, action_type, points, season_id, ref_id)
  values (v_ref, 'referral', v_cfg.points, v_season, v_user::text)
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 0;
  end if;

  update public.profiles
    set total_points = total_points + v_cfg.points
    where id = v_ref;

  return v_cfg.points;
end;
$$;

revoke execute on function public.claim_referral() from public;
grant  execute on function public.claim_referral() to authenticated;

-- =====================================================================
-- [P1-2] unlock_avatar — lock the profile row before the balance check
--        so concurrent unlocks cannot overspend. Same JSON return shape.
-- =====================================================================
create or replace function public.unlock_avatar(p_avatar_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_item    public.avatar_catalog%rowtype;
  v_balance integer;
begin
  if v_user is null then
    return json_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select * into v_item from public.avatar_catalog where id = p_avatar_id;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_item.type = 'standard' then
    return json_build_object('ok', false, 'error', 'standard_is_free');
  end if;
  if not v_item.active then
    return json_build_object('ok', false, 'error', 'inactive');
  end if;

  -- Seasonal skins can only be unlocked while their season is the active one.
  if v_item.type = 'seasonal' then
    if v_item.season_id is null or v_item.season_id <> public.current_season() then
      return json_build_object('ok', false, 'error', 'season_closed');
    end if;
  end if;

  -- Lock this user's profile row: serialises concurrent unlock attempts so
  -- the balance check + spend below is atomic (prevents overspend race).
  select (total_points - points_spent) into v_balance
    from public.profiles where id = v_user
    for update;

  if exists (select 1 from public.avatar_unlocks where user_id = v_user and avatar_id = p_avatar_id) then
    return json_build_object('ok', false, 'error', 'already_owned');
  end if;

  if v_balance is null or v_balance < v_item.points_cost then
    return json_build_object('ok', false, 'error', 'insufficient_points', 'balance', coalesce(v_balance,0));
  end if;

  insert into public.avatar_unlocks (user_id, avatar_id, points_spent)
  values (v_user, p_avatar_id, v_item.points_cost)
  on conflict (user_id, avatar_id) do nothing;

  update public.profiles
    set points_spent = points_spent + v_item.points_cost
    where id = v_user;

  return json_build_object('ok', true, 'spent', v_item.points_cost, 'balance', v_balance - v_item.points_cost);
end;
$$;

revoke execute on function public.unlock_avatar(text) from public;
grant  execute on function public.unlock_avatar(text) to authenticated;

commit;

-- =====================================================================
-- OPTIONAL one-time dedupe — ONLY run if the CREATE UNIQUE INDEX above
-- errored on duplicate keys (pre-existing double awards). It keeps the
-- earliest ledger row per dedupe key, deletes the rest, then recomputes
-- profiles.total_points from the surviving ledger. Review before running.
-- =====================================================================
-- begin;
-- -- de-dupe 'once' (signup)
-- delete from public.points_ledger l using public.points_ledger keep
-- where l.action_type in ('signup')
--   and keep.user_id = l.user_id and keep.action_type = l.action_type
--   and keep.created_at < l.created_at;
-- -- de-dupe once_per_ref + referral
-- delete from public.points_ledger l using public.points_ledger keep
-- where l.action_type in ('review','favourite','build_stack','referral')
--   and keep.user_id = l.user_id and keep.action_type = l.action_type
--   and keep.ref_id is not distinct from l.ref_id
--   and keep.created_at < l.created_at;
-- -- recompute totals from the surviving ledger
-- update public.profiles p set total_points = coalesce((
--   select sum(points) from public.points_ledger where user_id = p.id), 0);
-- commit;
-- =====================================================================
-- End security patch. Then re-run the two CREATE UNIQUE INDEX statements.
-- =====================================================================
