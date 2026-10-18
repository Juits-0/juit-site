import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const BASE = 'http://localhost:5185/lab.html#/deney/odul', OUT = 'C:/Claude/juit-site/_dev/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function pg(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PAGEERROR: ${e.message}`));
  return p;
}
const p = await pg(1280, 720);
await p.goto(BASE); await p.waitForTimeout(1500);
await p.evaluate(() => { window.__done = 0; const e = window.__exp, o = e.complete.bind(e); e.complete = (a) => { window.__done++; return o(a); }; });
// bot: sanal zaman, her adımda altına göre koş/zıpla
const run = async (shotAt) => p.evaluate((shotAt) => {
  const e = window.__exp, inp = e.input;
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); };
  inp.codes.clear(); inp.codes.add('ArrowRight');
  const r = e.round; let n = 0, shot = false;
  while (e.round === r && n++ < 120 * 120 && !e.completed) {
    const next = e.coinDefs.find((c, i) => !e.got[i]);
    if (next && next.air && e.grounded && next.x - e.x < 62 && next.x - e.x > 20) inp._p.add('jump');
    if (e.count >= 10 && Math.abs(e.x - 2160) < 5) inp.codes.delete('ArrowRight');
    step();
    if (shotAt && e.count === shotAt && !shot && e.time - e.collT < 0.05) { shot = true; return { shot: true, n }; }
    if (e.st === 'fade' && e.round === 'A') { inp.codes.add('ArrowRight'); }
  }
  return { n, count: e.count, round: e.round, tA: e.tA, tB: e.tB, done: e.completed };
}, shotAt);
console.log('A', JSON.stringify(await run()));
await p.waitForTimeout(100);
// B turuna geç: sahneyi gerçek zamanda ilerlet
await p.evaluate(() => { const e = window.__exp; e.input.codes.clear(); });
await p.waitForTimeout(2600);
console.log('B basladi', await p.evaluate(() => ({ r: __exp.round, s: __exp.s, st: __exp.st })));
await p.evaluate(() => { __exp.setSetting('flash', true); });
await p.evaluate(() => { __exp.tech = true; });
// 3. altına kadar sür ve çekim anı yakala
const r = await run(3); console.log('shot', r);
await p.screenshot({ path: OUT + 'odul_desktop.png' });
await p.evaluate(() => { __exp.input.codes.clear(); });
const r2 = await p.evaluate(() => { const e = window.__exp, inp = e.input; const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); }; inp.codes.add('ArrowRight'); let n = 0; while (!e.completed && n++ < 120 * 120) { const next = e.coinDefs.find((c, i) => !e.got[i]); if (next && next.air && e.grounded && next.x - e.x < 62 && next.x - e.x > 20) inp._p.add('jump'); if (e.count >= 10 && Math.abs(e.x - 2160) < 5) inp.codes.delete('ArrowRight'); step(); } return { n, completed: e.completed, tA: e.tA, tB: e.tB, ev: e.events }; });
console.log('end', r2);
await p.waitForTimeout(600);
console.log('complete cagri', await p.evaluate(() => window.__done));
// tech görseli
const t = await pg(1280, 720); await t.goto(BASE); await t.waitForTimeout(1200);
await t.evaluate(() => { const e = __exp; e.setSetting('flash', true); e.setSetting('particles', true); e.setSetting('counter', true); e.tech = true; e.x = 480; e.dir = 1; e.camera.x = 540; const inp = e.input; for (let i = 0; i < 600; i++) { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); if (e.count === 1) break; } });
await t.waitForTimeout(100); await t.screenshot({ path: OUT + 'odul_tech.png' });
const m = await pg(390, 844, true); await m.goto(BASE); await m.waitForTimeout(1500);
await m.evaluate(() => { const e = __exp; for (const k of ['flash','sound','particles','shake','counter','reaction']) e.setSetting(k, true); e.x = 300; e.camera.x = 360; for (let i = 0; i < 600; i++) { e.time += 1/120; e.frame++; e.input.codes.add('ArrowRight'); e.update(1/120); e.input.endFrame(); if (e.count === 1) break; } e.input.codes.clear(); });
await m.waitForTimeout(80); await m.screenshot({ path: OUT + 'odul_mobile.png' });
console.log(logs.length ? logs.join('\n') : 'KONSOL TEMIZ');
await b.close();
