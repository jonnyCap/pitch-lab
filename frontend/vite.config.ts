import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pitch Lab',
        short_name: 'Pitch Lab',
        description: 'Learn music fundamentals and train absolute pitch.',
        theme_color: '#f4f3ee',
        background_color: '#f4f3ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Notation (VexFlow + Bravura) is ~600 kB and only needed in Learn: don't make every
        // first visit download it; cache it on first use instead.
        globIgnores: ['**/vexflow-*.js', '**/Bravura-*.woff2'],
        navigateFallbackDenylist: [/^\/samples\//],
        runtimeCaching: [
          {
            // Hashed file names = immutable.
            urlPattern: ({ url }) => /\/assets\/(vexflow-|Bravura-)/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pitchlab-notation',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Instrument samples are versioned & immutable: cache-first for offline training.
            urlPattern: ({ url }) => url.pathname.startsWith('/samples/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pitchlab-samples-v1',
              expiration: { maxEntries: 2000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
