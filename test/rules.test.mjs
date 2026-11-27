// Unit tests for the rules layer (pure functions), run in Node without a browser. Run: npm test
import test from 'node:test';
import assert from 'assert/strict';
import fs from 'fs';
import vm from 'vm';

const CORE = [
  'config',
  'util',
  'hex',
  'board-state',
  'rules',
  'plan',
  'game',
  'gamelog',
  'playback',
  'marking',
  'duel',
  'cpu',
];
const el = () => ({
  addEventListener() {},
  style: {},
  classList: { add() {}, remove() {}, toggle() {} },
  setAttribute() {},
  hidden: false,
  innerHTML: '',
});
const ctx = vm.createContext({
  document: { querySelector: el, querySelectorAll: () => [] },
  matchMedia: () => ({ matches: true }),
  console,
  Math,
  Set,
  Map,
  Object,
  Array,
  JSON,
  Promise,
  setTimeout,
  clearTimeout,
});
const code = CORE.map((m) => fs.readFileSync(`src/${m}.js`, 'utf8')).join('\n');
vm.runInContext(
  code +
    `
  renderLog = () => {}; render = () => {};
  function slowmo() {} function tweenEl() {} function tweenBall() {} function popWord() {} function renderTokens() {} function clearOverlay() {} // drawing (anim/ui) is not loaded here
  globalThis.T = { turnover, speed: (v) => (SPEED = v), clearP, clearance, gDist, CLEAR_BOX, CLEAR_ELSE, seed: (n) => (RNG = mulberry32(n)), holdTurn(on) { if (on) { globalThis.__st ??= startTurn; startTurn = () => {}; } else startTurn = globalThis.__st; }, defReach, shotEval, WIN_FIRST, WIN_KEEP, WIN_MIN, stepsFor, runSteps, adjustToScatter, stepMovers, hd, nbrs, gngTargets, clearBox, inBox, goalSide, markStep, setMark, hexLine, reach, mv, passEval, shotEval, saveP, crossOK, cardOK, setCool, touches, canRun,
    PL, TIER, CROSS_AS, RANGE, GROUND_SPEED,
    fresh(mode = 'hot') { S = makeState(mode); kickoff('H'); return S; }, get S() { return S; } };`,
  ctx,
);
const T = ctx.T;
// helper: a state with the given players placed; everyone else parked out wide, away from the action
function board(pos, ball, attack = 'H') {
  const S = T.fresh();
  let r = 1;
  for (const id of Object.keys(S.pos))
    if (!pos[id] && !T.PL[id].role.includes('GK'))
      S.pos[id] = [id[0] === 'H' ? 8 : 0, (r++ % 12) + (id[0] === 'H' ? 0 : 0)];
  Object.assign(S.pos, pos);
  S.ball = ball;
  S.attack = attack;
  S.plan = [];
  return S;
}
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('hex distance: neighbours are 1 apart, symmetric', () => {
  for (const n of T.nbrs(4, 6)) assert.equal(T.hd([4, 6], n), 1);
  assert.equal(T.hd([0, 0], [8, 12]), T.hd([8, 12], [0, 0]));
});
test('hexLine is contiguous and hits both ends', () => {
  const line = T.hexLine([1, 9], [6, 2]);
  same(line[0], [1, 9]);
  same(line.at(-1), [6, 2]);
  for (let i = 1; i < line.length; i++) assert.equal(T.hd(line[i - 1], line[i]), 1);
});
test('movement: run 3, dribble 2, one less when marked', () => {
  const S = board({ H9: [4, 6], H10: [4, 8], A4: [2, 2] }, 'H9');
  assert.equal(T.mv(S, 'H9'), 2);
  assert.equal(T.mv(S, 'H10'), 3);
  S.pos.A4 = [4, 8];
  assert.equal(T.mv(S, 'H10'), 2);
});
test('reach: hex-only, attackers cannot enter an occupied hex', () => {
  const S = board({ H9: [4, 6], A4: [4, 5] }, 'H9');
  assert.ok(!T.reach(S, 'H9', 3).has('4,5'));
});
test('pass: clean short ground pass with nobody near = 100%', () => {
  const S = board({ H9: [4, 6], H10: [4, 8], A4: [0, 0] }, 'H9');
  const e = T.passEval(S, 'H9', 'H10', 'ground');
  assert.equal(e.clean, 1);
  assert.equal(e.th.length, 0);
});
test('pass: defender standing in the lane can win it (★ tier, lane value)', () => {
  const S = board({ H9: [4, 4], H10: [4, 8], A4: [4, 6] }, 'H9');
  const e = T.passEval(S, 'H9', 'H10', 'ground');
  assert.equal(e.th[0].tier, 'star');
  assert.ok(Math.abs(e.th[0].p - (T.TIER.ground.lane + (T.PL.A4.def - 75) / 200)) < 1e-9);
});
test('v2.27: a defender next to the lane or the receiver does nothing (no threat, no scatter)', () => {
  const S = board({ H9: [4, 4], H10: [4, 8], A4: [5, 6], A8: [5, 8] }, 'H9');
  for (const k of ['ground', 'lob']) {
    const e = T.passEval(S, 'H9', 'H10', k);
    assert.equal(e.th.length, 0, k + ' threats');
    assert.equal(e.pr.length, 0, k + ' pressure');
  }
});
test('shot zones: from the left wing the near post is easier than the far post', () => {
  const S = board({ H9: [1, 2] }, 'H9');
  const near = T.shotEval(S, 'H9', 3),
    far = T.shotEval(S, 'H9', 5); // bottom left vs bottom right
  assert.ok(near.zm.near && far.zm.far);
  assert.ok(near.acc > far.acc);
});
test('keeper: top corner is harder to save than bottom when guessed', () => {
  assert.ok(T.saveP(1, [4, 0], 'H', 3, 80) < T.saveP(4, [4, 0], 'H', 3, 80));
});
test('cross (v2.41): only a winger, only from the flank; Give & Go is the one card and rests the next turn (v2.32)', () => {
  const S = board({ H6: [0, 3], H10: [0, 5], H9: [4, 2] }, 'H6');
  assert.ok(T.crossOK(S, 'H6', 'H9'), 'winger out wide');
  assert.ok(!T.crossOK(S, 'H10', 'H9'), 'a central midfielder out wide can\'t cross');
  S.pos.H6 = [4, 4];
  assert.ok(!T.crossOK(S, 'H6', 'H9'), 'not from the middle');
  // the Cross is a normal option now: using it rests nothing
  S.plan = [{ type: 'cross', from: 'H6', to: 'H9', kind: 'lob', zone: 4, ball: true }];
  T.setCool();
  S.plan = [];
  assert.ok(T.cardOK('cross'));
  assert.ok(T.cardOK('gng'));
  // a Give & Go rests for the team's next attacking turn
  S.plan = [{ type: 'gng', from: 'H6', to: 'H10', ball: true }];
  T.setCool();
  S.plan = [];
  assert.ok(!T.cardOK('gng'));
});
test('runner cap: 3 runners, only one may run twice', () => {
  const S = board({ H2: [2, 10], H5: [6, 10], H6: [1, 8], H8: [7, 8], H9: [4, 6] }, 'H9');
  const run = (pid) => ({ type: 'move', pid, path: [S.pos[pid]], ball: false });
  S.plan = [run('H2'), run('H5'), run('H6')];
  assert.ok(!T.canRun('H8'));
  assert.ok(T.canRun('H2'));
  S.plan.push(run('H2'));
  assert.ok(!T.canRun('H5'));
});

