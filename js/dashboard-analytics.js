// ══ NxTGen Journal — dashboard-analytics.js (original app.js lines 12695-13726) ══

// ── KPIs ─────────────────────────────────────────────
function updateKPIs() {
  const trades = _getFilteredTrades(); // use date-filtered trades for all KPI calculations
  const total = trades.length;
  const wins = trades.filter(t => t.outcome === 'Win').length;
  const losses = trades.filter(t => t.outcome === 'Loss').length;
  const wr = total ? ((wins / total) * 100).toFixed(1) : 0;
  // Compute dollar PnL per trade using its own account size for correct avg win/loss
  const tradeDollars = trades.map(t => toPnlDollars(t, getAccSizeForAccount(t.account)));
  const netDollars   = tradeDollars.reduce((a, b) => a + b, 0);
  const winDollars   = tradeDollars.filter((d, i) => trades[i].pnl > 0);
  const lossDollars  = tradeDollars.filter((d, i) => trades[i].pnl < 0);
  const avgWDollars  = winDollars.length  ? winDollars.reduce((a, b) => a + b, 0)  / winDollars.length  : 0;
  const avgLDollars  = lossDollars.length ? lossDollars.reduce((a, b) => a + b, 0) / lossDollars.length : 0;
  const pf = lossDollars.length ? Math.abs(winDollars.reduce((a, b) => a + b, 0) / lossDollars.reduce((a, b) => a + b, 0)).toFixed(2) : '∞';
  // Format: prefer % if all trades are % unit, else show $
  const allPct = trades.every(t => !_isMt5Trade(t) && t.pnlUnit !== '$');
  const fmtKpi = (dollars, accSz) => {
    if (allPct && accSz > 0) { const pct = (dollars / accSz) * 100; return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'; }
    return (dollars >= 0 ? '+$' : '-$') + Math.abs(dollars).toFixed(2);
  };
  // For headline KPIs, use a blended accSize (avg of all known account sizes weighted by trade count)
  const accs = _getCustomAccounts ? _getCustomAccounts() : [];
  let blendedAccSize = 0;
  if (accs.length) {
    let totalW = 0;
    accs.forEach(a => { const n = trades.filter(t => t.account === a.name).length; const sz = parseFloat(a.size) || 0; if (sz > 0 && n > 0) { blendedAccSize += sz * n; totalW += n; } });
    if (totalW > 0) blendedAccSize = blendedAccSize / totalW;
  }
  // Net PnL — toggle-aware: compute both $ and % correctly.
  // $ = sum of each trade converted to dollars via its own account size.
  // % = sum of each trade converted to % via its own account size
  //     (MT5/$ trades: dollars → % = (val/accSize)*100; manual % trades: use val directly).
  const _totalDollars = trades.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
  const _totalPct = trades.reduce((a, t) => a + _pctOfTrade(t), 0);
  const _sym = _currencySymbol();
  const _netDollarFmt = (_totalDollars >= 0 ? '+' : '-') + _sym + Math.abs(_totalDollars).toFixed(2);
  const _netPctFmt    = (_totalPct >= 0 ? '+' : '') + _totalPct.toFixed(1) + '%';
  // _pnlToggleMode: '%' (default) | '$' — cycled by toggleNetPnl()
  const _showDollar   = (_pnlToggleMode === '$');
  const netPnlDisplay = _showDollar ? _netDollarFmt : _netPctFmt;
  const netPnl        = _showDollar ? _totalDollars.toFixed(1) : _totalPct.toFixed(1);
  // Store both values + signs on the element for zero-cost toggling
  const _pnlEl = document.getElementById('kpi-pnl');
  if (_pnlEl) {
    _pnlEl.dataset.dollar    = _netDollarFmt;
    _pnlEl.dataset.pct       = _netPctFmt;
    _pnlEl.dataset.dollarPos = _totalDollars >= 0 ? '1' : '0';
    _pnlEl.dataset.pctPos    = _totalPct    >= 0 ? '1' : '0';
  }
  // Set correct colour class on load (not just on toggle)
  const _pnlValueEl = document.getElementById('kpi-pnl');
  if (_pnlValueEl) {
    const _isPos = _showDollar ? (_totalDollars >= 0) : (_totalPct >= 0);
    _pnlValueEl.className = 'cal-an-value ' + (_isPos ? 'green' : 'red');
  }
  const rrNums = trades.map(t => _parseRR(t.rr)).filter(x => x !== null);
  const avgRR = rrNums.length ? (rrNums.reduce((a, b) => a + b, 0) / rrNums.length).toFixed(1) : null;
  // Trades are stored newest-added-first (unshift), so reverse to oldest-added-first
  // BEFORE the stable date sort — otherwise same-day trades keep reverse-entry order,
  // which can scramble win/loss sequencing and produce a misleading streak count.
  const sorted = [...trades].reverse().sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0, maxStreak = 0, curStreak = 0;
  sorted.forEach(t => { if (t.outcome === 'Win') { curStreak++; if (curStreak > maxStreak) maxStreak = curStreak; } else curStreak = 0; });
  const rev = [...sorted].reverse();
  for (const t of rev) { if (t.outcome === 'Win') streak++; else break; }
  document.getElementById('kpi-total').textContent = total;
  document.getElementById('kpi-wr').textContent = wr + '%';
  document.getElementById('kpi-pnl').textContent = netPnlDisplay;
  document.getElementById('kpi-pf').textContent = pf + 'x';
  // AVG WIN / AVG LOSS — use same % conversion as Net PnL (handles MT5 dollar trades properly)
  // Note: _pctOfTrade is a global helper defined near buildPairTable
  const _winPcts  = trades.filter(t => _pctOfTrade(t) > 0).map(_pctOfTrade);
  const _lossPcts = trades.filter(t => _pctOfTrade(t) < 0).map(_pctOfTrade);
  const _avgWPct  = _winPcts.length  ? _winPcts.reduce((a, b) => a + b, 0)  / _winPcts.length  : 0;
  const _avgLPct  = _lossPcts.length ? _lossPcts.reduce((a, b) => a + b, 0) / _lossPcts.length : 0;
  const _avgWPctFmt = (_avgWPct >= 0 ? '+' : '') + _avgWPct.toFixed(2) + '%';
  const _avgLPctFmt = _avgLPct.toFixed(2) + '%';
  const _awEl = document.getElementById('kpi-aw');
  const _alEl = document.getElementById('kpi-al');
  if (_awEl) _awEl.textContent = _avgWPctFmt;
  if (_alEl) _alEl.textContent = _avgLPctFmt;
  const rrEl = document.getElementById('kpi-rr'); if (rrEl) rrEl.textContent = avgRR ? '1:' + avgRR : '—';
  const wsEl = document.getElementById('kpi-ws'); if (wsEl) wsEl.innerHTML = streak > 0 ? streak + '<svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg> (best:' + maxStreak + ')' : maxStreak ? '0 (best:' + maxStreak + ')' : '0';

  // ── Max Drawdown — peak-to-trough on cumulative % equity curve ──
  const _ddSorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let _ddCum = 0, _ddPeak = 0, _maxDD = 0;
  _ddSorted.forEach(t => {
    _ddCum += _pctOfTrade(t);
    if (_ddCum > _ddPeak) _ddPeak = _ddCum;
    const dd = _ddPeak - _ddCum;
    if (dd > _maxDD) _maxDD = dd;
  });
  const ddEl = document.getElementById('kpi-dd');
  if (ddEl) {
    ddEl.textContent = _maxDD > 0 ? '-' + _maxDD.toFixed(1) + '%' : '0.0%';
    ddEl.className = 'kpi-value ' + (_maxDD > 5 ? 'red' : _maxDD > 2 ? 'gold' : 'green');
  }

  // ── Expectancy (for PF card toggle) ──
  const _expPct = _winPcts.length && _lossPcts.length
    ? (_avgWPct * (_winPcts.length / trades.length)) + (_avgLPct * (_lossPcts.length / trades.length))
    : 0;
  const pfEl = document.getElementById('kpi-pf');
  const expEl = document.getElementById('kpi-exp');
  if (pfEl) pfEl.dataset.pf  = pf + 'x';
  if (pfEl) pfEl.dataset.exp = (_expPct >= 0 ? '+' : '') + _expPct.toFixed(2) + '%';
  if (expEl) { expEl.dataset.pf = pf + 'x'; expEl.dataset.exp = pfEl?.dataset.exp || ''; }

  // ── Shape analytics — same gauge components as the Calendar page ──
  const _dashBadgeEl = document.getElementById('kpi-total-badge');
  if (_dashBadgeEl) _dashBadgeEl.textContent = total;

  const _dCGreen = _calCssVar('--green', '#34d399');
  const _dCRed   = _calCssVar('--red', '#f87171');
  const _dCBlue  = _calCssVar('--blue', '#60a5fa');
  const bes = Math.max(0, total - wins - losses);

  const _wrGaugeEl = document.getElementById('kpi-wr-gauge');
  if (_wrGaugeEl) {
    _wrGaugeEl.innerHTML = _calSemiGauge([
      { value: wins,   color: _dCGreen },
      { value: bes,    color: _dCBlue },
      { value: losses, color: _dCRed }
    ]) + `<div class="cal-an-gauge-legend">
      <span class="cal-an-legend-chip green">${wins}</span>
      <span class="cal-an-legend-chip blue">${bes}</span>
      <span class="cal-an-legend-chip red">${losses}</span>
    </div>`;
  }

  const _grossProfit = winDollars.reduce((a, b) => a + b, 0);
  const _grossLoss   = Math.abs(lossDollars.reduce((a, b) => a + b, 0));
  const _pfFraction  = (_grossProfit + _grossLoss) > 0 ? _grossProfit / (_grossProfit + _grossLoss) : 0;
  const _pfRingEl = document.getElementById('kpi-pf-ring');
  if (_pfRingEl) {
    _pfRingEl.innerHTML = _calRingGauge(_pfFraction, _dCGreen, _dCRed);
    _pfRingEl.style.visibility = (typeof _pfMode !== 'undefined' && _pfMode === 'exp') ? 'hidden' : 'visible';
  }

  // ── Avg win/loss trade ──
  // The ratio + bar proportions are computed from the %-normalized values,
  // never raw dollars — raw dollar PnL isn't comparable trade-to-trade when
  // trades come from accounts of different sizes, so a $-based ratio can be
  // wildly different from, and more misleading than, the true size-adjusted
  // win/loss ratio. Both $ and % are always shown together below the bar so
  // nothing is hidden behind a toggle.
  const _awAbs = Math.abs(_avgWPct), _alAbs = Math.abs(_avgLPct);
  const _avgBarTotalPct = (_awAbs + _alAbs) || 1;
  const _avgWinPctBar = (_awAbs / _avgBarTotalPct) * 100;
  const _hasLosses = _lossPcts.length > 0;
  const _avgRatioEl = document.getElementById('kpi-avgratio');
  if (_hasLosses) {
    if (_avgRatioEl) { _avgRatioEl.textContent = (_awAbs / _alAbs).toFixed(2) + 'x'; _avgRatioEl.title = ''; }
  } else {
    // No losing trades logged yet — the ratio is undefined, not infinite.
    if (_avgRatioEl) { _avgRatioEl.textContent = '—'; _avgRatioEl.title = 'No losing trades logged yet — ratio unavailable'; }
  }
  const _awDollarFmt = fmtUSD(avgWDollars);
  const _alDollarFmt = fmtUSD(-Math.abs(avgLDollars));

  const _awBarEl = document.getElementById('kpi-aw-bar');
  const _alBarEl = document.getElementById('kpi-al-bar');
  const _awSubEl = document.getElementById('kpi-aw-sub');
  const _alSubEl = document.getElementById('kpi-al-sub');
  if (_awBarEl) _awBarEl.style.width = _avgWinPctBar.toFixed(1) + '%';
  if (_alBarEl) _alBarEl.style.width = (100 - _avgWinPctBar).toFixed(1) + '%';
  if (_awSubEl) _awSubEl.textContent = _awDollarFmt;
  if (_alSubEl) _alSubEl.textContent = _alDollarFmt;

  document.querySelectorAll('.kpi-value, .cal-an-value').forEach(el => { el.style.transform = 'scale(1.04)'; el.style.transition = 'transform 0.3s ease'; setTimeout(() => el.style.transform = '', 320); });

  // ── Equity sparkline in Net PnL card ──
  _drawSparkline();
  // ── New feature renders ──
  _renderConsistencyKPI(trades);
  _renderNxtScore(trades);
  _checkDailyLossLimit(trades);
  setTimeout(() => { _drawEquityCurve(); _renderHeatmap(trades); }, 50);
  const subEl = document.getElementById('dash-last-updated');
  if (subEl) { const now = formatUserDateTime(new Date(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); subEl.textContent = 'Last updated ' + now + ' ' + getUserTzOffsetLabel(); }

  // ── Dashboard insight bar — computed from this user's actual data ──
  const insightEl = document.getElementById('dash-insight-text');
  if (insightEl) {
    if (total < 5) {
      // New user / insufficient data
      insightEl.innerHTML = 'Log at least <strong>5 trades</strong> to unlock personalised insights about your edge, sessions, and setup quality.';
    } else {
      // Session win rates
      const sessions = ['London', 'New York', 'Asian'];
      const sessionStats = sessions.map(s => {
        const st = trades.filter(t => t.kz === s);
        const sw = st.filter(t => t.outcome === 'Win').length;
        return { name: s, n: st.length, wr: st.length ? (sw / st.length) * 100 : null };
      }).filter(s => s.n >= 3);
      sessionStats.sort((a, b) => b.wr - a.wr);
      const bestSession  = sessionStats[0] || null;
      const worstSession = sessionStats.length > 1 ? sessionStats[sessionStats.length - 1] : null;

      // Rating performance
      const ratingStats = [3, 4, 5].map(r => {
        const rt = trades.filter(t => t.rating === r);
        const rw = rt.filter(t => t.outcome === 'Win').length;
        const rpnl = rt.reduce((a, t) => a + _pnlPctValue(t), 0);
        return { r, n: rt.length, wr: rt.length ? (rw / rt.length) * 100 : null, avgPnl: rt.length ? rpnl / rt.length : null };
      }).filter(r => r.n >= 2);

      const parts = [];

      if (bestSession) {
        const bsWr = bestSession.wr.toFixed(1);
        let msg = `<strong>${bestSession.name}</strong> session is your strongest edge at <strong>${bsWr}%</strong> win rate`;
        if (worstSession && worstSession.wr < bestSession.wr - 15) {
          msg += ` — consider reducing <strong>${worstSession.name}</strong> exposure (${worstSession.wr.toFixed(1)}% win rate)`;
        }
        parts.push(msg);
      }

      // Rating insight — find where performance drops
      if (ratingStats.length >= 2) {
        const highRatings = ratingStats.filter(r => r.r >= 4);
        const lowRatings  = ratingStats.filter(r => r.r <= 3);
        if (highRatings.length && lowRatings.length) {
          const avgHighWr = highRatings.reduce((a, r) => a + r.wr, 0) / highRatings.length;
          const avgLowWr  = lowRatings.reduce((a, r) => a + r.wr, 0)  / lowRatings.length;
          if (avgHighWr - avgLowWr > 10) {
            const highLabels = highRatings.map(r => `<strong>${r.r}${icon('star',{cls:'icn-sm icn-gold'})}</strong>`).join(' and ');
            const diff = (avgHighWr - avgLowWr).toFixed(0);
            parts.push(`Only ${highLabels} setups → your data shows lower-rated trades underperform by ~${diff}% win rate`);
          }
        }
      }

      // Mental state insight — compare win rates by state
      const stateGroups = { Focused: [], Neutral: [], Distracted: [] };
      trades.forEach(t => {
        const st = t.emotion || 'Focused';
        const grp = stateGroups[st] || stateGroups['Focused'];
        grp.push(t);
      });
      const focusedWr = stateGroups.Focused.length >= 3 ? (stateGroups.Focused.filter(t => t.outcome === 'Win').length / stateGroups.Focused.length) * 100 : null;
      const distractedWr = stateGroups.Distracted.length >= 2 ? (stateGroups.Distracted.filter(t => t.outcome === 'Win').length / stateGroups.Distracted.length) * 100 : null;
      if (focusedWr !== null && distractedWr !== null && focusedWr - distractedWr > 15) {
        parts.push(`You win <strong>${(focusedWr - distractedWr).toFixed(0)}%</strong> more when Focused vs Distracted — mental state is costing you real trades`);
      }

      // Followed plan insight
      const planNo  = trades.filter(t => t.followedPlan === 'No');
      const planYes = trades.filter(t => t.followedPlan === 'Yes' || !t.followedPlan);
      if (planNo.length >= 2 && planYes.length >= 2) {
        const planNoWr  = (planNo.filter(t => t.outcome === 'Win').length  / planNo.length)  * 100;
        const planYesWr = (planYes.filter(t => t.outcome === 'Win').length / planYes.length) * 100;
        if (planYesWr - planNoWr > 15) {
          parts.push(`<strong>${planNo.length}</strong> trades where you broke your plan → ${planNoWr.toFixed(0)}% WR vs ${planYesWr.toFixed(0)}% when you followed it. Process discipline is your edge`);
        }
      }

      // Top loss reason
      const lossesWithReason = trades.filter(t => t.outcome === 'Loss' && t.lossReason);
      if (lossesWithReason.length >= 3) {
        const reasonCounts = {};
        lossesWithReason.forEach(t => { reasonCounts[t.lossReason] = (reasonCounts[t.lossReason] || 0) + 1; });
        const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
        const topPct = Math.round((topReason[1] / lossesWithReason.length) * 100);
        if (topPct >= 30) {
          parts.push(`<svg class="icn icn-red" aria-hidden="true"><use href="#ic-dot"></use></svg> Top loss cause: <strong>"${topReason[0]}"</strong> (${topPct}% of losses) — address this first`);
        }
      }

      if (parts.length === 0) {
        // Fallback: just show overall stats
        parts.push(`<strong>${total}</strong> trades logged · <strong>${wr}%</strong> win rate · Net <strong>${netPnl > 0 ? '+' : ''}${netPnl}%</strong> PnL — keep building your edge`);
      }

      insightEl.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    }
  }

  // ── Dashboard cover: period summary — respects "Dashboard Default View" setting ──
  const _dvMode = (_profileData.defaultview || 'Quarterly');
  const _cqYear = new Date().getFullYear();
  const _todayStr = localToday();
  let _cvFrom, _cvTo, _cvLabel, _cvTitle;
  if (_dvMode === 'Monthly') {
    const _cqM = new Date().getMonth();
    _cvFrom  = _cqYear + '-' + String(_cqM + 1).padStart(2, '0') + '-01';
    _cvTo    = _todayStr;
    _cvLabel = 'MONTHLY PERFORMANCE · ' + _cqYear;
    _cvTitle = MONTH_NAMES_LONG[_cqM] + ' ' + _cqYear;
  } else if (_dvMode === 'Weekly') {
    const _wd = _weekStartDate(new Date());
    _cvFrom  = _wd.getFullYear() + '-' + String(_wd.getMonth() + 1).padStart(2, '0') + '-' + String(_wd.getDate()).padStart(2, '0');
    _cvTo    = _todayStr;
    _cvLabel = 'WEEKLY PERFORMANCE · ' + _cqYear;
    _cvTitle = 'Week of ' + new Date(_cvFrom + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else {
    const _cqQ   = getQuarter(_todayStr);
    const qStart = [null, '01', '04', '07', '10'][_cqQ];
    _cvFrom  = _cqYear + '-' + qStart + '-01';
    _cvTo    = _todayStr;
    _cvLabel = 'QUARTERLY PERFORMANCE · ' + _cqYear;
    _cvTitle = 'Q' + _cqQ + ' ' + _cqYear + ' — ' + (Q_MONTHS[_cqQ] || '');
  }
  const _cqT   = trades.filter(t => t.date >= _cvFrom && t.date <= _cvTo);
  const _cqWins = _cqT.filter(t => t.outcome === 'Win').length;
  const _cqWr   = _cqT.length ? ((_cqWins / _cqT.length) * 100).toFixed(1) : '0.0';
  const _cqNetD = _cqT.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
  const _cqFmt  = fmtUSD(_cqNetD);
  const periodEl = document.getElementById('dash-cover-period');
  const titleEl  = document.getElementById('dash-cover-title');
  const subTextEl = document.getElementById('dash-cover-sub-text');
  if (periodEl) periodEl.textContent = _cvLabel;
  if (titleEl)  titleEl.textContent  = _cvTitle;
  if (subTextEl) subTextEl.textContent = _cqT.length
    ? _cqT.length + ' trades · Win rate ' + _cqWr + '% · Net PnL ' + _cqFmt
    : 'No trades yet this period — tap + New Trade to begin';

  if (typeof _blRenderDashboardWidgets === 'function') _blRenderDashboardWidgets();
}

// ── Dashboard date range filter ──────────────────────
function setDashPreset(preset, btn) {
  document.querySelectorAll('.dash-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const today = localToday();
  const d = new Date();
  if (preset === 'all')   { _dashFilter = { from: null, to: null, preset }; }
  else if (preset === 'week') {
    // Current calendar week, respecting the user's Week Starts On setting
    const wd = _weekStartDate(d);
    _dashFilter = { from: wd.getFullYear()+'-'+String(wd.getMonth()+1).padStart(2,'0')+'-'+String(wd.getDate()).padStart(2,'0'), to: today, preset };
  } else if (preset === 'month') {
    _dashFilter = { from: today.slice(0,7)+'-01', to: today, preset };
  } else if (preset === 'year') {
    _dashFilter = { from: today.slice(0,4)+'-01-01', to: today, preset };
  } else if (preset === 'quarter') {
    const q = getQuarter(today);
    const qStart = [null,'01','04','07','10'][q];
    _dashFilter = { from: today.slice(0,4)+'-'+qStart+'-01', to: today, preset };
  } else if (preset === 'custom') {
    const from = document.getElementById('dash-filter-from')?.value;
    const to   = document.getElementById('dash-filter-to')?.value;
    _dashFilter = { from: from||null, to: to||null, preset };
  }
  // Custom inputs visibility
  const cust = document.getElementById('dash-filter-custom');
  if (cust) cust.style.display = preset === 'custom' ? 'flex' : 'none';
  // Rebuild all dashboard views with filtered trades
  updateKPIs(); buildPairTable(); buildKillzoneTable(); buildStrategyTable(); buildMonthlyTable();
  _drawEquityCurve(); _renderHeatmap(_getFilteredTrades()); _renderConsistencyKPI(_getFilteredTrades()); _renderNxtScore(_getFilteredTrades()); _checkDailyLossLimit(trades);
}

// ── Profit Factor / Expectancy toggle ─────────────────
let _pfMode = 'pf'; // 'pf' | 'exp'
function togglePf() {
  _pfMode = _pfMode === 'pf' ? 'exp' : 'pf';
  const el = document.getElementById('kpi-pf');
  const card = document.getElementById('kpi-pf-card');
  if (!el) return;
  if (card) { card.classList.add('kpi-pnl-flipping'); setTimeout(() => card.classList.remove('kpi-pnl-flipping'), 300); }
  const lbl = document.getElementById('kpi-pf-label-text');
  if (_pfMode === 'exp') {
    if (lbl) lbl.textContent = 'Expectancy';
    el.textContent = el.dataset.exp || '—';
    const isPos = parseFloat(el.dataset.exp) >= 0;
    el.className = 'cal-an-value ' + (isPos ? 'green' : 'red');
  } else {
    if (lbl) lbl.textContent = 'Profit factor';
    el.textContent = el.dataset.pf || '—';
    el.className = 'cal-an-value gold';
  }
  // Ring gauge doesn't apply to Expectancy mode — hide/show accordingly
  const ring = document.getElementById('kpi-pf-ring');
  if (ring) ring.style.visibility = (_pfMode === 'exp') ? 'hidden' : 'visible';
}

// ── Equity sparkline ──────────────────────────────────
function _drawSparkline() {
  const canvas = document.getElementById('kpi-sparkline');
  if (!canvas) return;
  const sorted = [..._getFilteredTrades()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  const _pctOf = t => {
    const val = parseFloat(t.pnl) || 0;
    const sz  = getAccSizeForAccount(t.account);
    if (!_isMt5Trade(t) && t.pnlUnit !== '$') return val;
    if (sz > 0) return (toPnlDollars(t, sz) / sz) * 100;
    return 0;
  };
  let cum = 0;
  const points = [0, ...sorted.map(t => { cum += _pctOf(t); return cum; })];
  const W = canvas.offsetWidth || 180, H = canvas.offsetHeight || 36;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const px = (i) => (i / (points.length - 1)) * W;
  const py = (v) => H - ((v - min) / range) * (H - 4) - 2;
  const isPos = points[points.length - 1] >= 0;
  const col = isPos ? '#22c55e' : '#ef4444';
  // gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, isPos ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(px(0), py(points[0]));
  points.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.lineTo(px(points.length - 1), H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  // line
  ctx.beginPath();
  ctx.moveTo(px(0), py(points[0]));
  points.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ── Equity Curve (full chart on dashboard) ────────────────────────────────
function setEqMode(mode, btn) {
  _eqCurveMode = mode;
  document.querySelectorAll('#eq-btn-pct,#eq-btn-usd').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _drawEquityCurve();
}
function _drawEquityCurve() {
  const canvas = document.getElementById('equity-curve-canvas');
  const emptyEl = document.getElementById('equity-curve-empty');
  if (!canvas) return;
  const trades = _getFilteredTrades();
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';
  const useDollar = _eqCurveMode === 'usd';
  const _val = t => {
    if (useDollar) return toPnlDollars(t, getAccSizeForAccount(t.account));
    return _pctOfTrade(t);
  };
  let cum = 0;
  const points = [{ x: 0, y: 0, date: 'Start' }];
  sorted.forEach((t, i) => { cum += _val(t); points.push({ x: i + 1, y: cum, date: t.date, pair: t.pair, outcome: t.outcome }); });

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32 || 600;
  const H = 180;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const pad = { top: 16, right: 16, bottom: 28, left: 52 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const px = i => pad.left + (i / (points.length - 1)) * cW;
  const py = v => pad.top + cH - ((v - minY) / rangeY) * cH;

  // Zero line
  const zeroY = py(0);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + cW, zeroY);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

  // Y axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'right';
  [minY, (minY + maxY) / 2, maxY].forEach(v => {
    const label = useDollar ? (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0) : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    ctx.fillText(label, pad.left - 6, py(v) + 4);
  });

  // X axis date labels (first + last + midpoint)
  ctx.textAlign = 'center';
  [[0, points[0].date], [Math.floor(points.length / 2), points[Math.floor(points.length / 2)]?.date], [points.length - 1, points[points.length - 1].date]].forEach(([i, d]) => {
    if (d && d !== 'Start') ctx.fillText(d.slice(5), px(i), H - 6);
  });

  const isPos = points[points.length - 1].y >= 0;
  const colPos = '#22c55e', colNeg = '#ef4444';

  // Gradient fill — split at zero
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, isPos ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(px(0), py(points[0].y));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(px(i), py(p.y)); });
  ctx.lineTo(px(points.length - 1), py(0));
  ctx.lineTo(px(0), py(0));
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Main line — colour by segment
  for (let i = 1; i < points.length; i++) {
    ctx.beginPath();
    ctx.moveTo(px(i - 1), py(points[i - 1].y));
    ctx.lineTo(px(i), py(points[i].y));
    ctx.strokeStyle = points[i].outcome === 'Win' ? colPos : points[i].outcome === 'Loss' ? colNeg : '#60a5fa';
    ctx.lineWidth = 2; ctx.stroke();
  }

  // Dots on each trade
  points.forEach((p, i) => {
    if (i === 0) return;
    ctx.beginPath();
    ctx.arc(px(i), py(p.y), 3, 0, Math.PI * 2);
    ctx.fillStyle = p.outcome === 'Win' ? colPos : p.outcome === 'Loss' ? colNeg : '#60a5fa';
    ctx.fill();
  });

  // Current value label
  const last = points[points.length - 1];
  const lastLabel = useDollar ? (last.y >= 0 ? '+$' : '-$') + Math.abs(last.y).toFixed(2) : (last.y >= 0 ? '+' : '') + last.y.toFixed(2) + '%';
  ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = last.y >= 0 ? colPos : colNeg;
  ctx.fillText(lastLabel, px(points.length - 1) - 40, py(last.y) - 8);
}

// ── Consistency Score KPI ─────────────────────────────────────────────────
function _renderConsistencyKPI(trades) {
  const el = document.getElementById('kpi-consistency');
  const sub = document.getElementById('kpi-consistency-sub');
  if (!el) return;
  if (!trades.length) { el.textContent = '—'; if (sub) sub.textContent = ''; return; }
  const highQuality = trades.filter(t => (t.rating || 0) >= 4).length;
  const score = Math.round((highQuality / trades.length) * 100);
  el.textContent = score + '%';
  el.className = 'kpi-value ' + (score >= 80 ? 'green' : score >= 60 ? 'gold' : 'red');
  if (sub) {
    const streak = _calcConsistencyStreak(trades);
    sub.textContent = streak > 1 ? streak + ' quality trades in a row' : highQuality + '/' + trades.length + ' rated 4-star+';
  }
}
function _calcConsistencyStreak(trades) {
  const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const t of sorted) { if ((t.rating || 0) >= 4) streak++; else break; }
  return streak;
}

// ── NxTGen Score — composite triangle score (Win %, Profit Factor, Win/Loss ratio) ──
function _renderNxtScore(trades) {
  const wrap    = document.getElementById('nxt-score-tri-wrap');
  const valueEl = document.getElementById('nxt-score-value');
  if (!wrap || !valueEl) return;

  if (!trades.length) {
    valueEl.textContent = '—';
    wrap.innerHTML = _nxtTriangleSVG([0, 0, 0], ['Win %', 'Win/Loss', 'Profit factor']);
    return;
  }

  const total  = trades.length;
  const wins   = trades.filter(t => t.outcome === 'Win').length;
  const wr     = (wins / total) * 100;

  const tradeDollars = trades.map(t => toPnlDollars(t, getAccSizeForAccount(t.account)));
  const winD  = tradeDollars.filter((d, i) => trades[i].pnl > 0);
  const lossD = tradeDollars.filter((d, i) => trades[i].pnl < 0);
  const avgW  = winD.length  ? winD.reduce((a, b) => a + b, 0)  / winD.length  : 0;
  const avgL  = lossD.length ? Math.abs(lossD.reduce((a, b) => a + b, 0) / lossD.length) : 0;
  const pfNum = lossD.length ? Math.abs(winD.reduce((a, b) => a + b, 0)) / Math.abs(lossD.reduce((a, b) => a + b, 0)) : (winD.length ? 999 : 0);
  const rrRatio = avgL > 0 ? avgW / avgL : (avgW > 0 ? 999 : 0);

  // Normalise each axis to 0–100
  const winAxis = Math.max(0, Math.min(100, wr));
  const pfAxis  = Math.max(0, Math.min(100, (Math.min(pfNum, 3) / 3) * 100));
  const rrAxis  = Math.max(0, Math.min(100, (Math.min(rrRatio, 3) / 3) * 100));

  const score = Math.round((winAxis + pfAxis + rrAxis) / 3);
  valueEl.textContent = score;
  valueEl.style.color = score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--gold)' : 'var(--red)';

  wrap.innerHTML = _nxtTriangleSVG([winAxis, rrAxis, pfAxis], ['Win %', 'Win/Loss', 'Profit factor']);
}

// Builds a 3-axis radar/triangle chart as an inline SVG string.
// values: array of 3 numbers 0–100, in order [top, bottom-left, bottom-right]
function _nxtTriangleSVG(values, labels) {
  const cx = 100, cy = 96, R = 62;
  // Vertex angles: top, bottom-left, bottom-right (equilateral triangle)
  const angles = [-90, 150, 30].map(d => (d * Math.PI) / 180);
  const pt = (ratio, angle) => [cx + R * ratio * Math.cos(angle), cy + R * ratio * Math.sin(angle)];

  const outer = angles.map(a => pt(1, a));
  const mid   = angles.map(a => pt(0.5, a));
  const dataPts = angles.map((a, i) => pt(Math.max(values[i], 0) / 100, a));

  const toPath = pts => pts.map(p => p.join(',')).join(' ');
  const labelPts = angles.map(a => pt(1.30, a));

  return `
    <svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${toPath(outer)}" fill="none" stroke="var(--glass-border)" stroke-width="1"/>
      <polygon points="${toPath(mid)}" fill="none" stroke="var(--glass-border)" stroke-width="1" opacity="0.6"/>
      ${angles.map(a => { const o = pt(1, a); return `<line x1="${cx}" y1="${cy}" x2="${o[0]}" y2="${o[1]}" stroke="var(--glass-border)" stroke-width="1"/>`; }).join('')}
      <polygon points="${toPath(dataPts)}" fill="rgba(167,139,250,0.28)" stroke="var(--purple)" stroke-width="1.6"/>
      ${dataPts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="var(--purple)"/>`).join('')}
      ${labelPts.map((p, i) => `<text x="${p[0]}" y="${p[1]}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="var(--text3)" font-family="var(--font-head)">${labels[i]}</text>`).join('')}
    </svg>`;
}

// ── Daily Loss Limit Alert ─────────────────────────────────────────────────
function _checkDailyLossLimit(allTrades) {
  const alertEl = document.getElementById('daily-loss-alert');
  if (!alertEl) return;
  const today = localToday();
  const todayTrades = allTrades.filter(t => t.date === today);
  if (!todayTrades.length) { alertEl.style.display = 'none'; return; }
  const todayPnl = todayTrades.reduce((a, t) => a + _pctOfTrade(t), 0);
  const riskPct = parseFloat((_profileData.risk || '1%').replace('%', '')) || 1;
  const dailyLimit = riskPct * 3; // 3x single-trade risk = daily stop
  const lossCount = todayTrades.filter(t => t.outcome === 'Loss').length;
  const titleEl = document.getElementById('daily-loss-alert-title');
  const bodyEl = document.getElementById('daily-loss-alert-body');
  if (todayPnl <= -dailyLimit) {
    alertEl.style.display = 'flex';
    if (titleEl) titleEl.innerHTML = `<svg class="icn" aria-hidden="true"><use href="#ic-siren"></use></svg> Daily Loss Limit Reached (${todayPnl.toFixed(1)}%)`;
    if (bodyEl) bodyEl.textContent = `You've hit your ${dailyLimit.toFixed(1)}% daily limit. Step away — protect your account.`;
  } else if (lossCount >= 2 && todayPnl < 0) {
    alertEl.style.display = 'flex';
    if (titleEl) titleEl.innerHTML = `<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg> ${lossCount} Losses Today (${todayPnl.toFixed(1)}%)`;
    if (bodyEl) bodyEl.textContent = `Two consecutive losses detected. Consider pausing and reviewing your bias before the next trade.`;
  } else {
    alertEl.style.display = 'none';
  }
}

// ── Correlation Heatmap (Pair × Session) ─────────────────────────────────
function _renderHeatmap(trades) {
  const wrap = document.getElementById('corr-heatmap-wrap');
  if (!wrap) return;
  const sessions = ['London', 'New York', 'Asian'];
  // Get top pairs by trade count (max 8)
  const pairCount = {};
  trades.forEach(t => { pairCount[t.pair] = (pairCount[t.pair] || 0) + 1; });
  const pairs = Object.entries(pairCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  if (!pairs.length) { wrap.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">No trade data yet</div>'; return; }

  // Build matrix: pairs × sessions
  const matrix = {};
  pairs.forEach(p => {
    matrix[p] = {};
    sessions.forEach(s => { matrix[p][s] = { wins: 0, total: 0 }; });
  });
  trades.forEach(t => {
    if (matrix[t.pair] && matrix[t.pair][t.kz]) {
      matrix[t.pair][t.kz].total++;
      if (t.outcome === 'Win') matrix[t.pair][t.kz].wins++;
    }
  });

  const cellColor = (wins, total) => {
    if (!total) return 'rgba(255,255,255,0.04)';
    const wr = wins / total;
    if (wr >= 0.7) return 'rgba(34,197,94,0.5)';
    if (wr >= 0.5) return 'rgba(34,197,94,0.25)';
    if (wr >= 0.35) return 'rgba(251,191,36,0.3)';
    return 'rgba(239,68,68,0.35)';
  };
  const cellText = (wins, total) => {
    if (!total) return '—';
    return Math.round((wins / total) * 100) + '%<br><span style="font-size:9px;opacity:.6">' + total + 't</span>';
  };

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 10px;color:var(--text3);font-weight:500;font-size:11px">Pair</th>
          ${sessions.map(s => `<th style="text-align:center;padding:6px 10px;color:var(--text3);font-weight:500;font-size:11px">${s}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${pairs.map(p => `
          <tr>
            <td style="padding:5px 10px;font-weight:600;color:var(--text);font-size:12px;white-space:nowrap">${p}</td>
            ${sessions.map(s => {
              const { wins, total } = matrix[p][s];
              return `<td style="padding:5px 8px;text-align:center;border-radius:6px;background:${cellColor(wins, total)};color:var(--text);font-family:var(--font-mono);line-height:1.4">${cellText(wins, total)}</td>`;
            }).join('')}
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="display:flex;gap:16px;margin-top:10px;padding:0 4px">
      ${[['≥70% WR','rgba(34,197,94,0.5)'],['50–69%','rgba(34,197,94,0.25)'],['35–49%','rgba(251,191,36,0.3)'],['<35%','rgba(239,68,68,0.35)'],['No data','rgba(255,255,255,0.04)']].map(([lbl,col]) =>
        `<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text3)">
          <div style="width:12px;height:12px;border-radius:3px;background:${col};flex-shrink:0"></div>${lbl}
        </div>`).join('')}
    </div>`;
}

// ── Net PnL toggle ────────────────────────────────────
function toggleNetPnl() {
  // Cycle: % → $ → % …
  _pnlToggleMode = (_pnlToggleMode === '%') ? '$' : '%';
  const el = document.getElementById('kpi-pnl');
  const card = document.getElementById('kpi-pnl-card');
  if (!el) return;
  // Animate flip
  if (card) { card.classList.add('kpi-pnl-flipping'); setTimeout(() => card.classList.remove('kpi-pnl-flipping'), 300); }
  // Swap value + colour instantly from stored data attributes
  if (_pnlToggleMode === '$') {
    el.textContent = el.dataset.dollar || '+$0.00';
    el.className   = 'cal-an-value ' + (el.dataset.dollarPos === '1' ? 'green' : 'red');
  } else {
    el.textContent = el.dataset.pct || '+0.0%';
    el.className   = 'cal-an-value ' + (el.dataset.pctPos === '1' ? 'green' : 'red');
  }
  // Re-render calendar cells to match the new mode
  renderCalendar();
}


// ── QUARTER / YEAR HELPERS ────────────────────────────
function getQuarter(dateStr) { const m = parseInt(dateStr.slice(5, 7)); return m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4; }
function getYear(dateStr) { return parseInt(dateStr.slice(0, 4)); }
const Q_MONTHS = { 1: 'Jan/Feb/Mar', 2: 'Apr/May/Jun', 3: 'Jul/Aug/Sep', 4: 'Oct/Nov/Dec' };
const Q_RANGE = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12] };

function buildSidebarYears() {
  const curYear = new Date().getFullYear();
  const years = [...new Set(trades.map(t => getYear(t.date)))].sort((a, b) => b - a);
  if (!years.includes(curYear)) years.push(curYear);
  years.sort((a, b) => b - a);
  const cont = document.getElementById('sb-years');
  cont.innerHTML = years.map(year => {
    const curQ = getQuarter(new Date().toISOString());
    return `<div class="sb-section">
      <div class="sb-section-label" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleYear(${year})">
        <span>${year}</span><span id="yr-arrow-${year}" class="yr-arrow-icon open">${icon('chevron-right', {cls:'icn-sm'})}</span>
      </div>
      <div id="yr-quarters-${year}">${[1, 2, 3, 4].map(q => {
        const qt = trades.filter(t => getYear(t.date) === year && getQuarter(t.date) === q);
        const isActive = year === curYear && q === curQ;
        const hasTrades = qt.length > 0;
        return `<div class="sb-item${isActive ? ' q2' : ''}" id="sb-q-${year}-${q}" onclick="openQuarter(${year},${q},this)" style="opacity:${hasTrades || isActive ? 1 : 0.45}">
          <span class="ico">${isActive ? '<svg class="icn" aria-hidden="true"><use href="#ic-folder-open"></use></svg>' : '<svg class="icn" aria-hidden="true"><use href="#ic-folder"></use></svg>'}</span>
          <span class="lbl">Q${q} — ${Q_MONTHS[q]}</span>
          ${hasTrades ? `<span style="font-size:10px;color:var(--text3);margin-left:auto">${qt.length}</span>` : ''}
        </div>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

const _yrOpen = {};
function toggleYear(year) {
  const el = document.getElementById(`yr-quarters-${year}`);
  const ar = document.getElementById(`yr-arrow-${year}`);
  _yrOpen[year] = !(_yrOpen[year] !== false);
  if (_yrOpen[year]) { el.style.display = 'none'; ar.classList.remove('open'); }
  else { el.style.display = ''; ar.classList.add('open'); }
}
function openQuarter(year, q, sbEl) { nav('quarter', sbEl, `Q${q} ${year} — ${Q_MONTHS[q]}`, { year, q }); }
function renderQuarterPage(year, q) {
  const months = Q_RANGE[q];
  const qt = trades.filter(t => getYear(t.date) === year && getQuarter(t.date) === q);
  const wins = qt.filter(t => t.outcome === 'Win').length;
  const losses = qt.filter(t => t.outcome === 'Loss').length;
  const bes = qt.filter(t => t.outcome === 'B.E').length;
  const wr = qt.length ? ((wins / qt.length) * 100).toFixed(1) : 0;
  const netPnl = qt.reduce((a, t) => a + _pnlPctValue(t), 0).toFixed(1);
  // Compute dollar PnL per trade using its account size for correct avg
  const qtDollars  = qt.map(t => toPnlDollars(t, getAccSizeForAccount(t.account)));
  const netDollarsQ = qtDollars.reduce((a, b) => a + b, 0);
  const winDollarsQ  = qtDollars.filter((d, i) => qt[i].pnl > 0);
  const lossDollarsQ = qtDollars.filter((d, i) => qt[i].pnl < 0);
  const avgW = winDollarsQ.length  ? (winDollarsQ.reduce((a,b)=>a+b,0)  / winDollarsQ.length).toFixed(2)  : 0;
  const avgL = lossDollarsQ.length ? (lossDollarsQ.reduce((a,b)=>a+b,0) / lossDollarsQ.length).toFixed(2) : 0;
  const pf = lossDollarsQ.length ? Math.abs(winDollarsQ.reduce((a,b)=>a+b,0) / lossDollarsQ.reduce((a,b)=>a+b,0)).toFixed(2) : '∞';
  // Format net dollars for display
  const absNetQ = Math.abs(netDollarsQ);
  const netDollarsFmt = (absNetQ >= 1000
    ? (netDollarsQ >= 0 ? '+$' : '-$') + (absNetQ/1000).toFixed(1) + 'k'
    : (netDollarsQ >= 0 ? '+$' : '-$') + absNetQ.toFixed(2));
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthRows = months.map(m => {
    const mt = qt.filter(t => parseInt(t.date.slice(5, 7)) === m);
    if (!mt.length) return `<tr><td style="color:var(--text3)">${MONTH_NAMES[m - 1]} ${year}</td><td style="color:var(--text3)">—</td><td>—</td><td>—</td><td>—</td></tr>`;
    const mw = mt.filter(t => t.outcome === 'Win').length;
    const mwr = ((mw / mt.length) * 100).toFixed(0);
    const mDollars = mt.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
    const absM = Math.abs(mDollars);
    const mFmt = absM >= 1000
      ? (mDollars >= 0 ? '+$' : '-$') + (absM/1000).toFixed(1) + 'k'
      : (mDollars >= 0 ? '+$' : '-$') + absM.toFixed(2);
    const pnlC = mDollars >= 0 ? 'outcome-win' : 'outcome-loss';
    return `<tr onclick="filterTableAndNav('${year}-${String(m).padStart(2, '0')}')"><td class="bold">${MONTH_NAMES[m - 1]} ${year}</td><td>${mt.length}</td><td><span class="pill ${mwr >= 70 ? 'pill-green' : mwr >= 50 ? 'pill-gold' : 'pill-red'}">${mwr}%</span></td><td class="${pnlC} mono">${mFmt}</td><td>${mw}W / ${mt.filter(t => t.outcome === 'Loss').length}L / ${mt.filter(t => t.outcome === 'B.E').length}BE</td></tr>`;
  }).join('');
  const tradeRows = qt.map(t => {
    const tDollars = toPnlDollars(t, getAccSizeForAccount(t.account));
    const pnlFmt = _isMt5Trade(t) || t.pnlUnit === '$'
      ? (tDollars >= 0 ? '+$' : '-$') + Math.abs(tDollars).toFixed(2)
      : formatPnl(t, getAccSizeForAccount(t.account));
    const pnlC = tDollars > 0 ? 'outcome-win' : tDollars < 0 ? 'outcome-loss' : 'outcome-be';
    const outC = t.outcome === 'Win' ? 'outcome-win' : t.outcome === 'Loss' ? 'outcome-loss' : 'outcome-be';
    const posC = t.pos === 'Buy' ? 'pos-buy' : 'pos-sell';
    return `<tr onclick="openDetail(${t.id})" style="cursor:pointer"><td class="mono" style="color:var(--text2)">${t.date}</td><td class="bold">${t.pair}</td><td><span class="${posC}">${t.pos}</span></td><td class="mono">${t.rr}</td><td class="${pnlC} mono">${pnlFmt}</td><td class="${outC}">${t.outcome}</td><td>${kzPill(t.kz)}</td><td style="color:var(--text2);font-size:12px">${t.strategy || '—'}</td><td class="stars">${starsHTML(t.rating)}</td></tr>`;
  }).join('');
  // Compute % metrics using _pctOfTrade for quarter page
  const qNetPct    = qt.reduce((a,t) => a+_pctOfTrade(t), 0);
  const qWinPcts   = qt.filter(t=>_pctOfTrade(t)>0).map(t=>_pctOfTrade(t));
  const qLossPcts  = qt.filter(t=>_pctOfTrade(t)<0).map(t=>_pctOfTrade(t));
  const qAvgWinPct = qWinPcts.length  ? (qWinPcts.reduce((a,b)=>a+b,0)/qWinPcts.length).toFixed(2) : '—';
  const qAvgLosPct = qLossPcts.length ? (qLossPcts.reduce((a,b)=>a+b,0)/qLossPcts.length).toFixed(2) : '—';
  const qPfCalc    = qLossPcts.length ? Math.abs(qWinPcts.reduce((a,b)=>a+b,0)/qLossPcts.reduce((a,b)=>a+b,0)).toFixed(2) : '∞';
  // Drawdown for this quarter
  let _qCum=0,_qPeak=0,_qDD=0;
  [...qt].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{_qCum+=_pctOfTrade(t);if(_qCum>_qPeak)_qPeak=_qCum;const dd=_qPeak-_qCum;if(dd>_qDD)_qDD=dd;});
  const qPnlPctFmt = (qNetPct>=0?'+':'')+qNetPct.toFixed(1)+'%';
  const qDDStr = _qDD>0?'-'+_qDD.toFixed(1)+'%':'0.0%';
  document.getElementById('quarter-page-inner').innerHTML = `
    <div class="cover"><div class="cover-label">Quarterly Performance · ${year}</div><div class="cover-title">Q${q} ${year} — ${Q_MONTHS[q]}</div><div class="cover-sub">${qt.length} trades · Win rate ${wr}% · Net PnL ${qPnlPctFmt} (${netDollarsFmt})</div></div>
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi-card"><div class="kpi-label">Total trades</div><div class="kpi-value blue">${qt.length || '—'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Win rate</div><div class="kpi-value ${wr >= 65 ? 'green' : 'red'}">${wr}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Net PnL</div><div class="kpi-value ${qNetPct >= 0 ? 'green' : 'red'}">${qPnlPctFmt}</div></div>
      <div class="kpi-card"><div class="kpi-label">Profit factor</div><div class="kpi-value gold">${qPfCalc}x</div></div>
    </div>
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card"><div class="kpi-label">Wins</div><div class="kpi-value green">${wins}</div></div>
      <div class="kpi-card"><div class="kpi-label">Losses</div><div class="kpi-value red">${losses}</div></div>
      <div class="kpi-card"><div class="kpi-label">Max drawdown</div><div class="kpi-value ${_qDD>5?'red':_qDD>2?'gold':'green'}">${qDDStr}</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg win / Avg loss</div><div class="kpi-value white" style="font-size:14px">${qAvgWinPct!=='—'?'+'+qAvgWinPct+'%':'—'} / ${qAvgLosPct!=='—'?qAvgLosPct+'%':'—'}</div></div>
    </div>
    ${qt.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text3)">No trades logged for Q${q} ${year} yet.<br><br><button class="btn btn-primary" onclick="openModal()" style="margin-top:10px">+ Add Trade</button></div>` : `
    <div class="sec-head">Month Breakdown</div>
    <div class="data-table-wrap"><table class="data-table" style="margin-bottom:20px"><thead><tr><th>Month</th><th>Trades</th><th>Win%</th><th>Net PnL</th><th>W/L/BE</th></tr></thead><tbody>${monthRows}</tbody></table></div>
    <div class="sec-head" style="display:flex;align-items:center;justify-content:space-between"><span>All Trades — Q${q} ${year}</span><button class="btn" onclick="openModal()" style="font-size:11px;padding:4px 10px">+ Add Trade</button></div>
    <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Pair</th><th>Pos</th><th>R:R</th><th>PnL</th><th>Outcome</th><th>Killzone</th><th>Model</th><th>${icon('star',{label:'Rating'})}</th></tr></thead><tbody>${tradeRows}</tbody></table></div>
    <div style="margin-top:10px;font-size:12px;color:var(--text3)">${qt.length} trades · Click any row to view details</div>
    `}`;
}
function filterTableAndNav(ym) { nav('tradelog', null, 'Trade Log'); document.getElementById('search-input').value = ym; filterTable(); }

// ── THEME ─────────────────────────────────────────────
function toggleTheme() {
  const doc = document.documentElement;
  const isLight = doc.getAttribute('data-theme') === 'light';
  doc.setAttribute('data-theme', isLight ? '' : 'light');
  const btn = document.getElementById('theme-btn');
  if (btn) { btn.innerHTML = isLight ? '<svg class="icn" aria-hidden="true"><use href="#ic-moon"></use></svg>' : '<svg class="icn" aria-hidden="true"><use href="#ic-sun"></use></svg>'; btn.classList.add('spinning'); setTimeout(() => btn.classList.remove('spinning'), 420); }
  try { localStorage.setItem('nxtgen_theme', isLight ? 'dark' : 'light'); } catch (e) {}
}
function loadTheme() {
  try {
    const t = localStorage.getItem('nxtgen_theme') || 'dark';
    const isDark = t !== 'light';
    document.documentElement.setAttribute('data-theme', isDark ? '' : 'light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.innerHTML = isDark ? '<svg class="icn" aria-hidden="true"><use href="#ic-moon"></use></svg>' : '<svg class="icn" aria-hidden="true"><use href="#ic-sun"></use></svg>';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  } catch (e) {}
}

// ── LIVE CLOCK ────────────────────────────────────────
// Respects the "Timezone" setting on the Account tab (_profileData.timezone),
// falling back to Africa/Lagos (WAT) if unset or invalid. Shows the current
// date + ticking time + UTC offset (e.g. "Sat, Jul 11  04:10:35 AM  UTC-4"),
// keeping the city name out so the pill stays compact.
function updateClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  const tz = getUserTz();
  const now = new Date();
  let date, time;
  try {
    date = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
    time = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  } catch (e) {
    date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }
  el.textContent = date + '  ' + time + '  ' + getUserTzOffsetLabel(tz);
}

// ── TAB SWITCHING ─────────────────────────────────────
function _switchDetTab(tab, id) {
  _detActiveTab = tab;
  document.querySelectorAll('.det-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.det-tab-content').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
}

// ── EDIT MODE ─────────────────────────────────────────
function _toggleEditMode(id) { _detEditMode = !_detEditMode; _detActiveTab = 'overview'; _renderDetail(id); }

function _emoIcon(e) {
  const map = {Calm:'<svg class="icn" aria-hidden="true"><use href="#ic-smile"></use></svg>',Relaxed:'<svg class="icn" aria-hidden="true"><use href="#ic-smile"></use></svg>',Confident:'<svg class="icn" aria-hidden="true"><use href="#ic-thumbs-up"></use></svg>',Focused:'<svg class="icn" aria-hidden="true"><use href="#ic-target"></use></svg>',Neutral:'<svg class="icn" aria-hidden="true"><use href="#ic-meh"></use></svg>',Anxious:'<svg class="icn" aria-hidden="true"><use href="#ic-frown"></use></svg>',Impatient:'<svg class="icn" aria-hidden="true"><use href="#ic-clock"></use></svg>',Fearful:'<svg class="icn" aria-hidden="true"><use href="#ic-frown"></use></svg>',Greedy:'<svg class="icn" aria-hidden="true"><use href="#ic-dollar-c"></use></svg>',Revenge:'<svg class="icn" aria-hidden="true"><use href="#ic-frown"></use></svg>'};
  return map[e] || '';
}

function _handleCustomSelect(sel, customInputId) {
  const inp = document.getElementById(customInputId);
  if (!inp) return;
  if (sel.value === '__custom__') { inp.style.display = ''; inp.focus(); }
  else inp.style.display = 'none';
}

function setStarRating(id, n) {
  n = Math.max(3, Math.min(5, n));
  const editor = document.getElementById('star-editor');
  if (!editor) return;
  editor.dataset.rating = n;
  editor.querySelectorAll('.star-opt').forEach(el => {
    const v = parseInt(el.querySelector('.star-lbl').textContent);
    el.className = 'star-opt' + (v === n ? ' selected' : '');
    el.querySelector('.star-pips').innerHTML = icon('star').repeat(v) + icon('star-o').repeat(5 - v);
  });
}

async function _saveEdit(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  const get = sel => { const el = document.getElementById(sel); return el ? el.value : null; };
  const dateVal = get('e-date'), pairVal = get('e-pair'), posVal = get('e-pos'), rrVal = get('e-rr');
  const pnlVal = get('e-pnl'), outcomeVal = get('e-outcome'), kzVal = get('e-kz');
  const _accRaw = get('e-acc'), stratVal = get('e-strat'), _tfRaw = get('e-tf');
  const accVal = _accRaw;
  const tfVal  = _tfRaw === '__custom__' ? (get('e-tf-custom') || '').trim() || _tfRaw : _tfRaw;
  const editor = document.getElementById('star-editor');
  const ratingVal = editor ? parseInt(editor.dataset.rating || t.rating) : t.rating;
  if (dateVal) t.date = dateVal;
  if (pairVal) t.pair = pairVal.trim().toUpperCase();
  if (posVal) t.pos = posVal;
  if (rrVal) t.rr = rrVal;
  if (pnlVal !== null) t.pnl = parseFloat(pnlVal) || 0;
  // Auto-correct outcome if it conflicts with PnL sign
  if (outcomeVal) {
    let correctedOutcome = outcomeVal;
    if (t.pnl > 0 && outcomeVal === 'Loss') correctedOutcome = 'Win';
    if (t.pnl < 0 && outcomeVal === 'Win')  correctedOutcome = 'Loss';
    if (t.pnl === 0 && outcomeVal !== 'B.E') correctedOutcome = 'B.E';
    t.outcome = correctedOutcome;
  }
  if (kzVal) t.kz = kzVal;
  const riskVal = get('e-risk');
  if (riskVal !== null && riskVal.trim()) t.risk = riskVal.trim();
  if (accVal && accVal !== '__custom__') t.account = accVal;
  if (stratVal && stratVal !== '__custom__') t.strategy = stratVal;
  else if (stratVal === '__custom__') { const sc = get('e-strat-custom'); if (sc && sc.trim()) t.strategy = sc.trim(); }
  if (tfVal && tfVal !== '__custom__') t.tf = tfVal;
  t.rating = ratingVal;
  trades.sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id));

  // Instant UI update — no waiting
  _detEditMode = false;
  _refreshAll();
  _renderDetail(id);

  // If account detail drawer is open, refresh it immediately too
  const drawer = document.getElementById('acc-detail-drawer');
  if (drawer && drawer.classList.contains('open') && _accActiveName) {
    accShowDetail(_accActiveName);
  }

  showToast(t.pair + ' updated ✓', 'restore');
  _playChime('save');

  // Background cloud save
  _cloudSaveTrade(t).then(ok => {
    if (!ok) showToast(t.pair + ' cloud save failed — retry', 'danger');
  });
}

function _confirmDelete(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  const area = document.getElementById('del-confirm-area');
  if (!area) return;
  area.innerHTML = `
    <div class="del-confirm" style="margin-top:14px">
      <div class="del-confirm-text">Move <strong>${t.pair}</strong> (${t.date}, ${_pnlLabel(t)}) to Trash?<br><span style="font-size:11px;color:var(--text3)">You can restore it from Trash anytime.</span></div>
      <div class="del-confirm-btns">
        <button class="del-no" onclick="document.getElementById('del-confirm-area').innerHTML=''">Cancel</button>
        <button class="del-yes" onclick="_executeSoftDelete(${id})"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Move to Trash</button>
      </div>
    </div>`;
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function _executeSoftDelete(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  const ok = await _cloudSoftDelete(t);
  if (!ok) { showToast('Delete failed', 'danger'); return; }
  deletedTrades.unshift({ ...t, deletedAt: new Date().toISOString(), originalId: t.id });
  trades = trades.filter(x => x.id !== id);
  delete tradeState[id];

  // If this was an MT5 trade, remove it from importedTickets immediately
  // so the MT5 modal reflects the change without needing a manual sync.
  if (t.mt5Ticket || t.source === 'mt5') {
    const ticket = String(t.mt5Ticket || '');
    const list = _getCustomAccounts();
    const idx = list.findIndex(a => a.name === t.account);
    if (idx >= 0 && list[idx].mt5?.importedTickets) {
      list[idx].mt5.importedTickets = list[idx].mt5.importedTickets.filter(tk => String(tk) !== ticket);
      await _saveCustomAccounts(list);
      // Re-render the MT5 modal step 3 if it's currently open for this account
      if (_mt5ModalState.accountName === t.account) {
        _mt5ModalState.acc = list[idx];
        _mt5RenderStep(3);
      }
    }
  }

  closeDetail();
  // Immediately remove the row from the DOM so it vanishes without waiting for _refreshAll
  const row = document.querySelector(`#trade-table-body tr[onclick*="openDetail(${id})"]`);
  if (row) { row.style.transition = 'opacity 0.15s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 150); }
  _refreshAll();
  renderTradeTable(trades);
  _playChime('delete');
  showToast(t.pair + ' moved to Trash', 'danger', { label: 'View Trash', fn: "nav('trash',null,'Trash')" });
}

