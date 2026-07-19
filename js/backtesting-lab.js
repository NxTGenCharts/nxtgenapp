// ══ NxTGen Journal — backtesting-lab.js (original app.js lines 10165-12694) ══

// ── TRADE ENTRY MODAL (Trade Simulator, Section 4/5) ────
function _openTradeEntryModal(sessionId, tradeId, prefill) {
  const session = _btGetSessionById(sessionId); if (!session) return;
  const isNew = !tradeId;
  const t = isNew ? {
    direction: (prefill && prefill.direction) || 'buy',
    entry_price: (prefill && prefill.entry_price) || '',
    exit_price: '', stop_price: '',
    rr: '', pnl: '',
    entry_time: (prefill && prefill.entry_time) || '', exit_time: '', data: {},
  } : _btTrades.find(x => x.id === tradeId);
  if (!t) return;
  const d = t.data || {};

  const existing = document.getElementById('bt-trade-edit-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'bt-trade-edit-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.style.zIndex = '1100';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const screenshotSlots = ['before', 'entry', 'exit', 'marked'].map(key => {
    const url = d.screenshots?.[key];
    return `<div class="bt-screenshot-slot${url ? ' filled' : ''}" id="bt-shot-${key}" style="${url ? `background-image:url('${url}')` : ''}" onclick="document.getElementById('bt-shot-input-${key}').click()">
      <span>${key[0].toUpperCase() + key.slice(1)}</span>
      <input type="file" accept="image/*" id="bt-shot-input-${key}" style="display:none" onchange="_btHandleScreenshotPick(this,'${key}')">
    </div>`;
  }).join('');

  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:640px;max-height:90vh">
    <div class="acc-manager-header">
      <span>${isNew ? '＋ Log Simulated Trade' : 'Edit Trade'}</span>
      <button onclick="document.getElementById('bt-trade-edit-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="display:flex;flex-direction:column;gap:12px;padding:16px;overflow-y:auto">

      <div style="display:flex;gap:8px">
        <button type="button" id="bt-dir-buy" class="wl-week-btn${t.direction !== 'sell' ? ' restore' : ''}" onclick="_btSetDirection('buy')" style="flex:1">Buy / Long</button>
        <button type="button" id="bt-dir-sell" class="wl-week-btn${t.direction === 'sell' ? ' danger' : ''}" onclick="_btSetDirection('sell')" style="flex:1">Sell / Short</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div><label class="bl-lbl">Entry Price</label><input type="number" step="any" id="bt-t-entry" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${t.entry_price ?? ''}" oninput="_btAutoCalc()"></div>
        <div><label class="bl-lbl">Stop Price</label><input type="number" step="any" id="bt-t-stop" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${t.stop_price ?? ''}" oninput="_btAutoCalc()"></div>
        <div><label class="bl-lbl">Exit Price</label><input type="number" step="any" id="bt-t-exit" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${t.exit_price ?? ''}" oninput="_btAutoCalc()"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="bl-lbl">RR <span class="bl-lbl-sub">(auto, editable)</span></label><input type="number" step="any" id="bt-t-rr" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${t.rr ?? ''}"></div>
        <div><label class="bl-lbl">P/L $ <span class="bl-lbl-sub">(auto, editable)</span></label><input type="number" step="any" id="bt-t-pnl" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${t.pnl ?? ''}"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="bl-lbl">Entry Time</label><input type="datetime-local" id="bt-t-entrytime" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${t.entry_time ? t.entry_time.slice(0, 16) : ''}"></div>
        <div><label class="bl-lbl">Exit Time</label><input type="datetime-local" id="bt-t-exittime" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${t.exit_time ? t.exit_time.slice(0, 16) : ''}"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="bl-lbl">MFE <span class="bl-lbl-sub">(R units)</span></label><input type="number" step="any" id="bt-t-mfe" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${d.mfe ?? ''}"></div>
        <div><label class="bl-lbl">MAE <span class="bl-lbl-sub">(R units)</span></label><input type="number" step="any" id="bt-t-mae" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${d.mae ?? ''}"></div>
      </div>

      <div><label class="bl-lbl">Reason for Entry</label><textarea id="bt-t-reasonentry" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${d.reasonEntry || ''}</textarea></div>
      <div><label class="bl-lbl">Reason for Exit</label><textarea id="bt-t-reasonexit" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${d.reasonExit || ''}</textarea></div>
      <div><label class="bl-lbl">Mistakes <span class="bl-lbl-sub">(one per line)</span></label><textarea id="bt-t-mistakes" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${(d.mistakes || []).join('\n')}</textarea></div>
      <div><label class="bl-lbl">Psychology</label><textarea id="bt-t-psych" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${d.psychology || ''}</textarea></div>

      <div class="bt-rating-row">
        <div><label class="bl-lbl">Confidence <span class="bl-lbl-sub">1-10</span></label><input type="number" min="1" max="10" id="bt-t-conf" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${d.confidenceLevel ?? ''}"></div>
        <div><label class="bl-lbl">Execution <span class="bl-lbl-sub">1-10</span></label><input type="number" min="1" max="10" id="bt-t-exec" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${d.executionRating ?? ''}"></div>
        <div><label class="bl-lbl">Discipline <span class="bl-lbl-sub">1-10</span></label><input type="number" min="1" max="10" id="bt-t-disc" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${d.disciplineRating ?? ''}"></div>
      </div>

      <div><label class="bl-lbl">Screenshots</label><div class="bt-screenshot-row" id="bt-shot-row">${screenshotSlots}</div></div>
      <div><label class="bl-lbl">Notes</label><textarea id="bt-t-notes" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${d.notes || ''}</textarea></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        ${!isNew ? `<button onclick="_btDeleteTradeConfirm('${sessionId}','${t.id}')" class="acc-mgr-btn del" style="padding:6px 14px;margin-right:auto"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Delete</button>` : ''}
        <button onclick="document.getElementById('bt-trade-edit-overlay').remove()" class="acc-mgr-btn" style="padding:6px 14px">Cancel</button>
        <button onclick="_btSaveTradeModal('${sessionId}', '${isNew ? '' : t.id}')" class="acc-mgr-add-btn" style="padding:6px 18px">Save Trade</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  overlay._btDirection = t.direction || 'buy';
  overlay._btScreenshots = { ...(d.screenshots || {}) };
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function _btSetDirection(dir) {
  const overlay = document.getElementById('bt-trade-edit-overlay');
  if (overlay) overlay._btDirection = dir;
  document.getElementById('bt-dir-buy')?.classList.toggle('restore', dir === 'buy');
  document.getElementById('bt-dir-sell')?.classList.toggle('danger', dir === 'sell');
  _btAutoCalc();
}

/* Suggest RR from entry/stop/exit — trader can still override manually. */
function _btAutoCalc() {
  const overlay = document.getElementById('bt-trade-edit-overlay'); if (!overlay) return;
  const dir = overlay._btDirection || 'buy';
  const entry = parseFloat(document.getElementById('bt-t-entry')?.value);
  const stop = parseFloat(document.getElementById('bt-t-stop')?.value);
  const exit = parseFloat(document.getElementById('bt-t-exit')?.value);
  if (isNaN(entry) || isNaN(stop) || isNaN(exit)) return;

  const risk = dir === 'buy' ? entry - stop : stop - entry;
  const reward = dir === 'buy' ? exit - entry : entry - exit;
  if (risk <= 0) return;
  const rr = reward / risk;
  const rrField = document.getElementById('bt-t-rr');
  if (rrField) rrField.value = Math.round(rr * 100) / 100;
}

async function _btHandleScreenshotPick(input, key) {
  const file = input.files?.[0]; if (!file) return;
  const slot = document.getElementById('bt-shot-' + key);
  if (slot) { slot.querySelector('span').textContent = 'Uploading…'; }
  const url = await _btUploadScreenshot(file);
  if (!url) { showToast('Screenshot upload failed', 'danger'); return; }
  const overlay = document.getElementById('bt-trade-edit-overlay');
  if (overlay) { overlay._btScreenshots = overlay._btScreenshots || {}; overlay._btScreenshots[key] = url; }
  if (slot) { slot.style.backgroundImage = `url('${url}')`; slot.classList.add('filled'); }
}

async function _btSaveTradeModal(sessionId, tradeId) {
  const session = _btGetSessionById(sessionId); if (!session) return;
  const overlay = document.getElementById('bt-trade-edit-overlay');
  const direction = overlay?._btDirection || 'buy';

  const entryTimeRaw = document.getElementById('bt-t-entrytime')?.value;
  const exitTimeRaw = document.getElementById('bt-t-exittime')?.value;
  const mistakesRaw = document.getElementById('bt-t-mistakes')?.value || '';

  const trade = {
    id: tradeId || null,
    session_id: sessionId,
    strategy_id: session.strategyId || null,
    direction,
    entry_price: parseFloat(document.getElementById('bt-t-entry')?.value) || null,
    stop_price: parseFloat(document.getElementById('bt-t-stop')?.value) || null,
    exit_price: parseFloat(document.getElementById('bt-t-exit')?.value) || null,
    rr: parseFloat(document.getElementById('bt-t-rr')?.value) || 0,
    pnl: parseFloat(document.getElementById('bt-t-pnl')?.value) || 0,
    entry_time: entryTimeRaw ? new Date(entryTimeRaw).toISOString() : null,
    exit_time: exitTimeRaw ? new Date(exitTimeRaw).toISOString() : null,
    data: {
      mfe: document.getElementById('bt-t-mfe')?.value || '',
      mae: document.getElementById('bt-t-mae')?.value || '',
      reasonEntry: document.getElementById('bt-t-reasonentry')?.value.trim() || '',
      reasonExit: document.getElementById('bt-t-reasonexit')?.value.trim() || '',
      mistakes: mistakesRaw.split('\n').map(x => x.trim()).filter(Boolean),
      psychology: document.getElementById('bt-t-psych')?.value.trim() || '',
      confidenceLevel: document.getElementById('bt-t-conf')?.value || '',
      executionRating: document.getElementById('bt-t-exec')?.value || '',
      disciplineRating: document.getElementById('bt-t-disc')?.value || '',
      notes: document.getElementById('bt-t-notes')?.value.trim() || '',
      screenshots: overlay?._btScreenshots || {},
    },
  };

  const savedId = await _btSaveTrade(trade);
  if (!savedId) return;

  document.getElementById('bt-trade-edit-overlay')?.remove();
  _btRenderSessionDetail(sessionId);
  _btRenderSessionGrid();
  buildBacktestingLab(); // refresh strategy stats since they roll up from trades
  _blRenderGalleryControls(); _blRenderGallery(); _blRenderComparisonTable();
  showToast(tradeId ? 'Trade updated ✓' : 'Trade logged ✓', 'restore');
}

function _btDeleteTradeConfirm(sessionId, tradeId) {
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>',
    title: 'Delete Trade?',
    body: 'This simulated trade will be permanently removed from the session.',
    confirmLabel: 'Delete Trade',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      await _btDeleteTrade(tradeId);
      document.getElementById('bt-trade-edit-overlay')?.remove();
      _btRenderSessionDetail(sessionId);
      _btRenderSessionGrid();
      buildBacktestingLab();
      _blRenderGalleryControls(); _blRenderGallery(); _blRenderComparisonTable();
      showToast('Trade deleted', 'danger');
    }
  });
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 3: Chart Replay
//
// Candles come from Twelve Data via a Supabase Edge Function
// (market-data-proxy) so the API key stays server-side and
// CORS is a non-issue — same pattern as ai-coach. The Edge
// Function also caches responses in market_data_cache to stay
// well within Twelve Data's free-tier 800 calls/day limit.
//
// Replay position + drawings persist per-session inside
// session.replayState (part of the same journal_backtest_lab
// JSONB row) so leaving and reopening a session resumes where
// you left off.
//
// Scope note: drawing tools below cover trendline/arrow/measure
// (line), horizontal/vertical lines, rectangle-based tools
// (rect — reused for FVG, Order Block, Session/Killzone Box,
// Premium-Discount Zone, all just differently colored
// rectangles), Fibonacci retracement, and text annotations.
// None of these are auto-detected — ICT concept recognition
// (auto FVG/OB/liquidity detection) is a future analytics-phase
// feature, not a replay-drawing feature.
// ═══════════════════════════════════════════════════
let _repState = null;

// ── Data sources ─────────────────────────────────────────
// Each source is fetched through the same market-data-proxy
// Edge Function; the function branches on `source` server-side
// so API keys/secrets for each vendor stay off the client.
// Interval option *values* are already in the format each
// vendor's API expects — no client-side remapping needed.
const REP_SOURCES = [
  {
    id: 'twelvedata', label: 'Twelve Data',
    intervals: ['1min', '5min', '15min', '30min', '1h', '4h', '1day', '1week'],
    defaultInterval: '1h',
    symbolPlaceholder: 'EUR/USD',
    mapPair(pair) {
      if (!pair) return 'EUR/USD';
      const p = pair.trim().toUpperCase().replace(/\s+/g, '');
      if (p.includes('/')) return p;
      if (/^[A-Z]{6}$/.test(p)) return p.slice(0, 3) + '/' + p.slice(3);
      return p;
    },
  },
  {
    id: 'dukascopy', label: 'Dukascopy',
    intervals: ['m1', 'm5', 'm15', 'm30', 'h1', 'h4', 'd1'],
    defaultInterval: 'h1',
    symbolPlaceholder: 'eurusd',
    mapPair(pair) {
      if (!pair) return 'eurusd';
      return pair.trim().toLowerCase().replace(/[\/\s]/g, '');
    },
  },
  {
    id: 'oanda', label: 'OANDA',
    intervals: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D', 'W'],
    defaultInterval: 'H1',
    symbolPlaceholder: 'EUR_USD',
    mapPair(pair) {
      if (!pair) return 'EUR_USD';
      const p = pair.trim().toUpperCase().replace(/\s+/g, '');
      if (p.includes('_')) return p;
      if (/^[A-Z]{6}$/.test(p)) return p.slice(0, 3) + '_' + p.slice(3);
      return p;
    },
  },
];
function _repGetSource(id) { return REP_SOURCES.find(s => s.id === id) || REP_SOURCES[0]; }

// Drawing tools shown in the left toolbar, top to bottom.
// `group` clusters related tools for the toolbar dividers.
// `icon` refers to an id in the icon sprite (index.html <defs>)
// or one of the inline REP_TOOL_ICONS below for chart-specific glyphs.
const REP_TOOLS = [
  { id: 'select',            label: 'Selection Tool (V)', kind: 'select',  group: 'nav' },
  { id: 'trendline',         label: 'Trend Line',        kind: 'line',   color: '#fbbf24', group: 'lines' },
  { id: 'ray',               label: 'Ray',                kind: 'ray',    color: '#fbbf24', group: 'lines' },
  { id: 'arrow',              label: 'Arrow',              kind: 'line',   color: '#fbbf24', arrow: true, group: 'lines' },
  { id: 'hline',              label: 'Horizontal Line',    kind: 'hline',  color: '#a78bfa', group: 'lines' },
  { id: 'vline',              label: 'Vertical Line',      kind: 'vline',  color: '#a78bfa', group: 'lines' },
  { id: 'measure',            label: 'Measure',            kind: 'line',   color: '#60a5fa', measure: true, group: 'lines' },
  { id: 'rect',               label: 'Rectangle',          kind: 'rect',   color: 'rgba(96,165,250,.16)', stroke: '#60a5fa', group: 'shapes' },
  { id: 'circle',             label: 'Circle',             kind: 'circle', color: 'rgba(96,165,250,.16)', stroke: '#60a5fa', group: 'shapes' },
  { id: 'brush',              label: 'Brush',              kind: 'brush',  color: '#f472b6', group: 'shapes' },
  { id: 'path',               label: 'Path',               kind: 'path',   color: '#38bdf8', group: 'shapes' },
  { id: 'text',               label: 'Text',               kind: 'text',   color: '#e2e8f0', group: 'text' },
  { id: 'callout',            label: 'Callout',            kind: 'callout',color: '#e2e8f0', group: 'text' },
  { id: 'fib',                label: 'Fib Retracement',    kind: 'fib',    color: '#2dd4bf', group: 'fib' },
  { id: 'fibext',             label: 'Fib Extension',      kind: 'fib',    color: '#fb923c', extension: true, group: 'fib' },
  { id: 'gannbox',            label: 'Gann Box',           kind: 'gannbox',color: 'rgba(167,139,250,.10)', stroke: '#a78bfa', group: 'fib' },
  { id: 'pricerange',         label: 'Price Range',        kind: 'pricerange', color: '#facc15', group: 'forecast' },
  { id: 'longposition',       label: 'Long Position',      kind: 'longposition', color: 'rgba(52,211,153,.18)', stroke: '#34d399', group: 'forecast' },
  { id: 'shortposition',      label: 'Short Position',     kind: 'shortposition', color: 'rgba(248,113,113,.18)', stroke: '#f87171', group: 'forecast' },
  { id: 'fixedrangevp',       label: 'Fixed Range Volume Profile', kind: 'fixedrangevp', color: '#60a5fa', group: 'forecast' },
  { id: 'killzone',           label: 'Session Box',        kind: 'rect',   color: 'rgba(52,211,153,.10)', stroke: '#34d399', drawLabel: 'Session', icon: 'session', group: 'ict' },
  { id: 'orderblock',         label: 'Order Block',        kind: 'rect',   color: 'rgba(251,191,36,.14)', stroke: '#fbbf24', drawLabel: 'OB', group: 'ict' },
  { id: 'fvg',                label: 'Fair Value Gap',     kind: 'rect',   color: 'rgba(167,139,250,.16)', stroke: '#a78bfa', drawLabel: 'FVG', group: 'ict' },
  { id: 'liquidity',          label: 'Liquidity Zone',     kind: 'hline',  color: '#f87171', dashed: true, group: 'ict' },
  { id: 'premiumdiscount',    label: 'Premium / Discount', kind: 'rect',   color: 'rgba(45,212,191,.10)', stroke: '#2dd4bf', drawLabel: 'PD', group: 'ict' },
];

function _repUid() { return 'rd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

// Zoom-preset pills shown under the chart, TradingView-range-bar
// style — since this is a replay chart (not a live "load N years of
// history" view), these map to how many candles are visible on
// screen at once rather than to a calendar range.
const REP_RANGE_PRESETS = [
  { n: 50,  label: '50' },
  { n: 100, label: '100' },
  { n: 150, label: '150' },
  { n: 200, label: '200' },
  { n: 300, label: '300' },
  { n: 400, label: 'All' },
];

// ── Symbol / interval mapping ───────────────────────────
// Kept as thin wrappers around REP_SOURCES so any old call
// sites (or saved replayState from before multi-source
// support) keep working against Twelve Data by default.
function _repMapPairToSymbol(pair) { return _repGetSource('twelvedata').mapPair(pair); }
function _repMapIntervalToTD(tf) {
  const map = { M1: '1min', M5: '5min', M15: '15min', M30: '30min', H1: '1h', H4: '4h', D1: '1day', W1: '1week' };
  const key = (tf || '').trim().toUpperCase();
  return map[key] || '1h';
}
// Same idea, but for whichever source is currently active.
function _repMapIntervalForSource(tf, sourceId) {
  const src = _repGetSource(sourceId);
  const legacy = _repMapIntervalToTD(tf); // normalize e.g. "H1" -> "1h" first
  const bySourceMap = {
    twelvedata: { '1min': '1min', '5min': '5min', '15min': '15min', '30min': '30min', '1h': '1h', '4h': '4h', '1day': '1day', '1week': '1week' },
    dukascopy:  { '1min': 'm1', '5min': 'm5', '15min': 'm15', '30min': 'm30', '1h': 'h1', '4h': 'h4', '1day': 'd1', '1week': 'd1' },
    oanda:      { '1min': 'M1', '5min': 'M5', '15min': 'M15', '30min': 'M30', '1h': 'H1', '4h': 'H4', '1day': 'D', '1week': 'W' },
  };
  return (bySourceMap[src.id] && bySourceMap[src.id][legacy]) || src.defaultInterval;
}

// ── Fetch candles via Edge Function proxy ───────────────
// The Edge Function (market-data-proxy) branches on `source`
// server-side and keeps each vendor's key/token as a Supabase
// secret — see /supabase/functions/market-data-proxy for the
// Dukascopy + OANDA branches added alongside the existing
// Twelve Data one.
// Returns the full response object, not just candles, because the
// server may auto-fallback to a different source (e.g. OANDA -> Dukascopy
// if OANDA_API_KEY isn't set) — callers need `source`/`symbol`/`interval`
// back to keep the UI in sync with what actually loaded.
async function _repFetchCandles(symbol, interval, outputsize = 500, source = 'twelvedata') {
  const { data: { session } } = await sb.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/market-data-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON}`,
    },
    body: JSON.stringify({ symbol, interval, outputsize, source }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Server error ${response.status}: ${errText}`);
  }
  return await response.json();
}

