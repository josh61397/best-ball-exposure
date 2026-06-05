// Sidebar shell — the persistent layout for every page on the site.
// Rendered into <div id="nav-slot"></div> on each HTML page. Because this
// file is the single source of truth, every page inherits the same shell
// unchanged — there is no per-page nav markup anywhere else.
(function () {
  'use strict';

  // ---------- theme ----------
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

  // ---------- Tabler outline icons (inlined SVG, themed via currentColor) ----------
  var ICONS = {
    'upload':        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>',
    'chart-bar':     '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="10" width="3" height="10"/><rect x="12" y="4" width="3" height="16"/><rect x="18" y="14" width="3" height="6"/></svg>',
    'stack-2':       '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="12 4 4 8 12 12 20 8 12 4"/><polyline points="4 12 12 16 20 12"/><polyline points="4 16 12 20 20 16"/></svg>',
    'layout':        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="5" rx="2"/><rect x="4" y="13" width="6" height="7" rx="2"/><rect x="14" y="4" width="6" height="7" rx="2"/><rect x="14" y="15" width="6" height="5" rx="2"/></svg>',
    'users':         '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/></svg>',
    'tournament':    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="4"/><rect x="14" y="4" width="4" height="4"/><rect x="6" y="16" width="4" height="4"/><rect x="14" y="16" width="4" height="4"/><path d="M8 8v8"/><path d="M16 8v8"/><path d="M10 18h4"/><path d="M10 12h4"/></svg>',
    'trending-up':   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
    'checkup-list':  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 14h.01"/><path d="M9 17h.01"/><path d="M12 16l1 1l3 -3"/></svg>',
    'sun':           '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M3 12h1M12 3v1M21 12h-1M12 21v-1M5.6 5.6l.7 .7M18.4 5.6l-.7 .7M18.4 18.4l-.7 -.7M5.6 18.4l.7 -.7"/></svg>',
    'moon':          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/></svg>',
    'settings':      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37a1.724 1.724 0 0 0 2.572 -1.065z"/><circle cx="12" cy="12" r="3"/></svg>',
  };

  // Each nav item declares whether it should appear in the mobile tab bar.
  // The five most-used pages get `mobile: true`; the rest are desktop-only.
  var PAGES = [
    { href: 'index.html',        label: 'Upload',       icon: 'upload',       mobile: false },
    { href: 'exposures.html',    label: 'Exposure',     icon: 'chart-bar',    mobile: true  },
    { href: 'stacks.html',       label: 'Stacks',       icon: 'stack-2',      mobile: true  },
    { href: 'construction.html', label: 'Construction', icon: 'layout',       mobile: false },
    { href: 'rosters.html',      label: 'Rosters',      icon: 'users',        mobile: true  },
    { href: 'tournaments.html',  label: 'Tournaments',  icon: 'tournament',   mobile: true  },
    { href: 'trends.html',       label: 'Trends',       icon: 'trending-up',  mobile: false },
    { href: 'grading.html',      label: 'Self Grading', icon: 'checkup-list', mobile: true  },
  ];

  function isActive(href, current) {
    if (href === current) return true;
    if (current === 'player.html' && href === 'exposures.html') return true;
    if (current === 'team.html'   && href === 'stacks.html')    return true;
    return false;
  }

  function render() {
    var current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (!current) current = 'index.html';

    var navHtml = PAGES.map(function (p) {
      var active = isActive(p.href, current);
      var cls = 'sb-item' + (active ? ' is-active' : '');
      return '<a href="' + p.href + '" class="' + cls + '"' +
        ' data-mobile="' + (p.mobile ? '1' : '0') + '"' +
        '>' +
          '<span class="sb-icon">' + (ICONS[p.icon] || '') + '</span>' +
          '<span class="sb-label">' + p.label.toUpperCase() + '</span>' +
        '</a>';
    }).join('');

    var theme = currentTheme();
    // The icon swaps to indicate what clicking will switch TO (sun in dark,
    // moon in light). The label stays "NIGHT" per spec.
    var themeIcon = theme === 'dark' ? ICONS.sun : ICONS.moon;

    var settingsActive = current === 'settings.html' ? ' is-active' : '';

    var html =
      '<aside class="sidebar" id="site-nav">' +
        '<div class="sb-logo">' +
          '<a class="sb-logo-link" href="index.html" aria-label="Draftolio Pro home">' +
            '<span class="sb-logo-mark">BB</span>' +
          '</a>' +
        '</div>' +
        '<nav class="sb-nav">' + navHtml + '</nav>' +
        '<div class="sb-footer">' +
          '<button id="theme-toggle" class="sb-item sb-toggle" type="button" aria-label="Toggle night mode">' +
            '<span class="sb-icon">' + themeIcon + '</span>' +
            '<span class="sb-label">NIGHT</span>' +
          '</button>' +
          '<a class="sb-item' + settingsActive + '" href="settings.html">' +
            '<span class="sb-icon">' + ICONS.settings + '</span>' +
            '<span class="sb-label">SETTINGS</span>' +
          '</a>' +
        '</div>' +
      '</aside>';

    var slot = document.getElementById('nav-slot') || document.getElementById('site-nav');
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
