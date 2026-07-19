// ══ NxTGen Journal — accounts.js (original app.js lines 7872-9342) ══

// ── ACCOUNTS ──────────────────────────────────────────
function buildAccounts() {
  _renderAccGrid();
  _renderPayoutLog();
  _renderMilestones();
}

/* ── Account cards ── */
function _renderAccGrid() {
  const accounts = _getCustomAccounts();
  const grid = document.getElementById('accounts-grid');
  if (!grid) return;

  if (!accounts.length) {
    grid.innerHTML = `<div class="acc-empty">No accounts yet — click <strong><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Manage Accounts</strong> to add one.</div>`;
    return;
  }

  // Separate active and archived
  const active   = accounts.filter(a => a.status !== 'archived' && a.status !== 'deleted');
  const archived = accounts.filter(a => a.status === 'archived');

  const renderCard = (a) => {
    const name = a.name;
    const at   = trades.filter(t => t.account === name);
    const wins = at.filter(t => t.outcome === 'Win').length;
    const wr   = at.length ? ((wins / at.length) * 100).toFixed(1) : null;
    const _cardAccSize = parseFloat(a.size) || 0;
    const _cardMode    = a.pnlMode || '%';
    // Sum everything in $ using toPnlDollars (handles MT5 auto-detection)
    const pnlDollars = at.reduce((s, t) => s + toPnlDollars(t, _cardAccSize), 0);
    const pnl = _cardMode === '$' || _cardAccSize === 0
      ? pnlDollars
      : (_cardAccSize > 0 ? (pnlDollars / _cardAccSize) * 100 : pnlDollars);
    const pnlStr = at.length
      ? (_cardMode === '$'
          ? (pnlDollars >= 0 ? '+$' : '-$') + Math.abs(pnlDollars).toFixed(2)
          : (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '%')
      : null;
    const pnlColor = pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--text2)';
    const wrColor  = wr !== null ? (parseFloat(wr) >= 60 ? 'var(--green)' : 'var(--red)') : 'var(--text3)';
    const last5 = [...at].sort((x,y) => y.date.localeCompare(x.date)).slice(0,5).reverse();
    const dots  = last5.map(t =>
      `<span class="acc-dot ${t.outcome==='Win'?'w':t.outcome==='Loss'?'l':'b'}"></span>`
    ).join('');
    const isArchived    = a.status === 'archived';
    const isChalDone    = !isArchived && _accChallengeIsComplete(a, pnlDollars, _cardAccSize);
    const statusClass   = isArchived ? 'archived' : (isChalDone ? 'completed' : 'active');
    const statusLabel   = isArchived ? 'Archived' : (isChalDone ? 'Completed' : 'Active');
    const statusIcon    = isChalDone ? `<svg class="icn" aria-hidden="true" style="width:11px;height:11px;margin-right:3px;vertical-align:-1.5px"><use href="#ic-check-c"></use></svg>` : '';
    // MT5 integration
    const mt5cfg        = a.mt5;
    const mt5Enabled    = !!mt5cfg?.enabled;
    const mt5Status     = mt5cfg?.lastSyncStatus || 'never';
    const mt5Pending    = (mt5cfg?.pendingTrades || []).length;
    const mt5LastSync   = mt5cfg?.lastSync ? new Date(mt5cfg.lastSync).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : null;
    const mt5BadgeClass = {ok:'connected',error:'error',syncing:'syncing',pending:'pending',never:'pending'}[mt5Status] || 'pending';
    const mt5BadgeLbl   = {ok:'MT5 Live',error:'Sync Error',syncing:'Syncing…',pending:'Waiting…',never:'Waiting…'}[mt5Status] || 'MT5';
    const mt5HeadBadge  = mt5Enabled
      ? `<span class="mt5-sync-badge ${mt5BadgeClass}"><span class="mt5-sync-dot"></span>${mt5BadgeLbl}</span>` : '';
    const mt5PendingBadge = mt5Pending > 0
      ? `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:var(--r-full);background:rgba(251,191,36,0.12);color:var(--gold);border:1px solid rgba(251,191,36,0.25);margin-left:4px">+${mt5Pending} new</span>` : '';
    const mt5Row = mt5Enabled
      ? `<div class="acc-mt5-row">
           <span style="color:var(--blue);font-size:10px;font-weight:600">⑥ MT5${mt5PendingBadge}</span>
           <span class="acc-mt5-last">${mt5LastSync ? 'Last: '+mt5LastSync : 'No sync yet'}</span>
         </div>` : '';
    const mt5Btn = !isArchived
      ? `<button class="mt5-connect-btn${mt5Enabled?' connected':''}"
           onclick="event.stopPropagation();mt5OpenModal('${name.replace(/'/g,"\\'")}')">
           <span>⑥</span>${mt5Enabled ? 'MT5 Connected — Manage' : 'Connect MT5 Account'}
         </button>` : '';
    return `
    <div class="acc-card${isArchived ? ' acc-card-archived' : ''}" onclick="${isArchived ? '' : `accShowDetail('${name.replace(/'/g,"\\'")}')` }">
      <div class="acc-card-head">
        <div class="acc-name">${name}${a.type ? `<span class="acc-type-badge">${a.type}</span>` : ''}${a.type === 'Challenge' && a.challengePhase ? `<span class="acc-type-badge">${a.challengePhase}</span>` : ''}${mt5HeadBadge}</div>
        <span class="acc-status ${statusClass}">${statusIcon}${statusLabel}</span>
      </div>
      <div class="acc-row"><span class="k">Trades</span><span class="v">${at.length || '—'}</span></div>
      <div class="acc-row"><span class="k">Win Rate</span><span class="v" style="color:${wrColor}">${wr !== null ? wr + '%' : '—'}</span></div>
      <div class="acc-row acc-pnl-toggle" title="Tap to switch $ / %" onclick="event.stopPropagation();_toggleAccCardPnlMode('${name.replace(/'/g,"\\'")}')"><span class="k">Net PnL</span><span class="v" style="color:${pnlColor}">${pnlStr || '—'}</span></div>
      ${last5.length ? `<div class="acc-recent-dots">${dots}<span class="acc-recent-label">Recent</span></div>` : ''}
      ${mt5Row}
      ${mt5Btn}
      ${isArchived ? `<button class="acc-restore-btn" onclick="event.stopPropagation();_restoreAccountByName('${name.replace(/'/g,"\\'")}'"><svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Restore</button>` : ''}
    </div>`;
  };

  let html = active.map(renderCard).join('');
  if (archived.length) {
    html += `<div class="acc-archived-divider"><span>Archived (${archived.length})</span></div>`;
    html += archived.map(renderCard).join('');
  }
  grid.innerHTML = html;
}

/* ── Account detail drawer — institutional analytics dashboard ── */

let _accEqMode      = 'balance'; // 'balance' | 'daily' | 'drawdown'
let _accActiveName  = null;

async function _accDetailSetMode(accountName, mode) {
  const list = _getCustomAccounts();
  const idx  = list.findIndex(a => a.name === accountName);
  if (idx === -1) return;
  list[idx].pnlMode = mode;
  await _saveCustomAccounts(list);
  buildAccounts();
  accShowDetail(accountName);
}

// Single source of truth for every card/chart on the account analytics dashboard.
function _accComputeAnalytics(name) {
  const acc     = _getCustomAccounts().find(a => a.name === name) || {};
  const accSize = parseFloat(acc.size) || 0;
  const pnlMode = acc.pnlMode || '%';

  const atDesc = trades.filter(t => t.account === name).sort((a,b) => b.date.localeCompare(a.date));
  const at     = [...atDesc].sort((a,b) => a.date.localeCompare(b.date)); // ascending, for curves

  const dollars = t => toPnlDollars(t, accSize);
  const wins    = at.filter(t => t.outcome === 'Win');
  const losses  = at.filter(t => t.outcome === 'Loss');
  const bes     = at.filter(t => t.outcome !== 'Win' && t.outcome !== 'Loss');

  const sum          = arr => arr.reduce((s,t) => s + dollars(t), 0);
  const netDollars   = sum(at);
  const grossW       = sum(wins);
  const grossL       = Math.abs(sum(losses));
  const pf           = grossL > 0 ? grossW / grossL : (grossW > 0 ? Infinity : 0);
  const wr           = at.length ? (wins.length / at.length) * 100 : 0;
  const avgWDollars  = wins.length   ? grossW / wins.length   : null;
  const avgLDollars  = losses.length ? grossL / losses.length : null;
  const largestWin   = wins.length   ? Math.max(...wins.map(dollars))   : null;
  const largestLoss  = losses.length ? Math.min(...losses.map(dollars)) : null;
  const expectancy   = at.length ? netDollars / at.length : 0;

  const rrVals = at.map(t => _parseRR(t.rr)).filter(v => v !== null && !isNaN(v));
  const avgRR  = rrVals.length ? rrVals.reduce((a,b) => a+b, 0) / rrVals.length : null;

  // Cumulative balance curve + underwater drawdown series + per-day P&L
  let cum = 0, peak = 0, maxDD = 0;
  const curve    = [];
  const ddSeries = [];
  const dailyMap = {};
  at.forEach((t, idx) => {
    cum += dollars(t);
    peak = Math.max(peak, cum);
    const dd = peak - cum;
    maxDD = Math.max(maxDD, dd);
    curve.push({ i: idx, date: t.date, cum, outcome: t.outcome });
    ddSeries.push({ i: idx, date: t.date, dd: -dd });
    dailyMap[t.date] = (dailyMap[t.date] || 0) + dollars(t);
  });
  const maxDDPct       = accSize > 0 ? (maxDD / accSize) * 100 : (peak > 0 ? (maxDD / peak) * 100 : 0);
  const recoveryFactor = maxDD > 0 ? netDollars / maxDD : (netDollars > 0 ? Infinity : 0);

  const dailyEntries = Object.entries(dailyMap).sort((a,b) => a[0].localeCompare(b[0]));
  const dailySeries   = dailyEntries.map(([date, val], idx) => ({ i: idx, date, val }));

  const tradingDays     = Object.keys(dailyMap).length;
  const avgTradesPerDay = tradingDays ? (at.length / tradingDays) : 0;

  // Rolling series for KPI sparklines
  const rollNet = []; { let c = 0; at.forEach(t => { c += dollars(t); rollNet.push(c); }); }
  const rollWR  = []; { let w = 0; at.forEach((t,i) => { if (t.outcome==='Win') w++; rollWR.push((w/(i+1))*100); }); }
  const rollPF  = []; { let gw=0, gl=0; at.forEach(t => { const d=dollars(t); if (d>0) gw+=d; else gl+=Math.abs(d); rollPF.push(gl>0 ? gw/gl : (gw>0?3:0)); }); }
  const rollExp = rollNet.map((v,i) => v/(i+1));
  const rollRR  = []; { let s=0, n=0; at.forEach(t => { const r=_parseRR(t.rr); if (r!==null && !isNaN(r)) { s+=r; n++; } rollRR.push(n? s/n : 0); }); }
  const rollDD  = ddSeries.map(p => p.dd);
  const rollCount = at.map((_,i) => i+1);

  // Trend: first half of trade sequence vs second half
  const mid = Math.floor(at.length / 2);
  const firstHalf  = at.slice(0, mid);
  const secondHalf = at.slice(mid);
  const halfNet = arr => sum(arr);
  const halfWR  = arr => arr.length ? (arr.filter(t=>t.outcome==='Win').length/arr.length)*100 : 0;
  const halfPF  = arr => {
    const w = sum(arr.filter(t=>t.outcome==='Win'));
    const l = Math.abs(sum(arr.filter(t=>t.outcome==='Loss')));
    return l>0 ? w/l : (w>0?3:0);
  };

  // Consistency — same "quality rating" basis the Dashboard uses
  const rated = at.filter(t => (t.rating||0) > 0);
  const consistency = rated.length ? Math.round((rated.filter(t=>(t.rating||0)>=4).length/rated.length)*100) : null;

  return {
    acc, accSize, pnlMode, at, atDesc, wins, losses, bes,
    netDollars, grossW, grossL, pf, wr, avgWDollars, avgLDollars,
    largestWin, largestLoss, expectancy, avgRR,
    curve, ddSeries, dailySeries, maxDD, maxDDPct, recoveryFactor,
    tradingDays, avgTradesPerDay, consistency,
    firstHalf, secondHalf, halfNet, halfWR, halfPF,
    rollNet, rollWR, rollPF, rollExp, rollRR, rollDD, rollCount,
    dollars,
  };
}

// Composite 0–100 health score from what the journal can actually measure:
// profitability (profit factor), win rate, drawdown control, and setup
// quality/consistency. Weighted, then mapped to a letter grade.
function _accHealthScore(m) {
  if (!m.at.length) return { score: null, grade: '—', reasons: ['Log trades under this account to generate a health score.'] };

  const pfScore   = Math.max(0, Math.min(1, (isFinite(m.pf) ? m.pf : 3) / 3)) * 30;
  const wrScore   = Math.max(0, Math.min(1, m.wr / 100)) * 20;
  const ddScore   = Math.max(0, 1 - Math.min(1, m.maxDDPct / 25)) * 25;
  const consScore = (m.consistency !== null ? m.consistency / 100 : 0.6) * 15;
  const expScore  = m.expectancy > 0 ? 10 : 0;

  const total = Math.round(pfScore + wrScore + ddScore + consScore + expScore);
  let grade;
  if      (total >= 90) grade = 'A+';
  else if (total >= 80) grade = 'A';
  else if (total >= 70) grade = 'B+';
  else if (total >= 60) grade = 'B';
  else if (total >= 50) grade = 'C';
  else                   grade = 'D';

  const reasons = [
    isFinite(m.pf)
      ? `Profit factor of ${m.pf.toFixed(2)}x ${m.pf>=1.5?'is strong':'has room to improve'}.`
      : 'No losing trades yet to measure profit factor against.',
    `Win rate of ${m.wr.toFixed(1)}% ${m.wr>=55?'is healthy':'is on the lower side'}.`,
    `Max drawdown of ${m.maxDDPct.toFixed(1)}% ${m.maxDDPct<=10?'shows tight risk control':'is elevated — watch position sizing'}.`,
  ];
  if (m.consistency !== null) reasons.push(`${m.consistency}% of rated trades were 4${icon('star',{cls:'icn-sm icn-gold'})}+ quality setups.`);

  return { score: total, grade, reasons };
}

function _accGradeColor(grade) {
  if (grade === 'A+' || grade === 'A') return _calCssVar('--green', '#34d399');
  if (grade === 'B+' || grade === 'B') return _calCssVar('--blue', '#60a5fa');
  if (grade === 'C') return _calCssVar('--gold', '#fbbf24');
  if (grade === 'D') return _calCssVar('--red', '#f87171');
  return _calCssVar('--text3', '#94a3b8');
}

// Small inline trend series → tiny canvas sparkline (no axes, just shape).
function _accDrawSparkline(canvas, points, color) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 90;
  const H = canvas.clientHeight || 26;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  if (!points || points.length < 2) return;
  const min = Math.min(...points), max = Math.max(...points);
  const range = (max - min) || 1;
  const stepX = W / (points.length - 1);
  const py = v => H - 3 - ((v - min) / range) * (H - 6);

  ctx.beginPath();
  points.forEach((v, i) => { const x = i * stepX, y = py(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.globalAlpha = 0.14; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;

  ctx.beginPath();
  points.forEach((v, i) => { const x = i * stepX, y = py(v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

// Trend badge comparing the first half of the trade history to the second half.
function _accTrendBadge(firstVal, secondVal, { suffix = '', invert = false } = {}) {
  if (!isFinite(firstVal) || !isFinite(secondVal)) return { dir: 'flat', text: '—' };
  const diff = secondVal - firstVal;
  if (Math.abs(diff) < 0.001) return { dir: 'flat', text: '±0' + suffix };
  let dir = diff > 0 ? 'up' : 'down';
  if (invert) dir = dir === 'up' ? 'down' : 'up';
  const arrow = diff > 0 ? '▲' : '▼';
  return { dir, text: `${arrow} ${Math.abs(diff).toFixed(1)}${suffix}` };
}

function _accKpiCardHtml(id, label, tooltip, valStr, valClass, spark, sparkColor, trend) {
  return `
    <div class="acc-kpi-card">
      <div class="acc-kpi-card-top">
        <span class="acc-kpi-card-label" title="${tooltip}">${label}</span>
        <span class="acc-kpi-card-trend ${trend.dir}">${trend.text}</span>
      </div>
      <div class="acc-kpi-card-val ${valClass}">${valStr}</div>
      <canvas class="acc-kpi-card-spark" id="${id}"></canvas>
    </div>`;
}

function setAccEqMode(mode, btn) {
  _accEqMode = mode;
  document.querySelectorAll('.acc-eq-toggle-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (_accActiveName) _accDrawEquityCurve(_accActiveName);
}

function _accDrawEquityCurve(name) {
  const canvas  = document.getElementById('acc-eq-canvas');
  const emptyEl = document.getElementById('acc-eq-empty');
  if (!canvas) return;
  const m = _accComputeAnalytics(name);
  const mode = _accEqMode;

  let series;
  if      (mode === 'daily')     series = m.dailySeries.map(p => ({ x: p.i, y: p.val,  date: p.date }));
  else if (mode === 'drawdown')  series = m.ddSeries.map(p    => ({ x: p.i, y: p.dd,   date: p.date }));
  else                            series = m.curve.map(p       => ({ x: p.i, y: p.cum,  date: p.date, outcome: p.outcome }));

  if (series.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 4 || 600;
  const H = 200;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const pad = { top: 16, right: 14, bottom: 26, left: 58 };
  const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
  const ys = series.map(p => p.y);
  const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
  const rangeY = (maxY - minY) || 1;
  const px = i => pad.left + (i / (series.length - 1)) * cW;
  const py = v => pad.top + cH - ((v - minY) / rangeY) * cH;

  const zeroY = py(0);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + cW, zeroY);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'right';
  const fmtAxis = v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0);
  [minY, (minY + maxY) / 2, maxY].forEach(v => ctx.fillText(fmtAxis(v), pad.left - 6, py(v) + 4));

  ctx.textAlign = 'center';
  [[0, series[0].date], [Math.floor(series.length / 2), series[Math.floor(series.length / 2)]?.date], [series.length - 1, series[series.length - 1].date]]
    .forEach(([i, d]) => { if (d) ctx.fillText(String(d).slice(5), px(i), H - 6); });

  if (mode === 'daily') {
    const barW = Math.max(3, (cW / series.length) * 0.6);
    series.forEach((p, i) => {
      ctx.fillStyle = p.y >= 0 ? '#22c55e' : '#ef4444';
      const y0 = py(0), y1 = py(p.y);
      ctx.fillRect(px(i) - barW / 2, Math.min(y0, y1), barW, Math.max(1, Math.abs(y1 - y0)));
    });
  } else {
    const isPos = series[series.length - 1].y >= 0;
    const fillTop = mode === 'drawdown' ? 'rgba(239,68,68,0.30)' : (isPos ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)');
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, fillTop); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.moveTo(px(0), py(series[0].y));
    series.forEach((p, i) => { if (i > 0) ctx.lineTo(px(i), py(p.y)); });
    ctx.lineTo(px(series.length - 1), py(0)); ctx.lineTo(px(0), py(0)); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    const colPos = '#22c55e', colNeg = '#ef4444', colFlat = '#60a5fa';
    for (let i = 1; i < series.length; i++) {
      ctx.beginPath(); ctx.moveTo(px(i - 1), py(series[i - 1].y)); ctx.lineTo(px(i), py(series[i].y));
      ctx.strokeStyle = mode === 'drawdown' ? '#ef4444' : (series[i].outcome === 'Win' ? colPos : series[i].outcome === 'Loss' ? colNeg : colFlat);
      ctx.lineWidth = 2; ctx.stroke();
    }
  }

  const last = series[series.length - 1];
  ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = last.y >= 0 ? '#22c55e' : '#ef4444';
  ctx.fillText((last.y >= 0 ? '+$' : '-$') + Math.abs(last.y).toFixed(2), Math.max(pad.left, px(series.length - 1) - 46), py(last.y) - 8);
}

// ── Challenge Progress Tracker (Prop Firm Challenge accounts only) ──────
// Persisted on the account object as `challengeTarget` (a percent number)
// and `challengePhase` ('Phase 1' | 'Phase 2'), saved through the same
// _saveCustomAccounts() pipeline as everything else in Manage Accounts.
// Purely derived — no separate storage for the maths.
// Shared helpers so "Challenge complete" logic (used by the progress card,
// the account grid status pill, and the detail-drawer hero badge) never drifts.
function _accChallengeTargetPct(acc) {
  const phase         = acc.challengePhase === 'Phase 2' ? 'Phase 2' : 'Phase 1';
  const presetTargets = phase === 'Phase 2' ? [4, 5, 6] : [8, 10];
  const rawTarget     = acc.challengeTarget;
  return (rawTarget !== undefined && rawTarget !== null && rawTarget !== '')
    ? parseFloat(rawTarget) : presetTargets[0];
}
function _accChallengeIsComplete(acc, netDollars, accSize) {
  if (!acc || acc.type !== 'Challenge') return false;
  const targetPct    = _accChallengeTargetPct(acc);
  const targetProfit = accSize > 0 ? (accSize * targetPct / 100) : 0;
  return targetProfit > 0 && netDollars >= targetProfit;
}
function _accChallengeSectionHtml(acc, m, accSize, name) {
  const phase          = acc.challengePhase === 'Phase 2' ? 'Phase 2' : 'Phase 1';
  const presetTargets  = phase === 'Phase 2' ? [4, 5, 6] : [8, 10];
  const targetPct      = _accChallengeTargetPct(acc);
  const isCustom       = !presetTargets.includes(targetPct);

  const targetProfit  = accSize > 0 ? (accSize * targetPct / 100) : 0;
  const currentProfit = m.netDollars;
  const remaining     = Math.max(targetProfit - currentProfit, 0);
  const rawPct        = targetProfit > 0 ? (currentProfit / targetProfit) * 100 : 0;
  const completion    = Math.max(0, Math.min(100, rawPct));
  const isComplete    = _accChallengeIsComplete(acc, currentProfit, accSize);
  const badgeText     = phase === 'Phase 1' ? 'ADVANCE TO NEXT PHASE' : 'READY FOR VERIFICATION';
  const completeMsg   = phase === 'Phase 1' ? 'Advance to the Next Phase' : 'Ready for Verification';

  const fmt$    = v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2);
  const escName = name.replace(/'/g, "\\'");

  const tBtns = presetTargets.map(t => `
      <button class="acc-chal-tbtn${!isCustom && targetPct === t ? ' active' : ''}" onclick="_accSetChallengeTarget('${escName}',${t})">${t}%</button>`
    ).join('') + `
      <button class="acc-chal-tbtn${isCustom ? ' active' : ''}" onclick="_accToggleCustomTarget(event)">Custom</button>
      <input type="number" min="1" max="100" step="0.5" id="acc-chal-custom-input" class="acc-chal-custom-input"
        value="${isCustom ? targetPct : ''}" placeholder="%"
        style="display:${isCustom ? 'inline-flex' : 'none'}"
        onclick="event.stopPropagation()"
        onkeydown="if(event.key==='Enter'){_accSetChallengeTarget('${escName}',parseFloat(this.value)||${presetTargets[0]})}"
        onblur="if(this.value)_accSetChallengeTarget('${escName}',parseFloat(this.value)||${presetTargets[0]})">`;

  const milestoneHtml = [25, 50, 75, 100].map(ms => `
      <div class="acc-chal-ms${completion >= ms ? ' reached' : ''}" style="left:${ms}%">
        <div class="acc-chal-ms-dot"></div><div class="acc-chal-ms-lbl">${ms}%</div>
      </div>`).join('');

  const confetti = isComplete ? Array.from({ length: 10 }).map((_, i) => `
      <span class="acc-chal-confetti" style="left:${5 + i * 9.5}%;animation-delay:${(i * 0.09).toFixed(2)}s;background:${['#fbbf24', '#34d399', '#60a5fa', '#f87171'][i % 4]}"></span>`
    ).join('') : '';

  return `
    <div class="acc-chal-card${isComplete ? ' complete' : ''}${phase === 'Phase 1' ? ' phase1' : ''}">
      ${confetti}
      <div class="acc-chal-head">
        <div>
          <div class="acc-chal-title">🏁 Challenge Progress</div>
          <div class="acc-chal-sub">${phase} · Track your progress toward completing this Prop Firm Challenge. <a href="#" onclick="event.preventDefault();_openManageAccounts()" style="color:var(--text2);text-decoration:underline">Change phase in Manage Accounts</a></div>
        </div>
        ${isComplete ? `<div class="acc-chal-badge">${badgeText}</div>` : ''}
      </div>

      <div class="acc-chal-target-row">
        <span class="acc-chal-target-lbl">Profit Target</span>
        <div class="acc-chal-tbtns">${tBtns}</div>
      </div>

      ${isComplete ? `
        <div class="acc-chal-complete-banner">
          <svg class="acc-chal-check" viewBox="0 0 52 52" aria-hidden="true">
            <circle class="acc-chal-check-circle" cx="26" cy="26" r="23" fill="none"/>
            <path class="acc-chal-check-mark" fill="none" d="M14 27l7 7 16-16"/>
          </svg>
          <span>${completeMsg}</span>
        </div>` : ''}

      <div class="acc-chal-progress-wrap">
        <div class="acc-chal-progress-outer">
          <div class="acc-chal-progress-fill${isComplete ? ' gold' : ''}" style="width:${completion}%">
            <span class="acc-chal-progress-glow"></span>
          </div>
          <div class="acc-chal-progress-pct">${completion.toFixed(2)}%</div>
        </div>
        <div class="acc-chal-milestones">${milestoneHtml}</div>
      </div>

      <div class="acc-chal-stats">
        <div class="acc-chal-stat">
          <div class="acc-chal-stat-lbl">Target Profit</div>
          <div class="acc-chal-stat-val gold">${targetProfit > 0 ? '$' + targetProfit.toFixed(2) : '—'}</div>
        </div>
        <div class="acc-chal-stat">
          <div class="acc-chal-stat-lbl">Current Profit</div>
          <div class="acc-chal-stat-val ${currentProfit >= 0 ? 'green' : 'red'}">${fmt$(currentProfit)}</div>
        </div>
        <div class="acc-chal-stat">
          <div class="acc-chal-stat-lbl">Remaining</div>
          <div class="acc-chal-stat-val">${targetProfit > 0 ? '$' + (isComplete ? '0.00' : remaining.toFixed(2)) : '—'}</div>
        </div>
        <div class="acc-chal-stat">
          <div class="acc-chal-stat-lbl">Completion</div>
          <div class="acc-chal-stat-val ${isComplete ? 'gold' : 'blue'}">${completion.toFixed(2)}%</div>
        </div>
      </div>
    </div>`;
}
function _accToggleCustomTarget(e) {
  if (e) e.stopPropagation();
  const input = document.getElementById('acc-chal-custom-input');
  if (!input) return;
  input.style.display = 'inline-flex';
  input.focus(); input.select();
}
async function _accSetChallengeTarget(name, pct) {
  pct = parseFloat(pct);
  if (!pct || isNaN(pct) || pct <= 0) return;
  const list = _getCustomAccounts();
  const idx  = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  list[idx].challengeTarget = pct;
  await _saveCustomAccounts(list);
  if (_accActiveName === name) accShowDetail(name);
}

// Tapping the Net PnL row on an account card flips that account's display
// between $ and % — persisted per-account (same field Manage Accounts sets).
async function _toggleAccCardPnlMode(name) {
  const list = _getCustomAccounts();
  const idx  = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  list[idx].pnlMode = (list[idx].pnlMode === '$') ? '%' : '$';
  await _saveCustomAccounts(list);
  _renderAccGrid();
}

function accShowDetail(name) {
  const drawer = document.getElementById('acc-detail-drawer');
  const body   = document.getElementById('acc-detail-body');
  if (!drawer || !body) return;

  _accActiveName = name;
  const m = _accComputeAnalytics(name);
  const { acc, accSize, pnlMode, at } = m;
  const health = _accHealthScore(m);

  const fmtVal = (dollars) => {
    if (dollars === null || dollars === undefined) return '—';
    const d = parseFloat(dollars) || 0;
    if (pnlMode === '$' || accSize === 0) return (d >= 0 ? '+$' : '-$') + Math.abs(d).toFixed(2);
    const pct = (d / accSize) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(3) + '%';
  };
  const fmtPlain = (dollars) => (dollars === null || dollars === undefined) ? '—' : (dollars >= 0 ? '+$' : '-$') + Math.abs(dollars).toFixed(2);

  const isArchived = acc.status === 'archived';
  const netProfitPct = accSize > 0 ? (m.netDollars / accSize) * 100 : null;
  const isChalDone  = !isArchived && _accChallengeIsComplete(acc, m.netDollars, accSize);
  const heroStatusClass = isArchived ? 'archived' : (isChalDone ? 'completed' : 'active');
  const heroStatusLabel = isArchived
    ? 'Archived'
    : (isChalDone
        ? `<svg class="icn" aria-hidden="true" style="width:11px;height:11px;margin-right:3px;vertical-align:-1.5px"><use href="#ic-check-c"></use></svg>Completed`
        : 'Active');

  // ── Hero ──
  const heroBadges = `
    <span class="acc-hero-badge status-${heroStatusClass}">${heroStatusLabel}</span>
    ${acc.type ? `<span class="acc-hero-badge">${acc.type}</span>` : ''}
    ${acc.type === 'Challenge' && acc.challengePhase ? `<span class="acc-hero-badge">${acc.challengePhase}</span>` : ''}
  `;
  const sizeNote = accSize > 0
    ? `$${accSize.toLocaleString()}`
    : `<span style="color:var(--gold)" title="Set size in Manage Accounts"><svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg> Not set</span>`;

  const healthColor = _accGradeColor(health.grade);
  const healthRingSvg = health.score !== null
    ? _calRingGauge(health.score / 100, healthColor, _calCssVar('--glass-3', 'rgba(255,255,255,0.12)'), 104)
    : _calRingGauge(0, healthColor, _calCssVar('--glass-3', 'rgba(255,255,255,0.12)'), 104);

  const heroHtml = `
    <div class="acc-hero">
      <button class="acc-hero-close" onclick="accCloseDetail()" title="Close" aria-label="Close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      <div>
        <div class="acc-hero-top">
          <span class="acc-hero-name">${name}</span>
          ${heroBadges}
        </div>
        <div class="acc-hero-grid">
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Account Size</div><div class="acc-hero-stat-val">${sizeNote}</div></div>
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Net Profit</div><div class="acc-hero-stat-val ${m.netDollars>=0?'green':'red'}">${fmtPlain(m.netDollars)}</div></div>
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Profit %</div><div class="acc-hero-stat-val ${m.netDollars>=0?'green':'red'}">${netProfitPct!==null ? (netProfitPct>=0?'+':'')+netProfitPct.toFixed(2)+'%' : '—'}</div></div>
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Win Rate</div><div class="acc-hero-stat-val ${m.wr>=55?'green':'red'}">${at.length?m.wr.toFixed(1)+'%':'—'}</div></div>
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Profit Factor</div><div class="acc-hero-stat-val gold">${at.length?(isFinite(m.pf)?m.pf.toFixed(2)+'x':'∞'):'—'}</div></div>
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Trades</div><div class="acc-hero-stat-val blue">${at.length || '—'}</div></div>
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Trading Days</div><div class="acc-hero-stat-val">${m.tradingDays || '—'}</div></div>
          <div class="acc-hero-stat"><div class="acc-hero-stat-label">Max Drawdown</div><div class="acc-hero-stat-val ${m.maxDDPct<=10?'green':'red'}">${at.length?m.maxDDPct.toFixed(1)+'%':'—'}</div></div>
        </div>
      </div>
      <div class="acc-health">
        <div class="acc-health-ring-wrap">
          ${healthRingSvg}
          <div class="acc-health-center">
            <div class="acc-health-grade" style="color:${healthColor}">${health.grade}</div>
            <div class="acc-health-score">${health.score!==null?health.score+'/100':''}</div>
          </div>
        </div>
        <div class="acc-health-label">Account Health</div>
        <div class="acc-health-why" style="position:relative">
          <button class="acc-health-why-btn" onclick="_accToggleWhy(event)">Why this score?</button>
          <div class="acc-health-why-panel" id="acc-health-why-panel">
            <ul>${health.reasons.map(r => `<li>${r}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
    </div>`;

  // ── KPI Scorecard ──
  const trendWR  = _accTrendBadge(m.halfWR(m.firstHalf), m.halfWR(m.secondHalf), { suffix: '%' });
  const trendNet = _accTrendBadge(m.halfNet(m.firstHalf), m.halfNet(m.secondHalf), { suffix: '' });
  const trendPF  = _accTrendBadge(m.halfPF(m.firstHalf), m.halfPF(m.secondHalf), { suffix: 'x' });

  const kpiCards = [
    _accKpiCardHtml('acc-spark-net',  'Net Profit',     'Total profit across all logged trades.',            fmtPlain(m.netDollars), m.netDollars>=0?'green':'red', m.rollNet, m.netDollars>=0?'#34d399':'#f87171', trendNet),
    _accKpiCardHtml('acc-spark-pf',   'Profit Factor',  'Gross profit ÷ gross loss. Above 1.5x is strong.',   at.length?(isFinite(m.pf)?m.pf.toFixed(2)+'x':'∞'):'—', 'gold', m.rollPF, '#fbbf24', trendPF),
    _accKpiCardHtml('acc-spark-wr',   'Win Rate',       'Percentage of trades closed as a win.',              at.length?m.wr.toFixed(1)+'%':'—', m.wr>=55?'green':'red', m.rollWR, '#60a5fa', trendWR),
    _accKpiCardHtml('acc-spark-exp',  'Expectancy',     'Average $ result per trade taken.',                  at.length?fmtPlain(m.expectancy):'—', m.expectancy>=0?'green':'red', m.rollExp, m.expectancy>=0?'#34d399':'#f87171', {dir:'flat',text:'per trade'}),
    _accKpiCardHtml('acc-spark-rr',   'Avg R:R',        'Average reward-to-risk ratio across trades with R:R logged.', m.avgRR!==null?m.avgRR.toFixed(2)+'R':'—', '', m.rollRR, '#a78bfa', {dir:'flat',text:''}),
    _accKpiCardHtml('acc-spark-dd',   'Max Drawdown',   'Largest peak-to-trough decline in account balance.', at.length?fmtPlain(-m.maxDD):'—', m.maxDDPct<=10?'green':'red', m.rollDD, '#f87171', {dir:'flat',text:m.maxDDPct.toFixed(1)+'%'}),
    _accKpiCardHtml('acc-spark-rec',  'Recovery Factor','Net profit ÷ max drawdown — higher recovers faster.', at.length?(isFinite(m.recoveryFactor)?m.recoveryFactor.toFixed(2)+'x':'∞'):'—', 'blue', m.rollNet, '#60a5fa', {dir:'flat',text:''}),
    _accKpiCardHtml('acc-spark-aw',   'Avg Win',        'Average profit on winning trades.',                  fmtPlain(m.avgWDollars), 'green', m.rollNet, '#34d399', {dir:'flat',text:''}),
    _accKpiCardHtml('acc-spark-al',   'Avg Loss',       'Average loss on losing trades.',                     fmtPlain(m.avgLDollars), 'red', m.rollNet, '#f87171', {dir:'flat',text:''}),
    _accKpiCardHtml('acc-spark-cnt',  'Trades Taken',   `${m.wins.length} wins · ${m.losses.length} losses · ${m.bes.length} B/E`, at.length, '', m.rollCount, '#60a5fa', {dir:'flat',text:''}),
  ].join('');

  // ── Equity curve section ──
  const eqSection = `
    <div class="acc-eq-section">
      <div class="acc-eq-head">
        <span class="acc-eq-title">Equity Curve</span>
        <div class="acc-eq-toggles">
          <button class="dash-filter-btn acc-eq-toggle-btn ${_accEqMode==='balance'?'active':''}" onclick="setAccEqMode('balance',this)">Balance</button>
          <button class="dash-filter-btn acc-eq-toggle-btn ${_accEqMode==='daily'?'active':''}" onclick="setAccEqMode('daily',this)">Daily P/L</button>
          <button class="dash-filter-btn acc-eq-toggle-btn ${_accEqMode==='drawdown'?'active':''}" onclick="setAccEqMode('drawdown',this)">Drawdown</button>
        </div>
      </div>
      <div class="acc-eq-canvas-wrap">
        <canvas id="acc-eq-canvas"></canvas>
        <div class="acc-eq-empty" id="acc-eq-empty" style="display:none">Log at least 2 trades on this account to see the equity curve.</div>
      </div>
    </div>`;

  body.innerHTML = `
    <div class="acc-an">
      ${heroHtml}
      ${acc.type === 'Challenge' ? _accChallengeSectionHtml(acc, m, accSize, name) : ''}
      <div class="acc-an-sec-head">Performance Scorecard</div>
      <div class="acc-kpi-scorecard">${kpiCards}</div>
      ${eqSection}
      ${at.length === 0
        ? '<div style="color:var(--text3);text-align:center;padding:30px;font-style:italic">No trades logged under this account yet.</div>'
        : `<div class="acc-an-sec-head">Trade Log</div>
           <div class="data-table-wrap" style="overflow-x:auto">
            <table class="data-table" style="width:100%">
              <thead>
                <tr>
                  <th>Date</th><th>Pair</th><th>Pos</th><th>Outcome</th>
                  <th>P/L</th><th>R:R</th><th>Model</th><th style="width:72px"></th>
                </tr>
              </thead>
              <tbody>
                ${m.atDesc.map(t => {
                  const _td     = toPnlDollars(t, accSize);
                  const pnlColor = _td >= 0 ? 'outcome-win' : 'outcome-loss';
                  const pnlDisp  = fmtVal(_td);
                  const outClass = t.outcome==='Win'?'outcome-win':t.outcome==='Loss'?'outcome-loss':'outcome-be';
                  const posClass = t.pos==='Buy'?'pos-buy':'pos-sell';
                  return `
                  <tr class="acc-trade-row" onclick="openDetail(${t.id})" title="Click to view / edit trade"
                      onmouseenter="this.querySelector('.acc-tr-actions').style.opacity='1'"
                      onmouseleave="this.querySelector('.acc-tr-actions').style.opacity='0'">
                    <td class="mono" style="color:var(--text2)">${t.date}</td>
                    <td class="bold">${t.pair}</td>
                    <td><span class="${posClass}">${t.pos}</span></td>
                    <td class="${outClass}">${t.outcome}</td>
                    <td class="${pnlColor} mono">${pnlDisp}</td>
                    <td class="mono">${t.rr||'—'}</td>
                    <td style="color:var(--text2);font-size:11px">${t.strategy||'—'}</td>
                    <td class="acc-tr-actions" style="opacity:0;transition:opacity .15s;white-space:nowrap;text-align:right">
                      <button onclick="event.stopPropagation();openDetail(${t.id},true)"
                        style="background:rgba(58,134,255,.15);border:1px solid rgba(58,134,255,.3);color:var(--blue);border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;margin-right:3px"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
                      <button onclick="event.stopPropagation();quickDelete(${t.id});accShowDetail('${name.replace(/'/g, "\\'")}')"
                        style="background:rgba(230,57,70,.12);border:1px solid rgba(230,57,70,.25);color:var(--red);border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg></button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
    </div>
  `;

  // Draw sparklines + equity curve after the new DOM has been laid out
  requestAnimationFrame(() => {
    const sparkSpecs = [
      ['acc-spark-net', m.rollNet, m.netDollars>=0?'#34d399':'#f87171'],
      ['acc-spark-pf',  m.rollPF,  '#fbbf24'],
      ['acc-spark-wr',  m.rollWR,  '#60a5fa'],
      ['acc-spark-exp', m.rollExp, m.expectancy>=0?'#34d399':'#f87171'],
      ['acc-spark-rr',  m.rollRR,  '#a78bfa'],
      ['acc-spark-dd',  m.rollDD,  '#f87171'],
      ['acc-spark-rec', m.rollNet, '#60a5fa'],
      ['acc-spark-aw',  m.rollNet, '#34d399'],
      ['acc-spark-al',  m.rollNet, '#f87171'],
      ['acc-spark-cnt', m.rollCount, '#60a5fa'],
    ];
    sparkSpecs.forEach(([id, data, color]) => _accDrawSparkline(document.getElementById(id), data, color));
    _accDrawEquityCurve(name);
  });

  drawer.style.display = '';
  requestAnimationFrame(() => drawer.classList.add('open'));
  drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _accToggleWhy(ev) {
  ev.stopPropagation();
  const panel = document.getElementById('acc-health-why-panel');
  if (!panel) return;
  const willShow = !panel.classList.contains('show');
  panel.classList.toggle('show', willShow);
  if (willShow) {
    const closeOnOutside = (e) => {
      if (!panel.contains(e.target)) { panel.classList.remove('show'); document.removeEventListener('click', closeOnOutside); }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
  }
}

window.addEventListener('resize', () => {
  const drawer = document.getElementById('acc-detail-drawer');
  if (_accActiveName && drawer && drawer.classList.contains('open')) _accDrawEquityCurve(_accActiveName);
});

function accCloseDetail() {
  const drawer = document.getElementById('acc-detail-drawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  setTimeout(() => { drawer.style.display = 'none'; }, 260);
}

/* ── Payout Log ── */
function _renderPayoutLog() {
  const tbody = document.getElementById('payout-tbody');
  if (!tbody) return;
  const rows = _accData.payouts;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text3);text-align:center;font-style:italic">No payouts yet</td></tr>';
    return;
  }
  tbody.innerHTML = [...rows].sort((a,b) => b.date.localeCompare(a.date)).map((p, i) => `
    <tr>
      <td class="mono">${p.date}</td>
      <td class="bold">${p.account}</td>
      <td class="outcome-win mono">$${parseFloat(p.amount).toLocaleString()}</td>
      <td><span class="pill ${p.status==='Received'?'pill-green':'pill-gold'}">${p.status}</span></td>
      <td style="text-align:right">
        <button class="wl-week-btn" style="font-size:10px;padding:2px 8px" onclick="accEditPayout(${i})"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
        <button class="wl-week-btn danger" style="font-size:10px;padding:2px 8px" onclick="accDeletePayout(${i})"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </td>
    </tr>`).join('');
}

function accAddPayout() { _showPayoutModal(null); }
function accEditPayout(i) { _showPayoutModal(i); }

function _showPayoutModal(editIdx) {
  const isEdit = editIdx !== null;
  const p = isEdit ? _accData.payouts[editIdx] : null;
  document.getElementById('acc-payout-modal-title').textContent = isEdit ? 'Edit Payout' : 'Add Payout';
  document.getElementById('acc-payout-modal-body').innerHTML = `
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">Date</label>
        <input type="date" class="wl-form-input" id="acc-p-date" value="${p ? p.date : localToday()}">
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Amount (USD)</label>
        <input type="number" class="wl-form-input" id="acc-p-amount" value="${p ? p.amount : ''}" placeholder="500">
      </div>
    </div>
    <div class="wl-form-2col">
      <div class="wl-form-row">
        <label class="wl-form-label">Account</label>
        <select class="wl-form-select" id="acc-p-account">
          ${_getCustomAccounts().map(a => `<option${p&&p.account===a?' selected':''}>${a}</option>`).join('')}
        </select>
      </div>
      <div class="wl-form-row">
        <label class="wl-form-label">Status</label>
        <select class="wl-form-select" id="acc-p-status">
          ${['Received','Pending','Processing'].map(s => `<option${p&&p.status===s?' selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="wl-form-row">
      <label class="wl-form-label">Notes (optional)</label>
      <input type="text" class="wl-form-input" id="acc-p-notes" value="${p ? p.notes||'' : ''}" placeholder="e.g. Phase 1 completion payout">
    </div>
    <div class="wl-form-actions">
      ${isEdit ? `<button class="wl-btn-danger" onclick="accDeletePayout(${editIdx});accClosePayoutModal()">Delete</button>` : ''}
      <button class="wl-btn-secondary" onclick="accClosePayoutModal()">Cancel</button>
      <button class="wl-btn-primary" onclick="_savePayoutForm(${isEdit ? editIdx : 'null'})">${isEdit ? 'Save Changes' : 'Add Payout'}</button>
    </div>`;
  document.getElementById('acc-payout-overlay').classList.add('open');
  document.getElementById('acc-payout-modal').classList.add('open');
}

async function _savePayoutForm(editIdx) {
  const date    = document.getElementById('acc-p-date').value;
  const amount  = document.getElementById('acc-p-amount').value;
  const account = document.getElementById('acc-p-account').value;
  const status  = document.getElementById('acc-p-status').value;
  const notes   = document.getElementById('acc-p-notes').value;
  if (!date || !amount) return;
  const entry = { date, amount: parseFloat(amount), account, status, notes };
  if (editIdx !== null && editIdx !== undefined && editIdx !== 'null') {
    _accData.payouts[editIdx] = entry;
  } else {
    _accData.payouts.push(entry);
  }
  accClosePayoutModal();
  _renderPayoutLog();
  await _accSave();
}

async function accDeletePayout(i) {
  if (!confirm('Delete this payout entry?')) return;
  _accData.payouts.splice(i, 1);
  _renderPayoutLog();
  await _accSave();
}

function accClosePayoutModal() {
  document.getElementById('acc-payout-overlay').classList.remove('open');
  document.getElementById('acc-payout-modal').classList.remove('open');
}

/* ── Milestones ── */
let _msDragSrc   = null;   // index currently being dragged
let _msClickSrc  = null;   // index selected via click-to-reorder
let _msEditIdx   = null;   // index currently being inline-edited

function _renderMilestones() {
  const ml = document.getElementById('milestones-list');
  if (!ml) return;
  ml.innerHTML = _accData.milestones.map((m, i) => {
    if (_msEditIdx === i) {
      return `
    <div class="cl-item editing" style="position:relative" draggable="false">
      <span class="cl-drag-handle" style="opacity:.25;cursor:default">⠿</span>
      <div class="cl-box">${m.done ? '✓' : ''}</div>
      <input type="text" class="cl-edit-input" id="ms-edit-input-${i}" value="${m.t.replace(/"/g,'&quot;')}"
             onkeydown="if(event.key==='Enter'){msSaveEdit(${i})} else if(event.key==='Escape'){msCancelEdit()}">
      <div class="acc-ms-actions" style="opacity:1">
        <button class="wl-week-btn primary" style="font-size:10px;padding:2px 7px" onclick="msSaveEdit(${i})">✓ Done</button>
        <button class="wl-week-btn" style="font-size:10px;padding:2px 7px" onclick="msCancelEdit()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
    </div>`;
    }
    return `
    <div class="cl-item${m.done ? ' checked' : ''}" style="position:relative"
         draggable="true"
         ondragstart="msDragStart(event,${i})"
         ondragover="msDragOver(event)"
         ondragenter="msDragEnter(event,${i})"
         ondragleave="msDragLeave(event)"
         ondrop="msDrop(event,${i})"
         ondragend="msDragEnd(event)">
      <span class="cl-drag-handle${_msClickSrc===i ? ' selected' : ''}" onclick="msHandleClick(event,${i})" title="Drag, or click and click another to swap">⠿</span>
      <div class="cl-box" onclick="accToggleMilestone(${i})">${m.done ? '✓' : ''}</div>
      <span class="cl-text" onclick="accToggleMilestone(${i})">${m.t}</span>
      <div class="acc-ms-actions">
        <button class="wl-week-btn" style="font-size:10px;padding:2px 7px" onclick="msStartEdit(${i});event.stopPropagation()"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
        <button class="wl-week-btn danger" style="font-size:10px;padding:2px 7px" onclick="accDeleteMilestone(${i});event.stopPropagation()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
    </div>`;
  }).join('');
  _renderMilestoneProgress();
  if (_msEditIdx !== null) {
    const input = document.getElementById(`ms-edit-input-${_msEditIdx}`);
    if (input) { input.focus(); input.select(); }
  }
}

function msDragStart(e, i) {
  _msDragSrc = i;
  _msClickSrc = null;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(i));
}

function msDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function msDragEnter(e, i) {
  if (_msDragSrc !== null && i !== _msDragSrc) e.currentTarget.classList.add('drag-over');
}

function msDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function msDrop(e, i) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (_msDragSrc === null || _msDragSrc === i) { _msDragSrc = null; return; }
  const arr = _accData.milestones;
  const [moved] = arr.splice(_msDragSrc, 1);
  arr.splice(i, 0, moved);
  _msDragSrc = null;
  _renderMilestones();
  await _accSave();
}

function msDragEnd() {
  document.querySelectorAll('#milestones-list .cl-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
  _msDragSrc = null;
}

async function msHandleClick(e, i) {
  e.stopPropagation();
  if (_msClickSrc === null) {
    _msClickSrc = i;
    _renderMilestones();
  } else if (_msClickSrc === i) {
    _msClickSrc = null;
    _renderMilestones();
  } else {
    const arr = _accData.milestones;
    const [moved] = arr.splice(_msClickSrc, 1);
    arr.splice(i, 0, moved);
    _msClickSrc = null;
    _renderMilestones();
    await _accSave();
  }
}

function msStartEdit(i) {
  _msClickSrc = null;
  _msEditIdx = i;
  _renderMilestones();
}

async function msSaveEdit(i) {
  const input = document.getElementById(`ms-edit-input-${i}`);
  const text = input ? input.value.trim() : '';
  if (text) _accData.milestones[i].t = text;
  _msEditIdx = null;
  _renderMilestones();
  await _accSave();
}

function msCancelEdit() {
  _msEditIdx = null;
  _renderMilestones();
}

function _renderMilestoneProgress() {
  const fill = document.getElementById('acc-progress-fill');
  const text = document.getElementById('acc-progress-text');
  const pct  = document.getElementById('acc-progress-pct');
  if (!fill || !text || !pct) return;
  const total = _accData.milestones.length;
  const done  = _accData.milestones.filter(m => m.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  text.textContent = `${done} of ${total} complete`;
  pct.textContent  = `${percent}%`;
  fill.style.setProperty('--target-width', percent + '%');
  fill.style.width = percent + '%';
}

async function accToggleMilestone(i) {
  _accData.milestones[i].done = !_accData.milestones[i].done;
  _renderMilestones();
  await _accSave();
}

function accAddMilestone() {
  const text = prompt('Milestone goal:');
  if (!text) return;
  _accData.milestones.push({ t: text.trim(), done: false });
  _renderMilestones();
  _accSave();
}

async function accDeleteMilestone(i) {
  if (!confirm(`Delete milestone: "${_accData.milestones[i].t}"?`)) return;
  _accData.milestones.splice(i, 1);
  _renderMilestones();
  await _accSave();
}

// ═══════════════════════════════════════════════════
// PLAYBOOK — Supabase-backed, per user
// Table: journal_playbook { id, user_id, data jsonb }
// data = { models:[{title,strategyName,sub,steps,status}], rules:[str] }
// ═══════════════════════════════════════════════════
let _pbData  = { models: MODELS.map(m=>({...m,steps:(m.steps||[]).slice()})), rules: [...RULES] };
let _pbRowId = null;

// Known legacy title → correct strategyName mapping for backward compat
const _LEGACY_TITLE_MAP = {
  'Model 1 — IRL > ERL':    'IRL > ERL',
  'Model 2 — ERL > IRL':    'ERL > IRL',
  'Model 3 — NxtGen Modified': 'NxtGen - Mod',
  'NxtGen Modified':         'NxtGen - Mod',
  'NxtGen – Mod':            'NxtGen - Mod',
};

async function _pbLoad() {
  if (!_currentUser) return;
  const { data, error } = await sb
    .from('journal_playbook')
    .select('id, data')
    .eq('user_id', _currentUser.id)
    .maybeSingle();
  if (error) { console.error('pbLoad:', error.message); return; }
  if (data) {
    _pbRowId = data.id;
    _pbData  = data.data || { models: [...MODELS], rules: [...RULES] };
    if (!_pbData.models) _pbData.models = [...MODELS];
    if (!_pbData.rules)  _pbData.rules  = [...RULES];
  }
  // Migrate: ensure every model has strategyName + status
  // Priority: (1) existing strategyName already on model, (2) legacy title map, (3) infer from title
  _pbData.models = _pbData.models.map(m => {
    const resolvedName = m.strategyName
      || _LEGACY_TITLE_MAP[m.title]
      || _inferStrategyName(m.title);
    return {
      status: 'active',
      ...m,
      strategyName: resolvedName,
      // Also update the title to be clean (strip legacy "Model N — " prefix)
      title: _LEGACY_TITLE_MAP[m.title] ? resolvedName : m.title,
    };
  });
  // De-duplicate: if migration produced duplicate strategyNames, keep the first
  const seen = new Set();
  _pbData.models = _pbData.models.filter(m => {
    const key = m.strategyName || m.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Save the migrated data back so we don't re-migrate every load
  await _pbSave();
}

// Extract short strategy name from legacy title (fallback only)
function _inferStrategyName(title) {
  if (!title) return title;
  if (!title.includes('—') && !title.includes('–')) return title;
  const after = title.split(/[—–]/).slice(1).join('—').trim();
  return after || title;
}

function _getActiveStrategies() {
  return (_pbData.models || []).filter(m => m.status !== 'archived' && m.status !== 'deleted');
}

function _getArchivedStrategies() {
  return (_pbData.models || []).filter(m => m.status === 'archived');
}

function _buildStrategyOptions(current) {
  const allModels  = _pbData.models || [];
  const active     = allModels.filter(m => m.status !== 'archived' && m.status !== 'deleted');
  const activeNames = new Set(active.map(m => m.strategyName || m.title));

  // Build active options
  const opts = active.map(m => {
    const name = m.strategyName || m.title;
    return `<option value="${name}"${name === current ? ' selected' : ''}>${name}</option>`;
  }).join('');

  // If current value isn't in active list (old/custom trade), prepend it so it stays selected
  // but DON'T label it "(archived)" — just show the raw name
  const extra = (current && !activeNames.has(current))
    ? `<option value="${current}" selected>${current}</option>` : '';

  return extra + opts + `<option value="__custom__">＋ Custom…</option>`;
}

function _refreshStrategyDropdowns() {
  ['m-strat', 'e-strat'].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = _buildStrategyOptions(cur);
  });
}

async function _pbSave() {
  if (!_currentUser) return;
  const row = { user_id: _currentUser.id, data: _pbData };
  if (_pbRowId) {
    await sb.from('journal_playbook').update(row).eq('id', _pbRowId);
  } else {
    const { data } = await sb.from('journal_playbook').insert(row).select('id').single();
    if (data) _pbRowId = data.id;
  }
}

// ═══════════════════════════════════════════════════
// MANAGE STRATEGIES MODAL
// Mirrors _openManageAccounts — active / archived tabs
// ═══════════════════════════════════════════════════
function _openManageStrategies() {
  const existing = document.getElementById('strat-manager-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'strat-manager-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Manage Models</span>
      <button onclick="document.getElementById('strat-manager-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body">
      <div class="acc-mgr-tabs">
        <button class="acc-mgr-tab active" onclick="_stratMgrTab('active',this)">Active</button>
        <button class="acc-mgr-tab" onclick="_stratMgrTab('archived',this)">Archived</button>
      </div>
      <div id="strat-mgr-list-active" class="acc-mgr-list"></div>
      <div id="strat-mgr-list-archived" class="acc-mgr-list" style="display:none"></div>
      <div class="acc-mgr-add-row" id="strat-mgr-add-row">
        <input type="text" id="strat-mgr-input" class="acc-mgr-input" placeholder="Model name (e.g. IRL > ERL)…" onkeydown="if(event.key==='Enter')_addStrategyFromModal()">
        <button onclick="_addStrategyFromModal()" class="acc-mgr-add-btn">＋ Add</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  _rebuildStratMgrList();
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function _stratMgrTab(tab, btn) {
  document.querySelectorAll('#strat-manager-overlay .acc-mgr-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('strat-mgr-list-active').style.display   = tab === 'active'   ? '' : 'none';
  document.getElementById('strat-mgr-list-archived').style.display = tab === 'archived' ? '' : 'none';
  const addRow = document.getElementById('strat-mgr-add-row');
  if (addRow) addRow.style.display = tab === 'archived' ? 'none' : '';
}

function _rebuildStratMgrList() {
  const elActive   = document.getElementById('strat-mgr-list-active');
  const elArchived = document.getElementById('strat-mgr-list-archived');
  if (!elActive || !elArchived) return;

  const ICONS = {
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    archive: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    restore: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.28"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  };

  const models = _pbData.models || [];

  const renderActive = (m, mi) => `
    <div class="acc-mgr-item" id="strat-mgr-item-${mi}">
      <div class="acc-mgr-item-left" style="flex:1;min-width:0">
        <span class="acc-mgr-name">${m.title}</span>
        ${m.strategyName && m.strategyName !== m.title ? `<span class="acc-mgr-type-badge" style="background:rgba(251,191,36,.12);color:var(--gold);border-color:rgba(251,191,36,.25)">${m.strategyName}</span>` : ''}
      </div>
      <div class="acc-mgr-actions">
        <button onclick="document.getElementById('strat-manager-overlay').remove();pbEditModelModal(${mi})" class="acc-mgr-btn edit" title="Edit model">${ICONS.edit}</button>
        <button onclick="_toggleArchiveStrategy(${mi})" class="acc-mgr-btn archive" title="Archive">${ICONS.archive}</button>
        <button onclick="_deleteStrategy(${mi})" class="acc-mgr-btn del" title="Delete">${ICONS.trash}</button>
      </div>
    </div>`;

  const renderArchived = (m, mi) => `
    <div class="acc-mgr-item acc-mgr-item-archived" id="strat-mgr-item-${mi}">
      <div class="acc-mgr-item-left" style="flex:1;min-width:0">
        <span class="acc-mgr-name">${m.title}</span>
        ${m.strategyName && m.strategyName !== m.title ? `<span class="acc-mgr-type-badge">${m.strategyName}</span>` : ''}
      </div>
      <div class="acc-mgr-actions">
        <button onclick="_toggleArchiveStrategy(${mi})" class="acc-mgr-btn restore" title="Restore">${ICONS.restore}</button>
        <button onclick="_deleteStrategy(${mi})" class="acc-mgr-btn del" title="Delete">${ICONS.trash}</button>
      </div>
    </div>`;

  const activeItems   = models.filter(m => m.status !== 'archived' && m.status !== 'deleted');
  const archivedItems = models.filter(m => m.status === 'archived');

  elActive.innerHTML = activeItems.length
    ? models.map((m, mi) => (m.status !== 'archived' && m.status !== 'deleted') ? renderActive(m, mi) : '').join('')
    : '<div class="acc-mgr-empty">No active strategies yet.</div>';

  elArchived.innerHTML = archivedItems.length
    ? models.map((m, mi) => m.status === 'archived' ? renderArchived(m, mi) : '').join('')
    : '<div class="acc-mgr-empty">No archived strategies.</div>';
}

async function _addStrategyFromModal() {
  const inp = document.getElementById('strat-mgr-input'); if (!inp) return;
  const name = inp.value.trim(); if (!name) return;
  const existing = (_pbData.models || []).find(m => (m.strategyName || m.title) === name);
  if (existing) { showToast('Model already exists', 'danger'); return; }
  _pbData.models.push({ title: name, strategyName: name, sub: '', steps: [], status: 'active' });
  inp.value = '';
  await _pbSave();
  buildPlaybook();
  _rebuildStratMgrList();
  _refreshStrategyDropdowns();
  showToast('Model added ✓', 'restore');
}

async function _toggleArchiveStrategy(mi) {
  const m = _pbData.models[mi]; if (!m) return;
  m.status = m.status === 'archived' ? 'active' : 'archived';
  await _pbSave();
  buildPlaybook();
  _rebuildStratMgrList();
  _refreshStrategyDropdowns();
  showToast(m.status === 'archived' ? 'Model archived' : 'Model restored ✓', 'restore');
}

async function _deleteStrategy(mi) {
  const m = _pbData.models[mi]; if (!m) return;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>',
    title: 'Delete Model?',
    body: `<strong>${m.title}</strong> will be permanently removed.<br><small style="color:var(--text3)">Past trades using this strategy tag are not affected.</small>`,
    confirmLabel: 'Delete',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      _pbData.models.splice(mi, 1);
      await _pbSave();
      buildPlaybook();
      _rebuildStratMgrList();
      _refreshStrategyDropdowns();
      showToast('Model deleted', 'danger');
    }
  });
}

function buildPlaybook() {
  // Models
  const mc = document.getElementById('model-cards');
  if (mc) {
    mc.innerHTML = (_pbData.models || []).filter(m => m.status !== 'deleted').map((m, mi) => {
      const isArchived = m.status === 'archived';
      const sName = m.strategyName || m.title;
      const fromLab = !!m.sourceStrategyId;
      const labStrategyStillExists = fromLab && (typeof _blGetById === 'function') && !!_blGetById(m.sourceStrategyId);
      return `
      <div class="model-card${isArchived ? ' model-card-archived' : ''}" style="position:relative">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
              <div class="model-title">${m.title}</div>
              ${isArchived ? '<span class="acc-mgr-type-badge" style="background:rgba(148,163,184,.12);color:var(--text3)">Archived</span>' : ''}
              ${fromLab ? `<span class="acc-mgr-type-badge pb-lab-badge"${labStrategyStillExists ? ` onclick="nav('backtesting', document.querySelector('.sb-item[onclick*=&quot;backtesting&quot;]'), 'Backtesting Lab')" style="cursor:pointer" title="Open in Backtesting Lab"` : ' title="Original Lab strategy has since been removed"'}><svg class="icn" aria-hidden="true"><use href="#ic-flask"></use></svg> From Backtesting Lab</span>` : ''}
            </div>
            <div class="model-sub" style="margin-top:2px">${m.sub}</div>
            ${sName !== m.title ? `<div style="margin-top:4px;font-size:10px;color:var(--gold);opacity:.7">Model tag: <strong>${sName}</strong></div>` : ''}
            ${fromLab && m.sourceStats && m.sourceStats.totalTests ? `<div style="margin-top:4px;font-size:10px;color:var(--text3)">Saved at ${m.sourceStats.winRate}% WR · ${m.sourceStats.profitFactor} PF over ${m.sourceStats.totalTests} tests</div>` : ''}
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button class="wl-week-btn" style="font-size:10px;padding:3px 9px" onclick="pbEditModelModal(${mi})"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit</button>
            <button class="wl-week-btn${isArchived ? ' restore' : ' archive'}" style="font-size:10px;padding:3px 9px" onclick="pbToggleArchiveModel(${mi})">${isArchived ? '<svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Restore' : '<svg class="icn" aria-hidden="true"><use href="#ic-archive"></use></svg> Archive'}</button>
          </div>
        </div>
        <div class="model-steps">${(m.steps||[]).map(s => `<div class="model-step">${s}</div>`).join('')}</div>
      </div>`}).join('') +
      `<div class="wl-add-pair-card" style="min-height:90px" onclick="pbAddModelModal()">
        <span>＋</span><p>Add Entry Model</p>
      </div>`;
  }

  // Rules
  const rl = document.getElementById('rules-list');
  if (rl) {
    rl.innerHTML = (_pbData.rules || []).map((r, i) => `
      <div class="rule-card" style="display:flex;align-items:flex-start;gap:8px">
        <div class="rule-num" style="flex-shrink:0">RULE ${String(i+1).padStart(2,'0')}</div>
        <div class="rule-text" style="flex:1">${r}</div>
        <button class="wl-week-btn danger" style="font-size:10px;padding:2px 7px;flex-shrink:0" onclick="pbDeleteRule(${i})"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>`).join('') +
      `<button class="wl-add-week-btn" style="margin-top:10px" onclick="pbAddRule()">＋ Add Rule</button>`;
  }
}

function pbAddModelModal() { _openModelEditModal(null); }
function pbEditModelModal(mi) { _openModelEditModal(mi); }

function _openModelEditModal(mi) {
  const isNew = mi === null;
  const m = isNew ? { title: '', strategyName: '', sub: '', steps: [], status: 'active' } : _pbData.models[mi];
  const existing = document.getElementById('pb-model-edit-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pb-model-edit-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:520px">
    <div class="acc-manager-header">
      <span>${isNew ? '＋ Add Entry Model' : '<svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit Model'}</span>
      <button onclick="document.getElementById('pb-model-edit-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="display:flex;flex-direction:column;gap:12px;padding:16px">
      <div>
        <label style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Model Title</label>
        <input type="text" id="pb-edit-title" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="e.g. IRL > ERL" value="${m.title}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Model Tag <span style="font-weight:400;text-transform:none;color:var(--gold)">(used in trade log)</span></label>
        <input type="text" id="pb-edit-stratname" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="e.g. IRL > ERL" value="${m.strategyName || ''}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Sub-Description</label>
        <input type="text" id="pb-edit-sub" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="One-line description of the setup…" value="${m.sub}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Steps <span style="font-weight:400;text-transform:none">(one per line)</span></label>
        <textarea id="pb-edit-steps" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:140px;resize:vertical;font-size:12px;line-height:1.6" placeholder="Step 1&#10;Step 2&#10;Step 3…">${(m.steps||[]).join('\n')}</textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        ${!isNew ? `<button onclick="pbDeleteModel(${mi})" class="acc-mgr-btn del" style="padding:6px 14px;margin-right:auto"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Delete</button>` : ''}
        <button onclick="document.getElementById('pb-model-edit-overlay').remove()" class="acc-mgr-btn" style="padding:6px 14px">Cancel</button>
        <button onclick="_pbSaveModelModal(${isNew ? 'null' : mi})" class="acc-mgr-add-btn" style="padding:6px 18px">Save</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.getElementById('pb-edit-title')?.focus();
}

async function _pbSaveModelModal(mi) {
  const isNew = mi === null;
  const title    = document.getElementById('pb-edit-title')?.value.trim();
  const stratN   = document.getElementById('pb-edit-stratname')?.value.trim();
  const sub      = document.getElementById('pb-edit-sub')?.value.trim() || '';
  const stepsRaw = document.getElementById('pb-edit-steps')?.value || '';
  const steps    = stepsRaw.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!title) { showToast('Title is required', 'danger'); return; }
  const strategyName = stratN || title;
  if (isNew) {
    _pbData.models.push({ title, strategyName, sub, steps, status: 'active' });
  } else {
    _pbData.models[mi] = { ..._pbData.models[mi], title, strategyName, sub, steps };
  }
  document.getElementById('pb-model-edit-overlay')?.remove();
  buildPlaybook(); await _pbSave();
  _refreshStrategyDropdowns();
  showToast(isNew ? 'Model added ✓' : 'Model updated ✓', 'restore');
}

async function pbToggleArchiveModel(mi) {
  const m = _pbData.models[mi]; if (!m) return;
  const wasArchived = m.status === 'archived';
  m.status = wasArchived ? 'active' : 'archived';
  buildPlaybook(); await _pbSave();
  _refreshStrategyDropdowns();
  showToast(wasArchived ? 'Model restored ✓' : 'Model archived', 'restore');
}

async function pbDeleteModel(mi) {
  const m = _pbData.models[mi]; if (!m) return;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>',
    title: 'Delete Model?',
    body: `<strong>${m.title}</strong> will be permanently removed from your playbook.<br><small style="color:var(--text3)">Past trades using this strategy tag are not affected.</small>`,
    confirmLabel: 'Delete Model',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      document.getElementById('pb-model-edit-overlay')?.remove();
      _pbData.models.splice(mi, 1);
      buildPlaybook(); await _pbSave();
      _refreshStrategyDropdowns();
      showToast('Model deleted', 'danger');
    }
  });
}

// Legacy prompt-based functions (kept for safety, now delegate to modal)
function pbAddModel() { pbAddModelModal(); }
function pbEditModel(mi) { pbEditModelModal(mi); }

function pbAddRule() {
  const rule = prompt('New rule:');
  if (!rule) return;
  _pbData.rules.push(rule.trim());
  buildPlaybook(); _pbSave();
}

function pbDeleteRule(i) {
  if (!confirm(`Delete rule: "${_pbData.rules[i]}"?`)) return;
  _pbData.rules.splice(i, 1);
  buildPlaybook(); _pbSave();
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 1: Strategy Library
// Table: journal_backtest_lab { id, user_id, data jsonb }
// data = { strategies: [ {...} ], sessions: [] }
// `sessions` is a reserved stub for Phase 2 (Backtest Sessions);
// each strategy's `stats` object will be computed from linked
// sessions once those exist — for now it holds manual/blank values.
// ═══════════════════════════════════════════════════
let _blData  = { strategies: [], sessions: [] };
let _blRowId = null;
let _blTabState = 'active'; // 'active' | 'archived'

const BL_COLORS = ['gold', 'blue', 'green', 'red', 'purple', 'teal'];

function _blEmptyStats() {
  return {
    winRate: null, expectancy: null, profitFactor: null, avgRR: null,
    totalTests: 0, avgHoldTime: null, maxDrawdown: null,
    consistencyScore: null, confidenceScore: null,
  };
}

function _blNewStrategy() {
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : 'bl_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
    name: '', description: '', market: '', instrument: '', timeframe: '', session: '',
    riskPercent: '', rrTarget: '', entryModel: '', confirmationChecklist: [],
    invalidationRules: '', exitRules: '', notes: '',
    colorTag: 'gold', status: 'active',
    stats: _blEmptyStats(),
    versions: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

async function _blLoad() {
  if (!_currentUser) return;
  const { data, error } = await sb
    .from('journal_backtest_lab')
    .select('id, data')
    .eq('user_id', _currentUser.id)
    .maybeSingle();
  if (error) { console.error('_blLoad:', error.message); return; }
  if (data) {
    _blRowId = data.id;
    _blData  = data.data || { strategies: [], sessions: [] };
    if (!_blData.strategies) _blData.strategies = [];
    if (!_blData.sessions)   _blData.sessions   = [];
    // Backfill any fields added after a strategy was first created
    _blData.strategies = _blData.strategies.map(s => ({ ..._blNewStrategy(), ...s, stats: { ..._blEmptyStats(), ...(s.stats || {}) } }));
  }
}

async function _blSave() {
  if (!_currentUser) return;
  const row = { user_id: _currentUser.id, data: _blData };
  if (_blRowId) {
    await sb.from('journal_backtest_lab').update(row).eq('id', _blRowId);
  } else {
    const { data } = await sb.from('journal_backtest_lab').insert(row).select('id').single();
    if (data) _blRowId = data.id;
  }
}

function _blGetById(id) { return (_blData.strategies || []).find(s => s.id === id); }
function _blGetIndexById(id) { return (_blData.strategies || []).findIndex(s => s.id === id); }

function _blTab(tab, btn) {
  _blTabState = tab;
  document.querySelectorAll('#bl-tabs .bl-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  buildBacktestingLab();
}

