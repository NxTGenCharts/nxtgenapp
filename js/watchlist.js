// ══ NxTGen Journal — watchlist.js (original app.js lines 4491-7871) ══

// ── WATCHLIST ─────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// ██     ██  █████  ████████  ██████ ██   ██ ██      ██ ███████ ████████
// ██     ██ ██   ██    ██    ██      ██   ██ ██      ██ ██         ██
// ██  █  ██ ███████    ██    ██      ███████ ██      ██ ███████    ██
// ██ ███ ██ ██   ██    ██    ██      ██   ██ ██      ██      ██    ██
//  ███ ███  ██   ██    ██     ██████ ██   ██ ███████ ██ ███████    ██
// ═══════════════════════════════════════════════════════════════════
//  Per-user watchlist stored in Supabase: journal_watchlist table
//  Schema: { id, user_id, quarter, week_label, week_date, dxy_bias,
//            market_bias, pairs (jsonb), checklist (jsonb), created_at }
// ═══════════════════════════════════════════════════════════════════

let _wlData = [];          // all watchlist weeks for this user
let _wlActiveQ = null;     // e.g. "2026-Q2"
let _wlActiveWeekId = null;

const _WL_PAIRS_DEFAULT = ['GBPUSD','XAUUSD','EURUSD','GBPJPY','USDCAD','NASDAQ','ES'];
const _WL_TFS = ['Weekly','Daily','4H','1H','30m','15m'];
const _WL_BIAS_OPTS = ['bull','bear','neu'];

/* ══════════════════════════════════════════════════════════════════
   WATCHLIST v2 — Institutional Prep Workspace
   Liquidity checklist items, models, stage timeline, chart tags.
   All of this lives inside the existing `pairs` / `checklist` JSONB
   columns already on journal_watchlist — no schema changes needed.
   ══════════════════════════════════════════════════════════════════ */
const _WL_LIQ_ITEMS = [
  { k: 'eqHighs',  l: 'Equal Highs' },
  { k: 'eqLows',   l: 'Equal Lows' },
  { k: 'sweep',    l: 'Liquidity Sweep' },
  { k: 'fvg',      l: 'FVG' },
  { k: 'ob',       l: 'Order Block' },
  { k: 'breaker',  l: 'Breaker' },
  { k: 'mss',      l: 'MSS' },
  { k: 'bos',      l: 'BOS' },
  { k: 'pdArray',  l: 'PD Array' },
];
// Pulls the live list of models from the Playbook page's "Manage Models"
// data (_pbData.models) instead of a hardcoded list, so the Watchlist's
// model dropdowns always stay in sync with whatever the user has defined
// on the Playbook. Falls back to 'Custom' only if no models exist yet.
function _WL_MODELS() {
  const active = (_pbData.models || []).filter(m => m.status !== 'archived' && m.status !== 'deleted');
  const names = active.map(m => m.strategyName || m.title).filter(Boolean);
  return names.length ? [...names, 'Custom'] : ['Custom'];
}
const _WL_DIRECTIONS = ['long','short','wait'];
const _WL_STAGES = ['Weekly','Daily','4H','1H','Execution'];
const _WL_CHART_TAGS = ['Weekly','Daily','4H','1H','Entry','Results'];

function _wlEmptyLiq() {
  const o = {};
  _WL_LIQ_ITEMS.forEach(i => o[i.k] = false);
  return o;
}

/* Fill in any fields missing from legacy pair rows. Mutates + returns p. */
function _wlNormPair(p) {
  if (p.confidence == null) p.confidence = 50;
  if (!p.direction) p.direction = 'wait';
  if (p.expectedMove == null) p.expectedMove = '';
  if (p.risk == null) p.risk = 0;
  if (!p.model) p.model = '';
  if (!p.liq) p.liq = _wlEmptyLiq();
  if (!p.charts) p.charts = [];
  p.charts.forEach(c => { if (!c.tag) c.tag = ''; });
  if (!p.stages) {
    p.stages = {};
    _WL_STAGES.forEach(s => {
      const tfBias = (p.tfs || []).find(t => t.tf === s);
      p.stages[s] = { bias: (tfBias && tfBias.bias) || 'neu', expectations: '', liquidityTargets: '', risk: 0, liq: _wlEmptyLiq() };
    });
  } else {
    _WL_STAGES.forEach(s => {
      if (!p.stages[s]) p.stages[s] = { bias: 'neu', expectations: '', liquidityTargets: '', risk: 0, liq: _wlEmptyLiq() };
      if (!p.stages[s].liq) p.stages[s].liq = _wlEmptyLiq();
      if (p.stages[s].risk == null) p.stages[s].risk = 0;
    });
  }
  if (p.archived == null) p.archived = false;
  return p;
}

const _WL_CHECKLIST_ITEMS = [
  { k: 'htfBias',         l: 'HTF Bias' },
  { k: 'weeklyLiquidity', l: 'Weekly Liquidity' },
  { k: 'dailyBias',       l: 'Daily Bias' },
  { k: 'pdArrays',        l: 'Mark PD Arrays' },
  { k: 'newsReviewed',    l: 'Major News Reviewed' },
  { k: 'correlatedAssets',l: 'Correlated Assets Checked' },
  { k: 'smtChecked',      l: 'SMT Checked' },
  { k: 'riskCalculated',  l: 'Risk Calculated' },
  { k: 'sessionPlanReady',l: 'Session Plan Ready' },
];

/* Fill in any fields missing from legacy week rows. Mutates + returns week.meta. */
function _wlNormWeekMeta(week) {
  if (!week.meta) week.meta = {};
  const m = week.meta;
  if (!m.volatility) m.volatility = 'med';
  if (!m.weekStatus) m.weekStatus = 'waiting';
  if (m.weekStatusManual == null) m.weekStatusManual = false;
  if (m.dollarStrength == null) m.dollarStrength = 50;
  if (m.dollarStrengthManual == null) m.dollarStrengthManual = false;
  if (m.calendarReviewed == null) m.calendarReviewed = false;
  if (!m.checklist) {
    m.checklist = {};
    _WL_CHECKLIST_ITEMS.forEach(i => m.checklist[i.k] = false);
  } else {
    _WL_CHECKLIST_ITEMS.forEach(i => { if (m.checklist[i.k] == null) m.checklist[i.k] = false; });
  }
  if (!m.focus) m.focus = { mainPair: '', secondaryPair: '', avoidPair: '', maxTrades: null, maxRisk: null, objective: '' };
  else {
    ['mainPair','secondaryPair','avoidPair','objective'].forEach(k => { if (m.focus[k] == null) m.focus[k] = ''; });
    if (m.focus.maxTrades === undefined) m.focus.maxTrades = null;
    if (m.focus.maxRisk === undefined) m.focus.maxRisk = null;
  }
  if (!m.reflection) m.reflection = { followedPlan: '', whatChanged: '', biasValid: '', bestTrade: '', worstTrade: '', biggestLesson: '', mistakeRepeated: '', improvement: '', confidence: 0 };
  else {
    ['followedPlan','whatChanged','biasValid','bestTrade','worstTrade','biggestLesson','mistakeRepeated','improvement'].forEach(k => { if (m.reflection[k] == null) m.reflection[k] = ''; });
    if (m.reflection.confidence == null) m.reflection.confidence = 0;
  }
  if (m.reflectionUnlocked == null) m.reflectionUnlocked = false;
  if (m.coachExpanded == null) m.coachExpanded = true;
  return m;
}

/* ── Load from Supabase ── */
async function _wlLoad() {
  if (!_currentUser) return;
  const { data, error } = await sb
    .from('journal_watchlist')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('week_date', { ascending: false });
  if (error) { console.error('wlLoad error:', error.message); return; }
  _wlData = (data || []).map(r => {
    // The `checklist` column was left unused after the old weekly checklist
    // was removed — we repurpose it to carry week-level v2 metadata
    // (volatility, week status, dollar strength, calendar-reviewed flag)
    // as an object, so no DB schema change is needed. Legacy rows still
    // holding the old array format are simply ignored.
    const meta = (r.checklist && typeof r.checklist === 'object' && !Array.isArray(r.checklist)) ? r.checklist : {};
    const week = {
      id:          r.id,
      quarter:     r.quarter,
      weekLabel:   r.week_label,
      weekDate:    r.week_date,
      weekDateEnd: r.week_date_end || null,
      dxy:         r.dxy_bias || 'neu',
      market:      r.market_bias || 'neu',
      pairs:       (r.pairs || []).map(_wlNormPair),
      meta,
      dailyPlans:  r.daily_plans || {},
    };
    _wlNormWeekMeta(week);
    return week;
  });

  // Fire-and-forget: clean up any legacy base64 charts in the background
  // so they don't keep bloating this query on every future load.
  _wlMigrateBase64Charts();
}

async function _wlSaveWeek(week) {
  const row = {
    user_id:      _currentUser.id,
    quarter:      week.quarter,
    week_label:   week.weekLabel,
    week_date:    week.weekDate,
    week_date_end: week.weekDateEnd || null,
    dxy_bias:     week.dxy,
    market_bias:  week.market,
    pairs:        week.pairs,
    checklist:    week.meta || {},
    daily_plans:  week.dailyPlans || {},
  };
  if (week.id) {
    const { error } = await sb.from('journal_watchlist').update(row).eq('id', week.id);
    if (error) console.error('wl update error:', error.message);
  } else {
    const { data, error } = await sb.from('journal_watchlist').insert(row).select().single();
    if (error) { console.error('wl insert error:', error.message); return null; }
    week.id = data.id;
    _wlData.unshift(week);
  }
  return week;
}

async function _wlDeleteWeek(id) {
  const { error } = await sb.from('journal_watchlist').delete().eq('id', id);
  if (error) { console.error('wl delete error:', error.message); return false; }
  _wlData = _wlData.filter(w => w.id !== id);
  return true;
}

/* ── Upload chart image to Supabase Storage ──
   Compresses client-side first (same as trade charts) so watchlist rows
   never end up carrying multi-MB payloads — only a short URL is stored. */
async function _wlUploadChart(file) {
  const compressed = await _compressChartImage(file);
  const path = `${_currentUser.id}/wl_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
  const { error } = await sb.storage.from('trade-charts')
    .upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });
  if (error) { console.error('chart upload error:', error.message); return null; }
  const { data } = sb.storage.from('trade-charts').getPublicUrl(path);
  return data.publicUrl;
}

/* ── Backfill: migrate any base64 chart images already sitting in
   journal_watchlist rows out to Storage, replacing them with URLs.
   Runs once after _wlLoad(); safe to call repeatedly (no-op if nothing
   to migrate). This is what fixes historical slow loads — uploading new
   charts correctly doesn't help rows that were saved before that. */
async function _wlMigrateBase64Charts() {
  if (!_currentUser) return;
  let migratedAny = false;

  for (const week of _wlData) {
    let weekChanged = false;

    // Pair charts
    if (Array.isArray(week.pairs)) {
      for (const pair of week.pairs) {
        if (!Array.isArray(pair.charts)) continue;
        for (const chart of pair.charts) {
          if (chart && typeof chart.url === 'string' && chart.url.startsWith('data:image')) {
            const migratedUrl = await _wlMigrateOneBase64Image(chart.url);
            if (migratedUrl) { chart.url = migratedUrl; weekChanged = true; }
          }
        }
      }
    }

    // Daily plan charts
    if (week.dailyPlans) {
      for (const day of Object.keys(week.dailyPlans)) {
        const plan = week.dailyPlans[day];
        if (!plan || !Array.isArray(plan.charts)) continue;
        for (const chart of plan.charts) {
          if (chart && typeof chart.url === 'string' && chart.url.startsWith('data:image')) {
            const migratedUrl = await _wlMigrateOneBase64Image(chart.url);
            if (migratedUrl) { chart.url = migratedUrl; weekChanged = true; }
          }
        }
      }
    }

    if (weekChanged) {
      migratedAny = true;
      await _wlSaveWeek(week);
    }
  }

  if (migratedAny) console.info('Watchlist: migrated legacy base64 chart images to Storage.');
}

/* Convert a data: URL back to a Blob and upload it, reusing the same
   compression path as fresh uploads so old bloated base64 gets shrunk too. */
async function _wlMigrateOneBase64Image(dataUrl) {
  try {
    const res  = await fetch(dataUrl);
    const blob = await res.blob();
    const compressed = await _compressChartImage(blob);
    const path = `${_currentUser.id}/wl_migrated_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;
    const { error } = await sb.storage.from('trade-charts')
      .upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });
    if (error) { console.error('chart migration upload error:', error.message); return null; }
    const { data } = sb.storage.from('trade-charts').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('chart migration failed:', err.message || err);
    return null;
  }
}

/* ── Quarter key from date ── */
function _wlQuarterKey(dateStr) {
  const y = parseInt(dateStr.slice(0,4));
  const q = getQuarter(dateStr);
  return `${y}-Q${q}`;
}

/* ── Get all quarters that have data, plus current quarter ── */
function _wlQuarters() {
  const cur = _wlQuarterKey(localToday());
  const qs  = [...new Set([..._wlData.map(w => w.quarter), cur])];
  qs.sort((a,b) => b.localeCompare(a));
  return qs;
}

/* ── Quarter display label ── */
function _wlQLabel(qKey) {
  const [y, q] = qKey.split('-');
  return `${q} ${y} · ${Q_MONTHS[parseInt(q.slice(1))]}`;
}

/* ══════════════════════════════════════════════════════════════════
   WEEKLY READINESS SCORE — 6 equally-weighted prep factors, 0–100
   ══════════════════════════════════════════════════════════════════ */
function _wlComputeReadiness(week) {
  _wlNormWeekMeta(week);
  const pairs = week.pairs || [];

  // 1) Weekly bias set (DXY + market read)
  const biasDone = (week.dxy !== 'neu' ? 0.5 : 0) + (week.market !== 'neu' ? 0.5 : 0);

  // 2) Economic calendar reviewed (manual ack — we can't infer "read")
  const calDone = week.meta.calendarReviewed ? 1 : 0;

  // 3) All selected pairs analyzed — note + chart + at least one confluence checked
  const pairsDone = pairs.length ? pairs.reduce((sum, p) => {
    let s = 0;
    if (p.note && p.note.trim()) s += 0.34;
    if (p.charts && p.charts.length) s += 0.33;
    if (p.liq && Object.values(p.liq).some(Boolean)) s += 0.33;
    return sum + Math.min(1, s);
  }, 0) / pairs.length : 0;

  // 4) Daily gameplan completed — fraction of Mon–Fri with a note or mindset logged
  const weekdays = ['mon','tue','wed','thu','fri'];
  const plans = week.dailyPlans || {};
  const gameplanDone = weekdays.reduce((s, d) => {
    const p = plans[d];
    return s + ((p && ((p.note && p.note.trim()) || p.mindset)) ? 1 : 0);
  }, 0) / weekdays.length;

  // 5) Screenshots uploaded — any pair chart or daily chart present
  const hasPairShots  = pairs.some(p => p.charts && p.charts.length);
  const hasDayShots   = Object.values(plans).some(p => p && p.charts && p.charts.length);
  const shotsDone = (hasPairShots || hasDayShots) ? 1 : 0;

  // 6) Mindset check completed — any day this week has a mindset logged
  const mindsetDone = Object.values(plans).some(p => p && p.mindset) ? 1 : 0;

  const factors = [
    { key: 'bias',     label: 'Weekly Bias',        pct: biasDone },
    { key: 'cal',      label: 'Economic Calendar',  pct: calDone },
    { key: 'pairs',    label: 'Pairs Analyzed',     pct: pairsDone },
    { key: 'gameplan', label: 'Daily Gameplan',     pct: gameplanDone },
    { key: 'shots',    label: 'Screenshots',        pct: shotsDone },
    { key: 'mindset',  label: 'Mindset Check',      pct: mindsetDone },
  ];
  const score = Math.round(factors.reduce((s, f) => s + f.pct, 0) / factors.length * 100);

  let sessionMsg;
  if (score >= 85)      sessionMsg = 'Ready for London Session';
  else if (score >= 60) sessionMsg = 'Nearly Ready — Finish Prep';
  else if (score >= 30) sessionMsg = 'Preparation In Progress';
  else                  sessionMsg = 'Needs Weekly Preparation';

  return { score, factors, sessionMsg };
}

/* Generic click-to-cycle for week-level quick-glance fields. */
async function _wlCycleWeekField(weekId, field, opts) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  if (field === 'dxy' || field === 'market') {
    const i = opts.indexOf(week[field]);
    week[field] = opts[(i + 1) % opts.length];
  } else {
    const i = opts.indexOf(week.meta[field]);
    week.meta[field] = opts[(i + 1) % opts.length];
    if (field === 'weekStatus') week.meta.weekStatusManual = true;
  }
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlCycleDollarStrength(weekId) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  const steps = [10, 30, 50, 70, 90];
  const cur = week.meta.dollarStrength;
  const idx = steps.reduce((closest, v, i) => Math.abs(v - cur) < Math.abs(steps[closest] - cur) ? i : closest, 0);
  week.meta.dollarStrength = steps[(idx + 1) % steps.length];
  week.meta.dollarStrengthManual = true;
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlToggleCalendarReviewed(weekId) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  week.meta.calendarReviewed = !week.meta.calendarReviewed;
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

/* Auto week-status suggestion (used unless the person has manually overridden it) */
function _wlAutoWeekStatus(readinessScore) {
  if (readinessScore >= 90) return 'completed';
  if (readinessScore >= 15) return 'in-progress';
  return 'waiting';
}

/* ── Render ── */
function buildWatchlist() {
  const qs = _wlQuarters();
  if (!_wlActiveQ || !qs.includes(_wlActiveQ)) {
    _wlActiveQ = qs[0];
  }

  // Quarter tabs
  const qNav = document.getElementById('wl-quarter-nav');
  if (qNav) {
    qNav.innerHTML = qs.map(q =>
      `<button class="wl-q-tab${q === _wlActiveQ ? ' active' : ''}" onclick="_wlSetQ('${q}')">${_wlQLabel(q)}</button>`
    ).join('');
  }

  _wlRenderWeeks();
}

function _wlSetQ(q) {
  _wlActiveQ = q;
  _wlActiveWeekId = null;
  buildWatchlist();
}

