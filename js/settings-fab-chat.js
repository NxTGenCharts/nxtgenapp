// ══ NxTGen Journal — settings-fab-chat.js (original app.js lines 17597-18002) ══

// ── SETTINGS — LIVE APPLICATION ENGINE ──────────────────────────────────
// Every "App Preferences" control applies immediately on change (not just
// after hitting Save). Save() persists the same _profileData to Supabase.

let _weekStartsMonday = false; // set by _applyWeekStartSetting()

function _weekStartDate(baseDate) {
  const d = new Date(baseDate);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const offset = _weekStartsMonday ? ((dow + 6) % 7) : dow;
  d.setDate(d.getDate() - offset);
  return d;
}

function _applyWeekStartSetting() {
  _weekStartsMonday = (_profileData.weekstart === 'Monday');
  const order = _weekStartsMonday
    ? ['MON','TUE','WED','THU','FRI','SAT','SUN']
    : ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  ['cal-dow-row','cal-dow-row-2'].forEach(id => {
    const row = document.getElementById(id);
    if (row) row.innerHTML = order.map(d => `<div class="cal-dow">${d}</div>`).join('');
  });
}

function _applyCompactTableSetting() {
  const table = document.getElementById('trade-table');
  if (table) table.classList.toggle('compact-table', !!_profileData.compact);
}

function _applyDefaultDateRangeSetting() {
  const map = { 'This Month':'month', 'This Quarter':'quarter', 'This Year':'year', 'All Time':'all' };
  const preset = map[_profileData.daterange] || 'all';
  const btn = Array.from(document.querySelectorAll('.dash-filter-btn'))
    .find(b => (b.getAttribute('onclick')||'').includes(`setDashPreset('${preset}'`));
  setDashPreset(preset, btn || null);
}

// Called from onchange="" handlers on every App Preferences field so the
// effect is visible immediately, in addition to being saved on Save click.
function _pfLiveUpdate(key, value) {
  _profileData[key] = value;
  if (key === 'compact')     _applyCompactTableSetting();
  if (key === 'weekstart')   { _applyWeekStartSetting(); renderCalendar(); }
  if (key === 'currency')    { _pnlToggleMode = (value === '% (Percentage)') ? '%' : '$'; updateKPIs(); renderCalendar(); }
  if (key === 'defaultview') updateKPIs();
  if (key === 'daterange')   _applyDefaultDateRangeSetting();
  if (key === 'timezone')    updateClock();
}

// ── Sound notifications — short synthesized chime, no external audio file ──
function _playChime(kind) {
  if (!_profileData || _profileData.sounds !== true) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    const now = ctx.currentTime;
    if (kind === 'delete') {
      o.frequency.setValueAtTime(520, now);
      o.frequency.exponentialRampToValueAtTime(260, now + 0.18);
    } else {
      o.frequency.setValueAtTime(660, now);
      o.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.13, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    o.start(now); o.stop(now + 0.26);
    o.onended = () => ctx.close();
  } catch (e) { /* ignore audio errors */ }
}

// ── Auto-save drafts — unfinished New Trade form persisted to localStorage ──
const _DRAFT_KEY = 'nxtgen_trade_draft_v1';
const _DRAFT_FIELDS = ['m-date','m-pair','m-pair-custom','m-pos','m-rr','m-pnl',
  'm-outcome','m-kz','m-strat','m-strat-custom','m-tf','m-tf-custom','m-acc','m-rating','m-risk',
  'm-pretrade','m-notes','m-loss-reason'];
let _draftSaveTimer = null;

function _collectDraft() {
  const obj = {};
  _DRAFT_FIELDS.forEach(id => { const el = document.getElementById(id); if (el && el.value) obj[id] = el.value; });
  obj._modalMentalState  = _modalMentalState;
  obj._modalFollowedPlan = _modalFollowedPlan;
  return obj;
}
function _scheduleDraftSave() {
  if (_profileData.autosave === false) return;
  const modal = document.getElementById('modal');
  if (!modal || !modal.classList.contains('open')) return;
  clearTimeout(_draftSaveTimer);
  _draftSaveTimer = setTimeout(() => {
    try { localStorage.setItem(_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), data: _collectDraft() })); }
    catch (e) { /* storage full or unavailable — ignore */ }
  }, 500);
}
function _clearDraft() { try { localStorage.removeItem(_DRAFT_KEY); } catch (e) {} }

