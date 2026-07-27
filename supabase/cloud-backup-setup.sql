-- Hisab cloud backup setup (run in Supabase SQL Editor for your project)
--
-- Owner / email checklist (do once per project):
--   [ ] Auth → Providers → Email enabled (password sign-in)
--   [ ] Auth → enable "Confirm email" so new accounts cannot upload until verified
--   [ ] Prefer minimum password length ≥ 10 (app enforces 10 on sign-in/sign-up)
--   [ ] Replace OWNER_EMAIL_PLACEHOLDER below with your real owner email, then run
--       section 0 (signup allowlist trigger) — this is the real server-side lock
--   [ ] Set EXPO_PUBLIC_CLOUD_OWNER_EMAIL in the app build to the same email
--       (client UX only; not authoritative — anyone can bypass a public env var)
--   [ ] After first successful sign-up, Auth → disable public sign-ups if available
--   [ ] Confirm the owner email inbox once after first sign-up (before first upload)
--   [ ] Storage bucket hisab-backups is private (created below)
--
-- Reminder: cloud backup is a full DB snapshot from one device — last upload wins;
-- it is not multi-device live sync.

-- 0) Server-side signup allowlist (authoritative)
-- Replace the placeholder email before running. Blocks any other email from
-- creating an auth.users row via the Auth API (including decompiled APK clients).
create or replace function public.hisab_enforce_owner_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- >>> CHANGE THIS to your owner email before running <<<
  allowed_email text := lower('you@example.com');
begin
  if new.email is null or lower(new.email) <> allowed_email then
    raise exception 'Hisab cloud backup: sign-up restricted to the owner email'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists hisab_enforce_owner_email on auth.users;
create trigger hisab_enforce_owner_email
  before insert on auth.users
  for each row
  execute function public.hisab_enforce_owner_email();

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