function _wlRenderWeeks() {
  const weeks = _wlData.filter(w => w.quarter === _wlActiveQ)
    .sort((a,b) => b.weekDate.localeCompare(a.weekDate));

  // Current/active week chip — always visible
  const scroll = document.getElementById('wl-week-scroll');
  if (scroll) {
    if (weeks.length === 0) {
      scroll.innerHTML = '<span style="font-size:12px;color:var(--text3);font-style:italic">No weeks yet</span>';
    } else {
      if (!_wlActiveWeekId || !weeks.find(w => w.id === _wlActiveWeekId)) {
        _wlActiveWeekId = weeks[0].id;
      }
      const active = weeks.find(w => w.id === _wlActiveWeekId) || weeks[0];
      const isLatest = active.id === weeks[0].id;
      scroll.innerHTML = `
        <button class="wl-week-chip active" onclick="_wlToggleHistory(event)" title="${active.weekDate}${active.weekDateEnd ? ' → ' + active.weekDateEnd : ''}">
          ${isLatest ? '<span class="wl-week-chip-dot"></span>' : ''}${active.weekLabel}
        </button>`;
    }
  }

  // Past-weeks dropdown — every other week for this quarter, organized newest → oldest
  const histBtn   = document.getElementById('wl-week-history');
  const histCount = document.getElementById('wl-week-history-count');
  const histPanel = document.getElementById('wl-week-history-panel');
  const others = weeks.filter(w => w.id !== _wlActiveWeekId);
  if (histBtn) histBtn.style.display = weeks.length > 1 ? '' : 'none';
  if (histCount) histCount.textContent = others.length ? `(${others.length})` : '';
  if (histPanel) {
    histPanel.innerHTML = others.length
      ? others.map(w => `
          <button class="wl-week-history-item" onclick="_wlSetWeek('${w.id}');_wlCloseHistory()">
            <span class="wl-week-history-item-label">${w.weekLabel}</span>
            <span class="wl-week-history-item-range">${w.weekDate}${w.weekDateEnd ? ' → ' + w.weekDateEnd : ''}</span>
          </button>`).join('')
      : '<div class="wl-week-history-empty">No other weeks in this quarter</div>';
  }

  // Week content
  const content = document.getElementById('wl-week-content');
  const empty   = document.getElementById('wl-empty-state');
  if (!content) return;

  if (weeks.length === 0) {
    if (empty) empty.style.display = '';
    content.innerHTML = '';
    content.appendChild(empty || document.createElement('div'));
    return;
  }
  if (empty) empty.style.display = 'none';

  const week = weeks.find(w => w.id === _wlActiveWeekId) || weeks[0];
  _wlRenderWeekContent(week, content);
}

function _wlToggleHistory(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('wl-week-history-panel');
  const arrow = document.getElementById('wl-week-history-arrow');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : '';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
}

function _wlCloseHistory() {
  const panel = document.getElementById('wl-week-history-panel');
  const arrow = document.getElementById('wl-week-history-arrow');
  if (panel) panel.style.display = 'none';
  if (arrow) arrow.style.transform = '';
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('wl-week-history');
  if (wrap && !wrap.contains(e.target)) _wlCloseHistory();
});

function _wlSetWeek(id) {
  _wlActiveWeekId = id;
  _wlRenderWeeks();
}

/* ── SVG ring helper (reused by readiness card + pair confidence rings) ── */
function _wlRingSvg(pct, opts) {
  opts = opts || {};
  const size = opts.size || 88, sw = opts.stroke || 8;
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const off = c - (clamped / 100) * c;
  const colorClass = opts.colorClass || (clamped >= 70 ? 'wl-ring-good' : clamped >= 40 ? 'wl-ring-mid' : 'wl-ring-low');
  return `<div class="wl-ring-wrap" style="width:${size}px;height:${size}px">
    <svg class="wl-ring-svg" viewBox="0 0 ${size} ${size}">
      <circle class="wl-ring-track" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${sw}"></circle>
      <circle class="wl-ring-fill ${colorClass}" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${sw}"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-target-offset="${off.toFixed(1)}"></circle>
    </svg>
    ${opts.centerHtml ? `<div class="wl-ring-center">${opts.centerHtml}</div>` : ''}
  </div>`;
}

/* Animate all rings marked with data-target-offset from full → target (called after DOM insert) */
function _wlAnimateRings(root) {
  const rings = (root || document).querySelectorAll('.wl-ring-fill[data-target-offset]');
  requestAnimationFrame(() => {
    rings.forEach(r => { r.style.strokeDashoffset = r.getAttribute('data-target-offset'); });
  });
}

/* ── Weekly Readiness Score card (top of page) ── */
function _wlBuildReadinessCard(week) {
  const { score, factors, sessionMsg } = _wlComputeReadiness(week);
  const ring = _wlRingSvg(score, {
    size: 104, stroke: 9,
    centerHtml: `<div class="wl-readiness-num">${score}<span class="wl-readiness-pct">%</span></div>`,
  });
  const factorRows = factors.map(f => {
    const pct = Math.round(f.pct * 100);
    return `
    <div class="wl-factor-row">
      <div class="wl-factor-label">
        <span class="wl-factor-dot ${pct >= 100 ? 'done' : pct > 0 ? 'part' : ''}"></span>
        ${f.label}
      </div>
      <div class="wl-factor-bar-track"><div class="wl-factor-bar-fill" style="width:${pct}%"></div></div>
      <div class="wl-factor-pct">${pct}%</div>
    </div>`;
  }).join('');

  return `
  <div class="wl-readiness-card">
    <div class="wl-readiness-ring-col">
      ${ring}
      <div class="wl-readiness-status">${sessionMsg}</div>
    </div>
    <div class="wl-readiness-divider"></div>
    <div class="wl-readiness-factors">
      <div class="wl-readiness-title">Weekly Readiness</div>
      ${factorRows}
    </div>
  </div>`;
}

/* ── Market Overview panel (quick-glance widgets) ── */
function _wlBuildMarketOverview(week) {
  _wlNormWeekMeta(week);
  const { score } = _wlComputeReadiness(week);
  const m = week.meta;

  const dxyClass  = week.dxy === 'bull' ? 'bull' : week.dxy === 'bear' ? 'bear' : 'neu';
  const dxyLabel  = week.dxy === 'bull' ? `${icon('arrow-up')} Bullish` : week.dxy === 'bear' ? `${icon('arrow-down')} Bearish` : '→ Neutral';

  const mktClass  = week.market === 'risk-on' ? 'risk-on' : week.market === 'risk-off' ? 'risk-off' : 'neu';
  const mktLabel  = week.market === 'risk-on' ? `${icon('sparkle')} Risk-On` : week.market === 'risk-off' ? `${icon('sparkle')} Risk-Off` : '→ Neutral';

  const volClass  = m.volatility === 'high' ? 'bear' : m.volatility === 'low' ? 'bull' : 'neu';
  const volLabel  = m.volatility.charAt(0).toUpperCase() + m.volatility.slice(1);

  const statusVal = m.weekStatusManual ? m.weekStatus : _wlAutoWeekStatus(score);
  const statusClass = statusVal === 'completed' ? 'bull' : statusVal === 'in-progress' ? '' : 'neu';
  const statusLabel = statusVal === 'completed' ? 'Completed' : statusVal === 'in-progress' ? 'In Progress' : 'Waiting';

  const dsPct = m.dollarStrength;
  const dsLabel = dsPct >= 75 ? 'Strong' : dsPct >= 55 ? 'Firm' : dsPct >= 45 ? 'Neutral' : dsPct >= 25 ? 'Soft' : 'Weak';

  return `
  <div class="wl-overview-row">
    <div class="wl-overview-widget" onclick="_wlCycleWeekField('${week.id}','dxy',['bull','bear','neu'])" title="Click to cycle">
      <div class="wl-overview-label">DXY Bias</div>
      <span class="wl-badge ${dxyClass}">${dxyLabel}</span>
    </div>

    <div class="wl-overview-widget wl-overview-gauge" onclick="_wlCycleDollarStrength('${week.id}')" title="Click to cycle">
      <div class="wl-overview-label">Dollar Strength</div>
      <div class="wl-gauge-wrap">
        <svg class="wl-gauge-svg" viewBox="0 0 100 54">
          <path class="wl-gauge-track" d="M6,50 A44,44 0 0,1 94,50"></path>
          <path class="wl-gauge-fill" d="M6,50 A44,44 0 0,1 94,50"
            style="stroke-dasharray:138; stroke-dashoffset:${(138 - (dsPct/100)*138).toFixed(1)}"></path>
          <circle class="wl-gauge-needle-base" cx="50" cy="50" r="3"></circle>
        </svg>
        <div class="wl-gauge-readout">${dsLabel}</div>
      </div>
    </div>

    <div class="wl-overview-widget" onclick="_wlCycleWeekField('${week.id}','market',['risk-on','risk-off','neu'])" title="Click to cycle">
      <div class="wl-overview-label">Market Sentiment</div>
      <span class="wl-badge ${mktClass}">${mktLabel}</span>
    </div>

    <div class="wl-overview-widget" onclick="_wlCycleWeekField('${week.id}','volatility',['low','med','high'])" title="Click to cycle">
      <div class="wl-overview-label">Volatility</div>
      <span class="wl-badge ${volClass}">${volLabel}</span>
    </div>

    <div class="wl-overview-widget" onclick="_wlCycleWeekField('${week.id}','weekStatus',['waiting','in-progress','completed'])" title="Click to cycle · auto-suggested until set">
      <div class="wl-overview-label">Week Status</div>
      <span class="wl-badge ${statusClass}">${statusLabel}</span>
    </div>
  </div>`;
}

/* ── Weekly Checklist ── */
function _wlBuildWeeklyChecklist(week) {
  _wlNormWeekMeta(week);
  const cl = week.meta.checklist;
  const doneCount = _WL_CHECKLIST_ITEMS.reduce((s, i) => s + (cl[i.k] ? 1 : 0), 0);
  const pct = Math.round((doneCount / _WL_CHECKLIST_ITEMS.length) * 100);

  const rows = _WL_CHECKLIST_ITEMS.map(item => `
    <button class="wl-checklist-row${cl[item.k] ? ' checked' : ''}" onclick="_wlToggleWeeklyChecklistItem('${week.id}','${item.k}')">
      <span class="wl-checklist-box">${icon(cl[item.k] ? 'check' : 'dot-o')}</span>
      <span>${item.l}</span>
    </button>`).join('');

  return `
  <div class="wl-checklist-card">
    <div class="wl-checklist-head">
      <div class="wl-checklist-title">Weekly Preparation Checklist</div>
      <div class="wl-checklist-pct-wrap">
        <div class="wl-factor-bar-track" style="width:90px"><div class="wl-factor-bar-fill" style="width:${pct}%"></div></div>
        <span class="wl-checklist-pct">${pct}%</span>
      </div>
    </div>
    <div class="wl-checklist-grid">${rows}</div>
  </div>`;
}

async function _wlToggleWeeklyChecklistItem(weekId, key) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  week.meta.checklist[key] = !week.meta.checklist[key];
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

/* ── Weekly Focus ── */
function _wlBuildWeeklyFocus(week) {
  _wlNormWeekMeta(week);
  const f = week.meta.focus;
  const pairOpts = ['', ...new Set([...week.pairs.map(p => p.name), ..._WL_PAIRS_DEFAULT])];

  const pairSelect = (id, field, value, placeholder) => `
    <select class="wl-form-select" onchange="_wlSaveFocusField('${week.id}','${field}',this.value)">
      <option value=""${!value?' selected':''}>${placeholder}</option>
      ${pairOpts.filter(Boolean).map(p => `<option value="${p}"${value===p?' selected':''}>${p}</option>`).join('')}
    </select>`;

  return `
  <div class="wl-focus-card">
    <div class="wl-checklist-title" style="margin-bottom:12px">Weekly Focus</div>
    <div class="wl-focus-grid">
      <div class="wl-form-row">
        <label class="wl-form-label">Main Pair</label>
        ${pairSelect('main','mainPair',f.mainPair,'— None —')}
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Secondary Pair</label>
        ${pairSelect('sec','secondaryPair',f.secondaryPair,'— None —')}
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Avoid Trading</label>
        ${pairSelect('avoid','avoidPair',f.avoidPair,'— None —')}
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Maximum Trades</label>
        <input type="number" min="0" class="wl-form-input" value="${f.maxTrades ?? ''}" placeholder="e.g. 5"
          onblur="_wlSaveFocusField('${week.id}','maxTrades',this.value?parseInt(this.value,10):null)">
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Maximum Risk (%)</label>
        <input type="number" min="0" max="100" step="0.5" class="wl-form-input" value="${f.maxRisk ?? ''}" placeholder="e.g. 5"
          onblur="_wlSaveFocusField('${week.id}','maxRisk',this.value?parseFloat(this.value):null)">
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Weekly Objective</label>
        <input type="text" class="wl-form-input" value="${f.objective || ''}" placeholder="e.g. Protect Capital"
          onblur="_wlSaveFocusField('${week.id}','objective',this.value)">
      </div>
    </div>
  </div>`;
}

async function _wlSaveFocusField(weekId, field, value) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  week.meta.focus[field] = value;
  await _wlSaveWeek(week);
}

/* ══════════════════════════════════════════════════════════════════
   AI TRADING COACH — rule-based checks over the current week's data
   (no external API call: correlation/risk/confluence rules only)
   ══════════════════════════════════════════════════════════════════ */
function _wlComputeCoachInsights(week) {
  const insights = [];
  const pairs = week.pairs.filter(p => !p.archived);

  // Missing confluences
  pairs.forEach(p => {
    const { checked, total } = _wlLiqCount(p.liq);
    if (checked < 3 && p.direction !== 'wait') {
      insights.push({ sev: 'warn', text: `${p.name} has only ${checked}/${total} confluences confirmed but direction is set to ${p.direction === 'long' ? 'Long' : 'Short'} — consider waiting for more confirmation.` });
    }
  });

  // Bias consistency vs DXY (only meaningful once DXY bias is actually set)
  if (week.dxy !== 'neu') {
    pairs.forEach(p => {
      if (p.bias === 'neu') return;
      const isUsdQuote = /USD$/.test(p.name) && p.name !== 'USDCAD' && p.name !== 'USDJPY' && p.name !== 'USDCHF';
      const isUsdBase = /^USD/.test(p.name);
      if (isUsdQuote) {
        if (p.bias === 'bull' && week.dxy === 'bull') {
          insights.push({ sev: 'warn', text: `You are bullish on ${p.name} but DXY is also marked bullish — since ${p.name} trades inverse to USD strength, review your market correlation.` });
        } else if (p.bias === 'bear' && week.dxy === 'bear') {
          insights.push({ sev: 'warn', text: `You are bearish on ${p.name} but DXY is also marked bearish — since ${p.name} trades inverse to USD strength, review your market correlation.` });
        }
      } else if (isUsdBase) {
        if (p.bias === 'bull' && week.dxy === 'bear') {
          insights.push({ sev: 'warn', text: `You are bullish on ${p.name} while DXY is marked bearish — since USD is the base currency here, review whether these two views are consistent.` });
        } else if (p.bias === 'bear' && week.dxy === 'bull') {
          insights.push({ sev: 'warn', text: `You are bearish on ${p.name} while DXY is marked bullish — since USD is the base currency here, review whether these two views are consistent.` });
        }
      }
    });
  }

  // Confidence vs confluence mismatch
  pairs.forEach(p => {
    const { checked, total } = _wlLiqCount(p.liq);
    if (p.confidence >= 75 && checked <= 2) {
      insights.push({ sev: 'warn', text: `${p.name} confidence is ${p.confidence}% but only ${checked}/${total} confluences are checked off — high confidence without confirmation is a common overtrading trigger.` });
    }
  });

  // Checklist completion
  const clCheckedCount = _WL_CHECKLIST_ITEMS.reduce((s, i) => s + (week.meta.checklist[i.k] ? 1 : 0), 0);
  if (clCheckedCount < _WL_CHECKLIST_ITEMS.length * 0.5) {
    insights.push({ sev: 'info', text: `Weekly preparation checklist is only ${Math.round(clCheckedCount/_WL_CHECKLIST_ITEMS.length*100)}% complete — finish it before the week's first session for a cleaner read on the market.` });
  }

  // News warnings
  if (!week.meta.calendarReviewed) {
    insights.push({ sev: 'info', text: `Economic calendar hasn't been marked reviewed yet — check for high-impact releases before sizing up any positions.` });
  }

  // Risk warnings — too many pairs with a direction set relative to max trades
  const activeDirectional = pairs.filter(p => p.direction !== 'wait').length;
  if (week.meta.focus.maxTrades != null && activeDirectional > week.meta.focus.maxTrades) {
    insights.push({ sev: 'warn', text: `${activeDirectional} pairs have a Long/Short direction set, which is more than your Maximum Trades limit of ${week.meta.focus.maxTrades} — decide which setups take priority.` });
  }
  if (week.meta.focus.avoidPair && pairs.some(p => p.name === week.meta.focus.avoidPair && p.direction !== 'wait')) {
    insights.push({ sev: 'warn', text: `${week.meta.focus.avoidPair} has a direction set even though it's marked as this week's pair to avoid.` });
  }

  if (!insights.length) {
    insights.push({ sev: 'good', text: 'No inconsistencies detected in this week\'s analysis — bias, confidence, and confluence levels line up so far.' });
  }
  return insights;
}

function _wlBuildAICoach(week) {
  _wlNormWeekMeta(week);
  const insights = _wlComputeCoachInsights(week);
  const expanded = week.meta.coachExpanded;
  const warnCount = insights.filter(i => i.sev === 'warn').length;

  const rows = insights.map(i => `
    <div class="wl-coach-row ${i.sev}">
      <span class="wl-coach-icon">${icon(i.sev === 'warn' ? 'warning' : i.sev === 'good' ? 'check-c' : 'info')}</span>
      <span>${i.text}</span>
    </div>`).join('');

  return `
  <div class="wl-coach-card">
    <div class="wl-coach-head" onclick="_wlToggleCoach('${week.id}')">
      <div class="wl-coach-head-left">
        <span class="wl-coach-brain">${icon('brain')}</span>
        <span class="wl-checklist-title">AI Trading Coach</span>
        ${warnCount ? `<span class="wl-coach-badge">${warnCount}</span>` : ''}
      </div>
      <span class="wl-coach-chevron ${expanded ? 'open' : ''}">${icon('chevron-right')}</span>
    </div>
    ${expanded ? `<div class="wl-coach-body">${rows}</div>` : ''}
  </div>`;
}

async function _wlToggleCoach(weekId) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  week.meta.coachExpanded = !week.meta.coachExpanded;
  _wlRenderWeeks(); // instant UI feedback
  await _wlSaveWeek(week);
}

/* ══════════════════════════════════════════════════════════════════
   PERFORMANCE INSIGHTS — derived from actual trade history
   ══════════════════════════════════════════════════════════════════ */
