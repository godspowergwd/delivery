import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/user/Downloads/DELIVERY SYSTEM';
const f = path.join(root, 'apps/web/src/pages/customer/Menu.tsx');
let s = fs.readFileSync(f, 'utf8');
const lines = s.split(/\r?\n/);

// === 1. Provider alternatives gate ===
const providerGate = lines.findIndex(l => /flex flex-col gap-2/i.test(l) && l.includes('Provider'));
let start = providerGate;
let blk = [];
let depth = 0;
let brace = 0;
for (let i = start; i < lines.length; i++) {
  const line = lines[i];
  blk.push(line);
  if (line.includes('<') ) brace += (line.match(/<[^/!>]/g)||[]).length;
  if (line.includes('>')) brace -= (line.match(/>[^/!<]/g)||[]).length;
  // crude: count opening tags vs closing tags
  fee
  const o = (line.match(/<[A-Z]/g)||[]).length;
  const c = (line.match(/<\/[A-Z]/g)||[]).length;
  depth += o - c;
  if (depth <= 0 && i > start) break;
}
console.log('=== 1. Provider alternatives gate (Menu.tsx) ===');
console.log(blk.join('\n'));
console.log('\nEND 1\n');
