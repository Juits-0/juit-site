const { chromium } = require('C:/Claude/UnityProject1/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const url = 'http://localhost:5181/lab.html#/deney/duvar';
  const errs = [];
  async function open(w, h) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('console', m => { if (m.type() === 'error') errs.push(w + ': ' + m.text()); });
    p.on('pageerror', e => errs.push(w + ' PE: ' + e.message));
    await p.goto(url); await p.waitForTimeout(1200); return p;
  }
  const hold = async (p, key, cond, max = 6000) => {
    await p.keyboard.down(key); const t0 = Date.now();
    while (Date.now() - t0 < max && !(await p.evaluate(cond))) await p.waitForTimeout(60);
    await p.keyboard.up(key);
  };
  let p = await open(1280, 720);
  await p.screenshot({ path: '_dev/duvar_d_start.png' });
  // bot: dört kenar
  await hold(p, 'ArrowUp', () => window.__exp.found[0]);
  await p.waitForTimeout(200); await p.screenshot({ path: '_dev/duvar_d_gorunmez.png' });
  await p.waitForTimeout(900);
  await hold(p, 'ArrowRight', () => window.__exp.found[2]);
  await hold(p, 'ArrowDown', () => window.__exp.found[1]);
  await hold(p, 'ArrowLeft', () => window.__exp.found[3]);
  await p.waitForTimeout(300);
  console.log('found', await p.evaluate(() => [window.__exp.found, window.__exp.nFound, window.__exp.won]));
  await p.waitForTimeout(2000);
  await p.screenshot({ path: '_dev/duvar_d_complete.png' });
  console.log('completed', await p.evaluate(() => window.__exp.completed));
  await p.keyboard.press('r'); await p.waitForTimeout(300);
  console.log('after R', await p.evaluate(() => [window.__exp.nFound, window.__exp.completed, window.__exp.x, window.__exp.y]));
  // beton
  await p.evaluate(() => window.__exp.setSetting('mode', 'concrete'));
  await p.waitForTimeout(1500);
  await hold(p, 'ArrowUp', () => window.__exp.found[0]); await p.waitForTimeout(350);
  await p.screenshot({ path: '_dev/duvar_d_beton.png' });
  // sınır yok + dekor arkası
  await p.keyboard.press('r');
  await p.evaluate(() => { window.__exp.setSetting('mode', 'none'); });
  await p.waitForTimeout(1200);
  await hold(p, 'ArrowRight', () => window.__exp.x > 880, 8000);
  await p.waitForTimeout(150); await p.screenshot({ path: '_dev/duvar_d_none.png' });
  await hold(p, 'ArrowRight', () => window.__exp.st === 'fall', 5000);
  await p.waitForTimeout(500); await p.screenshot({ path: '_dev/duvar_d_fall.png' });
  await p.waitForTimeout(1000);
  console.log('after fall', await p.evaluate(() => [window.__exp.st, window.__exp.falls, window.__exp.x]));
  await p.evaluate(() => { window.__exp.setSetting('mode', 'invisible'); window.__exp.setSetting('back', true); });
  await p.waitForTimeout(1200); await p.screenshot({ path: '_dev/duvar_d_back.png' });
  await p.evaluate(() => { window.__exp.setSetting('back', false); 0; });
  await p.waitForTimeout(500);
  await p.getByText('Teknik görünüm').click(); await p.waitForTimeout(700);
  await p.screenshot({ path: '_dev/duvar_d_tech.png' });
  await p.close();
  p = await open(390, 844);
  await hold(p, 'ArrowUp', () => window.__exp.found[0]); await p.waitForTimeout(250);
  await p.screenshot({ path: '_dev/duvar_m.png' });
  await p.getByText('Teknik görünüm').click().catch(()=>{}); await p.waitForTimeout(500); await p.screenshot({ path: '_dev/duvar_m_tech.png' });
  console.log('errors', errs);
  await b.close();
})();
