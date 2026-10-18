// DENEYLER — üç mekanik deneyi tek sayfada. #/lab/<id> ile ilgili deneye kaydırılır.
import { $, escapeHTML } from '../utils.js';
import { labs, videos } from '../content.config.js';
import { mountLab } from './lab-mount.js';
import { openVideo } from './mobu-world.js';

export function mount(main, app, route) {
  main.innerHTML = `
  <section class="view lab-page" data-view="lab">
    <header class="view__head">
      <span class="eyebrow eyebrow--purple">Dünyalar arası · Laboratuvar</span>
      <h1 class="display display--xl">Mekaniği <span class="glow-text">elinle</span> dene.</h1>
      <p class="lede">Videolarda anlattığım şeyleri burada açıp kapatabilirsin. Her deneyin bir anahtarı var: önce açık oyna, sonra kapat ve farkı hisset.</p>
    </header>
    ${labs.map(l => {
      const v = videos.find(x => x.n === l.videoN);
      return `<div class="section lab-section" id="lab-${l.id}">
        <div class="section__head"><div><span class="eyebrow">${l.status === 'ready' ? 'Oynanabilir' : 'Yakında'}</span><h2 class="display display--m">${escapeHTML(l.title)}</h2></div>
          ${v ? `<button class="btn btn--sm btn--ghost" type="button" data-open-video="${v.n}">İlgili video: #${String(v.n).padStart(2, '0')}</button>` : ''}</div>
        <p class="lede" style="margin-bottom:18px">${escapeHTML(l.blurb)}</p>
        ${l.status === 'ready' ? `<div class="lab" id="lab-host-${l.id}"></div>` : `<div class="lab-stage lab-stage--loading"><p class="mono muted">Bu deney henüz hazır değil.</p></div>`}
      </div>`;
    }).join('')}
  </section>`;
  const ctls = labs.filter(l => l.status === 'ready').map(l => mountLab($(`#lab-host-${l.id}`, main), l.id, app));
  main.addEventListener('click', e => { const b = e.target.closest('[data-open-video]'); if (!b) return; const v = videos.find(x => x.n === +b.dataset.openVideo); if (v) openVideo(v, app) });
  const want = route?.rest?.[0];
  if (want) requestAnimationFrame(() => { const el = $(`#lab-${want}`, main); if (el) { const y = el.getBoundingClientRect().top + scrollY - 80; scrollTo({ top: y, behavior: 'smooth' }) } });
  return { destroy() { ctls.forEach(c => c.destroy()) } };
}
