import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

/**
 * jsdom 没有实现 `window.scrollTo`（会打印 "Not implemented"），
 * 而路由在每次路径变化时都会把主内容滚回顶部。这里补一个空实现，保持测试输出干净。
 */
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined;
}
