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
-- the deployed function once a minute, forever, with no server or
-- open browser tab required.
--
-- BEFORE RUNNING THIS FILE:
--   1. Deploy the function (only needs doing once, then again after
--      any future edit to signal-monitor/index.ts):
--        supabase functions deploy signal-monitor
--
--   2. Below, replace:
--        YOUR-PROJECT-REF   → your Supabase project ref (the subdomain
--                              in https://YOUR-PROJECT-REF.supabase.co)
--        YOUR-SERVICE-ROLE-KEY → Project Settings → API → service_role
--                                 key (NOT the anon key — this call needs
--                                 to bypass RLS the same way the function
--                                 itself already does via SERVICE_KEY)
--
--   Treat the service role key with the same care as a root password —
--   it's being stored in this SQL, which lives in Postgres itself
--   (readable via pg_cron.job) rather than in Edge Function secrets.
--   If that's a concern, an alternative is to deploy signal-monitor
--   with `--no-verify-jwt` and call it with only the anon key here;
--   the function does its own privileged reads/writes internally via
--   its own SERVICE_KEY regardless of how the request was authorized.
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
  '* * * * *',  -- every minute
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/signal-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verify it's scheduled:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'nxtgen-signal-monitor';
--
-- Watch it actually run (last ~20 ticks, with HTTP status + response):
--   select cron.job_run_details.* from cron.job_run_details
--   join cron.job using (jobid)
--   where jobname = 'nxtgen-signal-monitor'
--   order by start_time desc limit 20;
--
-- If a signal still isn't triggering after this is scheduled and
-- has a few green runs, check on the journal_signals row itself:
--   auto_monitor_enabled must be true (defaults true — see
--   supabase/signals_live_price_schema.sql), and the pair/market
--   must resolve to a symbol either TradingView's scanner or Twelve
--   Data recognises (see toTradingViewTicker / toTwelveDataSymbol
--   near the top of signal-monitor/index.ts).
-- ════════════════════════════════════════════════════════════════
