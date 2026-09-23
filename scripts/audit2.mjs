import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/user/Downloads/DELIVERY SYSTEM';
const skipDirs = new Set(['node_modules', '.git', '.history', '.pgdata', 'dist', 'build']);
const exts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css']);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (skipDirs.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

const files = walk(root, []);
const patterns = [
  { name: 'ORDER_PREFIX', re: /DS-|orderNumberFor|order_number|WA-/g },
  { name: 'ONYX_KEY', re: /onyx_/gi },
  { name: 'DS_KEY', re: /ds_access_token|ds_csrf|ds:toast|ds:pwa|ds:session|['"]ds_/gi },
  { name: 'SHADOW_BRAND', re: /shadow-brand|shadow-green|shadow-card|shadow-soft|shadow-lift/g },
  { name: 'TEXT_RED_BG_RED', re: /text-red-\d+|bg-red-\d+/g },
  { name: 'RATING_OR_FAKE', re: /rating|Rating|4\.2|deterministic|derived|inventory-password|cashier/i },
];
const counts = {};
for (const p of patterns) counts[p.name] = { files: new Set(), n: 0 };
for (const f of files) {
  let text;
  try {
    text = fs.readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      counts[p.name].n += m.length;
      counts[p.name].files.add(path.relative(root, f));
    }
  }
}
for (const [k, v] of Object.entries(counts)) {
  console.log(`== ${k}: ${v.n} hits in ${v.files.size} files`);
  for (const f of [...v.files].slice(0, 30)) console.log('   ' + f);
}
