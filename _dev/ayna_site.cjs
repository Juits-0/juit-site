const { chromium } = require('C:/Claude/UnityProject1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  async function run(vw, vh, out, mobile) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.stack));
    page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/404|GPU stall|ReadPixels/.test(t)) errs.push(`[${vw}] ${m.type()}: ${t.slice(0, 200)}`); });
    await page.addInitScript(() => { window.__ctxN = 0; const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { const c = g.call(this, t, ...a); if (c && /webgl/.test(t) && !this.__c) { this.__c = 1; window.__ctxN++; (window.__gls = window.__gls || []).push(c); } return c; }; });
    await page.goto('http://localhost:5191/lab.html#/deney/ayna');
    await page.waitForFunction(() => window.__exp && window.__exp.renderer, null, { timeout: 30000 });
    await page.waitForTimeout(2000);
    const S = (k) => page.evaluate(k);
    console.log(vw, 'settings', await S(() => JSON.stringify(window.__exp.s)));
    // yöntem geçişi (panelden) sahneyi sıfırlamıyor
    await S(() => { const e = window.__exp; e.mobu.position.set(1, 0, 1); e.ball.p.set(3, .35, 0); });
    const labels = await S(() => [...document.querySelectorAll('.panel-body button')].map(b => b.textContent.trim()).filter(Boolean));
    console.log(vw, 'buttons', JSON.stringify(labels));
    if (!mobile) {
      for (const lab of ['Ekran bilgisi (SSR sim.)', 'Ayna kamerası', 'Sabit çevre']) {
        await page.getByRole('button', { name: lab, exact: true }).first().click();
        await page.waitForTimeout(400);
        console.log('method ->', await S(() => JSON.stringify({ m: window.__exp.method, mobu: window.__exp.mobu.position.toArray(), ball: window.__exp.ball.p.toArray() })));
      }
      await page.evaluate(() => [...document.querySelectorAll('.btn-set')].find(b => /Haritayı/.test(b.textContent)).click());
      await page.waitForTimeout(300);
    } else {
      await page.screenshot({ path: out.replace('.png', '_a.png') });
    }
    await page.screenshot({ path: out });
    // teknik görünüm
    const techBtn = page.getByRole('switch', { name: /Teknik görünüm/ });
    if (await techBtn.count()) { await techBtn.first().evaluate(b => b.click()); await page.waitForTimeout(800); console.log(vw, 'tech', await S(() => window.__exp.tech)); await page.screenshot({ path: out.replace('.png', '_tech.png') }); }
    else console.log(vw, 'tech switch bulunamadı');
    // yeniden başlat
    await S(() => { const e = window.__exp; e.mobu.position.set(5, 0, 5); });
    const rb = page.getByRole('button', { name: /Yeniden başlat/ });
    if (await rb.count()) { await rb.first().evaluate(b => b.click()); await page.waitForTimeout(300); console.log(vw, 'restart mobu', await S(() => JSON.stringify(window.__exp.mobu.position.toArray()))); }
    // gir/çık x3
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { location.hash = '#/'; });
      await page.waitForTimeout(800);
      await page.evaluate(() => { location.hash = '#/deney/ayna'; });
      await page.waitForFunction(() => window.__exp && window.__exp.renderer, null, { timeout: 30000 });
      await page.waitForTimeout(800);
    }
    console.log(vw, 'webgl getContext toplam (lab dahil):', await S(() => window.__ctxN), 'canlı (kaybolmamış) context:', await S(() => window.__gls.filter(g => !g.isContextLost()).length), 'canvas #exp:', await S(() => [...document.querySelectorAll('#exp canvas')].map(c => c.className || c.parentElement.className).join('|')));
    await ctx.close();
  }
  await run(1280, 720, '_dev/shots/ayna_site.png', false);
  await run(390, 844, '_dev/shots/ayna_site_mobile.png', true);
  console.log(errs.join('\n') || 'no console errors');
  await browser.close();
})();
