import { createRequire } from 'module';
const require = createRequire('C:/Claude/juit-site/package.json');
const { chromium } = require('playwright');
const url = 'http://localhost:5184/lab.html#/deney/hile';
const b = await chromium.launch(); const errs = [];
for (const [w, h, mob] of [[1280, 720, false], [390, 844, true]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob });
  const p = await c.newPage(); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PE ' + e.message));
  await p.goto(url); await p.waitForTimeout(1200);
  const st = () => p.evaluate(() => { const e = window.__exp; return { d: e.done.join(), st: e.st, sus: +e.sus.toFixed(2), comp: e.completed, bans: e.bans, shots: e.shots }; });
  // yürü
  const x0 = await p.evaluate(() => window.__exp.mx); await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(600); await p.keyboard.up('ArrowLeft');
  const x1 = await p.evaluate(() => window.__exp.mx);
  // ateş (boşluk) + teknik aç/kapat
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  await p.evaluate(() => { const e = window.__exp; e.tech = true; e.onTech(true); }); await p.waitForTimeout(300);
  await p.evaluate(() => { const e = window.__exp; e.tech = false; e.onTech(false); });
  await p.evaluate(() => { const e = window.__exp; e.setSetting('wallhack', true); e.setSetting('anti', true); e.setSetting('thresh', 1200); e.setSetting('aimbot', true); });
  for (let i = 0; i < 80; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(150); if ((await st()).st === 'caught') break; }
  console.log(w, 'walk', Math.round(x0), '->', Math.round(x1), JSON.stringify(await st()));
  await p.evaluate(() => { const e = window.__exp; e.setSetting('aimbot', false); e.setSetting('wallhack', false); });
  await p.keyboard.press('r'); await p.waitForTimeout(300);
  console.log(w, 'after R', JSON.stringify(await st()));
  await c.close();
}
console.log('errors', errs.length, errs.slice(0, 3)); await b.close();
