// ══ NxTGen Journal — admin.js ══
// Dedicated "Admin" section for full signal management: see every signal
// regardless of visibility, change status/visibility/archive state inline,
// bulk-publish/unpublish/archive/delete, and jump into the full edit modal.
//
// This page is gated client-side via _sigIsAdmin() (exposed by signals.js)
// purely for UX — hiding the nav entry and refusing to render for anyone
// who isn't the admin. The actual security boundary is the Postgres RLS
// policy from supabase/signals_admin_lockdown.sql (is_signal_admin(),
// backed by the journal_signal_admins table), which rejects every write
// below at the database level for non-admins even if this file is bypassed
// entirely.

(function () {

  let _admAll = [];
  let _admSelected = new Set();
  let _admSearch = '';
  let _admStatusFilter = 'all';
  let _admVisFilter = 'all';
  let _admInitDone = false;

  function icn(id, cls) {
    return `<svg class="icn ${cls || ''}" aria-hidden="true"><use href="#${id}"></use></svg>`;
  }
  function _cap(s) {
    return (s === undefined || s === null || s === '') ? '—'
      : String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function _admTimeAgo(ts) {
    if (!ts) return '—';
    const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return new Date(ms).toLocaleDateString();
  }
  function _admIsAdmin() {
    return typeof window._sigIsAdmin === 'function' && window._sigIsAdmin();
  }

  // Called once auth state is known (see core-modals-userbar.js hook) to
  // show/hide every nav entry marked with the .js-admin-nav class.
  window._admRevealNav = function () {
    const show = _admIsAdmin();
    document.querySelectorAll('.js-admin-nav').forEach(el => {
      el.style.display = show ? '' : 'none';
    });
  };

  // ══════════════════════════════════════════════════════════════
  // DATA
  // ══════════════════════════════════════════════════════════════
  async function _admFetchAll() {
    if (typeof sb === 'undefined' || !sb) {
      showToast('Connect Supabase to manage signals here', 'error');
      return [];
    }
    const { data, error } = await sb.from('journal_signals')
      .select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) {
      console.error('admin fetch error:', error.message);
      showToast('Failed to load signals: ' + error.message, 'error');
      return [];
    }
    return data || [];
  }

  // ══════════════════════════════════════════════════════════════
  // ENTRY POINT — called by nav() when navigating to the Admin page
  // ══════════════════════════════════════════════════════════════
  window.buildAdmin = async function buildAdmin() {
    const page = document.getElementById('page-admin');
    if (!page) return;

    // Defense in depth: even though the nav entry is hidden for non-admins,
    // refuse to render anything here if someone lands on /admin directly.
    // Real writes are still blocked server-side regardless of this check.
    if (!_admIsAdmin()) {
      page.innerHTML = `
        <div class="adm-denied">
          ${icn('ic-lock')}
          <h2>Admins only</h2>
          <p>You don't have access to this section.</p>
        </div>`;
      return;
    }

    if (!_admInitDone) {
      _admInitDone = true;
      page.innerHTML = _admShell();
    }
    _admAll = await _admFetchAll();
    _admSelected.clear();
    _admRender();
  };

  // ══════════════════════════════════════════════════════════════
  // PAGE SHELL
  // ══════════════════════════════════════════════════════════════
  function _admShell() {
    return `
    <div class="adm-header">
      <div>
        <div class="adm-title">${icn('ic-shield')} Signals Admin</div>
        <div class="adm-sub">Every signal in the system, regardless of visibility. Only admins can see or change any of this.</div>
      </div>
      <button class="btn btn-primary btn-ripple" onclick="_admGoCreateSignal()">${icn('ic-plus')} New Signal</button>
    </div>

    <div class="adm-stats" id="adm-stats"></div>

    <div class="adm-toolbar">
      <div class="adm-search-wrap">
        ${icn('ic-search')}
        <input type="text" id="adm-search" placeholder="Search pair, market, notes…" oninput="_admOnSearch(this.value)">
      </div>
      <select id="adm-status-filter" class="adm-select" onchange="_admSetStatusFilter(this.value)">
        <option value="all">All statuses</option>
        <option value="draft">Draft</option>
        <option value="scheduled">Scheduled</option>
        <option value="waiting">Waiting</option>
        <option value="active">Active</option>
        <option value="partial">Partial</option>
        <option value="breakeven">Breakeven</option>
        <option value="tp1_hit">TP1 Hit</option>
        <option value="tp2_hit">TP2 Hit</option>
        <option value="tp3_hit">TP3 Hit</option>
        <option value="stopped_out">Stopped Out</option>
        <option value="cancelled">Cancelled</option>
        <option value="expired">Expired</option>
      </select>
      <select id="adm-vis-filter" class="adm-select" onchange="_admSetVisFilter(this.value)">
        <option value="all">All visibility</option>
        <option value="public">Public</option>
        <option value="premium">Premium</option>
        <option value="private">Private</option>
      </select>
      <button class="btn" onclick="_admRefresh()">${icn('ic-refresh')} Refresh</button>
    </div>

    <div id="adm-bulk-bar" class="adm-bulk-bar" style="display:none">
      <span id="adm-bulk-count">0 selected</span>
      <button class="btn" onclick="_admBulkVisibility('public')">${icn('ic-eye')} Publish (Public)</button>
      <button class="btn" onclick="_admBulkVisibility('private')">${icn('ic-eye-off')} Unpublish (Private)</button>
      <button class="btn" onclick="_admBulkArchive(true)">${icn('ic-archive')} Archive</button>
      <button class="btn" onclick="_admBulkArchive(false)">${icn('ic-folder-open')} Unarchive</button>
      <button class="btn glass-btn-danger" onclick="_admBulkDelete()">${icn('ic-trash')} Delete</button>
      <button class="btn" onclick="_admClearSelection()">Clear</button>
    </div>

    <div id="adm-table-root"></div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // FILTER + RENDER
  // ══════════════════════════════════════════════════════════════
  function _admFilteredRows() {
    let rows = _admAll;
    if (_admStatusFilter !== 'all') rows = rows.filter(s => s.status === _admStatusFilter);
    if (_admVisFilter !== 'all') rows = rows.filter(s => s.visibility === _admVisFilter);
    if (_admSearch) {
      const q = _admSearch;
      rows = rows.filter(s =>
        (s.pair || '').toLowerCase().includes(q) ||
        (s.market || '').toLowerCase().includes(q) ||
        (s.notes || '').toLowerCase().includes(q) ||
        (s.trade_idea || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }

  function _admRenderStats() {
    const el = document.getElementById('adm-stats');
    if (!el) return;
    const total = _admAll.length;
    const published = _admAll.filter(s => s.visibility === 'public').length;
    const drafts = _admAll.filter(s => s.is_draft).length;
    const archived = _admAll.filter(s => s.archived).length;
    el.innerHTML = `
      <div class="adm-stat-card"><div class="adm-stat-num">${total}</div><div class="adm-stat-lbl">Total signals</div></div>
      <div class="adm-stat-card"><div class="adm-stat-num">${published}</div><div class="adm-stat-lbl">Public</div></div>
      <div class="adm-stat-card"><div class="adm-stat-num">${drafts}</div><div class="adm-stat-lbl">Drafts</div></div>
      <div class="adm-stat-card"><div class="adm-stat-num">${archived}</div><div class="adm-stat-lbl">Archived</div></div>
    `;
  }

  function _admRender() {
    _admRenderStats();
    const root = document.getElementById('adm-table-root');
    if (!root) return;
    const rows = _admFilteredRows();

    if (!rows.length) {
      root.innerHTML = `<div class="sig-table-card"><div class="sig-table-empty">${icn('ic-search')}<div style="margin-top:8px">No signals match these filters.</div></div></div>`;
      _admUpdateBulkBar();
      return;
    }

    const body = rows.map(s => {
      const checked = _admSelected.has(s.id) ? 'checked' : '';
      return `
      <tr class="${_admSelected.has(s.id) ? 'bulk-selected' : ''}">
        <td onclick="event.stopPropagation()"><input type="checkbox" class="bulk-chk" data-id="${s.id}" ${checked} onchange="_admToggleRow('${s.id}', this.checked)"></td>
        <td><div class="sig-pair-cell">${s.pair || '—'}</div></td>
        <td>${_cap(s.market)}</td>
        <td>${s.direction ? `<span class="sig-dir-badge ${s.direction}">${s.direction === 'buy' ? '🟢 BUY' : '🔴 SELL'}</span>` : '—'}</td>
        <td><span class="sig-badge sig-badge-${s.status}"><span class="dot"></span>${_cap(s.status)}</span></td>
        <td onclick="event.stopPropagation()">
          <select class="adm-select adm-inline-select" onchange="_admChangeVisibility('${s.id}', this.value)">
            <option value="public" ${s.visibility === 'public' ? 'selected' : ''}>Public</option>
            <option value="premium" ${s.visibility === 'premium' ? 'selected' : ''}>Premium</option>
            <option value="private" ${s.visibility === 'private' ? 'selected' : ''}>Private</option>
          </select>
        </td>
        <td>${s.archived ? `<span class="sig-badge sig-badge-archived"><span class="dot"></span>Archived</span>` : '—'}</td>
        <td>${_admTimeAgo(s.created_at)}</td>
        <td class="adm-row-actions" onclick="event.stopPropagation()">
          <button title="Edit" onclick="_admEdit('${s.id}')">${icn('ic-edit')}</button>
          <button title="Delete" onclick="_admDeleteOne('${s.id}')">${icn('ic-trash')}</button>
        </td>
      </tr>`;
    }).join('');

    root.innerHTML = `
    <div class="sig-table-card">
      <div class="sig-table-scroll">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="adm-select-all" onchange="_admSelectAll(this.checked)"></th>
            <th>Pair</th><th>Market</th><th>Direction</th><th>Status</th><th>Visibility</th><th>Archived</th><th>Created</th><th>Actions</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="adm-count-footer">Showing ${rows.length} of ${_admAll.length} signals</div>
    </div>`;
    _admUpdateBulkBar();
  }

  function _admUpdateBulkBar() {
    const bar = document.getElementById('adm-bulk-bar');
    if (!bar) return;
    const n = _admSelected.size;
    bar.style.display = n ? 'flex' : 'none';
    const c = document.getElementById('adm-bulk-count');
    if (c) c.textContent = `${n} selected`;
    const selectAll = document.getElementById('adm-select-all');
    if (selectAll) {
      const rows = _admFilteredRows();
      selectAll.checked = rows.length > 0 && rows.every(s => _admSelected.has(s.id));
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FILTER / SEARCH HANDLERS
  // ══════════════════════════════════════════════════════════════
  window._admOnSearch = function (v) { _admSearch = v.trim().toLowerCase(); _admRender(); };
  window._admSetStatusFilter = function (v) { _admStatusFilter = v; _admRender(); };
  window._admSetVisFilter = function (v) { _admVisFilter = v; _admRender(); };
  window._admRefresh = async function () {
    _admAll = await _admFetchAll();
    _admSelected.clear();
    _admRender();
    showToast('Refreshed', 'success');
  };

  // ══════════════════════════════════════════════════════════════
  // SELECTION
  // ══════════════════════════════════════════════════════════════
  window._admToggleRow = function (id, checked) {
    if (checked) _admSelected.add(id); else _admSelected.delete(id);
    _admUpdateBulkBar();
  };
  window._admSelectAll = function (checked) {
    const rows = _admFilteredRows();
    if (checked) rows.forEach(s => _admSelected.add(s.id));
    else rows.forEach(s => _admSelected.delete(s.id));
    _admRender();
  };
  window._admClearSelection = function () { _admSelected.clear(); _admRender(); };

  // ══════════════════════════════════════════════════════════════
  // WRITES — every call below hits Supabase directly and is subject to the
  // journal_signals RLS policy (admin-only insert/update/delete). If the
  // migration in supabase/signals_admin_lockdown.sql hasn't been run yet,
  // or the account isn't actually in journal_signal_admins, these will
  // simply fail server-side with an RLS error surfaced via the toast below.
  // ══════════════════════════════════════════════════════════════
  async function _admReloadEverywhere() {
    _admAll = await _admFetchAll();
    _admRender();
    // Keep the regular Signals page's in-memory list in sync too, if it's
    // already been loaded this session, so switching tabs doesn't show
    // stale data.
    const sigPage = document.getElementById('page-signals');
    if (sigPage && sigPage.innerHTML && typeof window.buildSignals === 'function') {
      try { await window.buildSignals(); } catch (e) { /* non-fatal */ }
    }
  }

  window._admChangeVisibility = async function (id, visibility) {
    if (typeof sb === 'undefined' || !sb) return;
    const { error } = await sb.from('journal_signals').update({ visibility }).eq('id', id);
    if (error) { showToast('Update failed: ' + error.message, 'error'); return; }
    showToast('Visibility updated', 'success');
    await _admReloadEverywhere();
  };

  window._admBulkVisibility = async function (visibility) {
    if (!_admSelected.size || typeof sb === 'undefined' || !sb) return;
    const ids = [..._admSelected];
    const { error } = await sb.from('journal_signals').update({ visibility }).in('id', ids);
    if (error) { showToast('Bulk update failed: ' + error.message, 'error'); return; }
    showToast(`${ids.length} signal(s) set to ${visibility}`, 'success');
    _admSelected.clear();
    await _admReloadEverywhere();
  };

  window._admBulkArchive = async function (archived) {
    if (!_admSelected.size || typeof sb === 'undefined' || !sb) return;
    const ids = [..._admSelected];
    const { error } = await sb.from('journal_signals').update({ archived }).in('id', ids);
    if (error) { showToast('Bulk update failed: ' + error.message, 'error'); return; }
    showToast(`${ids.length} signal(s) ${archived ? 'archived' : 'unarchived'}`, 'success');
    _admSelected.clear();
    await _admReloadEverywhere();
  };

  window._admBulkDelete = async function () {
    if (!_admSelected.size) return;
    const n = _admSelected.size;
    if (!confirm(`Delete ${n} signal(s)? This cannot be undone.`)) return;
    if (typeof sb === 'undefined' || !sb) return;
    const ids = [..._admSelected];
    const { error } = await sb.from('journal_signals').delete().in('id', ids);
    if (error) { showToast('Bulk delete failed: ' + error.message, 'error'); return; }
    showToast(`${n} signal(s) deleted`, 'success');
    _admSelected.clear();
    await _admReloadEverywhere();
  };

  window._admDeleteOne = async function (id) {
    if (!confirm('Delete this signal? This cannot be undone.')) return;
    if (typeof sb === 'undefined' || !sb) return;
    const { error } = await sb.from('journal_signals').delete().eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    showToast('Signal deleted', 'success');
    await _admReloadEverywhere();
  };

  // Reuse the existing Signals edit modal rather than building a second one.
  window._admEdit = async function (id) {
    if (typeof window.buildSignals === 'function') { await window.buildSignals(); }
    if (typeof window._sigOpenModal === 'function') { window._sigOpenModal('edit', id); }
  };

  // "New Signal" from the Admin page reuses the Signals page's own modal —
  // simplest to jump to that page and open it there, so autosave/drafts
  // behave exactly as they already do everywhere else in the app.
  window._admGoCreateSignal = function () {
    const sbEl = document.querySelector(`.sb-item[onclick*="nav('signals'"]`);
    if (typeof nav === 'function') nav('signals', sbEl, 'Signals');
    setTimeout(() => { if (typeof window._sigOpenModal === 'function') window._sigOpenModal(); }, 60);
  };

})();