test('give & go: passer return run reaches 4 hexes (3 when marked)', () => {
  const st = board({ H9: [4, 8], H10: [4, 6] }, 'H9');
  const far = T.gngTargets(st, 'H9', 'H10').reduce((m, h) => Math.max(m, T.hd(h, [4, 8])), 0);
  assert.equal(far, 4);
  st.pos.A4 = [4, 8];
  const far2 = T.gngTargets(st, 'H9', 'H10').reduce((m, h) => Math.max(m, T.hd(h, [4, 8])), 0);
  assert.equal(far2, 3);
});

test('keeper restart: attackers step out of the box, nearest free hex', () => {
  const st = board({ H9: [4, 1], H10: [3, 2], H8: [7, 1], A1: [4, 0] }, 'A1');
  const moved = T.clearBox(st, 'A');
  for (const m of moved) assert.ok(!T.inBox(st.pos[m.pid], 'A'));
  for (const m of moved)
    assert.ok(st.pos[m.pid][1] >= 3 && st.pos[m.pid][0] >= 2 && st.pos[m.pid][0] <= 6, 'top of the box, not the sides');
  same(moved.map((m) => m.pid).sort(), ['H10', 'H9']);
  same(st.pos.H8, [7, 1]); // outside the box already
  assert.equal(new Set(Object.values(st.pos).map(String)).size, Object.keys(st.pos).length); // no stacking
});

