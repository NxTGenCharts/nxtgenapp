// ══ NxTGen Journal — calendar-premium.js ══════════════════════════════
// Premium analytical layer for the Calendar page. Loaded after
// calendar.js and dashboard-premium.js (reuses its pf3Colors/pf3Mount/
// pf3OpenPopover/pf3Stat/pf3ReducedMotion helpers).
//
// Note: calMonth, calYear, calFilters, getCalFilter(), getAccSize(),
// groupTradesByDay(), computeCalMonthStats(), _calRingGauge(), etc. are
// all declared top-level in calendar.js. Since none of these scripts use
// type="module", top-level `let`/`function` declarations share one
// script-level scope across all classic <script> tags on the page — so
// they're referenced directly here by name, the same way calendar.js's
// own functions reference each other.
//
// Safe-override rule: `const orig = window.fn; window.fn = function(){...}`
// only — never a same-named top-level `function fn(){}` redeclaration.
// ════════════════════════════════════════════════════════════════════

// ── Wrap renderCalendar() once, to run every enhancement after each redraw ──
const _pf3CalOrigRender = window.renderCalendar;
window.renderCalendar = function (...args) {
  const r = _pf3CalOrigRender.apply(this, args);
  requestAnimationFrame(pf3CalEnhanceAll);
  return r;
};

function pf3CalEnhanceAll() {
  pf3CalEnhanceAnalyticsCards();
  pf3CalEnhanceScoreCard();
  pf3CalEnhanceInsights();
  pf3CalEnhanceCoach();
  pf3CalEnhanceDayCells();
}

// ════════════════════════════════════════════════════════════════════
// ANALYTICS CARDS (row1/row2) — tap-to-expand popovers
// ════════════════════════════════════════════════════════════════════

function pf3CalCurrentMonthTrades() {
  const accFilter = typeof getCalFilter === 'function' ? getCalFilter() : '';
  const ym = calYear + '-' + String(calMonth + 1).padStart(2, '0');
  const matches = t => {
    if (calFilters.strategy && t.strategy !== calFilters.strategy) return false;
    if (calFilters.session && t.kz !== calFilters.session) return false;
    if (calFilters.pair && t.pair !== calFilters.pair) return false;
    if (calFilters.outcome === 'BE' && (t.outcome === 'Win' || t.outcome === 'Loss')) return false;
    if ((calFilters.outcome === 'Win' || calFilters.outcome === 'Loss') && t.outcome !== calFilters.outcome) return false;
    return true;
  };
  return trades.filter(t => t.date.startsWith(ym) && (!accFilter || t.account === accFilter) && matches(t));
}

function pf3CalEnhanceAnalyticsCards() {
  const row1 = document.getElementById('cal-an-row1');
  const row2 = document.getElementById('cal-an-row2');
  if (!row1 && !row2) return;
  const cards = [
    ...(row1 ? Array.from(row1.children) : []),
    ...(row2 ? Array.from(row2.children) : []),
  ];
  // Card order is fixed by renderCalAnalyticsCards: Net P&L, Trade win%,
  // Profit factor, Day win%, Avg win/loss — map by index, not by text
  // (text is locale/format dependent and less stable to match against).
  const openers = [pf3CalOpenNetPopover, pf3CalOpenWrPopover, pf3CalOpenPfPopover, pf3CalOpenDayWrPopover, pf3CalOpenAvgWlPopover];
  cards.forEach((card, i) => {
    const opener = openers[i];
    if (!opener) return;
    card.setAttribute('data-pf3-tap', '1');
    if (!card.dataset.pf3Wired) {
      card.dataset.pf3Wired = '1';
      card.addEventListener('click', (e) => {
        // Card 0 already has its own onclick="toggleNetPnl()" for $/% toggle —
        // only open the popover when the click didn't land on the info-dot,
        // and don't fight the existing toggle: open on a second, deliberate
        // tap target (the info-dot) so both behaviors coexist cleanly.
        if (i === 0 && !e.target.closest('.info-dot')) return;
        opener();
      });
    }
  });
}

