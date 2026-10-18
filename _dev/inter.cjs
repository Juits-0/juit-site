const { chromium } = require('C:/Claude/UnityProject1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.stack));
  page.on('console', (m) => { const t = m.text(); if ((m.type()==='error'||m.type()==='warning') && !/404/.test(t)) errs.push(t); });
  await page.goto('http://localhost:5182/_dev/ayna.html?method=planar');
  await page.waitForFunction(() => window.__exp, null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  const st = () => page.evaluate(() => { const e = window.__exp; return JSON.stringify({yaw: +e.cam.yaw.toFixed(2), pitch: +e.cam.pitch.toFixed(2), dist: +e.cam.dist.toFixed(2), ball: e.ball.p.toArray().map(v=>+v.toFixed(2)), mobu: e.mobu.position.toArray().map(v=>+v.toFixed(2))}); });
  console.log('start', await st());
  await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(800, 330, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(300); console.log('after drag', await st());
  await page.mouse.wheel(0, -400); await page.waitForTimeout(300); console.log('after wheel', await st());
  // topa yürü ve it: Mobu (0,3) top (2.6,1.8)
  await page.evaluate(() => { const e = window.__exp; e.cam.yaw = 0; e.cam.cyaw = 0; e.mobu.position.set(1.4, 0, 2.2); });
  await page.keyboard.press('e'); await page.waitForTimeout(1200); console.log('after kick', await st());
  // mirrorRes değişimi + yöntem döngüsü
  for (const r of ['256', '1024', '512']) for (const m of ['planar', 'ssr', 'bake']) { await page.evaluate(([r, m]) => { window.__set('mirrorRes', r); window.__set('method', m); }, [r, m]); await page.waitForTimeout(250); }
  await page.evaluate(() => window.__exp.onSetting('rebake'));
  await page.evaluate(() => window.__set('pendulum', false)); await page.waitForTimeout(300);
  await page.evaluate(() => window.__set('pendulum', true));
  await page.setViewportSize({ width: 600, height: 900 }); await page.waitForTimeout(500);
  await page.screenshot({ path: '_dev/shots/ayna_mobile.png' });
  const info = await page.evaluate(() => { const e = window.__exp; return JSON.stringify({geo: e.renderer.info.memory, ft: e.ft.length}); });
  console.log('mem', info);
  await page.evaluate(() => window.__exp.dispose());
  console.log('canvas after dispose:', await page.evaluate(() => document.querySelectorAll('#stage canvas').length));
  console.log(errs.join('\n') || 'no errors');
  await browser.close();
})();
