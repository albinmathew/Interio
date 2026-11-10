import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Ports come from the repo-root .env (or the shell), so several worktrees can run side by side.
  const env = { ...loadEnv(mode, '../..', 'INTERIO_'), ...process.env };
  const webPort = Number(env.INTERIO_WEB_PORT ?? 5173);
  const apiPort = Number(env.INTERIO_API_PORT ?? 8787);
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: webPort,
      strictPort: true,
      proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true } },
    },
    preview: { port: webPort, strictPort: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
    optimizeDeps: { exclude: ['@interio/core', '@interio/scene3d', '@interio/importer', '@interio/catalog'] },
  };
});
