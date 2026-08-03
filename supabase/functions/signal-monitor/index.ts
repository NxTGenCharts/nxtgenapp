// ══════════════════════════════════════════════════════════════
// supabase/functions/signal-monitor/index.ts
//
// The automatic half of the Signals lifecycle system. Invoked on a
// schedule (pg_cron, every 1 minute by default — see
// supabase/signals_auto_monitor_schema.sql) rather than by the
// browser, so it keeps running whether or not any admin dashboard is
// open, and resumes correctly after a server restart because ALL of
// its state (what's already fired, what hasn't) lives in Postgres,
// never in memory.
//
// What it does, once per tick:
//   1. Load every signal that's still open and has auto-monitoring on.
//   2. Resolve each signal's pair to a vendor symbol and fetch a
//      live quote — ONE upstream call per unique symbol per tick,
//      shared across every signal on that symbol, and short-cached
//      in `market_quote_cache` so overlapping/adjacent ticks don't
//      re-hit the vendor at all. Source priority: Deriv first (same
//      feed the New Signal modal's live price uses — one source of
//      truth end to end), then TradingView, then Twelve Data for
//      anything neither of those could price.
//   3. Evaluate each signal's trigger conditions (pending entry,
//      breakeven RR, TP1, TP2, stop loss) against the live price.
//   4. For any condition newly met: atomically flip the milestone
//      flag (so it can only ever fire once — see the schema notes),
//      write a `journal_signal_updates` row with source:'system' so
//      the timeline can label it "System Update" instead of "Admin",
//      and call the SAME notify-subscribers function the manual
//      "Add Update" flow calls, so push/email/bell notifications are
//      identical either way.
//
// This function NEVER touches the manual Add Update flow or its
// modal — that's still 100% client-side, still writes
// source:'manual' rows, and is completely independent of this file.
//
// Deploy:
//   supabase functions deploy signal-monitor
//
// Secrets (reuses the same ones market-data-proxy/deriv-proxy already need):
//   supabase secrets set TWELVE_DATA_API_KEY=...
//   supabase secrets set DERIV_APP_ID=...  (already set if deriv-proxy is deployed — shared per-project)
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided
//   automatically to every Edge Function — nothing to set.)
//
// Schedule it with pg_cron — see the bottom of
// supabase/signals_auto_monitor_schema.sql for the exact SQL.
// ══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWELVE_DATA_KEY = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
const DERIV_APP_ID = Deno.env.get("DERIV_APP_ID") ?? "";
// Same project secrets are shared across every Edge Function, so if
// deriv-proxy already has DERIV_APP_ID set, this function picks it up
// automatically — nothing extra to configure.
// Same project — call the sibling function directly by URL so this
// keeps working under `supabase functions serve` locally too.
const NOTIFY_URL = `${SUPABASE_URL}/functions/v1/notify-subscribers`;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// How fresh a cached quote must be before we bother re-fetching it.
// Keep this at/under the cron interval — no point caching longer than
// the gap between ticks — but long enough that two signals on the
// same symbol processed microseconds apart never double-fetch.
// NOTE: this MUST be updated together with the cron schedule in
// supabase/signals_auto_monitor_cron.sql — if that file runs every
// 10s but this stays at the old 20s, most ticks just re-serve stale
// cache and skip fetching entirely, silently undoing the point of
// scheduling more often.
const QUOTE_CACHE_TTL_MS = 8_000;

// Only pending order types actually "wait" for price — a market order
// signal that's still 'waiting' is a data-entry mistake, not a real
// pending order, and is self-healed the same way the client already
// self-heals it (see signals.js `_sigInit`).
const PENDING_ORDER_TYPES = new Set(["buy_limit", "sell_limit", "buy_stop", "sell_stop"]);
const OPEN_STATUSES = ["waiting", "active", "partial", "breakeven", "tp1_hit"];

