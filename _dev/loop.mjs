import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
for (const id of ['odul', 'lod', 'coyote']) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${id}] ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => logs.push(`[${id}] PE ${e.message}`));
  await p.goto(`http://localhost:5180/lab.html#/deney/${id}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1000);
  const r1 = await p.evaluate(() => ({ frame: __exp && __exp.frame, time: __exp && __exp.time, hidden: document.hidden, focus: document.hasFocus() }));
  await p.evaluate(() => window.dispatchEvent(new Event('blur'))); const f0 = await p.evaluate(() => __exp.frame); await p.waitForTimeout(600);
  const f1 = await p.evaluate(() => __exp.frame);
  const px = await p.evaluate(() => { const cv = document.querySelector('.exp-view canvas'); if (!cv) return 'dom'; const c = document.createElement('canvas'); c.width = 40; c.height = 40; const g = c.getContext('2d'); g.drawImage(cv, 0, 0, 40, 40); const d = g.getImageData(0, 0, 40, 40).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s; });
  console.log(id, JSON.stringify(r1), 'blur sonrası', f0, '->', f1, 'piksel toplamı', px);
}
// lab → deney → lab
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto('http://localhost:5180/lab.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000);
await p.keyboard.press('Digit6'); await p.waitForTimeout(3000);
console.log('lab→odul frame', await p.evaluate(() => [location.hash, __exp && __exp.frame]));
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1500);
const t0 = await p.evaluate(() => __lab.time); await p.waitForTimeout(500);
console.log('deney→lab lab.time', t0, await p.evaluate(() => __lab.time));
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
