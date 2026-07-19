// ══ NxTGen Journal — nav-dashboard-trades.js (original app.js lines 2434-4490) ══

// ── NAVIGATION ────────────────────────────────────────
function nav(pageId, sbEl, label, extra, _skipPush) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  const pg = document.getElementById('page-' + pageId);
  if (pg) { pg.classList.add('active'); pg.scrollTop = 0; }
  const tab = document.getElementById('tab-' + pageId);
  if (tab) tab.classList.add('active');
  if (sbEl) sbEl.classList.add('active');
  document.getElementById('topbar-page').textContent = label;
  // Show the calendar slide-toggle only on the dashboard (desktop only — CSS hides on mobile)
  const calBtn = document.getElementById('cal-slide-toggle');
  if (calBtn) {
    if (pageId === 'dashboard' && window.innerWidth > 1080) {
      calBtn.style.display = 'flex';
    } else {
      calBtn.style.display = 'none';
    }
  }
  if (pageId === 'tradelog') renderTradeTable(trades);
  renderCalendar();
  if (pageId === 'quarter' && extra) { renderQuarterPage(extra.year, extra.q); }
  if (pageId === 'calendar') { _refreshCalendarAccountFilter(); _restoreCalendarAccountSelection(); setTimeout(renderCalendar, 0); }
  if (pageId === 'dashboard') { _refreshCalendarAccountFilter(); _restoreCalendarAccountSelection(); setTimeout(renderCalendar, 0); }
  if (pageId === 'trash') { setTimeout(renderTrash, 0); }
  if (pageId === 'monthly') { buildMonthlyReview(); }
  if (pageId === 'ai') { buildAI(); }
  if (pageId === 'backtesting') { buildBacktestingLab(); _btRenderSessionGrid(); _blRenderGalleryControls(); _blRenderGallery(); _blRenderComparisonTable(); }
  if (pageId === 'profile') { setTimeout(buildProfile, 0); }
  // Sync mobile bottom nav
  mobNavActivate(pageId);

  // Update the URL bar to reflect the current page (e.g. /tradelog, /calendar)
  if (!_skipPush) _pushRoute(pageId, extra);
}

// ── CLIENT-SIDE ROUTING — clean URLs like /tradelog, /backtesting, /calendar ──
const _PAGE_LABELS = {
  dashboard:   'Dashboard',
  tradelog:    'Trade Log',
  watchlist:   'Weekly Watchlist',
  accounts:    'Account Tracker',
  calendar:    'Calendar',
  ai:          'AI Coach',
  backtesting: 'Backtesting Lab',
  playbook:    'Trading Playbook',
  goals:       'Goals & Milestones',
  monthly:     'Monthly Review',
  trash:       'Trash',
  profile:     'My Profile'
};
const _VALID_PAGES = Object.keys(_PAGE_LABELS).concat(['quarter']);

// Build the canonical URL path for a given page (+ optional extra data, e.g. quarter year/q)
function _buildPath(pageId, extra) {
  if (pageId === 'dashboard') return '/';
  if (pageId === 'quarter' && extra && extra.year && extra.q) return `/quarter/${extra.year}/${extra.q}`;
  return '/' + pageId;
}

// Push a new history entry so the URL bar matches the visible page
function _pushRoute(pageId, extra) {
  const path = _buildPath(pageId, extra);
  if (location.pathname !== path) {
    history.pushState({ pageId, extra: extra || null }, '', path);
  }
}

// Read the current URL and activate the matching page (used on load + back/forward)
function _routeFromLocation() {
  const parts = location.pathname.split('/').filter(Boolean);
  let pageId = parts[0] || 'dashboard';
  let extra = null;
  let label;

  if (pageId === 'quarter') {
    const year = parseInt(parts[1], 10) || new Date().getFullYear();
    const q    = parseInt(parts[2], 10) || getQuarter(localToday());
    extra = { year, q };
    label = `Q${q} ${year} — ${Q_MONTHS[q]}`;
  } else if (!_VALID_PAGES.includes(pageId)) {
    pageId = 'dashboard';
    label  = _PAGE_LABELS.dashboard;
  } else {
    label = _PAGE_LABELS[pageId];
  }

  const sbEl = pageId === 'quarter'
    ? document.getElementById(`sb-q-${extra.year}-${extra.q}`)
    : document.querySelector(`.sb-item[onclick*="nav('${pageId}'"]`);

  nav(pageId, sbEl, label, extra, true);

  // Normalize the URL (fixes unknown paths, trailing slashes, etc.)
  const canonicalPath = _buildPath(pageId, extra);
  if (location.pathname !== canonicalPath) {
    history.replaceState({ pageId, extra }, '', canonicalPath);
  }
}

// Handle browser Back/Forward buttons
window.addEventListener('popstate', function () {
  _routeFromLocation();
});

// ── DASHBOARD: PAIR TABLE ────────────────────────────
function _sortIndicator(col, sortState) {
  if (sortState.col !== col) return '<span class="sort-icon"><svg class="icn" aria-hidden="true"><use href="#ic-sort"></use></svg></span>';
  return sortState.dir === -1 ? '<span class="sort-icon active"><svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg></span>' : '<span class="sort-icon active"><svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg></span>';
}
function _sortHeader(label, col, sortStateKey, buildFn, extra) {
  const _sortMap = { _sortPair, _sortKz, _sortStrategy, _sortMonthly };
  return `<th class="sortable-th" onclick="${buildFn}('${col}')" ${extra||''}>${label} ${_sortIndicator(col, _sortMap[sortStateKey] || {col:'',dir:-1})}</th>`;
}
/* ─────────────────────────────────────────────────────────
   SHARED PnL FORMATTER — dual $ + % display for tables/drilldowns
   netDollars = sum already in $
   tradeList  = the raw trades (used to compute % representation)
   Returns e.g. "+$506.10 (+5.06%)" or "-$98.44 (-0.98%)"
───────────────────────────────────────────────────────── */
function _fmtGroupPnl(netDollars, tradeList) {
  // If ALL trades in the group are manual %-based, sum their raw % values and show % only.
  const allPct = tradeList.every(t => !_isMt5Trade(t) && t.pnlUnit !== '$');
  if (allPct) {
    const totalPct = tradeList.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
    return (totalPct >= 0 ? '+' : '') + totalPct.toFixed(1) + '%';
  }

  // Mixed or all-dollar group: compute blended account size for % annotation
  let totalWeight = 0, blended = 0;
  tradeList.forEach(t => {
    const sz = getAccSizeForAccount(t.account);
    if (sz > 0) { blended += sz; totalWeight++; }
  });
  const avgAccSize = totalWeight > 0 ? blended / totalWeight : 0;

  const abs = Math.abs(netDollars);
  const sign = netDollars >= 0 ? '+' : '-';
  const dolStr = abs >= 1000
    ? sign + '$' + (abs / 1000).toFixed(1) + 'k'
    : sign + '$' + abs.toFixed(2);

  if (avgAccSize > 0) {
    const pct = (netDollars / avgAccSize) * 100;
    const pctStr = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    return dolStr + ' (' + pctStr + ')';
  }
  return dolStr;
}

function _fmtAvgPnl(avgDollars, tradeList) {
  // If ALL trades are manual %-based, show the average % directly
  const allPct = tradeList.every(t => !_isMt5Trade(t) && t.pnlUnit !== '$');
  if (allPct) {
    const totalPct = tradeList.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
    const avgPct   = tradeList.length ? totalPct / tradeList.length : 0;
    return (avgPct >= 0 ? '+' : '') + avgPct.toFixed(1) + '%';
  }
  const avgAccSize = (() => {
    let tot = 0, n = 0;
    tradeList.forEach(t => { const sz = getAccSizeForAccount(t.account); if (sz > 0) { tot += sz; n++; } });
    return n > 0 ? tot / n : 0;
  })();
  const abs = Math.abs(avgDollars);
  const sign = avgDollars >= 0 ? '+' : '-';
  const dolStr = abs >= 1000 ? sign + '$' + (abs/1000).toFixed(1) + 'k' : sign + '$' + abs.toFixed(2);
  if (avgAccSize > 0) {
    const pct = (avgDollars / avgAccSize) * 100;
    return dolStr + ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%)';
  }
  return dolStr;
}

// ── Group PnL helpers (global, used by all build* table fns) ──────────────
function _pctOfTrade(t) {
  const val = parseFloat(t.pnl) || 0;
  const sz  = getAccSizeForAccount(t.account);
  if (!_isMt5Trade(t) && t.pnlUnit !== '$') return val;
  if (sz > 0) return (toPnlDollars(t, sz) / sz) * 100;
  return 0;
}
function _totalPctForGroup(list) {
  return list.reduce((a, t) => a + _pctOfTrade(t), 0);
}
function _emptyRow(cols, msg) {
  return `<tr><td colspan="${cols}" class="empty-state-row">${msg}</td></tr>`;
}

function buildPairTable(sortCol) {
  const trades = _getFilteredTrades();
  if (sortCol) {
    if (_sortPair.col === sortCol) _sortPair.dir *= -1;
    else { _sortPair.col = sortCol; _sortPair.dir = -1; }
  }
  const pairs = [...new Set(trades.map(t => t.pair))];
  const tbody = document.getElementById('pair-table-body');
  const thead = document.getElementById('pair-table-head');
  if (!tbody) return;
  if (!pairs.length) {
    tbody.innerHTML = _emptyRow(5, '<svg class="icn" aria-hidden="true"><use href="#ic-chart-bar"></use></svg> No trades logged yet — <button class="empty-cta" onclick="openModal()">+ Add your first trade</button>');
    return;
  }
  let rows = pairs.map(p => {
    const pt   = trades.filter(t => t.pair === p);
    const wins = pt.filter(t => t.outcome === 'Win').length;
    const wr   = pt.length ? Math.round(wins / pt.length * 100) : 0;
    const netDollars = pt.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
    const pnl  = _totalPctForGroup(pt);
    return { p, count: pt.length, wr, netDollars, pnl, pt };
  });
  rows.sort((a, b) => {
    if (_sortPair.col === 'pair') return a.p < b.p ? _sortPair.dir : a.p > b.p ? -_sortPair.dir : 0;
    const av = _sortPair.col === 'wr' ? a.wr : _sortPair.col === 'pnl' ? a.pnl : a.count;
    const bv = _sortPair.col === 'wr' ? b.wr : _sortPair.col === 'pnl' ? b.pnl : b.count;
    return (av - bv) * _sortPair.dir;
  });
  if (thead) thead.innerHTML = `<tr>
    <th class="sortable-th" onclick="buildPairTable('pair')">Pair ${_sortIndicator('pair',_sortPair)}</th>
    <th class="sortable-th" onclick="buildPairTable('trades')">Trades ${_sortIndicator('trades',_sortPair)}</th>
    <th class="sortable-th" onclick="buildPairTable('wr')">Win% ${_sortIndicator('wr',_sortPair)}</th>
    <th class="sortable-th" onclick="buildPairTable('pnl')">Net PnL ${_sortIndicator('pnl',_sortPair)}</th>
    <th class="col-winbar">Win rate bar</th></tr>`;
  tbody.innerHTML = rows.map(({p,count,wr,netDollars,pnl,pt}) => {
    const wrClass  = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
    const pnlClass = pnl >= 0 ? 'outcome-win' : 'outcome-loss';
    const barColor = wr >= 70 ? 'green' : 'red';
    const pnlDisp  = _fmtGroupPnl(netDollars, pt);
    return `<tr class="pair-row-clickable" onclick="openPairDrilldown('${p.replace(/'/g,"\'")}')" style="cursor:pointer"><td class="bold">${p}</td><td>${count}</td><td><span class="pill ${wrClass}">${wr}%</span></td><td class="${pnlClass} mono" style="font-size:11px">${pnlDisp}</td><td class="col-winbar"><div class="win-bar-wrap"><div class="win-bar-bg"><div class="win-bar-fill ${barColor}" style="width:${wr}%"></div></div></div></td></tr>`;
  }).join('');
}


