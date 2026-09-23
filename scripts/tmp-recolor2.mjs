import fs from 'node:fs';

const root = 'C:/Users/user/Downloads/DELIVERY SYSTEM/apps/web/src';
// Remaining text-red-600 links that are navigation/actions (green). Prices,
// destructive buttons and error text keep red intentionally.
const keepRed = /Remove|Clear all|Minimum order|Sold out|error|Error|expired|Cancel|Delete|failed|Could not|Note:/;
const files = [
  'pages/customer/Menu.tsx',
  'pages/customer/Orders.tsx',
  'pages/customer/OrderDetail.tsx',
  'pages/customer/Profile.tsx',
  'pages/customer/Product.tsx',
  'pages/customer/Cart.tsx',
  'pages/customer/Checkout.tsx',
  'pages/driver/Deliveries.tsx',
  'pages/driver/Map.tsx',
  'pages/driver/Earnings.tsx',
  'pages/driver/Profile.tsx',
  'pages/kitchen/Kitchen.tsx',
  'pages/admin/Dashboard.tsx',
  'pages/admin/Orders.tsx',
  'pages/admin/Products.tsx',
  'pages/admin/Categories.tsx',
  'pages/admin/Users.tsx',
  'pages/admin/Reports.tsx',
  'pages/admin/Logs.tsx',
  'pages/Register.tsx',
  'pages/Verify.tsx',
  'pages/Settings.tsx',
  'components/NotificationBell.tsx',
  'components/Layout.tsx',
];
for (const rel of files) {
  const p = root + '/' + rel;
  let s;
  try {
    s = fs.readFileSync(p, 'utf8');
  } catch {
    continue;
  }
  const lines = s.split('\n');
  let changed = false;
  const next = lines.map((line) => {
    if (!line.includes('text-red-600') && !line.includes('bg-red-600') && !line.includes('text-red-700')) return line;
    if (keepRed.test(line)) return line;
    // bg-red-600 solid buttons -> green primary
    let out = line
      .split('bg-red-600')
      .join('bg-green-700')
      .split('hover:bg-red-700')
      .join('hover:bg-green-800')
      .split('active:bg-red-800')
      .join('active:bg-green-900')
      .split('shadow-brand')
      .join('shadow-green');
    // red link text for navigation/actions -> green
    if (
      out.includes('text-red-600') &&
      /hover:underline|<Link|to=|See all|Browse menu|Create a|link|Forgot/.test(out)
    ) {
      out = out.split('text-red-600').join('text-green-700');
    }
    if (out.includes('text-red-700') && /hover:underline|<Link|to=/.test(out)) {
      out = out.split('text-red-700').join('text-green-700');
    }
    if (out !== line) changed = true;
    return out;
  });
  if (changed) {
    fs.writeFileSync(p, next.join('\n'));
    console.log('touched ' + rel);
  }
}
console.log('done');
