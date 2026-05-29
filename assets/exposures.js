(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var posEl = document.getElementById('pos-filter');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var rowCountEl = document.getElementById('row-count');

  var state = {
    sortKey: 'exposurePct',
    sortDir: 'desc',
    search: '',
    pos: '',
    platform: '',
    tournament: '',
  };

  var TT = {
    pctDrafted: '% of your rosters that contain this player.\n\nFormula: rosters with player / total rosters.\n\nHeat-mapped green→red relative to the currently visible rows.',
    fees:       'Sum of the entry fees of every roster that contains this player.\n\nFormula: Σ entryFee for rosters with player.',
    feesPct:    'Player\'s share of your total entry fees.\n\nFormula: this player\'s Fees / total entry fees across all rosters.\n\nHeat-mapped green→red relative to the currently visible rows.',
    myADP:      'Your average draft pick number for this player across the rosters where you drafted them.',
    marketADP:  'Market ADP today (Underdog when available, else DraftKings, else Drafters).',
    clv:        'Closing Line Value per pick.\n\nFormula: My ADP − Market ADP.\n\nPositive (green) = you got the player later than market expected = value. Negative (red) = you reached.',
  };

  var COLS = [
    { key: 'player',      label: 'Player',     sortable: true },
    { key: 'position',    label: 'Pos',        sortable: true },
    { key: 'team',        label: 'Tm',         sortable: true },
    { key: 'count',       label: 'Drafted',    sortable: true, num: true },
    { key: 'exposurePct', label: '% Drafted',  sortable: true, num: true, tooltip: TT.pctDrafted },
    { key: 'fees',        label: 'Fees',       sortable: true, num: true, tooltip: TT.fees },
    { key: 'feesPct',     label: '% of Fees',  sortable: true, num: true, tooltip: TT.feesPct },
    { key: 'myADP',       label: 'My ADP',     sortable: true, num: true, tooltip: TT.myADP },
    { key: 'marketADP',   label: 'ADP',        sortable: true, num: true, tooltip: TT.marketADP },
    { key: 'clv',         label: 'CLV',        sortable: true, num: true, tooltip: TT.clv },
  ];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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

  function clvClass(clv) {
    if (clv == null) return '';
    if (clv > 0.05) return 'clv-pos';
    if (clv < -0.05) return 'clv-neg';
    return '';
  }
  function clvText(clv) {
    if (clv == null) return '—';
    var sign = clv > 0 ? '+' : '';
    return sign + clv.toFixed(1);
  }

  function render() {
    var rosters = getFilteredRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      return;
    }
    var rows = BB.computeExposures(rosters);
    var superflexExcluded = rows.__superflexExcluded || 0;
    var search = state.search.toLowerCase().trim();
    rows = rows.filter(function (r) {
      if (state.pos && r.position !== state.pos) return false;
      if (search && (r.player || '').toLowerCase().indexOf(search) === -1) return false;
      return true;
    });
    rows.__superflexExcluded = superflexExcluded;

    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'player' || key === 'position' || key === 'team') {
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

    // Surface how many Superflex rosters were excluded from ADP/CLV calcs
    var sfNote = document.getElementById('sf-note');
    if (!sfNote) {
      sfNote = document.createElement('div');
      sfNote.id = 'sf-note';
      sfNote.style.cssText = 'color:var(--text-muted);font-size:12px;margin-bottom:8px;';
      contentEl.parentNode.insertBefore(sfNote, contentEl);
    }
    sfNote.textContent = superflexExcluded
      ? superflexExcluded + ' Superflex roster' + (superflexExcluded === 1 ? '' : 's') + ' excluded from My ADP / CLV (no Superflex market ADP available). Counts and fees still include them.'
      : '';

    var head = '<thead><tr>' + COLS.map(function (c) {
      var ind = c.key === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + (c.sortable ? 'sortable' : '') + (c.tooltip ? ' tooltip-trigger' : '');
      var ttAttr = c.tooltip ? ' data-tooltip="' + c.tooltip.replace(/"/g, '&quot;') + '"' : '';
      var info = c.tooltip ? ' <span class="info-mark">ⓘ</span>' : '';
      return '<th class="' + classes + '" data-key="' + c.key + '"' + ttAttr + '>' +
        c.label + info + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr></thead>';

    var totalRosters = rows.length && rows[0].exposurePct ? Math.round(rows[0].count / rows[0].exposurePct) : 0;

    // Heat-map ranges for % Drafted and % of Fees — relative to the
    // currently visible rows so the gradient highlights your portfolio's
    // own spread, not a fixed 0-100% scale.
    function rangeFor(key) {
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
    var rExp = rangeFor('exposurePct');
    var rFees = rangeFor('feesPct');
    function heatStyle(v, range) {
      if (range == null || v == null || isNaN(v)) return '';
      var t = (v - range.min) / (range.max - range.min);
      if (t < 0) t = 0; else if (t > 1) t = 1;
      // Push the midpoint away from neutral so extremes pop more.
      // Curve maps 0→0, 0.5→0.5, 1→1 but pulls the middle out toward the ends.
      var curved = t < 0.5
        ? 0.5 * Math.pow(2 * t, 1.4)
        : 1 - 0.5 * Math.pow(2 * (1 - t), 1.4);
      var hue = Math.round(curved * 120);
      // Bumped alpha + saturation for a more dramatic spread.
      return ' style="background: hsla(' + hue + ', 85%, 50%, 0.38);"';
    }

    var body = '<tbody>' + rows.map(function (r) {
      var denom = (r.count && r.exposurePct) ? Math.round(r.count / r.exposurePct) : totalRosters;
      var cell = BB.playerCell(r.player, r.team, { linkToPlayer: true });
      return '<tr>' +
        '<td>' + cell + '</td>' +
        '<td>' + (r.position ? '<span class="badge pos-' + escapeHtml(r.position) + '">' + escapeHtml(r.position) + '</span>' : '—') + '</td>' +
        '<td>' + escapeHtml(r.team || '—') + '</td>' +
        '<td class="num"><span title="' + r.count + ' of ' + denom + ' rosters">' + r.count + '</span></td>' +
        '<td class="num"' + heatStyle(r.exposurePct, rExp) + '>' + BB.fmtPct(r.exposurePct) + '</td>' +
        '<td class="num">' + BB.fmtMoney(r.fees) + '</td>' +
        '<td class="num"' + heatStyle(r.feesPct, rFees) + '>' + BB.fmtPct(r.feesPct) + '</td>' +
        '<td class="num">' + BB.fmtADP(r.myADP) + '</td>' +
        '<td class="num">' + BB.fmtADP(r.marketADP) + '</td>' +
        '<td class="num ' + clvClass(r.clv) + '">' + clvText(r.clv) + '</td>' +
        '</tr>';
    }).join('') + '</tbody>';

    contentEl.innerHTML = '<table class="data">' + head + body + '</table>';

    contentEl.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = (k === 'player' || k === 'position' || k === 'team') ? 'asc' : 'desc'; }
        render();
      });
    });
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; render(); });
  posEl.addEventListener('change', function (e) { state.pos = e.target.value; render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; render(); });

  populateFilters();
  render();
})();