interface SignalRow {
  id: string;
  owner_id: string;
  pair: string;
  market: string;
  direction: "buy" | "sell";
  order_type: string | null;
  entry: number;
  stop_loss: number;
  tp1: number | null;
  tp2: number | null;
  status: string;
  breakeven_rr: number | null;
  entered_at: number | string | null;
  breakeven_at: string | null;
  tp1_hit_at: string | null;
  tp2_hit_at: string | null;
  auto_monitor_enabled: boolean;
}

// ── 1. Symbol resolution ──────────────────────────────────────────
// Best-effort mapping from the DB's plain pair string to a Twelve
// Data symbol. Forex/commodity/crypto pairs are 6-8 char CCY1CCY2
// strings and split cleanly; indices/stocks/synthetics vary too much
// to guess reliably, so they're passed through as-is and simply
// won't resolve if Twelve Data doesn't recognise the raw ticker.
//
// EXTENSION POINT: if you trade synthetic indices (Deriv Boom/Crash/
// Volatility) or want crypto straight from an exchange, add another
// branch here (and a matching fetch* function below) — everything
// downstream just consumes { price, source } and doesn't care where
// it came from.
function toTwelveDataSymbol(pair: string, market: string): string | null {
  const clean = (pair || "").replace(/[\s_]/g, "").toUpperCase();
  if (market === "forex" || market === "crypto" || market === "commodities") {
    if (clean.length === 6) return `${clean.slice(0, 3)}/${clean.slice(3)}`;
    // common crypto quote suffixes longer than 3 chars
    for (const quote of ["USDT", "USDC", "USD", "EUR", "BTC"]) {
      if (clean.endsWith(quote) && clean.length > quote.length) {
        return `${clean.slice(0, clean.length - quote.length)}/${quote}`;
      }
    }
  }
  if (market === "stocks") return clean; // e.g. AAPL
  if (market === "indices") return clean; // e.g. NAS100, US30 — Twelve Data covers some, not all
  return null; // synthetics ("Boom 1000" etc) — not supported by this source yet
}

function symbolCacheKey(market: string, pair: string): string {
  return `${market}:${(pair || "").replace(/[\s_]/g, "").toUpperCase()}`;
}

// The exchange whose actual feed should drive triggers, per market —
// same mapping used for the "recommended feed" in symbol-search, kept
// consistent on purpose so what you picked in the New Signal dropdown
// is the same feed the monitor watches.
const PREFERRED_TV_EXCHANGE: Record<string, string> = {
  forex: "FOREXCOM", commodities: "FOREXCOM", indices: "FOREXCOM",
  crypto: "BINANCE",
};
function toTradingViewTicker(pair: string, market: string): string | null {
  const exchange = PREFERRED_TV_EXCHANGE[market];
  if (!exchange) return null; // stocks/synthetics — no single "recommended feed" to pin here
  const clean = (pair || "").replace(/[\s_]/g, "").toUpperCase();
  if (!clean) return null;
  return `${exchange}:${clean}`;
}

// ── 2. Quote fetching (batched, cached) ───────────────────────────

