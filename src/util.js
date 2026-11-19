const $ = (s) => document.querySelector(s);
// Seeded dice (v1.15): each turn reseeds from S.seed, so a saved state replays the same rolls for the same choices.
// v2.9: the CPU's choices draw from their own stream (CRNG, same seed), so going back a turn with the same dice
// replays the CPU's plan exactly, however differently you play it.
let RNG = Math.random,
  CRNG = Math.random;
const rnd = () => RNG(),
  crnd = () => CRNG(),
  mulberry32 = (a) => () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const other = (t) => (t === 'H' ? 'A' : 'H'),
  team = (id) => id[0];
const key = (c, r) => c + ',' + r,
  same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const pc = (p) => Math.round(p * 100) + '%';
// v2.26 chance colours on the board: blue = safe, amber = risky, red = long shot
const chanceCls = (p) => (p == null ? '' : p >= 0.75 ? 'safe' : p >= 0.5 ? 'risky' : 'long');
const pcls = (p) => (p >= 0.75 ? 'g' : p >= 0.5 ? 'm' : 'b');
const nm = (id) => `#${PL[id].num} ${PL[id].name}`;
const onPitch = (p) => !(DROP[SIZE] || []).includes(p.id);
const mine = (t) => ROSTER.filter((p) => p.team === t && onPitch(p)).map((p) => p.id);
// All game timing goes through wait()/sleep() so tests and the sim can run faster (SPEED is raised by the test build).
let SPEED = 1;
const wait = (fn, ms) => setTimeout(fn, ms / SPEED);
const sleep = (ms) => new Promise((r) => wait(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
