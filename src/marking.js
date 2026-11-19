// Marking (v1.6, react phase since v1.9). At a pause the defender taps one of his players, then an attacker: he marks him.
// A marker follows on his own: each frame (after the attackers step) he moves 1 hex towards the goal-side hex
// next to his man. Marks are free, cost no steps, and stay in place while the same team keeps defending.
// Sending a marker somewhere (Prepare or a step order) breaks his mark.
// S.marks = { defenderId: attackerId }, S.marksOf = the team those marks belong to.

// The hex next to `a` that is closest to the defending goal (free, or the marker's own hex); ties → nearest the marker.
function goalSide(st, d, a) {
  const h = st.pos[a];
  let best = null;
  for (const n of nbrs(...h)) {
    const here = at(st, n).filter((x) => x !== d);
    if (here.length) continue;
    const v = gDist(team(a), n) * 10 + hd(n, st.pos[d]);
    if (!best || v < best.v) best = { v, h: n };
  }
  return best ? best.h : null;
}
// One hex towards the goal-side spot; never through or onto a player, never onto the kick-off spot while it's blocked.
function markStep(st, d, a) {
  const T = goalSide(st, d, a);
  if (!T || same(st.pos[d], T)) return null;
  const cur = hd(st.pos[d], T);
  let best = null;
  for (const n of nbrs(...st.pos[d])) {
    if (at(st, n).length) continue;
    if (st.koBlock && n[0] === KOC && n[1] === MIDR) continue;
    const v = hd(n, T) * 10 + gDist(team(a), n);
    if (hd(n, T) < cur && (!best || v < best.v)) best = { v, h: n };
  }
  return best ? best.h : null;
}
function marksNow() {
  const def = other(S.attack);
  if (S.marksOf !== def) {
    S.marks = {};
    S.marksOf = def;
  }
  return S.marks;
}
function canMark(d, a) {
  return (
    d !== S.out &&
    team(d) !== team(a) &&
    PL[d].pac > 0 &&
    PL[a].role !== 'GK' &&
    (marksNow()[d] === a || hd(S.pos[d], S.pos[a]) <= MARK_RANGE)
  );
}
// Toggle/assign a mark. One marker per attacker, at most MARKS markers. Returns a message if refused.
function setMark(d, a) {
  const M = marksNow();
  if (M[d] === a) {
    delete M[d];
    return null;
  }
  if (!canMark(d, a)) return `${nm(d)} is too far from ${nm(a)} to pick him up (max ${MARK_RANGE} hexes).`;
  for (const k in M) if (M[k] === a) delete M[k];
  // at the cap, the newest mark replaces the oldest
  while (!M[d] && Object.keys(M).length >= MARKS) delete M[Object.keys(M)[0]];
  M[d] = a;
  gl(`mark ${d} on ${a}`, 'def');
  if (S.orders) S.orders = S.orders.filter((o) => o.pid !== d || o.done); // marking replaces any walk he was on
  return null;
}
function dropMark(d) {
  if (S.marks) delete S.marks[d];
}
// Called once per frame in playback, after the defenders' orders. Returns 'end' if a marker wins a loose ball.
async function stepMarks() {
  const M = marksNow(),
    busy = new Set((S.orders || []).filter((o) => !o.done).map((o) => o.pid));
  for (const d in M) {
    if (busy.has(d) || !S.pos[d] || !S.pos[M[d]]) continue;
    const n = markStep({ pos: S.pos, koBlock: S.koBlock }, d, M[d]);
    if (!n) continue;
    S.pos[d] = n.slice();
    if (S.loose && same(n, S.loose)) return await winBall(d, 'pounces on the loose ball');
  }
}
// CPU: mark the most dangerous attackers (closest to goal) with the nearest free defender in range.
function cpuMarks() {
  const att = S.attack,
    def = other(att),
    M = marksNow(),
    used = new Set(Object.keys(M));
  const threats = mine(att)
    .filter((a) => PL[a].role !== 'GK' && !Object.values(M).includes(a))
    .sort((x, y) => gDist(att, S.pos[x]) - gDist(att, S.pos[y]));
  for (const a of threats) {
    if (Object.keys(M).length >= MARKS) break;
    let best = null;
    for (const d of mine(def)) {
      if (used.has(d) || !canMark(d, a)) continue;
      const v = hd(S.pos[d], S.pos[a]);
      if (!best || v < best.v) best = { v, d };
    }
    if (best) {
      M[best.d] = a;
      used.add(best.d);
      gl(`mark ${best.d} on ${a}`, 'def');
    }
  }
}
