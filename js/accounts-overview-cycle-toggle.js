// ══ NxTGen Journal — accounts-overview-cycle-toggle.js ═════════════════
// The Overview tab (hero stat row, health ring, Performance Scorecard,
// Equity Curve) always showed LIFETIME analytics (_accComputeAnalytics =
// every trade ever logged), same as before the Risk & Payout cycle-scope
// fix. For a funded/payout-supporting account, that's confusing right
// after a payout resets the cycle — the Overview still shows numbers
// that include prior, already-paid-out cycles.
//
// This layer adds a "Current Cycle / All-Time" toggle to the Overview
// tab, defaulting to Current Cycle for accounts that have a payout
// cycle at all (Evaluation/Live/Paper accounts are untouched — they
// have no cycle concept, so Overview stays exactly as it was).
//
// Design: nothing here touches the shared `_accComputeAnalytics()`
// function itself (that would leak cycle-scoping into unrelated
// consumers like the Risk & Payout drawdown bars or the Payouts tab's
// lifetime chips, both of which must stay lifetime-scoped on purpose).
// Instead, the normal lifetime render runs exactly as before, and once
// it's finished (hero drawn, KPI cards drawn, tabs built) this file
// patches the already-rendered DOM in place with cycle-scoped numbers,
// computed via a self-contained, synchronous trade-filter swap that's
// reverted before this function returns — no other code ever sees the
// filtered `trades` array. Loaded last.
// ════════════════════════════════════════════════════════════════════

// Persists the user's toggle choice per account for the session.
const _accOvMode = {};

// Computes analytics for just the trades on/after cycleStartDate, by
// briefly swapping the shared `trades` array around a single synchronous
// call to the untouched, original _accComputeAnalytics(). No async gap
// occurs inside the try block, so nothing else can observe the swap.
function _accOvComputeCycleAnalytics(name, cycleStartDate) {
  const fullTrades = trades;
  try {
    trades = fullTrades.filter(t => t.date >= cycleStartDate);
    return _accComputeAnalytics(name);
  } finally {
    trades = fullTrades;
  }
}

function _accOvSetMode(name, mode) {
  _accOvMode[name] = mode;
  _accOvApplyScope(name);
}

function _accOvFmtPlain(d) {
  return (d === null || d === undefined) ? '—' : (d >= 0 ? '+$' : '-$') + Math.abs(d).toFixed(2);
}

function _accOvPatchHero(hero, m) {
  const accSize = m.accSize;
  const at = m.at;
  const netProfitPct = accSize > 0 ? (m.netDollars / accSize) * 100 : null;

  const statMap = {
    'Net Profit':    { val: _accOvFmtPlain(m.netDollars), cls: m.netDollars >= 0 ? 'green' : 'red' },
    'Profit %':      { val: netProfitPct !== null ? (netProfitPct >= 0 ? '+' : '') + netProfitPct.toFixed(2) + '%' : '—', cls: m.netDollars >= 0 ? 'green' : 'red' },
    'Win Rate':      { val: at.length ? m.wr.toFixed(1) + '%' : '—', cls: m.wr >= 55 ? 'green' : 'red' },
    'Profit Factor': { val: at.length ? (isFinite(m.pf) ? m.pf.toFixed(2) + 'x' : '∞') : '—', cls: 'gold' },
    'Trades':        { val: at.length || '—', cls: 'blue' },
    'Trading Days':  { val: m.tradingDays || '—', cls: '' },
    'Max Drawdown':  { val: at.length ? m.maxDDPct.toFixed(1) + '%' : '—', cls: m.maxDDPct <= 10 ? 'green' : 'red' },
  };

  hero.querySelectorAll('.acc-hero-stat').forEach(el => {
    const labelEl = el.querySelector('.acc-hero-stat-label');
    const valEl = el.querySelector('.acc-hero-stat-val');
    if (!labelEl || !valEl) return;
    const info = statMap[labelEl.textContent.trim()];
    if (!info) return; // Account Size (and anything else unaffected by scope) is left alone
    valEl.textContent = info.val;
    valEl.className = 'acc-hero-stat-val' + (info.cls ? ' ' + info.cls : '');
  });

  // Health ring + grade + "why this score" reasons
  const health = _accHealthScore(m);
  const healthColor = _accGradeColor(health.grade);
  const ringWrap = hero.querySelector('.acc-health-ring-wrap');
  if (ringWrap) {
    const ringSvg = _calRingGauge(
      health.score !== null ? health.score / 100 : 0,
      healthColor, _calCssVar('--glass-3', 'rgba(255,255,255,0.12)'), 104
    );
    ringWrap.innerHTML = `${ringSvg}
      <div class="acc-health-center">
        <div class="acc-health-grade" style="color:${healthColor}">${health.grade}</div>
        <div class="acc-health-score">${health.score !== null ? health.score + '/100' : ''}</div>
      </div>`;
  }
  const whyPanel = hero.querySelector('#acc-health-why-panel');
  if (whyPanel) whyPanel.innerHTML = `<ul>${health.reasons.map(r => `<li>${r}</li>`).join('')}</ul>`;
}

