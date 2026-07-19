// ══ NxTGen Journal — calendar.js (original app.js lines 14552-15792) ══

// ── CALENDAR ─────────────────────────────────────────
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
// Dashboard <-> full Calendar page shortcuts
function calMaximizeToPage() { nav('calendar', document.getElementById('sb-calendar'), 'Calendar'); }
function calMinimizeToDashboard() { const sbDash = document.querySelector('.sb-item[onclick*="dashboard"]'); nav('dashboard', sbDash, 'Dashboard'); }
// ── Calendar 2.0 state: filters / heatmap mode / view mode ──
let calFilters = { strategy: '', session: '', pair: '', outcome: '' };
let calHeatMode = 'off';   // 'off' | 'profit' | 'trades' | 'rules' | 'psych'
let calViewMode = 'month'; // 'month' | 'agenda'
function calNav(dir) { calMonth += dir; if (calMonth > 11) { calMonth = 0; calYear++; } if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); }
function getAccSize() {
  // Try desktop first, fall back to mobile
  const el  = document.getElementById('cal-acc-size');
  const el2 = document.getElementById('cal-acc-size-2');
  const v1 = el  ? parseFloat(el.value)  || 0 : 0;
  const v2 = el2 ? parseFloat(el2.value) || 0 : 0;
  return v1 || v2 || 5000;
}
function getCalFilter() {
  // Return whichever dropdown has a non-empty selection (they're kept in sync)
  const el  = document.getElementById('cal-acc-filter');
  const el2 = document.getElementById('cal-acc-filter-2');
  return (el && el.value) || (el2 && el2.value) || '';
}
// pnlToUSD: converts a single trade's pnl to USD correctly.
// MT5/dollar trades already have pnl in $; only %-unit trades need (pnl/100)*accSize.
function pnlToUSD(pnl, accSize, trade) {
  if (trade) return toPnlDollars(trade, accSize);
  // Legacy call-sites that don't pass a trade object: treat as % (old behaviour for manual/seed trades only)
  return (pnl / 100) * accSize;
}
function _currencySymbol() {
  const c = (_profileData && _profileData.currency) || '% (Percentage)';
  if (c.startsWith('USD')) return '$';
  if (c.startsWith('GBP')) return '£';
  if (c.startsWith('NGN')) return '₦';
  if (c.startsWith('EUR')) return '€';
  return '$';
}
function fmtUSD(val) { const abs = Math.abs(val); const sym = _currencySymbol(); const s = abs >= 1000 ? sym + (abs / 1000).toFixed(1) + 'k' : sym + abs.toFixed(2); return (val < 0 ? '-' : val > 0 ? '+' : '') + s; }
// groupTradesByDay: totalPnlUSD stores the sum in dollars using toPnlDollars per trade.
// accSize is needed to convert %-based trades; it is provided by renderCalendar.
function groupTradesByDay(tradeList, accSize) {
  const dayMap = {};
  tradeList.forEach(t => {
    if (!dayMap[t.date]) dayMap[t.date] = { trades: [], totalPnl: 0, totalPnlUSD: 0, wins: 0, losses: 0, bes: 0 };
    dayMap[t.date].trades.push(t);
    dayMap[t.date].totalPnl += t.pnl;                          // raw (kept for outcome sign)
    dayMap[t.date].totalPnlUSD += toPnlDollars(t, accSize || 0); // dollar-correct sum
    if (t.outcome === 'Win') dayMap[t.date].wins++;
    else if (t.outcome === 'Loss') dayMap[t.date].losses++;
    else dayMap[t.date].bes++;
  });
  return dayMap;
}
function calculateDailyOutcome(totalPnlUSD) { if (totalPnlUSD > 0) return 'win'; if (totalPnlUSD < 0) return 'loss'; return 'breakeven'; }
function calculateCalendarWinrate(dayMap) { const days = Object.values(dayMap); const winDays = days.filter(d => calculateDailyOutcome(d.totalPnlUSD !== undefined ? d.totalPnlUSD : d.totalPnl) === 'win').length; const lossDays = days.filter(d => calculateDailyOutcome(d.totalPnlUSD !== undefined ? d.totalPnlUSD : d.totalPnl) === 'loss').length; const beDays = days.filter(d => calculateDailyOutcome(d.totalPnlUSD !== undefined ? d.totalPnlUSD : d.totalPnl) === 'breakeven').length; const denom = winDays + lossDays; const wr = denom > 0 ? ((winDays / denom) * 100) : 0; return { winDays, lossDays, beDays, wr: parseFloat(wr.toFixed(2)) }; }
function showCalTooltip(e, dayData, dateStr, accSize) { const tip = document.getElementById('cal-tooltip'); if (!tip || !dayData) return; const dt = new Date(dateStr + 'T12:00:00'); const dateLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); const usd = dayData.totalPnlUSD !== undefined ? dayData.totalPnlUSD : dayData.trades.reduce((a, t) => a + toPnlDollars(t, accSize), 0); const outcome = calculateDailyOutcome(usd); const outLabel = outcome === 'win' ? '<svg class="icn icn-green" aria-hidden="true"><use href="#ic-dot"></use></svg> Winning Day' : outcome === 'loss' ? '<svg class="icn icn-red" aria-hidden="true"><use href="#ic-dot"></use></svg> Losing Day' : '<svg class="icn icn-muted" aria-hidden="true"><use href="#ic-dot-o"></use></svg> Breakeven Day'; const outColor = outcome === 'win' ? 'var(--green)' : outcome === 'loss' ? 'var(--red)' : 'var(--text3)'; tip.innerHTML = `<div class="cal-tooltip-date">${dateLabel}</div><div class="cal-tooltip-row"><span class="k">Net PnL</span><span class="v" style="color:${usd >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtUSD(usd)}</span></div><div class="cal-tooltip-row"><span class="k">Total trades</span><span class="v">${dayData.trades.length}</span></div><div class="cal-tooltip-row"><span class="k">Wins</span><span class="v" style="color:var(--green)">${dayData.wins}</span></div><div class="cal-tooltip-row"><span class="k">Losses</span><span class="v" style="color:var(--red)">${dayData.losses}</span></div>${dayData.bes ? `<div class="cal-tooltip-row"><span class="k">Break evens</span><span class="v" style="color:var(--blue)">${dayData.bes}</span></div>` : ''}<hr class="cal-tooltip-divider"><div class="cal-tooltip-outcome" style="color:${outColor}">${outLabel}</div>`; const x = Math.min(e.clientX + 14, window.innerWidth - 224); const y = Math.min(e.clientY + 14, window.innerHeight - 200); tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.style.display = 'block'; }
function hideCalTooltip() { const tip = document.getElementById('cal-tooltip'); if (tip) tip.style.display = 'none'; }

// ═══════════════════════════════════════════════════════
// CALENDAR 2.0 — shared stats engine (Phases 1-3)
// ═══════════════════════════════════════════════════════
function _calParseRR(rrStr) {
  // "1:3" -> 3 ; "1:4.5" -> 4.5 ; returns null if unparseable
  if (!rrStr) return null;
  const m = String(rrStr).match(/([\d.]+)\s*$/);
  return m ? parseFloat(m[1]) : null;
}
// Approximate realized R-multiple: full planned R on a Win, -1R on a Loss, 0 on B.E.
function _calAchievedR(t) {
  const r = _calParseRR(t.rr);
  if (r === null) return null;
  if (t.outcome === 'Win') return r;
  if (t.outcome === 'Loss') return -1;
  return 0;
}
function _calFollowed(t) { return String(t.followedPlan || 'Yes').toLowerCase() === 'yes'; }
function _calWeekday(dateStr) { return new Date(dateStr + 'T12:00:00').getDay(); }
const _CAL_WD_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function _calGrade(score) {
  if (score >= 93) return 'A+'; if (score >= 87) return 'A'; if (score >= 80) return 'A-';
  if (score >= 73) return 'B+'; if (score >= 67) return 'B'; if (score >= 60) return 'B-';
  if (score >= 53) return 'C+'; if (score >= 45) return 'C'; if (score >= 35) return 'D';
  return 'F';
}
function _calGradeColor(g) {
  if (g.startsWith('A')) return 'var(--green)';
  if (g.startsWith('B')) return '#a3e635';
  if (g.startsWith('C')) return 'var(--blue)';
  return 'var(--red)';
}

