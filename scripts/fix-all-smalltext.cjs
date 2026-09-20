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

// Each entry: [ regexSource, replacement, label ]
// Applied with String.split(regExp) so global replace is exact and stateless.
var RULES = [
  // --- Typography: bump small muted/subtext ---
  ['text-xs text-slate-500',  'text-sm text-slate-500',  'XsMuted'],
  ['text-xs text-slate-600',  'text-sm text-slate-600',  'SubtextXs'],
  ['text-xs font-semibold',   'text-sm font-semibold',   'FontSemiboldXs'],

  // --- Micro text in chips/dropdowns: bump to readable minimum ---
  ['text-[11px]',             'text-xs',                 'Micro11'],
  ['text-[9px]',              'text-[11px]',             'Micro9'],

  // --- Avatar sizing: make touch-friendly ---
  ['h-7 w-7',                'h-10 w-10',              'Avatar7'],
  ['h-9 w-9',                'h-10 w-10',              'Avatar9'],

  // --- Small icon chips ---
  ['h-4 w-4',                'h-5 w-5',                'Icon4'],

  // --- Spacing: generous gaps ---
  ['gap-1\\.5',              'gap-2',                  'Gap1_5'],
  ['gap-0\\.5',              'gap-1',                  'Gap0_5'],

  // --- Notification body/title readability (only inside NotificationItem) ---
  ['text-sm text-slate-500">{notification.body}',   'text-sm text-slate-500">{notification.body}',  'NotifBodyNoop'],
];

// Build regexes
var rules = RULES.map(function(r) {
  return {
    re: new RegExp(r[0], 'g'),
    to: r[1],
    n:  r[2],
    active: r[2] !== 'NotifBodyNoop'
  };
});
// Drop no-op placeholder
rules = rules.filter(function(r) { return r.active; });

var files = walk(ROOT);
var log = [];
var total = 0;
var filesTouched = 0;

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var orig = fs.readFileSync(fp, 'utf8');
  var fixed = orig;
  var fileChanges = 0;

  for (var j = 0; j < rules.length; j++) {
    var rule = rules[j];
    var re = rule.re;
    var m = re.exec(orig);
    if (!m) continue;
    // Count occurrences via split on a fresh regex
    var splitter = new RegExp(rule.re.source, 'g');
    var parts = orig.split(splitter);
    var n = parts.length - 1;
    if (n > 0) {
      fixed = fixed.split(splitter).join(rule.to);
      fileChanges += n;
      log.push(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, '') + ': ' + rule.n + ' x' + n);
      // Update orig so subsequent splits measure against already-fixed text (avoid double-count cascade):
      orig = fixed;
    }
  }

  if (fileChanges > 0) {
    fs.writeFileSync(fp, fixed, 'utf8');
    total += fileChanges;
    filesTouched++;
  }
}

log.push('');
log.push('Files scanned   : ' + files.length);
log.push('Files touched   : ' + filesTouched);
log.push('Total replaceme : ' + total);

fs.writeFileSync('scripts/fix-report.txt', log.join(String.fromCharCode(10)));
console.log(log.join(String.fromCharCode(10)));
