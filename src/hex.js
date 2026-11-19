function px(c, r) {
  return [PADX + R * SQ3 * (c + 0.5 * (r & 1)) + (R * SQ3) / 2, PADY + R + R * 1.5 * r];
}
function cube(c, r) {
  return [c - ((r - (r & 1)) >> 1), r];
}
function offOf(q, r) {
  return [q + ((r - (r & 1)) >> 1), r];
}
function hd(a, b) {
  const [q1, r1] = cube(a[0], a[1]),
    [q2, r2] = cube(b[0], b[1]);
  const dq = q1 - q2,
    dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
function nbrs(c, r) {
  const D =
    r & 1
      ? [
          [1, 0],
          [1, -1],
          [0, -1],
          [-1, 0],
          [0, 1],
          [1, 1],
        ]
      : [
          [1, 0],
          [0, -1],
          [-1, -1],
          [-1, 0],
          [-1, 1],
          [0, 1],
        ];
  return D.map(([dc, dr]) => [c + dc, r + dr]).filter(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS);
}
// all six neighbours, on the pitch or not (for drawing outlines)
function nbrsAll(c, r) {
  const D =
    r & 1
      ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
      : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  return D.map(([dc, dr]) => [c + dc, r + dr]);
}
function cround(q, r, s) {
  let rq = Math.round(q),
    rr = Math.round(r),
    rs = Math.round(s);
  const dq = Math.abs(rq - q),
    dr = Math.abs(rr - r),
    ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}
function hexLine(a, b) {
  const [q1, r1] = cube(...a),
    [q2, r2] = cube(...b),
    s1 = -q1 - r1,
    s2 = -q2 - r2,
    N = hd(a, b),
    out = [];
  for (let i = 0; i <= N; i++) {
    const t = N ? i / N : 0;
    const [q, r] = cround(q1 + (q2 - q1) * t + 1e-6, r1 + (r2 - r1) * t + 2e-6, s1 + (s2 - s1) * t - 3e-6);
    out.push(offOf(q, r));
  }
  return out;
}
function shadowOf(d, dir) {
  const [dx, dy] = px(...d),
    L = Math.hypot(dir[0], dir[1]) || 1;
  let best = null;
  for (const n of nbrs(...d)) {
    const [nx, ny] = px(...n);
    const dot = ((nx - dx) * dir[0] + (ny - dy) * dir[1]) / (Math.hypot(nx - dx, ny - dy) * L);
    if (!best || dot > best.dot) best = { dot, n };
  }
  return best && best.dot > 0.85 ? best.n : null;
}
function hexPts(x, y, s = 1) {
  let o = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    o.push((x + R * s * Math.cos(a)).toFixed(1) + ',' + (y + R * s * Math.sin(a)).toFixed(1));
  }
  return o.join(' ');
}
// The goal's columns on its line (v2.23: GOALW wide, centred on MIDC — 3..5 on 9 wide, 3..6 on 10 wide).
function goalCols() {
  const lo = Math.ceil(MIDC - (GOALW - 1) / 2),
    hi = Math.floor(MIDC + (GOALW - 1) / 2),
    out = [];
  for (let c = lo; c <= hi; c++) out.push(c);
  return out;
}
function gDist(att, h) {
  const row = att === 'H' ? 0 : ROWS - 1;
  return Math.min(...goalCols().map((c) => hd(h, [c, row]))) + 1;
}
// The goal-line hex a shot at `zone` heads for (left/centre/right as the shooter sees it): left/right = the post
// columns; centre = the middle column (an even goal: the keeper's home column, one of the middle two).
function aimHex(att, zone) {
  const zc = (zone % 3) - 1,
    r = att === 'H' ? 0 : ROWS - 1;
  return zc ? [MIDC + zc * (att === 'H' ? 1 : -1) * ((GOALW - 1) / 2), r] : [GKC, r];
}
// Where across the goal mouth that zone is, in px (the centre of an even goal sits between two columns).
function aimX(att, zone) {
  // an odd goal: exactly the aimed hex's centre (as before v2.23, so 9 × 13 games replay to the decimal)
  if (GOALW % 2) return px(...aimHex(att, zone))[0];
  return goalPx(att)[0] + ((zone % 3) - 1) * (att === 'H' ? 1 : -1) * R * SQ3 * ((GOALW - 1) / 2);
}
function goalHex(att) {
  return [GKC, att === 'H' ? 0 : ROWS - 1];
}
function goalPx(att) {
  const x = px(MIDC, 0)[0];
  return att === 'H' ? [x, PADY - 6] : [x, H - PADY + 6];
}
