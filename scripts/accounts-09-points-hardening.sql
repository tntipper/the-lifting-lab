-- =====================================================================
-- The Lifting Lab — Accounts & Points (spec v1.4)
-- PHASE 2 addendum — award_points() HARDENING. Run AFTER accounts-02.
-- Idempotent (CREATE OR REPLACE). Closes three review findings:
--
--   [P0] Self-award via direct RPC — award_points trusted caller-supplied
--        p_action/p_ref_id and inserted ledger rows even when the user had
--        not done the action. FIX: verify the owned row exists for
--        auth.uid() (review/favourite/build_stack), and block 'referral'
--        (only claim_referral() may award it).
--   [P1] Cooldown race (share, daily_login) — check-then-insert could let
--        concurrent calls both award. FIX: per-(user,action,ref) advisory
--        xact lock serialises duplicate calls within their transactions.
--   [P1] once_per_ref farmable with NULL ref — unique index treats NULLs as
--        distinct. FIX: reject NULL ref for once_per_ref (the only write
--        path is this function + claim_referral, both now non-null).
-- =====================================================================

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
  v_items   integer;
begin
  if v_user is null then
    return 0;
  end if;

  -- 'referral' is awarded ONLY by claim_referral() (to the referrer, once per
  -- referred user). Block it here so a user cannot self-award referral points.
  if p_action = 'referral' then
    return 0;
  end if;

  select * into v_cfg from public.points_config where action_type = p_action;
  if not found or not v_cfg.enabled then
    return 0;
  end if;

  -- Serialise concurrent identical calls (same user+action+ref) for the life
  -- of this transaction. Makes the cooldown/per_day check-then-insert below
  -- race-free without needing a unique index for those rule types.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_action || ':' || coalesce(p_ref_id, ''), 0)
  );

  -- once_per_ref needs a concrete ref; NULL refs would bypass the partial
  -- unique index (NULLs are distinct) and let the action be farmed.
  if v_cfg.limit_type = 'once_per_ref' and p_ref_id is null then
    return 0;
  end if;

  -- Anti-farm: actions that mirror a real owned row must have that row for the
  -- caller. Ref comparison is text-vs-cast to avoid errors on non-UUID input.
  if p_action = 'review' then
    if not exists (select 1 from public.reviews
                   where user_id = v_user and product_id::text = p_ref_id) then
      return 0;
    end if;
  elsif p_action = 'favourite' then
    if not exists (select 1 from public.user_favourites
                   where user_id = v_user and product_id::text = p_ref_id) then
      return 0;
    end if;
  elsif p_action = 'build_stack' then
    -- The stack must belong to the caller AND hold >= 3 products.
    if not exists (select 1 from public.user_stacks
                   where id::text = p_ref_id and user_id = v_user) then
      return 0;
    end if;
    select count(*) into v_items from public.stack_products where stack_id::text = p_ref_id;
    if coalesce(v_items, 0) < 3 then
      return 0;
    end if;
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

  -- Cooldown-based rules keep the exists-check (now race-free under the lock).
  -- once / once_per_ref are additionally enforced by partial unique indexes
  -- via the ON CONFLICT DO NOTHING insert below.
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

  if p_action = 'share' and p_ref_id is not null then
    insert into public.share_claims (user_id, product_id) values (v_user, p_ref_id);
  end if;

  return v_cfg.points;
end;
$$;

grant execute on function public.award_points(text, text) to authenticated;

-- =====================================================================
-- End hardening addendum.
-- =====================================================================
