/**
 * Supabase client for optional cloud backup (not multi-device sync).
 *
 * Required env (Expo public):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * One-time project setup:
 * 1. Auth → Email enabled with password sign-in (app uses email + password).
 * 2. Storage bucket `hisab-backups` (private).
 * 3. Object paths per user:
 *      {auth.uid()}/hisab-latest.db
 *      {auth.uid()}/hisab-backup-YYYY-MM-DD.db  (kept ~7 days)
 * 4. Storage RLS: allow authenticated users to read/write only under
 *    their own `{auth.uid()}/` prefix. Example policies:
 *
 *    create policy "hisab_backup_select" on storage.objects for select
 *      to authenticated using (
 *        bucket_id = 'hisab-backups'
 *        and (storage.foldername(name))[1] = auth.uid()::text
 *      );
 *    create policy "hisab_backup_insert" on storage.objects for insert
 *      to authenticated with check (
 *        bucket_id = 'hisab-backups'
 *        and (storage.foldername(name))[1] = auth.uid()::text
 *      );
 *    create policy "hisab_backup_update" on storage.objects for update
 *      to authenticated using (
 *        bucket_id = 'hisab-backups'
 *        and (storage.foldername(name))[1] = auth.uid()::text
 *      );
 *    create policy "hisab_backup_delete" on storage.objects for delete
 *      to authenticated using (
 *        bucket_id = 'hisab-backups'
 *        and (storage.foldername(name))[1] = auth.uid()::text
 *      );
 *
 * 5. Optional metadata table (owner-only RLS):
 *
 *    create table public.cloud_backups (
 *      user_id uuid primary key references auth.users (id) on delete cascade,
 *      updated_at timestamptz not null default now(),
 *      byte_size bigint,
 *      schema_version text
 *    );
 *    alter table public.cloud_backups enable row level security;
 *    create policy "cloud_backups_owner" on public.cloud_backups
 *      for all to authenticated
 *      using (user_id = auth.uid()) with check (user_id = auth.uid());
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAuthStorage } from './supabaseAuthStorage';

export const CLOUD_BACKUP_BUCKET = 'hisab-backups';
export const CLOUD_LATEST_OBJECT = 'hisab-latest.db';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

let client: SupabaseClient | null = null;

/** True when URL + anon key are present so cloud backup can run. */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/** Lazily create a single client; returns null when env is missing. */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: supabaseAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
