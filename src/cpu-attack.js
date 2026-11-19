// CPU attack planner v2 (v1.33). Plans the whole turn like a person would:
//  1. shape: 2–3 runs with jobs — "target" (into space / the box ahead of the ball), "support" (a short, open option
//     near the carrier) and "width" (out on a flank, ahead);
//  2. touches: with the runs in place, every 1- and 2-touch combination (shot, pass, through ball, lob, Give & Go,
//     cross, dribble) is scored = chance it works × value of where it leaves us − chance it fails × turnover cost;
//  3. choice: sampled from the best few with some randomness (more at kick-off), so it doesn't repeat itself.
// Loose-ball turns still use the old greedy planner (cpu.js cpuPlan).

const AI = {
  shotW: 4, // goal chance → value (v2.18: 3.4 → 4, shoots a bit more readily)
  turnover: 0.7, // cost of losing the ball (more in our own half)
  temp: 0.18, // randomness when choosing (softmax temperature)
  tempKO: 0.45, // …at kick-off
  noise: 0.25, // noise on run choices
  noiseKO: 0.6,
};

function cpuPlanV2() {
  const att = S.attack,
    base = baseSt(),
    c = base.ball,
    ko = !!S.koBlock,
    noise = ko ? AI.noiseKO : AI.noise;
  // 1. runs
  const runs = cpuRuns(base, c, noise);
  const pst = project(base, runs, runs.length);
  // 2. touches
  const cands = [];
  for (const t1 of touchOpts(pst, c, true)) {
    const st1 = t1.after;
    let best = { v: t1.end ? 0 : holdVal(st1), a: null };
    // v2.11: one pass or shot a turn — after a lob the receiver can only dribble on; after a dribble, pass or shoot.
    // v2.24: after a ground pass he can also pass or shoot again (first time; no card)
    const g1 = t1.a.type === 'pass' && t1.a.kind === 'ground';
    if (!t1.end && st1.ball && st1.ball !== c)
      for (const t2 of touchOpts(st1, st1.ball, false)) {
        if (t2.a.type !== 'move' && !(g1 && (t2.a.type === 'pass' || t2.a.type === 'shot'))) continue;
        const v = t2.p * t2.v - (1 - t2.p) * toCost(st1, st1.ball);
        if (v > best.v) best = { v, a: t2.a };
      }
    else if (!t1.end && st1.ball === c && t1.a.type === 'move')
      // after a dribble he can still shoot or pass (v2.19: not after a Give & Go, whose return also leaves him the
      // ball — that was the CPU shooting after its one pass)
      for (const t2 of touchOpts(st1, c, false)) {
        if (t2.a.type === 'move') continue;
        const v = t2.p * t2.v - (1 - t2.p) * toCost(st1, c);
        if (v > best.v) best = { v, a: t2.a };
      }
    const v = t1.end ? t1.p * t1.v : t1.p * best.v - (1 - t1.p) * toCost(pst, c);
    cands.push({ v, a1: t1.a, a2: best.a });
  }
  // 3. choose
  cands.sort((x, y) => y.v - x.v);
  const top = cands.slice(0, 8),
    T = ko ? AI.tempKO : AI.temp,
    w = top.map((x) => Math.exp((x.v - top[0].v) / T)),
    sum = w.reduce((s, x) => s + x, 0);
  let r = crnd() * sum,
    pick = top[0];
  for (let i = 0; i < top.length; i++)
    if ((r -= w[i]) <= 0) {
      pick = top[i];
      break;
    }
  // dribbles count as moving players: make room by dropping the last run(s)
  const dribblers = pick ? [pick.a1, pick.a2].filter((a) => a && a.type === 'move').map((a) => a.pid) : [],
    movers = () => new Set([...runs.map((r) => r.pid), ...dribblers]).size;
  while (runs.length && movers() > MAX_RUNNERS) runs.pop();
  S.plan = [...runs];
  if (pick) {
    S.plan.push({ ...pick.a1, ball: true });
    if (pick.a2) S.plan.push({ ...pick.a2, ball: true });
  }
  log(`${TEAMS[att].name} lock in ${S.plan.length} action${S.plan.length === 1 ? '' : 's'}`, 'att');
}

