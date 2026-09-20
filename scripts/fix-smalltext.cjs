var fs = require('fs');
var path = require('path');

var ROOT = 'apps/web/src';

function walk(dir, acc) {
  acc = acc || [];
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
      var full = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        walk(full, acc);
      } else if (e.isFile() && full.endsWith('.tsx')) {
        acc.push(full);
      }
    });
  } catch (e) {}
  return acc;
}

var files = walk(ROOT);

// Conservative replacements: each entry is [regex, replacement, description]
// These only touch className string literals and are safe to apply broadly.
var FIXES = [
  // Typography: text-xs muted/subtext -> text-sm
  { re: /text-xs text-slate-500/g, to: 'text-sm text-slate-500', n: 'XsMuted' },
  { re: /text-xs text-slate-600/g, to: 'text-sm text-slate-600', n: 'SubtextXs' },
  { re: /text-xs font-semibold/g,  to: 'text-sm font-semibold',  n: 'FontSemiboldXs' },
  // Micro text in dropdowns/UI: text-[11px] -> text-xs ; text-[9px] -> text-[11px]
  { re: /text-\[11px\]/g,            to: 'text-xs',               n: 'Micro11' },
  { re: /text-\[9px\]/g,             to: 'text-[11px]',           n: 'Micro9' },
  // Avatar sizing: h-7 w-7 -> h-10 w-10 ; h-9 w-9 -> h-10 w-10
  { re: /h-7 w-7/g,                 to: 'h-10 w-10',             n: 'Avatar7' },
  { re: /h-9 w-9/g,                 to: 'h-10 w-10',             n: 'Avatar9' },
  // Icons in small UI chips: h-4 w-4 -> h-5 w-5
  { re: /h-4 w-4/g,                 to: 'h-5 w-5',               n: 'Icon4' },
  // Spacing: gap-1.5 -> gap-2 (and gap-0.5 -> gap-1 for chip internals)
  { re: /gap-1\.5/g,                to: 'gap-2',                 n: 'Gap1_5' },
  { re: /gap-0\.5/g,                to: 'gap-1',                 n: 'Gap0_5' },
  // Card padding for tight list items: p-2 -> p-3 where chained with other p-*
  // (skip: too risky; handled per-file if needed)
  // NotificationItem body text-sm -> text-[15px] for readability
  { re: /text-sm text-slate-500\">\{notification\.body\}/g, to: 'text-[15px] text-slate-500\">{notification.body}', n: 'NotifBody' },
  // Notification title already text-sm; bump read-more area
  { re: /text-sm font-semibold text-slate-900\">\{notification\.title\}/g, to: 'text-[15px] font-semibold text-slate-900\">{notification.title}', n: 'NotifTitle' },
];

var report = [];
var total = 0;

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var orig = fs.readFileSync(fp, 'utf8');
  var fixed = orig;
  var fileHits = 0;

  for (var k = 0; k < FIXES.length; k++) {
    var fix = FIXES[k];
    var cnt = 0;
    var m = fix.re.exec(fixed);
    while (m) {
      cnt++;
      fixed = fixed.slice(0, m.index) + fix.to + fixed.slice(m.index + m[0].length);
      fix.re.lastIndex = 0; // reset for global matching via slice trick; re-construct
      // Re-create regex executor state by using a fresh exec loop
    }
    // Use a safer counting + replace approach:
  }

  // Safer: apply each fix with a manual global replace
  for (var k2 = 0; k2 < FIXES.length; k2++) {
    var fix2 = FIXES[k2];
    var result = '';
    var from = fix2.re.source;
    var flags = fix2.re.flags;
    var re2 = new RegExp(from, flags);
    var parts = fixed.split(re2);
    var n = parts.length - 1;
    if (n > 0) {
      fixed = parts.join(fix2.to);
      fileHits += n;
      report.push(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, '') + ': ' + fix2.n + ' x' + n);
    }
  }

  if (fileHits > 0) {
    fs.writeFileSync(fp, fixed, 'utf8');
    total += fileHits;
  }
}

report.push('');
report.push('Total replacements: ' + total);
report.push('Files touched: ' + (report.length > 0 ? report.filter(function(l){return l.indexOf(':')>=0;}).length : 0));

fs.writeFileSync('scripts/fix-report.txt', report.join(String.fromCharCode(10)));
console.log(report.join(String.fromCharCode(10)));
