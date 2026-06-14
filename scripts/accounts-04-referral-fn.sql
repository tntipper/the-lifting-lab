-- =====================================================================
-- The Lifting Lab — Accounts & Points (spec v1.4)
-- PHASE 2 addendum — referral award + profile-ensure functions.
-- Run AFTER accounts-02-functions.sql. Idempotent (CREATE OR REPLACE).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ensure_profile() — guarantees the caller has a profile row (covers the
-- rare case the on_auth_user_created trigger hasn't fired yet). No admin
-- key needed; runs SECURITY DEFINER as the caller's id.
-- ---------------------------------------------------------------------
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  insert into public.profiles (id, username, referral_code)
  values (
    v_user,
    'lifter_' || substr(v_user::text, 1, 8),
    upper(substr(md5(v_user::text || clock_timestamp()::text), 1, 8))
  )
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- ---------------------------------------------------------------------
-- claim_referral() — when the caller was referred (profiles.referred_by
-- set by the signup trigger), award the *referrer* their referral points
-- exactly once. Triggered by the referred user (e.g. on first dashboard
-- load). Returns points awarded to the referrer (0 if none / already done).
-- ---------------------------------------------------------------------
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

  -- Award once per referred user.
  if exists (
    select 1 from public.points_ledger
    where user_id = v_ref and action_type = 'referral' and ref_id = v_user::text
  ) then
    return 0;
  end if;

  v_season := public.current_season();

  insert into public.points_ledger (user_id, action_type, points, season_id, ref_id)
  values (v_ref, 'referral', v_cfg.points, v_season, v_user::text);

  update public.profiles
    set total_points = total_points + v_cfg.points
    where id = v_ref;

  return v_cfg.points;
end;
$$;

grant execute on function public.claim_referral() to authenticated;

-- =====================================================================
-- End addendum.
-- =====================================================================
