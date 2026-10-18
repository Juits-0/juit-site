const { chromium } = require('C:/Claude/UnityProject1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.stack));
  page.on('console', (m) => { const t = m.text(); if (m.type()==='error' && !/404/.test(t)) errs.push(t); if (/\[ayna\]/.test(t) && !/audio/.test(t)) console.log(t); });
  await page.goto('http://localhost:5182/_dev/ayna.html?method=bake&tech=1');
  await page.waitForFunction(() => window.__exp, null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  for (const m of ['bake', 'ssr', 'planar']) {
    await page.evaluate((m) => window.__set('method', m), m);
    await page.waitForTimeout(300);
    await page.evaluate(() => { const e = window.__exp; e.mobu.position.set(0, 0, -3.5); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const e = window.__exp; e.mobu.position.set(0, 0, 2); e.cam.yaw = 1.3; });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const e = window.__exp; e.ball.p.set(7.5, .35, -4); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const e = window.__exp; e.cam.yaw = 0; e.ball.p.set(2.6,.35,1.8); });
    await page.waitForTimeout(600);
  }
  console.log('completed:', await page.evaluate(() => JSON.stringify(window.__completed)));
  console.log('hud right:', await page.evaluate(() => JSON.stringify(window.__hud.right)));
  console.log(errs.join('\n') || 'no errors');
  await browser.close();
})();
