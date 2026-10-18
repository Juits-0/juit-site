import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const BASE = 'http://localhost:5180/lab.html';
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
// --- lab masaüstü ---
let p = await page(1280, 720);
await p.goto(BASE); await p.waitForTimeout(1500);
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(700); await p.keyboard.up('ArrowRight');
await p.waitForTimeout(600);
await p.screenshot({ path: OUT + 'lab_desktop.png' });
// --- lab mobil ---
let m = await page(390, 844, true);
await m.goto(BASE); await m.waitForTimeout(1800);
await m.screenshot({ path: OUT + 'lab_mobile.png' });
// --- coyote ---
await p.goto(BASE + '#/deney/coyote'); await p.waitForTimeout(1800);
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(900); await p.keyboard.press('Space'); await p.waitForTimeout(250);
await p.screenshot({ path: OUT + 'coyote_desktop.png' });
await m.goto(BASE + '#/deney/coyote'); await m.waitForTimeout(1800);
await m.screenshot({ path: OUT + 'coyote_mobile.png' });
console.log(logs.length ? logs.join('\n') : 'KONSOL TEMIZ');
await b.close();
