(function () {
  'use strict';
  if (!window.BB) return;

  var pageEl = document.getElementById('page-content');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(-2);
  }

  // ============================================================
  // TABLE VIEW
  // ============================================================
  var state = {
    sortKey: 'draftedAt',
    sortDir: 'desc',
    search: '',
    platform: '',
    // computed rows: { roster, value: { clv, rtv, historicalAdpUsed } }
    enriched: [],
  };

  function init() {
    var qs = new URLSearchParams(location.search);
    if (qs.get('id')) {
      renderDetail(qs.get('id'));
    } else {
      renderTable();
    }
  }

  async function renderTable() {
    var rosters = BB.loadRosters();
    pageEl.innerHTML = renderHeader() + renderToolbarSkeleton() +
      '<div id="table-wrap"><div class="empty-state" style="padding:24px;">Loading…</div></div>';

    if (!rosters.length) {
      document.getElementById('table-wrap').innerHTML =
        '<div class="empty-state"><h2>No rosters yet</h2><p>Drop a CSV on the <a href="index.html">upload</a> page.</p></div>';
      return;
    }

    populatePlatformFilter(rosters);
    bindToolbar();

    // Compute CLV / RTV per roster — async for CLV (needs historical fetch).
    state.enriched = await Promise.all(rosters.map(async function (r) {
      var value = await BB.rosterClvRtv(r);
      return { roster: r, value: value };
    }));

    redrawTable();
  }

  function renderHeader() {
    return '<h1>Rosters</h1>' +
      '<p class="lede">All your imported drafts in one table. Click a row to see picks and stacks. Heat-map shows value relative to the visible rows.</p>';
  }

  function renderToolbarSkeleton() {
    return '<div class="toolbar">' +
      '<input type="search" id="search" placeholder="Search tournament or player…" style="min-width:240px;" />' +
      '<select id="platform-filter"><option value="">All platforms</option></select>' +
      '<div style="margin-left:auto;color:var(--text-muted);font-size:12px;" id="row-count"></div>' +
    '</div>';
  }

  function populatePlatformFilter(rosters) {
    var plats = {};
    rosters.forEach(function (r) { plats[r.platform] = true; });
    var sel = document.getElementById('platform-filter');
    sel.innerHTML = '<option value="">All platforms</option>' +
      Object.keys(plats).sort().map(function (p) { return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('');
    sel.value = state.platform;
  }

  function bindToolbar() {
    document.getElementById('search').value = state.search;
    document.getElementById('search').addEventListener('input', function (e) {
      state.search = e.target.value;
      redrawTable();
    });
    document.getElementById('platform-filter').addEventListener('change', function (e) {
      state.platform = e.target.value;
      redrawTable();
    });
  }

  function visibleRows() {
    var s = state.search.toLowerCase().trim();
    return state.enriched.filter(function (row) {
      var r = row.roster;
      if (state.platform && r.platform !== state.platform) return false;
      if (!s) return true;
      if ((r.tournament || '').toLowerCase().indexOf(s) !== -1) return true;
      return r.picks.some(function (p) { return (p.player || '').toLowerCase().indexOf(s) !== -1; });
    });
  }

  function redrawTable() {
    var rows = visibleRows();
    document.getElementById('row-count').textContent =
      rows.length === state.enriched.length
        ? rows.length + ' draft' + (rows.length === 1 ? '' : 's')
        : rows.length + ' of ' + state.enriched.length + ' drafts';

    // Sort
    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av = rowValue(a, key);
      var bv = rowValue(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') {
        return av.toLowerCase() < bv.toLowerCase() ? -1 * dir : av.toLowerCase() > bv.toLowerCase() ? 1 * dir : 0;
      }
      return (av - bv) * dir;
    });

    // Heat-map ranges for the four value columns
    function rangeFor(getter) {
      var min = Infinity, max = -Infinity;
      rows.forEach(function (r) {
        var v = getter(r);
        if (v == null || isNaN(v)) return;
        if (v < min) min = v;
        if (v > max) max = v;
      });
      if (!isFinite(min) || !isFinite(max) || min === max) return null;
      return { min: min, max: max };
    }
    var rClvAdp = rangeFor(function (r) { return r.value.clv.totalADP; });
    var rClvDcv = rangeFor(function (r) { return r.value.dcvClv.total; });
    var rRtvAdp = rangeFor(function (r) { return r.value.rtv.totalADP; });
    var rRtvDcv = rangeFor(function (r) { return r.value.dcvRtv.total; });

    // Tooltip copy for the CLV / RTV columns.
    // Convention: positive = drafted LATER than market = value mined.
    var TT = {
      clv: 'Closing Line Value (CLV)\n\n' +
           'How much value you mined relative to where the market was drafting these players around the time of your draft.\n\n' +
           'Uses the market ADP snapshot from your draft date (when we have one). For drafts older than our daily ADP history, falls back to today\'s ADP — so for those rows CLV will match RTV until we re-import.',
      rtv: 'Real-Time Value (RTV)\n\n' +
           'How much value those same picks hold right now, using today\'s market ADP. Positive numbers mean you got the player later than the market does today.',
      clvAdp: 'Total ADP CLV. Each pick\'s ADP CLV is calculated as:\n  Your pick # − Market ADP at draft date\n\nPositive = drafted later than market = value. Treats every pick as equally valuable.',
      clvDcv: 'Total Draft Capital CLV. Each pick\'s Draft Capital CLV is calculated as:\n  The Draft Capital used to select the player − The Draft Capital value at the player\'s ADP at draft date\n\nNegative = you spent less draft capital than the player was worth at the time = value. Positive = reach. Uses Michael Leone\'s Draft Capital weights so early-round value > late-round value.',
      rtvAdp: 'Total ADP RTV. Each pick\'s ADP RTV is calculated as:\n  Your pick # − Today\'s Market ADP\n\nPositive = today\'s market would draft this player earlier than you did = your pick aged well.',
      rtvDcv: 'Total Draft Capital RTV. Each pick\'s Draft Capital RTV is calculated as:\n  The Draft Capital used to select the player − The Draft Capital value at the player\'s current ADP\n\nNegative = you spent less draft capital than the player is worth today = value. Positive = reach.',
    };

    var headerCells = [
      { key: 'tournament', label: 'Title',           group: 'Draft Info' },
      { key: 'draftedAt',  label: 'Date',            group: 'Draft Info', num: true },
      { key: 'format',     label: 'Type',            group: 'Draft Info' },
      { key: 'entryFee',   label: 'Fee',             group: 'Draft Info', num: true },
      { key: 'draftSize',  label: 'Size',            group: 'Draft Info', num: true },
      { key: 'position',   label: 'Position',        group: 'Draft Info', num: true },
      { key: 'clvAdp',     label: 'ADP',             group: 'CLV',        num: true, tooltip: TT.clvAdp },
      { key: 'clvDcv',     label: 'Draft Capital',   group: 'CLV',        num: true, tooltip: TT.clvDcv },
      { key: 'rtvAdp',     label: 'ADP',             group: 'RTV',        num: true, tooltip: TT.rtvAdp },
      { key: 'rtvDcv',     label: 'Draft Capital',   group: 'RTV',        num: true, tooltip: TT.rtvDcv },
    ];

    // Build two-tier header (group row + label row)
    var groups = [];
    headerCells.forEach(function (c) {
      var last = groups[groups.length - 1];
      if (last && last.label === c.group) last.span++;
      else groups.push({ label: c.group, span: 1 });
    });
    var GROUP_TOOLTIPS = { 'CLV': TT.clv, 'RTV': TT.rtv };
    var groupRow = '<tr class="hdr-group">' + groups.map(function (g) {
      var tt = GROUP_TOOLTIPS[g.label];
      var classes = g.label === 'Draft Info' ? '' : 'group-' + g.label.toLowerCase();
      var ttAttrs = tt ? ' class="' + classes + ' tooltip-trigger" data-tooltip="' + escapeHtml(tt) + '"' : ' class="' + classes + '"';
      var label = tt ? g.label + ' <span class="info-mark">ⓘ</span>' : g.label;
      return '<th colspan="' + g.span + '"' + ttAttrs + '>' + label + '</th>';
    }).join('') + '</tr>';

    var headerRow = '<tr>' + headerCells.map(function (c) {
      var ind = c.key === state.sortKey ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
      var classes = (c.num ? 'num ' : '') + 'sortable' + (c.tooltip ? ' tooltip-trigger' : '');
      var ttAttr = c.tooltip ? ' data-tooltip="' + escapeHtml(c.tooltip) + '"' : '';
      var info = c.tooltip ? ' <span class="info-mark">ⓘ</span>' : '';
      return '<th class="' + classes + '" data-key="' + c.key + '"' + ttAttr + '>' +
        c.label + info + (ind ? ' <span class="sort-ind">' + ind + '</span>' : '') + '</th>';
    }).join('') + '</tr>';

    function fmtClvCell(v) {
      if (v == null || isNaN(v)) return '—';
      return (v > 0 ? '+' : '') + v.toFixed(1);
    }

    var body = rows.map(function (row) {
      var r = row.roster;
      var v = row.value;
      var fmt = BB.rosterFormat(r);
      var pos = BB.rosterDraftPosition(r);
      var rosterHref = 'rosters.html?id=' + encodeURIComponent(r.rosterId);
      return '<tr class="row-link" data-href="' + escapeHtml(rosterHref) + '">' +
        '<td><a href="' + escapeHtml(rosterHref) + '">' + escapeHtml(r.tournament || '(unknown)') + '</a></td>' +
        '<td class="num">' + fmtDate(r.draftedAt) + '</td>' +
        '<td>' + (fmt ? '<span class="badge">' + escapeHtml(fmt) + '</span>' : '—') + '</td>' +
        '<td class="num">' + (r.entryFee != null ? BB.fmtMoney(r.entryFee) : '—') + '</td>' +
        '<td class="num">' + (r.draftSize != null ? r.draftSize : '—') + '</td>' +
        '<td class="num">' + (pos != null ? pos : '—') + '</td>' +
        '<td class="num"' + BB.heatStyle(v.clv.totalADP, rClvAdp) + '>' + fmtClvCell(v.clv.totalADP) + '</td>' +
        '<td class="num"' + BB.heatStyle(v.dcvClv.total, rClvDcv, { invert: true }) + '>' + fmtClvCell(v.dcvClv.total) + '</td>' +
        '<td class="num"' + BB.heatStyle(v.rtv.totalADP, rRtvAdp) + '>' + fmtClvCell(v.rtv.totalADP) + '</td>' +
        '<td class="num"' + BB.heatStyle(v.dcvRtv.total, rRtvDcv, { invert: true }) + '>' + fmtClvCell(v.dcvRtv.total) + '</td>' +
        '</tr>';
    }).join('');

    document.getElementById('table-wrap').innerHTML =
      '<table class="data roster-table"><thead>' + groupRow + headerRow + '</thead><tbody>' + body + '</tbody></table>' +
      '<p style="color:var(--text-muted);font-size:12px;margin-top:8px;">' +
        'CLV uses market ADP at draft date when available; older drafts fall back to today\'s ADP (matches RTV). As daily history accumulates, CLV will reflect true closing-line value for new drafts.' +
      '</p>';

    document.querySelectorAll('.row-link').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        // Don't hijack clicks on the actual <a> inside
        if (e.target.tagName === 'A') return;
        location.href = tr.getAttribute('data-href');
      });
    });
    document.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-key');
        if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = k; state.sortDir = (k === 'tournament' || k === 'format') ? 'asc' : 'desc'; }
        redrawTable();
      });
    });
  }

  function rowValue(row, key) {
    var r = row.roster, v = row.value;
    switch (key) {
      case 'tournament': return r.tournament || '';
      case 'draftedAt':  return r.draftedAt || null;
      case 'format':     return BB.rosterFormat(r) || '';
      case 'entryFee':   return r.entryFee;
      case 'draftSize':  return r.draftSize;
      case 'position':   return BB.rosterDraftPosition(r);
      case 'clvAdp':     return v.clv.totalADP;
      case 'clvDcv':     return v.dcvClv.total;
      case 'rtvAdp':     return v.rtv.totalADP;
      case 'rtvDcv':     return v.dcvRtv.total;
      default: return null;
    }
  }

  // ============================================================
  // DETAIL VIEW (rosters.html?id=X)
  // ============================================================
  function renderDetail(rosterId) {
    var roster = BB.loadRosters().find(function (r) { return r.rosterId === rosterId; });
    if (!roster) {
      pageEl.innerHTML = '<div class="empty-state"><h2>Roster not found</h2><p><a href="rosters.html">← Back to rosters</a></p></div>';
      return;
    }

    var counts = {};
    roster.picks.forEach(function (p) { counts[p.position] = (counts[p.position] || 0) + 1; });

    var qbs = roster.picks.filter(function (p) { return p.position === 'QB'; });
    var stacks = qbs.map(function (qb) {
      var mates = roster.picks.filter(function (p) {
        return p.team && qb.team && p.team === qb.team && p.player !== qb.player &&
               (p.position === 'WR' || p.position === 'TE' || p.position === 'RB');
      });
      return { qb: qb, mates: mates };
    });

    var fmt = BB.rosterFormat(roster);
    var pos = BB.rosterDraftPosition(roster);

    var head =
      '<div style="margin-bottom:16px;">' +
        '<a href="rosters.html" style="font-size:13px;color:var(--text-dim);">← Back to all rosters</a>' +
      '</div>' +
      '<div class="card" style="margin-bottom:16px;">' +
        '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;">' +
          '<div style="flex:1;min-width:240px;">' +
            '<div class="stat-label">Tournament</div>' +
            '<div style="font-size:18px;font-weight:600;">' + escapeHtml(roster.tournament || '(no tournament)') + '</div>' +
            '<div class="stat-sub">' + escapeHtml(roster.platform) +
              (roster.entryFee ? ' · entry ' + BB.fmtMoney(roster.entryFee) : '') +
              (roster.draftSize ? ' · ' + roster.draftSize + '-man' : '') +
              (pos != null ? ' · pick ' + pos : '') +
              (fmt ? ' · ' + escapeHtml(fmt) : '') +
              (roster.draftedAt ? ' · ' + fmtDate(roster.draftedAt) : '') +
            '</div>' +
          '</div>' +
          '<div><div class="stat-label">Roster ID</div><div style="font-family:ui-monospace,monospace;font-size:11px;color:var(--text-muted);">' + escapeHtml(roster.rosterId) + '</div></div>' +
        '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
          ['QB','RB','WR','TE'].map(function (p) {
            return '<span class="badge pos-' + p + '">' + p + ' ' + (counts[p] || 0) + '</span>';
          }).join('') +
        '</div>' +
      '</div>';

    var picksHtml = '<h2>Picks</h2>';
    if (!roster.picks.length) {
      picksHtml += '<div class="empty-state">No picks on this roster.</div>';
    } else {
      picksHtml += '<table class="data"><thead><tr>' +
        '<th class="num">Rd</th>' +
        '<th class="num">Pick</th>' +
        '<th>Player</th>' +
        '<th>Pos</th>' +
        '<th>Tm</th>' +
        '<th class="num">Market ADP</th>' +
        '<th class="num">ADP</th>' +
        '<th class="num">Draft Capital</th>' +
        '</tr></thead><tbody>' +
        roster.picks.map(function (p) {
          var refADP = window.BB_DATA ? window.BB_DATA.lookupADP(p.player) : null;
          var udAdp = refADP && refADP.ud != null ? refADP.ud : (p.siteADP != null ? p.siteADP : null);
          // ADP value (Pick − ADP): positive = drafted later than market = value (green)
          var adpVal = (p.overallPick != null && udAdp != null) ? p.overallPick - udAdp : null;
          var adpValCls = adpVal == null ? '' : adpVal > 0 ? 'clv-pos' : (adpVal < 0 ? 'clv-neg' : '');
          var adpValText = adpVal == null ? '—' : (adpVal > 0 ? '+' : '') + adpVal.toFixed(1);
          // Draft Capital value (DC(Pick) − DC(ADP)): negative = value (drafted later)
          var dcPick = p.overallPick != null ? BB.draftCapital(p.overallPick) : null;
          var dcAdp = udAdp != null ? BB.draftCapital(udAdp) : null;
          var dcv = (dcPick != null && dcAdp != null) ? dcPick - dcAdp : null;
          // Negative DCV is value, so we flip the classification for color.
          var dcvCls = dcv == null ? '' : dcv < 0 ? 'clv-pos' : (dcv > 0 ? 'clv-neg' : '');
          var dcvText = dcv == null ? '—' : (dcv > 0 ? '+' : '') + dcv.toFixed(1);
          var nameCell = p.player ? BB.playerCell(p.player, p.team, { linkToPlayer: true }) : '—';
          return '<tr>' +
            '<td class="num">' + (p.round != null ? p.round : '—') + '</td>' +
            '<td class="num">' + (p.overallPick != null ? p.overallPick : '—') + '</td>' +
            '<td>' + nameCell + '</td>' +
            '<td>' + (p.position ? '<span class="badge pos-' + escapeHtml(p.position) + '">' + escapeHtml(p.position) + '</span>' : '—') + '</td>' +
            '<td>' + escapeHtml(p.team || '—') + '</td>' +
            '<td class="num">' + BB.fmtADP(udAdp) + '</td>' +
            '<td class="num ' + adpValCls + '">' + adpValText + '</td>' +
            '<td class="num ' + dcvCls + '">' + dcvText + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    var stackHtml = '<h2>Stacks</h2>';
    if (!stacks.length) {
      stackHtml += '<div class="card" style="color:var(--text-dim);">No QB on this roster.</div>';
    } else {
      stackHtml += '<div class="pick-grid">' + stacks.map(function (s) {
        var mateNames = s.mates.length
          ? s.mates.map(function (m) { return escapeHtml(m.player) + ' (' + escapeHtml(m.position) + ')'; }).join(', ')
          : '<span style="color:var(--text-muted);">solo</span>';
        return '<div class="pick"><div class="round">' + escapeHtml(s.qb.team || '?') + ' STACK</div>' +
          '<div class="player">' + escapeHtml(s.qb.player) + '</div>' +
          '<div class="meta">' + mateNames + '</div></div>';
      }).join('') + '</div>';
    }

    pageEl.innerHTML = head + picksHtml + stackHtml;
  }

  init();
})();
