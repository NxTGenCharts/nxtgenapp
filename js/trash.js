// ══ NxTGen Journal — trash.js (original app.js lines 15793-16056) ══

// ── TRASH SYSTEM ──────────────────────────────────────
let trashSettings = { autoDays: 30 };
let _trashFilter = 'all';

function saveTrashSettings() {
  const input = document.getElementById('trash-days');
  const d = parseInt(input ? input.value : 30) || 30;
  trashSettings.autoDays = Math.max(1, d);
  try { localStorage.setItem('nxtgen_trash_cfg', JSON.stringify(trashSettings)); } catch(e) {}
  runAutoCleanup();
  renderTrash();
  showToast('Trash settings saved — ' + trashSettings.autoDays + ' day retention', 'restore');
}

function loadTrashSettings() {
  try {
    const s = localStorage.getItem('nxtgen_trash_cfg');
    if (s) trashSettings = JSON.parse(s);
  } catch(e) {}
}

function daysUntilExpiry(deletedAt) {
  if (!deletedAt) return trashSettings.autoDays;
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(trashSettings.autoDays - elapsed));
}

async function runAutoCleanup() {
  if (!deletedTrades.length) return;
  const cutoff = Date.now() - (trashSettings.autoDays * 24 * 60 * 60 * 1000);
  const toExpire = deletedTrades.filter(t => t.deletedAt && new Date(t.deletedAt).getTime() < cutoff);
  for (const t of toExpire) {
    await _cloudPermDelete(t.id);
  }
  deletedTrades = deletedTrades.filter(t => !t.deletedAt || new Date(t.deletedAt).getTime() >= cutoff);
}

function setTrashFilter(f) {
  _trashFilter = f;
  ['all', 'today', 'week', 'month'].forEach(id => { const el = document.getElementById('tf-' + id); if (el) el.classList.toggle('active', id === f); });
  renderTrash();
}
function getFilteredTrash() {
  const now = new Date();
  return deletedTrades.filter(t => {
    if (_trashFilter === 'all') return true;
    if (!t.deletedAt) return _trashFilter === 'all';
    const d = new Date(t.deletedAt);
    if (_trashFilter === 'today') return d.toDateString() === now.toDateString();
    if (_trashFilter === 'week') return (now - d) < 7 * 864e5;
    if (_trashFilter === 'month') return (now - d) < 30 * 864e5;
    return true;
  });
}

function updateTrashBadge() {
  const badge = document.getElementById('trash-sb-badge');
  if (badge) { if (deletedTrades.length) { badge.textContent = deletedTrades.length; badge.style.display = ''; } else badge.style.display = 'none'; }
  // Mobile badges
  ['mob-nav-trash-badge','mob-more-trash-badge'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    if (deletedTrades.length) { b.textContent = deletedTrades.length; b.style.display = ''; }
    else b.style.display = 'none';
  });
}

