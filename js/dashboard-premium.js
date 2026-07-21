// ══ NxTGen Journal — dashboard-premium.js ══════════════════════════════
// Premium analytical layer for the Dashboard page. Loaded after
// dashboard-analytics.js (and ApexCharts, via CDN) so it can extend and
// re-render on top of the existing KPI engine without touching it.
//
// Pattern note: every override below uses `const orig = window.fn; window.fn
// = function(){...}` (never `function fn(){}` redeclared under the same
// name) — redeclaring a same-named top-level function in this file would
// get hoisted ahead of the capture line and cause infinite self-recursion.
// ════════════════════════════════════════════════════════════════════

const PF3_HAS_APEX = typeof ApexCharts !== 'undefined';

function pf3Css(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}
function pf3Colors() {
  return {
    green: pf3Css('--green', '#34d399'),
    red: pf3Css('--red', '#f87171'),
    blue: pf3Css('--blue', '#60a5fa'),
    gold: pf3Css('--gold', '#fbbf24'),
    purple: pf3Css('--purple', '#a78bfa'),
    text3: pf3Css('--text3', '#8a93a6'),
    border: pf3Css('--glass-border', 'rgba(255,255,255,0.08)'),
  };
}
function pf3ReducedMotion() {
  return document.documentElement.classList.contains('nx-reduce-motion')
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function pf3Destroy(id) {
  try {
    const el = document.getElementById(id);
    if (el && el._apexInstance) { el._apexInstance.destroy(); el._apexInstance = null; }
  } catch (e) {}
}
function pf3Mount(id, options) {
  if (!PF3_HAS_APEX) return null;
  const el = document.getElementById(id);
  if (!el) return null;
  pf3Destroy(id);
  el.innerHTML = '';
  const chart = new ApexCharts(el, options);
  chart.render();
  el._apexInstance = chart;
  return chart;
}

// ════════════════════════════════════════════════════════════════════
// DATA HELPERS — all derived from real trade fields already used
// elsewhere in the app (rating, followedPlan, emotion, rr, pnl, date).
// Nothing here is fabricated; anything not derivable is simply omitted.
// ════════════════════════════════════════════════════════════════════

function pf3PctOf(t) {
  if (typeof _pctOfTrade === 'function') return _pctOfTrade(t);
  return parseFloat(t.pnl) || 0;
}
function pf3DollarsOf(t) {
  return toPnlDollars(t, getAccSizeForAccount(t.account));
}
function pf3SortedByDate(list) {
  return [...list].sort((a, b) => a.date.localeCompare(b.date));
}

function pf3EquitySeries(list, mode) {
  // mode: 'pct' | 'usd' — cumulative running total per trade, oldest first
  const sorted = pf3SortedByDate(list);
  let cum = 0;
  const pts = [{ x: 0, y: 0, date: null }];
  sorted.forEach((t, i) => {
    cum += mode === 'usd' ? pf3DollarsOf(t) : pf3PctOf(t);
    pts.push({ x: i + 1, y: cum, date: t.date, outcome: t.outcome, pair: t.pair });
  });
  return pts;
}

function pf3PreviousPeriodComparison() {
  // Compares net PnL of the current dashboard filter window against the
  // immediately preceding window of equal length. Only meaningful when a
  // specific range is selected — "All time" has no prior period to compare.
  if (typeof _dashFilter === 'undefined' || !_dashFilter.from || !_dashFilter.to || _dashFilter.preset === 'all') return null;
  const from = new Date(_dashFilter.from + 'T12:00:00');
  const to = new Date(_dashFilter.to + 'T12:00:00');
  const spanDays = Math.max(1, Math.round((to - from) / 86400000) + 1);
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (spanDays - 1));
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const prevFromStr = fmt(prevFrom), prevToStr = fmt(prevTo);
  const prevTrades = (typeof trades !== 'undefined' ? trades : []).filter(t => t.date >= prevFromStr && t.date <= prevToStr);
  if (!prevTrades.length) return null;
  const curTrades = _getFilteredTrades();
  const curPct = curTrades.reduce((a, t) => a + pf3PctOf(t), 0);
  const prevPct = prevTrades.reduce((a, t) => a + pf3PctOf(t), 0);
  return { curPct, prevPct, deltaPct: curPct - prevPct };
}

