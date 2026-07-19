// ══ NxTGen Journal — chart-slots.js (original app.js lines 13727-14551) ══

// ── CHART SLOT MANAGEMENT ─────────────────────────────
function addChartSlot(id) {
  const s = getTS(id);
  if (!s.chartLabels || !s.chartLabels.length) s.chartLabels = [...CHART_LABELS];
  s.chartLabels.push('TF ' + (s.chartLabels.length + 1));
  if (!s.charts) s.charts = [];
  _renderDetail(id);          // instant UI update
  _bgSave(id);                // background save
}
function removeChartSlot(id, idx) {
  const s = getTS(id);
  if (!s.chartLabels) s.chartLabels = [...CHART_LABELS];
  if (s.chartLabels.length <= 1) { showToast('Must keep at least one slot', 'info'); return; }
  s.chartLabels.splice(idx, 1);
  if (s.charts) s.charts.splice(idx, 1);
  _renderDetail(id);
  _bgSave(id);
}
function renameChartSlot(id, idx, val) {
  // Debounced — updates state after user stops typing, saves in background
  _debouncedRename(id, idx, val);
}
function clearChartImage(id, idx) {
  const s = getTS(id);
  if (s.charts) s.charts[idx] = null;
  _renderDetail(id);
  _bgSave(id);
}
function removeChart(id, slot) {
  const s = getTS(id);
  if (s.charts) s.charts[slot] = null;
  _renderDetail(id);
  _bgSave(id);
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 4: Advanced Analytics + AI Review
// Analytics are computed client-side from journal_backtest_trades
// (same rows Phase 2/3 write to). AI Review reuses the existing
// ai-coach Edge Function — no new function needed, just a
// different system prompt + a compact data payload.
// ═══════════════════════════════════════════════════

/* ── Rolling win rate (window of N trades) ── */
function _btRollingWinRate(trades, window) {
  window = window || Math.max(3, Math.min(10, Math.floor(trades.length / 3)));
  const out = [];
  for (let i = 0; i < trades.length; i++) {
    const slice = trades.slice(Math.max(0, i - window + 1), i + 1);
    const wins = slice.filter(t => (Number(t.pnl) || 0) > 0).length;
    out.push({ i, wr: (wins / slice.length) * 100 });
  }
  return { points: out, window };
}

/* ── R-multiple distribution buckets ── */
function _btRDistribution(trades) {
  const buckets = [
    { label: '≤-2R', min: -Infinity, max: -2, n: 0 },
    { label: '-2..-1R', min: -2, max: -1, n: 0 },
    { label: '-1..0R', min: -1, max: 0, n: 0 },
    { label: '0..1R', min: 0, max: 1, n: 0 },
    { label: '1..2R', min: 1, max: 2, n: 0 },
    { label: '2..3R', min: 2, max: 3, n: 0 },
    { label: '≥3R', min: 3, max: Infinity, n: 0 },
  ];
  trades.forEach(t => {
    const r = Number(t.rr) || 0;
    const b = buckets.find(b => r > b.min && r <= b.max) || buckets.find(b => r <= b.min);
    if (b) b.n++;
  });
  return buckets;
}

/* ── Win/loss streaks ── */
function _btStreaks(trades) {
  let curStreak = 0, curType = null, longestWin = 0, longestLoss = 0, run = 0, runType = null;
  trades.forEach(t => {
    const pnl = Number(t.pnl) || 0;
    const type = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'be';
    if (type === runType) { run++; } else { runType = type; run = 1; }
    if (type === 'win') longestWin = Math.max(longestWin, run);
    if (type === 'loss') longestLoss = Math.max(longestLoss, run);
    curType = type; curStreak = run;
  });
  return { longestWin, longestLoss, current: curStreak, currentType: curType };
}

/* ── Monte Carlo simulation: shuffle trade order N times, track final equity + max DD spread ── */
function _btMonteCarlo(trades, runs) {
  runs = runs || 500;
  if (trades.length < 5) return null;
  const pnls = trades.map(t => Number(t.pnl) || 0);
  const finals = [];
  const maxDDs = [];
  for (let r = 0; r < runs; r++) {
    const shuffled = [...pnls];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let running = 0, peak = 0, maxDD = 0;
    shuffled.forEach(p => { running += p; if (running > peak) peak = running; const dd = peak - running; if (dd > maxDD) maxDD = dd; });
    finals.push(running);
    maxDDs.push(maxDD);
  }
  finals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  return {
    runs,
    finalP5: pct(finals, 0.05), finalP50: pct(finals, 0.5), finalP95: pct(finals, 0.95),
    ddP50: pct(maxDDs, 0.5), ddP95: pct(maxDDs, 0.95),
  };
}

/* ── Generic equity curve renderer (adapted from the journal-wide _drawEquityCurve) ── */
function _btDrawEquityCurve(trades, canvasId, emptyId) {
  const canvas = document.getElementById(canvasId);
  const emptyEl = emptyId ? document.getElementById(emptyId) : null;
  if (!canvas) return;
  if (trades.length < 2) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  let cum = 0;
  const points = [{ x: 0, y: 0 }];
  trades.forEach((t, i) => { cum += Number(t.pnl) || 0; points.push({ x: i + 1, y: cum, outcome: (Number(t.pnl) || 0) > 0 ? 'Win' : (Number(t.pnl) || 0) < 0 ? 'Loss' : 'BE' }); });

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32 || 600;
  const H = 180;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const pad = { top: 16, right: 16, bottom: 20, left: 56 };
  const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const px = i => pad.left + (i / (points.length - 1)) * cW;
  const py = v => pad.top + cH - ((v - minY) / rangeY) * cH;

  const zeroY = py(0);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + cW, zeroY);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'right';
  [minY, (minY + maxY) / 2, maxY].forEach(v => ctx.fillText((v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0), pad.left - 6, py(v) + 4));

  const isPos = points[points.length - 1].y >= 0;
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, isPos ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.moveTo(px(0), py(points[0].y));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(px(i), py(p.y)); });
  ctx.lineTo(px(points.length - 1), py(0)); ctx.lineTo(px(0), py(0)); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  for (let i = 1; i < points.length; i++) {
    ctx.beginPath(); ctx.moveTo(px(i - 1), py(points[i - 1].y)); ctx.lineTo(px(i), py(points[i].y));
    ctx.strokeStyle = points[i].outcome === 'Win' ? '#22c55e' : points[i].outcome === 'Loss' ? '#ef4444' : '#60a5fa';
    ctx.lineWidth = 2; ctx.stroke();
  }
  points.forEach((p, i) => {
    if (i === 0) return;
    ctx.beginPath(); ctx.arc(px(i), py(p.y), 3, 0, Math.PI * 2);
    ctx.fillStyle = p.outcome === 'Win' ? '#22c55e' : p.outcome === 'Loss' ? '#ef4444' : '#60a5fa';
    ctx.fill();
  });
}