function _wlComputePerformanceInsights() {
  if (!trades || !trades.length) return null;

  const byPair = {};
  const byDay  = {};
  const byModel = {};
  trades.forEach(t => {
    const pnl = _pctOfTrade(t);
    const win = t.outcome === 'Win';
    if (t.pair) {
      byPair[t.pair] = byPair[t.pair] || { wins: 0, total: 0, pnl: 0 };
      byPair[t.pair].total++; if (win) byPair[t.pair].wins++; byPair[t.pair].pnl += pnl;
    }
    if (t.date) {
      const dow = new Date(t.date + 'T00:00:00').getDay();
      const label = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
      byDay[label] = byDay[label] || { wins: 0, total: 0, pnl: 0 };
      byDay[label].total++; if (win) byDay[label].wins++; byDay[label].pnl += pnl;
    }
    if (t.strategy) {
      byModel[t.strategy] = byModel[t.strategy] || { wins: 0, total: 0, pnl: 0 };
      byModel[t.strategy].total++; if (win) byModel[t.strategy].wins++; byModel[t.strategy].pnl += pnl;
    }
  });

  const rank = (map, minTrades) => Object.entries(map)
    .filter(([,v]) => v.total >= minTrades)
    .sort((a,b) => (b[1].pnl) - (a[1].pnl));

  const pairRank  = rank(byPair, 2);
  const dayRank   = rank(byDay, 2);
  const modelRank = rank(byModel, 2);

  const bestPair  = pairRank[0];
  const worstPair = pairRank[pairRank.length - 1];
  const bestDay   = dayRank[0];
  const worstDay  = dayRank[dayRank.length - 1];
  const bestModel = modelRank[0];

  // Most common "mistake": checklist item most often left unchecked on losing trades
  const losses = trades.filter(t => t.outcome === 'Loss' && Array.isArray(t.checklist));
  let commonMistake = null;
  if (losses.length >= 3) {
    const missCounts = CHECKLIST_ITEMS.map(() => 0);
    losses.forEach(t => {
      CHECKLIST_ITEMS.forEach((item, i) => { if (!t.checklist[i]) missCounts[i]++; });
    });
    const maxIdx = missCounts.reduce((best, v, i) => v > missCounts[best] ? i : best, 0);
    if (missCounts[maxIdx] > 0) commonMistake = { item: CHECKLIST_ITEMS[maxIdx], count: missCounts[maxIdx], of: losses.length };
  }

  // Average weekly prep score across saved weeks, and a simple high-vs-low-prep pnl comparison
  const weekScores = _wlData.map(w => ({ w, score: _wlComputeReadiness(w).score }));
  const avgPrepScore = weekScores.length ? Math.round(weekScores.reduce((s,x) => s+x.score, 0) / weekScores.length) : null;

  let prepCorrelation = null;
  const weeksWithTrades = weekScores.map(({w, score}) => {
    const start = w.weekDate, end = w.weekDateEnd || w.weekDate;
    const weekTrades = trades.filter(t => t.date >= start && t.date <= end);
    if (!weekTrades.length) return null;
    return { score, pnl: weekTrades.reduce((s,t) => s + _pctOfTrade(t), 0) };
  }).filter(Boolean);
  if (weeksWithTrades.length >= 3) {
    const high = weeksWithTrades.filter(x => x.score >= 70);
    const low  = weeksWithTrades.filter(x => x.score < 70);
    if (high.length && low.length) {
      const avgHigh = high.reduce((s,x)=>s+x.pnl,0) / high.length;
      const avgLow  = low.reduce((s,x)=>s+x.pnl,0) / low.length;
      prepCorrelation = { avgHigh, avgLow, highCount: high.length, lowCount: low.length };
    }
  }

  return { bestPair, worstPair, bestDay, worstDay, bestModel, commonMistake, avgPrepScore, prepCorrelation };
}

