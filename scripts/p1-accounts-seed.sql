-- ============================================================================
-- The Lifting Lab — Accounts/Points seed data.
-- Run AFTER p1-accounts-schema.sql, in the Supabase SQL Editor.
-- Re-runnable (upserts on conflict).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- points_config  (admin-configurable; edit these rows to retune the economy)
-- ---------------------------------------------------------------------------
insert into public.points_config (action_type, points, limit_type, label) values
  ('signup',       100, 'once',            'Sign up'),
  ('review',        75, 'once_per_ref',    'Write a product review'),
  ('favourite',     10, 'once_per_ref',    'Save a product to favourites'),
  ('build_stack',   50, 'once_per_ref',    'Build a stack (3+ products)'),
  ('share',         25, 'per_ref_per_24h', 'Share a product/stack'),
  ('daily_login',    5, 'once_per_day',    'Daily login'),
  ('referral',     150, 'per_ref',         'Refer a friend')
on conflict (action_type) do update
  set points = excluded.points,
      limit_type = excluded.limit_type,
      label = excluded.label,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- seasons — 2026 competitive year (4 × 12 weeks, fixed UUIDs for FK seeds)
-- Statuses set by date; run refresh_season_status() later to keep them current.
-- ---------------------------------------------------------------------------
insert into public.seasons (id, name, starts_at, ends_at, status, prize_description) values
  ('a0000001-0000-4000-8000-000000000001', 'Season 1 2026 — Winter',        '2026-01-01 00:00:00+00', '2026-03-23 23:59:59+00', 'ended',    'To Be Announced'),
  ('a0000002-0000-4000-8000-000000000002', 'Season 2 2026 — Spring/Summer', '2026-03-24 00:00:00+00', '2026-06-15 23:59:59+00', 'active',   'To Be Announced'),
  ('a0000003-0000-4000-8000-000000000003', 'Season 3 2026 — Summer/Autumn', '2026-06-16 00:00:00+00', '2026-09-07 23:59:59+00', 'upcoming', 'To Be Announced'),
  ('a0000004-0000-4000-8000-000000000004', 'Season 4 2026 — Autumn',        '2026-09-08 00:00:00+00', '2026-11-30 23:59:59+00', 'upcoming', 'To Be Announced')
on conflict (id) do update
  set name = excluded.name,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      prize_description = excluded.prize_description;

-- ---------------------------------------------------------------------------
-- avatar_catalog
--  standard  = free, always available (rendered as themed SVG by id)
--  premium   = permanent points unlock
--  seasonal  = purchasable only while its season is active; collectible after
-- ---------------------------------------------------------------------------
insert into public.avatar_catalog (id, name, type, season_id, points_cost, active, sort_order) values
  -- Standard (free)
  ('barbell',       'Barbell',        'standard', null,   0, true,  1),
  ('flask',         'Lab Flask',      'standard', null,   0, true,  2),
  ('dumbbell',      'Dumbbell',       'standard', null,   0, true,  3),
  ('flame',         'Flame',          'standard', null,   0, true,  4),
  ('lightning',     'Lightning',      'standard', null,   0, true,  5),
  ('trophy',        'Trophy',         'standard', null,   0, true,  6),
  -- Premium (points unlock)
  ('gold-barbell',  'Gold Barbell',   'premium',  null, 300, true, 10),
  ('lab-scientist', 'Lab Scientist',  'premium',  null, 350, true, 11),
  ('neon-lion',     'Neon Lion',      'premium',  null, 400, true, 12),
  ('elite-badge',   'Elite Lab',      'premium',  null, 500, true, 13),
  -- Seasonal — S2 (active now)
  ('s2-spring-titan',   'Spring Titan',   'seasonal', 'a0000002-0000-4000-8000-000000000002', 250, true, 20),
  ('s2-summer-phoenix', 'Summer Phoenix', 'seasonal', 'a0000002-0000-4000-8000-000000000002', 300, true, 21),
  -- Seasonal — S3 (upcoming)
  ('s3-iron-warrior',   'Iron Warrior',   'seasonal', 'a0000003-0000-4000-8000-000000000003', 300, true, 22),
  -- Seasonal — S1 (ended; collectible / expired example)
  ('s1-frost-champion', 'Frost Champion', 'seasonal', 'a0000001-0000-4000-8000-000000000001', 250, false, 23)
on conflict (id) do update
  set name = excluded.name,
      type = excluded.type,
      season_id = excluded.season_id,
      points_cost = excluded.points_cost,
      active = excluded.active,
      sort_order = excluded.sort_order;

-- Link seasonal skins onto their seasons
update public.seasons set avatar_skin_ids = array['s1-frost-champion']                   where id = 'a0000001-0000-4000-8000-000000000001';
update public.seasons set avatar_skin_ids = array['s2-spring-titan','s2-summer-phoenix']  where id = 'a0000002-0000-4000-8000-000000000002';
update public.seasons set avatar_skin_ids = array['s3-iron-warrior']                      where id = 'a0000003-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- Backfill profiles for any users who signed up before this migration.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, username)
select u.id, 'lifter_' || substr(replace(u.id::text, '-', ''), 1, 8)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
