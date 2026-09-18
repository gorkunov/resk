import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  // App icons live at the repo root and are copied verbatim into the client build.
  publicDir: fileURLToPath(new URL('./icons', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Swap shiki's full language bundle for a curated one; see src/client/shiki-subset.ts.
      {
        find: /^shiki$/,
        replacement: fileURLToPath(new URL('./src/client/shiki-subset.ts', import.meta.url)),
      },
      {
        find: /^shiki\/wasm$/,
        replacement: fileURLToPath(new URL('./src/client/shiki-wasm-stub.ts', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4989',
    },
  },
});
