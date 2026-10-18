// OYUN SALONU — atari kabinleri. Kabin seçilince ekran büyür: web sürümü varsa oynanabilir alan,
// yoksa kapak + bilgi + itch.io düğmesi. Sondaki "LAB" kabini deneylere açılır (dünyalar arası köprü).
import { $, $$, bus, escapeHTML } from '../utils.js';
import { games, labs, socials } from '../content.config.js';
import { openModal } from '../ui/modal.js';

function screenHTML(g) {
  if (g.cover) return `<img src="${g.cover}" alt="" loading="lazy" decoding="async">`;
  return `<div class="cab__noart cab__noart--big" style="--tint:${g.tint}"><span>${escapeHTML(g.title)}</span><i></i><i></i><i></i></div>`;
}
function cabinet(g, i) {
  const ex = g.placeholder ? `<span class="chip chip--example cabinet__badge" title="Bağlantı/kimlik doğrulanacak">örnek</span>` : '';
  return `<button class="cabinet" type="button" style="--tint:${g.tint}" data-slug="${g.slug}" aria-label="${escapeHTML(g.title)} — kabini aç">
    <span class="cabinet__marquee"><span>${escapeHTML(g.title)}</span></span>
    <span class="cabinet__screen">${screenHTML(g)}<i class="cab__scan"></i>${ex}<span class="cabinet__insert">${g.embedUrl ? 'OYNA' : 'İNCELE'}</span></span>
    <span class="cabinet__deck"><i class="cab__stick"></i><i class="cab__btn"></i><i class="cab__btn"></i></span>
    <span class="cabinet__base"><span class="cabinet__meta mono">${escapeHTML(g.role.split(' — ')[0])} · ${escapeHTML(g.year)}</span></span>
  </button>`;
}
const labCab = `<a class="cabinet cabinet--lab" href="#/lab" style="--tint:#B67CFF" aria-label="Deney kabini — mekanik deneyleri">
    <span class="cabinet__marquee"><span>JUIT LAB</span></span>
    <span class="cabinet__screen"><span class="cabinet__labscreen"><b>3</b><small>DENEY</small><em>coyote · görüş · telegraph</em></span><i class="cab__scan"></i><span class="cabinet__insert">OYNA</span></span>
    <span class="cabinet__deck"><i class="cab__stick"></i><i class="cab__btn"></i><i class="cab__btn"></i></span>
    <span class="cabinet__base"><span class="cabinet__meta mono">site içi · ücretsiz</span></span>
  </a>`;

export function openGame(g, app) {
  const actions = [];
  const a = document.createElement('a'); a.className = 'btn btn--sm btn--primary'; a.href = g.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'itch.io\'da aç ↗'; actions.push(a);
  openModal({
    title: g.title, kind: 'game', className: 'modal--game', actions,
    body(el) {
      const widget = g.itchId ? `<iframe class="game__widget" frameborder="0" src="https://itch.io/embed/${encodeURIComponent(g.itchId)}?linkback=true&amp;dark=true&amp;border_width=0" width="100%" height="167" title="${escapeHTML(g.title)} — itch.io"></iframe>` : '';
      if (g.embedUrl) {
        el.innerHTML = `<div class="game game--play"><div class="game__screen"><iframe class="game__frame" src="${g.embedUrl}" title="${escapeHTML(g.title)}" allowfullscreen allow="autoplay; fullscreen; gamepad"></iframe></div>
          <aside class="game__info"><p class="lede">${escapeHTML(g.blurb)}</p><dl class="game__facts"><dt>Rol</dt><dd>${escapeHTML(g.role)}</dd><dt>Platform</dt><dd>${escapeHTML(g.platform)}</dd></dl>${widget}</aside></div>`;
      } else {
        el.innerHTML = `<div class="game"><div class="game__screen game__screen--cover" style="--tint:${g.tint}">${screenHTML(g)}<i class="cab__scan"></i></div>
          <aside class="game__info"><p class="lede">${escapeHTML(g.blurb)}</p>
            <dl class="game__facts"><dt>Rol</dt><dd>${escapeHTML(g.role)}</dd><dt>Platform</dt><dd>${escapeHTML(g.platform)}</dd><dt>Etiket</dt><dd>${g.tags.map(t => `<span class="chip">${escapeHTML(t)}</span>`).join(' ')}</dd></dl>
            ${widget}
            <p class="muted" style="font-size:13px">Bu oyunun tarayıcı sürümü yok; itch.io'dan indirilir.${g.placeholder ? ' <span class="chip chip--example">örnek</span> Bağlantı ve kimlik doğrulanacak.' : ''}</p></aside></div>`;
      }
    },
  });
  app.sfx?.play('open');
}

export function mount(main, app) {
  const itch = socials.itch?.url;
  main.innerHTML = `
  <section class="view view--full arcade" data-view="arcade">
    <div class="arcade__inner">
      <header class="view__head">
        <span class="eyebrow eyebrow--purple">Sağ dünya · Oyun salonu</span>
        <h1 class="display display--xl">Jetonu at,<br><span class="glow-text">kabini</span> seç.</h1>
        <p class="lede">Jam oyunları, ekip projeleri ve kendi denemelerim. Web sürümü olanlar burada oynanır; diğerleri itch.io'da.</p>
        <div class="row">${itch ? `<a class="btn btn--primary" href="${itch}" target="_blank" rel="noopener">itch.io profili ↗</a>` : ''}<a class="btn btn--ghost" href="#/lab">Deney kabini</a></div>
      </header>
    </div>
    <div class="hall">
      <i class="hall__neon"></i>
      <div class="hall__row" id="hall-row">${games.map(cabinet).join('')}${labCab}</div>
      <i class="hall__floor"></i>
    </div>
    <div class="arcade__inner"><p class="muted" style="font-size:13px">Kabinler <span class="mono">content.config.js → games</span> listesinden gelir. Web sürümü olan bir oyunun itch.io "embed-upload" adresini <span class="mono">embedUrl</span> alanına yazınca ekran doğrudan oynanabilir olur.</p></div>
  </section>`;
  const row = $('#hall-row', main);
  row.addEventListener('click', e => { const c = e.target.closest('.cabinet[data-slug]'); if (!c) return; const g = games.find(x => x.slug === c.dataset.slug); if (g) openGame(g, app) });
  const over = e => { const c = e.target.closest('.cabinet'); if (!c) return; bus.emit('arcade:hover', { el: c }); app.sfx?.play('hover') };
  const out = e => { if (e.target.closest('.cabinet')) bus.emit('arcade:hover', { el: null }) };
  row.addEventListener('pointerenter', over, true); row.addEventListener('pointerleave', out, true); row.addEventListener('focusin', over); row.addEventListener('focusout', out);
  // derinlik: fare salonda gezerken kabinler hafif döner
  const hall = $('.hall', main); let raf = 0, tx = 0, cx = 0;
  const onMove = e => { const r = hall.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - .5) * 2 };
  const tick = () => { cx += (tx - cx) * .08; row.style.setProperty('--tilt', (cx * -6).toFixed(2) + 'deg'); raf = requestAnimationFrame(tick) };
  if (matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) { hall.addEventListener('pointermove', onMove); hall.addEventListener('pointerleave', () => { tx = 0 }); raf = requestAnimationFrame(tick) }
  return { destroy() { cancelAnimationFrame(raf); bus.emit('arcade:hover', { el: null }) } };
}
