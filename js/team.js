/* global FBLive */
// Team device: log in with room code + team PIN, type answers, call plays.
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const LOGIN = 'statsFootball.team.login';
  const CFG = 'statsFootball.team.config';

  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') === 'local' ? 'local' : 'firebase';
  // practice mode runs several teams as tabs in one browser, so each tab keeps its own login
  const loginStore = mode === 'local' ? {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
  } : store;
  let config = window.FB_CONFIG || (params.get('c') && FBLive.b64.dec(params.get('c'))) || store.get(CFG);
  if (params.get('c') && config && !window.FB_CONFIG) store.set(CFG, config);

  let backend = null;
  let room = null;
  let me = null; // team index
  let info = null;
  let st = null;
  let myAnswer = null;
  let myCall = null;
  let editing = false;
  let draft = '';
  let picking = false; // choosing a defense target
  let subs = [];
  let qSubs = [];
  let qKey = '';
  let lastMain = '';

  function helmetSVG(color, stripe, label) {
    return `<svg viewBox="0 0 120 92" class="helmet-svg" aria-hidden="true">
      <path d="M14 66 C2 46 8 18 36 8 C62 -1 92 8 101 32 L103 42 L80 44 L78 56 L92 58 L92 70 L66 72 C56 84 30 86 14 66 Z" fill="${esc(color)}" stroke="#111" stroke-width="3"/>
      <path d="M30 13 C55 3 86 10 97 30" fill="none" stroke="${esc(stripe)}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="54" cy="52" r="6" fill="#222"/>
      <g stroke="#cfd3d6" stroke-width="5" fill="none" stroke-linecap="round"><path d="M80 44 L114 46"/><path d="M80 56 L114 58"/><path d="M76 70 L110 70"/><path d="M114 44 L114 70"/><path d="M98 45 L98 70"/></g>
      <text x="36" y="44" font-size="26" font-weight="900" text-anchor="middle" fill="${esc(stripe)}" stroke="#111" stroke-width="1" font-family="Arial Black, Arial, sans-serif">${esc(label)}</text>
    </svg>`;
  }
  const show = (id) => ['login', 'play', 'fatal'].forEach((x) => $(`#${x}`).classList.toggle('hidden', x !== id));
  function fatal(html) { $('#fatal').innerHTML = html; show('fatal'); }

  // ---------------- login ----------------
  let roomInfoOff = null;
  function watchRoomForLogin(code) {
    if (roomInfoOff) roomInfoOff();
    const sel = $('#l-team');
    if (code.length < 5) { sel.innerHTML = '<option value="">Type the room code first</option>'; return; }
    const r = backend.room(code);
    roomInfoOff = r.on('info', (v) => {
      if (!v || !v.teams) { sel.innerHTML = '<option value="">No game with that room code yet</option>'; return; }
      const cur = sel.value;
      sel.innerHTML = '<option value="">Choose your team</option>' + v.teams.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('');
      sel.value = cur;
    });
  }
  async function tryLogin(code, teamIdx, pin, quiet) {
    const msg = $('#l-msg');
    msg.textContent = '';
    if (!code || !Number.isInteger(teamIdx) || teamIdx < 0) { msg.textContent = 'Enter the room code and choose your team.'; show('login'); return; }
    const r = backend.room(code);
    let v;
    try { v = await r.get('info'); } catch (e) { msg.textContent = `Couldn't reach the game: ${e.message || e}`; show('login'); return; }
    if (!v || !v.teams) { msg.textContent = 'No game with that room code. Check the code on the projector.'; show('login'); return; }
    if (!v.teams[teamIdx]) { msg.textContent = 'Choose your team.'; show('login'); return; }
    if (String((v.pins || [])[teamIdx]) !== String(pin).trim()) {
      msg.textContent = quiet ? 'Your saved login has changed — enter your team PIN.' : 'That PIN doesn’t match this team.';
      $('#l-room').value = code; watchRoomForLogin(code);
      show('login'); return;
    }
    loginStore.set(LOGIN, { room: code, team: teamIdx, pin: String(pin).trim(), mode });
    startPlaying(r, teamIdx);
  }

  // ---------------- playing ----------------
  function startPlaying(r, teamIdx) {
    room = r; me = teamIdx;
    if (roomInfoOff) roomInfoOff();
    show('play');
    subs.forEach((off) => off());
    subs = [
      room.on('info', (v) => { info = v; render(); }),
      room.on('state', (v) => { st = v; watchQuestion(); render(); }),
      room.onConnection((on) => { if (on) room.presence(`presence/${me}`, { at: Date.now() }).catch(() => {}); }),
    ];
  }
  function watchQuestion() {
    const key = st && st.gameId ? `${st.gameId}/${st.qi}` : '';
    if (key === qKey) return;
    qSubs.forEach((off) => off()); qSubs = [];
    qKey = key; myAnswer = null; myCall = null; editing = false; draft = ''; picking = false;
    if (!key) return;
    qSubs.push(room.on(`answers/${key}/${me}`, (v) => { myAnswer = v; render(); }));
    qSubs.push(room.on(`calls/${key}/${me}`, (v) => { myCall = v; if (!v) picking = false; render(); }));
  }

  const teamName = (i) => (info && info.teams[i] ? info.teams[i].name : `Team ${i + 1}`);
  const callName = (c) => ({ pass: 'PASS', run: 'RUN', defense: 'DEFENSE' }[c] || c);

  function mainHTML() {
    if (!st || st.phase === 'lobby' || !st.gameId) {
      return `<div class="t-big">You're in!</div><p class="t-center">Waiting for your teacher to start the game…</p>`;
    }
    const q = st.question;
    const meta = q ? `<div class="t-meta">Question ${st.qi + 1} of ${st.qcount} · <span class="lvl">${'★'.repeat(q.level || 1)}</span> ${esc(q.topic || '')}</div>` : '';
    const qText = q ? `<div class="t-q">${esc(q.q)}</div>` : '';
    if (st.phase === 'over') {
      return st.winner === me ? '<div class="t-big good">🏆 TOUCHDOWN!</div><p class="t-center">Your team wins!</p>'
        : `<div class="t-big">Game over</div><p class="t-center"><b>${esc(teamName(st.winner))}</b> scored first.</p>`;
    }
    if (st.phase === 'done') return '<div class="t-big">Out of questions</div><p class="t-center">Watch the screen!</p>';
    if (st.phase === 'question') {
      if (myAnswer && !editing) {
        return `${meta}${qText}<div class="t-sent">✔ Answer sent: <b>${esc(myAnswer.text)}</b></div>
          <p class="hint">You can change it until your teacher checks the answers.</p>
          <button class="ghost" data-a="edit">Change answer</button>`;
      }
      return `${meta}${qText}<div class="t-answer-box">
          <textarea id="ans" rows="2" placeholder="Type your answer (include units or both parts if asked)">${esc(draft)}</textarea>
          <button class="primary big" data-a="send">Send answer ▶</button></div>`;
    }
    // answer revealed and after
    const ok = st.marks && st.marks[me];
    const inQueue = (st.queue || []).includes(me);
    let top = `${meta}${qText}<div class="t-key"><b>Answer:</b> ${esc(st.answer || '')}</div>
      <div class="t-big ${ok ? 'good' : 'bad'}">${ok ? '✔ Correct!' : '✘ Not this time'}</div>
      <p class="t-center hint">Your answer: ${myAnswer ? esc(myAnswer.text) : '(none sent)'}</p>`;
    if (st.phase === 'answer') {
      return top + (ok ? '<p class="t-center">Get ready to call your play…</p>' : '<p class="t-center">Watch the screen — you can still play defense later!</p>');
    }
    // play calling: call / rolling / result
    const current = (st.queue || [])[st.qpos];
    const last = st.last;
    if (last && st.phase === 'result') {
      if (last.teamIdx === me) {
        top = `<div class="t-center"><div class="t-meta">You called ${callName(last.call)}${last.call === 'defense' ? ` on ${esc(teamName(last.targetIdx))}` : ''}</div>
          <div class="t-big ${last.tone === 'bad' ? 'bad' : 'good'}">${esc(last.label)}</div>
          <p>${last.call === 'defense' ? `${esc(teamName(last.moverIdx))} moved ${last.to - last.from} yards.` : last.td ? 'TOUCHDOWN!' : `${last.to - last.from >= 0 ? '+' : ''}${last.to - last.from} yards`}</p></div>`;
        return top;
      }
      if (last.moverIdx === me && last.call === 'defense') {
        return `<div class="t-big bad">Hit by defense!</div><p class="t-center">${esc(teamName(last.teamIdx))} pushed you back ${last.from - last.to} yards.</p>`;
      }
    }
    if (!inQueue) return `${top}<p class="t-center">Watch the screen!</p>`;
    if (myCall) {
      const done = current !== me && (st.queue || []).indexOf(me) < st.qpos;
      return `<div class="t-sent t-center">Your call: <b>${callName(myCall.call)}</b>${myCall.call === 'defense' ? ` on <b>${esc(teamName(myCall.target))}</b>` : ''}</div>
        <p class="t-center">${done ? 'Done — watch the screen!' : current === me ? 'Here it comes — watch the screen!' : 'Locked in. Wait for your turn…'}</p>`;
    }
    const turn = current === me && st.phase === 'call' ? '<div class="t-turn">It’s your turn!</div>' : '';
    if (picking) {
      const others = info.teams.map((t, i) => ({ t, i })).filter((x) => x.i !== me);
      return `${turn}<div class="t-big">Defense!</div><p class="t-center">Which team do you want to push back?</p>
        <div class="t-targets">${others.map(({ t, i }) => `<button class="toggle" data-a="target" data-i="${i}" style="--c:${esc(t.color)}">
          <span>${esc(t.name)}</span><small>${100 - (st.pos || [])[i]} to go</small></button>`).join('')}</div>
        <button class="ghost wide" data-a="back" style="margin-top:.6rem">← Back</button>`;
    }
    return `${turn}<div class="t-big good">Call your play!</div>
      <div class="t-calls">
        <button class="call pass" data-a="call" data-k="pass"><span>PASS</span><small>boom or bust</small></button>
        <button class="call run" data-a="call" data-k="run"><span>RUN</span><small>steady</small></button>
        <button class="call def" data-a="call" data-k="defense"><span>DEFENSE</span><small>push a team back</small></button>
      </div>`;
  }

  function render() {
    if (me == null || !info) return;
    const t = info.teams[me] || { name: `Team ${me + 1}`, color: '#888', stripe: '#fff' };
    $('#t-helmet').innerHTML = helmetSVG(t.color, t.stripe, String(me + 1));
    $('#t-name').textContent = t.name;
    const pos = st && st.pos ? st.pos[me] : null;
    $('#t-yards').textContent = pos == null ? '' : pos >= 100 ? 'TOUCHDOWN!' : `${100 - pos} yards to go`;
    const html = mainHTML();
    if (html !== lastMain) {
      const ta = $('#ans');
      if (ta) draft = ta.value;
      $('#t-main').innerHTML = html;
      lastMain = html;
      const nt = $('#ans');
      if (nt) { nt.value = draft; }
    }
    if (st && st.pos) {
      const order = info.teams.map((x, i) => ({ x, i, p: st.pos[i] })).sort((a, b) => b.p - a.p);
      $('#t-board').innerHTML = `<h3>The field</h3>${order.map(({ x, i, p }) => `<div class="t-row ${i === me ? 'me' : ''}">
        <span>${esc(x.name)}</span><div class="bar" style="--c:${esc(x.color)}"><i style="width:${Math.min(100, p)}%"></i></div>
        <span class="yd">${p >= 100 ? 'TD' : `${100 - p} to go`}</span></div>`).join('')}`;
    } else $('#t-board').innerHTML = '';
  }

  // ---------------- actions ----------------
  async function sendAnswer() {
    const ta = $('#ans');
    const text = (ta ? ta.value : '').trim();
    if (!text || !st || st.phase !== 'question') return;
    draft = text;
    editing = false;
    await room.set(`answers/${st.gameId}/${st.qi}/${me}`, { text: text.slice(0, 200), at: Date.now() });
  }
  async function sendCall(call, target) {
    if (!st || !(st.queue || []).includes(me)) return;
    picking = false;
    await room.set(`calls/${st.gameId}/${st.qi}/${me}`, target == null ? { call, at: Date.now() } : { call, target, at: Date.now() });
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'send') sendAnswer();
    else if (a === 'edit') { editing = true; draft = myAnswer ? myAnswer.text : ''; lastMain = ''; render(); $('#ans') && $('#ans').focus(); }
    else if (a === 'call') {
      if (b.dataset.k === 'defense') { picking = true; lastMain = ''; render(); } else sendCall(b.dataset.k, null);
    } else if (a === 'target') sendCall('defense', Number(b.dataset.i));
    else if (a === 'back') { picking = false; lastMain = ''; render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'ans') { e.preventDefault(); sendAnswer(); }
  });
  $('#l-room').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); watchRoomForLogin(e.target.value); });
  $('#l-go').addEventListener('click', () => tryLogin($('#l-room').value.trim(), $('#l-team').value === '' ? NaN : Number($('#l-team').value), $('#l-pin').value));
  $('#t-logout').addEventListener('click', () => {
    if (!confirm('Log out of this team?')) return;
    loginStore.del(LOGIN);
    location.href = location.pathname + (mode === 'local' ? '?mode=local' : '');
  });

  // ---------------- start ----------------
  (async function start() {
    if (mode === 'firebase' && !config) {
      fatal(`<h1>🏈 Stats Football</h1><p>This page needs your team's login link from your teacher.</p>
        <p class="hint">Teachers: set up team devices on the projector's Setup → Teams &amp; rules tab, then share each team's link.</p>`);
      return;
    }
    try {
      backend = await FBLive.connect(mode, config);
    } catch (err) {
      fatal(`<h1>Can't connect</h1><p>${esc(err.message || err)}</p><p class="hint">Your network may be blocking the game. Tell your teacher.</p>`);
      return;
    }
    const pRoom = params.get('room');
    if (pRoom) {
      history.replaceState(null, '', location.pathname + (mode === 'local' ? '?mode=local' : ''));
      tryLogin(pRoom.toUpperCase(), Number(params.get('team')) - 1, params.get('pin') || '', false);
      return;
    }
    const saved = loginStore.get(LOGIN);
    if (saved && saved.mode === mode) { tryLogin(saved.room, saved.team, saved.pin, true); return; }
    show('login');
  })();
})();
