import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      wasm(),
      topLevelAwait(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Multi-Chain Scanner',
          short_name: 'MCScanner',
          description: 'Search multichain paths instantly',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          icons: [
            {
              src: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=025',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=025',
              sizes: '512x512',
              type: 'image/svg+xml'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        buffer: 'buffer',
        process: 'process/browser',
        stream: 'stream-browserify',
        util: 'util',
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
    worker: {
      format: 'es',
      plugins: () => [wasm(), topLevelAwait()]
    },
    build: {
      target: 'esnext'
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
