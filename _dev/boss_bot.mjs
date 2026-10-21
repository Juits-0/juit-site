import { createRequire } from 'node:module';
const require = createRequire('C:/Claude/UnityProject1/node_modules/');
const { chromium } = require('playwright');
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const logs = []; p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); }); p.on('pageerror', e => logs.push('PE ' + e.message));
await p.goto('http://localhost:5186/lab.html#/deney/boss'); await p.waitForTimeout(1500);
const res = await p.evaluate(() => {
  const e = window.__exp, inp = e.input, out = {};
  const X_MIN = 67, X_MAX = 480 - 120 - 27, BX = 480, F0 = 320, F1 = 20;
  const ACT = { sweep: .35, shock: .5 };
  function run(signals, windup, nAtt, untilWin, reactT = 0.2) {
    e.completed = false; e.setSetting('signals', signals); e.setSetting('windupMs', windup); e.reset();
    let completes = 0; const oc = e.complete.bind(e); e.complete = o => { completes++; oc(o); };
    let att = 0, hit = 0, esc = 0, ko = 0, last = null, jumpedFor = null, kinds = { slam: [0, 0], sweep: [0, 0], shock: [0, 0] };
    const step = () => { e.time += 1 / 120; e.frame++; e.update(1 / 120); inp.endFrame(); };
    for (let i = 0; i < 400000; i++) {
      const A = e.att;
      inp.codes.delete('ArrowLeft'); inp.codes.delete('ArrowRight'); inp.codes.delete('Space');
      if (A && e.st === 'play') {
        // bot sadece (a) uyarı varsa hazırlıkta, (b) uyarı yoksa aktif başlayınca tepki verir (reaktif süre reactT)
        const since = A.st === 'windup' ? (signals ? A.t : -1) : A.st === 'active' ? (signals ? A.wd : 0) + A.t - (signals ? 0 : 0) + (signals ? 0 : 0) : -1;
        const el = A.st === 'windup' ? A.t : A.st === 'active' ? A.wd + A.t : 99;
        const seen = signals ? el : (A.st === 'active' ? A.t : -1);   // bot'un işareti görme süresi
        if (seen >= reactT) {
          if (A.kind === 'slam') {
            const goal = (A.tx + 105 <= X_MAX) ? A.tx + 105 : Math.max(X_MIN, A.tx - 105);
            if (Math.abs(e.x - goal) > 4) inp.codes.add(e.x < goal ? 'ArrowRight' : 'ArrowLeft');
          } else {
            const tp = signals ? A.wd + ACT[A.kind] * (A.kind === 'sweep' ? (F0 - e.x) / (F0 - F1) : (BX - e.x - 120) / 350) : 0;
            const press = signals ? el >= tp - 0.375 : true;
            if (press && e.grounded && jumpedFor !== A) { inp._p.add('jump'); inp.codes.add('Space'); jumpedFor = A; }
          }
        }
      }
      if (A && A !== last) { last = A; }
      const wasAtt = e.att, hb = e.hits;
      step();
      if (wasAtt && !e.att || (wasAtt && e.att && wasAtt !== e.att)) {
        att++; const k = kinds[wasAtt.kind]; k[0]++; if (wasAtt.hit) { hit++; k[1]++; } else if (!wasAtt.touched) esc++;
      }
      if (e.st === 'ko') { ko++; e.st = 'play'; e.hearts = 3; e.y = 510; e.stun = 0; }
      if (e.st === 'won' && !untilWin) { e.st = 'play'; e.escapes = 0; }
      if (untilWin ? e.completed : att >= nAtt) break;
    }
    return { signals, windup, attacks: att, hits: hit, escapes: esc, kos: ko, completes, kinds, state: e.st, escCounter: e.escapes };
  }
  out.warned = run(true, 800, 60);
  out.unwarned = run(false, 800, 60);
  out.warned200 = run(true, 200, 60);
  out.warned1200 = run(true, 1200, 60);
  out.win = run(true, 800, 0, true);
  return out;
});
console.log(JSON.stringify(res, null, 1));
await p.waitForTimeout(800);
console.log('kart:', await p.evaluate(() => !document.querySelector('.exp-card').hidden), 'damga:', await p.evaluate(() => localStorage.getItem('juit.lab.stamps')));
console.log(logs.join('\n') || 'konsol temiz');
await b.close();
