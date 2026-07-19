// ══ NxTGen Journal — profile.js (original app.js lines 18003-18957) ══

// ── Profile tab switcher ──
function profileTab(id, btn) {
  document.querySelectorAll('.profile-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
  const s = document.getElementById('profile-tab-' + id);
  if (s) s.classList.add('active');
  if (btn) btn.classList.add('active');
}

// ── Populate profile page from cloud data ──
function buildProfile() {
  const d = _profileData;
  const email = _currentUser?.email || '';

  _pfSet2('pf-fname',    d.fname        || '');
  _pfSet2('pf-lname',    d.lname        || '');
  _pfSet2('pf-display',  d.display_name || '');
  _pfSet2('pf-email',    email);
  _pfSet2('pf-phone',    d.phone        || '');
  _pfSet2('pf-address',  d.address      || '');
  _pfSet2('pf-bio',      d.bio          || '');
  _pfSel2('pf-timezone', d.timezone     || 'Africa/Lagos');
  _pfSel2('pf-exp',      d.exp          || 'Intermediate (1–3 yrs)');
  _pfSel2('pf-market',   d.market       || 'Forex');
  _pfSel2('pf-session',  d.session      || 'London');
  _pfSel2('pf-risk',     d.risk         || '1%');
  _pfSel2('pf-daterange',  d.daterange  || 'This Quarter');
  _pfSel2('pf-currency',   d.currency   || '% (Percentage)');
  _pfSel2('pf-weekstart',  d.weekstart  || 'Monday');
  _pfSel2('pf-defaultview',d.defaultview|| 'Quarterly');
  _pfChk2('pf-affirmation', d.affirmation !== false);
  _pfChk2('pf-sounds',      !!d.sounds);
  _pfChk2('pf-compact',     !!d.compact);
  _pfChk2('pf-autosave',    d.autosave  !== false);

  _profileRefreshHero();
  _profileRefreshAvatar();
  _profileMountAvatarDropzone();
  _profileSessionMeta();
}

function _pfSet2(id, val) {
  const el = document.getElementById(id); if (el) el.value = val;
}
function _pfSel2(id, val) {
  const el = document.getElementById(id); if (!el) return;
  const opt = Array.from(el.options).find(o => o.value === val || o.text === val);
  if (opt) el.value = opt.value;
}
function _pfChk2(id, val) {
  const el = document.getElementById(id); if (el) el.checked = !!val;
}

function _profileRefreshHero() {
  const d = _profileData;
  const display = d.display_name || ((d.fname || '') + (d.lname ? ' ' + d.lname : '')) || 'Trader';
  const email   = _currentUser?.email || '—';
  const nameEl  = document.getElementById('profile-hero-name');
  const emailEl = document.getElementById('profile-hero-email');
  if (nameEl)  nameEl.textContent  = display;
  if (emailEl) emailEl.textContent = email;
  _profileRefreshInitials(d.fname || '', d.lname || '', d.display_name || '');
}

function _profileRefreshInitials(fname, lname, display) {
  let initials = 'TJ';
  const d = display.trim();
  if (d) {
    const p = d.split(/\s+/);
    initials = p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : p[0].slice(0,2).toUpperCase();
  } else if (fname || lname) {
    initials = ((fname[0]||'') + (lname[0]||'')).toUpperCase() || 'TJ';
  }
  document.querySelectorAll('#topbar-avatar-initials').forEach(el => el.textContent = initials);
}

async function profileHandleAvatar(e) {
  const file = e.target.files[0]; if (!file) return;
  await _processAvatarFile(file);
}

const NX_AVATAR_ACCEPT = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
const NX_AVATAR_MAX_MB = 8;

async function _processAvatarFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/') || !NX_AVATAR_ACCEPT.includes(file.type)) {
    showToast(`"${file.name}" must be PNG, JPG, JPEG, WEBP or SVG.`, 'danger');
    return;
  }
  if (file.size > NX_AVATAR_MAX_MB * 1024 * 1024) {
    showToast(`"${file.name}" is ${nxFormatBytes(file.size)} — max is ${NX_AVATAR_MAX_MB}MB.`, 'danger');
    return;
  }
  if (file.type !== 'image/svg+xml') {
    const dims = await nxGetImageDimensions(file).catch(() => null);
    if (dims === null) {
      showToast(`"${file.name}" looks corrupted or couldn't be read.`, 'danger');
      return;
    }
  }

  // Compress (avatars only need to be small — 400px is plenty) and try
  // Supabase storage upload first. Base64 is a last-resort fallback only,
  // since it bloats journal_profiles rows and slows down every load.
  const compressed = await _compressChartImage(file, 400, 0.85);
  const path = `avatars/${_currentUser.id}/avatar_${Date.now()}.jpg`;
  const { error } = await sb.storage.from('trade-charts')
    .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });

  if (!error) {
    const { data: urlData } = sb.storage.from('trade-charts').getPublicUrl(path);
    _profileData.avatar_url = urlData.publicUrl;
  } else {
    console.error('avatar upload error:', error.message);
    _profileData.avatar_url = await new Promise(resolve => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file);
    });
    showToast('Avatar upload to cloud storage failed — saved locally instead', 'danger');
  }

  await _profileSave();
  _profileApplyAvatar(_profileData.avatar_url);
  showToast('Avatar updated ✓', 'success');
}

