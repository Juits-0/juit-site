import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const URL = 'http://localhost:5189/lab.html#/deney/iframes';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function open(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PE: ${e.message}`));
  await p.goto(URL); await p.waitForTimeout(1800); return p;
}
const setup = (kb) => { const e = window.__exp, inp = e.input; e.setSetting('iframesMs', 2000); e.setSetting('iframes', true); e.setSetting('knockback', kb); e.reset();
  e.x = 560; e.sim = 1.5; e.camera.x = 560; inp.codes.clear();
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); }; for (let i = 0; i < 30; i++) step(); };
const p = await open(1280, 720);
await p.evaluate(setup, false); await p.waitForTimeout(40);
await p.screenshot({ path: OUT + 'iframes_desktop.png' });
await p.click('.sw[aria-label="Teknik görünüm"]');
await p.evaluate(setup, false); await p.waitForTimeout(40);
await p.screenshot({ path: OUT + 'iframes_tech.png' });
const m = await open(390, 844, true);
await m.evaluate(setup, false); await m.waitForTimeout(40);
await m.screenshot({ path: OUT + 'iframes_mobile.png' });
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
