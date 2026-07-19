// ══ NxTGen Journal — core-utils-ai.js (original app.js lines 1-2433) ══

/* ════════════════════════════════════════════════════════
   NxTGen Trading Journal — app.js
   Cloud storage: Supabase (trades + deleted_trades tables)
   localStorage kept ONLY for: theme preference
   ════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════
// SUPABASE CONFIG — paste your full publishable key below
// ══════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://jlqgdwfbwdiieafhwisy.supabase.co';
const SUPABASE_ANON = 'sb_publishable_t_Bu9PTxcykClDo-_hvO5w_avgOKCDt';
const BASE_URL      = 'https://nxtgencharts.site';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// Declared here (instead of near _profileLoad further down) so that any
// code which runs at script load — like getUserTz()/getPreweekChecks() —
// can safely reference _profileData without hitting a "Cannot access
// before initialization" error. Actual profile data is populated later
// by _profileLoad() once the user is authenticated.
let _profileData  = {};
let _profileRowId = null;

// ══════════════════════════════════════════════════════
// ICON SYSTEM — every icon used across the app renders as an
// inline <svg><use> referencing the sprite injected once in
// index.html (#icon-sprite). This keeps markup lightweight,
// scales cleanly, and inherits color from surrounding text via
// currentColor — so icons adapt automatically to light/dark
// theme and to hover/active/disabled states.
// Usage: icon('star')  → decorative, aria-hidden
//        icon('trash', {label:'Delete trade'}) → adds aria-label
// ══════════════════════════════════════════════════════
function icon(name, opts) {
  opts = opts || {};
  const cls = 'icn' + (opts.cls ? ' ' + opts.cls : '');
  const a11y = opts.label
    ? 'role="img" aria-label="' + opts.label + '"'
    : 'aria-hidden="true"';
  return '<svg class="' + cls + '" ' + a11y + '><use href="#ic-' + name + '"></use></svg>';
}

// ══════════════════════════════════════════════════════
// NxDropzone — universal drag & drop image upload component
// One reusable component powers every image upload field in the app
// (trade chart slots, weekly-log uploads, AI chart reader, avatar…).
// It only handles the *front door* of an upload — picking a valid
// file via click / drag-drop / paste, previewing it, and validating
// it — then hands the raw File off to whatever upload logic already
// exists for that field (compression, Supabase storage, etc). None
// of that existing logic is touched.
//
// Usage:
//   mountDropzone('my-container-id', {
//     multiple: true,
//     onFiles: async (files) => { ...your existing upload code... },
//   });
// ══════════════════════════════════════════════════════
const NX_DROPZONE_DEFAULTS = {
  accept: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'],
  acceptLabel: 'PNG, JPG, JPEG, WEBP, SVG',
  maxSizeMB: 10,
  multiple: false,
  allowPaste: true,
  compact: false,
  showPreview: true,
  primaryText: 'Drag & drop an image here',
  secondaryText: 'or click to browse your files',
  onFiles: null,     // async (File[]) => void — hand off to existing upload logic
  onError: null,     // (message) => void — optional extra error hook
};

const NX_UPLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.4 8.06 4 4 0 0 1 17 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 20v-8m0 0-3 3m3-3 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const NX_ERROR_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
  <path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
const NX_REPLACE_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M17.5 10a5.5 5.5 0 1 0-1.6 3.87M17.5 6v4h-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const NX_REMOVE_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
const NX_VIEW_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.6"/>
</svg>`;

function nxFormatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function nxGetImageDimensions(file) {
  return new Promise(resolve => {
    if (file.type === 'image/svg+xml') { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

class NxDropzone {
  constructor(container, opts) {
    this.el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!this.el) return;
    this.opts = Object.assign({}, NX_DROPZONE_DEFAULTS, opts || {});
    this._dragDepth = 0;
    this._build();
    this._bind();
  }

  _build() {
    const o = this.opts;
    this.el.classList.add('nx-dropzone');
    if (o.compact) this.el.classList.add('nx-compact');
    this.el.setAttribute('tabindex', '0');
    this.el.setAttribute('role', 'button');
    this.el.setAttribute('aria-label', o.ariaLabel || `${o.primaryText}. ${o.secondaryText}. Accepts ${o.acceptLabel}, max ${o.maxSizeMB} MB.`);

    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.className = 'nx-dropzone-input';
    this.input.accept = o.accept.join(',');
    this.input.multiple = !!o.multiple;
    this.input.tabIndex = -1;
    this.input.setAttribute('aria-hidden', 'true');

    this.body = document.createElement('div');
    this.body.className = 'nx-dropzone-body';
    this._renderIdle();

    this.el.innerHTML = '';
    this.el.appendChild(this.input);
    this.el.appendChild(this.body);
  }

  _renderIdle() {
    const o = this.opts;
    this.body.innerHTML = `
      <div class="nx-dropzone-icon">${NX_UPLOAD_ICON}</div>
      <div class="nx-dropzone-text-primary">${o.primaryText}</div>
      <div class="nx-dropzone-text-secondary">${o.secondaryText}</div>
      <div class="nx-dropzone-meta">${o.acceptLabel} · Max ${o.maxSizeMB}MB</div>
    `;
  }

  _renderLoading() {
    this.body.innerHTML = `
      <div class="nx-dropzone-loading">
        <div class="nx-dropzone-spinner" role="status" aria-live="polite"></div>
        <span>Processing…</span>
      </div>`;
  }

  async _renderPreview(file) {
    if (!this.opts.showPreview) { this._renderIdle(); return; }
    const dims = await nxGetImageDimensions(file);
    const url = URL.createObjectURL(file);
    this.body.innerHTML = `
      <div class="nx-dropzone-preview">
        <div class="nx-dropzone-preview-thumb"><img src="${url}" alt="${file.name}"></div>
        <div class="nx-dropzone-preview-info">
          <div class="nx-dropzone-preview-name" title="${file.name}">${file.name}</div>
          <div class="nx-dropzone-preview-meta">${nxFormatBytes(file.size)}${dims ? ` · ${dims.w}×${dims.h}px` : ''}</div>
        </div>
        <div class="nx-dropzone-preview-actions">
          <button type="button" class="nx-replace" aria-label="Replace image" title="Replace image">${NX_REPLACE_ICON}</button>
          <button type="button" class="nx-view" aria-label="View full size" title="View full size">${NX_VIEW_ICON}</button>
          <button type="button" class="nx-remove" aria-label="Remove image" title="Remove image">${NX_REMOVE_ICON}</button>
        </div>
      </div>`;
    this.body.querySelector('.nx-replace').onclick = (e) => { e.stopPropagation(); this.open(); };
    this.body.querySelector('.nx-view').onclick = (e) => { e.stopPropagation(); window.open(url, '_blank', 'noopener'); };
    this.body.querySelector('.nx-remove').onclick = (e) => {
      e.stopPropagation();
      this.reset();
      if (typeof this.opts.onRemove === 'function') this.opts.onRemove();
    };
  }

  _showError(msg) {
    this.el.classList.add('nx-has-error');
    let banner = this.body.querySelector('.nx-dropzone-error');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'nx-dropzone-error';
      this.body.appendChild(banner);
    }
    banner.innerHTML = `${NX_ERROR_ICON}<span>${msg}</span>`;
    if (typeof showToast === 'function') showToast(msg, 'danger');
    if (typeof this.opts.onError === 'function') this.opts.onError(msg);
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(() => {
      this.el.classList.remove('nx-has-error');
      banner.remove();
    }, 4000);
  }

  _validate(file) {
    const o = this.opts;
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return `"${file?.name || 'File'}" isn't a supported image type.`;
    }
    if (o.accept.length && !o.accept.includes(file.type)) {
      return `"${file.name}" must be one of: ${o.acceptLabel}.`;
    }
    if (file.size > o.maxSizeMB * 1024 * 1024) {
      return `"${file.name}" is ${nxFormatBytes(file.size)} — max is ${o.maxSizeMB}MB.`;
    }
    return null;
  }

  async _process(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const picked = this.opts.multiple ? files : [files[0]];

    for (const f of picked) {
      const err = this._validate(f);
      if (err) { this._showError(err); return; }
    }

    // Confirm each file actually decodes as an image (guards against
    // corrupted / unreadable files slipping through the type check).
    for (const f of picked) {
      const dims = await nxGetImageDimensions(f).catch(() => null);
      if (f.type !== 'image/svg+xml' && dims === null) {
        this._showError(`"${f.name}" looks corrupted or couldn't be read.`);
        return;
      }
    }

    this._renderLoading();
    const loadingSince = Date.now();
    try {
      if (typeof this.opts.onFiles === 'function') {
        await this.opts.onFiles(picked);
      }
      // Keep the spinner visible for a beat if processing was instant,
      // so it doesn't flash — otherwise go straight to the preview.
      const elapsed = Date.now() - loadingSince;
      if (elapsed < 150) await new Promise(r => setTimeout(r, 150 - elapsed));
      this.lastFile = picked[picked.length - 1];
      await this._renderPreview(this.lastFile);
      this.el.classList.remove('nx-has-error');
    } catch (err) {
      console.error('NxDropzone upload failed:', err);
      this._renderIdle();
      this._showError('Upload failed — please try again.');
    }
  }

  _bind() {
    const el = this.el;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.nx-dropzone-preview-actions')) return;
      this.open();
    });
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.nx-dropzone-preview-actions')) {
        e.preventDefault();
        this.open();
      }
    });

    this.input.addEventListener('change', (e) => {
      this._process(e.target.files);
      e.target.value = '';
    });

    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
      this._dragDepth++;
      el.classList.add('nx-drag-over');
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this._dragDepth = Math.max(0, this._dragDepth - 1);
      if (this._dragDepth === 0) el.classList.remove('nx-drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      this._dragDepth = 0;
      el.classList.remove('nx-drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        this._process(e.dataTransfer.files);
      }
    });

    if (this.opts.allowPaste) {
      el.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        const imgFiles = Array.from(items)
          .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
          .map(it => it.getAsFile());
        if (imgFiles.length) { e.preventDefault(); this._process(imgFiles); }
      });
    }
  }

  open() { if (this.input) this.input.click(); }

  reset() {
    this.el.classList.remove('nx-has-error');
    this.lastFile = null;
    this._renderIdle();
  }

  destroy() {
    this.el.classList.remove('nx-dropzone', 'nx-compact', 'nx-drag-over', 'nx-has-error');
    this.el.innerHTML = '';
  }
}

/** Mount (or re-mount) a NxDropzone on a container element or id. */
function mountDropzone(container, opts) {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return null;
  if (el._nxDropzone) el._nxDropzone.destroy();
  const dz = new NxDropzone(el, opts);
  el._nxDropzone = dz;
  return dz;
}

// ── PnL formatting helper ─────────────────────────────────────────────────
// Every trade has t.pnl (number) and t.pnlUnit ('$' or '%').
// MT5 imported trades: pnlUnit='$', pnl is real dollar P/L.
// Manual trades: pnlUnit='%' (default), pnl is % of account.
// formatPnl() returns a display string like "+$3.32" or "+1.5%"
// toPnlDollars() converts to $ using accSize if needed.
function formatPnl(trade, accSize) {
  const val     = parseFloat(trade.pnl) || 0;
  const dollars = toPnlDollars(trade, accSize);
  const isMt5   = _isMt5Trade(trade);
  const unit    = isMt5 ? '$' : (trade.pnlUnit || '%');

  if (unit === '$') {
    return (dollars >= 0 ? '+$' : '-$') + Math.abs(dollars).toFixed(2);
  }
  // % mode — show percentage, and dollar equivalent if we have account size
  const pct = accSize > 0 ? (dollars / accSize) * 100 : val;
  if (accSize > 0) {
    return (pct >= 0 ? '+' : '') + pct.toFixed(3) + '% (' +
      (dollars >= 0 ? '+$' : '-$') + Math.abs(dollars).toFixed(2) + ')';
  }
  return (pct >= 0 ? '+' : '') + pct.toFixed(3) + '%';
}

function _isMt5Trade(trade) {
  return trade.source === 'mt5'
      || trade.pnlUnit === '$'
      || (trade.notes && trade.notes.includes('MT5 Import'))
      || !!trade.mt5Ticket;
}

function toPnlDollars(trade, accSize) {
  const val  = parseFloat(trade.pnl) || 0;

  // 1. Explicit $ unit — trust it directly
  if (trade.pnlUnit === '$') return val;

  // 2. MT5 detection via source/notes/ticket — value is already in dollars
  if (_isMt5Trade(trade)) return val;

  // 3. Magnitude guard — if accSize is known and |val| > accSize*0.5,
  //    the value can't possibly be a percentage (no one loses 50%+ per trade normally)
  //    so treat as dollars
  if (accSize > 0 && Math.abs(val) > accSize * 0.5) return val;

  // 4. Standard % trade — convert using account size
  if (trade.pnlUnit === '%' && accSize > 0) return (val / 100) * accSize;

  return val; // fallback — no conversion possible
}

