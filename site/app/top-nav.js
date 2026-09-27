/**
 * 共享层 · 站点顶栏导航（W16；取代原 `demo-nav.js` 的「演示导航」浮钮）
 *
 * 为什么有这个东西：11 张设计稿是**互相独立的页面**（页内只有返回链接），没有全站导航 ⇒
 * 进站后无法在页间移动。原方案补的是"默认收起的演示导航浮钮"（评审辅助），
 * 用户第 4 轮 #4 明确否掉了它：**不要演示导航，要画面上部同风格的正式导航栏**，
 * 四项 = 河道 / 公海 / 我的 / 设置（`docs/deploy-plan-html.md` §30.1 #4、§34）。
 *
 * 边界：`site/*.html` 是源、不许改 ⇒ 顶栏**整体由本模块在运行时创建**，只用 `dom.el()`
 * 与 `textContent`（不解析任何 HTML 字符串）。视觉全在 `assets/base.css` 的 `.top-nav*`，
 * 只取站点既有 token（DESIGN.md §Components 的 `nav` 形态 + §z-index 契约 sticky-nav=100）。
 *
 * 用法：每个 `page-<名>.js` 通过 `definePage()`（app/page.js）已经自动挂载了；
 * 要手动挂或读清单：
 *   import { mountTopNav, TOP_NAV } from './top-nav.js';
 *   mountTopNav();     // 幂等，重复调用不会产生第二个顶栏
 */

import { el, ensureBaseStyles } from './dom.js';

const NAV_ID = 'site-topnav';

/**
 * 顶栏四项（顺序即显示顺序）。
 *
 * 只有这四页进主导航：投一瓶 / 瓶子 / 漂流日志 / 登录 / 审核台 / 404 **各有自己的入口**
 * （河道页的泊位、公海与我的页的链接、401 出口…），不塞进顶栏 —— 顶栏是"站在全站看"的四格，
 * 不是页面清单（旧演示导航列的 10 页清单已随之删除，见 §34）。
 */
export const TOP_NAV = [
  { path: '/river.html', label: '河道' },
  { path: '/sea.html', label: '公海' },
  { path: '/me.html', label: '我的' },
  { path: '/settings.html', label: '设置' },
];

/**
 * 挂载顶栏（幂等）。插在 `body` **最前面**：Tab 的第一站就是导航，且 `<nav>` 是
 * 文档里的第一个 landmark；`position: fixed` ⇒ 不参与任何页面的构图与缩放（`fit.js` 也不碰它）。
 * @returns {HTMLElement} 顶栏根节点（已挂载则直接返回）
 */
export function mountTopNav() {
  const existing = document.getElementById(NAV_ID);
  if (existing !== null) return existing;

  ensureBaseStyles();

  const root = el('nav', { id: NAV_ID, class: 'top-nav', 'aria-label': '站点导航' }, [
    el(
      'ul',
      { class: 'top-nav__list' },
      TOP_NAV.map((item) =>
        el('li', { class: 'top-nav__item' }, [
          el('a', { class: 'top-nav__link', href: item.path, text: item.label }),
        ]),
      ),
    ),
  ]);

  document.body.prepend(root);

  /**
   * 当前页高亮：**按 `location.pathname` 精确匹配**，不按标签串猜。
   * 不在四项里的页面（投一瓶 / 瓶子 / 漂流日志 / 登录 / 审核台 / 404）就没有高亮项 —— 顶栏仍在，
   * 只是"你现在站在四格之外"，这正是我们要的语义（不是"没加载完"）。
   */
  for (const link of root.querySelectorAll('a')) {
    if (link.getAttribute('href') === location.pathname) link.setAttribute('aria-current', 'page');
  }

  return root;
}
