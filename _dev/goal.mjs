import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
for (const [w, h, mob, tag] of [[390, 844, true, 'mobile'], [1280, 720, false, 'desktop']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mob ? 2 : 1, hasTouch: mob, isMobile: mob });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${tag}] ${m.text().slice(0, 160)}`); }); p.on('pageerror', e => logs.push(`[${tag}] PE ${e.message}`));
  for (const id of ['coyote', 'chunk', 'ayna']) {
    await p.goto(`http://localhost:5180/lab.html#/deney/${id}`, { waitUntil: 'domcontentloaded' }); await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    if (id === 'coyote') await p.click('.sw[aria-label="Teknik görünüm"]', { force: true }).catch(() => {});
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const g = document.querySelector('.exp-goal').getBoundingClientRect(), s = document.querySelector('.exp-stage').getBoundingClientRect(), hud = document.querySelector('.exp-hud'); return { goalBottom: Math.round(g.bottom), stageTop: Math.round(s.top), goalH: Math.round(g.height), hudHidden: hud.hidden }; });
    console.log(tag, id, JSON.stringify(r), r.goalBottom <= r.stageTop ? 'OK' : 'ÖRTÜYOR');
    if (id === 'coyote') await p.screenshot({ path: OUT + `runner_goal_${tag}.png` });
    if (id !== 'coyote') await p.screenshot({ path: OUT + `runner_goal_${tag}_${id}.png` });
  }
  await p.waitForTimeout(3200);
  console.log(tag, 'mini:', await p.evaluate(() => document.querySelector('.exp-goal').classList.contains('mini')));
}
console.log(logs.join('\n') || 'KONSOL TEMIZ');
await b.close();
