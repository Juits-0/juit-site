import './styles/main.css';
import { $, $$, bus, store, prefersReducedMotion } from './utils.js';
import { sfx } from './audio.js';
import { runIntro } from './intro/intro.js';
import { initRouter, parseHash, go } from './router.js';
import { toast } from './ui/toast.js';
import { socials, contact } from './content.config.js';

const app = { bus, sfx, store, mobu: null, reducedMotion: prefersReducedMotion(), socials, contact };
window.__juit = app; // hata ayıklama için

// ---- üst çubuk ----
function initTopbar() {
  const bar = $('#topbar');
  const sfxBtn = $('#sfx-toggle'), menuBtn = $('#menu-toggle');
  const paint = () => { const on = sfx.enabled; sfxBtn.setAttribute('aria-pressed', String(on)); $('.icon-btn__ico', sfxBtn).textContent = on ? '🔊' : '🔇'; sfxBtn.title = on ? 'Ses efektleri açık' : 'Ses efektleri kapalı' };
  sfxBtn.addEventListener('click', () => { sfx.setEnabled(!sfx.enabled); paint(); if (sfx.enabled) sfx.play('switch'); toast(sfx.enabled ? 'Ses efektleri açık' : 'Ses efektleri kapalı', 1400) });
  paint();
  menuBtn.addEventListener('click', () => { const open = !bar.classList.contains('is-menu-open'); bar.classList.toggle('is-menu-open', open); menuBtn.setAttribute('aria-expanded', String(open)) });
  $$('.topbar__nav a').forEach(a => a.addEventListener('click', () => { bar.classList.remove('is-menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); sfx.play('click') }));
  bus.on('route', ({ path }) => { bar.classList.toggle('is-hub', path === ''); bar.classList.remove('is-menu-open'); menuBtn.setAttribute('aria-expanded', 'false') });
  document.addEventListener('click', e => { if (!bar.contains(e.target)) { bar.classList.remove('is-menu-open'); menuBtn.setAttribute('aria-expanded', 'false') } });
  // genel tık sesi: düğmeler ve bağlantılar
  document.addEventListener('click', e => { const el = e.target.closest('a[href],button'); if (el && !el.closest('.lab') && el !== sfxBtn) sfx.play('click', { gain: .6 }) });
}

// ---- gizli çekmece tetikleyicileri: "mobu" yazmak ya da logoya 5 kez tıklamak ----
function initSecret() {
  let buf = '';
  addEventListener('keydown', e => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key.length !== 1) return;
    buf = (buf + e.key.toLowerCase()).slice(-4);
    if (buf === 'mobu') { buf = ''; openSecret('yazdın') }
  });
  let clicks = [];
  bus.on('logo:click', () => { const now = performance.now(); clicks = clicks.filter(c => now - c < 3000); clicks.push(now); if (clicks.length >= 5) { clicks = []; openSecret('logo') } else if (clicks.length >= 3) toast(`${5 - clicks.length} tık daha…`, 900) });
}
function openSecret(how) { if (parseHash().path === 'cekmece') return; sfx.play('secret'); store.set('juit.secretFound', how); toast('Bir çekmece açıldı…', 1800); go('cekmece') }

// ---- başlat ----
(async function boot() {
  initTopbar(); initSecret();
  const first = parseHash();
  const seen = !!store.get('juit.seen');
  // Hub, perdenin arkasında hazır olsun (devir için logo konumu ölçülür)
  await initRouter(app);
  const topbar = $('#topbar');
  runIntro({
    short: seen || first.path !== '', sfx,
    onReveal() { document.body.classList.add('is-revealed'); topbar.hidden = false },
    async onDone({ failed }) {
      store.set('juit.seen', true);
      document.body.classList.add('is-ready');
      try { const { initMobu } = await import('./mobu/mobu-actor.js'); app.mobu = initMobu(app) }
      catch (e) { console.error('[mobu]', e) }
      bus.emit('intro:done', { failed });
    },
  });
})();