function _restoreDraftIfAny() {
  if (_profileData.autosave === false) return false;
  let raw; try { raw = localStorage.getItem(_DRAFT_KEY); } catch (e) { return false; }
  if (!raw) return false;
  let parsed; try { parsed = JSON.parse(raw); } catch (e) { return false; }
  if (!parsed || !parsed.data) return false;
  if (Date.now() - (parsed.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) { _clearDraft(); return false; } // expire after 7 days
  const d = parsed.data;
  const hasContent = Object.keys(d).some(k => !k.startsWith('_') && d[k]);
  if (!hasContent) return false;
  Object.keys(d).forEach(id => {
    if (id.startsWith('_')) return;
    const el = document.getElementById(id);
    if (el) el.value = d[id];
  });
  if (d['m-pair-custom'])  document.getElementById('m-pair-custom').style.display  = 'block';
  if (d['m-strat-custom']) document.getElementById('m-strat-custom').style.display = 'block';
  if (d['m-tf-custom'])    document.getElementById('m-tf-custom').style.display    = 'block';
  if (d._modalMentalState) {
    const btn = document.querySelector('.ms-btn.ms-' + d._modalMentalState.toLowerCase());
    if (btn) setMentalState(d._modalMentalState, btn);
  }
  if (d._modalFollowedPlan) {
    const btn = document.querySelector('.fp-btn.fp-' + d._modalFollowedPlan.toLowerCase());
    if (btn) setFollowedPlan(d._modalFollowedPlan, btn);
  }
  showToast('Unsaved draft restored ✓', 'restore');
  return true;
}

// ── Show Affirmations on Load ────────────────────────────────────────────
function _currentAffirmationMeta() {
  const full = (_goalsData && _goalsData.affirmations) ? _goalsData.affirmations : [];
  if (!full.length) return null; // user hasn't added any of their own yet
  // Show the first 5 affirmations, in the order set on the Goals page.
  const list = full.slice(0, 5);
  return { list, total: full.length };
}
function _currentAffirmation() { const m = _currentAffirmationMeta(); return m ? m.list[0] : ''; }
function _ensureAffirmationUI() {
  if (document.getElementById('affirmation-overlay')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="affirmation-overlay" id="affirmation-overlay">
      <div class="affirmation-card">
        <div class="affirmation-head">
          <div class="affirmation-icon"><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg></div>
          <div>
            <div class="affirmation-label">Daily Affirmations</div>
            <div class="affirmation-count" id="affirmation-count"></div>
          </div>
        </div>
        <div class="affirmation-text" id="affirmation-text"></div>
        <button class="affirmation-close-btn" onclick="closeAffirmationModal()">I'm ready — let's trade</button>
      </div>
    </div>
    <div class="ai-float-chat-overlay" id="ai-float-chat-overlay">
      <div class="ai-float-chat-card" id="ai-float-chat-card">
        <div class="ai-float-chat-topbar">
          <div class="ai-float-chat-title"><span><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg></span> NxTGen AI</div>
          <div class="ai-float-chat-topbar-actions">
            <button class="chat-action-btn" title="Open full AI Coach page" onclick="_openAIFullFromFloat()">⤢</button>
            <button class="chat-action-btn" title="Close" onclick="closeFloatingChat()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
          </div>
        </div>
        <div class="ai-float-chat-body" id="ai-float-chat-body"></div>
      </div>
    </div>
    <button class="affirmation-fab" id="affirmation-fab" onclick="_fabClick(this)"></button>`;
  document.body.appendChild(wrap);
  document.getElementById('affirmation-overlay').addEventListener('click', e => {
    if (e.target.id === 'affirmation-overlay') closeAffirmationModal();
  });
  document.getElementById('ai-float-chat-overlay').addEventListener('click', e => {
    if (e.target.id === 'ai-float-chat-overlay') closeFloatingChat();
  });
  _initFabPosition(document.getElementById('affirmation-fab'));
  _renderFabIcon(document.getElementById('affirmation-fab'));
}

// ── FAB mode (two-in-one: Daily Affirmations <svg class="icn" aria-hidden="true"><use href="#ic-swap"></use></svg> AI Chat) ──────────────────
const _FAB_MODE_KEY = 'affirmation_fab_mode';
function _getFabMode() {
  try { return localStorage.getItem(_FAB_MODE_KEY) || 'affirmation'; } catch (e) { return 'affirmation'; }
}
function _setFabMode(mode) {
  try { localStorage.setItem(_FAB_MODE_KEY, mode); } catch (e) {}
}
const _FAB_CHAT_SVG = `<svg class="fab-chat-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H9l-4 3.5v-3.5H5.5C4.67 15.5 4 14.83 4 14v-8.5z" fill="#fff"/>
  <circle cx="8.4" cy="9.7" r="1.15" fill="#7c3aed"/>
  <circle cx="12.4" cy="9.7" r="1.15" fill="#7c3aed"/>
  <circle cx="16.4" cy="9.7" r="1.15" fill="#7c3aed"/>
</svg>`;
const _FAB_AFF_SVG = `<svg class="fab-aff-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12.3 2.6c.15-.5.86-.5 1.01 0l1.44 4.83c.5 1.68 1.82 3 3.5 3.5l4.83 1.44c.5.15.5.86 0 1.01l-4.83 1.44c-1.68.5-3 1.82-3.5 3.5l-1.44 4.83c-.15.5-.86.5-1.01 0l-1.44-4.83c-.5-1.68-1.82-3-3.5-3.5L2.53 13.4c-.5-.15-.5-.86 0-1.01l4.83-1.44c1.68-.5 3-1.82 3.5-3.5l1.44-4.83z" fill="#fff"/>
  <path d="M19 2.2c.09-.3.5-.3.58 0l.5 1.7c.15.5.54.9 1.05 1.05l1.7.5c.3.09.3.5 0 .58l-1.7.5c-.5.15-.9.54-1.05 1.05l-.5 1.7c-.09.3-.5.3-.58 0l-.5-1.7c-.15-.5-.54-.9-1.05-1.05l-1.7-.5c-.3-.09-.3-.5 0-.58l1.7-.5c.5-.15.9-.54 1.05-1.05l.5-1.7z" fill="#fff" opacity=".82"/>
</svg>`;
function _renderFabIcon(el) {
  if (!el) return;
  const mode = _getFabMode();
  if (mode === 'chat') {
    el.innerHTML = _FAB_CHAT_SVG;
    el.classList.add('mode-chat');
    el.title = 'Tap for AI Chat · tap again for Daily Affirmations';
  } else {
    el.innerHTML = _FAB_AFF_SVG;
    el.classList.remove('mode-chat');
    el.title = 'Tap for Daily Affirmations · tap again for AI Chat';
  }
}

// ── Affirmation FAB — freely draggable anywhere on screen (desktop + mobile) ──
const _FAB_POS_KEY = 'affirmation_fab_pos';
function _clampFabXY(el, x, y) {
  const w = el.offsetWidth || 44, h = el.offsetHeight || 44;
  const maxX = Math.max(6, window.innerWidth - w - 6);
  const maxY = Math.max(6, window.innerHeight - h - 6);
  return { x: Math.min(Math.max(6, x), maxX), y: Math.min(Math.max(6, y), maxY) };
}
function _setFabXY(el, x, y) {
  const p = _clampFabXY(el, x, y);
  el.style.left = p.x + 'px';
  el.style.top  = p.y + 'px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  return p;
}
function _fabDefaultXY(el) {
  // Default: bottom-right, clear of the mobile bottom nav if present
  const bottomNav = document.querySelector('.mob-bottom-nav');
  const navH = (bottomNav && window.innerWidth <= 768) ? bottomNav.offsetHeight : 0;
  const w = el.offsetWidth || 44, h = el.offsetHeight || 44;
  return { x: window.innerWidth - w - 20, y: window.innerHeight - h - 90 - navH };
}
function _initFabPosition(el) {
  // Always start at the default position on load/reload — dragging only
  // repositions the FAB for the current session, it is never persisted.
  try { localStorage.removeItem(_FAB_POS_KEY); } catch (e) {}
  const d = _fabDefaultXY(el);
  _setFabXY(el, d.x, d.y);
  _makeFabDraggable(el);
  window.addEventListener('resize', () => {
    // Recompute against the default corner so the FAB stays clear of the
    // bottom nav / screen edge on resize, rather than freezing wherever
    // it was last dragged to.
    const d = _fabDefaultXY(el);
    _setFabXY(el, d.x, d.y);
  });
}
function _fabClick(el) {
  if (el.dataset.justDragged) return;
  const mode = _getFabMode();
  if (mode === 'chat') {
    openFloatingChat();
  } else {
    openAffirmationModal();
  }
  // Toggle so the next tap triggers the other function
  _setFabMode(mode === 'chat' ? 'affirmation' : 'chat');
  _renderFabIcon(el);
}

// ── Floating AI Chat (the FAB's second function) ──────────────────────────
// Reuses the same chat engine/DOM as the AI Coach page's "Chat" tab by
// relocating the live .chat-container node — no duplicate IDs, no lost state.
function openFloatingChat() {
  _ensureAffirmationUI();
  const overlay   = document.getElementById('ai-float-chat-overlay');
  const body      = document.getElementById('ai-float-chat-body');
  const container = document.querySelector('.chat-container');
  if (container && body && container.parentElement !== body) body.appendChild(container);
  if (overlay) overlay.classList.add('open');
  if (!_chatInitialised) { chatInit(); _chatInitialised = true; }
  setTimeout(() => document.getElementById('chat-input')?.focus(), 150);
}
function closeFloatingChat() {
  const overlay = document.getElementById('ai-float-chat-overlay');
  if (overlay) overlay.classList.remove('open');
  const home      = document.getElementById('ai-chat-panel');
  const container = document.getElementById('ai-float-chat-body')?.querySelector('.chat-container');
  if (container && home && container.parentElement !== home) home.appendChild(container);
}
function _openAIFullFromFloat() {
  closeFloatingChat();
  const sbEl = document.querySelector('.sb-item.ai-glow');
  if (typeof nav === 'function') nav('ai', sbEl, 'AI Coach');
  setTimeout(() => { if (typeof aiPageTab === 'function') aiPageTab('chat'); }, 60);
}
function _makeFabDraggable(el) {
  let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;
  const THRESHOLD = 6;
  function onDown(e) {
    dragging = true; moved = false;
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY;
    const rect = el.getBoundingClientRect();
    origX = rect.left; origY = rect.top;
    el.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }
  function onMove(e) {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - startX, dy = p.clientY - startY;
    if (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD) moved = true;
    if (moved) {
      if (e.cancelable) e.preventDefault();
      _setFabXY(el, origX + dx, origY + dy);
    }
  }
  function onUp() {
    dragging = false;
    el.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    if (moved) {
      // Position is intentionally NOT persisted — the FAB always returns
      // to its default corner on the next load/reload.
      el.dataset.justDragged = '1';
      setTimeout(() => { delete el.dataset.justDragged; }, 60);
    }
  }
  el.addEventListener('mousedown', onDown);
  el.addEventListener('touchstart', onDown, { passive: true });
}
function openAffirmationModal() {
  _ensureAffirmationUI();
  const meta = _currentAffirmationMeta();
  const textEl = document.getElementById('affirmation-text');
  const countEl = document.getElementById('affirmation-count');
  if (!meta) {
    textEl.innerHTML = "You haven't added any affirmations yet — add some in Goals & Milestones → Morning Affirmations.";
    if (countEl) countEl.textContent = '';
  } else {
    textEl.innerHTML = meta.list.map((a, i) =>
      `<div class="affirmation-item"><span class="affirmation-item-num">${i + 1}</span>"${a}"</div>`
    ).join('');
    if (countEl) countEl.textContent = 'showing ' + meta.list.length + ' of ' + meta.total;
  }
  document.getElementById('affirmation-overlay').classList.add('open');
}
function closeAffirmationModal() {
  const el = document.getElementById('affirmation-overlay');
  if (el) el.classList.remove('open');
}
function _maybeShowAffirmationOnLoad() {
  _ensureAffirmationUI();
  if (_profileData.affirmation !== false) openAffirmationModal();
}


function _injectTopbarAvatar() {
  const oldBar = document.querySelector('.topbar-right > div[style*="display:flex"]');
  if (oldBar) oldBar.remove();
  const btn = document.getElementById('topbar-avatar-btn');
  if (!btn) return;
  const emailSpan = document.querySelector('.topbar-user-email');
  if (emailSpan) emailSpan.remove();
  _profileApplyAvatar(_profileData.avatar_url || localStorage.getItem('pf_avatar_data') || '');
  _profileRefreshInitials(_profileData.fname||'', _profileData.lname||'', _profileData.display_name||'');
  // Toggle dropdown on click
  btn.onclick = function(e) { e.stopPropagation(); _toggleAvatarDropdown(); };
  document.addEventListener('click', function(e) {
    const drop = document.getElementById('avatar-dropdown');
    if (drop && !drop.contains(e.target) && e.target !== btn) drop.classList.remove('open');
  });
}

function _toggleAvatarDropdown() {
  let drop = document.getElementById('avatar-dropdown');
  if (!drop) {
    drop = document.createElement('div');
    drop.id = 'avatar-dropdown';
    drop.className = 'avatar-dropdown';
    const name  = _profileData.display_name || _profileData.fname || '';
    const email = _currentUser ? _currentUser.email : '';
    drop.innerHTML = `
      <div class="avd-header">
        <div class="avd-name">${name || email}</div>
        <div class="avd-email">${email}</div>
      </div>
      <div class="avd-sep"></div>
      <button class="avd-item" onclick="nav('profile',null,'My Profile');document.getElementById('avatar-dropdown').classList.remove('open')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        My Profile
      </button>
      <div class="avd-sep"></div>
      <button class="avd-item danger" onclick="handleLogout()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign Out
      </button>`;
    drop.addEventListener('click', e => e.stopPropagation());
    document.querySelector('.topbar-right').appendChild(drop);
  }
  drop.classList.toggle('open');
}

