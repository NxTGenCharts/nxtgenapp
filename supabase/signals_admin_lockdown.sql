-- ════════════════════════════════════════════════════════════════
-- NxTGen Trading Journal — Signals admin lockdown
-- Referenced by comments in js/signals.js, js/admin.js, js/admin-gate.js
-- but never actually created — this file closes that gap.
--
-- This is the SERVER-SIDE boundary for the admin console. Everything in
-- js/admin.js and js/admin-gate.js is UX only (hiding buttons, refusing to
-- render); a request forged with devtools or curl against the Supabase
-- REST API must still be rejected by Postgres itself. That's what the
-- policies below do.
--
-- Run in the Supabase SQL editor after signals_schema.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- Table of admin user ids. Today this holds exactly one row (the account
-- also hardcoded client-side as SIG_ADMIN_OWNER_ID in js/signals.js) — kept
-- as a table rather than a second hardcoded constant so a second admin can
-- be added later with one insert instead of a code change + redeploy.
create table if not exists journal_signal_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  added_at    timestamptz not null default now()
);

alter table journal_signal_admins enable row level security;

-- Nobody can read/write this table via the client API — it's only ever
-- consulted server-side through is_signal_admin() (security definer below).
-- No policies are created, so RLS denies all client access by default.

create or replace function is_signal_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from journal_signal_admins where user_id = auth.uid()
  );
$$;

-- Seed the current admin. Replace with the real admin's auth.users.id if
-- different — this is the same id already hardcoded as SIG_ADMIN_OWNER_ID
-- in js/signals.js, kept in sync intentionally.
insert into journal_signal_admins (user_id)
values ('acc49a9d-b664-481f-9e07-746fd8ab10ec')
on conflict (user_id) do nothing;

-- ── Admin full-access policies ─────────────────────────────────────
-- These sit ALONGSIDE the existing owner_id-based policies in
-- signals_schema.sql (auth.uid() = owner_id); they don't replace them.
-- Together: the owner can always manage their own rows, and anyone listed
-- in journal_signal_admins can manage every row regardless of owner_id —
-- which is what the admin console (bulk publish/unpublish/archive/delete
-- across ALL signals, not just ones it happens to own) actually needs.

create policy "signals: admin full access" on journal_signals
  for all using (is_signal_admin()) with check (is_signal_admin());

create policy "signal_updates: admin full access" on journal_signal_updates
  for all using (is_signal_admin()) with check (is_signal_admin());

create policy "signal_comments: admin full access" on journal_signal_comments
  for all using (is_signal_admin()) with check (is_signal_admin());

create policy "signal_images: admin full access" on journal_signal_images
  for all using (is_signal_admin()) with check (is_signal_admin());

create policy "signal_tags: admin full access" on journal_signal_tags
  for all using (is_signal_admin()) with check (is_signal_admin());

create policy "signal_results: admin full access" on journal_signal_results
  for all using (is_signal_admin()) with check (is_signal_admin());