// ── Unit-safe display + aggregation helpers ────────────────────────────────
// BUG FIX (2026-07-02): dozens of places across this file used to display
// raw `t.pnl` with a hardcoded '%' suffix, and summed raw `t.pnl` across
// trades to produce "totals". That's wrong whenever a trade's pnlUnit is
// '$' (real dollar P/L, e.g. MT5 imports or a manually-logged dollar trade)
// — a dollar figure like -101.76 would get shown as "-101.76%" and summed
// straight into percentage totals, wrecking every aggregate (AI Coach
// "All-time PnL", dashboard KPIs, weekly/monthly stats, etc). These two
// helpers are now the single source of truth for "does this look like %
// or $, and what should it say / count as". Every display and sum in the
// file should route through one of these instead of touching t.pnl raw.
function _pnlLabel(t) {
  const val = parseFloat(t.pnl) || 0;
  if (_isMt5Trade(t)) {
    return (val >= 0 ? '+$' : '-$') + Math.abs(val).toFixed(2);
  }
  return (val > 0 ? '+' : '') + val + '%';
}
function _pnlPctValue(t) {
  // Returns the trade's contribution in PERCENT terms for aggregation.
  // %-denominated trades: their raw value, unchanged.
  // $-denominated trades (MT5 or pnlUnit:'$'): converted using the
  // trade's own account size if known, otherwise excluded (0) rather than
  // silently corrupting the sum the way raw addition used to.
  if (!_isMt5Trade(t) && t.pnlUnit !== '$') return parseFloat(t.pnl) || 0;
  const sz = getAccSizeForAccount(t.account);
  if (sz > 0) return (toPnlDollars(t, sz) / sz) * 100;
  return 0;
}

function getAccSizeForAccount(accountName) {
  const acc = _getCustomAccounts ? _getCustomAccounts().find(a => a.name === accountName) : null;
  return parseFloat(acc?.size) || 0;
}

function getAccPnlMode(accountName) {
  const acc = _getCustomAccounts ? _getCustomAccounts().find(a => a.name === accountName) : null;
  return acc?.pnlMode || '%';
}

// ── Local date helper ─────────────────────────────────────────────────────
// new Date().toISOString() returns UTC, which can be yesterday in WAT (UTC+1).
// Always use this to get today's date in the user's local timezone.
function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ── User timezone helpers ───────────────────────────────────────────────
// Respects the "Timezone" setting on the Account tab (_profileData.timezone),
// falling back to Africa/Lagos (WAT) if unset or invalid. All time-of-day
// displays across the app (chat bubbles, journal exports, watchlist times,
// "last updated" labels, the topbar clock, etc.) should go through these
// helpers so that changing the preferred timezone applies everywhere.
//
// Special value "exchange": the timezone picker includes an "Exchange"
// entry with no fixed IANA zone of its own — it resolves to the visitor's
// own system/browser timezone at read time. If you'd rather this be tied
// to a specific broker or instrument's exchange hours, swap the resolution
// below for that fixed IANA zone instead.
function getUserTz() {
  const raw = (typeof _profileData !== 'undefined' && _profileData && _profileData.timezone) || 'Africa/Lagos';
  if (raw === 'exchange') {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos'; }
    catch (e) { return 'Africa/Lagos'; }
  }
  return raw;
}
// Returns the same human label shown in the Account tab's Timezone
// dropdown (e.g. "(UTC-4) New York") for the user's current setting, by
// looking up the matching <option> — single source of truth, so the
// topbar and the Account page can never drift out of sync with each other.
function getUserTzCityLabel() {
  const raw = (typeof _profileData !== 'undefined' && _profileData && _profileData.timezone) || 'Africa/Lagos';
  const sel = document.getElementById('pf-timezone');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === raw) return sel.options[i].textContent;
    }
  }
  // Fallback (dropdown not in DOM yet, or a stored value with no matching
  // option): synthesize a "(UTC±H) Zone" label from the resolved IANA zone.
  const tz = getUserTz();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const off = (parts.find(p => p.type === 'timeZoneName') || {}).value || '';
    return '(' + off.replace('GMT', 'UTC') + ') ' + tz.split('/').pop().replace(/_/g, ' ');
  } catch (e) {
    return tz;
  }
}
// Returns the short timezone label (e.g. "WAT", "GMT", "EST") for a given
// IANA zone, falling back to "WAT" if the zone can't be resolved.
function getUserTzLabel(tz) {
  tz = tz || getUserTz();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
    return (parts.find(p => p.type === 'timeZoneName') || {}).value || 'WAT';
  } catch (e) {
    return 'WAT';
  }
}
// Returns the abbreviated UTC-offset label (e.g. "UTC-4", "UTC+1") for a
// given IANA zone, matching the offset shown in the Account tab's Timezone
// dropdown (just without the city name). All timestamp displays across the
// app use this instead of getUserTzLabel()'s zone-abbreviation ("EDT",
// "WAT", etc.), so the label always reflects the user's chosen offset
// consistently everywhere.
function getUserTzOffsetLabel(tz) {
  tz = tz || getUserTz();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const off = (parts.find(p => p.type === 'timeZoneName') || {}).value || '';
    return off.replace('GMT', 'UTC') || 'UTC';
  } catch (e) {
    return 'UTC';
  }
}
// Converts a fixed UTC session hour (e.g. London Open = 7 UTC) into a
// "h:mm AM/PM" string in the user's selected timezone. Used to keep
// session/killzone times shown around the app in sync with whatever
// timezone is set on the Account tab, instead of a hardcoded WAT offset.
function formatUtcHourInUserTz(utcHour, tz) {
  tz = tz || getUserTz();
  const d = new Date(Date.UTC(2000, 0, 1, utcHour, 0, 0));
  try { return d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch (e) { return utcHour + ':00 UTC'; }
}
// Formats a time (defaults to now) as "HH:MM" in the user's preferred timezone.
function formatUserTime(date) {
  date = date || new Date();
  const tz = getUserTz();
  try {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  } catch (e) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  }
}
// Formats a date+time (defaults to now) using the user's preferred timezone.
function formatUserDateTime(date, opts) {
  date = date || new Date();
  const tz = getUserTz();
  try {
    return date.toLocaleString('en-GB', Object.assign({ timeZone: tz }, opts || {}));
  } catch (e) {
    return date.toLocaleString('en-GB', Object.assign({ timeZone: 'Africa/Lagos' }, opts || {}));
  }
}

// Current authenticated user — set on boot
let _currentUser = null;

