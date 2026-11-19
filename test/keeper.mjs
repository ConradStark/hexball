// CPU vs CPU: shots, goals, saves, and save chance vs how far the keeper was from the aimed side. node test/keeper.mjs [N]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const N = +(process.argv[2] || 20);
const b = await chromium.launch();
let shots = 0,
  goals = 0,
  saves = 0,
  wide = 0,
  blocked = 0,
  turns = 0;
const byRel = {};
for (let m = 0; m < N; m++) {
  const p = await b.newPage();
  await p.route('**/*', (r) => r.abort());
  await p.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await p.evaluate(() => {
    document.querySelector('#start').hidden = true;
    window.__hexball.setSpeed(200);
    window.__hexball.newGame('sim');
  });
  await p.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 120000, polling: 200 });
  const g = await p.evaluate(() => ({ l: window.__hexball.S.glog.map((x) => x.t), t: window.__hexball.S.turn }));
  turns += g.t;
  for (let i = 0; i < g.l.length; i++) {
    const t = g.l[i];
    if (/ SHOT /.test(t)) shots++;
    if (/ GOAL /.test(t)) goals++;
    if (/ SAVED /.test(t)) saves++;
    if (/ WIDE$/.test(t)) wide++;
    if (/ BLOCKED /.test(t)) blocked++;
    const k = / keeper \w+@\S+ \((\w+)\) · save (\d+)%/.exec(t);
    if (k) {
      const r = (byRel[k[1]] ||= { n: 0, sum: 0, saved: 0 });
      r.n++;
      r.sum += +k[2];
      if (/ SAVED /.test(g.l[i + 1] || '')) r.saved++;
    }
  }
  await p.close();
}
await b.close();
console.log(
  `${N} matches · ${(turns / N).toFixed(1)} turns · shots ${(shots / N).toFixed(1)} · goals ${(goals / N).toFixed(1)} · conversion ${Math.round((100 * goals) / shots)}% · saves ${(saves / N).toFixed(1)} · wide ${(wide / N).toFixed(1)} · blocked ${(blocked / N).toFixed(1)}`,
);
for (const [k, r] of Object.entries(byRel))
  console.log(
    `  keeper ${k.padEnd(5)} ${String(r.n).padStart(4)} shots · avg save chance ${(r.sum / r.n).toFixed(0)}% · saved ${Math.round((100 * r.saved) / r.n)}%`,
  );
