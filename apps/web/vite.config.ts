import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 端口与代理目标是设计契约，改动需同步 design.md「本地开发拓扑」。
export default defineConfig({
  // Tailwind v4 走 Vite 插件（CSS-first：token 定义见 src/design-system/theme.css）。
  // 缺少这个插件时 @import 'tailwindcss' 不会展开 utilities，组件样式会全部失效。
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // 默认仍是契约里的 8787；`MDB_API_TARGET` 只给 hermetic 量测脚本用
      // （`one-screen-check.mjs` 自起一次性库 + 自起 API，再把 proxy 指过去。
      //  否则"量真实高度"这件事会反过来往共享开发库里灌数据，甚至用库里的脏数据决定判据）。
      '/api': {
        target: process.env['MDB_API_TARGET'] ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
