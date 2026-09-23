import fs from 'node:fs';
const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
let s = fs.readFileSync(p, 'utf8');
const marker = '  {\n    name: \'Veggie Fried Rice\',';
const idx = s.indexOf(marker);
const prodStart = s.lastIndexOf('{\n', idx);
console.log(JSON.stringify(s.slice(prodStart - 120, prodStart + 60)));
