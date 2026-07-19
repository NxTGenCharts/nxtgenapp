// ══ NxTGen Journal — core-modals-userbar.js (original app.js lines 16057-16911) ══

// ── GLASS MODAL & TOAST ───────────────────────────────
let _gmCallback = null;
function openGlassModal({ icon, title, body, confirmLabel, confirmClass, onConfirm, onCancel }) {
  document.getElementById('gm-icon').innerHTML = icon || '<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg>';
  document.getElementById('gm-title').textContent = title || 'Confirm';
  document.getElementById('gm-body').innerHTML = body || '';
  _gmCallback = onConfirm || null;
  document.getElementById('gm-actions').innerHTML = `<button class="glass-btn glass-btn-cancel" onclick="closeGlassModal()">${onCancel || 'Cancel'}</button><button class="glass-btn ${confirmClass || 'glass-btn-danger'}" onclick="glassConfirm()">${confirmLabel || 'Confirm'}</button>`;
  document.getElementById('glass-modal-overlay').classList.add('open');
}
function closeGlassModal() { document.getElementById('glass-modal-overlay').classList.remove('open'); _gmCallback = null; }
async function glassConfirm() {
  const cb = _gmCallback;
  closeGlassModal();
  if (cb) {
    try { await cb(); }
    catch(e) { console.error('glassConfirm error:', e); showToast('Action failed — try again', 'danger'); }
  }
}
document.addEventListener('click', e => {
  const overlay = document.getElementById('glass-modal-overlay');
  if (overlay && overlay.classList.contains('open') && e.target === overlay) closeGlassModal();
});

