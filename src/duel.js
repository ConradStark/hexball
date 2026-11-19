function duelPhrase(o, win) {
  const A = PL[o.att].name,
    D = PL[o.def].name,
    R = o.receiver ? PL[o.receiver].name : A;
  switch (o.type) {
    case 'pass':
      if (o.tier === 'press') return win ? `${D} blocks it at source` : `${A} gets it away from ${D}`;
      return o.target
        ? win
          ? `${D} steps in front of ${R}`
          : `${R} holds off ${D}`
        : win
          ? `${D} reads it and cuts it out`
          : `${A} threads it past ${D}`;
    case 'lob':
      if (o.tier === 'press') return win ? `${D} charges it down` : `${A} chips it over ${D}`;
      return win ? `${D} wins the header` : `${R} rises above ${D}`;
    case 'dribble':
      return win ? `${D} nicks it off ${A}'s toe` : `${A} skips past ${D}`;
    case 'tackle':
      return win ? `${D} wins it clean` : `${A} rides the challenge`;
    case 'shot':
      return win ? `${D} throws himself in the way` : `${A} finds a gap past ${D}`;
  }
  return win ? `${D} wins it` : `${A} keeps it`;
}
function duelSide(o) {
  if (S.mode === 'sim') return null;
  if (S.mode === 'cpu') {
    if (team(o.def) === 'H') return 'def';
    if (team(o.att) === 'H') return 'att';
    return null;
  }
  return 'def';
}
function duelCard(id, stat, side) {
  const p = PL[id],
    [rl, rv] = RAR[p.rar],
    sv = stat === 'def' ? p.def : p[stat];
  return `<div class="dc ${side}"><div class="dc-num" style="border-color:var(${rv});background:${p.team === 'H' ? 'var(--home)' : 'var(--away)'};color:${p.team === 'H' ? 'var(--homeInk)' : 'var(--awayInk)'}">${p.num}</div>
    <div class="dc-name">${p.name}</div><div class="dc-rar" style="color:var(${rv})">${rl}</div><div class="dc-stat"><span>${stat.toUpperCase()}</span><b>${sv}</b></div></div>`;
}
// v2.25 respond mode: the tackle is a real timing game for the defender. A marker sweeps the bar at an even speed;
// the green zone's width is his win chance, centred. Tap inside it = he wins it, outside (or too slow) = he's beaten.
// A random tap lands in the zone about as often as the odds say; a good tap beats them.
function tackleGame(el, p) {
  return new Promise((res) => {
    const zone = el.querySelector('.tk-z'),
      mk = el.querySelector('.tg-m'),
      msg = el.querySelector('.tg-msg'),
      lo = 0.5 - p / 2,
      hi = 0.5 + p / 2;
    zone.style.left = lo * 100 + '%';
    zone.style.width = p * 100 + '%';
    let t0 = performance.now(),
      done = false,
      raf;
    // even speed back and forth (a triangle wave), so every spot on the bar gets the same time
    const pos = () => {
      const u = (((performance.now() - t0) / 1000) * 1.1) % 2;
      return u < 1 ? u : 2 - u;
    };
    const loop = () => {
      mk.style.left = pos() * 100 + '%';
      if (performance.now() - t0 > 3600) return fin(true);
      raf = requestAnimationFrame(loop);
    };
    const fin = (timeout) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', tap);
      const x = pos(),
        win = !timeout && x >= lo && x <= hi;
      msg.textContent = timeout ? 'Too slow' : win ? 'Got it!' : 'Mistimed';
      msg.className = 'tg-msg ' + (win ? 'g' : 'b');
      wait(() => res({ win, x }), reduce ? 150 : 600);
    };
    const tap = (e) => {
      e.preventDefault();
      fin(false);
    };
    el.addEventListener('pointerdown', tap);
    raf = requestAnimationFrame(loop);
  });
}
function timingGame(el, side) {
  return new Promise((res) => {
    const box = el.querySelector('.tg'),
      mk = el.querySelector('.tg-m'),
      msg = el.querySelector('.tg-msg');
    let t0 = performance.now(),
      done = false,
      raf;
    const pos = () => {
      const t = (performance.now() - t0) / 1000;
      return 0.5 - 0.5 * Math.cos(t * Math.PI * 1.25);
    };
    const loop = () => {
      mk.style.left = pos() * 100 + '%';
      if (performance.now() - t0 > 3200) {
        fin(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const fin = (timeout) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', tap);
      const d = Math.abs(pos() - 0.5),
        n = timeout ? 0 : d < 0.05 ? 0.05 : d < 0.12 ? 0.03 : d < 0.22 ? 0.01 : 0;
      msg.textContent = timeout
        ? 'Too slow · +0%'
        : n >= 0.05
          ? 'Perfect! +5%'
          : n >= 0.03
            ? 'Good +3%'
            : n > 0
              ? 'OK +1%'
              : 'Missed · +0%';
      msg.className = 'tg-msg ' + (n >= 0.03 ? 'g' : n > 0 ? 'm' : 'b');
      wait(() => res(n), reduce ? 150 : 550);
    };
    const tap = (e) => {
      e.preventDefault();
      fin(false);
    };
    el.addEventListener('pointerdown', tap);
    raf = requestAnimationFrame(loop);
  });
}
// Show the meeting on the board first (everyone in place, a flash ring on the defender), then the duel.
async function contact(o) {
  if (S.mode === 'sim' || !S.pos[o.def]) return;
  // a shot's ball is already on its way (takeShot); a ground pass has already drawn the ball and the defender leaning in
  const placed = o.type === 'shot' || (o.type === 'pass' && o.tier === 'star' && S.fl && S.fl.kind === 'ground');
  if (!placed) renderTokens({ dur: 260 });
  const [x, y] = placed && TW[o.def] ? TW[o.def].cur : px(...S.pos[o.def]);
  $('#ovTop').insertAdjacentHTML('beforeend', `<circle class="clash" cx="${x}" cy="${y}" r="16"/>`);
  await sleep(reduce ? 150 : 600);
}
// Practice: who wins every contest when WIN_ALL is on (vs CPU: Harbour, the human; hotseat: the attack).
function practiceWin(o) {
  const me = S.mode === 'cpu' ? 'H' : S.attack;
  return team(o.def) === me; // true = the defender wins
}
async function duel(o) {
  // v2.25 Anticipate: his read pays off here (the bonus is already in o.p) and is used up, win or lose
  const rd = respond() && o.def === readPid(team(o.def));
  if (rd) {
    S.read = null;
    o.read = true;
    if (S.mode !== 'sim' && S.pos[o.def]) popWord(px(...S.pos[o.def]), 'Read it!', 'def');
    gl(`read ${o.def} pays off: +${pc(READ_BONUS)}`, 'def');
  }
  await contact(o);
  if (WIN_ALL && S.mode !== 'sim') {
    const win = practiceWin(o);
    popWord(px(...S.pos[o.def]), win ? 'Won it' : 'Gets by', win ? 'def' : 'att');
    gl(
      `contest ${o.type}${o.tier ? '/' + o.tier : ''} ${o.def} v ${o.att} p ${pc(o.p)} > ${win ? 'DEF' : 'ATT'} (win all duels)`,
      win ? 'bad' : '',
    );
    log(`${duelPhrase(o, win)} (practice)`, win ? 'crit' : 'att');
    await sleep(reduce ? 120 : 550);
    return win;
  }
  if (o.p < DUEL_LO || o.p > DUEL_HI) {
    // v2.51: only a really close contest gets the mini-game; the rest resolve on the spot with a word pop-up
    // (was: only under 15%). Same odds, no timing tap.
    const roll = rnd(),
      win = roll < o.p,
      hi = o.p > DUEL_HI,
      at = px(...S.pos[o.def]);
    popWord(
      at,
      hi ? (win ? 'Won it!' : 'Slips away!') : win ? 'Nicked it!' : roll < o.p + 0.1 ? 'Near miss' : 'Gets by',
      win ? 'def' : 'att',
    );
    gl(
      `contest ${o.type}${o.tier ? '/' + o.tier : ''} ${o.def} v ${o.att} p ${pc(o.p)} roll ${roll.toFixed(2)} > ${win ? 'DEF' : 'ATT'}`,
      win ? 'bad' : '',
    );
    log(`${duelPhrase(o, win)} (${pc(o.p)})`, win ? 'crit' : 'att');
    await sleep(reduce ? 120 : 550);
    return win;
  }
  const el = $('#duel'),
    stat = DUEL_STAT[o.type],
    side = duelSide(o),
    tkGame = false; // v2.35: the green-zone tackle game is off (user: too different, too easy); tackles use the normal duel
  const verb = {
    pass: o.tier === 'press' ? 'Pressing the pass' : o.target ? 'Marking the receiver' : 'In the passing lane',
    lob: o.tier === 'press' ? 'Pressing the passer' : 'Aerial duel',
    dribble: '1 v 1',
    tackle: 'Tackle',
    shot: (o.tier === 'lane' ? 'Blocking the shot' : 'Closing the shooter') + (o.more ? ` · +${o.more} more` : ''),
  }[o.type];
  el.innerHTML = `<div class="d-head">${verb}</div><div class="d-cards">${duelCard(o.att, stat, 'att')}<div class="d-vs">vs</div>${duelCard(o.def, 'def', 'def')}</div>
    <div class="d-odds"><span>${PL[o.att].name} <b>${pc(1 - o.p)}</b></span><span><b>${pc(o.p)}</b> ${PL[o.def].name}</span></div>
    ${
      tkGame
        ? `<div class="tg-wrap"><div class="tg-h">Tap when the marker is in the green · tap anywhere</div><div class="tg tk"><i class="tk-z"></i><span class="tg-m"></span></div><div class="tg-msg"></div></div>`
        : side
          ? `<div class="tg-wrap"><div class="tg-h">${side === 'def' ? `Time ${PL[o.def].name}'s challenge` : `Time ${PL[o.att].name}'s touch`} · tap anywhere</div><div class="tg"><i class="tg-z2"></i><i class="tg-z1"></i><i class="tg-z0"></i><span class="tg-m"></span></div><div class="tg-msg"></div></div>`
          : ''
    }
    <div class="d-bar"><i class="d-def"></i><i class="d-att"></i><span class="d-mk"></span></div><div class="d-res"></div>`;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('show');
  const setBar = (p) => {
    el.querySelector('.d-def').style.width = p * 100 + '%';
    el.querySelector('.d-att').style.width = (1 - p) * 100 + '%';
    el.querySelector('.d-odds').innerHTML =
      `<span>${PL[o.att].name} <b>${pc(1 - p)}</b></span><span><b>${pc(p)}</b> ${PL[o.def].name}</span>`;
  };
  let p = o.p;
  setBar(p);
  if (tkGame) {
    // the timing game decides it (no dice)
    const r = await tackleGame(el, p),
      win = r.win;
    gl(`DUEL tackle ${o.def} v ${o.att} p ${pc(p)} · timing ${r.x.toFixed(2)} > ${win ? 'DEF' : 'ATT'}`, win ? 'bad' : '');
    const res = el.querySelector('.d-res');
    res.className = 'd-res ' + (win ? 'def' : 'att');
    res.innerHTML = `<b>${duelPhrase(o, win)}</b>`;
    log(`Duel: ${duelPhrase(o, win)} (timed, ${pc(p)} zone)`, win ? 'crit' : 'att');
    await sleep(reduce ? 300 : 1100);
    el.classList.remove('show');
    await sleep(reduce ? 0 : 180);
    el.hidden = true;
    return win;
  }
  if (side) {
    const n = await timingGame(el, side);
    if (n) {
      p = clamp(p + (side === 'def' ? n : -n), 0.02, 0.95);
      setBar(p);
    }
  }
  await sleep(reduce ? 50 : 250);
  const roll = rnd(),
    win = roll < p,
    mk = el.querySelector('.d-mk');
  mk.style.transition = reduce ? 'none' : 'left 1s cubic-bezier(.15,.6,.25,1)';
  mk.style.left = (1 - roll) * 100 + '%';
  await sleep(reduce ? 80 : 1050);
  gl(
    `DUEL ${o.type}${o.tier ? '/' + o.tier : ''} ${o.def} v ${o.att} p ${pc(o.p)}${p !== o.p ? `>${pc(p)} (timing)` : ''} roll ${roll.toFixed(2)} > ${win ? 'DEF' : 'ATT'}`,
    win ? 'bad' : '',
  );
  const margin = Math.abs(roll - p),
    close = margin < 0.05 ? (margin < 0.02 ? 'Inches!' : 'So close!') : margin < 0.15 ? '' : 'Comfortable.';
  const res = el.querySelector('.d-res');
  res.className = 'd-res ' + (win ? 'def' : 'att');
  res.innerHTML = `<b>${duelPhrase(o, win)}</b>${close ? ` <span>${close}</span>` : ''}`;
  log(
    `Duel: ${duelPhrase(o, win)} (${pc(p)} for the defender${close ? ', ' + close.toLowerCase().replace('.', '') : ''})`,
    win ? 'crit' : 'att',
  );
  await new Promise((r) => {
    const t = wait(r, reduce ? 900 : 1700);
    el.addEventListener(
      'pointerdown',
      () => {
        clearTimeout(t);
        r();
      },
      { once: true },
    );
  });
  el.classList.remove('show');
  await sleep(reduce ? 0 : 180);
  el.hidden = true;
  return win;
}