function _accOvPatchKpiCards(root, m) {
  const scorecard = root.querySelector('.acc-kpi-scorecard');
  if (!scorecard) return;
  const at = m.at;
  const trendWR  = _accTrendBadge(m.halfWR(m.firstHalf),  m.halfWR(m.secondHalf),  { suffix: '%' });
  const trendNet = _accTrendBadge(m.halfNet(m.firstHalf), m.halfNet(m.secondHalf), { suffix: '' });
  const trendPF  = _accTrendBadge(m.halfPF(m.firstHalf),  m.halfPF(m.secondHalf),  { suffix: 'x' });

  // Same order _accKpiCardHtml() was originally called in — must match
  // the card order accShowDetail() renders so index i lines up.
  const specs = [
    ['acc-spark-net', _accOvFmtPlain(m.netDollars), m.netDollars >= 0 ? 'green' : 'red', m.rollNet, m.netDollars >= 0 ? '#34d399' : '#f87171', trendNet],
    ['acc-spark-pf',  at.length ? (isFinite(m.pf) ? m.pf.toFixed(2) + 'x' : '∞') : '—', 'gold', m.rollPF, '#fbbf24', trendPF],
    ['acc-spark-wr',  at.length ? m.wr.toFixed(1) + '%' : '—', m.wr >= 55 ? 'green' : 'red', m.rollWR, '#60a5fa', trendWR],
    ['acc-spark-exp', at.length ? _accOvFmtPlain(m.expectancy) : '—', m.expectancy >= 0 ? 'green' : 'red', m.rollExp, m.expectancy >= 0 ? '#34d399' : '#f87171', { dir: 'flat', text: 'per trade' }],
    ['acc-spark-rr',  m.avgRR !== null ? m.avgRR.toFixed(2) + 'R' : '—', '', m.rollRR, '#a78bfa', { dir: 'flat', text: '' }],
    ['acc-spark-dd',  at.length ? _accOvFmtPlain(-m.maxDD) : '—', m.maxDDPct <= 10 ? 'green' : 'red', m.rollDD, '#f87171', { dir: 'flat', text: m.maxDDPct.toFixed(1) + '%' }],
    ['acc-spark-rec', at.length ? (isFinite(m.recoveryFactor) ? m.recoveryFactor.toFixed(2) + 'x' : '∞') : '—', 'blue', m.rollNet, '#60a5fa', { dir: 'flat', text: '' }],
    ['acc-spark-aw',  _accOvFmtPlain(m.avgWDollars), 'green', m.rollNet, '#34d399', { dir: 'flat', text: '' }],
    ['acc-spark-al',  _accOvFmtPlain(m.avgLDollars), 'red', m.rollNet, '#f87171', { dir: 'flat', text: '' }],
    ['acc-spark-cnt', at.length || '—', '', m.rollCount, '#60a5fa', { dir: 'flat', text: '' }],
  ];

  const cards = scorecard.querySelectorAll('.acc-kpi-card');
  specs.forEach((spec, i) => {
    const card = cards[i];
    if (!card) return;
    const [id, valStr, valClass, spark, sparkColor, trend] = spec;
    const valEl = card.querySelector('.acc-kpi-card-val');
    const trendEl = card.querySelector('.acc-kpi-card-trend');
    if (valEl) { valEl.className = 'acc-kpi-card-val' + (valClass ? ' ' + valClass : ''); valEl.textContent = valStr; }
    if (trendEl) { trendEl.className = 'acc-kpi-card-trend ' + trend.dir; trendEl.textContent = trend.text; }
    const canvas = document.getElementById(id);
    if (canvas) _accDrawSparkline(canvas, spark, sparkColor);
  });
}

