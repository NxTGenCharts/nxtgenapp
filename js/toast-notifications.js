// ══ NxTGen Journal — toast-notifications.js ══════════════════════
// Single centralized notification system for the entire app.
// Replaces the old single-node #app-toast implementation that lived
// in core-modals-userbar.js. Every existing call site keeps working
// unchanged via the showToast(msg, type, action) shim at the bottom —
// nothing else in the app needed to be rewritten.
//
// New code should prefer the richer API:
//   toast.success('Signal saved successfully.')
//   toast.error('Unable to save the signal.')
//   toast.warning('Some required fields are incomplete.')
//   toast.info('Your session has been updated.')
//   const h = toast.loading('Saving signal...')
//   h.success('Signal saved.')   // or h.error('...'), h.dismiss()
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const MAX_VISIBLE   = 4;
  const DEDUPE_WINDOW = 600; // ms — collapse identical rapid-fire toasts
  const DURATIONS = {
    success: 3500,
    restore: 3500,
    info:    4500,
    warning: 5500,
    error:   6000,
    neutral: 4000,
    loading: 0 // stays until updated/dismissed
  };
  const ICONS = {
    success: 'check-c',
    error:   'close-c',
    warning: 'warning',
    info:    'info',
    neutral: 'dot'
  };

  let viewport = null;
  let srAssertive = null;
  const active = new Map();   // id -> { el, timer, remaining, startedAt, type, key }
  const queue  = [];          // pending toast configs, waiting for a free slot
  const recentKeys = new Map(); // "type::title::message" -> id (dedupe)

  function ensureDom() {
    if (viewport) return;
    viewport = document.getElementById('nx-toast-viewport');
    srAssertive = document.getElementById('nx-toast-sr-assertive');
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.id = 'nx-toast-viewport';
      viewport.className = 'nx-toast-viewport';
      viewport.setAttribute('aria-live', 'polite');
      viewport.setAttribute('aria-atomic', 'false');
      viewport.setAttribute('aria-relevant', 'additions');
      document.body.appendChild(viewport);
    }
    if (!srAssertive) {
      srAssertive = document.createElement('div');
      srAssertive.id = 'nx-toast-sr-assertive';
      srAssertive.className = 'nx-toast-sr-assertive';
      srAssertive.setAttribute('role', 'alert');
      srAssertive.setAttribute('aria-live', 'assertive');
      srAssertive.setAttribute('aria-atomic', 'true');
      document.body.appendChild(srAssertive);
    }
  }

  function svgIcon(name) {
    if (typeof window.icon === 'function') return window.icon(name);
    return '<svg class="icn" aria-hidden="true"><use href="#ic-' + name + '"></use></svg>';
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function makeKey(type, title, message) {
    return type + '::' + (title || '') + '::' + (message || '');
  }

  function announce(type, title, message) {
    if (type !== 'error') return;
    if (!srAssertive) return;
    srAssertive.textContent = '';
    // Re-trigger the live region so repeated identical errors still announce.
    requestAnimationFrame(() => {
      srAssertive.textContent = (title ? title + '. ' : '') + (message || '');
    });
  }

  function buildToastEl(cfg) {
    const el = document.createElement('div');
    el.className = 'nx-toast';
    el.dataset.type = cfg.type;
    el.dataset.state = 'enter';
    el.setAttribute('role', cfg.type === 'error' ? 'alert' : 'status');
    el.tabIndex = -1;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'nx-toast-icon';
    if (cfg.type === 'loading') {
      iconWrap.innerHTML = '<div class="nx-toast-spinner" aria-hidden="true"></div>';
    } else {
      iconWrap.innerHTML = cfg.icon ? svgIcon(cfg.icon) : svgIcon(ICONS[cfg.type] || ICONS.neutral);
    }
    el.appendChild(iconWrap);

    const content = document.createElement('div');
    content.className = 'nx-toast-content';
    if (cfg.title) {
      const t = document.createElement('div');
      t.className = 'nx-toast-title';
      t.textContent = cfg.title;
      content.appendChild(t);
    }
    if (cfg.message) {
      const m = document.createElement('div');
      m.className = 'nx-toast-message';
      m.textContent = cfg.message;
      content.appendChild(m);
    }
    el.appendChild(content);

    if (cfg.action && cfg.action.label) {
      const btn = document.createElement('button');
      btn.className = 'nx-toast-action';
      btn.type = 'button';
      btn.textContent = cfg.action.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        try { cfg.action.onClick && cfg.action.onClick(); }
        catch (err) { console.error('Toast action error:', err); }
        dismiss(cfg.id);
      });
      el.appendChild(btn);
    }

    if (cfg.dismissible !== false && cfg.type !== 'loading') {
      const close = document.createElement('button');
      close.className = 'nx-toast-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss notification');
      close.innerHTML = svgIcon('close');
      close.addEventListener('click', (e) => { e.stopPropagation(); dismiss(cfg.id); });
      el.appendChild(close);
    }

    // Keyboard: Escape dismisses when focus is within the toast.
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cfg.type !== 'loading') dismiss(cfg.id);
    });

    // Hover pause (desktop) — do not pause loading toasts, they have no timer.
    el.addEventListener('mouseenter', () => pauseTimer(cfg.id));
    el.addEventListener('mouseleave', () => resumeTimer(cfg.id));

    attachSwipe(el, cfg.id, cfg.type);

    return el;
  }

  function attachSwipe(el, id, type) {
    if (type === 'loading') return; // no accidental dismissal while an operation is in flight
    let startX = 0, startY = 0, dx = 0, dragging = false, horizontal = false;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0; dragging = true; horizontal = false;
      el.dataset.dragging = 'true';
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const x = e.touches[0].clientX, y = e.touches[0].clientY;
      dx = x - startX;
      const dy = y - startY;
      if (!horizontal && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) horizontal = true;
      if (horizontal) {
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / 140));
      }
    }, { passive: true });
    el.addEventListener('touchend', () => {
      dragging = false;
      el.dataset.dragging = 'false';
      if (horizontal && Math.abs(dx) > 70) {
        dismiss(id);
      } else {
        el.style.transform = '';
        el.style.opacity = '';
      }
    });
  }

  function pauseTimer(id) {
    const rec = active.get(id);
    if (!rec || !rec.timer) return;
    clearTimeout(rec.timer);
    rec.remaining -= (Date.now() - rec.startedAt);
    rec.timer = null;
  }

  function resumeTimer(id) {
    const rec = active.get(id);
    if (!rec || rec.duration <= 0 || rec.remaining == null) return;
    if (rec.remaining <= 0) { dismiss(id); return; }
    rec.startedAt = Date.now();
    rec.timer = setTimeout(() => dismiss(id), rec.remaining);
  }

  function startTimer(id, duration) {
    const rec = active.get(id);
    if (!rec || !duration || duration <= 0) return;
    rec.duration = duration;
    rec.remaining = duration;
    rec.startedAt = Date.now();
    rec.timer = setTimeout(() => dismiss(id), duration);
  }

  function clearTimer(id) {
    const rec = active.get(id);
    if (rec && rec.timer) clearTimeout(rec.timer);
  }

  function renderNext() {
    if (queue.length === 0) return;
    if (active.size >= MAX_VISIBLE) return;
    const cfg = queue.shift();
    render(cfg);
  }

  function render(cfg) {
    ensureDom();
    const el = buildToastEl(cfg);
    viewport.prepend(el);
    active.set(cfg.id, { el, timer: null, remaining: null, startedAt: null, duration: cfg.duration, type: cfg.type, key: cfg.key });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => { el.dataset.state = 'visible'; });
    });

    announce(cfg.type, cfg.title, cfg.message);

    if (cfg.duration > 0) startTimer(cfg.id, cfg.duration);
  }

  function dismiss(id) {
    const rec = active.get(id);
    if (!rec) {
      // Might still be queued.
      const qi = queue.findIndex(c => c.id === id);
      if (qi !== -1) queue.splice(qi, 1);
      return;
    }
    clearTimer(id);
    const el = rec.el;
    el.dataset.state = 'exit';
    active.delete(id);
    recentKeys.forEach((v, k) => { if (v === id) recentKeys.delete(k); });
    const cleanup = () => {
      el.remove();
      renderNext();
    };
    if (prefersReducedMotion()) {
      setTimeout(cleanup, 130);
    } else {
      let done = false;
      const onEnd = (e) => {
        if (e.target !== el) return;
        if (done) return;
        done = true;
        el.removeEventListener('transitionend', onEnd);
        cleanup();
      };
      el.addEventListener('transitionend', onEnd);
      setTimeout(() => { if (!done) { done = true; cleanup(); } }, 320);
    }
  }

  function dismissAll() {
    Array.from(active.keys()).forEach(dismiss);
    queue.length = 0;
  }

  let uidCounter = 0;
  function nextId() { return 'nxt_' + Date.now().toString(36) + '_' + (uidCounter++); }

  function normalize(type, arg1, arg2) {
    // push(type, "message") or push(type, { title, message, ... })
    let opts;
    if (typeof arg1 === 'string') opts = Object.assign({ message: arg1 }, arg2 || {});
    else opts = Object.assign({}, arg1 || {});
    opts.type = type;
    if (opts.duration == null) opts.duration = DURATIONS[type] != null ? DURATIONS[type] : 4000;
    return opts;
  }

  function push(type, arg1, arg2) {
    ensureDom();
    const cfg = normalize(type, arg1, arg2);
    cfg.key = makeKey(cfg.type, cfg.title, cfg.message);

    // Dedupe: if an identical toast is already showing, just refresh its timer.
    if (recentKeys.has(cfg.key)) {
      const existingId = recentKeys.get(cfg.key);
      const rec = active.get(existingId);
      if (rec) {
        clearTimer(existingId);
        if (cfg.duration > 0) startTimer(existingId, cfg.duration);
        return existingId;
      }
      // Identical toast is already queued (not yet visible) — don't stack another.
      if (queue.some(q => q.id === existingId)) return existingId;
    }

    cfg.id = cfg.id || nextId();
    recentKeys.set(cfg.key, cfg.id);
    setTimeout(() => { if (recentKeys.get(cfg.key) === cfg.id) recentKeys.delete(cfg.key); }, DEDUPE_WINDOW);

    if (active.size >= MAX_VISIBLE) {
      queue.push(cfg);
    } else {
      render(cfg);
    }
    return cfg.id;
  }

  function update(id, opts) {
    const rec = active.get(id);
    if (!rec) return push(opts.type || 'info', opts);
    clearTimer(id);
    const cfg = Object.assign({ type: rec.type }, opts);
    if (cfg.duration == null) cfg.duration = DURATIONS[cfg.type] != null ? DURATIONS[cfg.type] : 4000;
    const newEl = buildToastEl(Object.assign({}, cfg, { id }));
    newEl.dataset.state = 'visible';
    rec.el.replaceWith(newEl);
    active.set(id, { el: newEl, timer: null, remaining: null, startedAt: null, duration: cfg.duration, type: cfg.type, key: rec.key });
    announce(cfg.type, cfg.title, cfg.message);
    if (cfg.duration > 0) startTimer(id, cfg.duration);
    return id;
  }

  function loadingHandle(id) {
    return {
      id,
      success: (msg, opts) => update(id, Object.assign({ type: 'success', message: msg }, opts)),
      error:   (msg, opts) => update(id, Object.assign({ type: 'error', message: msg }, opts)),
      warning: (msg, opts) => update(id, Object.assign({ type: 'warning', message: msg }, opts)),
      info:    (msg, opts) => update(id, Object.assign({ type: 'info', message: msg }, opts)),
      update:  (opts) => update(id, opts),
      dismiss: () => dismiss(id)
    };
  }

  const toast = {
    success: (msg, opts) => push('success', msg, opts),
    error:   (msg, opts) => push('error', msg, opts),
    warning: (msg, opts) => push('warning', msg, opts),
    info:    (msg, opts) => push('info', msg, opts),
    neutral: (msg, opts) => push('neutral', msg, opts),
    loading: (msg, opts) => loadingHandle(push('loading', Object.assign({ message: msg, duration: 0, dismissible: false }, opts))),
    dismiss,
    dismissAll,
    update
  };

  // ── Backward-compatible legacy API ────────────────────────────
  // Every existing call site across the app uses:
  //   showToast(msg, 'success' | 'danger' | 'restore' | 'info' | 'error', action)
  // where `action` is either null or { label, fn } with `fn` a string of
  // JS to eval (e.g. "nav('trash',null,'Trash')"). Both are preserved.
  const LEGACY_TYPE_MAP = {
    success: 'success',
    restore: 'success',
    info:    'info',
    error:   'error',
    danger:  'error',
    warning: 'warning'
  };

  window.showToast = function showToast(msg, type, action) {
    type = type || 'info';
    const variant = LEGACY_TYPE_MAP[type] || 'info';
    const opts = { message: msg };
    if (variant === 'success' && type === 'restore') opts.icon = 'restore';
    if (action && action.label) {
      opts.action = {
        label: action.label,
        onClick: function () {
          try { (0, eval)(action.fn); }
          catch (e) { console.error('Toast action error:', e); }
        }
      };
    }
    return push(variant, opts);
  };

  window.toast = toast;
  window.NxToast = { push, dismiss, dismissAll, update, ensureDom };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureDom);
  } else {
    ensureDom();
  }
})();
