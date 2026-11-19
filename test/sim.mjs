// CPU-vs-CPU balance simulation. Run: npm run sim [-- matches]
// Plays full matches with both sides on the CPU (mode 'sim': no duel taps) and reports
// goals, shots, turnovers by cause and match length, so rule tweaks can be compared with numbers.
// Playwright is preinstalled globally in this environment, so load it through require (which honours NODE_PATH).
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';

const N = +(process.argv[2] || 6);
// PITCH=wide npm run sim -- 20 → the 10 × 15 pitch with a 4-wide goal (v2.23)
const PITCH = process.env.PITCH || 'classic';
// DEF=respond → the v2.25 defence mode (attack moves first, Anticipate, challenges)
const DEF = process.env.DEF || 'respond';
// SHAPE=off → no shape step (v2.47)
const SHAPE = process.env.SHAPE !== 'off';
const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const RESET = '<style>[hidden]{display:none!important}body{margin:0}</style>';
const browser = await chromium.launch();
const tally = { matches: 0, turns: 0, goals: { H: 0, A: 0 }, events: {} };
const COUNT = {
  shots: /saves!|wide \(|^GOAL!|Shot blocked/, // one line per shot outcome
  goals: /^GOAL!/,
  saves: /saves!/,
  wide: /wide \(/,
  intercepted: /cuts it out|steps in front|blocks it at source|charges it down/,
  header_won: /wins it in the air/,
  tackled: /wins it on the ball|wins it clean/,
  loose_lost: /pounces on the loose ball|collects it$/,
  blocked: /Shot blocked/,
  counters: /^COUNTER/,
  scatter: /scatters/,
};
for (let m = 0; m < N; m++) {
  const page = await browser.newPage();
  await page.route('**/*', (r) => r.abort()); // no web fonts needed
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${RESET}</head><body>${html}</body></html>`);
  await page.evaluate((pitch) => {
    document.querySelector('#start').hidden = true;
    window.__hexball.setSpeed(200);
    window.__hexball.setPitch(pitch[0]);
    window.__hexball.setDef(pitch[1]);
    window.__hexball.setShape(pitch[2]);
    window.__hexball.newGame('sim');
  }, [PITCH, DEF, SHAPE]);
  await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 300000, polling: 200 });
  const r = await page.evaluate(() => ({
    score: window.__hexball.S.score,
    turn: window.__hexball.S.turn,
    log: window.__hexball.S.logAll,
  }));
  if (errors.length) {
    console.log('page errors:', errors);
    process.exitCode = 1;
  }
  tally.matches++;
  tally.turns += r.turn;
  tally.goals.H += r.score.H;
  tally.goals.A += r.score.A;
  // skip duel narration ("Duel: …") so each event counts once
  for (const line of r.log)
    if (!line.startsWith('Duel:'))
      for (const [k, re] of Object.entries(COUNT)) if (re.test(line)) tally.events[k] = (tally.events[k] || 0) + 1;
  // possession changes that weren't goals: the attacking team in "— Turn n: X play it out —" switches
  let prev = null,
    sw = 0;
  for (const line of r.log) {
    const t = /— Turn \d+: (\w+) play it out/.exec(line);
    if (!t) continue;
    if (prev && t[1] !== prev) sw++;
    prev = t[1];
  }
  tally.lost = (tally.lost || 0) + sw - (r.score.H + r.score.A);
  console.log(`match ${m + 1}: ${r.score.H}–${r.score.A} in ${r.turn} turns`);
  await page.close();
}
await browser.close();
const per = (k) => ((tally.events[k] || 0) / tally.turns).toFixed(2);
console.log(
  `\n${tally.matches} matches · avg ${(tally.turns / tally.matches).toFixed(1)} turns · Harbour ${tally.goals.H} – ${tally.goals.A} Northgate`,
);
console.log(
  'per turn:',
  Object.keys(COUNT)
    .map((k) => `${k} ${per(k)}`)
    .join(' · '),
);
const M = tally.matches;
console.log(
  `per match: goals ${((tally.goals.H + tally.goals.A) / M).toFixed(1)} · ` +
    Object.keys(COUNT)
      .map((k) => `${k} ${((tally.events[k] || 0) / M).toFixed(1)}`)
      .join(' · '),
);
console.log(
  `conversion ${Math.round(((tally.goals.H + tally.goals.A) / (tally.events.shots || 1)) * 100)}% of shots · possession lost (not goals) ${(tally.lost / M).toFixed(1)} per match, ${(tally.lost / tally.turns).toFixed(2)} per turn`,
);
