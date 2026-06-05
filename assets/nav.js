(function () {
  'use strict';

  // ---------- sidebar collapsed state ----------
  function isCollapsed() {
    return document.documentElement.getAttribute('data-sidebar') === 'collapsed';
  }
  function setCollapsed(c) {
    if (c) document.documentElement.setAttribute('data-sidebar', 'collapsed');
    else document.documentElement.removeAttribute('data-sidebar');
    try { localStorage.setItem('bb_sidebar_collapsed', c ? '1' : '0'); } catch (e) {}
  }
  function toggleCollapsed() {
    setCollapsed(!isCollapsed());
    render();
  }

  // ---------- theme ----------
  // Light is the default; persisted in localStorage as 'light' or 'dark'.
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('bb_theme', t); } catch (e) {}
  }
  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    render();
  }
  window.BB_toggleTheme = toggleTheme;

  // Inline SVGs for the theme toggle icon — outlined sun and moon, themed
  // via currentColor so they respect the active palette.
  var SUN_ICON  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var MOON_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  // Inline SVG icons — themed via currentColor.
  var ICONS = {
    upload:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M5 11l7-7 7 7M5 20h14"/></svg>',
    exposures:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="8"/><rect x="10" y="8" width="4" height="12"/><rect x="17" y="4" width="4" height="16"/></svg>',
    stacks:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/></svg>',
    construction: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    rosters:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    tournaments:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    trends:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
    grading:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  };

  function render() {
    var current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var pages = [
      { href: 'index.html',        label: 'Upload',       icon: 'upload' },
      { href: 'exposures.html',    label: 'Exposures',    icon: 'exposures' },
      { href: 'stacks.html',       label: 'Stacks',       icon: 'stacks' },
      { href: 'construction.html', label: 'Construction', icon: 'construction' },
      { href: 'rosters.html',      label: 'Rosters',      icon: 'rosters' },
      { href: 'tournaments.html',  label: 'Tournaments',  icon: 'tournaments' },
      { href: 'trends.html',       label: 'Trends',       icon: 'trends' },
      { href: 'grading.html',      label: 'Self Grading', icon: 'grading' },
    ];

    // "active" includes a few sub-pages whose URL doesn't exactly match the nav href
    function isActive(href) {
      if (href === current) return true;
      if (href === 'rosters.html' && current === 'rosters.html') return true;
      if (current === 'player.html' && href === 'exposures.html') return true;
      if (current === 'team.html' && href === 'stacks.html') return true;
      return false;
    }

    var theme = currentTheme();
    var themeIcon  = theme === 'dark' ? SUN_ICON : MOON_ICON;
    var themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    var themeText  = theme === 'dark' ? 'Light mode' : 'Dark mode';
    var nRosters = (window.BB && BB.loadRosters().length) || 0;

    // ADP freshness stamp
    var adpInfo = '';
    if (window.BB_DATA && window.BB_DATA.lastUpdated) {
      var d = new Date(window.BB_DATA.lastUpdated);
      if (!isNaN(d.getTime())) {
        var ageMs = Date.now() - d.getTime();
        var ageH = Math.round(ageMs / 36e5);
        var ageLabel = ageH < 1 ? 'just now' : (ageH < 48 ? ageH + 'h ago' : Math.round(ageH / 24) + 'd ago');
        var fresh = ageH < 36;
        adpInfo = '<span class="adp-stamp ' + (fresh ? 'fresh' : 'stale') +
          '" title="ADP last refreshed ' + d.toLocaleString() + '">ADP ' + ageLabel + '</span>';
      }
    }

    var collapsed = isCollapsed();
    var collapseChevron = collapsed
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

    var html =
      '<aside class="sidebar" id="site-nav">' +
        '<div class="sidebar-top">' +
          '<a class="sidebar-brand" href="index.html" title="Draftolio Pro">' +
            '<img class="brand-mark brand-mark-img" src="assets/logo%20transparent.png" alt="Draftolio Pro" />' +
          '</a>' +
          '<button class="sidebar-collapse-btn" id="sidebar-collapse" type="button" ' +
            'aria-label="' + (collapsed ? 'Expand sidebar' : 'Collapse sidebar') + '" ' +
            'title="' + (collapsed ? 'Expand sidebar' : 'Collapse sidebar') + '">' +
            collapseChevron +
          '</button>' +
        '</div>' +
        '<nav class="sidebar-nav">' +
          pages.map(function (p) {
            return '<a href="' + p.href + '"' + (isActive(p.href) ? ' class="active"' : '') + ' title="' + p.label + '">' +
              '<span class="nav-icon">' + (ICONS[p.icon] || '') + '</span>' +
              '<span class="nav-label">' + p.label + '</span>' +
            '</a>';
          }).join('') +
        '</nav>' +
        '<div class="sidebar-footer">' +
          (adpInfo ? '<div class="sidebar-meta">' + adpInfo + '</div>' : '') +
          '<div class="sidebar-meta sidebar-meta-row">' +
            '<span class="rosters-count">' + nRosters + ' roster' + (nRosters === 1 ? '' : 's') + '</span>' +
          '</div>' +
          '<button id="theme-toggle" class="theme-toggle" type="button" aria-label="' + themeLabel + '" title="' + themeLabel + '">' +
            '<span class="theme-toggle-icon">' + themeIcon + '</span>' +
            '<span class="theme-toggle-text">' + themeText + '</span>' +
          '</button>' +
        '</div>' +
      '</aside>';

    var slot = document.getElementById('nav-slot') || document.getElementById('site-nav') || document.getElementById('site-header');
    if (slot) slot.outerHTML = html;

    var btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
    var collapseBtn = document.getElementById('sidebar-collapse');
    if (collapseBtn) collapseBtn.addEventListener('click', toggleCollapsed);
  }
  window.BB_renderNav = render;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
