(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var sizeEl = document.getElementById('size-filter');
  var allToggleEl = document.getElementById('all-toggle');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var contextEl = document.getElementById('context-filter');
  var rowCountEl = document.getElementById('row-count');
  var rowLabelEl = document.getElementById('row-label');

  var viewToggleEl = document.getElementById('view-toggle');


  var state = {
    view: 'team',
    search: '',
    platform: '',
    tournament: '',
    context: '',
    team:      { sortKey: 'stackedRosters', sortDir: 'desc' },
    player:    { size: 2, showAll: false, sortKey: 'count', sortDir: 'desc' },
    frequency: { sortKey: 'totalRosters', sortDir: 'desc', expanded: {} },
  };

  // Persist selections.
  try {
    var saved = JSON.parse(localStorage.getItem('bb_stacks_state') || '{}');
    if (saved.view === 'player' || saved.view === 'team' || saved.view === 'frequency') state.view = saved.view;
    if (saved.size === 3) state.player.size = 3;
    if (saved.showAll) state.player.showAll = true;
  } catch (e) {}
  function persist() {
    try {
      localStorage.setItem('bb_stacks_state', JSON.stringify({
        view: state.view,
        size: state.player.size,
        showAll: state.player.showAll,
      }));
    } catch (e) {}
  }

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
  function rangeFor(rows, getter) {
    var min = Infinity, max = -Infinity;
    rows.forEach(function (r) {
      var v = typeof getter === 'function' ? getter(r) : r[getter];
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
    sizeEl.value = String(state.player.size);
    allToggleEl.checked = state.player.showAll;
  }

  function applyViewToToolbar() {
    document.querySelectorAll('[data-player-only]').forEach(function (el) {
      el.style.display = state.view === 'player' ? '' : 'none';
    });
    if (rowLabelEl) {
      rowLabelEl.textContent =
        state.view === 'player'    ? 'stacks' :
        state.view === 'frequency' ? 'QBs' :
                                     'teams';
    }

    searchEl.placeholder =
      state.view === 'player'    ? 'Search player or stack type…' :
      state.view === 'frequency' ? 'Search QB or team…' :
                                   'Search team or combo…';
    viewToggleEl.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === state.view);
    });
  }

  function setView(v) {
    state.view = v;
    persist();
    applyViewToToolbar();
    render();
  }

  // ============================================================
  // TEAM VIEW
  // ============================================================
  var TEAM_TT = {
    picks:       'Total picks across all your rosters at this team.\n\nFormula: Σ picks where pick.team = this team.',
    pctWithTeam: '% of your rosters that contain at least one player from this team.\n\nHeat-mapped green→red across visible teams.',
    stacks:      'Number of your rosters that contain 2 or more players from this team.',
    stackRate:   '% of your rosters that have ≥2 players from this team.\n\nFormula: stacked rosters / total rosters.\n\nHeat-mapped green→red across visible teams.',
    avgSize:     'Average number of players from this team on the rosters where you have a stack (2+).',
    topCombo:    'Most common position composition on stacked rosters for this team. \"QB+WR\" means QB and one WR; \"WR+WR+TE\" means two WRs and a TE; etc.',
    fees:        'Total entry fees of rosters containing players from this team.',
  };

  var TEAM_COLS = [
    { key: 'team',                  label: 'Team',         sortable: true, required: true },
    { key: 'totalPicks',            label: 'Picks',        sortable: true, num: true, tooltip: TEAM_TT.picks },
    { key: 'rostersWithTeam',       label: 'Rosters',      sortable: true, num: true },
    { key: 'pctWithTeam',           label: '% With',       sortable: true, num: true, tooltip: TEAM_TT.pctWithTeam },
    { key: 'stackedRosters',        label: 'Stacks',       sortable: true, num: true, tooltip: TEAM_TT.stacks },
    { key: 'stackRate',             label: 'Stack %',      sortable: true, num: true, tooltip: TEAM_TT.stackRate },
    { key: 'avgPlayersWhenStacked', label: 'Avg Size',     sortable: true, num: true, tooltip: TEAM_TT.avgSize },
    { key: 'topCombo',              label: 'Top Combo',    sortable: true, tooltip: TEAM_TT.topCombo },
    { key: 'fees',                  label: 'Fees',         sortable: true, num: true, tooltip: TEAM_TT.fees },
  ];

  var teamColPicker = BB.makeColumnPicker({
    storageKey: 'bb_cols_stacks_team_v1',
    scopeClass: 'tbl-stacks-team',
    columns: TEAM_COLS,
  });

  function renderTeam(rosters) {
    var rows = BB.computeTeamStacks(rosters);
    var s = state.search.toLowerCase().trim();
    if (s) {
      rows = rows.filter(function (r) {
        if ((r.team || '').toLowerCase().indexOf(s) !== -1) return true;
        if ((r.topCombo || '').toLowerCase().indexOf(s) !== -1) return true;
        return false;
      });
    }

    var ts = state.team;
    var key = ts.sortKey;
    var dir = ts.sortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'team' || key === 'topCombo') {
        av = (a[key] || '').toLowerCase(); bv = (b[key] || '').toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      av = a[key]; bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });

    rowCountEl.textContent = rows.length.toLocaleString();

    var head = '<thead><tr>' + TEAM_COLS.map(function (c) {
      var ind = c.key === ts.sortKey ? (ts.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : '') + (c.tooltip ? ' tooltip-trigger' : '');
      var ttAttr = c.tooltip ? ' data-tooltip="' + c.tooltip.replace(/"/g, '&quot;') + '"' : '';
      var info = c.tooltip ? ' <span class="info-mark">ⓘ</span>' : '';
      return '<th class="' + classes + '" data-key="' + c.key + '" data-col="' + c.key + '"' + ttAttr + '>' +
        c.label + info + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var rPct = rangeFor(rows, 'pctWithTeam');
    var rStack = rangeFor(rows, 'stackRate');

    var body = '<tbody>' + rows.map(function (r) {
      var teamHref = 'team.html?code=' + encodeURIComponent(r.team);
      var teamCell = '<a class="team-cell-link" href="' + teamHref + '">' +
        '<span class="player-cell">' + BB.teamLogoHTML(r.team, { size: 18 }) +
        '<strong>' + escapeHtml(r.team) + '</strong></span></a>';
      return '<tr' + BB.teamColorStyle(r.team) + '>' +
        '<td data-col="team">' + teamCell + '</td>' +
        '<td class="num" data-col="totalPicks">' + r.totalPicks + '</td>' +
        '<td class="num" data-col="rostersWithTeam">' + r.rostersWithTeam + '</td>' +
        '<td class="num" data-col="pctWithTeam"' + heatStyle(r.pctWithTeam, rPct) + '>' + BB.fmtPct(r.pctWithTeam) + '</td>' +
        '<td class="num" data-col="stackedRosters">' + r.stackedRosters + '</td>' +
        '<td class="num" data-col="stackRate"' + heatStyle(r.stackRate, rStack) + '>' + BB.fmtPct(r.stackRate) + '</td>' +
        '<td class="num" data-col="avgPlayersWhenStacked">' + (r.avgPlayersWhenStacked != null ? r.avgPlayersWhenStacked.toFixed(2) : '—') + '</td>' +
        '<td data-col="topCombo">' + (r.topCombo ? '<code class="stack-combo">' + escapeHtml(r.topCombo) + '</code>' +
                  (r.topComboCount > 1 ? ' <span style="color:var(--text-muted);font-size:11px;">×' + r.topComboCount + '</span>' : '') : '—') + '</td>' +
        '<td class="num" data-col="fees">' + BB.fmtMoney(r.fees) + '</td>' +
        '</tr>';
    }).join('') + '</tbody>';

    contentEl.innerHTML =
      '<div class="table-toolbar">' + teamColPicker.renderButton() + '</div>' +
      '<div class="tbl-stacks-team"><table class="data">' + head + body + '</table></div>';
    teamColPicker.bind(contentEl);

    contentEl.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (ts.sortKey === k) ts.sortDir = ts.sortDir === 'asc' ? 'desc' : 'asc';
        else { ts.sortKey = k; ts.sortDir = (k === 'team' || k === 'topCombo') ? 'asc' : 'desc'; }
        render();
      });
    });
  }

  // ============================================================
  // PLAYER VIEW
  // ============================================================
  var PLAYER_COLS = [
    { key: 'stack',  label: 'Stack',     sortable: false, required: true },
    { key: 'type',   label: 'Type',      sortable: true },
    { key: 'count',  label: 'Rosters',   sortable: true, num: true },
    { key: 'pct',    label: 'Stack %',   sortable: true, num: true },
    { key: 'fees',   label: 'Fees',      sortable: true, num: true },
  ];

  var playerColPicker = BB.makeColumnPicker({
    storageKey: 'bb_cols_stacks_player_v1',
    scopeClass: 'tbl-stacks-player',
    columns: PLAYER_COLS,
  });

  function renderStackCell(stack) {
    return '<div class="stack-cell">' + stack.players.map(function (p) {
      var logo = p.team ? BB.teamLogoHTML(p.team, { size: 14 }) : '<span class="team-logo team-logo-empty" style="width:14px;height:14px;"></span>';
      var posBadge = p.position ? '<span class="badge pos-' + escapeHtml(p.position) + '" style="padding:1px 5px;font-size:10px;">' + escapeHtml(p.position) + '</span>' : '';
      var teamStyle = p.team ? BB.teamColorStyle(p.team) : '';
      return '<div class="stack-row"' + teamStyle + '>' + logo + posBadge +
        '<a href="player.html?name=' + encodeURIComponent(p.player) + '">' + escapeHtml(p.player) + '</a>' +
        '<span class="stack-team">' + escapeHtml(p.team || '') + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderPlayer(rosters) {
    var ps = state.player;
    var requirePos = ps.showAll ? null : 'QB';
    var t0 = performance.now();
    var stacks = BB.computePlayerStacks(rosters, { size: ps.size, requirePos: requirePos });
    var elapsed = performance.now() - t0;

    var s = state.search.toLowerCase().trim();
    if (s) {
      stacks = stacks.filter(function (st) {
        if ((st.type || '').toLowerCase().indexOf(s) !== -1) return true;
        return st.players.some(function (p) { return (p.player || '').toLowerCase().indexOf(s) !== -1; });
      });
    }

    var key = ps.sortKey;
    var dir = ps.sortDir === 'asc' ? 1 : -1;
    stacks.sort(function (a, b) {
      var av, bv;
      if (key === 'type') {
        av = (a.type || '').toLowerCase(); bv = (b.type || '').toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      av = a[key]; bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });

    var capped = stacks.slice(0, 300);
    var hidden = stacks.length - capped.length;
    rowCountEl.textContent = stacks.length.toLocaleString();

    var head = '<thead><tr>' + PLAYER_COLS.map(function (c) {
      var ind = c.key === ps.sortKey ? (ps.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : '');
      return '<th class="' + classes + '" data-key="' + c.key + '" data-col="' + c.key + '">' +
        c.label + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var rPct = rangeFor(capped, 'pct');
    var body = '<tbody>' + capped.map(function (st) {
      // Lead position = the first token of the type (e.g. "QB+WR" -> QB).
      var leadPos = (st.type || '').split('+')[0] || '';
      var posAttr = leadPos ? ' data-pos="' + leadPos + '"' : '';
      return '<tr' + posAttr + '>' +
        '<td data-col="stack">' + renderStackCell(st) + '</td>' +
        '<td data-col="type"><code class="stack-combo">' + escapeHtml(st.type) + '</code></td>' +
        '<td class="num" data-col="count">' + st.count + '</td>' +
        '<td class="num" data-col="pct"' + heatStyle(st.pct, rPct) + '>' + BB.fmtPct(st.pct) + '</td>' +
        '<td class="num" data-col="fees">' + BB.fmtMoney(st.fees) + '</td>' +
        '</tr>';
    }).join('') + '</tbody>';

    var capNote = hidden > 0
      ? '<p style="color:var(--text-muted);font-size:12px;margin:8px 2px 0;">' +
          'Showing top 300 of ' + stacks.length.toLocaleString() + ' stacks. Use search/sort to narrow further.' +
        '</p>'
      : '';
    var perfNote = '<p style="color:var(--text-muted);font-size:11px;margin:2px 2px 0;">Computed in ' + elapsed.toFixed(0) + 'ms across ' + rosters.length + ' rosters.</p>';

    contentEl.innerHTML =
      '<div class="table-toolbar">' + playerColPicker.renderButton() + '</div>' +
      '<div class="tbl-stacks-player"><table class="data player-stacks-table">' + head + body + '</table></div>' +
      capNote + perfNote;
    playerColPicker.bind(contentEl);

    contentEl.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (ps.sortKey === k) ps.sortDir = ps.sortDir === 'asc' ? 'desc' : 'asc';
        else { ps.sortKey = k; ps.sortDir = k === 'type' ? 'asc' : 'desc'; }
        render();
      });
    });
  }

  // ============================================================
  // FREQUENCY VIEW (Stack Size)
  // ============================================================
  // For every QB on every roster, count how many same-team, non-QB
  // teammates appear on that roster. Bucket into 0 / 1 / 2 / 3+.
  // Also track teammate co-occurrence per QB (for the expanded panel),
  // and a per-roster fee bucket keyed by the roster's LARGEST QB stack
  // (so the fee totals on the right panel sum to 100% of fees).
  function computeQbStackFrequency(rosters) {
    var normalize = (window.BB_DATA && window.BB_DATA.normalizeName)
      ? window.BB_DATA.normalizeName
      : function (s) { return String(s || '').toLowerCase().trim(); };

    var byQb = {};
    var feeBuckets = {
      0: { size: 0, label: '0',  rosters: 0, fees: 0 },
      1: { size: 1, label: '1',  rosters: 0, fees: 0 },
      2: { size: 2, label: '2',  rosters: 0, fees: 0 },
      3: { size: 3, label: '3+', rosters: 0, fees: 0 },
    };
    var feeTotals = { totalFees: 0, qbRosters: 0, totalRosters: rosters.length };

    rosters.forEach(function (r) {
      feeTotals.totalFees += r.entryFee || 0;
      var picks = r.picks || [];
      // Bucket picks by team for fast same-team lookup.
      var byTeam = {};
      picks.forEach(function (p) {
        if (!p.team) return;
        (byTeam[p.team] = byTeam[p.team] || []).push(p);
      });

      var qbsOnRoster = picks.filter(function (p) {
        return p.position === 'QB' && p.team && p.player;
      });
      if (!qbsOnRoster.length) return;
      feeTotals.qbRosters++;

      var maxStackSize = 0;
      qbsOnRoster.forEach(function (qb) {
        var teamPicks = byTeam[qb.team] || [];
        var teammates = teamPicks.filter(function (p) {
          return p.position !== 'QB' && p.player;
        });
        var stackSize = teammates.length;
        if (stackSize > maxStackSize) maxStackSize = stackSize;

        var key = normalize(qb.player);
        if (!byQb[key]) {
          byQb[key] = {
            normName: key,
            player: qb.player,
            team: qb.team,
            totalRosters: 0,
            sumSize: 0,
            buckets:     { 0: 0, 1: 0, 2: 0, 3: 0 },
            bucketFees:  { 0: 0, 1: 0, 2: 0, 3: 0 },
            fees: 0,
            teammates: {},
          };
        }
        var e = byQb[key];
        e.totalRosters++;
        e.sumSize += stackSize;
        e.fees += r.entryFee || 0;
        var b = stackSize >= 3 ? 3 : stackSize;
        e.buckets[b]++;
        e.bucketFees[b] += r.entryFee || 0;

        teammates.forEach(function (t) {
          var tk = normalize(t.player);
          if (!e.teammates[tk]) {
            e.teammates[tk] = { player: t.player, position: t.position, team: t.team, count: 0 };
          }
          e.teammates[tk].count++;
        });
      });

      var rb = maxStackSize >= 3 ? 3 : maxStackSize;
      feeBuckets[rb].rosters++;
      feeBuckets[rb].fees += r.entryFee || 0;
    });

    var qbRows = Object.keys(byQb).map(function (k) {
      var e = byQb[k];
      var teammates = Object.keys(e.teammates).map(function (tk) {
        var t = e.teammates[tk];
        return {
          player: t.player,
          position: t.position,
          team: t.team,
          count: t.count,
          pct: e.totalRosters ? t.count / e.totalRosters : 0,
        };
      }).sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return (a.player || '').localeCompare(b.player || '');
      });
      return {
        normName: e.normName,
        player: e.player,
        team: e.team,
        totalRosters: e.totalRosters,
        avgSize: e.totalRosters ? e.sumSize / e.totalRosters : 0,
        buckets: e.buckets,
        bucketFees: e.bucketFees,
        fees: e.fees,
        teammates: teammates,
      };
    });

    return {
      qbRows: qbRows,
      feeBuckets: [feeBuckets[0], feeBuckets[1], feeBuckets[2], feeBuckets[3]],
      totals: feeTotals,
    };
  }

  var FREQ_TT = {
    avg:    'Average number of teammates (same NFL team, non-QB) drafted alongside this QB across rosters where you have the QB.',
    bucket: '% of this QB\'s rosters with that many same-team, non-QB teammates. The 3+ bucket includes 3, 4, 5… players.',
    fees:   'Total entry fees of rosters that contain this QB.',
  };

  var FREQ_COLS = [
    { key: 'qb',           label: 'QB',       sortable: false, required: true },
    { key: 'totalRosters', label: 'Rosters',  sortable: true, num: true },
    { key: 'avgSize',      label: 'Avg Size', sortable: true, num: true, tooltip: FREQ_TT.avg },
    { key: 'b0',           label: 'Stack 0',  sortable: true, num: true, tooltip: FREQ_TT.bucket },
    { key: 'b1',           label: 'Stack 1',  sortable: true, num: true, tooltip: FREQ_TT.bucket },
    { key: 'b2',           label: 'Stack 2',  sortable: true, num: true, tooltip: FREQ_TT.bucket },
    { key: 'b3',           label: 'Stack 3+', sortable: true, num: true, tooltip: FREQ_TT.bucket },
    { key: 'fees',         label: 'Fees',     sortable: true, num: true, tooltip: FREQ_TT.fees },
  ];

  var freqColPicker = BB.makeColumnPicker({
    storageKey: 'bb_cols_stacks_freq_v1',
    scopeClass: 'tbl-stacks-freq',
    columns: FREQ_COLS,
  });

  // The header label shown above the table column differs from the picker
  // label — the picker says "Stack 0/1/2/3+" so it's clear which option,
  // but the table column just shows "0/1/2/3+" for compactness.
  var FREQ_HEADER_LABELS = {
    b0: '0', b1: '1', b2: '2', b3: '3+',
  };

  function bucketKeyToVal(row, key) {
    if (key === 'b0') return row.buckets[0];
    if (key === 'b1') return row.buckets[1];
    if (key === 'b2') return row.buckets[2];
    if (key === 'b3') return row.buckets[3];
    return row[key];
  }

  function renderBucketCell(count, total, range, colKey) {
    var pct  = total ? count / total : 0;
    var heat = heatStyle(pct, range);
    var colAttr = colKey ? ' data-col="' + colKey + '"' : '';
    if (!total) return '<td class="num bucket-cell"' + colAttr + heat + '>—</td>';
    return '<td class="num bucket-cell"' + colAttr + heat + '>' + BB.fmtPct(pct) + '</td>';
  }

  function renderTeammatePanel(row) {
    if (!row.teammates.length) {
      return '<div class="combo-panel"><div class="combo-panel-head">' +
        '<span>No teammates appeared with ' + escapeHtml(row.player) + ' on these rosters.</span>' +
        '</div></div>';
    }
    var rTm = rangeFor(row.teammates, 'pct');
    var rows = row.teammates.map(function (t) {
      var logo = t.team ? BB.teamLogoHTML(t.team, { size: 14 }) : '';
      var posBadge = t.position
        ? '<span class="badge pos-' + escapeHtml(t.position) + '">' + escapeHtml(t.position) + '</span>'
        : '';
      return '<tr>' +
        '<td><span class="player-cell" data-pos="' + escapeHtml(t.position || '') + '">' +
          logo + '<span class="player-name">' +
          '<a href="player.html?name=' + encodeURIComponent(t.player) + '">' + escapeHtml(t.player) + '</a>' +
          '</span></span></td>' +
        '<td>' + posBadge + '</td>' +
        '<td class="num">' + t.count + '</td>' +
        '<td class="num"' + heatStyle(t.pct, rTm) + '>' + BB.fmtPct(t.pct) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="combo-panel">' +
      '<div class="combo-panel-head">' +
        '<strong>Teammates drafted with ' + escapeHtml(row.player) + '</strong>' +
        '<span class="combo-panel-link">' + row.totalRosters + ' roster' + (row.totalRosters === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<table class="data combo-table">' +
        '<thead><tr><th>Teammate</th><th>Pos</th><th class="num">Together</th><th class="num">% of QB Rosters</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      '<p class="combo-panel-foot">% is share of rosters where you drafted ' + escapeHtml(row.player) + ' that also include this teammate.</p>' +
    '</div>';
  }

  function renderFeesPanel(feeBuckets, totals) {
    var totalFees = totals.totalFees || 0;
    var bRange = rangeFor(feeBuckets, function (b) { return totalFees ? b.fees / totalFees : 0; });
    var rows = feeBuckets.map(function (b) {
      var pct = totalFees ? b.fees / totalFees : 0;
      return '<tr>' +
        '<td><code class="stack-combo">' + b.label + '</code></td>' +
        '<td class="num">' + b.rosters + '</td>' +
        '<td class="num">' + BB.fmtMoney(b.fees) + '</td>' +
        '<td class="num"' + heatStyle(pct, bRange) + '>' + BB.fmtPct(pct) + '</td>' +
      '</tr>';
    }).join('');
    var noQbRosters = (totals.totalRosters || 0) - (totals.qbRosters || 0);
    var foot = noQbRosters > 0
      ? '<p class="freq-side-foot">' + noQbRosters + ' roster' + (noQbRosters === 1 ? '' : 's') + ' had no QB and ' +
        'were excluded from the fee buckets.</p>'
      : '';
    return '<aside class="freq-side card">' +
      '<h3>Fees by Stack Size</h3>' +
      '<p class="freq-side-sub">Each roster is bucketed by the <em>largest</em> QB stack on it.</p>' +
      '<table class="data">' +
        '<thead><tr><th>Stack</th><th class="num">Rosters</th><th class="num">Fees</th><th class="num">% of Fees</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      foot +
    '</aside>';
  }

  function renderFrequency(rosters) {
    var data = computeQbStackFrequency(rosters);
    var rows = data.qbRows;

    var s = state.search.toLowerCase().trim();
    if (s) {
      rows = rows.filter(function (r) {
        if ((r.player || '').toLowerCase().indexOf(s) !== -1) return true;
        if ((r.team || '').toLowerCase().indexOf(s) !== -1) return true;
        return false;
      });
    }

    var fs = state.frequency;
    var key = fs.sortKey;
    var dir = fs.sortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'qb') {
        av = (a.player || '').toLowerCase(); bv = (b.player || '').toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      av = bucketKeyToVal(a, key);
      bv = bucketKeyToVal(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });

    rowCountEl.textContent = rows.length.toLocaleString();

    var head = '<thead><tr>' + FREQ_COLS.map(function (c) {
      var ind = c.key === fs.sortKey ? (fs.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : '') + (c.tooltip ? ' tooltip-trigger' : '');
      var ttAttr = c.tooltip ? ' data-tooltip="' + c.tooltip.replace(/"/g, '&quot;') + '"' : '';
      var info = c.tooltip ? ' <span class="info-mark">ⓘ</span>' : '';
      var displayLabel = FREQ_HEADER_LABELS[c.key] || c.label;
      return '<th class="' + classes + '" data-key="' + c.key + '" data-col="' + c.key + '"' + ttAttr + '>' +
        displayLabel + info + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var colSpan = FREQ_COLS.length;
    // Heat-map each bucket column across visible rows on its % (count / totalRosters).
    var rB0 = rangeFor(rows, function (r) { return r.totalRosters ? r.buckets[0] / r.totalRosters : 0; });
    var rB1 = rangeFor(rows, function (r) { return r.totalRosters ? r.buckets[1] / r.totalRosters : 0; });
    var rB2 = rangeFor(rows, function (r) { return r.totalRosters ? r.buckets[2] / r.totalRosters : 0; });
    var rB3 = rangeFor(rows, function (r) { return r.totalRosters ? r.buckets[3] / r.totalRosters : 0; });
    var rAvg = rangeFor(rows, 'avgSize');

    var body = '<tbody>' + rows.map(function (r) {
      var isExpanded = !!fs.expanded[r.normName];
      var chevron = '<button type="button" class="row-expand-btn" data-norm="' + escapeHtml(r.normName) +
        '" aria-expanded="' + isExpanded + '" aria-label="' + (isExpanded ? 'Collapse' : 'Expand') + ' teammate breakdown for ' + escapeHtml(r.player) + '">' +
        '<span class="chevron">' + (isExpanded ? '▾' : '▸') + '</span>' +
        '</button>';
      var teamHref = 'team.html?code=' + encodeURIComponent(r.team);
      var qbCell =
        '<span class="player-cell-with-expand">' + chevron +
        '<span class="player-cell" data-pos="QB">' + BB.teamLogoHTML(r.team, { size: 18 }) +
        '<span class="player-name">' +
        '<a href="player.html?name=' + encodeURIComponent(r.player) + '">' + escapeHtml(r.player) + '</a>' +
        '</span>' +
        '<a class="stack-team" href="' + teamHref + '" style="margin-left:6px;">' + escapeHtml(r.team) + '</a>' +
        '</span>' +
        '</span>';
      var trClass = 'row-expandable' + (isExpanded ? ' is-expanded' : '');
      var mainTr = '<tr class="' + trClass + '" data-pos="QB" data-norm="' + escapeHtml(r.normName) + '"' +
        BB.teamColorStyle(r.team) + '>' +
        '<td data-col="qb">' + qbCell + '</td>' +
        '<td class="num" data-col="totalRosters">' + r.totalRosters + '</td>' +
        '<td class="num" data-col="avgSize"' + heatStyle(r.avgSize, rAvg) + '>' + r.avgSize.toFixed(2) + '</td>' +
        renderBucketCell(r.buckets[0], r.totalRosters, rB0, 'b0') +
        renderBucketCell(r.buckets[1], r.totalRosters, rB1, 'b1') +
        renderBucketCell(r.buckets[2], r.totalRosters, rB2, 'b2') +
        renderBucketCell(r.buckets[3], r.totalRosters, rB3, 'b3') +
        '<td class="num" data-col="fees">' + BB.fmtMoney(r.fees) + '</td>' +
        '</tr>';
      var detailTr = isExpanded
        ? '<tr class="row-expand-detail"><td colspan="' + colSpan + '">' + renderTeammatePanel(r) + '</td></tr>'
        : '';
      return mainTr + detailTr;
    }).join('') + '</tbody>';

    contentEl.innerHTML =
      '<div class="table-toolbar">' + freqColPicker.renderButton() + '</div>' +
      '<div class="tbl-stacks-freq"><table class="data">' + head + body + '</table></div>';
    freqColPicker.bind(contentEl);

    // Wire up expand toggles.
    contentEl.querySelectorAll('.row-expand-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var n = btn.getAttribute('data-norm');
        fs.expanded[n] = !fs.expanded[n];
        render();
      });
    });
    contentEl.querySelectorAll('tr.row-expandable').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        if (e.target.closest('.row-expand-btn')) return;
        var n = tr.getAttribute('data-norm');
        fs.expanded[n] = !fs.expanded[n];
        render();
      });
    });

    // Sort header wiring.
    contentEl.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (fs.sortKey === k) fs.sortDir = fs.sortDir === 'asc' ? 'desc' : 'asc';
        else { fs.sortKey = k; fs.sortDir = k === 'qb' ? 'asc' : 'desc'; }
        render();
      });
    });
  }

  // ============================================================
  // SHARED RENDER
  // ============================================================
  function render() {
    var rosters = getFilteredRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      return;
    }
    if (state.view === 'player')    return renderPlayer(rosters);
    if (state.view === 'frequency') return renderFrequency(rosters);
    return renderTeam(rosters);
  }

  // ============================================================
  // WIRING
  // ============================================================
  searchEl.addEventListener('input', function (e) { state.search = e.target.value; render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; render(); });
  if (contextEl) contextEl.addEventListener('change', function (e) { state.context = e.target.value; render(); });
  sizeEl.addEventListener('change', function (e) { state.player.size = parseInt(e.target.value, 10) || 2; persist(); render(); });
  allToggleEl.addEventListener('change', function (e) { state.player.showAll = !!e.target.checked; persist(); render(); });

  viewToggleEl.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
  });

  populateFilters();
  applyViewToToolbar();
  render();
})();
