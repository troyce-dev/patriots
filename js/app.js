/* global FBQuestions, FBPlays */
(function () {
  'use strict';
  const Q = FBQuestions;
  const P = FBPlays;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const KEY = 'statsFootball.v1';

  const DEFAULT_TEAMS = [
    { name: 'Team 1', color: '#c8102e', stripe: '#ffffff' },
    { name: 'Team 2', color: '#0b3d91', stripe: '#c0c0c0' },
    { name: 'Team 3', color: '#1b7f3b', stripe: '#ffd100' },
    { name: 'Team 4', color: '#f2a900', stripe: '#111111' },
    { name: 'Team 5', color: '#6a1b9a', stripe: '#ffffff' },
  ];

  let state = load() || {
    stats: clone(Q.SAMPLE), isSample: true, custom: '', disabled: {}, order: 'easy',
    teams: clone(DEFAULT_TEAMS), rules: { start: 35, timer: 0, sound: true }, game: null,
  };

  function load() {
    try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

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
  function helmetSVG(color, stripe, label) {
    return `<svg viewBox="0 0 120 92" class="helmet-svg" aria-hidden="true">
      <path d="M14 66 C2 46 8 18 36 8 C62 -1 92 8 101 32 L103 42 L80 44 L78 56 L92 58 L92 70 L66 72 C56 84 30 86 14 66 Z"
        fill="${color}" stroke="#111" stroke-width="3"/>
      <path d="M30 13 C55 3 86 10 97 30" fill="none" stroke="${stripe}" stroke-width="7" stroke-linecap="round"/>
      <path d="M22 60 C30 74 48 78 60 72" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
      <circle cx="54" cy="52" r="6" fill="#222"/>
      <g stroke="#cfd3d6" stroke-width="5" fill="none" stroke-linecap="round">
        <path d="M80 44 L114 46"/><path d="M80 56 L114 58"/><path d="M76 70 L110 70"/>
        <path d="M114 44 L114 70"/><path d="M98 45 L98 70"/>
      </g>
      <text x="36" y="44" font-size="26" font-weight="900" text-anchor="middle" fill="${stripe}" stroke="#111" stroke-width="1"
        font-family="Arial Black, Arial, sans-serif">${esc(label)}</text>
    </svg>`;
  }
  const initials = (name, i) => {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return String(i + 1);
    if (/^team$/i.test(w[0]) && w[1]) return w[1].slice(0, 2).toUpperCase();
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
  };

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
    $('#team-edit').innerHTML = state.teams.map((t, i) => `<div class="team-row">
      <div class="mini-helmet">${helmetSVG(t.color, t.stripe, initials(t.name, i))}</div>
      <label>Name <input type="text" data-t="${i}" data-f="name" value="${esc(t.name)}"></label>
      <label>Helmet <input type="color" data-t="${i}" data-f="color" value="${esc(t.color)}"></label>
      <label>Stripe <input type="color" data-t="${i}" data-f="stripe" value="${esc(t.stripe)}"></label>
    </div>`).join('');
  }

  function renderRules() {
    $('#r-start').value = String(state.rules.start);
    $('#r-timer').value = String(state.rules.timer);
    $('#r-sound').checked = !!state.rules.sound;
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
      $('.mini-helmet', row).innerHTML = helmetSVG(state.teams[t].color, state.teams[t].stripe, initials(state.teams[t].name, Number(t)));
    });
    $('#r-start').addEventListener('change', (e) => { state.rules.start = Number(e.target.value); save(); });
    $('#r-timer').addEventListener('change', (e) => { state.rules.timer = Number(e.target.value); save(); });
    $('#r-sound').addEventListener('change', (e) => { state.rules.sound = e.target.checked; save(); });
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
    state.game = {
      teams: state.teams.map((t) => ({ ...t, pos: state.rules.start })),
      deck, qi: 0, phase: 'question', correct: state.teams.map(() => false), queue: [], qpos: 0,
      last: null, log: [], winner: null, history: [],
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
    if (state.game.winner != null) showWinner(false);
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
      <div class="lane-name" style="--c:${esc(t.color)}">${esc(t.name)}</div>
      <div class="helmet" id="h-${i}" style="left:${posToLeft(t.pos)}%">
        ${helmetSVG(t.color, t.stripe, initials(t.name, i))}
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
    return `<span class="chip" style="--c:${esc(t.color)}">${esc(t.name)}</span>`;
  }

  function renderPanel() {
    const g = state.game;
    const panel = $('#panel');
    const q = g.deck[g.qi];
    $('#g-qcount').textContent = q ? `Question ${g.qi + 1} of ${g.deck.length}` : 'Out of questions';
    const qBlock = q ? `<div class="qmeta"><span class="lvl">${'★'.repeat(q.level)}</span> ${esc(q.topic)}</div><div class="qtext">${esc(q.q)}</div>` : '';

    if (g.phase === 'question') {
      panel.innerHTML = `<div class="qbox">${qBlock}</div>
        <div class="actions">${state.rules.timer ? '<div id="timer" class="timer"></div>' : ''}
          <button class="primary big" data-act="reveal">Reveal answer ▶</button></div>`;
      if (state.rules.timer) { if (!timerId) startTimer(); else drawTimer(); }
    } else if (g.phase === 'answer') {
      stopTimer();
      panel.innerHTML = `<div class="qbox">${qBlock}
          <div class="answer"><b>Answer:</b> ${esc(q.a)}</div>
          ${q.work ? `<div class="work">${esc(q.work)}</div>` : ''}</div>
        <div class="actions col">
          <div class="who">Who got it right? <small>(keys 1–5)</small></div>
          <div class="team-toggles">${g.teams.map((t, i) => `<button class="toggle ${g.correct[i] ? 'on' : ''}" data-act="toggle" data-i="${i}" style="--c:${esc(t.color)}">
            ${g.correct[i] ? '✔ ' : ''}${esc(t.name)}</button>`).join('')}</div>
          <button class="primary big" data-act="plays">${g.correct.some(Boolean) ? 'Call the plays ▶' : 'Nobody — next question ▶'}</button>
        </div>`;
    } else if (g.phase === 'call') {
      const ti = g.queue[g.qpos];
      panel.innerHTML = `<div class="callbox">
          <div class="call-title">${teamChip(ti)} call your play!</div>
          <div class="calls">
            <button class="call pass" data-act="call" data-k="pass"><span>PASS</span><small>boom or bust</small></button>
            <button class="call run" data-act="call" data-k="run"><span>RUN</span><small>steady</small></button>
            <button class="call def" data-act="call" data-k="defense"><span>DEFENSE</span><small>push a team back</small></button>
          </div>
          <div class="upnext">${queueText()}</div>
        </div>`;
    } else if (g.phase === 'target') {
      const ti = g.queue[g.qpos];
      panel.innerHTML = `<div class="callbox">
          <div class="call-title">${teamChip(ti)} — which team does your defense go after?</div>
          <div class="team-toggles big">${g.teams.map((t, i) => (i === ti ? '' : `<button class="toggle target" data-act="target" data-i="${i}" style="--c:${esc(t.color)}">
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
    g.queue = []; g.qpos = 0;
    g.phase = g.qi < g.deck.length ? 'question' : 'done';
    save();
    renderPanel();
  }

  function act(a, el) {
    const g = state.game;
    if (!g) return;
    if (a === 'reveal' && g.phase === 'question') { g.phase = 'answer'; save(); renderPanel(); }
    else if (a === 'toggle' && g.phase === 'answer') {
      const i = Number(el.dataset.i); g.correct[i] = !g.correct[i]; save(); renderPanel();
    } else if (a === 'plays' && g.phase === 'answer') {
      // rotate who goes first each question so it's fair
      const n = g.teams.length;
      g.queue = [];
      for (let k = 0; k < n; k++) { const i = (g.qi + k) % n; if (g.correct[i]) g.queue.push(i); }
      g.qpos = 0;
      if (!g.queue.length) { nextQuestion(); return; }
      g.phase = 'call'; save(); renderPanel();
    } else if (a === 'call' && g.phase === 'call') {
      if (el.dataset.k === 'defense') { g.phase = 'target'; save(); renderPanel(); }
      else runPlay(el.dataset.k, null);
    } else if (a === 'target' && g.phase === 'target') runPlay('defense', Number(el.dataset.i));
    else if (a === 'back' && g.phase === 'target') { g.phase = 'call'; renderPanel(); }
    else if (a === 'celebrate' && g.winner != null) showWinner(false);
    else if (a === 'next' && g.phase === 'result' && g.winner == null) {
      if (g.qpos + 1 < g.queue.length) { g.qpos += 1; g.phase = 'call'; save(); renderPanel(); } else nextQuestion();
    } else if (a === 'more') showSetup();
    else if (a === 'newgame') newGame();
  }

  function runPlay(call, target) {
    const g = state.game;
    const ti = g.queue[g.qpos];
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
        <div class="win-helmet">${helmetSVG(t.color, t.stripe, initials(t.name, g.winner))}</div>
        <div class="win-td">TOUCHDOWN!</div>
        <div class="win-name">${esc(t.name)} wins!</div>
        <div class="win-sub">after ${g.qi + 1} question${g.qi ? 's' : ''}</div>
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
    if (!g || !g.history.length) return;
    if (g.phase === 'rolling') return;
    const snap = g.history.pop();
    snap.history = g.history;
    state.game = snap;
    save();
    $('#overlay').classList.add('hidden');
    renderHelmets(false);
    renderPanel();
  }

  function initGame() {
    $('#panel').addEventListener('click', (e) => {
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
      g.deck = g.deck.concat(extra);
      if (g.phase === 'done') { g.phase = 'question'; g.correct = g.teams.map(() => false); }
      save();
    }
  }

  initSetup();
  initImport();
  initGame();
  $('#btn-resume').addEventListener('click', () => { syncDeckOnResume(); showGame(); });
  showSetup();
})();
