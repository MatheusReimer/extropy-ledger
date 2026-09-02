import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite reads .env from its own project root by default, which here would be
// apps/web. The repo keeps a single .env at the top, so point Vite at it -
// otherwise VITE_ variables set there are silently ignored.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');

  return {
    envDir: repoRoot,
    plugins: [react()],
    server: {
      port: 5173,
      /**
       * The dev proxy mirrors what CloudFront does in production: take /api/*,
       * strip the prefix, forward to the API.
       *
       * That symmetry is the point. The frontend talks to a same-origin "/api"
       * in both environments, so there is no API URL baked into the build, no
       * CORS in the browser during development, and no "works locally, breaks
       * deployed" gap between the two. Setting VITE_API_URL overrides this and
       * is only needed to point a local UI at an already-deployed API.
       */
      proxy: {
        '/api': {
          target: `http://localhost:${env['PORT'] ?? '3000'}`,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Recharts and Chakra are heavy and change rarely. Splitting them out of
          // the app code lets the next deploy reuse the browser cache instead of
          // re-sending ~700 kB because a button label changed.
          manualChunks: {
            charts: ['recharts'],
            ui: ['@chakra-ui/react', '@emotion/react'],
          },
        },
      },
    },
  };
});
