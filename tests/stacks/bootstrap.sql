-- Only tll_stack_test in the fixed local synthetic fixture.
drop schema if exists tll_stack_private cascade;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
 if not exists(select 1 from pg_roles where rolname='tll_stack_test_staff') then create role tll_stack_test_staff nologin; end if;
end $$;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
grant usage on schema auth,public to anon,authenticated,service_role,tll_stack_test_staff;
create table public.products(id uuid primary key,name text,brand text,category text,status text default 'active',serving_size numeric,serving_unit text,buy_url text);
create table public.product_nutrients(product_id uuid references public.products,nutrient_name text,amount numeric,unit text);
create table public.user_stacks(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null default 'My Stack',is_active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.stack_products(id uuid primary key default gen_random_uuid(),stack_id uuid not null references public.user_stacks(id) on delete cascade,product_id uuid not null references public.products(id),servings_per_day numeric default 1,added_at timestamptz default now(),unique(stack_id,product_id));
alter table public.user_stacks enable row level security;
alter table public.stack_products enable row level security;
grant all on public.user_stacks,public.stack_products to anon,authenticated,service_role,tll_stack_test_staff;
grant update(is_active),insert(name) on public.user_stacks to public;
grant update(servings_per_day),insert(product_id) on public.stack_products to authenticated;
create policy legacy_stacks on public.user_stacks for all to public using(user_id=auth.uid());
create policy legacy_items on public.stack_products for all to public using(exists(select 1 from public.user_stacks s where s.id=stack_id and s.user_id=auth.uid()));
create policy mixed_staff on public.user_stacks for all to anon,tll_stack_test_staff using(true) with check(true);
create policy named_staff on public.stack_products for all to tll_stack_test_staff using(true) with check(true);
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.products(id,name,brand,category,serving_size,serving_unit) select ('aaaaaaaa-aaaa-4aaa-8aaa-'||lpad(n::text,12,'0'))::uuid,'Synthetic product '||n,'Synthetic','creatine',5,'g' from generate_series(1,12) n;
update public.products set status='pending' where id='aaaaaaaa-aaaa-4aaa-8aaa-000000000012';
insert into public.user_stacks(id,user_id,name,is_active,created_at) values
 ('d1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Original earliest',true,'2025-01-01'),
 ('d2222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Original second',true,'2025-02-01'),
 ('d3333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Original third',true,'2025-03-01'),
 ('d4444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','Already archived',false,'2024-01-01');
insert into public.stack_products(stack_id,product_id,servings_per_day) values
 ('d1111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-000000000001',2),
 ('d2222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-000000000001',4),
 ('d2222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-000000000002',1),
 ('d2222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-000000000003',1),
 ('d3333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-000000000003',2),
 ('d4444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-000000000004',1);
