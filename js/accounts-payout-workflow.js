// ══ NxTGen Journal — accounts-payout-workflow.js ══════════════════════
// Funded-account payout workflow: Awaiting Payout → Processing → Completed
// → New Cycle, payout scheduling (frequency / date mode), business-day
// processing estimates, account reset with lifetime-vs-current-cycle
// analytics separation, and payout history.
//
// Loaded LAST, after accounts.js, accounts-premium.js and accounts-upgrade.js.
// Follows the same safe-override pattern used throughout the app:
//   const orig = window.fn; window.fn = function(){ ... orig.apply(...) ... };
// Every new field lives on the existing account object / existing
// `_accData.payouts` log — no parallel/conflicting store is introduced.
//
// New account fields (all optional, lazily defaulted — nothing is written
// until the user actually changes a setting or completes a payout):
//   payoutFrequency        'weekly'|'biweekly'|'monthly'|'custom'  (default 'biweekly')
//   payoutIntervalDays     number, used when payoutFrequency==='custom'
//   payoutDateMode         'automatic'|'manual'                    (default 'automatic')
//   nextPayoutDate         reused from the existing Risk & Payout settings
//   payoutProcessingDays   business days                           (default 2)
//   tradingDuringPayout    'continue'|'pause'                      (default 'continue')
//   currentCycleStartDate  ISO date — start of the current payout cycle
//   activePayoutId         id of the in-flight payout record, or null
//
// New payout-record fields (on entries pushed into the existing
// `_accData.payouts` array — the same log the Payouts tab already renders):
//   id, targetReachedAt, submittedAt, processingStartedAt,
//   estimatedCompletionDate, completedAt, balanceBeforeReset, resetBalance,
//   cycleStartDate, cycleEndDate, payoutTargetAtTime
// ════════════════════════════════════════════════════════════════════

// ── Scheduling helpers ─────────────────────────────────────────────────
const PAYOUT_FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30 };
const PAYOUT_FREQ_LABEL = { weekly: 'Weekly — every 7 days', biweekly: 'Bi-weekly — every 14 days', monthly: 'Monthly', custom: 'Custom interval' };

function _accPayoutDefaults(acc) {
  return {
    payoutFrequency:      acc.payoutFrequency || 'biweekly',
    payoutIntervalDays:   (acc.payoutIntervalDays !== undefined && acc.payoutIntervalDays !== null && acc.payoutIntervalDays !== '') ? parseInt(acc.payoutIntervalDays, 10) : 14,
    payoutDateMode:       acc.payoutDateMode || 'automatic',
    nextPayoutTime:       acc.nextPayoutTime || '00:00',
    payoutProcessingDays: (acc.payoutProcessingDays !== undefined && acc.payoutProcessingDays !== null && acc.payoutProcessingDays !== '') ? parseInt(acc.payoutProcessingDays, 10) : 2,
    tradingDuringPayout:  acc.tradingDuringPayout || 'continue',
    currentCycleStartDate: acc.currentCycleStartDate || '',
    activePayoutId:        acc.activePayoutId || null,
  };
}

// Parse a YYYY-MM-DD as a local date (avoids UTC off-by-one on some browsers).
function _accParseDate(s) {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function _accFmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Adds N business days (Mon–Fri) to a date, excluding the start date itself.
// e.g. Friday + 2 business days = Tuesday (Sat/Sun don't count).
function _accAddBusinessDays(startDate, days) {
  const d = new Date(startDate.getTime());
  let added = 0;
  const n = Math.max(0, parseInt(days, 10) || 0);
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

// Converts a wall-clock date/time (as entered in the Payout Schedule
// settings) into an absolute instant, interpreted in the ACCOUNT'S
// configured timezone (Account tab → Timezone, the same setting the
// topbar clock reads via getUserTz()) — not the visiting device's local
// timezone. Without this, "10:00 AM" would mean different real moments
// depending on what timezone the browser happens to be in.
function _accZonedTimeToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(guess));
    const map = {};
    parts.forEach(p => { if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10); });
    const wallAtGuess = Date.UTC(map.year, (map.month || 1) - 1, map.day || 1, map.hour === 24 ? 0 : (map.hour || 0), map.minute || 0, map.second || 0);
    return new Date(guess - (wallAtGuess - guess));
  } catch (e) {
    return new Date(guess); // invalid tz string — fall back to treating input as UTC
  }
}