function openPairDrilldown(pair) {
  const trades = _getFilteredTrades();
  const pairTrades = trades.filter(t => t.pair === pair).sort((a,b) => new Date(b.date) - new Date(a.date));
  const wins   = pairTrades.filter(t => t.outcome === 'Win').length;
  const losses = pairTrades.filter(t => t.outcome === 'Loss').length;
  const be     = pairTrades.filter(t => t.outcome === 'B.E').length;
  const wr     = pairTrades.length ? Math.round(wins / pairTrades.length * 100) : 0;
  const netDollars = pairTrades.reduce((s, t) => s + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
  const wrCls  = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
  const pnlColor = netDollars >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlDisp = _fmtGroupPnl(netDollars, pairTrades);

  const existing = document.getElementById('pair-drilldown-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pair-drilldown-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const rows = pairTrades.map(t => {
    const pnlCls = t.pnl > 0 ? 'outcome-win' : t.pnl < 0 ? 'outcome-loss' : '';
    const outCls = t.outcome === 'Win' ? 'pill-green' : t.outcome === 'Loss' ? 'pill-red' : 'pill-gold';
    const tid = t.id;
    return [
      '<tr class="pair-drill-row" onclick="pairDrillOpenTrade(' + tid + ')" title="View trade detail">',
      '<td class="mono" style="font-size:11px">' + t.date + '</td>',
      '<td>' + (t.pos || '—') + '</td>',
      '<td class="mono">' + (t.rr || '—') + '</td>',
      '<td class="' + pnlCls + ' mono">' + formatPnl(t, getAccSizeForAccount(t.account)) + '</td>',
      '<td><span class="pill ' + outCls + '" style="font-size:10px">' + t.outcome + '</span></td>',
      '<td>' + kzPill(t.kz) + '</td>',
      '<td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">' + (t.account || '—') + '</td>',
      '</tr>'
    ].join('');
  }).join('');

  // Build modal HTML using DOM manipulation to avoid quote escaping issues
  overlay.innerHTML =
    '<div class="acc-manager-modal" style="max-width:640px">' +
      '<div class="acc-manager-header" style="gap:10px;flex-wrap:wrap">' +
        '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;flex-wrap:wrap">' +
          '<span style="font-size:16px;font-weight:800;letter-spacing:.5px">' + pair + '</span>' +
          '<span class="pill ' + wrCls + '" style="font-size:11px">' + wr + '% win</span>' +
          '<span style="font-size:11px;color:var(--text2)">' + pairTrades.length + ' trade' + (pairTrades.length !== 1 ? 's' : '') + '</span>' +
          '<span style="font-size:11px;color:var(--text2)">' + wins + 'W &middot; ' + losses + 'L &middot; ' + be + 'BE</span>' +
          '<span style="font-size:11px;font-weight:700;color:' + pnlColor + '">' + pnlDisp + '</span>' +
        '</div>' +
        '<button onclick="document.getElementById(\'pair-drilldown-overlay\').remove()" class="acc-mgr-close">&times;</button>' +
      '</div>' +
      '<div class="acc-manager-body" style="padding:0;max-height:58vh;overflow-y:auto">' +
        '<div class="data-table-wrap" style="margin:0;border-radius:0;border:none">' +
          '<table class="data-table" style="font-size:12px">' +
            '<thead><tr><th>Date</th><th>Side</th><th>R:R</th><th>PnL</th><th>Outcome</th><th>Session</th><th>Account</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div style="padding:10px 16px;border-top:1px solid var(--glass-border);display:flex;gap:8px;justify-content:flex-end;background:var(--glass-1)">' +
        '<button class="wl-week-btn" style="font-size:12px" id="pair-drill-tradelog-btn">Open in Trade Log &rarr;</button>' +
      '</div>' +
    '</div>';

  // Attach the tradelog button listener separately to avoid quote issues
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  overlay.querySelector('#pair-drill-tradelog-btn').addEventListener('click', function() {
    overlay.remove();
    nav('tradelog', null, 'Trade Log');
    setTimeout(function() {
      const f = document.getElementById('filter-pair');
      if (f) { f.value = pair; filterTable(); }
    }, 250);
  });
}

// Called from within drilldown rows (avoids inline quote escaping)
function pairDrillOpenTrade(id) {
  const ov = document.getElementById('pair-drilldown-overlay');
  if (ov) ov.remove();
  openDetail(id);
}




