(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var contextEl = document.getElementById('context-filter');
  var rowCountEl = document.getElementById('row-count');

  var PAGE_SIZE = 25;
  var CONSTRUCTION_PAGE_SIZE = 10;
  var state = {
    sortKey: 'count',
    sortDir: 'desc',
    search: '',
    platform: '',
    tournament: '',
    context: '',
    // Which Roster Type row (if any) is currently expanded, and which
    // page (0-indexed) of its matching rosters we're showing.
    expandedType: null,
    expandedPage: 0,
    // Pagination for the Roster Constructions table.
    constructionPage: 0,
    // Which top-level tab is active: 'builds' | 'profile' | 'positions' | 'full-adp'.
    tab: 'profile',
    // When non-null, the rosters table below the Roster Builds chart is
    // filtered to rosters matching this archetype label.
    selectedBuild: null,
    selectedBuildPage: 0,
  };
  try {
    var savedTab = localStorage.getItem('bb_construction_tab');
    if (savedTab === 'builds' || savedTab === 'profile' || savedTab === 'positions' || savedTab === 'full-adp') {
      state.tab = savedTab;
    }
  } catch (e) {}

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function heatStyle(v, range) {
    if (range == null || v == null || isNaN(v)) return '';
    var t = (v - range.min) / (range.max - range.min);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var curved = t < 0.5
      ? 0.5 * Math.pow(2 * t, 1.4)
      : 1 - 0.5 * Math.pow(2 * (1 - t), 1.4);
    var hue = Math.round(curved * 120);
    return ' style="background: hsla(' + hue + ', 85%, 50%, 0.38);"';
  }
  function rangeFor(rows, key) {
    var min = Infinity, max = -Infinity;
    rows.forEach(function (r) {
      var v = r[key];
      if (v == null || isNaN(v)) return;
      if (v < min) min = v;
      if (v > max) max = v;
    });
    if (!isFinite(min) || !isFinite(max) || min === max) return null;
    return { min: min, max: max };
  }

  function getFilteredRosters() {
    var rosters = BB.loadRosters();
    return rosters.filter(function (r) {
      if (state.platform && r.platform !== state.platform) return false;
      if (state.tournament && r.tournament !== state.tournament) return false;
      if (state.context && !BB.rosterMatchesContext(r, state.context)) return false;
      return true;
    });
  }

  function populateFilters() {
    var rosters = BB.loadRosters();
    var plats = {}, tours = {};
    rosters.forEach(function (r) {
      plats[r.platform] = true;
      if (r.tournament) tours[r.tournament] = true;
    });
    platformEl.innerHTML = '<option value="">All platforms</option>' +
      Object.keys(plats).sort().map(function (p) { return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('');
    tourneyEl.innerHTML = '<option value="">All tournaments</option>' +
      Object.keys(tours).sort().map(function (t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'; }).join('');
    platformEl.value = state.platform;
    tourneyEl.value = state.tournament;
  }

  // renderRosterTypeRosters (the per-build expansion) was removed when
  // Roster Types went from clickable rows to a flat read-only chart.

  function renderRosterTypes(rosters) {
    var el = document.getElementById('roster-types');
    if (!el) return;
    if (!rosters.length) { el.innerHTML = ''; return; }
    // Fast first paint with sync metrics; CLV column patches in after
    // the async per-roster fetches resolve.
    var syncTypes = BB.computeRosterTypes(rosters);
    paintRosterTypes(el, syncTypes, null);
    BB.computeRosterTypeStats(rosters).then(function (types) {
      paintRosterTypes(el, types, true);
    }).catch(function () { /* keep the sync render in place */ });
  }

  function paintRosterTypes(el, types, withClv) {
    types = types.slice().sort(function (a, b) { return b.count - a.count; });
    var max = types.reduce(function (m, t) { return Math.max(m, t.count); }, 0);

    var rowsHtml = types.map(function (t) {
      var isEmpty = t.count === 0;
      var isSelected = state.selectedBuild === t.label && !isEmpty;
      var pctText = isEmpty ? '—' : BB.fmtPct(t.pct);
      var barPct = max ? (t.count / max * 100) : 0;
      var cls = 'rt-row' +
        (isEmpty ? ' is-empty' : ' is-clickable') +
        (isSelected ? ' is-selected' : '');

      var tooltipAttr = ' data-tooltip="' + escapeHtml(t.description).replace(/"/g, '&quot;') + '"';

      // Avg fee = total fees / count of matching rosters.
      var feeText = isEmpty ? '—' : BB.fmtMoney(t.avgFee);
      // Avg CLV — show "…" while loading, then populate. Color-coded
      // green (>0) / red (<0) once known.
      var clvVal = t.avgClv;
      var clvText, clvCls;
      if (!withClv) {
        clvText = '<span class="rt-clv-loading">…</span>';
        clvCls = 'rt-clv-num';
      } else if (clvVal == null || isEmpty) {
        clvText = '—';
        clvCls = 'rt-clv-num';
      } else {
        var sign = clvVal > 0 ? '+' : '';
        clvText = sign + clvVal.toFixed(1);
        clvCls = 'rt-clv-num ' + (clvVal > 0 ? 'clv-pos' : (clvVal < 0 ? 'clv-neg' : ''));
      }

      return '<div class="' + cls + '" data-type="' + escapeHtml(t.label) + '">' +
        '<div class="rt-row-main">' +
          '<div class="rt-label-block">' +
            '<span class="rt-label">' + escapeHtml(t.label) +
              ' <span class="tooltip-trigger rt-info"' + tooltipAttr + '>' +
                '<span class="info-mark">ⓘ</span>' +
              '</span>' +
            '</span>' +
          '</div>' +
          '<div class="rt-bar"><div class="rt-bar-fill" style="width:' + barPct.toFixed(1) + '%"></div></div>' +
          '<div class="rt-stats">' +
            '<span class="rt-count-num" title="rosters matching this build">' + t.count + '</span>' +
            '<span class="rt-pct-num">' + pctText + '</span>' +
            '<span class="rt-fee-num" title="avg entry fee on matching rosters">' + feeText + '</span>' +
            '<span class="' + clvCls + '" title="avg CLV per matching draft (Superflex excluded)">' + clvText + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="roster-types-list">' +
        '<div class="rt-row rt-header">' +
          '<div class="rt-row-main">' +
            '<div class="rt-label-block"><span class="rt-col-label">Build</span></div>' +
            '<div class="rt-bar"></div>' +
            '<div class="rt-stats">' +
              '<span class="rt-col-label">Rosters</span>' +
              '<span class="rt-col-label">%</span>' +
              '<span class="rt-col-label">Avg fee</span>' +
              '<span class="rt-col-label">Avg CLV</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        rowsHtml +
      '</div>';

    // Click a build to toggle the rosters filter below.
    el.querySelectorAll('.rt-row.is-clickable').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.rt-info')) return;
        var label = row.getAttribute('data-type');
        if (state.selectedBuild === label) {
          state.selectedBuild = null;
        } else {
          state.selectedBuild = label;
          state.selectedBuildPage = 0;
        }
        // Re-render the chart to flip selection highlight, then refresh
        // the table below.
        renderRosterTypes(getFilteredRosters());
        renderBuildRosters(getFilteredRosters());
      });
    });

    // Refresh the table below to match current selection.
    renderBuildRosters(getFilteredRosters());
  }

  var BUILD_ROSTERS_PAGE_SIZE = 10;

  function renderBuildRosters(rosters) {
    var el = document.getElementById('build-rosters');
    if (!el) return;
    if (!state.selectedBuild || !rosters.length) { el.innerHTML = ''; return; }

    var label = state.selectedBuild;
    var matching = rosters.filter(function (r) {
      return BB.classifyRoster(r).indexOf(label) !== -1;
    });
    if (!matching.length) {
      el.innerHTML =
        '<div class="build-rosters-header">' +
          '<div><strong>' + escapeHtml(label) + '</strong>' +
            '<span style="color:var(--text-muted);margin-left:8px;">no matching rosters in the current view</span>' +
          '</div>' +
          '<button type="button" class="rt-page-btn" id="build-clear">× Clear filter</button>' +
        '</div>';
      var clearBtn = document.getElementById('build-clear');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        state.selectedBuild = null;
        renderRosterTypes(getFilteredRosters());
      });
      return;
    }

    // Sort: most recent first.
    matching = matching.slice().sort(function (a, b) {
      var da = a.draftedAt || ''; var db = b.draftedAt || '';
      return db.localeCompare(da);
    });
    var totalPages = Math.max(1, Math.ceil(matching.length / BUILD_ROSTERS_PAGE_SIZE));
    if (state.selectedBuildPage >= totalPages) state.selectedBuildPage = totalPages - 1;
    if (state.selectedBuildPage < 0) state.selectedBuildPage = 0;
    var start = state.selectedBuildPage * BUILD_ROSTERS_PAGE_SIZE;
    var end = Math.min(start + BUILD_ROSTERS_PAGE_SIZE, matching.length);
    var pageRows = matching.slice(start, end);

    function dateText(r) {
      if (!r.draftedAt) return '—';
      var d = new Date(r.draftedAt);
      if (isNaN(d.getTime())) return '—';
      return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(-2);
    }
    function pickAtRound(r, n) {
      return (r.picks || []).find(function (p) { return p.round === n; });
    }
    function pickCell(p) {
      if (!p) return '—';
      var logo = p.team ? BB.teamLogoHTML(p.team, { size: 14 }) : '';
      var badge = p.position ? '<span class="badge pos-' + escapeHtml(p.position) + '" style="font-size:9px;padding:1px 4px;">' + escapeHtml(p.position) + '</span>' : '';
      var name = '<a href="player.html?name=' + encodeURIComponent(p.player) + '">' + escapeHtml(p.player) + '</a>';
      return '<span class="build-pick-cell">' + logo + badge + name + '</span>';
    }

    var tableRows = pageRows.map(function (r) {
      var p1 = pickAtRound(r, 1);
      var p2 = pickAtRound(r, 2);
      var p3 = pickAtRound(r, 3);
      var slot = p1 && p1.pickNumber ? p1.pickNumber : '—';
      var fee = (r.entryFee != null) ? BB.fmtMoney(r.entryFee) : '—';
      var href = 'rosters.html?id=' + encodeURIComponent(r.rosterId);
      return '<tr data-roster="' + escapeHtml(r.rosterId) + '">' +
        '<td>' + escapeHtml(r.tournament || '(unknown)') + '</td>' +
        '<td>' + (BB.platformLogoHTML(r.platform, { size: 14 }) || escapeHtml(r.platform || '')) + '</td>' +
        '<td>' + escapeHtml(dateText(r)) + '</td>' +
        '<td class="num">' + slot + '</td>' +
        '<td>' + pickCell(p1) + '</td>' +
        '<td>' + pickCell(p2) + '</td>' +
        '<td>' + pickCell(p3) + '</td>' +
        '<td class="num">' + fee + '</td>' +
        '<td class="num build-clv-cell">…</td>' +
        '<td><a href="' + href + '" style="color:var(--accent);">View →</a></td>' +
      '</tr>';
    }).join('');

    var head = '<thead><tr>' +
      '<th>Tournament</th>' +
      '<th>Platform</th>' +
      '<th>Date</th>' +
      '<th class="num">Slot</th>' +
      '<th>R1</th>' +
      '<th>R2</th>' +
      '<th>R3</th>' +
      '<th class="num">Fee</th>' +
      '<th class="num">CLV</th>' +
      '<th></th>' +
    '</tr></thead>';

    var prevDisabled = state.selectedBuildPage === 0;
    var nextDisabled = state.selectedBuildPage >= totalPages - 1;
    var pagerHtml = matching.length > BUILD_ROSTERS_PAGE_SIZE
      ? '<div class="rt-pager">' +
          '<button type="button" class="rt-page-btn" id="build-prev"' + (prevDisabled ? ' disabled' : '') + '>‹ Prev</button>' +
          '<span class="rt-page-info">Showing ' + (start + 1) + '–' + end + ' of ' + matching.length + '</span>' +
          '<button type="button" class="rt-page-btn" id="build-next"' + (nextDisabled ? ' disabled' : '') + '>Next ›</button>' +
        '</div>'
      : '';

    el.innerHTML =
      '<div class="build-rosters-header">' +
        '<div><strong>' + escapeHtml(label) + '</strong>' +
          '<span style="color:var(--text-muted);margin-left:8px;">' + matching.length + ' matching roster' + (matching.length === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<button type="button" class="rt-page-btn" id="build-clear">× Clear filter</button>' +
      '</div>' +
      '<div class="tbl-build-rosters"><table class="data">' + head + '<tbody>' + tableRows + '</tbody></table></div>' +
      pagerHtml;

    document.getElementById('build-clear').addEventListener('click', function () {
      state.selectedBuild = null;
      renderRosterTypes(getFilteredRosters());
    });
    var prevBtn = document.getElementById('build-prev');
    var nextBtn = document.getElementById('build-next');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (prevBtn.disabled) return;
      state.selectedBuildPage--;
      renderBuildRosters(getFilteredRosters());
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (nextBtn.disabled) return;
      state.selectedBuildPage++;
      renderBuildRosters(getFilteredRosters());
    });

    // Patch CLV values in async (per-roster fetch, but cached).
    pageRows.forEach(function (r) {
      var rowEl = el.querySelector('tr[data-roster="' + cssSafe(r.rosterId) + '"]');
      if (!rowEl) return;
      var cell = rowEl.querySelector('.build-clv-cell');
      if (!cell) return;
      if (BB.rosterIsSuperflex && BB.rosterIsSuperflex(r)) {
        cell.textContent = '—';
        cell.title = 'Superflex roster — excluded from CLV calc';
        return;
      }
      BB.rosterClvRtv(r).then(function (v) {
        var clv = v && v.clv && v.clv.totalADP;
        if (clv == null) { cell.textContent = '—'; return; }
        var sign = clv > 0 ? '+' : '';
        cell.textContent = sign + clv.toFixed(1);
        cell.classList.add(clv > 0 ? 'clv-pos' : (clv < 0 ? 'clv-neg' : ''));
      }).catch(function () { cell.textContent = '—'; });
    });
  }

  function cssSafe(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\' + c; });
  }

  // Top-12 ADP exposure — fixed list of the 12 highest-ranked players by
  // current 1-QB market ADP (Underdog). For each, show how many times
  // you've drafted them in round 1 (the bar) and how many times across
  // all rounds (smaller sub-count). Superflex rosters are excluded because
  // their round-1 shape is unrelated to the 1-QB ADP list.
  function renderRound1Frequency(rosters) {
    if (!rosters || !rosters.length) return '';
    var eligible = rosters.filter(function (r) {
      return !(BB.rosterIsSuperflex && BB.rosterIsSuperflex(r));
    });
    var superflexExcluded = rosters.length - eligible.length;
    if (!eligible.length) return '';

    // 12 highest-ranked players by UD ADP (ascending = lowest ADP first).
    var adp = (window.BB_DATA && window.BB_DATA.adp) || [];
    var top12 = adp
      .filter(function (p) { return p.ud != null; })
      .slice()
      .sort(function (a, b) { return a.ud - b.ud; })
      .slice(0, 12);
    if (!top12.length) return '';

    // For each top-12 player, count R1 picks and total picks across
    // eligible (non-SF) rosters.
    var normalize = (window.BB_DATA && window.BB_DATA.normalizeName)
      ? window.BB_DATA.normalizeName
      : function (s) { return String(s || '').toLowerCase().trim(); };
    var stats = {};
    top12.forEach(function (p) { stats[normalize(p.name)] = { r1: 0, total: 0 }; });
    eligible.forEach(function (r) {
      (r.picks || []).forEach(function (p) {
        if (!p.player) return;
        var k = normalize(p.player);
        if (!stats[k]) return;
        stats[k].total++;
        if (p.round === 1) stats[k].r1++;
      });
    });

    var rows = top12.map(function (p) {
      var s = stats[normalize(p.name)] || { r1: 0, total: 0 };
      return {
        player: p.name, pos: p.pos || '', team: p.team || '',
        ud: p.ud,
        total: s.total,
      };
    });
    var max = rows.reduce(function (m, r) { return Math.max(m, r.total); }, 0);

    var rowsHtml = rows.map(function (r) {
      var barW = max ? Math.max(2, Math.round((r.total / max) * 100)) : 0;
      var logo = BB.teamLogoHTML(r.team, { size: 14 });
      var posBadge = r.pos ? '<span class="badge pos-' + escapeHtml(r.pos) + '" style="font-size:9px;padding:1px 4px;">' + escapeHtml(r.pos) + '</span>' : '';
      var playerHref = 'player.html?name=' + encodeURIComponent(r.player);
      var title = r.player + ' (ADP ' + r.ud + ') — drafted ' + r.total + ' time' + (r.total === 1 ? '' : 's') + ' across all rounds';
      return '<div class="te-row r1-row" title="' + escapeHtml(title) + '">' +
        '<div class="te-team r1-team">' + logo + posBadge +
          '<a class="te-code r1-name" href="' + playerHref + '">' + escapeHtml(r.player) + '</a>' +
        '</div>' +
        '<div class="te-bar-wrap"><div class="te-bar" style="width:' + barW + '%"></div></div>' +
        '<div class="te-count">' + r.total + '</div>' +
      '</div>';
    }).join('');

    var metaText = 'top 12 players by current UD ADP — total times drafted' +
      (superflexExcluded ? ' · ' + superflexExcluded + ' Superflex roster' + (superflexExcluded === 1 ? '' : 's') + ' excluded' : '');
    return '<div class="card histogram-card">' +
      '<div class="histogram-head">' +
        '<span class="badge" style="background:var(--bg-elev-2);color:var(--text-dim);border-color:var(--border);">TOP 12 ADP</span>' +
        '<span class="histogram-meta">' + metaText + '</span>' +
      '</div>' +
      '<div class="team-exposure-list r1-list">' + rowsHtml + '</div>' +
    '</div>';
  }

  // Full-ADP exposure — top 200 players by current UD ADP rendered as a
  // standard data table (like the other tables on the site) with a bar
  // graph inside the Drafts column.
  function renderFullAdp(rosters) {
    var el = document.getElementById('full-adp');
    if (!el) return;
    if (!rosters || !rosters.length) { el.innerHTML = ''; return; }
    var eligible = rosters.filter(function (r) {
      return !(BB.rosterIsSuperflex && BB.rosterIsSuperflex(r));
    });
    var superflexExcluded = rosters.length - eligible.length;
    if (!eligible.length) { el.innerHTML = ''; return; }

    var adp = (window.BB_DATA && window.BB_DATA.adp) || [];
    var top200 = adp
      .filter(function (p) { return p.ud != null; })
      .slice()
      .sort(function (a, b) { return a.ud - b.ud; })
      .slice(0, 200);
    if (!top200.length) { el.innerHTML = ''; return; }

    var normalize = (window.BB_DATA && window.BB_DATA.normalizeName)
      ? window.BB_DATA.normalizeName
      : function (s) { return String(s || '').toLowerCase().trim(); };

    var totalByNorm = {};
    top200.forEach(function (p) { totalByNorm[normalize(p.name)] = 0; });
    eligible.forEach(function (r) {
      (r.picks || []).forEach(function (p) {
        if (!p.player) return;
        var k = normalize(p.player);
        if (totalByNorm[k] != null) totalByNorm[k]++;
      });
    });

    var rows = top200.map(function (p, ix) {
      return {
        rank: ix + 1,
        player: p.name, pos: p.pos || '', team: p.team || '',
        ud: p.ud,
        total: totalByNorm[normalize(p.name)] || 0,
      };
    });
    var max = rows.reduce(function (m, r) { return Math.max(m, r.total); }, 0);

    var head = '<thead><tr>' +
      '<th class="num">#</th>' +
      '<th>Player</th>' +
      '<th>Pos</th>' +
      '<th>Team</th>' +
      '<th class="num">ADP</th>' +
      '<th class="full-adp-bar-col">Drafts</th>' +
      '<th class="num">Count</th>' +
    '</tr></thead>';

    var body = rows.map(function (r) {
      var barW = max ? Math.max(2, Math.round((r.total / max) * 100)) : 0;
      var logo = BB.teamLogoHTML(r.team, { size: 16 });
      var posBadge = r.pos
        ? '<span class="badge pos-' + escapeHtml(r.pos) + '">' + escapeHtml(r.pos) + '</span>'
        : '—';
      var playerHref = 'player.html?name=' + encodeURIComponent(r.player);
      var teamHref = r.team ? 'team.html?code=' + encodeURIComponent(r.team) : '#';
      var playerCellHtml =
        '<span class="player-cell" data-pos="' + escapeHtml(r.pos || '') + '">' +
          logo +
          '<span class="player-name"><a href="' + playerHref + '">' + escapeHtml(r.player) + '</a></span>' +
        '</span>';
      var teamCellHtml = r.team
        ? '<a class="stack-team" href="' + teamHref + '">' + escapeHtml(r.team) + '</a>'
        : '—';
      var barHtml = '<div class="te-bar-wrap full-adp-bar-wrap"><div class="te-bar" style="width:' + barW + '%"></div></div>';
      return '<tr>' +
        '<td class="num" style="color:var(--text-muted);">' + r.rank + '</td>' +
        '<td>' + playerCellHtml + '</td>' +
        '<td>' + posBadge + '</td>' +
        '<td>' + teamCellHtml + '</td>' +
        '<td class="num">' + r.ud.toFixed(1) + '</td>' +
        '<td class="full-adp-bar-col">' + barHtml + '</td>' +
        '<td class="num">' + r.total + '</td>' +
      '</tr>';
    }).join('');

    var footNote = superflexExcluded
      ? '<p style="color:var(--text-muted);font-size:11px;margin:6px 2px 0;">' +
          superflexExcluded + ' Superflex roster' + (superflexExcluded === 1 ? '' : 's') +
          ' excluded — top-200 ADP is 1-QB only.</p>'
      : '';

    el.innerHTML =
      '<div class="tbl-full-adp"><table class="data">' + head + '<tbody>' + body + '</tbody></table></div>' +
      footNote;
  }

  // Horizontal team-exposure bar chart paired with the draft-slot histogram.
  // One row per NFL team that appears on your rosters, sorted by total
  // picks desc. Each bar is broken into QB / RB / WR / TE segments so you
  // can see the position mix at a glance.
  function renderTeamExposure(rosters) {
    if (!rosters || !rosters.length) return '';
    // Per-team totals split by position.
    var POSES = ['QB', 'RB', 'WR', 'TE'];
    var byTeam = {};
    rosters.forEach(function (r) {
      (r.picks || []).forEach(function (p) {
        if (!p.team) return;
        if (!byTeam[p.team]) {
          byTeam[p.team] = { team: p.team, total: 0, QB: 0, RB: 0, WR: 0, TE: 0, other: 0 };
        }
        var t = byTeam[p.team];
        t.total++;
        if (p.position && POSES.indexOf(p.position) !== -1) t[p.position]++;
        else t.other++;
      });
    });
    var teams = Object.keys(byTeam).map(function (k) { return byTeam[k]; })
      .filter(function (t) { return t.total > 0; });
    if (!teams.length) return '';
    teams.sort(function (a, b) { return b.total - a.total; });
    var max = teams[0].total;

    var rows = teams.map(function (t) {
      var pct = max ? (t.total / max) : 0;
      var barW = Math.max(2, Math.round(pct * 100));
      var logo = BB.teamLogoHTML(t.team, { size: 14 });

      // Build a flex strip of position segments inside this team's bar.
      var segments = POSES.map(function (pos) {
        if (!t[pos]) return '';
        var segPct = (t[pos] / t.total) * 100;
        var title = t[pos] + ' ' + pos + (t[pos] === 1 ? '' : 's') + ' from ' + t.team;
        return '<span class="te-bar-seg seg-' + pos + '" style="flex:' + t[pos] + ' 0 0;" title="' + escapeHtml(title) + '"></span>';
      }).join('');
      if (t.other) {
        segments += '<span class="te-bar-seg seg-other" style="flex:' + t.other + ' 0 0;" title="' + t.other + ' other"></span>';
      }

      var rowTitle = t.total + ' picks from ' + t.team +
        ' — QB ' + t.QB + ', RB ' + t.RB + ', WR ' + t.WR + ', TE ' + t.TE;
      return '<div class="te-row" title="' + escapeHtml(rowTitle) + '">' +
        '<div class="te-team">' + logo + '<a class="te-code" href="team.html?code=' + encodeURIComponent(t.team) + '">' + escapeHtml(t.team) + '</a></div>' +
        '<div class="te-bar-wrap" style="width:' + barW + '%">' +
          '<div class="te-bar-strip">' + segments + '</div>' +
        '</div>' +
        '<div class="te-count">' + t.total + '</div>' +
      '</div>';
    }).join('');

    var legend =
      '<div class="te-legend">' +
        POSES.map(function (p) {
          return '<span class="te-legend-item"><span class="te-legend-swatch seg-' + p + '"></span>' + p + '</span>';
        }).join('') +
      '</div>';

    return '<div class="card histogram-card">' +
      '<div class="histogram-head">' +
        '<span class="badge" style="background:var(--bg-elev-2);color:var(--text-dim);border-color:var(--border);">TEAMS</span>' +
        '<span class="histogram-meta">' + teams.length + ' NFL team' + (teams.length === 1 ? '' : 's') + ' · picks split by position</span>' +
      '</div>' +
      legend +
      '<div class="team-exposure-list">' + rows + '</div>' +
    '</div>';
  }

  function renderDraftSlots(rosters) {
    var el = document.getElementById('draft-slots');
    if (!el) return;
    if (!rosters.length) { el.innerHTML = ''; return; }
    var d = BB.computeDraftSlotDistribution(rosters);
    if (!d.totalRosters) { el.innerHTML = ''; return; }
    var max = 0;
    d.slots.forEach(function (s) { if (s.count > max) max = s.count; });
    var bars = d.slots.map(function (s) {
      var pct = max ? s.count / max : 0;
      var barH = Math.max(2, Math.round(pct * 75));
      var alpha = s.count ? 0.85 : 0.15;
      var shareText = (s.pct * 100).toFixed(s.pct * 100 >= 10 ? 0 : 1) + '%';
      var title = s.count + ' roster' + (s.count === 1 ? '' : 's') + ' drafted from slot ' + s.slot +
        ' (' + shareText + ' of ' + d.totalRosters + ')';
      return '<div class="hist-col" title="' + title + '">' +
        '<div class="hist-num">' + s.count + '</div>' +
        '<div class="hist-bar" style="height:' + barH + 'px;background:var(--accent);opacity:' + alpha + ';"></div>' +
        '<div class="hist-x">' + s.slot + '</div>' +
      '</div>';
    }).join('');
    var slotCard =
      '<div class="card histogram-card slot-card">' +
        '<div class="histogram-head">' +
          '<span class="badge" style="background:var(--bg-elev-2);color:var(--text-dim);border-color:var(--border);">SLOT</span>' +
          '<span class="histogram-meta">mode ' + (d.mode != null ? d.mode : '—') +
            ' · ' + d.totalRosters + ' rosters · 1 = early / ' + d.maxSize + ' = late</span>' +
        '</div>' +
        '<div class="histogram-bars">' + bars + '</div>' +
        '<div class="histogram-axis-label">Draft slot (round 1 pick #)</div>' +
      '</div>';

    var round1Card = renderRound1Frequency(rosters);
    var teamCard = renderTeamExposure(rosters);
    var html =
      '<div class="construction-charts-grid">' +
        '<div class="construction-charts-col">' + slotCard + round1Card + '</div>' +
        teamCard +
      '</div>';
    el.innerHTML = html;
  }

  function renderHistograms(rosters) {
    var histEl = document.getElementById('histograms');
    if (!histEl) return;
    if (!rosters.length) { histEl.innerHTML = ''; return; }
    var hists = BB.computePositionHistograms(rosters);
    var html = '<div class="histogram-grid">' + ['QB', 'RB', 'WR', 'TE'].map(function (pos) {
      var h = hists[pos];
      var max = 0;
      h.buckets.forEach(function (b) { if (b.rosters > max) max = b.rosters; });
      var bars = h.buckets.map(function (b) {
        var pct = max ? (b.rosters / max) : 0;
        var barH = Math.max(2, Math.round(pct * 75));
        var alpha = b.rosters ? 0.85 : 0.15;
        var pctOfTotal = h.totalRosters ? (b.rosters / h.totalRosters * 100) : 0;
        var pctText = h.totalRosters ? pctOfTotal.toFixed(pctOfTotal >= 10 ? 0 : 1) + '%' : '';
        // Top label = % of total (the question users actually read). Raw
        // roster count moved to the hover tooltip.
        return '<div class="hist-col" title="' + b.rosters + ' rosters drafted ' + b.count + ' ' + pos + 's (' + pctText + ' of ' + h.totalRosters + ')">' +
          '<div class="hist-num">' + (b.rosters ? pctText : '0%') + '</div>' +
          '<div class="hist-bar" style="height:' + barH + 'px;background:var(--pos-' + pos.toLowerCase() + ');opacity:' + alpha + ';"></div>' +
          '<div class="hist-x">' + b.count + '</div>' +
        '</div>';
      }).join('');
      var meanStr = h.mean.toFixed(2).replace(/\.00$/, '');
      return '<div class="card histogram-card">' +
        '<div class="histogram-head">' +
          '<span class="badge pos-' + pos + '">' + pos + '</span>' +
          '<span class="histogram-meta">avg ' + meanStr + ' · mode ' + (h.mode != null ? h.mode : '—') + ' · ' + h.total + ' picks</span>' +
        '</div>' +
        '<div class="histogram-bars">' + (bars || '<span style="color:var(--text-muted);font-size:11px;">no picks</span>') + '</div>' +
        '<div class="histogram-axis-label"># of ' + pos + 's drafted per roster</div>' +
      '</div>';
    }).join('') + '</div>';
    histEl.innerHTML = html;
  }

  function render() {
    var rosters = getFilteredRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      renderRosterTypes([]);
      renderHistograms([]);
      renderDraftSlots([]);
      renderFullAdp([]);
      return;
    }

    renderRosterTypes(rosters);
    renderHistograms(rosters);
    renderDraftSlots(rosters);
    renderFullAdp(rosters);
    var rows = BB.computeRosterConstructions(rosters);
    var s = state.search.toLowerCase().trim();
    if (s) rows = rows.filter(function (r) { return r.key.indexOf(s) !== -1; });

    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'key') {
        av = a.key; bv = b.key;
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      av = a[key]; bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });

    rowCountEl.textContent = rows.length.toLocaleString();

    // Clamp page within bounds whenever the result set changes.
    var totalPages = Math.max(1, Math.ceil(rows.length / CONSTRUCTION_PAGE_SIZE));
    if (state.constructionPage >= totalPages) state.constructionPage = totalPages - 1;
    if (state.constructionPage < 0) state.constructionPage = 0;
    var cPage = state.constructionPage;
    var cStart = cPage * CONSTRUCTION_PAGE_SIZE;
    var cEnd = Math.min(cStart + CONSTRUCTION_PAGE_SIZE, rows.length);
    var pageRows = rows.slice(cStart, cEnd);

    var COLS = [
      { key: 'key',   label: 'Construction',  sortable: true, required: true },
      { key: 'count', label: '# Rosters',     sortable: true, num: true },
      { key: 'pct',   label: '% of Rosters',  sortable: true, num: true },
    ];

    if (!state.colPicker) {
      state.colPicker = BB.makeColumnPicker({
        storageKey: 'bb_cols_construction_v1',
        scopeClass: 'tbl-construction',
        columns: COLS,
      });
    }

    var head = '<thead><tr>' + COLS.map(function (c) {
      var ind = c.key === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : '');
      return '<th class="' + classes + '" data-key="' + c.key + '" data-col="' + c.key + '">' +
        c.label + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var rPct = rangeFor(rows, 'pct');

    var body = '<tbody>' + pageRows.map(function (r) {
      var keyCell =
        '<div class="construction-key">' +
          '<code class="stack-combo construction-code">' + escapeHtml(r.key) + '</code>' +
          '<span class="construction-sub">QB-RB-WR-TE · ' + r.totalPicks + ' picks</span>' +
        '</div>';
      return '<tr>' +
        '<td data-col="key">' + keyCell + '</td>' +
        '<td class="num" data-col="count">' + r.count + '</td>' +
        '<td class="num" data-col="pct"' + heatStyle(r.pct, rPct) + '>' + BB.fmtPct(r.pct) + '</td>' +
        '</tr>';
    }).join('') + '</tbody>';

    var prevDisabled = cPage === 0;
    var nextDisabled = cPage >= totalPages - 1;
    var pagerHtml = rows.length > CONSTRUCTION_PAGE_SIZE
      ? '<div class="rt-pager construction-pager">' +
          '<button type="button" class="rt-page-btn" id="construction-prev"' + (prevDisabled ? ' disabled' : '') + '>‹ Prev</button>' +
          '<span class="rt-page-info">Showing ' + (cStart + 1) + '–' + cEnd + ' of ' + rows.length + '</span>' +
          '<button type="button" class="rt-page-btn" id="construction-next"' + (nextDisabled ? ' disabled' : '') + '>Next ›</button>' +
        '</div>'
      : '';

    contentEl.innerHTML =
      '<div class="table-toolbar">' + state.colPicker.renderButton() + '</div>' +
      '<div class="tbl-construction"><table class="data construction-table">' + head + body + '</table></div>' +
      pagerHtml;
    state.colPicker.bind(contentEl);

    contentEl.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = k === 'key' ? 'asc' : 'desc'; }
        state.constructionPage = 0;
        render();
      });
    });

    var prevBtn = document.getElementById('construction-prev');
    var nextBtn = document.getElementById('construction-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { state.constructionPage -= 1; render(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { state.constructionPage += 1; render(); });
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; state.constructionPage = 0; render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; state.constructionPage = 0; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; state.constructionPage = 0; render(); });
  if (contextEl) contextEl.addEventListener('change', function (e) { state.context = e.target.value; state.constructionPage = 0; render(); });

  // Tab switching — show only the active pane and persist the choice.
  function applyTab() {
    var toggle = document.getElementById('construction-tabs');
    if (toggle) {
      toggle.querySelectorAll('button[data-tab]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
      });
    }
    document.querySelectorAll('[data-tab-pane]').forEach(function (pane) {
      var match = pane.getAttribute('data-tab-pane') === state.tab;
      pane.hidden = !match;
    });
    // The "shapes" counter at the right of the filter bar is meaningful
    // only for the Roster Constructions section (under Position Counts).
    // Hide it on other tabs.
    var rowCountLabel = rowCountEl && rowCountEl.parentElement;
    if (rowCountLabel) rowCountLabel.style.visibility = state.tab === 'positions' ? '' : 'hidden';
    // The construction-search input only filters the constructions table.
    if (searchEl) searchEl.parentElement.style.visibility = state.tab === 'positions' ? '' : 'hidden';
  }
  var tabsEl = document.getElementById('construction-tabs');
  if (tabsEl) {
    tabsEl.querySelectorAll('button[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.tab = btn.getAttribute('data-tab');
        try { localStorage.setItem('bb_construction_tab', state.tab); } catch (e) {}
        applyTab();
      });
    });
  }
  applyTab();

  populateFilters();
  render();
})();
