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
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Wedding Gift Desk',
        short_name: 'Gift Desk',
        description: 'Record wedding gifts, even offline.',
        theme_color: '#7a3b5c',
        background_color: '#faf7f8',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
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
