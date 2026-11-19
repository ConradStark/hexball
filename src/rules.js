function rankFall(th) {
  th.sort((x, y) => y.p0 - x.p0);
  th.forEach((t, i) => {
    t.mult = FALL[i] ?? 0.1;
    t.p = t.p0 * t.mult;
  });
  return th;
}
function survive(th) {
  return th.reduce((a, t) => a * (1 - t.p), 1);
}
// v2.25 respond mode: the defender reading the play (Anticipate), the man being pressed, the defender set to block.
function readPid(def) {
  // v2.56: the read is a trap: hidden from the attack while it plans (its odds, the board, the CPU's planner);
  // it shows and counts once play starts
  if (S.phase === 'plan' || S.phase === 'cpuplan' || S.phase === 'gate') return null;
  const r = respond() && S.read && S.read.of === def ? S.read.pid : null;
  return r && S.pos[r] && r !== S.beaten && r !== S.out ? r : null;
}
function pressOn(pid) {
  return respond() && S.press && S.press.on === pid && S.pos[S.press.pid] && hd(S.pos[S.press.pid], S.pos[pid]) <= 1;
}
function blockPid(def) {
  return respond() && S.block && S.block.of === def ? S.block.pid : null;
}
function passEval(st, from, to, kind, com = new Set(), buff = 0) {
  const a = st.pos[from],
    b = st.pos[to],
    d = hd(a, b),
    T = TIER[kind],
    A = px(...a),
    B = px(...b);
  const lane = kind === 'ground' ? hexLine(a, b).slice(1) : [b],
    rank = { star: 4, press: 3, ctrl: 2, shadow: 1 },
    th = [],
    pr = [],
    rdr = readPid(other(team(from)));
  for (const o of mine(other(team(from)))) {
    if (o === S.beaten || o === S.out) continue;
    const q = st.pos[o],
      gk = PL[o].role === 'GK';
    if (gk && !keeperIn(o, q)) continue; // v2.16: the keeper only plays for passes inside his own box
    let tier = null,
      hex = null,
      read = false;
    if (same(q, a)) {
      tier = 'press';
      hex = a;
    }
    // v2.27: only a defender ON the ball's path (or the passer's / receiver's hex) can touch it; next to it does nothing
    for (const h of lane) {
      if (same(q, h) && (!tier || rank.star > rank[tier])) {
        tier = 'star';
        hex = h;
      }
    }
    // v2.61: the keeper's reach: in his box he can dive at a ball going past right next to him (user's T15: a
    // ground pass went by the keeper's side untouched). Lower odds than one through his hex.
    let reach = false;
    if (gk && !tier) {
      const h = lane.find((x) => hd(q, x) === 1 && keeperIn(o, x) && !same(x, a));
      if (h) {
        tier = 'star';
        hex = h;
        reach = true;
      }
    }
    // Anticipate (v2.27: on his own hex only): +READ on the contest he's already in
    if (o === rdr && tier === 'star' && !reach) read = true;
    if (!tier) continue;
    if (T[tier]) {
      const p0 =
        gk && tier === 'star'
          ? reach
            ? KEEPER_REACH[kind]
            : KEEPER_CLAIM[kind] // v2.16: on the ball's path or where it lands: he uses his hands
          : gk && tier === 'press'
            ? KEEPER_SMOTHER // v2.17: on the passer's hex
            : clamp(
                (tierBase(kind, tier, same(hex, b)) + dm(o) + comB(com, o) + (read ? READ_BONUS : 0)) * (1 - buff),
                0.02,
                0.85,
              );
      th.push({ pid: o, tier, hex, p0, read, target: same(hex, b), kind: kind === 'lob' ? 'header' : 'intercept' });
    } else if (PRESS[kind][tier]) {
      pr.push({
        pid: o,
        tier,
        hex,
        target: same(hex, b),
        p0: clamp(PRESS[kind][tier] + dm(o) * 0.5 + (com.has(o) ? 0.05 : 0), 0.02, 0.3),
      });
    }
  }
  rankFall(th);
  rankFall(pr);
  let sc = 0;
  if (kind === 'lob' || d > LONG_GROUND) {
    sc = kind === 'lob' ? 0.09 + Math.max(0, d - 4) * 0.025 : 0.08 + (d - LONG_GROUND - 1) * 0.05;
    sc -= (PL[from].pas - 75) / 250;
    sc = clamp(sc, 0.03, 0.45);
  }
  const prs = pr.reduce((a, t) => a + t.p, 0);
  // v2.60: Pinpoint (midfielders) takes away the pass's own scatter, but not the Press (user: pressed a midfielder
  // and it did nothing)
  if (PL[from] && PL[from].role === 'MF') sc = 0;
  sc = sc + prs + (pressOn(from) ? PRESS_SCAT : 0); // v2.25 Press: he's hurried
  sc = sc > 0 ? clamp(sc - buff, 0.02, 0.6) : 0;
  const p = survive(th);
  return {
    p,
    clean: p * (1 - sc),
    th,
    pr,
    prs,
    scatter: sc,
    long: sc > 0,
    d,
    lane,
    crit: clamp(0.06 + Math.max(0, PL[from].pas - 70) / 250, 0, 0.3),
  };
}
function dribbleEval(st, pid, path, com = new Set(), buff = 0) {
  const th = [],
    T = TIER.dribble,
    rdr = readPid(other(team(pid)));
  for (const o of mine(other(team(pid)))) {
    if (o === S.beaten || o === S.out) continue;
    const q = st.pos[o],
      gk = PL[o].role === 'GK';
    if (gk && !keeperIn(o, q)) continue;
    let j = -1,
      tier = null;
    if (same(q, path[0])) {
      j = 0;
      tier = 'star';
    } else if (gk) {
      // v2.17: a dribble that comes next to the keeper in his box: he rushes out at it
      const k = path.findIndex((h, i) => i > 0 && hd(h, q) <= 1 && inBox(h, team(o)));
      if (k > 0) [j, tier] = [k, 'rush'];
    }
    if (!tier) continue;
    th.push({
      pid: o,
      tier,
      t: j,
      hex: path[j],
      kind: 'tackle',
      p0: gk
        ? tier === 'rush'
          ? KEEPER_RUSH
          : KEEPER_SMOTHER
        : clamp(
            (T[tier] + (PL[o].def - PL[pid].dri) / 200 + comB(com, o) + (o === rdr ? READ_BONUS : 0)) * (1 - buff),
            0.03,
            0.85,
          ),
    });
  }
  rankFall(th);
  return { p: survive(th), th };
}
// The goal mouth as the shooter sees it (v2.15): the angle between the two posts, in degrees. Wide and far = small.
function goalAngle(att, s) {
  const G = goalPx(att),
    hw = (R * SQ3 * GOALW) / 2,
    P = px(...s),
    dy = Math.abs(G[1] - P[1]) || 1;
  return (Math.abs(Math.atan2(G[0] + hw - P[0], dy) - Math.atan2(G[0] - hw - P[0], dy)) * 180) / Math.PI;
}
function sideOf(att, s) {
  const v = (s[0] - MIDC) / MIDC;
  return att === 'H' ? v : -v;
}
function zoneMods(att, s, zone) {
  const top = zone < 3,
    zc = (zone % 3) - 1,
    side = sideOf(att, s),
    w = Math.min(1, Math.abs(side) * 1.5);
  const near = zc !== 0 && Math.abs(side) > 0.1 && Math.sign(zc) === Math.sign(side),
    far = zc !== 0 && Math.abs(side) > 0.1 && !near;
  let acc = 0;
  if (top) acc -= 0.1;
  if (zc === 0) acc += 0.05;
  if (near) acc += 0.08 * w;
  if (far) acc -= 0.25 * w; // v2.15: across the keeper to the far post from wide is hard (was 0.12)
  return { acc, top, near, far, centre: zc === 0 };
}
function shotEval(st, pid, zone, com = new Set(), buff = 0, as = null) {
  const s = st.pos[pid],
    att = team(pid),
    dg = gDist(att, s),
    P = PL[pid],
    top = zone < 3,
    T = TIER.shot,
    zm = zoneMods(att, s, zone),
    hdr = !!(as && as.header),
    defs = mine(other(att)).filter((o) => PL[o].role !== 'GK' && o !== S.beaten && o !== S.out && st.pos[o]),
    // v2.22: pressure only from a defender level with him or goal side (one behind him isn't in his face; same as the
    // close blocks below)
    press = Math.min(3, defs.filter((o) => hd(st.pos[o], s) === 1 && gDist(att, st.pos[o]) <= dg).length);
  // v2.15: on target comes from how much of the goal he can see (the angle between the posts), so distance and
  // tight angles both count: ~95% from the six-yard box, ~80% from the spot, ~45% from 30 m, ~35% past the post.
  const acc = clamp(
    SHOT_BASE +
      goalAngle(att, s) * SHOT_PER_DEG -
      press * SHOT_PRESS - // v2.16: defenders breathing down his neck
      (pressOn(pid) ? PRESS_ACC : 0) + // v2.25 Press
      (P.sho - 75) / 250 +
      buff +
      zm.acc +
      (as ? as.acc : 0) +
      (hdr ? (top ? -0.05 : 0.05) : 0),
    0.08,
    0.98,
  );
  const lane = hexLine(s, aimHex(att, zone)).slice(1), // the lane towards the side he's aiming at
    th = [],
    rdr = readPid(other(att)),
    blk = blockPid(other(att));
  for (const o of defs) {
    const q = st.pos[o];
    let tier = null,
      base = 0;
    if (same(q, s)) [tier, base] = ['star', T.star];
    else if (lane.some((h) => same(h, q))) [tier, base] = ['lane', T.lane];
    // v2.31: no "close" blocks any more (v2.16 let a defender next to the shooter block every aim spot):
    // like passes, only a defender on the shooter's hex or on the ball's line to the aimed spot can block
    if (!tier) continue;
    const bonus = (o === rdr ? READ_BONUS : 0) + (o === blk ? BLOCK_BONUS : 0);
    th.push({
      pid: o,
      tier,
      kind: 'block',
      read: o === rdr,
      p0: clamp(base + dm(o) * 0.5 + comB(com, o) + bonus, 0.03, bonus ? 0.85 : 0.8),
    });
  }
  rankFall(th);
  const thr = survive(th);
  return {
    p: acc * thr,
    acc,
    thr,
    th,
    dg,
    lane,
    press,
    zm,
    as,
    hdr,
    // v2.15: crit strikes rarer (were 7% + finishing/250 + 6% top, ~18% of shots)
    crit: clamp(0.03 + Math.max(0, P.sho - 70) / 400 + (top ? 0.03 : 0), 0, 0.12),
  };
}
// Keeper (v1.26): a real piece. His save chance on a shot at `z` comes from where he stands: in line with the side
// of the goal the shot is aimed at = strong, a column off = light, two off = almost nothing. Off his line (up to 2
// rows) he narrows the angle for low shots but is easier to beat over the top. kRel: 'cover' | 'adj' | 'open'.
function keeperCols(gkPos, att, z) {
  return Math.abs(px(...gkPos)[0] - aimX(att, z)) / (R * SQ3);
}
function kRel(z, gkPos, att) {
  const d = keeperCols(gkPos, att, z);
  return d < 0.6 ? 'cover' : d < 1.6 ? 'adj' : 'open';
}
function saveP(z, gkPos, att, dg, ref, as = null, s = null) {
  // v2.15: a keeper who is behind the shooter (further from his own goal) is out of it: on target = goal
  if (gDist(att, gkPos) > dg) return 0;
  // v2.17: closing the angle. A keeper next to the shooter (level or goal side), or 2 away goal side, fills the goal: the
  // corners are much nearer to him than they are from his line (KEEPER_CLOSE: × on the columns he has to cover).
  const kd = s ? hd(gkPos, s) : 9,
    close = (kd === 1 && gDist(att, gkPos) <= dg) || (kd === 2 && gDist(att, gkPos) < dg) ? KEEPER_CLOSE[kd] : 1;
  const d = keeperCols(gkPos, att, z) * close,
    off = Math.min(2, Math.abs(gkPos[1] - aimHex(att, z)[1])),
    near = d < 1.6,
    // v2.15: two columns off, the further out the shot, the more time he has to get across: 5% from point blank,
    // KEEPER_FAR from the edge of the box out
    far = clamp(0.05 + 0.1 * (dg - 2), 0.05, KEEPER_FAR);
  // v2.3: in line 72%, a column off 46% (as before), then it falls away fast two columns off
  let p =
    d <= 1
      ? KEEPER_IN_LINE - (KEEPER_IN_LINE - KEEPER_ONE_OFF) * d
      : Math.max(far, KEEPER_ONE_OFF - (KEEPER_ONE_OFF - far) * (d - 1));
  if (near) p += (ref - 75) / 200 + (dg - 2) * 0.03;
  p += Math.max(0, dg - 3) * 0.05; // v2.15: from outside the box he has time to get across, wherever it's aimed
  if (z < 3)
    p -= 0.08 + 0.05 * off; // top corners, a bit worse with the keeper off his line
  else p += 0.06 * off; // low shots: he's closed the angle
  if (as) p *= 1 - as.saveCut;
  return clamp(p, 0.02, 0.92);
}
// Keeper-aware reach for the defence: the keeper stays in his own box and never steps onto an attacker.
function defReach(st, pid, steps) {
  const rr = reach(st, pid, steps);
  if (PL[pid].role !== 'GK') return rr;
  for (const [k, inf] of [...rr]) {
    if (!inBox(inf.h, team(pid)) || at(st, inf.h).some((x) => team(x) !== team(pid))) rr.delete(k);
  }
  return rr;
}
const canDefMove = (id) => PL[id].pac > 0 || PL[id].role === 'GK';
function asTxt(as) {
  const a = Math.round(as.acc * 100);
  return `${as.name}${as.header ? ' · header' : as.volley ? ' · volley' : ''}: ${a >= 0 ? '+' : '−'}${Math.abs(a)}% on target, keeper −${Math.round(as.saveCut * 100)}%`;
}
function gkOf(t) {
  return mine(t).find((id) => PL[id].role === 'GK');
}
// bonus for a defender who moved this turn
function comB(com, o) {
  return com.has(o) ? COMMIT : 0;
}
function tierBase(kind, tier, target) {
  return kind === 'ground' && tier === 'star' && !target ? TIER.ground.lane : TIER[kind][tier];
}
function passP(kind, tier, o, b, target = true) {
  const rd = tier !== 'press' && o === readPid(team(o)) ? READ_BONUS : 0; // v2.25 Anticipate
  return clamp((tierBase(kind, tier, target) + dm(o) + comB(S.com, o) + rd) * (1 - b), 0.02, 0.85);
}
function wideHex(h) {
  return h[0] <= 1 || h[0] >= COLS - 2;
}
// v2.21: every hex a cross can be played from (out wide, within lob range of somewhere 3 or less from goal)
function crossFromHexes(att) {
  const near = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (gDist(att, [c, r]) <= 3) near.push([c, r]);
  const out = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const h = [c, r];
      if (wideHex(h) && near.some((t) => hd(h, t) <= RANGE.lob)) out.push(h);
    }
  return out;
}
function crossOK(st, c, t) {
  return (
    PL[c] && PL[c].role === 'WG' && // v2.41: only wingers cross (from wide, to a runner within 3 of goal)
    PL[t].role !== 'GK' && wideHex(st.pos[c]) && gDist(team(c), st.pos[t]) <= 3 && hd(st.pos[c], st.pos[t]) <= RANGE.lob
  );
}
// Chance that a defender who wins the ball clears it rather than keeping it (v2.8).
function clearP(h, t) {
  return inBox(h, t) ? CLEAR_BOX : CLEAR_ELSE;
}
function tackleP(pid) {
  return clamp(0.5 + (PL[pid].def - PL[S.ball].dri) / 200, 0.2, 0.8);
}
function dCrit(pid, com) {
  return rnd() < clamp(0.08 + (PL[pid].def - 70) / 300 + (com.has(pid) ? 0.04 : 0), 0.03, 0.15);
}

// v2.26: chance a planned pass arrives (for its colour on the board); a pass into space aims at a stand-in token
function passChance(st, a) {
  if (!st.pos[a.from]) return null;
  if (a.to && st.pos[a.to]) return passEval(st, a.from, a.to, a.kind, new Set(), buffFor(a.from)).clean;
  if (!a.target) return null;
  const vs = cloneSt(st);
  vs.pos._T = a.target.slice();
  return passEval(vs, a.from, '_T', a.kind, new Set(), buffFor(a.from)).clean;
}
