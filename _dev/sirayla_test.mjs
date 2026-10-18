import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const OUT = 'C:/Claude/juit-site/_dev/shots/';
const BASE = 'http://localhost:5181/lab.html#/deney/sirayla';
const b = await chromium.launch({ channel: 'chrome' });
const logs = [];
async function page(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[${w}] PAGEERROR: ${e.message}`));
  return p;
}
const p = await page(1280, 720);
await p.goto(BASE); await p.waitForTimeout(1500);
const res = await p.evaluate(() => {
  const e = window.__exp, inp = e.input; let completes = 0;
  const oc = e.complete.bind(e); e.complete = (o) => { completes++; return oc(o); };
  let ax = 0, ay = 0;
  Object.defineProperty(inp, 'axis', { get: () => ({ x: ax, y: ay }), configurable: true });
  const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame && inp.endFrame(); };
  function bot() {
    const A = e._arena(); let best = -1e9, bx = 0, by = 0;
    for (let k = 0; k < 24; k++) {
      const an = k / 24 * Math.PI * 2, dx = Math.cos(an), dy = Math.sin(an);
      const px = Math.min(A.x1 - 30, Math.max(A.x0 + 30, e.mx + dx * 140)), py = Math.min(A.y1 - 10, Math.max(A.y0 + 50, e.my + dy * 140 * 0.85));
      let sc = 0, mn = 1e9;
      for (const n of e.en) {
        let d = Math.hypot(px - n.x, py - n.y);
        if (n.st === 'prep' || n.st === 'lunge') d *= 0.45;
        else if (n.token) d *= 0.8;
        mn = Math.min(mn, d); sc += Math.min(d, 260) * 0.02;
      }
      sc += mn * 0.1 - Math.hypot(px - A.cx, py - A.cy) * 0.01;
      if (sc > best) { best = sc; bx = dx; by = dy; }
    }
    ax = bx; ay = by;
  }
  function run(queue, n, maxAtk, noBot) {
    e.setSetting('enemies', n); e.setSetting('maxAtk', maxAtk); e.setSetting('queue', queue); e.reset();
    const tries = [];
    for (let i = 0; i < 120 * 90 && tries.length < 5; i++) {
      if (noBot) { ax = 0; ay = 0; } else bot(true);
      const pre = e.st;
      step();
      if (pre === 'play' && e.st === 'dead') tries.push('KO@' + e.t.toFixed(1) + 's/' + e.hits + 'v');
      if (e.st === 'won') { tries.push('KAZANDI vurus=' + e.hits); return tries; }
    }
    return tries;
  }
  const out = {};
  for (const [q, n, m] of [[true, 6, 2], [false, 6, 2], [true, 10, 2], [false, 10, 2], [true, 6, 1], [true, 12, 4]]) out[`q=${q} n=${n} m=${m}`] = run(q, n, m, false);
  out.still_on = run(true, 6, 2, true); out.still_off = run(false, 6, 2, true);
  // complete bir kez?
  e.setSetting('enemies', 6); e.setSetting('maxAtk', 2); e.setSetting('queue', true); e.reset(); completes = 0;
  for (let i = 0; i < 120 * 40; i++) { bot(true); step(); if (e.st === 'dead') break; }
  out.completes = completes; out.completed = e.completed; out.st = e.st;
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log(logs.length ? logs.join('\n') : 'KONSOL TEMIZ');
await b.close();
