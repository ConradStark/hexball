// Shot aim on the board: zone column (left/centre/right as the shooter sees it) sets where across the goal mouth
// the arrow lands; top zones curve up and land deep in the net, bottom zones go flat to the goal line.
function shotAim(att, zone) {
  const col = (zone % 3) - 1,
    half = (R * SQ3 * GOALW) / 2,
    top = zone < 3,
    G = goalPx(att),
    dir = att === 'H' ? 1 : -1;
  const x = G[0] + col * dir * half * 0.72,
    y = att === 'H' ? PADY - (top ? 13 : 3) : H - PADY + (top ? 13 : 3);
  return [x, y];
}
function shotLine(A, T, zone) {
  const top = zone < 3,
    tgt = `<circle class="aim" cx="${T[0]}" cy="${T[1]}" r="${top ? 4.5 : 3.5}"/>`;
  if (!top) return `<line class="sh" x1="${A[0]}" y1="${A[1]}" x2="${T[0]}" y2="${T[1]}" marker-end="url(#aY)"/>` + tgt;
  // top corner: a lifted arc that bends out wide and curls back in to the corner
  const C = curlCtrl(A, T);
  return `<path class="sh lift" d="M${A[0]},${A[1]} Q${C[0]},${C[1]} ${T[0]},${T[1]}" marker-end="url(#aY)"/>` + tgt;
}
// Control point for a curling shot: pushed off the straight line towards the outside of the goal (the side of the
// corner it's aimed at), so the ball starts wide and bends back in. Aimed at the centre: a slight curl from the
// shooter's side.
// half the goal mouth in px (a shooter beyond it is past a post)
const postHalf = () => R * SQ3 * ((GOALW - 1) / 2) + R * 0.5;
function curlCtrl(A, T) {
  const Gx = px(MIDC, 0)[0],
    mx = (A[0] + T[0]) / 2,
    my = (A[1] + T[1]) / 2,
    L = Math.hypot(T[0] - A[0], T[1] - A[1]) || 1,
    n = [-(T[1] - A[1]) / L, (T[0] - A[0]) / L]; // unit normal to the shot line
  // v2.14: from out wide the ball bends towards the middle first and curls back out to the corner (shooter past the
  // right post: left, then right). From a central spot it bends out towards the corner's side, as before.
  const wide = Math.abs(A[0] - Gx) > postHalf(),
    toT = Math.sign(T[0] - Gx);
  let out = wide ? Math.sign(Gx - A[0]) : toT;
  if (!wide && Math.abs(T[0] - Gx) < 4) out = Math.sign(A[0] - Gx) || 1;
  const s = Math.sign(n[0]) === out ? 1 : -1,
    k = Math.abs(T[0] - Gx) < 4 ? 0.1 : 0.22;
  return [mx + n[0] * s * k * L, my + n[1] * s * k * L];
}
function initBoard() {
  const svg = $('#board');
  svg.setAttribute('viewBox', `0 0 ${W.toFixed(1)} ${H.toFixed(1)}`);
  const top = PADY,
    bot = H - PADY,
    hw = (R * SQ3) / 2;
  let hx = '';
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const [x, y] = px(c, r);
      hx += `<polygon class="hx${(r >> 1) % 2 ? ' s' : ''}" data-k="${c},${r}" points="${hexPts(x, y, 0.98)}"/>`;
    }
  const bx1 = px(MIDC - BOXW, 0)[0] - hw,
    bx2 = px(MIDC + BOXW, 0)[0] + hw,
    gx1 = goalPx('H')[0] - (R * SQ3 * GOALW) / 2,
    gx2 = goalPx('H')[0] + (R * SQ3 * GOALW) / 2,
    [cx, cy] = px(KOC, MIDR);
  let l = `<rect class="ln" x="${PADX}" y="${top}" width="${W - 2 * PADX}" height="${bot - top}"/>`;
  l += `<line class="ln" x1="${PADX}" y1="${cy}" x2="${W - PADX}" y2="${cy}"/><circle class="ln" cx="${cx}" cy="${cy}" r="${R * 2.3}"/>`;
  l += `<rect class="ln" x="${bx1}" y="${top}" width="${bx2 - bx1}" height="${px(0, 2)[1] + R * 0.9 - top}"/>`;
  l += `<rect class="ln" x="${bx1}" y="${px(0, ROWS - 3)[1] - R * 0.9}" width="${bx2 - bx1}" height="${bot - (px(0, ROWS - 3)[1] - R * 0.9)}"/>`;
  l += `<circle class="spot" cx="${cx}" cy="${cy}" r="2.6"/>`;
  l += `<rect class="net" x="${gx1}" y="${top - 17}" width="${gx2 - gx1}" height="17" fill="rgba(255,255,255,.22)"/>`;
  l += `<rect class="net" x="${gx1}" y="${bot}" width="${gx2 - gx1}" height="17" fill="rgba(255,255,255,.22)"/>`;
  l += `<rect class="goalhit" data-goal="H" x="${gx1 - 8}" y="0" width="${gx2 - gx1 + 16}" height="${top + 4}"/><rect class="goalhit" data-goal="A" x="${gx1 - 8}" y="${bot - 4}" width="${gx2 - gx1 + 16}" height="${H - bot + 4}"/>`;
  $('#pitch').innerHTML = `<rect x="0" y="0" width="${W}" height="${H}" fill="var(--pitch0)"/>`;
  $('#hexes').innerHTML = hx + l;
  let t = '';
  for (const pl of ROSTER) {
    // v2.43.1: big circles; the role colour is a full ring round the player (user: "full loop"). Keepers plain.
    const r0 = 14;
    t += `<g class="tok ${pl.team}${pl.role === 'GK' ? ' gk' : ''}" id="t-${pl.id}"><polygon class="readmk" points="${hexPts(0, 0, 0.97)}"/><g class="lab"><circle class="body" r="${r0}"/>${pl.role === 'GK' ? '' : `<circle class="rolef ro-${pl.role}" r="${r0 - 1.6}"/>`}<text y="4.6" text-anchor="middle">${pl.num}</text></g><g class="sprint"><circle cx="11" cy="-12" r="7"/><path d="M7.5,-10.5 l3.5,-3.5 l3.5,3.5 M7.5,-7 l3.5,-3.5 l3.5,3.5"/></g></g>`;
  }
  t += `<circle id="ballRing" class="ballring" r="15" style="display:none"/><ellipse id="lobSh" class="lobsh" rx="6" ry="3" style="display:none"/><g id="ball"><circle r="5.2" class="ballc"/></g>`;
  $('#toks').innerHTML = t;
  if (svg.dataset.wired) return; // initBoard runs again when the board size or lineup changes
  svg.dataset.wired = '1';
  wireDrag(svg);
  svg.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goal]');
    if (g) {
      onGoal(g.dataset.goal);
      return;
    }
    const h = e.target.closest('[data-k]');
    if (!h) return;
    // v2.53: the tap on your own player was already handled by the drag code
    if (Date.now() < dragSwallow && h.dataset.k === dragSwallowK) return;
    const [c, r] = h.dataset.k.split(',').map(Number);
    onHex(c, r);
  });
}
// v2.53 drag and drop: press on one of your players, drag to a hex, let go = tap him, then tap the hex.
// A plain tap on him is handled here too (touchstart is cancelled on your players so the page doesn't scroll).
let dragSwallow = 0,
  dragSwallowK = null,
  drag = null;
