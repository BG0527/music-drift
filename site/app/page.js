/**
 * 共享层 · 页面装配（W0 冻结；之后只有 captain 能改）
 *
 * 每个 `page-<名>.js` 只用它做三件事：
 *   1. 注入共享层样式（`base.css`）；
 *   2. 挂站点顶栏导航（`top-nav.js`）；
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
import { mountTopNav } from './top-nav.js';

/** 发布版补丁目录（见 `docs/deploy-plan-html.md` §20）。 */
const PATCH_DIR = '/patches/';

/**
 * 探测本页补丁是否存在（`site/patches/<slug>.css`，存在即生效）。
 *
 * 为什么是**同步** XHR：`fit.js` 在模块求值时就安装（把画布搬进 `#fit-stage` 并缩放），
 * 而"这一页有没有补丁"这个事实必须**在它之前**就有答案 —— 否则补丁页面会先被缩放，
 * 再回滚，用户看到一次跳变。异步 `fetch` + 等待会让时序变成"先装缩放再撤销"。
 * 一次同源 HEAD，命中本地静态文件（`tools/site-server.mjs` 已支持 HEAD），代价可忽略。
 *
 * 失败（`file://` 直开、断网、跨源）一律当"没有补丁" ⇒ 退回今天的等比缩放，行为不变。
 */
function patchHref(slug) {
  const href = `${PATCH_DIR}${slug}.css`;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', href, false);
    xhr.send(null);
    return xhr.status === 200 ? href : null;
  } catch {
    return null;
  }
}

/**
 * 装上补丁：注入 `<link>`（放在 `head` 末尾 ⇒ 在定稿页自己的 `<style>` 之后，
 * 同特异性下补丁胜出，页面 HTML 一律不改），并把"本页走流体版式"这件事说出口。
 *
 * @returns {boolean} 是否装上了补丁
 */
function installPatch(slug) {
  const href = patchHref(slug);
  if (href === null) return false;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-site-patch', slug);
  document.head.append(link);
  // 逃生开关：`fit.js` 见到它就什么都不做（补丁页的版式由 CSS 自己随视口伸缩）。
  document.body.dataset.fitOff = 'true';
  /** 探针/测试信号：`tools/probe-fit.mjs` 据此走"流体页"的判据（不是靠猜有没有 stage）。 */
  document.documentElement.dataset.fluid = slug;
  return true;
}

/**
 * @param {{ name: string, owner?: string, endpoints?: string[], note?: string|null,
 *           init?: (() => void|Promise<void>)|null }} config
 * @returns {{ init: () => Promise<void> }} 与 `init()` 同一个函数的引用
 */
export function definePage(config) {
  const { name, owner = '', endpoints = [], note = null, init = null } = config;

  ensureBaseStyles();
  // 顺序要紧：**先判补丁、再装缩放**（补丁页必须先有 `data-fit-off`），最后挂站点顶栏
  //（顶栏插到 body 最前、position:fixed ⇒ 不被缩放，也不参与页面构图；各页补丁按
  //  `var(--top-nav-h)` 把顶层内容下移，见 docs/deploy-plan-html.md §34）。
  installPatch(name);
  installFit();
  mountTopNav();

  async function pageInit() {
    const scope = owner === '' ? '' : `（归属 ${owner}）`;
    const list = endpoints.length === 0 ? '无端点依赖（纯静态页）' : endpoints.join('、');
    console.info(`[page:${name}] W0 空壳已加载${scope} —— W1 在本页接入：${list}${note === null ? '' : `；${note}`}`);
    try {
      if (typeof init === 'function') await init();
    } catch (error) {
      /**
       * 接线失败 ⇒ **不**自称 ready（测试据此判红，而不是靠某个 class 抢跑）。
       * 只加信号：`void pageInit()` 的未捕获 rejection 语义与之前一致。
       */
      document.documentElement.dataset.pageError = name;
      console.error(`[page:${name}] init 失败：`, error);
      throw error;
    }
    /** 接线完成的可用信号（W3 可测性；不涉及任何视觉）：`init()` 全部 await 完才置上。 */
    document.documentElement.dataset.pageReady = name;
    window.__pageReady = name;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void pageInit(), { once: true });
  } else {
    queueMicrotask(() => void pageInit());
  }

  return { init: pageInit };
}
