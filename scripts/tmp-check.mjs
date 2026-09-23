import fs from 'node:fs';
const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
let s = fs.readFileSync(p, 'utf8');
console.log('hasMealsCat=' + s.includes("{ name: 'Meals'"));
console.log('hasCaesar=' + s.includes('Caesar Salad'));
console.log('idxMeals=' + s.indexOf("{ name: 'Meals'"));
console.log(JSON.stringify(s.slice(s.indexOf('const CATEGORIES'), s.indexOf('const CATEGORIES') + 200)));
