(function () {
  'use strict';
  function render() {
    var current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var pages = [
      { href: 'index.html', label: 'Upload' },
      { href: 'exposures.html', label: 'Exposures' },
      { href: 'rosters.html', label: 'Rosters' },
      { href: 'tournaments.html', label: 'Tournaments' },
    ];
    var nRosters = (window.BB && BB.loadRosters().length) || 0;
    var adpInfo = '';
    if (window.BB_DATA && window.BB_DATA.lastUpdated) {
      var d = new Date(window.BB_DATA.lastUpdated);
      if (!isNaN(d.getTime())) {
        var ageMs = Date.now() - d.getTime();
        var ageH = Math.round(ageMs / 36e5);
        var ageLabel = ageH < 1 ? 'just now' : (ageH < 48 ? ageH + 'h ago' : Math.round(ageH / 24) + 'd ago');
        var fresh = ageH < 36;
        adpInfo = '<span class="adp-stamp ' + (fresh ? 'fresh' : 'stale') + '" title="ADP last refreshed ' + d.toLocaleString() + '">ADP ' + ageLabel + '</span>';
      }
    }
    var html = '<header class="site" id="site-header">' +
      '<div class="brand">Best Ball <span class="accent">Exposure</span></div>' +
      '<nav>' + pages.map(function (p) {
        return '<a href="' + p.href + '"' + (p.href === current ? ' class="active"' : '') + '>' + p.label + '</a>';
      }).join('') + '</nav>' +
      '<div class="meta">' + adpInfo + '<span>' + nRosters + ' roster' + (nRosters === 1 ? '' : 's') + ' loaded</span></div>' +
      '</header>';
    var slot = document.getElementById('nav-slot') || document.getElementById('site-header');
    if (slot) slot.outerHTML = html;
  }
  window.BB_renderNav = render;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
