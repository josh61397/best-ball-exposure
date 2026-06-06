// Week 17 game-stack deep dive. Reached via the "View Stack" button on
// the Stacks > Week 17 table. URL: week17.html?game=KC%7CLAC (the | is
// our canonical "min(A,B)|max(A,B)" game key).
(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('w17-content');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ROSTERS_PAGE_SIZE = 10;
  var state = { rosterPage: 0, row: null };

  function renderEmpty(title, msg) {
    contentEl.innerHTML = '<div class="empty-state"><h2>' + escapeHtml(title) + '</h2><p>' + msg + '</p></div>';
  }

  function gameFromURL() {
    var qs = new URLSearchParams(location.search);
    return qs.get('game') || '';
  }

  function chip(pos, name, count) {
    var badge = pos ? '<span class="badge pos-' + escapeHtml(pos) + '">' + escapeHtml(pos) + '</span>' : '';
    return '<span class="w17-chip">' + badge +
      '<span class="w17-chip-name">' + escapeHtml(name) + '</span>' +
      '<span class="w17-chip-count">' + count + '</span>' +
    '</span>';
  }

  function renderHero(row, totalRosters, totalFees) {
    var hero =
      '<header class="player-hero">' +
        '<div class="player-hero-head">' +
          BB.teamLogoHTML(row.teamA, { size: 36, className: 'player-hero-logo' }) +
          BB.teamLogoHTML(row.teamB, { size: 36, className: 'player-hero-logo' }) +
          '<h1 class="player-hero-name">' + escapeHtml(row.teamA) + ' vs ' + escapeHtml(row.teamB) + '</h1>' +
          '<div class="player-hero-badges">' +
            '<span class="badge player-hero-badge player-hero-badge-muted">Week 17</span>' +
          '</div>' +
          '<div class="player-hero-actions">' +
            '<a class="player-hero-action" href="stacks.html">← Back to Stacks</a>' +
          '</div>' +
        '</div>' +
        '<div class="player-hero-subtitle">' +
          '<strong>' + row.count + '</strong> of your ' + totalRosters + ' rosters have a game stack on ' +
          escapeHtml(row.teamA) + ' vs ' + escapeHtml(row.teamB) + '.' +
        '</div>' +
        '<div class="player-hero-stats">' +
          stat('Rosters', row.count.toLocaleString(), 'with a game stack', 'is-key') +
          stat('Stack %', BB.fmtPct(row.pct)) +
          stat('A-anchored', row.aAnchored, row.teamA + ' QB + catcher') +
          stat('B-anchored', row.bAnchored, row.teamB + ' QB + catcher') +
          stat('Both', row.bothAnchored, 'QB on each side') +
          stat('Fees', BB.fmtMoney(row.fees), BB.fmtPct(row.feesPct) + ' of total') +
        '</div>' +
      '</header>';
    return hero;
  }
  function stat(label, value, sub, cls) {
    return '<div class="player-hero-stat">' +
      '<div class="player-hero-stat-label">' + label + '</div>' +
      '<div class="player-hero-stat-value' + (cls ? ' ' + cls : '') + '">' + value + '</div>' +
      (sub ? '<div class="player-hero-stat-sub">' + sub + '</div>' : '') +
    '</div>';
  }

  function renderAnchorSide(teamCode, oppCode, pairs, bringBacks) {
    var qbCounts = {};
    pairs.forEach(function (p) { qbCounts[p.qb] = (qbCounts[p.qb] || 0) + p.count; });
    var qbNames = Object.keys(qbCounts).sort(function (a, b) { return qbCounts[b] - qbCounts[a]; });
    var qbLabel = qbNames.length === 1
      ? '<strong>' + escapeHtml(qbNames[0]) + '</strong>'
      : qbNames.length
        ? qbNames.map(function (n) { return '<strong>' + escapeHtml(n) + '</strong>'; }).join(' / ')
        : '<span style="color:var(--text-muted);">No QB on ' + escapeHtml(teamCode) + '</span>';

    var catcherCounts = {};
    pairs.forEach(function (p) {
      var k = p.catcher;
      if (!catcherCounts[k]) catcherCounts[k] = { name: p.catcher, pos: p.catcherPos, count: 0 };
      catcherCounts[k].count += p.count;
    });
    var catcherList = Object.keys(catcherCounts).map(function (k) { return catcherCounts[k]; })
      .sort(function (a, b) { return b.count - a.count; });
    var catcherChips = catcherList.length
      ? catcherList.map(function (c) { return chip(c.pos, c.name, c.count); }).join('')
      : '<span class="w17-empty">No ' + escapeHtml(teamCode) + '-anchored rosters.</span>';

    var bringChips = bringBacks.length
      ? bringBacks.map(function (b) { return chip(b.pos, b.player, b.count); }).join('')
      : '<span class="w17-empty">No bring-backs.</span>';

    return '<div class="w17-side">' +
      '<div class="w17-side-head">' +
        '<span class="w17-side-team">' +
          BB.teamLogoHTML(teamCode, { size: 20 }) +
          '<span><span class="w17-side-team-code">' + escapeHtml(teamCode) + '</span>' +
          '<span class="w17-side-qb">' + qbLabel + '</span></span>' +
        '</span>' +
      '</div>' +
      '<div class="w17-row">' +
        '<div class="w17-row-label">Pass catchers</div>' +
        '<div class="w17-chip-row">' + catcherChips + '</div>' +
      '</div>' +
      '<div class="w17-row">' +
        '<div class="w17-row-label">Bring-backs <span style="color:var(--text-muted);font-weight:400;">· ' + escapeHtml(oppCode) + '</span></div>' +
        '<div class="w17-chip-row">' + bringChips + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderAnchorPanel(row) {
    return '<h2 style="margin-top:8px;">Anchor breakdown</h2>' +
      '<div class="w17-anchor-grid w17-anchor-grid--standalone">' +
        renderAnchorSide(row.teamA, row.teamB, row.topPairs.A, row.topBringBacks.B) +
        renderAnchorSide(row.teamB, row.teamA, row.topPairs.B, row.topBringBacks.A) +
      '</div>';
  }

  function renderRostersTable(row) {
    var matched = (row.matchedRosters || []).slice().sort(function (a, b) {
      return (b.fees || 0) - (a.fees || 0);
    });
    if (!matched.length) {
      return '<h2 style="margin-top:8px;">Matching rosters</h2>' +
        '<div class="empty-state"><p>No rosters match this stack.</p></div>';
    }
    var totalPages = Math.max(1, Math.ceil(matched.length / ROSTERS_PAGE_SIZE));
    if (state.rosterPage >= totalPages) state.rosterPage = totalPages - 1;
    if (state.rosterPage < 0) state.rosterPage = 0;
    var start = state.rosterPage * ROSTERS_PAGE_SIZE;
    var end = Math.min(start + ROSTERS_PAGE_SIZE, matched.length);
    var pageRows = matched.slice(start, end);

    function playerListCell(players, teamCode) {
      if (!players.length) return '<span style="color:var(--text-muted);">—</span>';
      var logo = teamCode ? BB.teamLogoHTML(teamCode, { size: 16 }) : '';
      var parts = players.map(function (p) {
        var badge = p.pos ? '<span class="badge pos-' + escapeHtml(p.pos) + '" style="font-size:10px;padding:1px 5px;">' + escapeHtml(p.pos) + '</span> ' : '';
        return badge + escapeHtml(p.player);
      });
      return '<span style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
        logo +
        '<span>' + parts.join('<span style="color:var(--text-muted);margin:0 4px;">·</span>') + '</span>' +
      '</span>';
    }

    var tableRows = pageRows.map(function (mr) {
      var stackCell = playerListCell(mr.stackPlayers, mr.anchorTeam);
      var bringCell = playerListCell(mr.bringBacks, mr.oppTeam);
      var href = 'rosters.html?id=' + encodeURIComponent(mr.rosterId);
      return '<tr>' +
        '<td style="font-size:12px;">' + stackCell + '</td>' +
        '<td style="font-size:12px;">' + bringCell + '</td>' +
        '<td class="num" style="font-size:12px;">' + BB.fmtMoney(mr.fees) + '</td>' +
        '<td style="font-size:12px;">' + escapeHtml(mr.tournament) + '</td>' +
        '<td style="font-size:12px;"><a href="' + escapeHtml(href) + '" style="color:var(--accent);">View</a></td>' +
      '</tr>';
    }).join('');

    var prevDisabled = state.rosterPage === 0;
    var nextDisabled = state.rosterPage >= totalPages - 1;
    var pagerHtml = matched.length > ROSTERS_PAGE_SIZE
      ? '<div class="rt-pager">' +
          '<button type="button" class="rt-page-btn" id="w17-prev"' + (prevDisabled ? ' disabled' : '') + '>‹ Prev</button>' +
          '<span class="rt-page-info">Showing ' + (start + 1) + '–' + end + ' of ' + matched.length + '</span>' +
          '<button type="button" class="rt-page-btn" id="w17-next"' + (nextDisabled ? ' disabled' : '') + '>Next ›</button>' +
        '</div>'
      : '';

    return '<h2 style="margin-top:8px;">Matching rosters ' +
        '<span style="color:var(--text-muted);font-size:13px;font-weight:400;">(' + matched.length + ')</span>' +
      '</h2>' +
      '<div id="w17-rosters-wrap">' +
        '<table class="data" style="width:100%;">' +
          '<thead><tr>' +
            '<th>Stack</th>' +
            '<th>Bring-backs</th>' +
            '<th class="num">Fees</th>' +
            '<th>Tournament</th>' +
            '<th></th>' +
          '</tr></thead>' +
          '<tbody>' + tableRows + '</tbody>' +
        '</table>' +
        pagerHtml +
      '</div>';
  }

  function bindPager() {
    var prev = document.getElementById('w17-prev');
    var next = document.getElementById('w17-next');
    if (prev) prev.addEventListener('click', function () {
      if (prev.disabled) return;
      state.rosterPage--;
      rerenderRostersOnly();
    });
    if (next) next.addEventListener('click', function () {
      if (next.disabled) return;
      state.rosterPage++;
      rerenderRostersOnly();
    });
  }

  function rerenderRostersOnly() {
    var slot = document.getElementById('w17-rosters-slot');
    if (!slot) return;
    slot.innerHTML = renderRostersTable(state.row);
    bindPager();
  }

  function init() {
    var gameKey = gameFromURL();
    if (!gameKey) {
      renderEmpty('No game selected', 'Open this page from <a href="stacks.html">Stacks</a> by clicking <strong>View Stack</strong> on a Week 17 row.');
      return;
    }
    var rosters = BB.loadRosters();
    if (!rosters.length) {
      renderEmpty('No rosters uploaded yet', 'Upload a CSV from the <a href="index.html">Upload</a> page first.');
      return;
    }
    var all = BB.computeWeek17GameStacks(rosters);
    var row = null;
    for (var i = 0; i < all.length; i++) if (all[i].game === gameKey) { row = all[i]; break; }
    if (!row) {
      renderEmpty('Game not found', 'No Week 17 matchup matches <code>' + escapeHtml(gameKey) + '</code>.');
      return;
    }
    state.row = row;
    state.rosterPage = 0;

    var totalRosters = rosters.length;
    var totalFees = 0;
    rosters.forEach(function (r) { totalFees += r.entryFee || 0; });

    contentEl.innerHTML =
      renderHero(row, totalRosters, totalFees) +
      '<div id="w17-rosters-slot">' + renderRostersTable(row) + '</div>' +
      renderAnchorPanel(row);
    bindPager();
  }

  init();
})();
