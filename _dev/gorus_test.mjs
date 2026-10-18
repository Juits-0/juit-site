import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const URL = 'http://localhost:5182/lab.html#/deney/gorus';
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function page(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PAGEERROR: ${e.message}`));
  return p;
}
const p = await page(1280, 720);
await p.goto(URL); await p.waitForTimeout(1500);
await p.evaluate(() => { const e = window.__exp; e.setSetting('showLos', true); e.x = 300; e.y = 360; });
await p.waitForTimeout(250);
await p.screenshot({ path: OUT + 'gorus_desktop.png' });
// yakalanma
const r1 = await p.evaluate(async () => {
  const e = window.__exp; e.x = 300; e.y = 400; e.sent[0].ph = 3.5; // nöbetçi 0 görüş alanı
  const t0 = performance.now(); let seen = null;
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 100)); if (e.st === 'caught') { seen = e.caught; break; } }
  return { st: e.st, caught: e.caught, seen, ms: performance.now() - t0, modes: e.sent.map(s => s.mode + ':' + s.det.toFixed(2)) };
});
console.log('catch test', JSON.stringify(r1));
await p.waitForTimeout(1500);
// tamamlama: küçük görüş ile kapıya ışınlanma yok, adım adım yürü
await p.evaluate(() => { const e = window.__exp; e.setSetting('fov', 30); e.setSetting('range', 80); window.__done = 0; const c = e.complete.bind(e); e.complete = (a) => { window.__done++; return c(a); }; });
const path = [[44, 516], [44, 300], [44, 120], [160, 120], [380, 120], [380, 60], [506, 52]];
// hedefe ulaşana dek axis ile değil, doğrudan konum (axis override)
const r2 = await p.evaluate(async (path) => {
  const e = window.__exp; const ax = { x: 0, y: 0 }; Object.defineProperty(e.input, 'axis', { get: () => ax, configurable: true }); let jumps = 0, prev = [e.x, e.y], maxJ = 0;
  for (const [tx, ty] of path) {
    for (let i = 0; i < 400; i++) {
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); if (d < 6) break;
      ax.x = dx / d; ax.y = dy / d;
      await new Promise(r => setTimeout(r, 16));
      maxJ = Math.max(maxJ, Math.hypot(e.x - prev[0], e.y - prev[1])); prev = [e.x, e.y];
    }
  }
  ax.x = 0; ax.y = 0;
  return { st: e.st, caught: e.caught, x: e.x, y: e.y, maxJ };
}, path);
console.log('walk', JSON.stringify(r2));
await p.waitForTimeout(1600);
console.log('complete count', await p.evaluate(() => window.__done), 'completed', await p.evaluate(() => window.__exp.completed));
// teknik görünüm
await p.goto(URL); await p.waitForTimeout(1200);
await p.evaluate(() => { const e = window.__exp; e.tech = true; e.onTech(true); e.x = 300; e.y = 330; });
await p.keyboard.press('t').catch(() => {});
await p.waitForTimeout(400);
await p.screenshot({ path: OUT + 'gorus_tech.png' });
const m = await page(390, 844, true);
await m.goto(URL); await m.waitForTimeout(1800);
await m.screenshot({ path: OUT + 'gorus_mobile.png' });
// geniş + dar
await p.setViewportSize({ width: 420, height: 600 }); await p.waitForTimeout(500);
console.log('z420', await p.evaluate(() => window.__exp.camera.z));
console.log(logs.length ? logs.join('\n') : 'KONSOL TEMIZ');
await b.close();