// ── Inline icon glyphs for the drawing toolbar (kept local to this
// module so we don't have to touch the shared sprite in index.html) ──
const REP_ICON_PATHS = {
  select:   '<path d="M5 3l5.6 15.4 2-6.6 6.6-2z"/>',
  trendline:'<path d="M4 19L19 4"/><circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="4" r="1.6" fill="currentColor" stroke="none"/>',
  ray:      '<path d="M4 19L20 3"/><circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  arrow:    '<path d="M4 19L18 5"/><path d="M9 5h9v9"/>',
  hline:    '<path d="M3 12h18"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  vline:    '<path d="M12 3v18"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  measure:  '<path d="M4 17L17 4"/><path d="M4 17l2.2-2.2M7 14l2.2-2.2M10 11l2.2-2.2M13 8l2.2-2.2"/>',
  rect:     '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  circle:   '<circle cx="12" cy="12" r="8"/>',
  brush:    '<path d="M4 20c0-4 2-5 4-5s2 3 4 3 1-4 4-6 4 1 4-3"/>',
  text:     '<path d="M5 6h14M12 6v13"/>',
  fib:      '<path d="M3 6h18M3 10.5h18M3 15h18M3 19.5h18" stroke-dasharray="0"/><path d="M3 6h5M3 19.5h5" stroke-width="2.6"/>',
  fibext:   '<path d="M3 5h18M3 10h18M3 15h18M3 20h18"/><path d="M16 5l3-2 3 2" stroke-width="1.3"/>',
  session:  '<rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M5 9h14M5 15h14"/>',
  orderblock:'<rect x="4" y="9" width="16" height="6" rx="1"/><path d="M4 5h16M4 19h16" opacity=".5"/>',
  fvg:      '<path d="M4 8h16M4 16h16"/><rect x="4" y="8" width="16" height="8" fill="currentColor" opacity=".18" stroke="none"/>',
  liquidity:'<path d="M3 8h18M3 16h18" stroke-dasharray="3 3"/>',
  premiumdiscount:'<path d="M4 4h16v16H4z"/><path d="M4 12h16"/>',
  path:     '<path d="M4 18l5-9 4 5 4-11 3 7"/><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="13" cy="14" r="1.4" fill="currentColor" stroke="none"/><circle cx="17" cy="3" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="10" r="1.4" fill="currentColor" stroke="none"/>',
  callout:  '<path d="M4 5h16v10H11l-4 4v-4H4z"/>',
  gannbox:  '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 4l16 16M4 20l16-16M4 12h16M12 4v16"/>',
  pricerange:'<path d="M12 3v18M8 5l4-2 4 2M8 19l4 2 4-2"/><path d="M4 8h4M4 16h4M16 8h4M16 16h4"/>',
  longposition:'<rect x="4" y="4" width="16" height="5" fill="currentColor" opacity=".35" stroke="none"/><rect x="4" y="15" width="16" height="5" fill="currentColor" opacity=".2" stroke="none"/><path d="M4 9.5h16M4 14.5h16"/>',
  shortposition:'<rect x="4" y="4" width="16" height="5" fill="currentColor" opacity=".2" stroke="none"/><rect x="4" y="15" width="16" height="5" fill="currentColor" opacity=".35" stroke="none"/><path d="M4 9.5h16M4 14.5h16"/>',
  fixedrangevp:'<path d="M4 4v16"/><rect x="5" y="5" width="6" height="2" fill="currentColor" stroke="none"/><rect x="5" y="8" width="10" height="2" fill="currentColor" stroke="none"/><rect x="5" y="11" width="14" height="2" fill="currentColor" stroke="none"/><rect x="5" y="14" width="8" height="2" fill="currentColor" stroke="none"/><rect x="5" y="17" width="4" height="2" fill="currentColor" stroke="none"/>',
  magnet:   '<path d="M7 4v8a5 5 0 0010 0V4"/><path d="M7 4H4v4h3M17 4h3v4h-3"/>',
  undo:     '<path d="M7 8H3V4"/><path d="M3 8a9 9 0 1 1 2 10"/>',
  redo:     '<path d="M17 8h4V4"/><path d="M21 8a9 9 0 1 0-2 10"/>',
  save:     '<path d="M5 4.5h11l3.5 3.5v11.5a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 01-1.5-1.5v-13A1.5 1.5 0 016 4.5z"/><path d="M8 4.5v5h7v-5M8 21v-6.5h8V21"/>',
  load:     '<path d="M3.5 6.5A1.5 1.5 0 015 5h4l2 2h8a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5v-11z"/>',
  fullscreen:'<path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4"/>',
  indicators:'<path d="M4 19h16M4 19V9M9 19V5M14 19v-8M19 19v-4"/>',
  reset:    '<path d="M4.5 12a7.5 7.5 0 0112.7-5.4M19.5 12a7.5 7.5 0 01-12.7 5.4M17 4.5v3.3h-3.3M7 19.5v-3.3h3.3"/>',
  chevrondown:'<path d="M6 9l6 6 6-6"/>',
  loop:     '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
  weekend:  '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  lock:     '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  eye:      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:   '<path d="M3 3l18 18"/><path d="M10.6 5.2A10.8 10.8 0 0112 5c6.4 0 10 7 10 7a15.8 15.8 0 01-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7a10.4 10.4 0 004.2-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
};
function _repIcon(name, cls) {
  const body = REP_ICON_PATHS[name] || '';
  return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// ── History (undo/redo) — shallow snapshots of the drawings array ──
function _repPushHistory() {
  if (!_repState) return;
  _repState.history.undo.push(JSON.stringify(_repState.drawings));
  if (_repState.history.undo.length > 50) _repState.history.undo.shift();
  _repState.history.redo = [];
}
function _repUndo() {
  if (!_repState || !_repState.history.undo.length) return;
  _repState.history.redo.push(JSON.stringify(_repState.drawings));
  _repState.drawings = JSON.parse(_repState.history.undo.pop());
  _repState.selectedId = null;
  _repSaveState(); _repDrawOverlay();
}
function _repRedo() {
  if (!_repState || !_repState.history.redo.length) return;
  _repState.history.undo.push(JSON.stringify(_repState.drawings));
  _repState.drawings = JSON.parse(_repState.history.redo.pop());
  _repState.selectedId = null;
  _repSaveState(); _repDrawOverlay();
}

// ── Chart Theme / Settings defaults (TradingView-style Settings
// modal — Symbol tab: candle body/border/wick colors, precision,
// timezone. Canvas tab: background, grid, crosshair, watermark,
// scale text/lines, nav visibility) ─────────────────────
const REP_THEME_DEFAULTS = {
  // Symbol → Candles
  colorBarsPrevClose: false,
  bodyVisible: true, bodyUpColor: '#34d399', bodyDownColor: '#f87171',
  borderVisible: true, borderUpColor: '#34d399', borderDownColor: '#f87171',
  wickVisible: true, wickUpColor: '#34d399', wickDownColor: '#f87171',
  // Symbol → Data modification
  precision: 'default', // 'default' or 0-8
  timezone: 0, // hours offset from UTC, applied to crosshair/label time text
  // Canvas → Chart basic styles
  bgColor: '#080b12',
  vertGrid: true, vertGridColor: 'rgba(255,255,255,.04)',
  horzGrid: true, horzGridColor: 'rgba(255,255,255,.04)',
  crosshairColor: '#8b98ac',
  watermark: true, watermarkColor: 'rgba(226,232,240,.5)',
  // Canvas → Scales
  scaleTextColor: 'rgba(226,232,240,.62)', scaleFontSize: 11,
  scaleLineColor: 'rgba(255,255,255,.08)',
  // Canvas → Buttons
  navVisibility: 'always', // 'always' | 'hidden'
  // Other (kept from the old popover)
  volume: true,
};
const REP_TIMEZONE_OPTIONS = [
  { v: -12, l: '(UTC-12) Baker Island' }, { v: -8, l: '(UTC-8) Los Angeles' },
  { v: -7, l: '(UTC-7) Denver' }, { v: -6, l: '(UTC-6) Chicago' },
  { v: -5, l: '(UTC-5) New York' }, { v: -4, l: '(UTC-4) New York (DST)' },
  { v: -3, l: '(UTC-3) São Paulo' }, { v: 0, l: '(UTC+0) London' },
  { v: 1, l: '(UTC+1) Berlin / Paris' }, { v: 2, l: '(UTC+2) Athens / Cairo' },
  { v: 3, l: '(UTC+3) Moscow' }, { v: 4, l: '(UTC+4) Dubai' },
  { v: 5.5, l: '(UTC+5:30) Mumbai' }, { v: 8, l: '(UTC+8) Singapore / Shanghai' },
  { v: 9, l: '(UTC+9) Tokyo' }, { v: 10, l: '(UTC+10) Sydney' },
];
// Returns REP_THEME_DEFAULTS, swapped for a light-canvas palette when
// the app itself is currently in light mode. Only used to seed a
// session that has no saved theme yet — once a user tweaks/saves
// theme settings for a session, those saved values always win, so
// this never overrides an explicit choice.
function _repDefaultTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (!isLight) return Object.assign({}, REP_THEME_DEFAULTS);
  return Object.assign({}, REP_THEME_DEFAULTS, {
    bgColor: '#eef1f8',
    vertGridColor: 'rgba(15,23,42,.07)',
    horzGridColor: 'rgba(15,23,42,.07)',
    crosshairColor: '#64748b',
    watermarkColor: 'rgba(15,23,42,.14)',
    scaleTextColor: 'rgba(15,23,42,.65)',
    scaleLineColor: 'rgba(15,23,42,.12)',
  });
}
// Merges a saved theme onto the current defaults. Handles the
// pre-Settings-modal shape (just upColor/downColor/grid/volume/
// watermark) by mapping those old keys onto the new body/border/
// wick fields so existing saved layouts don't lose their colors.
function _repMergeTheme(saved) {
  const merged = _repDefaultTheme();
  if (saved && (saved.upColor || saved.downColor)) {
    const up = saved.upColor || merged.bodyUpColor, down = saved.downColor || merged.bodyDownColor;
    Object.assign(merged, {
      bodyUpColor: up, bodyDownColor: down,
      borderUpColor: up, borderDownColor: down,
      wickUpColor: up, wickDownColor: down,
    });
  }
  if (saved && saved.grid !== undefined) merged.vertGrid = merged.horzGrid = !!saved.grid;
  return Object.assign(merged, saved || {});
}

// ── Open / close the fullscreen replay workstation ──────
async function _repOpen(sessionId) {
  const session = _btGetSessionById(sessionId); if (!session) return;
  const saved = session.replayState || {};
  const source = _repGetSource(saved.source || 'twelvedata').id;
  const symbol = saved.symbol || _repGetSource(source).mapPair(session.pair);
  const interval = saved.interval || _repMapIntervalForSource(session.timeframe, source);

  _repState = {
    sessionId, symbol, interval, source,
    candles: [], index: 0,
    candlesPerView: saved.candlesPerView || 100,
    drawings: saved.drawings ? JSON.parse(JSON.stringify(saved.drawings)) : [],
    activeTool: null, drawDraft: null, selectedId: null, hoverId: null, toolGroupChoice: {},
    toolDefaults: saved.toolDefaults ? JSON.parse(JSON.stringify(saved.toolDefaults)) : {},
    magnet: saved.magnet !== undefined ? saved.magnet : false,
    drawingsLocked: saved.drawingsLocked || false,
    drawingsHidden: saved.drawingsHidden || false,
    loop: saved.loop || false,
    skipWeekends: saved.skipWeekends !== undefined ? saved.skipWeekends : true,
    playing: false, speed: saved.speed || 1,
    indicators: saved.indicators || { ema9: false, ema21: false, sma50: false, vwap: false },
    theme: _repMergeTheme(saved.theme),
    history: { undo: [], redo: [] },
    indicatorSeries: {},
    _savedIndex: typeof saved.index === 'number' ? saved.index : null,
    _panning: false, _dragging: null, _lastMouse: null,
  };

  _repRenderShell();
  await _repLoadCandles();
}

function _repClose() {
  _repPause();
  _repSaveState();
  document.removeEventListener('keydown', _repKeyHandler);
  window.removeEventListener('mouseup', _repOverlayMouseUp);
  if (_repState?._overlayResizeObs) { try { _repState._overlayResizeObs.disconnect(); } catch (e) {} }
  try { _repState?.chart?.remove(); } catch (e) {}
  document.getElementById('rep-fullscreen-overlay')?.remove();
  _repState = null;
}

async function _repSaveState() {
  if (!_repState) return;
  const session = _btGetSessionById(_repState.sessionId); if (!session) return;
  session.replayState = {
    symbol: _repState.symbol, interval: _repState.interval, source: _repState.source,
    index: _repState.index, candlesPerView: _repState.candlesPerView,
    drawings: _repState.drawings, magnet: _repState.magnet, loop: _repState.loop,
    skipWeekends: _repState.skipWeekends, speed: _repState.speed, indicators: _repState.indicators, theme: _repState.theme,
    drawingsLocked: _repState.drawingsLocked, drawingsHidden: _repState.drawingsHidden, toolDefaults: _repState.toolDefaults,
  };
  await _blSave();
}

// ── DOM shell — FXReplay-inspired workstation layout ────
function _repRenderShell() {
  // Rebuilding the DOM destroys the chart's container — dispose the
  // old chart/series first so _repLoadCandles knows to init a fresh
  // one against the new container, instead of holding a stale
  // reference to a chart bound to a now-detached element.
  if (_repState._overlayResizeObs) { try { _repState._overlayResizeObs.disconnect(); } catch (e) {} }
  if (_repState.chart) { try { _repState.chart.remove(); } catch (e) {} }
  _repState.chart = null;
  _repState.candleSeries = null;
  _repState.volumeSeries = null;
  _repState.indicatorSeries = {};
  window.removeEventListener('mouseup', _repOverlayMouseUp);

  document.getElementById('rep-fullscreen-overlay')?.remove();
  const session = _btGetSessionById(_repState.sessionId);
  const overlay = document.createElement('div');
  overlay.id = 'rep-fullscreen-overlay';
  overlay.className = 'rep-fullscreen-overlay';

  const groups = {};
  REP_TOOLS.forEach(t => { (groups[t.group] = groups[t.group] || []).push(t); });
  // TradingView's real toolbox groups related tools behind a single
  // flyout button (Line Tools, Fib Tools, Shapes, …) rather than
  // listing all ~19 tools flat in one column — reproduce that here.
  // Cursor and Text are the two TV keeps standalone.
  const groupOrder = [
    { id: 'nav',    label: null },
    { id: 'lines',  label: 'Lines' },
    { id: 'fib',    label: 'Fibonacci' },
    { id: 'shapes', label: 'Shapes' },
    { id: 'forecast', label: 'Forecasting' },
    { id: 'text',   label: null },
    { id: 'ict',    label: 'Smart Money' },
  ];
  const toolButtons = groupOrder.map((g, gi) => {
    const tools = groups[g.id] || [];
    if (!tools.length) return '';
    const sep = gi < groupOrder.length - 1 ? '<div class="rep-tool-sep"></div>' : '';
    if (tools.length === 1) {
      const t = tools[0];
      return `
      <button class="rep-tool-btn" data-tool="${t.id}" data-tip="${t.label}" onclick="_repSetTool('${t.id}')" ondblclick="_repToolBtnDblClick(event,'${t.id}')" onmouseenter="_repShowTip(event)" onmouseleave="_repHideTip()">
        ${_repIcon(t.icon || t.id, 'icn')}
      </button>` + sep;
    }
    const chosenId = (_repState.toolGroupChoice && _repState.toolGroupChoice[g.id]) || tools[0].id;
    const chosen = tools.find(t => t.id === chosenId) || tools[0];
    return `
      <div class="rep-tool-group" data-group="${g.id}">
        <button class="rep-tool-btn rep-tool-group-main" data-tool="${chosen.id}" data-tip="${chosen.label}" onclick="_repSetTool('${chosen.id}')" ondblclick="_repToolBtnDblClick(event,'${chosen.id}')" onmouseenter="_repShowTip(event)" onmouseleave="_repHideTip()">
          ${_repIcon(chosen.icon || chosen.id, 'icn')}
        </button>
        <button class="rep-tool-group-caret" data-tip="More ${g.label} tools" onclick="_repToggleToolFlyout(event,'${g.id}')" onmouseenter="_repShowTip(event)" onmouseleave="_repHideTip()" aria-label="More ${g.label} tools"></button>
      </div>` + sep;
  }).join('');

  overlay.innerHTML = `
    <div class="rep-topbar">
      <div class="rep-topbar-group">
        <div class="rep-topbar-title"><span class="rep-live-dot"></span><span class="rep-title-text">${session?.name || 'Chart Replay'}</span></div>
        <div class="rep-topbar-divider"></div>
        <select id="rep-source-select" class="rep-select" onchange="_repSourceChanged()" title="Data source">
          ${REP_SOURCES.map(s => `<option value="${s.id}"${s.id === _repState.source ? ' selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <button class="rep-icon-btn" id="rep-symbol-trigger" style="width:auto;padding:0 10px;font-family:var(--font-mono);font-weight:600;gap:6px" onclick="_repOpenSymbolSearch()" title="Search symbol (/)">
          <span>${_repState.symbol}</span>
          <svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        </button>
        <div class="rep-tf-pills" id="rep-tf-pills">
          ${_repGetSource(_repState.source).intervals.map(iv => `<button class="rep-tf-pill${iv === _repState.interval ? ' active' : ''}" data-iv="${iv}" onclick="_repSetInterval('${iv}')">${_repIntervalLabel(iv)}</button>`).join('')}
        </div>
        <button class="rep-icon-btn" onclick="_repChangeSymbolInterval()" title="Reload"><svg class="icn" aria-hidden="true"><use href="#ic-refresh"></use></svg></button>
      </div>
      <div class="rep-topbar-group">
        <button class="rep-icon-btn" onclick="_repUndo()" title="Undo (Ctrl+Z)">${_repIcon('undo', 'icn')}</button>
        <button class="rep-icon-btn" onclick="_repRedo()" title="Redo (Ctrl+Y)">${_repIcon('redo', 'icn')}</button>
        <div class="rep-topbar-divider"></div>
        <button class="rep-icon-btn" id="rep-indicators-btn" onclick="_repToggleIndicatorsPopover()" title="Indicators">${_repIcon('indicators', 'icn')}</button>
        <button class="rep-icon-btn" onclick="_repSaveLayout()" title="Save Layout">${_repIcon('save', 'icn')}</button>
        <button class="rep-icon-btn" onclick="_repToggleLayoutsPopover()" title="Load Layout">${_repIcon('load', 'icn')}</button>
        <button class="rep-icon-btn" onclick="_repClearDrawings()" title="Clear all drawings"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg></button>
        <button class="rep-icon-btn" id="rep-settings-btn" onclick="_repOpenSettingsModal()" title="Chart settings & theme"><svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.2a1.7 1.7 0 013.4 0 1.7 1.7 0 002.5 1.5 1.7 1.7 0 012.4 2.4A1.7 1.7 0 0020.1 10a1.7 1.7 0 010 3.4 1.7 1.7 0 00-1.5 2.5 1.7 1.7 0 01-2.4 2.4A1.7 1.7 0 0013.7 20a1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.5-1.5 1.7 1.7 0 01-2.4-2.4A1.7 1.7 0 003.9 13.4a1.7 1.7 0 010-3.4 1.7 1.7 0 001.5-2.5 1.7 1.7 0 012.4-2.4A1.7 1.7 0 0010.3 3.2z"/><circle cx="12" cy="12" r="3.2"/></svg></button>
        <div class="rep-topbar-divider"></div>
        <button class="rep-icon-btn" onclick="_repToggleFullscreen()" title="Fullscreen">${_repIcon('fullscreen', 'icn')}</button>
        <button class="rep-close-btn" onclick="_repClose()" title="Close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
    </div>

    <div class="rep-workspace">
      <div class="rep-left-toolbar" id="rep-left-toolbar" style="${_repState.theme.navVisibility === 'hidden' ? 'display:none' : ''}">${toolButtons}
        <div class="rep-tool-sep"></div>
        <button class="rep-tool-btn ${_repState.magnet ? 'on' : ''}" id="rep-magnet-btn" data-tip="Magnet / Snap to OHLC" onclick="_repToggleMagnet()" onmouseenter="_repShowTip(event)" onmouseleave="_repHideTip()">${_repIcon('magnet', 'icn')}</button>
        <button class="rep-tool-btn ${_repState.drawingsLocked ? 'on' : ''}" id="rep-lock-btn" data-tip="Lock all drawings" onclick="_repToggleDrawingsLocked()" onmouseenter="_repShowTip(event)" onmouseleave="_repHideTip()">${_repIcon('lock', 'icn')}</button>
        <button class="rep-tool-btn ${_repState.drawingsHidden ? 'on' : ''}" id="rep-hide-btn" data-tip="Hide all drawings" onclick="_repToggleDrawingsHidden()" onmouseenter="_repShowTip(event)" onmouseleave="_repHideTip()">${_repIcon(_repState.drawingsHidden ? 'eyeOff' : 'eye', 'icn')}</button>
        <button class="rep-tool-btn" data-tip="Remove all drawings" onclick="_repClearDrawings()" onmouseenter="_repShowTip(event)" onmouseleave="_repHideTip()"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg></button>
      </div>
      <div class="rep-chart-area">
        <div class="rep-chart-wrap" id="rep-chart-wrap"></div>
        <canvas class="rep-overlay-canvas" id="rep-overlay"></canvas>
        <div class="rep-symbol-badge">${_repState.symbol} · ${_repState.interval}</div>
        <div class="rep-ohlc-badge" id="rep-ohlc-badge" style="display:none"></div>
        <div class="rep-loading" id="rep-status-msg"><div class="rep-spinner"></div>Loading candles…</div>

        <div class="rep-range-pills" id="rep-range-pills">
          ${REP_RANGE_PRESETS.map(p => `<button class="rep-range-btn${_repState.candlesPerView === p.n ? ' active' : ''}" data-n="${p.n}" onclick="_repSetRange(${p.n})">${p.label}</button>`).join('')}
        </div>

        <div class="rep-popover" id="rep-indicators-popover" style="width:250px;max-height:70vh;overflow-y:auto">
          ${_repIndicatorPopoverHtml()}
        </div>
        <div class="rep-popover" id="rep-layouts-popover">
          <div class="rep-popover-title">Saved Layouts</div>
          <div id="rep-layouts-list" style="display:flex;flex-direction:column;gap:2px"></div>
        </div>
        <div class="rep-ctx-menu" id="rep-ctx-menu"></div>

        <div class="rep-symbol-search-backdrop" id="rep-symbol-search-backdrop" onclick="if(event.target===this)_repCloseSymbolSearch()">
          <div class="rep-symbol-search" id="rep-symbol-search" role="dialog" aria-label="Symbol search">
            <div class="rep-symsearch-input-row">
              <svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input type="text" id="rep-symsearch-input" placeholder="Search symbol (EURUSD, XAUUSD, BTC…)" autocomplete="off" oninput="_repSymbolSearchInput(this.value)" onkeydown="_repSymbolSearchKeydown(event)">
              <button class="rep-icon-btn" onclick="_repCloseSymbolSearch()" title="Close (Esc)"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
            </div>
            <div class="rep-symsearch-tabs" id="rep-symsearch-tabs"></div>
            <div class="rep-symsearch-results" id="rep-symsearch-results"></div>
          </div>
        </div>


        <div class="rep-replay-pill" id="rep-replay-pill" style="${_repState.theme.navVisibility === 'hidden' ? 'display:none' : ''}">
          <span class="rep-drag-handle"><span></span><span></span><span></span><span></span><span></span><span></span></span>
          <button class="rep-step-btn" onclick="_repReset()" title="Reset (Home)">${_repIcon('reset', 'icn')}</button>
          <button class="rep-step-btn" onclick="_repStep(-1)" title="Step back (←)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 5L8 12l8 7"/></svg></button>
          <button class="rep-play-btn" id="rep-play-btn" onclick="_repTogglePlay()" title="Play / Pause (Space)"><svg id="rep-play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg></button>
          <button class="rep-step-btn" onclick="_repStep(1)" title="Step forward (→)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5l8 7-8 7"/></svg></button>
          <select id="rep-speed-select" class="rep-select" style="height:26px;padding:2px 6px" onchange="_repSetSpeed(this.value)">
            <option value="0.5">0.5x</option><option value="1" selected>1x</option>
            <option value="2">2x</option><option value="5">5x</option><option value="10">10x</option><option value="25">25x</option>
          </select>
          <div class="rep-progress-track" id="rep-progress-track">
            <div class="rep-progress-fill" id="rep-progress-fill"></div>
            <input type="range" id="rep-progress-slider" min="0" max="100" value="0" oninput="_repScrubProgress(this.value)">
          </div>
          <span class="rep-candle-counter" id="rep-candle-counter">0 / 0</span>
          <input type="date" id="rep-jump-date" class="rep-select" style="height:26px;padding:2px 6px;width:120px" onchange="_repJumpToDate(this.value)" title="Go to date">
          <button class="rep-pill-toggle ${_repState.skipWeekends ? 'active' : ''}" id="rep-weekend-btn" onclick="_repToggleSkipWeekends()" title="Skip weekends">${_repIcon('weekend', 'icn')}</button>
          <button class="rep-pill-toggle ${_repState.loop ? 'active' : ''}" id="rep-loop-btn" onclick="_repToggleLoop()" title="Loop replay">${_repIcon('loop', 'icn')}</button>
          <button class="rep-pill-toggle" onclick="_repZoom(1)" title="Zoom out (fewer candles)">－</button>
          <button class="rep-pill-toggle" onclick="_repZoom(-1)" title="Zoom in (more candles)">＋</button>
        </div>
      </div>
    </div>

    <div class="rep-bottom-dock" id="rep-bottom-dock"></div>
    <div class="rep-floating-tooltip" id="rep-floating-tooltip"></div>
    <div class="rep-tool-flyout" id="rep-tool-flyout"></div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.addEventListener('keydown', _repKeyHandler);
  _repUpdateToolbarActive();
  _repRenderIndicatorPopoverState();
  _repRenderLayoutsList();
}

// ── Keyboard shortcuts ───────────────────────────────────
function _repKeyHandler(e) {
  if (!_repState) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.code === 'Space') { e.preventDefault(); _repTogglePlay(); }
  else if (e.key === 'ArrowRight') { _repStep(1); }
  else if (e.key === 'ArrowLeft') { _repStep(-1); }
  else if (e.key === 'Home') { _repReset(); }
  else if (e.key === '/') { e.preventDefault(); _repOpenSymbolSearch(); }
  else if (e.key === 'Escape') { _repCloseSymbolSearch(); _repSetTool(null); _repHideContextMenu(); _repClosePopovers(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { _repDeleteSelected(); }
  else if (e.key === 'v' || e.key === 'V') { _repSetTool('select'); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); _repUndo(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); _repRedo(); }
}

// ══════════════════════════════════════════════════════
// SYMBOL SEARCH — TradingView-style dialog: type to filter,
// ↑/↓/Enter/Esc to navigate, tabs for Favorites/Recent/Popular/
// Forex/Crypto/Indices/Synthetic. Reads TV_SYMBOL_CATALOG from
// tv-datafeed.js, so results here are exactly what the chart's
// Datafeed can actually resolve — no dead ends.
// ══════════════════════════════════════════════════════
const REP_SYMSEARCH_TABS = [
  { id: 'popular', label: 'Popular' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'recent', label: 'Recent' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'index', label: 'Indices' },
  { id: 'synthetic', label: 'Synthetic' },
];
let _repSymSearchState = { tab: 'popular', query: '', highlighted: 0, results: [] };

function _repSymSearchStore(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
function _repSymSearchFavorites() { return _repSymSearchStore('nxtgen_rep_fav_symbols'); }
function _repSymSearchRecents() { return _repSymSearchStore('nxtgen_rep_recent_symbols'); }
function _repSymSearchToggleFavorite(symbol) {
  const favs = _repSymSearchFavorites();
  const idx = favs.indexOf(symbol);
  if (idx >= 0) favs.splice(idx, 1); else favs.unshift(symbol);
  localStorage.setItem('nxtgen_rep_fav_symbols', JSON.stringify(favs.slice(0, 30)));
  _repRenderSymbolSearchResults();
}
function _repSymSearchPushRecent(symbol) {
  const recents = _repSymSearchRecents().filter(s => s !== symbol);
  recents.unshift(symbol);
  localStorage.setItem('nxtgen_rep_recent_symbols', JSON.stringify(recents.slice(0, 12)));
}

function _repOpenSymbolSearch() {
  const backdrop = document.getElementById('rep-symbol-search-backdrop'); if (!backdrop) return;
  _repClosePopovers();
  _repSymSearchState = { tab: 'popular', query: '', highlighted: 0, results: [] };
  backdrop.classList.add('open');
  _repRenderSymbolSearchTabs();
  _repRenderSymbolSearchResults();
  const input = document.getElementById('rep-symsearch-input');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 0); }
}
function _repCloseSymbolSearch() {
  document.getElementById('rep-symbol-search-backdrop')?.classList.remove('open');
}
function _repSetSymSearchTab(tabId) {
  _repSymSearchState.tab = tabId;
  _repSymSearchState.highlighted = 0;
  _repRenderSymbolSearchTabs();
  _repRenderSymbolSearchResults();
}
function _repRenderSymbolSearchTabs() {
  const el = document.getElementById('rep-symsearch-tabs'); if (!el) return;
  el.innerHTML = REP_SYMSEARCH_TABS.map(t => `<button class="rep-symsearch-tab ${_repSymSearchState.tab === t.id ? 'active' : ''}" onclick="_repSetSymSearchTab('${t.id}')">${t.label}</button>`).join('');
}
function _repSymbolSearchInput(value) {
  _repSymSearchState.query = value;
  _repSymSearchState.highlighted = 0;
  _repRenderSymbolSearchResults();
}
function _repSymbolSearchMatches() {
  const q = (_repSymSearchState.query || '').trim().toUpperCase();
  const pool = (typeof TV_SYMBOL_CATALOG !== 'undefined') ? TV_SYMBOL_CATALOG : [];
  if (q) return pool.filter(s => s.symbol.toUpperCase().includes(q) || s.description.toUpperCase().includes(q));
  if (_repSymSearchState.tab === 'favorites') { const favs = _repSymSearchFavorites(); return pool.filter(s => favs.includes(s.symbol)); }
  if (_repSymSearchState.tab === 'recent') return _repSymSearchRecents().map(sym => pool.find(s => s.symbol === sym)).filter(Boolean);
  if (_repSymSearchState.tab === 'popular') return pool;
  return pool.filter(s => s.type === _repSymSearchState.tab);
}
function _repRenderSymbolSearchResults() {
  const el = document.getElementById('rep-symsearch-results'); if (!el) return;
  const favs = _repSymSearchFavorites();
  const results = _repSymbolSearchMatches();
  _repSymSearchState.results = results;
  if (!results.length) {
    el.innerHTML = `<div class="rep-symsearch-empty">No symbols match "${_repSymSearchState.query}"</div>`;
    return;
  }
  el.innerHTML = results.map((s, i) => `
    <div class="rep-symsearch-row ${i === _repSymSearchState.highlighted ? 'highlighted' : ''}" onmouseenter="_repSymSearchState.highlighted=${i}" onclick="_repSymbolSearchSelect('${s.symbol}')">
      <span class="rep-symsearch-type">${s.type}</span>
      <span class="rep-symsearch-name">${s.symbol}</span>
      <span class="rep-symsearch-desc">${s.description}</span>
      <button class="rep-symsearch-fav ${favs.includes(s.symbol) ? 'on' : ''}" onclick="event.stopPropagation();_repSymSearchToggleFavorite('${s.symbol}')" title="Favorite">★</button>
    </div>`).join('');
}
function _repSymbolSearchKeydown(e) {
  const results = _repSymSearchState.results;
  if (e.key === 'ArrowDown') { e.preventDefault(); _repSymSearchState.highlighted = Math.min(results.length - 1, _repSymSearchState.highlighted + 1); _repRenderSymbolSearchResults(); _repSymSearchScrollHighlighted(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _repSymSearchState.highlighted = Math.max(0, _repSymSearchState.highlighted - 1); _repRenderSymbolSearchResults(); _repSymSearchScrollHighlighted(); }
  else if (e.key === 'Enter') { e.preventDefault(); const s = results[_repSymSearchState.highlighted]; if (s) _repSymbolSearchSelect(s.symbol); }
  else if (e.key === 'Escape') { e.preventDefault(); _repCloseSymbolSearch(); }
}
function _repSymSearchScrollHighlighted() {
  document.querySelector('#rep-symsearch-results .rep-symsearch-row.highlighted')?.scrollIntoView({ block: 'nearest' });
}

async function _repSymbolSearchSelect(symbol) {
  if (!_repState) return;
  _repSymSearchPushRecent(symbol);
  _repCloseSymbolSearch();
  _repPause();
  _repState.symbol = symbol;
  _repState._savedIndex = null;

  _repRenderShell();
  await _repLoadCandles();
}

async function _repChangeSymbolInterval() {
  if (!_repState) return;
  _repPause();
  _repState._savedIndex = null;
  await _repLoadCandles();
}
// Called by the TradingView-style timeframe pills — switches straight
// to the clicked interval (unlike the refresh button above, which
// just reloads whatever interval is already active).
async function _repSetInterval(iv) {
  if (!_repState || iv === _repState.interval) return;
  _repState.interval = iv;
  document.querySelectorAll('.rep-tf-pill').forEach(b => b.classList.toggle('active', b.dataset.iv === iv));
  await _repChangeSymbolInterval();
}
// Short TradingView-style label for any source's interval string
// ('1min'/'m1'/'M1' → '1m', '1h'/'h1'/'H1' → '1H', '1day'/'d1'/'D' → '1D', …).
function _repIntervalLabel(iv) {
  const s = String(iv), lower = s.toLowerCase();
  if (/^\d+min$/.test(lower)) return lower.replace('min', 'm');
  if (/^m\d+$/.test(lower)) return lower.slice(1) + 'm';
  if (/^\d+h$/.test(lower)) return s.toUpperCase();
  if (/^h\d+$/.test(lower)) return lower.slice(1) + 'H';
  if (lower === '1day' || lower === 'd1' || lower === 'd') return '1D';
  if (lower === '1week' || lower === 'w1' || lower === 'w') return '1W';
  return s;
}

function _repSourceChanged() {
  if (!_repState) return;
  const newSourceId = document.getElementById('rep-source-select')?.value || _repState.source;
  const oldSession = _btGetSessionById(_repState.sessionId);
  const newSrc = _repGetSource(newSourceId);
  _repState.symbol = newSrc.mapPair(oldSession?.pair) || newSrc.symbolPlaceholder;
  _repState.interval = _repMapIntervalForSource(oldSession?.timeframe, newSourceId);
  _repState.source = newSourceId;
  _repState._savedIndex = null;
  _repRenderShell();
  _repLoadCandles();
}

// ── Load candles + boot the chart ───────────────────────
async function _repLoadCandles() {
  const status = document.getElementById('rep-status-msg');
  if (status) status.innerHTML = '<div class="rep-spinner"></div>Loading candles…';
  if (status) status.style.display = 'flex';
  try {
    const result = await _repFetchCandles(_repState.symbol, _repState.interval, 500, _repState.source);
    const candles = result.candles || [];
    if (!candles.length) throw new Error('No candle data returned for this symbol/interval');

    if (result.fallback && result.source !== _repState.source) {
      const from = _repGetSource(result.requestedSource || _repState.source).label;
      const to = _repGetSource(result.source).label;
      _repState.source = result.source;
      _repState.symbol = result.symbol || _repState.symbol;
      _repState.interval = result.interval || _repState.interval;
      _repRenderShell();
      if (typeof showToast === 'function') showToast(`${from} unavailable — showing ${to} data instead`, 'info');
    }

    _repState.candles = candles;
    const seed = Math.min(_repState.candlesPerView - 1, candles.length - 1);
    _repState.index = (_repState._savedIndex !== null && _repState._savedIndex < candles.length) ? _repState._savedIndex : seed;

    const chartReady = _repState.chart ? true : _repInitChart();
    if (chartReady) {
      _repSetChartData(true);
      if (status) status.style.display = 'none';
    }
    // Keep the counter/progress bar/date field in sync with the
    // loaded candles even if the chart itself failed to init (e.g.
    // the CDN script didn't load) — this used to get stuck at 0 / 0
    // because _repSetChartData bails out early with no chart, and
    // the HUD update lived inside it.
    _repUpdateReplayHud();
    _repRenderBottomDock();
  } catch (err) {
    const isSetup = /404|not found|relay/i.test(err.message);
    if (status) {
      status.innerHTML = `<div>Couldn't load chart data: ${err.message}</div><small style="color:var(--text3)">${isSetup ? 'The market-data-proxy Edge Function may not be deployed yet, or TWELVE_DATA_API_KEY isn\'t set.' : 'Double-check the symbol format (e.g. EUR/USD) and try again.'}</small>`;
      status.classList.add('rep-error'); status.style.display = 'flex';
    }
  }
}

// ── Lightweight Charts bootstrap ─────────────────────────
// Free, open-source (Apache 2.0) — no license needed. The rest of
// this file (drawings, indicators, theme) already targets this
// library's API (chart.addLineSeries, candleSeries.priceToCoordinate,
// etc.) — this function just has to actually create that chart.
function _repInitChart() {
  const container = document.getElementById('rep-chart-wrap'); if (!container) return false;
  if (_repState.chart) { console.warn('[Backtesting Lab] _repInitChart called with a chart already present — skipping to avoid a duplicate overlapping chart.'); return true; }
  if (typeof LightweightCharts === 'undefined') {
    const status = document.getElementById('rep-status-msg');
    if (status) {
      status.innerHTML = `<div>Charting library failed to load.</div><small style="color:var(--text3)">Check your connection and reload the page.</small>`;
      status.classList.add('rep-error'); status.style.display = 'flex';
    }
    return false;
  }

  const t = _repState.theme;
  const precision = (t.precision === 'default' || t.precision == null || t.precision === '') ? 2 : Number(t.precision);
  const chart = LightweightCharts.createChart(container, {
    autoSize: true,
    layout: { background: { type: 'solid', color: t.bgColor }, textColor: t.scaleTextColor, fontSize: t.scaleFontSize },
    grid: {
      vertLines: { color: t.vertGridColor, visible: t.vertGrid },
      horzLines: { color: t.horzGridColor, visible: t.horzGrid },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: t.crosshairColor }, horzLine: { color: t.crosshairColor },
    },
    rightPriceScale: { borderColor: t.scaleLineColor },
    timeScale: { borderColor: t.scaleLineColor, timeVisible: true, secondsVisible: false },
    localization: {
      timeFormatter: time => new Date((time + (Number(t.timezone) || 0) * 3600) * 1000).toUTCString().slice(0, 22),
    },
    handleScroll: false, handleScale: false,
  });

  const candleSeries = chart.addCandlestickSeries({
    upColor: t.bodyUpColor, downColor: t.bodyDownColor,
    wickUpColor: t.wickUpColor, wickDownColor: t.wickDownColor,
    borderUpColor: t.borderUpColor, borderDownColor: t.borderDownColor,
    borderVisible: true, wickVisible: true,
    priceFormat: { type: 'price', precision, minMove: 1 / Math.pow(10, precision) },
  });

  _repState.chart = chart;
  _repState.candleSeries = candleSeries;

  chart.subscribeCrosshairMove(_repNativeCrosshairUpdate);
  // Drawings are stored in time/price space and re-projected to pixels
  // every render — so when the user pans/zooms the native chart (no
  // drawing tool active, overlay is pointer-events:none and lets the
  // gesture through), the overlay still needs to redraw to stay glued.
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => _repDrawOverlay());

  _repInitOverlayCanvas();
  return true;
}

