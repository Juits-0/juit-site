const { chromium } = require('C:/Claude/UnityProject1/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:5191/lab.html#/deney/ayna');
  await p.waitForFunction(() => window.__exp && window.__exp.renderer, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  const n = () => p.evaluate(() => { const g = s => { const e = document.querySelector(s); return e ? e.children.length : -1; }; const h = document.querySelector('.exp-hud'); return [g('.hud-l'), g('.hud-r'), h ? h.innerText.split(String.fromCharCode(10)).join(' | ').slice(0, 300) : null]; });
  console.log('tech kapalı [sol,sağ]:', await n());
  await p.evaluate(() => { const e = window.__exp; e.mobu.position.set(0, 0, -3.5); });
  await p.waitForTimeout(500);
  console.log('toast:', await p.evaluate(() => document.querySelector('.exp-toast').textContent));
  await p.getByRole('switch', { name: /Teknik görünüm/ }).first().evaluate(x => x.click()); await p.waitForTimeout(600);
  console.log('tech açık [sol,sağ]:', await n());
  await p.screenshot({ path: '_dev/shots/ayna_site.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
