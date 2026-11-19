// v2.1 game screen: step list with ×, retry my last attack, win all duels. Run: node test/ui.mjs
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
const tap = (page, c, r) => page.click(`[data-k="${c},${r}"]`);
async function attackFirst(page) {
  await page.selectOption('#stFirst', 'H');
  await page.click('#stGo');
  await page.waitForFunction(() => window.__hexball.S.phase === 'plan');
}
// a run for #8 and a pass into it from #9
async function twoSteps(page) {
  await tap(page, 7, 8);
  await tap(page, 7, 5);
  await tap(page, 4, 6);
  await tap(page, 7, 5);
  await page.click('[data-a="sp"][data-v="pass"]');
  await page.click('[data-a="pk"][data-v="ground"]');
}
// play until it's our plan again or a defence pause
async function playUntil(page, done) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(80);
    if (await H(page, done)) return;
    if (await page.$('#duel:not([hidden])')) {
      await page.mouse.click(195, 430);
      continue;
    }
    const g = await page.$('#bar [data-a="rgo"]');
    if (g) await g.click().catch(() => {});
  }
  throw new Error(
    'timed out ' +
      JSON.stringify(
        await H(page, () => ({
          ph: window.__hexball.S.phase,
          t: window.__hexball.S.turn,
          a: window.__hexball.S.attack,
          g: window.__hexball.S.glog.slice(-4).map((l) => l.t),
        })),
      ),
  );
}
const tests = {
  async 'header: Hex FC logo, score centred, turn + Attacking tag top right'(page) {
    await attackFirst(page);
    assert.match(await page.$eval('#status .tn', (e) => e.textContent), /Turn 1/);
    assert.equal(await page.$eval('#status .stt', (e) => e.textContent), 'Attacking');
    assert.match(await page.$eval('#score', (e) => e.textContent), /HAR0–0NOR/);
    // score sits in the middle of the header, turn block on the right edge
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect(),
        t = r('.top'),
        sc = r('#score'),
        st = r('#status');
      return { mid: sc.left + sc.width / 2 - (t.left + t.width / 2), right: t.right - st.right };
    });
    assert.ok(Math.abs(g.mid) < 4, `score off centre by ${g.mid}px`);
    assert.ok(g.right < 2, `turn block ${g.right}px from the right edge`);
  },
  async 'tap a space: Through / Pass / Cross window below the hex, then ground or air'(page) {
    await attackFirst(page);
    await tap(page, 4, 6); // #9 on the ball
    await tap(page, 5, 3); // empty space ahead of him, beyond his dribble
    const pop = await page.$eval('#pop', (e) => e.className);
    assert.match(pop, /spw/);
    // the window opens below the tapped hex (towards our own goal), so the goal side stays visible
    const g = await page.evaluate(() => {
      const p = document.querySelector('#pop').getBoundingClientRect(),
        h = document.querySelector('[data-k="5,3"]').getBoundingClientRect();
      return { popTop: p.top, hexBottom: h.bottom };
    });
    assert.ok(g.popTop >= g.hexBottom - 2, `window starts ${g.hexBottom - g.popTop}px above the hex's bottom edge`);
    // empty space: Pass needs a runner, Cross isn't on from the middle; tapping them explains why
    assert.equal(await page.$eval('[data-a="sp"][data-v="pass"]', (e) => e.getAttribute('aria-disabled')), 'true');
    await page.click('[data-a="sp"][data-v="pass"]', { force: true }); // greyed out (aria-disabled) but tappable
    assert.match(await page.$eval('#pop', (e) => e.textContent), /plan a run to this hex first/);
    await page.click('[data-a="sp"][data-v="cross"]', { force: true });
    assert.match(await page.$eval('#pop', (e) => e.textContent), /isn't out wide/);
    assert.ok((await page.$$('#hl .h-cross')).length > 6, 'crossing areas not highlighted');
    assert.match(await page.$eval('#hl', (e) => e.textContent), /Cross from these areas/);
    // through ball → ground / in the air → into the plan
    await page.click('[data-a="sp"][data-v="through"]');
    assert.equal(await page.$$eval('#pop [data-a="pk"]', (l) => l.length), 2);
    await page.click('[data-a="pk"][data-v="ground"]');
    const a = await H(page, () => window.__hexball.S.plan[0]);
    assert.equal(a.type, 'pass');
    assert.equal(a.to, null);
    assert.deepEqual(a.target, [5, 3]);
  },
  async 'v2.28: the man on the ball shows his dribble hexes; tap the hex again to pass there, again to dribble'(page) {
    await attackFirst(page);
    await tap(page, 4, 6); // #9 on the ball
    assert.equal(await page.$$eval('[data-a="pv"]', (l) => l.length), 0, 'no Move / Pass toggle');
    assert.ok((await page.$$('#hl .h-good, #hl .h-mid, #hl .h-bad')).length > 0, 'dribble hexes shown');
    assert.equal(await page.$$eval('#ovTop .chip', (l) => l.length), 0, 'v2.27: no colour chips');
    const plan = () => H(page, () => window.__hexball.S.plan.map((a) => a.type + (a.ball ? '*' : '')).join(','));
    await tap(page, 4, 5); // dribble one hex
    assert.equal(await plan(), 'move*');
    await tap(page, 4, 5); // again: a pass into that space instead
    assert.equal(await plan(), '');
    assert.ok(await page.isVisible('#pop [data-a="sp"]'), 'the space window is open');
    assert.deepEqual(await H(page, () => window.__hexball.S.ui.tB), [4, 5]);
    await tap(page, 4, 5); // and again: back to the dribble
    assert.equal(await plan(), 'move*');
    await page.click('[data-a="undo"]');
    await tap(page, 4, 6);
    // pick #10: a coloured arrow; defenders who can contest get a red ring
    await tap(page, 4, 9);
    assert.match(await page.$eval('#ov .parrow', (e) => e.getAttribute('class')), /safe|risky|long/);
    // danger toggle: shades the hexes defenders can reach; remembered
    await page.click('[data-a="pclose"]').catch(() => {});
    assert.equal(await page.$eval('#dangerBtn', (e) => e.hidden), false);
    await page.click('#dangerBtn');
    assert.ok((await page.$$('#hl .h-dz1, #hl .h-dz2')).length > 10, 'danger zone shaded');
    await page.click('#dangerBtn');
    assert.equal((await page.$$('#hl .h-dz1, #hl .h-dz2')).length, 0);
  },
  async 'kicks (v2.24): after a ground pass the receiver plays it on at once (no control touch)'(page) {
    await attackFirst(page);
    await tap(page, 4, 6);
    await tap(page, 4, 9); // #9 ground pass to #10
    await page.click('[data-a="pk"][data-v="ground"]');
    await tap(page, 4, 9);
    await tap(page, 6, 10); // #10 on to #5, first time
    await page.click('[data-a="pk"][data-v="ground"]');
    await page.click('[data-a="lock"]');
    await page.waitForFunction(() => window.__hexball.S.turn > 1 || window.__hexball.S.phase === 'over', null, {
      timeout: 60000,
    });
    const g = await H(page, () => window.__hexball.S.glog.map((l) => l.t).filter((l) => l.startsWith('T1.')));
    const recv = g.find((l) => / recv H10@/.test(l)),
      second = g.find((l) => / ground H10@/.test(l));
    // played on the next frame (the old control touch held it one frame more)
    if (recv && second) assert.equal(+/^T1\.f(\d+)/.exec(second)[1], +/^T1\.f(\d+)/.exec(recv)[1] + 1, g.join('\n'));
    else assert.ok(g.some((l) => /WON|scatter|loose|pounce/.test(l)), `the first pass was neither received nor lost:\n${g.join('\n')}`);
  },
  async 'tap a space: no red defender tint on the pitch while planning'(page) {
    await attackFirst(page);
    await tap(page, 4, 6);
    assert.equal((await page.$$('#hl .h-zone')).length, 0);
  },
  async 'steps: list with ×; removing a step clears the ones after it'(page) {
    await attackFirst(page);
    await twoSteps(page);
    assert.equal(await page.$$eval('#panel .plan li', (l) => l.length), 2);
    assert.equal(await page.$$eval('#panel .rm', (l) => l.length), 2);
    await page.click('#panel .rm[data-v="1"]'); // remove the pass only
    assert.equal(await H(page, () => window.__hexball.S.plan.length), 1);
    await twoSteps(page);
    await page.click('#panel .rm[data-v="0"]'); // remove the run: the pass into it goes too
    assert.equal(await H(page, () => window.__hexball.S.plan.length), 0);
    assert.ok(await page.$eval('#bar [data-a="lock"]', (e) => e.disabled));
  },
  async 'undo left, play right'(page) {
    await attackFirst(page);
    const l = await page.$eval('#bar [data-a="undo"]', (e) => e.getBoundingClientRect().x);
    const r = await page.$eval('#bar [data-a="lock"]', (e) => e.getBoundingClientRect().x);
    assert.ok(r - l > 200, `${l} ${r}`);
  },
  async 'more: collapsed; retry my last attack goes back to turn 1 with new dice'(page) {
    await attackFirst(page);
    assert.ok(!(await page.isVisible('#log')));
    await page.click('#more summary');
    await page.waitForSelector('#feed .pn-l, #feed .fd-turn', { state: 'visible' });
    assert.ok(await page.$eval('#rewind', (e) => e.disabled), 'nothing played yet');
    const seed1 = await H(page, () => window.__hexball.S.seed);
    await twoSteps(page);
    await page.click('#bar [data-a="lock"]');
    await playUntil(page, () => {
      const s = window.__hexball.S;
      return s.turn > 1 && (s.phase === 'plan' || s.phase === 'react' || s.phase === 'over');
    });
    assert.ok(!(await page.$eval('#rewind', (e) => e.disabled)), 'retry offered');
    await page.click('#rewind');
    const s = await H(page, () => ({
      t: window.__hexball.S.turn,
      a: window.__hexball.S.attack,
      ph: window.__hexball.S.phase,
      plan: window.__hexball.S.plan.length,
      seed: window.__hexball.S.seed,
      log: window.__hexball.S.glog.map((l) => l.t).join('\n'),
    }));
    assert.equal(s.t, 1);
    assert.equal(s.a, 'H');
    assert.equal(s.ph, 'plan');
    assert.equal(s.plan, 0);
    assert.notEqual(s.seed, seed1);
    assert.match(s.log, /REWIND to turn 1/);
    assert.match(s.log, /PLAN run H8/, 'log kept');
  },
  async 'go back one turn: back to the CPU attack; same dice = same CPU plan'(page) {
    await page.selectOption('#stFirst', 'A');
    await page.click('#stGo');
    const log = () => H(page, () => window.__hexball.S.glog.map((l) => l.t));
    // play the CPU's attack (as many turns as it keeps the ball) until it's our plan
    await playUntil(page, () => window.__hexball.S.attack === 'H' && window.__hexball.S.phase === 'plan');
    const before = await H(page, () => window.__hexball.S.snaps.map((s) => ({ t: s.turn, seed: s.seed })));
    const prev = before[before.length - 2]; // the CPU's last attacking turn
    const plan1 = (await log()).find((t) => t.startsWith(`T${prev.t} PLAN `));
    await page.click('#more summary');
    assert.ok(await page.isVisible('#back1'));
    await page.check('#sameDice');
    await page.click('#back1');
    const s = await H(page, () => ({
      t: window.__hexball.S.turn,
      a: window.__hexball.S.attack,
      seed: window.__hexball.S.seed,
    }));
    assert.deepEqual(s, { t: prev.t, a: 'A', seed: prev.seed });
    await playUntil(page, () => {
      const g = window.__hexball.S.glog.map((l) => l.t);
      return g.slice(g.findIndex((t) => /^REWIND/.test(t))).some((t) => / PLAN /.test(t));
    });
    const g = await log(),
      after = g.slice(g.findIndex((t) => /^REWIND/.test(t)));
    assert.match(after[0], /REWIND to turn \d+ \(same dice\)/);
    assert.equal(
      after.find((t) => / PLAN /.test(t)),
      plan1,
      'the CPU plays the same plan',
    );
  },
  async 'curl: from past the right post the shot bends left first, then right into the corner'(page) {
    await attackFirst(page);
    const r = await H(page, () => {
      const h = window.__hexball,
        G = h.px(4, 0),
        T = [G[0] + 25, G[1] - 10], // top right corner (Harbour attack up: right = screen right)
        wide = h.curlCtrl(h.px(8, 3), T), // shooter past the right post
        mid = h.curlCtrl(h.px(4, 4), T); // central
      return { wide: wide[0] - (h.px(8, 3)[0] + T[0]) / 2, mid: mid[0] - (h.px(4, 4)[0] + T[0]) / 2 };
    });
    assert.ok(r.wide < 0, `bulges left of the line (${r.wide})`);
    assert.ok(r.mid > 0, `central: bends out to the corner side (${r.mid})`);
  },
  async 'prepare: stepping onto the loose ball wins it at once (no Go)'(page) {
    await page.selectOption('#stFirst', 'A');
    await page.click('#stGo');
    await page.waitForFunction(() => window.__hexball.S.frame && window.__hexball.S.frame.prep, null, {
      timeout: 30000,
    });
    // put the ball loose next to one of our defenders
    const p = await H(page, () => {
      const h = window.__hexball,
        s = h.S,
        def = s.attack === 'H' ? 'A' : 'H',
        d = Object.keys(s.pos).find((x) => x[0] === def && h.PLrole(x) !== 'GK'),
        to = [...h.reach(h.baseSt(), d, 1).values()][0].h;
      s.ball = null;
      s.loose = to.slice();
      h.render();
      return { d, from: s.pos[d], to };
    });
    await tap(page, ...p.from);
    await tap(page, ...p.to);
    await page.waitForFunction(
      (d) => window.__hexball.S.glog.some((l) => new RegExp(`WON ${d}.*loose ball first`).test(l.t)),
      p.d,
      {
        timeout: 10000,
      },
    );
  },
  async 'win all duels: your contests always go your way'(page) {
    await attackFirst(page);
    await page.click('#more summary');
    await page.check('#winAll');
    assert.match(await page.$eval('#status', (e) => e.textContent), /Practice/);
    // a Northgate defender standing on #10, then a pass to #10: a contest Harbour must win
    await H(page, () => {
      const h = window.__hexball;
      h.S.pos.A4 = h.S.pos.H10.slice();
      h.render();
    });
    const t = await H(page, () => window.__hexball.S.pos.H10);
    await tap(page, 4, 6);
    await tap(page, ...t);
    await page.click('[data-a="pk"][data-v="ground"]');
    await H(page, () => window.__hexball.seed(3)); // fixed dice: the CPU's Prepare is the same every run
    await page.click('#bar [data-a="lock"]');
    await playUntil(page, () => /win all duels/.test(window.__hexball.S.glog.map((l) => l.t).join('\n')));
    const log = await H(page, () => window.__hexball.S.glog.map((l) => l.t).join('\n'));
    assert.match(log, /> ATT \(win all duels\)/);
    assert.doesNotMatch(log, /> DEF \(win all duels\)/);
  },
  async 'onside: at a keeper restart the new attackers come back level with the deepest defender'(page) {
    await attackFirst(page);
    const r = await H(page, () => {
      const h = window.__hexball,
        s = h.S;
      // Harbour were attacking high up; Northgate's keeper has the ball and Northgate attack down (towards row 12)
      Object.assign(s.pos, { H2: [2, 3], H5: [5, 5], H6: [1, 2], H8: [7, 4], H10: [4, 2], H9: [4, 1] });
      Object.assign(s.pos, { A9: [4, 8], A7: [1, 9], A11: [4, 5], A8: [6, 5] });
      s.ball = 'A7'; // the man on the ball stays where he won it
      const keep = h.onsideBack(s, 'A').map((m) => m.pid);
      Object.assign(s.pos, { A9: [4, 8], A7: [1, 9] });
      s.ball = null;
      const moved = h.onsideBack(s, 'A');
      return { keep, moved, pos: s.pos };
    });
    assert.deepEqual(r.keep, ['A9'], 'carrier not moved');
    assert.deepEqual(r.moved.map((m) => m.pid).sort(), ['A7', 'A9']);
    for (const m of r.moved) assert.equal(m.to[1], 5, 'back to the row of the deepest Harbour outfield player');
    assert.deepEqual(r.pos.A11, [4, 5], 'level is onside');
    const hs = Object.values(r.pos).map(String);
    assert.equal(new Set(hs).size, hs.length, 'nobody stacked');
  },
  async 'match feed: readable turns with plan, duels, shots and results'(page) {
    await H(page, () => {
      document.querySelector('#start').hidden = true;
      window.__hexball.setSpeed(200);
      window.__hexball.newGame('sim');
    });
    await page.waitForFunction(() => window.__hexball.S.phase === 'over', null, { timeout: 120000, polling: 200 });
    await page.click('#more summary');
    // the feed is filled by the details' toggle event, which fires after the click returns
    await page.waitForFunction(() => document.querySelector('#feed').innerText.trim().length > 0, null, {
      timeout: 5000,
    });
    const f = await page.$eval('#feed', (e) => e.innerText.replace(/\s+/g, ' '));
    assert.match(f, /TURN \d+ · (HARBOUR|NORTHGATE) ATTACK/i);
    assert.match(f, /PLAN/i);
    assert.match(f, /SHOT/i);
    assert.match(f, /on target \d+%/);
    assert.match(f, /save \d+%/);
    assert.match(f, /Goal/);
    assert.ok(!(await page.isVisible('#log')), 'technical log tucked away');
  },
  async 'keeper: two columns off is ~5% at point blank; in line and one off unchanged'(page) {
    const r = await H(page, () => {
      const h = window.__hexball;
      h.newGame('hot');
      const cross = { name: 'Cross', acc: -0.22, saveCut: 0.08, header: true };
      return {
        user: h.saveP(3, [5, 0], 'H', 1, 83, cross), // the 3 Nov header: #9 at 3,0 bottom left, keeper on 5,0
        inLine: h.saveP(4, [4, 0], 'H', 3, 75),
        oneOff: h.saveP(4, [5, 0], 'H', 3, 75),
      };
    });
    assert.ok(r.user <= 0.06, `user's header ${r.user}`);
    assert.ok(Math.abs(r.inLine - 0.75) < 0.02, `in line ${r.inLine}`);
    assert.ok(r.oneOff > 0.4 && r.oneOff < 0.55, `one off ${r.oneOff}`);
  },
  async 'goal picker: colour goal, tap shoots; ⓘ shows words and the numbers, Shoot here'(page) {
    await attackFirst(page);
    await H(page, () => {
      const h = window.__hexball;
      h.S.pos.H9 = [3, 3];
      h.S.pos.A1 = [5, 0];
      h.render();
    });
    await page.click('[data-k="3,3"]');
    await page.click('[data-goal="H"]');
    assert.equal(await page.$$eval('#pop .gspot', (l) => l.length), 6);
    assert.equal(await page.$$eval('#pop .gspot text', (l) => l.length), 0, 'plain: no words');
    // the far side from the keeper is greener than the near side
    const [far, near] = await page.$$eval('#gpT stop', (l) => [
      l[0].getAttribute('stop-color'),
      l[4].getAttribute('stop-color'),
    ]);
    const g = (c) => +c.match(/\d+/g)[1] - +c.match(/\d+/g)[0];
    assert.ok(g(far) > g(near), `${far} vs ${near}`);
    await page.click('.gp-i');
    assert.equal(await page.$$eval('#pop .gspot text', (l) => l.length), 6, 'detail: words');
    await page.click('.gspot[data-v="0"]');
    const info = await page.$eval('.gp-info', (e) => e.innerText.replace(/\s+/g, ' '));
    assert.match(info, /Aim · on target/);
    assert.match(info, /Keeper save/);
    assert.match(info, /Goal chance/);
    assert.match(info, /Crit strike/);
    await page.click('.gp-info [data-a="zone"]');
    assert.deepEqual(await H(page, () => window.__hexball.S.plan.map((a) => a.type + a.zone)), ['shot0']);
    await page.click('#bar [data-a="undo"]');
    await page.click('[data-k="3,3"]');
    await page.click('[data-goal="H"]');
    await page.click('.gp-i'); // back to plain
    await page.click('.gspot[data-v="4"]');
    assert.deepEqual(await H(page, () => window.__hexball.S.plan.map((a) => a.type + a.zone)), ['shot4']);
  },
  async 'keeper in his box contests a pass through his hex with his hands (75%) — no running through him'(page) {
    await attackFirst(page);
    await H(page, () => {
      const h = window.__hexball,
        s = h.S;
      h.setAutoGo(0);
      // the 5 Nov turn 10: a ground ball across the six-yard box with the keeper on the line of it
      Object.assign(s.pos, {
        H9: [7, 1],
        H10: [3, 1],
        A1: [5, 1],
        A7: [0, 3],
        A4: [0, 5],
        A3: [8, 5],
        A11: [1, 6],
        A8: [7, 7],
        A9: [3, 8],
      });
      s.ball = 'H9';
      s.plan = [{ type: 'pass', from: 'H9', to: 'H10', kind: 'ground', ball: true, target: [3, 1] }];
      h.render();
    });
    await page.click('[data-a="lock"]');
    await playUntil(page, () => window.__hexball.S.glog.some((l) => / A1 v H|WON A1|recv H10/.test(l.t)));
    const g = await H(page, () => window.__hexball.S.glog.map((l) => l.t).join('\n'));
    assert.match(g, /pass\/star A1 v H\S+ p 75%/, g.slice(-600));
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
    console.log('  FAIL', name, '\n       ', e.message.split('\n')[0], errors.join(' / '));
  }
  await page.close();
}
await b.close();
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('ui tests passed');
