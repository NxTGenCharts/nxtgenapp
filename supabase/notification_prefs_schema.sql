-- ══════════════════════════════════════════════════════════════
-- journal_notification_prefs
-- One row per user, capturing how they want to be alerted whenever a
-- signal is published, edited, or changes status.
--
-- Run this in the Supabase SQL editor (or via `supabase db push` if
-- you're managing migrations that way) alongside your existing
-- journal_signals / journal_signal_notifications tables.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.journal_notification_prefs (
  owner_id           uuid primary key references auth.users(id) on delete cascade,

  sound_enabled      boolean not null default true,

  push_enabled       boolean not null default false,
  push_subscription  jsonb,              -- the PushSubscription.toJSON() blob from the browser

  email_enabled      boolean not null default false,
  email              text,

  whatsapp_enabled   boolean not null default false,
  whatsapp_number    text,               -- E.164 format, e.g. +15551234567

  updated_at         timestamptz not null default now()
);

alter table public.journal_notification_prefs enable row level security;

-- Everyone can manage their own preferences.
create policy "notif_prefs_select_own"
  on public.journal_notification_prefs for select
  using (auth.uid() = owner_id);

create policy "notif_prefs_upsert_own"
  on public.journal_notification_prefs for insert
  with check (auth.uid() = owner_id);

create policy "notif_prefs_update_own"
  on public.journal_notification_prefs for update
  using (auth.uid() = owner_id);

-- The notify-subscribers Edge Function runs with the service_role key
-- (bypasses RLS), so it can read every opted-in row to fan a broadcast
-- out — no extra policy needed for that.

create index if not exists journal_notification_prefs_push_idx
  on public.journal_notification_prefs (push_enabled) where push_enabled = true;
create index if not exists journal_notification_prefs_email_idx
  on public.journal_notification_prefs (email_enabled) where email_enabled = true;
create index if not exists journal_notification_prefs_whatsapp_idx
  on public.journal_notification_prefs (whatsapp_enabled) where whatsapp_enabled = true;
