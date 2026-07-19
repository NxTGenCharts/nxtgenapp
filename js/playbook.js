// ══ NxTGen Journal — playbook.js (original app.js lines 9343-10164) ══

// ── RENDER: Strategy Library grid ──────────────────────
function buildBacktestingLab() {
  const wrap = document.getElementById('bl-strategy-cards');
  if (!wrap) return;
  const all = _blData.strategies || [];
  const visible = all.filter(s => _blTabState === 'archived' ? s.status === 'archived' : s.status !== 'archived');

  const cardsHTML = visible.map(s => _blCardHTML(s)).join('');
  const emptyCard = `<div class="bl-empty-card" onclick="_openStrategyEditModal(null)">
      <span style="font-size:22px">＋</span>
      <p style="margin:0;font-size:12.5px;font-weight:600">Add ${_blTabState === 'archived' ? 'a' : 'your first'} strategy</p>
    </div>`;

  wrap.innerHTML = visible.length
    ? (cardsHTML + (_blTabState === 'active' ? `<div class="bl-empty-card" onclick="_openStrategyEditModal(null)"><span style="font-size:22px">＋</span><p style="margin:0;font-size:12.5px;font-weight:600">New Strategy</p></div>` : ''))
    : emptyCard;

  if (typeof _blRenderGalleryControls === 'function') _blRenderGalleryControls();
  if (typeof _blRenderComparisonTable === 'function') _blRenderComparisonTable();
}

function _blStatCell(label, value, suffix) {
  const empty = value === null || value === undefined || value === '';
  return `<div class="bl-stat">
      <div class="bl-stat-label">${label}</div>
      <div class="bl-stat-value${empty ? ' empty' : ''}">${empty ? '—' : value + (suffix || '')}</div>
    </div>`;
}

function _blCardHTML(s) {
  const isArchived = s.status === 'archived';
  const linkedTrades = (typeof _btTradesForStrategy === 'function') ? _btTradesForStrategy(s.id) : [];
  const st = linkedTrades.length ? _btComputeStats(linkedTrades, 0) : (s.stats || _blEmptyStats());
  const metaParts = [s.market, s.instrument, s.timeframe, s.session].filter(Boolean).join(' · ');
  const isStrong = (typeof _blIsStrongStrategy === 'function') ? _blIsStrongStrategy(st) : false;
  const pbModel  = (typeof _blPlaybookModelFor === 'function') ? _blPlaybookModelFor(s.id) : null;
  const pbBtn = pbModel
    ? `<button class="wl-week-btn restore" onclick="nav('playbook', document.querySelector('.sb-item[onclick*=&quot;playbook&quot;]'), 'Trading Playbook')" title="Already saved to Playbook"><svg class="icn" aria-hidden="true"><use href="#ic-check-c"></use></svg> In Playbook</button>`
    : `<button class="wl-week-btn${isStrong ? ' bl-save-pb-strong' : ''}" onclick="_blSaveToPlaybook('${s.id}')" title="${isStrong ? 'Save this proven setup to your Playbook' : 'Save to Playbook'}"><svg class="icn" aria-hidden="true"><use href="#ic-bookmark"></use></svg> Save to Playbook</button>`;
  return `
  <div class="bl-strategy-card${isArchived ? ' bl-strategy-card-archived' : ''}${isStrong ? ' bl-strategy-card-strong' : ''}" style="--bl-tag-color:var(--${s.colorTag || 'gold'})">
    <div class="bl-card-head">
      <div style="min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div class="bl-card-title">${s.name || 'Untitled Strategy'}</div>
          ${isStrong ? `<span class="bl-strong-badge" title="${BL_STRONG_MIN_TESTS}+ tests, ${BL_STRONG_MIN_WINRATE}%+ win rate, ${BL_STRONG_MIN_PF}+ profit factor"><svg class="icn" aria-hidden="true"><use href="#ic-trophy"></use></svg> Strong Setup</span>` : ''}
        </div>
        ${metaParts ? `<div class="bl-card-meta">${metaParts}</div>` : ''}
      </div>
    </div>
    ${s.description ? `<div class="bl-card-desc">${s.description}</div>` : ''}
    <div class="bl-stat-grid">
      ${_blStatCell('Win Rate', st.winRate, '%')}
      ${_blStatCell('Expectancy', st.expectancy)}
      ${_blStatCell('Profit Factor', st.profitFactor)}
      ${_blStatCell('Avg RR', st.avgRR)}
      ${_blStatCell('Tests', st.totalTests || null)}
      ${_blStatCell('Max DD', st.maxDrawdown, '%')}
    </div>
    <div class="bl-card-actions">
      <button class="wl-week-btn" onclick="_openStrategyEditModal('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit</button>
      <button class="wl-week-btn" onclick="_blDuplicateStrategy('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-copy"></use></svg> Duplicate</button>
      <button class="wl-week-btn" onclick="_blOpenVersionHistory('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-folder"></use></svg> History</button>
      <button class="wl-week-btn${isArchived ? ' restore' : ' archive'}" onclick="_blToggleArchiveStrategy('${s.id}')">${isArchived ? '<svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Restore' : '<svg class="icn" aria-hidden="true"><use href="#ic-archive"></use></svg> Archive'}</button>
      <button class="wl-week-btn danger" onclick="_blDeleteStrategy('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg></button>
    </div>
    <div class="bl-card-actions">${pbBtn}</div>
  </div>`;
}

