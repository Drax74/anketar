import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: '/anketar/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'pwa-192x192.png', 'pwa-512x512.png', 'app-preview.png', 'app-preview-wide.png'],
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
                        sizes: '2874x1748',
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
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}']
            }
        })
    ]
});