test('marking: marker heads for the goal-side hex next to his man, one hex a step', () => {
  // Harbour attack up (towards row 0), so goal side of an attacker = the neighbour nearer row 0
  const st = board({ H9: [4, 6], A11: [4, 2] }, 'H9');
  const gs = T.goalSide(st, 'A11', 'H9');
  assert.ok(T.hd(gs, [4, 6]) === 1 && gs[1] === 5, 'goal side is the row in front');
  let pos = st.pos.A11,
    n = 0;
  while (true) {
    const nx = T.markStep(st, 'A11', 'H9');
    if (!nx) break;
    assert.equal(T.hd(pos, nx), 1);
    st.pos.A11 = nx;
    pos = nx;
    if (++n > 10) break;
  }
  assert.equal(T.hd(st.pos.A11, [4, 6]), 1);
  assert.equal(st.pos.A11[1], 5);
});

test('marking: one marker; a new mark replaces the old one; range limit', () => {
  const S = board({ H9: [4, 6], H10: [3, 6], A11: [4, 4], A4: [3, 4], A8: [0, 0] }, 'H9');
  S.marksOf = null;
  assert.equal(T.setMark('A11', 'H9'), null);
  assert.equal(T.setMark('A4', 'H10'), null); // replaces A11's mark
  same(Object.keys(S.marks), ['A4']);
  assert.match(T.setMark('A8', 'H9') || '', /too far/);
  T.setMark('A4', 'H10'); // tap again: let go
  same(Object.keys(S.marks), []);
});

test('ground pass: on the receiver is a bigger threat than in the lane', () => {
  const st = board({ H9: [4, 8], H10: [4, 4], A4: [4, 6] }, 'H9');
  const lane = T.passEval(st, 'H9', 'H10', 'ground').th[0].p;
  st.pos.A4 = [4, 4];
  const recv = T.passEval(st, 'H9', 'H10', 'ground').th[0].p;
  assert.ok(recv > lane + 0.1);
});

test('beaten after a turnover: no influence on a pass lane', () => {
  const st = board({ H9: [4, 8], H10: [4, 4], A4: [4, 6] }, 'H9');
  assert.equal(T.passEval(st, 'H9', 'H10', 'ground').th.length, 1);
  st.out = 'A4';
  T.S.out = 'A4';
  assert.equal(T.passEval(st, 'H9', 'H10', 'ground').th.length, 0);
  T.S.out = null;
});

