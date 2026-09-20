#!/usr/bin/env node
/**
 * Temporary codemod: converts the dark slate/teal utility classes used across
 * the pages to the new premium light theme (white + red + green).
 * Uses two-phase (token) replacement so mappings never cascade into each other.
 * Delete after use — it is a one-shot migration helper.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('apps/web/src');
const SKIP = new Set([
  'components/icons.tsx',
  'components/ui.tsx',
  'components/Layout.tsx',
  'lib/boot-splash.ts',
  'lib/boot-splash.test.ts',
  'lib/pwa.ts',
  'lib/pwa-display.ts',
]);

const MAP = [
  // surfaces
  ['bg-white/[0.04]', 'bg-white'],
  ['bg-white/[0.02]', 'bg-slate-50'],
  ['hover:bg-white/10', 'hover:bg-slate-200'],
  ['hover:bg-white/5', 'hover:bg-slate-100'],
  ['bg-white/15', 'bg-slate-200'],
  ['bg-white/10', 'bg-slate-200'],
  ['bg-white/20', 'bg-slate-300'],
  ['bg-white/5', 'bg-slate-100'],
  ['bg-slate-950/95', 'bg-white/95'],
  ['bg-slate-950/90', 'bg-white/95'],
  ['bg-slate-950/80', 'bg-white/95'],
  ['bg-slate-950/70', 'bg-slate-900/50'],
  ['bg-slate-950', 'bg-white'],
  ['bg-slate-900/95', 'bg-white'],
  ['bg-slate-900/80', 'bg-white'],
  ['bg-slate-900/70', 'bg-white'],
  ['bg-slate-900', 'bg-white'],
  ['bg-slate-800', 'bg-slate-100'],
  // borders / dividers
  ['border-white/5', 'border-slate-100'],
  ['border-white/10', 'border-slate-200'],
  ['border-white/15', 'border-slate-300'],
  ['border-white/20', 'border-slate-300'],
  ['divide-white/10', 'divide-slate-200'],
  // text
  ['text-slate-50', 'text-slate-900'],
  ['text-slate-100', 'text-slate-900'],
  ['text-slate-200', 'text-slate-800'],
  ['text-slate-300', 'text-slate-700'],
  ['text-slate-400', 'text-slate-600'],
  ['text-slate-950', 'text-white'],
  ['placeholder:text-slate-500', 'placeholder:text-slate-400'],
  // teal/cyan -> premium red
  ['focus:border-teal-400/60', 'focus:border-red-500'],
  ['focus:ring-teal-400/20', 'focus:ring-red-500/15'],
  ['accent-teal-400', 'accent-red-600'],
  ['hover:bg-teal-300', 'hover:bg-red-700'],
  ['text-teal-100', 'text-red-700'],
  ['text-teal-200', 'text-red-700'],
  ['border-teal-400/60', 'border-red-400'],
  ['bg-teal-400/20', 'bg-red-50'],
  ['bg-teal-400/10', 'bg-red-50'],
  ['bg-teal-500/15', 'bg-red-50'],
  ['border-teal-500/30', 'border-red-200'],
  ['border-teal-400/30', 'border-red-200'],
  ['from-teal-400', 'from-red-600'],
  ['to-cyan-400', 'to-red-500'],
  ['shadow-teal-500/20', 'shadow-red-600/20'],
  ['bg-teal-400', 'bg-red-600'],
  ['text-teal-300', 'text-red-600'],
  ['text-teal-400', 'text-red-600'],
  ['teal-400', 'red-600'],
  ['teal-300', 'red-600'],
  ['teal-500', 'red-600'],
  ['cyan-400', 'red-500'],
  ['cyan-300', 'red-400'],
  ['text-cyan-', 'text-red-'],
  // rose (danger) -> light palette
  ['bg-rose-500/90', 'bg-red-600'],
  ['hover:bg-rose-500', 'hover:bg-red-700'],
  ['bg-rose-500/15', 'bg-red-50'],
  ['bg-rose-500/10', 'bg-red-50'],
  ['border-rose-500/30', 'border-red-200'],
  ['border-rose-500/20', 'border-red-200'],
  ['bg-rose-500', 'bg-red-600'],
  ['text-rose-300', 'text-red-700'],
  ['text-rose-400', 'text-red-600'],
  ['text-rose-200', 'text-red-700'],
  ['text-rose-100', 'text-red-700'],
  // emerald -> energetic green
  ['bg-emerald-500/15', 'bg-emerald-50'],
  ['bg-emerald-500/10', 'bg-emerald-50'],
  ['border-emerald-500/30', 'border-emerald-200'],
  ['border-emerald-500/20', 'border-emerald-200'],
  ['bg-emerald-500/90', 'bg-emerald-600'],
  ['bg-emerald-500', 'bg-emerald-600'],
  ['text-emerald-300', 'text-emerald-700'],
  ['text-emerald-200', 'text-emerald-700'],
  ['text-emerald-100', 'text-emerald-700'],
  // amber -> warning
  ['bg-amber-500/15', 'bg-amber-50'],
  ['bg-amber-500/10', 'bg-amber-50'],
  ['border-amber-500/30', 'border-amber-200'],
  ['border-amber-500/20', 'border-amber-200'],
  ['text-amber-300', 'text-amber-700'],
  ['text-amber-200', 'text-amber-700'],
  ['bg-amber-500/90', 'bg-amber-400'],
  // sky / violet / indigo tints
  ['bg-sky-500/15', 'bg-sky-50'],
  ['bg-sky-500/10', 'bg-sky-50'],
  ['border-sky-500/30', 'border-sky-200'],
  ['text-sky-300', 'text-sky-700'],
  ['text-sky-100', 'text-sky-700'],
  ['bg-violet-500/15', 'bg-violet-50'],
  ['border-violet-500/30', 'border-violet-200'],
  ['text-violet-300', 'text-violet-700'],
  ['bg-indigo-500/15', 'bg-indigo-50'],
  ['border-indigo-500/30', 'border-indigo-200'],
  ['text-indigo-300', 'text-indigo-700'],
  // typography bumps (NB80 readability)
  ['text-[10px]', 'text-[11px]'],
  ['text-xl font-extrabold', 'text-2xl font-extrabold'],
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

const files = walk(ROOT).filter((file) => !SKIP.has(path.relative(ROOT, file).replace(/\\/g, '/')));
let changedFiles = 0;
let replacements = 0;

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const original = text;

  // phase 1: sources -> tokens
  MAP.forEach(([from], index) => {
    const token = `@@DS${index}@@`;
    if (text.includes(from)) text = text.split(from).join(token);
  });
  // phase 2: tokens -> finals
  MAP.forEach(([, to], index) => {
    const token = `@@DS${index}@@`;
    if (text.includes(token)) text = text.split(token).join(to);
  });

  if (text !== original) {
    fs.writeFileSync(file, text);
    changedFiles++;
    replacements += 1;
    console.log(`updated ${path.relative(ROOT, file)}`);
  }
}

console.log(`\n${changedFiles} files updated out of ${files.length} scanned.`);
