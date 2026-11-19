let S = null,
  gateCb = null,
  bannerT = null,
  reactRes = null,
  shapeRes = null; // v2.47: resolver for the human's shape step (Done) // resolver for the defence pause promise (set in playback.pauseB, called by Go/Skip/Tackle)
const freshUI = () => ({
  mode: null,
  sel: null,
  gB: null,
  pT: null,
  info: null,
});
function makeState(mode) {
  return {
    cool: { H: [], A: [] },
    mode,
    attack: 'H',
    score: { H: 0, A: 0 },
    turn: 0,
    pos: {},
    ball: null,
    loose: null,
    maxActions: 3,
    isCounter: false,
    counter: false,
    plan: [],
    gngUsed: false,
    buff: null,
    phase: 'idle',
    log: [],
    ui: freshUI(),
  };
}
function kickoff(t) {
  S.pos = {};
  for (const p of ROSTER) {
    if (!onPitch(p)) continue;
    S.pos[p.id] = ((pitchNow().forms[SIZE] || {})[p.id] || FORM[p.id]).slice();
  }
  S.loose = null;
  S.kickoff = true;
  const k = KO[t],
    o = KO[other(t)];
  S.pos[k] = [KOC, MIDR];
  S.pos[o] = [KOC, t === 'H' ? MIDR - 2 : MIDR + 2];
  S.ball = k;
}
// Modes: 'cpu' (you are Harbour), 'hot' (two players, one device), 'sim' (CPU vs CPU, used by tests/sim).
const isCPU = (t) => S.mode === 'sim' || (S.mode === 'cpu' && t === 'A');
function log(m, cls = '') {
  (S.logAll || (S.logAll = [])).push(m); // full match history (the visible log keeps the last 60)
  S.log.unshift({ m, cls });
  S.log.length = Math.min(S.log.length, 60);
  renderLog();
}
// first: who kicks off ('A' = Northgate, so in a vs-CPU game you start on defence)
function newGame(mode, first = 'H') {
  S = makeState(mode);
  kickoff(first);
  S.attack = first;
  log(
    `${SIZE}v${SIZE}${LINEUP !== 'classic' ? ` · ${MATCHES[LINEUP].label}` : ''}. Kick-off. ${TEAMS.H.name} attack up the pitch, ${TEAMS.A.name} attack down. First to 3 goals.`,
    'info',
  );
  startTurn();
}
function clearPlay() {
  S.scattered = false;
  slowmo(false);
  S.orders = [];
  S.movers = [];
  S.fl = null;
  S.flight = null;
  S.lastKick = null;
  S.sprinting = null;
  S.lpass = null;
  S.onCollect = null;
  S.bq = [];
  S.frame = null;
  S.tk = null;
  S.touchNo = 0;
  clearOverlay();
}
function startTurn() {
  if (S.scenario && S.turn === S.scenario.turn) return scenarioEnd();
  if (S.shapeDue) {
    S.shapeDue = false;
    if (SHAPE) return shapePhase();
  }
  clearPlay();

  S.turn++;
  S.plan = [];
  S.hist = [];
  S.gngUsed = false;
  S.isCounter = S.counter;
  S.maxActions = S.counter ? 4 : 3;
  S.counter = false;
  S.koBlock = !!S.kickoff;
  S.kickoff = false;
  // the attacking side's keeper goes back to his line (the defending keeper stays where he was put)
  const gkA = gkOf(S.attack),
    home = goalHex(other(S.attack));
  if (gkA && S.ball !== gkA && S.pos[gkA] && !at(S, home).length) S.pos[gkA] = home.slice();
  // v2.19: a loose ball under an attacker's feet (e.g. the keeper back on his line on top of it) is simply his.
  // Before, nobody could step onto that hex to collect it and the match went round in circles.
  if (!S.ball && S.loose) {
    const own = at(S, S.loose).find((x) => team(x) === S.attack);
    if (own) {
      S.ball = own;
      S.loose = null;
      gl(`collect ${own}@${hx(S.pos[own])} (standing on it)`, 'att');
    }
  }
  S.beaten = null;
  // carried over from the turnover: the player who lost the ball sits this turn out
  S.out = S.outNext && S.pos[S.outNext] ? S.outNext : null;
  S.outNext = null;
  S.tk = null;
  S.ui = freshUI();
  marksNow(); // marks belong to the defending team; a change of possession clears them
  // tiredness: served last attacking turn → fresh; pending and his team attacks now → -1 hex this turn
  const T = S.tired || (S.tired = {});
  for (const id in T) if (T[id] === 'active') delete T[id];
  for (const id in T) if (team(id) === S.attack) T[id] = 'active';
  S.seed = S.forceSeed != null ? S.forceSeed : (Math.random() * 4294967296) >>> 0;
  S.forceSeed = null;
  RNG = mulberry32(S.seed);
  CRNG = mulberry32((S.seed ^ 0x9e3779b9) >>> 0);
  S.frameNo = null;
  S.snap = snapshot();
  autosave();
  (S.snaps || (S.snaps = [])).push(S.snap); // for Retry my last attack (More)
  gl(
    `== ${S.attack} attack · ${S.score.H}-${S.score.A} · ball ${S.ball ? `${S.ball}@${hx(S.pos[S.ball])}` : `loose@${hx(S.loose)}`}${S.isCounter ? ' · COUNTER' : ''}${
      Object.keys(T).filter((id) => T[id] === 'active').length
        ? ` · tired ${Object.keys(T)
            .filter((id) => T[id] === 'active')
            .join(', ')} (-1)`
        : ''
    }`,
    'info',
  );
  goPlan();
}
function goPlan() {
  const sc = S.scenario;
  if (sc && sc.as === 'defend' && S.turn === sc.turn) {
    // scenario: the attack replays the recorded plan; you defend
    S.plan = JSON.parse(JSON.stringify(SCENARIOS[sc.k].plan));
    setCool();
    return goReact();
  }
  if (isCPU(S.attack)) {
    S.phase = 'cpuplan';
    render();
    wait(
      () => {
        cpuPlanB();
        setCool();
        goReact();
      },
      reduce ? 100 : 800,
    );
  } else
    gate(
      S.attack,
      `You are attacking. Plan one pass or shot (a ground pass lets the receiver go again) and up to 3 moving players (a dribble counts). Runs start together; the ball goes in order.`,
      () => {
        S.phase = 'plan';
        S.ui = freshUI();
        render();
      },
    );
}
function goReact() {
  const def = other(S.attack);
  gl(`PLAN ${S.plan.map(planTxt).join(' | ') || '(none)'}`, 'att');
  if (isCPU(def)) {
    cpuMarks(); // the CPU defence marks before the play (its moves come in Prepare and the react windows)
    resolveTurn();
  } else
    gate(
      def,
      'You are defending. 1. Prepare: their players are revealed; move 2 players (keeper included) 1 hex each before they start. 2. React: every 2 frames of play, mark one attacker and move up to 3 players (keeper included, he stays in his box) up to 2 hexes. 5 steps at the first window, then 2–3.',
      () => resolveTurn(),
    );
}
function gate(t, role, cb) {
  if (S.mode !== 'hot') {
    cb();
    return;
  }
  S.phase = 'gate';
  render();
  $('#gateTeam').textContent = TEAMS[t].name;
  $('#gateTeam').style.color = t === 'H' ? 'var(--home)' : 'var(--away)';
  $('#gateRole').textContent = role;
  $('#gate').hidden = false;
  gateCb = cb;
}
function banner(txt, cls = '') {
  const b = $('#banner');
  b.className = 'banner ' + cls;
  b.textContent = txt;
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(bannerT);
  bannerT = wait(() => b.classList.remove('show'), 1300);
}
async function settle() {
  clearOverlay();
  renderTokens();
  await sleep(reduce ? 60 : 500);
}
// One attacking turn: the plan plays out frame by frame (playback.js).
async function resolveTurn() {
  S.phase = 'resolve';
  S.ui = freshUI();
  S.flight = null;
  S.fl = null;
  S.orders = [];
  S.movers = [];
  render();
  log(`— Turn ${S.turn}: ${TEAMS[S.attack].name} play it out —`, 'info');
  S.com = new Set();
  S.budget = 0;
  S.turnPos = JSON.parse(JSON.stringify(S.pos)); // v2.47: who didn't move this turn (shape step)
  gl(
    `DEF keeper ${gkOf(other(S.attack))}@${hx(S.pos[gkOf(other(S.attack))])}${
      Object.keys(S.marks || {}).length
        ? ` · mark ${Object.entries(S.marks)
            .map(([d, a]) => d + '>' + a)
            .join(', ')}`
        : ''
    }`,
    'def',
  );
  let w = defOnLoose();
  if (w) {
    log(`${nm(w)} gets to the loose ball first`, 'bad');
    await turnover(w, false);
    return;
  }
  {
    const r = await playPlan();
    S.koBlock = false;
    if (r === 'end') return;
  }
  log(S.ball ? `${TEAMS[S.attack].name} keep the ball` : 'The ball is still loose.', 'info');
  S.buff = null;
  startTurn();
}
async function restart(gk, label) {
  clearPlay();
  S.ball = gk;
  S.loose = null;
  renderTokens();
  await sleep(800);
  S.attack = team(gk);
  S.counter = false;
  S.buff = null;
  const out = clearBox(S, S.attack);
  gl(
    `RESTART ${label} > ${gk}${out.length ? ' · box clear ' + out.map((m) => `${m.pid} ${hx(m.from)}>${hx(m.to)}`).join(', ') : ''}`,
    'info',
  );
  if (out.length) {
    renderTokens();
    await sleep(500);
  }
  const ons = await onsideNow();
  log(
    `${label}: ${TEAMS[S.attack].name} restart from the keeper.${out.length ? ` ${out.map((m) => '#' + PL[m.pid].num).join(', ')} step out of the box.` : ''}${ons.length ? ` ${ons.map((m) => '#' + PL[m.pid].num).join(', ')} come back onside.` : ''}`,
    'info',
  );
  await settle();
  startTurn();
  return 'end';
}
// Onside (v2.2 keeper restarts; v2.10 every turnover too): the team that has just won the ball can't start beyond
// the other side's deepest outfield player — those players come back level. The ball carrier stays where he is.
async function onsideNow() {
  const ons = onsideBack(S, S.attack);
  if (ons.length) {
    gl(`onside ${ons.map((m) => `${m.pid} ${hx(m.from)}>${hx(m.to)}`).join(', ')}`, 'info');
    renderTokens();
    await sleep(500);
  }
  return ons;
}
async function turnover(pid, crit) {
  const lost = S.ball && S.ball !== pid ? S.ball : S.fl ? S.fl.from : S.lastCarrier || null,
    fromScatter = !!S.scattered;
  S.scattered = false;
  S.lastCarrier = null;
  gl(`TURNOVER > ${pid}@${hx(S.pos[pid])}${crit ? ' (crit: counter)' : ''}`, 'bad');
  clearPlay();
  S.ball = pid;
  S.loose = null;
  S.wonAt = { pid, h: S.pos[pid].slice() }; // drawn ahead on a shared hex until he moves (ui-board.tokPx)
  renderTokens();
  banner(crit ? 'Counter!' : 'Turnover', crit ? 'crit' : 'bad');
  await sleep(900);
  S.attack = team(pid);
  S.counter = crit;
  S.buff = null;
  // the player who just lost the ball is beaten: no influence and not available for Prepare next turn (v1.29)
  if (lost && team(lost) !== team(pid) && !fromScatter) {
    S.outNext = lost;
    gl(`beaten ${lost} (next turn)`);
  }

  const ons = await onsideNow();
  if (ons.length) log(`${ons.map((m) => '#' + PL[m.pid].num).join(', ')} come back onside.`, 'info');
  if (crit) log(`COUNTER — ${TEAMS[S.attack].name} break with 4 actions, the defense can't prepare`, 'crit');
  if (SHAPE) S.shapeDue = true; // v2.49: after a turnover the side that lost it gets a free shape step
  await settle();
  startTurn();
  return 'end';
}
async function goal(pid, sp) {
  clearPlay();
  const att = S.attack;
  S.score[att]++;
  gl(`GOAL ${pid} · ${S.score.H}-${S.score.A}`, 'goal');
  S.ball = null;
  S.loose = null;
  placeBall(S.aimPx || goalPx(att));
  S.aimPx = null;
  log(`GOAL! ${nm(pid)} scores for ${TEAMS[att].name} (keeper had ${pc(sp)}). ${S.score.H}–${S.score.A}`, 'goal');
  banner('Goal!', 'goal');
  renderHeader();
  await sleep(1600);
  if (S.score[att] >= 3) {
    S.phase = 'over';
    clearSave(); // v2.66: a finished match isn't offered to continue
    log(`Full time. ${TEAMS[att].name} win.`, 'goal');
    render();
    return 'end';
  }
  const t = other(att);
  kickoff(t);
  S.attack = t;
  S.counter = false;
  S.buff = null;
  await settle();
  startTurn();
  return 'end';
}

