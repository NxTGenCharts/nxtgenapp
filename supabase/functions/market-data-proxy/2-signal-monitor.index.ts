// ══════════════════════════════════════════════════════════════
// MOVED — this file has been relocated to its own deployable
// function folder: supabase/functions/signal-monitor/index.ts
//
// Why: the Supabase CLI deploys one Edge Function per top-level
// folder under supabase/functions/, using the folder name as the
// function name and requiring an index.ts inside it. This file
// was sitting inside the market-data-proxy/ folder under a
// non-standard filename, so `supabase functions deploy
// market-data-proxy` never picked it up — nothing was ever
// deploying the signal-monitor logic, which is why pending
// signals were never auto-triggering no matter how long the
// price sat past entry.
//
// This copy is kept only so old links/notes pointing here don't
// 404 silently. Deploy from the new location:
//   supabase functions deploy signal-monitor
// Then schedule it — see supabase/signals_auto_monitor_cron.sql.
// ══════════════════════════════════════════════════════════════
