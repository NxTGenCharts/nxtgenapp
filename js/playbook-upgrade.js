// ══════════════════════════════════════════════════════
// TRADING PLAYBOOK UPGRADE — additive layer.
//
// Loaded AFTER js/accounts.js, so the function declarations below
// (buildPlaybook, _openModelEditModal, _pbSaveModelModal) intentionally
// re-declare and replace the earlier versions defined there. Nothing in
// accounts.js is edited — _pbData, _pbSave, pbAddModelModal,
// pbEditModelModal, pbToggleArchiveModel, pbDeleteModel, pbAddRule,
// pbDeleteRule, _openManageStrategies, _getActiveStrategies, etc. are
// all reused as-is, so every existing model/rule a user has saved keeps
// working exactly as before — this file only changes how the page is
// rendered and adds new optional capabilities on top of the same data.
//
// New OPTIONAL fields added to a model object (never required, never
// backfilled onto models that don't have them): category, dir, session,
// market, quality, tags[], pinned, updatedAt. `dir` already existed on
// the seeded MODELS in core-utils-ai.js and simply wasn't rendered
// anywhere before now.
//
// Rule storage is left untouched (_pbData.rules stays a plain array of
// strings) because js/core-utils-ai.js and js/ai-coach-upgrade.js both
// read rule text directly as strings for the AI Coach prompt and the
// max-daily-loss check — changing that shape would break those.
// Rule "categories" shown on cards are inferred client-side from
// keywords purely for display and are never persisted.
// ══════════════════════════════════════════════════════

/* ── small utils ─────────────────────────────────────── */
function _pbEsc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _pbTimeAgo(ts) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ── stamp lastUpdated whenever playbook data is persisted ──
   Wraps (does not edit) the existing _pbSave from accounts.js. */
(function _pbPatchSave() {
  if (typeof _pbSave !== 'function' || _pbSave.__pbPatched) return;
  const orig = _pbSave;
  _pbSave = async function () {
    _pbData.lastUpdated = Date.now();
    return orig.apply(this, arguments);
  };
  _pbSave.__pbPatched = true;
})();

/* ── derived data helpers ────────────────────────────── */
function _pbActiveModels() { return (_pbData.models || []).filter(m => m.status !== 'archived' && m.status !== 'deleted'); }
function _pbArchivedModels() { return (_pbData.models || []).filter(m => m.status === 'archived'); }

function _pbRuleCategory(text) {
  const t = (text || '').toLowerCase();
  if (/risk|1%|funded account/.test(t)) return 'Risk';
  if (/news/.test(t)) return 'News';
  if (/angry|fear|revenge|emotion/.test(t)) return 'Psychology';
  if (/\bsl\b|stop loss|target is hit|trade management/.test(t)) return 'Trade Management';
  if (/checklist|killzone|bias|chase price|per day|3.?star|entry/.test(t)) return 'Discipline';
  return null;
}

/* ── readiness score (transparent, computed only from real data) ── */
function _pbReadiness() {
  const active = _pbActiveModels();
  const rules = _pbData.rules || [];
  const checks = [];
  let earned = 0, total = 0;

  total++; const hasModel = active.length > 0;
  if (hasModel) earned++;
  checks.push({ ok: hasModel, label: hasModel ? `${active.length} active trading model${active.length === 1 ? '' : 's'} configured` : 'Add at least one active trading model' });

  total++; const withDesc = active.filter(m => (m.sub || '').trim()).length;
  const descOk = active.length > 0 && withDesc === active.length;
  if (descOk) earned++;
  checks.push({ ok: descOk, label: active.length ? `${withDesc}/${active.length} models have a description` : 'No models yet to describe' });

  total++; const withSteps = active.filter(m => (m.steps || []).length > 0).length;
  const stepsOk = active.length > 0 && withSteps === active.length;
  if (stepsOk) earned++;
  checks.push({ ok: stepsOk, label: active.length ? `${withSteps}/${active.length} models have execution steps` : 'No models yet to add steps to' });

  total++; const rulesOk = rules.length > 0;
  if (rulesOk) earned++;
  checks.push({ ok: rulesOk, label: rulesOk ? `${rules.length} non-negotiable rule${rules.length === 1 ? '' : 's'} defined` : 'Add your non-negotiable rules' });

  total++; const withMeta = active.filter(m => m.category || m.session || m.market || m.quality || m.dir).length;
  const metaOk = active.length > 0 && withMeta === active.length;
  if (metaOk) earned++;
  checks.push({ ok: metaOk, label: active.length ? `${withMeta}/${active.length} models have setup context (category, session, market, or direction)` : 'No models yet to add context to' });

  return { score: total ? Math.round((earned / total) * 100) : 0, checks };
}

