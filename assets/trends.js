(function () {
  'use strict';
  if (!window.BB || !window.BB_DATA) return;

  var SERIES = [
    { key: 'ud',       label: 'Underdog',   color: '#6cf' },
    { key: 'dk',       label: 'DraftKings', color: '#5ac46d' },
    { key: 'drafters', label: 'Drafters',   color: '#c66cff' },
    { key: 'bb10',     label: 'BB10',       color: '#f5b452' },
    { key: 'rtsports', label: 'RTSports',   color: '#ef6a6a' },
  ];

  var state = {
    dates: [],             // list of YYYY-MM-DD strings
    selectedPlayer: '',
    range: '30',
    perDayCache: {},       // date -> parsed JSON (player rows)
    series: null,          // { date -> { ud, dk, drafters, bb10, rtsports } } for selected player
  };

  var searchEl = document.getElementById('player-search');
  var listEl = document.getElementById('player-list');
  var rangeEl = document.getElementById('range');
  var historyMetaEl = document.getElementById('history-meta');
  var chartEl = document.getElementById('chart-container');
  var legendEl = document.getElementById('legend');
  var playerMetaEl = document.getElementById('player-meta');

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
    var resp = await fetch('data/history/' + date + '.json', { cache: 'force-cache' });
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

    // Compute Y range across all platforms (lower = better, invert)
    var allValues = [];
    SERIES.forEach(function (s) {
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

    var paths = SERIES.map(function (s) {
      var d = buildPath(s.key);
      if (!d) return '';
      return '<path d="' + d + '" stroke="' + s.color + '" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>';
    }).join('');

    var dots = SERIES.map(function (s) {
      return dataDates.map(function (date, i) {
        var v = series[date][s.key];
        if (v == null) return '';
        var cx = x(i, dataDates.length);
        var cy = y(v);
        return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="2.5" fill="' + s.color + '"></circle>';
      }).join('');
    }).join('');

    var yGrid = yTicks.map(function (t) {
      return '<line x1="0" x2="' + innerW + '" y1="' + t.y.toFixed(1) + '" y2="' + t.y.toFixed(1) + '" stroke="#2a2f3a" stroke-dasharray="2,3"/>' +
        '<text x="-10" y="' + (t.y + 4).toFixed(1) + '" text-anchor="end" fill="#9aa3b2" font-size="11">' + t.label + '</text>';
    }).join('');

    var xLabelsHtml = xLabels.map(function (l) {
      return '<text x="' + l.x.toFixed(1) + '" y="' + (innerH + 20) + '" text-anchor="middle" fill="#9aa3b2" font-size="11">' + l.label + '</text>';
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
          '<text x="-40" y="-4" fill="#9aa3b2" font-size="10" text-anchor="start">↑ better (lower ADP)</text>' +
          yGrid +
          xLabelsHtml +
          paths +
          dots +
          hover +
          '<line x1="0" x2="0" y1="0" y2="' + innerH + '" stroke="var(--border)"/>' +
          '<line x1="0" x2="' + innerW + '" y1="' + innerH + '" y2="' + innerH + '" stroke="var(--border)"/>' +
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
        SERIES.forEach(function (s) {
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
    SERIES.forEach(function (s) {
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

  (async function init() {
    populatePlayerList();
    await loadIndex();
    if (!state.dates.length) {
      renderEmpty('No history available yet. The first daily snapshot will appear after the scheduled refresh runs.');
      return;
    }
    // Default to Bijan Robinson if available, otherwise the #1 ADP player
    var defaultPlayer = window.BB_DATA.adp[0] && window.BB_DATA.adp[0].name;
    if (defaultPlayer) {
      searchEl.value = defaultPlayer;
      state.selectedPlayer = defaultPlayer;
      state.series = await buildSeriesForPlayer(defaultPlayer);
    }
    renderChart();
  })();
})();
