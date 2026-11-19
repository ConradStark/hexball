// Lists top-level declarations of the legacy engine (inside the IIFE) with line numbers.
import fs from 'fs';
import * as acorn from 'acorn';
const src = fs.readFileSync(process.argv[2], 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, locations: true });
const body = ast.body[0].expression.callee.body.body;
for (const n of body) {
  let name;
  if (n.type === 'FunctionDeclaration') name = n.id.name;
  else if (n.type === 'VariableDeclaration') name = n.declarations.map((d) => d.id.name).join(',');
  else name = '<' + n.type + '> ' + src.slice(n.start, n.start + 50).replace(/\n/g, ' ');
  console.log(n.loc.start.line + '\t' + name);
}
