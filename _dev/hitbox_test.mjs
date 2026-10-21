import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const URL = 'http://localhost:5190/lab.html#/deney/hitbox';
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
const wait = ms => new Promise(r => setTimeout(r, ms));
const p = await mkpage(1280, 720);
await p.goto(URL); await p.waitForTimeout(1500);
await p.screenshot({ path: OUT + 'hitbox_desktop.png' });

// ---- gerçek fare: hedef merkezine tıkla ----
const geo = await p.evaluate(() => {
  const e = window.__exp, sh = e._shape(e.time), r = e.container ? null : null;
  const cv = [...document.querySelectorAll('canvas')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0], rc = cv.getBoundingClientRect();
  return { cx: (sh.bb.x0 + sh.bb.x1) / 2, cy: (sh.bb.y0 + sh.bb.y1) / 2, left: rc.left + (rc.width - e.view.w * e.view.scale) / 2, top: rc.top + (rc.height - e.view.h * e.view.scale) / 2, sc: e.view.scale };
});
console.log('geo', JSON.stringify(geo));
const toCss = (x, y, g) => [g.left + x * g.sc, g.top + y * g.sc];
const [mxp, myp] = toCss(geo.cx, geo.cy, geo);
await p.mouse.move(mxp, myp); await p.waitForTimeout(250); console.log('ptr', JSON.stringify(await p.evaluate(()=>{const P=window.__exp.input.pointer;return [P.x,P.y,P.inside]}))); await p.mouse.click(mxp, myp);
await p.waitForTimeout(150);
console.log('fare tıkı sonrası', JSON.stringify(await p.evaluate(() => { const e = window.__exp; return { m: e.nModel, b: e.nBox, x: e.nMiss, last: e.lastShot }; })));
await p.waitForTimeout(900);

// ---- tech: yardım ile düzeltme + hitbox görünsün ----
await p.click('.sw[aria-label="Teknik görünüm"]');
const tech = await p.evaluate(async () => {
  const e = window.__exp; const wait = ms => new Promise(r => setTimeout(r, ms));
  e.setSetting('assist', 0.8); e.setSetting('assistCone', 20); e.setSetting('pad', 12);
  while (e.tg.state !== 'idle') await wait(50);
  await wait(300);
  const T = e.time, sh = e._shape(T);
  const cx = (sh.bb.x0 + sh.bb.x1) / 2, cy = (sh.bb.y0 + sh.bb.y1) / 2;
  // ham ışının model+hitbox'ı ıskaladığı ama yardımla modele giren en küçük açı farkı
  const pv0 = e._pivot(0); let found = null;
  for (let a = -0.75; a <= 0.4; a += 0.001) {
    const pv = e._pivot(a), c0 = e._classify(pv[0] + Math.cos(a) * 44, pv[1] + Math.sin(a) * 44, a, T);
    if (c0.kind !== 'miss') continue;
    const a1 = e._solveAssist(T, a); const pv1 = e._pivot(a1); const c1 = e._classify(pv1[0] + Math.cos(a1) * 44, pv1[1] + Math.sin(a1) * 44, a1, T);
    if (c1.kind === 'model') { found = a; break; }
  }
  e.aimGoal = found ?? 0;
  const ok = e._fire(e.time, found ?? 0);
  await wait(70); const _fz = e.time; Object.defineProperty(e, 'time', { get: () => _fz, set() {}, configurable: true });
  return { found, ok, last: e.lastShot };
});
console.log('tech atış', JSON.stringify(tech));
await p.waitForTimeout(40);
await p.screenshot({ path: OUT + 'hitbox_tech.png' });
await p.evaluate(() => { const e = window.__exp; const v = e.time; delete e.time; e.time = v; });
await p.waitForTimeout(1200);