function _pbStatusInfo(score) {
  if (score >= 85) return { label: 'Complete', cls: 'complete' };
  if (score >= 50) return { label: 'Needs Review', cls: 'review' };
  return { label: 'Draft', cls: 'draft' };
}

function _pbCurrentFocus() {
  const active = _pbActiveModels();
  if (!active.length) return null;
  const pinned = active.find(m => m.pinned);
  if (pinned) return pinned;
  const withUpdated = active.filter(m => m.updatedAt).sort((a, b) => b.updatedAt - a.updatedAt);
  return withUpdated[0] || active[0];
}

/* ── rule-based insights (no fabricated numbers) ─────── */
function _pbInsights() {
  const active = _pbActiveModels();
  const rules = _pbData.rules || [];
  const out = [];

  if (active.length) out.push(`Your playbook contains ${active.length} active trading model${active.length === 1 ? '' : 's'}.`);

  if (active.length) {
    const most = active.reduce((a, b) => ((b.steps || []).length > (a.steps || []).length ? b : a));
    if ((most.steps || []).length) out.push(`Your most detailed model is <strong>${_pbEsc(most.title || most.strategyName)}</strong> with ${most.steps.length} execution step${most.steps.length === 1 ? '' : 's'}.`);
  }

  const noDesc = active.filter(m => !(m.sub || '').trim()).length;
  if (noDesc > 0) out.push(`${noDesc} model${noDesc === 1 ? ' is' : 's are'} missing a description.`);

  const noSteps = active.filter(m => !(m.steps || []).length).length;
  if (noSteps > 0) out.push(`${noSteps} model${noSteps === 1 ? ' has' : 's have'} no execution steps yet.`);

  if (rules.length) out.push(`All ${rules.length} non-negotiable rule${rules.length === 1 ? '' : 's'} ${rules.length === 1 ? 'is' : 'are'} configured.`);
  else out.push(`You haven't defined any non-negotiable rules yet.`);

  const archivedCount = _pbArchivedModels().length;
  if (archivedCount) out.push(`${archivedCount} model${archivedCount === 1 ? ' is' : 's are'} archived and hidden from Review Before Trading.`);

  if (_pbData.lastUpdated) out.push(`Your playbook was last updated ${_pbTimeAgo(_pbData.lastUpdated).toLowerCase()}.`);

  return out;
}

