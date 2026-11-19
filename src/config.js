const R = 20,
  SQ3 = Math.sqrt(3),
  PADX = 8,
  PADY = 28;
// Board size (v2.12: 9 × 13 for 7v7 and smaller, 13 × 19 for 11v11 match lineups; v2.23: 10 × 15 with a 4-wide goal).
// MIDC/MIDR = the middle of the pitch (MIDC is x.5 on an even-width board), BOXW = penalty box half-width in columns
// (the box is 3 rows deep), GOALW = goal width in columns (the goal is centred on MIDC). KOC = the column of the centre
// spot on row MIDR (on a 10-wide board the odd rows sit half a hex over, so column 4 of row 7 is dead centre).
// GKC = the keeper's home column on his goal line (an even goal has no middle column: one of the middle two).
let COLS, ROWS, W, H, MIDC, MIDR, BOXW, GOALW, KOC, GKC;
function sizeBoard(cols, rows, goalW = 3, boxW = null) {
  COLS = cols;
  ROWS = rows;
  MIDC = (cols - 1) / 2;
  MIDR = (rows - 1) / 2;
  GOALW = goalW;
  BOXW = boxW ? (boxW - 1) / 2 : cols > 9 ? 3 : 2;
  KOC = cols % 2 ? MIDC : MIDR % 2 ? MIDC - 0.5 : MIDC + 0.5;
  GKC = cols % 2 ? MIDC : MIDC + 0.5;
  W = R * SQ3 * (COLS + 0.5) + PADX * 2;
  H = R * 1.5 * (ROWS - 1) + R * 2 + PADY * 2;
}
sizeBoard(9, 13);
const RANGE = { ground: 6, lob: 8 }, // v2.26: lob 10 → 8 (v2.30: ground/lob chosen by distance, GROUND_MAX)
  LONG_GROUND = 4;
const TIER = {
  // ground: standing in the lane (lane) is weaker than standing on the receiver (star) — v1.7 buff for ground passes
  ground: { star: 0.55, lane: 0.4, press: 0.2 },
  lob: { star: 0.55, press: 0.12 },
  dribble: { star: 0.45 },
  // v2.16: close = a defender 1–2 hexes from the shooter on his goal side covers every aim spot (1 away, 2 away)
  shot: { star: 0.35, lane: 0.3, close: [0.22, 0.12] },
};
// v2.27: no pressure from next to the lane/receiver (was ground ctrl 0.12, shadow 0.06; lob ctrl 0.15)
// v2.30: one Pass: 1–4 hexes along the ground, 5–8 in the air (a cross keeps its own header / low choice)
const GROUND_MAX = 4;
const passKind = (d) => (d <= GROUND_MAX ? 'ground' : 'lob');
// v2.39–41 roles (one ability each, always on): DF Wall (can't be run through) · WG the only ones who cross ·
// MF Pinpoint (his passes never scatter) · FW Finisher (a pass or cross to him can always be finished first time,
// even as a 3rd kick)
const WING_RUN = 0; // v2.41: wingers no longer run 4 — their ability is the cross (only wingers can cross)
const PRESS = { ground: {}, lob: {} };
// v2.51: mini-games only for close contests (defender's odds between these); the rest resolve with a word
const DUEL_LO = 0.35,
  DUEL_HI = 0.65;