function pf3WinRateBreakdown(list) {
  const total = list.length;
  const wins = list.filter(t => t.outcome === 'Win');
  const losses = list.filter(t => t.outcome === 'Loss');
  const be = total - wins.length - losses.length;
  const rrNums = list.map(t => _parseRR(t.rr)).filter(x => x !== null);
  const avgRR = rrNums.length ? (rrNums.reduce((a, b) => a + b, 0) / rrNums.length) : null;
  const dollars = list.map(t => ({ t, d: pf3DollarsOf(t) }));
  const largestWin = dollars.filter(x => x.t.pnl > 0).sort((a, b) => b.d - a.d)[0];
  const largestLoss = dollars.filter(x => x.t.pnl < 0).sort((a, b) => a.d - b.d)[0];
  const avgW = wins.length ? dollars.filter(x => x.t.pnl > 0).reduce((a, x) => a + x.d, 0) / wins.length : 0;
  const avgL = losses.length ? dollars.filter(x => x.t.pnl < 0).reduce((a, x) => a + x.d, 0) / losses.length : 0;
  return { total, wins: wins.length, losses: losses.length, be, avgRR, largestWin, largestLoss, avgW, avgL };
}

function pf3ProfitFactorBreakdown(list) {
  const dollars = list.map(t => pf3DollarsOf(t));
  const gp = dollars.filter((d, i) => list[i].pnl > 0).reduce((a, b) => a + b, 0);
  const gl = Math.abs(dollars.filter((d, i) => list[i].pnl < 0).reduce((a, b) => a + b, 0));
  const pf = gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0);
  const wins = list.filter(t => t.outcome === 'Win').length;
  const losses = list.filter(t => t.outcome === 'Loss').length;
  return { gp, gl, pf, wins, losses };
}

function pf3AvgWinLossDistribution(list) {
  const winPcts = list.filter(t => pf3PctOf(t) > 0).map(pf3PctOf);
  const lossPcts = list.filter(t => pf3PctOf(t) < 0).map(pf3PctOf);
  const median = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const stddev = arr => { if (arr.length < 2) return 0; const mean = arr.reduce((a, b) => a + b, 0) / arr.length; const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length; return Math.sqrt(v); };
  return {
    medianWin: median(winPcts), medianLoss: median(lossPcts),
    stddevWin: stddev(winPcts), stddevLoss: stddev(lossPcts),
    winPcts, lossPcts,
  };
}

function pf3ConsistencyRadarData(list) {
  const total = list.length;
  if (!total) return null;
  const wins = list.filter(t => t.outcome === 'Win').length;
  const winRate = (wins / total) * 100;

  const planTagged = list.filter(t => t.followedPlan === 'Yes' || t.followedPlan === 'No');
  const ruleAdherence = planTagged.length ? (planTagged.filter(t => t.followedPlan === 'Yes').length / planTagged.length) * 100 : null;

  const rated = list.filter(t => t.rating);
  const executionQuality = rated.length ? (rated.filter(t => t.rating >= 4).length / rated.length) * 100 : null;

  const emoTagged = list.filter(t => t.emotion);
  const emotionalControl = emoTagged.length ? (emoTagged.filter(t => t.emotion === 'Focused').length / emoTagged.length) * 100 : null;

  const rrNums = list.map(t => _parseRR(t.rr)).filter(x => x !== null);
  let riskConsistency = null;
  if (rrNums.length >= 3) {
    const mean = rrNums.reduce((a, b) => a + b, 0) / rrNums.length;
    const sd = Math.sqrt(rrNums.reduce((a, b) => a + (b - mean) ** 2, 0) / rrNums.length);
    const cv = mean !== 0 ? Math.abs(sd / mean) : 1;
    riskConsistency = Math.max(0, Math.min(100, 100 - cv * 60));
  }

  const axes = [
    { label: 'Win Rate', value: winRate },
    { label: 'Rule Adherence', value: ruleAdherence },
    { label: 'Execution Quality', value: executionQuality },
    { label: 'Emotional Control', value: emotionalControl },
    { label: 'Risk Consistency', value: riskConsistency },
  ].filter(a => a.value !== null);

  return axes.length >= 3 ? axes : null;
}

// ════════════════════════════════════════════════════════════════════
// RENDERERS
// ════════════════════════════════════════════════════════════════════

