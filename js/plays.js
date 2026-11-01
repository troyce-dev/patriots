// Play engine: random outcomes for Pass, Run and Defense calls, and the
// game state (team yard lines, history for undo, winner).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBPlays = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Each outcome: weight (chance), yards [min, max], label, tone (good/bad/meh).
  // Run = steady, low risk. Pass = boom or bust. Defense = push another team back.
  const TABLES = {
    run: [
      { w: 10, yds: [-3, -1], label: 'Stuffed at the line', tone: 'bad' },
      { w: 28, yds: [1, 3], label: 'Short gain', tone: 'meh' },
      { w: 35, yds: [4, 7], label: 'Solid run', tone: 'good' },
      { w: 18, yds: [8, 14], label: 'Breaks a tackle!', tone: 'good' },
      { w: 7, yds: [15, 30], label: 'Breakaway run!', tone: 'great' },
      { w: 2, yds: [-6, -4], label: 'FUMBLE! Lost yards', tone: 'bad' },
    ],
    pass: [
      { w: 30, yds: [0, 0], label: 'Incomplete', tone: 'meh' },
      { w: 8, yds: [-9, -5], label: 'SACKED!', tone: 'bad' },
      { w: 5, yds: [-12, -8], label: 'INTERCEPTED!', tone: 'bad' },
      { w: 25, yds: [5, 10], label: 'Quick slant, complete', tone: 'good' },
      { w: 20, yds: [11, 20], label: 'Complete over the middle!', tone: 'good' },
      { w: 10, yds: [21, 35], label: 'Deep shot — caught!', tone: 'great' },
      { w: 2, yds: [40, 60], label: 'BOMB! Wide open!', tone: 'great' },
    ],
    defense: [
      { w: 20, yds: [0, 0], label: 'Missed tackle — no effect', tone: 'meh' },
      { w: 35, yds: [-4, -2], label: 'Tackle for a loss', tone: 'good' },
      { w: 30, yds: [-10, -6], label: 'SACK!', tone: 'great' },
      { w: 15, yds: [-18, -12], label: 'Forced turnover!', tone: 'great' },
    ],
  };

  const randInt = (min, max, rnd) => min + Math.floor(rnd() * (max - min + 1));

  function roll(kind, rnd = Math.random) {
    const table = TABLES[kind];
    const total = table.reduce((s, o) => s + o.w, 0);
    let r = rnd() * total;
    let pick = table[table.length - 1];
    for (const o of table) {
      if (r < o.w) { pick = o; break; }
      r -= o.w;
    }
    return { label: pick.label, tone: pick.tone, yards: randInt(pick.yds[0], pick.yds[1], rnd) };
  }

  function expected(kind) {
    const t = TABLES[kind];
    const total = t.reduce((s, o) => s + o.w, 0);
    return t.reduce((s, o) => s + (o.w / total) * ((o.yds[0] + o.yds[1]) / 2), 0);
  }

  const SAFETY_SPOT = 5;

  // Apply a play to the game. Returns a description of what happened.
  // game = { teams: [{name, pos}], winner: null|index, log: [] }
  function apply(game, teamIdx, call, targetIdx, rnd = Math.random) {
    const res = roll(call, rnd);
    const moverIdx = call === 'defense' ? targetIdx : teamIdx;
    const mover = game.teams[moverIdx];
    const from = mover.pos;
    let to = from + res.yards;
    let safety = false;
    let td = false;
    if (to >= 100) { to = 100; td = true; }
    if (to <= 0) { to = SAFETY_SPOT; safety = true; }
    mover.pos = to;
    const entry = { teamIdx, call, targetIdx: call === 'defense' ? targetIdx : null, ...res, moverIdx, from, to, safety, td };
    game.log.push(entry);
    if (td && game.winner == null) game.winner = moverIdx;
    return entry;
  }

  // "Own 35" style yard line from a 0–100 position.
  function yardLine(pos) {
    if (pos >= 100) return 'TOUCHDOWN';
    if (pos === 50) return 'the 50';
    return pos < 50 ? `own ${pos}` : `opp ${100 - pos}`;
  }

  return { TABLES, roll, expected, apply, yardLine, SAFETY_SPOT };
});
