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

  // Bucket every matched roster by total game-stack size
  // (anchor-side QB+catchers + opponent-side bring-backs).
  // Buckets: 3, 4, 5, 6, 7+ — minimum legal stack is QB+catcher+1 bring-back.
  function bucketsForSize(matched) {
    var raw = {};
    matched.forEach(function (mr) {
      var n = (mr.stackPlayers ? mr.stackPlayers.length : 0) + (mr.bringBacks ? mr.bringBacks.length : 0);
      if (n < 3) return; // shouldn't happen, but guard
      var k = n >= 7 ? 7 : n; // 7 = "7+"
      raw[k] = (raw[k] || 0) + 1;
    });
    var labels = [3, 4, 5, 6, 7];
    var labelStr = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7+' };
    var total = matched.length;
    return labels.map(function (k) {
      var c = raw[k] || 0;
      return { label: labelStr[k], count: c, pct: total ? c / total : 0 };
    });
  }

  function renderStackSizeHistogram(matched) {
    var buckets = bucketsForSize(matched);
    var max = 0;
    buckets.forEach(function (b) { if (b.count > max) max = b.count; });
    if (!max) return ''; // nothing to chart

    var modeBucket = buckets.reduce(function (best, b) { return b.count > best.count ? b : best; }, buckets[0]);
    var total = matched.length;
    var avg = 0;
    matched.forEach(function (mr) {
      avg += (mr.stackPlayers ? mr.stackPlayers.length : 0) + (mr.bringBacks ? mr.bringBacks.length : 0);
    });
    avg = total ? avg / total : 0;

    var bars = buckets.map(function (b) {
      var ratio = max ? b.count / max : 0;
      var barH = Math.max(2, Math.round(ratio * 75));
      var alpha = b.count ? 0.85 : 0.15;
      var pctText = total ? (b.pct * 100).toFixed(b.pct * 100 >= 10 ? 0 : 1) + '%' : '';
      var title = b.count + ' roster' + (b.count === 1 ? '' : 's') + ' with ' + b.label + ' game-stack players';
      // Top = % of total (the question users actually read), bar in the
      // middle, stack-size label sits below as the x-axis tick. Raw count
      // is on the hover tooltip.
      return '<div class="hist-col" title="' + escapeHtml(title) + '">' +
        '<div class="hist-num">' + (b.count ? pctText : '0%') + '</div>' +
        '<div class="hist-bar" style="height:' + barH + 'px;background:var(--accent);opacity:' + alpha + ';"></div>' +
        '<div class="hist-x">' + b.label + '</div>' +
      '</div>';
    }).join('');

    return '<div class="card histogram-card slot-card">' +
        '<div class="histogram-head">' +
          '<span class="badge" style="background:var(--bg-elev-2);color:var(--text-dim);border-color:var(--border);">DEPTH</span>' +
          '<span class="histogram-meta">avg ' + avg.toFixed(2).replace(/\.00$/, '') +
            ' · mode ' + modeBucket.label +
            ' · ' + total + ' roster' + (total === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div class="histogram-bars">' + bars + '</div>' +
        '<div class="histogram-axis-label"># of game-stack players per roster</div>' +
      '</div>';
  }

  // Donut breaking the matched rosters into disjoint slices:
  //   A-only:  anchored on A but not B
  //   B-only:  anchored on B but not A
  //   Both:    QBs on both teams contributed to anchors
  function renderAnchorSplitDonut(row) {
    var both = row.bothAnchored || 0;
    var aOnly = Math.max(0, (row.aAnchored || 0) - both);
    var bOnly = Math.max(0, (row.bAnchored || 0) - both);
    var total = aOnly + bOnly + both;

    var colorA = (BB.teamColor && BB.teamColor(row.teamA)) || '#5b9bd5';
    var colorB = (BB.teamColor && BB.teamColor(row.teamB)) || '#ed7d31';
    var colorBoth = '#9ca3af'; // muted gray so it doesn't compete with team colors

    var slices = [
      { key: 'a',    color: colorA,    count: aOnly, label: row.teamA + ' only', teamCode: row.teamA },
      { key: 'b',    color: colorB,    count: bOnly, label: row.teamB + ' only', teamCode: row.teamB },
      { key: 'both', color: colorBoth, count: both,  label: 'Both anchors',      teamCode: null },
    ];

    // Donut geometry. r = path radius (center of stroke); stroke = ring thickness.
    var SIZE = 120, R = 42, STROKE = 22, C = 2 * Math.PI * R;
    var arcs = '';
    if (total === 0) {
      arcs = '<circle cx="' + (SIZE/2) + '" cy="' + (SIZE/2) + '" r="' + R + '" fill="none" stroke="var(--border)" stroke-width="' + STROKE + '"/>';
    } else if (slices.filter(function (s) { return s.count > 0; }).length === 1) {
      // Single slice — draw as full ring, no dash math.
      var only = slices.filter(function (s) { return s.count > 0; })[0];
      arcs = '<circle cx="' + (SIZE/2) + '" cy="' + (SIZE/2) + '" r="' + R + '" fill="none" stroke="' + only.color + '" stroke-width="' + STROKE + '"/>';
    } else {
      // Stack arcs via stroke-dasharray, offsetting each next slice with stroke-dashoffset.
      // Rotate -90deg so the first slice starts at 12 o'clock.
      var offset = 0;
      slices.forEach(function (s) {
        if (s.count <= 0) return;
        var len = (s.count / total) * C;
        // Tiny visual guard so a ~0% slice still shows; we already excluded count <= 0.
        var dash = Math.max(0.5, len);
        arcs += '<circle cx="' + (SIZE/2) + '" cy="' + (SIZE/2) + '" r="' + R + '" fill="none"' +
          ' stroke="' + s.color + '" stroke-width="' + STROKE + '"' +
          ' stroke-dasharray="' + dash.toFixed(2) + ' ' + (C - dash).toFixed(2) + '"' +
          ' stroke-dashoffset="' + (-offset).toFixed(2) + '"' +
          ' transform="rotate(-90 ' + (SIZE/2) + ' ' + (SIZE/2) + ')"' +
        '/>';
        offset += len;
      });
    }

    var donutSvg =
      '<svg class="w17-donut" viewBox="0 0 ' + SIZE + ' ' + SIZE + '" width="120" height="120" aria-hidden="true">' +
        arcs +
        '<text x="' + (SIZE/2) + '" y="' + (SIZE/2 - 2) + '" text-anchor="middle" dominant-baseline="middle" class="w17-donut-total">' + total + '</text>' +
        '<text x="' + (SIZE/2) + '" y="' + (SIZE/2 + 14) + '" text-anchor="middle" dominant-baseline="middle" class="w17-donut-sub">rosters</text>' +
      '</svg>';

    var legend = slices.map(function (s) {
      var pctText = total ? ((s.count / total) * 100).toFixed((s.count / total) * 100 >= 10 ? 0 : 1) + '%' : '—';
      var teamLogo = s.teamCode ? BB.teamLogoHTML(s.teamCode, { size: 14 }) : '<span style="display:inline-block;width:14px;height:14px;"></span>';
      var dim = s.count === 0 ? 'opacity:0.45;' : '';
      return '<li class="w17-donut-row" style="' + dim + '">' +
        '<span class="w17-donut-swatch" style="background:' + s.color + ';"></span>' +
        teamLogo +
        '<span class="w17-donut-label">' + escapeHtml(s.label) + '</span>' +
        '<span class="w17-donut-count">' + s.count + '</span>' +
        '<span class="w17-donut-pct">' + pctText + '</span>' +
      '</li>';
    }).join('');

    var empty = total === 0
      ? '<div style="color:var(--text-muted);font-size:11px;margin-top:8px;">No rosters with a game stack on this matchup.</div>'
      : '';

    return '<div class="card histogram-card slot-card">' +
      '<div class="histogram-head">' +
        '<span class="badge" style="background:var(--bg-elev-2);color:var(--text-dim);border-color:var(--border);">ANCHORS</span>' +
        '<span class="histogram-meta">how stacks split between sides</span>' +
      '</div>' +
      '<div class="w17-donut-wrap">' +
        donutSvg +
        '<ul class="w17-donut-legend">' + legend + '</ul>' +
      '</div>' +
      empty +
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

    var chartsRow = '<div class="w17-charts-grid">' +
      renderStackSizeHistogram(row.matchedRosters || []) +
      renderAnchorSplitDonut(row) +
    '</div>';

    contentEl.innerHTML =
      renderHero(row, totalRosters, totalFees) +
      chartsRow +
      '<div id="w17-rosters-slot">' + renderRostersTable(row) + '</div>' +
      renderAnchorPanel(row);
    bindPager();
  }

  init();
})();