/* ─────────────────────────────────────────────────────────
   KILLZONE DRILLDOWN
───────────────────────────────────────────────────────── */
function openKzDrilldown(session) {
  const trades = _getFilteredTrades();
  const kzTrades = trades.filter(t => t.kz === session).sort((a,b) => new Date(b.date) - new Date(a.date));
  const wins   = kzTrades.filter(t => t.outcome === 'Win').length;
  const losses = kzTrades.filter(t => t.outcome === 'Loss').length;
  const be     = kzTrades.filter(t => t.outcome === 'B.E').length;
  const wr     = kzTrades.length ? Math.round(wins / kzTrades.length * 100) : 0;
  const netDollars = kzTrades.reduce((s,t) => s + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
  const wrCls  = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
  const pnlColor = netDollars >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlDisp  = _fmtGroupPnl(netDollars, kzTrades);
  const kzIconHtml = icon('clock');

  _openDrillModal('kz-drilldown-overlay',
    kzIconHtml + ' ' + session,
    kzTrades.length + ' trade' + (kzTrades.length !== 1 ? 's' : ''),
    wins + 'W &middot; ' + losses + 'L &middot; ' + be + 'BE',
    wr + '% win', wrCls, pnlDisp, pnlColor,
    _buildDrillRows(kzTrades),
    function() {
      nav('tradelog', null, 'Trade Log');
      setTimeout(function() {
        const f = document.getElementById('filter-kz');
        if (f) { f.value = session; filterTable(); }
      }, 250);
    }
  );
}

/* ─────────────────────────────────────────────────────────
   STRATEGY DRILLDOWN
───────────────────────────────────────────────────────── */
function openStratDrilldown(strategy) {
  const trades = _getFilteredTrades();
  const isUntagged = strategy === 'untagged';
  const stTrades = isUntagged
    ? trades.filter(t => !t.strategy || !t.strategy.trim()).sort((a,b) => new Date(b.date) - new Date(a.date))
    : trades.filter(t => t.strategy === strategy).sort((a,b) => new Date(b.date) - new Date(a.date));
  const label  = isUntagged ? 'Untagged' : strategy;
  const wins   = stTrades.filter(t => t.outcome === 'Win').length;
  const losses = stTrades.filter(t => t.outcome === 'Loss').length;
  const be     = stTrades.filter(t => t.outcome === 'B.E').length;
  const wr     = stTrades.length ? Math.round(wins / stTrades.length * 100) : 0;
  const netDollars = stTrades.reduce((s,t) => s + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
  const wrCls  = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
  const pnlColor = netDollars >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlDisp  = _fmtGroupPnl(netDollars, stTrades);

  _openDrillModal('strat-drilldown-overlay',
    '<svg class="icn" aria-hidden="true"><use href="#ic-clipboard"></use></svg> ' + label,
    stTrades.length + ' trade' + (stTrades.length !== 1 ? 's' : ''),
    wins + 'W &middot; ' + losses + 'L &middot; ' + be + 'BE',
    wr + '% win', wrCls, pnlDisp, pnlColor,
    _buildDrillRows(stTrades),
    function() {
      nav('tradelog', null, 'Trade Log');
      setTimeout(function() {
        const s = document.getElementById('search-input');
        if (s && !isUntagged) { s.value = strategy; filterTable(); }
      }, 250);
    }
  );
}

/* ─────────────────────────────────────────────────────────
   MONTHLY DRILLDOWN
───────────────────────────────────────────────────────── */
function openMonthDrilldown(key) {
  const trades = _getFilteredTrades();
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [yr, mo] = key.split('-').map(Number);
  const label    = MONTH_NAMES[mo - 1] + ' ' + yr;
  const moTrades = trades.filter(t => t.date.startsWith(key)).sort((a,b) => new Date(b.date) - new Date(a.date));
  const wins   = moTrades.filter(t => t.outcome === 'Win').length;
  const losses = moTrades.filter(t => t.outcome === 'Loss').length;
  const be     = moTrades.filter(t => t.outcome === 'B.E').length;
  const wr     = moTrades.length ? Math.round(wins / moTrades.length * 100) : 0;
  const netDollars = moTrades.reduce((s,t) => s + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
  const wrCls  = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
  const pnlColor = netDollars >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlDisp  = _fmtGroupPnl(netDollars, moTrades);

  _openDrillModal('month-drilldown-overlay',
    '<svg class="icn" aria-hidden="true"><use href="#ic-calendar"></use></svg> ' + label,
    moTrades.length + ' trade' + (moTrades.length !== 1 ? 's' : ''),
    wins + 'W &middot; ' + losses + 'L &middot; ' + be + 'BE',
    wr + '% win', wrCls, pnlDisp, pnlColor,
    _buildDrillRows(moTrades),
    function() {
      nav('tradelog', null, 'Trade Log');
      setTimeout(function() {
        const s = document.getElementById('search-input');
        if (s) { s.value = label; filterTable(); }
      }, 250);
    }
  );
}

/* ─────────────────────────────────────────────────────────
   SHARED DRILLDOWN HELPERS
───────────────────────────────────────────────────────── */
function _buildDrillRows(list) {
  return list.map(function(t) {
    const pnlCls = t.pnl > 0 ? 'outcome-win' : t.pnl < 0 ? 'outcome-loss' : '';
    const outCls = t.outcome === 'Win' ? 'pill-green' : t.outcome === 'Loss' ? 'pill-red' : 'pill-gold';
    const tid = t.id;
    return [
      '<tr class="pair-drill-row" onclick="drillOpenTrade(\'' + tid + '\')" title="View trade detail">',
      '<td class="mono" style="font-size:11px">' + t.date + '</td>',
      '<td class="bold" style="font-size:11px">' + (t.pair || '—') + '</td>',
      '<td>' + (t.pos || '—') + '</td>',
      '<td class="mono">' + (t.rr || '—') + '</td>',
      '<td class="' + pnlCls + ' mono">' + formatPnl(t, getAccSizeForAccount(t.account)) + '</td>',
      '<td><span class="pill ' + outCls + '" style="font-size:10px">' + t.outcome + '</span></td>',
      '<td>' + kzPill(t.kz) + '</td>',
      '<td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">' + (t.account || '—') + '</td>',
      '</tr>'
    ].join('');
  }).join('');
}

function _openDrillModal(overlayId, title, countLabel, wlbeLabel, wrLabel, wrCls, pnlDisp, pnlColor, rows, onTradeLog) {
  const existing = document.getElementById(overlayId);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML =
    '<div class="acc-manager-modal" style="max-width:700px">' +
      '<div class="acc-manager-header" style="gap:10px;flex-wrap:wrap">' +
        '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;flex-wrap:wrap">' +
          '<span style="font-size:15px;font-weight:800;letter-spacing:.4px">' + title + '</span>' +
          '<span class="pill ' + wrCls + '" style="font-size:11px">' + wrLabel + '</span>' +
          '<span style="font-size:11px;color:var(--text2)">' + countLabel + '</span>' +
          '<span style="font-size:11px;color:var(--text2)">' + wlbeLabel + '</span>' +
          '<span style="font-size:11px;font-weight:700;color:' + pnlColor + '">' + pnlDisp + '</span>' +
        '</div>' +
        '<button onclick="document.getElementById(\'' + overlayId + '\').remove()" class="acc-mgr-close">&times;</button>' +
      '</div>' +
      '<div class="acc-manager-body" style="padding:0;max-height:58vh;overflow-y:auto">' +
        '<div class="data-table-wrap" style="margin:0;border-radius:0;border:none">' +
          '<table class="data-table" style="font-size:12px">' +
            '<thead><tr><th>Date</th><th>Pair</th><th>Side</th><th>R:R</th><th>PnL</th><th>Outcome</th><th>Session</th><th>Account</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
      '<div style="padding:10px 16px;border-top:1px solid var(--glass-border);display:flex;gap:8px;justify-content:flex-end;background:var(--glass-1)">' +
        '<button class="wl-week-btn drill-tradelog-btn" style="font-size:12px">Open in Trade Log &rarr;</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  overlay.querySelector('.drill-tradelog-btn').addEventListener('click', function() {
    overlay.remove();
    if (onTradeLog) onTradeLog();
  });
  requestAnimationFrame(function() { overlay.classList.add('open'); });
}

function drillOpenTrade(id) {
  // Close any open drilldown overlays then open trade detail
  ['kz-drilldown-overlay','strat-drilldown-overlay','month-drilldown-overlay','pair-drilldown-overlay']
    .forEach(function(oid) { const el = document.getElementById(oid); if (el) el.remove(); });
  openDetail(Number(id));
}


function buildKillzoneTable(sortCol) {
  const trades = _getFilteredTrades();
  if (sortCol) {
    if (_sortKz.col === sortCol) _sortKz.dir *= -1;
    else { _sortKz.col = sortCol; _sortKz.dir = -1; }
  }
  const tbody = document.getElementById('kz-table-body');
  const thead = document.getElementById('kz-table-head');
  if (!tbody) return;
  const KZ_META = { 'London':{'icon':icon('clock')},'New York':{'icon':icon('clock')},'Asian':{'icon':icon('clock')},'Tokyo':{'icon':icon('clock')} };
  const sessions = [...new Set(trades.map(t => t.kz))].filter(Boolean);
  if (!sessions.length) {
    tbody.innerHTML = _emptyRow(5, icon('clock',{cls:'icn-sm'}) + ' No killzone data yet — tag your trades with a session');
    return;
  }
  let rows = sessions.map(s => {
    const st   = trades.filter(t => t.kz === s);
    const wins = st.filter(t => t.outcome === 'Win').length;
    const wr   = Math.round((wins / st.length) * 100);
    const netDollars = st.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
    const avgDollars = netDollars / st.length;
    const avgPct = _totalPctForGroup(st) / st.length;
    const icon   = (KZ_META[s] || {}).icon || '<svg class="icn" aria-hidden="true"><use href="#ic-clock"></use></svg>';
    return { s, count: st.length, wr, avgDollars, avgPct, st, icon };
  });
  rows.sort((a, b) => {
    if (_sortKz.col === 'session') return a.s < b.s ? _sortKz.dir : a.s > b.s ? -_sortKz.dir : 0;
    const av = _sortKz.col === 'wr' ? a.wr : _sortKz.col === 'pnl' ? a.avgPct : a.count;
    const bv = _sortKz.col === 'wr' ? b.wr : _sortKz.col === 'pnl' ? b.avgPct : b.count;
    return (av - bv) * _sortKz.dir;
  });
  if (thead) thead.innerHTML = `<tr>
    <th class="sortable-th" onclick="buildKillzoneTable('session')">Session ${_sortIndicator('session',_sortKz)}</th>
    <th class="sortable-th" onclick="buildKillzoneTable('trades')">Trades ${_sortIndicator('trades',_sortKz)}</th>
    <th class="sortable-th" onclick="buildKillzoneTable('wr')">Win% ${_sortIndicator('wr',_sortKz)}</th>
    <th class="sortable-th" onclick="buildKillzoneTable('pnl')">Avg PnL ${_sortIndicator('pnl',_sortKz)}</th>
    <th>Grade</th></tr>`;
  tbody.innerHTML = rows.map(({s,count,wr,avgDollars,avgPct,st,icon}) => {
    const wrClass    = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
    const pnlClass   = avgPct >= 0 ? 'outcome-win' : 'outcome-loss';
    const grade      = wr >= 80 ? 'A+' : wr >= 70 ? 'A' : wr >= 60 ? 'B' : wr >= 50 ? 'C' : 'D';
    const gradeClass = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
    const pnlDisp    = _fmtAvgPnl(avgDollars, st);
    const kzRowClass = s === 'London' ? 'kz-row-london' : s === 'New York' ? 'kz-row-ny' : s === 'Asian' ? 'kz-row-asian' : '';
    return `<tr class="pair-row-clickable ${kzRowClass}" onclick="openKzDrilldown(this.dataset.s)" data-s="${s}" style="cursor:pointer"><td class="bold">${kzPill(s)}</td><td>${count}</td><td><span class="pill ${wrClass}">${wr}%</span></td><td class="${pnlClass}" style="font-size:11px">${pnlDisp}</td><td><span class="pill ${gradeClass}">${grade}</span></td></tr>`;
  }).join('');
}

function buildStrategyTable(sortCol) {
  const trades = _getFilteredTrades();
  if (sortCol) {
    if (_sortStrategy.col === sortCol) _sortStrategy.dir *= -1;
    else { _sortStrategy.col = sortCol; _sortStrategy.dir = -1; }
  }
  const tbody = document.getElementById('strategy-table-body');
  const thead = document.getElementById('strategy-table-head');
  if (!tbody) return;
  const tagged   = trades.filter(t => t.strategy && t.strategy.trim());
  const untagged = trades.filter(t => !t.strategy || !t.strategy.trim());
  const strategies = [...new Set(tagged.map(t => t.strategy))];
  if (!trades.length) {
    tbody.innerHTML = _emptyRow(4, '<svg class="icn" aria-hidden="true"><use href="#ic-ruler"></use></svg> No strategies tagged yet — add a strategy when logging trades');
    return;
  }
  let rows = strategies.map(s => {
    const st   = tagged.filter(t => t.strategy === s);
    const wins = st.filter(t => t.outcome === 'Win').length;
    const wr   = Math.round((wins / st.length) * 100);
    const netDollars = st.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
    const avgDollars = netDollars / st.length;
    const avgPct = _totalPctForGroup(st) / st.length;
    return { s, count: st.length, wr, avgDollars, avgPct, st };
  });
  rows.sort((a, b) => {
    if (_sortStrategy.col === 'strategy') return a.s < b.s ? _sortStrategy.dir : a.s > b.s ? -_sortStrategy.dir : 0;
    const av = _sortStrategy.col === 'wr' ? a.wr : _sortStrategy.col === 'pnl' ? a.avgPct : a.count;
    const bv = _sortStrategy.col === 'wr' ? b.wr : _sortStrategy.col === 'pnl' ? b.avgPct : b.count;
    return (av - bv) * _sortStrategy.dir;
  });
  if (thead) thead.innerHTML = `<tr>
    <th class="sortable-th" onclick="buildStrategyTable('strategy')">Model ${_sortIndicator('strategy',_sortStrategy)}</th>
    <th class="sortable-th" onclick="buildStrategyTable('trades')">Trades ${_sortIndicator('trades',_sortStrategy)}</th>
    <th class="sortable-th" onclick="buildStrategyTable('wr')">Win% ${_sortIndicator('wr',_sortStrategy)}</th>
    <th class="sortable-th" onclick="buildStrategyTable('pnl')">Avg PnL ${_sortIndicator('pnl',_sortStrategy)}</th></tr>`;
  const htmlRows = rows.map(({s,count,wr,avgDollars,avgPct,st}) => {
    const wrClass  = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
    const pnlClass = avgPct >= 0 ? 'outcome-win' : 'outcome-loss';
    const pnlDisp  = _fmtAvgPnl(avgDollars, st);
    return `<tr class="pair-row-clickable" onclick="openStratDrilldown(this.dataset.s)" data-s="${s}" style="cursor:pointer"><td class="bold">${s}</td><td>${count}</td><td><span class="pill ${wrClass}">${wr}%</span></td><td class="${pnlClass}" style="font-size:11px">${pnlDisp}</td></tr>`;
  });
  if (untagged.length) {
    const uw = untagged.filter(t => t.outcome === 'Win').length;
    const uwr = Math.round((uw / untagged.length) * 100);
    const uNetDollars = untagged.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
    const uAvgDollars = uNetDollars / untagged.length;
    const uwc = uwr >= 70 ? 'pill-green' : uwr >= 50 ? 'pill-gold' : 'pill-red';
    const upc = _totalPctForGroup(untagged)/untagged.length >= 0 ? 'outcome-win' : 'outcome-loss';
    const uDisp = _fmtAvgPnl(uAvgDollars, untagged);
    htmlRows.push(`<tr class="pair-row-clickable" onclick="openStratDrilldown('untagged')" style="cursor:pointer"><td class="bold" style="color:var(--text2)">Untagged</td><td>${untagged.length}</td><td><span class="pill ${uwc}">${uwr}%</span></td><td class="${upc}" style="font-size:11px">${uDisp}</td></tr>`);
  }
  tbody.innerHTML = htmlRows.join('');
}

function buildMonthlyTable(sortCol) {
  const trades = _getFilteredTrades();
  if (sortCol) {
    if (_sortMonthly.col === sortCol) _sortMonthly.dir *= -1;
    else { _sortMonthly.col = sortCol; _sortMonthly.dir = -1; }
  }
  const tbody = document.getElementById('monthly-table-body');
  const thead = document.getElementById('monthly-table-head');
  if (!tbody) return;
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (!trades.length) {
    tbody.innerHTML = _emptyRow(8, '<svg class="icn" aria-hidden="true"><use href="#ic-calendar"></use></svg> No trades logged yet — tap <strong>+ New Trade</strong> to begin');
    return;
  }
  const monthKeys = [...new Set(trades.map(t => t.date.slice(0, 7)))];
  let rows = monthKeys.map(key => {
    const [yr, mo] = key.split('-').map(Number);
    const mt    = trades.filter(t => t.date.startsWith(key));
    const wins  = mt.filter(t => t.outcome === 'Win').length;
    const wr    = Math.round((wins / mt.length) * 100);
    const netDollars = mt.reduce((a, t) => a + toPnlDollars(t, getAccSizeForAccount(t.account)), 0);
    const netPct = _totalPctForGroup(mt);
    // Same reversal fix as the dashboard KPI streak — see updateKPIs() for details.
    const sorted = [...mt].reverse().sort((a, b) => a.date.localeCompare(b.date));
    let bestStreak = 0, cur = 0;
    sorted.forEach(t => { if (t.outcome === 'Win') { cur++; if (cur > bestStreak) bestStreak = cur; } else cur = 0; });
    const _mWins = mt.filter(t => _pctOfTrade(t) > 0);
    const _mLoss = mt.filter(t => _pctOfTrade(t) < 0);
    const _mAvgW = _mWins.length ? (_mWins.reduce((a,t)=>a+_pctOfTrade(t),0)/_mWins.length).toFixed(1) : null;
    const _mAvgL = _mLoss.length ? (_mLoss.reduce((a,t)=>a+_pctOfTrade(t),0)/_mLoss.length).toFixed(1) : null;
    return { key, yr, mo, mt, wins, wr, netDollars, netPct, bestStreak, _mAvgW, _mAvgL };
  });
  // Sort
  rows.sort((a, b) => {
    if (_sortMonthly.col === 'month') return a.key < b.key ? _sortMonthly.dir : a.key > b.key ? -_sortMonthly.dir : 0;
    const av = _sortMonthly.col === 'wr' ? a.wr : _sortMonthly.col === 'pnl' ? a.netPct : _sortMonthly.col === 'streak' ? a.bestStreak : a.mt.length;
    const bv = _sortMonthly.col === 'wr' ? b.wr : _sortMonthly.col === 'pnl' ? b.netPct : _sortMonthly.col === 'streak' ? b.bestStreak : b.mt.length;
    return (av - bv) * _sortMonthly.dir;
  });
  if (thead) thead.innerHTML = `<tr>
    <th class="sortable-th" onclick="buildMonthlyTable('month')">Month ${_sortIndicator('month',_sortMonthly)}</th>
    <th class="sortable-th" onclick="buildMonthlyTable('trades')">Trades ${_sortIndicator('trades',_sortMonthly)}</th>
    <th class="sortable-th" onclick="buildMonthlyTable('wr')">Win% ${_sortIndicator('wr',_sortMonthly)}</th>
    <th class="sortable-th" onclick="buildMonthlyTable('pnl')">Net PnL ${_sortIndicator('pnl',_sortMonthly)}</th>
    <th>Avg Win</th><th>Avg Loss</th>
    <th class="sortable-th" onclick="buildMonthlyTable('streak')">Streak ${_sortIndicator('streak',_sortMonthly)}</th>
    <th>Grade</th></tr>`;
  tbody.innerHTML = rows.map(({key,yr,mo,mt,wins,wr,netDollars,netPct,bestStreak,_mAvgW,_mAvgL}) => {
    const wrClass    = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
    const pnlClass   = netPct >= 0 ? 'outcome-win' : 'outcome-loss';
    const grade      = wr >= 80 ? 'A+' : wr >= 70 ? 'A' : wr >= 60 ? 'B' : wr >= 50 ? 'C' : 'D';
    const gradeClass = wr >= 70 ? 'pill-green' : wr >= 50 ? 'pill-gold' : 'pill-red';
    const pnlDisp    = _fmtGroupPnl(netDollars, mt);
    return `<tr class="pair-row-clickable" onclick="openMonthDrilldown(this.dataset.k)" data-k="${key}" style="cursor:pointer">
      <td class="bold">${MONTH_NAMES[mo - 1]} ${yr}</td>
      <td>${mt.length}</td>
      <td><span class="pill ${wrClass}">${wr}%</span></td>
      <td class="${pnlClass} mono" style="font-size:11px">${pnlDisp}</td>
      <td class="outcome-win mono" style="font-size:11px">${_mAvgW !== null ? '+'+_mAvgW+'%' : '—'}</td>
      <td class="outcome-loss mono" style="font-size:11px">${_mAvgL !== null ? _mAvgL+'%' : '—'}</td>
      <td>${bestStreak > 0 ? bestStreak + 'W' : '—'}</td>
      <td><span class="pill ${gradeClass}">${grade}</span></td>
    </tr>`;
  }).join('');
}

function refreshPairFilter() {
  const sel = document.getElementById('filter-pair');
  if (!sel) return;
  const cur = sel.value;
  const pairs = [...new Set(trades.map(t => t.pair))].sort();
  sel.innerHTML = '<option value="">All pairs</option>' + pairs.map(p => `<option${p === cur ? ' selected' : ''}>${p}</option>`).join('');
}

// ── TRADE TABLE ───────────────────────────────────────
function starsHTML(n) { n = Math.max(3, Math.min(5, n || 3)); return icon('star').repeat(n) + '<span class="empty">' + icon('star').repeat(5 - n) + '</span>'; }

/* Semantic killzone pill — maps session name → colour class */
function kzPill(session) {
  if (!session) return '<span class="pill pill-grey">—</span>';
  const map = {
    'London':   'kz-pill-london',
    'New York': 'kz-pill-ny',
    'Asian':    'kz-pill-asian',
    'Tokyo':    'kz-pill-asian'
  };
  const cls = map[session] || 'pill pill-grey';
  return `<span class="${cls}">${icon('clock',{cls:'icn-sm'})} ${session}</span>`;
}

/* Semantic killzone text colour (for plain-text cells) */
function kzColor(session) {
  const map = { 'London': 'var(--kz-london)', 'New York': 'var(--kz-ny)', 'Asian': 'var(--kz-asian)', 'Tokyo': 'var(--kz-asian)' };
  return map[session] || 'var(--text2)';
}
let _bulkSelected = new Set();

function renderTradeTable(list) {
  const tbody = document.getElementById('trade-table-body');
  const theadChk = document.getElementById('tl-select-all-th');
  if (theadChk) theadChk.innerHTML = `<input type="checkbox" id="bulk-select-all" onchange="bulkSelectAll(this.checked)" title="Select all">`;
  tbody.innerHTML = list.length ? list.map(t => {
    const pnlC = t.pnl > 0 ? 'outcome-win' : t.pnl < 0 ? 'outcome-loss' : 'outcome-be';
    const outC = t.outcome === 'Win' ? 'outcome-win' : t.outcome === 'Loss' ? 'outcome-loss' : 'outcome-be';
    const posC = t.pos === 'Buy' ? 'pos-buy' : 'pos-sell';
    const chk  = _bulkSelected.has(t.id) ? ' checked' : '';
    return `<tr class="trade-log-row${_bulkSelected.has(t.id)?' bulk-selected':''}" onmouseenter="showRowActions(${t.id},this)" onmouseleave="hideRowActions(${t.id})" onclick="openDetail(${t.id})">
      <td onclick="event.stopPropagation()" style="width:32px;padding:0 8px"><input type="checkbox" class="bulk-chk" data-id="${t.id}"${chk} onchange="bulkToggle(${t.id},this.checked)"></td>
      <td class="mono" style="color:var(--text2)">${t.date}</td>
      <td class="bold">${t.pair}</td>
      <td><span class="${posC}">${t.pos}</span></td>
      <td class="mono">${t.rr}</td>
      <td class="${pnlC} mono">${_pnlLabel(t)}</td>
      <td class="${outC}">${t.outcome}</td>
      <td>${kzPill(t.kz)}</td>
      <td style="color:var(--text2);font-size:12px">${t.strategy || '—'}</td>
      <td style="color:var(--text2);font-size:12px">${t.account}</td>
      <td class="stars">${starsHTML(t.rating)}</td>
      <td class="row-actions" id="ra-${t.id}" style="white-space:nowrap;opacity:0;transition:opacity .15s">
        <button onclick="event.stopPropagation();openDetail(${t.id},true)" style="background:rgba(58,134,255,.15);border:1px solid rgba(58,134,255,.3);color:var(--blue);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:4px"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
        <button onclick="event.stopPropagation();duplicateTrade(${t.id})" title="Duplicate trade" style="background:rgba(58,134,255,.12);border:1px solid rgba(58,134,255,.25);color:var(--blue);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;margin-right:4px"><svg class="icn" aria-hidden="true"><use href="#ic-copy"></use></svg></button>
        <button onclick="event.stopPropagation();quickDelete(${t.id})" style="background:rgba(230,57,70,.12);border:1px solid rgba(230,57,70,.25);color:var(--red);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg></button>
      </td>
    </tr>`;
  }).join('') : _emptyRow(12, '<svg class="icn" aria-hidden="true"><use href="#ic-clipboard"></use></svg> No trades match your filter — try adjusting the search or filters above');
  const countEl = document.getElementById('trade-count');
  if (countEl) {
    const sumPct = list.reduce((a, t) => a + _pnlPctValue(t), 0);
    countEl.textContent = `Showing ${list.length} of ${trades.length} trades · Sum PnL: ${sumPct.toFixed(1)}%`;
  }
  _updateBulkBar();
  document.querySelectorAll('#trade-table-body tr').forEach((row, i) => {
    row.style.opacity = '0'; row.style.transform = 'translateY(6px)';
    row.style.transition = `opacity 0.18s ${i * 0.02}s ease,transform 0.18s ${i * 0.02}s ease`;
    setTimeout(() => { row.style.opacity = ''; row.style.transform = ''; }, 10);
  });
  // Rows just landed via innerHTML, which can trigger the browser's
  // scroll-anchoring to nudge the wrap's horizontal scroll away from 0,
  // clipping the first data column under the sticky checkbox column.
  // Snap it back explicitly.
  const wrap = tbody.closest('.data-table-wrap');
  if (wrap) {
    wrap.scrollLeft = 0;
    requestAnimationFrame(() => { wrap.scrollLeft = 0; });
  }
}

function bulkToggle(id, checked) {
  if (checked) _bulkSelected.add(id); else _bulkSelected.delete(id);
  const row = document.querySelector(`tr[class*="trade-log-row"] input[data-id="${id}"]`)?.closest('tr');
  if (row) row.classList.toggle('bulk-selected', checked);
  _updateBulkBar();
}
function bulkSelectAll(checked) {
  document.querySelectorAll('.bulk-chk').forEach(chk => {
    const id = parseInt(chk.dataset.id);
    chk.checked = checked;
    if (checked) _bulkSelected.add(id); else _bulkSelected.delete(id);
    chk.closest('tr')?.classList.toggle('bulk-selected', checked);
  });
  _updateBulkBar();
}
function _updateBulkBar() {
  const bar = document.getElementById('bulk-action-bar');
  if (!bar) return;
  const n = _bulkSelected.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  const lbl = bar.querySelector('#bulk-count-lbl');
  if (lbl) lbl.textContent = n + ' trade' + (n !== 1 ? 's' : '') + ' selected';
}
async function bulkDeleteSelected() {
  const n = _bulkSelected.size;
  if (!n) return;
  if (!confirm(`Move ${n} trade${n!==1?'s':''} to trash?`)) return;
  const ids = [..._bulkSelected];
  for (const id of ids) {
    const t = trades.find(x => x.id === id);
    if (t) await _cloudSoftDelete(t);
  }
  _bulkSelected.clear();
  _updateBulkBar();
  _playChime('delete');
  showToast(`${n} trade${n!==1?'s':''} moved to trash`, 'danger');
}

/* Duplicate a single trade: clones every field (except id/timestamps) into a
   new row. Chart images are intentionally NOT copied since they live in
   per-trade storage paths — the duplicate starts with a clean charts slot. */
async function duplicateTrade(id) {
  const orig = trades.find(x => x.id === id);
  if (!orig) return;

  const dupRow = {
    user_id:       _currentUser.id,
    trade_date:    orig.date,
    pair:          orig.pair,
    pos:           orig.pos,
    rr:            orig.rr,
    pnl:           orig.pnl,
    pnl_unit:      orig.pnlUnit || '%',
    outcome:       orig.outcome,
    kz:            orig.kz,
    strategy:      orig.strategy || '',
    tf:            orig.tf || '',
    account:       orig.account,
    rating:        orig.rating,
    risk:          orig.risk,
    notes:         orig.notes || '',
    pretrade:      orig.pretrade || '',
    emotion:       orig.emotion || 'Focused',
    loss_reason:   orig.lossReason || '',
    followed_plan: orig.followedPlan || 'Yes',
    checklist:     [...(orig.checklist || [])],
    charts:        [],
    chart_labels:  [...CHART_LABELS],
    mistakes:      '',
  };

  const { data, error } = await sb.from('journal_trades').insert(dupRow).select().single();
  if (error) {
    showToast('Error duplicating trade: ' + error.message, 'danger');
    return;
  }

  const t = _rowToTrade(data);
  trades.unshift(t);
  trades.sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id));
  tradeState[t.id] = {
    notes: t.notes, pretrade: t.pretrade, emotion: t.emotion || 'Calm',
    checklist: [...(t.checklist || [])], charts: [], chartLabels: [...CHART_LABELS], mistakes: '',
  };

  _refreshAll();
  renderTradeTable(trades);
  _playChime('save');
  showToast(t.pair + ' trade duplicated ✓', 'restore');
  return t;
}

