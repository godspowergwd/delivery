import { execSync } from 'node:child_process';
import fs from 'node:fs';
const orig = execSync('git show HEAD:apps/api/prisma/seed.ts', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
// Tail starts at the Veggie Fried Rice product (first product AFTER the ones I replaced).
const marker = "    name: 'Veggie Fried Rice',";
const idx = orig.indexOf(marker);
console.log('marker idx=' + idx);
const prodStart = orig.lastIndexOf('{', idx);
console.log('prodStart=' + prodStart + ' context=' + JSON.stringify(orig.slice(prodStart - 10, idx + 40)));
const tail = orig.slice(prodStart);
const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
let cur = fs.readFileSync(p, 'utf8').replace(/\s*$/, '');
cur += '\n' + tail;
fs.writeFileSync(p, cur);
console.log('restored, new size=' + cur.length);