// Central metrics computation — used by analytics cards, insights, score, and weekly reports.
function computeCalMonthStats(monthTrades, dayMap, accSize) {
  const wins = monthTrades.filter(t => t.outcome === 'Win');
  const losses = monthTrades.filter(t => t.outcome === 'Loss');
  const bes = monthTrades.filter(t => t.outcome !== 'Win' && t.outcome !== 'Loss');
  const denom = wins.length + losses.length;
  const tradeWR = denom > 0 ? (wins.length / denom) * 100 : 0;

  const longs = monthTrades.filter(t => t.pos === 'Buy');
  const shorts = monthTrades.filter(t => t.pos === 'Sell');
  const longWins = longs.filter(t => t.outcome === 'Win').length;
  const longDenom = longs.filter(t => t.outcome === 'Win' || t.outcome === 'Loss').length;
  const shortWins = shorts.filter(t => t.outcome === 'Win').length;
  const shortDenom = shorts.filter(t => t.outcome === 'Win' || t.outcome === 'Loss').length;
  const longWR = longDenom > 0 ? (longWins / longDenom) * 100 : null;
  const shortWR = shortDenom > 0 ? (shortWins / shortDenom) * 100 : null;

  let grossProfit = 0, grossLoss = 0, winSum = 0, lossSum = 0;
  let largestWin = 0, largestLoss = 0;
  monthTrades.forEach(t => {
    const usd = toPnlDollars(t, accSize);
    if (usd > 0) { grossProfit += usd; winSum += usd; if (usd > largestWin) largestWin = usd; }
    else if (usd < 0) { grossLoss += Math.abs(usd); lossSum += Math.abs(usd); if (usd < largestLoss) largestLoss = usd; }
  });
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? grossProfit : 0);
  const avgWin = wins.length > 0 ? winSum / wins.length : 0;
  const avgLoss = losses.length > 0 ? lossSum / losses.length : 0;
  const avgRatio = losses.length > 0 ? (avgWin / avgLoss) : null;
  const expectancy = monthTrades.length > 0 ? ((winSum - lossSum) / monthTrades.length) : 0;
  const recoveryFactor = grossLoss > 0 ? ((grossProfit - grossLoss) / grossLoss) : null;

  const rrVals = monthTrades.map(_calAchievedR).filter(v => v !== null);
  const avgRR = rrVals.length ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : null;
  const largestRR = rrVals.length ? Math.max(...rrVals) : null;
  const sortedRR = [...rrVals].sort((a, b) => a - b);
  const medianRR = sortedRR.length ? (sortedRR.length % 2 ? sortedRR[(sortedRR.length - 1) / 2] : (sortedRR[sortedRR.length / 2 - 1] + sortedRR[sortedRR.length / 2]) / 2) : null;

  // Day-level metrics + streaks (chronological)
  const dayEntries = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]));
  let winDays = 0, lossDays = 0, beDays = 0;
  let curStreakType = null, curStreakLen = 0, longestWinStreak = 0, longestLossStreak = 0, runWin = 0, runLoss = 0;
  dayEntries.forEach(([date, d]) => {
    const o = calculateDailyOutcome(d.totalPnlUSD);
    if (o === 'win') { winDays++; runWin++; runLoss = 0; if (runWin > longestWinStreak) longestWinStreak = runWin; }
    else if (o === 'loss') { lossDays++; runLoss++; runWin = 0; if (runLoss > longestLossStreak) longestLossStreak = runLoss; }
    else { beDays++; runWin = 0; runLoss = 0; }
  });
  if (dayEntries.length) {
    const lastO = calculateDailyOutcome(dayEntries[dayEntries.length - 1][1].totalPnlUSD);
    let i = dayEntries.length - 1, len = 0;
    while (i >= 0 && calculateDailyOutcome(dayEntries[i][1].totalPnlUSD) === lastO) { len++; i--; }
    curStreakType = lastO; curStreakLen = len;
  }
  const dayDenom = winDays + lossDays;
  const dayWR = dayDenom > 0 ? (winDays / dayDenom) * 100 : 0;
  const consistency = dayEntries.length ? Math.round((winDays / dayEntries.length) * 100) : 0;

  // Rule adherence
  const followedCount = monthTrades.filter(_calFollowed).length;
  const ruleAdherence = monthTrades.length ? (followedCount / monthTrades.length) * 100 : 100;

  // Session (kz) breakdown
  const sessionMap = {};
  monthTrades.forEach(t => {
    const k = t.kz || 'Unspecified';
    if (!sessionMap[k]) sessionMap[k] = { count: 0, usd: 0, wins: 0, denom: 0 };
    sessionMap[k].count++; sessionMap[k].usd += toPnlDollars(t, accSize);
    if (t.outcome === 'Win' || t.outcome === 'Loss') { sessionMap[k].denom++; if (t.outcome === 'Win') sessionMap[k].wins++; }
  });
  let bestSession = null;
  Object.entries(sessionMap).forEach(([k, v]) => { if (!bestSession || v.usd > sessionMap[bestSession].usd) bestSession = k; });

  // Pair breakdown (expectancy per pair)
  const pairMap = {};
  monthTrades.forEach(t => {
    const k = t.pair || 'Unknown';
    if (!pairMap[k]) pairMap[k] = { count: 0, usd: 0 };
    pairMap[k].count++; pairMap[k].usd += toPnlDollars(t, accSize);
  });
  let bestPair = null, worstPair = null;
  Object.entries(pairMap).forEach(([k, v]) => {
    if (!bestPair || v.usd > pairMap[bestPair].usd) bestPair = k;
    if (!worstPair || v.usd < pairMap[worstPair].usd) worstPair = k;
  });

  // Weekday breakdown
  const wdMap = {};
  monthTrades.forEach(t => {
    const wd = _calWeekday(t.date);
    if (!wdMap[wd]) wdMap[wd] = { count: 0, usd: 0 };
    wdMap[wd].count++; wdMap[wd].usd += toPnlDollars(t, accSize);
  });
  let bestWd = null;
  Object.entries(wdMap).forEach(([wd, v]) => { if (!bestWd || v.usd > wdMap[bestWd].usd) bestWd = wd; });

  // Mistake tally (loss reasons on losing trades)
  const mistakeTally = {};
  losses.forEach(t => { const r = (t.lossReason || '').trim(); if (r) mistakeTally[r] = (mistakeTally[r] || 0) + 1; });
  const topMistake = Object.entries(mistakeTally).sort((a, b) => b[1] - a[1])[0] || null;

  // Overtrading after big wins: flag days with >=3 trades that followed a winning day
  let overtradeAfterWinDays = 0;
  for (let i = 1; i < dayEntries.length; i++) {
    const prevO = calculateDailyOutcome(dayEntries[i - 1][1].totalPnlUSD);
    if (prevO === 'win' && dayEntries[i][1].trades.length >= 3) overtradeAfterWinDays++;
  }

  // Avg rating (proxy for psychology/execution quality, 1-5 stars)
  const avgRating = monthTrades.length ? monthTrades.reduce((a, t) => a + (t.rating || 0), 0) / monthTrades.length : 0;

  return {
    totalTrades: monthTrades.length, wins: wins.length, losses: losses.length, bes: bes.length, tradeWR,
    longWR, shortWR, longCount: longs.length, shortCount: shorts.length,
    grossProfit, grossLoss, profitFactor, avgWin, avgLoss, avgRatio, expectancy, recoveryFactor,
    largestWin, largestLoss, avgRR, largestRR, medianRR,
    winDays, lossDays, beDays, dayWR, longestWinStreak, longestLossStreak, curStreakType, curStreakLen,
    consistency, tradingDays: dayEntries.length,
    ruleAdherence, bestSession, sessionMap, bestPair, worstPair, pairMap,
    bestWd, wdMap, topMistake, mistakeTally, overtradeAfterWinDays, avgRating,
  };
}

// Trading Score 0-100: profitability, consistency, rule adherence, risk mgmt(RR), win rate — weighted blend
function computeCalScore(stats) {
  if (stats.totalTrades === 0) return { score: 0, grade: 'N/A', parts: {} };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const profitability = clamp((stats.profitFactor / 3) * 100, 0, 100);        // PF of 3+ = full marks
  const consistency = clamp(stats.consistency, 0, 100);
  const discipline = clamp(stats.ruleAdherence, 0, 100);
  const riskMgmt = stats.avgRR !== null ? clamp(((stats.avgRR + 1) / 4) * 100, 0, 100) : 50;
  const winRate = clamp(stats.tradeWR, 0, 100);
  const score = Math.round(profitability * 0.30 + consistency * 0.20 + discipline * 0.20 + riskMgmt * 0.15 + winRate * 0.15);
  return { score, grade: _calGrade(score), parts: { profitability, consistency, discipline, riskMgmt, winRate } };
}

// Auto-generated Monthly Intelligence insight cards, grounded entirely in real trade data.
function computeCalInsights(stats, monthTrades) {
  const insights = [];
  if (!stats.totalTrades) return insights;

  if (stats.bestWd !== null && stats.wdMap[stats.bestWd].count >= 2) {
    insights.push({ icon: 'ic-trend-up', tone: 'green', text: `${_CAL_WD_NAMES[stats.bestWd]}s are your strongest day — ${fmtUSD(stats.wdMap[stats.bestWd].usd)} across ${stats.wdMap[stats.bestWd].count} trades.` });
  }
  if (stats.bestSession && stats.grossProfit > 0) {
    const sessShare = Math.round((Math.max(0, stats.sessionMap[stats.bestSession].usd) / stats.grossProfit) * 100);
    if (sessShare > 0) insights.push({ icon: 'ic-globe', tone: 'blue', text: `${stats.bestSession} session generated ${clampPct(sessShare)}% of this month's gross profit.` });
  }
  if (stats.bestPair && stats.pairMap[stats.bestPair].count >= 2) {
    insights.push({ icon: 'ic-star', tone: 'green', text: `${stats.bestPair} is your highest-expectancy pair this month at ${fmtUSD(stats.pairMap[stats.bestPair].usd)} net.` });
  }
  if (stats.worstPair && stats.pairMap[stats.worstPair].usd < 0 && stats.worstPair !== stats.bestPair) {
    insights.push({ icon: 'ic-trend-down', tone: 'red', text: `${stats.worstPair} has been unprofitable this month (${fmtUSD(stats.pairMap[stats.worstPair].usd)}).` });
  }
  if (stats.longestLossStreak >= 2) {
    insights.push({ icon: 'ic-warning', tone: 'red', text: `Longest losing streak this month: ${stats.longestLossStreak} day${stats.longestLossStreak > 1 ? 's' : ''} in a row.` });
  }
  if (stats.curStreakType === 'win' && stats.curStreakLen >= 2) {
    insights.push({ icon: 'ic-fire', tone: 'green', text: `You're on a ${stats.curStreakLen}-day winning streak — keep risk consistent, don't size up.` });
  }
  if (stats.overtradeAfterWinDays > 0) {
    insights.push({ icon: 'ic-warning', tone: 'amber', text: `You took 3+ trades on ${stats.overtradeAfterWinDays} day${stats.overtradeAfterWinDays > 1 ? 's' : ''} right after a winning day — watch for overtrading after wins.` });
  }
  insights.push({ icon: 'ic-shield', tone: stats.ruleAdherence >= 80 ? 'green' : stats.ruleAdherence >= 60 ? 'amber' : 'red', text: `You followed your trading plan on ${Math.round(stats.ruleAdherence)}% of trades this month.` });
  if (stats.topMistake) {
    insights.push({ icon: 'ic-warning', tone: 'red', text: `"${stats.topMistake[0]}" is your most common loss reason — logged on ${stats.topMistake[1]} losing trade${stats.topMistake[1] > 1 ? 's' : ''}.` });
  }
  if (stats.longWR !== null && stats.shortWR !== null && stats.longCount >= 2 && stats.shortCount >= 2) {
    if (Math.abs(stats.longWR - stats.shortWR) >= 15) {
      const better = stats.longWR > stats.shortWR ? 'longs' : 'shorts';
      insights.push({ icon: 'ic-target', tone: 'blue', text: `Your ${better} are performing notably better this month (${stats.longWR.toFixed(0)}% long vs ${stats.shortWR.toFixed(0)}% short win rate).` });
    }
  }
  if (stats.avgRR !== null && stats.avgRR < 1 && stats.losses > 0) {
    insights.push({ icon: 'ic-warning', tone: 'amber', text: `Average realized R is below 1 — consider tightening entries or letting winners run further.` });
  }
  return insights.slice(0, 8);
}
function clampPct(v) { return Math.max(0, Math.min(100, v)); }