// Sizes the drawing-overlay canvas to match the chart, keeps it in
// sync on resize (devicePixelRatio-aware so lines stay crisp on
// retina displays), and — this is the important part — actually
// attaches the mouse/wheel/dblclick/contextmenu handlers that this
// file already defines (_repOverlayMouseDown etc.) but that were
// never wired to the DOM, so drawing/selecting/dragging did nothing.
function _repInitOverlayCanvas() {
  const canvas = document.getElementById('rep-overlay');
  const wrap = document.getElementById('rep-chart-wrap');
  if (!canvas || !wrap || !_repState) return;

  const resize = () => {
    if (!_repState) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _repState.overlayCtx = ctx;
    _repState.overlayW = rect.width;
    _repState.overlayH = rect.height;
    _repDrawOverlay();
  };

  if (_repState._overlayResizeObs) { try { _repState._overlayResizeObs.disconnect(); } catch (e) {} }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  _repState._overlayResizeObs = ro;
  resize();

  canvas.onmousedown = _repOverlayMouseDown;
  canvas.onmousemove = _repOverlayMouseMove;
  canvas.onwheel = _repOverlayWheel;
  canvas.ondblclick = _repOverlayDblClick;
  canvas.oncontextmenu = _repOverlayContextMenu;
  canvas.onmouseleave = () => { if (_repState) { _repState._manualCrosshair = null; _repDrawOverlay(); } };

  // ── Touch (mobile) ────────────────────────────────────
  // touchstart/touchmove were never wired up before — only touchend
  // (for double-tap) — so on a phone nothing ever actually called the
  // drawing logic; taps and drags did nothing. Each touch is turned
  // into the same {clientX,clientY,currentTarget} shape the mouse
  // handlers already expect, so all the drag/select/draw logic above
  // is reused as-is instead of duplicated. preventDefault stops the
  // page from scrolling/pinch-zooming under the gesture.
  const repTouchAsMouse = (e) => {
    const t = e.touches[0] || e.changedTouches[0];
    return t ? { clientX: t.clientX, clientY: t.clientY, currentTarget: e.currentTarget } : null;
  };
  let repLastTapAt = 0;
  canvas.ontouchstart = (e) => {
    e.preventDefault();
    const fake = repTouchAsMouse(e);
    if (fake) _repOverlayMouseDown(fake);
  };
  canvas.ontouchmove = (e) => {
    e.preventDefault();
    const fake = repTouchAsMouse(e);
    if (fake) _repOverlayMouseMove(fake);
  };
  canvas.ontouchend = (e) => {
    e.preventDefault();
    const now = Date.now();
    const fake = repTouchAsMouse(e);
    if (now - repLastTapAt < 320 && fake) _repOverlayDblClick(fake);
    repLastTapAt = now;
    _repOverlayMouseUp();
  };
  canvas.ontouchcancel = () => _repOverlayMouseUp();

  // mouseup on window, not just the canvas, so a drag that ends
  // outside the canvas (fast mouse movement) still releases cleanly
  window.removeEventListener('mouseup', _repOverlayMouseUp);
  window.addEventListener('mouseup', _repOverlayMouseUp);
}

// Kept as a no-op call target for any older call sites — sizing is
// now handled by the ResizeObserver set up in _repInitOverlayCanvas.
function _repResizeOverlay() {}

// TV resolution string ("1","5","15","30","60","240","1D","1W")
// from whatever interval shorthand the active source uses.
function tvIntervalFromSourceInterval(interval, sourceId) {
  const table = {
    twelvedata: { '1min': '1', '5min': '5', '15min': '15', '30min': '30', '1h': '60', '4h': '240', '1day': '1D', '1week': '1W' },
    dukascopy: { m1: '1', m5: '5', m15: '15', m30: '30', h1: '60', h4: '240', d1: '1D' },
    oanda: { M1: '1', M5: '5', M15: '15', M30: '30', H1: '60', H4: '240', D: '1D', W: '1W' },
  };
  return (table[sourceId] && table[sourceId][interval]) || '60';
}

// ── Feed the visible replay window into the chart ────────
// _repState.index stays the single source of truth (every existing
// play/step/scrub/jump-to-date function only ever touches that
// number, unchanged) — this function's job is just to make the
// chart agree with it. Lightweight Charts has no concept of
// "replay" — we just re-set the series data to the slice of candles
// up to the current index on every step/scrub.
function _repSetChartData(recenter) {
  if (!_repState || !_repState.candleSeries) return;
  const slice = _repState.candles.slice(0, _repState.index + 1);
  if (!slice.length) return;

  // Lightweight Charts renders a candle as a collapsed thin line
  // (not a proper body) if any bar in the series has a NaN field, a
  // duplicate timestamp, or an out-of-order timestamp — sanitize
  // defensively here rather than trust every upstream data source.
  const seen = new Set();
  const bars = [];
  let malformed = 0;
  const th = _repState.theme;
  const TRANSPARENT = 'rgba(0,0,0,0)';
  let prevClose = null;
  slice.forEach(c => {
    const time = Math.floor(c.time / 1000);
    const open = Number(c.open), high = Number(c.high), low = Number(c.low), close = Number(c.close);
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) { malformed++; return; }
    if (seen.has(time)) { malformed++; return; } // duplicate bucket after ms→sec rounding
    seen.add(time);
    const up = (th && th.colorBarsPrevClose && prevClose !== null) ? close >= prevClose : close >= open;
    prevClose = close;
    bars.push({
      time, open, high, low, close,
      color: th && !th.bodyVisible ? TRANSPARENT : (up ? th?.bodyUpColor : th?.bodyDownColor),
      borderColor: th && !th.borderVisible ? TRANSPARENT : (up ? th?.borderUpColor : th?.borderDownColor),
      wickColor: th && !th.wickVisible ? TRANSPARENT : (up ? th?.wickUpColor : th?.wickDownColor),
    });
  });
  bars.sort((a, b) => a.time - b.time);
  if (malformed) console.warn(`[Backtesting Lab] dropped ${malformed} malformed/duplicate candle(s) before rendering`);
  if (!bars.length) return;

  _repState.candleSeries.setData(bars);
  if (_repState.volumeSeries) {
    _repState.volumeSeries.setData(slice.map(c => ({
      time: Math.floor(c.time / 1000), value: c.volume || 0,
      color: c.close >= c.open ? 'rgba(52,211,153,.5)' : 'rgba(248,113,113,.5)',
    })));
  }
  _repApplyIndicators(slice);
  if (recenter) {
    const from = Math.max(0, bars.length - _repState.candlesPerView);
    _repState.chart.timeScale().setVisibleLogicalRange({ from, to: bars.length - 1 + 2 });
  }
  _repUpdateReplayHud();
  _repDrawOverlay();
}

