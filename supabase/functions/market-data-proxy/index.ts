// Supabase Edge Function: market-data-proxy
// Deploy with:  supabase functions deploy market-data-proxy
//
// Secrets required:
//   TWELVE_DATA_API_KEY   supabase secrets set TWELVE_DATA_API_KEY=your_key_here
//   OANDA_API_KEY         supabase secrets set OANDA_API_KEY=your_oanda_v20_token   (optional — only needed for source:"oanda")
//   OANDA_ENV             "practice" | "live", defaults to "practice"                (optional)
//   (Dukascopy needs no key/secret — it's fetched from Dukascopy's public
//   historical-data servers via the dukascopy-node npm package.)
//
// Purpose: the Chart Replay feature in Backtesting Lab needs historical
// OHLC candles. Twelve Data's free tier is CORS-friendly, but calling it
// straight from the browser would (a) expose the API key in client code
// and (b) burn through the 800-calls/day free limit fast if every user's
// browser hit it directly with no shared caching. This function fixes
// both: the key lives only in Supabase secrets, and identical requests
// within a short window are served from `market_data_cache` instead of
// re-hitting Twelve Data.
//
// Now also supports `source: "dukascopy"` and `source: "oanda"` (defaults
// to "twelvedata" if omitted, so old client calls keep working unchanged).
// Each source's response is cached separately since they carry different
// prices for the same symbol/interval.
//
// Auto-fallback: if the requested source's key isn't set (e.g. no
// OANDA_API_KEY yet) or the vendor call itself fails, the function
// automatically falls through to the next source (oanda -> dukascopy ->
// twelvedata) instead of erroring. The response always reports which
// source was actually used via `source` + `fallback` + `requestedSource`,
// so the client can update its UI to reflect what really loaded.
//
// DB migration needed — add a `source` column to the cache table:
//   alter table market_data_cache add column if not exists source text not null default 'twelvedata';

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHistoricalRates } from "npm:dukascopy-node@1.46.4";

const TWELVE_DATA_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
const OANDA_API_KEY = Deno.env.get("OANDA_API_KEY") ?? "";
const OANDA_ENV = Deno.env.get("OANDA_ENV") || "practice"; // "practice" | "live"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// How long a cached response stays fresh, per source + interval family.
// Intraday intervals change fast during market hours; daily/weekly barely change.
// Dukascopy is historical/free with no rate limit, so it can cache longer;
// OANDA's limits are generous so it refreshes a bit more eagerly.
function cacheTtlMs(interval: string, source: string): number {
  if (source === "dukascopy") {
    if (interval === "d1") return 12 * 60 * 60 * 1000; // 12h
    if (interval === "h1" || interval === "h4") return 60 * 60 * 1000; // 1h
    return 20 * 60 * 1000; // 20min for m1/m5/m15/m30
  }
  if (source === "oanda") {
    if (interval === "D" || interval === "W") return 6 * 60 * 60 * 1000; // 6h
    if (interval === "H1" || interval === "H4") return 30 * 60 * 1000;   // 30min
    return 5 * 60 * 1000; // 5min for M1/M5/M15/M30
  }
  // twelvedata (default)
  if (interval === "1day" || interval === "1week") return 12 * 60 * 60 * 1000; // 12h
  if (interval === "4h" || interval === "1h") return 60 * 60 * 1000;           // 1h
  return 15 * 60 * 1000;                                                       // 15min for anything faster
}

// ── Auto-fallback ────────────────────────────────────────
// If the requested source's key isn't set (or the vendor call
// itself fails), fall through to the next source in this list
// instead of erroring out. Dukascopy needs no key so it's always
// a safe landing spot.
const FALLBACKS: Record<string, string[]> = {
  oanda: ["dukascopy", "twelvedata"],
  twelvedata: ["dukascopy"],
  dukascopy: ["twelvedata"],
};

function sourceAvailable(source: string): boolean {
  if (source === "oanda") return !!OANDA_API_KEY;
  if (source === "twelvedata") return !!TWELVE_DATA_KEY;
  return true; // dukascopy
}

// Symbol/interval formats differ per vendor (EUR/USD vs EUR_USD vs
// eurusd, 1h vs H1 vs h1). To hop sources mid-fallback we go through
// a plain "EURUSD" / canonical-interval-key form and back out.
const INTERVAL_MAP: Record<string, Record<string, string>> = {
  twelvedata: { M1: "1min", M5: "5min", M15: "15min", M30: "30min", H1: "1h", H4: "4h", D1: "1day", W1: "1week" },
  dukascopy:  { M1: "m1", M5: "m5", M15: "m15", M30: "m30", H1: "h1", H4: "h4", D1: "d1", W1: "d1" },
  oanda:      { M1: "M1", M5: "M5", M15: "M15", M30: "M30", H1: "H1", H4: "H4", D1: "D", W1: "W" },
};

