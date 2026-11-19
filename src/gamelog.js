// Game log + save states (v1.15). A compact, analysis-friendly log (one line per event, ids and hexes as c,r) and a
// snapshot of the board at the start of every turn. "Copy" puts snapshot + log on the clipboard; "Load" restores a
// snapshot (same dice seed), so a position can be replayed with different choices or rule tweaks.
const hx = (h) => (h ? `${h[0]},${h[1]}` : '-');
const ZS = ['TL', 'TC', 'TR', 'BL', 'BC', 'BR'];
function gl(txt, cls = '') {
  if (!S) return;
  const f = typeof S.frameNo === 'number' && S.phase !== 'plan' ? `.f${S.frameNo}` : '';
  (S.glog || (S.glog = [])).push({ t: `T${S.turn}${f} ${txt}`, cls });
  renderLog();
}
function planTxt(a) {
  const P = (id) => id;
  if (a.type === 'move' && !a.ball) return `run ${P(a.pid)} ${a.path.map(hx).join('>')}`;
  if (a.type === 'move') return `dribble ${P(a.pid)} ${a.path.map(hx).join('>')}`;
  if (a.type === 'shot') return `shot ${P(a.pid)} ${ZS[a.zone]}`;
  if (a.type === 'gng') return `gng ${P(a.from)}>${P(a.to)} return ${hx(a.ret)}`;
  if (a.type === 'cross') return `cross ${a.kind} ${P(a.from)}>${P(a.to)} ${ZS[a.zone]}`;
  return `${a.through ? 'through ' : ''}${a.kind} ${P(a.from)}>${a.to ? P(a.to) : 'space ' + hx(a.target)}`;
}
function snapshot() {
  return {
    v: '1.15',
    size: SIZE,
    ...(PITCH !== 'classic' ? { pitch: PITCH } : {}),
    ...(respond() ? { def: 'respond', read: S.read && S.read.of === other(S.attack) ? S.read : null } : {}),
    ...(LINEUP !== 'classic' ? { lineup: LINEUP, picks: PICKS } : {}),
    turn: S.turn,
    attack: S.attack,
    score: { ...S.score },
    pos: Object.fromEntries(Object.entries(S.pos).map(([k, v]) => [k, v.slice()])),
    ball: S.ball,
    loose: S.loose,
    cool: JSON.parse(JSON.stringify(S.cool || { H: [], A: [] })),
    marks: { ...(S.marks || {}) },
    marksOf: S.marksOf || null,
    counter: !!S.isCounter,
    ko: !!S.koBlock,
    seed: S.seed,
    tired: { ...(S.tired || {}) },
  };
}
function stateText() {
  const sn = S.snap || snapshot();
  return (
    `HEXBALL STATE v${sn.v} · start of turn ${sn.turn}\n${JSON.stringify(sn)}\n--- LOG ---\n` +
    (S.glog || []).map((l) => l.t).join('\n')
  );
}
async function copyState() {
  const txt = stateText();
  try {
    await navigator.clipboard.writeText(txt);
    banner('Copied', '');
  } catch (e) {
    openStateBox(txt, false); // clipboard blocked: show it to copy by hand
  }
}
function openStateBox(txt, load) {
  const el = $('#statebox');
  el.querySelector('textarea').value = txt;
  el.querySelector('.sb-title').textContent = load ? 'Paste a saved state' : 'Copy this state';
  el.querySelector('[data-sb="load"]').hidden = !load;
  el.hidden = false;
  if (!load) el.querySelector('textarea').select();
}
function loadState(txt, extra = {}) {
  let sn;
  try {
    sn = JSON.parse(txt.slice(txt.indexOf('{')).split('\n')[0]);
  } catch (e) {
    return 'Could not read that state (paste the whole copied text).';
  }
  if (!sn || !sn.pos) return 'That does not look like a Hexball state.';
  PITCH = PITCHES[sn.pitch] ? sn.pitch : 'classic'; // v2.23: older states and the presets are on 9 × 13
  DEF_MODE = sn.def === 'respond' ? 'respond' : 'prepare'; // v2.25
  setLineup(sn.lineup || 'classic', sn.picks);
  SIZE = sn.size || 7;
  const mode = S ? S.mode : 'hot';
  S = makeState(mode);
  Object.assign(S, {
    attack: sn.attack,
    score: sn.score,
    pos: sn.pos,
    ball: sn.ball,
    loose: sn.loose,
    cool: sn.cool || { H: [], A: [] },
    marks: sn.marks || {},
    marksOf: sn.marksOf,
    read: sn.read || null, // v2.25 respond mode: who's reading the play
    // a saved 'active' tiredness is re-activated by startTurn, so load it as pending
    tired: Object.fromEntries(Object.keys(sn.tired || {}).map((k) => [k, 'pending'])),
    counter: !!sn.counter,
    kickoff: !!sn.ko,
    turn: sn.turn - 1,
    forceSeed: sn.seed,
    glog: [],
    ...extra,
  });
  $('#start').hidden = true;
  log(`Loaded a saved state: turn ${sn.turn}, ${TEAMS[sn.attack].name} to attack.`, 'info');
  gl(`LOADED state (seed ${sn.seed})`);
  startTurn();
  return null;
}

