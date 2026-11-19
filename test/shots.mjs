// CPU-vs-CPU: where do shots come from? Parses SHOT lines from the game log.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const N = +(process.argv[2] || 8);
const b = await chromium.launch();
const D = {};
let shots = 0,
  goals = 0,
  inBox = 0,
  inBoxGoals = 0,
  turns = 0;
for (let m = 0; m < N; m++) {
  const page = await b.newPage();
  await page.route('**/*', (r) => r.abort());
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await page.evaluate(() => {
    document.querySelector('#start').hidden = true;
    window.__hexball.setSpeed(200);
    window.__hexball.newGame('sim');
  });
  await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 300000, polling: 200 });
  const L = await page.evaluate(() => ({ g: window.__hexball.S.glog.map((l) => l.t), t: window.__hexball.S.turn }));
  turns += L.t;
  for (let i = 0; i < L.g.length; i++) {
    const m2 = /SHOT (\w+)@(\d+),(\d+)/.exec(L.g[i]);
    if (!m2) continue;
    const team = m2[1][0],
      r = +m2[3],
      c = +m2[2];
    const dist = team === 'H' ? r : 12 - r; // rows from goal line
    const box = c >= 2 && c <= 6 && dist <= 2;
    shots++;
    D[dist] = (D[dist] || 0) + 1;
    if (box) inBox++;
    const res = L.g.slice(i + 1, i + 5).find((x) => /GOAL|SAVED|WIDE|BLOCKED/.test(x)) || '';
    if (/GOAL/.test(res)) {
      goals++;
      if (box) inBoxGoals++;
    }
  }
  await page.close();
}
await b.close();
console.log(
  `${N} matches · ${(turns / N).toFixed(1)} turns · shots/match ${(shots / N).toFixed(1)} · goals/match ${(goals / N).toFixed(1)} · in box ${Math.round((100 * inBox) / shots)}% of shots (${inBoxGoals}/${inBox} scored) · outside ${goals - inBoxGoals}/${shots - inBox}`,
);
console.log('shots by rows from goal line:', JSON.stringify(D));
