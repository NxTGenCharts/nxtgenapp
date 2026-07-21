// ══ NxTGen Journal — tradelog-premium.js ══════════════════════════════
// Premium row-level analytics for the Trade Log page. Loaded after
// nav-dashboard-trades.js. Reuses pf3Colors/pf3ReducedMotion from
// dashboard-premium.js. Post-processes rows rendered by the untouched
// renderTradeTable() rather than reimplementing it, so bulk-select,
// row actions, filters, etc. all keep working exactly as before.
//
// Safe-override rule: `const orig = window.fn; window.fn = function(){...}`
// only — never a same-named top-level `function fn(){}` redeclaration.
// ════════════════════════════════════════════════════════════════════

const _pf3TLOrigRender = window.renderTradeTable;
window.renderTradeTable = function (list) {
  const r = _pf3TLOrigRender.call(this, list);
  requestAnimationFrame(() => pf3TLEnhanceRows(list || []));
  return r;
};

function pf3TLConfidence(t) {
  const ratingScore = ((t.rating || 3) / 5) * 100;
  const planScore = t.followedPlan === 'Yes' ? 100 : t.followedPlan === 'No' ? 0 : 60;
  const emoMap = { Focused: 100, Neutral: 60, Distracted: 20, Calm: 80 };
  const emoScore = emoMap[t.emotion] !== undefined ? emoMap[t.emotion] : 60;
  return Math.round(ratingScore * 0.5 + planScore * 0.25 + emoScore * 0.25);
}

function pf3TLQualityBadge(rating) {
  const r = rating || 3;
  if (r >= 5) return { cls: 'elite', label: 'Elite' };
  if (r >= 4) return { cls: 'strong', label: 'Strong' };
  if (r >= 3) return { cls: 'average', label: 'Average' };
  if (r >= 2) return { cls: 'weak', label: 'Weak' };
  return { cls: 'weak', label: 'Poor' };
}

function pf3TLConfRingSvg(pct) {
  const r = 6, c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const col = pct >= 70 ? 'var(--green)' : pct >= 45 ? 'var(--gold)' : 'var(--red)';
  return `<svg class="pf3-tl-conf-ring" viewBox="0 0 16 16" aria-hidden="true">
    <circle class="pf3-conf-bg" cx="8" cy="8" r="${r}" fill="none" stroke-width="2.4"/>
    <circle class="pf3-conf-fg" cx="8" cy="8" r="${r}" fill="none" stroke-width="2.4" stroke="${col}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 8 8)"/>
  </svg>`;
}

