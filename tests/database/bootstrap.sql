\set ON_ERROR_STOP on
-- Synthetic baseline ONLY. Refuses a non-test database or existing schema.
do $$ begin
  if current_database() not in ('tll_stage0','tll_stage0_replay','tll_stage0_review') or to_regclass('public.profiles') is not null then
    raise exception 'Use an empty disposable tll_stage0 database';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant anon, authenticated, service_role to current_user;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                   nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.products (
  id uuid primary key default gen_random_uuid(), name text not null, brand text,
  status text default 'pending', source text default 'community', submitted_by uuid,
  retail_price numeric, buy_url text
);
alter table public.products enable row level security;
create policy "Anyone can view active products" on public.products for select using (status = 'active');
create policy "Logged-in users can submit products" on public.products for insert with check (auth.uid() is not null);
create table public.product_nutrients (id uuid primary key default gen_random_uuid(), product_id uuid references public.products, amount numeric);
alter table public.product_nutrients enable row level security;
create policy nutrients_read on public.product_nutrients for select using (true);
\ir ../../scripts/accounts-01-schema.sql
alter table public.profiles add column email text, add column newsletter_opt_in boolean default true;
-- Reproduce both old policy names and old column ACLs, including an updatable view.
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
grant update(total_points,points_spent,referred_by,referral_code), insert(id,total_points) on public.profiles to authenticated;
grant update(status,created_at), insert(status,created_at) on public.reviews to authenticated;
grant update(total_points) on public.public_profiles to authenticated;
\ir ../../scripts/favourites.sql
create table public.user_stacks (id uuid primary key, user_id uuid references auth.users);
create table public.stack_products (id uuid primary key default gen_random_uuid(), stack_id uuid references public.user_stacks, product_id uuid references public.products, unique(stack_id,product_id));
\ir ../../scripts/accounts-02-functions.sql
\ir ../../scripts/accounts-03-seed.sql
\ir ../../scripts/accounts-04-referral-fn.sql
\ir ../../scripts/accounts-05-reviews-fn.sql
\ir ../../scripts/accounts-07-account-fn.sql
\ir ../../scripts/accounts-08-security-patch.sql
\ir ../../scripts/accounts-09-points-hardening.sql
\ir ../../scripts/create-submission-tables.sql
insert into auth.users(id,email,created_at) values
 ('10000000-0000-4000-8000-000000000001', 'fixture_a@example.invalid', now() - interval '3 days'),
 ('10000000-0000-4000-8000-000000000002', 'fixture_b@example.invalid', now() - interval '3 days'),
 ('10000000-0000-4000-8000-000000000003', 'fixture_c@example.invalid', now());
insert into public.products(id,name,brand,status) values
 ('20000000-0000-4000-8000-000000000001','Synthetic active product','Fixture','active'),
 ('20000000-0000-4000-8000-000000000002','Synthetic active product 2','Fixture','active'),
 ('20000000-0000-4000-8000-000000000003','Synthetic pending product','Fixture','pending');
update public.profiles set referred_by = '10000000-0000-4000-8000-000000000001'
 where id = '10000000-0000-4000-8000-000000000002';