function _wlBuildPerformanceInsights() {
  const p = _wlComputePerformanceInsights();
  if (!p) {
    return `
    <div class="wl-insights-card">
      <div class="wl-checklist-title" style="margin-bottom:6px">Performance Insights</div>
      <div class="wl-view-no-charts">Log a few trades in your journal to unlock performance insights here.</div>
    </div>`;
  }

  const pnlLabel = v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const items = [];
  if (p.bestPair)  items.push({ label: 'Best Performing Pair', value: `${p.bestPair[0]} · ${pnlLabel(p.bestPair[1].pnl)}` });
  if (p.worstPair && p.worstPair !== p.bestPair) items.push({ label: 'Weakest Pair', value: `${p.worstPair[0]} · ${pnlLabel(p.worstPair[1].pnl)}` });
  if (p.bestDay)   items.push({ label: 'Best Day', value: `${p.bestDay[0]} · ${Math.round(p.bestDay[1].wins/p.bestDay[1].total*100)}% win rate` });
  if (p.worstDay && p.worstDay !== p.bestDay) items.push({ label: 'Toughest Day', value: `${p.worstDay[0]} · ${Math.round(p.worstDay[1].wins/p.worstDay[1].total*100)}% win rate` });
  if (p.bestModel) items.push({ label: 'Most Profitable Model', value: `${p.bestModel[0]} · ${pnlLabel(p.bestModel[1].pnl)}` });
  if (p.commonMistake) items.push({ label: 'Most Common Mistake', value: `${p.commonMistake.item} (missing on ${p.commonMistake.count}/${p.commonMistake.of} losses)` });
  if (p.avgPrepScore != null) items.push({ label: 'Average Weekly Prep Score', value: `${p.avgPrepScore}%` });

  const rows = items.map(i => `
    <div class="wl-insight-row">
      <span class="wl-insight-label">${i.label}</span>
      <span class="wl-insight-value">${i.value}</span>
    </div>`).join('');

  const corr = p.prepCorrelation ? `
    <div class="wl-insight-corr">
      Weeks with a readiness score of 70%+ (${p.prepCorrelation.highCount} week${p.prepCorrelation.highCount!==1?'s':''}) averaged
      <strong style="color:${p.prepCorrelation.avgHigh>=0?'var(--green)':'var(--red)'}">${pnlLabel(p.prepCorrelation.avgHigh)}</strong>,
      versus <strong style="color:${p.prepCorrelation.avgLow>=0?'var(--green)':'var(--red)'}">${pnlLabel(p.prepCorrelation.avgLow)}</strong>
      in weeks below 70% (${p.prepCorrelation.lowCount} week${p.prepCorrelation.lowCount!==1?'s':''}). A small sample — treat as a directional signal, not proof.
    </div>` : '';

  return `
  <div class="wl-insights-card">
    <div class="wl-checklist-title" style="margin-bottom:10px">Performance Insights</div>
    <div class="wl-insight-grid">${rows}</div>
    ${corr}
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   WEEKLY REFLECTION — unlocks once the week's date range has passed
   ══════════════════════════════════════════════════════════════════ */
function _wlIsWeekOver(week) {
  const end = week.weekDateEnd || week.weekDate;
  return localToday() > end;
}

function _wlBuildWeeklyReflection(week) {
  _wlNormWeekMeta(week);
  const unlocked = _wlIsWeekOver(week) || week.meta.reflectionUnlocked;
  const r = week.meta.reflection;

  if (!unlocked) {
    return `
    <div class="wl-reflection-card wl-reflection-locked">
      <div class="wl-checklist-title" style="margin-bottom:4px">Weekly Reflection</div>
      <div class="wl-view-no-charts">${icon('lock')} Unlocks once this week's date range has passed.</div>
      <button class="wl-btn-secondary" style="margin-top:8px" onclick="_wlUnlockReflection('${week.id}')">Unlock Early</button>
    </div>`;
  }

  const field = (label, key, placeholder, tag) => `
    <div class="wl-form-row">
      <label class="wl-form-label">${label}</label>
      ${tag === 'textarea'
        ? `<textarea class="wl-form-textarea" rows="2" placeholder="${placeholder}" onblur="_wlSaveReflectionField('${week.id}','${key}',this.value)">${r[key] || ''}</textarea>`
        : `<input type="text" class="wl-form-input" value="${r[key] || ''}" placeholder="${placeholder}" onblur="_wlSaveReflectionField('${week.id}','${key}',this.value)">`}
    </div>`;

  return `
  <div class="wl-reflection-card">
    <div class="wl-checklist-title" style="margin-bottom:10px">Weekly Reflection</div>
    <div class="wl-reflection-grid">
      ${field('Did you follow your plan?', 'followedPlan', 'Yes / partially / no — and why')}
      ${field('What changed during the week?', 'whatChanged', 'News, volatility, unexpected moves…')}
      ${field('Did your bias remain valid?', 'biasValid', 'Did price confirm or invalidate your weekly read?')}
      ${field('Best trade', 'bestTrade', 'What made it work?')}
      ${field('Worst trade', 'worstTrade', 'What went wrong?')}
      ${field('Mistake repeated from a prior week?', 'mistakeRepeated', 'Be specific')}
    </div>
    ${field('Biggest lesson this week', 'biggestLesson', 'The one thing to remember…', 'textarea')}
    ${field('Improvement for next week', 'improvement', 'One concrete change to make…', 'textarea')}
    <div class="wl-form-row">
      <label class="wl-form-label">Confidence Going Into Next Week</label>
      <span class="wl-star-row" id="wl-reflect-conf-${week.id}">${_wlStarPicker(r.confidence, `_wlSetReflectionConfidence('${week.id}',`)}</span>
    </div>
  </div>`;
}

async function _wlUnlockReflection(weekId) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  week.meta.reflectionUnlocked = true;
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlSaveReflectionField(weekId, key, value) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  week.meta.reflection[key] = value;
  await _wlSaveWeek(week);
}

async function _wlSetReflectionConfidence(weekId, val) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  _wlNormWeekMeta(week);
  week.meta.reflection.confidence = week.meta.reflection.confidence === val ? 0 : val;
  await _wlSaveWeek(week);
  const el = document.getElementById(`wl-reflect-conf-${weekId}`);
  if (el) el.innerHTML = _wlStarPicker(week.meta.reflection.confidence, `_wlSetReflectionConfidence('${weekId}',`);
}

let _wlShowArchived = {}; // weekId → bool

function _wlLiqCount(liq) {
  const total = _WL_LIQ_ITEMS.length;
  const checked = liq ? _WL_LIQ_ITEMS.reduce((s, i) => s + (liq[i.k] ? 1 : 0), 0) : 0;
  return { checked, total };
}

function _wlPairCardHtml(week, p, pi) {
  const priClass = p.priority === 'high' ? 'high' : p.priority === 'med' ? 'med' : 'low';
  const biasClass = p.bias === 'bull' ? 'bull' : 'bear';
  const biasLabel = p.bias === 'bull' ? `${icon('arrow-up')} Bullish` : `${icon('arrow-down')} Bearish`;
  const firstChart = (p.charts && p.charts.length > 0) ? p.charts[0].url : null;
  const tfHtml = (p.tfs || []).map(tf => {
    const tc = tf.bias === 'bull' ? 'tf-bull' : tf.bias === 'bear' ? 'tf-bear' : 'tf-neu';
    const arrow = tf.bias === 'bull' ? icon('arrow-up') : tf.bias === 'bear' ? icon('arrow-down') : '→';
    const analyzed = tf.bias !== 'neu';
    return `<span class="tf-chip ${tc}${analyzed ? ' tf-analyzed' : ''}">${tf.tf} ${arrow}</span>`;
  }).join('');

  const dirClass = p.direction === 'long' ? 'bull' : p.direction === 'short' ? 'bear' : 'neu';
  const dirLabel = p.direction === 'long' ? `${icon('trend-up')} Long` : p.direction === 'short' ? `${icon('trend-down')} Short` : `${icon('clock')} Wait`;

  const { checked, total } = _wlLiqCount(p.liq);

  const stars = Array.from({length: 5}, (_, i) => icon(i < p.risk ? 'star' : 'star-o', {cls: i < p.risk ? 'icn-gold' : ''})).join('');

  return `
    <div class="wl-pair-card-v2 ${priClass}${p.archived ? ' wl-pair-archived' : ''}" onclick="_wlOpenPairDetail('${week.id}',${pi})">
      <div class="wl-card-chart">
        ${firstChart
          ? `<img class="wl-card-chart-img" src="${firstChart}" alt="${p.name} chart" loading="lazy">
             ${p.charts.length > 1 ? `<div class="wl-card-chart-count">+${p.charts.length} charts</div>` : ''}`
          : `<div class="wl-card-chart-placeholder"><span>${icon('trend-up')}</span><p>Tap to add charts</p></div>`}
        <div class="wl-card-confidence-ring">
          ${_wlRingSvg(p.confidence, { size: 40, stroke: 4, centerHtml: `<span class="wl-mini-ring-num">${p.confidence}</span>` })}
        </div>
        <div class="wl-card-quick-actions" onclick="event.stopPropagation()">
          <button title="Edit" onclick="_wlEditPairDirect('${week.id}',${pi})">${icon('edit')}</button>
          <button title="Duplicate" onclick="_wlDuplicatePair('${week.id}',${pi})">${icon('copy')}</button>
          <button title="${p.archived ? 'Unarchive' : 'Archive'}" onclick="_wlToggleArchivePair('${week.id}',${pi})">${icon('archive')}</button>
          <button title="Expand" onclick="_wlOpenPairDetail('${week.id}',${pi})">${icon('eye')}</button>
          <button title="Delete" class="wl-qa-danger" onclick="_wlQuickDeletePair('${week.id}',${pi})">${icon('trash')}</button>
        </div>
      </div>
      <div class="wl-card-body">
        <div class="wl-card-pair-row">
          <div class="wl-card-pair-name">${p.name}</div>
          <div class="wl-card-badges">
            <span class="wl-badge ${biasClass}" style="font-size:10px;padding:3px 9px">${biasLabel}</span>
          </div>
        </div>
        <div class="wl-card-tfs">${tfHtml}</div>

        <div class="wl-card-meta-row">
          <span class="wl-badge ${dirClass}" style="font-size:10px;padding:3px 9px">${dirLabel}</span>
          ${p.model ? `<span class="wl-model-chip">${p.model}</span>` : ''}
          <span class="wl-confluence-chip">${checked}/${total} confirmations</span>
        </div>

        <div class="wl-card-stars-row">
          <span class="wl-card-stars">${stars}</span>
          <span class="wl-card-stars-label">Risk</span>
        </div>

        ${p.expectedMove ? `<div class="wl-card-expected"><strong>Expected:</strong> ${p.expectedMove}</div>` : ''}
        <div class="wl-card-note">${p.note || '<span style="color:var(--text3);font-style:italic">No analysis yet…</span>'}</div>
      </div>
    </div>`;
}

function _wlRenderWeekContent(week, container) {
  _wlNormWeekMeta(week);
  week.pairs.forEach(_wlNormPair);

  const activePairs   = week.pairs.filter(p => !p.archived);
  const archivedPairs = week.pairs.filter(p => p.archived);

  // Pair cards HTML (index refers to position in the *full* week.pairs array
  // so edit/duplicate/archive/delete handlers stay correct after filtering)
  const pairCards = week.pairs.map((p, pi) => p.archived ? '' : _wlPairCardHtml(week, p, pi)).join('');

  const archivedSection = archivedPairs.length ? `
    <div class="wl-archived-toggle" onclick="_wlToggleShowArchived('${week.id}')">
      ${icon('archive')} ${_wlShowArchived[week.id] ? 'Hide' : 'Show'} Archived (${archivedPairs.length})
    </div>
    ${_wlShowArchived[week.id] ? `<div class="wl-pairs-grid wl-pairs-grid--archived">${
      week.pairs.map((p, pi) => p.archived ? _wlPairCardHtml(week, p, pi) : '').join('')
    }</div>` : ''}` : '';

  container.innerHTML = `
    ${_wlBuildReadinessCard(week)}
    ${_wlBuildMarketOverview(week)}

    <div class="wl-week-header">
      <div class="wl-week-meta">
        <div class="wl-week-title">${week.weekLabel}</div>
        <div class="wl-week-date">${week.weekDate}${week.weekDateEnd ? ' → ' + week.weekDateEnd : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
        <div class="wl-week-actions">
          <button class="wl-week-btn" onclick="_wlEditWeek('${week.id}');event.stopPropagation()">${icon('edit')} Edit</button>
          <button class="wl-week-btn danger" onclick="_wlConfirmDeleteWeek('${week.id}');event.stopPropagation()">${icon('close')} Delete</button>
        </div>
      </div>
    </div>

    <div class="wl-pairs-grid">
      ${pairCards}
      <div class="wl-add-pair-card" onclick="_wlAddPair('${week.id}')">
        <span>＋</span>
        <p>Add Pair Analysis</p>
      </div>
    </div>
    ${archivedSection}

    <div class="wl-checklist-focus-row">
      ${_wlBuildWeeklyChecklist(week)}
      ${_wlBuildWeeklyFocus(week)}
    </div>

    <!-- ── Daily Gameplan ─────────────────────────────────────────── -->
    ${_wlBuildDailyGameplan(week)}

    <!-- Economic Calendar -->
    <div class="wl-cal-section">
      <div class="wl-cal-header">
        <div class="wl-cal-title">
          <span class="wl-cal-icon">${icon('calendar')}</span>
          Economic Calendar
          <span class="wl-cal-week-range">${week.weekDate}${week.weekDateEnd ? ' – ' + week.weekDateEnd : ''}</span>
        </div>
        <div class="wl-cal-controls">
          <button class="wl-cal-reviewed-btn${week.meta.calendarReviewed ? ' active' : ''}" onclick="_wlToggleCalendarReviewed('${week.id}')" title="Mark as reviewed">
            ${icon(week.meta.calendarReviewed ? 'check-c' : 'dot-o')} ${week.meta.calendarReviewed ? 'Reviewed' : 'Mark Reviewed'}
          </button>
          <div class="wl-cal-filter-wrap" id="wl-cal-filter-wrap-${week.id}"></div>
          <button class="wl-cal-cur-btn" onclick="_wlCalOpenCurrencyPicker('${week.id}')" title="Filter currencies">
            <span id="wl-cal-cur-label-${week.id}">…</span> ▾
          </button>
          <button class="wl-cal-refresh-btn" onclick="_wlCalLoad('${week.id}','${week.weekDate}','${week.weekDateEnd||week.weekDate}',true)" title="Refresh">${icon('refresh')}</button>
        </div>
      </div>
      <!-- Currency picker dropdown (hidden by default) -->
      <div class="wl-cal-cur-picker" id="wl-cal-cur-picker-${week.id}" style="display:none"></div>
      <div class="wl-cal-body" id="wl-cal-body-${week.id}">
        <div class="wl-cal-loading"><span></span><span></span><span></span></div>
      </div>
    </div>

    <!-- ── AI Trading Coach ───────────────────────────────────────── -->
    ${_wlBuildAICoach(week)}

    <!-- ── Performance Insights ──────────────────────────────────── -->
    ${_wlBuildPerformanceInsights()}

    <!-- ── Weekly Reflection ─────────────────────────────────────── -->
    ${_wlBuildWeeklyReflection(week)}
  `;

  // Kick off calendar fetch after DOM is ready
  // Use setTimeout so the DOM is painted before fetch starts
  setTimeout(() => _wlCalAutoLoad(), 0);

  _wlMountDayDropzone(week.id, _wlActiveDayTab[week.id]);
  _wlAnimateRings(container);
}

function _wlToggleShowArchived(weekId) {
  _wlShowArchived[weekId] = !_wlShowArchived[weekId];
  _wlRenderWeeks();
}

async function _wlDuplicatePair(weekId, pairIdx) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const src = week.pairs[pairIdx];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.archived = false;
  week.pairs.splice(pairIdx + 1, 0, copy);
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlToggleArchivePair(weekId, pairIdx) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  p.archived = !p.archived;
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlQuickDeletePair(weekId, pairIdx) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  if (!confirm(`Remove ${p.name} from this week's watchlist?`)) return;
  week.pairs.splice(pairIdx, 1);
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

/* ══════════════════════════════════════════════════════════════════
   DAILY GAMEPLAN — per-day sub-analysis within a week
   ══════════════════════════════════════════════════════════════════ */
const _WL_DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const _WL_DAY_LABELS = { sun:'Sunday', mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday' };
const _WL_DAY_SHORT  = { sun:'SUN', mon:'MON', tue:'TUE', wed:'WED', thu:'THU', fri:'FRI', sat:'SAT' };
const _WL_JOURNAL_PROMPT = "What would invalidate today's bias?";

function _wlDayPlanDefault() {
  return {
    note: '', pairs: [], mindset: '', charts: [],
    sessionBias: { london: 'neu', ny: 'neu' },
    asianRangeMarked: false,
    liquidityTaken: '',
    sessionGoal: '', maxTrades: null, entryModel: '', tradeReminder: '',
    confidence: 0, energy: 0, sleepHours: null,
    journalPrompt: '',
  };
}

/* Fill in any fields missing from a legacy day-plan object. Mutates + returns it. */
function _wlNormDayPlan(plan) {
  const d = _wlDayPlanDefault();
  Object.keys(d).forEach(k => {
    if (plan[k] == null) plan[k] = d[k];
  });
  if (!plan.sessionBias) plan.sessionBias = { london: 'neu', ny: 'neu' };
  if (plan.sessionBias.london == null) plan.sessionBias.london = 'neu';
  if (plan.sessionBias.ny == null) plan.sessionBias.ny = 'neu';
  return plan;
}

// Derive actual dates for each day of the week from weekDate (YYYY-MM-DD)
// Week runs Sun–Sat. weekDate can be any day within the week (we normalise to Sunday).
// IMPORTANT: use local date parts (not toISOString) to avoid UTC timezone shift bugs.
function _wlWeekDates(weekDate) {
  const base = new Date(weekDate + 'T00:00:00');
  const dow = base.getDay(); // 0=Sun … 6=Sat
  // Find the Sunday of this week (local time)
  const sun = new Date(base);
  sun.setDate(base.getDate() - dow);
  const dates = {};
  // _WL_DAYS order: sun, mon, tue, wed, thu, fri, sat  (indices 0–6)
  _WL_DAYS.forEach((d, i) => {
    const dd = new Date(sun);
    dd.setDate(sun.getDate() + i);
    // Use local date parts to avoid UTC offset shifting the date
    const yy = dd.getFullYear();
    const mm = String(dd.getMonth() + 1).padStart(2, '0');
    const dy = String(dd.getDate()).padStart(2, '0');
    dates[d] = `${yy}-${mm}-${dy}`;
  });
  return dates;
}

// Determine which day tab is active — default to today if within this week, else mon
function _wlActiveDayDefault(week) {
  const today = localToday();
  const dates = _wlWeekDates(week.weekDate);
  const match = _WL_DAYS.find(d => dates[d] === today);
  return match || 'mon';
}

let _wlActiveDayTab = {}; // weekId → active day key

function _wlBuildDailyGameplan(week) {
  if (!_wlActiveDayTab[week.id]) {
    _wlActiveDayTab[week.id] = _wlActiveDayDefault(week);
  }
  const activeDay = _wlActiveDayTab[week.id];
  const dates = _wlWeekDates(week.weekDate);
  const today = localToday();

  const tabsHtml = _WL_DAYS.map(d => {
    const isActive = d === activeDay;
    const isToday  = dates[d] === today;
    const plan     = (week.dailyPlans || {})[d] || {};
    const hasContent = (plan.note && plan.note.trim()) || (plan.pairs || []).some(pp => pp.note && pp.note.trim());
    return `<button class="wl-day-tab${isActive ? ' active' : ''}${isToday ? ' today' : ''}"
      onclick="_wlSetDayTab('${week.id}','${d}')">
      <span class="wl-day-tab-short">${_WL_DAY_SHORT[d]}</span>
      <span class="wl-day-tab-date">${dates[d] ? dates[d].slice(5) : ''}</span>
      ${hasContent ? '<span class="wl-day-tab-dot"></span>' : ''}
    </button>`;
  }).join('');

  const plan = _wlNormDayPlan((week.dailyPlans || {})[activeDay] || {});
  const pairPlans = week.pairs.map((p, pi) => {
    const pp = (plan.pairs || []).find(x => x.name === p.name) || {};
    const bias = pp.bias || p.bias || 'neu';
    const bClass = bias === 'bull' ? 'bull' : bias === 'bear' ? 'bear' : 'neu';
    const bLabel = bias === 'bull' ? '<svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg> Bull' : bias === 'bear' ? '<svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg> Bear' : '→ Neu';
    return `
    <div class="wl-day-pair-row">
      <div class="wl-day-pair-name">${p.name}</div>
      <div class="wl-day-pair-bias-wrap">
        <button class="wl-day-bias-btn ${bClass}" onclick="_wlCycleDayPairBias('${week.id}','${activeDay}','${p.name}',this)">
          ${bLabel}
        </button>
      </div>
      <textarea class="wl-day-pair-note"
        placeholder="What do you want to see on ${p.name} ${_WL_DAY_LABELS[activeDay]}? (key levels, entry model, confirmation…)"
        onblur="_wlSaveDayPairNote('${week.id}','${activeDay}','${p.name}',this.value)"
        >${pp.note || ''}</textarea>
    </div>`;
  }).join('');

  const sessionLabel = (() => {
    const d = dates[activeDay];
    if (!d) return '';
    const trades_today = trades.filter(t => t.date === d);
    if (!trades_today.length) return '';
    const wins = trades_today.filter(t => t.outcome === 'Win').length;
    const pnl  = trades_today.reduce((a, t) => a + _pctOfTrade(t), 0);
    const col  = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    return `<div class="wl-day-traded-badge" style="color:${col}">
      ${trades_today.length}T · ${wins}W · ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}% logged
    </div>`;
  })();

  return `
  <div class="wl-daily-section">
    <div class="wl-daily-header">
      <div class="wl-daily-title">
        <span class="wl-daily-icon"><svg class="icn" aria-hidden="true"><use href="#ic-clipboard"></use></svg></span>
        Daily Gameplan
      </div>
      <div class="wl-daily-subtitle">What do you want to see each day? Log your bias &amp; expectations before the session.</div>
    </div>

    <div class="wl-day-tabs" id="wl-day-tabs-${week.id}">${tabsHtml}</div>

    <div class="wl-day-content" id="wl-day-content-${week.id}">
      <div class="wl-day-content-inner">
        <div class="wl-day-content-top">
          <div class="wl-day-full-label">
            ${_WL_DAY_LABELS[activeDay]} · <span style="color:var(--text3)">${dates[activeDay] || ''}</span>
            ${sessionLabel}
          </div>
        </div>

        <div class="wl-form-row" style="margin-bottom:12px">
          <label class="wl-form-label" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3)">
            Overall Market Notes
          </label>
          <textarea class="wl-day-overall-note"
            id="wl-day-note-${week.id}-${activeDay}"
            placeholder="DXY expectation, macro context, session bias, news to watch, what overall scenario you're looking for…"
            onblur="_wlSaveDayNote('${week.id}','${activeDay}',this.value)"
            rows="3">${plan.note || ''}</textarea>
        </div>

        <!-- Session Bias + Killzones -->
        <div class="wl-day-session-row">
          <div class="wl-day-session-item">
            <span class="wl-overview-label">London Bias</span>
            <button class="wl-badge ${plan.sessionBias.london==='bull'?'bull':plan.sessionBias.london==='bear'?'bear':'neu'}"
              onclick="_wlCycleSessionBias('${week.id}','${activeDay}','london')">
              ${plan.sessionBias.london==='bull'?`${icon('arrow-up')} Bullish`:plan.sessionBias.london==='bear'?`${icon('arrow-down')} Bearish`:'→ Neutral'}
            </button>
          </div>
          <div class="wl-day-session-item">
            <span class="wl-overview-label">New York Bias</span>
            <button class="wl-badge ${plan.sessionBias.ny==='bull'?'bull':plan.sessionBias.ny==='bear'?'bear':'neu'}"
              onclick="_wlCycleSessionBias('${week.id}','${activeDay}','ny')">
              ${plan.sessionBias.ny==='bull'?`${icon('arrow-up')} Bullish`:plan.sessionBias.ny==='bear'?`${icon('arrow-down')} Bearish`:'→ Neutral'}
            </button>
          </div>
          <div class="wl-day-session-item">
            <span class="wl-overview-label">Asian Range</span>
            <button class="wl-badge ${plan.asianRangeMarked?'bull':'neu'}" onclick="_wlToggleAsianRange('${week.id}','${activeDay}')">
              ${icon(plan.asianRangeMarked?'check':'dot-o')} ${plan.asianRangeMarked?'Marked':'Not Marked'}
            </button>
          </div>
          <div class="wl-day-session-item">
            <span class="wl-overview-label">Liquidity Taken</span>
            <button class="wl-badge ${plan.liquidityTaken==='yes'?'bull':plan.liquidityTaken==='no'?'bear':'neu'}" onclick="_wlCycleLiquidityTaken('${week.id}','${activeDay}')">
              ${plan.liquidityTaken==='yes'?'Yes':plan.liquidityTaken==='no'?'No':'—'}
            </button>
          </div>
        </div>

        ${week.pairs.length > 0 ? `
        <div class="wl-day-pairs-section">
          <div class="wl-day-pairs-label">
            <span>Pair Expectations</span>
            <span style="font-size:10px;color:var(--text3);font-weight:400">Click bias to cycle · notes autosave on blur</span>
          </div>
          <div class="wl-day-pair-rows" id="wl-day-pairs-${week.id}-${activeDay}">
            ${pairPlans}
          </div>
        </div>` : `
        <div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">
          Add pairs to your weekly watchlist first to log daily expectations per pair.
        </div>`}

        <!-- Session Goal / Max Trades / Entry Model / Reminders -->
        <div class="wl-day-pairs-label" style="margin-top:16px"><span>Session Goal</span></div>
        <div class="wl-day-session-setup">
          <div class="wl-form-row">
            <label class="wl-form-label">Session Goal</label>
            <input type="text" class="wl-form-input" value="${plan.sessionGoal || ''}" placeholder="e.g. Protect capital, one A+ setup only"
              onblur="_wlSaveDayField('${week.id}','${activeDay}','sessionGoal',this.value)">
          </div>
          <div class="wl-form-row">
            <label class="wl-form-label">Maximum Trades</label>
            <input type="number" min="0" class="wl-form-input" value="${plan.maxTrades ?? ''}" placeholder="e.g. 2"
              onblur="_wlSaveDayField('${week.id}','${activeDay}','maxTrades',this.value?parseInt(this.value,10):null)">
          </div>
          <div class="wl-form-row">
            <label class="wl-form-label">Expected Entry Model</label>
            <select class="wl-form-select" onchange="_wlSaveDayField('${week.id}','${activeDay}','entryModel',this.value)">
              <option value=""${!plan.entryModel?' selected':''}>— Select —</option>
              ${_WL_MODELS().map(m => `<option value="${m}"${plan.entryModel===m?' selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="wl-form-row" style="margin-top:8px">
          <label class="wl-form-label">Trade Reminder / Things To Avoid</label>
          <textarea class="wl-form-textarea" rows="2" placeholder="Don't chase, wait for sweep + MSS, avoid news minute…"
            onblur="_wlSaveDayField('${week.id}','${activeDay}','tradeReminder',this.value)">${plan.tradeReminder || ''}</textarea>
        </div>

        <!-- ── Daily chart images ── -->
        <div class="wl-day-charts-section">
          <div class="wl-day-pairs-label" style="margin-top:16px">
            <span>Analysis Screenshots</span>
            <span style="font-size:10px;color:var(--text3);font-weight:400">Synced across devices</span>
          </div>
          ${(() => {
            const imgs = plan.charts || [];
            const thumbs = imgs.map((c, ci) => _wlDayChartThumbHtml(week.id, activeDay, c, ci)).join('');
            return `
            ${imgs.length > 0 ? `<div class="wl-day-chart-grid" id="wl-day-chart-grid-${week.id}-${activeDay}">${thumbs}</div>` : `<div class="wl-day-chart-grid wl-day-chart-grid--empty" id="wl-day-chart-grid-${week.id}-${activeDay}"></div>`}
            <div class="wl-day-upload-zone" id="wl-day-upload-zone-${week.id}-${activeDay}"></div>`;
          })()}
        </div>

        <!-- Journal Prompt -->
        <div class="wl-form-row" style="margin-top:14px">
          <label class="wl-form-label">${_WL_JOURNAL_PROMPT}</label>
          <textarea class="wl-form-textarea" rows="2" placeholder="Write your answer before the session starts…"
            onblur="_wlSaveDayField('${week.id}','${activeDay}','journalPrompt',this.value)">${plan.journalPrompt || ''}</textarea>
        </div>

        <div class="wl-day-footer">
          <div class="wl-day-mindset-wrap">
            <label class="wl-form-label" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);margin-bottom:6px;display:block">
              Mindset Check
            </label>
            <div class="wl-day-mindset-btns" id="wl-day-mindset-${week.id}-${activeDay}">
              ${[['meditate','Focused'],['zap','Eager'],['moon','Tired'],['frown','Frustrated'],['meh','Neutral']].map(([ic,mKey]) => {
                const isSelected = plan.mindset === mKey;
                return `<button class="wl-day-mindset-btn${isSelected ? ' selected' : ''}"
                  onclick="_wlSetDayMindset('${week.id}','${activeDay}','${mKey}',this)">${icon(ic)} ${mKey}</button>`;
              }).join('')}
            </div>
            <div class="wl-day-vitals-row">
              <div class="wl-day-vital">
                <span class="wl-overview-label">Confidence</span>
                <span class="wl-star-row" id="wl-day-conf-${week.id}-${activeDay}">${_wlStarPicker(plan.confidence, `_wlSetDayConfidence('${week.id}','${activeDay}',`)}</span>
              </div>
              <div class="wl-day-vital">
                <span class="wl-overview-label">Energy</span>
                <span class="wl-star-row" id="wl-day-energy-${week.id}-${activeDay}">${_wlStarPicker(plan.energy, `_wlSetDayEnergy('${week.id}','${activeDay}',`)}</span>
              </div>
              <div class="wl-day-vital">
                <span class="wl-overview-label">Sleep (hrs)</span>
                <input type="number" min="0" max="14" step="0.5" class="wl-form-input wl-day-sleep-input"
                  value="${plan.sleepHours ?? ''}" placeholder="7.5"
                  onblur="_wlSaveDayField('${week.id}','${activeDay}','sleepHours',this.value?parseFloat(this.value):null)">
              </div>
            </div>
          </div>
          <div class="wl-day-action-btns">
            <button class="wl-day-save-btn" onclick="_wlSaveDayPlanManual('${week.id}','${activeDay}')" title="Save day plan">
              <svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save
            </button>
            <button class="wl-day-edit-btn" onclick="_wlEditDayPlan('${week.id}','${activeDay}')" title="Edit day plan">
              <svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit
            </button>
            <button class="wl-day-clear-btn" onclick="_wlClearDayPlan('${week.id}','${activeDay}')">
              <svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── Daily plan tab switching ── */
function _wlSetDayTab(weekId, day) {
  _wlActiveDayTab[weekId] = day;
  // Re-render only the daily section to avoid losing focus on other elements
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const container = document.getElementById('wl-week-content');
  if (!container) return;
  _wlRenderWeeks(); // full re-render keeps it simple and consistent
}

/* ── Save overall day note (autosave on blur) ── */
async function _wlSaveDayNote(weekId, day, note) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  week.dailyPlans[day].note = note;
  await _wlSaveWeek(week);
}

/* ── Save per-pair note within a day (autosave on blur) ── */
async function _wlSaveDayPairNote(weekId, day, pairName, note) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const pairs = week.dailyPlans[day].pairs || [];
  const existing = pairs.find(p => p.name === pairName);
  if (existing) existing.note = note;
  else pairs.push({ name: pairName, note, bias: 'neu' });
  week.dailyPlans[day].pairs = pairs;
  await _wlSaveWeek(week);
}

/* ── Cycle bias for a pair on a specific day ── */
async function _wlCycleDayPairBias(weekId, day, pairName, btn) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const pairs = week.dailyPlans[day].pairs || [];
  const existing = pairs.find(p => p.name === pairName);
  const cycle = { neu: 'bull', bull: 'bear', bear: 'neu' };
  const curBias = existing ? existing.bias : 'neu';
  const newBias = cycle[curBias];
  if (existing) existing.bias = newBias;
  else pairs.push({ name: pairName, note: '', bias: newBias });
  week.dailyPlans[day].pairs = pairs;
  // Update button instantly without full re-render
  const bLabel = newBias === 'bull' ? '<svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg> Bull' : newBias === 'bear' ? '<svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg> Bear' : '→ Neu';
  btn.textContent = bLabel;
  btn.className = `wl-day-bias-btn ${newBias}`;
  await _wlSaveWeek(week);
}

/* ── Set mindset for a day ── */
async function _wlSetDayMindset(weekId, day, mindset, btn) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  week.dailyPlans[day].mindset = mindset;
  // Update buttons instantly
  const container = document.getElementById(`wl-day-mindset-${weekId}-${day}`);
  if (container) container.querySelectorAll('.wl-day-mindset-btn').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
  await _wlSaveWeek(week);
}

/* ── Session bias (London / New York) cycling ── */
async function _wlCycleSessionBias(weekId, day, session) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  const opts = ['bull','bear','neu'];
  plan.sessionBias[session] = opts[(opts.indexOf(plan.sessionBias[session]) + 1) % opts.length];
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlToggleAsianRange(weekId, day) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan.asianRangeMarked = !plan.asianRangeMarked;
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlCycleLiquidityTaken(weekId, day) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  const opts = ['', 'yes', 'no'];
  plan.liquidityTaken = opts[(opts.indexOf(plan.liquidityTaken) + 1) % opts.length];
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

/* ── Generic autosave for simple day-plan fields (session goal, max trades, entry model, reminders, sleep hours, journal prompt) ── */
async function _wlSaveDayField(weekId, day, field, value) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan[field] = value;
  await _wlSaveWeek(week);
}

