import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function run(w, h, out, mobile) {
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:5190/lab.html#/deney/lod');
  await p.waitForTimeout(3000);
  const st = () => p.evaluate(() => { const e = window.__exp; return e && { yaw: e.yaw, dist: e.dist, t: [e.target.x, e.target.z], hud: document.body.innerText.match(/Çizilen üçgen: [\d\s\u00a0]+/)?.[0] }; });
  console.log(out, 'start', JSON.stringify(await st()));
  if (!mobile) {
    await p.mouse.move(640, 300); await p.mouse.down(); await p.mouse.move(740, 330, { steps: 5 }); await p.mouse.up();
    await p.mouse.wheel(0, 300); await p.waitForTimeout(300);
    await p.keyboard.down('w'); await p.waitForTimeout(600); await p.keyboard.up('w');
    await p.waitForTimeout(500);
    console.log(out, 'after input', JSON.stringify(await st()));
  }
  await p.screenshot({ path: 'C:/Claude/juit-site/_dev/shots/' + out + '.png' });
  console.log(out, 'errors:', logs.join(' | ') || 'none');
  await p.close();
}
await run(1280, 720, 'lod_site', false);
await run(390, 844, 'lod_site_mobile', true);
await b.close();
