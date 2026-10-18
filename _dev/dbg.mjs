import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto('http://localhost:5180/lab.html#/deney/coyote'); await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const e = window.__exp, inp = e.input, HALF = 27, log = [];
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); };
  e.setSetting('coyote', true); e.reset();
  const pl = e.plats[1]; e.x = pl.x1 - 120; e.y = pl.top; e.vx = 260; inp.codes.clear(); inp.codes.add('ArrowRight');
  let j = false;
  for (let i = 0; i < 260; i++) {
    if (!j && e.x >= pl.x1 + HALF + 10) { inp._p.add('jump'); inp.codes.add('Space'); j = true; log.push('PRESS'); }
    step(); if(i>50&&i%6==0||i<0) log.push([i, e.x.toFixed(1), e.y.toFixed(1), e.vy.toFixed(0), e.grounded, e.fromEdge, e.jumped, e.airT.toFixed(3), e.coyoteWin, e.st].join(' '));
  }
  return log.join('\n') + '\ncoy=' + e.s.coyote + ' ms=' + e.s.coyoteMs;
}));
await b.close();
