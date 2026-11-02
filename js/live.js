// Live connection between the projector and the team devices.
// Two backends with the same tiny API:
//   - Firebase Realtime Database (real classroom use, devices anywhere)
//   - "local": tabs in the same browser on one computer (practice / demo / tests)
// API: connect(config) -> Promise<Room factory>; room(code) -> { get, set, update, remove, on(path, cb) -> off }
(function (root) {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const loadScript = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(`couldn't load ${src}`));
    document.head.appendChild(s);
  });
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const parts = (path) => String(path || '').split('/').filter(Boolean);

  // Firebase keys can't hold arrays with holes or undefined; keep data plain.
  function firebaseBackend(config) {
    let app;
    let db;
    return {
      kind: 'firebase',
      async start() {
        await loadScript(`${SDK}firebase-app-compat.js`);
        await loadScript(`${SDK}firebase-auth-compat.js`);
        await loadScript(`${SDK}firebase-database-compat.js`);
        const fb = root.firebase;
        app = fb.apps.length ? fb.app() : fb.initializeApp(config);
        await fb.auth(app).signInAnonymously();
        db = fb.database(app);
      },
      room(code) {
        const ref = (p) => db.ref(['rooms', code, ...parts(p)].join('/'));
        return {
          get: (p) => ref(p).get().then((s) => s.val()),
          set: (p, v) => ref(p).set(clone(v)),
          update: (p, v) => ref(p).update(clone(v)),
          remove: (p) => ref(p).remove(),
          on(p, cb) {
            const r = ref(p);
            const h = (snap) => cb(snap.val());
            r.on('value', h);
            return () => r.off('value', h);
          },
          // value that disappears by itself when this device disconnects
          async presence(p, v) { const r = ref(p); await r.onDisconnect().remove(); await r.set(clone(v)); },
          onConnection(cb) {
            const r = db.ref('.info/connected');
            const h = (s) => cb(!!s.val());
            r.on('value', h);
            return () => r.off('value', h);
          },
        };
      },
    };
  }

  // Same-computer backend: one JSON tree per room in localStorage, changes announced to other tabs.
  function localBackend() {
    const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('stats-football-live') : null;
    const listeners = new Set();
    const key = (code) => `statsFootball.live.${code}`;
    const read = (code) => { try { return JSON.parse(localStorage.getItem(key(code))) || {}; } catch (e) { return {}; } };
    const at = (tree, p) => parts(p).reduce((n, k) => (n == null ? null : n[k]), tree);
    const notify = () => listeners.forEach((l) => l());
    if (chan) chan.onmessage = notify;
    window.addEventListener('storage', (e) => { if (String(e.key).startsWith('statsFootball.live.')) notify(); });
    function write(code, p, fn) {
      const tree = read(code);
      const ks = parts(p);
      if (!ks.length) { fn(null, null, tree); } else {
        let n = tree;
        for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
        fn(n, ks[ks.length - 1], tree);
      }
      try { localStorage.setItem(key(code), JSON.stringify(tree)); } catch (e) { /* full */ }
      if (chan) chan.postMessage(code);
      setTimeout(notify, 0);
    }
    return {
      kind: 'local',
      async start() {},
      room(code) {
        return {
          get: async (p) => clone(at(read(code), p)),
          set: async (p, v) => write(code, p, (n, k, tree) => {
            if (n) { if (v == null) delete n[k]; else n[k] = clone(v); } else { Object.keys(tree).forEach((x) => delete tree[x]); Object.assign(tree, clone(v) || {}); }
          }),
          update: async (p, v) => write(code, p, (n, k, tree) => {
            const target = n ? (n[k] = n[k] && typeof n[k] === 'object' ? n[k] : {}) : tree;
            for (const [kk, vv] of Object.entries(v)) {
              const sub = parts(kk);
              let t = target;
              for (const s of sub.slice(0, -1)) { if (t[s] == null || typeof t[s] !== 'object') t[s] = {}; t = t[s]; }
              if (vv == null) delete t[sub[sub.length - 1]]; else t[sub[sub.length - 1]] = clone(vv);
            }
          }),
          remove: async (p) => write(code, p, (n, k) => { if (n) delete n[k]; }),
          on(p, cb) {
            let last;
            const l = () => {
              const v = clone(at(read(code), p));
              const j = JSON.stringify(v);
              if (j !== last) { last = j; cb(v); }
            };
            listeners.add(l);
            setTimeout(l, 0);
            return () => listeners.delete(l);
          },
          async presence(p, v) {
            await this.set(p, v);
            window.addEventListener('pagehide', () => write(code, p, (n, k) => { if (n) delete n[k]; }));
          },
          onConnection(cb) { setTimeout(() => cb(true), 0); return () => {}; },
        };
      },
    };
  }

  // Reads a Firebase config pasted from the console (JS object literal or JSON).
  function parseConfig(text) {
    const t = String(text || '');
    const get = (k) => { const m = new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`).exec(t); return m ? m[1] : ''; };
    const c = { apiKey: get('apiKey'), authDomain: get('authDomain'), databaseURL: get('databaseURL'), projectId: get('projectId'), appId: get('appId') };
    if (!c.apiKey || !c.projectId) return null;
    if (!c.databaseURL) c.databaseURL = `https://${c.projectId}-default-rtdb.firebaseio.com`;
    if (!c.authDomain) c.authDomain = `${c.projectId}.firebaseapp.com`;
    return c;
  }
  const b64 = {
    enc: (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => { try { return JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; } },
  };

  let current = null;
  async function connect(mode, config) {
    const backend = mode === 'local' ? localBackend() : firebaseBackend(config);
    await backend.start();
    current = backend;
    return backend;
  }

  const randomCode = (n, chars) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const newRoomCode = () => randomCode(5, 'ABCDEFGHJKLMNPQRSTUVWXYZ');
  const newPin = () => randomCode(4, '0123456789');

  root.FBLive = { connect, parseConfig, b64, newRoomCode, newPin, get backend() { return current; } };
})(typeof self !== 'undefined' ? self : this);
