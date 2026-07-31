/* ══════════════════════════════════════════════════════════════
   AI CHAT UPGRADE (Phase 1)
   — ChatWelcome / CoachingContextPanel / SmartPromptGrid /
     DataUsedDisclosure / ResponseActions / ContextSelector
   Additive module, loaded after core-utils-ai.js. Wraps
   chatInit / _chatAddQuickChips / _chatAddBubble / chatSend
   instead of editing them, so every existing chat capability
   (slash commands, drag-drop, export, clear, sessionStorage
   history, image attachments) keeps working unchanged.
   ══════════════════════════════════════════════════════════════ */

(function () {
  const NEG_EMOTIONS = ['Anxious','Fearful','Greedy','Revenge','Impatient','Frustrated','Impulsive','Stressed','Tired','FOMO'];

  /* ─────────────────────────────────────────────
     Real-data context (no invented numbers)
     ───────────────────────────────────────────── */
  function ctx() {
    const hasTrades = typeof trades !== 'undefined' && Array.isArray(trades);
    const total = hasTrades ? trades.length : 0;
    const today = typeof localToday === 'function' ? localToday() : null;
    const todayTrades = hasTrades && today ? trades.filter(t => t.date === today) : [];
    const todayPnl = todayTrades.reduce((a, t) => a + (typeof _pnlPctValue === 'function' ? _pnlPctValue(t) : 0), 0);
    const sorted = hasTrades ? trades.slice().sort((a, b) => a.date.localeCompare(b.date)) : [];
    const lastEmotion = sorted.length ? sorted[sorted.length - 1].emotion : null;
    const last3 = sorted.slice(-3);
    const losingStreak = last3.length >= 2 && last3.slice(-2).every(t => t.outcome === 'Loss');
    const winningStreak = last3.length >= 2 && last3.slice(-2).every(t => t.outcome === 'Win');
    const journalConnected = hasTrades;
    const perfDataAvailable = total > 0;
    const dateRangeLabel = sorted.length
      ? `${sorted[0].date} – ${sorted[sorted.length - 1].date}`
      : null;

    return { hasTrades, total, today, todayTrades, todayPnl, lastEmotion, losingStreak, winningStreak, journalConnected, perfDataAvailable, dateRangeLabel };
  }

  function esc(s) { return (s || '').replace(/'/g, "\\'"); }

  /* ─────────────────────────────────────────────
     Today's Coaching Context panel (empty state)
     ───────────────────────────────────────────── */
  function contextPanelHtml(c) {
    const name = (typeof _profileData !== 'undefined' && _profileData && (_profileData.display_name || _profileData.fname)) || 'NxTGen';
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

    const statusRow = `
      <div class="chat-ctx-status">
        <span><span class="dot"></span>AI Online</span>
        <span><span class="dot ${c.journalConnected ? '' : 'off'}"></span>${c.journalConnected ? 'Journal Connected' : 'Journal not connected — no trades recorded yet'}</span>
        <span><span class="dot ${c.perfDataAvailable ? '' : 'off'}"></span>${c.perfDataAvailable ? 'Performance Data Available' : 'Performance data not available yet'}</span>
      </div>`;

    let body;
    if (!c.total) {
      body = `<div class="chat-ctx-row">
        <span class="chat-ctx-pill"><span class="dot"></span>No trades recorded</span>
      </div>
      <div class="chat-ctx-focus">Record your first trade to unlock personalized coaching based on your own data.</div>`;
    } else {
      const todayPill = c.todayTrades.length
        ? `<span class="chat-ctx-pill blue"><span class="dot"></span>Today: ${c.todayTrades.length} trade${c.todayTrades.length===1?'':'s'} · ${c.todayPnl>=0?'+':''}${c.todayPnl.toFixed(1)}%</span>`
        : `<span class="chat-ctx-pill"><span class="dot"></span>No trades today</span>`;
      const emoPill = c.lastEmotion
        ? `<span class="chat-ctx-pill ${NEG_EMOTIONS.includes(c.lastEmotion) ? 'gold' : 'green'}"><span class="dot"></span>Last emotion: ${c.lastEmotion}</span>`
        : `<span class="chat-ctx-pill"><span class="dot"></span>Emotion: not tracked</span>`;
      const streakPill = c.losingStreak
        ? `<span class="chat-ctx-pill red"><span class="dot"></span>2-loss streak</span>`
        : c.winningStreak
          ? `<span class="chat-ctx-pill green"><span class="dot"></span>2-win streak</span>`
          : '';

      let focus;
      if (c.losingStreak) focus = "Your last two logged trades were losses — worth reviewing before your next entry.";
      else if (c.todayTrades.length === 0) focus = "No trades logged yet today — ask for a pre-session brief before you start.";
      else focus = "Ask me to review your latest trade, or check in on your plan compliance.";

      body = `<div class="chat-ctx-row">${todayPill}${emoPill}${streakPill}</div>
      <div class="chat-ctx-focus"><strong>Coach focus:</strong> ${focus}</div>`;
    }

    return `<div class="chat-ctx-panel">
      <div style="font-size:12.5px;color:var(--text);margin-bottom:2px"><strong>${greet}, ${name}.</strong></div>
      ${statusRow}
      ${body}
    </div>`;
  }

  /* ─────────────────────────────────────────────
     Smart Prompt Grid (empty state)
     ───────────────────────────────────────────── */
  const PROMPT_CATEGORIES = [
    { title: 'Performance', prompts: [
      'Review my recent trades', "What is my strongest edge?", 'What is hurting my performance?', 'Compare this week with last week'] },
    { title: 'Risk', prompts: [
      'Review my risk management', 'Am I risking too much?', 'Analyze my drawdown', 'Check my risk consistency'] },
    { title: 'Psychology', prompts: [
      'Analyze my trading psychology', 'Identify emotional patterns', 'Help me recover after a losing streak', 'Check for revenge-trading behavior'] },
    { title: 'Strategy', prompts: [
      'Analyze my best setup', 'Compare my setups', 'Review my trade execution', 'Help me refine my strategy'] },
    { title: 'Planning', prompts: [
      'Give me a daily trading brief', 'Am I ready to trade?', 'Help me prepare for London session', 'Create a trading plan'] },
    { title: 'Chart Analysis', prompts: [
      'Analyze a chart', 'Challenge my bias', 'Review my entry', 'Find weaknesses in this setup'] },
  ];

  function promptGridHtml() {
    const cats = PROMPT_CATEGORIES.map(cat => `
      <div class="chat-prompt-cat">
        <div class="chat-prompt-cat-head">${cat.title}</div>
        ${cat.prompts.map(p => `<button class="chat-prompt-card" onclick="chatQuickSend(this,'${esc(p)}')">${p}</button>`).join('')}
      </div>`).join('');
    return `<div class="chat-grid-title">What would you like to work on?</div><div class="chat-prompt-grid">${cats}</div>`;
  }

  /* ─────────────────────────────────────────────
     Context-aware smart chips (mid-conversation)
     ───────────────────────────────────────────── */
  function smartChips(c) {
    let list;
    if (!c.total) list = ['Give me a pre-market brief', 'Help me set up my journal', 'What should I track first?'];
    else if (c.losingStreak) list = ['Review my recent losses', 'Identify repeated mistakes', 'Should I pause trading?', 'Help me reset mentally'];
    else if (c.winningStreak) list = ['What am I doing well?', 'How can I protect this edge?', 'Which setup is contributing most?'];
    else if (c.todayTrades.length === 0) list = ['Give me a pre-market brief', 'Am I ready to trade?', 'Help me define today\u2019s risk', 'What should I focus on today?'];
    else list = ['Review my latest trade', 'Did I follow my plan?', 'Analyze my execution', 'Help me journal this trade'];

    return `<div class="chat-smart-chips">${list.map(q => `<button class="chat-smart-chip" onclick="chatQuickSend(this,'${esc(q)}')">${q}</button>`).join('')}</div>`;
  }

  /* ─────────────────────────────────────────────
     Override _chatAddQuickChips (the existing hook that
     already fires on init + after every response)
     ───────────────────────────────────────────── */
  window._chatAddQuickChips = function () {
    const msgs = document.getElementById('chat-messages');
    if (!msgs) return;
    const existing = document.getElementById('chat-quick-chips');
    if (existing) existing.remove();

    const c = ctx();
    const div = document.createElement('div');
    div.id = 'chat-quick-chips';
    div.className = 'chat-quick-chips';

    const isEmpty = (typeof _chatHistory === 'undefined') || _chatHistory.length === 0;
    div.innerHTML = isEmpty ? (contextPanelHtml(c) + promptGridHtml()) : smartChips(c);
    msgs.appendChild(div);
  };

  /* ─────────────────────────────────────────────
     Data Used disclosure + Response actions
     Wraps _chatAddBubble so every existing call site
     (chatInit, chatSend, _chatRebuildFromHistory) keeps
     working, just with a richer assistant bubble.
     ───────────────────────────────────────────── */
  let _lastUserPrompt = '';

  if (typeof _chatAddBubble === 'function') {
    const _origAddBubble = _chatAddBubble;
    window._chatAddBubble = function (role, content, ts, animate, images) {
      const id = _origAddBubble(role, content, ts, animate, images);
      if (role === 'user' && typeof content === 'string') _lastUserPrompt = content;
      if (role === 'assistant' && content !== (typeof _CHAT_WELCOME !== 'undefined' ? _CHAT_WELCOME : null)) {
        _decorateAssistantBubble(id);
      }
      return id;
    };
  }

  function _decorateAssistantBubble(id) {
    const bubble = document.getElementById(id);
    if (!bubble) return;
    const contentEl = bubble.querySelector('.chat-bubble-content');
    if (!contentEl || contentEl.dataset.decorated) return;
    contentEl.dataset.decorated = '1';

    const c = ctx();
    const disclosure = document.createElement('div');
    disclosure.className = 'chat-disclosure';
    disclosure.setAttribute('role', 'button');
    disclosure.setAttribute('tabindex', '0');
    disclosure.onclick = () => disclosure.classList.toggle('open');
    disclosure.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); disclosure.classList.toggle('open'); } };

    if (!c.total) {
      disclosure.innerHTML = `<span class="chat-disclosure-caret">▸</span> No journal data used — record trades to unlock personalized analysis.`;
    } else {
      disclosure.innerHTML = `<span class="chat-disclosure-caret">▸</span> Based on ${c.total} logged trade${c.total===1?'':'s'}${c.dateRangeLabel ? ' (' + c.dateRangeLabel + ')' : ''}
        <div class="chat-disclosure-detail">
          Trades analyzed: ${c.total}${c.dateRangeLabel ? `<br>Date range: ${c.dateRangeLabel}` : ''}<br>
          Data categories available: outcomes, PnL, pair, session, strategy, emotion, rating, notes.<br>
          ${c.total < 10 ? 'Limited sample — treat pattern claims as tentative until more trades are logged.' : ''}
        </div>`;
    }
    contentEl.appendChild(disclosure);

    const actions = document.createElement('div');
    actions.className = 'chat-resp-actions';
    actions.innerHTML = `
      <button class="chat-resp-act-btn" onclick="_chatFollowUp('${id}')">Ask Follow-up</button>
      <button class="chat-resp-act-btn" onclick="_chatExplainMore('${id}')">Explain This</button>
      <button class="chat-resp-act-btn" onclick="_chatRegenerate()">Regenerate</button>
      <button class="chat-resp-act-btn" onclick="_chatCopyBubble('${id}')">Copy</button>
    `;
    contentEl.appendChild(actions);
  }

  window._chatFollowUp = function () {
    const inp = document.getElementById('chat-input');
    if (!inp) return;
    inp.value = 'Can you go deeper on that — ';
    inp.focus();
    if (typeof chatInputChange === 'function') chatInputChange(inp);
  };

  window._chatExplainMore = function (id) {
    const bubble = document.getElementById(id);
    const inp = document.getElementById('chat-input');
    if (!bubble || !inp) return;
    inp.value = 'Explain your last answer in more depth, with the specific trades behind it.';
    inp.focus();
    if (typeof chatInputChange === 'function') chatInputChange(inp);
  };

  window._chatRegenerate = function () {
    const inp = document.getElementById('chat-input');
    if (!inp || !_lastUserPrompt) return;
    inp.value = _lastUserPrompt;
    if (typeof chatSend === 'function') chatSend();
  };

  /* ─────────────────────────────────────────────
     Composer toolbar — mode select + date-range +
     optional chart fields. Purely additive UI; mode
     is applied by prefixing the existing slash-command
     syntax that chatSend() already understands, so the
     underlying AI call flow is untouched.
     ───────────────────────────────────────────── */
  const MODE_TO_CMD = {
    review: '/daily', trade: '', psych: '/psych', risk: '',
    strategy: '', chart: '/chart', plan: '/plan',
  };
  let _chatMode = 'auto';
  let _chatRange = 'all';

  function buildToolbar() {
    if (document.getElementById('chat-composer-toolbar-inner')) return;
    const mount = document.getElementById('chat-composer-toolbar');
    if (!mount) return;
    mount.innerHTML = `
      <div class="chat-toolbar" id="chat-composer-toolbar-inner">
        <span class="chat-toolbar-label">Mode</span>
        <select id="chat-mode-select" onchange="_chatModeChange(this.value)">
          <option value="auto">Auto — AI chooses context</option>
          <option value="review">Performance Review</option>
          <option value="trade">Trade Review</option>
          <option value="psych">Psychology Coach</option>
          <option value="risk">Risk Coach</option>
          <option value="strategy">Strategy Coach</option>
          <option value="chart">Chart Analysis</option>
          <option value="plan">Trading Plan</option>
        </select>
        <span class="chat-toolbar-label">Range</span>
        <select id="chat-range-select" onchange="_chatRangeChange(this.value)">
          <option value="all">All-time</option>
          <option value="week">This week</option>
          <option value="30d">Last 30 days</option>
        </select>
        <span class="chat-ctx-using" id="chat-ctx-using">Using: recent trades + journal data</span>
      </div>
      <div class="chat-fields-row" id="chat-fields-row">
        <input type="text" id="cf-instrument" placeholder="Instrument (e.g. EURUSD)">
        <input type="text" id="cf-timeframe" placeholder="Timeframe (e.g. 5m)">
        <input type="text" id="cf-session" placeholder="Session (e.g. London)">
        <input type="text" id="cf-bias" placeholder="Your bias (e.g. Bullish)">
      </div>`;
  }

  window._chatModeChange = function (v) { _chatMode = v; };
  window._chatRangeChange = function (v) {
    _chatRange = v;
    const label = v === 'week' ? 'Using: this week\u2019s trades' : v === '30d' ? 'Using: last 30 days of trades' : 'Using: recent trades + journal data';
    const el = document.getElementById('chat-ctx-using');
    if (el) el.textContent = label;
  };

  // Show/hide optional chart fields when an image is attached — reuse the
  // existing chat-image-preview visibility as the trigger via a small poller
  // hooked off chatHandleFiles / chatDrop (both already call _chatLoadImageFiles).
  if (typeof _chatLoadImageFiles === 'function') {
    const _origLoadImages = _chatLoadImageFiles;
    window._chatLoadImageFiles = function (files) {
      const r = _origLoadImages(files);
      const row = document.getElementById('chat-fields-row');
      if (row) row.classList.add('show');
      return r;
    };
  }
  if (typeof chatRemoveImage === 'function') {
    const _origRemoveImg = chatRemoveImage;
    window.chatRemoveImage = function (i) {
      const r = _origRemoveImg(i);
      const row = document.getElementById('chat-fields-row');
      if (row && (typeof _chatImages === 'undefined' || !_chatImages.length)) row.classList.remove('show');
      return r;
    };
  }

  /* Wrap chatSend: apply selected mode (as a slash-command prefix) and fold
     in optional chart-context fields — without touching the original
     command parsing / streaming / error-handling logic at all. */
  if (typeof chatSend === 'function') {
    const _origChatSend2 = chatSend;
    window.chatSend = function () {
      const inp = document.getElementById('chat-input');
      if (inp && inp.value && !inp.value.trim().startsWith('/')) {
        const cmd = MODE_TO_CMD[_chatMode];
        if (cmd) inp.value = `${cmd} ${inp.value}`;

        const fieldsRow = document.getElementById('chat-fields-row');
        if (fieldsRow && fieldsRow.classList.contains('show')) {
          const parts = [];
          const iv = document.getElementById('cf-instrument')?.value.trim();
          const tf = document.getElementById('cf-timeframe')?.value.trim();
          const se = document.getElementById('cf-session')?.value.trim();
          const bi = document.getElementById('cf-bias')?.value.trim();
          if (iv) parts.push(`Instrument: ${iv}`);
          if (tf) parts.push(`Timeframe: ${tf}`);
          if (se) parts.push(`Session: ${se}`);
          if (bi) parts.push(`My bias: ${bi}`);
          if (parts.length) inp.value = `${parts.join(' | ')}\n${inp.value}`;
          ['cf-instrument','cf-timeframe','cf-session','cf-bias'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        }

        if (_chatRange !== 'all') {
          const label = _chatRange === 'week' ? "this week's trades only" : 'the last 30 days of trades only';
          inp.value = `${inp.value}\n(Please scope your analysis to ${label} where possible, and say so if you can't verify the range.)`;
        }
      }
      return _origChatSend2();
    };
  }

  /* ─────────────────────────────────────────────
     Init: build toolbar once chat panel exists
     ───────────────────────────────────────────── */
  if (typeof chatInit === 'function') {
    const _origChatInit = chatInit;
    window.chatInit = function () {
      _origChatInit();
      buildToolbar();
    };
  }
})();
