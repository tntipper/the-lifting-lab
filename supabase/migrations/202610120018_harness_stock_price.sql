-- T08: static review only. Private run/diff evidence; no hosted application or runtime writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create schema tll_harness_private;
revoke all on schema tll_harness_private from public, anon, authenticated;
grant usage on schema tll_harness_private to service_role;
create table tll_harness_private.harness_runs (
  id uuid primary key default gen_random_uuid(),
  supplier text not null check (supplier in ('tropship', 'bodypower', 'supplier3')),
  job text not null default 'stock-price' check (job = 'stock-price'),
  status text not null check (status in ('dry_run', 'completed', 'skipped', 'failed', 'uncertain')),
  started_at timestamptz not null,
  finished_at timestamptz not null check (finished_at >= started_at),
  write_enabled boolean not null default false,
  alerts jsonb not null default '[]'::jsonb check (jsonb_typeof(alerts) = 'array'),
  -- Dry-run stock checks alone cannot count as proof of unattended order dispatch.
  dispatch_evidence_eligible boolean not null default false check (dispatch_evidence_eligible = false)
);
create table tll_harness_private.sync_diffs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references tll_harness_private.harness_runs(id),
  mapping_id uuid not null references tll_mapping_private.product_mapping(id),
  field text not null check (field in ('inventory', 'price', 'cost_ex_vat')),
  old_value numeric(14,4) not null check (old_value >= 0 and old_value <> 'NaN'::numeric),
  new_value numeric(14,4) not null check (new_value >= 0 and new_value <> 'NaN'::numeric),
  applied boolean not null default false,
  reason text not null check (btrim(reason) <> ''),
  unique (run_id, mapping_id, field),
  check (field <> 'cost_ex_vat' or not applied)
);
create index harness_runs_started_at on tll_harness_private.harness_runs(started_at desc);
alter table tll_harness_private.harness_runs enable row level security;
alter table tll_harness_private.sync_diffs enable row level security;
revoke all on table tll_harness_private.harness_runs, tll_harness_private.sync_diffs from public, anon, authenticated;
grant select, insert, update on table tll_harness_private.harness_runs, tll_harness_private.sync_diffs to service_role;
commit;