function _repUpdateReplayHud() {
  if (!_repState) return;
  const total = _repState.candles.length;
  const pct = total > 1 ? (_repState.index / (total - 1)) * 100 : 0;
  const fill = document.getElementById('rep-progress-fill'); if (fill) fill.style.width = pct + '%';
  const slider = document.getElementById('rep-progress-slider'); if (slider) slider.value = pct;
  const counter = document.getElementById('rep-candle-counter'); if (counter) counter.textContent = `${_repState.index + 1} / ${total}`;
  const dateInput = document.getElementById('rep-jump-date');
  const c = _repState.candles[_repState.index];
  if (dateInput && c) dateInput.value = new Date(c.time).toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════
// COORDINATE HELPERS — bridge chart pixel space ↔ time/price
// ══════════════════════════════════════════════════════
function _repTimeMsToX(ms) {
  const x = _repState.chart.timeScale().timeToCoordinate(Math.floor(ms / 1000));
  return x;
}
function _repPriceToY(price) { return _repState.candleSeries.priceToCoordinate(price); }
function _repYToPrice(y) { return _repState.candleSeries.coordinateToPrice(y); }
function _repXToTimeMs(x) {
  const ts = _repState.chart.timeScale();
  const t = ts.coordinateToTime(x);
  if (t != null) return t * 1000;
  // extrapolate into empty space to the right (or left) of loaded data
  const logical = ts.coordinateToLogical(x);
  const slice = _repState.candles.slice(0, _repState.index + 1);
  if (logical == null || slice.length < 2) return null;
  const barMs = slice[slice.length - 1].time - slice[slice.length - 2].time;
  return slice[slice.length - 1].time + Math.round(logical - (slice.length - 1)) * barMs;
}
function _repSnapPoint(point) {
  if (!_repState.magnet) return point;
  const idx = _repIndexForTime(point.time);
  const c = _repState.candles[idx];
  if (!c) return point;
  const candidates = [c.open, c.high, c.low, c.close];
  let best = candidates[0], bestDist = Infinity;
  candidates.forEach(v => { const d = Math.abs(v - point.price); if (d < bestDist) { bestDist = d; best = v; } });
  return { time: c.time, price: best };
}
function _repPointFromPixel(x, y) {
  const time = _repXToTimeMs(x);
  const price = _repYToPrice(y);
  if (time == null || price == null) return null;
  return _repSnapPoint({ time, price });
}

// ══════════════════════════════════════════════════════
// OVERLAY RENDERING — drawings live in chart-relative time/
// price space and get re-projected to pixels every frame,
// so they stay glued to their candles through pan/zoom.
// ══════════════════════════════════════════════════════
function _repDrawOverlay() {
  if (!_repState || !_repState.overlayCtx) return;
  const ctx = _repState.overlayCtx, W = _repState.overlayW, H = _repState.overlayH;
  ctx.clearRect(0, 0, W, H);
  if (!_repState.drawingsHidden) {
    (_repState.drawings || []).forEach((dw, i) => { if (!dw.hidden) _repRenderOneDrawing(ctx, dw, i === _repState._hoverIdx, dw.id === _repState.selectedId); });
  }
  if (_repState.drawDraft && (_repState.drawDraft.p1 || _repState.drawDraft.points)) {
    const tool = REP_TOOLS.find(t => t.id === _repState.activeTool);
    const dp = tool ? _repToolDefaultProps(tool) : null;
    if (tool && tool.kind === 'brush') {
      _repRenderOneDrawing(ctx, { kind: 'brush', color: dp.color, points: _repState.drawDraft.points }, false, false);
    } else if (tool && tool.kind === 'path') {
      const pts = _repState.drawDraft.points.slice();
      if (_repState.drawDraft.cur) pts.push(_repState.drawDraft.cur);
      _repRenderOneDrawing(ctx, { kind: 'path', color: dp.color, dashed: true, width: dp.width, points: pts }, false, false);
    } else if (tool && _repState.drawDraft.cur) {
      _repRenderOneDrawing(ctx, {
        kind: tool.kind, color: dp.color, stroke: dp.stroke, dashed: dp.dashed, width: dp.width,
        arrow: tool.arrow, measure: tool.measure, label: tool.drawLabel, extension: tool.extension,
        extendLeft: dp.extendLeft, extendRight: dp.extendRight,
        p1: _repState.drawDraft.p1, p2: _repState.drawDraft.cur,
      }, false, false);
    }
  }
  if (_repState._manualCrosshair) _repRenderManualCrosshair(ctx);
}

function _repRenderManualCrosshair(ctx) {
  const { x, y } = _repState._manualCrosshair;
  ctx.save();
  ctx.strokeStyle = 'rgba(226,232,240,.28)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(_repState.overlayW, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, _repState.overlayH); ctx.stroke();
  ctx.restore();
}

function _repRenderOneDrawing(ctx, dw, hovered, selected) {
  ctx.save();
  ctx.strokeStyle = dw.stroke || dw.color; ctx.fillStyle = dw.color;
  const _baseW = dw.width || 1.5;
  ctx.lineWidth = selected ? _baseW + 0.75 : (hovered ? _baseW + 0.5 : _baseW);
  ctx.setLineDash(dw.dashed ? [5, 4] : []);

  const handles = [];

  if (dw.kind === 'hline') {
    const y = _repPriceToY(dw.p1.price); if (y == null) { ctx.restore(); return; }
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(_repState.overlayW - 2, y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = dw.color; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(dw.p1.price.toFixed(5), 6, y - 4);
    handles.push({ x: 40, y, key: 'p1' });
  } else if (dw.kind === 'vline') {
    const x = _repTimeMsToX(dw.p1.time); if (x == null) { ctx.restore(); return; }
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, _repState.overlayH); ctx.stroke();
    handles.push({ x, y: 30, key: 'p1' });
  } else if (dw.kind === 'rect' || dw.kind === 'circle') {
    const x1 = _repTimeMsToX(dw.p1.time), x2 = _repTimeMsToX(dw.p2.time);
    const y1 = _repPriceToY(dw.p1.price), y2 = _repPriceToY(dw.p2.price);
    if ([x1, x2, y1, y2].some(v => v == null)) { ctx.restore(); return; }
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
    ctx.setLineDash(dw.dashed ? [5, 4] : []);
    if (dw.kind === 'rect') { ctx.fillRect(rx, ry, rw, rh); ctx.strokeRect(rx, ry, rw, rh); }
    else { ctx.beginPath(); ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (dw.label) { ctx.setLineDash([]); ctx.fillStyle = dw.stroke || dw.color; ctx.font = '10px Plus Jakarta Sans, sans-serif'; ctx.fillText(dw.label, rx + 4, ry + 12); }
    handles.push({ x: x1, y: y1, key: 'p1' }, { x: x2, y: y2, key: 'p2' });
  } else if (dw.kind === 'line' || dw.kind === 'ray') {
    let x1 = _repTimeMsToX(dw.p1.time), y1 = _repPriceToY(dw.p1.price);
    let x2 = _repTimeMsToX(dw.p2.time), y2 = _repPriceToY(dw.p2.price);
    if ([x1, y1, x2, y2].some(v => v == null)) { ctx.restore(); return; }
    const origX1 = x1, origY1 = y1;
    const slope = (x2 !== x1) ? (y2 - y1) / (x2 - x1) : null;
    if ((dw.kind === 'ray' || dw.extendRight) && slope != null) {
      const edgeX = _repState.overlayW;
      const edgeY = y1 + slope * (edgeX - x1);
      x2 = edgeX; y2 = edgeY;
    }
    if (dw.kind === 'line' && dw.extendLeft && slope != null) {
      const edgeX = 0;
      const edgeY = y1 + slope * (edgeX - x1);
      x1 = edgeX; y1 = edgeY;
    }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (dw.arrow) {
      const angle = Math.atan2(y2 - y1, x2 - x1), len = 9;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x2, y2); ctx.lineTo(x2 - len * Math.cos(angle - Math.PI / 6), y2 - len * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2); ctx.lineTo(x2 - len * Math.cos(angle + Math.PI / 6), y2 - len * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
    if (dw.measure) {
      const dPrice = dw.p2.price - dw.p1.price;
      const dMin = Math.round((dw.p2.time - dw.p1.time) / 60000);
      const pips = Math.abs(dPrice) * (dw.p1.price < 20 ? 10000 : 100);
      ctx.setLineDash([]); ctx.fillStyle = dw.color; ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(5)}  (${pips.toFixed(1)}p)  ${dMin}m`, (x1 + x2) / 2 + 8, (y1 + y2) / 2 - 8);
    }
    const origX2 = _repTimeMsToX(dw.p2.time), origY2 = _repPriceToY(dw.p2.price);
    handles.push({ x: origX1, y: origY1, key: 'p1' }, { x: origX2 ?? x2, y: origY2 ?? y2, key: 'p2' });
  } else if (dw.kind === 'fib') {
    const levels = dw.extension ? [0, 0.618, 1, 1.272, 1.618, 2, 2.618] : [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const x1 = _repTimeMsToX(dw.p1.time), x2 = _repTimeMsToX(dw.p2.time);
    if (x1 == null || x2 == null) { ctx.restore(); return; }
    levels.forEach(l => {
      const price = dw.p1.price + (dw.p2.price - dw.p1.price) * l;
      const y = _repPriceToY(price); if (y == null) return;
      ctx.beginPath(); ctx.moveTo(Math.min(x1, x2), y); ctx.lineTo(Math.max(x1, x2), y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = dw.color; ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(`${l} (${price.toFixed(5)})`, Math.max(x1, x2) + 4, y + 3);
      ctx.setLineDash(dw.dashed ? [5, 4] : []);
    });
    const y1 = _repPriceToY(dw.p1.price), y2 = _repPriceToY(dw.p2.price);
    handles.push({ x: x1, y: y1, key: 'p1' }, { x: x2, y: y2, key: 'p2' });
  } else if (dw.kind === 'text') {
    const x = _repTimeMsToX(dw.p1.time), y = _repPriceToY(dw.p1.price);
    if (x == null || y == null) { ctx.restore(); return; }
    ctx.setLineDash([]); ctx.fillStyle = dw.color; ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
    ctx.fillText(dw.text || '', x, y);
    handles.push({ x, y, key: 'p1' });
  } else if (dw.kind === 'brush') {
    const pts = (dw.points || []).map(p => ({ x: _repTimeMsToX(p.time), y: _repPriceToY(p.price) })).filter(p => p.x != null && p.y != null);
    if (pts.length < 2) { ctx.restore(); return; }
    ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  } else if (dw.kind === 'path') {
    const raw = (dw.points || []).map(p => ({ tp: p, x: _repTimeMsToX(p.time), y: _repPriceToY(p.price) }));
    const pts = raw.filter(p => p.x != null && p.y != null);
    if (pts.length < 2) { ctx.restore(); return; }
    ctx.setLineDash(dw.dashed ? [5, 4] : []); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    raw.forEach((p, idx) => { if (p.x != null && p.y != null) handles.push({ x: p.x, y: p.y, key: 'pt' + idx }); });
  } else if (dw.kind === 'callout') {
    const x1 = _repTimeMsToX(dw.p1.time), y1 = _repPriceToY(dw.p1.price);
    const x2 = _repTimeMsToX(dw.p2.time), y2 = _repPriceToY(dw.p2.price);
    if ([x1, y1, x2, y2].some(v => v == null)) { ctx.restore(); return; }
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, Math.PI * 2); ctx.fillStyle = dw.color; ctx.fill();
    const text = dw.text || 'Note';
    ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
    const tw = ctx.measureText(text).width;
    const bx = x2 < x1 ? x2 - tw - 10 : x2, by = y2 - 20;
    ctx.fillStyle = 'rgba(15,23,41,.85)';
    ctx.fillRect(bx - 6, by - 2, tw + 12, 22);
    ctx.strokeRect(bx - 6, by - 2, tw + 12, 22);
    ctx.fillStyle = dw.color;
    ctx.fillText(text, bx, by + 14);
    handles.push({ x: x1, y: y1, key: 'p1' }, { x: x2, y: y2, key: 'p2' });
  } else if (dw.kind === 'gannbox') {
    const x1 = _repTimeMsToX(dw.p1.time), x2 = _repTimeMsToX(dw.p2.time);
    const y1 = _repPriceToY(dw.p1.price), y2 = _repPriceToY(dw.p2.price);
    if ([x1, x2, y1, y2].some(v => v == null)) { ctx.restore(); return; }
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
    ctx.setLineDash([]);
    if (dw.color && dw.color !== 'transparent') { ctx.fillStyle = dw.color; ctx.fillRect(rx, ry, rw, rh); }
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(x2, y1); ctx.stroke();
    ctx.setLineDash([4, 3]);
    [0.25, 0.5, 0.75].forEach(f => {
      ctx.beginPath(); ctx.moveTo(rx, ry + rh * f); ctx.lineTo(rx + rw, ry + rh * f); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx + rw * f, ry); ctx.lineTo(rx + rw * f, ry + rh); ctx.stroke();
    });
    handles.push({ x: x1, y: y1, key: 'p1' }, { x: x2, y: y2, key: 'p2' });
  } else if (dw.kind === 'pricerange') {
    const x1 = _repTimeMsToX(dw.p1.time), x2 = _repTimeMsToX(dw.p2.time);
    const y1 = _repPriceToY(dw.p1.price), y2 = _repPriceToY(dw.p2.price);
    if ([x1, x2, y1, y2].some(v => v == null)) { ctx.restore(); return; }
    const rx = Math.min(x1, x2), rw = Math.abs(x2 - x1) || 1;
    ctx.setLineDash([]);
    ctx.strokeRect(rx, Math.min(y1, y2), rw, Math.abs(y2 - y1));
    ctx.beginPath(); ctx.moveTo(rx, y1); ctx.lineTo(rx + rw, y1); ctx.moveTo(rx, y2); ctx.lineTo(rx + rw, y2); ctx.stroke();
    const diff = dw.p2.price - dw.p1.price;
    const pct = dw.p1.price ? (diff / dw.p1.price * 100) : 0;
    ctx.fillStyle = diff >= 0 ? '#34d399' : '#f87171'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(`${diff >= 0 ? '+' : ''}${diff.toFixed(5)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`, rx + rw + 6, (y1 + y2) / 2);
    handles.push({ x: x1, y: y1, key: 'p1' }, { x: x2, y: y2, key: 'p2' });
  } else if (dw.kind === 'longposition' || dw.kind === 'shortposition') {
    const isLong = dw.kind === 'longposition';
    const x1 = _repTimeMsToX(dw.p1.time), x2 = _repTimeMsToX(dw.p2.time);
    const yEntry = _repPriceToY(dw.p1.price), yTarget = _repPriceToY(dw.p2.price);
    if ([x1, x2, yEntry, yTarget].some(v => v == null)) { ctx.restore(); return; }
    const rx = Math.min(x1, x2), rw = Math.abs(x2 - x1) || 60;
    const profitDist = dw.p2.price - dw.p1.price;
    const stopRatio = dw.stopRatio ?? 0.5;
    const stopPrice = dw.p1.price - profitDist * stopRatio;
    const yStop = _repPriceToY(stopPrice);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(52,211,153,.22)';
    ctx.fillRect(rx, Math.min(yEntry, yTarget), rw, Math.abs(yTarget - yEntry));
    if (yStop != null) { ctx.fillStyle = 'rgba(248,113,113,.22)'; ctx.fillRect(rx, Math.min(yEntry, yStop), rw, Math.abs(yStop - yEntry)); }
    ctx.strokeStyle = dw.stroke || dw.color;
    ctx.beginPath(); ctx.moveTo(rx, yEntry); ctx.lineTo(rx + rw, yEntry); ctx.stroke();
    const pct = dw.p1.price ? (profitDist / dw.p1.price * 100) : 0;
    const rr = stopRatio > 0 ? (1 / stopRatio) : 0;
    ctx.setLineDash([]); ctx.fillStyle = '#e2e8f0'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(`${isLong ? 'Long' : 'Short'}  R:R ${rr.toFixed(2)}  Target ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, rx + 4, Math.min(yEntry, yTarget) - 4);
    handles.push({ x: x1, y: yEntry, key: 'p1' }, { x: x2, y: yTarget, key: 'p2' });
  } else if (dw.kind === 'fixedrangevp') {
    const t1 = Math.min(dw.p1.time, dw.p2.time), t2 = Math.max(dw.p1.time, dw.p2.time);
    const x1 = _repTimeMsToX(dw.p1.time), x2 = _repTimeMsToX(dw.p2.time);
    if (x1 == null || x2 == null) { ctx.restore(); return; }
    const candles = (_repState.candles || []).filter(c => c.time >= t1 && c.time <= t2);
    if (candles.length) {
      const rows = dw.rows || 24;
      const lo = Math.min(...candles.map(c => c.low)), hi = Math.max(...candles.map(c => c.high));
      if (hi > lo) {
        const bins = new Array(rows).fill(0).map(() => ({ up: 0, down: 0 }));
        candles.forEach(c => {
          const mid = (c.high + c.low) / 2;
          let idx = Math.floor((mid - lo) / (hi - lo) * rows);
          idx = Math.max(0, Math.min(rows - 1, idx));
          if (c.close >= c.open) bins[idx].up += (c.volume || 1); else bins[idx].down += (c.volume || 1);
        });
        const maxVol = Math.max(...bins.map(b => b.up + b.down), 1);
        const rightX = Math.max(x1, x2);
        const maxBarW = Math.abs(x2 - x1) || 80;
        ctx.setLineDash([]);
        for (let r = 0; r < rows; r++) {
          const priceLo = lo + (hi - lo) * r / rows, priceHi = lo + (hi - lo) * (r + 1) / rows;
          const yTop = _repPriceToY(priceHi), yBot = _repPriceToY(priceLo);
          if (yTop == null || yBot == null) continue;
          const h = Math.max(1, yBot - yTop) - 1;
          const total = bins[r].up + bins[r].down;
          const w = (total / maxVol) * maxBarW;
          const upW = total ? w * (bins[r].up / total) : 0;
          ctx.fillStyle = 'rgba(248,113,113,.5)'; ctx.fillRect(rightX - w, yTop, w - upW, h);
          ctx.fillStyle = 'rgba(52,211,153,.5)'; ctx.fillRect(rightX - upW, yTop, upW, h);
        }
      }
    }
    ctx.strokeStyle = dw.stroke || dw.color; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, _repState.overlayH); ctx.moveTo(x2, 0); ctx.lineTo(x2, _repState.overlayH); ctx.stroke();
    const yHi = _repPriceToY(dw.p2.price), yLo = _repPriceToY(dw.p1.price);
    handles.push({ x: x1, y: yLo, key: 'p1' }, { x: x2, y: yHi, key: 'p2' });
  }

  if (selected) {
    ctx.setLineDash([]);
    handles.forEach(h => {
      if (h.x == null || h.y == null) return;
      ctx.beginPath(); ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0e14'; ctx.fill();
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke();
    });
  }
  ctx.restore();
  Object.defineProperty(dw, '_handles', { value: handles, writable: true, configurable: true, enumerable: false });
}

// ── Hit-testing for the selection tool ──────────────────
function _repDistToSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D, lenSq = C * C + D * D;
  let t = lenSq ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  const ex = x1 + t * C, ey = y1 + t * D;
  return Math.hypot(px - ex, py - ey);
}
function _repHitTest(px, py) {
  const list = _repState.drawings;
  for (let i = list.length - 1; i >= 0; i--) {
    const dw = list[i];
    const handles = dw._handles || [];
    for (const h of handles) {
      if (h.x == null || h.y == null) continue;
      if (Math.hypot(px - h.x, py - h.y) <= 6) return { drawing: dw, index: i, handle: h.key };
    }
    if (dw.kind === 'hline') { const y = _repPriceToY(dw.p1.price); if (y != null && Math.abs(py - y) <= 5) return { drawing: dw, index: i, handle: 'body' }; }
    else if (dw.kind === 'vline') { const x = _repTimeMsToX(dw.p1.time); if (x != null && Math.abs(px - x) <= 5) return { drawing: dw, index: i, handle: 'body' }; }
    else if (dw.kind === 'line' || dw.kind === 'ray' || dw.kind === 'measure' || dw.kind === 'callout') {
      const x1 = _repTimeMsToX(dw.p1.time), y1 = _repPriceToY(dw.p1.price), x2 = _repTimeMsToX(dw.p2.time), y2 = _repPriceToY(dw.p2.price);
      if ([x1, y1, x2, y2].every(v => v != null) && _repDistToSegment(px, py, x1, y1, x2, y2) <= 6) return { drawing: dw, index: i, handle: 'body' };
    } else if (dw.kind === 'path') {
      const pts = (dw.points || []).map(p => ({ x: _repTimeMsToX(p.time), y: _repPriceToY(p.price) }));
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        if (a.x != null && a.y != null && b.x != null && b.y != null && _repDistToSegment(px, py, a.x, a.y, b.x, b.y) <= 6) return { drawing: dw, index: i, handle: 'body' };
      }
    } else if (dw.kind === 'rect' || dw.kind === 'circle' || dw.kind === 'fib' || dw.kind === 'gannbox' || dw.kind === 'pricerange' || dw.kind === 'longposition' || dw.kind === 'shortposition' || dw.kind === 'fixedrangevp') {
      const x1 = _repTimeMsToX(dw.p1.time), x2 = _repTimeMsToX(dw.p2.time), y1 = _repPriceToY(dw.p1.price), y2 = _repPriceToY(dw.p2.price);
      if ([x1, x2, y1, y2].every(v => v != null)) {
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return { drawing: dw, index: i, handle: 'body' };
      }
    } else if (dw.kind === 'text') {
      const x = _repTimeMsToX(dw.p1.time), y = _repPriceToY(dw.p1.price);
      if (x != null && y != null && px >= x - 4 && px <= x + 90 && py >= y - 14 && py <= y + 6) return { drawing: dw, index: i, handle: 'body' };
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════
// OVERLAY MOUSE / WHEEL / CONTEXT-MENU HANDLERS
// ══════════════════════════════════════════════════════
function _repOverlayLocalXY(e) {
  const rect = document.getElementById('rep-overlay').getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// Merges a tool's saved defaults (set via its Settings dialog) with
// its built-in base style, for use whenever a NEW drawing of that
// tool is placed.
function _repToolDefaultProps(tool) {
  const d = (_repState.toolDefaults && _repState.toolDefaults[tool.id]) || {};
  return {
    color: d.color ?? tool.color,
    stroke: d.stroke ?? tool.stroke,
    dashed: d.dashed ?? tool.dashed ?? false,
    width: d.width ?? 1.5,
    extendLeft: d.extendLeft ?? false,
    extendRight: d.extendRight ?? false,
    stopRatio: d.stopRatio ?? 0.5,
    qty: d.qty ?? 1,
    rows: d.rows ?? 24,
  };
}

function _repOverlayMouseDown(e) {
  if (!_repState) return;
  const { x, y } = _repOverlayLocalXY(e);
  _repHideContextMenu();

  // Cursor mode = no drawing tool picked, or the arrow/select tool
  // explicitly picked. Both behave identically — click a drawing to
  // select/drag it, click empty space to pan — exactly like
  // TradingView's default "Cross"/arrow cursor, which is always live
  // rather than something you have to switch to first.
  const cursorMode = !_repState.activeTool || _repState.activeTool === 'select';
  if (cursorMode) {
    const hit = _repHitTest(x, y);
    const overlayEl = document.getElementById('rep-overlay');
    if (hit) {
      _repState.selectedId = hit.drawing.id;
      if (!_repState.drawingsLocked) {
        _repPushHistory();
        _repState._dragging = { drawing: hit.drawing, handle: hit.handle, startX: x, startY: y, orig: JSON.parse(JSON.stringify(hit.drawing)) };
        overlayEl?.classList.add('dragging');
      }
    } else {
      _repState.selectedId = null;
      _repState._panning = { startX: x, startLogical: _repState.chart.timeScale().getVisibleLogicalRange() };
      overlayEl?.classList.add('dragging');
    }
    _repDrawOverlay();
    return;
  }

  const tool = REP_TOOLS.find(t => t.id === _repState.activeTool);
  const point = _repPointFromPixel(x, y); if (!point) return;
  const dp = _repToolDefaultProps(tool);

  if (tool.kind === 'hline') { _repPushHistory(); _repState.drawings.push({ id: _repUid(), type: tool.id, kind: 'hline', color: dp.color, dashed: dp.dashed, width: dp.width, p1: { price: point.price } }); _repFinishToolPlacement(); return; }
  if (tool.kind === 'vline') { _repPushHistory(); _repState.drawings.push({ id: _repUid(), type: tool.id, kind: 'vline', color: dp.color, dashed: dp.dashed, width: dp.width, p1: { time: point.time } }); _repFinishToolPlacement(); return; }
  if (tool.kind === 'text') {
    const txt = prompt('Annotation text:');
    if (txt) { _repPushHistory(); _repState.drawings.push({ id: _repUid(), type: tool.id, kind: 'text', color: dp.color, p1: point, text: txt }); }
    _repFinishToolPlacement(); return;
  }
  if (tool.kind === 'brush') { _repState.drawDraft = { p1: point, points: [point] }; return; }
  if (tool.kind === 'path') {
    if (_repState.drawDraft && _repState.drawDraft.points) { _repState.drawDraft.points.push(point); }
    else { _repState.drawDraft = { points: [point] }; }
    _repDrawOverlay();
    return;
  }
  _repState.drawDraft = { p1: point, cur: point };
}

function _repOverlayMouseMove(e) {
  if (!_repState) return;
  const { x, y } = _repOverlayLocalXY(e);

  if (_repState._panning) {
    const dxPx = x - _repState._panning.startX;
    const barW = _repState.overlayW / Math.max(1, _repState.candlesPerView);
    const deltaBars = dxPx / barW;
    const r = _repState._panning.startLogical;
    if (r) _repState.chart.timeScale().setVisibleLogicalRange({ from: r.from - deltaBars, to: r.to - deltaBars });
    return;
  }
  if (_repState._dragging) {
    const d = _repState._dragging;
    const point = _repPointFromPixel(x, y); if (!point) return;
    if (d.drawing.kind === 'hline') d.drawing.p1.price = point.price;
    else if (d.drawing.kind === 'vline') d.drawing.p1.time = point.time;
    else if (d.drawing.kind === 'text') d.drawing.p1 = point;
    else if (d.handle === 'p1') d.drawing.p1 = point;
    else if (d.handle === 'p2') d.drawing.p2 = point;
    else if (typeof d.handle === 'string' && d.handle.indexOf('pt') === 0 && d.drawing.points) {
      const idx = parseInt(d.handle.slice(2), 10);
      if (!isNaN(idx) && d.drawing.points[idx]) d.drawing.points[idx] = point;
    }
    else if (d.handle === 'body') {
      const startPoint = _repPointFromPixel(d.startX, d.startY);
      if (startPoint && d.orig.p1) {
        const dt = point.time - startPoint.time, dp = point.price - startPoint.price;
        d.drawing.p1 = { time: d.orig.p1.time + dt, price: d.orig.p1.price + dp };
        if (d.orig.p2) d.drawing.p2 = { time: d.orig.p2.time + dt, price: d.orig.p2.price + dp };
      } else if (startPoint && d.orig.points) {
        const dt = point.time - startPoint.time, dp = point.price - startPoint.price;
        d.drawing.points = d.orig.points.map(pt => ({ time: pt.time + dt, price: pt.price + dp }));
      }
    }
    _repDrawOverlay();
    return;
  }
  if (_repState.drawDraft) {
    const tool = REP_TOOLS.find(t => t.id === _repState.activeTool);
    const point = _repPointFromPixel(x, y); if (!point) return;
    if (tool && tool.kind === 'brush') _repState.drawDraft.points.push(point);
    else _repState.drawDraft.cur = point;
    _repDrawOverlay();
    return;
  }
  const hit = _repHitTest(x, y);
  _repState._hoverIdx = hit ? hit.index : -1;
  if (!_repState.activeTool || _repState.activeTool === 'select') {
    e.currentTarget.style.cursor = hit ? 'pointer' : 'default';
  } else if (e.currentTarget.style.cursor) {
    e.currentTarget.style.cursor = '';
  }
  _repState._manualCrosshair = { x, y };
  const point = _repPointFromPixel(x, y);
  if (point) _repUpdateOhlcBadge(point.time);
  _repDrawOverlay();
}

function _repOverlayMouseUp() {
  if (!_repState) return;
  document.getElementById('rep-overlay')?.classList.remove('dragging');
  if (_repState._panning) { _repState._panning = null; return; }
  if (_repState._dragging) { _repState._dragging = null; _repSaveState(); return; }
  if (_repState.drawDraft) {
    const tool = REP_TOOLS.find(t => t.id === _repState.activeTool);
    const dp = tool ? _repToolDefaultProps(tool) : null;
    if (tool && tool.kind === 'brush') {
      if (_repState.drawDraft.points.length > 1) { _repPushHistory(); _repState.drawings.push({ id: _repUid(), type: tool.id, kind: 'brush', color: dp.color, dashed: dp.dashed, points: _repState.drawDraft.points }); }
      _repState.drawDraft = null; _repFinishToolPlacement(); return;
    }
    if (tool && tool.kind === 'path') { return; } // multi-click tool — finished via double-click (see _repFinishPathDraft)
    if (tool && tool.kind === 'callout' && _repState.drawDraft.cur) {
      const txt = prompt('Callout text:');
      if (txt) {
        _repPushHistory();
        _repState.drawings.push({ id: _repUid(), type: tool.id, kind: 'callout', color: dp.color, width: dp.width, text: txt, p1: _repState.drawDraft.p1, p2: _repState.drawDraft.cur });
      }
      _repState.drawDraft = null; _repFinishToolPlacement(); return;
    }
    if (tool && _repState.drawDraft.cur) {
      _repPushHistory();
      _repState.drawings.push({
        id: _repUid(), type: tool.id, kind: tool.kind, color: dp.color, stroke: dp.stroke,
        dashed: dp.dashed, width: dp.width, arrow: tool.arrow, measure: tool.measure, label: tool.drawLabel, extension: tool.extension,
        extendLeft: dp.extendLeft, extendRight: dp.extendRight,
        ...((tool.kind === 'longposition' || tool.kind === 'shortposition') ? { stopRatio: dp.stopRatio, qty: dp.qty } : {}),
        ...(tool.kind === 'fixedrangevp' ? { rows: dp.rows } : {}),
        p1: _repState.drawDraft.p1, p2: _repState.drawDraft.cur,
      });
    }
    _repState.drawDraft = null;
    _repFinishToolPlacement();
  }
}

// Path is a multi-click polyline tool: each click (handled in
// _repOverlayMouseDown) appends a point to the in-progress draft and
// mouseup deliberately leaves it open (see above). Double-clicking —
// or calling this directly — commits the accumulated points as one
// drawing and clears the draft.
function _repFinishPathDraft() {
  if (!_repState || !_repState.drawDraft || !_repState.drawDraft.points) return;
  const tool = REP_TOOLS.find(t => t.id === _repState.activeTool);
  const dp = tool ? _repToolDefaultProps(tool) : null;
  if (_repState.drawDraft.points.length > 1) {
    _repPushHistory();
    _repState.drawings.push({ id: _repUid(), type: (tool && tool.id) || 'path', kind: 'path', color: (dp && dp.color) || '#38bdf8', dashed: dp && dp.dashed, width: dp && dp.width, points: _repState.drawDraft.points });
  }
  _repState.drawDraft = null;
  _repFinishToolPlacement();
}

function _repOverlayWheel(e) {
  e.preventDefault();
  _repZoom(e.deltaY > 0 ? 1 : -1);
}

function _repOverlayDblClick(e) {
  if (_repState?.drawDraft?.points) {
    const tool = REP_TOOLS.find(t => t.id === _repState.activeTool);
    if (tool && tool.kind === 'path') { _repFinishPathDraft(); return; }
    _repOverlayMouseUp(); return;
  }
  if (!_repState || _repState.drawDraft) return;
  if (e) {
    const { x, y } = _repOverlayLocalXY(e);
    const hit = _repHitTest(x, y);
    if (hit) { _repOpenDrawingSettingsModal(hit.drawing.id); return; }
  }
  if (_repState.activeTool) return;
  _repOpenSettingsModal();
}

function _repOverlayContextMenu(e) {
  e.preventDefault();
  if (!_repState) return;
  const { x, y } = _repOverlayLocalXY(e);
  const hit = _repHitTest(x, y);
  if (!hit) { _repHideContextMenu(); return; }
  _repState.selectedId = hit.drawing.id;
  _repDrawOverlay();
  _repShowContextMenu(e.clientX, e.clientY, hit.drawing, hit.index);
}

function _repFinishToolPlacement() {
  if (_repState.activeTool && _repState.activeTool !== 'select') _repState.activeTool = null;
  _repUpdateToolbarActive();
  _repSaveState();
  _repDrawOverlay();
}

function _repUpdateOhlcBadge(timeMs) {
  const idx = _repIndexForTime(timeMs);
  const c = _repState.candles[Math.min(idx, _repState.index)];
  const badge = document.getElementById('rep-ohlc-badge'); if (!badge || !c) return;
  const up = c.close >= c.open;
  const d = new Date(c.time);
  badge.style.display = 'flex';
  badge.innerHTML = `<span>${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    <span>O <b>${c.open.toFixed(5)}</b></span><span>H <b>${c.high.toFixed(5)}</b></span>
    <span>L <b>${c.low.toFixed(5)}</b></span><span class="${up ? 'up' : 'dn'}">C <b>${c.close.toFixed(5)}</b></span>`;
}

function _repNativeCrosshairUpdate(param) {
  if (!_repState || _repState.activeTool) return;
  if (!param || !param.time) { const b = document.getElementById('rep-ohlc-badge'); if (b) b.style.display = 'none'; return; }
  _repUpdateOhlcBadge(param.time * 1000);
}

// ══════════════════════════════════════════════════════
// TOOLBAR / TOGGLES
// ══════════════════════════════════════════════════════
// ── Tool-group flyouts (Lines / Fibonacci / Shapes / Smart Money) ──
// TradingView collapses related tools behind one button + a small
// corner caret; clicking the caret pops this panel out next to it.
const REP_TOOL_GROUP_LABELS = { lines: 'Lines', fib: 'Fibonacci', shapes: 'Shapes', forecast: 'Forecasting', ict: 'Smart Money', text: 'Text' };
function _repToggleToolFlyout(e, groupId) {
  e.stopPropagation();
  const flyout = document.getElementById('rep-tool-flyout');
  const groupEl = document.querySelector(`.rep-tool-group[data-group="${groupId}"]`);
  if (!flyout || !groupEl || !_repState) return;

  // Clicking the same group's caret again closes it.
  if (flyout.classList.contains('open') && flyout.dataset.group === groupId) {
    _repCloseToolFlyout();
    return;
  }
  _repClosePopovers();
  const tools = REP_TOOLS.filter(t => t.group === groupId);
  const chosenId = (_repState.toolGroupChoice && _repState.toolGroupChoice[groupId]) || tools[0]?.id;
  flyout.innerHTML = `<div class="rep-popover-title">${REP_TOOL_GROUP_LABELS[groupId] || ''}</div>` + tools.map(t => `
    <button class="rep-flyout-item${t.id === chosenId ? ' active' : ''}" style="display:flex;align-items:center;gap:8px" onclick="_repPickGroupTool('${groupId}','${t.id}')">
      ${_repIcon(t.icon || t.id, 'icn')}<span style="flex:1;text-align:left">${t.label}</span>
      <span onclick="event.stopPropagation();_repCloseToolFlyout();_repOpenToolSettingsModal('${t.id}')" title="${t.label} settings" style="display:inline-flex;padding:3px;border-radius:4px;opacity:.6;cursor:pointer" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.6">
        <svg class="icn" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.2a1.7 1.7 0 013.4 0 1.7 1.7 0 002.5 1.5 1.7 1.7 0 012.4 2.4A1.7 1.7 0 0020.1 10a1.7 1.7 0 010 3.4 1.7 1.7 0 00-1.5 2.5 1.7 1.7 0 01-2.4 2.4A1.7 1.7 0 0013.7 20a1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.5-1.5 1.7 1.7 0 01-2.4-2.4A1.7 1.7 0 003.9 13.4a1.7 1.7 0 010-3.4 1.7 1.7 0 001.5-2.5 1.7 1.7 0 012.4-2.4A1.7 1.7 0 0010.3 3.2z"/><circle cx="12" cy="12" r="3.2"/></svg>
      </span>
    </button>`).join('');
  flyout.dataset.group = groupId;
  const rect = groupEl.getBoundingClientRect();
  flyout.style.top = rect.top + 'px';
  flyout.style.left = (rect.right + 8) + 'px';
  flyout.classList.add('open');
  setTimeout(() => document.addEventListener('click', _repCloseToolFlyout, { once: true }), 0);
}
function _repCloseToolFlyout() { document.getElementById('rep-tool-flyout')?.classList.remove('open'); }
function _repPickGroupTool(groupId, toolId) {
  if (!_repState) return;
  _repState.toolGroupChoice = _repState.toolGroupChoice || {};
  _repState.toolGroupChoice[groupId] = toolId;
  _repCloseToolFlyout();
  _repSetTool(toolId);
  // Refresh just this group's main button so its icon/tooltip match
  // the newly-picked tool, without re-rendering the whole toolbar.
  const groupEl = document.querySelector(`.rep-tool-group[data-group="${groupId}"] .rep-tool-group-main`);
  const tool = REP_TOOLS.find(t => t.id === toolId);
  if (groupEl && tool) {
    groupEl.innerHTML = _repIcon(tool.icon || tool.id, 'icn');
    groupEl.dataset.tool = tool.id;
    groupEl.dataset.tip = tool.label;
    groupEl.classList.toggle('active', _repState.activeTool === tool.id);
  }
}

function _repSetTool(id) {
  _repState.activeTool = (_repState.activeTool === id) ? null : id;
  _repState.drawDraft = null;
  _repUpdateToolbarActive();
}
function _repUpdateToolbarActive() {
  document.querySelectorAll('.rep-tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === _repState.activeTool));
  const overlay = document.getElementById('rep-overlay');
  if (overlay) {
    overlay.classList.toggle('drawing', !!_repState.activeTool && _repState.activeTool !== 'select');
    overlay.style.cursor = '';
  }
  if (!_repState.activeTool) { _repState._manualCrosshair = null; _repDrawOverlay?.(); }
}
// ── Toolbar hover tooltips ───────────────────────────────
// The left toolbar scrolls vertically (overflow-y:auto) and clips
// horizontally (overflow-x:hidden) so a tool button's tooltip can't
// just be an absolutely-positioned child of the button — it'd be cut
// off at the toolbar's right edge. Instead we drive a single shared
// tooltip element (position:fixed, rendered at the overlay's top
// level) and reposition it next to whichever button is hovered.
let _repTipTimer = null;
function _repShowTip(e) {
  const btn = e.currentTarget;
  const label = btn.dataset.tip;
  const tip = document.getElementById('rep-floating-tooltip');
  if (!label || !tip) return;
  const rect = btn.getBoundingClientRect();
  tip.textContent = label;
  tip.style.left = `${rect.right + 8}px`;
  tip.style.top = `${rect.top + rect.height / 2}px`;
  clearTimeout(_repTipTimer);
  _repTipTimer = setTimeout(() => tip.classList.add('show'), 400);
}
function _repHideTip() {
  clearTimeout(_repTipTimer);
  document.getElementById('rep-floating-tooltip')?.classList.remove('show');
}

function _repToggleMagnet() {
  _repState.magnet = !_repState.magnet;
  document.getElementById('rep-magnet-btn')?.classList.toggle('on', _repState.magnet);
  _repSaveState();
}
// Locking freezes every existing drawing in place — the select tool
// can still click one to open its context menu (e.g. to unlock just
// that one), but drag handles stop responding. New drawings can still
// be placed; they just aren't affected by the lock.
function _repToggleDrawingsLocked() {
  if (!_repState) return;
  _repState.drawingsLocked = !_repState.drawingsLocked;
  document.getElementById('rep-lock-btn')?.classList.toggle('on', _repState.drawingsLocked);
  _repSaveState();
}
// Hides every drawing from the canvas without deleting them —
// toggle again to bring them all back exactly as they were.
function _repToggleDrawingsHidden() {
  if (!_repState) return;
  _repState.drawingsHidden = !_repState.drawingsHidden;
  const btn = document.getElementById('rep-hide-btn');
  if (btn) { btn.classList.toggle('on', _repState.drawingsHidden); btn.innerHTML = _repIcon(_repState.drawingsHidden ? 'eyeOff' : 'eye', 'icn'); }
  _repDrawOverlay();
  _repSaveState();
}
function _repToggleLoop() {
  _repState.loop = !_repState.loop;
  document.getElementById('rep-loop-btn')?.classList.toggle('active', _repState.loop);
  _repSaveState();
}
function _repToggleSkipWeekends() {
  _repState.skipWeekends = !_repState.skipWeekends;
  document.getElementById('rep-weekend-btn')?.classList.toggle('active', _repState.skipWeekends);
  _repSaveState();
}
function _repClearDrawings() {
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>',
    title: 'Clear All Drawings?',
    body: 'Every trendline, zone, and annotation on this chart will be removed. This cannot be undone.',
    confirmLabel: 'Clear Drawings',
    confirmClass: 'glass-btn-danger',
    onConfirm: () => {
      if (!_repState) return;
      _repPushHistory();
      _repState.drawings = [];
      _repState.selectedId = null;
      _repSaveState(); _repDrawOverlay();
    }
  });
}
function _repDeleteSelected() {
  if (!_repState || !_repState.selectedId) { _repHideContextMenu(); return; }
  _repPushHistory();
  _repState.drawings = _repState.drawings.filter(d => d.id !== _repState.selectedId);
  _repState.selectedId = null;
  _repSaveState(); _repDrawOverlay(); _repHideContextMenu();
}
function _repDuplicateSelected() {
  if (!_repState || !_repState.selectedId) { _repHideContextMenu(); return; }
  const dw = _repState.drawings.find(d => d.id === _repState.selectedId); if (!dw) return;
  const barMs = ((_repState.candles[1]?.time - _repState.candles[0]?.time) || 3600000) * 6;
  const shift = pt => pt && pt.time != null ? { ...pt, time: pt.time + barMs } : pt;
  const clone = JSON.parse(JSON.stringify(dw));
  clone.id = _repUid();
  if (clone.p1) clone.p1 = shift(clone.p1);
  if (clone.p2) clone.p2 = shift(clone.p2);
  if (clone.points) clone.points = clone.points.map(shift);
  _repPushHistory();
  _repState.drawings.push(clone);
  _repState.selectedId = clone.id;
  _repSaveState(); _repDrawOverlay(); _repHideContextMenu();
}
function _repChangeLayer(dir) {
  if (!_repState || !_repState.selectedId) return;
  const list = _repState.drawings;
  const i = list.findIndex(d => d.id === _repState.selectedId); if (i < 0) return;
  const j = dir > 0 ? i + 1 : i - 1;
  if (j < 0 || j >= list.length) return;
  _repPushHistory();
  [list[i], list[j]] = [list[j], list[i]];
  _repSaveState(); _repDrawOverlay(); _repHideContextMenu();
}
function _repSetDrawingColor(color) {
  if (!_repState || !_repState.selectedId) return;
  const dw = _repState.drawings.find(d => d.id === _repState.selectedId); if (!dw) return;
  _repPushHistory();
  dw.color = color; if (dw.stroke) dw.stroke = color;
  _repSaveState(); _repDrawOverlay(); _repHideContextMenu();
}

// ── Right-click context menu ─────────────────────────────
const REP_CTX_COLORS = ['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#f472b6', '#e2e8f0'];
function _repShowContextMenu(clientX, clientY, drawing, index) {
  const menu = document.getElementById('rep-ctx-menu'); if (!menu) return;
  menu.innerHTML = `
    <div class="rep-ctx-item" onclick="_repOpenDrawingSettingsModal('${drawing.id}')"><svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.2a1.7 1.7 0 013.4 0 1.7 1.7 0 002.5 1.5 1.7 1.7 0 012.4 2.4A1.7 1.7 0 0020.1 10a1.7 1.7 0 010 3.4 1.7 1.7 0 00-1.5 2.5 1.7 1.7 0 01-2.4 2.4A1.7 1.7 0 0013.7 20a1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.5-1.5 1.7 1.7 0 01-2.4-2.4A1.7 1.7 0 003.9 13.4a1.7 1.7 0 010-3.4 1.7 1.7 0 001.5-2.5 1.7 1.7 0 012.4-2.4A1.7 1.7 0 0010.3 3.2z"/><circle cx="12" cy="12" r="3.2"/></svg>Settings…</div>
    <div class="rep-ctx-sep"></div>
    <div class="rep-ctx-item" onclick="_repDuplicateSelected()">${_repIcon('save', 'icn')}Duplicate</div>
    <div class="rep-ctx-item" onclick="_repChangeLayer(1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 8l8-5 8 5-8 5z"/><path d="M4 16l8 5 8-5"/></svg>Bring Forward</div>
    <div class="rep-ctx-item" onclick="_repChangeLayer(-1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 16l8-5 8 5-8 5z"/><path d="M4 8l8 5 8-5"/></svg>Send Backward</div>
    <div class="rep-ctx-sep"></div>
    <div class="rep-ctx-colors">${REP_CTX_COLORS.map(c => `<div class="rep-ctx-color" style="background:${c}" onclick="_repSetDrawingColor('${c}')"></div>`).join('')}</div>
    <div class="rep-ctx-sep"></div>
    <div class="rep-ctx-item danger" onclick="_repDeleteSelected()"><svg class="icn" viewBox="0 0 24 24"><use href="#ic-trash"></use></svg>Delete</div>
  `;
  menu.style.left = clientX + 'px'; menu.style.top = clientY + 'px';
  menu.classList.add('open');
  setTimeout(() => document.addEventListener('click', _repHideContextMenu, { once: true }), 0);
}
function _repHideContextMenu() { document.getElementById('rep-ctx-menu')?.classList.remove('open'); }

// ── Per-drawing Settings dialog ──────────────────────────
// Every drawing tool (Trend Line, Rectangle, Fib, the new
// Path/Callout/Gann Box/Price Range/Long-Short Position/Fixed
// Range Volume Profile, etc.) opens the same tabbed dialog —
// Style / Coordinates / Visibility — mirroring TradingView's
// per-object properties dialog. Opened via the context-menu
// gear item or by double-clicking the drawing itself.
let _repDrawSettingsId = null;
let _repDrawSettingsTab = 'style';

// Resolves a settings-dialog id to the object it should read/write.
// Plain ids ("drw_123") point at an actual placed drawing. Ids
// prefixed "tool:" (e.g. "tool:trendline") point at that tool's
// saved defaults — used when the tool itself is armed/selected but
// nothing has been drawn yet — creating them on first access.
function _repResolveSettingsTarget(id) {
  if (typeof id === 'string' && id.indexOf('tool:') === 0) {
    const toolId = id.slice(5);
    const tool = REP_TOOLS.find(t => t.id === toolId);
    if (!tool) return null;
    _repState.toolDefaults = _repState.toolDefaults || {};
    if (!_repState.toolDefaults[toolId]) {
      _repState.toolDefaults[toolId] = { color: tool.color, stroke: tool.stroke, dashed: !!tool.dashed, width: 1.5, extendLeft: false, extendRight: false, stopRatio: 0.5, qty: 1, rows: 24 };
    }
    return { id, obj: _repState.toolDefaults[toolId], kind: tool.kind, tool, isTool: true };
  }
  const dw = _repState.drawings.find(d => d.id === id);
  if (!dw) return null;
  return { id, obj: dw, kind: dw.kind, tool: REP_TOOLS.find(t => t.id === dw.type), isTool: false };
}

function _repOpenDrawingSettingsModal(id) {
  if (!_repState) return;
  const target = _repResolveSettingsTarget(id); if (!target) return;
  _repHideContextMenu();
  document.getElementById('rep-draw-settings-overlay')?.remove();
  _repDrawSettingsId = id;
  _repDrawSettingsTab = 'style';
  if (!target.isTool) _repState.selectedId = id;

  const overlay = document.createElement('div');
  overlay.id = 'rep-draw-settings-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.style.zIndex = '2650';
  overlay.onclick = e => { if (e.target === overlay) _repCloseDrawSettingsModal(); };

  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:460px;max-height:82vh">
    <div class="acc-manager-header">
      <span>${(target.tool ? target.tool.label : 'Drawing')} ${target.isTool ? 'Default Settings' : 'Settings'}</span>
      <button onclick="_repCloseDrawSettingsModal()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div style="display:flex;min-height:260px;max-height:calc(82vh - 110px)">
      <div id="rep-draw-settings-tabs" style="width:120px;flex-shrink:0;border-right:1px solid var(--glass-border);padding:10px;display:flex;flex-direction:column;gap:2px">
        ${_repDrawSettingsTabButtons(target)}
      </div>
      <div id="rep-draw-settings-body" style="flex:1;overflow-y:auto;padding:16px">
        ${_repDrawSettingsTabContent(target, _repDrawSettingsTab)}
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--glass-border)">
      ${target.isTool ? `<span style="flex:1;font-size:11px;color:var(--text3);align-self:center">Applies to new ${target.tool.label} drawings</span>` : ''}
      <button onclick="_repCloseDrawSettingsModal()" class="acc-mgr-add-btn" style="padding:6px 18px">Done</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  _repDrawOverlay();
}

function _repDrawSettingsTabButtons(target) {
  const tabs = [{ id: 'style', label: 'Style' }];
  if (!target.isTool) { tabs.push({ id: 'coords', label: 'Coordinates' }, { id: 'visibility', label: 'Visibility' }); }
  return tabs.map(tb => `<button type="button" onclick="_repDrawSettingsSwitchTab('${tb.id}')" class="wl-week-btn${_repDrawSettingsTab === tb.id ? ' restore' : ''}" style="text-align:left;justify-content:flex-start;width:100%">${tb.label}</button>`).join('');
}
function _repDrawSettingsSwitchTab(tab) {
  const target = _repResolveSettingsTarget(_repDrawSettingsId); if (!target) return;
  _repDrawSettingsTab = tab;
  document.getElementById('rep-draw-settings-tabs').innerHTML = _repDrawSettingsTabButtons(target);
  document.getElementById('rep-draw-settings-body').innerHTML = _repDrawSettingsTabContent(target, tab);
}
function _repCloseDrawSettingsModal() {
  document.getElementById('rep-draw-settings-overlay')?.remove();
  _repDrawSettingsId = null;
  _repSaveState(); _repDrawOverlay();
}
function _repRefreshDrawSettingsBody() {
  const target = _repResolveSettingsTarget(_repDrawSettingsId); if (!target) return;
  const body = document.getElementById('rep-draw-settings-body');
  if (body) body.innerHTML = _repDrawSettingsTabContent(target, _repDrawSettingsTab);
}

function _repDrawSettingsTabContent(target, tab) {
  if (tab === 'coords' && !target.isTool) return _repDrawSettingsCoordsTab(target);
  if (tab === 'visibility' && !target.isTool) return _repDrawSettingsVisibilityTab(target);
  return _repDrawSettingsStyleTab(target);
}

function _repDrawSettingsStyleTab(target) {
  const dw = target.obj, kind = target.kind, isTool = target.isTool;
  const widthOpts = [1, 1.5, 2, 3, 4].map(w => `<option value="${w}"${(dw.width || 1.5) == w ? ' selected' : ''}>${w}px</option>`).join('');
  let extra = '';
  if (kind === 'longposition' || kind === 'shortposition') {
    extra += `
      ${_repSectionTitle('Risk / Reward')}
      <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
        <span style="flex:1;font-size:13px">Stop distance ratio</span>
        <input type="number" step="0.1" min="0.1" value="${dw.stopRatio ?? 0.5}" oninput="_repSetDrawProp('${target.id}','stopRatio', parseFloat(this.value)||0.5)" class="acc-mgr-input" style="width:80px">
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
        <span style="flex:1;font-size:13px">Quantity</span>
        <input type="number" step="1" min="1" value="${dw.qty ?? 1}" oninput="_repSetDrawProp('${target.id}','qty', parseFloat(this.value)||1)" class="acc-mgr-input" style="width:80px">
      </div>`;
  }
  if (kind === 'line') {
    extra += `
      ${_repSectionTitle('Extend')}
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
        <input type="checkbox" ${dw.extendLeft ? 'checked' : ''} onchange="_repToggleDrawProp('${target.id}','extendLeft')" style="width:15px;height:15px;accent-color:var(--accent,#34d399);cursor:pointer">
        <span style="font-size:13px">Extend left</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
        <input type="checkbox" ${dw.extendRight ? 'checked' : ''} onchange="_repToggleDrawProp('${target.id}','extendRight')" style="width:15px;height:15px;accent-color:var(--accent,#34d399);cursor:pointer">
        <span style="font-size:13px">Extend right</span>
      </div>`;
  }
  if ((kind === 'text' || kind === 'callout') && !isTool) {
    extra += `
      ${_repSectionTitle('Text')}
      <div><textarea class="acc-mgr-input" style="width:100%;min-height:60px;box-sizing:border-box;resize:vertical" oninput="_repSetDrawProp('${target.id}','text', this.value)">${dw.text || ''}</textarea></div>`;
  }
  if (kind === 'fixedrangevp') {
    extra += `
      ${_repSectionTitle('Profile')}
      <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
        <span style="flex:1;font-size:13px">Row count</span>
        <input type="number" min="5" max="60" value="${dw.rows ?? 24}" oninput="_repSetDrawProp('${target.id}','rows', parseInt(this.value,10)||24)" class="acc-mgr-input" style="width:80px">
      </div>`;
  }
  const showLineStyle = kind !== 'text';
  return `
    ${_repSectionTitle('Line')}
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Color</span>
      ${_repDrawColorInput(target)}
    </div>
    ${showLineStyle ? `
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Width</span>
      <select class="rep-select" style="width:90px" onchange="_repSetDrawProp('${target.id}','width', parseFloat(this.value))">${widthOpts}</select>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
      <input type="checkbox" ${dw.dashed ? 'checked' : ''} onchange="_repToggleDrawProp('${target.id}','dashed')" style="width:15px;height:15px;accent-color:var(--accent,#34d399);cursor:pointer">
      <span style="font-size:13px">Dashed</span>
    </div>` : ''}
    ${extra}`;
}

function _repDrawColorInput(target) {
  const dw = target.obj;
  const hex = _repToHex6(dw.color);
  const safeId = target.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const id = 'rep-dw-color-' + safeId, hexId = id + '-hex';
  return `<span style="display:inline-flex;align-items:center;gap:5px">
    <input type="color" id="${id}" value="${hex}" oninput="_repSetDrawColorLive('${target.id}', this.value, '${hexId}')" style="width:30px;height:26px;border:1px solid var(--glass-border);border-radius:4px;background:none;cursor:pointer;padding:0">
    <input type="text" id="${hexId}" value="${hex}" maxlength="7" spellcheck="false" autocapitalize="off" oninput="_repDrawHexChanged('${target.id}','${id}', this.value)" placeholder="#000000" style="width:72px;height:26px;font-size:11px;font-family:var(--font-mono);text-transform:uppercase;background:var(--glass-1,#10141d);border:1px solid var(--glass-border);border-radius:4px;color:var(--text);padding:0 6px">
  </span>`;
}
function _repSetDrawColorLive(id, value, hexFieldId) {
  _repSetDrawProp(id, 'color', value);
  const target = _repResolveSettingsTarget(id);
  if (target && target.obj.stroke) _repSetDrawProp(id, 'stroke', value);
  const hexField = hexFieldId && document.getElementById(hexFieldId);
  if (hexField) hexField.value = value;
}
function _repDrawHexChanged(id, swatchId, value) {
  let v = value.trim(); if (v && v[0] !== '#') v = '#' + v;
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
  const swatch = document.getElementById(swatchId); if (swatch) swatch.value = v;
  _repSetDrawColorLive(id, v, null);
}
function _repSetDrawProp(id, key, value) {
  const target = _repResolveSettingsTarget(id); if (!target) return;
  target.obj[key] = value;
  _repDrawOverlay();
}
function _repToggleDrawProp(id, key) {
  const target = _repResolveSettingsTarget(id); if (!target) return;
  target.obj[key] = !target.obj[key];
  _repDrawOverlay();
  _repRefreshDrawSettingsBody();
}

function _repDrawSettingsCoordsTab(target) {
  const dw = target.obj;
  const fmtTime = t => t != null ? new Date(t).toISOString().slice(0, 16) : '';
  const row = (label, field, val, onchange) => `
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">${label}</span>
      <input type="${field === 'time' ? 'datetime-local' : 'number'}" step="any" value="${val}" class="acc-mgr-input" style="width:170px" onchange="${onchange}">
    </div>`;
  let html = '';
  if (dw.p1) {
    if (dw.p1.time != null) html += row('Point 1 — Time', 'time', fmtTime(dw.p1.time), `_repSetCoordTime('${target.id}','p1', this.value)`);
    if (dw.p1.price != null) html += row('Point 1 — Price', 'price', dw.p1.price, `_repSetCoordPrice('${target.id}','p1', this.value)`);
  }
  if (dw.p2) {
    if (dw.p2.time != null) html += row('Point 2 — Time', 'time', fmtTime(dw.p2.time), `_repSetCoordTime('${target.id}','p2', this.value)`);
    if (dw.p2.price != null) html += row('Point 2 — Price', 'price', dw.p2.price, `_repSetCoordPrice('${target.id}','p2', this.value)`);
  }
  if (dw.points && dw.points.length) {
    html += _repSectionTitle(`Points (${dw.points.length})`);
    html += `<div style="font-size:12px;color:var(--text3)">Multi-point objects are edited by dragging their vertex handles directly on the chart.</div>`;
  }
  if (!html) html = '<div style="font-size:13px;color:var(--text3)">No editable coordinates for this object.</div>';
  return html;
}
function _repSetCoordTime(id, pKey, value) {
  const target = _repResolveSettingsTarget(id); if (!target || !target.obj[pKey]) return;
  const t = new Date(value).getTime(); if (isNaN(t)) return;
  target.obj[pKey].time = t; _repDrawOverlay();
}
function _repSetCoordPrice(id, pKey, value) {
  const target = _repResolveSettingsTarget(id); if (!target || !target.obj[pKey]) return;
  const p = parseFloat(value); if (isNaN(p)) return;
  target.obj[pKey].price = p; _repDrawOverlay();
}

function _repDrawSettingsVisibilityTab(target) {
  const dw = target.obj;
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
      <input type="checkbox" ${dw.hidden ? 'checked' : ''} onchange="_repToggleDrawProp('${target.id}','hidden')" style="width:15px;height:15px;accent-color:var(--accent,#34d399);cursor:pointer">
      <span style="font-size:13px">Hide this object</span>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-top:8px">Hidden objects stay saved with the chart but won't render or highlight until shown again.</div>`;
}

// Toolbar-level access to a tool's default settings: the small gear
// on each flyout row, or double-clicking the tool's own button while
// it's armed/selected.
function _repOpenToolSettingsModal(toolId) {
  const tool = REP_TOOLS.find(t => t.id === toolId);
  if (!tool || tool.kind === 'select') return;
  _repOpenDrawingSettingsModal('tool:' + toolId);
}
function _repToolBtnDblClick(e, toolId) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  _repOpenToolSettingsModal(toolId);
}


// ── Indicators / layouts popovers ────────────────────────
function _repClosePopovers() {
  document.getElementById('rep-indicators-popover')?.classList.remove('open');
  document.getElementById('rep-layouts-popover')?.classList.remove('open');
  _repCloseToolFlyout();
}
// ── Settings modal (TradingView-style: sidebar tabs + Symbol/
// Canvas panes) ──────────────────────────────────────────
let _repSettingsTab = 'symbol';
let _repSettingsSnapshot = null;

function _repOpenSettingsModal() {
  if (!_repState) return;
  _repClosePopovers();
  document.getElementById('rep-settings-modal-overlay')?.remove();
  _repSettingsSnapshot = JSON.parse(JSON.stringify(_repState.theme));
  _repSettingsTab = 'symbol';

  const overlay = document.createElement('div');
  overlay.id = 'rep-settings-modal-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.style.zIndex = '2600';
  overlay.onclick = e => { if (e.target === overlay) _repCloseSettingsModal(true); };

  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:620px;max-height:88vh">
    <div class="acc-manager-header">
      <span>Settings</span>
      <button onclick="_repCloseSettingsModal(true)" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div style="display:flex;min-height:420px;max-height:calc(88vh - 110px)">
      <div id="rep-settings-tabs" style="width:170px;flex-shrink:0;border-right:1px solid var(--glass-border);padding:10px;display:flex;flex-direction:column;gap:2px">
        ${_repSettingsTabButtons()}
      </div>
      <div id="rep-settings-body" style="flex:1;overflow-y:auto;padding:16px">
        ${_repSettingsTabContent(_repSettingsTab)}
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid var(--glass-border)">
      <button onclick="_repResetTheme()" class="acc-mgr-btn" style="padding:6px 14px">Reset to default</button>
      <div style="display:flex;gap:8px">
        <button onclick="_repCloseSettingsModal(false)" class="acc-mgr-btn" style="padding:6px 14px">Cancel</button>
        <button onclick="_repCloseSettingsModal(true)" class="acc-mgr-add-btn" style="padding:6px 18px">Ok</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function _repCloseSettingsModal(commit) {
  if (!commit && _repSettingsSnapshot && _repState) {
    _repState.theme = _repSettingsSnapshot;
    _repApplyTheme();
  }
  _repSaveState();
  _repSettingsSnapshot = null;
  document.getElementById('rep-settings-modal-overlay')?.remove();
}

function _repSettingsTabButtons() {
  const tabs = [
    { id: 'symbol', label: 'Symbol' },
    { id: 'canvas', label: 'Canvas' },
  ];
  return tabs.map(tb => `<button type="button" onclick="_repSettingsSwitchTab('${tb.id}')" class="wl-week-btn${_repSettingsTab === tb.id ? ' restore' : ''}" style="text-align:left;justify-content:flex-start;width:100%">${tb.label}</button>`).join('');
}

function _repSettingsSwitchTab(tab) {
  _repSettingsTab = tab;
  document.getElementById('rep-settings-tabs').innerHTML = _repSettingsTabButtons();
  document.getElementById('rep-settings-body').innerHTML = _repSettingsTabContent(tab);
}

function _repSettingsTabContent(tab) {
  return tab === 'canvas' ? _repSettingsCanvasTab() : _repSettingsSymbolTab();
}

// Small helpers shared by both tabs
// Normalizes any CSS color the theme might hold (hex, rgba(...), etc.)
// down to a 6-digit hex string — needed because <input type="color">
// and a plain hex text field can only display #rrggbb, while several
// theme defaults (grid lines, scale border, watermark) are stored as
// rgba() so they can carry an alpha value.
function _repToHex6(c) {
  if (!c) return '#000000';
  c = String(c).trim();
  if (c[0] === '#') {
    if (c.length === 4) return '#' + [c[1], c[2], c[3]].map(x => x + x).join('');
    return c.slice(0, 7);
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
  return '#000000';
}
function _repSetColor(key, value, hexFieldId) {
  _repSetTheme(key, value);
  const hexField = hexFieldId && document.getElementById(hexFieldId);
  if (hexField) hexField.value = value;
}
// Applies a typed hex value once it's a complete #rrggbb — lets the
// person keep typing without every partial keystroke being rejected.
function _repHexInputChanged(swatchId, key, value) {
  let v = value.trim();
  if (v && v[0] !== '#') v = '#' + v;
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
  const swatch = document.getElementById(swatchId);
  if (swatch) swatch.value = v;
  _repSetTheme(key, v);
}
function _repColorInput(id, key) {
  const hex = _repToHex6(_repState.theme[key]);
  const hexId = id + '-hex';
  return `<span style="display:inline-flex;align-items:center;gap:5px">
    <input type="color" id="${id}" value="${hex}" oninput="_repSetColor('${key}', this.value, '${hexId}')" style="width:30px;height:26px;border:1px solid var(--glass-border);border-radius:4px;background:none;cursor:pointer;padding:0">
    <input type="text" id="${hexId}" value="${hex}" maxlength="7" spellcheck="false" autocapitalize="off" oninput="_repHexInputChanged('${id}', '${key}', this.value)" placeholder="#000000" style="width:72px;height:26px;font-size:11px;font-family:var(--font-mono);text-transform:uppercase;background:var(--glass-1,#10141d);border:1px solid var(--glass-border);border-radius:4px;color:var(--text);padding:0 6px">
  </span>`;
}
function _repCheckboxRow(labelHtml, key, extraHtml) {
  return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0">
    <input type="checkbox" ${_repState.theme[key] ? 'checked' : ''} onchange="_repToggleThemeFlag('${key}')" style="width:15px;height:15px;accent-color:var(--accent,#34d399);cursor:pointer">
    <span style="flex:1;font-size:13px">${labelHtml}</span>
    ${extraHtml || ''}
  </div>`;
}
function _repSectionTitle(t) { return `<div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--text3);margin:14px 0 6px;font-weight:600">${t}</div>`; }


function _repSettingsSymbolTab() {
  const t = _repState.theme;
  const precisionOpts = ['default', 0, 1, 2, 3, 4, 5, 6, 8].map(p =>
    `<option value="${p}"${String(t.precision) === String(p) ? ' selected' : ''}>${p === 'default' ? 'Default' : p + ' digit' + (p === 1 ? '' : 's')}</option>`).join('');
  const tzOpts = REP_TIMEZONE_OPTIONS.map(o =>
    `<option value="${o.v}"${Number(t.timezone) === o.v ? ' selected' : ''}>${o.l}</option>`).join('');

  return `
    ${_repSectionTitle('Candles')}
    ${_repCheckboxRow('Color bars based on previous close', 'colorBarsPrevClose')}
    ${_repCheckboxRow('Body', 'bodyVisible', `<div style="display:flex;gap:6px">${_repColorInput('rep-t-body-up', 'bodyUpColor')}${_repColorInput('rep-t-body-down', 'bodyDownColor')}</div>`)}
    ${_repCheckboxRow('Borders', 'borderVisible', `<div style="display:flex;gap:6px">${_repColorInput('rep-t-border-up', 'borderUpColor')}${_repColorInput('rep-t-border-down', 'borderDownColor')}</div>`)}
    ${_repCheckboxRow('Wick', 'wickVisible', `<div style="display:flex;gap:6px">${_repColorInput('rep-t-wick-up', 'wickUpColor')}${_repColorInput('rep-t-wick-down', 'wickDownColor')}</div>`)}

    ${_repSectionTitle('Data modification')}
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Precision</span>
      <select class="rep-select" style="width:150px" onchange="_repSetTheme('precision', this.value)">${precisionOpts}</select>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Timezone</span>
      <select class="rep-select" style="width:150px" onchange="_repSetTheme('timezone', parseFloat(this.value))">${tzOpts}</select>
    </div>`;
}

function _repSettingsCanvasTab() {
  const t = _repState.theme;
  return `
    ${_repSectionTitle('Chart basic styles')}
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Background</span>
      ${_repColorInput('rep-t-bg', 'bgColor')}
    </div>
    ${_repCheckboxRow('Vertical grid', 'vertGrid', _repColorInput('rep-t-vgrid', 'vertGridColor'))}
    ${_repCheckboxRow('Horizontal grid', 'horzGrid', _repColorInput('rep-t-hgrid', 'horzGridColor'))}
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Crosshair</span>
      ${_repColorInput('rep-t-crosshair', 'crosshairColor')}
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Watermark</span>
      <select class="rep-select" style="width:110px" onchange="_repSetTheme('watermark', this.value === 'visible')">
        <option value="visible"${t.watermark ? ' selected' : ''}>Visible</option>
        <option value="hidden"${!t.watermark ? ' selected' : ''}>Hidden</option>
      </select>
      ${_repColorInput('rep-t-watermark', 'watermarkColor')}
    </div>

    ${_repSectionTitle('Scales')}
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Text</span>
      ${_repColorInput('rep-t-scaletext', 'scaleTextColor')}
      <select class="rep-select" style="width:60px" onchange="_repSetTheme('scaleFontSize', parseInt(this.value, 10))">
        ${[8, 9, 10, 11, 12, 14].map(n => `<option value="${n}"${t.scaleFontSize === n ? ' selected' : ''}>${n}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Lines</span>
      ${_repColorInput('rep-t-scaleline', 'scaleLineColor')}
    </div>

    ${_repSectionTitle('Buttons')}
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0">
      <span style="flex:1;font-size:13px">Navigation</span>
      <select class="rep-select" style="width:150px" onchange="_repSetTheme('navVisibility', this.value)">
        <option value="always"${t.navVisibility === 'always' ? ' selected' : ''}>Always visible</option>
        <option value="hidden"${t.navVisibility === 'hidden' ? ' selected' : ''}>Hidden</option>
      </select>
    </div>

    ${_repSectionTitle('Other')}
    ${_repCheckboxRow('Volume panel', 'volume')}`;
}

function _repSetTheme(key, value) {
  if (!_repState) return;
  _repState.theme[key] = value;
  _repApplyTheme();
  _repSaveState();
}
function _repToggleThemeFlag(key) {
  if (!_repState) return;
  _repState.theme[key] = !_repState.theme[key];
  _repApplyTheme();
  _repSaveState();
}
function _repResetTheme() {
  if (!_repState) return;
  _repState.theme = _repDefaultTheme();
  _repApplyTheme();
  _repSaveState();
  if (document.getElementById('rep-settings-modal-overlay')) _repSettingsSwitchTab(_repSettingsTab);
}

// Applies the full theme object to the live chart: layout/background,
// grid, crosshair, price-scale border + text, watermark badge, volume
// visibility, and candle precision. Per-candle body/border/wick
// colors (including "color bars based on previous close") are applied
// in _repSetChartData since Lightweight Charts needs those set per
// data point, not as a single series-wide option.
function _repApplyTheme() {
  if (!_repState || !_repState.chart) return;
  const t = _repState.theme;

  _repState.chart.applyOptions({
    layout: {
      background: { type: 'solid', color: t.bgColor },
      textColor: t.scaleTextColor,
      fontSize: t.scaleFontSize,
    },
    grid: {
      vertLines: { color: t.vertGridColor, visible: t.vertGrid },
      horzLines: { color: t.horzGridColor, visible: t.horzGrid },
    },
    crosshair: {
      vertLine: { color: t.crosshairColor },
      horzLine: { color: t.crosshairColor },
    },
    rightPriceScale: { borderColor: t.scaleLineColor },
    timeScale: { borderColor: t.scaleLineColor },
    localization: {
      timeFormatter: time => new Date((time + (Number(t.timezone) || 0) * 3600) * 1000).toUTCString().slice(0, 22),
    },
  });

  const precision = (t.precision === 'default' || t.precision == null || t.precision === '') ? 2 : Number(t.precision);
  _repState.candleSeries.applyOptions({
    borderVisible: true, wickVisible: true,
    priceFormat: { type: 'price', precision, minMove: 1 / Math.pow(10, precision) },
  });

  if (_repState.volumeSeries) _repState.volumeSeries.applyOptions({ visible: t.volume });

  const badge = document.querySelector('.rep-symbol-badge');
  if (badge) { badge.style.display = t.watermark ? 'block' : 'none'; badge.style.color = t.watermarkColor; }

  const leftToolbar = document.getElementById('rep-left-toolbar');
  if (leftToolbar) leftToolbar.style.display = t.navVisibility === 'hidden' ? 'none' : '';
  const pill = document.getElementById('rep-replay-pill');
  if (pill) pill.style.display = t.navVisibility === 'hidden' ? 'none' : '';

  // Re-run candle coloring (body/border/wick + prev-close mode) and
  // re-apply indicator colors without recentering the visible range.
  _repSetChartData(false);
}
function _repToggleIndicatorsPopover() {
  const p = document.getElementById('rep-indicators-popover'); if (!p) return;
  document.getElementById('rep-layouts-popover')?.classList.remove('open');
  document.getElementById('rep-settings-modal-overlay')?.remove();
  p.classList.toggle('open');
}
function _repToggleLayoutsPopover() {
  const p = document.getElementById('rep-layouts-popover'); if (!p) return;
  document.getElementById('rep-indicators-popover')?.classList.remove('open');
  document.getElementById('rep-settings-modal-overlay')?.remove();
  p.classList.toggle('open');
  _repRenderLayoutsList();
}
function _repRenderIndicatorPopoverState() {
  document.querySelectorAll('#rep-indicators-popover .rep-popover-row').forEach(row => {
    row.classList.toggle('on', !!_repState.indicators[row.dataset.ind]);
  });
}


// ══════════════════════════════════════════════════════
// INDICATORS — computed client-side from the visible replay
// window. `type:'overlay'` indicators share the main price
// scale (drawn over candles); `type:'oscillator'` indicators
// render in a dedicated strip pinned to the bottom of the
// same chart via their own price scale — Lightweight Charts
// v4 doesn't have true stacked panes, so only one oscillator
// can be active at a time to keep that strip readable (this
// is the one place we fall short of full TradingView parity;
// multi-pane support is a v5-library upgrade for a later pass).
// ══════════════════════════════════════════════════════
const REP_OSC_SCALE = 'rep-osc';
function _repIndicatorPopoverHtml() {
  const checkSvg = '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
  const row = id => `<div class="rep-popover-row" data-ind="${id}" onclick="_repToggleIndicator('${id}')">
      <span><span class="dot" style="background:${REP_IND_DEFS_COLORS[id]}"></span>${REP_IND_DEFS[id].label}</span>
      <span class="rep-popover-check">${checkSvg}</span></div>`;
  const overlays = Object.keys(REP_IND_DEFS).filter(id => REP_IND_DEFS[id].type === 'overlay');
  const oscillators = Object.keys(REP_IND_DEFS).filter(id => REP_IND_DEFS[id].type === 'oscillator');
  return `<div class="rep-popover-title">Overlays</div>${overlays.map(row).join('')}
    <div class="rep-popover-title" style="margin-top:6px">Oscillators <span style="text-transform:none;font-weight:500;opacity:.7">(1 active)</span></div>${oscillators.map(row).join('')}`;
}
const REP_IND_DEFS_COLORS = {
  ema9: '#fbbf24', ema21: '#60a5fa', ema50: '#f472b6', sma50: '#a78bfa', sma200: '#f87171',
  vwap: '#2dd4bf', bb: '#60a5fa', rsi: '#a78bfa', macd: '#60a5fa', stoch: '#60a5fa', atr: '#2dd4bf',
};
const REP_IND_DEFS = {
  ema9:   { label: 'EMA 9',                 type: 'overlay',    calc: c => [{ kind: 'line', color: '#fbbf24', data: _repEMA(c, 9) }] },
  ema21:  { label: 'EMA 21',                type: 'overlay',    calc: c => [{ kind: 'line', color: '#60a5fa', data: _repEMA(c, 21) }] },
  ema50:  { label: 'EMA 50',                type: 'overlay',    calc: c => [{ kind: 'line', color: '#f472b6', data: _repEMA(c, 50) }] },
  sma50:  { label: 'SMA 50',                type: 'overlay',    calc: c => [{ kind: 'line', color: '#a78bfa', data: _repSMA(c, 50) }] },
  sma200: { label: 'SMA 200',               type: 'overlay',    calc: c => [{ kind: 'line', color: '#f87171', data: _repSMA(c, 200) }] },
  vwap:   { label: 'VWAP',                  type: 'overlay',    calc: c => [{ kind: 'line', color: '#2dd4bf', data: _repVWAP(c) }] },
  bb:     { label: 'Bollinger Bands (20,2)',type: 'overlay',    calc: c => _repBollinger(c, 20, 2) },
  rsi:    { label: 'RSI (14)',              type: 'oscillator', calc: c => _repRSI(c, 14) },
  macd:   { label: 'MACD (12,26,9)',        type: 'oscillator', calc: c => _repMACD(c, 12, 26, 9) },
  stoch:  { label: 'Stochastic (14,3,3)',   type: 'oscillator', calc: c => _repStochastic(c, 14, 3, 3) },
  atr:    { label: 'ATR (14)',              type: 'oscillator', calc: c => _repATR(c, 14) },
};

function _repEMA(candles, period) {
  const k = 2 / (period + 1); let ema = null;
  return candles.map((c, i) => {
    if (i < period - 1) return null;
    if (ema === null) { ema = candles.slice(0, period).reduce((a, x) => a + x.close, 0) / period; return { time: Math.floor(c.time / 1000), value: ema }; }
    ema = c.close * k + ema * (1 - k);
    return { time: Math.floor(c.time / 1000), value: ema };
  }).filter(Boolean);
}
function _repSMAValues(candles, period) {
  return candles.map((c, i) => i < period - 1 ? null : candles.slice(i - period + 1, i + 1).reduce((a, x) => a + x.close, 0) / period);
}
function _repSMA(candles, period) {
  return _repSMAValues(candles, period).map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v }).filter(Boolean);
}
function _repVWAP(candles) {
  let cumPV = 0, cumV = 0;
  return candles.map(c => {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1; // forex feeds often lack real volume — fall back to an even weight
    cumPV += typical * vol; cumV += vol;
    return { time: Math.floor(c.time / 1000), value: cumPV / cumV };
  });
}
function _repBollinger(candles, period, mult) {
  const sma = _repSMAValues(candles, period);
  const mid = [], upper = [], lower = [];
  candles.forEach((c, i) => {
    if (sma[i] == null) return;
    const slice = candles.slice(i - period + 1, i + 1);
    const variance = slice.reduce((a, x) => a + Math.pow(x.close - sma[i], 2), 0) / period;
    const sd = Math.sqrt(variance);
    const t = Math.floor(c.time / 1000);
    mid.push({ time: t, value: sma[i] }); upper.push({ time: t, value: sma[i] + mult * sd }); lower.push({ time: t, value: sma[i] - mult * sd });
  });
  return [
    { kind: 'line', color: 'rgba(96,165,250,.55)', width: 1, data: upper },
    { kind: 'line', color: 'rgba(226,232,240,.4)', width: 1, data: mid },
    { kind: 'line', color: 'rgba(96,165,250,.55)', width: 1, data: lower },
  ];
}
function _repRSI(candles, period) {
  let avgGain = 0, avgLoss = 0; const out = [];
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = Math.max(0, change), loss = Math.max(0, -change);
    if (i <= period) { avgGain += gain / period; avgLoss += loss / period; if (i === period) out.push(_repRsiPoint(candles[i], avgGain, avgLoss)); continue; }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push(_repRsiPoint(candles[i], avgGain, avgLoss));
  }
  return [
    { kind: 'line', color: '#a78bfa', width: 1.5, data: out },
    { kind: 'line', color: 'rgba(248,113,113,.35)', width: 1, data: candles.map(c => ({ time: Math.floor(c.time / 1000), value: 70 })) },
    { kind: 'line', color: 'rgba(52,211,153,.35)', width: 1, data: candles.map(c => ({ time: Math.floor(c.time / 1000), value: 30 })) },
  ];
}
function _repRsiPoint(c, avgGain, avgLoss) {
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  return { time: Math.floor(c.time / 1000), value: rsi };
}
function _repEmaSeries(values, period) {
  const k = 2 / (period + 1); let ema = null; const out = [];
  values.forEach((v, i) => {
    if (v == null) { out.push(null); return; }
    if (ema === null) { ema = v; } else { ema = v * k + ema * (1 - k); }
    out.push(ema);
  });
  return out;
}
function _repMACD(candles, fast, slow, signalPeriod) {
  const closes = candles.map(c => c.close);
  const emaFast = _repEmaSeriesFromCloses(closes, fast);
  const emaSlow = _repEmaSeriesFromCloses(closes, slow);
  const macdLine = closes.map((_, i) => (emaFast[i] != null && emaSlow[i] != null) ? emaFast[i] - emaSlow[i] : null);
  const signal = _repEmaSeries(macdLine, signalPeriod);
  const t = i => Math.floor(candles[i].time / 1000);
  const macdData = [], signalData = [], histData = [];
  candles.forEach((c, i) => {
    if (macdLine[i] == null) return;
    macdData.push({ time: t(i), value: macdLine[i] });
    if (signal[i] != null) {
      signalData.push({ time: t(i), value: signal[i] });
      const hist = macdLine[i] - signal[i];
      histData.push({ time: t(i), value: hist, color: hist >= 0 ? 'rgba(52,211,153,.65)' : 'rgba(248,113,113,.65)' });
    }
  });
  return [
    { kind: 'histogram', data: histData },
    { kind: 'line', color: '#60a5fa', width: 1.5, data: macdData },
    { kind: 'line', color: '#fbbf24', width: 1.5, data: signalData },
  ];
}
function _repEmaSeriesFromCloses(closes, period) {
  const k = 2 / (period + 1); let ema = null;
  return closes.map((v, i) => {
    if (i < period - 1) return null;
    if (ema === null) { ema = closes.slice(0, period).reduce((a, x) => a + x, 0) / period; return ema; }
    ema = v * k + ema * (1 - k); return ema;
  });
}
function _repStochastic(candles, period, kSmooth, dSmooth) {
  const rawK = candles.map((c, i) => {
    if (i < period - 1) return null;
    const slice = candles.slice(i - period + 1, i + 1);
    const hh = Math.max(...slice.map(x => x.high)), ll = Math.min(...slice.map(x => x.low));
    return hh === ll ? 50 : ((c.close - ll) / (hh - ll)) * 100;
  });
  const kVals = rawK.map((v, i) => {
    if (v == null) return null;
    const window = rawK.slice(Math.max(0, i - kSmooth + 1), i + 1).filter(x => x != null);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
  const dVals = kVals.map((v, i) => {
    if (v == null) return null;
    const window = kVals.slice(Math.max(0, i - dSmooth + 1), i + 1).filter(x => x != null);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
  const t = i => Math.floor(candles[i].time / 1000);
  return [
    { kind: 'line', color: '#60a5fa', width: 1.5, data: kVals.map((v, i) => v == null ? null : { time: t(i), value: v }).filter(Boolean) },
    { kind: 'line', color: '#fbbf24', width: 1.5, data: dVals.map((v, i) => v == null ? null : { time: t(i), value: v }).filter(Boolean) },
    { kind: 'line', color: 'rgba(248,113,113,.3)', width: 1, data: candles.map(c => ({ time: Math.floor(c.time / 1000), value: 80 })) },
    { kind: 'line', color: 'rgba(52,211,153,.3)', width: 1, data: candles.map(c => ({ time: Math.floor(c.time / 1000), value: 20 })) },
  ];
}
function _repATR(candles, period) {
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  let atr = null; const out = [];
  trs.forEach((tr, i) => {
    if (i < period - 1) return;
    if (atr === null) { atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period; }
    else { atr = (atr * (period - 1) + tr) / period; }
    out.push({ time: Math.floor(candles[i].time / 1000), value: atr });
  });
  return [{ kind: 'line', color: '#2dd4bf', width: 1.5, data: out }];
}

// Indicators render as Lightweight Charts line/histogram series,
// recomputed client-side from the visible replay window on every
// step (see _repApplyIndicators below).
function _repToggleIndicator(id) {
  const def = REP_IND_DEFS[id];
  if (!def || !_repState || !_repState.chart) return;
  const turningOn = !_repState.indicators[id];

  if (turningOn && def.type === 'oscillator') {
    // Only one oscillator strip at a time — Lightweight Charts v4
    // doesn't have true stacked panes, so a second oscillator would
    // overlap the first on the shared bottom price scale.
    Object.keys(REP_IND_DEFS).forEach(otherId => {
      if (otherId !== id && REP_IND_DEFS[otherId].type === 'oscillator' && _repState.indicators[otherId]) {
        _repRemoveIndicatorStudy(otherId);
      }
    });
  }

  _repState.indicators[id] = turningOn;
  document.querySelector(`#rep-indicators-popover .rep-popover-row[data-ind="${id}"]`)?.classList.toggle('on', turningOn);

  if (turningOn) {
    _repApplyIndicators(_repState.candles.slice(0, _repState.index + 1));
  } else {
    _repRemoveIndicatorStudy(id);
  }
  _repSaveState();
}
function _repRemoveIndicatorStudy(id) {
  const chart = _repState?.chart;
  const series = _repState?.indicatorSeries?.[id];
  if (chart && series) series.forEach(s => { try { chart.removeSeries(s); } catch (e) {} });
  if (_repState?.indicatorSeries) delete _repState.indicatorSeries[id];
  _repState.indicators[id] = false;
  document.querySelector(`#rep-indicators-popover .rep-popover-row[data-ind="${id}"]`)?.classList.remove('on');
}

function _repApplyIndicators(slice) {
  if (!_repState || !_repState.chart) return;
  Object.keys(_repState.indicators).forEach(id => {
    if (!_repState.indicators[id]) return;
    const def = REP_IND_DEFS[id]; if (!def) return;
    const parts = def.calc(slice);
    if (!_repState.indicatorSeries[id]) {
      _repState.indicatorSeries[id] = parts.map(p => {
        const scaleOpts = def.type === 'oscillator' ? { priceScaleId: REP_OSC_SCALE } : {};
        if (p.kind === 'histogram') return _repState.chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false, ...scaleOpts });
        return _repState.chart.addLineSeries({ color: p.color, lineWidth: p.width || 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...scaleOpts });
      });
    }
    parts.forEach((p, i) => _repState.indicatorSeries[id][i]?.setData(p.data));
  });
}

// ══════════════════════════════════════════════════════
// PLAYBACK CONTROLS
// ══════════════════════════════════════════════════════
function _repIsWeekend(ms) { const d = new Date(ms).getUTCDay(); return d === 0 || d === 6; }
function _repNextPlayableIndex(from, dir) {
  let idx = from + dir;
  if (_repState.skipWeekends) {
    while (idx >= 0 && idx < _repState.candles.length && _repIsWeekend(_repState.candles[idx].time)) idx += dir;
  }
  return idx;
}
function _repTogglePlay() { _repState.playing ? _repPause() : _repPlay(); }
function _repPlay() {
  if (!_repState || _repState.playing) return;
  if (_repState.index >= _repState.candles.length - 1) {
    if (_repState.loop) { _repState.index = Math.min(_repState.candlesPerView - 1, _repState.candles.length - 1); }
    else return;
  }
  _repState.playing = true;
  document.getElementById('rep-play-icon').innerHTML = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  const delay = Math.max(30, 500 / _repState.speed);
  _repState._timer = setInterval(() => {
    let next = _repNextPlayableIndex(_repState.index, 1);
    if (next >= _repState.candles.length) {
      if (_repState.loop) next = Math.min(_repState.candlesPerView - 1, _repState.candles.length - 1);
      else { _repPause(); return; }
    }
    _repState.index = next;
    _repSetChartData(true);
  }, delay);
}
function _repPause() {
  if (!_repState) return;
  _repState.playing = false;
  clearInterval(_repState._timer);
  const icon = document.getElementById('rep-play-icon'); if (icon) icon.innerHTML = '<path d="M7 5l12 7-12 7z"/>';
  _repSaveState();
}
function _repStep(dir) {
  if (!_repState) return;
  _repPause();
  const next = _repNextPlayableIndex(_repState.index, dir);
  _repState.index = Math.max(0, Math.min(_repState.candles.length - 1, next));
  _repSetChartData(true);
  _repSaveState();
}
function _repReset() {
  if (!_repState) return;
  _repPause();
  _repState.index = Math.min(_repState.candlesPerView - 1, _repState.candles.length - 1);
  _repSetChartData(true);
  _repSaveState();
}
function _repSetSpeed(val) { if (_repState) { _repState.speed = parseFloat(val) || 1; _repSaveState(); if (_repState.playing) { _repPause(); _repPlay(); } } }
function _repZoom(dir) {
  if (!_repState) return;
  _repState.candlesPerView = Math.max(20, Math.min(400, _repState.candlesPerView + dir * 10));
  _repSetChartData(true);
  _repSaveState();
}
// Jumps straight to a preset zoom level (the "1D / 5D / 1M …"-style
// range pills under the chart) instead of nudging by 10 like _repZoom.
function _repSetRange(n) {
  if (!_repState) return;
  _repState.candlesPerView = Math.max(20, Math.min(400, n));
  _repSetChartData(true);
  _repSaveState();
  document.querySelectorAll('.rep-range-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.n) === _repState.candlesPerView));
}
function _repJumpToDate(dateStr) {
  if (!_repState || !dateStr) return;
  _repPause();
  const targetMs = new Date(dateStr).getTime();
  const idx = _repIndexForTime(targetMs);
  _repState.index = Math.max(0, Math.min(_repState.candles.length - 1, idx));
  _repSetChartData(true);
  _repSaveState();
}
function _repScrubProgress(val) {
  if (!_repState) return;
  _repPause();
  const total = _repState.candles.length;
  _repState.index = Math.max(0, Math.min(total - 1, Math.round((val / 100) * (total - 1))));
  _repSetChartData(true);
  _repSaveState();
}
function _repToggleFullscreen() {
  const el = document.getElementById('rep-fullscreen-overlay');
  if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}

// ══════════════════════════════════════════════════════
// SAVE / LOAD LAYOUTS — named drawing-set snapshots, kept
// in localStorage per browser (fast, no schema migration
// needed; promote to Supabase alongside the layout manager
// in a later phase if traders want them synced across devices).
// ══════════════════════════════════════════════════════
function _repLayoutsStore() { try { return JSON.parse(localStorage.getItem('nxtgen_rep_layouts') || '{}'); } catch (e) { return {}; } }
function _repSaveLayout() {
  const name = prompt('Name this layout:', `${_repState.symbol} setup`);
  if (!name) return;
  const store = _repLayoutsStore();
  store[name] = { drawings: _repState.drawings, indicators: _repState.indicators, savedAt: Date.now() };
  localStorage.setItem('nxtgen_rep_layouts', JSON.stringify(store));
  if (typeof showToast === 'function') showToast(`Layout "${name}" saved`, 'success');
  _repRenderLayoutsList();
}
function _repRenderLayoutsList() {
  const wrap = document.getElementById('rep-layouts-list'); if (!wrap) return;
  const store = _repLayoutsStore();
  const names = Object.keys(store);
  wrap.innerHTML = names.length ? names.map(n => `
    <div class="rep-popover-row" onclick="_repLoadLayout('${n.replace(/'/g, "\\'")}')">
      <span>${n}</span>
      <span onclick="event.stopPropagation();_repDeleteLayout('${n.replace(/'/g, "\\'")}')" style="opacity:.5;padding:2px"><svg class="icn" style="width:12px;height:12px" viewBox="0 0 24 24"><use href="#ic-trash"></use></svg></span>
    </div>`).join('') : `<div style="padding:8px;font-size:11px;color:var(--text3)">No saved layouts yet</div>`;
}
function _repLoadLayout(name) {
  const store = _repLayoutsStore(); const layout = store[name]; if (!layout) return;
  _repPushHistory();
  _repState.drawings = JSON.parse(JSON.stringify(layout.drawings || []));
  _repState.indicators = layout.indicators || _repState.indicators;
  Object.keys(_repState.indicatorSeries).forEach(id => {
    (_repState.indicatorSeries[id] || []).forEach(s => { try { _repState.chart.removeSeries(s); } catch (e) {} });
  });
  _repState.indicatorSeries = {};
  _repApplyIndicators(_repState.candles.slice(0, _repState.index + 1));
  _repRenderIndicatorPopoverState();
  _repSaveState(); _repDrawOverlay(); _repClosePopovers();
  if (typeof showToast === 'function') showToast(`Layout "${name}" loaded`, 'success');
}
function _repDeleteLayout(name) {
  const store = _repLayoutsStore(); delete store[name];
  localStorage.setItem('nxtgen_rep_layouts', JSON.stringify(store));
  _repRenderLayoutsList();
}

// ══════════════════════════════════════════════════════
// BOTTOM TRADING DOCK — real session/account numbers pulled
// from the existing Backtesting Lab data layer (_btTradesForSession
// + _btComputeStats), not placeholders.
// ══════════════════════════════════════════════════════
function _repRenderBottomDock() {
  const dock = document.getElementById('rep-bottom-dock'); if (!dock) return;
  const session = _btGetSessionById(_repState.sessionId);
  const startingBalance = Number(session?.startingBalance) || 0;
  const trades = _btTradesForSession(_repState.sessionId);
  const stats = _btComputeStats(trades, startingBalance);
  const equity = startingBalance + (stats.netReturn || 0);
  const c = _repState.candles[_repState.index];
  const dateStr = c ? new Date(c.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  dock.innerHTML = `
    <div class="rep-dock-stats">
      <div class="rep-dock-stat"><span class="rep-dock-stat-label">Balance</span><span class="rep-dock-stat-value">$${startingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div class="rep-dock-stat"><span class="rep-dock-stat-label">Equity</span><span class="rep-dock-stat-value">$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div class="rep-dock-divider"></div>
      <div class="rep-dock-stat"><span class="rep-dock-stat-label">Realized PnL</span><span class="rep-dock-stat-value ${(stats.netReturn || 0) >= 0 ? 'up' : 'dn'}">${(stats.netReturn || 0) >= 0 ? '+' : ''}$${(stats.netReturn || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
      <div class="rep-dock-stat"><span class="rep-dock-stat-label">Avg RR</span><span class="rep-dock-stat-value">${stats.avgRR ?? '—'}</span></div>
      <div class="rep-dock-stat"><span class="rep-dock-stat-label">Win Rate</span><span class="rep-dock-stat-value">${stats.winRate != null ? stats.winRate + '%' : '—'}</span></div>
      <div class="rep-dock-divider"></div>
      <div class="rep-dock-stat"><span class="rep-dock-stat-label">Trades</span><span class="rep-dock-stat-value">${stats.totalTests}</span></div>
      <div class="rep-dock-stat"><span class="rep-dock-stat-label">Replay Time</span><span class="rep-dock-stat-value" style="font-size:11px">${dateStr}</span></div>
    </div>
    <div class="rep-dock-actions">
      <input type="number" class="rep-qty-input" id="rep-qty-input" placeholder="Lots" step="0.01" value="1.00">
      <button class="rep-exec-btn rep-exec-buy" onclick="_repExecuteTrade('buy')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>Buy</button>
      <button class="rep-exec-btn rep-exec-sell" onclick="_repExecuteTrade('sell')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>Sell</button>
    </div>
  `;
}

// ── Trade execution bridge (Chart Replay → Trade Simulator) ──
function _repExecuteTrade(direction) {
  if (!_repState) return;
  const candle = _repState.candles[_repState.index];
  if (!candle) { showToast('No candle to execute against', 'danger'); return; }
  const sessionId = _repState.sessionId;
  _repSaveState();
  document.getElementById('rep-fullscreen-overlay')?.remove();
  document.removeEventListener('keydown', _repKeyHandler);
  try { _repState.chart?.remove(); } catch (e) {}
  _repState = null;
  _openTradeEntryModal(sessionId, null, {
    direction,
    entry_price: candle.close,
    entry_time: new Date(candle.time).toISOString(),
  });
}

// ═══════════════════════════════════════════════════
// GOALS — Supabase-backed, per user
// Table: journal_goals  { id, user_id, data jsonb, created_at }
// data = { groups: [{q, items:[{t,done}]}], affirmations: [str] }
// ═══════════════════════════════════════════════════
let _goalsData = { groups: [], affirmations: [] };
let _goalsRowId = null;

async function _goalsLoad() {
  // Always reset to a clean, empty state first so no stale/previous-session
  // data (or the old shared default affirmations) can ever bleed into a
  // different account's view.
  _goalsRowId = null;
  _goalsData  = { groups: [], affirmations: [] };
  if (!_currentUser) return;
  const { data, error } = await sb
    .from('journal_goals')
    .select('id, data')
    .eq('user_id', _currentUser.id)
    .maybeSingle();
  if (error) { console.error('goalsLoad:', error.message); return; }
  if (data) {
    _goalsRowId = data.id;
    _goalsData  = data.data || { groups: [], affirmations: [] };
    if (!_goalsData.affirmations) _goalsData.affirmations = [];
    if (!_goalsData.groups) _goalsData.groups = [];
  }
}

async function _goalsSave() {
  if (!_currentUser) return;
  const row = { user_id: _currentUser.id, data: _goalsData };
  if (_goalsRowId) {
    await sb.from('journal_goals').update(row).eq('id', _goalsRowId);
  } else {
    const { data } = await sb.from('journal_goals').insert(row).select('id').single();
    if (data) _goalsRowId = data.id;
  }
}

function buildGoals() {
  // Personal bests from live trades
  const pbTbody = document.getElementById('goals-pb-tbody');
  if (pbTbody) {
    const wins = trades.filter(t => t.pnl > 0);
    const bigWin = wins.length ? wins.reduce((a, b) => _pnlPctValue(b) > _pnlPctValue(a) ? b : a, wins[0]) : null;
    // Best month
    const monthMap = {};
    trades.forEach(t => { const k = t.date.slice(0,7); monthMap[k] = (monthMap[k]||0)+_pnlPctValue(t); });
    const bestMonthKey = Object.keys(monthMap).sort((a,b) => monthMap[b]-monthMap[a])[0];
    // Streak
    const sorted = [...trades].sort((a,b) => a.date.localeCompare(b.date));
    let maxStreak=0, cur=0;
    sorted.forEach(t => { if(t.outcome==='Win'){cur++;maxStreak=Math.max(maxStreak,cur);}else cur=0; });
    // Best RR
    const rrAll = trades.map(t => { const v = _parseRR(t.rr); return v !== null ? {v,t} : null; }).filter(Boolean);
    const bestRR = rrAll.length ? rrAll.reduce((a,b)=>b.v>a.v?b:a,rrAll[0]) : null;

    pbTbody.innerHTML = [
      bigWin  ? `<tr><td>Biggest Win %</td><td class="outcome-win mono">${_pnlLabel(bigWin)}</td><td>${bigWin.date}</td><td class="bold">${bigWin.pair}</td></tr>` : '',
      bestMonthKey ? `<tr><td>Best Month PnL</td><td class="outcome-win mono">+${monthMap[bestMonthKey].toFixed(1)}%</td><td>${bestMonthKey}</td><td>—</td></tr>` : '',
      maxStreak ? `<tr><td>Longest Win Streak</td><td class="outcome-win mono">${maxStreak} trades</td><td>—</td><td>—</td></tr>` : '',
      bestRR  ? `<tr><td>Best R:R Achieved</td><td class="outcome-win mono">1:${bestRR.v}</td><td>${bestRR.t.date}</td><td class="bold">${bestRR.t.pair}</td></tr>` : '',
    ].filter(Boolean).join('') || '<tr><td colspan="4" style="color:var(--text3);text-align:center;font-style:italic">Log trades to see personal bests</td></tr>';
  }

  // Goals groups
  const goalsEl = document.getElementById('goals-list');
  if (goalsEl) {
    if (_goalsData.groups.length === 0) {
      goalsEl.innerHTML = '<div class="wl-empty-state" style="padding:30px 0"><div class="wl-empty-icon">' + icon('target') + '</div><div class="wl-empty-title">No goals yet</div><div class="wl-empty-sub">Click + Add Group to create your first goal group.</div></div>';
    } else {
      goalsEl.innerHTML = _goalsData.groups.map((g, gi) => {
        const gTotal = g.items.length;
        const gDone  = g.items.filter(item => item.done).length;
        const gPct   = gTotal ? Math.round((gDone / gTotal) * 100) : 0;
        return `
        <div class="goals-group" style="margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-size:12px;font-weight:700;color:var(--text2);letter-spacing:.3px">${g.q}</div>
            <div style="display:flex;gap:6px">
              <button class="wl-week-btn" style="font-size:10px;padding:3px 9px" onclick="goalsAddItem(${gi})">＋ Goal</button>
              <button class="wl-week-btn danger" style="font-size:10px;padding:3px 9px" onclick="goalsDeleteGroup(${gi})"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
            </div>
          </div>
          <div class="acc-progress-wrap" style="margin-top:0;margin-bottom:10px">
            <div class="acc-progress-label">
              <span>${gDone} of ${gTotal} complete</span>
              <span>${gPct}%</span>
            </div>
            <div class="acc-progress-bg">
              <div class="acc-progress-fill" style="width:${gPct}%"></div>
            </div>
          </div>
          <div class="checklist-grid">${g.items.map((item, ii) => {
            if (_goalEditIdx && _goalEditIdx.gi === gi && _goalEditIdx.ii === ii) {
              return `
            <div class="cl-item editing" draggable="false">
              <span class="cl-drag-handle" style="opacity:.25;cursor:default">⠿</span>
              <div class="cl-box">${item.done ? '✓' : ''}</div>
              <input type="text" class="cl-edit-input" id="goal-edit-input-${gi}-${ii}" value="${item.t.replace(/"/g,'&quot;')}"
                     onkeydown="if(event.key==='Enter'){goalSaveEdit(${gi},${ii})} else if(event.key==='Escape'){goalCancelEdit()}">
              <div class="acc-ms-actions" style="opacity:1">
                <button class="wl-week-btn primary" style="font-size:10px;padding:2px 7px" onclick="goalSaveEdit(${gi},${ii})">✓ Done</button>
                <button class="wl-week-btn" style="font-size:10px;padding:2px 7px" onclick="goalCancelEdit()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
              </div>
            </div>`;
            }
            return `
            <div class="cl-item${item.done?' checked':''}"
                 draggable="true"
                 ondragstart="goalDragStart(event,${gi},${ii})"
                 ondragover="goalDragOver(event)"
                 ondragenter="goalDragEnter(event,${gi},${ii})"
                 ondragleave="goalDragLeave(event)"
                 ondrop="goalDrop(event,${gi},${ii})"
                 ondragend="goalDragEnd(event)"
                 onclick="goalsToggle(${gi},${ii})">
              <span class="cl-drag-handle${_goalClickSrc && _goalClickSrc.gi===gi && _goalClickSrc.ii===ii ? ' selected' : ''}" onclick="goalHandleClick(event,${gi},${ii})" title="Drag, or click and click another to swap">⠿</span>
              <div class="cl-box">${item.done?'✓':''}</div>
              <span class="cl-text">${item.t}</span>
              <div class="acc-ms-actions">
                <button class="wl-week-btn" style="font-size:10px;padding:2px 7px" onclick="goalStartEdit(${gi},${ii});event.stopPropagation()"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
                <button class="wl-week-btn danger" style="font-size:10px;padding:2px 7px" onclick="goalDeleteItem(${gi},${ii});event.stopPropagation()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
              </div>
            </div>`;
          }).join('')}
          </div>
        </div>`;
      }).join('');
    }
    _renderGoalsProgress();
    if (_goalEditIdx) {
      const input = document.getElementById(`goal-edit-input-${_goalEditIdx.gi}-${_goalEditIdx.ii}`);
      if (input) { input.focus(); input.select(); }
    }
  }

  // Affirmations
  const affEl = document.getElementById('affirmations');
  if (affEl) {
    if (!_goalsData.affirmations || _goalsData.affirmations.length === 0) {
      affEl.innerHTML = '<div class="wl-empty-state" style="padding:30px 0"><div class="wl-empty-icon"><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg></div><div class="wl-empty-title">No affirmations yet</div><div class="wl-empty-sub">Click + Add above to create your first one.</div></div>';
      return;
    }
    affEl.innerHTML = _goalsData.affirmations.map((a, i) => {
      if (_affEditIdx === i) {
        return `
      <div class="rule-card aff-card editing" draggable="false">
        <span class="cl-drag-handle" style="opacity:.25;cursor:default">⠿</span>
        <div style="flex:1;min-width:0">
          <div class="rule-num">${String(i+1).padStart(2,'0')}</div>
          <input type="text" class="cl-edit-input" id="aff-edit-input-${i}" value="${a.replace(/"/g,'&quot;')}"
                 onkeydown="if(event.key==='Enter'){affSaveEdit(${i})} else if(event.key==='Escape'){affCancelEdit()}">
        </div>
        <div class="acc-ms-actions" style="opacity:1">
          <button class="wl-week-btn primary" style="font-size:10px;padding:2px 7px" onclick="affSaveEdit(${i})">✓ Done</button>
          <button class="wl-week-btn" style="font-size:10px;padding:2px 7px" onclick="affCancelEdit()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
        </div>
      </div>`;
      }
      return `
      <div class="rule-card aff-card"
           draggable="true"
           ondragstart="affDragStart(event,${i})"
           ondragover="affDragOver(event)"
           ondragenter="affDragEnter(event,${i})"
           ondragleave="affDragLeave(event)"
           ondrop="affDrop(event,${i})"
           ondragend="affDragEnd(event)">
        <span class="cl-drag-handle${_affClickSrc===i ? ' selected' : ''}" onclick="affHandleClick(event,${i})" title="Drag, or click and click another to swap">⠿</span>
        <div style="flex:1;min-width:0">
          <div class="rule-num">${String(i+1).padStart(2,'0')}</div>
          <div class="rule-text" style="font-style:italic">"${a}"</div>
        </div>
        <div class="acc-ms-actions">
          <button class="wl-week-btn" style="font-size:10px;padding:2px 7px" onclick="affStartEdit(${i});event.stopPropagation()"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
          <button class="wl-week-btn danger" style="font-size:10px;padding:2px 7px" onclick="affDeleteItem(${i});event.stopPropagation()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
        </div>
      </div>`;
    }).join('');
    if (_affEditIdx !== null) {
      const input = document.getElementById(`aff-edit-input-${_affEditIdx}`);
      if (input) { input.focus(); input.select(); }
    }
  }
}

let _affDragSrc  = null;   // index currently being dragged
let _affClickSrc = null;   // index selected via click-to-reorder
let _affEditIdx  = null;   // index currently being inline-edited

function affDragStart(e, i) {
  _affDragSrc = i;
  _affClickSrc = null;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(i));
}

function affDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function affDragEnter(e, i) {
  if (_affDragSrc !== null && i !== _affDragSrc) e.currentTarget.classList.add('drag-over');
}

function affDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function affDrop(e, i) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (_affDragSrc === null || _affDragSrc === i) { _affDragSrc = null; return; }
  const arr = _goalsData.affirmations;
  const [moved] = arr.splice(_affDragSrc, 1);
  arr.splice(i, 0, moved);
  _affDragSrc = null;
  buildGoals();
  await _goalsSave();
}

function affDragEnd() {
  document.querySelectorAll('#affirmations .aff-card').forEach(el => el.classList.remove('dragging', 'drag-over'));
  _affDragSrc = null;
}

async function affHandleClick(e, i) {
  e.stopPropagation();
  if (_affClickSrc === null) {
    _affClickSrc = i;
    buildGoals();
  } else if (_affClickSrc === i) {
    _affClickSrc = null;
    buildGoals();
  } else {
    const arr = _goalsData.affirmations;
    const [moved] = arr.splice(_affClickSrc, 1);
    arr.splice(i, 0, moved);
    _affClickSrc = null;
    buildGoals();
    await _goalsSave();
  }
}

function affStartEdit(i) {
  _affClickSrc = null;
  _affEditIdx = i;
  buildGoals();
}

