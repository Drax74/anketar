import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import injectHTML from 'vite-plugin-html-inject';

export default defineConfig({
    base: '/anketar/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    },
    plugins: [
        injectHTML(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'script-defer',
            includeAssets: [
                'favicon.ico',
                'apple-touch-icon-180x180.png',
                'pwa-192x192.png',
                'pwa-512x512.png',
                'hero-cover-image.webp'
            ],
            manifest: {
                id: '/anketar/',
                name: 'Madrid Ekskurzija - Trkadzije & Rumoljubi',
                short_name: 'Madrid 2026',
                description: 'Glasajte za smještaj u Madridu!',
                theme_color: '#121316',
                background_color: '#121316',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/anketar/',
                scope: '/anketar/',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ],
                screenshots: [
                    {
                        src: 'app-preview-wide.png',
                        sizes: '2916x1748',
                        type: 'image/jpeg',
                        form_factor: 'wide',
                        label: 'Madrid Voting Desktop Dashboard'
                    },
                    {
                        src: 'app-preview.png',
                        sizes: '687x1024',
                        type: 'image/png',
                        form_factor: 'narrow',
                        label: 'Madrid Voting Dashboard'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,woff2}'],
                // Store install screenshots and optional language fonts only when needed.
                globIgnores: [
                    '**/app-preview*.png',
                    '**/inter-latin-ext*.woff2',
                    '**/inter-cyrillic*.woff2',
                    '**/inter-greek*.woff2',
                    '**/inter-vietnamese*.woff2'
                ],
                runtimeCaching: [{
                    urlPattern: ({ request, url }) => request.destination === 'font' && url.origin === self.location.origin,
                    handler: 'CacheFirst',
                    options: { cacheName: 'optional-fonts', expiration: { maxEntries: 12, maxAgeSeconds: 31536000 } }
                }]
            }
        })
    ]
});