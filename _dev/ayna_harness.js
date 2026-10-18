// Gerçek çekirdek sınıflarıyla (Experiment, Input) deneyi tek başına çalıştıran harness.
// runner'ı taklit eder: sabit 1/120 adım, endFrame, hud/toast/setGoal/complete → ekran + konsol.
import { Input } from '/src/core/input.js';
import Cls from '/src/experiments/ayna.js';

const stage = document.getElementById('stage');
const logEl = document.getElementById('log'); const logs = [];
const L = (t) => { console.log('[ayna] ' + t); logs.push(t); logEl.innerHTML = logs.slice(-4).join('<br>'); };
const input = new Input();
input.attach(stage, { ox: 0, oy: 0, scale: 1, w: 1280, h: 720 });
const s = {}; for (const d of Cls.settings) if (d.type !== 'button') s[d.key] = d.value;
const params = new URLSearchParams(location.search);
if (params.get('method')) s.method = params.get('method');
const rt = {
  hud(o) { window.__hud = o; },
  toast(t) { L('toast: ' + t); },
  setGoal(t) { window.__goal = t; L('goal: ' + t); },
  complete(o) { window.__completed = o; L('COMPLETE: ' + JSON.stringify(o)); },
};
const exp = new Cls({ view: { w: 1280, h: 720 }, s, tech: !!params.get('tech'), reduced: false, input, audio: { play: (n) => L('audio ' + n) }, store: null,
  cfg: { lesson: 'Gerçek yansıma sahneyi ikinci kez çizmek demek.' }, container: stage, _rt: rt });
window.__exp = exp;
exp.init();
let last = 0, acc = 0;
const STEP = 1 / 120;
function loop(ts) {
  requestAnimationFrame(loop);
  if (!last) { last = ts; return; }
  const dt = Math.min((ts - last) / 1000, 1 / 30); last = ts; acc += dt; let n = 0;
  while (acc >= STEP && n < 4) { exp.update(STEP); input.endFrame(); acc -= STEP; n++; }
  const h = window.__hud || { left: [], right: [] };
  document.getElementById('hud').textContent = (h.left || []).join('\n');
  document.getElementById('hudr').textContent = (h.right || []).join('\n');
  document.getElementById('goal').textContent = window.__goal || '';
}
requestAnimationFrame(loop);
// ayarları konsoldan: __set('method','ssr')
window.__set = (k, v) => { exp.s[k] = v; exp.onSetting(k, v); };
window.__tech = (on) => { exp.tech = on; exp.onTech(on); };
