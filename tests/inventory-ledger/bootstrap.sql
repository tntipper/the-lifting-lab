-- Destructive reset is restricted to this marked synthetic database only.
\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'tll_inventory_ledger' or to_regclass('public.tll_inventory_test_marker') is null
    or not exists(select from public.tll_inventory_test_marker where marker='synthetic-inventory-ledger-v1') then
    raise exception 'Unmarked or incorrect synthetic inventory database';
  end if;
end $$;
drop schema if exists tll_inventory_private cascade;
drop schema if exists tll_inventory_test cascade;
do $$ declare r text;
begin
  foreach r in array array['tll_inventory_test_worker_a','tll_inventory_test_worker_b','tll_inventory_owner','tll_inventory_worker','tll_inventory_test_leak'] loop
    if exists(select from pg_roles where rolname=r) then
      execute format('drop owned by %I',r);
      execute format('drop role %I',r);
    end if;
  end loop;
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists(select from pg_roles where rolname=r) then execute format('create role %I nologin',r); end if;
  end loop;
  if not exists(select from pg_roles where rolname='tll_inventory_test_migrator') then
    create role tll_inventory_test_migrator nologin createrole noinherit;
  end if;
end $$;
alter database tll_inventory_ledger owner to tll_inventory_test_migrator;