// FALLBACK source #1: TradingView's public (unofficial) scanner endpoint,
// queried directly against FOREXCOM for forex/metals/indices and
// Binance for crypto — i.e. the actual broker/exchange feed, not a
// third-party aggregated rate. Used only for whatever Deriv (the
// primary source, see fetchDerivPrices above) couldn't price this
// tick — e.g. stocks/synthetics Deriv's public feed doesn't cover, or
// a symbol Deriv's endpoint had a bad moment on. This is the same
// undocumented endpoint class as symbol-search (see that function's
// own notes on the tradeoff) — wrapped the same way: short timeout,
// never throws, and silently yields further down the chain for
// anything it can't resolve either.
async function fetchTradingViewScannerPrices(tickers: string[]): Promise<Record<string, number>> {
  if (!tickers.length) return {};
  const out: Record<string, number> = {};
  const CHUNK = 40;
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const chunk = tickers.slice(i, i + CHUNK);
    try {
      const res = await fetch("https://scanner.tradingview.com/global/scan", {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Origin": "https://www.tradingview.com" },
        body: JSON.stringify({ symbols: { tickers: chunk, query: { types: [] } }, columns: ["close"] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const rows = Array.isArray(json?.data) ? json.data : [];
      for (const row of rows) {
        const sym = row?.s; // e.g. "FOREXCOM:EURUSD"
        const price = Array.isArray(row?.d) ? parseFloat(row.d[0]) : NaN;
        if (sym && !isNaN(price)) out[sym] = price;
      }
    } catch (e) {
      // Expected occasionally — unofficial endpoint, no uptime guarantee.
      console.error("tradingview scanner price fetch failed:", e);
    }
  }
  return out;
}

// PRIMARY source: Deriv — same broker feed the New Signal modal's live
// price already uses (see js/signals.js _sfFetchLivePrice, and the
// 'deriv' entry in REP_SOURCES / js/backtesting-lab.js). Using it here
// too means the price that triggers your TP/SL is the exact same price
// you were looking at when you set them — one source of truth instead
// of "triggered on TradingView's feed but you were watching Deriv's."
//
// KEEP THIS MAPPING IN SYNC with mapPair() in js/backtesting-lab.js —
// duplicated here (rather than imported) because Edge Functions and
// client JS are separate deploy targets, but it MUST resolve pairs to
// the exact same Deriv symbol both places, or your live-price display
// and your actual trigger price could silently drift onto different
// instruments.
const DERIV_INDEX_CODES: Record<string, string> = {
  NAS100: "OTC_NDX", USTECH100: "OTC_NDX", NASDAQ100: "OTC_NDX",
  SPX500: "OTC_SPC", US500: "OTC_SPC", SP500: "OTC_SPC",
  US30: "OTC_DJI", DOW: "OTC_DJI", DJI: "OTC_DJI", WALLSTREET30: "OTC_DJI",
  UK100: "OTC_FTSE", FTSE100: "OTC_FTSE",
  GER40: "OTC_GDAXI", DE40: "OTC_GDAXI", DAX40: "OTC_GDAXI", GERMANY40: "OTC_GDAXI",
  FRA40: "OTC_FCHI", CAC40: "OTC_FCHI", FRANCE40: "OTC_FCHI",
  EU50: "OTC_SX5E", EUSTOXX50: "OTC_SX5E", EURO50: "OTC_SX5E",
  JPN225: "OTC_N225", NIKKEI225: "OTC_N225", JAPAN225: "OTC_N225",
  AUS200: "OTC_AS51", ASX200: "OTC_AS51", AUSTRALIA200: "OTC_AS51",
  HK50: "OTC_HSI", HANGSENG: "OTC_HSI", HONGKONG50: "OTC_HSI",
  NETH25: "OTC_AEX", NETHERLANDS25: "OTC_AEX", AEX: "OTC_AEX",
  SWI20: "OTC_SSMI", SWISS20: "OTC_SSMI", SMI: "OTC_SSMI",
};
function toDerivSymbol(pair: string, market: string): string | null {
  const clean = (pair || "").replace(/[\/\s_]/g, "").toUpperCase();
  if (!clean) return null;
  if (/^(FRX|CRY|OTC_)/.test(clean)) return clean; // already a full Deriv code
  if (market === "crypto") return `CRY${clean}`; // only resolves for BTCUSD/ETHUSD — Deriv genuinely offers nothing else, not a mapping gap
  if (market === "indices") return DERIV_INDEX_CODES[clean] || null;
  if (market === "forex" || market === "commodities") return `frx${clean}`;
  return null; // stocks/synthetics — not on Deriv's public feed, falls through to Twelve Data below
}

// Deriv batches via a single shared WebSocket connection per tick,
// correlating each symbol's response by req_id, rather than one
// connection per symbol — much cheaper and avoids hammering the
// handshake when many signals are open across many symbols at once.
function fetchDerivPrices(symbols: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!symbols.length || !DERIV_APP_ID) return Promise.resolve(out);
  const unique = Array.from(new Set(symbols));
  return new Promise((resolve) => {
    let settled = false;
    let remaining = unique.length;
    const reqIdToSymbol = new Map<number, string>();
    const url = `wss://api.derivws.com/trading/v1/options/ws/public?app_id=${DERIV_APP_ID}`;
    const ws = new WebSocket(url);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(out); // resolve with whatever we got — partial results are fine, caller falls through to TradingView/Twelve Data for the rest
    };
    // Don't let one slow/hanging Deriv connection stall the whole
    // 1-minute tick — 8s is generous for even a full batch.
    const timer = setTimeout(finish, 8000);
    ws.onopen = () => {
      unique.forEach((sym, i) => {
        reqIdToSymbol.set(i, sym);
        ws.send(JSON.stringify({ ticks_history: sym, style: "candles", granularity: 60, count: 1, end: "latest", req_id: i }));
      });
    };
    ws.onmessage = (ev) => {
      if (settled) return;
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "{}");
        const sym = reqIdToSymbol.get(msg.req_id);
        if (sym === undefined) return;
        if (msg.error) {
          console.error(`deriv price fetch failed for ${sym}:`, msg.error.message || msg.error);
        } else if (msg.msg_type === "candles" && Array.isArray(msg.candles) && msg.candles.length) {
          const price = parseFloat(msg.candles[msg.candles.length - 1].close);
          if (!isNaN(price)) out[sym] = price;
        }
        reqIdToSymbol.delete(msg.req_id);
        remaining--;
        if (remaining <= 0) finish();
      } catch (e) {
        console.error("deriv price fetch parse error:", e);
      }
    };
    ws.onerror = () => finish();
    ws.onclose = () => finish();
  });
}

