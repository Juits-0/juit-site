// Hash yönlendirici: #/ (hub), #/mobu, #/arcade, #/lab, #/about, #/cekmece
import { $, $$, bus } from './utils.js';
import { closeModal } from './ui/modal.js';

const views = {
  '':        () => import('./hub/hub.js'),
  'mobu':    () => import('./worlds/mobu-world.js'),
  'arcade':  () => import('./worlds/arcade.js'),
  'lab':     () => import('./worlds/lab-page.js'),
  'about':   () => import('./about/about.js'),
  'cekmece': () => import('./secret/secret.js'),
};
export const ROUTE_TITLES = { '': 'JUIT — Mobu & oyun laboratuvarı', mobu: 'Mobu & Videolar — JUIT', arcade: 'Oyun Salonu — JUIT', lab: 'Deneyler — JUIT', about: 'Hakkımda — JUIT', cekmece: 'Mobu\'nun çekmecesi — JUIT' };

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q] = h.split('?'); const parts = p.split('/').filter(Boolean);
  const known = !parts[0] || parts[0] === 'main' || !!views[parts[0]];   // 'main': eski 'İçeriğe atla' bağlantısı
  return { path: known && views[parts[0]] ? parts[0] : '', notFound: !known, rest: parts.slice(1), query: new URLSearchParams(q || '') };
}

let active = null, seq = 0;
export async function render(app) {
  const main = $('#main'); const r = parseHash(); const my = ++seq;
  closeModal();
  if (active) { try { active.destroy?.() } catch (e) { console.warn(e) } active = null }
  main.innerHTML = '';
  document.body.dataset.route = r.path || 'hub';
  document.title = ROUTE_TITLES[r.path] || ROUTE_TITLES[''];
  $$('.topbar__nav a').forEach(a => a.classList.toggle('is-active', a.dataset.route === r.path));
  try {
    if (r.notFound) {   // bilinmeyen rota: sessizce ana sayfaya düşmek yerine açık bir bulunamadı ekranı
      document.title = 'Sayfa bulunamadı — JUIT'; document.body.dataset.route = 'notfound';
      main.innerHTML = `<section class="view"><p class="eyebrow eyebrow--purple">404</p><h1 class="display display--m">Bu sayfa bulunamadı.</h1><p class="lede">Mobu her yere baktı ama burada bir şey yok. <a href="#/">Ana sayfaya dön</a> ya da <a href="#/lab">deneylere göz at</a>.</p></section>`;
      active = {}; bus.emit('route', { path: 'notfound', rest: [] }); return;
    }
    const mod = await views[r.path]();
    if (my !== seq) return;
    active = mod.mount(main, app, r) || {};
  } catch (e) {
    console.error('[router]', e);
    main.innerHTML = `<section class="view"><p class="eyebrow">Hata</p><h1 class="display display--m">Bu bölüm yüklenemedi.</h1><p class="lede">Sayfayı yenilemeyi dene. <a href="#/">Ana sayfaya dön</a></p></section>`;
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  bus.emit('route', { path: r.path, rest: r.rest });
}

export function initRouter(app) {
  window.addEventListener('hashchange', () => render(app));
  return render(app);
}
export const go = path => { location.hash = '#/' + path.replace(/^\/+/, '') };