// ── Calendar 2.0 Phase 4: AI Coach tie-in ──
// Instant local heuristic preview (no API call) + a deep-link into the real
// AI Coach page (existing 'monthly' mode), pre-scoped to the month the
// calendar is currently viewing.
function computeCalCoachPreview(stats) {
  const strengths = [], weaknesses = [];
  if (stats.profitFactor >= 2) strengths.push('Strong profit factor (' + stats.profitFactor.toFixed(2) + ')');
  if (stats.ruleAdherence >= 85) strengths.push('Excellent rule adherence (' + Math.round(stats.ruleAdherence) + '%)');
  if (stats.avgRR !== null && stats.avgRR >= 2) strengths.push('Healthy average R (' + stats.avgRR.toFixed(1) + 'R)');
  if (stats.bestSession) strengths.push(stats.bestSession + ' session is carrying this month');
  if (stats.consistency >= 70) strengths.push('Consistent day-to-day results (' + stats.consistency + '%)');

  if (stats.ruleAdherence < 70) weaknesses.push('Rule adherence dipped to ' + Math.round(stats.ruleAdherence) + '%');
  if (stats.longestLossStreak >= 3) weaknesses.push(stats.longestLossStreak + '-day losing streak this month');
  if (stats.topMistake) weaknesses.push('"' + stats.topMistake[0] + '" repeating on losing trades');
  if (stats.avgRR !== null && stats.avgRR < 1) weaknesses.push('Average R below 1 — entries or trade management need work');
  if (stats.worstPair && stats.pairMap[stats.worstPair] && stats.pairMap[stats.worstPair].usd < 0) weaknesses.push(stats.worstPair + ' has been a net loser');

  let recommendation = 'Keep logging consistently — there isn\u2019t enough data yet for a confident recommendation.';
  if (stats.totalTrades >= 3) {
    if (stats.topMistake) recommendation = `Address "${stats.topMistake[0]}" first — it's your single biggest recurring leak this month.`;
    else if (stats.ruleAdherence < 80) recommendation = 'Tighten plan adherence before adding new strategies or size.';
    else if (stats.avgRR !== null && stats.avgRR < 1.5) recommendation = 'Focus on letting winners run further to lift your average R.';
    else recommendation = 'Current approach is working — protect it by keeping risk and rule adherence exactly where they are.';
  }
  const confidence = Math.max(35, Math.min(96, 40 + stats.totalTrades * 4 + Math.round(stats.ruleAdherence / 10)));
  return { strengths: strengths.slice(0, 4), weaknesses: weaknesses.slice(0, 4), recommendation, confidence };
}

function renderCalCoach(stats) {
  const el = document.getElementById('cal2-coach');
  if (!el) return;
  if (!stats.totalTrades) {
    el.innerHTML = `<div class="cal2-coach-empty"><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg> Log a few trades this month to unlock your AI Coach preview.</div>`;
    return;
  }
  const p = computeCalCoachPreview(stats);
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long' });
  el.innerHTML = `
    <div class="cal2-coach-head">
      <div class="cal2-coach-title"><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg> AI Coach — ${monthName}</div>
      <div class="cal2-coach-conf">${p.confidence}% confidence</div>
    </div>
    <div class="cal2-coach-cols">
      <div class="cal2-coach-col">
        <div class="cal2-coach-col-label green">Strengths</div>
        ${p.strengths.length ? p.strengths.map(s => `<div class="cal2-coach-item green"><svg class="icn" aria-hidden="true"><use href="#ic-check"></use></svg>${s}</div>`).join('') : '<div class="cal2-coach-item muted">Nothing standout yet</div>'}
      </div>
      <div class="cal2-coach-col">
        <div class="cal2-coach-col-label red">Weaknesses</div>
        ${p.weaknesses.length ? p.weaknesses.map(s => `<div class="cal2-coach-item red"><svg class="icn" aria-hidden="true"><use href="#ic-warning"></use></svg>${s}</div>`).join('') : '<div class="cal2-coach-item muted">No major issues found</div>'}
      </div>
    </div>
    <div class="cal2-coach-rec"><span class="cal2-coach-rec-label">Recommendation</span>${p.recommendation}</div>
    <button class="cal2-coach-btn" onclick="calLaunchAICoach()"><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg> Get full AI monthly review</button>`;
}

function calLaunchAICoach() {
  const monthKey = calYear + '-' + String(calMonth + 1).padStart(2, '0');
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long' });
  const accFilter = getCalFilter();
  const mt = trades.filter(t => t.date.startsWith(monthKey) && (!accFilter || t.account === accFilter));
  const mWins = mt.filter(t => t.outcome === 'Win').length;
  const mPnl = mt.reduce((a, t) => a + _pnlPctValue(t), 0).toFixed(1);
  const prompt = `Give me a deep monthly review for ${monthName} ${calYear} (the month I'm currently viewing on my Calendar page).
Month stats: ${mt.length} trades, WR=${mt.length ? ((mWins / mt.length) * 100).toFixed(0) : 0}%, Net PnL=${mPnl > 0 ? '+' : ''}${mPnl}%
Full trade list: ${mt.map(t => `${t.date} ${t.pair} ${t.pos} ${t.outcome} PnL:${_pnlLabel(t)} strategy:${t.strategy} emotion:${t.emotion} followedPlan:${t.followedPlan || 'Yes'} lossReason:"${t.lossReason || ''}" notes:"${(t.notes || '').slice(0, 60)}"`).join('\n') || 'none'}
Cover: (1) Month grade and verdict, (2) Strengths this month, (3) Weaknesses this month, (4) Specific, actionable recommendations for next month, (5) A confidence score (0-100%) in this assessment.`;
  nav('ai', null, 'AI Coach');
  setTimeout(() => {
    aiSetMode('monthly');
    const inp = document.getElementById('ai-prompt-input');
    if (inp) inp.value = prompt;
    aiRun();
  }, 60);
}

