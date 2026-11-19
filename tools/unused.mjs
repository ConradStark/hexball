// Reports top-level functions/constants in src/ that nothing else references (likely dead code).
// Run: npm run unused. Word-boundary count over all modules + index.html, so it's a hint, not proof.
import fs from 'fs';
import * as acorn from 'acorn';
import { ORDER } from '../build.mjs';
const files = ORDER.map((m) => [m, fs.readFileSync(`src/${m}.js`, 'utf8')]);
const all = files.map(([, s]) => s).join('\n') + fs.readFileSync('src/index.html', 'utf8');
let dead = 0;
for (const [m, src] of files) {
  const ast = acorn.parse(src, {
    ecmaVersion: 2022,
    locations: true,
    sourceType: 'script',
    allowReturnOutsideFunction: true,
  });
  for (const n of ast.body) {
    const names =
      n.type === 'FunctionDeclaration'
        ? [n.id.name]
        : n.type === 'VariableDeclaration'
          ? n.declarations.filter((d) => d.id.type === 'Identifier').map((d) => d.id.name)
          : [];
    for (const name of names) {
      const uses = (all.match(new RegExp(`(?<![\\w$.])${name.replace('$', '\\$')}(?![\\w$])`, 'g')) || []).length;
      if (uses <= 1) {
        console.log(`${m}.js:${n.loc.start.line}\t${name}`);
        dead++;
      }
    }
  }
}
console.log(dead ? `${dead} unreferenced` : 'no unreferenced top-level names');