/* Mount a full NxDropzone on the profile avatar upload zone, if present.
   Add <div id="profile-avatar-dropzone"></div> anywhere on the Profile
   page markup to opt in — this call is a no-op otherwise. */
function _profileMountAvatarDropzone() {
  if (!document.getElementById('profile-avatar-dropzone')) return;
  mountDropzone('profile-avatar-dropzone', {
    multiple: false,
    compact: false,
    accept: NX_AVATAR_ACCEPT,
    acceptLabel: 'PNG, JPG, JPEG, WEBP, SVG',
    maxSizeMB: NX_AVATAR_MAX_MB,
    primaryText: 'Drag & drop a profile photo here',
    secondaryText: 'or click to browse your files',
    onFiles: files => _processAvatarFile(files[0]),
  });
}

function _profileRefreshAvatar() {
  const url = _profileData.avatar_url || '';
  if (url) _profileApplyAvatar(url);
}

function _profileApplyAvatar(url) {
  if (!url) return;
  const pa = document.getElementById('profile-avatar-display');
  if (pa) pa.innerHTML = `<img src="${url}" alt="Avatar">`;
  const tb = document.getElementById('topbar-avatar-btn');
  if (tb) tb.innerHTML = `<img src="${url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
}

function _profileSessionMeta() {
  const meta = document.getElementById('profile-session-meta'); if (!meta) return;
  const ua = navigator.userAgent;
  const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox'
    : ua.includes('Safari') ? 'Safari' : ua.includes('Edge') ? 'Edge' : 'Browser';
  const os = ua.includes('Win') ? 'Windows' : ua.includes('Mac') ? 'macOS'
    : ua.includes('Linux') ? 'Linux' : ua.includes('Android') ? 'Android'
    : ua.includes('iPhone') ? 'iOS' : 'Unknown OS';
  meta.textContent = `${browser} on ${os} · Active now`;
}

// ── Save handlers ──
async function profileSaveAccount() {
  _profileData.fname        = document.getElementById('pf-fname')?.value.trim()   || '';
  _profileData.lname        = document.getElementById('pf-lname')?.value.trim()   || '';
  _profileData.display_name = document.getElementById('pf-display')?.value.trim() || '';
  _profileData.phone        = document.getElementById('pf-phone')?.value.trim()   || '';
  _profileData.address      = document.getElementById('pf-address')?.value.trim() || '';
  _profileData.timezone     = document.getElementById('pf-timezone')?.value       || '';
  _profileData.bio          = document.getElementById('pf-bio')?.value.trim()     || '';
  const ok = await _profileSave();
  if (ok !== false) {
    _profileRefreshHero();
    _injectTopbarAvatar();
    if (typeof updateClock === 'function') updateClock();
    showToast('Account info saved ✓', 'success');
  }
}

async function profileSaveTrading() {
  _profileData.exp     = document.getElementById('pf-exp')?.value     || '';
  _profileData.market  = document.getElementById('pf-market')?.value  || '';
  _profileData.session = document.getElementById('pf-session')?.value || '';
  _profileData.risk    = document.getElementById('pf-risk')?.value    || '';
  const ok = await _profileSave();
  if (ok !== false) showToast('Trading profile saved ✓', 'success');
}

async function profileSaveSettings() {
  _profileData.daterange    = document.getElementById('pf-daterange')?.value    || '';
  _profileData.currency     = document.getElementById('pf-currency')?.value     || '';
  _profileData.weekstart    = document.getElementById('pf-weekstart')?.value    || '';
  _profileData.defaultview  = document.getElementById('pf-defaultview')?.value  || '';
  _profileData.affirmation  = !!document.getElementById('pf-affirmation')?.checked;
  _profileData.sounds       = !!document.getElementById('pf-sounds')?.checked;
  _profileData.compact      = !!document.getElementById('pf-compact')?.checked;
  _profileData.autosave     = !!document.getElementById('pf-autosave')?.checked;
  const ok = await _profileSave();
  if (ok !== false) showToast('Settings saved ✓', 'success');
}

async function profileChangePassword() {
  const newPw   = document.getElementById('pf-pw-new')?.value     || '';
  const confirm = document.getElementById('pf-pw-confirm')?.value || '';
  if (!newPw || newPw.length < 8) { showToast('Password must be at least 8 characters', 'danger'); return; }
  if (newPw !== confirm) { showToast('Passwords do not match', 'danger'); return; }
  showToast('Updating password…', 'restore');
  const { error } = await sb.auth.updateUser({ password: newPw });
  if (error) { showToast('Failed: ' + error.message, 'danger'); return; }
  showToast('Password updated ✓', 'success');
  ['pf-pw-current','pf-pw-new','pf-pw-confirm'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

function profileSignOut() {
  openGlassModal({
    icon:'<svg class="icn" aria-hidden="true"><use href="#ic-door-exit"></use></svg>', title:'Sign Out',
    body:'Are you sure you want to sign out of NxTGen Journal?',
    confirmLabel:'Sign Out', confirmClass:'glass-btn-danger',
    onConfirm: async () => { await sb.auth.signOut(); window.location.href = 'login.html'; }
  });
}

function profileExportJSON() {
  if (!trades.length) { showToast('No trades to export', 'danger'); return; }
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), trades }, null, 2)], { type:'application/json' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `NxTGen_Trades_${new Date().toISOString().slice(0,10)}.json`
  });
  a.click(); URL.revokeObjectURL(a.href);
  showToast(`Exported ${trades.length} trades as JSON ✓`, 'success');
}

function profileExportCSV() {
  if (!trades.length) { showToast('No trades to export', 'danger'); return; }
  const hdr  = ['Date','Pair','Position','R:R','PnL','Outcome','Killzone','Model','TF','Account','Rating','Risk','Notes'];
  const rows = trades.map(t => [
    t.date,t.pair,t.pos,t.rr,_pnlLabel(t),t.outcome,t.kz,
    t.strategy||'',t.tf||'',t.account||'',t.rating||'',t.risk||'',
    (t.notes||'').replace(/"/g,'""')
  ].map(v=>`"${v}"`).join(','));
  const blob = new Blob([[hdr.join(','),...rows].join('\n')], { type:'text/csv' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `NxTGen_Trades_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click(); URL.revokeObjectURL(a.href);
  showToast(`Exported ${trades.length} trades as CSV ✓`, 'success');
}

