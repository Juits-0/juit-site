// Site taraması: her rota + her deney, masaüstü ve mobilde taşma / ekran dışı öğe / konsol hatası.
const { chromium } = require('C:/Claude/UnityProject1/node_modules/playwright');
const BASE = process.argv[2] || 'http://localhost:5173';
const routes = ['', 'mobu', 'arcade', 'lab', 'about', 'cekmece'];
const exps = ['sirayla','gorus','coyote','yonlendirme','chunk','odul','boss','zaman','hitbox','iframes','lod','ayna','duvar','yukleme','culling'];
const sizes = { d: { width: 1280, height: 720 }, m: { width: 375, height: 812, isMobile: true, hasTouch: true } };
const check = () => {
  const W = innerWidth, out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' && el.closest('.mobu-layer')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.closest('[hidden],.intro')) continue;
    let p = el.parentElement, clipped = false;
    while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') { clipped = true; break } p = p.parentElement }
    if (clipped) continue;
    if (r.right > W + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]} [${Math.round(r.left)},${Math.round(r.right)}] "${(el.textContent||'').trim().slice(0,30)}"`);
  }
  return { sw: document.documentElement.scrollWidth, W, out: out.slice(0, 6) };
};
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const [k, vp] of Object.entries(sizes)) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('juit-intro-seen', '1'); localStorage.setItem('juit-intro-seen', '1') } catch {} });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) }); pg.on('pageerror', e => errs.push('PAGE ' + e.message.slice(0, 120)));
    const urls = [...routes.map(r => `${BASE}/#/${r}`), ...exps.map(e => `${BASE}/lab.html#/deney/${e}`), `${BASE}/lab.html#/`];
    for (const u of urls) {
      errs.length = 0; await pg.goto(u); await pg.waitForTimeout(u.includes('lab.html') ? 2500 : 1800);
      await pg.mouse.wheel(0, 3000); await pg.waitForTimeout(400);
      const r = await pg.evaluate(check);
      const bad = r.sw > r.W + 1 || r.out.length || errs.length;
      console.log(`${k} ${bad ? 'XX' : 'ok'} ${u.replace(BASE, '')} sw=${r.sw}/${r.W}${r.out.length ? '\n   ' + r.out.join('\n   ') : ''}${errs.length ? '\n   ERR ' + errs.join('\n   ERR ') : ''}`);
      if (process.argv[3]) await pg.screenshot({ path: `C:/Claude/juit-site/_dev/shots/audit_${k}_${u.replace(BASE, '').replace(/[^\w]+/g, '_')}.png` });
    }
    await ctx.close();
  }
  await b.close();
})();