// ── SEED DATA (shown on first load / for new users) ───
const SEED_TRADES = [
  {id:1,date:"2026-03-02",pair:"EURGBP",pos:"Sell",rr:"1:4",pnl:0,outcome:"B.E",kz:"Asian",strategy:"IRL > ERL",tf:"30m > 3m",account:"PaperTrading",rating:4,notes:"Price tapped Asian range high and stalled — moved SL to BE. Valid setup but no follow-through.",pretrade:"Bearish bias from daily OB",emotion:"Calm",risk:"0.5%",checklist:[0,1,2,3,4,6],charts:[]},
  {id:2,date:"2026-03-02",pair:"USDCAD",pos:"Sell",rr:"1:3",pnl:-1,outcome:"Loss",kz:"London",strategy:"",tf:"",account:"PaperTrading",rating:5,notes:"Entered without a confirmed strategy. Lesson: always tag setup before entry.",pretrade:"",emotion:"Neutral",risk:"0.5%",checklist:[0,1],charts:[]},
  {id:3,date:"2026-03-03",pair:"XAUUSD",pos:"Sell",rr:"1:5",pnl:5.6,outcome:"Win",kz:"London",strategy:"IRL > ERL",tf:"30m > 3m",account:"PaperTrading",rating:5,notes:"Beautiful liquidity sweep at London open. Price delivered into daily SIBI. Full target hit.",pretrade:"Clean daily FVG fill setup",emotion:"Confident",risk:"0.5%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:4,date:"2026-03-04",pair:"GBPUSD",pos:"Buy",rr:"1:4",pnl:4,outcome:"Win",kz:"London",strategy:"ERL > IRL",tf:"1h > 5m",account:"PaperTrading",rating:5,notes:"4h ERL swept cleanly. 1h OB respected. Entered on 5m confirmation candle. Held for full target.",pretrade:"ERL > IRL confirmed on 4h",emotion:"Calm",risk:"0.8%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:5,date:"2026-03-04",pair:"GBPJPY",pos:"Buy",rr:"1:3",pnl:3,outcome:"Win",kz:"London",strategy:"ERL > IRL",tf:"30m > 3m",account:"PaperTrading",rating:5,notes:"Correlated entry with GBPUSD. 30m structure shift confirmed. Quick delivery into ERL.",pretrade:"Correlated with GBPUSD bias",emotion:"Confident",risk:"0.5%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:6,date:"2026-03-05",pair:"XAUUSD",pos:"Sell",rr:"1:3.5",pnl:3.4,outcome:"Win",kz:"London",strategy:"IRL > ERL",tf:"30m > 3m",account:"PaperTrading",rating:5,notes:"1am London manipulation swept IRL. 30m MS confirmed bearish. Clean 3m entry.",pretrade:"IRL swept at 1am manipulation",emotion:"Calm",risk:"0.8%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:7,date:"2026-03-05",pair:"GBPUSD",pos:"Sell",rr:"1:4",pnl:3.3,outcome:"Win",kz:"New York",strategy:"IRL > ERL",tf:"30m > 3m",account:"PaperTrading",rating:5,notes:"NY open continued London sell. Clean delivery.",pretrade:"NY continuation of London trend",emotion:"Calm",risk:"0.5%",checklist:[0,1,2,4,5,6],charts:[]},
  {id:8,date:"2026-03-06",pair:"GBPUSD",pos:"Buy",rr:"1:3",pnl:0,outcome:"B.E",kz:"London",strategy:"NxtGen - Mod",tf:"1h > 3m",account:"PaperTrading",rating:4,notes:"Good entry. Moved SL to BE too quickly on first pullback. Price eventually hit target. Patience needed.",pretrade:"NxtGen model — 1h CISD",emotion:"Anxious",risk:"0.5%",checklist:[0,1,2,3,4,5,6],charts:[]},
  {id:9,date:"2026-03-09",pair:"GBPUSD",pos:"Sell",rr:"1:3",pnl:3,outcome:"Win",kz:"London",strategy:"NxtGen - Mod",tf:"30m > 3m",account:"GFT $5k - P1",rating:4,notes:"First funded account trade. Clean NxtGen setup. Stuck to plan. Great execution.",pretrade:"Strong bearish week bias",emotion:"Calm",risk:"0.5%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:10,date:"2026-03-10",pair:"ES",pos:"Sell",rr:"1:2.5",pnl:2.6,outcome:"Win",kz:"New York",strategy:"IRL > ERL",tf:"30m > 3m",account:"GFT $10k - P1",rating:5,notes:"ES gap fill at NY open. IRL swept. 30m OB gave entry. Smooth delivery.",pretrade:"IRL > ERL model on ES futures",emotion:"Confident",risk:"1%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:11,date:"2026-03-10",pair:"GBPUSD",pos:"Buy",rr:"1:2",pnl:2.1,outcome:"Win",kz:"New York",strategy:"IRL > ERL",tf:"30m > 3m",account:"GFT $5k - P1",rating:5,notes:"London sell complete. NY reversal from daily IRL. 30m MS shifted bullish.",pretrade:"Reversal after London sell",emotion:"Calm",risk:"0.5%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:12,date:"2026-03-10",pair:"GBPUSD",pos:"Sell",rr:"1:3",pnl:5.2,outcome:"Win",kz:"London",strategy:"NxtGen - Mod",tf:"30m > 3m",account:"GFT $5k - P1",rating:5,notes:"Best trade of the week. 1am manipulation clear. 30m MS bearish. 3m entry perfect. Full RR hit.",pretrade:"NxtGen textbook sell setup",emotion:"Confident",risk:"1%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:13,date:"2026-03-11",pair:"GBPUSD",pos:"Sell",rr:"1:2",pnl:-1,outcome:"Loss",kz:"London",strategy:"NxtGen - Mod",tf:"1h > 5m",account:"GFT $5k - P1",rating:5,notes:"Took a sell when daily was still bullish. NxtGen model needs HTF alignment. Costly lesson.",pretrade:"NxtGen setup but HTF bullish",emotion:"Fearful",risk:"0.5%",checklist:[0,1,2,3,4,5],charts:[]},
  {id:14,date:"2026-03-12",pair:"GBPUSD",pos:"Buy",rr:"1:3",pnl:2.8,outcome:"Win",kz:"London",strategy:"IRL > ERL",tf:"30m > 3m",account:"GFT $5k - P1",rating:5,notes:"Back to buying after Thursday's loss. Daily IRL held perfectly. 30m shift. Clean 3m entry.",pretrade:"Daily bullish — IRL respected",emotion:"Calm",risk:"0.8%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:15,date:"2026-03-13",pair:"EURUSD",pos:"Sell",rr:"1:4",pnl:4,outcome:"Win",kz:"London",strategy:"NxtGen - Mod",tf:"1h > 3m",account:"GFT $10k - P1",rating:4,notes:"EURUSD weekly bearish. Daily SIBI. 1h confirmed. 3m entry. Full target in 2hrs.",pretrade:"EURUSD daily SIBI fill",emotion:"Confident",risk:"1%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:16,date:"2026-04-01",pair:"GBPUSD",pos:"Buy",rr:"1:3",pnl:3,outcome:"Win",kz:"London",strategy:"IRL > ERL",tf:"30m > 3m",account:"GFT $5k - P1",rating:5,notes:"Q2 started strong. Daily bullish continuation. IRL > ERL textbook.",pretrade:"Strong weekly bullish bias Q2",emotion:"Calm",risk:"0.8%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:17,date:"2026-04-02",pair:"EURUSD",pos:"Sell",rr:"1:4",pnl:-1,outcome:"Loss",kz:"London",strategy:"NxtGen - Mod",tf:"1h > 3m",account:"GFT $5k - P1",rating:3,notes:"Rating was 3 stars — should not have taken it. Data shows 3-star setups underperform.",pretrade:"Marginal setup",emotion:"Anxious",risk:"0.5%",checklist:[0,1,2,3,4],charts:[]},
  {id:18,date:"2026-04-03",pair:"XAUUSD",pos:"Buy",rr:"1:5",pnl:5,outcome:"Win",kz:"Asian",strategy:"ERL > IRL",tf:"30m > 3m",account:"GFT $10k - P1",rating:5,notes:"Asian consolidation broke cleanly at 3am. ERL swept. Full 1:5 RR delivered in NY.",pretrade:"Asian range break setup",emotion:"Calm",risk:"1%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
  {id:19,date:"2026-04-07",pair:"EURUSD",pos:"Buy",rr:"1:4",pnl:0,outcome:"B.E",kz:"London",strategy:"IRL > ERL",tf:"1h > 5m",account:"GFT $5k - P1",rating:4,notes:"CPI data caused spike — stopped BE. Should have closed before news.",pretrade:"Valid but NY news risk",emotion:"Anxious",risk:"0.5%",checklist:[0,1,2,3,4,5,6],charts:[]},
  {id:20,date:"2026-04-09",pair:"XAUUSD",pos:"Buy",rr:"1:4",pnl:4,outcome:"Win",kz:"London",strategy:"IRL > ERL",tf:"1h > 3m",account:"GFT $10k - P1",rating:5,notes:"Strong week for gold. Daily IRL into previous week low swept. 1h OB entry. Clean delivery.",pretrade:"Daily bullish gold bias",emotion:"Confident",risk:"1%",checklist:[0,1,2,3,4,5,6,7],charts:[]},
];

const CHECKLIST_ITEMS=["HTF PDA confirmed","4h Profiling","Liquidity Sweep","SMT Divergence","CISD Confirmed","R:R ≥ 1:2","Active Killzone"];
const EMOTIONS=["Calm","Relaxed","Confident","Focused","Neutral","Anxious","Impatient","Fearful","Greedy","Revenge"];
const CHART_LABELS=["Daily HTF","4h Structure","1h Confirm","30m Trigger","3m/5m Entry","Result"];
const RULES=["Never trade without HTF bias confirmed","Never enter without an active killzone","Never risk more than 1% on funded accounts","Never chase price — missed entry = no entry","Never move SL before 30% of target is hit","Never trade 15 min before/after red news","Never skip the entry checklist","Never take more than 2 trades per day","Never take a 3★ or below setup","Never trade while angry, fearful or revenge-seeking"];
const MODELS=[
  {title:"IRL > ERL",strategyName:"IRL > ERL",status:"active",dir:"Bearish",sub:"Price at Internal Range Liquidity → delivers to External Range Liquidity",steps:["Daily/Weekly confirms bearish bias","4h shows sell-side delivery","1am London manipulation sweeps buy-side (IRL)","30m market structure shifts bearish (BOS/CHoCH)","Enter on 3m OB or FVG · SL above manipulation high","Target: ERL — previous lows, daily BISI, weekly discount"]},
  {title:"ERL > IRL",strategyName:"ERL > IRL",status:"active",dir:"Bullish",sub:"Price at External Range Liquidity → returns to Internal Range Liquidity",steps:["Daily/Weekly confirms bullish bias","4h shows buy-side delivery","1am London manipulation sweeps sell-side (ERL)","30m market structure shifts bullish","Enter on 3m OB or FVG · SL below manipulation low","Target: IRL — previous highs, daily SIBI, weekly premium"]},
  {title:"NxtGen - Mod",strategyName:"NxtGen - Mod",status:"active",dir:"SMT + CISD",sub:"SMT divergence confirms manipulation · CISD gives entry",steps:["Identify SMT between GBPUSD/EURUSD or Gold/DXY","One pair makes new high/low while other fails → SMT confirmed","Wait for CISD on 1h or 30m","Enter on 3m/5m · tight SL","Target: opposing liquidity pool"]},
];
const WL_PAIRS=[
  {name:"GBPUSD",priority:"HIGH",bias:"Bear",tfs:[{tf:"Weekly",bias:"bear"},{tf:"Daily",bias:"bear"},{tf:"4H",bias:"bear"},{tf:"1H",bias:"neu"}],note:"Setup: NxtGen IRL>ERL · Key: 1.2650 OB · R:R 1:3 · London kill zone · Watch 1am manipulation"},
  {name:"XAUUSD",priority:"HIGH",bias:"Bull",tfs:[{tf:"Weekly",bias:"bull"},{tf:"Daily",bias:"bull"},{tf:"4H",bias:"neu"}],note:"Setup: IRL>ERL bounce · Target: 3100 EQL · R:R 1:4 · Asian range then NY breakout"},
  {name:"EURUSD",priority:"MED",bias:"Bear",tfs:[{tf:"Weekly",bias:"bear"},{tf:"Daily",bias:"bear"},{tf:"4H",bias:"bear"}],note:"Setup: Liquidity sweep · FOMC risk — wait for NY open · R:R 1:3"},
  {name:"GBPJPY",priority:"MED",bias:"Bull",tfs:[{tf:"Weekly",bias:"bull"},{tf:"Daily",bias:"bull"},{tf:"4H",bias:"neu"}],note:"Check DXY correlation · SMT divergence with GBPUSD · R:R 1:5"},
];
// Preweek prep checklist for the Weekly Watchlist page. Session/killzone
// hours are converted from fixed UTC windows into whatever timezone is
// selected on the Account tab (falls back to WAT if unset), so this always
// matches the topbar clock and AI Coach rather than being stuck on WAT.
function getPreweekChecks() {
  const tz = getUserTz();
  const off = getUserTzOffsetLabel(tz);
  const h = (u) => formatUtcHourInUserTz(u, tz);
  return [
    "DXY analysis complete",
    "All high-priority pairs analyzed top-down",
    `Key news events noted (${off} times)`,
    "Weekly levels drawn on charts",
    `London KZ confirmed: ${h(8)}–${h(11)} ${off}`,
    `New York KZ confirmed: ${h(14)}–${h(17)} ${off}`,
    `Asian KZ confirmed: ${h(1)}–${h(4)} ${off}`,
    "Max 2 trades/day set",
    "Max daily loss −2% set",
    "Max weekly loss −5% set",
    "No pending FOMO setups",
    "Mindset: calm and rule-based",
  ];
}
const PREWEEK_CHECKS = getPreweekChecks();
const MILESTONES=["Pass GFT $5k Phase 1","Pass GFT $10k Phase 1","Receive first funded payout","Scale to $50k funded","Scale to $100k funded","Open personal live account","Consistent $1k/month"];
const GOALS=[
  {q:"Q1 2026 — Complete",items:[{t:"Log every trade with full notes",done:true},{t:"Achieve 70%+ win rate in March",done:true},{t:"Pass first GFT challenge (Phase 1)",done:true},{t:"Build consistent London session routine",done:true},{t:"Achieve $1,000 profit from funded accounts",done:false}]},
  {q:"Q2 2026 — Active",items:[{t:"Maintain 70%+ win rate",done:true},{t:"Pass GFT $10k Phase 1",done:false},{t:"Receive first funded payout",done:false},{t:"Trade 3 consecutive winning weeks",done:false},{t:"Build Sunday watchlist habit",done:false}]},
  {q:"Q3 2026",items:[{t:"Scale to 2% risk on top setups",done:false},{t:"Add NASDAQ to watchlist",done:false},{t:"Achieve $3,000 total payouts",done:false}]},
];

// ── STATE ─────────────────────────────────────────────
let trades = [];
let deletedTrades = [];
let _pnlToggleMode = '%'; // '%' (default) | '$' — toggled by tapping Net PnL card

// ── Robust R:R parser ──────────────────────────────────
// Parses free-text risk:reward entries like "1:3", "1:2.5", "2:5", " 1 : 3 "
// and returns the true reward-to-risk ratio (reward / risk), not just the
// second number — so it works correctly regardless of how the risk side
// was entered (previously this assumed risk was always exactly "1").
function _parseRR(rrStr) {
  if (!rrStr) return null;
  const m = String(rrStr).match(/([\d.]+)\s*:\s*([\d.]+)/);
  if (!m) return null;
  const risk = parseFloat(m[1]);
  const reward = parseFloat(m[2]);
  if (!risk || isNaN(risk) || isNaN(reward)) return null;
  return reward / risk;
}
let _modalChecklist = []; // checked items in new-trade modal
let _checklistWarningAcked = false; // allows bypass on second save click
let _modalMentalState = 'Focused'; // mental state for new-trade modal
let _modalFollowedPlan = 'Yes';    // followed plan for new-trade modal
let _eqCurveMode = 'pct'; // equity curve display mode
// Dashboard date range filter — null means all-time
let _dashFilter = { from: null, to: null, preset: 'all' };
// Filtered trades for dashboard (all unless filter is active)
function _getFilteredTrades() {
  if (!_dashFilter.from && !_dashFilter.to) return trades;
  return trades.filter(t => {
    if (_dashFilter.from && t.date < _dashFilter.from) return false;
    if (_dashFilter.to   && t.date > _dashFilter.to)   return false;
    return true;
  });
}
// Sort state for dashboard tables (col = column key, dir = 1 asc / -1 desc)
let _sortPair     = { col: 'trades', dir: -1 };
let _sortKz       = { col: 'trades', dir: -1 };
let _sortStrategy = { col: 'trades', dir: -1 };
let _sortMonthly  = { col: 'month',  dir: -1 };
let tradeState = {};   // keyed by trade id — holds notes/charts/checklist
let currentDetail = null;
let currentUploadSlot = null;
let _detFullscreen = false;
let _detEditMode = false;
let _detActiveTab = 'overview';

// ══════════════════════════════════════════════════════
// SUPABASE HELPERS
// Each function talks to the DB and also keeps the local
// in-memory arrays (trades, deletedTrades, tradeState) in sync.
// ══════════════════════════════════════════════════════

/* Map a Supabase DB row → the shape the rest of the app expects */
function _rowToTrade(row) {
  return {
    id:       row.id,
    date:     row.trade_date,
    pair:     row.pair,
    pos:      row.pos,
    rr:       row.rr,
    pnl:      parseFloat(row.pnl) || 0,
    pnlUnit:  row.pnl_unit && row.pnl_unit !== '%' 
              ? row.pnl_unit 
              : (row.source === 'mt5' || (row.notes && row.notes.includes('MT5 Import')) ? '$' : '%'),
    outcome:  row.outcome,
    kz:       row.kz,
    strategy: row.strategy || '',
    tf:       row.tf || '',
    account:  row.account,
    rating:   row.rating || 5,
    risk:     row.risk || '0.5%',
    notes:    row.notes || '',
    pretrade: row.pretrade || '',
    emotion:  row.emotion || 'Calm',
    checklist: row.checklist || [],
    charts:   row.charts || [],
    chartLabels: row.chart_labels || [...CHART_LABELS],
    mistakes: row.mistakes || '',
    source:   row.source || '',
    wouldRetake: row.would_retake !== undefined ? row.would_retake : null,
    lossReason:  row.loss_reason || '',
    followedPlan: row.followed_plan || 'Yes',
  };
}

/* Map a Supabase deleted_trades row */
function _rowToDeleted(row) {
  return {
    ..._rowToTrade(row),
    deletedAt: row.deleted_at,
    originalId: row.original_id,
  };
}

/* Load all active trades for this user from Supabase */
function _showSkeletons() {
  ['pair-table-body','kz-table-body','strategy-table-body','monthly-table-body'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cols = { 'pair-table-body': 5, 'kz-table-body': 5, 'strategy-table-body': 4, 'monthly-table-body': 8 }[id] || 5;
    el.innerHTML = Array.from({length:4}, () =>
      `<tr>${Array.from({length:cols}, (_,i) => `<td><div class="skel skel-${i===0?'name':i===1?'num':'pill'}"></div></td>`).join('')}</tr>`
    ).join('');
  });
  const kpiEls = ['kpi-total','kpi-wr','kpi-pnl','kpi-pf','kpi-aw','kpi-al','kpi-rr','kpi-ws','kpi-dd'];
  kpiEls.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<div class="skel skel-kpi"></div>'; });
}
function _hideSkeletons() { /* replaced by actual data rendering */ }

// Columns pulled on initial load. `charts` is deliberately excluded —
// it can hold base64 image data (or long URL arrays) and is only ever
// needed when a single trade's detail panel is opened. Pulling it for
// every row on every page load is the #1 cause of slow boot times on
// accounts with lots of chart images. See _ensureChartsLoaded().
const _TRADE_LIST_COLUMNS =
  'id, trade_date, pair, pos, rr, pnl, pnl_unit, outcome, kz, strategy, tf, ' +
  'account, rating, risk, notes, pretrade, emotion, checklist, chart_labels, ' +
  'mistakes, source, would_retake, loss_reason, followed_plan';

async function loadTrades() {
  _showSkeletons();
  const { data, error } = await sb
    .from('journal_trades')
    .select(_TRADE_LIST_COLUMNS)
    .eq('user_id', _currentUser.id)
    .order('trade_date', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    console.error('loadTrades error:', error.message);
    return false;
  }

  if (data.length === 0) {
    // New user — start with an empty journal; no seed data
    trades = [];
    tradeState = {};
  } else {
    trades = data.map(_rowToTrade);
    // Rebuild tradeState from DB rows
    tradeState = {};
    data.forEach(row => {
      tradeState[row.id] = {
        notes:       row.notes || '',
        pretrade:    row.pretrade || '',
        mistakes:    row.mistakes || '',
        emotion:     row.emotion || 'Calm',
        checklist:   row.checklist || [],
        charts:      [],              // lazy-loaded on demand — see _ensureChartsLoaded
        chartLabels: row.chart_labels || [...CHART_LABELS],
        _chartsLoaded: false,
      };
    });
  }
  return true;
}

/* Fetch just the `charts` column for one trade, the first time it's actually
   needed (i.e. when its detail panel is opened). Cached after first load so
   re-opening the same trade doesn't re-fetch. This is what lets loadTrades()
   skip charts entirely for the bulk list/table/calendar views. */
async function _ensureChartsLoaded(id) {
  const s = getTS(id);
  if (s._chartsLoaded) return;
  if (!_currentUser) return;
  const { data, error } = await sb
    .from('journal_trades')
    .select('charts')
    .eq('id', id)
    .eq('user_id', _currentUser.id)
    .maybeSingle();
  if (error) { console.error('_ensureChartsLoaded error:', error.message); return; }
  s.charts = data?.charts || [];
  s._chartsLoaded = true;
  const t = trades.find(x => x.id === id);
  if (t) t.charts = s.charts;
}

/* Load deleted trades for this user */
async function loadDeletedTrades() {
  // Same reasoning as loadTrades(): the trash list never renders chart
  // images, so don't pay to download them here either. Charts are pulled
  // on the fly by _ensureChartsLoaded() the moment a deleted trade needs them.
  const { data, error } = await sb
    .from('journal_deleted_trades')
    .select(_TRADE_LIST_COLUMNS + ', deleted_at, original_id')
    .eq('user_id', _currentUser.id)
    .order('deleted_at', { ascending: false });

  if (error) { console.error('loadDeletedTrades error:', error.message); return; }
  deletedTrades = (data || []).map(_rowToDeleted);
}

/* Insert demo seed trades for brand new users */
async function seedDemoTrades() {
  showToast('Setting up your journal…', 'info');
  const rows = SEED_TRADES.map(t => ({
    user_id:      _currentUser.id,
    trade_date:   t.date,
    pair:         t.pair,
    pos:          t.pos,
    rr:           t.rr,
    pnl:          t.pnl,
    outcome:      t.outcome,
    kz:           t.kz,
    strategy:     t.strategy,
    tf:           t.tf,
    account:      t.account,
    rating:       t.rating,
    risk:         t.risk,
    notes:        t.notes,
    pretrade:     t.pretrade,
    emotion:      t.emotion,
    checklist:    t.checklist,
    charts:       t.charts,
    chart_labels: [...CHART_LABELS],
    mistakes:     '',
  }));

  const { data, error } = await sb.from('journal_trades').insert(rows).select();
  if (error) { console.error('Seed error:', error.message); return; }
  trades = data.map(_rowToTrade);
  tradeState = {};
  data.forEach(row => {
    tradeState[row.id] = {
      notes: row.notes || '', pretrade: row.pretrade || '',
      mistakes: '', emotion: row.emotion || 'Calm',
      checklist: row.checklist || [], charts: row.charts || [],
      chartLabels: [...CHART_LABELS],
    };
  });
  showToast('Welcome! Demo trades loaded.', 'restore');
}

/* Save a single trade to Supabase — UPDATE if id exists, INSERT if new */
async function _cloudSaveTrade(t) {
  if (!t || !_currentUser) return false;
  const s = getTS(t.id);

  const row = {
    user_id:      _currentUser.id,
    trade_date:   t.date,
    pair:         t.pair,
    pos:          t.pos,
    rr:           t.rr,
    pnl:          t.pnl,
    pnl_unit:     t.pnlUnit || '%',
    outcome:      t.outcome,
    kz:           t.kz,
    strategy:     t.strategy || '',
    tf:           t.tf || '',
    account:      t.account,
    rating:       t.rating,
    risk:         t.risk || '0.5%',
    notes:        s.notes !== undefined ? s.notes : (t.notes || ''),
    pretrade:     s.pretrade !== undefined ? s.pretrade : (t.pretrade || ''),
    emotion:      s.emotion || t.emotion || 'Calm',
    checklist:    s.checklist || t.checklist || [],
    charts:       s.charts || t.charts || [],
    chart_labels: s.chartLabels || t.chartLabels || [...CHART_LABELS],
    mistakes:     s.mistakes !== undefined ? s.mistakes : '',
    source:       t.source || '',
    would_retake: s.wouldRetake !== undefined ? s.wouldRetake : (t.wouldRetake !== undefined ? t.wouldRetake : null),
    loss_reason:  t.lossReason || '',
    followed_plan: t.followedPlan || 'Yes',
  };

  let error;
  if (t.id && typeof t.id === 'number') {
    // Existing trade — update in place
    const res = await sb.from('journal_trades')
      .update(row)
      .eq('id', t.id)
      .eq('user_id', _currentUser.id);
    error = res.error;
  } else {
    // New trade — insert and capture generated id
    const res = await sb.from('journal_trades').insert(row).select().single();
    error = res.error;
    if (!error && res.data) t.id = res.data.id;
  }

  if (error) {
    console.error('_cloudSaveTrade error:', error.message, '|', error.details, '|', error.hint);
    showToast('Save failed: ' + error.message, 'danger');
    return false;
  }
  return true;
}


/* Delete a trade from journal_trades (soft delete: insert to journal_deleted_trades) */
async function _cloudSoftDelete(t) {
  const deletedRow = {
    user_id:      _currentUser.id,
    original_id:  t.id,
    trade_date:   t.date,
    pair:         t.pair,
    pos:          t.pos,
    rr:           t.rr,
    pnl:          t.pnl,
    outcome:      t.outcome,
    kz:           t.kz,
    strategy:     t.strategy,
    tf:           t.tf,
    account:      t.account,
    rating:       t.rating,
    risk:         t.risk,
    notes:        t.notes || '',
    pretrade:     t.pretrade || '',
    emotion:      t.emotion || 'Calm',
    checklist:    t.checklist || [],
    charts:       t.charts || [],
    chart_labels: t.chartLabels || [...CHART_LABELS],
    mistakes:     t.mistakes || '',
    deleted_at:   new Date().toISOString(),
    loss_reason:  t.lossReason || '',
    followed_plan: t.followedPlan || 'Yes',
  };

  const [del, ins] = await Promise.all([
    sb.from('journal_trades').delete().eq('id', t.id).eq('user_id', _currentUser.id),
    sb.from('journal_deleted_trades').insert(deletedRow),
  ]);

  if (del.error) { console.error('Delete error:', del.error.message); return false; }
  if (ins.error) { console.error('Insert deleted error:', ins.error.message); return false; }
  return true;
}

/* Restore a deleted trade: remove from deleted, insert back to active */
async function _cloudRestoreTrade(deletedRow) {
  const newRow = {
    user_id:      _currentUser.id,
    trade_date:   deletedRow.date,
    pair:         deletedRow.pair,
    pos:          deletedRow.pos,
    rr:           deletedRow.rr,
    pnl:          deletedRow.pnl,
    outcome:      deletedRow.outcome,
    kz:           deletedRow.kz,
    strategy:     deletedRow.strategy,
    tf:           deletedRow.tf,
    account:      deletedRow.account,
    rating:       deletedRow.rating,
    risk:         deletedRow.risk,
    notes:        deletedRow.notes || '',
    pretrade:     deletedRow.pretrade || '',
    emotion:      deletedRow.emotion || 'Calm',
    checklist:    deletedRow.checklist || [],
    charts:       deletedRow.charts || [],
    chart_labels: deletedRow.chartLabels || [...CHART_LABELS],
    mistakes:     deletedRow.mistakes || '',
  };

  // Find the DB id of the deleted record (stored as originalId in local model)
  const { data: delData } = await sb
    .from('journal_deleted_trades')
    .select('id')
    .eq('original_id', deletedRow.originalId)
    .eq('user_id', _currentUser.id)
    .single();

  // Try to restore with the ORIGINAL id so the trade keeps its original
  // position in the newest-first sort order, instead of jumping to the
  // top of its date group with a freshly generated id. If the table's id
  // column doesn't allow explicit inserts (identity-always columns), fall
  // back to a normal insert.
  let ins = await sb.from('journal_trades')
    .insert({ ...newRow, id: deletedRow.originalId })
    .select().single();
  if (ins.error) {
    ins = await sb.from('journal_trades').insert(newRow).select().single();
  }
  const del = delData
    ? await sb.from('journal_deleted_trades').delete().eq('id', delData.id)
    : { error: null };

  if (ins.error) { console.error('Restore insert error:', ins.error.message); return null; }
  return _rowToTrade(ins.data);
}

/* Permanently delete a record from journal_deleted_trades */
async function _cloudPermDelete(originalId) {
  const { error } = await sb
    .from('journal_deleted_trades')
    .delete()
    .eq('original_id', originalId)
    .eq('user_id', _currentUser.id);
  if (error) { console.error('Perm delete error:', error.message); return false; }
  return true;
}

/* Empty trash — delete all deleted_trades for this user */
async function _cloudEmptyTrash() {
  const { error } = await sb
    .from('journal_deleted_trades')
    .delete()
    .eq('user_id', _currentUser.id);
  if (error) { console.error('Empty trash error:', error.message); return false; }
  return true;
}

// ── Background cloud save — fire and forget, show toast only on error ──
function _bgSave(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  _cloudSaveTrade(t).then(ok => {
    if (!ok) showToast('Auto-save failed — tap Save Changes to retry', 'danger');
  });
}

// ── Debounce utility ──
function _debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
const _debouncedRename = _debounce(function(id, idx, val) {
  const s = getTS(id);
  if (!s.chartLabels) s.chartLabels = [...CHART_LABELS];
  s.chartLabels[idx] = val.trim() || ('TF ' + (idx + 1));
  _bgSave(id);
}, 800);

// ── tradeState helper (in-memory, synced on each save) ──
function getTS(id) {
  if (!tradeState[id]) tradeState[id] = {
    notes: '', pretrade: '', mistakes: '', emotion: 'Calm',
    checklist: [], charts: [], chartLabels: [...CHART_LABELS],
  };
  if (!tradeState[id].chartLabels) tradeState[id].chartLabels = [...CHART_LABELS];
  if (!tradeState[id].charts) tradeState[id].charts = [];
  return tradeState[id];
}


// ═══════════════════════════════════════════════════════════════════
//  AI COACH ENGINE — Powered by Anthropic Claude
//  Modes: daily · weekly · monthly · pattern · psych · plan · chart
// ═══════════════════════════════════════════════════════════════════

let _aiMode        = 'daily';
let _aiChartImages = [];   // { dataUrl, mimeType, name }
let _aiHistory     = [];   // { role, content } conversation turns
let _aiStreaming    = false;

/* ── Suggestion chips per mode ── */
const _AI_CHIPS = {
  daily:   ['What should I focus on today?', 'Am I ready to trade today?', 'What pairs suit my edge today?', 'Give me a morning brief'],
  weekly:  ['Review my week', 'What patterns emerged this week?', 'Where did I lose discipline?', 'Best and worst trades this week'],
  monthly: ['Full month review', 'How did my psychology affect PnL?', 'Which strategy is working best?', 'Am I on track for my goals?'],
  pattern: ['Find my biggest edge', 'Which sessions are most profitable?', 'What is hurting my win rate?', 'Show me my loss patterns'],
  psych:   ['Analyse my emotional patterns', 'When do I trade best?', 'What emotions cost me most?', 'Help me build better discipline'],
  plan:    ['Review my trading plan', 'How can I improve my models?', 'Suggest rule adjustments', 'Build a stronger playbook'],
  chart:   ['Analyse this chart', 'Is this a valid setup?', 'What bias does this suggest?', 'Rate this trade setup'],
};

const _AI_MODE_LABELS = {
  daily: 'Daily Brief', weekly: 'Weekly Review', monthly: 'Monthly Review',
  pattern: 'Pattern Analysis', psych: 'Psychology', plan: 'Trading Plan', chart: 'Chart Analysis',
};

/* ── Build the system prompt from live data ── */
function _aiSystemPrompt() {
  const totalTrades = trades.length;
  const wins  = trades.filter(t => t.outcome === 'Win').length;
  const losses = trades.filter(t => t.outcome === 'Loss').length;
  const wr    = totalTrades ? ((wins / totalTrades) * 100).toFixed(1) : 0;
  const netPnl = trades.reduce((a, t) => a + _pnlPctValue(t), 0).toFixed(1);

  // Trader's location/timezone label, driven by the Profile > Timezone setting
  // (falls back to Africa/Lagos / WAT if unset), so the coach's session times
  // always match what's shown in the topbar clock and Account tab.
  const _tz = getUserTz();
  const _tzCityLabel = getUserTzCityLabel().replace(/^\(UTC[^)]*\)\s*/, '') || 'Lagos';
  const _tzOffsetLabel = getUserTzOffsetLabel(_tz);
  // Fixed session windows (defined in UTC), converted to the trader's timezone
  // so "London Open", "Overlap", and "Asian" hours read correctly wherever they are.
  const _londonOpen   = `${formatUtcHourInUserTz(7, _tz)}–${formatUtcHourInUserTz(11, _tz)} ${_tzOffsetLabel}`;
  const _londonNYOverlap = `${formatUtcHourInUserTz(12, _tz)}–${formatUtcHourInUserTz(16, _tz)} ${_tzOffsetLabel}`;
  const _asianSession = `${formatUtcHourInUserTz(0, _tz)}–${formatUtcHourInUserTz(4, _tz)} ${_tzOffsetLabel}`;

  // Emotion breakdown
  const emotionMap = {};
  trades.forEach(t => { if(t.emotion) emotionMap[t.emotion] = (emotionMap[t.emotion]||0) + 1; });
  const emotionSummary = Object.entries(emotionMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([e,c])=>`${e}(${c})`).join(', ');

  // Strategy breakdown
  const stratMap = {};
  trades.forEach(t => { if(t.strategy) stratMap[t.strategy] = (stratMap[t.strategy]||0) + 1; });
  const stratSummary = Object.entries(stratMap).sort((a,b)=>b[1]-a[1]).map(([s,c])=>`${s}:${c}trades`).join(', ');

  // Session breakdown
  const kzMap = {};
  trades.forEach(t => { if(t.kz) kzMap[t.kz] = (kzMap[t.kz]||0) + 1; });

  // Recent 10 trades summary
  const recent = [...trades].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).map(t =>
    `${t.date} ${t.pair} ${t.pos} ${t.outcome} PnL:${_pnlLabel(t)} Emotion:${t.emotion||'?'} Model:${t.strategy||'?'} Notes:"${(t.notes||'').slice(0,80)}"`
  ).join('\n');

  // Today's and this week's trades
  const today = localToday();
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
  const todayTrades = trades.filter(t => t.date === today);
  const weekTrades  = trades.filter(t => t.date >= weekStart);
  const monthKey    = today.slice(0,7);
  const monthTrades = trades.filter(t => t.date.startsWith(monthKey));

  // Per-emotion PnL to spot psychology patterns
  const emotionPnl = {};
  trades.forEach(t => {
    if (!t.emotion) return;
    if (!emotionPnl[t.emotion]) emotionPnl[t.emotion] = { pnl: 0, n: 0, wins: 0 };
    emotionPnl[t.emotion].pnl  += _pnlPctValue(t);
    emotionPnl[t.emotion].n    += 1;
    if (t.outcome === 'Win') emotionPnl[t.emotion].wins += 1;
  });
  const emotionPnlSummary = Object.entries(emotionPnl).map(([e,d]) =>
    `${e}: ${d.n}trades wr=${((d.wins/d.n)*100).toFixed(0)}% avgPnl=${(d.pnl/d.n).toFixed(2)}%`
  ).join('; ');

  // Rating vs outcome
  const ratingMap = {};
  trades.forEach(t => {
    const r = t.rating || 5;
    if (!ratingMap[r]) ratingMap[r] = { n:0, wins:0 };
    ratingMap[r].n++; if(t.outcome==='Win') ratingMap[r].wins++;
  });
  const ratingSummary = Object.entries(ratingMap).sort((a,b)=>a[0]-b[0]).map(([r,d]) =>
    `${r}★: wr=${((d.wins/d.n)*100).toFixed(0)}% (${d.n}trades)`
  ).join(', ');

  return `You are the NxTGen AI Trading Coach — an elite, precision-focused coach for a professional forex and futures prop trader based in ${_tzCityLabel} (${_tzOffsetLabel} timezone).

TRADER PROFILE:
- Platform: NxTGen Trading Journal
- Style: ICT-based methodology (IRL>ERL, ERL>IRL, SMT divergence, CISD, NxtGen Modified model)
- Sessions: London Open (${_londonOpen}) PRIMARY, London/NY Overlap (${_londonNYOverlap}) PRIMARY, Asian (${_asianSession}) secondary
- Accounts: Paper + multiple GFT prop funded accounts (Phase 1 & 2 challenges)
- Risk: 0.5–1% per trade, max 2 trades/day, no trades below 3★ rating
- Rules include: HTF bias required, active killzone required, never trade red news ±15min

FULL TRADING DATA (${totalTrades} total trades):
- Overall: WR=${wr}% | Net PnL=+${netPnl}% | Wins=${wins} | Losses=${losses}
- Strategies: ${stratSummary}
- Sessions: ${JSON.stringify(kzMap)}
- Emotion frequency: ${emotionSummary}
- Emotion vs PnL: ${emotionPnlSummary}
- Rating vs WR: ${ratingSummary}
- Today's trades (${todayTrades.length}): ${todayTrades.map(t=>`${t.pair} ${t.outcome} ${_pnlLabel(t)}`).join(', ')||'none'}
- This week (${weekTrades.length} trades): WR=${weekTrades.length?((weekTrades.filter(t=>t.outcome==='Win').length/weekTrades.length)*100).toFixed(0):0}%
- This month (${monthTrades.length} trades): WR=${monthTrades.length?((monthTrades.filter(t=>t.outcome==='Win').length/monthTrades.length)*100).toFixed(0):0}%

RECENT 10 TRADES:
${recent}

TRADING MODELS:
${(_pbData?.models||MODELS).map(m=>`- ${m.title}: ${m.sub}`).join('\n')}

TRADING RULES (${(_pbData?.rules||RULES).length}):
${(_pbData?.rules||RULES).map((r,i)=>`${i+1}. ${r}`).join('\n')}

RESPONSE STYLE:
- Be direct, specific, and actionable. No generic advice.
- Reference actual trade data, dates, pairs, and patterns from the data above.
- Use NxTGen/ICT terminology naturally (IRL, ERL, OB, FVG, SMT, CISD, killzone, manipulation, etc.)
- Format with clear sections using **bold headers**, bullet points, and emoji where appropriate.
- Be a coach, not a cheerleader — call out weaknesses clearly but constructively.
- Keep responses concise but complete. Prioritize insight over length.
- When analysing psychology, be honest about emotional patterns in the data.`;
}

