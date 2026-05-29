(function () {
  'use strict';
  if (!window.BB) return;

  var flashEl = document.getElementById('flash');
  var summaryEl = document.getElementById('summary-cards');
  var rosterListEl = document.getElementById('roster-list');
  var uploadsListEl = document.getElementById('uploads-list');
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('file-input');
  var browseBtn = document.getElementById('browse-btn');

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function flash(msg, kind) {
    flashEl.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'flash ' + (kind || 'info');
    div.innerHTML = msg;
    flashEl.appendChild(div);
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function renderSummary() {
    var rosters = BB.loadRosters();
    var s = BB.summary(rosters);
    function card(label, value, sub) {
      return '<div class="card"><div class="stat-label">' + label + '</div>' +
        '<div class="stat-value">' + value + '</div>' +
        (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
    }
    var html = '';
    html += card('Total rosters', s.totalEntries.toLocaleString());
    html += card('Entry fees', BB.fmtMoney(s.totalEntryFees));
    var platforms = Object.keys(s.byPlatform).sort();
    var platformSub = platforms.length ? platforms.map(function (p) { return p + ': ' + s.byPlatform[p]; }).join(' · ') : '—';
    html += card('Platforms', platforms.length, platformSub);
    var uniquePlayers = {};
    rosters.forEach(function (r) {
      var seen = {};
      r.picks.forEach(function (p) {
        var k = (p.player || '').toLowerCase();
        if (k && !seen[k]) { seen[k] = true; uniquePlayers[k] = true; }
      });
    });
    html += card('Unique players', Object.keys(uniquePlayers).length.toLocaleString());
    summaryEl.innerHTML = html;
  }

  function renderUploads() {
    var uploads = BB.loadUploads();
    if (!uploads.length) {
      uploadsListEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No uploads yet.</p></div>';
      return;
    }
    var html = '<div class="uploads">' + uploads.map(function (u) {
      var when = fmtTime(u.timestamp);
      var stats = u.added + ' added' + (u.skipped ? ' · ' + u.skipped + ' duplicate' + (u.skipped === 1 ? '' : 's') : '');
      var fmtBadge = u.format ? '<span class="badge">' + escapeHtml(u.format) + '</span>' : '';
      return '<div class="upload-item">' +
        '<div class="info">' +
          '<div class="filename">' + fmtBadge + ' ' + escapeHtml(u.filename || '(unnamed)') + '</div>' +
          '<div class="meta">' + escapeHtml(when) + '</div>' +
        '</div>' +
        '<div class="stats">' + stats + '</div>' +
        '<button class="danger" data-upload-id="' + escapeHtml(u.id) + '">Delete</button>' +
      '</div>';
    }).join('') + '</div>';
    uploadsListEl.innerHTML = html;
    uploadsListEl.querySelectorAll('button[data-upload-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-upload-id');
        var upload = BB.loadUploads().find(function (u) { return u.id === id; });
        if (!upload) return;
        if (!confirm('Delete "' + (upload.filename || 'upload') + '" and its ' + upload.added + ' roster' + (upload.added === 1 ? '' : 's') + '?')) return;
        var res = BB.deleteUpload(id);
        flash('Removed ' + res.removed + ' roster' + (res.removed === 1 ? '' : 's') + '.', 'info');
        renderAll();
      });
    });
  }

  function renderRosterList() {
    var rosters = BB.loadRosters();
    if (!rosters.length) {
      rosterListEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>No rosters yet. Drop a CSV above to get started.</p></div>';
      return;
    }
    var byTournament = {};
    rosters.forEach(function (r) {
      var key = r.platform + '|' + (r.tournament || '(unknown)');
      if (!byTournament[key]) byTournament[key] = { platform: r.platform, tournament: r.tournament || '(unknown)', entries: 0, fees: 0 };
      byTournament[key].entries++;
      byTournament[key].fees += r.entryFee || 0;
    });
    var rows = Object.values(byTournament).sort(function (a, b) { return b.entries - a.entries; });
    var html = '<table class="data"><thead><tr><th>Platform</th><th>Tournament</th><th class="num">Entries</th><th class="num">Entry fees</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr><td><span class="badge">' + escapeHtml(r.platform) + '</span></td><td>' + escapeHtml(r.tournament) + '</td>' +
        '<td class="num">' + r.entries + '</td><td class="num">' + BB.fmtMoney(r.fees) + '</td></tr>';
    });
    html += '</tbody></table>';
    rosterListEl.innerHTML = html;
  }

  function renderAll() {
    renderSummary();
    renderUploads();
    renderRosterList();
    if (window.BB_renderNav) window.BB_renderNav();
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function () { reject(new Error('could not read ' + file.name)); };
      reader.readAsText(file);
    });
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  async function processFiles(files) {
    if (!files || !files.length) return;
    var arr = Array.from(files);
    var perFile = [];
    var errors = [];
    for (var i = 0; i < arr.length; i++) {
      var file = arr[i];
      try {
        var text = await readFileAsText(file);
        var res = BB.importCSVText(text);
        if (res.error) {
          errors.push(file.name + ' — ' + res.error);
          perFile.push({ name: file.name, error: res.error });
        } else {
          BB.recordUpload({
            id: uuid(),
            filename: file.name,
            timestamp: new Date().toISOString(),
            format: res.format,
            added: res.added,
            skipped: res.skipped,
            addedRosterIds: res.addedRosterIds || [],
          });
          perFile.push({ name: file.name, added: res.added, skipped: res.skipped, format: res.format });
        }
      } catch (err) {
        errors.push(file.name + ' — ' + err.message);
      }
    }
    var totalAdded = perFile.reduce(function (n, r) { return n + (r.added || 0); }, 0);
    var totalSkipped = perFile.reduce(function (n, r) { return n + (r.skipped || 0); }, 0);
    var msgParts = [];
    if (totalAdded) msgParts.push('Imported ' + totalAdded + ' roster' + (totalAdded === 1 ? '' : 's') + ' across ' + perFile.length + ' file' + (perFile.length === 1 ? '' : 's'));
    if (totalSkipped) msgParts.push(totalSkipped + ' duplicate' + (totalSkipped === 1 ? '' : 's') + ' skipped');
    if (errors.length) {
      flash('<strong>Errors:</strong> ' + errors.map(escapeHtml).join('<br/>'), 'error');
    } else {
      flash(msgParts.join(' · ') + '.', 'success');
    }
    renderAll();
  }

  // ---------- wiring ----------
  fileInput.addEventListener('change', function (e) {
    processFiles(e.target.files);
    fileInput.value = '';
  });

  browseBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', function (e) {
    if (e.target === browseBtn) return;
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('dragging'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('dragging'); });
  });
  dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    processFiles(files);
  });

  document.getElementById('load-demo').addEventListener('click', function () {
    var res = BB.loadDemoData();
    BB.recordUpload({
      id: uuid(),
      filename: '(demo data)',
      timestamp: new Date().toISOString(),
      format: res.format,
      added: res.added,
      skipped: res.skipped,
      addedRosterIds: res.addedRosterIds || [],
    });
    flash('Loaded ' + res.added + ' demo rosters.', 'success');
    renderAll();
  });

  document.getElementById('clear-data').addEventListener('click', function () {
    if (!confirm('Clear all rosters and upload history?')) return;
    BB.clearRosters();
    flash('Cleared.', 'info');
    renderAll();
  });

  renderAll();
})();
