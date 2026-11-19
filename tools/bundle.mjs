// Writes the whole repo as one text file for the claude.ai project (claude/hexball-src-vX.txt), so a new chat can
// restore it: node tools/bundle.mjs 2.19 [outFile]. Leaves out dist/, node_modules/ and the replay baseline
// (rebuilt with npm run build + npm run replay -- record).
import fs from 'fs';
import path from 'path';

const v = process.argv[2];
if (!v) throw new Error('usage: node tools/bundle.mjs <version> [outFile]');
const out = process.argv[3] || `../hexball-src-v${v}.txt`,
  SKIP_DIR = new Set(['node_modules', 'dist', 'shots-out', '.git']),
  SKIP_FILE = new Set(['package-lock.json', 'test/replay-baseline.json']),
  EXT = /\.(js|mjs|json|md|html|css)$/;
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.posix.join(d, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name) && !e.name.startsWith('dist')) walk(p); // dist*: build output
    } else if (EXT.test(e.name) && !SKIP_FILE.has(p.replace(/^\.\//, ''))) files.push(p.replace(/^\.\//, ''));
  }
})('.');
const unpack = `python3 -c "import re,os,sys;t=open(sys.argv[1]).read();[ (os.makedirs(os.path.dirname(p) or '.',exist_ok=True),open(p,'w').write(b)) for p,b in re.findall(r'^=== FILE: (.+?) ===\\n(.*?)(?=^=== FILE: |\\Z)',t,re.S|re.M)]" hexball-src-v${v}.txt`;
let txt = `Hexball v${v} source bundle (whole repo; dist/ and test/replay-baseline.json left out: npm install, npm run build, npm run replay -- record, npm test). Unpack: ${unpack}\n\n`;
for (const f of files) txt += `=== FILE: ${f} ===\n${fs.readFileSync(f, 'utf8')}`;
fs.writeFileSync(out, txt);
console.log(`${out}: ${files.length} files, ${(txt.length / 1024).toFixed(0)} KB`);