/* ── Rolling win-rate line chart ── */
function _btDrawRollingWinRate(trades, canvasId) {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  if (trades.length < 3) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  const { points, window: win } = _btRollingWinRate(trades);

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32 || 600;
  const H = 140;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);

  const pad = { top: 14, right: 16, bottom: 18, left: 40 };
  const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
  const px = i => pad.left + (points.length > 1 ? (i / (points.length - 1)) * cW : 0);
  const py = v => pad.top + cH - (v / 100) * cH;

  [0, 25, 50, 75, 100].forEach(v => {
    ctx.beginPath(); ctx.moveTo(pad.left, py(v)); ctx.lineTo(pad.left + cW, py(v));
    ctx.strokeStyle = v === 50 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(v + '%', pad.left - 6, py(v) + 3);
  });

  ctx.beginPath();
  points.forEach((p, i) => { const x = px(i), y = py(p.wr); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Rolling ${win}-trade win rate`, pad.left, H - 4);
}

/* ── R-multiple distribution bar chart ── */
function _btDrawRDistribution(trades, canvasId) {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const buckets = _btRDistribution(trades);
  const maxN = Math.max(1, ...buckets.map(b => b.n));

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32 || 600;
  const H = 150;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);

  const pad = { top: 10, right: 10, bottom: 26, left: 10 };
  const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
  const bw = cW / buckets.length;

  buckets.forEach((b, i) => {
    const h = (b.n / maxN) * (cH - 16);
    const x = pad.left + i * bw + bw * 0.15;
    const w = bw * 0.7;
    const y = pad.top + (cH - 16) - h;
    ctx.fillStyle = b.max <= 0 ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px system-ui,sans-serif'; ctx.textAlign = 'center';
    if (b.n) ctx.fillText(String(b.n), x + w / 2, y - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '8px system-ui,sans-serif';
    ctx.fillText(b.label, x + w / 2, H - 8);
  });
}

/* ── Render the Analytics tab ── */
function _btRenderAnalyticsPanel(sessionId) {
  const panel = document.getElementById('bt-detail-panel-analytics'); if (!panel) return;
  const s = _btGetSessionById(sessionId); if (!s) return;
  const trades = _btTradesForSession(sessionId).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));

  if (trades.length < 2) {
    panel.innerHTML = `<div class="acc-mgr-empty">Log at least 2 trades to unlock equity curve, rolling win rate, R-distribution and Monte Carlo analysis.</div>`;
    return;
  }

  const streaks = _btStreaks(trades);
  const mc = _btMonteCarlo(trades);

  panel.innerHTML = `
    <div class="sec-head" style="margin-bottom:8px">Equity Curve</div>
    <div class="model-card" style="padding:12px 16px">
      <canvas id="bt-an-equity"></canvas>
      <div id="bt-an-equity-empty" style="display:none;color:var(--text3);font-size:12px;text-align:center;padding:20px">Not enough trades yet</div>
    </div>

    <div class="sec-head" style="margin:16px 0 8px">Rolling Win Rate</div>
    <div class="model-card" style="padding:12px 16px">
      <canvas id="bt-an-rollwr"></canvas>
    </div>

    <div class="sec-head" style="margin:16px 0 8px">R-Multiple Distribution</div>
    <div class="model-card" style="padding:12px 16px">
      <canvas id="bt-an-rdist"></canvas>
    </div>

    <div class="sec-head" style="margin:16px 0 8px">Streaks</div>
    <div class="bt-stat-bar">
      ${_blStatCell('Longest Win Streak', streaks.longestWin)}
      ${_blStatCell('Longest Loss Streak', streaks.longestLoss)}
      ${_blStatCell('Current Streak', streaks.current, streaks.currentType ? ' ' + streaks.currentType : '')}
    </div>

    <div class="sec-head" style="margin:16px 0 8px">Monte Carlo <span style="font-size:10px;color:var(--text3);font-weight:400;font-family:var(--font-mono)">· ${mc ? mc.runs : 0} shuffled runs of this trade set</span></div>
    ${mc ? `<div class="bt-stat-bar">
      ${_blStatCell('Median Outcome', (mc.finalP50 >= 0 ? '+$' : '-$') + Math.abs(mc.finalP50).toFixed(0))}
      ${_blStatCell('5th %ile (bad luck)', (mc.finalP5 >= 0 ? '+$' : '-$') + Math.abs(mc.finalP5).toFixed(0))}
      ${_blStatCell('95th %ile (good luck)', (mc.finalP95 >= 0 ? '+$' : '-$') + Math.abs(mc.finalP95).toFixed(0))}
      ${_blStatCell('Median Max Drawdown', '$' + mc.ddP50.toFixed(0))}
      ${_blStatCell('95th %ile Drawdown', '$' + mc.ddP95.toFixed(0))}
    </div>` : `<div class="acc-mgr-empty">Log at least 5 trades to run a Monte Carlo simulation.</div>`}
  `;

  requestAnimationFrame(() => {
    _btDrawEquityCurve(trades, 'bt-an-equity', 'bt-an-equity-empty');
    _btDrawRollingWinRate(trades, 'bt-an-rollwr');
    _btDrawRDistribution(trades, 'bt-an-rdist');
  });
}

/* ── AI Review: reuses the ai-coach Edge Function with a dedicated system prompt ── */
function _btAIReviewSystemPrompt() {
  return `You are an elite trading performance coach reviewing a BACKTEST session (simulated trades, not live money) inside a trading journal app. You will be given the session's stats and a compact list of its trades (direction, RR, P/L, and any notes/mistakes/psychology the trader logged). Write a sharp, specific review covering: 1) what the data shows about the strategy's edge (win rate, expectancy, RR discipline), 2) concrete patterns in the winning vs losing trades, 3) the biggest leak or risk in this trade set, and 4) 2-3 precise, actionable adjustments before taking this strategy live. Be direct and concise — no generic platitudes, no disclaimers about not being financial advice. Use short section headers (##) and bullet points. Keep it under 300 words.`;
}

