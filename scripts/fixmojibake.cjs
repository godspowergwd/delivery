var fs = require('fs');
var path = require('path');

function collectFiles(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      collectFiles(full, acc);
    } else if (e.isFile() && (full.endsWith('.tsx') || full.endsWith('.ts') || full.endsWith('.css') || full.endsWith('.html'))) {
      acc.push(full);
    }
  });
  return acc;
}

var files = collectFiles('apps/web/src');

function cps() {
  var s = '';
  for (var i = 0; i < arguments.length; i++) s += String.fromCharCode(arguments[i]);
  return s;
}

// Mojibake patterns (UTF-8 bytes mis-decoded as CP1252 then re-encoded)
var patterns = [
  { from: cps(0xe2,0x80,0x94), to: cps(0x2014) },
  { from: cps(0xe2,0x80,0xa6), to: cps(0x2026) },
  { from: cps(0xe2,0x80,0xa2), to: cps(0x2022) },
  { from: cps(0xe2,0x88,0x92), to: cps(0x2212) },
  { from: cps(0xe2,0x86,0x90), to: cps(0x2190) },
  { from: cps(0xe2,0x86,0x91), to: cps(0x2192) },
  { from: cps(0xc3,0x97),       to: cps(0xd7) },
  { from: cps(0xc2,0xb7),       to: cps(0xb7) },
  { from: cps(0xe2,0x82,0xb5),  to: cps(0x20b9) },
];

var total = 0;
var changed = [];

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var orig;
  try { orig = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }
  var fixed = orig;
  var fc = 0;
  for (var j = 0; j < patterns.length; j++) {
    var pat = patterns[j];
    var idx = fixed.indexOf(pat.from);
    if (idx === -1) continue;
    var pos = 0;
    while ((pos = fixed.indexOf(pat.from, pos)) !== -1) {
      fixed = fixed.substring(0, pos) + pat.to + fixed.substring(pos + pat.from.length);
      fc++;
      pos += pat.to.length;
    }
  }
  if (fc > 0) {
    fs.writeFileSync(fp, fixed, 'utf8');
    total += fc;
    changed.push(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, '') + ': ' + fc);
  }
}

console.log('Files with mojibake fixed: ' + changed.length);
console.log('Total replacements: ' + total);
changed.forEach(function (c) { console.log('  ' + c); });