/* Duplicate every currently checkbox-selected trade in the Trade Log. */
async function bulkDuplicateSelected() {
  const n = _bulkSelected.size;
  if (!n) return;
  const ids = [..._bulkSelected];
  let copied = 0;
  for (const id of ids) {
    const t = await duplicateTrade(id);
    if (t) copied++;
  }
  _bulkSelected.clear();
  _updateBulkBar();
  document.querySelectorAll('.bulk-chk').forEach(c => c.checked = false);
  document.querySelectorAll('.bulk-selected').forEach(r => r.classList.remove('bulk-selected'));
  showToast(`${copied} trade${copied !== 1 ? 's' : ''} duplicated`, 'restore');
}

function showRowActions(id, row) { const el = document.getElementById('ra-' + id); if (el) el.style.opacity = '1'; }
function hideRowActions(id) { const el = document.getElementById('ra-' + id); if (el) el.style.opacity = '0'; }
let _lastFilteredList = [];

function filterTable() {
  const q  = document.getElementById('search-input').value.toLowerCase();
  const oc = document.getElementById('filter-outcome').value;
  const kz = document.getElementById('filter-kz').value;
  const pr = document.getElementById('filter-pair').value;
  _lastFilteredList = trades.filter(t => {
    // Extended full-text search: pair, date, killzone, strategy, notes, emotion, pretrade
    const qs = !q || [t.pair, t.date, t.kz, t.strategy, t.notes, t.emotion, t.pretrade, t.mistakes]
      .some(f => (f || '').toLowerCase().includes(q));
    return qs && (!oc || t.outcome === oc) && (!kz || t.kz === kz) && (!pr || t.pair === pr);
  });
  renderTradeTable(_lastFilteredList);
}

