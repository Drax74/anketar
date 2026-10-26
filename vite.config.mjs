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
            // Match your exact public filenames here:
            includeAssets: ['favicon.ico', 'pwa-192x192.png', 'pwa-512x512.png'],
            manifest: {
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
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}']
            }
        })
    ]
});