(function () {
  'use strict';
  if (!window.BB) return;

  var yourEl = document.getElementById('your-entries');
  var refEl = document.getElementById('ref-table');
  var refSearch = document.getElementById('ref-search');
  var refPlatform = document.getElementById('ref-platform');
  var refPeriod = document.getElementById('ref-period');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderYourEntries() {
    var rosters = BB.loadRosters();
    if (!rosters.length) {
      yourEl.innerHTML = '<div class="empty-state"><p>No rosters loaded. <a href="index.html">Upload</a> CSVs to see your tournament breakdown.</p></div>';
      return;
    }
    var grouped = {};
    rosters.forEach(function (r) {
      var key = r.platform + '|' + (r.tournament || '(unknown)');
      if (!grouped[key]) {
        grouped[key] = {
          platform: r.platform,
          tournament: r.tournament || '(unknown)',
          entries: 0,
          fees: 0,
          uniquePlayers: {},
          firstDraft: null,
          lastDraft: null,
        };
      }
      var g = grouped[key];
      g.entries++;
      g.fees += r.entryFee || 0;
      r.picks.forEach(function (p) {
        if (p.player) g.uniquePlayers[p.player.toLowerCase()] = true;
      });
      if (r.draftedAt) {
        if (!g.firstDraft || r.draftedAt < g.firstDraft) g.firstDraft = r.draftedAt;
        if (!g.lastDraft || r.draftedAt > g.lastDraft) g.lastDraft = r.draftedAt;
      }
    });
    var rows = Object.values(grouped).sort(function (a, b) { return b.entries - a.entries; });
    yourEl.innerHTML = '<table class="data"><thead><tr>' +
      '<th>Platform</th><th>Tournament</th><th class="num">Entries</th><th class="num">Entry fees</th>' +
      '<th class="num">Unique players</th><th>First draft</th><th>Last draft</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' +
          '<td><span class="badge">' + escapeHtml(r.platform) + '</span></td>' +
          '<td>' + escapeHtml(r.tournament) + '</td>' +
          '<td class="num">' + r.entries + '</td>' +
          '<td class="num">' + BB.fmtMoney(r.fees) + '</td>' +
          '<td class="num">' + Object.keys(r.uniquePlayers).length + '</td>' +
          '<td>' + escapeHtml(r.firstDraft ? r.firstDraft.slice(0, 10) : '—') + '</td>' +
          '<td>' + escapeHtml(r.lastDraft ? r.lastDraft.slice(0, 10) : '—') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  var refState = { search: '', platform: '', period: '' };

  function populateRefFilters() {
    var tournaments = (window.BB_DATA && window.BB_DATA.tournaments) || [];
    var plats = {}, periods = {};
    tournaments.forEach(function (t) {
      if (t.platform) plats[t.platform] = true;
      if (t.period) periods[t.period] = true;
    });
    refPlatform.innerHTML = '<option value="">All platforms</option>' +
      Object.keys(plats).sort().map(function (p) { return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('');
    refPeriod.innerHTML = '<option value="">All draft periods</option>' +
      Object.keys(periods).sort().map(function (p) { return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>'; }).join('');
  }

  function renderRef() {
    var tournaments = (window.BB_DATA && window.BB_DATA.tournaments) || [];
    var s = refState.search.toLowerCase().trim();
    var rows = tournaments.filter(function (t) {
      if (refState.platform && t.platform !== refState.platform) return false;
      if (refState.period && t.period !== refState.period) return false;
      if (s && (t.name || '').toLowerCase().indexOf(s) === -1) return false;
      return true;
    });
    if (!rows.length) {
      refEl.innerHTML = '<div class="empty-state"><p>No tournaments match.</p></div>';
      return;
    }
    refEl.innerHTML = '<table class="data"><thead><tr>' +
      '<th>Platform</th><th>Tournament</th><th>Format</th><th>QB</th><th>Draft period</th></tr></thead><tbody>' +
      rows.map(function (t) {
        return '<tr>' +
          '<td><span class="badge">' + escapeHtml(t.platform) + '</span></td>' +
          '<td>' + escapeHtml(t.name) + '</td>' +
          '<td>' + escapeHtml(t.format || '—') + '</td>' +
          '<td>' + escapeHtml(t.qbFormat || '—') + '</td>' +
          '<td>' + escapeHtml(t.period || '—') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  refSearch.addEventListener('input', function (e) { refState.search = e.target.value; renderRef(); });
  refPlatform.addEventListener('change', function (e) { refState.platform = e.target.value; renderRef(); });
  refPeriod.addEventListener('change', function (e) { refState.period = e.target.value; renderRef(); });

  populateRefFilters();
  renderYourEntries();
  renderRef();
})();
