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
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
