-- Synthetic-only bootstrap. Runner refuses any database except tll_submission_test.
drop schema if exists tll_submission_private cascade;
drop schema public cascade;
create schema public;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists(select 1 from pg_roles where rolname='tll_submission_test_staff') then create role tll_submission_test_staff nologin; end if;
end $$;
grant usage on schema public to anon,authenticated,service_role,tll_submission_test_staff;
create table public.contact_submissions(id uuid primary key default gen_random_uuid(),name text not null,email text not null,message text not null,created_at timestamptz default now());
create table public.supplement_submissions(id uuid primary key default gen_random_uuid(),category text not null,brand text not null,product_name text not null,url text not null,notes text,email text,created_at timestamptz default now());
alter table public.contact_submissions enable row level security;
alter table public.supplement_submissions enable row level security;
grant all on public.contact_submissions,public.supplement_submissions to anon,authenticated,service_role,tll_submission_test_staff;
grant insert(message),update(email) on public.contact_submissions to public;
grant insert(category),update(notes) on public.supplement_submissions to authenticated;
create policy allow_public_insert_contact on public.contact_submissions for insert to anon with check(true);
create policy legacy_permissive_extra on public.contact_submissions for all to public using(true) with check(true);
create policy legacy_mixed_staff on public.contact_submissions for all to anon,tll_submission_test_staff using(true) with check(true);
create policy allow_public_insert_supplement on public.supplement_submissions for insert to anon,authenticated with check(true);
create policy preserve_staff on public.supplement_submissions for all to tll_submission_test_staff using(true) with check(true);
insert into public.contact_submissions(id,name,email,message) values('22222222-2222-4222-8222-222222222222','Legacy synthetic staff evidence','legacy@example.test','Preserve this row');