function pf3RenderNetPnlSpark() {
  const list = _getFilteredTrades();
  const pts = pf3EquitySeries(list, 'pct');
  const canvasFallback = document.getElementById('kpi-sparkline');
  const mount = document.getElementById('kpi-pnl-apex');
  if (!mount) return;
  if (!PF3_HAS_APEX || pts.length < 3) {
    mount.style.display = 'none';
    // Original canvas sparkline is already drawn by the untouched
    // _drawSparkline() call inside updateKPIs() — just make sure it's visible.
    if (canvasFallback) canvasFallback.style.display = pts.length >= 2 ? 'block' : 'none';
    return;
  }
  mount.style.display = 'block';
  if (canvasFallback) canvasFallback.style.display = 'none';

  const c = pf3Colors();
  const last = pts[pts.length - 1].y;
  const isPos = last >= 0;
  const col = isPos ? c.green : c.red;
  const ys = pts.map(p => p.y);
  const maxY = Math.max(...ys), minY = Math.min(...ys);
  const maxIdx = ys.indexOf(maxY), minIdx = ys.indexOf(minY);

  pf3Mount('kpi-pnl-apex', {
    chart: { type: 'area', height: 46, sparkline: { enabled: true }, animations: { enabled: !pf3ReducedMotion(), easing: 'easeout', speed: 500 } },
    series: [{ name: 'Equity', data: pts.map(p => p.y) }],
    stroke: { curve: 'smooth', width: 1.75, colors: [col] },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100], colorStops: [{ offset: 0, color: col, opacity: 0.35 }, { offset: 100, color: col, opacity: 0 }] } },
    colors: [col],
    markers: {
      discrete: [
        { seriesIndex: 0, dataPointIndex: maxIdx, fillColor: c.green, strokeColor: '#fff', size: 3 },
        { seriesIndex: 0, dataPointIndex: minIdx, fillColor: c.red, strokeColor: '#fff', size: 3 },
      ],
    },
    tooltip: {
      theme: 'dark', fixed: { enabled: false },
      x: { formatter: (v, o) => { const p = pts[o.dataPointIndex]; return p && p.date ? p.date : 'Start'; } },
      y: { formatter: v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%' },
    },
  });
}

function pf3RenderComparisonArrow() {
  const el = document.getElementById('kpi-pnl-compare');
  if (!el) return;
  const cmp = pf3PreviousPeriodComparison();
  if (!cmp) { el.textContent = ''; el.className = 'pf3-compare-arrow'; return; }
  const up = cmp.deltaPct >= 0;
  el.className = 'pf3-compare-arrow ' + (up ? 'up' : 'down');
  const arrow = up
    ? '<svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg>'
    : '<svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg>';
  el.innerHTML = arrow + Math.abs(cmp.deltaPct).toFixed(1) + '% vs prior period';
}

function pf3RenderWinRateRing() {
  const list = _getFilteredTrades();
  const mount = document.getElementById('kpi-wr-apex');
  const legacy = document.getElementById('kpi-wr-gauge');
  if (!mount) return;
  if (!PF3_HAS_APEX || !list.length) { mount.style.display = 'none'; if (legacy) legacy.style.display = ''; return; }
  mount.style.display = 'block';
  if (legacy) legacy.style.display = 'none';
  const wins = list.filter(t => t.outcome === 'Win').length;
  const wr = (wins / list.length) * 100;
  const c = pf3Colors();
  const col = wr >= 55 ? c.green : wr >= 40 ? c.gold : c.red;
  pf3Mount('kpi-wr-apex', {
    chart: { type: 'radialBar', height: 90, width: 90, animations: { enabled: !pf3ReducedMotion(), speed: 650 } },
    series: [Math.round(wr)],
    colors: [col],
    plotOptions: {
      radialBar: {
        hollow: { size: '58%' },
        startAngle: -90, endAngle: 90,
        track: { background: 'rgba(255,255,255,0.08)' },
        dataLabels: { show: false },
      },
    },
    stroke: { lineCap: 'round' },
  });
}

function pf3RenderProfitFactorRing() {
  const list = _getFilteredTrades();
  const mount = document.getElementById('kpi-pf-apex');
  const legacy = document.getElementById('kpi-pf-ring');
  if (!mount) return;
  const { pf } = pf3ProfitFactorBreakdown(list);
  if (!PF3_HAS_APEX || !list.length) { mount.style.display = 'none'; if (legacy) legacy.style.display = ''; return; }
  mount.style.display = 'block';
  if (legacy) legacy.style.display = 'none';
  const c = pf3Colors();
  const col = !isFinite(pf) ? c.green : pf >= 2 ? c.green : pf >= 1 ? c.gold : c.red;
  const capped = !isFinite(pf) ? 100 : Math.max(2, Math.min(100, (pf / 3) * 100));
  pf3Mount('kpi-pf-apex', {
    chart: { type: 'radialBar', height: 64, width: 64, animations: { enabled: !pf3ReducedMotion(), speed: 650 },
      dropShadow: { enabled: true, color: col, top: 0, left: 0, blur: 6, opacity: 0.5 } },
    series: [capped],
    colors: [col],
    plotOptions: { radialBar: { hollow: { size: '52%' }, track: { background: 'rgba(255,255,255,0.08)' }, dataLabels: { show: false } } },
    stroke: { lineCap: 'round' },
  });
}