function renderTrash() {
  runAutoCleanup();
  updateTrashBadge();
  const list = document.getElementById('trash-list');
  const countEl = document.getElementById('trash-count');
  const emptyBtn = document.getElementById('empty-trash-btn');
  if (!list) return;
  const filtered = getFilteredTrash();
  if (!deletedTrades.length) {
    list.innerHTML = `<div class="trash-empty-state"><div style="font-size:56px;margin-bottom:14px"><svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg></div><div style="font-size:16px;font-weight:600;margin-bottom:6px;color:var(--text)">Trash is empty</div><div style="font-size:13px;color:var(--text3);max-width:320px;margin:0 auto;line-height:1.6">Deleted trades appear here for ${trashSettings.autoDays} days. You can restore them anytime.</div></div>`;
    if (countEl) countEl.textContent = '';
    if (emptyBtn) emptyBtn.style.display = 'none';
    return;
  }
  if (countEl) countEl.textContent = (filtered.length !== deletedTrades.length ? filtered.length + ' of ' : '') + deletedTrades.length + ' deleted trade' + (deletedTrades.length !== 1 ? 's' : '');
  if (emptyBtn) emptyBtn.style.display = '';
  if (!filtered.length) { list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">No deleted trades match this filter.</div>`; return; }
  const today = new Date().toDateString();
  const todayGroup = filtered.filter(t => t.deletedAt && new Date(t.deletedAt).toDateString() === today);
  const earlierGroup = filtered.filter(t => !t.deletedAt || new Date(t.deletedAt).toDateString() !== today);
  function trashCardHTML(t) {
    const pnlC = t.pnl > 0 ? 'outcome-win' : t.pnl < 0 ? 'outcome-loss' : 'outcome-be';
    const outIcon = t.outcome === 'Win' ? '<svg class="icn icn-green" aria-hidden="true"><use href="#ic-check-c"></use></svg>' : t.outcome === 'Loss' ? '<svg class="icn icn-red" aria-hidden="true"><use href="#ic-close-c"></use></svg>' : '<svg class="icn" aria-hidden="true"><use href="#ic-minus"></use></svg>';
    const delDate = t.deletedAt ? new Date(t.deletedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
    const expDays = daysUntilExpiry(t.deletedAt);
    const expClass = expDays <= 3 ? 'urgent' : expDays <= 7 ? 'warning' : 'ok';
    const expLabel = expDays === 0 ? 'Expires today' : expDays === 1 ? '1 day left' : expDays + ' days left';
    const origId = t.originalId || t.id;
    return `<div class="trash-card" id="tc-${origId}">
      <div style="flex-shrink:0;width:38px;height:38px;border-radius:8px;background:rgba(230,57,70,.1);border:1px solid rgba(230,57,70,.2);display:flex;align-items:center;justify-content:center;font-size:18px">${outIcon}</div>
      <div class="trash-card-info">
        <div class="trash-card-pair">${t.pair} <span class="pill ${t.pos === 'Buy' ? 'pill-green' : 'pill-red'}" style="font-size:10px">${t.pos}</span> <span class="trash-expiry ${expClass}">${expLabel}</span></div>
        <div class="trash-card-meta">${t.date} · ${t.kz || '—'} · ${t.strategy || 'No strategy'} · ${t.account}</div>
        <div class="trash-card-meta" style="color:var(--text3)">Deleted: ${delDate}</div>
      </div>
      <div class="trash-card-pnl ${pnlC}" style="min-width:52px;text-align:right">${_pnlLabel(t)}</div>
      <div class="trash-card-actions">
        <button class="glass-btn glass-btn-restore" style="font-size:11px;padding:5px 12px" onclick="event.stopPropagation();restoreTrade('${origId}')"><svg class="icn" aria-hidden="true"><use href="#ic-restore"></use></svg> Restore</button>
        <button class="glass-btn glass-btn-danger" style="font-size:11px;padding:5px 10px" onclick="event.stopPropagation();permanentDelete('${origId}')"><svg class="icn" aria-hidden="true"><use href="#ic-close"></use></svg></button>
      </div>
    </div>`;
  }
  let html2 = '';
  if (todayGroup.length) { html2 += `<div class="trash-section-label">Today</div>`; html2 += todayGroup.map(t => trashCardHTML(t)).join(''); }
  if (earlierGroup.length) { if (todayGroup.length) html2 += `<div class="trash-section-label" style="margin-top:10px">Earlier</div>`; html2 += earlierGroup.map(t => trashCardHTML(t)).join(''); }
  list.innerHTML = html2;
}

async function quickDelete(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>', title: 'Move to Trash?',
    body: `<div class="glass-modal-trade-pill"><span class="${t.pos === 'Buy' ? 'pos-buy' : 'pos-sell'}">${t.pos}</span><strong>${t.pair}</strong><span style="color:var(--text3)">${t.date}</span><span class="${t.pnl >= 0 ? 'outcome-win' : 'outcome-loss'}">${_pnlLabel(t)}</span></div><div style="font-size:12px;color:var(--text3);margin-top:6px">Trade will be kept in Trash for ${trashSettings.autoDays} days. Restore anytime.</div>`,
    confirmLabel: 'Move to Trash', confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      const ok = await _cloudSoftDelete(t);
      if (!ok) { showToast('Delete failed', 'danger'); return; }
      deletedTrades.unshift({ ...t, deletedAt: new Date().toISOString(), originalId: t.id });
      trades = trades.filter(x => x.id !== id);
      delete tradeState[id];
      // Immediately remove the row from the DOM so it vanishes without waiting for _refreshAll
      const row = document.querySelector(`#trade-table-body tr[onclick*="openDetail(${id})"]`);
      if (row) { row.style.transition = 'opacity 0.15s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 150); }
      _refreshAll();
      renderTradeTable(trades);
      showToast(t.pair + ' moved to Trash', 'danger', { label: 'View Trash', fn: "nav('trash',null,'Trash')" });
    }
  });
}

