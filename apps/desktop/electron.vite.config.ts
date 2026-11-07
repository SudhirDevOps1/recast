import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@recast/shared': resolve(__dirname, '../../packages/shared/src'),
        '@recast/editor': resolve(__dirname, '../../packages/editor/src'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@recast/shared': resolve(__dirname, '../../packages/shared/src'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@recast/shared': resolve(__dirname, '../../packages/shared/src'),
        '@recast/editor': resolve(__dirname, '../../packages/editor/src'),
        '@recast/capture': resolve(__dirname, '../../packages/capture/src'),
        '@recast/export': resolve(__dirname, '../../packages/export/src'),
        '@recast/ui': resolve(__dirname, '../../packages/ui/src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          toolbar: resolve(__dirname, 'src/renderer/toolbar.html'),
          area: resolve(__dirname, 'src/renderer/area.html'),
        },
      },
    },
  },
});
