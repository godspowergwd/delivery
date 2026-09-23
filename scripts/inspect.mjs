import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'C:/Users/user/Downloads/DELIVERY SYSTEM';

console.log('=== WEB SRC TREE ===');
function walk(p, depth = 0) {
  if (depth > 2) return;
  try {
    for (const f of fs.readdirSync(p)) {
      const fp = path.join(p, f);
      const st = fs.statSync(fp);
      if (st.isDirectory()) {
        console.log('  '.repeat(depth) + f + '/');
        walk(fp, depth + 1);
      } else {
        if (/\.(tsx|ts)$/i.test(f)) console.log('  '.repeat(depth) + f);
      }
    }
  } catch {}
}
walk(path.join(root, 'apps/web/src'));

console.log('\n=== API ROUTES ===');
try {
  for (const f of fs.readdirSync(path.join(root, 'apps/api/src/routes'))) console.log(f);
} catch {}

console.log('\n=== API SERVICES ===');
try {
  for (const f of fs.readdirSync(path.join(root, 'apps/api/src/services'))) console.log(f);
} catch {}

console.log('\n=== shared/src ===');
try {
  for (const f of fs.readdirSync(path.join(root, 'packages/shared/src'))) console.log(f);
} catch {}
