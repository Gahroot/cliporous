import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const __dirname_esm = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    resolve: {
      alias: [{ find: '@shared', replacement: resolve(__dirname_esm, 'src/shared') }],
    },
    build: {
      externalizeDeps: {
        exclude: ['uuid'],
        // Dev-only (devDependency since the prebuilt release bundle): render.ts
        // imports it lazily when !app.isPackaged. Inlining it breaks rspack's
        // native `@rspack/binding` require, so explainer scenes never render.
        include: ['@remotion/bundler'],
      },
    },
  },
  preload: {
    resolve: {
      alias: [{ find: '@shared', replacement: resolve(__dirname_esm, 'src/shared') }],
    },
    build: {
      externalizeDeps: true,
    },
  },
  renderer: {
    worker: {
      format: 'es',
    },
    resolve: {
      alias: [
        { find: '@shared', replacement: resolve(__dirname_esm, 'src/shared') },
        { find: '@', replacement: resolve(__dirname_esm, 'src/renderer/src') },
      ],
    },
    plugins: [react()],
  },
});