/* ── Build user prompt per mode ── */
function _aiUserPrompt(mode, customQuestion) {
  if (customQuestion) return customQuestion;
  const today     = localToday();
  const dayName   = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
  const monthKey  = today.slice(0,7);

  const todayTrades  = trades.filter(t => t.date === today);
  const weekTrades   = trades.filter(t => t.date >= weekStart);
  const monthTrades  = trades.filter(t => t.date.startsWith(monthKey));

  switch (mode) {
    case 'daily':
      return `Give me a complete daily trading brief for today, ${dayName} ${today}.
I have traded ${todayTrades.length} times today${todayTrades.length ? ': ' + todayTrades.map(t=>`${t.pair} ${t.outcome} ${_pnlLabel(t)}`).join(', ') : ''}.
Cover: (1) Assessment of today's session so far, (2) Psychological readiness check based on my emotion history, (3) Key reminders from my rules most relevant right now, (4) What I should focus on for the rest of today or tomorrow's session.`;

    case 'weekly':
      const weekWins = weekTrades.filter(t=>t.outcome==='Win').length;
      const weekPnl  = weekTrades.reduce((a,t)=>a+_pnlPctValue(t),0).toFixed(1);
      return `Give me a comprehensive weekly review.
This week so far: ${weekTrades.length} trades, ${weekWins} wins, WR=${weekTrades.length?((weekWins/weekTrades.length)*100).toFixed(0):0}%, Net PnL=${weekPnl>0?'+':''}${weekPnl}%
Trades this week: ${weekTrades.map(t=>`${t.date} ${t.pair} ${t.outcome} ${_pnlLabel(t)} emotion:${t.emotion}`).join(' | ')||'none'}
Cover: (1) Week performance grade and summary, (2) Best trade and why, (3) Worst trade and root cause, (4) Psychological patterns this week, (5) Rule violations if any, (6) What to focus on next week.`;

    case 'monthly':
      const mWins = monthTrades.filter(t=>t.outcome==='Win').length;
      const mPnl  = monthTrades.reduce((a,t)=>a+_pnlPctValue(t),0).toFixed(1);
      return `Give me a deep monthly review for ${monthKey}.
Month stats: ${monthTrades.length} trades, WR=${monthTrades.length?((mWins/monthTrades.length)*100).toFixed(0):0}%, Net PnL=${mPnl>0?'+':''}${mPnl}%
Full trade list: ${monthTrades.map(t=>`${t.date} ${t.pair} ${t.pos} ${t.outcome} PnL:${_pnlLabel(t)} strategy:${t.strategy} emotion:${t.emotion} notes:"${(t.notes||'').slice(0,60)}"`).join('\n')}
Cover: (1) Month grade and verdict, (2) Model performance breakdown, (3) Session breakdown, (4) Psychology and emotional analysis, (5) Loss audit — root causes, (6) Plan adjustments for next month, (7) Progress toward quarterly goals.`;

    case 'pattern':
      return `Perform a deep pattern analysis across ALL my ${trades.length} trades.
Find: (1) My strongest statistical edges (pair + session + strategy combinations with highest WR and PnL), (2) My worst performing patterns and what's common between them, (3) Optimal trade rating threshold — at what star rating does my performance drop sharply?, (4) Time-of-day/session patterns, (5) Streak patterns — when do I go on losing streaks and what precedes them?, (6) The 3 most actionable insights from the data.`;

    case 'psych':
      return `Give me a deep psychological analysis of my trading behaviour.
Using all ${trades.length} trades with emotion tags, analyse: (1) Which emotions correlate with wins vs losses, (2) My worst psychological state — when am I most likely to break rules?, (3) Pre-trade mental state patterns (use pretrade notes if available), (4) Revenge trading or FOMO signals in the data, (5) Specific psychological weaknesses I need to address, (6) A personalised mental framework and morning routine recommendation based on my actual patterns.`;

    case 'plan':
      return `Review and improve my trading plan based on all my actual performance data.
(1) Assess how well my current 3 models (IRL>ERL, ERL>IRL, NxtGen Modified) are performing — which is strongest?, (2) Rule violations visible in the data and suggested additions, (3) Risk management assessment — is my 0.5–1% risk appropriate for my win rate?, (4) Session allocation — should I trade Asian more or less based on data?, (5) Specific model adjustments or additions that the data supports, (6) A revised trading plan summary I can add to my playbook.`;

    case 'chart':
      return _aiChartImages.length
        ? `Analyse the ${_aiChartImages.length} chart image(s) I've uploaded. For each: (1) Identify the timeframe and instrument if visible, (2) Key levels — OB, FVG, liquidity pools, swing high/low, (3) Market structure bias — bullish or bearish, (4) Which of my models (IRL>ERL, ERL>IRL, NxtGen Modified, SMT+CISD) applies, (5) Entry trigger to watch for, (6) Suggested SL and TP zones, (7) Rating out of 5 stars for trade quality. Be specific about price levels if visible.`
        : 'Please upload one or more chart screenshots above, then press Analyse.';

    default:
      return 'Provide a comprehensive trading analysis based on my data.';
  }
}

