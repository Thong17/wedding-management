/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    // The service worker only caches the app shell (so the gift desk can reload
    // offline) and the OCR engine files. API data is never cached here: guests
    // and gift transactions live in IndexedDB.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Wedding Gift Desk',
        short_name: 'Gift Desk',
        description: 'Record wedding gifts, even offline.',
        theme_color: '#7a3b5c',
        background_color: '#faf7f8',
        display: 'standalone',
        start_url: '/',
        id: '/',
        // Android only offers to install with PNG icons at 192 and 512 px. The maskable one is a full
        // square with the gift inside the safe zone, for launchers that crop icons to circles.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The e-invite fonts (Fontsource: <family>-<subset>-<weight>-normal|italic-<hash>.woff2) are only for
        // invitations: fetched when one is opened (runtime cache below), not part of the gift desk's install.
        globIgnores: ['**/*-normal-*.woff2', '**/*-italic-*.woff2'],
        navigateFallback: 'index.html',
        // Served by Django / Caddy on the same domain in production, not by the app.
        navigateFallbackDenylist: [/^\/api\//, /^\/admin(\/|$)/, /^\/static\//, /^\/media\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Invitation fonts: content-hashed file names, so cache them for good once used.
            urlPattern: ({ url }) => /-(normal|italic)-[\w-]+\.woff2$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'invite-fonts', expiration: { maxEntries: 60 } },
          },
          {
            // Profile pictures, so the navbar avatar still shows offline. Every upload gets a
            // new file name, so a cached picture is never stale.
            urlPattern: ({ url }) => url.pathname.startsWith('/media/avatars/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'avatars',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Tesseract worker/core (wasm) and language data, cached on first use.
            urlPattern: ({ url }) =>
              (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('tesseract')) ||
              url.hostname === 'tessdata.projectnaptha.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-engine',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