async function affSaveEdit(i) {
  const input = document.getElementById(`aff-edit-input-${i}`);
  const text = input ? input.value.trim() : '';
  if (text) _goalsData.affirmations[i] = text;
  _affEditIdx = null;
  buildGoals();
  await _goalsSave();
}

function affCancelEdit() {
  _affEditIdx = null;
  buildGoals();
}

function affAddItem() {
  const text = prompt('Affirmation:');
  if (!text) return;
  _goalsData.affirmations.push(text.trim());
  buildGoals();
  _goalsSave();
}

async function affDeleteItem(i) {
  if (!confirm(`Delete this affirmation?`)) return;
  _goalsData.affirmations.splice(i, 1);
  buildGoals();
  await _goalsSave();
}

let _goalDragSrc  = null;   // {gi, ii} currently being dragged
let _goalClickSrc = null;   // {gi, ii} selected via click-to-reorder
let _goalEditIdx  = null;   // {gi, ii} currently being inline-edited

async function goalsToggle(gi, ii) {
  _goalsData.groups[gi].items[ii].done = !_goalsData.groups[gi].items[ii].done;
  buildGoals();
  await _goalsSave();
}

function goalStartEdit(gi, ii) {
  _goalClickSrc = null;
  _goalEditIdx = { gi, ii };
  buildGoals();
}

