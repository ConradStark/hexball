const marked = (st, id) => at(st, st.pos[id]).some((x) => team(x) !== team(id));
// tired (ran twice last attacking turn): -1 hex while his team attacks this turn
const tired = (id) => !!(S && S.tired && S.tired[id] === 'active' && team(id) === S.attack);
const slow = (st, id) => (marked(st, id) ? 1 : 0) + (tired(id) ? 1 : 0);
const mv = (st, id) => (PL[id].pac === 0 ? 0 : Math.max(1, (st.ball === id ? DRIBBLE : MOVE) - slow(st, id)));
const gngRun = (st, id) => (PL[id].pac === 0 ? 0 : GNG_RUN - slow(st, id));
const dm = (id) => (PL[id].def - 75) / 200;
function cloneSt(st) {
  const pos = {};
  for (const k in st.pos) pos[k] = st.pos[k].slice();
  return { pos, ball: st.ball, loose: st.loose ? st.loose.slice() : null };
}
function occ(st) {
  const m = {};
  for (const id in st.pos) {
    const k = key(...st.pos[id]);
    (m[k] || (m[k] = [])).push(id);
  }
  return m;
}
function at(st, h) {
  return occ(st)[key(...h)] || [];
}
function reach(st, pid, steps) {
  const o = occ(st),
    T = team(pid),
    defMode = T !== S.attack,
    s = st.pos[pid],
    res = new Map();
  res.set(key(...s), { d: 0, prev: null, h: s, end: false });
  const q = [s];
  while (q.length) {
    const h = q.shift(),
      cur = res.get(key(...h));
    if (cur.d >= steps || cur.end) continue;
    for (const n of nbrs(...h)) {
      const k = key(...n);
      if (res.has(k)) continue;
      if (defMode && S.koBlock && n[0] === KOC && n[1] === MIDR) continue;
      const ids = (o[k] || []).filter((x) => x !== pid);
      if (ids.length) {
        // v2.39 Wall: an attacker can run through opponents, but not through a defender (or the keeper).
        // v2.44: he can also stop on a non-Wall opponent's hex (user: they'll have moved by then)
        if (!defMode) {
          if (ids.some((x) => team(x) === T || isWall(x))) continue;
          res.set(k, { d: cur.d + 1, prev: h, h: n, end: false });
          q.push(n);
          continue;
        }
        // v2.63: a teammate who has an order this window (he's leaving) doesn't block the hex
        const leaving = (x) => (S.orders || []).some((q) => q.pid === x && !q.done) || S.tkPend === x;
        if (ids.every((x) => team(x) === T && leaving(x))) {
          res.set(k, { d: cur.d + 1, prev: h, h: n, end: false });
          q.push(n);
          continue;
        }
        if (ids.length > 1 || ids.some((x) => team(x) === T) || PL[ids[0]].role === 'GK') continue;
        // v2.46: defenders go through attackers (as their orders already do since v2.33), not just onto them
        const lb = st.loose && same(n, st.loose);
        res.set(k, { d: cur.d + 1, prev: h, h: n, end: lb });
        if (!lb) q.push(n);
        continue;
      }
      if (st.loose && same(n, st.loose)) {
        // v2.46: a defender can go for a loose ball he can reach (was: only one next to him); it's a race, the
        // first one there in play gets it (user: \"to have it in sight and not be able to is weird\")
        res.set(k, { d: cur.d + 1, prev: h, h: n, end: true });
        continue;
      }
      res.set(k, { d: cur.d + 1, prev: h, h: n, end: false });
      q.push(n);
    }
  }
  res.delete(key(...s));
  // v2.64: two defenders can't be sent to the same hex (he can still pass through it)
  if (defMode)
    for (const q of S.orders || [])
      if (!q.done && q.pid !== pid && team(q.pid) === T) {
        const v = res.get(key(...q.path[q.path.length - 1]));
        if (v) v.via = true;
      }
  const out = new Map([...res].filter(([, v]) => !v.via)); // where he can stop
  out.all = res; // the whole search, for paths that pass through someone
  return out;
}
// v2.39 Wall: defenders (and keepers) can't be run through; everyone else can
function isWall(id) {
  return PL[id].role === 'DF' || PL[id].role === 'GK';
}
function pathFrom(res, start, h) {
  const p = [h.slice()],
    R = res.all || res;
  let cur = R.get(key(...h));
  while (cur && cur.prev) {
    p.unshift(cur.prev.slice());
    cur = R.get(key(...cur.prev));
  }
  if (!same(p[0], start)) p.unshift(start.slice());
  return p;
}
function truncPath(st, a) {
  let path = a.path;
  const steps = mv(st, a.pid);
  if (!same(st.pos[a.pid], path[0])) {
    const rr = reach(st, a.pid, steps),
      dest = path[path.length - 1];
    if (!rr.has(key(...dest))) return { p: [st.pos[a.pid].slice()], b: null, pick: false };
    path = pathFrom(rr, st.pos[a.pid], dest);
  }
  const o = occ(st);
  for (let j = 1; j < path.length; j++) {
    const ids = (o[key(...path[j])] || []).filter((x) => x !== a.pid);
    // v2.41: he runs through opponents who aren't a Wall (v2.39), as long as he doesn't stop on them
    if (ids.length && j < path.length - 1 && ids.every((x) => team(x) !== team(a.pid) && !isWall(x))) continue;
    if (ids.length) return { p: path.slice(0, j), b: ids.find((x) => team(x) !== team(a.pid)) || null, pick: false };
    if (st.loose && same(path[j], st.loose)) return { p: path.slice(0, j + 1), b: null, pick: true };
  }
  return { p: path, b: null, pick: false };
}
function applyDet(st, a) {
  if (a.type === 'move') {
    const tp = truncPath(st, a);
    st.pos[a.pid] = tp.p[tp.p.length - 1].slice();
    if (tp.pick) {
      st.ball = a.pid;
      st.loose = null;
    }
  } else if (a.type === 'pass') {
    if (st.ball !== a.from) return;
    if (a.to) {
      st.ball = a.to;
      return;
    }
    const mate = at(st, a.target).find((x) => team(x) === team(a.from));
    if (mate) st.ball = mate;
    else {
      st.ball = null;
      st.loose = a.target.slice();
    }
  } else if (a.type === 'gng') {
    if (st.ball !== a.from) return;
    if (at(st, a.ret).some((x) => x !== a.from)) st.ball = a.to;
    else {
      st.pos[a.from] = a.ret.slice();
      st.ball = a.from;
    }
  }
}
function project(base, plan, upto) {
  const st = cloneSt(base);
  for (let i = 0; i < upto; i++) applyDet(st, plan[i]);
  return st;
}
function baseSt() {
  return { pos: S.pos, ball: S.ball, loose: S.loose };
}
function buffFor(id) {
  return S.buff && S.buff.pid === id ? S.buff.v : 0;
}
function runSteps(st, id) {
  return PL[id].pac === 0 ? 0 : MOVE + (PL[id].role === 'WG' ? WING_RUN : 0) - slow(st, id); // v2.40 winger +1
}
function fixPath(pid, path, steps) {
  if (same(path[0], S.pos[pid])) return path;
  const rr = reach(S, pid, steps),
    d = path[path.length - 1];
  return rr.has(key(...d)) ? pathFrom(rr, S.pos[pid], d) : [S.pos[pid].slice()];
}

