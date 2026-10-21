import { createRequire } from 'module';
const require = createRequire('C:/Claude/UnityProject1/package.json');
const { chromium } = require('playwright');
const url = 'http://localhost:5183/lab.html#/deney/culling';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PE ' + e.message));
await p.goto(url); await p.waitForTimeout(1200);
const st = () => p.evaluate(() => { const e = window.__exp; return { x: Math.round(e.x), load: Math.round(e.loadS), strikes: e.strikes, st: e.st, done: e.completed, drawn: e.drawn, fps: e.fps }; });
// 1) culling kapalı: yürü, bitiremez
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(4000);
console.log('off t4', JSON.stringify(await st())); await p.screenshot({ path: '_dev/culling_run_off.png' });
await p.waitForTimeout(18000); console.log('off end', JSON.stringify(await st())); await p.keyboard.up('ArrowRight');
// R sıfırla
await p.keyboard.press('r'); await p.waitForTimeout(300); console.log('after R', JSON.stringify(await st()));
// 2) culling açık, teknik açık, yürü
await p.evaluate(() => { const e = window.__exp; e.setSetting('frustum', true); e.setSetting('occl', true); e.tech = true; e.onTech(true); });
await p.keyboard.down('ArrowRight');
let maxLoad = 0;
for (let i = 0; i < 14; i++) { await p.waitForTimeout(1000); const s = await st(); maxLoad = Math.max(maxLoad, s.load); if (i === 3) await p.screenshot({ path: '_dev/culling_run_on.png' }); if (s.done) break; }
console.log('on', JSON.stringify(await st()), 'maxLoad', maxLoad);
await p.waitForTimeout(1500); await p.screenshot({ path: '_dev/culling_win.png' });
await p.keyboard.up('ArrowRight');
console.log('errors', errs.length, errs.slice(0,3));
await b.close();
