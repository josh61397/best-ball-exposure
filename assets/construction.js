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
  };

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

  function renderRosterTypeRosters(label, rosters) {
    var matching = rosters.filter(function (r) {
      return BB.classifyRoster(r).indexOf(label) !== -1;
    });
    if (!matching.length) {
      return '<div class="rt-rosters"><div class="rt-empty">No matching rosters in the current view.</div></div>';
    }
    // Most recent first
    matching.sort(function (a, b) {
      var da = a.draftedAt || '';
      var db = b.draftedAt || '';
      return db.localeCompare(da);
    });

    var totalPages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    var page = state.expandedPage;
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;
    state.expandedPage = page;
    var start = page * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, matching.length);
    var displayed = matching.slice(start, end);

    var rows = displayed.map(function (r) {
      var dateText = '—';
      if (r.draftedAt) {
        var d = new Date(r.draftedAt);
        if (!isNaN(d.getTime())) dateText = (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(-2);
      }
      var href = 'rosters.html?id=' + encodeURIComponent(r.rosterId);
      var fee = (r.entryFee != null) ? BB.fmtMoney(r.entryFee) : '—';
      var pos = BB.rosterDraftPosition ? BB.rosterDraftPosition(r) : null;
      return '<a class="rt-roster-item" href="' + escapeHtml(href) + '">' +
        BB.platformLogoHTML(r.platform, { size: 14 }) +
        '<span class="rt-roster-name">' + escapeHtml(r.tournament || '(unknown)') + '</span>' +
        '<span class="rt-roster-meta">' +
          '<span>' + escapeHtml(dateText) + '</span>' +
          (pos != null ? '<span>pick&nbsp;' + pos + '</span>' : '') +
          '<span>' + fee + '</span>' +
        '</span>' +
        '</a>';
    }).join('');

    var pagerHtml = '';
    if (matching.length > PAGE_SIZE) {
      var prevDisabled = page === 0;
      var nextDisabled = page >= totalPages - 1;
      pagerHtml =
        '<div class="rt-pager" data-stop="1">' +
          '<button type="button" class="rt-page-btn" data-page-act="prev"' + (prevDisabled ? ' disabled' : '') + '>‹ Prev</button>' +
          '<span class="rt-page-info">Showing ' + (start + 1) + '-' + end + ' of ' + matching.length + ' · page ' + (page + 1) + ' of ' + totalPages + '</span>' +
          '<button type="button" class="rt-page-btn" data-page-act="next"' + (nextDisabled ? ' disabled' : '') + '>Next ›</button>' +
        '</div>';
    }
    return '<div class="rt-rosters">' + rows + '</div>' + pagerHtml;
  }

  function renderRosterTypes(rosters) {
    var el = document.getElementById('roster-types');
    if (!el) return;
    if (!rosters.length) { el.innerHTML = ''; return; }
    var types = BB.computeRosterTypes(rosters);
    // Sort by count desc so most common archetypes float to the top.
    types.sort(function (a, b) { return b.count - a.count; });
    var max = types.reduce(function (m, t) { return Math.max(m, t.count); }, 0);

    var rowsHtml = types.map(function (t) {
      var isEmpty = t.count === 0;
      var isExpanded = !isEmpty && state.expandedType === t.label;
      var pctText = isEmpty ? '—' : BB.fmtPct(t.pct);
      var barPct = max ? (t.count / max * 100) : 0;
      var chevronChar = isExpanded ? '▾' : (isEmpty ? '' : '▸');
      var cls = 'rt-row' +
        (isEmpty ? ' is-empty' : ' is-clickable') +
        (isExpanded ? ' is-expanded' : '');

      var tooltipAttr = ' data-tooltip="' + escapeHtml(t.description).replace(/"/g, '&quot;') + '"';
      var main =
        '<div class="rt-row-main">' +
          '<div class="rt-label-block">' +
            '<span class="rt-chevron">' + chevronChar + '</span>' +
            '<div class="rt-label-text">' +
              '<span class="rt-label">' + escapeHtml(t.label) +
                ' <span class="tooltip-trigger rt-info"' + tooltipAttr + '>' +
                  '<span class="info-mark">ⓘ</span>' +
                '</span>' +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="rt-bar"><div class="rt-bar-fill" style="width:' + barPct.toFixed(1) + '%"></div></div>' +
          '<div class="rt-stats">' +
            '<span class="rt-count-num">' + t.count + '</span>' +
            '<span class="rt-pct-num">' + pctText + '</span>' +
          '</div>' +
        '</div>';

      var expansion = isExpanded ? renderRosterTypeRosters(t.label, rosters) : '';

      return '<div class="' + cls + '" data-type="' + escapeHtml(t.label) + '">' + main + expansion + '</div>';
    }).join('');

    el.innerHTML = '<div class="roster-types-list">' + rowsHtml + '</div>';

    el.querySelectorAll('.rt-row.is-clickable').forEach(function (row) {
      row.addEventListener('click', function (e) {
        // Let clicks on inner links go through (they navigate to roster detail).
        if (e.target.closest('a.rt-roster-item')) return;
        // Pager buttons handle their own clicks — don't toggle on those.
        if (e.target.closest('.rt-pager')) return;
        // Info icon shouldn't toggle the row — only its hover tooltip.
        if (e.target.closest('.rt-info')) return;
        var label = row.getAttribute('data-type');
        if (state.expandedType === label) {
          state.expandedType = null;
        } else {
          state.expandedType = label;
          state.expandedPage = 0; // reset paging when opening a new type
        }
        renderRosterTypes(getFilteredRosters());
      });
    });

    el.querySelectorAll('.rt-page-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (btn.disabled) return;
        var act = btn.getAttribute('data-page-act');
        if (act === 'prev') state.expandedPage -= 1;
        else if (act === 'next') state.expandedPage += 1;
        renderRosterTypes(getFilteredRosters());
      });
    });
  }

  // Round-1 pick frequency — top 12 players you've taken with a round-1 pick
  // across all 1-QB rosters. Superflex drafts are excluded because their
  // round-1 picks have a totally different positional shape (QBs spike).
  function renderRound1Frequency(rosters) {
    if (!rosters || !rosters.length) return '';
    var eligible = rosters.filter(function (r) {
      return !(BB.rosterIsSuperflex && BB.rosterIsSuperflex(r));
    });
    var superflexExcluded = rosters.length - eligible.length;
    if (!eligible.length) return '';
    var counts = {};
    eligible.forEach(function (r) {
      (r.picks || []).forEach(function (p) {
        if (p.round !== 1 || !p.player) return;
        var key = p.player;
        if (!counts[key]) counts[key] = { player: p.player, team: p.team || '', pos: p.position || '', count: 0 };
        counts[key].count++;
      });
    });
    var rows = Object.keys(counts).map(function (k) { return counts[k]; })
      .sort(function (a, b) { return b.count - a.count; });
    if (!rows.length) return '';
    var max = rows[0].count;
    var totalRosters = eligible.length;

    var rowsHtml = rows.map(function (r) {
      var barW = max ? Math.max(2, Math.round((r.count / max) * 100)) : 0;
      var pct = totalRosters ? (r.count / totalRosters * 100).toFixed(r.count / totalRosters * 100 >= 10 ? 0 : 1) + '%' : '';
      var logo = BB.teamLogoHTML(r.team, { size: 14 });
      var posBadge = r.pos ? '<span class="badge pos-' + escapeHtml(r.pos) + '" style="font-size:9px;padding:1px 4px;">' + escapeHtml(r.pos) + '</span>' : '';
      var playerHref = 'player.html?name=' + encodeURIComponent(r.player);
      var title = r.player + ' — round 1 in ' + r.count + ' of ' + totalRosters + ' rosters (' + pct + ')';
      return '<div class="te-row r1-row" title="' + escapeHtml(title) + '">' +
        '<div class="te-team r1-team">' + logo + posBadge +
          '<a class="te-code r1-name" href="' + playerHref + '">' + escapeHtml(r.player) + '</a>' +
        '</div>' +
        '<div class="te-bar-wrap"><div class="te-bar" style="width:' + barW + '%"></div></div>' +
        '<div class="te-count">' + r.count + '</div>' +
      '</div>';
    }).join('');

    var metaText = rows.length + ' player' + (rows.length === 1 ? '' : 's') +
      ' taken with your round-1 pick' +
      (superflexExcluded ? ' · ' + superflexExcluded + ' Superflex roster' + (superflexExcluded === 1 ? '' : 's') + ' excluded' : '');
    return '<div class="card histogram-card">' +
      '<div class="histogram-head">' +
        '<span class="badge" style="background:var(--bg-elev-2);color:var(--text-dim);border-color:var(--border);">ROUND 1</span>' +
        '<span class="histogram-meta">' + metaText + '</span>' +
      '</div>' +
      '<div class="team-exposure-list r1-list">' + rowsHtml + '</div>' +
    '</div>';
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
        return '<div class="hist-col" title="' + b.rosters + ' rosters drafted ' + b.count + ' ' + pos + 's (' + pctText + ' of ' + h.totalRosters + ')">' +
          '<div class="hist-num">' + b.rosters + '</div>' +
          (pctText ? '<div class="hist-pct">' + pctText + '</div>' : '') +
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
      return;
    }

    renderRosterTypes(rosters);
    renderHistograms(rosters);
    renderDraftSlots(rosters);
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

  populateFilters();
  render();
})();