/* ── Mode switch ── */
function aiSetMode(mode) {
  _aiMode = mode;
  document.querySelectorAll('.ai-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  // Update context panel
  _aiRenderContextPanel(mode);

  // Show/hide chart upload
  const chartWrap = document.getElementById('ai-chart-upload-wrap');
  if (chartWrap) chartWrap.style.display = mode === 'chart' ? '' : 'none';

  // Progressive enhancement: if the surrounding markup opts in with
  // <div id="ai-chart-dropzone"></div>, give it the full drag & drop
  // dropzone experience. The legacy click/drag zone (aiChartDrop etc.)
  // keeps working either way.
  if (mode === 'chart' && document.getElementById('ai-chart-dropzone')) {
    mountDropzone('ai-chart-dropzone', {
      multiple: true,
      showPreview: false,
      primaryText: 'Drag & drop chart screenshots here',
      secondaryText: 'or click to browse — you can select several at once',
      onFiles: files => _aiIngestChartFiles(files),
    });
  }

  // Update placeholder
  const inp = document.getElementById('ai-prompt-input');
  if (inp) inp.placeholder = mode === 'chart'
    ? 'Upload chart(s) above, then ask a specific question or press Analyse…'
    : 'Ask anything specific, or press Analyse for an automatic deep-dive…';

  // Rebuild chips
  _aiRenderChips(mode);

  // Update button label
  const lbl = document.getElementById('ai-btn-label');
  if (lbl) lbl.textContent = mode === 'chart' ? 'Read Chart' : 'Analyse';
}

function _aiRenderChips(mode) {
  const wrap = document.getElementById('ai-prompt-chips');
  if (!wrap) return;
  wrap.innerHTML = (_AI_CHIPS[mode] || []).map(q =>
    `<button class="ai-chip" onclick="aiChipClick(this)">${q}</button>`
  ).join('');
}

function aiChipClick(btn) {
  document.querySelectorAll('.ai-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ai-prompt-input').value = btn.textContent;
}

/* ── Chart upload handling ── */
async function aiHandleChartUpload(input) {
  await _aiIngestChartFiles(input.files);
  input.value = '';
}

const NX_AI_CHART_ACCEPT = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
const NX_AI_CHART_MAX_MB = 10;

async function _aiIngestChartFiles(fileList) {
  const all = Array.from(fileList || []);
  for (const file of all) {
    if (!file.type || !file.type.startsWith('image/') || !NX_AI_CHART_ACCEPT.includes(file.type)) {
      showToast(`"${file.name}" must be PNG, JPG, JPEG, WEBP or SVG.`, 'danger');
      continue;
    }
    if (file.size > NX_AI_CHART_MAX_MB * 1024 * 1024) {
      showToast(`"${file.name}" is ${nxFormatBytes(file.size)} — max is ${NX_AI_CHART_MAX_MB}MB.`, 'danger');
      continue;
    }
    if (file.type !== 'image/svg+xml') {
      const dims = await nxGetImageDimensions(file).catch(() => null);
      if (dims === null) {
        showToast(`"${file.name}" looks corrupted or couldn't be read.`, 'danger');
        continue;
      }
    }
    const dataUrl = await new Promise(resolve => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file);
    });
    const mimeType = file.type || 'image/jpeg';
    _aiChartImages.push({ dataUrl, mimeType, name: file.name, size: file.size });
  }
  _aiRenderChartThumbs();
}

// Drag-and-drop support for the Chart Read upload zone (was previously
// click-to-upload only — the zone had no ondragover/ondrop wired up).
// The .drag-over class is now styled with the same glow+scale language
// as the rest of the app's dropzones (see .ai-chart-upload-wrap.drag-over
// in styles.css) so this zone matches everywhere else visually.
let _aiChartDragDepth = 0;
function aiChartDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  // Idempotent — safe to call on every dragover tick even if ondragenter
  // isn't wired in the surrounding markup.
  e.currentTarget.classList.add('drag-over');
}
function aiChartDragEnter(e) {
  e.preventDefault();
  if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
  _aiChartDragDepth++;
  e.currentTarget.classList.add('drag-over');
}
function aiChartDragLeave(e) {
  _aiChartDragDepth = Math.max(0, _aiChartDragDepth - 1);
  e.currentTarget.classList.remove('drag-over');
}
function aiChartDrop(e) {
  e.preventDefault();
  _aiChartDragDepth = 0;
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer?.files;
  if (files && files.length) _aiIngestChartFiles(files);
}