const FALL = [1, 0.5, 0.25, 0.15, 0.1, 0.1, 0.1];
const ZN = ['Top left', 'Top centre', 'Top right', 'Bottom left', 'Bottom centre', 'Bottom right'];
const RAR = {
  common: ['Common', '--common'],
  rare: ['Rare', '--rare'],
  epic: ['Epic', '--epic'],
  legendary: ['Legendary', '--legend'],
};
const TEAMS = { H: { name: 'Harbour', short: 'HAR' }, A: { name: 'Northgate', short: 'NOR' } };
const ROSTER = [
  {
    id: 'H1',
    team: 'H',
    num: 1,
    name: 'Okafor',
    role: 'GK',
    rar: 'rare',
    pac: 0,
    pas: 70,
    sho: 40,
    dri: 50,
    def: 62,
    ref: 79,
  },
  {
    id: 'H2',
    team: 'H',
    num: 2,
    name: 'Brandt',
    role: 'DF',
    rar: 'common',
    pac: 2,
    pas: 66,
    sho: 50,
    dri: 60,
    def: 76,
  },
  { id: 'H5', team: 'H', num: 5, name: 'Ivers', role: 'DF', rar: 'rare', pac: 3, pas: 70, sho: 52, dri: 62, def: 82 },
  { id: 'H6', team: 'H', num: 6, name: 'Sato', role: 'WG', rar: 'epic', pac: 3, pas: 85, sho: 68, dri: 79, def: 70 },
  {
    id: 'H8',
    team: 'H',
    num: 8,
    name: 'Mendes',
    role: 'WG',
    rar: 'common',
    pac: 3,
    pas: 74,
    sho: 66,
    dri: 70,
    def: 64,
  },
  {
    id: 'H10',
    team: 'H',
    num: 10,
    name: 'Ricci',
    role: 'MF',
    rar: 'legendary',
    pac: 3,
    pas: 89,
    sho: 81,
    dri: 87,
    def: 55,
  },
  { id: 'H9', team: 'H', num: 9, name: 'Duarte', role: 'FW', rar: 'rare', pac: 4, pas: 70, sho: 83, dri: 78, def: 40 },
  {
    id: 'A1',
    team: 'A',
    num: 1,
    name: 'Lindqvist',
    role: 'GK',
    rar: 'epic',
    pac: 0,
    pas: 72,
    sho: 40,
    dri: 50,
    def: 62,
    ref: 83,
  },
  { id: 'A4', team: 'A', num: 4, name: 'Haas', role: 'DF', rar: 'rare', pac: 2, pas: 68, sho: 50, dri: 58, def: 81 },
  {
    id: 'A3',
    team: 'A',
    num: 3,
    name: 'Moreau',
    role: 'DF',
    rar: 'common',
    pac: 3,
    pas: 65,
    sho: 48,
    dri: 62,
    def: 74,
  },
  { id: 'A7', team: 'A', num: 7, name: 'Adebayo', role: 'WG', rar: 'rare', pac: 4, pas: 72, sho: 70, dri: 81, def: 58 },
  { id: 'A8', team: 'A', num: 8, name: 'Novak', role: 'WG', rar: 'common', pac: 3, pas: 73, sho: 64, dri: 68, def: 68 },
  { id: 'A11', team: 'A', num: 11, name: 'Pérez', role: 'MF', rar: 'epic', pac: 3, pas: 84, sho: 72, dri: 80, def: 62 },
  {
    id: 'A9',
    team: 'A',
    num: 9,
    name: 'Volkov',
    role: 'FW',
    rar: 'legendary',
    pac: 3,
    pas: 72,
    sho: 89,
    dri: 82,
    def: 42,
  },
];
const PL = {};
ROSTER.forEach((p) => (PL[p.id] = p));
const FORM = {
  H1: [4, 12],
  H2: [2, 10],
  H5: [6, 10],
  H6: [1, 8],
  H8: [7, 8],
  H10: [4, 9],
  H9: [4, 7],
  A1: [4, 0],
  A4: [2, 2],
  A3: [6, 2],
  A7: [1, 4],
  A8: [7, 4],
  A11: [4, 3],
  A9: [4, 5],
};
// Team size: 7v7 (default), 6v6 or 5v5 on the start screen (v2.0). Match lineups are 7v7.
let SIZE = 7;
// Who sits out at each size, and where the rest line up (overrides of FORM).
const DROP = { 7: [], 6: ['H8', 'A8'], 5: ['H8', 'A8', 'H2', 'A3'] };
const FORMS = {
  7: {},
  6: { H6: [2, 8], H10: [6, 8], A7: [2, 4], A11: [6, 4] },
  5: { H5: [4, 10], H6: [2, 8], H10: [6, 8], A4: [4, 2], A7: [2, 4], A11: [6, 4] },
};
// Match lineups (v2.13): real teams from a team sheet, played 7v7 on the usual board. Before kick-off you pick 7 of
// each XI (one keeper) on the squad screen; they line up by role (keeper, then defenders → midfielders → forwards from
// the back), the most forward one kicks off. Arsenal are H (attack up). Numbers are positional (1 keeper … 9
// striker), ratings rough guesses for play, not official.
const P11 = (team, num, name, role, rar, pac, pas, sho, dri, def, ref) => ({
  id: team + num,
  team,
  num,
  name,
  role,
  rar,
  pac,
  pas,
  sho,
  dri,
  def,
  ...(ref ? { ref } : {}),
});
const MATCHES = {
  'sla-ars': {
    label: 'Slavia v Arsenal · 4 Nov 2026',
    teams: { H: { name: 'Arsenal', short: 'ARS' }, A: { name: 'Slavia Praha', short: 'SLA' } },
    squad: [
      P11('H', 1, 'Raya', 'GK', 'epic', 0, 78, 30, 50, 60, 85),
      P11('H', 2, 'White', 'DF', 'rare', 3, 76, 58, 72, 80),
      P11('H', 3, 'Hincapié', 'DF', 'rare', 3, 72, 50, 70, 81),
      P11('H', 4, 'Konsa', 'DF', 'rare', 2, 70, 45, 62, 82),
      P11('H', 5, 'Gabriel', 'DF', 'epic', 2, 70, 60, 60, 87),
      P11('H', 6, 'Zubimendi', 'MF', 'epic', 2, 87, 62, 78, 80),
      P11('H', 7, 'Madueke', 'FW', 'rare', 3, 74, 77, 84, 40),
      P11('H', 8, 'Rice', 'MF', 'legendary', 3, 86, 76, 80, 82),
      P11('H', 9, 'Gyökeres', 'FW', 'epic', 3, 70, 86, 78, 40),
      P11('H', 10, 'Merino', 'MF', 'rare', 2, 80, 74, 74, 74),
      P11('H', 11, 'Eze', 'FW', 'epic', 3, 84, 82, 86, 45),
      P11('A', 1, 'Domchak', 'GK', 'common', 0, 60, 30, 45, 55, 74),
      P11('A', 2, 'Holeš', 'DF', 'rare', 2, 70, 55, 62, 78),
      P11('A', 3, 'Nowak', 'DF', 'common', 2, 66, 45, 58, 75),
      P11('A', 4, 'Zima', 'DF', 'rare', 2, 66, 45, 58, 78),
      P11('A', 5, 'Vlček', 'MF', 'common', 2, 72, 55, 64, 74),
      P11('A', 6, 'Sadílek', 'MF', 'rare', 3, 76, 62, 70, 72),
      P11('A', 7, 'Moses', 'MF', 'common', 3, 68, 58, 72, 66),
      P11('A', 8, 'Kubiak', 'MF', 'common', 3, 72, 68, 74, 50),
      P11('A', 9, 'Šturm', 'FW', 'rare', 3, 64, 76, 70, 40),
      P11('A', 10, 'Suleiman', 'MF', 'rare', 3, 72, 70, 78, 45),
      P11('A', 11, 'Ayaosi', 'MF', 'common', 3, 68, 58, 70, 66),
    ],
    // suggested 7 a side (the squad screen starts with these)
    pick: { H: ['H1', 'H4', 'H5', 'H8', 'H6', 'H11', 'H9'], A: ['A1', 'A2', 'A4', 'A6', 'A10', 'A8', 'A9'] },
  },
};
// 7-a-side slots for Harbour (H, from the bottom), back to front; Northgate (A) mirror them (row → ROWS-1 - row).
const SLOTS7 = {
  GK: [4, 12],
  out: [
    [2, 10],
    [6, 10],
    [4, 9],
    [1, 8],
    [7, 8],
    [4, 7],
  ],
};
const ROLE_ORDER = { DF: 0, MF: 1, WG: 1, FW: 2 };
// Line a picked 7 up: keeper in goal, the rest by role from the back. Returns { form, ko } (ko: who kicks off).
function lineUp(ids, team) {
  const form = {},
    flip = (h) => (team === 'H' ? h.slice() : [h[0], ROWS - 1 - h[1]]),
    pl = ids.map((id) => PL[id]),
    gk = pl.find((p) => p.role === 'GK'),
    out = pl
      .filter((p) => p !== gk)
      // back to front by role; within a role the better finisher further forward (the front man kicks off)
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.sho - b.sho || a.num - b.num);
  const slots = pitchNow().slots;
  if (gk) form[gk.id] = flip(slots.GK);
  out.forEach((p, i) => (form[p.id] = flip(slots.out[i])));
  return { form, ko: out.length ? out[out.length - 1].id : ids[0] };
}
const CLASSIC = {
  cols: 9,
  rows: 13,
  teams: { H: { ...TEAMS.H }, A: { ...TEAMS.A } },
  roster: ROSTER.slice(),
  form: { ...FORM },
};
// Pitches (v2.23, start screen): the classic 9 × 13 with a 3-wide goal, and a 10 × 15 with a 4-wide goal and a 6-wide
// box (no middle column in goal: the keeper has to pick a side). Each has its own 7v7 shape (H from the bottom, A
// mirrored), 6v6/5v5 overrides and match-lineup slots. On 10 wide the odd rows' column 4 is dead centre.
const PITCHES = {
  classic: { label: '9 × 13 · goal 3', cols: 9, rows: 13, goal: 3, box: 5, form: CLASSIC.form, forms: FORMS, slots: SLOTS7 },
  wide: {
    label: '10 × 15 · goal 4',
    cols: 10,
    rows: 15,
    goal: 4,
    box: 6,
    form: {
      H1: [5, 14],
      H2: [2, 12],
      H5: [7, 12],
      H10: [4, 11],
      H6: [1, 10],
      H8: [8, 10],
      H9: [4, 9],
      A1: [5, 0],
      A4: [2, 2],
      A3: [7, 2],
      A11: [4, 3],
      A7: [1, 4],
      A8: [8, 4],
      A9: [4, 5],
    },
    forms: {
      7: {},
      6: { H6: [2, 10], H10: [7, 10], A7: [2, 4], A11: [7, 4] },
      5: { H5: [4, 13], H6: [2, 10], H10: [7, 10], A4: [4, 1], A7: [2, 4], A11: [7, 4] },
    },
    slots: {
      GK: [5, 14],
      out: [
        [2, 12],
        [7, 12],
        [4, 11],
        [1, 10],
        [8, 10],
        [4, 9],
      ],
    },
  },
};
let PITCH = 'classic';
const pitchNow = () => PITCHES[PITCH] || PITCHES.classic;
// Who kicks off for each team (v2.13: the most forward picked player in a match lineup).
const KO = { H: 'H9', A: 'A9' };
let LINEUP = 'classic',
  PICKS = null;