function pf3RenderWinStreakDots() {
  const mount = document.getElementById('kpi-ws-timeline');
  if (!mount) return;
  const list = pf3SortedByDate(_getFilteredTrades()).slice(-14);
  if (!list.length) { mount.innerHTML = ''; return; }
  let curStreakLen = 0;
  for (let i = list.length - 1; i >= 0; i--) { if (list[i].outcome === 'Win') curStreakLen++; else break; }
  mount.innerHTML = list.map((t, i) => {
    const cls = t.outcome === 'Win' ? 'win' : t.outcome === 'Loss' ? 'loss' : 'be';
    const isCurrent = curStreakLen > 0 && i >= list.length - curStreakLen;
    return `<span class="pf3-dot ${cls}${isCurrent ? ' current' : ''}" title="${t.date} · ${t.outcome || 'BE'}"></span>`;
  }).join('');
}

function pf3RenderNxtScoreRing() {
  const list = _getFilteredTrades();
  const mount = document.getElementById('nxt-score-ring-mount');
  const card = document.getElementById('nxt-score-card');
  if (!mount || !list.length || !PF3_HAS_APEX) { if (mount) mount.innerHTML = ''; return; }

  const total = list.length;
  const wins = list.filter(t => t.outcome === 'Win').length;
  const wr = (wins / total) * 100;
  const dollars = list.map(t => pf3DollarsOf(t));
  const winD = dollars.filter((d, i) => list[i].pnl > 0);
  const lossD = dollars.filter((d, i) => list[i].pnl < 0);
  const avgW = winD.length ? winD.reduce((a, b) => a + b, 0) / winD.length : 0;
  const avgL = lossD.length ? Math.abs(lossD.reduce((a, b) => a + b, 0) / lossD.length) : 0;
  const pfNum = lossD.length ? Math.abs(winD.reduce((a, b) => a + b, 0)) / Math.abs(lossD.reduce((a, b) => a + b, 0)) : (winD.length ? 999 : 0);
  const rrRatio = avgL > 0 ? avgW / avgL : (avgW > 0 ? 999 : 0);
  const winAxis = Math.max(0, Math.min(100, wr));
  const pfAxis = Math.max(0, Math.min(100, (Math.min(pfNum, 3) / 3) * 100));
  const rrAxis = Math.max(0, Math.min(100, (Math.min(rrRatio, 3) / 3) * 100));
  const score = Math.round((winAxis + pfAxis + rrAxis) / 3);

  const c = pf3Colors();
  const col = score >= 70 ? c.green : score >= 45 ? c.gold : c.red;

  pf3Mount('nxt-score-ring-mount', {
    chart: { type: 'radialBar', height: 200, width: 200, animations: { enabled: !pf3ReducedMotion(), speed: 700 } },
    series: [score],
    colors: [col],
    plotOptions: {
      radialBar: {
        hollow: { size: '82%' },
        track: { background: 'rgba(255,255,255,0.06)', strokeWidth: '100%' },
        dataLabels: { show: false },
      },
    },
    stroke: { lineCap: 'round' },
  });

  let prevScore = null;
  try { prevScore = parseInt(localStorage.getItem('nx_last_nxtgen_score') || '', 10); } catch (e) {}
  if (card && !pf3ReducedMotion() && !isNaN(prevScore) && score > prevScore) {
    card.classList.add('pf3-pulse-up');
    setTimeout(() => card.classList.remove('pf3-pulse-up'), 1500);
  }
  try { localStorage.setItem('nx_last_nxtgen_score', String(score)); } catch (e) {}
}

function pf3RenderHeroWave() {
  const mount = document.getElementById('dash-hero-wave');
  if (!mount || !PF3_HAS_APEX) return;
  const pts = pf3EquitySeries(_getFilteredTrades(), 'pct');
  if (pts.length < 3) { mount.innerHTML = ''; return; }
  const c = pf3Colors();
  const last = pts[pts.length - 1].y;
  const col = last >= 0 ? c.green : c.red;
  pf3Mount('dash-hero-wave', {
    chart: { type: 'area', height: 32, width: 120, sparkline: { enabled: true }, animations: { enabled: !pf3ReducedMotion(), speed: 600 } },
    series: [{ data: pts.map(p => p.y) }],
    stroke: { curve: 'smooth', width: 1.5, colors: [col] },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0 } },
    colors: [col],
    tooltip: { enabled: false },
  });
}

