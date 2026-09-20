import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const target = resolve(process.argv[2]);
const content = Buffer.from(process.argv[3], 'base64').toString('utf8');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, content, 'utf8');
console.log(`Wrote ${content.length} chars to ${target}`);
