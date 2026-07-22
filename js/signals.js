// ══ NxTGen Journal — signals.js ══
// Premium "Signals" page: publish & track trading signals for the community.
// Follows the same patterns as the rest of the app (sb client, showToast, nav()).
//
// Data layer: tries Supabase table `journal_signals` first (see
// supabase/signals_schema.sql). If the table doesn't exist yet, or the
// request fails for any reason, it transparently falls back to a local demo
// dataset persisted in localStorage — so the page is fully explorable before
// you've run the migration, and never throws a hard error at the user.

(function () {

  // ── State ──────────────────────────────────────────────────────
  let _sigAll = [];              // all loaded signals
  let _sigView = 'table';        // 'table' | 'cards' | 'calendar' | 'analytics'
  let _sigFilter = 'all';        // active quick-filter chip
  let _sigSearch = '';
  let _sigUsingSupabase = false;
  let _sigCalMonth = new Date();
  let _sigLikes = JSON.parse(localStorage.getItem('sig_likes') || '{}');
  let _sigBookmarks = JSON.parse(localStorage.getItem('sig_bookmarks') || '{}');
  let _sigInitDone = false;

  const SIG_STORE_KEY = 'nxt_signals_demo_v1';

  const MARKET_ICON = {
    forex: 'ic-globe', crypto: 'ic-zap', indices: 'ic-chart-bar',
    commodities: 'ic-box', stocks: 'ic-trend-up', synthetic: 'ic-activity'
  };
  const MARKET_LABEL = {
    forex: 'Forex', crypto: 'Crypto', indices: 'Indices',
    commodities: 'Commodities', stocks: 'Stocks', synthetic: 'Synthetic Indices'
  };
  const STATUS_LABEL = {
    waiting: 'Waiting', active: 'Active', partial: 'Partial',
    tp1_hit: 'Hit TP1', tp2_hit: 'Hit TP2', tp3_hit: 'Hit TP3',
    stopped_out: 'Stopped Out', cancelled: 'Cancelled', expired: 'Expired'
  };
  const CONF_LABEL = { low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very High' };
  const TIMELINE_STEPS = ['waiting', 'active', 'tp1_hit', 'tp2_hit', 'tp3_hit', 'closed'];

  // ── Icon helper ────────────────────────────────────────────────
  function icn(id, cls) {
    return `<svg class="icn ${cls || ''}" aria-hidden="true"><use href="#${id}"></use></svg>`;
  }

  // ══════════════════════════════════════════════════════════════
  // DEMO DATA
  // ══════════════════════════════════════════════════════════════
  function _rand(min, max) { return Math.random() * (max - min) + min; }
  function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function _uid() { return 'sig_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function _generateDemoSignals() {
    const pairs = [
      { p: 'EURUSD', m: 'forex', dec: 5, base: 1.1650 },
      { p: 'GBPUSD', m: 'forex', dec: 5, base: 1.2720 },
      { p: 'USDJPY', m: 'forex', dec: 3, base: 156.20 },
      { p: 'XAUUSD', m: 'commodities', dec: 2, base: 2385.5 },
      { p: 'BTCUSD', m: 'crypto', dec: 1, base: 64500 },
      { p: 'ETHUSD', m: 'crypto', dec: 2, base: 3420 },
      { p: 'NAS100', m: 'indices', dec: 1, base: 19850 },
      { p: 'US30', m: 'indices', dec: 1, base: 40200 },
      { p: 'AAPL', m: 'stocks', dec: 2, base: 224.5 },
      { p: 'Boom 1000', m: 'synthetic', dec: 2, base: 9520 }
    ];
    const statuses = ['waiting', 'active', 'active', 'partial', 'tp1_hit', 'tp2_hit', 'tp3_hit', 'stopped_out', 'cancelled', 'expired'];
    const confidences = ['low', 'medium', 'high', 'very_high'];
    const sessions = ['sydney', 'tokyo', 'london', 'new_york', 'london_ny_overlap'];
    const setups = ['ERL > IRL', 'Breaker Retest', 'FVG Continuation', 'London Sweep', 'Order Block Reject', 'SMT Divergence'];
    const confluenceOptions = ['Liquidity Sweep', 'FVG', 'Order Block', 'SMT', 'Structure Shift', 'Volume Spike'];

    const rows = [];
    const now = Date.now();
    for (let i = 0; i < 24; i++) {
      const inst = _pick(pairs);
      const dir = Math.random() > 0.5 ? 'buy' : 'sell';
      const status = _pick(statuses);
      const range = inst.base * 0.006;
      const entry = inst.base + _rand(-range, range);
      const slDist = Math.abs(entry) * _rand(0.002, 0.006);
      const sl = dir === 'buy' ? entry - slDist : entry + slDist;
      const tp1 = dir === 'buy' ? entry + slDist * 1.3 : entry - slDist * 1.3;
      const tp2 = dir === 'buy' ? entry + slDist * 2.4 : entry - slDist * 2.4;
      const tp3 = dir === 'buy' ? entry + slDist * 3.8 : entry - slDist * 3.8;
      const rr = (Math.abs(tp3 - entry) / Math.abs(entry - sl)).toFixed(1);
      const isClosed = ['tp1_hit', 'tp2_hit', 'tp3_hit', 'stopped_out', 'cancelled', 'expired'].includes(status);
      const isWin = ['tp1_hit', 'tp2_hit', 'tp3_hit'].includes(status);
      const pips = isClosed ? (isWin ? _rand(15, 180) : (status === 'stopped_out' ? -_rand(10, 60) : 0)) : null;
      const created = now - Math.floor(_rand(0, 21)) * 86400000 - Math.floor(_rand(0, 24)) * 3600000;
      const confluences = confluenceOptions.filter(() => Math.random() > 0.55);
      if (!confluences.length) confluences.push(_pick(confluenceOptions));

      rows.push({
        id: _uid(),
        pair: inst.p, market: inst.m, direction: dir,
        entry: +entry.toFixed(inst.dec), stop_loss: +sl.toFixed(inst.dec),
        tp1: +tp1.toFixed(inst.dec), tp2: +tp2.toFixed(inst.dec), tp3: +tp3.toFixed(inst.dec),
        risk_reward: +rr, risk_percent: _pick([0.5, 1, 1.5, 2]), risk_amount: null,
        confidence: _pick(confidences), confidence_score: Math.floor(_rand(55, 98)),
        session: _pick(sessions), setup_type: _pick(setups), status,
        visibility: _pick(['public', 'public', 'premium', 'private']),
        trade_idea: `${dir === 'buy' ? 'Bullish' : 'Bearish'} continuation off higher-timeframe ${dir === 'buy' ? 'demand' : 'supply'} with confirmed liquidity sweep.`,
        market_outlook: `${inst.p} showing ${dir === 'buy' ? 'accumulation' : 'distribution'} on the 4H with a clean break of structure.`,
        htf_bias: dir === 'buy' ? 'Bullish' : 'Bearish',
        entry_reason: `Price swept ${dir === 'buy' ? 'sell-side' : 'buy-side'} liquidity and reacted from an unmitigated ${_pick(['order block', 'FVG', 'breaker'])}.`,
        invalidation: `Close beyond the ${dir === 'buy' ? 'low' : 'high'} of the reaction candle invalidates the idea.`,
        management_rules: 'Move to breakeven after TP1. Trail remainder behind structure after TP2.',
        notes: '', lessons: '',
        confluences, tags: [inst.m, dir],
        chart_screenshot_url: null, tradingview_link: `https://www.tradingview.com/chart/?symbol=${inst.p}`,
        expires_at: null,
        published_at: created, entered_at: status !== 'waiting' ? created + 3600000 : null,
        closed_at: isClosed ? created + 7200000 : null,
        result: isClosed ? (isWin ? 'win' : (status === 'stopped_out' ? 'loss' : 'breakeven')) : 'pending',
        pips: pips !== null ? +pips.toFixed(1) : null,
        profit_percent: pips !== null ? +((pips / 100) * _pick([0.8, 1, 1.2])).toFixed(2) : null,
        r_multiple: isClosed ? (isWin ? +_rand(1, 3.8).toFixed(1) : (status === 'stopped_out' ? -1 : 0)) : null,
        is_draft: false,
        created_at: created, updated_at: created,
        checklist: [
          { label: 'Higher timeframe bias confirmed', done: true },
          { label: 'Liquidity swept before entry', done: true },
          { label: 'Risk sized to plan (≤2%)', done: Math.random() > 0.2 },
          { label: 'Session aligns with setup', done: Math.random() > 0.3 }
        ],
        comments: []
      });
    }
    return rows.sort((a, b) => b.created_at - a.created_at);
  }

  function _loadDemoSignals() {
    try {
      const raw = localStorage.getItem(SIG_STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupt storage */ }
    const fresh = _generateDemoSignals();
    localStorage.setItem(SIG_STORE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  function _saveDemoSignals() {
    try { localStorage.setItem(SIG_STORE_KEY, JSON.stringify(_sigAll)); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════
  // DATA LOADING (Supabase-first, demo fallback)
  // ══════════════════════════════════════════════════════════════
  async function _loadSignals() {
    if (typeof sb !== 'undefined' && sb) {
      try {
        const { data, error } = await sb.from('journal_signals').select('*').order('created_at', { ascending: false }).limit(500);
        if (!error && data) {
          _sigUsingSupabase = true;
          return data;
        }
      } catch (e) { /* table probably doesn't exist yet — fall through to demo */ }
    }
    _sigUsingSupabase = false;
    return _loadDemoSignals();
  }

  // ══════════════════════════════════════════════════════════════
  // ENTRY POINT — called by nav() when navigating to the Signals page
  // ══════════════════════════════════════════════════════════════
  window.buildSignals = async function buildSignals() {
    const page = document.getElementById('page-signals');
    if (!page) return;
    if (!_sigInitDone) {
      _sigInitDone = true;
      page.innerHTML = _sigPageShell();
    }
    _sigAll = await _loadSignals();
    _sigRenderStats();
    _sigRenderActiveView();
    if (!_sigUsingSupabase) {
      const badge = document.getElementById('sig-demo-badge');
      if (badge) badge.style.display = 'inline-flex';
    }
  };

  // ══════════════════════════════════════════════════════════════
  // PAGE SHELL
  // ══════════════════════════════════════════════════════════════
  function _sigPageShell() {
    return `
    <div class="sig-header">
      <div>
        <div class="sig-header-title">Signals
          <span id="sig-demo-badge" class="sig-market-badge" style="display:none;margin-left:8px;vertical-align:middle">${icn('ic-info')} Demo data — connect Supabase to publish live</span>
        </div>
        <div class="sig-header-sub">Share and manage professional trading signals.</div>
      </div>
      <div class="sig-header-actions">
        <div class="sig-view-toggle">
          <button class="active" data-view="table" onclick="_sigSetView('table')">${icn('ic-menu')} Table</button>
          <button data-view="cards" onclick="_sigSetView('cards')">${icn('ic-folder')} Cards</button>
          <button data-view="calendar" onclick="_sigSetView('calendar')">${icn('ic-calendar')} Calendar</button>
          <button data-view="analytics" onclick="_sigSetView('analytics')">${icn('ic-chart-pie')} Analytics</button>
        </div>
        <button class="btn btn-primary btn-ripple" onclick="_sigOpenModal()">${icn('ic-plus')} <span class="lbl-full">New Signal</span></button>
      </div>
    </div>

    <div class="sig-stats-grid" id="sig-stats-grid"></div>

    <div class="sig-filter-bar">
      <div class="sig-filter-scroll" id="sig-filter-chips"></div>
      <div class="sig-search-wrap">
        ${icn('ic-search')}
        <input type="text" id="sig-search-input" placeholder="Search pair or market…" oninput="_sigOnSearch(this.value)">
      </div>
    </div>

    <div id="sig-view-root"></div>

    <button id="sig-fab-new" onclick="_sigOpenModal()">${icn('ic-plus')}</button>
    `;
  }

  // ── Combinable multi-select filters ─────────────────────────────
  // Each chip belongs to a group; chips within a group OR together,
  // groups AND together — e.g. Forex+Crypto (market) AND Winning (result)
  // AND This Month (timeframe) AND High Confidence (confidence) AND
  // London (session) all apply at once, matching the brief's example.
  const FILTER_GROUPS = {
    status: [{ id: 'active', label: 'Active' }, { id: 'closed', label: 'Closed' }],
    result: [{ id: 'winning', label: 'Winning' }, { id: 'losing', label: 'Losing' }, { id: 'pending', label: 'Pending' }],
    market: [{ id: 'forex', label: 'Forex' }, { id: 'crypto', label: 'Crypto' }, { id: 'indices', label: 'Indices' }],
    timeframe: [{ id: 'today', label: 'Today' }, { id: 'week', label: 'This Week' }, { id: 'month', label: 'This Month' }],
    confidence: [{ id: 'highconf', label: 'High Confidence' }, { id: 'lowconf', label: 'Low Confidence' }],
    rr: [{ id: 'highrr', label: 'High RR' }],
    session: [{ id: 'london', label: 'London' }, { id: 'new_york', label: 'New York' }, { id: 'tokyo', label: 'Tokyo' }, { id: 'sydney', label: 'Sydney' }, { id: 'london_ny_overlap', label: 'Overlap' }]
  };
  // quick one-tap presets — apply a whole combo in one click
  const QUICK_PRESETS = [
    { label: 'Winning · This Month', combo: { result: ['winning'], timeframe: ['month'] } },
    { label: 'Forex · High Confidence', combo: { market: ['forex'], confidence: ['highconf'] } },
    { label: 'High RR · Active', combo: { rr: ['highrr'], status: ['active'] } },
    { label: 'London Session', combo: { session: ['london'] } },
  ];

  let _sigActiveFilters = {}; // { groupKey: Set(chipId) }
  function _sigChipSet(group) { return _sigActiveFilters[group] || (_sigActiveFilters[group] = new Set()); }
  function _sigActiveChipCount() { return Object.values(_sigActiveFilters).reduce((a, s) => a + (s ? s.size : 0), 0); }

  window._sigToggleChip = function (group, id) {
    const set = _sigChipSet(group);
    set.has(id) ? set.delete(id) : set.add(id);
    _sigRenderFilterChips();
    _sigRenderActiveView();
  };
  window._sigApplyPreset = function (i) {
    const combo = QUICK_PRESETS[i].combo;
    _sigActiveFilters = {};
    Object.entries(combo).forEach(([g, ids]) => { _sigChipSet(g); ids.forEach(id => _sigChipSet(g).add(id)); });
    _sigRenderFilterChips();
    _sigRenderActiveView();
    showToast('Applied "' + QUICK_PRESETS[i].label + '"', 'success');
  };
  window._sigResetFilters = function () {
    _sigActiveFilters = {};
    _sigSearch = '';
    const input = document.getElementById('sig-search-input'); if (input) input.value = '';
    _sigRenderFilterChips();
    _sigRenderActiveView();
    showToast('Filters reset', 'info');
  };

  // ── Saved filters (persisted per-browser) ───────────────────────
  const SAVED_FILTERS_KEY = 'sig_saved_filters_v1';
  function _sigLoadSavedFilters() { try { return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || '[]'); } catch (e) { return []; } }
  function _sigStoreSavedFilters(list) { try { localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(list)); } catch (e) {} }
  window._sigSaveCurrentFilter = function () {
    if (!_sigActiveChipCount()) { showToast('No active filters to save', 'error'); return; }
    const name = prompt('Name this filter combination:');
    if (!name) return;
    const serial = {}; Object.entries(_sigActiveFilters).forEach(([g, s]) => { if (s.size) serial[g] = [...s]; });
    const list = _sigLoadSavedFilters();
    list.push({ id: _uid(), name, filters: serial });
    _sigStoreSavedFilters(list);
    _sigRenderFilterChips();
    showToast('Filter saved', 'success');
  };
  window._sigApplySavedFilter = function (id) {
    const f = _sigLoadSavedFilters().find(x => x.id === id);
    if (!f) return;
    _sigActiveFilters = {};
    Object.entries(f.filters).forEach(([g, ids]) => { _sigChipSet(g); ids.forEach(x => _sigChipSet(g).add(x)); });
    _sigRenderFilterChips();
    _sigRenderActiveView();
  };
  window._sigDeleteSavedFilter = function (id, ev) {
    if (ev) ev.stopPropagation();
    _sigStoreSavedFilters(_sigLoadSavedFilters().filter(x => x.id !== id));
    _sigRenderFilterChips();
  };

  function _sigRenderFilterChips() {
    const el = document.getElementById('sig-filter-chips');
    if (!el) return;
    const groupsHtml = Object.entries(FILTER_GROUPS).map(([g, chips]) => chips.map(c =>
      `<div class="sig-chip ${_sigChipSet(g).has(c.id) ? 'active' : ''}" onclick="_sigToggleChip('${g}','${c.id}')">${c.label}</div>`
    ).join('')).join('');
    const savedHtml = _sigLoadSavedFilters().map(f =>
      `<div class="sig-chip sig-chip-saved" onclick="_sigApplySavedFilter('${f.id}')">${icn('ic-star')}${f.name}<span class="sig-chip-x" onclick="_sigDeleteSavedFilter('${f.id}',event)">${icn('ic-close')}</span></div>`
    ).join('');
    el.innerHTML = `
      <div class="sig-chip ${!_sigActiveChipCount() ? 'active' : ''}" onclick="_sigResetFilters()">All</div>
      ${groupsHtml}
      <div class="sig-filter-divider"></div>
      ${QUICK_PRESETS.map((p, i) => `<div class="sig-chip sig-chip-preset" onclick="_sigApplyPreset(${i})">${icn('ic-sparkle')}${p.label}</div>`).join('')}
      ${savedHtml ? `<div class="sig-filter-divider"></div>${savedHtml}` : ''}
      <div class="sig-filter-divider"></div>
      <div class="sig-chip sig-chip-action" onclick="_sigSaveCurrentFilter()">${icn('ic-save')} Save filter</div>
      ${_sigActiveChipCount() ? `<div class="sig-chip sig-chip-action" onclick="_sigResetFilters()">${icn('ic-refresh')} Reset</div>` : ''}
    `;
  }

  window._sigOnSearch = function (v) { _sigSearch = v.trim().toLowerCase(); _sigRenderActiveView(); };
  window._sigSetView = function (v) {
    _sigView = v;
    document.querySelectorAll('.sig-view-toggle button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    _sigRenderActiveView();
  };

  function _sigFilteredSignals() {
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;
    const has = (g, id) => _sigChipSet(g).has(id);
    const anyOf = (g, pred) => !_sigChipSet(g).size || [..._sigChipSet(g)].some(pred);

    return _sigAll.filter(s => {
      if (_sigSearch) {
        const hay = (s.pair + ' ' + s.market).toLowerCase();
        if (!hay.includes(_sigSearch)) return false;
      }
      if (_sigChipSet('status').size) {
        const isActive = ['waiting', 'active', 'partial'].includes(s.status);
        if (has('status', 'active') && !isActive && !has('status', 'closed')) return false;
        if (has('status', 'closed') && isActive && !has('status', 'active')) return false;
      }
      if (_sigChipSet('result').size) {
        const ok = anyOf('result', id => id === 'winning' ? s.result === 'win' : id === 'losing' ? s.result === 'loss' : s.status === 'waiting');
        if (!ok) return false;
      }
      if (_sigChipSet('market').size && !has('market', s.market)) return false;
      if (_sigChipSet('confidence').size) {
        const ok = anyOf('confidence', id => id === 'highconf' ? (s.confidence === 'high' || s.confidence === 'very_high') : s.confidence === 'low');
        if (!ok) return false;
      }
      if (has('rr', 'highrr') && (s.risk_reward || 0) < 3) return false;
      if (_sigChipSet('session').size && !has('session', s.session)) return false;
      if (_sigChipSet('timeframe').size) {
        const ok = anyOf('timeframe', id => id === 'today' ? s.created_at >= todayStart.getTime() : id === 'week' ? s.created_at >= weekAgo : s.created_at >= monthAgo);
        if (!ok) return false;
      }
      return true;
    });
  }

  let _sigLastFilterSig = '';
  function _sigRenderActiveView() {
    _sigRenderFilterChips();
    const root = document.getElementById('sig-view-root');
    if (!root) return;
    const sig = _sigView + '|' + _sigSearch + '|' + JSON.stringify(Object.fromEntries(Object.entries(_sigActiveFilters).map(([k, v]) => [k, [...v]])));
    if (sig !== _sigLastFilterSig) { _sigTableLimit = SIG_TABLE_BATCH; _sigLastFilterSig = sig; }
    const rows = _sigFilteredSignals();
    if (_sigView === 'table') root.innerHTML = _sigRenderTable(rows);
    else if (_sigView === 'cards') root.innerHTML = _sigRenderCards(rows);
    else if (_sigView === 'calendar') root.innerHTML = _sigRenderCalendar(rows);
    else if (_sigView === 'analytics') root.innerHTML = _sigRenderAnalytics(rows);
    // stagger row/card animation delays
    root.querySelectorAll('.sig-row, .sig-card').forEach((el, i) => { el.style.animationDelay = (i * 0.025) + 's'; });
  }

  // ══════════════════════════════════════════════════════════════
  // ANALYTICS WIDGET ENGINE — metrics + animated hero widgets + a
  // lazily-rendered "More Analytics" strip. Everything here is derived
  // straight from _sigAll; nothing is fabricated.
  // ══════════════════════════════════════════════════════════════
  let _sigMoreOpen = false;

  function _sparklinePath(seed, w, h) {
    const pts = 14;
    let d = '';
    let v = 50;
    const arr = [];
    for (let i = 0; i < pts; i++) {
      v += (Math.sin(seed + i * 1.3) * 18) + _rand(-8, 8);
      v = Math.max(8, Math.min(92, v));
      arr.push(v);
    }
    arr.forEach((val, i) => {
      const x = (i / (pts - 1)) * w;
      const y = h - (val / 100) * h;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    return d.trim();
  }

  function _seriesPath(arr, w, h, pad) {
    pad = pad || 2;
    if (!arr.length) return '';
    const max = Math.max(...arr, 1), min = Math.min(...arr, 0);
    const range = (max - min) || 1;
    let d = '';
    arr.forEach((v, i) => {
      const x = arr.length > 1 ? (i / (arr.length - 1)) * w : w / 2;
      const y = (h - pad) - ((v - min) / range) * (h - pad * 2);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    return d.trim();
  }

  function _sigDaySeries(pred) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const from = today.getTime() - i * 86400000, to = from + 86400000;
      arr.push(_sigAll.filter(s => pred(s) && s.created_at >= from && s.created_at < to).length);
    }
    return arr;
  }

  function _sigComputeMetrics() {
    const all = _sigAll;
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * 86400000;
    const prevWeekAgo = now - 14 * 86400000;
    const monthAgo = now - 30 * 86400000;

    const active = all.filter(s => ['waiting', 'active', 'partial'].includes(s.status));
    const wins = all.filter(s => s.result === 'win');
    const losses = all.filter(s => s.result === 'loss');
    const closed = all.filter(s => s.result === 'win' || s.result === 'loss');
    const todays = all.filter(s => s.created_at >= today.getTime());
    const thisWeek = all.filter(s => s.created_at >= weekAgo);
    const prevWeek = all.filter(s => s.created_at >= prevWeekAgo && s.created_at < weekAgo);

    const weekClosed = closed.filter(s => s.created_at >= weekAgo);
    const weekAcc = weekClosed.length ? (weekClosed.filter(s => s.result === 'win').length / weekClosed.length * 100) : 0;
    const winPct = closed.length ? (wins.length / closed.length * 100) : 0;
    const lossPct = closed.length ? (losses.length / closed.length * 100) : 0;

    const avgRR = all.length ? (all.reduce((a, s) => a + (+s.risk_reward || 0), 0) / all.length) : 0;
    const totalPips = closed.reduce((a, s) => a + (+s.pips || 0), 0);
    const totalR = closed.reduce((a, s) => a + (+s.r_multiple || 0), 0);
    const openPositions = all.filter(s => ['active', 'partial'].includes(s.status)).length;
    const closedPositions = closed.length;
    const monthClosed = closed.filter(s => s.created_at >= monthAgo);
    const monthProfit = monthClosed.reduce((a, s) => a + (+s.profit_percent || 0), 0);
    const avgHold = closed.length ? (closed.reduce((a, s) => a + ((s.closed_at && s.entered_at) ? (s.closed_at - s.entered_at) : 3600000 * 4), 0) / closed.length) : 0;
    const avgHoldHrs = avgHold / 3600000;

    const hourly = new Array(24).fill(0);
    todays.forEach(s => { hourly[new Date(s.created_at).getHours()]++; });

    const activeTrend = _sigDaySeries(s => ['waiting', 'active', 'partial'].includes(s.status));
    const winTrend = _sigDaySeries(s => s.result === 'win');
    const lossTrend = _sigDaySeries(s => s.result === 'loss');

    const pipsTrend = []; let cumP = 0;
    [...closed].sort((a, b) => a.created_at - b.created_at).slice(-20).forEach(s => { cumP += (+s.pips || 0); pipsTrend.push(cumP); });
    if (!pipsTrend.length) pipsTrend.push(0);

    const profitTrend = []; let cumM = 0;
    [...monthClosed].sort((a, b) => a.created_at - b.created_at).forEach(s => { cumM += (+s.profit_percent || 0); profitTrend.push(cumM); });
    if (!profitTrend.length) profitTrend.push(0);

    const winsThisWeek = thisWeek.filter(s => s.result === 'win').length;
    const winsPrevWeek = prevWeek.filter(s => s.result === 'win').length;
    const lossesThisWeek = thisWeek.filter(s => s.result === 'loss').length;
    const lossesPrevWeek = prevWeek.filter(s => s.result === 'loss').length;

    const byMarket = { forex: 0, crypto: 0, indices: 0 };
    all.forEach(s => { if (byMarket[s.market] !== undefined) byMarket[s.market]++; });

    const sessionPerf = {};
    all.forEach(s => { sessionPerf[s.session] = sessionPerf[s.session] || { win: 0, total: 0, n: 0 }; sessionPerf[s.session].n++; if (s.result === 'win' || s.result === 'loss') { sessionPerf[s.session].total++; if (s.result === 'win') sessionPerf[s.session].win++; } });
    let bestSession = '—', bestSessionRate = -1;
    Object.entries(sessionPerf).forEach(([k, v]) => { if (v.total >= 1 && v.win / v.total > bestSessionRate) { bestSessionRate = v.win / v.total; bestSession = k; } });

    const byPairPerf = {};
    all.forEach(s => { byPairPerf[s.pair] = byPairPerf[s.pair] || { win: 0, total: 0 }; if (s.result === 'win' || s.result === 'loss') { byPairPerf[s.pair].total++; if (s.result === 'win') byPairPerf[s.pair].win++; } });
    let bestPair = '—', bestRate = -1;
    Object.entries(byPairPerf).forEach(([k, v]) => { if (v.total >= 1 && v.win / v.total > bestRate) { bestRate = v.win / v.total; bestPair = k; } });

    const highConf = all.filter(s => s.confidence === 'high' || s.confidence === 'very_high').length;
    const lowConf = all.filter(s => s.confidence === 'low').length;
    const avgConf = all.length ? (all.reduce((a, s) => a + (+s.confidence_score || 0), 0) / all.length) : 0;
    const pending = all.filter(s => s.status === 'waiting').length;
    const expiredCt = all.filter(s => s.status === 'expired').length;

    const rrBuckets = { '<1': 0, '1-2': 0, '2-3': 0, '3+': 0 };
    all.forEach(s => { const rr = +s.risk_reward || 0; if (rr < 1) rrBuckets['<1']++; else if (rr < 2) rrBuckets['1-2']++; else if (rr < 3) rrBuckets['2-3']++; else rrBuckets['3+']++; });

    const riskPctList = all.map(s => +s.risk_percent || 0).filter(Boolean);
    const avgRiskPct = riskPctList.length ? riskPctList.reduce((a, b) => a + b, 0) / riskPctList.length : 0;

    const tpHitCt = closed.filter(s => s.result === 'win').length;
    const slHitCt = closed.filter(s => s.status === 'stopped_out').length;
    const tpHitPct = closed.length ? tpHitCt / closed.length * 100 : 0;
    const slHitPct = closed.length ? slHitCt / closed.length * 100 : 0;

    const triggeredCt = all.filter(s => s.status !== 'waiting' && s.status !== 'cancelled').length;
    const entryAccuracy = all.length ? triggeredCt / all.length * 100 : 0;
    const completionRate = all.length ? closed.length / all.length * 100 : 0;

    return {
      all, active, wins, losses, closed, todays, thisWeek,
      weekAcc, winPct, lossPct, avgRR, totalPips, totalR,
      openPositions, closedPositions, monthProfit, avgHoldHrs,
      hourly, activeTrend, winTrend, lossTrend, pipsTrend, profitTrend,
      winsDelta: winsThisWeek - winsPrevWeek, lossesDelta: lossesThisWeek - lossesPrevWeek,
      byMarket, bestSession, bestSessionRate, bestPair, bestRate,
      highConf, lowConf, avgConf, pending, expiredCt, rrBuckets, avgRiskPct,
      tpHitPct, slHitPct, entryAccuracy, completionRate
    };
  }

  // ── Hero widget card shells ─────────────────────────────────────
  function _sigWidgetShell(id, cls, label, icon, tone, valueHtml, bodyHtml) {
    return `
    <div class="sig-widget ${cls || ''}">
      <div class="sig-stat-top">
        <span class="sig-stat-label">${label}</span>
        <span class="sig-stat-icon ${tone}">${icn(icon)}</span>
      </div>
      <div class="sig-widget-value ${tone}">${valueHtml}</div>
      ${bodyHtml || ''}
    </div>`;
  }

  function _sigRenderStats() {
    const grid = document.getElementById('sig-stats-grid');
    if (!grid) return;
    const m = _sigComputeMetrics();
    const hasApex = typeof pf3Mount === 'function' && typeof ApexCharts !== 'undefined';

    grid.innerHTML = [
      // 1 — Active Signals: pulse + trend spark
      _sigWidgetShell('sig-w-active', '', 'Active Signals', 'ic-activity', 'blue',
        `<span class="sig-live-dot"></span><span class="sig-counting" data-target="${m.active.length}">${m.active.length}</span>`,
        `<div id="sig-w-active-spark" class="sig-widget-apex"></div><div class="sig-widget-foot">${m.thisWeek.length} this week</div>`),
      // 2 — Winning Signals: ring + weekly delta
      _sigWidgetShell('sig-w-win', 'sig-widget-ring-card', 'Winning Signals', 'ic-trend-up', 'green',
        `<span class="sig-counting" data-target="${m.wins.length}">${m.wins.length}</span>`,
        `<div class="sig-widget-ring-row"><div id="sig-w-win-ring" class="sig-widget-ring"></div><div class="sig-widget-ring-meta"><span class="big">${m.winPct.toFixed(0)}%</span><span class="delta ${m.winsDelta >= 0 ? 'up' : 'down'}">${m.winsDelta >= 0 ? '▲' : '▼'} ${Math.abs(m.winsDelta)} wk</span></div></div>`),
      // 3 — Losing Signals: bar + weekly comparison
      _sigWidgetShell('sig-w-loss', '', 'Losing Signals', 'ic-trend-down', 'red',
        `<span class="sig-counting" data-target="${m.losses.length}">${m.losses.length}</span>`,
        `<div id="sig-w-loss-spark" class="sig-widget-apex"></div><div class="sig-widget-foot">${m.lossPct.toFixed(0)}% of closed · <span class="${m.lossesDelta <= 0 ? 'sig-pips-pos' : 'sig-pips-neg'}">${m.lossesDelta >= 0 ? '+' : ''}${m.lossesDelta} wk</span></div>`),
      // 4 — Today's Signals: hourly activity
      _sigWidgetShell('sig-w-today', '', "Today's Signals", 'ic-calendar', 'purple',
        `<span class="sig-counting" data-target="${m.todays.length}">${m.todays.length}</span>`,
        `<div id="sig-w-today-spark" class="sig-widget-apex"></div><div class="sig-widget-foot">Hourly activity</div>`),
      // 5 — Weekly Accuracy: circular progress
      _sigWidgetShell('sig-w-acc', 'sig-widget-ring-card', 'Weekly Accuracy', 'ic-target', m.weekAcc >= 50 ? 'green' : 'red',
        `<span class="sig-counting" data-target="${m.weekAcc.toFixed(0)}">${m.weekAcc.toFixed(0)}</span>%`,
        `<div id="sig-w-acc-ring" class="sig-widget-ring sig-widget-ring-solo"></div>`),
      // 6 — Average RR: radial gauge
      _sigWidgetShell('sig-w-rr', 'sig-widget-ring-card', 'Average RR', 'ic-ruler', 'gold',
        `1:<span class="sig-counting" data-target="${m.avgRR.toFixed(1)}">${m.avgRR.toFixed(1)}</span>`,
        `<div id="sig-w-rr-ring" class="sig-widget-ring sig-widget-ring-solo"></div>`),
      // 7 — Avg Hold Time: clock visualization
      _sigWidgetShell('sig-w-hold', '', 'Avg Hold Time', 'ic-clock', 'teal',
        `<span class="sig-counting" data-target="${m.avgHoldHrs.toFixed(1)}">${m.avgHoldHrs.toFixed(1)}</span>h`,
        _sigClockSvg(m.avgHoldHrs)),
      // 8 — Total Pips: trend graph
      _sigWidgetShell('sig-w-pips', '', 'Total Pips', 'ic-zap', m.totalPips >= 0 ? 'green' : 'red',
        `${m.totalPips >= 0 ? '+' : ''}<span class="sig-counting" data-target="${m.totalPips.toFixed(0)}">${m.totalPips.toFixed(0)}</span>`,
        `<div id="sig-w-pips-spark" class="sig-widget-apex"></div>`),
      // 9 — Total R: progress gauge
      _sigWidgetShell('sig-w-totalr', 'sig-widget-ring-card', 'Total R', 'ic-scale', m.totalR >= 0 ? 'green' : 'red',
        `${m.totalR >= 0 ? '+' : ''}<span class="sig-counting" data-target="${m.totalR.toFixed(1)}">${m.totalR.toFixed(1)}</span>R`,
        `<div id="sig-w-totalr-ring" class="sig-widget-ring sig-widget-ring-solo"></div>`),
      // 10 — Open Positions: live indicator
      _sigWidgetShell('sig-w-open', '', 'Open Positions', 'ic-folder-open', 'blue',
        `<span class="sig-counting" data-target="${m.openPositions}">${m.openPositions}</span>`,
        `<div class="sig-widget-foot">${m.openPositions > 0 ? '<span class="sig-live-dot"></span> Live in market' : 'No open exposure'}</div>`),
      // 11 — Closed Positions: completion ring
      _sigWidgetShell('sig-w-closed', 'sig-widget-ring-card', 'Closed Positions', 'ic-folder', 'purple',
        `<span class="sig-counting" data-target="${m.closedPositions}">${m.closedPositions}</span>`,
        `<div class="sig-widget-ring-row"><div id="sig-w-closed-ring" class="sig-widget-ring"></div><div class="sig-widget-ring-meta"><span class="big">${m.completionRate.toFixed(0)}%</span><span class="lbl">complete</span></div></div>`),
      // 12 — Monthly Profit: animated profit curve
      _sigWidgetShell('sig-w-profit', '', 'Monthly Profit', 'ic-trophy', m.monthProfit >= 0 ? 'green' : 'red',
        `${m.monthProfit >= 0 ? '+' : ''}<span class="sig-counting" data-target="${m.monthProfit.toFixed(1)}">${m.monthProfit.toFixed(1)}</span>%`,
        `<div id="sig-w-profit-spark" class="sig-widget-apex"></div>`),
    ].join('');

    if (hasApex) _sigMountApexWidgets(m);
    _sigRenderMoreToggle();
    if (_sigMoreOpen) _sigRenderMoreAnalytics(m);
  }

  function _sigClockSvg(hrs) {
    const angle = ((hrs % 12) / 12) * 360;
    return `<svg class="sig-clock-svg" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="19" fill="none" stroke="var(--glass-border-h)" stroke-width="2"/>
      <line x1="22" y1="22" x2="22" y2="8" stroke="var(--teal)" stroke-width="2.4" stroke-linecap="round" transform="rotate(${angle} 22 22)"/>
      <circle cx="22" cy="22" r="2" fill="var(--teal)"/>
    </svg>`;
  }

  function _sigMountApexWidgets(m) {
    const c = (typeof pf3Colors === 'function') ? pf3Colors() : { green: '#34d399', red: '#f87171', blue: '#60a5fa', gold: '#fbbf24', purple: '#a78bfa', teal: '#2dd4bf', text3: '#8a93a6' };
    const noAnim = (typeof pf3ReducedMotion === 'function') && pf3ReducedMotion();
    const sparkBase = { chart: { type: 'area', height: 40, sparkline: { enabled: true }, animations: { enabled: !noAnim, speed: 500 } }, tooltip: { enabled: false }, dataLabels: { enabled: false } };
    const ring = (id, val, col, size) => pf3Mount(id, {
      chart: { type: 'radialBar', height: size || 64, width: size || 64, animations: { enabled: !noAnim, speed: 650 } },
      series: [Math.max(0, Math.min(100, val))], colors: [col],
      plotOptions: { radialBar: { hollow: { size: '54%' }, track: { background: 'rgba(255,255,255,0.08)' }, dataLabels: { show: false } } },
      stroke: { lineCap: 'round' }
    });

    pf3Mount('sig-w-active-spark', { ...sparkBase, series: [{ data: m.activeTrend }], colors: [c.blue], stroke: { curve: 'smooth', width: 1.75 }, fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0 } } });
    pf3Mount('sig-w-loss-spark', { ...sparkBase, series: [{ data: m.lossTrend }], colors: [c.red], stroke: { curve: 'smooth', width: 1.75 }, fill: { type: 'gradient', gradient: { opacityFrom: 0.32, opacityTo: 0 } } });
    pf3Mount('sig-w-today-spark', { chart: { type: 'bar', height: 40, sparkline: { enabled: true }, animations: { enabled: !noAnim, speed: 500 } }, series: [{ data: m.hourly }], colors: [c.purple], plotOptions: { bar: { columnWidth: '55%', borderRadius: 1 } }, tooltip: { enabled: false }, dataLabels: { enabled: false } });
    pf3Mount('sig-w-pips-spark', { ...sparkBase, series: [{ data: m.pipsTrend }], colors: [m.totalPips >= 0 ? c.green : c.red], stroke: { curve: 'smooth', width: 1.75 }, fill: { type: 'gradient', gradient: { opacityFrom: 0.32, opacityTo: 0 } } });
    pf3Mount('sig-w-profit-spark', { ...sparkBase, series: [{ data: m.profitTrend }], colors: [m.monthProfit >= 0 ? c.green : c.red], stroke: { curve: 'smooth', width: 1.75 }, fill: { type: 'gradient', gradient: { opacityFrom: 0.32, opacityTo: 0 } } });

    ring('sig-w-win-ring', m.winPct, c.green, 54);
    ring('sig-w-acc-ring', m.weekAcc, m.weekAcc >= 50 ? c.green : c.red, 62);
    ring('sig-w-rr-ring', Math.min(100, (m.avgRR / 5) * 100), c.gold, 62);
    ring('sig-w-totalr-ring', Math.min(100, Math.max(2, (Math.abs(m.totalR) / 20) * 100)), m.totalR >= 0 ? c.green : c.red, 62);
    ring('sig-w-closed-ring', m.completionRate, c.purple, 54);
  }

  // ── More Analytics (lazy, collapsible) ──────────────────────────
  function _sigRenderMoreToggle() {
    const grid = document.getElementById('sig-stats-grid');
    if (!grid) return;
    let host = document.getElementById('sig-more-toggle-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sig-more-toggle-host';
      grid.insertAdjacentElement('afterend', host);
    }
    host.innerHTML = `
      <button class="sig-more-toggle" onclick="_sigToggleMore()">
        ${icn(_sigMoreOpen ? 'ic-minus' : 'ic-plus')} ${_sigMoreOpen ? 'Hide' : 'Show'} more analytics
      </button>
      <div id="sig-more-grid" class="sig-more-grid ${_sigMoreOpen ? 'open' : ''}"></div>`;
  }

  window._sigToggleMore = function () {
    _sigMoreOpen = !_sigMoreOpen;
    _sigRenderMoreToggle();
    if (_sigMoreOpen) _sigRenderMoreAnalytics(_sigComputeMetrics());
  };

  function _sigMiniBar(label, value, pct, tone) {
    return `<div class="sig-mini-tile">
      <div class="sig-mini-top"><span>${label}</span><span class="sig-mini-val ${tone || ''}">${value}</span></div>
      <div class="sig-mini-track"><div class="sig-mini-fill ${tone || ''}" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>
    </div>`;
  }
  function _sigMiniStat(label, value, tone) {
    return `<div class="sig-mini-tile sig-mini-tile-flat">
      <span class="sig-mini-label">${label}</span>
      <span class="sig-mini-val ${tone || ''}">${value}</span>
    </div>`;
  }

  function _sigRenderMoreAnalytics(m) {
    const grid = document.getElementById('sig-more-grid');
    if (!grid) return;
    const marketTotal = m.byMarket.forex + m.byMarket.crypto + m.byMarket.indices || 1;
    grid.innerHTML = [
      _sigMiniBar('Signal Success Rate', m.tpHitPct.toFixed(0) + '%', m.tpHitPct, m.tpHitPct >= 50 ? 'green' : 'red'),
      _sigMiniBar('Average Confidence', m.avgConf.toFixed(0) + '%', m.avgConf, 'gold'),
      _sigMiniStat('Best Performing Pair', m.bestPair, 'green'),
      _sigMiniStat('Best Session', (m.bestSession || '—').replace('_', '/'), 'blue'),
      _sigMiniStat('Signals This Week', m.thisWeek.length),
      _sigMiniStat('Signals This Month', _sigAll.filter(s => s.created_at >= Date.now() - 30 * 86400000).length),
      _sigMiniStat('Pending Signals', m.pending, 'gold'),
      _sigMiniStat('Expired Signals', m.expiredCt, 'red'),
      _sigMiniStat('High Confidence Signals', m.highConf, 'green'),
      _sigMiniStat('Low Confidence Signals', m.lowConf, 'red'),
      _sigMiniBar('Forex Signals', m.byMarket.forex, (m.byMarket.forex / marketTotal) * 100, 'blue'),
      _sigMiniBar('Crypto Signals', m.byMarket.crypto, (m.byMarket.crypto / marketTotal) * 100, 'gold'),
      _sigMiniBar('Indices Signals', m.byMarket.indices, (m.byMarket.indices / marketTotal) * 100, 'purple'),
      _sigMiniStat('Average Risk %', m.avgRiskPct.toFixed(2) + '%'),
      _sigMiniBar('Average TP Hit %', m.tpHitPct.toFixed(0) + '%', m.tpHitPct, 'green'),
      _sigMiniBar('SL Hit %', m.slHitPct.toFixed(0) + '%', m.slHitPct, 'red'),
      _sigMiniBar('Entry Trigger Accuracy', m.entryAccuracy.toFixed(0) + '%', m.entryAccuracy, 'teal'),
      _sigMiniBar('Signal Completion Rate', m.completionRate.toFixed(0) + '%', m.completionRate, 'blue'),
      `<div class="sig-mini-tile sig-mini-tile-dist">
        <span class="sig-mini-label">RR Distribution</span>
        <div class="sig-dist-bars">${Object.entries(m.rrBuckets).map(([k, v]) => `<div class="sig-dist-bar-wrap"><div class="sig-dist-bar" style="height:${Math.min(100, v * 14)}px"></div><span>${k}</span></div>`).join('')}</div>
      </div>`,
    ].join('');
  }

  // ══════════════════════════════════════════════════════════════
  // TABLE VIEW
  // ══════════════════════════════════════════════════════════════
  function _fmtNum(n, dec) { return n === null || n === undefined ? '—' : (+n).toFixed(dec != null ? dec : 4).replace(/0+$/, '').replace(/\.$/, ''); }
  function _timeAgo(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const h = diff / 3600000;
    if (h < 1) return Math.round(h * 60) + 'm ago';
    if (h < 24) return h.toFixed(0) + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  function _sigConfBadge(s) {
    return `<div class="sig-conf">
      <div class="sig-conf-top"><span>${CONF_LABEL[s.confidence] || '—'}</span><span>${s.confidence_score || ''}%</span></div>
      <div class="sig-conf-track"><div class="sig-conf-fill ${s.confidence}" style="width:${s.confidence_score || 0}%"></div></div>
    </div>`;
  }

  function _sigRrViz(s) {
    const rr = Math.max(0, +s.risk_reward || 0);
    const rewardW = Math.max(8, Math.min(100, (rr / 4) * 100));
    return `<div class="sig-rr-viz" title="Risk 1 : Reward ${rr}">
      <span class="sig-rr-num">1:${rr}</span>
      <div class="sig-rr-bar"><span class="risk"></span><span class="reward" style="width:${rewardW}%"></span></div>
    </div>`;
  }

  let _sigExpandedRows = new Set();
  window._sigToggleRowExpand = function (id, ev) {
    if (ev) ev.stopPropagation();
    _sigExpandedRows.has(id) ? _sigExpandedRows.delete(id) : _sigExpandedRows.add(id);
    _sigRenderActiveView();
  };

  const SIG_TABLE_BATCH = 100;
  let _sigTableLimit = SIG_TABLE_BATCH;
  window._sigLoadMoreRows = function () { _sigTableLimit += SIG_TABLE_BATCH; _sigRenderActiveView(); };

  function _sigRenderTable(allRows) {
    if (!allRows.length) return _sigEmptyState();
    const rows = allRows.slice(0, _sigTableLimit);
    const body = rows.map(s => {
      const expanded = _sigExpandedRows.has(s.id);
      const statusTone = s.result === 'win' ? 'green' : s.result === 'loss' ? 'red' : ['active', 'partial'].includes(s.status) ? 'blue' : '';
      const expandRow = expanded ? `
      <tr class="sig-row-expand-tr">
        <td colspan="18">
          <div class="sig-row-expand">
            <div class="sig-row-expand-col">
              <div class="sig-section-title" style="margin-top:0">${icn('ic-bulb')} Trade Idea</div>
              <div class="sig-body-text">${s.trade_idea || '—'}</div>
            </div>
            <div class="sig-row-expand-col">
              <div class="sig-section-title" style="margin-top:0">${icn('ic-target')} Confluences</div>
              <div class="sig-confluence-list">${(s.confluences || []).map(c => `<span class="sig-confluence-chip">${c}</span>`).join('') || '<span class="sig-body-text">—</span>'}</div>
            </div>
            <div class="sig-row-expand-col sig-row-expand-actions">
              <button class="btn btn-primary" onclick="event.stopPropagation();_sigOpenDrawer('${s.id}')">${icn('ic-eye')} Full details</button>
            </div>
          </div>
        </td>
      </tr>` : '';
      return `
      <tr class="sig-row sig-row-tone-${statusTone}" onclick="_sigOpenDrawer('${s.id}')">
        <td onclick="event.stopPropagation()"><button class="sig-expand-btn ${expanded ? 'open' : ''}" onclick="_sigToggleRowExpand('${s.id}', event)">${icn('ic-chevron-right')}</button></td>
        <td><span class="sig-badge sig-badge-${s.status}"><span class="dot"></span>${STATUS_LABEL[s.status]}</span></td>
        <td><div class="sig-pair-cell"><span class="sig-pair-flag">${s.pair.slice(0, 2)}</span>${s.pair}</div></td>
        <td><span class="sig-market-badge">${icn(MARKET_ICON[s.market])}${MARKET_LABEL[s.market]}</span></td>
        <td><span class="sig-dir-badge ${s.direction}">${s.direction === 'buy' ? '🟢 BUY' : '🔴 SELL'}</span></td>
        <td class="sig-mono">${_fmtNum(s.entry)}</td>
        <td class="sig-mono" style="color:var(--red)">${_fmtNum(s.stop_loss)}</td>
        <td class="sig-mono" style="color:var(--green)">${_fmtNum(s.tp1)}</td>
        <td class="sig-mono" style="color:var(--green)">${_fmtNum(s.tp2)}</td>
        <td class="sig-mono" style="color:var(--green)">${_fmtNum(s.tp3)}</td>
        <td>${_sigRrViz(s)}</td>
        <td>${_sigConfBadge(s)}</td>
        <td style="text-transform:capitalize">${(s.session || '').replace('_', '/')}</td>
        <td>${_timeAgo(s.created_at)}</td>
        <td>${s.result === 'win' ? '<span class="sig-badge sig-badge-tp1_hit">Win</span>' : s.result === 'loss' ? '<span class="sig-badge sig-badge-stopped_out">Loss</span>' : '<span class="sig-badge sig-badge-waiting">Pending</span>'}</td>
        <td class="${s.pips > 0 ? 'sig-pips-pos' : s.pips < 0 ? 'sig-pips-neg' : ''}">${s.pips != null ? (s.pips > 0 ? '+' : '') + s.pips.toFixed(1) : '—'}</td>
        <td class="${s.profit_percent > 0 ? 'sig-pips-pos' : s.profit_percent < 0 ? 'sig-pips-neg' : ''}">${s.profit_percent != null ? (s.profit_percent > 0 ? '+' : '') + s.profit_percent + '%' : '—'}</td>
        <td onclick="event.stopPropagation()">
          <div class="sig-row-actions">
            <button title="Bookmark" onclick="_sigToggleBookmark('${s.id}')">${icn('ic-bookmark')}</button>
            <button title="Copy details" onclick="_sigCopyDetails('${s.id}')">${icn('ic-copy')}</button>
            <button title="Delete" onclick="_sigDelete('${s.id}')">${icn('ic-trash')}</button>
          </div>
        </td>
      </tr>${expandRow}`;
    }).join('');

    return `
    <div class="sig-table-card">
      <div class="sig-table-scroll">
        <table>
          <thead><tr>
            <th></th><th>Status</th><th>Pair</th><th>Market</th><th>Direction</th><th>Entry</th><th>SL</th>
            <th>TP1</th><th>TP2</th><th>TP3</th><th>RR</th><th>Confidence</th><th>Session</th>
            <th>Date</th><th>Result</th><th>Pips</th><th>Profit %</th><th>Actions</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${allRows.length > _sigTableLimit ? `<div class="sig-load-more"><button class="btn" onclick="_sigLoadMoreRows()">${icn('ic-refresh')} Load ${Math.min(SIG_TABLE_BATCH, allRows.length - _sigTableLimit)} more (${allRows.length - _sigTableLimit} remaining)</button></div>` : ''}
    </div>`;
  }

  function _sigEmptyState() {
    return `<div class="sig-table-card"><div class="sig-table-empty">${icn('ic-search')}<div style="margin-top:8px">No signals match these filters.</div></div></div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // CARD VIEW
  // ══════════════════════════════════════════════════════════════
  function _sigRenderCards(rows) {
    if (!rows.length) return _sigEmptyState();
    return `<div class="sig-cards-grid">${rows.map(s => {
      const path = _sparklinePath(s.pair.length * 3, 100, 36);
      const liked = !!_sigLikes[s.id];
      const marked = !!_sigBookmarks[s.id];
      return `
      <div class="sig-card" onclick="_sigOpenDrawer('${s.id}')">
        <div class="sig-card-top">
          <div class="sig-card-pair">${s.pair}</div>
          <span class="sig-dir-badge ${s.direction}">${s.direction === 'buy' ? '🟢 BUY' : '🔴 SELL'}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="sig-badge sig-badge-${s.status}"><span class="dot"></span>${STATUS_LABEL[s.status]}</span>
          <span class="sig-market-badge">${icn(MARKET_ICON[s.market])}${MARKET_LABEL[s.market]}</span>
        </div>
        <div class="sig-card-levels">
          <div class="sig-card-level"><span class="lbl">Entry</span><span class="val">${_fmtNum(s.entry)}</span></div>
          <div class="sig-card-level"><span class="lbl">RR</span><span class="val">1:${s.risk_reward}</span></div>
          <div class="sig-card-level"><span class="lbl">Conf.</span><span class="val">${s.confidence_score}%</span></div>
        </div>
        <svg class="sig-card-spark" viewBox="0 0 100 36" preserveAspectRatio="none">
          <path d="${path}" fill="none" stroke="var(--blue)" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
        </svg>
        <div class="sig-card-meta-row">
          <span>${icn('ic-clock', '')} ${_timeAgo(s.created_at)}</span>
          <span>${(s.session || '').replace('_', '/')}</span>
        </div>
        <div class="sig-card-foot">
          <div class="sig-card-social">
            <button class="sig-social-btn ${liked ? 'active' : ''}" onclick="event.stopPropagation();_sigToggleLike('${s.id}')">${icn('ic-thumbs-up')} <span id="sig-like-count-${s.id}">${(s._likeCount || 0) + (liked ? 1 : 0)}</span></button>
            <button class="sig-social-btn ${marked ? 'active' : ''}" onclick="event.stopPropagation();_sigToggleBookmark('${s.id}')">${icn('ic-bookmark')}</button>
            <button class="sig-social-btn" onclick="event.stopPropagation();_sigCopyDetails('${s.id}')">${icn('ic-copy')}</button>
          </div>
          <span class="sig-market-badge" style="text-transform:capitalize">${s.visibility}</span>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // CALENDAR VIEW
  // ══════════════════════════════════════════════════════════════
  function _sigRenderCalendar(rows) {
    const month = _sigCalMonth;
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const byDay = {};
    rows.forEach(s => {
      const d = new Date(s.created_at);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const key = d.getDate();
        (byDay[key] = byDay[key] || []).push(s);
      }
    });
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += `<div class="sig-cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const list = byDay[d] || [];
      const wins = list.filter(s => s.result === 'win').length;
      const losses = list.filter(s => s.result === 'loss').length;
      const avgRR = list.length ? (list.reduce((a, s) => a + (+s.risk_reward || 0), 0) / list.length).toFixed(1) : null;
      cells += `<div class="sig-cal-cell" onclick='_sigCalDrill(${JSON.stringify(list.map(s => s.id))})'>
        <span class="sig-cal-date">${d}</span>
        ${list.length ? `<span class="sig-cal-stat">${list.length} signal${list.length > 1 ? 's' : ''}</span>
        <span class="sig-cal-stat green">${wins}W</span><span class="sig-cal-stat red">${losses}L</span>
        <span class="sig-cal-stat">RR ${avgRR}</span>` : ''}
      </div>`;
    }
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <button class="btn" onclick="_sigCalNav(-1)">${icn('ic-arrow-left')}</button>
      <div style="font-family:var(--font-head);font-weight:800;font-size:15px">${month.toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
      <button class="btn" onclick="_sigCalNav(1)">${icn('ic-arrow-right')}</button>
    </div>
    <div class="sig-cal-grid">
      ${dows.map(d => `<div class="sig-cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>`;
  }
  window._sigCalNav = function (dir) {
    _sigCalMonth = new Date(_sigCalMonth.getFullYear(), _sigCalMonth.getMonth() + dir, 1);
    _sigRenderActiveView();
  };
  window._sigCalDrill = function (ids) {
    if (!ids.length) return;
    _sigResetFilters();
    _sigSetView('table');
    _sigSearch = '';
    document.getElementById('sig-search-input').value = '';
    setTimeout(() => {
      const root = document.getElementById('sig-view-root');
      root.querySelectorAll('.sig-row').forEach(r => r.style.outline = '');
    }, 50);
    showToast(ids.length + ' signal(s) that day — showing in table view', 'info');
  };

  // ══════════════════════════════════════════════════════════════
  // ANALYTICS VIEW
  // ══════════════════════════════════════════════════════════════
  function _sigRenderAnalytics(rows) {
    const closed = rows.filter(s => s.result === 'win' || s.result === 'loss');
    const wins = closed.filter(s => s.result === 'win');
    const winRate = closed.length ? (wins.length / closed.length * 100).toFixed(1) : '0';
    const avgRR = rows.length ? (rows.reduce((a, s) => a + (+s.risk_reward || 0), 0) / rows.length).toFixed(2) : '0';
    const totalPips = closed.reduce((a, s) => a + (+s.pips || 0), 0);
    const totalR = closed.reduce((a, s) => a + (+s.r_multiple || 0), 0);
    const grossWin = wins.reduce((a, s) => a + Math.max(0, +s.pips || 0), 0);
    const grossLoss = Math.abs(closed.filter(s => s.result === 'loss').reduce((a, s) => a + Math.min(0, +s.pips || 0), 0));
    const profitFactor = grossLoss ? (grossWin / grossLoss).toFixed(2) : '∞';
    const expectancy = closed.length ? (totalR / closed.length).toFixed(2) : '0';

    const bySession = {};
    rows.forEach(s => { bySession[s.session] = bySession[s.session] || { win: 0, total: 0 }; if (s.result === 'win') bySession[s.session].win++; if (s.result === 'win' || s.result === 'loss') bySession[s.session].total++; });
    let bestSession = '—', bestSessionRate = -1;
    Object.entries(bySession).forEach(([k, v]) => { if (v.total && v.win / v.total > bestSessionRate) { bestSessionRate = v.win / v.total; bestSession = k; } });

    const byPair = {};
    rows.forEach(s => { byPair[s.pair] = byPair[s.pair] || { win: 0, total: 0, pips: 0 }; if (s.result === 'win' || s.result === 'loss') { byPair[s.pair].total++; byPair[s.pair].pips += (+s.pips || 0); } if (s.result === 'win') byPair[s.pair].win++; });
    let bestPair = '—', bestPips = -Infinity, worstPair = '—', worstPips = Infinity;
    Object.entries(byPair).forEach(([k, v]) => { if (v.pips > bestPips) { bestPips = v.pips; bestPair = k; } if (v.pips < worstPips) { worstPips = v.pips; worstPair = k; } });

    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDow = {};
    rows.forEach(s => { const d = new Date(s.created_at).getDay(); byDow[d] = (byDow[d] || 0) + (+s.pips || 0); });
    let bestDow = '—', bestDowVal = -Infinity;
    Object.entries(byDow).forEach(([k, v]) => { if (v > bestDowVal) { bestDowVal = v; bestDow = dowNames[k]; } });

    const monthAcc = {};
    rows.forEach(s => { const key = new Date(s.created_at).toLocaleString('default', { month: 'short' }); if (s.result === 'win' || s.result === 'loss') { monthAcc[key] = monthAcc[key] || { win: 0, total: 0 }; monthAcc[key].total++; if (s.result === 'win') monthAcc[key].win++; } });
    let bestMonth = '—', bestMonthRate = -1;
    Object.entries(monthAcc).forEach(([k, v]) => { if (v.win / v.total > bestMonthRate) { bestMonthRate = v.win / v.total; bestMonth = k; } });

    const tiles = [
      ['ic-target', 'Win Rate', winRate + '%'],
      ['ic-ruler', 'Average RR', '1:' + avgRR],
      ['ic-clock', 'Avg Hold Time', ((closed.reduce((a, s) => a + ((s.closed_at && s.entered_at) ? (s.closed_at - s.entered_at) : 14400000), 0) / (closed.length || 1)) / 3600000).toFixed(1) + 'h'],
      ['ic-chart-pie', 'Monthly Accuracy', bestMonthRate >= 0 ? (bestMonthRate * 100).toFixed(0) + '%' : '—'],
      ['ic-scale', 'Profit Factor', profitFactor],
      ['ic-trend-up', 'Expectancy', expectancy + 'R'],
      ['ic-zap', 'Total Pips', (totalPips >= 0 ? '+' : '') + totalPips.toFixed(0)],
      ['ic-trophy', 'Total R', (totalR >= 0 ? '+' : '') + totalR.toFixed(1) + 'R'],
      ['ic-fire', 'Best Session', (bestSession || '—').replace('_', '/')],
      ['ic-star', 'Best Pair', bestPair],
      ['ic-frown', 'Worst Pair', worstPair],
      ['ic-calendar', 'Most Profitable Weekday', bestDow],
      ['ic-trophy', 'Most Profitable Month', bestMonth]
    ];

    return `<div class="sig-analytics-grid">${tiles.map(t => `
      <div class="sig-analytics-card">
        <div class="sig-analytics-title">${icn(t[0])}${t[1]}</div>
        <div class="sig-stat-value">${t[2]}</div>
      </div>`).join('')}</div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // DETAIL DRAWER
  // ══════════════════════════════════════════════════════════════
  function _sigTimelineIndex(s) {
    if (['tp1_hit', 'tp2_hit', 'tp3_hit', 'stopped_out', 'cancelled', 'expired'].includes(s.status)) return 5;
    if (s.status === 'active' || s.status === 'partial') return 1;
    return 0;
  }
  function _sigRenderTimeline(s) {
    const labels = ['Waiting', 'Entry Triggered', 'TP1', 'TP2', 'TP3', 'Closed'];
    const idx = _sigTimelineIndex(s);
    return `<div class="sig-timeline">${labels.map((l, i) => `
      <div class="sig-tl-step ${i < idx ? 'done' : i === idx ? 'current' : ''}">
        <div class="sig-tl-line"></div>
        <div class="sig-tl-dot">${icn('ic-check')}</div>
        <div class="sig-tl-label">${l}</div>
      </div>`).join('')}</div>`;
  }

  window._sigOpenDrawer = function (id) {
    const s = _sigAll.find(x => x.id === id);
    if (!s) return;
    let drawer = document.getElementById('signal-drawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.className = 'detail-panel';
      drawer.id = 'signal-drawer';
      document.body.appendChild(drawer);
    }
    drawer.innerHTML = _sigDrawerContent(s);
    requestAnimationFrame(() => drawer.classList.add('open'));
  };
  window._sigCloseDrawer = function () {
    const d = document.getElementById('signal-drawer');
    if (d) d.classList.remove('open');
  };

  function _sigDrawerContent(s) {
    const checklist = (s.checklist || []).map(c => `
      <div class="sig-checklist-item ${c.done ? 'checked' : ''}">
        <span class="chk">${c.done ? icn('ic-check') : ''}</span>${c.label}
      </div>`).join('');
    const confluences = (s.confluences || []).map(c => `<span class="sig-confluence-chip">${c}</span>`).join('');

    return `
    <div class="sig-drawer-head">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="sig-card-pair">${s.pair}</span>
          <span class="sig-dir-badge ${s.direction}">${s.direction === 'buy' ? '🟢 BUY' : '🔴 SELL'}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="sig-badge sig-badge-${s.status}"><span class="dot"></span>${STATUS_LABEL[s.status]}</span>
          <span class="sig-market-badge">${icn(MARKET_ICON[s.market])}${MARKET_LABEL[s.market]}</span>
        </div>
      </div>
      <button class="sig-drawer-close" onclick="_sigCloseDrawer()">${icn('ic-close')}</button>
    </div>

    <div class="sig-drawer-dates">
      <span>${icn('ic-calendar')} Created ${_timeAgo(s.created_at)}</span>
      <span>${icn('ic-upload')} Published ${s.published_at ? _timeAgo(s.published_at) : '—'}</span>
      <span>${icn('ic-clock')} Expires ${s.expires_at ? _timeAgo(s.expires_at) : '—'}</span>
    </div>

    ${_sigRenderTimeline(s)}

    <div class="sig-chart-frame">
      ${s.chart_screenshot_url ? `<img src="${s.chart_screenshot_url}" alt="Chart">` : `${icn('ic-image')} <span style="margin-left:6px">No chart screenshot yet</span>`}
    </div>

    <div class="sig-section-title">${icn('ic-ruler')} Trading Levels</div>
    <div class="sig-ladder">
      <div class="sig-ladder-row tp3"><span class="lbl">TP3</span><span class="val">${_fmtNum(s.tp3)}</span></div>
      <div class="sig-ladder-row tp2"><span class="lbl">TP2</span><span class="val">${_fmtNum(s.tp2)}</span></div>
      <div class="sig-ladder-row tp1"><span class="lbl">TP1</span><span class="val">${_fmtNum(s.tp1)}</span></div>
      <div class="sig-ladder-row entry"><span class="lbl">Entry</span><span class="val">${_fmtNum(s.entry)}</span></div>
      <div class="sig-ladder-row sl"><span class="lbl">Stop</span><span class="val">${_fmtNum(s.stop_loss)}</span></div>
    </div>
    <div class="sig-ladder-rr">${icn('ic-scale')} Risk : Reward — 1:${s.risk_reward}</div>

    <div class="sig-section-title">${icn('ic-bulb')} Trade Idea</div>
    <div class="sig-body-text">${s.trade_idea || '—'}</div>

    <div class="sig-section-title">${icn('ic-chart-line')} Market Outlook</div>
    <div class="sig-body-text">${s.market_outlook || '—'}</div>

    <div class="sig-section-title">${icn('ic-map')} Higher Timeframe Bias</div>
    <div class="sig-body-text">${s.htf_bias || '—'}</div>

    <div class="sig-section-title">${icn('ic-target')} Entry Reason &amp; Confluences</div>
    <div class="sig-body-text">${s.entry_reason || '—'}</div>
    <div class="sig-confluence-list">${confluences}</div>

    <div class="sig-section-title">${icn('ic-warning')} Invalidation</div>
    <div class="sig-body-text">${s.invalidation || '—'}</div>

    <div class="sig-section-title">${icn('ic-notebook')} Management Rules</div>
    <div class="sig-body-text">${s.management_rules || '—'}</div>

    <div class="sig-section-title">${icn('ic-check-c')} Trade Checklist</div>
    <div class="sig-checklist">${checklist || '<span class="sig-body-text">No checklist items.</span>'}</div>

    <div class="sig-section-title">${icn('ic-clock')} Session &amp; Duration</div>
    <div class="sig-body-text" style="text-transform:capitalize">${(s.session || '—').replace('_', '/')} · RR 1:${s.risk_reward} · Risk ${s.risk_percent || '—'}%</div>

    <div class="sig-section-title">${icn('ic-speech')} Comments</div>
    <div id="sig-comments-${s.id}">${(s.comments || []).map(c => `
      <div class="sig-comment"><div class="sig-comment-avatar">${(c.author || 'U')[0]}</div>
        <div class="sig-comment-body">${c.body}<div class="sig-comment-meta">${c.author || 'You'} · ${_timeAgo(c.ts)}</div></div>
      </div>`).join('') || '<div class="sig-body-text">No comments yet — be the first.</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input type="text" class="form-input" id="sig-comment-input-${s.id}" placeholder="Add a comment…" onkeydown="if(event.key==='Enter')_sigAddComment('${s.id}')">
      <button class="btn btn-primary" onclick="_sigAddComment('${s.id}')">${icn('ic-arrow-right')}</button>
    </div>

    <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
      <button class="btn" onclick="_sigToggleLike('${s.id}')">${icn('ic-thumbs-up')} Like</button>
      <button class="btn" onclick="_sigToggleBookmark('${s.id}')">${icn('ic-bookmark')} Bookmark</button>
      <button class="btn" onclick="_sigCopyDetails('${s.id}')">${icn('ic-copy')} Copy details</button>
      <button class="btn" onclick="_sigCopyTvLink('${s.id}')">${icn('ic-link')} TradingView link</button>
      <button class="btn" onclick="_sigExportPdf('${s.id}')">${icn('ic-download')} Export summary</button>
      <button class="btn glass-btn-danger" onclick="_sigDelete('${s.id}');_sigCloseDrawer()">${icn('ic-trash')} Delete</button>
    </div>
    `;
  }

  window._sigAddComment = function (id) {
    const input = document.getElementById('sig-comment-input-' + id);
    if (!input || !input.value.trim()) return;
    const s = _sigAll.find(x => x.id === id);
    s.comments = s.comments || [];
    s.comments.push({ body: input.value.trim(), author: 'You', ts: Date.now() });
    input.value = '';
    _saveDemoSignals();
    window._sigOpenDrawer(id);
    showToast('Comment added', 'success');
  };

  // ══════════════════════════════════════════════════════════════
  // SOCIAL / UTILITY ACTIONS
  // ══════════════════════════════════════════════════════════════
  window._sigToggleLike = function (id) {
    _sigLikes[id] = !_sigLikes[id];
    localStorage.setItem('sig_likes', JSON.stringify(_sigLikes));
    showToast(_sigLikes[id] ? 'Liked signal' : 'Removed like', 'success');
    _sigRenderActiveView();
  };
  window._sigToggleBookmark = function (id) {
    _sigBookmarks[id] = !_sigBookmarks[id];
    localStorage.setItem('sig_bookmarks', JSON.stringify(_sigBookmarks));
    showToast(_sigBookmarks[id] ? 'Bookmarked' : 'Bookmark removed', 'success');
  };
  window._sigCopyDetails = function (id) {
    const s = _sigAll.find(x => x.id === id);
    if (!s) return;
    const text = `${s.pair} ${s.direction.toUpperCase()}\nEntry: ${_fmtNum(s.entry)}\nSL: ${_fmtNum(s.stop_loss)}\nTP1: ${_fmtNum(s.tp1)}  TP2: ${_fmtNum(s.tp2)}  TP3: ${_fmtNum(s.tp3)}\nRR: 1:${s.risk_reward}\nConfidence: ${CONF_LABEL[s.confidence]} (${s.confidence_score}%)\nSession: ${(s.session || '').replace('_', '/')}`;
    navigator.clipboard?.writeText(text);
    showToast('Signal details copied', 'success');
  };
  window._sigCopyTvLink = function (id) {
    const s = _sigAll.find(x => x.id === id);
    if (!s) return;
    navigator.clipboard?.writeText(s.tradingview_link || '');
    showToast('TradingView link copied', 'success');
  };
  window._sigExportPdf = function (id) {
    const s = _sigAll.find(x => x.id === id);
    if (!s) return;
    // Lightweight text export (kept dependency-free). Swap for a PDF lib if you want a styled PDF.
    const text = `NxTGen Signal — ${s.pair} ${s.direction.toUpperCase()}\n\nStatus: ${STATUS_LABEL[s.status]}\nEntry: ${_fmtNum(s.entry)}\nStop Loss: ${_fmtNum(s.stop_loss)}\nTP1/TP2/TP3: ${_fmtNum(s.tp1)} / ${_fmtNum(s.tp2)} / ${_fmtNum(s.tp3)}\nRisk:Reward: 1:${s.risk_reward}\nConfidence: ${CONF_LABEL[s.confidence]} (${s.confidence_score}%)\nSession: ${(s.session || '').replace('_', '/')}\n\nTrade idea:\n${s.trade_idea || '—'}\n\nEntry reason:\n${s.entry_reason || '—'}\n\nInvalidation:\n${s.invalidation || '—'}\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.pair}-signal-${s.id.slice(0, 6)}.txt`;
    a.click();
    showToast('Signal summary exported', 'success');
  };

  window._sigDelete = async function (id) {
    if (!confirm('Delete this signal? This cannot be undone.')) return;
    if (_sigUsingSupabase && typeof sb !== 'undefined') {
      try { await sb.from('journal_signals').delete().eq('id', id); } catch (e) {}
    }
    _sigAll = _sigAll.filter(s => s.id !== id);
    if (!_sigUsingSupabase) _saveDemoSignals();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Signal deleted', 'success');
  };

  // ══════════════════════════════════════════════════════════════
  // NEW SIGNAL MODAL
  // ══════════════════════════════════════════════════════════════
  window._sigOpenModal = function () {
    let overlay = document.getElementById('sig-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'sig-modal-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) window._sigCloseModal(); };
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = _sigModalContent();
    overlay.classList.add('open');
  };
  window._sigCloseModal = function () {
    const o = document.getElementById('sig-modal-overlay');
    if (o) o.classList.remove('open');
  };

  function _sigModalContent() {
    return `
    <div class="modal modal-box" style="width:720px">
      <div class="modal-head">
        <div class="modal-title" style="display:flex;align-items:center;gap:10px">
          <span style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,rgba(96,165,250,0.25),rgba(96,165,250,0.12));border:1px solid rgba(96,165,250,0.3);display:flex;align-items:center;justify-content:center;font-size:14px">+</span>
          New Signal
        </div>
        <button class="modal-close" onclick="_sigCloseModal()">${icn('ic-close')}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-field"><label class="form-label">Pair</label><input class="form-input" id="sf-pair" placeholder="EURUSD"></div>
          <div class="form-field"><label class="form-label">Market</label>
            <select class="form-select" id="sf-market">
              ${Object.entries(MARKET_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-field"><label class="form-label">Direction</label>
            <select class="form-select" id="sf-direction"><option value="buy">🟢 BUY</option><option value="sell">🔴 SELL</option></select>
          </div>
          <div class="form-field"><label class="form-label">Setup Type</label><input class="form-input" id="sf-setup" placeholder="ERL > IRL"></div>

          <div class="form-field"><label class="form-label">Entry</label><input class="form-input" id="sf-entry" type="number" step="any"></div>
          <div class="form-field"><label class="form-label">Stop Loss</label><input class="form-input" id="sf-sl" type="number" step="any"></div>
          <div class="form-field"><label class="form-label">Take Profit 1</label><input class="form-input" id="sf-tp1" type="number" step="any"></div>
          <div class="form-field"><label class="form-label">Take Profit 2</label><input class="form-input" id="sf-tp2" type="number" step="any"></div>
          <div class="form-field"><label class="form-label">Take Profit 3</label><input class="form-input" id="sf-tp3" type="number" step="any"></div>
          <div class="form-field"><label class="form-label">Risk %</label><input class="form-input" id="sf-riskpct" type="number" step="any" value="1"></div>

          <div class="form-field"><label class="form-label">Confidence</label>
            <select class="form-select" id="sf-confidence">
              <option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="very_high">Very High</option>
            </select>
          </div>
          <div class="form-field"><label class="form-label">Confidence Score %</label><input class="form-input" id="sf-confscore" type="number" min="0" max="100" value="75"></div>
          <div class="form-field"><label class="form-label">Session</label>
            <select class="form-select" id="sf-session">
              <option value="sydney">Sydney</option><option value="tokyo">Tokyo</option><option value="london">London</option>
              <option value="new_york">New York</option><option value="london_ny_overlap">London/NY Overlap</option>
            </select>
          </div>
          <div class="form-field"><label class="form-label">Visibility</label>
            <select class="form-select" id="sf-visibility"><option value="public">Public</option><option value="premium">Premium</option><option value="private">Private</option></select>
          </div>

          <div class="form-field full"><label class="form-label">Trade Idea</label><textarea class="form-textarea" id="sf-idea" placeholder="Why this trade, in one or two sentences…"></textarea></div>
          <div class="form-field full"><label class="form-label">Entry Reason</label><textarea class="form-textarea" id="sf-reason"></textarea></div>
          <div class="form-field full"><label class="form-label">Management Rules</label><textarea class="form-textarea" id="sf-mgmt"></textarea></div>
          <div class="form-field"><label class="form-label">TradingView Link</label><input class="form-input" id="sf-tvlink" placeholder="https://tradingview.com/…"></div>
          <div class="form-field"><label class="form-label">Chart Screenshot</label><input class="form-input" id="sf-chart" type="file" accept="image/*"></div>
        </div>
      </div>
      <div class="form-actions">
        <button class="glass-btn glass-btn-cancel" onclick="_sigCloseModal()">Cancel</button>
        <button class="glass-btn glass-btn-cancel" onclick="_sigSaveSignal(true)">Save Draft</button>
        <button class="btn btn-primary" onclick="_sigSaveSignal(false)">${icn('ic-check')} Publish Signal</button>
      </div>
    </div>`;
  }

  window._sigSaveSignal = async function (asDraft) {
    const val = id => document.getElementById(id)?.value;
    const pair = (val('sf-pair') || '').trim().toUpperCase();
    const entry = parseFloat(val('sf-entry'));
    const sl = parseFloat(val('sf-sl'));
    if (!pair || isNaN(entry) || isNaN(sl)) { showToast('Pair, Entry and Stop Loss are required', 'error'); return; }
    const tp3 = parseFloat(val('sf-tp3')) || parseFloat(val('sf-tp1')) || entry;
    const rr = Math.abs(entry - sl) ? +(Math.abs(tp3 - entry) / Math.abs(entry - sl)).toFixed(1) : 0;

    const row = {
      id: _uid(), pair, market: val('sf-market'), direction: val('sf-direction'),
      entry, stop_loss: sl,
      tp1: parseFloat(val('sf-tp1')) || null, tp2: parseFloat(val('sf-tp2')) || null, tp3: parseFloat(val('sf-tp3')) || null,
      risk_reward: rr, risk_percent: parseFloat(val('sf-riskpct')) || null, risk_amount: null,
      confidence: val('sf-confidence'), confidence_score: parseInt(val('sf-confscore')) || 0,
      session: val('sf-session'), setup_type: val('sf-setup') || '', status: 'waiting',
      visibility: val('sf-visibility'),
      trade_idea: val('sf-idea') || '', market_outlook: '', htf_bias: '',
      entry_reason: val('sf-reason') || '', invalidation: '', management_rules: val('sf-mgmt') || '',
      notes: '', lessons: '', confluences: [], tags: [],
      chart_screenshot_url: null, tradingview_link: val('sf-tvlink') || '',
      expires_at: null, published_at: asDraft ? null : Date.now(), entered_at: null, closed_at: null,
      result: 'pending', pips: null, profit_percent: null, r_multiple: null,
      is_draft: !!asDraft, created_at: Date.now(), updated_at: Date.now(),
      checklist: [], comments: []
    };

    if (typeof sb !== 'undefined' && sb) {
      try {
        const { error } = await sb.from('journal_signals').insert([{ ...row }]);
        if (!error) { _sigUsingSupabase = true; }
      } catch (e) { /* fall back to local */ }
    }
    _sigAll.unshift(row);
    if (!_sigUsingSupabase) _saveDemoSignals();

    _sigCloseModal();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast(asDraft ? 'Draft saved' : 'Signal published', 'success');
  };

  // ══════════════════════════════════════════════════════════════
  // Counter animation (numbers count upward on stat render)
  // ══════════════════════════════════════════════════════════════
  function _animateCounters() {
    document.querySelectorAll('.sig-counting').forEach(el => {
      const raw = el.dataset.target;
      const num = parseFloat(raw);
      if (isNaN(num)) return;
      const suffix = raw.replace(/^-?[\d.]+/, '');
      const dur = 600, t0 = performance.now();
      function step(t) {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (Number.isInteger(num) ? Math.round(num * eased) : (num * eased).toFixed(1)) + suffix;
        if (p < 1) requestAnimationFrame(step); else el.textContent = raw;
      }
      requestAnimationFrame(step);
    });
  }
  const _origRenderStats = _sigRenderStats;
  _sigRenderStats = function () { _origRenderStats(); _animateCounters(); };

})();
