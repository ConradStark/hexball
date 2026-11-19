// Test runner: builds once, then runs the suites side by side and prints one summary.
//   node test/run.mjs            everything (what `npm test` runs)
//   node test/run.mjs quick      unit tests + behaviour lock + game-screen UI (~15 s; for each small change)
//   node test/run.mjs ui smoke   just the named suites
import { spawn } from 'child_process';
import os from 'os';
import { build } from '../build.mjs';

const SUITES = {
  unit: ['node', ['--test', '--test-reporter=dot', 'test/rules.test.mjs']],
  replay: ['node', ['test/replay.mjs', 'check']],
  ui: ['node', ['test/ui.mjs']],
  start: ['node', ['test/start.mjs', '1']],
  smoke: ['node', ['test/smoke.mjs']],
};
const GROUPS = { all: Object.keys(SUITES), quick: ['unit', 'replay', 'ui'] };
const args = process.argv.slice(2),
  pick = args.length ? args.flatMap((a) => GROUPS[a] || [a]) : GROUPS.all;
for (const k of pick)
  if (!SUITES[k]) throw new Error(`unknown suite "${k}" (have: ${Object.keys(SUITES).join(', ')}, quick, all)`);

const t0 = Date.now();
build();
// Slowest first so the long ones overlap; browsers are heavy, so at most 3 at a time.
const queue = ['smoke', 'replay', 'start', 'ui', 'unit'].filter((k) => pick.includes(k)),
  results = [];
function run(k) {
  return new Promise((done) => {
    const s = Date.now(),
      [cmd, a] = SUITES[k],
      p = spawn(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => {
      results.push({ k, code, out, s: (Date.now() - s) / 1000 });
      console.log(`${code ? 'FAIL' : ' ok '} ${k.padEnd(7)} ${((Date.now() - s) / 1000).toFixed(1)}s`);
      done();
    });
  });
}
await Promise.all(
  [...Array(Math.min(3, Math.max(2, os.cpus().length), queue.length))].map(async () => {
    while (queue.length) await run(queue.shift());
  }),
);
const bad = results.filter((r) => r.code);
for (const r of bad)
  console.log(
    `\n── ${r.k} ──\n${r.out
      .trim()
      .split('\n')
      .filter((l) => !/^\s+ok\b|^ok \d|^# Subtest/.test(l))
      .join('\n')}`,
  );
console.log(
  `\n${bad.length ? `${bad.length} suite(s) failed` : 'all passed'} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
if (bad.length) process.exit(1);
