const fs = require('fs');
const path = require('path');
const D = 'apps/web/src/pages';
const dirs = ['customer','admin','driver','kitchen'];
const fileList = [];
dirs.forEach(r=>{
  const d = path.join(D,r);
  if(fs.existsSync(d)){
    fs.readdirSync(d).filter(f=>f.endsWith('.tsx')).forEach(f=>fileList.push(path.join(d,f)));
  }
});
fileList.sort();
fileList.forEach(f=>{
  const c = fs.readFileSync(f,'utf8');
  const lines = c.split('\n');
  const cls = lines.filter(l=>l.includes('className=')).length;
  const hasEmit = (c.includes('toast(') || c.includes('toast('));
  const img = (c.match(/img src=/g)||[]).length;
  const table = (c.match(/table|<tr|<td|<th/g)||[]).length;
  console.log(`${path.basename(f).padEnd(22)} lines=${lines.length} clsLines=${cls} imgs=${img} tableEls=${table}`);
});
