-- ============================================================================
-- The Lifting Lab — Accounts / Points / Leaderboard / Avatars / Reviews
-- Phase 1 schema. Run FIRST, then p1-accounts-seed.sql.
-- Run in the Supabase SQL Editor (service-role context).
-- Idempotent where practical (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- gen_random_bytes (referral codes) lives in pgcrypto.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles  (1 row per auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique,
  display_name  text,
  avatar_type   text not null default 'standard'
                  check (avatar_type in ('standard','premium','custom_photo')),
  avatar_id     text default 'barbell',
  avatar_url    text,
  total_points  integer not null default 0,
  points_spent  integer not null default 0,
  referral_code text unique default encode(gen_random_bytes(6), 'hex'),
  referred_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Public read: leaderboard + reviews show username/avatar/points.
-- (No sensitive PII here; referral_code is low-risk but see note in build report.)
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Insert handled by the security-definer trigger below; allow self-insert too.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- points_config  (admin-configurable award values; one row per action)
-- ---------------------------------------------------------------------------
create table if not exists public.points_config (
  action_type text primary key,
  points      integer not null,
  limit_type  text not null,            -- once | once_per_ref | per_ref_per_24h | once_per_day | per_ref
  label       text,
  updated_at  timestamptz not null default now()
);

alter table public.points_config enable row level security;
drop policy if exists "points_config_select_public" on public.points_config;
create policy "points_config_select_public" on public.points_config
  for select using (true);

-- ---------------------------------------------------------------------------
-- seasons
-- ---------------------------------------------------------------------------
create table if not exists public.seasons (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            text not null default 'upcoming'
                      check (status in ('upcoming','active','ended')),
  prize_description text default 'To Be Announced',
  avatar_skin_ids   text[] not null default '{}',
  created_at        timestamptz not null default now()
);

alter table public.seasons enable row level security;
drop policy if exists "seasons_select_public" on public.seasons;
create policy "seasons_select_public" on public.seasons
  for select using (true);

create index if not exists seasons_window_idx on public.seasons (starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- points_ledger  (authoritative; NOT user-writable — service role only)
-- dedupe_key enforces all per-action limits via a single unique index.
-- ---------------------------------------------------------------------------
create table if not exists public.points_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  action_type text not null,
  points      integer not null,
  season_id   uuid references public.seasons (id) on delete set null,
  ref_id      text,
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

alter table public.points_ledger enable row level security;
-- Users may read their own ledger. No insert/update policy => only the
-- service role (and SECURITY DEFINER functions) can write rows.
drop policy if exists "ledger_select_own" on public.points_ledger;
create policy "ledger_select_own" on public.points_ledger
  for select using (auth.uid() = user_id);

create index if not exists ledger_user_idx   on public.points_ledger (user_id);
create index if not exists ledger_season_idx on public.points_ledger (season_id);

-- ---------------------------------------------------------------------------
-- season_results  (final standings snapshot)
-- ---------------------------------------------------------------------------
create table if not exists public.season_results (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.seasons (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  rank          integer not null,
  season_points integer not null,
  prize_tier    integer,                 -- 1,2,3 or null
  created_at    timestamptz not null default now(),
  unique (season_id, user_id)
);

alter table public.season_results enable row level security;
drop policy if exists "season_results_select_public" on public.season_results;
create policy "season_results_select_public" on public.season_results
  for select using (true);

create index if not exists season_results_season_idx on public.season_results (season_id, rank);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  body       text check (char_length(body) <= 280),
  status     text not null default 'pending'
               check (status in ('pending','approved','flagged')),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.reviews enable row level security;
-- Public read of non-flagged reviews (auto-approve-after-24h handled in query).
drop policy if exists "reviews_select_public" on public.reviews;
create policy "reviews_select_public" on public.reviews
  for select using (status <> 'flagged');

drop policy if exists "reviews_insert_own" on public.reviews;
create policy "reviews_insert_own" on public.reviews
  for insert with check (auth.uid() = user_id);

drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_update_own" on public.reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews
  for delete using (auth.uid() = user_id);

create index if not exists reviews_product_idx on public.reviews (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- share_claims  (honour-system share cooldown ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.share_claims (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.share_claims enable row level security;
drop policy if exists "share_claims_select_own" on public.share_claims;
create policy "share_claims_select_own" on public.share_claims
  for select using (auth.uid() = user_id);
drop policy if exists "share_claims_insert_own" on public.share_claims;
create policy "share_claims_insert_own" on public.share_claims
  for insert with check (auth.uid() = user_id);

create index if not exists share_claims_user_product_idx
  on public.share_claims (user_id, product_id, claimed_at desc);

-- ---------------------------------------------------------------------------
-- avatar_catalog
-- ---------------------------------------------------------------------------
create table if not exists public.avatar_catalog (
  id          text primary key,                -- slug, e.g. 'gold-barbell'
  name        text not null,
  type        text not null check (type in ('standard','premium','seasonal')),
  season_id   uuid references public.seasons (id) on delete set null,
  points_cost integer not null default 0,
  asset_url   text,                            -- null => rendered as themed SVG by id
  active      boolean not null default true,
  sort_order  integer not null default 0
);

alter table public.avatar_catalog enable row level security;
drop policy if exists "avatar_catalog_select_public" on public.avatar_catalog;
create policy "avatar_catalog_select_public" on public.avatar_catalog
  for select using (true);

-- ---------------------------------------------------------------------------
-- avatar_unlocks
-- ---------------------------------------------------------------------------
create table if not exists public.avatar_unlocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  avatar_id    text not null references public.avatar_catalog (id) on delete cascade,
  points_spent integer not null default 0,
  unlocked_at  timestamptz not null default now(),
  unique (user_id, avatar_id)
);

alter table public.avatar_unlocks enable row level security;
drop policy if exists "avatar_unlocks_select_own" on public.avatar_unlocks;
create policy "avatar_unlocks_select_own" on public.avatar_unlocks
  for select using (auth.uid() = user_id);
-- Inserts go through unlock_avatar() (SECURITY DEFINER). No direct insert policy.

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Create a profile row + default username when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, referred_by)
  values (
    new.id,
    'lifter_' || substr(replace(new.id::text, '-', ''), 1, 8),
    nullif(new.raw_user_meta_data ->> 'referred_by', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Return the currently active season by date window (robust to status drift).
create or replace function public.current_season()
returns public.seasons
language sql
stable
as $$
  select * from public.seasons
  where now() >= starts_at and now() <= ends_at
  order by starts_at desc
  limit 1;
$$;

-- Award points. Authoritative + idempotent. Service-role only.
-- Returns points actually awarded (0 if duplicate / no config / no active season).
create or replace function public.award_points(
  p_user   uuid,
  p_action text,
  p_ref    text,
  p_dedupe text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points  integer;
  v_season  uuid;
  v_awarded integer := 0;
begin
  select points into v_points from public.points_config where action_type = p_action;
  if v_points is null then
    return 0;
  end if;

  select id into v_season from public.current_season();

  insert into public.points_ledger (user_id, action_type, points, season_id, ref_id, dedupe_key)
  values (p_user, p_action, v_points, v_season, p_ref, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;

  if found then
    update public.profiles set total_points = total_points + v_points where id = p_user;
    v_awarded := v_points;
  end if;

  return v_awarded;
end;
$$;

revoke all on function public.award_points(uuid, text, text, text) from public, anon, authenticated;

-- Unlock an avatar by spending points. Callable by the owning user.
-- Validates balance, seasonal availability, and prevents double-spend.
-- Returns 'ok' | 'already' | 'insufficient' | 'unavailable' | 'not_found'.
create or replace function public.unlock_avatar(p_avatar_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_cost      integer;
  v_type      text;
  v_active    boolean;
  v_season    uuid;
  v_available integer;
begin
  if v_user is null then
    return 'not_found';
  end if;

  select points_cost, type, active, season_id
    into v_cost, v_type, v_active, v_season
    from public.avatar_catalog where id = p_avatar_id;

  if v_cost is null then
    return 'not_found';
  end if;

  if exists (select 1 from public.avatar_unlocks where user_id = v_user and avatar_id = p_avatar_id) then
    return 'already';
  end if;

  -- Standard avatars are free + always available; no unlock row needed, but allow.
  if v_type = 'seasonal' then
    -- only purchasable while its season is active
    if not v_active or v_season is null
       or v_season <> coalesce((select id from public.current_season()), '00000000-0000-0000-0000-000000000000'::uuid)
    then
      return 'unavailable';
    end if;
  end if;

  select total_points - points_spent into v_available from public.profiles where id = v_user;
  if v_available is null or v_available < v_cost then
    return 'insufficient';
  end if;

  insert into public.avatar_unlocks (user_id, avatar_id, points_spent)
  values (v_user, p_avatar_id, v_cost)
  on conflict (user_id, avatar_id) do nothing;

  update public.profiles set points_spent = points_spent + v_cost where id = v_user;
  return 'ok';
end;
$$;

grant execute on function public.unlock_avatar(text) to authenticated;

-- Refresh season status flags from the clock. Safe to run anytime / on a cron.
create or replace function public.refresh_season_status()
returns void
language sql
as $$
  update public.seasons set status =
    case
      when now() < starts_at then 'upcoming'
      when now() > ends_at   then 'ended'
      else 'active'
    end;
$$;

-- Snapshot final standings for an ended season into season_results.
create or replace function public.snapshot_season(p_season uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.season_results (season_id, user_id, rank, season_points, prize_tier)
  select p_season, user_id, rank, season_points,
         case when rank <= 3 then rank else null end
  from (
    select user_id,
           sum(points) as season_points,
           rank() over (order by sum(points) desc) as rank
    from public.points_ledger
    where season_id = p_season
    group by user_id
  ) ranked
  on conflict (season_id, user_id) do update
    set rank = excluded.rank,
        season_points = excluded.season_points,
        prize_tier = excluded.prize_tier;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.snapshot_season(uuid) from public, anon, authenticated;
