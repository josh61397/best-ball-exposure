(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var sizeEl = document.getElementById('size-filter');
  var allToggleEl = document.getElementById('all-toggle');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var rowCountEl = document.getElementById('row-count');

  var state = {
    size: 2,
    showAll: false,        // default: QB-anchored only
    search: '',
    platform: '',
    tournament: '',
    sortKey: 'count',
    sortDir: 'desc',
  };

  // Persist toggles across sessions.
  try {
    var saved = JSON.parse(localStorage.getItem('bb_player_stacks') || '{}');
    if (saved.size === 3) state.size = 3;
    if (saved.showAll) state.showAll = true;
  } catch (e) {}
  function persist() {
    try { localStorage.setItem('bb_player_stacks', JSON.stringify({ size: state.size, showAll: state.showAll })); } catch (e) {}
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
    sizeEl.value = String(state.size);
    allToggleEl.checked = state.showAll;
  }

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

  function render() {
    var rosters = getFilteredRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      return;
    }

    var requirePos = state.showAll ? null : 'QB';
    var t0 = performance.now();
    var stacks = BB.computePlayerStacks(rosters, { size: state.size, requirePos: requirePos });
    var elapsed = performance.now() - t0;

    // Filter by search (matches any player name or the type string)
    var s = state.search.toLowerCase().trim();
    if (s) {
      stacks = stacks.filter(function (st) {
        if ((st.type || '').toLowerCase().indexOf(s) !== -1) return true;
        return st.players.some(function (p) { return (p.player || '').toLowerCase().indexOf(s) !== -1; });
      });
    }

    // Sort
    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
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

    // Cap visible rows so massive 3-player datasets stay snappy.
    var capped = stacks.slice(0, 300);
    var hidden = stacks.length - capped.length;
    rowCountEl.textContent = stacks.length.toLocaleString();

    var COLS = [
      { key: 'stack',  label: 'Stack',     sortable: false },
      { key: 'type',   label: 'Type',      sortable: true },
      { key: 'count',  label: 'Rosters',   sortable: true, num: true },
      { key: 'pct',    label: 'Stack %',   sortable: true, num: true },
      { key: 'fees',   label: 'Fees',      sortable: true, num: true },
    ];
    var head = '<thead><tr>' + COLS.map(function (c) {
      var ind = c.key === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
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
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = k === 'type' ? 'asc' : 'desc'; }
        render();
      });
    });
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; render(); });
  sizeEl.addEventListener('change', function (e) { state.size = parseInt(e.target.value, 10) || 2; persist(); render(); });
  allToggleEl.addEventListener('change', function (e) { state.showAll = !!e.target.checked; persist(); render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; render(); });

  populateFilters();
  render();
})();
