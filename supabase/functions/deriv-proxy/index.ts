// Supabase Edge Function: deriv-proxy
// Deploy with:  supabase functions deploy deriv-proxy
//
// Secrets: none required. DERIV_APP_ID is optional — defaults to "1089",
// Deriv's public demo app id, which works for anonymous market-data
// requests (no login, no account, no country-availability restriction —
// unlike OANDA, and no daily-call quota — unlike Twelve Data's free tier).
// If you later register your own Deriv app (recommended for production,
// since the shared 1089 id is rate-limited across everyone using it),
// set your own:
//   supabase secrets set DERIV_APP_ID=your_app_id
//
// This is now the ONLY source used for New Signal's live price (see
// _sfFetchLivePrice in js/signals.js). Twelve Data and Dukascopy are
// intentionally not called from there anymore. They're still used by
// Backtesting Lab's Chart Replay (a separate feature with its own
// Twelve Data / Dukascopy / OANDA source picker) via market-data-proxy
// and dukascopy-proxy — this function doesn't touch those.
//
// Client sends symbols as plain pairs ("EUR/USD", "EURUSD", "gbpusd" —
// anything) and canonical interval keys (m1/m5/m15/m30/h1/h4/d1) — see
// the 'deriv' entry in REP_SOURCES (js/backtesting-lab.js).
//
// Deriv's forex symbols are prefixed "frx" (e.g. "frxEURUSD"), so this
// function normalizes whatever pair format it's given into that form.
//
// Same request/response shape as the other proxies: { candles: {time,
// open,high,low,close}[], cached, source, symbol, interval }.

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DERIV_APP_ID = Deno.env.get("DERIV_APP_ID") || "1089";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deriv has no meaningful rate limit for this use case, but there's no
// reason to open a fresh WebSocket for every 20s poll from every open
// modal either — short cache smooths that out while staying close to live.
function cacheTtlMs(granularitySec: number): number {
  if (granularitySec >= 86400) return 6 * 60 * 60 * 1000;  // 6h for d1
  if (granularitySec >= 3600) return 20 * 60 * 1000;        // 20min for h1/h4
  return 10 * 1000;                                          // 10s for m1/m5/m15/m30 — this is the live-price path
}

const GRANULARITY_SEC: Record<string, number> = {
  m1: 60, m5: 300, m15: 900, m30: 1800, h1: 3600, h4: 14400, d1: 86400,
};

function toDerivSymbol(symbol: string): string {
  let clean = symbol.trim().toUpperCase().replace(/[\/\s_]/g, "");
  if (clean.startsWith("FRX")) clean = clean.slice(3); // strip any case-variant frx prefix so it isn't doubled
  return `frx${clean}`; // Deriv symbol IDs are case-sensitive — lowercase "frx" + uppercase pair, e.g. "frxEURUSD"
}

function fetchDerivCandles(symbol: string, granularitySec: number, count: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Deriv request timed out after 10s")));
    }, 10000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        ticks_history: symbol,
        style: "candles",
        granularity: granularitySec,
        count,
        end: "latest",
      }));
    };

    ws.onmessage = (ev) => {
      if (settled) return;
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "{}");
        if (msg.error) {
          finish(() => reject(new Error(msg.error.message || "Deriv API error")));
          return;
        }
        if (msg.msg_type === "candles" && Array.isArray(msg.candles)) {
          finish(() => resolve(msg.candles));
        }
        // ignore other msg_types (e.g. a stray ping/pong) — keep waiting for candles
      } catch (e) {
        finish(() => reject(e instanceof Error ? e : new Error("Failed to parse Deriv response")));
      }
    };

    ws.onerror = () => {
      finish(() => reject(new Error("Deriv WebSocket connection error")));
    };

    ws.onclose = (ev) => {
      if (!settled) {
        finish(() => reject(new Error(`Deriv closed the connection before responding (code ${ev.code})`)));
      }
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ── Diagnostic mode ──────────────────────────────────────
    // POST { "diagnose": "echo" } to test whether outbound WebSocket
    // connections work AT ALL from this Supabase project, independent
    // of Deriv. Connects to Postman's public echo WS server instead.
    // If THIS also fails, the problem is Supabase's Edge Runtime /
    // egress network in general. If THIS succeeds but Deriv still
    // fails, Deriv is specifically rejecting Supabase's IP range.
    if (body.diagnose === "fetch-deriv") {
      try {
        const testAppId = body.appId || DERIV_APP_ID;
        const url = `https://ws.derivws.com/websockets/v3?app_id=${testAppId}`;
        const resp = await fetch(url, {
          headers: { "Upgrade": "websocket", "Connection": "Upgrade" },
        });
        const text = await resp.text().catch(() => "");
        return new Response(JSON.stringify({
          diagnose: "fetch-deriv", appIdUsed: testAppId, status: resp.status, statusText: resp.statusText,
          headers: Object.fromEntries(resp.headers.entries()),
          bodySnippet: text.slice(0, 500),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (fetchErr) {
        return new Response(JSON.stringify({
          diagnose: "fetch-deriv", ok: false, error: fetchErr.message || String(fetchErr),
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (body.diagnose === "echo") {
      try {
        const echoResult = await new Promise((resolve, reject) => {
          let settled = false;
          const ws = new WebSocket("wss://ws.postman-echo.com/raw");
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch { /* ignore */ }
            reject(new Error("Echo test timed out after 8s"));
          }, 8000);
          ws.onopen = () => ws.send("ping-from-deriv-proxy");
          ws.onmessage = (ev) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { /* ignore */ }
            resolve(ev.data);
          };
          ws.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error("Echo WebSocket connection error"));
          };
        });
        return new Response(JSON.stringify({ diagnose: "echo", ok: true, echoed: echoResult }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (echoErr) {
        return new Response(JSON.stringify({ diagnose: "echo", ok: false, error: echoErr.message || String(echoErr) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // ── End diagnostic mode ──────────────────────────────────

    const { symbol, interval, outputsize } = body;
    if (!symbol || !interval) {
      return new Response(JSON.stringify({ error: "symbol and interval are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const granularitySec = GRANULARITY_SEC[interval] || GRANULARITY_SEC.h1;
    const size = Math.min(Math.max(parseInt(outputsize) || 10, 1), 5000);
    const derivSymbol = toDerivSymbol(symbol);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const cacheKey = `deriv|${derivSymbol}|${interval}|${size}`;
    const { data: cached } = await supabase
      .from("market_data_cache")
      .select("payload, fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < cacheTtlMs(granularitySec)) {
      return new Response(JSON.stringify({
        candles: cached.payload, cached: true,
        source: "deriv", symbol: derivSymbol, interval, fallback: false, requestedSource: "deriv",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      const rawCandles = await fetchDerivCandles(derivSymbol, granularitySec, size);
      const candles = rawCandles
        .map((c: any) => ({
          time: c.epoch * 1000,
          open: parseFloat(c.open), high: parseFloat(c.high),
          low: parseFloat(c.low), close: parseFloat(c.close),
        }))
        .filter((c: any) => !isNaN(c.time) && !isNaN(c.close));

      // Best-effort cache write — don't fail the request if this errors
      await supabase.from("market_data_cache").upsert({
        cache_key: cacheKey, symbol: derivSymbol, interval, source: "deriv",
        payload: candles, fetched_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({
        candles, cached: false,
        source: "deriv", symbol: derivSymbol, interval, fallback: false, requestedSource: "deriv",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (vendorErr) {
      return new Response(JSON.stringify({
        error: "Deriv request failed",
        attempts: [{ source: "deriv", error: vendorErr.message || "deriv request failed" }],
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
