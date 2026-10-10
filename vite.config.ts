import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // injectManifest (our own src/sw.ts) rather than generateSW so web push
    // handlers can live in the same service worker later. The manifest stays
    // the hand-maintained public/site.webmanifest.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'favicon*.png', 'android-chrome-*.png', 'maskable-icon-*.png', 'apple-touch-icon.png'],
        globIgnores: ['login-backgrounds/**', 'brand-animation/**', 'gridiron-glory-guide.html'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