function exportTradesToCSV() {
  const list = _lastFilteredList.length ? _lastFilteredList : trades;
  if (!list.length) { showToast('No trades to export', 'danger'); return; }
  const headers = ['Date','Pair','Position','R:R','PnL','Outcome','Killzone','Model','Account','Rating','Notes','Emotion'];
  const rows = list.map(t => [
    t.date, t.pair, t.pos, t.rr,
    _pnlLabel(t),
    t.outcome, t.kz, t.strategy || '',
    t.account, t.rating,
    '"' + (t.notes || '').replace(/"/g, '""') + '"',
    t.emotion || ''
  ].join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'NxTGen_Trades_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV exported ✓', 'restore');
}

// ── TRADE DETAIL PANEL ────────────────────────────────
function openDetail(id, editMode) {
  if (currentDetail !== id) { _detActiveTab = 'overview'; _detEditMode = false; }
  currentDetail = id;
  _detEditMode = editMode || false;
  if (!_detActiveTab) _detActiveTab = 'overview';
  _renderDetail(id);
  document.getElementById('detail-panel').classList.add('open');

  // Charts are fetched lazily (not part of the bulk trade load) — pull them
  // in now and re-render once they land, without blocking the rest of the panel.
  _ensureChartsLoaded(id).then(() => {
    if (currentDetail === id) _renderDetail(id);
  });
}

function _renderDetail(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  const s = getTS(id);
  const pnlC = t.pnl > 0 ? 'green' : t.pnl < 0 ? 'red' : 'blue';
  const expandIcon = _detFullscreen ? '⊡' : '⤢';
  const expandTip = _detFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen';

  const panelHeader = `
    <div class="det-panel-header">
      <div style="display:flex;align-items:center;gap:8px">
        ${_detEditMode
          ? `<button class="det-btn edit-active" onclick="_toggleEditMode(${id})" style="padding:5px 10px"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg> Cancel</button>
             <button class="det-btn" onclick="_saveEdit(${id})" style="background:rgba(52,211,153,.15);border-color:var(--green);color:var(--green);padding:5px 10px"><svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Changes</button>`
          : `<button class="det-btn" onclick="_toggleEditMode(${id})" style="padding:5px 10px"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit</button>
             <button class="det-btn del-btn" onclick="_confirmDelete(${id})" style="padding:5px 10px"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Delete</button>
             <button class="det-btn det-share-btn" onclick="openShareModal(${id})" style="padding:5px 10px" title="Share trade card"><svg class="icn" aria-hidden="true"><use href="#ic-upload"></use></svg> Share</button>`
        }
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="det-panel-expand" onclick="toggleDetailSize(${id})" title="${expandTip}">${expandIcon}</button>
        <button class="det-panel-close" onclick="closeDetail()" title="Close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
    </div>`;

  const header = `
    <div class="detail-pair" style="background:linear-gradient(135deg,var(--text) 0%,var(--text2) 100%);-webkit-background-clip:text;background-clip:text">${t.pair}</div>
    <div class="detail-meta">${t.date} · ${t.pos} · ${t.account}</div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <span class="pill ${t.outcome === 'Win' ? 'pill-green' : t.outcome === 'Loss' ? 'pill-red' : 'pill-blue'}">${t.outcome}</span>
      <span class="pill ${t.pos === 'Buy' ? 'pill-green' : 'pill-red'}">${t.pos}</span>
      <span class="pill pill-grey">${t.rr}</span>
      <span class="pill pill-grey">${kzPill(t.kz)}</span>
    </div>`;

  const tabsHTML = ['overview', 'charts', 'notes', 'review'].map(tab => `
    <div class="det-tab${_detActiveTab === tab ? ' active' : ''}" data-tab="${tab}" onclick="_switchDetTab('${tab}',${id})">
      ${tab === 'overview' ? 'Overview' : tab === 'charts' ? '<svg class="icn" aria-hidden="true"><use href="#ic-camera"></use></svg> Charts' : tab === 'notes' ? '<svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Notes' : '<svg class="icn" aria-hidden="true"><use href="#ic-search"></use></svg> Review'}
    </div>`).join('');

  const viewStats = `
    <div class="view-stats-grid">
      <div class="view-stat-card">
        <div class="view-stat-label">PnL</div>
        <div class="view-stat-val ${pnlC}">${formatPnl(t, getAccSizeForAccount(t.account))}</div>
      </div>
      <div class="view-stat-card">
        <div class="view-stat-label">Risk : Reward</div>
        <div class="view-stat-val">${t.rr}</div>
      </div>
      <div class="view-stat-card">
        <div class="view-stat-label">Model</div>
        <div class="view-stat-val view-stat-val-sm">${t.strategy || '—'}</div>
      </div>
      <div class="view-stat-card">
        <div class="view-stat-label">TF Alignment</div>
        <div class="view-stat-val view-stat-val-sm">${t.tf || '—'}</div>
      </div>
      <div class="view-stat-card">
        <div class="view-stat-label">Risk per Trade</div>
        <div class="view-stat-val">${t.risk || '—'}</div>
      </div>
      <div class="view-stat-card">
        <div class="view-stat-label">Rating</div>
        <div class="view-stat-val stars">${starsHTML(t.rating)}</div>
      </div>
    </div>
    <div id="del-confirm-area"></div>`;

  const editForm = `
    <div class="form-grid" style="margin-bottom:14px">
      <div class="form-field"><label class="form-label">Date</label><input type="date" class="form-input" id="e-date" value="${t.date}"></div>
      <div class="form-field"><label class="form-label">Pair</label><input type="text" class="form-input" id="e-pair" value="${t.pair}"></div>
      <div class="form-field"><label class="form-label">Position</label><select class="form-select" id="e-pos"><option${t.pos === 'Buy' ? ' selected' : ''}>Buy</option><option${t.pos === 'Sell' ? ' selected' : ''}>Sell</option></select></div>
      <div class="form-field"><label class="form-label">R:R</label><input type="text" class="form-input" id="e-rr" value="${t.rr}"></div>
      <div class="form-field"><label class="form-label">PnL <select id="e-pnlunit" class="form-select" style="display:inline-block;width:auto;padding:1px 6px;font-size:11px;margin-left:4px;height:22px;vertical-align:middle"><option value="%"${(!t.pnlUnit||t.pnlUnit==='%')?'selected':''}>%</option><option value="$"${t.pnlUnit==='$'?'selected':''}>$</option></select></label><input type="number" class="form-input" id="e-pnl" step="0.01" value="${t.pnl}"></div>
      <div class="form-field"><label class="form-label">Outcome</label><select class="form-select" id="e-outcome"><option${t.outcome === 'Win' ? ' selected' : ''}>Win</option><option${t.outcome === 'Loss' ? ' selected' : ''}>Loss</option><option${t.outcome === 'B.E' ? ' selected' : ''}>B.E</option></select></div>
      <div class="form-field"><label class="form-label">Killzone</label><select class="form-select" id="e-kz"><option${t.kz === 'London' ? ' selected' : ''}>London</option><option${t.kz === 'New York' ? ' selected' : ''}>New York</option><option${t.kz === 'Asian' ? ' selected' : ''}>Asian</option></select></div>
      <div class="form-field"><label class="form-label">Risk per Trade</label><input type="text" class="form-input" id="e-risk" value="${t.risk || ''}" placeholder="e.g. 0.5%"></div>
      <div class="form-field" style="grid-column:span 2"><label class="form-label" style="display:flex;align-items:center;justify-content:space-between">Account <button type="button" onclick="_openManageAccounts()" style="font-size:10px;padding:2px 8px;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.25);color:var(--blue);border-radius:4px;cursor:pointer;font-family:inherit"><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Manage</button></label><select class="form-select" id="e-acc">${_buildAccountOptions(t.account)}</select></div>
      <div class="form-field"><label class="form-label">Model</label><select class="form-select" id="e-strat" onchange="_handleCustomSelect(this,'e-strat-custom')">${_buildStrategyOptions(t.strategy)}</select><input type="text" class="form-input" id="e-strat-custom" placeholder="Enter model name…" style="display:none;margin-top:6px" value="${_getActiveStrategies().find(m=>(m.strategyName||m.title)===t.strategy) ? '' : (t.strategy||'')}"></div>
      <div class="form-field"><label class="form-label">TF Alignment</label><select class="form-select" id="e-tf" onchange="_handleCustomSelect(this,'e-tf-custom')"><option${t.tf === '30m > 3m' ? ' selected' : ''}>30m > 3m</option><option${t.tf === '1h > 5m' ? ' selected' : ''}>1h > 5m</option><option${t.tf === '1h > 3m' ? ' selected' : ''}>1h > 3m</option><option${t.tf === '4h > 15m' ? ' selected' : ''}>4h > 15m</option><option${t.tf === 'D1 > 1h' ? ' selected' : ''}>D1 > 1h</option><option${t.tf === '15m > 1m' ? ' selected' : ''}>15m > 1m</option><option${t.tf === '15m > 3m' ? ' selected' : ''}>15m > 3m</option><option value="__custom__">＋ Custom…</option></select><input type="text" class="form-input" id="e-tf-custom" placeholder="e.g. 2h > 5m" style="display:none;margin-top:6px" value="${['30m > 3m','1h > 5m','1h > 3m','4h > 15m','D1 > 1h','15m > 1m','15m > 3m'].includes(t.tf) ? '' : t.tf}"></div>
    </div>
    <div class="form-field" style="margin-bottom:10px"><label class="form-label">Rating <span style="font-size:10px;color:var(--text3);font-weight:400;text-transform:none">(tap a star)</span></label>
      <div id="star-editor" data-rating="${t.rating}" class="star-editor-row">
        ${[3,4,5].map(n => `<span class="star-opt${n === t.rating ? ' selected' : ''}" onclick="setStarRating(${id},${n})" title="${n} stars"><span class="star-pips">${icon('star').repeat(n)}${icon('star-o').repeat(5-n)}</span><span class="star-lbl">${n}${icon('star',{cls:'icn-sm'})}</span></span>`).join('')}
      </div>
    </div>
    <div id="del-confirm-area"></div>`;

  const checklistHTML = `
    <div class="detail-section">
      <div class="detail-section-label">Entry Checklist</div>
      <div class="checklist-grid">${CHECKLIST_ITEMS.map((item, i) => {
        const checked = (s.checklist || []).includes(i);
        return `<div class="cl-item${checked ? ' checked' : ''}" onclick="toggleCheck(${id},${i})"><div class="cl-box">${checked ? '✓' : ''}</div><span class="cl-text">${item}</span></div>`;
      }).join('')}</div>
    </div>`;

  const emotionHTML = `
    <div class="detail-section">
      <div class="detail-section-label">Emotion <span style="font-size:10px;color:var(--text3);font-weight:400;text-transform:none;letter-spacing:0">(tap to select)</span></div>
      <div class="emo-chip-grid">
        ${EMOTIONS.map(e => `<span class="emo-chip${(s.emotion || 'Calm') === e ? ' active' : ''}" onclick="setEmo(${id},'${e}')">${_emoIcon(e)} ${e}</span>`).join('')}
      </div>
    </div>`;

  const chartLabels = s.chartLabels && s.chartLabels.length ? s.chartLabels : [...CHART_LABELS];
  const chartsContent = `
    <div class="det-tab-content${_detActiveTab === 'charts' ? ' active' : ''}" data-tab="charts">
      <div class="detail-section">
        <div class="detail-section-label" style="display:flex;align-items:center;justify-content:space-between">
          Chart Screenshots
          <button onclick="addChartSlot(${id})" style="font-size:11px;padding:3px 10px;background:var(--blue-dim);border:1px solid rgba(96,165,250,.3);color:var(--blue);border-radius:4px;cursor:pointer">+ Add slot</button>
        </div>
        <div class="chart-sort-hint" id="chart-sort-hint-${id}">
          ${_detEditMode
            ? '<span>⠿ Hold &amp; drag to reorder · Tap slot to replace image</span>'
            : '<span>Tap a chart to view · <svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit to replace</span>'}
        </div>
        <div class="chart-sort-grid" id="chart-sort-grid-${id}" data-tradeid="${id}">
          ${chartLabels.map((lbl, i) => {
            const hasImg = !!(s.charts || [])[i];
            return `
            <div class="chart-sort-item${hasImg ? ' has-img' : ''}"
                 data-index="${i}"
                 draggable="${_detEditMode ? 'true' : 'false'}"
                 ondragstart="cssDragStart(event,${id})"
                 ondragover="cssDragOver(event)"
                 ondragenter="cssDragEnter(event)"
                 ondragleave="cssDragLeave(event)"
                 ondrop="cssDrop(event,${id})"
                 ondragend="cssDragEnd(event)"
                 ontouchstart="cssTouchStart(event,${id})"
                 ontouchmove="cssTouchMove(event)"
                 ontouchend="cssTouchEnd(event,${id})">
              <div class="chart-sort-thumb${_detEditMode ? ' edit-mode' : ''}"
                   ${_detEditMode ? `tabindex="0" role="button" aria-label="${hasImg ? `Replace ${lbl} chart image` : `Add ${lbl} chart image`}"` : (hasImg ? `tabindex="0" role="button" aria-label="View ${lbl} chart image full size"` : '')}
                   onclick="${hasImg && !_detEditMode ? `openLightboxById(${id},${i})` : (_detEditMode ? `triggerImg(${id},${i})` : '')}"
                   onkeydown="if((event.key==='Enter'||event.key===' ')){event.preventDefault();${hasImg && !_detEditMode ? `openLightboxById(${id},${i})` : (_detEditMode ? `triggerImg(${id},${i})` : '')}}"
                   ${_detEditMode ? `onpaste="_chartSlotPaste(event,${id},${i})"` : ''}>
                ${hasImg
                  ? `<img src="${s.charts[i]}" alt="${lbl}" draggable="false">
                     <div class="chart-sort-overlay">${_detEditMode ? '<span class="drag-handle">⠿</span><svg class="icn" aria-hidden="true"><use href="#ic-refresh"></use></svg>' : '<svg class="icn" aria-hidden="true"><use href="#ic-search"></use></svg> View'}</div>`
                  : `<div class="chart-sort-empty"><span><svg class="icn" aria-hidden="true"><use href="#ic-camera"></use></svg></span><span>Add chart</span><span class="chart-sort-empty-hint">or drag &amp; drop</span></div>`}
              </div>
              <div class="chart-sort-footer">
                <input type="text" class="chart-sort-label" value="${lbl}"
                  onchange="renameChartSlot(${id},${i},this.value)"
                  onfocus="this.style.borderColor='rgba(96,165,250,.45)'"
                  onblur="this.style.borderColor='var(--glass-border)'"
                  ${!_detEditMode ? 'readonly' : ''}>
                ${_detEditMode ? `<button class="chart-sort-del" onclick="removeChartSlot(${id},${i})" title="Remove slot"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>` : ''}
              </div>
              ${hasImg && _detEditMode ? `<button class="chart-sort-clear" onclick="clearChartImage(${id},${i})"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg> Clear</button>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  const notesContent = `
    <div class="det-tab-content${_detActiveTab === 'notes' ? ' active' : ''}" data-tab="notes">
      <div class="detail-section">
        <div class="detail-section-label">Pre-Trade Notes</div>
        <textarea class="notes-area" id="det-pretrade"
          oninput="getTS(${id}).pretrade=this.value"
          placeholder="Your bias, HTF analysis, setup thesis…"
        >${s.pretrade || t.pretrade || ''}</textarea>
      </div>
      <div class="detail-section">
        <div class="detail-section-label">Trade Reflection</div>
        <textarea class="notes-area" id="det-notes" style="min-height:120px"
          oninput="getTS(${id}).notes=this.value"
          placeholder="What happened? What did you learn?"
        >${s.notes || t.notes || ''}</textarea>
      </div>
      <div class="detail-section">
        <div class="detail-section-label">Mistakes</div>
        <textarea class="notes-area" id="det-mistakes"
          oninput="getTS(${id}).mistakes=this.value"
          placeholder="What mistakes were made, if any?"
        >${s.mistakes || ''}</textarea>
      </div>
      <button class="save-btn" id="det-save" onclick="detSave(${id})"><svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Notes</button>
    </div>`;

  // ── Review Tab ─────────────────────────────────────────────────────────
  const retakeState = s.wouldRetake !== undefined ? s.wouldRetake : t.wouldRetake;
  const checklistScore = ((s.checklist || t.checklist || []).length / CHECKLIST_ITEMS.length * 100).toFixed(0);

  const reviewContent = `
    <div class="det-tab-content${_detActiveTab === 'review' ? ' active' : ''}" data-tab="review">
      <div class="detail-section">
        <div class="detail-section-label">R:R</div>
        <div class="review-rr-grid">
          <div class="review-stat"><div class="review-stat-label">Actual R:R</div><div class="review-stat-val">${t.rr || '—'}</div></div>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-label">Checklist Score</div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:6px">

          <div style="flex:1;height:8px;background:var(--glass-border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${checklistScore}%;background:${parseInt(checklistScore)>=80?'var(--green)':parseInt(checklistScore)>=50?'var(--gold)':'var(--red)'};border-radius:4px;transition:width .4s"></div>
          </div>
          <span style="font-size:13px;font-weight:600;color:${parseInt(checklistScore)>=80?'var(--green)':parseInt(checklistScore)>=50?'var(--gold)':'var(--red)'}">${checklistScore}%</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:6px">${(s.checklist||t.checklist||[]).length} of ${CHECKLIST_ITEMS.length} criteria met</div>
      </div>

      <div class="detail-section">
        <div class="detail-section-label">Would You Take This Trade Again?</div>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="retake-btn${retakeState === true ? ' active-yes' : ''}" onclick="_setRetake(${id},true)"><svg class="icn icn-green" aria-hidden="true"><use href="#ic-check-c"></use></svg> Yes, same setup</button>
          <button class="retake-btn${retakeState === false ? ' active-no' : ''}" onclick="_setRetake(${id},false)"><svg class="icn icn-red" aria-hidden="true"><use href="#ic-close-c"></use></svg> No, avoid next time</button>
        </div>
        ${retakeState !== null && retakeState !== undefined ? `
        <div style="margin-top:10px;padding:10px;background:var(--glass-0);border:1px solid var(--glass-border);border-radius:var(--r-sm);font-size:12px;color:var(--text2)">
          ${retakeState
            ? '<svg class="icn icn-green" aria-hidden="true"><use href="#ic-check-c"></use></svg> Marked as a replicable setup. Add it to your playbook if it isn\'t already.'
            : '<svg class="icn icn-red" aria-hidden="true"><use href="#ic-close-c"></use></svg> Marked to avoid. Review what made this trade suboptimal and document the lesson.'}
        </div>` : ''}
      </div>

      <div class="detail-section">
        <div class="detail-section-label">Trade Quality Score</div>
        <div style="margin-top:8px">
          ${(() => {
            let score = 0, max = 0;
            // Rating (max 40)
            max += 40; score += ((t.rating || 3) / 5) * 40;
            // Checklist (max 30)
            max += 30; score += (parseInt(checklistScore) / 100) * 30;
            // Would retake (max 30)
            max += 30; if (retakeState === true) score += 30; else if (retakeState === false) score += 0; else score += 15;
            const pct = Math.round((score / max) * 100);
            const grade = pct >= 85 ? 'A' : pct >= 70 ? 'B' : pct >= 55 ? 'C' : pct >= 40 ? 'D' : 'F';
            const col = pct >= 85 ? 'var(--green)' : pct >= 70 ? 'var(--teal)' : pct >= 55 ? 'var(--gold)' : 'var(--red)';
            return `<div style="display:flex;align-items:center;gap:16px">
              <div style="font-size:36px;font-weight:700;color:${col};font-family:var(--font-mono)">${grade}</div>
              <div style="flex:1">
                <div style="height:8px;background:var(--glass-border);border-radius:4px;overflow:hidden;margin-bottom:6px">
                  <div style="height:100%;width:${pct}%;background:${col};border-radius:4px;transition:width .4s"></div>
                </div>
                <div style="font-size:12px;color:var(--text3)">${pct}/100 — based on rating, checklist, R:R execution &amp; replay vote</div>
              </div>
            </div>`;
          })()}
        </div>
      </div>
    </div>`;

  const overviewContent = `
    <div class="det-tab-content${_detActiveTab === 'overview' ? ' active' : ''}" data-tab="overview">
      ${_detEditMode ? editForm : viewStats}
      ${_detEditMode ? '' : (checklistHTML + emotionHTML)}
    </div>`;

  document.getElementById('detail-content').innerHTML =
    panelHeader + header +
    `<div class="det-tabs">${tabsHTML}</div>` +
    overviewContent + chartsContent + notesContent + reviewContent;
}

function closeDetail() {
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('open', 'fullscreen');
  _detFullscreen = false;
}
// Close the detail panel when clicking/tapping anywhere outside of it —
// but not when the click is what opened it (a trade row), not while
// another modal/dropdown/popover is open on top of it, and not on the
// chart lightbox — that overlay lives outside #detail-panel in the DOM
// (it's appended to <body>) even though it visually sits "on top of" the
// panel, so without this check every click inside the lightbox — including
// its own tap-to-close — was caught here first and closed the whole
// maximized panel underneath it instead of just the lightbox.
document.addEventListener('click', (e) => {
  const panel = document.getElementById('detail-panel');
  if (!panel || !panel.classList.contains('open')) return;
  if (panel.contains(e.target)) return;
  if (e.target.closest('[onclick*="openDetail"]')) return;
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('open')) return;
  if (e.target.closest('.mcl-item, .toast, .confirm-dialog, .dropdown-menu, #chart-lightbox')) return;
  closeDetail();
}, true);
function toggleDetailSize(id) {
  const panel = document.getElementById('detail-panel');
  _detFullscreen = !_detFullscreen;
  panel.classList.toggle('fullscreen', _detFullscreen);
  _renderDetail(id);
}
// Drag-to-dismiss on the mobile bottom-sheet's grab handle (the small pill
// drawn via ::before at the top of the panel). The handle itself is a
// pseudo-element so it can't hold its own listeners — instead we watch for
// drags starting within that same top band of the panel.
(function initDetailPanelSwipeToClose() {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;
  const HANDLE_ZONE = 40;       // px from the panel's top counted as the grab band
  const DISMISS_THRESHOLD = 90; // px of downward drag needed to trigger close
  let startY = 0, lastY = 0, dragging = false;

  function isMobileSheet() {
    return window.matchMedia('(max-width: 768px)').matches
      && panel.classList.contains('open')
      && !panel.classList.contains('fullscreen');
  }

  panel.addEventListener('pointerdown', (e) => {
    if (!isMobileSheet()) return;
    const rect = panel.getBoundingClientRect();
    if (e.clientY - rect.top > HANDLE_ZONE) return;
    dragging = true;
    startY = lastY = e.clientY;
    panel.style.transition = 'none';
    panel.style.touchAction = 'none'; // stop the panel's own scroll from stealing the gesture
    panel.setPointerCapture?.(e.pointerId);
  });
  panel.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    lastY = e.clientY;
    const dy = Math.max(0, lastY - startY);
    panel.style.transform = `translateX(0) translateY(${dy}px)`;
  });
  // Backup for Android Chrome, where touch-action isn't always honored
  // mid-gesture once a scroll/overscroll bounce has already begun —
  // explicitly block the native touchmove while a drag is active.
  panel.addEventListener('touchmove', (e) => {
    if (dragging) e.preventDefault();
  }, { passive: false });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const dy = Math.max(0, lastY - startY);
    panel.style.transition = '';
    panel.style.transform = '';
    panel.style.touchAction = '';
    if (dy > DISMISS_THRESHOLD) closeDetail();
  }
  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);
})();

// Drag-to-resize the detail panel's left edge — desktop only. Mobile uses the
// full-width bottom sheet above, and fullscreen mode is a fixed 100vw state,
// so both are excluded here rather than fighting over inline width.
(function initDetailPanelResize() {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;

  const MIN_WIDTH = 360;
  const DEFAULT_WIDTH = 420;
  const STORAGE_KEY = 'detailPanelWidth';

  function isDesktop() {
    return window.matchMedia('(min-width: 769px)').matches;
  }
  function maxWidth() {
    // Leave room for the rest of the app so the panel can't swallow the whole viewport
    return Math.max(MIN_WIDTH, Math.min(900, window.innerWidth - 320));
  }
  function clamp(w) {
    return Math.max(MIN_WIDTH, Math.min(w, maxWidth()));
  }

  function applySavedWidth() {
    if (!isDesktop()) { panel.style.width = ''; return; }
    const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (saved) panel.style.width = clamp(saved) + 'px';
  }
  applySavedWidth();

  window.addEventListener('resize', () => {
    if (!isDesktop()) { panel.style.width = ''; return; }
    const current = parseInt(panel.style.width, 10);
    if (current) panel.style.width = clamp(current) + 'px';
  });

  let handle = panel.querySelector('.detail-panel-resize-handle');
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'detail-panel-resize-handle';
    handle.title = 'Drag to resize · double-click to reset';
    panel.prepend(handle);
  }

  let dragging = false, startX = 0, startWidth = 0;

  handle.addEventListener('pointerdown', (e) => {
    if (!isDesktop() || panel.classList.contains('fullscreen')) return;
    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    panel.classList.add('resizing');
    document.body.classList.add('detail-resizing');
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = startX - e.clientX; // dragging left widens the panel (it's anchored on the right)
    panel.style.width = clamp(startWidth + dx) + 'px';
  });
  function endResize() {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('resizing');
    document.body.classList.remove('detail-resizing');
    localStorage.setItem(STORAGE_KEY, Math.round(panel.getBoundingClientRect().width));
  }
  handle.addEventListener('pointerup', endResize);
  handle.addEventListener('pointercancel', endResize);
  handle.addEventListener('dblclick', () => {
    panel.style.width = DEFAULT_WIDTH + 'px';
    localStorage.setItem(STORAGE_KEY, DEFAULT_WIDTH);
  });
})();
function toggleCheck(id, idx) {
  const s = getTS(id);
  if (!s.checklist) s.checklist = [];
  const p = s.checklist.indexOf(idx);
  if (p >= 0) s.checklist.splice(p, 1); else s.checklist.push(idx);
  _renderDetail(id);   // instant UI re-render
  _bgSave(id);         // background cloud save
}
function setEmo(id, val) {
  getTS(id).emotion = val;
  _renderDetail(id);
  _bgSave(id);
}
function _setRetake(id, val) {
  getTS(id).wouldRetake = val;
  _renderDetail(id);
  _bgSave(id);
}
function triggerImg(id, slot) {
  currentUploadSlot = { id, slot };
  document.getElementById('img-input').value = '';
  document.getElementById('img-input').click();
}
/* Downscale + re-encode an image before it ever leaves the browser.
   Trading screenshots are usually full-res PNGs (2-6MB); resizing to a
   1600px-wide JPEG keeps them perfectly readable for chart review while
   cutting file size ~70-90%. Falls back to the original file if anything
   goes wrong (e.g. an odd file type createImageBitmap can't decode). */
async function _compressChartImage(file, maxWidth = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale  = Math.min(1, maxWidth / bitmap.width);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    return blob || file;
  } catch (err) {
    console.warn('Chart compression skipped, using original file:', err.message);
    return file;
  }
}

async function handleImg(e) {
  const f = e.target.files[0];
  if (!f || !currentUploadSlot) return;
  const { id, slot } = currentUploadSlot;
  await _handleChartSlotFile(id, slot, f);
}

/* Paste-to-upload: focus a slot in edit mode and hit Ctrl/Cmd+V to drop
   a clipboard screenshot straight into it. */
function _chartSlotPaste(e, id, slot) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const item = Array.from(items).find(it => it.kind === 'file' && it.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  _handleChartSlotFile(id, slot, item.getAsFile());
}

const NX_CHART_SLOT_ACCEPT = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
const NX_CHART_SLOT_MAX_MB = 10;

async function _handleChartSlotFile(id, slot, f) {
  if (!f) return;

  // Validate before touching the UI — friendly inline errors, no alert().
  if (!f.type || !f.type.startsWith('image/') || !NX_CHART_SLOT_ACCEPT.includes(f.type)) {
    showToast(`"${f.name}" must be PNG, JPG, JPEG, WEBP or SVG.`, 'danger');
    return;
  }
  if (f.size > NX_CHART_SLOT_MAX_MB * 1024 * 1024) {
    showToast(`"${f.name}" is ${nxFormatBytes(f.size)} — max is ${NX_CHART_SLOT_MAX_MB}MB.`, 'danger');
    return;
  }
  if (f.type !== 'image/svg+xml') {
    const dims = await nxGetImageDimensions(f).catch(() => null);
    if (dims === null) {
      showToast(`"${f.name}" looks corrupted or couldn't be read.`, 'danger');
      return;
    }
  }

  // Show upload progress in the slot immediately
  const grid = document.getElementById(`chart-sort-grid-${id}`);
  const items = grid ? grid.querySelectorAll('.chart-sort-item') : null;
  const slotEl = items ? items[slot] : null;
  const thumb  = slotEl ? slotEl.querySelector('.chart-sort-thumb') : null;

  let prog, barEl;
  if (thumb) {
    thumb.innerHTML = `
      <div class="chart-upload-progress">
        <div class="cup-spinner"></div>
        <div class="cup-label">Uploading…</div>
        <div class="cup-bar-wrap"><div class="cup-bar" id="cup-bar-${id}-${slot}"></div></div>
      </div>`;
    let pct = 0;
    barEl = document.getElementById(`cup-bar-${id}-${slot}`);
    prog = setInterval(() => {
      pct = Math.min(pct + Math.random() * 18, 85);
      if (barEl) barEl.style.width = pct + '%';
    }, 120);
  }

  try {
    // Compress client-side, then upload to Supabase Storage — only a short
    // URL ever gets written to the journal_trades row (see _cloudSaveTrade),
    // instead of embedding megabytes of base64 image data in the database.
    const compressed = await _compressChartImage(f);
    const path = `${_currentUser.id}/${id}/${slot}-${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage.from('trade-charts')
      .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) throw upErr;
    const { data: urlData } = sb.storage.from('trade-charts').getPublicUrl(path);

    if (prog) clearInterval(prog);
    if (barEl) barEl.style.width = '100%';

    const s = getTS(id);
    if (!s.charts) s.charts = [];
    s.charts[slot] = urlData.publicUrl;
    s._chartsLoaded = true;
    const t = trades.find(x => x.id === id);
    if (t) t.charts = s.charts;

    _renderDetail(id);
    showToast('Chart saved ✓', 'restore');
    _cloudSaveTrade(t).then(ok => {
      if (!ok) showToast('Chart cloud sync failed', 'danger');
    });
  } catch (err) {
    if (prog) clearInterval(prog);
    console.error('Chart upload failed:', err.message || err);
    showToast('Chart upload failed', 'danger');
    _renderDetail(id);
  }
}

async function detSave(id) {
  const s = getTS(id);
  // Pull latest textarea values
  const nEl = document.getElementById('det-notes');
  const pEl = document.getElementById('det-pretrade');
  const mEl = document.getElementById('det-mistakes');
  if (nEl) s.notes    = nEl.value;
  if (pEl) s.pretrade = pEl.value;
  if (mEl) s.mistakes = mEl.value;

  // Sync to trade object
  const t = trades.find(x => x.id === id);
  if (t) {
    t.notes    = s.notes;
    t.pretrade = s.pretrade;
    t.mistakes = s.mistakes;
  }

  const btn = document.getElementById('det-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const ok = await _cloudSaveTrade(t);

  if (btn) {
    btn.disabled = false;
    if (ok) {
      btn.classList.add('saved');
      btn.textContent = '✓ Saved';
      setTimeout(() => { btn.classList.remove('saved'); btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Notes'; }, 2500);
    } else {
      btn.textContent = '✗ Error — retry';
      setTimeout(() => { btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Notes'; }, 3000);
    }
  }
}

// ── CHART LIGHTBOX (gallery — swipe left/right through every chart on a trade) ──
let _lbKeyHandler = null;

/* openLightbox accepts either the old single-image signature
   openLightbox(src, label) or a gallery: openLightbox(images, startPos)
   where images = [{src, label}, ...]. Both are supported so nothing else
   calling this needs to change. */
function openLightbox(imagesOrSrc, labelOrStartPos) {
  let images, startPos;
  if (typeof imagesOrSrc === 'string') {
    images = [{ src: imagesOrSrc, label: labelOrStartPos || '' }];
    startPos = 0;
  } else {
    images = imagesOrSrc || [];
    startPos = labelOrStartPos || 0;
  }
  if (!images.length) return;
  startPos = Math.max(0, Math.min(startPos, images.length - 1));
  const multi = images.length > 1;

  // Remove any existing lightbox + listeners first
  const existing = document.getElementById('chart-lightbox');
  if (existing) existing.remove();
  if (_lbKeyHandler) { document.removeEventListener('keydown', _lbKeyHandler); _lbKeyHandler = null; }

  const lb = document.createElement('div');
  lb.id = 'chart-lightbox';
  lb.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.92);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:20px;cursor:zoom-out;
    animation:fadeIn 0.18s ease;
  `;

  lb.innerHTML = `
    <div style="position:absolute;top:16px;right:16px;display:flex;gap:10px;z-index:3;align-items:center">
      <div id="lb-zoom-controls" style="display:flex;align-items:center;gap:1px;background:rgba(255,255,255,0.1);
        border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:2px">
        <button id="lb-zoom-out" title="Zoom out" style="width:28px;height:26px;border:none;background:transparent;color:#fff;
          cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:6px"><svg class="icn" aria-hidden="true"><use href="#ic-minus"></use></svg></button>
        <button id="lb-zoom-reset" title="Reset zoom" style="min-width:42px;padding:0 2px;height:26px;border:none;background:transparent;
          color:#fff;font-size:11px;cursor:pointer;font-family:sans-serif">100%</button>
        <button id="lb-zoom-in" title="Zoom in" style="width:28px;height:26px;border:none;background:transparent;color:#fff;
          cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:6px"><svg class="icn" aria-hidden="true"><use href="#ic-plus"></use></svg></button>
      </div>
      <a id="lb-download" href="${images[startPos].src}" download="chart-${(images[startPos].label||'chart').replace(/\s+/g,'-')}.png"
        style="padding:7px 14px;border-radius:8px;background:rgba(255,255,255,0.1);
        border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:12px;
        text-decoration:none;font-family:sans-serif"><svg class="icn" aria-hidden="true"><use href="#ic-download"></use></svg> Download</a>
      <button id="lb-close" style="padding:7px 14px;border-radius:8px;background:rgba(255,255,255,0.1);
        border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:16px;cursor:pointer"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px;
      text-transform:uppercase;letter-spacing:0.1em;display:flex;align-items:center;gap:8px">
      <span id="lb-label">${images[startPos].label}</span>
      ${multi ? `<span id="lb-counter" style="opacity:.6;letter-spacing:normal;text-transform:none">${startPos+1} / ${images.length}</span>` : ''}
    </div>
    <div id="lb-viewport" style="position:relative;width:100%;max-width:1300px;flex:1;display:flex;align-items:center;overflow:hidden;min-height:0;touch-action:pan-y pinch-zoom">
      ${multi ? `<button id="lb-prev" style="position:absolute;left:4px;top:50%;transform:translateY(-50%);z-index:2;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1">‹</button>` : ''}
      <div id="lb-track" style="display:flex;flex:0 0 auto;width:${images.length*100}%;height:100%;transform:translateX(-${startPos*(100/images.length)}%);user-select:none;-webkit-user-select:none">
        ${images.map(im => `
          <div style="width:${100/images.length}%;flex-shrink:0;display:flex;align-items:center;justify-content:center;height:100%;padding:0 8px;box-sizing:border-box;overflow:hidden">
            <img src="${im.src}" alt="${im.label}" draggable="false"
              style="max-width:100%;max-height:calc(100vh - 130px);
              object-fit:contain;border-radius:8px;
              box-shadow:0 8px 40px rgba(0,0,0,0.8);transform-origin:center center;
              -webkit-user-drag:none;user-select:none;-webkit-user-select:none">
          </div>`).join('')}
      </div>
      ${multi ? `<button id="lb-next" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);z-index:2;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1">›</button>` : ''}
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:10px">
      ${multi ? 'Swipe or use ‹ › to browse this trade\u2019s charts · ' : ''}Scroll or double-click to zoom · Tap outside to close
    </div>
  `;

  document.body.appendChild(lb);

  const track    = lb.querySelector('#lb-track');
  const viewport = lb.querySelector('#lb-viewport');
  const state = { pos: startPos, dragging: false, isSwipe: false, dx: 0, startX: 0, startY: 0, panning: false, panStartX: 0, panStartY: 0, panOrigX: 0, panOrigY: 0 };

  // ── Zoom (buttons, wheel, double-click, drag-to-pan) ──
  // Independent of the browser's own native pinch-zoom (still handled via
  // isZoomed()'s visualViewport check below) — this gives desktop/mouse
  // users, who have no pinch gesture, an explicit way to zoom in on chart
  // detail, while touch users can keep using native pinch as before.
  const ZOOM_MIN = 1, ZOOM_MAX = 4, ZOOM_STEP = 1.5, ZOOM_DBLCLICK = 2.4;
  let zoom = { scale: 1, x: 0, y: 0 };

  function currentImgEl() {
    const cell = track.children[state.pos];
    return cell ? cell.querySelector('img') : null;
  }

  function clampPan() {
    const img = currentImgEl();
    if (!img) return;
    const vpRect = viewport.getBoundingClientRect();
    const scaledW = img.offsetWidth * zoom.scale;
    const scaledH = img.offsetHeight * zoom.scale;
    const maxX = Math.max(0, (scaledW - vpRect.width) / 2);
    const maxY = Math.max(0, (scaledH - vpRect.height) / 2);
    zoom.x = Math.max(-maxX, Math.min(maxX, zoom.x));
    zoom.y = Math.max(-maxY, Math.min(maxY, zoom.y));
  }

  function syncZoomUI() {
    const pctBtn = lb.querySelector('#lb-zoom-reset'); if (pctBtn) pctBtn.textContent = Math.round(zoom.scale * 100) + '%';
    const outBtn = lb.querySelector('#lb-zoom-out'); if (outBtn) outBtn.style.opacity = zoom.scale <= ZOOM_MIN + 0.001 ? '.35' : '1';
    const inBtn  = lb.querySelector('#lb-zoom-in');  if (inBtn)  inBtn.style.opacity  = zoom.scale >= ZOOM_MAX - 0.001 ? '.35' : '1';
    viewport.style.cursor = zoom.scale > 1.02 ? (state.panning ? 'grabbing' : 'grab') : 'zoom-out';
  }

  function applyZoomTransform(animate) {
    const img = currentImgEl();
    if (!img) return;
    img.style.transition = animate ? 'transform .18s ease' : 'none';
    img.style.transform = zoom.scale <= 1.001 ? '' : `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
    syncZoomUI();
  }

  // originX/originY are the zoom-focus point relative to the viewport's
  // center — e.g. a mouse or dblclick position — so zooming feels anchored
  // under the cursor rather than always snapping back to dead-center.
  function zoomTo(newScale, originX, originY, animate) {
    newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
    const oldScale = zoom.scale;
    if (newScale === oldScale && newScale <= 1.001) return;
    const ratio = newScale / oldScale;
    zoom.x = originX - (originX - zoom.x) * ratio;
    zoom.y = originY - (originY - zoom.y) * ratio;
    zoom.scale = newScale;
    if (zoom.scale <= 1.001) { zoom.x = 0; zoom.y = 0; } else clampPan();
    applyZoomTransform(animate);
  }

  function resetZoom() {
    zoom = { scale: 1, x: 0, y: 0 };
    const img = currentImgEl();
    if (img) { img.style.transition = 'none'; img.style.transform = ''; }
    syncZoomUI();
  }

  lb.querySelector('#lb-zoom-in').addEventListener('click', (e) => { e.stopPropagation(); zoomTo(zoom.scale * ZOOM_STEP, 0, 0, true); });
  lb.querySelector('#lb-zoom-out').addEventListener('click', (e) => { e.stopPropagation(); zoomTo(zoom.scale / ZOOM_STEP, 0, 0, true); });
  lb.querySelector('#lb-zoom-reset').addEventListener('click', (e) => { e.stopPropagation(); zoomTo(1, 0, 0, true); });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const originX = e.clientX - rect.left - rect.width / 2;
    const originY = e.clientY - rect.top - rect.height / 2;
    zoomTo(zoom.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), originX, originY, false);
  }, { passive: false });

  viewport.addEventListener('dblclick', (e) => {
    if (e.target.closest('#lb-prev,#lb-next')) return;
    e.stopPropagation();
    if (zoom.scale > 1.02) { resetZoom(); return; }
    const rect = viewport.getBoundingClientRect();
    const originX = e.clientX - rect.left - rect.width / 2;
    const originY = e.clientY - rect.top - rect.height / 2;
    zoomTo(ZOOM_DBLCLICK, originX, originY, true);
  });

  // Drag-to-pan once zoomed in. Gated on zoom.scale so it never fights the
  // swipe-nav / tap-to-close handlers below (those bail out via isZoomed()).
  viewport.addEventListener('pointerdown', (e) => {
    if (zoom.scale <= 1.02 || e.target.closest('#lb-prev,#lb-next')) return;
    state.panning = true;
    state.panStartX = e.clientX; state.panStartY = e.clientY;
    state.panOrigX = zoom.x; state.panOrigY = zoom.y;
    syncZoomUI();
    e.preventDefault();
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!state.panning) return;
    zoom.x = state.panOrigX + (e.clientX - state.panStartX);
    zoom.y = state.panOrigY + (e.clientY - state.panStartY);
    clampPan();
    applyZoomTransform(false);
  });
  function endPan() {
    if (!state.panning) return;
    state.panning = false;
    syncZoomUI();
  }
  viewport.addEventListener('pointerup', endPan);
  viewport.addEventListener('pointercancel', endPan);

  // While the page is pinch-zoomed in ("maximized") or our own zoomTo()
  // has scaled the image, a tap or drag no longer corresponds to what our
  // layout-coordinate math assumes — so we back off entirely (no swipe-nav,
  // no tap-to-close) and let panning/the browser's native zoom own the
  // gesture until the user zooms back out.
  function isZoomed() {
    return zoom.scale > 1.02 || !!(window.visualViewport && window.visualViewport.scale > 1.02);
  }

  function updateTrack(animate) {
    track.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1)' : 'none';
    track.style.transform = `translateX(-${state.pos * (100 / images.length)}%)`;
  }

  function syncUI() {
    const im = images[state.pos];
    const labelEl = lb.querySelector('#lb-label'); if (labelEl) labelEl.textContent = im.label;
    const counterEl = lb.querySelector('#lb-counter'); if (counterEl) counterEl.textContent = `${state.pos+1} / ${images.length}`;
    const dl = lb.querySelector('#lb-download');
    if (dl) { dl.href = im.src; dl.setAttribute('download', `chart-${(im.label||'chart').replace(/\s+/g,'-')}.png`); }
    const prevBtn = lb.querySelector('#lb-prev'); if (prevBtn) prevBtn.style.opacity = state.pos === 0 ? '.35' : '1';
    const nextBtn = lb.querySelector('#lb-next'); if (nextBtn) nextBtn.style.opacity = state.pos === images.length - 1 ? '.35' : '1';
    syncZoomUI();
  }

  function nav(dir) {
    if (!multi) return;
    state.pos = Math.max(0, Math.min(state.pos + dir, images.length - 1));
    resetZoom();
    updateTrack(true);
    syncUI();
  }

  lb.querySelector('#lb-close').addEventListener('click', (e) => { e.stopPropagation(); lb.remove(); });
  lb.querySelector('#lb-download').addEventListener('click', (e) => e.stopPropagation());
  if (multi) {
    lb.querySelector('#lb-prev').addEventListener('click', (e) => { e.stopPropagation(); nav(-1); });
    lb.querySelector('#lb-next').addEventListener('click', (e) => { e.stopPropagation(); nav(1); });

    // Seamless drag-to-swipe (mouse + touch, unified via Pointer Events).
    // Follows the finger in real time, then either snaps to the next/prev
    // chart or springs back, instead of forcing a tap on each thumbnail.
    viewport.addEventListener('pointerdown', (e) => {
      if (isZoomed() || e.target.closest('#lb-prev,#lb-next')) return;
      state.dragging = true;
      state.isSwipe = false;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.dx = 0;
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!state.dragging || isZoomed()) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (!state.isSwipe) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) <= Math.abs(dy)) { state.dragging = false; return; } // vertical → leave it to the page
        state.isSwipe = true;
      }
      e.preventDefault();
      state.dx = dx;
      track.style.transition = 'none';
      track.style.transform = `translateX(calc(-${state.pos * (100/images.length)}% + ${dx}px))`;
    });
    const endDrag = () => {
      if (!state.dragging) return;
      state.dragging = false;
      if (state.isSwipe) {
        const threshold = viewport.offsetWidth * 0.18;
        if (state.dx <= -threshold && state.pos < images.length - 1) state.pos++;
        else if (state.dx >= threshold && state.pos > 0) state.pos--;
        updateTrack(true);
        syncUI();
      }
      // isSwipe is read by the click handler below to suppress a
      // close-on-tap right after a drag; reset it just after that check.
      setTimeout(() => { state.isSwipe = false; state.dx = 0; }, 0);
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
  }

  // Tap-outside-to-close — suppressed while zoomed (custom or native
  // pinch-"maximized") so viewing a zoomed chart doesn't get interrupted,
  // and suppressed right after a swipe so browsing charts can't misfire a
  // close. Note: taps that land directly on the image itself (not the
  // surrounding letterbox) are handled by dblclick/pan/wheel above instead
  // of closing, so the image stays fully interactive for zooming.
  lb.addEventListener('click', function(e) {
    if (isZoomed()) return;
    if (state.isSwipe || Math.abs(state.dx) > 6) return;
    if (e.target.closest('#lb-prev,#lb-next,#lb-download,#lb-close,#lb-zoom-controls')) return;
    if (e.target === lb || e.target === viewport || e.target === track) {
      e.stopPropagation();
      lb.remove();
    }
  });

  _lbKeyHandler = function(e) {
    if (e.key === 'Escape') { e.stopPropagation(); lb.remove(); }
    else if (multi && e.key === 'ArrowLeft' && !isZoomed()) { e.stopPropagation(); nav(-1); }
    else if (multi && e.key === 'ArrowRight' && !isZoomed()) { e.stopPropagation(); nav(1); }
    else if (e.key === '+' || e.key === '=') { e.stopPropagation(); zoomTo(zoom.scale * ZOOM_STEP, 0, 0, true); }
    else if (e.key === '-' || e.key === '_') { e.stopPropagation(); zoomTo(zoom.scale / ZOOM_STEP, 0, 0, true); }
    else if (e.key === '0') { e.stopPropagation(); zoomTo(1, 0, 0, true); }
  };
  document.addEventListener('keydown', _lbKeyHandler);

  // However the lightbox gets closed (× button, Esc, backdrop tap), drop
  // the keydown listener so it doesn't linger on the page.
  new MutationObserver((_muts, obs) => {
    if (!document.getElementById('chart-lightbox')) {
      if (_lbKeyHandler) { document.removeEventListener('keydown', _lbKeyHandler); _lbKeyHandler = null; }
      obs.disconnect();
    }
  }).observe(document.body, { childList: true });

  syncUI();
}

