(function () {
  'use strict';
  // ---------- theme ----------
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('bb_theme', t); } catch (e) {}
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
    render();
  }
  window.BB_toggleTheme = toggleTheme;

  function render() {
    var current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var pages = [
      { href: 'index.html', label: 'Upload' },
      { href: 'exposures.html', label: 'Exposures' },
      { href: 'stacks.html', label: 'Stacks' },
      { href: 'player-stacks.html', label: 'Player Stacks' },
      { href: 'rosters.html', label: 'Rosters' },
      { href: 'tournaments.html', label: 'Tournaments' },
      { href: 'trends.html', label: 'Trends' },
      { href: 'grading.html', label: 'Self Grading' },
    ];
    var theme = currentTheme();
    var themeIcon = theme === 'light' ? '☾' : '☀';
    var themeLabel = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
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
      '<div class="meta">' + adpInfo +
        '<span>' + nRosters + ' roster' + (nRosters === 1 ? '' : 's') + ' loaded</span>' +
        '<button id="theme-toggle" class="theme-toggle" type="button" aria-label="' + themeLabel + '" title="' + themeLabel + '">' + themeIcon + '</button>' +
      '</div>' +
      '</header>';
    var slot = document.getElementById('nav-slot') || document.getElementById('site-header');
    if (slot) slot.outerHTML = html;
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
  }
  window.BB_renderNav = render;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
