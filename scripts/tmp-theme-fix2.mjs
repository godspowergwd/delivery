#!/usr/bin/env node
/** Temporary codemod #2: repairs substring artifacts + leftover dark classes. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('apps/web/src');
const MAP = [
  ['text-slate-9000', 'text-slate-500'],
  ['divide-white/5', 'divide-slate-100'],
  ['hover:border-white/25', 'hover:border-slate-300'],
  ['hover:border-white/20', 'hover:border-slate-300'],
  ['hover:border-white/10', 'hover:border-slate-300'],
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  let text = original;
  for (const [from, to] of MAP) text = text.split(from).join(to);
  if (text !== original) {
    fs.writeFileSync(file, text);
    changed++;
    console.log(`fixed ${path.relative(ROOT, file)}`);
  }
}
console.log(`\n${changed} files repaired.`);
