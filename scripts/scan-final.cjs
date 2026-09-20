const fs = require('fs');
const path = require('path');

const ROOT = 'apps/web/src';

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

// Embargo codepoints (emoji/dingbat blocks, excluding arrows which are typographic)
const EMBARGO = new Set();
for (let cp = 0x1F000; cp <= 0x1FAFF; cp++) EMBARGO.add(cp);
for (let cp = 0x2600; cp <= 0x27BF; cp++) EMBARGO.add(cp);
for (let cp = 0x2700; cp <= 0x27BF; cp++) EMBARGO.add(cp);
for (let cp = 0xFE00; cp <= 0xFE0F; cp++) EMBARGO.add(cp);
// Exclude pure typographic arrows (U+2190-U+21FF) - these are fine in text flow
// but flag them separately for visibility

const files = walk(ROOT);

// ---- Part A: Scan for non-premium Tailwind patterns ----
const PREMIUM_PATTERNS = {
  text11: /text-\[11px\]/g,
  text9:  /text-\[9px\]/g,
  xsMuted:     /text-xs text-slate-500/g,
  xsSlate600:  /text-xs text-slate-600/g,
  xsSemiBold:  /text-xs font-semibold/g,
  xsSemiBold2: /text-xs font-semibold/g,
  avatar7:  /h-7 w-7/g,
  avatar9:  /h-9 w-9/g,
  icon4:    /h-4 w-4/g,
  gap1d5:   /gap-1\.5/g,
  gap0d5:   /gap-0\.5/g,
  chipTextXs:/text-xs text-slate-700/g,
  xsFontBold:/text-xs font-bold/g,
};

const labelMap = {
  text11: 'text-[11px]', text9: 'text-[9px]',
  xsMuted: 'text-xs text-slate-500', xsSlate600: 'text-xs text-slate-600',
  xsSemiBold: 'text-xs font-semibold', xsSemiBold2: 'text-xs font-semibold',
  avatar7: 'h-7 w-7', avatar9: 'h-9 w-9', icon4: 'h-4 w-4',
  gap1d5: 'gap-1.5', gap0d5: 'gap-0.5', chipTextXs: 'text-xs text-slate-700',
  xsFontBold: 'text-xs font-bold',
};

const violations = {};
let totalViolations = 0;

for (const fp of files) {
  const c = fs.readFileSync(fp, 'utf8');
  for (const key in PREMIUM_PATTERNS) {
    const re = PREMIUM_PATTERNS[key];
    let m = re.exec(c);
    if (m) {
      if (!violations[fp]) violations[fp] = {};
      if (!violations[fp][key]) violations[fp][key] = 0;
      // Count all occurrences
      let count = 0;
      let idx = 0;
      while ((idx = c.indexOf(m[0], idx)) !== -1) {
        count++;
        idx += m[0].length;
      }
      violations[fp][key] = count;
      totalViolations += count;
    }
  }
}

console.log('=== PHASE 1: Non-premium pattern scan ===');
if (Object.keys(violations).length === 0) {
  console.log('CLEAN — no non-premium patterns found.');
} else {
  const keys = Object.keys(violations).sort();
  keys.forEach(fp => {
    console.log(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, ''));
    const items = Object.keys(violations[fp]).sort().map(k =>
      '  ' + labelMap[k] + ' x' + violations[fp][k]
    );
    console.log(items.join('\n'));
  });
  console.log('\nTotal violations: ' + totalViolations);
}

// ---- Part B: Scan for embargo emoji codepoints ----
const arrowCp = [];
for (let cp = 0x2190; cp <= 0x21FF; cp++) arrowCp.push(cp);

let emojiFiles = [];
let totalEmoji = 0;

for (const fp of files) {
  const c = fs.readFileSync(fp, 'utf8');
  const chars = [];
  for (let i = 0; i < c.length; i++) {
    const cp = c.charCodeAt(i);
    if (EMBARGO.has(cp)) {
      chars.push('U+' + cp.toString(16).toUpperCase().padStart(4, '0'));
      totalEmoji++;
    }
  }
  if (chars.length > 0) {
    emojiFiles.push(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, '') + ': ' + chars.join(' '));
  }
}

console.log('\n=== PHASE 2: Emoji codepoint scan ===');
if (emojiFiles.length === 0) {
  console.log('CLEAN — no emoji codepoints found.');
} else {
  emojiFiles.forEach(f => console.log(f));
  console.log('\nTotal emoji codepoints: ' + totalEmoji);
}
