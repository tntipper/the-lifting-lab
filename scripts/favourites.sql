-- Run in Supabase SQL Editor to create the favourites table.
-- The Lifting Lab — per-user product favourites (auth-gated).

create table if not exists public.user_favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.user_favourites enable row level security;

-- Users can only see and manage their own favourites.
create policy "favourites_select_own" on public.user_favourites
  for select using (auth.uid() = user_id);

create policy "favourites_insert_own" on public.user_favourites
  for insert with check (auth.uid() = user_id);

create policy "favourites_delete_own" on public.user_favourites
  for delete using (auth.uid() = user_id);

create index if not exists user_favourites_user_id_idx
  on public.user_favourites (user_id);