// FALLBACK source #2: Twelve Data — official, always available, but an
// aggregated/interbank-style rate rather than a specific broker's own
// feed. Only used for symbols the scanner couldn't price this tick
// (stocks, synthetics, or if TradingView's endpoint is having a bad
// day) — see resolveQuotes() below for exactly how the two combine.
async function fetchTwelveDataPrices(symbols: string[]): Promise<Record<string, number>> {
  if (!TWELVE_DATA_KEY || !symbols.length) return {};
  const out: Record<string, number> = {};
  // Twelve Data's free tier caps symbols-per-request; chunk to be safe.
  const CHUNK = 25;
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(chunk.join(","))}&apikey=${TWELVE_DATA_KEY}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const json = await res.json();
      if (chunk.length === 1) {
        const p = parseFloat(json?.price);
        if (!isNaN(p)) out[chunk[0]] = p;
      } else {
        for (const sym of chunk) {
          const p = parseFloat(json?.[sym]?.price);
          if (!isNaN(p)) out[sym] = p;
        }
      }
    } catch (e) {
      console.error("twelvedata batch price fetch failed:", e);
    }
  }
  return out;
}

// Resolves a live price for every distinct symbol the open signals
// need, using the shared `market_quote_cache` table first so a burst
// of signals on the same pair only costs one vendor call per tick,
// and adjacent ticks within QUOTE_CACHE_TTL_MS cost zero.
//
// Source priority per symbol: TradingView@FOREXCOM/Binance first (the
// feed you actually trade off), Twelve Data only for whatever that
// didn't resolve. `monitor_source` on the signal row (set in
// evaluateSignal) records exactly which one supplied the price that
// tick, so this is always inspectable, not a black box.
async function resolveQuotes(signals: SignalRow[]): Promise<Map<string, { price: number; source: string }>> {
  const bySymbolKey = new Map<string, { market: string; pair: string; derivSymbol: string | null; tvTicker: string | null; tdSymbol: string | null }>();
  for (const s of signals) {
    const key = symbolCacheKey(s.market, s.pair);
    if (!bySymbolKey.has(key)) {
      bySymbolKey.set(key, {
        market: s.market, pair: s.pair,
        derivSymbol: toDerivSymbol(s.pair, s.market),
        tvTicker: toTradingViewTicker(s.pair, s.market),
        tdSymbol: toTwelveDataSymbol(s.pair, s.market),
      });
    }
  }

  const result = new Map<string, { price: number; source: string }>();
  const keysToFetch: string[] = [];
  const now = Date.now();

  // Serve from cache where still fresh.
  const allKeys = Array.from(bySymbolKey.keys());
  if (allKeys.length) {
    const { data: cached, error } = await sb
      .from("market_quote_cache")
      .select("symbol_key, price, source, fetched_at")
      .in("symbol_key", allKeys);
    if (error) console.error("quote cache read failed:", error.message);
    const freshByKey = new Map((cached || []).map((c) => [c.symbol_key, c]));
    for (const key of allKeys) {
      const hit = freshByKey.get(key);
      if (hit && now - new Date(hit.fetched_at).getTime() < QUOTE_CACHE_TTL_MS) {
        result.set(key, { price: Number(hit.price), source: hit.source });
      } else {
        keysToFetch.push(key);
      }
    }
  }

  if (!keysToFetch.length) return result;

  const upserts: { symbol_key: string; price: number; source: string; fetched_at: string }[] = [];
  const nowIso = new Date().toISOString();

  // Pass 0 — Deriv, the primary source, for every symbol that maps to
  // a real Deriv instrument.
  const derivSymbolByKey = new Map<string, string>();
  for (const key of keysToFetch) {
    const meta = bySymbolKey.get(key)!;
    if (meta.derivSymbol) derivSymbolByKey.set(key, meta.derivSymbol);
  }
  const derivPrices = await fetchDerivPrices(Array.from(new Set(derivSymbolByKey.values())));

  let stillNeeded: string[] = [];
  for (const key of keysToFetch) {
    const symbol = derivSymbolByKey.get(key);
    const price = symbol ? derivPrices[symbol] : undefined;
    if (price !== undefined) {
      result.set(key, { price, source: "deriv" });
      upserts.push({ symbol_key: key, price, source: "deriv", fetched_at: nowIso });
    } else {
      stillNeeded.push(key);
    }
  }

  // Pass 1 — TradingView@FOREXCOM/Binance for whatever Deriv didn't
  // cover (no mapping, or Deriv had a bad moment this tick).
  if (stillNeeded.length) {
    const tvTickerByKey = new Map<string, string>();
    for (const key of stillNeeded) {
      const meta = bySymbolKey.get(key)!;
      if (meta.tvTicker) tvTickerByKey.set(key, meta.tvTicker);
    }
    const tvPrices = await fetchTradingViewScannerPrices(Array.from(new Set(tvTickerByKey.values())));

    const afterTv: string[] = [];
    for (const key of stillNeeded) {
      const ticker = tvTickerByKey.get(key);
      const price = ticker ? tvPrices[ticker] : undefined;
      if (price !== undefined) {
        const source = `tradingview:${ticker!.split(":")[0].toLowerCase()}`; // e.g. "tradingview:forexcom"
        result.set(key, { price, source });
        upserts.push({ symbol_key: key, price, source, fetched_at: nowIso });
      } else {
        afterTv.push(key);
      }
    }
    stillNeeded = afterTv;
  }

  // Pass 2 — Twelve Data, the final fallback, for anything neither
  // Deriv nor TradingView could price this tick.
  if (stillNeeded.length) {
    const tdSymbolByKey = new Map<string, string>();
    for (const key of stillNeeded) {
      const meta = bySymbolKey.get(key)!;
      if (meta.tdSymbol) tdSymbolByKey.set(key, meta.tdSymbol);
    }
    const tdPrices = await fetchTwelveDataPrices(Array.from(new Set(tdSymbolByKey.values())));
    for (const key of stillNeeded) {
      const tdSymbol = tdSymbolByKey.get(key);
      const price = tdSymbol ? tdPrices[tdSymbol] : undefined;
      if (price === undefined) continue; // unresolved this tick — skip, don't crash, try again next minute
      result.set(key, { price, source: "twelvedata" });
      upserts.push({ symbol_key: key, price, source: "twelvedata", fetched_at: nowIso });
    }
  }

  if (upserts.length) {
    const { error } = await sb.from("market_quote_cache").upsert(upserts, { onConflict: "symbol_key" });
    if (error) console.error("quote cache write failed:", error.message);
  }
  return result;
}