function _btBuildAIReviewPayload(s, trades, stats) {
  const tradeLines = trades.slice(-40).map((t, i) => {
    const d = t.data || {};
    const parts = [`#${i + 1} ${t.direction || '?'} RR:${(Number(t.rr) || 0).toFixed(2)} PnL:${(Number(t.pnl) || 0).toFixed(2)}`];
    if (d.reasonEntry) parts.push(`entry:"${d.reasonEntry.slice(0, 80)}"`);
    if (d.mistakes && d.mistakes.length) parts.push(`mistakes:${d.mistakes.slice(0, 3).join(';')}`);
    if (d.psychology) parts.push(`psych:"${d.psychology.slice(0, 60)}"`);
    return parts.join(' | ');
  }).join('\n');

  return `SESSION: ${s.name} (${s.pair || 'pair n/a'}, ${s.timeframe || 'tf n/a'})
STATS: winRate=${stats.winRate?.toFixed(1)}% expectancy=${stats.expectancy?.toFixed(2)}R profitFactor=${(stats.profitFactor === Infinity ? '∞' : stats.profitFactor?.toFixed(2))} avgRR=${stats.avgRR?.toFixed(2)} maxDD=${stats.maxDrawdown ?? 'n/a'} totalTrades=${stats.totalTests}

TRADES:
${tradeLines}`;
}

