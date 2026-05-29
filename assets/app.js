// Best Ball Exposure Tracker — shared application logic.
// Store, CSV parsing for Underdog/DraftKings/Drafters, aggregations.

(function () {
  'use strict';

  var STORAGE_KEY = 'bb_rosters_v1';
  var UPLOADS_KEY = 'bb_uploads_v1';
  var BB = (window.BB = window.BB || {});

  // ---------- storage ----------
  BB.loadRosters = function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('Failed to load rosters', e);
      return [];
    }
  };

  BB.saveRosters = function (rosters) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rosters));
  };

  BB.clearRosters = function () {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(UPLOADS_KEY);
  };

  BB.loadUploads = function () {
    try {
      var raw = localStorage.getItem(UPLOADS_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  };

  BB.saveUploads = function (uploads) {
    localStorage.setItem(UPLOADS_KEY, JSON.stringify(uploads));
  };

  BB.recordUpload = function (entry) {
    var uploads = BB.loadUploads();
    uploads.unshift(entry);
    BB.saveUploads(uploads);
  };

  // Remove the rosters that were added by a specific upload.
  BB.deleteUpload = function (uploadId) {
    var uploads = BB.loadUploads();
    var match = uploads.find(function (u) { return u.id === uploadId; });
    if (!match) return { removed: 0 };
    var idsToRemove = {};
    (match.addedRosterIds || []).forEach(function (id) { idsToRemove[id] = true; });
    var rosters = BB.loadRosters().filter(function (r) { return !idsToRemove[r.rosterId]; });
    BB.saveRosters(rosters);
    BB.saveUploads(uploads.filter(function (u) { return u.id !== uploadId; }));
    return { removed: Object.keys(idsToRemove).length };
  };

  // ---------- CSV parsing ----------
  // Minimal RFC4180-style CSV parser, handles quoted fields and embedded commas/quotes/newlines.
  BB.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    var rows = [];
    var cur = [];
    var field = '';
    var i = 0;
    var inQuotes = false;
    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { cur.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
      field += ch; i++;
    }
    if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
    return rows;
  };

  // Parse CSV into list of {colName: value} using first row as header
  BB.csvToObjects = function (text) {
    var rows = BB.parseCSV(text).filter(function (r) {
      return r.length && r.some(function (c) { return c !== ''; });
    });
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return String(h || '').trim(); });
    return rows.slice(1).map(function (row) {
      var obj = {};
      for (var j = 0; j < header.length; j++) obj[header[j]] = row[j] != null ? String(row[j]).trim() : '';
      return obj;
    });
  };

  // ---------- format detection ----------
  // Returns 'UD' | 'DK' | 'DRAFTERS' | null
  BB.detectFormat = function (header) {
    var h = header.map(function (s) { return String(s || '').toLowerCase().trim(); });
    var has = function (name) { return h.indexOf(name.toLowerCase()) !== -1; };
    if (has('draft entry') && has('first name') && has('last name') && has('tournament title')) return 'UD';
    if (has('lineupkey') && has('overallpick') && has('contestname')) return 'DK';
    if (has('draftid') && has('pick number') && has('player name')) return 'DRAFTERS';
    return null;
  };

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(String(v).replace(/[$,]/g, ''));
    return isNaN(n) ? null : n;
  }

  // ---------- normalize rows into rosters ----------
  // Roster shape:
  // { rosterId, source, platform, tournament, tournamentId, entryFee, draftSize, draftedAt, picks:[{round, pickNumber, overallPick, firstName, lastName, player, position, team, siteADP}] }

  BB.normalizeUD = function (rows) {
    // Group by Draft Entry (unique entry/lineup)
    var byEntry = {};
    rows.forEach(function (r) {
      var key = r['Draft Entry'] || r['Draft'];
      if (!key) return;
      if (!byEntry[key]) {
        byEntry[key] = {
          rosterId: 'UD:' + key,
          source: 'UD',
          platform: 'Underdog',
          tournament: r['Tournament Title'] || '',
          tournamentId: r['Tournament'] || '',
          draftId: r['Draft'] || '',
          draftEntryId: r['Draft Entry'] || '',
          entryFee: num(r['Tournament Entry Fee']) ?? num(r['Draft Entry Fee']),
          draftSize: num(r['Draft Size']),
          totalPrizes: num(r['Tournament Total Prizes']),
          draftedAt: null,
          picks: [],
        };
      }
      var entry = byEntry[key];
      var pickNum = num(r['Pick Number']);
      var first = r['First Name'] || '';
      var last = r['Last Name'] || '';
      var fullName = (first + ' ' + last).trim();
      var round = pickNum != null && entry.draftSize ? Math.ceil(pickNum / entry.draftSize) : null;
      entry.picks.push({
        overallPick: pickNum,
        round: round,
        pickNumber: pickNum,
        firstName: first,
        lastName: last,
        player: fullName,
        position: r['Position'] || '',
        team: r['Team'] || '',
        siteADP: null,
        pickedAt: r['Picked At'] || null,
      });
      if (r['Picked At'] && (!entry.draftedAt || r['Picked At'] < entry.draftedAt)) {
        entry.draftedAt = r['Picked At'];
      }
    });
    Object.values(byEntry).forEach(function (e) {
      e.picks.sort(function (a, b) { return (a.overallPick || 0) - (b.overallPick || 0); });
    });
    return Object.values(byEntry);
  };

  BB.normalizeDK = function (rows) {
    var byLineup = {};
    rows.forEach(function (r) {
      var key = r['LineupKey'];
      if (!key) return;
      if (!byLineup[key]) {
        byLineup[key] = {
          rosterId: 'DK:' + key,
          source: 'DK',
          platform: 'DraftKings',
          tournament: r['ContestName'] || '',
          tournamentId: r['TournamentKey'] || '',
          draftId: r['ContestKey'] || '',
          draftEntryId: key,
          entryFee: num(r['EntryFee']),
          draftSize: null,
          totalPrizes: null,
          draftedAt: r['PickedAt'] || null,
          picks: [],
        };
      }
      var entry = byLineup[key];
      entry.picks.push({
        overallPick: num(r['OverallPick']),
        round: num(r['Round']),
        pickNumber: num(r['PickInRound']),
        firstName: '',
        lastName: '',
        player: r['Player'] || '',
        position: r['Position'] || '',
        team: '',
        siteADP: num(r['SiteADP']),
        pickedAt: r['PickedAt'] || null,
      });
    });
    Object.values(byLineup).forEach(function (e) {
      e.picks.sort(function (a, b) { return (a.overallPick || 0) - (b.overallPick || 0); });
      // DK has no team in CSV — try to fill from ADP lookup
      e.picks.forEach(function (p) {
        if (!p.team && window.BB_DATA) {
          var hit = window.BB_DATA.lookupADP(p.player);
          if (hit) p.team = hit.team || '';
        }
      });
      if (!e.draftSize && e.picks.length) {
        // Guess draft size from highest pick / round
        var maxOverall = 0, maxRound = 0;
        e.picks.forEach(function (p) {
          if (p.overallPick > maxOverall) maxOverall = p.overallPick;
          if (p.round > maxRound) maxRound = p.round;
        });
        if (maxRound > 0) e.draftSize = Math.round(maxOverall / maxRound);
      }
    });
    return Object.values(byLineup);
  };

  BB.normalizeDrafters = function (rows) {
    var byDraft = {};
    rows.forEach(function (r) {
      var key = r['draftID'] + '|' + (r['Team Name'] || '');
      if (!r['draftID']) return;
      if (!byDraft[key]) {
        byDraft[key] = {
          rosterId: 'DR:' + key,
          source: 'DRAFTERS',
          platform: 'Drafters',
          tournament: r['Contest Name'] || '',
          tournamentId: r['draftID'] || '',
          draftId: r['draftID'] || '',
          draftEntryId: r['Team Name'] || '',
          entryFee: null,
          draftSize: null,
          totalPrizes: null,
          draftedAt: r['Pick Time'] || null,
          picks: [],
        };
      }
      var entry = byDraft[key];
      var round = num(r['Round']);
      var pickInRound = num(r['Pick number']);
      entry.picks.push({
        overallPick: null,
        round: round,
        pickNumber: pickInRound,
        firstName: '',
        lastName: '',
        player: r['Player Name'] || '',
        position: r['Position'] || '',
        team: r['Team'] || '',
        siteADP: null,
        pickedAt: r['Pick Time'] || null,
      });
    });
    Object.values(byDraft).forEach(function (e) {
      // estimate draft size from max pick-in-round
      var maxPIR = 0;
      e.picks.forEach(function (p) { if (p.pickNumber > maxPIR) maxPIR = p.pickNumber; });
      e.draftSize = maxPIR || null;
      e.picks.forEach(function (p) {
        if (e.draftSize && p.round && p.pickNumber) {
          p.overallPick = (p.round - 1) * e.draftSize + p.pickNumber;
        }
      });
      e.picks.sort(function (a, b) { return (a.overallPick || 0) - (b.overallPick || 0); });
    });
    return Object.values(byDraft);
  };

  BB.importCSVText = function (text) {
    var rows = BB.csvToObjects(text);
    if (!rows.length) return { added: 0, skipped: 0, format: null, error: 'CSV had no data rows.' };
    var headers = Object.keys(rows[0]);
    var fmt = BB.detectFormat(headers);
    if (!fmt) return { added: 0, skipped: 0, format: null, error: 'Unrecognized CSV format. Expected Underdog, DraftKings, or Drafters export.' };
    var newRosters;
    if (fmt === 'UD') newRosters = BB.normalizeUD(rows);
    else if (fmt === 'DK') newRosters = BB.normalizeDK(rows);
    else newRosters = BB.normalizeDrafters(rows);

    var existing = BB.loadRosters();
    var existingIds = {};
    existing.forEach(function (r) { existingIds[r.rosterId] = true; });
    var added = 0, skipped = 0;
    var addedIds = [];
    newRosters.forEach(function (r) {
      if (existingIds[r.rosterId]) { skipped++; return; }
      existing.push(r);
      addedIds.push(r.rosterId);
      added++;
    });
    BB.saveRosters(existing);
    return { added: added, skipped: skipped, format: fmt, addedRosterIds: addedIds };
  };

  // ---------- aggregations ----------
  BB.summary = function (rosters) {
    var totalFees = 0;
    var byPlatform = {};
    rosters.forEach(function (r) {
      totalFees += r.entryFee || 0;
      byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
    });
    return {
      totalEntries: rosters.length,
      totalEntryFees: totalFees,
      byPlatform: byPlatform,
    };
  };

  // Compute per-player exposures across all rosters, optionally filtered.
  // Returns array of {
  //   player, position, team,
  //   count, exposurePct,
  //   fees,          // sum of entry fees of rosters containing the player
  //   feesPct,       // player's share of total entry fees across all rosters
  //   byPlatform: { Underdog: #, ... },
  //   exposurePctByPlatform: { ... },
  //   myADP,         // average overall pick across rosters where player appears
  //   adp,           // reference ADP row { name, pos, team, ud, dk, drafters, ... }
  //   marketADP,     // canonical reference ADP (Underdog when present, else dk, else drafters, else avg)
  //   clv,           // myADP - marketADP (positive = got the player later than market, i.e. value)
  // }
  BB.computeExposures = function (rosters, opts) {
    opts = opts || {};
    var totals = { __all__: 0, fees: 0 };
    rosters.forEach(function (r) {
      totals.__all__++;
      totals[r.platform] = (totals[r.platform] || 0) + 1;
      totals.fees += r.entryFee || 0;
    });

    var map = {};
    rosters.forEach(function (r) {
      var seen = {};
      r.picks.forEach(function (p) {
        var key = (p.player || '').toLowerCase();
        if (!key || seen[key]) return;
        seen[key] = true;
        if (!map[key]) {
          map[key] = {
            player: p.player,
            position: p.position,
            team: p.team,
            count: 0,
            fees: 0,
            byPlatform: {},
            sumPick: 0,
            samplePicks: 0,
          };
        }
        var e = map[key];
        e.count++;
        e.fees += r.entryFee || 0;
        e.byPlatform[r.platform] = (e.byPlatform[r.platform] || 0) + 1;
        if (p.overallPick) { e.sumPick += p.overallPick; e.samplePicks++; }
        if (!e.team && p.team) e.team = p.team;
        if (!e.position && p.position) e.position = p.position;
      });
    });

    function canonADP(adp) {
      if (!adp) return null;
      // Prefer Underdog (dominant best ball ADP), then DraftKings, then Drafters.
      if (adp.ud != null) return adp.ud;
      if (adp.dk != null) return adp.dk;
      if (adp.drafters != null) return adp.drafters;
      var vals = [adp.ud, adp.dk, adp.drafters, adp.bb10, adp.rtsports].filter(function (v) { return v != null; });
      if (!vals.length) return null;
      return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    }

    var results = Object.keys(map).map(function (k) {
      var e = map[k];
      var myADP = e.samplePicks ? e.sumPick / e.samplePicks : null;
      var adp = window.BB_DATA ? window.BB_DATA.lookupADP(e.player) : null;
      var marketADP = canonADP(adp);
      var clv = (myADP != null && marketADP != null) ? (myADP - marketADP) : null;
      var pctBy = {};
      Object.keys(e.byPlatform).forEach(function (p) {
        if (totals[p]) pctBy[p] = e.byPlatform[p] / totals[p];
      });
      return {
        player: e.player,
        position: e.position || (adp && adp.pos) || '',
        team: e.team || (adp && adp.team) || '',
        count: e.count,
        exposurePct: e.count / (totals.__all__ || 1),
        fees: e.fees,
        feesPct: totals.fees ? e.fees / totals.fees : 0,
        byPlatform: e.byPlatform,
        exposurePctByPlatform: pctBy,
        myADP: myADP,
        adp: adp,
        marketADP: marketADP,
        clv: clv,
      };
    });
    return results;
  };

  // Detail report for one player across all loaded rosters.
  // Returns:
  // {
  //   player, position, team,
  //   rostersWith,        // array of roster objects containing this player (each augmented with the pick row for the player)
  //   totalRosters,       // count of all rosters in the input
  //   exposureCount,
  //   exposurePct,
  //   fees,
  //   feesPct,
  //   myADP,              // average overall pick of this player across rosters
  //   roundDistribution,  // { round -> count } for the player's pick across rosters
  //   combos: [           // top pairings, sorted by combo% desc
  //     { player, position, team, coCount, comboPct, theirExposurePct, lift }
  //   ]
  // }
  BB.playerReport = function (rosters, playerName) {
    var norm = (window.BB_DATA && window.BB_DATA.normalizeName)
      ? window.BB_DATA.normalizeName(playerName)
      : String(playerName || '').toLowerCase().trim();

    var totals = { count: rosters.length, fees: 0 };
    rosters.forEach(function (r) { totals.fees += r.entryFee || 0; });

    var rostersWith = [];
    var sumPick = 0;
    var samplePicks = 0;
    var roundDist = {};
    var fees = 0;

    // Per-roster pass: find player, gather metadata, and also tally combo counts
    var coCount = {};       // normName -> count
    var meta = {};          // normName -> { player, position, team }

    // Overall exposure index across all rosters (so we can compute lift)
    var overallSeen = {};   // normName -> count
    rosters.forEach(function (r) {
      var seen = {};
      r.picks.forEach(function (p) {
        var k = window.BB_DATA.normalizeName(p.player);
        if (!k || seen[k]) return;
        seen[k] = true;
        overallSeen[k] = (overallSeen[k] || 0) + 1;
        if (!meta[k]) meta[k] = { player: p.player, position: p.position, team: p.team };
        else {
          if (!meta[k].team && p.team) meta[k].team = p.team;
          if (!meta[k].position && p.position) meta[k].position = p.position;
        }
      });
    });

    rosters.forEach(function (r) {
      var hit = null;
      for (var i = 0; i < r.picks.length; i++) {
        if (window.BB_DATA.normalizeName(r.picks[i].player) === norm) { hit = r.picks[i]; break; }
      }
      if (!hit) return;
      rostersWith.push(Object.assign({}, r, { _pick: hit }));
      fees += r.entryFee || 0;
      if (hit.overallPick) { sumPick += hit.overallPick; samplePicks++; }
      if (hit.round) roundDist[hit.round] = (roundDist[hit.round] || 0) + 1;

      var counted = {};
      r.picks.forEach(function (p) {
        var k = window.BB_DATA.normalizeName(p.player);
        if (!k || k === norm || counted[k]) return;
        counted[k] = true;
        coCount[k] = (coCount[k] || 0) + 1;
      });
    });

    var combos = Object.keys(coCount).map(function (k) {
      var m = meta[k] || {};
      var co = coCount[k];
      var theirExposureCount = overallSeen[k] || 0;
      var theirExposurePct = totals.count ? theirExposureCount / totals.count : 0;
      var comboPct = rostersWith.length ? co / rostersWith.length : 0;
      var lift = theirExposurePct ? comboPct / theirExposurePct : null;
      return {
        normName: k,
        player: m.player,
        position: m.position,
        team: m.team,
        coCount: co,
        comboPct: comboPct,
        theirExposureCount: theirExposureCount,
        theirExposurePct: theirExposurePct,
        lift: lift,
      };
    }).sort(function (a, b) { return b.coCount - a.coCount; });

    var myADP = samplePicks ? sumPick / samplePicks : null;
    var adp = window.BB_DATA ? window.BB_DATA.lookupADP(playerName) : null;
    var marketADP = adp ? (adp.ud != null ? adp.ud : (adp.dk != null ? adp.dk : (adp.drafters != null ? adp.drafters : null))) : null;
    var clv = (myADP != null && marketADP != null) ? (myADP - marketADP) : null;

    // Derive position/team if no rosters contain the player yet — use the ADP reference
    var firstHit = rostersWith[0] && rostersWith[0]._pick;
    var position = (firstHit && firstHit.position) || (adp && adp.pos) || '';
    var team = (firstHit && firstHit.team) || (adp && adp.team) || '';

    return {
      player: (adp && adp.name) || (firstHit && firstHit.player) || playerName,
      position: position,
      team: team,
      adp: adp,
      marketADP: marketADP,
      myADP: myADP,
      clv: clv,
      rostersWith: rostersWith,
      totalRosters: totals.count,
      exposureCount: rostersWith.length,
      exposurePct: totals.count ? rostersWith.length / totals.count : 0,
      fees: fees,
      feesPct: totals.fees ? fees / totals.fees : 0,
      roundDistribution: roundDist,
      combos: combos,
    };
  };

  // ---------- formatting helpers ----------
  BB.fmtPct = function (x) {
    if (x == null || isNaN(x)) return '—';
    return (x * 100).toFixed(1) + '%';
  };
  BB.fmtMoney = function (x) {
    if (x == null || isNaN(x)) return '—';
    return '$' + Number(x).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  BB.fmtADP = function (x) {
    if (x == null || isNaN(x)) return '—';
    var n = Number(x);
    return n.toFixed(1);
  };

  // ---------- demo data ----------
  BB.loadDemoData = function () {
    var udCSV =
      'Picked At,Pick Number,Appearance,First Name,Last Name,Team,Position,Draft,Draft Entry,Draft Entry Fee,Draft Size,Draft Total Prizes,Tournament Title,Tournament,Tournament Entry Fee,Tournament Total Prizes,Tournament Size\n';
    var picks = [
      ['Bijan','Robinson','ATL','RB',1],
      ['Justin','Jefferson','MIN','WR',2],
      ['Saquon','Barkley','PHI','RB',13],
      ['Drake','London','ATL','WR',14],
      ['George','Kittle','SF','TE',25],
      ['Garrett','Wilson','NYJ','WR',26],
      ['Kyren','Williams','LAR','RB',37],
      ['Tee','Higgins','CIN','WR',38],
      ['Patrick','Mahomes','KC','QB',49],
      ['Jaylen','Waddle','MIA','WR',50],
      ['Caleb','Williams','CHI','QB',61],
      ['Brock','Bowers','LV','TE',62],
      ['Jaylen','Warren','PIT','RB',73],
      ['Khalil','Shakir','BUF','WR',74],
      ['Bo','Nix','DEN','QB',85],
      ['Travis','Etienne','JAX','RB',86],
      ['Wan\'Dale','Robinson','NYG','WR',97],
      ['Jordan','Mason','SF','RB',98],
    ];
    var rows = [];
    var lineupA = 'demo-ud-A';
    var lineupB = 'demo-ud-B';
    [lineupA, lineupB].forEach(function (lid, idx) {
      picks.forEach(function (p, i) {
        // Add a tweak in lineup B
        var pl = p.slice();
        if (idx === 1 && i === 2) pl = ['Bucky','Irving','TB','RB',13];
        if (idx === 1 && i === 9) pl = ['Stefon','Diggs','NE','WR',50];
        rows.push([
          '2025-08-10T20:01:00Z', pl[4], 1, pl[0], pl[1], pl[2], pl[3],
          'demo-draft-' + (idx + 1), lid, 25, 12, 100000,
          'Best Ball Mania VII', 'demo-bbm7', 25, 15000000, 750000
        ]);
      });
    });
    var csv = udCSV + rows.map(function (r) { return r.join(','); }).join('\n');
    return BB.importCSVText(csv);
  };
})();
