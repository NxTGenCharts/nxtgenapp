// ══ NxTGen Journal — accounts-payout-disabled.js ══════════════════════
// Adds a terminal "Payout Rejected → Account Disabled" outcome to the
// funded-account payout workflow, alongside the existing Processing →
// Completed → New Cycle path. A firm can reject a payout and pull the
// account instead of paying out — this records that as history (not a
// silent delete) and stops the account from being traded further.
//
// Loaded LAST, after accounts-payout-workflow.js. Same safe-override
// pattern as the rest of the app:
//   const orig = window.fn; window.fn = function(){ ... orig.apply(...) ... };
//
// New account fields (optional, lazily set — nothing written until the
// user actually rejects a payout):
//   disabled          boolean — true once the firm has pulled the account
//   disabledAt        ISO datetime of when it was marked disabled
//   disabledReason    free-text note (e.g. "Payout rejected — risk violation")
//
// The rejected payout itself is written into the existing _accData.payouts
// log (same array the Payouts tab already renders) with status:'Rejected',
// so it shows up in payout history rather than disappearing.
// ════════════════════════════════════════════════════════════════════

function _accDisabledEscName(name) { return name.replace(/'/g, "\\'"); }

// Finds the payout record most relevant to "what actually got rejected":
// an in-flight Processing payout takes priority (the live case), otherwise
// the most recently Received payout for this account (the retroactive case
// — the firm paid out, then clawed back / disabled the account after the
// fact, so the "Mark as Completed" click already happened before this was
// known). Returns null if neither exists (nothing to reclassify).
function _accDisabledCandidatePayout(name) {
  const rows = (_accData.payouts || []).filter(p => p.account === name).sort((a, b) => b.date.localeCompare(a.date));
  return rows.find(p => p.status === 'Processing') || rows.find(p => p.status === 'Received') || null;
}

// ── Disable-account confirmation modal — reachable at ANY time (not
//    gated on a payout currently being "Processing"), since a firm can
//    reject/claw back a payout after it was already marked Completed. ──
function accOpenDisableAccountModal(name) {
  const list = _getCustomAccounts();
  const acc = list.find(a => a.name === name);
  if (!acc) return;
  const escName = _accDisabledEscName(name);
  const candidate = _accDisabledCandidatePayout(name);
  const existing = document.getElementById('acc-payout-reject-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'acc-payout-reject-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  const candidateRow = candidate
    ? `<label class="apw-confirm-checkbox">
         <input type="checkbox" id="acc-reject-reclass-${escName}" checked>
         <span>Also mark the ${candidate.status === 'Processing' ? 'in-progress' : 'last received'} payout — <strong>$${parseFloat(candidate.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> (${candidate.date}) — as <strong>Rejected</strong></span>
       </label>`
    : '';
  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:460px">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-close-c"></use></svg> Disable Account?</span>
      <button onclick="document.getElementById('acc-payout-reject-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="gap:12px">
      <div class="apw-confirm-line">Mark <strong>${name}</strong> as disabled — use this when the firm has rejected a payout and pulled the account.</div>
      <div class="apw-confirm-note apw-confirm-note-danger"><svg class="icn" aria-hidden="true"><use href="#ic-warning"></use></svg> This is a terminal outcome — no new trades can be logged against this account and it won't start a new payout cycle. Trade history and payout history are kept.</div>
      ${candidateRow}
      <div class="wl-form-row">
        <label class="wl-form-label">Reason (optional)</label>
        <textarea id="acc-reject-reason-${escName}" class="wl-form-input" rows="2" placeholder="e.g. Payout rejected — daily loss limit breached"></textarea>
      </div>
      <div class="wl-form-actions">
        <button class="wl-btn-secondary" onclick="document.getElementById('acc-payout-reject-overlay').remove()">Cancel</button>
        <button class="wl-btn-danger" onclick="accConfirmDisableAccount('${escName}')">Confirm — Disable Account</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

async function accConfirmDisableAccount(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const escName = _accDisabledEscName(name);
  const reasonEl = document.getElementById(`acc-reject-reason-${escName}`);
  const reason = (reasonEl?.value || '').trim();
  const reclassEl = document.getElementById(`acc-reject-reclass-${escName}`);
  const shouldReclass = !reclassEl || reclassEl.checked; // checkbox only exists when a candidate does
  document.getElementById('acc-payout-reject-overlay')?.remove();

  const now = new Date();
  const today = _accFmtDate(now);

  if (shouldReclass) {
    const candidate = _accDisabledCandidatePayout(name);
    if (candidate) {
      const payoutIdx = _accData.payouts.findIndex(p => p.id === candidate.id);
      if (payoutIdx >= 0) {
        // Same backfill as the Completed path — a rejected payout that
        // was never marked Processing (rejected straight from Awaiting/
        // Target Reached) or was added manually never got a payment
        // method attached, so the Payouts tab showed a blank "—" Method.
        const existingMethod = _accData.payouts[payoutIdx].paymentMethod;
        const rd = (typeof _accRiskDefaults === 'function') ? _accRiskDefaults(list[idx]) : {};
        _accData.payouts[payoutIdx] = {
          ..._accData.payouts[payoutIdx],
          status: 'Rejected', rejectedAt: now.toISOString(), date: today, rejectionReason: reason,
          paymentMethod: existingMethod || rd.payoutMethod || '',
        };
      }
      if (list[idx].activePayoutId === candidate.id) list[idx].activePayoutId = null;
    }
  }

  // A rejected payout ends this cycle's attempt the same way a completed
  // one does — otherwise the cycle's accrued profit never resets, and the
  // account immediately re-flags as "eligible for a payout" again for the
  // exact same profit the firm already rejected, whether or not the
  // account stays disabled or gets reactivated later.
  list[idx].currentCycleStartDate = today;
  list[idx].activePayoutId = null;

  list[idx].disabled = true;
  list[idx].disabledAt = now.toISOString();
  list[idx].disabledReason = reason;
  await _saveCustomAccounts(list);
  await _accSave();
  showToast('Account disabled', 'danger');
  buildAccounts();
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) { _accPendingDetailTab = 'overview'; accShowDetail(name); }
}

// Kept for the "Payout Rejected" shortcut button on the live Processing
// widget/actions row — same underlying flow, just entered from there.
function accOpenRejectPayoutModal(name) { accOpenDisableAccountModal(name); }
async function accConfirmRejectPayout(name) { return accConfirmDisableAccount(name); }

// ── Reactivate (undo a mistaken disable) ────────────────────────────
async function accReactivateDisabledAccount(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  list[idx].disabled = false;
  list[idx].disabledAt = null;
  list[idx].disabledReason = '';
  // Belt-and-suspenders: the cycle is already reset at reject time (see
  // accConfirmDisableAccount), but this covers accounts disabled before
  // that fix existed — reactivating should never hand back an account
  // that's still sitting on the exact cycle profit that got it rejected.
  list[idx].currentCycleStartDate = _accFmtDate(new Date());
  list[idx].activePayoutId = null;
  await _saveCustomAccounts(list);
  showToast('Account reactivated ✓', 'restore');
  buildAccounts();
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) accShowDetail(name);
}

// ── Manual recovery: start a new cycle without a full disable/reactivate
//    round-trip. Covers accounts that were disabled and reactivated
//    before the cycle-reset fix above existed, and is otherwise just a
//    convenient manual "this cycle is done, start counting fresh" action
//    (e.g. the firm rejected a payout without ever using the in-app
//    Disable flow, so it never went through accConfirmDisableAccount at
//    all). Lifetime trade history and analytics are never touched. ─────
function accOpenStartNewCycleModal(name) {
  const s = _accPayoutState(name);
  if (!s.supported) return;
  const escName = _accDisabledEscName(name);
  const existing = document.getElementById('acc-new-cycle-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'acc-new-cycle-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:440px">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Start New Cycle?</span>
      <button onclick="document.getElementById('acc-new-cycle-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="gap:12px">
      <div class="apw-confirm-line">Reset <strong>${name}</strong>'s current payout cycle to start today.</div>
      <div class="apw-confirm-note"><svg class="icn" aria-hidden="true"><use href="#ic-shield"></use></svg> Use this if the cycle didn't reset on its own after a rejected payout. Trade history and lifetime analytics are unaffected — only the cycle profit/eligibility calculation restarts.</div>
      <div class="wl-form-actions">
        <button class="wl-btn-secondary" onclick="document.getElementById('acc-new-cycle-overlay').remove()">Cancel</button>
        <button class="wl-btn-primary" onclick="accConfirmStartNewCycle('${escName}')">Start New Cycle</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

async function accConfirmStartNewCycle(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  document.getElementById('acc-new-cycle-overlay')?.remove();
  list[idx].currentCycleStartDate = _accFmtDate(new Date());
  list[idx].activePayoutId = null;
  await _saveCustomAccounts(list);
  showToast('New cycle started ✓', 'restore');
  buildAccounts();
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) { _accPendingDetailTab = 'risk'; accShowDetail(name); }
}

// core-modals-userbar.js's archive toggle is index-based (it operates on
// the Manage Accounts list order) — this just resolves the name to its
// current index so the "Archive" shortcut on the disabled banner works.
async function _archiveAccountByName(name) {
  const list = _getCustomAccounts();
  const i = list.findIndex(a => a.name === name);
  if (i < 0) return;
  if (typeof _toggleArchiveAccount === 'function') await _toggleArchiveAccount(i);
}

function _accIsDisabled(name) {
  const acc = _getCustomAccounts().find(a => a.name === name);
  return !!(acc && acc.disabled);
}

// ── Trading gate — a disabled account can never be traded again, on
//    top of (not instead of) the existing payout-processing pause. ──
const _accDisabledOrigPausedFor = window.accIsTradingPausedFor;
window.accIsTradingPausedFor = function (name) {
  if (_accIsDisabled(name)) return true;
  return _accDisabledOrigPausedFor.apply(this, arguments);
};

// openModal / saveTrade already funnel every account through
// accIsTradingPausedFor (accounts-payout-workflow.js's own override calls
// it by name, so it automatically picks up the disabled check above too —
// no gap there). This second wrap only exists to swap in copy that reads
// correctly for a disabled account ("has been disabled") instead of the
// payout-processing pause message, by intercepting before that check runs.
const _accDisabledOrigOpenModal = window.openModal;
if (typeof _accDisabledOrigOpenModal === 'function') {
  window.openModal = function (opts, ...rest) {
    const name = opts && opts.account;
    if (name && _accIsDisabled(name)) {
      showToast(`${name} has been disabled — this account can no longer be traded.`, 'danger');
      return;
    }
    return _accDisabledOrigOpenModal.call(this, opts, ...rest);
  };
}
const _accDisabledOrigSaveTrade = window.saveTrade;
if (typeof _accDisabledOrigSaveTrade === 'function') {
  window.saveTrade = function (...args) {
    const name = document.getElementById('m-acc')?.value;
    if (name && _accIsDisabled(name)) {
      showToast(`${name} has been disabled — this account can no longer be traded.`, 'danger');
      const btn = document.querySelector('#modal .btn-primary');
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-save"></use></svg> Save Trade'; }
      return;
    }
    return _accDisabledOrigSaveTrade.apply(this, args);
  };
}

// ── Settings tab: add a Disable/Reactivate action into the existing
//    Danger Zone block, so it's reachable regardless of payout state. ──
const _accDisabledOrigEnhance2 = window._accEnhanceDetailView;
window._accEnhanceDetailView = function (name) {
  const r = _accDisabledOrigEnhance2.apply(this, arguments);
  const list = _getCustomAccounts();
  const acc = list.find(a => a.name === name);
  if (!acc) return r;
  const escName = _accDisabledEscName(name);
  const shell = document.querySelector('.acch-tabs-wrap');
  const settingsPanel = shell?.querySelector('[data-panel="settings"]');
  if (!settingsPanel) return r;
  const blocks = settingsPanel.querySelectorAll('.acch-settings-block');
  let dangerBlock = null;
  blocks.forEach(b => { if (b.querySelector('.acch-settings-title')?.textContent.trim() === 'Danger Zone') dangerBlock = b; });
  if (!dangerBlock || dangerBlock.querySelector('.apw-disable-btn')) return r;
  const btn = document.createElement('button');
  btn.className = 'acch-act-btn apw-disable-btn';
  btn.style.marginTop = '8px';
  if (acc.disabled) {
    btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Reactivate Account';
    btn.setAttribute('onclick', `accReactivateDisabledAccount('${escName}')`);
  } else {
    btn.className += ' acch-act-danger';
    btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-close-c"></use></svg> Disable Account (Payout Rejected)';
    btn.setAttribute('onclick', `accOpenDisableAccountModal('${escName}')`);
  }
  dangerBlock.appendChild(btn);
  return r;
};

// ── Overview widget: disabled banner, or inject a Reject button into
//    the normal Processing widget. ─────────────────────────────────
function _accDisabledWidgetHtml(name, acc) {
  const escName = _accDisabledEscName(name);
  const when = acc.disabledAt ? new Date(acc.disabledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  return `
  <div class="apw-widget apw-widget-disabled">
    <div class="apw-widget-ring"><svg class="apw-ring" width="54" height="54" viewBox="0 0 54 54"><circle cx="27" cy="27" r="23" fill="none" stroke="var(--red-dim)" stroke-width="4"></circle></svg><svg class="icn apw-ring-icon" aria-hidden="true"><use href="#ic-close-c"></use></svg></div>
    <div class="apw-widget-body">
      <div class="apw-widget-title">Account Disabled — Payout Rejected</div>
      <div class="apw-widget-sub">${acc.disabledReason ? acc.disabledReason : 'This account was disabled after the firm rejected its payout.'} Disabled ${when}. No new trades can be logged against this account.</div>
    </div>
    <div class="apw-widget-actions">
      <button class="acch-act-btn" onclick="accReactivateDisabledAccount('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Reactivate</button>
      <button class="acch-act-btn" onclick="_archiveAccountByName('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg> Archive</button>
    </div>
  </div>`;
}

const _accDisabledOrigWidgetHtml = window._accPayoutWidgetHtml;
window._accPayoutWidgetHtml = function (name) {
  const acc = _getCustomAccounts().find(a => a.name === name);
  if (acc && acc.disabled) return _accDisabledWidgetHtml(name, acc);
  let html = _accDisabledOrigWidgetHtml.apply(this, arguments);
  // Inject a "Payout Rejected" action next to "Mark as Completed" / "Cancel"
  // on the live Processing widget, without re-implementing it here.
  if (html && html.includes('apw-widget-processing')) {
    const escName = _accDisabledEscName(name);
    const rejectBtn = `<button class="acch-act-btn acch-act-danger" onclick="accOpenRejectPayoutModal('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-close-c"></use></svg> Payout Rejected</button>`;
    html = html.replace('<button class="acch-act-btn" onclick="accCancelPayoutProcessing', rejectBtn + '<button class="acch-act-btn" onclick="accCancelPayoutProcessing');
  }
  return html;
};

// ── Risk & Payout tab: same treatment for the danger-zone actions row ──
const _accDisabledOrigActionsHtml = window._accPayoutActionsHtml;
window._accPayoutActionsHtml = function (name) {
  const acc = _getCustomAccounts().find(a => a.name === name);
  if (acc && acc.disabled) {
    const escName = _accDisabledEscName(name);
    return `<div class="apw-actions-row">
      <button class="acch-act-btn" onclick="accReactivateDisabledAccount('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Reactivate Account</button>
    </div>`;
  }
  let html = _accDisabledOrigActionsHtml.apply(this, arguments);
  if (html && html.includes('accCancelPayoutProcessing')) {
    const escName = _accDisabledEscName(name);
    const rejectBtn = `<button class="acch-act-btn acch-act-danger" onclick="accOpenRejectPayoutModal('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-close-c"></use></svg> Payout Rejected</button>`;
    html = html.replace('<button class="acch-act-btn" onclick="accCancelPayoutProcessing', rejectBtn + '<button class="acch-act-btn" onclick="accCancelPayoutProcessing');
  }
  // Manual recovery option, always available for a live (non-disabled)
  // payout-supporting account — mainly for accounts whose cycle got
  // stuck before the reject/reactivate cycle-reset fix existed.
  const s = (typeof _accPayoutState === 'function') ? _accPayoutState(name) : null;
  if (!s || !s.supported) return html;
  const escName = _accDisabledEscName(name);
  const newCycleBtn = `<button class="acch-act-btn" onclick="accOpenStartNewCycleModal('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Start New Cycle</button>`;
  html = html ? html.replace(/<\/div>\s*$/, `${newCycleBtn}</div>`) : `<div class="apw-actions-row">${newCycleBtn}</div>`;
  return html;
};

// ── Timeline: swap the normal 5-step progress track for a plain
//    "rejected" marker when disabled — showing the normal steps as
//    partially "done" would misleadingly imply the payout is still
//    on track. ──────────────────────────────────────────────────────
const _accDisabledOrigTimelineHtml = window._accPayoutTimelineHtml;
window._accPayoutTimelineHtml = function (name) {
  const acc = _getCustomAccounts().find(a => a.name === name);
  if (acc && acc.disabled) {
    return `<div class="apw-timeline apw-timeline-disabled">
      <div class="apw-tl-step done"><span class="apw-tl-dot"></span><span class="apw-tl-label">Target Reached</span></div><span class="apw-tl-line"></span>
      <div class="apw-tl-step done"><span class="apw-tl-dot"></span><span class="apw-tl-label">Awaiting Payout</span></div><span class="apw-tl-line"></span>
      <div class="apw-tl-step done"><span class="apw-tl-dot"></span><span class="apw-tl-label">Processing</span></div><span class="apw-tl-line"></span>
      <div class="apw-tl-step current apw-tl-step-rejected"><span class="apw-tl-dot"></span><span class="apw-tl-label">Rejected</span></div>
    </div>`;
  }
  return _accDisabledOrigTimelineHtml.apply(this, arguments);
};

// ── Grid: give disabled accounts their own "Disabled Accounts" section,
//    the same way archived accounts get their own section — instead of
//    just recoloring the pill in place inside Active. Hooked into
//    _renderAccGrid (not just the payout-decorate pass) so it re-runs
//    correctly on manual section toggles too, not only on full rebuilds. ──
function _accDisabledDecorateCard(card, acc) {
  card.classList.add('acch-card-disabled');
  const pill = card.querySelector('.acch-status');
  if (pill) { pill.className = 'acch-status acch-status-disabled'; pill.textContent = 'Disabled'; }
  let note = card.querySelector('.apw-card-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'apw-card-note';
    const actions = card.querySelector('.acch-actions');
    if (actions) actions.insertAdjacentElement('beforebegin', note);
    else card.appendChild(note);
  }
  note.className = 'apw-card-note apw-card-note-disabled';
  note.innerHTML = `<svg class="icn" aria-hidden="true"><use href="#ic-close-c"></use></svg> ${acc.disabledReason ? acc.disabledReason : 'Payout rejected — account disabled'}`;
}

function _accDisabledRelocateSection() {
  const mount = document.getElementById('acc-disabled-section');
  if (!mount) return; // markup not present on this build — nothing to relocate into

  const list = _getCustomAccounts();
  // An account that's both disabled AND separately archived stays put in
  // the Archived section (archiving is the more deliberate "put it away"
  // action) — just recolor it there instead of relocating it again.
  const toMove = list.filter(a => a.disabled && a.status !== 'archived');
  const toDecorateInPlace = list.filter(a => a.disabled && a.status === 'archived');

  toDecorateInPlace.forEach(acc => {
    document.querySelectorAll('#acc-archived-section .acch-card').forEach(card => {
      if (_accPayoutNameFromCard(card) === acc.name) _accDisabledDecorateCard(card, acc);
    });
  });

  const movedCards = [];
  document.querySelectorAll('#accounts-grid .acch-card').forEach(card => {
    const name = _accPayoutNameFromCard(card);
    const acc = toMove.find(a => a.name === name);
    if (acc) { _accDisabledDecorateCard(card, acc); movedCards.push(card); }
  });

  if (!movedCards.length) { mount.innerHTML = ''; return; }
  const visible = _accSectionVisible('disabled');
  mount.innerHTML = `
    <div class="acch-grid-head" style="margin-top:24px">
      <span class="acch-grid-title">Disabled Accounts (${movedCards.length})</span>
      <button class="acc-section-toggle-btn" title="${visible ? 'Hide' : 'Show'} disabled accounts" onclick="_accToggleSection('disabled')">
        <svg class="icn" aria-hidden="true" style="transform:rotate(${visible ? 90 : 0}deg);transition:transform .15s"><use href="#ic-chevron-right"></use></svg>
        ${visible ? 'Hide' : 'Show'}
      </button>
    </div>
    ${visible ? '<div class="acch-grid" id="acc-disabled-grid"></div>' : ''}`;
  const gridEl = document.getElementById('acc-disabled-grid');
  // appendChild on a node already in the DOM moves it — no clone needed,
  // so click handlers / bound state on the card survive the relocation.
  movedCards.forEach(card => { if (gridEl) gridEl.appendChild(card); });
}

const _accDisabledOrigRenderGrid = window._renderAccGrid;
window._renderAccGrid = function (...args) {
  const r = _accDisabledOrigRenderGrid.apply(this, args);
  _accDisabledRelocateSection();
  return r;
};

// ── Payouts tab table: color a Rejected row red instead of the default
//    gold ("pending"-looking) pill, and surface the reason as a tooltip. ──
const _accDisabledOrigPayoutsTabHtml = window._accPayoutsTabHtml;
if (typeof _accDisabledOrigPayoutsTabHtml === 'function') {
  window._accPayoutsTabHtml = function (name) {
    let html = _accDisabledOrigPayoutsTabHtml.apply(this, arguments);
    // Same filter + sort the original table body uses, so the Nth
    // "pill-gold Rejected" span left-to-right in the HTML lines up with
    // the Nth entry here when a couple of rows share the same rendering.
    const rejected = (_accData.payouts || [])
      .filter(p => p.account === name)
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(p => p.status === 'Rejected');
    rejected.forEach(p => {
      const reasonAttr = p.rejectionReason ? ` title="${p.rejectionReason.replace(/"/g, '&quot;')}"` : '';
      html = html.replace(
        '<span class="pill pill-gold">Rejected</span>',
        `<span class="pill pill-red"${reasonAttr}>Rejected</span>`
      );
    });
    return html;
  };
}

// ── Detail hero badge ────────────────────────────────────────────────
const _accDisabledOrigShowDetail = window.accShowDetail;
window.accShowDetail = function (name) {
  const r = _accDisabledOrigShowDetail.apply(this, arguments);
  if (!_accIsDisabled(name)) return r;
  const body = document.getElementById('acc-detail-body');
  const badge = body?.querySelector('.acc-hero-badge.status-active, .acc-hero-badge.status-completed, .acc-hero-badge.status-archived');
  if (badge) {
    badge.className = 'acc-hero-badge status-disabled';
    badge.innerHTML = '<svg class="icn" aria-hidden="true" style="width:11px;height:11px;margin-right:3px;vertical-align:-1.5px"><use href="#ic-close-c"></use></svg>Disabled';
  }
  return r;
};