// ── CREATE / EDIT MODAL ────────────────────────────────
function _openStrategyEditModal(id) {
  const isNew = id === null;
  const s = isNew ? _blNewStrategy() : _blGetById(id);
  if (!s) return;

  const existing = document.getElementById('bl-strat-edit-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'bl-strat-edit-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const colorSwatches = BL_COLORS.map(c => `<div class="bl-color-dot${s.colorTag === c ? ' selected' : ''}" style="background:var(--${c})" onclick="_blPickColor(this,'${c}')" data-color="${c}"></div>`).join('');

  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:640px;max-height:88vh">
    <div class="acc-manager-header">
      <span>${isNew ? '＋ New Strategy' : '<svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit Strategy'}</span>
      <button onclick="document.getElementById('bl-strat-edit-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="display:flex;flex-direction:column;gap:12px;padding:16px;overflow-y:auto">

      <div>
        <label class="bl-lbl">Strategy Name</label>
        <input type="text" id="bl-f-name" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="e.g. ICT Silver Bullet" value="${s.name || ''}">
      </div>

      <div>
        <label class="bl-lbl">Description</label>
        <textarea id="bl-f-description" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:60px;resize:vertical" placeholder="What is this strategy and when does it apply?">${s.description || ''}</textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="bl-lbl">Market</label><input type="text" id="bl-f-market" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="Forex, Futures…" value="${s.market || ''}"></div>
        <div><label class="bl-lbl">Instrument</label><input type="text" id="bl-f-instrument" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="EURUSD, NQ…" value="${s.instrument || ''}"></div>
        <div><label class="bl-lbl">Timeframe</label><input type="text" id="bl-f-timeframe" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="M5, H1…" value="${s.timeframe || ''}"></div>
        <div><label class="bl-lbl">Session</label><input type="text" id="bl-f-session" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="London, NY…" value="${s.session || ''}"></div>
        <div><label class="bl-lbl">Risk %</label><input type="number" step="0.1" id="bl-f-risk" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="1" value="${s.riskPercent ?? ''}"></div>
        <div><label class="bl-lbl">RR Target</label><input type="number" step="0.1" id="bl-f-rr" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="2" value="${s.rrTarget ?? ''}"></div>
      </div>

      <div>
        <label class="bl-lbl">Entry Model</label>
        <textarea id="bl-f-entry" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical" placeholder="Describe the entry model…">${s.entryModel || ''}</textarea>
      </div>

      <div>
        <label class="bl-lbl">Confirmation Checklist <span class="bl-lbl-sub">(one per line)</span></label>
        <textarea id="bl-f-checklist" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:80px;resize:vertical;font-size:12px;line-height:1.6" placeholder="Liquidity swept&#10;FVG formed&#10;Displacement confirmed…">${(s.confirmationChecklist || []).join('\n')}</textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="bl-lbl">Invalidation Rules</label><textarea id="bl-f-invalid" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:60px;resize:vertical">${s.invalidationRules || ''}</textarea></div>
        <div><label class="bl-lbl">Exit Rules</label><textarea id="bl-f-exit" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:60px;resize:vertical">${s.exitRules || ''}</textarea></div>
      </div>

      <div>
        <label class="bl-lbl">Notes</label>
        <textarea id="bl-f-notes" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${s.notes || ''}</textarea>
      </div>

      <div>
        <label class="bl-lbl">Color Tag</label>
        <div class="bl-color-row" id="bl-color-row">${colorSwatches}</div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        ${!isNew ? `<button onclick="_blDeleteStrategy('${s.id}')" class="acc-mgr-btn del" style="padding:6px 14px;margin-right:auto"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Delete</button>` : ''}
        <button onclick="document.getElementById('bl-strat-edit-overlay').remove()" class="acc-mgr-btn" style="padding:6px 14px">Cancel</button>
        <button onclick="_blSaveStrategyModal('${isNew ? '' : s.id}')" class="acc-mgr-add-btn" style="padding:6px 18px">Save</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  overlay._blColorTag = s.colorTag || 'gold';
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.getElementById('bl-f-name')?.focus();
}

function _blPickColor(el, color) {
  const overlay = document.getElementById('bl-strat-edit-overlay');
  if (overlay) overlay._blColorTag = color;
  document.querySelectorAll('#bl-color-row .bl-color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
}

async function _blSaveStrategyModal(id) {
  const isNew = !id;
  const name = document.getElementById('bl-f-name')?.value.trim();
  if (!name) { showToast('Strategy name is required', 'danger'); return; }

  const overlay = document.getElementById('bl-strat-edit-overlay');
  const colorTag = overlay?._blColorTag || 'gold';
  const checklistRaw = document.getElementById('bl-f-checklist')?.value || '';

  const fields = {
    name,
    description: document.getElementById('bl-f-description')?.value.trim() || '',
    market: document.getElementById('bl-f-market')?.value.trim() || '',
    instrument: document.getElementById('bl-f-instrument')?.value.trim() || '',
    timeframe: document.getElementById('bl-f-timeframe')?.value.trim() || '',
    session: document.getElementById('bl-f-session')?.value.trim() || '',
    riskPercent: document.getElementById('bl-f-risk')?.value || '',
    rrTarget: document.getElementById('bl-f-rr')?.value || '',
    entryModel: document.getElementById('bl-f-entry')?.value.trim() || '',
    confirmationChecklist: checklistRaw.split('\n').map(x => x.trim()).filter(Boolean),
    invalidationRules: document.getElementById('bl-f-invalid')?.value.trim() || '',
    exitRules: document.getElementById('bl-f-exit')?.value.trim() || '',
    notes: document.getElementById('bl-f-notes')?.value.trim() || '',
    colorTag,
    updatedAt: new Date().toISOString(),
  };

  if (isNew) {
    const s = { ..._blNewStrategy(), ...fields };
    _blData.strategies.push(s);
  } else {
    const idx = _blGetIndexById(id);
    if (idx === -1) return;
    const prev = _blData.strategies[idx];
    // Snapshot the pre-edit version before overwriting (cap at 20 snapshots)
    const versions = [...(prev.versions || []), { ts: new Date().toISOString(), snapshot: { ...prev, versions: undefined } }].slice(-20);
    _blData.strategies[idx] = { ...prev, ...fields, versions };
  }

  document.getElementById('bl-strat-edit-overlay')?.remove();
  buildBacktestingLab();
  await _blSave();
  showToast(isNew ? 'Strategy created ✓' : 'Strategy updated ✓', 'restore');
}

// ── DUPLICATE / ARCHIVE / DELETE ───────────────────────
async function _blDuplicateStrategy(id) {
  const s = _blGetById(id); if (!s) return;
  const copy = {
    ...s,
    id: (crypto.randomUUID ? crypto.randomUUID() : 'bl_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
    name: s.name + ' (Copy)',
    stats: _blEmptyStats(),
    versions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  _blData.strategies.push(copy);
  buildBacktestingLab();
  await _blSave();
  showToast('Strategy duplicated ✓', 'restore');
}

async function _blToggleArchiveStrategy(id) {
  const s = _blGetById(id); if (!s) return;
  const wasArchived = s.status === 'archived';
  s.status = wasArchived ? 'active' : 'archived';
  s.updatedAt = new Date().toISOString();
  buildBacktestingLab();
  await _blSave();
  showToast(wasArchived ? 'Strategy restored ✓' : 'Strategy archived', 'restore');
}

async function _blDeleteStrategy(id) {
  const s = _blGetById(id); if (!s) return;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>',
    title: 'Delete Strategy?',
    body: `<strong>${s.name}</strong> and its version history will be permanently removed.<br><small style="color:var(--text3)">This does not delete any linked backtest sessions.</small>`,
    confirmLabel: 'Delete Strategy',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      document.getElementById('bl-strat-edit-overlay')?.remove();
      const idx = _blGetIndexById(id);
      if (idx !== -1) _blData.strategies.splice(idx, 1);
      buildBacktestingLab();
      await _blSave();
      showToast('Strategy deleted', 'danger');
    }
  });
}

// ── VERSION HISTORY ─────────────────────────────────────
function _blOpenVersionHistory(id) {
  const s = _blGetById(id); if (!s) return;
  const existing = document.getElementById('bl-version-overlay');
  if (existing) existing.remove();

  const versions = [...(s.versions || [])].reverse();
  const overlay = document.createElement('div');
  overlay.id = 'bl-version-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const listHTML = versions.length
    ? versions.map((v, i) => {
        const realIdx = s.versions.length - 1 - i; // index within s.versions
        return `<div class="bl-version-item">
          <div>
            <div>${v.snapshot?.name || 'Untitled'}</div>
            <div class="bl-version-ts">${new Date(v.ts).toLocaleString()}</div>
          </div>
          <button class="wl-week-btn" onclick="_blRestoreVersion('${s.id}', ${realIdx})">Restore</button>
        </div>`;
      }).join('')
    : `<div class="acc-mgr-empty">No saved versions yet — edits create a snapshot automatically.</div>`;

  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:480px">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-folder"></use></svg> Version History — ${s.name}</span>
      <button onclick="document.getElementById('bl-version-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="padding:16px">${listHTML}</div>
  </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

async function _blRestoreVersion(id, versionIdx) {
  const idx = _blGetIndexById(id); if (idx === -1) return;
  const s = _blData.strategies[idx];
  const version = (s.versions || [])[versionIdx]; if (!version) return;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg>',
    title: 'Restore This Version?',
    body: `Current strategy fields will be replaced with the snapshot from <strong>${new Date(version.ts).toLocaleString()}</strong>. This itself will be saved as a new version first.`,
    confirmLabel: 'Restore',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      const versions = [...(s.versions || []), { ts: new Date().toISOString(), snapshot: { ...s, versions: undefined } }].slice(-20);
      _blData.strategies[idx] = { ...version.snapshot, id: s.id, stats: s.stats, versions, updatedAt: new Date().toISOString() };
      document.getElementById('bl-version-overlay')?.remove();
      document.getElementById('bl-strat-edit-overlay')?.remove();
      buildBacktestingLab();
      await _blSave();
      showToast('Version restored ✓', 'restore');
    }
  });
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 8: Save to Playbook (Section 13)
// A strategy is flagged "strong" once it has a minimum sample size
// and clears win-rate / profit-factor bars — at that point it's
// eligible for one-click promotion into the Playbook as a real
// Model, carrying its entry/confirmation/invalidation/exit rules
// over as steps. The Playbook model keeps a `sourceStrategyId` link
// back to the Lab strategy so the card can show "In Playbook" and
// the Playbook card can show "From Backtesting Lab" — a two-way tie.
// ═══════════════════════════════════════════════════
const BL_STRONG_MIN_TESTS   = 5;    // minimum simulated trades before a strategy can be called "proven"
const BL_STRONG_MIN_WINRATE = 55;   // %
const BL_STRONG_MIN_PF      = 1.5;  // profit factor