function pf3TLEnhanceRows(list) {
  const rows = document.querySelectorAll('#trade-table-body tr.trade-log-row');
  if (!rows.length || rows.length !== list.length) return; // only proceed on a guaranteed 1:1 zip
  const reduceMotion = typeof pf3ReducedMotion === 'function' ? pf3ReducedMotion() : false;

  rows.forEach((row, i) => {
    const t = list[i];
    if (!t) return;

    // Session color accent (left border)
    if (typeof kzColor === 'function') row.style.borderLeftColor = kzColor(t.kz);

    // ── R:R mini bar (column index 4) ──
    const rrTd = row.children[4];
    if (rrTd && !rrTd.dataset.pf3Done) {
      rrTd.dataset.pf3Done = '1';
      const rrNum = typeof _parseRR === 'function' ? _parseRR(t.rr) : null;
      const m = String(t.rr || '').match(/([\d.]+)\s*:\s*([\d.]+)/);
      const risk = m ? parseFloat(m[1]) : 1, reward = m ? parseFloat(m[2]) : (rrNum || 1);
      const total = risk + reward || 1;
      const riskPct = (risk / total) * 100, rewardPct = (reward / total) * 100;
      rrTd.innerHTML = `<div class="pf3-tl-rr" title="Risk ${risk} : Reward ${reward}">
        <span class="pf3-tl-rr-label">${t.rr || '—'}</span>
        <div class="pf3-tl-rr-track"><div class="pf3-tl-rr-risk" style="width:${riskPct}%"></div><div class="pf3-tl-rr-reward" style="width:${rewardPct}%"></div></div>
      </div>`;
    }

    // ── Direction pill (column index 3) ──
    const posTd = row.children[3];
    if (posTd && !posTd.dataset.pf3Done) {
      posTd.dataset.pf3Done = '1';
      const isBuy = t.pos === 'Buy';
      posTd.innerHTML = `<span class="pf3-tl-dir ${isBuy ? 'buy' : 'sell'}">
        <svg class="icn" aria-hidden="true"><use href="#${isBuy ? 'ic-arrow-up' : 'ic-arrow-down'}"></use></svg>${t.pos}
      </span>`;
    }

    // ── PnL flash (column index 5) ──
    const pnlTd = row.children[5];
    if (pnlTd && !reduceMotion && !pnlTd.dataset.pf3Done) {
      pnlTd.dataset.pf3Done = '1';
      pnlTd.classList.add('pf3-pnl-flash');
    }

    // ── Quality + confidence badges + expand toggle (column index 10,
    //    the stars cell). Deliberately NOT placed in the row-actions cell
    //    (index 11) — that cell is opacity:0 by default and only revealed
    //    via showRowActions()/hideRowActions() on :hover, which would make
    //    an expand button invisible by default and unreachable on touch. ──
    const starsTd = row.children[10];
    if (starsTd && !starsTd.dataset.pf3Done) {
      starsTd.dataset.pf3Done = '1';
      const q = pf3TLQualityBadge(t.rating);
      const conf = pf3TLConfidence(t);

      const btn = document.createElement('button');
      btn.className = 'pf3-tl-expand-btn';
      btn.title = 'Trade story';
      btn.setAttribute('aria-label', 'Expand trade story');
      btn.innerHTML = '<svg class="icn" aria-hidden="true"><use href="#ic-chevron-right"></use></svg>';
      btn.addEventListener('click', (e) => { e.stopPropagation(); pf3TLToggleExpand(row, t, btn); });
      starsTd.insertBefore(btn, starsTd.firstChild);

      const badges = document.createElement('div');
      badges.className = 'pf3-tl-badges';
      badges.innerHTML = `<span class="pf3-tl-quality ${q.cls}">${q.label}</span>
        <span class="pf3-tl-confidence">${pf3TLConfRingSvg(conf)}${conf}%</span>`;
      starsTd.appendChild(badges);
    }

    // ── Hover analytics card (desktop only — pointer devices with real hover) ──
    if (matchMedia('(hover: hover)').matches && !row.dataset.pf3Hover) {
      row.dataset.pf3Hover = '1';
      row.addEventListener('mouseenter', (e) => pf3TLShowHoverCard(row, t));
      row.addEventListener('mousemove', (e) => pf3TLMoveHoverCard(e));
      row.addEventListener('mouseleave', () => pf3TLHideHoverCard());
    }
  });
}

