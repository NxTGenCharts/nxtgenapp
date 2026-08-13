// ══ NxTGen Journal — accounts-upgrade.js ══════════════════════════════
// Account Tracker redesign: Portfolio Overview, Account Health cards
// (drawdown/target/payout progress), Insights, and an upgraded Payout
// Log summary. Loaded after accounts.js, core-modals-userbar.js and
// accounts-premium.js. Follows the same safe-override pattern used
// throughout the app: `const orig = window.fn; window.fn = function(){...}`.
// ════════════════════════════════════════════════════════════════════

// ── Risk/payout field defaults — every account gets these lazily, real
//    numbers only show once the user sets them or once real trades exist ──
// Paper/Live accounts don't have a prop "firm" — they trade through a
// personal broker, so the label (and placeholder) flips accordingly.
// Funded accounts have a payout goal; Evaluation accounts have a profit
// target instead — the "Risk & ___" / "Rules & ___" headings should say
// whichever one actually applies instead of always saying "Payout".
function _accRiskWord(typeInfo) {
  return typeInfo.payout ? 'Payout' : 'Target';
}

function _accFirmLabel(typeInfo) {
  return (typeInfo.cls === 'paper' || typeInfo.cls === 'live') ? 'Broker' : 'Firm';
}

function _accRiskDefaults(acc) {
  const accSize = parseFloat(acc.size) || 0;
  // Payout threshold is stored as a % of account size (payoutThresholdPct).
  // Older accounts may still have a raw $ value in `payoutThreshold` — migrate
  // that to a percentage on the fly so existing setups keep working.
  let payoutThresholdPct;
  if (acc.payoutThresholdPct !== undefined && acc.payoutThresholdPct !== null && acc.payoutThresholdPct !== '') {
    payoutThresholdPct = parseFloat(acc.payoutThresholdPct);
  } else if (acc.payoutThreshold !== undefined && acc.payoutThreshold !== null && acc.payoutThreshold !== '' && accSize > 0) {
    payoutThresholdPct = (parseFloat(acc.payoutThreshold) / accSize) * 100;
  } else {
    payoutThresholdPct = 0;
  }
  return {
    firm:              acc.firm || '',
    platform:          acc.platform || 'MT5',
    dailyLossLimitPct: (acc.dailyLossLimitPct !== undefined && acc.dailyLossLimitPct !== null && acc.dailyLossLimitPct !== '') ? parseFloat(acc.dailyLossLimitPct) : 5,
    maxLossLimitPct:   (acc.maxLossLimitPct   !== undefined && acc.maxLossLimitPct   !== null && acc.maxLossLimitPct   !== '') ? parseFloat(acc.maxLossLimitPct)   : 10,
    profitTargetPct:   (acc.profitTargetPct   !== undefined && acc.profitTargetPct   !== null && acc.profitTargetPct   !== '') ? parseFloat(acc.profitTargetPct)   : (acc.challengeTarget ? parseFloat(acc.challengeTarget) : 8),
    payoutThresholdPct,
    minTradingDays:    (acc.minTradingDays    !== undefined && acc.minTradingDays    !== null && acc.minTradingDays    !== '') ? parseInt(acc.minTradingDays, 10)  : 0,
    nextPayoutDate:    acc.nextPayoutDate || '',
    // Your share of a payout once the firm pays out — most funders run
    // 80/20, some 85/15 or 90/10. Defaults to 80% to you / 20% to the firm.
    profitSplitPct:    (acc.profitSplitPct    !== undefined && acc.profitSplitPct    !== null && acc.profitSplitPct    !== '') ? parseFloat(acc.profitSplitPct)     : 80,
    // How you receive a payout from this firm (Rise, Crypto, Wire, etc).
    // Empty until the user sets one — new payouts logged for this account
    // default to it, but existing payout records never get overwritten.
    payoutMethod:      acc.payoutMethod || '',
  };
}

// Today's realized P&L for an account, used as a proxy for "daily drawdown
// used" — the journal only has closed-trade data, so this is the closest
// real number available (not fabricated, not simulated).
function _accTodayNetDollars(name, accSize) {
  const today = localToday();
  const at = (typeof trades !== 'undefined' ? trades : []).filter(t => t.account === name && t.date === today);
  return at.reduce((s, t) => s + toPnlDollars(t, accSize), 0);
}

// Full risk/health computation for one account — single source of truth
// for the card, the portfolio rollup, and the insights feed.
function _accRiskProfile(name) {
  const acc = _getCustomAccounts().find(a => a.name === name) || {};
  const m = _accComputeAnalytics(name);
  const r = _accRiskDefaults(acc);
  const accSize = m.accSize;
  const typeInfo = _accTypeInfo(acc.type);

  const todayNet   = _accTodayNetDollars(name, accSize);
  const dailyUsed  = Math.max(0, -todayNet);
  const dailyLimit = (typeInfo.dailyDD && accSize > 0) ? accSize * r.dailyLossLimitPct / 100 : 0;
  const dailyPct   = dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0;

  const maxUsed  = m.maxDD;
  const maxLimit = (typeInfo.maxDD && accSize > 0) ? accSize * r.maxLossLimitPct / 100 : 0;
  const maxPct   = maxLimit > 0 ? Math.min(100, (maxUsed / maxLimit) * 100) : 0;

  const targetCurrent = Math.max(0, m.netDollars);
  const targetGoal    = (typeInfo.target && accSize > 0) ? accSize * r.profitTargetPct / 100 : 0;
  const targetPct     = targetGoal > 0 ? Math.min(100, (targetCurrent / targetGoal) * 100) : 0;

  const payoutCurrent = Math.max(0, m.netDollars);
  const payoutGoal    = (typeInfo.payout && accSize > 0) ? accSize * r.payoutThresholdPct / 100 : 0;
  const payoutPct     = payoutGoal > 0 ? Math.min(100, (payoutCurrent / payoutGoal) * 100) : 0;
  const payoutEligible = payoutGoal > 0 && payoutCurrent >= payoutGoal &&
    (r.minTradingDays <= 0 || m.tradingDays >= r.minTradingDays);

  const breach = dailyPct >= 100 || maxPct >= 100;
  const atRisk = !breach && (dailyPct >= 80 || maxPct >= 80);
  const caution = !breach && !atRisk && (dailyPct >= 55 || maxPct >= 55);

  const riskLevel = breach ? 'breach' : atRisk ? 'risk' : caution ? 'caution' : 'healthy';

  return {
    acc, m, r, accSize, typeInfo,
    todayNet, dailyUsed, dailyLimit, dailyPct,
    maxUsed, maxLimit, maxPct,
    targetCurrent, targetGoal, targetPct,
    payoutCurrent, payoutGoal, payoutPct, payoutEligible,
    riskLevel,
  };
}

