import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const logs = []; p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.text()); }); p.on('pageerror', e => logs.push('PE ' + e.message));
await p.goto('http://localhost:5180/lab.html'); await p.waitForTimeout(1200);
await p.evaluate(() => { window.__xs = []; const f = () => { if (window.__lab) window.__xs.push(window.__lab.m.x); requestAnimationFrame(f); }; f(); });
await p.keyboard.press('3');
await p.waitForTimeout(500); await p.screenshot({ path: OUT + 'flow_walk.png' });
await p.waitForTimeout(1000); await p.screenshot({ path: OUT + 'flow_arrive.png' });
await p.waitForTimeout(500); await p.screenshot({ path: OUT + 'flow_zoom.png' });
await p.waitForTimeout(1500);
console.log('hash1', await p.evaluate(() => location.hash), 'exp visible', await p.evaluate(() => !document.getElementById('exp').classList.contains('hidden')));
await p.click('[data-a=back]'); await p.waitForTimeout(250); await p.screenshot({ path: OUT + 'flow_back.png' });
await p.waitForTimeout(1200);
console.log('hash2', await p.evaluate(() => location.hash), 'labx', await p.evaluate(() => __lab.m.x));
// tıklayarak istasyon (monitör)
await p.mouse.click(640, 330); await p.waitForTimeout(3500);
console.log('hash3 (tıklama)', await p.evaluate(() => location.hash));
await p.goBack(); await p.waitForTimeout(1500);
// Mobu'ya tıkla
const mx = await p.evaluate(() => { const l = __lab; return (l.m.x - l.cam.x) * l.cam.z * l.view.scale + l.view.cssW / 2; });
await p.mouse.click(mx, 520); await p.waitForTimeout(300); await p.screenshot({ path: OUT + 'flow_surprise.png' });
// uyku
await p.waitForTimeout(8000); await p.screenshot({ path: OUT + 'flow_sleep.png' });
const xs = await p.evaluate(() => window.__xs); let mx2 = 0; for (let i = 1; i < xs.length; i++) mx2 = Math.max(mx2, Math.abs(xs[i] - xs[i - 1]));
console.log('maks kare sıçraması px:', mx2.toFixed(1), 'kare', xs.length);
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
