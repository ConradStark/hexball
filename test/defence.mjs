// CPU vs CPU: balance + defensive-flow report from the technical log. node test/defence.mjs [N]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const N = +(process.argv[2] || 10),
  LINE = process.argv[3] || 'classic'; // e.g. sla-ars for the 11v11 match lineup
const b = await chromium.launch();
const C = {};
const inc = (k, n = 1) => (C[k] = (C[k] || 0) + n);
const contest = {}; // type → {n, def}
const end = {}; // how attacking turns end
const winBy = {};
let turns = 0,
  matches = 0,
  goals = 0;
for (let m = 0; m < N; m++) {
  const p = await b.newPage();
  await p.route('**/*', (r) => r.abort());
  await p.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await p.evaluate((line) => {
    document.querySelector('#start').hidden = true;
    window.__hexball.setLineup(line);
    window.__hexball.setSpeed(200);
    window.__hexball.newGame('sim');
  }, LINE);
  await p.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 300000, polling: 200 });
  const g = await p.evaluate(() => ({
    l: window.__hexball.S.glog.map((x) => x.t),
    t: window.__hexball.S.turn,
    s: window.__hexball.S.score,
  }));
  await p.close();
  matches++;
  turns += g.t;
  goals += g.s.H + g.s.A;
  // split into turns
  const T = [];
  for (const line of g.l) {
    const mm = /^T(\d+)(?:\.f\S+)? (.*)$/.exec(line);
    if (!mm) continue;
    if (/^== /.test(mm[2])) T.push([]);
    if (T.length) T[T.length - 1].push(mm[2]);
  }
  for (const t of T) {
    const txt = t.join('\n');
    const plan = (t.find((x) => x.startsWith('PLAN ')) || '').slice(5).split(' | ');
    inc('plans');
    inc('touchesPlanned', plan.filter((x) => !x.startsWith('run ') && x !== '(none)').length);
    inc('runsPlanned', plan.filter((x) => x.startsWith('run ')).length);
    if (/^prepare /m.test(txt)) inc('prepareUsed');
    // crits (v2.15 check): shots, defender wins (counter), perfect passes
    inc('critShots', t.filter((x) => /^keeper .*· CRIT/.test(x)).length);
    inc('shotsTaken', t.filter((x) => /^keeper /.test(x)).length);
    inc('critGoals', t.some((x) => /· CRIT/.test(x)) && t.some((x) => /^GOAL/.test(x)) ? 1 : 0);
    inc('counters', t.filter((x) => /crit: counter/.test(x)).length);
    inc('turnovers', t.filter((x) => /^TURNOVER/.test(x)).length);
    inc('perfect', t.filter((x) => /^PERFECT|perfect pass/i.test(x)).length);
    inc('prepareMoves', ((t.find((x) => x.startsWith('prepare ')) || '').match(/>/g) || []).length);
    const wins = t.filter((x) => /^window \d+ closed/.test(x));
    inc('windows', wins.length);
    for (const w of wins) {
      const u = +/· (\d+) unused/.exec(w)[1];
      inc('stepsUnused', u);
    }
    inc('orders', t.filter((x) => x.startsWith('order ')).length);
    inc(
      'stepsSpent',
      t.filter((x) => x.startsWith('order ')).reduce((s, x) => s + +/\((\d+) st/.exec(x)[1], 0),
    );
    inc('marks', t.filter((x) => /^mark /.test(x)).length);
    inc('tackles', t.filter((x) => x.startsWith('TACKLE ')).length);
    inc('holds', t.filter((x) => x.startsWith('hold ')).length);
    for (const x of t) {
      const d = /^(DUEL|contest) (\w+)(?:\/(\w+))? \S+ v \S+ p (\d+)%.*> (DEF|ATT)/.exec(x);
      if (d) {
        const k = d[2] + (d[3] ? '/' + d[3] : '');
        const c = (contest[k] ||= { n: 0, def: 0, p: 0, mini: 0 });
        c.n++;
        c.p += +d[4];
        if (d[5] === 'DEF') c.def++;
        if (d[1] === 'DUEL') c.mini++;
      }
      if (/^CLEAR /.test(x)) winBy['clears it'] = (winBy['clears it'] || 0) + 1;
      const w = /^WON \S+ \((.*)\)/.exec(x);
      if (w) winBy[w[1].replace(/#\d+ \w+/, '#n')] = (winBy[w[1].replace(/#\d+ \w+/, '#n')] || 0) + 1;
    }
    const e = /GOAL /.test(txt)
      ? 'goal'
      : /SAVED /.test(txt)
        ? 'saved'
        : /WIDE/.test(txt)
          ? 'wide'
          : /BLOCKED /.test(txt)
            ? 'blocked'
            : /CLEAR /.test(txt)
              ? /collects the clearance/.test(txt)
                ? 'cleared · defence keep it'
                : /\(clearance\)/.test(txt)
                  ? 'cleared · back to attack'
                  : 'cleared · loose'
              : /TURNOVER/.test(txt)
                ? 'turnover'
                : 'kept the ball';
    end[e] = (end[e] || 0) + 1;
  }
}
await b.close();
const per = (k, d = C.plans) => ((C[k] || 0) / d).toFixed(2);
const shots = (end.goal || 0) + (end.saved || 0) + (end.wide || 0) + (end.blocked || 0);
console.log(
  `\n${matches} matches · ${(turns / matches).toFixed(1)} turns/match · ${(goals / matches).toFixed(1)} goals/match · ${shots} shots → ${Math.round((100 * (end.goal || 0)) / shots)}% scored`,
);
console.log(
  `\nCrits: shots ${C.critShots || 0}/${C.shotsTaken || 0} (${Math.round((100 * (C.critShots || 0)) / (C.shotsTaken || 1))}%), goals from crit shots ${C.critGoals || 0}/${goals} · counters ${C.counters || 0}/${C.turnovers || 0} turnovers · perfect passes ${C.perfect || 0}`,
);
console.log('\nHow attacking turns end (' + C.plans + ' turns):');
for (const [k, v] of Object.entries(end).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)}  ${Math.round((100 * v) / C.plans)}%`);
console.log(
  '\nAttack per turn: touches ' +
    per('touchesPlanned') +
    ' · runs ' +
    per('runsPlanned') +
    ' · held passes ' +
    per('holds'),
);
console.log(
  'Defence per turn: Prepare used ' +
    Math.round((100 * (C.prepareUsed || 0)) / C.plans) +
    '% of turns (' +
    per('prepareMoves') +
    ' moves) · React windows ' +
    per('windows') +
    ' · players sent ' +
    per('orders') +
    ' · steps spent ' +
    per('stepsSpent') +
    ' · steps left unused ' +
    per('stepsUnused') +
    ' · marks set ' +
    per('marks') +
    ' · tackles ' +
    per('tackles'),
);
console.log(
  '  per window: ' +
    (C.stepsSpent / C.windows).toFixed(2) +
    ' steps spent, ' +
    (C.stepsUnused / C.windows).toFixed(2) +
    ' unused, ' +
    (C.orders / C.windows).toFixed(2) +
    ' players sent',
);
console.log('\nContests (defender wins / total · avg chance · mini-game shown):');
for (const [k, c] of Object.entries(contest).sort((a, b) => b[1].n - a[1].n))
  console.log(
    `  ${k.padEnd(14)} ${String(c.def).padStart(3)}/${String(c.n).padEnd(4)} ${String(Math.round((100 * c.def) / c.n)).padStart(3)}% won · avg ${Math.round(c.p / c.n)}% · duels ${c.mini}`,
  );
console.log('\nHow the defence won the ball:');
for (const [k, v] of Object.entries(winBy).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
