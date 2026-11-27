// Start screen (v2.0) smoke tests + a quick CPU-vs-CPU check at each team size. Run: node test/start.mjs
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
import assert from 'assert/strict';

const html = fs.readFileSync('dist/hexball.test.html', 'utf8');
const RESET = '<style>[hidden]{display:none!important}body{margin:0}</style>';
const b = await chromium.launch();
async function open() {
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => r.abort());
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${RESET}</head><body>${html}</body></html>`);
  await page.evaluate(() => window.__hexball.setAutoGo(0));
  return { page, errors };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
const count = (page, t) => H(page, (t) => Object.keys(window.__hexball.S.pos).filter((k) => k[0] === t).length, t);
const tests = {
  async 'defaults: vs CPU, 7v7, random start, kick off'(page) {
    assert.equal(await page.$eval('#stSize', (e) => e.value), '7');
    assert.equal(await page.$eval('[data-vs="cpu"]', (e) => e.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('#stFirst', (e) => e.value), 'R');
    assert.equal(
      await page.$$eval('#stSize option', (o) => o.map((x) => x.textContent).join()),
      '7v7,6v6,5v5,Slavia v Arsenal · 7v7',
    );
    await page.click('#stGo');
    assert.equal(await H(page, () => window.__hexball.S.mode), 'cpu');
    assert.equal(await count(page, 'H'), 7);
    assert.equal(await count(page, 'A'), 7);
    assert.ok(await page.$eval('#start', (e) => e.hidden));
  },
  async 'match lineup: pick 7 from each team sheet, line up 7v7, back to classic after'(page) {
    await page.selectOption('#stSize', 'm:sla-ars');
    assert.equal(await count(page, 'H'), 7, 'board preview: the suggested 7');
    await page.selectOption('#stFirst', 'H');
    await page.click('#stGo');
    assert.ok(await page.isVisible('#squad'));
    assert.equal(await page.$$eval('#squad .sq-grid', (g) => g.map((x) => x.children.length).join()), '11,11');
    const on = (t) => page.$$eval(`#squad .sq-team.${t} [aria-pressed="true"]`, (b) => b.length);
    assert.equal(await on('H'), 7);
    await page.click('[data-sq="H7"]'); // an 8th: refused
    assert.match(await page.textContent('#squad .sq-msg'), /have 7/);
    await page.click('[data-sq="H9"]'); // out: 6, can't start
    assert.ok(await page.$eval('[data-sqa="go"]', (b) => b.disabled));
    await page.click('[data-sq="H7"]'); // Madueke in
    await page.click('[data-sq="A1"]'); // no keeper for Slavia: can't start
    assert.ok(await page.$eval('[data-sqa="go"]', (b) => b.disabled));
    await page.click('[data-sq="A1"]');
    await page.click('[data-sqa="go"]');
    assert.ok(await page.$eval('#squad', (e) => e.hidden));
    assert.equal(await count(page, 'H'), 7);
    assert.equal(await count(page, 'A'), 7);
    assert.match(await page.textContent('#score'), /ARS.*SLA/);
    const r = await H(page, () => ({
      ids: Object.keys(window.__hexball.S.pos)
        .filter((id) => id[0] === 'H')
        .sort(),
      ball: window.__hexball.S.ball,
      at: window.__hexball.S.pos[window.__hexball.S.ball],
    }));
    assert.deepEqual(r.ids, ['H1', 'H11', 'H4', 'H5', 'H6', 'H7', 'H8']);
    assert.deepEqual(r.at, [4, 6], 'the most forward pick kicks off on the centre spot');
    assert.equal(r.ball, 'H11', 'Eze (FW, best finisher picked) up front');
    assert.match(await H(page, () => window.__hexball.stateText()), /"lineup":"sla-ars","picks"/);
    await page.evaluate(() => (document.querySelector('#start').hidden = false));
    await page.selectOption('#stSize', '7');
    assert.match(await page.textContent('#score'), /HAR.*NOR/);
  },
  async '5v5, attacking: you kick off with 5 a side'(page) {
    await page.selectOption('#stSize', '5');
    assert.equal(await count(page, 'H'), 5, 'board preview follows the size');
    await page.selectOption('#stFirst', 'H');
    await page.click('#stGo');
    assert.equal(await H(page, () => window.__hexball.S.attack), 'H');
    assert.equal(await count(page, 'A'), 5);
    // no two players on one hex at kick-off
    const hs = await H(page, () => Object.values(window.__hexball.S.pos).map(String));
    assert.equal(new Set(hs).size, hs.length);
  },
  async 'pitch 10 × 15 · goal 4: board, kick-off, keepers, saved states keep the pitch'(page) {
    assert.equal(await page.$$eval('#stPitch option', (o) => o.map((x) => x.textContent).join()), '9 × 13 · goal 3,10 × 15 · goal 4');
    await page.selectOption('#stPitch', 'wide');
    assert.equal(await page.$$eval('#hexes .hx', (l) => l.length), 150, 'board preview: 10 × 15');
    await page.selectOption('#stFirst', 'H');
    await page.click('#stGo');
    const g = await H(page, () => {
      const h = window.__hexball,
        S = h.S;
      return { geo: h.GEO, ko: S.pos[S.ball], gk: [S.pos.H1, S.pos.A1], hs: Object.values(S.pos).map(String) };
    });
    assert.deepEqual(g.geo.goal, [3, 4, 5, 6]);
    assert.deepEqual(g.ko, [4, 7], 'kick-off on the centre spot');
    assert.deepEqual(g.gk, [
      [5, 14],
      [5, 0],
    ]);
    assert.equal(new Set(g.hs).size, g.hs.length, 'no two players on one hex');
    // the centre spot and circle are drawn in the middle of the pitch (between the two middle goal columns)
    const mid = await H(page, () => {
      const c = document.querySelector('#hexes circle.ln').getBoundingClientRect(),
        n = document.querySelector('#hexes .net').getBoundingClientRect();
      return c.left + c.width / 2 - (n.left + n.width / 2);
    });
    assert.ok(Math.abs(mid) < 1, `centre circle ${mid}px off the goal's middle`);
    // a saved state remembers the pitch; loading it on the classic pitch switches back to 10 × 15
    const txt = await H(page, () => window.__hexball.stateText());
    assert.match(txt, /"pitch":"wide"/);
    await H(page, () => window.__hexball.setPitch('classic'));
    await H(page, (t) => window.__hexball.loadState(t), txt);
    assert.equal(await H(page, () => window.__hexball.PITCH), 'wide');
    assert.equal(await page.$$eval('#hexes .hx', (l) => l.length), 150);
  },
  async 'pitch 10 × 15: a whole CPU-vs-CPU match plays out'(page) {
    await H(page, () => {
      const h = window.__hexball;
      document.querySelector('#start').hidden = true;
      h.setSpeed(200);
      h.setPitch('wide');
      h.newGame('sim');
    });
    await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 120000, polling: 200 });
    const r = await H(page, () => {
      const S = window.__hexball.S,
        g = window.__hexball.GEO;
      return { score: S.score, ok: Object.values(S.pos).every(([c, r]) => c >= 0 && c < g.COLS && r >= 0 && r < g.ROWS) };
    });
    assert.ok(r.score.H === 3 || r.score.A === 3);
    assert.ok(r.ok, 'everyone on the pitch');
  },
  async 'defending: their kick-off, you defend first'(page) {
    await page.selectOption('#stFirst', 'A');
    await page.click('#stGo');
    assert.equal(await H(page, () => window.__hexball.S.attack), 'A');
    await page.waitForFunction(() => window.__hexball.S.phase === 'react', null, { timeout: 10000 });
  },
  async 'defence Respond (v2.25): no Prepare, first window after frame 1; Anticipate; Press; Tackle timing game'(page) {
    // v2.39: Respond is the only defence on the start screen (no picker; old saves can still load Prepare)
    assert.equal(await page.$('#stDef'), null);
    await page.selectOption('#stFirst', 'A');
    await H(page, () => window.__hexball.setAutoGo(0));
    // their kick-off varies: start again until the ball is at a man's feet at the first window (for the challenge)
    for (let i = 0; i < 12; i++) {
      await H(page, () => (document.querySelector('#start').hidden = false));
      await page.click('#stGo');
      await page.waitForFunction(() => window.__hexball.S.phase === 'react' && window.__hexball.S.frame, null, {
        timeout: 15000,
      });
      if (await H(page, () => !!window.__hexball.S.ball && !window.__hexball.S.fl)) break;
    }
    assert.equal(await H(page, () => window.__hexball.DEF_MODE), 'respond');
    const fr = await H(page, () => ({ prep: !!window.__hexball.S.frame.prep, k: window.__hexball.S.frame.k }));
    assert.equal(fr.prep, false, 'no Prepare window');
    assert.equal(fr.k, 1, 'the first window comes after frame 1');
    // Anticipate: pick an outfield defender (Harbour defends), the job buttons show, his area lights up
    const d = await H(page, () => {
      const S = window.__hexball.S;
      return Object.keys(S.pos).find((x) => x[0] === 'H' && x !== 'H1' && x !== S.beaten && x !== S.out);
    });
    const [dc, dr] = await H(page, (d) => window.__hexball.S.pos[d], d);
    // v2.43: defending is on the board: tap picks him, tap him again for Anticipate
    await page.click(`[data-k="${dc},${dr}"]`);
    await page.click(`[data-k="${dc},${dr}"]`);
    assert.ok(await page.isVisible('[data-a="antic"]'));
    await page.click('[data-a="antic"]');
    assert.equal(await H(page, () => window.__hexball.S.read && window.__hexball.S.read.pid), d);
    // v2.54: a gold dashed ring on his own token (it moves with him), no hex fill
    assert.equal((await page.$$('.tok.reading')).length, 1, 'v2.54: his token shows the read');
    assert.match(await page.$eval('#panel', (e) => e.textContent), /Reading: #/);
    await page.click('[data-a="dundo"]');
    assert.equal(await H(page, () => window.__hexball.S.read), null, 'Undo takes the read back');
    // a challenge: put a defender next to the man on the ball (ball at his feet) and open his jobs
    const c = await H(page, () => {
      const S = window.__hexball.S;
      if (!S.ball || S.fl) return null;
      const b = S.pos[S.ball],
        D = b[1] & 1 ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
        free = (h) => h[0] >= 0 && h[1] >= 0 && !Object.values(S.pos).some((p) => p[0] === h[0] && p[1] === h[1]),
        h = D.map(([x, y]) => [b[0] + x, b[1] + y]).find(free); // any free hex next to him (the CPU's plan varies)
      if (!h) return null;
      S.pos.H6 = h;
      window.__hexball.render();
      return h;
    });
    assert.ok(c, 'set up a defender next to the man on the ball');
    {
      // v2.43: pick the defender, then tap the man on the ball: Tackle / Press / Mark open next to him
      const bh = await H(page, () => window.__hexball.S.pos[window.__hexball.S.ball]);
      const challenge = async () => {
        await page.click(`[data-k="${c[0]},${c[1]}"]`);
        await page.click(`[data-k="${bh[0]},${bh[1]}"]`);
      };
      await challenge();
      assert.ok(await page.isVisible('[data-a="ctackle"]'));
      await page.click('[data-a="cpress"]');
      assert.equal(await H(page, () => window.__hexball.S.press.pid), 'H6');
      await challenge();
      await page.click('[data-a="ctackle"]');
      // v2.45: the tackle is queued and goes in on Go; v2.35: no green-zone game, it's a normal contest, and
      // v2.51: only a close one (35–65%) opens the duel mini-game
      assert.equal(await H(page, () => window.__hexball.S.tkPend), 'H6');
      await page.click('[data-a="rgo"]');
      await page.waitForFunction(
        () => {
          const g = window.__hexball.S.glog.map((l) => l.t).join('\n');
          if (/TACKLE H6|contest tackle H6|DUEL tackle H6/.test(g)) return true;
          const d = document.querySelector('#duel');
          if (d && !d.hidden) d.click(); // a close tackle: tap through the mini-game
          return false;
        },
        null,
        { timeout: 15000, polling: 100 },
      );
    }
  },
  async 'defence Respond: a whole CPU-vs-CPU match plays out'(page) {
    await H(page, () => {
      // seeded like replay match 0 (7v7, the CPU reads 9 times): an unseeded match sometimes has no read at all
      let a = 1000;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const h = window.__hexball;
      document.querySelector('#start').hidden = true;
      h.setSize(7);
      h.setSpeed(200);
      h.setDef('respond');
      h.newGame('sim');
    });
    await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 150000, polling: 200 });
    const g = await H(page, () => window.__hexball.S.glog.map((l) => l.t).join('\n'));
    assert.doesNotMatch(g, /prepare /, 'no Prepare in respond mode');
    assert.match(g, / read \w+@/, 'the CPU reads the play');
  },
  async 'random: both sides come up'(page) {
    const seen = new Set();
    for (let i = 0; i < 16 && seen.size < 2; i++) {
      await H(page, () => (document.querySelector('#start').hidden = false));
      await page.click('#stGo');
      seen.add(await H(page, () => window.__hexball.S.attack));
    }
    assert.equal(seen.size, 2);
  },
  async 'more: hidden until opened; paste box, presets; vs Friend = hotseat'(page) {
    assert.ok(!(await page.isVisible('#loadState2')));
    await page.click('.st-more summary');
    await page.click('#loadState2');
    assert.ok(await page.isVisible('#statebox textarea'));
    await page.click('[data-sb="close"]');
    await page.click('[data-scn="wingCross"][data-scm="defend"]');
    assert.equal(await H(page, () => window.__hexball.S.scenario.k), 'wingCross');
    await H(page, () => {
      document.querySelector('#gate').hidden = true; // the hotseat hand-over screen from the last preset
      document.querySelector('#start').hidden = false;
    });
    await page.click('[data-scn="attackOn"]');
    assert.equal(await H(page, () => window.__hexball.S.ball), 'A11');
    // back to the menu: the preview goes back to the size on the screen
    await H(page, () => {
      const h = window.__hexball;
      h.S.phase = 'over';
      h.render();
      document.querySelector('#bar [data-a="again"]').click();
    });
    assert.equal(await H(page, () => window.__hexball.SIZE), 7);
    await page.click('[data-vs="hot"]');
    await page.click('#stGo');
    assert.equal(await H(page, () => window.__hexball.S.mode), 'hot');
    assert.ok(await page.isVisible('#gate'));
  },
};
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  const { page, errors } = await open();
  try {
    await fn(page);
    assert.deepEqual(errors, [], 'page errors');
    console.log('  ok  ', name);
  } catch (e) {
    failed++;
    console.log('  FAIL', name, '\n       ', e.message.split('\n')[0], (e.stack.match(/test\/\w+\.mjs:\d+/) || [''])[0], errors.join(' / '));
  }
  await page.close();
}
// CPU vs CPU at each size: full matches with no page errors
for (const size of [5, 6, 7, 'sla-ars']) {
  let turns = 0,
    goals = 0;
  const N = +(process.argv[2] || 3);
  for (let m = 0; m < N; m++) {
    const { page, errors } = await open();
    await H(
      page,
      (n) => {
        document.querySelector('#start').hidden = true;
        if (typeof n === 'string') window.__hexball.setLineup(n);
        else window.__hexball.setSize(n);
        window.__hexball.setSpeed(200);
        window.__hexball.newGame('sim');
      },
      size,
    );
    await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 300000, polling: 200 });
    const r = await H(page, () => ({
      t: window.__hexball.S.turn,
      s: window.__hexball.S.score,
      n: Object.keys(window.__hexball.S.pos).length,
    }));
    turns += r.t;
    goals += r.s.H + r.s.A;
    if (errors.length || r.n !== (typeof size === 'string' ? 7 : size) * 2) {
      failed++;
      console.log(`  FAIL sim ${size}v${size}`, errors, r.n);
    }
    await page.close();
  }
  console.log(
    `  sim ${typeof size === 'string' ? size + ' 7v7' : size + 'v' + size}: ${N} matches · ${(turns / N).toFixed(1)} turns · ${(goals / N).toFixed(1)} goals a match`,
  );
}
await b.close();
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('start screen tests passed');
