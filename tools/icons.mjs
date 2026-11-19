// Renders the app icons from the start-screen logo (logo A) into assets/icons. Run: node tools/icons.mjs
import fs from 'fs';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const src = fs.readFileSync('src/index.html', 'utf8');
const svg = src.slice(src.indexOf('<svg class="logo"'), src.indexOf('</svg>', src.indexOf('<svg class="logo"')) + 6);
const css = `.lg-pitch{fill:#549759}.lg-ink{fill:none;stroke:#fff6de;stroke-width:7.5;stroke-linecap:round;stroke-linejoin:round}
.lg-ball{fill:#fff6de}.lg-patch{fill:#1d4ed8}.lg-edge{fill:none;stroke:#1d4ed8;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}`;
// [file, size, logo share of the square, background]
const OUT = [
  ['icon-192.png', 192, 0.96, 'transparent'],
  ['icon-512.png', 512, 0.96, 'transparent'],
  ['icon-maskable-512.png', 512, 0.66, '#efe4cc'], // Android crops maskable icons to a circle: keep the logo inside
  ['apple-touch-icon.png', 180, 0.8, '#efe4cc'], // iOS doesn't do transparency
];
const b = await chromium.launch();
for (const [f, n, k, bg] of OUT) {
  const p = await b.newPage({ viewport: { width: n, height: n } });
  await p.setContent(`<html><body style="margin:0;width:${n}px;height:${n}px;display:flex;align-items:center;justify-content:center;background:${bg}">
    <style>${css} svg{width:${Math.round(n * k)}px;height:${Math.round(n * k)}px}</style>${svg}</body></html>`);
  await p.screenshot({ path: `assets/icons/${f}`, omitBackground: bg === 'transparent' });
  await p.close();
}
await b.close();
console.log('icons:', OUT.map((o) => o[0]).join(', '));