// ── 3. Trigger conditions ─────────────────────────────────────────
function isPendingTriggered(s: SignalRow, price: number): boolean {
  switch (s.order_type) {
    case "buy_limit": return price <= s.entry;
    case "buy_stop": return price >= s.entry;
    case "sell_limit": return price >= s.entry;
    case "sell_stop": return price <= s.entry;
    default: return false;
  }
}

function effectiveStop(s: SignalRow): number {
  // Once SL has been auto/manually moved to breakeven, the SL-hit
  // check must protect the real (moved) stop, not the original one —
  // otherwise the monitor would report a loss on a trade that's
  // actually risk-free.
  return s.breakeven_at ? s.entry : s.stop_loss;
}

function isSlHit(s: SignalRow, price: number): boolean {
  const stop = effectiveStop(s);
  return s.direction === "buy" ? price <= stop : price >= stop;
}
function isTp1Hit(s: SignalRow, price: number): boolean {
  if (s.tp1 == null) return false;
  return s.direction === "buy" ? price >= s.tp1 : price <= s.tp1;
}
function isTp2Hit(s: SignalRow, price: number): boolean {
  if (s.tp2 == null) return false;
  return s.direction === "buy" ? price >= s.tp2 : price <= s.tp2;
}
function currentRR(s: SignalRow, price: number): number {
  const riskDist = Math.abs(s.entry - s.stop_loss);
  if (!riskDist) return 0;
  const dir = s.direction === "buy" ? 1 : -1;
  return ((price - s.entry) * dir) / riskDist;
}
function isBreakevenDue(s: SignalRow, price: number): boolean {
  if (s.breakeven_at) return false;
  const threshold = s.breakeven_rr && s.breakeven_rr > 0 ? s.breakeven_rr : 2;
  return currentRR(s, price) >= threshold;
}

