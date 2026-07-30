-- ════════════════════════════════════════════════════════════════
-- NxTGen Trading Journal — Live Broker Price (Signal Details panel)
--
-- No new tables and no new price feed. This file only makes sure the
-- observability columns that supabase/functions/market-data-proxy/
-- 2-signal-monitor.index.ts ALREADY writes on every monitoring tick
-- (see evaluateSignal()) actually exist on journal_signals, since the
-- tracked schema files in this repo predate that function and an
-- untracked migration may or may not have added them yet in your
-- project. Every statement is IF NOT EXISTS / safe to re-run.
--
-- The frontend live-price card (js/signals.js) reads these same three
-- columns — nothing else — so the number shown in the UI is always
-- exactly the number the monitor last evaluated entry/TP/SL/breakeven
-- against, not a second, independently-fetched price.
-- ════════════════════════════════════════════════════════════════

-- Written every tick, for every open signal, regardless of whether a
-- milestone fires that tick (evaluateSignal's first statement).
alter table journal_signals add column if not exists monitor_last_price      numeric;
alter table journal_signals add column if not exists monitor_last_checked_at timestamptz;
alter table journal_signals add column if not exists monitor_source          text;

-- Milestone timestamps + monitoring controls the same function reads
-- and writes for entry/TP1/TP2/breakeven bookkeeping. Included here
-- defensively for the same reason as above — the live-price card's
-- distance-to-TP/SL math and its breakeven-aware stop both depend on
-- breakeven_at, tp1_hit_at and tp2_hit_at being present.
alter table journal_signals add column if not exists breakeven_at   timestamptz;
alter table journal_signals add column if not exists tp1_hit_at     timestamptz;
alter table journal_signals add column if not exists tp2_hit_at     timestamptz;
alter table journal_signals add column if not exists breakeven_rr   numeric;
alter table journal_signals add column if not exists auto_monitor_enabled boolean not null default true;

create index if not exists idx_signals_monitor_last_checked on journal_signals(monitor_last_checked_at);

-- ── Realtime ────────────────────────────────────────────────────
-- The live-price card does not open its own subscription — it reuses
-- the page's existing 'sig-live-status' channel (see
-- _sigWatchLiveUpdates in js/signals.js), which already listens for
-- UPDATE on journal_signals. If that channel's fallback poll is all
-- that's currently firing (i.e. Realtime was never enabled on this
-- table), enable it once so price ticks reach the browser instantly
-- instead of waiting up to 30s for the poll:
--   alter publication supabase_realtime add table journal_signals;
-- (No-op / already covered if signals_schema.sql's own Realtime note
-- was already applied.)
--
-- Nothing further to scope here: Realtime's postgres_changes feed
-- already respects the row's existing RLS policies ("signals: owner
-- full access" / "signals: readers see public/premium" in
-- signals_schema.sql), so a user only ever receives change events for
-- signals they're already allowed to SELECT — the same rule that
-- already governs every other read of this table.
-- ════════════════════════════════════════════════════════════════
