import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => { window.requestAnimationFrame = () => 0; });
const p = await ctx.newPage(); p.on('pageerror', e => console.log('PE', e.message));
await p.goto('http://localhost:5193/lab.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
await p.keyboard.press('Digit3');
for (let i = 0; i < 6; i++) { await p.waitForTimeout(1000); console.log(await p.evaluate(() => JSON.stringify({ t: __lab.time, x: __lab.m.x, tg: !!__lab.target, z: __lab.zoom && __lab.zoom.t, pend: !!__lab.pending, vis: __lab.visible, hash: location.hash }))); }
await b.close();
