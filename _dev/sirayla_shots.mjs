import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const BASE = 'http://localhost:5181/lab.html#/deney/sirayla';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function page(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/AudioContext|ERR_NAME/.test(m.text())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PAGEERROR: ${e.message}`));
  return p;
}
// Mobu yerinde dururken ~sec saniye ilerlet (adım adım), saldırı anında dursun
const advance = (p, cond, max = 900) => p.evaluate(({ cond, max }) => {
  const e = window.__exp; Object.defineProperty(e.input, 'axis', { get: () => ({ x: 0, y: 0 }), configurable: true });
  for (let i = 0; i < max; i++) { e.time += 1 / 120; e.frame++; e.update(1 / 120); e.input.endFrame && e.input.endFrame(); if (new Function('e', 'return ' + cond)(e)) break; }
}, { cond, max });
const p = await page(1280, 720);
await p.goto(BASE); await p.waitForTimeout(1500);
await p.waitForTimeout(300);
await p.waitForTimeout(300);
await p.screenshot({ path: OUT + 'sirayla_desktop.png' });
await p.evaluate(() => { window.__exp.tech = true; window.__exp.onTech(true); });
await p.waitForTimeout(400);
await p.screenshot({ path: OUT + 'sirayla_tech.png' });
const m = await page(390, 844, true);
await m.goto(BASE); await m.waitForTimeout(1800);
await m.waitForTimeout(300);
await m.waitForTimeout(300);
await m.screenshot({ path: OUT + 'sirayla_mobile.png' });
console.log(logs.length ? logs.join('\n') : 'KONSOL TEMIZ');
await b.close();
