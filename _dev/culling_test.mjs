import { createRequire } from 'module';
const require = createRequire('C:/Claude/UnityProject1/package.json');
const { chromium } = require('playwright');
const url = 'http://localhost:5183/lab.html#/deney/culling';
const b = await chromium.launch({ channel: 'chrome' });
async function run(w, h, tag) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PE ' + e.message));
  await p.goto(url); await p.waitForTimeout(1500);
  await p.screenshot({ path: `_dev/culling_${tag}_off.png` });
  // yük taraması
  const res = await p.evaluate(async () => {
    const e = window.__exp, out = {};
    const sample = async (name) => {
      let mx = 0, sum = 0, n = 0;
      for (let x = 110; x <= 1540; x += 60) { for (const dir of [0, Math.PI]) {} e.x = x; e.y = 430; e.aimA = 0; e._aim(0.0001, e.time, e.input); e._cull(true); mx = Math.max(mx, e.load); sum += e.load; n++; }
      out[name] = { avg: +(sum / n).toFixed(0), max: +mx.toFixed(0), N: e.objs.length };
    };
    e.setSetting('frustum', false); e.setSetting('occl', false); await sample('off');
    e.setSetting('frustum', true); await sample('frustum');
    e.setSetting('occl', true); await sample('both');
    e.setSetting('frustum', false); await sample('occlOnly');
    e.setSetting('frustum', true); e.setSetting('fov', 140); e.setSetting('far', 700); await sample('maxcone');
    e.setSetting('fov', 100); e.setSetting('far', 480);
    return out;
  });
  console.log(tag, JSON.stringify(res));
  await p.evaluate(() => { const e = window.__exp; e.setSetting('frustum', true); e.setSetting('occl', true); e.x = 760; e.y = 430; e.aimA = 0; e.strikes = 0; e.tech = true; e.onTech(true); });
  await p.keyboard.press('t'); // olası tech kısayolu değilse zararsız
  await p.waitForTimeout(300);
  await p.screenshot({ path: `_dev/culling_${tag}_on.png` });
  console.log(tag, 'errors', errs.length, errs.slice(0, 3));
  await p.close();
}
await run(1280, 720, 'd'); await run(390, 844, 'm');
await b.close();
