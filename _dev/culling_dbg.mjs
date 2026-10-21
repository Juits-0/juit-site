import { createRequire } from 'module';
const require = createRequire('C:/Claude/UnityProject1/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:5183/lab.html#/deney/culling'); await p.waitForTimeout(1200);
await p.keyboard.down('ArrowRight');
for (let i=0;i<12;i++){ await p.waitForTimeout(2000); console.log(await p.evaluate(()=>{const e=window.__exp;return [Math.round(e.x),e.strikes,e.time.toFixed(1),document.title, !!document.querySelector('.complete,.card')].join(' ')})); }
await b.close();