function pf3CalOpenNetPopover() {
  const list = pf3CalCurrentMonthTrades();
  if (!list.length) return;
  const accSize = getAccSize();
  const totalUSD = list.reduce((a, t) => a + toPnlDollars(t, accSize), 0);
  const wins = list.filter(t => t.outcome === 'Win').length;
  const losses = list.filter(t => t.outcome === 'Loss').length;
  const stats = [
    pf3Stat('Net P&L', fmtUSD(totalUSD)),
    pf3Stat('Trades', list.length),
    pf3Stat('Wins', wins),
    pf3Stat('Losses', losses),
  ].join('');
  pf3OpenPopover('Net P&L — This Month', stats, (id) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    const series = sorted.map(t => { cum += toPnlDollars(t, accSize); return cum; });
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'area', height: 180, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Cumulative', data: series }],
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } },
      colors: [totalUSD >= 0 ? c.green : c.red],
      xaxis: { labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: c.text3, fontSize: '10px' }, formatter: v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) } },
      grid: { borderColor: c.border, strokeDashArray: 3 },
      tooltip: { theme: 'dark', y: { formatter: v => fmtUSD(v) } },
    });
  });
}

function pf3CalOpenWrPopover() {
  const list = pf3CalCurrentMonthTrades();
  if (!list.length) return;
  const wins = list.filter(t => t.outcome === 'Win').length;
  const losses = list.filter(t => t.outcome === 'Loss').length;
  const be = list.length - wins - losses;
  const rrNums = list.map(t => _parseRR(t.rr)).filter(v => v !== null);
  const avgRR = rrNums.length ? rrNums.reduce((a, b) => a + b, 0) / rrNums.length : null;
  const stats = [
    pf3Stat('Wins', wins), pf3Stat('Losses', losses), pf3Stat('Break-evens', be),
    pf3Stat('Avg RR', avgRR !== null ? avgRR.toFixed(2) + 'R' : '—'),
  ].join('');
  pf3OpenPopover('Trade Win Rate', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'donut', height: 200, animations: { enabled: !pf3ReducedMotion() } },
      series: [wins, be, losses], labels: ['Wins', 'Break-even', 'Losses'],
      colors: [c.green, c.blue, c.red],
      legend: { labels: { colors: c.text3 }, fontSize: '11px' },
      dataLabels: { enabled: false }, stroke: { show: false },
    });
  });
}

function pf3CalOpenPfPopover() {
  const list = pf3CalCurrentMonthTrades();
  if (!list.length) return;
  const accSize = getAccSize();
  const dollars = list.map(t => toPnlDollars(t, accSize));
  const gp = dollars.filter((d, i) => list[i].pnl > 0 || d > 0).reduce((a, b) => a + Math.max(b, 0), 0);
  const gl = Math.abs(dollars.filter(d => d < 0).reduce((a, b) => a + b, 0));
  const pf = gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0);
  const stats = [
    pf3Stat('Profit Factor', isFinite(pf) ? pf.toFixed(2) + 'x' : '∞'),
    pf3Stat('Gross Profit', fmtUSD(gp)), pf3Stat('Gross Loss', fmtUSD(-gl)),
  ].join('');
  pf3OpenPopover('Profit Factor', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'bar', height: 160, animations: { enabled: !pf3ReducedMotion() } },
      series: [{ name: 'Amount', data: [gp, -gl] }],
      xaxis: { categories: ['Gross Profit', 'Gross Loss'], labels: { style: { colors: c.text3, fontSize: '10px' } } },
      plotOptions: { bar: { borderRadius: 4, horizontal: true, distributed: true, colors: { ranges: [{ from: -1000000, to: 0, color: c.red }, { from: 0, to: 1000000, color: c.green }] } } },
      legend: { show: false }, dataLabels: { enabled: true, formatter: v => fmtUSD(v), style: { colors: ['#fff'] } },
      grid: { show: false }, tooltip: { enabled: false },
    });
  });
}

