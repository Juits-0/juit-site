import { createRequire } from 'module';
const require = createRequire('C:/Claude/juit-site/package.json');
const { chromium } = require('playwright');
const url = 'http://localhost:5184/lab.html#/deney/hile';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PE ' + e.message));
await p.goto(url); await p.waitForTimeout(1500);
const st = () => p.evaluate(() => { const e = window.__exp; return { d: e.done, st: e.st, sus: +e.sus.toFixed(2), known: e.nKnown, shown: e.nShown, hid: e.nHidden, comp: e.completed, spikes: e.spikes, hits: e.hits, w: Math.round(e.omega) }; });
await p.screenshot({ path: '_dev/hile_d_normal.png' });
console.log('start', JSON.stringify(await st()));
// mouse aim + shoot
const pt = (wx, wy) => p.evaluate(([x, y]) => { const e = window.__exp, L = e._lay(), r = document.querySelector('canvas').getBoundingClientRect(); const sc = r.width / e.view.w; return [r.left + (L.ox + x * L.z) * sc, r.top + (L.oy + (y - 20) * L.z) * sc]; }, [wx, wy]);
let [sx, sy] = await pt(60, 200); await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); await p.waitForTimeout(100);
// wallhack
await p.evaluate(() => window.__exp.setSetting('wallhack', true)); await p.waitForTimeout(900);
await p.screenshot({ path: '_dev/hile_d_wallhack.png' });
console.log('wh', JSON.stringify(await st()));
// filter
await p.evaluate(() => window.__exp.setSetting('filter', true)); await p.waitForTimeout(1300);
await p.screenshot({ path: '_dev/hile_d_filter.png' });
console.log('filter', JSON.stringify(await st()));
// tech
await p.evaluate(() => { const e = window.__exp; e.tech = true; e.onTech(true); e.setSetting('filter', false); }); await p.waitForTimeout(500);
await p.screenshot({ path: '_dev/hile_d_tech.png' });
// aimbot + anti
await p.evaluate(() => { const e = window.__exp; e.setSetting('aimbot', true); e.setSetting('anti', true); });
let shot = 0;
for (let i = 0; i < 60; i++) {
  await p.mouse.click(300, 300); await p.waitForTimeout(200);
  const s = await st(); if (s.sus > 0.5 && !shot) { await p.screenshot({ path: '_dev/hile_d_sus.png' }); shot = 1; }
  if (s.st === 'caught') break;
}
await p.waitForTimeout(700); await p.screenshot({ path: '_dev/hile_d_yakalandi.png' });
console.log('caught', JSON.stringify(await st()));
await p.waitForTimeout(3000); console.log('after', JSON.stringify(await st()));
// kazanmak için kalan: filter adımı zaten yapıldı; adım durumları
console.log('errors', errs.length, errs.slice(0, 3));
await b.close();