// Paste-to-upload: click into the AI Chart Reader panel, then Ctrl/Cmd+V
// a copied screenshot to add it straight to the chart queue.
function aiChartPaste(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const imgFiles = Array.from(items)
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile());
  if (imgFiles.length) { e.preventDefault(); _aiIngestChartFiles(imgFiles); }
}
if (typeof document !== 'undefined') {
  document.addEventListener('paste', (e) => {
    const wrap = document.getElementById('ai-chart-upload-wrap');
    if (wrap && wrap.offsetParent !== null && _aiMode === 'chart') aiChartPaste(e);
  });
}

function _aiRenderChartThumbs() {
  const wrap = document.getElementById('ai-chart-thumbs');
  if (!wrap) return;
  wrap.innerHTML = _aiChartImages.map((img, i) => `
    <div class="ai-chart-thumb">
      <img src="${img.dataUrl}" alt="${img.name}">
      <button class="ai-chart-thumb-del" onclick="aiRemoveChart(${i})" aria-label="Remove ${img.name}"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      <div class="ai-chart-thumb-name">${img.name.replace(/\.[^.]+$/,'').slice(0,18)}${img.size ? ` · ${nxFormatBytes(img.size)}` : ''}</div>
    </div>`).join('');
}

function aiRemoveChart(i) {
  _aiChartImages.splice(i, 1);
  _aiRenderChartThumbs();
}