function _accBarColor(pct) {
  if (pct >= 100) return 'var(--red)';
  if (pct >= 80)  return 'var(--red)';
  if (pct >= 55)  return 'var(--gold)';
  return 'var(--teal)';
}

function _accBarHtml(label, usedLabel, pct, opts) {
  opts = opts || {};
  const color = opts.color || _accBarColor(pct);
  const show  = opts.unset ? '—' : (Math.round(pct) + '%');
  return `
    <div class="acch-bar-row">
      <div class="acch-bar-head">
        <span class="acch-bar-label">${label}</span>
        <span class="acch-bar-used">${usedLabel}</span>
      </div>
      <div class="acch-bar-track">
        <div class="acch-bar-fill" style="width:${opts.unset ? 0 : Math.min(100,pct)}%;background:${color}"></div>
      </div>
      <div class="acch-bar-pct" style="color:${opts.unset ? 'var(--text3)' : color}">${show}</div>
    </div>`;
}

// ── Redesigned account card ────────────────────────────────────────────
const _accUpgOrigRenderGrid = window._renderAccGrid;
window._renderAccGrid = function (...args) {
  const grid = document.getElementById('accounts-grid');
  const accounts = _getCustomAccounts();
  if (!grid || !accounts.length) return _accUpgOrigRenderGrid.apply(this, args);

  const active   = accounts.filter(a => a.status !== 'archived' && a.status !== 'deleted');
  const archived = accounts.filter(a => a.status === 'archived');

  const statusPill = (p) => {
    const isArchived = p.acc.status === 'archived';
    const isChalDone = _accChallengeIsComplete(p.acc, p.m.netDollars, p.accSize);
    let primary, cls;
    if (isArchived)      { primary = isChalDone ? 'Passed' : 'Archived'; cls = 'archived'; }
    else if (p.payoutEligible)  { primary = 'Payout Eligible'; cls = 'healthy'; }
    else if (p.riskLevel === 'breach') { primary = 'At Risk'; cls = 'risk'; }
    else if (p.riskLevel === 'risk')   { primary = 'Near Limit'; cls = 'risk'; }
    else if (isChalDone) { primary = 'Target Reached'; cls = 'healthy'; }
    else if (_accTypeNorm(p.acc.type) === 'Evaluation') { primary = 'Evaluation'; cls = 'active'; }
    else if (p.acc.type === 'Funded')    { primary = p.riskLevel === 'caution' ? 'Caution' : 'Healthy'; cls = p.riskLevel === 'caution' ? 'caution' : 'healthy'; }
    else { primary = 'Active'; cls = 'active'; }
    return `<span class="acch-status acch-status-${cls}">${primary}</span>`;
  };

  const renderCard = (p) => {
    const { acc, m, r, accSize } = p;
    const name = acc.name;
    const escName = name.replace(/'/g, "\\'");
    const isArchived = acc.status === 'archived';
    const wr = m.at.length ? m.wr.toFixed(1) + '%' : '—';
    const balance = accSize > 0 ? accSize + m.netDollars : m.netDollars;
    const pnlColor = m.netDollars >= 0 ? 'var(--teal)' : 'var(--red)';
    const fmt = (d) => (d >= 0 ? '+$' : '-$') + Math.abs(d).toFixed(2);
    const fmtPct = (d) => (d >= 0 ? '+' : '-') + Math.abs(accSize > 0 ? (d / accSize) * 100 : 0).toFixed(2) + '%';
    const cardPnlMode = acc.pnlMode === '%' ? '%' : '$';
    const pnlDisplay = (cardPnlMode === '%' && accSize > 0) ? fmtPct(m.netDollars) : fmt(m.netDollars);

    const mt5cfg = acc.mt5;
    const mt5Enabled = !!mt5cfg?.enabled;
    const mt5Status = mt5cfg?.lastSyncStatus || 'never';
    const mt5LastSync = mt5cfg?.lastSync ? new Date(mt5cfg.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

    const typeInfo = p.typeInfo;
    const identity = `
      <div class="acch-id-row">
        <div class="acch-id-left">
          <div class="acch-name">${name}</div>
          <div class="acch-sub"><span class="acch-type-tag acch-type-tag-${typeInfo.cls}">${typeInfo.label}</span>${_accTypeNorm(acc.type) === 'Evaluation' && acc.challengePhase ? ' · ' + acc.challengePhase : ''}${r.firm ? ' · ' + r.firm : ''}</div>
        </div>
        ${statusPill(p)}
      </div>
      <div class="acch-meta-row">
        <div class="acch-meta"><span class="k">Size</span><span class="v">${accSize > 0 ? '$' + accSize.toLocaleString() : '—'}</span></div>
        <div class="acch-meta"><span class="k">Platform</span><span class="v">${r.platform || '—'}</span></div>
        <div class="acch-meta"><span class="k">Trades</span><span class="v">${m.at.length || '—'}</span></div>
      </div>`;

    const perf = `
      <div class="acch-perf-row">
        <div class="acch-perf"><span class="k">Balance</span><span class="v">${accSize > 0 ? '$' + balance.toFixed(2) : '—'}</span></div>
        <div class="acch-perf"><span class="k">Net PnL${accSize > 0 ? `<button class="acch-pnl-toggle" title="Switch between $ and %" onclick="event.stopPropagation();_accToggleCardPnlMode('${escName}')">${cardPnlMode === '%' ? '$' : '%'}</button>` : ''}</span><span class="v" style="color:${pnlColor}">${m.at.length ? pnlDisplay : '—'}</span></div>
        <div class="acch-perf"><span class="k">Win Rate</span><span class="v">${wr}</span></div>
      </div>`;

    const riskUnset = accSize <= 0;
    const anyRiskMetric = typeInfo.dailyDD || typeInfo.maxDD || typeInfo.target || typeInfo.payout;
    const riskSection = !anyRiskMetric ? `
      <div class="acch-risk-none">
        <svg class="icn" aria-hidden="true"><use href="#ic-shield"></use></svg>
        <span>${typeInfo.label} accounts have no drawdown limits, profit targets, or payout goals.</span>
      </div>` : `
      <div class="acch-risk-head">
        <span>ACCOUNT HEALTH</span>
        <span class="acch-risk-badge acch-risk-${p.riskLevel}">${{breach:'AT RISK',risk:'NEAR LIMIT',caution:'CAUTION',healthy:'HEALTHY'}[p.riskLevel]}</span>
      </div>
      ${typeInfo.dailyDD ? _accBarHtml('Daily Drawdown', riskUnset ? 'Set size' : `$${p.dailyUsed.toFixed(0)} / $${p.dailyLimit.toFixed(0)}`, p.dailyPct, { unset: riskUnset }) : ''}
      ${typeInfo.maxDD ? _accBarHtml('Max Drawdown', riskUnset ? 'Set size' : `$${p.maxUsed.toFixed(0)} / $${p.maxLimit.toFixed(0)}`, p.maxPct, { unset: riskUnset }) : ''}
      ${typeInfo.target ? _accBarHtml('Profit Target', riskUnset ? 'Set size' : `$${p.targetCurrent.toFixed(0)} / $${p.targetGoal.toFixed(0)}`, p.targetPct, { unset: riskUnset, color: 'var(--blue)' }) : ''}
      ${typeInfo.payout ? _accBarHtml('Payout Goal', p.payoutGoal > 0 ? `$${p.payoutCurrent.toFixed(0)} / $${p.payoutGoal.toFixed(0)}` : 'Not set', p.payoutPct, { unset: p.payoutGoal <= 0, color: 'var(--gold)' }) : ''}
    `;

    const mt5Action = mt5Enabled
      ? `<button class="acch-act-btn acch-act-connected" onclick="event.stopPropagation();mt5OpenModal('${escName}')" title="${mt5LastSync ? 'Last synced ' + mt5LastSync : 'MT5 connected'}">
           <svg class="icn" aria-hidden="true"><use href="#ic-check-c"></use></svg> MT5 ${mt5Status === 'ok' ? 'Connected' : mt5Status === 'error' ? 'Error' : 'Pending'}
         </button>`
      : `<button class="acch-act-btn" onclick="event.stopPropagation();mt5OpenModal('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-plug"></use></svg> Connect MT5</button>`;

    const actions = isArchived ? `
      <div class="acch-actions">
        <button class="acch-act-btn" onclick="event.stopPropagation();_restoreAccountByName('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Restore</button>
      </div>` : `
      <div class="acch-actions">
        <button class="acch-act-btn acch-act-primary" onclick="event.stopPropagation();accShowDetail('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-eye"></use></svg> View Details</button>
        <button class="acch-act-btn" onclick="event.stopPropagation();accAddTradeFor('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-plus"></use></svg> Add Trade</button>
        ${mt5Action}
        <button class="acch-act-btn acch-act-icon" onclick="event.stopPropagation();_openAccRiskSettings('${escName}')" title="Edit risk & payout settings"><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg></button>
      </div>`;

    return `
    <div class="acch-card acch-card-t-${typeInfo.cls}${isArchived ? ' acch-card-archived' : ''}" onclick="${isArchived ? '' : `accShowDetail('${escName}')`}">
      ${identity}
      ${perf}
      <div class="acch-divider"></div>
      ${riskSection}
      ${actions}
    </div>`;
  };

  const profiles = (list) => list.map(a => _accRiskProfile(a.name));

  const activeVisible = _accSectionVisible('active');

  let html = activeVisible
    ? `<div class="acch-grid">${active.length ? profiles(active).map(renderCard).join('') : '<div class="acc-empty">No active accounts yet — click <strong>Manage Accounts</strong> to add one.</div>'}</div>`
    : `<div class="acc-empty">Active accounts hidden. <button class="acc-section-toggle-btn" onclick="_accToggleSection('active')">Show</button></div>`;

  if (!active.length && !archived.length) {
    html = `<div class="acc-empty">No accounts yet — click <strong><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Manage Accounts</strong> to add one.</div>`;
  }

  grid.innerHTML = html;

  // Archived Accounts render into their own section at the bottom of the page
  const archMount = document.getElementById('acc-archived-section');
  if (archMount) {
    if (!archived.length) {
      archMount.innerHTML = '';
    } else {
      const archivedVisible = _accSectionVisible('archived');
      archMount.innerHTML = `
        <div class="acch-grid-head" style="margin-top:24px">
          <span class="acch-grid-title">Archived Accounts (${archived.length})</span>
          <button class="acc-section-toggle-btn" title="${archivedVisible ? 'Hide' : 'Show'} archived accounts"
            onclick="_accToggleSection('archived')">
            <svg class="icn" aria-hidden="true" style="transform:rotate(${archivedVisible ? 90 : 0}deg);transition:transform .15s"><use href="#ic-chevron-right"></use></svg>
            ${archivedVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        ${archivedVisible ? `<div class="acch-grid">${profiles(archived).map(renderCard).join('')}</div>` : ''}`;
    }
  }
};

async function _accToggleCardPnlMode(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  list[idx].pnlMode = (list[idx].pnlMode === '%') ? '$' : '%';
  await _saveCustomAccounts(list);
  if (typeof _renderAccGrid === 'function') _renderAccGrid();
}

function accAddTradeFor(name) {
  if (typeof _accActiveName !== 'undefined') _accActiveName = name;
  if (typeof openModal === 'function') openModal({ account: name });
}

// ── Risk & payout settings modal ───────────────────────────────────────
function _openAccRiskSettings(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const r = _accRiskDefaults(list[idx]);
  const t = _accTypeInfo(list[idx].type);
  const existing = document.getElementById('acc-risk-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'acc-risk-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  const ddRow = (t.dailyDD || t.maxDD) ? `
      <div class="wl-form-2col">
        ${t.dailyDD ? `<div class="wl-form-row"><label class="wl-form-label">Daily Loss Limit (%)</label><input type="number" class="wl-form-input" id="ars-daily" value="${r.dailyLossLimitPct}" min="0" step="0.5"></div>` : ''}
        ${t.maxDD ? `<div class="wl-form-row"><label class="wl-form-label">Max Loss Limit (%)</label><input type="number" class="wl-form-input" id="ars-max" value="${r.maxLossLimitPct}" min="0" step="0.5"></div>` : ''}
      </div>` : '';
  const targetPayoutRow = (t.target || t.payout) ? `
      <div class="wl-form-2col">
        ${t.target ? `<div class="wl-form-row"><label class="wl-form-label">Profit Target (%)</label><input type="number" class="wl-form-input" id="ars-target" value="${r.profitTargetPct}" min="0" step="0.5"></div>` : ''}
        ${t.payout ? `<div class="wl-form-row"><label class="wl-form-label">Payout Threshold (%)</label><input type="number" class="wl-form-input" id="ars-payout" value="${r.payoutThresholdPct || ''}" min="0" step="0.5" placeholder="e.g. 6"></div>` : ''}
      </div>` : '';
  const _apwDt = (typeof _accPayoutDateTimeValue === 'function') ? _accPayoutDateTimeValue(list[idx]) : null;
  const _apwTz = (typeof getUserTz === 'function') ? getUserTz() : null;
  const nextDateVal = (_apwDt && _apwTz && typeof _accZonedDateInputValue === 'function') ? _accZonedDateInputValue(_apwDt, _apwTz) : r.nextPayoutDate;
  const nextTimeVal = (_apwDt && _apwTz && typeof _accZonedTimeInputValue === 'function') ? _accZonedTimeInputValue(_apwDt, _apwTz) : (list[idx].nextPayoutTime || '00:00');
  const methodOptions = (typeof NXTGEN_PAYOUT_METHODS !== 'undefined' ? NXTGEN_PAYOUT_METHODS : []);
  const payoutMetaRow = t.payout ? `
      <div class="wl-form-2col">
        <div class="wl-form-row"><label class="wl-form-label">Min Trading Days</label><input type="number" class="wl-form-input" id="ars-mindays" value="${r.minTradingDays || ''}" min="0" placeholder="e.g. 5"></div>
        <div class="wl-form-row"><label class="wl-form-label">Your Profit Split (%)</label><input type="number" class="wl-form-input" id="ars-split" value="${r.profitSplitPct}" min="0" max="100" step="1" placeholder="e.g. 80"></div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row">
          <label class="wl-form-label">Payout Method</label>
          <select class="wl-form-select" id="ars-method">
            <option value=""${!r.payoutMethod ? ' selected' : ''}>Not set</option>
            ${methodOptions.map(m => `<option value="${m}"${r.payoutMethod===m?' selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="wl-form-row"><label class="wl-form-label">Next Payout Date</label><input type="date" class="wl-form-input" id="ars-nextdate" value="${nextDateVal}"></div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row"><label class="wl-form-label">Next Payout Time</label><input type="time" class="wl-form-input" id="ars-nexttime" value="${nextTimeVal}"></div>
      </div>` : '';
  const noRulesNote = (!ddRow && !targetPayoutRow) ? `<div class="acch-ov-health-sub" style="margin:-2px 0 2px">${t.label} accounts have no drawdown limits, profit targets, or payout goals — just ${_accFirmLabel(t)} and Platform below.</div>` : '';
  const isPaperOrLiveModal = t.cls === 'paper' || t.cls === 'live';
  const modalTitle = isPaperOrLiveModal ? `Account Settings — ${name}` : `Risk &amp; ${_accRiskWord(t)} — ${name}`;
  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:440px">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-shield"></use></svg> ${modalTitle}</span>
      <button onclick="document.getElementById('acc-risk-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="gap:10px">
      ${noRulesNote}
      <div class="wl-form-2col">
        <div class="wl-form-row"><label class="wl-form-label">${_accFirmLabel(t)}</label><input type="text" class="wl-form-input" id="ars-firm" value="${r.firm}" placeholder="${_accFirmLabel(t) === 'Broker' ? 'e.g. Deriv, IC Markets' : 'e.g. GOAT Funded'}"></div>
        <div class="wl-form-row"><label class="wl-form-label">Platform</label><input type="text" class="wl-form-input" id="ars-platform" value="${r.platform}" placeholder="MT5"></div>
      </div>
      ${ddRow}
      ${targetPayoutRow}
      ${payoutMetaRow}
      <div class="wl-form-actions">
        <button class="wl-btn-secondary" onclick="document.getElementById('acc-risk-overlay').remove()">Cancel</button>
        <button class="wl-btn-primary" onclick="_saveAccRiskSettings('${name.replace(/'/g, "\\'")}')">Save</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

async function _saveAccRiskSettings(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const t = _accTypeInfo(list[idx].type);
  const isPaperOrLive = t.cls === 'paper' || t.cls === 'live';
  const val = id => document.getElementById(id)?.value ?? '';
  list[idx].firm              = val('ars-firm');
  list[idx].platform          = val('ars-platform') || 'MT5';
  list[idx].dailyLossLimitPct = parseFloat(val('ars-daily')) || 0;
  list[idx].maxLossLimitPct   = parseFloat(val('ars-max')) || 0;
  list[idx].profitTargetPct   = parseFloat(val('ars-target')) || 0;
  list[idx].payoutThresholdPct = parseFloat(val('ars-payout')) || 0;
  delete list[idx].payoutThreshold; // legacy $ field, superseded by payoutThresholdPct
  list[idx].minTradingDays    = parseInt(val('ars-mindays'), 10) || 0;
  const splitInput = parseFloat(val('ars-split'));
  list[idx].profitSplitPct    = (!isNaN(splitInput) && splitInput > 0) ? Math.min(100, splitInput) : 80;
  list[idx].payoutMethod      = val('ars-method') || '';
  list[idx].nextPayoutDate    = val('ars-nextdate') || '';
  list[idx].nextPayoutTime    = val('ars-nexttime') || '00:00';
  if (typeof _accFreezePayoutAt === 'function') {
    list[idx].nextPayoutAt = _accFreezePayoutAt(list[idx].nextPayoutDate, list[idx].nextPayoutTime) || list[idx].nextPayoutAt || null;
  }
  await _saveCustomAccounts(list);
  document.getElementById('acc-risk-overlay')?.remove();
  showToast(isPaperOrLive ? 'Account settings saved ✓' : 'Risk & payout settings saved ✓', 'restore');
  buildAccounts();
  if (typeof _accActiveName !== 'undefined' && _accActiveName === name) {
    _accPendingDetailTab = 'settings';
    accShowDetail(name);
  }
}

// ── Portfolio Overview ──────────────────────────────────────────────────
function _renderPortfolioOverview() {
  const mount = document.getElementById('acc-portfolio-overview');
  if (!mount) return;
  const active = _getActiveAccounts();
  if (!active.length) { mount.innerHTML = ''; return; }

  const profiles = active.map(a => _accRiskProfile(a.name));
  const totalCapital = profiles.reduce((s, p) => s + p.accSize, 0);
  const totalPnl     = profiles.reduce((s, p) => s + p.m.netDollars, 0);
  const atRisk       = profiles.filter(p => p.riskLevel === 'risk' || p.riskLevel === 'breach').length;
  const totalPayouts = (_accData.payouts || []).filter(p => p.status === 'Received').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const wins  = profiles.reduce((s, p) => s + p.m.wins.length, 0);
  const total = profiles.reduce((s, p) => s + p.m.at.length, 0);
  const combinedWR = total ? (wins / total * 100) : null;

  const healthy = atRisk === 0;
  const healthMsg = healthy
    ? (active.length === 1 ? 'Your active account is within its risk limits.' : `All ${active.length} active accounts are within their risk limits.`)
    : `${atRisk} of ${active.length} active account${active.length === 1 ? '' : 's'} ${atRisk === 1 ? 'is' : 'are'} near a risk limit.`;

  const chip = (label, val, color) => `
    <div class="acch-ov-chip">
      <div class="acch-ov-chip-label">${label}</div>
      <div class="acch-ov-chip-val" style="${color ? `color:${color}` : ''}">${val}</div>
    </div>`;

  mount.innerHTML = `
    <div class="acch-ov-row">
      ${chip('Active Accounts', active.length)}
      ${chip('Total Capital', '$' + totalCapital.toLocaleString())}
      ${chip('Total PnL', (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2), totalPnl >= 0 ? 'var(--teal)' : 'var(--red)')}
      ${chip('Combined Win Rate', combinedWR !== null ? combinedWR.toFixed(1) + '%' : '—')}
      ${chip('Accounts at Risk', atRisk, atRisk > 0 ? 'var(--red)' : 'var(--teal)')}
      ${chip('Total Payouts', '$' + totalPayouts.toLocaleString())}
    </div>
    <div class="acch-ov-health ${healthy ? 'ok' : 'warn'}">
      <svg class="icn" aria-hidden="true"><use href="#${healthy ? 'ic-shield' : 'ic-warning'}"></use></svg>
      <div><strong>Portfolio Health — ${healthy ? 'Healthy' : 'Needs Attention'}</strong><div class="acch-ov-health-sub">${healthMsg}</div></div>
    </div>`;
}

// ── Insights & Alerts — derived from real account/trade data only ──────
function _renderAccInsights() {
  const mount = document.getElementById('acc-insights');
  if (!mount) return;
  const active = _getActiveAccounts();
  if (!active.length) { mount.innerHTML = ''; return; }

  const profiles = active.map(a => _accRiskProfile(a.name));
  const insights = [];

  profiles.forEach(p => {
    if (p.accSize > 0 && p.maxPct >= 40) {
      insights.push({ icon: 'ic-warning', tone: p.maxPct >= 80 ? 'red' : 'gold', text: `Your ${p.acc.name} account is ${Math.round(p.maxPct)}% into its maximum drawdown limit.` });
    }
    if (p.accSize > 0 && p.dailyPct >= 55) {
      insights.push({ icon: 'ic-siren', tone: p.dailyPct >= 80 ? 'red' : 'gold', text: `Your ${p.acc.name} account is approaching its daily loss limit (${Math.round(p.dailyPct)}% used).` });
    }
    if (p.m.at.length >= 2 && p.m.wr === 100) {
      insights.push({ icon: 'ic-trophy', tone: 'teal', text: `Your ${p.acc.name} account has a 100% win rate across ${p.m.at.length} trades.` });
    }
    if (p.payoutGoal > 0 && !p.payoutEligible && p.payoutCurrent < p.payoutGoal) {
      const remaining = p.payoutGoal - p.payoutCurrent;
      if (remaining > 0 && p.payoutCurrent > 0) {
        insights.push({ icon: 'ic-target', tone: 'blue', text: `You are $${remaining.toFixed(0)} away from ${p.acc.name}'s next payout target.` });
      }
    }
    if (p.payoutEligible) {
      insights.push({ icon: 'ic-check-c', tone: 'teal', text: `${p.acc.name} has hit its payout threshold and is eligible for a payout request.` });
    }
    if (p.acc.mt5?.enabled) {
      const last = p.acc.mt5.lastSync ? new Date(p.acc.mt5.lastSync) : null;
      const hoursSince = last ? (Date.now() - last.getTime()) / 36e5 : Infinity;
      if (hoursSince > 24) insights.push({ icon: 'ic-cloud-off', tone: 'gold', text: `${p.acc.name} has not been synced in the last 24 hours.` });
    }
  });

  if (!insights.length) { mount.innerHTML = ''; return; }

  mount.innerHTML = `
    <div class="sec-head" style="margin-bottom:8px">Account Alerts &amp; Insights</div>
    <div class="acch-insights-list">
      ${insights.slice(0, 6).map(i => `
        <div class="acch-insight acch-insight-${i.tone}">
          <svg class="icn" aria-hidden="true"><use href="#${i.icon}"></use></svg>
          <span>${i.text}</span>
        </div>`).join('')}
    </div>`;
}

