// ═══════════════════════════════════════════════════════════
// TradingView Advanced Charting Library — Datafeed + Replay Engine
// ═══════════════════════════════════════════════════════════
// Wires the real TradingView chart to your existing data layer:
//   - _repFetchCandles(symbol, interval, outputsize, source)
//   - REP_SOURCES (twelvedata / dukascopy / oanda)
//   - _repMapIntervalForSource(tf, sourceId)
//
// Drop this file in alongside charting_library/ once you have
// library access. It does NOT require any changes to your Edge
// Function (market-data-proxy) — it just calls the same function
// your Lightweight Charts code already calls.
//
// Replay works by keeping a virtual "clock" per symbol/resolution.
// getBars() only ever returns bars up to that clock. subscribeBars()
// stores a callback; your existing play/step/scrub controls call
// TVReplay.step()/TVReplay.jumpTo() which push the next bar into
// that callback — so the real chart updates exactly like a live feed,
// even though the data is historical.
// ═══════════════════════════════════════════════════════════

// ── Resolution mapping: TradingView resolution codes <-> your source intervals ──
// TV resolutions are minutes as strings ("1","5","15","30","60","240"),
// or "1D","1W","1M" for daily+.
const TV_RESOLUTION_MAP = {
  '1': '1min', '5': '5min', '15': '15min', '30': '30min',
  '60': '1h', '240': '4h', '1D': '1day', '1W': '1week',
};
const TV_SUPPORTED_RESOLUTIONS = ['1', '5', '15', '30', '60', '240', '1D', '1W'];

function tvResolutionToSourceInterval(resolution, sourceId) {
  const legacyKey = TV_RESOLUTION_MAP[resolution] || '1h';
  // Reuse your existing per-source interval table by piggybacking on
  // _repMapIntervalForSource, which expects an "H1"-style tf string —
  // so we translate the legacy TD-style key back to that shorthand first.
  const legacyToShorthand = {
    '1min': 'M1', '5min': 'M5', '15min': 'M15', '30min': 'M30',
    '1h': 'H1', '4h': 'H4', '1day': 'D1', '1week': 'W1',
  };
  return _repMapIntervalForSource(legacyToShorthand[legacyKey] || 'H1', sourceId);
}

// ── A small symbol catalog for the search dialog ──────────────
// Extend this freely — resolveSymbol() below works for anything
// typed even if it's not in this list, this just powers the
// "browse popular / forex / crypto / synthetic" search tabs.
const TV_SYMBOL_CATALOG = [
  { symbol: 'EUR/USD', full_name: 'EUR/USD', description: 'Euro / US Dollar', type: 'forex', exchange: 'FX' },
  { symbol: 'GBP/USD', full_name: 'GBP/USD', description: 'British Pound / US Dollar', type: 'forex', exchange: 'FX' },
  { symbol: 'USD/JPY', full_name: 'USD/JPY', description: 'US Dollar / Japanese Yen', type: 'forex', exchange: 'FX' },
  { symbol: 'XAU/USD', full_name: 'XAU/USD', description: 'Gold Spot / US Dollar', type: 'forex', exchange: 'FX' },
  { symbol: 'NAS100', full_name: 'NAS100', description: 'Nasdaq 100 Index', type: 'index', exchange: 'INDEX' },
  { symbol: 'US30', full_name: 'US30', description: 'Dow Jones Industrial Average', type: 'index', exchange: 'INDEX' },
  { symbol: 'BTC/USD', full_name: 'BTC/USD', description: 'Bitcoin / US Dollar', type: 'crypto', exchange: 'CRYPTO' },
  { symbol: 'CRASH500', full_name: 'Crash 500 Index', description: 'Synthetic Index', type: 'synthetic', exchange: 'SYNTH' },
  { symbol: 'BOOM1000', full_name: 'Boom 1000 Index', description: 'Synthetic Index', type: 'synthetic', exchange: 'SYNTH' },
  { symbol: 'VOL75', full_name: 'Volatility 75 Index', description: 'Synthetic Index', type: 'synthetic', exchange: 'SYNTH' },
];

// ── Replay engine ──────────────────────────────────────────────
// One instance lives on _repState (created alongside your existing
// replay state). It doesn't replace _repState.index — it *is*
// _repState.index, exposed in the shape the Datafeed needs.
class TVReplayEngine {
  constructor() {
    this.bars = [];          // full historical set for the active symbol/res, ms-time
    this.cursor = -1;        // index of the last bar considered "revealed"
    this.tickCallback = null;
    this.subscriberUID = null;
  }

  setBars(bars, cursor) {
    this.bars = bars;
    this.cursor = cursor ?? bars.length - 1;
  }