/* Opens lightbox by trade id + slot index — reads from in-memory tradeState.
   Collects every filled chart slot on this trade into one gallery so the
   user can swipe left/right through all of them seamlessly instead of
   closing and re-opening the lightbox per thumbnail. */
function openLightboxById(tradeId, slot) {
  const s = getTS(tradeId);
  const charts = s.charts || [];
  const labels = s.chartLabels && s.chartLabels.length ? s.chartLabels : [...CHART_LABELS];
  const images = [];
  let startPos = 0;
  charts.forEach((src, i) => {
    if (!src) return;
    if (i === slot) startPos = images.length;
    images.push({ src, label: labels[i] || ('Chart ' + (i + 1)) });
  });
  if (!images.length) return;
  openLightbox(images, startPos);
}


// ── MODAL ─────────────────────────────────────────────
function openModal(prefill) {
  document.getElementById('m-date').value = localToday();
  document.getElementById('m-pair').value = 'GBPUSD';
  document.getElementById('m-pair-custom').style.display = 'none';
  document.getElementById('m-pos').value = 'Buy';
  document.getElementById('m-rr').value = '';
  document.getElementById('m-pnl').value = '';
  document.getElementById('m-outcome').value = 'Win';
  document.getElementById('m-kz').value = 'London';
  // Strategy — populate from playbook models, reset to first active
  const stratSel = document.getElementById('m-strat');
  if (stratSel) {
    const firstActive = _getActiveStrategies()[0];
    const firstName = firstActive ? (firstActive.strategyName || firstActive.title) : 'NxtGen - Mod';
    stratSel.innerHTML = _buildStrategyOptions(firstName);
    stratSel.value = firstName;
  }
  const stratCustom = document.getElementById('m-strat-custom');
  if (stratCustom) { stratCustom.style.display = 'none'; stratCustom.value = ''; }
  // TF Alignment — reset to first preset, hide custom input
  document.getElementById('m-tf').value = '30m > 3m';
  const tfCustom = document.getElementById('m-tf-custom');
  if (tfCustom) { tfCustom.style.display = 'none'; tfCustom.value = ''; }
  // Account — populate dynamically from user's custom accounts list
  const accSel = document.getElementById('m-acc');
  accSel.innerHTML = _buildAccountOptions('PaperTrading');
  document.getElementById('m-rating').value = '★★★★★';
  document.getElementById('m-risk').value = '0.5%';
  document.getElementById('m-pretrade').value = '';
  document.getElementById('m-notes').value = '';
  // Reset modal checklist
  _modalChecklist = [];
  _checklistWarningAcked = false;
  const mcw = document.getElementById('modal-checklist-warn');
  if (mcw) mcw.style.display = 'none';
  // Reset mental state and followed plan
  _modalMentalState = 'Focused';
  _modalFollowedPlan = 'Yes';
  document.querySelectorAll('.ms-btn').forEach(b => b.classList.remove('active'));
  const focusedBtn = document.querySelector('.ms-btn.ms-focused'); if (focusedBtn) focusedBtn.classList.add('active');
  document.querySelectorAll('.fp-btn').forEach(b => b.classList.remove('active'));
  const yesBtn = document.querySelector('.fp-btn.fp-yes'); if (yesBtn) yesBtn.classList.add('active');
  // Hide loss reason field
  const lrf = document.getElementById('loss-reason-field'); if (lrf) lrf.style.display = 'none';
  const lrSel = document.getElementById('m-loss-reason'); if (lrSel) lrSel.value = '';
  const mcg = document.getElementById('modal-checklist-grid');
  if (mcg) mcg.innerHTML = CHECKLIST_ITEMS.map((item, i) =>
    `<div class="mcl-item" id="mcl-${i}" onclick="_toggleModalCheck(${i})">
      <div class="cl-box"></div><span class="cl-text">${item}</span>
    </div>`).join('');
  if (prefill && prefill.date) document.getElementById('m-date').value = prefill.date;
  document.getElementById('modal').classList.add('open');
  if (!prefill) _restoreDraftIfAny();
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
// Close the New Trade modal when tapping/clicking the backdrop behind it —
// e.target === e.currentTarget means the click landed on the overlay itself,
// not on the sheet or any of its form fields/buttons.
document.getElementById('modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
function _toggleModalCheck(i) {
  const idx = _modalChecklist.indexOf(i);
  if (idx >= 0) _modalChecklist.splice(idx, 1); else _modalChecklist.push(i);
  const el = document.getElementById('mcl-' + i);
  if (!el) return;
  el.classList.toggle('checked', _modalChecklist.includes(i));
  el.querySelector('.cl-box').textContent = _modalChecklist.includes(i) ? '✓' : '';
  // Hide warning if user is ticking items
  const mcw = document.getElementById('modal-checklist-warn');
  if (mcw) mcw.style.display = 'none';
  _checklistWarningAcked = false;
}
function syncCustomPair(val) {
  const ci = document.getElementById('m-pair-custom');
  if (val === '__custom__') { ci.style.display = 'block'; ci.focus(); } else ci.style.display = 'none';
}
function toggleLossReason(outcome) {
  const lrf = document.getElementById('loss-reason-field');
  if (lrf) lrf.style.display = outcome === 'Loss' ? 'block' : 'none';
}
function setMentalState(val, btn) {
  _modalMentalState = val;
  document.querySelectorAll('.ms-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
function setFollowedPlan(val, btn) {
  _modalFollowedPlan = val;
  document.querySelectorAll('.fp-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
function syncCustomStrategy(val) {
  const ci = document.getElementById('m-strat-custom');
  if (!ci) return;
  if (val === '__custom__') { ci.style.display = 'block'; ci.focus(); } else ci.style.display = 'none';
}
function syncCustomTF(val) {
  const ci = document.getElementById('m-tf-custom');
  if (!ci) return;
  if (val === '__custom__') { ci.style.display = 'block'; ci.focus(); } else ci.style.display = 'none';
}
function getPairValue() {
  const sel = document.getElementById('m-pair').value;
  if (sel === '__custom__') {
    const cv = document.getElementById('m-pair-custom').value.trim().toUpperCase();
    return cv || 'CUSTOM';
  }
  return sel;
}

async function saveTrade() {
  const dateVal = document.getElementById('m-date').value;
  if (!dateVal) { alert('Please select a date'); return; }

  // ── Pre-trade checklist enforcement ──────────────────────────────────
  // Key checklist items that should be confirmed before saving (indices match CHECKLIST_ITEMS)
  const coreChecks = [0, 2, 4, 6]; // HTF PDA, Liquidity Sweep, CISD, Active Killzone
  const missedCore = coreChecks.filter(i => !_modalChecklist.includes(i)).map(i => CHECKLIST_ITEMS[i]);
  if (missedCore.length > 0 && !_checklistWarningAcked) {
    // Show inline warning but allow override
    const warnEl = document.getElementById('modal-checklist-warn');
    if (warnEl) {
      warnEl.style.display = 'flex';
      warnEl.querySelector('.mcw-items').textContent = missedCore.join(' · ');
      _checklistWarningAcked = true; // allow second click to bypass
    }
    const btn = document.querySelector('#modal .btn-primary');
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Trade'; }
    return;
  }
  _checklistWarningAcked = false;

  const btn = document.querySelector('#modal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const pairVal = getPairValue();
  const ratingVal = document.getElementById('m-rating').value.split('★').length - 1;

  const rawPnl     = parseFloat(document.getElementById('m-pnl').value) || 0;
  const rawOutcome = document.getElementById('m-outcome').value;

  // Auto-correct outcome if it conflicts with PnL sign (prevents wrong WR display)
  let outcome = rawOutcome;
  if (rawPnl > 0 && rawOutcome === 'Loss') outcome = 'Win';
  if (rawPnl < 0 && rawOutcome === 'Win')  outcome = 'Loss';
  if (rawPnl === 0 && rawOutcome !== 'B.E') outcome = 'B.E';

  // Validate loss reason when outcome is Loss
  const lossReasonVal = document.getElementById('m-loss-reason')?.value || '';
  if (outcome === 'Loss' && !lossReasonVal) {
    showToast('Please select a Loss Reason before saving.', 'danger');
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Trade'; }
    document.getElementById('loss-reason-field').style.display = 'block';
    document.getElementById('m-loss-reason').style.outline = '2px solid var(--red)';
    setTimeout(() => { const el = document.getElementById('m-loss-reason'); if (el) el.style.outline = ''; }, 2000);
    return;
  }

  const newTrade = {
    user_id:      _currentUser.id,
    trade_date:   dateVal,
    pair:         pairVal,
    pos:          document.getElementById('m-pos').value,
    rr:           document.getElementById('m-rr').value || '1:3',
    pnl:          rawPnl,
    pnl_unit:     '%',
    outcome,
    kz:           document.getElementById('m-kz').value,
    strategy:     document.getElementById('m-strat').value === '__custom__'
                    ? (document.getElementById('m-strat-custom').value.trim() || 'NxtGen - Mod')
                    : document.getElementById('m-strat').value,
    tf:           document.getElementById('m-tf').value === '__custom__'
                    ? (document.getElementById('m-tf-custom').value.trim() || '30m > 3m')
                    : document.getElementById('m-tf').value,
    account:      document.getElementById('m-acc').value,
    rating:       ratingVal,
    risk:         document.getElementById('m-risk').value,
    notes:        document.getElementById('m-notes').value,
    pretrade:     document.getElementById('m-pretrade').value,
    emotion:      _modalMentalState || 'Focused',
    loss_reason:  lossReasonVal,
    followed_plan: _modalFollowedPlan || 'Yes',
    checklist:    [..._modalChecklist],
    charts:       [],
    chart_labels: [...CHART_LABELS],
    mistakes:     '',
  };

  const { data, error } = await sb.from('journal_trades').insert(newTrade).select().single();

  if (btn) { btn.disabled = false; btn.textContent = 'Save Trade'; }

  if (error) {
    showToast('Error saving trade: ' + error.message, 'danger');
    return;
  }

  const t = _rowToTrade(data);
  trades.unshift(t);
  trades.sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id));
  tradeState[t.id] = {
    notes: t.notes, pretrade: t.pretrade, emotion: t.emotion || 'Calm',
    checklist: [...(t.checklist || [])], charts: [], chartLabels: [...CHART_LABELS], mistakes: '',
  };

  closeModal();
  document.getElementById('m-pair').value = 'GBPUSD';
  document.getElementById('m-pair-custom').style.display = 'none';
  _clearDraft();
  _playChime('save');
  _refreshAll();
  nav('tradelog', null, 'Trade Log');
  renderTradeTable(trades);
  document.getElementById('page-tradelog').scrollTop = 0;
  showToast(t.pair + ' trade saved ✓', 'restore');
}