// A keeper only plays the ball with his hands inside his own box (v2.16): claims, smothers, rushes out.
const keeperIn = (o, h) => PL[o].role === 'GK' && inBox(h, team(o));
// Penalty box of a team's own goal (columns MIDC±BOXW — 2–6 on the 9-wide board — and the 3 rows nearest its goal
// line). Harbour (H) defend the bottom.
const inBox = (h, gkTeam) =>
  h[0] >= MIDC - BOXW && h[0] <= MIDC + BOXW && (gkTeam === 'A' ? h[1] <= 2 : h[1] >= ROWS - 3);
// After the keeper restarts, opponents step out of his box to the top of the box (the first row outside it, towards
// halfway), keeping their column as far as possible; if that row is full, the next row out. Never out to the sides.
// Returns the moves made [{pid, from, to}] so the caller can animate/log them.
// After a save the keeper restarts from where he caught it: the hex in his box nearest the catch point (xy). Anyone
// standing there is moved to the nearest free hex.
function keeperTakes(gk, xy) {
  const t = team(gk);
  let best = null;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (!inBox([c, r], t)) continue;
      const p = px(c, r),
        d = Math.hypot(p[0] - xy[0], p[1] - xy[1]);
      if (!best || d < best.d) best = { d, h: [c, r] };
    }
  if (!best) return;
  const h = best.h;
  for (const id of at(S, h).filter((x) => x !== gk)) {
    // nearest free hex for him
    const seen = new Set([key(...h)]);
    let q = [h],
      to = null;
    while (q.length && !to) {
      const nq = [];
      for (const x of q)
        for (const n of nbrs(...x)) {
          const k = key(...n);
          if (seen.has(k)) continue;
          seen.add(k);
          if (!at(S, n).length) {
            to = n;
            break;
          }
          nq.push(n);
        }
      q = nq;
    }
    if (to) {
      gl(`make room ${id} ${hx(h)}>${hx(to)}`);
      S.pos[id] = to.slice();
    }
  }
  if (!same(S.pos[gk], h)) gl(`keeper ${gk} takes it at ${hx(h)}`);
  S.pos[gk] = h.slice();
}
function clearBox(st, gkTeam) {
  const moved = [],
    taken = new Set(Object.values(st.pos).map((h) => key(...h))),
    up = gkTeam === 'A' ? 1 : -1,
    edge = gkTeam === 'A' ? 3 : ROWS - 4;
  const ins = Object.keys(st.pos)
    .filter((id) => team(id) !== gkTeam && inBox(st.pos[id], gkTeam))
    .sort((a, b) => gDist(other(gkTeam), st.pos[a]) - gDist(other(gkTeam), st.pos[b]));
  for (const id of ins) {
    const from = st.pos[id],
      col = Math.min(MIDC + BOXW, Math.max(MIDC - BOXW, from[0]));
    let to = null;
    for (let row = edge; !to && row >= 0 && row < ROWS; row += up)
      for (let dc = 0; dc <= 4 && !to; dc++)
        for (const c of dc ? [col - dc, col + dc] : [col]) {
          if (c < 0 || c >= COLS || taken.has(key(c, row))) continue;
          to = [c, row];
          break;
        }
    if (!to) continue;
    taken.delete(key(...from));
    taken.add(key(...to));
    st.pos[id] = to.slice();
    moved.push({ pid: id, from, to });
  }
  return moved;
}

