import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    // BLACK-SCREEN FIX: relative base — WebView (appassets.androidplatform.net)
    // me absolute /assets paths resolve nahi hote => JS load nahi hota => black screen.
    base: './',
    build: {
      // Purane WebView ke liye compatible syntax (es2018) — modern syntax pe
      // old devices pe SyntaxError => black screen.
      target: 'es2018',
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
