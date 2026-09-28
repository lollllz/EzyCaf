import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE || (mode === 'pages' ? '/kamil/' : '/');

  return {
    plugins: [react()],
    base,
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3847',
        '/uploads': 'http://localhost:3847',
        '/socket.io': {
          target: 'http://localhost:3847',
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
