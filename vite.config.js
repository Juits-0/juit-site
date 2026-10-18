import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // GitHub Pages alt klasörde yayınlanır: https://juits-0.github.io/juit-site/
  base: '/juit-site/',
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
