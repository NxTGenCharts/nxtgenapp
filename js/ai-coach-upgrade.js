/* ══════════════════════════════════════════════════════════════
   AI COACH UPGRADE (Phase 1)
   — CoachHeader, CoachingSnapshot, PsychologyCheckIn-lite (readiness)
   Additive module. Loaded after core-utils-ai.js. Reads the same
   global `trades` array + helper functions the rest of the app
   already uses (_pnlPctValue, localToday, _currentUser, sb, RULES,
   _pbData). Never invents numbers: every metric either has a real
   sample behind it or the card says so explicitly.
   ══════════════════════════════════════════════════════════════ */

(function () {
  const NEG_EMOTIONS = ['Anxious','Fearful','Greedy','Revenge','Impatient','Frustrated','Impulsive','Stressed','Tired','FOMO'];
  const POS_EMOTIONS = ['Calm','Confident','Relaxed','Focused','Disciplined'];
  const MIN_SAMPLE   = 3;   // minimum trades before we'll name a "strength" / "weak area"
  const MIN_TREND    = 6;   // minimum trades before we'll call a trend

  function planMaxTradesPerDay() {
    // Best-effort read from the trader's own rules text; falls back to null
    // (meaning: unknown, don't claim a limit was breached).
    const rules = (typeof _pbData !== 'undefined' && _pbData && _pbData.rules) || (typeof RULES !== 'undefined' ? RULES : []);
    const hit = (rules || []).find(r => /max\s*2\s*trades\/?day|max\s*\d+\s*trades\s*per\s*day/i.test(r));
    if (!hit) return null;
    const m = hit.match(/(\d+)\s*trades/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function safeDisplayName() {
    const p = (typeof _profileData !== 'undefined' && _profileData) || {};
    return p.display_name || p.fname || (typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email ? _currentUser.email.split('@')[0] : 'Trader');
  }

  function greetingWord() {
    const h = new Date().getHours();
    if (h < 5) return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good evening';
  }

  function pct(n) { return isFinite(n) ? n.toFixed(1) : '0.0'; }

  function group(trades, keyFn) {
    const m = {};
    trades.forEach(t => {
      const k = keyFn(t);
      if (!k) return;
      if (!m[k]) m[k] = { n: 0, wins: 0, pnl: 0 };
      m[k].n++;
      if (t.outcome === 'Win') m[k].wins++;
      m[k].pnl += _pnlPctValue(t);
    });
    return m;
  }

  function bestGroup(m, minN) {
    let best = null;
    Object.entries(m).forEach(([k, d]) => {
      if (d.n < minN) return;
      const avg = d.pnl / d.n;
      if (!best || avg > best.avg) best = { key: k, avg, ...d };
    });
    return best;
  }

  function worstGroup(m, minN) {
    let worst = null;
    Object.entries(m).forEach(([k, d]) => {
      if (d.n < minN) return;
      const avg = d.pnl / d.n;
      if (!worst || avg < worst.avg) worst = { key: k, avg, ...d };
    });
    return worst;
  }

  /* ─────────────────────────────────────────────
     METRIC ENGINE — pure functions over `trades`
     ───────────────────────────────────────────── */
  function computeSnapshot() {
    const today = localToday();
    const all = trades.slice().sort((a, b) => a.date.localeCompare(b.date));
    const total = all.length;
    const maxPerDay = planMaxTradesPerDay();

    /* Readiness */
    const todayTrades = all.filter(t => t.date === today);
    const last3 = all.slice(-3);
    const lastEmotion = all.length ? all[all.length - 1].emotion : null;
    const lastTwoLosses = last3.slice(-2).length === 2 && last3.slice(-2).every(t => t.outcome === 'Loss');
    let readiness, readinessBasis;
    if (total === 0) {
      readiness = 'Insufficient Data';
      readinessBasis = 'No trades logged yet — readiness will be based on your actual activity and rules once you start journaling.';
    } else if (maxPerDay && todayTrades.length >= maxPerDay) {
      readiness = 'Stop Trading';
      readinessBasis = `You've logged ${todayTrades.length} trade(s) today, at or above your plan's ${maxPerDay}/day limit.`;
    } else if (lastTwoLosses && lastEmotion && NEG_EMOTIONS.includes(lastEmotion)) {
      readiness = 'Review First';
      readinessBasis = `Your last two logged trades were losses and your most recent emotion tag was "${lastEmotion}".`;
    } else if (lastEmotion && NEG_EMOTIONS.includes(lastEmotion)) {
      readiness = 'Cautious';
      readinessBasis = `Your most recently logged emotion was "${lastEmotion}".`;
    } else {
      readiness = 'Ready';
      readinessBasis = lastEmotion
        ? `No active limit or loss-streak flags; last logged emotion was "${lastEmotion}".`
        : 'No active limit or loss-streak flags found in your recent trades.';
    }

    /* Trend: last N vs previous N average PnL% */
    let trend, trendBasis;
    if (total < MIN_TREND) {
      trend = 'Insufficient Data';
      trendBasis = `Only ${total} trade(s) logged — at least ${MIN_TREND} are needed to gauge a trend reliably.`;
    } else {
      const half = Math.min(10, Math.floor(total / 2));
      const recent = all.slice(-half);
      const prior = all.slice(-half * 2, -half);
      const avgRecent = recent.reduce((a, t) => a + _pnlPctValue(t), 0) / recent.length;
      const avgPrior = prior.length ? prior.reduce((a, t) => a + _pnlPctValue(t), 0) / prior.length : null;
      if (avgPrior === null) {
        trend = 'Insufficient Data';
        trendBasis = `Not enough trade history before your last ${half} trades for a fair comparison yet.`;
      } else {
        const delta = avgRecent - avgPrior;
        if (Math.abs(delta) < 0.15) { trend = 'Stable'; trendBasis = `Avg PnL of your last ${half} trades (${pct(avgRecent)}%) is close to the previous ${prior.length} (${pct(avgPrior)}%).`; }
        else if (delta > 0) { trend = 'Improving'; trendBasis = `Avg PnL rose from ${pct(avgPrior)}% to ${pct(avgRecent)}% over your last ${half} trades.`; }
        else { trend = 'Declining'; trendBasis = `Avg PnL fell from ${pct(avgPrior)}% to ${pct(avgRecent)}% over your last ${half} trades.`; }
      }
    }

    /* Main strength: pair+session combo with best expectancy, min sample */
    const byPairSession = group(all, t => (t.pair && t.kz) ? `${t.pair} · ${t.kz}` : null);
    const strengthGrp = bestGroup(byPairSession, MIN_SAMPLE);
    const strength = strengthGrp
      ? `${strengthGrp.key} has your strongest expectancy: ${pct(strengthGrp.avg)}% avg/trade over ${strengthGrp.n} trades (${((strengthGrp.wins/strengthGrp.n)*100).toFixed(0)}% WR).`
      : null;

    /* Biggest improvement area: overtrading check first, else worst pair+session */
    let improvement = null;
    if (maxPerDay && total >= 6) {
      const byDay = {};
      all.forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
      const overDays = [], normalDays = [];
      Object.values(byDay).forEach(list => (list.length > maxPerDay ? overDays : normalDays).push(...list));
      if (overDays.length >= MIN_SAMPLE && normalDays.length >= MIN_SAMPLE) {
        const avgOver = overDays.reduce((a,t)=>a+_pnlPctValue(t),0) / overDays.length;
        const avgNormal = normalDays.reduce((a,t)=>a+_pnlPctValue(t),0) / normalDays.length;
        if (avgOver < avgNormal) {
          improvement = `On days you exceed your ${maxPerDay}-trade limit, avg PnL drops to ${pct(avgOver)}%/trade vs ${pct(avgNormal)}%/trade within the limit (${overDays.length} vs ${normalDays.length} trades).`;
        }
      }
    }
    if (!improvement) {
      const worstGrp = worstGroup(byPairSession, MIN_SAMPLE);
      if (worstGrp && worstGrp.avg < 0) {
        improvement = `${worstGrp.key} is your weakest tracked combo: ${pct(worstGrp.avg)}% avg/trade over ${worstGrp.n} trades.`;
      }
    }

    /* Risk status — best-effort, transparent about what it can/can't verify */
    const dailyLossRule = ((typeof _pbData !== 'undefined' && _pbData && _pbData.rules) || (typeof RULES !== 'undefined' ? RULES : []))
      .find(r => /max\s*daily\s*loss/i.test(r));
    const todayPnl = todayTrades.reduce((a, t) => a + _pnlPctValue(t), 0);
    const dailyLossPct = dailyLossRule ? (dailyLossRule.match(/-?\s*(\d+(\.\d+)?)\s*%/) || [])[1] : null;
    let riskStatus, riskBasis;
    if (!dailyLossPct) {
      riskStatus = 'Unable to Verify';
      riskBasis = 'No parsable max-daily-loss rule found in your trading plan, so risk status can\'t be checked against it.';
    } else if (todayTrades.length === 0) {
      riskStatus = 'Within Plan';
      riskBasis = 'No trades logged today yet.';
    } else if (todayPnl <= -parseFloat(dailyLossPct)) {
      riskStatus = 'Limit Reached';
      riskBasis = `Today's PnL is ${pct(todayPnl)}%, at/beyond your ${dailyLossPct}% max daily loss rule.`;
    } else if (todayPnl <= -parseFloat(dailyLossPct) * 0.6) {
      riskStatus = 'Elevated';
      riskBasis = `Today's PnL is ${pct(todayPnl)}%, approaching your ${dailyLossPct}% max daily loss rule.`;
    } else {
      riskStatus = 'Within Plan';
      riskBasis = `Today's PnL is ${pct(todayPnl)}%, inside your ${dailyLossPct}% max daily loss rule.`;
    }

    /* Discipline score — % of trades meeting the objective, loggable rule checks we can actually verify */
    let discipline = null, disciplineBasis;
    const ratedTrades = all.filter(t => typeof t.rating === 'number');
    if (ratedTrades.length >= MIN_SAMPLE) {
      const meetingBar = ratedTrades.filter(t => t.rating >= 3).length;
      discipline = Math.round((meetingBar / ratedTrades.length) * 100);
      disciplineBasis = `${meetingBar}/${ratedTrades.length} rated trades were taken at 3★ or higher (your rule: never trade below 3★). This only reflects the rule aspects your journal can measure — not full plan adherence.`;
    } else {
      disciplineBasis = `Fewer than ${MIN_SAMPLE} star-rated trades logged — rate your setups to unlock a discipline score.`;
    }

    return {
      total, today, maxPerDay,
      readiness, readinessBasis,
      trend, trendBasis,
      strength, strengthGrp,
      improvement,
      riskStatus, riskBasis,
      discipline, disciplineBasis,
    };
  }

  const READINESS_BADGE = { 'Ready': 'green', 'Cautious': 'gold', 'Review First': 'red', 'Stop Trading': 'red', 'Insufficient Data': 'grey' };
  const TREND_BADGE     = { 'Improving': 'green', 'Stable': 'blue', 'Declining': 'red', 'Insufficient Data': 'grey' };
  const RISK_BADGE      = { 'Within Plan': 'green', 'Elevated': 'gold', 'At Risk': 'gold', 'Limit Reached': 'red', 'Unable to Verify': 'grey' };

  function badge(cls, label) {
    return `<span class="snap-badge ${cls}"><span class="dot"></span>${label}</span>`;
  }

  function snapCard(id, label, valueHtml, subHtml, basisHtml) {
    return `
    <div class="snap-card" tabindex="0" role="button" aria-expanded="false" onclick="_snapToggle(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_snapToggle(this)}">
      <div class="snap-card-top">
        <span class="snap-card-label">${label}</span>
      </div>
      <div class="snap-card-val">${valueHtml}</div>
      ${subHtml ? `<div class="snap-card-sub">${subHtml}</div>` : ''}
      <div class="snap-card-detail">${basisHtml}</div>
    </div>`;
  }

  window._snapToggle = function (el) {
    const wasOpen = el.classList.contains('expanded');
    document.querySelectorAll('.snap-card.expanded').forEach(c => { if (c !== el) c.classList.remove('expanded'); });
    el.classList.toggle('expanded', !wasOpen);
    el.setAttribute('aria-expanded', String(!wasOpen));
  };

  function renderCoachingSnapshot() {
    const wrap = document.getElementById('ai-coaching-snapshot');
    if (!wrap) return;
    const s = computeSnapshot();

    const readinessCard = snapCard('readiness', 'Trading Readiness',
      badge(READINESS_BADGE[s.readiness], s.readiness), '',
      `<strong>Why:</strong> ${s.readinessBasis}`);

    const trendCard = snapCard('trend', 'Performance Trend',
      badge(TREND_BADGE[s.trend], s.trend), '',
      `<strong>Why:</strong> ${s.trendBasis}`);

    const strengthCard = snapCard('strength', 'Main Strength',
      s.strength ? '✓ Identified' : badge('grey', 'Insufficient Data'),
      s.strength ? s.strength : `Log ${MIN_SAMPLE}+ trades with pair &amp; session filled in to surface a strength.`,
      s.strength ? `Based on ${s.strengthGrp.n} completed trades with pair + session recorded.` : 'No basis yet — needs more tagged trades.');

    const improveCard = snapCard('improve', 'Biggest Improvement Area',
      s.improvement ? '⚠ Identified' : badge('grey', 'Insufficient Data'),
      s.improvement ? s.improvement : `Not enough data yet to isolate a specific weak spot with confidence.`,
      s.improvement ? 'This is a correlation observed in your logged trades, not a guaranteed cause — use it as a prompt to review, not a verdict.' : 'Log more trades (with session, pair, and daily grouping) to unlock this.');

    const riskCard = snapCard('risk', 'Risk Status',
      badge(RISK_BADGE[s.riskStatus] || 'grey', s.riskStatus), '',
      `<strong>Why:</strong> ${s.riskBasis}`);

    const discCard = snapCard('discipline', 'Discipline Score',
      s.discipline !== null ? `${s.discipline}%` : badge('grey', 'Insufficient Data'),
      s.discipline !== null ? 'of rated trades met your min. star-rating rule' : '',
      `<strong>How this is calculated:</strong> ${s.disciplineBasis}`);

    wrap.innerHTML = `<div class="snap-grid">${readinessCard}${trendCard}${strengthCard}${improveCard}${riskCard}${discCard}</div>`;
    return s;
  }

  /* ─────────────────────────────────────────────
     COACH HEADER
     ───────────────────────────────────────────── */
  function renderCoachHeader(snapshot) {
    const hd = document.getElementById('ai-coach-header');
    if (!hd) return;
    const s = snapshot || computeSnapshot();
    const name = safeDisplayName();
    const total = s.total;

    let summary;
    if (total === 0) {
      summary = "You haven't logged any trades yet — once you do, I'll turn them into a real performance summary here instead of a generic message.";
    } else {
      const wr = trades.length ? ((trades.filter(t=>t.outcome==='Win').length / trades.length) * 100).toFixed(0) : 0;
      const netPnl = trades.reduce((a,t)=>a+_pnlPctValue(t),0).toFixed(1);
      summary = `${total} trades logged · ${wr}% all-time win rate · ${netPnl >= 0 ? '+' : ''}${netPnl}% net. ${s.trend !== 'Insufficient Data' ? `Recent trend: ${s.trend.toLowerCase()}.` : ''}`;
    }

    let focus;
    if (s.readiness === 'Stop Trading') focus = "You've hit today's trade limit — step away and review before considering more size or setups.";
    else if (s.readiness === 'Review First') focus = 'Two losses in a row plus a flagged emotional state — review your last trades before entering anything new.';
    else if (s.improvement) focus = s.improvement;
    else if (s.strength) focus = `Prioritize your strongest environment: ${s.strengthGrp.key}.`;
    else focus = 'Keep logging trades with pair, session, and rating filled in — that unlocks sharper daily focus areas here.';

    const confLevel = total >= 15 ? 'high' : total >= 5 ? 'med' : 'low';
    const confLabel = total >= 15 ? 'High data confidence' : total >= 5 ? 'Building data confidence' : 'Low data confidence';

    hd.innerHTML = `
      <div class="coach-hd-top">
        <div>
          <div class="coach-hd-label">NxTGen Intelligence · Powered by Claude</div>
          <div class="coach-hd-greet">${greetingWord()}, ${name}.</div>
          <div class="coach-hd-sum">${summary}</div>
        </div>
        <div class="coach-hd-conf ${confLevel}"><span class="dot"></span>${confLabel} (${total} trade${total===1?'':'s'})</div>
      </div>
      <div class="coach-hd-focus">
        <span class="ico">✦</span>
        <div>
          <div class="coach-hd-focus-label">Focus for Today</div>
          <div class="coach-hd-focus-txt">${focus}</div>
        </div>
      </div>`;
  }

  /* ─────────────────────────────────────────────
     READINESS CHECKLIST (Daily Brief)
     Cloud-synced per user per day, mirrors the graceful
     fallback pattern used by journal_checklist_items.
     Table (create once):
       CREATE TABLE IF NOT EXISTS ai_coach_daily_checks (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
         check_date date NOT NULL,
         checked jsonb DEFAULT '[]'::jsonb,
         updated_at timestamptz DEFAULT now(),
         UNIQUE(user_id, check_date)
       );
       ALTER TABLE ai_coach_daily_checks ENABLE ROW LEVEL SECURITY;
       CREATE POLICY "Users manage own daily checks" ON ai_coach_daily_checks
         FOR ALL USING (auth.uid() = user_id);
     ───────────────────────────────────────────── */
  const READINESS_ITEMS = [
    'Slept / rested adequately',
    'Emotionally calm',
    'Clear market bias set',
    'Key levels marked',
    'Max risk for today known',
    'Stop-trading point defined',
    'Only trading an approved setup',
  ];
  let _readiChecked = [];
  let _readiRowId = null;
  let _readiLoadedFor = null;

  async function readinessLoad(dateKey) {
    _readiChecked = [];
    _readiRowId = null;
    if (typeof _currentUser === 'undefined' || !_currentUser || typeof sb === 'undefined') { _readiLoadedFor = dateKey; return; }
    try {
      const { data, error } = await sb
        .from('ai_coach_daily_checks')
        .select('id, checked')
        .eq('user_id', _currentUser.id)
        .eq('check_date', dateKey)
        .maybeSingle();
      if (error) { console.warn('readinessLoad:', error.message); }
      else if (data) { _readiRowId = data.id; _readiChecked = Array.isArray(data.checked) ? data.checked : []; }
    } catch (err) {
      console.warn('readinessLoad failed (table may not exist yet):', err.message || err);
    }
    _readiLoadedFor = dateKey;
  }

  async function readinessSave(dateKey) {
    if (typeof _currentUser === 'undefined' || !_currentUser || typeof sb === 'undefined') return;
    try {
      const row = { user_id: _currentUser.id, check_date: dateKey, checked: _readiChecked, updated_at: new Date().toISOString() };
      if (_readiRowId) {
        const { error } = await sb.from('ai_coach_daily_checks').update(row).eq('id', _readiRowId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('ai_coach_daily_checks').upsert(row, { onConflict: 'user_id,check_date' }).select('id').single();
        if (error) throw error;
        if (data) _readiRowId = data.id;
      }
    } catch (err) {
      console.warn('readinessSave failed (table may not exist yet — answers still kept for this session):', err.message || err);
    }
  }

  window._readinessToggle = function (idx) {
    const dateKey = localToday();
    const pos = _readiChecked.indexOf(idx);
    if (pos === -1) _readiChecked.push(idx); else _readiChecked.splice(pos, 1);
    renderReadinessChecklist(true);
    readinessSave(dateKey);
  };

  function readinessVerdict(n, total) {
    if (n === total) return 'All checks clear — you\'ve met your own pre-session bar. Trade your plan.';
    if (n >= Math.ceil(total * 0.7)) return `${n}/${total} checked — close, but review what\'s unchecked before sizing up.`;
    if (n >= Math.ceil(total * 0.4)) return `${n}/${total} checked — several gaps. Consider a smaller size or paper-testing until the rest are clear.`;
    return `${n}/${total} checked — this isn\'t a ready state by your own checklist. Address the gaps before entering.`;
  }

  async function renderReadinessChecklist(skipReload) {
    const wrap = document.getElementById('ai-daily-readiness');
    if (!wrap) return;
    const dateKey = localToday();
    if (!skipReload && _readiLoadedFor !== dateKey) await readinessLoad(dateKey);

    const items = READINESS_ITEMS.map((label, i) => {
      const checked = _readiChecked.includes(i);
      return `<div class="readi-item ${checked ? 'checked' : ''}" role="checkbox" aria-checked="${checked}" tabindex="0"
                onclick="_readinessToggle(${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_readinessToggle(${i})}">
                <span class="readi-check">${checked ? '✓' : ''}</span>${label}
              </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="readi-head">
        <span class="readi-title">Pre-Session Readiness Check</span>
        <span class="readi-count">${_readiChecked.length}/${READINESS_ITEMS.length} today</span>
      </div>
      <div class="readi-list">${items}</div>
      <div class="readi-verdict"><strong>Basis:</strong> ${readinessVerdict(_readiChecked.length, READINESS_ITEMS.length)}</div>`;
  }

  /* ─────────────────────────────────────────────
     WIRING — wrap existing entry points, don't replace them
     ───────────────────────────────────────────── */
  function refreshAll() {
    const s = renderCoachingSnapshot();
    renderCoachHeader(s);
  }

  if (typeof buildAI === 'function') {
    const _origBuildAI = buildAI;
    window.buildAI = function () {
      _origBuildAI();
      refreshAll();
      renderReadinessChecklist();
    };
  }

  if (typeof aiSetMode === 'function') {
    const _origAiSetMode = aiSetMode;
    window.aiSetMode = function (mode) {
      _origAiSetMode(mode);
      const wrap = document.getElementById('ai-daily-readiness');
      if (wrap) wrap.style.display = mode === 'daily' ? '' : 'none';
      if (mode === 'daily') renderReadinessChecklist();
    };
  }
})();
