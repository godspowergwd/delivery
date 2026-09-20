var fs = require('fs');
var path = require('path');

function collectFiles(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      collectFiles(full, acc);
    } else if (e.isFile() && full.endsWith('.tsx')) {
      acc.push(full);
    }
  });
  return acc;
}

var files = collectFiles('apps/web/src');
var converted = 0;

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var c = fs.readFileSync(fp, 'utf8');
  if (c.indexOf('\r\n') !== -1) {
    c = c.replace(/\r\n/g, '\n');
    fs.writeFileSync(fp, c, 'utf8');
    converted++;
  }
}
console.log('Converted ' + converted + ' files to LF');
