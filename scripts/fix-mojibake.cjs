const fs = require('fs');
const path = require('path');

const rootDir = 'apps/web/src';

function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      collectFiles(full, acc);
    } else if (entry.isFile() && full.endsWith('.tsx')) {
      acc.push(full);
    }
    if (entry.isFile() && full.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const files = collectFiles(rootDir);

// Mojibake -> correct UTF-8 sequences
// These are UTF-8 bytes that were interpreted as Windows-1252 then re-encoded as UTF-8
const replacements = [
  { from: 'GHâ‚µ', to: 'GH₵' },
  { from: 'â€¢', to: '•' },
  { from: 'â…", to: '…' },
  { from: 'â€"', to: '—' },
  { from: 'â†', to: '←' },
  { from: 'â†’', to: '→' },
  { from: 'âˆ', to: '−' },
  { from: 'Ã—', to: '×' },
  { from: 'Â·', to: '·' },
];

let total = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let fixed = original;
  let fileChanges = 0;

  for (const r of replacements) {
    let count = 0;
    while (fixed.includes(r.from)) {
      fixed = fixed.replace(r.from, r.to);
      count++;
      fileChanges++;
    }
  }

  if (fileChanges > 0) {
    fs.writeFileSync(file, fixed, 'utf8');
    total += fileChanges;
    const rel = file.replace(/^apps\/web\/src\//, '');
    console.log(rel + ': ' + fileChanges + ' fixed');
  }
}

console.log('\nTotal mojibake fixed: ' + total);