test('runs: go through an opponent who steps into the path; wait for a moving teammate to vacate the last hex', () => {
  // v2.39: only a defender or the keeper (Wall) stops a run; anyone else can be run through, so use a winger
  const S = board({ H9: [4, 8], H10: [4, 6], A7: [4, 7] }, null);
  S.frameNo = 1;
  S.movers = [
    {
      pid: 'H9',
      path: [
        [4, 8],
        [4, 7],
        [4, 6],
      ],
      idx: 0,
    }, // through A4, into #10's spot
    {
      pid: 'H10',
      path: [
        [4, 6],
        [4, 5],
      ],
      idx: 0,
    },
  ];
  T.stepMovers();
  same(S.pos.H9, [4, 7]); // shares the hex with A7 mid-run
  S.frameNo = 2;
  T.stepMovers();
  same(S.pos.H9, [4, 6]);
  same(S.pos.H10, [4, 5]);
});

test('Wall (v2.39): a run stops in front of a defender standing in its way; a dribble still goes at him', () => {
  const S = board({ H9: [4, 8], A4: [4, 7] }, null);
  S.frameNo = 1;
  S.movers = [{ pid: 'H9', path: [[4, 8], [4, 7], [4, 6]], idx: 0 }];
  T.stepMovers();
  same(S.pos.H9, [4, 8]);
  assert.ok(S.movers[0].done, 'the run is over');
  const D = board({ H9: [4, 8], A4: [4, 7] }, 'H9');
  D.frameNo = 1;
  D.movers = [{ pid: 'H9', path: [[4, 8], [4, 7]], idx: 0, drib: true }];
  T.stepMovers();
  same(D.pos.H9, [4, 7]);
});

test('scattered pass: receiver with movement left steps onto it; a runner extends his run', () => {
  const S = board({ H9: [4, 8], H10: [4, 5], A4: [0, 0] }, null);
  S.movers = [];
  T.adjustToScatter([4, 5], [5, 5]);
  same(S.pos.H10, [5, 5]);
  S.movers = [
    {
      pid: 'H6',
      path: [
        [1, 8],
        [1, 7],
        [1, 6],
      ],
      idx: 1,
      max: 3,
    },
  ];
  S.pos.H6 = [1, 7];
  T.adjustToScatter([1, 6], [2, 6]);
  same(S.movers[0].path[3], [2, 6]);
  S.movers[0].path = [
    [1, 8],
    [1, 7],
    [1, 6],
    [1, 5],
  ]; // a full 3-hex run: no spare
  T.adjustToScatter([1, 5], [2, 5]);
  assert.equal(S.movers[0].path.length, 4);
});

test("double run: second run capped at 2; the runner is tired (-1) on his team's next attacking turn only", () => {
  const S = board({ H9: [4, 8] }, null);
  S.plan = [
    {
      type: 'move',
      pid: 'H9',
      path: [
        [4, 8],
        [4, 7],
        [4, 6],
        [4, 5],
      ],
      ball: false,
    },
  ];
  assert.equal(T.stepsFor(S, 'H9'), 2);
  S.tired = { H9: 'active' };
  S.attack = 'H';
  S.plan = [];
  assert.equal(T.runSteps(S, 'H9'), 2);
  S.attack = 'A';
  assert.equal(T.runSteps(S, 'H9'), 3); // defending: not affected
});

test('react windows: 5 at the first, then 2 + unused (max 3)', () => {
  const next = (left) => Math.min(T.WIN_KEEP, T.WIN_MIN + left);
  assert.equal(T.WIN_FIRST, 5);
  assert.equal(next(5), 3); // saved everything
  assert.equal(next(0), 2); // spent everything
  assert.equal(next(1), 3);
});

test('shot lane follows the aimed side (v2.31): a blocker on the left lane only counts for left-side shots', () => {
  const st = board({ H9: [4, 5], A4: [3, 3] }, 'H9');
  const left = T.shotEval(st, 'H9', 3), // bottom left
    right = T.shotEval(st, 'H9', 5); // bottom right
  const l = left.th.find((t) => t.pid === 'A4');
  assert.ok(l, 'blocks the left lane');
  assert.equal(l.tier, 'lane');
  // v2.31: no "close" blocks any more: off his lane he blocks nothing
  assert.equal(right.th.length, 0);
  assert.equal(right.thr, 1);
  assert.ok(left.thr < 1);
});