function profileConfirmClearData() {
  openGlassModal({
    icon:'<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>', title:'Clear All Trades',
    body:`Permanently delete all ${trades.length} trade records? This cannot be undone.`,
    confirmLabel:'Delete All', confirmClass:'glass-btn-danger',
    onConfirm: async () => {
      showToast('Deleting all trades…','restore');
      const { error } = await sb.from('journal_trades').delete().eq('user_id', _currentUser.id);
      if (error) { showToast('Failed: ' + error.message, 'danger'); return; }
      trades = []; if (typeof tradeState !== 'undefined') tradeState = {};
      if (typeof renderAll === 'function') renderAll(); else _refreshAll();
      showToast('All trades deleted', 'danger');
    }
  });
}

function profileConfirmDeleteAccount() {
  openGlassModal({
    icon:'<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg>', title:'Delete Account',
    body:'This permanently deletes your account and all data. Are you absolutely sure?',
    confirmLabel:'Delete My Account', confirmClass:'glass-btn-danger',
    onConfirm: () => showToast('Please contact support at support@nxtgen.app to delete your account.', 'restore')
  });
}

// ══════════════════════════════════════════════════════
// MT5 INTEGRATION — MetaTrader 5 Account Sync
// Architecture:
//   1. User configures MT5 credentials + webhook URL
//   2. An MQL5 EA (provided as code) is installed in MT5
//   3. The EA POSTs trade data to a Supabase Edge Function
//      OR directly to a configurable webhook endpoint
//   4. The app polls for new trades and auto-imports them
//
// MT5 config is stored per-account in: account.mt5 = {
//   enabled: bool, login: str, server: str,
//   webhookToken: str (random UUID for auth),
//   syncFreqMs: number, lastSync: ISO string,
//   lastSyncStatus: 'ok'|'error'|'syncing'|'never',
//   pendingTrades: [] (trades received, not yet imported)
// }
// ══════════════════════════════════════════════════════

/* ── State ─────────────────────────────────────────── */
let _mt5SyncTimers = {};   // accountName → intervalId
let _mt5ModalState = {};   // current wizard state

/* ── Open MT5 modal ────────────────────────────────── */
// ══════════════════════════════════════════════════════════════════════════════
// MT5 INTEGRATION — MetaApi Cloud Edition
// No EA. No laptop. Connects directly to your broker's MT5 server via MetaApi.
// ══════════════════════════════════════════════════════════════════════════════


/* ── Modal open/close ─────────────────────────────────────────────────────── */
function mt5OpenModal(accountName) {
  const list = _getCustomAccounts();
  const acc  = list.find(a => a.name === accountName);
  if (!acc) return;

  // Self-heal: remove any importedTickets whose trade no longer exists in trades[]
  // (handles permanent deletes that happened before this fix was in place)
  if (acc.mt5?.importedTickets?.length) {
    const liveTickets = new Set(trades.filter(t => t.mt5Ticket).map(t => String(t.mt5Ticket)));
    const before = acc.mt5.importedTickets.length;
    acc.mt5.importedTickets = acc.mt5.importedTickets.filter(tk => liveTickets.has(String(tk)));
    if (acc.mt5.importedTickets.length !== before) {
      // Save quietly in background — no await needed here
      _saveCustomAccounts(list);
    }
  }

  _mt5ModalState = { accountName, acc };
  document.getElementById('mt5-overlay')?.classList.add('open');
  document.getElementById('mt5-modal')?.classList.add('open');
  // If already connected go to step 3, else step 1
  _mt5RenderStep(acc.mt5?.metaApiAccountId ? 3 : 1);
}

function mt5CloseModal() {
  document.getElementById('mt5-overlay')?.classList.remove('open');
  document.getElementById('mt5-modal')?.classList.remove('open');
}

/* ── Step renderer ────────────────────────────────────────────────────────── */
function _mt5RenderStep(step) {
  _mt5ModalState.step = step;
  const body = document.getElementById('mt5-modal-body');
  if (!body) return;

  const stepsHtml = `
  <div class="mt5-steps">
    <div class="mt5-step ${step >= 1 ? (step > 1 ? 'done' : 'active') : ''}">
      <div class="mt5-step-num">${step > 1 ? '✓' : '1'}</div>
      <span class="mt5-step-label">Connect</span>
    </div>
    <div class="mt5-step ${step >= 2 ? (step > 2 ? 'done' : 'active') : ''}">
      <div class="mt5-step-num">${step > 2 ? '✓' : '2'}</div>
      <span class="mt5-step-label">Verify</span>
    </div>
    <div class="mt5-step ${step >= 3 ? 'active' : ''}">
      <div class="mt5-step-num">3</div>
      <span class="mt5-step-label">Trades</span>
    </div>
  </div>`;

  if (step === 1) body.innerHTML = stepsHtml + _mt5Step1Html();
  if (step === 2) body.innerHTML = stepsHtml + _mt5Step2Html();
  if (step === 3) body.innerHTML = stepsHtml + _mt5Step3Html();
}

