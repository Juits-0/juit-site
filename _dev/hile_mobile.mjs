import { createRequire } from 'module';
const require = createRequire('C:/Claude/juit-site/package.json');
const { chromium } = require('playwright');
const url = 'http://localhost:5184/lab.html#/deney/hile';
const b = await chromium.launch();
const errs = [];
// --- mobil ekran görüntüsü
{
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PE ' + e.message));
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => { const e = window.__exp; e.setSetting('wallhack', true); e.tech = true; e.onTech(true); });
  await p.waitForTimeout(800);
  await p.touchscreen.tap(250, 200); await p.waitForTimeout(300);
  await p.screenshot({ path: '_dev/hile_m.png' });
  await c.close();
}
// --- kayıt
{
  const c = await b.newContext({ viewport: { width: 540, height: 960 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, recordVideo: { dir: '_dev/hile_vid', size: { width: 540, height: 960 } } });
  const p = await c.newPage();
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { const e = window.__exp; e.setSetting('wallhack', true); e.setSetting('aimbot', true); });
  await p.keyboard.down('ArrowUp');
  for (let i = 0; i < 12; i++) { await p.touchscreen.tap(270, 330); await p.waitForTimeout(260); if (i === 4) { await p.keyboard.up('ArrowUp'); await p.keyboard.down('ArrowLeft'); } }
  await p.keyboard.up('ArrowLeft');
  const v = p.video(); await c.close(); await v.saveAs('_dev/hile_rec.webm');
}
console.log('errors', errs.length, errs.slice(0, 3));
await b.close();
