-- =====================================================================
-- The Lifting Lab — Accounts & Points system (spec v1.4)
-- PHASE 2 of 3 — Postgres functions (points engine, leaderboard, avatar
-- unlock, season snapshot). Run AFTER accounts-01-schema.sql.
--
-- All write functions are SECURITY DEFINER and key off auth.uid(), so the
-- app can call them with the anon/authenticated key without bypassing RLS
-- on the underlying tables. Idempotent: uses CREATE OR REPLACE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- current_season() — the season whose window contains now(), if any.
-- ---------------------------------------------------------------------
create or replace function public.current_season()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.seasons
  where now() >= starts_at and now() < ends_at
  order by starts_at desc
  limit 1;
$$;

grant execute on function public.current_season() to anon, authenticated;

-- ---------------------------------------------------------------------
-- award_points(action, ref_id) — the single entry point for earning.
-- Reads the rule from points_config, enforces the per-action limit /
-- cooldown / account-age guard, writes a ledger row tagged to the active
-- season, bumps profiles.total_points. Returns points actually awarded
-- (0 when capped, disabled, or unauthenticated). Safe to call repeatedly.
-- ---------------------------------------------------------------------
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

  -- Limit enforcement by rule type.
  if v_cfg.limit_type = 'once' then
    select exists (
      select 1 from public.points_ledger
      where user_id = v_user and action_type = p_action
    ) into v_exists;

  elsif v_cfg.limit_type = 'once_per_ref' then
    select exists (
      select 1 from public.points_ledger
      where user_id = v_user and action_type = p_action
        and ref_id is not distinct from p_ref_id
    ) into v_exists;

  elsif v_cfg.limit_type = 'per_ref_cooldown' then
    select exists (
      select 1 from public.points_ledger
      where user_id = v_user and action_type = p_action
        and ref_id is not distinct from p_ref_id
        and created_at > now() - make_interval(hours => greatest(v_cfg.cooldown_hours, 1))
    ) into v_exists;

  elsif v_cfg.limit_type = 'per_day' then
    select exists (
      select 1 from public.points_ledger
      where user_id = v_user and action_type = p_action
        and created_at::date = (now() at time zone 'utc')::date
    ) into v_exists;

  else
    v_exists := true; -- unknown rule => do not award
  end if;

  if v_exists then
    return 0;
  end if;

  v_season := public.current_season();

  insert into public.points_ledger (user_id, action_type, points, season_id, ref_id)
  values (v_user, p_action, v_cfg.points, v_season, p_ref_id);

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

grant execute on function public.award_points(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- unlock_avatar(avatar_id) — spend points to permanently unlock a
-- premium/seasonal avatar. Validates cost, balance, season window, and
-- prior ownership. Returns json {ok, error, spent, balance}.
-- ---------------------------------------------------------------------
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

  if exists (select 1 from public.avatar_unlocks where user_id = v_user and avatar_id = p_avatar_id) then
    return json_build_object('ok', false, 'error', 'already_owned');
  end if;

  select (total_points - points_spent) into v_balance from public.profiles where id = v_user;
  if v_balance is null or v_balance < v_item.points_cost then
    return json_build_object('ok', false, 'error', 'insufficient_points', 'balance', coalesce(v_balance,0));
  end if;

  insert into public.avatar_unlocks (user_id, avatar_id, points_spent)
  values (v_user, p_avatar_id, v_item.points_cost);

  update public.profiles
    set points_spent = points_spent + v_item.points_cost
    where id = v_user;

  return json_build_object('ok', true, 'spent', v_item.points_cost, 'balance', v_balance - v_item.points_cost);
end;
$$;

grant execute on function public.unlock_avatar(text) to authenticated;

-- ---------------------------------------------------------------------
-- get_leaderboard(season, limit) — ranked season standings, public.
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(p_season uuid, p_limit integer default 10)
returns table (
  rank          bigint,
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_type   text,
  avatar_id     text,
  avatar_url    text,
  season_points bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select l.user_id, sum(l.points)::bigint as pts
    from public.points_ledger l
    where p_season is not null and l.season_id = p_season
    group by l.user_id
    having sum(l.points) > 0
  )
  select
    rank() over (order by t.pts desc) as rank,
    t.user_id,
    p.username,
    p.display_name,
    p.avatar_type,
    p.avatar_id,
    p.avatar_url,
    t.pts as season_points
  from totals t
  join public.profiles p on p.id = t.user_id
  order by t.pts desc
  limit greatest(p_limit, 0);
$$;

grant execute on function public.get_leaderboard(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_user_rank(season, user) — a single user's rank + points for the
-- season (used to pin their row when outside the top 10).
-- ---------------------------------------------------------------------
create or replace function public.get_user_rank(p_season uuid, p_user uuid)
returns table (rank bigint, season_points bigint)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select l.user_id, sum(l.points)::bigint as pts
    from public.points_ledger l
    where p_season is not null and l.season_id = p_season
    group by l.user_id
    having sum(l.points) > 0
  ), ranked as (
    select user_id, pts, rank() over (order by pts desc) as rank from totals
  )
  select rank, pts as season_points from ranked where user_id = p_user;
$$;

grant execute on function public.get_user_rank(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- snapshot_season_results(season) — freeze final standings into
-- season_results and flag top-3 prize tiers. Run by admin/cron at season
-- end. Idempotent per (season,user). Returns rows written.
-- ---------------------------------------------------------------------
create or replace function public.snapshot_season_results(p_season uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.season_results (season_id, user_id, rank, season_points, prize_tier)
  select
    p_season,
    lb.user_id,
    lb.rank::int,
    lb.season_points::int,
    case when lb.rank <= 3 then lb.rank::int else null end
  from public.get_leaderboard(p_season, 1000000) lb
  on conflict (season_id, user_id)
  do update set rank = excluded.rank,
                season_points = excluded.season_points,
                prize_tier = excluded.prize_tier;

  get diagnostics v_count = row_count;

  update public.seasons set status = 'ended' where id = p_season;
  return v_count;
end;
$$;

-- (No grant: snapshot is an admin/cron action run with elevated key.)

-- =====================================================================
-- End PHASE 2. Next: accounts-03-seed.sql
-- =====================================================================
