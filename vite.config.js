import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'client',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(path.join(__dirname, 'client', 'tailwind.config.cjs')),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        // ⭐ 修复：Vite 默认不会代理 multipart/form-data，需要 rewrite
        rewrite: (path) => path.replace(/^\/api/, '/api'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // multer 需要保留原始 multipart body，不要让 vite 重写 body
            if (req.headers['content-type']?.includes('multipart/form-data')) {
              proxyReq.setHeader('Content-Type', req.headers['content-type']);
              proxyReq.setHeader('Content-Length', req.headers['content-length']);
            }
          });
        },
      },
    },
  },
});