/* ── header + overview render ────────────────────────── */
function _pbRenderHeaderAndOverview() {
  const active = _pbActiveModels();
  const rules = _pbData.rules || [];
  const { score, checks } = _pbReadiness();
  const status = _pbStatusInfo(score);
  const focus = _pbCurrentFocus();

  const hdSummary = document.getElementById('pb-hd-summary');
  if (hdSummary) {
    hdSummary.innerHTML = `
      <span class="pb-status-pill ${status.cls}">${status.label}</span>
      <span><strong>${active.length}</strong> Active Model${active.length === 1 ? '' : 's'}</span>
      <span class="sep">·</span>
      <span><strong>${rules.length}</strong> Core Rule${rules.length === 1 ? '' : 's'}</span>
      <span class="sep">·</span>
      <span>Last Updated ${_pbData.lastUpdated ? _pbTimeAgo(_pbData.lastUpdated) : '—'}</span>`;
  }

  const ovEl = document.getElementById('pb-overview');
  if (ovEl) {
    const circumference = 113.1;
    const dash = (score / 100 * circumference).toFixed(1);
    const ringColor = score >= 85 ? 'var(--green)' : score >= 50 ? 'var(--gold)' : 'var(--blue)';
    ovEl.innerHTML = `
      <div class="pb-overview">
        <div class="pb-ov-card">
          <div class="pb-ov-label">Active Models</div>
          <div class="pb-ov-val">${active.length}</div>
          <div class="pb-ov-sub">Trading models currently in use</div>
        </div>
        <div class="pb-ov-card">
          <div class="pb-ov-label">Core Rules</div>
          <div class="pb-ov-val">${rules.length}</div>
          <div class="pb-ov-sub">Non-negotiable execution rules</div>
        </div>
        <div class="pb-ov-card readiness">
          <div class="pb-ov-ring-wrap">
            <svg viewBox="0 0 44 44" class="pb-ov-ring">
              <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border2)" stroke-width="4"></circle>
              <circle cx="22" cy="22" r="18" fill="none" stroke="${ringColor}" stroke-width="4"
                      stroke-dasharray="${dash} ${circumference}" stroke-linecap="round" transform="rotate(-90 22 22)"></circle>
            </svg>
          </div>
          <div>
            <div class="pb-ov-label">Playbook Readiness</div>
            <div class="pb-ov-val" style="font-size:17px">${score}%</div>
            <button class="pb-readiness-link" onclick="_pbToggleReadinessDetail()">View breakdown</button>
          </div>
        </div>
        <div class="pb-ov-card">
          <div class="pb-ov-label">Current Focus</div>
          <div class="pb-ov-val" style="font-size:13.5px">${focus ? _pbEsc(focus.title || focus.strategyName) : 'No active models'}</div>
          <div class="pb-ov-sub">${focus ? _pbEsc(focus.sub || (focus.pinned ? 'Pinned model' : 'Most recently updated')) : 'Create a model to get started'}</div>
        </div>
      </div>
      <div class="pb-readiness-detail" id="pb-readiness-detail">
        <div class="pb-readiness-detail-title">Readiness Breakdown</div>
        ${checks.map(c => `<div class="pb-rd-row"><svg class="icn ${c.ok ? 'ok' : 'warn'}" style="width:14px;height:14px;flex-shrink:0;margin-top:1px" aria-hidden="true"><use href="#${c.ok ? 'ic-check-c' : 'ic-warning'}"></use></svg><span>${c.label}</span></div>`).join('')}
      </div>`;
  }

  const insEl = document.getElementById('pb-insights');
  if (insEl) {
    const insights = _pbInsights();
    insEl.innerHTML = insights.length ? `
      <div class="pb-panel">
        <div class="pb-panel-title"><svg class="icn" style="width:12px;height:12px" aria-hidden="true"><use href="#ic-sparkle"></use></svg> Playbook Insights</div>
        ${insights.map(t => `<div class="pb-insight-row"><span class="dot"></span>${t}</div>`).join('')}
      </div>` : '';
  }
}

function _pbToggleReadinessDetail() {
  document.getElementById('pb-readiness-detail')?.classList.toggle('open');
}

/* ── model card badges (optional metadata, progressive disclosure) ── */
function _pbModelBadges(m) {
  const badges = [];
  if (m.category) badges.push(`<span class="pb-tag">${_pbEsc(m.category)}</span>`);
  if (m.session) badges.push(`<span class="pb-tag">${_pbEsc(m.session)}</span>`);
  if (m.market) badges.push(`<span class="pb-tag">${_pbEsc(m.market)}</span>`);
  if (m.quality) badges.push(`<span class="pb-tag">${_pbEsc(m.quality)}</span>`);
  (m.tags || []).forEach(t => badges.push(`<span class="pb-tag">${_pbEsc(t)}</span>`));
  return badges.join('');
}

/* ── expand/collapse state for model step lists (UI-only, not persisted) ── */
const _pbExpanded = new Set();
function _pbToggleExpand(mi) {
  if (_pbExpanded.has(mi)) _pbExpanded.delete(mi); else _pbExpanded.add(mi);
  buildPlaybook();
}