function _blIsStrongStrategy(st) {
  if (!st || !st.totalTests || st.totalTests < BL_STRONG_MIN_TESTS) return false;
  if (st.winRate === null || st.winRate < BL_STRONG_MIN_WINRATE) return false;
  const pf = st.profitFactor === '∞' ? Infinity : Number(st.profitFactor);
  if (!isFinite(pf) && pf !== Infinity) return false;
  return pf >= BL_STRONG_MIN_PF;
}

// Find the Playbook model (if any) already linked to this Lab strategy
function _blPlaybookModelFor(strategyId) {
  return (_pbData.models || []).find(m => m.sourceStrategyId === strategyId);
}

async function _blSaveToPlaybook(id) {
  const s = _blGetById(id); if (!s) return;
  const already = _blPlaybookModelFor(id);
  if (already) {
    showToast('Already in your Playbook', 'restore');
    nav('playbook', document.querySelector('.sb-item[onclick*="playbook"]'), 'Trading Playbook');
    return;
  }

  const linkedTrades = _btTradesForStrategy(id);
  const st = linkedTrades.length ? _btComputeStats(linkedTrades, 0) : (s.stats || _blEmptyStats());
  const strong = _blIsStrongStrategy(st);

  // Build step-by-step playbook instructions from whatever the strategy has filled in
  const steps = [];
  if (s.entryModel) steps.push('Entry: ' + s.entryModel);
  (s.confirmationChecklist || []).forEach(c => steps.push('Confirm: ' + c));
  if (s.invalidationRules) steps.push('Invalidate: ' + s.invalidationRules);
  if (s.exitRules) steps.push('Exit: ' + s.exitRules);
  if (!steps.length && s.description) steps.push(s.description);

  const subParts = [s.market, s.instrument, s.timeframe, s.session].filter(Boolean).join(' · ');

  const model = {
    title: s.name || 'Untitled Strategy',
    strategyName: s.name || 'Untitled Strategy',
    sub: subParts || s.description || '',
    steps,
    status: 'active',
    sourceStrategyId: s.id,
    sourceStats: { winRate: st.winRate, profitFactor: st.profitFactor, avgRR: st.avgRR, totalTests: st.totalTests },
    savedFromBacktestAt: new Date().toISOString(),
  };

  _pbData.models.push(model);
  await _pbSave();
  buildPlaybook();
  _refreshStrategyDropdowns();
  buildBacktestingLab(); // re-render Lab cards so this one now shows "In Playbook"
  showToast(strong ? '🏆 Strong setup saved to Playbook ✓' : 'Saved to Playbook ✓', 'restore');
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 2: Backtest Sessions +
// Manual Trade Simulator
//
// Sessions live inside the same journal_backtest_lab row as
// strategies (_blData.sessions). Individual simulated trades are
// real rows in journal_backtest_trades — Table: journal_backtest_trades
// { id, user_id, session_id, strategy_id, direction, entry_price,
//   exit_price, stop_price, rr, pnl, entry_time, exit_time, data jsonb }
// `data` holds everything else (MFE/MAE, screenshots, reasons,
// mistakes, psychology + ratings, notes) so the schema doesn't need
// to change every time a new field is added.
// ═══════════════════════════════════════════════════
let _btTrades = [];       // all simulated trades for this user, loaded once
let _btSessionTabState = 'all'; // 'all' | 'active' | 'completed'

function _btNewSession() {
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : 'bs_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
    strategyId: '', name: '',
    date: new Date().toISOString().slice(0, 10),
    pair: '', timeframe: '', startingBalance: '', riskPercent: '',
    commission: '', spread: '', slippage: '', accountType: '',
    propFirmRules: '', evaluationRules: '', notes: '',
    status: 'active',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function _btGetSessionById(id) { return (_blData.sessions || []).find(s => s.id === id); }
function _btGetSessionIndexById(id) { return (_blData.sessions || []).findIndex(s => s.id === id); }
function _btTradesForSession(sessionId) { return _btTrades.filter(t => t.session_id === sessionId); }
function _btTradesForStrategy(strategyId) { return _btTrades.filter(t => t.strategy_id === strategyId); }

// ── LOAD / SAVE TRADES (real table, per-row) ───────────
async function _btLoadTrades() {
  if (!_currentUser) return;
  const { data, error } = await sb
    .from('journal_backtest_trades')
    .select('*')
    .eq('user_id', _currentUser.id)
    .order('entry_time', { ascending: true });
  if (error) { console.error('_btLoadTrades:', error.message); return; }
  _btTrades = data || [];
}

async function _btSaveTrade(trade) {
  const row = {
    user_id: _currentUser.id,
    session_id: trade.session_id,
    strategy_id: trade.strategy_id || null,
    direction: trade.direction,
    entry_price: trade.entry_price || null,
    exit_price: trade.exit_price || null,
    stop_price: trade.stop_price || null,
    rr: trade.rr,
    pnl: trade.pnl,
    entry_time: trade.entry_time || null,
    exit_time: trade.exit_time || null,
    data: trade.data || {},
  };
  if (trade.id) {
    const { error } = await sb.from('journal_backtest_trades').update(row).eq('id', trade.id);
    if (error) { console.error('_btSaveTrade update:', error.message); showToast('Failed to save trade', 'danger'); return null; }
    const idx = _btTrades.findIndex(t => t.id === trade.id);
    if (idx !== -1) _btTrades[idx] = { ..._btTrades[idx], ...row, id: trade.id };
    return trade.id;
  } else {
    const { data, error } = await sb.from('journal_backtest_trades').insert(row).select().single();
    if (error) { console.error('_btSaveTrade insert:', error.message); showToast('Failed to save trade', 'danger'); return null; }
    _btTrades.push(data);
    return data.id;
  }
}

async function _btDeleteTrade(id) {
  const { error } = await sb.from('journal_backtest_trades').delete().eq('id', id);
  if (error) { console.error('_btDeleteTrade:', error.message); return false; }
  _btTrades = _btTrades.filter(t => t.id !== id);
  return true;
}

/* Reuse the same client-side compression + trade-charts bucket
   already used by the Watchlist chart uploads. */
async function _btUploadScreenshot(file) {
  const compressed = await _compressChartImage(file);
  const path = `${_currentUser.id}/bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from('trade-charts')
    .upload(path, compressed, { upsert: false, contentType: 'image/jpeg' });
  if (error) { console.error('bt screenshot upload error:', error.message); return null; }
  const { data } = sb.storage.from('trade-charts').getPublicUrl(path);
  return data.publicUrl;
}

// ── STATS ENGINE (shared by session summary + strategy cards) ──
function _btComputeStats(trades, startingBalance) {
  if (!trades.length) {
    return { winRate: null, expectancy: null, profitFactor: null, avgRR: null, totalTests: 0,
      avgHoldTime: null, maxDrawdown: null, consistencyScore: null, confidenceScore: null,
      netReturn: null, bestTrade: null, worstTrade: null };
  }
  const rrs = trades.map(t => Number(t.rr) || 0);
  const pnls = trades.map(t => Number(t.pnl) || 0);
  const wins = trades.filter(t => (Number(t.pnl) || 0) > 0);
  const losses = trades.filter(t => (Number(t.pnl) || 0) < 0);

  const winRate = (wins.length / trades.length) * 100;
  const avgRR = rrs.reduce((a, b) => a + b, 0) / rrs.length;
  const grossWin = wins.reduce((a, t) => a + (Number(t.pnl) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (Number(t.pnl) || 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const avgWinR = wins.length ? wins.reduce((a, t) => a + (Number(t.rr) || 0), 0) / wins.length : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((a, t) => a + (Number(t.rr) || 0), 0) / losses.length) : 0;
  const expectancy = (winRate / 100) * avgWinR - (1 - winRate / 100) * avgLossR;
  const netReturn = pnls.reduce((a, b) => a + b, 0);
  const bestTrade = Math.max(...pnls);
  const worstTrade = Math.min(...pnls);

  // Equity curve + max drawdown (peak-to-trough, in $ relative to starting balance if given)
  let running = 0, peak = 0, maxDD = 0;
  trades.forEach(t => {
    running += Number(t.pnl) || 0;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  });
  const maxDrawdownPct = startingBalance > 0 ? (maxDD / startingBalance) * 100 : null;

  // Hold time
  const durations = trades
    .map(t => (t.entry_time && t.exit_time) ? (new Date(t.exit_time) - new Date(t.entry_time)) / 60000 : null)
    .filter(d => d !== null && !isNaN(d) && d >= 0);
  const avgHoldMin = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  // Consistency: lower spread of R-multiples relative to their mean = more consistent
  const meanR = rrs.reduce((a, b) => a + b, 0) / rrs.length;
  const variance = rrs.reduce((a, r) => a + Math.pow(r - meanR, 2), 0) / rrs.length;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = meanR !== 0 ? Math.max(0, Math.min(100, Math.round(100 - (stdDev / Math.abs(meanR)) * 100))) : null;

  // Confidence: average of self-reported confidence ratings (1-10 scale) → 0-100
  const confRatings = trades.map(t => t.data?.confidenceLevel).filter(v => v !== undefined && v !== null && v !== '');
  const confidenceScore = confRatings.length ? Math.round((confRatings.reduce((a, b) => a + Number(b), 0) / confRatings.length) * 10) : null;

  return {
    winRate: Math.round(winRate * 10) / 10,
    expectancy: Math.round(expectancy * 100) / 100,
    profitFactor: isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : '∞',
    avgRR: Math.round(avgRR * 100) / 100,
    totalTests: trades.length,
    avgHoldTime: avgHoldMin !== null ? _btFmtDuration(avgHoldMin) : null,
    maxDrawdown: maxDrawdownPct !== null ? Math.round(maxDrawdownPct * 10) / 10 : null,
    consistencyScore, confidenceScore,
    netReturn: Math.round(netReturn * 100) / 100,
    bestTrade: Math.round(bestTrade * 100) / 100,
    worstTrade: Math.round(worstTrade * 100) / 100,
  };
}

function _btFmtDuration(mins) {
  if (mins < 60) return Math.round(mins) + 'm';
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h + 'h ' + (m ? m + 'm' : '');
}

// ── RENDER: Session grid ───────────────────────────────
function _btSessionTab(tab, btn) {
  _btSessionTabState = tab;
  document.querySelectorAll('#bt-session-tabs .bl-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _btRenderSessionGrid();
}

function _btRenderSessionGrid() {
  const wrap = document.getElementById('bt-session-cards');
  if (!wrap) return;
  const all = _blData.sessions || [];
  const visible = _btSessionTabState === 'all' ? all : all.filter(s => s.status === _btSessionTabState);

  const cards = visible.map(s => _btSessionCardHTML(s)).join('');
  const addCard = `<div class="bl-empty-card" onclick="_openSessionEditModal(null)">
      <span style="font-size:22px">＋</span>
      <p style="margin:0;font-size:12.5px;font-weight:600">New Session</p>
    </div>`;

  wrap.innerHTML = visible.length ? (cards + addCard) : `<div class="bl-empty-card" onclick="_openSessionEditModal(null)"><span style="font-size:22px">＋</span><p style="margin:0;font-size:12.5px;font-weight:600">Start your first session</p></div>`;
}

function _btSessionCardHTML(s) {
  const trades = _btTradesForSession(s.id);
  const stats = _btComputeStats(trades, Number(s.startingBalance) || 0);
  const strategy = s.strategyId ? _blGetById(s.strategyId) : null;
  const metaParts = [s.pair, s.timeframe, s.date].filter(Boolean).join(' · ');
  return `
  <div class="bt-session-card${s.status === 'completed' ? ' bt-session-card-completed' : ''}">
    <div class="bt-session-head" onclick="_openSessionDetail('${s.id}')" style="cursor:pointer">
      <div style="min-width:0">
        <div class="bt-session-title">${s.name || 'Untitled Session'}</div>
        <div class="bt-session-meta">${metaParts || 'No details set'}${strategy ? ' · ' + strategy.name : ''}</div>
      </div>
      <span class="bt-status-pill bt-status-${s.status}">${s.status}</span>
    </div>
    <div class="bl-stat-grid" onclick="_openSessionDetail('${s.id}')" style="cursor:pointer">
      ${_blStatCell('Trades', stats.totalTests || null)}
      ${_blStatCell('Win Rate', stats.winRate, '%')}
      ${_blStatCell('Net', stats.netReturn)}
    </div>
    <div class="bl-card-actions">
      <button class="wl-week-btn" onclick="_repOpen('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-chart-line"></use></svg> Chart Replay</button>
    </div>
  </div>`;
}

// ── SESSION CREATE/EDIT MODAL ───────────────────────────
function _openSessionEditModal(id) {
  const isNew = id === null;
  const s = isNew ? _btNewSession() : _btGetSessionById(id);
  if (!s) return;

  const existing = document.getElementById('bt-session-edit-overlay');
  if (existing) existing.remove();

  const strategyOptions = `<option value="">— None —</option>` + (_blData.strategies || [])
    .filter(st => st.status !== 'archived')
    .map(st => `<option value="${st.id}"${s.strategyId === st.id ? ' selected' : ''}>${st.name}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'bt-session-edit-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:600px;max-height:88vh">
    <div class="acc-manager-header">
      <span>${isNew ? '＋ New Backtest Session' : '<svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit Session'}</span>
      <button onclick="document.getElementById('bt-session-edit-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="display:flex;flex-direction:column;gap:12px;padding:16px;overflow-y:auto">

      <div><label class="bl-lbl">Session Name</label><input type="text" id="bt-f-name" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="e.g. ICT Silver Bullet — London" value="${s.name || ''}"></div>

      <div><label class="bl-lbl">Linked Strategy</label>
        <select id="bt-f-strategy" class="acc-mgr-input" style="width:100%;box-sizing:border-box">${strategyOptions}</select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="bl-lbl">Date</label><input type="date" id="bt-f-date" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${s.date || ''}"></div>
        <div><label class="bl-lbl">Pair</label><input type="text" id="bt-f-pair" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="EURUSD" value="${s.pair || ''}"></div>
        <div><label class="bl-lbl">Timeframe</label><input type="text" id="bt-f-timeframe" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="M5" value="${s.timeframe || ''}"></div>
        <div><label class="bl-lbl">Account Type</label><input type="text" id="bt-f-accttype" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="Prop Firm, Personal…" value="${s.accountType || ''}"></div>
        <div><label class="bl-lbl">Starting Balance</label><input type="number" step="0.01" id="bt-f-balance" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${s.startingBalance ?? ''}"></div>
        <div><label class="bl-lbl">Risk %</label><input type="number" step="0.1" id="bt-f-risk" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${s.riskPercent ?? ''}"></div>
        <div><label class="bl-lbl">Commission</label><input type="number" step="0.01" id="bt-f-comm" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${s.commission ?? ''}"></div>
        <div><label class="bl-lbl">Spread</label><input type="number" step="0.01" id="bt-f-spread" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${s.spread ?? ''}"></div>
        <div><label class="bl-lbl">Slippage</label><input type="number" step="0.01" id="bt-f-slippage" class="acc-mgr-input" style="width:100%;box-sizing:border-box" value="${s.slippage ?? ''}"></div>
        <div><label class="bl-lbl">Status</label>
          <select id="bt-f-status" class="acc-mgr-input" style="width:100%;box-sizing:border-box">
            <option value="active"${s.status !== 'completed' ? ' selected' : ''}>Active</option>
            <option value="completed"${s.status === 'completed' ? ' selected' : ''}>Completed</option>
          </select>
        </div>
      </div>

      <div><label class="bl-lbl">Prop Firm Rules</label><textarea id="bt-f-propfirm" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${s.propFirmRules || ''}</textarea></div>
      <div><label class="bl-lbl">Evaluation Rules</label><textarea id="bt-f-evalrules" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${s.evaluationRules || ''}</textarea></div>
      <div><label class="bl-lbl">Notes</label><textarea id="bt-f-notes" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:50px;resize:vertical">${s.notes || ''}</textarea></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        ${!isNew ? `<button onclick="_btDeleteSession('${s.id}')" class="acc-mgr-btn del" style="padding:6px 14px;margin-right:auto"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Delete</button>` : ''}
        <button onclick="document.getElementById('bt-session-edit-overlay').remove()" class="acc-mgr-btn" style="padding:6px 14px">Cancel</button>
        <button onclick="_btSaveSessionModal('${isNew ? '' : s.id}')" class="acc-mgr-add-btn" style="padding:6px 18px">Save</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.getElementById('bt-f-name')?.focus();
}

async function _btSaveSessionModal(id) {
  const isNew = !id;
  const name = document.getElementById('bt-f-name')?.value.trim();
  if (!name) { showToast('Session name is required', 'danger'); return; }

  const fields = {
    name,
    strategyId: document.getElementById('bt-f-strategy')?.value || '',
    date: document.getElementById('bt-f-date')?.value || '',
    pair: document.getElementById('bt-f-pair')?.value.trim() || '',
    timeframe: document.getElementById('bt-f-timeframe')?.value.trim() || '',
    accountType: document.getElementById('bt-f-accttype')?.value.trim() || '',
    startingBalance: document.getElementById('bt-f-balance')?.value || '',
    riskPercent: document.getElementById('bt-f-risk')?.value || '',
    commission: document.getElementById('bt-f-comm')?.value || '',
    spread: document.getElementById('bt-f-spread')?.value || '',
    slippage: document.getElementById('bt-f-slippage')?.value || '',
    status: document.getElementById('bt-f-status')?.value || 'active',
    propFirmRules: document.getElementById('bt-f-propfirm')?.value.trim() || '',
    evaluationRules: document.getElementById('bt-f-evalrules')?.value.trim() || '',
    notes: document.getElementById('bt-f-notes')?.value.trim() || '',
    updatedAt: new Date().toISOString(),
  };

  if (isNew) {
    _blData.sessions.push({ ..._btNewSession(), ...fields });
  } else {
    const idx = _btGetSessionIndexById(id);
    if (idx === -1) return;
    _blData.sessions[idx] = { ..._blData.sessions[idx], ...fields };
  }

  document.getElementById('bt-session-edit-overlay')?.remove();
  _btRenderSessionGrid();
  await _blSave();
  showToast(isNew ? 'Session created ✓' : 'Session updated ✓', 'restore');
}

async function _btDeleteSession(id) {
  const s = _btGetSessionById(id); if (!s) return;
  const tradeCount = _btTradesForSession(id).length;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>',
    title: 'Delete Session?',
    body: `<strong>${s.name}</strong> will be permanently removed${tradeCount ? `, along with its <strong>${tradeCount}</strong> logged trade${tradeCount === 1 ? '' : 's'}` : ''}.`,
    confirmLabel: 'Delete Session',
    confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      document.getElementById('bt-session-edit-overlay')?.remove();
      document.getElementById('bt-session-detail-overlay')?.remove();
      const idx = _btGetSessionIndexById(id);
      if (idx !== -1) _blData.sessions.splice(idx, 1);
      // Clean up linked trades
      const toDelete = _btTradesForSession(id).map(t => t.id);
      for (const tid of toDelete) await _btDeleteTrade(tid);
      _btRenderSessionGrid();
      await _blSave();
      showToast('Session deleted', 'danger');
    }
  });
}

