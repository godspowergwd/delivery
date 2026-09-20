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

var issues = [];

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var c;
  try { c = fs.readFileSync(fp, 'utf8'); } catch (e) { continue; }
  
  // Check for mojibake patterns (UTF-8 bytes for special chars incorrectly stored)
  // The pattern is: a byte > 0x7F that starts a valid UTF-8 sequence for a special character
  // but where the sequence itself represents a mis-decoded character
  
  // Check for the specific mojibake sequences
  var re = /[\u00C0-\u00DF][\u0080-\u00BF]?|[\u00E0-\u00EF][\u0080-\u00BF]{2}|[\u00F0-\u00F7][\u0080-\u00BF]{3}/g;
  var m;
  while ((m = re.exec(c)) !== null) {
    var seq = m[0];
    // Check if this is a known mojibake pattern
    // Em-dash: 0xe2 0x80 0x94, ellipsis 0xe2 0x80 0xa6, etc.
    if (seq.charCodeAt(0) === 0xe2) {
      var b1 = seq.charCodeAt(1);
      var b2 = seq.length > 2 ? seq.charCodeAt(2) : -1;
      if (b1 === 0x80 && (b2 === 0x94 || b2 === 0xa6 || b2 === 0xa2 || b2 === 0x92)) {
        issues.push(fp.replace(/^apps\/web\/src\//, '') + ': mojibake sequence "' + seq + '" at offset ' + m.index);
        re.lastIndex = m.index + 1; // Back up to check for more
        continue;
      }
      if (b1 === 0x86 && (b2 === 0x90 || b2 === 0x91)) {
        issues.push(fp.replace(/^apps\/web\/src\//, '') + ': arrow mojibake at offset ' + m.index);
        re.lastIndex = m.index + 1;
        continue;
      }
      if (b1 === 0x88 && b2 === 0x92) {
        issues.push(fp.replace(/^apps\/web\/src\//, '') + ': minus mojibake at offset ' + m.index);
        re.lastIndex = m.index + 1;
        continue;
      }
      if (b1 === 0x82 && b2 === 0xb5) {
        issues.push(fp.replace(/^apps\/web\/src\//, '') + ': rupee mojibake at offset ' + m.index);
        re.lastIndex = m.index + 1;
        continue;
      }
    }
    if (seq.charCodeAt(0) === 0xc3 && seq.charCodeAt(1) === 0x97) {
      issues.push(fp.replace(/^apps\/web\/src\//, '') + ': multiply mojibake at offset ' + m.index);
      re.lastIndex = m.index + 1;
      continue;
    }
    if (seq.charCodeAt(0) === 0xc2 && seq.charCodeAt(1) === 0xb7) {
      issues.push(fp.replace(/^apps\/web\/src\//, '') + ': middot mojibake at offset ' + m.index);
      re.lastIndex = m.index + 1;
      continue;
    }
  }
}

if (issues.length === 0) {
  console.log('No mojibake found in any TSX file.');
} else {
  issues.forEach(function (i) { console.log(i); });
  console.log('\nTotal issues: ' + issues.length);
}
