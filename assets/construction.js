(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var contextEl = document.getElementById('context-filter');
  var rowCountEl = document.getElementById('row-count');

  var state = {
    sortKey: 'count',
    sortDir: 'desc',
    search: '',
    platform: '',
    tournament: '',
    context: '',
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
        var barH = Math.max(2, Math.round(pct * 90));
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
      renderHistograms([]);
      return;
    }

    renderHistograms(rosters);
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

    var COLS = [
      { key: 'key',   label: 'Construction',  sortable: true },
      { key: 'count', label: '# Rosters',     sortable: true, num: true },
      { key: 'pct',   label: '% of Rosters',  sortable: true, num: true },
    ];

    var head = '<thead><tr>' + COLS.map(function (c) {
      var ind = c.key === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : '');
      return '<th class="' + classes + '" data-key="' + c.key + '">' +
        c.label + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var rPct = rangeFor(rows, 'pct');

    var body = '<tbody>' + rows.map(function (r) {
      var keyCell =
        '<div class="construction-key">' +
          '<code class="stack-combo construction-code">' + escapeHtml(r.key) + '</code>' +
          '<span class="construction-sub">QB-RB-WR-TE · ' + r.totalPicks + ' picks</span>' +
        '</div>';
      return '<tr>' +
        '<td>' + keyCell + '</td>' +
        '<td class="num">' + r.count + '</td>' +
        '<td class="num"' + heatStyle(r.pct, rPct) + '>' + BB.fmtPct(r.pct) + '</td>' +
        '</tr>';
    }).join('') + '</tbody>';

    contentEl.innerHTML = '<table class="data construction-table">' + head + body + '</table>';

    contentEl.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = k === 'key' ? 'asc' : 'desc'; }
        render();
      });
    });
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; render(); });
  if (contextEl) contextEl.addEventListener('change', function (e) { state.context = e.target.value; render(); });

  populateFilters();
  render();
})();