// ── 4. Notify (reuses the exact same fan-out used by manual updates) ──
async function broadcast(signalId: string, pair: string, direction: string, eventType: string, message: string) {
  try {
    await fetch(NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ signal_id: signalId, pair, direction, event_type: eventType, message }),
    });
  } catch (e) {
    console.error(`notify-subscribers call failed for ${signalId}:`, e);
  }
}

// Writes the automatic timeline entry. `event_key` + the partial
// unique index in the schema means a second attempt at the SAME
// event for the SAME signal is a harmless no-op (`ignoreDuplicates`),
// not a duplicate row and not a duplicate notification-triggering path
// — we check `data` came back non-empty before broadcasting.
async function logAutoUpdate(signalId: string, status: string | null, eventKey: string, note: string, price: number) {
  const { data, error } = await sb
    .from("journal_signal_updates")
    .upsert(
      { signal_id: signalId, status, note, price, source: "system", event_key: eventKey },
      { onConflict: "signal_id,event_key", ignoreDuplicates: true }
    )
    .select();
  if (error) {
    console.error(`auto update log failed (${signalId}/${eventKey}):`, error.message);
    return false;
  }
  return !!(data && data.length); // false if it was already there (a race lost to another tick)
}

async function logActivity(signalId: string, ownerId: string, detail: string) {
  try {
    await sb.from("journal_signal_activity").insert({ signal_id: signalId, owner_id: ownerId, action: "auto_status_changed", detail });
  } catch (e) {
    console.error("activity log failed:", e);
  }
}

