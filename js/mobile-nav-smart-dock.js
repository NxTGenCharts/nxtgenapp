// ════════════════════════════════════════════════════════════════
// SMART BOTTOM DOCK CONTROLLER
// ════════════════════════════════════════════════════════════════
// One global, reusable controller for the mobile bottom nav
// (#mob-bottom-nav). It hides the dock ~1.2s after the user stops
// scrolling/touching, and reveals it instantly on any scroll, touch,
// or tap — on every page, since the nav is a single persistent
// element the app's nav() router never re-creates.
//
// Pairs with css/mobile-nav-smart-dock.css, which owns the actual
// hidden/visible look (transform/opacity/blur) via the
// `mob-nav-dock-hidden` / `mob-nav-dock-kb-hidden` classes this file
// toggles.
//
// Mobile-only: bails out entirely above the 768px breakpoint the
// dock already uses, so desktop behaviour is untouched.
// ════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var HIDE_DELAY = 2300;       // ms of inactivity before hiding
  var SCROLL_THRESHOLD = 10;   // px — ignore tiny/accidental scrolls
  var KB_HEIGHT_DELTA = 140;   // px — viewport shrink treated as "keyboard open"
  var MQ = '(max-width: 768px)';

  var nav = null;
  var hideTimer = null;
  var reducedMotion = false;
  var isMobile = false;
  var kbOpen = false;
  var formLocked = false;      // focused on a form control (not necessarily kb)
  var lastScrollTop = {};      // per-scroll-container last position (WeakMap-lite via expando)

  function isMobileNow() {
    return typeof matchMedia === 'function' && matchMedia(MQ).matches;
  }

  function show() {
    if (!nav) return;
    clearTimeout(hideTimer);
    nav.classList.remove('mob-nav-dock-hidden');
    scheduleHide();
  }

  function hide() {
    if (!nav) return;
    if (formLocked || kbOpen) return; // never idle-hide while a form/dropdown is active
    nav.classList.add('mob-nav-dock-hidden');
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    if (!isMobile) return;
    hideTimer = setTimeout(hide, HIDE_DELAY);
  }

  // ── Scroll (any .page scroll container — scroll doesn't reliably
  // bubble, so listen in the capture phase on document to catch it
  // regardless of which element actually scrolled) ─────────────────
  var scrollTicking = false;
  function onScroll(e) {
    if (!isMobile) return;
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      scrollTicking = false;
      var top = el.scrollTop || 0;
      var key = el.id || (el.className && String(el.className)) || 'default';
      var last = lastScrollTop[key];
      lastScrollTop[key] = top;
      if (last === undefined) return; // first read for this container, no delta yet
      var delta = Math.abs(top - last);
      if (delta < SCROLL_THRESHOLD) return; // ignore accidental micro-scrolls
      show();
    });
  }

  // ── Touch / tap anywhere reveals immediately ──────────────────────
  function onTouch() {
    if (!isMobile) return;
    show();
  }

  // ── Keep visible while forms/dropdowns/text-selection are active ──
  var FORM_SEL = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  function onFocusIn(e) {
    if (!isMobile) return;
    var t = e.target;
    if (t && t.matches && t.matches(FORM_SEL)) {
      formLocked = true;
      clearTimeout(hideTimer);
      // Visibility itself is settled by the keyboard-detection resize
      // handler below (req. 8: keyboard open moves the dock away).
      // Until/unless the keyboard actually opens, keep the dock shown.
      if (!kbOpen) nav.classList.remove('mob-nav-dock-hidden');
    }
  }
  function onFocusOut(e) {
    if (!isMobile) return;
    var t = e.target;
    if (t && t.matches && t.matches(FORM_SEL)) {
      formLocked = false;
      scheduleHide();
    }
  }

  // ── On-screen keyboard detection via visualViewport resize ────────
  function onViewportResize() {
    if (!isMobile || !window.visualViewport) return;
    var shrink = window.innerHeight - window.visualViewport.height;
    var nowOpen = shrink > KB_HEIGHT_DELTA;
    if (nowOpen === kbOpen) return;
    kbOpen = nowOpen;
    if (!nav) return;
    if (kbOpen) {
      clearTimeout(hideTimer);
      nav.classList.add('mob-nav-dock-kb-hidden');
    } else {
      nav.classList.remove('mob-nav-dock-kb-hidden');
      show();
    }
  }

  // ── Reveal whenever the active page changes (nav() router just
  // toggles a `.page`'s `active` class — no need to hook the router
  // itself, just watch for it) ───────────────────────────────────────
  function watchPageChanges() {
    var target = document.querySelector('.main') || document.body;
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var el = mutations[i].target;
        if (el.classList && el.classList.contains('page') && el.classList.contains('active')) {
          show();
          break;
        }
      }
    });
    mo.observe(target, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  function applyModeForViewport() {
    isMobile = isMobileNow();
    if (!nav) return;
    if (!isMobile) {
      clearTimeout(hideTimer);
      nav.classList.remove('mob-nav-dock-hidden', 'mob-nav-dock-kb-hidden');
    } else {
      show();
    }
  }

  function init() {
    nav = document.getElementById('mob-bottom-nav');
    if (!nav) return;

    reducedMotion = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    isMobile = isMobileNow();

    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('touchstart', onTouch, { passive: true });
    document.addEventListener('touchmove', onTouch, { passive: true });
    document.addEventListener('pointerdown', onTouch, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportResize, { passive: true });
    }

    if (typeof matchMedia === 'function') {
      var mq = matchMedia(MQ);
      if (mq.addEventListener) mq.addEventListener('change', applyModeForViewport);
      else if (mq.addListener) mq.addListener(applyModeForViewport); // older Safari
    }
    window.addEventListener('resize', applyModeForViewport, { passive: true });

    watchPageChanges();

    if (isMobile) scheduleHide();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
