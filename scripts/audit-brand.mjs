import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/user/Downloads/DELIVERY SYSTEM';
const skipDirs = new Set(['node_modules', '.git', '.history', '.pgdata', 'dist', 'build']);
const patterns = [
  /ONYX/,
  /Delivery System/i,
  /delivery-system/i,
  /deliverysystem/i,
  /DS-\$\{/,
  /['"`]DS-/,
  /\bds_/i,
  /ds:/i,
  /Malam|Gbawe|Waakye|waakye/i,
];
const exts = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.webmanifest', '.md', '.example']);

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
const hits = [];
for (const f of files) {
  let text;
  try {
    text = fs.readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    patterns.forEach((p) => {
      if (p.test(line)) {
        hits.push(`${path.relative(root, f)}:${i + 1}: [${p.source.slice(0, 24)}] ${line.trim().slice(0, 140)}`);
      }
    });
  });
}
console.log(`SCANNED ${files.length} files, ${hits.length} hits`);
for (const h of hits.slice(0, 400)) console.log(h);
if (hits.length > 400) console.log(`... and ${hits.length - 400} more`);