function pf3CalOpenDayWrPopover() {
  const list = pf3CalCurrentMonthTrades();
  if (!list.length) return;
  const accSize = getAccSize();
  const dayMap = groupTradesByDay(list, accSize);
  const days = Object.values(dayMap);
  const winD = days.filter(d => d.totalPnlUSD > 0).length;
  const lossD = days.filter(d => d.totalPnlUSD < 0).length;
  const beD = days.length - winD - lossD;
  const stats = [
    pf3Stat('Winning days', winD), pf3Stat('Losing days', lossD), pf3Stat('Break-even days', beD),
    pf3Stat('Trading days', days.length),
  ].join('');
  pf3OpenPopover('Day Win Rate', stats, (id) => {
    const c = pf3Colors();
    pf3Mount(id, {
      chart: { type: 'donut', height: 200, animations: { enabled: !pf3ReducedMotion() } },
      series: [winD, beD, lossD], labels: ['Winning days', 'Break-even days', 'Losing days'],
      colors: [c.green, c.blue, c.red],
      legend: { labels: { colors: c.text3 }, fontSize: '11px' },
      dataLabels: { enabled: false }, stroke: { show: false },
    });
  });
}

function pf3CalOpenAvgWlPopover() {
  const list = pf3CalCurrentMonthTrades();
  if (!list.length) return;
  const pcts = list.map(t => typeof _pctOfTrade === 'function' ? _pctOfTrade(t) : 0);
  const winPcts = pcts.filter(p => p > 0), lossPcts = pcts.filter(p => p < 0);
  const median = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const stddev = arr => { if (arr.length < 2) return 0; const mean = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length); };
  const stats = [
    pf3Stat('Median win', median(winPcts).toFixed(2) + '%'), pf3Stat('Median loss', median(lossPcts).toFixed(2) + '%'),
    pf3Stat('Win std. dev.', '±' + stddev(winPcts).toFixed(2) + '%'), pf3Stat('Loss std. dev.', '±' + stddev(lossPcts).toFixed(2) + '%'),
  ].join('');
  pf3OpenPopover('Win / Loss Distribution', stats, null);
}

// ════════════════════════════════════════════════════════════════════
// TRADING SCORE — animated bars (CSS handles transition) + pulse-on-improve
// ════════════════════════════════════════════════════════════════════

function pf3CalEnhanceScoreCard() {
  const card = document.getElementById('cal2-score');
  if (!card || !card.innerHTML.trim()) return;
  const numEl = card.querySelector('.cal2-score-num');
  if (!numEl) return;
  const score = parseInt(numEl.textContent, 10);
  if (isNaN(score)) return;
  const key = 'nx_cal_score_' + calYear + '-' + calMonth;
  let prev = null;
  try { prev = parseInt(localStorage.getItem(key) || '', 10); } catch (e) {}
  if (!pf3ReducedMotion() && !isNaN(prev) && score > prev) {
    card.classList.add('pf3-pulse-up');
    setTimeout(() => card.classList.remove('pf3-pulse-up'), 1500);
  }
  try { localStorage.setItem(key, String(score)); } catch (e) {}
}

// ════════════════════════════════════════════════════════════════════
// MONTHLY INTELLIGENCE — confidence bar per insight, sample-size based
// ════════════════════════════════════════════════════════════════════

function pf3CalEnhanceInsights() {
  const el = document.getElementById('cal2-insights');
  if (!el || !el.innerHTML.trim()) return;
  const stats = window._calStats;
  if (!stats || !stats.totalTrades) return;
  // Honest, simple confidence heuristic: more trades logged this month =
  // more statistical weight behind every pattern flagged from that data.
  const confidence = Math.max(35, Math.min(95, 35 + stats.totalTrades * 5));
  const cards = el.querySelectorAll('.cal2-insight-card');
  cards.forEach((card, i) => {
    if (card.querySelector('.pf3-insight-conf-track')) return;
    card.style.animationDelay = (i * 60) + 'ms';
    const track = document.createElement('div');
    track.className = 'pf3-insight-conf-track';
    track.innerHTML = '<div class="pf3-insight-conf-fill"></div>';
    const label = document.createElement('div');
    label.className = 'pf3-insight-conf-label';
    label.textContent = `${confidence}% confidence · based on ${stats.totalTrades} trade${stats.totalTrades === 1 ? '' : 's'} this month`;
    card.appendChild(track);
    card.appendChild(label);
    requestAnimationFrame(() => { const fill = track.querySelector('.pf3-insight-conf-fill'); if (fill) fill.style.width = confidence + '%'; });
  });
}

// ════════════════════════════════════════════════════════════════════
// AI COACH PREVIEW — swap plain "% confidence" pill for a small ring
// ════════════════════════════════════════════════════════════════════