function pf3RenderQuarterProgress() {
  const labelEl = document.getElementById('dash-quarter-progress-label');
  const pctEl = document.getElementById('dash-quarter-progress-pct');
  const fillEl = document.getElementById('dash-quarter-progress-fill');
  if (!fillEl) return;
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const qStart = new Date(now.getFullYear(), q * 3, 1);
  const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0);
  const total = qEnd - qStart;
  const elapsed = now - qStart;
  const pct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  if (labelEl) labelEl.textContent = 'Q' + (q + 1) + ' progress';
  if (pctEl) pctEl.textContent = pct.toFixed(0) + '% through the quarter';
  requestAnimationFrame(() => { fillEl.style.width = pct.toFixed(1) + '%'; });
}

function pf3TickClock() {
  const el = document.getElementById('dash-live-clock');
  if (!el) return;
  const render = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  render();
  if (window._pf3ClockInterval) clearInterval(window._pf3ClockInterval);
  window._pf3ClockInterval = setInterval(render, 1000);
}

function pf3RenderInsightChips() {
  const src = document.getElementById('dash-insight-text');
  const chipsWrap = document.getElementById('dash-insight-chips');
  const fallback = document.getElementById('dash-insight-fallback');
  if (!src || !chipsWrap) return;
  const html = src.innerHTML || '';
  if (!html.trim()) { chipsWrap.style.display = 'none'; if (fallback) fallback.style.display = ''; return; }
  const parts = html.split(/&nbsp;·&nbsp;|\s·\s/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) { chipsWrap.style.display = 'none'; if (fallback) fallback.style.display = ''; return; }
  chipsWrap.innerHTML = parts.map((p, i) => {
    let sev = 'good';
    if (/icn-red|Top loss cause|broke your plan/i.test(p)) sev = 'danger';
    else if (/icn-gold|consider|lower-rated/i.test(p)) sev = 'warn';
    const iconHtml = sev === 'danger'
      ? '<svg class="icn" aria-hidden="true"><use href="#ic-warning"></use></svg>'
      : sev === 'warn'
      ? '<svg class="icn" aria-hidden="true"><use href="#ic-info"></use></svg>'
      : '<svg class="icn" aria-hidden="true"><use href="#ic-bulb"></use></svg>';
    return `<div class="pf3-insight-chip ${sev}" style="animation-delay:${i * 60}ms"><span class="pf3-chip-ico">${iconHtml}</span><span>${p}</span></div>`;
  }).join('');
  chipsWrap.style.display = 'flex';
  if (fallback) fallback.style.display = 'none';
}

// ════════════════════════════════════════════════════════════════════
// EQUITY CURVE — full ApexCharts rebuild (zoom, crosshair, gradient,
// monthly markers, drawdown overlay, Balance / Equity % / Profit modes)
// ════════════════════════════════════════════════════════════════════

let _pf3EqMode = 'pct';
let _pf3ShowDrawdown = false;

function pf3ToggleDrawdown(checked) {
  _pf3ShowDrawdown = checked;
  pf3RenderEquityCurve();
}

window.setEqMode = function (mode, btn) {
  _eqCurveMode = mode === 'profit' ? 'pct' : mode; // keep legacy var sane if anything else reads it
  _pf3EqMode = mode;
  document.querySelectorAll('#eq-btn-pct,#eq-btn-usd,#eq-btn-profit').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  pf3RenderEquityCurve();
};

function pf3MonthBoundaryLabels(sortedTrades) {
  const seen = new Set();
  const out = [];
  sortedTrades.forEach((t, i) => {
    const ym = (t.date || '').slice(0, 7);
    if (ym && !seen.has(ym)) { seen.add(ym); out.push({ index: i + 1, label: ym }); }
  });
  return out;
}

