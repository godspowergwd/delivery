var fs = require('fs');
var p = require('path');

function scan(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = p.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      scan(full, acc);
    } else if (e.isFile() && full.endsWith('.tsx')) {
      var c = fs.readFileSync(full, 'utf8');
      var bad = /[\uFFFD]/g;
      var m = c.match(bad);
      if (m && m.length > 0) {
        console.log(full + ' : ' + m.length + ' replacement chars');
      }
    }
  });
  return acc;
}

var files = scan('apps/web/src');
console.log('Scanned ' + files.length + ' TSX files');

// Now detect mojibake sequences (double-encoded UTF-8)
var mojibakePatterns = [
  { name: 'em-dash', seq: 'â€"', len: 3 },
  { name: 'ellipsis', seq: 'â€¦', len: 3 },
  { name: 'bullet', seq: 'â€¢', len: 3 },
  { name: 'minus', seq: 'âˆ', len: 3 },
  { name: 'arrow-left', seq: 'â†', len: 3 },
  { name: 'arrow-right', seq: 'â†’', len: 3 },
  { name: 'multiply', seq: 'Ã—', len: 2 },
  { name: 'middot', seq: 'Â·', len: 2 },
  { name: 'cedi', seq: 'â‚µ', len: 3 },
];

var totalFound = 0;
for (var i = 0; i < files.length; i++) {
  var c = fs.readFileSync(files[i], 'utf8');
  for (var j = 0; j < mojibakePatterns.length; j++) {
    var pat = mojibakePatterns[j];
    var idx = c.indexOf(pat.seq);
    if (idx !== -1) {
      var cnt = 0;
      var pos = idx;
      while (pos !== -1) {
        cnt++;
        pos = c.indexOf(pat.seq, pos + pat.len);
      }
      if (cnt > 0) {
        console.log(files[i].replace(/^apps\/web\/src\//, '') + ' : ' + pat.name + ' x' + cnt);
        totalFound += cnt;
      }
    }
  }
}
console.log('\nTotal mojibake sequences: ' + totalFound);