function dragTeam() {
  if (!S) return null;
  if (S.phase === 'plan') return S.attack;
  if (S.phase === 'react' && S.frame) return other(S.attack);
  if (S.phase === 'shape') return S.shapeTeam;
  return null;
}
function dragWho(k) {
  const T = dragTeam();
  if (!T || !k) return null;
  const st = S.phase === 'plan' ? project(baseSt(), S.plan, S.plan.length) : S;
  return (occ(st)[k] || []).find((x) => team(x) === T) || null;
}
function hexUnder(x, y) {
  const el = document.elementFromPoint(x, y),
    h = el && el.closest && el.closest('[data-k]');
  return h ? h.dataset.k : null;
}
const tapK = (k) => onHex(...k.split(',').map(Number));
function wireDrag(svg) {
  svg.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      if (e.touches.length === 1 && dragWho(hexUnder(t.clientX, t.clientY))) e.preventDefault();
    },
    { passive: false },
  );
  svg.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-k]'),
      who = h && dragWho(h.dataset.k);
    drag = who ? { k: h.dataset.k, who, x: e.clientX, y: e.clientY, on: false } : null;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
      drag.on = true;
      if (S.ui.sel !== drag.who) tapK(drag.k); // select him first: his hexes light up
      if (S.ui.sel !== drag.who) return (drag = null);
      $('#t-' + drag.who).classList.add('dragging');
    }
    const m = svg.getScreenCTM().inverse(),
      x = m.a * e.clientX + m.c * e.clientY + m.e,
      y = m.b * e.clientX + m.d * e.clientY + m.f,
      el = $('#t-' + drag.who);
    if (TW[drag.who]) TW[drag.who].cur = [x, y];
    setXY(el, [x, y]);
  });
  window.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d) return;
    dragSwallow = Date.now() + 600;
    dragSwallowK = d.k;
    if (!d.on) return tapK(d.k); // a plain tap on your player
    $('#t-' + d.who).classList.remove('dragging');
    const k2 = hexUnder(e.clientX, e.clientY);
    if (k2 && k2 !== d.k) tapK(k2);
    renderTokens({ dur: 160 });
  });
  window.addEventListener('pointercancel', () => {
    if (drag && drag.on) {
      $('#t-' + drag.who).classList.remove('dragging');
      renderTokens({ dur: 160 });
    }
    drag = null;
  });
}
const HEX_RINGS = new Set(['tkring', 'mkring', 'threatring', 'pressring']);
function placeBall(xy) {
  tweenBall(xy);
}
let GHOST_HEX = new Set(); // v2.63: hexes a ghost shares with a real player (set by renderOverlay)
const ghostShare = (id) =>
  (S.phase === 'plan' || S.phase === 'react') && GHOST_HEX.has(key(...S.pos[id]));