async function _btRequestAIReview(sessionId, force) {
  const s = _btGetSessionById(sessionId); if (!s) return;
  const trades = _btTradesForSession(sessionId).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));
  if (!trades.length) { showToast('Log at least one trade first', 'danger'); return; }

  if (s.aiReview && !force) { _btRenderAIReviewPanel(sessionId); return; }

  const panel = document.getElementById('bt-detail-panel-ai');
  if (panel) panel.innerHTML = `<div class="acc-mgr-empty"><svg class="icn" aria-hidden="true"><use href="#ic-robot"></use></svg> Analysing ${trades.length} trade(s)…</div>`;

  const stats = _btComputeStats(trades, Number(s.startingBalance) || 0);
  const userPayload = _btBuildAIReviewPayload(s, trades, stats);

  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-coach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON}`,
      },
      body: JSON.stringify({
        system: _btAIReviewSystemPrompt(),
        messages: [{ role: 'user', content: userPayload }],
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    s.aiReview = { text: reply, generatedAt: new Date().toISOString(), tradeCount: trades.length };
    await _blSave();
    _btRenderAIReviewPanel(sessionId);
  } catch (err) {
    if (panel) panel.innerHTML = `<div class="ai-error"><strong><svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg> Error</strong><br>${err.message || 'Connection error'}. Check your Edge Function is deployed.</div>`;
  }
}

function _btRenderAIReviewPanel(sessionId) {
  const panel = document.getElementById('bt-detail-panel-ai'); if (!panel) return;
  const s = _btGetSessionById(sessionId); if (!s) return;

  if (!s.aiReview) {
    panel.innerHTML = `<div class="acc-mgr-empty" style="display:flex;flex-direction:column;gap:12px;align-items:center;padding:32px 16px">
      <svg class="icn icn-gold" style="width:28px;height:28px" aria-hidden="true"><use href="#ic-robot"></use></svg>
      <div>Get an AI-generated review of this session's trades — edge, patterns, and what to fix before going live.</div>
      <button class="acc-mgr-add-btn" style="padding:6px 18px" onclick="_btRequestAIReview('${sessionId}')">Generate AI Review</button>
    </div>`;
    return;
  }

  const genDate = new Date(s.aiReview.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:11px;color:var(--text3)">Generated ${genDate} · ${s.aiReview.tradeCount} trade(s)</span>
      <button class="acc-mgr-close" title="Regenerate" onclick="_btRequestAIReview('${sessionId}', true)"><svg class="icn" aria-hidden="true"><use href="#ic-refresh"></use></svg></button>
    </div>
    <div class="model-card ai-response-body" style="padding:16px">${_aiFormatResponse(s.aiReview.text)}</div>
  `;
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 5: Screenshot Gallery +
// Strategy Comparison (Sections 9 & 10)
// Gallery reads screenshots straight off journal_backtest_trades
// (trade.data.screenshots.{before,entry,exit,marked}); the existing
// gallery-aware openLightbox(images, startPos) helper is reused as-is.
// ═══════════════════════════════════════════════════

const BL_SHOT_KEYS = ['before', 'entry', 'exit', 'marked'];

/* Flatten every screenshot across (optionally) one strategy into a
   single ordered list, newest trade first, so gallery + lightbox
   share one array of {url, key, trade, session, strategy}. */
function _blCollectScreenshots(strategyId) {
  const trades = (strategyId ? _btTradesForStrategy(strategyId) : _btTrades)
    .slice()
    .sort((a, b) => new Date(b.entry_time || b.created_at || 0) - new Date(a.entry_time || a.created_at || 0));
  const out = [];
  trades.forEach(t => {
    const shots = (t.data && t.data.screenshots) || {};
    BL_SHOT_KEYS.forEach(key => {
      if (shots[key]) {
        const session = _btGetSessionById(t.session_id);
        const strategy = _blGetById(t.strategy_id);
        out.push({ url: shots[key], key, trade: t, session, strategy });
      }
    });
  });
  return out;
}

