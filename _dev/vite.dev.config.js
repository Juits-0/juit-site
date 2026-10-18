import { defineConfig } from 'vite';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export default defineConfig({
  root: path.resolve(here, '..'),
  resolve: { alias: [{ find: /^\.\.\/core\/experiment\.js$/, replacement: path.resolve(here, 'experiment_stub.js') }] },
  server: { host: true },
});
