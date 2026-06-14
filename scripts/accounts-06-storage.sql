-- =====================================================================
-- The Lifting Lab — Accounts & Points (spec v1.4)
-- PHASE 5 addendum — Supabase Storage bucket + policies for custom avatar
-- photo uploads. Run in the Supabase SQL editor (any time after phase 1).
--
-- Files live under avatars/{user_id}/...  Users may write only their own
-- folder; the bucket is public-read so avatar URLs resolve everywhere.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Public read of avatar images.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- A user may upload/update/delete only files inside their own {user_id}/ folder.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- End addendum.
-- =====================================================================