// Built-in scenarios: saved positions to replay (same shape as a copied state).
const SCENARIOS = {
  // Northgate already high up the pitch with the ball; you (Harbour) defend. New dice every time.
  attackOn: {
    name: 'Attack in progress',
    note: 'Northgate have worked it into your half. Defend: hide the keeper, send one player ahead, then react every 2 frames.',
    cpu: true,
    state: {
      v: '1.15',
      size: 7,
      turn: 1,
      attack: 'A',
      score: { H: 0, A: 0 },
      pos: {
        A1: [4, 0],
        A4: [3, 4],
        A3: [6, 5],
        A7: [1, 8],
        A8: [7, 7],
        A11: [4, 7],
        A9: [5, 9],
        H1: [4, 12],
        H2: [3, 10],
        H5: [6, 10],
        H6: [2, 8],
        H8: [6, 8],
        H10: [4, 8],
        H9: [4, 5],
      },
      ball: 'A11',
      loose: null,
      cool: { H: [], A: [] },
      marks: {},
      marksOf: 'H',
      counter: false,
      ko: false,
      seed: 0,
    },
  },
  wingCross: {
    name: 'Right-wing cross (31 Oct)',
    note: 'Harbour to attack. Your goal: #8 dribbles up the right, low cross to #6 at the back post. #9 and #10 run into the middle.',
    state: {
      v: '1.15',
      size: 7,
      turn: 2,
      attack: 'H',
      score: { H: 0, A: 0 },
      pos: {
        H1: [4, 12],
        H2: [2, 10],
        H5: [6, 10],
        H6: [4, 2],
        H8: [8, 5],
        H9: [4, 6],
        H10: [6, 6],
        A1: [4, 0],
        A4: [2, 2],
        A3: [6, 2],
        A11: [4, 3],
        A8: [7, 4],
        A9: [4, 5],
        A7: [0, 6],
      },
      ball: 'H8',
      loose: null,
      cool: { H: [], A: [] },
      marks: {},
      marksOf: 'A',
      counter: false,
      ko: false,
      seed: 1031,
    },
    // the attack you played (replayed automatically when you defend it)
    plan: [
      {
        type: 'move',
        pid: 'H6',
        path: [
          [4, 2],
          [5, 2],
          [5, 1],
          [6, 0],
        ],
        ball: false,
      },
      {
        type: 'move',
        pid: 'H9',
        path: [
          [4, 6],
          [3, 5],
          [3, 4],
          [2, 4],
        ],
        ball: false,
      },
      {
        type: 'move',
        pid: 'H10',
        path: [
          [6, 6],
          [5, 5],
          [5, 4],
          [4, 4],
        ],
        ball: false,
      },
      {
        type: 'move',
        pid: 'H8',
        path: [
          [8, 5],
          [8, 4],
          [8, 3],
        ],
        ball: true,
      },
      { type: 'cross', from: 'H8', to: 'H6', kind: 'ground', zone: 2, target: [6, 0], ball: true },
    ],
  },
};
// as: 'defend' = you defend, the attack replays the scenario plan; 'both' = hotseat, you play both sides.
let scnTries = [];
function loadScenario(k, as = 'defend', seed = null) {
  const sc = SCENARIOS[k],
    st = { ...sc.state, seed: seed != null ? seed : sc.cpu ? (Math.random() * 4294967296) >>> 0 : sc.state.seed };
  if (sc.cpu) {
    // a live game vs the CPU from this position (no replay box)
    S = makeState('cpu');
    const err = loadState(JSON.stringify(st));
    if (!err) log(sc.note, 'info');
    return err;
  }
  S = makeState('hot');
  const err = loadState(JSON.stringify(st), { scenario: { k, as, turn: st.turn, seed: st.seed } });
  if (!err) log(sc.note, 'info');
  return err;
}
// Called when the scenario's turn is over: show the result and the retry box.
function scenarioEnd() {
  const sc = S.scenario,
    L = (S.glog || [])
      .map((l) => l.t)
      .filter((t) => t.startsWith(`T${sc.turn}`))
      .join('\n');
  const m = /GOAL|SAVED|WIDE|BLOCKED|TURNOVER/.exec(L);
  const res = m
    ? { GOAL: 'Goal', SAVED: 'Saved', WIDE: 'Wide', BLOCKED: 'Blocked', TURNOVER: 'Won the ball' }[m[0]]
    : 'They kept the ball';
  scnTries.push(res);
  S.phase = 'scnend';
  render();
  const box = $('#scnend');
  box.querySelector('.se-res').textContent = res;
  box.querySelector('.se-hist').textContent = `Attempts: ${scnTries.join(' · ')}`;
  box.hidden = false;
}
function scenarioRetry(newDice) {
  const sc = S.scenario;
  $('#scnend').hidden = true;
  loadScenario(sc.k, sc.as, newDice ? (Math.random() * 4294967296) >>> 0 : sc.seed);
}