function renderCalInsights(stats, monthTrades) {
  const el = document.getElementById('cal2-insights');
  if (!el) return;
  if (!monthTrades.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  const insights = computeCalInsights(stats, monthTrades);
  if (!insights.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<div class="cal2-section-head"><svg class="icn" aria-hidden="true"><use href="#ic-bulb"></use></svg> Monthly Intelligence</div>
    <div class="cal2-insight-grid">${insights.map(i => `
      <div class="cal2-insight-card ${i.tone}">
        <div class="cal2-insight-icon"><svg class="icn" aria-hidden="true"><use href="#${i.icon}"></use></svg></div>
        <div class="cal2-insight-text">${i.text}</div>
      </div>`).join('')}</div>`;
}

function renderCalScore(stats, prevStats) {
  const el = document.getElementById('cal2-score');
  if (!el) return;
  if (!stats.totalTrades) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const { score, grade, parts } = computeCalScore(stats);
  const cGreen = _calCssVar('--green', '#34d399'), cTrack = _calCssVar('--glass-3', 'rgba(255,255,255,0.12)');
  const gradeColor = _calGradeColor(grade);
  let trendHTML = '';
  if (prevStats && prevStats.totalTrades) {
    const prevScore = computeCalScore(prevStats).score;
    const diff = score - prevScore;
    trendHTML = `<div class="cal2-score-trend ${diff >= 0 ? 'green' : 'red'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)} pts vs last month</div>`;
  } else {
    trendHTML = `<div class="cal2-score-trend muted">No prior month to compare</div>`;
  }
  const rows = [
    ['Profitability', parts.profitability], ['Consistency', parts.consistency],
    ['Discipline', parts.discipline], ['Risk mgmt', parts.riskMgmt], ['Win rate', parts.winRate],
  ];
  el.innerHTML = `
    <div class="cal2-score-ring">${_calRingGauge(score / 100, cGreen, cTrack, 96)}
      <div class="cal2-score-ring-label"><div class="cal2-score-num">${score}</div><div class="cal2-score-grade" style="color:${gradeColor}">${grade}</div></div>
    </div>
    <div class="cal2-score-body">
      <div class="cal2-score-title">Trading Score <span class="info-dot">i</span></div>
      ${trendHTML}
      <div class="cal2-score-bars">${rows.map(([label, val]) => `
        <div class="cal2-score-bar-row"><span class="cal2-score-bar-label">${label}</span>
          <div class="cal2-score-bar-track"><div class="cal2-score-bar-fill" style="width:${clampPct(val).toFixed(0)}%"></div></div>
        </div>`).join('')}</div>
    </div>`;
}

function _calFilterFieldsHTML() {
  const strategies = [...new Set(trades.map(t => t.strategy).filter(Boolean))].sort();
  const sessions = [...new Set(trades.map(t => t.kz).filter(Boolean))].sort();
  const pairs = [...new Set(trades.map(t => t.pair).filter(Boolean))].sort();
  const mkOpts = (arr, cur, allLabel) => `<option value="">${allLabel}</option>` + arr.map(v => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`).join('');
  return `
    <select class="form-select cal2-filter-sel" onchange="calFilters.strategy=this.value;renderCalendar()">${mkOpts(strategies, calFilters.strategy, 'All models')}</select>
    <select class="form-select cal2-filter-sel" onchange="calFilters.session=this.value;renderCalendar()">${mkOpts(sessions, calFilters.session, 'All sessions')}</select>
    <select class="form-select cal2-filter-sel" onchange="calFilters.pair=this.value;renderCalendar()">${mkOpts(pairs, calFilters.pair, 'All pairs')}</select>
    <select class="form-select cal2-filter-sel" onchange="calFilters.outcome=this.value;renderCalendar()">
      <option value=""${calFilters.outcome === '' ? ' selected' : ''}>All outcomes</option>
      <option value="Win"${calFilters.outcome === 'Win' ? ' selected' : ''}>Wins</option>
      <option value="Loss"${calFilters.outcome === 'Loss' ? ' selected' : ''}>Losses</option>
      <option value="BE"${calFilters.outcome === 'BE' ? ' selected' : ''}>Break-even</option>
    </select>
    ${(calFilters.strategy || calFilters.session || calFilters.pair || calFilters.outcome) ? `<button class="cal2-filter-clear" onclick="calFilters={strategy:'',session:'',pair:'',outcome:''};renderCalendar()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg> Clear all</button>` : ''}`;
}

function renderCalFilterBar() {
  const el = document.getElementById('cal2-filter-bar');
  const activeCount = ['strategy', 'session', 'pair', 'outcome'].filter(k => calFilters[k]).length;
  const fab = document.getElementById('cal2-filter-fab-count');
  if (fab) { fab.style.display = activeCount ? '' : 'none'; fab.textContent = activeCount; }
  if (el) el.innerHTML = _calFilterFieldsHTML();
  const sheetBody = document.getElementById('cal2-filter-sheet-body');
  if (sheetBody) sheetBody.innerHTML = _calFilterFieldsHTML();
}

function calOpenFilterSheet() {
  const sheet = document.getElementById('cal2-filter-sheet');
  if (!sheet) return;
  // Move the sheet out from under .main/#page-calendar (which set
  // overflow:hidden for layout reasons) and make it a direct child of
  // <body>. Several mobile WebKit/Chromium builds clip position:fixed
  // descendants of an overflow:hidden ancestor even though the spec says
  // fixed elements should escape it — parenting to <body> sidesteps that
  // entirely rather than relying on z-index alone.
  if (sheet.parentElement !== document.body) document.body.appendChild(sheet);
  document.getElementById('cal2-filter-sheet-body').innerHTML = _calFilterFieldsHTML();
  sheet.classList.add('open');
}
function calCloseFilterSheet() {
  const sheet = document.getElementById('cal2-filter-sheet');
  if (sheet) sheet.classList.remove('open');
}

function calSetHeatMode(mode) { calHeatMode = (calHeatMode === mode) ? 'off' : mode; renderCalendar(); }
function calSetViewMode(mode) { calViewMode = mode; renderCalendar(); }

function renderCalModeTabs() {
  const el = document.getElementById('cal2-mode-tabs');
  if (!el) return;
  const viewTabs = [['month', 'Month'], ['agenda', 'Agenda']];
  const heatTabs = [['profit', 'Profit'], ['trades', 'Trades'], ['rules', 'Rules'], ['psych', 'Psychology']];
  el.innerHTML = `
    <div class="cal2-tab-group">${viewTabs.map(([v, l]) => `<button class="cal2-tab ${calViewMode === v ? 'active' : ''}" onclick="calSetViewMode('${v}')">${l}</button>`).join('')}</div>
    <div class="cal2-tab-group">
      <span class="cal2-heat-label"><svg class="icn" aria-hidden="true"><use href="#ic-chart-bar"></use></svg> Heatmap</span>
      ${heatTabs.map(([v, l]) => `<button class="cal2-tab sm ${calHeatMode === v ? 'active' : ''}" onclick="calSetHeatMode('${v}')">${l}</button>`).join('')}
    </div>`;
}

function _calHeatColor(intensity, tone) {
  // intensity 0..1 -> 5-step color scale
  const steps = tone === 'red'
    ? ['rgba(248,113,113,0.06)', 'rgba(248,113,113,0.16)', 'rgba(248,113,113,0.30)', 'rgba(248,113,113,0.48)', 'rgba(248,113,113,0.70)']
    : tone === 'blue'
    ? ['rgba(96,165,250,0.06)', 'rgba(96,165,250,0.16)', 'rgba(96,165,250,0.30)', 'rgba(96,165,250,0.48)', 'rgba(96,165,250,0.70)']
    : ['rgba(52,211,153,0.06)', 'rgba(52,211,153,0.16)', 'rgba(52,211,153,0.30)', 'rgba(52,211,153,0.48)', 'rgba(52,211,153,0.70)'];
  const idx = Math.min(4, Math.floor(intensity * 5));
  return steps[idx];
}

function renderCalAgendaView(monthTrades, dayMap, accSize) {
  const el = document.getElementById('cal2-agenda');
  if (!el) return;
  const dayEntries = Object.entries(dayMap).sort((a, b) => b[0].localeCompare(a[0]));
  if (!dayEntries.length) { el.innerHTML = `<div class="cal2-agenda-empty">No trades logged this month yet.</div>`; return; }
  el.innerHTML = dayEntries.map(([date, d]) => {
    const o = calculateDailyOutcome(d.totalPnlUSD);
    const dt = new Date(date + 'T12:00:00');
    const label = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const followedN = d.trades.filter(_calFollowed).length;
    return `<div class="cal2-agenda-row ${o}" onclick="openCalPopup(event,'${date}')">
      <div class="cal2-agenda-date">
        <div class="cal2-agenda-dow">${label}</div>
        <div class="cal2-agenda-sub">${d.trades.length} trade${d.trades.length > 1 ? 's' : ''} · ${followedN}/${d.trades.length} followed plan</div>
      </div>
      <div class="cal2-agenda-pnl ${o === 'win' ? 'green' : o === 'loss' ? 'red' : 'zero'}">${fmtUSD(d.totalPnlUSD)}</div>
    </div>`;
  }).join('');
}

function renderCalendar() {
  const accSize = getAccSize(); const accFilter = getCalFilter();
  // Update both the dashboard inline calendar label and the standalone calendar page label
  ['cal-month-label','cal-month-label-2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = MONTH_NAMES_LONG[calMonth] + ' ' + calYear;
  });
  const label = document.getElementById('cal-month-label');
  const ym = calYear + '-' + String(calMonth + 1).padStart(2, '0');
  const _calMatchesFilters = t => {
    if (calFilters.strategy && t.strategy !== calFilters.strategy) return false;
    if (calFilters.session && t.kz !== calFilters.session) return false;
    if (calFilters.pair && t.pair !== calFilters.pair) return false;
    if (calFilters.outcome === 'BE' && (t.outcome === 'Win' || t.outcome === 'Loss')) return false;
    if ((calFilters.outcome === 'Win' || calFilters.outcome === 'Loss') && t.outcome !== calFilters.outcome) return false;
    return true;
  };
  const monthTrades = trades.filter(t => t.date.startsWith(ym) && (!accFilter || t.account === accFilter) && _calMatchesFilters(t));
  const dayMap = groupTradesByDay(monthTrades, accSize);
  const { winDays, lossDays, beDays, wr } = calculateCalendarWinrate(dayMap);
  const tradingDays = Object.keys(dayMap);
  const totalTrades = monthTrades.length;
  const totalUSD = monthTrades.reduce((a, t) => a + toPnlDollars(t, accSize), 0);
  let bestDay = null, worstDay = null;
  Object.entries(dayMap).forEach(([date, d]) => { if (!bestDay || d.totalPnlUSD > dayMap[bestDay].totalPnlUSD) bestDay = date; if (!worstDay || d.totalPnlUSD < dayMap[worstDay].totalPnlUSD) worstDay = date; });
  const kpiEl = document.getElementById('cal-kpi-row');
  const kpiEl2 = document.getElementById('cal-kpi-row-2');
  if (kpiEl || kpiEl2) {
    const dayName = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    const bestUSD = bestDay ? dayMap[bestDay].totalPnlUSD : 0;
    const worstUSD = worstDay ? dayMap[worstDay].totalPnlUSD : 0;
    const wrColor = wr >= 70 ? 'green' : wr >= 50 ? 'white' : 'red';
    const _kpiHtml = `<div class="cal-kpi"><div class="cal-kpi-label"><span class="cal-kpi-icon"><svg class="icn" aria-hidden="true"><use href="#ic-folder"></use></svg></span><span class="cal-kpi-text">Trades</span></div><div class="cal-kpi-val white">${totalTrades}<span style="font-size:10px;color:var(--text3);font-family:var(--font-body);margin-left:5px">${tradingDays.length}d</span></div></div><div class="cal-kpi"><div class="cal-kpi-label"><span class="cal-kpi-icon"><svg class="icn" aria-hidden="true"><use href="#ic-dollar-c"></use></svg></span><span class="cal-kpi-text">P&L</span></div><div class="cal-kpi-val ${totalUSD >= 0 ? 'green' : 'red'}">${fmtUSD(totalUSD)}</div></div><div class="cal-kpi"><div class="cal-kpi-label"><span class="cal-kpi-icon"><svg class="icn" aria-hidden="true"><use href="#ic-trend-up"></use></svg></span><span class="cal-kpi-text">Best${bestDay ? ' (' + dayName(bestDay) + ')' : ''}</span></div><div class="cal-kpi-val green">${bestDay ? fmtUSD(bestUSD) : '—'}</div></div><div class="cal-kpi"><div class="cal-kpi-label"><span class="cal-kpi-icon"><svg class="icn" aria-hidden="true"><use href="#ic-trend-down"></use></svg></span><span class="cal-kpi-text">Worst${worstDay ? ' (' + dayName(worstDay) + ')' : ''}</span></div><div class="cal-kpi-val ${worstUSD < 0 ? 'red' : 'green'}">${worstDay ? fmtUSD(worstUSD) : '—'}</div></div><div class="cal-kpi"><div class="cal-kpi-label"><span class="cal-kpi-icon"><svg class="icn" aria-hidden="true"><use href="#ic-target"></use></svg></span><span class="cal-kpi-text">Day Win Rate</span></div><div class="cal-kpi-val ${wrColor}">${wr}%</div><div class="cal-kpi-sub-row"><span class="cal-kpi-sub green">▲${winDays}W</span><span class="cal-kpi-sub red">▼${lossDays}L</span><span class="cal-kpi-sub"><svg class="icn" aria-hidden="true"><use href="#ic-dot"></use></svg>${beDays}BE</span></div></div>`;
    if (kpiEl) kpiEl.innerHTML = _kpiHtml;
    if (kpiEl2) kpiEl2.innerHTML = _kpiHtml;
  }

  // ── Calendar 2.0: central stats (used by analytics cards, insights, score) ──
  const calStats = computeCalMonthStats(monthTrades, dayMap, accSize);
  let prevM = calMonth - 1, prevY = calYear; if (prevM < 0) { prevM = 11; prevY--; }
  const prevYm = prevY + '-' + String(prevM + 1).padStart(2, '0');
  const prevMonthTrades = trades.filter(t => t.date.startsWith(prevYm) && (!accFilter || t.account === accFilter));
  const prevDayMap = groupTradesByDay(prevMonthTrades, accSize);
  const prevStats = computeCalMonthStats(prevMonthTrades, prevDayMap, accSize);
  window._calStats = calStats; window._calPrevStats = prevStats;

  // ── Standalone Calendar page: analytics cards + monthly stats pill ──
  renderCalAnalyticsCards(monthTrades, dayMap, totalUSD, winDays, lossDays, beDays, wr, tradingDays.length, accSize, calStats, prevStats);

  // ── Calendar 2.0: filter bar, view/heatmap tabs, monthly intelligence, trading score ──
  if (document.getElementById('cal2-insights') || document.getElementById('cal2-score')) {
    renderCalFilterBar();
    renderCalModeTabs();
    renderCalInsights(calStats, monthTrades);
    renderCalScore(calStats, prevStats);
    renderCalCoach(calStats);
    renderCalAgendaView(monthTrades, dayMap, accSize);
    const gridWrap = document.querySelector('#page-calendar .cal-grid-with-weeks');
    const agendaWrap = document.getElementById('cal2-agenda-wrap');
    if (gridWrap) gridWrap.style.display = calViewMode === 'agenda' ? 'none' : '';
    if (agendaWrap) agendaWrap.style.display = calViewMode === 'agenda' ? '' : 'none';
  }

  const daysEl = document.getElementById('cal-days');
  const daysEl2 = document.getElementById('cal-days-2');
  if (!daysEl && !daysEl2) return;
  const firstDay = new Date(calYear, calMonth, 1);
  let startDow = firstDay.getDay(); // 0=Sun-start baseline
  if (_weekStartsMonday) startDow = (startDow + 6) % 7; // shift so Monday=0 when that setting is chosen
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const today = localToday(); // use local timezone, not UTC (avoids off-by-one near midnight in WAT)
  let cells = [];
  for (let i = startDow - 1; i >= 0; i--) { const prevMonth = calMonth === 0 ? 12 : calMonth; const prevYear = calMonth === 0 ? calYear - 1 : calYear; cells.push({ day: daysInPrev - i, month: prevMonth, year: prevYear, current: false }); }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, month: calMonth + 1, year: calYear, current: true });
  let nextD = 1;
  // Pad only to the number of rows this month actually needs (4, 5, or 6) — never a trailing blank row
  const rowsNeeded = Math.ceil((startDow + daysInMonth) / 7);
  const targetCells = rowsNeeded * 7;
  while (cells.length < targetCells) { const nextMonth = calMonth === 11 ? 1 : calMonth + 2; const nextYear = calMonth === 11 ? calYear + 1 : calYear; cells.push({ day: nextD++, month: nextMonth, year: nextYear, current: false }); }
  // Normalization maxima for heatmap modes (full calendar page only)
  const _dayVals = Object.values(dayMap);
  const _maxAbsUSD = _dayVals.length ? Math.max(...(_dayVals.map(d => Math.abs(d.totalPnlUSD))), 1) : 1;
  const _maxTradeCount = _dayVals.length ? Math.max(...(_dayVals.map(d => d.trades.length)), 1) : 1;
  // ── Phase 8: Backtest Sessions on Calendar (Section 14) ──
  // date -> [sessions], built from the whole Lab (not month-scoped) so
  // prev/next-month edge cells on the grid still light up correctly.
  const btDayMap = {};
  (((typeof _blData !== 'undefined') && _blData.sessions) || []).forEach(sess => {
    if (!sess.date) return;
    (btDayMap[sess.date] = btDayMap[sess.date] || []).push(sess);
  });
  window._btDayMap = btDayMap;
  const _kzTag = kz => kz === 'London' ? 'LDN' : kz === 'New York' ? 'NY' : kz === 'Asian' ? 'ASN' : (kz || '').slice(0, 3).toUpperCase();
  const _kzCls = kz => kz === 'London' ? 'london' : kz === 'New York' ? 'ny' : kz === 'Asian' ? 'asian' : '';

  const _calDaysHTML_fn = (daysEl_target) => { if (!daysEl_target) return;
  const isFullPage = daysEl_target.id === 'cal-days-2';
  daysEl_target.innerHTML = cells.map(c => {
    const dateStr = c.year + '-' + String(c.month).padStart(2, '0') + '-' + String(c.day).padStart(2, '0');
    const isToday = dateStr === today; const dayData = dayMap[dateStr]; const hasTrades = !!dayData;
    const outcome = hasTrades ? calculateDailyOutcome(dayData.totalPnlUSD) : null;
    const btSessions = btDayMap[dateStr] || []; const hasBacktest = btSessions.length > 0;
    let cls = 'cal-day'; if (!c.current) cls += ' other-month'; if (isToday) cls += ' today';
    if (hasTrades) { cls += ' has-trades'; if (outcome === 'win') cls += ' win-day'; else if (outcome === 'loss') cls += ' loss-day'; else cls += ' mixed-day'; }
    if (hasBacktest) cls += ' has-backtest';
    const dayNumHTML = isToday ? `<div class="cal-day-num"><span class="cal-today-badge">${c.day}</span></div>` : `<div class="cal-day-num">${String(c.day).padStart(2, '0')}</div>`;
    let dotHTML = '', pnlHTML = '', countHTML = '', pairsHTML = '', metaHTML = '', heatStyle = '';
    if (hasTrades) {
      const dotColor = outcome === 'win' ? 'green' : outcome === 'loss' ? 'red' : 'blue'; dotHTML = `<div class="cal-day-dot ${dotColor}"></div>`;
      const usd = dayData.totalPnlUSD; const _calShowDollar = _pnlToggleMode === '$'; let _calPnlStr;
      if (_calShowDollar) { _calPnlStr = fmtUSD(usd); } else { const _calPct = dayData.trades.reduce((a,t)=>a+_pctOfTrade(t),0); _calPnlStr = (_calPct >= 0 ? '+' : '') + _calPct.toFixed(1) + '%'; }
      pnlHTML = `<div class="cal-day-pnl ${usd > 0 ? 'green' : usd < 0 ? 'red' : 'zero'}">${_calPnlStr}</div>`;
      countHTML = `<div class="cal-day-count">${dayData.trades.length} trade${dayData.trades.length > 1 ? 's' : ''}</div>`;
      const pairs = [...new Set(dayData.trades.map(t => t.pair))].join(', '); pairsHTML = `<div class="cal-day-pairs">${pairs}</div>`;

      if (isFullPage) {
        // Rich meta row: dominant session, avg R, rule-adherence check, mistake tag on loss days
        const sessCounts = {}; dayData.trades.forEach(t => { const k = t.kz || ''; sessCounts[k] = (sessCounts[k] || 0) + 1; });
        const domSess = Object.entries(sessCounts).sort((a, b) => b[1] - a[1])[0];
        const sessBadge = (domSess && domSess[0]) ? `<span class="cal2-day-sess ${_kzCls(domSess[0])}">${_kzTag(domSess[0])}</span>` : '';
        const rVals = dayData.trades.map(_calAchievedR).filter(v => v !== null);
        const avgDayR = rVals.length ? (rVals.reduce((a, b) => a + b, 0) / rVals.length) : null;
        const rBadge = avgDayR !== null ? `<span class="cal2-day-rr">${avgDayR >= 0 ? '+' : ''}${avgDayR.toFixed(1)}R</span>` : '';
        const followedN = dayData.trades.filter(_calFollowed).length;
        const ruleOk = followedN === dayData.trades.length;
        const ruleBadge = `<span class="cal2-day-rule ${ruleOk ? 'ok' : 'warn'}" title="${followedN}/${dayData.trades.length} followed plan"><svg class="icn" aria-hidden="true"><use href="#${ruleOk ? 'ic-check' : 'ic-warning'}"></use></svg></span>`;
        let mistakeBadge = '';
        if (outcome === 'loss') {
          const reasons = dayData.trades.filter(t => t.outcome === 'Loss' && t.lossReason).map(t => t.lossReason);
          if (reasons.length) mistakeBadge = `<span class="cal2-day-mistake" title="${reasons[0]}">${reasons[0]}</span>`;
        }
        metaHTML = `<div class="cal2-day-meta">${sessBadge}${rBadge}${ruleBadge}</div>${mistakeBadge ? `<div class="cal2-day-meta-2">${mistakeBadge}</div>` : ''}`;
      }

      if (isFullPage && calHeatMode !== 'off') {
        if (calHeatMode === 'profit') { const tone = usd >= 0 ? 'green' : 'red'; heatStyle = `background:${_calHeatColor(Math.abs(usd) / _maxAbsUSD, tone)} !important`; }
        else if (calHeatMode === 'trades') { heatStyle = `background:${_calHeatColor(dayData.trades.length / _maxTradeCount, 'blue')} !important`; }
        else if (calHeatMode === 'rules') { const frac = followedN_safe(dayData); const tone = frac >= 0.5 ? 'green' : 'red'; heatStyle = `background:${_calHeatColor(frac >= 0.5 ? frac : (1 - frac), tone)} !important`; }
        else if (calHeatMode === 'psych') { const avgR = dayData.trades.reduce((a, t) => a + (t.rating || 0), 0) / dayData.trades.length; heatStyle = `background:${_calHeatColor(avgR / 5, 'green')} !important`; }
      }
    }
    let clickAttr = '', hoverAttr = '';
    if (c.current) { if (hasTrades) { clickAttr = `onclick="openCalPopup(event,'${dateStr}')"`;  hoverAttr = `onmouseenter="showCalTooltip(event,window._dayMap&&window._dayMap['${dateStr}'],'${dateStr}',${accSize})" onmouseleave="hideCalTooltip()"`; } else { clickAttr = `onclick="closeCalPopup();openModal({date:'${dateStr}'})"` ; } }
    // Backtest session badge (Phase 8 / Section 14) — independent of live-trade state,
    // stops propagation so it never triggers the live-trade popup/add-trade modal underneath.
    let btBadgeHTML = '';
    if (c.current && hasBacktest) {
      btBadgeHTML = `<div class="cal-day-bt-badge" onclick="event.stopPropagation();_openBacktestDayDrilldown('${dateStr}')" title="${btSessions.length} backtest session${btSessions.length > 1 ? 's' : ''} logged this day"><svg class="icn" aria-hidden="true"><use href="#ic-flask"></use></svg>${btSessions.length > 1 ? `<span class="cal-day-bt-count">${btSessions.length}</span>` : ''}</div>`;
    }
    const styleAttr = heatStyle ? ` style="${heatStyle}"` : '';
    return `<div class="${cls}" ${clickAttr} ${hoverAttr}${styleAttr}>${dotHTML}${dayNumHTML}${pnlHTML}${countHTML}${pairsHTML}${metaHTML}${btBadgeHTML}</div>`;
  }).join(''); };
  function followedN_safe(dayData) { return dayData.trades.filter(_calFollowed).length / dayData.trades.length; }
  _calDaysHTML_fn(daysEl); _calDaysHTML_fn(daysEl2);
  renderCalWeekSidebar(cells, dayMap, accSize);
  window._dayMap = dayMap;
}

// ── Weekly summary sidebar (standalone Calendar page only) — full weekly performance reports ──
function renderCalWeekSidebar(cells, dayMap, accSize) {
  const col = document.getElementById('cal-week-col-2');
  if (!col) return;
  let html = '';
  for (let row = 0; row < cells.length; row += 7) {
    const weekCells = cells.slice(row, row + 7);
    let total = 0, totalPct = 0, activeDays = 0, weekTrades = [];
    let bestDay = null, worstDay = null;
    weekCells.forEach(c => {
      const dateStr = c.year + '-' + String(c.month).padStart(2, '0') + '-' + String(c.day).padStart(2, '0');
      const d = dayMap[dateStr];
      if (d) {
        total += d.totalPnlUSD; totalPct += d.trades.reduce((a, t) => a + _pctOfTrade(t), 0); activeDays++;
        weekTrades = weekTrades.concat(d.trades);
        if (!bestDay || d.totalPnlUSD > dayMap[bestDay].totalPnlUSD) bestDay = dateStr;
        if (!worstDay || d.totalPnlUSD < dayMap[worstDay].totalPnlUSD) worstDay = dateStr;
      }
    });
    const _weekIsDollar = (_pnlToggleMode === '$');
    const _weekVal = _weekIsDollar ? total : totalPct;
    const _weekDisplay = _weekIsDollar ? fmtUSD(total) : ((totalPct >= 0 ? '+' : '') + totalPct.toFixed(1) + '%');
    const cls = _weekVal > 0 ? 'green' : _weekVal < 0 ? 'red' : 'zero';

    if (!weekTrades.length) {
      html += `<div class="cal-week-card empty"><div class="cal-week-label">Week ${(row / 7) + 1}</div><div class="cal-week-pnl zero">+0.0%</div><div class="cal-week-days">0 days</div></div>`;
      continue;
    }
    const wStats = computeCalMonthStats(weekTrades, groupTradesByDay(weekTrades, accSize), accSize);
    const wGrade = computeCalScore(wStats).grade;
    const dayName = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    html += `<div class="cal-week-card cal2-week-report" onclick="this.classList.toggle('expanded')">
      <div class="cal2-week-top">
        <div class="cal-week-label">Week ${(row / 7) + 1}</div>
        <div class="cal2-week-grade" style="color:${_calGradeColor(wGrade)}">${wGrade}</div>
      </div>
      <div class="cal-week-pnl ${cls}">${_weekDisplay}</div>
      <div class="cal-week-days">${activeDays} day${activeDays === 1 ? '' : 's'} · ${weekTrades.length} trade${weekTrades.length === 1 ? '' : 's'}</div>
      <div class="cal2-week-stats">
        <div class="cal2-week-stat"><span class="k">Win rate</span><span class="v">${wStats.tradeWR.toFixed(0)}%</span></div>
        <div class="cal2-week-stat"><span class="k">Profit factor</span><span class="v">${wStats.profitFactor.toFixed(2)}</span></div>
        <div class="cal2-week-stat"><span class="k">Avg RR</span><span class="v">${wStats.avgRR !== null ? wStats.avgRR.toFixed(1) + 'R' : '—'}</span></div>
        ${bestDay ? `<div class="cal2-week-stat"><span class="k">Best day</span><span class="v green">${dayName(bestDay)}</span></div>` : ''}
      </div>
      <div class="cal2-week-expand-hint">Tap for details</div>
    </div>`;
  }
  col.innerHTML = html;
}

// ── SVG gauge helpers ──────────────────────────────
function _calCssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback || '#888';
  } catch (e) { return fallback || '#888'; }
}
function _calPolar(cx, cy, r, angle) { const rad = (angle - 180) * Math.PI / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; }
function _calArcPath(cx, cy, r, startAngle, endAngle) {
  if (endAngle <= startAngle) return '';
  const start = _calPolar(cx, cy, r, startAngle);
  const end = _calPolar(cx, cy, r, endAngle);
  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}
// Semicircle gauge with up to 3 weighted segments (green/blue/red) — colors must be resolved (hex/rgb), not var()
function _calSemiGauge(segments, size, trackColor) {
  size = size || 108;
  trackColor = trackColor || _calCssVar('--glass-3', 'rgba(255,255,255,0.12)');
  const cx = size / 2, cy = size / 2 + 2, r = size / 2 - 12, sw = 12;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let angle = 0, paths = '';
  segments.forEach(s => {
    if (s.value <= 0) return;
    const span = (s.value / total) * 180;
    paths += `<path d="${_calArcPath(cx, cy, r, angle, angle + span)}" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`;
    angle += span;
  });
  const track = `<path d="${_calArcPath(cx, cy, r, 0, 180)}" stroke="${trackColor}" stroke-width="${sw}" fill="none"/>`;
  return `<svg width="${size}" height="${size / 2 + 14}" viewBox="0 0 ${size} ${size / 2 + 14}">${track}${paths}</svg>`;
}
// Full ring gauge for a single fraction (0..1) — colors must be resolved (hex/rgb), not var()
function _calRingGauge(fraction, colorMain, colorRest, size) {
  size = size || 76; const cx = size / 2, cy = size / 2, r = size / 2 - 9, sw = 9;
  fraction = Math.max(0, Math.min(1, fraction));
  const circ = 2 * Math.PI * r;
  const mainLen = circ * fraction;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colorRest}" stroke-width="${sw}" fill="none"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colorMain}" stroke-width="${sw}" fill="none"
      stroke-dasharray="${mainLen.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"
      transform="rotate(-90 ${cx} ${cy})"/>
  </svg>`;
}

// ── Analytics cards (standalone Calendar page) ──────
function renderCalAnalyticsCards(monthTrades, dayMap, totalUSD, winDays, lossDays, beDays, dayWR, tradingDaysCount, accSize, calStats, prevStats) {
  const row1 = document.getElementById('cal-an-row1');
  const row2 = document.getElementById('cal-an-row2');
  const pillRow = document.getElementById('cal-stats-pill-2');
  if (!row1 && !row2 && !pillRow) return;

  const wins = monthTrades.filter(t => t.outcome === 'Win').length;
  const losses = monthTrades.filter(t => t.outcome === 'Loss').length;
  const bes = monthTrades.filter(t => t.outcome !== 'Win' && t.outcome !== 'Loss').length;
  const denom = wins + losses;
  const tradeWR = denom > 0 ? (wins / denom) * 100 : 0;

  let grossProfit = 0, grossLoss = 0, winSum = 0, lossSum = 0, winSumPct = 0, lossSumPct = 0;
  monthTrades.forEach(t => {
    const usd = toPnlDollars(t, accSize);
    const pct = accSize > 0 ? (usd / accSize) * 100 : 0;
    if (usd > 0) { grossProfit += usd; winSum += usd; winSumPct += pct; }
    else if (usd < 0) { grossLoss += Math.abs(usd); lossSum += Math.abs(usd); lossSumPct += Math.abs(pct); }
  });
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? grossProfit : 0);
  const pfFraction = (grossProfit + grossLoss) > 0 ? grossProfit / (grossProfit + grossLoss) : 0;
  const avgWin = wins > 0 ? winSum / wins : 0;
  const avgLoss = losses > 0 ? lossSum / losses : 0;
  const avgWinPct = wins > 0 ? winSumPct / wins : 0;
  const avgLossPct = losses > 0 ? lossSumPct / losses : 0;
  // Ratio is only meaningful once there's at least one losing trade to compare
  // against — otherwise it's undefined, not infinite, so show a dash instead.
  const avgRatio = losses > 0 ? (avgWin / avgLoss) : null;
  const barTotal = avgWin + avgLoss || 1;
  const winPct = (avgWin / barTotal) * 100;

  // Resolve actual color values (not var(...) strings) so gauges rasterize correctly on export
  const cGreen = _calCssVar('--green', '#34d399');
  const cRed   = _calCssVar('--red', '#f87171');
  const cBlue  = _calCssVar('--blue', '#60a5fa');

  const _calIsDollar  = (_pnlToggleMode === '$');
  const _calTotalPct  = monthTrades.reduce((a, t) => a + _pctOfTrade(t), 0);
  const _calNetVal     = _calIsDollar ? totalUSD : _calTotalPct;
  const _calNetDisplay = _calIsDollar ? fmtUSD(totalUSD) : ((_calTotalPct >= 0 ? '+' : '') + _calTotalPct.toFixed(1) + '%');

  if (row1) {
    const prevTotalUSD = prevStats ? (prevStats.grossProfit - prevStats.grossLoss) : 0;
    const momDelta = prevStats && prevStats.totalTrades ? (totalUSD - prevTotalUSD) : null;
    const momPct = (momDelta !== null && Math.abs(prevTotalUSD) > 0.001) ? (momDelta / Math.abs(prevTotalUSD)) * 100 : null;
    const avgPerDay = tradingDaysCount ? totalUSD / tradingDaysCount : 0;
    const streakTxt = calStats && calStats.curStreakType
      ? `${calStats.curStreakLen} ${calStats.curStreakType === 'win' ? 'winning' : calStats.curStreakType === 'loss' ? 'losing' : 'breakeven'} day${calStats.curStreakLen === 1 ? '' : 's'}`
      : '—';
    const streakDot = calStats && calStats.curStreakType === 'win' ? 'green' : calStats && calStats.curStreakType === 'loss' ? 'red' : 'blue';

    row1.innerHTML = `
      <div class="cal-an-card cal-an-card--toggle" onclick="toggleNetPnl()" title="Tap to toggle $ / %">
        <div class="cal-an-left">
          <div class="cal-an-label">Net P&amp;L <span class="info-dot">i</span> <span class="cal-an-toggle-hint">tap to toggle</span></div>
          <div class="cal-an-value ${_calNetVal >= 0 ? 'green' : 'red'}">${_calNetDisplay}</div>
          <div class="cal2-sub-row">
            ${momPct !== null ? `<span class="cal2-sub-chip ${momPct >= 0 ? 'green' : 'red'}">${momPct >= 0 ? '▲' : '▼'} ${Math.abs(momPct).toFixed(1)}% vs last mo.</span>` : `<span class="cal2-sub-chip muted">No prior month</span>`}
            <span class="cal2-sub-chip ${streakDot}"><span class="cal2-sub-dot ${streakDot}"></span>${streakTxt}</span>
            <span class="cal2-sub-chip muted">Avg/day ${fmtUSD(avgPerDay)}</span>
          </div>
        </div>
        <div class="cal-an-badge">${monthTrades.length}</div>
      </div>
      <div class="cal-an-card">
        <div class="cal-an-left">
          <div class="cal-an-label">Trade win % <span class="info-dot">i</span></div>
          <div class="cal-an-value">${tradeWR.toFixed(2)}%</div>
          <div class="cal2-sub-row">
            <span class="cal2-sub-chip muted">Long ${calStats.longWR !== null ? calStats.longWR.toFixed(0) + '%' : '—'}</span>
            <span class="cal2-sub-chip muted">Short ${calStats.shortWR !== null ? calStats.shortWR.toFixed(0) + '%' : '—'}</span>
            <span class="cal2-sub-chip muted">Avg RR ${calStats.avgRR !== null ? calStats.avgRR.toFixed(1) + 'R' : '—'}</span>
          </div>
        </div>
        <div class="cal-an-gauge-col">
          ${_calSemiGauge([{ value: wins, color: cGreen }, { value: bes, color: cBlue }, { value: losses, color: cRed }])}
          <div class="cal-an-gauge-legend">
            <span class="cal-an-legend-chip green">${wins}</span>
            <span class="cal-an-legend-chip blue">${bes}</span>
            <span class="cal-an-legend-chip red">${losses}</span>
          </div>
        </div>
      </div>
      <div class="cal-an-card">
        <div class="cal-an-left">
          <div class="cal-an-label">Profit factor <span class="info-dot">i</span></div>
          <div class="cal-an-value">${profitFactor.toFixed(2)}</div>
          <div class="cal2-sub-row">
            <span class="cal2-sub-chip green">GP ${fmtUSD(grossProfit)}</span>
            <span class="cal2-sub-chip red">GL ${fmtUSD(-grossLoss)}</span>
            <span class="cal2-sub-chip muted">Expectancy ${fmtUSD(calStats.expectancy)}</span>
          </div>
        </div>
        <div class="cal-an-ring-col">${_calRingGauge(pfFraction, cGreen, cRed)}</div>
      </div>`;
  }

  if (row2) {
    row2.innerHTML = `
      <div class="cal-an-card">
        <div class="cal-an-left">
          <div class="cal-an-label">Day win % <span class="info-dot">i</span></div>
          <div class="cal-an-value">${dayWR.toFixed(2)}%</div>
          <div class="cal2-sub-row">
            <span class="cal2-sub-chip green">Best streak ${calStats.longestWinStreak}d</span>
            <span class="cal2-sub-chip red">Worst streak ${calStats.longestLossStreak}d</span>
            <span class="cal2-sub-chip muted">Consistency ${calStats.consistency}%</span>
          </div>
        </div>
        <div class="cal-an-gauge-col">
          ${_calSemiGauge([{ value: winDays, color: cGreen }, { value: beDays, color: cBlue }, { value: lossDays, color: cRed }])}
          <div class="cal-an-gauge-legend">
            <span class="cal-an-legend-chip green">${winDays}</span>
            <span class="cal-an-legend-chip blue">${beDays}</span>
            <span class="cal-an-legend-chip red">${lossDays}</span>
          </div>
        </div>
      </div>
      <div class="cal-an-card">
        <div class="cal-an-left" style="flex:0 0 auto">
          <div class="cal-an-label">Avg win/loss trade <span class="info-dot">i</span></div>
          <div class="cal-an-value"${avgRatio === null ? ' title="No losing trades logged yet — ratio unavailable"' : ''}>${avgRatio === null ? '—' : avgRatio.toFixed(2) + 'x'}</div>
        </div>
        <div class="cal-an-bar-wrap">
          <div class="cal-an-bar-track">
            <div class="cal-an-bar-seg green" style="width:${winPct.toFixed(1)}%"></div>
            <div class="cal-an-bar-seg red" style="width:${(100 - winPct).toFixed(1)}%"></div>
          </div>
          <div class="cal-an-bar-labels">
            <span class="cal-an-bar-stat">
              <span class="cal-an-bar-main green">${(avgWinPct >= 0 ? '+' : '') + avgWinPct.toFixed(2)}%</span>
              <span class="cal-an-bar-sub">${fmtUSD(avgWin)}</span>
            </span>
            <span class="cal-an-bar-stat right">
              <span class="cal-an-bar-main red">-${avgLossPct.toFixed(2)}%</span>
              <span class="cal-an-bar-sub">${fmtUSD(-avgLoss)}</span>
            </span>
          </div>
          <div class="cal2-sub-row">
            <span class="cal2-sub-chip muted">Avg RR ${calStats.avgRR !== null ? calStats.avgRR.toFixed(1) + 'R' : '—'}</span>
            <span class="cal2-sub-chip muted">Largest RR ${calStats.largestRR !== null ? calStats.largestRR.toFixed(1) + 'R' : '—'}</span>
            <span class="cal2-sub-chip muted">Median RR ${calStats.medianRR !== null ? calStats.medianRR.toFixed(1) + 'R' : '—'}</span>
          </div>
        </div>
      </div>`;
  }

  if (pillRow) {
    pillRow.innerHTML = `<span class="lbl">Monthly stats:</span> <span class="cal-pill ${_calNetVal >= 0 ? 'green' : ''}">${_calNetDisplay}</span> <span class="cal-pill">${tradingDaysCount} day${tradingDaysCount === 1 ? '' : 's'}</span>`;
  }
}

function calGoToday() { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); renderCalendar(); }

