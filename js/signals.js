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
    draft: 'Draft', scheduled: 'Scheduled',
    // Only Cancelled and Closed are terminal — every other stage is still
    // "Ongoing" (the timeline / stage badge shows exactly how far it's got).
    waiting: 'Ongoing', active: 'Ongoing', partial: 'Ongoing', breakeven: 'Ongoing',
    tp1_hit: 'Ongoing', tp2_hit: 'Ongoing',
    stopped_out: 'Closed', cancelled: 'Cancelled', expired: 'Expired', closed: 'Closed'
  };
  const CONF_LABEL = { low: 'Low', medium: 'Medium', high: 'High', very_high: 'Very High' };
  const TIMELINE_STEPS = ['waiting', 'active', 'tp1_hit', 'tp2_hit', 'closed'];
  // Only Cancelled and Closed take a signal out of "Ongoing" — every other
  // status (waiting to be triggered, live, breakeven, TP1/TP2 hit) is still
  // an open, in-progress signal.
  const ONGOING_STATUSES = ['waiting', 'active', 'partial', 'breakeven', 'tp1_hit', 'tp2_hit'];
  const ENTERED_STATUSES = ['active', 'partial', 'breakeven', 'tp1_hit', 'tp2_hit'];
  // Order execution type — is this a live market fill or a pending (resting) order?
  const ORDER_TYPE_LABEL = {
    market: 'Market Execution', buy_limit: 'Buy Limit', sell_limit: 'Sell Limit',
    buy_stop: 'Buy Stop', sell_stop: 'Sell Stop'
  };
  const PENDING_ORDER_TYPES = ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'];
  let _sigDraftSearch = '';
  let _sigDraftSort = 'modified';

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
  // Real DB ids: journal_signals.id is a Postgres `uuid` column, so anything
  // written to Supabase MUST use a real UUID — never the local `_uid()` demo id.
  function _sigUuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  const _SIG_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function _sigIsDbId(id) { return typeof id === 'string' && _SIG_UUID_RE.test(id); }
  function _sigIso(v) { if (v === undefined || v === null) return null; return typeof v === 'number' ? new Date(v).toISOString() : v; }
  function _sigMs(v) { if (v === undefined || v === null) return null; return typeof v === 'number' ? v : new Date(v).getTime(); }

  // ══════════════════════════════════════════════════════════════
  // BACKEND PERSISTENCE — journal_signals is the single source of truth.
  // Every write is awaited and errors surface to the user; nothing is
  // ever assumed to have saved just because the local array changed.
  // ══════════════════════════════════════════════════════════════
  const SIGNAL_DB_COLUMNS = [
    'pair', 'market', 'direction', 'order_type', 'entry', 'stop_loss', 'tp1', 'tp2',
    'risk_reward', 'risk_percent', 'risk_amount', 'confidence', 'confidence_score',
    'session', 'status', 'visibility', 'market_outlook',
    'htf_bias', 'invalidation', 'management_rules', 'notes', 'lessons',
    'confluences', 'tags', 'chart_screenshot_url', 'tradingview_link', 'expires_at',
    'published_at', 'entered_at', 'closed_at', 'result', 'pips', 'profit_percent',
    'r_multiple', 'is_draft', 'draft_name', 'archived', 'scheduled_at', 'edited_at',
    'checklist', 'version_history'
  ];
  const SIGNAL_TS_FIELDS = ['expires_at', 'published_at', 'entered_at', 'closed_at', 'scheduled_at', 'edited_at', 'created_at', 'updated_at'];

  // Columns in journal_signals that are declared NOT NULL. If a row being
  // saved never set these (e.g. a brand-new draft built before `archived`
  // existed on the object), we must fall back to their schema default
  // instead of sending `null` — Postgres will reject a null insert even
  // though the column has a default, because an explicit null overrides it.
  const SIGNAL_NOT_NULL_DEFAULTS = { archived: false, checklist: [], version_history: [] };

  function _sigToDbRow(row) {
    const out = { owner_id: (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.id : undefined };
    SIGNAL_DB_COLUMNS.forEach(k => {
      let v = row[k];
      if (SIGNAL_TS_FIELDS.includes(k)) v = _sigIso(v);
      if ((v === undefined || v === null) && Object.prototype.hasOwnProperty.call(SIGNAL_NOT_NULL_DEFAULTS, k)) {
        v = SIGNAL_NOT_NULL_DEFAULTS[k];
      }
      out[k] = v === undefined ? null : v;
    });
    return out;
  }
  function _sigFromDbRow(row) {
    const out = { ...row };
    SIGNAL_TS_FIELDS.forEach(k => { if (out[k] != null) out[k] = _sigMs(out[k]); });
    out.checklist = out.checklist || [];
    out.version_history = out.version_history || [];
    out.tags = out.tags || [];
    out.confluences = out.confluences || [];
    out.comments = out.comments || [];
    return out;
  }

  // Save one signal row to Supabase (update if it already has a real DB id,
  // insert + capture the generated id otherwise). Returns true/false and
  // shows a toast on failure instead of swallowing the error.
  async function _sigCloudSave(row, silent) {
    if (!(_sigUsingSupabase && typeof sb !== 'undefined' && sb)) {
      // Local/demo mode has no database to hand back a generated id, so we
      // must assign one ourselves the moment a row is first saved. Leaving
      // row.id as null here was causing every `${s.id}` interpolated into
      // an onclick handler to literally read the string "null", which then
      // never matched the real `null` on the row when looked up — buttons
      // like "Add Update" would silently no-op on freshly created signals.
      if (!row.id) row.id = _uid();
      _saveDemoSignals();
      return true;
    }
    const dbRow = _sigToDbRow(row);
    let error, data;
    if (row.id && _sigIsDbId(row.id)) {
      const res = await sb.from('journal_signals').update(dbRow).eq('id', row.id).eq('owner_id', dbRow.owner_id);
      error = res.error;
    } else {
      const res = await sb.from('journal_signals').insert(dbRow).select().single();
      error = res.error; data = res.data;
      if (!error && data) {
        row.id = data.id;
        row.created_at = _sigMs(data.created_at);
        row.updated_at = _sigMs(data.updated_at);
      }
    }
    if (error) {
      console.error('signal save error:', error.message, error.details || '', error.hint || '');
      // Background autosave ticks pass silent=true — the modal's own
      // "Save failed — will retry" label already tells the user, and a
      // toast on every 4s retry while they're mid-typing is just noise.
      // Manual Save Draft / Publish never pass silent, so real user-
      // initiated saves still surface an error toast immediately.
      if (!silent) showToast('Save failed: ' + error.message, 'error');
      return false;
    }
    return true;
  }

  // Best-effort side-channel writes (updates timeline / activity log /
  // notifications). These write straight to Supabase so the timeline stays
  // in sync across devices. They're logged to console on failure rather
  // than blocking the main save, but they no longer silently no-op —
  // see the note on _sigLoadUpdatesLog/_sigLoadActivityLog below for why
  // these were appearing to do nothing.
  async function _sigLogUpdate(signalId, status, note, price) {
    if (!(_sigUsingSupabase && typeof sb !== 'undefined' && sb) || !_sigIsDbId(signalId)) return;
    try { await sb.from('journal_signal_updates').insert({ signal_id: signalId, status: status || null, note: note || null, price: price ?? null }); }
    catch (e) { console.error('signal update log failed:', e); }
  }
  async function _sigLogActivity(signalId, action, detail) {
    if (!(_sigUsingSupabase && typeof sb !== 'undefined' && sb) || !_currentUser) return;
    try { await sb.from('journal_signal_activity').insert({ signal_id: _sigIsDbId(signalId) ? signalId : null, owner_id: _currentUser.id, action, detail: detail || null }); }
    catch (e) { console.error('signal activity log failed:', e); }
  }
  async function _sigNotify(signalId, type, message) {
    if (!(_sigUsingSupabase && typeof sb !== 'undefined' && sb) || !_currentUser) return;
    try {
      await sb.from('journal_signal_notifications').insert({ signal_id: _sigIsDbId(signalId) ? signalId : null, owner_id: _currentUser.id, type, message });
      _sigRefreshNotifBadge();
    } catch (e) { console.error('signal notify failed:', e); }
  }

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
    const confidences = ['low', 'medium', 'high', 'very_high'];
    const sessions = ['sydney', 'tokyo', 'london', 'new_york', 'london_ny_overlap'];
    const confluenceOptions = ['Liquidity Sweep', 'FVG', 'Order Block', 'SMT', 'Structure Shift', 'Volume Spike'];

    const rows = [];
    const now = Date.now();
    for (let i = 0; i < 24; i++) {
      const inst = _pick(pairs);
      const dir = Math.random() > 0.5 ? 'buy' : 'sell';
      const orderType = _pick(['market', 'market', 'market', dir === 'buy' ? 'buy_limit' : 'sell_limit', dir === 'buy' ? 'buy_stop' : 'sell_stop']);
      // Only 'closed' and 'cancelled' are terminal now — hitting TP1/TP2 or
      // moving SL to breakeven just advances the signal's progress; it stays
      // "Ongoing" until it's explicitly closed or cancelled. "Waiting" only
      // ever applies to pending orders — a Market Execution fills instantly.
      const isPending = PENDING_ORDER_TYPES.includes(orderType);
      const status = _pick(isPending
        ? ['waiting', 'waiting', 'active', 'breakeven', 'tp1_hit', 'tp2_hit', 'closed', 'closed', 'cancelled']
        : ['active', 'active', 'breakeven', 'tp1_hit', 'tp2_hit', 'closed', 'closed', 'closed', 'cancelled']);
      const range = inst.base * 0.006;
      const entry = inst.base + _rand(-range, range);
      const slDist = Math.abs(entry) * _rand(0.002, 0.006);
      const sl = dir === 'buy' ? entry - slDist : entry + slDist;
      // TP1 is always fixed at a 1:2 risk:reward. TP2 is any extended target beyond that.
      const tp1 = dir === 'buy' ? entry + slDist * 2 : entry - slDist * 2;
      const tp2 = dir === 'buy' ? entry + slDist * _rand(2.4, 3.8) : entry - slDist * _rand(2.4, 3.8);
      const rr = (Math.abs(tp2 - entry) / Math.abs(entry - sl)).toFixed(1);
      const isClosed = ['closed', 'cancelled'].includes(status);
      const result = status === 'closed' ? _pick(['win', 'win', 'win', 'loss', 'breakeven']) : status === 'cancelled' ? 'pending' : 'pending';
      const isWin = result === 'win';
      const pips = isClosed ? (isWin ? _rand(15, 180) : (result === 'loss' ? -_rand(10, 60) : 0)) : null;
      const created = now - Math.floor(_rand(0, 21)) * 86400000 - Math.floor(_rand(0, 24)) * 3600000;
      const confluences = confluenceOptions.filter(() => Math.random() > 0.55);
      if (!confluences.length) confluences.push(_pick(confluenceOptions));

      rows.push({
        id: _uid(),
        pair: inst.p, market: inst.m, direction: dir, order_type: orderType,
        entry: +entry.toFixed(inst.dec), stop_loss: +sl.toFixed(inst.dec),
        tp1: +tp1.toFixed(inst.dec), tp2: +tp2.toFixed(inst.dec),
        risk_reward: +rr, risk_percent: _pick([0.5, 1, 1.5, 2]), risk_amount: null,
        confidence: _pick(confidences), confidence_score: Math.floor(_rand(55, 98)),
        session: _pick(sessions), status,
        visibility: _pick(['public', 'public', 'premium', 'private']),
        market_outlook: `${inst.p} showing ${dir === 'buy' ? 'accumulation' : 'distribution'} on the 4H with a clean break of structure.`,
        htf_bias: dir === 'buy' ? 'Bullish' : 'Bearish',
        invalidation: `Close beyond the ${dir === 'buy' ? 'low' : 'high'} of the reaction candle invalidates the idea.`,
        management_rules: 'Move to breakeven after TP1. Trail remainder behind structure after TP2.',
        notes: '', lessons: '',
        confluences, tags: [inst.m, dir],
        chart_screenshot_url: null, tradingview_link: `https://www.tradingview.com/chart/?symbol=${inst.p}`,
        expires_at: null,
        published_at: created, entered_at: status !== 'waiting' ? created + 3600000 : null,
        closed_at: isClosed ? created + 7200000 : null,
        result,
        pips: pips !== null ? +pips.toFixed(1) : null,
        profit_percent: pips !== null ? +((pips / 100) * _pick([0.8, 1, 1.2])).toFixed(2) : null,
        r_multiple: isClosed ? (isWin ? +_rand(1, 3.8).toFixed(1) : (result === 'loss' ? -1 : 0)) : null,
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
  // Persist a single (already-mutated) row back to whichever store is active.
  // Awaited — callers should `await` this so the UI never claims "saved"
  // before the write actually lands.
  async function _sigPersistSignal(row, silent) {
    return _sigCloudSave(row, silent);
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
          return data.map(_sigFromDbRow);
        }
        if (error) console.error('load signals error:', error.message);
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
    // One-time self-heal for signals stuck on "waiting" whose order type
    // isn't actually a pending (resting) type — a leftover from before
    // edits reconciled status with order type (e.g. a Buy Limit that got
    // edited to Market Execution but never advanced off "waiting"). Fix
    // it in place and push the correction back to Supabase so it doesn't
    // reappear next load.
    _sigAll.filter(s => s.status === 'waiting' && !s.is_draft && !PENDING_ORDER_TYPES.includes(s.order_type)).forEach(s => {
      s.status = 'active';
      if (!s.entered_at) s.entered_at = s.published_at || Date.now();
      _sigPersistSignal(s, true);
    });
    _sigRenderStats();
    _sigRenderActiveView();
    _sigRefreshNotifBadge();
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
          <button data-view="drafts" onclick="_sigSetView('drafts')">${icn('ic-notebook')} Drafts <span id="sig-drafts-tab-count" class="sig-drafts-count"></span></button>
        </div>
        <button id="sig-notif-bell" class="sig-notif-bell" title="Notifications" onclick="_sigToggleNotifPanel(event)">
          ${icn('ic-bell')}<span id="sig-notif-badge" class="sig-notif-badge" style="display:none">0</span>
        </button>
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

  // ══════════════════════════════════════════════════════════════
  // NOTIFICATION CENTER
  // ══════════════════════════════════════════════════════════════
  async function _sigRefreshNotifBadge() {
    const badge = document.getElementById('sig-notif-badge');
    if (!badge || !(_sigUsingSupabase && typeof sb !== 'undefined' && sb) || !_currentUser) return;
    const { count, error } = await sb.from('journal_signal_notifications')
      .select('id', { count: 'exact', head: true }).eq('owner_id', _currentUser.id).eq('read', false);
    if (error) { console.error('notif badge error:', error.message); return; }
    if (count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = 'inline-flex'; }
    else { badge.style.display = 'none'; }
  }

  window._sigToggleNotifPanel = async function (ev) {
    if (ev) ev.stopPropagation();
    const existing = document.getElementById('sig-notif-panel');
    if (existing) { existing.remove(); document.removeEventListener('click', _sigCloseNotifPanelOnce); return; }
    const panel = document.createElement('div');
    panel.id = 'sig-notif-panel';
    panel.className = 'sig-actions-menu sig-notif-panel';
    panel.innerHTML = `<div class="sig-notif-panel-head">Notifications <button class="sig-notif-markall" onclick="_sigMarkAllNotifsRead()">Mark all read</button></div><div id="sig-notif-list" class="sig-notif-list">Loading…</div>`;
    document.body.appendChild(panel);
    const rect = document.getElementById('sig-notif-bell').getBoundingClientRect();
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
    setTimeout(() => document.addEventListener('click', _sigCloseNotifPanelOnce), 0);

    const list = document.getElementById('sig-notif-list');
    if (!(_sigUsingSupabase && typeof sb !== 'undefined' && sb) || !_currentUser) { list.innerHTML = '<div class="sig-body-text" style="padding:12px">Connect Supabase to see live notifications.</div>'; return; }
    const { data, error } = await sb.from('journal_signal_notifications').select('*').eq('owner_id', _currentUser.id).order('created_at', { ascending: false }).limit(30);
    if (error) { list.innerHTML = '<div class="sig-body-text" style="padding:12px">Couldn\'t load notifications.</div>'; return; }
    if (!data || !data.length) { list.innerHTML = '<div class="sig-body-text" style="padding:12px">No notifications yet.</div>'; return; }
    list.innerHTML = data.map(n => `
      <button class="sig-notif-item ${n.read ? '' : 'unread'}" onclick="_sigOpenNotification('${n.id}','${n.signal_id || ''}')">
        <span class="sig-notif-msg">${n.message}</span>
        <span class="sig-notif-ts">${_timeAgo(new Date(n.created_at).getTime())}</span>
      </button>`).join('');
  };
  function _sigCloseNotifPanelOnce(e) {
    const panel = document.getElementById('sig-notif-panel');
    const bell = document.getElementById('sig-notif-bell');
    if (panel && !panel.contains(e.target) && !(bell && bell.contains(e.target))) {
      panel.remove();
      document.removeEventListener('click', _sigCloseNotifPanelOnce);
    }
  }
  window._sigOpenNotification = async function (notifId, signalId) {
    if (_sigUsingSupabase && typeof sb !== 'undefined' && sb) {
      await sb.from('journal_signal_notifications').update({ read: true }).eq('id', notifId);
      _sigRefreshNotifBadge();
    }
    document.getElementById('sig-notif-panel')?.remove();
    if (signalId && _sigAll.find(s => s.id === signalId)) window._sigOpenDrawer(signalId);
  };
  window._sigMarkAllNotifsRead = async function () {
    if (_sigUsingSupabase && typeof sb !== 'undefined' && sb && _currentUser) {
      await sb.from('journal_signal_notifications').update({ read: true }).eq('owner_id', _currentUser.id).eq('read', false);
    }
    _sigRefreshNotifBadge();
    document.getElementById('sig-notif-panel')?.remove();
    showToast('All notifications marked read', 'info');
  };

  // ── Combinable multi-select filters ─────────────────────────────
  // Each chip belongs to a group; chips within a group OR together,
  // groups AND together — e.g. Forex+Crypto (market) AND Winning (result)
  // AND This Month (timeframe) AND High Confidence (confidence) AND
  // London (session) all apply at once, matching the brief's example.
  const FILTER_GROUPS = {
    status: [{ id: 'active', label: 'Active' }, { id: 'closed', label: 'Closed' }, { id: 'draft', label: 'Drafts' }, { id: 'archived', label: 'Archived' }],
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
      // Drafts & archived signals live in their own workspace by default —
      // they only show up here if the person explicitly asks for them.
      if (s.is_draft && !has('status', 'draft')) return false;
      if (s.archived && !has('status', 'archived')) return false;
      if (_sigSearch) {
        const hay = (s.pair + ' ' + s.market).toLowerCase();
        if (!hay.includes(_sigSearch)) return false;
      }
      if (has('status', 'active') || has('status', 'closed')) {
        const isActive = ONGOING_STATUSES.includes(s.status);
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
    else if (_sigView === 'drafts') root.innerHTML = _sigRenderDrafts();
    // stagger row/card animation delays
    root.querySelectorAll('.sig-row, .sig-card, .sig-draft-card').forEach((el, i) => { el.style.animationDelay = (i * 0.025) + 's'; });
    const badge = document.getElementById('sig-drafts-tab-count');
    const draftCt = _sigAll.filter(s => s.is_draft && !s.archived).length;
    if (badge) badge.textContent = draftCt ? draftCt : '';
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

    const active = all.filter(s => ONGOING_STATUSES.includes(s.status));
    const wins = all.filter(s => s.result === 'win');
    const losses = all.filter(s => s.result === 'loss');
    const closed = all.filter(s => s.result === 'win' || s.result === 'loss');
    const todays = all.filter(s => !s.is_draft && s.status !== 'scheduled' && s.created_at >= today.getTime());
    // Drafts aren't published signals — they shouldn't inflate "this week" /
    // "this month" counts (Active Signals footer, More Analytics tiles).
    const thisWeek = all.filter(s => !s.is_draft && s.created_at >= weekAgo);
    const prevWeek = all.filter(s => !s.is_draft && s.created_at >= prevWeekAgo && s.created_at < weekAgo);

    const weekClosed = closed.filter(s => s.created_at >= weekAgo);
    const weekAcc = weekClosed.length ? (weekClosed.filter(s => s.result === 'win').length / weekClosed.length * 100) : 0;
    const winPct = closed.length ? (wins.length / closed.length * 100) : 0;
    const lossPct = closed.length ? (losses.length / closed.length * 100) : 0;

    const avgRR = all.length ? (all.reduce((a, s) => a + (+s.risk_reward || 0), 0) / all.length) : 0;
    const totalPips = closed.reduce((a, s) => a + (+s.pips || 0), 0);
    const totalR = closed.reduce((a, s) => a + (+s.r_multiple || 0), 0);
    const openPositions = all.filter(s => ENTERED_STATUSES.includes(s.status)).length;
    const closedPositions = closed.length;
    const monthClosed = closed.filter(s => s.created_at >= monthAgo);
    const monthProfit = monthClosed.reduce((a, s) => a + (+s.profit_percent || 0), 0);
    const avgHold = closed.length ? (closed.reduce((a, s) => a + ((s.closed_at && s.entered_at) ? (s.closed_at - s.entered_at) : 3600000 * 4), 0) / closed.length) : 0;
    const avgHoldHrs = avgHold / 3600000;

    const hourly = new Array(24).fill(0);
    todays.forEach(s => { hourly[new Date(s.created_at).getHours()]++; });

    const activeTrend = _sigDaySeries(s => ONGOING_STATUSES.includes(s.status));
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
      _sigMiniStat('Signals This Month', _sigAll.filter(s => !s.is_draft && s.created_at >= Date.now() - 30 * 86400000).length),
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

  function _sigOrderTypeBadge(s) {
    const type = s.order_type || 'market';
    const isPending = PENDING_ORDER_TYPES.includes(type);
    return `<span class="sig-order-badge ${isPending ? 'pending' : 'market'}">${icn(isPending ? 'ic-clock' : 'ic-zap')}${ORDER_TYPE_LABEL[type] || 'Market Execution'}</span>`;
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
      const statusTone = s.result === 'win' ? 'green' : s.result === 'loss' ? 'red' : ENTERED_STATUSES.includes(s.status) ? 'blue' : '';
      const expandRow = expanded ? `
      <tr class="sig-row-expand-tr">
        <td colspan="18">
          <div class="sig-row-expand">
            <div class="sig-row-expand-col">
              <div class="sig-section-title" style="margin-top:0">${icn('ic-bulb')} Management Rules</div>
              <div class="sig-body-text">${s.management_rules || '—'}</div>
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
        <td>${_sigOrderTypeBadge(s)}</td>
        <td>${_sigRrViz(s)}</td>
        <td>${_sigConfBadge(s)}</td>
        <td style="text-transform:capitalize">${(s.session || '').replace('_', '/')}</td>
        <td>${_timeAgo(s.created_at)}</td>
        <td>${s.result === 'win' ? '<span class="sig-badge sig-badge-tp1_hit">Win</span>' : s.result === 'loss' ? '<span class="sig-badge sig-badge-stopped_out">Loss</span>' : '<span class="sig-badge sig-badge-neutral">Pending</span>'}</td>
        <td class="${s.pips > 0 ? 'sig-pips-pos' : s.pips < 0 ? 'sig-pips-neg' : ''}">${s.pips != null ? (s.pips > 0 ? '+' : '') + s.pips.toFixed(1) : '—'}</td>
        <td class="${s.profit_percent > 0 ? 'sig-pips-pos' : s.profit_percent < 0 ? 'sig-pips-neg' : ''}">${s.profit_percent != null ? (s.profit_percent > 0 ? '+' : '') + s.profit_percent + '%' : '—'}</td>
        <td onclick="event.stopPropagation()">
          <div class="sig-row-actions">
            <button title="Bookmark" onclick="_sigToggleBookmark('${s.id}')">${icn('ic-bookmark')}</button>
            <button title="Edit" onclick="_sigOpenModal('edit','${s.id}')">${icn('ic-edit')}</button>
            <button class="sig-dots-btn" title="More actions" onclick="_sigOpenActionsMenu('${s.id}', event)">${icn('ic-dot')}${icn('ic-dot')}${icn('ic-dot')}</button>
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
            <th>TP1</th><th>TP2</th><th>Order</th><th>RR</th><th>Confidence</th><th>Session</th>
            <th>Date</th><th>Result</th><th>Pips</th><th>Profit %</th><th>Actions</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${allRows.length > _sigTableLimit ? `<div class="sig-load-more"><button class="btn" onclick="_sigLoadMoreRows()">${icn('ic-refresh')} Load ${Math.min(SIG_TABLE_BATCH, allRows.length - _sigTableLimit)} more (${allRows.length - _sigTableLimit} remaining)</button></div>` : ''}
    </div>`;
  }

  function _sigEmptyState() {
    if (!_sigAll.length) {
      return `<div class="sig-table-card"><div class="sig-empty-onboard">
        <div class="sig-empty-illustration">${icn('ic-zap')}</div>
        <div class="sig-empty-title">No signals yet</div>
        <div class="sig-empty-sub">Publish your first signal to start tracking win rate, RR and pips like a pro desk.</div>
        <button class="btn btn-primary btn-ripple" onclick="_sigOpenModal()">${icn('ic-plus')} Create New Signal</button>
      </div></div>`;
    }
    return `<div class="sig-table-card"><div class="sig-table-empty">${icn('ic-search')}<div style="margin-top:8px">No signals match these filters.</div><button class="btn" style="margin-top:10px" onclick="_sigResetFilters()">${icn('ic-refresh')} Reset filters</button></div></div>`;
  }

  // ══════════════════════════════════════════════════════════════
  // DRAFTS WORKSPACE
  // ══════════════════════════════════════════════════════════════
  window._sigOnDraftSearch = function (v) { _sigDraftSearch = v.trim().toLowerCase(); _sigRenderActiveView(); };
  window._sigSetDraftSort = function (v) { _sigDraftSort = v; _sigRenderActiveView(); };

  function _sigRenderDrafts() {
    let drafts = _sigAll.filter(s => s.is_draft && !s.archived);
    if (_sigDraftSearch) drafts = drafts.filter(s => (s.pair + ' ' + (s.draft_name || '')).toLowerCase().includes(_sigDraftSearch));
    const sorters = {
      modified: (a, b) => (b.updated_at || 0) - (a.updated_at || 0),
      created: (a, b) => (b.created_at || 0) - (a.created_at || 0),
      pair: (a, b) => (a.pair || '').localeCompare(b.pair || '')
    };
    drafts = [...drafts].sort(sorters[_sigDraftSort] || sorters.modified);

    const header = `
    <div class="sig-drafts-toolbar">
      <div class="sig-drafts-summary">${icn('ic-notebook')} <strong>${drafts.length}</strong> draft${drafts.length === 1 ? '' : 's'} in progress</div>
      <div class="sig-drafts-tools">
        <div class="sig-search-wrap sig-search-wrap-sm">${icn('ic-search')}<input type="text" placeholder="Search drafts…" oninput="_sigOnDraftSearch(this.value)"></div>
        <select class="form-select sig-drafts-sort" onchange="_sigSetDraftSort(this.value)">
          <option value="modified">Sort: Last modified</option>
          <option value="created">Sort: Created</option>
          <option value="pair">Sort: Pair A–Z</option>
        </select>
      </div>
    </div>`;

    if (!drafts.length) {
      return header + `<div class="sig-table-card"><div class="sig-empty-onboard">
        <div class="sig-empty-illustration">${icn('ic-notebook')}</div>
        <div class="sig-empty-title">No drafts</div>
        <div class="sig-empty-sub">Start a new signal and it'll autosave here as you work — nothing gets lost.</div>
        <button class="btn btn-primary btn-ripple" onclick="_sigOpenModal()">${icn('ic-plus')} Start a Draft</button>
      </div></div>`;
    }

    return header + `<div class="sig-drafts-grid">${drafts.map(s => `
      <div class="sig-draft-card">
        <div class="sig-draft-top">
          <div class="sig-draft-title">${s.pair || s.draft_name || 'Untitled draft'}${s.direction ? ` <span class="sig-dir-badge ${s.direction}" style="font-size:9px;padding:2px 6px">${s.direction === 'buy' ? 'BUY' : 'SELL'}</span>` : ''}</div>
          <span class="sig-badge sig-badge-draft"><span class="dot"></span>Draft</span>
        </div>
        ${s.draft_name ? `<div class="sig-draft-name">${s.draft_name}</div>` : ''}
        <div class="sig-draft-meta">
          <span>${icn('ic-clock')} Modified ${_timeAgo(s.updated_at || s.created_at)}</span>
          <span>${icn('ic-calendar')} Created ${_timeAgo(s.created_at)}</span>
        </div>
        ${s.confidence_score ? _sigConfBadge(s) : ''}
        <div class="sig-draft-actions">
          <button class="btn btn-primary" onclick="_sigOpenModal('edit','${s.id}')">${icn('ic-edit')} Continue Editing</button>
          <button title="Preview" onclick="_sigOpenDrawer('${s.id}')">${icn('ic-eye')}</button>
          <button title="Publish" onclick="_sigOpenReviewModal('${s.id}')">${icn('ic-upload')}</button>
          <button title="Duplicate" onclick="_sigDuplicateSignal('${s.id}')">${icn('ic-copy')}</button>
          <button title="Rename" onclick="_sigRenameDraft('${s.id}')">${icn('ic-tag')}</button>
          <button title="Archive" onclick="_sigArchiveSignal('${s.id}')">${icn('ic-archive')}</button>
          <button title="Delete" onclick="_sigDelete('${s.id}')">${icn('ic-trash')}</button>
        </div>
      </div>`).join('')}</div>`;
  }

  window._sigRenameDraft = async function (id) {
    const s = _sigAll.find(x => x.id === id); if (!s) return;
    const name = prompt('Rename draft:', s.draft_name || s.pair || '');
    if (name === null) return;
    s.draft_name = name.trim();
    s.updated_at = Date.now();
    await _sigPersistSignal(s);
    _sigRenderActiveView();
  };

  window._sigArchiveSignal = async function (id) {
    const s = _sigAll.find(x => x.id === id); if (!s) return;
    s.archived = !s.archived;
    s.updated_at = Date.now();
    const ok = await _sigPersistSignal(s);
    if (ok) { _sigLogActivity(s.id, s.archived ? 'archived' : 'unarchived'); }
    _sigRenderStats();
    _sigRenderActiveView();
    showToast(s.archived ? 'Archived' : 'Unarchived', 'info');
  };

  window._sigDuplicateSignal = async function (id) {
    const s = _sigAll.find(x => x.id === id); if (!s) return;
    const copy = { ...s, id: null, pair: s.pair, is_draft: true, status: 'draft', archived: false,
      draft_name: (s.draft_name || s.pair || 'Signal') + ' (copy)', created_at: Date.now(), updated_at: Date.now(),
      published_at: null, edited_at: null, edited_by: null, version_history: [], comments: [] };
    _sigAll.unshift(copy);
    const ok = await _sigCloudSave(copy);
    if (!ok) { _sigAll = _sigAll.filter(x => x !== copy); _sigRenderStats(); _sigRenderActiveView(); return; } // error toast already shown; don't leave an unsaved phantom row in the list
    _sigLogActivity(copy.id, 'duplicated', 'Duplicated from ' + (s.pair || 'a previous signal'));
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Duplicated as new draft', 'success');
  };

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
            <button class="sig-social-btn" onclick="event.stopPropagation();_sigOpenModal('edit','${s.id}')">${icn('ic-edit')}</button>
            <button class="sig-social-btn sig-dots-btn" onclick="event.stopPropagation();_sigOpenActionsMenu('${s.id}', event)">${icn('ic-dot')}${icn('ic-dot')}${icn('ic-dot')}</button>
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
  // Market Execution orders fill the instant they're published — they're
  // never actually "Waiting" — so their timeline skips that step entirely
  // rather than showing it as an already-passed stage.
  function _sigTimelineIndex(s, isPending) {
    if (['closed', 'stopped_out', 'cancelled', 'expired'].includes(s.status)) return isPending ? 4 : 3;
    if (s.status === 'tp2_hit') return isPending ? 3 : 2;
    if (s.status === 'tp1_hit') return isPending ? 2 : 1;
    if (['active', 'partial', 'breakeven'].includes(s.status)) return isPending ? 1 : 0;
    return 0;
  }
  function _sigRenderTimeline(s) {
    const isPending = PENDING_ORDER_TYPES.includes(s.order_type);
    const labels = isPending ? ['Waiting', 'Entry Triggered', 'TP1', 'TP2', 'Closed'] : ['Entry Triggered', 'TP1', 'TP2', 'Closed'];
    const idx = _sigTimelineIndex(s, isPending);
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
    // Local/demo signals already have their updates & activity rendered
    // Updates & Activity are fetched fresh from Supabase every time the
    // drawer opens, so the panel always reflects what's actually saved in
    // the cloud rather than whatever was last rendered on this device.
    if (_sigIsDbId(s.id)) { _sigLoadUpdatesLog(s.id); _sigLoadActivityLog(s.id); }
  };

  async function _sigLoadUpdatesLog(id) {
    const el = document.getElementById('sig-updates-log-' + id);
    if (!el || !(_sigUsingSupabase && typeof sb !== 'undefined' && sb)) return;
    // This previously had no try/catch. If the `journal_signal_updates`
    // query threw instead of resolving with an {error} object (e.g. the
    // table wasn't migrated yet, or a transient network failure), this
    // function would blow up mid-await and never touch el.innerHTML again
    // — leaving the panel stuck on "Loading updates…" forever with no way
    // to tell it had actually failed.
    try {
      const { data, error } = await sb.from('journal_signal_updates').select('*').eq('signal_id', id).order('created_at', { ascending: true });
      if (error) throw error;
      if (!data || !data.length) { el.innerHTML = `<div class="sig-body-text">No updates yet.</div>`; return; }
      el.innerHTML = data.map(u => `
        <div class="sig-version-item"><span class="dot"></span>${(u.note || STATUS_LABEL[u.status] || u.status || '')}
          <span class="sig-version-ts">${new Date(u.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
        </div>`).join('');
    } catch (e) {
      console.error('load updates failed:', e);
      el.innerHTML = `<div class="sig-body-text">Couldn't load updates. <button class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="_sigLoadUpdatesLog('${id}')">Retry</button></div>`;
    }
  }
  async function _sigLoadActivityLog(id) {
    const el = document.getElementById('sig-activity-log-' + id);
    if (!el || !(_sigUsingSupabase && typeof sb !== 'undefined' && sb)) return;
    try {
      const { data, error } = await sb.from('journal_signal_activity').select('*').eq('signal_id', id).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      if (!data || !data.length) { el.innerHTML = `<div class="sig-body-text">No activity recorded yet.</div>`; return; }
      el.innerHTML = data.map(a => `
        <div class="sig-version-item"><span class="dot"></span>${a.action}${a.detail ? ' — ' + a.detail : ''}
          <span class="sig-version-ts">${_timeAgo(new Date(a.created_at).getTime())}</span>
        </div>`).join('');
    } catch (e) {
      console.error('load activity failed:', e);
      el.innerHTML = `<div class="sig-body-text">Couldn't load activity. <button class="btn" style="padding:2px 8px;font-size:11px;margin-left:6px" onclick="_sigLoadActivityLog('${id}')">Retry</button></div>`;
    }
  }
  window._sigCloseDrawer = function () {
    const d = document.getElementById('signal-drawer');
    if (d) d.classList.remove('open');
  };

  function _sigDrawerContent(s) {
    return `
    <div class="sig-drawer-head">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="sig-card-pair">${s.pair}</span>
          <span class="sig-dir-badge ${s.direction}">${s.direction === 'buy' ? '🟢 BUY' : '🔴 SELL'}</span>
          ${s.edited_at ? '<span class="sig-edited-badge">Edited</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="sig-badge sig-badge-${s.status}"><span class="dot"></span>${STATUS_LABEL[s.status] || s.status}</span>
          ${s.archived ? '<span class="sig-badge sig-badge-archived"><span class="dot"></span>Archived</span>' : ''}
          <span class="sig-market-badge">${icn(MARKET_ICON[s.market])}${MARKET_LABEL[s.market]}</span>
          ${_sigOrderTypeBadge(s)}
        </div>
      </div>
      <button class="sig-drawer-close" onclick="_sigCloseDrawer()">${icn('ic-close')}</button>
    </div>

    <div class="sig-drawer-dates">
      <span>${icn('ic-calendar')} Created ${_timeAgo(s.created_at)}</span>
      <span>${icn('ic-upload')} Published ${s.published_at ? _timeAgo(s.published_at) : '—'}</span>
      <span>${icn('ic-clock')} Expires ${s.expires_at ? _timeAgo(s.expires_at) : '—'}</span>
      ${s.edited_at ? `<span>${icn('ic-history')} Edited ${_timeAgo(s.edited_at)} by ${s.edited_by || 'You'}</span>` : ''}
    </div>

    ${_sigRenderTimeline(s)}

    <div class="sig-section-title">${icn('ic-history')} Updates</div>
    <div class="sig-version-list" id="sig-updates-log-${s.id}"><div class="sig-body-text">${s.is_draft ? 'Publish this signal to start a timeline.' : 'Loading updates…'}</div></div>

    <div class="sig-chart-frame">
      ${s.chart_screenshot_url ? `<img src="${s.chart_screenshot_url}" alt="Chart">` : `${icn('ic-image')} <span style="margin-left:6px">No chart screenshot yet</span>`}
    </div>

    <div class="sig-section-title">${icn('ic-ruler')} Trading Levels</div>
    <div class="sig-ladder">
      <div class="sig-ladder-row tp2"><span class="lbl">TP2</span><span class="val">${_fmtNum(s.tp2)}</span></div>
      <div class="sig-ladder-row tp1"><span class="lbl">TP1</span><span class="val">${_fmtNum(s.tp1)}</span></div>
      <div class="sig-ladder-row entry"><span class="lbl">Entry</span><span class="val">${_fmtNum(s.entry)}</span></div>
      <div class="sig-ladder-row sl"><span class="lbl">Stop</span><span class="val">${_fmtNum(s.stop_loss)}</span></div>
    </div>
    <div class="sig-ladder-rr">${icn('ic-scale')} Risk : Reward — 1:${s.risk_reward}</div>

    <div class="sig-section-title">${icn('ic-warning')} Invalidation</div>
    <div class="sig-body-text">${s.invalidation || '—'}</div>

    <div class="sig-section-title">${icn('ic-notebook')} Management Rules</div>
    <div class="sig-body-text">${s.management_rules || '—'}</div>

    <div class="sig-section-title">${icn('ic-clock')} Session &amp; Duration</div>
    <div class="sig-body-text" style="text-transform:capitalize">${(s.session || '—').replace('_', '/')} · Risk : Reward 1:${s.risk_reward}</div>

    <div class="sig-section-title">${icn('ic-speech')} Comments</div>
    <div id="sig-comments-${s.id}">${(s.comments || []).map(c => `
      <div class="sig-comment"><div class="sig-comment-avatar">${(c.author || 'U')[0]}</div>
        <div class="sig-comment-body">${c.body}<div class="sig-comment-meta">${c.author || 'You'} · ${_timeAgo(c.ts)}</div></div>
      </div>`).join('') || '<div class="sig-body-text">No comments yet — be the first.</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <input type="text" class="form-input" id="sig-comment-input-${s.id}" placeholder="Add a comment…" onkeydown="if(event.key==='Enter')_sigAddComment('${s.id}')">
      <button class="btn btn-primary" onclick="_sigAddComment('${s.id}')">${icn('ic-arrow-right')}</button>
    </div>

    ${(s.version_history && s.version_history.length) ? `
    <div class="sig-section-title">${icn('ic-history')} Version History</div>
    <div class="sig-version-list">${s.version_history.slice().reverse().map(v => `<div class="sig-version-item"><span class="dot"></span>${v.note} <span class="sig-version-ts">${_timeAgo(v.ts)}</span></div>`).join('')}</div>
    ` : ''}

    <div class="sig-section-title">${icn('ic-activity')} Activity Log</div>
    <div class="sig-version-list" id="sig-activity-log-${s.id}"><div class="sig-body-text">${s.is_draft ? 'No activity yet.' : 'Loading…'}</div></div>

    <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
      <button class="btn" onclick="_sigToggleLike('${s.id}')">${icn('ic-thumbs-up')} Like</button>
      <button class="btn" onclick="_sigToggleBookmark('${s.id}')">${icn('ic-bookmark')} Bookmark</button>
      <button class="btn" onclick="_sigOpenModal('edit','${s.id}')">${icn('ic-edit')} Edit</button>
      <button class="btn" onclick="_sigDuplicateSignal('${s.id}')">${icn('ic-copy')} Duplicate</button>
      ${s.is_draft ? `<button class="btn btn-primary" onclick="_sigOpenReviewModal('${s.id}')">${icn('ic-upload')} Publish</button>` : `
        <button class="btn btn-primary" onclick="_sigOpenUpdateModal('${s.id}')">${icn('ic-notebook')} Add Update</button>
        <button class="btn" onclick="_sigUnpublishSignal('${s.id}')">${icn('ic-cloud-off')} Unpublish</button>`}
      <button class="btn" onclick="_sigArchiveSignal('${s.id}')">${icn('ic-archive')} ${s.archived ? 'Unarchive' : 'Archive'}</button>
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

  // ── Contextual "⋮" actions menu (table rows, cards, drawer) ────
  window._sigOpenActionsMenu = function (id, ev) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    document.getElementById('sig-actions-menu')?.remove();
    const s = _sigAll.find(x => x.id === id);
    if (!s) return;
    const items = [
      { icon: 'ic-eye', label: 'View', fn: `_sigOpenDrawer('${id}')` },
      { icon: 'ic-edit', label: 'Edit', fn: `_sigOpenModal('edit','${id}')` },
      { icon: 'ic-copy', label: 'Duplicate', fn: `_sigDuplicateSignal('${id}')` },
      { icon: 'ic-clipboard', label: 'Copy Details', fn: `_sigCopyDetails('${id}')` },
    ];
    if (s.is_draft) items.push({ icon: 'ic-upload', label: 'Publish', fn: `_sigOpenReviewModal('${id}')` });
    else {
      items.push({ icon: 'ic-notebook', label: 'Add Update', fn: `_sigOpenUpdateModal('${id}')` });
      items.push({ icon: 'ic-cloud-off', label: 'Unpublish (to Draft)', fn: `_sigUnpublishSignal('${id}')` });
    }
    items.push({ icon: 'ic-archive', label: s.archived ? 'Unarchive' : 'Archive', fn: `_sigArchiveSignal('${id}')` });
    items.push({ icon: 'ic-trash', label: 'Delete', fn: `_sigDelete('${id}')`, danger: true });

    const menu = document.createElement('div');
    menu.id = 'sig-actions-menu';
    menu.className = 'sig-actions-menu';
    menu.innerHTML = items.map(it => `<button class="${it.danger ? 'danger' : ''}" onclick="document.getElementById('sig-actions-menu')?.remove();${it.fn}">${icn(it.icon)}${it.label}</button>`).join('');
    document.body.appendChild(menu);
    const rect = (ev?.currentTarget || ev?.target).getBoundingClientRect();
    const menuW = 200;
    let left = rect.right - menuW + window.scrollX;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    menu.style.left = left + 'px';
    menu.style.top = (rect.bottom + 6 + window.scrollY) + 'px';
    setTimeout(() => document.addEventListener('click', _sigCloseActionsMenuOnce), 0);
  };
  function _sigCloseActionsMenuOnce(e) {
    const menu = document.getElementById('sig-actions-menu');
    if (menu && !menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', _sigCloseActionsMenuOnce); }
  }
  window._sigUnpublishSignal = async function (id) {
    const s = _sigAll.find(x => x.id === id); if (!s) return;
    s.is_draft = true; s.status = 'draft'; s.published_at = null; s.updated_at = Date.now();
    const ok = await _sigPersistSignal(s);
    if (!ok) return;
    _sigLogActivity(id, 'unpublished');
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Moved back to Drafts', 'info');
  };

  // ══════════════════════════════════════════════════════════════
  // SIGNAL LIFECYCLE — Add Update
  // Replaces the old prompt()-based "Add Update" / "Close Signal" flow
  // (which never actually advanced a signal's stage) with a real modal
  // that walks a signal through its stages and always persists the
  // change. Only two stages are terminal — Cancelled and Close — every
  // other stage (Entry Triggered, SL to Breakeven, TP1 Hit, TP2 Hit) is
  // just progress and the signal stays "Ongoing" until it's actually
  // closed or cancelled.
  // ══════════════════════════════════════════════════════════════
  const SIG_STAGE_OPTIONS = {
    waiting: [
      { key: 'active', status: 'active', label: 'Entry Triggered', terminal: false },
      { key: 'cancelled', status: 'cancelled', result: 'pending', label: 'Cancelled', terminal: true }
    ],
    active: [
      { key: 'breakeven', status: 'breakeven', label: 'SL to Breakeven', terminal: false },
      { key: 'tp1_hit', status: 'tp1_hit', label: 'TP1 Hit', terminal: false },
      { key: 'tp2_hit', status: 'tp2_hit', label: 'TP2 Hit', terminal: false },
      { key: 'cancelled', status: 'cancelled', result: 'pending', label: 'Cancelled', terminal: true },
      { key: 'closed', status: 'closed', label: 'Close', terminal: true }
    ],
    breakeven: [
      { key: 'tp1_hit', status: 'tp1_hit', label: 'TP1 Hit', terminal: false },
      { key: 'tp2_hit', status: 'tp2_hit', label: 'TP2 Hit', terminal: false },
      { key: 'cancelled', status: 'cancelled', result: 'pending', label: 'Cancelled', terminal: true },
      { key: 'closed', status: 'closed', label: 'Close', terminal: true }
    ],
    tp1_hit: [
      { key: 'breakeven', status: 'breakeven', label: 'SL to Breakeven', terminal: false },
      { key: 'tp2_hit', status: 'tp2_hit', label: 'TP2 Hit', terminal: false },
      { key: 'cancelled', status: 'cancelled', result: 'pending', label: 'Cancelled', terminal: true },
      { key: 'closed', status: 'closed', label: 'Close', terminal: true }
    ],
    tp2_hit: [
      { key: 'breakeven', status: 'breakeven', label: 'SL to Breakeven', terminal: false },
      { key: 'cancelled', status: 'cancelled', result: 'pending', label: 'Cancelled', terminal: true },
      { key: 'closed', status: 'closed', label: 'Close', terminal: true }
    ]
  };
  SIG_STAGE_OPTIONS.partial = SIG_STAGE_OPTIONS.active;
  function _sigStageOptionsFor(status) { return SIG_STAGE_OPTIONS[status] || []; }

  // "Close" doesn't have its own fixed outcome — it finalizes the signal
  // using whatever progress was made before it: TP2 hit or TP1 hit both
  // close as a win, breakeven closes flat, and closing straight from
  // "active" (nothing hit yet) closes as a loss — i.e. stopped out.
  function _sigCloseResultFor(status) {
    if (status === 'tp2_hit' || status === 'tp1_hit') return { result: 'win', label: `Closed (${status === 'tp2_hit' ? 'TP2' : 'TP1'} Hit)` };
    if (status === 'breakeven') return { result: 'breakeven', label: 'Closed at Breakeven' };
    return { result: 'loss', label: 'Closed (Stopped Out)' };
  }

  // Turn a stage transition into real numbers (pips / R-multiple / profit %)
  // instead of leaving them null forever — this is what Total Pips, Total R,
  // and Monthly Profit are actually summed from, so a "win" that never gets
  // a number attached to it will always add up to 0. Uses the price the
  // user typed into "Price at this stage" when given; otherwise falls back
  // to the known level for that stage (TP1/TP2/entry/stop-loss) so a trade
  // still gets credited even if no custom price was entered.
  function _sigTradeMath(s, stage, customPrice) {
    const entry = +s.entry, sl = +s.stop_loss;
    const none = { pips: null, r_multiple: null, profit_percent: null };
    if (!entry || !sl || entry === sl) return none;
    const riskDist = Math.abs(entry - sl);
    const dir = s.direction === 'buy' ? 1 : -1;
    let exitPrice = customPrice;
    if (exitPrice == null || isNaN(exitPrice)) {
      if (stage === 'tp1_hit' && s.tp1 != null) exitPrice = +s.tp1;
      else if (stage === 'tp2_hit' && s.tp2 != null) exitPrice = +s.tp2;
      else if (stage === 'breakeven') exitPrice = entry;
      else if (stage === 'stopped_out') exitPrice = sl;
    }
    if (exitPrice == null || isNaN(exitPrice)) return none;
    const rewardDist = (exitPrice - entry) * dir;
    const rMultiple = +(rewardDist / riskDist).toFixed(2);
    const riskPct = +s.risk_percent || 1;
    const profitPercent = +(rMultiple * riskPct).toFixed(2);
    // "Pips" — scale the raw price distance the way most FX traders read
    // it (×10,000, or ×100 for JPY pairs); other markets just get the raw
    // price distance, which is the closest generic equivalent available.
    let pipMult = 1;
    if (s.market === 'forex') pipMult = /JPY/i.test(s.pair || '') ? 100 : 10000;
    const pips = +(rewardDist * pipMult).toFixed(1);
    return { pips, r_multiple: rMultiple, profit_percent: profitPercent };
  }

  window._sigOpenUpdateModal = function (id) {
    const s = _sigAll.find(x => x.id === id); if (!s) return;
    let overlay = document.getElementById('sig-update-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'sig-update-modal-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) window._sigCloseUpdateModal(); };
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = _sigUpdateModalContent(s);
    overlay.classList.add('open');
  };
  window._sigCloseUpdateModal = function () {
    const o = document.getElementById('sig-update-modal-overlay');
    if (o) o.classList.remove('open');
  };

  function _sigUpdateModalContent(s) {
    const options = _sigStageOptionsFor(s.status);
    const isTerminal = !options.length;
    return `
    <div class="modal modal-box" id="sig-update-modal-box" data-status="${s.status}" style="width:480px">
      <div class="modal-head">
        <div class="modal-title" style="display:flex;align-items:center;gap:10px">
          <span style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,rgba(52,211,153,0.25),rgba(52,211,153,0.12));border:1px solid rgba(52,211,153,0.3);display:flex;align-items:center;justify-content:center;font-size:14px">${icn('ic-notebook')}</span>
          Add Update — ${s.pair}
        </div>
        <button class="modal-close" onclick="_sigCloseUpdateModal()">${icn('ic-close')}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <span class="sig-body-text" style="margin:0">Current stage:</span>
          <span class="sig-badge sig-badge-${s.status}"><span class="dot"></span>${STATUS_LABEL[s.status] || s.status}</span>
        </div>
        ${isTerminal ? `
          <div class="sig-body-text" style="margin-bottom:16px">This signal is already ${STATUS_LABEL[s.status].toLowerCase()}. You can still log a note below, but the stage won't change.</div>
        ` : `
          <div class="form-label" style="margin-bottom:8px">Advance to</div>
          <div id="sig-stage-options" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">
            ${options.map(o => `<button type="button" class="sig-chip sig-stage-chip ${o.terminal ? 'sig-stage-chip-terminal' : ''}" data-stage="${o.key}" onclick="_sigPickStage('${o.key}')">${o.label}</button>`).join('')}
          </div>
          <div class="form-field" id="sig-close-outcome" style="display:none">
            <label class="form-label">Result — mark this trade as</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <button type="button" class="sig-chip sig-outcome-chip" data-outcome="win" onclick="_sigPickOutcome('win')">🏆 Winner</button>
              <button type="button" class="sig-chip sig-outcome-chip" data-outcome="loss" onclick="_sigPickOutcome('loss')">Loser</button>
              <button type="button" class="sig-chip sig-outcome-chip" data-outcome="breakeven" onclick="_sigPickOutcome('breakeven')">Breakeven</button>
            </div>
          </div>
        `}
        <div class="form-field"><label class="form-label">Price at this stage (optional)</label><input class="form-input" id="sig-update-price" type="number" step="any" placeholder="e.g. ${s.entry ?? ''}"></div>
        <div class="form-field"><label class="form-label">Note ${isTerminal ? '' : '(optional)'}</label><textarea class="form-textarea" id="sig-update-note" oninput="_sigUpdateSaveBtnState()" placeholder='e.g. "SL moved to breakeven", "Full TP hit +2R"'></textarea></div>
      </div>
      <div class="form-actions">
        <button class="glass-btn glass-btn-cancel" onclick="_sigCloseUpdateModal()">Cancel</button>
        <button class="btn btn-primary" id="sig-update-save-btn" ${isTerminal ? 'disabled' : ''} onclick="_sigSaveUpdate('${s.id}')">${icn('ic-check')} Save Update</button>
      </div>
    </div>`;
  }

  // Source of truth for "what's picked" is the DOM itself (whichever chip
  // has .active) rather than a separate JS variable, so the Save button's
  // enabled state and the actual save can never drift out of sync.
  window._sigPickStage = function (key) {
    document.querySelectorAll('#sig-stage-options .sig-stage-chip').forEach(el => el.classList.toggle('active', el.dataset.stage === key));
    // Closing a trade always needs an explicit Winner / Loser / Breakeven
    // call rather than silently inferring it from whatever stage the
    // signal happened to be at — that's what let a trade get "closed"
    // without ever letting the user actually say whether it won or lost.
    const outcomeWrap = document.getElementById('sig-close-outcome');
    if (outcomeWrap) {
      if (key === 'closed') {
        outcomeWrap.style.display = '';
        const curStatus = document.getElementById('sig-update-modal-box')?.dataset.status;
        const suggested = _sigCloseResultFor(curStatus).result;
        document.querySelectorAll('#sig-close-outcome .sig-outcome-chip').forEach(el => el.classList.toggle('active', el.dataset.outcome === suggested));
      } else {
        outcomeWrap.style.display = 'none';
        document.querySelectorAll('#sig-close-outcome .sig-outcome-chip').forEach(el => el.classList.remove('active'));
      }
    }
    window._sigUpdateSaveBtnState();
  };
  window._sigPickOutcome = function (key) {
    document.querySelectorAll('#sig-close-outcome .sig-outcome-chip').forEach(el => el.classList.toggle('active', el.dataset.outcome === key));
    window._sigUpdateSaveBtnState();
  };
  window._sigUpdateSaveBtnState = function () {
    const btn = document.getElementById('sig-update-save-btn');
    if (!btn) return;
    const pickedStage = document.querySelector('#sig-stage-options .sig-stage-chip.active')?.dataset.stage;
    const hasPick = !!pickedStage;
    const hasNote = !!(document.getElementById('sig-update-note')?.value || '').trim();
    if (pickedStage === 'closed') {
      // Closing requires a result — Winner, Loser, or Breakeven — before
      // the save button will enable, no matter what else is filled in.
      btn.disabled = !document.querySelector('#sig-close-outcome .sig-outcome-chip.active');
      return;
    }
    btn.disabled = !hasPick && !hasNote;
  };

  window._sigSaveUpdate = async function (id) {
    const s = _sigAll.find(x => x.id === id); if (!s) return;
    const options = _sigStageOptionsFor(s.status);
    const note = (document.getElementById('sig-update-note')?.value || '').trim();
    const priceRaw = document.getElementById('sig-update-price')?.value;
    const price = priceRaw ? parseFloat(priceRaw) : null;

    let chosen = null;
    if (options.length) {
      const pickedKey = document.querySelector('#sig-stage-options .sig-stage-chip.active')?.dataset.stage || null;
      chosen = options.find(o => o.key === pickedKey) || null;
      if (!chosen && !note) { showToast('Pick a stage to advance to, or add a note', 'error'); return; }
      if (chosen && chosen.status === 'closed' && !document.querySelector('#sig-close-outcome .sig-outcome-chip.active')) {
        showToast('Mark this trade as Winner, Loser, or Breakeven', 'error'); return;
      }
    } else if (!note) {
      showToast('Add a note for this update', 'error'); return;
    }

    let label = chosen ? chosen.label : 'Note added';
    if (chosen) {
      const priorStatus = s.status;
      let closeInfo = chosen.status === 'closed' ? _sigCloseResultFor(priorStatus) : null;
      if (chosen.status === 'closed') {
        // The user's explicit Winner/Loser/Breakeven pick always wins over
        // whatever the prior TP progress would have implied.
        const outcomeKey = document.querySelector('#sig-close-outcome .sig-outcome-chip.active')?.dataset.outcome;
        if (outcomeKey) {
          const outcomeLabel = outcomeKey === 'win' ? 'Closed — Winner' : outcomeKey === 'loss' ? 'Closed — Loser' : 'Closed at Breakeven';
          closeInfo = { result: outcomeKey, label: outcomeLabel };
        }
      }
      if (closeInfo) label = closeInfo.label;
      s.status = chosen.status;
      if (chosen.status === 'active' && !s.entered_at) s.entered_at = Date.now();
      // Hitting TP1 or TP2 already means the trade is a winner — reflect
      // that in the stats/badges right away instead of making the user
      // wait until they explicitly Close the signal to see it counted as
      // a win. (Closing later can still override this, e.g. if the
      // remainder gets stopped out at breakeven.)
      if (chosen.status === 'tp1_hit' || chosen.status === 'tp2_hit') {
        s.result = 'win';
        const math = _sigTradeMath(s, chosen.status, price);
        if (math.pips !== null) { s.pips = math.pips; s.r_multiple = math.r_multiple; s.profit_percent = math.profit_percent; }
      }
      // Only Cancelled and Close are terminal — that's the moment a signal
      // actually leaves "Ongoing" and gets a final win/loss/breakeven result.
      if (chosen.terminal) {
        s.closed_at = Date.now();
        s.result = closeInfo ? closeInfo.result : chosen.result;
        if (chosen.status === 'closed') {
          // Base the exit price on whichever outcome actually applies: a win
          // exits at whatever TP progress was made, a loss exits at the
          // stop-loss, breakeven exits at entry — unless a custom price was
          // typed in, which always wins.
          const mathStage = s.result === 'win'
            ? (priorStatus === 'tp2_hit' ? 'tp2_hit' : 'tp1_hit')
            : s.result === 'breakeven' ? 'breakeven' : 'stopped_out';
          const math = _sigTradeMath(s, mathStage, price);
          if (math.pips !== null) { s.pips = math.pips; s.r_multiple = math.r_multiple; s.profit_percent = math.profit_percent; }
        }
      }
    }
    s.updated_at = Date.now();

    const ok = await _sigPersistSignal(s);
    if (!ok) return; // save failed — error toast already shown, nothing changed on screen

    const logNote = note || label;
    _sigLogUpdate(id, s.status, logNote, price);
    _sigLogActivity(id, chosen ? 'status_changed' : 'update_added', logNote);
    _sigNotify(id, s.status, `${s.pair}: ${logNote}`);
    _sigRenderStats();
    _sigRenderActiveView();
    showToast(chosen ? label : 'Update added', chosen && s.result === 'loss' ? 'error' : 'success');
    window._sigCloseUpdateModal();
    if (document.getElementById('signal-drawer')?.classList.contains('open')) window._sigOpenDrawer(id);
  };

  window._sigCopyDetails = function (id) {
    const s = _sigAll.find(x => x.id === id);
    if (!s) return;
    const text = `${s.pair} ${s.direction.toUpperCase()} (${ORDER_TYPE_LABEL[s.order_type] || 'Market Execution'})\nEntry: ${_fmtNum(s.entry)}\nSL: ${_fmtNum(s.stop_loss)}\nTP1: ${_fmtNum(s.tp1)}  TP2: ${_fmtNum(s.tp2)}\nRR: 1:${s.risk_reward}\nConfidence: ${CONF_LABEL[s.confidence]} (${s.confidence_score}%)\nSession: ${(s.session || '').replace('_', '/')}`;
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
    const text = `NxTGen Signal — ${s.pair} ${s.direction.toUpperCase()}\n\nStatus: ${STATUS_LABEL[s.status]}\nOrder Type: ${ORDER_TYPE_LABEL[s.order_type] || 'Market Execution'}\nEntry: ${_fmtNum(s.entry)}\nStop Loss: ${_fmtNum(s.stop_loss)}\nTP1/TP2: ${_fmtNum(s.tp1)} / ${_fmtNum(s.tp2)}\nRisk:Reward: 1:${s.risk_reward}\nConfidence: ${CONF_LABEL[s.confidence]} (${s.confidence_score}%)\nSession: ${(s.session || '').replace('_', '/')}\n\nMarket outlook:\n${s.market_outlook || '—'}\n\nInvalidation:\n${s.invalidation || '—'}\n`;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${s.pair}-signal-${s.id.slice(0, 6)}.txt`;
    a.click();
    showToast('Signal summary exported', 'success');
  };

  window._sigDelete = async function (id) {
    if (!confirm('Delete this signal? This cannot be undone.')) return;
    const s = _sigAll.find(x => x.id === id);
    if (_sigUsingSupabase && typeof sb !== 'undefined' && sb && _sigIsDbId(id)) {
      const { error } = await sb.from('journal_signals').delete().eq('id', id).eq('owner_id', _currentUser ? _currentUser.id : null);
      if (error) { console.error('delete signal error:', error.message); showToast('Delete failed: ' + error.message, 'error'); return; }
      _sigLogActivity(id, 'deleted', s ? `${s.pair} deleted` : null);
    }
    _sigAll = _sigAll.filter(x => x.id !== id);
    if (!_sigUsingSupabase) _saveDemoSignals();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Signal deleted', 'success');
  };

  // ══════════════════════════════════════════════════════════════
  // NEW SIGNAL MODAL
  // ══════════════════════════════════════════════════════════════
  let _sigModalState = { mode: 'new', editId: null, draftId: null, dirty: false, timer: null, savedAt: null };

  window._sigOpenModal = function (mode, id) {
    mode = mode || 'new';
    let overlay = document.getElementById('sig-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'sig-modal-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) window._sigCloseModal(); };
      document.body.appendChild(overlay);
    }
    const existing = mode === 'edit' ? _sigAll.find(s => s.id === id) : null;
    _sigModalState = { mode: mode === 'edit' ? 'edit' : 'new', editId: existing ? existing.id : null, draftId: existing && existing.is_draft ? existing.id : null, dirty: false, timer: null, savedAt: null };
    _sigPendingScreenshotDataUrl = null;
    overlay.innerHTML = _sigModalContent(existing);
    overlay.classList.add('open');
    _sigBindAutosave();
    if (_sigModalState.timer) clearInterval(_sigModalState.timer);
    _sigModalState.timer = setInterval(_sigAutosaveTick, 4000);
  };
  window._sigCloseModal = function () {
    const o = document.getElementById('sig-modal-overlay');
    if (o) o.classList.remove('open');
    if (_sigModalState.timer) { clearInterval(_sigModalState.timer); _sigModalState.timer = null; }
  };

  let _sigPendingScreenshotDataUrl = null;

  function _sigBindAutosave() {
    const body = document.querySelector('#sig-modal-overlay .modal-body');
    if (!body) return;
    body.addEventListener('input', () => { _sigModalState.dirty = true; _sigSetAutosaveLabel('Unsaved changes'); }, { passive: true });
    const fileInput = document.getElementById('sf-chart');
    if (fileInput) fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showToast('Screenshot must be under 2MB', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => { _sigPendingScreenshotDataUrl = reader.result; _sigModalState.dirty = true; _sigSetAutosaveLabel('Unsaved changes'); showToast('Screenshot attached', 'success'); };
      reader.readAsDataURL(file);
    });
  }
  function _sigSetAutosaveLabel(text) {
    const el = document.getElementById('sig-autosave-status');
    if (el) el.textContent = text;
  }
  async function _sigAutosaveTick() {
    // Only silently autosave brand-new signals or drafts already in progress —
    // never auto-drafts a signal that's currently live/published.
    if (!_sigModalState.dirty) return;
    if (_sigModalState.mode === 'edit' && _sigModalState.editId && !_sigModalState.draftId) return;
    const pairVal = document.getElementById('sf-pair')?.value;
    if (!pairVal) return; // nothing worth saving yet
    _sigSetAutosaveLabel('Saving…');
    const row = _sigCollectFormRow();
    let ok;
    if (_sigModalState.draftId) {
      const existing = _sigAll.find(s => s.id === _sigModalState.draftId);
      Object.assign(existing, row, { id: _sigModalState.draftId, is_draft: true, status: 'draft', updated_at: Date.now() });
      ok = await _sigPersistSignal(existing, true);
    } else if (_sigModalState.pendingDraft) {
      // A previous autosave attempt failed before Supabase assigned a real
      // id, so draftId is still null. Reuse that same in-memory row instead
      // of unshifting another one — otherwise every failed retry tick stacks
      // up a new ghost draft that was never actually persisted.
      const draft = _sigModalState.pendingDraft;
      Object.assign(draft, row, { updated_at: Date.now() });
      ok = await _sigCloudSave(draft, true);
      if (ok) { _sigModalState.draftId = draft.id; _sigModalState.pendingDraft = null; _sigLogActivity(draft.id, 'created', 'Draft autosaved'); }
    } else {
      const draft = { ...row, id: null, is_draft: true, status: 'draft', created_at: Date.now(), updated_at: Date.now(),
        published_at: null, result: 'pending', pips: null, profit_percent: null, r_multiple: null,
        edited_at: null, edited_by: null, version_history: [], checklist: [], comments: [] };
      _sigAll.unshift(draft);
      ok = await _sigCloudSave(draft, true);
      if (ok) { _sigModalState.draftId = draft.id; _sigLogActivity(draft.id, 'created', 'Draft autosaved'); }
      else { _sigModalState.pendingDraft = draft; }
    }
    _sigModalState.dirty = false;
    if (!ok) { _sigSetAutosaveLabel('Save failed — will retry'); return; }
    _sigModalState.savedAt = Date.now();
    _sigSetAutosaveLabel('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const badge = document.getElementById('sig-drafts-tab-count');
    if (badge) badge.textContent = _sigAll.filter(s => s.is_draft && !s.archived).length || '';
  }

  function _sigModalContent(existing) {
    const s = existing || {};
    const isEdit = _sigModalState.mode === 'edit';
    const opt = (val, cur) => val === cur ? 'selected' : '';
    return `
    <div class="modal modal-box" style="width:760px">
      <div class="modal-head">
        <div class="modal-title" style="display:flex;align-items:center;gap:10px">
          <span style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,rgba(96,165,250,0.25),rgba(96,165,250,0.12));border:1px solid rgba(96,165,250,0.3);display:flex;align-items:center;justify-content:center;font-size:14px">${isEdit ? icn('ic-edit') : '+'}</span>
          ${isEdit ? 'Edit Signal' : 'New Signal'}
          ${isEdit && s.edited_at ? '<span class="sig-edited-badge">Edited</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span id="sig-autosave-status" class="sig-autosave-status">${isEdit && !_sigModalState.draftId ? '' : 'Draft autosaves as you type'}</span>
          <button class="modal-close" onclick="_sigCloseModal()">${icn('ic-close')}</button>
        </div>
      </div>
      <div class="modal-body">
        ${!isEdit ? `
        <div class="sig-template-bar">
          <button type="button" class="glass-btn glass-btn-cancel" onclick="_sigUseLastSignal()">${icn('ic-copy')} Use Last Signal</button>
          <button type="button" class="glass-btn glass-btn-cancel" onclick="_sigOpenTemplatePicker(event)">${icn('ic-notebook')} Create from Template</button>
          <button type="button" class="glass-btn glass-btn-cancel" onclick="_sigSaveAsTemplate()">${icn('ic-save')} Save as Template</button>
        </div>` : ''}
        <div class="form-grid">
          <div class="form-field"><label class="form-label">Pair</label><input class="form-input" id="sf-pair" placeholder="EURUSD" value="${s.pair || ''}"></div>
          <div class="form-field"><label class="form-label">Market</label>
            <select class="form-select" id="sf-market">
              ${Object.entries(MARKET_LABEL).map(([k, v]) => `<option value="${k}" ${opt(k, s.market)}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-field"><label class="form-label">Direction</label>
            <select class="form-select" id="sf-direction" onchange="_sigAutoCalcTp1()"><option value="buy" ${opt('buy', s.direction)}>🟢 BUY</option><option value="sell" ${opt('sell', s.direction)}>🔴 SELL</option></select>
          </div>
          <div class="form-field"><label class="form-label">Order Type</label>
            <select class="form-select" id="sf-ordertype">
              ${Object.entries(ORDER_TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${opt(k, s.order_type || 'market')}>${v}${PENDING_ORDER_TYPES.includes(k) ? ' (Pending)' : ''}</option>`).join('')}
            </select>
          </div>

          <div class="form-field"><label class="form-label">Entry</label><input class="form-input" id="sf-entry" type="number" step="any" value="${s.entry ?? ''}" onblur="_sigAutoCalcTp1()"></div>
          <div class="form-field"><label class="form-label">Stop Loss</label><input class="form-input" id="sf-sl" type="number" step="any" value="${s.stop_loss ?? ''}" onblur="_sigAutoCalcTp1()"></div>
          <div class="form-field">
            <label class="form-label">Take Profit 1</label>
            <input class="form-input" id="sf-tp1" type="number" step="any" value="${s.tp1 ?? ''}">
            <div class="sig-form-hint">${icn('ic-info')} TP1 is always a fixed 1:2 risk:reward — auto‑filled from Entry &amp; Stop Loss, but you can override it.</div>
          </div>
          <div class="form-field">
            <label class="form-label">Take Profit 2</label>
            <input class="form-input" id="sf-tp2" type="number" step="any" value="${s.tp2 ?? ''}">
            <div class="sig-form-hint">${icn('ic-info')} TP2 is any extended target — it just needs to be higher reward than 1:2.</div>
          </div>
          <div class="form-field"><label class="form-label">Risk %</label><input class="form-input" id="sf-riskpct" type="number" step="any" value="${s.risk_percent ?? 1}"></div>

          <div class="form-field"><label class="form-label">Confidence</label>
            <select class="form-select" id="sf-confidence">
              <option value="low" ${opt('low', s.confidence)}>Low</option><option value="medium" ${(s.confidence ? opt('medium', s.confidence) : 'selected')}>Medium</option><option value="high" ${opt('high', s.confidence)}>High</option><option value="very_high" ${opt('very_high', s.confidence)}>Very High</option>
            </select>
          </div>
          <div class="form-field"><label class="form-label">Confidence Score %</label><input class="form-input" id="sf-confscore" type="number" min="0" max="100" value="${s.confidence_score ?? 75}"></div>
          <div class="form-field"><label class="form-label">Session</label>
            <select class="form-select" id="sf-session">
              <option value="sydney" ${opt('sydney', s.session)}>Sydney</option><option value="tokyo" ${opt('tokyo', s.session)}>Tokyo</option><option value="london" ${opt('london', s.session)}>London</option>
              <option value="new_york" ${opt('new_york', s.session)}>New York</option><option value="london_ny_overlap" ${opt('london_ny_overlap', s.session)}>London/NY Overlap</option>
            </select>
          </div>
          <div class="form-field"><label class="form-label">Visibility</label>
            <select class="form-select" id="sf-visibility"><option value="public" ${opt('public', s.visibility)}>Public</option><option value="premium" ${opt('premium', s.visibility)}>Premium</option><option value="private" ${opt('private', s.visibility)}>Private</option></select>
          </div>

          <div class="form-field full"><label class="form-label">Management Rules</label><textarea class="form-textarea" id="sf-mgmt">${s.management_rules || ''}</textarea></div>
          <div class="form-field full"><label class="form-label">Notes</label><textarea class="form-textarea" id="sf-notes" placeholder="Private notes — not shown publicly">${s.notes || ''}</textarea></div>
          <div class="form-field"><label class="form-label">Tags</label><input class="form-input" id="sf-tags" placeholder="breakout, htf-bias, news" value="${(s.tags || []).join(', ')}"></div>
          <div class="form-field"><label class="form-label">TradingView Link</label><input class="form-input" id="sf-tvlink" placeholder="https://tradingview.com/…" value="${s.tradingview_link || ''}"></div>
          <div class="form-field"><label class="form-label">Chart Screenshot</label><input class="form-input" id="sf-chart" type="file" accept="image/*">${s.chart_screenshot_url ? '<div class="sig-existing-shot">✓ Screenshot attached</div>' : ''}</div>
        </div>
      </div>
      <div class="form-actions">
        <button class="glass-btn glass-btn-cancel" onclick="_sigCloseModal()">Cancel</button>
        ${isEdit && !s.is_draft ? `
          <button class="glass-btn glass-btn-cancel" onclick="_sigDuplicateSignal('${s.id}');_sigCloseModal()">${icn('ic-copy')} Duplicate</button>
          <button class="glass-btn glass-btn-cancel" onclick="_sigSaveEditAsDraft()">${icn('ic-save')} Save as Draft</button>
          <button class="btn btn-primary" onclick="_sigUpdateSignal()">${icn('ic-check')} Update &amp; Republish</button>
        ` : `
          <button class="glass-btn glass-btn-cancel" onclick="_sigSaveDraftNow()">${icn('ic-save')} Save Draft</button>
          <button class="btn btn-primary" onclick="_sigOpenReviewModal()">${icn('ic-eye')} Review &amp; Publish</button>
        `}
      </div>
    </div>`;
  }

  // TP1 is always a fixed 1:2 risk:reward. As soon as Entry + Stop Loss (and
  // Direction) are known, quietly fill TP1 in for the person — but only if
  // they haven't already typed their own value in, so this never clobbers
  // a deliberate override.
  window._sigAutoCalcTp1 = function () {
    const tp1El = document.getElementById('sf-tp1');
    if (!tp1El || tp1El.value) return;
    const entry = parseFloat(document.getElementById('sf-entry')?.value);
    const sl = parseFloat(document.getElementById('sf-sl')?.value);
    const dir = document.getElementById('sf-direction')?.value;
    if (isNaN(entry) || isNaN(sl) || entry === sl) return;
    const dist = Math.abs(entry - sl) * 2;
    const tp1 = dir === 'sell' ? entry - dist : entry + dist;
    tp1El.value = +tp1.toFixed(6);
    _sigModalState.dirty = true;
    _sigSetAutosaveLabel('Unsaved changes');
  };

  function _sigCollectFormRow() {
    const val = id => document.getElementById(id)?.value;
    const pair = (val('sf-pair') || '').trim().toUpperCase();
    const entry = parseFloat(val('sf-entry'));
    const sl = parseFloat(val('sf-sl'));
    // Furthest configured target sets the headline RR — TP2 if it's set (it's
    // meant to extend beyond the fixed 1:2 of TP1), otherwise TP1 itself.
    const finalTp = parseFloat(val('sf-tp2')) || parseFloat(val('sf-tp1')) || entry || 0;
    const rr = (entry && sl && Math.abs(entry - sl)) ? +(Math.abs(finalTp - entry) / Math.abs(entry - sl)).toFixed(1) : 0;
    let screenshot = _sigPendingScreenshotDataUrl;
    if (!screenshot) {
      const cur = _sigAll.find(s => s.id === (_sigModalState.draftId || _sigModalState.editId));
      screenshot = cur ? (cur.chart_screenshot_url || null) : null;
    }
    return {
      pair, market: val('sf-market'), direction: val('sf-direction'), order_type: val('sf-ordertype') || 'market',
      entry: isNaN(entry) ? null : entry, stop_loss: isNaN(sl) ? null : sl,
      tp1: parseFloat(val('sf-tp1')) || null, tp2: parseFloat(val('sf-tp2')) || null,
      risk_reward: rr, risk_percent: parseFloat(val('sf-riskpct')) || null,
      confidence: val('sf-confidence'), confidence_score: parseInt(val('sf-confscore')) || 0,
      session: val('sf-session'),
      visibility: val('sf-visibility'),
      management_rules: val('sf-mgmt') || '',
      notes: val('sf-notes') || '', tags: (val('sf-tags') || '').split(',').map(t => t.trim()).filter(Boolean),
      tradingview_link: val('sf-tvlink') || '', chart_screenshot_url: screenshot
    };
  }

  function _sigValidateRow(row) {
    if (!row.pair || row.entry == null || row.stop_loss == null) { showToast('Pair, Entry and Stop Loss are required', 'error'); return false; }
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // TEMPLATES — "Use Last Signal" / "Create from Template"
  // Carries over everything EXCEPT the trade-specific fields
  // (pair, entry, stop loss, take profits, RR, notes).
  // ══════════════════════════════════════════════════════════════
  function _sigApplyKeepFields(f) {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
    set('sf-riskpct', f.risk_percent);
    set('sf-confidence', f.confidence);
    set('sf-confscore', f.confidence_score);
    set('sf-session', f.session);
    set('sf-ordertype', f.order_type);
    set('sf-visibility', f.visibility);
    set('sf-mgmt', f.management_rules);
    set('sf-tags', (f.tags || []).join(', '));
    _sigModalState.dirty = true;
    _sigSetAutosaveLabel('Unsaved changes');
  }

  window._sigUseLastSignal = function () {
    const last = _sigAll.find(s => !s.is_draft);
    if (!last) { showToast('No previous signal to copy from yet', 'info'); return; }
    _sigApplyKeepFields(last);
    showToast('Copied settings from your last signal — fill in the trade-specific details', 'success');
  };

  window._sigSaveAsTemplate = async function () {
    if (!(_sigUsingSupabase && typeof sb !== 'undefined' && sb) || !_currentUser) { showToast('Connect Supabase to save templates', 'error'); return; }
    const name = prompt('Name this template (e.g. "Standard 1% risk setup"):');
    if (!name || !name.trim()) return;
    const row = _sigCollectFormRow();
    const payload = {
      risk_percent: row.risk_percent, confidence: row.confidence, confidence_score: row.confidence_score,
      session: row.session, order_type: row.order_type, visibility: row.visibility,
      management_rules: row.management_rules, tags: row.tags
    };
    const { error } = await sb.from('journal_signal_templates').insert({ owner_id: _currentUser.id, name: name.trim(), payload });
    if (error) { console.error('save template error:', error.message); showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Template saved', 'success');
  };

  window._sigOpenTemplatePicker = async function (ev) {
    if (ev) ev.stopPropagation();
    document.getElementById('sig-template-menu')?.remove();
    if (!(_sigUsingSupabase && typeof sb !== 'undefined' && sb) || !_currentUser) { showToast('Connect Supabase to use templates', 'error'); return; }
    const { data, error } = await sb.from('journal_signal_templates').select('*').eq('owner_id', _currentUser.id).order('created_at', { ascending: false }).limit(20);
    if (error) { showToast('Could not load templates', 'error'); return; }
    if (!data || !data.length) { showToast('No saved templates yet — use "Save as Template" first', 'info'); return; }
    const menu = document.createElement('div');
    menu.id = 'sig-template-menu';
    menu.className = 'sig-actions-menu';
    menu.innerHTML = data.map(t => `<button onclick="_sigApplyTemplateById('${t.id}');document.getElementById('sig-template-menu')?.remove()">${icn('ic-notebook')}${t.name}</button>`).join('');
    document.body.appendChild(menu);
    window._sigTemplateCache = data;
    const rect = ev.target.closest('button').getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 6) + 'px';
    setTimeout(() => document.addEventListener('click', function once(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', once); }
    }), 0);
  };
  window._sigApplyTemplateById = function (id) {
    const t = (window._sigTemplateCache || []).find(x => x.id === id);
    if (!t) return;
    _sigApplyKeepFields(t.payload || {});
    showToast(`Applied template "${t.name}"`, 'success');
  };

  window._sigSaveDraftNow = async function () {
    const row = _sigCollectFormRow();
    if (!row.pair) { showToast('Give it at least a pair before saving', 'error'); return; }
    let ok, id;
    if (_sigModalState.draftId) {
      const existing = _sigAll.find(s => s.id === _sigModalState.draftId);
      Object.assign(existing, row, { is_draft: true, status: 'draft', updated_at: Date.now() });
      ok = await _sigPersistSignal(existing);
      id = existing.id;
    } else {
      const draft = { ...row, id: null, is_draft: true, status: 'draft', created_at: Date.now(), updated_at: Date.now(),
        published_at: null, result: 'pending', pips: null, profit_percent: null, r_multiple: null,
        edited_at: null, edited_by: null, version_history: [], checklist: [], comments: [] };
      _sigAll.unshift(draft);
      ok = await _sigCloudSave(draft);
      id = draft.id;
      if (!ok) _sigAll = _sigAll.filter(x => x !== draft);
    }
    if (!ok) return; // error toast already shown; keep the modal open so nothing is lost
    if (id) _sigLogActivity(id, 'created', 'Draft saved');
    _sigCloseModal();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Draft saved', 'success');
  };

  window._sigSaveEditAsDraft = async function () {
    const s = _sigAll.find(x => x.id === _sigModalState.editId);
    if (!s) return;
    Object.assign(s, _sigCollectFormRow(), { is_draft: true, status: 'draft', updated_at: Date.now() });
    const ok = await _sigPersistSignal(s);
    if (!ok) return;
    _sigLogActivity(s.id, 'unpublished', 'Moved back to drafts');
    _sigCloseModal();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Moved back to Drafts', 'info');
  };

  window._sigUpdateSignal = async function () {
    const s = _sigAll.find(x => x.id === _sigModalState.editId);
    if (!s) return;
    const row = _sigCollectFormRow();
    if (!_sigValidateRow(row)) return;
    const prevOrderType = s.order_type;
    const wasPending = PENDING_ORDER_TYPES.includes(prevOrderType);
    Object.assign(s, row, { updated_at: Date.now(), edited_at: Date.now(), edited_by: 'You' });
    const isPendingNow = PENDING_ORDER_TYPES.includes(s.order_type);
    // Order type can change on edit (e.g. Buy Limit -> Market Execution).
    // A signal still sitting at "waiting" needs to follow that — Market
    // Execution fills the instant it's live, so leaving status untouched
    // here was stranding edited signals on "waiting" forever (still
    // showing only "Entry Triggered / Cancelled" as Add Update options)
    // even though their order type — and the timeline UI — said otherwise.
    if (wasPending && !isPendingNow && s.status === 'waiting') {
      s.status = 'active';
      if (!s.entered_at) s.entered_at = Date.now();
    }
    s.version_history = s.version_history || [];
    s.version_history.push({ ts: Date.now(), note: 'Signal updated & republished' });
    const ok = await _sigPersistSignal(s);
    if (!ok) return;
    _sigLogUpdate(s.id, s.status, 'Signal edited');
    _sigLogActivity(s.id, 'edited', 'Signal updated & republished');
    _sigNotify(s.id, 'edited', `${s.pair} signal was edited`);
    _sigCloseModal();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Signal updated', 'success');
  };

  // ── Publishing review workflow ──────────────────────────────────
  window._sigOpenReviewModal = function (draftId) {
    // Called either from the edit form (uses current unsaved form values)
    // or directly from the Drafts workspace (uses the stored draft row).
    let row, sourceDraft = null;
    if (draftId) {
      sourceDraft = _sigAll.find(s => s.id === draftId);
      if (!sourceDraft) return;
      row = { ...sourceDraft };
    } else {
      row = _sigCollectFormRow();
      if (!_sigValidateRow(row)) return;
      sourceDraft = _sigModalState.draftId ? _sigAll.find(s => s.id === _sigModalState.draftId) : null;
    }
    window._sigPendingPublish = { row, draftId: sourceDraft ? sourceDraft.id : null };
    let overlay = document.getElementById('sig-review-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'sig-review-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) window._sigCloseReviewModal(); };
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = _sigReviewModalContent(row);
    overlay.classList.add('open');
  };
  window._sigCloseReviewModal = function () {
    const o = document.getElementById('sig-review-overlay');
    if (o) o.classList.remove('open');
  };

  function _sigReviewModalContent(row) {
    const expectedProfit = ((row.risk_percent || 1) * (row.risk_reward || 0)).toFixed(2);
    return `
    <div class="modal modal-box" style="width:560px">
      <div class="modal-head">
        <div class="modal-title">${icn('ic-eye')} Review &amp; Publish</div>
        <button class="modal-close" onclick="_sigCloseReviewModal()">${icn('ic-close')}</button>
      </div>
      <div class="modal-body">
        <div class="sig-review-head">
          <div class="sig-review-pair">${row.pair || '—'} <span class="sig-dir-badge ${row.direction}">${row.direction === 'buy' ? 'BUY' : 'SELL'}</span></div>
          <span class="sig-market-badge">${icn(MARKET_ICON[row.market] || 'ic-globe')}${MARKET_LABEL[row.market] || row.market}</span>
          ${_sigOrderTypeBadge(row)}
        </div>
        <div class="sig-review-ladder">
          <div><span>Entry</span><strong class="sig-mono">${_fmtNum(row.entry)}</strong></div>
          <div><span>Stop Loss</span><strong class="sig-mono" style="color:var(--red)">${_fmtNum(row.stop_loss)}</strong></div>
          <div><span>TP1</span><strong class="sig-mono" style="color:var(--green)">${_fmtNum(row.tp1)}</strong></div>
          <div><span>TP2</span><strong class="sig-mono" style="color:var(--green)">${_fmtNum(row.tp2)}</strong></div>
        </div>
        <div class="sig-review-stats">
          <div class="sig-review-stat"><span>Risk : Reward</span><strong>1:${row.risk_reward || 0}</strong></div>
          <div class="sig-review-stat"><span>Risk</span><strong>${row.risk_percent || 0}%</strong></div>
          <div class="sig-review-stat"><span>Confidence</span><strong>${CONF_LABEL[row.confidence] || '—'} (${row.confidence_score || 0}%)</strong></div>
          <div class="sig-review-stat"><span>Expected Profit</span><strong class="sig-pips-pos">+${expectedProfit}%</strong></div>
        </div>
        ${row.market_outlook ? `<div class="sig-section-title" style="margin-top:14px">${icn('ic-chart-line')} Market Outlook</div><div class="sig-body-text">${row.market_outlook}</div>` : ''}
        <div id="sig-schedule-row" class="sig-schedule-row" style="display:none">
          <input type="datetime-local" id="sig-schedule-input" class="form-input">
          <button class="btn btn-primary" onclick="_sigConfirmSchedule()">${icn('ic-clock')} Confirm Schedule</button>
        </div>
      </div>
      <div class="form-actions">
        <button class="glass-btn glass-btn-cancel" onclick="_sigCloseReviewModal()">Cancel</button>
        <button class="glass-btn glass-btn-cancel" onclick="_sigReviewSaveDraft()">${icn('ic-save')} Save Draft</button>
        <button class="glass-btn glass-btn-cancel" onclick="_sigToggleScheduleRow()">${icn('ic-calendar')} Schedule</button>
        <button class="btn btn-primary" onclick="_sigConfirmPublish()">${icn('ic-check')} Publish Now</button>
      </div>
    </div>`;
  }

  window._sigToggleScheduleRow = function () {
    const el = document.getElementById('sig-schedule-row');
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
  };

  function _sigFinalizePublishedRow(row, extra) {
    // Market Execution fills the instant it's published — the trade is
    // live right away. Pending orders (Buy/Sell Limit or Stop) sit resting
    // in the market until price reaches the entry, so only those start out
    // "Waiting". This is also why the "Waiting" filter/stat only ever
    // shows pending orders, not live market fills.
    const status = PENDING_ORDER_TYPES.includes(row.order_type) ? 'waiting' : 'active';
    return { ...row, status, is_draft: false, published_at: Date.now(),
      entered_at: status === 'active' ? Date.now() : null,
      result: row.result || 'pending', pips: row.pips ?? null, profit_percent: row.profit_percent ?? null, r_multiple: row.r_multiple ?? null,
      checklist: row.checklist || [], comments: row.comments || [], version_history: row.version_history || [],
      ...extra };
  }

  window._sigConfirmPublish = async function () {
    const pending = window._sigPendingPublish; if (!pending) return;
    const final = _sigFinalizePublishedRow(pending.row);
    let ok, id;
    if (pending.draftId) {
      const existing = _sigAll.find(s => s.id === pending.draftId);
      Object.assign(existing, final, { id: pending.draftId, created_at: existing.created_at });
      ok = await _sigPersistSignal(existing);
      id = existing.id;
    } else {
      const created = { ...final, id: null, created_at: Date.now(), updated_at: Date.now(), edited_at: null, edited_by: null };
      _sigAll.unshift(created);
      ok = await _sigCloudSave(created);
      id = created.id;
      if (!ok) _sigAll = _sigAll.filter(x => x !== created);
    }
    if (!ok) return; // error toast already shown by _sigCloudSave — keep the review modal open, nothing is lost
    _sigLogUpdate(id, final.status, final.status === 'active' ? 'Signal published — entry triggered (market execution)' : 'Signal published — waiting for entry');
    _sigLogActivity(id, pending.draftId ? 'published' : 'created', 'Published live');
    _sigNotify(id, 'published', `${final.pair} ${final.direction === 'buy' ? 'BUY' : 'SELL'} signal published`);
    // Requirement: never trust local state alone — reload the live list
    // straight from the database so what's on screen matches what's saved.
    _sigAll = await _loadSignals();
    _sigCloseReviewModal();
    _sigCloseModal();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Signal published', 'success');
  };

  window._sigConfirmSchedule = async function () {
    const pending = window._sigPendingPublish; if (!pending) return;
    const dtVal = document.getElementById('sig-schedule-input')?.value;
    if (!dtVal) { showToast('Pick a date & time first', 'error'); return; }
    const ts = new Date(dtVal).getTime();
    if (isNaN(ts) || ts <= Date.now()) { showToast('Schedule time must be in the future', 'error'); return; }
    const final = { ...pending.row, status: 'scheduled', is_draft: false, scheduled_at: ts, published_at: null,
      result: 'pending', pips: null, profit_percent: null, r_multiple: null, checklist: pending.row.checklist || [], comments: pending.row.comments || [] };
    let ok, id;
    if (pending.draftId) {
      const existing = _sigAll.find(s => s.id === pending.draftId);
      Object.assign(existing, final, { id: pending.draftId, created_at: existing.created_at });
      ok = await _sigPersistSignal(existing);
      id = existing.id;
    } else {
      const created = { ...final, id: null, created_at: Date.now(), updated_at: Date.now(), version_history: [] };
      _sigAll.unshift(created);
      ok = await _sigCloudSave(created);
      id = created.id;
      if (!ok) _sigAll = _sigAll.filter(x => x !== created);
    }
    if (!ok) return;
    _sigLogActivity(id, 'scheduled', 'Scheduled for ' + new Date(ts).toLocaleString());
    _sigAll = await _loadSignals();
    _sigCloseReviewModal();
    _sigCloseModal();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Signal scheduled for ' + new Date(ts).toLocaleString(), 'success');
  };

  window._sigReviewSaveDraft = async function () {
    const pending = window._sigPendingPublish; if (!pending) return;
    const row = { ...pending.row, is_draft: true, status: 'draft', updated_at: Date.now() };
    let ok, id;
    if (pending.draftId) {
      const existing = _sigAll.find(s => s.id === pending.draftId);
      Object.assign(existing, row, { id: pending.draftId, created_at: existing.created_at });
      ok = await _sigPersistSignal(existing);
      id = existing.id;
    } else {
      const created = { ...row, id: null, created_at: Date.now(), version_history: [], checklist: [], comments: [] };
      _sigAll.unshift(created);
      ok = await _sigCloudSave(created);
      id = created.id;
      if (!ok) _sigAll = _sigAll.filter(x => x !== created);
    }
    if (!ok) return;
    _sigLogActivity(id, 'created', 'Saved as draft');
    _sigCloseReviewModal();
    _sigCloseModal();
    _sigRenderStats();
    _sigRenderActiveView();
    showToast('Saved as draft', 'success');
  };

  // Periodically promote scheduled signals whose time has arrived.
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    _sigAll.forEach(s => {
      if (s.status === 'scheduled' && s.scheduled_at && s.scheduled_at <= now) {
        const status = PENDING_ORDER_TYPES.includes(s.order_type) ? 'waiting' : 'active';
        s.status = status; s.published_at = now; s.entered_at = status === 'active' ? now : null; changed = true;
        _sigPersistSignal(s);
      }
    });
    if (changed) { _sigRenderStats(); _sigRenderActiveView(); showToast('A scheduled signal just went live', 'info'); }
  }, 30000);

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