function pf3RenderEquityCurve() {
  const mount = document.getElementById('equity-curve-apex');
  const emptyEl = document.getElementById('equity-curve-empty');
  const canvasFallback = document.getElementById('equity-curve-canvas');
  if (!mount) return;
  const list = _getFilteredTrades();
  const sorted = pf3SortedByDate(list);

  if (sorted.length < 2) {
    mount.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (canvasFallback) canvasFallback.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  if (!PF3_HAS_APEX) {
    // Graceful degradation if the CDN chart library didn't load.
    mount.innerHTML = '';
    if (canvasFallback) { canvasFallback.style.display = 'block'; if (typeof _pf3OrigDrawEquityCurve === 'function') _pf3OrigDrawEquityCurve(); }
    return;
  }
  if (canvasFallback) canvasFallback.style.display = 'none';

  const c = pf3Colors();

  if (_pf3EqMode === 'profit') {
    // ── Profit / Trade — waterfall-style bar of each trade's own P&L ──
    const vals = sorted.map(t => pf3PctOf(t));
    const cats = sorted.map(t => t.date.slice(5));
    pf3Mount('equity-curve-apex', {
      chart: { type: 'bar', height: 220, toolbar: { show: true, tools: { download: false } }, animations: { enabled: !pf3ReducedMotion(), speed: 400 } },
      series: [{ name: 'P&L', data: vals }],
      xaxis: { categories: cats, labels: { style: { colors: c.text3, fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: c.text3, fontSize: '10px' }, formatter: v => v.toFixed(1) + '%' } },
      plotOptions: { bar: { borderRadius: 3, distributed: false, colors: { ranges: [{ from: -1000, to: 0, color: c.red }, { from: 0, to: 1000, color: c.green }] } } },
      dataLabels: { enabled: false },
      grid: { borderColor: c.border, strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%' } },
    });
    return;
  }

  const useDollar = _pf3EqMode === 'usd';
  const pts = pf3EquitySeries(list, useDollar ? 'usd' : 'pct');
  const series = pts.map(p => p.y);
  const last = series[series.length - 1];
  const isPos = last >= 0;
  const col = isPos ? c.green : c.red;

  // Drawdown overlay: running peak minus current, as a negative-going series
  let peak = 0;
  const ddSeries = pts.map(p => { if (p.y > peak) peak = p.y; return -(peak - p.y); });

  const monthMarkers = pf3MonthBoundaryLabels(sorted);
  const annotations = { xaxis: monthMarkers.map(m => ({
    x: m.index, borderColor: c.border, label: { text: m.label, orientation: 'horizontal', style: { color: c.text3, background: 'transparent', fontSize: '9px' }, offsetY: -4 },
  })) };

  const series2 = [{ name: useDollar ? 'Balance' : 'Equity', data: series }];
  if (_pf3ShowDrawdown) series2.push({ name: 'Drawdown', data: ddSeries });

  pf3Mount('equity-curve-apex', {
    chart: {
      type: 'area', height: 220,
      toolbar: { show: true, tools: { download: false, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
      zoom: { enabled: true },
      animations: { enabled: !pf3ReducedMotion(), speed: 500 },
    },
    series: series2,
    colors: _pf3ShowDrawdown ? [col, c.red] : [col],
    stroke: { curve: 'smooth', width: _pf3ShowDrawdown ? [2, 1] : [2] },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.32, opacityTo: 0, stops: [0, 100] },
    },
    dataLabels: { enabled: false },
    grid: { borderColor: c.border, strokeDashArray: 3 },
    xaxis: {
      labels: { formatter: (v, ts, o) => { const p = pts[Math.round(v) - 1]; return p && p.date ? p.date.slice(5) : (v === 0 ? 'Start' : ''); }, style: { colors: c.text3, fontSize: '10px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: c.text3, width: 1, dashArray: 3 } },
    },
    yaxis: {
      labels: { style: { colors: c.text3, fontSize: '10px' }, formatter: v => useDollar ? (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) : (v >= 0 ? '+' : '') + v.toFixed(1) + '%' },
    },
    annotations,
    tooltip: {
      theme: 'dark', shared: true,
      x: { formatter: v => { const p = pts[Math.round(v) - 1]; return p ? (p.date || 'Start') + (p.pair ? ' · ' + p.pair : '') : ''; } },
      y: { formatter: v => useDollar ? (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) : (v >= 0 ? '+' : '') + v.toFixed(2) + '%' },
    },
    markers: { size: 0, hover: { size: 4 } },
  });
}

// ════════════════════════════════════════════════════════════════════
// TAP-TO-EXPAND POPOVERS (shared component)
// ════════════════════════════════════════════════════════════════════

let _pf3PopoverIdSeq = 0;
function pf3OpenPopover(title, statHtml, chartRenderFn) {
  const backdrop = document.createElement('div');
  backdrop.className = 'pf3-popover-backdrop';
  const chartId = 'pf3-popover-chart-' + (++_pf3PopoverIdSeq);
  backdrop.innerHTML = `
    <div class="pf3-popover" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="pf3-popover-head">
        <div class="pf3-popover-title">${title}</div>
        <button class="pf3-popover-close" aria-label="Close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
      ${chartRenderFn ? `<div class="pf3-popover-chart" id="${chartId}"></div>` : ''}
      <div class="pf3-popover-stat-grid">${statHtml}</div>
    </div>`;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  const close = () => { backdrop.classList.remove('show'); setTimeout(() => backdrop.remove(), 220); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.pf3-popover-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  if (chartRenderFn) setTimeout(() => chartRenderFn(chartId), 10);
}

function pf3Stat(label, value) {
  return `<div class="pf3-popover-stat"><div class="pf3-popover-stat-label">${label}</div><div class="pf3-popover-stat-value">${value}</div></div>`;
}

function pf3OpenWinRatePopover() {
  const list = _getFilteredTrades();
  if (!list.length) return;
  const b = pf3WinRateBreakdown(list);
  const stats = [
    pf3Stat('Wins', b.wins),
    pf3Stat('Losses', b.losses),
    pf3Stat('Break-evens', b.be),
    pf3Stat('Avg RR', b.avgRR !== null ? '1:' + b.avgRR.toFixed(1) : '—'),
    pf3Stat('Largest winner', b.largestWin ? fmtUSD(b.largestWin.d) : '—'),
    pf3Stat('Largest loser', b.largestLoss ? fmtUSD(b.largestLoss.d) : '—'),
    pf3Stat('Avg win', fmtUSD(b.avgW)),
    pf3Stat('Avg loss', fmtUSD(b.avgL)),
  ].join('');
  pf3OpenPopover('Win Rate Breakdown', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'donut', height: 200, animations: { enabled: !pf3ReducedMotion() } },
      series: [b.wins, b.be, b.losses],
      labels: ['Wins', 'Break-even', 'Losses'],
      colors: [c.green, c.blue, c.red],
      legend: { labels: { colors: c.text3 }, fontSize: '11px' },
      dataLabels: { enabled: false },
      stroke: { show: false },
    });
  });
}

function pf3OpenProfitFactorPopover() {
  const list = _getFilteredTrades();
  if (!list.length) return;
  const b = pf3ProfitFactorBreakdown(list);
  const pfEl = document.getElementById('kpi-pf');
  const exp = pfEl ? pfEl.dataset.exp : null;
  const stats = [
    pf3Stat('Winning trades', b.wins),
    pf3Stat('Losing trades', b.losses),
    pf3Stat('Gross Profit', fmtUSD(b.gp)),
    pf3Stat('Gross Loss', fmtUSD(-b.gl)),
    pf3Stat('Profit Factor', isFinite(b.pf) ? b.pf.toFixed(2) + 'x' : '∞'),
    pf3Stat('Expectancy / trade', exp || '—'),
  ].join('');
  pf3OpenPopover('Profit Factor Breakdown', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'bar', height: 160, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Amount', data: [b.gp, -b.gl] }],
      xaxis: { categories: ['Gross Profit', 'Gross Loss'], labels: { style: { colors: c.text3, fontSize: '10px' } } },
      colors: [c.green],
      plotOptions: { bar: { borderRadius: 4, distributed: true, horizontal: true, colors: { ranges: [{ from: -100000, to: 0, color: c.red }, { from: 0, to: 100000, color: c.green }] } } },
      legend: { show: false },
      dataLabels: { enabled: true, formatter: v => fmtUSD(v), style: { colors: ['#fff'] } },
      grid: { show: false },
      tooltip: { enabled: false },
    });
  });
}

