function defOnLoose() {
  if (!S.loose) return null;
  return at(S, S.loose).find((x) => team(x) !== S.attack) || null;
}
// Defenders who can contest the ball on hex h. v2.16: the keeper too, inside his own box (he can use his hands).
function foesOn(h, t) {
  return at(S, h).filter(
    (x) =>
      team(x) !== t && (PL[x].role !== 'GK' || keeperIn(x, h)) && x !== S.beaten && x !== S.out && !S.duelled.has(x),
  );
}
const isKeeper = (o) => PL[o].role === 'GK';
// a keeper who claims the ball holds it (no clearance); anyone else may clear it
const claimOrClear = async (o, what) =>
  isKeeper(o) ? await winBall(o, 'claims it') : (await maybeClear(o)) || (await winBall(o, what));
async function winBall(o, what) {
  gl(`WON ${o}@${hx(S.pos[o])} (${what})`, 'bad');
  S.lastCarrier = S.ball || (S.fl && S.fl.from) || (S.lpass && S.lpass.from) || null; // for the turnover push-back
  S.flight = null;
  S.fl = null;
  S.ball = o;
  S.loose = null;
  const crit = dCrit(o, S.com);
  log(`${nm(o)} ${what}${crit ? ' — crit!' : ''}`, crit ? 'crit' : 'bad');
  return await turnover(o, crit);
}
// v2.8: a defender who has won a contest keeps it (turnover) or clears it. Returns null when he keeps it, so the
// caller carries on with its own turnover; otherwise the clearance's result ('end').
async function maybeClear(o) {
  if (!S.pos[o] || rnd() >= clearP(S.pos[o], team(o))) return null;
  return await clearance(o);
}
// The clearance: the ball flies 3–4 hexes away from his own goal and lands; whoever is standing there has it,
// otherwise it's loose. Either way the play stops here (a loose ball is a race next turn).
async function clearance(o) {
  const t = team(o),
    from = S.pos[o].slice(),
    away = (h) => gDist(other(t), h), // distance from his own goal
    cands = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const h = [c, r],
        d = hd(from, h);
      if (d >= CLEAR_DIST[0] && d <= CLEAR_DIST[1] && away(h) > away(from)) cands.push(h);
    }
  const free = cands.filter((h) => !at(S, h).length),
    pool = free.length ? free : cands.length ? cands : [from],
    spot = pool[Math.floor(rnd() * pool.length)];
  gl(`CLEAR ${o}@${hx(from)} > ${hx(spot)}`, 'bad');
  log(`${nm(o)} clears it`, 'bad');
  S.fl = null;
  S.flight = null;
  if (S.mode !== 'sim') {
    const A = TW.ball ? TW.ball.cur : px(...from),
      B = px(...spot);
    tweenEl('ball', $('#ball'), B, 620, true, { A, B, t0: 0, t1: 1 });
    popWord(px(...from), 'Cleared!', 'def');
    await sleep(reduce ? 100 : 700);
  }
  const here = at(S, spot),
    mate = here.find((x) => team(x) === t),
    foe = here.find((x) => team(x) !== t);
  S.ball = null;
  S.loose = null;
  if (mate) {
    S.ball = null;
    S.loose = spot.slice();
    return await winBall(mate, 'collects the clearance');
  }
  clearPlay();
  if (foe) {
    S.ball = foe;
    gl(`recv ${foe}@${hx(spot)} (clearance)`, 'att');
    log(`${nm(foe)} picks up the clearance`, 'att');
  } else {
    S.loose = spot.slice();
    gl(`loose @${hx(spot)}`, 'info');
    log('The clearance runs loose', 'info');
  }
  S.koBlock = false;
  S.buff = null;
  await settle();
  startTurn();
  return 'end';
}
// v2.64: tap a defender you've already sent (or set to tackle) this window = take it back and pick again
function editOrder(pid) {
  const o = (S.orders || []).find((q) => q.pid === pid && !q.done && q.idx === 0 && S.frame && q.start > S.frame.k);
  if (o) {
    S.orders = S.orders.filter((q) => q !== o);
    S.budget += o.path.length - 1;
    S.sent = Math.max(0, (S.sent || 0) - 1);
    gl(`order ${pid} taken back`, 'def');
    return true;
  }
  if (S.tkPend === pid) {
    S.tkPend = null;
    S.budget += 2;
    S.sent = Math.max(0, (S.sent || 0) - 1);
    gl(`tackle ${pid} taken back`, 'def');
    return true;
  }
  return false;
}
// v2.62: a defender who moves gives up his read (Anticipate is for standing your ground)
function dropRead(pid) {
  if (S.read && S.read.pid === pid) {
    S.read = null;
    gl(`read off ${pid} (moved)`, 'def');
  }
}
function addOrder(pid, to, f) {
  const rr = defReach(S, pid, Math.min(ORDER_MAX, S.budget));
  if (!rr.has(key(...to))) return false;
  const path = pathFrom(rr, S.pos[pid], to);
  dropMark(pid);
  dropRead(pid);
  S.orders = S.orders.filter((o) => o.pid !== pid);
  S.orders.push({ pid, path, idx: 0, start: f + 1 + DELAY, done: false });
  gl(`order ${pid} ${hx(S.pos[pid])}>${hx(to)} (${path.length - 1} st, ${S.budget - path.length + 1} left)`, 'def');
  S.budget -= path.length - 1;
  S.sent = (S.sent || 0) + 1;
  log(`${nm(pid)} is sent ${path.length - 1} hex${path.length > 2 ? 'es' : ''} (moves from the next frame)`, 'def');
  return true;
}
async function stepOrders(f) {
  for (const o of S.orders) {
    if (o.done || o.start > f) continue;
    const nx = o.path[o.idx + 1];
    if (!nx) {
      o.done = true;
      continue;
    }
    const others = at(S, nx).filter((x) => x !== o.pid);
    // v2.33: defenders may share a hex with attackers, so an attacker on (or moving along) his path doesn't stop him;
    // a teammate standing there makes him wait a frame instead of cancelling the order
    if (S.koBlock && nx[0] === KOC && nx[1] === MIDR) {
      o.done = true;
      continue;
    }
    if (others.some((x) => team(x) === team(o.pid))) continue;
    S.pos[o.pid] = nx.slice();
    o.idx++;
    S.com.add(o.pid);
    if (o.idx >= o.path.length - 1) o.done = true;
    if (S.loose && same(nx, S.loose)) return await winBall(o.pid, 'pounces on the loose ball');
  }
}
function gotBall(pid) {
  S.scattered = false; // back under control
  const L = S.lpass;
  if (!L) return;
  S.lpass = null;
  // v1.21 control touch: after a lob the receiver needs a frame to control it before his next touch (a defence window
  // falls in between). v2.24: a ground pass is played first time (he can pass or shoot again at once); card passes
  // (Give & Go return, Cross) stay first-time too.
  if (!L.gng && L.kind !== 'ground' && typeof S.frameNo === 'number') {
    S.ctrl = { pid, until: S.frameNo + 1 + CONTROL };
    popWord(px(...S.pos[pid]), 'Control', '');
  }
  log(`${L.kind === 'lob' ? 'Lob' : 'Pass'} ${nm(L.from)} → ${nm(pid)}`, 'att');
  if (rnd() < L.e.crit) {
    S.buff = { pid, v: 0.12 };
    log(`Perfect pass! ${nm(pid)} gets +12% on his next action`, 'crit');
  }
}
// Attackers step along their planned paths. v1.8: mid-run they go through anyone who got in the way (defenders
// can't block a run by stepping into it; a dribbler meeting a defender gets a 1v1 instead). Only the last hex can stop
// them: a teammate still standing there (wait for him if he's moving off it this turn, else stop short).
function stepMovers() {
  const order = S.movers.filter((m) => !m.done);
  for (let pass = 0; pass < 2; pass++)
    for (const m of order) {
      if (m.done || m.stepped === S.frameNo) continue;
      stepMover(m, pass === 1);
    }
}
function stepMover(m, lastTry) {
  {
    const nx = m.path[m.idx + 1];
    if (!nx) {
      m.done = true;
      return;
    }
    const final = m.idx + 1 === m.path.length - 1,
      mates = at(S, nx).filter((x) => x !== m.pid && team(x) === team(m.pid));
    // v2.39 Wall: a run (not a dribble: that's a 1v1) stops in front of a defender standing in its way
    const wall = !m.drib && at(S, nx).find((x) => team(x) !== team(m.pid) && isWall(x));
    if (wall) {
      m.done = true;
      gl(`wall ${wall} stops ${m.pid} at ${hx(S.pos[m.pid])}`, 'def');
      log(`${nm(wall)} blocks ${nm(m.pid)}'s run`, 'def');
      return;
    }
    if (final && mates.length) {
      const leaving = mates.every((x) => S.movers.some((o) => o.pid === x && !o.done));
      if (leaving && !lastTry) return; // let him move off first this frame
      if (leaving && (m.waits = (m.waits || 0) + 1) < 3) return; // he hasn't gone yet: wait a frame
      m.done = true;
      log(`${nm(m.pid)} is stopped short`, 'att');
      return;
    }
    m.stepped = S.frameNo;
    S.pos[m.pid] = nx.slice();
    m.idx++;
    // v2.37.1: a sprinter (moving twice) shows his sprint mark as soon as a normal run is done and he still has hexes
    // to go — so the window after frame 3 shows who's still running (the defence answers his 2 with their 2)
    if (m.sprint && m.idx >= (m.base || MOVE) && !m.done) (S.sprinting || (S.sprinting = new Set())).add(m.pid);
    if (m.idx >= m.path.length - 1) m.done = true;
    if (m.drib && m.done && S.ball === m.pid) event(`${nm(m.pid)} stops with the ball`);
    if (S.loose && same(nx, S.loose)) {
      S.ball = m.pid;
      S.loose = null;
      m.done = true;
      log(`${nm(m.pid)} collects it`, 'att');
      gl(`collect ${m.pid}@${hx(nx)}`, 'att');
      gotBall(m.pid);
      const cb = S.onCollect;
      if (cb) {
        S.onCollect = null;
        cb(m.pid);
      }
    }
  }
}
async function dribCheck() {
  const d = S.movers.find((m) => m.drib);
  if (!d || S.ball !== d.pid) return;
  for (const o of foesOn(S.pos[d.pid], team(d.pid))) {
    S.duelled.add(o);
    const p = isKeeper(o)
      ? KEEPER_SMOTHER // v2.17: he goes down at the dribbler's feet
      : clamp(
          (TIER.dribble.star +
            (PL[o].def - PL[d.pid].dri) / 200 +
            comB(S.com, o) +
            (o === readPid(team(o)) ? READ_BONUS : 0)) *
            (1 - (d.b || 0)),
          0.03,
          0.85,
        );
    if (await duel({ type: 'dribble', att: d.pid, def: o, p })) return await claimOrClear(o, 'wins it on the ball');
    S.beaten = o;
  }
  // v2.17: the keeper rushes out at a dribbler who comes next to him in his box
  const gk = gkOf(other(team(d.pid))),
    h = S.pos[d.pid];
  if (
    gk &&
    S.pos[gk] &&
    gk !== S.beaten &&
    gk !== S.out &&
    !S.duelled.has(gk) &&
    inBox(h, team(gk)) &&
    hd(S.pos[gk], h) === 1
  ) {
    S.duelled.add(gk);
    if (await duel({ type: 'dribble', att: d.pid, def: gk, p: KEEPER_RUSH }))
      return await claimOrClear(gk, 'comes out and smothers it');
    S.beaten = gk;
    if (S.mode !== 'sim') popWord(px(...h), 'Rounds him!', 'att');
  }
}
async function pressContest(from, kind) {
  const b = buffFor(from);
  for (const o of foesOn(S.pos[from], team(from))) {
    S.duelled.add(o);
    if (
      await duel({
        type: kind === 'lob' ? 'lob' : 'pass',
        tier: 'press',
        att: from,
        passer: from,
        receiver: from,
        def: o,
        p: isKeeper(o) ? KEEPER_SMOTHER : passP(kind, 'press', o, b),
      })
    )
      return await claimOrClear(o, kind === 'lob' ? 'charges it down' : 'blocks it at source');
    S.beaten = o;
  }
}
function launch(from, target, kind, info = {}) {
  const b = buffFor(from);
  if (b) S.buff = null;
  S.fl = {
    from,
    fromHex: S.pos[from].slice(),
    target: target.slice(),
    kind,
    path: hexLine(S.pos[from], target).slice(1),
    idx: 0,
    f: 0,
    info,
    b,
  };
  gl(`${info.gngBack ? 'gng return' : kind} ${from}@${hx(S.fl.fromHex)} > ${hx(target)}`, 'att');
  S.lastKick = S.fl.fromHex.slice(); // v2.36: where it was kicked from (drawn in defending windows)
  S.ball = null;
  S.scattered = false;
  S.evt = null; // the ball is moving again: the react window is closed
}
// React windows (v2.8): the defence gets a pause every WIN_EVERY frames of play (before v2.8: each time the ball
// came to rest). S.evt is what happened since the last window. Prepare (before frame 1) covers the start.
function event(txt) {
  S.evt = txt; // latest wins: it is what the defender sees at the pause
}
// v1.10: a scattered pass is picked up by the intended receiver if he has movement left this turn: standing on the
// target he steps onto the ball now; still running to the target, his run is extended by that one hex.
function spareMoves(pid) {
  const m = S.movers.find((x) => x.pid === pid && !x.drib);
  return m ? (m.max || MOVE) - (m.path.length - 1) : runSteps(S, pid);
}
function adjustToScatter(target, spot) {
  if (at(S, spot).length) return false;
  const here = at(S, target).find((x) => team(x) === S.attack && PL[x].role !== 'GK');
  if (here && spareMoves(here) >= 1) {
    S.pos[here] = spot.slice();
    const m = S.movers.find((x) => x.pid === here);
    if (m) m.path.push(spot.slice()), (m.idx = m.path.length - 1), (m.done = true);
    log(`${nm(here)} adjusts and gets to it`, 'att');
    gl(`adjust ${here} > ${hx(spot)}`, 'att');
    return true;
  }
  const run = S.movers.find((x) => !x.done && !x.drib && same(x.path[x.path.length - 1], target));
  if (run && spareMoves(run.pid) >= 1) {
    run.path.push(spot.slice());
    log(`${nm(run.pid)} adjusts his run to reach it`, 'att');
    gl(`adjust run ${run.pid} +${hx(spot)}`, 'att');
    return true;
  }
  return false;
}
function keeperReachAt(h, F) {
  return mine(other(S.attack)).filter(
    (o) =>
      isKeeper(o) &&
      !S.duelled.has(o) &&
      o !== S.beaten &&
      S.pos[o] &&
      hd(S.pos[o], h) === 1 &&
      keeperIn(o, h) &&
      !(F.fromHex && same(h, F.fromHex)),
  );
}
async function land() {
  const F = S.fl;
  S.fl = null;
  // the ball is down at the landing spot: any redraw from here (aerial duel, scatter) starts from there,
  // not from a replay of the lob's arc
  S.flight = { xy: px(...F.target) };
  if (F.kind === 'lob') {
    for (const o of foesOn(F.target, S.attack)) {
      S.duelled.add(o);
      const rcv = at(S, F.target).find((x) => team(x) === S.attack);
      if (
        await duel({
          type: 'lob',
          tier: 'star',
          att: rcv || F.from,
          passer: F.from,
          receiver: rcv || F.from,
          def: o,
          p: isKeeper(o) ? KEEPER_CLAIM.lob : passP('lob', 'star', o, F.b),
        })
      )
        // v2.43: a won header is always a clearance (nobody heads it to his own feet); keepers still claim
        return isKeeper(o) ? await winBall(o, 'claims it') : await clearance(o);
      S.beaten = o;
    }
    // v2.61: a keeper next to where a lob lands (in his box) comes for it
    for (const o of foesOn(F.target, S.attack).length ? [] : keeperReachAt(F.target, F)) {
      S.duelled.add(o);
      const rcv = at(S, F.target).find((x) => team(x) === S.attack);
      if (
        await duel({
          type: 'lob',
          tier: 'star',
          att: rcv || F.from,
          passer: F.from,
          receiver: rcv || F.from,
          def: o,
          p: KEEPER_REACH.lob,
        })
      )
        return await winBall(o, 'comes and claims it');
    }
  }
  const vs = cloneSt(baseSt());
  vs.pos._T = F.target.slice();
  vs.pos[F.from] = F.fromHex.slice();
  const e = passEval(vs, F.from, '_T', F.kind, S.com, F.b);
  let spot = F.target;
  const pressed = pressOn(F.from);
  if (e.scatter > 0 && rnd() < e.scatter) {
    if (pressed) popWord(px(...F.fromHex), 'Pressed!', 'def'); // v2.60: say when the press did it
    const opts = nbrs(...F.target);
    spot = opts[Math.floor(rnd() * opts.length)];
    log(`The ${F.kind === 'lob' ? 'lob' : 'pass'} scatters (${pc(e.scatter)})`, 'info');
    popWord(px(...spot), 'Scatter!', 'bad');
    S.scattered = true; // a turnover from this loose ball isn't the passer's fault (no "beaten")
    gl(`scatter ${pc(e.scatter)} > ${hx(spot)}`, 'info');
    tweenBall(px(...spot), 260);
    await sleep(380);
  } else if (pressed) {
    popWord(px(...F.fromHex), 'Beats the press', 'att'); // v2.60: the press was on but the pass held
    gl(`press on ${F.from}: pass held (${pc(e.scatter)} scatter)`, 'info');
  }
  const foe = at(S, spot).find((x) => team(x) !== S.attack && (!isKeeper(x) || keeperIn(x, spot)));
  const adj = !foe && !same(spot, F.target) && !F.info.noCollect ? adjustToScatter(F.target, spot) : false;
  const mate = at(S, spot).find((x) => team(x) === S.attack);
  S.lpass = { from: F.from, kind: F.kind, e, vs, gng: F.info.gngBack };
  S.flight = null;
  if (mate) {
    S.ball = mate;
    event(`${nm(mate)} has the ball`);
    gl(`recv ${mate}@${hx(spot)}`, 'att');
    if (F.info.noCollect) S.lpass = null;
    else gotBall(mate);
    if (F.info.onRecv) {
      const r = await F.info.onRecv(mate);
      if (r) return r;
    }
    return;
  }
  if (foe) return await winBall(foe, isKeeper(foe) ? 'claims it' : 'collects it');
  // v2.27: no pounce from next door: a scattered ball nobody is on is loose (a race next turn)
  S.ball = null;
  S.loose = spot.slice();
  event('The ball is loose');
  popWord(px(...spot), 'Loose!', 'info'); // v2.48: say it on the board when it happens
  gl(`loose @${hx(spot)}`, 'info');
  if (F.info.onRecv && !F.info.noCollect) S.onCollect = F.info.onRecv;
  if (F.info.noCollect) log('The cross finds nobody', 'att');
  log(same(spot, F.target) ? 'The ball runs into space' : '…and runs loose', 'att');
}
// A ground pass's spot after i of its n hexes: on the straight line from the passer's hex to the target.
function passPt(F, i) {
  const A = px(...F.fromHex),
    B = px(...F.target),
    t = F.path.length ? Math.min(1, i / F.path.length) : 1;
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
}
async function advanceFlight() {
  const F = S.fl;
  if (!F) return;
  if (F.kind === 'lob') {
    F.f++;
    // drawn as one continuous arc: this frame covers flight parameter (f-1)/L → f/L (anim.js lobAt)
    S.flight = { lob: { A: px(...F.fromHex), B: px(...F.target), t0: (F.f - 1) / LOB_FRAMES, t1: F.f / LOB_FRAMES } };
    if (F.f >= LOB_FRAMES) {
      renderTokens({ dur: FRAME_MS, lin: true });
      await sleep(FRAME_MS);
      return await land();
    }
    return;
  }
  if (!F.path.length) return await land(); // passer and receiver on the same hex: it's there already
  S.flRest = null;
  for (let s = 0; s < GROUND_SPEED && F.idx < F.path.length; s++) {
    const h = F.path[F.idx];
    F.idx++;
    // v2.5: the ball is drawn on the straight line passer → target (not on hex centres, which zigzag)
    S.flight = { xy: passPt(F, F.idx) };
    const tgt = F.idx === F.path.length,
      foes = foesOn(h, S.attack),
      // v2.61: the keeper can dive at a ball going past right next to him in his box
      gkr = keeperReachAt(h, F);
    // v2.29: a contest: the ball goes to the defender's hex (not a point on the straight line, which can be a hex away)
    if (foes.length) S.flight = { xy: px(...h) };
    if (foes.length && S.mode !== 'sim') {
      // carry on at pass speed to the contest point (the defender's hex)
      const ms = (FRAME_MS * (s + 1 - (F.sDone || 0))) / GROUND_SPEED;
      // first contest this frame: everyone else starts this frame's move now (one clock for the whole frame)
      if (!F.sDone) renderTokens({ dur: FRAME_MS, lin: true });
      F.sDone = s + 1;
      tweenEl('ball', $('#ball'), S.flight.xy, ms, true);
      await sleep(ms);
    }
    for (const o of foes) {
      S.duelled.add(o);
      const rcv = at(S, h).find((x) => team(x) === S.attack);
      if (
        await duel({
          type: 'pass',
          tier: 'star',
          target: tgt && !!rcv,
          att: rcv || F.from,
          passer: F.from,
          receiver: rcv || F.from,
          def: o,
          p: isKeeper(o) ? KEEPER_CLAIM.ground : passP('ground', 'star', o, F.b, tgt),
        })
      )
        return await claimOrClear(o, tgt && rcv ? `steps in front of ${nm(rcv)}` : 'reads it and cuts it out');
      S.beaten = o;
      popWord(S.flight.xy, 'Through!', 'att'); // the pass beat him: it carries on
    }
    for (const o of foes.length ? [] : gkr) {
      S.duelled.add(o);
      if (S.mode !== 'sim') {
        tweenEl('ball', $('#ball'), px(...h), FRAME_MS / GROUND_SPEED, true);
        await sleep(FRAME_MS / GROUND_SPEED);
      }
      if (
        await duel({
          type: 'pass',
          tier: 'star',
          target: false,
          att: F.from,
          passer: F.from,
          receiver: F.from,
          def: o,
          p: KEEPER_REACH.ground,
        })
      )
        return await claimOrClear(o, 'dives and gets to it');
      popWord(px(...h), 'Past him!', 'att');
    }
    if (tgt) {
      // the last stretch takes only its share of the frame: the ball arrives at pass speed, not slowed to fit a frame
      S.ballMs = (FRAME_MS * Math.max(0.15, s + 1 - (F.sDone || 0))) / GROUND_SPEED;
      F.sDone = 0;
      return await land();
    }
  }
  // the rest of this frame's travel after a contest keeps the same speed (playPlan reads S.flRest)
  if (F.sDone) S.flRest = Math.max(0.05, (Math.min(GROUND_SPEED, F.idx) - F.sDone) / GROUND_SPEED);
  F.sDone = 0;
}
// Prepare: the attack is revealed and about to start; the defence nudges up to 2 defenders 1 hex each (free).
async function prepareWindow() {
  if (S.isCounter || S.skipPh) return;
  const def = other(S.attack);
  S.prepped = new Set();
  S.dUndo = [];
  if (isCPU(def)) cpuPrepare();
  else {
    S.phase = 'react';
    S.ui = freshUI();
    S.frame = { k: 0, prep: true };
    await new Promise((res) => {
      reactRes = res;
      render();
    });
    S.phase = 'resolve';
    S.ui = freshUI();
    S.frame = null;
    render();
  }
  if (S.prepped.size) gl(`prepare ${[...S.prepped].map((d) => `${d}>${hx(S.pos[d])}`).join(', ')}`, 'def');
  const w = S.loose && at(S, S.loose).find((x) => team(x) === def);
  if (w) return await winBall(w, 'gets to the loose ball first');
}
// Defence undo (v2.14): each Prepare move, order or mark in the current window can be taken back until Go.
function defSave() {
  (S.dUndo || (S.dUndo = [])).push({
    pos: JSON.parse(JSON.stringify(S.pos)),
    marks: S.marks ? { ...S.marks } : S.marks,
    marksOf: S.marksOf,
    orders: JSON.parse(JSON.stringify(S.orders || [])),
    budget: S.budget,
    sent: S.sent,
    prepped: new Set(S.prepped || []),
    com: new Set(S.com || []),
    reach: S.frame && S.frame.reach,
    read: S.read ? { ...S.read } : null,
    press: S.press ? { ...S.press } : null,
    block: S.block ? { ...S.block } : null,
    tkPend: S.tkPend || null,
    gl: (S.glog || []).length,
    log: S.log.slice(),
  });
}
function defUndo() {
  const u = S.dUndo && S.dUndo.pop();
  if (!u) return false;
  Object.assign(S, {
    pos: u.pos,
    marks: u.marks,
    marksOf: u.marksOf,
    orders: u.orders,
    budget: u.budget,
    sent: u.sent,
  });
  S.prepped = u.prepped;
  S.com = u.com;
  S.read = u.read;
  S.press = u.press;
  S.tkPend = u.tkPend;
  S.block = u.block;
  if (S.frame) S.frame.reach = u.reach;
  if (S.glog) S.glog.length = u.gl;
  S.log = u.log;
  return true;
}
function prepareMove(d, to) {
  S.pos[d] = to.slice();
  dropMark(d);
  S.prepped.add(d);
  S.com.add(d);
}
async function pauseB(f) {
  if (S.skipPh) return;
  const def = other(S.attack);
  // v2.8: a window every WIN_EVERY frames; v2.25 respond mode: after frame 1, then every WIN_EVERY (1, 3, 5…)
  if ((respond() ? f - 1 : f) % WIN_EVERY) return;
  // this window's budget: big at the first window, then what you saved (2 to 3)
  // v2.37 Respond (option B): every window, up to WIN_SENDS defenders move up to ORDER_MAX hexes each (no step pool:
  // it matches the attack, whose runners cover 2 hexes between windows). A counter's first window: one defender.
  S.budget = respond()
    ? S.win === 0 && S.isCounter
      ? ORDER_MAX
      : WIN_SENDS * ORDER_MAX
    : S.win === 0
      ? S.isCounter
        ? 2
        : WIN_FIRST
      : Math.min(WIN_KEEP, WIN_MIN + (S.lastLeft || 0));
  S.sent = 0;
  S.dUndo = [];
  S.tkPend = null;
  S.tk = S.ball && !S.fl && S.budget >= 2 ? tackler() : null;
  S.frame = { k: f, reach: Math.min(ORDER_MAX, S.budget) };
  let rc;
  if (isCPU(def)) rc = cpuOrdersB(f);
  else {
    S.phase = 'react';
    S.ui = freshUI();
    rc = await new Promise((res) => {
      reactRes = res;
      // keeps flowing unless the defender touches the board (ui-input clears the timer)
      S.autoT = AUTO_GO
        ? wait(() => {
            if (reactRes !== res) return;
            reactRes = null;
            S.autoT = null;
            res(null);
          }, AUTO_GO)
        : null;
      render();
    });
    clearTimeout(S.autoT);
    S.autoT = null;
    // v2.45: a tackle set in the window goes in now (its 2 were already spent)
    if (S.tkPend && S.ball && !rc) {
      rc = { tackle: true, pid: S.tkPend, from: true, paid: true };
    }
    S.tkPend = null;
  }
  S.phase = 'resolve';
  S.ui = freshUI();
  S.frame = null;
  S.tk = null;
  render();
  if (Array.isArray(rc)) for (const m of rc) if (S.sent < WIN_SENDS) addOrder(m.pid, m.to, f);
  if (rc && rc.tackle) {
    if (!rc.paid) S.budget -= 2;
    if (rc.from && S.ball) {
      // v2.25: from next to him: he steps in and goes for it
      S.orders = (S.orders || []).filter((o) => o.pid !== rc.pid);
      S.pos[rc.pid] = S.pos[S.ball].slice();
      S.com.add(rc.pid);
      renderTokens({ dur: 220 });
      await sleep(reduce ? 60 : 260);
    }
  }
  S.lastLeft = S.budget;
  S.win++;
  gl(`window ${S.win} closed · ${S.budget} unused`, 'def');
  S.evt = null; // shown at this window; the next one says what happened since
  if (rc && rc.tackle) return await tackleAttempt(rc.pid);
}
function runEnd(pid) {
  const m = S.movers.find((x) => x.pid === pid);
  return m ? m.path[m.path.length - 1] : S.pos[pid];
}
async function finishRuns() {
  const keep = S.frameNo;
  for (let g = 0; g < 8; g++) {
    S.frameNo = 'fin' + g; // same movement rules as the frame loop
    const runs = S.movers.filter((m) => !m.done && !m.drib),
      before = runs.map((m) => m.idx).join();
    for (let pass = 0; pass < 2; pass++)
      for (const m of runs) if (!m.done && m.stepped !== S.frameNo) stepMover(m, pass === 1);
    if (!runs.length || runs.map((m) => m.idx).join() === before) break;
    renderTokens(); // markers don't trail during this: the shot is quicker than they are
    await sleep(140);
  }
  S.frameNo = keep;
}
async function nextTouch(f) {
  if (!S.bq.length || S.fl || !S.ball || S.movers.some((m) => m.drib && !m.done)) return;
  if (S.ctrl && S.ctrl.pid === S.ball && f < S.ctrl.until) return; // still controlling the pass
  const ba = S.bq[0],
    actor = actorOf(ba);
  if (actor !== S.ball) {
    log('The planned touch broke down', 'info');
    S.bq = [];
    return;
  }
  // v1.28 pass vs through ball: a pass to a running teammate is held until it will arrive with him (the passer is on
  // the ball meanwhile: pressable, and the defence gets a window); a through ball goes now and waits in the space.
  // v2.48: a cross to a runner is held the same way (it went early and ran loose before his run got there)
  if ((ba.type === 'pass' || ba.type === 'cross') && ba.to && !ba.through) {
    const m = S.movers.find((x) => x.pid === ba.to && !x.done && !x.drib);
    if (m) {
      const left = m.path.length - 1 - m.idx,
        tgt = runEnd(ba.to),
        bf = ba.kind === 'lob' ? LOB_FRAMES : Math.ceil(hd(S.pos[actor], tgt) / GROUND_SPEED);
      if (left > bf) {
        if (!S.hold) {
          S.hold = true;
          event(`${nm(actor)} holds it, waiting for ${nm(ba.to)}'s run`);
          gl(`hold ${actor}@${hx(S.pos[actor])} · runner ${left} frames, ball ${bf}`, 'att');
        }
        return;
      }
    }
  }
  S.hold = false;
  S.bq.shift();
  S.touchNo = (S.touchNo || 0) + 1;
  render();
  if (ba.type === 'shot') {
    S.shotAs = null; // a plain shot (v2.11: one pass or shot a turn, so only the Cross card sets up a finish)
    // v1.11: the shot goes before the defenders' next step: anyone not already in the lane is too late to block it
    await finishRuns();
    renderTokens();
    await sleep(250);
    return await takeShot(ba, S.com);
  }
  if (ba.type === 'cross') {
    const from = actor,
      kind = ba.kind;
    if ((await pressContest(from, kind)) === 'end') return 'end';
    launch(from, runEnd(ba.to), kind, {
      noCollect: true,
      onRecv: async (rcv) => {
        if (rcv !== ba.to) return;
        const cx = CROSS_AS[kind];
        S.shotAs = { pid: rcv, ...cx };
        S.ball = rcv;
        await finishRuns();
        return await takeShot({ type: 'shot', pid: rcv, zone: ba.zone }, S.com);
      },
    });
    return;
  }
  if (ba.type === 'move') {
    const b = buffFor(ba.pid);
    if (b) S.buff = null;
    const path = fixPath(ba.pid, ba.path, mv(S, ba.pid));
    S.movers = S.movers.filter((m) => m.pid !== ba.pid);
    if (path.length > 1) S.movers.push({ pid: ba.pid, path, idx: 0, drib: true, b });
    gl(`dribble ${ba.pid} ${path.map(hx).join('>')}`, 'att');
    return await dribCheck();
  }
  const from = actor,
    kind = ba.type === 'gng' ? 'ground' : ba.kind;
  if ((await pressContest(from, kind)) === 'end') return 'end';
  const target = ba.to ? runEnd(ba.to) : ba.target,
    info = {};
  if (ba.type === 'gng') {
    if (!S.movers.some((m) => m.pid === from && !m.done)) {
      const path = fixPath(from, ba.path, GNG_RUN);
      if (path.length > 1) S.movers.push({ pid: from, path, idx: 0, max: GNG_RUN });
    }
    info.onRecv = async (rcv) => {
      if (rcv !== ba.to) return;
      // the wall pass: show the ball reaching him and a first-time touch before it comes back
      await ballToFeet();
      popWord(px(...S.pos[rcv]), 'One-two', 'att');
      await sleep(reduce ? 80 : 300);
      launch(rcv, ba.ret, 'ground', { gngBack: true });
      log(`${nm(rcv)} plays it first time back into ${nm(ba.from)}'s path`, 'att');
    };
  }
  launch(from, target, kind, info);
}
async function playPlan() {
  const acts = S.plan;
  S.movers = [];
  S.duelled = new Set();
  S.com = S.com || new Set(); // resolveTurn starts it
  S.lpass = null;
  S.fl = null;
  S.onCollect = null;
  S.touchNo = 0;
  S.ctrl = null;
  S.hold = false;
  S.budget = 0;
  S.win = 0;
  S.lastLeft = 0;
  S.sprinting = new Set();
  S.skipPh = false;
  S.evt = null;
  const legs = {};
  for (const a of acts) if (!a.ball && a.type === 'move') (legs[a.pid] || (legs[a.pid] = [])).push(a.path);
  for (const pid in legs) {
    let path = fixPath(pid, legs[pid][0], runSteps(S, pid));
    for (let j = 1; j < legs[pid].length; j++) {
      const l = legs[pid][j],
        end = path[path.length - 1];
      path = path.concat((same(l[0], end) ? l : [end]).slice(1));
    }
    if (path.length > 1)
      S.movers.push({
        pid,
        path,
        idx: 0,
        max: (PL[pid].role === 'WG' ? MOVE + WING_RUN : MOVE) + (legs[pid].length > 1 ? SECOND_RUN : 0),
        base: PL[pid].role === 'WG' ? MOVE + WING_RUN : MOVE,
        sprint: legs[pid].length > 1,
      });
    if (legs[pid].length > 1) (S.tired || (S.tired = {}))[pid] = 'pending'; // pays for it next attacking turn
  }
  S.bq = acts.filter((a) => a.ball);
  log(
    `${S.movers.length} runner${S.movers.length === 1 ? '' : 's'} · ${S.bq.length ? S.bq.map((a, n) => `touch ${n + 1}: ${ballActTxt(a)}`).join(' → ') : 'no touches'}`,
    'info',
  );
  render();
  S.press = null; // v2.25: a press or block is for this turn's play only (Anticipate carries on, like a mark)
  S.block = null;
  if (!respond() && (await prepareWindow()) === 'end') return 'end'; // respond mode: the attack moves first
  for (let f = 1; f <= 30; f++) {
    S.frameNo = f;
    if ((await nextTouch(f)) === 'end') return 'end';
    stepMovers();
    if ((await stepOrders(f)) === 'end') return 'end';
    if ((await stepMarks()) === 'end') return 'end';
    if ((await advanceFlight()) === 'end') return 'end';
    if ((await dribCheck()) === 'end') return 'end';
    if (f === 1) S.koBlock = false;
    // after a contest mid-frame, only the rest of the frame is left to play (same speed as before it)
    const fr = S.flRest ? FRAME_MS * S.flRest : FRAME_MS;
    S.flRest = null;
    renderTokens({ dur: fr, lin: true });
    if (S.ballMs && S.ball && TW.ball) tweenEl('ball', $('#ball'), TW.ball.to, Math.min(fr, S.ballMs), true);
    S.ballMs = null;
    await sleep(fr);
    const active = S.movers.some((m) => !m.done) || !!S.fl || (S.bq.length > 0 && !!S.ball);
    if (!active) break;
    if ((await pauseB(f)) === 'end') return 'end';
  }
  if (S.bq.length) log('The rest of the plan never happened', 'info');
  S.orders = [];
  S.flight = null;
  S.lpass = null;
  S.onCollect = null;
  return 'ok';
}
// The shot itself (instant): blockers on the line, then the keeper's zones. Only touch resolved outside the frame loop.
// Drawing only: as a shot goes off, defenders already on their way (sent orders, markers) start their next step,
// half a hex, so you see them close in too late. The rule is unchanged: the shot beats them.
function lungeAtShot(lane) {
  if (S.mode === 'sim') return;
  const go = [];
  for (const o of S.orders || []) if (!o.done && o.path[o.idx + 1]) go.push([o.pid, o.path[o.idx + 1]]);
  for (const [d, a] of Object.entries(marksNow()))
    if (S.pos[d] && S.pos[a] && !go.some((g) => g[0] === d)) {
      const n = markStep({ pos: S.pos, koBlock: false }, d, a);
      if (n) go.push([d, n]);
    }
  let late = false;
  for (const [pid, nx] of go) {
    if (PL[pid].role === 'GK') continue; // the keeper's reaction is the save itself (dive), not a lunge
    const A = TW[pid] ? TW[pid].cur : px(...S.pos[pid]),
      B = px(...nx);
    tweenEl(pid, $('#t-' + pid), [A[0] + (B[0] - A[0]) * 0.55, A[1] + (B[1] - A[1]) * 0.55], 240 * SLOWMO);
    if (!late && lane.some((h) => same(h, nx))) {
      late = true;
      popWord(B, 'Too late!', 'att');
    }
  }
}
// Before any touch that follows a pass in the same frame (first-time finish, wall pass), draw the ball actually
// arriving at the player: from wherever it is on screen, at pass speed. Without this the next touch seemed to start
// from the previous player.
async function ballToFeet() {
  if (!S.ball || S.mode === 'sim') return;
  const t = TW.ball,
    [x, y] = px(...S.pos[S.ball]);
  const far = t ? Math.hypot(t.cur[0] - x, t.cur[1] - y) / (R * SQ3) : 0; // in hexes
  if (far < 0.8) return;
  const ms = Math.min(900, (far / GROUND_SPEED) * FRAME_MS);
  renderTokens({ dur: ms, lin: true });
  await sleep(ms + 40);
}
async function takeShot(a, com) {
  if (S.ball !== a.pid) {
    log('Plan broke down — shot skipped', 'info');
    return 'ok';
  }
  const b = buffFor(a.pid);
  if (b) S.buff = null;
  const as = S.shotAs && S.shotAs.pid === a.pid ? S.shotAs : null;
  S.shotAs = null;
  const e = shotEval(S, a.pid, a.zone, com, b, as),
    def = other(S.attack),
    gk = gkOf(def);
  // v2.25 Anticipate: he read the shot (his block chance has the bonus in it); used up whatever happens
  const rdT = e.th.find((t) => t.read);
  if (rdT) {
    S.read = null;
    gl(`read ${rdT.pid} pays off: +${pc(READ_BONUS)} on the block`, 'def');
    if (S.mode !== 'sim') popWord(px(...S.pos[rdT.pid]), 'Read it!', 'def');
  }
  if (as)
    log(
      `${as.name}! ${nm(a.pid)} ${as.header ? 'meets it with his head' : as.volley ? 'volleys it' : 'shoots'} (${asTxt(as)})`,
      'crit',
    );
  gl(
    `SHOT ${a.pid}@${hx(S.pos[a.pid])} ${ZS[a.zone]} · on target ${pc(e.acc)}${as ? ` · ${as.name}${as.header ? ' (header)' : as.volley ? ' (volley)' : ''}` : ''}${e.th.length ? ` · blockers ${e.th.map((t) => `${t.pid} ${pc(t.p)}`).join(', ')}` : ''}`,
    'att',
  );
  const T = shotAim(S.attack, a.zone),
    G = goalPx(S.attack),
    up = S.attack === 'H' ? -1 : 1;
  await ballToFeet();
  popWord(px(...S.pos[a.pid]), as && as.header ? 'Header!' : as && as.volley ? 'Volley!' : 'Shot!', 'att');
  slowmo(true);
  lungeAtShot(e.lane);
  // the strike: a header gets a little leap at the ball first; then the ball flies, stopping at any blocker
  if (as && as.header) {
    const [hx, hy] = px(...S.pos[a.pid]);
    $('#ovTop').insertAdjacentHTML('beforeend', `<circle class="clash" cx="${hx}" cy="${hy}" r="16"/>`);
    tweenBall([hx, hy - 12], 160 * SLOWMO);
    await sleep(320 * SLOWMO);
  }
  // all blockers in one contest: the chance that any of them gets a block (shown as the best-placed one)
  if (e.th.length) {
    const lead = e.th[0],
      A = px(...S.pos[a.pid]);
    // the ball heads along the shot line (shooter → aimed spot), to the point level with the first blocker
    const B = px(...S.pos[lead.pid]),
      d = [T[0] - A[0], T[1] - A[1]],
      L2 = d[0] * d[0] + d[1] * d[1] || 1,
      u = Math.max(0.15, Math.min(0.9, ((B[0] - A[0]) * d[0] + (B[1] - A[1]) * d[1]) / L2));
    tweenBall([A[0] + d[0] * u, A[1] + d[1] * u], 180 * SLOWMO);
    await sleep(200 * SLOWMO);
    const pBlock = 1 - e.thr;
    if (await duel({ type: 'shot', tier: lead.tier, att: a.pid, def: lead.pid, p: pBlock, more: e.th.length - 1 })) {
      const t = lead; // the block is credited to the player shown in the duel
      tweenBall(px(...S.pos[t.pid]), 160 * SLOWMO);
      await sleep(250 * SLOWMO);
      slowmo(false);
      const cl = await maybeClear(t.pid);
      if (cl) return cl;
      const crit = t.tier === 'star' && dCrit(t.pid, com);
      log(`Shot blocked by ${nm(t.pid)}${crit ? ' — crit block!' : ''}`, crit ? 'crit' : 'bad');
      gl(`BLOCKED by ${t.pid}`, 'bad');
      return await turnover(t.pid, crit);
    }
  }
  const crit = rnd() < e.crit;
  if (!crit && rnd() > e.acc) {
    // wide: past the post on the aimed side, or over the bar from the centre
    const col = (a.zone % 3) - 1;
    tweenBall(col ? [G[0] + (T[0] - G[0]) * 1.9, T[1]] : [T[0], G[1] + up * 16], 300 * SLOWMO);
    await sleep(300 * SLOWMO + 200);
    log(`${nm(a.pid)} shoots ${ZN[a.zone].toLowerCase()}… wide (${pc(e.acc)} to hit the target)`, 'bad');
    banner('Wide', 'bad');
    gl(`WIDE`, 'bad');
    return await restart(gk, 'Goal kick');
  }
  // the keeper's chance is decided first, then drawn: he dives towards the ball as it flies. Saved: he gets to it and
  // the ball stops in his hands. Goal: he stretches and falls short, closer the bigger his chance was.
  const rel = kRel(a.zone, S.pos[gk], S.attack);
  let sp = saveP(a.zone, S.pos[gk], S.attack, e.dg, PL[gk].ref, as, S.pos[a.pid]);
  if (crit) sp /= 2; // v2.15: a crit strike halves the keeper's chance (it used to beat him outright unless in line)
  const saved = rnd() < sp;
  log(
    `Shot ${ZN[a.zone].toLowerCase()}, keeper at ${hx(S.pos[gk])}${crit ? ' — CRIT strike' : ''}.`,
    crit ? 'crit' : 'att',
  );
  gl(`keeper ${gk}@${hx(S.pos[gk])} (${rel}) · save ${pc(sp)}${crit ? ' · CRIT' : ''}`, 'info');
  const K = TW[gk] ? TW[gk].cur : px(...S.pos[gk]),
    reachF = saved ? 0.85 : 0.2 + 0.55 * sp, // how far along keeper → ball he gets
    D = [K[0] + (T[0] - K[0]) * reachF, K[1] + (T[1] - K[1]) * reachF],
    flight = (a.zone < 3 ? 340 : 260) * SLOWMO;
  tweenEl(gk, $('#t-' + gk), D, flight * 1.5); // a dive: starts quick, slows at full stretch
  // top corners curl in from outside; low shots go straight; a save stops the ball at his hands
  const end = saved ? D : T;
  tweenBall(end, flight, a.zone < 3 ? curlCtrl(TW.ball ? TW.ball.cur : px(...S.pos[a.pid]), end) : null);
  S.aimPx = T;
  await sleep(flight * 1.5 + 120);
  if (saved) {
    gl(`SAVED by ${gk}`, 'bad');
    log(`${nm(gk)} saves! (${pc(sp)} save chance)`, 'bad');
    popWord(D, 'Saved!', 'def');
    banner('Saved', 'bad');
    keeperTakes(gk, D);
    return await restart(gk, "Keeper's ball");
  }
  if (sp >= 0.25) popWord(D, 'Fingertips…', 'att');
  return await goal(a.pid, sp);
}

