// ══ NxTGen Journal — accounts-premium.js ══════════════════════════════
// Premium analytical layer for the Accounts page. Loaded after
// dashboard-premium.js (reuses its pf3Colors/pf3Mount/pf3OpenPopover/
// pf3Stat/pf3ReducedMotion helpers) and after accounts.js.
//
// Same safe-override rule as the other *-premium.js files: always
// `const orig = window.fn; window.fn = function(){...}` — never a
// same-named top-level `function fn(){}` redeclaration.
// ════════════════════════════════════════════════════════════════════

// ── Account grid — mini equity sparkline per card ─────────────────────
const _pf3AccOrigRenderGrid = window._renderAccGrid;
window._renderAccGrid = function (...args) {
  const r = _pf3AccOrigRenderGrid.apply(this, args);
  requestAnimationFrame(pf3AccRenderGridSparklines);
  return r;
};

function pf3AccRenderGridSparklines() {
  if (typeof PF3_HAS_APEX === 'undefined' || !PF3_HAS_APEX) return;
  const accounts = (_getCustomAccounts ? _getCustomAccounts() : []).filter(a => a.status !== 'archived' && a.status !== 'deleted');
  const cards = document.querySelectorAll('#accounts-grid .acc-card:not(.acc-card-archived)');
  if (cards.length !== accounts.length) return; // safety: only proceed on a guaranteed 1:1 zip
  const c = pf3Colors();
  cards.forEach((card, i) => {
    const acc = accounts[i];
    const at = (typeof trades !== 'undefined' ? trades : []).filter(t => t.account === acc.name).sort((a, b) => a.date.localeCompare(b.date));
    if (at.length < 2) return;
    const accSize = parseFloat(acc.size) || 0;
    let cum = 0;
    const series = at.map(t => { cum += toPnlDollars(t, accSize); return cum; });
    let mount = card.querySelector('.pf3-acc-card-spark');
    if (!mount) {
      mount = document.createElement('div');
      mount.className = 'pf3-acc-card-spark';
      const dotsRow = card.querySelector('.acc-recent-dots');
      (dotsRow || card).insertAdjacentElement(dotsRow ? 'afterend' : 'beforeend', mount);
    }
    const mountId = 'pf3-acc-spark-' + i;
    mount.id = mountId;
    const col = series[series.length - 1] >= 0 ? c.green : c.red;
    pf3Mount(mountId, {
      chart: { type: 'area', height: 28, sparkline: { enabled: true }, animations: { enabled: !pf3ReducedMotion(), speed: 400 } },
      series: [{ data: series }],
      stroke: { curve: 'smooth', width: 1.5, colors: [col] },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.32, opacityTo: 0 } },
      colors: [col],
      tooltip: { enabled: false },
    });
  });
}

// ── Account detail drawer — health ring, KPI sparklines + popovers, equity curve ──
const _pf3AccOrigShowDetail = window.accShowDetail;
window.accShowDetail = function (name, ...rest) {
  const r = _pf3AccOrigShowDetail.call(this, name, ...rest);
  requestAnimationFrame(() => pf3AccEnhanceDetail(name));
  return r;
};

