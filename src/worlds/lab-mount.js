// Deney modüllerini tembel yükler, görünür olunca kurar, uzaklaşınca söker; Mobu'ya haber verir.
import { bus, whenVisible, prefersReducedMotion } from '../utils.js';

// Birden çok deney aynı sayfadaysa Mobu, görüş alanında en çok yer kaplayanı izler.
const STAGES = new Map(); let activeStage = null, pickRaf = 0;
function pickActive() {
  pickRaf = 0; let best = null, bestA = 0; const vh = innerHeight;
  for (const [el, id] of STAGES) { const r = el.getBoundingClientRect(); const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)); if (vis > bestA) { bestA = vis; best = { el, id } } }
  if (best && bestA > 80) { if (best.el !== activeStage) { activeStage = best.el; bus.emit('lab:active', best) } }
  else if (activeStage) { activeStage = null; bus.emit('lab:inactive', {}) }
}
const schedulePick = () => { if (!pickRaf) pickRaf = requestAnimationFrame(pickActive) };
addEventListener('scroll', schedulePick, { passive: true }); addEventListener('resize', schedulePick);

const LOADERS = {
  coyote:    () => import('../lab/coyote.js').then(m => m.mountCoyoteLab),
  vision:    () => import('../lab/vision.js').then(m => m.mountVisionLab),
  telegraph: () => import('../lab/telegraph.js').then(m => m.mountTelegraphLab),
};

export function mountLab(host, id, app) {
  let handle = null, loading = false, dead = false, stop = null;
  host.classList.add('lab'); host.dataset.lab = id;
  const skeleton = () => { host.innerHTML = `<div class="lab-stage lab-stage--loading"><p class="mono muted">Deney yükleniyor…</p></div>` };
  skeleton();
  const onEvent = ev => { bus.emit('lab:event', { id, ...ev }); };
  async function up() {
    if (handle || loading || dead) return; loading = true;
    try {
      const mountFn = await LOADERS[id]();
      if (dead) return;
      host.innerHTML = '';
      handle = mountFn(host, { onEvent, reducedMotion: prefersReducedMotion(), sfx: app.sfx });
      const stage = host.querySelector('.lab-stage') || host;
      STAGES.set(stage, id); handle._stage = stage;
      const act = () => { if (activeStage !== stage) { activeStage = stage; bus.emit('lab:active', { el: stage, id }) } };
      stage.addEventListener('pointerdown', act); stage.addEventListener('focusin', act);
      schedulePick(); // görünür olunca Mobu kenara oturup izler (oyundaki Mobu ile karışmasın)
    } catch (e) {
      console.error('[lab]', id, e);
      host.innerHTML = `<div class="lab-stage lab-stage--loading"><p class="mono muted">Bu deney yüklenemedi: ${String(e.message || e).replace(/</g, '&lt;')}</p></div>`;
    } finally { loading = false }
  }
  function down() { if (!handle) return; const st = handle._stage; try { handle.destroy() } catch { } handle = null; if (st) { STAGES.delete(st); if (activeStage === st) { activeStage = null; bus.emit('lab:inactive', { id }) } } skeleton(); schedulePick() }
  stop = whenVisible(host, up, down, '240px');
  return { destroy() { dead = true; stop?.(); down() }, get handle() { return handle } };
}