  visibleBars() {
    return this.bars.slice(0, this.cursor + 1);
  }

  // Called by your existing _repStep(1)/_repStep(-1)/_repScrubProgress()
  step(delta) {
    const next = Math.max(0, Math.min(this.bars.length - 1, this.cursor + delta));
    if (next === this.cursor) return;
    this.cursor = next;
    this._pushCurrentBar();
  }

  jumpTo(index) {
    this.cursor = Math.max(0, Math.min(this.bars.length - 1, index));
    this._pushCurrentBar();
  }

  _pushCurrentBar() {
    if (!this.tickCallback || this.cursor < 0) return;
    const c = this.bars[this.cursor];
    this.tickCallback({
      time: c.time, open: c.open, high: c.high, low: c.low,
      close: c.close, volume: c.volume || 0,
    });
  }
}
const TVReplay = new TVReplayEngine();
window.TVReplay = TVReplay; // exposed so your existing rep-* controls can call TVReplay.step(±1) etc.

// ── The Datafeed object itself ──────────────────────────────────
const TVDatafeed = {
  onReady(callback) {
    setTimeout(() => callback({
      supported_resolutions: TV_SUPPORTED_RESOLUTIONS,
      supports_marks: false,
      supports_timescale_marks: false,
      supports_time: true,
    }), 0);
  },

  searchSymbols(userInput, exchange, symbolType, onResultReadyCallback) {
    const q = (userInput || '').trim().toUpperCase();
    const results = TV_SYMBOL_CATALOG
      .filter(s => !q || s.symbol.toUpperCase().includes(q) || s.description.toUpperCase().includes(q))
      .filter(s => !symbolType || symbolType === 'all' || s.type === symbolType)
      .map(s => ({
        symbol: s.symbol, full_name: s.full_name, description: s.description,
        exchange: s.exchange, ticker: s.symbol, type: s.type,
      }));
    onResultReadyCallback(results);
  },

  resolveSymbol(symbolName, onSymbolResolvedCallback, onResolveErrorCallback) {
    const source = (window._repState && _repState.source) || 'twelvedata';
    const catalogEntry = TV_SYMBOL_CATALOG.find(s => s.symbol === symbolName);
    const symbolInfo = {
      ticker: symbolName,
      name: symbolName,
      description: catalogEntry?.description || symbolName,
      type: catalogEntry?.type || 'forex',
      session: '24x7',
      timezone: 'Etc/UTC',
      exchange: catalogEntry?.exchange || _repGetSource(source).label,
      minmov: 1,
      pricescale: /JPY/i.test(symbolName) ? 1000 : 100000,
      has_intraday: true,
      has_weekly_and_monthly: true,
      supported_resolutions: TV_SUPPORTED_RESOLUTIONS,
      volume_precision: 0,
      data_status: 'streaming',
    };
    setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0);
  },

  // getBars is where replay's "no peeking at future bars" rule is enforced.
  // Every request — regardless of what range the chart asks for — is
  // capped at TVReplay.cursor so scrubbing/zooming can never reveal bars
  // beyond the current replay position.
  async getBars(symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) {
    try {
      const source = (window._repState && _repState.source) || 'twelvedata';
      const interval = tvResolutionToSourceInterval(resolution, source);
      const result = await _repFetchCandles(symbolInfo.ticker, interval, 5000, source);
      const candles = result.candles || [];
      if (!candles.length) {
        onHistoryCallback([], { noData: true });
        return;
      }

      // Only (re)seed the replay engine's full bar set on the first
      // request for this symbol/resolution, so stepping/scrubbing later
      // doesn't refetch or reset your place.
      if (TVReplay.bars !== candles) {
        const seedCursor = (window._repState && _repState._savedIndex != null)
          ? _repState._savedIndex
          : candles.length - 1;
        TVReplay.setBars(candles, seedCursor);
      }

      const visible = TVReplay.visibleBars();
      const bars = visible
        .filter(c => periodParams.firstDataRequest || (c.time / 1000) >= periodParams.from)
        .map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }));

      onHistoryCallback(bars, { noData: bars.length === 0 });
    } catch (err) {
      onErrorCallback(err.message || 'getBars failed');
    }
  },

  subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID) {
    TVReplay.tickCallback = onRealtimeCallback;
    TVReplay.subscriberUID = subscriberUID;
  },

  unsubscribeBars(subscriberUID) {
    if (TVReplay.subscriberUID === subscriberUID) {
      TVReplay.tickCallback = null;
      TVReplay.subscriberUID = null;
    }
  },
};

window.TVDatafeed = TVDatafeed;