function pf3AccEnhanceDetail(name) {
  if (typeof PF3_HAS_APEX === 'undefined' || !PF3_HAS_APEX) return;
  const m = _accComputeAnalytics(name);
  const c = pf3Colors();

  // Account Health ring → ApexCharts radialBar with glow + pulse-on-improve
  const ringWrap = document.querySelector('.acc-health-ring-wrap');
  if (ringWrap) {
    let mount = ringWrap.querySelector('.pf3-acc-health-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.className = 'pf3-acc-health-mount';
      mount.id = 'pf3-acc-health-mount';
      ringWrap.insertBefore(mount, ringWrap.firstChild);
      const legacySvg = ringWrap.querySelector('svg');
      if (legacySvg) legacySvg.style.display = 'none';
    }
    const health = _accHealthScore(m);
    if (health.score !== null) {
      const col = _accGradeColor(health.grade);
      pf3Mount('pf3-acc-health-mount', {
        chart: { type: 'radialBar', height: 104, width: 104, animations: { enabled: !pf3ReducedMotion(), speed: 700 } },
        series: [health.score],
        colors: [col],
        plotOptions: { radialBar: { hollow: { size: '68%' }, track: { background: 'rgba(255,255,255,0.06)' }, dataLabels: { show: false } } },
        stroke: { lineCap: 'round' },
      });
      let prev = null;
      try { prev = parseInt(localStorage.getItem('nx_acc_health_' + name) || '', 10); } catch (e) {}
      const heroEl = document.querySelector('.acc-hero');
      if (heroEl && !pf3ReducedMotion() && !isNaN(prev) && health.score > prev) {
        heroEl.classList.add('pf3-pulse-up');
        setTimeout(() => heroEl.classList.remove('pf3-pulse-up'), 1500);
      }
      try { localStorage.setItem('nx_acc_health_' + name, String(health.score)); } catch (e) {}
    }
  }

  // 100% milestone → trophy label on the challenge tracker, if reached
  document.querySelectorAll('.acc-chal-ms').forEach(el => {
    const lbl = el.querySelector('.acc-chal-ms-lbl');
    if (lbl && lbl.textContent.trim() === '100%') el.classList.add('pf3-ms-100');
  });

  // KPI scorecard tiles → ApexCharts sparkline + tap-to-expand popover
  const specs = [
    { id: 'acc-spark-net', data: m.rollNet, color: m.netDollars >= 0 ? c.green : c.red, open: () => pf3AccOpenNetPopover(m) },
    { id: 'acc-spark-pf', data: m.rollPF, color: c.gold, open: () => pf3AccOpenPfPopover(m) },
    { id: 'acc-spark-wr', data: m.rollWR, color: c.blue, open: () => pf3AccOpenWrPopover(m) },
    { id: 'acc-spark-exp', data: m.rollExp, color: m.expectancy >= 0 ? c.green : c.red, open: () => pf3AccOpenExpPopover(m) },
    { id: 'acc-spark-rr', data: m.rollRR, color: c.purple, open: null },
    { id: 'acc-spark-dd', data: m.rollDD, color: c.red, open: () => pf3AccOpenDrawdownPopover(m) },
    { id: 'acc-spark-rec', data: m.rollNet, color: c.blue, open: null },
    { id: 'acc-spark-aw', data: m.rollNet, color: c.green, open: null },
    { id: 'acc-spark-al', data: m.rollNet, color: c.red, open: null },
    { id: 'acc-spark-cnt', data: m.rollCount, color: c.blue, open: null },
  ];
  specs.forEach(spec => {
    const canvas = document.getElementById(spec.id);
    if (!canvas || !spec.data || spec.data.length < 2) return;
    canvas.style.display = 'none';
    let mount = canvas.parentElement.querySelector('.pf3-acc-kpi-mount');
    if (!mount) {
      mount = document.createElement('div');
      mount.className = 'pf3-acc-kpi-mount';
      canvas.insertAdjacentElement('afterend', mount);
    }
    const mountId = spec.id + '-apex';
    mount.id = mountId;
    pf3Mount(mountId, {
      chart: { type: 'area', height: 26, sparkline: { enabled: true }, animations: { enabled: !pf3ReducedMotion(), speed: 400 } },
      series: [{ data: spec.data }],
      stroke: { curve: 'smooth', width: 1.5, colors: [spec.color] },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } },
      colors: [spec.color],
      tooltip: { enabled: false },
    });
    if (spec.open) {
      const card = canvas.closest('.acc-kpi-card');
      if (card && !card.dataset.pf3Wired) {
        card.dataset.pf3Wired = '1';
        card.addEventListener('click', spec.open);
      }
    }
  });

  pf3AccRenderEquityCurve(name);
}

// ── Equity curve — full ApexCharts rebuild (replaces the canvas draw) ──
const _pf3AccOrigDrawEq = window._accDrawEquityCurve;
window._accDrawEquityCurve = function (name) {
  if (typeof PF3_HAS_APEX === 'undefined' || !PF3_HAS_APEX) return _pf3AccOrigDrawEq.call(this, name);
  pf3AccRenderEquityCurve(name);
};

function pf3AccMonthMarkers(sorted) {
  const seen = new Set(); const out = [];
  sorted.forEach((p, i) => { const ym = (p.date || '').slice(0, 7); if (ym && !seen.has(ym)) { seen.add(ym); out.push({ index: i, label: ym }); } });
  return out;
}

