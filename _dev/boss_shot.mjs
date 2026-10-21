import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const URL = 'http://localhost:5186/lab.html#/deney/boss';
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
// verilen türde saldırıyı bul, windup ilerlemesi frac'e gelince dondur
const freeze = (kind, frac, mx) => `(() => { const e = window.__exp; e.reset(); e.x = ${mx}; e.idleT = 0;
  const A0 = () => e.att;
  for (let i = 0; i < 60000; i++) { e.time += 1/120; e.update(1/120); e.input.endFrame(); const A = e.att;
    if (A && A.st === 'windup' && A.kind === '${kind}' && A.t >= A.wd * ${frac}) break;
    if (A && A.kind !== '${kind}' && A.st === 'recovery' && A.t > 0.69) { e.att = null; e.idleT = 0; }
    if (e.st === 'ko') { e.hearts = 3; e.st = 'play'; } }
  e.hearts = 3; e.inv = 0; e.hurtAge = 9; window.__upd = e.update; e.update = () => {}; return e.att && e.att.kind; })()`;
let p = await page(1280, 720);
await p.goto(URL); await p.waitForTimeout(1500);
console.log('kind', await p.evaluate(freeze('slam', 0.75, 200)));
await p.waitForTimeout(200); await p.screenshot({ path: OUT + 'boss_desktop.png' });
await p.evaluate(() => { window.__exp.update = window.__upd; });
// teknik
await p.evaluate(() => window.__exp.reset());
await p.evaluate(() => { const e = window.__exp; e.tech = true; e.onTech(true); });
console.log('kind', await p.evaluate(freeze('shock', 0.6, 300)));
await p.waitForTimeout(200); await p.screenshot({ path: OUT + 'boss_tech.png' });
await p.evaluate(() => { window.__exp.update = window.__upd; window.__exp.tech = false; });
let m = await page(390, 844, true);
await m.goto(URL); await m.waitForTimeout(1500);
console.log('kind', await m.evaluate(freeze('sweep', 0.8, 200)));
await m.waitForTimeout(200); await m.screenshot({ path: OUT + 'boss_mobile.png' });
// hata ayıklama: aktif aşama kareleri
await p.goto(URL); await p.waitForTimeout(800);
for (const [k, mx] of [['slam', 200], ['sweep', 200], ['shock', 250]]) {
  await p.evaluate(freeze(k, 0.99, mx)); await p.evaluate(() => { const e = window.__exp; e.update = window.__upd; for (let i = 0; i < 18; i++) { e.time += 1/120; e.update(1/120); } e.update = () => {}; });
  await p.waitForTimeout(150); await p.screenshot({ path: OUT + 'boss_dbg_' + k + '.png', clip: { x: 100, y: 60, width: 1080, height: 540 } });
  await p.evaluate(() => { window.__exp.update = window.__upd; });
}
console.log(logs.length ? logs.join('\n') : 'KONSOL TEMIZ');
await b.close();
