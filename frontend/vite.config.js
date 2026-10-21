import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The Trace Lab page, served at /lab/. Every request it makes is relative (/backend/trace-lab/... for Trace Lab,
// /backend/ops-intelligence/api/auth/... for Hoistra's sign-in), so the page works wherever /lab/ and those two
// paths share one address: behind Hoistra's gateway, or behind this repo's own nginx (nginx/default.conf.template).
//
// `npm run dev` serves on :5173 and proxies /backend/* to VITE_DEV_PROXY_TARGET (default: Hoistra's local gateway on
// :3000), so the browser stays same-origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: '/lab/',
    plugins: [react()],
    server: {
      port: Number(process.env.PORT) || 5173,
      host: true,
      proxy: {
        '/backend': {
          target: process.env.VITE_DEV_PROXY_TARGET || env.VITE_DEV_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 900
    }
  };
});
