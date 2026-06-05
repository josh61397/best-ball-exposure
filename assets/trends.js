(function () {
  'use strict';
  if (!window.BB || !window.BB_DATA) return;

  // Use the same CSS variables that the rest of the UI uses so each line
  // adapts to light vs dark mode automatically.
  var SERIES = [
    { key: 'ud',       label: 'Underdog',   color: 'var(--pos-wr)' },
    { key: 'dk',       label: 'DraftKings', color: 'var(--pos-rb)' },
    { key: 'drafters', label: 'Drafters',   color: 'var(--pos-qb)' },
  ];

  // Series the user has toggled on for the current render. Drives line
  // paths, dots, legend entries, and y-axis range.
  function visibleSeries() {
    return SERIES.filter(function (s) { return state.show[s.key]; });
  }

  var state = {
    dates: [],             // list of YYYY-MM-DD strings
    selectedPlayer: '',
    range: '30',
    perDayCache: {},       // date -> parsed JSON (player rows)
    series: null,          // { date -> { ud, dk, drafters, bb10, rtsports } } for selected player
    view: 'chart',         // 'chart' | 'table'
    // Which platform lines to render on the chart. Underdog is always on
    // (the primary best-ball ADP source); the others are opt-in via the
    // Compare checkboxes.
    show: { ud: true, dk: false, drafters: false },
    table: {
      range: '30',
      positions: [],       // [] = all
      direction: 'all',    // 'all' | 'risers' | 'fallers'
      search: '',
      sortKey: 'adpChange',
      sortDir: 'desc',
      rows: null,          // computed rows for current range
      loadedKey: null,     // cache key — range used to compute `rows`
    },
  };

  var searchEl = document.getElementById('player-search');
  var listEl = document.getElementById('player-list');
  var rangeEl = document.getElementById('range');
  var historyMetaEl = document.getElementById('history-meta');
  var chartEl = document.getElementById('chart-container');
  var legendEl = document.getElementById('legend');
  var playerMetaEl = document.getElementById('player-meta');

  // Table view DOM
  var viewToggleEl    = document.getElementById('view-toggle');
  var tableContainer  = document.getElementById('table-container');
  var tablePosFilter  = document.getElementById('table-pos-filter');
  var tableSearchEl   = document.getElementById('table-search');
  var tableRangeEl    = document.getElementById('table-range');
  var tableMetaEl     = document.getElementById('table-meta');
  var dirToggleEl     = document.getElementById('dir-toggle');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function populatePlayerList() {
    if (!window.BB_DATA.adp) return;
    var sorted = window.BB_DATA.adp.slice().sort(function (a, b) {
      var au = a.ud == null ? 999 : a.ud;
      var bu = b.ud == null ? 999 : b.ud;
      return au - bu;
    });
    listEl.innerHTML = sorted.map(function (p) {
      return '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.pos + ' · ' + (p.team || '')) + '</option>';
    }).join('');
  }

  async function loadIndex() {
    try {
      var resp = await fetch('data/history/index.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error('index ' + resp.status);
      var idx = await resp.json();
      state.dates = (idx.dates || []).slice().sort();
      historyMetaEl.textContent = state.dates.length + ' day' + (state.dates.length === 1 ? '' : 's') +
        ' of history' + (state.dates.length ? ' · ' + state.dates[0] + ' → ' + state.dates[state.dates.length - 1] : '');
    } catch (e) {
      state.dates = [];
      historyMetaEl.textContent = 'No history yet (' + e.message + ')';
    }
  }

  function datesInRange() {
    if (state.range === 'all') return state.dates.slice();
    var n = parseInt(state.range, 10);
    return state.dates.slice(-n);
  }

  async function fetchDay(date) {
    if (state.perDayCache[date]) return state.perDayCache[date];
    // Default cache policy: respect HTTP cache headers and revalidate.
    // Previously force-cache, which served indefinitely stale files even
    // after backfill updates landed.
    var resp = await fetch('data/history/' + date + '.json');
    if (!resp.ok) throw new Error('day ' + date + ' ' + resp.status);
    var json = await resp.json();
    state.perDayCache[date] = json;
    return json;
  }

  function findRow(day, normName) {
    var players = day.players || [];
    for (var i = 0; i < players.length; i++) {
      if (window.BB_DATA.normalizeName(players[i].name) === normName) return players[i];
    }
    return null;
  }

  async function buildSeriesForPlayer(name) {
    var norm = window.BB_DATA.normalizeName(name);
    var dates = datesInRange();
    var series = {};
    // Parallel fetch of all days in range — usually small (≤90)
    var rows = await Promise.all(dates.map(function (d) { return fetchDay(d).catch(function () { return null; }); }));
    for (var i = 0; i < dates.length; i++) {
      var day = rows[i];
      if (!day) continue;
      var row = findRow(day, norm);
      if (!row) continue;
      series[dates[i]] = {
        ud: row.ud,
        dk: row.dk,
        drafters: row.drafters,
        bb10: row.bb10,
        rtsports: row.rtsports,
        pos: row.pos,
        team: row.team,
      };
    }
    return series;
  }

  function renderEmpty(msg) {
    chartEl.innerHTML = '<div class="empty-state">' + escapeHtml(msg) + '</div>';
    legendEl.innerHTML = '';
    playerMetaEl.innerHTML = '';
  }

  function renderChart() {
    var series = state.series || {};
    var dates = datesInRange();
    if (!dates.length) {
      renderEmpty('No history available yet. The first daily snapshot will appear after the scheduled refresh runs.');
      return;
    }
    if (!state.selectedPlayer) {
      renderEmpty('Pick a player above to see their ADP movement.');
      return;
    }
    var dataDates = dates.filter(function (d) { return series[d]; });
    if (!dataDates.length) {
      renderEmpty('No history data found for "' + state.selectedPlayer + '" in this range. Try expanding the range.');
      return;
    }

    // Compute Y range across visible platforms (lower = better, invert)
    var visible = visibleSeries();
    var allValues = [];
    visible.forEach(function (s) {
      dataDates.forEach(function (d) {
        var v = series[d][s.key];
        if (v != null) allValues.push(v);
      });
    });
    if (!allValues.length) {
      renderEmpty('Player has no ADP values in this range.');
      return;
    }
    var minADP = Math.min.apply(null, allValues);
    var maxADP = Math.max.apply(null, allValues);
    if (maxADP - minADP < 4) { // give vertical breathing room
      var mid = (minADP + maxADP) / 2;
      minADP = Math.max(1, mid - 2);
      maxADP = mid + 2;
    }

    // SVG layout
    var W = chartEl.clientWidth || 800;
    var H = 360;
    var pad = { top: 16, right: 16, bottom: 36, left: 48 };
    var innerW = W - pad.left - pad.right;
    var innerH = H - pad.top - pad.bottom;

    function x(i, n) { return n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW; }
    function y(v) { return ((v - minADP) / (maxADP - minADP)) * innerH; } // lower ADP = higher up (smaller y)

    // Build paths per platform
    function buildPath(key) {
      var d = '';
      var on = false;
      dataDates.forEach(function (date, i) {
        var v = series[date][key];
        if (v == null) return;
        var px = x(i, dataDates.length);
        var py = y(v);
        d += (on ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1);
        on = true;
      });
      return d;
    }

    // Y-axis ticks (5 levels)
    var yTicks = [];
    for (var t = 0; t <= 4; t++) {
      var frac = t / 4;
      var val = minADP + frac * (maxADP - minADP);
      yTicks.push({ y: y(val), label: val.toFixed(1) });
    }

    // X-axis labels — show ~5 evenly spaced
    var xLabelEvery = Math.max(1, Math.floor(dataDates.length / 5));
    var xLabels = dataDates.map(function (date, i) {
      if (i % xLabelEvery !== 0 && i !== dataDates.length - 1) return null;
      var d = new Date(date);
      var label = (d.getMonth() + 1) + '/' + d.getDate();
      return { x: x(i, dataDates.length), label: label };
    }).filter(Boolean);

    var paths = visible.map(function (s) {
      var d = buildPath(s.key);
      if (!d) return '';
      return '<path d="' + d + '" stroke="' + s.color + '" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>';
    }).join('');

    var dots = visible.map(function (s) {
      return dataDates.map(function (date, i) {
        var v = series[date][s.key];
        if (v == null) return '';
        var cx = x(i, dataDates.length);
        var cy = y(v);
        return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="2.5" fill="' + s.color + '"></circle>';
      }).join('');
    }).join('');

    var yGrid = yTicks.map(function (t) {
      return '<line x1="0" x2="' + innerW + '" y1="' + t.y.toFixed(1) + '" y2="' + t.y.toFixed(1) + '" stroke="var(--grid)" stroke-dasharray="2,3"/>' +
        '<text x="-10" y="' + (t.y + 4).toFixed(1) + '" text-anchor="end" fill="var(--text-muted)" font-size="11">' + t.label + '</text>';
    }).join('');

    var xLabelsHtml = xLabels.map(function (l) {
      return '<text x="' + l.x.toFixed(1) + '" y="' + (innerH + 20) + '" text-anchor="middle" fill="var(--text-muted)" font-size="11">' + l.label + '</text>';
    }).join('');

    // Hover layer: invisible circles for each data point
    var hover = '<g class="hover-layer">';
    dataDates.forEach(function (date, i) {
      var cx = x(i, dataDates.length);
      hover += '<rect x="' + (cx - innerW / dataDates.length / 2).toFixed(1) + '" y="0" width="' + (innerW / dataDates.length).toFixed(1) + '" height="' + innerH + '" fill="transparent" data-idx="' + i + '"/>';
    });
    hover += '</g>';

    chartEl.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" style="background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;">' +
        '<g transform="translate(' + pad.left + ',' + pad.top + ')">' +
          '<text x="-40" y="-4" fill="var(--text-muted)" font-size="10" text-anchor="start">↑ better (lower ADP)</text>' +
          yGrid +
          xLabelsHtml +
          paths +
          dots +
          hover +
          '<line x1="0" x2="0" y1="0" y2="' + innerH + '" stroke="color-mix(in srgb, var(--accent) 35%, var(--border))" stroke-width="1.5"/>' +
          '<line x1="0" x2="' + innerW + '" y1="' + innerH + '" y2="' + innerH + '" stroke="color-mix(in srgb, var(--accent) 35%, var(--border))" stroke-width="1.5"/>' +
        '</g>' +
      '</svg>' +
      '<div id="hover-tip" style="display:none;position:absolute;background:var(--bg-elev-2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;pointer-events:none;z-index:5;"></div>';

    chartEl.style.position = 'relative';
    var tip = document.getElementById('hover-tip');
    var rects = chartEl.querySelectorAll('.hover-layer rect');
    rects.forEach(function (rect) {
      rect.addEventListener('mousemove', function (e) {
        var i = parseInt(rect.getAttribute('data-idx'), 10);
        var date = dataDates[i];
        var row = series[date];
        var lines = ['<strong>' + escapeHtml(date) + '</strong>'];
        visible.forEach(function (s) {
          var v = row[s.key];
          if (v != null) lines.push('<span style="display:inline-block;width:8px;height:8px;background:' + s.color + ';border-radius:50%;margin-right:6px;"></span>' + s.label + ': ' + BB.fmtADP(v));
        });
        tip.innerHTML = lines.join('<br/>');
        tip.style.display = 'block';
        var box = chartEl.getBoundingClientRect();
        tip.style.left = (e.clientX - box.left + 12) + 'px';
        tip.style.top = (e.clientY - box.top + 12) + 'px';
      });
      rect.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    });

    // Render legend with current values
    var lastDate = dataDates[dataDates.length - 1];
    var firstDate = dataDates[0];
    var legendHtml = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;">';
    visible.forEach(function (s) {
      var first = series[firstDate][s.key];
      var last = series[lastDate][s.key];
      if (last == null) return;
      var delta = (first != null && last != null) ? (last - first) : null;
      var deltaText = '';
      if (delta != null && delta !== 0) {
        var cls = delta < 0 ? 'clv-pos' : 'clv-neg';
        var sign = delta > 0 ? '+' : '';
        deltaText = ' <span class="' + cls + '">' + sign + delta.toFixed(1) + '</span>';
      }
      legendHtml += '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="display:inline-block;width:10px;height:10px;background:' + s.color + ';border-radius:2px;"></span>' +
        '<span>' + s.label + ':</span>' +
        '<strong>' + BB.fmtADP(last) + '</strong>' + deltaText +
        '</div>';
    });
    legendHtml += '</div>';
    legendEl.innerHTML = legendHtml;

    // Player metadata
    var ref = window.BB_DATA.lookupADP(state.selectedPlayer);
    var firstRow = series[firstDate];
    var posTeam = (ref && ref.pos) || firstRow.pos;
    var team = (ref && ref.team) || firstRow.team;
    playerMetaEl.innerHTML = '<div class="card" style="font-size:13px;color:var(--text-dim);">' +
      '<strong style="color:var(--text);">' + escapeHtml(state.selectedPlayer) + '</strong> · ' +
      escapeHtml(posTeam || '?') + ' · ' + escapeHtml(team || '?') +
      ' · tracked ' + dataDates.length + ' day' + (dataDates.length === 1 ? '' : 's') +
      '</div>';
  }

  // ============================================================
  // TABLE VIEW
  // ============================================================
  function canonADP(row) {
    if (!row) return null;
    if (row.ud != null) return row.ud;
    if (row.dk != null) return row.dk;
    if (row.drafters != null) return row.drafters;
    if (row.bb10 != null) return row.bb10;
    if (row.rtsports != null) return row.rtsports;
    return null;
  }
  function dcAt(adp) {
    if (adp == null) return null;
    return BB.draftCapital ? BB.draftCapital(Math.round(adp)) : null;
  }
  function applyViewToToolbar() {
    document.querySelectorAll('[data-view-only]').forEach(function (el) {
      var match = el.getAttribute('data-view-only') === state.view;
      el.classList.toggle('view-hidden', !match);
    });
    if (viewToggleEl) {
      viewToggleEl.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-view') === state.view);
      });
    }
  }
  function setView(v) {
    state.view = v;
    try { localStorage.setItem('bb_trends_view', v); } catch (e) {}
    applyViewToToolbar();
    if (v === 'table') ensureTableRows().then(renderTable);
  }

  // Compute change in canonical ADP from first→last day of the range.
  // Returns array of { name, pos, team, startADP, endADP, adpChange, dcChange }
  async function computeTableRows(rangeKey) {
    var dates = state.range === rangeKey ? datesInRange() : (function () {
      // build dates list for the specified range without mutating state
      if (rangeKey === 'all') return state.dates.slice();
      var n = parseInt(rangeKey, 10);
      return state.dates.slice(-n);
    })();
    if (dates.length < 1) return [];
    var startDate = dates[0];
    var endDate = dates[dates.length - 1];

    // If the range has only one day, there's nothing to compare — just show
    // the current snapshot with a 0 change.
    var startDay = await fetchDay(startDate).catch(function () { return null; });
    var endDay   = startDate === endDate ? startDay : await fetchDay(endDate).catch(function () { return null; });
    if (!endDay) return [];

    var startByNorm = {};
    if (startDay) {
      (startDay.players || []).forEach(function (p) {
        startByNorm[window.BB_DATA.normalizeName(p.name)] = p;
      });
    }

    // 216 = last pick of an 18-round, 12-team draft. Used as both the
    // baseline for players who weren't ranked at the start of the range
    // AND as the cap on either side — anything beyond 216 is functionally
    // undraftable, so showing it as 216 keeps changes comparable.
    var BASELINE_ADP = 216;
    function capADP(v) {
      if (v == null) return null;
      return v > BASELINE_ADP ? BASELINE_ADP : v;
    }

    var rows = (endDay.players || []).map(function (endP) {
      var norm = window.BB_DATA.normalizeName(endP.name);
      var startP = startByNorm[norm];
      var rawStart = canonADP(startP);
      var startADP = capADP(rawStart != null ? rawStart : BASELINE_ADP);
      var endADP = capADP(canonADP(endP));
      var adpChange = (endADP != null) ? (startADP - endADP) : null;
      var startDC = dcAt(startADP);
      var endDC = dcAt(endADP);
      var dcChange = (startDC != null && endDC != null) ? (endDC - startDC) : null;
      return {
        name: endP.name,
        pos: endP.pos || '',
        team: endP.team || '',
        startADP: startADP,
        endADP: endADP,
        adpChange: adpChange,
        dcChange: dcChange,
        isNew: rawStart == null && endADP != null,
      };
    });
    return rows;
  }

  async function ensureTableRows() {
    var ts = state.table;
    if (ts.rows && ts.loadedKey === ts.range) return;
    tableContainer.innerHTML = '<div class="empty-state" style="padding:24px;">Loading…</div>';
    ts.rows = await computeTableRows(ts.range);
    ts.loadedKey = ts.range;
  }

  function fmtSigned(v, digits) {
    if (v == null || isNaN(v)) return '—';
    var s = v.toFixed(digits == null ? 1 : digits);
    return (v > 0 ? '+' : (v < 0 ? '' : '')) + s;
  }
  function changeCell(v, colKey, digits) {
    var colAttr = ' data-col="' + colKey + '"';
    if (v == null || isNaN(v)) return '<td class="num"' + colAttr + '>—</td>';
    var arrow = v > 0 ? '▲' : (v < 0 ? '▼' : '');
    var cls   = v > 0 ? 'clv-pos' : (v < 0 ? 'clv-neg' : '');
    return '<td class="num ' + cls + '"' + colAttr + '>' + (arrow ? arrow + ' ' : '') + Math.abs(v).toFixed(digits == null ? 1 : digits) + '</td>';
  }

  var trendsColPicker = null;
  var TREND_COLS = [
    { key: 'team',      label: 'Team',     sortable: true, required: true },
    { key: 'name',      label: 'Player',   sortable: true, required: true },
    { key: 'pos',       label: 'Pos',      sortable: true },
    { key: 'startADP',  label: 'Start ADP', sortable: true, num: true },
    { key: 'endADP',    label: 'End ADP',   sortable: true, num: true },
    { key: 'adpChange', label: 'ADP Change', sortable: true, num: true },
    { key: 'dcChange',  label: 'Draft Capital Change', sortable: true, num: true },
  ];

  function renderTable() {
    var ts = state.table;
    if (!ts.rows) {
      tableContainer.innerHTML = '<div class="empty-state" style="padding:24px;">Loading…</div>';
      return;
    }
    var rows = ts.rows.slice();

    // Filter: position
    if (ts.positions.length) {
      rows = rows.filter(function (r) { return ts.positions.indexOf(r.pos) !== -1; });
    }
    // Filter: search
    var s = ts.search.toLowerCase().trim();
    if (s) {
      rows = rows.filter(function (r) {
        return (r.name || '').toLowerCase().indexOf(s) !== -1 ||
               (r.team || '').toLowerCase().indexOf(s) !== -1;
      });
    }
    // Filter: direction
    if (ts.direction === 'risers')  rows = rows.filter(function (r) { return r.adpChange != null && r.adpChange > 0; });
    if (ts.direction === 'fallers') rows = rows.filter(function (r) { return r.adpChange != null && r.adpChange < 0; });

    // Sort
    var key = ts.sortKey;
    var dir = ts.sortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'name' || key === 'team' || key === 'pos') {
        av = (a[key] || '').toLowerCase(); bv = (b[key] || '').toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      av = a[key]; bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });

    tableMetaEl.textContent = rows.length.toLocaleString() + ' player' + (rows.length === 1 ? '' : 's');

    if (!rows.length) {
      tableContainer.innerHTML = '<div class="empty-state"><h2>No matches</h2><p>Adjust filters or expand the range.</p></div>';
      return;
    }

    if (!trendsColPicker) {
      trendsColPicker = BB.makeColumnPicker({
        storageKey: 'bb_cols_trends_v1',
        scopeClass: 'tbl-trends',
        columns: TREND_COLS,
      });
    }

    var head = '<thead><tr>' + TREND_COLS.map(function (c) {
      var ind = c.key === ts.sortKey ? (ts.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : '');
      return '<th class="' + classes + '" data-key="' + c.key + '" data-col="' + c.key + '">' +
        c.label + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var body = '<tbody>' + rows.map(function (r) {
      var teamCell = r.team
        ? '<a class="team-cell-link" href="team.html?code=' + encodeURIComponent(r.team) + '">' +
            '<span class="player-cell">' + BB.teamLogoHTML(r.team, { size: 18 }) +
            '<strong>' + escapeHtml(r.team) + '</strong></span></a>'
        : '—';
      var playerCell = '<span class="player-cell" data-pos="' + escapeHtml(r.pos) + '">' +
        '<span class="player-name">' +
        '<a href="trends.html?player=' + encodeURIComponent(r.name) + '">' + escapeHtml(r.name) + '</a>' +
        '</span></span>';
      var posBadge = r.pos
        ? '<span class="badge pos-' + escapeHtml(r.pos) + '">' + escapeHtml(r.pos) + '</span>'
        : '—';
      var startCell = r.startADP != null ? r.startADP.toFixed(1) : '—';
      if (r.isNew) startCell = '<span title="Unranked at start of range — defaulted to 216">' + startCell + ' <span style="color:var(--text-muted);font-size:10px;">*</span></span>';
      var endCell   = r.endADP   != null ? r.endADP.toFixed(1)   : '—';
      return '<tr data-pos="' + escapeHtml(r.pos) + '"' + BB.teamColorStyle(r.team) + '>' +
        '<td data-col="team">' + teamCell + '</td>' +
        '<td data-col="name">' + playerCell + '</td>' +
        '<td data-col="pos">' + posBadge + '</td>' +
        '<td class="num" data-col="startADP">' + startCell + '</td>' +
        '<td class="num" data-col="endADP">' + endCell + '</td>' +
        changeCell(r.adpChange, 'adpChange') +
        changeCell(r.dcChange,  'dcChange') +
      '</tr>';
    }).join('') + '</tbody>';

    tableContainer.innerHTML =
      '<div class="table-toolbar">' + trendsColPicker.renderButton() + '</div>' +
      '<div class="tbl-trends"><table class="data">' + head + body + '</table></div>';
    trendsColPicker.bind(tableContainer);

    tableContainer.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (ts.sortKey === k) ts.sortDir = ts.sortDir === 'asc' ? 'desc' : 'asc';
        else { ts.sortKey = k; ts.sortDir = (k === 'name' || k === 'team' || k === 'pos') ? 'asc' : 'desc'; }
        renderTable();
      });
    });
  }

  // Wire up table-view controls
  if (viewToggleEl) {
    viewToggleEl.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });
  }
  if (tablePosFilter) {
    function syncTablePosButtons() {
      tablePosFilter.querySelectorAll('.pos-btn').forEach(function (b) {
        var p = b.getAttribute('data-pos') || '';
        var isActive = p === '' ? state.table.positions.length === 0
                                : state.table.positions.indexOf(p) !== -1;
        b.classList.toggle('active', isActive);
      });
    }
    tablePosFilter.querySelectorAll('.pos-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-pos') || '';
        if (p === '') state.table.positions = [];
        else {
          var idx = state.table.positions.indexOf(p);
          if (idx === -1) state.table.positions.push(p);
          else state.table.positions.splice(idx, 1);
        }
        syncTablePosButtons();
        renderTable();
      });
    });
    syncTablePosButtons();
  }
  if (tableSearchEl) {
    tableSearchEl.addEventListener('input', function (e) {
      state.table.search = e.target.value;
      renderTable();
    });
  }
  if (tableRangeEl) {
    tableRangeEl.addEventListener('change', async function () {
      state.table.range = tableRangeEl.value;
      await ensureTableRows();
      renderTable();
    });
  }
  if (dirToggleEl) {
    dirToggleEl.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.table.direction = b.getAttribute('data-dir');
        dirToggleEl.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderTable();
      });
    });
  }

  async function onPlayerChanged() {
    var name = searchEl.value.trim();
    if (!name) {
      state.selectedPlayer = '';
      renderChart();
      return;
    }
    state.selectedPlayer = name;
    renderEmpty('Loading…');
    state.series = await buildSeriesForPlayer(name);
    renderChart();
  }

  searchEl.addEventListener('change', onPlayerChanged);
  searchEl.addEventListener('input', function () {
    // Only react when the value matches a known player (datalist selection or exact entry)
    var name = searchEl.value.trim();
    if (window.BB_DATA.lookupADP(name)) onPlayerChanged();
  });
  rangeEl.addEventListener('change', async function () {
    state.range = rangeEl.value;
    if (state.selectedPlayer) {
      state.series = await buildSeriesForPlayer(state.selectedPlayer);
    }
    renderChart();
  });

  // "Compare" platform checkboxes — toggle DK / Drafters on top of UD.
  // Persisted so the user's last selection survives a page reload.
  var platformToggleEl = document.getElementById('platform-toggles');
  if (platformToggleEl) {
    try {
      var saved = JSON.parse(localStorage.getItem('bb_trends_compare') || '{}');
      ['dk', 'drafters'].forEach(function (k) {
        if (typeof saved[k] === 'boolean') state.show[k] = saved[k];
      });
    } catch (e) {}
    platformToggleEl.querySelectorAll('input[type=checkbox][data-platform]').forEach(function (input) {
      var key = input.getAttribute('data-platform');
      input.checked = !!state.show[key];
      input.addEventListener('change', function () {
        state.show[key] = input.checked;
        try {
          localStorage.setItem('bb_trends_compare', JSON.stringify({
            dk: !!state.show.dk,
            drafters: !!state.show.drafters,
          }));
        } catch (e) {}
        renderChart();
      });
    });
  }

  (async function init() {
    // Restore persisted view
    try {
      var savedView = localStorage.getItem('bb_trends_view');
      if (savedView === 'table' || savedView === 'chart') state.view = savedView;
    } catch (e) {}
    // ?view=chart|table in the URL overrides saved preference (used by the
    // player page's "View ADP Trend" button to force the Chart view).
    var qsView = new URLSearchParams(location.search).get('view');
    if (qsView === 'chart' || qsView === 'table') {
      state.view = qsView;
      try { localStorage.setItem('bb_trends_view', qsView); } catch (e) {}
    }

    populatePlayerList();
    await loadIndex();
    if (!state.dates.length) {
      renderEmpty('No history available yet. The first daily snapshot will appear after the scheduled refresh runs.');
      applyViewToToolbar();
      return;
    }
    // Deep link: trends.html?player=Name pre-fills the picker
    var qsPlayer = new URLSearchParams(location.search).get('player');
    var startingPlayer = qsPlayer || (window.BB_DATA.adp[0] && window.BB_DATA.adp[0].name);
    if (startingPlayer) {
      searchEl.value = startingPlayer;
      state.selectedPlayer = startingPlayer;
      state.series = await buildSeriesForPlayer(startingPlayer);
    }
    renderChart();
    applyViewToToolbar();
    if (state.view === 'table') {
      await ensureTableRows();
      renderTable();
    }
  })();
})();
