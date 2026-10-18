const { chromium } = require('C:/Claude/UnityProject1/node_modules/playwright');
(async () => {
  const args = process.argv.slice(2);
  const tech = args.includes('tech');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /ayna/.test(t)) errs.push(m.type() + ': ' + t); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  const methods = ['bake', 'ssr', 'planar'];
  for (const m of methods) {
    await page.goto('http://localhost:5182/_dev/ayna.html?method=' + m + (tech ? '&tech=1' : ''));
    await page.waitForFunction(() => window.__exp, null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    // sahneyi canlandır: Mobu aynaya doğru yürüsün, top iç
    await page.keyboard.down('a'); await page.waitForTimeout(900); await page.keyboard.up('a'); await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `_dev/shots/ayna_${m}${tech ? '_tech' : ''}.png` });
  }
  console.log(errs.join('\n') || 'no console issues');
  await browser.close();
})();
