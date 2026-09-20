var fs = require('fs');
var path = require('path');

function scanDir(dir, acc) {
  acc = acc || [];
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
      var full = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        scanDir(full, acc);
      } else if (e.isFile() && full.endsWith('.tsx')) {
        acc.push(full);
      }
    });
  } catch (e) {}
  return acc;
}

var files = scanDir('apps/web/src');

// Emoji + dingbat detection (codepoints, no regex escape issues)
var emojiCp = [];
for (var a = 0x1F000; a <= 0x1FAFF; a++) emojiCp.push(a);
for (var b = 0x2600; b <= 0x27BF; b++) emojiCp.push(b);
for (var c = 0x2190; c <= 0x21FF; c++) emojiCp.push(c);
for (var d = 0x2B00; d <= 0x2BFF; d++) emojiCp.push(d);
for (var e = 0x2700; e <= 0x27BF; e++) emojiCp.push(e);
emojiCp.push(0xFE00, 0xFE0F);

var emojiSet = {};
for (var i = 0; i < emojiCp.length; i++) emojiSet[emojiCp[i]] = true;

var patterns = {
  smallText: /text-\[11px\]/g,
  XsMuted: /text-xs text-slate-500/g,
  oldGap: /gap-1\.5/g,
  oldAvatar: /h-7 w-7/g,
  smallAvatar: /h-9 w-9/g,
  subtextXs: /text-xs text-slate-600/g,
  fontSemiboldXs: /text-xs font-semibold/g,
  dottedBorder: /border-dashed/g,
};

var filesWithEmoji = [];
var filesWithPatterns = {};

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var c = fs.readFileSync(fp, 'utf8');

  // Scan for emoji codepoints
  for (var j = 0; j < c.length; j++) {
    var cp = c.charCodeAt(j);
    if (emojiSet[cp]) {
      filesWithEmoji.push(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, '') + ': U+' + cp.toString(16).toUpperCase().padStart(4,'0'));
      break;
    }
  }

  // Scan for pattern classes
  for (var pat in patterns) {
    var re = patterns[pat];
    var m = re.exec(c);
    if (m) {
      if (!filesWithPatterns[fp]) filesWithPatterns[fp] = {};
      if (!filesWithPatterns[fp][pat]) filesWithPatterns[fp][pat] = 0;
      filesWithPatterns[fp][pat]++;
    }
  }
}

console.log('=== EMOJI FOUND ===');
if (filesWithEmoji.length === 0) {
  console.log('None.');
} else {
  filesWithEmoji.forEach(function(f) { console.log(f); });
}

console.log('\n=== NON-PREMIUM PATTERNS ===');
var keys = Object.keys(filesWithPatterns);
if (keys.length === 0) {
  console.log('None.');
} else {
  keys.sort();
  keys.forEach(function(fp) {
    console.log(fp.replace(/^apps[\/\\]web[\/\\]src[\/\\]/, ''));
    var p = filesWithPatterns[fp];
    var pkeys = Object.keys(p).sort();
    pkeys.forEach(function(k) { console.log('  ' + k + ' x' + p[k]); });
  });
}

console.log('\n=== SUMMARY ===');
console.log('Files scanned: ' + files.length);
console.log('Files with emoji: ' + filesWithEmoji.length);
console.log('Files with non-premium patterns: ' + keys.length);
