/* ══════════════════════════════════════════════════════════════
   AI CHAT HISTORY (Phase 2)
   — ChatHistoryPanel: multiple saved conversations per user,
     search, rename, delete, date grouping, New Chat.
   Additive module. Wraps _chatSaveSession / chatClearHistory /
   chatInit instead of editing them. If the optional
   ai_chat_conversations table doesn't exist yet, everything
   degrades gracefully back to the existing single-session
   sessionStorage behaviour — nothing else breaks.
   ══════════════════════════════════════════════════════════════ */

(function () {
  let _convId = null;          // currently open conversation id (null = unsaved)
  let _convCache = [];         // [{id, title, updated_at, created_at}]
  let _convListLoaded = false;
  let _histOpen = false;
  let _histSearchQ = '';
  let _renamingId = null;

  function haveCloud() {
    return typeof sb !== 'undefined' && typeof _currentUser !== 'undefined' && _currentUser;
  }

  /* ─────────────────────────────────────────────
     Cloud save (debounced) — piggybacks on the
     existing lightweight history the app already
     keeps for sessionStorage.
     ───────────────────────────────────────────── */
  async function cloudSave() {
    if (!haveCloud()) return;
    if (typeof _chatHistory === 'undefined' || _chatHistory.length < 2) return; // wait for at least one exchange
    try {
      const lightweight = _chatHistory.map(m => ({ role: m.role, content: m.content, ts: m.ts }));
      if (_convId) {
        const { error } = await sb.from('ai_chat_conversations')
          .update({ messages: lightweight, updated_at: new Date().toISOString() })
          .eq('id', _convId).eq('user_id', _currentUser.id);
        if (error) throw error;
      } else {
        const firstUser = _chatHistory.find(m => m.role === 'user');
        const title = (firstUser?.content || 'New conversation').slice(0, 60);
        const { data, error } = await sb.from('ai_chat_conversations')
          .insert({ user_id: _currentUser.id, title, messages: lightweight })
          .select('id').single();
        if (error) throw error;
        if (data) { _convId = data.id; _convListLoaded = false; }
      }
    } catch (err) {
      console.warn('chat history cloud save failed (table may not exist yet):', err.message || err);
    }
  }
  const cloudSaveDebounced = typeof _debounce === 'function' ? _debounce(cloudSave, 900) : cloudSave;

  if (typeof _chatSaveSession === 'function') {
    const _orig = _chatSaveSession;
    window._chatSaveSession = function () {
      _orig();
      cloudSaveDebounced();
    };
  }

  if (typeof chatClearHistory === 'function') {
    const _orig = chatClearHistory;
    window.chatClearHistory = function () {
      const hadHistory = typeof _chatHistory !== 'undefined' && _chatHistory.length > 0;
      _orig();
      // Only actually "start new" if the clear went through (user confirmed, or nothing to confirm)
      if (!hadHistory || (typeof _chatHistory !== 'undefined' && _chatHistory.length === 0)) {
        _convId = null;
      }
    };
  }

  window.chatHistNewChat = function () {
    chatClearHistory();
    closePanel();
  };

  /* ─────────────────────────────────────────────
     Loading / opening conversations
     ───────────────────────────────────────────── */
  async function loadList(force) {
    if (!haveCloud()) { _convCache = []; _convListLoaded = true; return; }
    if (_convListLoaded && !force) return;
    try {
      const { data, error } = await sb.from('ai_chat_conversations')
        .select('id, title, updated_at, created_at')
        .eq('user_id', _currentUser.id)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      _convCache = data || [];
    } catch (err) {
      console.warn('chat history list load failed (table may not exist yet):', err.message || err);
      _convCache = [];
    }
    _convListLoaded = true;
  }

  window.chatHistOpenConversation = async function (id) {
    if (!haveCloud()) return;
    try {
      const { data, error } = await sb.from('ai_chat_conversations')
        .select('id, messages').eq('id', id).eq('user_id', _currentUser.id).single();
      if (error) throw error;
      _chatHistory = (data.messages || []).map(m => ({ ...m }));
      _chatMsgCount = _chatHistory.length;
      _convId = id;
      if (typeof _chatRebuildFromHistory === 'function') _chatRebuildFromHistory();
      if (typeof _chatSaveSession === 'function') {
        // refresh the local sessionStorage mirror without triggering another cloud write
        try { sessionStorage.setItem('nxtgen_chat', JSON.stringify({ history: _chatHistory, count: _chatMsgCount })); } catch (_) {}
      }
    } catch (err) {
      showToast?.('Could not open that conversation.', 'danger');
      console.warn('chatHistOpenConversation failed:', err.message || err);
    }
    closePanel();
  };

  window.chatHistDelete = async function (id, ev) {
    ev?.stopPropagation();
    if (!confirm('Delete this conversation? This can\'t be undone.')) return;
    if (!haveCloud()) return;
    try {
      const { error } = await sb.from('ai_chat_conversations').delete().eq('id', id).eq('user_id', _currentUser.id);
      if (error) throw error;
      _convCache = _convCache.filter(c => c.id !== id);
      if (_convId === id) { _convId = null; chatClearHistory(); }
      renderPanel();
    } catch (err) {
      showToast?.('Delete failed.', 'danger');
      console.warn('chatHistDelete failed:', err.message || err);
    }
  };

  window.chatHistStartRename = function (id, ev) {
    ev?.stopPropagation();
    _renamingId = id;
    renderPanel();
    const inp = document.getElementById(`chat-hist-rename-${id}`);
    if (inp) { inp.focus(); inp.select(); }
  };

  window.chatHistCommitRename = async function (id, val, ev) {
    ev?.stopPropagation();
    _renamingId = null;
    const title = (val || '').trim();
    if (!title) { renderPanel(); return; }
    const conv = _convCache.find(c => c.id === id);
    if (conv) conv.title = title;
    renderPanel();
    if (!haveCloud()) return;
    try {
      const { error } = await sb.from('ai_chat_conversations').update({ title }).eq('id', id).eq('user_id', _currentUser.id);
      if (error) throw error;
    } catch (err) {
      console.warn('chatHistCommitRename failed:', err.message || err);
    }
  };

  window.chatHistRenameKey = function (e, id) {
    if (e.key === 'Enter') { e.preventDefault(); chatHistCommitRename(id, e.target.value); }
    if (e.key === 'Escape') { _renamingId = null; renderPanel(); }
  };

  window.chatHistSearch = function (val) {
    _histSearchQ = (val || '').toLowerCase();
    renderPanel();
  };

  /* ─────────────────────────────────────────────
     Panel open/close
     ───────────────────────────────────────────── */
  function ensureOverlay() {
    const container = document.getElementById('chat-container');
    if (!container) return;
    if (document.getElementById('chat-hist-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'chat-hist-overlay';
    ov.className = 'chat-hist-overlay';
    ov.onclick = closePanel;
    container.appendChild(ov);
  }

  function openPanel() {
    ensureOverlay();
    _histOpen = true;
    loadList(true).then(renderPanel);
    renderPanel();
    document.getElementById('chat-history-panel')?.classList.add('open');
    document.getElementById('chat-hist-overlay')?.classList.add('show');
    document.getElementById('chat-history-panel')?.setAttribute('aria-hidden', 'false');
  }

  function closePanel() {
    _histOpen = false;
    document.getElementById('chat-history-panel')?.classList.remove('open');
    document.getElementById('chat-hist-overlay')?.classList.remove('show');
    document.getElementById('chat-history-panel')?.setAttribute('aria-hidden', 'true');
  }

  window.chatHistToggle = function () {
    if (_histOpen) closePanel(); else openPanel();
  };

  /* ─────────────────────────────────────────────
     Rendering — date-grouped, searchable list
     ───────────────────────────────────────────── */
  function groupLabel(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return 'This Week';
    if (diffDays <= 30) return 'This Month';
    return 'Older';
  }

  function renderPanel() {
    const panel = document.getElementById('chat-history-panel');
    if (!panel) return;

    if (!haveCloud()) {
      panel.innerHTML = `
        <div class="chat-hist-head">
          <span class="chat-hist-title">Conversations</span>
          <button class="chat-hist-close" onclick="chatHistToggle()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
        </div>
        <div class="chat-hist-empty">Sign in to save and browse multiple conversations. Your current chat still works as before.</div>`;
      return;
    }

    const q = _histSearchQ;
    const filtered = q ? _convCache.filter(c => (c.title || '').toLowerCase().includes(q)) : _convCache;

    const groups = {};
    filtered.forEach(c => {
      const g = groupLabel(c.updated_at || c.created_at);
      (groups[g] = groups[g] || []).push(c);
    });
    const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];

    const listHtml = filtered.length
      ? order.filter(g => groups[g]).map(g => `
          <div class="chat-hist-group-label">${g}</div>
          ${groups[g].map(itemHtml).join('')}
        `).join('')
      : `<div class="chat-hist-empty">${q ? 'No conversations match your search.' : 'No saved conversations yet — send a couple of messages and this chat will be saved automatically.'}</div>`;

    panel.innerHTML = `
      <div class="chat-hist-head">
        <span class="chat-hist-title">Conversations</span>
        <button class="chat-hist-close" onclick="chatHistToggle()"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
      <div class="chat-hist-search-wrap">
        <input class="chat-hist-search" placeholder="Search conversations…" value="${_histSearchQ ? escapeAttr(_histSearchQ) : ''}"
               oninput="chatHistSearch(this.value)">
      </div>
      <div class="chat-hist-new" onclick="chatHistNewChat()">+ New Chat</div>
      <div class="chat-hist-list">${listHtml}</div>`;
  }

  function itemHtml(c) {
    const active = c.id === _convId;
    if (_renamingId === c.id) {
      return `<div class="chat-hist-item active">
        <div class="chat-hist-item-main">
          <input class="chat-hist-rename-input" id="chat-hist-rename-${c.id}" value="${escapeAttr(c.title || '')}"
                 onkeydown="chatHistRenameKey(event,'${c.id}')"
                 onblur="chatHistCommitRename('${c.id}', this.value)"
                 onclick="event.stopPropagation()">
        </div>
      </div>`;
    }
    return `<div class="chat-hist-item ${active ? 'active' : ''}" onclick="chatHistOpenConversation('${c.id}')">
      <div class="chat-hist-item-main">
        <div class="chat-hist-item-title">${escapeHtml(c.title || 'Untitled conversation')}</div>
        <div class="chat-hist-item-meta">${timeAgo(c.updated_at || c.created_at)}</div>
      </div>
      <div class="chat-hist-item-actions">
        <button class="chat-hist-item-btn" title="Rename" onclick="chatHistStartRename('${c.id}', event)"><svg class="icn" aria-hidden="true" width="13" height="13"><use href="#ic-edit"></use></svg></button>
        <button class="chat-hist-item-btn" title="Delete" onclick="chatHistDelete('${c.id}', event)"><svg class="icn" aria-hidden="true" width="13" height="13"><use href="#ic-trash"></use></svg></button>
      </div>
    </div>`;
  }

  function escapeHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString();
  }

  /* ─────────────────────────────────────────────
     Init: pre-warm the conversation list quietly
     ───────────────────────────────────────────── */
  if (typeof chatInit === 'function') {
    const _orig = chatInit;
    window.chatInit = function () {
      _orig();
      loadList(false);
    };
  }
})();
