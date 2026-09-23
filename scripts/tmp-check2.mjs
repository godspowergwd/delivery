import fs from 'node:fs';
const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
let s = fs.readFileSync(p, 'utf8');
// The earlier script cut the file mid-way; re-append the remainder from git.
console.log('current size=' + s.length);
console.log('tail=' + JSON.stringify(s.slice(-300)));
