-- =====================================================================
-- The Lifting Lab — Accounts & Points system (spec v1.4)
-- PHASE 3 of 3 — Seed data: points_config rules, 2026 seasons,
-- avatar_catalog (standard / premium / seasonal). Run AFTER
-- accounts-01-schema.sql and accounts-02-functions.sql.
--
-- Idempotent: upserts on primary keys. Re-running refreshes values.
-- =====================================================================

-- ---------------------------------------------------------------------
-- points_config — the admin-tunable earn table (spec §3).
-- ---------------------------------------------------------------------
insert into public.points_config (action_type, points, limit_type, cooldown_hours, min_account_age_hours, enabled, description) values
  ('signup',      100, 'once',             0,  0,  true, 'Account created'),
  ('review',       75, 'once_per_ref',     0,  0,  true, 'Write a product review (once per product)'),
  ('favourite',    10, 'once_per_ref',     0,  0,  true, 'Save a product to favourites (once per product)'),
  ('build_stack',  50, 'once_per_ref',     0,  0,  true, 'Build a stack of 3+ products (once per stack)'),
  ('share',        25, 'per_ref_cooldown', 24, 24, true, 'Share a product/stack (once per product / 24h)'),
  ('daily_login',   5, 'per_day',          0,  0,  true, 'Daily login bonus'),
  ('referral',    150, 'once_per_ref',     0,  0,  true, 'Refer a friend who signs up')
on conflict (action_type) do update set
  points                = excluded.points,
  limit_type            = excluded.limit_type,
  cooldown_hours        = excluded.cooldown_hours,
  min_account_age_hours = excluded.min_account_age_hours,
  enabled               = excluded.enabled,
  description           = excluded.description;

-- ---------------------------------------------------------------------
-- seasons — 2026 competitive year (fixed UUIDs so avatars can link).
-- Windows are [starts_at, ends_at): ends_at is the exclusive next boundary.
-- ---------------------------------------------------------------------
insert into public.seasons (id, name, starts_at, ends_at, status, prize_description, avatar_skin_ids) values
  ('00000000-0000-0000-0000-000000000001', 'Season 1 2026 — Winter',
     '2026-01-01 00:00:00+00', '2026-03-24 00:00:00+00', 'ended',
     'To be announced', '{season-1-2026-frost-titan}'),
  ('00000000-0000-0000-0000-000000000002', 'Season 2 2026 — Spring/Summer',
     '2026-03-24 00:00:00+00', '2026-06-16 00:00:00+00', 'active',
     'To be announced', '{season-2-2026-spring-warrior}'),
  ('00000000-0000-0000-0000-000000000003', 'Season 3 2026 — Summer/Autumn',
     '2026-06-16 00:00:00+00', '2026-09-08 00:00:00+00', 'upcoming',
     'To be announced', '{season-3-2026-summer-phoenix}'),
  ('00000000-0000-0000-0000-000000000004', 'Season 4 2026 — Autumn',
     '2026-09-08 00:00:00+00', '2026-12-01 00:00:00+00', 'upcoming',
     'To be announced', '{season-4-2026-iron-storm}')
on conflict (id) do update set
  name              = excluded.name,
  starts_at         = excluded.starts_at,
  ends_at           = excluded.ends_at,
  status            = excluded.status,
  prize_description = excluded.prize_description,
  avatar_skin_ids   = excluded.avatar_skin_ids;

-- ---------------------------------------------------------------------
-- avatar_catalog — assets rendered by slug in the app (asset_url null =>
-- inline SVG by the Avatar component). Standard set is free at signup.
-- ---------------------------------------------------------------------
insert into public.avatar_catalog (id, name, type, season_id, points_cost, asset_url, active, sort_order) values
  -- Standard (free) — 6 fitness/lab themed
  ('barbell',   'Barbell',        'standard', null,   0, null, true, 10),
  ('flask',     'Lab Flask',      'standard', null,   0, null, true, 20),
  ('dumbbell',  'Dumbbell',       'standard', null,   0, null, true, 30),
  ('flame',     'Flame',          'standard', null,   0, null, true, 40),
  ('lightning', 'Lightning Bolt', 'standard', null,   0, null, true, 50),
  ('trophy',    'Trophy',         'standard', null,   0, null, true, 60),
  -- Premium (points unlock)
  ('gold-barbell',  'Gold Barbell',   'premium', null, 300, null, true, 110),
  ('lab-scientist', 'Lab Scientist',  'premium', null, 350, null, true, 120),
  ('neon-lion',     'Neon Lion',      'premium', null, 400, null, true, 130),
  ('elite-badge',   'Elite Lab Badge','premium', null, 500, null, true, 140),
  -- Custom photo slot (highest cost; unlock then upload in settings)
  ('custom-photo',  'Custom Photo',   'premium', null, 1000, null, true, 150),
  -- Seasonal limited edition (1 per season; active only during its window)
  ('season-1-2026-frost-titan',    'Frost Titan (S1 2026)',    'seasonal',
     '00000000-0000-0000-0000-000000000001', 250, null, false, 210),
  ('season-2-2026-spring-warrior', 'Spring Warrior (S2 2026)', 'seasonal',
     '00000000-0000-0000-0000-000000000002', 250, null, true,  220),
  ('season-3-2026-summer-phoenix', 'Summer Phoenix (S3 2026)', 'seasonal',
     '00000000-0000-0000-0000-000000000003', 250, null, true,  230),
  ('season-4-2026-iron-storm',     'Iron Storm (S4 2026)',     'seasonal',
     '00000000-0000-0000-0000-000000000004', 250, null, true,  240)
on conflict (id) do update set
  name        = excluded.name,
  type        = excluded.type,
  season_id   = excluded.season_id,
  points_cost = excluded.points_cost,
  asset_url   = excluded.asset_url,
  active      = excluded.active,
  sort_order  = excluded.sort_order;

-- =====================================================================
-- End seed. Schema is ready. (Season-end snapshot + status flips are run
-- manually / by a future cron via snapshot_season_results().)
-- =====================================================================