function setLineup(k, picks) {
  const m = MATCHES[k];
  LINEUP = m ? k : 'classic';
  PICKS = m ? { H: (picks || m.pick).H.slice(), A: (picks || m.pick).A.slice() } : null;
  const roster = m ? m.squad.filter((p) => PICKS[p.team].includes(p.id)) : CLASSIC.roster;
  ROSTER.length = 0;
  ROSTER.push(...roster);
  for (const id of Object.keys(PL)) delete PL[id];
  ROSTER.forEach((p) => (PL[p.id] = p));
  for (const id of Object.keys(FORM)) delete FORM[id];
  Object.assign(TEAMS.H, (m || CLASSIC).teams.H);
  Object.assign(TEAMS.A, (m || CLASSIC).teams.A);
  // the board first: lineUp mirrors Northgate's rows with ROWS
  const P = pitchNow();
  sizeBoard(P.cols, P.rows, P.goal, P.box);
  if (m)
    for (const t of ['H', 'A']) {
      const l = lineUp(PICKS[t], t);
      Object.assign(FORM, l.form);
      KO[t] = l.ko;
    }
  else {
    Object.assign(FORM, pitchNow().form);
    Object.assign(KO, { H: 'H9', A: 'A9' });
  }
  if (m) SIZE = 7;
  if (typeof initBoard === 'function' && typeof document !== 'undefined' && document.querySelector('#board'))
    initBoard();
}
// Movement: hexes per plan (MOVE), carrier (DRIBBLE); a marked player (defender on his hex) loses 1.
const MOVE = 3;
const DRIBBLE = 2;
// Playback: defence orders reach ORDER_MAX hexes (step budget per window: see WIN_*), lob lands in LOB_FRAMES,
// ground pass rolls GROUND_SPEED hexes per frame, defenders step DELAY frames after attackers (0 = same frame).
const ORDER_MAX = 2,
  LOB_FRAMES = 3,
  GROUND_SPEED = 3,
  DELAY = 0;
