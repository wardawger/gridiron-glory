-- ============================================================
-- Roster avatar migration — run in Supabase SQL Editor
-- Project Settings → SQL Editor → New Query → Paste → Run
-- ============================================================

-- 1. New columns on league_members (defaults keep every existing
--    member's appearance unchanged — a colored circle with their
--    initial — until they set something in My Account).
alter table league_members
  add column avatar_type text not null default 'initial',
  add column avatar_value text not null default '';

alter table league_members
  add constraint league_members_avatar_type_check
  check (avatar_type in ('initial', 'emoji', 'logo', 'upload'));

-- Note: no new RLS policy needed for these columns — the existing
-- "Users can update their own membership" policy (added by
-- supabase-migration-account-page.sql) already covers updates to
-- any column on a member's own row.

-- 2. Storage bucket for uploaded avatar photos.
--    Public read (so images actually render for other members),
--    2MB size cap and image-only mime types enforced server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "Public can view avatar images"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can replace their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
