// HUB — logonun iki yanında iki dünya. Fare hangi tarafa yaklaşırsa o taraf genişler ve derinleşir.
import { $, $$, bus, clamp, lerp, prefersReducedMotion, canHover, escapeHTML } from '../utils.js';
import { logoSVG } from '../logo.js';
import { games, videos, socials, site } from '../content.config.js';

function cabinetHTML(g, i) {
  const screen = g.cover ? `<img src="${g.cover}" alt="" loading="lazy">` : `<div class="cab__noart" style="--tint:${g.tint}"><span>${escapeHTML(g.title)}</span></div>`;
  return `<div class="cab cab--${i}" style="--tint:${g.tint}"><div class="cab__marquee"><span>${escapeHTML(g.title)}</span></div><div class="cab__screen">${screen}<i class="cab__scan"></i></div><div class="cab__deck"><i class="cab__stick"></i><i class="cab__btn"></i><i class="cab__btn"></i></div><div class="cab__base"></div></div>`;
}

export function mount(main, app) {
  const latest = videos.filter(v => v.youtubeId).at(-1) || videos.at(-1);   // TV: son YAYIMLANAN video
  const socialLinks = Object.values(socials).filter(s => s.url).map(s => `<a class="chip" href="${s.url}" target="_blank" rel="noopener">${escapeHTML(s.label)} ↗</a>`).join('');
  main.innerHTML = `
  <section class="hub" id="hub">
    <h1 class="sr-only">JUIT: oyunların arkasındaki mekanikleri Mobu ile anlatan videolar ve oynanabilir oyun deneyleri</h1>
    <div class="hub__worlds" id="hub-worlds">
      <a class="world world--mobu" href="#/mobu" id="world-mobu" aria-label="Mobu ve videolar dünyasına gir">
        <div class="world__layer world__layer--back" data-depth=".35"><i class="world__spot"></i><i class="world__floor"></i></div>
        <div class="world__layer world__layer--mid" data-depth=".7">
          <div class="tv" id="hub-tv" data-occluder>
            <div class="tv__bezel"><div class="tv__screen"><video class="tv__video" muted loop playsinline autoplay preload="metadata" poster="${latest.poster}" src="${latest.loop}"></video><i class="tv__scan"></i><i class="tv__glass"></i></div>
              <div class="tv__side"><i class="tv__knob"></i><i class="tv__knob"></i><i class="tv__led"></i></div></div>
            <div class="tv__feet"><i></i><i></i></div>
          </div>
        </div>
        <div class="world__text">
          <span class="eyebrow eyebrow--purple">Sol dünya · YouTube</span>
          <h2 class="display display--l">Mobu &amp;<br>Videolar</h2>
          <p class="lede">Oyunların arkasındaki mekanikler, Mobu'nun başına gelenlerle.</p>
          <span class="btn btn--primary">Dünyaya gir →</span>
        </div>
      </a>
      <a class="world world--arcade" href="#/arcade" id="world-arcade" aria-label="Oyun salonuna gir">
        <div class="world__layer world__layer--back" data-depth=".35"><i class="world__spot world__spot--arcade"></i><i class="world__floor"></i><i class="world__neon"></i></div>
        <div class="world__layer world__layer--mid" data-depth=".7"><div class="cabs">${games.slice(0, 3).map(cabinetHTML).join('')}</div></div>
        <div class="world__text world__text--right">
          <span class="eyebrow eyebrow--purple">Sağ dünya · itch.io</span>
          <h2 class="display display--l">Oyun<br>Salonu</h2>
          <p class="lede">Jam oyunları, prototipler ve oynanabilir deneyler.</p>
          <span class="btn btn--primary">Salona gir →</span>
        </div>
      </a>
    </div>
    <button class="hub__logo" id="hub-logo" type="button" aria-label="JUIT logosu">${logoSVG({ cls: 'hub__logo-svg', id: 'hub' })}</button>
    <div class="hub__bottom">
      <p class="hub__tag">${escapeHTML(site.tagline)}</p>
      <div class="hub__links">${socialLinks}<a class="chip" href="#/lab">Deneyler</a><a class="chip" href="#/about">Hakkımda</a><button class="secret-dot" type="button" aria-label="Küçük bir sır" title="…"></button></div>
    </div>
    <p class="hub__hint" aria-hidden="true">← bir dünyaya yaklaş →</p>
  </section>`;

  const worlds = $('#hub-worlds'), L = $('#world-mobu'), R = $('#world-arcade');
  const rm = prefersReducedMotion(), hover = canHover();
  let bias = 0, target = 0, raf = 0, near = null, alive = true, lastMove = performance.now(), idleFired = false;
  const layers = $$('.world__layer', main).map(el => ({ el, d: parseFloat(el.dataset.depth) || .5, x: 0, y: 0, tx: 0, ty: 0 }));

  function setNear(n) { if (n === near) return; near = n; L.classList.toggle('is-near', n === 'mobu'); R.classList.toggle('is-near', n === 'arcade'); L.classList.toggle('is-far', n === 'arcade'); R.classList.toggle('is-far', n === 'mobu'); bus.emit('hub:near', n) }
  function onMove(e) {
    const r = worlds.getBoundingClientRect(); const nx = clamp((e.clientX - r.left) / r.width), ny = clamp((e.clientY - r.top) / r.height);
    target = (nx - .5) * 2; lastMove = performance.now(); idleFired = false;
    for (const l of layers) { const wr = l.el.parentElement.getBoundingClientRect(); const lx = clamp((e.clientX - wr.left) / wr.width) - .5, ly = ny - .5; l.tx = lx * 22 * l.d; l.ty = ly * 14 * l.d }
    setNear(target < -.12 ? 'mobu' : target > .12 ? 'arcade' : null);
  }
  function onLeave() { target = 0; for (const l of layers) { l.tx = 0; l.ty = 0 } setNear(null) }
  function tick() {
    if (!alive) return;
    bias = lerp(bias, target, .08);
    const wl = 1 - .32 * bias, wr = 1 + .32 * bias;
    L.style.flexGrow = wl.toFixed(3); R.style.flexGrow = wr.toFixed(3);
    for (const l of layers) { l.x = lerp(l.x, l.tx, .1); l.y = lerp(l.y, l.ty, .1); l.el.style.transform = `translate3d(${l.x.toFixed(2)}px,${l.y.toFixed(2)}px,0)` }
    if (!idleFired && performance.now() - lastMove > 9000) { idleFired = true; bus.emit('hub:idle') }
    raf = requestAnimationFrame(tick);
  }
  if (hover && !rm) { worlds.addEventListener('pointermove', onMove); worlds.addEventListener('pointerleave', onLeave); raf = requestAnimationFrame(tick) }
  else { main.classList.add('hub--static'); if (!rm) { setTimeout(() => { if (alive) bus.emit('hub:idle') }, 9000) } }
  // klavye odağı da "yakınlık" sayılır
  L.addEventListener('focus', () => { target = -.6; setNear('mobu') }); R.addEventListener('focus', () => { target = .6; setNear('arcade') });
  L.addEventListener('blur', () => { if (!hover) return; target = 0; setNear(null) }); R.addEventListener('blur', () => { if (!hover) return; target = 0; setNear(null) });
  // logo
  const logo = $('#hub-logo');
  logo.addEventListener('click', () => { logo.classList.remove('is-bump'); void logo.offsetWidth; logo.classList.add('is-bump'); app.sfx?.play('pop'); bus.emit('logo:click') });
  $('.secret-dot', main).addEventListener('click', () => { app.sfx?.play('hover'); bus.emit('mobu:react', 'sus'); const t = $('.hub__hint', main); t.textContent = 'Mobu\'ya seslen: klavyede adını yaz…'; t.classList.add('is-on') });
  // TV videosu: autoplay engellenirse poster kalır (sorun değil)
  const v = $('.tv__video', main); v?.play?.().catch(() => { });
  return { destroy() { alive = false; cancelAnimationFrame(raf); worlds.removeEventListener('pointermove', onMove); worlds.removeEventListener('pointerleave', onLeave); setNear(null) } };
}
