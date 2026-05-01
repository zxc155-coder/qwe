import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:3001';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      strictPort: true,
      allowedHosts: true,
      hmr: false,
      proxy: {
        '/api':    { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
      },
    },
    build: { sourcemap: true },
  };
});