/* ── Step 1: enter credentials ────────────────────────────────────────────── */
function _mt5Step1Html() {
  const cfg = _mt5ModalState.acc?.mt5 || {};
  const freqs = [
    { label: '5 min',  ms: 300000  },
    { label: '15 min', ms: 900000  },
    { label: '30 min', ms: 1800000 },
    { label: '1 hour', ms: 3600000 },
  ];
  const curFreq = cfg.syncFreqMs || 900000;

  return `
  <div class="mt5-info">
    <span class="mt5-info-icon"><svg class="icn" aria-hidden="true"><use href="#ic-cloud"></use></svg></span>
    <div>Enter your MT5 broker credentials below. NxTGen connects directly to your
    broker's server via <strong>MetaApi cloud</strong> — no Expert Advisor or open
    terminal required. Your trades sync automatically 24/7.</div>
  </div>

  <div class="mt5-grid-2">
    <div class="mt5-field">
      <label class="mt5-label">MT5 Login <span>(account number)</span></label>
      <input class="mt5-input mono" id="mt5-login" type="text"
        placeholder="e.g. 414976598" value="${cfg.login || ''}" autocomplete="off">
    </div>
    <div class="mt5-field">
      <label class="mt5-label">Broker Server</label>
      <input class="mt5-input" id="mt5-server" type="text"
        placeholder="e.g. GoatFunded-Server2" value="${cfg.server || ''}" autocomplete="off">
    </div>
  </div>

  <div class="mt5-field">
    <label class="mt5-label">Password <span>(investor/read-only recommended)</span></label>
    <input class="mt5-input mono" id="mt5-pass" type="password"
      placeholder="••••••••" autocomplete="new-password">
  </div>

  <div class="mt5-warn">
    <span class="mt5-warn-icon"><svg class="icn" aria-hidden="true"><use href="#ic-lock"></use></svg></span>
    <div>Use your <strong>Investor Password</strong> for read-only access — MetaApi
    will only be able to read your trade history, not place or close trades.</div>
  </div>

  <div class="mt5-field">
    <label class="mt5-label">Sync Frequency</label>
    <div class="mt5-freq-row" id="mt5-freq-row">
      ${freqs.map(f => `
        <div class="mt5-freq-opt${f.ms === curFreq ? ' active' : ''}"
             onclick="_mt5SelectFreq(${f.ms},this)">${f.label}</div>
      `).join('')}
    </div>
  </div>

  <div class="mt5-actions">
    <button class="mt5-btn-cancel" onclick="mt5CloseModal()">Cancel</button>
    <button class="mt5-btn-primary" id="mt5-connect-btn" onclick="_mt5Step1Connect()">
      Connect to MT5 →
    </button>
  </div>`;
}

function _mt5SelectFreq(ms, el) {
  document.querySelectorAll('.mt5-freq-opt').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  _mt5ModalState.pendingFreq = ms;
}

async function _mt5Step1Connect() {
  const login  = document.getElementById('mt5-login')?.value.trim();
  const server = document.getElementById('mt5-server')?.value.trim();
  const pass   = document.getElementById('mt5-pass')?.value;

  if (!login)  { showToast('Enter your MT5 login number', 'danger'); return; }
  if (!server) { showToast('Enter your broker server name', 'danger'); return; }
  if (!pass)   { showToast('Enter your MT5 password', 'danger'); return; }

  const btn = document.getElementById('mt5-connect-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="mt5-spinner"></span> Connecting…'; }

  // Generate a token if not already set
  const list  = _getCustomAccounts();
  const idx   = list.findIndex(a => a.name === _mt5ModalState.accountName);
  if (idx === -1) return;

  const token = list[idx].mt5?.webhookToken || _mt5GenToken();
  const freq  = _mt5ModalState.pendingFreq || 900000;

  // Save credentials locally first
  list[idx].mt5 = {
    ...(list[idx].mt5 || {}),
    login, server, pass, webhookToken: token,
    syncFreqMs: freq, enabled: true,
    lastSyncStatus: 'connecting',
  };
  await _saveCustomAccounts(list);
  _mt5ModalState.acc = list[idx];

  // Call edge function to provision MetaApi account
  try {
    const session = (await sb.auth.getSession()).data.session;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/mt5-sync/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ token, accountName: _mt5ModalState.accountName, login, password: pass, server }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      showToast(data.error || 'Connection failed', 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Connect to MT5 →'; }
      return;
    }

    // Save metaApiAccountId
    const freshList = _getCustomAccounts();
    const fIdx = freshList.findIndex(a => a.name === _mt5ModalState.accountName);
    if (fIdx >= 0) {
      freshList[fIdx].mt5.metaApiAccountId = data.metaApiAccountId;
      freshList[fIdx].mt5.lastSyncStatus   = 'connected';
      await _saveCustomAccounts(freshList);
      _mt5ModalState.acc = freshList[fIdx];
    }

    _mt5RenderStep(2);
  } catch (e) {
    showToast('Network error: ' + e.message, 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Connect to MT5 →'; }
  }
}

