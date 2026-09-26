/**
 * 共享层 · 页面装配（W0 冻结；之后只有 captain 能改）
 *
 * 每个 `page-<名>.js` 只用它做三件事：
 *   1. 注入共享层样式（`base.css`）；
 *   2. 挂载演示导航；
 *   3. 打一条 console 说明"本页 W1 要接哪些端点"，并在 DOMContentLoaded 之后自动调用一次 `init()`。
 *
 * 为什么自动调用：页面只加了一个 `<script type="module" src="/app/page-x.js">`，
 * 若还要 HTML 再写一行 `init()`，W1 每页都会漏 —— 所以脚本一加载就自己跑。
 *
 * W1 的用法（只改自己那一个 `page-<名>.js`）：
 *   export const { init } = definePage({
 *     name: 'sea',
 *     owner: 'W1-c',
 *     endpoints: ['GET /api/sea'],
 *     init: async () => { const page = await get('/api/sea'); render(page); },
 *   });
 * 仍然允许 W1 完全不用 `definePage`（自己 import 共享层）——那份自由只限本页文件。
 */

import { ensureBaseStyles } from './dom.js';
import { installFit } from './fit.js';
import { mountDemoNav } from './demo-nav.js';

/**
 * @param {{ name: string, owner?: string, endpoints?: string[], note?: string|null,
 *           init?: (() => void|Promise<void>)|null }} config
 * @returns {{ init: () => Promise<void> }} 与 `init()` 同一个函数的引用
 */
export function definePage(config) {
  const { name, owner = '', endpoints = [], note = null, init = null } = config;

  ensureBaseStyles();
  // 顺序要紧：先把画布搬进 #fit-stage 并缩放，再挂演示导航
  //（导航追加到 body、position:fixed ⇒ 留在 stage 外，不被缩放）。
  installFit();
  mountDemoNav();

  async function pageInit() {
    const scope = owner === '' ? '' : `（归属 ${owner}）`;
    const list = endpoints.length === 0 ? '无端点依赖（纯静态页）' : endpoints.join('、');
    console.info(`[page:${name}] W0 空壳已加载${scope} —— W1 在本页接入：${list}${note === null ? '' : `；${note}`}`);
    if (typeof init === 'function') await init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void pageInit(), { once: true });
  } else {
    queueMicrotask(() => void pageInit());
  }

  return { init: pageInit };
}