function pf3OpenAvgWinLossPopover() {
  const list = _getFilteredTrades();
  if (!list.length) return;
  const d = pf3AvgWinLossDistribution(list);
  const stats = [
    pf3Stat('Median win', d.medianWin.toFixed(2) + '%'),
    pf3Stat('Median loss', d.medianLoss.toFixed(2) + '%'),
    pf3Stat('Win std. deviation', '±' + d.stddevWin.toFixed(2) + '%'),
    pf3Stat('Loss std. deviation', '±' + d.stddevLoss.toFixed(2) + '%'),
  ].join('');
  pf3OpenPopover('Win / Loss Distribution', stats, (id) => {
    const c = pf3Colors();
    const bucket = (arr, step) => {
      const buckets = {};
      arr.forEach(v => { const k = Math.round(v / step) * step; buckets[k] = (buckets[k] || 0) + 1; });
      return buckets;
    };
    const allVals = [...d.winPcts, ...d.lossPcts];
    if (!allVals.length) return;
    const range = Math.max(...allVals) - Math.min(...allVals) || 1;
    const step = Math.max(0.25, range / 10);
    const wb = bucket(d.winPcts, step), lb = bucket(d.lossPcts, step);
    const keys = [...new Set([...Object.keys(wb), ...Object.keys(lb)].map(Number))].sort((a, b) => a - b);
    pf3Mount(id, {
      chart: { type: 'bar', height: 180, stacked: true, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Wins', data: keys.map(k => wb[k] || 0) }, { name: 'Losses', data: keys.map(k => -(lb[k] || 0)) }],
      xaxis: { categories: keys.map(k => k.toFixed(1) + '%'), labels: { style: { colors: c.text3, fontSize: '9px' }, rotate: -45 } },
      colors: [c.green, c.red],
      plotOptions: { bar: { borderRadius: 2, columnWidth: '80%' } },
      legend: { labels: { colors: c.text3 }, fontSize: '11px' },
      dataLabels: { enabled: false },
      grid: { borderColor: c.border, strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => Math.abs(v) + ' trade' + (Math.abs(v) === 1 ? '' : 's') } },
    });
  });
}