async function _wlSetDayConfidence(weekId, day, val) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan.confidence = plan.confidence === val ? 0 : val;
  await _wlSaveWeek(week);
  const el = document.getElementById(`wl-day-conf-${weekId}-${day}`);
  if (el) el.innerHTML = _wlStarPicker(plan.confidence, `_wlSetDayConfidence('${weekId}','${day}',`);
}

async function _wlSetDayEnergy(weekId, day, val) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan.energy = plan.energy === val ? 0 : val;
  await _wlSaveWeek(week);
  const el = document.getElementById(`wl-day-energy-${weekId}-${day}`);
  if (el) el.innerHTML = _wlStarPicker(plan.energy, `_wlSetDayEnergy('${weekId}','${day}',`);
}

/* ── Session bias (London / New York) cycle ── */
async function _wlCycleSessionBias(weekId, day, session) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  const opts = ['bull','bear','neu'];
  plan.sessionBias[session] = opts[(opts.indexOf(plan.sessionBias[session]) + 1) % opts.length];
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlToggleAsianRange(weekId, day) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan.asianRangeMarked = !plan.asianRangeMarked;
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

async function _wlCycleLiquidityTaken(weekId, day) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  const opts = ['', 'yes', 'no'];
  plan.liquidityTaken = opts[(opts.indexOf(plan.liquidityTaken) + 1) % opts.length];
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

/* ── Generic autosave for simple day-plan fields (text/number/select) ── */
async function _wlSaveDayField(weekId, day, field, value) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan[field] = value;
  await _wlSaveWeek(week);
}

async function _wlSetDayConfidence(weekId, day, val) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan.confidence = plan.confidence === val ? 0 : val;
  const el = document.getElementById(`wl-day-conf-${weekId}-${day}`);
  if (el) el.innerHTML = _wlStarPicker(plan.confidence, `_wlSetDayConfidence('${weekId}','${day}',`);
  await _wlSaveWeek(week);
}

async function _wlSetDayEnergy(weekId, day, val) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  const plan = _wlNormDayPlan(week.dailyPlans[day]);
  plan.energy = plan.energy === val ? 0 : val;
  const el = document.getElementById(`wl-day-energy-${weekId}-${day}`);
  if (el) el.innerHTML = _wlStarPicker(plan.energy, `_wlSetDayEnergy('${weekId}','${day}',`);
  await _wlSaveWeek(week);
}

/* ── Clear an entire day's plan ── */


/* ── Manual Save: flush current textarea values then save to cloud ── */
async function _wlSaveDayPlanManual(weekId, day) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  // Flush overall note textarea
  const noteTA = document.getElementById(`wl-day-note-${weekId}-${day}`);
  if (noteTA) await _wlSaveDayNote(weekId, day, noteTA.value);
  // Flush pair note textareas
  if (week.pairs) {
    for (const p of week.pairs) {
      const rows = document.querySelectorAll(`.wl-day-pair-note`);
      rows.forEach(ta => {
        if (ta.getAttribute('data-pair') === p.name || (ta.placeholder || '').includes(p.name)) {
          _wlSaveDayPairNote(weekId, day, p.name, ta.value);
        }
      });
    }
  }
  await _wlSaveWeek(week);
  showToast('Day plan saved ✓', 'success');
}

/* ── Edit: scroll to the note textarea and focus it ── */
function _wlEditDayPlan(weekId, day) {
  const noteTA = document.getElementById(`wl-day-note-${weekId}-${day}`);
  if (noteTA) {
    noteTA.focus();
    noteTA.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function _wlClearDayPlan(weekId, day) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  if (!week.dailyPlans) week.dailyPlans = {};
  // Preserve charts when clearing text content
  const existingCharts = (week.dailyPlans[day] || {}).charts || [];
  week.dailyPlans[day] = _wlDayPlanDefault();
  week.dailyPlans[day].charts = existingCharts;
  await _wlSaveWeek(week);
  _wlRenderWeeks();
}

/* ── Mount the reusable dropzone for a specific day's screenshot zone ── */
function _wlMountDayDropzone(weekId, day) {
  const zoneId = `wl-day-upload-zone-${weekId}-${day}`;
  if (!document.getElementById(zoneId)) return;
  mountDropzone(zoneId, {
    multiple: true,
    showPreview: false, // uploaded files land in the grid above instead
    primaryText: 'Drag & drop screenshots here',
    secondaryText: 'or click to browse',
    onFiles: files => _wlProcessDayFiles(files, weekId, day),
  });
}

// Legacy entry point (kept in case any old markup/input still calls it directly)
async function _wlHandleDayChartUpload(input, weekId, day) {
  const files = Array.from(input.files);
  input.value = '';
  return _wlProcessDayFiles(files, weekId, day);
}

/* ── Upload chart images for a specific day ── */
async function _wlProcessDayFiles(files, weekId, day) {
  if (!files.length) return;
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;

  if (!week.dailyPlans) week.dailyPlans = {};
  if (!week.dailyPlans[day]) week.dailyPlans[day] = _wlDayPlanDefault();
  if (!week.dailyPlans[day].charts) week.dailyPlans[day].charts = [];

  let fellBackToBase64 = false;
  for (const file of files) {
    let finalUrl = null;
    if (_currentUser) {
      finalUrl = await _wlUploadChart(file);
    }
    if (!finalUrl) {
      // Storage upload failed (or no user) — base64 is a last resort only,
      // never the default path, since it bloats the DB row and slows loads.
      fellBackToBase64 = true;
      finalUrl = await new Promise(resolve => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file);
      });
    }
    const label = file.name.replace(/\.[^.]+$/, '');
    week.dailyPlans[day].charts.push({ url: finalUrl, label });
  }
  if (fellBackToBase64) showToast('Chart upload to cloud storage failed — saved locally instead', 'danger');
  await _wlSaveWeek(week);

  // Re-render only the chart grid + zone (no full re-render = no tab switch)
  _wlRefreshDayChartGrid(weekId, day, week.dailyPlans[day].charts);
}

/* ── Delete a single day chart ── */
async function _wlDeleteDayChart(weekId, day, idx) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week || !week.dailyPlans || !week.dailyPlans[day]) return;
  week.dailyPlans[day].charts.splice(idx, 1);
  await _wlSaveWeek(week);
  _wlRefreshDayChartGrid(weekId, day, week.dailyPlans[day].charts);
}

/* ── Day chart thumbnail with drag-reorder support ── */
function _wlDayChartThumbHtml(weekId, day, c, ci) {
  return `
    <div class="wl-day-chart-thumb-wrap" draggable="true"
      ondragstart="_wlDayChartDragStart(event,${ci})" ondragover="_wlChartDragOver(event)"
      ondrop="_wlDayChartDrop(event,'${weekId}','${day}',${ci})" ondragend="_wlChartDragEnd(event)">
      <span class="wl-chart-thumb-drag" title="Drag to reorder">${icon('sort')}</span>
      <img class="wl-day-chart-thumb" src="${c.url}" alt="chart ${ci+1}"
        onclick="_wlOpenLightbox('${c.url}')">
      <div class="wl-day-chart-label">${c.label || ''}</div>
      <button class="wl-day-chart-del" onclick="_wlDeleteDayChart('${weekId}','${day}',${ci})" title="Remove"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>`;
}
function _wlDayChartDragStart(ev, idx) { _wlChartDragFromIdx = idx; ev.currentTarget.classList.add('dragging'); }
function _wlDayChartDrop(ev, weekId, day, toIdx) {
  ev.preventDefault();
  if (_wlChartDragFromIdx === null || _wlChartDragFromIdx === toIdx) return;
  const week = _wlData.find(w => w.id === weekId);
  if (!week || !week.dailyPlans || !week.dailyPlans[day]) return;
  const arr = week.dailyPlans[day].charts;
  const [moved] = arr.splice(_wlChartDragFromIdx, 1);
  arr.splice(toIdx, 0, moved);
  _wlChartDragFromIdx = null;
  _wlSaveWeek(week);
  _wlRefreshDayChartGrid(weekId, day, arr);
}

/* ── Re-render just the chart grid without a full page re-render ── */
function _wlRefreshDayChartGrid(weekId, day, charts) {
  const grid = document.getElementById(`wl-day-chart-grid-${weekId}-${day}`);
  if (!grid) return;
  grid.innerHTML = (charts || []).map((c, ci) => _wlDayChartThumbHtml(weekId, day, c, ci)).join('');
  // Re-mount the dropzone in its idle state (a mounted dropzone doesn't
  // need a hint text swap any more — its own "Processing…" state handles that)
  _wlMountDayDropzone(weekId, day);
}

function _wlCalAutoLoad() {
  document.querySelectorAll('.wl-cal-body').forEach(body => {
    if (!body.id) return;
    const weekId = body.id.replace('wl-cal-body-', '');
    const week   = _wlData.find(w => w.id === weekId);
    if (!week) return;
    // Build filters with saved preferences
    _wlCalBuildFilters(weekId);
    // Load if not already loaded
    const hasContent = body.querySelector('.wl-cal-day,.wl-cal-iframe-wrap,.wl-cal-error,.wl-cal-empty');
    if (!hasContent) {
      _wlCalLoad(weekId, week.weekDate, week.weekDateEnd || week.weekDate);
    }
  });
}


// ═══════════════════════════════════════════════════════════════════
//  WATCHLIST ECONOMIC CALENDAR
//  Primary:  investing.com economic calendar (embed iframe — always live)
//  Fallback: Fair Economy JSON (current+next week only)
//  The iframe approach is the only 100% reliable CORS-free method
//  for arbitrary week lookups without a backend.
// ═══════════════════════════════════════════════════════════════════

const _WL_CAL_CACHE   = {};
const _WL_CAL_FILTER  = {};
const _WL_CAL_TTL     = 15 * 60 * 1000;

// All tradeable currencies shown in FF calendar
const _WL_ALL_CURRENCIES = ['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','CNY'];