// ── Expandable row: compact "trade story" timeline ─────────────────────
function pf3TLToggleExpand(row, t, btn) {
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains('pf3-tl-expand-row')) {
    existing.remove();
    btn.classList.remove('open');
    return;
  }
  document.querySelectorAll('.pf3-tl-expand-row').forEach(r => r.remove());
  document.querySelectorAll('.pf3-tl-expand-btn.open').forEach(b => b.classList.remove('open'));
  btn.classList.add('open');

  const outClass = t.outcome === 'Win' ? 'win' : t.outcome === 'Loss' ? 'loss' : '';
  const pnlStr = typeof _pnlLabel === 'function' ? _pnlLabel(t) : (t.pnl >= 0 ? '+' : '') + t.pnl;
  const tags = [];
  if (t.followedPlan === 'No') tags.push('<span class="pf3-tl-tag warn">Broke plan</span>');
  if (t.followedPlan === 'Yes') tags.push('<span class="pf3-tl-tag good">Followed plan</span>');
  if (t.emotion) tags.push(`<span class="pf3-tl-tag">${t.emotion}</span>`);
  if (t.lossReason) tags.push(`<span class="pf3-tl-tag warn">${t.lossReason}</span>`);

  const tr = document.createElement('tr');
  tr.className = 'pf3-tl-expand-row';
  const colCount = row.children.length;
  tr.innerHTML = `<td colspan="${colCount}">
    <div class="pf3-tl-expand-inner">
      <div class="pf3-tl-timeline">
        <div class="pf3-tl-tl-step">
          <div class="pf3-tl-tl-label">Pre-Trade Plan</div>
          <div class="pf3-tl-tl-content">${t.pretrade ? _pf3Esc(t.pretrade) : '<span class="empty">No pre-trade plan logged</span>'}</div>
        </div>
        <div class="pf3-tl-tl-step">
          <div class="pf3-tl-tl-label">Setup</div>
          <div class="pf3-tl-tl-content">${t.pair} · ${t.pos} · ${t.rr || '—'} R:R · ${t.strategy || 'No model tagged'}</div>
        </div>
        <div class="pf3-tl-tl-step ${outClass}">
          <div class="pf3-tl-tl-label">Result</div>
          <div class="pf3-tl-tl-content">${t.outcome} · ${pnlStr}</div>
          <div class="pf3-tl-tl-tags">${tags.join('')}</div>
        </div>
        <div class="pf3-tl-tl-step">
          <div class="pf3-tl-tl-label">Reflection</div>
          <div class="pf3-tl-tl-content">${t.notes ? _pf3Esc(t.notes) : (t.mistakes ? _pf3Esc(t.mistakes) : '<span class="empty">No notes logged — tap the row to add some</span>')}</div>
        </div>
      </div>
    </div>
  </td>`;
  row.insertAdjacentElement('afterend', tr);
}

function _pf3Esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ── Hover analytics card ────────────────────────────────────────────────
let _pf3TLHoverEl = null;
function pf3TLShowHoverCard(row, t) {
  pf3TLHideHoverCard();
  const conf = pf3TLConfidence(t);
  const el = document.createElement('div');
  el.className = 'pf3-tl-hovercard';
  el.innerHTML = `
    <div class="pf3-tl-hovercard-row"><span class="pf3-tl-hovercard-k">Confidence</span><span class="pf3-tl-hovercard-v">${conf}%</span></div>
    <div class="pf3-tl-hovercard-row"><span class="pf3-tl-hovercard-k">Followed plan</span><span class="pf3-tl-hovercard-v">${t.followedPlan || '—'}</span></div>
    <div class="pf3-tl-hovercard-row"><span class="pf3-tl-hovercard-k">Mental state</span><span class="pf3-tl-hovercard-v">${t.emotion || '—'}</span></div>
    ${t.outcome === 'Loss' && t.lossReason ? `<div class="pf3-tl-hovercard-row"><span class="pf3-tl-hovercard-k">Loss reason</span><span class="pf3-tl-hovercard-v">${t.lossReason}</span></div>` : ''}
    ${t.wouldRetake !== null && t.wouldRetake !== undefined ? `<div class="pf3-tl-hovercard-row"><span class="pf3-tl-hovercard-k">Would retake</span><span class="pf3-tl-hovercard-v">${t.wouldRetake ? 'Yes' : 'No'}</span></div>` : ''}
  `;
  document.body.appendChild(el);
  _pf3TLHoverEl = el;
  requestAnimationFrame(() => el.classList.add('show'));
}
function pf3TLMoveHoverCard(e) {
  if (!_pf3TLHoverEl) return;
  const pad = 16;
  let x = e.clientX + pad, y = e.clientY + pad;
  const w = _pf3TLHoverEl.offsetWidth || 240, h = _pf3TLHoverEl.offsetHeight || 100;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
  _pf3TLHoverEl.style.left = x + 'px';
  _pf3TLHoverEl.style.top = y + 'px';
}
function pf3TLHideHoverCard() {
  if (_pf3TLHoverEl) { _pf3TLHoverEl.remove(); _pf3TLHoverEl = null; }
}
