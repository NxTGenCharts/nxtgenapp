// ══ NxTGen Journal — accounts-payout-cyclefix.js ═══════════════════════
// Two independent fixes to the funded-account payout workflow:
//
// 1. The Risk & Payout tab's top panel (Payout Goal bar, Trading Days,
//    Payout Eligibility) was reading LIFETIME account stats
//    (_accRiskProfile → _accComputeAnalytics, all trades ever) instead of
//    the CURRENT PAYOUT CYCLE (_accPayoutState → cycle analytics since
//    currentCycleStartDate). That's why those numbers didn't reset after
//    a payout was marked Completed/Rejected even though the cycle itself
//    had correctly restarted underneath. This override swaps the payout
//    goal/trading-days/eligibility numbers (and adds a Current Balance
//    row) to the cycle-scoped versions, and tucks the old lifetime
//    numbers behind a "View All-Time Stats" toggle instead of deleting
//    them. Daily/Max Drawdown stay lifetime-scoped on purpose — those are
//    firm risk limits measured from account inception, not per cycle.
//
// 2. Payout records created by the automated workflow (Mark as
//    Processing) always wrote paymentMethod:'' — the account's configured
//    Payout Method (Settings tab) was never actually copied onto the log
//    entry, so it always showed "—". Same gap in the manual "+ Add
//    Payout" form: its Method field starts blank instead of defaulting to
//    the account's configured method. Both are fixed here.
//
// Loaded LAST, after accounts-payout-disabled.js. Same safe-override
// pattern as the rest of the app.
// ════════════════════════════════════════════════════════════════════

// ── Fix 1: cycle-scoped Risk & Payout panel ─────────────────────────
function _accCycleAllTimeToggle(name) {
  const escName = _accDisabledEscName(name);
  const panel = document.getElementById(`apw-alltime-panel-${escName}`);
  const chevron = document.getElementById(`apw-alltime-chevron-${escName}`);
  if (!panel) return;
  const show = panel.style.display === 'none';
  panel.style.display = show ? '' : 'none';
  if (chevron) chevron.style.transform = show ? 'rotate(90deg)' : '';
}

const _accCycleOrigRiskPanelHtml = window._accRiskPanelHtml;
window._accRiskPanelHtml = function (name) {
  const p = _accRiskProfile(name);
  const t = p.typeInfo;
  // Only Funded (payout-supporting) accounts have a payout cycle to scope
  // to — Evaluation/Live/Paper accounts keep the original panel untouched.
  if (!t.payout || typeof _accPayoutState !== 'function') return _accCycleOrigRiskPanelHtml.apply(this, arguments);
  const s = _accPayoutState(name);
  if (!s.supported) return _accCycleOrigRiskPanelHtml.apply(this, arguments);

  const escName = _accDisabledEscName(name);
  const riskUnset = p.accSize <= 0;

  const leftCol = (t.dailyDD || t.maxDD) ? `
    <div class="acch-detail-risk-col">
      ${t.dailyDD ? _accBarHtml('Daily Drawdown', riskUnset ? 'Set account size' : `$${p.dailyUsed.toFixed(2)} / $${p.dailyLimit.toFixed(2)} used`, p.dailyPct, { unset: riskUnset }) : ''}
      ${t.maxDD ? _accBarHtml('Maximum Drawdown', riskUnset ? 'Set account size' : `$${p.maxUsed.toFixed(2)} / $${p.maxLimit.toFixed(2)} used`, p.maxPct, { unset: riskUnset }) : ''}
    </div>` : '';

  const cyclePayoutCurrent = Math.max(0, s.cycleProfit || 0);
  const cyclePayoutGoal    = s.payoutTarget || 0;
  const cyclePayoutPct     = cyclePayoutGoal > 0 ? Math.min(100, (cyclePayoutCurrent / cyclePayoutGoal) * 100) : 0;

  const rightCol = `
    <div class="acch-detail-risk-col">
      ${_accBarHtml('Payout Goal — Current Cycle', cyclePayoutGoal > 0 ? `$${cyclePayoutCurrent.toFixed(2)} / $${cyclePayoutGoal.toFixed(2)}` : 'Not set', cyclePayoutPct, { unset: cyclePayoutGoal <= 0, color: 'var(--gold)' })}
    </div>`;

  const cycleTradingDays = s.cyc ? s.cyc.tradingDays : 0;
  const eligible = !!(s.targetReached && s.minDaysMet);
  const currentBalance = (typeof s.currentBalance === 'number') ? s.currentBalance : p.accSize;

  return `
    <div class="acch-detail-risk">
      <div class="acc-an-sec-head" style="margin-top:0">Risk &amp; ${_accRiskWord(t)}</div>
      <div class="acch-detail-risk-grid">
        ${leftCol}
        ${rightCol}
      </div>
      <div class="acch-detail-risk-meta">
        <div><span class="k">Current Balance</span><span class="v">$${currentBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div><span class="k">Trading Days — Cycle</span><span class="v">${p.r.minTradingDays > 0 ? `${cycleTradingDays} / ${p.r.minTradingDays} required` : (cycleTradingDays || '—')}</span></div>
        <div><span class="k">Payout Eligibility</span><span class="v" style="color:${eligible ? 'var(--teal)' : 'var(--text2)'}">${eligible ? 'Eligible now' : (cyclePayoutGoal > 0 ? 'Not yet eligible' : 'No threshold set')}</span></div>
        <div><span class="k">Next Payout Date</span><span class="v">${p.r.nextPayoutDate ? new Date(p.r.nextPayoutDate).toLocaleDateString() : '—'}</span></div>
        <div><span class="k">${_accFirmLabel(t)}</span><span class="v">${p.r.firm || '—'}</span></div>
      </div>
      <div class="apw-alltime-toggle" onclick="_accCycleAllTimeToggle('${escName}')">
        <svg class="icn apw-alltime-chevron" aria-hidden="true" id="apw-alltime-chevron-${escName}"><use href="#ic-chevron-right"></use></svg>
        <span>View All-Time Account Stats</span>
      </div>
      <div class="apw-alltime-panel" id="apw-alltime-panel-${escName}" style="display:none">
        <div class="acch-detail-risk-meta">
          <div><span class="k">Lifetime Net Profit</span><span class="v">$${p.targetCurrent.toFixed(2)}</span></div>
          <div><span class="k">Lifetime Trading Days</span><span class="v">${p.m.tradingDays || '—'}</span></div>
          <div><span class="k">Lifetime Payout Progress</span><span class="v">${p.payoutGoal > 0 ? Math.round(p.payoutPct) + '%' : '—'}</span></div>
          <div><span class="k">Lifetime Max Drawdown</span><span class="v">$${p.maxUsed.toFixed(2)}</span></div>
        </div>
      </div>
      <button class="acch-act-btn" style="margin-top:10px" onclick="_openAccRiskSettings('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Edit Risk &amp; ${_accRiskWord(t)} Settings</button>
    </div>`;
};

