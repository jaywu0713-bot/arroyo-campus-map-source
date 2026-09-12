import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: path.resolve(__dirname, 'static'),
  base: '/',
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'next/link': path.resolve(__dirname, 'static/next-link.tsx'),
    },
  },
  plugins: [react()],
  build: {
    outDir: 'static-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'static/index.html'),
    },
  },
});
