import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 端口与代理目标是设计契约，改动需同步 design.md「本地开发拓扑」。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