async function goalSaveEdit(gi, ii) {
  const input = document.getElementById(`goal-edit-input-${gi}-${ii}`);
  const text = input ? input.value.trim() : '';
  if (text) _goalsData.groups[gi].items[ii].t = text;
  _goalEditIdx = null;
  buildGoals();
  await _goalsSave();
}

function goalCancelEdit() {
  _goalEditIdx = null;
  buildGoals();
}

async function goalDeleteItem(gi, ii) {
  if (!confirm(`Delete goal: "${_goalsData.groups[gi].items[ii].t}"?`)) return;
  _goalsData.groups[gi].items.splice(ii, 1);
  buildGoals();
  await _goalsSave();
}

function goalDragStart(e, gi, ii) {
  _goalDragSrc = { gi, ii };
  _goalClickSrc = null;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(ii));
}

function goalDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function goalDragEnter(e, gi, ii) {
  if (_goalDragSrc && _goalDragSrc.gi === gi && _goalDragSrc.ii !== ii) e.currentTarget.classList.add('drag-over');
}

function goalDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function goalDrop(e, gi, ii) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over');
  if (!_goalDragSrc || _goalDragSrc.gi !== gi || _goalDragSrc.ii === ii) { _goalDragSrc = null; return; }
  const arr = _goalsData.groups[gi].items;
  const [moved] = arr.splice(_goalDragSrc.ii, 1);
  arr.splice(ii, 0, moved);
  _goalDragSrc = null;
  buildGoals();
  await _goalsSave();
}