// ── 5. Per-signal evaluation ───────────────────────────────────────
// Each branch performs an ATOMIC conditional UPDATE
// (`.eq(...)` on the very flag being flipped) so that if two
// overlapping ticks both read the same "not yet triggered" signal,
// only one of them actually wins the write — the loser's `data` comes
// back empty and it simply skips logging/notifying. Combined with the
// unique (signal_id, event_key) index, an event can never fire twice.
async function evaluateSignal(s: SignalRow, price: number, source: string) {
  // Always keep the observability columns fresh, regardless of
  // whether any trigger condition fires this tick.
  await sb.from("journal_signals")
    .update({ monitor_last_price: price, monitor_last_checked_at: new Date().toISOString(), monitor_source: source })
    .eq("id", s.id);

  // ── Pending → Ongoing ──────────────────────────────────────────
  if (s.status === "waiting") {
    const isPending = PENDING_ORDER_TYPES.has(s.order_type || "");
    const triggered = isPending ? isPendingTriggered(s, price) : true; // market orders self-heal immediately
    if (!triggered) return;

    const { data } = await sb.from("journal_signals")
      .update({ status: "active", entered_at: new Date().toISOString() })
      .eq("id", s.id).eq("status", "waiting")
      .select("id");
    if (!data || !data.length) return; // lost the race — someone else already advanced it

    const note = isPending ? `✅ Pending order triggered at ${price}.` : `✅ Entry triggered at ${price}.`;
    const wrote = await logAutoUpdate(s.id, "active", "pending_triggered", note, price);
    if (wrote) {
      await logActivity(s.id, s.owner_id, note);
      // Distinct event_type ("entry_triggered" instead of the generic
      // "status_changed") so notify-subscribers can render a proper
      // themed "Entry Triggered" email instead of the generic fallback
      // — see the EmailKind addition in notify-subscribers/index.ts.
      await broadcast(s.id, s.pair, s.direction, "entry_triggered", `${s.pair}: ${note}`);
    }
    return; // one milestone per tick — SL/TP/BE get evaluated on the next tick with fresh entry state
  }

  if (!OPEN_STATUSES.includes(s.status)) return; // already terminal — nothing left to monitor

  // ── Stop Loss hit (checked first — most protective) ─────────────
  if (isSlHit(s, price)) {
    const { data } = await sb.from("journal_signals")
      .update({ status: "stopped_out", result: "loss", closed_at: new Date().toISOString() })
      .eq("id", s.id).in("status", OPEN_STATUSES)
      .select("id");
    if (data && data.length) {
      const note = s.breakeven_at
        ? `🔒 Stop hit at breakeven (${price}) — closed flat.`
        : `🛑 Stop loss hit at ${price}.`;
      const wrote = await logAutoUpdate(s.id, "stopped_out", "sl_hit", note, price);
      if (wrote) {
        await logActivity(s.id, s.owner_id, note);
        await broadcast(s.id, s.pair, s.direction, "status_changed", `${s.pair}: ${note}`);
      }
    }
    return;
  }

  // ── TP2 hit → mark completed (terminal, matches the manual "Close" outcome) ──
  // NOTE: this must write status:"closed" (not "tp2_hit") — "tp2_hit" is a
  // live *stage* the client treats as still "Ongoing"/"Active" (see
  // ONGOING_STATUSES / SIG_LIVE_STATUSES in signals.js), it is never itself
  // a terminal status. Writing "tp2_hit" here left closed_at set but the
  // row still counted as an open/active signal forever — the dashboard
  // kept showing it under Active Signals with an "Ongoing" pill even
  // though the completion email had already gone out. tp2_hit_at is still
  // recorded below so the timeline/stepper keeps showing TP1 → TP2 as
  // reached milestones (see _sigStepReached in signals.js), it's just no
  // longer what determines whether the signal is open or closed.
  if (!s.tp2_hit_at && isTp2Hit(s, price)) {
    const { data } = await sb.from("journal_signals")
      .update({ status: "closed", tp2_hit_at: new Date().toISOString(), result: "win", closed_at: new Date().toISOString() })
      .eq("id", s.id).is("tp2_hit_at", null)
      .select("id");
    if (data && data.length) {
      const note = `🎯 TP2 hit at ${price}. Signal completed.`;
      const wrote = await logAutoUpdate(s.id, "tp2_hit", "tp2_hit", note, price);
      if (wrote) {
        await logActivity(s.id, s.owner_id, note);
        // Explicit "tp2_hit" event_type (not the generic "status_changed")
        // so notify-subscribers renders the "Take Profit 2 Hit" email
        // template regardless of the row's now-"closed" status — see the
        // matching eventType branch added to resolveEmailKind().
        await broadcast(s.id, s.pair, s.direction, "tp2_hit", `${s.pair}: ${note}`);
      }
    }
    return;
  }

  // ── TP1 hit ──────────────────────────────────────────────────────
  if (!s.tp1_hit_at && isTp1Hit(s, price)) {
    const { data } = await sb.from("journal_signals")
      .update({ status: "tp1_hit", tp1_hit_at: new Date().toISOString(), result: "win" })
      .eq("id", s.id).is("tp1_hit_at", null)
      .select("id");
    if (data && data.length) {
      const note = `✅ TP1 hit at ${price}.`;
      const wrote = await logAutoUpdate(s.id, "tp1_hit", "tp1_hit", note, price);
      if (wrote) {
        await logActivity(s.id, s.owner_id, note);
        await broadcast(s.id, s.pair, s.direction, "status_changed", `${s.pair}: ${note}`);
      }
    }
    // fall through — breakeven can still fire in the same tick if both conditions are already true
  }

  // ── Automatic Break Even ────────────────────────────────────────
  if (isBreakevenDue(s, price)) {
    const nextStatus = (s.status === "active" || s.status === "partial") ? "breakeven" : s.status; // don't regress a TP1/TP2 status label
    const { data } = await sb.from("journal_signals")
      .update({ status: nextStatus, breakeven_at: new Date().toISOString() })
      .eq("id", s.id).is("breakeven_at", null)
      .select("id");
    if (data && data.length) {
      const note = `🔒 Stop Loss moved to Break Even at ${price} (${(s.breakeven_rr || 2)}R reached).`;
      const wrote = await logAutoUpdate(s.id, nextStatus, "breakeven", note, price);
      if (wrote) {
        await logActivity(s.id, s.owner_id, note);
        await broadcast(s.id, s.pair, s.direction, "status_changed", `${s.pair}: ${note}`);
      }
    }
  }
}