// ---- bot: 10 vuruşa kadar rastgele nişan; complete tek sefer ----
await p.evaluate(() => { const e = window.__exp; window.__cc = 0; const rc = e._rt.complete.bind(e._rt); e._rt.complete = o => { window.__cc++; return rc(o); }; e.setSetting('assist', 0); e.setSetting('pad', 12); e._zero(); });
const bot = await p.evaluate(async () => {
  const e = window.__exp; const wait = ms => new Promise(r => setTimeout(r, ms));
  let n = 0, seed = 5; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (!e.completed && n < 400) {
    if (e.tg.state === 'idle' && e.time - e.fireT > 0.25) {
      const T = e.time, sh = e._shape(T);
      const x = lerpR(sh.hb.x0 - 25, sh.hb.x1 + 25, R()), y = lerpR(sh.hb.y0 - 25, sh.hb.y1 + 25, R());
      const pv = e._pivot(e.aimA); const a = Math.atan2(y - pv[1], x - pv[0]);
      if (e._fire(T, a)) n++;
    }
    await wait(30);
  }
  function lerpR(a, b, k) { return a + (b - a) * k; }
  await wait(2500);
  return { n, hits: e.hits, model: e.nModel, box: e.nBox, miss: e.nMiss, completed: e.completed, cc: window.__cc };
});
console.log('bot', JSON.stringify(bot));
await p.screenshot({ path: OUT + 'hitbox_complete.png' });
console.log('damga', await p.evaluate(() => localStorage.getItem('juit.lab.stamps')));

// ---- karşılaştır düğmeleri + reduced + yeniden başlat ----
const cmp = await p.evaluate(() => {
  const e = window.__exp, out = {};
  for (const k of ['pad20', 'assist1', 'pad0']) { e.onSetting(k); out[k] = { pad: e.s.pad, as: e.s.assist, cnt: [e.nModel, e.nBox, e.nMiss] }; }
  return out;
});
console.log('karşılaştır', JSON.stringify(cmp));

// ---- hitbox-only görüntüsü (pad 20, kutu göster) ----
const q = await mkpage(1280, 720); await q.goto(URL); await q.waitForTimeout(1500);
const bx = await q.evaluate(async () => {
  const e = window.__exp; const wait = ms => new Promise(r => setTimeout(r, ms));
  e.setSetting('pad', 20); e.setSetting('assist', 0); e.setSetting('showHitbox', true); 
  while (e.tg.state !== 'idle') await wait(50);
  await wait(400);
  const T = e.time; let f = null;
  for (let a = -0.9; a <= 0.6 && f == null; a += 0.0005) { const pv = e._pivot(a), c = e._classify(pv[0] + Math.cos(a) * 44, pv[1] + Math.sin(a) * 44, a, T); if (c.kind === 'box') f = a; }
  e.aimGoal = f; e._fire(e.time, f); await wait(150); const _fz = e.time; Object.defineProperty(e, 'time', { get: () => _fz, set() {}, configurable: true });
  return { f, last: e.lastShot, c: [e.nModel, e.nBox, e.nMiss] };
});
console.log('box', JSON.stringify(bx));
await q.screenshot({ path: OUT + 'hitbox_box.png' });
await q.evaluate(() => { const e = window.__exp; const v = e.time; delete e.time; e.time = v; });
// reduced + R
await q.click('text=Hareketi azalt').catch(()=>{}); await q.keyboard.press('r'); await q.waitForTimeout(300);
console.log('R sonrası', JSON.stringify(await q.evaluate(() => { const e = window.__exp; return { hits: e.hits, reduced: e.reduced, st: e.tg.state }; })));
// ---- mobil ----
const m = await mkpage(390, 844, true);
await m.goto(URL); await m.waitForTimeout(1800);
await m.screenshot({ path: OUT + 'hitbox_mobile.png' });
const mg = await m.evaluate(() => { const e = window.__exp, sh = e._shape(e.time), cv = [...document.querySelectorAll('canvas')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0], rc = cv.getBoundingClientRect(); return { cx: (sh.bb.x0 + sh.bb.x1) / 2, cy: (sh.bb.y0 + sh.bb.y1) / 2, left: rc.left + (rc.width - e.view.w * e.view.scale) / 2, top: rc.top + (rc.height - e.view.h * e.view.scale) / 2, sc: e.view.scale }; });
const [tx, ty] = toCss(mg.cx, mg.cy, mg);
await m.touchscreen.tap(tx, ty); await m.waitForTimeout(300);
console.log('mobil dokunma', JSON.stringify(await m.evaluate(() => { const e = window.__exp; return { m: e.nModel, b: e.nBox, x: e.nMiss }; })), JSON.stringify(mg));
const btn = await m.$$eval('button', bs => bs.map(b => [b.textContent.trim(), Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]).filter(x => /ATEŞ/.test(x[0])));
console.log('ATEŞ düğmesi', JSON.stringify(btn));
await m.waitForTimeout(1000);
await m.screenshot({ path: OUT + 'hitbox_mobile2.png' });
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
