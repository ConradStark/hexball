// Shot situations: fixed set-ups (shooter, keeper, defenders) → odds per aim spot + board/picker screenshots.
// node tools/shot-situations.mjs [outDir]   (after npm run build). Writes outDir/shots.json and PNGs. Used for the
// "Shot Situations" artifact (real-world xG ballparks in each set-up's `real`).
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const OUT = process.argv[2] || 'shots-out';
fs.mkdirSync(OUT, { recursive: true });
const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.route('**/*', (r) => r.abort());
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}</style></head><body>${html}</body></html>`,
);
await page.evaluate(() => window.__hexball.setAutoGo(0));
await page.selectOption('#stFirst', 'H');
await page.click('#stGo');
await page.waitForFunction(() => window.__hexball.S.phase === 'plan');
// Harbour shoot up at Northgate's goal (cols 3–5 at row 0). Everyone not named is parked out of the way.
const PARK = {
  H1: [4, 12],
  H2: [1, 9],
  H5: [7, 9],
  H6: [2, 7],
  H8: [6, 7],
  H10: [4, 8],
  A4: [1, 4],
  A3: [7, 4],
  A11: [2, 6],
  A7: [6, 6],
  A8: [0, 8],
  A9: [8, 8],
};
const SC = [
  { k: 'six', t: 'Six-yard box, central', pos: { H9: [4, 1], A1: [4, 0] }, real: '~45–60%' },
  { k: 'pen', t: 'Penalty-spot distance, central, unmarked', pos: { H9: [4, 2], A1: [4, 0] }, real: '~25–35%' },
  {
    k: 'edge',
    t: 'Edge of the box, central, a defender in front',
    pos: { H9: [4, 3], A1: [4, 0], A4: [4, 2] },
    real: '~5–8%',
  },
  { k: 'long', t: 'Long range (~30 m), central, unmarked', pos: { H9: [4, 5], A1: [4, 0] }, real: '~2–4%' },
  { k: 'oneone', t: '1v1 from the edge, keeper 2 off his line', pos: { H9: [4, 4], A1: [4, 2] }, real: '~30–40%' },
  {
    k: 'wide',
    t: 'Inside the box, wide right, keeper on the near post',
    pos: { H9: [6, 2], A1: [5, 0] },
    real: '~8–12%',
  },
  { k: 'tight', t: 'Tight angle past the right post', pos: { H9: [7, 1], A1: [5, 0] }, real: '~4–7%' },
  {
    k: 'crowd',
    t: 'Six-yard box, two defenders on him',
    pos: { H9: [4, 1], A1: [4, 0], A4: [3, 1], A3: [5, 1] },
    real: '~20–30%',
  },
  { k: 'edgeopen', t: 'Edge of the box, central, in space', pos: { H9: [4, 3], A1: [4, 0] }, real: '~8–12%' },
  { k: 'keepout', t: 'Penalty spot, keeper come out to meet him', pos: { H9: [4, 2], A1: [4, 1] }, real: '~20–30%' },
  { k: 'rounded', t: 'Keeper beaten, behind you, open goal', pos: { H9: [4, 1], A1: [4, 2] }, real: '~85–95%' },
];
const ZN = ['Top left', 'Top centre', 'Top right', 'Bottom left', 'Bottom centre', 'Bottom right'];
const res = [];
for (const sc of SC) {
  const r = await page.evaluate(
    ([pos, park]) => {
      const h = window.__hexball,
        S = h.S;
      Object.assign(S.pos, park, pos);
      S.ball = 'H9';
      S.loose = null;
      S.plan = [];
      S.ui.mode = 'shoot';
      S.ui.sel = 'H9';
      S.ui.gsel = null;
      h.render();
      const st = h.baseSt(),
        P = h.PLof('H9'),
        K = h.PLof('A1');
      return {
        sho: P.sho,
        ref: K.ref,
        dg: h.gDist('H', S.pos.H9),
        z: [0, 1, 2, 3, 4, 5].map((z) => {
          const e = h.shotEval(st, 'H9', z),
            sp = h.saveP(z, S.pos.A1, 'H', e.dg, K.ref, null, S.pos.H9),
            rel = h.kRel(z, S.pos.A1, 'H'),
            spC = sp / 2,
            goal = e.thr * (e.crit * (1 - spC) + (1 - e.crit) * e.acc * (1 - sp)),
            // the crit-free version (what the numbers would be with no crit strikes)
            goalNoCrit = e.thr * e.acc * (1 - sp);
          return { z, acc: e.acc, block: 1 - e.thr, sp, rel, crit: e.crit, goal, goalNoCrit };
        }),
      };
    },
    [sc.pos, PARK],
  );
  // board first with no pop-up (see the positions), then the goal picker
  await page.evaluate(() => {
    const h = window.__hexball;
    h.S.ui.mode = null;
    h.S.ui.sel = null;
    h.render();
  });
  await page.waitForTimeout(250);
  const box = await page.$eval('#board', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.screenshot({
    path: `${OUT}/${sc.k}.png`,
    clip: { x: box.x, y: box.y, width: box.w, height: box.h * 0.5 },
  });
  await page.evaluate(() => {
    const h = window.__hexball;
    h.S.ui.mode = 'shoot';
    h.S.ui.sel = 'H9';
    h.render();
  });
  await page.waitForTimeout(150);
  const pop = await page.$('#pop');
  if (pop && (await pop.isVisible())) await pop.screenshot({ path: `${OUT}/${sc.k}-pick.png` });
  res.push({ ...sc, ...r });
}
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify(res, null, 1));
for (const r of res) {
  const best = r.z.reduce((a, b) => (b.goal > a.goal ? b : a));
  console.log(
    `${r.t} · dg ${r.dg} · best ${ZN[best.z]} ${(best.goal * 100).toFixed(0)}% (no crit ${(best.goalNoCrit * 100).toFixed(0)}%) · real ${r.real}`,
  );
}
console.log('shooter sho', res[0].sho, 'keeper ref', res[0].ref);
await b.close();
