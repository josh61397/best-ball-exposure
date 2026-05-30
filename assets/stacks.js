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
  var ledeEl = document.getElementById('page-lede');
  var viewToggleEl = document.getElementById('view-toggle');

  var LEDES = {
    team:   'Your roster construction grouped by NFL team. A <strong>stack</strong> = a roster with 2+ players from the same team. <strong>Top Combo</strong> shows the most common position composition on your stacked rosters for that team.',
    player: 'Which combinations of <em>specific players</em> appear together most often on your rosters. Defaults to QB-anchored stacks (every shown stack contains at least one QB). Untick the checkbox to see all pairings regardless of position.'
  };

  var state = {
    view: 'team',
    search: '',
    platform: '',
    tournament: '',
    context: '',
    team:   { sortKey: 'stackedRosters', sortDir: 'desc' },
    player: { size: 2, showAll: false, sortKey: 'count', sortDir: 'desc' },
  };

  // Persist selections.
  try {
    var saved = JSON.parse(localStorage.getItem('bb_stacks_state') || '{}');
    if (saved.view === 'player' || saved.view === 'team') state.view = saved.view;
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
    if (rowLabelEl) rowLabelEl.textContent = state.view === 'player' ? 'stacks' : 'teams';
    ledeEl.innerHTML = LEDES[state.view] || '';
    searchEl.placeholder = state.view === 'player'
      ? 'Search player or stack type…'
      : 'Search team or combo…';
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
    { key: 'team',                  label: 'Team',         sortable: true },
    { key: 'totalPicks',            label: 'Picks',        sortable: true, num: true, tooltip: TEAM_TT.picks },
    { key: 'rostersWithTeam',       label: 'Rosters',      sortable: true, num: true },
    { key: 'pctWithTeam',           label: '% With',       sortable: true, num: true, tooltip: TEAM_TT.pctWithTeam },
    { key: 'stackedRosters',        label: 'Stacks',       sortable: true, num: true, tooltip: TEAM_TT.stacks },
    { key: 'stackRate',             label: 'Stack %',      sortable: true, num: true, tooltip: TEAM_TT.stackRate },
    { key: 'avgPlayersWhenStacked', label: 'Avg Size',     sortable: true, num: true, tooltip: TEAM_TT.avgSize },
    { key: 'topCombo',              label: 'Top Combo',    sortable: true, tooltip: TEAM_TT.topCombo },
    { key: 'fees',                  label: 'Fees',         sortable: true, num: true, tooltip: TEAM_TT.fees },
  ];

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
      return '<th class="' + classes + '" data-key="' + c.key + '"' + ttAttr + '>' +
        c.label + info + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var rPct = rangeFor(rows, 'pctWithTeam');
    var rStack = rangeFor(rows, 'stackRate');

    var body = '<tbody>' + rows.map(function (r) {
      var teamCell = '<span class="player-cell">' + BB.teamLogoHTML(r.team, { size: 18 }) +
        '<strong>' + escapeHtml(r.team) + '</strong></span>';
      return '<tr>' +
        '<td>' + teamCell + '</td>' +
        '<td class="num">' + r.totalPicks + '</td>' +
        '<td class="num">' + r.rostersWithTeam + '</td>' +
        '<td class="num"' + heatStyle(r.pctWithTeam, rPct) + '>' + BB.fmtPct(r.pctWithTeam) + '</td>' +
        '<td class="num">' + r.stackedRosters + '</td>' +
        '<td class="num"' + heatStyle(r.stackRate, rStack) + '>' + BB.fmtPct(r.stackRate) + '</td>' +
        '<td class="num">' + (r.avgPlayersWhenStacked != null ? r.avgPlayersWhenStacked.toFixed(2) : '—') + '</td>' +
        '<td>' + (r.topCombo ? '<code class="stack-combo">' + escapeHtml(r.topCombo) + '</code>' +
                  (r.topComboCount > 1 ? ' <span style="color:var(--text-muted);font-size:11px;">×' + r.topComboCount + '</span>' : '') : '—') + '</td>' +
        '<td class="num">' + BB.fmtMoney(r.fees) + '</td>' +
        '</tr>';
    }).join('') + '</tbody>';

    contentEl.innerHTML = '<table class="data">' + head + body + '</table>';

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
    { key: 'stack',  label: 'Stack',     sortable: false },
    { key: 'type',   label: 'Type',      sortable: true },
    { key: 'count',  label: 'Rosters',   sortable: true, num: true },
    { key: 'pct',    label: 'Stack %',   sortable: true, num: true },
    { key: 'fees',   label: 'Fees',      sortable: true, num: true },
  ];

  function renderStackCell(stack) {
    return '<div class="stack-cell">' + stack.players.map(function (p) {
      var logo = p.team ? BB.teamLogoHTML(p.team, { size: 14 }) : '<span class="team-logo team-logo-empty" style="width:14px;height:14px;"></span>';
      var posBadge = p.position ? '<span class="badge pos-' + escapeHtml(p.position) + '" style="padding:1px 5px;font-size:10px;">' + escapeHtml(p.position) + '</span>' : '';
      return '<div class="stack-row">' + logo + posBadge +
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
      return '<th class="' + classes + '" data-key="' + c.key + '">' +
        c.label + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var rPct = rangeFor(capped, 'pct');
    var body = '<tbody>' + capped.map(function (st) {
      return '<tr>' +
        '<td>' + renderStackCell(st) + '</td>' +
        '<td><code class="stack-combo">' + escapeHtml(st.type) + '</code></td>' +
        '<td class="num">' + st.count + '</td>' +
        '<td class="num"' + heatStyle(st.pct, rPct) + '>' + BB.fmtPct(st.pct) + '</td>' +
        '<td class="num">' + BB.fmtMoney(st.fees) + '</td>' +
        '</tr>';
    }).join('') + '</tbody>';

    var capNote = hidden > 0
      ? '<p style="color:var(--text-muted);font-size:12px;margin:8px 2px 0;">' +
          'Showing top 300 of ' + stacks.length.toLocaleString() + ' stacks. Use search/sort to narrow further.' +
        '</p>'
      : '';
    var perfNote = '<p style="color:var(--text-muted);font-size:11px;margin:2px 2px 0;">Computed in ' + elapsed.toFixed(0) + 'ms across ' + rosters.length + ' rosters.</p>';

    contentEl.innerHTML = '<table class="data player-stacks-table">' + head + body + '</table>' + capNote + perfNote;

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
  // SHARED RENDER
  // ============================================================
  function render() {
    var rosters = getFilteredRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      return;
    }
    if (state.view === 'player') return renderPlayer(rosters);
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