// ── Upgraded Payout Log summary ─────────────────────────────────────────
const _accUpgOrigRenderPayoutLog = window._renderPayoutLog;
window._renderPayoutLog = function (...args) {
  const r = _accUpgOrigRenderPayoutLog.apply(this, args);
  _renderPayoutSummary();
  return r;
};

function _renderPayoutSummary() {
  const mount = document.getElementById('acc-payout-summary');
  if (!mount) return;
  const rows = _accData.payouts || [];
  if (!rows.length) {
    mount.innerHTML = `<div class="acch-payout-empty">
      <svg class="icn" aria-hidden="true"><use href="#ic-receipt"></use></svg>
      <div><strong>No payouts recorded yet</strong><div class="acch-ov-health-sub">Add your first payout to track your funded trading progress.</div></div>
      <button class="wl-add-week-btn" onclick="accAddPayout()">＋ Add First Payout</button>
    </div>`;
    return;
  }
  const received = rows.filter(p => p.status === 'Received');
  const total = received.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const now = new Date();
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const thisQ = received.filter(p => new Date(p.date) >= qStart).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const nextExpected = (_getCustomAccounts() || [])
    .map(a => a.nextPayoutDate).filter(Boolean).sort()[0];

  const chip = (label, val) => `<div class="acch-ov-chip"><div class="acch-ov-chip-label">${label}</div><div class="acch-ov-chip-val">${val}</div></div>`;
  mount.innerHTML = `<div class="acch-ov-row">
    ${chip('Total Payouts', '$' + total.toLocaleString())}
    ${chip('This Quarter', '$' + thisQ.toLocaleString())}
    ${chip('Next Expected Payout', nextExpected ? new Date(nextExpected).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '—')}
  </div>`;
}