// ── Fix 2a: automated Processing entries inherit the account's
//    configured Payout Method instead of always writing '' ────────────
const _accCycleOrigMarkProcessing = window.accMarkPayoutProcessing;
if (typeof _accCycleOrigMarkProcessing === 'function') {
  window.accMarkPayoutProcessing = async function (name) {
    const r = await _accCycleOrigMarkProcessing.apply(this, arguments);
    const list = _getCustomAccounts();
    const acc = list.find(a => a.name === name);
    if (acc && acc.activePayoutId) {
      const entry = (_accData.payouts || []).find(x => x.id === acc.activePayoutId);
      if (entry && !entry.paymentMethod) {
        const rd = _accRiskDefaults(acc);
        if (rd.payoutMethod) {
          entry.paymentMethod = rd.payoutMethod;
          await _accSave();
          if (typeof _accActiveName !== 'undefined' && _accActiveName === name) accShowDetail(name);
        }
      }
    }
    return r;
  };
}

// ── Fix 2b: the manual "+ Add Payout" form defaults its Method field to
//    the selected account's configured Payout Method (still freely
//    editable — once the person types their own value it stops
//    following the account dropdown). Also pre-selects the account
//    whose detail view "+ Add Payout" was opened from. ─────────────────
const _accCycleOrigShowPayoutModal = window._showPayoutModal;
if (typeof _accCycleOrigShowPayoutModal === 'function') {
  window._showPayoutModal = function (editIdx) {
    const r = _accCycleOrigShowPayoutModal.apply(this, arguments);
    const isNew = editIdx === null || editIdx === undefined;
    if (!isNew) return r; // editing an existing entry — leave its saved method alone
    const accSel = document.getElementById('acc-p-account');
    const methodInput = document.getElementById('acc-p-method');
    if (!accSel || !methodInput) return r;
    const applyDefaultMethod = () => {
      if (methodInput.dataset.userEdited) return;
      const acc = _getCustomAccounts().find(a => a.name === accSel.value);
      const rd = acc ? _accRiskDefaults(acc) : null;
      methodInput.value = (rd && rd.payoutMethod) ? rd.payoutMethod : '';
    };
    accSel.addEventListener('change', applyDefaultMethod);
    methodInput.addEventListener('input', () => { methodInput.dataset.userEdited = '1'; });
    if (typeof _accActiveName !== 'undefined' && _accActiveName &&
        Array.from(accSel.options).some(o => o.value === _accActiveName)) {
      accSel.value = _accActiveName;
    }
    applyDefaultMethod();
    return r;
  };
}
