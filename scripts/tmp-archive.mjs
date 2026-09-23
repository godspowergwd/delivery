import fs from 'node:fs';
const p = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/api/prisma/seed.ts';
let s = fs.readFileSync(p, 'utf8');
const startMarker = "  {\n    name: 'Veggie Fried Rice',";
const start = s.indexOf(startMarker);
// The seeded remainder ends at the close of PRODUCTS: find "];" after start.
const endMarker = '\n];';
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  console.log('markers missing start=' + start + ' end=' + end);
  process.exit(1);
}
const origBlock = s.slice(start, end);
const names = [...origBlock.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
console.log('products to archive: ' + JSON.stringify(names));

// Keep-list: anything we still sell (names may repeat with new seed rows).
const keep = new Set([
  'Waakye Special',
  'Jollof Rice with Chicken',
  'Bottled Water',
]);
// Everything else from the old block is a non-waakye legacy dish: archive it
// (and mark unavailable) instead of deleting, so order history stays intact.
const archive = names.filter((n) => !keep.has(n));
console.log('archive list: ' + JSON.stringify(archive));

const head = s.slice(0, start);
const tail = s.slice(end);
const replacement =
  '  // --- Legacy non-waakye dishes (archived, never re-seeded) ---\n' +
  '  // These rows exist so historical orders keep their items. They are\n' +
  '  // archived + unavailable, so they never appear in the customer menu.\n' +
  archive
    .map(
      (n) =>
        `  {\n    name: ${JSON.stringify(n)},\n    description: 'Legacy dish — no longer sold.',\n    price: 1,\n    category: 'drinks',\n    ingredients: [],\n    prepTimeMinutes: 1,\n    stock: 0,\n    isPopular: false,\n    isNew: false,\n    imageUrl: null,\n    archive: true,\n  },`,
    )
    .join('\n');
fs.writeFileSync(p, head + replacement + tail);
console.log('wrote archive block, size=' + (head + replacement + tail).length);
