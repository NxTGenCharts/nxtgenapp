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
    arrival: [
      'Let the last few hours settle. Whatever happened before this moment can wait outside this room.',
      "Nothing here requires you to react. For the next few minutes, there is nothing to chase and nothing to recover.",
      'Set your position, physically and mentally. Let your attention narrow to just this space.',
      "The market will still be there when you return. Right now, it doesn't need you.",
      'Notice any residue from your last trade — a win, a loss, a hesitation — and let it sit without needing to solve it.',
      "You don't owe the market an immediate response. Give yourself this pause first.",
      "Screens, notifications, other tabs — none of it needs your attention right now. Just this.",
      'This is a deliberate reset, not a break from discipline. It\u2019s part of it.',
    ],
    breathing: [
      'For the next stretch, let your breath lead. In through the nose, out slowly, with nothing forced.',
      'Match your attention to the rhythm on screen. There is nothing else to manage right now.',
      "If your mind drifts to a trade, a number, a decision — that's fine. Come back to the breath.",
      'A longer exhale than inhale tends to settle the nervous system. Let that happen on its own.',
      "This isn't about control. It's about noticing what happens when you stop forcing things.",
    ],
    body: [
      'Unclench your jaw. Let your tongue rest away from the roof of your mouth.',
      'Drop your shoulders away from your ears. Let your arms hang heavy.',
      "Open your hands. Notice where you've been gripping — a mouse, a pen, your own thoughts.",
      'Settle your weight evenly. Let your spine lengthen without effort.',
      "Soften your eyes. There's nothing you need to track right now.",
      'Let your breathing find its own rhythm — no need to control it yet.',
      "Notice where tension has collected. You don't have to fix it, just notice it.",
      'A steady body makes a steady mind easier to hold onto.',
    ],
    emotion: [
      "Name what's present, if anything is. You don't have to change it — just see it clearly.",
      'A feeling is information, not an instruction. You can notice frustration without acting on it.',
      "Whatever your last trade was, it isn't a verdict on your ability. It's one data point.",
      'The urge to make something happen right now is worth noticing — and worth setting down.',
      "Separate who you are from what the market just did. They aren't the same thing.",
      'If there\u2019s an impulse to recover a loss quickly, let it pass through without following it.',
    ],
    visualization: [
      "Picture your process, not a specific outcome — the setup you're waiting for, the conditions that confirm it.",
      "You don't need to force an opportunity that isn't there yet. Waiting is part of the work.",
      'See yourself checking your plan before your emotions, not after.',
      "A missed move isn't a mistake — it's the cost of only taking trades that meet your criteria.",
      "Picture your risk defined before you're in the trade, not while you're already in it.",
      "Your edge isn't predicting the market. It's executing your process consistently when it shows up.",
      "If nothing meets your conditions today, that's a valid outcome too.",
      "See yourself walking away from a trade that almost fits. Almost isn't your criteria.",
    ],
    commitment: [
      'I will wait for my setup to confirm before I act.',
      'I will size my risk before I decide anything else.',
      'I will not chase a move I missed.',
      'A loss will not decide my next trade — my plan will.',
      'I am responsible for my execution, not the outcome of any single trade.',
    ],
    closing: [
      "You're not returning to predict the market. You're returning to observe it.",
      'Your job from here is simple: watch for your conditions, and act only when they\u2019re met.',
      'Nothing about this moment requires urgency. Let the market come to you.',
      'Keep your attention on what\u2019s yours to control — your risk, your patience, your execution.',
      "You're ready to look at the screen again, without needing it to hand you anything right away.",
      "Take this composure with you. The market doesn't need to be won today — just handled well.",
    ],
  };

  // Short breathing-loop cues — spoken sparingly (see zsStartBreathingLoop),
  // never on every cycle, so the loop doesn't talk over the silence it's meant to create.
  const ZS_BREATH_CUES = {
    inhale: ['Breathe in.', 'In, gently.', 'Let the breath in.'],
    exhale: ['Breathe out, slowly.', 'Let it go.', 'Release, unhurried.'],
  };

  const ZS_BREATH_PATTERN = { inhale: 4, hold: 2, exhale: 6, rest: 2 }; // seconds — calm default

  // ── No-repeat line picker (per session) ─────────────────────────
  // Each pool (arrival/body/emotion/...) draws without replacement
  // until exhausted, then reshuffles, so a session never reads the
  // same line twice back-to-back and rarely repeats at all.
  let _zsUsedLines = {};
  function zsResetUsedLines() { _zsUsedLines = {}; }
  function zsPickLine(poolKey, pool) {
    if (!pool || !pool.length) return '';
    if (pool.length === 1) return pool[0];
    if (!_zsUsedLines[poolKey]) _zsUsedLines[poolKey] = new Set();
    const used = _zsUsedLines[poolKey];
    if (used.size >= pool.length) used.clear();
    let idx, guard = 0;
    do { idx = Math.floor(Math.random() * pool.length); guard++; }
    while (used.has(idx) && guard < 20);
    used.add(idx);
    return pool[idx];
  }
  function zsEstimateSpeechMs(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(700, Math.round(words * 340)); // ~176 wpm at a calm, natural pace
  }

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
  let _zsQuietTimer = null;
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

     Picks the calmest, most natural available female voice, speaks
     sentence-by-sentence with a brief natural gap between sentences
     (instead of one long run-on utterance), and exposes pause/resume
     so the pause control can genuinely hold position mid-line rather
     than cancel and restart it.
     ════════════════════════════════════════════════════════════ */

  let _zsPreferredVoice = null, _zsVoiceListPrimed = false;
  const ZS_PREFERRED_VOICE_NAMES = [
    'Samantha', 'Google UK English Female', 'Serena', 'Moira', 'Karen', 'Victoria', 'Ava',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Libby Online (Natural) - English (United Kingdom)',
    'Microsoft Zira Desktop - English (United States)',
    'Google US English',
  ];
  function zsPickVoice() {
    if (typeof window.speechSynthesis === 'undefined') return null;
    let voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!voices.length) return _zsPreferredVoice;
    for (const name of ZS_PREFERRED_VOICE_NAMES) {
      const v = voices.find(v => v.name === name);
      if (v) { _zsPreferredVoice = v; return v; }
    }
    const femaleHint = /female|zira|aria|jenny|libby|samantha|victoria|susan|karen|moira|serena|fiona|ava|emma|olivia|salli|joanna|kimberly|woman/i;
    const localEnFemale = voices.find(v => /^en/i.test(v.lang) && v.localService && femaleHint.test(v.name));
    if (localEnFemale) { _zsPreferredVoice = localEnFemale; return localEnFemale; }
    const enFemale = voices.find(v => /^en/i.test(v.lang) && femaleHint.test(v.name));
    if (enFemale) { _zsPreferredVoice = enFemale; return enFemale; }
    const localEn = voices.find(v => /^en/i.test(v.lang) && v.localService);
    if (localEn) { _zsPreferredVoice = localEn; return localEn; }
    const en = voices.find(v => /^en/i.test(v.lang));
    _zsPreferredVoice = en || voices[0] || null;
    return _zsPreferredVoice;
  }
  if (typeof window.speechSynthesis !== 'undefined') {
    try {
      window.speechSynthesis.addEventListener?.('voiceschanged', () => { if (!_zsVoiceListPrimed) { _zsVoiceListPrimed = true; zsPickVoice(); } });
    } catch (e) {}
  }

  const ZenNarration = {
    _queue: [],
    _speaking: false,
    _paused: false,
    _onEndCb: null,
    _onStartCb: null,
    _onBoundaryCb: null,

    supported() { return typeof window.speechSynthesis !== 'undefined'; },

    // opts: { onStart, onEnd, onBoundary }
    speak(text, opts) {
      opts = opts || {};
      this.stop(); // never let two utterances overlap
      if (_zsConfig.mode === 'silent' || _zsAudioPrefs.muted || !this.supported()) {
        // No audio will actually play — skip onStart so callers don't
        // animate a talking mouth with nothing being said (captions,
        // which are shown independently of this call, still cover it).
        if (typeof opts.onEnd === 'function') setTimeout(opts.onEnd, zsEstimateSpeechMs(text));
        return;
      }
      const sentences = String(text || '').split(/(?<=[.!?\u2026])\s+/).filter(Boolean);
      this._queue = sentences.length ? sentences : [String(text || '')];
      this._onEndCb = opts.onEnd || null;
      this._onStartCb = opts.onStart || null;
      this._onBoundaryCb = opts.onBoundary || null;
      this._speaking = true;
      this._paused = false;
      this._playNext();
    },

    _playNext() {
      if (!this._speaking) return;
      if (!this._queue.length) {
        this._speaking = false;
        const cb = this._onEndCb; this._onEndCb = null;
        if (typeof cb === 'function') cb();
        return;
      }
      const sentence = this._queue.shift();
      let u;
      try { u = new SpeechSynthesisUtterance(sentence); } catch (e) { this._speaking = false; return; }
      const voice = zsPickVoice();
      if (voice) u.voice = voice;
      u.rate = 0.96; u.pitch = 0.98; u.volume = _zsAudioPrefs.voiceVol;
      u.onstart = () => { if (typeof this._onStartCb === 'function') { this._onStartCb(); this._onStartCb = null; } };
      u.onboundary = (e) => { if (!e || e.name === 'word') { if (typeof this._onBoundaryCb === 'function') this._onBoundaryCb(); } };
      u.onend = () => { if (!this._speaking) return; setTimeout(() => this._playNext(), this._queue.length ? 260 : 0); };
      u.onerror = () => { if (!this._speaking) return; setTimeout(() => this._playNext(), 0); };
      try { window.speechSynthesis.speak(u); } catch (e) { this._speaking = false; }
    },

    pause() {
      this._paused = true;
      try { if (this.supported() && typeof window.speechSynthesis.pause === 'function') window.speechSynthesis.pause(); } catch (e) {}
    },
    resume() {
      if (!this._paused) return;
      this._paused = false;
      try { if (this.supported() && typeof window.speechSynthesis.resume === 'function') window.speechSynthesis.resume(); } catch (e) {}
    },
    stop() {
      this._queue = [];
      this._speaking = false;
      this._paused = false;
      this._onEndCb = null; this._onStartCb = null; this._onBoundaryCb = null;
      try { if (this.supported()) window.speechSynthesis.cancel(); } catch (e) {}
    },
  };

  // ── Unified speak call: drives narration + avatar lip-sync + captions together ──
  function zsAvatarTarget() { return document.getElementById('zs-live'); }
  function zsSpeakLine(text, opts) {
    opts = opts || {};
    const target = zsAvatarTarget();
    const hasAvatar = typeof window.ZenAvatar !== 'undefined';
    ZenNarration.speak(text, {
      onStart() {
        if (hasAvatar) { ZenAvatar.startTalking(target); }
        const wrap = target && target.querySelector('.zs-orb-wrap');
        if (wrap) wrap.classList.add('avatar-speaking');
        if (typeof opts.onStart === 'function') opts.onStart();
      },
      onBoundary() { if (hasAvatar) ZenAvatar.pulseMouth(target); },
      onEnd() {
        if (hasAvatar) { ZenAvatar.stopTalking(target); ZenAvatar.setState(target, opts.restState || 'listening'); }
        const wrap = target && target.querySelector('.zs-orb-wrap');
        if (wrap) wrap.classList.remove('avatar-speaking');
        if (typeof opts.onEnd === 'function') opts.onEnd();
      },
    });
  }

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

  // Shared central visual — the classic breathing orb, with the talking
  // avatar layered on top when the avatar module is available and
  // supported. idAttr is only applied to the wrap during the live
  // session (so the setup screen's copy never collides on id lookups
  // with the live one, since both can sit in the DOM at once).
  function zsOrbHtml(idAttr, extraChildren) {
    const hasAvatar = (typeof window.ZenAvatar !== 'undefined') && window.ZenAvatar.supported();
    const id = idAttr ? ` id="${idAttr}"` : '';
    const cls = 'zs-orb-wrap idle' + (hasAvatar ? ' zs-has-avatar' : '');
    return `
      <div class="${cls}"${id}>
        <div class="zs-orb-glow"></div><div class="zs-orb-ring r2"></div><div class="zs-orb-ring"></div><div class="zs-orb-core"></div>
        ${hasAvatar ? window.ZenAvatar.markup() : ''}
        ${extraChildren || ''}
      </div>`;
  }

  function zsRenderSetup() {
    const wrap = document.getElementById('zs-setup');
    if (!wrap) return;
    const d = ZS_DURATIONS.find(x => x.mins === _zsConfig.duration) || ZS_DURATIONS[1];
    const scale = [1, 2, 3, 4, 5].map(n =>
      `<div class="zs-p-seg-btn ${_zsReadinessBefore === n ? 'active' : ''}" style="min-width:38px" onclick="zsSetReadinessBefore(${n})">${n}</div>`
    ).join('');
    wrap.innerHTML = `
      ${zsOrbHtml()}
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
    zsResetUsedLines();
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
    clearInterval(_zsTickTimer); clearInterval(_zsLineTimer); clearInterval(_zsBreathTimer); clearTimeout(_zsQuietTimer);
    ZenNarration.stop(); // moving phases always cuts any in-flight line — never carries over or overlaps
    if (typeof window.ZenAvatar !== 'undefined') { window.ZenAvatar.stopTalking(zsAvatarTarget()); }
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
      // Visualization reads as more settled/concentrated than arrival or closing.
      zsStartLineCycle(phase, phase.key === 'visualization' ? 'focus' : 'listening');
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
      ${zsOrbHtml('zs-orb')}
      <div class="zs-guide-text" id="zs-guide-text" aria-live="polite"></div>`;
  }

  // Cycles through a phase's line pool with real pauses in between —
  // the line is spoken once, the avatar settles into "listening" while
  // it's read, and only after a beat does the next line begin. Total
  // cadence still respects the phase duration (per-line budget), it
  // just doesn't fill every second of it with speech.
  function zsStartLineCycle(phase, restState) {
    restState = restState || 'listening';
    const t0 = document.getElementById('zs-guide-text');
    if (_zsConfig.mode === 'silent') {
      // Silent focus: show only the phase title, no scripted lines.
      if (t0) t0.textContent = phase.title + '.';
      if (typeof window.ZenAvatar !== 'undefined') window.ZenAvatar.setState(zsAvatarTarget(), restState);
      return;
    }
    const lines = phase.lines;
    const per = Math.max(3.2, phase.duration / lines.length);
    const show = () => {
      const t = document.getElementById('zs-guide-text');
      if (!t) return;
      const line = zsPickLine(phase.key, lines);
      t.style.opacity = 0;
      clearTimeout(_zsQuietTimer);
      setTimeout(() => {
        if (!document.getElementById('zs-guide-text')) return; // phase moved on mid-fade
        t.textContent = line;
        t.style.opacity = _zsAudioPrefs.captions ? 1 : 0.001;
        if (_zsConfig.mode === 'guided') {
          zsSpeakLine(line, { restState });
        } else {
          if (typeof window.ZenAvatar !== 'undefined') window.ZenAvatar.setState(zsAvatarTarget(), restState);
        }
        // Let the line breathe: settle to a quieter avatar state for the
        // remainder of its on-screen dwell instead of talking the whole time.
        const quietAfter = Math.min(zsEstimateSpeechMs(line) + 500, per * 1000 * 0.75);
        _zsQuietTimer = setTimeout(() => {
          if (typeof window.ZenAvatar !== 'undefined') window.ZenAvatar.setState(zsAvatarTarget(), restState);
        }, quietAfter);
      }, _zsReducedMotion ? 0 : 250);
    };
    show();
    _zsLineTimer = setInterval(() => { if (!_zsPaused) show(); }, per * 1000);
  }

  function zsBreathingHtml() {
    const extra = `
        <div class="zs-breath-lbl" id="zs-breath-lbl">Breathe In</div>
        <div class="zs-breath-count" id="zs-breath-count"></div>`;
    return `
      ${zsOrbHtml('zs-orb', extra)}
      <div class="zs-guide-text" id="zs-guide-text" style="font-size:13px;color:rgba(238,244,244,0.55)">Let your breathing settle into this rhythm.</div>`;
  }

  function zsStartBreathingLoop() {
    const steps = [['inhale', 'Breathe In', ZS_BREATH_PATTERN.inhale], ['hold', 'Hold', ZS_BREATH_PATTERN.hold], ['exhale', 'Breathe Out', ZS_BREATH_PATTERN.exhale], ['rest', 'Rest', ZS_BREATH_PATTERN.rest]];
    let stepIdx = 0, stepElapsed = 0, cycles = 0;
    const target = zsAvatarTarget();
    if (typeof window.ZenAvatar !== 'undefined') window.ZenAvatar.setState(target, 'breathing');
    const apply = () => {
      const [cls, lbl, secs] = steps[stepIdx];
      const orb = document.getElementById('zs-orb');
      if (orb) {
        ['inhale', 'hold', 'exhale', 'rest'].forEach(c => orb.classList.remove(c));
        orb.classList.remove('idle');
        orb.classList.add(cls);
      }
      const lblEl = document.getElementById('zs-breath-lbl');
      if (lblEl) lblEl.textContent = lbl;
      if (stepIdx === 0 && stepElapsed === 0) cycles++;
      // Speak the cue for the first two full cycles, then let the
      // visual rhythm carry it — checking back in only occasionally
      // so the loop isn't narrating over every single breath.
      const shouldSpeak = _zsConfig.mode === 'guided' && stepElapsed === 0 && (cycles <= 2 || cycles % 4 === 0);
      if (shouldSpeak) {
        if (cls === 'inhale') zsSpeakLine(zsPickLine('breath-in', ZS_BREATH_CUES.inhale), { restState: 'breathing' });
        else if (cls === 'exhale') zsSpeakLine(zsPickLine('breath-out', ZS_BREATH_CUES.exhale), { restState: 'breathing' });
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
    if (typeof window.ZenAvatar !== 'undefined') setTimeout(() => window.ZenAvatar.setState(zsAvatarTarget(), 'focus'), 0);
    return `
      ${zsOrbHtml('zs-orb')}
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
    if (typeof window.ZenAvatar !== 'undefined') setTimeout(() => window.ZenAvatar.setState(zsAvatarTarget(), 'focus'), 0);
    return `
      ${zsOrbHtml('zs-orb')}
      <div class="zs-commit-line" id="zs-commit-line" aria-live="polite"></div>
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
        line.style.opacity = _zsAudioPrefs.captions ? 1 : 0.001;
        if (_zsConfig.mode === 'guided') zsSpeakLine(lines[_zsCommitIdx], { restState: 'focus' });
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
    const target = zsAvatarTarget();
    const wrap = target && target.querySelector('.zs-orb-wrap');
    if (_zsPaused) {
      // Genuinely hold position — pause() keeps the current utterance
      // queued instead of cancelling it, so resuming doesn't restart
      // the line from the beginning or talk over itself.
      ZenNarration.pause();
      if (typeof window.ZenAvatar !== 'undefined') { window.ZenAvatar.stopTalking(target); window.ZenAvatar.setState(target, 'listening'); }
      if (wrap) wrap.classList.remove('avatar-speaking');
    } else {
      ZenNarration.resume();
      // The browser resumes the audio itself; restart the visual side
      // (mouth movement, glow) if a line was actually mid-speech.
      if (ZenNarration._speaking && typeof window.ZenAvatar !== 'undefined') {
        window.ZenAvatar.startTalking(target);
        if (wrap) wrap.classList.add('avatar-speaking');
      }
    }
    zsRenderBottomForStage();
  };
  window.zsToggleSound = function () {
    _zsAudioPrefs.muted = !_zsAudioPrefs.muted;
    if (_zsAudioPrefs.muted) {
      ZenNarration.stop(); ZenAmbient.stop();
      if (typeof window.ZenAvatar !== 'undefined') { window.ZenAvatar.stopTalking(zsAvatarTarget()); window.ZenAvatar.setState(zsAvatarTarget(), 'listening'); }
    } else if (_zsStage === 'live') { ZenAmbient.start(); }
    zsSaveAudioPrefs();
    zsRenderBottomForStage();
  };
  window.zsToggleCaptions = function () {
    _zsAudioPrefs.captions = !_zsAudioPrefs.captions;
    zsSaveAudioPrefs();
    const t = document.getElementById('zs-guide-text') || document.getElementById('zs-commit-line');
    if (t && t.textContent) t.style.opacity = _zsAudioPrefs.captions ? 1 : 0.001;
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
      <button class="zs-icon-btn zs-cc-btn ${_zsAudioPrefs.captions ? 'zs-active' : ''}" onclick="zsToggleCaptions()" aria-label="${_zsAudioPrefs.captions ? 'Hide captions' : 'Show captions'}" title="${_zsAudioPrefs.captions ? 'Hide captions' : 'Show captions'}">CC</button>
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
    clearInterval(_zsTickTimer); clearInterval(_zsLineTimer); clearInterval(_zsBreathTimer); clearTimeout(_zsLineTimer); clearTimeout(_zsQuietTimer);
    ZenNarration.stop();
    ZenAmbient.stop();
    if (typeof window.ZenAvatar !== 'undefined') window.ZenAvatar.reset(zsAvatarTarget());
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
    clearInterval(_zsTickTimer); clearInterval(_zsLineTimer); clearInterval(_zsBreathTimer); clearTimeout(_zsQuietTimer);
    ZenNarration.stop(); ZenAmbient.stop();
    _zsStage = 'complete';
    zsShowStage('complete');
    document.getElementById('zs-phase-lbl').textContent = 'Session complete';
    document.getElementById('zs-remaining').textContent = '0:00';
    document.getElementById('zs-bottom').innerHTML = '';
    zsRenderComplete();
    if (typeof window.ZenAvatar !== 'undefined') window.ZenAvatar.setState(document.getElementById('zs-complete'), 'complete');
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
      <div class="zs-complete-orb">${zsOrbHtml()}</div>
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