// Combines an account's nextPayoutDate + nextPayoutTime into a real Date
// object, so "the payout date is reached" means the exact scheduled
// moment, not just the calendar day. Returns null when no date is set yet.
//
// Canonical source of truth is `nextPayoutAt` — an ISO UTC instant frozen
// at the moment the schedule was last saved, using whatever timezone was
// active THEN. That's what makes "10:00 AM Lagos" stay the same real-world
// moment even if the account's timezone setting is later switched to New
// York — only the *displayed* wall-clock time changes, not the instant.
// Accounts saved before this existed (nextPayoutDate/nextPayoutTime only,
// no nextPayoutAt) fall back to interpreting those against the CURRENT
// timezone, same as before.
function _accPayoutDateTimeValue(acc) {
  if (acc.nextPayoutAt) {
    const d = new Date(acc.nextPayoutAt);
    if (!isNaN(d.getTime())) return d;
  }
  const nextDate = acc.nextPayoutDate || '';
  if (!nextDate) return null;
  const p = _accPayoutDefaults(acc);
  const [y, m, d] = nextDate.split('-').map(Number);
  const [hh, mm] = (p.nextPayoutTime || '00:00').split(':').map(Number);
  const tz = (typeof getUserTz === 'function') ? getUserTz() : null;
  return tz ? _accZonedTimeToUtc(y, m || 1, d || 1, hh || 0, mm || 0, tz)
            : new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

// The reverse conversion — given an absolute instant, what date/time does
// it read as in a given IANA timezone. Used to correctly re-populate the
// schedule form (in the CURRENTLY active timezone) from a frozen instant.
function _accUtcToZonedParts(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(date);
    const map = {};
    parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
    return { y: map.year, m: map.month, d: map.day, hh: map.hour === '24' ? '00' : map.hour, mm: map.minute };
  } catch (e) {
    return {
      y: String(date.getFullYear()), m: String(date.getMonth() + 1).padStart(2, '0'), d: String(date.getDate()).padStart(2, '0'),
      hh: String(date.getHours()).padStart(2, '0'), mm: String(date.getMinutes()).padStart(2, '0'),
    };
  }
}
function _accZonedDateInputValue(date, tz) { const p = _accUtcToZonedParts(date, tz); return `${p.y}-${p.m}-${p.d}`; }
function _accZonedTimeInputValue(date, tz) { const p = _accUtcToZonedParts(date, tz); return `${p.hh}:${p.mm}`; }

// Takes what the user just typed into a date/time field (a wall-clock value
// meant "in the timezone they're currently viewing the app in") and freezes
// it into an absolute ISO instant. Returns null for an empty date so the
// caller can fall back to whatever was already saved.
function _accFreezePayoutAt(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  const tz = (typeof getUserTz === 'function') ? getUserTz() : null;
  const dt = tz ? _accZonedTimeToUtc(y, m || 1, d || 1, hh || 0, mm || 0, tz)
                : new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function _accIntervalDaysFor(acc) {
  const p = _accPayoutDefaults(acc);
  if (p.payoutFrequency === 'custom') return Math.max(1, p.payoutIntervalDays || 14);
  return PAYOUT_FREQ_DAYS[p.payoutFrequency] || 14;
}

// Computes the next payout date given a previous date string + account's
// schedule. Monthly advances by calendar month (same day-of-month) instead
// of a flat 30 days, so it stays anchored to a sensible date.
function _accComputeNextPayoutDate(prevDateStr, acc) {
  const p = _accPayoutDefaults(acc);
  const base = prevDateStr ? _accParseDate(prevDateStr) : new Date();
  if (p.payoutFrequency === 'monthly') {
    // setMonth() overflows into the following month when the target month
    // is shorter than the source day-of-month (e.g. Jan 31 -> Mar 3). Clamp
    // back to the last valid day of the intended month instead.
    const targetMonth = base.getMonth() + 1;
    const d = new Date(base.getFullYear(), targetMonth, base.getDate());
    if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
      d.setDate(0); // roll back to the last day of the intended month
    }
    return _accFmtDate(d);
  }
  const days = _accIntervalDaysFor(acc);
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return _accFmtDate(d);
}

// ── Cycle-scoped analytics (current payout cycle only) ─────────────────
// Lifetime analytics stay exactly as `_accComputeAnalytics()` already
// computes them (all trades, untouched). Current-cycle analytics are
// simply that same trade set filtered to trades on/after the cycle start
// date — no trade is ever modified, tagged, or deleted to make this work,
// which is what keeps a payout reset from erasing history.
function _accCycleAnalytics(name, cycleStartDate) {
  const acc     = _getCustomAccounts().find(a => a.name === name) || {};
  const accSize = parseFloat(acc.size) || 0;
  const at = (typeof trades !== 'undefined' ? trades : [])
    .filter(t => t.account === name && (!cycleStartDate || t.date >= cycleStartDate));
  const dollars = t => toPnlDollars(t, accSize);
  const net = at.reduce((s, t) => s + dollars(t), 0);
  const wins = at.filter(t => t.outcome === 'Win');
  const wr = at.length ? (wins.length / at.length) * 100 : 0;
  const dailyMap = {};
  at.forEach(t => { dailyMap[t.date] = (dailyMap[t.date] || 0) + dollars(t); });
  const TRADING_DAY_MIN_PCT = 0.5;
  const tradingDays = accSize > 0
    ? Object.values(dailyMap).filter(v => v >= accSize * (TRADING_DAY_MIN_PCT / 100)).length
    : Object.keys(dailyMap).length;
  let cum = 0, peak = 0, maxDD = 0;
  at.forEach(t => { cum += dollars(t); peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); });
  return { at, net, wr, tradingDays, maxDD, accSize };
}