test('close defenders (v2.16, v2.31): next to the shooter = pressure on target, but no block', () => {
  const free = T.shotEval(board({ H9: [4, 3] }, 'H9'), 'H9', 4),
    crowd = T.shotEval(board({ H9: [4, 3], A4: [3, 3], A3: [5, 3] }, 'H9'), 'H9', 4),
    behind = T.shotEval(board({ H9: [4, 3], A4: [4, 5] }, 'H9'), 'H9', 4);
  assert.equal(crowd.press, 2);
  assert.ok(Math.abs(free.acc - crowd.acc - 0.16) < 0.001, `${free.acc} ${crowd.acc}`);
  assert.equal(crowd.th.length, 0, 'beside him is not in the lane');
  assert.equal(crowd.thr, 1);
  assert.equal(behind.th.length, 0, 'a defender 2 behind him blocks nothing');
  assert.equal(behind.press, 0);
});

test('pressure (v2.22): only a defender level or goal side counts, not one right behind him', () => {
  // the user's 6 Nov turn 16: #9 at the top-left corner of the box, a defender stepped in right behind him
  const free = T.shotEval(board({ H9: [2, 2] }, 'H9'), 'H9', 0),
    behind = T.shotEval(board({ H9: [2, 2], A7: [2, 3] }, 'H9'), 'H9', 0),
    level = T.shotEval(board({ H9: [2, 2], A7: [3, 2] }, 'H9'), 'H9', 0);
  assert.equal(behind.press, 0);
  assert.equal(behind.acc, free.acc);
  assert.equal(level.press, 1);
  assert.ok(Math.abs(free.acc - level.acc - 0.08) < 0.001);
});

test('cross card: a lob cross is a header, a low cross a first-time shot', () => {
  assert.equal(T.CROSS_AS.lob.header, true);
  assert.equal(T.CROSS_AS.ground.header, false);
});

test('keeper on the board: in line with the aimed side saves most; off his line helps low shots, hurts top ones', () => {
  const on = T.saveP(3, [3, 0], 'H', 3, 80), // bottom left, keeper on the left post
    off = T.saveP(3, [5, 0], 'H', 3, 80); // keeper on the far post
  assert.ok(on > 0.6 && off < 0.3 && on > off * 2.5, `${on} ${off}`);
  assert.ok(T.saveP(4, [4, 2], 'H', 3, 80) > T.saveP(4, [4, 0], 'H', 3, 80), 'off the line: low shot');
  assert.ok(T.saveP(1, [4, 2], 'H', 3, 80) < T.saveP(1, [4, 0], 'H', 3, 80), 'off the line: top shot');
});

test('keeper behind the shooter (rounded / caught upfield): no save chance, on target = goal', () => {
  assert.equal(T.saveP(4, [4, 3], 'H', 2, 80), 0); // shooter 1 out, keeper further out
  assert.ok(T.saveP(4, [4, 1], 'H', 2, 80) > 0.5, 'level with him: still in it');
});

test('on target follows the goal-mouth angle: closer and more central = easier (v2.15)', () => {
  const acc = (h, z = 4) => T.shotEval(board({ H9: h }, 'H9'), 'H9', z).acc;
  assert.ok(acc([4, 1]) > acc([4, 2]) && acc([4, 2]) > acc([4, 3]) && acc([4, 3]) > acc([4, 5]));
  assert.ok(acc([4, 5]) < 0.55, `30 m: ${acc([4, 5])}`);
  assert.ok(acc([7, 1], 3) < acc([6, 2], 3), 'past the post, far side: harder than wide in the box');
  assert.ok(acc([7, 1], 3) < 0.2, `far post from a tight angle: ${acc([7, 1], 3)}`);
});

test('keeper moves only inside his own box', () => {
  const st = board({ A1: [4, 2], H9: [4, 6] }, 'H9');
  for (const [, inf] of T.defReach(st, 'A1', 2)) assert.ok(T.inBox(inf.h, 'A'), JSON.stringify(inf.h));
});

