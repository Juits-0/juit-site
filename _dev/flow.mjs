import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const BASE = (process.env.BASE || 'http://localhost:5180') + '/lab.html';
const b = await chromium.launch({ channel: 'chrome' });
const logs = []; const ok = [];
const chk = (n, v) => { ok.push((v ? 'OK   ' : 'FAIL ') + n); };
async function mk(w, h, mobile, stamps) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  if (stamps) await ctx.addInitScript(s => { try { if (!localStorage.getItem('juit.lab.stamps')) localStorage.setItem('juit.lab.stamps', s); } catch (_) {} }, JSON.stringify(stamps));
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PAGEERROR: ${e.message}`));
  return p;
}
// ---- masaüstü ----
let p = await mk(1280, 720, false, { sirayla: 1, coyote: 2, lod: 3 });
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200);
await p.evaluate(() => { window.__xs = []; const f = () => { window.__xs.push(window.__lab.m.x); requestAnimationFrame(f); }; f(); });
await p.keyboard.press('KeyE'); await p.waitForTimeout(1100);
await p.keyboard.press('KeyE'); await p.waitForTimeout(1500);
await p.screenshot({ path: OUT + 'lab2_desktop.png' });
chk('Q/E ile 2. istasyona yürüdü', await p.evaluate(() => __lab.near === 1));
// zoom/giriş
await p.keyboard.press('Enter');
await p.waitForTimeout(420); await p.screenshot({ path: OUT + 'lab2_zoom_a.png' });
await p.waitForTimeout(260); await p.screenshot({ path: OUT + 'lab2_zoom.png' });
await p.waitForTimeout(1500);
chk('giriş: hash deney', (await p.evaluate(() => location.hash)).startsWith('#/deney/gorus'));
const panelH = await p.evaluate(() => document.querySelector('.exp-panel').getBoundingClientRect().height);
chk('panel ≤ 135px (' + Math.round(panelH) + ')', panelH <= 135);
await p.click('[data-a=help]'); await p.waitForTimeout(200); await p.screenshot({ path: OUT + 'lab2_help.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
chk('Esc yardımı kapattı', await p.evaluate(() => document.querySelector('.exp-help').hidden));
// damga kazanılmış gibi → Esc ile dön → kutlama
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('juit.lab.stamps') || '{}'); s.gorus = Date.now(); localStorage.setItem('juit.lab.stamps', JSON.stringify(s)); });
await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.screenshot({ path: OUT + 'lab2_back.png' });
await p.waitForTimeout(1100);
chk('Esc ile lab', await p.evaluate(() => location.hash === '#/' && document.getElementById('exp').classList.contains('hidden')));
chk('kutlama tetiklendi', await p.evaluate(() => __lab.time - __lab.celeT < 1.7));
await p.screenshot({ path: OUT + 'lab2_celebrate.png' });
// Hatıralar
await p.click('.lab-count'); await p.waitForTimeout(250); await p.screenshot({ path: OUT + 'lab2_stamps.png' });
await p.click('[data-a=smreset]'); await p.waitForTimeout(100);
chk('onay sorusu', await p.evaluate(() => !document.querySelector('.sm-confirm').hidden));
await p.click('[data-a=smno]'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
chk('modal kapandı', await p.evaluate(() => document.querySelector('.stamp-modal').hidden));
// tıklayarak istasyon + uyku
await p.mouse.click(640, 330); await p.waitForTimeout(3600);
chk('istasyona tıklama → deney', (await p.evaluate(() => location.hash)).startsWith('#/deney/'));
await p.goBack(); await p.waitForTimeout(1600);
await p.waitForTimeout(7000);
const xs = await p.evaluate(() => window.__xs); let mx = 0; for (let i = 1; i < xs.length; i++) mx = Math.max(mx, Math.abs(xs[i] - xs[i - 1]));
chk('Mobu kare sıçraması ≤ 45 (' + mx.toFixed(1) + ')', mx <= 45);
// reduced
await p.evaluate(() => localStorage.setItem('juit.lab.reduced', 'true')); await p.reload(); await p.waitForTimeout(1200);
await p.keyboard.press('Digit4'); await p.waitForTimeout(700);
chk('reduced: doğrudan giriş', (await p.evaluate(() => location.hash)).startsWith('#/deney/yonlendirme'));
await p.evaluate(() => localStorage.removeItem('juit.lab.reduced'));
// ---- mobil ----
let m = await mk(390, 844, true, { sirayla: 1, coyote: 2 });
await m.goto(BASE, { waitUntil: 'domcontentloaded' }); await m.waitForTimeout(1400);
await m.screenshot({ path: OUT + 'lab2_mobile_a.png' });
// 1. istasyonun monitörüne dokun → yürü ve gir
const pos = await m.evaluate(() => { const l = __lab, v = l.view; return [(300 - l.cam.x) * v.scale + v.ox + v.cssW * 0, 0]; });
await m.evaluate(() => { __lab.goTo('gorus', { arrive: true }); }); await m.waitForTimeout(1500);
await m.screenshot({ path: OUT + 'lab2_mobile.png' });
const chipPx = await m.evaluate(() => __lab._chipSize() * 1.9 * __lab.view.scale);
chk('GİR çipi ≥ 44 css px (' + Math.round(chipPx) + ')', chipPx >= 44);
const stripBox = await m.evaluate(() => { const s = document.querySelector('.lab-strip'), r = s.getBoundingClientRect(); const rows = new Set([...s.children].map(c => c.offsetTop)).size; return { h: Math.round(r.height), rows, bottom: Math.round(innerHeight - r.bottom) }; });
chk('şerit tek satır (' + JSON.stringify(stripBox) + ')', stripBox.rows === 1);
const cv = await m.evaluate(() => { const l = __lab, v = l.view, x = (l.m.x - l.cam.x) * l.cam.z * v.scale + v.cssW / 2; return Math.round(x); });
await m.touchscreen.tap(195, 300); await m.waitForTimeout(3500);
chk('mobil: istasyona dokun → gir', (await m.evaluate(() => location.hash)).startsWith('#/deney/'));
await m.screenshot({ path: OUT + 'lab2_mobile_exp.png' });
console.log(ok.join('\n')); console.log(logs.length ? logs.join('\n') : 'KONSOL TEMIZ');
await b.close();
