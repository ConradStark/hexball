// Browser smoke tests against dist/hexball.test.html. Run: npm test (after npm run build).
// Each scenario plays real taps through the UI and fails on any page error or broken expectation.
// Playwright is a dev dependency (npm install; npx playwright install chromium once).
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
import assert from 'assert/strict';

const FILE = process.argv[2] || 'dist/hexball.test.html';
const html = fs.readFileSync(FILE, 'utf8');
const RESET = '<style>[hidden]{display:none!important}body{margin:0}</style>'; // what the artifact host adds

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 412, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${RESET}</head><body>${html}</body></html>`,
  );
  await page.evaluate(() => window.__hexball.setAutoGo(0)); // pauses wait for Go (no timer races in tests)
  return { page, errors };
}
const text = (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\n/g, ' | '));
const tap = (page, c, r) => page.click(`[data-k="${c},${r}"]`);
const S = (page, fn) => page.evaluate(fn);
// v2 start screen: vs CPU / vs Friend, who starts (H attack, A defend), Kick off; presets live under More
async function start(page, vs = 'hot', first = 'H') {
  await page.click(`[data-vs="${vs}"]`);
  await page.selectOption('#stFirst', first);
  await page.click('#stGo');
}
async function preset(page, sel) {
  await page.evaluate(() => (document.querySelector('.st-more').open = true));
  await page.click(sel);
}

// Plays out the current turn: taps through duels, presses Go at every defence pause, until a pass-the-device gate.
async function playOut(page, onPrompt) {
  let n = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    await page.waitForTimeout(80);
    if (await page.$('#duel:not([hidden])')) {
      await page.mouse.click(206, 430);
      continue;
    }
    if (await page.$('#gate:not([hidden])')) return n;
    const go = await page.$('[data-a="rgo"]');
    if (go) {
      n++;
      if (onPrompt) await onPrompt(n);
      if (await page.$('[data-a="rgo"]')) await page.click('[data-a="rgo"]');
    }
  }
  throw new Error('turn did not finish');
}

const scenarios = {
  async 'plan limits: double run, 3 movers, a dribble counts as a mover, one pass a turn'(page) {
    await start(page);
    await page.click('#gateGo');
    await tap(page, 7, 8);
    await tap(page, 7, 5); // #8 runs
    await tap(page, 7, 5);
    await tap(page, 7, 2); // 3 hexes: too far for a second run (max 2)
    assert.doesNotMatch(await text(page, '#panel'), /double/);
    await tap(page, 7, 5); // v2.34: nothing stays selected, so pick him again
    await tap(page, 6, 4); // #8 runs again (double), 2 hexes
    assert.match(await text(page, '#panel'), /double: #8/);
    await tap(page, 1, 8);
    await tap(page, 1, 6); // runner 2
    await tap(page, 2, 10);
    await tap(page, 2, 8); // runner 3
    await tap(page, 4, 9);
    await tap(page, 4, 8); // 4th runner (#10) refused
    assert.match(await text(page, '#bar'), /Up to 3 players move/);
    await tap(page, 4, 6);
    await tap(page, 4, 5); // a dribble by #9 is a 4th mover: refused too
    assert.match(await text(page, '#bar'), /Up to 3 players move/);
    assert.equal(await S(page, () => window.__hexball.S.plan.length), 4);
    await tap(page, 4, 6);
    await tap(page, 6, 4); // touch 1: into #8's run → Through / Pass (v2.32: two choices; no Cross from the middle)
    const pop = await text(page, '#pop');
    assert.match(pop, /through[\s\S]*pass/i, pop); // innerText follows CSS text-transform, so ignore case
    assert.match(pop, /through ball goes now[\s\S]*a pass is held/i, pop);
    assert.ok(!(await page.$('[data-a="sp"][data-v="cross"]')));
    await page.click('[data-a="sp"][data-v="through"]'); // v2.30: straight into the plan, ground (2 hexes)
    const pass = await S(page, () => window.__hexball.S.plan.find((a) => a.type === 'pass'));
    assert.equal(pass.through, true);
    assert.equal(pass.kind, 'ground');
    // v2.24: a ground pass gives the receiver one more pass or shot, first time
    assert.match(await text(page, '#bar'), /can pass or shoot again first time/);
    const panel = await text(page, '#panel');
    assert.match(panel, /Pass\/shot 1\/2/);
    assert.match(panel, /Moving 3\/3/);
  },
  async 'kicks (v2.24): a ground pass gives the receiver one more pass or shot; then that is the turn'(page) {
    await start(page);
    await page.click('#gateGo');
    await tap(page, 4, 6);
    await tap(page, 3, 6); // #9 dribbles 1
    await tap(page, 3, 6); // v2.34: nothing stays selected after a dribble: tap him again
    await tap(page, 1, 8); // pass back to #6: v2.30 ground (2 hexes), one Pass button
    await page.click('[data-a="pk"][data-v="ground"]');
    assert.match(await text(page, '#panel'), /Pass\/shot 1\/2/);
    assert.match(await text(page, '#bar'), /can pass or shoot again first time/);
    await tap(page, 1, 8);
    await tap(page, 2, 10); // #6 passes again, first time, to #2
    assert.ok(await page.isVisible('#pop [data-a="pk"]'), 'the second pass is offered');
    assert.ok(!(await page.isVisible('#pop [data-a="pgng"]')), 'no card as the second kick');
    await page.click('[data-a="pk"][data-v="ground"]');
    let p = await S(page, () => window.__hexball.S.plan.map((a) => `${a.type}${a.ball ? '*' : ''}`).join(' '));
    assert.equal(p, 'move* pass* pass*');
    assert.match(await text(page, '#panel'), /Pass\/shot 2\/2/);
    await tap(page, 2, 10);
    await tap(page, 4, 9); // a third: not offered (he only dribbles)
    p = await S(page, () => window.__hexball.S.plan.length);
    assert.equal(p, 3);
  },
  async 'kicks (v2.24): after a lob the receiver can dribble on but not pass again'(page) {
    await start(page);
    await page.click('#gateGo');
    await tap(page, 4, 6);
    await tap(page, 4, 5); // #9 dribbles 1 …
    await tap(page, 4, 5);
    await tap(page, 1, 8); // … then it's 5 hexes to #6: v2.30 that's a lob
    assert.equal(await page.$$eval('#pop [data-a="pk"]', (l) => l.map((e) => e.dataset.v).join()), 'lob');
    await page.click('[data-a="pk"][data-v="lob"]');
    assert.match(await text(page, '#panel'), /Pass\/shot 1\/1/);
    await tap(page, 1, 8);
    await tap(page, 1, 7); // #6 dribbles on
    await tap(page, 1, 7);
    await tap(page, 4, 9); // a second pass: not offered
    // (a closed pop-up keeps its old buttons in the DOM, so check what's visible)
    assert.ok(!(await page.isVisible('#pop [data-a="pk"]')), 'no second pass after a lob');
    assert.equal(await S(page, () => window.__hexball.S.ui.sel), 'H10', 'the tap just picks #10 to move');
    const p = await S(page, () => window.__hexball.S.plan.map((a) => `${a.type}${a.ball ? '*' : ''}`).join(' '));
    assert.equal(p, 'move* pass* move*');
  },
  async 'cross (v2.32, v2.41): winger out wide, shoot first time = header; no rest; runs after the shot; clean board'(page) {
    await start(page);
    await page.click('#gateGo');
    await S(page, () => {
      const s = window.__hexball.S;
      s.pos.H6 = [0, 3]; // #6 is a winger (v2.41: only wingers cross)
      s.pos.H9 = [5, 2]; // 5 hexes: a lofted cross (v2.30), so a header
      s.ball = 'H6';
      window.__hexball.render();
    });
    await tap(page, 0, 3);
    await tap(page, 5, 2);
    // v2.32: a normal option, not a card: Cross · shoot (first time) or Cross · wait (a pass he controls)
    assert.match(await text(page, '#pop'), /cross · shoot[\s\S]*cross · wait/i);
    await page.click('[data-a="pcross"][data-v="lob"]');
    assert.match(await text(page, '#pop'), /header, harder to place/);
    await page.click('[data-a="zone"][data-v="4"]');
    await tap(page, 4, 9);
    await tap(page, 4, 7); // run added after the shot
    assert.match(await text(page, '#panel'), /Moving 1\/3/);
    await page.click('[data-a="lock"]');
    assert.deepEqual(await S(page, () => window.__hexball.S.cool.H), [], 'the Cross rests nothing');
    await page.click('#gateGo');
    await playOut(page);
    assert.equal(await page.$eval('#ov', (e) => e.innerHTML), '', 'lines left on the board after the turn');
  },
  async 'defence (Respond): no Prepare; first window after frame 1: mark, 2-hex move, undo'(page) {
    await start(page);
    await page.click('#gateGo');
    await tap(page, 7, 8);
    await tap(page, 7, 5);
    await tap(page, 4, 6);
    await tap(page, 7, 5);
    await page.click('[data-a="sp"][data-v="pass"]'); // v2.30: ground or air by distance
    await page.click('[data-a="lock"]');
    await page.click('#gateGo');
    await page.evaluate(() => window.__hexball.seed(7)); // fixed dice: the same play every run
    let sent = false;
    await playOut(page, async (n) => {
      if (n !== 1) return;
      // v2.34/v2.39 Respond: the attack moves first, no Prepare; the first window comes after frame 1
      assert.deepEqual(await S(page, () => ({ prep: !!window.__hexball.S.frame.prep, k: window.__hexball.S.frame.k })), {
        prep: false,
        k: 1,
      });
      assert.match(await text(page, '#panel'), /window 1[\s\S]*Moved 0\/3/i);
      // v2.43 on the board: tap #11, then an attacker he can pick up → Mark
      const pick = await S(page, () => {
        const h = window.__hexball,
          s = h.S;
        const a = ['H9', 'H8', 'H10', 'H6', 'H2', 'H5'].find((x) => s.pos[x] && h.canMark('A11', x));
        const mv = [...h.reach(h.baseSt(), 'A8', 2).values()].find((i) => i.d === 2);
        return { d: s.pos.A11, a: a && s.pos[a], p8: s.pos.A8, to: mv && mv.h };
      });
      if (pick.a) {
        await tap(page, ...pick.d);
        await tap(page, ...pick.a);
        await page.click('[data-a="cmark"]');
        assert.match(await text(page, '#panel'), /Mark: #11/);
      }
      // send #8 to a hex exactly 2 away, undo it, then send him again
      await tap(page, ...pick.p8);
      await tap(page, ...pick.to);
      assert.match(await text(page, '#panel'), /Moved 1\/3/);
      await page.click('[data-a="dundo"]');
      assert.match(await text(page, '#panel'), /Moved 0\/3/);
      assert.equal(await S(page, () => window.__hexball.S.orders.filter((o) => !o.done).length), 0);
      await tap(page, ...pick.p8);
      await tap(page, ...pick.to);
      assert.match(await text(page, '#panel'), /Moved 1\/3/);
      sent = true;
    });
    assert.ok(sent, 'never got a defence pause');
  },
  async 'save state: copy at turn start, load, same choices replay the same log'(page) {
    await start(page);
    await page.click('#gateGo');
    const snap = await S(page, () => window.__hexball.stateText());
    const play = async () => {
      await tap(page, 1, 8);
      await tap(page, 1, 5); // run
      await tap(page, 4, 6);
      await tap(page, 7, 8);
      await page.click('#pop [data-a="pk"]'); // v2.30: one Pass button, ground or air by distance
      await page.click('[data-a="lock"]');
      await page.click('#gateGo');
      await playOut(page);
      return S(page, () => window.__hexball.S.glog.map((l) => l.t).filter((t) => t.startsWith('T1')));
    };
    const first = await play();
    assert.match(snap, /HEXBALL STATE/);
    await page.evaluate((t) => window.__hexball.loadState(t), snap);
    await page.click('#gateGo');
    const second = await play();
    assert.deepEqual(
      second.filter((t) => !t.includes('LOADED')),
      first,
    );
    assert.ok(
      first.some((t) => t.includes('PLAN run H6')),
      'plan logged',
    );
  },
  async 'scenario: defend the wing cross, result box, retry with the same dice'(page) {
    const once = async () => {
      await page.click('#gateGo'); // defence gate
      assert.match(await text(page, '#panel'), /Prepare/i);
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        await page.waitForTimeout(80);
        if (await page.$('#scnend:not([hidden])')) break;
        if (await page.$('#duel:not([hidden])')) {
          await page.mouse.click(206, 430);
          continue;
        }
        const g = await page.$('[data-a="rgo"]');
        if (g) await g.click();
      }
      return text(page, '#scnend');
    };
    await preset(page, '[data-scn="wingCross"][data-scm="defend"]');
    const r1 = await once();
    assert.match(r1, /Attempts: \S/);
    assert.match(
      await S(page, () => window.__hexball.S.glog.map((l) => l.t).join('\n')),
      /PLAN .*cross ground H8>H6 TR/,
    );
    await page.click('[data-se="same"]');
    const r2 = await once();
    assert.match(r2, /Attempts: .+ · .+/);
  },
  async 'start on defence: their kick-off, and an attack in progress'(page) {
    await start(page, 'cpu', 'A');
    await page.waitForFunction(() => window.__hexball.S.phase === 'react', null, { timeout: 10000 });
    assert.equal(await S(page, () => window.__hexball.S.attack), 'A');
    await page.evaluate(() => (document.querySelector('#start').hidden = false));
    await preset(page, '[data-scn="attackOn"]');
    await page.waitForFunction(() => window.__hexball.S.phase === 'react', null, { timeout: 10000 });
    const st = await S(page, () => ({
      a: window.__hexball.S.attack,
      b: window.__hexball.S.ball,
      plan: window.__hexball.S.plan.length,
    }));
    assert.equal(st.a, 'A');
    assert.equal(st.b, 'A11');
    assert.ok(st.plan > 0, 'CPU planned an attack');
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      await page.waitForTimeout(80);
      const ph = await S(page, () => window.__hexball.S.phase);
      if ((await S(page, () => window.__hexball.S.turn)) > 1) break;
      if (await page.$('#duel:not([hidden])')) {
        await page.mouse.click(206, 430);
        continue;
      }
      const g = await page.$('[data-a="rgo"]');
      if (g) await g.click();
    }
    assert.ok((await S(page, () => window.__hexball.S.turn)) > 1, 'the turn played out');
  },
  async 'vs CPU: plays to full time'(page) {
    await start(page, 'cpu', 'H');
    await S(page, () => window.__hexball.setSpeed(40)); // the whole match: only the flow matters here
    const t0 = Date.now();
    while (Date.now() - t0 < 200000) {
      await page.waitForTimeout(60);
      const ph = await S(page, () => window.__hexball.S.phase);
      if (ph === 'over') return;
      if (await page.$('#duel:not([hidden])')) {
        await page.mouse.click(206, 430);
        continue;
      }
      if (ph === 'plan') {
        await S(page, () => {
          window.__hexball.cpuPlanB();
          window.__hexball.render();
        });
        const ok = await page
          .click('[data-a="lock"]', { timeout: 3000 })
          .then(() => true)
          .catch(() => false);
        if (!ok)
          console.log(
            'DEBUG lock',
            await S(page, () =>
              JSON.stringify({
                ph: window.__hexball.S.phase,
                plan: window.__hexball.S.plan,
                ball: window.__hexball.S.ball,
                loose: window.__hexball.S.loose,
                t: window.__hexball.S.turn,
              }),
            ),
          );
        continue;
      }
      if (ph === 'react') {
        const g = await page.$('[data-a="rgo"]');
        if (g) await g.click();
      }
      // v2.47 Reshape (on by default): after a turn, move up to 3 players or just carry on
      if (ph === 'shape') {
        const d = await page.$('[data-a="shdone"]');
        if (d) await d.click();
      }
    }
    throw new Error(
      'match did not finish: ' +
        (await S(page, () => JSON.stringify({ ph: window.__hexball.S.phase, t: window.__hexball.S.turn, gate: !document.querySelector('#gate').hidden, bar: (document.querySelector('#bar') || {}).innerText }))),
    );
  },
};

const only = process.argv[3];
const browser = await chromium.launch();
let failed = 0;
for (const [name, fn] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue;
  const { page, errors } = await open(browser);
  try {
    await fn(page);
    assert.deepEqual(errors, [], 'page errors');
    console.log('  ok  ', name);
  } catch (e) {
    failed++;
    console.log(
      '  FAIL',
      name,
      '\n       ',
      e.message.split('\n')[0], (e.stack.match(/test\/\w+\.mjs:\d+/) || [''])[0],
      errors.length ? `\n        page errors: ${errors.join(' / ')}` : '',
    );
  }
  await page.close();
}
await browser.close();
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('all smoke tests passed');