test('clearance: 60% in his own box, 25% elsewhere', () => {
  assert.equal(T.clearP([4, 1], 'A'), T.CLEAR_BOX);
  assert.equal(T.clearP([4, 7], 'A'), T.CLEAR_ELSE);
  assert.equal(T.CLEAR_BOX, 0.6);
  assert.equal(T.CLEAR_ELSE, 0.25);
});
test('clearance: the ball flies 3–4 hexes away from his goal and the play stops', async () => {
  for (let n = 1; n <= 20; n++) {
    const st = board({ A4: [4, 2], H9: [4, 3] }, 'H9');
    st.mode = 'sim';
    T.seed(n);
    T.holdTurn(true); // stop at the end of the play (no next turn: no CPU here)
    const from = st.pos.A4.slice();
    assert.equal(await T.clearance('A4'), 'end');
    const S = T.S,
      spot = S.loose || S.pos[S.ball];
    assert.ok(spot, 'the ball is somewhere');
    const d = T.hd(from, spot);
    assert.ok(d >= 3 && d <= 4, `distance ${d}`);
    assert.ok(T.gDist('H', spot) > T.gDist('H', from), 'further from his own goal');
    T.holdTurn(false);
  }
});

test('turnover: the team that wins it comes back onside (level with the deepest outfield defender)', async () => {
  // Harbour attack up (towards row 0); Northgate win it deep and attack down, Northgate forwards are beyond Harbour's line
  const st = board({ H9: [4, 9], A4: [4, 10], A9: [5, 11], A11: [6, 8], A7: [1, 10] }, 'H9');
  let k = 0;
  for (const id of Object.keys(st.pos)) // everyone else well up the pitch: Harbour's deepest outfield player is #9 (row 9)
    if (!['H9', 'A4', 'A9', 'A11', 'A7'].includes(id) && !T.PL[id].role.includes('GK'))
      st.pos[id] = [id[0] === 'H' ? 8 : 0, 1 + k++];
  st.mode = 'sim';
  T.speed(1000);
  T.holdTurn(true);
  await T.turnover('A4');
  T.holdTurn(false);
  const S = T.S,
    line = Math.max(
      ...Object.keys(S.pos)
        .filter((id) => id[0] === 'H' && !T.PL[id].role.includes('GK'))
        .map((id) => S.pos[id][1]),
    );
  for (const id of Object.keys(S.pos))
    if (id[0] === 'A' && !T.PL[id].role.includes('GK') && id !== 'A4')
      assert.ok(S.pos[id][1] <= line, `${id} ${S.pos[id]} line ${line}`);
  assert.equal(line, 9);
  same(S.pos.A4, [4, 10]);
  assert.equal(S.pos.A9[1], 9);
  assert.equal(S.pos.A7[1], 9);
  same(S.pos.A11, [6, 8]);
  assert.equal(S.attack, 'A');
});

test('keeper (v2.16): in his own box he claims a pass to or through his hex 75% (ground) / 65% (lob); outside it he is ignored', () => {
  const inBoxSt = board({ H9: [7, 1], H10: [3, 1], A1: [5, 1] }, 'H9');
  const g = T.passEval(inBoxSt, 'H9', 'H10', 'ground').th.find((t) => t.pid === 'A1');
  assert.ok(g && g.p0 === 0.75, JSON.stringify(g));
  const lob = T.passEval(board({ H9: [7, 3], H10: [5, 1], A1: [5, 1] }, 'H9'), 'H9', 'H10', 'lob').th.find(
    (t) => t.pid === 'A1',
  );
  assert.ok(lob && lob.p0 === 0.65, JSON.stringify(lob));
  const out = T.passEval(board({ H9: [7, 5], H10: [1, 5], A1: [4, 5] }, 'H9'), 'H9', 'H10', 'ground');
  assert.ok(!out.th.some((t) => t.pid === 'A1'), 'outside his box');
});
