$('#gateGo').addEventListener('click', () => {
  $('#gate').hidden = true;
  const c = gateCb;
  gateCb = null;
  c && c();
});
// v2.28: the last plan step is the carrier's dribble to this hex, and he could pass from where he started
function canFlipBack(k) {
  const last = S.plan[S.plan.length - 1];
  if (!last || last.type !== 'move' || !last.ball || key(...last.path[last.path.length - 1]) !== k) return false;
  const keep = S.plan;
  S.plan = S.plan.slice(0, -1);
  const ok = canPassNow();
  S.plan = keep;
  return ok;
}
function onHex(c, r) {
  if (!S) return;
  const k = key(c, r),
    ui = S.ui,
    base = baseSt();
  if (S.phase === 'plan') {
    const att = S.attack,
      pst = project(base, S.plan, S.plan.length),
      id = pickId(occ(pst)[k], att),
      cb = pst.ball,
      me = id && team(id) === att ? id : null;
    // v2.28: tap the hex he just dribbled to again → a pass into that space instead (the space window)
    if (ui.flip === k && ui.sel && same(pst.pos[ui.sel], [c, r]) && canFlipBack(k)) {
      const last = S.plan[S.plan.length - 1];
      S.plan.pop();
      if (S.hist) S.hist = S.hist.filter((x) => x !== last);
      S.ui = freshUI();
      Object.assign(S.ui, { sel: last.pid, info: last.pid, mode: 'pass', tB: [c, r] });
      render();
      return;
    }
    // ... and in the space window, tap that hex again → back to a dribble there
    const dribTo = (hex) => {
      const rr = reach(pst, cb, stepsFor(pst, cb));
      if (!rr.has(key(...hex))) return false;
      addAction({ type: 'move', pid: cb, path: pathFrom(rr, pst.pos[cb], hex) });
      // v2.34: the dribble is done, nothing stays selected (the next tap picks a player to move). Tap him to pass
      // from there; tap his hex again while he's selected to turn the dribble into a pass into that space
      if (S.plan.length && S.plan[S.plan.length - 1].pid === cb) S.ui.flip = key(...hex);
      return true;
    };
    if (ui.mode === 'pass' && ui.tB && cb && ui.sel === cb && same(ui.tB, [c, r]) && PL[cb].pac > 0 && dribTo([c, r]))
      return;
    const free = !ui.pT && !ui.gB && !ui.tB;
    if ((ui.mode === 'move' || (ui.mode === 'pass' && free)) && ui.sel && PL[ui.sel].pac > 0) {
      const rr = reach(pst, ui.sel, stepsFor(pst, ui.sel));
      if (rr.has(k)) {
        if (ui.mode === 'pass') {
          if (dribTo([c, r])) return;
        } else {
          addAction({ type: 'move', pid: ui.sel, path: pathFrom(rr, pst.pos[ui.sel], [c, r]) });
          return;
        }
      }
    }
    const pv = ui.mode === 'pass' && canPassNow() ? 'pass' : null;
    if (ui.mode === 'pass' && ui.gB && cb) {
      const T = gngTargets(pst, cb, ui.gB).find((h) => same(h, [c, r]));
      if (T) {
        const rr = reach(pst, cb, gngRun(pst, cb));
        addAction({ type: 'gng', from: cb, to: ui.gB, ret: [c, r], path: pathFrom(rr, pst.pos[cb], [c, r]) });
        return;
      }
    }
    if (pv === 'pass' && cb && !id && hd(pst.pos[cb], [c, r]) <= RANGE.lob) {
      ui.tB = [c, r];
      ui.pT = null;
      ui.gB = null;
      ui.sp = null;
      ui.xHelp = false;
      ui.spWhy = null;
      render();
      return;
    }
    if (me) {
      if (me === ui.sel) {
        S.ui = freshUI();
        render();
        return;
      }
      if (
        pv === 'pass' &&
        cb &&
        ui.sel === cb &&
        me !== ui.pT &&
        !kickUsed() &&
        hd(pst.pos[cb], pst.pos[me]) <= RANGE.lob
      ) {
        ui.pT = me;
        ui.tB = null;
        ui.gB = null;
        ui.sp = null;
        ui.xHelp = false;
        ui.spWhy = null;
        ui.info = me;
        render();
        return;
      }
      const flip = ui.flip; // v2.34: remember his last dribble, so tapping his hex again can turn it into a pass
      S.ui = freshUI();
      S.ui.sel = me;
      S.ui.info = me;
      S.ui.mode = me === cb && !finished() ? 'pass' : PL[me].pac > 0 ? 'move' : null;
      if (me === cb) S.ui.flip = flip;
      render();
      return;
    }
    if (id) {
      ui.info = id;
      render();
      return;
    }
    S.ui = freshUI();
    render();
    return;
  }
  if (S.phase === 'shape') {
    const T = S.shapeTeam,
      id = pickId(occ(S)[k], T);
    if (ui.sel) {
      const to = shapeHexes(ui.sel).find((h) => same(h, [c, r]));
      if (to) {
        S.shUndo.push([{ pid: ui.sel, from: S.pos[ui.sel].slice() }]);
        S.pos[ui.sel] = to.slice();
        S.shaped.add(ui.sel);
        ui.sel = null;
        renderTokens({ dur: 200 });
        render();
        return;
      }
    }
    ui.sel = id && id !== ui.sel && shapeLeft() > 0 && shapeIdle(T).includes(id) ? id : null;
    render();
    return;
  }
  if (S.phase === 'react') {
    if (S.autoT) {
      clearTimeout(S.autoT); // the defender is acting: hold the pause until Go
      S.autoT = null;
    }
    const def = other(S.attack),
      id = pickId(occ(base)[k], def),
      foe = (occ(base)[k] || []).find((x) => team(x) === S.attack && PL[x].role !== 'GK');
    if (S.frame && S.frame.prep) {
      // prepare: tap a defender (not moved yet), then a neighbouring hex
      const left = PREPARE_PLAYERS - S.prepped.size;
      if (id && team(id) === def && canDefMove(id) && !S.prepped.has(id) && id !== S.out && left > 0) {
        ui.sel = ui.sel === id ? null : id;
        ui.info = id;
      } else if (ui.sel && defReach(base, ui.sel, PREPARE_STEPS).has(k)) {
        defSave();
        prepareMove(ui.sel, [c, r]);
        ui.sel = null;
        // v2.14: onto the loose ball = he has it, the turn ends now (no waiting for Go)
        if (S.loose && same(S.loose, [c, r]) && reactRes) {
          const go = reactRes;
          reactRes = null;
          go();
          return;
        }
      } else if (id) ui.info = id;
      render();
      return;
    }
    // react phase: tap a free defender, then an attacker (mark him) or a hex within his move (spends steps)
    const busy = new Set((S.orders || []).filter((o) => !o.done).map((o) => o.pid));
    if (S.tkPend) busy.add(S.tkPend);
    if (respond() && S.frame && ui.sel && (foe || id === ui.sel)) {
      // v2.43: open the options on the board
      ui.cPop = foe || ui.sel;
      ui.info = ui.cPop;
      render();
      return;
    }
    if (S.frame && ui.sel && foe) {
      defSave();
      ui.flash = setMark(ui.sel, foe);
      if (ui.flash) S.dUndo.pop();
      else ui.sel = null;
      ui.info = foe;
    } else if (S.frame && id && team(id) === def && canDefMove(id) && !busy.has(id) && (S.sent || 0) < WIN_SENDS) {
      ui.sel = ui.sel === id ? null : id;
      ui.cPop = null;
      ui.info = id;
    } else if (S.frame && ui.sel && defReach(base, ui.sel, Math.min(ORDER_MAX, S.budget)).has(k)) {
      defSave();
      if (!addOrder(ui.sel, [c, r], S.frame.k)) S.dUndo.pop();
      S.frame.reach = Math.min(ORDER_MAX, S.budget);
      ui.sel = null;
      ui.cPop = null;
    } else if (S.frame && id && team(id) === def && busy.has(id)) {
      // v2.64: tap a defender you've already sent = take it back and choose again
      defSave();
      if (editOrder(id)) {
        S.frame.reach = Math.min(ORDER_MAX, S.budget);
        ui.sel = id;
        ui.cPop = null;
        ui.info = id;
      } else S.dUndo.pop();
    } else if (id) ui.info = id;
    render();
    return;
  }
  const id = pickId(occ(base)[k]);
  if (id) {
    ui.info = id;
    render();
  }
}
function onGoal(g) {
  if (!S || S.phase !== 'plan' || g !== S.attack) return;
  const { c, dg } = planState();
  if (!c) return;
  if ((kickUsed() && !finisherOpen()) || finished()) {
    S.ui.flash = finished()
      ? 'The plan already ends with a shot.'
      : groundFirst()
        ? 'A ground pass and one more pass or shot: that is the turn. Undo to change it.'
        : 'One pass or shot a turn (two after a ground pass): undo the pass to shoot.';
    render();
    return;
  }
  if (dg > 7) {
    S.ui.flash = 'Too far out to shoot. Get within 7 hexes.';
    render();
    return;
  }
  S.ui = freshUI();
  S.ui.mode = 'shoot';
  S.ui.sel = c;
  render();
}
function onAct(e) {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const a = b.dataset.a,
    v = b.dataset.v,
    ui = S.ui;
  if (a === 'pclose') {
    S.ui = freshUI();
  } else if (a === 'pk') {
    const { c } = planState();
    if (ui.tB) addAction({ type: 'pass', from: c, to: null, target: ui.tB.slice(), kind: v });
    else addAction({ type: 'pass', from: c, to: ui.pT, kind: v, through: !!(ui.thr && runsOf(ui.pT)) });
    return;
  } else if (a === 'sp') {
    // v2.21 tap-a-space window, step 1: Through ball / Pass / Cross. A greyed option explains itself instead.
    if (b.getAttribute('aria-disabled') === 'true') {
      ui.spWhy = v;
      ui.xHelp = v === 'cross';
    } else if (v === 'cross') {
      ui.sp = v;
      ui.thr = false;
      ui.xHelp = false;
      ui.spWhy = null;
    } else {
      // v2.30: Through / Pass go straight into the plan; ground or air comes from the distance
      const { c, pst } = planState(),
        d = hd(pst.pos[c], ui.tB || pst.pos[ui.pT]);
      if (d > RANGE.lob) {
        ui.flash = 'Too far: a pass reaches ' + RANGE.lob + ' hexes.';
        render();
        return;
      }
      const kind = passKind(d);
      if (ui.tB) addAction({ type: 'pass', from: c, to: null, target: ui.tB.slice(), kind });
      else addAction({ type: 'pass', from: c, to: ui.pT, kind, through: v === 'through' });
      return;
    }
  } else if (a === 'spback') {
    ui.sp = null;
    ui.thr = false;
  } else if (a === 'pgng') {
    ui.gB = ui.pT;
    ui.pT = null;
  } else if (a === 'zone') {
    const pst = project(baseSt(), S.plan, S.plan.length);
    if (ui.mode === 'cross') addAction({ type: 'cross', from: pst.ball, to: ui.pT, kind: ui.cross, zone: +v });
    else addAction({ type: 'shot', pid: pst.ball, zone: +v });
    return;
  } else if (a === 'gdetail') {
    GOAL_DETAIL = !GOAL_DETAIL;
    ui.gsel = null;
  } else if (a === 'gsel') {
    ui.gsel = ui.gsel === +v ? null : +v;
  } else if (a === 'pcross') {
    ui.mode = 'cross';
    ui.cross = v;
  } else if (a === 'rm') {
    // remove this step and everything after it (a pass to a run that's gone would make no sense)
    S.plan = S.plan.slice(0, +v);
    S.hist = (S.hist || []).filter((x) => S.plan.includes(x));
    S.gngUsed = S.plan.some((x) => x.type === 'gng');
    S.ui = freshUI();
  } else if (a === 'undo') {
    const h = S.hist || [];
    const last = h.pop() || S.plan[S.plan.length - 1];
    if (last) {
      S.plan = S.plan.filter((x) => x !== last);
    }
    S.ui = freshUI();
  } else if (a === 'lock') {
    S.ui = freshUI();
    setCool();
    goReact();
    return;
  } else if (a === 'tackle') {
    const f = reactRes;
    reactRes = null;
    f && f({ tackle: true, pid: S.tk });
    return;
  } else if (a === 'cfar') {
    S.ui.far = S.ui.cPop; // v2.54: greyed Mark tapped: say why
  } else if (a === 'cardi') {
    CARD_OPEN = !CARD_OPEN;
    try {
      localStorage.setItem('hexCard', CARD_OPEN ? '1' : '0');
    } catch (e) {}
  } else if (a === 'cmove' && S.ui.sel && S.phase === 'react' && S.frame && S.pos[v]) {
    // v2.50: a defender steps onto an attacker's hex (from the pop-up: tapping an attacker opens it)
    defSave();
    if (!addOrder(S.ui.sel, S.pos[v].slice(), S.frame.k)) S.dUndo.pop();
    S.frame.reach = Math.min(ORDER_MAX, S.budget);
    S.ui.sel = null;
    S.ui.cPop = null;
  } else if (a === 'cmark' && S.ui.sel) {
    // v2.43: Mark from the pop-up
    defSave();
    S.ui.flash = setMark(S.ui.sel, v);
    if (S.ui.flash) S.dUndo.pop();
    else S.ui.sel = null;
    S.ui.cPop = null;
  } else if (a === 'antic' && S.ui.sel) {
    // v2.25 respond mode: this defender reads the play (one at a time)
    defSave();
    doRead(S.ui.sel);
    S.ui.sel = null;
    S.ui.cPop = null;
  } else if (a === 'ctackle' && S.ui.sel && challengeOK(S.ui.sel) && S.budget >= 2 && !S.tkPend) {
    // v2.45: the tackle is queued like a move; it goes in when you press Go, so you can still move the others
    defSave();
    S.tkPend = S.ui.sel;
    dropRead(S.ui.sel); // v2.62: he steps in, so he gives up his read
    S.budget -= 2;
    S.sent = (S.sent || 0) + 1;
    gl(`tackle set ${S.ui.sel} on ${S.ball}`, 'def');
    S.ui.sel = null;
    S.ui.cPop = null;
  } else if (a === 'cpress' && S.ui.sel && challengeOK(S.ui.sel) && S.budget >= 1) {
    defSave();
    doPress(S.ui.sel);
    S.ui.sel = null;
    S.ui.cPop = null;
  } else if (a === 'cblock' && S.ui.sel && challengeOK(S.ui.sel) && S.budget >= 1) {
    defSave();
    if (!doBlock(S.ui.sel)) S.dUndo.pop();
    S.ui.sel = null;
  } else if (a === 'shauto' && S.phase === 'shape') {
    const m = shapeAuto(S.shapeTeam);
    if (m.length) S.shUndo.push(m);
    S.ui = freshUI();
    renderTokens({ dur: 250 });
  } else if (a === 'shundo' && S.phase === 'shape') {
    for (const m of (S.shUndo.pop() || []).reverse()) {
      S.pos[m.pid] = m.from;
      S.shaped.delete(m.pid);
    }
    S.ui = freshUI();
    renderTokens({ dur: 200 });
  } else if (a === 'shdone' && S.phase === 'shape') {
    const f = shapeRes;
    shapeRes = null;
    S.ui = freshUI();
    f && f();
    return;
  } else if (a === 'dundo') {
    defUndo();
    S.ui = freshUI();
  } else if (a === 'rskip') {
    S.skipPh = true;
    const f = reactRes;
    reactRes = null;
    f && f(null);
    return;
  } else if (a === 'rgo') {
    const f = reactRes;
    reactRes = null;
    f && f(null); // orders were already queued by tapping
    return;
  } else if (a === 'again') {
    showStart();
    return;
  }
  render();
}
['#panel', '#pop', '#bar', '#pcard'].forEach((q) => $(q).addEventListener('click', onAct));
// v2.26 danger zone: shade every hex a defender can reach before the next window (remembered on this device)
$('#dangerBtn').addEventListener('click', () => {
  DANGER = !DANGER;
  try {
    localStorage.setItem('hexDanger', DANGER ? '1' : '0');
  } catch (e) {}
  render();
});
// goal spots are SVG groups: Enter/Space acts like a tap
$('#pop').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.gspot')) {
    e.preventDefault();
    onAct(e);
  }
});
// Start screen (v2.0): vs CPU / vs Friend (hotseat) toggle, team size and who starts as dropdowns, then Kick off.
// The board behind the screen previews the chosen size.
// Squad picks per match lineup (v2.13), kept while the page is open.
const SQUAD = {};
function pickSize() {
  const v = $('#stSize').value;
  PITCH = $('#stPitch').value;
  SHAPE = $('#stShape').value !== 'off';
  DEF_MODE = 'respond'; // v2.39: Respond is the only defence on the start screen (old saves can still load Prepare)
  if (v.startsWith('m:')) setLineup(v.slice(2), SQUAD[v.slice(2)]);
  else {
    setLineup('classic');
    SIZE = +v;
  }
}
function previewSize() {
  pickSize();
  S = makeState('cpu');
  kickoff('H');
  render();
}
function showStart() {
  // a preset may have switched to 7v7: put the board back to the size on the screen
  const v = $('#stSize').value;
  if (
    PITCH !== $('#stPitch').value ||
    (v.startsWith('m:') ? LINEUP !== v.slice(2) : LINEUP !== 'classic' || SIZE !== +v)
  )
    previewSize();
  showContinue();
  $('#start').hidden = false;
}
// v2.66: Continue the saved match (if there is one)
function showContinue() {
  const v = readSave(),
    b = $('#stCont');
  b.hidden = !v;
  if (v) b.innerHTML = `Continue <span>HAR ${v.score.H}–${v.score.A} NOR · turn ${v.turn}</span>`;
}
function startGame(mode, fromSquad = false) {
  const v = $('#stSize').value;
  // a match lineup: pick the 7 from each team sheet first
  if (v.startsWith('m:') && !fromSquad) return showSquad(v.slice(2));
  pickSize();
  const f = $('#stFirst').value,
    first = f === 'R' ? (Math.random() < 0.5 ? 'H' : 'A') : f;
  $('#start').hidden = true;
  $('#squad').hidden = true;
  newGame(mode, first);
}
// Squad screen (v2.13): each team sheet as a 3-wide grid; tap to pick 7 (exactly one keeper).
function squadOK(k, t) {
  const ids = SQUAD[k][t];
  return ids.length === 7 && ids.filter((id) => MATCHES[k].squad.find((p) => p.id === id).role === 'GK').length === 1;
}
function showSquad(k) {
  const m = MATCHES[k];
  if (!SQUAD[k]) SQUAD[k] = { H: m.pick.H.slice(), A: m.pick.A.slice() };
  $('#squad').dataset.k = k;
  renderSquad();
  $('#start').hidden = true;
  $('#squad').hidden = false;
}
function renderSquad(msg = '') {
  const k = $('#squad').dataset.k,
    m = MATCHES[k],
    you = $('[data-vs][aria-pressed="true"]').dataset.vs === 'cpu';
  let h = `<h2 class="sq-title">${m.label}</h2><p class="sq-sub">Pick 7 from each team sheet, one of them a keeper. They line up by position.</p>`;
  for (const t of ['H', 'A']) {
    const ids = SQUAD[k][t];
    h += `<section class="sq-team ${t}"><div class="sq-h"><h3>${m.teams[t].name}${you ? (t === 'H' ? ' · you' : ' · CPU') : ''}</h3><span class="sq-n${squadOK(k, t) ? ' ok' : ''}">${ids.length}/7</span></div><div class="sq-grid">`;
    for (const p of m.squad.filter((p) => p.team === t)) {
      const on = ids.includes(p.id);
      h += `<button class="sq-p" data-sq="${p.id}" aria-pressed="${on}"><span class="sq-num ${t} r-${p.rar}">${p.num}</span><b>${p.name}</b><small>${p.role}</small></button>`;
    }
    h += `</div></section>`;
  }
  const ok = squadOK(k, 'H') && squadOK(k, 'A');
  h += `<p class="sq-msg" role="status">${msg}</p><div class="sq-bar"><button class="btn" data-sqa="back">Back</button><button class="btn main" data-sqa="go"${ok ? '' : ' disabled'}>Kick off</button></div>`;
  $('#squad .ocard').innerHTML = h;
}
$('#squad').addEventListener('click', (e) => {
  const k = $('#squad').dataset.k,
    b = e.target.closest('[data-sq],[data-sqa]');
  if (!b) return;
  if (b.dataset.sqa === 'back') {
    $('#squad').hidden = true;
    showStart();
    return;
  }
  if (b.dataset.sqa === 'go') return startGame($('[data-vs][aria-pressed="true"]').dataset.vs, true);
  const id = b.dataset.sq,
    p = MATCHES[k].squad.find((x) => x.id === id),
    ids = SQUAD[k][p.team];
  let msg = '';
  if (ids.includes(id)) ids.splice(ids.indexOf(id), 1);
  else if (p.role === 'GK') {
    // one keeper: picking another swaps them
    const gk = ids.find((x) => MATCHES[k].squad.find((q) => q.id === x).role === 'GK');
    if (gk) ids.splice(ids.indexOf(gk), 1);
    ids.push(id);
  } else if (ids.length >= 7) msg = `${MATCHES[k].teams[p.team].name} have 7. Take someone out first.`;
  else ids.push(id);
  renderSquad(msg);
});
$('#stSize').addEventListener('change', previewSize);
$('#stPitch').addEventListener('change', previewSize);
// header logo and More → Main menu; More → Retry / Win all duels (v2.1)
const toMenu = () => {
  if (!['plan', 'react', 'over', 'gate', 'scnend', 'idle'].includes(S.phase)) {
    banner('Wait for the play to stop');
    return;
  }
  reactRes = null;
  gateCb = null;
  ['#gate', '#scnend'].forEach((q) => ($(q).hidden = true));
  showStart();
};
$('#toMenu').addEventListener('click', toMenu);
$('#toMenu2').addEventListener('click', toMenu);
$('#rewind').addEventListener('click', () => rewind());
$('#back1').addEventListener('click', () => rewind(true));
$('#sameDice').addEventListener('change', (e) => {
  SAME_DICE = e.target.checked;
  renderMore();
});
$('#more').addEventListener('toggle', () => $('#more').open && renderFeed());
$('#winAll').addEventListener('change', (e) => {
  WIN_ALL = e.target.checked;
  renderHeader();
});
document
  .querySelectorAll('[data-vs]')
  .forEach((b) =>
    b.addEventListener('click', () =>
      document.querySelectorAll('[data-vs]').forEach((x) => x.setAttribute('aria-pressed', x === b)),
    ),
  );
$('#stGo').addEventListener('click', () => startGame($('[data-vs][aria-pressed="true"]').dataset.vs));
$('#stCont').addEventListener('click', () => continueSaved());
addEventListener('resize', () => {
  if (S) renderPop();
});