function _wlCalGetCurrencies() {
  try {
    const saved = localStorage.getItem('wl_cal_currencies');
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return ['USD','GBP','EUR']; // sensible default matching most FX pairs
}
function _wlCalSetCurrencies(curs) {
  localStorage.setItem('wl_cal_currencies', JSON.stringify(curs));
}
function _wlCalGetImpact() {
  return localStorage.getItem('wl_cal_impact') || 'high';
}
function _wlCalSetImpact(impact) {
  localStorage.setItem('wl_cal_impact', impact);
}

// Currency extracted from pair name
function _wlPairCurrencies(pairs) {
  const curs = new Set();
  (pairs || []).forEach(p => {
    const name = (p.name || '').toUpperCase();
    if (name.length >= 6) { curs.add(name.slice(0,3)); curs.add(name.slice(3,6)); }
    if (name.includes('XAU') || name.includes('GOLD')) { curs.add('XAU'); curs.add('USD'); }
    if (name.includes('NAS') || name.includes('US100')) curs.add('USD');
    if (name.includes('ES')  || name.includes('SPX'))   curs.add('USD');
    if (name.includes('DXY'))  curs.add('USD');
    if (name.includes('OIL') || name.includes('WTI'))   curs.add('USD');
  });
  return curs;
}

// Build the FF calendar URL with correct week param: forexfactory.com/calendar?week=may26.2026
function _wlCalBuildFFUrl(startDate) {
  const d   = new Date(startDate + 'T00:00:00');
  const mon = d.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  const day = d.getDate();
  const yr  = d.getFullYear();
  return `https://www.forexfactory.com/calendar?week=${mon}${day}.${yr}`;
}

async function _wlCalLoad(weekId, startDate, endDate, forceRefresh) {
  const body = document.getElementById(`wl-cal-body-${weekId}`);
  if (!body) return;

  const cached = _WL_CAL_CACHE[weekId];
  if (!forceRefresh && cached && (Date.now() - cached.ts) < _WL_CAL_TTL) {
    if (cached.source === 'iframe') _wlCalRenderIframe(body, startDate, weekId, endDate);
    else _wlCalRender(weekId, cached.events, startDate, endDate);
    return;
  }

  body.innerHTML = '<div class="wl-cal-loading"><span></span><span></span><span></span></div>';

  const wkStart  = new Date(startDate + 'T00:00:00');
  const wkEnd    = new Date((endDate || startDate) + 'T23:59:59');
  const todayStr = localToday();
  const isPastWeek = (endDate || startDate) < todayStr;

  // Helper: get monday of current week (YYYY-MM-DD)
  function _thisMonday() {
    const d = new Date(); const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  }
  const thisMonday = _thisMonday();
  // Check if the requested week is exactly last week
  const lastMonday = new Date(thisMonday + 'T00:00:00');
  lastMonday.setDate(lastMonday.getDate() - 7);
  const isLastWeek = startDate === lastMonday.toISOString().slice(0, 10)
    || (wkStart >= new Date(lastMonday.toISOString().slice(0,10) + 'T00:00:00')
        && wkEnd  <= new Date(lastMonday.toISOString().slice(0,10) + 'T00:00:00').setDate(lastMonday.getDate() + 6));

  let events = [];

  // ── Step 1: Supabase Edge Function proxy (handles any week server-side) ──
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/cal-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON}`,
        },
        body: JSON.stringify({ startDate, endDate: endDate || startDate }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        events = data;
      }
    }
  } catch (_) { /* fall through */ }

  // ── Step 2: Fair Economy JSON — current week, next week, AND last week ──
  // Note: lastweek endpoint only available for the immediately prior week.
  // For older past weeks, skip straight to iframe (no JSON source available).
  if (!events.length) {
    const feEndpoints = isPastWeek
      ? (isLastWeek ? ['https://nfs.faireconomy.media/ff_calendar_lastweek.json'] : [])
      : [
          'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
          'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
        ];
    for (const url of feEndpoints) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data)) continue;
        const week = data.filter(e => {
          if (!e.date) return false;
          const ed = new Date(e.date);
          return ed >= wkStart && ed <= wkEnd;
        });
        if (week.length) { events = week; break; }
      } catch (_) { continue; }
    }
  }

  // ── Step 3: allorigins proxy — only useful for current week fallback ──
  if (!events.length && !isPastWeek) {
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent('https://nfs.faireconomy.media/ff_calendar_thisweek.json')}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          events = data.filter(e => {
            if (!e.date) return false;
            const ed = new Date(e.date);
            return ed >= wkStart && ed <= wkEnd;
          });
        }
      }
    } catch (_) { /* fall through */ }
  }

  // Normalise schema
  events = events.map(e => ({
    title:    e.title    || e.name     || 'Event',
    country:  (e.country || e.currency || '').toUpperCase(),
    date:     e.date     || '',
    impact:   (e.impact  || e.volatility || 'low').toLowerCase(),
    forecast: e.forecast || '',
    previous: e.previous || '',
    actual:   e.actual   || '',
  })).filter(e => e.date);

  if (events.length) {
    _WL_CAL_CACHE[weekId] = { events, ts: Date.now(), source: 'json' };
    _wlCalBuildFilters(weekId);
    _wlCalRender(weekId, events, startDate, endDate);
    return;
  }

  // ── Step 4: Iframe fallback — always works, shows live FF for any week ──
  // For past weeks this is reached immediately (after Step 1 fails) since
  // Fair Economy JSON only carries current/next/lastweek data.
  _WL_CAL_CACHE[weekId] = { events: [], ts: Date.now(), source: 'iframe' };
  _wlCalRenderIframe(body, startDate, weekId, endDate);
}

function _wlCalRenderIframe(body, startDate, weekId, endDate) {
  const ffUrl = _wlCalBuildFFUrl(startDate);
  const todayStr = localToday();
  const isPastWeek = (endDate || startDate) < todayStr;
  const weekLabel = endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate;

  body.innerHTML = `
    <div class="wl-cal-iframe-wrap">
      <div class="wl-cal-iframe-notice">
        <span class="wl-cal-iframe-icon"><svg class="icn" aria-hidden="true"><use href="#ic-calendar"></use></svg></span>
        <div>
          <div class="wl-cal-iframe-title">${isPastWeek ? 'Historical Calendar' : 'Live Forex Factory Calendar'}</div>
          <div class="wl-cal-iframe-sub">${isPastWeek ? 'Events for week of ' : 'Showing events for '}${weekLabel}</div>
        </div>
        <a href="${ffUrl}" target="_blank" rel="noopener" class="wl-cal-ff-link">Open in FF ${icon('arrow-right', {cls:'icn-sm'})}</a>
      </div>
      <iframe
        src="${ffUrl}"
        class="wl-cal-iframe"
        title="Forex Factory Calendar"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="lazy"
        onload="_wlCalIframeLoaded(this)"
        onerror="_wlCalIframeFailed('${weekId}','${startDate}','${endDate || startDate}',this)"
      ></iframe>
      <div class="wl-cal-iframe-blocked" id="wl-cal-iframe-blocked-${weekId}" style="display:none">
        ${_wlCalIframeError(weekId, startDate, endDate || startDate)}
      </div>
    </div>`;

  // FF blocks iframes — show fallback after short timeout if still blank
  setTimeout(() => {
    const blocked = document.getElementById(`wl-cal-iframe-blocked-${weekId}`);
    const iframe  = body.querySelector('.wl-cal-iframe');
    if (blocked && iframe) {
      try {
        // If iframe is cross-origin blocked, doc will throw or be empty
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc || iframeDoc.body?.innerHTML?.trim() === '') {
          iframe.style.display = 'none';
          blocked.style.display = '';
        }
      } catch (_) {
        iframe.style.display = 'none';
        blocked.style.display = '';
      }
    }
  }, 4000);
}

function _wlCalIframeLoaded(iframe) {
  // If FF blocked embedding, the iframe will load but with empty body
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || doc.body?.innerHTML?.trim() === '') {
      const weekId = iframe.closest('.wl-cal-body')?.id?.replace('wl-cal-body-','');
      if (weekId) {
        iframe.style.display = 'none';
        const blocked = document.getElementById(`wl-cal-iframe-blocked-${weekId}`);
        if (blocked) blocked.style.display = '';
      }
    }
  } catch (_) {
    // Cross-origin — means it actually loaded (FF served it), so leave visible
  }
}

function _wlCalIframeFailed(weekId, startDate, endDate, iframe) {
  if (iframe) iframe.style.display = 'none';
  const blocked = document.getElementById(`wl-cal-iframe-blocked-${weekId}`);
  if (blocked) blocked.style.display = '';
}

function _wlCalIframeError(weekId, startDate, endDate) {
  const ffUrl = _wlCalBuildFFUrl(startDate);
  const todayStr = localToday();
  const isPastWeek = (endDate || startDate) < todayStr;
  const weekLabel = endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate;

  const note = isPastWeek
    ? `<div class="wl-cal-ff-fallback-sub">Historical calendar data is only available directly on Forex Factory. Click below to view past events for this week.</div>`
    : `<div class="wl-cal-ff-fallback-sub">Click below to open the calendar for this week in a new tab.</div>`;

  return `
    <div class="wl-cal-ff-fallback">
      <div class="wl-cal-ff-fallback-icon"><svg class="icn" aria-hidden="true"><use href="#ic-calendar"></use></svg></div>
      <div class="wl-cal-ff-fallback-title">${isPastWeek ? 'View Past Week on Forex Factory' : 'View on Forex Factory'}</div>
      ${note}
      <a href="${ffUrl}" target="_blank" rel="noopener" class="wl-btn-primary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;padding:9px 20px;border-radius:999px;font-size:12px;font-weight:700;background:var(--gold);color:#000">
        <svg class="icn" aria-hidden="true"><use href="#ic-calendar"></use></svg> Open FF Calendar — ${weekLabel}
      </a>
      <div style="margin-top:12px">
        <button class="wl-cal-retry" onclick="_wlCalLoad('${weekId}','${startDate}','${endDate}',true)"><svg class="icn" aria-hidden="true"><use href="#ic-refresh"></use></svg> Retry data fetch</button>
      </div>
    </div>`;
}

/* ── Build impact + currency filter buttons for a week ── */
function _wlCalBuildFilters(weekId) {
  const savedImpact = _wlCalGetImpact();
  _WL_CAL_FILTER[weekId] = savedImpact;

  const wrap = document.getElementById(`wl-cal-filter-wrap-${weekId}`);
  if (!wrap) return;
  const btns = [
    { key:'all',  label:'All' },
    { key:'high', label:'<svg class="icn icn-red" aria-hidden="true"><use href="#ic-dot"></use></svg> High' },
    { key:'med',  label:'<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-dot"></use></svg> Med' },
    { key:'low',  label:'<svg class="icn icn-muted" aria-hidden="true"><use href="#ic-dot-o"></use></svg> Low' },
  ];
  wrap.innerHTML = btns.map(b =>
    `<button class="wl-cal-filter-btn${b.key === savedImpact ? ' active' : ''}"
       data-impact="${b.key}"
       onclick="_wlCalFilter('${weekId}','${b.key}',this)">${b.label}</button>`
  ).join('');

  // Update currency label
  _wlCalUpdateCurLabel(weekId);
}

function _wlCalUpdateCurLabel(weekId) {
  const label = document.getElementById(`wl-cal-cur-label-${weekId}`);
  if (!label) return;
  const curs = _wlCalGetCurrencies();
  label.textContent = curs.length === _WL_ALL_CURRENCIES.length ? 'All Currencies' : curs.join(' · ');
}

function _wlCalFilter(weekId, impact, btn) {
  _WL_CAL_FILTER[weekId] = impact;
  _wlCalSetImpact(impact);
  const wrap = document.getElementById(`wl-cal-filter-wrap-${weekId}`);
  if (wrap) wrap.querySelectorAll('.wl-cal-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  const cached = _WL_CAL_CACHE[weekId];
  const week   = _wlData.find(w => w.id === weekId);
  if (cached && week) _wlCalRender(weekId, cached.events, week.weekDate, week.weekDateEnd || week.weekDate);
}

function _wlCalOpenCurrencyPicker(weekId) {
  const picker = document.getElementById(`wl-cal-cur-picker-${weekId}`);
  if (!picker) return;
  const isOpen = picker.style.display !== 'none';
  // Close all other pickers first
  document.querySelectorAll('.wl-cal-cur-picker').forEach(p => p.style.display = 'none');
  if (isOpen) return;

  const saved = _wlCalGetCurrencies();
  picker.innerHTML = `
    <div class="wl-cal-cur-picker-head">
      <span>Filter Currencies</span>
      <div style="display:flex;gap:6px">
        <button class="wl-cal-cur-quick" onclick="_wlCalCurSelectAll('${weekId}')">All</button>
        <button class="wl-cal-cur-quick" onclick="_wlCalCurSelectNone('${weekId}')">None</button>
        <button class="wl-cal-cur-done" onclick="_wlCalClosePicker('${weekId}')">Done ✓</button>
      </div>
    </div>
    <div class="wl-cal-cur-grid">
      ${_WL_ALL_CURRENCIES.map(c => `
        <label class="wl-cal-cur-item${saved.includes(c) ? ' checked' : ''}">
          <input type="checkbox" value="${c}"${saved.includes(c) ? ' checked' : ''}
                 onchange="_wlCalCurToggle('${weekId}','${c}',this)">
          <span class="wl-cal-cur-flag">${_wlCurFlag(c)}</span>
          <span>${c}</span>
        </label>`).join('')}
    </div>`;
  picker.style.display = '';
}

function _wlCurFlag(cur) {
  return icon('globe', {cls:'icn-sm'});
}

function _wlCalCurToggle(weekId, cur, chk) {
  const saved = _wlCalGetCurrencies();
  const updated = chk.checked ? [...new Set([...saved, cur])] : saved.filter(c => c !== cur);
  _wlCalSetCurrencies(updated);
  // Update label
  _wlCalUpdateCurLabel(weekId);
  // Re-render from cache
  const cached = _WL_CAL_CACHE[weekId];
  const week   = _wlData.find(w => w.id === weekId);
  if (cached?.events && week) _wlCalRender(weekId, cached.events, week.weekDate, week.weekDateEnd || week.weekDate);
  // Update checked style
  const item = chk.closest('.wl-cal-cur-item');
  if (item) item.classList.toggle('checked', chk.checked);
}

function _wlCalCurSelectAll(weekId) {
  _wlCalSetCurrencies([..._WL_ALL_CURRENCIES]);
  const picker = document.getElementById(`wl-cal-cur-picker-${weekId}`);
  if (picker) picker.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = true; c.closest('.wl-cal-cur-item').classList.add('checked'); });
  _wlCalUpdateCurLabel(weekId);
  const cached = _WL_CAL_CACHE[weekId];
  const week   = _wlData.find(w => w.id === weekId);
  if (cached?.events && week) _wlCalRender(weekId, cached.events, week.weekDate, week.weekDateEnd || week.weekDate);
}

function _wlCalCurSelectNone(weekId) {
  _wlCalSetCurrencies([]);
  const picker = document.getElementById(`wl-cal-cur-picker-${weekId}`);
  if (picker) picker.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = false; c.closest('.wl-cal-cur-item').classList.remove('checked'); });
  _wlCalUpdateCurLabel(weekId);
  const cached = _WL_CAL_CACHE[weekId];
  const week   = _wlData.find(w => w.id === weekId);
  if (cached?.events && week) _wlCalRender(weekId, cached.events, week.weekDate, week.weekDateEnd || week.weekDate);
}

function _wlCalClosePicker(weekId) {
  const picker = document.getElementById(`wl-cal-cur-picker-${weekId}`);
  if (picker) picker.style.display = 'none';
}

function _wlCalRender(weekId, events, startDate, endDate) {
  const body   = document.getElementById(`wl-cal-body-${weekId}`);
  if (!body) return;

  const week     = _wlData.find(w => w.id === weekId);
  const pairCurs = _wlPairCurrencies(week?.pairs || []);
  const impact   = _WL_CAL_FILTER[weekId] || _wlCalGetImpact();
  const savedCurs = _wlCalGetCurrencies();

  // Apply impact filter
  let filtered = events.filter(e => {
    if (impact === 'high') return e.impact === 'high';
    if (impact === 'med')  return e.impact === 'high' || e.impact === 'medium' || e.impact === 'med';
    if (impact === 'low')  return true; // low shows all
    return true; // 'all'
  });

  // Apply currency filter (if not "all currencies")
  if (savedCurs.length > 0 && savedCurs.length < _WL_ALL_CURRENCIES.length) {
    filtered = filtered.filter(e => savedCurs.includes(e.country));
  }

  if (!filtered.length) {
    body.innerHTML = `<div class="wl-cal-empty">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-inbox"></use></svg></span>
      <span>No ${impact !== 'all' ? impact + '-impact ' : ''}events for selected currencies this week</span>
    </div>`;
    return;
  }

  // Group by day
  const dayMap = {};
  filtered.forEach(e => {
    const d = e.date ? e.date.slice(0,10) : 'Unknown';
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(e);
  });

  const today = localToday();
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const daysHtml = Object.keys(dayMap).sort().map(day => {
    const dt       = new Date(day + 'T00:00:00');
    const dayName  = dayNames[dt.getDay()];
    const dayNum   = dt.getDate();
    const isToday  = day === today;
    const isPast   = day < today;
    const dayEvents = dayMap[day];
    const hasHigh  = dayEvents.some(e => e.impact === 'high');

    const eventsHtml = dayEvents.map(e => {
      const impactClass = e.impact === 'high' ? 'high'
        : (e.impact === 'medium' || e.impact === 'med') ? 'med' : 'low';
      const isMyPair = pairCurs.has(e.country);
      const timeStr  = e.date && e.date.includes('T')
        ? formatUserTime(new Date(e.date)) + ' ' + getUserTzOffsetLabel()
        : 'All day';

      return `
        <div class="wl-cal-event ${impactClass}${isMyPair ? ' my-pair' : ''}${e.actual ? ' released' : ''}">
          <div class="wl-cal-event-impact ${impactClass}"></div>
          <div class="wl-cal-event-body">
            <div class="wl-cal-event-row">
              <span class="wl-cal-currency">${e.country}</span>
              <span class="wl-cal-event-name">${e.title}</span>
              ${isMyPair ? '<span class="wl-cal-pair-tag">' + icon('star',{cls:'icn-sm'}) + '</span>' : ''}
            </div>
            <div class="wl-cal-event-meta">
              <span class="wl-cal-time">${timeStr}</span>
              ${e.forecast ? `<span class="wl-cal-meta-val">F: ${e.forecast}</span>` : ''}
              ${e.previous ? `<span class="wl-cal-meta-val">P: ${e.previous}</span>` : ''}
              ${e.actual   ? `<span class="wl-cal-meta-val actual">A: ${e.actual}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="wl-cal-day${isToday ? ' today' : ''}${isPast ? ' past' : ''}">
        <div class="wl-cal-day-head">
          <div class="wl-cal-day-label${isToday ? ' today' : ''}">
            <span class="wl-cal-day-name">${dayName}</span>
            <span class="wl-cal-day-num">${dayNum}</span>
          </div>
          <div class="wl-cal-day-count">
            ${hasHigh ? '<span class="wl-cal-high-dot"></span>' : ''}
            ${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div class="wl-cal-events">${eventsHtml}</div>
      </div>`;
  }).join('');

  body.innerHTML = daysHtml;
}

/* ═════════════ ADD / EDIT WEEK MODAL ═════════════ */
function wlAddWeek() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,'0');
  const d = String(today.getDate()).padStart(2,'0');
  const dateStr = `${y}-${m}-${d}`;
  _wlShowWeekModal(null, dateStr);
}

function _wlEditWeek(id) {
  const week = _wlData.find(w => w.id === id);
  if (!week) return;
  _wlShowWeekModal(week, week.weekDate);
}

