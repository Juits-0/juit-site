import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages alt klasörde yayınlanır: https://juits-0.github.io/juit-site/
  base: '/juit-site/',
  server: { port: 5173, strictPort: false, host: true },
  build: { target: 'es2020', sourcemap: false, assetsInlineLimit: 0 },
});
