// HAKKIMDA — masadaki nesneler üretim alanlarını açar; iletişim ve sosyal bağlantılar hemen altta.
import './desk.css';
import { $, $$, bus, escapeHTML } from '../utils.js';
import { about, contact, socials } from '../content.config.js';
import { deskSVG } from './desk.js';

export function mount(main, app) {
  const links = Object.values(socials).filter(s => s.url).map(s => `<a class="btn btn--sm" href="${s.url}" target="_blank" rel="noopener">${escapeHTML(s.label)} ↗</a>`).join('');
  main.innerHTML = `
  <section class="view about" data-view="about">
    <header class="view__head">
      <span class="eyebrow eyebrow--purple">Hakkımda</span>
      <h1 class="display display--xl">Merhaba, ben <span class="glow-text">${escapeHTML(about.name)}</span>.</h1>
      <p class="lede">${escapeHTML(about.intro)}</p>
      <p class="muted">${escapeHTML(about.since)}</p>
    </header>
    <div class="desk-wrap">
      <div class="desk" id="desk">${deskSVG()}</div>
      <aside class="desk-panel card" id="desk-panel" aria-live="polite">
        <span class="eyebrow">Masadaki bir nesneye tıkla</span>
        <h2 class="display display--m" id="desk-title">Üretim alanları</h2>
        <p class="lede" id="desk-text">Kamera, kumanda, çizim defteri ve monitör: her biri bu işin bir tarafı. Birine tıkla, Mobu da bakar.</p>
        <div class="desk-tabs" role="tablist" aria-label="Üretim alanları">${about.objects.map(o => `<button class="chip desk-tab" role="tab" type="button" data-object="${o.id}" aria-selected="false">${escapeHTML(o.label)}</button>`).join('')}</div>
      </aside>
    </div>
    <div class="section contact" id="contact">
      <div class="section__head"><h2 class="display display--m">İletişim</h2><p class="muted">${escapeHTML(contact.note)}</p></div>
      <div class="contact__row">
        <a class="btn btn--primary" href="mailto:${encodeURIComponent(contact.email)}">${escapeHTML(contact.email)}</a>
        ${contact.placeholder ? `<span class="chip chip--example" title="content.config.js → contact.email">örnek adres</span>` : ''}
        ${links}
      </div>
    </div>
  </section>`;

  const svg = $('svg', main); svg?.setAttribute('role', 'group');
  const title = $('#desk-title', main), text = $('#desk-text', main), tabs = $$('.desk-tab', main);
  function select(id, fromObj) {
    const o = about.objects.find(x => x.id === id); if (!o) return;
    $$('.desk-obj', main).forEach(g => g.classList.toggle('is-active', g.dataset.object === id));
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.object === id)));
    title.textContent = o.title; text.textContent = o.text;
    app.sfx?.play('pop', { gain: .5 });
    bus.emit('about:select', { id, el: fromObj || $(`.desk-obj[data-object="${id}"]`, main) });
  }
  main.addEventListener('click', e => { const g = e.target.closest('.desk-obj'); if (g) { select(g.dataset.object, g); return } const t = e.target.closest('.desk-tab'); if (t) select(t.dataset.object) });
  main.addEventListener('keydown', e => { const g = e.target.closest?.('.desk-obj'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(g.dataset.object, g) } });
  return { destroy() { } };
}
