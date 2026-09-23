import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/user/Downloads/DELIVERY SYSTEM';
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const split = (s) => s.split(/\r?\n/);

function grepMarks(src, pattern, ctx = 1) {
  const lines = split(src);
  const out = [];
  lines.some((line, i) => {
    if (new RegExp(pattern, 'i').test(line)) {
      for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++) {
        out.push((j + 1) + ':' + lines[j].trim());
      }
      out.push('---');
      return true;
    }
  });
  return out;
}

let section = '===== ORDER DETAIL MODAL / BUBBLE / PICKUP MARKERS =====';
console.log(section);
let any = false;
for (const file of fs.readdirSync(path.join(root, 'apps', 'web', 'src'))) {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
  const full = path.join(root, 'apps', 'web', 'src', file);
  const src = read(path.join('apps/web/src', file));
  const marks = [];
  marks.push(...grepMarks(src, 'openOrderDetailModal|setOpenOrderDetail|orderDetailModal|OrderDetailModal|OrderBubble|StatusBubble|TerminalOrder|OrderPickup|PickupModal|showOrderDetail|orderDetailOpen|setOrderDetailOpen|onPickupModal|PickupActions|order/"pickup|"/pickup|orderDetail'));
  if (marks.length) {
    any = true;
    console.log('FILE: apps/web/src/' + file);
    console.log(marks.join('\n'));
  }
}
if (!any) console.log('none found');

console.log('\n===== MENU PICKUP BUTTON + JOBCOUNT / KITCHEN PARAMS =====');
console.log('Menu.tsx pickup markers:');
console.log(grepMarks(read('apps/web/src/pages/customer/Menu.tsx'), 'pickup|Dispatch|dispatchToKitchen|jobCount|kitchen' ).join('\n'));
console.log('\nOrderRow.tsx pickup markers:');
const orderRowSrc = fs
  .readdirSync(path.join(root, 'apps', 'web', 'src', 'components'))
  .filter(f => /^order.*/i.test(f))
  .map(f => path.join(root, 'apps', 'web', 'src', 'components', f))
  .find(p => /order/i.test(p))
  ? read(path.resolve(path.join(root, 'apps', 'web', 'src', 'components'), fs.readdirSync(path.join(root, 'apps', 'web', 'src', 'components')).find(f => /^order.*/i.test(f)) || ''))
  : null;
if (orderRowSrc) console.log(grepMarks(orderRowSrc, 'pickup|Dispatch|dispatchToKitchen|jobCount|kitchen|onOrderPickup|PickupInfo').join('\n'));

console.log('\n===== SHARED ORDER-STATUS FLOW (no prompt/libs) =====');
const indexSrc = read('packages/shared/src/index.ts');
for (const line of split(indexSrc)) {
  if (/ORDER_STATUS|ORDER_COMPLETED|ORDER_PENDING|STATUS_PENDING|ORDER_LIVE|ORDER_IN_PROGRESS|ORDER_READY|ORDER_OUT_FOR_DELIVERY|ORDER_ACCEPTED|ORDER_SERVED|ORDER_DELIVERED|ORDER_CANCELLED|ORDER_FAILED|order.service|middleware|ASSIGNED|DRIVER|DISPATCH|driverFlow|ORDER_SYSTEM/i.test(line)) {
    console.log(line.trim());
  }
}
console.log('\norder-status.ts statuses/labels:');
const osr = read('packages/shared/src/order-status.ts');
for (const chunk of osr.split(/\n\n|\r\n\r\n/)) {
  if (/ORDER_STATUSES|ORDER_STATUS_LABELS|ORDER_STATUS_DESCRIPTIONS|ORDER_STATUS_TONES|isOrderStatus|isTerminalStatus|ORDER_COMPLETED|ORDER_PENDING|ORDER_IN_PROGRESS|ORDER_READY|ORDER_OUT_FOR_DELIVERY|ORDER_DELIVERED|ORDER_CANCELLED|ORDER_FAILED|ORDER_ACCEPTED|ORDER_SERVED|Terminal|OrderPickup|order.service/i.test(chunk)) {
    console.log(chunk.trim());
  }
}

console.log('\n===== MENU DEFAULT-LINGUISTIC NOTE KEYPATHS =====');
const menuSrc = read('apps/web/src/pages/customer/Menu.tsx');
const noteLike = split(menuSrc).filter(l => /LINGUISTIC|DEFAULT|LINGU|defaultL|/i.test(l));
console.log(notes ? '\n(menu has no stray DEFAULT-STATEMENT, LINGUISTIC/formal note enum/report markers)' : notes.map(l=>l.trim()).join('\n'));

console.log('\n===== KITCHEN TERMINAL STATES / MOCK / i18n / EXTERNAL-REPO-REF =====');
const ktSrc = read('apps/web/src/pages/kitchen/Kitchen.tsx');
const kt = split(ktSrc);
for (let i = 0; i < kt.length; i++) {
  const l = kt[i];
  if (/Terminal|__|i18n|translate|formal|nuance|mock|Mock|MOCK|List|dict|htm|html|stringify|onedeliver|seed|legacy|OrderPickup|Pickup|TerminalOrder/i.test(l)) {
    console.log((i + 1) + ':' + l.trim());
  }
}

console.log('\n===== external repo affected / plan references =====');
let foundExternal = false;
for (const file of fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.mjs') || f.endsWith('.ts') || f.endsWith('.js'))) {
  try {
    const src = read(path.join('scripts', file));
    if (/plan|external repo|Task 1|b260e1c|status flow|mock|param/i.test(src)) {
      foundExternal = true;
      console.log(path.join('scripts', file) + ' references plan/external/mock/Task 1');
    }
  } catch {}
}
if (!foundExternal) console.log('none obvious in scripts/');

console.log('\nDONE');
