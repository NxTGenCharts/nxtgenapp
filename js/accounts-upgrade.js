// ══ NxTGen Journal — accounts-upgrade.js ══════════════════════════════
// Account Tracker redesign: Portfolio Overview, Account Health cards
// (drawdown/target/payout progress), Insights, and an upgraded Payout
// Log summary. Loaded after accounts.js, core-modals-userbar.js and
// accounts-premium.js. Follows the same safe-override pattern used
// throughout the app: `const orig = window.fn; window.fn = function(){...}`.
// ════════════════════════════════════════════════════════════════════

// ── Risk/payout field defaults — every account gets these lazily, real
//    numbers only show once the user sets them or once real trades exist ──
function _accRiskDefaults(acc) {
  return {
    firm:              acc.firm || '',
    platform:          acc.platform || 'MT5',
    dailyLossLimitPct: (acc.dailyLossLimitPct !== undefined && acc.dailyLossLimitPct !== null && acc.dailyLossLimitPct !== '') ? parseFloat(acc.dailyLossLimitPct) : 5,
    maxLossLimitPct:   (acc.maxLossLimitPct   !== undefined && acc.maxLossLimitPct   !== null && acc.maxLossLimitPct   !== '') ? parseFloat(acc.maxLossLimitPct)   : 10,
    profitTargetPct:   (acc.profitTargetPct   !== undefined && acc.profitTargetPct   !== null && acc.profitTargetPct   !== '') ? parseFloat(acc.profitTargetPct)   : (acc.challengeTarget ? parseFloat(acc.challengeTarget) : 8),
    payoutThreshold:   (acc.payoutThreshold   !== undefined && acc.payoutThreshold   !== null && acc.payoutThreshold   !== '') ? parseFloat(acc.payoutThreshold)   : 0,
    minTradingDays:    (acc.minTradingDays    !== undefined && acc.minTradingDays    !== null && acc.minTradingDays    !== '') ? parseInt(acc.minTradingDays, 10)  : 0,
    nextPayoutDate:    acc.nextPayoutDate || '',
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

  const todayNet   = _accTodayNetDollars(name, accSize);
  const dailyUsed  = Math.max(0, -todayNet);
  const dailyLimit = accSize > 0 ? accSize * r.dailyLossLimitPct / 100 : 0;
  const dailyPct   = dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0;

  const maxUsed  = m.maxDD;
  const maxLimit = accSize > 0 ? accSize * r.maxLossLimitPct / 100 : 0;
  const maxPct   = maxLimit > 0 ? Math.min(100, (maxUsed / maxLimit) * 100) : 0;

  const targetCurrent = Math.max(0, m.netDollars);
  const targetGoal    = accSize > 0 ? accSize * r.profitTargetPct / 100 : 0;
  const targetPct     = targetGoal > 0 ? Math.min(100, (targetCurrent / targetGoal) * 100) : 0;

  const payoutCurrent = Math.max(0, m.netDollars);
  const payoutGoal    = r.payoutThreshold;
  const payoutPct     = payoutGoal > 0 ? Math.min(100, (payoutCurrent / payoutGoal) * 100) : 0;
  const payoutEligible = payoutGoal > 0 && payoutCurrent >= payoutGoal &&
    (r.minTradingDays <= 0 || m.tradingDays >= r.minTradingDays);

  const breach = dailyPct >= 100 || maxPct >= 100;
  const atRisk = !breach && (dailyPct >= 80 || maxPct >= 80);
  const caution = !breach && !atRisk && (dailyPct >= 55 || maxPct >= 55);

  const riskLevel = breach ? 'breach' : atRisk ? 'risk' : caution ? 'caution' : 'healthy';

  return {
    acc, m, r, accSize,
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
    else if (p.acc.type === 'Challenge') { primary = 'Evaluation'; cls = 'active'; }
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

    const mt5cfg = acc.mt5;
    const mt5Enabled = !!mt5cfg?.enabled;
    const mt5Status = mt5cfg?.lastSyncStatus || 'never';
    const mt5LastSync = mt5cfg?.lastSync ? new Date(mt5cfg.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

    const identity = `
      <div class="acch-id-row">
        <div class="acch-id-left">
          <div class="acch-name">${name}</div>
          <div class="acch-sub">${acc.type || 'Account'}${acc.type === 'Challenge' && acc.challengePhase ? ' · ' + acc.challengePhase : ''}${r.firm ? ' · ' + r.firm : ''}</div>
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
        <div class="acch-perf"><span class="k">Net PnL</span><span class="v" style="color:${pnlColor}">${m.at.length ? fmt(m.netDollars) : '—'}</span></div>
        <div class="acch-perf"><span class="k">Win Rate</span><span class="v">${wr}</span></div>
      </div>`;

    const riskUnset = accSize <= 0;
    const riskSection = `
      <div class="acch-risk-head">
        <span>ACCOUNT HEALTH</span>
        <span class="acch-risk-badge acch-risk-${p.riskLevel}">${{breach:'AT RISK',risk:'NEAR LIMIT',caution:'CAUTION',healthy:'HEALTHY'}[p.riskLevel]}</span>
      </div>
      ${_accBarHtml('Daily Drawdown', riskUnset ? 'Set size' : `$${p.dailyUsed.toFixed(0)} / $${p.dailyLimit.toFixed(0)}`, p.dailyPct, { unset: riskUnset })}
      ${_accBarHtml('Max Drawdown', riskUnset ? 'Set size' : `$${p.maxUsed.toFixed(0)} / $${p.maxLimit.toFixed(0)}`, p.maxPct, { unset: riskUnset })}
      ${_accBarHtml('Profit Target', riskUnset ? 'Set size' : `$${p.targetCurrent.toFixed(0)} / $${p.targetGoal.toFixed(0)}`, p.targetPct, { unset: riskUnset, color: 'var(--blue)' })}
      ${_accBarHtml('Payout Goal', p.payoutGoal > 0 ? `$${p.payoutCurrent.toFixed(0)} / $${p.payoutGoal.toFixed(0)}` : 'Not set', p.payoutPct, { unset: p.payoutGoal <= 0, color: 'var(--gold)' })}
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
    <div class="acch-card${isArchived ? ' acch-card-archived' : ''}" onclick="${isArchived ? '' : `accShowDetail('${escName}')`}">
      ${identity}
      ${perf}
      <div class="acch-divider"></div>
      ${riskSection}
      ${actions}
    </div>`;
  };

  const profiles = (list) => list.map(a => _accRiskProfile(a.name));

  const activeVisible   = _accSectionVisible('active');
  const archivedVisible = _accSectionVisible('archived');

  const sectionToggleBtn = (section, visible) => `
    <button class="acc-section-toggle-btn" title="${visible ? 'Hide' : 'Show'} ${section} accounts"
      onclick="event.stopPropagation();_accToggleSection('${section}')">
      <svg class="icn" aria-hidden="true" style="transform:rotate(${visible ? 90 : 0}deg);transition:transform .15s"><use href="#ic-chevron-right"></use></svg>
      ${visible ? 'Hide' : 'Show'}
    </button>`;

  let html = `<div class="acch-grid-head">
      <span class="acch-grid-title">Active (${active.length})</span>
      ${sectionToggleBtn('active', activeVisible)}
    </div>`;
  html += activeVisible
    ? `<div class="acch-grid">${active.length ? profiles(active).map(renderCard).join('') : '<div class="acc-empty">No active accounts yet — click <strong>Manage Accounts</strong> to add one.</div>'}</div>`
    : '';

  if (archived.length) {
    html += `<div class="acch-grid-head" style="margin-top:18px">
      <span class="acch-grid-title">Archived (${archived.length})</span>
      ${sectionToggleBtn('archived', archivedVisible)}
    </div>`;
    html += archivedVisible ? `<div class="acch-grid">${profiles(archived).map(renderCard).join('')}</div>` : '';
  }

  if (!active.length && !archived.length) {
    html = `<div class="acc-empty">No accounts yet — click <strong><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Manage Accounts</strong> to add one.</div>`;
  }

  grid.innerHTML = html;
};

function accAddTradeFor(name) {
  if (typeof _accActiveName !== 'undefined') _accActiveName = name;
  if (typeof accAddTradeForThis === 'function') { accShowDetail(name); setTimeout(() => accAddTradeForThis(), 0); }
}

// ── Risk & payout settings modal ───────────────────────────────────────
function _openAccRiskSettings(name) {
  const list = _getCustomAccounts();
  const idx = list.findIndex(a => a.name === name);
  if (idx < 0) return;
  const r = _accRiskDefaults(list[idx]);
  const existing = document.getElementById('acc-risk-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'acc-risk-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:440px">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-shield"></use></svg> Risk &amp; Payout — ${name}</span>
      <button onclick="document.getElementById('acc-risk-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="gap:10px">
      <div class="wl-form-2col">
        <div class="wl-form-row"><label class="wl-form-label">Firm</label><input type="text" class="wl-form-input" id="ars-firm" value="${r.firm}" placeholder="e.g. GOAT Funded"></div>
        <div class="wl-form-row"><label class="wl-form-label">Platform</label><input type="text" class="wl-form-input" id="ars-platform" value="${r.platform}" placeholder="MT5"></div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row"><label class="wl-form-label">Daily Loss Limit (%)</label><input type="number" class="wl-form-input" id="ars-daily" value="${r.dailyLossLimitPct}" min="0" step="0.5"></div>
        <div class="wl-form-row"><label class="wl-form-label">Max Loss Limit (%)</label><input type="number" class="wl-form-input" id="ars-max" value="${r.maxLossLimitPct}" min="0" step="0.5"></div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row"><label class="wl-form-label">Profit Target (%)</label><input type="number" class="wl-form-input" id="ars-target" value="${r.profitTargetPct}" min="0" step="0.5"></div>
        <div class="wl-form-row"><label class="wl-form-label">Payout Threshold ($)</label><input type="number" class="wl-form-input" id="ars-payout" value="${r.payoutThreshold || ''}" min="0" placeholder="e.g. 500"></div>
      </div>
      <div class="wl-form-2col">
        <div class="wl-form-row"><label class="wl-form-label">Min Trading Days</label><input type="number" class="wl-form-input" id="ars-mindays" value="${r.minTradingDays || ''}" min="0" placeholder="e.g. 5"></div>
        <div class="wl-form-row"><label class="wl-form-label">Next Payout Date</label><input type="date" class="wl-form-input" id="ars-nextdate" value="${r.nextPayoutDate}"></div>
      </div>
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
  const val = id => document.getElementById(id)?.value ?? '';
  list[idx].firm              = val('ars-firm');
  list[idx].platform          = val('ars-platform') || 'MT5';
  list[idx].dailyLossLimitPct = parseFloat(val('ars-daily')) || 0;
  list[idx].maxLossLimitPct   = parseFloat(val('ars-max')) || 0;
  list[idx].profitTargetPct   = parseFloat(val('ars-target')) || 0;
  list[idx].payoutThreshold   = parseFloat(val('ars-payout')) || 0;
  list[idx].minTradingDays    = parseInt(val('ars-mindays'), 10) || 0;
  list[idx].nextPayoutDate    = val('ars-nextdate') || '';
  await _saveCustomAccounts(list);
  document.getElementById('acc-risk-overlay')?.remove();
  showToast('Risk & payout settings saved ✓', 'restore');
  buildAccounts();
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

// ── Account detail view — inject a Risk & Payout section ───────────────
const _accUpgOrigShowDetail = window.accShowDetail;
window.accShowDetail = function (name, ...rest) {
  const r = _accUpgOrigShowDetail.call(this, name, ...rest);
  requestAnimationFrame(() => _accInjectRiskPanel(name));
  return r;
};

function _accInjectRiskPanel(name) {
  const container = document.querySelector('#acc-detail-body .acc-an');
  if (!container) return;
  const existing = document.getElementById('acch-detail-risk');
  if (existing) existing.remove();

  const p = _accRiskProfile(name);
  const riskUnset = p.accSize <= 0;

  const panel = document.createElement('div');
  panel.id = 'acch-detail-risk';
  panel.className = 'acch-detail-risk';
  panel.innerHTML = `
    <div class="acc-an-sec-head">Risk &amp; Payout</div>
    <div class="acch-detail-risk-grid">
      <div class="acch-detail-risk-col">
        ${_accBarHtml('Daily Drawdown', riskUnset ? 'Set account size' : `$${p.dailyUsed.toFixed(2)} / $${p.dailyLimit.toFixed(2)} used`, p.dailyPct, { unset: riskUnset })}
        ${_accBarHtml('Maximum Drawdown', riskUnset ? 'Set account size' : `$${p.maxUsed.toFixed(2)} / $${p.maxLimit.toFixed(2)} used`, p.maxPct, { unset: riskUnset })}
      </div>
      <div class="acch-detail-risk-col">
        ${_accBarHtml('Profit Target', riskUnset ? 'Set account size' : `$${p.targetCurrent.toFixed(2)} / $${p.targetGoal.toFixed(2)}`, p.targetPct, { unset: riskUnset, color: 'var(--blue)' })}
        ${_accBarHtml('Payout Goal', p.payoutGoal > 0 ? `$${p.payoutCurrent.toFixed(2)} / $${p.payoutGoal.toFixed(2)}` : 'Not set', p.payoutPct, { unset: p.payoutGoal <= 0, color: 'var(--gold)' })}
      </div>
    </div>
    <div class="acch-detail-risk-meta">
      <div><span class="k">Trading Days</span><span class="v">${p.r.minTradingDays > 0 ? `${p.m.tradingDays} / ${p.r.minTradingDays} required` : (p.m.tradingDays || '—')}</span></div>
      <div><span class="k">Payout Eligibility</span><span class="v" style="color:${p.payoutEligible ? 'var(--teal)' : 'var(--text2)'}">${p.payoutEligible ? 'Eligible now' : (p.payoutGoal > 0 ? 'Not yet eligible' : 'No threshold set')}</span></div>
      <div><span class="k">Next Payout Date</span><span class="v">${p.r.nextPayoutDate ? new Date(p.r.nextPayoutDate).toLocaleDateString() : '—'}</span></div>
      <div><span class="k">Firm</span><span class="v">${p.r.firm || '—'}</span></div>
    </div>
    <button class="acch-act-btn" style="margin-top:10px" onclick="_openAccRiskSettings('${name.replace(/'/g, "\\'")}')"><svg class="icn" aria-hidden="true"><use href="#ic-settings"></use></svg> Edit Risk &amp; Payout Settings</button>
  `;
  const hero = container.querySelector('.acc-hero');
  (hero || container).insertAdjacentElement('afterend', panel);
}

// ── Hook everything into buildAccounts() ────────────────────────────────
const _accUpgOrigBuild = window.buildAccounts;
window.buildAccounts = function (...args) {
  const r = _accUpgOrigBuild.apply(this, args);
  _renderPortfolioOverview();
  _renderAccInsights();
  return r;
};
