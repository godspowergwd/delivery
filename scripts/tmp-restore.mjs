import { execSync } from 'node:child_process';
import fs from 'node:fs';
const orig = execSync('git show HEAD:apps/api/prisma/seed.ts', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
console.log('orig lines=' + orig.split('\n').length);
// Find the tail: everything from the first "  {\n    name: 'Caesar" onwards in the ORIGINAL.
const marker = "  {\n    name: 'Caesar Salad',";
const idx = orig.indexOf(marker);
console.log('marker idx=' + idx);
if (idx >= 0) {
  const tail = orig.slice(idx);
  const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
  let cur = fs.readFileSync(p, 'utf8');
  // cur currently ends with "  },\n\n" then EOF (truncated). Replace trailing "  },\n\n" with "  },\n" + tail
  cur = cur.replace(/\s*$/, '');
  if (!cur.endsWith('},')) cur += '\n  },';
  cur += '\n' + tail;
  fs.writeFileSync(p, cur);
  console.log('restored, new size=' + cur.length);
} else {
  console.log('MARKER NOT FOUND; printing product names in orig:');
  for (const m of orig.matchAll(/name: '([^']+)'/g)) console.log(' - ' + m[1]);
}
