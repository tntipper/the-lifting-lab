-- =====================================================================
-- The Lifting Lab — Accounts & Points system (spec v1.4)
-- PHASE 1 of 3 — Schema, RLS, indexes, profile auto-create trigger.
-- Run this FIRST in the Supabase SQL editor, then accounts-02-functions.sql,
-- then accounts-03-seed.sql.
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS / DROP POLICY IF EXISTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles  (1 row per auth.users; all-time points live here)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_type   text not null default 'standard'
                  check (avatar_type in ('standard','premium','seasonal','custom_photo')),
  avatar_id     text not null default 'barbell',
  avatar_url    text,
  total_points  integer not null default 0,
  points_spent  integer not null default 0,
  referral_code text unique not null,
  referred_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone may read public profile fields (needed for leaderboard / reviews avatars).
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select using (true);

-- A user may update only their own profile row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 2. seasons  (12-week competitive windows; admin-managed)
-- ---------------------------------------------------------------------
create table if not exists public.seasons (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            text not null default 'upcoming'
                      check (status in ('upcoming','active','ended')),
  prize_description text not null default 'To be announced',
  avatar_skin_ids   text[] not null default '{}',
  created_at        timestamptz not null default now()
);

alter table public.seasons enable row level security;

drop policy if exists "seasons_select_public" on public.seasons;
create policy "seasons_select_public" on public.seasons
  for select using (true);

create index if not exists seasons_window_idx on public.seasons (starts_at, ends_at);

-- ---------------------------------------------------------------------
-- 3. points_config  (admin-configurable earn rules; data-driven engine)
-- ---------------------------------------------------------------------
create table if not exists public.points_config (
  action_type           text primary key,
  points                integer not null,
  limit_type            text not null
                          check (limit_type in ('once','once_per_ref','per_ref_cooldown','per_day')),
  cooldown_hours        integer not null default 0,
  min_account_age_hours integer not null default 0,
  enabled               boolean not null default true,
  description           text
);

alter table public.points_config enable row level security;

drop policy if exists "points_config_select_public" on public.points_config;
create policy "points_config_select_public" on public.points_config
  for select using (true);

-- ---------------------------------------------------------------------
-- 4. points_ledger  (immutable append log; season-tagged)
-- ---------------------------------------------------------------------
create table if not exists public.points_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  action_type text not null,
  points      integer not null,
  season_id   uuid references public.seasons (id) on delete set null,
  ref_id      text,
  created_at  timestamptz not null default now()
);

alter table public.points_ledger enable row level security;

-- A user can read their own ledger. (Leaderboard aggregates run via a
-- SECURITY DEFINER function, so cross-user reads are not exposed here.)
drop policy if exists "ledger_select_own" on public.points_ledger;
create policy "ledger_select_own" on public.points_ledger
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: writes happen only through the
-- award_points() SECURITY DEFINER function.

create index if not exists ledger_user_idx        on public.points_ledger (user_id);
create index if not exists ledger_season_idx      on public.points_ledger (season_id);
create index if not exists ledger_user_action_idx on public.points_ledger (user_id, action_type);

-- ---------------------------------------------------------------------
-- 5. season_results  (final standings snapshot per season)
-- ---------------------------------------------------------------------
create table if not exists public.season_results (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.seasons (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  rank          integer not null,
  season_points integer not null,
  prize_tier    integer,
  created_at    timestamptz not null default now(),
  unique (season_id, user_id)
);

alter table public.season_results enable row level security;

drop policy if exists "season_results_select_public" on public.season_results;
create policy "season_results_select_public" on public.season_results
  for select using (true);

create index if not exists season_results_season_idx on public.season_results (season_id, rank);

-- ---------------------------------------------------------------------
-- 6. reviews  (1-5 stars + 280-char body; one per product per user)
-- ---------------------------------------------------------------------
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

-- Public can read reviews that are approved, or pending+past-24h (auto-approve
-- is enforced in the read path / a cron flip; we expose own rows always).
drop policy if exists "reviews_select_public" on public.reviews;
create policy "reviews_select_public" on public.reviews
  for select using (
    status = 'approved'
    or (status = 'pending' and created_at < now() - interval '24 hours')
    or auth.uid() = user_id
  );

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
create index if not exists reviews_user_idx    on public.reviews (user_id);

-- ---------------------------------------------------------------------
-- 7. share_claims  (honour-system share log; 24h cooldown per product)
-- ---------------------------------------------------------------------
create table if not exists public.share_claims (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  claimed_at timestamptz not null default now()
);

alter table public.share_claims enable row level security;

drop policy if exists "share_claims_select_own" on public.share_claims;
create policy "share_claims_select_own" on public.share_claims
  for select using (auth.uid() = user_id);
-- Inserts happen via award_points() (SECURITY DEFINER); no direct insert policy.

create index if not exists share_claims_user_idx on public.share_claims (user_id, product_id, claimed_at desc);

-- ---------------------------------------------------------------------
-- 8. avatar_catalog  (standard / premium / seasonal avatar definitions)
-- ---------------------------------------------------------------------
create table if not exists public.avatar_catalog (
  id          text primary key,                  -- slug, e.g. season-1-gold-warrior
  name        text not null,
  type        text not null check (type in ('standard','premium','seasonal')),
  season_id   uuid references public.seasons (id) on delete set null,
  points_cost integer not null default 0,
  asset_url   text,                              -- null => rendered by slug (inline SVG)
  active      boolean not null default true,
  sort_order  integer not null default 0
);

alter table public.avatar_catalog enable row level security;

drop policy if exists "avatar_catalog_select_public" on public.avatar_catalog;
create policy "avatar_catalog_select_public" on public.avatar_catalog
  for select using (true);

-- ---------------------------------------------------------------------
-- 9. avatar_unlocks  (which premium/seasonal avatars a user owns)
-- ---------------------------------------------------------------------
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
-- Inserts happen via unlock_avatar() (SECURITY DEFINER); no direct insert policy.

create index if not exists avatar_unlocks_user_idx on public.avatar_unlocks (user_id);

-- ---------------------------------------------------------------------
-- 10. Profile auto-create trigger on new auth user.
--     Generates a unique username + referral code, and records referrer
--     when raw_user_meta_data.referred_by (a referral_code) is present.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_code     text;
  v_referrer uuid;
  v_ref_code text;
begin
  -- Base username from email local-part, fall back to a short id; ensure unique.
  v_username := lower(regexp_replace(split_part(coalesce(new.email,''), '@', 1), '[^a-z0-9_]', '', 'g'));
  if v_username is null or length(v_username) < 3 then
    v_username := 'lifter_' || substr(new.id::text, 1, 8);
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := v_username || '_' || substr(new.id::text, 1, 4);
  end if;

  v_code := upper(substr(md5(new.id::text || clock_timestamp()::text), 1, 8));

  -- Resolve referrer from a referral_code passed in signup metadata.
  v_ref_code := nullif(new.raw_user_meta_data ->> 'referred_by', '');
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = upper(v_ref_code) limit 1;
  end if;

  insert into public.profiles (id, username, referral_code, referred_by)
  values (new.id, v_username, v_code, v_referrer)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- End PHASE 1. Next: accounts-02-functions.sql
-- =====================================================================