/* ── Step 2: verifying connection + first sync ────────────────────────────── */
function _mt5Step2Html() {
  const cfg = _mt5ModalState.acc?.mt5 || {};
  return `
  <div class="mt5-success-banner" style="background:rgba(96,165,250,0.08);border-color:rgba(96,165,250,0.22)">
    <div class="mt5-success-icon"><svg class="icn" aria-hidden="true"><use href="#ic-cloud"></use></svg></div>
    <div class="mt5-success-title" style="color:var(--blue)">Account Registered with MetaApi</div>
    <div class="mt5-success-sub">
      Login: <strong>${cfg.login}</strong> · Server: <strong>${cfg.server}</strong><br>
      MetaApi is deploying a cloud terminal and connecting to your broker.<br>
      <span style="color:var(--gold)">${icon('clock',{cls:'icn-sm'})} This takes 30–90 seconds on first connection.</span>
    </div>
  </div>

  <div class="mt5-info">
    <span class="mt5-info-icon"><svg class="icn" aria-hidden="true"><use href="#ic-bulb"></use></svg></span>
    <div>Click <strong>Fetch My Trades</strong> when ready. If it fails on the first try,
    wait 30 seconds and try again — MetaApi needs time to establish the broker connection.
    Once connected, syncs happen automatically every
    <strong>${_mt5FreqLabel(cfg.syncFreqMs)}</strong> with no laptop needed.</div>
  </div>

  <div class="mt5-actions">
    <button class="mt5-btn-cancel" onclick="_mt5RenderStep(1)"><svg class="icn" aria-hidden="true"><use href="#ic-arrow-left"></use></svg> Back</button>
    <button class="mt5-btn-primary" id="mt5-verify-btn" onclick="_mt5VerifyAndSync()">
      <span class="mt5-spinner" id="mt5-spin" style="display:none"></span>
      Fetch My Trades →
    </button>
  </div>`;
}

async function _mt5VerifyAndSync() {
  const btn  = document.getElementById('mt5-verify-btn');
  const spin = document.getElementById('mt5-spin');
  if (btn)  { btn.disabled = true; btn.innerHTML = '<span class="mt5-spinner"></span> Syncing…'; }

  const acc    = _mt5ModalState.acc;
  const token  = acc?.mt5?.webhookToken;
  const metaId = acc?.mt5?.metaApiAccountId;

  if (!token || !metaId) {
    showToast('Missing account config', 'danger'); return;
  }

  try {
    const session = (await sb.auth.getSession()).data.session;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/mt5-sync/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        token,
        accountName: _mt5ModalState.accountName,
        metaApiAccountId: metaId,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      showToast((data.error || 'Not ready yet') + ' — wait 30s and try again', 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Fetch My Trades →'; }
      return;
    }

    showToast(`Synced ${data.synced} trades ✓`, 'restore');

    // Update local state
    const freshList = _getCustomAccounts();
    const fIdx = freshList.findIndex(a => a.name === _mt5ModalState.accountName);
    if (fIdx >= 0) {
      freshList[fIdx].mt5.lastSync = new Date().toISOString();
      freshList[fIdx].mt5.lastSyncStatus = 'ok';
      await _saveCustomAccounts(freshList);
      _mt5ModalState.acc = freshList[fIdx];
    }

    // Start background polling
    _mt5StartPolling(_mt5ModalState.acc);
    buildAccounts();
    _mt5RenderStep(3);
  } catch (e) {
    showToast('Network error: ' + e.message, 'danger');
    if (btn) { btn.disabled = false; btn.textContent = 'Fetch My Trades →'; }
  }
}

