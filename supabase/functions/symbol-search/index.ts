// ══════════════════════════════════════════════════════════════
// supabase/functions/symbol-search/index.ts
//
// Powers the Pair field autocomplete in the New Signal modal.
//
// Two sources, deliberately layered so the feature can never go
// fully dark:
//
//   1. Twelve Data /symbol_search — OFFICIAL, uses the same
//      TWELVE_DATA_API_KEY secret market-data-proxy already needs.
//      This is the reliable backbone: if everything else fails, you
//      still get a usable symbol list.
//
//   2. TradingView's public (UNOFFICIAL, undocumented) symbol-search
//      endpoint — this is what gives you the "pick your broker feed"
//      experience from the screenshots (FOREXCOM, OANDA, Binance,
//      Coinbase, etc. all listed per instrument). It is wrapped in
//      its own try/catch with a short timeout and NEVER allowed to
//      fail the request — if TradingView changes/blocks this
//      endpoint tomorrow, symbol search keeps working on Twelve Data
//      alone, just without the broker picker. `tv_available: false`
//      in the response tells the client that happened, so the UI can
//      quietly hide the "more sources" affordance instead of showing
//      a broken one.
//
// Results are cached for 5 minutes per (market, query) in
// `symbol_search_cache` — see supabase/symbol_search_schema.sql —
// which also means the fragile TradingView call happens far less
// often than every keystroke.
//
// Deploy:
//   supabase functions deploy symbol-search
// ══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWELVE_DATA_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_MS = 5 * 60 * 1000;

// The "recommended feed" per ASSET TYPE (not per the Market dropdown's
// current value — see the note below on why that distinction matters):
// FOREXCOM for forex/metals/indices, Binance for crypto.
const PREFERRED_EXCHANGE_BY_TYPE: Record<string, string> = {
  forex: "FOREXCOM", cfd: "FOREXCOM", index: "FOREXCOM", commodity: "FOREXCOM",
  crypto: "BINANCE",
};

interface UnifiedResult {
  symbol: string;          // clean ticker, e.g. "EURUSD"
  description: string;
  exchange: string | null;
  type: string | null;     // best-effort: forex | crypto | stock | index | commodity | cfd | ...
  country: string | null;
  source: "twelvedata" | "tradingview";
  preferred: boolean;
}

function stripHtml(s: unknown): string {
  return typeof s === "string" ? s.replace(/<[^>]+>/g, "") : "";
}
function normSymbol(s: unknown): string {
  return typeof s === "string" ? s.replace(/[\/\s]/g, "").toUpperCase() : "";
}

// Twelve Data's `instrument_type` is a human-readable label ("Digital
// Currency", "Physical Currency", "Common Stock", "ETF", ...), not
// the short vocabulary ("crypto", "forex", "stock", ...) used
// everywhere else in this function and on the client. Without this
// normalization, every Twelve Data row's type would silently fail to
// match PREFERRED_EXCHANGE_BY_TYPE and SEARCH_TYPE_TO_MARKET on the
// client — same bug as the market-dropdown one, just from the other
// data source, so both are fixed together here.
function normTwelveDataType(raw: string): string | null {
  const s = (raw || "").toLowerCase();
  if (s.includes("digital currency") || s.includes("crypto")) return "crypto";
  if (s.includes("physical currency") || s.includes("forex")) return "forex";
  if (s.includes("index")) return "index";
  if (s.includes("commodity")) return "commodity";
  if (s.includes("stock") || s.includes("equity")) return "stock";
  if (s.includes("etf") || s.includes("fund") || s.includes("trust")) return "fund";
  return s || null;
}

