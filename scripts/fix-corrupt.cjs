const fs = require('fs');
const path = require('path');

function walk(dir, acc) {
  acc = acc || [];
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        walk(full, acc);
      } else if (e.isFile() && full.endsWith('.tsx')) {
        acc.push(full);
      }
    });
  } catch (e) {}
  return acc;
}

const ROOT = 'apps/web/src';
const files = walk(ROOT);

// Step 1: Fix corruption from buggy global replace
//    text-[11px]ss  -> text-xs
//    text-[11px]sl  -> text-xs
//    text-[11px]    -> text-xs  (remaining unconverted)
const CORRUPT_RE = /text-\[11px\]s{1,2}|text-\[11px\]/g;
const CORRUPT_FIX = 'text-xs';

// Step 2: Fix text-[13px] stat labels -> text-xs (keep font-semibold/semibold)
const SMALL13_RE = /text-\[13px\]/g;
const SMALL13_FIX = 'text-xs';

let total = 0;
let filesTouched = 0;

for (let i = 0; i < files.length; i++) {
  const fp = files[i];
  let orig;
  try { orig = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }
  let fixed = orig;
  let fileChanges = 0;

  // Fix corruption
  let parts = fixed.split(CORRUPT_RE);
  let n = parts.length - 1;
  if (n > 0) {
    fixed = parts.join(CORRUPT_FIX);
    fileChanges += n;
    orig = fixed; // track for next step
  }

  // Fix remaining text-[13px]
  parts = fixed.split(SMALL13_RE);
  n = parts.length - 1;
  if (n > 0) {
    fixed = parts.join(SMALL13_FIX);
    fileChanges += n;
  }

  if (fileChanges > 0) {
    fs.writeFileSync(fp, fixed, 'utf8');
    total += fileChanges;
    filesTouched++;
    console.log(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, '') + ': ' + fileChanges + ' fixed');
  }
}

console.log('\nFiles touched: ' + filesTouched + ' | Total fixes: ' + total);