// ── Calendar Settings modal ─────────────────────────
function openCalSettings() {
  const overlay = document.getElementById('cal-settings-overlay');
  if (!overlay) return;
  const curSel = document.getElementById('cs-currency');
  const wsSel  = document.getElementById('cs-weekstart');
  const accInp = document.getElementById('cs-accsize');
  if (curSel) curSel.value = (_profileData && _profileData.currency) || '% (Percentage)';
  if (wsSel)  wsSel.value  = (_profileData && _profileData.weekstart) || 'Sunday';
  if (accInp) accInp.value = getAccSize();
  overlay.style.display = 'flex';
}
function closeCalSettings() {
  const overlay = document.getElementById('cal-settings-overlay');
  if (overlay) overlay.style.display = 'none';
}
async function saveCalSettings() {
  const curSel = document.getElementById('cs-currency');
  const wsSel  = document.getElementById('cs-weekstart');
  const accInp = document.getElementById('cs-accsize');
  if (curSel && typeof _pfLiveUpdate === 'function') _pfLiveUpdate('currency', curSel.value);
  if (wsSel  && typeof _pfLiveUpdate === 'function') _pfLiveUpdate('weekstart', wsSel.value);
  if (accInp) {
    const v = parseFloat(accInp.value) || 5000;
    ['cal-acc-size', 'cal-acc-size-2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = v; });
  }
  renderCalendar();
  if (typeof _profileSave === 'function') { try { await _profileSave(); } catch (e) { console.error('Calendar settings save failed:', e); } }
  showToast('Calendar settings saved ✓', 'success');
  closeCalSettings();
}

function calExportImage() {
  const pageEl   = document.getElementById('page-calendar');
  const scrollEl = document.querySelector('#page-calendar .cal-page-scroll');
  if (!pageEl || !scrollEl) { showToast('Nothing to export', 'danger'); return; }
  showToast('Generating image…', 'info');
  _smEnsureLibs(() => {
    // Temporarily disable the internal scroll clipping so the FULL calendar
    // (every analytics card + every week row) is captured, not just what's on screen.
    const prevPageOverflow   = pageEl.style.overflow;
    const prevPageHeight     = pageEl.style.height;
    const prevScrollMinHeight = scrollEl.style.minHeight;
    const prevScrollHeight    = scrollEl.style.height;
    pageEl.style.overflow    = 'visible';
    pageEl.style.height      = 'auto';
    scrollEl.style.minHeight = 'auto';
    scrollEl.style.height    = 'auto';

    const bg      = _calCssVar('--bg', '#080b12');
    const text    = _calCssVar('--text', '#f8fafc');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    // Solid, opaque stand-ins for the translucent "glass" surfaces. html2canvas
    // doesn't support backdrop-filter, so any panel that relies on blur-behind
    // to look right renders as a flat, washed-out grey slab instead — this
    // swaps those panels to a real solid colour before capture.
    const rowBg  = isLight ? '#eef1f6' : '#11151f';
    const cardBg = isLight ? '#f5f7fa' : '#0d1119';

    // Same pre-baked logo PNGs the share-card export uses — a real <img src="logo.svg">
    // is unreliable inside html2canvas (file:// / CORS / SVG quirks), so we swap in a
    // baked bitmap that's guaranteed to render, already matched to the active theme.
    const brandLogo = isLight ? _LOGO_LIGHT_B64 : _LOGO_DARK_B64;
    const dim        = _calCssVar('--text3', '#8b94a7');
    const stampLabel = formatUserDateTime(new Date(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    html2canvas(scrollEl, {
      backgroundColor: bg,
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: scrollEl.scrollWidth,
      windowHeight: scrollEl.scrollHeight,
      onclone: (clonedDoc) => {
        // html2canvas can't render "background-clip:text" gradient labels — it paints the
        // gradient as a solid box instead. Flatten the month label to plain text for export.
        clonedDoc.querySelectorAll('.cal-month-label').forEach(el => {
          el.style.background = 'none';
          el.style.webkitBackgroundClip = 'initial';
          el.style.backgroundClip = 'initial';
          el.style.webkitTextFillColor = 'initial';
          el.style.color = text;
        });

        // Brand the export like a real report: a logo/title header up top and a
        // subtle site-credit footer at the bottom, both baked into the image itself
        // and matched to whichever theme (dark/light) was active when exporting.
        const clonedScroll = clonedDoc.querySelector('#page-calendar .cal-page-scroll');
        if (clonedScroll) {
          clonedScroll.style.padding = '22px 26px 18px';
          clonedScroll.style.background = bg;

          const header = clonedDoc.createElement('div');
          header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;';
          header.innerHTML =
            '<img src="' + brandLogo + '" style="height:52px;width:auto;display:block;">' +
            '<div style="font-size:13px;color:' + dim + ';white-space:nowrap;">Exported ' + stampLabel + '</div>';

          const footer = clonedDoc.createElement('div');
          footer.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;padding-top:14px;opacity:.9;';
          footer.innerHTML =
            '<img src="' + brandLogo + '" style="height:24px;width:auto;display:block;">' +
            '<span style="font-size:12px;color:' + dim + ';">nxtgencharts.site</span>';

          clonedScroll.insertBefore(header, clonedScroll.firstChild);
          clonedScroll.appendChild(footer);
        }

        // html2canvas has no support for backdrop-filter (used everywhere for the
        // "frosted glass" panels) and only partial support for inset box-shadows
        // and decorative gradient pseudo-elements. Left alone, these render as
        // dull grey rectangles stamped over the header row, the grid, and the
        // week-total cards. Flatten all of it to solid colours for the export
        // only — the on-screen UI is untouched since this only edits the clone.
        const style = clonedDoc.createElement('style');
        style.textContent = `
          #page-calendar .cal-page-scroll * {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          #page-calendar .cal-grid-wrap::before,
          #page-calendar .cal-grid-wrap::after {
            display: none !important;
            content: none !important;
          }
          #page-calendar .cal-grid-wrap {
            background: ${cardBg} !important;
            box-shadow: none !important;
          }
          #page-calendar .cal-dow-row {
            background: ${rowBg} !important;
          }
          #page-calendar .cal-week-card,
          #page-calendar .cal-kpi,
          #page-calendar .cal-an-card {
            background: ${cardBg} !important;
            box-shadow: none !important;
          }
          #page-calendar .cal-nav {
            background: ${cardBg} !important;
            box-shadow: none !important;
            color: ${text} !important;
          }
          #page-calendar .form-select,
          #page-calendar .acc-size-input {
            background: ${cardBg} !important;
            box-shadow: none !important;
          }
          #page-calendar .cal-week-days {
            background: ${rowBg} !important;
          }
          #page-calendar .cal-day-count,
          #page-calendar .cal-day-pairs {
            display: block !important;
          }
          #page-calendar .cal-page-scroll {
            overflow: visible !important;
          }
          #page-calendar .cal-page-scroll ::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        `;
        clonedDoc.head.appendChild(style);
      },
    }).then(canvas => {
      // Composite onto a fixed-width, high-resolution canvas instead of shipping the
      // raw content-sized capture — keeps every export a consistent, non-square,
      // landscape frame regardless of how tall the calendar happens to be that month.
      // Width is pinned exactly to the target; height is allowed to grow past the
      // target only if a month's content genuinely needs more room, so no week row
      // or analytics card is ever cropped or squished to force a fit.
      const TARGET_W = 2910;
      const TARGET_H = 1898;
      const fitScale = TARGET_W / canvas.width;
      const drawW = TARGET_W;
      const drawH = canvas.height * fitScale;
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = TARGET_W;
      outCanvas.height = Math.max(TARGET_H, Math.round(drawH));
      const ctx = outCanvas.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
      const dy = Math.max(0, (outCanvas.height - drawH) / 2);
      ctx.drawImage(canvas, 0, dy, drawW, drawH);

      const link = document.createElement('a');
      link.download = 'NxTGen_Calendar_' + MONTH_NAMES_LONG[calMonth] + '_' + calYear + '.png';
      link.href = outCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Calendar image saved!', 'success');
    }).catch(err => {
      console.error('Calendar export failed:', err);
      showToast('Export failed — ' + (err && err.message ? err.message : 'please try again'), 'danger');
    }).finally(() => {
      pageEl.style.overflow    = prevPageOverflow;
      pageEl.style.height      = prevPageHeight;
      scrollEl.style.minHeight = prevScrollMinHeight;
      scrollEl.style.height    = prevScrollHeight;
    });
  });
}

function openCalPopup(e, dateStr) {
  e.stopPropagation();
  const accFilter = getCalFilter();
  const accSize   = getAccSize();
  const dayTrades = trades.filter(t => t.date === dateStr && (!accFilter || t.account === accFilter));
  if (!dayTrades.length) return;

  const totalUSD = dayTrades.reduce((a, t) => a + toPnlDollars(t, accSize), 0);
  const wins     = dayTrades.filter(t => t.outcome === 'Win').length;
  const losses   = dayTrades.filter(t => t.outcome === 'Loss').length;
  const outcome  = calculateDailyOutcome(totalUSD);
  const outColor = outcome === 'win' ? 'var(--green)' : outcome === 'loss' ? 'var(--red)' : 'var(--blue)';
  const outLabel = outcome === 'win' ? 'Winning Day ▲' : outcome === 'loss' ? 'Losing Day ▼' : 'Breakeven Day <svg class="icn" aria-hidden="true"><use href="#ic-dot"></use></svg>';
  const dt       = new Date(dateStr + 'T12:00:00');
  const dateLabel = dt.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  const tradeRows = dayTrades.map(t => {
    const pnlUSD = toPnlDollars(t, accSize);
    const pnlC   = pnlUSD > 0 ? 'var(--green)' : pnlUSD < 0 ? 'var(--red)' : 'var(--blue)';
    const icon   = t.outcome === 'Win' ? '<svg class="icn icn-green" aria-hidden="true"><use href="#ic-check-c"></use></svg>' : t.outcome === 'Loss' ? '<svg class="icn icn-red" aria-hidden="true"><use href="#ic-close-c"></use></svg>' : '<svg class="icn" aria-hidden="true"><use href="#ic-minus"></use></svg>';
    return '<div class="cal-popup-trade" onclick="closeCalPopup();openDetail(' + t.id + ')">'
      + '<div style="font-size:16px">' + icon + '</div>'
      + '<div class="cal-popup-pair">' + t.pair + '</div>'
      + '<div class="cal-popup-meta">' + t.pos + ' · ' + t.rr + ' · ' + (t.kz || '—') + '</div>'
      + '<div class="cal-popup-pnl" style="color:' + pnlC + '">' + fmtUSD(pnlUSD) + '</div>'
      + '</div>';
  }).join('');

  const sumColor = totalUSD >= 0 ? 'var(--green)' : 'var(--red)';

  const popup = document.getElementById('cal-popup');
  popup.innerHTML =
    '<div class="cal-popup-head">'
      + '<div>'
        + '<div class="cal-popup-date">' + dateLabel + '</div>'
        + '<div style="font-size:11px;color:' + outColor + ';font-weight:600;margin-top:2px">' + outLabel + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center">'
        + '<button onclick="closeCalPopup();openModal({date:\'' + dateStr + '\'})" style="font-size:11px;padding:4px 9px;border-radius:var(--r-sm);background:var(--blue-dim);border:1px solid rgba(96,165,250,.3);color:var(--blue);cursor:pointer">+ Add</button>'
        + '<button class="cal-popup-close" onclick="closeCalPopup()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>'
      + '</div>'
    + '</div>'
    + tradeRows
    + '<div class="cal-popup-sum">'
      + '<span>' + dayTrades.length + ' trade' + (dayTrades.length > 1 ? 's' : '')
        + ' · <span style="color:var(--green)">' + wins + 'W</span>'
        + ' / <span style="color:var(--red)">' + losses + 'L</span></span>'
      + '<span style="font-family:var(--font-mono);font-weight:700;color:' + sumColor + '">' + fmtUSD(totalUSD) + '</span>'
    + '</div>';

  const x = Math.min(e.clientX + 12, window.innerWidth  - 356);
  const y = Math.min(e.clientY + 12, window.innerHeight - 320);
  popup.style.left    = x + 'px';
  popup.style.top     = y + 'px';
  popup.style.display = 'block';
}
function closeCalPopup() { document.getElementById('cal-popup').style.display = 'none'; }
document.addEventListener('click', e => { const p = document.getElementById('cal-popup'); if (p && !p.contains(e.target)) closeCalPopup(); });

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 8: Calendar Drill-Down (Section 14)
// Every backtest session's `date` puts it on the Calendar (see the
// flask badge added in renderCalendar's cell loop). Clicking that
// badge opens this modal: one card per session that day, its mini
// stat line, a peek at the trades logged, and one-click jumps into
// the full Session Detail view or straight into Chart Replay.
// ═══════════════════════════════════════════════════
function _openBacktestDayDrilldown(dateStr) {
  const sessions = ((typeof _blData !== 'undefined') && _blData.sessions || []).filter(s => s.date === dateStr);
  if (!sessions.length) return;

  const existing = document.getElementById('bt-day-drilldown-overlay');
  if (existing) existing.remove();

  const dt = new Date(dateStr + 'T12:00:00');
  const dateLabel = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const rows = sessions.map(s => {
    const strategy = s.strategyId ? _blGetById(s.strategyId) : null;
    const sTrades = _btTradesForSession(s.id).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));
    const stats = _btComputeStats(sTrades, Number(s.startingBalance) || 0);
    const metaParts = [s.pair, s.timeframe, strategy ? strategy.name : null].filter(Boolean).join(' · ');

    const tradeChips = sTrades.length
      ? `<div class="bt-day-trade-list">${sTrades.slice(0, 8).map(t => {
          const pnl = Number(t.pnl) || 0;
          const cls = pnl > 0 ? 'green' : pnl < 0 ? 'red' : 'blue';
          const rrLabel = (t.rr !== null && t.rr !== undefined && t.rr !== '') ? Number(t.rr).toFixed(1) + 'R' : '—';
          return `<div class="bt-day-trade-chip ${cls}" onclick="event.stopPropagation();document.getElementById('bt-day-drilldown-overlay').remove();_openSessionDetail('${s.id}')" title="${t.direction || ''} · ${rrLabel}">${t.direction === 'short' ? '▼' : '▲'} ${rrLabel}</div>`;
        }).join('')}${sTrades.length > 8 ? `<div class="bt-day-trade-chip muted">+${sTrades.length - 8} more</div>` : ''}</div>`
      : `<div class="acc-mgr-empty" style="padding:6px 0;text-align:left">No trades logged yet for this session.</div>`;

    return `
    <div class="bt-day-session-row">
      <div class="bt-day-session-head">
        <div style="min-width:0">
          <div class="bt-day-session-title">${s.name || 'Untitled Session'}</div>
          <div class="bt-day-session-meta">${metaParts || 'No details set'}</div>
        </div>
        <span class="bt-status-pill bt-status-${s.status}">${s.status}</span>
      </div>
      <div class="bl-stat-grid">
        ${_blStatCell('Trades', stats.totalTests || null)}
        ${_blStatCell('Win Rate', stats.winRate, '%')}
        ${_blStatCell('Net', stats.netReturn)}
      </div>
      ${tradeChips}
      <div class="bl-card-actions" style="margin-top:2px">
        <button class="wl-week-btn" onclick="document.getElementById('bt-day-drilldown-overlay').remove();_openSessionDetail('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-folder-open"></use></svg> Open Session</button>
        <button class="wl-week-btn" onclick="document.getElementById('bt-day-drilldown-overlay').remove();_repOpen('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-chart-line"></use></svg> Chart Replay</button>
      </div>
    </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.id = 'bt-day-drilldown-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal bt-day-drilldown-modal">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-flask"></use></svg> ${dateLabel}</span>
      <button onclick="document.getElementById('bt-day-drilldown-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">
      <div style="font-size:11px;color:var(--text3)">${sessions.length} backtest session${sessions.length > 1 ? 's' : ''} logged this day</div>
      ${rows}
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