// ── Account detail view — rebuild into tabs (Overview / Risk / Trades /
//    Payouts / Settings), reusing the nodes the original render produced
//    so none of the existing hero/KPI/equity-curve/trade-log logic is
//    duplicated — we just regroup it after the fact.
// _accPendingDetailTab lets a caller (e.g. after saving Account Settings)
// request which tab the rebuilt view should land on, instead of always
// resetting to Overview. Consumed once, then cleared, by _accEnhanceDetailView.
let _accPendingDetailTab = null;
const _accUpgOrigShowDetail = window.accShowDetail;
window.accShowDetail = function (name, ...rest) {
  const r = _accUpgOrigShowDetail.call(this, name, ...rest);
  requestAnimationFrame(() => _accEnhanceDetailView(name));
  return r;
};

function _accRiskPanelHtml(name) {
  const p = _accRiskProfile(name);
  const riskUnset = p.accSize <= 0;
  const t = p.typeInfo;
  const leftCol = (t.dailyDD || t.maxDD) ? `
        <div class="acch-detail-risk-col">
          ${t.dailyDD ? _accBarHtml('Daily Drawdown', riskUnset ? 'Set account size' : `$${p.dailyUsed.toFixed(2)} / $${p.dailyLimit.toFixed(2)} used`, p.dailyPct, { unset: riskUnset }) : ''}
          ${t.maxDD ? _accBarHtml('Maximum Drawdown', riskUnset ? 'Set account size' : `$${p.maxUsed.toFixed(2)} / $${p.maxLimit.toFixed(2)} used`, p.maxPct, { unset: riskUnset }) : ''}
        </div>` : '';
  const rightCol = (t.target || t.payout) ? `
        <div class="acch-detail-risk-col">
          ${t.target ? _accBarHtml('Profit Target', riskUnset ? 'Set account size' : `$${p.targetCurrent.toFixed(2)} / $${p.targetGoal.toFixed(2)}`, p.targetPct, { unset: riskUnset, color: 'var(--blue)' }) : ''}
          ${t.payout ? _accBarHtml('Payout Goal', p.payoutGoal > 0 ? `$${p.payoutCurrent.toFixed(2)} / $${p.payoutGoal.toFixed(2)}` : 'Not set', p.payoutPct, { unset: p.payoutGoal <= 0, color: 'var(--gold)' }) : ''}
        </div>` : '';
  if (!leftCol && !rightCol) {
    return `
    <div class="acch-detail-risk">
      <div class="acc-an-sec-head" style="margin-top:0">Risk &amp; ${_accRiskWord(t)}</div>
      <div class="acch-risk-none">
        <svg class="icn" aria-hidden="true"><use href="#ic-shield"></use></svg>
        <span>${t.label} accounts have no drawdown limits, profit targets, or payout goals.</span>
      </div>
      <button class="acch-act-btn" style="margin-top:10px" onclick="_openAccRiskSettings('${name.replace(/'/g, "\\'")}')"><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Edit Account Settings</button>
    </div>`;
  }
  return `
    <div class="acch-detail-risk">
      <div class="acc-an-sec-head" style="margin-top:0">Risk &amp; ${_accRiskWord(t)}</div>
      <div class="acch-detail-risk-grid">
        ${leftCol}
        ${rightCol}
      </div>
      <div class="acch-detail-risk-meta">
        ${t.payout ? `<div><span class="k">Trading Days</span><span class="v">${p.r.minTradingDays > 0 ? `${p.m.tradingDays} / ${p.r.minTradingDays} required` : (p.m.tradingDays || '—')}</span></div>
        <div><span class="k">Payout Eligibility</span><span class="v" style="color:${p.payoutEligible ? 'var(--teal)' : 'var(--text2)'}">${p.payoutEligible ? 'Eligible now' : (p.payoutGoal > 0 ? 'Not yet eligible' : 'No threshold set')}</span></div>
        <div><span class="k">Next Payout Date</span><span class="v">${p.r.nextPayoutDate ? new Date(p.r.nextPayoutDate).toLocaleDateString() : '—'}</span></div>` : ''}
        <div><span class="k">${_accFirmLabel(t)}</span><span class="v">${p.r.firm || '—'}</span></div>
      </div>
      <button class="acch-act-btn" style="margin-top:10px" onclick="_openAccRiskSettings('${name.replace(/'/g, "\\'")}')"><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Edit Risk &amp; ${_accRiskWord(t)} Settings</button>
    </div>`;
}

