import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA, type ManifestOptions } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

/**
 * Two serving modes:
 *  - default (`npm run dev` / `npm run preview`)         -> http://localhost
 *  - https   (`npm run dev:pos` / `npm run preview:pos`) -> https on the LAN so the PWA
 *    can be installed on the target POS device (service workers require a secure
 *    context outside of localhost).
 *
 * The web app manifest is served as a static file (public/manifest.webmanifest) so the
 * exact same manifest drives development, preview and production installs.
 */
// (moved below — single canonical config with PWA)

/**
 * Two serving modes:
 *  - default (`npm run dev` / `npm run preview`)  -> http://localhost
 *  - https  (`npm run dev:pos` / `npm run preview:pos`) -> https on the LAN so the
 *    PWA can be installed and tested on the target POS device (service workers
 *    require a secure context outside of localhost).
 */
export default defineConfig(({ mode }) => {
  const useHttps = mode === 'https' || process.env.VITE_HTTPS === 'true';

  const manifest = {
    id: '/',
    name: process.env.VITE_APP_NAME || 'Delivery System',
    short_name: 'Delivery',
    description:
      'Order food, follow every order live, and run the whole kitchen and business from one installable app.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['fullscreen', 'standalone', 'minimal-ui'],
    orientation: 'any',
    theme_color: '#0b1120',
    background_color: '#0b1120',
    lang: 'en',
    dir: 'ltr',
    categories: ['food', 'shopping', 'business'],
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Kitchen queue',
        short_name: 'Kitchen',
        description: 'Open the incoming order queue',
        url: '/kitchen',
        icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'My orders',
        short_name: 'Orders',
        description: 'Track and reorder',
        url: '/app/orders',
        icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
      },
      {
        name: 'Admin dashboard',
        short_name: 'Admin',
        description: 'Business analytics and reports',
        url: '/admin',
        icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
      },
    ],
  } as unknown as Partial<ManifestOptions>;

  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (useHttps) plugins.push(basicSsl());

  plugins.push(
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg', 'robots.txt', 'offline.html'],
      manifest,
      manifestFilename: 'manifest.webmanifest',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,avif,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        offlineGoogleAnalytics: false,
        runtimeCaching: [
          {
            // Live business data: always try the network first, fall back to cache when offline.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\/uploads\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'product-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|gif|ico)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'same-origin-assets',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  );

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // Consume the shared workspace source directly: the package's NodeNext
        // build is CommonJS, which browsers cannot import in dev. Bundling the
        // TS source keeps dev and production identical and gives instant HMR.
        '@delivery/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      port: 5173,
      host: true,
      strictPort: false,
    },
    preview: {
      port: 4173,
      host: true,
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('recharts') || id.includes('d3-')) return 'charts';
              if (id.includes('@tanstack/react-query')) return 'query';
              if (id.includes('react') || id.includes('scheduler')) return 'react';
            }
            return undefined;
          },
        },
      },
    },
  };
});