function _wlShowWeekModal(week, defaultDate) {
  const isEdit = !!week;
  document.getElementById('wl-modal-title').textContent = isEdit ? 'Edit Week' : 'New Week';
  document.getElementById('wl-modal-body').innerHTML = `
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">Week Start (Monday)</label>
        <input type="date" class="wl-form-input" id="wl-f-date" value="${week ? week.weekDate : defaultDate}" onchange="_wlAutoFillEndDate()">
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Week End (Friday)</label>
        <input type="date" class="wl-form-input" id="wl-f-date-end" value="${week ? week.weekDateEnd || '' : ''}">
      </div>
    </div>
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">DXY Bias</label>
        <select class="wl-form-select" id="wl-f-dxy">
          ${['bull','bear','neu'].map(v => `<option value="${v}"${(!week&&v==='neu')||(week&&week.dxy===v)?' selected':''}>${v==='bull'?'<svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg> Bullish':v==='bear'?'<svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg> Bearish':'→ Neutral'}</option>`).join('')}
        </select>
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Market Bias</label>
        <select class="wl-form-select" id="wl-f-market">
          ${['risk-on','risk-off','neu'].map(v => `<option value="${v}"${(!week&&v==='neu')||(week&&week.market===v)?' selected':''}>${v==='risk-on'?'<svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg> Risk-On':v==='risk-off'?'<svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg> Risk-Off':'→ Neutral'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="wl-form-actions">
      ${isEdit ? `<button class="wl-btn-danger" onclick="_wlConfirmDeleteWeek('${week.id}');wlCloseModal()">Delete</button>` : ''}
      <button class="wl-btn-secondary" onclick="wlCloseModal()">Cancel</button>
      <button class="wl-btn-primary" onclick="_wlSaveWeekForm(${isEdit ? `'${week.id}'` : 'null'})">
        ${isEdit ? 'Save Changes' : 'Create Week'}
      </button>
    </div>
  `;
  document.getElementById('wl-modal-overlay').classList.add('open');
  document.getElementById('wl-modal').classList.add('open');
}

/* Auto-fill end date (Friday) when Monday is picked */
function _wlAutoFillEndDate() {
  const startEl = document.getElementById('wl-f-date');
  const endEl   = document.getElementById('wl-f-date-end');
  if (!startEl || !endEl || !startEl.value) return;
  const start = new Date(startEl.value + 'T00:00:00');
  const day   = start.getDay(); // 0=Sun,1=Mon...5=Fri
  // Move to Monday if not already, then add 4 days to get Friday
  const toMon = day === 0 ? 1 : day === 1 ? 0 : -(day - 1);
  const mon   = new Date(start);
  mon.setDate(mon.getDate() + toMon);
  const fri   = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  endEl.value = fri.toISOString().slice(0, 10);
}

async function _wlSaveWeekForm(existingId) {
  const dateStart = document.getElementById('wl-f-date').value;
  const dateEnd   = document.getElementById('wl-f-date-end').value;
  const dxy       = document.getElementById('wl-f-dxy').value;
  const mkt       = document.getElementById('wl-f-market').value;
  if (!dateStart) return;

  // Build label: "26 May – 30 May 2026" or "26–30 May 2026"
  const dtS   = new Date(dateStart + 'T00:00:00');
  const optsD = { day: 'numeric', month: 'short' };
  const optsF = { day: 'numeric', month: 'short', year: 'numeric' };
  let label;
  if (dateEnd) {
    const dtE = new Date(dateEnd + 'T00:00:00');
    label = dtS.toLocaleDateString('en-GB', optsD) + ' – ' + dtE.toLocaleDateString('en-GB', optsF);
  } else {
    label = 'Week of ' + dtS.toLocaleDateString('en-GB', optsF);
  }
  const qKey = _wlQuarterKey(dateStart);

  if (existingId) {
    const week = _wlData.find(w => w.id === existingId);
    if (week) {
      week.weekDate    = dateStart;
      week.weekDateEnd = dateEnd;
      week.weekLabel   = label;
      week.quarter     = qKey;
      week.dxy         = dxy;
      week.market      = mkt;
      await _wlSaveWeek(week);
    }
  } else {
    const week = { id: null, quarter: qKey, weekLabel: label, weekDate: dateStart, weekDateEnd: dateEnd, dxy, market: mkt, pairs: [], meta: {} };
    _wlNormWeekMeta(week);
    await _wlSaveWeek(week);
    _wlActiveQ      = qKey;
    _wlActiveWeekId = week.id;
  }
  wlCloseModal();
  buildWatchlist();
}

async function _wlConfirmDeleteWeek(id) {
  const week = _wlData.find(w => w.id === id);
  if (!week) return;
  if (!confirm(`Delete "${week.weekLabel}"? This cannot be undone.`)) return;
  const ok = await _wlDeleteWeek(id);
  if (ok) {
    if (_wlActiveWeekId === id) _wlActiveWeekId = null;
    buildWatchlist();
  }
}

function wlCloseModal() {
  document.getElementById('wl-modal-overlay').classList.remove('open');
  document.getElementById('wl-modal').classList.remove('open');
}

/* ═════════════ ADD / EDIT PAIR MODAL ═════════════ */
let _wlEditingPairWeekId  = null;
let _wlEditingPairIdx     = null;
let _wlPendingCharts      = [];    // { url, label } not yet saved

function _wlAddPair(weekId) {
  _wlEditingPairWeekId = weekId;
  _wlEditingPairIdx    = null;
  _wlPendingCharts     = [];
  _wlShowPairModal(null);
}

function _wlOpenPairDetail(weekId, pairIdx) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  _wlShowPairViewModal(weekId, pairIdx, p);
}

/* ── Small star-rating control builder (click to set 0-5) ── */
function _wlStarPicker(value, onClickFn) {
  return Array.from({length: 5}, (_, i) => {
    const filled = i < value;
    return `<span class="wl-star-btn" onclick="${onClickFn}(${i+1})">${icon(filled ? 'star' : 'star-o', {cls: filled ? 'icn-gold' : ''})}</span>`;
  }).join('');
}

/* ── EXPANDABLE PAIR ANALYSIS modal — Weekly → Daily → 4H → 1H → Execution timeline ── */
function _wlShowPairViewModal(weekId, pairIdx, p) {
  _wlNormPair(p);
  const priClass  = p.priority === 'high' ? 'high' : p.priority === 'med' ? 'med' : 'low';
  const biasClass = p.bias === 'bull' ? 'bull' : 'bear';
  const biasLabel = p.bias === 'bull' ? `${icon('arrow-up')} Bullish` : `${icon('arrow-down')} Bearish`;
  const dirClass  = p.direction === 'long' ? 'bull' : p.direction === 'short' ? 'bear' : 'neu';
  const dirLabel  = p.direction === 'long' ? `${icon('trend-up')} Long` : p.direction === 'short' ? `${icon('trend-down')} Short` : `${icon('clock')} Wait`;
  const { checked, total } = _wlLiqCount(p.liq);
  const charts = p.charts || [];

  const stageKeyToTags = {
    Weekly: ['Weekly'], Daily: ['Daily'], '4H': ['4H'], '1H': ['1H'], Execution: ['Entry','Results'],
  };

  const timelineHtml = _WL_STAGES.map((stage, si) => {
    const sd = p.stages[stage];
    const bClass = sd.bias === 'bull' ? 'bull' : sd.bias === 'bear' ? 'bear' : 'neu';
    const bLabel = sd.bias === 'bull' ? `${icon('arrow-up')} Bull` : sd.bias === 'bear' ? `${icon('arrow-down')} Bear` : '→ Neu';
    const stageCharts = charts.filter(c => stageKeyToTags[stage].includes(c.tag));
    const liqGrid = _WL_LIQ_ITEMS.map(item => `
      <button class="wl-stage-liq-chip${sd.liq[item.k] ? ' checked' : ''}"
        onclick="_wlToggleStageLiq('${weekId}',${pairIdx},'${stage}','${item.k}')">
        ${icon(sd.liq[item.k] ? 'check' : 'dot-o')} ${item.l}
      </button>`).join('');

    return `
    <div class="wl-stage-block">
      <div class="wl-stage-connector${si === 0 ? ' first' : ''}"></div>
      <div class="wl-stage-head">
        <div class="wl-stage-name">${stage}</div>
        <button class="wl-badge ${bClass}" style="cursor:pointer" onclick="_wlCycleStageBias('${weekId}',${pairIdx},'${stage}')">${bLabel}</button>
      </div>
      <div class="wl-stage-body">
        <div class="wl-stage-charts">
          ${stageCharts.length
            ? stageCharts.map(c => `<img class="wl-stage-chart-thumb" src="${c.url}" alt="${stage} chart" onclick="_wlOpenLightbox('${c.url}')" loading="lazy">`).join('')
            : `<div class="wl-stage-no-chart">No ${stage.toLowerCase()} screenshots yet</div>`}
        </div>
        <div class="wl-stage-field">
          <label>Expectations</label>
          <textarea rows="2" placeholder="What are you expecting to see at ${stage}?"
            onblur="_wlSaveStageField('${weekId}',${pairIdx},'${stage}','expectations',this.value)">${sd.expectations || ''}</textarea>
        </div>
        <div class="wl-stage-field">
          <label>Liquidity Targets</label>
          <textarea rows="2" placeholder="Key liquidity levels / targets at this stage…"
            onblur="_wlSaveStageField('${weekId}',${pairIdx},'${stage}','liquidityTargets',this.value)">${sd.liquidityTargets || ''}</textarea>
        </div>
        <div class="wl-stage-field">
          <label>Confluences</label>
          <div class="wl-stage-liq-grid">${liqGrid}</div>
        </div>
        <div class="wl-stage-field wl-stage-risk-row">
          <label>Risk</label>
          <span class="wl-star-row">${_wlStarPicker(sd.risk, `_wlSetStageRisk('${weekId}',${pairIdx},'${stage}',`)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('wl-pair-modal-title').textContent = p.name;
  document.getElementById('wl-pair-modal-body').innerHTML = `
    <div class="wl-view-header">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="wl-badge ${biasClass}">${biasLabel}</span>
        <span class="wl-badge ${dirClass}">${dirLabel}</span>
        <span class="wl-badge ${priClass === 'high' ? 'bear' : priClass === 'med' ? '' : 'bull'}"
          style="${priClass==='med'?'background:rgba(251,191,36,0.12);color:var(--gold);border-color:rgba(251,191,36,0.3)':''}">
          ${p.priority === 'high' ? `${icon('dot',{cls:'icn-red'})} High` : p.priority === 'med' ? `${icon('dot',{cls:'icn-gold'})} Medium` : `${icon('dot',{cls:'icn-green'})} Low`}
        </span>
        ${p.model ? `<span class="wl-model-chip">${p.model}</span>` : ''}
        <span class="wl-confluence-chip">${checked}/${total} confirmations</span>
      </div>
      <div class="wl-view-header-row2">
        ${_wlRingSvg(p.confidence, {size:48, stroke:5, centerHtml:`<span class="wl-mini-ring-num">${p.confidence}</span>`})}
        <span class="wl-star-row">${Array.from({length:5},(_,i)=>icon(i<p.risk?'star':'star-o',{cls:i<p.risk?'icn-gold':''})).join('')}</span>
      </div>
      ${p.expectedMove ? `<div class="wl-view-note"><strong>Expected move:</strong> ${p.expectedMove}</div>` : ''}
      ${p.note ? `<div class="wl-view-note">${p.note}</div>` : ''}
    </div>

    <div class="wl-view-section-label" style="margin-top:16px">ANALYSIS TIMELINE</div>
    <div class="wl-stage-timeline">${timelineHtml}</div>

    <div class="wl-view-charts-section">
      <div class="wl-view-section-label">
        ALL SCREENSHOTS · ${charts.length} image${charts.length !== 1 ? 's' : ''}
        <button id="wl-compare-btn" class="wl-btn-secondary" style="display:none;margin-left:10px;padding:3px 10px;font-size:11px" onclick="_wlOpenCompare()">${icon('swap')} Compare</button>
      </div>
      ${charts.length > 0
        ? `<div class="wl-view-chart-grid">${charts.map((c, ci) =>
            `<div class="wl-view-chart-item">
              <input type="checkbox" class="wl-compare-check" onclick="event.stopPropagation();_wlToggleCompareSelect('${c.url}',this)">
              <img src="${c.url}" alt="chart ${ci+1}" loading="lazy" onclick="_wlOpenLightbox('${c.url}')">
              <div class="wl-view-chart-label">${c.tag ? `[${c.tag}] ` : ''}${c.label || 'Chart ' + (ci+1)}</div>
            </div>`
          ).join('')}</div>`
        : `<div class="wl-view-no-charts">No charts uploaded yet</div>`}
    </div>

    <div class="wl-form-actions" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--glass-border)">
      <button class="wl-btn-secondary" onclick="wlClosePairModal()">Close</button>
      <button class="wl-btn-primary" onclick="wlClosePairModal();_wlEditPairDirect('${weekId}',${pairIdx})">${icon('edit')} Edit</button>
    </div>
  `;

  _wlCompareSelection = [];
  document.getElementById('wl-pair-modal-overlay').classList.add('open');
  document.getElementById('wl-pair-modal').classList.add('open');
  _wlAnimateRings(document.getElementById('wl-pair-modal-body'));
}

async function _wlCycleStageBias(weekId, pairIdx, stage) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  _wlNormPair(p);
  const opts = ['bull','bear','neu'];
  p.stages[stage].bias = opts[(opts.indexOf(p.stages[stage].bias) + 1) % opts.length];
  await _wlSaveWeek(week);
  _wlShowPairViewModal(weekId, pairIdx, p);
  _wlRenderWeeks();
}

async function _wlSaveStageField(weekId, pairIdx, stage, field, value) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  _wlNormPair(p);
  p.stages[stage][field] = value;
  await _wlSaveWeek(week);
}

async function _wlToggleStageLiq(weekId, pairIdx, stage, key) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  _wlNormPair(p);
  p.stages[stage].liq[key] = !p.stages[stage].liq[key];
  await _wlSaveWeek(week);
  _wlShowPairViewModal(weekId, pairIdx, p);
  _wlRenderWeeks();
}

async function _wlSetStageRisk(weekId, pairIdx, stage, val) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  _wlNormPair(p);
  p.stages[stage].risk = p.stages[stage].risk === val ? 0 : val; // click same star again to clear
  await _wlSaveWeek(week);
  _wlShowPairViewModal(weekId, pairIdx, p);
}

function _wlEditPairDirect(weekId, pairIdx) {
  const week = _wlData.find(w => w.id === weekId);
  if (!week) return;
  const p = week.pairs[pairIdx];
  if (!p) return;
  _wlEditingPairWeekId = weekId;
  _wlEditingPairIdx    = pairIdx;
  _wlPendingCharts     = (p.charts || []).map(c => ({...c}));
  _wlShowPairModal(p);
}

function _wlChartThumbHtml(c, ci) {
  return `
    <div class="wl-chart-thumb-wrap" draggable="true"
      ondragstart="_wlChartDragStart(event,${ci})" ondragover="_wlChartDragOver(event)"
      ondrop="_wlChartDrop(event,${ci})" ondragend="_wlChartDragEnd(event)">
      <span class="wl-chart-thumb-drag" title="Drag to reorder">${icon('sort')}</span>
      <img class="wl-chart-thumb" src="${c.url}" alt="chart" onclick="_wlOpenLightbox('${c.url}')">
      <select class="wl-chart-thumb-tag" onchange="_wlSetPendingChartTag(${ci},this.value)">
        <option value=""${!c.tag ? ' selected' : ''}>Untagged</option>
        ${_WL_CHART_TAGS.map(t => `<option value="${t}"${c.tag===t?' selected':''}>${t}</option>`).join('')}
      </select>
      <div class="wl-chart-thumb-label">${c.label || 'Chart ' + (ci+1)}</div>
      <button class="wl-chart-thumb-del" onclick="_wlRemovePendingChart(${ci})">${icon('close')}</button>
    </div>`;
}

let _wlChartDragFromIdx = null;
function _wlChartDragStart(ev, idx) { _wlChartDragFromIdx = idx; ev.currentTarget.classList.add('dragging'); }
function _wlChartDragOver(ev) { ev.preventDefault(); }
function _wlChartDragEnd(ev) { ev.currentTarget.classList.remove('dragging'); }
function _wlChartDrop(ev, toIdx) {
  ev.preventDefault();
  if (_wlChartDragFromIdx === null || _wlChartDragFromIdx === toIdx) return;
  const [moved] = _wlPendingCharts.splice(_wlChartDragFromIdx, 1);
  _wlPendingCharts.splice(toIdx, 0, moved);
  _wlChartDragFromIdx = null;
  const gallery = document.getElementById('wl-chart-gallery');
  if (gallery) gallery.innerHTML = _wlPendingCharts.map((c, ci) => _wlChartThumbHtml(c, ci)).join('');
}

function _wlSetPendingChartTag(idx, tag) {
  if (_wlPendingCharts[idx]) _wlPendingCharts[idx].tag = tag;
}