function _blRenderGalleryControls() {
  const sel = document.getElementById('bl-gallery-strategy-filter');
  if (!sel) return;
  const current = sel.value;
  const strategies = _blData.strategies || [];
  sel.innerHTML = `<option value="">All strategies</option>` +
    strategies.map(s => `<option value="${s.id}"${s.id === current ? ' selected' : ''}>${s.name || 'Untitled'}</option>`).join('');
}

function _blRenderGallery() {
  const grid = document.getElementById('bl-gallery-grid');
  if (!grid) return;
  const strategyId = document.getElementById('bl-gallery-strategy-filter')?.value || '';
  const shots = _blCollectScreenshots(strategyId);
  window._blGalleryShots = shots; // stash for lightbox nav

  if (!shots.length) {
    grid.innerHTML = `<div class="acc-mgr-empty">No screenshots logged yet — attach charts from the trade entry form and they'll show up here.</div>`;
    return;
  }

  grid.innerHTML = shots.map((sh, i) => {
    const rr = Number(sh.trade.rr) || 0;
    const date = sh.trade.entry_time ? new Date(sh.trade.entry_time).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—';
    return `<div class="bl-gallery-thumb" style="background-image:url('${sh.url}')" onclick="_blOpenGalleryLightbox(${i})">
      <div class="bl-gallery-thumb-tag">${sh.key}</div>
      <div class="bl-gallery-thumb-meta">
        <span class="${rr >= 0 ? 'pos' : 'neg'}">${rr >= 0 ? '+' : ''}${rr.toFixed(2)}R</span>
        <span>${date}</span>
      </div>
    </div>`;
  }).join('');
}

function _blOpenGalleryLightbox(startIdx) {
  const shots = window._blGalleryShots || [];
  if (!shots.length) return;
  const images = shots.map(sh => {
    const rr = Number(sh.trade.rr) || 0;
    const stratName = sh.strategy ? sh.strategy.name : 'Unlinked';
    const sessName = sh.session ? sh.session.name : '';
    return { src: sh.url, label: `${stratName} · ${sessName} · ${sh.key} · ${rr >= 0 ? '+' : ''}${rr.toFixed(2)}R` };
  });
  openLightbox(images, startIdx);
}

/* ── Strategy comparison ── */
function _blEdgeScore(stats) {
  if (!stats || !stats.totalTests) return 0;
  const winRate = stats.winRate || 0;
  const avgRR = Math.max(0, Math.min(stats.avgRR || 0, 3));
  const pfNum = stats.profitFactor === '∞' ? 5 : Math.max(0, Math.min(Number(stats.profitFactor) || 0, 5));
  const dd = Math.max(0, Math.min(stats.maxDrawdown || 0, 100));

  const f1 = winRate;                 // 0-100
  const f2 = (avgRR / 3) * 100;        // 0-100
  const f3 = (pfNum / 5) * 100;        // 0-100
  const f4 = 100 - dd;                 // 0-100, lower drawdown = higher score

  return Math.round(f1 * 0.35 + f2 * 0.25 + f3 * 0.25 + f4 * 0.15);
}

function _blComputeStrategyComparison() {
  return (_blData.strategies || [])
    .filter(s => s.status !== 'archived')
    .map(s => {
      const trades = _btTradesForStrategy(s.id);
      const stats = trades.length ? _btComputeStats(trades, 0) : null;
      return { strategy: s, stats, edgeScore: stats ? _blEdgeScore(stats) : null };
    })
    .sort((a, b) => (b.edgeScore ?? -1) - (a.edgeScore ?? -1));
}

