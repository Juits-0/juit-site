import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const URL = 'http://localhost:5184/lab.html#/deney/chunk', OUT = 'C:/Claude/juit-site/_dev/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function pg(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.text()}`); });
  p.on('pageerror', e => logs.push('PE ' + e.message));
  await p.goto(URL); await p.waitForTimeout(1500); return p;
}
const p = await pg(1280, 720);
const cnt = () => p.evaluate(() => { const e = window.__exp; const c = { a: 0, l: 0, u: 0 }; for (const k of e.map.values()) c[k.state[0]]++; return { ...c, mem: e.map.size * 64, loads: e.loads, unloads: e.unloads, drawn: e.drawn, fps: e.fps, maxDist: e.maxDist, done: e.completed }; });
console.log('start', JSON.stringify(await cnt()));
// gerçek tuşlarla yürü: sağa, takılırsa yön değiştir
await p.keyboard.down('ArrowRight');
let lastX = -1, k = 0;
for (let i = 0; i < 60; i++) {
  await p.waitForTimeout(250);
  const s = await p.evaluate(() => ({ x: window.__exp.x, y: window.__exp.y }));
  if (i === 6) await p.screenshot({ path: OUT + 'chunk_desktop.png' });
  if (Math.abs(s.x - lastX) < 3) { await p.keyboard.up('ArrowDown'); await p.keyboard.up('ArrowUp'); await p.keyboard.down(k++ % 2 ? 'ArrowDown' : 'ArrowUp'); } lastX = s.x;
  const c = await cnt(); if (i % 8 === 0 || c.done) console.log(i, JSON.stringify(c));
  if (c.done) break;
}
await p.keyboard.up('ArrowRight'); await p.keyboard.up('ArrowDown'); await p.keyboard.up('ArrowUp');
await p.waitForTimeout(800);
console.log('final', JSON.stringify(await cnt()), 'kart:', await p.evaluate(() => !document.querySelector('.exp-card').hidden));
// ayar testleri
const e1 = await p.evaluate(() => { const e = window.__exp; e.setSetting('radius', 1); e.completed = false; return 1; });
await p.waitForTimeout(800); console.log('r1', JSON.stringify(await cnt()));
await p.evaluate(() => window.__exp.setSetting('radius', 4)); await p.waitForTimeout(100); console.log('r4 (yükleniyor)', JSON.stringify(await cnt()));
await p.waitForTimeout(600); console.log('r4', JSON.stringify(await cnt()));
// teknik görünüm shot
await p.evaluate(() => { window.__exp.setSetting('radius', 2); window.__exp.setSetting('showBorders', true); });
await p.waitForTimeout(500);
await p.screenshot({ path: OUT + 'chunk_desktop_borders.png' });
await p.evaluate(() => { window.__exp.setSetting('showBorders', false); });
await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(250);
const tb = await p.$('text=Teknik görünüm'); 
await p.evaluate(() => { const e = window.__exp; e.tech = true; e.onTech(true); });
await p.waitForTimeout(900);
await p.screenshot({ path: OUT + 'chunk_tech.png' });
await p.keyboard.up('ArrowLeft');
// reduced / reset
await p.evaluate(() => { window.__exp.reset(); }); console.log('reset', JSON.stringify(await cnt()));
const m = await pg(390, 844, true);
await m.waitForTimeout(500); await m.screenshot({ path: OUT + 'chunk_mobile.png' });
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