function tokPx(id, o) {
  const [x, y] = px(...S.pos[id]);
  const ids = o[key(...S.pos[id])] || [];
  if (ids.length < 2) return ghostShare(id) ? [x - 5, y + 5] : [x, y];
  // sharing a hex: the defender is between the attacker and the goal (goal side). Exception: a player who has just
  // won the ball (interception/tackle) is drawn ahead, towards the goal he now attacks, until he moves off the hex.
  const W = S.wonAt,
    ahead = W && ids.includes(W.pid) && same(S.pos[W.pid], W.h) ? W.pid : null;
  if (ahead) {
    const upW = team(ahead) === 'H' ? -1 : 1; // towards the goal the ball winner attacks
    return id === ahead ? [x + 5, y + 7 * upW] : [x - 5, y - 7 * upW];
  }
  const up = S.attack === 'H' ? -1 : 1;
  // one attacker + one defender: the defender goal side (as before)
  if (ids.length === 2 && team(ids[0]) !== team(ids[1]))
    return team(id) !== S.attack ? [x + 5, y + 7 * up] : [x - 5, y - 7 * up];
  // v2.38: teammates passing through the same hex mid-run (or 3+ on a hex) are spread so every token shows:
  // two side by side, more in a small ring (defenders first, on the goal side)
  const order = ids.slice().sort((a, b) => (team(a) === S.attack) - (team(b) === S.attack) || (a < b ? -1 : 1)),
    i = order.indexOf(id),
    n = order.length;
  if (n === 2) return [x + (i === 0 ? -11 : 11), y + (i === 0 ? 3 * up : -3 * up)];
  const a = Math.PI / 2 * up + (i * 2 * Math.PI) / n;
  return [x + 13 * Math.cos(a), y + 13 * Math.sin(a)];
}
// The ball sits at the carrier's feet on the side he's heading: along his dribble, else towards the goal he attacks.
function ballDir(id) {
  const m = (S.movers || []).find((x) => x.pid === id && !x.done && x.path[x.idx + 1]);
  let v = team(id) === 'H' ? [0.35, -1] : [-0.35, 1];
  if (m) {
    const A = px(...S.pos[id]),
      B = px(...m.path[m.idx + 1]);
    v = [B[0] - A[0], B[1] - A[1]];
  }
  const L = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / L, v[1] / L];
}
// Move every token and the ball to where the state says they are. opts.dur: tween length (ms at SPEED 1);
// opts.lin: constant speed (playback frames, so motion flows from one frame into the next).
function renderTokens(opts = {}, ghosts = new Set()) {
  if (typeof opts !== 'object' || opts === null) opts = {};
  const dur = opts.dur ?? 320,
    lin = !!opts.lin,
    o = occ(S),
    tgt = {};
  for (const p of ROSTER) {
    const el = $('#t-' + p.id);
    el.style.display = S.pos[p.id] ? '' : 'none';
    if (!S.pos[p.id]) continue;
    tgt[p.id] = tokPx(p.id, o);
    el.classList.toggle('shared', (o[key(...S.pos[p.id])] || []).length > 1 || ghostShare(p.id)); // v2.38 / v2.63
    tweenEl(p.id, el, tgt[p.id], dur, lin);
    el.classList.toggle('ghosted', ghosts.has(p.id));
    el.classList.toggle('tired', tired(p.id));
    el.classList.toggle('sprinting', !!(S.sprinting && S.sprinting.has(p.id))); // v2.37 sprint mark
    el.classList.toggle('out', p.id === S.out || p.id === S.beaten);
    // v2.54: Anticipate shown on the token itself; Reshape dims everyone who can't step
    el.classList.toggle('reading', S.attack && respond() && readPid(other(S.attack)) === p.id);
    el.classList.toggle(
      'dim',
      S.phase === 'shape' && !(S.shaped && S.shaped.has(p.id)) && !(shapeLeft() > 0 && shapeIdle(S.shapeTeam).includes(p.id)),
    );
  }
  const bl = $('#ball');
  if (S.flight && S.flight.lob) {
    const L = S.flight.lob,
      p = lobAt(L, L.t1);
    // already flying (or flown) this frame's arc: a redraw (e.g. a defender moved in a React window) leaves it be
    if (TW.ball && TW.ball.lob === L) return;
    tweenEl('ball', bl, [p.g[0], p.g[1] - p.h], dur, true, L);
    return;
  }
  $('#lobSh').style.display = 'none';
  $('#ball .ballc').style.transform = '';
  if (S.flight) tweenEl('ball', bl, S.flight.xy, dur, lin);
  else if (S.ball && tgt[S.ball]) {
    const [dx, dy] = ballDir(S.ball);
    tweenEl('ball', bl, [tgt[S.ball][0] + dx * 13, tgt[S.ball][1] + dy * 13], dur, lin);
  } else if (S.loose) tweenEl('ball', bl, px(...S.loose), dur, lin);
}
function clearOverlay() {
  $('#hl').innerHTML = '';
  $('#ov').innerHTML = '';
  $('#ovTop').innerHTML = '';
}
function renderOverlay() {
  GHOST_HEX = new Set();
  const hl = [],
    ov = [],
    tp = [],
    ghosts = new Set(),
    ph = S.phase,
    ui = S.ui,
    base = baseSt();
  const ring = (h, cls = 'selring') => {
    const [x, y] = px(...h);
    // v2.57: the defending actions (tackle, mark, press, threats) are hex outlines; selection stays a circle
    if (HEX_RINGS.has(cls)) hl.push(`<polygon class="${cls}" points="${hexPts(x, y, 0.94)}"/>`);
    else hl.push(`<circle class="${cls}" cx="${x}" cy="${y}" r="17.5"/>`);
  };
  const fill = (h, cls) => {
    const [x, y] = px(...h);
    hl.push(`<polygon class="${cls}" points="${hexPts(x, y, 0.86)}"/>`);
  };
  const badge = (x, y, txt, cls = '') =>
    txt === ''
      ? ''
      : `<g class="badge ${cls}"><circle cx="${x}" cy="${y}" r="8"/><text x="${x}" y="${y + 3.8}" text-anchor="middle">${txt}</text></g>`;
  // v2.26: the edge of a set of hexes (pass range outlines): each hex side whose neighbour is outside the set
  const edgeOf = (keys, cls) => {
    let d = '';
    for (const k of keys) {
      const [c, r] = k.split(',').map(Number),
        [x, y] = px(c, r);
      for (let e = 0; e < 6; e++) {
        const a = (Math.PI / 3) * e,
          nx = x + R * SQ3 * Math.cos(a),
          ny = y + R * SQ3 * Math.sin(a),
          n = nbrsAll(c, r).find((h) => {
            const [hx, hy] = px(...h);
            return Math.abs(hx - nx) < 2 && Math.abs(hy - ny) < 2;
          });
        if (!n || n[0] < 0 || n[0] >= COLS || n[1] < 0 || n[1] >= ROWS || keys.has(key(...n))) continue; // v2.26: no outline along the pitch's own edge
        const a1 = a - Math.PI / 6,
          a2 = a + Math.PI / 6;
        d += `M${(x + R * Math.cos(a1)).toFixed(1)},${(y + R * Math.sin(a1)).toFixed(1)}L${(x + R * Math.cos(a2)).toFixed(1)},${(y + R * Math.sin(a2)).toFixed(1)}`;
      }
    }
    hl.push(`<path class="${cls}" d="${d}"/>`);
  };
  const bubble = (h, txt, cls, dy = -23) => {
    const [x, y0] = px(...h),
      y = y0 + dy,
      w = Math.max(34, txt.length * 6.6 + 8);
    tp.push(
      `<g class="bub ${cls}"><rect x="${x - w / 2}" y="${y - 8}" width="${w}" height="16" rx="3"/><text x="${x}" y="${y + 4}" text-anchor="middle">${txt}</text></g>`,
    );
  };
  // v2.20 pass line: a clean white arrow with a soft shadow, trimmed so it starts at the passer's edge and its head
  // stops short of the receiver's token. Ground = straight and solid, lob = curved and dashed, dotted = Give & Go return.
  const passArrow = (A, B, style, toPlayer, ch = '') => {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1,
      lob = style === 'lob',
      dx = B[0] - A[0],
      dy = B[1] - A[1],
      C = lob ? [(A[0] + B[0]) / 2 - dy * 0.25, (A[1] + B[1]) / 2 + dx * 0.25] : [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2],
      t0 = Math.min(0.4, 15 / L),
      t1 = Math.max(0.6, 1 - (toPlayer ? 17 : 5) / L),
      q = (t) => [0, 1].map((k) => (1 - t) * (1 - t) * A[k] + 2 * (1 - t) * t * C[k] + t * t * B[k]),
      P0 = q(t0),
      P2 = q(t1),
      // control point of the sub-curve between t0 and t1
      P1 = [0, 1].map((k) => (1 - t0) * (1 - t1) * A[k] + ((1 - t0) * t1 + t0 * (1 - t1)) * C[k] + t0 * t1 * B[k]),
      tl = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) || 1,
      v = [(P2[0] - P1[0]) / tl, (P2[1] - P1[1]) / tl],
      hl = 10,
      hw = 5.5,
      E = [P2[0] - v[0] * (hl - 2), P2[1] - v[1] * (hl - 2)],
      tip = [P2[0] + v[0] * 2, P2[1] + v[1] * 2],
      bb = [tip[0] - v[0] * hl, tip[1] - v[1] * hl],
      f = (n) => n.toFixed(1),
      head = `M${f(tip[0])},${f(tip[1])}L${f(bb[0] - v[1] * hw)},${f(bb[1] + v[0] * hw)}L${f(bb[0] + v[1] * hw)},${f(bb[1] - v[0] * hw)}Z`;
    // the shaft ends inside the head so the dash pattern never pokes past the tip
    const P1b = [P1[0] + (E[0] - P2[0]) * 0.5, P1[1] + (E[1] - P2[1]) * 0.5];
    const d = lob
      ? `M${f(P0[0])},${f(P0[1])} Q${f(P1b[0])},${f(P1b[1])} ${f(E[0])},${f(E[1])}`
      : `M${f(P0[0])},${f(P0[1])} L${f(E[0])},${f(E[1])}`;
    return `<g class="parrow ${style}${ch ? ' ' + ch : ''}"><path class="pa-l" d="${d}"/><path class="pa-h" d="${head}"/></g>`;
  };
  const drawAct = (st, a, i) => {
    const L = typeof i === 'string' ? i : i + 1;
    if (a.type === 'move') {
      const pts = a.path.map((h) => px(...h));
      ov.push(`<polyline class="mv ${team(a.pid)}" points="${pts.map((p) => p.join(',')).join(' ')}"/>`);
      const m = pts[pts.length - 1];
      ov.push(badge(m[0] + 11, m[1] - 11, L));
    } else if (a.type === 'pass') {
      const A = px(...st.pos[a.from]),
        B = px(...(a.to ? a.target || st.pos[a.to] : a.target));
      ov.push(passArrow(A, B, a.kind === 'ground' ? 'ground' : 'lob', !!a.to, chanceCls(passChance(st, a))));
      ov.push(badge((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, L));
    } else if (a.type === 'gng') {
      const A = px(...st.pos[a.from]),
        B = px(...st.pos[a.to]),
        T = px(...a.ret);
      ov.push(passArrow(A, B, 'ground', true));
      ov.push(`<polyline class="mv ${team(a.from)}" points="${a.path.map((h) => px(...h).join(',')).join(' ')}"/>`);
      ov.push(passArrow(B, T, 'ret', true));
      ov.push(badge((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, L));
      ov.push(badge(T[0] + 11, T[1] - 11, 'G'));
    } else if (a.type === 'shot') {
      const A = px(...st.pos[a.pid]),
        T = shotAim(team(a.pid), a.zone);
      ov.push(shotLine(A, T, a.zone));
      ov.push(badge((A[0] + T[0]) / 2, (A[1] + T[1]) / 2, L));
    } else if (a.type === 'cross') {
      const A = px(...st.pos[a.from]),
        B = px(...(a.target || st.pos[a.to])),
        T = shotAim(team(a.from), a.zone);
      ov.push(passArrow(A, B, a.kind === 'ground' ? 'ground' : 'lob', true));
      ov.push(shotLine(B, T, a.zone));
      ov.push(badge((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, L));
    }
  };
  const ghostAll = (fin, showBall) => {
    for (const id in fin.pos) if (!same(fin.pos[id], S.pos[id])) ghostAt(id, fin.pos[id]);
    if (showBall && fin.ball && fin.ball !== S.ball) {
      const [x, y] = px(...fin.pos[fin.ball]);
      ov.push(`<circle class="ballghost" cx="${x + 9}" cy="${y + 9}" r="5"/>`);
    }
  };
  // v2.63: where a player is going: a greyed copy of him. If someone is really standing on that hex, both are drawn
  // smaller like a shared hex, the real player on top and the ghost behind him (user)
  function ghostAt(id, h, fade = true) {
    if (fade) ghosts.add(id); // planning fades the real token; in a defending window he's really still there
    const k = key(...h),
      there = Object.keys(S.pos).some((x) => x !== id && same(S.pos[x], h)),
      [x0, y0] = px(...h),
      [x, y] = there ? [x0 + 7, y0 - 6] : [x0, y0],
      r = there ? 10.5 : 13,
      p = PL[id];
    if (there) GHOST_HEX.add(k);
    ov.push(
      `<g class="ghost ${p.team}"><circle cx="${x}" cy="${y}" r="${r}"/><text x="${x}" y="${(y + r * 0.34).toFixed(1)}" text-anchor="middle" style="font-size:${(r * 1.02).toFixed(1)}px">${p.num}</text></g>`,
    );
  }
  // v2.26: a picked pass: the lane, the hexes a defender can contest in red, and a red ring on him
  const laneThreats = (e, kind) => {
    const hot = new Set(e.th.map((t) => key(...t.hex)));
    if (kind === 'ground') e.lane.forEach((h) => fill(h, hot.has(key(...h)) ? 'h-hot' : 'h-lane'));
    else e.th.forEach((t) => fill(t.hex, 'h-hot'));
    e.th.forEach((t) => ring(base.pos[t.pid] || t.hex, 'threatring'));
  };
  if (ph === 'plan') {
    const pst = project(base, S.plan, S.plan.length),
      att = S.attack,
      c = pst.ball,
      nx = S.plan.length;
    // v2.21: the red tint around every defender is gone (it muddied the pitch)
    // v2.26 danger zone (toggle): every hex a defender can get to before the next window; darker where 2+ can
    if (DANGER) {
      const n = {};
      for (const d of mine(other(att))) {
        if (!S.pos[d] || !canDefMove(d)) continue;
        for (const [k] of defReach(base, d, ORDER_MAX)) n[k] = (n[k] || 0) + 1;
        n[key(...S.pos[d])] = (n[key(...S.pos[d])] || 0) + 1;
      }
      for (const k in n) fill(k.split(',').map(Number), n[k] > 1 ? 'h-dz2' : 'h-dz1');
      edgeOf(new Set(Object.keys(n)), 'dz-edge');
    }
    // v2.21: tapped a greyed-out Cross: light up where a cross can be played from
    if (ui.xHelp) {
      const from = crossFromHexes(att);
      for (const h of from) fill(h, 'h-cross');
      if (from.length) {
        // the label goes at the far end of the lit areas from goal, clear of the window under the tapped hex
        const ys = from.map((h) => px(...h)[1]),
          y = att === 'H' ? Math.max(...ys) - R * 2 : Math.min(...ys) + R * 2,
          x = px(MIDC, 0)[0],
          w = 150;
        hl.push(
          `<g class="xlab"><rect x="${x - w / 2}" y="${y - 12}" width="${w}" height="24" rx="12"/><text x="${x}" y="${y + 4.5}" text-anchor="middle">Cross from these areas</text></g>`,
        );
      }
    }
    {
      let t = 0;
      const seen = {};
      for (let i = 0; i < S.plan.length; i++) {
        const a = S.plan[i];
        let L;
        if (a.ball) {
          t++;
          L = String(t);
        } else {
          seen[a.pid] = (seen[a.pid] || 0) + 1;
          L = seen[a.pid] > 1 ? '»' : '';
        }
        drawAct(project(base, S.plan, i), a, L);
      }
    }
    ghostAll(pst, true);
    {
      const pv = ui.mode === 'pass' ? 'pass' : null;
      if ((ui.mode === 'move' || (pv && !ui.pT && !ui.gB && !ui.tB && PL[ui.sel].pac > 0)) && ui.sel) {
        const isB = c === ui.sel && ui.mode === 'pass',
          rr = reach(pst, ui.sel, stepsFor(pst, ui.sel));
        for (const [, inf] of rr) {
          if (isB) {
            const e = dribbleEval(pst, ui.sel, pathFrom(rr, pst.pos[ui.sel], inf.h), new Set(), buffFor(c));
            fill(inf.h, 'h-' + (e.p >= 0.8 ? 'good' : e.p >= 0.6 ? 'mid' : 'bad'));
          } else fill(inf.h, pst.loose && same(inf.h, pst.loose) ? 'h-good' : 'h-reach');
        }
        ring(pst.pos[ui.sel]);
      }
      if (ui.mode === 'pass' && c) {
        ring(pst.pos[c]);
        if (gDist(att, pst.pos[c]) <= 7) {
          const G = goalPx(att),
            gw = R * SQ3 * 1.6;
          hl.push(
            `<rect class="goalglow" x="${G[0] - gw}" y="${att === 'H' ? G[1] - 14 : G[1] - 6}" width="${gw * 2}" height="20" rx="3"/>`,
          );
        }
        if (ui.mode === 'cross' && ui.pT) ring(pst.pos[ui.pT]);
        if (ui.tB) {
          ring(ui.tB);
          const vs = cloneSt(pst);
          vs.pos._T = ui.tB.slice();
          const k = hd(pst.pos[c], ui.tB) <= RANGE.ground ? 'ground' : 'lob';
          const e = passEval(vs, c, '_T', k, new Set(), buffFor(c));
          laneThreats(e, k);
          drawAct(vs, { type: 'pass', from: c, to: null, target: ui.tB, kind: k }, nx);
        } else if (ui.gB) {
          ring(pst.pos[ui.gB]);
          for (const h of gngTargets(pst, c, ui.gB)) fill(h, 'h-reach');
        } else if (ui.pT) {
          const d = hd(pst.pos[c], pst.pos[ui.pT]),
            kind = d <= RANGE.ground ? 'ground' : 'lob';
          ring(pst.pos[ui.pT]);
          if (d <= RANGE[kind]) {
            const e = passEval(pst, c, ui.pT, kind, new Set(), buffFor(c));
            laneThreats(e, kind);
            e.pr.forEach((t) => {
              if (t.tier === 'shadow') fill(t.hex, 'h-shadow');
              ring(pst.pos[t.pid], 'threatring');
            });
            if (e.long)
              for (const n of nbrs(...pst.pos[ui.pT])) {
                const [x, y] = px(...n);
                hl.push(`<polygon class="scat" points="${hexPts(x, y, 0.78)}"/>`);
              }
            drawAct(pst, { type: 'pass', from: c, to: ui.pT, kind }, nx);
          }
        } else if (pv === 'pass') {
          // v2.27: Pass view draws nothing extra (outlines and colour chips removed: user)
        }
      }
      if (ui.mode === 'shoot' && c) {
        ring(pst.pos[c]);
        const e = shotEval(pst, c, 4);
        e.lane.forEach((h) => fill(h, 'h-lane'));
        e.th.forEach((t) => {
          ring(pst.pos[t.pid], 'threatring');
          bubble(pst.pos[t.pid], (t.tier === 'star' ? '★ ' : '') + pc(t.p), 'b', 23);
        });
      }
      
    }
    if (!c && pst.loose) ring(pst.loose, 'selring');
  }
  for (const o of S.orders || []) {
    if (o.done) continue;
    const pts = o.path
      .slice(o.idx)
      .map((h) => px(...h).join(','))
      .join(' ');
    ov.push(`<polyline class="ordp" points="${pts}"/>`);
    // v2.63: where he's going (v2.64: only while you decide, and not once he's there)
    const end = o.path[o.path.length - 1];
    if (ph === 'react' && !same(S.pos[o.pid], end)) ghostAt(o.pid, end, false);
  }
  // marks: a tether from each marker to his man (visible to both sides once set)
  if (S.marks && S.marksOf === other(S.attack) && ph !== 'gate' && ph !== 'idle' && ph !== 'over')
    for (const d in S.marks) {
      const a = S.marks[d];
      if (!S.pos[d] || !S.pos[a]) continue;
      // drawn where the tokens are on screen right now; followMarks() keeps them on the tokens as they move (v2.14)
      const A = (TW[d] && TW[d].cur) || px(...S.pos[d]),
        B = (TW[a] && TW[a].cur) || px(...S.pos[a]);
      ov.push(`<line class="mkl" data-mk="${d}|${a}" x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}"/>`);
      tp.push(`<polygon class="mkring" data-mk="${d}|${a}" points="${hexPts(0, 0, 0.94)}" transform="translate(${B[0]},${B[1]})"/>`);
    }
  // v2.25 respond mode: the defender reading the play (v2.27: his own hex only; both sides see it, like marks)
  if (respond() && ph !== 'gate' && ph !== 'idle' && ph !== 'over') {
    // v2.54: the read is a gold dashed ring on his token (moves with him); no hex fill
    if (S.press && S.ball && pressOn(S.ball)) {
      const A = px(...S.pos[S.press.pid]),
        B = px(...S.pos[S.ball]);
      ov.push(`<line class="pressl" x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}"/>`);
      ring(S.pos[S.press.pid], 'pressring'); // v2.57: the presser gets a green hex
    }
    if (S.block && S.pos[S.block.pid] && S.block.of === other(S.attack)) ring(S.pos[S.block.pid], 'threatring');
    // v2.45: a tackle set in this window: a red arrow from the tackler to the man on the ball, until Go
    if (S.tkPend && S.ball && S.pos[S.tkPend]) {
      const A = px(...S.pos[S.tkPend]),
        B = px(...S.pos[S.ball]);
      ov.push(`<line class="tkl" x1="${A[0]}" y1="${A[1]}" x2="${(A[0] + (B[0] - A[0]) * 0.62).toFixed(1)}" y2="${(A[1] + (B[1] - A[1]) * 0.62).toFixed(1)}"/>`);
      ring(S.pos[S.ball], 'tkring'); // v2.62: on the hex he is stepping into
    }
  }
  // v2.36: in a defending window, a faint line from the man who kicked it to where the ball is now (in the air,
  // rolling or loose), so the defence can see where it came from. Still no ring where a lob will land (v2.9).
  if (ph === 'react' && S.lastKick && (S.fl || S.loose)) {
    const A = px(...S.lastKick),
      B = S.fl
        ? S.fl.kind === 'lob'
          ? (TW.ball && TW.ball.cur) || (S.flight && S.flight.xy) || A
          : S.fl.idx > 0
            ? passPt(S.fl, S.fl.idx)
            : A
        : px(...S.loose);
    if (Math.hypot(B[0] - A[0], B[1] - A[1]) > 4) {
      ov.push(`<line class="kickl" id="kickLine" x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}"/>`);
      ov.push(`<circle class="kickdot" cx="${A[0]}" cy="${A[1]}" r="3.5"/>`);
    }
  }
  if (ph === 'react')
    for (const m of S.movers || [])
      if (!m.done) {
        const pts = m.path
          .slice(0, m.idx)
          .map((h) => px(...h).join(','))
          .join(' ');
        // v2.65: the last point rides on his token (followLines), so the trail meets him where he's drawn
        if (m.idx > 0) ov.push(`<polyline class="mvdone" data-tr="${m.pid}" data-pts="${pts}" points="${pts}"/>`);
      }
  // v2.38: the yellow action circle is #ballRing, which follows the ball every frame (followBallRing in anim.js)
  ballRingOn = false; // v2.45: the yellow ball ring is off (user: "a little bit much")
  followBallRing();
  // selected defender: where he can get to (one hex in Prepare, the window's steps mid-play)
  if (ph === 'react' && ui.sel) {
    const rr = defReach(base, ui.sel, S.frame && S.frame.prep ? PREPARE_STEPS : Math.min(ORDER_MAX, S.budget));
    for (const [, inf] of rr) fill(inf.h, S.ball && same(inf.h, S.pos[S.ball]) ? 'h-bad' : 'h-def');
    ring(S.pos[ui.sel]);
    // attackers he can pick up are ringed in blue
    for (const a of mine(S.attack))
      if (canMark(ui.sel, a) && S.marks[ui.sel] !== a && a !== ui.cPop) {
        const [x, y] = px(...S.pos[a]);
        tp.push(`<polygon class="mkring cand" points="${hexPts(x, y, 0.94)}"/>`);
      }
  }
  // v2.47 shape step: the players who can still step are ringed; the selected one shows his hexes
  if (ph === 'shape') {
    if (ui.sel) {
      for (const h of shapeHexes(ui.sel)) fill(h, 'h-def');
      ring(S.pos[ui.sel]);
    }
  }
  // v2.48: a loose ball gets a pulsing white ring while play is stopped or running (it was easy to miss)
  // v2.62: no ring on a loose ball (user: no blinking circle); the "Loose!" word still pops
  // v2.53: no white dashed info ring any more; in a defending pop-up the man you'd tackle gets a red ring,
  // another attacker a blue dashed one (mark / move)
  if (ph === 'react' && ui.sel && ui.cPop && ui.cPop !== ui.sel && S.pos[ui.cPop])
    ring(S.pos[ui.cPop], ui.cPop === S.ball && challengeOK(ui.sel) ? 'tkring' : 'mkring');
  $('#hl').innerHTML = hl.join('');
  $('#ov').innerHTML = ov.join('');
  $('#ovTop').innerHTML = tp.join('');
  return ghosts;
}
function pickId(ids, pref) {
  if (!ids || !ids.length) return null;
  return ids.find((x) => team(x) === pref) || ids[0];
}
