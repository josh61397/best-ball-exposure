(function () {
  'use strict';
  if (!window.BB) return;

  var contentEl = document.getElementById('content');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtSigned(v) {
    if (v == null || isNaN(v)) return '—';
    var sign = v > 0 ? '+' : '';
    return sign + v.toFixed(1);
  }

  function sigClass(v) {
    if (v == null) return '';
    if (v > 0.05) return 'clv-pos';
    if (v < -0.05) return 'clv-neg';
    return '';
  }

  function statCard(label, value, sub, cls) {
    return '<div class="card">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value ' + (cls || '') + '">' + value + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function renderHero(grade) {
    var html = '<div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">';
    html += statCard('Total drafts', grade.totalDrafts.toLocaleString());
    html += statCard('Avg CLV / draft', fmtSigned(grade.clvAvgPerDraft), 'across ' + grade.totalDrafts + ' drafts', sigClass(grade.clvAvgPerDraft));
    html += statCard('Total CLV', fmtSigned(grade.clvTotal), 'sum across every pick', sigClass(grade.clvTotal));
    html += statCard('Avg RTV / draft', fmtSigned(grade.rtvAvgPerDraft), 'vs today\'s ADP', sigClass(grade.rtvAvgPerDraft));
    html += statCard('Total RTV', fmtSigned(grade.rtvTotal), 'sum across every pick', sigClass(grade.rtvTotal));
    html += '</div>';
    return html;
  }

  function winLossBar(label, gained, lost, even, total) {
    var totalNon = gained + lost + even;
    if (!totalNon) return '';
    var pctG = (gained / totalNon * 100).toFixed(1);
    var pctL = (lost / totalNon * 100).toFixed(1);
    var pctE = (even / totalNon * 100).toFixed(1);
    return '<div style="margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">' +
        '<strong>' + escapeHtml(label) + '</strong>' +
        '<span style="font-size:12px;color:var(--text-dim);">' +
          '<span class="clv-pos">' + gained + ' gained</span> · ' +
          '<span class="clv-neg">' + lost + ' lost</span>' +
          (even ? ' · ' + even + ' even' : '') +
        '</span>' +
      '</div>' +
      '<div style="display:flex;height:18px;border-radius:4px;overflow:hidden;border:1px solid var(--border);">' +
        '<div style="background:var(--accent-2);width:' + pctG + '%;" title="' + gained + ' drafts gained (' + pctG + '%)"></div>' +
        (even ? '<div style="background:var(--text-muted);width:' + pctE + '%;opacity:0.4;" title="' + even + ' even"></div>' : '') +
        '<div style="background:var(--danger);width:' + pctL + '%;" title="' + lost + ' drafts lost (' + pctL + '%)"></div>' +
      '</div>' +
    '</div>';
  }

  function renderWinLoss(grade) {
    return '<h2>Drafts gained vs lost</h2>' +
      '<div class="card">' +
        winLossBar('CLV — based on ADP at draft date', grade.clvGained, grade.clvLost, grade.clvEven) +
        winLossBar('RTV — based on today\'s ADP',     grade.rtvGained, grade.rtvLost, grade.rtvEven) +
      '</div>';
  }

  function renderTopTable(title, players, metricKey, accent) {
    if (!players.length) {
      return '<h2>' + escapeHtml(title) + '</h2>' +
        '<div class="empty-state" style="padding:24px;"><p>No data yet.</p></div>';
    }
    // Heat-map range across just these rows
    function rangeFor(rows, getter) {
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
    var totalRange = rangeFor(players, function (p) { return p[metricKey]; });
    var avgKey = metricKey === 'clvTotal' ? 'clvAvg' : 'rtvAvg';
    var avgRange = rangeFor(players, function (p) { return p[avgKey]; });

    var head = '<thead><tr>' +
      '<th>Player</th>' +
      '<th>Pos</th>' +
      '<th>Tm</th>' +
      '<th class="num">Times Drafted</th>' +
      '<th class="num">Avg Pick</th>' +
      '<th class="num">Total ' + (metricKey === 'clvTotal' ? 'CLV' : 'RTV') + '</th>' +
      '<th class="num">Avg ' + (metricKey === 'clvTotal' ? 'CLV' : 'RTV') + '</th>' +
    '</tr></thead>';

    var body = players.map(function (p) {
      var nameCell = BB.playerCell(p.player, p.team, { linkToPlayer: true });
      return '<tr>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + (p.position ? '<span class="badge pos-' + escapeHtml(p.position) + '">' + escapeHtml(p.position) + '</span>' : '—') + '</td>' +
        '<td>' + escapeHtml(p.team || '—') + '</td>' +
        '<td class="num">' + p.draftedCount + '</td>' +
        '<td class="num">' + (p.avgPick != null ? p.avgPick.toFixed(1) : '—') + '</td>' +
        '<td class="num"' + BB.heatStyle(p[metricKey], totalRange) + '>' + fmtSigned(p[metricKey]) + '</td>' +
        '<td class="num"' + BB.heatStyle(p[avgKey], avgRange) + '>' + fmtSigned(p[avgKey]) + '</td>' +
      '</tr>';
    }).join('');

    return '<h2 class="grade-section ' + (accent || '') + '">' + escapeHtml(title) + '</h2>' +
      '<table class="data">' + head + '<tbody>' + body + '</tbody></table>';
  }

  async function init() {
    var rosters = BB.loadRosters();
    if (!rosters.length) {
      contentEl.innerHTML = '<div class="empty-state"><h2>No rosters yet</h2><p>Drop a CSV on the <a href="index.html">upload</a> page to see your grading.</p></div>';
      return;
    }

    var grade = await BB.gradeRosters(rosters);
    var playerValues = await BB.aggregatePlayerValue(rosters);

    // Filter to players drafted at least 2x for the top-10 lists to surface
    // patterns rather than one-off picks. (Keep all if user has few rosters.)
    var minDrafts = rosters.length >= 10 ? 2 : 1;
    var withCLV = playerValues.filter(function (p) { return p.clvTotal != null && p.draftedCount >= minDrafts; });
    var withRTV = playerValues.filter(function (p) { return p.rtvTotal != null && p.draftedCount >= minDrafts; });

    var topGainCLV = withCLV.slice().sort(function (a, b) { return b.clvTotal - a.clvTotal; }).slice(0, 10);
    var topLossCLV = withCLV.slice().sort(function (a, b) { return a.clvTotal - b.clvTotal; }).slice(0, 10);
    var topGainRTV = withRTV.slice().sort(function (a, b) { return b.rtvTotal - a.rtvTotal; }).slice(0, 10);
    var topLossRTV = withRTV.slice().sort(function (a, b) { return a.rtvTotal - b.rtvTotal; }).slice(0, 10);

    var html = '';
    html += renderHero(grade);
    html += renderWinLoss(grade);
    html += '<div class="grade-grid">';
    html +=   '<div>' + renderTopTable('Top 10 players — gained CLV', topGainCLV, 'clvTotal', 'positive') + '</div>';
    html +=   '<div>' + renderTopTable('Top 10 players — lost CLV',   topLossCLV, 'clvTotal', 'negative') + '</div>';
    html +=   '<div>' + renderTopTable('Top 10 players — gained RTV', topGainRTV, 'rtvTotal', 'positive') + '</div>';
    html +=   '<div>' + renderTopTable('Top 10 players — lost RTV',   topLossRTV, 'rtvTotal', 'negative') + '</div>';
    html += '</div>';

    html += '<p style="color:var(--text-muted);font-size:12px;margin-top:16px;">' +
      'CLV uses ADP from each pick\'s draft date when we have a history snapshot for that day, otherwise falls back to today\'s ADP. ' +
      (minDrafts === 2 ? 'Top-10 lists restricted to players you\'ve drafted at least twice to surface patterns rather than one-off picks.' : '') +
    '</p>';

    contentEl.innerHTML = html;
  }

  init();
})();