function _wlShowPairModal(pair) {
  const isEdit = pair !== null && _wlEditingPairIdx !== null;
  if (pair) _wlNormPair(pair);
  const tfDefaults = ['Weekly','Daily','4H','1H'].map(tf => ({
    tf, bias: (pair && pair.tfs && pair.tfs.find(t => t.tf === tf)?.bias) || 'neu'
  }));

  document.getElementById('wl-pair-modal-title').textContent = isEdit ? `Edit: ${pair.name}` : 'Add Pair Analysis';

  const chartGallery = _wlPendingCharts.map((c, ci) => _wlChartThumbHtml(c, ci)).join('');

  const tfRows = tfDefaults.map((tf, ti) => `
    <div class="wl-tf-opt">
      <span style="color:var(--text2);font-size:11px;min-width:42px">${tf.tf}</span>
      <select onchange="_wlTfChange(${ti},this.value)">
        ${_WL_BIAS_OPTS.map(b => `<option value="${b}"${b===tf.bias?' selected':''}>${b==='bull'?'<svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg> Bull':b==='bear'?'<svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg> Bear':'→ Neu'}</option>`).join('')}
      </select>
    </div>
  `).join('');

  window._wlFormConfidence = pair ? pair.confidence : 50;
  window._wlFormRisk       = pair ? pair.risk : 0;
  window._wlFormLiq        = pair ? {...pair.liq} : _wlEmptyLiq();

  const liqCheckboxes = _WL_LIQ_ITEMS.map(item => `
    <button type="button" class="wl-stage-liq-chip${window._wlFormLiq[item.k] ? ' checked' : ''}" id="wl-p-liq-${item.k}"
      onclick="_wlFormToggleLiq('${item.k}')">
      ${icon(window._wlFormLiq[item.k] ? 'check' : 'dot-o')} ${item.l}
    </button>`).join('');

  document.getElementById('wl-pair-modal-body').innerHTML = `
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">Pair</label>
        ${isEdit
          ? `<input type="text" class="wl-form-input" id="wl-p-name" value="${pair.name}">`
          : `<select class="wl-form-select" id="wl-p-name">
              ${_WL_PAIRS_DEFAULT.map(p => `<option>${p}</option>`).join('')}
              <option value="__custom__">＋ Custom…</option>
            </select>`}
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Priority</label>
        <select class="wl-form-select" id="wl-p-priority">
          ${['high','med','low'].map(v => `<option value="${v}"${pair&&pair.priority===v?' selected':''}>${v==='high'?'<svg class="icn icn-red" aria-hidden="true"><use href="#ic-dot"></use></svg> High':v==='med'?'<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-dot"></use></svg> Medium':'<svg class="icn icn-green" aria-hidden="true"><use href="#ic-dot"></use></svg> Low'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">Bias</label>
        <select class="wl-form-select" id="wl-p-bias">
          <option value="bull"${pair&&pair.bias==='bull'?' selected':''}><svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg> Bullish</option>
          <option value="bear"${pair&&pair.bias==='bear'?' selected':''}><svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg> Bearish</option>
        </select>
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Trade Direction</label>
        <select class="wl-form-select" id="wl-p-direction">
          ${_WL_DIRECTIONS.map(d => `<option value="${d}"${pair&&pair.direction===d?' selected':''}>${d==='long'?'Long':d==='short'?'Short':'Wait'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">Model Used</label>
        <select class="wl-form-select" id="wl-p-model">
          <option value=""${!pair||!pair.model?' selected':''}>— Select —</option>
          ${_WL_MODELS().map(m => `<option value="${m}"${pair&&pair.model===m?' selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Confidence — <span id="wl-p-conf-readout">${window._wlFormConfidence}</span>%</label>
        <input type="range" min="0" max="100" step="5" id="wl-p-confidence" value="${window._wlFormConfidence}"
          oninput="document.getElementById('wl-p-conf-readout').textContent=this.value">
      </div>
    </div>
    <div class="wl-form-row">
      <label class="wl-form-label">Timeframe Alignment</label>
      <div class="wl-tf-selector" id="wl-tf-selector">${tfRows}</div>
    </div>
    <div class="wl-form-row">
      <label class="wl-form-label">Liquidity Checklist</label>
      <div class="wl-stage-liq-grid">${liqCheckboxes}</div>
    </div>
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">Risk Rating</label>
        <span class="wl-star-row" id="wl-p-risk-stars">${_wlStarPicker(window._wlFormRisk, '_wlFormSetRisk')}</span>
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Expected Move</label>
        <input type="text" class="wl-form-input" id="wl-p-expected" placeholder="e.g. Weekly bullish continuation into external liquidity" value="${pair&&pair.expectedMove||''}">
      </div>
    </div>
    <div class="wl-form-row">
      <label class="wl-form-label">Key Levels / Setup Notes</label>
      <textarea class="wl-form-textarea" id="wl-p-note" placeholder="Setup, key OB/FVG levels, strategy, killzone…" rows="3">${pair&&pair.note||''}</textarea>
    </div>
    <div class="wl-form-row">
      <label class="wl-form-label">Chart Images <span style="font-weight:400;color:var(--text3);text-transform:none;letter-spacing:0">— tag each by timeframe/stage</span></label>
      ${_wlPendingCharts.length > 0 ? `<div class="wl-chart-gallery" id="wl-chart-gallery">${chartGallery}</div>` : ''}
      <div id="wl-chart-dropzone"></div>
    </div>
    <div class="wl-form-actions">
      ${isEdit ? `<button class="wl-btn-danger" onclick="_wlDeletePair()">Remove Pair</button>` : ''}
      <button class="wl-btn-secondary" onclick="wlClosePairModal()">Cancel</button>
      <button class="wl-btn-primary" onclick="_wlSavePair()" id="wl-p-save-btn">${isEdit ? 'Save Changes' : 'Add to Watchlist'}</button>
    </div>
  `;

  // Store TF biases in memory for later read
  window._wlTfBiases = tfDefaults.map(t => t.bias);

  mountDropzone('wl-chart-dropzone', {
    multiple: true,
    showPreview: false, // this zone already has its own thumbnail gallery above
    primaryText: 'Drag & drop chart screenshots here',
    secondaryText: 'or click to browse — you can select several at once',
    onFiles: files => _wlProcessChartFiles(files),
  });

  document.getElementById('wl-pair-modal-overlay').classList.add('open');
  document.getElementById('wl-pair-modal').classList.add('open');
}

function _wlTfChange(idx, val) {
  if (!window._wlTfBiases) window._wlTfBiases = [];
  window._wlTfBiases[idx] = val;
}

function _wlFormSetRisk(val) {
  window._wlFormRisk = window._wlFormRisk === val ? 0 : val;
  const el = document.getElementById('wl-p-risk-stars');
  if (el) el.innerHTML = _wlStarPicker(window._wlFormRisk, '_wlFormSetRisk');
}

function _wlFormToggleLiq(key) {
  window._wlFormLiq[key] = !window._wlFormLiq[key];
  const btn = document.getElementById(`wl-p-liq-${key}`);
  if (btn) {
    btn.classList.toggle('checked', window._wlFormLiq[key]);
    const item = _WL_LIQ_ITEMS.find(i => i.k === key);
    btn.innerHTML = `${icon(window._wlFormLiq[key] ? 'check' : 'dot-o')} ${item.l}`;
  }
}

// Legacy entry point (kept in case any old markup/input still calls it directly)
async function _wlHandleChartUpload(input) {
  const files = Array.from(input.files);
  input.value = '';
  return _wlProcessChartFiles(files);
}

async function _wlProcessChartFiles(files) {
  if (!files.length) return;
  const btn = document.getElementById('wl-p-save-btn');
  if (btn) { btn.textContent = 'Uploading…'; btn.disabled = true; }

  let fellBackToBase64 = false;
  for (const file of files) {
    // Try Supabase storage first — base64 is only a last-resort fallback,
    // since it bloats journal_watchlist rows and slows down every load.
    let finalUrl = _currentUser ? await _wlUploadChart(file) : null;
    if (!finalUrl) {
      fellBackToBase64 = true;
      finalUrl = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(file);
      });
    }
    _wlPendingCharts.push({ url: finalUrl, label: file.name.replace(/\.[^.]+$/, ''), tag: '' });
  }
  if (fellBackToBase64) showToast('Chart upload to cloud storage failed — saved locally instead', 'danger');
  if (btn) { btn.textContent = _wlEditingPairIdx !== null ? 'Save Changes' : 'Add to Watchlist'; btn.disabled = false; }

  // Refresh gallery in modal
  const gallery = document.getElementById('wl-chart-gallery');
  const galleryHtml = _wlPendingCharts.map((c, ci) => _wlChartThumbHtml(c, ci)).join('');
  if (gallery) {
    gallery.innerHTML = galleryHtml;
  } else {
    // Insert gallery above the dropzone
    const zone = document.getElementById('wl-chart-dropzone');
    if (zone) {
      const div = document.createElement('div');
      div.className = 'wl-chart-gallery';
      div.id = 'wl-chart-gallery';
      div.innerHTML = galleryHtml;
      zone.parentNode.insertBefore(div, zone);
    }
  }
}

function _wlRemovePendingChart(idx) {
  _wlPendingCharts.splice(idx, 1);
  const gallery = document.getElementById('wl-chart-gallery');
  if (gallery) {
    gallery.innerHTML = _wlPendingCharts.map((c, ci) => _wlChartThumbHtml(c, ci)).join('');
  }
}

async function _wlSavePair() {
  const week = _wlData.find(w => w.id === _wlEditingPairWeekId);
  if (!week) return;

  const nameEl = document.getElementById('wl-p-name');
  let   name   = nameEl ? nameEl.value : '';
  if (name === '__custom__') {
    name = prompt('Enter pair name (e.g. EURCAD):');
    if (!name) return;
  }
  if (!name) return;

  const priority     = document.getElementById('wl-p-priority').value;
  const bias         = document.getElementById('wl-p-bias').value;
  const direction    = document.getElementById('wl-p-direction').value;
  const model        = document.getElementById('wl-p-model').value;
  const confidence   = parseInt(document.getElementById('wl-p-confidence').value, 10) || 0;
  const expectedMove = document.getElementById('wl-p-expected').value;
  const note         = document.getElementById('wl-p-note').value;
  const tfs      = ['Weekly','Daily','4H','1H'].map((tf, i) => ({
    tf, bias: (window._wlTfBiases && window._wlTfBiases[i]) || 'neu'
  }));

  const existing = _wlEditingPairIdx !== null ? week.pairs[_wlEditingPairIdx] : null;

  const pairData = {
    name: name.toUpperCase(), priority, bias, direction, model, confidence,
    risk: window._wlFormRisk || 0, expectedMove, note, tfs,
    liq: {...window._wlFormLiq},
    charts: [..._wlPendingCharts],
    stages: existing ? existing.stages : undefined,
    archived: existing ? existing.archived : false,
  };
  _wlNormPair(pairData);

  if (_wlEditingPairIdx !== null) {
    week.pairs[_wlEditingPairIdx] = pairData;
  } else {
    week.pairs.push(pairData);
  }

  await _wlSaveWeek(week);
  wlClosePairModal();
  _wlRenderWeeks();
}

async function _wlDeletePair() {
  if (_wlEditingPairIdx === null) return;
  const week = _wlData.find(w => w.id === _wlEditingPairWeekId);
  if (!week) return;
  week.pairs.splice(_wlEditingPairIdx, 1);
  await _wlSaveWeek(week);
  wlClosePairModal();
  _wlRenderWeeks();
}

function wlClosePairModal() {
  document.getElementById('wl-pair-modal-overlay').classList.remove('open');
  document.getElementById('wl-pair-modal').classList.remove('open');
  _wlEditingPairWeekId = null;
  _wlEditingPairIdx    = null;
  _wlPendingCharts     = [];
}

/* ── Lightbox ── */
/* ══════════════════════════════════════════════════════════════════
   LIGHTBOX v2 — zoom/pan, fullscreen, and a lightweight annotation tool
   ══════════════════════════════════════════════════════════════════ */
let _wlLb = { url: '', scale: 1, tx: 0, ty: 0, panning: false, lastX: 0, lastY: 0 };

/* ── Paste-to-upload: Ctrl+V a copied screenshot straight into the watchlist ── */
if (typeof document !== 'undefined') {
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const imgFiles = Array.from(items)
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (!imgFiles.length) return;

    // Priority 1: the pair add/edit modal, if it's open
    const pairModal = document.getElementById('wl-pair-modal');
    if (pairModal && pairModal.classList.contains('open')) {
      e.preventDefault();
      _wlProcessChartFiles(imgFiles);
      return;
    }

    // Priority 2: the Watchlist page's active day gameplan, if visible
    const wlPage = document.getElementById('page-watchlist');
    if (wlPage && wlPage.classList.contains('active') && _wlActiveWeekId) {
      const day = _wlActiveDayTab[_wlActiveWeekId];
      if (day) {
        e.preventDefault();
        _wlProcessDayFiles(imgFiles, _wlActiveWeekId, day);
      }
    }
  });
}

function _wlOpenLightbox(url) {
  let lb = document.getElementById('wl-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'wl-lightbox';
    lb.className = 'wl-lightbox';
    lb.innerHTML = `
      <div class="wl-lb-toolbar" onclick="event.stopPropagation()">
        <button onclick="_wlLbZoom(-0.25)" title="Zoom out">${icon('minus')}</button>
        <button onclick="_wlLbZoom(0.25)" title="Zoom in">${icon('plus')}</button>
        <button onclick="_wlLbResetZoom()" title="Reset zoom">${icon('refresh')}</button>
        <button onclick="_wlLbFullscreen()" title="Fullscreen">${icon('monitor')}</button>
        <button onclick="_wlOpenAnnotate()" title="Annotate">${icon('edit')}</button>
        <button class="wl-lightbox-close" onclick="_wlCloseLightbox()" title="Close">${icon('close')}</button>
      </div>
      <div class="wl-lb-stage" id="wl-lb-stage">
        <img id="wl-lb-img" src="" alt="chart" draggable="false">
      </div>`;
    lb.addEventListener('click', e => { if (e.target === lb || e.target.id === 'wl-lb-stage') _wlCloseLightbox(); });
    document.body.appendChild(lb);
    _wlWireLightboxPanZoom();
  }
  document.getElementById('wl-lb-img').src = url;
  _wlLb = { url, scale: 1, tx: 0, ty: 0, panning: false, lastX: 0, lastY: 0 };
  _wlLbApplyTransform();
  lb.classList.add('open');
}

function _wlCloseLightbox() {
  const lb = document.getElementById('wl-lightbox');
  if (lb) lb.classList.remove('open');
}

function _wlLbApplyTransform() {
  const img = document.getElementById('wl-lb-img');
  if (img) img.style.transform = `translate(${_wlLb.tx}px,${_wlLb.ty}px) scale(${_wlLb.scale})`;
}

function _wlLbZoom(delta) {
  _wlLb.scale = Math.max(1, Math.min(5, _wlLb.scale + delta));
  if (_wlLb.scale === 1) { _wlLb.tx = 0; _wlLb.ty = 0; }
  _wlLbApplyTransform();
}

function _wlLbResetZoom() {
  _wlLb.scale = 1; _wlLb.tx = 0; _wlLb.ty = 0;
  _wlLbApplyTransform();
}

function _wlLbFullscreen() {
  const lb = document.getElementById('wl-lightbox');
  if (!lb) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else lb.requestFullscreen && lb.requestFullscreen();
}

function _wlWireLightboxPanZoom() {
  const stage = document.getElementById('wl-lb-stage');
  if (!stage) return;
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    _wlLbZoom(e.deltaY < 0 ? 0.25 : -0.25);
  }, { passive: false });
  stage.addEventListener('mousedown', e => {
    if (_wlLb.scale <= 1) return;
    _wlLb.panning = true; _wlLb.lastX = e.clientX; _wlLb.lastY = e.clientY;
  });
  window.addEventListener('mousemove', e => {
    if (!_wlLb.panning) return;
    _wlLb.tx += e.clientX - _wlLb.lastX;
    _wlLb.ty += e.clientY - _wlLb.lastY;
    _wlLb.lastX = e.clientX; _wlLb.lastY = e.clientY;
    _wlLbApplyTransform();
  });
  window.addEventListener('mouseup', () => { _wlLb.panning = false; });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') _wlCloseLightbox(); });
}

/* ── Annotation tool: arrows, boxes, text over the currently-open lightbox image ── */
let _wlAnnState = { tool: 'arrow', color: '#f97316', shapes: [], drawing: false, start: null };

function _wlOpenAnnotate() {
  const srcUrl = _wlLb.url;
  if (!srcUrl) return;
  let modal = document.getElementById('wl-annotate-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'wl-annotate-modal';
    modal.className = 'wl-lightbox wl-annotate-modal';
    document.body.appendChild(modal);
  }
  _wlAnnState = { tool: 'arrow', color: '#f97316', shapes: [], drawing: false, start: null };

  modal.innerHTML = `
    <div class="wl-ann-toolbar" onclick="event.stopPropagation()">
      <button class="wl-ann-tool active" data-tool="arrow" onclick="_wlAnnSetTool('arrow',this)">${icon('trend-up')} Arrow</button>
      <button class="wl-ann-tool" data-tool="box" onclick="_wlAnnSetTool('box',this)">${icon('box')} Box</button>
      <button class="wl-ann-tool" data-tool="text" onclick="_wlAnnSetTool('text',this)">${icon('edit')} Text</button>
      <input type="color" value="#f97316" onchange="_wlAnnState.color=this.value">
      <button onclick="_wlAnnUndo()">${icon('history')} Undo</button>
      <button onclick="_wlAnnClear()">${icon('trash')} Clear</button>
      <button class="wl-btn-primary" style="margin-left:auto" onclick="_wlAnnDownload()">${icon('download')} Download</button>
      <button class="wl-lightbox-close" onclick="_wlCloseAnnotate()">${icon('close')}</button>
    </div>
    <div class="wl-ann-stage">
      <img id="wl-ann-img" src="${srcUrl}" alt="annotate">
      <canvas id="wl-ann-canvas"></canvas>
    </div>`;
  modal.classList.add('open');

  const img = document.getElementById('wl-ann-img');
  const canvas = document.getElementById('wl-ann-canvas');
  const setup = () => {
    canvas.width = img.clientWidth; canvas.height = img.clientHeight;
    canvas.style.width = img.clientWidth + 'px'; canvas.style.height = img.clientHeight + 'px';
    _wlAnnRedraw();
  };
  if (img.complete) setup(); else img.onload = setup;

  canvas.onmousedown = e => {
    const r = canvas.getBoundingClientRect();
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (_wlAnnState.tool === 'text') {
      const txt = prompt('Label text:');
      if (txt) _wlAnnState.shapes.push({ type: 'text', x: pt.x, y: pt.y, text: txt, color: _wlAnnState.color });
      _wlAnnRedraw();
      return;
    }
    _wlAnnState.drawing = true;
    _wlAnnState.start = pt;
  };
  canvas.onmousemove = e => {
    if (!_wlAnnState.drawing) return;
    const r = canvas.getBoundingClientRect();
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
    _wlAnnRedraw();
    _wlAnnDrawShape({ type: _wlAnnState.tool, x1: _wlAnnState.start.x, y1: _wlAnnState.start.y, x2: pt.x, y2: pt.y, color: _wlAnnState.color });
  };
  canvas.onmouseup = e => {
    if (!_wlAnnState.drawing) return;
    const r = canvas.getBoundingClientRect();
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
    _wlAnnState.shapes.push({ type: _wlAnnState.tool, x1: _wlAnnState.start.x, y1: _wlAnnState.start.y, x2: pt.x, y2: pt.y, color: _wlAnnState.color });
    _wlAnnState.drawing = false;
    _wlAnnRedraw();
  };
}

function _wlAnnSetTool(tool, btn) {
  _wlAnnState.tool = tool;
  document.querySelectorAll('.wl-ann-tool').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function _wlAnnDrawShape(s) {
  const canvas = document.getElementById('wl-ann-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
  if (s.type === 'box') {
    ctx.strokeRect(Math.min(s.x1,s.x2), Math.min(s.y1,s.y2), Math.abs(s.x2-s.x1), Math.abs(s.y2-s.y1));
  } else if (s.type === 'arrow') {
    const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    const headLen = 14;
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - headLen*Math.cos(angle-Math.PI/6), s.y2 - headLen*Math.sin(angle-Math.PI/6));
    ctx.lineTo(s.x2 - headLen*Math.cos(angle+Math.PI/6), s.y2 - headLen*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
  } else if (s.type === 'text') {
    ctx.font = '600 16px sans-serif';
    ctx.fillText(s.text, s.x, s.y);
  }
}

function _wlAnnRedraw() {
  const canvas = document.getElementById('wl-ann-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  _wlAnnState.shapes.forEach(_wlAnnDrawShape);
}

function _wlAnnUndo() { _wlAnnState.shapes.pop(); _wlAnnRedraw(); }
function _wlAnnClear() { _wlAnnState.shapes = []; _wlAnnRedraw(); }

function _wlAnnDownload() {
  const img = document.getElementById('wl-ann-img');
  const out = document.createElement('canvas');
  out.width = img.naturalWidth; out.height = img.naturalHeight;
  const ctx = out.getContext('2d');
  ctx.drawImage(img, 0, 0, out.width, out.height);
  const scaleX = out.width / img.clientWidth, scaleY = out.height / img.clientHeight;
  _wlAnnState.shapes.forEach(s => {
    const scaled = s.type === 'text'
      ? { ...s, x: s.x * scaleX, y: s.y * scaleY }
      : { ...s, x1: s.x1 * scaleX, y1: s.y1 * scaleY, x2: s.x2 * scaleX, y2: s.y2 * scaleY };
    _wlAnnDrawShapeOnCtx(ctx, scaled, Math.max(scaleX, scaleY));
  });
  const link = document.createElement('a');
  link.download = 'chart-annotated.png';
  link.href = out.toDataURL('image/png');
  link.click();
}

function _wlAnnDrawShapeOnCtx(ctx, s, scale) {
  scale = scale || 1;
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 3 * scale; ctx.lineCap = 'round';
  if (s.type === 'box') {
    ctx.strokeRect(Math.min(s.x1,s.x2), Math.min(s.y1,s.y2), Math.abs(s.x2-s.x1), Math.abs(s.y2-s.y1));
  } else if (s.type === 'arrow') {
    const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    const headLen = 14 * scale;
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - headLen*Math.cos(angle-Math.PI/6), s.y2 - headLen*Math.sin(angle-Math.PI/6));
    ctx.lineTo(s.x2 - headLen*Math.cos(angle+Math.PI/6), s.y2 - headLen*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
  } else if (s.type === 'text') {
    ctx.font = `600 ${16*scale}px sans-serif`;
    ctx.fillText(s.text, s.x, s.y);
  }
}

function _wlCloseAnnotate() {
  const modal = document.getElementById('wl-annotate-modal');
  if (modal) modal.classList.remove('open');
}

/* ── Side-by-side compare viewer ── */
let _wlCompareSelection = [];

function _wlToggleCompareSelect(url, cbEl) {
  if (cbEl.checked) {
    if (_wlCompareSelection.length >= 2) { cbEl.checked = false; return; }
    _wlCompareSelection.push(url);
  } else {
    _wlCompareSelection = _wlCompareSelection.filter(u => u !== url);
  }
  const btn = document.getElementById('wl-compare-btn');
  if (btn) btn.style.display = _wlCompareSelection.length === 2 ? 'inline-flex' : 'none';
}

function _wlOpenCompare() {
  if (_wlCompareSelection.length !== 2) return;
  let modal = document.getElementById('wl-compare-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'wl-compare-modal';
    modal.className = 'wl-lightbox wl-compare-modal';
    modal.addEventListener('click', e => { if (e.target === modal) _wlCloseCompare(); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <button class="wl-lightbox-close" onclick="_wlCloseCompare()">${icon('close')}</button>
    <div class="wl-compare-grid">
      <img src="${_wlCompareSelection[0]}" alt="compare 1">
      <img src="${_wlCompareSelection[1]}" alt="compare 2">
    </div>`;
  modal.classList.add('open');
}

function _wlCloseCompare() {
  const modal = document.getElementById('wl-compare-modal');
  if (modal) modal.classList.remove('open');
}


function previewSlot(input) {
  if (!input.files[0]) return;
  const r = new FileReader();
  const slot = input.previousElementSibling;
  r.onload = e => {
    slot.innerHTML = `<img src="${e.target.result}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:4px"><div class="img-overlay">Replace</div>`;
    slot.onclick = () => input.click();
  };
  r.readAsDataURL(input.files[0]);
}

// ═══════════════════════════════════════════════════
// ACCOUNTS — full CRUD + per-user Supabase persistence
// Table: journal_account_data { id, user_id, payouts jsonb, milestones jsonb, accounts jsonb }
// ═══════════════════════════════════════════════════
let _accData   = { payouts: [], milestones: [], accounts: [] };
let _accRowId  = null;

async function _accLoad() {
  if (!_currentUser) return;
  const { data, error } = await sb
    .from('journal_account_data')
    .select('id, payouts, milestones, accounts, calendar_account')
    .eq('user_id', _currentUser.id)
    .maybeSingle();
  if (error) {
    console.error('accLoad:', error.message);
    showToast('Could not load account data: ' + error.message, 'danger');
    return;
  }
  if (data) {
    _accRowId = data.id;
    _accData.payouts    = data.payouts    || [];
    _accData.milestones = data.milestones || [];
    _accData.accounts   = (data.accounts  || []).map(a =>
      typeof a === 'string' ? { name: a, status: 'active', type: '', notes: '', mt5: null } : { notes: '', ...a }
    );
    _accData.calendarAccount = data.calendar_account || '';
    // Keep localStorage in sync with cloud value
    try { if (_accData.calendarAccount) localStorage.setItem('nxtgen_cal_account', _accData.calendarAccount); } catch(e) {}
  }
}

async function _accSave() {
  if (!_currentUser) return false;
  const row = {
    user_id:          _currentUser.id,
    payouts:          _accData.payouts,
    milestones:       _accData.milestones,
    accounts:         _accData.accounts,
    calendar_account: _accData.calendarAccount || '',
  };
  const { data, error } = await sb
    .from('journal_account_data')
    .upsert(row, { onConflict: 'user_id' })
    .select('id')
    .single();
  if (error) { showToast('Account save failed: ' + error.message, 'danger'); return false; }
  if (data) _accRowId = data.id;
  return true;
}