function toCanonicalInterval(interval: string, source: string): string {
  const map = INTERVAL_MAP[source] || INTERVAL_MAP.twelvedata;
  const hit = Object.entries(map).find(([, v]) => v === interval);
  return hit ? hit[0] : "H1";
}
function fromCanonicalInterval(canonical: string, source: string): string {
  const map = INTERVAL_MAP[source] || INTERVAL_MAP.twelvedata;
  return map[canonical] || map.H1;
}
function toCanonicalSymbol(symbol: string): string {
  return symbol.replace(/[\/_\s]/g, "").toUpperCase();
}
function fromCanonicalSymbol(canonical: string, source: string): string {
  if (canonical.length !== 6) return canonical; // non-forex symbol — pass through best-effort
  const base = canonical.slice(0, 3), quote = canonical.slice(3);
  if (source === "twelvedata") return `${base}/${quote}`;
  if (source === "oanda") return `${base}_${quote}`;
  if (source === "dukascopy") return `${base}${quote}`.toLowerCase();
  return canonical;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { symbol, interval, outputsize, source: rawSource } = await req.json();
    const requestedSource = rawSource || "twelvedata";
    if (!["twelvedata", "dukascopy", "oanda"].includes(requestedSource)) {
      return new Response(JSON.stringify({ error: `Unknown source "${requestedSource}"` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!symbol || !interval) {
      return new Response(JSON.stringify({ error: "symbol and interval are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const size = Math.min(Math.max(parseInt(outputsize) || 500, 10), 5000);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const chain = [requestedSource, ...(FALLBACKS[requestedSource] || [])];
    const canonicalSymbol = toCanonicalSymbol(symbol);
    const canonicalInterval = toCanonicalInterval(interval, requestedSource);
    const attempts: { source: string; error: string }[] = [];

    for (const src of chain) {
      // symbol/interval are used as-given for the requested source
      // (so any custom/non-forex ticker still passes straight through)
      // and re-derived from the canonical form for fallback hops.
      const srcSymbol = src === requestedSource ? symbol : fromCanonicalSymbol(canonicalSymbol, src);
      const srcInterval = src === requestedSource ? interval : fromCanonicalInterval(canonicalInterval, src);

      if (!sourceAvailable(src)) {
        attempts.push({ source: src, error: `${src === "oanda" ? "OANDA_API_KEY" : "TWELVE_DATA_API_KEY"} secret is not set` });
        continue;
      }

      const cacheKey = `${src}|${srcSymbol}|${srcInterval}|${size}`;
      const { data: cached } = await supabase
        .from("market_data_cache")
        .select("payload, fetched_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < cacheTtlMs(srcInterval, src)) {
        return new Response(JSON.stringify({
          candles: cached.payload, cached: true,
          source: src, symbol: srcSymbol, interval: srcInterval,
          fallback: src !== requestedSource, requestedSource,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      try {
        const candles = src === "dukascopy" ? await fetchDukascopy(srcSymbol, srcInterval, size)
          : src === "oanda" ? await fetchOanda(srcSymbol, srcInterval, size)
          : await fetchTwelveData(srcSymbol, srcInterval, size);

        // Best-effort cache write — don't fail the request if this errors
        await supabase.from("market_data_cache").upsert({
          cache_key: cacheKey, symbol: srcSymbol, interval: srcInterval, source: src,
          payload: candles, fetched_at: new Date().toISOString(),
        });

        return new Response(JSON.stringify({
          candles, cached: false,
          source: src, symbol: srcSymbol, interval: srcInterval,
          fallback: src !== requestedSource, requestedSource,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (vendorErr) {
        attempts.push({ source: src, error: vendorErr.message || `${src} request failed` });
        continue; // try the next source in the chain
      }
    }

    // Every source in the chain failed
    return new Response(JSON.stringify({ error: "All data sources failed", attempts }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Twelve Data ──────────────────────────────────────────
async function fetchTwelveData(symbol: string, interval: string, size: number) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${size}&apikey=${TWELVE_DATA_KEY}`;
  const tdResp = await fetch(url);
  const tdJson = await tdResp.json();

  if (tdJson.status === "error" || tdJson.code) {
    throw new Error(tdJson.message || "Twelve Data request failed");
  }

  const values = tdJson.values || [];
  // Twelve Data returns newest-first — flip to chronological order for the replay engine
  return values
    .map((v: any) => ({
      time: new Date(v.datetime.replace(" ", "T")).getTime(),
      open: parseFloat(v.open), high: parseFloat(v.high),
      low: parseFloat(v.low), close: parseFloat(v.close),
    }))
    .filter((c: any) => !isNaN(c.time) && !isNaN(c.close))
    .reverse();
}

// ── Dukascopy (free, no key — public historical tick data resampled to bars) ──
// Client sends lowercase no-slash symbols (e.g. "eurusd") and dukascopy-node
// timeframe strings (m1/m5/m15/m30/h1/h4/d1) — see REP_SOURCES in app.js.
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

function dukascopyLookbackMs(interval: string, bars: number): number {
  const unitMs: Record<string, number> = {
    m1: 60_000, m5: 5 * 60_000, m15: 15 * 60_000, m30: 30 * 60_000,
    h1: 3_600_000, h4: 4 * 3_600_000, d1: 86_400_000,
  };
  // pad 40% extra to absorb weekends/holidays where there are no candles
  return Math.ceil((unitMs[interval] ?? 3_600_000) * bars * 1.4);
}

// ── OANDA v20 REST API (needs OANDA_API_KEY — free practice account works) ──
// Client sends symbols like "EUR_USD" and granularities like M1/M5/M15/M30/H1/H4/D/W
// — see REP_SOURCES in app.js.
async function fetchOanda(symbol: string, interval: string, size: number) {
  const host = OANDA_ENV === "live" ? "api-fxtrade.oanda.com" : "api-fxpractice.oanda.com";
  const instrument = symbol.toUpperCase().replace("/", "_");
  const url = `https://${host}/v3/instruments/${instrument}/candles?granularity=${interval}&count=${size}&price=M`;

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${OANDA_API_KEY}` } });
  if (!resp.ok) {
    throw new Error(`OANDA error ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();

  return (data.candles || [])
    .filter((c: any) => c.complete)
    .map((c: any) => ({
      time: new Date(c.time).getTime(),
      open: parseFloat(c.mid.o), high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l), close: parseFloat(c.mid.c),
      volume: c.volume,
    }));
}
