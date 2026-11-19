import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const b = await chromium.launch();
const KO = new Set();
const C = {
  plans: 0,
  dribble: 0,
  pass: 0,
  through: 0,
  lob: 0,
  gng: 0,
  cross: 0,
  shot: 0,
  run: 0,
  noRun: 0,
  koDribble: 0,
  ko: 0,
};
for (let m = 0; m < 8; m++) {
  const page = await b.newPage();
  await page.route('**/*', (r) => r.abort());
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await page.evaluate(() => {
    document.querySelector('#start').hidden = true;
    window.__hexball.setSpeed(200);
    window.__hexball.newGame('sim');
  });
  await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 300000, polling: 200 });
  let gl0;
  const g = await page.evaluate(() => window.__hexball.S.glog.map((l) => l.t));
  for (let i = 0; i < g.length; i++) {
    const l = g[i];
    if (!/ PLAN /.test(l)) continue;
    C.plans++;
    const parts = l.split(' PLAN ')[1].split(' | ');
    let runs = 0;
    for (const p of parts) {
      if (p.startsWith('run')) {
        C.run++;
        runs++;
      } else if (p.startsWith('dribble')) C.dribble++;
      else if (p.startsWith('ground')) C.pass++;
      else if (p.startsWith('lob')) C.lob++;
      else if (p.startsWith('gng')) C.gng++;
      else if (p.startsWith('cross')) C.cross++;
      else if (p.startsWith('shot')) C.shot++;
      else if (p.startsWith('through')) C.through++;
    }
    if (!runs) C.noRun++;
    const hdr = g.slice(Math.max(0, i - 3), i).join(' ');
    if (/ball \w9@4,6/.test(hdr)) {
      C.ko++;
      KO.add(parts.map((x) => x.split(' ')[0]).join('+'));
      if (parts.every((x) => /^dribble|^shot/.test(x))) C.koDribble++;
    }
  }
  await page.close();
}
await b.close();
const P = C.plans;
console.log(
  `${P} CPU plans · per plan: dribbles ${(C.dribble / P).toFixed(2)} · ground passes ${(C.pass / P).toFixed(2)} · lobs ${(C.lob / P).toFixed(2)} · gng ${(C.gng / P).toFixed(2)} · crosses ${(C.cross / P).toFixed(2)} · shots ${(C.shot / P).toFixed(2)} · runs ${(C.run / P).toFixed(2)} · plans with no runs ${Math.round((100 * C.noRun) / P)}% · kick-offs ${C.ko}, dribble-only ${C.koDribble}, distinct kick-off shapes ${KO.size}`,
);
console.log([...KO].slice(0, 8).join('\n'));
