import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const URL = 'http://localhost:5183/lab.html#/deney/yonlendirme';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function page(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PE ${e.message}`)); return p;
}
const p = await page(1280, 720);
await p.goto(URL); await p.waitForTimeout(1500);
await p.evaluate(() => window.__exp.setSetting && 0);
// bot: kapıya git (yanlış kapıya da çarp ilk turda)
const run = (mode, wrongFirst) => p.evaluate(({ mode, wrongFirst }) => {
  const e = window.__exp, inp = e.input, out = { times: [], wrong: 0 };
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); };
  e.completed = false; e.onSetting(mode); let completes = 0; const oc = e.complete.bind(e); e.complete = o => { completes++; return oc(o); };
  const D = [[0, -1, 'ArrowUp'], [1, 0, 'ArrowRight'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft']];
  let n = 0, lastRound = 0, wf = wrongFirst;
  while (n < 120000 && !e.completed) {
    inp.codes.clear();
    if (e.st === 'play') {
      let tgt = e.exit; if (wf && e.round === 0) tgt = (e.exit + 1) % 4;
      if (wf && e.round === 0 && e.wrong >= 1) wf = false;
      const d = D[tgt]; const along = e.x * d[0] + e.y * d[1];
      // önce merkeze hizalan
      const perp = d[0] ? e.y : e.x;
      if (Math.abs(perp) > 6 && along < 60) inp.codes.add(d[0] ? (e.y > 0 ? 'ArrowUp' : 'ArrowDown') : (e.x > 0 ? 'ArrowLeft' : 'ArrowRight'));
      else inp.codes.add(d[2]);
    }
    step(); n++;
  }
  out.sec = n / 120; out.completes = completes; out.wrong = e.wrong; out.res = JSON.parse(JSON.stringify(e.res));
  return out;
}, { mode, wrongFirst });
console.log('off', JSON.stringify(await run('tryOff', true)));
await p.screenshot({ path: OUT + 'yonlendirme_tmp.png' });
console.log('on', JSON.stringify(await run('tryOn', false)));
// görüntüler
await p.goto('about:blank'); await p.goto(URL); await p.waitForTimeout(1500);
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight'); await p.waitForTimeout(100);
await p.evaluate(() => { const e = window.__exp; e.x = 0; e.y = 0; e.vx = 0; e.vy = 0; });
await p.waitForTimeout(300);
await p.screenshot({ path: OUT + 'yonlendirme_desktop.png' });
await p.evaluate(() => window.__exp.setSetting('tech', true));
await p.evaluate(() => { const e = window.__exp; e.tech = true; });
await p.waitForTimeout(300); await p.screenshot({ path: OUT + 'yonlendirme_tech.png' });
await p.evaluate(() => { const e = window.__exp; e.tech = false; ['light','color','composition','motion'].forEach(k => e.setSetting(k, false)); });
await p.waitForTimeout(300); await p.screenshot({ path: OUT + 'yonlendirme_off.png' });
const m = await page(390, 844, true);
await m.goto(URL); await m.waitForTimeout(1800);
await m.screenshot({ path: OUT + 'yonlendirme_mobile.png' });
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
