// Rebuild on every save in src/ (for playing the page locally while editing): node tools/dev.mjs
import fs from 'fs';
import { build } from '../build.mjs';
let t = null;
const go = () => {
  try {
    const n = build();
    console.log(`${new Date().toLocaleTimeString()} built (${(n / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.log('build failed:', e.message);
  }
};
go();
fs.watch('src', () => {
  clearTimeout(t);
  t = setTimeout(go, 100);
});