// Redraws the equity curve honoring the current toggle mode — reuses the
// original draw function (which internally calls _accComputeAnalytics),
// briefly scoping `trades` around that single synchronous call when in
// Current Cycle mode.
function _accOvDrawEquityCurve(name) {
  const mode = _accOvMode[name];
  if (mode !== 'cycle') { _accDrawEquityCurve(name); return; }
  const s = (typeof _accPayoutState === 'function') ? _accPayoutState(name) : null;
  if (!s || !s.supported) { _accDrawEquityCurve(name); return; }
  const fullTrades = trades;
  try {
    trades = fullTrades.filter(t => t.date >= s.cycleStartDate);
    _accDrawEquityCurve(name);
  } finally {
    trades = fullTrades;
  }
}

function _accOvApplyScope(name) {
  const body = document.getElementById('acc-detail-body');
  if (!body) return;
  const hero = body.querySelector('.acc-hero');
  if (!hero) return;
  if (typeof _accPayoutState !== 'function') return;
  const s = _accPayoutState(name);
  if (!s || !s.supported) {
    // Not a payout-supporting account type — no cycle concept, no toggle.
    const stale = hero.querySelector('.acc-hero-scope-toggle');
    if (stale) stale.remove();
    return;
  }

  // Insert (or find) the toggle row, right under the name/badges row.
  let toggleEl = hero.querySelector('.acc-hero-scope-toggle');
  if (!toggleEl) {
    toggleEl = document.createElement('div');
    toggleEl.className = 'acc-hero-scope-toggle';
    const heroTop = hero.querySelector('.acc-hero-top');
    if (heroTop) heroTop.insertAdjacentElement('afterend', toggleEl);
  }
  const mode = _accOvMode[name] || (_accOvMode[name] = 'cycle');
  const esc = name.replace(/'/g, "\\'");
  toggleEl.innerHTML = `
    <button class="acc-hero-scope-btn${mode === 'cycle' ? ' active' : ''}" onclick="_accOvSetMode('${esc}','cycle')">Current Cycle</button>
    <button class="acc-hero-scope-btn${mode === 'lifetime' ? ' active' : ''}" onclick="_accOvSetMode('${esc}','lifetime')">All-Time</button>
  `;

  const m = mode === 'cycle' ? _accOvComputeCycleAnalytics(name, s.cycleStartDate) : _accComputeAnalytics(name);

  _accOvPatchHero(hero, m);
  _accOvPatchKpiCards(body, m);
  _accOvDrawEquityCurve(name);
}

// ── Hook: run after the existing render chain (lifetime hero/KPI/equity
//    draw, then tab-shell build) has fully finished for this frame. ────
const _accOvOrigShowDetail = window.accShowDetail;
window.accShowDetail = function (name, ...rest) {
  const r = _accOvOrigShowDetail.call(this, name, ...rest);
  requestAnimationFrame(() => _accOvApplyScope(name));
  return r;
};

// The equity curve's own Balance/Daily/Drawdown toggle redraws with
// _accDrawEquityCurve(name) directly (lifetime) — reapply cycle scope
// right after if that's the active mode.
const _accOvOrigSetAccEqMode = window.setAccEqMode;
if (typeof _accOvOrigSetAccEqMode === 'function') {
  window.setAccEqMode = function (mode, btn) {
    const r = _accOvOrigSetAccEqMode.apply(this, arguments);
    if (_accActiveName && _accOvMode[_accActiveName] === 'cycle') _accOvDrawEquityCurve(_accActiveName);
    return r;
  };
}

// Same fix for the window resize handler registered in accounts.js.
window.addEventListener('resize', () => {
  if (_accActiveName && _accOvMode[_accActiveName] === 'cycle') {
    const drawer = document.getElementById('acc-detail-drawer');
    if (drawer && drawer.classList.contains('open')) _accOvDrawEquityCurve(_accActiveName);
  }
});