// Full derived payout-workflow state for one funded account. Pure function
// of stored data — nothing here is persisted just by reading it.
function _accPayoutState(name) {
  const list = _getCustomAccounts();
  const acc = list.find(a => a.name === name) || {};
  const t = _accTypeInfo(acc.type);
  const r = _accRiskDefaults(acc);
  const p = _accPayoutDefaults(acc);
  const accSize = parseFloat(acc.size) || 0;

  if (!t.payout) {
    return { supported: false, acc, typeInfo: t };
  }

  // Fall back to the earliest trade on this account as an implicit cycle
  // start when none has been set yet, so a brand-new funded account's
  // "current cycle" naturally equals its lifetime until its first payout.
  const allTrades = (typeof trades !== 'undefined' ? trades : []).filter(tr => tr.account === name).sort((a, b) => a.date.localeCompare(b.date));
  const impliedStart = allTrades.length ? allTrades[0].date : '';
  const cycleStartDate = p.currentCycleStartDate || impliedStart;

  const cyc = _accCycleAnalytics(name, cycleStartDate);
  const payoutTarget = accSize > 0 ? accSize * r.payoutThresholdPct / 100 : 0;
  const cycleProfit  = Math.max(0, cyc.net);
  const payoutPct    = payoutTarget > 0 ? Math.min(100, (cycleProfit / payoutTarget) * 100) : 0;
  const minDaysMet   = r.minTradingDays <= 0 || cyc.tradingDays >= r.minTradingDays;
  const targetReached = payoutTarget > 0 && cycleProfit >= payoutTarget && minDaysMet;

  const activePayout = p.activePayoutId ? (_accData.payouts || []).find(x => x.id === p.activePayoutId) : null;
  const isProcessing = !!(activePayout && activePayout.status === 'Processing');

  // The payout request itself hasn't been made yet — it's an automatic,
  // date-driven step. Hitting the profit target only earns "Target Reached";
  // the stage doesn't advance to "Awaiting Payout" until the scheduled
  // payout date/time actually arrives, so this is re-derived fresh (against
  // the current clock) on every render — no cron/backend needed.
  const payoutDateTime = _accPayoutDateTimeValue(acc);
  const dateReached = !payoutDateTime || new Date() >= payoutDateTime;

  let opStatus = 'active';
  if (isProcessing) opStatus = 'processing';
  else if (targetReached && dateReached) opStatus = 'awaiting';
  else if (targetReached) opStatus = 'target_reached';

  const currentBalance = accSize + cyc.net;

  return {
    supported: true, acc, typeInfo: t, r, p, accSize,
    cycleStartDate, cyc, payoutTarget, cycleProfit, payoutPct, minDaysMet, targetReached,
    payoutDateTime, dateReached,
    activePayout, isProcessing, opStatus, currentBalance,
    tradingPaused: p.tradingDuringPayout === 'pause' && (opStatus === 'target_reached' || opStatus === 'awaiting' || opStatus === 'processing'),
  };
}