// v2.25 respond mode: what a defender can do to the man on the ball from next to him (ball at his feet, in a window).
function challengeOK(d) {
  return (
    respond() &&
    S.frame &&
    S.ball &&
    !S.fl &&
    S.pos[d] &&
    team(d) === other(S.attack) &&
    !isKeeper(d) &&
    d !== S.beaten &&
    d !== S.out &&
    hd(S.pos[d], S.pos[S.ball]) === 1
  );
}
// Block: the next hex on the man's line to goal, if it's free (or it's where the defender is) and one step away.
function blockHex(d) {
  const c = S.pos[S.ball],
    h = hexLine(c, goalHex(S.attack))[1];
  if (!h) return null;
  if (same(h, S.pos[d])) return h;
  return !at(S, h).length && hd(S.pos[d], h) === 1 ? h : null;
}
function doPress(d) {
  S.press = { pid: d, on: S.ball };
  S.budget -= 1;
  S.sent = (S.sent || 0) + 1;
  gl(`press ${d} on ${S.ball}`, 'def');
}
function doBlock(d) {
  const h = blockHex(d);
  if (!h) return false;
  if (!same(h, S.pos[d])) {
    if (!addOrder(d, h, S.frame.k)) return false;
  } else {
    S.budget -= 1;
    S.sent = (S.sent || 0) + 1;
  }
  S.block = { pid: d, of: team(d) };
  gl(`block ${d} > ${hx(h)}`, 'def');
  return true;
}
function doRead(d) {
  S.read = { pid: d, of: team(d) };
  gl(`read ${d}@${hx(S.pos[d])}`, 'def');
}
function tackler() {
  if (!S.ball) return null;
  return at(S, S.pos[S.ball]).find((x) => team(x) !== S.attack && S.beaten !== x && S.out !== x) || null;
}
async function tackleAttempt(pid) {
  const c = S.ball,
    p = tackleP(pid);
  log(`${nm(pid)} goes in for the tackle on ${nm(c)} (${pc(p)})`, 'def');
  gl(`TACKLE ${pid} on ${c}@${hx(S.pos[c])}`, 'def');
  await sleep(450);
  if (await duel({ type: 'tackle', att: c, def: pid, p })) {
    const cl = await maybeClear(pid);
    if (cl) return cl;
    const crit = dCrit(pid, new Set([pid]));
    log(`${nm(pid)} wins it${crit ? ' — crit!' : ''}`, crit ? 'crit' : 'bad');
    return await turnover(pid, crit);
  }
  S.beaten = pid;
  log(`${nm(c)} rides the challenge. ${nm(pid)} is beaten for the rest of this turn.`, 'att');
  banner('Beaten', '');
  await sleep(600);
  return 'ok';
}
