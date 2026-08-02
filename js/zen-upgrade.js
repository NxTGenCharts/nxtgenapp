/* ══════════════════════════════════════════════════════════════
   ZEN — Trader Mental Performance Center
   Additive module. Loaded after core-utils-ai.js / nav-dashboard-trades.js.
   Reads the same globals the rest of the app already uses (trades,
   localToday, _currentUser, sb, showToast, icon, nav).
   Tables (zen_checkins / zen_journal_entries / zen_guardrails) are
   optional — see supabase/zen_schema.sql. If they don't exist yet,
   every load/save here fails soft and logs a console warning; the
   page still works for the current session.
   ══════════════════════════════════════════════════════════════ */

(function () {

  // ── Reference data (matches the spec exactly) ──────────────────
  const ZEN_EMOTIONS = [
    { name: 'Calm',        neg: false },
    { name: 'Confident',   neg: false },
    { name: 'Focused',     neg: false },
    { name: 'Patient',     neg: false },
    { name: 'Neutral',     neg: false },
    { name: 'Anxious',     neg: true  },
    { name: 'Fearful',     neg: true  },
    { name: 'Frustrated',  neg: true  },
    { name: 'Angry',       neg: true  },
    { name: 'Impulsive',   neg: true  },
    { name: 'Overexcited', neg: true  },
    { name: 'Tired',       neg: true  },
    { name: 'Distracted',  neg: true  },
  ];
  const ZEN_INTENTS = [
    'Observe only',
    'Trade only A+ setups',
    'Normal trading session',
    'Reduced risk',
    'No trading today',
  ];
  const ZEN_FOCUS_LABELS = ['Very distracted', 'Distracted', 'Neutral', 'Focused', 'Fully focused'];
  const ZEN_CHECKLIST_ITEMS = [
    'I have confirmed my higher-timeframe bias.',
    'My setup matches my Playbook.',
    'I am not chasing price.',
    'I know my entry, stop loss, and target.',
    'My risk is within my rules.',
    'I accept that this trade may lose.',
    'I am not trading to recover a previous loss.',
    'I am willing to wait if the setup is incomplete.',
  ];
  const ZEN_RESET_PROMPTS = [
    'Step away from the chart for a moment.',
    'Relax your shoulders.',
    'Ask yourself: Is this setup in my Playbook, or am I reacting to price?',
    'A missed trade is not a reason to force the next one.',
    'Breathe out slowly. There will be another setup.',
  ];
  const ZEN_GUARDRAIL_TOGGLES = [
    { key: 'no_revenge',     label: 'No revenge trading' },
    { key: 'no_chasing',     label: 'No chasing missed entries' },
    { key: 'playbook_only',  label: 'Trade only Playbook setups' },
  ];

  // ── State ────────────────────────────────────────────────────
  let _zenBuilding = false;
  let _zenCheckin = { focus_score: null, energy_level: null, discipline_readiness: null, emotional_states: [], trading_intent: null };
  let _zenCheckinRowId = null;
  let _zenCheckinLoadedFor = null;
  let _zenSaveTimer = null;

  let _zenChecklistChecked = [];

  let _zenGuardrails = { max_trades: 2, max_consecutive_losses: 2, max_daily_risk: 1, cooldown_after_loss: 30, enabled_rules: ['no_revenge', 'no_chasing', 'playbook_only'] };
  let _zenGuardrailsRowId = null;
  let _zenGuardrailsLoaded = false;

  let _zenJournalEntries = [];
  let _zenJournalLoaded = false;
  let _zenJournalTodayId = null;

  let _zenAllCheckins = [];      // cached last-90-days checkins, used by insights + history
  let _zenAllCheckinsLoaded = false;

  let _zenHistMode = 'week';     // 'week' | 'month'
  let _zenHistAnchor = new Date();

  let _zenResetInterval = null;
  let _zenResetSeconds = 60;

  function _zenUid() {
    return (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.id : null;
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Entry point (called from nav()) ─────────────────────────────
  window.buildZen = async function () {
    if (!document.getElementById('page-zen') || _zenBuilding) return;
    _zenBuilding = true;
    try {
      zenLoadChecklistLocal();
      renderZenChecklist();
      renderZenPause();
      renderZenCheckinBody();
      renderZenReadinessBody();
      renderZenGuardrailsBody(); // loading placeholder while data loads

      const dateKey = localToday();
      if (_zenCheckinLoadedFor !== dateKey) await zenLoadCheckin(dateKey);
      renderZenCheckinBody();
      renderZenReadinessBody();

      if (!_zenGuardrailsLoaded) await zenLoadGuardrails();
      renderZenGuardrailsBody();

      if (!_zenJournalLoaded) await zenLoadJournal();
      renderZenJournalBody();

      if (!_zenAllCheckinsLoaded) await zenLoadAllCheckins();
      renderZenInsightsBody();
      renderZenHistoryBody();
    } finally {
      _zenBuilding = false;
    }
  };

  /* ════════════════════════════════════════════════════════════
     DAILY CHECK-IN
     ════════════════════════════════════════════════════════════ */

  async function zenLoadCheckin(dateKey) {
    _zenCheckin = { focus_score: null, energy_level: null, discipline_readiness: null, emotional_states: [], trading_intent: null };
    _zenCheckinRowId = null;
    const uid = _zenUid();
    if (!uid || typeof sb === 'undefined') { _zenCheckinLoadedFor = dateKey; return; }
    try {
      const { data, error } = await sb
        .from('zen_checkins')
        .select('id, focus_score, energy_level, discipline_readiness, emotional_states, trading_intent, readiness_score')
        .eq('user_id', uid)
        .eq('check_in_date', dateKey)
        .maybeSingle();
      if (error) { console.warn('zenLoadCheckin:', error.message); }
      else if (data) {
        _zenCheckinRowId = data.id;
        _zenCheckin = {
          focus_score: data.focus_score,
          energy_level: data.energy_level,
          discipline_readiness: data.discipline_readiness,
          emotional_states: Array.isArray(data.emotional_states) ? data.emotional_states : [],
          trading_intent: data.trading_intent,
        };
      }
    } catch (err) {
      console.warn('zenLoadCheckin failed (table may not exist yet):', err.message || err);
    }
    _zenCheckinLoadedFor = dateKey;
  }

  async function zenSaveCheckin() {
    const uid = _zenUid();
    if (!uid || typeof sb === 'undefined') return;
    const dateKey = localToday();
    const score = zenComputeReadiness(_zenCheckin);
    try {
      const row = {
        user_id: uid, check_in_date: dateKey,
        focus_score: _zenCheckin.focus_score, energy_level: _zenCheckin.energy_level,
        discipline_readiness: _zenCheckin.discipline_readiness, emotional_states: _zenCheckin.emotional_states,
        trading_intent: _zenCheckin.trading_intent, readiness_score: score,
        updated_at: new Date().toISOString(),
      };
      if (_zenCheckinRowId) {
        const { error } = await sb.from('zen_checkins').update(row).eq('id', _zenCheckinRowId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('zen_checkins').upsert(row, { onConflict: 'user_id,check_in_date' }).select('id').single();
        if (error) throw error;
        if (data) _zenCheckinRowId = data.id;
      }
      _zenAllCheckinsLoaded = false; // invalidate insights/history cache
    } catch (err) {
      console.warn('zenSaveCheckin failed (table may not exist yet — kept for this session):', err.message || err);
    }
  }

  function zenScheduleSave() {
    clearTimeout(_zenSaveTimer);
    _zenSaveTimer = setTimeout(zenSaveCheckin, 450);
  }

  window.zenSetFocus = function (n) {
    _zenCheckin.focus_score = (_zenCheckin.focus_score === n) ? null : n;
    renderZenCheckinBody(); renderZenReadinessBody(); zenScheduleSave();
  };
  window.zenToggleEmotion = function (name) {
    const i = _zenCheckin.emotional_states.indexOf(name);
    if (i === -1) _zenCheckin.emotional_states.push(name); else _zenCheckin.emotional_states.splice(i, 1);
    renderZenCheckinBody(); renderZenReadinessBody(); zenScheduleSave();
  };
  window.zenSetEnergy = function (v) {
    _zenCheckin.energy_level = (_zenCheckin.energy_level === v) ? null : v;
    renderZenCheckinBody(); renderZenReadinessBody(); zenScheduleSave();
  };
  window.zenSetDiscipline = function (n) {
    _zenCheckin.discipline_readiness = (_zenCheckin.discipline_readiness === n) ? null : n;
    renderZenCheckinBody(); renderZenReadinessBody(); zenScheduleSave();
  };
  window.zenSetIntent = function (val) {
    _zenCheckin.trading_intent = (_zenCheckin.trading_intent === val) ? null : val;
    renderZenCheckinBody(); zenScheduleSave();
  };

  function renderZenCheckinBody() {
    const body = document.getElementById('zen-checkin-body');
    if (!body) return;
    const c = _zenCheckin;

    const focusBtns = [1, 2, 3, 4, 5].map(n =>
      `<div class="zen-scale-btn ${c.focus_score === n ? 'active' : ''}" title="${ZEN_FOCUS_LABELS[n - 1]}" onclick="zenSetFocus(${n})">${n}</div>`
    ).join('');

    const emoChips = ZEN_EMOTIONS.map(e => {
      const active = c.emotional_states.includes(e.name);
      return `<div class="zen-chip ${active ? 'active' : ''}${active && e.neg ? ' negative' : ''}" onclick="zenToggleEmotion('${e.name}')">${e.name}</div>`;
    }).join('');

    const energyBtns = [['low', 'Low'], ['moderate', 'Moderate'], ['high', 'High']].map(([v, l]) =>
      `<div class="zen-seg-btn ${c.energy_level === v ? 'active' : ''}" onclick="zenSetEnergy('${v}')">${l}</div>`
    ).join('');

    const discBtns = [1, 2, 3, 4, 5].map(n =>
      `<div class="zen-scale-btn ${c.discipline_readiness === n ? 'active' : ''}" onclick="zenSetDiscipline(${n})">${n}</div>`
    ).join('');

    const intentBtns = ZEN_INTENTS.map(iOpt =>
      `<div class="zen-intent-opt ${c.trading_intent === iOpt ? 'active' : ''}" onclick="zenSetIntent('${iOpt.replace(/'/g, "\\'")}')">${iOpt}</div>`
    ).join('');

    body.innerHTML = `
      <div class="zen-checkin-block">
        <div class="zen-checkin-label">Focus</div>
        <div class="zen-scale">${focusBtns}</div>
      </div>
      <div class="zen-checkin-block">
        <div class="zen-checkin-label">Emotional state <span style="font-weight:400;text-transform:none;color:var(--text3)">· select any that apply</span></div>
        <div class="zen-chip-row">${emoChips}</div>
      </div>
      <div class="zen-checkin-block">
        <div class="zen-checkin-label">Energy level</div>
        <div class="zen-seg">${energyBtns}</div>
      </div>
      <div class="zen-checkin-block">
        <div class="zen-checkin-label">How likely are you to follow your plan today?</div>
        <div class="zen-scale">${discBtns}</div>
      </div>
      <div class="zen-checkin-block">
        <div class="zen-checkin-label">Trading intent</div>
        <div class="zen-intent-grid">${intentBtns}</div>
      </div>`;
  }

  /* ════════════════════════════════════════════════════════════
     READINESS SCORE
     ════════════════════════════════════════════════════════════ */

  function zenComputeReadiness(c) {
    const hasAny = c.focus_score || c.discipline_readiness || c.energy_level || (c.emotional_states && c.emotional_states.length);
    if (!hasAny) return null;
    const focus = c.focus_score || 3;
    const disc = c.discipline_readiness || 3;
    const energyMap = { low: 0.45, moderate: 0.75, high: 1 };
    const energyFactor = energyMap[c.energy_level] !== undefined ? energyMap[c.energy_level] : 0.75;
    let emo = 25;
    (c.emotional_states || []).forEach(name => {
      const def = ZEN_EMOTIONS.find(e => e.name === name);
      if (def) emo += def.neg ? -6 : 3;
    });
    emo = Math.max(0, Math.min(25, emo));
    const score = (focus / 5) * 30 + (disc / 5) * 30 + energyFactor * 15 + emo;
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  function zenReadinessMeta(score) {
    if (score >= 80) return { cls: 'ready', color: 'var(--teal)', tag: 'Ready', desc: 'You appear focused and emotionally prepared. Continue to follow your plan.' };
    if (score >= 60) return { cls: 'aware', color: 'var(--blue)', tag: 'Proceed with awareness', desc: 'Your mindset is generally stable, but stay deliberate and avoid forcing setups.' };
    if (score >= 40) return { cls: 'caution', color: '#fbbf24', tag: 'Caution', desc: 'Your current state may affect execution. Consider reduced risk, observation, or waiting for only your strongest setup.' };
    return { cls: 'pause', color: 'var(--red)', tag: 'Pause and reset', desc: 'Your current check-in suggests elevated emotional risk. Consider stepping away or choosing not to trade today.' };
  }

  function renderZenReadinessBody() {
    const wrap = document.getElementById('zen-readiness-body');
    if (!wrap) return;
    const score = zenComputeReadiness(_zenCheckin);
    if (score === null) {
      wrap.innerHTML = `<div class="zen-readiness-empty">Complete today's check-in to see your Zen Readiness Score.</div>`;
      return;
    }
    const meta = zenReadinessMeta(score);
    const C = 238.76; // 2 * PI * 38
    const offset = C * (1 - score / 100);
    wrap.innerHTML = `
      <div class="zen-readiness">
        <div class="zen-ring-wrap">
          <svg viewBox="0 0 88 88">
            <circle class="zen-ring-track" cx="44" cy="44" r="38"></circle>
            <circle class="zen-ring-fill" cx="44" cy="44" r="38" stroke="${meta.color}" stroke-dasharray="${C}" stroke-dashoffset="${offset}"></circle>
          </svg>
          <div class="zen-ring-num"><span class="n">${score}</span><span class="lbl">/ 100</span></div>
        </div>
        <div class="zen-readiness-copy">
          <div class="zen-readiness-tag ${meta.cls}">${meta.tag}</div>
          <div class="zen-readiness-desc">${meta.desc}</div>
        </div>
      </div>
      <div class="zen-disclaimer">A self-awareness and decision-support tool — not medical or psychological advice. It never blocks trading.</div>
      ${zenAiCoachButtonHtml()}`;
  }

  function zenAiCoachButtonHtml() {
    if (typeof aiPageTab !== 'function') return '';
    return `<button class="wl-week-btn" style="margin-top:10px;width:100%;justify-content:center" onclick="zenAskAiCoach()">${typeof icon === 'function' ? icon('ai-coach-robot') : ''} Ask AI Coach about this check-in</button>`;
  }

  window.zenAskAiCoach = function () {
    const c = _zenCheckin;
    const parts = [];
    if (c.emotional_states && c.emotional_states.length) parts.push(`feeling ${c.emotional_states.join(', ').toLowerCase()}`);
    if (c.focus_score) parts.push(`focus at ${c.focus_score}/5`);
    if (c.energy_level) parts.push(`${c.energy_level} energy`);
    if (c.discipline_readiness) parts.push(`plan-following likelihood ${c.discipline_readiness}/5`);
    if (c.trading_intent) parts.push(`intent: ${c.trading_intent}`);
    const summary = parts.length ? parts.join('; ') : 'no check-in details recorded yet';
    const prompt = `Here's my Zen check-in for today — ${summary}. Based on this, what should I keep in mind before trading? Keep it practical and focused on trading discipline, not medical advice.`;

    const sbEl = document.querySelector(`.sb-item[onclick*="nav('ai'"]`);
    if (typeof nav === 'function') nav('ai', sbEl, 'AI Coach');
    setTimeout(() => {
      if (typeof aiPageTab === 'function') aiPageTab('chat');
      const inp = document.getElementById('chat-input');
      if (inp) {
        inp.value = prompt;
        if (typeof chatSend === 'function') chatSend();
      } else if (typeof showToast === 'function') {
        showToast('Open AI Coach to continue this conversation', 'info');
      }
    }, 60);
  };

  /* ════════════════════════════════════════════════════════════
     PRE-TRADE RESET CHECKLIST (session/local — no dedicated table)
     ════════════════════════════════════════════════════════════ */

  function zenChecklistKey() {
    return `zen_checklist_${_zenUid() || 'guest'}_${localToday()}`;
  }
  function zenLoadChecklistLocal() {
    try {
      const raw = localStorage.getItem(zenChecklistKey());
      _zenChecklistChecked = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(_zenChecklistChecked)) _zenChecklistChecked = [];
    } catch (e) { _zenChecklistChecked = []; }
  }
  function zenSaveChecklistLocal() {
    try { localStorage.setItem(zenChecklistKey(), JSON.stringify(_zenChecklistChecked)); } catch (e) {}
  }

  window.zenChecklistToggle = function (i) {
    const pos = _zenChecklistChecked.indexOf(i);
    if (pos === -1) _zenChecklistChecked.push(i); else _zenChecklistChecked.splice(pos, 1);
    zenSaveChecklistLocal();
    renderZenChecklist();
  };
  window.zenChecklistReset = function () {
    _zenChecklistChecked = [];
    zenSaveChecklistLocal();
    renderZenChecklist();
    if (typeof showToast === 'function') showToast('Checklist reset for a new setup', 'info');
  };

  function renderZenChecklist() {
    const body = document.getElementById('zen-checklist-body');
    if (!body) return;
    const total = ZEN_CHECKLIST_ITEMS.length;
    const n = _zenChecklistChecked.length;
    const items = ZEN_CHECKLIST_ITEMS.map((label, i) => {
      const done = _zenChecklistChecked.includes(i);
      return `<div class="zen-check-item ${done ? 'done' : ''}" role="checkbox" aria-checked="${done}" tabindex="0"
                onclick="zenChecklistToggle(${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();zenChecklistToggle(${i})}">
                <span class="zen-check-box">${typeof icon === 'function' ? icon('check-c') : ''}</span><span>${label}</span>
              </div>`;
    }).join('');

    let stateCls = 'incomplete', stateLbl = 'Incomplete';
    if (n === total) { stateCls = 'ready'; stateLbl = 'Ready'; }
    else if (n >= Math.ceil(total * 0.6)) { stateCls = 'nearly'; stateLbl = 'Nearly ready'; }

    const complete = n === total
      ? `<div class="zen-checklist-complete"><strong>Pre-trade check complete.</strong> You are prepared to execute according to your plan.</div>`
      : '';

    body.innerHTML = `
      <div class="zen-checklist">${items}</div>
      <div class="zen-checklist-foot">
        <span class="zen-checklist-progress">${n} of ${total} confirmed</span>
        <span class="zen-checklist-state ${stateCls}">${stateLbl}</span>
      </div>
      ${complete}
      <button class="wl-week-btn" style="margin-top:10px" onclick="zenChecklistReset()">${typeof icon === 'function' ? icon('refresh') : ''} Reset checklist</button>`;
  }

  /* ════════════════════════════════════════════════════════════
     PAUSE BEFORE YOU TRADE — 60-second reset
     ════════════════════════════════════════════════════════════ */

  function renderZenPause() {
    const body = document.getElementById('zen-pause-body');
    if (!body) return;
    body.innerHTML = `
      <div class="zen-pause-card">
        <div class="zen-pause-copy">
          <div class="t">Feeling impulsive, frustrated, or chasing price?</div>
          <div class="s">Take a short, structured pause before you act.</div>
        </div>
        <button class="wl-add-week-btn" onclick="zenOpenReset()">${typeof icon === 'function' ? icon('clock') : ''} Start 60-Second Reset</button>
      </div>`;
  }

  window.zenOpenReset = function () {
    const overlay = document.getElementById('zen-reset-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    _zenResetSeconds = 60;
    zenRenderResetTick(true);
    clearInterval(_zenResetInterval);
    _zenResetInterval = setInterval(() => {
      _zenResetSeconds -= 1;
      if (_zenResetSeconds <= 0) {
        clearInterval(_zenResetInterval);
        zenRenderResetDone();
      } else {
        zenRenderResetTick(false);
      }
    }, 1000);
  };

  window.zenCloseReset = function () {
    clearInterval(_zenResetInterval);
    const overlay = document.getElementById('zen-reset-overlay');
    if (overlay) overlay.classList.remove('open');
  };

  window.zenGoToPlaybookFromReset = function () {
    zenCloseReset();
    const sbEl = document.querySelector(`.sb-item[onclick*="nav('playbook'"]`);
    if (typeof nav === 'function') nav('playbook', sbEl, 'Trading Playbook');
  };

  function zenRenderResetTick(first) {
    const box = document.getElementById('zen-reset-content');
    if (!box) return;
    const elapsed = 60 - _zenResetSeconds;
    const promptIdx = Math.min(ZEN_RESET_PROMPTS.length - 1, Math.floor(elapsed / (60 / ZEN_RESET_PROMPTS.length)));
    const pct = Math.round((elapsed / 60) * 100);
    box.innerHTML = `
      <div class="zen-reset-count">${_zenResetSeconds}</div>
      <div class="zen-reset-prompt">${ZEN_RESET_PROMPTS[promptIdx]}</div>
      <div class="zen-reset-track"><div class="zen-reset-fill" style="width:${pct}%"></div></div>`;
  }

  function zenRenderResetDone() {
    const box = document.getElementById('zen-reset-content');
    if (!box) return;
    box.innerHTML = `
      <div class="zen-reset-done-badge">${typeof icon === 'function' ? icon('check-c') : ''} Reset complete</div>
      <div class="zen-reset-prompt">Take that clarity into your next decision.</div>
      <div class="zen-reset-actions">
        <button class="wl-week-btn" onclick="zenCloseReset()">Return to Zen</button>
        <button class="wl-add-week-btn" onclick="zenGoToPlaybookFromReset()">Review My Playbook</button>
      </div>`;
  }

  /* ════════════════════════════════════════════════════════════
     GUARDRAILS
     ════════════════════════════════════════════════════════════ */

  async function zenLoadGuardrails() {
    const uid = _zenUid();
    if (!uid || typeof sb === 'undefined') { _zenGuardrailsLoaded = true; return; }
    try {
      const { data, error } = await sb.from('zen_guardrails').select('*').eq('user_id', uid).maybeSingle();
      if (error) { console.warn('zenLoadGuardrails:', error.message); }
      else if (data) {
        _zenGuardrailsRowId = data.id;
        _zenGuardrails = {
          max_trades: data.max_trades ?? 2,
          max_consecutive_losses: data.max_consecutive_losses ?? 2,
          max_daily_risk: data.max_daily_risk ?? 1,
          cooldown_after_loss: data.cooldown_after_loss ?? 30,
          enabled_rules: Array.isArray(data.enabled_rules) ? data.enabled_rules : ['no_revenge', 'no_chasing', 'playbook_only'],
        };
      }
    } catch (err) {
      console.warn('zenLoadGuardrails failed (table may not exist yet):', err.message || err);
    }
    _zenGuardrailsLoaded = true;
  }

  window.zenSaveGuardrails = async function () {
    const maxTrades = parseInt(document.getElementById('zen-g-maxtrades')?.value, 10);
    const maxLosses = parseInt(document.getElementById('zen-g-maxlosses')?.value, 10);
    const maxRisk = parseFloat(document.getElementById('zen-g-maxrisk')?.value);
    const cooldown = parseInt(document.getElementById('zen-g-cooldown')?.value, 10);
    const rules = ZEN_GUARDRAIL_TOGGLES.filter(t => document.getElementById(`zen-g-rule-${t.key}`)?.checked).map(t => t.key);

    _zenGuardrails = {
      max_trades: isNaN(maxTrades) ? null : maxTrades,
      max_consecutive_losses: isNaN(maxLosses) ? null : maxLosses,
      max_daily_risk: isNaN(maxRisk) ? null : maxRisk,
      cooldown_after_loss: isNaN(cooldown) ? null : cooldown,
      enabled_rules: rules,
    };

    const uid = _zenUid();
    if (uid && typeof sb !== 'undefined') {
      try {
        const row = { user_id: uid, ..._zenGuardrails, updated_at: new Date().toISOString() };
        if (_zenGuardrailsRowId) {
          const { error } = await sb.from('zen_guardrails').update(row).eq('id', _zenGuardrailsRowId);
          if (error) throw error;
        } else {
          const { data, error } = await sb.from('zen_guardrails').upsert(row, { onConflict: 'user_id' }).select('id').single();
          if (error) throw error;
          if (data) _zenGuardrailsRowId = data.id;
        }
        if (typeof showToast === 'function') showToast('Guardrails saved', 'success');
      } catch (err) {
        console.warn('zenSaveGuardrails failed (table may not exist yet — kept for this session):', err.message || err);
        if (typeof showToast === 'function') showToast('Guardrails saved for this session', 'info');
      }
    }
    renderZenGuardrailsBody();
  };

  function zenTodaysTrades() {
    if (typeof trades === 'undefined' || !Array.isArray(trades)) return [];
    const today = localToday();
    return trades.filter(t => t.date === today);
  }

  function zenConsecutiveLosses() {
    if (typeof trades === 'undefined' || !Array.isArray(trades) || !trades.length) return 0;
    const sorted = [...trades].sort((a, b) => {
      if (a.date === b.date) return (b.id || 0) - (a.id || 0);
      return a.date < b.date ? 1 : -1;
    });
    let n = 0;
    for (const t of sorted) {
      if (t.outcome === 'Loss') n++;
      else break;
    }
    return n;
  }

  function zenDailyRiskUsed() {
    return zenTodaysTrades().reduce((sum, t) => {
      const r = parseFloat(String(t.risk || '').replace('%', ''));
      return sum + (isNaN(r) ? 0 : r);
    }, 0);
  }

  function renderZenGuardrailsBody() {
    const body = document.getElementById('zen-guardrails-body');
    if (!body) return;
    if (!_zenGuardrailsLoaded) { body.innerHTML = `<div class="zen-loading">Loading guardrails…</div>`; return; }

    const g = _zenGuardrails;
    const tradesToday = zenTodaysTrades().length;
    const consecLosses = zenConsecutiveLosses();
    const riskUsed = zenDailyRiskUsed();

    const rows = [];
    let worstState = null; // null | 'warn' | 'exceeded'

    if (g.max_trades) {
      const ratio = tradesToday / g.max_trades;
      const cls = tradesToday >= g.max_trades ? 'exceeded' : (ratio >= 0.6 ? 'warn' : '');
      if (cls === 'exceeded') worstState = 'exceeded'; else if (cls === 'warn' && worstState !== 'exceeded') worstState = 'warn';
      rows.push(`<div class="zen-guardrail-row"><span class="zen-guardrail-label">Trades today</span><span class="zen-guardrail-usage ${cls}">${tradesToday} / ${g.max_trades}</span></div>`);
    }
    if (g.max_consecutive_losses) {
      const ratio = consecLosses / g.max_consecutive_losses;
      const cls = consecLosses >= g.max_consecutive_losses ? 'exceeded' : (ratio >= 0.6 ? 'warn' : '');
      if (cls === 'exceeded') worstState = 'exceeded'; else if (cls === 'warn' && worstState !== 'exceeded') worstState = 'warn';
      rows.push(`<div class="zen-guardrail-row"><span class="zen-guardrail-label">Consecutive losses</span><span class="zen-guardrail-usage ${cls}">${consecLosses} / ${g.max_consecutive_losses}</span></div>`);
    }
    if (g.max_daily_risk) {
      const ratio = riskUsed / g.max_daily_risk;
      const cls = riskUsed >= g.max_daily_risk ? 'exceeded' : (ratio >= 0.6 ? 'warn' : '');
      if (cls === 'exceeded') worstState = 'exceeded'; else if (cls === 'warn' && worstState !== 'exceeded') worstState = 'warn';
      rows.push(`<div class="zen-guardrail-row"><span class="zen-guardrail-label">Daily risk used</span><span class="zen-guardrail-usage ${cls}">${riskUsed.toFixed(1)}% / ${g.max_daily_risk}%</span></div>`);
    }
    if (g.cooldown_after_loss) {
      rows.push(`<div class="zen-guardrail-row"><span class="zen-guardrail-label">Minimum wait after a loss</span><span class="zen-guardrail-usage">${g.cooldown_after_loss} min</span></div>`);
    }

    const reminderLbls = { no_revenge: 'No revenge trading', no_chasing: 'No chasing missed entries', playbook_only: 'Trade only Playbook setups' };
    (g.enabled_rules || []).forEach(key => {
      if (reminderLbls[key]) rows.push(`<div class="zen-guardrail-row"><span class="zen-guardrail-label">${reminderLbls[key]}</span><span class="zen-guardrail-usage" style="color:var(--purple)">On</span></div>`);
    });

    let alert = '';
    if (worstState === 'exceeded') alert = `<div class="zen-guardrail-alert exceeded">Guardrail exceeded — consider ending the session or switching to observation mode.</div>`;
    else if (worstState === 'warn') alert = `<div class="zen-guardrail-alert warn">Approaching your daily trade limit.</div>`;

    const toggles = ZEN_GUARDRAIL_TOGGLES.map(t =>
      `<label class="zen-toggle-row"><input type="checkbox" id="zen-g-rule-${t.key}" ${g.enabled_rules.includes(t.key) ? 'checked' : ''}>${t.label}</label>`
    ).join('');

    body.innerHTML = `
      <div class="zen-guardrail-list">${rows.join('') || '<div class="zen-readiness-empty">Set your limits below to start tracking today\'s activity against them.</div>'}</div>
      ${alert}
      <div class="zen-guardrail-form">
        <div><label>Max trades / day</label><input class="form-input" type="number" min="0" id="zen-g-maxtrades" value="${g.max_trades ?? ''}"></div>
        <div><label>Max consecutive losses</label><input class="form-input" type="number" min="0" id="zen-g-maxlosses" value="${g.max_consecutive_losses ?? ''}"></div>
        <div><label>Max daily risk (%)</label><input class="form-input" type="number" min="0" step="0.1" id="zen-g-maxrisk" value="${g.max_daily_risk ?? ''}"></div>
        <div><label>Cooldown after a loss (min)</label><input class="form-input" type="number" min="0" id="zen-g-cooldown" value="${g.cooldown_after_loss ?? ''}"></div>
      </div>
      <div class="zen-guardrail-toggles">${toggles}</div>
      <button class="wl-add-week-btn" style="margin-top:12px" onclick="zenSaveGuardrails()">Save guardrails</button>
      <div class="zen-disclaimer">This is a behavioral warning system, not an enforcement mechanism — it never blocks trade creation.</div>`;
  }

  /* ════════════════════════════════════════════════════════════
     MINDSET JOURNAL
     ════════════════════════════════════════════════════════════ */

  async function zenLoadJournal() {
    const uid = _zenUid();
    if (!uid || typeof sb === 'undefined') { _zenJournalLoaded = true; return; }
    try {
      const { data, error } = await sb
        .from('zen_journal_entries')
        .select('id, entry_date, content, related_checkin_id, created_at, updated_at')
        .eq('user_id', uid)
        .order('entry_date', { ascending: false })
        .limit(60);
      if (error) { console.warn('zenLoadJournal:', error.message); }
      else if (data) {
        _zenJournalEntries = data;
        const today = localToday();
        const todayEntry = data.find(e => e.entry_date === today);
        _zenJournalTodayId = todayEntry ? todayEntry.id : null;
      }
    } catch (err) {
      console.warn('zenLoadJournal failed (table may not exist yet):', err.message || err);
    }
    _zenJournalLoaded = true;
  }

  window.zenSaveJournal = async function () {
    const ta = document.getElementById('zen-journal-input');
    const content = (ta?.value || '').trim();
    if (!content) { if (typeof showToast === 'function') showToast('Write a short reflection first', 'info'); return; }
    const uid = _zenUid();
    if (!uid || typeof sb === 'undefined') { if (typeof showToast === 'function') showToast('Sign in to save journal entries', 'info'); return; }
    const dateKey = localToday();
    try {
      const row = { user_id: uid, entry_date: dateKey, content, related_checkin_id: _zenCheckinRowId, updated_at: new Date().toISOString() };
      if (_zenJournalTodayId) {
        const { error } = await sb.from('zen_journal_entries').update(row).eq('id', _zenJournalTodayId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('zen_journal_entries').upsert(row, { onConflict: 'user_id,entry_date' }).select('id').single();
        if (error) throw error;
        if (data) _zenJournalTodayId = data.id;
      }
      _zenJournalLoaded = false;
      await zenLoadJournal();
      renderZenJournalBody();
      if (typeof showToast === 'function') showToast('Journal entry saved', 'success');
    } catch (err) {
      console.warn('zenSaveJournal failed:', err.message || err);
      if (typeof showToast === 'function') showToast('Could not save entry — journal table may not exist yet', 'error');
    }
  };

  window.zenDeleteJournal = async function (id) {
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    const uid = _zenUid();
    if (!uid || typeof sb === 'undefined') return;
    try {
      const { error } = await sb.from('zen_journal_entries').delete().eq('id', id).eq('user_id', uid);
      if (error) throw error;
      _zenJournalLoaded = false;
      await zenLoadJournal();
      renderZenJournalBody();
      if (typeof showToast === 'function') showToast('Journal entry deleted', 'info');
    } catch (err) {
      console.warn('zenDeleteJournal failed:', err.message || err);
      if (typeof showToast === 'function') showToast('Could not delete entry', 'error');
    }
  };

  function renderZenJournalBody() {
    const body = document.getElementById('zen-journal-body');
    if (!body) return;
    if (!_zenJournalLoaded) { body.innerHTML = `<div class="zen-loading">Loading journal…</div>`; return; }

    const todayEntry = _zenJournalEntries.find(e => e.id === _zenJournalTodayId);
    const draft = todayEntry ? todayEntry.content : '';
    const metaText = todayEntry ? `Saved ${new Date(todayEntry.updated_at || todayEntry.created_at).toLocaleString()}` : 'Not saved yet today';

    const history = _zenJournalEntries.filter(e => e.id !== _zenJournalTodayId).slice(0, 20).map(e => `
      <div class="zen-journal-entry">
        <div class="zen-journal-entry-head">
          <span class="zen-journal-entry-date">${e.entry_date}</span>
          <button class="zen-journal-entry-del" onclick="zenDeleteJournal('${e.id}')" title="Delete entry">${typeof icon === 'function' ? icon('close') : '✕'}</button>
        </div>
        <div class="zen-journal-entry-text">${_esc(e.content)}</div>
      </div>`).join('');

    body.innerHTML = `
      <div class="zen-journal-prompts">What is influencing your mindset today? What do you need to do to trade your plan well?</div>
      <textarea class="form-input zen-journal-input" id="zen-journal-input" placeholder="Write a short reflection…">${_esc(draft)}</textarea>
      <div class="zen-journal-foot">
        <span class="zen-journal-meta">${metaText}</span>
        <button class="wl-add-week-btn" onclick="zenSaveJournal()">${todayEntry ? 'Update entry' : 'Save entry'}</button>
      </div>
      ${history ? `<div class="zen-journal-history">${history}</div>` : ''}`;
  }

  /* ════════════════════════════════════════════════════════════
     INSIGHTS
     ════════════════════════════════════════════════════════════ */

  async function zenLoadAllCheckins() {
    const uid = _zenUid();
    if (!uid || typeof sb === 'undefined') { _zenAllCheckinsLoaded = true; return; }
    try {
      const since = new Date(); since.setDate(since.getDate() - 90);
      const sinceKey = since.getFullYear() + '-' + String(since.getMonth() + 1).padStart(2, '0') + '-' + String(since.getDate()).padStart(2, '0');
      const { data, error } = await sb
        .from('zen_checkins')
        .select('check_in_date, focus_score, energy_level, discipline_readiness, emotional_states, trading_intent, readiness_score')
        .eq('user_id', uid)
        .gte('check_in_date', sinceKey)
        .order('check_in_date', { ascending: true });
      if (error) { console.warn('zenLoadAllCheckins:', error.message); }
      else if (data) _zenAllCheckins = data;
    } catch (err) {
      console.warn('zenLoadAllCheckins failed (table may not exist yet):', err.message || err);
    }
    _zenAllCheckinsLoaded = true;
  }

  function zenTradesByDate() {
    const map = {};
    if (typeof trades !== 'undefined' && Array.isArray(trades)) {
      trades.forEach(t => { (map[t.date] = map[t.date] || []).push(t); });
    }
    return map;
  }

  function renderZenInsightsBody() {
    const body = document.getElementById('zen-insights-body');
    if (!body) return;
    const checkins = _zenAllCheckins || [];
    if (checkins.length < 3) {
      body.innerHTML = `<div class="zen-insight-empty">Keep checking in to unlock meaningful mindset patterns.</div>`;
      return;
    }

    const rows = [];
    const iconWrap = name => typeof icon === 'function' ? icon(name) : '';

    // Average readiness this week
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekKey = weekAgo.getFullYear() + '-' + String(weekAgo.getMonth() + 1).padStart(2, '0') + '-' + String(weekAgo.getDate()).padStart(2, '0');
    const weekCheckins = checkins.filter(c => c.check_in_date >= weekKey && c.readiness_score != null);
    if (weekCheckins.length) {
      const avg = Math.round(weekCheckins.reduce((a, c) => a + c.readiness_score, 0) / weekCheckins.length);
      rows.push(`<div class="zen-insight-row">${iconWrap('activity')}<span>Your average readiness this week: <strong>${avg}</strong></span></div>`);
    }

    // Most common emotional state
    const emoCount = {};
    checkins.forEach(c => (c.emotional_states || []).forEach(e => { emoCount[e] = (emoCount[e] || 0) + 1; }));
    const topEmo = Object.entries(emoCount).sort((a, b) => b[1] - a[1])[0];
    if (topEmo) {
      const pctDays = Math.round((topEmo[1] / checkins.length) * checkins.length); // count of days
      rows.push(`<div class="zen-insight-row">${iconWrap('tag')}<span>You reported “${topEmo[0]}” on ${topEmo[1]} of ${checkins.length} check-in days.</span></div>`);
    }

    // Plan-following consistency (proxy: discipline_readiness >= 4)
    const withDisc = checkins.filter(c => c.discipline_readiness != null);
    if (withDisc.length) {
      const highDisc = withDisc.filter(c => c.discipline_readiness >= 4).length;
      const pct = Math.round((highDisc / withDisc.length) * 100);
      rows.push(`<div class="zen-insight-row">${iconWrap('check-c')}<span>You rated yourself likely to follow your plan on ${pct}% of check-in days.</span></div>`);
    }

    // Calm days vs high-risk mindset days
    const calmDays = checkins.filter(c => (c.emotional_states || []).includes('Calm')).length;
    const highRiskDays = checkins.filter(c => c.readiness_score != null && c.readiness_score < 40).length;
    rows.push(`<div class="zen-insight-row">${iconWrap('smile')}<span>Calm trading days: <strong>${calmDays}</strong> · Elevated-risk mindset days: <strong>${highRiskDays}</strong></span></div>`);

    // Performance associated with focus level (win rate on high vs low focus days)
    const tByDate = zenTradesByDate();
    const perfForFocus = (pred) => {
      const dates = checkins.filter(pred).map(c => c.check_in_date);
      let wins = 0, total = 0;
      dates.forEach(d => (tByDate[d] || []).forEach(t => { if (t.outcome === 'Win' || t.outcome === 'Loss') { total++; if (t.outcome === 'Win') wins++; } }));
      return total >= 3 ? { wr: Math.round((wins / total) * 100), total } : null;
    };
    const highFocusPerf = perfForFocus(c => c.focus_score >= 4);
    const lowFocusPerf = perfForFocus(c => c.focus_score != null && c.focus_score <= 2);
    if (highFocusPerf) rows.push(`<div class="zen-insight-row">${iconWrap('target')}<span>On days you reported high focus, win rate was <strong>${highFocusPerf.wr}%</strong> across ${highFocusPerf.total} trades — associated with, not caused by, mindset.</span></div>`);
    if (lowFocusPerf) rows.push(`<div class="zen-insight-row">${iconWrap('warning')}<span>On days you reported low focus, win rate was <strong>${lowFocusPerf.wr}%</strong> across ${lowFocusPerf.total} trades. An observed pattern worth watching, not a guarantee.</span></div>`);

    body.innerHTML = rows.length
      ? `<div class="zen-insight-list">${rows.join('')}</div>`
      : `<div class="zen-insight-empty">Keep checking in to unlock meaningful mindset patterns.</div>`;
  }

  /* ════════════════════════════════════════════════════════════
     HISTORY
     ════════════════════════════════════════════════════════════ */

  function _zenFmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function zenHistRange() {
    const anchor = new Date(_zenHistAnchor);
    if (_zenHistMode === 'week') {
      const day = anchor.getDay();
      const start = new Date(anchor); start.setDate(anchor.getDate() - day);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { start, end, label: `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` };
    }
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start, end, label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }

  window.zenHistSetMode = function (mode) {
    _zenHistMode = mode;
    renderZenHistoryBody();
  };
  window.zenHistShift = function (dir) {
    const step = _zenHistMode === 'week' ? 7 : 30;
    const d = new Date(_zenHistAnchor);
    if (_zenHistMode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    _zenHistAnchor = d;
    renderZenHistoryBody();
  };

  function renderZenHistoryBody() {
    const body = document.getElementById('zen-history-body');
    if (!body) return;
    const { start, end, label } = zenHistRange();
    const startKey = _zenFmtDate(start), endKey = _zenFmtDate(end);
    const inRange = (_zenAllCheckins || []).filter(c => c.check_in_date >= startKey && c.check_in_date <= endKey);

    // Trend bars (day-by-day for week, week-buckets skipped for simplicity — show days for both, capped)
    const days = [];
    const cursor = new Date(start);
    while (cursor <= end && days.length < 31) { days.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
    const byDate = {};
    inRange.forEach(c => { byDate[c.check_in_date] = c; });

    const bars = days.map(d => {
      const key = _zenFmtDate(d);
      const c = byDate[key];
      const score = c ? c.readiness_score : null;
      const h = score != null ? Math.max(6, Math.round((score / 100) * 60)) : 3;
      const color = score == null ? 'var(--border)' : (score >= 80 ? 'var(--teal)' : score >= 60 ? 'var(--blue)' : score >= 40 ? '#fbbf24' : 'var(--red)');
      const lbl = _zenHistMode === 'week' ? d.toLocaleDateString(undefined, { weekday: 'narrow' }) : (d.getDate() % 5 === 0 ? d.getDate() : '');
      return `<div class="zen-hist-bar-wrap" title="${key}${score != null ? ' · ' + score : ' · no check-in'}">
        <div class="zen-hist-bar" style="height:${h}px;background:${color}"></div>
        <div class="zen-hist-bar-lbl">${lbl}</div>
      </div>`;
    }).join('');

    // Emotional state frequency
    const emoCount = {};
    inRange.forEach(c => (c.emotional_states || []).forEach(e => { emoCount[e] = (emoCount[e] || 0) + 1; }));
    const emoChips = Object.entries(emoCount).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, n]) => `<span class="zen-chip active" style="cursor:default">${name} · ${n}</span>`).join('');

    // Trading activity summary in range
    const rangeTrades = (typeof trades !== 'undefined' && Array.isArray(trades)) ? trades.filter(t => t.date >= startKey && t.date <= endKey) : [];
    const decided = rangeTrades.filter(t => t.outcome === 'Win' || t.outcome === 'Loss');
    const winRate = decided.length ? Math.round((decided.filter(t => t.outcome === 'Win').length / decided.length) * 100) : null;
    const withDisc = inRange.filter(c => c.discipline_readiness != null);
    const consistency = withDisc.length ? Math.round((withDisc.filter(c => c.discipline_readiness >= 4).length / withDisc.length) * 100) : null;

    body.innerHTML = `
      <div class="zen-hist-toggle">
        <button class="${_zenHistMode === 'week' ? 'active' : ''}" onclick="zenHistSetMode('week')">Weekly</button>
        <button class="${_zenHistMode === 'month' ? 'active' : ''}" onclick="zenHistSetMode('month')">Monthly</button>
      </div>
      <div class="zen-hist-nav">
        <button class="zen-hist-nav-btn" onclick="zenHistShift(-1)">${typeof icon === 'function' ? icon('arrow-left') : '‹'}</button>
        <span class="zen-hist-nav-mid">${label}</span>
        <button class="zen-hist-nav-btn" onclick="zenHistShift(1)">${typeof icon === 'function' ? icon('arrow-right') : '›'}</button>
      </div>
      <div class="zen-checkin-label">Readiness trend</div>
      <div class="zen-hist-trend">${bars || '<div class="zen-readiness-empty">No data for this period.</div>'}</div>
      ${emoChips ? `<div class="zen-checkin-label">Emotional state frequency</div><div class="zen-hist-emotion-freq">${emoChips}</div>` : ''}
      <div class="zen-checkin-label">Summary</div>
      <div class="zen-hist-summary">
        <div class="zen-hist-summary-card"><div class="zen-hist-summary-num">${inRange.length}</div><div class="zen-hist-summary-lbl">Check-ins</div></div>
        <div class="zen-hist-summary-card"><div class="zen-hist-summary-num">${winRate != null ? winRate + '%' : '—'}</div><div class="zen-hist-summary-lbl">Win rate (period)</div></div>
        <div class="zen-hist-summary-card"><div class="zen-hist-summary-num">${consistency != null ? consistency + '%' : '—'}</div><div class="zen-hist-summary-lbl">Plan-following days</div></div>
        <div class="zen-hist-summary-card"><div class="zen-hist-summary-num">${rangeTrades.length}</div><div class="zen-hist-summary-lbl">Trades logged</div></div>
      </div>`;
  }

})();
