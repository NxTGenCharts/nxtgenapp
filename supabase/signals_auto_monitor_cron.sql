-- ════════════════════════════════════════════════════════════════
-- NxTGen Trading Journal — Schedule the signal-monitor Edge Function
--
-- supabase/functions/signal-monitor/index.ts contains all the logic
-- for auto-triggering pending signals, hitting SL/TP, and moving
-- stops to breakeven — but an Edge Function only runs when something
-- calls it. Nothing in this repo was calling it on a schedule, which
-- is why pending signals never auto-triggered even when price
-- reached entry: the code existed, it just never ran.
--
-- This file wires up pg_cron (Postgres's job scheduler, available on
-- every Supabase project) + pg_net (async HTTP from Postgres) to hit
-- the deployed function every 10 seconds, forever, with no server or
-- open browser tab required.
--
-- Faster than a plain "every minute" cron: pg_cron supports sub-minute
-- intervals via a literal schedule string like '10 seconds' instead of
-- the standard 5-field cron expression. Running 6x/minute means SL/TP/
-- entry/breakeven get detected within ~10s of actually happening,
-- instead of up to 60s late. The tradeoff: 6x the Edge Function
-- invocations and 6x the Deriv/TradingView/Twelve Data calls (though
-- most of that is absorbed by market_quote_cache when multiple open
-- signals share a symbol). If you have a LOT of open signals across
-- many distinct symbols, keep an eye on Edge Function invocation counts
-- against your Supabase plan's included quota.
--
-- WHY VAULT INSTEAD OF PASTING THE KEY DIRECTLY INTO THIS FILE:
-- Earlier versions of this file had you paste a raw service_role JWT
-- straight into the SQL string. In practice that's fragile — a long
-- token pasted through a SQL editor's line-wrapped display can pick
-- up embedded line breaks that corrupt it (a real JWT never contains
-- a newline), which silently causes 401 UNAUTHORIZED_INVALID_JWT_FORMAT
-- even though the key "looks right" on screen. Storing it once in
-- Supabase Vault and referencing it by name avoids re-pasting a giant
-- token every time you touch this file, and Vault's own paste field
-- isn't subject to the same word-wrap-vs-real-newline ambiguity a
-- multi-line SQL editor view is.
--
-- BEFORE RUNNING THIS FILE:
--   1. Deploy the function (only needs doing once, then again after
--      any future edit to signal-monitor/index.ts):
--        supabase functions deploy signal-monitor
--
--   2. Store the auth key in Vault ONCE (SQL Editor):
--        select vault.create_secret(
--          'YOUR-SERVICE-ROLE-JWT-HERE',   -- Project Settings → API → Legacy API Keys → service_role
--          'signal_monitor_auth_key',
--          'Bearer token for the nxtgen-signal-monitor cron job'
--        );
--      Legacy JWT-based service_role, not the newer sb_secret_... key —
--      Edge Functions' built-in verify_jwt check only understands the
--      legacy JWT keys as of this writing; the new key format needs
--      verify_jwt disabled and a different header (apikey, not
--      Authorization) to work, which this function isn't set up for.
--
--   3. Below, replace YOUR-PROJECT-REF with your Supabase project ref
--      (the subdomain in https://YOUR-PROJECT-REF.supabase.co).
--
--   To rotate the key later (e.g. after a key rotation in the
--   dashboard), update Vault instead of touching this file:
--     select vault.update_secret(
--       (select id from vault.secrets where name = 'signal_monitor_auth_key'),
--       'YOUR-NEW-KEY-HERE'
--     );
-- ════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous version of this job before re-creating it, so
-- this file is safe to re-run after changing the interval or URL.
select cron.unschedule(jobid)
from cron.job
where jobname = 'nxtgen-signal-monitor';

select cron.schedule(
  'nxtgen-signal-monitor',
  '10 seconds',  -- pg_cron supports sub-minute schedules via this literal-interval syntax (not standard 5-field cron) — runs 6x/minute instead of once
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/signal-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'signal_monitor_auth_key'
      )
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verify it's scheduled:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'nxtgen-signal-monitor';
--
-- Watch it actually run (last ~20 ticks, with pg_net's own status —
-- NOTE: "succeeded" here only means pg_net completed the HTTP
-- round-trip, NOT that the function returned 200. A 401 will also
-- show as "succeeded" here. For the real HTTP status, check the
-- signal-monitor function's own Invocations tab in the dashboard
-- instead — that's the only place that shows the actual response
-- status code):
--   select cron.job_run_details.* from cron.job_run_details
--   join cron.job using (jobid)
--   where jobname = 'nxtgen-signal-monitor'
--   order by start_time desc limit 20;
--
-- If a signal still isn't triggering after Invocations shows real
-- 200s, check the journal_signals row itself: auto_monitor_enabled
-- must be true (defaults true — see supabase/signals_live_price_schema.sql),
-- and the pair/market must resolve to a symbol Deriv, TradingView's
-- scanner, or Twelve Data recognises (see toDerivSymbol /
-- toTradingViewTicker / toTwelveDataSymbol near the top of
-- signal-monitor/index.ts — Deriv is tried first as of this version).
-- ════════════════════════════════════════════════════════════════
