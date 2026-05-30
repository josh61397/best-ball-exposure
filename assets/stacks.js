(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var rowCountEl = document.getElementById('row-count');

  var state = {
    sortKey: 'stackedRosters',
    sortDir: 'desc',
    search: '',
    platform: '',
    tournament: '',
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function heatStyle(v, range, opts) {
    opts = opts || {};
    if (range == null || v == null || isNaN(v)) return '';
    var t = (v - range.min) / (range.max - range.min);
    if (opts.invert) t = 1 - t;
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

  var TT = {
    picks:       'Total picks across all your rosters at this team.\n\nFormula: Σ picks where pick.team = this team.',
    pctWithTeam: '% of your rosters that contain at least one player from this team.\n\nHeat-mapped green→red across visible teams.',
    stacks:      'Number of your rosters that contain 2 or more players from this team.',
    stackRate:   '% of your rosters that have ≥2 players from this team.\n\nFormula: stacked rosters / total rosters.\n\nHeat-mapped green→red across visible teams.',
    avgSize:     'Average number of players from this team on the rosters where you have a stack (2+).',
    topCombo:    'Most common position composition on stacked rosters for this team. \"QB+WR\" means QB and one WR; \"WR+WR+TE\" means two WRs and a TE; etc.',
    fees:        'Total entry fees of rosters containing players from this team.',
  };

  var COLS = [
    { key: 'team',                  label: 'Team',         sortable: true },
    { key: 'totalPicks',            label: 'Picks',        sortable: true, num: true, tooltip: TT.picks },
    { key: 'rostersWithTeam',       label: 'Rosters',      sortable: true, num: true },
    { key: 'pctWithTeam',           label: '% With',       sortable: true, num: true, tooltip: TT.pctWithTeam },
    { key: 'stackedRosters',        label: 'Stacks',       sortable: true, num: true, tooltip: TT.stacks },
    { key: 'stackRate',             label: 'Stack %',      sortable: true, num: true, tooltip: TT.stackRate },
    { key: 'avgPlayersWhenStacked', label: 'Avg Size',     sortable: true, num: true, tooltip: TT.avgSize },
    { key: 'topCombo',              label: 'Top Combo',    sortable: true, tooltip: TT.topCombo },
    { key: 'fees',                  label: 'Fees',         sortable: true, num: true, tooltip: TT.fees },
  ];

  function render() {
    var rosters = getFilteredRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      return;
    }

    var rows = BB.computeTeamStacks(rosters);
    var s = state.search.toLowerCase().trim();
    if (s) {
      rows = rows.filter(function (r) {
        if ((r.team || '').toLowerCase().indexOf(s) !== -1) return true;
        if ((r.topCombo || '').toLowerCase().indexOf(s) !== -1) return true;
        return false;
      });
    }

    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
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

    var head = '<thead><tr>' + COLS.map(function (c) {
      var ind = c.key === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
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
        if (state.sortKey === k) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = k;
          state.sortDir = (k === 'team' || k === 'topCombo') ? 'asc' : 'desc';
        }
        render();
      });
    });
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; render(); });

  populateFilters();
  render();
})();
