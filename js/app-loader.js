/* ══════════════════════════════════════════════════════════════════════
   AppLoader — reusable global Loading Manager
   ──────────────────────────────────────────────────────────────────────
   Shows a full-screen branded splash (logo + circular spinner + rotating
   message) immediately on load, and keeps it in front of the app until
   every registered "readiness" task has resolved. Only then does it fade
   out and reveal the fully-populated UI — no skeletons, no popping in,
   no layout shift.

   Usage from any page/module:

     // Wait on a set of async startup tasks (auth, profile, stats, ...):
     await window.AppLoader.waitFor([
       checkAuth(),
       loadProfile(),
       loadDashboardStats(),
     ]);
     window.AppLoader.hide();

   Or, if a page just wants to block until it calls ready():
     window.AppLoader.hide();

   Safe to call hide()/show() multiple times — it's idempotent and will
   never stack multiple overlays.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.AppLoader) return; // never stack / re-init

  var MESSAGES = [
    'Preparing your dashboard...',
    'Loading your trading data...',
    'Syncing your analytics...'
  ];
  var MSG_ROTATE_MS = 2200;
  var MIN_VISIBLE_MS = 550;     // avoid an unpleasant "flash" on very fast loads
  var FADE_MS = 400;

  var overlay = null;
  var msgEl = null;
  var msgTimer = null;
  var msgIndex = 0;
  var shownAt = null;
  var hidden = false;
  var revealTargets = [];

  // Subsequent loads within the same tab session can skip the artificial
  // minimum-visible delay (data is likely warm/cached), so returning users
  // get an instant reveal instead of waiting out a splash they don't need.
  var isReturningVisit = false;
  try { isReturningVisit = sessionStorage.getItem('nxtgen_app_booted') === '1'; } catch (e) {}

  function q(sel) { return document.querySelector(sel); }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = q('#app-splash');
    msgEl = q('#app-splash-msg');
    return overlay;
  }

  function rotateMessage() {
    if (!msgEl) return;
    msgIndex = (msgIndex + 1) % MESSAGES.length;
    msgEl.style.opacity = '0';
    setTimeout(function () {
      msgEl.textContent = MESSAGES[msgIndex];
      msgEl.style.opacity = '1';
    }, 220);
  }

  function startRotating() {
    if (msgTimer || MESSAGES.length < 2) return;
    msgTimer = setInterval(rotateMessage, MSG_ROTATE_MS);
  }

  function stopRotating() {
    if (msgTimer) { clearInterval(msgTimer); msgTimer = null; }
  }

  function markRevealed() {
    // Elements that should only become visible once the splash is gone
    // (keeps them from flashing empty/partial content underneath it).
    revealTargets.forEach(function (el) { el.classList.add('app-ready'); });
    document.documentElement.classList.add('app-ready');
    document.body.classList.add('app-ready');
  }

  var AppLoader = {
    /** Register elements to reveal (fade in) once the splash is dismissed. */
    registerRevealTargets: function (selectors) {
      (selectors || []).forEach(function (sel) {
        var el = typeof sel === 'string' ? q(sel) : sel;
        if (el && revealTargets.indexOf(el) === -1) revealTargets.push(el);
      });
    },

    setMessage: function (text) {
      ensureOverlay();
      if (msgEl && text) msgEl.textContent = text;
    },

    show: function () {
      ensureOverlay();
      if (!overlay) return;
      hidden = false;
      overlay.classList.remove('app-splash-out');
      overlay.style.display = 'flex';
      if (!shownAt) shownAt = Date.now();
      startRotating();
    },

    /** Wait for an array of promises, then hide(). Rejections don't block —
     * a failed request shouldn't leave the user staring at a splash forever. */
    waitFor: function (promises) {
      ensureOverlay();
      return Promise.all((promises || []).map(function (p) {
        return Promise.resolve(p).catch(function (err) {
          console.error('[AppLoader] a startup task failed:', err);
          return null;
        });
      }));
    },

    /** Dismiss the splash and reveal the app. Idempotent + debounced against
     * the minimum-visible time so the logo never just "blinks". */
    hide: function () {
      if (hidden) return;
      hidden = true;
      ensureOverlay();
      stopRotating();

      var elapsed = shownAt ? Date.now() - shownAt : 0;
      var minWait = isReturningVisit ? 0 : MIN_VISIBLE_MS;
      var delay = Math.max(0, minWait - elapsed);

      setTimeout(function () {
        // Two RAFs: let any just-inserted chart/canvas content paint once
        // before we start the fade, so the reveal is genuinely "ready".
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            markRevealed();
            if (overlay) {
              overlay.classList.add('app-splash-out');
              setTimeout(function () {
                overlay.style.display = 'none';
              }, FADE_MS);
            }
            try { sessionStorage.setItem('nxtgen_app_booted', '1'); } catch (e) {}
          });
        });
      }, delay);
    }
  };

  window.AppLoader = AppLoader;

  // Kick off message rotation the instant this script runs — the splash
  // markup is already in the DOM (inlined before any other script), so
  // there's nothing to wait on here.
  document.addEventListener('DOMContentLoaded', function () {
    ensureOverlay();
    startRotating();
  });
  // In case DOMContentLoaded already fired by the time this executes.
  if (document.readyState !== 'loading') {
    ensureOverlay();
    startRotating();
  }
})();