function _blRenderComparisonTable() {
  const tbody = document.getElementById('bl-compare-tbody');
  if (!tbody) return;
  const rows = _blComputeStrategyComparison();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No strategies yet — add one in the Strategy Library above.</td></tr>`;
    return;
  }

  const bestId = rows.find(r => r.edgeScore !== null)?.strategy.id;

  tbody.innerHTML = rows.map(r => {
    const s = r.stats;
    const isBest = r.strategy.id === bestId && r.edgeScore !== null;
    if (!s) {
      return `<tr${isBest ? ' class="bl-compare-best"' : ''}>
        <td class="bold">${r.strategy.name || 'Untitled'}</td>
        <td colspan="6" style="color:var(--text3)">No trades logged yet</td>
      </tr>`;
    }
    return `<tr${isBest ? ' class="bl-compare-best"' : ''}>
      <td class="bold">${r.strategy.name || 'Untitled'}${isBest ? ' <span class="pill pill-gold" style="margin-left:6px">STRONGEST</span>' : ''}</td>
      <td>${s.totalTests}</td>
      <td>${s.winRate}%</td>
      <td>${s.avgRR}</td>
      <td>${s.profitFactor}</td>
      <td>${s.maxDrawdown !== null ? s.maxDrawdown + '%' : '—'}</td>
      <td class="bold" style="color:${isBest ? 'var(--gold)' : 'var(--text)'}">${r.edgeScore}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 6: Reports (Section 11)
// CSV needs no library. Excel uses SheetJS, PDF uses jsPDF +
// autotable — both lazy-loaded on first use, same pattern as the
// existing _smEnsureLibs() used for calendar image export, so
// nothing extra loads until a report is actually requested.
// ═══════════════════════════════════════════════════

function _btEnsureReportLibs(cb) {
  const need = [];
  if (typeof window.jspdf === 'undefined') need.push('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (typeof window.XLSX === 'undefined') need.push('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const loadNext = () => {
    if (!need.length) {
      // autotable plugin patches window.jspdf.jsPDF.prototype — load last, after jsPDF itself
      if (typeof window.jspdf !== 'undefined' && !window.jspdf.jsPDF.API.autoTable) {
        const at = document.createElement('script');
        at.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
        at.onload = cb;
        document.head.appendChild(at);
      } else cb();
      return;
    }
    const src = need.shift();
    const s = document.createElement('script');
    s.src = src; s.onload = loadNext;
    document.head.appendChild(s);
  };
  loadNext();
}

function _downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function _btToggleExportMenu(e, sessionId) {
  e.stopPropagation();
  const menu = document.getElementById('bt-export-menu');
  if (!menu) return;
  const open = menu.style.display !== 'none';
  menu.style.display = open ? 'none' : 'flex';
  if (!open) {
    const closer = ev => { if (!menu.contains(ev.target)) { menu.style.display = 'none'; document.removeEventListener('click', closer); } };
    setTimeout(() => document.addEventListener('click', closer), 0);
  }
}

/* Flat row shape shared by CSV + Excel exports */
function _btTradeRows(trades) {
  return trades.map((t, i) => {
    const d = t.data || {};
    return {
      '#': i + 1,
      Direction: t.direction || '',
      Entry: t.entry_price ?? '',
      Stop: t.stop_price ?? '',
      Exit: t.exit_price ?? '',
      RR: Number(t.rr) || 0,
      'P/L': Number(t.pnl) || 0,
      'Entry Time': t.entry_time || '',
      'Exit Time': t.exit_time || '',
      MFE: d.mfe || '', MAE: d.mae || '',
      'Reason (Entry)': d.reasonEntry || '', 'Reason (Exit)': d.reasonExit || '',
      Mistakes: (d.mistakes || []).join('; '),
      Psychology: d.psychology || '',
      Confidence: d.confidenceLevel || '', Execution: d.executionRating || '', Discipline: d.disciplineRating || '',
      Notes: d.notes || '',
    };
  });
}

function _csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function _rowsToCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => _csvEscape(r[h])).join(',')));
  return lines.join('\n');
}

function _btExportCSV(sessionId) {
  const s = _btGetSessionById(sessionId); if (!s) return;
  const trades = _btTradesForSession(sessionId).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));
  if (!trades.length) { showToast('No trades to export', 'danger'); return; }
  const csv = _rowsToCSV(_btTradeRows(trades));
  _downloadBlob(new Blob([csv], { type: 'text/csv' }), `${(s.name || 'session').replace(/\s+/g, '_')}_trades.csv`);
  document.getElementById('bt-export-menu').style.display = 'none';
  showToast('CSV exported ✓', 'restore');
}

function _btExportExcel(sessionId) {
  const s = _btGetSessionById(sessionId); if (!s) return;
  const trades = _btTradesForSession(sessionId).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));
  if (!trades.length) { showToast('No trades to export', 'danger'); return; }
  const stats = _btComputeStats(trades, Number(s.startingBalance) || 0);

  _btEnsureReportLibs(() => {
    const wb = XLSX.utils.book_new();
    const summaryRows = [
      { Metric: 'Session', Value: s.name },
      { Metric: 'Pair', Value: s.pair || '' },
      { Metric: 'Timeframe', Value: s.timeframe || '' },
      { Metric: 'Total Trades', Value: stats.totalTests },
      { Metric: 'Win Rate', Value: stats.winRate + '%' },
      { Metric: 'Expectancy', Value: stats.expectancy },
      { Metric: 'Profit Factor', Value: stats.profitFactor },
      { Metric: 'Avg RR', Value: stats.avgRR },
      { Metric: 'Max Drawdown', Value: (stats.maxDrawdown ?? '—') + '%' },
      { Metric: 'Net Return', Value: stats.netReturn },
      { Metric: 'Best Trade', Value: stats.bestTrade },
      { Metric: 'Worst Trade', Value: stats.worstTrade },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(_btTradeRows(trades)), 'Trades');
    XLSX.writeFile(wb, `${(s.name || 'session').replace(/\s+/g, '_')}_report.xlsx`);
    document.getElementById('bt-export-menu').style.display = 'none';
    showToast('Excel report exported ✓', 'restore');
  });
}