function _accPayoutId() {
  return 'py_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Formats a payout Date/time in the account's configured timezone (not the
// device's), with the UTC offset appended so it's always unambiguous which
// clock a scheduled time refers to — e.g. "Aug 13, 2026, 10:00 AM (UTC-4)".
function _accFmtPayoutDateTime(dt, opts) {
  if (!dt) return '—';
  const tz = (typeof getUserTz === 'function') ? getUserTz() : undefined;
  const offset = (typeof getUserTzOffsetLabel === 'function') ? getUserTzOffsetLabel(tz) : '';
  try {
    const label = dt.toLocaleString('en-US', { timeZone: tz, ...opts });
    return offset ? `${label} (${offset})` : label;
  } catch (e) {
    return dt.toLocaleString('en-US', opts);
  }
}

// ── Trade-entry gate — respects "Pause trading until payout is processed" ──
// Only ever blocks the specific account that's paused; every other account
// (and every non-funded account) trades exactly as before.
function accIsTradingPausedFor(name) {
  const s = _accPayoutState(name);
  return !!(s.supported && s.tradingPaused);
}

const _accPayoutOrigOpenModal = window.openModal;
if (typeof _accPayoutOrigOpenModal === 'function') {
  window.openModal = function (opts, ...rest) {
    const name = opts && opts.account;
    if (name && accIsTradingPausedFor(name)) {
      showToast(`${name} is paused for payout processing — new trades are disabled until the payout completes. Change this in Settings → Payout Schedule.`, 'danger');
      return;
    }
    return _accPayoutOrigOpenModal.call(this, opts, ...rest);
  };
}

// Belt-and-braces: also gate at save time, since the trade modal lets the
// user pick/change the account from a dropdown after opening — this way a
// paused account can't be traded no matter how the modal was reached.
const _accPayoutOrigSaveTrade = window.saveTrade;
if (typeof _accPayoutOrigSaveTrade === 'function') {
  window.saveTrade = function (...args) {
    const name = document.getElementById('m-acc')?.value;
    if (name && accIsTradingPausedFor(name)) {
      showToast(`${name} is paused for payout processing — new trades are disabled until the payout completes.`, 'danger');
      const btn = document.querySelector('#modal .btn-primary');
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Trade'; }
      return;
    }
    return _accPayoutOrigSaveTrade.apply(this, args);
  };
}

// ── Actions ──────────────────────────────────────────────────────────
async function accMarkPayoutProcessing(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const s = _accPayoutState(name);
  if (!s.supported || !s.targetReached) { showToast('This account has not reached its payout target yet.', 'danger'); return; }
  if (s.isProcessing) { showToast('A payout is already processing for this account.', 'danger'); return; }
  if (s.opStatus === 'target_reached') {
    const when = s.payoutDateTime ? _accFmtPayoutDateTime(s.payoutDateTime, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'the scheduled date';
    showToast(`This account's scheduled payout date/time hasn't arrived yet (${when}).`, 'danger');
    return;
  }

  const id = _accPayoutId();
  const now = new Date();
  const submitted = _accFmtDate(now);
  const est = _accFmtDate(_accAddBusinessDays(now, s.p.payoutProcessingDays));
  const entry = {
    id, account: name, amount: parseFloat(s.cycleProfit.toFixed(2)),
    date: submitted, status: 'Processing', notes: '', paymentMethod: '',
    targetReachedAt: submitted, submittedAt: now.toISOString(), processingStartedAt: now.toISOString(),
    estimatedCompletionDate: est, payoutTargetAtTime: s.payoutTarget, cycleStartDate: s.cycleStartDate,
    balanceBeforeReset: s.currentBalance,
  };
  _accData.payouts.push(entry);
  list[idx].activePayoutId = id;
  await _saveCustomAccounts(list);
  await _accSave();
  showToast('Payout marked as processing ✓', 'restore');
  buildAccounts();
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) { _accPendingDetailTab = 'risk'; accShowDetail(name); }
}

function accOpenCompletePayoutModal(name) {
  const s = _accPayoutState(name);
  if (!s.supported || !s.activePayout) { showToast('No payout is currently processing for this account.', 'danger'); return; }
  const existing = document.getElementById('acc-payout-complete-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'acc-payout-complete-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  const amt = s.activePayout.amount || 0;
  const resetBalance = s.accSize;
  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:440px">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-check-c"></use></svg> Complete Payout?</span>
      <button onclick="document.getElementById('acc-payout-complete-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="gap:12px">
      <div class="apw-confirm-line">Mark this payout of <strong>$${amt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> as completed and begin a new payout cycle.</div>
      <div class="apw-confirm-grid">
        <div><span class="k">Current Balance</span><span class="v">$${s.currentBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div><span class="k">Reset Balance</span><span class="v">$${resetBalance.toLocaleString()}</span></div>
      </div>
      <div class="apw-confirm-note"><svg class="icn" aria-hidden="true"><use href="#ic-shield"></use></svg> The account balance will reset to the configured initial balance. Trade history, win rate, and lifetime account analytics will remain unchanged.</div>
      <div class="wl-form-actions">
        <button class="wl-btn-secondary" onclick="document.getElementById('acc-payout-complete-overlay').remove()">Cancel</button>
        <button class="wl-btn-primary" onclick="accConfirmCompletePayout('${name.replace(/'/g, "\\'")}')">Confirm Payout Completion</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

async function accConfirmCompletePayout(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const s = _accPayoutState(name);
  document.getElementById('acc-payout-complete-overlay')?.remove();
  if (!s.supported || !s.activePayout || s.activePayout.status !== 'Processing') {
    // Guards against double-clicking "Confirm" or a stale/refreshed modal.
    showToast('This payout has already been completed.', 'danger');
    buildAccounts();
    return;
  }
  const payoutIdx = _accData.payouts.findIndex(p => p.id === s.activePayout.id);
  const now = new Date();
  const today = _accFmtDate(now);
  if (payoutIdx >= 0) {
    _accData.payouts[payoutIdx] = {
      ..._accData.payouts[payoutIdx],
      status: 'Received', completedAt: now.toISOString(), date: today,
      resetBalance: s.accSize, cycleEndDate: today,
    };
  }
  list[idx].activePayoutId = null;
  list[idx].currentCycleStartDate = today;
  if (s.p.payoutDateMode === 'automatic') {
    // Advance by the interval while preserving the same time-of-day, in
    // whichever timezone is currently active — then re-freeze the instant
    // so the next cycle's schedule is correct however far in the future it is.
    const tz = (typeof getUserTz === 'function') ? getUserTz() : null;
    const prevDateStr = (s.payoutDateTime && tz) ? _accZonedDateInputValue(s.payoutDateTime, tz) : (list[idx].nextPayoutDate || today);
    const timeStr = (s.payoutDateTime && tz) ? _accZonedTimeInputValue(s.payoutDateTime, tz) : (list[idx].nextPayoutTime || '00:00');
    list[idx].nextPayoutDate = _accComputeNextPayoutDate(prevDateStr, list[idx]);
    list[idx].nextPayoutTime = timeStr;
    list[idx].nextPayoutAt   = _accFreezePayoutAt(list[idx].nextPayoutDate, timeStr);
  }
  await _saveCustomAccounts(list);
  await _accSave();
  showToast('Payout completed — new cycle started ✓', 'restore');
  buildAccounts();
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) { _accPendingDetailTab = 'payouts'; accShowDetail(name); }
}

// Reverts an in-flight "Processing" payout back to its previous stage
// (Awaiting Payout, or Target Reached if the demo/mistaken action was taken
// before the scheduled date). Since nothing was actually received, the
// in-flight record is removed rather than kept as history.
async function accCancelPayoutProcessing(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const s = _accPayoutState(name);
  if (!s.supported || s.opStatus !== 'processing' || !s.activePayout) {
    showToast('No payout is currently processing for this account.', 'danger');
    return;
  }
  const payoutIdx = _accData.payouts.findIndex(p => p.id === s.activePayout.id);
  if (payoutIdx >= 0) _accData.payouts.splice(payoutIdx, 1);
  list[idx].activePayoutId = null;
  await _saveCustomAccounts(list);
  await _accSave();
  showToast('Payout processing cancelled ✓', 'restore');
  buildAccounts();
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) { _accPendingDetailTab = 'risk'; accShowDetail(name); }
}

function accViewPayoutSummary(name) {
  if (typeof _accActiveName !== 'undefined') _accActiveName = name;
  _accPendingDetailTab = 'risk';
  accShowDetail(name);
}

// ── Payout Schedule settings (Settings tab) ─────────────────────────────
function _accPayoutScheduleBlockHtml(name) {
  const acc = _getCustomAccounts().find(a => a.name === name) || {};
  const t = _accTypeInfo(acc.type);
  if (!t.payout) return '';
  const p = _accPayoutDefaults(acc);
  const escName = name.replace(/'/g, "\\'");
  const isCustomFreq = p.payoutFrequency === 'custom';
  const dt = _accPayoutDateTimeValue(acc);
  const tz = (typeof getUserTz === 'function') ? getUserTz() : null;
  // Prefill the form in the CURRENTLY active timezone, converted from the
  // frozen instant — so if the account tz was switched since this was set,
  // the fields show the correct equivalent local time, not stale raw values.
  const nextDate = dt && tz ? _accZonedDateInputValue(dt, tz) : (acc.nextPayoutDate || '');
  const nextTimeVal = dt && tz ? _accZonedTimeInputValue(dt, tz) : (p.nextPayoutTime || '00:00');
  const preview = dt ? _accFmtPayoutDateTime(dt, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not set';
  const intervalPreview = isCustomFreq ? `Every ${p.payoutIntervalDays} day${p.payoutIntervalDays === 1 ? '' : 's'}` : PAYOUT_FREQ_LABEL[p.payoutFrequency];

  return `
    <div class="acch-settings-block">
      <div class="acch-settings-title">Payout Schedule</div>
      <div class="wl-form-2col">
        <div class="wl-form-row">
          <label class="wl-form-label">Payout Frequency</label>
          <select class="wl-form-select" id="aps-freq-${escName}" onchange="_accTogglePayoutFreqCustom('${escName}')">
            <option value="weekly"${p.payoutFrequency==='weekly'?' selected':''}>Weekly — every 7 days</option>
            <option value="biweekly"${p.payoutFrequency==='biweekly'?' selected':''}>Bi-weekly — every 14 days</option>
            <option value="monthly"${p.payoutFrequency==='monthly'?' selected':''}>Monthly</option>
            <option value="custom"${p.payoutFrequency==='custom'?' selected':''}>Custom interval</option>
          </select>
        </div>
        <div class="wl-form-row" id="aps-custom-row-${escName}" style="${isCustomFreq ? '' : 'display:none'}">
          <label class="wl-form-label">Custom Interval (days)</label>
          <input type="number" class="wl-form-input" id="aps-interval-${escName}" value="${p.payoutIntervalDays}" min="1" step="1">
        </div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row">
          <label class="wl-form-label">Payout Date Mode</label>
          <select class="wl-form-select" id="aps-mode-${escName}" onchange="_accTogglePayoutDateMode('${escName}')">
            <option value="automatic"${p.payoutDateMode==='automatic'?' selected':''}>Automatic</option>
            <option value="manual"${p.payoutDateMode==='manual'?' selected':''}>Manual</option>
          </select>
        </div>
        <div class="wl-form-row">
          <label class="wl-form-label">${p.payoutDateMode === 'manual' ? 'Next Payout Date' : 'Initial Payout Date'}</label>
          <input type="date" class="wl-form-input" id="aps-nextdate-${escName}" value="${nextDate}">
        </div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row">
          <label class="wl-form-label">Payout Time</label>
          <input type="time" class="wl-form-input" id="aps-nexttime-${escName}" value="${nextTimeVal}">
        </div>
      </div>
      <div class="apw-schedule-preview" id="aps-preview-${escName}">
        ${p.payoutDateMode === 'manual'
          ? `<span class="apw-manual-badge">Manual schedule enabled</span>`
          : `Eligible for payout: <strong>${preview}</strong> · Frequency: <strong>${intervalPreview}</strong> · Status moves to "Awaiting Payout" automatically at that time — you still submit to your firm and mark it Processing yourself.`}
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row">
          <label class="wl-form-label">Payout Processing Timeframe</label>
          <select class="wl-form-select" id="aps-proc-${escName}" onchange="_accTogglePayoutProcCustom('${escName}')">
            <option value="1"${p.payoutProcessingDays===1?' selected':''}>1 business day</option>
            <option value="2"${p.payoutProcessingDays===2?' selected':''}>2 business days</option>
            <option value="3"${p.payoutProcessingDays===3?' selected':''}>3 business days</option>
            <option value="5"${p.payoutProcessingDays===5?' selected':''}>5 business days</option>
            <option value="custom"${![1,2,3,5].includes(p.payoutProcessingDays)?' selected':''}>Custom</option>
          </select>
        </div>
        <div class="wl-form-row" id="aps-proc-custom-row-${escName}" style="${[1,2,3,5].includes(p.payoutProcessingDays) ? 'display:none' : ''}">
          <label class="wl-form-label">Custom Business Days</label>
          <input type="number" class="wl-form-input" id="aps-procdays-${escName}" value="${p.payoutProcessingDays}" min="1" step="1">
        </div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row" style="grid-column:1/-1">
          <label class="wl-form-label">Trading During Payout Processing</label>
          <select class="wl-form-select" id="aps-trade-${escName}">
            <option value="continue"${p.tradingDuringPayout==='continue'?' selected':''}>Continue trading</option>
            <option value="pause"${p.tradingDuringPayout==='pause'?' selected':''}>Pause trading until payout is processed</option>
          </select>
        </div>
      </div>
      <button class="acch-act-btn" style="margin-top:8px" onclick="_saveAccPayoutSchedule('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Payout Schedule</button>
    </div>`;
}

function _accTogglePayoutFreqCustom(name) {
  const escName = name.replace(/'/g, "\\'");
  const v = document.getElementById(`aps-freq-${escName}`)?.value;
  const row = document.getElementById(`aps-custom-row-${escName}`);
  if (row) row.style.display = v === 'custom' ? '' : 'none';
}
function _accTogglePayoutProcCustom(name) {
  const escName = name.replace(/'/g, "\\'");
  const v = document.getElementById(`aps-proc-${escName}`)?.value;
  const row = document.getElementById(`aps-proc-custom-row-${escName}`);
  if (row) row.style.display = v === 'custom' ? '' : 'none';
}
function _accTogglePayoutDateMode(name) {
  const escName = name.replace(/'/g, "\\'");
  const sel = document.getElementById(`aps-mode-${escName}`);
  const label = sel?.closest('.wl-form-2col')?.querySelector('.wl-form-row:nth-child(2) .wl-form-label');
  if (label) label.textContent = sel.value === 'manual' ? 'Next Payout Date' : 'Initial Payout Date';
}

async function _saveAccPayoutSchedule(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const escName = name.replace(/'/g, "\\'");
  const val = id => document.getElementById(id)?.value ?? '';
  const freq = val(`aps-freq-${escName}`) || 'biweekly';
  let intervalDays = parseInt(val(`aps-interval-${escName}`), 10);
  if (freq === 'custom') {
    if (!intervalDays || intervalDays <= 0) { showToast('Custom interval must be a positive number of days.', 'danger'); return; }
  } else {
    intervalDays = PAYOUT_FREQ_DAYS[freq] || 14;
  }
  const mode = val(`aps-mode-${escName}`) || 'automatic';
  const nextDate = val(`aps-nextdate-${escName}`);
  const nextTime = val(`aps-nexttime-${escName}`) || '00:00';
  const procSel = val(`aps-proc-${escName}`);
  let procDays = procSel === 'custom' ? parseInt(val(`aps-procdays-${escName}`), 10) : parseInt(procSel, 10);
  if (!procDays || procDays <= 0) { showToast('Processing timeframe must be a positive number of business days.', 'danger'); return; }
  const tradingDuring = val(`aps-trade-${escName}`) || 'continue';

  list[idx].payoutFrequency      = freq;
  list[idx].payoutIntervalDays   = intervalDays;
  list[idx].payoutDateMode       = mode;
  list[idx].nextPayoutDate       = nextDate || list[idx].nextPayoutDate || '';
  list[idx].nextPayoutTime       = nextTime;
  list[idx].nextPayoutAt         = _accFreezePayoutAt(nextDate || list[idx].nextPayoutDate, nextTime) || list[idx].nextPayoutAt || null;
  list[idx].payoutProcessingDays = procDays;
  list[idx].tradingDuringPayout  = tradingDuring;

  await _saveCustomAccounts(list);
  showToast('Payout schedule saved ✓', 'restore');
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) { _accPendingDetailTab = 'settings'; accShowDetail(name); }
  buildAccounts();
}

// ── Progress ring (calm, compact — no confetti, no large banners) ──────
function _accPayoutRingSvg(pct, color, size) {
  size = size || 54;
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const dash = (p / 100) * c;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="apw-ring">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--glass-2)" stroke-width="4"></circle>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})"></circle>
  </svg>`;
}

// ── Compact status widget (Overview tab hero area) ──────────────────────
function _accPayoutWidgetHtml(name) {
  const s = _accPayoutState(name);
  if (!s.supported) return '';
  if (s.opStatus === 'active') return '';

  const escName = name.replace(/'/g, "\\'");

  if (s.opStatus === 'target_reached') {
    const ring = _accPayoutRingSvg(100, 'var(--blue)');
    const dueLabel = s.payoutDateTime ? _accFmtPayoutDateTime(s.payoutDateTime, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled';
    return `
    <div class="apw-widget apw-widget-reached">
      <div class="apw-widget-ring">${ring}<svg class="icn apw-ring-icon" aria-hidden="true"><use href="#ic-check-c"></use></svg></div>
      <div class="apw-widget-body">
        <div class="apw-widget-title">Target Reached</div>
        <div class="apw-widget-sub">Your payout target has been reached. This will automatically move to Awaiting Payout once the scheduled date/time arrives — you'll submit the request to your firm and mark it Processing from there.</div>
        <div class="apw-widget-meta">
          <span>Payout Amount <strong>$${s.cycleProfit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></span>
          <span>Scheduled For <strong>${dueLabel}</strong></span>
        </div>
      </div>
      <div class="apw-widget-actions">
        <button class="acch-act-btn" onclick="_openAccRiskSettings('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit Payout Details</button>
      </div>
    </div>`;
  }

  if (s.opStatus === 'awaiting') {
    const ring = _accPayoutRingSvg(100, 'var(--gold)');
    return `
    <div class="apw-widget apw-widget-awaiting">
      <div class="apw-widget-ring">${ring}<svg class="icn apw-ring-icon" aria-hidden="true"><use href="#ic-lock"></use></svg></div>
      <div class="apw-widget-body">
        <div class="apw-widget-title">Awaiting Payout</div>
        <div class="apw-widget-sub">Your payout target has been reached. This account is now awaiting payout processing.</div>
        <div class="apw-widget-meta">
          <span>Payout Amount <strong>$${s.cycleProfit.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></span>
          <span>Target <strong>$${s.payoutTarget.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</strong></span>
        </div>
      </div>
      <div class="apw-widget-actions">
        <button class="acch-act-btn acch-act-primary" onclick="accMarkPayoutProcessing('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-clock"></use></svg> Mark as Processing</button>
        <button class="acch-act-btn" onclick="_openAccRiskSettings('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit Payout Details</button>
      </div>
    </div>`;
  }

  // processing
  const est = s.activePayout?.estimatedCompletionDate;
  const estLabel = est ? new Date(_accParseDate(est)).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : '—';
  const ring = _accPayoutRingSvg(100, 'var(--teal)');
  return `
    <div class="apw-widget apw-widget-processing">
      <div class="apw-widget-ring apw-pulse">${ring}<svg class="icn apw-ring-icon" aria-hidden="true"><use href="#ic-clock"></use></svg></div>
      <div class="apw-widget-body">
        <div class="apw-widget-title">Payout Processing</div>
        <div class="apw-widget-sub">Funds are being processed. This is an estimate, not a guaranteed date.</div>
        <div class="apw-widget-meta">
          <span>Payout Amount <strong>$${(s.activePayout?.amount||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></span>
          <span>Estimated Completion <strong>${estLabel}</strong></span>
        </div>
      </div>
      <div class="apw-widget-actions">
        <button class="acch-act-btn acch-act-primary" onclick="accOpenCompletePayoutModal('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-check-c"></use></svg> Mark as Completed</button>
        <button class="acch-act-btn" onclick="accCancelPayoutProcessing('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg> Cancel</button>
      </div>
    </div>`;
}

// ── Payout timeline (Risk & Payout tab) — compact, elegant ─────────────
function _accPayoutTimelineHtml(name) {
  const s = _accPayoutState(name);
  if (!s.supported) return '';
  const steps = ['Target Reached', 'Awaiting Payout', 'Processing', 'Completed', 'New Cycle'];
  let activeIdx;
  if (s.opStatus === 'active') activeIdx = -1;
  else if (s.opStatus === 'target_reached') activeIdx = 0;
  else if (s.opStatus === 'awaiting') activeIdx = 1;
  else if (s.opStatus === 'processing') activeIdx = 2;
  return `
    <div class="apw-timeline">
      ${steps.map((label, i) => `
        <div class="apw-tl-step${i <= activeIdx ? ' done' : ''}${i === activeIdx ? ' current' : ''}">
          <span class="apw-tl-dot"></span><span class="apw-tl-label">${label}</span>
        </div>`).join('<span class="apw-tl-line"></span>')}
    </div>`;
}

// ── Current-cycle vs lifetime performance strip (Risk & Payout tab) ────
function _accCycleStripHtml(name) {
  const s = _accPayoutState(name);
  if (!s.supported) return '';
  const chip = (label, val) => `<div class="acch-ov-chip"><div class="acch-ov-chip-label">${label}</div><div class="acch-ov-chip-val">${val}</div></div>`;
  return `
    <div class="apw-cycle-strip">
      <div class="apw-cycle-strip-head">Current Payout Cycle <span class="apw-cycle-since">since ${s.cycleStartDate ? new Date(_accParseDate(s.cycleStartDate)).toLocaleDateString() : 'account start'}</span></div>
      <div class="acch-ov-row" style="grid-template-columns:repeat(4,1fr)">
        ${chip('Cycle Balance', '$' + s.currentBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}))}
        ${chip('Cycle Profit', (s.cyc.net>=0?'+$':'-$') + Math.abs(s.cyc.net).toFixed(2))}
        ${chip('Cycle Win Rate', s.cyc.at.length ? s.cyc.wr.toFixed(1)+'%' : '—')}
        ${chip('Payout Progress', s.payoutTarget > 0 ? Math.round(s.payoutPct) + '%' : '—')}
      </div>
    </div>`;
}

// ── Danger-zone processing actions block (Risk & Payout tab) ───────────
function _accPayoutActionsHtml(name) {
  const s = _accPayoutState(name);
  if (!s.supported || s.opStatus === 'active') return '';
  const escName = name.replace(/'/g, "\\'");
  if (s.opStatus === 'target_reached') {
    return `<div class="apw-actions-row">
      <button class="acch-act-btn" onclick="_openAccRiskSettings('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Adjust Payout Date</button>
    </div>`;
  }
  if (s.opStatus === 'awaiting') {
    return `<div class="apw-actions-row">
      <button class="acch-act-btn acch-act-primary" onclick="accMarkPayoutProcessing('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-clock"></use></svg> Mark Payout as Processing</button>
      <button class="acch-act-btn" onclick="_openAccRiskSettings('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Adjust Payout Date</button>
    </div>`;
  }
  return `<div class="apw-actions-row">
    <button class="acch-act-btn acch-act-primary" onclick="accOpenCompletePayoutModal('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-check-c"></use></svg> Mark Payout as Completed</button>
    <button class="acch-act-btn" onclick="accCancelPayoutProcessing('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg> Cancel Processing</button>
  </div>`;
}

// ── Inject into the account detail tabs, without duplicating the tab
//    shell / Risk panel / Settings panel that accounts-upgrade.js builds ──
const _accPayoutOrigEnhance = window._accEnhanceDetailView;
window._accEnhanceDetailView = function (name) {
  const r = _accPayoutOrigEnhance.apply(this, arguments);
  const s = _accPayoutState(name);
  if (!s.supported) return r;

  // Overview: compact status widget right after the hero.
  const shell = document.querySelector('.acch-tabs-wrap');
  const overviewPanel = shell?.querySelector('[data-panel="overview"]');
  const widgetHtml = _accPayoutWidgetHtml(name);
  if (overviewPanel && widgetHtml) {
    overviewPanel.insertAdjacentHTML('afterbegin', widgetHtml);
  }

  // Risk & Payout: cycle strip + timeline + processing actions, appended
  // after the existing bars/meta block that accounts-upgrade.js rendered.
  const riskPanel = shell?.querySelector('[data-panel="risk"]');
  if (riskPanel) {
    const wrap = document.createElement('div');
    wrap.className = 'apw-risk-extra';
    wrap.innerHTML = `${_accCycleStripHtml(name)}${_accPayoutTimelineHtml(name)}${_accPayoutActionsHtml(name)}`;
    riskPanel.appendChild(wrap);
  }

  // Settings: Payout Schedule block, appended after the existing Rules
  // & Payout block (before MT5 Connection / Danger Zone).
  const settingsPanel = shell?.querySelector('[data-panel="settings"]');
  const scheduleHtml = _accPayoutScheduleBlockHtml(name);
  if (settingsPanel && scheduleHtml) {
    const blocks = settingsPanel.querySelectorAll('.acch-settings-block');
    // Insert right after "Rules & Payout" (2nd block for funded accounts),
    // falling back to the front of the panel if that block isn't present.
    let anchor = null;
    blocks.forEach(b => { if (b.querySelector('.acch-settings-title')?.textContent.includes('Payout')) anchor = b; });
    const node = document.createElement('div');
    node.innerHTML = scheduleHtml;
    if (anchor) anchor.insertAdjacentElement('afterend', node.firstElementChild);
    else settingsPanel.insertAdjacentElement('afterbegin', node.firstElementChild);
  }

  return r;
};

// ── Grid card decoration — swap the status pill for Awaiting/Processing
//    and add a one-line note, without re-implementing the whole card. ──
function _accPayoutNameFromCard(card) {
  const onclick = card.getAttribute('onclick') || '';
  const m = onclick.match(/accShowDetail\('([^']*)'\)/);
  return m ? m[1].replace(/\\'/g, "'") : null;
}

function _accPayoutDecorateGrid() {
  document.querySelectorAll('#accounts-grid .acch-card, #acc-archived-section .acch-card').forEach(card => {
    const name = _accPayoutNameFromCard(card);
    if (!name) return;
    const s = _accPayoutState(name);
    if (!s.supported || s.opStatus === 'active') return;

    const statusClass = { processing: 'acch-status-processing', awaiting: 'acch-status-awaiting', target_reached: 'acch-status-reached' }[s.opStatus];
    const statusLabel = { processing: 'Payout Processing', awaiting: 'Awaiting Payout', target_reached: 'Target Reached' }[s.opStatus];
    const pill = card.querySelector('.acch-status');
    if (pill) {
      pill.className = 'acch-status ' + statusClass;
      pill.textContent = statusLabel;
    }
    if (!card.querySelector('.apw-card-note')) {
      const note = document.createElement('div');
      note.className = 'apw-card-note ' + { processing: 'apw-card-note-processing', awaiting: 'apw-card-note-awaiting', target_reached: 'apw-card-note-reached' }[s.opStatus];
      let noteHtml;
      if (s.opStatus === 'processing') {
        noteHtml = `<svg class="icn" aria-hidden="true"><use href="#ic-clock"></use></svg> Payout processing — est. completion ${s.activePayout?.estimatedCompletionDate ? new Date(_accParseDate(s.activePayout.estimatedCompletionDate)).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '—'}`;
      } else if (s.opStatus === 'awaiting') {
        noteHtml = `<svg class="icn" aria-hidden="true"><use href="#ic-lock"></use></svg> Payout target reached — awaiting processing`;
      } else {
        const dueLabel = s.payoutDateTime ? _accFmtPayoutDateTime(s.payoutDateTime, {month:'short',day:'numeric'}) : '—';
        noteHtml = `<svg class="icn" aria-hidden="true"><use href="#ic-check-c"></use></svg> Payout target reached — scheduled ${dueLabel}`;
      }
      note.innerHTML = noteHtml;
      const actions = card.querySelector('.acch-actions');
      if (actions) actions.insertAdjacentElement('beforebegin', note);
    }
  });
}

const _accPayoutOrigBuild2 = window.buildAccounts;
window.buildAccounts = function (...args) {
  const r = _accPayoutOrigBuild2.apply(this, args);
  requestAnimationFrame(_accPayoutDecorateGrid);
  return r;
};

// ── Live auto-advance ────────────────────────────────────────────────
// "Target Reached → Awaiting Payout" is purely a function of the clock
// (no user action, no backend cron). Re-derive every funded account's
// stage once a minute and, only when a stage actually changed, refresh
// the grid badges and any open detail view in place — no page reload.
const _accPayoutLastStatus = {};
function _accPayoutAutoAdvanceTick() {
  let changed = false;
  _getCustomAccounts().forEach(acc => {
    const s = _accPayoutState(acc.name);
    if (!s.supported) return;
    const prev = _accPayoutLastStatus[acc.name];
    _accPayoutLastStatus[acc.name] = s.opStatus;
    if (prev && prev !== s.opStatus) changed = true;
  });
  if (!changed) return;
  if (document.getElementById('accounts-grid')) _accPayoutDecorateGrid();
  if (typeof _accActiveName !== 'undefined' && _accActiveName) {
    const s2 = _accPayoutState(_accActiveName);
    if (s2.supported) accShowDetail(_accActiveName);
  }
}
setInterval(_accPayoutAutoAdvanceTick, 60000);
