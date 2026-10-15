-- TLL: restrict SECURITY DEFINER RPCs and make public_profiles respect RLS (Supabase advisors 15 Oct 2026).
-- Logged-out reads still allowed (used by public pages): current_season, get_leaderboard, get_product_reviews.
-- Signed-in only: award_points, claim_referral, delete_own_account, ensure_profile, get_referral_count,
--   get_user_rank, get_user_reviews, unlock_avatar.
-- Trigger-only: handle_new_user (no API role needs EXECUTE).

revoke execute on function public.award_points(text, text)          from public, anon;
revoke execute on function public.claim_referral()                  from public, anon;
revoke execute on function public.delete_own_account()              from public, anon;
revoke execute on function public.ensure_profile()                  from public, anon;
revoke execute on function public.get_referral_count()              from public, anon;
revoke execute on function public.get_user_rank(uuid, uuid)         from public, anon;
revoke execute on function public.get_user_reviews()                from public, anon;
revoke execute on function public.unlock_avatar(text)               from public, anon;
grant  execute on function public.award_points(text, text)          to authenticated;
grant  execute on function public.claim_referral()                  to authenticated;
grant  execute on function public.delete_own_account()              to authenticated;
grant  execute on function public.ensure_profile()                  to authenticated;
grant  execute on function public.get_referral_count()              to authenticated;
grant  execute on function public.get_user_rank(uuid, uuid)         to authenticated;
grant  execute on function public.get_user_reviews()                to authenticated;
grant  execute on function public.unlock_avatar(text)               to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- public_profiles: run with the caller's permissions (profiles RLS applies) and make it read-only for API roles.
alter view public.public_profiles set (security_invoker = true);
revoke insert, update, delete, truncate, references, trigger on public.public_profiles from anon, authenticated;
