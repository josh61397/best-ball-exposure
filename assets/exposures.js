(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var posEl = document.getElementById('pos-filter');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var contextEl = document.getElementById('context-filter');
  var rowCountEl = document.getElementById('row-count');

  var state = {
    sortKey: 'exposurePct',
    sortDir: 'desc',
    search: '',
    pos: '',
    platform: '',
    tournament: '',
    context: '',
    // Which player rows are currently expanded (by normalized name).
    expanded: {},
  };

  function togglePlayerExpand(normName) {
    if (state.expanded[normName]) delete state.expanded[normName];
    else state.expanded[normName] = true;
    render();
  }

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

  // Shared heat-map style used by both views.
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

  function render() {
    var rosters = getFilteredRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      var sf = document.getElementById('sf-note'); if (sf) sf.textContent = '';
      return;
    }
    return renderPlayers(rosters);
  }

  function renderComboPanel(playerRow, rosters) {
    var report = BB.playerReport(rosters, playerRow.player);
    var combos = (report.combos || []).slice(0, 8);
    var liftText = function (lift) {
      if (lift == null || isNaN(lift)) return '—';
      return lift.toFixed(2) + 'x';
    };
    if (!combos.length) {
      return '<div class="combo-panel"><p style="color:var(--text-muted);font-size:13px;margin:0;">No combo data — player is not on any visible rosters.</p></div>';
    }
    var header = '<div class="combo-panel-head">' +
      '<div>' +
        '<strong>Combo ownership for ' + escapeHtml(playerRow.player) + '</strong>' +
        ' <span style="color:var(--text-muted);font-size:12px;">— on ' + report.exposureCount + ' of ' + report.totalRosters + ' rosters</span>' +
      '</div>' +
      '<a class="combo-panel-link" href="player.html?name=' + encodeURIComponent(playerRow.player) + '">Full player page →</a>' +
    '</div>';

    var rows = combos.map(function (c) {
      var liftCls = c.lift == null ? '' : (c.lift >= 1.15 ? 'clv-pos' : (c.lift <= 0.85 ? 'clv-neg' : ''));
      var nameCell = c.player ? BB.playerCell(c.player, c.team, { linkToPlayer: true, size: 14 }) : '—';
      return '<tr>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + (c.position ? '<span class="badge pos-' + escapeHtml(c.position) + '">' + escapeHtml(c.position) + '</span>' : '—') + '</td>' +
        '<td>' + escapeHtml(c.team || '—') + '</td>' +
        '<td class="num">' + c.coCount + '</td>' +
        '<td class="num">' + BB.fmtPct(c.comboPct) + '</td>' +
        '<td class="num">' + BB.fmtPct(c.theirExposurePct) + '</td>' +
        '<td class="num ' + liftCls + '">' + liftText(c.lift) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="combo-panel">' +
      header +
      '<table class="data combo-table"><thead><tr>' +
        '<th>Teammate</th><th>Pos</th><th>Tm</th>' +
        '<th class="num">Co-Drafted</th><th class="num">Combo %</th>' +
        '<th class="num">Their %</th><th class="num">Lift</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="combo-panel-foot">' +
        '<strong>Combo %</strong> = of rosters with ' + escapeHtml(playerRow.player) + ', what fraction also have the teammate. ' +
        '<strong>Lift</strong> = combo % ÷ teammate\'s overall %. &gt;1 means correlated, &lt;1 anti-correlated.' +
      '</p>' +
    '</div>';
  }

  function renderPlayers(rosters) {
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
    var rExp = rangeFor(rows, 'exposurePct');
    var rFees = rangeFor(rows, 'feesPct');
    var allRosters = rosters; // captured for the combo lookup when rows expand
    var colSpan = COLS.length;

    var body = '<tbody>' + rows.map(function (r) {
      var denom = (r.count && r.exposurePct) ? Math.round(r.count / r.exposurePct) : totalRosters;
      var normName = window.BB_DATA ? window.BB_DATA.normalizeName(r.player) : r.player.toLowerCase();
      var isExpanded = !!state.expanded[normName];
      var chevron = '<button type="button" class="row-expand-btn" data-norm="' + escapeHtml(normName) +
        '" aria-expanded="' + isExpanded + '" aria-label="' + (isExpanded ? 'Collapse' : 'Expand') + ' combo ownership for ' + escapeHtml(r.player) + '">' +
        '<span class="chevron">' + (isExpanded ? '▾' : '▸') + '</span>' +
        '</button>';
      // Inline the chevron with the player cell.
      var playerCell = BB.playerCell(r.player, r.team, { linkToPlayer: true });
      var combinedCell = '<span class="player-cell-with-expand">' + chevron + playerCell + '</span>';
      var trClass = 'row-expandable' + (isExpanded ? ' is-expanded' : '');
      var mainTr = '<tr class="' + trClass + '" data-norm="' + escapeHtml(normName) + '">' +
        '<td>' + combinedCell + '</td>' +
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
      var detailTr = isExpanded
        ? '<tr class="row-expand-detail"><td colspan="' + colSpan + '">' + renderComboPanel(r, allRosters) + '</td></tr>'
        : '';
      return mainTr + detailTr;
    }).join('') + '</tbody>';

    contentEl.innerHTML = '<table class="data">' + head + body + '</table>';

    // Wire up expand toggles. Use the chevron button as the click target so
    // clicks on the player name link, the row background, etc. don't fight
    // for the same event.
    contentEl.querySelectorAll('.row-expand-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePlayerExpand(btn.getAttribute('data-norm'));
      });
    });
    // Allow clicking anywhere on the row (outside the name link / sort header)
    // to toggle as well — better discoverability than icon-only.
    contentEl.querySelectorAll('tr.row-expandable').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        if (e.target.closest('.row-expand-btn')) return;
        togglePlayerExpand(tr.getAttribute('data-norm'));
      });
    });

    contentEl.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (state.sortKey === k) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = k;
          state.sortDir = (k === 'player' || k === 'position' || k === 'team') ? 'asc' : 'desc';
        }
        render();
      });
    });
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; render(); });
  posEl.addEventListener('change', function (e) { state.pos = e.target.value; render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; render(); });
  if (contextEl) contextEl.addEventListener('change', function (e) { state.context = e.target.value; render(); });

  populateFilters();
  render();
})();