function pf3AccRenderEquityCurve(name) {
  const canvas = document.getElementById('acc-eq-canvas');
  const emptyEl = document.getElementById('acc-eq-empty');
  const wrap = canvas ? canvas.parentElement : null;
  if (!canvas || !wrap) return;
  const m = _accComputeAnalytics(name);
  const mode = (typeof _accEqMode !== 'undefined') ? _accEqMode : 'balance';

  let series;
  if (mode === 'daily') series = m.dailySeries.map(p => ({ x: p.i, y: p.val, date: p.date }));
  else if (mode === 'drawdown') series = m.ddSeries.map(p => ({ x: p.i, y: p.dd, date: p.date }));
  else series = m.curve.map(p => ({ x: p.i, y: p.cum, date: p.date, outcome: p.outcome }));

  if (series.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    const apexMount = document.getElementById('acc-eq-apex'); if (apexMount) apexMount.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  canvas.style.display = 'none';

  let mount = document.getElementById('acc-eq-apex');
  if (!mount) { mount = document.createElement('div'); mount.id = 'acc-eq-apex'; wrap.insertAdjacentElement('afterend', mount); }

  const c = pf3Colors();
  const last = series[series.length - 1].y;
  const col = mode === 'drawdown' ? c.red : (last >= 0 ? c.green : c.red);
  const monthMarkers = pf3AccMonthMarkers(series);

  if (mode === 'daily') {
    pf3Mount('acc-eq-apex', {
      chart: { type: 'bar', height: 200, toolbar: { show: true, tools: { download: false } }, animations: { enabled: !pf3ReducedMotion(), speed: 400 } },
      series: [{ name: 'Daily P/L', data: series.map(p => p.y) }],
      xaxis: { categories: series.map(p => String(p.date).slice(5)), labels: { style: { colors: c.text3, fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: c.text3, fontSize: '10px' }, formatter: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) } },
      plotOptions: { bar: { borderRadius: 3, colors: { ranges: [{ from: -1000000, to: 0, color: c.red }, { from: 0, to: 1000000, color: c.green }] } } },
      dataLabels: { enabled: false },
      grid: { borderColor: c.border, strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) } },
    });
    return;
  }

  pf3Mount('acc-eq-apex', {
    chart: {
      type: 'area', height: 200,
      toolbar: { show: true, tools: { download: false, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
      zoom: { enabled: true },
      animations: { enabled: !pf3ReducedMotion(), speed: 500 },
    },
    series: [{ name: mode === 'drawdown' ? 'Drawdown' : 'Balance', data: series.map(p => p.y) }],
    colors: [col],
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.32, opacityTo: 0, stops: [0, 100] } },
    dataLabels: { enabled: false },
    grid: { borderColor: c.border, strokeDashArray: 3 },
    xaxis: {
      labels: { formatter: v => { const p = series[Math.round(v)]; return p ? String(p.date).slice(5) : ''; }, style: { colors: c.text3, fontSize: '10px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: c.text3, width: 1, dashArray: 3 } },
    },
    yaxis: { labels: { style: { colors: c.text3, fontSize: '10px' }, formatter: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) } },
    annotations: { xaxis: monthMarkers.map(mm => ({ x: mm.index, borderColor: c.border, label: { text: mm.label, style: { color: c.text3, background: 'transparent', fontSize: '9px' }, offsetY: -4 } })) },
    tooltip: {
      theme: 'dark',
      x: { formatter: v => { const p = series[Math.round(v)]; return p ? (p.date || '') + (p.outcome ? ' · ' + p.outcome : '') : ''; } },
      y: { formatter: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) },
    },
    markers: { size: 0, hover: { size: 4 } },
  });
}

