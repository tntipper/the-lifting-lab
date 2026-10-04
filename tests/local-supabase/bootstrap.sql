\set ON_ERROR_STOP on
-- Synthetic application prerequisites over REAL CLI-managed Auth and Storage.
-- Deliberately never creates/replaces auth.users, auth.uid() or storage objects.
do $$ begin
  if current_setting('tll.integration_fixture', true) is distinct from 'tll-local-integration'
     or current_database() <> 'postgres'
     or to_regclass('auth.identities') is null
     or to_regclass('storage.objects') is null
     or to_regclass('public.profiles') is not null then
    raise exception 'Requires an empty dedicated local Supabase integration project';
  end if;
end $$;
create table public.products (
  id uuid primary key default gen_random_uuid(), name text not null, brand text,
  status text default 'pending', source text default 'community', submitted_by uuid,
  retail_price numeric, buy_url text
);
alter table public.products enable row level security;
create policy products_read on public.products for select using (status = 'active');
create table public.product_nutrients (id uuid primary key default gen_random_uuid(), product_id uuid references public.products, amount numeric);
alter table public.product_nutrients enable row level security;
create policy nutrients_read on public.product_nutrients for select using (true);
\ir scripts/accounts-01-schema.sql
alter table public.profiles add column email text, add column newsletter_opt_in boolean default true;
\ir scripts/favourites.sql
create table public.user_stacks (id uuid primary key, user_id uuid references auth.users);
create table public.stack_products (id uuid primary key default gen_random_uuid(), stack_id uuid references public.user_stacks, product_id uuid references public.products, unique(stack_id,product_id));
\ir scripts/accounts-02-functions.sql
\ir scripts/accounts-03-seed.sql
\ir scripts/accounts-04-referral-fn.sql
\ir scripts/accounts-05-reviews-fn.sql
\ir scripts/accounts-06-storage.sql
\ir scripts/accounts-07-account-fn.sql
\ir scripts/accounts-08-security-patch.sql
\ir scripts/accounts-09-points-hardening.sql
\ir scripts/create-submission-tables.sql
\ir migrations/202609150001_integrity_boundaries.sql
-- Replay on the real managed schemas, without weakening their ownership.
\ir migrations/202609150001_integrity_boundaries.sql
create table public.tll_local_fixture_marker (id boolean primary key default true check (id), migration_sha256 text not null);
alter table public.tll_local_fixture_marker enable row level security;
revoke all on public.tll_local_fixture_marker from public, anon, authenticated;
insert into public.tll_local_fixture_marker values (true, :'migration_sha256');
notify pgrst, 'reload schema';