// Marking (react phase): MARKS defender(s) follow an attacker each frame (goal side); pick-up range MARK_RANGE hexes.
const MARKS = 1,
  MARK_RANGE = 3;
// Contest bonus for a defender who moved this turn.
const COMMIT = 0.12;
// Defence pauses continue on their own after AUTO_GO ms unless the defender taps the board (0 = always wait for Go).
let AUTO_GO = 0;
// React windows (v1.18): a step budget per window, not per turn. Send early and you cover more ground; wait for
// information and you have less. First window WIN_FIRST steps (2 on a counter); each later window gets
// WIN_MIN + steps left unused last window, capped at WIN_KEEP (save all → 3, spend all → 2). Up to WIN_SENDS players.
const WIN_FIRST = 5,
  WIN_KEEP = 3,
  WIN_MIN = 2,
  WIN_SENDS = 3;
// v2.8: React windows come on a clock — one every WIN_EVERY frames of play (no longer when the ball comes to rest).
const WIN_EVERY = 2;
// v2.8 clearances: a defender who wins a contest clears it instead of keeping it — CLEAR_BOX of the time in his own
// box, CLEAR_ELSE elsewhere. The ball flies CLEAR_DIST hexes away from his goal and lands loose; the play stops.
const CLEAR_BOX = 0.6,
  CLEAR_ELSE = 0.25,
  CLEAR_DIST = [3, 4];
