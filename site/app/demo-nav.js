/**
 * 共享层 · 演示导航（W0 冻结；之后只有 captain 能改）
 *
 * 为什么有这个东西：11 张设计稿是**互相独立的页面**（页内只有返回链接），没有全站导航 ⇒
 * 评委进站后无法在页间移动。方案 §7.3 明确要求补一个**默认收起**的演示导航，
 * 且**不改动任何页面的构图** —— 所以它是运行时注入到 `document.body` 的浮动元素，
 * 与设计稿的 DOM 完全隔离。
 *
 * 用法：通常你不用直接 import 它 —— 每个 `page-<名>.js` 通过 `definePage()`（app/page.js）
 * 已经自动挂载了。要手动挂/查清单：
 *   import { mountDemoNav, DEMO_PAGES } from './demo-nav.js';
 *   mountDemoNav();      // 幂等，重复调用不会产生第二个导航
 */

import { el, ensureBaseStyles } from './dom.js';

const NAV_ID = 'demo-nav';

/** 站点 11 页 ↔ 设计稿来源（施工图见 `docs/deploy-plan-html.md` §7.3）。 */
export const DEMO_PAGES = [
  { path: '/river.html', label: '河道', source: 'f4-groove.html' },
  { path: '/new.html', label: '投一瓶', source: 'p-songpicker-record.html' },
  { path: '/bottle.html', label: '瓶子', source: 'p-bottle-record.html' },
  { path: '/drift-log.html', label: '漂流日志', source: 'p-driftlog-record.html' },
  { path: '/sea.html', label: '公海', source: 'p-sea-hall.html' },
  { path: '/bottle.html', label: '公海详情', source: 'p-sea-detail-record.html' },
  { path: '/me.html', label: '我的', source: 'p-profile-record.html' },
  { path: '/settings.html', label: '设置', source: 'p-settings-record.html' },
  { path: '/login.html', label: '登录 / 注册', source: 'p-login-record.html' },
  { path: '/admin.html', label: '审核台', source: 's2-admin-record.html' },
  { path: '/404.html', label: '404', source: 'p-404-record.html' },
];

const FOOTER_NOTE =
  '演示辅助：11 张定稿是各自独立的页面、原本没有全站导航；本导航由共享层注入，不属于设计稿构图。';

/** @returns {HTMLElement} 导航根节点（幂等：已挂载则直接返回）。 */
export function mountDemoNav() {
  const existing = document.getElementById(NAV_ID);
  if (existing !== null) return existing;

  ensureBaseStyles();

  const trigger = el('button', {
    id: 'demo-nav-trigger',
    class: 'demo-nav__trigger',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'demo-nav-panel',
    'aria-label': '演示导航（展开 10 页清单）',
    title: '演示辅助（共享层注入，非设计稿构图）',
    text: '演示导航',
  });

  const panel = el(
    'nav',
    { id: 'demo-nav-panel', class: 'demo-nav__panel', hidden: true, 'aria-label': '演示导航' },
    [
      el('p', { class: 'demo-nav__title', text: '演示导航 · 10 页' }),
      el(
        'ul',
        { class: 'demo-nav__list' },
        DEMO_PAGES.map((page) =>
          el('li', { class: 'demo-nav__item' }, [
            el('a', { href: page.path, class: 'demo-nav__link' }, [
              el('span', { class: 'demo-nav__label', text: page.label }),
              el('span', { class: 'demo-nav__path', text: page.path }),
            ]),
          ]),
        ),
      ),
      el('p', { class: 'demo-nav__note', text: FOOTER_NOTE }),
    ],
  );

  const root = el('div', { id: NAV_ID, class: 'demo-nav', 'data-demo-aid': 'true' }, [panel, trigger]);
  document.body.append(root);

  for (const link of panel.querySelectorAll('a')) {
    if (link.getAttribute('href') === location.pathname) link.setAttribute('aria-current', 'page');
  }

  trigger.addEventListener('click', () => {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    trigger.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  return root;
}
