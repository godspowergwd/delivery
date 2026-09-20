const fs = require('fs');
const path = require('path');
const D = 'apps/web/src';
const emoji = /[📦✅🚚👤⚙️🔔💰📊🏠🛒⭐❤️🛵📍📱👁️🔥🆕🗑️❌◀▶🏷️💵📈📉📅🔒⛔⚠️💬🆔▶◀]/;
const files = [];
function walk(d){
  fs.readdirSync(d,{withFileTypes:true}).forEach(e=>{
    const p = path.join(d,e.name);
    if(e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(p);
    else if(e.isFile() && p.endsWith('.tsx')) files.push(p);
  });
}
walk(D);
files.forEach(f=>{
  const c = fs.readFileSync(f,'utf8');
  c.split('\n').forEach((line,i)=>{
    if(emoji.test(line)){
      console.log(`${path.basename(f)}:${i+1} :: ${line.trim().slice(0,90)}`);
    }
  });
});
