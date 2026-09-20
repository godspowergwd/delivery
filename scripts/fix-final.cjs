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

const files = walk(ROOT);

// ============================================================
// PART A: Fix mojibake (double-encoded UTF-8 chars)
// Each bad 3-byte sequence (displayed as 3 Latin-1 chars) maps to a single Unicode char
// We operate on the raw string by building target codepoints via charCodeAt
// ============================================================

// Helper: build a string from an array of UTF-16 code units
function buildStr(codes) {
  return String.fromCharCode.apply(null, codes);
}

// Bad -> Good mappings: [bad chars as codepoints], [good chars as codepoints]
// The bad sequences are what you see when UTF-8 bytes are decoded as Windows-1252/Latin-1 then serialized
const MOJI_MAPPINGS = [
  // em-dash: â€" (U+00E2 U+0080 U+0094) -> — (U+2014)
  { bad: buildStr([0xE2, 0x80, 0x94]), good: buildStr([0x2014]), name: 'emdash' },
  // ellipsis: â€¦ (U+00E2 U+0080 U+0x0A6) -> … (U+2026)
  { bad: buildStr([0xE2, 0x80, 0xA6]), good: buildStr([0x2026]), name: 'ellipsis' },
  // bullet: â€¢ (U+00E2 U+0080 U+0x0A2) -> • (U+2022)
  { bad: buildStr([0xE2, 0x80, 0xA2]), good: buildStr([0x2022]), name: 'bullet' },
  // left arrow: â† (U+00E2 U+0086 U+0x090) -> ← (U+2190)
  { bad: buildStr([0xE2, 0x86, 0x90]), good: buildStr([0x2190]), name: 'arr-left' },
  // right arrow: â†’ (U+00E2 U+0086 U+0x091) -> → (U+2192)
  { bad: buildStr([0xE2, 0x86, 0x91]), good: buildStr([0x2192]), name: 'arr-right' },
  // multiplication: Ã— (U+00C3 U+0097) -> × (U+00D7)
  { bad: buildStr([0xC3, 0x97]), good: buildStr([0xD7]), name: 'multiply' },
  // middle dot: Â· (U+00C2 U+00B7) -> · (U+00B7)
  { bad: buildStr([0xC2, 0xB7]), good: buildStr([0xB7]), name: 'middot' },
  // rupee: â‚µ (U+00E2 U+0082 U+0xB5) -> ₹ (U+20B9)
  { bad: buildStr([0xE2, 0x82, 0xB5]), good: buildStr([0x20B9]), name: 'rupee' },
];

function fixMojibake(str) {
  let result = str;
  let total = 0;
  for (const m of MOJI_MAPPINGS) {
    let count = 0;
    let idx = 0;
    const badLen = m.bad.length;
    while ((idx = result.indexOf(m.bad, idx)) !== -1) {
      result = result.substring(0, idx) + m.good + result.substring(idx + badLen);
      count++;
      idx += m.good.length;
      total++;
    }
    if (count > 0) {
      console.log(`  ${m.name}: ${count}`);
    }
  }
  return { result, total };
}

// ============================================================
// PART B: Fix non-premium Tailwind patterns
// Each pair: [regexSource, replacement] — applied via String.split to avoid lastIndex bugs
// ============================================================

const PATTERN_FIXES = [
  // text-xs text-slate-500 -> text-sm text-slate-500
  { re: new RegExp('text-xs text-slate-500', 'g'), to: 'text-sm text-slate-500', n: 'xsMuted' },
  // text-xs text-slate-600 -> text-sm text-slate-600
  { re: new RegExp('text-xs text-slate-600', 'g'), to: 'text-sm text-slate-600', n: 'xsSlate600' },
  // text-xs font-semibold -> text-sm font-semibold
  { re: new RegExp('text-xs font-semibold', 'g'), to: 'text-sm font-semibold', n: 'xsSemiBold' },
  // text-xs font-bold -> text-sm font-bold
  { re: new RegExp('text-xs font-bold', 'g'), to: 'text-sm font-bold', n: 'xsFontBold' },
  // text-xs text-slate-700 -> text-sm text-slate-700 (chip labels)
  { re: new RegExp('text-xs text-slate-700', 'g'), to: 'text-sm text-slate-700', n: 'chipTextXs' },
  // h-7 w-7 -> h-10 w-10 (avatar/icon sizing)
  { re: new RegExp('h-7 w-7', 'g'), to: 'h-10 w-10', n: 'avatar7' },
  // h-4 w-4 -> h-5 w-5 (inline icons in chips/tabs)
  { re: new RegExp('h-4 w-4', 'g'), to: 'h-5 w-5', n: 'icon4' },
  // gap-1.5 -> gap-2
  { re: new RegExp('gap-1\\.5', 'g'), to: 'gap-2', n: 'gap1d5' },
  // gap-0.5 -> gap-1
  { re: new RegExp('gap-0\\.5', 'g'), to: 'gap-1', n: 'gap0d5' },
];

function fixPatterns(str) {
  let result = str;
  let total = 0;
  for (const fix of PATTERN_FIXES) {
    const parts = result.split(fix.re);
    const n = parts.length - 1;
    if (n > 0) {
      result = parts.join(fix.to);
      total += n;
    }
  }
  return { result, total };
}

// ============================================================
// MAIN
// ============================================================

const report = [];
let grandTotal = 0;

for (const fp of files) {
  let orig;
  try { orig = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }

  const m = fixMojibake(orig);
  let working = m.result;
  let fileChanges = m.total;

  const p = fixPatterns(working);
  working = p.result;
  fileChanges += p.total;

  if (fileChanges > 0) {
    fs.writeFileSync(fp, working, 'utf8');
    grandTotal += fileChanges;
    const rel = fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, '');
    report.push(`${rel}: ${fileChanges} fixed`);
  }
}

if (report.length > 0) {
  report.push('');
  report.push(`Files touched: ${report.length - 1} | Total fixes: ${grandTotal}`);
}

fs.writeFileSync('scripts/fix-final-report.txt', report.join('\n'));
console.log(report.join('\n'));
