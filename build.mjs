// Builds the game from src/ into one self-contained page, in four flavours (dist/ is build output, not committed).
//   dist/hexball.html          – the page that gets published as the artifact
//   dist/hexball.test.html     – same page with test hooks (window.__hexball) and 8x faster timing (setSpeed() to change); never published
//   dist/hexball-offline.html  – one file to download and open anywhere
//   dist/pwa/                  – the installable web app (served locally by `npm start`, on GitHub Pages by .github/workflows/pages.yml)
import fs from 'fs';

// Order matters: later modules use constants declared by earlier ones at load time.
export const ORDER = [
  'config',
  'util',
  'hex',
  'board-state',
  'rules',
  'plan',
  'game',
  'gamelog',
  'playback',
  'marking',
  'duel',
  'cpu',
  'cpu-attack',
  'cpu-defend',
  'anim',
  'ui-board',
  'ui-panels',
  'ui-input',
  'main',
];

const SPEED = 'let SPEED = 1;';
// shown under More, so you can tell which build a phone has installed; bump it in package.json on each release
const VERSION = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

// v2.66: the fonts live in the page (base64 woff2, latin only) so it works with no connection. SIL OFL fonts:
// Barlow, Barlow Condensed (Jeremy Tribby), Bitter (Huerta Tipográfica); files from @fontsource, see assets/fonts.
const FONTS = [
  ['Barlow', 400, 'barlow-latin-400'], ['Barlow', 500, 'barlow-latin-500'], ['Barlow', 600, 'barlow-latin-600'], ['Barlow', 700, 'barlow-latin-700'],
  ['Barlow Condensed', 500, 'barlow-condensed-latin-500'], ['Barlow Condensed', 600, 'barlow-condensed-latin-600'],
  ['Barlow Condensed', 700, 'barlow-condensed-latin-700'], ['Barlow Condensed', 800, 'barlow-condensed-latin-800'],
  ['Bitter', 600, 'bitter-latin-600'], ['Bitter', 700, 'bitter-latin-700'], ['Bitter', 800, 'bitter-latin-800'],
];
const fontCss = () =>
  FONTS.map(
    ([fam, w, f]) =>
      `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(`assets/fonts/${f}-normal.woff2`).toString('base64')}) format('woff2')}`,
  ).join('\n');

// The installable web app (dist/pwa): a full page with the app manifest, icons and the offline service worker.
const PWA_HEAD = `<!DOCTYPE html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#efe4cc">
<meta name="description" content="Hexball Tactics: a turn-based tactical football game on hexes.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Hexball">
<script>if ('serviceWorker' in navigator && location.protocol !== 'file:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>`; // no SW (private mode, some embedded browsers): the game still runs, just not offline – don't show the error bar
const OFFLINE_HEAD = `<!DOCTYPE html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#efe4cc">`;

export function build() {
  const js = ORDER.map((m) => `/* ===== ${m}.js ===== */\n` + fs.readFileSync(`src/${m}.js`, 'utf8')).join('\n');
  const page = (body) =>
    fs
      .readFileSync('src/index.html', 'utf8')
      .replace('%%HEAD%%', () => head)
      .replace('%%VERSION%%', () => VERSION)
      .replace('%%FONTS%%', () => fonts)
      .replace('%%CSS%%', () => fs.readFileSync('src/styles.css', 'utf8'))
      .replace('%%JS%%', () => `(() => {\n${body}\n})();`);
  const fonts = fontCss();
  let head = '';

  const html = page(js);
  if (!js.includes(SPEED)) throw new Error('build: SPEED declaration changed in util.js; update build.mjs');
  const testJs =
    js.replace(SPEED, 'let SPEED = 8;') +
    '\nwindow.__hexball = { get S() { return S; }, render, cpuPlanB, setCool, newGame, popWord, px, stateText, loadState, loadScenario, setAutoGo: (v) => (AUTO_GO = v), canMark, reach, baseSt, seed: (n) => ((RNG = mulberry32(n)), (CRNG = mulberry32((n ^ 0x9e3779b9) >>> 0))), oldCpu: (v) => (CPU_OLD = v), setSpeed: (v) => (SPEED = v), setSize: (n) => (SIZE = n), get SIZE() { return SIZE; }, onsideBack, clearBox, saveP, curlCtrl, shotEval, passEval, goalAngle, saveP, kRel, gDist, PLof: (id) => PL[id], PLrole: (id) => PL[id].role, setLineup, get LINEUP() { return LINEUP; }, setPitch: (k) => { PITCH = k; setLineup(\'classic\'); }, setDef: (k) => { DEF_MODE = k; }, setShape: (v) => { SHAPE = v; }, shapePhase: () => shapePhase(), get DEF_MODE() { return DEF_MODE; }, get PITCH() { return PITCH; }, get GEO() { return { COLS, ROWS, MIDC, MIDR, GOALW, BOXW, KOC, GKC, goal: goalCols() }; } };';

  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/hexball.html', html);
  fs.writeFileSync('dist/hexball.test.html', page(testJs));
  // v2.66: one file to download and open anywhere, and the installable web app folder
  head = OFFLINE_HEAD;
  fs.writeFileSync('dist/hexball-offline.html', page(js));
  head = PWA_HEAD;
  buildPwa(page(js));
  return html.length;
}

// dist/pwa: everything GitHub Pages (or any static host) needs. Bump the cache name when the game changes so phones
// pick up the new version (it's derived from the page itself).
function buildPwa(html) {
  const dir = 'dist/pwa';
  fs.mkdirSync(`${dir}/icons`, { recursive: true });
  fs.writeFileSync(`${dir}/index.html`, html);
  for (const f of fs.readdirSync('assets/icons')) fs.copyFileSync(`assets/icons/${f}`, `${dir}/icons/${f}`);
  fs.writeFileSync(
    `${dir}/manifest.webmanifest`,
    JSON.stringify(
      {
        name: 'Hexball Tactics',
        short_name: 'Hexball',
        description: 'A turn-based tactical football game on hexes.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#efe4cc',
        theme_color: '#efe4cc',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2,
    ),
  );
  let h = 0;
  for (let i = 0; i < html.length; i++) h = (h * 31 + html.charCodeAt(i)) | 0;
  const ver = (h >>> 0).toString(36);
  fs.writeFileSync(
    `${dir}/sw.js`,
    `// Hexball offline cache (generated by build.mjs). New page = new cache name = phones update on next open.
const CACHE = 'hexball-${ver}';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
// Pages: network first (so a new version shows when online), the cache when offline. Everything else: cache first.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy));
          return r;
        })
        .catch(() => caches.match('index.html')),
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
`,
  );
  fs.writeFileSync(`${dir}/.nojekyll`, '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = build();
  console.log(`built dist/ (${(n / 1024).toFixed(0)} KB page): hexball.html, hexball.test.html, hexball-offline.html, pwa/`);
}
