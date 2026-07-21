// ══ NxTGen Journal — profile-premium.js ══════════════════════════════════
// Premium redesign layer for the My Profile page. Loaded after profile.js
// and settings-fab-chat.js so it can extend/override without touching them.
//
// New, purely-local settings (Floating Assistant sub-toggles, Interface
// preferences, per-sound notification switches) are stored in localStorage
// under NX_PREFS_KEY rather than in journal_profiles — the Supabase schema
// for that table isn't controlled here, so we don't risk breaking the
// existing cloud-synced fields by pushing unknown columns into that row.
// ═══════════════════════════════════════════════════════════════════════

const NX_PREFS_KEY = 'nx_local_prefs_v1';
const NX_PREFS_DEFAULTS = {
  fabEnabled: true, fabShowAffirmation: true, fabShowChat: true,
  fabAutoOpenFirst: true, fabRememberPos: false, fabSnapEdges: true,
  fabReduceAnim: false, fabNotifPulse: true, fabDraggable: true,
  fabMinimizeInactive: false, fabAlwaysOnTop: true,
  notifSoundSave: true, notifSoundDelete: true,
  reduceMotion: false, cardShadows: true, blurEffects: true,
  accent: 'blue', radius: 'default',
};

function _nxGetPrefs() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(NX_PREFS_KEY) || '{}'); } catch (e) {}
  return Object.assign({}, NX_PREFS_DEFAULTS, stored);
}
function _nxSetPref(key, val) {
  const p = _nxGetPrefs();
  p[key] = val;
  try { localStorage.setItem(NX_PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  return p;
}

// ── Apply global Interface preferences (safe no-ops if elements absent) ──
function pf2ApplyInterfacePrefs() {
  const p = _nxGetPrefs();
  const html = document.documentElement;
  html.classList.toggle('nx-reduce-motion', !!p.reduceMotion);
  html.classList.toggle('nx-no-blur', p.blurEffects === false);
  html.classList.toggle('nx-no-shadows', p.cardShadows === false);
  html.setAttribute('data-pf-accent', p.accent || 'blue');
  html.setAttribute('data-pf-radius', p.radius || 'default');
  _nxSyncFabVisibility();
}
document.addEventListener('DOMContentLoaded', pf2ApplyInterfacePrefs);
// Also apply immediately in case this script executes after DOMContentLoaded already fired.
if (document.readyState !== 'loading') pf2ApplyInterfacePrefs();

function pf2SetLocalToggle(key, val) {
  _nxSetPref(key, val);
  pf2ApplyInterfacePrefs();
  if (typeof showToast === 'function') showToast('Preference saved ✓', 'success');
}

function pf2SetAccent(name) {
  _nxSetPref('accent', name);
  document.documentElement.setAttribute('data-pf-accent', name);
  document.querySelectorAll('#pf2-accent-row .pf2-swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === name));
  if (typeof showToast === 'function') showToast('Accent color updated ✓', 'success');
}
function pf2SetRadius(name) {
  _nxSetPref('radius', name);
  document.documentElement.setAttribute('data-pf-radius', name);
  document.querySelectorAll('#pf2-radius-seg button').forEach(b => b.classList.toggle('active', b.id === 'pf2-radius-' + name));
  if (typeof showToast === 'function') showToast('Corner radius updated ✓', 'success');
}
function pf2SetTheme(mode) {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const current = isLight ? 'light' : 'dark';
  if (current !== mode && typeof toggleTheme === 'function') toggleTheme();
  pf2SyncThemeSeg();
}
function pf2SyncThemeSeg() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const darkBtn = document.getElementById('pf2-theme-dark');
  const lightBtn = document.getElementById('pf2-theme-light');
  if (darkBtn) darkBtn.classList.toggle('active', !isLight);
  if (lightBtn) lightBtn.classList.toggle('active', isLight);
}

// ── "Coming soon" helper ──────────────────────────────────────────────
function pf2ComingSoon(label) {
  if (typeof showToast === 'function') showToast(`${label} is coming soon`, 'info');
}

// ── Quick Edit / scroll helpers ───────────────────────────────────────
function pf2QuickEdit() {
  const btn = document.getElementById('profile-tab-btn-account');
  if (btn) profileTab('account', btn);
  setTimeout(() => document.getElementById('pf-fname')?.focus(), 120);
}
function pf2ScrollToFab() {
  const btn = document.getElementById('profile-tab-btn-settings');
  if (btn) profileTab('settings', btn);
  setTimeout(() => {
    const el = document.getElementById('pf2-fab-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

// ── Segmented tab indicator + keyboard navigation ─────────────────────
const _pf2OrigProfileTab = (typeof profileTab === 'function') ? profileTab : null;
function profileTab(id, btn) {
  document.querySelectorAll('.profile-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.profile-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
  const s = document.getElementById('profile-tab-' + id);
  if (s) s.classList.add('active');
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
  pf2MoveTabIndicator();
}
function pf2MoveTabIndicator() {
  const wrap = document.getElementById('profile-tabs');
  const ind = document.getElementById('profile-tab-indicator');
  const active = wrap ? wrap.querySelector('.profile-tab.active') : null;
  if (!wrap || !ind || !active) return;
  const wrapRect = wrap.getBoundingClientRect();
  const btnRect = active.getBoundingClientRect();
  ind.style.width = btnRect.width + 'px';
  ind.style.transform = `translateX(${btnRect.left - wrapRect.left}px)`;
}
window.addEventListener('resize', () => { if (document.getElementById('page-profile')?.classList.contains('active')) pf2MoveTabIndicator(); });

document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.getElementById('profile-tabs');
  if (!tabs) return;
  setTimeout(pf2MoveTabIndicator, 60);
  tabs.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const buttons = Array.from(tabs.querySelectorAll('.profile-tab'));
    const i = buttons.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    let next;
    if (e.key === 'ArrowRight') next = buttons[(i + 1) % buttons.length];
    else if (e.key === 'ArrowLeft') next = buttons[(i - 1 + buttons.length) % buttons.length];
    else if (e.key === 'Home') next = buttons[0];
    else if (e.key === 'End') next = buttons[buttons.length - 1];
    if (next) { next.focus(); next.click(); }
  });
});

// ── Hero enrichment: member since, last synced, streak, plan/cloud badges ──
function pf2RefreshHeroExtras() {
  const memberEl = document.getElementById('profile-member-since');
  if (memberEl) {
    const createdAt = _currentUser?.created_at;
    memberEl.textContent = createdAt
      ? new Date(createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : '—';
  }
  pf2RefreshLastSynced();

  // Real, computed consecutive-day journaling streak (based on trades[].date)
  const streakBadge = document.getElementById('profile-streak-badge');
  const streakNum = document.getElementById('profile-streak-num');
  if (streakBadge && streakNum && typeof trades !== 'undefined' && Array.isArray(trades)) {
    const streak = pf2ComputeJournalStreak(trades);
    if (streak > 0) {
      streakNum.textContent = streak;
      streakBadge.style.display = '';
    } else {
      streakBadge.style.display = 'none';
    }
  }

  const cloudBadge = document.getElementById('profile-cloud-badge');
  if (cloudBadge) {
    const synced = !!(typeof _profileRowId !== 'undefined' && _profileRowId);
    cloudBadge.innerHTML = synced
      ? '<svg class="icn" aria-hidden="true"><use href="#ic-cloud"></use></svg> Cloud Synced'
      : '<svg class="icn" aria-hidden="true"><use href="#ic-cloud-off"></use></svg> Syncing…';
    cloudBadge.classList.toggle('green', synced);
    cloudBadge.classList.toggle('muted', !synced);
  }

  const supaSub = document.getElementById('pf2-conn-supabase-sub');
  if (supaSub && _currentUser) {
    const provider = _currentUser.app_metadata?.provider;
    supaSub.textContent = provider && provider !== 'email'
      ? `Signed in via ${provider.charAt(0).toUpperCase() + provider.slice(1)}`
      : `Signed in with email & password`;
  }

  pf2RefreshUsage();
}
function pf2ComputeJournalStreak(list) {
  const days = new Set(list.map(t => t.date).filter(Boolean));
  if (!days.size) return 0;
  const toStr = d => d.toISOString().slice(0, 10);
  let cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  let todayStr = toStr(cursor);
  if (!days.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(toStr(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
function pf2RefreshLastSynced() {
  const el = document.getElementById('profile-last-synced');
  if (!el) return;
  let ts = null;
  try { ts = localStorage.getItem('nx_profile_last_synced'); } catch (e) {}
  if (!ts) { el.textContent = 'just now'; return; }
  const diffMs = Date.now() - parseInt(ts, 10);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) el.textContent = 'just now';
  else if (mins < 60) el.textContent = `${mins}m ago`;
  else if (mins < 1440) el.textContent = `${Math.floor(mins / 60)}h ago`;
  else el.textContent = `${Math.floor(mins / 1440)}d ago`;
}
function pf2MarkSynced() {
  try { localStorage.setItem('nx_profile_last_synced', String(Date.now())); } catch (e) {}
  pf2RefreshLastSynced();
}
function pf2RefreshUsage() {
  const tradesEl = document.getElementById('pf2-usage-trades');
  if (tradesEl && typeof trades !== 'undefined') tradesEl.textContent = trades.length;
  const btEl = document.getElementById('pf2-usage-backtest');
  if (btEl) btEl.textContent = (typeof _btTrades !== 'undefined' && Array.isArray(_btTrades)) ? _btTrades.length : '0';
  const syncEl = document.getElementById('pf2-usage-sync');
  if (syncEl) syncEl.textContent = (typeof _profileRowId !== 'undefined' && _profileRowId) ? 'Active' : 'Pending';
}

// Wrap buildProfile() so hero extras + new local-pref UI stay in sync every
// time the Profile page is (re)built, without touching profile.js itself.
const _pf2OrigBuildProfile = (typeof buildProfile === 'function') ? buildProfile : null;
function buildProfile() {
  if (_pf2OrigBuildProfile) _pf2OrigBuildProfile();
  pf2RefreshHeroExtras();
  pf2SyncThemeSeg();
  pf2SyncSegControls();
  pf2SyncLocalToggleInputs();
  pf2MoveTabIndicator();
}

function pf2SyncSegControls() {
  const p = _nxGetPrefs();
  document.querySelectorAll('#pf2-accent-row .pf2-swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === p.accent));
  document.querySelectorAll('#pf2-radius-seg button').forEach(b => b.classList.toggle('active', b.id === 'pf2-radius-' + p.radius));
}

// Populate every checkbox that's backed by local prefs, not _profileData.
function pf2SyncLocalToggleInputs() {
  const p = _nxGetPrefs();
  const map = {
    'pf2-reduce-motion': p.reduceMotion,
    'pf2-card-shadows': p.cardShadows,
    'pf2-blur-effects': p.blurEffects,
    'pf2-dense-tables': !!(typeof _profileData !== 'undefined' && _profileData.compact),
    'pf2-notif-save': p.notifSoundSave,
    'pf2-notif-delete': p.notifSoundDelete,
    'pf2-ai-affirmations': p.fabShowAffirmation,
    'pf2-fab-enabled': p.fabEnabled,
    'pf2-fab-show-affirmation': p.fabShowAffirmation,
    'pf2-fab-show-chat': p.fabShowChat,
    'pf2-fab-autoopen': p.fabAutoOpenFirst,
    'pf2-fab-remember-pos': p.fabRememberPos,
    'pf2-fab-snap': p.fabSnapEdges,
    'pf2-fab-reduce-anim': p.fabReduceAnim,
    'pf2-fab-pulse': p.fabNotifPulse,
    'pf2-fab-draggable': p.fabDraggable,
    'pf2-fab-minimize': p.fabMinimizeInactive,
    'pf2-fab-always-top': p.fabAlwaysOnTop,
  };
  Object.keys(map).forEach(id => { const el = document.getElementById(id); if (el) el.checked = !!map[id]; });
  const grid = document.getElementById('pf2-fab-grid');
  if (grid) grid.classList.toggle('disabled', p.fabEnabled === false);
  const sub = document.getElementById('pf2-fab-master-sub');
  if (sub) sub.textContent = p.fabEnabled === false
    ? 'Currently hidden on every page.'
    : 'When off, the button disappears completely from every page.';
}
function pf2SyncAiToggleMirror() {
  const p = _nxGetPrefs();
  const ai = document.getElementById('pf2-ai-affirmations');
  const fab = document.getElementById('pf2-fab-show-affirmation');
  if (ai) ai.checked = p.fabShowAffirmation;
  if (fab) fab.checked = p.fabShowAffirmation;
}
function pf2RefreshFabUI() { pf2SyncLocalToggleInputs(); _nxSyncFabVisibility(); }

function pf2ToggleFabMaster(enabled) {
  _nxSetPref('fabEnabled', enabled);
  pf2SyncLocalToggleInputs();
  _nxSyncFabVisibility();
  if (typeof showToast === 'function') showToast(enabled ? 'Floating Assistant enabled ✓' : 'Floating Assistant hidden', enabled ? 'success' : 'info');
}

// ── FAB visibility / behavior sync (reads prefs, applies to the live FAB) ──
function _nxSyncFabVisibility() {
  const fab = document.getElementById('affirmation-fab');
  if (!fab) return;
  const p = _nxGetPrefs();
  fab.style.display = p.fabEnabled === false ? 'none' : '';
  fab.classList.toggle('fab-reduce-anim', !!p.fabReduceAnim);
  fab.classList.toggle('fab-pulse', p.fabNotifPulse !== false && p.fabEnabled !== false);
  fab.style.zIndex = p.fabAlwaysOnTop === false ? '600' : '2147483000';
}

// Override the boot-time affirmation trigger to respect the new Floating
// Assistant preferences while preserving the original "Show Affirmation on
// Load" (_profileData.affirmation) behavior.
if (typeof _maybeShowAffirmationOnLoad === 'function') {
  function _maybeShowAffirmationOnLoad() {
    if (typeof _ensureAffirmationUI === 'function') _ensureAffirmationUI();
    _nxSyncFabVisibility();
    const p = _nxGetPrefs();
    if (p.fabEnabled === false) return;
    const FIRST_KEY = 'nx_fab_first_open_done';
    let isFirstLogin = false;
    try { isFirstLogin = !localStorage.getItem(FIRST_KEY); } catch (e) {}
    const shouldShow = (typeof _profileData !== 'undefined' && _profileData.affirmation !== false) && p.fabShowAffirmation !== false;
    if (isFirstLogin) {
      try { localStorage.setItem(FIRST_KEY, '1'); } catch (e) {}
      if (p.fabAutoOpenFirst !== false && shouldShow && typeof openAffirmationModal === 'function') openAffirmationModal();
    } else if (shouldShow && typeof openAffirmationModal === 'function') {
      openAffirmationModal();
    }
  }
}

// ── Per-kind sound notification gating (Trade Saved / Trade Deleted) ──────
if (typeof _playChime === 'function') {
  const _pf2OrigPlayChime = _playChime;
  function _playChime(kind) {
    const p = _nxGetPrefs();
    if (kind === 'save' && p.notifSoundSave === false) return;
    if (kind === 'delete' && p.notifSoundDelete === false) return;
    return _pf2OrigPlayChime(kind);
  }
}

// ── Mark "last synced" whenever a profile save actually succeeds ──────────
['profileSaveAccount', 'profileSaveTrading', 'profileSaveSettings'].forEach(fnName => {
  const orig = window[fnName];
  if (typeof orig !== 'function') return;
  window[fnName] = async function (...args) {
    const btn = document.activeElement && document.activeElement.classList?.contains('profile-save-btn') ? document.activeElement : null;
    if (btn) btn.classList.add('pf2-saving');
    try {
      await orig.apply(this, args);
      pf2MarkSynced();
    } finally {
      if (btn) btn.classList.remove('pf2-saving');
    }
  };
});

// ── Password visibility toggle + strength meter (client-side only) ───────
function pf2TogglePw(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = show
    ? '<svg class="icn" aria-hidden="true"><use href="#ic-eye-off"></use></svg>'
    : '<svg class="icn" aria-hidden="true"><use href="#ic-eye"></use></svg>';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}
function pf2UpdatePwStrength(val) {
  const bar = document.getElementById('pf2-strength-bar');
  const label = document.getElementById('pf2-strength-label');
  if (!bar || !label) return;
  const reqs = {
    len: val.length >= 8,
    case: /[a-z]/.test(val) && /[A-Z]/.test(val),
    num: /[0-9]/.test(val),
    sym: /[^A-Za-z0-9]/.test(val),
  };
  document.querySelectorAll('#pf2-pw-reqs .pf2-pw-req').forEach(el => {
    el.classList.toggle('met', !!reqs[el.dataset.req]);
  });
  const score = Object.values(reqs).filter(Boolean).length;
  const pct = val ? Math.max(12, (score / 4) * 100) : 0;
  bar.style.width = pct + '%';
  const colors = ['var(--red)', 'var(--red)', 'var(--gold)', 'var(--blue)', 'var(--green)'];
  bar.style.background = colors[score];
  const labels = ['Enter a new password', 'Weak', 'Weak', 'Good', 'Strong'];
  label.textContent = val ? labels[score] : 'Enter a new password';
}

// Initial sync on load in case buildProfile() already ran before this file
// finished evaluating (defensive — normally buildProfile is only called on
// nav('profile') after all scripts are loaded).
document.addEventListener('DOMContentLoaded', () => {
  pf2SyncThemeSeg();
  pf2SyncSegControls();
});
