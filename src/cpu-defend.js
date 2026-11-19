// CPU defence v2 (v1.34). At each react window (and in Prepare) the CPU scores every hex each free defender can reach
// against the threats it can see, then sends the best few within the window's budget:
//  - press:  step onto / next to the ball carrier (a tackle or contest on his next touch);
//  - lanes:  stand in the passing lane to a dangerous attacker, or tight on him;
//  - shot:   when the carrier can shoot, block the lane to the side of the goal the keeper isn't covering;
//  - loose:  race to a loose ball (or a lob's landing spot) if it can get there first;
//  - keeper: line up with the ball (cpuKeeperSpot).
// It also marks the most dangerous attacker it can (one mark). Threat ("danger") of an attacker = closeness to goal,
// in the box, open, and running (runners count where they're heading next).

const DF = { press: 0.9, pressNext: 0.3, lane: 0.8, tight: 0.4, shot: 0.75, loose: 1.6, stepCost: 0.12, noise: 0.12 };

function attackerDanger(att, id, h) {
  const def = other(att),
    open = mine(def).every((o) => o === S.out || hd(S.pos[o], h) > 1);
  return Math.max(0, (9 - gDist(att, h)) / 9) + (inBox(h, def) ? 0.4 : 0) + (open ? 0.2 : 0);
}
// Where an attacker will be soon: his next hexes if he's running (what you can see on the board), else where he is.
function heading(id) {
  const m = (S.movers || []).find((x) => x.pid === id && !x.done);
  return m ? m.path[Math.min(m.path.length - 1, m.idx + 2)] : S.pos[id];
}
function threats(att) {
  const c = S.ball;
  return mine(att)
    .filter((id) => id !== c && PL[id].role !== 'GK' && S.pos[id])
    .map((id) => ({ id, h: heading(id), d: attackerDanger(att, id, heading(id)) }))
    .sort((a, b) => b.d - a.d);
}
// Value of defender standing on hex h right now.
function hexValue(att, h, T, covered) {
  let v = 0;
  const c = S.ball,
    cp = c ? S.pos[c] : null;
  if (S.loose && same(h, S.loose)) v += DF.loose;
  if (cp) {
    if (same(h, cp)) v += DF.press;
    else if (hd(h, cp) === 1) v += DF.pressNext;
    for (const t of T) {
      if (covered.has(t.id) || hd(cp, t.h) > RANGE.lob) continue;
      const lane = hexLine(cp, t.h).slice(1, -1);
      if (lane.some((x) => same(x, h))) v += DF.lane * t.d;
      else if (hd(h, t.h) <= 1) v += DF.tight * t.d;
    }
    // shooting lane, to the side the keeper covers least
    if (gDist(att, cp) <= 6) {
      const gk = gkOf(other(att));
      let worst = null;
      for (const z of [0, 1, 2, 3, 4, 5]) {
        const s = saveP(z, S.pos[gk], att, gDist(att, cp), PL[gk].ref, null, cp);
        if (!worst || s < worst.s) worst = { s, z };
      }
      if (
        hexLine(cp, aimHex(att, worst.z))
          .slice(1)
          .some((x) => same(x, h))
      )
        v += DF.shot;
    }
  }
  if (S.fl && S.fl.kind === 'lob' && same(h, S.fl.target)) v += DF.loose * 0.8;
  return v;
}
// Pick defenders' moves: up to `sends` players, total steps ≤ budget, each up to `reachN` hexes.
function cpuDefMoves(budget, sends, reachN, exclude = new Set()) {
  const att = S.attack,
    def = other(att),
    T = threats(att),
    covered = new Set(),
    taken = new Set(), // hexes already picked this call: never send two defenders to the same hex
    out = [];
  for (let n = 0; n < sends && budget > 0; n++) {
    let best = null;
    for (const d of mine(def)) {
      if (exclude.has(d) || d === S.out || PL[d].role === 'GK' || PL[d].pac === 0) continue;
      const here = hexValue(att, S.pos[d], T, covered);
      for (const [, inf] of defReach(S, d, Math.min(reachN, budget))) {
        if (taken.has(key(...inf.h))) continue;
        const v = hexValue(att, inf.h, T, covered) - here - inf.d * DF.stepCost + crnd() * DF.noise;
        if (v > 0.15 && (!best || v > best.v)) best = { v, pid: d, to: inf.h.slice(), d: inf.d };
      }
    }
    if (!best) break;
    out.push(best);
    exclude.add(best.pid);
    taken.add(key(...best.to));
    budget -= best.d;
    // the threat he now covers counts less for the next pick
    for (const t of T)
      if (hd(best.to, t.h) <= 1 || hexLine(S.ball ? S.pos[S.ball] : best.to, t.h).some((x) => same(x, best.to)))
        covered.add(t.id);
  }
  return out;
}
// One mark on the most dangerous attacker a free defender can pick up (keeps an existing mark on a bigger threat).
function cpuMarkBest(exclude) {
  const att = S.attack,
    T = threats(att),
    cur = Object.entries(marksNow())[0];
  const curD = cur ? (T.find((t) => t.id === cur[1]) || { d: 0 }).d : -1;
  for (const t of T) {
    if (t.d <= curD + 0.15) break;
    let best = null;
    for (const d of mine(other(att))) {
      if (exclude.has(d) || !canMark(d, t.id)) continue;
      const v = hd(S.pos[d], S.pos[t.id]);
      if (!best || v < best.v) best = { v, d };
    }
    if (best) {
      setMark(best.d, t.id);
      return;
    }
  }
}
