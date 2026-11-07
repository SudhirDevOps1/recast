import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    // Workspace packages are TypeScript-source packages (their "exports"
    // point at ./src/*.ts). They MUST be bundled: if they stay external the
    // Electron ESM loader tries to import TS source at runtime and dies with
    // ERR_MODULE_NOT_FOUND before any window is created. Native and node
    // dependencies stay external.
    plugins: [externalizeDepsPlugin({
      // Workspace packages are TypeScript-source packages (their "exports"
      // point at ./src/*.ts): they MUST be bundled or the Electron ESM loader
      // dies with ERR_MODULE_NOT_FOUND before any window is created.
      // electron-updater is CommonJS whose named exports defeat Electron's
      // cjs-module-lexer — bundling it applies the CommonJS transform.
      exclude: ['@recast/shared', '@recast/editor', '@recast/capture', 'electron-updater'],
    })],
    resolve: {
      alias: [
        { find: /^@recast\/shared\/node$/, replacement: resolve(__dirname, '../../packages/shared/src/ffmpeg/index.ts') },
        { find: /^@recast\/shared$/, replacement: resolve(__dirname, '../../packages/shared/src/index.ts') },
        { find: '@recast/editor', replacement: resolve(__dirname, '../../packages/editor/src/index.ts') },
        { find: '@recast/capture', replacement: resolve(__dirname, '../../packages/capture/src/index.ts') },
      ],
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({
      // Sandboxed preloads may only require('electron') and builtins — every
      // runtime dependency (zod for IPC schema validation) must be bundled.
      exclude: ['@recast/shared', 'zod'],
    })],
    resolve: {
      alias: [
        { find: /^@recast\/shared\/node$/, replacement: resolve(__dirname, '../../packages/shared/src/ffmpeg/index.ts') },
        { find: /^@recast\/shared$/, replacement: resolve(__dirname, '../../packages/shared/src/index.ts') },
      ],
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        // Sandboxed preloads must be CommonJS: Electron only supports ESM
        // preload scripts when sandbox is disabled, and Recast ships with
        // sandbox: true. Under "type": "module" electron-vite would otherwise
        // emit index.mjs while the window code loads ../preload/index.js.
        output: { format: 'cjs', entryFileNames: '[name].js' },
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
