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

    return '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
      '<h1 style="margin:0;">' + escapeHtml(report.player) + '</h1>' + badge + team + byeBadge +
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
        '<td>' + playerLink(c.player) + '</td>' +
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

  function renderRosters(report) {
    if (!report.rostersWith.length) return '';
    var rows = report.rostersWith.slice().sort(function (a, b) {
      return (a._pick.overallPick || 0) - (b._pick.overallPick || 0);
    });
    var head = '<thead><tr><th>Tournament</th><th>Platform</th><th class="num">Pick</th><th class="num">Round</th><th class="num">Entry fee</th><th></th></tr></thead>';
    var body = rows.map(function (r) {
      return '<tr>' +
        '<td>' + escapeHtml(r.tournament || '(unknown)') + '</td>' +
        '<td><span class="badge">' + escapeHtml(r.platform) + '</span></td>' +
        '<td class="num">' + (r._pick.overallPick != null ? r._pick.overallPick : '—') + '</td>' +
        '<td class="num">' + (r._pick.round != null ? r._pick.round : '—') + '</td>' +
        '<td class="num">' + BB.fmtMoney(r.entryFee) + '</td>' +
        '<td><a href="rosters.html?id=' + encodeURIComponent(r.rosterId) + '">View →</a></td>' +
        '</tr>';
    }).join('');
    return '<h2>Rosters with ' + escapeHtml(report.player) + ' <span style="color:var(--text-muted);font-size:13px;font-weight:400;">(' + rows.length + ')</span></h2>' +
      '<table class="data">' + head + '<tbody>' + body + '</tbody></table>';
  }

  function init() {
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
      // Still show the hero with reference ADP info so user knows the player exists in ADP universe
      var adp = window.BB_DATA.lookupADP(name);
      if (!adp) {
        renderEmpty(name + ' not found', 'No matching player in your rosters or the ADP reference.');
        return;
      }
      contentEl.innerHTML =
        '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' +
          '<h1 style="margin:0;">' + escapeHtml(report.player) + '</h1>' +
          (report.position ? '<span class="badge pos-' + escapeHtml(report.position) + '" style="font-size:13px;padding:4px 10px;">' + escapeHtml(report.position) + '</span>' : '') +
          (report.team ? '<span class="badge" style="font-size:13px;padding:4px 10px;">' + escapeHtml(report.team) + '</span>' : '') +
        '</div>' +
        '<p class="lede">You haven\'t drafted ' + escapeHtml(report.player) + ' on any of your ' + rosters.length + ' rosters.</p>' +
        renderADPRow(report);
      return;
    }
    contentEl.innerHTML =
      renderHero(report) +
      renderADPRow(report) +
      renderCombos(report) +
      renderRoundDistribution(report) +
      renderRosters(report);
  }

  init();
})();
