// Rhythm report: how the game flows back and forth (CPU vs CPU), from the technical log.
//   npm run rhythm [-- matches]          DEF=respond|prepare  PITCH=classic|wide
// Seeded per match (seed = match number), so two versions can be compared on the same dice.
// Measures pacing and agency, not balance: possession spells, turns where nothing happens,
// ground gained, how often the defence gets a say, how close the contests are.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';

const N = +(process.argv[2] || 10);
const DEF = process.env.DEF || 'respond';
const SHAPE = process.env.SHAPE !== 'off'; // v2.47
const PITCH = process.env.PITCH || 'classic';
const PAR = 4;
const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const browser = await chromium.launch();

async function play(m) {
  const p = await browser.newPage();
  await p.route('**/*', (r) => r.abort());
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await p.evaluate(
    ([pitch, def, seed, shape]) => {
      const h = window.__hexball;
      document.querySelector('#start').hidden = true;
      h.setSpeed(200);
      h.setPitch(pitch);
      h.setDef(def);
      h.setShape(shape);
      h.seed(seed);
      h.newGame('sim');
    },
    [PITCH, DEF, m + 1, SHAPE],
  );
  await p.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 300000, polling: 200 });
  const g = await p.evaluate(() => ({
    l: window.__hexball.S.glog.map((x) => x.t),
    rows: window.__hexball.GEO.ROWS,
  }));
  await p.close();
  if (errors.length) console.log(`match ${m + 1} page errors:`, errors);
  return g;
}

const games = [];
for (let i = 0; i < N; i += PAR)
  games.push(...(await Promise.all([...Array(Math.min(PAR, N - i))].map((_, j) => play(i + j)))));
await browser.close();

// ---- parse each match into turns ----
const T = []; // all turns, all matches
const M = []; // per match: list of turns
for (const g of games) {
  const turns = [];
  for (const line of g.l) {
    const mm = /^T(\d+)(?:\.f(\d+))? (.*)$/.exec(line);
    if (!mm) continue;
    const txt = mm[3];
    const h = /^== (H|A) attack · \S+ · ball (?:(\w+)@|loose@)(\d+),(\d+)/.exec(txt);
    if (h) {
      const r = +h[4];
      // H attacks towards row 0, A towards the last row
      turns.push({ team: h[1], fromGoal: h[1] === 'H' ? r : g.rows - 1 - r, lines: [], frames: 0, rows: g.rows });
      continue;
    }
    const t = turns[turns.length - 1];
    if (!t) continue;
    t.lines.push(txt);
    if (mm[2]) t.frames = Math.max(t.frames, +mm[2]);
  }
  for (const t of turns) {
    const L = t.lines,
      has = (re) => L.some((x) => re.test(x)),
      count = (re) => L.filter((x) => re.test(x)).length;
    t.goal = has(/^GOAL /);
    t.shot = has(/^SHOT /);
    t.duels = L.filter((x) => /^DUEL /.test(x)).map((x) => +(/ p (\d+)%/.exec(x) || [0, 0])[1]);
    t.contests = L.filter((x) => /^(DUEL|contest) /.test(x)).map((x) => +(/ p (\d+)%/.exec(x) || [0, 0])[1]);
    t.lost = has(/^TURNOVER/) || has(/collects the clearance/);
    t.cleared = has(/^CLEAR /);
    t.restart = has(/^(SAVED|WIDE|BLOCKED)/);
    t.outcome = t.goal
      ? 'goal'
      : t.shot
        ? 'shot, no goal'
        : t.lost
          ? 'ball won by defence'
          : t.cleared
            ? 'cleared (loose/back)'
            : t.contests.length
              ? 'kept it, after a contest'
              : 'kept it, quiet';
    t.defActs = count(/^(order|read |press |block |TACKLE |prepare )/) + count(/^mark /);
    t.windows = count(/^window \d+ closed/);
    // decided before the defence's first window? (a shot/turnover with no window before it)
    const firstWin = L.findIndex((x) => /^window \d+ closed|^prepare /.test(x));
    const firstEnd = L.findIndex((x) => /^(SHOT|TURNOVER|CLEAR) /.test(x));
    t.beforeWindow = firstEnd >= 0 && (firstWin < 0 || firstEnd < firstWin);
  }
  // next turn's start, to measure ground gained when the same team keeps it
  turns.forEach((t, i) => {
    const n = turns[i + 1];
    t.gain = n && n.team === t.team && !t.goal ? t.fromGoal - n.fromGoal : null;
  });
  M.push(turns);
  T.push(...turns);
}