/* ── Step 3: trade history + import ──────────────────────────────────────────*/
function _mt5Step3Html() {
  const acc     = _mt5ModalState.acc;
  const cfg     = acc?.mt5 || {};
  const pending = cfg.pendingTrades || [];
  const lastSync = cfg.lastSync
    ? new Date(cfg.lastSync).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : 'Never';

  const statusMap = {
    ok:         `<span class="mt5-sync-badge connected"><span class="mt5-sync-dot"></span> Live</span>`,
    error:      `<span class="mt5-sync-badge error"><span class="mt5-sync-dot"></span> Error</span>`,
    connecting: `<span class="mt5-sync-badge syncing"><span class="mt5-sync-dot"></span> Connecting</span>`,
    never:      `<span class="mt5-sync-badge pending"><span class="mt5-sync-dot"></span> Pending</span>`,
  };
  const statusBadge = statusMap[cfg.lastSyncStatus] || statusMap.ok;

  const importedSet = new Set((cfg.importedTickets || []).map(t => String(t)));
  const notImported = pending.filter(t => !importedSet.has(String(t.ticket)));
  const alreadyDone = pending.filter(t =>  importedSet.has(String(t.ticket)));
  const allHistory  = [...notImported, ...alreadyDone];

  const tableHtml = allHistory.length > 0 ? `
    <div style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <label class="mt5-label" style="margin:0">
          Trade History
          <span style="font-weight:400;color:var(--text3);text-transform:none;letter-spacing:0;margin-left:6px">
            ${notImported.length} new · ${alreadyDone.length} imported
          </span>
        </label>
        <div style="display:flex;gap:8px">
          <button class="mt5-btn-cancel" style="padding:5px 12px;font-size:11px"
            onclick="_mt5SelectAll(true)">All</button>
          <button class="mt5-btn-primary" style="padding:5px 14px;font-size:11px"
            onclick="_mt5ImportSelected()">Import Selected →</button>
        </div>
      </div>
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--glass-border);border-radius:var(--r-sm)">
        <table class="mt5-import-table">
          <thead><tr>
            <th style="width:28px"><input type="checkbox" class="mt5-import-cb" id="mt5-cb-all"
              onchange="_mt5SelectAll(this.checked)"></th>
            <th>Symbol</th><th>Type</th><th>Lots</th>
            <th>Net P/L</th><th>Date</th><th style="width:70px"></th>
          </tr></thead>
          <tbody>
            ${allHistory.map((t, i) => _mt5TradeRow(t, i, pending, importedSet)).join('')}
          </tbody>
        </table>
      </div>
    </div>` : `
    <div style="color:var(--text3);font-size:12px;text-align:center;padding:24px 0">
      <div style="font-size:28px;margin-bottom:10px"><svg class="icn" aria-hidden="true"><use href="#ic-inbox"></use></svg></div>
      No trades synced yet.<br>
      <span style="font-size:11px">Click <strong>Sync Now</strong> to fetch your trade history.</span>
    </div>`;

  return `
  <div class="mt5-success-banner">
    <div class="mt5-success-icon"><svg class="icn" aria-hidden="true"><use href="#ic-link"></use></svg></div>
    <div class="mt5-success-title">MT5 Connected ${statusBadge}</div>
    <div class="mt5-success-sub">
      ${acc.name} · ${cfg.server || '—'} · Login: ${cfg.login || '—'}<br>
      Auto-sync every <strong>${_mt5FreqLabel(cfg.syncFreqMs)}</strong>
      · Last sync: ${lastSync}
    </div>
  </div>

  ${tableHtml}

  <div class="mt5-actions">
    <button class="mt5-btn-danger" onclick="_mt5DisconnectConfirm()">Disconnect</button>
    <button class="mt5-btn-cancel" onclick="_mt5RenderStep(1)">Edit Config</button>
    <button class="mt5-btn-primary" id="mt5-sync-btn" onclick="_mt5ForceSyncNow()">
      <span class="mt5-spinner" id="mt5-spin" style="display:none"></span>
      Sync Now
    </button>
  </div>`;
}

function _mt5TradeRow(t, i, pending, importedSet) {
  const ticket      = String(t.ticket);
  const isImported  = importedSet.has(ticket);
  const isOpen      = t.status === 'open' || !t.closeTime || t.closeTime === 0;
  const netPL       = (parseFloat(t.profit)||0) + (parseFloat(t.swap)||0) + (parseFloat(t.commission)||0);
  const plColor     = isImported ? 'var(--text3)' : netPL >= 0 ? 'var(--green)' : 'var(--red)';
  const plStr       = (netPL >= 0 ? '+' : '') + netPL.toFixed(2);
  const typeColor   = isImported ? 'var(--text3)' : t.type === 'buy' ? 'var(--green)' : 'var(--red)';
  const dateTs      = isOpen ? t.openTime : (t.closeTime || t.openTime);
  const dateStr     = dateTs ? new Date(dateTs * 1000).toLocaleString([], {
    month:'short', day:'numeric', year:'2-digit', hour:'2-digit', minute:'2-digit'
  }) : '—';
  const pendingIdx  = pending.findIndex(p => String(p.ticket) === ticket);
  const rowOpacity  = isImported ? 'opacity:0.45' : '';
  let badge;
  if (isImported)   badge = '<span style="font-size:9px;color:var(--green);font-weight:700">✓ DONE</span>';
  else if (isOpen)  badge = '<span style="font-size:9px;color:var(--gold);font-weight:700">● OPEN</span>';
  else              badge = '<span style="font-size:9px;color:var(--blue);font-weight:700">NEW</span>';

  return '<tr style="' + rowOpacity + '">' +
    '<td><input type="checkbox" class="mt5-import-cb mt5-import-row-cb" data-i="' + pendingIdx + '"' +
      (isImported ? ' disabled' : ' checked') + '></td>' +
    '<td style="color:' + (isImported?'var(--text3)':'var(--text)') + ';font-weight:700">' + (t.symbol||'—') + '</td>' +
    '<td style="color:' + typeColor + ';font-weight:600">' + (t.type?t.type.toUpperCase():'—') + '</td>' +
    '<td style="font-family:var(--font-mono)">' + parseFloat(t.lots||0).toFixed(2) + '</td>' +
    '<td style="color:' + plColor + ';font-weight:700;font-family:var(--font-mono)">$' + plStr + '</td>' +
    '<td style="font-size:10px;color:var(--text3)">' + dateStr + '</td>' +
    '<td style="text-align:right">' + badge + '</td>' +
    '</tr>';
}

function _mt5SelectAll(checked) {
  document.querySelectorAll('.mt5-import-row-cb').forEach(cb => { if (!cb.disabled) cb.checked = checked; });
  const all = document.getElementById('mt5-cb-all');
  if (all) all.checked = checked;
}

