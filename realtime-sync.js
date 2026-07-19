/* ════════════════════════════════════════════════════════════════════════════
   NxTGen Trading Journal — realtime-sync.js  (v2 — fixed column mapping)
   Supabase Realtime subscriptions for instant cross-device sync.

   SETUP (one-time):
   1. Supabase Dashboard → each table below → enable Realtime toggle:
        journal_trades, journal_deleted_trades, journal_watchlist,
        journal_account_data, journal_playbook, journal_goals,
        journal_monthly, journal_profiles
   2. In index.html, BEFORE <script src="app.js">:
        <script src="realtime-sync.js"></script>
   ════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let _realtimeChannel = null;
  let _toastTimer      = null;
  let _pendingRender   = {};

  // ─── Toast ────────────────────────────────────────────────────────────────
  function _showSyncToast(msg) {
    // Don't toast while the tab is backgrounded/hidden — sync still happens,
    // it just shouldn't interrupt with a visible notification.
    if (document.visibilityState !== 'visible') return;

    let toast = document.getElementById('rt-sync-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rt-sync-toast';
      toast.style.cssText = [
        'position:fixed','bottom:24px','right:24px','z-index:99999',
        'background:rgba(30,40,55,.93)','color:#e2e8f0',
        'border:1px solid rgba(58,134,255,.4)',
        'border-radius:10px','padding:9px 18px',
        'font-size:12.5px','font-family:inherit',
        'box-shadow:0 4px 24px rgba(0,0,0,.35)',
        'opacity:0','transform:translateY(12px)',
        'transition:opacity .25s,transform .25s',
        'pointer-events:none','white-space:nowrap',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = msg || '⚡ Synced';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
    }, 2400);
  }

  // ─── Debounced render scheduler ───────────────────────────────────────────
  function _scheduleRender(key, fn, delay) {
    if (_pendingRender[key]) return;
    _pendingRender[key] = setTimeout(function () {
      delete _pendingRender[key];
      try { fn(); } catch (e) { console.warn('[RT] render error:', e); }
    }, delay || 120);
  }

  // ─── Row mappers — must exactly mirror app.js _rowToTrade / _rowToDeleted ─
  // app.js uses: row.trade_date (NOT row.date), plus chartLabels, mistakes, etc.
  function _mapRow(row) {
    const LABELS = (typeof CHART_LABELS !== 'undefined')
      ? CHART_LABELS
      : ['Daily HTF','4h Structure','1h Confirm','30m Trigger','3m/5m Entry','Result'];
    return {
      id:          row.id,
      date:        row.trade_date,          // ← critical: column is trade_date
      pair:        row.pair,
      pos:         row.pos,
      rr:          row.rr,
      pnl:         parseFloat(row.pnl) || 0,
      pnlUnit:     row.pnl_unit && row.pnl_unit !== '%'
                     ? row.pnl_unit
                     : (row.source === 'mt5' || (row.notes && row.notes.includes('MT5 Import')) ? '$' : '%'),
      outcome:     row.outcome,
      kz:          row.kz,
      strategy:    row.strategy   || '',
      tf:          row.tf         || '',
      account:     row.account,
      rating:      row.rating     || 5,
      risk:        row.risk       || '0.5%',
      notes:       row.notes      || '',
      pretrade:    row.pretrade   || '',
      emotion:     row.emotion    || 'Calm',
      checklist:   row.checklist  || [],
      charts:      row.charts     || [],
      chartLabels: row.chart_labels || [...LABELS],
      mistakes:    row.mistakes   || '',
      source:      row.source     || '',
      plannedRr:   row.planned_rr || '',
      wouldRetake: row.would_retake !== undefined ? row.would_retake : null,
    };
  }

  // ─── Is this row's account archived? Archived accounts should sync data
  //     silently (so imports still land) but never surface a toast. ─────────
  function _isArchivedAccount(accountName) {
    if (!accountName) return false;
    if (typeof _getCustomAccounts !== 'function') return false;
    try {
      const acc = _getCustomAccounts().find(function (a) { return a.name === accountName; });
      return !!(acc && acc.status === 'archived');
    } catch (e) {
      return false;
    }
  }

  function _mapDeletedRow(row) {
    return Object.assign(_mapRow(row), {
      deletedAt:  row.deleted_at,
      originalId: row.original_id,
    });
  }

  // ─── Update tradeState to match (notes, charts, checklist live here) ───────
  function _syncTradeState(row) {
    if (typeof tradeState === 'undefined') return;
    const LABELS = (typeof CHART_LABELS !== 'undefined')
      ? CHART_LABELS
      : ['Daily HTF','4h Structure','1h Confirm','30m Trigger','3m/5m Entry','Result'];
    tradeState[row.id] = {
      notes:       row.notes       || '',
      pretrade:    row.pretrade    || '',
      mistakes:    row.mistakes    || '',
      emotion:     row.emotion     || 'Calm',
      checklist:   row.checklist   || [],
      charts:      row.charts      || [],
      chartLabels: row.chart_labels || [...LABELS],
    };
  }

  // ─── Re-render all trade-related panels ──────────────────────────────────
  function _renderTradePanels() {
    if (typeof renderTradeTable   === 'function') renderTradeTable(trades);
    if (typeof updateKPIs         === 'function') updateKPIs();
    if (typeof buildPairTable     === 'function') buildPairTable();
    if (typeof buildKillzoneTable === 'function') buildKillzoneTable();
    if (typeof buildStrategyTable === 'function') buildStrategyTable();
    if (typeof buildMonthlyTable  === 'function') buildMonthlyTable();
    if (typeof buildSidebarYears  === 'function') buildSidebarYears();
    if (typeof renderCalendar     === 'function') renderCalendar();
    if (typeof updateTrashBadge   === 'function') updateTrashBadge();
  }

  // ─── journal_trades ───────────────────────────────────────────────────────
  function _onTradeChange(payload) {
    const uid = window._currentUser && window._currentUser.id;

    if (payload.eventType === 'INSERT') {
      const row = payload.new;
      if (uid && row.user_id !== uid) return;
      if (trades.find(function (t) { return t.id === row.id; })) return;
      trades.push(_mapRow(row));
      _syncTradeState(row);
      _scheduleRender('trades', _renderTradePanels);
      if (!_isArchivedAccount(row.account)) _showSyncToast('⚡ New trade synced');

    } else if (payload.eventType === 'UPDATE') {
      const row = payload.new;
      if (uid && row.user_id !== uid) return;
      const idx = trades.findIndex(function (t) { return t.id === row.id; });
      if (idx !== -1) {
        trades[idx] = _mapRow(row);
      } else {
        trades.push(_mapRow(row));
      }
      _syncTradeState(row);
      _scheduleRender('trades', _renderTradePanels);
      if (!_isArchivedAccount(row.account)) _showSyncToast('⚡ Trade updated');

    } else if (payload.eventType === 'DELETE') {
      const id = payload.old.id;
      const before = trades.length;
      trades = trades.filter(function (t) { return t.id !== id; });
      if (typeof tradeState !== 'undefined') delete tradeState[id];
      if (trades.length !== before) {
        _scheduleRender('trades', _renderTradePanels);
      }
    }
  }

  // ─── journal_deleted_trades ───────────────────────────────────────────────
  function _onDeletedTradeChange(payload) {
    const uid = window._currentUser && window._currentUser.id;

    if (payload.eventType === 'INSERT') {
      const row = payload.new;
      if (uid && row.user_id !== uid) return;
      const mapped = _mapDeletedRow(row);
      const origId = mapped.originalId || mapped.id;
      // Remove from live trades
      trades = trades.filter(function (t) { return t.id !== origId; });
      if (typeof tradeState !== 'undefined') delete tradeState[origId];
      // Add to deletedTrades if not already present
      if (!deletedTrades.find(function (t) { return (t.originalId || t.id) === origId; })) {
        deletedTrades.unshift(mapped);
      }
      _scheduleRender('trash', function () {
        _renderTradePanels();
        if (typeof renderTrash === 'function') renderTrash();
      });
      if (!_isArchivedAccount(row.account)) _showSyncToast('⚡ Trade moved to trash');

    } else if (payload.eventType === 'DELETE') {
      // Permanently deleted or restored — remove from deletedTrades
      const origId = payload.old.original_id || payload.old.id;
      deletedTrades = deletedTrades.filter(function (t) {
        return (t.originalId || t.id) !== origId;
      });
      _scheduleRender('trash', function () {
        if (typeof renderTrash    === 'function') renderTrash();
        if (typeof updateTrashBadge === 'function') updateTrashBadge();
      });
    }
  }

  // ─── journal_watchlist ────────────────────────────────────────────────────
  function _onWatchlistChange() {
    _scheduleRender('watchlist', function () {
      if (typeof _wlLoad === 'function') {
        _wlLoad().then(function () {
          if (typeof buildWatchlist === 'function') buildWatchlist();
        });
      }
    }, 400);
    _showSyncToast('⚡ Watchlist synced');
  }

  // ─── journal_account_data ─────────────────────────────────────────────────
  function _onAccountDataChange() {
    _scheduleRender('accounts', function () {
      if (typeof _accLoad === 'function') {
        _accLoad().then(function () {
          if (typeof buildAccounts  === 'function') buildAccounts();
          if (typeof renderCalendar === 'function') renderCalendar();
        });
      }
    }, 300);
    _showSyncToast('⚡ Accounts synced');
  }

  // ─── journal_playbook ─────────────────────────────────────────────────────
  function _onPlaybookChange() {
    _scheduleRender('playbook', function () {
      if (typeof _pbLoad === 'function') {
        _pbLoad().then(function () {
          if (typeof buildPlaybook === 'function') buildPlaybook();
        });
      }
    }, 300);
  }

  // ─── journal_goals ────────────────────────────────────────────────────────
  function _onGoalsChange() {
    _scheduleRender('goals', function () {
      if (typeof _goalsLoad === 'function') {
        _goalsLoad().then(function () {
          if (typeof buildGoals === 'function') buildGoals();
        });
      }
    }, 300);
    _showSyncToast('⚡ Goals synced');
  }

  // ─── journal_monthly ──────────────────────────────────────────────────────
  function _onMonthlyChange() {
    _scheduleRender('monthly', function () {
      if (typeof buildMonthlyReview === 'function') buildMonthlyReview();
    }, 300);
    _showSyncToast('⚡ Monthly review synced');
  }

  // ─── journal_profiles ─────────────────────────────────────────────────────
  function _onProfileChange() {
    _scheduleRender('profile', function () {
      if (typeof _profileLoad === 'function') {
        _profileLoad().then(function () {
          if (typeof _injectTopbarAvatar === 'function') _injectTopbarAvatar();
        });
      }
    }, 400);
    _showSyncToast('⚡ Profile synced');
  }

  // ─── Subscribe ────────────────────────────────────────────────────────────
  function _subscribe() {
    if (_realtimeChannel) return;
    if (typeof sb === 'undefined') {
      setTimeout(_subscribe, 1000);
      return;
    }

    _realtimeChannel = sb
      .channel('nxtgen-journal-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_trades' },          _onTradeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_deleted_trades' },  _onDeletedTradeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_watchlist' },       _onWatchlistChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_account_data' },    _onAccountDataChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_playbook' },        _onPlaybookChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_goals' },           _onGoalsChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_monthly' },         _onMonthlyChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_profiles' },        _onProfileChange)
      .subscribe(function (status, err) {
        if (status === 'SUBSCRIBED') {
          console.log('[RT] ✅ Realtime sync active.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[RT] Connection error:', err || status, '— retrying in 5s…');
          _realtimeChannel = null;
          setTimeout(_subscribe, 5000);
        } else if (status === 'CLOSED') {
          _realtimeChannel = null;
        }
      });
  }

  // ─── Reconnect when tab becomes visible again (after sleep/background) ────
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !_realtimeChannel) {
      _subscribe();
    }
  });

  // ─── Boot after app.js auth has had time to run ───────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(_subscribe, 1500);
  });

})();
