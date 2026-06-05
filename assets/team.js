(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('team-content');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function teamFromURL() {
    var qs = new URLSearchParams(location.search);
    return (qs.get('code') || '').toUpperCase().trim();
  }

  function statCard(label, value, sub, cls) {
    return '<div class="card">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value ' + (cls || '') + '">' + value + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') +
      '</div>';
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

  function renderEmpty(msg, sub) {
    contentEl.innerHTML = '<div class="empty-state"><h2>' + escapeHtml(msg) + '</h2>' +
      (sub ? '<p>' + sub + '</p>' : '') + '</div>';
  }

  function findByeWeek(team) {
    if (!window.BB_DATA || !window.BB_DATA.schedule) return null;
    var sched = window.BB_DATA.schedule[team];
    if (!sched) return null;
    for (var i = 0; i < sched.length; i++) {
      if (sched[i] === 'BYE') return i + 1;
    }
    return null;
  }

  function renderHero(team, summary, byeWeek) {
    var stats = summary || { totalPicks: 0, rostersWithTeam: 0, stackedRosters: 0, stackRate: 0, fees: 0 };
    var totalRosters = BB.loadRosters().length;
    return '<header class="topbar">' +
        '<h1 class="topbar-title">' + escapeHtml(team) + '</h1>' +
      '</header>' +
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:8px;">' +
        BB.teamLogoHTML(team, { size: 48, className: 'team-logo-hero' }) +
        (byeWeek ? '<span class="badge">Bye W' + byeWeek + '</span>' : '') +
      '</div>' +
      '<p class="lede" style="margin-top:6px;">' +
        stats.totalPicks + ' total picks across ' + stats.rostersWithTeam + ' of your ' + totalRosters + ' rosters.' +
      '</p>' +
      '<div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">' +
        statCard('Rosters with ' + escapeHtml(team), stats.rostersWithTeam.toLocaleString(),
                 totalRosters ? BB.fmtPct(stats.rostersWithTeam / totalRosters) + ' of total' : '') +
        statCard('Total picks', stats.totalPicks.toLocaleString()) +
        statCard('Stacks (2+)', stats.stackedRosters.toLocaleString(),
                 BB.fmtPct(stats.stackRate) + ' stack rate') +
        statCard('Avg stack size',
                 stats.avgPlayersWhenStacked != null ? stats.avgPlayersWhenStacked.toFixed(2) : '—',
                 'when stacked') +
        statCard('Fees', BB.fmtMoney(stats.fees), 'rosters with team') +
      '</div>';
  }

  function renderPlayers(team, rosters) {
    // Aggregate players from this team across your rosters.
    var byPlayer = {};
    var total = rosters.length;
    rosters.forEach(function (r) {
      var seen = {};
      r.picks.forEach(function (p) {
        if (p.team !== team || !p.player) return;
        var k = p.player.toLowerCase();
        if (seen[k]) return;
        seen[k] = true;
        if (!byPlayer[k]) {
          byPlayer[k] = {
            player: p.player, position: p.position, team: p.team,
            count: 0, fees: 0, sumPick: 0, samplePicks: 0,
          };
        }
        var e = byPlayer[k];
        e.count++;
        e.fees += r.entryFee || 0;
        if (p.overallPick) { e.sumPick += p.overallPick; e.samplePicks++; }
      });
    });
    var rows = Object.values(byPlayer).map(function (e) {
      var myADP = e.samplePicks ? e.sumPick / e.samplePicks : null;
      var refADP = window.BB_DATA ? window.BB_DATA.lookupADP(e.player) : null;
      var marketADP = refADP ? (refADP.ud != null ? refADP.ud : (refADP.dk != null ? refADP.dk : (refADP.drafters != null ? refADP.drafters : null))) : null;
      var clv = (myADP != null && marketADP != null) ? (myADP - marketADP) : null;
      return {
        player: e.player, position: e.position, team: e.team,
        count: e.count, exposurePct: total ? e.count / total : 0,
        fees: e.fees,
        myADP: myADP, marketADP: marketADP, clv: clv,
      };
    }).sort(function (a, b) { return b.count - a.count; });

    if (!rows.length) {
      return '<h2>Players you\'ve drafted from ' + escapeHtml(team) + '</h2>' +
        '<div class="empty-state" style="padding:24px;"><p>No players from this team on your rosters yet.</p></div>';
    }

    var body = rows.map(function (r) {
      return '<tr>' +
        '<td>' + BB.playerCell(r.player, r.team, { linkToPlayer: true, position: r.position }) + '</td>' +
        '<td>' + (r.position ? '<span class="badge pos-' + escapeHtml(r.position) + '">' + escapeHtml(r.position) + '</span>' : '—') + '</td>' +
        '<td class="num">' + r.count + '</td>' +
        '<td class="num">' + BB.fmtPct(r.exposurePct) + '</td>' +
        '<td class="num">' + BB.fmtMoney(r.fees) + '</td>' +
        '<td class="num">' + BB.fmtADP(r.myADP) + '</td>' +
        '<td class="num">' + BB.fmtADP(r.marketADP) + '</td>' +
        '<td class="num ' + clvClass(r.clv) + '">' + clvText(r.clv) + '</td>' +
        '</tr>';
    }).join('');
    return '<h2>Players you\'ve drafted from ' + escapeHtml(team) + ' <span style="color:var(--text-muted);font-weight:400;font-size:13px;">(' + rows.length + ')</span></h2>' +
      '<table class="data"><thead><tr>' +
        '<th>Player</th><th>Pos</th>' +
        '<th class="num">Drafted</th><th class="num">% Drafted</th>' +
        '<th class="num">Fees</th>' +
        '<th class="num">My ADP</th><th class="num">ADP</th><th class="num">CLV</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderStackCompositions(team, rosters) {
    // For each roster, find picks on this team, get sorted position combo, count.
    var byCombo = {};
    rosters.forEach(function (r) {
      var picks = (r.picks || []).filter(function (p) { return p.team === team; });
      if (picks.length < 2) return;
      var posSorted = picks.map(function (p) { return p.position || '?'; }).sort();
      var combo = posSorted.join('+');
      if (!byCombo[combo]) byCombo[combo] = { combo: combo, count: 0, size: picks.length, fees: 0 };
      byCombo[combo].count++;
      byCombo[combo].fees += r.entryFee || 0;
    });
    var rows = Object.values(byCombo).sort(function (a, b) { return b.count - a.count; });
    if (!rows.length) {
      return '<h2>Stack compositions</h2>' +
        '<div class="empty-state" style="padding:24px;"><p>No stacks (2+ players from ' + escapeHtml(team) + ') on your rosters yet.</p></div>';
    }
    var total = rosters.length;
    var body = rows.map(function (c) {
      return '<tr>' +
        '<td><code class="stack-combo">' + escapeHtml(c.combo) + '</code></td>' +
        '<td class="num">' + c.size + '</td>' +
        '<td class="num">' + c.count + '</td>' +
        '<td class="num">' + (total ? BB.fmtPct(c.count / total) : '—') + '</td>' +
        '<td class="num">' + BB.fmtMoney(c.fees) + '</td>' +
        '</tr>';
    }).join('');
    return '<h2>Stack compositions <span style="color:var(--text-muted);font-weight:400;font-size:13px;">(' + rows.length + ')</span></h2>' +
      '<table class="data"><thead><tr>' +
        '<th>Combo</th><th class="num">Players</th>' +
        '<th class="num">Rosters</th><th class="num">% of Rosters</th>' +
        '<th class="num">Fees</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderSchedule(team) {
    if (!window.BB_DATA || !window.BB_DATA.schedule) return '';
    var sched = window.BB_DATA.schedule[team];
    if (!sched) return '';
    var chips = sched.map(function (opp, i) {
      var week = i + 1;
      var isBye = opp === 'BYE';
      var cls = isBye ? 'sched-chip bye' : 'sched-chip';
      var logo = (!isBye && opp) ? BB.teamLogoHTML(opp, { size: 14 }) : '';
      return '<div class="' + cls + '">' +
        '<div class="sched-week">W' + week + '</div>' +
        '<div class="sched-opp">' + logo + escapeHtml(isBye ? 'BYE' : (opp || '—')) + '</div>' +
        '</div>';
    }).join('');
    return '<h2>2026 schedule</h2>' +
      '<div class="schedule-strip">' + chips + '</div>';
  }

  function init() {
    var team = teamFromURL();
    if (!team) {
      renderEmpty('No team specified', 'Open this page by clicking a team on <a href="stacks.html">Stacks</a>.');
      return;
    }

    var rosters = BB.loadRosters();
    if (!rosters.length) {
      renderEmpty('No rosters loaded', '<a href="index.html">Upload</a> a CSV first.');
      return;
    }

    var stacks = BB.computeTeamStacks(rosters);
    var summary = stacks.find(function (s) { return s.team === team; });
    var byeWeek = findByeWeek(team);

    document.title = team + ' — Best Ball Exposure';

    var backLink = '<div style="margin-bottom:12px;"><a href="stacks.html" style="font-size:13px;color:var(--text-dim);">← Back to all stacks</a></div>';
    contentEl.innerHTML =
      backLink +
      renderHero(team, summary, byeWeek) +
      renderPlayers(team, rosters) +
      renderStackCompositions(team, rosters) +
      renderSchedule(team);
  }

  init();
})();
