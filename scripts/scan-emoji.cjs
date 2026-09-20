const fs = require('fs');
const path = require('path');

// Match ONLY actual emoji characters (not SVG path letters M, d, etc.)
// These are the specific emoji chars that were in the original codebase
const emojiChars = /[📦✅🚚👤⚙️🔔💰📊🏠🛒⭐❤️🛵📍📱👁️🔥🆕🗑️◀▶🏷️💵📈📉🔒⛔⚠️💬🆔]/g;
const walk = (dir, results = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      walk(fullPath, results);
    } else if (entry.isFile() && (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.html'))) {
      results.push(fullPath);
    }
  });
  return results;
};

let found = 0;
walk('apps/web/src').forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  let match;
  while ((match = emojiChars.exec(content)) !== null) {
    const lineStart = content.lastIndexOf('\n', match.index) + 1;
    const lineEnd = content.indexOf('\n', match.index);
    const lineNum = content.substring(0, match.index).split('\n').length;
    console.log(`${path.basename(filePath)}:${lineNum} :: ${match[0]}`);
    found++;
  }
});

if (found === 0) console.log('NO ACTUAL EMOJIS FOUND — codebase is clean');
else console.log(`Total emoji characters: ${found}`);
