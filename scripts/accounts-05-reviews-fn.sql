-- =====================================================================
-- The Lifting Lab — Accounts & Points (spec v1.4)
-- PHASE 3 addendum — product reviews read function (joins author profile,
-- applies auto-approve-after-24h visibility). Run AFTER accounts-01-schema.sql.
-- Idempotent (CREATE OR REPLACE).
-- =====================================================================

-- get_product_reviews(product) — visible reviews for a product, newest first,
-- with author display fields. A review is visible when approved, or pending
-- past 24h (auto-approve), or owned by the caller (so authors see their own
-- pending review immediately). Public-callable.
create or replace function public.get_product_reviews(p_product uuid)
returns table (
  id           uuid,
  user_id      uuid,
  rating       integer,
  body         text,
  status       text,
  created_at   timestamptz,
  username     text,
  display_name text,
  avatar_type  text,
  avatar_id    text,
  avatar_url   text,
  is_mine      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.user_id, r.rating, r.body, r.status, r.created_at,
    p.username, p.display_name, p.avatar_type, p.avatar_id, p.avatar_url,
    (r.user_id = auth.uid()) as is_mine
  from public.reviews r
  join public.profiles p on p.id = r.user_id
  where r.product_id = p_product
    and (
      r.status = 'approved'
      or (r.status = 'pending' and r.created_at < now() - interval '24 hours')
      or r.user_id = auth.uid()
    )
  order by r.created_at desc;
$$;

grant execute on function public.get_product_reviews(uuid) to anon, authenticated;

-- get_user_reviews() — the caller's own reviews with product name/brand, for
-- the "My Reviews" dashboard section. Authenticated-only.
create or replace function public.get_user_reviews()
returns table (
  id            uuid,
  product_id    uuid,
  product_name  text,
  product_brand text,
  rating        integer,
  body          text,
  status        text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.product_id, pr.name, pr.brand, r.rating, r.body, r.status, r.created_at
  from public.reviews r
  join public.products pr on pr.id = r.product_id
  where r.user_id = auth.uid()
  order by r.created_at desc;
$$;

grant execute on function public.get_user_reviews() to authenticated;

-- =====================================================================
-- End addendum.
-- =====================================================================