// Retry my last attack (v2.1): back to the start of your most recent attacking turn (vs CPU), or of the last turn
// (hotseat), with new dice. The turn being planned right now doesn't count until something has been played.
// Go back one turn (v2.9): the start of the previous turn whoever attacked (mid-turn: the start of this one).
// Same dice (More switch): the turn's seed is kept, so the CPU makes the same choices and the dice come out the same
// for the same actions.
let SAME_DICE = false;
function rewindSnap(any = false) {
  if (!S || !S.snaps) return null;
  const fresh = S.phase === 'plan' || S.phase === 'gate';
  for (let i = S.snaps.length - 1; i >= 0; i--) {
    const sn = S.snaps[i];
    if (fresh && sn.turn === S.turn) continue;
    if (!any && S.mode === 'cpu' && sn.attack !== 'H') continue;
    return sn;
  }
  return null;
}
function rewind(any = false) {
  const sn = rewindSnap(any);
  if (!sn) return;
  const keep = S.snaps.slice(0, S.snaps.indexOf(sn)),
    glog = (S.glog || []).concat([{ t: `REWIND to turn ${sn.turn}${SAME_DICE ? ' (same dice)' : ''}`, cls: 'info' }]);
  // abandon whatever was waiting (a defence pause, the hand-over screen)
  reactRes = null;
  gateCb = null;
  ['#gate', '#duel', '#scnend', '#start'].forEach((q) => ($(q).hidden = true));
  const seed = SAME_DICE ? sn.seed : (Math.random() * 4294967296) >>> 0;
  loadState(JSON.stringify({ ...sn, seed }), { snaps: keep, glog, scenario: S.scenario || undefined });
}
