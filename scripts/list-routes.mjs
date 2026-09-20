// Lists every Express route defined in apps/api/src/routes/*.routes.ts
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'apps', 'api', 'src', 'routes');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.routes.ts')).sort();

for (const file of files) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  const re = /(?:Router|router)\.(get|post|patch|put|delete)\(\s*'([^']+)'/g;
  const found = [];
  let m;
  while ((m = re.exec(src))) found.push(`${m[1].toUpperCase()} ${m[2]}`);
  if (found.length) {
    console.log(`--- ${file} ---`);
    for (const r of found) console.log('   ' + r);
  }
}