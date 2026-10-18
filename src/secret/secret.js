// MOBU'NUN ÇEKMECESİ — keşfeden ziyaretçiye küçük ödül. "mobu" yazarak ya da logoya 5 tıkla açılır.
import { $, escapeHTML, store } from '../utils.js';
import { secret } from '../content.config.js';

const ICON = { sketch: '✎', bug: '🐛', proto: '⚙' };
export function mount(main, app) {
  const how = store.get('juit.secretFound');
  main.innerHTML = `
  <section class="view secret" data-view="cekmece">
    <header class="view__head">
      <span class="eyebrow eyebrow--purple">Gizli alan · ${how ? 'buldun' : 'buraya nasıl geldin?'}</span>
      <h1 class="display display--xl">${escapeHTML(secret.title)}</h1>
      <p class="lede">${escapeHTML(secret.blurb)}</p>
    </header>
    <div class="drawer">
      <div class="drawer__front"><i></i><span class="mono">MOBU · ÖZEL</span></div>
      <div class="drawer__items">${secret.items.map((it, i) => `<article class="polaroid" style="--r:${(i % 2 ? 1 : -1) * (1.5 + i)}deg"><div class="polaroid__pic polaroid__pic--${it.kind}"><span>${ICON[it.kind] || '•'}</span></div><h3>${escapeHTML(it.title)}</h3><p>${escapeHTML(it.text)}</p>${it.placeholder ? '<span class="chip chip--example">örnek</span>' : ''}</article>`).join('')}</div>
    </div>
    <p class="muted" style="margin-top:28px;font-size:13px">Buraya yeni şeyler eklemek için: <span class="mono">content.config.js → secret.items</span>. <a href="#/">Ana sayfaya dön</a></p>
  </section>`;
  return { destroy() { } };
}
