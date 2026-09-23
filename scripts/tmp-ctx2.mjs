import fs from 'node:fs';
const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
const s = fs.readFileSync(p, 'utf8');
const idx = s.indexOf('Veggie Fried Rice');
console.log('idx=' + idx);
console.log(JSON.stringify(s.slice(Math.max(0, idx - 200), idx + 100)));