// Control touch: frames a receiver needs after a lob before his next touch (v2.24: ground passes and cards are first-time).
const CONTROL = 1;
// Prepare (v1.25): once the attack is revealed, before its first action, the defence moves up to PREPARE_PLAYERS
// defenders PREPARE_STEPS hex each, instantly and free. Not on a counter.
const PREPARE_PLAYERS = 2,
  PREPARE_STEPS = 1;
// v2.25 defence modes (start screen): 'prepare' = the flow above (Prepare before frame 1, windows after frames 2, 4…);
// 'respond' = the attack moves first: no Prepare, windows after frames 1, 3, 5… (a first-time shot at frame 1 still goes
// off), plus Anticipate and the challenges (Tackle / Press / Block) below.
let DEF_MODE = 'respond'; // v2.34: Respond is the standard (Prepare stays on the start screen)
const respond = () => DEF_MODE === 'respond';
// Anticipate (respond mode): one defender at a time reads the play. A pass, dribble or shot coming through his hex or
// next to it gets a jump from him with READ_BONUS on his contest ("Read it!"). It stays set while his team defends
// (across turns, like a mark) until he's used it or is moved to another job; you see it as a ring round his hexes.
const READ_BONUS = 0.2;
// Challenges (respond mode), for a defender next to the man on the ball in a window: Tackle (2 steps: steps in and plays
// the timing game), Press (1 step: his next pass scatters PRESS_SCAT more, his next shot is PRESS_ACC less on target),
// Block (1 step: steps into his line to goal; +BLOCK_BONUS on that shot block).
const PRESS_SCAT = 0.12,
  PRESS_ACC = 0.1,
  BLOCK_BONUS = 0.15;
