(function () {
  'use strict';
  if (!window.BB) return;

  var asideEl = document.getElementById('roster-aside');
  var detailEl = document.getElementById('detail');
  var searchEl = document.getElementById('search');
  var platformEl = document.getElementById('platform-filter');
  var rowCountEl = document.getElementById('row-count');

  var state = { selectedId: null, search: '', platform: '' };

  // Deep link: rosters.html?id=ROSTERID pre-selects a specific roster
  var _qs = new URLSearchParams(location.search);
  if (_qs.get('id')) state.selectedId = _qs.get('id');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function populateFilters() {
    var rosters = BB.loadRosters();
    var plats = {};
    rosters.forEach(function (r) { plats[r.platform] = true; });
    platformEl.innerHTML = '<option value="">All platforms</option>' +
      Object.keys(plats).sort().map(function (p) { return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('');
    platformEl.value = state.platform;
  }

  function visibleRosters() {
    var rosters = BB.loadRosters();
    var s = state.search.toLowerCase().trim();
    return rosters.filter(function (r) {
      if (state.platform && r.platform !== state.platform) return false;
      if (!s) return true;
      if ((r.tournament || '').toLowerCase().indexOf(s) !== -1) return true;
      return r.picks.some(function (p) { return (p.player || '').toLowerCase().indexOf(s) !== -1; });
    });
  }

  function renderAside() {
    var rosters = visibleRosters();
    rowCountEl.textContent = rosters.length.toLocaleString();
    if (!rosters.length) {
      asideEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No rosters. <a href="index.html">Upload</a> a CSV.</p></div>';
      detailEl.innerHTML = '';
      return;
    }
    // sort by drafted at desc, fallback by tournament name
    rosters.sort(function (a, b) {
      if (a.draftedAt && b.draftedAt) return a.draftedAt < b.draftedAt ? 1 : -1;
      if (a.draftedAt) return -1;
      if (b.draftedAt) return 1;
      return (a.tournament || '').localeCompare(b.tournament || '');
    });
    if (!state.selectedId || !rosters.find(function (r) { return r.rosterId === state.selectedId; })) {
      state.selectedId = rosters[0].rosterId;
    }
    asideEl.innerHTML = rosters.map(function (r) {
      var when = r.draftedAt ? (r.draftedAt + '').slice(0, 10) : '';
      var sub = [r.platform, when, r.entryFee ? BB.fmtMoney(r.entryFee) : ''].filter(Boolean).join(' · ');
      return '<div class="item' + (r.rosterId === state.selectedId ? ' active' : '') + '" data-id="' + escapeHtml(r.rosterId) + '">' +
        '<div class="title">' + escapeHtml(r.tournament || '(no tournament)') + '</div>' +
        '<div class="sub">' + escapeHtml(sub) + '</div>' +
        '</div>';
    }).join('');
    asideEl.querySelectorAll('.item').forEach(function (el) {
      el.addEventListener('click', function () {
        state.selectedId = el.getAttribute('data-id');
        renderAside();
        renderDetail();
      });
    });
    renderDetail();
  }

  function renderDetail() {
    var rosters = BB.loadRosters();
    var r = rosters.find(function (x) { return x.rosterId === state.selectedId; });
    if (!r) { detailEl.innerHTML = ''; return; }

    // Stack analysis: QB → same-team WR/TE
    var qbs = r.picks.filter(function (p) { return p.position === 'QB'; });
    var stacks = qbs.map(function (qb) {
      var mates = r.picks.filter(function (p) {
        return p.team && qb.team && p.team === qb.team && p.player !== qb.player && (p.position === 'WR' || p.position === 'TE' || p.position === 'RB');
      });
      return { qb: qb, mates: mates };
    });

    // Position counts
    var counts = {};
    r.picks.forEach(function (p) { counts[p.position] = (counts[p.position] || 0) + 1; });

    var head = '<div class="card" style="margin-bottom:16px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;">' +
      '<div style="flex:1;min-width:240px;">' +
      '<div class="stat-label">Tournament</div>' +
      '<div style="font-size:18px;font-weight:600;">' + escapeHtml(r.tournament || '(no tournament)') + '</div>' +
      '<div class="stat-sub">' + escapeHtml(r.platform) + (r.entryFee ? ' · entry ' + BB.fmtMoney(r.entryFee) : '') + (r.draftSize ? ' · ' + r.draftSize + '-man' : '') + '</div>' +
      '</div>' +
      '<div><div class="stat-label">Roster</div><div style="font-family:ui-monospace,monospace;font-size:11px;color:var(--text-muted);">' + escapeHtml(r.rosterId) + '</div></div>' +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
      ['QB','RB','WR','TE'].map(function (pos) {
        return '<span class="badge pos-' + pos + '">' + pos + ' ' + (counts[pos] || 0) + '</span>';
      }).join('') +
      '</div>' +
      '</div>';

    var picksHtml = '<h2>Picks</h2>';
    if (!r.picks.length) {
      picksHtml += '<div class="empty-state">No picks on this roster.</div>';
    } else {
      picksHtml += '<table class="data"><thead><tr>' +
        '<th class="num">Rd</th><th class="num">Pick</th><th>Player</th><th>Pos</th><th>Tm</th><th class="num">UD ADP</th><th class="num">CLV</th>' +
        '</tr></thead><tbody>' +
        r.picks.map(function (p) {
          var refADP = window.BB_DATA ? window.BB_DATA.lookupADP(p.player) : null;
          var udAdp = refADP && refADP.ud != null ? refADP.ud : (p.siteADP != null ? p.siteADP : null);
          var clv = null;
          if (p.overallPick != null && udAdp != null) clv = udAdp - p.overallPick;
          var clvCls = clv == null ? '' : clv > 0 ? 'clv-pos' : (clv < 0 ? 'clv-neg' : '');
          var clvText = clv == null ? '—' : (clv > 0 ? '+' : '') + clv.toFixed(1);
          var nameLink = p.player ?
            '<a href="player.html?name=' + encodeURIComponent(p.player) + '">' + escapeHtml(p.player) + '</a>' : '—';
          return '<tr>' +
            '<td class="num">' + (p.round != null ? p.round : '—') + '</td>' +
            '<td class="num">' + (p.overallPick != null ? p.overallPick : '—') + '</td>' +
            '<td>' + nameLink + '</td>' +
            '<td>' + (p.position ? '<span class="badge pos-' + escapeHtml(p.position) + '">' + escapeHtml(p.position) + '</span>' : '—') + '</td>' +
            '<td>' + escapeHtml(p.team || '—') + '</td>' +
            '<td class="num">' + BB.fmtADP(udAdp) + '</td>' +
            '<td class="num ' + clvCls + '">' + clvText + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table>';
    }

    var stackHtml = '<h2>Stacks</h2>';
    if (!stacks.length) {
      stackHtml += '<div class="card" style="color:var(--text-dim);">No QB on this roster.</div>';
    } else {
      stackHtml += '<div class="pick-grid">' + stacks.map(function (s) {
        var mateNames = s.mates.length ? s.mates.map(function (m) { return escapeHtml(m.player) + ' (' + escapeHtml(m.position) + ')'; }).join(', ') : '<span style="color:var(--text-muted);">solo</span>';
        return '<div class="pick"><div class="round">' + escapeHtml(s.qb.team || '?') + ' STACK</div>' +
          '<div class="player">' + escapeHtml(s.qb.player) + '</div>' +
          '<div class="meta">' + mateNames + '</div></div>';
      }).join('') + '</div>';
    }

    detailEl.innerHTML = head + picksHtml + stackHtml;
  }

  searchEl.addEventListener('input', function (e) { state.search = e.target.value; renderAside(); });
  platformEl.addEventListener('change', function (e) { state.platform = e.target.value; renderAside(); });

  populateFilters();
  renderAside();
})();
