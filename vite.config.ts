import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script',
        manifest: false, // we already have our own custom manifest.json in /public
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,gif,svg,ico,json,webmanifest}'],
          // El panel admin se carga bajo demanda: precachearlo anulaba en ancho
          // de banda la ventaja del React.lazy para el cliente de la tienda.
          globIgnores: ['**/AdminPanel-*.js'],
          // Techo por archivo, para que un chunk pesado no entre al precache.
          maximumFileSizeToCacheInBytes: 600 * 1024,
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 365 days
                }
              }
            },
            {
              urlPattern: /.*/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'general-runtime-cache',
                networkTimeoutSeconds: 3
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Firebase en su propio chunk: cachea aparte del código de la app,
            // que cambia mucho más seguido.
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