async function _mt5ImportSelected() {
  const list = _getCustomAccounts();
  const idx  = list.findIndex(a => a.name === _mt5ModalState.accountName);
  if (idx === -1) return;

  const pending  = list[idx].mt5?.pendingTrades || [];
  const selected = [];
  document.querySelectorAll('.mt5-import-row-cb').forEach(cb => {
    if (cb.checked && !cb.disabled) selected.push(parseInt(cb.dataset.i));
  });
  if (!selected.length) { showToast('Select at least one trade', 'danger'); return; }

  const btn = document.querySelector('.mt5-btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }

  let imported = 0;
  for (const i of selected) {
    const t = pending[i];
    if (!t) continue;
    const jTrade = _mt5MapTrade(t, list[idx].name);
    if (!jTrade) continue;
    jTrade.id = 0;
    const ok = await _cloudSaveTrade(jTrade);
    if (ok !== false) {
      trades.push(jTrade);
      imported++;
      list[idx].mt5.importedTickets = [...(list[idx].mt5.importedTickets || []), String(t.ticket)];
    }
  }

  await _saveCustomAccounts(list);
  _mt5ModalState.acc = list[idx];
  if (imported > 0) {
    trades.sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id));
    showToast(`${imported} trade${imported !== 1 ? 's' : ''} imported ✓`, 'restore');
    _refreshAll();
    mt5CloseModal();
    nav('tradelog', null, 'Trade Log');
    renderTradeTable(trades);
    const tl = document.getElementById('page-tradelog');
    if (tl) tl.scrollTop = 0;
  } else {
    showToast('Import failed — check console', 'danger');
    _mt5RenderStep(3);
  }
}

function _mt5MapTrade(mt5Trade, accountName) {
  const symbol     = (mt5Trade.symbol || '').toUpperCase();
  const type       = mt5Trade.type === 'buy' ? 'Buy' : 'Sell';
  const profit     = parseFloat(mt5Trade.profit)     || 0;
  const swap       = parseFloat(mt5Trade.swap)       || 0;
  const commission = parseFloat(mt5Trade.commission) || 0;
  const lots       = parseFloat(mt5Trade.lots)       || 0;
  const openPrice  = parseFloat(mt5Trade.openPrice)  || 0;
  const closePrice = parseFloat(mt5Trade.closePrice) || 0;
  const netProfit  = profit + swap + commission;
  const outcome    = netProfit > 0 ? 'Win' : netProfit < 0 ? 'Loss' : 'B.E';
  const pnl        = parseFloat(netProfit.toFixed(2));
  const openDt     = mt5Trade.openTime  ? new Date(mt5Trade.openTime  * 1000) : new Date();
  const closeDt    = mt5Trade.closeTime ? new Date(mt5Trade.closeTime * 1000) : new Date();
  const tradeDate  = closeDt.toISOString().slice(0, 10);
  return {
    id: 0,
    date: tradeDate,
    pair: symbol || 'UNKNOWN',
    pos:  type,
    rr:   '1:1',
    pnl,  pnlUnit: '$',  outcome,
    kz:   _mt5GuessKillzone(closeDt),
    strategy: '', tf: '',
    account: accountName,
    rating: 3,
    notes: [
      '<svg class="icn" aria-hidden="true"><use href="#ic-download"></use></svg> MT5 Import (MetaApi)',
      `Ticket: ${mt5Trade.ticket || '?'}`,
      `Lots: ${lots}`,
      `Open: ${openPrice} → Close: ${closePrice}`,
      `Profit: $${profit.toFixed(2)} | Swap: $${swap.toFixed(2)} | Comm: $${commission.toFixed(2)}`,
      `Net P/L: $${netProfit.toFixed(2)}`,
      `Opened: ${openDt.toLocaleString()} | Closed: ${closeDt.toLocaleString()}`,
    ].join('\n'),
    pretrade: '', emotion: 'Neutral', risk: '',
    checklist: [], charts: [],
    chartLabels: [...(typeof CHART_LABELS !== 'undefined' ? CHART_LABELS : [])],
    mistakes: '', source: 'mt5',
    mt5Ticket: String(mt5Trade.ticket || ''),
    mt5Lots: lots, mt5OpenTime: mt5Trade.openTime, mt5CloseTime: mt5Trade.closeTime,
  };
}

function _mt5GuessKillzone(date) {
  const h = date.getUTCHours();
  if (h >= 0  && h < 3)  return 'Asian';
  if (h >= 7  && h < 11) return 'London';
  if (h >= 12 && h < 17) return 'New York';
  return 'Asian';
}