// ── SESSION DETAIL: summary + timeline + trade simulator ──
function _openSessionDetail(id) {
  const s = _btGetSessionById(id); if (!s) return;
  const existing = document.getElementById('bt-session-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'bt-session-detail-overlay';
  overlay.className = 'acc-manager-overlay bt-detail-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal bt-detail-modal">
    <div class="acc-manager-header">
      <span>${s.name}</span>
      <div style="display:flex;gap:6px;align-items:center;position:relative">
        <button onclick="_btToggleExportMenu(event,'${s.id}')" class="acc-mgr-close" title="Export report"><svg class="icn" aria-hidden="true"><use href="#ic-download"></use></svg></button>
        <div id="bt-export-menu" class="bt-export-menu" style="display:none">
          <button onclick="_btExportCSV('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-clipboard"></use></svg> Export CSV</button>
          <button onclick="_btExportExcel('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-box"></use></svg> Export Excel</button>
          <button onclick="_btExportPDF('${s.id}')"><svg class="icn" aria-hidden="true"><use href="#ic-clipboard"></use></svg> Export PDF Report</button>
        </div>
        <button onclick="document.getElementById('bt-session-detail-overlay').remove();_repOpen('${s.id}')" class="acc-mgr-close" title="Chart Replay"><svg class="icn" aria-hidden="true"><use href="#ic-chart-line"></use></svg></button>
        <button onclick="document.getElementById('bt-session-detail-overlay').remove();_openSessionEditModal('${s.id}')" class="acc-mgr-close" title="Edit session"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
        <button onclick="document.getElementById('bt-session-detail-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
    </div>
    <div class="bl-tabs" id="bt-detail-tabs" style="margin:14px 16px 0">
      <button class="bl-tab active" onclick="_btDetailTab('overview',this,'${s.id}')">Overview</button>
      <button class="bl-tab" onclick="_btDetailTab('analytics',this,'${s.id}')">Analytics</button>
      <button class="bl-tab" onclick="_btDetailTab('ai',this,'${s.id}')">AI Review</button>
    </div>
    <div class="acc-manager-body" style="padding:16px;overflow-y:auto">
      <div id="bt-detail-panel-overview">
        <div id="bt-detail-stats"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 10px">
          <div class="sec-head" style="margin-bottom:0">Trade Timeline</div>
          <button onclick="_openTradeEntryModal('${s.id}', null)" class="acc-mgr-add-btn" style="padding:5px 14px">＋ Log Trade</button>
        </div>
        <div id="bt-timeline" class="bt-timeline"></div>
      </div>
      <div id="bt-detail-panel-analytics" style="display:none"></div>
      <div id="bt-detail-panel-ai" style="display:none"></div>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  _btRenderSessionDetail(id);
}

/* Switch between Overview / Analytics / AI Review inside the session detail modal */
function _btDetailTab(tab, btn, sessionId) {
  document.querySelectorAll('#bt-detail-tabs .bl-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['overview', 'analytics', 'ai'].forEach(t => {
    const el = document.getElementById('bt-detail-panel-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'analytics') _btRenderAnalyticsPanel(sessionId);
  if (tab === 'ai') _btRenderAIReviewPanel(sessionId);
}

function _btRenderSessionDetail(sessionId) {
  const s = _btGetSessionById(sessionId); if (!s) return;
  const trades = _btTradesForSession(sessionId).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));
  const stats = _btComputeStats(trades, Number(s.startingBalance) || 0);

  const statsEl = document.getElementById('bt-detail-stats');
  if (statsEl) {
    statsEl.innerHTML = `<div class="bt-stat-bar">
      ${_blStatCell('Net Return', stats.netReturn)}
      ${_blStatCell('Win Rate', stats.winRate, '%')}
      ${_blStatCell('Avg RR', stats.avgRR)}
      ${_blStatCell('Profit Factor', stats.profitFactor)}
      ${_blStatCell('Max DD', stats.maxDrawdown, '%')}
      ${_blStatCell('Expectancy', stats.expectancy)}
      ${_blStatCell('Best Trade', stats.bestTrade)}
      ${_blStatCell('Worst Trade', stats.worstTrade)}
      ${_blStatCell('Avg Hold', stats.avgHoldTime)}
      ${_blStatCell('Total Trades', stats.totalTests || null)}
    </div>`;
  }

  const timelineEl = document.getElementById('bt-timeline');
  if (timelineEl) {
    timelineEl.innerHTML = trades.length ? trades.map(t => {
      const rr = Number(t.rr) || 0;
      const time = t.entry_time ? new Date(t.entry_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      return `<div class="bt-timeline-item" onclick="_openTradeEntryModal('${sessionId}', '${t.id}')">
        <span class="bt-timeline-dir ${t.direction}">${t.direction || '—'}</span>
        <div class="bt-timeline-main">
          <div>${t.entry_price ?? '—'} → ${t.exit_price ?? '—'}</div>
          <div class="bt-timeline-time">${time}</div>
        </div>
        <div class="bt-timeline-rr ${rr >= 0 ? 'pos' : 'neg'}">${rr >= 0 ? '+' : ''}${rr.toFixed(2)}R</div>
      </div>`;
    }).join('') : `<div class="acc-mgr-empty">No trades logged yet — click "Log Trade" to record your first simulated entry.</div>`;
  }
}

