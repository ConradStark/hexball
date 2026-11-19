function cpuPlanB() {
  if (baseSt().ball && !CPU_OLD) return cpuPlanV2(); // v1.33 whole-turn planner (cpu-attack.js)
  S.plan = [];
  S.maxActions = 5;
  cpuPlan();
  const seq = S.plan,
    base = baseSt();
  S.plan = [];
  let k = 0,
    dbl = null;
  const runs = {};
  for (let i = 0; i < seq.length; i++) {
    const a = seq[i],
      st = project(base, seq, i),
      isB = a.type !== 'move' || st.ball === a.pid;
    if (isB && a.type !== 'move') {
      if (k >= KICKS) break;
      a.ball = true;
      k++;
      S.plan.push(a);
      if (a.type === 'shot' || a.type === 'cross') break;
      continue;
    }
    const n = runs[a.pid] || 0;
    if ((n === 0 && Object.keys(runs).length >= MAX_RUNNERS) || (n === 1 && dbl) || n >= 2) continue;
    if (n === 1) dbl = a.pid;
    runs[a.pid] = n + 1;
    a.ball = isB; // a dribble: a move like any other (v2.11)
    S.plan.push(a);
  }
}
// CPU keeper: stand in line with the ball (the goal-line hex closest to the ball's column, or one row off his line
// when the ball is close), so the corners aren't left open.
function cpuKeeperSpot(def) {
  const gk = gkOf(def),
    b = S.ball ? S.pos[S.ball] : S.loose;
  if (!gk || !b) return null;
  const line = goalHex(other(def))[1],
    near = gDist(other(def), b) <= 4,
    gc = goalCols(),
    col = Math.min(gc[gc.length - 1], Math.max(gc[0], b[0])),
    want = [col, near ? line + (line === 0 ? 1 : -1) : line];
  const rr = defReach(S, gk, 2);
  let best = null;
  for (const [, inf] of rr) {
    const v = hd(inf.h, want);
    if (!best || v < best.v) best = { v, h: inf.h, d: inf.d };
  }
  return best && best.v < hd(S.pos[gk], want) ? { pid: gk, to: best.h, d: best.d } : null;
}
function cpuOrdersB(f) {
  void f;
  const def = other(S.attack),
    out = [];
  let budget = S.budget;
  const taken = new Set(S.orders.filter((o) => !o.done).map((o) => o.pid));
  // tackle when it's a decent chance (it costs 2 steps)
  if (S.tk && tackleP(S.tk) >= 0.45 && crnd() < 0.8) return { tackle: true, pid: S.tk };
  // v2.25 respond mode: a defender next to the man on the ball challenges him — a tackle when it's a good chance,
  // else a press (1 step); and one defender reads the most dangerous ball (Anticipate)
  if (respond() && S.ball && !S.fl) {
    const near = mine(def).filter((d) => challengeOK(d) && !taken.has(d));
    const best = near.sort((x, y) => tackleP(y) - tackleP(x))[0];
    if (best && budget >= 2 && tackleP(best) >= 0.5 && crnd() < 0.5) {
      cpuRead(def, new Set([best]));
      return { tackle: true, pid: best, from: true };
    }
    if (best && budget >= 1 && !(S.press && S.press.on === S.ball)) {
      doPress(best);
      budget -= 1;
      taken.add(best);
    }
  }
  // keeper first, if the ball is in range of goal and he's out of position
  const ball = S.ball ? S.pos[S.ball] : S.loose,
    ks = ball && gDist(S.attack, ball) <= 7 ? cpuKeeperSpot(def) : null;
  if (ks && !taken.has(ks.pid) && ks.d <= budget) {
    out.push({ pid: ks.pid, to: ks.to });
    taken.add(ks.pid);
    budget -= ks.d;
  }
  // v1.34: press / lanes / shot lane / loose ball (cpu-defend.js)
  for (const m of cpuDefMoves(budget, WIN_SENDS - out.length, ORDER_MAX, new Set(taken))) {
    out.push({ pid: m.pid, to: m.to });
    taken.add(m.pid);
  }
  cpuMarkBest(taken);
  if (respond()) cpuRead(def, taken);
  return out.length ? out : null;
}
// v2.25: the CPU's Anticipate — near goal it reads the shot (his line to goal), otherwise the pass to the attacker
// nearest goal. The defender closest to that line (on it or next to it) reads it; nobody near enough → no read.
function cpuRead(def, skip = new Set()) {
  const att = S.attack,
    b = S.ball ? S.pos[S.ball] : S.fl ? S.fl.target : S.loose;
  if (!b) return;
  let lane;
  if (gDist(att, b) <= 7) lane = hexLine(b, goalHex(att)).slice(1);
  else {
    const t = mine(att)
      .filter((x) => x !== S.ball && PL[x].role !== 'GK' && S.pos[x])
      .sort((x, y) => gDist(att, S.pos[x]) - gDist(att, S.pos[y]))[0];
    lane = t ? hexLine(b, S.pos[t]).slice(1) : [];
  }
  let pick = null;
  for (const d of mine(def)) {
    if (skip.has(d) || isKeeper(d) || d === S.beaten || d === S.out || !S.pos[d]) continue;
    const v = Math.min(9, ...lane.map((h) => hd(h, S.pos[d])));
    if (v === 0 && (!pick || v < pick.v || (v === pick.v && PL[d].def > PL[pick.d].def))) pick = { d, v };
  }
  if (pick && readPid(def) !== pick.d) doRead(pick.d);
}
// CPU prepare: the two outfield defenders nearest the ball step one hex towards it (or the loose ball).
function cpuPrepare() {
  const def = other(S.attack);
  // v1.34: the same scoring as the react windows, 2 players × 1 hex; the keeper lines up if a slot is left
  const ms = cpuDefMoves(PREPARE_PLAYERS * PREPARE_STEPS, PREPARE_PLAYERS, PREPARE_STEPS);
  for (const m of ms) prepareMove(m.pid, m.to);
  const gk = gkOf(def),
    ball = S.ball ? S.pos[S.ball] : S.loose;
  if (ms.length < PREPARE_PLAYERS && gk && ball && gDist(S.attack, ball) <= 7) {
    const ks = cpuKeeperSpot(def);
    if (ks) {
      const step = [...defReach(S, gk, 1).values()].sort((x, y) => hd(x.h, ks.to) - hd(y.h, ks.to))[0];
      if (step && hd(step.h, ks.to) < hd(S.pos[gk], ks.to)) prepareMove(gk, step.h);
    }
  }
}
// Goal chance of a shot by pid from where he stands in st: on target × beats the keeper where he stands.
function xgOf(st, pid, z, as = null) {
  const att = team(pid),
    gk = gkOf(other(att)),
    e = shotEval(st, pid, z, new Set(), buffFor(pid), as);
  return e.p * (1 - saveP(z, st.pos[gk], att, e.dg, PL[gk].ref, as, st.pos[pid]));
}
function bestXg(st, pid) {
  let b = { x: 0, z: 0 };
  for (let z = 0; z < 6; z++) {
    const x = xgOf(st, pid, z);
    if (x > b.x) b = { x, z };
  }
  return b;
}
const boxHex = (att, h) => inBox(h, other(att));
// CPU attack (v1.27): shots are rated by goal chance (keeper included) and outside-the-box shots pay a penalty, so
// it works the ball into the box; passes, dribbles and runs that set up a good chance are rated up.
function cpuPlan() {
  const att = S.attack,
    base = baseSt();
  for (let k = 0; k < S.maxActions; k++) {
    const st = project(base, S.plan, S.plan.length),
      c = st.ball,
      opts = [];
    if (!c) {
      if (!st.loose) break;
      let best = null;
      for (const t of mine(att)) {
        if (PL[t].pac === 0) continue;
        const rr = reach(st, t, mv(st, t));
        for (const [, inf] of rr) {
          const v = hd(inf.h, st.loose);
          if (!best || v < best.v) best = { v, a: { type: 'move', pid: t, path: pathFrom(rr, st.pos[t], inf.h) } };
        }
      }
      if (!best) break;
      S.plan.push(best.a);
      continue;
    }
    const gdC = gDist(att, st.pos[c]),
      bf = buffFor(c);
    const moved = S.plan.some((a) => a.type !== 'move' || a.pid === base.ball),
      marked = mine(other(att)).some((o) => same(st.pos[o], st.pos[c]));
    const holdPen = (marked ? 0.35 : 0) + (!moved && k >= S.maxActions - 2 ? 0.3 : 0);
    if (gdC <= 7)
      for (let z = 0; z < 6; z++) {
        const x = xgOf(st, c, z);
        const outside = boxHex(att, st.pos[c]) ? 0 : 0.35 + Math.max(0, gdC - 4) * 0.25;
        opts.push({ v: x * 3.4 - outside, a: { type: 'shot', pid: c, zone: z } });
      }
    for (const t of mine(att)) {
      if (t === c) continue;
      const isGK = PL[t].role === 'GK';
      for (const kind of ['ground', 'lob']) {
        const d = hd(st.pos[c], st.pos[t]);
        if (d > RANGE.lob || kind !== passKind(d)) continue;
        const e = passEval(st, c, t, kind, new Set(), bf),
          gain = gdC - gDist(att, st.pos[t]);
        // what he could do with it: a chance from where he receives it (box chances count most)
        const st2 = cloneSt(st);
        st2.ball = t;
        const nx = !isGK && kicks() < KICKS ? bestXg(st2, t).x * (boxHex(att, st.pos[t]) ? 2.2 : 0.8) : 0;
        opts.push({
          v: e.clean * (0.55 + 0.12 * gain + nx) - (1 - e.clean) - (isGK ? 0.5 : 0),
          a: { type: 'pass', from: c, to: t, kind },
        });
        if (
          kind === 'ground' &&
          !S.gngUsed &&
          !(S.cool[att] || []).includes('gng') &&
          !isGK &&
          d <= 3 &&
          e.clean > 0.6 &&
          PL[c].pac > 0
        ) {
          const rA = reach(st, c, gngRun(st, c));
          let best = null;
          for (const [, inf] of rA) {
            if (hd(inf.h, st.pos[t]) > 4 || at(st, inf.h).length) continue;
            const g2 = gdC - gDist(att, inf.h);
            if (!best || g2 > best.g) best = { g: g2, T: inf.h };
          }
          if (best && best.g > 0) {
            const st2 = cloneSt(st);
            st2.pos[c] = best.T.slice();
            st2.ball = t;
            const e2 = passEval(st2, t, c, 'ground');
            const pp = e.clean * e2.clean;
            opts.push({
              v: pp * (0.65 + 0.12 * best.g) - (1 - pp) + 0.05,
              a: { type: 'gng', from: c, to: t, ret: best.T.slice(), path: pathFrom(rA, st.pos[c], best.T) },
            });
          }
        }
      }
    }
    if (!S.plan.some((x) => x.type === 'cross'))
      for (const t of mine(att)) {
        if (t === c || !crossOK(st, c, t)) continue;
        for (const kind of ['lob', 'ground']) {
          const d = hd(st.pos[c], st.pos[t]);
          if (d > RANGE.lob || kind !== passKind(d)) continue;
          const e = passEval(st, c, t, kind, new Set(), bf),
            vs = cloneSt(st);
          vs.ball = t;
          let bz = null;
          for (let z = 0; z < 6; z++) {
            const sh = shotEval(vs, t, z, new Set(), 0, CROSS_AS[kind]);
            if (!bz || sh.p > bz.p) bz = { p: sh.p, z };
          }
          opts.push({ v: e.clean * bz.p * 0.62 * 2.8, a: { type: 'cross', from: c, to: t, kind, zone: bz.z } });
        }
      }
    if (PL[c].pac > 0) {
      const rd = reach(st, c, mv(st, c));
      for (const [, inf] of rd) {
        const gain = gdC - gDist(att, inf.h);
        if (gain <= 0) continue;
        const path = pathFrom(rd, st.pos[c], inf.h),
          e = dribbleEval(st, c, path, new Set(), bf),
          st2 = cloneSt(st);
        st2.pos[c] = inf.h.slice();
        const nx = bestXg(st2, c).x * (boxHex(att, inf.h) ? 1.8 : 0.6);
        opts.push({ v: e.p * (0.5 + 0.11 * gain + nx) - (1 - e.p), a: { type: 'move', pid: c, path } });
      }
    }
    for (const t of mine(att)) {
      if (t === c || PL[t].role === 'GK') continue;
      const rr = reach(st, t, mv(st, t));
      let best = null;
      for (const [, inf] of rr) {
        if (hd(st.pos[c], inf.h) > 6) continue;
        const st2 = cloneSt(st);
        st2.pos[t] = inf.h.slice();
        const e = passEval(st2, c, t, 'ground');
        // runs into the box, on to an open pass, are worth more
        const v =
          0.04 +
          0.2 * e.clean +
          0.05 * (gDist(att, st.pos[t]) - gDist(att, inf.h)) +
          (boxHex(att, inf.h) ? 0.18 * e.clean : 0) -
          holdPen;
        if (!best || v > best.v) best = { v, a: { type: 'move', pid: t, path: pathFrom(rr, st.pos[t], inf.h) } };
      }
      if (best) opts.push(best);
    }
    opts.forEach((o) => (o.v += crnd() * 0.12));
    opts.sort((x, y) => y.v - x.v);
    const pick = opts[0];
    if (!pick) break;
    S.plan.push(pick.a);
    if (pick.a.type === 'gng') S.gngUsed = true;
    if (pick.a.type === 'shot' || pick.a.type === 'cross') break;
  }
  log(`${TEAMS[S.attack].name} lock in ${S.plan.length} action${S.plan.length === 1 ? '' : 's'}`, 'att');
}
