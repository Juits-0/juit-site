// MOBU & VİDEOLAR — Mobu'nun odası: video duvarı, site içi oynatıcı ve deney masası (coyote time).
import { $, $$, bus, escapeHTML, whenVisible } from '../utils.js';
import { videos, labs, socials } from '../content.config.js';
import { openModal } from '../ui/modal.js';
import { mountLab } from './lab-mount.js';

const pad = n => String(n).padStart(2, '0');

export function videoCard(v) {
  const badge = v.placeholder ? `<span class="chip chip--example vcard__badge">yakında</span>` : '';
  return `<button class="vcard" type="button" data-n="${v.n}" aria-label="${escapeHTML(v.title)} — izle">
    <span class="vcard__screen"><img class="vcard__poster" src="${v.poster}" alt="" loading="lazy" decoding="async"><video class="vcard__loop" muted loop playsinline preload="none" src="${v.loop}"></video><i class="vcard__scan"></i>${badge}<span class="vcard__play" aria-hidden="true">▶</span></span>
    <span class="vcard__meta"><span class="vcard__n mono">#${pad(v.n)}</span><span class="vcard__topic chip">${escapeHTML(v.topic)}</span></span>
    <span class="vcard__title">${escapeHTML(v.title)}</span>
  </button>`;
}

export function openVideo(v, app) {
  const yt = socials.youtube?.url;
  const actions = [];
  if (v.youtubeId) actions.push(Object.assign(document.createElement('a'), { className: 'btn btn--sm', href: `https://www.youtube.com/watch?v=${v.youtubeId}`, target: '_blank', rel: 'noopener', textContent: 'YouTube\'da aç ↗' }));
  else if (yt) actions.push(Object.assign(document.createElement('a'), { className: 'btn btn--sm', href: yt, target: '_blank', rel: 'noopener', textContent: 'Kanala git ↗' }));
  const labDef = v.lab ? labs.find(l => l.id === v.lab && l.status === 'ready') : null;
  if (labDef) { const a = document.createElement('a'); a.className = 'btn btn--sm btn--primary'; a.href = labDef.href; a.textContent = 'Deneyi oyna →'; a.title = labDef.title; actions.push(a) }
  openModal({
    title: `#${pad(v.n)} · ${v.title}`, kind: 'video', className: 'modal--video', actions,
    body(el) {
      if (v.youtubeId) {
        el.innerHTML = `<div class="player"><iframe class="player__frame" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtubeId)}?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="${escapeHTML(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
      } else {
        el.innerHTML = `<div class="player player--local"><video class="player__frame" controls muted loop playsinline autoplay poster="${v.poster}" src="${v.loop}"></video>
          <div class="player__note"><span class="chip chip--example">yakında</span><p>Bu video çok yakında YouTube'da. Şimdilik sessiz bir önizleme dönüyor.</p></div></div>`;
        $('video', el)?.play?.().catch(() => { });
      }
    },
  });
  app.sfx?.play('open');
}

export function mount(main, app) {
  const yt = socials.youtube?.url;
  main.innerHTML = `
  <section class="view world-mobu" data-view="mobu">
    <header class="view__head">
      <span class="eyebrow eyebrow--purple">Sol dünya · Mobu'nun odası</span>
      <h1 class="display display--xl">Oyunların arkasını<br><span class="glow-text">Mobu</span> ile kurcalıyoruz.</h1>
      <p class="lede">Her video tek bir "neden?" sorusuna cevap verir: düşmanlar neden sırayla saldırır, zıplamalar neden affedilir, bosslar neden haber verir… Mobu konuşmaz; başına gelenler anlatır.</p>
      <div class="row">${yt ? `<a class="btn btn--primary" href="${yt}" target="_blank" rel="noopener">YouTube kanalı ↗</a>` : `<span class="chip chip--example" title="content.config.js → socials.youtube.url">YouTube bağlantısı eklenecek</span>`}<a class="btn btn--ghost" href="#/lab">Deneyleri gör</a></div>
    </header>

    <div class="section">
      <div class="section__head"><h2 class="display display--m">Video duvarı</h2><p class="muted mono">${videos.length} Shorts · üzerine gel, kıpırdasın</p></div>
      <div class="vgrid" id="vgrid">${videos.slice().reverse().map(videoCard).join('')}</div>
    </div>

    <div class="section lab-section" id="lab-coyote">
      <div class="section__head"><div><span class="eyebrow eyebrow--purple">Deney masası</span><h2 class="display display--m">Coyote Time'ı hisset</h2></div><a class="btn btn--sm btn--ghost" href="#/lab">Tüm deneyler →</a></div>
      <p class="lede" style="margin-bottom:18px">Platformdan ayrıldıktan sonra zıplama hakkı. Anahtar açıkken affedici, kapalıyken acımasız. Bu, <button class="linklike" type="button" data-open-video="3">#03 numaralı videonun</button> konusu.</p>
      <div class="lab" id="lab-coyote-host"></div>
    </div>
  </section>`;

  // kartlar: hover → loop oynat; tık → modal
  const grid = $('#vgrid', main);
  const onEnter = e => { const c = e.target.closest('.vcard'); if (!c) return; const v = $('video', c); v?.play?.().catch(() => { }); bus.emit('video:hover', { el: c }); app.sfx?.play('hover') };
  const onLeave = e => { const c = e.target.closest('.vcard'); if (!c) return; const v = $('video', c); if (v) { v.pause(); try { v.currentTime = 0 } catch { } } bus.emit('video:hover', { el: null }) };
  grid.addEventListener('pointerenter', onEnter, true); grid.addEventListener('pointerleave', onLeave, true);
  grid.addEventListener('focusin', onEnter); grid.addEventListener('focusout', onLeave);
  grid.addEventListener('click', e => { const c = e.target.closest('.vcard'); if (!c) return; const v = videos.find(x => x.n === +c.dataset.n); if (v) openVideo(v, app) });
  main.firstElementChild.addEventListener('click', e => { const b = e.target.closest('[data-open-video]'); if (!b) return; const v = videos.find(x => x.n === +b.dataset.openVideo); if (v) openVideo(v, app) });

  // deney: görünür olunca kurulur
  const host = $('#lab-coyote-host', main);
  const labCtl = mountLab(host, 'coyote', app);

  return { destroy() { labCtl.destroy(); bus.emit('video:hover', { el: null }) } };
}