// ---- v2.47 Shape step ----
const outfield = (T) => Object.keys(S.pos).filter((id) => team(id) === T && PL[id].role !== 'GK');
function shapeIdle(T) {
  const P = S.turnPos || {};
  return outfield(T).filter(
    (id) => id !== S.ball && !(S.shaped && S.shaped.has(id)) && P[id] && same(P[id], S.pos[id]),
  );
}
function shapeSpan(T, id, h) {
  const rows = outfield(T).map((x) => (x === id ? h : S.pos[x])[1]);
  return Math.max(...rows) - Math.min(...rows);
}
function shapeHexes(id) {
  const T = team(id),
    taken = new Set(Object.values(S.pos).map((h) => key(...h))),
    cur = shapeSpan(T, id, S.pos[id]);
  return nbrs(...S.pos[id]).filter((h) => {
    if (taken.has(key(...h)) || (S.loose && same(h, S.loose))) return false;
    if (shapeSpan(T, id, h) > Math.max(SHAPE_LEN, cur)) return false;
    if (T === S.attack) {
      const st = { pos: { ...S.pos, [id]: h }, ball: S.ball };
      if (onsideBack(st, T).some((m) => m.pid === id)) return false; // no stepping offside
    }
    return true;
  });
}
// where he'd stand in the team's shape: his kick-off spot, slid towards the ball
function shapeTarget(id) {
  const f = (pitchNow().forms[SIZE] || {})[id] || FORM[id] || S.pos[id],
    b = S.ball ? S.pos[S.ball] : S.loose || [KOC, MIDR];
  return [Math.round(f[0] + (b[0] - KOC) * 0.35), Math.round(f[1] + (b[1] - MIDR) * 0.6)];
}
// v2.53 Reshape: up to SHAPE_MOVES players step (Auto picks the ones furthest out of shape)
const SHAPE_MOVES = 3;
const shapeLeft = () => SHAPE_MOVES - (S.shaped ? S.shaped.size : 0);
function shapeAuto(T) {
  const moved = [],
    opts = shapeIdle(T)
      .map((id) => ({ id, d: hd(S.pos[id], shapeTarget(id)) }))
      .filter((o) => o.d > 0)
      .sort((a, b) => b.d - a.d);
  for (const { id } of opts) {
    if (shapeLeft() <= 0) break;
    const t = shapeTarget(id),
      now = hd(S.pos[id], t);
    let best = null,
      bd = now;
    for (const h of shapeHexes(id)) if (hd(h, t) < bd) (best = h), (bd = hd(h, t));
    if (best) {
      moved.push({ pid: id, from: S.pos[id].slice() });
      S.pos[id] = best.slice();
      S.shaped.add(id);
    }
  }
  return moved;
}
async function shapePhase() {
  clearPlay();
  S.shaped = new Set();
  const moves = [];
  // v2.49: only on a turnover, and only the side that just lost the ball (now defending) gets the free step
  for (const T of [other(S.attack)]) {
    if (!shapeIdle(T).length) continue;
    if (isCPU(T)) {
      moves.push(...shapeAuto(T));
      renderTokens({ dur: 300 });
      await sleep(reduce ? 60 : 450);
    } else {
      await new Promise((res) =>
        gate(T, 'Reshape: move up to 3 players 1 hex.', () => {
          S.phase = 'shape';
          S.shapeTeam = T;
          S.shUndo = [];
          S.ui = freshUI();
          shapeRes = res;
          render();
        }),
      );
      for (const b of S.shUndo) moves.push(...b);
      S.shapeTeam = null;
      S.phase = 'resolve';
    }
  }
  if (moves.length) gl(`shape ${moves.map((m) => `${m.pid} ${hx(m.from)}>${hx(S.pos[m.pid])}`).join(', ')}`, 'info');
  S.shaped = null;
  startTurn();
}

// ---- v2.66 autosave: the match is kept on this device at the start of every turn; the start screen offers Continue
const SAVE_KEY = 'hexball.save';
function autosave() {
  if (!S || S.mode === 'sim' || S.scenario) return;
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ text: stateText(), mode: S.mode, shape: SHAPE, at: Date.now(), score: S.score, turn: S.turn }),
    );
  } catch (e) {}
}
function readSave() {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return v && v.text ? v : null;
  } catch (e) {
    return null;
  }
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}
function continueSaved() {
  const v = readSave();
  if (!v) return;
  SHAPE = v.shape !== false;
  S = S || makeState(v.mode);
  S.mode = v.mode;
  const err = loadState(v.text);
  if (err) {
    clearSave();
    showStart();
  }
}