// ---- spells: consecutive turns by the same attacking team ----
const spells = [];
for (const turns of M) {
  let cur = null;
  for (const t of turns) {
    if (!cur || cur.team !== t.team) spells.push((cur = { team: t.team, turns: [], startFrom: t.fromGoal }));
    cur.turns.push(t);
  }
}
for (const s of spells) {
  const last = s.turns[s.turns.length - 1];
  s.len = s.turns.length;
  s.end = last.goal ? 'goal' : last.shot ? 'shot' : 'lost it';
  s.shot = s.turns.some((t) => t.shot);
}

// ---- report ----
const pct = (a, b) => `${Math.round((100 * a) / (b || 1))}%`;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f1 = (x) => x.toFixed(1),
  f2 = (x) => x.toFixed(2);
const nT = T.length;

console.log(`\nRHYTHM · ${N} matches · Defence ${DEF} · pitch ${PITCH} · CPU v CPU, seeds 1–${N}`);
console.log(`\nLength: ${f1(nT / N)} turns/match · ${f1(avg(T.map((t) => t.frames)))} frames/turn`);

const lens = spells.map((s) => s.len);
const hist = [1, 2, 3, 4, 5].map((k) => [k === 5 ? '5+' : k, lens.filter((l) => (k === 5 ? l >= 5 : l === k)).length]);
console.log(
  `\nBack and forth: ${f1(spells.length / N)} spells/match (possession swaps ${f1((spells.length - N) / N)}) · ` +
    `avg spell ${f1(avg(lens))} turns · longest ${Math.max(...lens)}`,
);
console.log('  spell length: ' + hist.map(([k, v]) => `${k}: ${pct(v, spells.length)}`).join(' · '));
const se = (k) => spells.filter((s) => s.end === k).length;
console.log(
  `  spells end in: goal ${pct(se('goal'), spells.length)} · shot ${pct(se('shot'), spells.length)} · ball lost ${pct(se('lost it'), spells.length)}` +
    ` · reach a shot at all ${pct(spells.filter((s) => s.shot).length, spells.length)}`,
);

console.log('\nWhat a turn does:');
const oc = {};
for (const t of T) oc[t.outcome] = (oc[t.outcome] || 0) + 1;
for (const k of ['goal', 'shot, no goal', 'ball won by defence', 'cleared (loose/back)', 'kept it, after a contest', 'kept it, quiet'])
  console.log(`  ${k.padEnd(26)} ${pct(oc[k] || 0, nT).padStart(4)}`);
const kept = T.filter((t) => t.gain !== null);
console.log(
  `  when kept: ground gained ${f1(avg(kept.map((t) => t.gain)))} rows/turn · ` +
    `went backwards ${pct(kept.filter((t) => t.gain < 0).length, kept.length)} · no progress ${pct(kept.filter((t) => t.gain === 0).length, kept.length)}`,
);

console.log('\nThe defence\'s say:');
console.log(
  `  windows ${f2(avg(T.map((t) => t.windows)))}/turn · actions ${f2(avg(T.map((t) => t.defActs)))}/turn · ` +
    `turns with no window ${pct(T.filter((t) => !t.windows).length, nT)}`,
);
console.log(
  `  turns with a contest ${pct(T.filter((t) => t.contests.length).length, nT)} · contests ${f2(avg(T.map((t) => t.contests.length)))}/turn · ` +
    `shot/turnover before the defence could act ${pct(T.filter((t) => t.beforeWindow).length, nT)}`,
);
const cs = T.flatMap((t) => t.contests);
console.log(
  `  contest odds: tense 35–65% ${pct(cs.filter((p) => p >= 35 && p <= 65).length, cs.length)} · ` +
    `long shot <35% ${pct(cs.filter((p) => p < 35).length, cs.length)} · near-sure >65% ${pct(cs.filter((p) => p > 65).length, cs.length)} (${cs.length} contests)`,
);
const ds = T.flatMap((t) => t.duels);
console.log(
  `  mini-games shown (DUEL): ${f1(ds.length / N)}/match, ${f2(ds.length / nT)}/turn · defender odds <20% ${pct(ds.filter((p) => p < 20).length, ds.length)} · ` +
    `20–35% ${pct(ds.filter((p) => p >= 20 && p < 35).length, ds.length)} · 35–65% ${pct(ds.filter((p) => p >= 35 && p <= 65).length, ds.length)} · >65% ${pct(ds.filter((p) => p > 65).length, ds.length)}`,
);