// Onside at a keeper restart (v2.2, the only offside rule): the keeper's team (now attacking) may be no further forward
// than the deepest outfield player of the other side. Anyone beyond that row goes back to it (same column if free, else
// the nearest free hex in that row, else the next row back). Returns the moves [{pid, from, to}].
function onsideBack(st, attTeam) {
  const fwd = attTeam === 'A' ? 1 : -1, // A attacks towards row ROWS-1, H towards row 0
    defs = Object.keys(st.pos).filter((id) => team(id) !== attTeam && PL[id].role !== 'GK');
  if (!defs.length) return [];
  const rows = defs.map((id) => st.pos[id][1]),
    line = fwd > 0 ? Math.max(...rows) : Math.min(...rows),
    beyond = (h) => (h[1] - line) * fwd > 0,
    taken = new Set(Object.values(st.pos).map((h) => key(...h))),
    moved = [];
  const off = Object.keys(st.pos)
    .filter((id) => team(id) === attTeam && PL[id].role !== 'GK' && id !== st.ball && beyond(st.pos[id]))
    .sort((a, b) => (st.pos[a][1] - st.pos[b][1]) * fwd); // the least far ahead first
  for (const id of off) {
    const from = st.pos[id];
    let to = null;
    for (let row = line; !to && row >= 0 && row < ROWS; row -= fwd)
      for (let dc = 0; dc < COLS && !to; dc++)
        for (const c of dc ? [from[0] - dc, from[0] + dc] : [from[0]]) {
          if (c < 0 || c >= COLS || taken.has(key(c, row))) continue;
          to = [c, row];
          break;
        }
    if (!to) continue;
    taken.delete(key(...from));
    taken.add(key(...to));
    st.pos[id] = to.slice();
    moved.push({ pid: id, from, to });
  }
  return moved;
}
