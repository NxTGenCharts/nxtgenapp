/* ══════════════════════════════════════════════════════════════
   ZEN AVATAR — premium talking avatar for the Zen Focus Session
   Additive module. Loaded alongside zen-session.js. Exposes
   window.ZenAvatar with a small surface that zen-session.js calls
   into; nothing here reaches back into zen-session.js state.

   Design: a minimal, composed silhouette (not a literal photoreal
   face) rendered as inline SVG so it inherits the app's teal/cyan
   dark theme with no external image assets. Lip movement is driven
   by real speech-synthesis events (utterance start/boundary/end)
   when available, and by a timed fallback loop otherwise — so the
   mouth always tracks actual narration rather than a fixed clip.

   Every lookup is scoped to the container the caller passes in
   (normally #zs-live), never to a bare id — the setup/live/complete
   panels can all hold an avatar instance in the DOM at once (only
   one is visually active), so ids would collide across them.
   ══════════════════════════════════════════════════════════════ */

(function () {
  const STATES = ['idle', 'speaking', 'listening', 'breathing', 'focus', 'complete'];

  function supported() {
    try { return typeof SVGElement !== 'undefined' && typeof document.createElementNS === 'function'; }
    catch (e) { return false; }
  }

  /* Markup is intentionally class-only (no ids) so it's safe to be
     present in more than one hidden panel at the same time. */
  function markup() {
    return `
      <div class="zs-avatar state-idle" aria-hidden="true">
        <svg class="zsav-svg" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" focusable="false">
          <defs>
            <radialGradient id="zsavFaceGrad" cx="44%" cy="32%" r="72%">
              <stop offset="0%" stop-color="rgba(216,238,236,0.95)"/>
              <stop offset="50%" stop-color="rgba(94,150,148,0.46)"/>
              <stop offset="100%" stop-color="rgba(8,20,22,0.22)"/>
            </radialGradient>
            <linearGradient id="zsavAuraGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(45,212,191,0.32)"/>
              <stop offset="100%" stop-color="rgba(45,212,191,0)"/>
            </linearGradient>
          </defs>
          <ellipse class="zsav-shoulders" cx="110" cy="226" rx="88" ry="34" fill="url(#zsavAuraGrad)"></ellipse>
          <g class="zsav-head">
            <ellipse class="zsav-head-shape" cx="110" cy="102" rx="54" ry="62" fill="url(#zsavFaceGrad)"></ellipse>
            <path class="zsav-hair" d="M56 100 C52 46 78 24 110 24 C142 24 168 46 164 100 C160 66 138 52 110 52 C82 52 60 66 56 100 Z"></path>
            <path class="zsav-brow zsav-brow-l" d="M80 86 Q91 80 103 85"></path>
            <path class="zsav-brow zsav-brow-r" d="M117 85 Q129 80 140 86"></path>
            <g class="zsav-eye zsav-eye-l" transform="translate(92,98)">
              <ellipse class="zsav-eye-shape" cx="0" cy="0" rx="8" ry="5"></ellipse>
              <circle class="zsav-iris" cx="0" cy="0" r="3.1"></circle>
              <rect class="zsav-lid" x="-9" y="-7" width="18" height="7"></rect>
            </g>
            <g class="zsav-eye zsav-eye-r" transform="translate(128,98)">
              <ellipse class="zsav-eye-shape" cx="0" cy="0" rx="8" ry="5"></ellipse>
              <circle class="zsav-iris" cx="0" cy="0" r="3.1"></circle>
              <rect class="zsav-lid" x="-9" y="-7" width="18" height="7"></rect>
            </g>
            <path class="zsav-nose" d="M108 100 Q105 112 109 116"></path>
            <path class="zsav-mouth-neutral" d="M93 134 Q110 138 127 134"></path>
            <path class="zsav-mouth-content" d="M92 132 Q110 141 128 132"></path>
            <ellipse class="zsav-mouth-open" cx="110" cy="133" rx="12" ry="2"></ellipse>
          </g>
        </svg>
      </div>`;
  }

  function avatarEl(container) {
    if (!container) return null;
    return container.querySelector('.zs-avatar');
  }

  function setState(container, state) {
    const el = avatarEl(container);
    if (!el) return;
    if (STATES.indexOf(state) === -1) state = 'idle';
    STATES.forEach(s => el.classList.toggle('state-' + s, s === state));
  }

  /* ── Lip movement ──────────────────────────────────────────
     While speaking, the mouth aperture is nudged open/closed.
     zen-session.js calls pulseMouth() on each word boundary when
     the browser supports SpeechSynthesisUtterance 'boundary'
     events; startTalking()/stopTalking() bracket a whole utterance
     and run a soft fallback loop so the mouth still moves on
     browsers that never fire boundary events. */
  const _timers = new WeakMap();

  function mouthOpenEl(container) {
    const el = avatarEl(container);
    return el ? el.querySelector('.zsav-mouth-open') : null;
  }

  function pulseMouth(container) {
    const m = mouthOpenEl(container);
    if (!m) return;
    const openAmt = 0.55 + Math.random() * 0.45;
    m.style.opacity = '1';
    m.style.transform = 'scaleY(' + openAmt.toFixed(2) + ')';
    clearTimeout(m._zsavCloseT);
    m._zsavCloseT = setTimeout(() => {
      m.style.opacity = '0.15';
      m.style.transform = 'scaleY(0.25)';
    }, 90 + Math.random() * 70);
  }

  function startTalking(container) {
    setState(container, 'speaking');
    const el = avatarEl(container);
    if (!el) return;
    stopTalkingTimerOnly(container);
    // Fallback cadence in case the browser never fires boundary events.
    const t = setInterval(() => pulseMouth(container), 210 + Math.random() * 90);
    _timers.set(el, t);
  }

  function stopTalkingTimerOnly(container) {
    const el = avatarEl(container);
    if (!el) return;
    const t = _timers.get(el);
    if (t) { clearInterval(t); _timers.delete(el); }
  }

  function stopTalking(container) {
    stopTalkingTimerOnly(container);
    const m = mouthOpenEl(container);
    if (m) { m.style.opacity = '0'; m.style.transform = 'scaleY(0.3)'; clearTimeout(m._zsavCloseT); }
  }

  function reset(container) {
    stopTalking(container);
    setState(container, 'idle');
  }

  window.ZenAvatar = {
    supported,
    markup,
    setState,
    pulseMouth,
    startTalking,
    stopTalking,
    reset,
  };
})();
