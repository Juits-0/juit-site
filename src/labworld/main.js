import './style.css';
// main.js — laboratuvar bootstrap'i: hash yönlendirici ve ekran geçişleri. Rotalar: '#/' → laboratuvar, '#/deney/<id>' → deney.
// DOM: #app > #lab.screen, #exp.screen.hidden, #flash. Ana kabuğa bağlarken sadece start() çağrılır.
import { byId } from '../config/experiments.js';
import { Lab } from '../lab/lab.js';
import { Runner } from '../core/runner.js';
import { store } from '../core/store.js';
import { audio } from '../core/audio.js';
import Placeholder from '../experiments/_placeholder.js';

const modules = import.meta.glob('../experiments/*.js');

export function start() {
  const labEl = document.getElementById('lab'), expEl = document.getElementById('exp'), flashEl = document.getElementById('flash');
  let lab = null, runner = null, current = null, token = 0, lastExp = null;

  const app = {
    goLab() { if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; else route(); },
    goExperiment(id) { location.hash = '#/deney/' + id; },
    // laboratuvardan deneye geçiş. cut=true → anlık kesme + kısa fade (hareketi azalt)
    openExperiment(id, o = {}) {
      if (o.cut) {
        flashEl.style.transition = 'none'; flashEl.style.background = '#050407'; flashEl.style.opacity = 1;
        void flashEl.offsetWidth;
        app.goExperiment(id);
        requestAnimationFrame(() => { flashEl.style.transition = 'opacity .15s linear'; flashEl.style.opacity = 0; });
      } else app.goExperiment(id);
    },
    setFlash(a) { flashEl.style.transition = 'none'; flashEl.style.background = '#8B3DFF'; flashEl.style.opacity = a; },
  };

  function ensureLab() { if (!lab) { lab = new Lab(labEl, app); window.__lab = lab; } return lab; }
  function ensureRunner() { if (!runner) runner = new Runner(expEl, app); return runner; }

  function parse() {
    const h = location.hash.replace(/^#/, '') || '/';
    const m = h.match(/^\/deney\/([\w-]+)/);
    return m ? { id: m[1] } : { id: null };
  }

  async function route() {
    const my = ++token, { id } = parse();
    const cfg = id && byId(id);
    ensureLab();
    if (cfg) {
      // deney ekranı
      if (!current) lab.prime(id);          // doğrudan açıldıysa lab arka planda Mobu'yu o istasyonun önüne koyar
      lab.hide();
      labEl.classList.add('hidden'); expEl.classList.remove('hidden');
      const key = '../experiments/' + id + '.js';
      let Cls = Placeholder;
      try { if (modules[key]) Cls = (await modules[key]()).default || Placeholder; } catch (e) { console.error('Deney yüklenemedi', id, e); }
      if (my !== token) return;
      document.title = `${cfg.title} — Mobu'nun Oyun Laboratuvarı`;
      await ensureRunner().start(cfg, Cls);
      current = id; lastExp = id;
      requestAnimationFrame(() => { flashEl.style.transition = 'opacity .35s ease-out'; flashEl.style.opacity = 0; });
    } else {
      // laboratuvar
      if (runner) runner.stop();
      expEl.classList.add('hidden'); labEl.classList.remove('hidden');
      document.title = "Mobu'nun Oyun Laboratuvarı";
      lab.show(current ? lastExp : null);
      current = null;
    }
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });
  route();
  window.__app = app;
  return app;
}

start();
