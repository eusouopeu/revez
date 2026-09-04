import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves this as a project site at /revez/; native
  // Capacitor builds and local dev both want root-relative paths.
  base: mode === 'gh-pages' ? '/revez/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Revez',
        short_name: 'Revez',
        description: 'Planeje e poupe para repor seus itens do dia a dia',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        scope: mode === 'gh-pages' ? '/revez/' : '/',
        start_url: mode === 'gh-pages' ? '/revez/' : '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
}))
