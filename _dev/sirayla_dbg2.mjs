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
    const thr = e.en.filter(n => n.st === 'prep' || n.st === 'lunge');
    for (let k = -1; k < 24; k++) {
      const an = k / 24 * Math.PI * 2, dx = k < 0 ? 0 : Math.cos(an), dy = k < 0 ? 0 : Math.sin(an);
      let danger = 0;
      for (const n of thr) {
        const rem = n.st === 'prep' ? 0.35 - n.t : 0;
        let q = { x: e.mx + dx * 200 * rem, y: e.my + dy * 200 * 0.85 * rem };
        q.x = Math.min(A.x1 - 24, Math.max(A.x0 + 24, q.x)); q.y = Math.min(A.y1 - 6, Math.max(A.y0 + 44, q.y));
        let ux, uy;
        if (n.st === 'lunge') { ux = n.ax; uy = n.ay; } else { const ddx = q.x - n.x, ddy = q.y - n.y, dd = Math.hypot(ddx, ddy) || 1; ux = ddx / dd; uy = ddy / dd; }
        const lt = n.st === 'lunge' ? 0.2 - n.t : 0.2;
        let ex = n.x - (n.st === 'prep' ? ux * 16 : 0), ey = n.y - (n.st === 'prep' ? uy * 16 : 0), mx = q.x, my = q.y;
        for (let t = 0; t < lt; t += 0.01) {
          ex += ux * 520 * 0.01; ey += uy * 520 * 0.01;
          mx = Math.min(A.x1 - 24, Math.max(A.x0 + 24, mx + dx * 200 * 0.01)); my = Math.min(A.y1 - 6, Math.max(A.y0 + 44, my + dy * 200 * 0.85 * 0.01));
          if (Math.hypot(mx - ex, my - ey) < 56) { danger += 1; break; }
        }
      }
      // yakin kovalayanlardan uzak dur
      const px = Math.min(A.x1 - 30, Math.max(A.x0 + 30, e.mx + dx * 100)), py = Math.min(A.y1 - 10, Math.max(A.y0 + 50, e.my + dy * 100 * 0.85));
      let mn = 1e9; for (const n of e.en) { let d = Math.hypot(px - n.x, py - n.y); if (n.token) d *= 0.85; mn = Math.min(mn, d); }
      const sc = -danger * 1000 + Math.min(mn, 200) - Math.hypot(px - A.cx, py - A.cy) * (window.__cw || 0.15) + (k < 0 ? -8 : 0);
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
  function hitsIn20(queue, n, maxAtk, noBot) {
    e.setSetting('enemies', n); e.setSetting('maxAtk', maxAtk); e.setSetting('queue', queue); e.reset();
    for (let i = 0; i < 120 * 23 && e.st === 'play'; i++) { e.hp = 99; if (noBot) { ax = 0; ay = 0; } else bot(); step(); }
    return e.hits;
  }
  const dbg=[]; const oh=e._hit.bind(e); e._hit=(n)=>{ const A=e._arena(); dbg.push([e.t.toFixed(1), "wall", Math.round(Math.min(e.mx-A.x0,A.x1-e.mx,e.my-A.y0,A.y1-e.my)), "thr", e.en.filter(x=>x.st==="prep"||x.st==="lunge").length, "spd", e.speed.toFixed(1), "prepT", (n.px!==undefined)]); oh(n); };
  const ev=[]; const oh2=e._hit.bind(e); e._hit=(n)=>{const A=e._arena();ev.push([JSON.stringify(e.en.filter(x=>x.st==='prep'||x.st==='lunge').map(x=>[x.i,x.st,Math.round(x.x-e.mx),Math.round(x.y-e.my),+x.t.toFixed(2),'hitter',x===n])),+e.t.toFixed(1),'w'+Math.round(Math.min(e.mx-A.x0,A.x1-e.mx,e.my-A.y0,A.y1-e.my)),'thr'+e.en.filter(x=>x.st==='prep'||x.st==='lunge').length,'slotted'+e.en.filter(x=>x.st==='slot').length]);oh2(n);};
  hitsIn20(true,6,2,false); return {ev}; });
console.log(JSON.stringify(res)); await b.close();