// ── 6. Handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { data: signals, error } = await sb
      .from("journal_signals")
      .select("id, owner_id, pair, market, direction, order_type, entry, stop_loss, tp1, tp2, status, breakeven_rr, entered_at, breakeven_at, tp1_hit_at, tp2_hit_at, auto_monitor_enabled")
      .eq("auto_monitor_enabled", true)
      .eq("archived", false)
      .eq("is_draft", false)
      .in("status", OPEN_STATUSES);

    if (error) throw error;
    if (!signals || !signals.length) {
      return new Response(JSON.stringify({ ok: true, checked: 0, message: "no open signals" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const quotes = await resolveQuotes(signals as SignalRow[]);

    // Every signal is evaluated independently and defensively — one
    // bad quote or one unexpected error must never take the rest of
    // the batch down with it.
    const results = await Promise.allSettled((signals as SignalRow[]).map(async (s) => {
      const key = symbolCacheKey(s.market, s.pair);
      const quote = quotes.get(key);
      if (!quote) return { id: s.id, skipped: "no quote available" };
      await evaluateSignal(s, quote.price, quote.source);
      return { id: s.id, price: quote.price };
    }));

    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((r) => console.error("signal-monitor: evaluation failed:", (r as PromiseRejectedResult).reason));

    return new Response(JSON.stringify({
      ok: true,
      checked: signals.length,
      quoted: quotes.size,
      failed: failed.length,
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("signal-monitor error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