/* ── Main run ── */
async function aiRun() {
  if (_aiStreaming) return;
  const customQ = document.getElementById('ai-prompt-input')?.value?.trim() || '';

  if (_aiMode === 'chart' && !_aiChartImages.length && !customQ) {
    showToast('Upload at least one chart screenshot first', 'danger'); return;
  }

  _aiStreaming = true;
  const btn  = document.getElementById('ai-analyse-btn');
  const lbl  = document.getElementById('ai-btn-label');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  if (lbl) lbl.textContent = 'Thinking…';

  // Show response area
  const responseWrap = document.getElementById('ai-response-wrap');
  const responseBody = document.getElementById('ai-response-body');
  const modeLabel    = document.getElementById('ai-response-mode-label');
  const metaEl       = document.getElementById('ai-response-meta');
  if (responseWrap) responseWrap.style.display = '';
  if (modeLabel)    modeLabel.textContent = _AI_MODE_LABELS[_aiMode];
  if (metaEl)       metaEl.textContent = formatUserDateTime(new Date(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' ' + getUserTzOffsetLabel();
  if (responseBody) { responseBody.innerHTML = '<div class="ai-thinking"><span></span><span></span><span></span></div>'; }

  const userPrompt = _aiUserPrompt(_aiMode, customQ);

  // Build messages — include chart images if in chart mode
  let userContent;
  if (_aiMode === 'chart' && _aiChartImages.length) {
    userContent = [
      ..._aiChartImages.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.dataUrl.split(',')[1] }
      })),
      { type: 'text', text: userPrompt }
    ];
  } else {
    userContent = userPrompt;
  }

  // Add to history for multi-turn
  _aiHistory.push({ role: 'user', content: userContent });

  try {
    // Route through Supabase Edge Function to avoid CORS + keep API key server-side
    const { data: { session } } = await sb.auth.getSession();
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/ai-coach`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON}`,
        },
        body: JSON.stringify({
          system:   _aiSystemPrompt(),
          messages: _aiHistory,
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    // Add assistant reply to history
    _aiHistory.push({ role: 'assistant', content: text });

    // Render with markdown-like formatting
    if (responseBody) responseBody.innerHTML = _aiFormatResponse(text);

    // Show history if multi-turn
    if (_aiHistory.length > 2) _aiRenderHistory();

    // Clear prompt input after use
    const inp = document.getElementById('ai-prompt-input');
    if (inp) inp.value = '';
    document.querySelectorAll('.ai-chip').forEach(c => c.classList.remove('active'));

  } catch (err) {
    const msg = err.message || 'Unknown error';
    const isAuth = msg.includes('401') || msg.includes('403');
    const isSetup = msg.includes('404') || msg.includes('relay');
    if (responseBody) responseBody.innerHTML = `
      <div class="ai-error">
        <strong><svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg> ${isSetup ? 'Edge Function not deployed yet' : isAuth ? 'Auth error' : 'Error'}</strong><br>
        ${isSetup
          ? 'The AI proxy function needs to be deployed to Supabase once. See the setup instructions in your journal.'
          : msg}
      </div>`;
    _aiHistory.pop();
  }

  _aiStreaming = false;
  if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  if (lbl) lbl.textContent = _aiMode === 'chart' ? 'Read Chart' : 'Analyse';

  // Scroll to response
  responseWrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Format response text → HTML ── */
function _aiFormatResponse(text) {
  return text
    // Strip fenced code block markers (```lang / ```) - content inside is
    // still run through the normal list/header rules below
    .replace(/^```[a-zA-Z]*\s*$/gm, '')
    // Bold headers: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text*
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Section headers: lines starting with #, ##, ###, ####, etc.
    .replace(/^#{1,6}\s+(.+)$/gm, '<div class="ai-section-head">$1</div>')
    // Numbered lists
    .replace(/^(\d+)\.\s+(.+)$/gm, '<div class="ai-list-item numbered"><span class="ai-list-num">$1</span><span>$2</span></div>')
    // Bullet points
    .replace(/^[-•]\s+(.+)$/gm, '<div class="ai-list-item"><span class="ai-bullet">▸</span><span>$1</span></div>')
    // Emoji lines that look like headers (start with emoji)
    .replace(/^([\u{1F300}-\u{1FAFF}📊📅🧠🗺🔬💡⚠✦])\s+(.+)$/gmu, '<div class="ai-emoji-head"><span>$1</span><span>$2</span></div>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="ai-hr">')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="ai-p">')
    .replace(/\n/g, '<br>')
    // Wrap in paragraph
    .replace(/^/, '<p class="ai-p">')
    .replace(/$/, '</p>');
}

/* ── Conversation history ── */
function _aiRenderHistory() {
  const wrap   = document.getElementById('ai-history-wrap');
  const histEl = document.getElementById('ai-history');
  if (!wrap || !histEl) return;
  wrap.style.display = '';

  // Show only user turns (skip latest — already shown in main response)
  const turns = _aiHistory.slice(0, -2); // exclude last user+assistant pair
  if (!turns.length) { wrap.style.display = 'none'; return; }

  histEl.innerHTML = turns.map((m, i) => {
    const isUser = m.role === 'user';
    const content = typeof m.content === 'string' ? m.content
      : (m.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return `<div class="ai-history-turn ${isUser ? 'user' : 'assistant'}">
      <div class="ai-history-role">${isUser ? '<svg class="icn" aria-hidden="true"><use href="#ic-user"></use></svg> You' : '<svg class="icn" aria-hidden="true"><use href="#ic-robot"></use></svg> AI Coach'}</div>
      <div class="ai-history-content">${isUser ? content.slice(0,200) + (content.length>200?'…':'') : _aiFormatResponse(content)}</div>
    </div>`;
  }).reverse().join('');
}

/* ── Utilities ── */
function aiCopyResponse() {
  const body = document.getElementById('ai-response-body');
  if (!body) return;
  navigator.clipboard.writeText(body.innerText).then(() => showToast('Copied ✓', 'restore'));
}

function aiClear() {
  _aiHistory = [];
  const responseWrap = document.getElementById('ai-response-wrap');
  const historyWrap  = document.getElementById('ai-history-wrap');
  if (responseWrap) responseWrap.style.display = 'none';
  if (historyWrap)  historyWrap.style.display = 'none';
  const inp = document.getElementById('ai-prompt-input');
  if (inp) inp.value = '';
}

/* ── Init AI page on nav ── */
function buildAI() {
  // If the chat widget is floating, pull it back into the page and close the float
  if (typeof closeFloatingChat === 'function') closeFloatingChat();
  _aiRenderContextPanel('daily');
  aiSetMode('daily');
  // Init chat on first load
  if (!_chatInitialised) { chatInit(); _chatInitialised = true; }
}

function aiPageTab(tab) {
  const coachPanel = document.getElementById('ai-coach-panel');
  const chatPanel  = document.getElementById('ai-chat-panel');
  const tabCoach   = document.getElementById('ai-tab-coach');
  const tabChat    = document.getElementById('ai-tab-chat');
  const pageAi     = document.getElementById('page-ai');
  if (!coachPanel || !chatPanel) return;
  // Reclaim the chat UI in case it's currently living in the floating chat widget
  if (typeof closeFloatingChat === 'function') closeFloatingChat();
  if (tab === 'chat') {
    coachPanel.style.display = 'none';
    chatPanel.style.display  = '';
    tabCoach.classList.remove('active');
    tabChat.classList.add('active');
    pageAi?.classList.add('ai-chat-active');
    // Focus input
    setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
    // Clear unread badge
    const badge = document.getElementById('ai-chat-badge');
    if (badge) badge.style.display = 'none';
  } else {
    coachPanel.style.display = '';
    chatPanel.style.display  = 'none';
    tabCoach.classList.add('active');
    tabChat.classList.remove('active');
    pageAi?.classList.remove('ai-chat-active');
  }
}

function _aiRenderContextPanel(mode) {
  const panel = document.getElementById('ai-context-panel');
  if (!panel) return;

  const today     = localToday();
  const dayName   = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
  const monthKey  = today.slice(0,7);
  const curQ      = getQuarter(today);
  const curQKey   = `${today.slice(0,4)}-Q${curQ}`;

  const total      = trades.length;
  const wins       = trades.filter(t => t.outcome === 'Win').length;
  const wr         = total ? ((wins / total) * 100).toFixed(1) : 0;
  const netPnl     = trades.reduce((a, t) => a + _pnlPctValue(t), 0).toFixed(1);
  const todayTrades = trades.filter(t => t.date === today);
  const weekTrades  = trades.filter(t => t.date >= weekStart);
  const monthTrades = trades.filter(t => t.date.startsWith(monthKey));
  const qTrades     = trades.filter(t => {
    const tq = getQuarter(t.date); const ty = t.date.slice(0,4);
    return `${ty}-Q${tq}` === curQKey;
  });

  const weekWins  = weekTrades.filter(t => t.outcome === 'Win').length;
  const monthWins = monthTrades.filter(t => t.outcome === 'Win').length;
  const qWins     = qTrades.filter(t => t.outcome === 'Win').length;
  const weekPnl   = weekTrades.reduce((a, t) => a + _pnlPctValue(t), 0);
  const monthPnl  = monthTrades.reduce((a, t) => a + _pnlPctValue(t), 0);
  const qPnl      = qTrades.reduce((a, t) => a + _pnlPctValue(t), 0).toFixed(1);

  // Last emotion
  const lastEmotion = [...trades].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,1)[0]?.emotion || '—';
  const emotionColor = ['Calm','Confident','Relaxed','Focused'].includes(lastEmotion) ? 'green'
    : ['Anxious','Fearful','Greedy','Revenge','Impatient'].includes(lastEmotion) ? 'red' : 'blue';

  const stat = (label, val, cls='') =>
    `<span class="ai-context-stat ${cls}">${label}: <strong>${val}</strong></span>`;

  const contexts = {
    daily: `
      <strong style="color:var(--text);font-size:12px">${dayName}, ${today}</strong><br>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${stat('Today', todayTrades.length + ' trades', todayTrades.length > 0 ? 'blue' : '')}
        ${stat('Week WR', weekTrades.length ? ((weekWins/weekTrades.length)*100).toFixed(0)+'%' : '—', weekTrades.length && weekWins/weekTrades.length >= 0.6 ? 'green' : 'red')}
        ${stat('Week trades', weekTrades.length, 'blue')}
        ${stat('Last emotion', lastEmotion, emotionColor)}
        ${stat('All-time WR', wr + '%', parseFloat(wr) >= 65 ? 'green' : 'red')}
      </div>`,

    weekly: `
      <strong style="color:var(--text);font-size:12px">Week of ${weekStart}</strong><br>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${stat('Trades', weekTrades.length, 'blue')}
        ${stat('WR', weekTrades.length ? ((weekWins/weekTrades.length)*100).toFixed(0)+'%' : '—', weekTrades.length && weekWins/weekTrades.length >= 0.6 ? 'green' : 'red')}
        ${stat('Net PnL', weekTrades.length ? (weekPnl>=0?'+':'')+weekPnl.toFixed(1)+'%' : '—', weekPnl >= 0 ? 'green' : 'red')}
        ${stat('Losses', weekTrades.filter(t=>t.outcome==='Loss').length)}
      </div>`,

    monthly: `
      <strong style="color:var(--text);font-size:12px">${monthKey}</strong><br>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${stat('Trades', monthTrades.length, 'blue')}
        ${stat('WR', monthTrades.length ? ((monthWins/monthTrades.length)*100).toFixed(0)+'%' : '—', monthTrades.length && monthWins/monthTrades.length >= 0.6 ? 'green' : 'red')}
        ${stat('PnL', monthTrades.length ? (monthPnl>=0?'+':'')+monthPnl.toFixed(1)+'%' : '—', monthPnl >= 0 ? 'green' : 'red')}
        ${stat('Q' + curQ + ' trades', qTrades.length, 'purple')}
        ${stat('Q' + curQ + ' PnL', (parseFloat(qPnl)>=0?'+':'')+qPnl+'%', parseFloat(qPnl)>=0?'green':'red')}
      </div>`,

    pattern: `
      <strong style="color:var(--text);font-size:12px">Pattern Analysis — ${total} total trades</strong><br>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${stat('Overall WR', wr + '%', parseFloat(wr) >= 65 ? 'green' : 'red')}
        ${stat('Net PnL', (parseFloat(netPnl)>=0?'+':'')+netPnl+'%', parseFloat(netPnl)>=0?'green':'red')}
        ${stat('Wins', wins, 'green')}
        ${stat('Losses', trades.filter(t=>t.outcome==='Loss').length, 'red')}
        ${stat('B.E', trades.filter(t=>t.outcome==='B.E').length)}
      </div>`,

    psych: (() => {
      const emotionMap = {};
      trades.forEach(t => { if(t.emotion) emotionMap[t.emotion] = (emotionMap[t.emotion]||0)+1; });
      const topEmotion = Object.entries(emotionMap).sort((a,b)=>b[1]-a[1])[0];
      const negCount = trades.filter(t => ['Anxious','Fearful','Greedy','Revenge','Impatient'].includes(t.emotion)).length;
      const negPnl = trades.filter(t => ['Anxious','Fearful','Greedy','Revenge','Impatient'].includes(t.emotion)).reduce((a,t)=>a+_pnlPctValue(t),0).toFixed(1);
      return `
        <strong style="color:var(--text);font-size:12px">Psychology Snapshot</strong><br>
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
          ${stat('Top emotion', topEmotion ? topEmotion[0] : '—', 'blue')}
          ${stat('Negative-state trades', negCount, negCount > 5 ? 'red' : '')}
          ${stat('Neg-state PnL', (parseFloat(negPnl)>=0?'+':'')+negPnl+'%', parseFloat(negPnl)>=0?'green':'red')}
          ${stat('Last emotion', lastEmotion, emotionColor)}
        </div>`;
    })(),

    plan: `
      <strong style="color:var(--text);font-size:12px">Trading Plan Review</strong><br>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        ${stat('Models', (_pbData?.models||MODELS).length, 'purple')}
        ${stat('Rules', (_pbData?.rules||RULES).length, 'blue')}
        ${stat('Overall WR', wr + '%', parseFloat(wr) >= 65 ? 'green' : 'red')}
        ${stat('All-time PnL', (parseFloat(netPnl)>=0?'+':'')+netPnl+'%', parseFloat(netPnl)>=0?'green':'red')}
      </div>`,

    chart: `
      <strong style="color:var(--text);font-size:12px">Chart Analysis Mode</strong><br>
      <div style="margin-top:8px;color:var(--text2);font-size:12px">
        Upload one or more chart screenshots below. The AI will identify levels, structure, applicable models (IRL&gt;ERL, ERL&gt;IRL, NxtGen Modified, SMT+CISD), entry triggers, and rate the setup quality.
      </div>`,
  };

  panel.innerHTML = contexts[mode] || '';
}

// Patch aiSetMode to also update context panel
const _origAiSetMode = aiSetMode;


// ═══════════════════════════════════════════════════════════════════
//  NXTGEN AI CHATBOT ENGINE
//  Full persistent chat with: streaming bubbles, image upload,
//  slash commands, conversation memory, drag-drop, auto-resize,
//  export, and all AI Coach modes as commands.
// ═══════════════════════════════════════════════════════════════════

let _chatInitialised = false;
let _chatHistory     = [];   // { role, content, ts, images? }
let _chatImages      = [];   // pending images for next message { dataUrl, mimeType, name }
let _chatStreaming    = false;
let _chatMsgCount    = 0;

const _CHAT_COMMANDS = [
  { cmd: '/daily',    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-calendar"></use></svg>', label: 'Daily Brief',       desc: 'Get your daily trading brief' },
  { cmd: '/weekly',   icon: '<svg class="icn" aria-hidden="true"><use href="#ic-chart-bar"></use></svg>', label: 'Weekly Review',     desc: 'Full week performance review' },
  { cmd: '/monthly',  icon: '<svg class="icn" aria-hidden="true"><use href="#ic-calendar"></use></svg>', label: 'Monthly Review',    desc: 'Deep monthly analysis' },
  { cmd: '/pattern',  icon: '<svg class="icn" aria-hidden="true"><use href="#ic-flask"></use></svg>', label: 'Pattern Analysis',  desc: 'Find your statistical edges' },
  { cmd: '/psych',    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-brain"></use></svg>', label: 'Psychology',        desc: 'Emotional pattern analysis' },
  { cmd: '/plan',     icon: '<svg class="icn" aria-hidden="true"><use href="#ic-map"></use></svg>', label: 'Trading Plan',      desc: 'Review & improve your plan' },
  { cmd: '/chart',    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-camera"></use></svg>', label: 'Chart Read',        desc: 'Analyse uploaded charts' },
  { cmd: '/stats',    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trend-up"></use></svg>', label: 'Quick Stats',       desc: 'Your key trading numbers' },
  { cmd: '/clear',    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>', label: 'Clear Chat',        desc: 'Start a fresh conversation' },
  { cmd: '/export',   icon: '<svg class="icn" aria-hidden="true"><use href="#ic-download"></use></svg>', label: 'Export Chat',       desc: 'Download conversation as text' },
];

const _CHAT_WELCOME = `Hey! I'm your NxTGen AI Coach — I have full access to your trade journal, performance data, and trading models.

Here's what I can do:
• **Analyse your charts** — just attach an image
• **Review your trades** — ask about any pair, session, or timeframe  
• **Psychology coaching** — I track your emotional patterns
• **Answer anything** — about trading, strategy, setups, or your data

Type **/** to see all commands, or just ask me anything.`;

function chatInit() {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;

  // Restore from sessionStorage
  const saved = sessionStorage.getItem('nxtgen_chat');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      _chatHistory = parsed.history || [];
      _chatMsgCount = parsed.count || 0;
      _chatRebuildFromHistory();
      return;
    } catch (_) {}
  }

  // Welcome message
  _chatAddBubble('assistant', _CHAT_WELCOME, Date.now(), true);

  // Quick-start chips
  _chatAddQuickChips();

  // Setup drag-drop on chat container
  _chatSetupDragDrop();
}

function _chatSetupDragDrop() {
  const wrap = document.getElementById('ai-chat-panel');
  if (!wrap) return;
  wrap.addEventListener('dragover', e => { e.preventDefault(); document.getElementById('chat-drop-overlay')?.style.setProperty('display','flex'); });
  wrap.addEventListener('dragleave', e => { if (!wrap.contains(e.relatedTarget)) document.getElementById('chat-drop-overlay')?.style.setProperty('display','none'); });
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    document.getElementById('chat-drop-overlay').style.display = 'none';
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) _chatLoadImageFiles(files);
  });
}

function _chatRebuildFromHistory() {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  msgs.innerHTML = '';
  _chatHistory.forEach(m => {
    _chatAddBubble(m.role, m.content, m.ts, false, m.images);
  });
  _chatScrollBottom();
  _chatAddQuickChips();
  _chatSetupDragDrop();
}

function _chatAddQuickChips() {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const existing = document.getElementById('chat-quick-chips');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'chat-quick-chips';
  div.className = 'chat-quick-chips';
  div.innerHTML = [
    'Give me a daily brief', 'Analyse my psychology', 'What\'s my strongest edge?',
    'Review this week', 'How is my risk management?'
  ].map(q => `<button class="chat-quick-chip" onclick="chatQuickSend(this,'${q.replace(/'/g,"\\'")}')">${q}</button>`).join('');
  msgs.appendChild(div);
}

function chatQuickSend(btn, text) {
  const existing = document.getElementById('chat-quick-chips');
  if (existing) existing.remove();
  const inp = document.getElementById('chat-input');
  if (inp) {
    inp.value = text;
    inp.focus();
    // Trigger auto-resize since we're setting the value programmatically
    if (typeof chatInputChange === 'function') chatInputChange(inp);
  }
}

/* ── Input auto-resize & slash command palette ── */
function chatInputChange(ta) {
  // Auto-resize
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';

  // Slash command palette
  const val = ta.value;
  const palette = document.getElementById('chat-cmd-palette');
  if (!palette) return;
  if (val.startsWith('/') && !val.includes(' ')) {
    const search = val.slice(1).toLowerCase();
    const matches = _CHAT_COMMANDS.filter(c => c.cmd.slice(1).startsWith(search));
    if (matches.length) {
      palette.style.display = '';
      palette.innerHTML = matches.map(c => `
        <div class="chat-cmd-item" onclick="chatCmdSelect('${c.cmd}')">
          <span class="chat-cmd-icon">${c.icon}</span>
          <span class="chat-cmd-name">${c.cmd}</span>
          <span class="chat-cmd-desc">${c.desc}</span>
        </div>`).join('');
      return;
    }
  }
  palette.style.display = 'none';
}

function chatCmdSelect(cmd) {
  const inp = document.getElementById('chat-input');
  if (inp) { inp.value = cmd + ' '; inp.focus(); }
  const palette = document.getElementById('chat-cmd-palette');
  if (palette) palette.style.display = 'none';
}

function chatKeyDown(e) {
  // Send on Enter (not shift+Enter)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    // If palette open, select first
    const palette = document.getElementById('chat-cmd-palette');
    if (palette && palette.style.display !== 'none') {
      const first = palette.querySelector('.chat-cmd-item');
      if (first) { first.click(); return; }
    }
    chatSend();
    return;
  }
  // Escape closes palette
  if (e.key === 'Escape') {
    const palette = document.getElementById('chat-cmd-palette');
    if (palette) palette.style.display = 'none';
  }
}

/* ── File handling ── */
function chatHandleFiles(input) {
  const files = Array.from(input.files).filter(f => f.type.startsWith('image/'));
  if (files.length) _chatLoadImageFiles(files);
  input.value = '';
}

async function _chatLoadImageFiles(files) {
  for (const file of files) {
    const dataUrl = await new Promise(res => {
      const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file);
    });
    _chatImages.push({ dataUrl, mimeType: file.type || 'image/jpeg', name: file.name });
  }
  _chatRenderImagePreview();
  // Auto-focus input
  document.getElementById('chat-input')?.focus();
}

function _chatRenderImagePreview() {
  const wrap = document.getElementById('chat-image-preview');
  if (!wrap) return;
  if (!_chatImages.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  wrap.innerHTML = _chatImages.map((img, i) => `
    <div class="chat-img-thumb">
      <img src="${img.dataUrl}" alt="chart">
      <button class="chat-img-del" onclick="chatRemoveImage(${i})"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>`).join('');
}

function chatRemoveImage(i) {
  _chatImages.splice(i, 1);
  _chatRenderImagePreview();
}

/* ── Main send ── */
async function chatSend() {
  if (_chatStreaming) return;
  const inp  = document.getElementById('chat-input');
  const text = inp?.value?.trim() || '';
  const imgs = [..._chatImages];

  if (!text && !imgs.length) return;

  // Handle built-in commands
  if (text === '/clear') { chatClearHistory(); inp.value = ''; return; }
  if (text === '/export') { chatExport(); inp.value = ''; return; }

  // Map slash commands to AI mode prompts
  const cmdMap = {
    '/daily': 'daily', '/weekly': 'weekly', '/monthly': 'monthly',
    '/pattern': 'pattern', '/psych': 'psych', '/plan': 'plan', '/chart': 'chart',
  };
  let effectiveText = text;
  let modeOverride  = null;
  for (const [cmd, mode] of Object.entries(cmdMap)) {
    if (text.startsWith(cmd)) {
      modeOverride  = mode;
      effectiveText = text.slice(cmd.length).trim() || null;
      break;
    }
  }

  // Clear input immediately
  inp.value = '';
  inp.style.height = 'auto';
  _chatImages = [];
  _chatRenderImagePreview();
  const palette = document.getElementById('chat-cmd-palette');
  if (palette) palette.style.display = 'none';
  const chips = document.getElementById('chat-quick-chips');
  if (chips) chips.remove();

  // Show user bubble
  const userText = modeOverride && !effectiveText
    ? _CHAT_COMMANDS.find(c => c.cmd === Object.keys(cmdMap).find(k => cmdMap[k] === modeOverride))?.label || text
    : (effectiveText || text);

  _chatAddBubble('user', userText, Date.now(), false, imgs.length ? imgs : null);
  _chatHistory.push({ role: 'user', content: userText, ts: Date.now(), images: imgs.length ? imgs : null });

  // Typing indicator
  const typingId = _chatAddTypingIndicator();
  _chatStreaming = true;
  _chatUpdateSendBtn(true);
  _chatScrollBottom();

  // Build API messages
  const apiMessages = _chatBuildApiMessages(modeOverride, effectiveText, imgs);

  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-coach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON}`,
      },
      body: JSON.stringify({
        system:   _aiSystemPrompt(),
        messages: apiMessages,
      }),
    });

    _chatRemoveTyping(typingId);

    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    _chatAddBubble('assistant', reply, Date.now(), true);
    _chatHistory.push({ role: 'assistant', content: reply, ts: Date.now() });
    _chatSaveSession();

  } catch (err) {
    _chatRemoveTyping(typingId);
    _chatAddBubble('error', `<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg> ${err.message || 'Connection error'}. Check your Edge Function is deployed.`, Date.now());
  }

  _chatStreaming = false;
  _chatUpdateSendBtn(false);
  _chatAddQuickChips();
  _chatScrollBottom();
  inp.focus();
}

/* Build API message array from chat history + pending images */
function _chatBuildApiMessages(modeOverride, customText, imgs) {
  // Keep last 10 turns for context (to stay within token limits)
  const historyTurns = _chatHistory.slice(-10).map(m => {
    if (m.images && m.images.length) {
      return {
        role: m.role,
        content: [
          ...m.images.map(img => ({
            type: 'image',
            source: { type: 'base64', media_type: img.mimeType, data: img.dataUrl.split(',')[1] }
          })),
          { type: 'text', text: m.content || '' }
        ]
      };
    }
    return { role: m.role, content: m.content };
  });

  // Build the current user message
  let userPrompt = modeOverride
    ? _aiUserPrompt(modeOverride, customText)
    : (customText || 'Help me with my trading.');

  let userContent;
  if (imgs.length) {
    userContent = [
      ...imgs.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.dataUrl.split(',')[1] }
      })),
      { type: 'text', text: userPrompt }
    ];
  } else {
    userContent = userPrompt;
  }

  return [...historyTurns, { role: 'user', content: userContent }];
}

/* ── Bubble rendering ── */
function _chatAddBubble(role, content, ts, animate, images) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;

  const id     = `chat-msg-${++_chatMsgCount}`;
  const isUser = role === 'user';
  const isErr  = role === 'error';
  const time   = formatUserTime(new Date(ts));
  const tzLabel = getUserTzOffsetLabel();

  const imgHtml = images ? images.map(img =>
    `<div class="chat-bubble-img-wrap">
      <img class="chat-bubble-img" src="${img.dataUrl}" alt="chart"
           onclick="_chatLightbox('${img.dataUrl}')">
    </div>`).join('') : '';

  const contentHtml = isUser
    ? `<span>${_chatEscapeHtml(content)}</span>`
    : (isErr
      ? `<span class="chat-err-text">${content}</span>`
      : _aiFormatResponse(content));

  const bubble = document.createElement('div');
  bubble.className = `chat-msg-row ${isUser ? 'user' : 'assistant'}${animate ? ' animate-in' : ''}`;
  bubble.id = id;
  bubble.innerHTML = `
    ${!isUser ? `<div class="chat-avatar-sm"><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg></div>` : ''}
    <div class="chat-bubble ${isUser ? 'user' : isErr ? 'error' : 'assistant'}">
      ${imgHtml}
      <div class="chat-bubble-content">${contentHtml}</div>
      <div class="chat-bubble-meta">
        <span class="chat-bubble-time">${time} ${tzLabel}</span>
        ${!isUser && !isErr ? `<button class="chat-bubble-copy" onclick="_chatCopyBubble('${id}')" title="Copy">⎘</button>` : ''}
      </div>
    </div>
    ${isUser ? `<div class="chat-avatar-sm user"><svg class="icn" aria-hidden="true"><use href="#ic-user"></use></svg></div>` : ''}
  `;

  // Insert before quick-chips if they exist
  const chips = document.getElementById('chat-quick-chips');
  if (chips) msgs.insertBefore(bubble, chips);
  else msgs.appendChild(bubble);

  if (animate) {
    requestAnimationFrame(() => bubble.classList.add('visible'));
  }
  return id;
}

function _chatAddTypingIndicator() {
  const id = `chat-typing-${Date.now()}`;
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return id;
  const div = document.createElement('div');
  div.className = 'chat-msg-row assistant';
  div.id = id;
  div.innerHTML = `
    <div class="chat-avatar-sm"><svg class="icn" aria-hidden="true"><use href="#ic-sparkle"></use></svg></div>
    <div class="chat-bubble assistant typing">
      <div class="chat-typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  const chips = document.getElementById('chat-quick-chips');
  if (chips) msgs.insertBefore(div, chips);
  else msgs.appendChild(div);
  _chatScrollBottom();
  return id;
}

function _chatRemoveTyping(id) {
  document.getElementById(id)?.remove();
}

function _chatScrollBottom() {
  const msgs = document.getElementById('chat-messages');
  if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 60);
}

