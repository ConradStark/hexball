function oddsHTML(p) {
  return p == null ? '<span class="p">—</span>' : `<span class="p ${pcls(p)}">${pc(p)}</span>`;
}
// v2.1: the side panel is short. Plan: the list of steps (× removes a step and everything after it). Defence: the
// window's budget. The long explanations live under More → How a turn works.
function renderPanel() {
  const P = $('#panel'),
    ph = S.phase,
    att = S.attack,
    def = other(att);
  let h = '';
  if (ph === 'idle' || ph === 'gate') h = `<p class="pn-l">Ready.</p>`;
  else if (ph === 'plan') {
    const pst = project(baseSt(), S.plan, S.plan.length),
      c = pst.ball,
      d = doubler();
    h = `<div class="pn-h"><h3>${TEAMS[att].name} · your plan</h3><span class="chips"><b>Pass/shot ${kicks()}/${kickMax()}</b> · <b>Moving ${runnerSet().size}/${MAX_RUNNERS}</b>${d ? ` · double: #${PL[d].num}` : ''}</span></div>`;
    if (S.isCounter) h += `<p class="pn-l acc">Counter: the defence can't prepare.</p>`;
    if (!c && pst.loose) h += `<p class="pn-l acc">Loose ball: run a player onto it.</p>`;
    if (c && buffFor(c)) h += `<p class="pn-l acc">${nm(c)} has +12% from a perfect pass.</p>`;
    h += S.plan.length
      ? planList(true)
      : `<p class="pn-l">No steps yet. Set up runs, then play the ball into them.</p>`;
  } else if (ph === 'cpuplan') h = `<p class="pn-l">${TEAMS[att].name} are planning…</p>`;
  else if (ph === 'react' && S.frame && S.frame.prep) {
    h = `<div class="pn-h"><h3>${TEAMS[def].name} · prepare</h3><span class="chips"><b>${PREPARE_PLAYERS - S.prepped.size}</b> of ${PREPARE_PLAYERS} players to move ${PREPARE_STEPS} hex</span></div>
    <p class="pn-l">You see their players, not their plan. Your keeper counts and stays in his box.</p>`;
  } else if (ph === 'react' && S.frame) {
    const mk = Object.entries(marksNow())[0],
      left = WIN_SENDS - (S.sent || 0);
    h = respond()
      ? `<div class="pn-h"><h3>${TEAMS[def].name} · react · window ${S.win + 1}</h3><span class="chips">Moved <b>${S.sent || 0}</b>/${S.isCounter && S.win === 0 ? 1 : WIN_SENDS} · up to ${ORDER_MAX} hexes each</span></div>`
      : `<div class="pn-h"><h3>${TEAMS[def].name} · react · window ${S.win + 1}</h3><span class="chips"><span class="pips">${pips(S.budget, S.win === 0 ? (S.isCounter ? 2 : WIN_FIRST) : WIN_KEEP)}</span> <b>${S.budget}</b> step${S.budget === 1 ? '' : 's'} · ${left} to send</span></div>`;
    h += `${S.evt && S.frame.k > 0 ? `<p class="pn-l"><b>${S.evt}.</b></p>` : ''}
    <p class="pn-l">Mark: ${mk ? `${nm(mk[0])} on ${nm(mk[1])}` : 'nobody'}.${respond() ? ` Reading: ${readPid(def) ? nm(readPid(def)) : 'nobody'}.` : ''} ${respond() ? '' : ` Next window: ${WIN_MIN} + what you leave, up to ${WIN_KEEP}.`}${S.tk ? ` ${nm(S.tk)} can tackle (${pc(tackleP(S.tk))}, 2 steps).` : ''}</p>`;
  } else if (ph === 'shape') {
    const T = S.shapeTeam;
    h = `<div class="pn-h"><h3>Reshape · move up to ${SHAPE_MOVES}</h3><span class="chips">Moved <b>${S.shaped.size}</b>/${SHAPE_MOVES}</span></div>`;
  } else if (ph === 'resolve') h = `<p class="pn-l">Playing it out…</p>`;
  else if (ph === 'over') {
    const w = S.score.H > S.score.A ? 'H' : 'A';
    h = `<div class="pn-h"><h3>Full time</h3></div><p class="pn-l">${TEAMS[w].name} win ${S.score[w]}–${S.score[other(w)]}.</p>`;
  }
  P.innerHTML = h;
}
function planList(edit = false) {
  if (!S.plan.length) return '';
  const base = baseSt();
  let t = 0;
  const seen = {};
  return `<ol class="plan">${S.plan
    .map((a, i) => {
      const d = describe(project(base, S.plan, i), a);
      let k;
      let lab;
      if (a.type === 'move') {
        seen[a.pid] = (seen[a.pid] || 0) + 1;
        k = a.ball ? '◦' : seen[a.pid] > 1 ? '»' : '›';
        lab = `${a.ball ? 'Dribble' : 'Run'}${seen[a.pid] > 1 ? ' (second move)' : ''} · `;
      } else {
        t++;
        k = `<span class="tch">●</span>`;
        lab = a.type === 'shot' ? 'Shot · ' : 'The pass · ';
      }
      const after = S.plan.length - 1 - i;
      return `<li><span class="k">${k}</span><span class="t">${d.t}<span class="sub">${lab}${d.sub}</span></span>${oddsHTML(d.p)}${edit ? `<button class="rm" data-a="rm" data-v="${i}" aria-label="Remove this step${after ? ` and the ${after} after it` : ''}">✕</button>` : ''}</li>`;
    })
    .join('')}</ol>`;
}
function pips(n, m) {
  let s = '';
  for (let i = 0; i < m; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`;
  return s;
}
const ROLE_CARD = {
  DF: { name: 'Defender', ab: 'Wall', c: '#5b8def' },
  WG: { name: 'Winger', ab: 'Cross', c: '#2fb879' },
  MF: { name: 'Midfielder', ab: 'Pinpoint', c: '#9b5cf0' },
  FW: { name: 'Striker', ab: 'Finisher', c: '#d9a21b' },
  GK: { name: 'Keeper', ab: 'Hands', c: '#7a6446' },
};
let CARD_OPEN = (() => {
  try {
    return localStorage.getItem('hexCard') !== '0';
  } catch (e) {
    return true;
  }
})();
function renderCard() {
  const el = $('#pcard'),
    id = S.ui.info;
  if (!id) {
    el.hidden = true;
    return;
  }
  const p = PL[id],
    [rl, rv] = RAR[p.rar];
  const stats =
    p.role === 'GK'
      ? [
          ['REF', p.ref],
          ['PAS', p.pas],
          ['DEF', p.def],
        ]
      : [
          ['PAS', p.pas],
          ['SHO', p.sho],
          ['DRI', p.dri],
          ['DEF', p.def],
        ];
  el.hidden = false;
  // v2.52: compact card under the bar: number, name, role + ability; ⓘ folds the stats away (remembered)
  const R = ROLE_CARD[p.role] || ROLE_CARD.GK,
    open = CARD_OPEN;
  el.innerHTML = `<div class="pc-head"><div class="pc-num" style="border-color:${R.c};background:${p.team === 'H' ? 'var(--home)' : 'var(--away)'};color:${p.team === 'H' ? 'var(--homeInk)' : 'var(--awayInk)'}">${p.num}</div>
   <div class="pc-name">${p.name}</div><span class="pc-role" style="color:${R.c}">${R.name} · ${R.ab}</span>
   <button class="pc-i${open ? ' on' : ''}" data-a="cardi" aria-label="${open ? 'Hide stats' : 'Show stats'}" aria-pressed="${open}">i</button></div>
   ${open ? `<div class="stats">${stats.map(([k, v]) => `<div class="stat"><span>${k}</span><div class="bar"><i style="width:${v}%;background:${p.team === 'H' ? 'var(--home)' : '#7d93a8'}"></i></div><b>${v}</b></div>`).join('')}</div>` : ''}`;
}
function renderHeader() {
  $('#score').innerHTML =
    `<span class="sw" style="background:var(--home)"></span><span class="tm">${TEAMS.H.short}</span><span class="n">${S.score.H}</span><span class="dash">–</span><span class="n">${S.score.A}</span><span class="tm">${TEAMS.A.short}</span><span class="sw" style="background:var(--away)"></span>`;
  // v2.20: turn count top right, with who's attacking underneath (vs CPU from your side, hotseat by team)
  let st = '';
  if (S.phase === 'over') st = '<span class="stt ft">Full time</span>';
  else if (S.phase !== 'idle' && S.attack) {
    const att = S.mode === 'hot' ? true : S.attack === 'H';
    st = `<span class="stt ${att ? 'att' : 'def'}">${S.mode === 'hot' ? `${TEAMS[S.attack].short} attack` : att ? 'Attacking' : 'Defending'}</span>`;
  }
  const extra = `${S.isCounter && S.phase !== 'idle' ? '<span class="tag ctr">Counter</span>' : ''}${WIN_ALL ? '<span class="tag ctr">Practice</span>' : ''}`;
  $('#status').innerHTML = `<span class="tn">Turn ${Math.max(1, S.turn)}</span><span class="st-row">${extra}${st}</span>`;
}
function renderLog() {
  const L = (S.glog || []).slice(-120).reverse();
  $('#log').innerHTML = L.map((l) => `<li class="${l.cls}">${l.t}</li>`).join('');
  if ($('#more').open) renderFeed();
}
// Match feed (v2.2): a readable view built from the technical game log — per turn the plan, then what happened:
// duels with their odds and winner, shots with on-target and save chances, the result. Newest turn first.
const ZFEED = {
  TL: 'top left',
  TC: 'top centre',
  TR: 'top right',
  BL: 'bottom left',
  BC: 'bottom centre',
  BR: 'bottom right',
};
const pnum = (id) => (PL[id] ? `<i class="pn ${team(id)}">${PL[id].num}</i>` : id);
const tshort = (t) => TEAMS[t].short;
function feedPlan(txt) {
  if (txt === '(none)') return '<span class="fp">no plan</span>';
  return txt
    .split(' | ')
    .map((x) => {
      let m;
      if ((m = /^run (\w+) (.+)/.exec(x))) return `${pnum(m[1])} run ${m[2].split('>').length - 1}`;
      if ((m = /^dribble (\w+) (.+)/.exec(x))) return `${pnum(m[1])} dribble ${m[2].split('>').length - 1}`;
      if ((m = /^shot (\w+) (\w\w)/.exec(x))) return `${pnum(m[1])} shot ${ZFEED[m[2]]}`;
      if ((m = /^gng (\w+)>(\w+)/.exec(x))) return `${pnum(m[1])}↔${pnum(m[2])} give &amp; go`;
      if ((m = /^cross (\w+) (\w+)>(\w+) (\w\w)/.exec(x)))
        return `${pnum(m[2])}→${pnum(m[3])} ${m[1] === 'lob' ? 'cross, header' : 'low cross'} ${ZFEED[m[4]]}`;
      if ((m = /^(through )?(ground|lob) (\w+)>(space [\d,]+|\w+)/.exec(x)))
        return `${pnum(m[3])}→${m[4].startsWith('space') ? 'space' : pnum(m[4])} ${m[1] ? 'through ball' : m[2] === 'lob' ? 'lob' : 'pass'}`;
      return x;
    })
    .map((h) => `<span class="fp">${h}</span>`)
    .join('');
}
const DUELTXT = {
  pass: 'Interception',
  press: 'Press',
  lob: 'Header',
  dribble: '1 v 1',
  tackle: 'Tackle',
  shot: 'Block',
};
function feedRow(t) {
  let m;
  const row = (k, html, cls = '') => ({ k, html, cls });
  if ((m = /^PLAN (.*)/.exec(t))) return row('Plan', feedPlan(m[1]), 'f-plan');
  if ((m = /^prepare (.*)/.exec(t)))
    return row(
      'Prepare',
      m[1]
        .split(', ')
        .map((x) => pnum(x.split('>')[0]))
        .join(' ') + ' step up',
      'f-def',
    );
  if ((m = /^order (\w+) \S+ \((\d+) st/.exec(t)))
    return row('Move', `${pnum(m[1])} ${m[2]} hex${m[2] === '1' ? '' : 'es'}`, 'f-def');
  if ((m = /^mark (\w+) on (\w+)/.exec(t))) return row('Mark', `${pnum(m[1])} on ${pnum(m[2])}`, 'f-def');
  if ((m = /^(DUEL|contest) (\w+)(?:\/(\w+))? (\w+) v (\w+) p (\d+%)(?:>(\d+%) \(timing\))?.*> (DEF|ATT)/.exec(t))) {
    const [, kind, type, tier, d, a, p, p2, w] = m,
      win = w === 'DEF' ? d : a,
      lbl = type === 'pass' && tier === 'press' ? DUELTXT.press : DUELTXT[type] || type;
    return row(
      kind === 'DUEL' ? 'Duel' : 'Contest',
      `${lbl} ${pnum(d)} v ${pnum(a)} <b class="pct">${p2 || p}</b><span class="res ${team(win)}">${tshort(team(win))} ${w === 'DEF' ? 'win it' : 'keep it'}</span>`,
      'f-duel' + (kind === 'DUEL' ? '' : ' f-quiet'),
    );
  }
  if ((m = /^scatter (\d+%)/.exec(t))) return row('Ball', `scatters <b class="pct">${m[1]}</b>`);
  if ((m = /^loose @/.exec(t))) return row('Ball', 'runs loose');
  if ((m = /^(recv|collect) (\w+)/.exec(t)))
    return row('Ball', `${pnum(m[2])} ${m[1] === 'recv' ? 'receives' : 'collects'}`, 'f-quiet');
  if ((m = /^SHOT (\w+)@\S+ (\w\w) · on target (\d+%)(.*)/.exec(t))) {
    const extra = m[4]
      .split(' · ')
      .filter((x) => x && !x.startsWith('blockers'))
      .join(' ');
    return row(
      'Shot',
      `${pnum(m[1])} ${ZFEED[m[2]]}${extra ? ` <span class="as">${extra}</span>` : ''} · on target <b class="pct">${m[3]}</b>`,
      'f-shot',
    );
  }
  if ((m = /^keeper (\w+)@\S+ \((\w+)\) · save (\d+%)( · CRIT)?/.exec(t)))
    return row(
      'Keeper',
      `${pnum(m[1])} save <b class="pct">${m[3]}</b>${m[4] ? ' <span class="as">crit strike</span>' : ''}`,
      'f-shot',
    );
  if ((m = /^GOAL (\w+) · (\d+-\d+)/.exec(t)))
    return row('Goal', `<b>Goal</b> ${pnum(m[1])} <b>${m[2].replace('-', '–')}</b>`, 'f-goal');
  if ((m = /^SAVED by (\w+)/.exec(t))) return row('Result', `<b>Saved</b> by ${pnum(m[1])}`, 'f-bad');
  if (/^WIDE/.test(t)) return row('Result', '<b>Wide</b>', 'f-bad');
  if ((m = /^BLOCKED by (\w+)/.exec(t))) return row('Result', `<b>Blocked</b> by ${pnum(m[1])}`, 'f-bad');
  if ((m = /^WON (\w+)@\S+ \((.*)\)/.exec(t))) return row('Won', `${pnum(m[1])} ${m[2]}`, 'f-bad');
  if ((m = /^TURNOVER > (\w+)/.exec(t)))
    return row('Turnover', `${TEAMS[team(m[1])].name}'s ball${/crit/.test(t) ? ' · counter!' : ''}`, 'f-bad');
  if ((m = /^RESTART (.*?) > (\w+)/.exec(t))) return row('Restart', `${m[1]} · ${pnum(m[2])}`);
  if ((m = /^onside (.*)/.exec(t)))
    return row(
      'Onside',
      m[1]
        .split(', ')
        .map((x) => pnum(x.split(' ')[0]))
        .join(' ') + ' back onside',
    );
  if ((m = /^beaten (\w+)/.exec(t))) return row('Beaten', `${pnum(m[1])} out next turn`, 'f-quiet');
  if (/^(REWIND|LOADED)/.test(t))
    return row('', t.startsWith('REWIND') ? 'Retried from here' : 'State loaded', 'f-sep');
  return null;
}
function renderFeed() {
  const blocks = [];
  let cur = null;
  for (const l of S.glog || []) {
    const mm = /^T(\d+)(?:\.f\S+)? (.*)$/.exec(l.t);
    if (!mm) continue;
    const t = mm[2],
      h = /^== (H|A) attack · (\d+-\d+)(.*)/.exec(t);
    if (h) {
      cur = { turn: mm[1], team: h[1], score: h[2], counter: /COUNTER/.test(h[3]), rows: [] };
      blocks.push(cur);
      continue;
    }
    const r = feedRow(t);
    if (!r) continue;
    if (!cur) blocks.push((cur = { turn: mm[1], team: null, rows: [] }));
    cur.rows.push(r);
  }
  $('#feed').innerHTML = blocks.length
    ? blocks
        .slice(-40)
        .reverse()
        .map(
          (b) =>
            `<div class="fd-turn">${
              b.team
                ? `<div class="fd-h"><span class="sw ${b.team}"></span>Turn ${b.turn} · ${TEAMS[b.team].name} attack${b.counter ? ' <span class="tag ctr">Counter</span>' : ''}<span class="fd-sc">${b.score.replace('-', '–')}</span></div>`
                : ''
            }${b.rows.map((r) => `<div class="fd-r ${r.cls}"><span class="fd-k">${r.k}</span><span class="fd-v">${r.html}</span></div>`).join('')}</div>`,
        )
        .join('')
    : '<p class="pn-l">Nothing yet.</p>';
}
function renderPop() {
  const el = $('#pop'),
    ui = S.ui;
  let h = '',
    anchor = null,
    wide = false,
    spw = false;
  const X = '<button class="pbtn x" data-a="pclose" aria-label="Cancel">✕</button>';
  if (S.phase === 'plan') {
    const { pst, c } = planState(),
      att = S.attack;
    if (ui.mode === 'cross' && c && ui.pT) {
      anchor = goalHex(att);
      const as = CROSS_AS[ui.cross],
        t = ui.pT,
        vs = cloneSt(pst);
      vs.ball = t;
      const land = passEval(pst, c, t, ui.cross, new Set(), buffFor(c)).clean;
      h =
        `<div class="as-chip">${as.name} to ${nm(t)}: ${ui.cross === 'lob' ? 'header, harder to place' : 'first-time shot'}</div>` +
        goalPick(vs, t, as, 0, land);
      wide = true;
    } else if (ui.mode === 'shoot' && c) {
      anchor = goalHex(att);
      h = goalPick(pst, c, null, buffFor(c), 1);
      wide = true;
    } else if (ui.mode === 'pass' && c && !ui.gB && (ui.tB || (ui.pT && runsOf(ui.pT)))) {
      ({ h, anchor } = spaceWin(pst, c, att));
      spw = true;
    } else if (ui.mode === 'pass' && ui.pT && c && !ui.gB) {
      anchor = pst.pos[ui.pT];
      const d = hd(pst.pos[c], pst.pos[ui.pT]);
      // v2.30: one Pass; along the ground up to GROUND_MAX hexes, in the air beyond
      const opt = () => {
        if (d > RANGE.lob) return '';
        const k = passKind(d),
          e = passEval(pst, c, ui.pT, k, new Set(), buffFor(c));
        return `<button class="pbtn kb" data-a="pk" data-v="${k}">Pass <b class="${pcls(e.clean)}">${pc(e.clean)}</b></button>`;
      };
      const gngOk = cardOK('gng') && PL[c].pac > 0 && PL[ui.pT].role !== 'GK' && d <= 3,
        gngCool = !cardOK('gng') && PL[ui.pT].role !== 'GK' && d <= 3,
        xOK = crossOK(pst, c, ui.pT),
        xAv = xOK && crossShootOK(ui.pT); // v2.40: a striker can finish it as the 2nd kick
      const tk = passKind(d);
      // v2.32: a cross takes Pass's place: Shoot (first time: header if in the air, low shot if along the ground) or Wait
      const crossB = xOK
        ? (xAv
            ? `<button class="pbtn xb" data-a="pcross" data-v="${tk}">Cross · shoot</button>`
            : `<button class="pbtn" disabled>Cross · shoot (3rd kick)</button>`) +
          `<button class="pbtn kb" data-a="pk" data-v="${tk}">Cross · wait</button>`
        : '';
      // a teammate standing still (one making a run gets the tap-a-space window instead)
      h = `<div class="pop-btns">${xOK ? '' : opt()}${gngOk ? '<button class="pbtn" data-a="pgng">Give &amp; Go</button>' : gngCool ? '<button class="pbtn" disabled>Give &amp; Go · resting</button>' : ''}${crossB}${X}</div><div class="pop-s tline">${timingLine(d, tk, null)}</div>`;
    }
  }
  // v2.43: defending window: options open on the board, next to whoever you tapped
  if (S.phase === 'react' && ui.sel && ui.cPop) {
    const who = ui.cPop;
    anchor = S.pos[who];
    if (who === ui.sel) {
      // tapped his own defender again: Anticipate
      const rd = readPid(other(S.attack)) === ui.sel;
      h = `<div class="pop-btns"><button class="pbtn ch-an" data-a="antic"${rd ? ' disabled' : ''}>${rd ? 'Reading' : 'Anticipate'}</button>${X}</div>`;
    } else {
      const ch = who === S.ball && challengeOK(ui.sel),
        // v2.50: step onto his hex (any attacker he can reach this window)
        mvOK = defReach(baseSt(), ui.sel, Math.min(ORDER_MAX, S.budget)).has(key(...S.pos[who]));
      h =
        `<div class="pop-btns">` +
        (mvOK && !ch ? `<button class="pbtn ch-mv" data-a="cmove" data-v="${who}">Move</button>` : '') +
        (ch
          ? `<button class="pbtn kb ch-tk" data-a="ctackle"${S.budget >= 2 ? '' : ' disabled'}>Tackle <b>${pc(tackleP(ui.sel))}</b></button>` +
            `<button class="pbtn ch-pr" data-a="cpress"${S.budget >= 1 ? '' : ' disabled'}>Press</button>`
          : '') +
        // v2.54: out of mark range → the button says so (it used to do nothing)
        (canMark(ui.sel, who)
          ? `<button class="pbtn ch-mk" data-a="cmark" data-v="${who}">Mark</button>`
          : `<button class="pbtn ch-mk off" data-a="cfar">Mark</button>`) +
        `${X}</div>` +
        (ui.far === who ? `<div class="pop-s">Too far to mark (${MARK_RANGE} hexes max).</div>` : '');
    }
  }
  if (!anchor || S.phase === 'gate') {
    el.hidden = true;
    return;
  }
  el.innerHTML = h;
  el.classList.toggle('wide', wide);
  el.classList.toggle('spw', spw);
  el.hidden = false;
  const wrap = $('.boardWrap'),
    sc = wrap.clientWidth / W,
    [x, y] = px(...anchor),
    w = el.offsetWidth,
    hh = el.offsetHeight,
    off = R * sc + 6;
  const left = clamp(x * sc - w / 2, 4, wrap.clientWidth - w - 4);
  el.style.left = left + 'px';
  // below the tapped hex, so the goal side stays in view; above it only when there's no room underneath
  let top = y * sc + off,
    up = false;
  if (top + hh > wrap.clientHeight - 4) {
    top = y * sc - off - hh;
    up = true;
  }
  el.style.top = Math.max(4, top) + 'px';
  el.classList.toggle('up', up);
  el.style.setProperty('--nx', clamp(x * sc - left, 16, w - 16) + 'px');
}
// v2.21 tap-a-space window: tap an empty hex, or the hex a teammate's run ends on.
// Step 1 = Through ball (now, into the space) / Pass (held, so he gets it on time) / Cross (the card);
// step 2 = along the ground or in the air, each with its odds. A greyed option says why when tapped
// (Cross also lights up the areas a cross can come from).
const SP_ICON = {
  through:
    '<svg viewBox="0 0 30 14" aria-hidden="true"><path d="M2 7 H22" class="si-l"/><path d="M20 2 L28 7 L20 12 Z" class="si-h"/></svg>',
  pass: '<svg viewBox="0 0 30 14" aria-hidden="true"><path d="M2 12 Q13 -3 24 10" class="si-l si-d"/><path d="M21 6 L27 12 L19 12 Z" class="si-h"/></svg>',
  cross:
    '<svg viewBox="0 0 30 14" aria-hidden="true"><path d="M2 3 Q20 0 26 11" class="si-l si-d"/><circle cx="26" cy="11" r="2.6" class="si-h"/></svg>',
};
function spaceWin(pst, c, att) {
  const ui = S.ui,
    runner = ui.tB ? null : ui.pT,
    anchor = ui.tB || pst.pos[runner],
    d = hd(pst.pos[c], anchor),
    vs = cloneSt(pst);
  if (ui.tB) vs.pos._T = ui.tB.slice();
  const to = runner || '_T',
    ev = (k) => (d <= RANGE[k] ? passEval(vs, c, to, k, new Set(), buffFor(c)).clean : null),
    odds = { ground: ev('ground'), lob: ev('lob') },
    best = d <= RANGE.lob ? odds[passKind(d)] : null,
    X = '<button class="pbtn x" data-a="pclose" aria-label="Cancel">✕</button>',
    who = runner ? `${nm(c)} to ${nm(runner)}'s run` : `${nm(c)} into this space`;
  // why a cross isn't on (first reason that applies)
  const xWhy = !wideHex(pst.pos[c])
    ? `${nm(c)} isn't out wide. Cross from the highlighted areas.`
    : !runner
      ? 'Cross to a teammate: plan a run into the box first.'
      : gDist(att, pst.pos[runner]) > 3
        ? `${nm(runner)} must be within 3 hexes of goal to finish a cross.`
        : !cardOK('cross')
          ? 'The Cross card is resting this turn.'
          : null;
  const xOn = !xWhy && crossOK(pst, c, runner),
    xOK2 = !!runner && wideHex(pst.pos[c]) && gDist(att, pst.pos[runner]) <= 3 && crossOK(pst, c, runner),
    passWhy = runner ? null : 'A pass waits for a runner: plan a run to this hex first. Through ball goes now.';
  const pct = (p) => (p == null ? '' : `<b class="spp ${pcls(p)}">${pc(p)}</b>`);
  let h;
  if (!ui.sp) {
    const opt = (k, label, on, p, tag) =>
      `<button class="spo${on ? '' : ' off'}" data-a="sp" data-v="${k}"${on ? '' : ' aria-disabled="true"'}>${SP_ICON[k]}<span class="spl">${label}</span>${on ? pct(p) : `<small>${tag}</small>`}</button>`;
    const note =
      ui.spWhy === 'cross' && xWhy
        ? xWhy
        : ui.spWhy === 'pass' && passWhy
          ? passWhy
          : runner && xOK2
            ? 'Through ball goes now into the space. Cross: then shoot first time or wait.'
            : runner
            ? 'Through ball goes now into the space. A pass is held so he gets it on time.'
            : 'Through ball goes now: a runner has to get there first.';
    h =
      `<div class="sp-head"><span>${who}</span>${X}</div>` +
      // v2.32: two choices at most: Through, and Pass (or Cross when the setup is there)
      `<div class="sp3 two">${opt('through', 'Through', true, best)}${xOK2 ? opt('cross', 'Cross', true, best) : opt('pass', 'Pass', !passWhy, best, 'needs a runner')}</div>` +
      `<div class="sp-note${ui.spWhy ? ' why' : ''}">${note}</div>`;
  } else if (ui.sp === 'cross') {
    // v2.32: Shoot (first time; header if it's in the air, low shot if along the ground) or Wait (he controls it)
    const k = passKind(d),
      shootOK = crossShootOK(runner);
    h =
      `<div class="sp-head"><button class="sp-back" data-a="spback" aria-label="Back">‹</button><span>Cross to ${nm(runner)}</span>${X}</div>` +
      `<div class="sp2">` +
      (shootOK
        ? `<button class="spk" data-a="pcross" data-v="${k}">${k === 'lob' ? SP_ICON.pass : SP_ICON.through}<span class="spl">Shoot</span>${pct(odds[k])}</button>`
        : `<button class="spk off" disabled>${k === 'lob' ? SP_ICON.pass : SP_ICON.through}<span class="spl">Shoot</span><span class="why">${kicks() ? '3rd kick: only a striker can' : 'not now'}</span></button>`) +
      `<button class="spk" data-a="pk" data-v="${k}">${SP_ICON.cross}<span class="spl">Wait</span>${pct(odds[k])}</button>` +
      `</div><div class="sp-note">${k === 'lob' ? 'In the air: a header' : 'Low: a first-time shot'} if he shoots.</div>`;
  } else {
    const thr = ui.sp === 'through',
      tk = d <= RANGE.ground ? 'ground' : 'lob',
      line = thr ? timingLine(d, tk, runner) : passHoldLine(d, tk, runner);
    const k2 = (k, label, icon) =>
      odds[k] == null
        ? ''
        : `<button class="spk" data-a="pk" data-v="${k}">${icon}<span class="spl">${label}</span>${pct(odds[k])}</button>`;
    h =
      `<div class="sp-head"><button class="sp-back" data-a="spback" aria-label="Back">‹</button><span>${thr ? 'Through ball' : 'Pass'} · ${runner ? nm(runner) : 'into space'}</span>${X}</div>` +
      `<div class="sp2">${k2('ground', 'Along the ground', SP_ICON.through)}${k2('lob', 'In the air', SP_ICON.pass)}</div>` +
      `<div class="sp-note">${line[0].toUpperCase() + line.slice(1)}.</div>`;
  }
  return { h, anchor };
}
function planHint() {
  const ui = S.ui,
    { c, pst } = planState();
  if (ui.flash) {
    const f = ui.flash;
    ui.flash = null;
    return f;
  }
  if (finished() && !ui.mode)
    return `The plan ends with a shot. Add runs (${runnerSet().size}/${MAX_RUNNERS}) so players are in position after it, or lock it in.`;
  if (ui.mode === 'shoot') return 'Pick a zone.';
  if (ui.mode === 'pass' && ui.gB)
    return `Give &amp; Go: tap the space ${nm(c)} runs into (up to ${GNG_RUN} hexes, he's off the ball).`;
  if (ui.mode === 'pass' && (ui.tB || (ui.pT && runsOf(ui.pT))))
    return ui.sp === 'cross' ? 'Shoot first time or wait?' : 'Through ball or pass?';
  if (ui.mode === 'pass' && ui.pT) return 'Ground or lob?';
  if (ui.mode === 'pass')
    return canPassNow()
      ? `Tap a hex to dribble (again to pass there), a teammate, space${gDist(S.attack, pst.pos[c]) <= 7 ? ' or the goal' : ''}.`
      : `Dribble: tap a hex (counts as one of your ${MAX_RUNNERS} moving players).`;
  if (ui.mode === 'move')
    return `Run up to ${stepsFor(pst, ui.sel)}: tap a hex for ${nm(ui.sel)}.${runsOf(ui.sel) ? ' This is his second move.' : ''}`;
  if (!S.plan.length) return 'Set up your runs first, then play the ball into them.';
  return c && !kickUsed()
    ? kicks()
      ? `Ground pass: ${nm(c)} can pass or shoot again first time. Tap him, or add runs (${runnerSet().size}/${MAX_RUNNERS} moving).`
      : `Tap ${nm(c)} to pass, shoot or dribble, or add another run (${runnerSet().size}/${MAX_RUNNERS} moving).`
    : `Pass set. Add runs or a dribble (${runnerSet().size}/${MAX_RUNNERS} moving) or lock it in.`;
}
// Defence Undo (v2.14): takes back this window's last move, order or mark before Go.
const undoBtn = () => `<button class="btn" data-a="dundo"${S.dUndo && S.dUndo.length ? '' : ' disabled'}>Undo</button>`;
// v2.1 action bar under the board: secondary action on the left, main action on the right, a short hint below.
function renderBar() {
  const el = $('#bar'),
    ph = S.phase,
    ui = S.ui,
    att = S.attack;
  let L = '',
    M = '',
    R = '',
    m = '',
    acts = '';
  if (ph === 'plan') {
    m = planHint();
    L = `<button class="btn" data-a="undo"${S.plan.length ? '' : ' disabled'}>Undo</button>`;
    R = `<button class="btn main" data-a="lock"${S.plan.length ? '' : ' disabled'}>Play ▶</button>`;
  } else if (ph === 'react' && S.frame && S.frame.prep) {
    m = ui.sel
      ? `Tap a blue hex for #${PL[ui.sel].num}.`
      : `Prepare: tap a defender, then a hex next to him. ${PREPARE_PLAYERS - S.prepped.size} left.`;
    L = undoBtn();
    R = `<button class="btn main" data-a="rgo">Go ▶</button>`;
  } else if (ph === 'react' && S.frame) {
    const fl = ui.flash;
    ui.flash = null;
    m =
      fl ||
      (ui.sel
        ? `#${PL[ui.sel].num}: tap an attacker to mark him, or a hex up to ${Math.min(ORDER_MAX, S.budget)} away.`
        : 'React: tap a defender, then an attacker (mark) or a hex (move).');
    L = undoBtn();
    M =
      (S.tk ? `<button class="btn" data-a="tackle">Tackle ${pc(tackleP(S.tk))}</button>` : '') +
      `<button class="btn" data-a="rskip" title="Watch the rest of the turn">⏭</button>`;
    // v2.25 respond mode: the selected defender's jobs (Anticipate; next to the man on the ball: the challenges)
    // v2.43: the selected defender's options open on the board (tap the man on the ball: Tackle / Press / Mark;
    // another attacker: Mark; tap him again: Anticipate), not as buttons under it
    if (respond() && ui.sel && !isKeeper(ui.sel) && !fl)
      m = challengeOK(ui.sel)
        ? `#${PL[ui.sel].num}: tap a hex to move, #${PL[S.ball].num} to tackle or press, or #${PL[ui.sel].num} again to Anticipate.`
        : `#${PL[ui.sel].num}: tap a hex to move, an attacker to mark, or #${PL[ui.sel].num} again to Anticipate.`;
    R = `<button class="btn main${S.autoT ? ' auto' : ''}" data-a="rgo" style="--t:${AUTO_GO / SPEED}ms">Go ▶</button>`;
  } else if (ph === 'shape') {
    m = ui.sel ? `#${PL[ui.sel].num}: tap a hex.` : `Reshape · move up to ${SHAPE_MOVES}`;
    L = `<button class="btn" data-a="shundo"${S.shUndo && S.shUndo.length ? '' : ' disabled'}>Undo</button>`;
    M = `<button class="btn" data-a="shauto">Auto</button>`;
    R = `<button class="btn main" data-a="shdone">Done ▶</button>`;
  } else if (ph === 'resolve') m = `Playing…${S.touchNo ? ` touch ${S.touchNo}` : ''}`;
  else if (ph === 'cpuplan') m = `${TEAMS[att].name} are planning…`;
  else if (ph === 'over') {
    m = 'Full time.';
    R = `<button class="btn main" data-a="again">New match</button>`;
  }
  el.hidden = !m && !R;
  // v2.37: "Moved x/3" on the board in a Respond window
  const mb = $('#movedBadge');
  const showMb = (ph === 'react' && S.frame && respond() && !S.frame.prep) || ph === 'shape';
  mb.hidden = !showMb;
  if (showMb)
    mb.innerHTML =
      ph === 'shape'
        ? `Reshape <b>${S.shaped.size}</b>/${SHAPE_MOVES}`
        : `Moved <b>${S.sent || 0}</b>/${S.isCounter && S.win === 0 ? 1 : WIN_SENDS}`;
  // v2.26 danger toggle: on the board while you plan an attack
  const db = $('#dangerBtn');
  db.hidden = ph !== 'plan';
  db.classList.toggle('on', DANGER);
  db.setAttribute('aria-pressed', String(DANGER));
  el.innerHTML = `${L || M || R ? `<div class="bar-row"><span class="bar-l">${L}</span>${M}<span class="bar-r">${R}</span></div>` : ''}${acts ? `<div class="bar-acts">${acts}</div>` : ''}${m ? `<div class="bar-m">${m}</div>` : ''}`;
  renderMore();
}
// More: retry my last attack is only offered when play is stopped (planning, a defence pause, full time).
function renderMore() {
  const b = $('#rewind'),
    snap = rewindSnap(),
    calm = ['plan', 'react', 'over', 'gate', 'scnend'].includes(S.phase);
  const dice = SAME_DICE ? 'same dice' : 'new dice',
    tip = (sn) =>
      !sn
        ? 'Nothing to go back to yet'
        : calm
          ? `Back to the start of turn ${sn.turn} (${dice})`
          : 'Available when play stops';
  b.textContent = S.mode === 'cpu' ? 'Retry my last attack' : 'Retry the last turn';
  b.disabled = !snap || !calm;
  b.title = tip(snap);
  // vs CPU only: in hotseat "Retry the last turn" already is one turn back
  const b1 = $('#back1'),
    sn1 = rewindSnap(true);
  b1.hidden = S.mode !== 'cpu';
  b1.disabled = !sn1 || !calm;
  b1.title = tip(sn1);
  $('#sameDice').checked = SAME_DICE;
  $('#winAll').checked = WIN_ALL;
}
function render() {
  renderHeader();
  const g = renderOverlay();
  renderTokens(false, g);
  followLines();
  renderPanel();
  renderBar();
  renderPop();
  renderCard();
  renderLog();
}

// v2.4 goal picker. The goal is filled with colour = the chance of scoring at each of the six spots (aim × getting
// past blockers × beating the keeper wherever he could be by then), blended between them. Tap a spot to shoot.
// ⓘ switches to the detailed view: High/Med/Low on every spot, and a tap opens that spot's numbers with Shoot here.
let GOAL_DETAIL = false;
const SCALE = { aim: [0.5, 0.75], keeper: [0.2, 0.45], goal: [0.3, 0.55] };
const KEEPER_PLAN_REACH = 1; // hexes the keeper could move before a planned shot (his Prepare step)
function scalePos(v, [a, b]) {
  return v < a ? v / a / 3 : v < b ? 1 / 3 + (v - a) / (b - a) / 3 : 2 / 3 + (v - b) / (1 - b) / 3;
}
const lvl = (v, sc) => (v < sc[0] ? 'Low' : v < sc[1] ? 'Med' : 'High');
const lvlRange = (lo, hi, sc) => (lvl(lo, sc) === lvl(hi, sc) ? lvl(lo, sc) : `${lvl(lo, sc)}–${lvl(hi, sc)}`);
// red → amber → green along the scale (good = high); for the keeper pass bad = true (a high save chance is red)
function chanceCol(v, sc, bad = false) {
  let t = scalePos(v, sc);
  if (bad) t = 1 - t;
  const R = [255, 97, 112],
    A = [242, 193, 78],
    G = [118, 217, 140],
    mix = (x, y, u) => x.map((c, i) => Math.round(c + (y[i] - c) * u));
  const c = t < 0.5 ? mix(R, A, t * 2) : mix(A, G, (t - 0.5) * 2);
  return `rgb(${c.join(',')})`;
}
// save chance at zone z over every hex the keeper could reach before the shot: [lowest, highest]
// …plus a likely value: where he stands now counts as much as all the other spots together (colour uses this)
function keeperRange(st, att, z, dg, as, s = null) {
  const gk = gkOf(other(att));
  if (!gk || !st.pos[gk]) return [0, 0, 0];
  const now = saveP(z, st.pos[gk], att, dg, PL[gk].ref, as, s),
    v = [...defReach(st, gk, KEEPER_PLAN_REACH).values()].map((i) => saveP(z, i.h, att, dg, PL[gk].ref, as, s));
  const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : now;
  return [Math.min(now, ...v), Math.max(now, ...v), (now + avg) / 2];
}
function zoneInfo(st, pid, as, buff, land) {
  const att = team(pid);
  return [0, 1, 2, 3, 4, 5].map((z) => {
    const e = shotEval(st, pid, z, new Set(), buff, as),
      [sLo, sHi, sMid] = keeperRange(st, att, z, e.dg, as, st.pos[pid]),
      gLo = land * e.p * (1 - sHi),
      gHi = land * e.p * (1 - sLo);
    return { z, e, sLo, sHi, gLo, gHi, mid: land * e.p * (1 - sMid), land };
  });
}
function goalPick(st, pid, as, buff, land) {
  const Z = zoneInfo(st, pid, as, buff, land),
    sel = S.ui.gsel,
    det = GOAL_DETAIL,
    W = 240,
    Hh = 104,
    xs = [W / 6, W / 2, (5 * W) / 6],
    ys = [30, 76],
    stops = (row) =>
      [0, 0.1667, 0.5, 0.8333, 1]
        .map(
          (o, i) => `<stop offset="${o}" stop-color="${chanceCol(Z[row * 3 + [0, 0, 1, 2, 2][i]].mid, SCALE.goal)}"/>`,
        )
        .join('');
  let svg = `<svg class="gpick" viewBox="-6 -6 ${W + 12} ${Hh + 12}" aria-label="Pick where to shoot">
    <defs><linearGradient id="gpT" x1="0" x2="1">${stops(0)}</linearGradient><linearGradient id="gpB" x1="0" x2="1">${stops(1)}</linearGradient>
    <linearGradient id="gpV" x1="0" x2="0" y1="0" y2="1"><stop offset=".3" stop-color="#fff"/><stop offset=".72" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="gpM"><rect width="${W}" height="${Hh}" fill="url(#gpV)"/></mask></defs>
    <rect width="${W}" height="${Hh}" fill="url(#gpB)" opacity=".85"/><rect width="${W}" height="${Hh}" fill="url(#gpT)" opacity=".85" mask="url(#gpM)"/>
    <path class="gp-frame" d="M0,${Hh} V0 H${W} V${Hh}"/>`;
  for (const q of Z) {
    const x = xs[q.z % 3],
      y = ys[q.z < 3 ? 0 : 1],
      on = det && sel === q.z;
    svg += `<g class="gspot${on ? ' on' : ''}" data-a="${det ? 'gsel' : 'zone'}" data-v="${q.z}" role="button" tabindex="0" aria-label="${ZN[q.z]}"><circle cx="${x}" cy="${y}" r="${det ? 17 : 10}"/>${
      det
        ? `<text x="${x}" y="${y + 4}" style="fill:${chanceCol(q.mid, SCALE.goal)}">${lvl(q.mid, SCALE.goal)}</text>`
        : ''
    }</g>`;
  }
  svg += '</svg>';
  let h = `<div class="gp-head"><span class="pop-s">${det ? 'Tap a spot for the details' : 'Tap where to shoot'}</span><button class="gp-i${det ? ' on' : ''}" data-a="gdetail" aria-label="${det ? 'Hide details' : 'Show details'}" aria-pressed="${det}">i</button><button class="pbtn x" data-a="pclose" aria-label="Cancel">✕</button></div>${svg}`;
  if (det && sel != null) {
    const q = Z[sel],
      e = q.e,
      row = (k, v, c) => `<div class="gp-r"><span>${k}</span><b style="color:${c}">${v}</b></div>`,
      pcR = (a, b) => (Math.round(a * 100) === Math.round(b * 100) ? pc(a) : `${pc(a)}–${pc(b)}`);
    h += `<div class="gp-info"><div class="gp-t">${ZN[sel]}${e.zm.near ? ' · near post' : e.zm.far ? ' · far post' : ''}</div>`;
    if (q.land < 1) h += row('Cross lands', `${lvl(q.land, SCALE.aim)} · ${pc(q.land)}`, chanceCol(q.land, SCALE.aim));
    h += row('Aim · on target', `${lvl(e.acc, SCALE.aim)} · ${pc(e.acc)}`, chanceCol(e.acc, SCALE.aim));
    if (e.thr < 0.999)
      h += row('Past the blockers', `${lvl(e.thr, SCALE.aim)} · ${pc(e.thr)}`, chanceCol(e.thr, SCALE.aim));
    h += row(
      'Keeper save',
      `${lvlRange(q.sLo, q.sHi, SCALE.keeper)} · ${pcR(q.sLo, q.sHi)}`,
      chanceCol(q.sHi, SCALE.keeper, true),
    );
    if (e.zm.top) h += row('Crit strike', pc(e.crit), 'var(--accent)');
    h += row(
      'Goal chance',
      `${lvlRange(q.gLo, q.gHi, SCALE.goal)} · ${pcR(q.gLo, q.gHi)}`,
      chanceCol(q.mid, SCALE.goal),
    );
    h += `<div class="gp-n">The keeper's range covers every spot he could reach before you shoot.</div>
      <div class="pop-btns"><button class="pbtn main" data-a="zone" data-v="${sel}">Shoot here</button></div></div>`;
  }
  return h;
}
