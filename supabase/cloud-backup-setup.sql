-- Hisab cloud backup setup (run in Supabase SQL Editor for your project)
-- Recommended Auth settings (Dashboard → Authentication → Providers / Email):
--   - Enable "Confirm email" so new accounts cannot upload until verified
--   - Prefer minimum password length ≥ 8 (app also enforces 8 on sign-up)

-- 1) Private storage bucket
insert into storage.buckets (id, name, public, file_size_limit)
values ('hisab-backups', 'hisab-backups', false, 52428800)
on conflict (id) do update set public = false;

-- 2) Storage RLS: each user may only access objects under {auth.uid()}/
drop policy if exists "hisab_backup_select" on storage.objects;
drop policy if exists "hisab_backup_insert" on storage.objects;
drop policy if exists "hisab_backup_update" on storage.objects;
drop policy if exists "hisab_backup_delete" on storage.objects;

create policy "hisab_backup_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hisab-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "hisab_backup_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hisab-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "hisab_backup_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'hisab-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "hisab_backup_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hisab-backups'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) Optional metadata table
create table if not exists public.cloud_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  byte_size bigint,
  schema_version text
);

alter table public.cloud_backups enable row level security;

drop policy if exists "cloud_backups_owner" on public.cloud_backups;
create policy "cloud_backups_owner" on public.cloud_backups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
