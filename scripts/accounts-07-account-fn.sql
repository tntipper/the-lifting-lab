-- =====================================================================
-- The Lifting Lab — Accounts & Points (spec v1.4)
-- PHASE 6 addendum — self-service account deletion. Run after phase 1.
-- Idempotent (CREATE OR REPLACE).
-- =====================================================================

-- delete_own_account() — lets a signed-in user delete their own auth user.
-- Cascades (on delete cascade) clear profiles, ledger, reviews, favourites,
-- stacks, avatar unlocks, etc. SECURITY DEFINER so it can touch auth.users,
-- but only ever removes auth.uid() — never another account.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;
  delete from auth.users where id = v_user;
end;
$$;

grant execute on function public.delete_own_account() to authenticated;

-- =====================================================================
-- End addendum.
-- =====================================================================