/* Render an equity curve to an offscreen canvas at export time (independent
   of whatever's on-screen) so PDF export works even if the Analytics tab
   was never opened. */
function _btChartToImage(trades, drawFn, w, h) {
  const tmp = document.createElement('canvas');
  tmp.id = '_bt_export_tmp_' + Date.now();
  tmp.style.position = 'fixed'; tmp.style.left = '-9999px'; tmp.style.width = w + 'px';
  const wrap = document.createElement('div'); wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px`;
  wrap.appendChild(tmp);
  document.body.appendChild(wrap);
  drawFn(trades, tmp.id);
  const dataUrl = tmp.toDataURL('image/png');
  wrap.remove();
  return dataUrl;
}

function _btExportPDF(sessionId) {
  const s = _btGetSessionById(sessionId); if (!s) return;
  const trades = _btTradesForSession(sessionId).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));
  if (!trades.length) { showToast('No trades to export', 'danger'); return; }
  const stats = _btComputeStats(trades, Number(s.startingBalance) || 0);
  document.getElementById('bt-export-menu').style.display = 'none';
  showToast('Building PDF report…', 'info');

  _btEnsureReportLibs(() => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 48;

    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    doc.text('NxTGen Backtesting Lab — Session Report', 40, y); y += 22;
    doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(90);
    doc.text(`${s.name}  ·  ${s.pair || 'pair n/a'}  ·  ${s.timeframe || 'tf n/a'}  ·  generated ${new Date().toLocaleDateString()}`, 40, y);
    doc.setTextColor(0); y += 26;

    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9 },
      head: [['Trades', 'Win Rate', 'Expectancy', 'Profit Factor', 'Avg RR', 'Max DD', 'Net Return']],
      body: [[stats.totalTests, stats.winRate + '%', stats.expectancy, stats.profitFactor, stats.avgRR, (stats.maxDrawdown ?? '—') + '%', stats.netReturn]],
    });
    y = doc.lastAutoTable.finalY + 20;

    if (trades.length >= 2) {
      const imgW = pageW - 80, imgH = 150;
      const dataUrl = _btChartToImage(trades, (tr, id) => _btDrawEquityCurve(tr, id), imgW, imgH);
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Equity Curve', 40, y); y += 8;
      doc.addImage(dataUrl, 'PNG', 40, y, imgW, imgH); y += imgH + 24;
    }

    if (s.aiReview && s.aiReview.text) {
      if (y > 650) { doc.addPage(); y = 48; }
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('AI Review', 40, y); y += 16;
      doc.setFontSize(9.5); doc.setFont(undefined, 'normal');
      const plain = s.aiReview.text.replace(/[#*_`]/g, '');
      const lines = doc.splitTextToSize(plain, pageW - 80);
      lines.forEach(line => { if (y > 780) { doc.addPage(); y = 48; } doc.text(line, 40, y); y += 12; });
      y += 16;
    }

    doc.addPage();
    doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text('Trade Log', 40, 48);
    doc.autoTable({
      startY: 62, theme: 'striped', styles: { fontSize: 7.5 }, headStyles: { fillColor: [30, 30, 40] },
      head: [['#', 'Dir', 'Entry', 'Stop', 'Exit', 'RR', 'P/L', 'Entry Time']],
      body: trades.map((t, i) => [i + 1, t.direction || '', t.entry_price ?? '', t.stop_price ?? '', t.exit_price ?? '', (Number(t.rr) || 0).toFixed(2), (Number(t.pnl) || 0).toFixed(2), t.entry_time ? new Date(t.entry_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—']),
    });

    doc.save(`${(s.name || 'session').replace(/\s+/g, '_')}_report.pdf`);
    showToast('PDF report ready ✓', 'restore');
  });
}