function pf3CalEnhanceCoach() {
  const el = document.getElementById('cal2-coach');
  const confEl = el && el.querySelector('.cal2-coach-conf');
  if (!confEl || confEl.dataset.pf3Done) return;
  const pct = parseInt(confEl.textContent, 10);
  if (isNaN(pct)) return;
  confEl.dataset.pf3Done = '1';
  const c = pf3Colors ? pf3Colors() : { green: '#34d399', gold: '#fbbf24', red: '#f87171' };
  const col = pct >= 70 ? c.green : pct >= 45 ? c.gold : c.red;
  const ring = typeof _calRingGauge === 'function' ? _calRingGauge(pct / 100, col, _calCssVar('--glass-3', 'rgba(255,255,255,0.12)'), 26) : '';
  confEl.innerHTML = `<span class="pf3-coach-ring-wrap">${ring}<span>${pct}% confidence</span></span>`;
}

// ════════════════════════════════════════════════════════════════════
// DAY CELLS — profit ring (win/loss conic-gradient) + mini intraday
// sparkline. Pure CSS/inline-SVG only — no chart-library instances per
// cell, to stay fast across 35–42 cells per render.
// ════════════════════════════════════════════════════════════════════

function pf3CalEnhanceDayCells() {
  const daysEl = document.getElementById('cal-days-2'); // full standalone Calendar page only
  if (!daysEl) return;
  const cells = daysEl.querySelectorAll('.cal-day.has-trades');
  const dayMap = window._dayMap || {};
  const c = { green: '#34d399', red: '#f87171', blue: '#60a5fa' };
  try {
    const cs = getComputedStyle(document.documentElement);
    c.green = cs.getPropertyValue('--green').trim() || c.green;
    c.red = cs.getPropertyValue('--red').trim() || c.red;
    c.blue = cs.getPropertyValue('--blue').trim() || c.blue;
  } catch (e) {}

  cells.forEach(cell => {
    const dot = cell.querySelector('.cal-day-dot');
    if (!dot) return;
    // Recover the date from the click handler already on the cell
    // (openCalPopup(event,'YYYY-MM-DD')) rather than re-deriving it, so
    // this never drifts out of sync with what the cell actually renders.
    const onclickAttr = cell.getAttribute('onclick') || '';
    const m = onclickAttr.match(/openCalPopup\(event,'([\d-]+)'\)/);
    const dateStr = m ? m[1] : null;
    const dayData = dateStr ? dayMap[dateStr] : null;
    if (!dayData || dot.dataset.pf3Done) return;
    dot.dataset.pf3Done = '1';

    const wins = dayData.wins || 0, losses = dayData.losses || 0, total = dayData.trades.length;
    if (total >= 2 && (wins + losses) > 0) {
      const winFrac = wins / (wins + losses);
      const isToday = cell.classList.contains('today');
      const deg = Math.round(winFrac * 360);
      const ring = document.createElement('div');
      ring.className = 'pf3-day-ring' + (isToday ? ' pf3-day-ring-today' : '');
      ring.style.background = `conic-gradient(${c.green} 0deg ${deg}deg, ${c.red} ${deg}deg 360deg)`;
      ring.title = `${wins}W / ${losses}L this day`;
      dot.replaceWith(ring);
    }

    // Mini intraday sparkline — only when there's an actual sequence worth
    // drawing (3+ trades) and only on the full-page calendar.
    if (total >= 3) {
      const accSize = getAccSize();
      const dayTrades = [...dayData.trades].sort((a, b) => (a.id || 0) - (b.id || 0));
      let cum = 0;
      const series = dayTrades.map(t => { cum += toPnlDollars(t, accSize); return cum; });
      const svg = pf3CalMiniSpark(series, cum >= 0 ? c.green : c.red);
      const holder = document.createElement('div');
      holder.innerHTML = svg;
      cell.appendChild(holder.firstChild);
    }
  });
}

function pf3CalMiniSpark(values, color) {
  const w = 60, h = 16, pad = 2;
  const min = Math.min(...values, 0), max = Math.max(...values, 0);
  const range = (max - min) || 1;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  return `<svg class="pf3-day-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}
