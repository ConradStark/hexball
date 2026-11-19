// Lists CSS classes in src/styles.css that no JS or HTML in src/ mentions (as a whole word). A hint: classes built
// from pieces (e.g. `h-${...}`, `r-${rarity}`) are listed in DYNAMIC so they aren't reported.
import fs from 'fs';
const css = fs.readFileSync('src/styles.css', 'utf8'),
  code = fs
    .readdirSync('src')
    .filter((f) => /\.(js|html)$/.test(f))
    .map((f) => fs.readFileSync('src/' + f, 'utf8'))
    .join('\n');
const DYNAMIC = /^(h-|r-|f-|k-)|^(g|m|b|H|A|att|def|bad|crit|goal|info|cur|on|ctr|gk)$/;
const classes = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const dead = [...classes].filter((c) => !DYNAMIC.test(c) && !new RegExp(`(?<![\\w-])${c}(?![\\w-])`).test(code));
console.log(dead.length ? dead.join(' ') : 'no unused classes');
