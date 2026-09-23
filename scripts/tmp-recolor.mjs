import fs from 'node:fs';

const root = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/web/src';
// Green-first recolor: primary buttons, selected pills, progress, active tabs.
// Red stays for: prices, destructive actions, error states, small accents.
const jobs = [
  {
    file: 'components/FoodCard.tsx',
    from: "'btn-ripple flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40',",
    to: "'btn-ripple flex h-11 w-11 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40',",
  },
];

let total = 0;
for (const dir of ['', 'components/', 'pages/customer/', 'pages/driver/', 'pages/kitchen/', 'pages/admin/', 'pages/']) {
  let entries;
  try {
    entries = fs.readdirSync(root + '/' + dir);
  } catch {
    continue;
  }
  for (const e of entries) {
    if (!e.endsWith('.tsx')) continue;
    const p = root + '/' + dir + e;
    let s = fs.readFileSync(p, 'utf8');
    const before = s;
    // Exact, safe swaps only (keep red for prices/destructive/errors):
    s = s
      // primary red buttons -> green
      .split('className="flex items-center justify-between gap-3 rounded-card bg-red-600 p-4 text-white shadow-brand transition hover:bg-red-700"')
      .join('className="flex items-center justify-between gap-3 rounded-card bg-green-700 p-4 text-white shadow-green transition hover:bg-green-800"')
      .split('className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-red-600 px-4 text-[15px] font-semibold text-white shadow-brand-soft"')
      .join('className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-green-700 px-4 text-[15px] font-semibold text-white shadow-green"')
      .split("className=\"flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 text-lg font-bold text-white disabled:opacity-40\"")
      .join("className=\"flex h-10 w-10 items-center justify-center rounded-2xl bg-green-700 text-lg font-bold text-white disabled:opacity-40\"")
      .split('bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 active:scale-[0.97]')
      .join('bg-green-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-800 active:scale-[0.97]')
      // selected category pills -> green
      .split("'flex flex-none items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-brand-soft'")
      .join("'flex flex-none items-center gap-2 rounded-full bg-green-700 px-4 py-2.5 text-sm font-bold text-white shadow-green'")
      .split("'shrink-0 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white'")
      .join("'shrink-0 rounded-full bg-green-700 px-4 py-2 text-sm font-bold text-white'")
      // trending pills red-50/red-700 -> green
      .split('rounded-full bg-red-50 px-3.5 py-2 text-[13px] font-bold text-red-700 transition hover:bg-red-100 active:scale-95')
      .join('rounded-full bg-green-50 px-3.5 py-2 text-[13px] font-bold text-green-800 transition hover:bg-green-100 active:scale-95')
      // checkbox accent
      .split('accent-red-600')
      .join('accent-green-700')
      // focus rings on inputs
      .split('focus:border-red-500')
      .join('focus:border-green-600')
      // spinner loader red -> green
      .split('border-t-red-600')
      .join('border-t-green-700')
      // icon accents that act as brand confirmation -> keep red only for alert icons
      .split('<MapPinIcon className="h-4 w-4 flex-none text-red-600"')
      .join('<MapPinIcon className="h-4 w-4 flex-none text-green-700"')
      // active order banner icon tile -> green
      .split('rounded-2xl bg-red-600\">')
      .join('rounded-2xl bg-green-700\">');
    if (s !== before) {
      fs.writeFileSync(p, s);
      total += 1;
      console.log('recolored ' + dir + e);
    }
  }
}
console.log('done, files touched=' + total);
