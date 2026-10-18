import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const URL = 'http://localhost:5188/lab.html#/deney/hitbox';
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function mkpage(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PAGEERROR: ${e.message}`));
  return p;
}
const p = await mkpage(1280, 720);
await p.goto(URL); await p.waitForTimeout(1500);
await p.screenshot({ path: OUT + 'hitbox_desktop.png' });

// --- gerçek fare ile tek atış (iç hat) ---
const real = await p.evaluate(() => {
  const e = window.__exp; const sh = e._shape(e.time); const c = e.worldToView((sh.bb.x0 + sh.bb.x1) / 2, (sh.bb.y0 + sh.bb.y1) / 2);
  return { c, n: e.shots.length };
});
console.log('merkez view', JSON.stringify(real));

// --- sınıflandırma sondası: bbox içinde bir hitbox-only açısı bul ---
const probe = await p.evaluate(() => {
  const e = window.__exp, T = e.time;
  e.setSetting('pad', 12);
  const sh = e._shape(T), pv = e._pivot(0);
  const out = { model: 0, box: 0, miss: 0 }; let boxA = null, modelA = null, missA = null;
  for (let a = -0.9; a <= 0.6; a += 0.0005) {
    const aa = Math.max(-80 * Math.PI / 180, Math.min(40 * Math.PI / 180, a)); const pv2 = e._pivot(aa);
    const ox = pv2[0] + Math.cos(aa) * 44, oy = pv2[1] + Math.sin(aa) * 44;
    const c = e._classify(ox, oy, aa, T); out[c.kind]++;
    if (c.kind === 'box' && boxA == null) boxA = aa; if (c.kind === 'model' && modelA == null) modelA = aa; if (c.kind === 'miss' && missA == null) missA = aa;
  }
  return { out, boxA, modelA, missA };
});
console.log('probe', JSON.stringify(probe));
await p.click('.sw[aria-label="Teknik görünüm"]');
await p.waitForTimeout(200);
// ateş sırası: model, hitbox-only, ıska (gerçek _fire üzerinden)
const seq = await p.evaluate(async () => {
  const e = window.__exp, res = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tgtState = () => e.tg.state;
  const find = kind => { const T = e.time; for (let a = -0.9; a <= 0.6; a += 0.0005) { const pv = e._pivot(a); const c = e._classify(pv[0] + Math.cos(a) * 44, pv[1] + Math.sin(a) * 44, a, T); if (c.kind === kind) return a; } return null; };
  for (const kind of ['miss', 'box', 'model']) {
    while (e.tg.state !== 'idle') await wait(50);
    await wait(260);
    const a = find(kind); const ok = e._fire(e.time, a);
    res.push({ want: kind, fired: ok, got: e.lastShot && e.lastShot.kind, counts: [e.nModel, e.nBox, e.nMiss] });
    if (kind === 'box') { await wait(90); window.__shotReady = 1; await wait(500); }
  }
  return res;
});
console.log('seq', JSON.stringify(seq));