// ── Source 1: Twelve Data (official) ──────────────────────────────
async function fetchTwelveData(query: string): Promise<UnifiedResult[]> {
  if (!TWELVE_DATA_KEY) return [];
  try {
    const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=15&apikey=${TWELVE_DATA_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows.map((r: any) => ({
      symbol: normSymbol(r.symbol),
      description: r.instrument_name || r.symbol || "",
      exchange: r.exchange || r.mic_code || null,
      type: normTwelveDataType(r.instrument_type),
      country: r.country || null,
      source: "twelvedata" as const,
      preferred: false,
    })).filter((r: UnifiedResult) => r.symbol);
  } catch (e) {
    console.error("twelvedata symbol_search failed:", e);
    return [];
  }
}

// ── Source 2: TradingView (unofficial — best-effort only) ─────────
async function fetchTradingView(query: string): Promise<{ results: UnifiedResult[]; available: boolean }> {
  try {
    const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(query)}&hl=1&exchange=&lang=en&search_type=undefined&domain=production&sort_by_country=US`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "Mozilla/5.0", "Origin": "https://www.tradingview.com", "Referer": "https://www.tradingview.com/" },
    });
    if (!res.ok) return { results: [], available: false };
    const json = await res.json();
    // Response shape has varied across TV versions — accept either a
    // bare array or an object with a `symbols` array, and tolerate
    // unexpected shapes by just returning nothing rather than throwing.
    const rows = Array.isArray(json) ? json : Array.isArray(json?.symbols) ? json.symbols : [];
    const results: UnifiedResult[] = rows.map((r: any) => ({
      symbol: normSymbol(stripHtml(r.symbol)),
      description: stripHtml(r.description),
      exchange: (r.exchange || r.provider_id || "").toString().toUpperCase() || null,
      type: (r.type || "").toLowerCase() || null,
      country: r.country || null,
      source: "tradingview" as const,
      preferred: false,
    })).filter((r: UnifiedResult) => r.symbol);
    return { results, available: true };
  } catch (e) {
    // Expected occasionally — this endpoint is unofficial and not
    // guaranteed. Never let this take the whole search down.
    console.error("tradingview symbol_search unavailable:", e);
    return { results: [], available: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { query, market } = await req.json();
    const q = (query || "").toString().trim();
    if (q.length < 1) {
      return new Response(JSON.stringify({ query: q, results: [], tv_available: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // `market` (whatever the Market dropdown currently shows) is
    // recorded for the response payload but deliberately NOT used to
    // decide which result gets pinned as "recommended" — a person
    // often hasn't switched Market to Crypto yet when they start
    // typing a crypto ticker (it may still say "Forex" from the
    // previous signal), and an instrument like BTCUSD genuinely
    // exists as BOTH a Binance crypto pair AND a FOREXCOM CFD. Basing
    // the recommendation on the dropdown's stale value pinned the
    // wrong one and left Market stuck on Forex even after picking a
    // crypto result. Each row's own type decides its own
    // recommendation instead — see PREFERRED_EXCHANGE_BY_TYPE.
    const cacheKey = q.toLowerCase();

    const { data: cached } = await sb
      .from("symbol_search_cache")
      .select("results, tv_available, fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      return new Response(JSON.stringify({ query: q, market, results: cached.results, tv_available: cached.tv_available, cached: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Both sources are fetched in parallel — a slow/failed TradingView
    // call never delays the Twelve Data results beyond its own timeout.
    const [tdResults, tv] = await Promise.all([fetchTwelveData(q), fetchTradingView(q)]);

    const merged = [...tdResults, ...tv.results].map((r) => {
      const wantExchange = r.type ? PREFERRED_EXCHANGE_BY_TYPE[r.type] : null;
      return { ...r, preferred: !!wantExchange && r.exchange === wantExchange };
    });

    // Preferred broker feed(s) first — note a single ambiguous ticker
    // can legitimately produce MORE THAN ONE preferred row now (e.g.
    // BTCUSD@BINANCE as crypto AND BTCUSD@FOREXCOM as a forex CFD),
    // which is correct: they're different instruments and the person
    // should be able to tell them apart and pick the one they mean,
    // rather than the tool silently guessing. Then the rest of
    // TradingView's multi-broker list, then Twelve Data as the
    // reliable fallback set. De-dupe on symbol+exchange+source so the
    // same instrument from the same place never appears twice.
    const seen = new Set<string>();
    const deduped: UnifiedResult[] = [];
    for (const r of [
      ...merged.filter((r) => r.preferred),
      ...merged.filter((r) => !r.preferred && r.source === "tradingview"),
      ...merged.filter((r) => !r.preferred && r.source === "twelvedata"),
    ]) {
      const key = `${r.symbol}|${r.exchange}|${r.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    const results = deduped.slice(0, 40);

    await sb.from("symbol_search_cache").upsert({
      cache_key: cacheKey, results, tv_available: tv.available, fetched_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ query: q, market, results, tv_available: tv.available, cached: false }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("symbol-search error:", e);
    // Even on a hard failure, return 200 with an empty result set —
    // this field must never block a user from just typing a symbol
    // manually, so the client always gets JSON it can render.
    return new Response(JSON.stringify({ results: [], tv_available: false, error: String(e) }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