/* ── Lab-wide report: cover + strategy comparison + per-strategy stats ── */
function _blExportLabReportPDF() {
  const rows = _blComputeStrategyComparison();
  if (!rows.length) { showToast('No strategies to report on', 'danger'); return; }
  showToast('Building Lab Report…', 'info');

  _btEnsureReportLibs(() => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 48;

    doc.setFontSize(20); doc.setFont(undefined, 'bold');
    doc.text('NxTGen Backtesting Lab — Full Report', 40, y); y += 22;
    doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(90);
    doc.text(`${rows.length} strategies · generated ${new Date().toLocaleDateString()}`, 40, y);
    doc.setTextColor(0); y += 26;

    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text('Strategy Comparison', 40, y); y += 8;
    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9 },
      head: [['Strategy', 'Trades', 'Win Rate', 'Avg RR', 'Profit Factor', 'Max DD', 'Edge Score']],
      body: rows.map(r => [
        r.strategy.name || 'Untitled',
        r.stats ? r.stats.totalTests : 0,
        r.stats ? r.stats.winRate + '%' : '—',
        r.stats ? r.stats.avgRR : '—',
        r.stats ? r.stats.profitFactor : '—',
        r.stats ? (r.stats.maxDrawdown ?? '—') + '%' : '—',
        r.edgeScore ?? '—',
      ]),
      didParseCell: (data) => {
        if (data.section === 'body' && rows[data.row.index]?.strategy.id === rows.find(x => x.edgeScore !== null)?.strategy.id) {
          data.cell.styles.fillColor = [251, 191, 36]; data.cell.styles.textColor = [20, 20, 20];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 26;

    rows.filter(r => r.stats).forEach(r => {
      const trades = _btTradesForStrategy(r.strategy.id).slice().sort((a, b) => new Date(a.entry_time || 0) - new Date(b.entry_time || 0));
      if (y > 620) { doc.addPage(); y = 48; }
      doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.text(r.strategy.name || 'Untitled', 40, y); y += 6;
      if (trades.length >= 2) {
        const imgW = pageW - 80, imgH = 120;
        const dataUrl = _btChartToImage(trades, (tr, id) => _btDrawEquityCurve(tr, id), imgW, imgH);
        doc.addImage(dataUrl, 'PNG', 40, y, imgW, imgH); y += imgH + 14;
      } else { y += 14; }
    });

    doc.save('NxTGen_Lab_Report.pdf');
    showToast('Lab Report ready ✓', 'restore');
  });
}

// ═══════════════════════════════════════════════════
// BACKTESTING LAB — Phase 7: Dashboard Integration (Section 12)
// Pulls live from _blData.sessions / _blData.strategies / _btTrades
// (all already loaded at app init) — no extra fetch needed.
// ═══════════════════════════════════════════════════

const BL_MIN_PER_TRADE = 12; // assumption: ~12 min of chart analysis/journaling per simulated trade logged

/* Consecutive-day practice streak, based on the calendar dates of
   simulated trade entries. Counts back from today (or yesterday, so
   a day in progress doesn't show as "broken" before it's over). */
function _blPracticeStreak() {
  const days = new Set(_btTrades.map(t => (t.entry_time || t.created_at || '').slice(0, 10)).filter(Boolean));
  if (!days.size) return 0;
  const todayStr = localToday ? localToday() : new Date().toISOString().slice(0, 10);
  let cursor = new Date(todayStr + 'T12:00:00');
  // If nothing logged today, allow the streak to still "count" through yesterday
  if (!days.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (true) {
    const ds = cursor.toISOString().slice(0, 10);
    if (days.has(ds)) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

function _blFmtHours(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  if (h === 0) return m + 'm';
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

function _blRenderDashboardWidgets() {
  const totalEl = document.getElementById('dash-bl-total');
  if (!totalEl) return; // widgets not in DOM (shouldn't happen, but stay defensive)

  const sessions = _blData.sessions || [];
  const totalTrades = _btTrades.length;

  document.getElementById('dash-bl-total').textContent = sessions.length;
  document.getElementById('dash-bl-total-sub').textContent = totalTrades + ' trade' + (totalTrades === 1 ? '' : 's') + ' logged';

  document.getElementById('dash-bl-hours').textContent = totalTrades ? _blFmtHours(totalTrades * BL_MIN_PER_TRADE) : '—';

  const comparison = (typeof _blComputeStrategyComparison === 'function') ? _blComputeStrategyComparison() : [];
  const top = comparison.find(r => r.edgeScore !== null);
  document.getElementById('dash-bl-edge').textContent = top ? top.edgeScore : '—';
  document.getElementById('dash-bl-edge-sub').textContent = top ? top.strategy.name : (comparison.length ? 'Log trades to unlock' : 'No strategies yet');

  document.getElementById('dash-bl-streak').textContent = totalTrades ? _blPracticeStreak() + 'd' : '—';
}

