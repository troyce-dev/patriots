// Stats question generator: turns one game's box score into senior-level
// statistics questions (each with an answer and worked solution).
// Works in the browser (window.FBQuestions) and in Node (require) for tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBQuestions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Made-up sample numbers so the game works before real stats are entered.
  const SAMPLE = {
    us: 'Patriots',
    opponent: 'Opponent',
    date: '',
    teams: {
      us: {
        q: [7, 10, 3, 14], passComp: 24, passAtt: 35, passYds: 268, passTD: 2, passInt: 1, sacks: 2,
        rushAtt: 28, rushYds: 121, thirdConv: 6, thirdAtt: 13, penalties: 5, penYds: 45, top: '32:40',
        drives: 11, fgMade: 1, fgAtt: 2,
      },
      opp: {
        q: [3, 7, 7, 3], passComp: 21, passAtt: 37, passYds: 231, passTD: 1, passInt: 1, sacks: 3,
        rushAtt: 22, rushYds: 88, thirdConv: 4, thirdAtt: 12, penalties: 8, penYds: 70, top: '27:20',
        drives: 11, fgMade: 2, fgAtt: 2,
      },
    },
    rusher: { name: 'Lead RB', att: 17, yds: 84 },
    receivers: [
      { name: 'WR1', rec: 7, yds: 96 },
      { name: 'TE', rec: 6, yds: 61 },
      { name: 'WR2', rec: 4, yds: 52 },
      { name: 'RB', rec: 4, yds: 22 },
      { name: 'WR3', rec: 3, yds: 37 },
    ],
    seasonPoints: '20, 13, 27, 17, 24, 10, 31',
    kickerPct: 84,
  };

  const STAT_ROWS = [
    ['passComp', 'Pass completions'], ['passAtt', 'Pass attempts'], ['passYds', 'Passing yards'],
    ['passTD', 'Passing TDs'], ['passInt', 'Interceptions thrown'], ['sacks', 'Sacks taken'],
    ['rushAtt', 'Rush attempts'], ['rushYds', 'Rushing yards'], ['thirdConv', '3rd downs converted'],
    ['thirdAtt', '3rd down attempts'], ['penalties', 'Penalties'], ['penYds', 'Penalty yards'],
    ['top', 'Time of possession (MM:SS)'], ['drives', 'Offensive drives'],
    ['fgMade', 'Field goals made'], ['fgAtt', 'Field goals attempted'],
  ];

  // ---------- math helpers ----------
  const num = (v) => {
    if (v === '' || v === null || v === undefined) return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const ok = (...vals) => vals.every((v) => Number.isFinite(v));
  const round = (x, d) => { const f = 10 ** d; return Math.round(x * f) / f; };
  const fx = (x, d) => round(x, d).toFixed(d);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => sum(a) / a.length;
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const sampleSD = (a) => {
    const m = mean(a);
    return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
  };
  const popSD = (a) => {
    const m = mean(a);
    return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / a.length);
  };
  const minutes = (t) => {
    if (typeof t === 'number') return t;
    const m = /^\s*(\d+)\s*:\s*(\d{1,2})\s*$/.exec(String(t || ''));
    return m ? Number(m[1]) + Number(m[2]) / 60 : NaN;
  };
  const listNums = (s) => String(s || '').split(/[\s,;]+/).map(num).filter(Number.isFinite);

  function passerRating(comp, att, yds, td, int) {
    const clamp = (x) => Math.max(0, Math.min(2.375, x));
    const a = clamp((comp / att - 0.3) * 5);
    const b = clamp((yds / att - 3) * 0.25);
    const c = clamp((td / att) * 20);
    const d = clamp(2.375 - (int / att) * 25);
    return { a, b, c, d, rating: ((a + b + c + d) / 6) * 100 };
  }

  // ---------- question generation ----------
  function generate(stats) {
    const s = stats || SAMPLE;
    const US = s.us || 'Patriots';
    const OPP = s.opponent || 'the opponent';
    const T = { us: {}, opp: {} };
    for (const side of ['us', 'opp']) {
      const src = (s.teams && s.teams[side]) || {};
      for (const [k] of STAT_ROWS) T[side][k] = k === 'top' ? minutes(src.top) : num(src[k]);
      T[side].q = (src.q || []).map(num).filter(Number.isFinite);
      T[side].pts = T[side].q.length ? sum(T[side].q) : NaN;
    }
    const u = T.us;
    const o = T.opp;
    const out = [];
    const add = (id, level, topic, q, a, work) => out.push({ id, level, topic, q, a, work });

    // ---- Warm-up ----
    if (ok(u.passComp, u.passAtt) && u.passAtt > 0) {
      const p = (u.passComp / u.passAtt) * 100;
      add('comp-pct', 1, 'Percent',
        `The ${US} completed ${u.passComp} of ${u.passAtt} passes. What was their completion percentage? (nearest tenth of a percent)`,
        `${fx(p, 1)}%`, `${u.passComp} ÷ ${u.passAtt} = ${fx(p / 100, 4)} → ${fx(p, 1)}%`);
    }
    if (ok(u.rushAtt, u.rushYds, o.rushAtt, o.rushYds) && u.rushAtt > 0 && o.rushAtt > 0) {
      const a = u.rushYds / u.rushAtt;
      const b = o.rushYds / o.rushAtt;
      add('ypc', 1, 'Rates',
        `${US}: ${u.rushYds} rushing yards on ${u.rushAtt} carries. ${OPP}: ${o.rushYds} yards on ${o.rushAtt} carries. ` +
        `Which team averaged more yards per carry, and by how much? (nearest hundredth)`,
        `${a >= b ? US : OPP} by ${fx(Math.abs(a - b), 2)} yds/carry`,
        `${US}: ${u.rushYds} ÷ ${u.rushAtt} = ${fx(a, 2)}; ${OPP}: ${o.rushYds} ÷ ${o.rushAtt} = ${fx(b, 2)}; difference = ${fx(Math.abs(a - b), 2)}`);
    }
    if (u.q.length >= 4 && u.pts > 0) {
      const second = sum(u.q.slice(2));
      const p = (second / u.pts) * 100;
      add('second-half', 1, 'Percent',
        `The ${US} scored ${u.q.slice(0, 4).join(', ')} points in quarters 1–4${u.q.length > 4 ? ` and ${u.q.slice(4).join(', ')} in OT` : ''}. ` +
        `What percent of their points came in the second half (quarters 3 and 4)? (nearest tenth)`,
        `${fx(p, 1)}%`, `${u.q[2]} + ${u.q[3]} = ${second}; ${second} ÷ ${u.pts} = ${fx(p, 1)}%`);
    }
    if (ok(u.top) && u.top > 0) {
      const p = (u.top / 60) * 100;
      add('top', 1, 'Percent',
        `The ${US} had the ball for ${s.teams.us.top} of the 60:00 game. What percent of the game did they possess the ball? (nearest tenth)`,
        `${fx(p, 1)}%`, `${s.teams.us.top} = ${fx(u.top, 3)} min; ${fx(u.top, 3)} ÷ 60 = ${fx(p, 1)}%`);
    }
    if (ok(u.penalties, u.penYds, o.penalties, o.penYds) && u.penalties > 0 && o.penalties > 0) {
      const a = u.penYds / u.penalties;
      const b = o.penYds / o.penalties;
      add('penalty', 1, 'Rates',
        `${US}: ${u.penalties} penalties for ${u.penYds} yards. ${OPP}: ${o.penalties} penalties for ${o.penYds} yards. ` +
        `What was the combined mean number of yards per penalty for both teams? (nearest tenth)`,
        `${fx((u.penYds + o.penYds) / (u.penalties + o.penalties), 1)} yds/penalty`,
        `(${u.penYds} + ${o.penYds}) ÷ (${u.penalties} + ${o.penalties}) = ${u.penYds + o.penYds} ÷ ${u.penalties + o.penalties} ` +
        `= ${fx((u.penYds + o.penYds) / (u.penalties + o.penalties), 1)}  (note: not the average of ${fx(a, 1)} and ${fx(b, 1)} — that would be ${fx((a + b) / 2, 1)})`);
    }

    // ---- Standard ----
    if (ok(u.passYds, u.rushYds) && u.passYds + u.rushYds > 0) {
      const tot = u.passYds + u.rushYds;
      add('pass-share', 2, 'Percent',
        `The ${US} gained ${u.passYds} passing yards and ${u.rushYds} rushing yards. What percent of their total yards came from passing? (nearest tenth)`,
        `${fx((u.passYds / tot) * 100, 1)}%`, `Total = ${tot}; ${u.passYds} ÷ ${tot} = ${fx((u.passYds / tot) * 100, 1)}%`);
    }
    if (ok(u.thirdConv, u.thirdAtt, o.thirdConv, o.thirdAtt) && u.thirdAtt > 0 && o.thirdAtt > 0) {
      const a = (u.thirdConv / u.thirdAtt) * 100;
      const b = (o.thirdConv / o.thirdAtt) * 100;
      add('third-diff', 2, 'Percent',
        `On third down the ${US} went ${u.thirdConv}-for-${u.thirdAtt} and ${OPP} went ${o.thirdConv}-for-${o.thirdAtt}. ` +
        `What is the difference in their conversion rates, in percentage points? (nearest tenth)`,
        `${fx(Math.abs(a - b), 1)} percentage points (${a >= b ? US : OPP} higher)`,
        `${US}: ${fx(a, 1)}%; ${OPP}: ${fx(b, 1)}%; |${fx(a, 1)} − ${fx(b, 1)}| = ${fx(Math.abs(a - b), 1)}`);
    }
    const recs = (s.receivers || []).map((r) => ({ name: r.name || '?', rec: num(r.rec), yds: num(r.yds) }))
      .filter((r) => ok(r.rec, r.yds));
    const recList = recs.map((r) => `${r.name} ${r.rec} catches/${r.yds} yds`).join('; ');
    if (recs.length >= 3) {
      const y = recs.map((r) => r.yds);
      add('rec-mean-median', 2, 'Center',
        `Receiving yards: ${recs.map((r) => `${r.name} ${r.yds}`).join(', ')}. Find the mean and the median receiving yards. (mean to nearest tenth)`,
        `Mean = ${fx(mean(y), 1)}, Median = ${fx(median(y), 1).replace(/\.0$/, '')}`,
        `Sum = ${sum(y)}, n = ${y.length}, mean = ${fx(mean(y), 1)}; sorted: ${[...y].sort((p, q) => p - q).join(', ')} → median = ${median(y)}. ` +
        `${mean(y) > median(y) ? 'Mean > median suggests a right skew (one big game pulls the mean up).' : ''}`);
    }
    if (ok(u.passComp, u.passAtt, u.rushAtt) && u.passAtt + u.rushAtt > 0) {
      const n = u.passAtt + u.rushAtt;
      add('prob-complete', 2, 'Probability',
        `The ${US} ran ${u.rushAtt} rushing plays and threw ${u.passAtt} passes (${u.passComp} completed). ` +
        `If one of these plays is chosen at random, what is P(completed pass)? What is P(completed | it was a pass)? (3 decimals)`,
        `P(completed) = ${fx(u.passComp / n, 3)}; P(completed | pass) = ${fx(u.passComp / u.passAtt, 3)}`,
        `${u.passComp} ÷ ${n} = ${fx(u.passComp / n, 3)}; conditional on a pass: ${u.passComp} ÷ ${u.passAtt} = ${fx(u.passComp / u.passAtt, 3)}`);
    }
    if (ok(u.passYds, u.rushYds, u.passAtt, u.rushAtt, u.sacks) && u.passAtt + u.rushAtt + u.sacks > 0) {
      const plays = u.passAtt + u.rushAtt + u.sacks;
      const yds = u.passYds + u.rushYds;
      add('ypp', 2, 'Rates',
        `The ${US} had ${u.passAtt} pass attempts, ${u.sacks} sacks, and ${u.rushAtt} rushes for ${yds} total yards. ` +
        `Counting sacks as plays, what was their yards per play? (nearest hundredth)`,
        `${fx(yds / plays, 2)} yds/play`, `${u.passAtt} + ${u.sacks} + ${u.rushAtt} = ${plays} plays; ${yds} ÷ ${plays} = ${fx(yds / plays, 2)}`);
    }
    const season = listNums(s.seasonPoints);
    if (season.length >= 2 && ok(u.pts)) {
      const m = mean(season);
      const pc = ((u.pts - m) / m) * 100;
      add('pct-change', 2, 'Percent change',
        `Before this game the ${US} scored ${season.join(', ')} points. This week they scored ${u.pts}. ` +
        `What is the percent change from their previous average to this game? (nearest tenth)`,
        `${pc >= 0 ? '+' : ''}${fx(pc, 1)}%`, `Mean = ${sum(season)} ÷ ${season.length} = ${fx(m, 3)}; (${u.pts} − ${fx(m, 3)}) ÷ ${fx(m, 3)} = ${fx(pc, 1)}%`);
    }
    if (ok(u.pts, u.drives, o.pts, o.drives) && u.drives > 0 && o.drives > 0) {
      const a = u.pts / u.drives;
      const b = o.pts / o.drives;
      add('ppd', 2, 'Rates',
        `${US}: ${u.pts} points on ${u.drives} drives. ${OPP}: ${o.pts} points on ${o.drives} drives. ` +
        `How many more points per drive did the ${a >= b ? US : OPP} score? (nearest hundredth)`,
        `${fx(Math.abs(a - b), 2)} points per drive`, `${fx(a, 3)} vs ${fx(b, 3)}; difference = ${fx(Math.abs(a - b), 2)}`);
    }
    const kp = num(s.kickerPct) / 100;
    if (ok(kp) && kp > 0 && kp < 1) {
      const all = kp ** 3;
      add('fg-binomial', 2, 'Probability',
        `The ${US} kicker makes ${fx(kp * 100, 0)}% of field goals. Assuming kicks are independent, what is the probability of making all of the next 3? ` +
        `What is the probability of missing at least one? (3 decimals)`,
        `P(3 of 3) = ${fx(all, 3)}; P(at least 1 miss) = ${fx(1 - all, 3)}`,
        `${kp}³ = ${fx(all, 4)}; complement: 1 − ${fx(all, 4)} = ${fx(1 - all, 4)}`);
    }

    // ---- Challenge ----
    if (ok(u.passComp, u.passAtt, u.passYds, u.passTD, u.passInt) && u.passAtt > 0) {
      const r = passerRating(u.passComp, u.passAtt, u.passYds, u.passTD, u.passInt);
      add('passer-rating', 3, 'Formulas',
        `NFL passer rating: a = (C/A − 0.3)·5, b = (Y/A − 3)·0.25, c = (TD/A)·20, d = 2.375 − (INT/A)·25 ` +
        `(each limited to 0–2.375), Rating = (a+b+c+d)/6 × 100. ${US} QB: ${u.passComp}/${u.passAtt}, ${u.passYds} yds, ` +
        `${u.passTD} TD, ${u.passInt} INT. Find the rating. (nearest tenth)`,
        `${fx(r.rating, 1)}`, `a = ${fx(r.a, 4)}, b = ${fx(r.b, 4)}, c = ${fx(r.c, 4)}, d = ${fx(r.d, 4)}; sum = ${fx(r.a + r.b + r.c + r.d, 4)}; ÷6 ×100 = ${fx(r.rating, 1)}`);
    }
    if (recs.length >= 3) {
      const y = recs.map((r) => r.yds);
      add('rec-sd', 3, 'Spread',
        `Receiving yards: ${y.join(', ')}. Find the sample standard deviation s. (nearest tenth)`,
        `s ≈ ${fx(sampleSD(y), 1)} yards`,
        `mean = ${fx(mean(y), 2)}; Σ(x − x̄)² = ${fx(sum(y.map((x) => (x - mean(y)) ** 2)), 2)}; ÷ (n − 1 = ${y.length - 1}) = ${fx(sampleSD(y) ** 2, 2)}; √ = ${fx(sampleSD(y), 1)}`);
    }
    if (season.length >= 3 && ok(u.pts)) {
      const m = mean(season);
      const sd = sampleSD(season);
      if (sd > 0) {
        const z = (u.pts - m) / sd;
        add('z-score', 3, 'z-scores',
          `Previous ${US} scores this season: ${season.join(', ')}. This week they scored ${u.pts}. ` +
          `Using the sample mean and sample standard deviation of the previous games, find the z-score of this week's score. (nearest hundredth)`,
          `z ≈ ${fx(z, 2)}`, `x̄ = ${fx(m, 3)}, s = ${fx(sd, 3)}; z = (${u.pts} − ${fx(m, 3)}) ÷ ${fx(sd, 3)} = ${fx(z, 2)}. ` +
          `${Math.abs(z) >= 2 ? 'Unusual (|z| ≥ 2).' : 'Not unusual (|z| < 2).'}`);
      }
    }
    if (ok(u.passComp, u.passAtt) && u.passAtt >= 10 && u.passComp > 0 && u.passComp < u.passAtt) {
      const p = u.passComp / u.passAtt;
      const me = 1.96 * Math.sqrt((p * (1 - p)) / u.passAtt);
      add('ci', 3, 'Inference',
        `Treat the QB's ${u.passComp}/${u.passAtt} completions as a random sample of all the passes this QB throws. ` +
        `Construct a 95% confidence interval for the QB's true completion rate (z* = 1.96). (3 decimals)`,
        `(${fx(p - me, 3)}, ${fx(p + me, 3)})`,
        `p̂ = ${fx(p, 4)}; SE = √(p̂(1−p̂)/n) = ${fx(Math.sqrt((p * (1 - p)) / u.passAtt), 4)}; ME = 1.96·SE = ${fx(me, 4)}; ${fx(p, 3)} ± ${fx(me, 3)}`);
    }
    if (recs.length >= 3) {
      const x = recs.map((r) => r.rec);
      const y = recs.map((r) => r.yds);
      const sx = sampleSD(x);
      const sy = sampleSD(y);
      if (sx > 0 && sy > 0) {
        const r = sum(x.map((xi, i) => ((xi - mean(x)) / sx) * ((y[i] - mean(y)) / sy))) / (x.length - 1);
        const b = (r * sy) / sx;
        const a = mean(y) - b * mean(x);
        add('correlation', 3, 'Regression',
          `Receivers (catches, yards): ${recs.map((q) => `(${q.rec}, ${q.yds})`).join(', ')}. ` +
          `Find the correlation r between catches and receiving yards. (3 decimals)`,
          `r ≈ ${fx(r, 3)}`, `x̄ = ${fx(mean(x), 3)}, sx = ${fx(sx, 3)}, ȳ = ${fx(mean(y), 3)}, sy = ${fx(sy, 3)}; r = Σ(zx·zy)/(n−1) = ${fx(r, 3)} (use LinReg on a calculator)`);
        add('lsrl', 3, 'Regression',
          `Using the least-squares regression line of receiving yards on catches for: ${recList}. ` +
          `Predict the yards for a receiver with 6 catches. (nearest tenth)`,
          `ŷ ≈ ${fx(a + b * 6, 1)} yards`, `ŷ = ${fx(a, 3)} + ${fx(b, 3)}x; x = 6 → ${fx(a + b * 6, 1)}`);
      }
    }
    if (ok(u.thirdConv, u.thirdAtt) && u.thirdAtt > 0 && u.thirdConv > 0 && u.thirdConv < u.thirdAtt) {
      const p = u.thirdConv / u.thirdAtt;
      const pr = 3 * p * p * (1 - p);
      add('third-binomial', 3, 'Probability',
        `The ${US} converted ${u.thirdConv} of ${u.thirdAtt} third downs. If each future third down is independent with that same success rate, ` +
        `what is the probability they convert exactly 2 of their next 3? (3 decimals)`,
        `${fx(pr, 3)}`, `p = ${fx(p, 4)}; P(X = 2) = C(3,2)·p²·(1 − p) = 3·${fx(p, 4)}²·${fx(1 - p, 4)} = ${fx(pr, 3)}`);
    }
    if (u.q.length >= 4) {
      const qs = u.q.slice(0, 4);
      add('quarter-sd', 3, 'Spread',
        `The ${US} scored ${qs.join(', ')} points in the four quarters. Treating these as a population, find the mean and the standard deviation σ. (nearest hundredth)`,
        `μ = ${fx(mean(qs), 2)}, σ ≈ ${fx(popSD(qs), 2)}`,
        `μ = ${sum(qs)} ÷ 4 = ${fx(mean(qs), 2)}; σ = √(Σ(x − μ)² ÷ 4) = √(${fx(sum(qs.map((x) => (x - mean(qs)) ** 2)) / 4, 3)}) = ${fx(popSD(qs), 2)}`);
    }
    return out;
  }

  // Custom questions: one per line, "Question || Answer"
  function parseCustom(text) {
    return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
      const [q, ...rest] = line.split('||');
      return { id: `custom-${i}`, level: 2, topic: 'Custom', q: q.trim(), a: rest.join('||').trim() || '(teacher decides)', work: '' };
    });
  }

  // ---------- auto-checking typed answers ----------
  // Expected numbers come from the answer text ("Mean = 53.6, Median = 52", "(0.532, 0.840)", "68.6%").
  // Labels like P(3 of 3) are ignored, and for "9 of 52 → 17.3%" only the part after the arrow counts.
  const NUM = /-?\d*\.?\d+%?/g;
  function expectedValues(answer) {
    let t = String(answer || '');
    const arrow = t.lastIndexOf('→');
    if (arrow >= 0) t = t.slice(arrow + 1);
    t = t.replace(/P\([^)]*\)/g, ' ').replace(/(\d),(\d{3})\b/g, '$1$2');
    return (t.match(NUM) || []).map((tok) => {
      const pct = tok.endsWith('%');
      const n = tok.replace('%', '');
      const dot = n.indexOf('.');
      return { v: Math.abs(parseFloat(n)), d: dot < 0 ? 0 : n.length - dot - 1, pct };
    }).filter((e) => Number.isFinite(e.v));
  }
  // true = every expected number is in the student's answer (within rounding), false = not, null = can't tell
  function autoCheck(answerKey, studentText) {
    const exp = expectedValues(answerKey);
    if (!exp.length) return null;
    const got = (String(studentText || '').replace(/(\d),(\d{3})\b/g, '$1$2').match(/-?\d*\.?\d+/g) || [])
      .map((x) => Math.abs(parseFloat(x))).filter(Number.isFinite);
    if (!got.length) return false;
    return exp.every((e) => {
      const tol = e.d === 0 ? 1e-9 : 1.01 * 10 ** -e.d;
      return got.some((g) => Math.abs(g - e.v) <= tol || (e.pct && Math.abs(g * 100 - e.v) <= tol));
    });
  }

  return { SAMPLE, STAT_ROWS, generate, parseCustom, autoCheck, expectedValues, passerRating, mean, median, sampleSD, popSD, minutes };
});
