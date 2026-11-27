// Behaviour lock: CPU vs CPU matches with fixed dice. `node test/replay.mjs record` saves the game logs;
// `node test/replay.mjs check` replays them and fails on any difference. Use around refactors that must not change play.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';

const MODE = process.argv[2] || 'check',
  N = +(process.argv[3] || 12),
  FILE = 'test/replay-baseline.json',
  html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const b = await chromium.launch(),
  out = [],
  problems = [];
async function play(m) {
  const page = await b.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => r.abort());
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await page.evaluate(
    ([size, seed]) => {
      // seeded Math.random (the per-turn dice seeds come from it)
      let a = seed >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      document.querySelector('#start').hidden = true;
      window.__hexball.setSize(size);
      window.__hexball.setSpeed(200);
      window.__hexball.newGame('sim');
    },
    [[7, 6, 5][m % 3], 1000 + m],
  );
  await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 120000, polling: 50 });
  out[m] = await page.evaluate(() => window.__hexball.S.glog.map((l) => l.t));
  if (errors.length) problems.push(`match ${m}: page errors: ${errors.join(' / ')}`);
  await page.close();
}
// Matches run side by side (each page has its own Math.random, so the order doesn't matter).
const queue = [...Array(N).keys()];
await Promise.all(
  [...Array(Math.min(4, N))].map(async () => {
    while (queue.length) await play(queue.shift());
  }),
);
// Rules every match must keep, whatever the dice (cheap checks on the logs).
out.forEach((g, m) => {
  for (const t of g) {
    // v2.25/v2.34 Respond (the only mode on the start screen since v2.39): windows after frames 1, 3, 5…
    const w = /^T\d+\.f(\d+) window \d+ closed/.exec(t);
    if (w && !(+w[1] % 2)) problems.push(`match ${m}: React window off the 2-frame clock: ${t}`);
    // v2.11: one pass or shot a turn (runs and dribbles are free); the CPU once shot after its Give & Go
    const p = /^T\d+ PLAN (.*)$/.exec(t);
    if (p) {
      const kicks = p[1].split(' | ').filter((x) => x && x !== '(none)' && !/^(run|dribble) /.test(x));
      // v2.24: two when the first is a ground pass, and the second is a pass or shot (no card)
      const ok = kicks.length <= 1 || (kicks.length === 2 && /^(through )?ground /.test(kicks[0]) && !/^(gng|cross) /.test(kicks[1]));
      if (!ok) problems.push(`match ${m}: too many passes/shots in a plan: ${t}`);
    }
    // v2.19: a loose ball nobody could collect once looped a match for thousands of turns
    const T = /^T(\d+) == /.exec(t);
    if (T && +T[1] === 151) problems.push(`match ${m}: still going at turn ${T[1]}`);
  }
});
await b.close();
if (problems.length) {
  console.log(problems.join('\n'));
  process.exitCode = 1;
}
if (MODE === 'record') {
  fs.writeFileSync(FILE, JSON.stringify(out));
  console.log(`recorded ${N} matches · ${out.reduce((n, g) => n + g.length, 0)} log lines`);
} else {
  const base = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let bad = 0;
  for (let m = 0; m < base.length; m++) {
    const a = base[m],
      c = out[m] || [];
    const i = a.findIndex((t, k) => t !== c[k]);
    if (i >= 0 || a.length !== c.length) {
      bad++;
      const k = i >= 0 ? i : Math.min(a.length, c.length);
      console.log(`match ${m} differs at line ${k}:\n  was: ${a[k]}\n  now: ${c[k]}`);
    }
  }
  console.log(bad ? `${bad} of ${base.length} matches changed` : `all ${base.length} matches identical`);
  if (bad) process.exitCode = 1;
}