function pf3OpenConsistencyPopover() {
  const list = _getFilteredTrades();
  const axes = pf3ConsistencyRadarData(list);
  if (!axes) {
    pf3OpenPopover('Consistency Score', pf3Stat('Status', 'Log more trades with ratings, plan-followed and mood tags to unlock the full radar.'), null);
    return;
  }
  const stats = axes.map(a => pf3Stat(a.label, Math.round(a.value) + '%')).join('');
  pf3OpenPopover('Consistency Radar', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'radar', height: 240, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Score', data: axes.map(a => Math.round(a.value)) }],
      xaxis: { categories: axes.map(a => a.label), labels: { style: { colors: axes.map(() => c.text3), fontSize: '10px' } } },
      yaxis: { max: 100, show: false },
      colors: [c.purple],
      fill: { opacity: 0.3 },
      stroke: { width: 2 },
      markers: { size: 3 },
      plotOptions: { radar: { polygons: { strokeColors: c.border, connectorColors: c.border } } },
      tooltip: { theme: 'dark' },
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// WIRE-UP
// ════════════════════════════════════════════════════════════════════

function pf3RenderAll() {
  pf3RenderNetPnlSpark();
  pf3RenderComparisonArrow();
  pf3RenderWinRateRing();
  pf3RenderProfitFactorRing();
  pf3RenderWinStreakDots();
  pf3RenderNxtScoreRing();
  pf3RenderHeroWave();
  pf3RenderQuarterProgress();
  pf3RenderInsightChips();
  pf3RenderEquityCurve();
}

const _pf3OrigUpdateKPIs = window.updateKPIs;
window.updateKPIs = function (...args) {
  const r = _pf3OrigUpdateKPIs.apply(this, args);
  // updateKPIs draws the legacy canvas sparkline + calls _drawEquityCurve via
  // setTimeout internally; give those a tick before layering our version on top.
  setTimeout(pf3RenderAll, 60);
  return r;
};

const _pf3OrigDrawEquityCurve = window._drawEquityCurve;
window._drawEquityCurve = function (...args) {
  if (!PF3_HAS_APEX) return _pf3OrigDrawEquityCurve.apply(this, args);
  pf3RenderEquityCurve();
};

function pf3AttachInteractions() {
  const wr = document.getElementById('kpi-wr-card');
  if (wr) wr.addEventListener('click', pf3OpenWinRatePopover);

  const pfInfoDot = document.querySelector('#kpi-pf-card .info-dot');
  if (pfInfoDot) pfInfoDot.addEventListener('click', e => { e.stopPropagation(); pf3OpenProfitFactorPopover(); });

  const awl = document.getElementById('kpi-awl-card');
  if (awl) awl.addEventListener('click', pf3OpenAvgWinLossPopover);

  const cons = document.getElementById('kpi-consistency-card');
  if (cons) cons.addEventListener('click', pf3OpenConsistencyPopover);

  pf3TickClock();
}

if (document.readyState !== 'loading') pf3AttachInteractions();
document.addEventListener('DOMContentLoaded', pf3AttachInteractions);
