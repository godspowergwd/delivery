#!/usr/bin/env node
/**
 * Temporary codemod #3: replaces the remaining emojis in the pages with the
 * professional SVG icon library. Exact-string, non-destructive, one-shot.
 */
import fs from 'node:fs';

const ROOT = 'apps/web/src';

/** [file path suffix, find, replace] */
const EDITS = [
  // customer Menu.tsx
  ['pages/customer/Menu.tsx',
    "import { toast } from '../../lib/realtime';",
    "import { toast } from '../../lib/realtime';\nimport { HeartIcon, ImageIcon } from '../../components/icons';"],
  ['pages/customer/Menu.tsx',
    'className="absolute right-2 top-2 z-10 rounded-full bg-white/60 px-2 py-1 text-lg leading-none backdrop-blur"\n      >\n        {favorite ? \'❤️\' : \'🤍\'}',
    'className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur transition hover:text-red-600"\n      >\n        <HeartIcon className="h-5 w-5" filled={favorite} />'],
  ['pages/customer/Menu.tsx',
    '<div className="flex h-full w-full items-center justify-center text-4xl">🍽️</div>',
    `<div className="flex h-full w-full items-center justify-center text-slate-300">
            <ImageIcon className="h-10 w-10" />
          </div>`],
  // customer Cart.tsx
  ['pages/customer/Cart.tsx',
    "import { toast } from '../../lib/realtime';",
    "import { toast } from '../../lib/realtime';\nimport { ImageIcon } from '../../components/icons';"],
  ['pages/customer/Cart.tsx',
    '<div className="flex h-full w-full items-center justify-center text-2xl">🍽️</div>',
    `<div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon className="h-7 w-7" />
                </div>`],
  // customer Product.tsx
  ['pages/customer/Product.tsx',
    "import { toast } from '../../lib/realtime';",
    "import { toast } from '../../lib/realtime';\nimport { ArrowLeftIcon, ClockIcon, ImageIcon } from '../../components/icons';"],
  ['pages/customer/Product.tsx',
    '<div className="flex h-full w-full items-center justify-center text-6xl">🍽️</div>',
    `<div className="flex h-full w-full items-center justify-center py-16 text-slate-300">
              <ImageIcon className="h-16 w-16" />
            </div>`],
  ['pages/customer/Product.tsx',
    '<span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">⏱ {data.prepTimeMinutes} min prep</span>',
    `<span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              <ClockIcon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              {data.prepTimeMinutes} min prep
            </span>`],
  ['pages/customer/Product.tsx',
    '<button onClick={() => navigate(-1)} className="text-sm font-semibold text-slate-600 hover:text-slate-800">\n        ← Back\n      </button>',
    `<button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        Back
      </button>`],
  // customer Profile.tsx
  ['pages/customer/Profile.tsx',
    '<div className="flex h-full w-full items-center justify-center">🍽️</div>',
    `<div className="flex h-full w-full items-center justify-center text-slate-300">
                      <ImageIcon className="h-5 w-5" />
                    </div>`],
  // customer OrderDetail.tsx
  ['pages/customer/OrderDetail.tsx',
    "import { toast } from '../../lib/realtime';",
    "import { toast } from '../../lib/realtime';\nimport { ArrowLeftIcon, CheckIcon } from '../../components/icons';"],
];

for (const [file, find, replace] of EDITS) {
  const full = `${ROOT}/${file}`;
  const original = fs.readFileSync(full, 'utf8');
  if (!original.includes(find)) {
    console.log(`SKIP (not found): ${file} :: ${find.slice(0, 60)}`);
    continue;
  }
  // inserts whose import may already exist — only add once
  fs.writeFileSync(full, original.split(find).join(replace));
  console.log(`updated ${file}`);
}
