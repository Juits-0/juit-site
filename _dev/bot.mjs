import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const logs = []; p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); }); p.on('pageerror', e => logs.push('PE ' + e.message));
await p.goto('http://localhost:5180/lab.html#/deney/coyote'); await p.waitForTimeout(1500);
const res = await p.evaluate(() => {
  const e = window.__exp, inp = e.input, HALF = 27, out = {};
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); };
  function trial(gapIdx, off, coy) {
    e.setSetting('coyote', coy); e.reset();
    const pl = e.plats[gapIdx]; e.x = pl.x1 - 120; e.y = pl.top; e.vx = 260; e.dir = 1;
    inp.codes.clear(); inp.codes.add('ArrowRight');
    let jumped = false;
    for (let i = 0; i < 1500; i++) {
      if (!jumped && e.x >= pl.x1 + HALF + off) { inp._p.add('jump'); inp.codes.add('Space'); jumped = true; }
      if (jumped && e.jumped && e.vy > 0) inp.codes.delete('Space');
      step();
      if (e.st === 'dead') return false;
      if (e.grounded && e.x > e.plats[gapIdx + 1].x0 + 10 && jumped) return true;
      if (e.st === 'won') return true;
    }
    return false;
  }
  for (const coy of [true, false]) for (let g = 0; g < 5; g++) {
    const ok = []; for (let off = -40; off <= 30; off++) if (trial(g, off, coy)) ok.push(off);
    out[(coy ? 'ON ' : 'OFF ') + 'gap' + g + '=' + [150,200,228,238,244][g]] = ok.length ? `${ok[0]}..${ok[ok.length - 1]} (${ok.length}px)` : 'YOK';
  }
  // tam oyun: coyote açık, her kenarda +8px sonra zıpla
  e.setSetting('coyote', true); e.reset(); inp.codes.clear();
  let steps = 0, jumpedAt = new Set(), cur = e.plats[0];
  while (steps < 60000 && e.st !== 'won' && !e.completed) {
    if (e.grounded) { const q = e.plats.find(q => e.x + HALF > q.x0 && e.x - HALF < q.x1); if (q) cur = q; }
    inp.codes.add('ArrowRight');
    if (e.st === 'play' && cur !== e.plats[5] && e.x >= cur.x1 + HALF + 8 && !jumpedAt.has(cur)) { inp._p.add('jump'); inp.codes.add('Space'); jumpedAt.add(cur); }
    if (e.jumped && e.vy > 0) inp.codes.delete('Space');
    if (e.st === 'dead') { jumpedAt.clear(); cur = e.plats[0]; }
    step(); steps++;
  }
  out.full = { st: e.st, t: +(steps / 120).toFixed(1), deaths: e.deaths, rescued: e.rescued, checks: e.checks.map(c => c.on) };
  return out;
});
console.log(JSON.stringify(res, null, 1));
await p.waitForTimeout(2500);
console.log('kart:', await p.evaluate(() => !document.querySelector('.exp-card').hidden), 'damga:', await p.evaluate(() => localStorage.getItem('juit.lab.stamps')));
await p.screenshot({ path: 'C:/Claude/juit-site/_dev/shots/coyote_complete.png' });
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
