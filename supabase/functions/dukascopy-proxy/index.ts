// Supabase Edge Function: dukascopy-proxy
// Deploy with:  supabase functions deploy dukascopy-proxy
//
// No secrets required — Dukascopy's historical tick data is public.
//
// Split out of market-data-proxy on purpose. dukascopy-node alone was
// heavy enough to blow that function's free-tier memory limit on
// every cold start, including for requests that never touched
// Dukascopy at all (New Signal live price, signal-monitor, and most
// of Chart Replay all only ever use Twelve Data / OANDA). A dynamic
// import() inside market-data-proxy didn't help either — Supabase's
// bundler still resolves and includes dynamically-imported literal
// specifiers in the deployed artifact, so the package loaded at boot
// regardless of whether it was called that request. Giving Dukascopy
// its own function means its memory cost is fully contained here: if
// this function crashes or gets slow, Twelve Data / OANDA requests
// through market-data-proxy are completely unaffected.
//
// Same request/response shape as market-data-proxy's twelvedata/oanda
// paths (candles: {time,open,high,low,close}[]), source is implicitly
// "dukascopy" — the client doesn't need to pass it.
//
// Client sends lowercase no-slash symbols (e.g. "eurusd") and
// dukascopy-node timeframe strings (m1/m5/m15/m30/h1/h4/d1) — see
// REP_SOURCES in js/backtesting-lab.js.

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHistoricalRates } from "npm:dukascopy-node@1.46.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Dukascopy is historical/free with no rate limit, so it's fine to cache longer.
function cacheTtlMs(interval: string): number {
  if (interval === "d1") return 12 * 60 * 60 * 1000; // 12h
  if (interval === "h1" || interval === "h4") return 60 * 60 * 1000; // 1h
  return 20 * 60 * 1000; // 20min for m1/m5/m15/m30
}

function dukascopyLookbackMs(interval: string, bars: number): number {
  const unitMs: Record<string, number> = {
    m1: 60_000, m5: 5 * 60_000, m15: 15 * 60_000, m30: 30 * 60_000,
    h1: 3_600_000, h4: 4 * 3_600_000, d1: 86_400_000,
  };
  // pad 40% extra to absorb weekends/holidays where there are no candles
  return Math.ceil((unitMs[interval] ?? 3_600_000) * bars * 1.4);
}

async function fetchDukascopy(symbol: string, interval: string, size: number) {
  const instrument = symbol.toLowerCase().replace(/[\/\s]/g, "");
  const to = new Date();
  const from = new Date(to.getTime() - dukascopyLookbackMs(interval, size));

  const rows = await getHistoricalRates({
    instrument,
    dates: { from, to },
    timeframe: interval, // m1 / m5 / m15 / m30 / h1 / h4 / d1
    format: "json",
  });

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`No Dukascopy data for ${instrument}/${interval} — check the symbol is a valid Dukascopy instrument code`);
  }

  // rows: [timestamp, open, high, low, close, volume][]
  return rows.slice(-size).map((r: any[]) => ({
    time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5],
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { symbol, interval, outputsize } = await req.json();
    if (!symbol || !interval) {
      return new Response(JSON.stringify({ error: "symbol and interval are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const size = Math.min(Math.max(parseInt(outputsize) || 500, 10), 5000);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const cacheKey = `dukascopy|${symbol}|${interval}|${size}`;
    const { data: cached } = await supabase
      .from("market_data_cache")
      .select("payload, fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < cacheTtlMs(interval)) {
      return new Response(JSON.stringify({
        candles: cached.payload, cached: true,
        source: "dukascopy", symbol, interval, fallback: false, requestedSource: "dukascopy",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      const candles = await fetchDukascopy(symbol, interval, size);

      // Best-effort cache write — don't fail the request if this errors
      await supabase.from("market_data_cache").upsert({
        cache_key: cacheKey, symbol, interval, source: "dukascopy",
        payload: candles, fetched_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({
        candles, cached: false,
        source: "dukascopy", symbol, interval, fallback: false, requestedSource: "dukascopy",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (vendorErr) {
      return new Response(JSON.stringify({
        error: "Dukascopy request failed",
        attempts: [{ source: "dukascopy", error: vendorErr.message || "dukascopy request failed" }],
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