// Value of holding the ball at st (no more touches this turn): progress, being in the box, the chance it sets up.
function holdVal(st) {
  const c = st.ball;
  if (!c) return 0;
  const att = team(c),
    h = st.pos[c];
  return (12 - gDist(att, h)) * 0.06 + (boxHex(att, h) ? 0.25 : 0) + bestXg(st, c).x * 1.1;
}
function toCost(st, c) {
  const att = team(c);
  return AI.turnover + (gDist(att, st.pos[c]) > 7 ? 0.35 : 0); // losing it in our own half hurts more
}
function shotVal(st, pid, z, as = null) {
  const att = team(pid),
    h = st.pos[pid],
    // v2.16: a smaller penalty just outside the box, so a decent chance from the edge gets taken (was 0.35 + 0.25/row)
    outside = boxHex(att, h) ? 0 : 0.1 + Math.max(0, gDist(att, h) - 4) * 0.2;
  return xgOf(st, pid, z, as) * AI.shotW - outside;
}

// All the touches pid could play from st. Each: { a (action), p (chance it comes off), v (value if it does),
// after (state after it), end (true for shots/crosses: the plan stops) }.
function touchOpts(st, pid, first) {
  const att = team(pid),
    out = [],
    bf = buffFor(pid);
  // shots
  if (gDist(att, st.pos[pid]) <= 7)
    for (let z = 0; z < 6; z++)
      out.push({ a: { type: 'shot', pid, zone: z }, p: 1, v: shotVal(st, pid, z), end: true });
  // passes / through balls
  for (const t of mine(att)) {
    if (t === pid) continue;
    const isGK = PL[t].role === 'GK',
      d = hd(st.pos[pid], st.pos[t]);
    for (const kind of ['ground', 'lob']) {
      if (d > RANGE.lob || kind !== passKind(d) || (isGK && kind === 'lob')) continue;
      const e = passEval(st, pid, t, kind, new Set(), bf),
        after = cloneSt(st);
      after.ball = t;
      const through = kind === 'ground' && !isGK && e.clean > 0.75 && crnd() < 0.35;
      out.push({
        a: { type: 'pass', from: pid, to: t, kind, target: st.pos[t].slice(), through },
        p: e.clean,
        v: holdVal(after) - (isGK ? 0.4 : 0),
        after,
      });
    }
    // Give & Go (first touch only, card available)
    if (
      first &&
      !isGK &&
      d <= 3 &&
      PL[pid].pac > 0 &&
      !(S.cool[att] || []).includes('gng') &&
      !S.plan.some((x) => x.type === 'gng')
    ) {
      let bestT = null;
      for (const T of gngTargets(st, pid, t)) {
        const g = gDist(att, st.pos[pid]) - gDist(att, T);
        if (!bestT || g > bestT.g) bestT = { g, T };
      }
      if (bestT && bestT.g > 0) {
        const e1 = passEval(st, pid, t, 'ground', new Set(), bf),
          st2 = cloneSt(st);
        st2.pos[pid] = bestT.T.slice();
        st2.ball = t;
        const e2 = passEval(st2, t, pid, 'ground'),
          after = cloneSt(st2);
        after.ball = pid;
        const rr = reach(st, pid, gngRun(st, pid));
        out.push({
          a: { type: 'gng', from: pid, to: t, ret: bestT.T.slice(), path: pathFrom(rr, st.pos[pid], bestT.T) },
          p: e1.clean * e2.clean,
          v: holdVal(after) + 0.1, // a small bonus for the one-two (he's run beyond his man)
          after,
        });
      }
    }
    // Cross card
    if (crossOK(st, pid, t))
      for (const kind of ['lob', 'ground']) {
        if (d > RANGE.lob || kind !== passKind(d)) continue;
        const land = passEval(st, pid, t, kind, new Set(), bf).clean,
          vs = cloneSt(st);
        vs.ball = t;
        let bz = null;
        for (let z = 0; z < 6; z++) {
          const v = shotVal(vs, t, z, CROSS_AS[kind]);
          if (!bz || v > bz.v) bz = { v, z };
        }
        out.push({
          a: { type: 'cross', from: pid, to: t, kind, zone: bz.z, target: st.pos[t].slice() },
          p: land,
          v: bz.v,
          end: true,
        });
      }
  }
  // dribbles (the best few forward options)
  if (PL[pid].pac > 0) {
    const rd = reach(st, pid, mv(st, pid)),
      ds = [];
    for (const [, inf] of rd) {
      const gain = gDist(att, st.pos[pid]) - gDist(att, inf.h);
      if (gain <= 0) continue;
      const path = pathFrom(rd, st.pos[pid], inf.h),
        e = dribbleEval(st, pid, path, new Set(), bf),
        after = cloneSt(st);
      after.pos[pid] = inf.h.slice();
      ds.push({ a: { type: 'move', pid, path }, p: e.p, v: holdVal(after) - 0.05, after });
    }
    ds.sort((x, y) => y.p * y.v - x.p * x.v);
    out.push(...ds.slice(0, 4));
  }
  return out;
}

