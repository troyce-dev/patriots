/* global FBQuestions, FBPlays, FBLive, FBNFL */
(function () {
  'use strict';
  const Q = FBQuestions;
  const P = FBPlays;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const KEY = 'statsFootball.v1';

  // Five different NFL teams by default (colors and names only).
  const DEFAULT_TEAMS = FBNFL.DEFAULT.map((a) => FBNFL.asTeam(a));

  let state = load() || {
    stats: clone(Q.SAMPLE), isSample: true, custom: '', disabled: {}, order: 'easy',
    teams: clone(DEFAULT_TEAMS), rules: { start: 35, timer: 0, sound: true, style: 'self', v: 2 }, game: null,
  };

  // Self-paced race is the main way to play now: switch older saves over once, and drop the timer.
  if (state.rules && state.rules.v !== 2) {
    state.rules.style = 'self';
    state.rules.timer = 0;
    state.rules.v = 2;
  }
  if (state.rules) state.rules.timer = 0;

  // Older saves used "Team 1"…"Team 5": give those NFL teams.
  (function migrateTeams() {
    if (!state.teams) return;
    state.teams.forEach((t, i) => {
      if (!t.nfl && /^Team \d+$/.test(t.name || '')) Object.assign(t, FBNFL.asTeam(FBNFL.DEFAULT[i % FBNFL.DEFAULT.length]));
    });
  })();

  function load() {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    if (typeof livePublish === 'function') livePublish();
  }

  // team color for name tags/buttons: light helmets (e.g. white) use their stripe color so white text stays readable
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 0; const n = parseInt(m[1], 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const tagColor = (t) => (t && lum(t.color) > 0.72 && t.stripe ? t.stripe : (t && t.color) || '#888');

  // =================== SOUND ===================
  let actx = null;
  function tone(freq, start, dur, type = 'square', vol = 0.08, slideTo) {
    if (!state.rules.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime + start;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(actx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch (e) { /* no audio */ }
  }
  const sfx = {
    whistle: () => { for (let i = 0; i < 6; i++) tone(2600 + (i % 2) * 180, i * 0.05, 0.06, 'sine', 0.06); },
    tick: () => tone(900, 0, 0.04, 'square', 0.03),
    good: () => { tone(523, 0, 0.12); tone(659, 0.1, 0.12); tone(784, 0.2, 0.2); },
    bad: () => tone(220, 0, 0.45, 'sawtooth', 0.07, 90),
    meh: () => tone(330, 0, 0.18, 'triangle', 0.08),
    td: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.18, 'square', 0.07)),
  };

  // =================== HELMET ===================
  function helmetSVG(color, stripe, label, mask) {
    const L = String(label || '');
    const fs = L.length >= 3 ? 19 : L.length === 2 ? 24 : 26;
    return `<svg viewBox="0 0 120 92" class="helmet-svg" aria-hidden="true">
      <path d="M14 66 C2 46 8 18 36 8 C62 -1 92 8 101 32 L103 42 L80 44 L78 56 L92 58 L92 70 L66 72 C56 84 30 86 14 66 Z"
        fill="${esc(color)}" stroke="#111" stroke-width="3"/>
      <path d="M30 13 C55 3 86 10 97 30" fill="none" stroke="${esc(stripe)}" stroke-width="7" stroke-linecap="round"/>
      <path d="M22 60 C30 74 48 78 60 72" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
      <circle cx="54" cy="52" r="6" fill="#222"/>
      <g stroke="${esc(mask || '#cfd3d6')}" stroke-width="5" fill="none" stroke-linecap="round">
        <path d="M80 44 L114 46"/><path d="M80 56 L114 58"/><path d="M76 70 L110 70"/>
        <path d="M114 44 L114 70"/><path d="M98 45 L98 70"/>
      </g>
      <text x="${L.length >= 3 ? 38 : 36}" y="${L.length >= 3 ? 42 : 44}" font-size="${fs}" font-weight="900" text-anchor="middle" fill="${esc(stripe)}" stroke="#111" stroke-width="1"
        font-family="Arial Black, Arial, sans-serif">${esc(L)}</text>
    </svg>`;
  }
  const initials = (name, i) => {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return String(i + 1);
    if (/^team$/i.test(w[0]) && w[1]) return w[1].slice(0, 2).toUpperCase();
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
  };
  const teamHelmet = (t, i) => helmetSVG(t.color, t.stripe, t.abbr || initials(t.name, i), t.mask);

  // =================== SETUP SCREEN ===================
  function buildStatsForm() {
    const s = state.stats;
    $('#s-us').value = s.us || '';
    $('#s-opp').value = s.opponent || '';
    $('#s-date').value = s.date || '';
    $('#s-season').value = s.seasonPoints || '';
    $('#s-kpct').value = s.kickerPct ?? '';
    const qn = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];
    const qRow = (side, label) => `<tr><th>${esc(label)}</th>${qn.map((_, i) =>
      `<td><input type="number" min="0" data-q="${side}" data-i="${i}" value="${esc((s.teams[side].q || [])[i] ?? '')}"></td>`).join('')}
      <td class="total" id="tot-${side}"></td></tr>`;
    $('#t-quarters').innerHTML = `<tr><th></th>${qn.map((q) => `<th>${q}</th>`).join('')}<th>Final</th></tr>` +
      qRow('us', s.us || 'Us') + qRow('opp', s.opponent || 'Opp');
    $('#t-stats').innerHTML = `<tr><th></th><th>${esc(s.us || 'Us')}</th><th>${esc(s.opponent || 'Opp')}</th></tr>` +
      Q.STAT_ROWS.map(([k, label]) => `<tr><th>${esc(label)}</th>${['us', 'opp'].map((side) =>
        `<td><input ${k === 'top' ? 'type="text" placeholder="30:00"' : 'type="number" min="0"'} data-side="${side}" data-k="${k}"
          value="${esc(s.teams[side][k] ?? '')}"></td>`).join('')}</tr>`).join('');
    const recs = s.receivers || [];
    $('#t-receivers').innerHTML = '<tr><th>Player</th><th>Catches</th><th>Yards</th></tr>' +
      [0, 1, 2, 3, 4, 5].map((i) => {
        const r = recs[i] || {};
        return `<tr><td><input type="text" data-r="${i}" data-f="name" value="${esc(r.name ?? '')}"></td>
          <td><input type="number" min="0" data-r="${i}" data-f="rec" value="${esc(r.rec ?? '')}"></td>
          <td><input type="number" data-r="${i}" data-f="yds" value="${esc(r.yds ?? '')}"></td></tr>`;
      }).join('');
    updateTotals();
    $('#sample-note').classList.toggle('warn', !!state.isSample);
    $('#sample-note').textContent = state.isSample
      ? 'These are SAMPLE numbers (made up). Drop this week\'s box score in the box above (or type it in below) to replace them.'
      : 'Check the numbers below. Blank boxes are fine — questions that need them are skipped. Everything saves automatically on this computer.';
  }
  function updateTotals() {
    for (const side of ['us', 'opp']) {
      const q = (state.stats.teams[side].q || []).map(Number).filter(Number.isFinite);
      const el = $(`#tot-${side}`);
      if (el) el.textContent = q.length ? q.reduce((a, b) => a + b, 0) : '';
    }
  }
  function readStatsForm(e) {
    const s = state.stats;
    const t = e.target;
    if (t.classList) t.classList.remove('missing', 'imported');
    if (t.id === 's-us') s.us = t.value;
    else if (t.id === 's-opp') s.opponent = t.value;
    else if (t.id === 's-date') s.date = t.value;
    else if (t.id === 's-season') s.seasonPoints = t.value;
    else if (t.id === 's-kpct') s.kickerPct = t.value;
    else if (t.dataset.q) {
      const arr = s.teams[t.dataset.q].q = s.teams[t.dataset.q].q || [];
      arr[Number(t.dataset.i)] = t.value;
      while (arr.length && (arr[arr.length - 1] === '' || arr[arr.length - 1] == null)) arr.pop();
      for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = '';
      updateTotals();
    } else if (t.dataset.side) s.teams[t.dataset.side][t.dataset.k] = t.value;
    else if (t.dataset.r) {
      s.receivers = s.receivers || [];
      const r = s.receivers[Number(t.dataset.r)] = s.receivers[Number(t.dataset.r)] || {};
      r[t.dataset.f] = t.value;
    } else return;
    if (state.isSample) { state.isSample = false; $('#sample-note').classList.remove('warn'); }
    save();
    if (t.id === 's-us' || t.id === 's-opp') {
      // update table headers without losing focus
      const ths = $$('#t-stats tr:first-child th');
      ths[1].textContent = s.us || 'Us';
      ths[2].textContent = s.opponent || 'Opp';
      $$('#t-quarters tr th:first-child')[1].textContent = s.us || 'Us';
      $$('#t-quarters tr th:first-child')[2].textContent = s.opponent || 'Opp';
    }
    renderQuestionList();
  }

  function allQuestions() {
    return Q.generate(state.stats).concat(Q.parseCustom(state.custom));
  }
  function renderQuestionList() {
    const qs = allQuestions();
    $('#q-list').innerHTML = qs.map((q) => `<li class="${state.disabled[q.id] ? 'off' : ''}">
        <label><input type="checkbox" data-id="${esc(q.id)}" ${state.disabled[q.id] ? '' : 'checked'}>
        <span class="lvl">${'★'.repeat(q.level)}</span> <span class="topic">${esc(q.topic)}</span></label>
        <div class="qq">${esc(q.q)}</div>
        <div class="qa"><b>Answer:</b> ${esc(q.a)}${q.work ? ` <span class="work">— ${esc(q.work)}</span>` : ''}</div>
      </li>`).join('') || '<li class="hint">No questions yet — enter some stats or add your own below.</li>';
    const n = qs.filter((q) => !state.disabled[q.id]).length;
    $('#setup-status').textContent = `${n} question${n === 1 ? '' : 's'} ready`;
    $('.tab[data-tab="questions"]').textContent = `2 · Questions (${n})`;
  }

  function renderTeamEdit() {
    const opts = (sel) => `<option value="">Custom team</option>${FBNFL.NFL_TEAMS.map((n) =>
      `<option value="${n.abbr}" ${n.abbr === sel ? 'selected' : ''}>${esc(n.city)} ${esc(n.name)}</option>`).join('')}`;
    $('#team-edit').innerHTML = state.teams.map((t, i) => `<div class="team-row">
      <div class="mini-helmet">${teamHelmet(t, i)}</div>
      <label>NFL team <select data-nfl="${i}">${opts(t.nfl || '')}</select></label>
      <label>Name <input type="text" data-t="${i}" data-f="name" value="${esc(t.name)}"></label>
      <label>Helmet <input type="color" data-t="${i}" data-f="color" value="${esc(t.color)}"></label>
      <label>Stripe <input type="color" data-t="${i}" data-f="stripe" value="${esc(t.stripe)}"></label>
    </div>`).join('');
  }

  function renderRules() {
    $('#r-start').value = String(state.rules.start);
    $('#r-sound').checked = !!state.rules.sound;
    $('#r-style').value = state.rules.style || 'self';
    $('#r-sack').checked = state.rules.sack !== false;
    $('#rule-sack').classList.toggle('hidden', state.rules.sack === false);
    $('#rule-self').classList.toggle('hidden', state.rules.style !== 'self');
    $('#ev-pass').textContent = P.expected('pass').toFixed(1);
    $('#ev-run').textContent = P.expected('run').toFixed(1);
    $('#ev-def').textContent = P.expected('defense').toFixed(1);
    $('#q-order').value = state.order;
  }

  function showSetup() {
    stopTimer();
    $('#game').classList.add('hidden');
    $('#setup').classList.remove('hidden');
    $('#btn-resume').classList.toggle('hidden', !(state.game && state.game.winner == null));
    imp = null;
    $('#import-result').classList.add('hidden');
    buildStatsForm();
    renderQuestionList();
    renderTeamEdit();
    renderRules();
    if (state.live) renderLiveCard();
  }

  function initSetup() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
      $$('.tabpane').forEach((p) => p.classList.toggle('active', p.id === `tab-${b.dataset.tab}`));
    }));
    $('#tab-stats').addEventListener('input', readStatsForm);
    $('#btn-sample').addEventListener('click', () => {
      if (!confirm('Replace the stats with the made-up sample numbers?')) return;
      state.stats = clone(Q.SAMPLE); state.isSample = true; imp = null; $('#import-result').classList.add('hidden'); save(); buildStatsForm(); renderQuestionList();
    });
    $('#btn-clear').addEventListener('click', () => {
      if (!confirm('Clear all stats so you can enter this week\'s game?')) return;
      const blank = () => ({ q: [] });
      state.stats = { us: state.stats.us || 'Patriots', opponent: '', date: '', teams: { us: blank(), opp: blank() },
        receivers: [], seasonPoints: state.stats.seasonPoints || '', kickerPct: state.stats.kickerPct ?? '' };
      state.isSample = false; imp = null; $('#import-result').classList.add('hidden'); save(); buildStatsForm(); renderQuestionList();
    });
    $('#q-list').addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (!id) return;
      if (e.target.checked) delete state.disabled[id]; else state.disabled[id] = true;
      e.target.closest('li').classList.toggle('off', !e.target.checked);
      save(); renderQuestionList();
    });
    $('#q-all').addEventListener('click', () => { state.disabled = {}; save(); renderQuestionList(); });
    $('#q-none').addEventListener('click', () => { allQuestions().forEach((q) => { state.disabled[q.id] = true; }); save(); renderQuestionList(); });
    $('#q-order').addEventListener('change', (e) => { state.order = e.target.value; save(); });
    $('#q-custom').value = state.custom || '';
    $('#q-custom').addEventListener('input', (e) => { state.custom = e.target.value; save(); renderQuestionList(); });
    $('#q-print').addEventListener('click', printKey);
    $('#team-edit').addEventListener('input', (e) => {
      const t = e.target.dataset.t;
      if (t == null) return;
      state.teams[t][e.target.dataset.f] = e.target.value;
      save();
      const row = e.target.closest('.team-row');
      $('.mini-helmet', row).innerHTML = teamHelmet(state.teams[t], Number(t));
    });
    $('#team-edit').addEventListener('change', (e) => {
      const i = e.target.dataset.nfl;
      if (i == null) return;
      const team = state.teams[i];
      if (e.target.value) Object.assign(team, FBNFL.asTeam(e.target.value));
      else { delete team.nfl; delete team.abbr; delete team.mask; }
      save();
      renderTeamEdit();
      if (typeof renderLiveCard === 'function') renderLiveCard();
    });
    $('#r-start').addEventListener('change', (e) => { state.rules.start = Number(e.target.value); save(); });
    $('#r-sound').addEventListener('change', (e) => { state.rules.sound = e.target.checked; save(); });
    $('#r-style').addEventListener('change', (e) => { state.rules.style = e.target.value; save(); renderRules(); });
    $('#r-sack').addEventListener('change', (e) => { state.rules.sack = e.target.checked; save(); renderRules(); });
    $('#btn-start').addEventListener('click', () => {
      if (state.game && state.game.winner == null && !confirm('Start a new game? The game in progress will be lost.')) return;
      newGame();
    });
  }

  function printKey() {
    const s = state.stats;
    const qs = allQuestions().filter((q) => !state.disabled[q.id]);
    $('#print-key').innerHTML = `<h1>Stats Football — Answer Key</h1>
      <p>${esc(s.us)} vs ${esc(s.opponent)} ${esc(s.date || '')}</p>
      <ol>${qs.map((q) => `<li><p>${esc(q.q)}</p><p><b>${esc(q.a)}</b>${q.work ? `<br><small>${esc(q.work)}</small>` : ''}</p></li>`).join('')}</ol>`;
    window.print();
  }


  // =================== BOX SCORE IMPORT ===================
  let imp = null; // { before, base, parses: [], swap }
  function blankGame(prev) {
    return { us: prev.us || 'Patriots', opponent: '', date: '', teams: { us: { q: [] }, opp: { q: [] } }, receivers: [],
      seasonPoints: prev.seasonPoints || '', kickerPct: prev.kickerPct ?? '' };
  }
  function mergeStats(into, add) {
    if (add.opponent) into.opponent = add.opponent;
    if (add.date) into.date = add.date;
    for (const side of ['us', 'opp']) {
      for (const [k, v] of Object.entries(add.teams[side])) {
        if (k === 'q') { if (v.length) into.teams[side].q = v; } else if (v !== '' && v != null) into.teams[side][k] = v;
      }
    }
    if (add.receivers.length) into.receivers = add.receivers;
    if (add.seasonPoints) into.seasonPoints = add.seasonPoints;
  }
  function applyImport() {
    const s = clone(imp.base);
    // a later drop with no team names uses the column order learned from an earlier one
    const known = imp.parses.find((p) => p.usCol != null);
    for (const p of imp.parses) {
      const use = p.usCol == null && known ? { ...p, usCol: known.usCol } : p;
      mergeStats(s, FBImport.toStats(use, s, imp.swap));
    }
    state.stats = s;
    state.isSample = false;
    save();
    buildStatsForm();
    renderQuestionList();
    markInputs();
    showImportResult();
  }
  function importText(text, fresh) {
    const p = FBImport.parse(text, state.stats.us || 'Patriots');
    if (p.empty) {
      showImportMessage('I couldn’t find any football stats in what was dropped. Try highlighting the <b>Box Score</b> or <b>Team Stats</b> tables on the game page and dragging (or copying) those.', true);
      return;
    }
    if (!imp || fresh) imp = { before: clone(state.stats), base: blankGame(state.stats), parses: [], swap: false };
    imp.parses.push(p);
    applyImport();
  }
  function showImportMessage(html, isErr) {
    const box = $('#import-result');
    box.innerHTML = html;
    box.classList.toggle('err', !!isErr);
    box.classList.remove('hidden');
  }
  function showImportResult() {
    const s = state.stats;
    const r = FBImport.report(s);
    const unsure = imp.parses.every((p) => p.usCol == null);
    const qn = allQuestions().filter((q) => !state.disabled[q.id]).length;
    showImportMessage(
      `<b>✔ Filled in ${esc(s.us)}${s.opponent ? ` vs ${esc(s.opponent)}` : ''}</b> — ${qn} questions ready.<br>` +
      `Found: ${esc(r.found.join(', ') || 'nothing yet')}.` +
      (r.missing.length ? `<br><span class="miss">Still missing: ${esc(r.missing.join(', '))}.</span> Drop another page (e.g. the Box Score or Team Stats tab) or type them in — or leave them blank.` : '') +
      (unsure ? `<br><span class="miss">I couldn’t tell which column is the ${esc(s.us)}. Check the numbers below and press <b>Swap teams</b> if they’re backwards.</span>` : '') +
      `<br><button class="ghost small" data-imp="swap">⇄ Swap teams</button><button class="ghost small" data-imp="undo">↶ Undo import</button>`);
  }
  function markInputs() {
    $$('#t-quarters input, #t-stats input, #t-receivers input').forEach((el) => {
      const filled = el.value.trim() !== '';
      el.classList.toggle('imported', filled);
      const usCol = el.dataset.q === 'us' && el.dataset.i < 4 || el.dataset.side === 'us';
      el.classList.toggle('missing', !filled && usCol);
    });
  }
  async function readDrop(dt) {
    if (dt.files && dt.files.length) {
      let text = '';
      for (const f of dt.files) {
        if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { showImportMessage('PDF files can’t be read here. Open the game page in your browser, highlight the stats and drag them in instead.', true); return; }
        if (/^image\//.test(f.type)) { showImportMessage('Pictures/screenshots can’t be read. Open the game page in your browser, highlight the stats and drag them in instead.', true); return; }
        const t = await f.text();
        text += `\n${/<(table|html|td)\b/i.test(t) ? FBImport.htmlToText(t) : t}`;
      }
      importText(text);
      return;
    }
    const html = dt.getData('text/html');
    const plain = dt.getData('text/plain');
    importText(html && /<t[dr]\b/i.test(html) ? FBImport.htmlToText(html) : plain || FBImport.htmlToText(html));
  }
  function initImport() {
    const dz = $('#dropzone');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); readDrop(e.dataTransfer); });
    dz.addEventListener('click', () => { dz.focus(); $('.dz-big', dz).textContent = '📋 Ready — now press Ctrl+V (⌘V on a Mac) to paste'; });
    dz.addEventListener('blur', () => { $('.dz-big', dz).textContent = '📋 Drag & drop the box score here'; });
    // don't let a file dropped next to the box open in the browser and leave the game
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => { if (!e.target.closest('#dropzone')) e.preventDefault(); });
    document.addEventListener('paste', (e) => {
      if ($('#setup').classList.contains('hidden') || !$('#tab-stats').classList.contains('active')) return;
      if (e.target.matches && e.target.matches('input, textarea')) return;
      e.preventDefault();
      readDrop(e.clipboardData);
    });
    $('#import-result').addEventListener('click', (e) => {
      const b = e.target.closest('[data-imp]');
      if (!b || !imp) return;
      if (b.dataset.imp === 'swap') { imp.swap = !imp.swap; applyImport(); }
      if (b.dataset.imp === 'undo') {
        state.stats = imp.before; imp = null; save(); buildStatsForm(); renderQuestionList();
        showImportMessage('Import undone — the previous numbers are back.');
      }
    });
    $('#btn-espn').addEventListener('click', async () => {
      const btn = $('#btn-espn');
      btn.disabled = true;
      btn.textContent = 'Getting the game from ESPN…';
      try {
        const g = await FBImport.fetchEspn('ne');
        const p = FBImport.parse(g.text, state.stats.us || 'Patriots');
        p.date = g.date;
        p.seasonPoints = g.seasonPoints;
        imp = { before: clone(state.stats), base: blankGame(state.stats), parses: [p], swap: false };
        applyImport();
      } catch (err) {
        showImportMessage(`Couldn’t get the game from ESPN (${esc(err.message || err)}). Your school network may block it — use drag &amp; drop or copy/paste from the game page instead.`, true);
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ Get the latest game from ESPN';
      }
    });
  }

  // =================== TEAM DEVICES (LIVE) ===================
  const RULES_JSON = JSON.stringify({ rules: { rooms: { $room: { '.read': 'auth != null', '.write': 'auth != null' } } } }, null, 2);
  const live = { room: null, status: 'off', answers: {}, calls: {}, selfAnswers: {}, selfCalls: {}, online: {}, seats: {}, subs: [], subKey: '', lastPub: '', pubTimer: null };
  state.live = state.live || { mode: 'off', configText: '', code: FBLive.newRoomCode() };
  const L = () => state.live;
  const liveOn = () => L().mode !== 'off' && !!live.room;
  const fbConfig = () => window.FB_CONFIG || FBLive.parseConfig(L().configText);

  function joinLink() {
    const u = new URL('team.html', location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('room', L().code);
    if (L().mode === 'local') u.searchParams.set('mode', 'local');
    else if (!window.FB_CONFIG && fbConfig()) u.searchParams.set('c', FBLive.b64.enc(fbConfig()));
    return u.toString();
  }
  const teamPage = () => { const u = new URL('team.html', location.href); u.search = ''; u.hash = ''; return u.toString(); };

  function setLiveStatus(s, msg) {
    live.status = s;
    const el = $('#live-status');
    if (el) {
      el.className = `live-status ${s}`;
      el.textContent = msg || { connecting: 'Connecting…', on: '● Connected', err: 'Not connected', off: '' }[s];
    }
    renderLiveDots();
  }

  async function liveConnect() {
    live.subs.forEach((off) => off()); live.subs = []; live.subKey = ''; live.lastPub = '';
    live.room = null;
    if (L().mode === 'off') { setLiveStatus('off'); return; }
    const cfg = L().mode === 'firebase' ? fbConfig() : null;
    if (L().mode === 'firebase' && !cfg) { setLiveStatus('err', 'Paste your Firebase settings first'); return; }
    setLiveStatus('connecting');
    try {
      const backend = await FBLive.connect(L().mode, cfg);
      live.room = backend.room(L().code);
      live.subs.push(live.room.on('presence', (v) => { live.online = v || {}; renderLiveDots(); }));
      live.subs.push(live.room.on('seats', (v) => { live.seats = v || {}; renderLiveDots(); }));
      setLiveStatus('on');
      livePublish(true);
    } catch (err) {
      setLiveStatus('err', `Not connected: ${err.message || err}`);
    }
  }

  // What the team devices see. The answer is only sent after it's revealed.
  function liveSnapshot() {
    const g = state.game;
    const info = { teams: state.teams.map((t) => ({ name: t.name, color: t.color, stripe: t.stripe, mask: t.mask || null, abbr: t.abbr || null })),
      title: `${state.stats.us || ''}${state.stats.opponent ? ` vs ${state.stats.opponent}` : ''}` };
    if (!g) return { info, state: { phase: 'lobby' } };
    if (g.style === 'self') return { info, state: selfSnapshot(g) };
    const q = g.deck[g.qi];
    const st = {
      gameId: g.gameId, phase: g.phase === 'target' ? 'call' : g.phase, qi: g.qi, qcount: g.deck.length,
      question: q ? { q: q.q, topic: q.topic, level: q.level } : null,
      answer: q && g.phase !== 'question' ? q.a : null,
      marks: g.phase !== 'question' ? g.correct : null,
      queue: g.queue || [], qpos: g.qpos || 0,
      pos: g.teams.map((t) => t.pos),
      last: g.last && (g.phase === 'result' || g.phase === 'over') ? g.last : null,
      winner: g.winner,
      sackWrong: state.rules.sack !== false,
    };
    return { info, state: st };
  }
  function livePublish(now) {
    if (!liveOn()) return;
    clearTimeout(live.pubTimer);
    live.pubTimer = setTimeout(() => {
      const snap = liveSnapshot();
      const j = JSON.stringify(snap);
      if (j !== live.lastPub) {
        live.lastPub = j;
        live.room.update('', { info: snap.info, state: snap.state }).catch((e) => setLiveStatus('err', `Not connected: ${e.message || e}`));
      }
      liveSubscribe();
    }, now ? 0 : 40);
  }
  // listen for this question's answers and play calls
  function liveSubscribe() {
    const g = state.game;
    const key = g ? (g.style === 'self' ? `self/${g.gameId}` : `${g.gameId}/${g.qi}`) : '';
    if (!liveOn() || key === live.subKey) return;
    live.subs.splice(2).forEach((off) => off()); // keep presence + seats
    live.subKey = key;
    live.answers = {}; live.calls = {}; live.selfAnswers = {}; live.selfCalls = {}; live.selfFor = null;
    if (!g) return;
    if (g.style === 'self') {
      live.selfFor = g.gameId;
      live.subs.push(live.room.on(`answers/${g.gameId}`, (v) => { live.selfAnswers = v || {}; processSelf(); }));
      live.subs.push(live.room.on(`calls/${g.gameId}`, (v) => { live.selfCalls = v || {}; processSelf(); }));
      return;
    }
    live.subs.push(live.room.on(`answers/${key}`, (v) => {
      live.answers = v || {};
      if (state.game && (state.game.phase === 'question') && !$('#game').classList.contains('hidden')) renderAnswerCount();
    }));
    live.subs.push(live.room.on(`calls/${key}`, (v) => { live.calls = v || {}; checkPendingCall(); }));
  }

  function renderLiveDots() {
    $$('.lane').forEach((l) => l.classList.toggle('online', liveOn() && !!live.online[l.dataset.i]));
    const j = $('#g-join');
    if (j) {
      j.classList.toggle('hidden', !liveOn());
      j.innerHTML = liveOn() ? `Teams join: <b>${esc(teamPage().replace(/^https?:\/\//, ''))}</b> · Room <b>${esc(L().code)}</b>` : '';
    }
    $$('#logins tr[data-i]').forEach((tr) => {
      const i = tr.dataset.i;
      const taken = liveOn() && !!live.seats[i];
      const on = liveOn() && !!live.online[i];
      $('.on', tr).textContent = !taken ? 'Open — waiting for a device' : on ? '● Joined' : 'Taken (device offline)';
      $('.on', tr).className = `on ${!taken ? 'open' : on ? '' : 'away'}`;
      $('[data-free]', tr).classList.toggle('hidden', !taken);
    });
  }
  function renderAnswerCount() {
    const el = $('#answers-in');
    if (!el) return;
    const g = state.game;
    el.innerHTML = `Answers in: ${g.teams.map((t, i) => `<span class="chip small ${live.answers[i] ? '' : 'dim'}" style="--c:${esc(tagColor(t))}">${live.answers[i] ? '✔ ' : ''}${esc(t.name)}</span>`).join(' ')}`;
  }

  // On reveal: copy each team's typed answer into the game and auto-mark it.
  function liveMarkAnswers() {
    const g = state.game;
    const q = g.deck[g.qi];
    g.typed = g.teams.map((_, i) => {
      const a = live.answers[i];
      if (!a) return null;
      const auto = Q.autoCheck(q.a, a.text);
      return { text: String(a.text).slice(0, 200), auto };
    });
    g.correct = g.typed.map((t) => !!(t && t.auto === true));
  }

  // When it's a team's turn and they've already called a play on their device, run it.
  function checkPendingCall() {
    const g = state.game;
    if (!liveOn() || !g || g.phase !== 'call' || $('#game').classList.contains('hidden')) return;
    const ti = g.queue[g.qpos];
    const c = live.calls[ti];
    if (!c || !['pass', 'run', 'defense'].includes(c.call)) return;
    const key = `${g.qi}:${ti}`;
    g.used = g.used || {};
    if (g.used[key]) return;
    g.used[key] = true;
    if (c.call === 'defense') {
      const t = Number(c.target);
      if (!Number.isInteger(t) || t === ti || t < 0 || t >= g.teams.length) { g.phase = 'target'; save(); renderPanel(); return; }
      setTimeout(() => runPlay('defense', t), 600);
    } else setTimeout(() => runPlay(c.call, null), 600);
  }

  function renderLiveCard() {
    const m = L().mode;
    $$('input[name=live-mode]').forEach((r) => { r.checked = r.value === m; });
    $('#live-fb').classList.toggle('hidden', m !== 'firebase');
    $('#live-room').classList.toggle('hidden', m === 'off' || (m === 'firebase' && !fbConfig()));
    $('#fb-config').value = L().configText || '';
    $('#fb-rules').textContent = RULES_JSON;
    const cfg = fbConfig();
    $('#fb-ready').innerHTML = window.FB_CONFIG ? '✔ Firebase settings are built into this site.'
      : cfg ? `✔ Firebase project <b>${esc(cfg.projectId)}</b> is set up.` : 'Firebase isn’t set up yet — follow the steps below.';
    $('#fb-setup').open = !cfg;
    $('#fb-config').classList.toggle('hidden', !!window.FB_CONFIG);
    $('#room-code').textContent = L().code;
    const tp = teamPage();
    $('#team-page').href = tp + (m === 'local' ? '?mode=local' : '');
    $('#team-page').textContent = tp.replace(/^https?:\/\//, '');
    $('#join-link').href = joinLink();
    $('#join-link').textContent = joinLink().replace(/^https?:\/\//, '');
    $('#logins').innerHTML = '<tr><th>Team</th><th>Device</th><th></th></tr>' +
      state.teams.map((t, i) => `<tr data-i="${i}"><td><span class="chip small" style="--c:${esc(tagColor(t))}">${esc(t.name)}</span></td>
        <td class="on"></td><td><button class="ghost small hidden" data-free="${i}">Free this team</button></td></tr>`).join('');
    renderLiveDots();
  }

  const copyText = async (t, btn) => {
    try { await navigator.clipboard.writeText(t); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove();
    }
    if (btn) { const o = btn.textContent; btn.textContent = 'Copied ✔'; setTimeout(() => { btn.textContent = o; }, 1500); }
  };

  function initLive() {
    $$('input[name=live-mode]').forEach((r) => r.addEventListener('change', () => {
      L().mode = r.value; save(); renderLiveCard(); liveConnect();
    }));
    $('#fb-config').addEventListener('input', (e) => {
      L().configText = e.target.value; save();
      const ok = !!FBLive.parseConfig(e.target.value);
      renderLiveCard();
      if (ok) liveConnect();
    });
    $('#fb-copy-rules').addEventListener('click', (e) => copyText(RULES_JSON, e.target));
    $('#room-new').addEventListener('click', () => {
      if (!confirm('Make a new room code? Teams will need the new join link.')) return;
      L().code = FBLive.newRoomCode(); save(); renderLiveCard(); liveConnect();
    });
    $('#copy-join').addEventListener('click', (e) => copyText(joinLink(), e.target));
    $('#logins').addEventListener('click', (e) => {
      const b = e.target.closest('[data-free]');
      if (!b || !liveOn()) return;
      const i = Number(b.dataset.free);
      if (!confirm(`Free ${state.teams[i].name}? That device is sent back to the join screen, and the next device to join takes this team.`)) return;
      live.room.remove(`seats/${i}`);
      live.room.remove(`presence/${i}`);
    });
    $('#reset-seats').addEventListener('click', () => {
      if (!liveOn() || !confirm('Reset all teams? Every device goes back to the join screen and teams are given out again in the order devices join.')) return;
      live.room.remove('seats');
      live.room.remove('presence');
    });
    // team names/colors are shown on the devices too
    $('#team-edit').addEventListener('input', () => { renderLiveCard(); livePublish(); });
    renderLiveCard();
    liveConnect();
  }

  // =================== SELF-PACED GAME ===================
  // Each team works through its own stream of questions on its device.
  // Devices write answers/{gameId}/{team}/{n} and calls/{gameId}/{team}/{c};
  // the projector grades, moves helmets and publishes each team's next step.
  const isSelf = () => !!(state.game && state.game.style === 'self');
  const selfQ = (g, i, n) => g.deck[g.orders[i][n]];
  const callLabel = (c) => ({ pass: 'PASS', run: 'RUN', defense: 'DEFENSE', sack: 'SACK' }[c] || c);
  const playInfo = (e) => (e ? { call: e.call, targetIdx: e.targetIdx, label: e.label, tone: e.tone, from: e.from, to: e.to, moverIdx: e.moverIdx, td: e.td, safety: e.safety } : null);

  function teamOrder(deck) {
    const idx = deck.map((_, k) => k);
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    if (state.order === 'as-is') return idx;
    if (state.order === 'shuffle') return shuffle(idx);
    // warm-ups first, but each team gets its own order inside each level (harder to copy answers)
    return [1, 2, 3].flatMap((l) => shuffle(idx.filter((k) => deck[k].level === l)))
      .concat(idx.filter((k) => ![1, 2, 3].includes(deck[k].level)));
  }

  function newSelfGame(deck) {
    state.game = {
      style: 'self', phase: 'self', gameId: `g${Date.now()}`,
      teams: state.teams.map((t) => ({ ...t, pos: state.rules.start })),
      deck, orders: state.teams.map(() => teamOrder(deck)),
      ts: state.teams.map(() => ({ n: 0, c: 0, status: 'answer', right: 0, wrong: 0, plays: 0, last: null })),
      feed: [], feedId: 0, log: [], winner: null, history: [],
    };
  }

  function selfSnapshot(g) {
    return {
      style: 'self', gameId: g.gameId, phase: g.winner != null ? 'over' : 'self',
      pos: g.teams.map((t) => t.pos), winner: g.winner,
      self: g.ts.map((t, i) => {
        const total = g.orders[i].length;
        const q = t.status === 'answer' && t.n < total ? selfQ(g, i, t.n) : null;
        return { n: t.n, c: t.c, total, status: t.n >= total && t.status === 'answer' ? 'done' : t.status,
          right: t.right, wrong: t.wrong, q: q ? { q: q.q, topic: q.topic, level: q.level } : null, last: t.last };
      }),
    };
  }

  function selfFeedFor(g, i) { return g.feed.find((f) => f.i === i); }

  function selfWrong(g, i, entry) {
    const t = g.ts[i];
    t.wrong += 1;
    entry.result = 'wrong';
    entry.sack = null;
    if (state.rules.sack !== false) {
      const e = P.sack(g, i, 5);
      entry.sack = { from: e.from, to: e.to };
      if (e.from !== e.to) flashDelta(i, e.to - e.from);
    }
    t.status = 'answer';
    t.last = { n: entry.qn + 1, text: entry.text, correct: false, answer: entry.answer, sack: entry.sack };
  }
  function selfRight(g, i, entry) {
    const t = g.ts[i];
    t.right += 1;
    entry.result = 'right';
    t.status = 'call';
    t.last = { n: entry.qn + 1, text: entry.text, correct: true, answer: entry.answer };
  }

  function selfGrade(g, i, text) {
    const t = g.ts[i];
    const q = selfQ(g, i, t.n);
    const entry = { id: ++g.feedId, i, qn: t.n, q: q.q, text: String(text).slice(0, 200), answer: q.a, auto: Q.autoCheck(q.a, text), at: Date.now() };
    t.n += 1;
    g.feed.unshift(entry);
    if (g.feed.length > 60) g.feed.pop();
    if (entry.auto === true) selfRight(g, i, entry);
    else if (entry.auto === false) { selfWrong(g, i, entry); sfx.bad(); }
    else { entry.result = 'review'; t.status = 'review'; }
  }

  function selfPlay(g, i, cl) {
    const t = g.ts[i];
    let call = cl.call;
    let target = null;
    if (!['pass', 'run', 'defense'].includes(call)) call = 'run';
    if (call === 'defense') {
      target = Number(cl.target);
      if (!Number.isInteger(target) || target === i || target < 0 || target >= g.teams.length) {
        // no valid target: go after the leader
        target = g.teams.map((x, k) => ({ k, p: x.pos })).filter((x) => x.k !== i).sort((a, b) => b.p - a.p)[0].k;
      }
    }
    const e = P.apply(g, i, call, target);
    t.c += 1;
    t.plays += 1;
    t.status = 'answer';
    t.last = { ...(t.last || {}), play: playInfo(e) };
    const f = selfFeedFor(g, i);
    if (f && f.result === 'right' && !f.play) f.play = playInfo(e);
    if (e.to !== e.from || e.call !== 'defense') flashDelta(e.moverIdx, e.to - e.from);
    if (e.td) sfx.td(); else (e.tone === 'bad' ? sfx.bad : e.tone === 'meh' ? sfx.meh : sfx.good)();
  }

  // Run every pending answer and play call. Safe to call any time (idempotent).
  function processSelf() {
    const g = state.game;
    if (!isSelf() || g.winner != null || live.selfFor !== g.gameId) return; // never grade with another game's answers
    let changed = false;
    g.ts.forEach((t, i) => {
      for (let guard = 0; guard < 4 && g.winner == null; guard++) {
        if (t.status === 'answer' && t.n < g.orders[i].length) {
          const a = live.selfAnswers && live.selfAnswers[i] && live.selfAnswers[i][t.n];
          if (a && String(a.text || '').trim()) { selfGrade(g, i, a.text); changed = true; continue; }
        } else if (t.status === 'call') {
          const cl = live.selfCalls && live.selfCalls[i] && live.selfCalls[i][t.c];
          if (cl && cl.call) { selfPlay(g, i, cl); changed = true; continue; }
        }
        break;
      }
    });
    if (!changed) return;
    save();
    if (!$('#game').classList.contains('hidden')) { renderHelmets(false); renderPanel(); }
    if (g.winner != null) setTimeout(() => { if (state.game === g && g.phase !== 'over') showWinner(false); }, 1300);
  }

  // Teacher overrides from the feed.
  function selfOverride(id, verdict) {
    const g = state.game;
    const f = g.feed.find((x) => x.id === id);
    if (!f || g.winner != null) return;
    const t = g.ts[f.i];
    const latest = selfFeedFor(g, f.i) === f;
    if (f.result === 'review' && t.status === 'review') {
      if (verdict === 'right') selfRight(g, f.i, f); else selfWrong(g, f.i, f);
    } else if (f.result === 'wrong' && verdict === 'right' && latest && !f.flipped) {
      // give the yards back and a play for this answer
      if (f.sack) {
        const back = f.sack.from - f.sack.to;
        g.teams[f.i].pos = Math.min(99, g.teams[f.i].pos + back);
        if (back) flashDelta(f.i, back);
      }
      t.wrong -= 1;
      f.flipped = true;
      f.sack = null;
      selfRight(g, f.i, f);
      t.last.flipped = true;
    } else if (f.result === 'right' && verdict === 'wrong' && latest && t.status === 'call' && !f.flipped) {
      t.right -= 1;
      f.flipped = true;
      selfWrong(g, f.i, f);
      t.last.flipped = true;
    } else return;
    save();
    renderHelmets(false);
    renderPanel();
    processSelf(); // a waiting answer or call may now be runnable
  }

  function selfStatusText(g, i) {
    const t = g.ts[i];
    const total = g.orders[i].length;
    if (g.winner === i) return '🏆 Touchdown!';
    if (t.status === 'review') return '<b class="warn">Waiting for you to check</b>';
    if (t.status === 'call') return 'Calling a play…';
    if (t.n >= total) return 'Answered every question';
    return `Working on Q${t.n + 1}`;
  }

  function renderSelfPanel() {
    const g = state.game;
    const panel = $('#panel');
    $('#g-qcount').textContent = 'Self-paced · first to the end zone wins';
    const rows = g.teams.map((tm, i) => {
      const t = g.ts[i];
      return `<tr><td>${teamChip(i)}</td><td class="num">${Math.min(t.n, g.orders[i].length)}/${g.orders[i].length}</td>
        <td class="num good">${t.right}</td><td class="num bad">${t.wrong}</td><td class="num">${t.plays}</td><td>${selfStatusText(g, i)}</td></tr>`;
    }).join('');
    const showKeys = !!live.showKeys;
    const waiting = g.ts.filter((t) => t.status === 'review').length;
    const feed = g.feed.slice(0, 14).map((f) => {
      const t = g.ts[f.i];
      const latest = selfFeedFor(g, f.i) === f;
      let mark = f.result === 'right' ? '<span class="mk good">✔</span>' : f.result === 'wrong' ? '<span class="mk bad">✘</span>' : '<span class="mk warn">?</span>';
      let what = '';
      if (f.result === 'wrong') what = f.sack ? `Sacked ${f.sack.to - f.sack.from} yds` : 'No play';
      if (f.result === 'right') what = f.play ? `${callLabel(f.play.call)}${f.play.call === 'defense' ? ` on ${esc(g.teams[f.play.targetIdx].name)}` : ''}: ${esc(f.play.label)} (${f.play.to - f.play.from >= 0 ? '+' : ''}${f.play.to - f.play.from})` : 'Calling a play…';
      if (f.flipped) what += ' <i>(you changed this)</i>';
      let btns = '';
      if (f.result === 'review' && t.status === 'review') btns = `<button class="ghost small" data-ov-id="${f.id}" data-v="right">✔ Right</button><button class="ghost small" data-ov-id="${f.id}" data-v="wrong">✘ Wrong</button>`;
      else if (f.result === 'wrong' && latest && !f.flipped && g.winner == null) btns = `<button class="ghost small" data-ov-id="${f.id}" data-v="right">Mark right</button>`;
      else if (f.result === 'right' && latest && t.status === 'call' && !f.flipped && g.winner == null) btns = `<button class="ghost small" data-ov-id="${f.id}" data-v="wrong">Mark wrong</button>`;
      // answers and keys stay hidden on the projector unless the teacher turns them on
      const detail = showKeys ? `“${esc(f.text)}” <span class="fd-key">key: ${esc(f.answer)}</span> ` : '';
      if (f.result === 'review' && !showKeys) { what = '<b class="warn">Needs your check</b>'; btns = ''; }
      else if (!showKeys) btns = '';
      return `<li class="${f.result}">${mark} ${teamChip(f.i)} <b>Q${f.qn + 1}</b> ${detail}<span class="fd-what">${what}</span> <span class="fd-btns">${btns}</span></li>`;
    }).join('') || '<li class="hint">Answers will show up here as teams send them.</li>';
    panel.innerHTML = `<div class="self-wrap">
        <div class="self-teams"><table class="self-table"><tr><th>Team</th><th>Q</th><th>✔</th><th>✘</th><th>Plays</th><th></th></tr>${rows}</table>
          ${g.winner != null ? '<button class="primary big" data-act="celebrate">🏆 Winner!</button>' : ''}</div>
        <div class="self-feed"><div class="feed-head"><span class="hint">Latest plays${showKeys ? ' — click to change a mark' : ''}</span>
          ${waiting && !showKeys ? `<b class="warn">${waiting} answer${waiting > 1 ? 's' : ''} waiting for you</b>` : ''}
          <button class="ghost small" data-act="keys">${showKeys ? '🙈 Hide answers' : '👁 Show answers (teacher)'}</button></div><ul>${feed}</ul></div>
      </div>`;
  }

  // =================== GAME ===================
  function buildDeck() {
    let qs = allQuestions().filter((q) => !state.disabled[q.id]);
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    if (state.order === 'shuffle') qs = shuffle(qs);
    else if (state.order === 'easy') {
      // shuffle inside each level, keep warm-ups first
      qs = [1, 2, 3].flatMap((l) => shuffle(qs.filter((q) => q.level === l))).concat(qs.filter((q) => ![1, 2, 3].includes(q.level)));
    }
    return qs;
  }

  function newGame() {
    const deck = buildDeck();
    if (!deck.length) { alert('There are no questions selected. Enter stats or add your own questions first.'); return; }
    if (state.rules.style !== 'together') {
      if (!liveOn()) {
        // team devices are required: turn them on and start once connected
        if (L().mode === 'off') { L().mode = 'firebase'; save(); renderLiveCard(); }
        const btn = $('#btn-start');
        btn.disabled = true; btn.textContent = 'Connecting…';
        liveConnect().then(() => {
          btn.disabled = false; btn.textContent = 'Kick off ▶';
          if (liveOn()) newGame();
          else alert('Couldn’t connect the team devices. Check Setup → Teams & rules → Team devices, then try again.');
        });
        return;
      }
      newSelfGame(deck);
      save();
      showGame();
      sfx.whistle();
      return;
    }
    state.game = {
      teams: state.teams.map((t) => ({ ...t, pos: state.rules.start })),
      deck, qi: 0, phase: 'question', correct: state.teams.map(() => false), queue: [], qpos: 0,
      last: null, log: [], winner: null, history: [], gameId: `g${Date.now()}`, typed: null, used: {},
    };
    save();
    showGame();
    sfx.whistle();
  }

  function showGame() {
    $('#setup').classList.add('hidden');
    $('#game').classList.remove('hidden');
    $('#overlay').classList.add('hidden');
    const s = state.stats;
    $('#g-matchup').textContent = `${s.us || ''}${s.opponent ? ` vs ${s.opponent}` : ''}${s.date ? ` · ${new Date(`${s.date}T12:00`).toLocaleDateString()}` : ''}`;
    $('#g-sound').textContent = state.rules.sound ? '🔊' : '🔇';
    buildField();
    renderHelmets(true);
    renderPanel();
    renderLiveDots();
    $('#g-undo').classList.toggle('hidden', isSelf());
    livePublish(true);
    if (state.game.winner != null) showWinner(false);
    else if (isSelf()) processSelf();
    else checkPendingCall();
  }

  const EZ = 7; // end zone width, % of field
  const posToLeft = (pos) => (pos >= 100 ? 100 - EZ / 2 : EZ + (pos / 100) * (100 - 2 * EZ));

  function buildField() {
    let lines = '';
    for (let y = 5; y < 100; y += 5) {
      const left = (y / 100) * 100;
      lines += `<div class="yl ${y % 10 ? 'minor' : ''}" style="left:${left}%"></div>`;
      if (y % 10 === 0) {
        const n = y <= 50 ? y : 100 - y;
        lines += `<div class="ynum top" style="left:${left}%">${n}</div><div class="ynum bot" style="left:${left}%">${n}</div>`;
      }
    }
    $('#turf').innerHTML = lines;
    const g = state.game;
    $('#lanes').innerHTML = g.teams.map((t, i) => `<div class="lane" data-i="${i}">
      <div class="lane-name" style="--c:${esc(tagColor(t))}">${esc(t.name)}</div>
      <div class="helmet" id="h-${i}" style="left:${posToLeft(t.pos)}%">
        ${teamHelmet(t, i)}
        <div class="spot" id="spot-${i}"></div>
        <div class="delta" id="delta-${i}"></div>
      </div></div>`).join('');
  }

  function renderHelmets(instant) {
    const g = state.game;
    g.teams.forEach((t, i) => {
      const h = $(`#h-${i}`);
      if (!h) return;
      if (instant) h.style.transition = 'none';
      h.style.left = `${posToLeft(t.pos)}%`;
      if (instant) { void h.offsetWidth; h.style.transition = ''; }
      $(`#spot-${i}`).textContent = `${100 - t.pos} to go`;
      h.classList.toggle('td', t.pos >= 100);
    });
    const lead = Math.max(...g.teams.map((t) => t.pos));
    $$('.lane').forEach((l, i) => l.classList.toggle('leader', g.teams[i].pos === lead && lead > state.rules.start));
  }

  function flashDelta(i, yards) {
    const d = $(`#delta-${i}`);
    d.textContent = yards > 0 ? `+${yards}` : yards === 0 ? '0' : `${yards}`;
    d.className = `delta show ${yards > 0 ? 'up' : yards < 0 ? 'down' : ''}`;
    setTimeout(() => { d.className = 'delta'; }, 2200);
  }

  // ---- timer ----
  let timerId = null;
  let timeLeft = 0;
  function startTimer() {
    stopTimer();
    if (!state.rules.timer) return;
    timeLeft = state.rules.timer;
    drawTimer();
    timerId = setInterval(() => {
      timeLeft -= 1;
      drawTimer();
      if (timeLeft <= 5 && timeLeft > 0) sfx.tick();
      if (timeLeft <= 0) { stopTimer(); sfx.whistle(); }
    }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
  function drawTimer() {
    const el = $('#timer');
    if (!el) return;
    const m = Math.floor(Math.max(0, timeLeft) / 60);
    const s = Math.max(0, timeLeft) % 60;
    el.textContent = timeLeft > 0 ? `${m}:${String(s).padStart(2, '0')}` : "TIME!";
    el.classList.toggle('low', timeLeft <= 10);
  }

  // ---- panel (bottom half) ----
  function teamChip(i) {
    const t = state.game.teams[i];
    return `<span class="chip" style="--c:${esc(tagColor(t))}">${esc(t.name)}</span>`;
  }

  function renderPanel() {
    if (isSelf() && state.game.phase !== 'over') { renderSelfPanel(); return; }
    const g = state.game;
    const panel = $('#panel');
    const q = g.deck[g.qi];
    $('#g-qcount').textContent = isSelf() ? 'Self-paced · game over' : q ? `Question ${g.qi + 1} of ${g.deck.length}` : 'Out of questions';
    const qBlock = q ? `<div class="qmeta"><span class="lvl">${'★'.repeat(q.level)}</span> ${esc(q.topic)}</div><div class="qtext">${esc(q.q)}</div>` : '';

    if (g.phase === 'question') {
      panel.innerHTML = `<div class="qbox">${qBlock}${liveOn() ? '<div id="answers-in" class="answers-in"></div>' : ''}</div>
        <div class="actions">${state.rules.timer ? '<div id="timer" class="timer"></div>' : ''}
          <button class="primary big" data-act="reveal">${liveOn() ? 'Time’s up — check answers ▶' : 'Reveal answer ▶'}</button></div>`;
      if (liveOn()) renderAnswerCount();
      if (state.rules.timer) { if (!timerId) startTimer(); else drawTimer(); }
    } else if (g.phase === 'answer') {
      stopTimer();
      panel.innerHTML = `<div class="qbox">${qBlock}
          <div class="answer"><b>Answer:</b> ${esc(q.a)}</div>
          ${q.work ? `<div class="work">${esc(q.work)}</div>` : ''}</div>
        <div class="actions col">
          <div class="who">${g.typed ? 'Checked automatically — click a team to change it' : 'Who got it right?'} <small>(keys 1–5)</small></div>
          <div class="team-toggles ${g.typed ? 'typed' : ''}">${g.teams.map((t, i) => {
    const ty = g.typed && g.typed[i];
    return `<button class="toggle ${g.correct[i] ? 'on' : ''}" data-act="toggle" data-i="${i}" style="--c:${esc(tagColor(t))}">
            ${g.correct[i] ? '✔ ' : g.typed ? '✘ ' : ''}${esc(t.name)}${g.typed ? `<small class="typed-ans">${ty ? esc(ty.text) : '(no answer)'}${ty && ty.auto === null ? ' — you decide' : ''}</small>` : ''}</button>`;
  }).join('')}</div>
          <button class="primary big" data-act="plays">${g.correct.some(Boolean) ? 'Call the plays ▶' : 'Nobody — next question ▶'}</button>
          ${state.rules.sack !== false && g.correct.some((c) => !c) ? '<div class="hint">Teams not marked ✔ are sacked −5 yards.</div>' : ''}
        </div>`;
    } else if (g.phase === 'call') {
      const ti = g.queue[g.qpos];
      panel.innerHTML = `<div class="callbox">
          <div class="call-title">${teamChip(ti)} call your play!</div>
          ${liveOn() ? `<div class="hint big-hint">${live.online[ti] ? 'Choose on your device' : 'Team not connected'} — or pick for them here:</div>` : ''}
          <div class="calls">
            <button class="call pass" data-act="call" data-k="pass"><span>PASS</span><small>boom or bust</small></button>
            <button class="call run" data-act="call" data-k="run"><span>RUN</span><small>never loses yards</small></button>
            <button class="call def" data-act="call" data-k="defense"><span>DEFENSE</span><small>push a team back</small></button>
          </div>
          <div class="upnext">${queueText()}</div>
        </div>`;
    } else if (g.phase === 'target') {
      const ti = g.queue[g.qpos];
      panel.innerHTML = `<div class="callbox">
          <div class="call-title">${teamChip(ti)} — which team does your defense go after?</div>
          <div class="team-toggles big">${g.teams.map((t, i) => (i === ti ? '' : `<button class="toggle target" data-act="target" data-i="${i}" style="--c:${esc(tagColor(t))}">
            ${esc(t.name)}<small>${100 - t.pos} to go</small></button>`)).join('')}</div>
          <button class="ghost" data-act="back">← Change play</button>
        </div>`;
    } else if (g.phase === 'rolling') {
      panel.innerHTML = '<div class="callbox"><div class="roll" id="roll"></div></div>';
    } else if (g.phase === 'result') {
      const e = g.last;
      const moreTeams = g.qpos + 1 < g.queue.length;
      const callName = { pass: 'PASS', run: 'RUN', defense: 'DEFENSE' }[e.call];
      const mover = g.teams[e.moverIdx];
      let line;
      if (e.call === 'defense') {
        line = e.yards === 0 ? `${esc(mover.name)} shakes it off — no loss.`
          : `${esc(mover.name)} pushed back ${-e.yards} yards${e.safety ? ' — SAFETY! Back to the 5.' : '.'}`;
      } else {
        line = e.td ? 'TOUCHDOWN!!!' : e.safety ? `Tackled in the end zone — SAFETY! Back to the 5.`
          : e.yards > 0 ? `Gain of ${e.yards} yards.` : e.yards < 0 ? `Loss of ${-e.yards} yards.` : 'No gain.';
      }
      panel.innerHTML = `<div class="callbox">
          <div class="call-title">${teamChip(e.teamIdx)} called <b>${callName}</b>${e.call === 'defense' ? ` on ${teamChip(e.targetIdx)}` : ''}</div>
          <div class="result ${e.tone}">${esc(e.label)}</div>
          <div class="result-line">${line}</div>
          ${g.winner != null ? '<button class="primary big" data-act="celebrate">🏆 Winner!</button>'
    : `<button class="primary big" data-act="next">${moreTeams ? `Next: ${esc(g.teams[g.queue[g.qpos + 1]].name)} ▶` : 'Next question ▶'}</button>`}
        </div>`;
    } else if (g.phase === 'done') {
      const best = Math.max(...g.teams.map((t) => t.pos));
      const leaders = g.teams.filter((t) => t.pos === best).map((t) => t.name);
      panel.innerHTML = `<div class="callbox">
          <div class="call-title">Out of questions!</div>
          <div class="result-line">Closest to the end zone: <b>${esc(leaders.join(' & '))}</b> (${100 - best} yards to go).</div>
          <div class="hint">Add more questions in Setup → Questions (they'll be added to this game), or end here.</div>
          <button class="primary big" data-act="more">Add questions from Setup</button>
        </div>`;
    } else if (g.phase === 'over') {
      panel.innerHTML = `<div class="callbox"><div class="call-title">${teamChip(g.winner)} wins!</div>
        <button class="primary big" data-act="newgame">New game</button></div>`;
    }
  }

  function queueText() {
    const g = state.game;
    const rest = g.queue.slice(g.qpos + 1);
    return rest.length ? `Up next: ${rest.map((i) => esc(g.teams[i].name)).join(' → ')}` : '';
  }

  function nextQuestion() {
    const g = state.game;
    g.qi += 1;
    g.correct = g.teams.map(() => false);
    g.typed = null;
    g.queue = []; g.qpos = 0;
    g.phase = g.qi < g.deck.length ? 'question' : 'done';
    save();
    renderPanel();
  }

  function act(a, el) {
    const g = state.game;
    if (!g) return;
    if (a === 'keys') { live.showKeys = !live.showKeys; renderPanel(); return; }
    if (isSelf() && !['celebrate', 'newgame'].includes(a)) return;
    if (a === 'reveal' && g.phase === 'question') { if (liveOn()) liveMarkAnswers(); g.phase = 'answer'; save(); renderPanel(); }
    else if (a === 'toggle' && g.phase === 'answer') {
      const i = Number(el.dataset.i); g.correct[i] = !g.correct[i]; save(); renderPanel();
    } else if (a === 'plays' && g.phase === 'answer') {
      // wrong answers are sacked (undo goes back to marking)
      if (state.rules.sack !== false && g.correct.some((c) => !c)) {
        const snap = clone({ ...g, history: undefined });
        snap.phase = 'answer';
        g.history.push(snap);
        g.correct.forEach((c, i) => {
          if (c) return;
          const e = P.sack(g, i, 5);
          if (e.from !== e.to) flashDelta(i, e.to - e.from);
        });
        renderHelmets(false);
        sfx.bad();
      }
      // rotate who goes first each question so it's fair
      const n = g.teams.length;
      g.queue = [];
      for (let k = 0; k < n; k++) { const i = (g.qi + k) % n; if (g.correct[i]) g.queue.push(i); }
      g.qpos = 0;
      if (!g.queue.length) { nextQuestion(); return; }
      g.phase = 'call'; save(); renderPanel(); checkPendingCall();
    } else if (a === 'call' && g.phase === 'call') {
      if (el.dataset.k === 'defense') { g.phase = 'target'; save(); renderPanel(); }
      else runPlay(el.dataset.k, null);
    } else if (a === 'target' && g.phase === 'target') runPlay('defense', Number(el.dataset.i));
    else if (a === 'back' && g.phase === 'target') { g.phase = 'call'; renderPanel(); }
    else if (a === 'celebrate' && g.winner != null) showWinner(false);
    else if (a === 'next' && g.phase === 'result' && g.winner == null) {
      if (g.qpos + 1 < g.queue.length) { g.qpos += 1; g.phase = 'call'; save(); renderPanel(); checkPendingCall(); } else nextQuestion();
    } else if (a === 'more') showSetup();
    else if (a === 'newgame') newGame();
  }

  function runPlay(call, target) {
    const g = state.game;
    if (!g || (g.phase !== 'call' && g.phase !== 'target')) return;
    const ti = g.queue[g.qpos];
    g.used = g.used || {};
    g.used[`${g.qi}:${ti}`] = true;
    const snap = clone({ ...g, history: undefined });
    snap.phase = 'call';
    g.history.push(snap);
    if (g.history.length > 60) g.history.shift();
    const e = P.apply(g, ti, call, target);
    g.last = e;
    g.phase = 'rolling';
    save();
    renderPanel();
    // slot-machine style reveal
    const labels = P.TABLES[call].map((o) => o.label);
    const roll = $('#roll');
    let k = 0;
    const spin = setInterval(() => { roll.textContent = labels[k++ % labels.length]; sfx.tick(); }, 90);
    setTimeout(() => {
      clearInterval(spin);
      g.phase = 'result';
      save();
      renderPanel();
      renderHelmets(false);
      flashDelta(e.moverIdx, e.to - e.from);
      if (e.td) { sfx.td(); setTimeout(() => { if (state.game === g && g.winner != null && g.phase !== 'over') showWinner(false); }, 1300); }
      else if (e.safety) sfx.bad();
      else (e.tone === 'bad' ? sfx.bad : e.tone === 'meh' ? sfx.meh : sfx.good)();
    }, 1400);
  }

  function showWinner(fresh) {
    const g = state.game;
    const t = g.teams[g.winner];
    g.phase = 'over';
    save();
    renderPanel();
    const ov = $('#overlay');
    let confetti = '';
    for (let i = 0; i < 80; i++) {
      const c = [t.color, t.stripe, '#ffd100', '#ffffff'][i % 4];
      confetti += `<i style="left:${Math.random() * 100}%;background:${c};animation-delay:${Math.random() * 2}s;animation-duration:${2 + Math.random() * 2}s"></i>`;
    }
    ov.innerHTML = `<div class="confetti">${confetti}</div>
      <div class="win-card">
        <div class="win-helmet">${teamHelmet(t, g.winner)}</div>
        <div class="win-td">TOUCHDOWN!</div>
        <div class="win-name">${esc(t.name)} wins!</div>
        <div class="win-sub">${g.style === 'self' ? `after ${g.ts[g.winner].right} correct answer${g.ts[g.winner].right === 1 ? '' : 's'}` : `after ${g.qi + 1} question${g.qi ? 's' : ''}`}</div>
        <div class="row gap center">
          <button class="ghost" data-ov="close">View field</button>
          <button class="primary" data-ov="new">New game</button>
        </div>
      </div>`;
    ov.classList.remove('hidden');
    if (fresh) sfx.td();
  }

  function undo() {
    const g = state.game;
    if (!g || isSelf() || !g.history.length) return;
    if (g.phase === 'rolling') return;
    const snap = g.history.pop();
    snap.history = g.history;
    if (liveOn() && snap.queue && snap.queue[snap.qpos] != null) {
      // the undone team calls again
      const ti = snap.queue[snap.qpos];
      delete live.calls[ti];
      if (snap.used) delete snap.used[`${snap.qi}:${ti}`];
      live.room.remove(`calls/${snap.gameId}/${snap.qi}/${ti}`);
    }
    state.game = snap;
    save();
    $('#overlay').classList.add('hidden');
    renderHelmets(false);
    renderPanel();
  }

  function initGame() {
    $('#panel').addEventListener('click', (e) => {
      const o = e.target.closest('[data-ov-id]');
      if (o) { selfOverride(Number(o.dataset.ovId), o.dataset.v); return; }
      const b = e.target.closest('[data-act]');
      if (b) act(b.dataset.act, b);
    });
    $('#overlay').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ov]');
      if (!b) return;
      $('#overlay').classList.add('hidden');
      if (b.dataset.ov === 'new') newGame();
    });
    $('#g-undo').addEventListener('click', undo);
    $('#g-setup').addEventListener('click', showSetup);
    $('#g-sound').addEventListener('click', () => {
      state.rules.sound = !state.rules.sound; save();
      $('#g-sound').textContent = state.rules.sound ? '🔊' : '🔇';
    });
    $('#g-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    });
    // teacher can nudge a helmet by clicking it (fix mistakes)
    $('#lanes').addEventListener('click', (e) => {
      const h = e.target.closest('.helmet');
      if (!h) return;
      const i = Number(h.id.slice(2));
      const t = state.game.teams[i];
      const v = prompt(`Move ${t.name} to which spot? Enter yards to go (0–100). Currently ${100 - t.pos}.`, String(100 - t.pos));
      if (v == null) return;
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 1 || n > 100) return;
      t.pos = 100 - n;
      save();
      renderHelmets(false);
    });
    document.addEventListener('keydown', (e) => {
      if ($('#game').classList.contains('hidden') || e.target.matches('input, textarea, select')) return;
      const g = state.game;
      if (!g) return;
      const k = e.key.toLowerCase();
      if (g.phase === 'answer' && /^[1-9]$/.test(k) && Number(k) <= g.teams.length) {
        g.correct[Number(k) - 1] = !g.correct[Number(k) - 1]; save(); renderPanel(); return;
      }
      if (g.phase === 'call' && ['p', 'r', 'd'].includes(k)) {
        act('call', { dataset: { k: { p: 'pass', r: 'run', d: 'defense' }[k] } }); return;
      }
      if (k === ' ' || k === 'enter') {
        const b = $('#panel .primary');
        if (b) { e.preventDefault(); b.click(); }
      }
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
    });
  }

  // Questions added in setup during a game get appended to the deck.
  function syncDeckOnResume() {
    const g = state.game;
    if (!g) return;
    const have = new Set(g.deck.map((q) => q.id + q.q));
    const extra = allQuestions().filter((q) => !state.disabled[q.id] && !have.has(q.id + q.q));
    if (extra.length) {
      const start = g.deck.length;
      g.deck = g.deck.concat(extra);
      if (g.orders) g.orders = g.orders.map((o) => o.concat(extra.map((_, k) => start + k)));
      if (g.phase === 'done') { g.phase = 'question'; g.correct = g.teams.map(() => false); }
      save();
    }
  }

  initSetup();
  initImport();
  initGame();
  initLive();
  $('#btn-resume').addEventListener('click', () => { syncDeckOnResume(); showGame(); });
  showSetup();
})();
