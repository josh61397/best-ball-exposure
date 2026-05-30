(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');
  var searchEl = document.getElementById('search');
  var posEl = document.getElementById('pos-filter');
  var platformEl = document.getElementById('platform-filter');
  var tourneyEl = document.getElementById('tournament-filter');
  var rowCountEl = document.getElementById('row-count');

  var posSummaryEl = document.getElementById('position-summary');
  var viewToggleEl = document.getElementById('view-toggle');
  var rowLabelEl = document.getElementById('row-label');

  var state = {
    view: (function () {
      try { return localStorage.getItem('bb_exposures_view') || 'players'; }
      catch (e) { return 'players'; }
    })(),
    // Independent sort state per view so swapping doesn't lose the user's choice.
    playersSortKey: 'exposurePct',
    playersSortDir: 'desc',
    stacksSortKey: 'stackedRosters',
    stacksSortDir: 'desc',
    search: '',
    pos: '',
    platform: '',
    tournament: '',
    // Which player rows are currently expanded (by normalized name).
    expanded: {},
  };

  function togglePlayerExpand(normName) {
    if (state.expanded[normName]) delete state.expanded[normName];
    else state.expanded[normName] = true;
    render();
  }

  function setView(v) {
    state.view = v;
    try { localStorage.setItem('bb_exposures_view', v); } catch (e) {}
    if (viewToggleEl) {
      viewToggleEl.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-view') === v);
      });
    }
    if (rowLabelEl) rowLabelEl.textContent = v === 'stacks' ? 'teams' : 'players';
    // Stacks view doesn't use the position filter.
    if (posEl) posEl.style.display = v === 'stacks' ? 'none' : '';
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

  function renderPositionSummary(rosters) {
    if (!rosters.length) { posSummaryEl.innerHTML = ''; return; }
    var summary = BB.computePositionSummary(rosters);
    var html = '<div class="position-cards">' + summary.map(function (s) {
      var top = s.topPlayers.length
        ? s.topPlayers.map(function (p) {
            var logo = p.team ? BB.teamLogoHTML(p.team, { size: 14 }) : '';
            return '<li>' + logo + '<a href="player.html?name=' + encodeURIComponent(p.player) + '" class="pc-name">' + escapeHtml(p.player) + '</a>' +
                   '<span class="pc-pct">' + BB.fmtPct(p.pct) + '</span></li>';
          }).join('')
        : '<li style="color:var(--text-muted);">No picks</li>';
      return '<div class="card pos-card">' +
        '<div class="pos-card-head">' +
          '<span class="badge pos-' + s.position + '">' + s.position + '</span>' +
          '<span class="pos-card-stats">' +
            '<strong>' + s.count + '</strong> picks · ' + BB.fmtPct(s.pctOfTotal) +
            (s.avgPick != null ? ' · avg pick ' + s.avgPick.toFixed(1) : '') +
          '</span>' +
        '</div>' +
        '<ol class="pos-card-top">' + top + '</ol>' +
      '</div>';
    }).join('') + '</div>';
    posSummaryEl.innerHTML = html;
  }

  function render() {
    var rosters = getFilteredRosters();
    renderPositionSummary(rosters);
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters match these filters</h2><p>Try clearing filters or <a href="index.html">upload a CSV</a>.</p></div>';
      rowCountEl.textContent = '0';
      var sf = document.getElementById('sf-note'); if (sf) sf.textContent = '';
      return;
    }
    if (state.view === 'stacks') return renderStacks(rosters);
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

    var key = state.playersSortKey;
    var dir = state.playersSortDir === 'asc' ? 1 : -1;
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
      var ind = c.key === state.playersSortKey ? (state.playersSortDir === 'asc' ? '↑' : '↓') : '';
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
        if (state.playersSortKey === k) {
          state.playersSortDir = state.playersSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.playersSortKey = k;
          state.playersSortDir = (k === 'player' || k === 'position' || k === 'team') ? 'asc' : 'desc';
        }
        render();
      });
    });
  }

  // ============================================================
  // STACKS VIEW
  // ============================================================
  var STACK_TT = {
    picks:       'Total picks across all your rosters at this team.\n\nFormula: Σ picks where pick.team = this team.',
    pctWithTeam: '% of your rosters that contain at least one player from this team.\n\nHeat-mapped green→red across visible teams.',
    stacks:      'Number of your rosters that contain 2 or more players from this team.',
    stackRate:   '% of your rosters that have ≥2 players from this team.\n\nFormula: stacked rosters / total rosters.\n\nHeat-mapped green→red across visible teams.',
    avgSize:     'Average number of players from this team on the rosters where you have a stack (2+).',
    topCombo:    'Most common position composition on stacked rosters for this team. \"QB+WR\" means QB and one WR; \"WR+WR+TE\" means two WRs and a TE; etc.',
    fees:        'Total entry fees of rosters containing players from this team.',
  };

  var STACK_COLS = [
    { key: 'team',                  label: 'Team',         sortable: true },
    { key: 'totalPicks',            label: 'Picks',        sortable: true, num: true, tooltip: STACK_TT.picks },
    { key: 'rostersWithTeam',       label: 'Rosters',      sortable: true, num: true },
    { key: 'pctWithTeam',           label: '% With',       sortable: true, num: true, tooltip: STACK_TT.pctWithTeam },
    { key: 'stackedRosters',        label: 'Stacks',       sortable: true, num: true, tooltip: STACK_TT.stacks },
    { key: 'stackRate',             label: 'Stack %',      sortable: true, num: true, tooltip: STACK_TT.stackRate },
    { key: 'avgPlayersWhenStacked', label: 'Avg Size',     sortable: true, num: true, tooltip: STACK_TT.avgSize },
    { key: 'topCombo',              label: 'Top Combo',    sortable: true, tooltip: STACK_TT.topCombo },
    { key: 'fees',                  label: 'Fees',         sortable: true, num: true, tooltip: STACK_TT.fees },
  ];

  function renderStacks(rosters) {
    var rows = BB.computeTeamStacks(rosters);
    var s = state.search.toLowerCase().trim();
    if (s) {
      rows = rows.filter(function (r) {
        if ((r.team || '').toLowerCase().indexOf(s) !== -1) return true;
        if ((r.topCombo || '').toLowerCase().indexOf(s) !== -1) return true;
        return false;
      });
    }

    var key = state.stacksSortKey;
    var dir = state.stacksSortDir === 'asc' ? 1 : -1;
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
    var sf = document.getElementById('sf-note'); if (sf) sf.textContent = '';

    var head = '<thead><tr>' + STACK_COLS.map(function (c) {
      var ind = c.key === state.stacksSortKey ? (state.stacksSortDir === 'asc' ? '↑' : '↓') : '';
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
        if (state.stacksSortKey === k) {
          state.stacksSortDir = state.stacksSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.stacksSortKey = k;
          state.stacksSortDir = (k === 'team' || k === 'topCombo') ? 'asc' : 'desc';
        }
        render();
      });
    });
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; render(); });
  posEl.addEventListener('change', function (e) { state.pos = e.target.value; render(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; render(); });
  tourneyEl.addEventListener('change', function (e) { state.tournament = e.target.value; render(); });

  if (viewToggleEl) {
    viewToggleEl.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        setView(b.getAttribute('data-view'));
      });
    });
  }

  populateFilters();
  setView(state.view); // applies persisted view and renders
})();
