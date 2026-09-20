var fs = require('fs');
var files = [
  'apps/web/src/pages/admin/Categories.tsx',
  'apps/web/src/pages/admin/Reports.tsx',
  'apps/web/src/pages/admin/Users.tsx',
  'apps/web/src/pages/admin/Logs.tsx',
  'apps/web/src/pages/admin/Orders.tsx',
  'apps/web/src/pages/customer/Cart.tsx',
  'apps/web/src/pages/customer/Orders.tsx',
];

for (var i = 0; i < files.length; i++) {
  var fp = files[i];
  var c = fs.readFileSync(fp, 'utf8');
  
  // Fix: 8-space indent of <div className="space-y-4"> inside return ( should be 4)
  c = c.replace(/  return \(\n        <div className="space-y-4">/, '  return (\n    <div className="space-y-4">');
  
  // Fix: extra indent on heading inside space-y-4 for Categories
  // Pattern: after <div className="space-y-4">, any line with 12+ leading spaces should be 6 spaces
  // Let's just fix the specific known patterns
  
  fs.writeFileSync(fp, c, 'utf8');
  console.log('Normalized: ' + fp);
}
console.log('Done');
