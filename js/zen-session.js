/* ══════════════════════════════════════════════════════════════
   ZEN SESSION — immersive guided pre-trade routine
   Additive module. Loaded after zen-upgrade.js. Reads the same
   globals the rest of the app already uses (_currentUser, sb,
   showToast, icon, nav, localToday) and reuses zenGoToPlaybookFromReset
   from zen-upgrade.js for the Playbook link. Does not modify or
   depend on zen-upgrade.js internal state — fully additive.

   Table (zen_sessions) is optional — see supabase/zen_sessions_schema.sql.
   If it doesn't exist yet, session history falls back to localStorage
   and logs a console warning; nothing else in the app is affected.

   AUDIO UPGRADE PATH: ZenNarration.speak() currently uses the
   browser's built-in speechSynthesis (free, no external dependency).
   ZenAmbient uses generated WebAudio tones for the background pad.
   To swap either for real recorded audio files later, only these
   two objects need to change — the phase engine, controls, and
   persistence below don't reference speechSynthesis/WebAudio
   directly anywhere else.
   ══════════════════════════════════════════════════════════════ */

(function () {

  const ZS_DURATIONS = [
    { mins: 5, label: 'Quick Reset', desc: 'Rapid emotional reset and breathing' },
    { mins: 10, label: 'Focus Reset', desc: 'Calm, focus, visualization, and trading preparation', recommended: true },
    { mins: 15, label: 'Full Pre-Trade Session', desc: 'Full mental and physical pre-trading routine' },
  ];
  const ZS_INTENTIONS = ['Calm my mind', 'Improve focus', 'Recover after a loss', 'Prepare before trading', 'Reduce impulsive behavior', 'Build discipline'];
  const ZS_MODES = [
    { key: 'guided', label: 'Guided', sub: 'Full spoken narration and visuals.' },
    { key: 'minimal', label: 'Minimal guidance', sub: 'On-screen prompts only, no voice.' },
    { key: 'silent', label: 'Silent focus', sub: 'Just breathing cues, no narration.' },
  ];
  const ZS_EMOTIONS = ['Calm', 'Focused', 'Neutral', 'Anxious', 'Frustrated', 'Impatient', 'Overconfident', 'Tired'];

  const ZS_LINES = {
    arrival: ['Welcome to Zen.', 'For the next few minutes, there is nothing to chase.', 'Let the market wait.', 'Sit comfortably and allow your attention to settle.'],
    breathing: ['Take a slow breath in through your nose.', 'Feel your lungs expand.', 'Hold gently.', 'Now breathe out slowly.', 'Release tension from your jaw, shoulders, hands, and chest.'],
    body: ['Notice your posture.', 'Relax your shoulders.', 'Unclench your jaw.', 'Release tension from your hands.', 'Feel your feet supported.', 'Allow your body to become steady and comfortable.'],
    emotion: ['Notice what you are feeling without judging it.', 'You do not need to act on every emotion.', 'Awareness gives you the ability to choose.'],
    visualization: ['Picture yourself waiting patiently for your setup.', 'You do not need to trade every movement.', 'You only need to execute your edge.', 'Let price come to your level.', 'Follow your process, not your emotions.', 'A missed trade is not a reason to force the next one.'],
    commitment: ['I will wait for confirmation.', 'I will respect my risk.', 'I will not chase.', 'I will accept losses without revenge trading.', 'I will protect my capital and my mindset.'],
    closing: ['You are prepared.', 'Trade with patience.', 'Trade with clarity.', 'Your edge is discipline.', 'Wait for your setup. Execute with intention.'],
  };

  const ZS_BREATH_PATTERN = { inhale: 4, hold: 2, exhale: 6, rest: 2 }; // seconds — calm default

  // ── Config (launcher selections) ──────────────────────────────
  let _zsConfig = { duration: 10, intention: null, mode: 'guided' };

  // ── Runtime session state ───────────────────────────────────────
  let _zsStage = 'closed';           // 'setup' | 'live' | 'complete' | 'closed'
  let _zsPhases = [];
  let _zsPhaseIdx = 0;
  let _zsPhaseElapsed = 0;           // seconds elapsed within current phase
  let _zsPaused = false;
  let _zsTickTimer = null;
  let _zsLineTimer = null;
  let _zsBreathTimer = null;
  let _zsBreathStep = 'inhale';
  let _zsBreathStepElapsed = 0;
  let _zsEmotionBefore = null;
  let _zsEmotionAfter = null;
  let _zsReadinessBefore = null;
  let _zsReadinessAfter = null;
  let _zsCommitted = false;
  let _zsCommitIdx = 0;
  let _zsSessionStartedAt = null;
  let _zsReducedMotion = (typeof matchMedia === 'function') && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Audio prefs (persisted locally — device/browser setting, not user profile data) ──
  let _zsAudioPrefs = { muted: false, voiceVol: 0.9, ambientVol: 0.35, captions: true };
  try {
    const raw = localStorage.getItem('zs_audio_prefs');
    if (raw) _zsAudioPrefs = Object.assign(_zsAudioPrefs, JSON.parse(raw));
  } catch (e) {}
  function zsSaveAudioPrefs() { try { localStorage.setItem('zs_audio_prefs', JSON.stringify(_zsAudioPrefs)); } catch (e) {} }

  let _zsHistory = [];
  let _zsHistoryLoaded = false;

  function _zsUid() { return (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.id : null; }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _ic(name) { return typeof icon === 'function' ? icon(name) : ''; }

  /* ════════════════════════════════════════════════════════════
     NARRATION (Web Speech API — see AUDIO UPGRADE PATH note above)
     ════════════════════════════════════════════════════════════ */
  const ZenNarration = {
    speak(text) {
      if (_zsConfig.mode === 'silent' || _zsAudioPrefs.muted) return;
      if (typeof window.speechSynthesis === 'undefined') return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.92; u.pitch = 1; u.volume = _zsAudioPrefs.voiceVol;
        window.speechSynthesis.speak(u);
      } catch (e) { /* speech synthesis unavailable — captions still show */ }
    },
    stop() { try { if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel(); } catch (e) {} },
  };

  /* ════════════════════════════════════════════════════════════
     AMBIENT SOUND (generated WebAudio pad — see AUDIO UPGRADE PATH note above)
     ════════════════════════════════════════════════════════════ */
  const ZenAmbient = {
    ctx: null, gain: null, nodes: [], running: false,
    start() {
      if (this.running || _zsAudioPrefs.muted) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.ctx.destination);
        const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 700; filt.connect(g);
        const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 110; o1.connect(filt);
        const o2 = this.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 164.81; o2.connect(filt);
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.045;
        const lfoGain = this.ctx.createGain(); lfoGain.gain.value = _zsAudioPrefs.ambientVol * 0.35;
        lfo.connect(lfoGain); lfoGain.connect(g.gain);
        o1.start(); o2.start(); lfo.start();
        g.gain.linearRampToValueAtTime(_zsAudioPrefs.ambientVol, this.ctx.currentTime + 2.5);
        this.gain = g; this.nodes = [o1, o2, lfo]; this.running = true;
      } catch (e) { console.warn('Zen ambient audio unavailable:', e.message || e); }
    },
    setVolume(v) { _zsAudioPrefs.ambientVol = v; if (this.gain && this.ctx) this.gain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.3); },
    stop() {
      if (!this.running) return;
      try {
        if (this.gain && this.ctx) this.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);
        const ctx = this.ctx, nodes = this.nodes;
        setTimeout(() => { try { nodes.forEach(n => n.stop && n.stop()); ctx.close(); } catch (e) {} }, 700);
      } catch (e) {}
      this.running = false; this.ctx = null; this.nodes = [];
    },
  };

  /* ════════════════════════════════════════════════════════════
     LAUNCHER (top-of-page card)
     ════════════════════════════════════════════════════════════ */

  window.zsSelectDuration = function (mins) { _zsConfig.duration = mins; renderZsLauncher(); };
  window.zsSelectIntention = function (v) { _zsConfig.intention = (_zsConfig.intention === v) ? null : v; renderZsLauncher(); };
  window.zsSelectMode = function (m) { _zsConfig.mode = m; renderZsLauncher(); };

  function renderZsLauncher() {
    const el = document.getElementById('zs-launcher');
    if (!el) return;
    const opts = ZS_DURATIONS.map(d => `
      <div class="zs-opt ${_zsConfig.duration === d.mins ? 'active' : ''}" tabindex="0" role="button" aria-pressed="${_zsConfig.duration === d.mins}"
           onclick="zsSelectDuration(${d.mins})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();zsSelectDuration(${d.mins})}">
        <div class="zs-opt-mins">${d.mins} min</div>
        <div class="zs-opt-name">${d.label}${d.recommended ? '<span class="zs-recommended-tag">Recommended</span>' : ''}</div>
        <div class="zs-opt-desc">${d.desc}</div>
      </div>`).join('');

    const intentChips = ZS_INTENTIONS.map(v =>
      `<div class="zs-p-chip ${_zsConfig.intention === v ? 'active' : ''}" onclick="zsSelectIntention('${v.replace(/'/g, "\\'")}')">${v}</div>`
    ).join('');

    const modeBtns = ZS_MODES.map(m =>
      `<div class="zs-p-seg-btn ${_zsConfig.mode === m.key ? 'active' : ''}" onclick="zsSelectMode('${m.key}')">${m.label}</div>`
    ).join('');
    const activeModeSub = (ZS_MODES.find(m => m.key === _zsConfig.mode) || {}).sub || '';

    el.innerHTML = `
      <div class="zs-launcher-top">
        <div class="zs-eyebrow">ZEN SESSION</div>
        <div class="zs-title-main">Reset your mind. Sharpen your focus. Trade with intention.</div>
        <div class="zs-tagline">Take 10–15 minutes to prepare your mind, body, and trading focus before the session.</div>
      </div>
      <div class="zs-options">${opts}</div>
      <div class="zs-personalize">
        <div>
          <div class="zs-p-label">Session intention <span style="font-weight:400;text-transform:none;color:var(--text3)">· optional</span></div>
          <div class="zs-p-chips">${intentChips}</div>
        </div>
        <div>
          <div class="zs-p-label">Guidance style</div>
          <div class="zs-p-seg">${modeBtns}</div>
          <div class="zs-p-seg-sub">${activeModeSub}</div>
        </div>
      </div>
      <div class="zs-cta-row">
        <button class="zs-cta" onclick="zsOpen()">${_ic('play')} Enter Zen Session</button>
      </div>`;
  }

  /* ════════════════════════════════════════════════════════════
     OVERLAY LIFECYCLE
     ════════════════════════════════════════════════════════════ */

  window.zsOpen = function () {
    const overlay = document.getElementById('zs-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    _zsStage = 'setup';
    _zsReadinessBefore = null; _zsReadinessAfter = null;
    _zsEmotionBefore = null; _zsEmotionAfter = null;
    _zsCommitted = false;
    zsShowStage('setup');
    zsRenderSetup();
    zsRenderBottomForStage();
    zsBuildParticles();
    zsUpdateTopForSetup();
    document.addEventListener('keydown', zsKeyHandler);
  };

  function zsKeyHandler(e) {
    if (e.key === 'Escape') zsRequestExit();
  }

  function zsShowStage(stage) {
    ['setup', 'live', 'complete'].forEach(s => {
      const n = document.getElementById('zs-' + s);
      if (n) n.classList.toggle('active', s === stage);
    });
  }

  function zsUpdateTopForSetup() {
    document.getElementById('zs-phase-lbl').textContent = 'Getting ready';
    document.getElementById('zs-remaining').textContent = _zsConfig.duration + ':00';
    document.getElementById('zs-progress').innerHTML = '';
  }

  function zsRenderSetup() {
    const wrap = document.getElementById('zs-setup');
    if (!wrap) return;
    const d = ZS_DURATIONS.find(x => x.mins === _zsConfig.duration) || ZS_DURATIONS[1];
    const scale = [1, 2, 3, 4, 5].map(n =>
      `<div class="zs-p-seg-btn ${_zsReadinessBefore === n ? 'active' : ''}" style="min-width:38px" onclick="zsSetReadinessBefore(${n})">${n}</div>`
    ).join('');
    wrap.innerHTML = `
      <div class="zs-orb-wrap idle"><div class="zs-orb-glow"></div><div class="zs-orb-ring r2"></div><div class="zs-orb-ring"></div><div class="zs-orb-core"></div></div>
      <div class="zs-setup-title">${d.label}</div>
      <div class="zs-setup-sub">${d.desc} — about ${d.mins} minutes.</div>
      <div class="zs-setup-summary">
        <div class="zs-setup-summary-row"><span>Duration</span><strong>${d.mins} minutes</strong></div>
        <div class="zs-setup-summary-row"><span>Intention</span><strong>${_zsConfig.intention || 'Not set'}</strong></div>
        <div class="zs-setup-summary-row"><span>Guidance</span><strong>${(ZS_MODES.find(m => m.key === _zsConfig.mode) || {}).label}</strong></div>
      </div>
      <div style="width:100%;margin-top:18px">
        <div class="zs-p-label" style="text-align:center;color:rgba(238,244,244,0.55)">How ready do you feel right now? <span style="font-weight:400;text-transform:none">(optional)</span></div>
        <div class="zs-p-seg" style="justify-content:center;gap:8px">${scale}</div>
      </div>
      <div class="zs-setup-actions">
        <button class="wl-week-btn" style="justify-content:center" onclick="zsCancelSetup()">Cancel</button>
        <button class="zs-cta" onclick="zsStartSession()">${_ic('play')} Start Session</button>
      </div>`;
  }

  window.zsSetReadinessBefore = function (n) { _zsReadinessBefore = (_zsReadinessBefore === n) ? null : n; zsRenderSetup(); };

  window.zsCancelSetup = function () { zsCloseOverlay(); };

  /* ════════════════════════════════════════════════════════════
     PHASE ENGINE
     ════════════════════════════════════════════════════════════ */

  function zsBuildPhases(mins) {
    const scale = mins / 10;
    const base = [
      { key: 'arrival', title: 'Arrival & Reset', type: 'guide', base: 60, lines: ZS_LINES.arrival },
      { key: 'breathing', title: 'Controlled Breathing', type: 'breathing', base: 150, lines: ZS_LINES.breathing },
      { key: 'body', title: 'Body & Tension Check', type: 'guide', base: 90, lines: ZS_LINES.body },
      { key: 'emotion', title: 'Emotional Awareness', type: 'emotion', base: 60, lines: ZS_LINES.emotion },
      { key: 'visualization', title: 'Trading Focus & Visualization', type: 'guide', base: 120, lines: ZS_LINES.visualization },
      { key: 'commitment', title: 'Trading Commitment', type: 'commitment', base: 60, lines: ZS_LINES.commitment },
      { key: 'closing', title: 'Return to the Market', type: 'guide', base: 60, lines: ZS_LINES.closing },
    ];
    if (mins === 5) {
      return [
        Object.assign({}, base[0], { duration: 20 }),
        Object.assign({}, base[1], { duration: 170 }),
        Object.assign({}, base[5], { duration: 70 }),
        Object.assign({}, base[6], { duration: 40 }),
      ];
    }
    return base.map(p => Object.assign({}, p, { duration: Math.round(p.base * scale) }));
  }

  window.zsStartSession = function () {
    _zsPhases = zsBuildPhases(_zsConfig.duration);
    _zsPhaseIdx = 0;
    _zsPaused = false;
    _zsCommitIdx = 0;
    _zsSessionStartedAt = Date.now();
    _zsStage = 'live';
    zsShowStage('live');
    zsRenderProgressDots();
    if (_zsAudioPrefs.ambientVol > 0) ZenAmbient.start();
    zsRunPhase(0);
  };

  function zsTotalSeconds() { return _zsPhases.reduce((s, p) => s + p.duration, 0); }

  function zsRenderProgressDots() {
    const wrap = document.getElementById('zs-progress');
    if (!wrap) return;
    wrap.innerHTML = _zsPhases.map((p, i) =>
      `<div class="zs-progress-dot ${i < _zsPhaseIdx ? 'done' : ''}" id="zs-dot-${i}"><div class="fill" style="width:${i < _zsPhaseIdx ? 100 : 0}%"></div></div>`
    ).join('');
  }

  function zsRunPhase(idx) {
    clearInterval(_zsTickTimer); clearInterval(_zsLineTimer); clearInterval(_zsBreathTimer);
    if (idx < 0) idx = 0;
    if (idx >= _zsPhases.length) { zsFinishSession(); return; }
    _zsPhaseIdx = idx; _zsPhaseElapsed = 0;
    const phase = _zsPhases[idx];
    document.getElementById('zs-phase-lbl').textContent = phase.title;
    zsRenderProgressDots();
    zsRenderBottomForStage();

    const live = document.getElementById('zs-live');
    if (phase.type === 'commitment') {
      _zsCommitIdx = 0;
      live.innerHTML = zsCommitmentHtml();
      zsNextCommitLine();
    } else if (phase.type === 'emotion') {
      live.innerHTML = zsEmotionHtml();
    } else if (phase.type === 'breathing') {
      live.innerHTML = zsBreathingHtml();
      zsStartBreathingLoop();
    } else {
      live.innerHTML = zsGuideHtml();
      zsStartLineCycle(phase);
    }

    _zsTickTimer = setInterval(() => {
      if (_zsPaused) return;
      _zsPhaseElapsed += 1;
      zsUpdateRemaining();
      const dot = document.getElementById('zs-dot-' + idx);
      if (dot) dot.querySelector('.fill').style.width = Math.min(100, Math.round((_zsPhaseElapsed / phase.duration) * 100)) + '%';
      if (_zsPhaseElapsed >= phase.duration) {
        // Commitment phase waits for user tap on the final line, not the clock, unless overrun
        if (phase.type === 'commitment' && !_zsCommitted && _zsPhaseElapsed < phase.duration + 20) return;
        zsRunPhase(idx + 1);
      }
    }, 1000);
    zsUpdateRemaining();
  }

  function zsUpdateRemaining() {
    const phase = _zsPhases[_zsPhaseIdx];
    if (!phase) return;
    const doneSecs = _zsPhases.slice(0, _zsPhaseIdx).reduce((s, p) => s + p.duration, 0) + _zsPhaseElapsed;
    const remain = Math.max(0, zsTotalSeconds() - doneSecs);
    const m = Math.floor(remain / 60), s = remain % 60;
    const el = document.getElementById('zs-remaining');
    if (el) el.textContent = m + ':' + String(s).padStart(2, '0');
  }

  function zsGuideHtml() {
    return `
      <div class="zs-orb-wrap idle" id="zs-orb"><div class="zs-orb-glow"></div><div class="zs-orb-ring r2"></div><div class="zs-orb-ring"></div><div class="zs-orb-core"></div></div>
      <div class="zs-guide-text" id="zs-guide-text"></div>`;
  }

  function zsStartLineCycle(phase) {
    if (_zsConfig.mode === 'silent') {
      // Silent focus: show only the phase title, no scripted lines.
      const t = document.getElementById('zs-guide-text');
      if (t) t.textContent = phase.title + '.';
      return;
    }
    const lines = phase.lines;
    const per = Math.max(2.5, phase.duration / lines.length);
    let i = 0;
    const show = () => {
      const t = document.getElementById('zs-guide-text');
      if (!t) return;
      t.style.opacity = 0;
      setTimeout(() => {
        t.textContent = lines[i % lines.length];
        t.style.opacity = 1;
        if (_zsConfig.mode === 'guided') ZenNarration.speak(lines[i % lines.length]);
      }, _zsReducedMotion ? 0 : 250);
      i++;
    };
    show();
    _zsLineTimer = setInterval(() => { if (!_zsPaused) show(); }, per * 1000);
  }

  function zsBreathingHtml() {
    return `
      <div class="zs-orb-wrap idle" id="zs-orb">
        <div class="zs-orb-glow"></div><div class="zs-orb-ring r2"></div><div class="zs-orb-ring"></div><div class="zs-orb-core"></div>
        <div class="zs-breath-lbl" id="zs-breath-lbl">Breathe In</div>
        <div class="zs-breath-count" id="zs-breath-count"></div>
      </div>
      <div class="zs-guide-text" id="zs-guide-text" style="font-size:13px;color:rgba(238,244,244,0.55)">Let your breathing settle into this rhythm.</div>`;
  }

  function zsStartBreathingLoop() {
    const steps = [['inhale', 'Breathe In', ZS_BREATH_PATTERN.inhale], ['hold', 'Hold', ZS_BREATH_PATTERN.hold], ['exhale', 'Breathe Out', ZS_BREATH_PATTERN.exhale], ['rest', 'Rest', ZS_BREATH_PATTERN.rest]];
    let stepIdx = 0, stepElapsed = 0;
    const apply = () => {
      const [cls, lbl, secs] = steps[stepIdx];
      const orb = document.getElementById('zs-orb');
      if (orb) orb.className = 'zs-orb-wrap ' + cls;
      const lblEl = document.getElementById('zs-breath-lbl');
      if (lblEl) lblEl.textContent = lbl;
      if (_zsConfig.mode === 'guided' && stepElapsed === 0) {
        if (cls === 'inhale') ZenNarration.speak('Breathe in.');
        else if (cls === 'exhale') ZenNarration.speak('Breathe out slowly.');
      }
    };
    apply();
    _zsBreathTimer = setInterval(() => {
      if (_zsPaused) return;
      stepElapsed += 1;
      const remain = Math.max(0, steps[stepIdx][2] - stepElapsed);
      const cEl = document.getElementById('zs-breath-count');
      if (cEl) cEl.textContent = remain > 0 ? String(remain) : '';
      if (stepElapsed >= steps[stepIdx][2]) {
        stepIdx = (stepIdx + 1) % steps.length;
        stepElapsed = 0;
        apply();
      }
    }, 1000);
  }

  function zsEmotionHtml() {
    const chips = ZS_EMOTIONS.map(e =>
      `<div class="zs-emo-chip ${_zsEmotionBefore === e ? 'active' : ''}" onclick="zsPickEmotionBefore('${e}')">${e}</div>`
    ).join('');
    return `
      <div class="zs-orb-wrap idle" id="zs-orb"><div class="zs-orb-glow"></div><div class="zs-orb-ring r2"></div><div class="zs-orb-ring"></div><div class="zs-orb-core"></div></div>
      <div class="zs-guide-text" id="zs-guide-text">${_zsConfig.mode === 'silent' ? 'Notice what you are feeling.' : 'Notice what you are feeling, without judging it.'}</div>
      <div class="zs-emo-grid">${chips}</div>
      <div style="font-size:10.5px;color:rgba(238,244,244,0.4);margin-top:10px">Optional — tap Next when ready.</div>`;
  }

  window.zsPickEmotionBefore = function (e) {
    _zsEmotionBefore = (_zsEmotionBefore === e) ? null : e;
    const live = document.getElementById('zs-live');
    if (live) live.innerHTML = zsEmotionHtml();
  };

  function zsCommitmentHtml() {
    const dots = ZS_LINES.commitment.map((_, i) => `<div class="zs-commit-dot" id="zs-cdot-${i}"></div>`).join('');
    return `
      <div class="zs-orb-wrap idle" id="zs-orb"><div class="zs-orb-glow"></div><div class="zs-orb-ring r2"></div><div class="zs-orb-ring"></div><div class="zs-orb-core"></div></div>
      <div class="zs-commit-line" id="zs-commit-line"></div>
      <div class="zs-commit-dots">${dots}</div>
      <div id="zs-commit-cta" style="margin-top:18px;width:100%;max-width:280px;display:none">
        <button class="zs-cta" onclick="zsCommitToPlan()">${_ic('check-c')} Commit to My Plan</button>
      </div>`;
  }

  function zsNextCommitLine() {
    const lines = ZS_LINES.commitment;
    const line = document.getElementById('zs-commit-line');
    const dot = document.getElementById('zs-cdot-' + _zsCommitIdx);
    if (dot) dot.classList.add('done');
    if (line) {
      line.style.opacity = 0;
      setTimeout(() => {
        line.textContent = lines[_zsCommitIdx];
        line.style.opacity = 1;
        if (_zsConfig.mode === 'guided') ZenNarration.speak(lines[_zsCommitIdx]);
      }, _zsReducedMotion ? 0 : 250);
    }
    _zsCommitIdx++;
    if (_zsCommitIdx < lines.length) {
      _zsLineTimer = setTimeout(zsNextCommitLine, Math.max(2500, (_zsPhases[_zsPhaseIdx].duration / lines.length) * 1000));
    } else {
      setTimeout(() => { const cta = document.getElementById('zs-commit-cta'); if (cta) cta.style.display = 'block'; }, 600);
    }
  }

  window.zsCommitToPlan = function () {
    _zsCommitted = true;
    const cta = document.getElementById('zs-commit-cta');
    if (cta) cta.innerHTML = `<div style="text-align:center;color:var(--teal);font-weight:700;font-size:13px">${_ic('check-c')} Plan committed</div>`;
    setTimeout(() => zsRunPhase(_zsPhaseIdx + 1), 900);
  };

  /* ── Manual controls ── */
  window.zsPrevPhase = function () { if (_zsStage !== 'live') return; zsRunPhase(Math.max(0, _zsPhaseIdx - 1)); };
  window.zsNextPhase = function () { if (_zsStage !== 'live') return; zsRunPhase(_zsPhaseIdx + 1); };
  window.zsTogglePause = function () {
    if (_zsStage !== 'live') return;
    _zsPaused = !_zsPaused;
    ZenNarration.stop();
    zsRenderBottomForStage();
  };
  window.zsToggleSound = function () {
    _zsAudioPrefs.muted = !_zsAudioPrefs.muted;
    if (_zsAudioPrefs.muted) { ZenNarration.stop(); ZenAmbient.stop(); } else if (_zsStage === 'live') { ZenAmbient.start(); }
    zsSaveAudioPrefs();
    zsRenderBottomForStage();
  };
  window.zsToggleFullscreen = function () {
    try {
      if (!document.fullscreenElement) document.getElementById('zs-overlay').requestFullscreen?.();
      else document.exitFullscreen?.();
    } catch (e) {}
  };

  function zsRenderBottomForStage() {
    const bar = document.getElementById('zs-bottom');
    if (!bar) return;
    if (_zsStage !== 'live') { bar.innerHTML = ''; return; }
    bar.innerHTML = `
      <button class="zs-icon-btn" onclick="zsPrevPhase()" aria-label="Previous phase" ${_zsPhaseIdx === 0 ? 'disabled style="opacity:.35;cursor:default"' : ''}>${_ic('skip-back')}</button>
      <button class="zs-icon-btn zs-primary" onclick="zsTogglePause()" aria-label="${_zsPaused ? 'Resume' : 'Pause'}">${_ic(_zsPaused ? 'play' : 'pause')}</button>
      <button class="zs-icon-btn" onclick="zsNextPhase()" aria-label="Next phase">${_ic('skip-forward')}</button>
      <button class="zs-icon-btn ${_zsAudioPrefs.muted ? '' : 'zs-active'}" onclick="zsToggleSound()" aria-label="${_zsAudioPrefs.muted ? 'Unmute' : 'Mute'}">${_ic(_zsAudioPrefs.muted ? 'volume-off' : 'volume')}</button>
      <button class="zs-icon-btn" onclick="zsToggleFullscreen()" aria-label="Toggle fullscreen">${_ic('expand')}</button>`;
  }

  /* ════════════════════════════════════════════════════════════
     EXIT HANDLING
     ════════════════════════════════════════════════════════════ */

  window.zsRequestExit = function () {
    if (_zsStage === 'live') {
      document.getElementById('zs-exit-confirm').classList.add('open');
    } else {
      zsCloseOverlay();
    }
  };
  window.zsCancelExit = function () { document.getElementById('zs-exit-confirm').classList.remove('open'); };
  window.zsConfirmExit = function () {
    document.getElementById('zs-exit-confirm').classList.remove('open');
    zsSaveSession(false);
    zsCloseOverlay();
  };

  function zsCloseOverlay() {
    clearInterval(_zsTickTimer); clearInterval(_zsLineTimer); clearInterval(_zsBreathTimer); clearTimeout(_zsLineTimer);
    ZenNarration.stop();
    ZenAmbient.stop();
    document.removeEventListener('keydown', zsKeyHandler);
    const overlay = document.getElementById('zs-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    _zsStage = 'closed';
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
  }

  /* ════════════════════════════════════════════════════════════
     COMPLETION
     ════════════════════════════════════════════════════════════ */

  function zsFinishSession() {
    clearInterval(_zsTickTimer); clearInterval(_zsLineTimer); clearInterval(_zsBreathTimer);
    ZenNarration.stop(); ZenAmbient.stop();
    _zsStage = 'complete';
    zsShowStage('complete');
    document.getElementById('zs-phase-lbl').textContent = 'Session complete';
    document.getElementById('zs-remaining').textContent = '0:00';
    document.getElementById('zs-bottom').innerHTML = '';
    zsRenderComplete();
  }

  function zsRenderComplete() {
    const wrap = document.getElementById('zs-complete');
    if (!wrap) return;
    const d = ZS_DURATIONS.find(x => x.mins === _zsConfig.duration) || ZS_DURATIONS[1];
    const scale = [1, 2, 3, 4, 5].map(n =>
      `<div class="zs-p-seg-btn ${_zsReadinessAfter === n ? 'active' : ''}" style="min-width:38px" onclick="zsSetReadinessAfter(${n})">${n}</div>`
    ).join('');
    const emoChips = ZS_EMOTIONS.map(e =>
      `<div class="zs-emo-chip ${_zsEmotionAfter === e ? 'active' : ''}" style="font-size:11px;padding:6px 11px" onclick="zsPickEmotionAfter('${e}')">${e}</div>`
    ).join('');

    wrap.innerHTML = `
      <div class="zs-complete-badge">Zen Session Complete</div>
      <div class="zs-complete-title">You are prepared.</div>
      <div class="zs-complete-copy">Your focus is clear. Your trading plan is active. Trade only when your setup is present.</div>
      <div class="zs-complete-stats">
        <div class="zs-complete-stat"><div class="n">${_zsReadinessBefore ? _zsReadinessBefore * 20 : '—'}</div><div class="l">Readiness before</div></div>
        <div class="zs-complete-stat"><div class="n">${d.mins} min</div><div class="l">${d.label}</div></div>
        <div class="zs-complete-stat"><div class="n">${_zsReadinessAfter ? _zsReadinessAfter * 20 : '—'}</div><div class="l">Readiness after</div></div>
      </div>
      <div style="width:100%;margin-top:18px" id="zs-after-block">
        <div class="zs-p-label" style="text-align:center;color:rgba(238,244,244,0.55)">How ready do you feel now? <span style="font-weight:400;text-transform:none">(optional)</span></div>
        <div class="zs-p-seg" style="justify-content:center;gap:8px">${scale}</div>
        <div class="zs-p-label" style="text-align:center;color:rgba(238,244,244,0.55);margin-top:14px">Current emotional state <span style="font-weight:400;text-transform:none">(optional)</span></div>
        <div class="zs-emo-grid">${emoChips}</div>
      </div>
      <div class="zs-complete-actions">
        <button class="zs-cta" onclick="zsFinishAndTrade()">${_ic('play')} Begin Trading</button>
        <button class="wl-week-btn" style="justify-content:center" onclick="zsFinishAndReviewPlaybook()">Review My Playbook</button>
        <button class="wl-week-btn" style="justify-content:center" onclick="zsRestartToLauncher()">Return to Zen</button>
      </div>`;
  }

  window.zsSetReadinessAfter = function (n) { _zsReadinessAfter = (_zsReadinessAfter === n) ? null : n; zsRenderComplete(); };
  window.zsPickEmotionAfter = function (e) { _zsEmotionAfter = (_zsEmotionAfter === e) ? null : e; zsRenderComplete(); };

  window.zsFinishAndTrade = function () { zsSaveSession(true); zsCloseOverlay(); if (typeof nav === 'function') nav('tradelog', document.querySelector(`.sb-item[onclick*="nav('tradelog'"]`), 'Trade Log'); };
  window.zsFinishAndReviewPlaybook = function () { zsSaveSession(true); zsCloseOverlay(); if (typeof zenGoToPlaybookFromReset === 'function') zenGoToPlaybookFromReset(); else if (typeof nav === 'function') nav('playbook', document.querySelector(`.sb-item[onclick*="nav('playbook'"]`), 'Trading Playbook'); };
  window.zsRestartToLauncher = function () { zsSaveSession(true); zsCloseOverlay(); };

  /* ════════════════════════════════════════════════════════════
     PARTICLES
     ════════════════════════════════════════════════════════════ */

  function zsBuildParticles() {
    const wrap = document.getElementById('zs-particles');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (_zsReducedMotion) return;
    const n = window.innerWidth < 640 ? 14 : 26;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'zs-particle';
      const left = Math.random() * 100;
      const dur = 14 + Math.random() * 16;
      const delay = Math.random() * 18;
      const drift = (Math.random() * 60 - 30) + 'px';
      p.style.left = left + '%';
      p.style.bottom = '-10px';
      p.style.animationDuration = dur + 's';
      p.style.animationDelay = delay + 's';
      p.style.setProperty('--zs-drift', drift);
      wrap.appendChild(p);
    }
  }

  /* ════════════════════════════════════════════════════════════
     PERSISTENCE — session history
     ════════════════════════════════════════════════════════════ */

  function zsLocalKey() { return `zen_sessions_${_zsUid() || 'guest'}`; }
  function zsLoadLocalHistory() {
    try { const raw = localStorage.getItem(zsLocalKey()); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function zsSaveLocalHistory(list) {
    try { localStorage.setItem(zsLocalKey(), JSON.stringify(list.slice(0, 60))); } catch (e) {}
  }

  async function zsSaveSession(completed) {
    if (!_zsSessionStartedAt) return; // never actually started (e.g. cancelled from setup)
    const d = ZS_DURATIONS.find(x => x.mins === _zsConfig.duration) || ZS_DURATIONS[1];
    const row = {
      session_date: (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10),
      duration_label: d.label,
      duration_minutes: d.mins,
      intention: _zsConfig.intention,
      mode: _zsConfig.mode,
      emotion_before: _zsEmotionBefore,
      emotion_after: _zsEmotionAfter,
      readiness_before: _zsReadinessBefore ? _zsReadinessBefore * 20 : null,
      readiness_after: _zsReadinessAfter ? _zsReadinessAfter * 20 : null,
      completed: !!completed,
      committed_to_plan: !!_zsCommitted,
    };
    _zsSessionStartedAt = null;

    const uid = _zsUid();
    let saved = false;
    if (uid && typeof sb !== 'undefined') {
      try {
        const { error } = await sb.from('zen_sessions').insert(Object.assign({ user_id: uid }, row));
        if (error) throw error;
        saved = true;
      } catch (err) {
        console.warn('zsSaveSession failed (table may not exist yet — saved locally instead):', err.message || err);
      }
    }
    if (!saved) {
      const list = zsLoadLocalHistory();
      list.unshift(Object.assign({ id: 'local_' + Date.now(), created_at: new Date().toISOString() }, row));
      zsSaveLocalHistory(list);
    }
    _zsHistoryLoaded = false;
    if (typeof showToast === 'function') showToast(completed ? 'Zen session saved' : 'Session ended', completed ? 'success' : 'info');
    renderZsHistoryBody();
  }

  async function zsLoadHistory() {
    const uid = _zsUid();
    if (uid && typeof sb !== 'undefined') {
      try {
        const { data, error } = await sb.from('zen_sessions').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(30);
        if (error) throw error;
        _zsHistory = data || [];
        _zsHistoryLoaded = true;
        return;
      } catch (err) {
        console.warn('zsLoadHistory failed (table may not exist yet — using local history):', err.message || err);
      }
    }
    _zsHistory = zsLoadLocalHistory();
    _zsHistoryLoaded = true;
  }

  function zsRelDate(dateStr) {
    if (!dateStr) return '';
    const today = (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10);
    if (dateStr === today) return 'Today';
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yKey = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    if (dateStr === yKey) return 'Yesterday';
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function renderZsHistoryBody() {
    const body = document.getElementById('zs-history-body');
    if (!body) return;
    if (!_zsHistoryLoaded) { await zsLoadHistory(); }
    const list = _zsHistory || [];
    if (!list.length) {
      body.innerHTML = `<div class="zen-readiness-empty">No Zen sessions yet — enter a session above to get started.</div>`;
      return;
    }
    const rows = list.slice(0, 8).map(s => `
      <div class="zs-hist-row">
        <div class="zs-hist-row-l">${zsRelDate(s.session_date)} — ${_esc(s.duration_label || '')} — ${s.duration_minutes || '?'} min <span class="d">${s.intention ? '· ' + _esc(s.intention) : ''}</span></div>
        <span class="zs-hist-badge ${s.completed ? 'completed' : 'partial'}">${s.completed ? 'Completed' : 'Partial'}</span>
      </div>`).join('');

    // Real, data-derived insights only.
    const insights = [];
    const today = (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekKey = weekAgo.getFullYear() + '-' + String(weekAgo.getMonth() + 1).padStart(2, '0') + '-' + String(weekAgo.getDate()).padStart(2, '0');
    const weekCompleted = list.filter(s => s.completed && s.session_date >= weekKey);
    if (weekCompleted.length) insights.push(`You completed ${weekCompleted.length} Zen session${weekCompleted.length === 1 ? '' : 's'} this week.`);

    const withDeltas = list.filter(s => s.readiness_before != null && s.readiness_after != null);
    if (withDeltas.length >= 3) {
      const avgDelta = Math.round(withDeltas.reduce((a, s) => a + (s.readiness_after - s.readiness_before), 0) / withDeltas.length);
      if (avgDelta > 0) insights.push(`Your average readiness improved by ${avgDelta} points after Zen sessions.`);
      else if (avgDelta < 0) insights.push(`Your average readiness dropped by ${Math.abs(avgDelta)} points after Zen sessions — worth a closer look.`);
    }

    const durCount = {};
    list.forEach(s => { if (s.duration_label) durCount[s.duration_label] = (durCount[s.duration_label] || 0) + 1; });
    const topDur = Object.entries(durCount).sort((a, b) => b[1] - a[1])[0];
    if (topDur && list.length >= 3) insights.push(`Your most-used session is ${topDur[0]} (${topDur[1]} time${topDur[1] === 1 ? '' : 's'}).`);

    body.innerHTML = `
      <div class="zs-hist-list">${rows}</div>
      ${insights.length ? `<div class="zs-hist-insight">${insights.map(i => `<div class="zs-hist-insight-row">${_ic('sparkle')}<span>${i}</span></div>`).join('')}</div>` : ''}`;
  }

  /* ════════════════════════════════════════════════════════════
     INIT — called from buildZen() in zen-upgrade.js
     ════════════════════════════════════════════════════════════ */

  window.buildZenSession = function () {
    renderZsLauncher();
    renderZsHistoryBody();
  };

})();