function showToast(msg, type = 'info', action = null) {
  const t = document.getElementById('app-toast');
  if (!t) return;
  t.textContent = msg;
  if (action) { const btn = document.createElement('button'); btn.textContent = action.label; btn.style.cssText = 'margin-left:10px;background:none;border:1px solid rgba(255,255,255,.3);color:inherit;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px'; btn.onclick = () => { eval(action.fn); t.classList.remove('show'); }; t.appendChild(btn); }
  t.className = 'app-toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── SIGN OUT ──────────────────────────────────────────
async function handleLogout() {
  await sb.auth.signOut();
  window.location.replace('./login.html');
}

// ── REFRESH ALL VIEWS ─────────────────────────────────
// ══════════════════════════════════════════════════════
// DAY × SESSION MATRIX
// ══════════════════════════════════════════════════════
function _buildDaySessionMatrix() {
  const el = document.getElementById('day-session-matrix');
  if (!el) return;
  const trades = _getFilteredTrades();
  if (trades.length < 5) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px">Log at least 5 trades to see day × session patterns.</div>';
    return;
  }
  const DAYS = ['Mon','Tue','Wed','Thu','Fri'];
  const SESSIONS = ['London','New York','Asian'];
  const getDow = dateStr => { const d = new Date(dateStr + 'T12:00:00'); return d.getDay(); }; // 0=Sun
  const dowToLabel = { 1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri' };

  // Build matrix data
  const matrix = {};
  SESSIONS.forEach(s => { matrix[s] = {}; DAYS.forEach(d => { matrix[s][d] = { wins:0, total:0 }; }); });
  trades.forEach(t => {
    const dow = getDow(t.date);
    const day = dowToLabel[dow];
    if (!day) return;
    const sess = t.kz;
    if (!matrix[sess] || !matrix[sess][day]) return;
    matrix[sess][day].total++;
    if (t.outcome === 'Win') matrix[sess][day].wins++;
  });

  // Build HTML table
  let html = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr><th style="text-align:left;padding:6px 8px;color:var(--text3);font-weight:500"></th>';
  DAYS.forEach(d => { html += `<th style="text-align:center;padding:6px 4px;color:var(--text3);font-weight:500">${d}</th>`; });
  html += '</tr></thead><tbody>';

  SESSIONS.forEach(s => {
    const sIcon = icon('clock', {cls:'icn-sm'});
    html += `<tr><td style="padding:5px 8px;font-weight:600;color:var(--text1);white-space:nowrap">${sIcon} ${s}</td>`;
    DAYS.forEach(d => {
      const cell = matrix[s][d];
      if (cell.total === 0) {
        html += '<td style="text-align:center;padding:5px 4px"><span style="color:var(--text3);font-size:11px">—</span></td>';
      } else {
        const wr = Math.round((cell.wins / cell.total) * 100);
        const bg = wr >= 70 ? 'rgba(52,211,153,0.18)' : wr >= 50 ? 'rgba(251,191,36,0.15)' : 'rgba(248,113,113,0.15)';
        const col = wr >= 70 ? 'var(--green)' : wr >= 50 ? 'var(--gold)' : 'var(--red)';
        html += `<td style="text-align:center;padding:4px 3px"><div style="background:${bg};border-radius:6px;padding:4px 2px;cursor:default" title="${s} ${d}: ${cell.wins}W/${cell.total} trades">
          <div style="font-weight:700;color:${col};font-size:13px">${wr}%</div>
          <div style="color:var(--text3);font-size:10px">${cell.total}t</div>
        </div></td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';

  // Add a quick insight below matrix
  let bestCell = null, worstCell = null;
  SESSIONS.forEach(s => DAYS.forEach(d => {
    const cell = matrix[s][d];
    if (cell.total < 2) return;
    const wr = cell.wins / cell.total;
    if (!bestCell || wr > bestCell.wr) bestCell = { s, d, wr, ...cell };
    if (!worstCell || wr < worstCell.wr) worstCell = { s, d, wr, ...cell };
  }));
  if (bestCell && worstCell && bestCell.s !== worstCell.s || bestCell?.d !== worstCell?.d) {
    const bWrPct = Math.round(bestCell.wr * 100);
    const wWrPct = Math.round(worstCell.wr * 100);
    html += `<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(96,165,250,0.07);border:1px solid rgba(96,165,250,0.15);font-size:11px;color:var(--text2)">
      <svg class="icn" aria-hidden="true"><use href="#ic-bulb"></use></svg> Best: <strong style="color:var(--green)">${bestCell.d} ${bestCell.s}</strong> (${bWrPct}% WR, ${bestCell.total} trades) &nbsp;·&nbsp; Worst: <strong style="color:var(--red)">${worstCell.d} ${worstCell.s}</strong> (${wWrPct}% WR, ${worstCell.total} trades)
    </div>`;
  }

  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════
// LOSS PATTERN CHART
// ══════════════════════════════════════════════════════
function _buildLossPatternChart() {
  const el = document.getElementById('loss-pattern-chart');
  if (!el) return;
  const trades = _getFilteredTrades();
  const losses = trades.filter(t => t.outcome === 'Loss' && t.lossReason);
  if (losses.length < 2) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px">Tag loss reasons when logging trades to see patterns. Loss Reason is required when Outcome = Loss.</div>';
    return;
  }
  const counts = {};
  losses.forEach(t => { counts[t.lossReason] = (counts[t.lossReason] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = losses.length;
  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  sorted.forEach(([reason, count]) => {
    const pct = Math.round((count / total) * 100);
    const barW = Math.max(4, pct);
    html += `<div>
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:12px;color:var(--text1)">${reason}</span>
        <span style="font-size:11px;color:var(--text2)">${count} (${pct}%)</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${barW}%;background:var(--red);border-radius:3px;transition:width 0.4s ease"></div>
      </div>
    </div>`;
  });
  html += '</div>';
  // Add top culprit callout
  const topReason = sorted[0];
  if (topReason[1] >= 2) {
    html += `<div style="margin-top:12px;padding:8px 10px;border-radius:6px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);font-size:11px;color:var(--text2)">
      <svg class="icn icn-red" aria-hidden="true"><use href="#ic-dot"></use></svg> <strong style="color:var(--red)">"${topReason[0]}"</strong> accounts for ${Math.round((topReason[1]/total)*100)}% of your losses — this is your #1 execution leak.
    </div>`;
  }
  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════
// CHECKLIST DISCIPLINE ANALYSIS
// ══════════════════════════════════════════════════════
function _buildChecklistDiscipline() {
  const el = document.getElementById('checklist-skip-analysis');
  if (!el) return;
  const trades = _getFilteredTrades();
  const withChecklist = trades.filter(t => Array.isArray(t.checklist));
  if (withChecklist.length < 5) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px">Log at least 5 trades with checklist data to see discipline patterns.</div>';
    return;
  }
  // For each checklist item: how often skipped on wins vs losses
  const stats = CHECKLIST_ITEMS.map((item, i) => {
    const losses = withChecklist.filter(t => t.outcome === 'Loss');
    const wins   = withChecklist.filter(t => t.outcome === 'Win');
    const skippedOnLoss = losses.filter(t => !t.checklist.includes(i)).length;
    const skippedOnWin  = wins.filter(t => !t.checklist.includes(i)).length;
    const skipRateLoss = losses.length ? skippedOnLoss / losses.length : 0;
    const skipRateWin  = wins.length  ? skippedOnWin  / wins.length  : 0;
    const correlation = skipRateLoss - skipRateWin; // higher = skipping this item correlates with losses
    return { item, i, skipRateLoss, skipRateWin, correlation, skippedOnLoss, lossTotal: losses.length };
  });
  stats.sort((a, b) => b.correlation - a.correlation);

  let html = '<div style="display:flex;flex-direction:column;gap:10px">';
  stats.forEach(({ item, skipRateLoss, skipRateWin, correlation, skippedOnLoss, lossTotal }) => {
    const skipLossPct = Math.round(skipRateLoss * 100);
    const skipWinPct  = Math.round(skipRateWin  * 100);
    const severity = correlation > 0.3 ? 'var(--red)' : correlation > 0.1 ? 'var(--gold)' : 'var(--green)';
    const flag = correlation > 0.3 ? '<svg class="icn icn-red" aria-hidden="true"><use href="#ic-dot"></use></svg>' : correlation > 0.1 ? '<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-dot"></use></svg>' : '<svg class="icn icn-green" aria-hidden="true"><use href="#ic-check-c"></use></svg>';
    html += `<div style="padding:8px 10px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border)">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:12px;font-weight:600;color:var(--text1)">${flag} ${item}</span>
        <span style="font-size:10px;color:${severity};font-weight:600">${correlation > 0 ? '+' : ''}${Math.round(correlation*100)}pp gap</span>
      </div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--text2)">
        <span>Skipped before losses: <strong style="color:var(--red)">${skipLossPct}%</strong> (${skippedOnLoss}/${lossTotal})</span>
        <span>Skipped before wins: <strong style="color:var(--green)">${skipWinPct}%</strong></span>
      </div>
    </div>`;
  });
  html += '</div>';
  html += '<div style="margin-top:8px;font-size:10px;color:var(--text3)">pp gap = how many more percentage points this item is skipped before losses vs wins. Red = strong execution leak.</div>';
  el.innerHTML = html;
}

function _refreshAll() {
  updateKPIs(); buildPairTable(); buildKillzoneTable(); buildStrategyTable(); buildMonthlyTable(); refreshPairFilter();
  buildSidebarYears(); renderCalendar(); renderTradeTable(trades); updateTrashBadge();
  buildAccounts();
  _buildDaySessionMatrix(); _buildLossPatternChart(); _buildChecklistDiscipline();
  setTimeout(() => { _drawEquityCurve(); _renderHeatmap(_getFilteredTrades()); }, 60);
}

// ── USER BAR (shows logged-in user + sign out button) ──
function _injectUserBar(user) {
  // Replaced by avatar dropdown
}


// ══════════════════════════════════════════════════════
// BOOT — runs after DOM is ready
// Auth guard + load cloud data + render everything
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
//  MOBILE BOTTOM NAVIGATION
// ══════════════════════════════════════════════════════

// Map page IDs to their bottom nav button IDs
const _MOB_NAV_MAP = {
  dashboard: 'mob-nav-dashboard',
  tradelog:  'mob-nav-tradelog',
  calendar:  'mob-nav-calendar',
};

function mobNavActivate(pageId) {
  document.querySelectorAll('.mob-bottom-nav-item').forEach(b => b.classList.remove('active'));
  const btnId = _MOB_NAV_MAP[pageId];
  if (btnId) {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');
  } else {
    // Secondary pages — light up "More"
    const more = document.getElementById('mob-nav-more');
    if (more) more.classList.add('active');
  }
}

function mobNavMore() {
  const sheet = document.getElementById('mob-more-sheet');
  const overlay = document.getElementById('mob-more-overlay');
  if (!sheet) return;
  const isOpen = sheet.classList.contains('open');
  if (isOpen) {
    sheet.classList.remove('open');
    overlay?.classList.remove('show');
    document.body.style.overflow = '';
  } else {
    sheet.classList.add('open');
    overlay?.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function mobMoreClose() {
  document.getElementById('mob-more-sheet')?.classList.remove('open');
  document.getElementById('mob-more-overlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

function mobMoreNav(pageId, label) {
  mobMoreClose();
  setTimeout(() => nav(pageId, null, label), 130);
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) mobMoreClose();
});

// ══════════════════════════════════════════════════════
//  DASHBOARD CALENDAR TOGGLE
// ══════════════════════════════════════════════════════

let _calVisible = true;

function _initCalToggle() {
  const saved = localStorage.getItem('dash_cal_visible');
  if (saved === '0') {
    _calVisible = false;
    _applyCalToggle(false);
  }
}

function toggleDashCalendar() {
  _calVisible = !_calVisible;
  _applyCalToggle(_calVisible);
  localStorage.setItem('dash_cal_visible', _calVisible ? '1' : '0');
}

function _applyCalToggle(visible) {
  const layout     = document.querySelector('.dash-layout');
  const floatBtn   = document.getElementById('cal-slide-toggle');
  const icon       = document.getElementById('cal-toggle-icon');

  if (visible) {
    // Slide panel IN — grid expands right column
    if (layout)   layout.classList.remove('cal-hidden');
    if (floatBtn) {
      floatBtn.classList.remove('cal-hidden');
      floatBtn.style.right = '400px';
      floatBtn.title = 'Hide calendar';
    }
    if (icon) icon.style.transform = 'rotate(0deg)';
  } else {
    // Slide panel OUT — grid collapses right column to 0
    if (layout)   layout.classList.add('cal-hidden');
    if (floatBtn) {
      floatBtn.classList.add('cal-hidden');
      floatBtn.style.right = '0px';
      floatBtn.title = 'Show calendar';
    }
    if (icon) icon.style.transform = 'rotate(180deg)';
  }
}

document.addEventListener('DOMContentLoaded', async function () {

  // 1. Theme first (prevents flash)
  loadTheme();

  // 2. Auth guard — redirect to login if not signed in
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const next = location.pathname !== '/' ? '?next=' + encodeURIComponent(location.pathname) : '';
    window.location.replace('./login.html' + next);
    return;
  }
  _currentUser = session.user;

  // 3. Inject user bar + sign out
  _injectUserBar(_currentUser);

  // 4. Also sign out if another tab signs out
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace('./login.html');
  });

  // 5. Load data from Supabase - parallel for speed
  loadTrashSettings();
  await Promise.all([
    loadTrades(),
    loadDeletedTrades(),
    _wlLoad(),
    _goalsLoad(),
    _pbLoad(),
    _blLoad(),
    _btLoadTrades(),
    _accLoad(),
    _profileLoad(),
  ]);
  await runAutoCleanup();

  // 5b. Apply settings that affect initial rendering (week start, $/% default mode)
  _applyWeekStartSetting();
  _pnlToggleMode = (_profileData.currency && _profileData.currency !== '% (Percentage)') ? '$' : '%';

  // 6. Render all UI
  updateKPIs();
  buildPairTable();
  buildKillzoneTable();
  buildStrategyTable();
  buildMonthlyTable();
  buildSidebarYears();
  // Auto-highlight current quarter in sidebar on first load
  const _bootYear = new Date().getFullYear();
  const _bootQ    = getQuarter(localToday());
  const _bootSbEl = document.getElementById(`sb-q-${_bootYear}-${_bootQ}`);
  if (_bootSbEl) _bootSbEl.classList.add('active');
  refreshPairFilter();
  updateTrashBadge();
  buildWatchlist();
  buildAccounts();
  _mt5ResumeAllPolling();
  buildPlaybook();
  buildGoals();
  buildMonthlyReview();
  renderTradeTable(trades);
  _applyCompactTableSetting();
  _refreshCalendarAccountFilter();
  _restoreCalendarAccountSelection();
  renderCalendar();
  _injectTopbarAvatar();
  _applyDefaultDateRangeSetting();

  // 6b. Draft autosave — listen for input on the New Trade modal
  const _modalEl = document.getElementById('modal');
  if (_modalEl) {
    _modalEl.addEventListener('input', _scheduleDraftSave);
    _modalEl.addEventListener('change', _scheduleDraftSave);
  }

  // 6c. Affirmation on load (per Settings toggle) + always-available review icon
  _maybeShowAffirmationOnLoad();

  // 7. Live clock
  updateClock();
  setInterval(updateClock, 1000);

  // 8. Mobile bottom nav + calendar toggle + route to the page matching the current URL
  _routeFromLocation();
  _initCalToggle();
});

// ── CUSTOM ACCOUNTS — Cloud-synced via journal_account_data ──────────────
// Accounts stored as: { name, status:'active'|'archived', type:'', notes:'' }
// They live in the same journal_account_data row alongside payouts/milestones.

function _getCustomAccounts()  {
  // Returns full account objects
  return (_accData.accounts || []);
}
function _getActiveAccounts() {
  return _getCustomAccounts().filter(a => a.status !== 'archived' && a.status !== 'deleted');
}
function _getArchivedAccounts() {
  return _getCustomAccounts().filter(a => a.status === 'archived');
}
function _getAccountNames() {
  // For backward-compat: returns names of ALL accounts (active + archived)
  return _getCustomAccounts().map(a => a.name);
}
function _getActiveAccountNames() {
  return _getActiveAccounts().map(a => a.name);
}

async function _saveCustomAccounts(list) {
  if (!_currentUser) return;
  _accData.accounts = list;
  await _accSave();
}

function _buildAccountOptions(current) {
  const active   = _getActiveAccounts();
  const archived = _getArchivedAccounts();
  const opt = a => `<option value="${a.name}"${a.name === current ? ' selected' : ''}>${a.name}</option>`;
  let html = active.map(opt).join('');
  if (archived.length) {
    html += `<optgroup label="Archived">${archived.map(opt).join('')}</optgroup>`;
  }
  return html;
}

function _buildActiveAccountOptions(current) {
  return _getActiveAccounts().map(a =>
    `<option value="${a.name}"${a.name === current ? ' selected' : ''}>${a.name}</option>`
  ).join('');
}

function _openManageAccounts() {
  const existing = document.getElementById('acc-manager-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'acc-manager-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Manage Accounts</span>
      <button onclick="document.getElementById('acc-manager-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body">
      <div class="acc-mgr-tabs">
        <button class="acc-mgr-tab active" onclick="_accMgrTab('active',this)">Active</button>
        <button class="acc-mgr-tab" onclick="_accMgrTab('archived',this)">Archived</button>
        <button class="acc-mgr-tab acc-mgr-tab-del" onclick="_accMgrTab('deleted',this)"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Deleted</button>
      </div>
      <div id="acc-mgr-list-active" class="acc-mgr-list"></div>
      <div id="acc-mgr-list-archived" class="acc-mgr-list" style="display:none"></div>
      <div id="acc-mgr-list-deleted" class="acc-mgr-list" style="display:none"></div>
      <div class="acc-mgr-add-row">
        <input type="text" id="acc-mgr-input" class="acc-mgr-input" placeholder="Account name (e.g. GFT $5k – P1)…" onkeydown="if(event.key==='Enter')_addAccount()">
        <select id="acc-mgr-type" class="acc-mgr-input" style="max-width:130px" onchange="document.getElementById('acc-mgr-phase').style.display=this.value==='Challenge'?'inline-flex':'none'">
          <option value="">Type…</option>
          <option>Funded</option><option>Paper</option><option>Live</option><option>Challenge</option>
        </select>
        <select id="acc-mgr-phase" class="acc-mgr-input" style="max-width:100px;display:none">
          <option value="Phase 1">Phase 1</option>
          <option value="Phase 2">Phase 2</option>
        </select>
        <button onclick="_addAccount()" class="acc-mgr-add-btn">＋ Add</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  _rebuildAccMgrList();
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function _accMgrTab(tab, btn) {
  document.querySelectorAll('.acc-mgr-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('acc-mgr-list-active').style.display   = tab === 'active'   ? '' : 'none';
  document.getElementById('acc-mgr-list-archived').style.display = tab === 'archived' ? '' : 'none';
  document.getElementById('acc-mgr-list-deleted').style.display  = tab === 'deleted'  ? '' : 'none';
  const addRow = document.querySelector('.acc-mgr-add-row');
  if (addRow) addRow.style.display = tab === 'deleted' ? 'none' : '';
}

function _rebuildAccMgrList() {
  const list    = _getCustomAccounts();
  const elActive   = document.getElementById('acc-mgr-list-active');
  const elArchived = document.getElementById('acc-mgr-list-archived');
  const elDeleted  = document.getElementById('acc-mgr-list-deleted');
  if (!elActive || !elArchived) return;

  const ICONS = {
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    archive: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    restore: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.28"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  };

  const renderActive = (a, i) => {
    const mt5On = !!a.mt5?.enabled;
    const mt5St = a.mt5?.lastSyncStatus || 'never';
    const mt5Indicator = mt5On
      ? `<span class="acc-mgr-mt5-indicator" title="MT5 ${mt5St}">⑤ ${mt5St === 'ok' ? 'Live' : mt5St === 'error' ? 'Error' : 'Pending'}</span>`
      : '';
    return `
    <div class="acc-mgr-item" id="acc-mgr-item-${i}">
      <div class="acc-mgr-item-left" style="flex:1;min-width:0">
        <span class="acc-mgr-name">${a.name}</span>
        ${a.type ? `<span class="acc-mgr-type-badge">${a.type}</span>` : ''}
        ${a.type === 'Challenge' && a.challengePhase ? `<span class="acc-mgr-type-badge">${a.challengePhase}</span>` : ''}
        ${mt5Indicator}
      </div>
      <div class="acc-mgr-actions">
        <button onclick="mt5OpenModal('${a.name.replace(/'/g,"\\'")}');document.getElementById('acc-manager-overlay')?.remove()"
          class="acc-mgr-btn${mt5On ? ' restore' : ' edit'}" title="${mt5On ? 'Manage MT5' : 'Connect MT5'}">⑤</button>
        <button onclick="_editAccount(${i})" class="acc-mgr-btn edit" title="Edit">${ICONS.edit}</button>
        <button onclick="_toggleArchiveAccount(${i})" class="acc-mgr-btn archive" title="Archive">${ICONS.archive}</button>
        <button onclick="_softDeleteAccount(${i})" class="acc-mgr-btn del" title="Move to Deleted">${ICONS.trash}</button>
      </div>
    </div>`;};

  const renderArchived = (a, i) => `
    <div class="acc-mgr-item acc-mgr-item-archived" id="acc-mgr-item-${i}">
      <div class="acc-mgr-item-left">
        <span class="acc-mgr-name">${a.name}</span>
        ${a.type ? `<span class="acc-mgr-type-badge">${a.type}</span>` : ''}
        ${a.type === 'Challenge' && a.challengePhase ? `<span class="acc-mgr-type-badge">${a.challengePhase}</span>` : ''}
      </div>
      <div class="acc-mgr-actions">
        <button onclick="_toggleArchiveAccount(${i})" class="acc-mgr-btn restore" title="Restore to Active">${ICONS.restore}</button>
        <button onclick="_softDeleteAccount(${i})" class="acc-mgr-btn del" title="Move to Deleted">${ICONS.trash}</button>
      </div>
    </div>`;

  const renderDeleted = (a, i) => `
    <div class="acc-mgr-item acc-mgr-item-deleted" id="acc-mgr-item-${i}">
      <div class="acc-mgr-item-left">
        <span class="acc-mgr-name" style="text-decoration:line-through;opacity:.55">${a.name}</span>
        ${a.type ? `<span class="acc-mgr-type-badge">${a.type}</span>` : ''}
        ${a.type === 'Challenge' && a.challengePhase ? `<span class="acc-mgr-type-badge">${a.challengePhase}</span>` : ''}
      </div>
      <div class="acc-mgr-actions">
        <button onclick="_restoreDeletedAccount(${i})" class="acc-mgr-btn restore" title="Restore account">${ICONS.restore}</button>
        <button onclick="_permDeleteAccount(${i})" class="acc-mgr-btn del" title="Permanently delete">${ICONS.trash}</button>
      </div>
    </div>`;

  const activeItems   = list.filter(a => a.status !== 'archived' && a.status !== 'deleted');
  const archivedItems = list.filter(a => a.status === 'archived');
  const deletedItems  = list.filter(a => a.status === 'deleted');

  elActive.innerHTML = activeItems.length
    ? list.map((a,i) => (a.status !== 'archived' && a.status !== 'deleted') ? renderActive(a,i) : '').join('')
    : '<div class="acc-mgr-empty">No active accounts yet.</div>';

  elArchived.innerHTML = archivedItems.length
    ? list.map((a,i) => a.status === 'archived' ? renderArchived(a,i) : '').join('')
    : '<div class="acc-mgr-empty">No archived accounts.</div>';

  if (elDeleted) {
    elDeleted.innerHTML = deletedItems.length
      ? list.map((a,i) => a.status === 'deleted' ? renderDeleted(a,i) : '').join('')
      : '<div class="acc-mgr-empty acc-mgr-empty-deleted"><span style="font-size:24px">' + icon('check-c',{cls:'icn-green'}) + '</span><br>No deleted accounts.</div>';
  }
}

async function _addAccount() {
  const inp  = document.getElementById('acc-mgr-input'); if (!inp) return;
  const type = document.getElementById('acc-mgr-type')?.value || '';
  const phase = document.getElementById('acc-mgr-phase')?.value || 'Phase 1';
  const name = inp.value.trim(); if (!name) return;
  const list = _getCustomAccounts();
  if (list.find(a => a.name === name)) { showToast('Account already exists', 'danger'); return; }
  const newAcc = { name, type, status: 'active', notes: '', size: 0, pnlMode: '$' };
  if (type === 'Challenge') newAcc.challengePhase = phase;
  list.push(newAcc);
  await _saveCustomAccounts(list);
  inp.value = '';
  if (document.getElementById('acc-mgr-type')) document.getElementById('acc-mgr-type').value = '';
  if (document.getElementById('acc-mgr-phase')) { document.getElementById('acc-mgr-phase').value = 'Phase 1'; document.getElementById('acc-mgr-phase').style.display = 'none'; }
  _rebuildAccMgrList();
  _refreshAccountDropdowns();
  showToast('Account added ✓', 'restore');
  buildAccounts();
}

async function _softDeleteAccount(i) {
  const list = _getCustomAccounts();
  const acc = list[i];
  if (!acc) return;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>',
    title: 'Delete Account?',
    body: `<strong>${acc.name}</strong> will be moved to the Deleted tab.<br><small style="color:var(--text3)">You can restore or permanently delete it from there.</small>`,
    confirmLabel: 'Move to Deleted',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      list[i].status = 'deleted';
      await _saveCustomAccounts(list);
      _rebuildAccMgrList();
      _refreshAccountDropdowns();
      showToast('Account moved to Deleted', 'restore');
      buildAccounts();
    }
  });
}

async function _restoreDeletedAccount(i) {
  const list = _getCustomAccounts();
  if (!list[i]) return;
  list[i].status = 'active';
  await _saveCustomAccounts(list);
  _rebuildAccMgrList();
  _refreshAccountDropdowns();
  showToast('Account restored', 'restore');
  buildAccounts();
}

async function _permDeleteAccount(i) {
  const list = _getCustomAccounts();
  const acc = list[i];
  if (!acc) return;
  openGlassModal({
    icon: '<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg>',
    title: 'Permanently Delete?',
    body: `<strong>${acc.name}</strong> will be deleted forever.<br><small style="color:var(--red)">This action cannot be undone.</small>`,
    confirmLabel: 'Delete Forever',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      list.splice(i, 1);
      await _saveCustomAccounts(list);
      _rebuildAccMgrList();
      _refreshAccountDropdowns();
      showToast('Account permanently deleted', 'danger');
      buildAccounts();
    }
  });
}

async function _deleteAccount(i) {
  // Legacy: now routes to soft-delete
  _softDeleteAccount(i);
}

async function _toggleArchiveAccount(i) {
  const list = _getCustomAccounts();
  list[i].status = list[i].status === 'archived' ? 'active' : 'archived';
  await _saveCustomAccounts(list);
  _rebuildAccMgrList();
  _refreshAccountDropdowns();
  showToast(list[i].status === 'archived' ? 'Account archived' : 'Account restored', 'restore');
  buildAccounts();
  _refreshCalendarAccountFilter();
}

function _editAccount(i) {
  const list = _getCustomAccounts();
  const a    = list[i];
  const item = document.getElementById('acc-mgr-item-'+i); if (!item) return;
  item.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:7px;width:100%">
      <div style="display:flex;gap:6px;align-items:center">
        <input type="text" class="acc-mgr-input" id="acc-edit-${i}" value="${a.name}" style="flex:1"
          onkeydown="if(event.key==='Enter')_saveEditAccount(${i})" placeholder="Account name">
        <select id="acc-edit-type-${i}" class="acc-mgr-input" style="max-width:120px" onchange="document.getElementById('acc-edit-phase-row-${i}').style.display=this.value==='Challenge'?'flex':'none'">
          <option value="">Type…</option>
          ${['Funded','Paper','Live','Challenge'].map(t => `<option${a.type===t?' selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div id="acc-edit-phase-row-${i}" style="display:${a.type==='Challenge'?'flex':'none'};gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--text3);white-space:nowrap">Challenge Phase:</span>
        <select id="acc-edit-phase-${i}" class="acc-mgr-input" style="width:100px;flex:none">
          <option value="Phase 1"${(a.challengePhase||'Phase 1')==='Phase 1'?' selected':''}>Phase 1</option>
          <option value="Phase 2"${a.challengePhase==='Phase 2'?' selected':''}>Phase 2</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--text3);white-space:nowrap">Account Size ($):</span>
        <input type="number" class="acc-mgr-input" id="acc-edit-size-${i}"
          value="${a.size || ''}" placeholder="e.g. 10000" style="width:110px;flex:none" min="0">
        <span style="font-size:11px;color:var(--text3);white-space:nowrap;margin-left:6px">PnL Display:</span>
        <select id="acc-edit-pnlmode-${i}" class="acc-mgr-input" style="width:70px;flex:none">
          <option value="$"${(a.pnlMode||'$')==='$'?' selected':''}>$ USD</option>
          <option value="%"${a.pnlMode==='%'?' selected':''}>% Pct</option>
        </select>
        <div class="acc-mgr-actions" style="margin-left:auto">
          <button onclick="_saveEditAccount(${i})" class="acc-mgr-btn edit" title="Save">✓</button>
          <button onclick="_rebuildAccMgrList()" class="acc-mgr-btn" title="Cancel"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
        </div>
      </div>
    </div>`;
  document.getElementById('acc-edit-'+i)?.focus();
}

async function _saveEditAccount(i) {
  const inp     = document.getElementById('acc-edit-'+i);
  const typE    = document.getElementById('acc-edit-type-'+i);
  const phaseEl = document.getElementById('acc-edit-phase-'+i);
  const sizeEl  = document.getElementById('acc-edit-size-'+i);
  const modeEl  = document.getElementById('acc-edit-pnlmode-'+i);
  if (!inp) return;
  const name = inp.value.trim(); if (!name) return;
  const list = _getCustomAccounts();
  list[i].name = name;
  if (typE)   list[i].type    = typE.value;
  if (typE && typE.value === 'Challenge' && phaseEl) list[i].challengePhase = phaseEl.value;
  if (typE && typE.value !== 'Challenge') delete list[i].challengePhase;
  if (sizeEl) list[i].size    = parseFloat(sizeEl.value) || 0;
  if (modeEl) list[i].pnlMode = modeEl.value || '$';
  await _saveCustomAccounts(list);
  _rebuildAccMgrList();
  _refreshAccountDropdowns();
  _refreshCalendarAccountFilter();
  showToast('Updated ✓', 'restore');
  buildAccounts();
}

function _refreshAccountDropdowns() {
  // New trade modal
  ['m-acc', 'e-acc'].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = _buildAccountOptions(cur);
  });
}

function _onCalAccFilterChange() {
  const sel  = document.getElementById('cal-acc-filter'); if (!sel) return;
  const name = sel.value;
  if (name) {
    const acc  = _getCustomAccounts().find(a => a.name === name);
    const size = parseFloat(acc?.size) || 0;
    ['cal-acc-size', 'cal-acc-size-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el && size > 0) el.value = size;
    });
  }
  // Sync mobile dropdown
  const sel2 = document.getElementById('cal-acc-filter-2');
  if (sel2) sel2.value = name;
  _saveCalendarAccountSelection(name);
  renderCalendar();
}

async function _saveCalendarAccountSelection(accountName) {
  if (!_currentUser) return;
  _accData.calendarAccount = accountName || '';
  // Persist to localStorage immediately (instant, cross-session on same device)
  try { localStorage.setItem('nxtgen_cal_account', _accData.calendarAccount); } catch(e) {}
  // Also persist to Supabase so it survives device switches
  try {
    await sb.from('journal_account_data').upsert({
      user_id: _currentUser.id,
      payouts: _accData.payouts,
      milestones: _accData.milestones,
      accounts: _accData.accounts,
      calendar_account: _accData.calendarAccount,
    }, { onConflict: 'user_id' });
  } catch(e) {
    // Column may not exist yet — Supabase migration needed (see README)
    console.warn('_saveCalendarAccountSelection: Supabase save failed (column may not exist):', e.message);
  }
}

function _restoreCalendarAccountSelection() {
  // Prefer cloud value (loaded in _accData), fallback to localStorage
  const saved = _accData.calendarAccount
    || (() => { try { return localStorage.getItem('nxtgen_cal_account') || ''; } catch(e) { return ''; } })();
  // Restore both desktop and mobile dropdowns
  ['cal-acc-filter', 'cal-acc-filter-2'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const opt = [...sel.options].find(o => o.value === saved);
    if (!opt) return;
    sel.value = saved;
    const acc  = _getCustomAccounts().find(a => a.name === saved);
    const size = parseFloat(acc?.size) || 0;
    const sizeElId = selId === 'cal-acc-filter' ? 'cal-acc-size' : 'cal-acc-size-2';
    const sizeEl = document.getElementById(sizeElId);
    if (sizeEl && size > 0) sizeEl.value = size;
  });
}

function _refreshCalendarAccountFilter() {
  const buildOptions = (cur) =>
    '<option value="">All active accounts</option>' +
    _getActiveAccounts().map(a =>
      `<option value="${a.name}"${a.name === cur ? ' selected' : ''}>${a.name}</option>`
    ).join('') +
    ((_getArchivedAccounts().length) ? '<optgroup label="Archived">' +
      _getArchivedAccounts().map(a =>
        `<option value="${a.name}"${a.name === cur ? ' selected' : ''}>${a.name} (archived)</option>`
      ).join('') + '</optgroup>' : '');

  // Desktop filter
  const sel = document.getElementById('cal-acc-filter');
  if (sel) { const cur = sel.value; sel.innerHTML = buildOptions(cur); }

  // Mobile calendar page filter — keep in sync
  const sel2 = document.getElementById('cal-acc-filter-2');
  if (sel2) { const cur2 = sel2.value; sel2.innerHTML = buildOptions(cur2); }
}

// Mobile calendar filter/size handlers — mirror the desktop ones and keep both in sync
function _onCalAccFilterChange2() {
  const sel2 = document.getElementById('cal-acc-filter-2'); if (!sel2) return;
  const name = sel2.value;
  // Sync desktop dropdown
  const sel = document.getElementById('cal-acc-filter');
  if (sel) sel.value = name;
  // Sync account size
  if (name) {
    const acc  = _getCustomAccounts().find(a => a.name === name);
    const size = parseFloat(acc?.size) || 0;
    ['cal-acc-size', 'cal-acc-size-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el && size > 0) el.value = size;
    });
  }
  _saveCalendarAccountSelection(name);
  renderCalendar();
}

function _onCalAccSize2Change() {
  const el2 = document.getElementById('cal-acc-size-2'); if (!el2) return;
  // Sync desktop size input
  const el = document.getElementById('cal-acc-size');
  if (el) el.value = el2.value;
  renderCalendar();
}

