import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
for (const id of ['odul', 'lod']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  // rAF'i bastır: odaksız panelde rAF gelmeme durumunu taklit eder
  await ctx.addInitScript(() => { const raf = window.requestAnimationFrame; let n = 0; window.requestAnimationFrame = cb => { return setTimeout(() => {}, 1e9); }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:5180/lab.html#/deney/${id}`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  console.log('rAF yok,', id, 'frame:', await p.evaluate(() => __exp.frame), errs.join('|'));
}
await b.close();
