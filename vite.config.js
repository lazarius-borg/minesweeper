import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Minesweeper PWA',
        short_name: 'Minesweeper',
        description: 'A proper modern Minesweeper PWA game',
        theme_color: '#3b82f6',
        icons: [
          {
            src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48dGV4dCB5PSIuOWVtIiBmb250LXNpemU9IjkwIj7💣PC90ZXh0Pjwvc3ZnPg==',
            sizes: '192x192',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})