// Runs: score every reachable hex for each teammate under each job, then pick 2–3 (distinct players, spread out).
function cpuRuns(base, c, noise) {
  const att = S.attack,
    def = other(att),
    cpos = base.pos[c],
    roles = ['target', 'support', 'width'].sort(() => crnd() - 0.5),
    nRuns = crnd() < 0.2 ? 2 : MAX_RUNNERS,
    opts = [];
  for (const t of mine(att)) {
    if (t === c || PL[t].role === 'GK' || PL[t].pac === 0) continue;
    const rr = reach(base, t, runSteps(base, t));
    for (const [, inf] of rr) {
      const h = inf.h;
      if (at(base, h).length) continue;
      const fwd = gDist(att, base.pos[t]) - gDist(att, h),
        open = mine(def).every((o) => hd(base.pos[o], h) > 1) ? 1 : 0,
        st2 = cloneSt(base);
      st2.pos[t] = h.slice();
      const d = hd(cpos, h),
        lane =
          d <= RANGE.ground
            ? passEval(st2, c, t, 'ground').clean
            : d <= RANGE.lob
              ? passEval(st2, c, t, 'lob').clean * 0.7
              : 0;
      const sc = {
        target: fwd * 0.25 + (inBox(h, def) ? 0.6 : 0) + lane * 0.5 + open * 0.3,
        support: (d >= 2 && d <= 3 ? 0.6 : d === 4 ? 0.2 : 0) + lane * 1.0 + open * 0.5 + fwd * 0.05,
        width: (wideHex(h) ? 0.6 : 0) + fwd * 0.2 + lane * 0.4 + open * 0.3,
      };
      opts.push({ t, h, path: pathFrom(rr, base.pos[t], h), sc });
    }
  }
  const runs = [],
    used = new Set();
  for (const role of roles) {
    if (runs.length >= nRuns) break;
    let best = null;
    for (const o of opts) {
      if (used.has(o.t) || runs.some((r) => hd(r.path[r.path.length - 1], o.h) < 2)) continue;
      const v = o.sc[role] + crnd() * noise;
      if (!best || v > best.v) best = { v, o };
    }
    if (best && best.v > 0.25) {
      used.add(best.o.t);
      runs.push({ type: 'move', pid: best.o.t, path: best.o.path, ball: false });
    }
  }
  return runs;
}
