// Box score importer: reads stats out of text that was pasted, dragged in, or
// dropped as a saved web page (ESPN, NFL.com, Pro-Football-Reference layouts),
// and can fetch the latest game from ESPN's public scoreboard data.
// Works in the browser (window.FBImport) and in Node (require) for tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- text helpers ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", ndash: '-', mdash: '-' };
  function htmlToText(html) {
    return String(html || '')
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '')
      // block tags inside a table cell shouldn't split the row
      .replace(/(<t[dh]\b[^>]*>)([\s\S]*?)(<\/t[dh]>)/gi, (m, a, inner, b) => a + inner.replace(/<(br|\/?div|\/?p|\/?li)\b[^>]*>/gi, ' ') + b)
      .replace(/\s*\n\s*/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<(br|\/tr|\/p|\/div|\/li|\/h\d|\/caption|\/thead|\/tbody|\/table)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&(#?\w+);/g, (m, e) => (ENT[e] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m)));
  }

  // Rows of cells. Tab-separated lines keep empty cells so table columns stay aligned.
  function toRows(text) {
    return String(text || '').replace(/\r/g, '').replace(/ /g, ' ').split('\n')
      .map((line) => (line.includes('\t') ? line.split('\t') : line.trim().split(/ {2,}/)).map((c) => c.trim()))

      .filter((cells) => cells.some((c) => c !== ''));
  }

  const isNum = (s) => /^-?\d+(\.\d+)?$/.test(s);
  const VALUE = /^(-?\d+(\.\d+)?%?|\d+\s*[-\/]\s*-?\d+(\s*-\s*-?\d+%?)*|\d{1,2}:\d{2})$/;
  const intsIn = (s) => (String(s).match(/\d+/g) || []).map(Number);

  function aliasesFor(us) {
    const a = [String(us || '').toLowerCase()].filter(Boolean);
    if (/patriots|new england/i.test(us || '')) a.push('patriots', 'new england', 'ne', 'nwe', 'nep');
    return a;
  }
  function isUs(label, aliases) {
    const l = String(label || '').toLowerCase().replace(/[^a-z ]/g, ' ').trim();
    if (!l) return false;
    return aliases.some((a) => (a.length <= 3 ? l.split(/\s+/).includes(a) : l.includes(a)));
  }

  // ---------- team stats (label + two values) ----------
  const LABELS = [
    ['third', /(3rd|third)[ -]down(s)?( efficiency| eff\.?| conversions?| conv\.?)?/],
    ['compAtt', /(comp(letions)?\s*[\/-]\s*att(empts)?(\s*-\s*int)?|cmp-att-yd-td-int|comp-att-int)/],
    ['passYds', /(passing|net passing yards|net yards passing|net pass yards|passing yards)/],
    ['rushYds', /(rushing|rushing yards|net yards rushing|net rushing yards)/],
    ['rushAtt', /(rushing attempts|rush attempts|rushes)/],
    ['rushCombo', /(rush-yds-tds)/],
    ['int', /(interceptions thrown|interceptions|int thrown)/],
    ['sacks', /(sacks\s*-\s*yards lost|sacked\s*-\s*yards|sacked\s*-\s*yds\s*lost|sacks\s*-\s*yds\s*lost|sacked-yds)/],
    ['pen', /(penalties|penalties\s*-\s*yards|penalties\s*-\s*yds|total penalties)/],
    ['top', /(possession|time of possession|possession time|poss\.? time)/],
    ['drives', /(total drives|drives)/],
  ].map(([k, re]) => [k, new RegExp(`^(?:${re.source})\\s*:?\\s*([-\\d:\\/%.\\s]*)$`, 'i')]);

  function teamStats(rows) {
    const cells = rows.flat().filter((c) => c !== '');
    const out = {};
    for (let i = 0; i < cells.length; i++) {
      for (const [k, re] of LABELS) {
        if (out[k]) continue;
        const m = re.exec(cells[i]);
        if (!m) continue;
        const rest = m[m.length - 1].trim();
        // whatever follows the label in the same cell must be values only ("Penalties 5-45 8-70")
        let vals = rest ? rest.split(/\s+(?=[\d-])/).map((t) => t.trim()) : [];
        if (!vals.every((v) => VALUE.test(v))) continue;
        for (let j = i + 1; j < cells.length && vals.length < 2 && j <= i + 4; j++) {
          const parts = cells[j].split(/\s+/);
          if (parts.every((v) => VALUE.test(v))) vals.push(...parts); else break;
        }
        if (vals.length >= 2) { out[k] = vals.slice(0, 2); break; }
      }
    }
    return out;
  }

  // ---------- score by quarter ----------
  function lineScores(rows) {
    const found = [];
    for (const r0 of rows) {
      let r = r0.filter((c) => c !== '');
      if (r.length === 1) r = r[0].split(/\s+/);
      let k = r.length;
      while (k > 0 && isNum(r[k - 1])) k--;
      const nums = r.slice(k).map(Number);
      const name = r.slice(0, k).join(' ').trim();
      if (!name || nums.length < 5 || nums.length > 7 || /^(final|total|q\d|1|t)$/i.test(name)) continue;
      const qs = nums.slice(0, -1);
      if (qs.reduce((a, b) => a + b, 0) !== nums[nums.length - 1] || qs.length < 4 || qs.length > 6) continue;
      if (nums.some((q) => !Number.isInteger(q) || q < 0 || q > 99)) continue;
      found.push({ name, q: qs.length > 5 ? qs.slice(0, 5) : qs });
      if (found.length === 2) break;
    }
    if (found.length < 2) {
      // one cell per line: look for a name followed by quarter scores and their total
      const cells = rows.flat().filter((c) => c !== '');
      const alt = [];
      for (let i = 0; i < cells.length && alt.length < 2; i++) {
        if (isNum(cells[i]) || VALUE.test(cells[i]) || cells[i].length > 40 || /^(final|total|t)$/i.test(cells[i])) continue;
        const nums = [];
        for (let j = i + 1; j < cells.length && nums.length < 7 && /^\d+$/.test(cells[j]); j++) nums.push(Number(cells[j]));
        for (let k = Math.min(6, nums.length - 1); k >= 4; k--) {
          const qs = nums.slice(0, k);
          if (qs.reduce((a, b) => a + b, 0) === nums[k]) { alt.push({ name: cells[i], q: qs.slice(0, 5) }); i += k + 1; break; }
        }
      }
      if (alt.length === 2) return alt;
    }
    return found;
  }

  // ---------- player tables (passing / receiving / kicking) ----------
  const SECTION = /^(.*?)\s*(passing|rushing|receiving|kicking|fumbles|defensive|interceptions|kick returns|punt returns|punting)\b.*$/i;
  function headerIndex(h, name, after = -1) {
    for (let i = after + 1; i < h.length; i++) if (h[i].toLowerCase() === name) return i;
    return -1;
  }
  function playerTables(rows, aliases) {
    const tables = []; // {team, section, header, rows:[{name, cells}]}
    let title = null;
    let cur = null;
    let pendingNames = [];
    for (const r of rows) {
      const nonEmpty = r.filter((c) => c !== '');
      const low = nonEmpty.map((c) => c.toLowerCase());
      const isHeader = (low.includes('yds') || low.includes('c/att') || low.includes('fg')) &&
        nonEmpty.filter((c) => /^[A-Za-z\/%]+$/.test(c)).length >= Math.max(3, nonEmpty.length - 1);
      if (isHeader) {
        cur = { team: title ? title.team : '', section: title ? title.section : '', header: r.map((c) => c.toLowerCase()), rows: [] };
        tables.push(cur);
        pendingNames = [];
        continue;
      }
      if (nonEmpty.length <= 2 && !nonEmpty.some((c) => VALUE.test(c))) {
        const m = SECTION.exec(nonEmpty.join(' '));
        if (m) { title = { team: m[1], section: m[2].toLowerCase() }; cur = null; pendingNames = []; continue; }
        if (cur && nonEmpty.length === 1) { pendingNames.push(nonEmpty[0]); continue; }
        continue;
      }
      if (!cur) continue;
      const numericCount = nonEmpty.filter((c) => VALUE.test(c)).length;
      if (numericCount < 2) continue;
      // ESPN can split names and numbers into separate tables; pair them up in order
      let name = nonEmpty.filter((c) => !VALUE.test(c))[0] || '';
      let cells = r;
      if (!name && pendingNames.length) name = pendingNames.shift();
      cur.rows.push({ name, cells, raw: nonEmpty });
    }
    // which team each table belongs to (title like "Patriots Receiving", or a "Tm" column)
    for (const t of tables) {
      const tm = t.header.indexOf('tm');
      t.usRows = t.rows.filter((row) => {
        if (tm >= 0) {
          const off = row.cells.length - t.header.length;
          return isUs(row.cells[tm + off], aliases);
        }
        return isUs(t.team, aliases);
      });
      t.oppRows = tm >= 0 ? t.rows.filter((row) => !t.usRows.includes(row)) : (isUs(t.team, aliases) ? [] : t.rows);
    }
    return tables;
  }
  const cellAt = (t, row, idx) => {
    if (idx < 0) return undefined;
    const off = row.cells.length - t.header.length;
    return row.cells[idx + off];
  };
  const isTeamRow = (row) => /^team$|^total|^team total/i.test(row.name || '');

  function fromTables(tables, which) {
    const res = {};
    const pick = (t) => (which === 'us' ? t.usRows : t.oppRows);
    // receivers
    for (const t of tables) {
      const rec = headerIndex(t.header, 'rec');
      const yds = headerIndex(t.header, 'yds', rec);
      if (rec < 0 || yds < 0 || (t.section && t.section !== 'receiving' && !t.header.includes('tm'))) continue;
      const list = pick(t).filter((r) => !isTeamRow(r)).map((r) => ({ name: r.name, rec: Number(cellAt(t, r, rec)), yds: Number(cellAt(t, r, yds)) }))
        .filter((r) => Number.isFinite(r.rec) && Number.isFinite(r.yds) && r.rec > 0);
      if (list.length) { res.receivers = (res.receivers || []).concat(list); }
    }
    // passing (team row if present, else sum of players)
    for (const t of tables) {
      if (res.passing) break;
      const catt = headerIndex(t.header, 'c/att');
      const cmp = headerIndex(t.header, 'cmp');
      const att = headerIndex(t.header, 'att', cmp);
      if (catt < 0 && (cmp < 0 || att < 0)) continue;
      const first = catt >= 0 ? catt : att;
      const yds = headerIndex(t.header, 'yds', first);
      const td = headerIndex(t.header, 'td', yds);
      const int = headerIndex(t.header, 'int', td);
      const sk = (() => { const s = headerIndex(t.header, 'sacks', int); return s >= 0 ? s : headerIndex(t.header, 'sk', int); })();
      let rowsUse = pick(t);
      const teamRow = rowsUse.find(isTeamRow);
      if (teamRow) rowsUse = [teamRow];
      rowsUse = rowsUse.filter((r) => {
        const c = catt >= 0 ? intsIn(cellAt(t, r, catt)) : [Number(cellAt(t, r, cmp)), Number(cellAt(t, r, att))];
        return c.length >= 2 && Number.isFinite(c[1]) && c[1] > 0;
      });
      if (!rowsUse.length) continue;
      const p = { comp: 0, att: 0, yds: 0, td: 0, int: 0, sacks: 0 };
      for (const r of rowsUse) {
        const c = catt >= 0 ? intsIn(cellAt(t, r, catt)) : [Number(cellAt(t, r, cmp)), Number(cellAt(t, r, att))];
        p.comp += c[0]; p.att += c[1];
        p.yds += Number(cellAt(t, r, yds)) || 0;
        p.td += Number(cellAt(t, r, td)) || 0;
        p.int += Number(cellAt(t, r, int)) || 0;
        if (sk >= 0) p.sacks += intsIn(cellAt(t, r, sk) || '')[0] || 0;
      }
      p.hasSacks = sk >= 0;
      res.passing = p;
    }
    // kicking: FG "made/att"
    for (const t of tables) {
      const fg = headerIndex(t.header, 'fg');
      if (fg < 0) continue;
      const rows = pick(t).filter((r) => !isTeamRow(r));
      let made = 0; let att = 0; let ok = false;
      for (const r of rows) { const v = intsIn(cellAt(t, r, fg) || ''); if (v.length >= 2) { made += v[0]; att += v[1]; ok = true; } }
      if (ok) { res.fg = { made, att }; break; }
    }
    return res;
  }

  // ---------- main entry ----------
  // Returns { cols: [statsA, statsB] for the two team-stat columns, usCol (0/1 or null),
  //           names: [nameA, nameB], q: [qA, qB], us: {...player data}, opp: {...}, found: [...] }
  function parse(text, usName) {
    const aliases = aliasesFor(usName || 'Patriots');
    const rows = toRows(text);
    const ts = teamStats(rows);
    const ls = lineScores(rows);
    const cols = [{}, {}];
    const setPair = (k, a, b, f) => { const v = [f(ts[k][0]), f(ts[k][1])]; v.forEach((x, i) => { if (x) Object.assign(cols[i], x); }); };
    if (ts.third) setPair('third', 0, 1, (v) => { const n = intsIn(v); return n.length >= 2 ? { thirdConv: n[0], thirdAtt: n[1] } : null; });
    const one = (k, key) => { if (ts[k]) setPair(k, 0, 1, (v) => (isNum(v) ? { [key]: Number(v) } : null)); };
    one('passYds', 'passYds'); one('rushYds', 'rushYds'); one('rushAtt', 'rushAtt'); one('int', 'passInt'); one('drives', 'drives');
    if (ts.compAtt) setPair('compAtt', 0, 1, (v) => {
      const n = intsIn(v);
      if (n.length >= 5) return { passComp: n[0], passAtt: n[1], passYds: n[2], passTD: n[3], passInt: n[4] };
      return n.length >= 2 ? { passComp: n[0], passAtt: n[1] } : null;
    });
    if (ts.rushCombo) setPair('rushCombo', 0, 1, (v) => { const n = intsIn(v); return n.length >= 2 ? { rushAtt: n[0], rushYds: n[1] } : null; });
    if (ts.sacks) setPair('sacks', 0, 1, (v) => { const n = intsIn(v); return n.length ? { sacks: n[0] } : null; });
    if (ts.pen) setPair('pen', 0, 1, (v) => { const n = intsIn(v); return n.length >= 2 ? { penalties: n[0], penYds: n[1] } : null; });
    if (ts.top) setPair('top', 0, 1, (v) => (/^\d{1,2}:\d{2}$/.test(v) ? { top: v } : null));

    let usCol = null;
    const names = ls.map((l) => l.name);
    if (ls.length === 2) {
      if (isUs(ls[0].name, aliases)) usCol = 0;
      else if (isUs(ls[1].name, aliases)) usCol = 1;
    }
    if (usCol === null) {
      // a two-cell header row like "NE  BUF" above the team stats
      for (const r of rows) {
        const ne = r.filter((c) => c !== '');
        if (ne.length === 2 && ne.every((c) => c.length <= 30 && !VALUE.test(c))) {
          if (isUs(ne[0], aliases) && !isUs(ne[1], aliases)) { usCol = 0; names[0] = names[0] || ne[0]; names[1] = names[1] || ne[1]; break; }
          if (isUs(ne[1], aliases) && !isUs(ne[0], aliases)) { usCol = 1; names[0] = names[0] || ne[0]; names[1] = names[1] || ne[1]; break; }
        }
      }
    }
    const tables = playerTables(rows, aliases);
    return {
      cols, usCol, names, q: [ls[0] ? ls[0].q : null, ls[1] ? ls[1].q : null],
      us: fromTables(tables, 'us'), opp: fromTables(tables, 'opp'),
      empty: !Object.keys(cols[0]).length && !Object.keys(cols[1]).length && !ls.length && !tables.length,
    };
  }

  // Build the stats object for the game from a parse result. swap flips which column is "us".
  function toStats(p, prev, swap) {
    const usCol = (p.usCol ?? 0) ^ (swap ? 1 : 0);
    const oppCol = 1 - usCol;
    const team = (col, players) => {
      const t = { q: (p.q[col] || []).map(String), ...stringify(p.cols[col]) };
      const ps = players && players.passing;
      if (ps) {
        // the QB box gives gross passing yards (what passer rating uses) and passing TDs
        Object.assign(t, { passComp: ps.comp, passAtt: ps.att, passYds: ps.yds, passTD: ps.td, passInt: ps.int });
        if (ps.hasSacks && t.sacks === undefined) t.sacks = ps.sacks;
      }
      if (players && players.fg) { t.fgMade = players.fg.made; t.fgAtt = players.fg.att; }
      return stringifyAll(t);
    };
    const usPlayers = swap ? p.opp : p.us;
    const oppPlayers = swap ? p.us : p.opp;
    const stats = {
      us: prev.us || 'Patriots',
      opponent: cleanName(p.names[oppCol]) || '',
      date: p.date || '',
      teams: { us: team(usCol, usPlayers), opp: team(oppCol, oppPlayers) },
      receivers: ((usPlayers && usPlayers.receivers) || []).sort((a, b) => b.yds - a.yds).slice(0, 6)
        .map((r) => ({ name: r.name, rec: String(r.rec), yds: String(r.yds) })),
      seasonPoints: p.seasonPoints != null ? p.seasonPoints : prev.seasonPoints || '',
      kickerPct: prev.kickerPct ?? '',
    };
    return stats;
  }
  const stringify = (o) => { const r = {}; for (const k in o) r[k] = String(o[k]); return r; };
  const stringifyAll = (t) => { const r = {}; for (const k in t) r[k] = k === 'q' ? t.q : String(t[k]); return r; };
  const cleanName = (n) => String(n || '').replace(/\s*\(\d+-\d+(-\d+)?\)\s*/g, ' ').replace(/^(at|vs\.?|@)\s+/i, '').replace(/\s+/g, ' ').trim();

  // List of [label, filled?] used to tell the teacher what was found.
  const FIELDS = [
    ['Score by quarter', (s) => s.teams.us.q.length && s.teams.opp.q.length],
    ['Completions / attempts', (s) => s.teams.us.passAtt],
    ['Passing yards', (s) => s.teams.us.passYds],
    ['Passing TDs', (s) => s.teams.us.passTD],
    ['Interceptions', (s) => s.teams.us.passInt],
    ['Sacks', (s) => s.teams.us.sacks],
    ['Rushing', (s) => s.teams.us.rushAtt && s.teams.us.rushYds],
    ['3rd downs', (s) => s.teams.us.thirdAtt],
    ['Penalties', (s) => s.teams.us.penalties],
    ['Time of possession', (s) => s.teams.us.top],
    ['Drives', (s) => s.teams.us.drives],
    ['Field goals', (s) => s.teams.us.fgAtt],
    ['Receivers', (s) => s.receivers.length],
  ];
  function report(stats) {
    const found = [];
    const missing = [];
    for (const [label, f] of FIELDS) (f(stats) ? found : missing).push(label);
    return { found, missing };
  }

  // ---------- ESPN (public site API, no key) ----------
  // Converts ESPN's JSON into the same text layout the paste parser reads.
  function espnToText(summary) {
    const comp = summary.header.competitions[0];
    const order = [...comp.competitors].sort((a, b) => (a.homeAway === 'away' ? -1 : 1) - (b.homeAway === 'away' ? -1 : 1));
    const lines = [];
    for (const c of order) {
      const qs = (c.linescores || []).map((l) => Number(l.displayValue ?? l.value));
      const total = qs.reduce((a, b) => a + b, 0);
      lines.push([c.team.displayName, ...qs, total].join('\t'));
    }
    lines.push('');
    const bt = summary.boxscore.teams;
    const byId = (id) => bt.find((t) => String(t.team.id) === String(id)) || bt[order.findIndex((o) => String(o.team.id) === String(id))];
    const A = byId(order[0].team.id);
    const B = byId(order[1].team.id);
    lines.push(['', order[0].team.abbreviation, order[1].team.abbreviation].join('\t'));
    for (const s of A.statistics || []) {
      const o = (B.statistics || []).find((x) => x.name === s.name);
      if (o) lines.push([s.label || s.name, s.displayValue, o.displayValue].join('\t'));
    }
    for (const team of summary.boxscore.players || []) {
      for (const cat of team.statistics || []) {
        if (!['passing', 'receiving', 'kicking'].includes(cat.name)) continue;
        lines.push('', `${team.team.displayName} ${cat.name[0].toUpperCase()}${cat.name.slice(1)}`);
        lines.push(['', ...(cat.labels || [])].join('\t'));
        for (const a of cat.athletes || []) lines.push([a.athlete.displayName || a.athlete.shortName, ...(a.stats || [])].join('\t'));
        if (cat.totals && cat.totals.length) lines.push(['TEAM', ...cat.totals].join('\t'));
      }
    }
    return lines.join('\n');
  }

  async function fetchEspn(teamAbbr = 'ne', fetchFn = (typeof fetch !== 'undefined' ? fetch : null)) {
    const base = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
    const get = async (url) => { const r = await fetchFn(url); if (!r.ok) throw new Error(`ESPN answered ${r.status}`); return r.json(); };
    const sched = await get(`${base}/teams/${teamAbbr}/schedule`);
    const done = (sched.events || []).filter((e) => {
      const st = e.competitions && e.competitions[0] && e.competitions[0].status;
      return st && st.type && st.type.completed;
    });
    if (!done.length) throw new Error('No finished games found on the schedule yet.');
    done.sort((a, b) => new Date(a.date) - new Date(b.date));
    const last = done[done.length - 1];
    const score = (e) => {
      const c = e.competitions[0].competitors.find((x) => String(x.team.abbreviation).toLowerCase() === teamAbbr.toLowerCase());
      if (!c) return null;
      const v = typeof c.score === 'object' ? (c.score.value ?? c.score.displayValue) : c.score;
      return Number.isFinite(Number(v)) ? Number(v) : null;
    };
    const prevPts = done.slice(0, -1).map(score).filter((x) => x != null);
    const summary = await get(`${base}/summary?event=${last.id}`);
    return { text: espnToText(summary), date: String(last.date || '').slice(0, 10), seasonPoints: prevPts.join(', ') };
  }

  return { htmlToText, toRows, parse, toStats, report, espnToText, fetchEspn, aliasesFor };
});