async function _mt5DisconnectConfirm() {
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-plug"></use></svg>', title: 'Disconnect MT5?',
    body: `Stops syncing <strong>${_mt5ModalState.accountName}</strong> and removes
           MetaApi connection. Already-imported trades are kept.`,
    confirmLabel: 'Disconnect', confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      const list = _getCustomAccounts();
      const idx  = list.findIndex(a => a.name === _mt5ModalState.accountName);
      if (idx === -1) return;
      const metaId = list[idx].mt5?.metaApiAccountId;
      const token  = list[idx].mt5?.webhookToken;
      // Tell edge function to remove MetaApi account + clear buffer
      const session = (await sb.auth.getSession()).data.session;
      fetch(`${SUPABASE_URL}/functions/v1/mt5-sync/disconnect`, {
        method: 'DELETE',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${session?.access_token||''}` },
        body: JSON.stringify({ token, accountName: list[idx].name, metaApiAccountId: metaId }),
      });
      _mt5StopPolling(list[idx].name);
      delete list[idx].mt5;
      await _saveCustomAccounts(list);
      buildAccounts();
      mt5CloseModal();
      showToast('MT5 disconnected', 'restore');
    }
  });
}

async function _mt5ForceSyncNow() {
  const btn  = document.getElementById('mt5-sync-btn');
  const spin = document.getElementById('mt5-spin');
  if (btn)  btn.disabled = true;
  if (spin) spin.style.display = 'inline-block';
  await _mt5DoSync(_mt5ModalState.accountName);
  // Refresh modal with latest pending trades
  const list = _getCustomAccounts();
  const acc  = list.find(a => a.name === _mt5ModalState.accountName);
  if (acc) _mt5ModalState.acc = acc;
  _mt5RenderStep(3);
}

/* ── Polling engine ───────────────────────────────────────────────────────── */
function _mt5StartPolling(acc) {
  _mt5StopPolling(acc.name);
  const freq = acc.mt5?.syncFreqMs || 900000;
  _mt5SyncTimers[acc.name] = setInterval(() => _mt5DoSync(acc.name), freq);
}

function _mt5StopPolling(name) {
  if (_mt5SyncTimers[name]) { clearInterval(_mt5SyncTimers[name]); delete _mt5SyncTimers[name]; }
}

async function _mt5DoSync(accountName) {
  const list = _getCustomAccounts();
  const idx  = list.findIndex(a => a.name === accountName);
  if (idx === -1 || !list[idx].mt5?.enabled) return;

  const cfg    = list[idx].mt5;
  const token  = cfg.webhookToken;
  const metaId = cfg.metaApiAccountId;
  if (!token || !metaId) return;

  _mt5UpdateCardBadge(accountName, 'syncing');

  try {
    const session = (await sb.auth.getSession()).data.session;
    const jwt     = session?.access_token || '';

    // 1. Trigger sync on edge function (MetaApi → buffer)
    const syncResp = await fetch(`${SUPABASE_URL}/functions/v1/mt5-sync/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ token, accountName, metaApiAccountId: metaId }),
    });

    if (!syncResp.ok) {
      const err = await syncResp.json().catch(() => ({}));
      throw new Error(err.error || 'Sync failed');
    }

    // 2. Fetch the full buffer to update pendingTrades in local state
    const getResp = await fetch(
      `${SUPABASE_URL}/functions/v1/mt5-sync?token=${encodeURIComponent(token)}&account=${encodeURIComponent(accountName)}`,
      { headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' } }
    );

    if (getResp.ok) {
      const data = await getResp.json();
      const allTrades = Array.isArray(data.trades) ? data.trades : [];
      const freshList = _getCustomAccounts();
      const fIdx = freshList.findIndex(a => a.name === accountName);
      if (fIdx >= 0) {
        freshList[fIdx].mt5.pendingTrades    = allTrades;
        freshList[fIdx].mt5.lastSyncStatus   = 'ok';
        freshList[fIdx].mt5.lastSync         = new Date().toISOString();
        await _saveCustomAccounts(freshList);

        const importedSet = new Set((freshList[fIdx].mt5.importedTickets||[]).map(t=>String(t)));
        const newCount    = allTrades.filter(t => !importedSet.has(String(t.ticket))).length;
        _mt5UpdateCardBadge(accountName, 'ok');
        if (newCount > 0) {
          showToast(`${newCount} trade${newCount!==1?'s':''} ready to import`, 'info',
            { label: 'Review', fn: `mt5OpenModal('${accountName}')` });
          buildAccounts();
        }
      }
    }
  } catch (e) {
    console.warn('[mt5-sync] sync error:', e.message);
    const freshList = _getCustomAccounts();
    const fIdx = freshList.findIndex(a => a.name === accountName);
    if (fIdx >= 0) { freshList[fIdx].mt5.lastSyncStatus = 'error'; await _saveCustomAccounts(freshList); }
    _mt5UpdateCardBadge(accountName, 'error');
  }
}

function _mt5UpdateCardBadge(accountName, status) {
  document.querySelectorAll('.acc-card').forEach(card => {
    const nameEl = card.querySelector('.acc-name');
    if (!nameEl) return;
    if (nameEl.childNodes[0]?.textContent?.trim() !== accountName) return;
    const badge = card.querySelector('.mt5-sync-badge');
    if (!badge) return;
    const labels = { ok:'Live', error:'Error', syncing:'Syncing…', connecting:'Connecting', pending:'Pending' };
    badge.className = `mt5-sync-badge ${status === 'ok' ? 'connected' : status === 'syncing' || status === 'connecting' ? 'syncing' : status}`;
    badge.innerHTML = `<span class="mt5-sync-dot"></span> MT5 ${labels[status]||status}`;
  });
}

function _mt5ResumeAllPolling() {
  _getCustomAccounts().forEach(acc => { if (acc.mt5?.enabled && acc.mt5?.metaApiAccountId) _mt5StartPolling(acc); });
}

function _mt5GenToken() {
  return 'mt5-' + Array.from(crypto.getRandomValues(new Uint8Array(18)))
    .map(b => b.toString(16).padStart(2,'0')).join('');
}

function _mt5FreqLabel(ms) {
  if (!ms || ms < 60000) return '15 min';
  if (ms < 3600000) return `${ms/60000} min`;
  return `${ms/3600000}h`;
}

