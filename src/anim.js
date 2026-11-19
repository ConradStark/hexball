// Smooth animation (v1.13). The rules still move everything in frame steps; this layer only draws. Every player token
// and the ball has its own tween (from where it is on screen right now → its new target), all driven by one
// requestAnimationFrame clock. During playback each frame tweens linearly over FRAME_MS, so motion is continuous across
// frames and speeds read true: a ground pass covers 3 hexes in the time a runner covers 1.
// A lob tweens along its flight parameter (t0 → t1), drawn as an arc with a shadow on the grass.

const FRAME_MS = 480; // one playback frame on screen (sleep and tween use the same value)
const TW = {}; // element key → { el, from:[x,y], to:[x,y], cur:[x,y], t0, dur, lin, lob }
let twRun = false;

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const easeOut = (u) => 1 - (1 - u) * (1 - u) * (1 - u);

// Where a lob is at flight parameter t (0 = foot of the passer, 1 = landing): ground point, height above it.
function lobAt(L, t) {
  const g = lerp(L.A, L.B, t);
  return { g, h: 26 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) };
}

function setXY(el, xy) {
  el.style.transform = `translate(${xy[0]}px,${xy[1]}px)`;
}
// Tween one element to xy (or along a lob). dur in ms of real time at SPEED 1; 0 = jump.
function tweenEl(k, el, xy, dur, lin = false, lob = null) {
  const t = TW[k] || (TW[k] = { el, cur: xy.slice() });
  t.el = el;
  t.from = t.cur.slice();
  t.to = xy.slice();
  t.lob = lob;
  t.lin = lin;
  t.cp = null;
  t.t0 = performance.now();
  t.dur = S && S.mode === 'sim' ? 0 : dur / SPEED;
  if (!t.dur) {
    t.cur = xy.slice();
    drawTw(k, 1);
    return;
  }
  if (!twRun) {
    twRun = true;
    requestAnimationFrame(twTick);
  }
}
function drawTw(k, u) {
  const t = TW[k];
  const e = t.lin ? u : easeOut(u);
  if (t.cp) {
    // quadratic curve (curling shot)
    const a = (1 - e) * (1 - e),
      b = 2 * (1 - e) * e,
      c = e * e;
    t.cur = [a * t.from[0] + b * t.cp[0] + c * t.to[0], a * t.from[1] + b * t.cp[1] + c * t.to[1]];
    setXY(t.el, t.cur);
    return;
  }
  if (t.lob) {
    const p = lobAt(t.lob, t.lob.t0 + (t.lob.t1 - t.lob.t0) * e);
    t.cur = [p.g[0], p.g[1] - p.h];
    setXY(t.el, t.cur);
    const sh = $('#lobSh');
    sh.style.display = p.h > 0.5 ? '' : 'none';
    sh.setAttribute('cx', p.g[0]);
    sh.setAttribute('cy', p.g[1]);
    $('#ball .ballc').style.transform = `scale(${1 + p.h / 40})`;
    return;
  }
  t.cur = lerp(t.from, t.to, e);
  setXY(t.el, t.cur);
}
function twTick(now) {
  let live = false;
  for (const k in TW) {
    const t = TW[k];
    if (t.done === t.t0) continue;
    const u = t.dur ? Math.min(1, (now - t.t0) / t.dur) : 1;
    drawTw(k, u);
    if (u >= 1) t.done = t.t0;
    else live = true;
  }
  followMarks();
  followBallRing();
  followLines();
  if (live) requestAnimationFrame(twTick);
  else twRun = false;
}
// v2.65: the ball's line and the attackers' trails end where the ball / token is drawn (sharing a hex moves them)
function followLines() {
  const k = document.getElementById('kickLine'),
    b = TW.ball && TW.ball.cur;
  if (k && b) {
    k.setAttribute('x2', b[0].toFixed(1));
    k.setAttribute('y2', b[1].toFixed(1));
  }
  for (const el of document.querySelectorAll('[data-tr]')) {
    const c = TW[el.dataset.tr] && TW[el.dataset.tr].cur;
    if (c) el.setAttribute('points', `${el.dataset.pts} ${c[0].toFixed(1)},${c[1].toFixed(1)}`);
  }
}
// v2.38: the action circle stays on the ball (wherever it's drawn: at a player's feet, rolling, in the air, cleared)
let ballRingOn = false;
function followBallRing() {
  const r = document.getElementById('ballRing');
  if (!r) return;
  const b = TW.ball && TW.ball.cur;
  if (!ballRingOn || !b || (!S.ball && !S.loose && !S.fl && !S.flight)) {
    r.style.display = 'none';
    return;
  }
  r.style.display = '';
  r.setAttribute('cx', b[0].toFixed(1));
  r.setAttribute('cy', b[1].toFixed(1));
}
// Mark rings and tethers ride on the tokens' on-screen positions, not their hexes (v2.14).
function followMarks() {
  for (const el of document.querySelectorAll('[data-mk]')) {
    const [d, a] = el.dataset.mk.split('|'),
      A = TW[d] && TW[d].cur,
      B = TW[a] && TW[a].cur;
    if (!B) continue;
    if (el.tagName === 'circle') {
      el.setAttribute('cx', B[0]);
      el.setAttribute('cy', B[1]);
    } else if (el.tagName === 'polygon') {
      el.setAttribute('transform', `translate(${B[0]},${B[1]})`); // v2.57 hex mark ring
    } else if (A) {
      el.setAttribute('x1', A[0]);
      el.setAttribute('y1', A[1]);
      el.setAttribute('x2', B[0]);
      el.setAttribute('y2', B[1]);
    }
  }
}
// The ball on its own (shots, blocks, goals): a quick straight tween.
function tweenBall(xy, dur = 260, cp = null) {
  $('#ball .ballc').style.transform = '';
  $('#lobSh').style.display = 'none';
  tweenEl('ball', $('#ball'), xy, dur, false);
  TW.ball.cp = cp; // a control point makes the ball curl (top-corner shots)
}

// Little word pop-ups on the pitch ("Scatter!", "Near miss", "Gets by"): float up from xy and fade. Own layer (#fx),
// so overlay redraws don't wipe them. cls: 'att' (good for the attack), 'def' (good for the defence), '' neutral.
function popWord(xy, txt, cls = '') {
  if (!S || S.mode === 'sim') return;
  const g = $('#fx'),
    id = 'fx' + Math.random().toString(36).slice(2, 8);
  // v2.54: a second word at the same spot (Won it! + Cleared!) goes below the first instead of on top of it
  const near = [...g.querySelectorAll('.pw')].filter((n) => {
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(n.getAttribute('transform') || '');
    return m && Math.abs(+m[1] - xy[0]) < 60 && Math.abs(+m[2] - (xy[1] - 18)) < 60;
  }).length;
  xy = [xy[0], xy[1] + near * 26];
  g.insertAdjacentHTML(
    'beforeend',
    `<g id="${id}" class="pw ${cls}" style="--d:${1300 / SPEED}ms" transform="translate(${xy[0]},${xy[1] - 18})"><text text-anchor="middle">${txt}</text></g>`,
  );
  setTimeout(() => {
    const n = document.getElementById(id);
    if (n) n.remove();
  }, 1400 / SPEED);
}

// Slow-motion look for shots: a dark edge around the pitch while the shot plays out (cleared by clearPlay).
function slowmo(on) {
  if (S && S.mode === 'sim') return;
  const w = $('.boardWrap');
  if (w) w.classList.toggle('slowmo', !!on);
}
