import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const URL = 'http://localhost:5189/lab.html#/deney/iframes';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function open(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PE: ${e.message}`));
  await p.goto(URL); await p.waitForTimeout(1800); return p;
}
const p = await open(1280, 720);
const res = await p.evaluate(() => {
  const e = window.__exp, inp = e.input, out = {};
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); };
  for (const [name, on, kb] of [['iframes_ACIK', true, false], ['iframes_KAPALI', false, false], ['acik+geri_savrulma', true, true], ['kapali+geri_savrulma', false, true]]) {
    e.setSetting('iframes', on); e.setSetting('knockback', kb); e.setSetting('damage', 1); e.reset();
    e.x = 560; e.sim = 1.36; inp.codes.clear();
    for (let i = 0; i < 90; i++) step();   // 0.75 sn, dikenin içinde dur
    out[name] = { hasar: e.dmgTotal, temas: e.contacts, korunan: e.protectedN, hp: e.hp };
  }
  // tam koşu: açık, geri savrulma açık
  e.setSetting('iframes', true); e.setSetting('knockback', true); e.reset(); inp.codes.clear();
  let n = 0;
  while (n < 120 * 200 && !e.completed) {
    inp.codes.add('ArrowRight');
    if (e.st === 'play' && e.grounded) { const hz = e._hazards(); if (hz.some(h => h.cx - e.x > 20 && h.cx - e.x < 150 && h.on)) { inp._p.add('jump'); inp.codes.add('Space'); } }
    if (!e.grounded && e.vy > 0) inp.codes.delete('Space');
    step(); n++;
  }
  out.full = { completed: e.completed, sn: +(n / 120).toFixed(1), olum: e.deaths, hasar: e.dmgTotal, korunan: e.protectedN };
  return out;
});
console.log(JSON.stringify(res, null, 1));
await p.waitForTimeout(1500);
console.log('kart:', await p.evaluate(() => !document.querySelector('.exp-card').hidden));
// görüntüler
await p.evaluate(() => { const e = window.__exp; e.setSetting('iframes', true); e.setSetting('knockback', true); e.reset(); });
const shot = async (pg, name, tech, setup) => {
  await pg.evaluate(([t, s]) => { const e = window.__exp; e.input.codes.clear(); e.setSetting('iframes', true); e.setSetting('knockback', true); e.reset(); e.x = 560; e.sim = 1.5; e.dir = 1; e.camera.x = 560; if (e.tech !== t) document.querySelector('[data-tech], .tech-toggle, #tech')?.click(); }, [tech, 0]);
};
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
