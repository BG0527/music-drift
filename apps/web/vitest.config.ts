/**
 * vitest 专用配置（t19 Part 3）。**只做一件事**：把超时提到 15s，与 `apps/api/vitest.config.ts` 对齐。
 *
 * ⚠️ 为什么这里几乎是空的：vitest 会**优先**加载 `vitest.config.ts`（存在即忽略 `vite.config.ts` 的
 * `test` 块）。因此本文件若把 jsdom / setupFiles / include / react+tailwind 插件再抄一遍，就会立刻
 * 出现两个真相源（改一处漏一处，而且漏掉插件时样式相关断言会以奇怪的方式红）。这里的做法是
 * **继承** `vite.config.ts` 的全量配置，只覆盖超时。
 *
 * 依据：`showcase.test.tsx` 单跑 3.3s、满载逼近 vitest 默认 5s —— 与 api 侧同一指纹
 *（首个 import 重型模块的用例吃完整 transform 成本，CPU 争用时顶破默认值，症状是"第一条用例超时、
 * 其余几毫秒全过、复跑即绿"）。那是与代码正确性无关的基线红，不是要修的 bug。
 */
import viteConfig from './vite.config';

export default {
  ...viteConfig,
  test: {
    ...viteConfig.test,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
};
