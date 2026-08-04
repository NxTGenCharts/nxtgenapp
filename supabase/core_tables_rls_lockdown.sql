-- ════════════════════════════════════════════════════════════════
-- NxTGen Trading Journal — Core tables RLS lockdown
--
-- WHY THIS FILE EXISTS
-- ---------------------
-- signals_schema.sql, zen_schema.sql, zen_sessions_schema.sql,
-- ai_chat_conversations_schema.sql and ai_coach_daily_checks_schema.sql
-- all enable Row Level Security and commit an owner-only policy as part
-- of the tracked migration. The ORIGINAL core tables below were never
-- given that treatment in this repo — journal_profiles even documents
-- its intended DDL (RLS included) only as a comment in
-- js/share-scores-logos.js, which means it was applied by hand once
-- in the Supabase SQL editor, if at all, and never re-verified.
--
-- Every one of the client queries below already filters reads with
-- .eq('user_id', auth uid) — see js/accounts.js, js/watchlist.js,
-- js/core-utils-ai.js, js/backtesting-lab.js, js/playbook.js,
-- js/share-scores-logos.js. That filter is a courtesy, not a boundary:
-- Postgres itself has to enforce it, or any authenticated user (anyone
-- with a valid login, via devtools/curl against the REST API, not just
-- a hypothetical attacker) can read or write every other user's rows
-- in these tables regardless of what the UI shows. If RLS was left off
-- on any of these — which is the most likely explanation for playbook
-- models appearing across accounts — this is the fix.
--
-- Safe to re-run: ENABLE ROW LEVEL SECURITY is idempotent, and every
-- policy is dropped and recreated rather than assumed absent.
-- ════════════════════════════════════════════════════════════════

-- Small helper so this file doesn't have to know in advance whether a
-- given table already has RLS enabled or an old/renamed policy sitting
-- on it under a different name.
do $$
declare
  t text;
  tables text[] := array[
    'journal_playbook',
    'journal_trades',
    'journal_deleted_trades',
    'journal_watchlist',
    'journal_goals',
    'journal_monthly',
    'journal_backtest_lab',
    'journal_backtest_trades',
    'journal_checklist_items',
    'journal_account_data',
    'journal_profiles'
  ];
begin
  foreach t in array tables loop
    execute format('alter table if exists public.%I enable row level security;', t);
  end loop;
end $$;

-- journal_playbook — the table the report was about.
-- One row per user, data jsonb = { models:[...], rules:[...] }.
drop policy if exists "playbook: owner full access" on journal_playbook;
create policy "playbook: owner full access" on journal_playbook
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_trades — the trade log itself.
drop policy if exists "trades: owner full access" on journal_trades;
create policy "trades: owner full access" on journal_trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_deleted_trades — trash/undo history for trades.
drop policy if exists "deleted_trades: owner full access" on journal_deleted_trades;
create policy "deleted_trades: owner full access" on journal_deleted_trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_watchlist — weekly watchlist entries.
drop policy if exists "watchlist: owner full access" on journal_watchlist;
create policy "watchlist: owner full access" on journal_watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_goals — quarterly goals.
drop policy if exists "goals: owner full access" on journal_goals;
create policy "goals: owner full access" on journal_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_monthly — monthly review R1/R2/R3 cache.
drop policy if exists "monthly: owner full access" on journal_monthly;
create policy "monthly: owner full access" on journal_monthly
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_backtest_lab — Backtesting Lab saved state.
drop policy if exists "backtest_lab: owner full access" on journal_backtest_lab;
create policy "backtest_lab: owner full access" on journal_backtest_lab
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_backtest_trades — individual backtest trade rows.
drop policy if exists "backtest_trades: owner full access" on journal_backtest_trades;
create policy "backtest_trades: owner full access" on journal_backtest_trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_checklist_items — user-defined pre-trade checklist.
drop policy if exists "checklist_items: owner full access" on journal_checklist_items;
create policy "checklist_items: owner full access" on journal_checklist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_account_data — payouts / milestones / accounts / calendar account.
drop policy if exists "account_data: owner full access" on journal_account_data;
create policy "account_data: owner full access" on journal_account_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- journal_profiles — name, contact info, preferences, avatar_url, local_prefs.
drop policy if exists "profiles: owner full access" on journal_profiles;
create policy "profiles: owner full access" on journal_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Verify ──────────────────────────────────────────────────────
-- Run this after applying the file above — every row must show
-- rowsecurity = true, and every table should show at least one policy.
--
--   select tablename, rowsecurity
--   from pg_tables
--   where schemaname = 'public'
--   order by tablename;
--
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
--
-- If a table shows rowsecurity = true but zero rows in pg_policies,
-- RLS is enabled but nothing is allowed through at all (including the
-- owner) — that's a different, more obvious bug (every request fails),
-- so if the app is working today that combination is unlikely, but
-- worth ruling out for any table this file doesn't cover.
-- ════════════════════════════════════════════════════════════════
