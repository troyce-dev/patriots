// Run with: node tests/football.test.js
const assert = require('assert');
const Q = require('../js/questions.js');
const P = require('../js/plays.js');

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Passer rating: classic perfect game is 158.3
close(Q.passerRating(20, 20, 400, 5, 0).rating, 158.333, 0.01);
// 24/35, 268 yds, 2 TD, 1 INT
close(Q.passerRating(24, 35, 268, 2, 1).rating, 98.274, 0.01);

close(Q.median([96, 61, 52, 22, 37]), 52);
close(Q.sampleSD([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.001);
close(Q.popSD([2, 4, 4, 4, 5, 5, 7, 9]), 2);
close(Q.minutes('32:30'), 32.5);

// Sample stats produce the full question set with answers
const qs = Q.generate(Q.SAMPLE);
const ids = qs.map((q) => q.id);
['comp-pct', 'passer-rating', 'z-score', 'ci', 'correlation', 'lsrl', 'fg-binomial', 'third-binomial'].forEach((id) =>
  assert.ok(ids.includes(id), `missing ${id}`));
assert.strictEqual(new Set(ids).size, ids.length, 'ids unique');
qs.forEach((q) => { assert.ok(q.q && q.a, q.id); assert.ok(!/NaN|undefined|Infinity/.test(q.q + q.a + q.work), q.id); });
assert.strictEqual(qs.find((q) => q.id === 'comp-pct').a, '68.6%');

// Blank stats: nothing crashes, nothing generated
assert.deepStrictEqual(Q.generate({ us: 'X', opponent: 'Y', teams: { us: { q: [] }, opp: { q: [] } }, receivers: [] }), []);

// Custom questions
const c = Q.parseCustom('What is 2+2? || 4\n\nNo answer here');
assert.strictEqual(c.length, 2);
assert.strictEqual(c[0].a, '4');

// Plays: outcomes stay inside the tables, TD and safety handling
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
for (let i = 0; i < 2000; i++) {
  const r = P.roll(['pass', 'run', 'defense'][i % 3], rnd);
  assert.ok(Number.isInteger(r.yards) && r.yards >= -18 && r.yards <= 60);
}
assert.ok(P.expected('pass') > P.expected('run'), 'pass riskier but higher average');
assert.ok(P.expected('defense') < 0);

const game = { teams: [{ pos: 99 }, { pos: 2 }], log: [], winner: null };
const always = (x) => () => x;
let e = P.apply(game, 0, 'run', null, always(0.5)); // solid run 4–7
assert.ok(e.td && game.winner === 0 && game.teams[0].pos === 100);
e = P.apply(game, 0, 'defense', 1, always(0.99)); // forced turnover pushes team 1 back
assert.ok(e.safety && game.teams[1].pos === P.SAFETY_SPOT && e.moverIdx === 1);

console.log('football tests passed');

// ---------- importer ----------
const I = require('../js/importer.js');
const T = '\t';

// ESPN-style copy: line score, team stats (away column first), player tables
const espnCopy = [
  ['', '1', '2', '3', '4', 'T'].join(T),
  ['Bills', '3', '7', '7', '3', '20'].join(T),
  ['Patriots', '7', '10', '3', '14', '34'].join(T),
  '',
  ['Matchup', 'BUF', 'NE'].join(T),
  ['1st Downs', '18', '22'].join(T),
  ['Passing 1st downs', '11', '13'].join(T),
  ['3rd down efficiency', '4-12', '6-13'].join(T),
  ['Total Yards', '319', '389'].join(T),
  ['Passing', '211', '253'].join(T),
  ['Comp/Att', '21/37', '24/35'].join(T),
  ['Interceptions thrown', '1', '1'].join(T),
  ['Sacks-Yards Lost', '3-20', '2-15'].join(T),
  ['Rushing', '88', '121'].join(T),
  ['Rushing Attempts', '22', '28'].join(T),
  ['Penalties', '8-70', '5-45'].join(T),
  ['Total Drives', '11', '11'].join(T),
  ['Possession', '27:20', '32:40'].join(T),
  '',
  'New England Patriots Passing',
  ['', 'C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'].join(T),
  ['D. Maye', '24/35', '268', '7.7', '2', '1', '2-15', '60.1', '98.3'].join(T),
  ['TEAM', '24/35', '268', '7.7', '2', '1', '2-15', '', ''].join(T),
  'New England Patriots Receiving',
  ['', 'REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'].join(T),
  ['WR One', '7', '96', '13.7', '1', '34', '9'].join(T),
  ['TE', '6', '61', '10.2', '1', '22', '7'].join(T),
  ['WR Two', '4', '52', '13.0', '0', '19', '6'].join(T),
  'Buffalo Bills Receiving',
  ['', 'REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'].join(T),
  ['Opp Guy', '9', '120', '13.3', '1', '40', '11'].join(T),
  'New England Patriots Kicking',
  ['', 'FG', 'PCT', 'LONG', 'XP', 'PTS'].join(T),
  ['Kicker', '1/2', '50.0', '41', '4/4', '7'].join(T),
].join('\n');

let p = I.parse(espnCopy, 'Patriots');
assert.strictEqual(p.usCol, 1);
let st = I.toStats(p, { us: 'Patriots', seasonPoints: '20, 13', kickerPct: 84 });
assert.strictEqual(st.opponent, 'Bills');
assert.deepStrictEqual(st.teams.us.q, ['7', '10', '3', '14']);
assert.strictEqual(st.teams.us.thirdConv, '6');
assert.strictEqual(st.teams.us.thirdAtt, '13');
assert.strictEqual(st.teams.opp.thirdAtt, '12');
assert.strictEqual(st.teams.us.passYds, '268', 'gross QB yards preferred over net team passing');
assert.strictEqual(st.teams.opp.passYds, '211');
assert.strictEqual(st.teams.us.passTD, '2');
assert.strictEqual(st.teams.us.sacks, '2');
assert.strictEqual(st.teams.us.rushYds, '121');
assert.strictEqual(st.teams.us.rushAtt, '28');
assert.strictEqual(st.teams.us.penYds, '45');
assert.strictEqual(st.teams.opp.penalties, '8');
assert.strictEqual(st.teams.us.top, '32:40');
assert.strictEqual(st.teams.us.drives, '11');
assert.strictEqual(st.teams.us.fgMade, '1');
assert.strictEqual(st.teams.us.fgAtt, '2');
assert.strictEqual(st.receivers.length, 3);
assert.strictEqual(st.receivers[1].name, 'TE');
assert.deepStrictEqual(st.receivers[0], { name: 'WR One', rec: '7', yds: '96' });
assert.strictEqual(st.seasonPoints, '20, 13');
assert.ok(Q.generate(st).length >= 15, 'imported stats generate questions');
assert.deepStrictEqual(I.report(st).missing, []);

// swapping columns
const sw = I.toStats(p, { us: 'Patriots' }, true);
assert.strictEqual(sw.teams.us.rushYds, '88');

// Same data copied as one cell per line (no tabs) still reads team stats
const perLine = espnCopy.split('\n').slice(0, 19).join('\n').replace(/\t/g, '\n');
st = I.toStats(I.parse(perLine, 'Patriots'), { us: 'Patriots' });
assert.strictEqual(st.teams.us.penYds, '45');
assert.strictEqual(st.teams.opp.rushAtt, '22');

// Plain text with single spaces ("Penalties 5-45 8-70"), Patriots listed first
const plain = 'NE 7 10 3 14 34\nBUF 3 7 7 3 20\nRushing Yards 121 88\nPenalties 5-45 8-70\nTime of Possession 32:40 27:20';
st = I.toStats(I.parse(plain, 'Patriots'), { us: 'Patriots' });
assert.strictEqual(st.teams.us.rushYds, '121');
assert.strictEqual(st.teams.opp.penYds, '70');
assert.strictEqual(st.opponent, 'BUF');

// Pro-Football-Reference style team stats + combined player table with Tm column
const pfr = [
  ['', '1', '2', '3', '4', 'Final'].join(T),
  ['Buffalo Bills', '3', '7', '7', '3', '20'].join(T),
  ['New England Patriots', '7', '10', '3', '14', '34'].join(T),
  ['', 'BUF', 'NWE'].join(T),
  ['Rush-Yds-TDs', '22-88-0', '28-121-1'].join(T),
  ['Cmp-Att-Yd-TD-INT', '21-37-231-1-1', '24-35-268-2-1'].join(T),
  ['Sacked-Yards', '3-20', '2-15'].join(T),
  ['Net Pass Yards', '211', '253'].join(T),
  ['Penalties-Yards', '8-70', '5-45'].join(T),
  ['Third Down Conv.', '4-12', '6-13'].join(T),
  ['Time of Possession', '27:20', '32:40'].join(T),
  ['Player', 'Tm', 'Cmp', 'Att', 'Yds', 'TD', 'Int', 'Sk', 'Yds', 'Lng', 'Rate', 'Att', 'Yds', 'TD', 'Lng', 'Tgt', 'Rec', 'Yds', 'TD', 'Lng'].join(T),
  ['QB Guy', 'NWE', '24', '35', '268', '2', '1', '2', '15', '34', '98.3', '3', '10', '0', '6', '0', '0', '0', '0', '0'].join(T),
  ['WR One', 'NWE', '0', '0', '0', '0', '0', '0', '0', '0', '', '0', '0', '0', '0', '9', '7', '96', '1', '34'].join(T),
  ['Bill Guy', 'BUF', '0', '0', '0', '0', '0', '0', '0', '0', '', '0', '0', '0', '0', '11', '9', '120', '1', '40'].join(T),
].join('\n');
p = I.parse(pfr, 'Patriots');
assert.strictEqual(p.usCol, 1);
st = I.toStats(p, { us: 'Patriots' });
assert.strictEqual(st.teams.us.passYds, '268');
assert.strictEqual(st.teams.us.passTD, '2');
assert.strictEqual(st.teams.us.rushAtt, '28');
assert.strictEqual(st.teams.opp.passInt, '1');
assert.strictEqual(st.teams.us.thirdConv, '6');
assert.strictEqual(st.opponent, 'Buffalo Bills');
assert.deepStrictEqual(st.receivers, [{ name: 'WR One', rec: '7', yds: '96' }]);

// Saved web page (HTML tables)
const html = `<html><head><style>td{}</style><script>var x=1</script></head><body><table>
<tr><th></th><th>1</th><th>2</th><th>3</th><th>4</th><th>T</th></tr>
<tr><td>Bills</td><td>3</td><td>7</td><td>7</td><td>3</td><td>20</td></tr>
<tr><td>Patriots</td><td>7</td><td>10</td><td>3</td><td>14</td><td>34</td></tr></table>
<table><tr><td>Penalties</td><td>8-70</td><td>5-45</td></tr><tr><td>Possession</td><td>27:20</td><td>32:40</td></tr></table></body></html>`;
st = I.toStats(I.parse(I.htmlToText(html), 'Patriots'), { us: 'Patriots' });
assert.strictEqual(st.teams.us.penYds, '45');
assert.strictEqual(st.teams.opp.top, '27:20');
assert.strictEqual(st.teams.us.q.join(), '7,10,3,14');

// Nonsense in: nothing out
assert.ok(I.parse('hello world\nthis is not a box score', 'Patriots').empty);

// ESPN JSON (shape of site.api.espn.com summary) converts and parses
const comp = (id, abbr, name, ha, qs) => ({ homeAway: ha, team: { id, abbreviation: abbr, displayName: name }, linescores: qs.map((v) => ({ displayValue: String(v) })) });
const summary = {
  header: { competitions: [{ competitors: [comp('17', 'NE', 'New England Patriots', 'home', [7, 10, 3, 14]), comp('2', 'BUF', 'Buffalo Bills', 'away', [3, 7, 7, 3])] }] },
  boxscore: {
    teams: [
      { team: { id: '2' }, statistics: [{ name: 'thirdDownEff', label: '3rd down efficiency', displayValue: '4-12' }, { name: 'totalPenaltiesYards', label: 'Penalties', displayValue: '8-70' }, { name: 'possessionTime', label: 'Possession', displayValue: '27:20' }, { name: 'rushingAttempts', label: 'Rushing Attempts', displayValue: '22' }] },
      { team: { id: '17' }, statistics: [{ name: 'thirdDownEff', label: '3rd down efficiency', displayValue: '6-13' }, { name: 'totalPenaltiesYards', label: 'Penalties', displayValue: '5-45' }, { name: 'possessionTime', label: 'Possession', displayValue: '32:40' }, { name: 'rushingAttempts', label: 'Rushing Attempts', displayValue: '28' }] },
    ],
    players: [{ team: { displayName: 'New England Patriots' }, statistics: [
      { name: 'passing', labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'], athletes: [{ athlete: { displayName: 'QB Guy' }, stats: ['24/35', '268', '7.7', '2', '1', '2-15', '60.1', '98.3'] }], totals: ['24/35', '268', '7.7', '2', '1', '2-15', '--', '98.3'] },
      { name: 'receiving', labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'], athletes: [{ athlete: { displayName: 'WR One' }, stats: ['7', '96', '13.7', '1', '34', '9'] }] },
    ] }],
  },
};
st = I.toStats(I.parse(I.espnToText(summary), 'Patriots'), { us: 'Patriots' });
assert.strictEqual(st.opponent, 'Buffalo Bills');
assert.strictEqual(st.teams.us.thirdConv, '6');
assert.strictEqual(st.teams.us.penYds, '45');
assert.strictEqual(st.teams.opp.rushAtt, '22');
assert.strictEqual(st.teams.us.passTD, '2');
assert.strictEqual(st.receivers[0].yds, '96');

console.log('importer tests passed');

// ---------- auto-checking typed answers ----------
for (const q of Q.generate(Q.SAMPLE)) {
  assert.strictEqual(Q.autoCheck(q.a, q.a), true, `${q.id} accepts its own answer`);
  assert.strictEqual(Q.autoCheck(q.a, '99999'), false, `${q.id} rejects nonsense`);
}
assert.strictEqual(Q.autoCheck('68.6%', '68.6'), true);
assert.strictEqual(Q.autoCheck('68.6%', '0.686'), true);
assert.strictEqual(Q.autoCheck('68.6%', '68.7'), true, 'last-digit rounding allowed');
assert.strictEqual(Q.autoCheck('68.6%', '69'), false);
assert.strictEqual(Q.autoCheck('Mean = 53.6, Median = 52', 'mean 53.6 median 52'), true);
assert.strictEqual(Q.autoCheck('Mean = 53.6, Median = 52', '53.6'), false, 'both parts needed');
assert.strictEqual(Q.autoCheck('P(3 of 3) = 0.593; P(at least 1 miss) = 0.407', '.593 and .407'), true);
assert.strictEqual(Q.autoCheck('9 of 52 → 17.3%', '17.3%'), true);
assert.strictEqual(Q.autoCheck('Tom Brady', 'brady'), null, 'no number: teacher decides');
assert.strictEqual(Q.autoCheck('1,234 yards', '1234'), true);
console.log('auto-check tests passed');

// ---------- team assignment (first to join = Team 1, ...) ----------
global.self = global; global.window = global;
require('../js/live.js');
const pick = global.FBLive.pickSeat;
let seats = {};
const take = (dev) => { const r = pick(seats, dev, 5); seats = r.seats; return r.index; };
assert.deepStrictEqual(['a', 'b', 'c'].map(take), [0, 1, 2]);
assert.strictEqual(take('b'), 1, 'same device keeps its team');
delete seats[1];
assert.strictEqual(take('d'), 1, 'freed team goes to the next device');
['e', 'f'].forEach(take);
assert.strictEqual(take('g'), -1, 'room full');
// Firebase may return numbered children as an array with gaps
assert.strictEqual(pick([{ device: 'a' }, null, { device: 'c' }], 'z', 5).index, 1);
assert.strictEqual(pick([{ device: 'a' }, null, { device: 'c' }], 'c', 5).index, 2);
console.log('team assignment tests passed');

// ---------- wrong answer = sack ----------
{
  const g = { teams: [{ pos: 40 }, { pos: 3 }], log: [], winner: null };
  const s1 = P.sack(g, 0, 5);
  assert.strictEqual(g.teams[0].pos, 35);
  assert.strictEqual(s1.yards, -5);
  P.sack(g, 1, 5);
  assert.strictEqual(g.teams[1].pos, 1, 'never past your own 1-yard line');
  console.log('sack tests passed');
}