/* ── MAIN RENDER — replaces the buildPlaybook() from accounts.js ── */
function buildPlaybook() {
  _pbRenderHeaderAndOverview();

  const mc = document.getElementById('model-cards');
  if (mc) {
    const models = (_pbData.models || []).filter(m => m.status !== 'deleted');
    if (!models.length) {
      mc.innerHTML = `<div class="pb-model-empty">
        <div class="pb-empty-title">Build your trading edge</div>
        <div class="pb-empty-desc">Create structured trading models that define your setup conditions, confirmations, execution, and targets.</div>
        <button class="wl-add-week-btn" onclick="pbAddModelModal()">Create Your First Model</button>
      </div>`;
    } else {
      mc.innerHTML = models.map((m, mi) => {
        const isArchived = m.status === 'archived';
        const sName = m.strategyName || m.title;
        const fromLab = !!m.sourceStrategyId;
        const labStrategyStillExists = fromLab && (typeof _blGetById === 'function') && !!_blGetById(m.sourceStrategyId);
        const stepCount = (m.steps || []).length;
        const expanded = _pbExpanded.has(mi);
        const updated = m.updatedAt ? _pbTimeAgo(m.updatedAt) : null;
        const badges = _pbModelBadges(m);

        return `
        <div class="pb-model-card${isArchived ? ' archived' : ''}${m.pinned ? ' pinned' : ''}${expanded ? ' expanded' : ''}">
          <div class="pb-model-top">
            <div class="pb-model-title-wrap">
              <div class="pb-model-title-row">
                <div class="pb-model-title">${_pbEsc(m.title)}</div>
                <span class="pb-badge status-${isArchived ? 'archived' : 'active'}">${isArchived ? 'Archived' : 'Active'}</span>
                ${m.dir ? `<span class="pb-badge dir">${_pbEsc(m.dir)}</span>` : ''}
                ${m.pinned ? `<span class="pb-badge pin"><svg class="icn" style="width:9px;height:9px" aria-hidden="true"><use href="#ic-star"></use></svg> Pinned</span>` : ''}
                ${fromLab ? `<span class="pb-badge lab"${labStrategyStillExists ? ` onclick="nav('backtesting', document.querySelector('.sb-item[onclick*=&quot;backtesting&quot;]'), 'Backtesting Lab')" title="Open in Backtesting Lab"` : ' title="Original Lab strategy has since been removed"'}><svg class="icn" style="width:9px;height:9px" aria-hidden="true"><use href="#ic-flask"></use></svg> Lab</span>` : ''}
              </div>
              ${m.sub ? `<div class="pb-model-desc">${_pbEsc(m.sub)}</div>` : ''}
              ${sName !== m.title ? `<div style="margin-top:4px;font-size:10px;color:var(--gold);opacity:.75">Model tag: <strong>${_pbEsc(sName)}</strong></div>` : ''}
              ${fromLab && m.sourceStats && m.sourceStats.totalTests ? `<div style="margin-top:4px;font-size:10px;color:var(--text3)">Saved at ${m.sourceStats.winRate}% WR · ${m.sourceStats.profitFactor} PF over ${m.sourceStats.totalTests} tests</div>` : ''}
              ${badges ? `<div class="pb-model-tags">${badges}</div>` : ''}
              <div class="pb-model-meta">
                <span>${stepCount} Step${stepCount === 1 ? '' : 's'}</span>
                ${updated ? `<span class="sep">·</span><span>Updated ${updated}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="pb-model-actions">
            <button class="pb-icn-btn" title="Edit" onclick="pbEditModelModal(${mi})"><svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg></button>
            <button class="pb-icn-btn" title="Duplicate" onclick="pbDuplicateModel(${mi})"><svg class="icn" aria-hidden="true"><use href="#ic-copy"></use></svg></button>
            <button class="pb-icn-btn${m.pinned ? ' pinned' : ''}" title="${m.pinned ? 'Unpin' : 'Pin as current focus'}" onclick="pbTogglePinModel(${mi})"><svg class="icn" aria-hidden="true"><use href="#ic-star"></use></svg></button>
            <button class="pb-icn-btn" title="${isArchived ? 'Restore' : 'Archive'}" onclick="pbToggleArchiveModel(${mi})"><svg class="icn" aria-hidden="true"><use href="#${isArchived ? 'ic-restore' : 'ic-archive'}"></use></svg></button>
            <button class="pb-icn-btn pb-expand-btn" title="${expanded ? 'Collapse' : 'Expand'}" onclick="_pbToggleExpand(${mi})"><svg class="icn" aria-hidden="true"><use href="#ic-chevron-right"></use></svg></button>
          </div>
          <div class="pb-model-steps">
            <div class="pb-steps-inner">
              ${stepCount ? (m.steps || []).map((s, si) => `<div class="pb-step"><div class="pb-step-num">${String(si + 1).padStart(2, '0')}</div><div class="pb-step-text">${_pbEsc(s)}</div></div>`).join('') : `<div style="font-size:11.5px;color:var(--text3);font-style:italic">No execution steps added yet.</div>`}
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }

  const rl = document.getElementById('rules-list');
  if (rl) {
    const rules = _pbData.rules || [];
    if (!rules.length) {
      rl.innerHTML = `<div class="pb-rules-empty">
        <div class="pb-empty-title">Define your non-negotiables</div>
        <div class="pb-empty-desc">Create the rules that protect your capital and keep your execution consistent.</div>
        <button class="wl-add-week-btn" onclick="pbAddRule()">Add Your First Rule</button>
      </div>`;
    } else {
      rl.innerHTML = `<div class="pb-rules-grid">${rules.map((r, i) => {
        const cat = _pbRuleCategory(r);
        return `
        <div class="pb-rule-card">
          <div class="pb-rule-left"><div class="pb-rule-num">RULE ${String(i + 1).padStart(2, '0')}</div></div>
          <div class="pb-rule-body">
            <div class="pb-rule-text">${_pbEsc(r)}</div>
            ${cat ? `<span class="pb-rule-cat">${cat}</span>` : ''}
          </div>
          <div class="pb-rule-actions">
            <button class="pb-icn-btn" title="Move up" ${i === 0 ? 'disabled' : ''} onclick="_pbMoveRule(${i},-1)"><svg class="icn" aria-hidden="true"><use href="#ic-arrow-up"></use></svg></button>
            <button class="pb-icn-btn" title="Move down" ${i === rules.length - 1 ? 'disabled' : ''} onclick="_pbMoveRule(${i},1)"><svg class="icn" aria-hidden="true"><use href="#ic-arrow-down"></use></svg></button>
            <button class="pb-icn-btn" title="Delete" onclick="pbDeleteRule(${i})"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
          </div>
        </div>`;
      }).join('')}</div>`;
    }
  }
}

/* ── rule reordering (manual, keyboard/click-accessible fallback) ── */
function _pbMoveRule(i, dir) {
  const rules = _pbData.rules || [];
  const j = i + dir;
  if (j < 0 || j >= rules.length) return;
  const tmp = rules[i]; rules[i] = rules[j]; rules[j] = tmp;
  buildPlaybook();
  _pbSave();
}

/* ── pin / duplicate (new model actions) ─────────────── */
async function pbTogglePinModel(mi) {
  const m = _pbData.models[mi]; if (!m) return;
  const wasPinned = !!m.pinned;
  (_pbData.models || []).forEach(x => { x.pinned = false; }); // single current focus at a time
  m.pinned = !wasPinned;
  buildPlaybook();
  await _pbSave();
  showToast(m.pinned ? 'Pinned as current focus ✓' : 'Unpinned', 'restore');
}

async function pbDuplicateModel(mi) {
  const m = _pbData.models[mi]; if (!m) return;
  const copy = {
    ...m,
    title: `${m.title} (Copy)`,
    strategyName: `${m.strategyName || m.title} Copy`,
    steps: (m.steps || []).slice(),
    tags: (m.tags || []).slice(),
    status: 'active',
    pinned: false,
    updatedAt: Date.now(),
  };
  delete copy.sourceStrategyId;
  delete copy.sourceStats;
  _pbData.models.splice(mi + 1, 0, copy);
  buildPlaybook();
  await _pbSave();
  if (typeof _refreshStrategyDropdowns === 'function') _refreshStrategyDropdowns();
  showToast('Model duplicated ✓', 'restore');
}

/* ── model create/edit modal — extends the accounts.js version with
   optional setup-context fields behind progressive disclosure ── */
const PB_CATEGORIES = ['Liquidity Model', 'Entry Model', 'Reversal Model', 'Continuation Model', 'Range Model', 'SMT Model', 'Custom'];
const PB_SESSIONS = ['London', 'New York', 'London/NY Overlap', 'Any Session'];
const PB_MARKETS = ['Forex', 'Gold', 'Indices', 'Crypto', 'Synthetic Indices', 'Custom'];
const PB_QUALITY = ['A+ Setup', 'High Probability', 'Confirmation Required'];

function _pbSelectOptions(list, current) {
  return `<option value="">—</option>` + list.map(v => `<option value="${v}"${v === current ? ' selected' : ''}>${v}</option>`).join('');
}

function _openModelEditModal(mi) {
  const isNew = mi === null;
  const m = isNew ? { title: '', strategyName: '', sub: '', steps: [], status: 'active' } : _pbData.models[mi];
  if (!m) return;
  const existing = document.getElementById('pb-model-edit-overlay');
  if (existing) existing.remove();

  const hasContext = !!(m.category || m.session || m.market || m.quality || m.dir || (m.tags || []).length);

  const overlay = document.createElement('div');
  overlay.id = 'pb-model-edit-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal" style="max-width:560px;max-height:88vh">
    <div class="acc-manager-header">
      <span>${isNew ? '＋ Create Trading Model' : '<svg class="icn" aria-hidden="true"><use href="#ic-edit"></use></svg> Edit Model'}</span>
      <button onclick="document.getElementById('pb-model-edit-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="display:flex;flex-direction:column;gap:12px;padding:16px;overflow-y:auto">
      <div>
        <label class="bl-lbl">Model Title</label>
        <input type="text" id="pb-edit-title" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="e.g. IRL > ERL" value="${_pbEsc(m.title)}">
      </div>
      <div>
        <label class="bl-lbl">Model Tag <span class="bl-lbl-sub">(used in trade log)</span></label>
        <input type="text" id="pb-edit-stratname" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="e.g. IRL > ERL" value="${_pbEsc(m.strategyName || '')}">
      </div>
      <div>
        <label class="bl-lbl">Description</label>
        <input type="text" id="pb-edit-sub" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="One-line description of the setup…" value="${_pbEsc(m.sub)}">
      </div>
      <div>
        <label class="bl-lbl">Steps <span class="bl-lbl-sub">(one per line)</span></label>
        <textarea id="pb-edit-steps" class="acc-mgr-input" style="width:100%;box-sizing:border-box;min-height:120px;resize:vertical;font-size:12px;line-height:1.6" placeholder="Step 1&#10;Step 2&#10;Step 3…">${(m.steps || []).map(_pbEsc).join('\n')}</textarea>
      </div>

      <details ${hasContext ? 'open' : ''} style="border:1px solid var(--glass-border);border-radius:10px;padding:10px 12px">
        <summary style="cursor:pointer;font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Setup Context <span style="text-transform:none;font-weight:400">(optional)</span></summary>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <div><label class="bl-lbl">Category</label><select id="pb-edit-category" class="acc-mgr-input" style="width:100%;box-sizing:border-box">${_pbSelectOptions(PB_CATEGORIES, m.category)}</select></div>
          <div><label class="bl-lbl">Direction</label><input type="text" id="pb-edit-dir" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="Bullish, Bearish, Both…" value="${_pbEsc(m.dir || '')}"></div>
          <div><label class="bl-lbl">Session</label><select id="pb-edit-session" class="acc-mgr-input" style="width:100%;box-sizing:border-box">${_pbSelectOptions(PB_SESSIONS, m.session)}</select></div>
          <div><label class="bl-lbl">Market / Instrument</label><select id="pb-edit-market" class="acc-mgr-input" style="width:100%;box-sizing:border-box">${_pbSelectOptions(PB_MARKETS, m.market)}</select></div>
          <div><label class="bl-lbl">Setup Quality</label><select id="pb-edit-quality" class="acc-mgr-input" style="width:100%;box-sizing:border-box">${_pbSelectOptions(PB_QUALITY, m.quality)}</select></div>
          <div><label class="bl-lbl">Tags <span class="bl-lbl-sub">(comma-separated)</span></label><input type="text" id="pb-edit-tags" class="acc-mgr-input" style="width:100%;box-sizing:border-box" placeholder="London, Liquidity…" value="${_pbEsc((m.tags || []).join(', '))}"></div>
        </div>
      </details>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
        ${!isNew ? `<button onclick="pbDeleteModel(${mi})" class="acc-mgr-btn del" style="padding:6px 14px;margin-right:auto"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg> Delete</button>` : ''}
        <button onclick="document.getElementById('pb-model-edit-overlay').remove()" class="acc-mgr-btn" style="padding:6px 14px">Cancel</button>
        <button onclick="_pbSaveModelModal(${isNew ? 'null' : mi})" class="acc-mgr-add-btn" style="padding:6px 18px">Save</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.getElementById('pb-edit-title')?.focus();
}

async function _pbSaveModelModal(mi) {
  const isNew = mi === null;
  const title = document.getElementById('pb-edit-title')?.value.trim();
  const stratN = document.getElementById('pb-edit-stratname')?.value.trim();
  const sub = document.getElementById('pb-edit-sub')?.value.trim() || '';
  const stepsRaw = document.getElementById('pb-edit-steps')?.value || '';
  const steps = stepsRaw.split('\n').map(s => s.trim()).filter(Boolean);
  const category = document.getElementById('pb-edit-category')?.value || '';
  const dir = document.getElementById('pb-edit-dir')?.value.trim() || '';
  const session = document.getElementById('pb-edit-session')?.value || '';
  const market = document.getElementById('pb-edit-market')?.value || '';
  const quality = document.getElementById('pb-edit-quality')?.value || '';
  const tags = (document.getElementById('pb-edit-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);

  if (!title) { showToast('Title is required', 'danger'); return; }
  const strategyName = stratN || title;

  if (isNew) {
    const model = { title, strategyName, sub, steps, status: 'active', updatedAt: Date.now() };
    if (category) model.category = category;
    if (dir) model.dir = dir;
    if (session) model.session = session;
    if (market) model.market = market;
    if (quality) model.quality = quality;
    if (tags.length) model.tags = tags;
    _pbData.models.push(model);
  } else {
    const target = _pbData.models[mi];
    Object.assign(target, { title, strategyName, sub, steps, updatedAt: Date.now() });
    ['category', 'dir', 'session', 'market', 'quality'].forEach((key, idx) => {
      const val = [category, dir, session, market, quality][idx];
      if (val) target[key] = val; else delete target[key];
    });
    if (tags.length) target.tags = tags; else delete target.tags;
  }

  document.getElementById('pb-model-edit-overlay')?.remove();
  buildPlaybook(); await _pbSave();
  if (typeof _refreshStrategyDropdowns === 'function') _refreshStrategyDropdowns();
  showToast(isNew ? 'Model added ✓' : 'Model updated ✓', 'restore');
}

/* ── Review Before Trading ───────────────────────────── */
let _pbReviewIdx = 0;

function _pbOpenReview() {
  _pbReviewIdx = 0;
  const existing = document.getElementById('pb-review-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'pb-review-overlay';
  overlay.className = 'acc-manager-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
  <div class="acc-manager-modal pb-review-modal">
    <div class="acc-manager-header">
      <span><svg class="icn" aria-hidden="true"><use href="#ic-eye"></use></svg> Review Before Trading</span>
      <button onclick="document.getElementById('pb-review-overlay').remove()" class="acc-mgr-close"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
    </div>
    <div class="acc-manager-body" style="padding:18px" id="pb-review-body"></div>
  </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  _pbRenderReview();
}

function _pbRenderReview() {
  const body = document.getElementById('pb-review-body');
  if (!body) return;
  const active = _pbActiveModels();
  const rules = _pbData.rules || [];
  const total = active.length + 1; // active models, then a final rules screen
  const onRulesScreen = _pbReviewIdx >= active.length;

  if (!active.length && !rules.length) {
    body.innerHTML = `<div class="pb-review-done">
      <div class="pb-empty-title">Nothing to review yet</div>
      <div class="pb-empty-desc">Add trading models and non-negotiable rules to your playbook, then review them here before your session.</div>
    </div>`;
    return;
  }

  if (onRulesScreen) {
    body.innerHTML = `
      <div class="pb-review-progress">Model ${Math.min(_pbReviewIdx + 1, total)} of ${total}</div>
      <div class="pb-review-track"><div class="pb-review-fill" style="width:${((_pbReviewIdx + 1) / total * 100)}%"></div></div>
      <div class="pb-review-title">Non-Negotiable Rules</div>
      <div class="pb-review-desc">These rules protect your capital, discipline, and long-term edge.</div>
      <div class="pb-review-rules">
        ${rules.length ? rules.map((r, i) => `<div class="pb-rule-card" style="cursor:default"><div class="pb-rule-left"><div class="pb-rule-num">${String(i + 1).padStart(2, '0')}</div></div><div class="pb-rule-body"><div class="pb-rule-text">${_pbEsc(r)}</div></div></div>`).join('') : `<div style="font-size:12px;color:var(--text3);font-style:italic">No rules defined yet.</div>`}
      </div>
      <div class="pb-review-nav">
        <button class="wl-week-btn" onclick="_pbReviewNav(-1)">← Back</button>
        <button class="wl-add-week-btn" onclick="_pbReviewFinish()">Playbook Reviewed ✓</button>
      </div>`;
    return;
  }

  const m = active[_pbReviewIdx];
  const badges = _pbModelBadges(m);
  body.innerHTML = `
    <div class="pb-review-progress">Model ${_pbReviewIdx + 1} of ${total}</div>
    <div class="pb-review-track"><div class="pb-review-fill" style="width:${((_pbReviewIdx + 1) / total * 100)}%"></div></div>
    <div class="pb-review-title">${_pbEsc(m.title)}</div>
    ${m.sub ? `<div class="pb-review-desc">${_pbEsc(m.sub)}</div>` : ''}
    ${badges ? `<div class="pb-model-tags" style="margin-top:9px">${badges}</div>` : ''}
    <div class="pb-review-steps">
      ${(m.steps || []).length ? m.steps.map((s, si) => `<div class="pb-step"><div class="pb-step-num">${String(si + 1).padStart(2, '0')}</div><div class="pb-step-text">${_pbEsc(s)}</div></div>`).join('') : `<div style="font-size:12px;color:var(--text3);font-style:italic">No execution steps added yet.</div>`}
    </div>
    <div class="pb-review-nav">
      <button class="wl-week-btn" ${_pbReviewIdx === 0 ? 'disabled' : ''} onclick="_pbReviewNav(-1)">← Back</button>
      <button class="wl-add-week-btn" onclick="_pbReviewNav(1)">Next →</button>
    </div>`;
}

function _pbReviewNav(dir) {
  _pbReviewIdx = Math.max(0, _pbReviewIdx + dir);
  _pbRenderReview();
}

function _pbReviewFinish() {
  const body = document.getElementById('pb-review-body');
  if (!body) return;
  body.innerHTML = `
    <div class="pb-review-done">
      <div class="pb-review-done-icon"><svg class="icn" aria-hidden="true"><use href="#ic-check-c"></use></svg></div>
      <div class="pb-empty-title">Playbook reviewed</div>
      <div class="pb-empty-desc">You've walked through every active model and your non-negotiable rules. Trade with discipline.</div>
      <button class="wl-add-week-btn" onclick="document.getElementById('pb-review-overlay').remove()">Done</button>
    </div>`;
}