async function restoreTrade(originalId) {
  if (originalId === undefined || originalId === null || originalId === '') return;
  const t = deletedTrades.find(x => (x.originalId || x.id) == originalId);
  if (!t) { showToast('Trade not found in trash', 'danger'); return; }

  // charts weren't part of the bulk trash load — fetch them now so restoring
  // doesn't wipe out the trade's images.
  const { data: chartData } = await sb
    .from('journal_deleted_trades')
    .select('charts')
    .eq('user_id', _currentUser.id)
    .eq('original_id', t.originalId || t.id)
    .order('deleted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  t.charts = chartData?.charts || [];

  const restored = await _cloudRestoreTrade(t);
  if (!restored) { showToast('Restore failed', 'danger'); return; }
  deletedTrades = deletedTrades.filter(x => (x.originalId || x.id) != originalId);
  trades.push(restored);
  trades.sort((a, b) => b.date.localeCompare(a.date) || (b.id - a.id));
  tradeState[restored.id] = { notes: restored.notes || '', pretrade: restored.pretrade || '', emotion: restored.emotion || 'Calm', checklist: restored.checklist || [], charts: restored.charts || [], chartLabels: restored.chartLabels || [...CHART_LABELS], mistakes: restored.mistakes || '' };

  // If this was an MT5 trade, add the ticket back to importedTickets
  // (trade is live in the journal again — prevent re-import)
  if ((t.mt5Ticket || t.source === 'mt5') && (t.mt5Ticket || restored.mt5Ticket)) {
    const ticket = String(t.mt5Ticket || restored.mt5Ticket || '');
    const list = _getCustomAccounts();
    const accName = t.account || restored.account;
    const idx = list.findIndex(a => a.name === accName);
    if (idx >= 0 && list[idx].mt5 && ticket) {
      const already = (list[idx].mt5.importedTickets || []).map(String);
      if (!already.includes(ticket)) {
        list[idx].mt5.importedTickets = [...already, ticket];
        _saveCustomAccounts(list).then(() => {
          if (_mt5ModalState.accountName === accName) {
            _mt5ModalState.acc = list[idx];
            _mt5RenderStep(3);
          }
        });
      }
    }
  }
  _refreshAll();
  renderTrash();
  showToast(t.pair + ' restored to Trade Log', 'restore');
}

function permanentDelete(originalId) {
  if (originalId === undefined || originalId === null || originalId === '') return;
  const t = deletedTrades.find(x => (x.originalId || x.id) == originalId);
  if (!t) { showToast('Trade not found', 'danger'); return; }
  openGlassModal({
    icon: '<svg class="icn icn-gold" aria-hidden="true"><use href="#ic-warning"></use></svg>', title: 'Permanently Delete?',
    body: `<div class="glass-modal-trade-pill"><strong>${t.pair}</strong><span style="color:var(--text3)">${t.date}</span><span class="${t.pnl >= 0 ? 'outcome-win' : 'outcome-loss'}">${_pnlLabel(t)}</span></div><div style="font-size:12px;color:var(--red);margin-top:8px;font-weight:500">This cannot be undone.</div>`,
    confirmLabel: 'Delete Forever', confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      await _cloudPermDelete(t.originalId || t.id);
      deletedTrades = deletedTrades.filter(x => (x.originalId || x.id) != originalId);
      delete tradeState[t.id];

      // Remove the ticket from importedTickets so it can be re-imported from MT5
      if (t.mt5Ticket || t.source === 'mt5') {
        const ticket = String(t.mt5Ticket || '');
        const list = _getCustomAccounts();
        const idx = list.findIndex(a => a.name === t.account);
        if (idx >= 0 && list[idx].mt5?.importedTickets && ticket) {
          list[idx].mt5.importedTickets = list[idx].mt5.importedTickets.filter(tk => String(tk) !== ticket);
          await _saveCustomAccounts(list);
          if (_mt5ModalState.accountName === t.account) {
            _mt5ModalState.acc = list[idx];
            _mt5RenderStep(3);
          }
        }
      }

      renderTrash();
      showToast(t.pair + ' permanently deleted', 'danger');
    }
  });
}

function openEmptyTrashModal() {
  if (!deletedTrades.length) return;
  openGlassModal({
    icon: '<svg class="icn" aria-hidden="true"><use href="#ic-trash"></use></svg>', title: 'Empty Entire Trash?',
    body: `<strong>${deletedTrades.length} trade${deletedTrades.length !== 1 ? 's' : ''}</strong> will be permanently deleted.<br><br><div style="font-size:12px;color:var(--red);font-weight:500">All data will be lost forever. This cannot be undone.</div>`,
    confirmLabel: 'Empty Trash', confirmClass: 'glass-btn-danger',
    onConfirm: async () => {
      const count = deletedTrades.length;

      // Strip any MT5 tickets from importedTickets before wiping the trash
      const mt5Deleted = deletedTrades.filter(t => t.mt5Ticket || t.source === 'mt5');
      if (mt5Deleted.length > 0) {
        const list = _getCustomAccounts();
        let changed = false;
        mt5Deleted.forEach(t => {
          const ticket = String(t.mt5Ticket || '');
          if (!ticket) return;
          const idx = list.findIndex(a => a.name === t.account);
          if (idx >= 0 && list[idx].mt5?.importedTickets) {
            list[idx].mt5.importedTickets = list[idx].mt5.importedTickets.filter(tk => String(tk) !== ticket);
            changed = true;
          }
        });
        if (changed) {
          await _saveCustomAccounts(list);
          // Refresh MT5 modal if open
          const openAcc = _mt5ModalState.accountName;
          if (openAcc) {
            const updated = list.find(a => a.name === openAcc);
            if (updated) { _mt5ModalState.acc = updated; _mt5RenderStep(3); }
          }
        }
      }

      await _cloudEmptyTrash();
      deletedTrades.forEach(t => delete tradeState[t.id]);
      deletedTrades = [];
      renderTrash();
      showToast(count + ' trades permanently deleted', 'danger');
    }
  });
}

