import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/yukleme_';
const URL = 'http://localhost:5182/lab.html#/deney/yukleme';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function open(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PE: ${e.message}`));
  await p.goto(URL); await p.waitForTimeout(1800); return p;
}
const bot = (p) => p.evaluate(() => {
  const e = window.__exp, inp = e.input, out = {};
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); };
  for (const m of ['klasik', 'kapi', 'gecit', 'asansor']) for (const pf of [true, false]) {
    e.setSetting('method', m); e.setSetting('prefetch', pf); e.setSetting('disk', 30); e.reset(); inp.codes.clear();
    let n = 0, maxJump = 0, px = e.x;
    while (n < 120 * 120 && e.st !== 'won') { inp.codes.add('ArrowRight'); step(); n++; maxJump = Math.max(maxJump, Math.abs(e.x - px)); px = e.x; }
    out[m + (pf ? '+on' : '+off')] = { won: e.st === 'won', sn: +(n / 120).toFixed(1), ekran: +e.screenT.toFixed(1), kapi: +e.waitT.toFixed(1), maxJump: +maxJump.toFixed(2), cur: e.cur };
  }
  return out;
});
const p = await open(1280, 720);
console.log(JSON.stringify(await bot(p), null, 0).replace(/},/g, '},\n'));
// reset + R
await p.evaluate(() => { window.__exp.setSetting('method', 'kapi'); window.__exp.reset(); });
// tamamlanma kartı gerçek zamanla
await p.evaluate(() => { const e = window.__exp; e.input.codes.clear(); e.setSetting('prefetch', true); e.reset(); e.x = e.goalX - 20; e.cur = 3; e.reg.forEach(r => { r.st = 'yuklu'; r.show = 1; }); });
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(2800); await p.keyboard.up('ArrowRight');
console.log('kart:', await p.evaluate(() => !document.querySelector('.exp-card').hidden), 'completed', await p.evaluate(() => window.__exp.completed));
await p.screenshot({ path: OUT + 'kart.png' });
await p.keyboard.press('r'); await p.waitForTimeout(300);
console.log('R sonrası x/cur/completed', await p.evaluate(() => [window.__exp.x, window.__exp.cur, window.__exp.completed]));
// görüntüler
const shot = async (pg, name, method, tech, x, ms, pf = false) => {
  await pg.evaluate(([m, t, x, pf]) => { const e = window.__exp; e.input.codes.clear(); e.setSetting('method', m); e.setSetting('prefetch', pf); e.setSetting('disk', 30); e.reset(); e.tech = t; e.x = x; e.camera.x = x + 70; }, [method, tech, x, pf]);
  await pg.keyboard.down('ArrowRight'); await pg.waitForTimeout(ms); await pg.keyboard.up('ArrowRight');
  await pg.screenshot({ path: OUT + name + '.png' });
};
await shot(p, 'klasik', 'klasik', false, 330, 2600);
await shot(p, 'kapi', 'kapi', false, 330, 2200);
await shot(p, 'kapi_tech', 'kapi', true, 330, 2200);
await shot(p, 'gecit_tech', 'gecit', true, 380, 2500);
await shot(p, 'asansor_tech', 'asansor', true, 380, 2200);
const m = await open(390, 844, true);
await shot(m, 'm_kapi_tech', 'kapi', true, 330, 2200);
await shot(m, 'm_klasik', 'klasik', false, 330, 2600);
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
