var fs = require('fs');
var path = require('path');

function scan(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      scan(full, acc);
    } else if (e.isFile() && /\.(tsx|ts)$/.test(full)) {
      acc.push(full);
    }
  });
  return acc;
}

function cps() {
  var s = '';
  for (var i = 0; i < arguments.length; i++) s += String.fromCharCode(arguments[i]);
  return s;
}

var badseqs = [
  cps(0xe2,0x80,0x94), // em-dash
  cps(0xe2,0x80,0xa6), // ellipsis
  cps(0xe2,0x80,0xa2), // bullet
  cps(0xe2,0x88,0x92), // minus
  cps(0xe2,0x86,0x90), // arr-left
  cps(0xe2,0x86,0x91), // arr-right
  cps(0xc3,0x97),       // multiply
  cps(0xc2,0xb7),       // middot
  cps(0xe2,0x82,0xb5), // rupee
];

var files = scan('apps/web/src');
var found = 0;
var countByFile = [];

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var c;
  try { c = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }
  for (var j = 0; j < badseqs.length; j++) {
    var seq = badseqs[j];
    var idx = c.indexOf(seq);
    if (idx !== -1) {
      var cnt = 0;
      var pos = 0;
      while ((pos = c.indexOf(seq, pos)) !== -1) { cnt++; pos += seq.length; }
      if (cnt > 0) {
        found += cnt;
        countByFile.push(fp.replace(/^apps\/web\/src\//, '') + ': ' + cnt + 'x mojibake seq');
      }
    }
  }
}

if (found === 0) {
  console.log('No mojibake found — codebase is clean.');
} else {
  console.log('Total mojibake sequences: ' + found);
  for (var k = 0; k < countByFile.length; k++) console.log(countByFile[k]);
}
