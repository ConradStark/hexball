function describe(st, a) {
  if (a.type === 'cross') {
    const land = passEval(st, a.from, a.to, a.kind).clean,
      vs = cloneSt(st);
    vs.ball = a.to;
    const e = shotEval(vs, a.to, a.zone, new Set(), 0, CROSS_AS[a.kind]);
    return {
      t: `${CROSS_AS[a.kind].name} #${PL[a.from].num} → #${PL[a.to].num} · ${a.kind === 'lob' ? 'header' : 'shot'} ${ZN[a.zone].toLowerCase()}`,
      p: land * e.p,
      sub: `card · lands ${pc(land)} × on target ${pc(e.p)}`,
    };
  }
  if (a.type === 'move') {
    if (st.ball === a.pid) {
      const tp = truncPath(st, a);
      return {
        t: `Dribble ${nm(a.pid)}`,
        p: dribbleEval(st, a.pid, tp.p, new Set(), buffFor(a.pid)).p,
        sub: 'past tacklers',
      };
    }
    if (st.loose && same(a.path[a.path.length - 1], st.loose))
      return { t: `Collect loose ball · ${nm(a.pid)}`, p: null, sub: 'first to the ball wins it' };
    return { t: `Run ${nm(a.pid)}`, p: null, sub: `${a.path.length - 1} hex${a.path.length === 2 ? '' : 'es'}` };
  }
  if (a.type === 'pass' && !a.to) {
    const vs = cloneSt(st);
    vs.pos._T = a.target.slice();
    const e = passEval(vs, a.from, '_T', a.kind, new Set(), buffFor(a.from));
    return {
      t: `${a.kind === 'ground' ? 'Through ball' : 'Lob'} into space · #${PL[a.from].num}`,
      p: e.clean,
      sub: `${e.d} hexes · a runner must get there`,
    };
  }
  if (a.type === 'pass') {
    const e = passEval(st, a.from, a.to, a.kind, new Set(), buffFor(a.from));
    return {
      t: `${a.kind === 'ground' ? 'Ground' : 'Lob'} pass #${PL[a.from].num} → #${PL[a.to].num}`,
      p: e.clean,
      sub: `${e.d} hexes${e.long ? ` · ${pc(e.scatter)} scatter` : ' · clean range'}`,
    };
  }
  if (a.type === 'gng') {
    const e = passEval(st, a.from, a.to, 'ground', new Set(), buffFor(a.from));
    const st2 = cloneSt(st);
    st2.pos[a.from] = a.ret.slice();
    st2.ball = a.to;
    const e2 = passEval(st2, a.to, a.from, 'ground');
    return {
      t: `Give & Go #${PL[a.from].num} ↔ #${PL[a.to].num}`,
      p: e.clean * e2.clean,
      sub: `${pc(e.clean)} out × ${pc(e2.clean)} back`,
    };
  }
  if (a.type === 'shot') {
    const e = shotEval(st, a.pid, a.zone, new Set(), buffFor(a.pid));
    return {
      t: `Shot → ${ZN[a.zone]}`,
      p: e.p,
      sub: `on target past blockers${e.zm.top ? ` · crit ${pc(e.crit)}` : ''}`,
    };
  }
}
function actorOf(a) {
  return a.type === 'move' || a.type === 'shot' ? a.pid : a.from;
}
function kicks() {
  return S.plan.filter((a) => a.ball && a.type !== 'move').length;
}
// v2.24: a ground pass (easier to cut out) lets the receiver play one more pass or shot, first time; a lob needs a
// control touch and ends the kicking. So a turn has 1 kick, or 2 when the first is a ground pass.
function groundFirst(plan = S.plan) {
  const k = plan.find((a) => a.ball && a.type !== 'move');
  return !!k && k.type === 'pass' && k.kind === 'ground';
}
function kickMax() {
  return KICKS + (groundFirst() ? 1 : 0);
}
function kickUsed() {
  return kicks() >= kickMax();
}
// v2.40 Finisher: the last kick was a pass to a striker who has it now: he can still shoot first time (only shoot)
function finisherOpen() {
  if (finished()) return false;
  const k = [...S.plan].reverse().find((a) => a.ball && a.type !== 'move');
  if (!k || k.type !== 'pass' || !k.to || PL[k.to].role !== 'FW') return false;
  return planState().c === k.to;
}
// v2.40: a cross the striker finishes may be the 2nd kick (after a ground pass)
function crossShootOK(to) {
  if (S.plan.some((a) => a.type === 'cross')) return false;
  return !kicks() || (to && PL[to] && PL[to].role === 'FW' && !kickUsed());
}
function stepsFor(st, id) {
  const n = st.ball === id && !finished() ? mv(st, id) : runSteps(st, id); // on the ball: a dribble
  return runsOf(id) ? Math.min(SECOND_RUN, n) : n; // the second move is shorter
}
function ballActTxt(a) {
  if (a.type === 'shot') return `${nm(a.pid)} shoots`;
  if (a.type === 'move') return `${nm(a.pid)} dribbles`;
  if (a.type === 'gng') return `Give & Go ${nm(a.from)} ↔ ${nm(a.to)}`;
  return a.to
    ? `${a.through ? 'through ball' : a.kind === 'lob' ? 'lob' : 'pass'} ${nm(a.from)} → ${nm(a.to)}`
    : `${a.kind === 'lob' ? 'lob' : 'through ball'} into space by ${nm(a.from)}`;
}
function cardOK(type) {
  // v2.24: a card is the turn's first kick, never the follow-up after a ground pass
  return (
    // v2.32: the Cross is no longer a card (no rest turn); Give & Go is the one card left
    (type === 'cross' || !((S.cool && S.cool[S.attack]) || []).includes(type)) &&
    !S.plan.some((a) => a.type === type) &&
    !kicks()
  );
}
function setCool() {
  (S.cool || (S.cool = { H: [], A: [] }))[S.attack] = [
    ...new Set(S.plan.filter((a) => a.type === 'gng').map((a) => a.type)),
  ];
}
function touches() {
  return S.plan.filter((a) => a.ball).length;
}
// Moves (runs and dribbles alike) count towards the players who move this turn (v2.11).
function runsOf(pid) {
  return S.plan.filter((a) => a.type === 'move' && a.pid === pid).length;
}
function runnerSet() {
  return new Set(S.plan.filter((a) => a.type === 'move').map((a) => a.pid));
}
function doubler() {
  const m = {};
  for (const a of S.plan) if (a.type === 'move') m[a.pid] = (m[a.pid] || 0) + 1;
  return Object.keys(m).find((k) => m[k] > 1) || null;
}
function runFrames(pid) {
  return S.plan.filter((a) => !a.ball && a.type === 'move' && a.pid === pid).reduce((n, a) => n + a.path.length - 1, 0);
}
function timingLine(d, k, pid) {
  const bf = k === 'lob' ? LOB_FRAMES : Math.ceil(d / GROUND_SPEED),
    rf = pid ? runFrames(pid) : 0,
    pre = touches() > 0 ? 'after the dribble, ' : '';
  if (!rf) return `${pre}ball arrives in ${bf} frame${bf > 1 ? 's' : ''}`;
  const w = rf - bf;
  return `${pre}ball ${bf} · runner ${rf} frame${rf > 1 ? 's' : ''}${w > 1 ? ` · <b class="warn">ball waits ${w} frames, a defender could get there</b>` : w < 0 ? ` · <b class="warn">runner arrives late</b>` : ' · on time'}`;
}
// Timing line for a held pass: the passer waits so the ball arrives with the runner.
function passHoldLine(d, k, pid) {
  const bf = k === 'lob' ? LOB_FRAMES : Math.ceil(d / GROUND_SPEED),
    rf = runFrames(pid),
    w = rf - bf;
  return w > 0
    ? `holds it ${w} frame${w > 1 ? 's' : ''}, then it arrives with him · <b class="warn">the passer can be pressed while he waits</b>`
    : timingLine(d, k, pid);
}
function canRun(pid) {
  const n = runsOf(pid);
  if (n === 0) return runnerSet().size < MAX_RUNNERS;
  if (n === 1) return !doubler();
  return false;
}
function gngTargets(pst, A, B) {
  if (PL[A].pac === 0) return [];
  const rr = reach(pst, A, gngRun(pst, A)),
    out = [];
  for (const [, inf] of rr) {
    if (hd(inf.h, pst.pos[B]) <= 4 && !at(pst, inf.h).length) out.push(inf.h);
  }
  return out;
}
// v2.26: the man on the ball has two views: Move (his dribble hexes) and Pass (his ranges, teammates, the goal).
// Pass while he still has a kick, else Move; the toggle under the board switches it.
function canDribble(st, id) {
  return PL[id].pac > 0 && stepsFor(st, id) > 0;
}
// v2.28: no Move / Pass toggle: the man on the ball shows his dribble hexes; tapping the hex you just dribbled to
// again turns it into a pass into that space (and back). He can pass while he still has a kick.
function canPassNow() {
  return !kickUsed() && !finished();
}
let DANGER = (() => {
  try {
    return localStorage.getItem('hexDanger') === '1';
  } catch (e) {
    return false;
  }
})();
function finished() {
  return S.plan.some((a) => a.type === 'shot' || a.type === 'cross');
}
function addAction(a) {
  const { c, pst } = planState();
  a.ball = a.type !== 'move' || (a.pid === c && !finished());
  const flash = (m) => {
    S.ui = freshUI();
    S.ui.flash = m;
    render();
  };
  if (a.ball && finished()) return flash('The plan already ends with a shot. You can still add runs.');
  if (a.ball && a.type !== 'move' && kickUsed() && !(a.type === 'shot' && finisherOpen()))
    return flash(
      groundFirst()
        ? 'A ground pass and one more pass or shot: that is the turn. Undo to change it.'
        : 'One pass or shot a turn (two after a ground pass), and it is set. Undo it to change it.',
    );
  if (a.ball && a.type === 'gng' && kicks())
    return flash('After a ground pass he can pass or shoot again, but not play a card.');
  if (a.ball && a.type === 'cross' && !crossShootOK(a.to)) return flash('A cross to finish: 2 kicks a turn max (a striker can).');
  if (a.type === 'cross') a.target = pst.pos[a.to].slice();
  if (a.type === 'move' && !canRun(a.pid))
    return flash(
      runsOf(a.pid)
        ? `Only one player can move twice (${nm(doubler())} already does).`
        : `Up to ${MAX_RUNNERS} players move a turn (a dribble counts). Undo one to add another.`,
    );
  if (a.type === 'pass' && a.to) a.target = pst.pos[a.to].slice();
  S.plan.push(a);
  (S.hist || (S.hist = [])).push(a);
  S.gngUsed = S.plan.some((x) => x.type === 'gng');
  S.ui = freshUI();
  render();
}
function planState() {
  const pst = project(baseSt(), S.plan, S.plan.length),
    c = pst.ball;
  return { pst, c, dg: c ? gDist(S.attack, pst.pos[c]) : 99 };
}