// CPU attack: false = whole-turn planner with runs (v1.33); true = the old greedy one (for comparison).
let CPU_OLD = false;
// Keeper save chance by how far he is from the aimed side, in hex widths (v2.3): in line, one column off; two or
// more off = KEEPER_FAR (v2.15: was 5%, so the far post was nearly free).
// v2.16: a keeper in his own box gets his hands to a pass or cross that comes to (or through) his hex: he claims it
// this often (ground / in the air). Outside the box he's a normal player for passes — and he doesn't go there.
const KEEPER_CLAIM = { ground: 0.75, lob: 0.65 }; // v2.18: eased (was 0.85 / 0.75)
const KEEPER_REACH = { ground: 0.2, lob: 0.15 }; // v2.61.1: lowered (user: too powerful; was 0.35 / 0.3)
// v2.61: a ball going past next to him in his box: he dives / comes for it
// v2.17 the keeper's power close in: closing the angle (columns to cover × this when he's 1 / 2 hexes from the
// shooter, goal side of him) and smothering a dribble on his hex in the box.
const KEEPER_CLOSE = { 1: 0.5, 2: 0.9 }, // v2.18: eased (was 0.25 / 0.8)
  KEEPER_SMOTHER = 0.55,
  // …and he comes for a dribbler who gets next to him in his box (rushes out); beat him and he's "beaten"
  KEEPER_RUSH = 0.3; // v2.18: eased (was 0.45)
let KEEPER_IN_LINE = 0.72,
  KEEPER_ONE_OFF = 0.46,
  KEEPER_FAR = 0.2; // v2.18: 0.25 → 0.2
// On target (v2.15): SHOT_BASE + goal-mouth angle in degrees × SHOT_PER_DEG, then zone/finishing modifiers.
let SHOT_BASE = 0,
  SHOT_PER_DEG = 0.012,
  // v2.16 pressure: each defender next to the shooter (up to 3) takes this off on target
  SHOT_PRESS = 0.08;
// Shots play in slow motion (drawing only): ball flight, keeper dive and lunges take SLOWMO × longer.
const SLOWMO = 2.5;
// Give & Go: the passer's return run (he doesn't have the ball while he runs, so it's longer than a dribble).
const GNG_RUN = 4;
// A player's second run in a turn is shorter, and running twice tires him: -1 hex on his team's next attacking turn.
const SECOND_RUN = 2;
// v2.11: one pass or shot a turn (Give & Go and the cross card count as it). Dribbles are free of that limit but
// count as one of the players who move (MAX_RUNNERS), like a run. v2.24: after a ground pass the receiver gets one more
// pass or shot (first time, no control); see kickMax() in plan.js.
const KICKS = 1;
const MAX_RUNNERS = 3;
// v2.47 Shape step (start screen, on by default): after every turn, each outfield player who didn't move that turn
// may step 1 hex (the team about to defend first, then the team about to attack). The team's outfield players must
// stay within SHAPE_LEN rows of each other (so a deep block leaves nobody up front).
let SHAPE = true;
const SHAPE_LEN = 6;
const CROSS_AS = {
  lob: { name: 'Cross', acc: -0.22, saveCut: 0.08, header: true },
  ground: { name: 'Low cross', acc: 0.18, saveCut: 0.25, header: false },
};
// Practice (v2.1, More → Win all duels): you win every duel and quiet contest (vs CPU: your side; hotseat: the attack).
// Keeper saves, shot accuracy and scatter still roll.
let WIN_ALL = false;
const DUEL_STAT = { pass: 'pas', lob: 'pas', dribble: 'dri', tackle: 'dri', shot: 'sho' };