// ── KPI tile popovers (reuse pf3OpenPopover/pf3Stat from dashboard-premium.js) ──
function pf3AccOpenNetPopover(m) {
  const stats = [
    pf3Stat('Net Profit', fmtUSD(m.netDollars)),
    pf3Stat('Gross Profit', fmtUSD(m.grossW)),
    pf3Stat('Gross Loss', fmtUSD(-m.grossL)),
    pf3Stat('Expectancy / trade', fmtUSD(m.expectancy)),
  ].join('');
  pf3OpenPopover('Net Profit', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'area', height: 200, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Balance', data: m.rollNet }],
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } },
      colors: [m.netDollars >= 0 ? c.green : c.red],
      xaxis: { labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: c.text3, fontSize: '10px' }, formatter: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) } },
      grid: { borderColor: c.border, strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => fmtUSD(v) } },
    });
  });
}
function pf3AccOpenPfPopover(m) {
  const stats = [
    pf3Stat('Profit Factor', isFinite(m.pf) ? m.pf.toFixed(2) + 'x' : '∞'),
    pf3Stat('Winning trades', m.wins.length),
    pf3Stat('Losing trades', m.losses.length),
    pf3Stat('Gross Profit', fmtUSD(m.grossW)),
    pf3Stat('Gross Loss', fmtUSD(-m.grossL)),
  ].join('');
  pf3OpenPopover('Profit Factor Breakdown', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'bar', height: 160, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Amount', data: [m.grossW, -m.grossL] }],
      xaxis: { categories: ['Gross Profit', 'Gross Loss'], labels: { style: { colors: c.text3, fontSize: '10px' } } },
      plotOptions: { bar: { borderRadius: 4, horizontal: true, distributed: true, colors: { ranges: [{ from: -1000000, to: 0, color: c.red }, { from: 0, to: 1000000, color: c.green }] } } },
      legend: { show: false }, dataLabels: { enabled: true, formatter: v => fmtUSD(v), style: { colors: ['#fff'] } },
      grid: { show: false }, tooltip: { enabled: false },
    });
  });
}
function pf3AccOpenWrPopover(m) {
  const be = m.at.length - m.wins.length - m.losses.length;
  const stats = [
    pf3Stat('Win Rate', m.wr.toFixed(1) + '%'),
    pf3Stat('Wins', m.wins.length),
    pf3Stat('Losses', m.losses.length),
    pf3Stat('Break-evens', be),
    pf3Stat('Avg RR', m.avgRR !== null ? m.avgRR.toFixed(2) + 'R' : '—'),
    pf3Stat('Largest winner', m.largestWin !== null ? fmtUSD(m.largestWin) : '—'),
  ].join('');
  pf3OpenPopover('Win Rate Breakdown', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'donut', height: 200, animations: { enabled: !pf3ReducedMotion() } },
      series: [m.wins.length, be, m.losses.length],
      labels: ['Wins', 'Break-even', 'Losses'],
      colors: [c.green, c.blue, c.red],
      legend: { labels: { colors: c.text3 }, fontSize: '11px' },
      dataLabels: { enabled: false }, stroke: { show: false },
    });
  });
}
function pf3AccOpenExpPopover(m) {
  const stats = [
    pf3Stat('Expectancy / trade', fmtUSD(m.expectancy)),
    pf3Stat('Avg Win', m.avgWDollars !== null ? fmtUSD(m.avgWDollars) : '—'),
    pf3Stat('Avg Loss', m.avgLDollars !== null ? fmtUSD(-m.avgLDollars) : '—'),
    pf3Stat('Trades', m.at.length),
  ].join('');
  pf3OpenPopover('Expectancy', stats, null);
}
function pf3AccOpenDrawdownPopover(m) {
  const stats = [
    pf3Stat('Max Drawdown', fmtUSD(-m.maxDD)),
    pf3Stat('Max Drawdown %', m.maxDDPct.toFixed(1) + '%'),
    pf3Stat('Recovery Factor', isFinite(m.recoveryFactor) ? m.recoveryFactor.toFixed(2) + 'x' : '∞'),
    pf3Stat('Trading Days', m.tradingDays || '—'),
  ].join('');
  pf3OpenPopover('Drawdown Detail', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'area', height: 180, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Drawdown', data: m.rollDD }],
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0 } },
      colors: [c.red],
      xaxis: { labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: c.text3, fontSize: '10px' }, formatter: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) } },
      grid: { borderColor: c.border, strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => fmtUSD(v) } },
    });
  });
}

// ── Milestones checklist progress bar → checkpoint nodes ──────────────
const _pf3AccOrigRenderMsProgress = window._renderMilestoneProgress;
window._renderMilestoneProgress = function (...args) {
  const r = _pf3AccOrigRenderMsProgress.apply(this, args);
  pf3AccRenderMilestoneNodes();
  return r;
};

function pf3AccRenderMilestoneNodes() {
  const bg = document.getElementById('acc-progress-fill') ? document.getElementById('acc-progress-fill').parentElement : null;
  if (!bg || typeof _accData === 'undefined' || !_accData.milestones) return;
  let nodesWrap = bg.querySelector('.pf3-ms-nodes');
  if (!nodesWrap) { nodesWrap = document.createElement('div'); nodesWrap.className = 'pf3-ms-nodes'; bg.appendChild(nodesWrap); }
  const total = _accData.milestones.length;
  if (!total) { nodesWrap.innerHTML = ''; return; }
  nodesWrap.innerHTML = _accData.milestones.map((m, i) => {
    const pos = total === 1 ? 100 : (i / (total - 1)) * 100;
    return `<span class="pf3-ms-node${m.done ? ' done' : ''}" style="left:${pos}%" title="${(m.t || '').replace(/"/g, '&quot;')}"></span>`;
  }).join('');
}