function goalDragEnd() {
  document.querySelectorAll('.goals-group .cl-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
  _goalDragSrc = null;
}

async function goalHandleClick(e, gi, ii) {
  e.stopPropagation();
  if (!_goalClickSrc) {
    _goalClickSrc = { gi, ii };
    buildGoals();
  } else if (_goalClickSrc.gi === gi && _goalClickSrc.ii === ii) {
    _goalClickSrc = null;
    buildGoals();
  } else if (_goalClickSrc.gi !== gi) {
    // Reordering is confined to within a single group
    _goalClickSrc = { gi, ii };
    buildGoals();
  } else {
    const arr = _goalsData.groups[gi].items;
    const [moved] = arr.splice(_goalClickSrc.ii, 1);
    arr.splice(ii, 0, moved);
    _goalClickSrc = null;
    buildGoals();
    await _goalsSave();
  }
}

function _renderGoalsProgress() {
  const fill = document.getElementById('goals-progress-fill');
  const text = document.getElementById('goals-progress-text');
  const pct  = document.getElementById('goals-progress-pct');
  if (!fill || !text || !pct) return;
  const allItems = _goalsData.groups.flatMap(g => g.items);
  const total = allItems.length;
  const done  = allItems.filter(item => item.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  text.textContent = `${done} of ${total} complete`;
  pct.textContent  = `${percent}%`;
  fill.style.setProperty('--target-width', percent + '%');
  fill.style.width = percent + '%';
}

function goalsAddGroup() {
  const name = prompt('Goal group name (e.g. Q3 2026 <svg class="icn icn-blue" aria-hidden="true"><use href="#ic-dot"></use></svg>):');
  if (!name) return;
  _goalsData.groups.push({ q: name, items: [] });
  buildGoals();
  _goalsSave();
}

function goalsDeleteGroup(gi) {
  if (!confirm(`Delete "${_goalsData.groups[gi].q}"?`)) return;
  _goalsData.groups.splice(gi, 1);
  buildGoals();
  _goalsSave();
}

function goalsAddItem(gi) {
  const text = prompt('Goal text:');
  if (!text) return;
  _goalsData.groups[gi].items.push({ t: text, done: false });
  buildGoals();
  _goalsSave();
}

// ═══════════════════════════════════════════════════
// MONTHLY REVIEW — dynamic from trades + Supabase reflections
// Table: journal_monthly { id, user_id, month_key text, r1 text, r2 text, r3 text }
// month_key = "2026-05"
// ═══════════════════════════════════════════════════
let _mrYear  = new Date().getFullYear();
let _mrMonth = new Date().getMonth(); // 0-based
let _mrCache = {};  // { "2026-05": { id, r1, r2, r3 } }
let _mrDirty = false;

const _MR_MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
const _MR_GRADE = (wr) => wr >= 75 ? 'A' : wr >= 65 ? 'B' : wr >= 55 ? 'C' : 'D';

async function _mrLoadMonth(key) {
  if (_mrCache[key] !== undefined) return;
  if (!_currentUser) { _mrCache[key] = null; return; }
  const { data, error } = await sb.from('journal_monthly')
    .select('id, r1, r2, r3').eq('user_id', _currentUser.id).eq('month_key', key).maybeSingle();
  if (error) { console.error('mrLoad:', error.message); _mrCache[key] = null; return; }
  _mrCache[key] = data || null;
}

async function mrSaveReflections() {
  if (!_currentUser) return;
  const key = `${_mrYear}-${String(_mrMonth+1).padStart(2,'0')}`;
  const r1 = document.getElementById('mr-r1')?.value || '';
  const r2 = document.getElementById('mr-r2')?.value || '';
  const r3 = document.getElementById('mr-r3')?.value || '';
  const row = { user_id: _currentUser.id, month_key: key, r1, r2, r3 };
  const btn = document.getElementById('mr-save-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
  if (_mrCache[key]?.id) {
    await sb.from('journal_monthly').update(row).eq('id', _mrCache[key].id);
    _mrCache[key] = { ..._mrCache[key], r1, r2, r3 };
  } else {
    const { data } = await sb.from('journal_monthly').insert(row).select('id').single();
    _mrCache[key] = { id: data?.id, r1, r2, r3 };
  }
  if (btn) { btn.textContent = '✓ Saved'; btn.disabled = false; }
  _mrDirty = false;
  setTimeout(() => { if(btn) { btn.style.display='none'; } }, 1500);
}

function mrReflectDirty() {
  _mrDirty = true;
  const btn = document.getElementById('mr-save-btn');
  if (btn) btn.style.display = '';
}

function mrNav(dir) {
  _mrMonth += dir;
  if (_mrMonth > 11) { _mrMonth = 0; _mrYear++; }
  if (_mrMonth < 0)  { _mrMonth = 11; _mrYear--; }
  buildMonthlyReview();
}

// Expand/collapse the per-trade list under a Pair Breakdown row.
function _mrTogglePairRow(rowId, headerEl) {
  const rows = document.querySelectorAll(`tr.mr-pair-sub-row[data-group="${rowId}"]`);
  const isOpen = rows.length && rows[0].style.display !== 'none';
  rows.forEach(r => { r.style.display = isOpen ? 'none' : 'table-row'; });
  const arrow = headerEl?.querySelector('.mr-pair-arrow');
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

// Normalize a trade's PnL to a percentage, the same way updateKPIs() does:
// MT5/$-unit trades store their pnl in dollars, so it must be converted via
// the trade's own account size before it can be treated as a percentage.
// Without this, dollar values (e.g. -$1018 on a BTCUSD.X MT5 import) were
// being printed directly as "-101.8%", which also corrupted every aggregate
// (Net PnL, Avg Loss, Profit Factor, Pair Breakdown) that summed raw t.pnl.
function _mrTradePct(t) {
  const accSize = getAccSizeForAccount(t.account);
  const dollars = toPnlDollars(t, accSize);
  if (accSize > 0) return (dollars / accSize) * 100;
  // No known account size — if it's already a plain % trade, use it as-is;
  // otherwise we can't meaningfully convert, so fall back to 0 rather than
  // displaying a dollar figure dressed up as a percentage.
  return (!_isMt5Trade(t) && t.pnlUnit !== '$') ? (parseFloat(t.pnl) || 0) : 0;
}

async function buildMonthlyReview() {
  const key = `${_mrYear}-${String(_mrMonth+1).padStart(2,'0')}`;
  const monthName = _MR_MONTHS[_mrMonth];

  // Update nav label
  const navLabel = document.getElementById('mr-nav-label');
  if (navLabel) navLabel.textContent = `${monthName} ${_mrYear}`;

  // Filter trades for this month
  const mt = trades.filter(t => t.date.startsWith(key));
  const wins   = mt.filter(t => t.outcome === 'Win');
  const losses = mt.filter(t => t.outcome === 'Loss');
  const wr     = mt.length ? ((wins.length / mt.length) * 100).toFixed(1) : 0;
  const pctOf  = (t) => _mrTradePct(t);
  const netPnl = mt.reduce((a, t) => a + pctOf(t), 0).toFixed(1);
  const avgW   = wins.length   ? (wins.reduce((a,t)=>a+pctOf(t),0)/wins.length).toFixed(1) : 0;
  const avgL   = losses.length ? (losses.reduce((a,t)=>a+pctOf(t),0)/losses.length).toFixed(1) : 0;
  const lossPnls = losses.map(pctOf);
  const winPnls  = wins.map(pctOf);
  const pf = lossPnls.length
    ? Math.abs(winPnls.reduce((a,b)=>a+b,0) / lossPnls.reduce((a,b)=>a+b,0)).toFixed(2)
    : '∞';
  // Streak within month
  const sorted = [...mt].sort((a,b)=>a.date.localeCompare(b.date));
  let maxS=0, curS=0;
  sorted.forEach(t => { if(t.outcome==='Win'){curS++;maxS=Math.max(maxS,curS);}else curS=0; });
  const grade = _MR_GRADE(parseFloat(wr));

  // Cover
  const coverLabel = document.getElementById('mr-cover-label');
  const coverTitle = document.getElementById('mr-cover-title');
  const coverSub   = document.getElementById('mr-cover-sub');
  if (coverLabel) coverLabel.textContent = 'Deep Performance Review · ' + _mrYear;
  if (coverTitle) coverTitle.textContent = 'Monthly Review — ' + monthName;
  if (coverSub && mt.length) coverSub.textContent =
    `Grade: ${grade} · ${mt.length} trades · Win streak ${maxS}`;
  else if (coverSub) coverSub.textContent = 'No trades logged this month';

  // Stats grid
  const statsGrid = document.getElementById('mr-stats-grid');
  if (statsGrid) {
    if (mt.length === 0) {
      statsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text3);font-style:italic">No trades logged for ' + monthName + ' ' + _mrYear + '</div>';
    } else {
      const pnlCol = netPnl >= 0 ? 'green' : 'red';
      statsGrid.innerHTML = `
        <div class="month-stat"><div class="month-stat-label">Total Trades</div><div class="month-stat-val blue">${mt.length}</div></div>
        <div class="month-stat"><div class="month-stat-label">Win Rate</div><div class="month-stat-val ${wr>=65?'green':'red'}">${wr}%</div></div>
        <div class="month-stat"><div class="month-stat-label">Net PnL</div><div class="month-stat-val ${pnlCol}">${netPnl>=0?'+':''}${netPnl}%</div></div>
        <div class="month-stat"><div class="month-stat-label">Avg Win</div><div class="month-stat-val green">+${avgW}%</div></div>
        <div class="month-stat"><div class="month-stat-label">Avg Loss</div><div class="month-stat-val red">${avgL}%</div></div>
        <div class="month-stat"><div class="month-stat-label">Profit Factor</div><div class="month-stat-val gold">${pf}x</div></div>
        <div class="month-stat"><div class="month-stat-label">Win Streak</div><div class="month-stat-val blue">${maxS}</div></div>
        <div class="month-stat"><div class="month-stat-label">Grade</div><div class="month-stat-val ${grade==='A'?'green':grade==='B'?'blue':grade==='C'?'gold':'red'}">${grade}</div></div>`;
    }
  }

  // Loss audit — rows are clickable to open the underlying trade
  const lossTbody = document.getElementById('mr-loss-tbody');
  if (lossTbody) {
    lossTbody.innerHTML = losses.length
      ? losses.map(t => `
          <tr class="mr-clickable-row" onclick="openDetail(${t.id})" title="Click to view trade">
            <td>${t.date}</td>
            <td class="bold">${t.pair}</td>
            <td>${t.strategy || '—'}</td>
            <td class="outcome-loss mono">${pctOf(t).toFixed(1)}%</td>
            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.notes || '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--text3);text-align:center;font-style:italic">No losses this month <svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg></td></tr>';
  }

  // Pair breakdown — each pair row expands to list its trades for the
  // month; clicking a trade in that list opens it in the detail panel.
  const pairTbody = document.getElementById('mr-pair-tbody');
  if (pairTbody) {
    const pairMap = {};
    mt.forEach(t => {
      if (!pairMap[t.pair]) pairMap[t.pair] = { trades: 0, wins: 0, pnl: 0, list: [] };
      pairMap[t.pair].trades++;
      if (t.outcome === 'Win') pairMap[t.pair].wins++;
      pairMap[t.pair].pnl += pctOf(t);
      pairMap[t.pair].list.push(t);
    });
    const pairs = Object.entries(pairMap).sort((a,b) => b[1].pnl - a[1].pnl);
    pairTbody.innerHTML = pairs.length
      ? pairs.map(([pair, d], idx) => {
          const pwr = ((d.wins/d.trades)*100).toFixed(0);
          const pc  = d.pnl >= 0 ? 'outcome-win' : 'outcome-loss';
          const rowId = `mr-pair-sub-${idx}`;
          const subRows = d.list
            .sort((a,b) => a.date.localeCompare(b.date))
            .map(t => `
              <tr class="mr-clickable-row mr-pair-sub-row" data-group="${rowId}" style="display:none" onclick="event.stopPropagation();openDetail(${t.id})" title="Click to view trade">
                <td style="padding-left:26px;color:var(--text3)"><svg class="icn" aria-hidden="true"><use href="#ic-arrow-right"></use></svg> ${t.date}</td>
                <td colspan="2" style="color:var(--text2)">${t.strategy || '—'}</td>
                <td class="${t.outcome==='Win'?'outcome-win':'outcome-loss'} mono">${pctOf(t)>=0?'+':''}${pctOf(t).toFixed(1)}%</td>
              </tr>`).join('');
          return `<tr class="mr-clickable-row mr-pair-row" data-group="${rowId}" onclick="_mrTogglePairRow('${rowId}',this)" title="Click to view trades for ${pair}">
            <td class="bold"><span class="mr-pair-arrow" style="display:inline-block;width:12px;transition:transform .15s">▸</span> ${pair}</td>
            <td>${d.trades}</td>
            <td class="${pwr>=65?'outcome-win':'outcome-loss'} mono">${pwr}%</td>
            <td class="${pc} mono">${d.pnl>=0?'+':''}${d.pnl.toFixed(1)}%</td>
          </tr>${subRows}`;
        }).join('')
      : '<tr><td colspan="4" style="color:var(--text3);text-align:center;font-style:italic">No trades this month</td></tr>';
  }

  // Reflections — load from Supabase if not cached
  await _mrLoadMonth(key);
  const cached = _mrCache[key];
  const r1El = document.getElementById('mr-r1');
  const r2El = document.getElementById('mr-r2');
  const r3El = document.getElementById('mr-r3');
  if (r1El) r1El.value = cached?.r1 || '';
  if (r2El) r2El.value = cached?.r2 || '';
  if (r3El) r3El.value = cached?.r3 || '';
  _mrDirty = false;
  const btn = document.getElementById('mr-save-btn');
  if (btn) btn.style.display = 'none';
}

