import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { EXPERIMENTS, CHANNEL } from './src/config/experiments.js';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// JS olmadan da okunabilen temel içerik (arama motorları, noscript). Router ilk çizimde <main>'i boşaltıp
// kendi görünümünü kurar; bu yüzden ziyaretçi bunu görmez. Liste deney yapılandırmasından üretilir, elle tutulmaz.
function staticMain() {
  const items = EXPERIMENTS.map(e => `<li><strong>#${String(e.no).padStart(2, '0')} ${esc(e.title)}</strong> — ${esc(e.goal)}`
    + `${e.video ? ` <a href="${esc(e.video)}">Videoyu izle</a> ·` : ''} <a href="/lab.html#/deney/${e.id}">Deneyi oyna</a></li>`).join('');
  return `<main id="main" class="main" tabindex="-1">
    <section class="view seo-static">
      <h1>JUIT: oyunların arkasındaki mekanikler, Mobu ile</h1>
      <p>Oyunların arkasını kurcalıyor, öğrendiklerimi mor maymun Mobu ile kısa videolarda anlatıyor ve her mekaniği tarayıcıda oynanabilir bir deneye çeviriyorum.</p>
      <h2>Videolar ve deneyler</h2><ol>${items}</ol>
      <p><a href="${esc(CHANNEL.url)}">YouTube kanalı</a> · <a href="https://juit.itch.io/">itch.io oyunları</a> · <a href="/lab.html">Mobu'nun Oyun Laboratuvarı</a></p>
      <h2>İletişim</h2><p><a href="mailto:juitexe@gmail.com">juitexe@gmail.com</a></p>
    </section>
  </main>`;
}

const juitStatic = () => ({
  name: 'juit-static-main',
  transformIndexHtml(html, ctx) {
    if (!ctx.filename.endsWith('index.html')) return html;
    return html.replace('<main id="main" class="main" tabindex="-1"></main>', staticMain());
  },
});

export default defineConfig({
  // Özel domainde kökten yayınlanır: https://juitexe.com/ (public/CNAME). github.io adresi buraya yönlenir.
  base: '/',
  plugins: [juitStatic()],
  server: { port: 5173, strictPort: false, host: true },
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      // İki giriş, tek dist/: portfolyo (index.html) + Mobu'nun Oyun Laboratuvarı (lab.html).
      input: { main: here('./index.html'), lab: here('./lab.html') },
      // three.js yalnızca laboratuvar deneylerinde kullanılır; ayrı parça olarak önbelleğe alınır.
      output: { manualChunks: id => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
});