function _chatUpdateSendBtn(loading) {
  const btn = document.getElementById('chat-send-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}

function _chatCopyBubble(id) {
  const bubble = document.getElementById(id);
  if (!bubble) return;
  const content = bubble.querySelector('.chat-bubble-content');
  if (content) navigator.clipboard.writeText(content.innerText).then(() => showToast('Copied ✓', 'restore'));
}

function _chatEscapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Lightbox ── */
function _chatLightbox(src) {
  let lb = document.getElementById('chat-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'chat-lightbox';
    lb.className = 'wl-lightbox';
    lb.innerHTML = `<button class="wl-lightbox-close" onclick="document.getElementById('chat-lightbox').classList.remove('open')"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button><img id="chat-lb-img" src="" alt="chart">`;
    lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('open'); });
    document.body.appendChild(lb);
  }
  document.getElementById('chat-lb-img').src = src;
  lb.classList.add('open');
}

/* ── Utils ── */
function chatClearHistory() {
  if (_chatHistory.length && !confirm('Clear all chat history?')) return;
  _chatHistory = [];
  _chatMsgCount = 0;
  sessionStorage.removeItem('nxtgen_chat');
  const msgs = document.getElementById('chat-messages');
  if (msgs) msgs.innerHTML = '';
  _chatAddBubble('assistant', _CHAT_WELCOME, Date.now(), true);
  _chatAddQuickChips();
}

function chatExport() {
  if (!_chatHistory.length) { showToast('No chat to export', 'danger'); return; }
  const lines = _chatHistory.map(m => {
    const role = m.role === 'user' ? 'You' : 'AI Coach';
    const time = formatUserDateTime(new Date(m.ts));
    return `[${time} ${getUserTzOffsetLabel()}] ${role}:\n${m.content}\n`;
  });
  const blob = new Blob([lines.join('\n---\n\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nxtgen-chat-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
}

function _chatSaveSession() {
  try {
    // Save text-only history (skip large image data to stay under storage limit)
    const lightweight = _chatHistory.map(m => ({
      role: m.role, content: m.content, ts: m.ts
    }));
    sessionStorage.setItem('nxtgen_chat', JSON.stringify({ history: lightweight, count: _chatMsgCount }));
  } catch (_) {}
}

/* ── Stats command ── */
function _chatHandleStats() {
  const total = trades.length;
  const wins  = trades.filter(t => t.outcome === 'Win').length;
  const wr    = total ? ((wins / total) * 100).toFixed(1) : 0;
  const pnl   = trades.reduce((a, t) => a + _pnlPctValue(t), 0).toFixed(1);
  const today = localToday();
  const todayT = trades.filter(t => t.date === today);
  return `**Quick Stats — ${today}**\n\n` +
    `• Total trades: ${total}\n` +
    `• Win rate: ${wr}%\n` +
    `• Net PnL: ${pnl >= 0 ? '+' : ''}${pnl}%\n` +
    `• Today: ${todayT.length} trade${todayT.length !== 1 ? 's' : ''}\n` +
    `• Wins: ${wins} | Losses: ${trades.filter(t => t.outcome === 'Loss').length}`;
}

// ═══════════════════════════════════════════════════════════════════
//  CHART SLOT DRAG-AND-DROP / TOUCH REORDER ENGINE
//  Works on desktop (HTML5 DnD) and mobile (Touch Events)
//  Reorders both s.charts (images) and chartLabels simultaneously
// ═══════════════════════════════════════════════════════════════════

let _csDragSrcIdx  = null;   // index of item being dragged
let _csDragTradeId = null;   // trade id context

// ── Desktop HTML5 Drag ──────────────────────────────────────────

function cssDragStart(e, tradeId) {
  const item = e.currentTarget;
  _csDragSrcIdx  = parseInt(item.dataset.index);
  _csDragTradeId = tradeId;
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _csDragSrcIdx);
  // Custom drag image: slightly transparent clone
  e.dataTransfer.setDragImage(item, item.offsetWidth / 2, item.offsetHeight / 2);
}

function cssDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer.types.includes('Files')) { e.dataTransfer.dropEffect = 'copy'; return false; }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function cssDragEnter(e) {
  const item = e.currentTarget;
  if (e.dataTransfer.types.includes('Files')) {
    item.classList.add('nx-drag-over');
    return;
  }
  if (parseInt(item.dataset.index) !== _csDragSrcIdx) {
    item.classList.add('drag-over');
  }
}

function cssDragLeave(e) {
  e.currentTarget.classList.remove('drag-over', 'nx-drag-over');
}

function cssDrop(e, tradeId) {
  e.preventDefault();
  e.stopPropagation();
  const item = e.currentTarget;
  item.classList.remove('drag-over', 'nx-drag-over');

  // An image dragged in from the OS/desktop — upload it into this slot
  // instead of running the internal slot-reorder logic.
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    const slot = parseInt(item.dataset.index);
    _handleChartSlotFile(tradeId, slot, e.dataTransfer.files[0]);
    return false;
  }

  const destIdx = parseInt(item.dataset.index);
  if (destIdx !== _csDragSrcIdx) {
    _csSwap(tradeId, _csDragSrcIdx, destIdx);
  }
  return false;
}

function cssDragEnd(e) {
  // Clean up all drag classes
  document.querySelectorAll('.chart-sort-item').forEach(el => {
    el.classList.remove('dragging', 'drag-over');
  });
  _csDragSrcIdx  = null;
  _csDragTradeId = null;
}

// ── Mobile Touch ─────────────────────────────────────────────────

let _csTouch = {
  active: false, tradeId: null, srcIdx: null,
  startX: 0, startY: 0, ghost: null, srcEl: null,
  longPressTimer: null, triggered: false,
};

function cssTouchStart(e, tradeId) {
  const item = e.currentTarget;
  const idx  = parseInt(item.dataset.index);
  const t    = e.touches[0];

  _csTouch.srcEl   = item;
  _csTouch.srcIdx  = idx;
  _csTouch.tradeId = tradeId;
  _csTouch.startX  = t.clientX;
  _csTouch.startY  = t.clientY;
  _csTouch.triggered = false;

  // Long-press (400ms) to activate drag
  _csTouch.longPressTimer = setTimeout(() => {
    _csTouch.triggered = true;
    _csTouch.active    = true;
    item.classList.add('touch-dragging');
    // Vibrate feedback if available
    if (navigator.vibrate) navigator.vibrate(40);
    // Create ghost element
    const ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width  = item.offsetWidth + 'px';
    ghost.style.height = item.offsetHeight + 'px';
    ghost.style.left   = (item.getBoundingClientRect().left) + 'px';
    ghost.style.top    = (item.getBoundingClientRect().top) + 'px';
    document.body.appendChild(ghost);
    _csTouch.ghost = ghost;
  }, 400);
}

function cssTouchMove(e) {
  const t = e.touches[0];
  // Cancel long press if moved too much before 400ms
  if (!_csTouch.triggered) {
    const dx = Math.abs(t.clientX - _csTouch.startX);
    const dy = Math.abs(t.clientY - _csTouch.startY);
    if (dx > 8 || dy > 8) {
      clearTimeout(_csTouch.longPressTimer);
    }
    return;
  }
  e.preventDefault(); // stop page scroll while dragging
  // Move ghost
  if (_csTouch.ghost) {
    _csTouch.ghost.style.left = (t.clientX - _csTouch.ghost.offsetWidth  / 2) + 'px';
    _csTouch.ghost.style.top  = (t.clientY - _csTouch.ghost.offsetHeight / 2) + 'px';
  }
  // Highlight drop target
  const el = document.elementFromPoint(t.clientX, t.clientY);
  const target = el?.closest('.chart-sort-item');
  document.querySelectorAll('.chart-sort-item').forEach(i => i.classList.remove('drag-over'));
  if (target && parseInt(target.dataset.index) !== _csTouch.srcIdx) {
    target.classList.add('drag-over');
  }
}

function cssTouchEnd(e, tradeId) {
  clearTimeout(_csTouch.longPressTimer);

  if (!_csTouch.triggered) {
    _csTouch.active = false;
    return;
  }

  e.preventDefault();
  const t      = e.changedTouches[0];
  const el     = document.elementFromPoint(t.clientX, t.clientY);
  const target = el?.closest('.chart-sort-item');

  // Remove ghost
  if (_csTouch.ghost) {
    _csTouch.ghost.remove();
    _csTouch.ghost = null;
  }

  // Clean up classes
  document.querySelectorAll('.chart-sort-item').forEach(i => {
    i.classList.remove('touch-dragging', 'drag-over', 'dragging');
  });

  // Perform swap
  if (target) {
    const destIdx = parseInt(target.dataset.index);
    if (destIdx !== _csTouch.srcIdx) {
      _csSwap(tradeId, _csTouch.srcIdx, destIdx);
    }
  }

  _csTouch = { active:false, tradeId:null, srcIdx:null, startX:0, startY:0, ghost:null, srcEl:null, longPressTimer:null, triggered:false };
}

// ── Core swap + save ─────────────────────────────────────────────

function _csSwap(tradeId, fromIdx, toIdx) {
  const s = getTS(tradeId);

  // Ensure arrays are long enough
  const charts = s.charts       || [];
  const labels = s.chartLabels  || [...CHART_LABELS];
  while (charts.length <= Math.max(fromIdx, toIdx)) charts.push(null);
  while (labels.length <= Math.max(fromIdx, toIdx)) labels.push(`Chart ${labels.length + 1}`);

  // Swap
  [charts[fromIdx], charts[toIdx]] = [charts[toIdx], charts[fromIdx]];
  [labels[fromIdx], labels[toIdx]] = [labels[toIdx], labels[fromIdx]];

  s.charts      = charts;
  s.chartLabels = labels;

  // Re-render the charts tab only (fast, no full detail rebuild)
  _csRebuildGrid(tradeId);

  // Auto-save
  detSave(tradeId);
}

function _csRebuildGrid(tradeId) {
  // Re-render the full detail panel and jump back to charts tab
  _detActiveTab = 'charts';
  _renderDetail(tradeId);
}
