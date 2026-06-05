(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('player-content');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function playerLink(name) {
    if (!name) return '—';
    return '<a href="player.html?name=' + encodeURIComponent(name) + '">' + escapeHtml(name) + '</a>';
  }
  function playerCell(name, team, position) {
    return name ? BB.playerCell(name, team, { linkToPlayer: true, position: position }) : '—';
  }
  function clvClass(clv) {
    if (clv == null) return '';
    if (clv > 0.05) return 'clv-pos';
    if (clv < -0.05) return 'clv-neg';
    return '';
  }
  function clvText(clv) {
    if (clv == null) return '—';
    return (clv > 0 ? '+' : '') + clv.toFixed(1);
  }
  function liftText(lift) {
    if (lift == null || isNaN(lift)) return '—';
    return lift.toFixed(2) + 'x';
  }

  function getPlayerNameFromURL() {
    var qs = new URLSearchParams(location.search);
    var name = qs.get('name');
    if (!name && location.hash.startsWith('#')) {
      try { name = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    }
    return name ? name.trim() : '';
  }

  function renderEmpty(msg, sub) {
    contentEl.innerHTML = '<div class="empty-state"><h2>' + escapeHtml(msg) + '</h2>' +
      (sub ? '<p>' + sub + '</p>' : '') + '</div>';
  }

  function statCard(label, value, sub, cls) {
    return '<div class="card">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value ' + (cls || '') + '">' + value + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function renderHero(report) {
    var pos = report.position || '—';
    var badge = report.position ?
      '<span class="badge pos-' + escapeHtml(pos) + '" style="font-size:13px;padding:4px 10px;">' + escapeHtml(pos) + '</span>' : '';
    var team = report.team ? '<span class="badge" style="font-size:13px;padding:4px 10px;">' + escapeHtml(report.team) + '</span>' : '';
    var byeWeek = null;
    if (report.team && window.BB_DATA && window.BB_DATA.schedule) {
      var sched = window.BB_DATA.schedule[report.team];
      if (sched) {
        for (var i = 0; i < sched.length; i++) {
          if (sched[i] === 'BYE') { byeWeek = i + 1; break; }
        }
      }
    }
    var byeBadge = byeWeek ? '<span class="badge" style="font-size:13px;padding:4px 10px;">Bye W' + byeWeek + '</span>' : '';

    var clv = report.clv;
    var clvCls = clvClass(clv);

    var teamLogo = report.team
      ? BB.teamLogoHTML(report.team, { size: 40, className: 'team-logo-hero' })
      : '';
    var trendsHref = 'trends.html?view=chart&player=' + encodeURIComponent(report.player);
    var trendsBtn = '<a class="adp-trend-btn" href="' + trendsHref + '">' +
      '<span class="adp-trend-icon" aria-hidden="true">📈</span>' +
      '<span>View ADP Trend</span>' +
    '</a>';
    return '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
      teamLogo +
      '<h1 style="margin:0;">' + escapeHtml(report.player) + '</h1>' + badge + team + byeBadge +
      trendsBtn +
      '</div>' +
      '<p class="lede">Drafted across ' + report.exposureCount + ' of your ' + report.totalRosters + ' rosters.</p>' +
      '<div class="cards">' +
        statCard('Drafted', report.exposureCount.toLocaleString(), 'of ' + report.totalRosters + ' rosters') +
        statCard('% Drafted', BB.fmtPct(report.exposurePct)) +
        statCard('Fees', BB.fmtMoney(report.fees), BB.fmtPct(report.feesPct) + ' of total') +
        statCard('My ADP', BB.fmtADP(report.myADP)) +
        statCard('Market ADP', BB.fmtADP(report.marketADP), 'Underdog') +
        statCard('CLV', clvText(clv), 'My ADP − Market ADP', clvCls) +
      '</div>';
  }

  function renderADPRow(report) {
    if (!report.adp) return '';
    var a = report.adp;
    function cell(label, v) {
      return '<div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid var(--border);">' +
        '<span style="color:var(--text-dim);">' + label + '</span>' +
        '<strong>' + BB.fmtADP(v) + '</strong></div>';
    }
    return '<h2>Market ADP across platforms</h2>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">' +
      '<div class="card" style="padding:0;">' + cell('Underdog', a.ud) + cell('DraftKings', a.dk) + cell('Drafters', a.drafters) + cell('BB10', a.bb10) + cell('RTSports', a.rtsports) + '</div>' +
      '<div class="card" style="display:flex;align-items:center;justify-content:center;">' +
        '<a class="button" href="trends.html?player=' + encodeURIComponent(report.player) + '">View ADP trends →</a>' +
      '</div>' +
      '</div>';
  }

  function renderCombos(report) {
    var combos = report.combos.slice(0, 50);
    if (!combos.length) {
      return '<h2>Combo ownership</h2><div class="empty-state"><p>No combo data — player is not on any of your rosters.</p></div>';
    }
    var head = '<thead><tr>' +
      '<th>Teammate</th><th>Pos</th><th>Tm</th>' +
      '<th class="num">Co-Drafted</th><th class="num">Combo %</th>' +
      '<th class="num">Their %</th><th class="num">Lift</th>' +
      '</tr></thead>';
    var body = combos.map(function (c) {
      var liftCls = c.lift == null ? '' : (c.lift >= 1.15 ? 'clv-pos' : (c.lift <= 0.85 ? 'clv-neg' : ''));
      return '<tr>' +
        '<td>' + playerCell(c.player, c.team, c.position) + '</td>' +
        '<td>' + (c.position ? '<span class="badge pos-' + escapeHtml(c.position) + '">' + escapeHtml(c.position) + '</span>' : '—') + '</td>' +
        '<td>' + escapeHtml(c.team || '—') + '</td>' +
        '<td class="num">' + c.coCount + '</td>' +
        '<td class="num">' + BB.fmtPct(c.comboPct) + '</td>' +
        '<td class="num">' + BB.fmtPct(c.theirExposurePct) + '</td>' +
        '<td class="num ' + liftCls + '">' + liftText(c.lift) + '</td>' +
        '</tr>';
    }).join('');

    var note = '<p style="color:var(--text-dim);font-size:12px;margin:4px 0 12px;">' +
      '<strong>Combo %</strong> — of the rosters that have ' + escapeHtml(report.player) + ', what fraction also have the teammate. ' +
      '<strong>Lift</strong> — combo % ÷ teammate\'s overall exposure %. >1 means correlated; <1 anti-correlated.' +
      '</p>';

    return '<h2>Combo ownership <span style="color:var(--text-muted);font-size:13px;font-weight:400;">(top ' + combos.length + ' teammates)</span></h2>' +
      note +
      '<table class="data">' + head + '<tbody>' + body + '</tbody></table>';
  }

  function renderRoundDistribution(report) {
    var dist = report.roundDistribution;
    var rounds = Object.keys(dist).map(Number).sort(function (a, b) { return a - b; });
    if (!rounds.length) return '';
    var max = Math.max.apply(null, rounds.map(function (r) { return dist[r]; }));
    var rangeStart = Math.min.apply(null, rounds);
    var rangeEnd = Math.max.apply(null, rounds);
    // Fill in any missing rounds for a continuous bar chart
    var filled = [];
    for (var r = Math.max(1, rangeStart - 1); r <= rangeEnd + 1; r++) filled.push(r);
    var bars = filled.map(function (r) {
      var count = dist[r] || 0;
      var h = max ? Math.round((count / max) * 80) + (count ? 4 : 1) : 1;
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:24px;">' +
        '<div style="color:var(--text-dim);font-size:11px;font-variant-numeric:tabular-nums;">' + (count || '') + '</div>' +
        '<div style="background:var(--accent);width:100%;height:' + h + 'px;border-radius:3px 3px 0 0;opacity:' + (count ? 0.9 : 0.15) + ';"></div>' +
        '<div style="color:var(--text-muted);font-size:11px;">' + r + '</div>' +
        '</div>';
    }).join('');
    return '<h2>Picks by round</h2>' +
      '<div class="card" style="padding:16px;">' +
        '<div style="display:flex;align-items:flex-end;gap:6px;height:120px;">' + bars + '</div>' +
      '</div>';
  }

  // Canonical market ADP from an ADP row — prefer Underdog, then DK, then Drafters.
  function canonADP(row) {
    if (!row) return null;
    if (row.ud != null) return row.ud;
    if (row.dk != null) return row.dk;
    if (row.drafters != null) return row.drafters;
    if (row.bb10 != null) return row.bb10;
    if (row.rtsports != null) return row.rtsports;
    return null;
  }

  function fmtDelta(v) {
    if (v == null || isNaN(v)) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1);
  }
  function deltaClass(v) {
    if (v == null) return '';
    if (v > 0.5) return 'clv-pos';
    if (v < -0.5) return 'clv-neg';
    return '';
  }
  function simpleRange(arr) {
    if (!arr.length) return null;
    var min = Math.min.apply(null, arr);
    var max = Math.max.apply(null, arr);
    return min === max ? null : { min: min, max: max };
  }

  async function renderRosters(report) {
    if (!report.rostersWith.length) return '';

    var normName = window.BB_DATA && window.BB_DATA.normalizeName
      ? window.BB_DATA.normalizeName(report.player)
      : report.player.toLowerCase().trim();

    // Today's ADP — used for RTV column and as fallback when no history exists.
    var currentAdpRow = window.BB_DATA ? window.BB_DATA.lookupADP(report.player) : null;
    var currentADP = canonADP(currentAdpRow);

    // Pre-fetch historical ADP for every unique draft date in parallel.
    var uniqueDates = {};
    report.rostersWith.forEach(function (r) {
      if (r.draftedAt) uniqueDates[String(r.draftedAt).slice(0, 10)] = true;
    });
    var histByDate = {};
    await Promise.all(Object.keys(uniqueDates).map(async function (d) {
      histByDate[d] = await BB.fetchHistoryForDate(d);
    }));

    var rows = report.rostersWith.slice().sort(function (a, b) {
      return (a._pick.overallPick || 0) - (b._pick.overallPick || 0);
    });

    // Pre-compute CLV / RTV values for heat-map range.
    var clvVals = [], rtvVals = [];
    rows.forEach(function (r) {
      var pick = r._pick.overallPick;
      if (pick == null) return;
      var date = r.draftedAt ? String(r.draftedAt).slice(0, 10) : null;
      var hist = date && histByDate[date];
      var histRow = hist && hist[normName];
      var draftADP = canonADP(histRow) != null ? canonADP(histRow) : currentADP;
      if (draftADP != null) clvVals.push(pick - draftADP);
      if (currentADP != null) rtvVals.push(pick - currentADP);
    });
    var clvRange = simpleRange(clvVals);
    var rtvRange = simpleRange(rtvVals);

    var TT = {
      draftAdp:  'Market ADP (Underdog › DK › Drafters) on the day you submitted this draft.\nFalls back to today\'s ADP when no historical snapshot exists for that date.',
      clv:       'CLV — your pick number minus the market ADP at draft date.\nPositive = you got the player later than the market was pricing them = value.',
      todayAdp:  'Today\'s market ADP.',
      rtv:       'RTV — your pick number minus today\'s market ADP.\nPositive = the market now prices this player earlier than you paid = your pick aged well.',
    };

    var head = '<thead><tr>' +
      '<th>Tournament</th>' +
      '<th>Platform</th>' +
      '<th class="num">Pick</th>' +
      '<th class="num tooltip-trigger" data-tooltip="' + escapeHtml(TT.draftAdp)  + '">Draft ADP <span class="info-mark">ⓘ</span></th>' +
      '<th class="num tooltip-trigger" data-tooltip="' + escapeHtml(TT.clv)       + '">CLV <span class="info-mark">ⓘ</span></th>' +
      '<th class="num tooltip-trigger" data-tooltip="' + escapeHtml(TT.todayAdp)  + '">Today\'s ADP <span class="info-mark">ⓘ</span></th>' +
      '<th class="num tooltip-trigger" data-tooltip="' + escapeHtml(TT.rtv)       + '">RTV <span class="info-mark">ⓘ</span></th>' +
      '<th class="num">Fee</th>' +
      '<th></th>' +
    '</tr></thead>';

    var body = rows.map(function (r) {
      var pick = r._pick.overallPick;
      var date = r.draftedAt ? String(r.draftedAt).slice(0, 10) : null;
      var hist = date && histByDate[date];
      var histRow = hist && hist[normName];
      var rawDraftADP = canonADP(histRow);
      var draftADP = rawDraftADP != null ? rawDraftADP : currentADP;
      var clv = (pick != null && draftADP  != null) ? pick - draftADP  : null;
      var rtv = (pick != null && currentADP != null) ? pick - currentADP : null;
      var noHistory = rawDraftADP == null && draftADP != null;
      var draftAdpCell = BB.fmtADP(draftADP) + (noHistory ? ' <span style="color:var(--text-muted);font-size:10px;" title="No history for this date — using today\'s ADP">~</span>' : '');
      return '<tr>' +
        '<td>' + escapeHtml(r.tournament || '(unknown)') + '</td>' +
        '<td>' + (BB.platformLogoHTML(r.platform, { size: 16 }) || '<span class="badge">' + escapeHtml(r.platform) + '</span>') + '</td>' +
        '<td class="num">' + (pick != null ? pick : '—') + '</td>' +
        '<td class="num">' + draftAdpCell + '</td>' +
        '<td class="num ' + deltaClass(clv) + '"' + BB.heatStyle(clv, clvRange) + '>' + fmtDelta(clv) + '</td>' +
        '<td class="num">' + BB.fmtADP(currentADP) + '</td>' +
        '<td class="num ' + deltaClass(rtv) + '"' + BB.heatStyle(rtv, rtvRange) + '>' + fmtDelta(rtv) + '</td>' +
        '<td class="num">' + BB.fmtMoney(r.entryFee) + '</td>' +
        '<td><a href="rosters.html?id=' + encodeURIComponent(r.rosterId) + '">View →</a></td>' +
      '</tr>';
    }).join('');

    var noHistCount = rows.filter(function (r) {
      var date = r.draftedAt ? String(r.draftedAt).slice(0, 10) : null;
      var hist = date && histByDate[date];
      return !hist || !hist[normName];
    }).length;
    var foot = noHistCount
      ? '<p style="color:var(--text-muted);font-size:11px;margin:6px 2px 0;">' +
          noHistCount + ' roster' + (noHistCount === 1 ? '' : 's') + ' marked ~ had no ADP history for that date and show today\'s ADP instead.' +
        '</p>'
      : '';

    return '<h2>Rosters with ' + escapeHtml(report.player) +
      ' <span style="color:var(--text-muted);font-size:13px;font-weight:400;">(' + rows.length + ')</span></h2>' +
      '<table class="data">' + head + '<tbody>' + body + '</tbody></table>' + foot;
  }

  async function init() {
    var name = getPlayerNameFromURL();
    if (!name) {
      renderEmpty('No player specified', 'Open this page from <a href="exposures.html">Exposures</a> by clicking a player name.');
      return;
    }
    var rosters = BB.loadRosters();
    if (!rosters.length) {
      renderEmpty('No rosters loaded', '<a href="index.html">Upload</a> your CSV exports first.');
      return;
    }
    var report = BB.playerReport(rosters, name);
    if (!report.exposureCount) {
      var adp = window.BB_DATA.lookupADP(name);
      if (!adp) {
        renderEmpty(name + ' not found', 'No matching player in your rosters or the ADP reference.');
        return;
      }
      var fallbackLogo = report.team ? BB.teamLogoHTML(report.team, { size: 40, className: 'team-logo-hero' }) : '';
      var fallbackTrendsBtn = '<a class="adp-trend-btn" href="trends.html?view=chart&player=' + encodeURIComponent(report.player) + '">' +
        '<span class="adp-trend-icon" aria-hidden="true">📈</span>' +
        '<span>View ADP Trend</span>' +
      '</a>';
      contentEl.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
          fallbackLogo +
          '<h1 style="margin:0;">' + escapeHtml(report.player) + '</h1>' +
          (report.position ? '<span class="badge pos-' + escapeHtml(report.position) + '" style="font-size:13px;padding:4px 10px;">' + escapeHtml(report.position) + '</span>' : '') +
          (report.team ? '<span class="badge" style="font-size:13px;padding:4px 10px;">' + escapeHtml(report.team) + '</span>' : '') +
          fallbackTrendsBtn +
        '</div>' +
        '<p class="lede">You haven\'t drafted ' + escapeHtml(report.player) + ' on any of your ' + rosters.length + ' rosters.</p>' +
        renderADPRow(report);
      return;
    }

    // Render the fast synchronous sections immediately, with a loading placeholder
    // for the rosters table (which needs async history fetches).
    contentEl.innerHTML =
      renderHero(report) +
      renderADPRow(report) +
      renderCombos(report) +
      renderRoundDistribution(report) +
      '<div id="player-rosters-slot"><p style="color:var(--text-muted);font-size:13px;padding:8px 0;">Loading roster data…</p></div>';

    var rostersHtml = await renderRosters(report);
    var slot = document.getElementById('player-rosters-slot');
    if (slot) slot.outerHTML = rostersHtml;
  }

  init();
})();