function _accPayoutsTabHtml(name) {
  const rows = (_accData.payouts || []).filter(p => p.account === name).sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.filter(p => p.status === 'Received').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  if (!rows.length) {
    return `<div class="acch-payout-empty">
      <svg class="icn" aria-hidden="true"><use href="#ic-receipt"></use></svg>
      <div><strong>No payouts recorded for ${name}</strong><div class="acch-ov-health-sub">Add a payout once this account pays out.</div></div>
      <button class="wl-add-week-btn" onclick="accClosePayoutModalIfOpen();accAddPayout()">＋ Add Payout</button>
    </div>`;
  }
  return `
    <div class="acch-payout-redesign">
      <div class="acch-ov-row" style="grid-template-columns:1fr 1fr;margin-bottom:14px">
        <div class="acch-ov-chip"><div class="acch-ov-chip-label">Total Received</div><div class="acch-ov-chip-val">$${total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
        <div class="acch-ov-chip"><div class="acch-ov-chip-label">Payouts Logged</div><div class="acch-ov-chip-val">${rows.length}</div></div>
      </div>
      <div class="data-table-wrap acch-payout-table-wrap">
        <table class="data-table acch-payout-table">
          <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Method</th></tr></thead>
          <tbody>
            ${rows.map(p => `<tr>
              <td class="mono acch-payout-date">${_accFmtPayoutRowDate(p.date)}</td>
              <td class="outcome-win mono acch-payout-amount">$${parseFloat(p.amount||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td><span class="pill ${_accPayoutStatusPillClass(p.status)}">${p.status}</span></td>
              <td class="acch-payout-method">${p.paymentMethod ? `<svg class="icn" aria-hidden="true"><use href="#ic-card"></use></svg><span>${p.paymentMethod}</span>` : '<span class="acch-payout-method-empty">—</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button class="wl-add-week-btn" style="margin-top:10px" onclick="accAddPayout()">＋ Add Payout</button>
    </div>`;
}

function _accSettingsTabHtml(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  const acc = list[idx] || {};
  const r = _accRiskDefaults(acc);
  const accSize = parseFloat(acc.size) || 0;
  const mt5On = !!acc.mt5?.enabled;
  const mt5Status = acc.mt5?.lastSyncStatus || 'never';
  const isArchived = acc.status === 'archived';
  const t = _accTypeInfo(acc.type);
  const row = (k, v) => `<div class="acch-settings-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const rulesRows = [
    t.dailyDD ? row('Daily Loss Limit', r.dailyLossLimitPct + '%') : '',
    t.maxDD   ? row('Max Loss Limit', r.maxLossLimitPct + '%') : '',
    t.target  ? row('Profit Target', r.profitTargetPct + '%') : '',
    t.payout  ? row('Payout Threshold', r.payoutThresholdPct > 0 ? r.payoutThresholdPct + '%' : 'Not set') : '',
    t.payout  ? row('Min Trading Days', r.minTradingDays || '—') : '',
    t.payout  ? row('Profit Split', `${r.profitSplitPct}% you / ${100 - r.profitSplitPct}% firm`) : '',
    t.payout  ? row('Payout Method', r.payoutMethod || 'Not set') : '',
  ].join('');
  const isPaperOrLive = t.cls === 'paper' || t.cls === 'live';
  const firmLabel = _accFirmLabel(t);
  const escName = name.replace(/'/g, "\\'");
  const firmRow = `<div class="acch-settings-row">
      <span class="k">${firmLabel}</span>
      <span class="v acch-settings-editable">
        ${r.firm || '—'}
        <button class="acch-settings-edit-btn" title="Edit ${firmLabel}" onclick="_openAccRiskSettings('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
      </span>
    </div>`;
  return `
    <div class="acch-settings-block">
      <div class="acch-settings-title">Account</div>
      ${firmRow}
      ${row('Type', acc.type ? t.label : '—')}
      ${_accTypeNorm(acc.type) === 'Evaluation' ? row('Phase', acc.challengePhase || 'Phase 1') : ''}
      ${row('Account Size', accSize > 0 ? '$' + accSize.toLocaleString() : 'Not set')}
      ${row('Platform', r.platform || '—')}
      ${row('PnL Display', (acc.pnlMode || '$') === '$' ? '$ USD' : '% Pct')}
      <button class="acch-act-btn" style="margin-top:8px" onclick="_openManageAccounts()"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit Name / Type / Size</button>
    </div>
    ${isPaperOrLive ? '' : `
    <div class="acch-settings-block">
      <div class="acch-settings-title">Rules &amp; ${_accRiskWord(t)}</div>
      ${rulesRows || `<div class="acch-ov-health-sub" style="padding:2px 0 4px">${t.label} accounts have no rules or payout goal to configure.</div>`}
      <button class="acch-act-btn" style="margin-top:8px" onclick="_openAccRiskSettings('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Edit Rules &amp; ${_accRiskWord(t)}</button>
    </div>`}
    <div class="acch-settings-block">
      <div class="acch-settings-title">MT5 Connection</div>
      ${row('Status', mt5On ? ({ok:'Live',error:'Sync Error',syncing:'Syncing…'}[mt5Status] || 'Pending') : 'Not connected')}
      <button class="acch-act-btn" style="margin-top:8px" onclick="mt5OpenModal('${escName}')"><svg class="icn" aria-hidden="true"><use href="#ic-plug"></use></svg> ${mt5On ? 'Manage MT5' : 'Connect MT5'}</button>
    </div>
    <div class="acch-settings-block">
      <div class="acch-settings-title">Danger Zone</div>
      <button class="acch-act-btn" onclick="if(${idx}>=0){_toggleArchiveAccount(${idx});accCloseDetail();}">
        <svg class="icn" aria-hidden="true"><use href="#ic-archive"></use></svg> ${isArchived ? 'Restore Account' : 'Archive Account'}
      </button>
    </div>`;
}

function accClosePayoutModalIfOpen() { /* placeholder kept for symmetry with accAddPayout's own overlay toggling */ }

function _accEnhanceDetailView(name) {
  const container = document.querySelector('#acc-detail-body .acc-an');
  if (!container) return;

  const hero = container.querySelector('.acc-hero');
  if (!hero) return;

  const chal        = container.querySelector('.acc-chal-card');
  const secHeads     = Array.from(container.querySelectorAll('.acc-an-sec-head'));
  const perfHead      = secHeads.find(h => h.textContent.trim() === 'Performance Scorecard');
  const kpiScorecard   = container.querySelector('.acc-kpi-scorecard');
  const eqSection      = container.querySelector('.acc-eq-section');
  const tradeHead      = secHeads.find(h => h.textContent.trim() === 'Trade Log');
  const tradeTableWrap = tradeHead ? tradeHead.nextElementSibling : null;
  const noTradesMsg    = !tradeHead
    ? Array.from(container.children).find(el => el.textContent && el.textContent.indexOf('No trades logged under this account yet.') !== -1)
    : null;

  // Build tab shell
  const acc = _getCustomAccounts().find(a => a.name === name) || {};
  const typeInfo = _accTypeInfo(acc.type);
  const showRiskTab = typeInfo.cls !== 'paper' && typeInfo.cls !== 'live';
  const showPayoutsTab = !!typeInfo.payout;

  // Which tab should be active on this build: honor a one-shot request
  // (e.g. "stay on Settings after saving"), falling back to Overview.
  const availableTabs = ['overview', ...(showRiskTab ? ['risk'] : []), 'trades', ...(showPayoutsTab ? ['payouts'] : []), 'settings'];
  const initialTab = (_accPendingDetailTab && availableTabs.includes(_accPendingDetailTab)) ? _accPendingDetailTab : 'overview';
  _accPendingDetailTab = null;
  const activeCls = tab => tab === initialTab ? ' active' : '';

  const shell = document.createElement('div');
  shell.className = 'acch-tabs-wrap';
  shell.innerHTML = `
    <div class="acch-tabs" role="tablist">
      <button class="acch-tab-btn${activeCls('overview')}" data-tab="overview">Overview</button>
      ${showRiskTab ? `<button class="acch-tab-btn${activeCls('risk')}" data-tab="risk">Risk &amp; ${_accRiskWord(typeInfo)}</button>` : ''}
      <button class="acch-tab-btn${activeCls('trades')}" data-tab="trades">Trades</button>
      ${showPayoutsTab ? `<button class="acch-tab-btn${activeCls('payouts')}" data-tab="payouts">Payouts</button>` : ''}
      <button class="acch-tab-btn${activeCls('settings')}" data-tab="settings">Settings</button>
    </div>
    <div class="acch-tab-panel${activeCls('overview')}" data-panel="overview"></div>
    ${showRiskTab ? `<div class="acch-tab-panel${activeCls('risk')}" data-panel="risk">${_accRiskPanelHtml(name)}</div>` : ''}
    <div class="acch-tab-panel${activeCls('trades')}" data-panel="trades"></div>
    ${showPayoutsTab ? `<div class="acch-tab-panel${activeCls('payouts')}" data-panel="payouts">${_accPayoutsTabHtml(name)}</div>` : ''}
    <div class="acch-tab-panel${activeCls('settings')}" data-panel="settings">${_accSettingsTabHtml(name)}</div>
  `;

  const overviewPanel = shell.querySelector('[data-panel="overview"]');
  if (perfHead) overviewPanel.appendChild(perfHead);
  if (kpiScorecard) overviewPanel.appendChild(kpiScorecard);
  if (eqSection) overviewPanel.appendChild(eqSection);

  const riskPanel = shell.querySelector('[data-panel="risk"]');
  if (riskPanel && chal) riskPanel.appendChild(chal);

  const tradesPanel = shell.querySelector('[data-panel="trades"]');
  if (tradeHead) tradesPanel.appendChild(tradeHead);
  if (tradeTableWrap) tradesPanel.appendChild(tradeTableWrap);
  if (noTradesMsg) tradesPanel.appendChild(noTradesMsg);

  // Clear anything left behind after hero, then mount the tab shell
  let node = hero.nextSibling;
  while (node) { const next = node.nextSibling; node.remove(); node = next; }
  hero.insertAdjacentElement('afterend', shell);

  shell.querySelectorAll('.acch-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      shell.querySelectorAll('.acch-tab-btn').forEach(b => b.classList.remove('active'));
      shell.querySelectorAll('.acch-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      shell.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('active');
      if (btn.dataset.tab === 'overview') requestAnimationFrame(() => _accDrawEquityCurve(name));
    });
  });
}

// ── Hook everything into buildAccounts() ────────────────────────────────
const _accUpgOrigBuild = window.buildAccounts;
window.buildAccounts = function (...args) {
  const r = _accUpgOrigBuild.apply(this, args);
  _renderPortfolioOverview();
  _renderAccInsights();
  return r;
};
