// Laboratuvar çekirdeği için ayrı Vite yapılandırması (lab.html giriş noktası).
// Ana site kabuğu (index.html) hazır olunca bu dosyaya gerek kalmaz: start() çağrısı yeterlidir.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false, host: true },
  build: {
    target: 'es2020',
    outDir: 'dist-lab',
    rollupOptions: {
      input: { lab: resolve(import.meta.dirname || '.', 'lab.html') },
      output: { manualChunks: id => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
});
