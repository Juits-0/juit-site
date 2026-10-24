// DENEYLER — Mobu'nun Oyun Laboratuvarı'na açılan kapı. Deneyler lab.html sayfasında çalışır;
// buradaki her kart lab.html#/deney/<id> derin bağlantısına gider. Eski #/lab/<id> bağlantıları
// doğrudan ilgili deneye yönlendirilir.
import { escapeHTML, labStamps } from '../utils.js';
import { labs, labHome, videos } from '../content.config.js';
import { openVideo } from './mobu-world.js';

const pad = n => String(n).padStart(2, '0');

export function mount(main, app, route) {
  const want = route?.rest?.[0];
  const direct = want ? labs.find(l => l.id === want && l.status === 'ready') : null;
  if (direct) { location.replace(direct.href); return {}; }

  // laboratuvarda kazanılan damgalar: ilerleme çubuğu, ✓ rozet ve sıradaki önerisi
  const st = labStamps(), done = labs.filter(l => st[l.id]).length;
  const nextId = done && done < labs.length ? labs.find(l => !st[l.id] && l.status === 'ready')?.id : null;
  const progress = done ? `<div class="lab-progress" role="group" aria-label="Deney ilerlemesi"><div class="lab-progress__bar"><i style="width:${Math.round(done / labs.length * 100)}%"></i></div><span class="mono">${done}/${labs.length} deney tamamlandı${done === labs.length ? ' · hepsi bitti, tebrikler!' : ''}</span></div>` : '';

  main.innerHTML = `
  <section class="view lab-page" data-view="lab">
    <header class="view__head">
      <span class="eyebrow eyebrow--purple">Dünyalar arası · Laboratuvar</span>
      <h1 class="display display--xl">Mekaniği <span class="glow-text">elinle</span> dene.</h1>
      <p class="lede">Videolarda anlattığım ${labs.length} mekanik, Mobu'nun Oyun Laboratuvarı'nda oynanabilir deney olarak duruyor. Bir kart seç; deney kendi sayfasında açılır.</p>
      <div class="row"><a class="btn btn--primary" href="${labHome}">Laboratuvarı aç →</a></div>
      ${progress}
    </header>
    <div class="lab-grid">
      ${labs.map(l => {
        const v = videos.find(x => x.n === l.videoN);
        const isDone = !!st[l.id], isNext = l.id === nextId;
        return `<article class="card lab-card${isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}" id="lab-${l.id}">
          <span class="eyebrow">#${pad(l.no)} · ${isDone ? '✓ Tamamlandı' : isNext ? 'Sıradaki' : l.status === 'ready' ? 'Oynanabilir' : 'Yakında'}</span>
          <h2 class="lab-card__title">${escapeHTML(l.title)}</h2>
          <p class="lab-card__q muted">${escapeHTML(l.question)}</p>
          <p class="lab-card__goal">${escapeHTML(l.blurb)}</p>
          <div class="row lab-card__row">
            ${l.status === 'ready' ? `<a class="btn btn--sm btn--primary" href="${l.href}">Deneyi oyna →</a>` : `<span class="chip chip--soon">Yakında</span>`}
            ${v ? `<button class="btn btn--sm btn--ghost" type="button" data-open-video="${v.n}">Video #${pad(v.n)}</button>` : ''}
          </div>
        </article>`;
      }).join('')}
    </div>
  </section>`;

  main.firstElementChild.addEventListener('click', e => { const b = e.target.closest('[data-open-video]'); if (!b) return; const v = videos.find(x => x.n === +b.dataset.openVideo); if (v) openVideo(v, app) });
  return {};
}
