/**
 * 页面模块：`site/404.html` —— 断流页（W1-d 接线）
 *
 * 纯静态页（`docs/deploy-plan-html.md` §7.3：无端点依赖）。冻结稿里三个入口都是 `href="#"`，
 * 点了原地不动（在 404 页上等于"再断一次"）⇒ 这里把三个真实出口接上：
 *   `a.back`（回首页）→ `/river.html`；`.links` 里的两枚 → `/river.html`（捞一个）/ `/sea.html`（公海）。
 * 只改 `href`，文案与构图一字未动。
 *
 * 渲染纪律：**只用 textContent**（本页只改属性，没有文本通道）。
 */
import { q, qa } from './dom.js';
import { definePage } from './page.js';

/** 出口地址按页面上的顺序给出（冻结稿的文案已经写明去向，这里只补上地址）。 */
function wireExits() {
  const back = q('a.back'); // 「回首页」= 河道（站根 302 到 /river.html）
  if (back !== null) back.setAttribute('href', '/river.html');
  const hrefs = ['/river.html', '/sea.html']; // 去河道捞一个漂流瓶 / 去公海听完成的作品
  qa('.links a').forEach((link, index) => {
    const href = hrefs[index];
    if (href !== undefined) link.setAttribute('href', href);
  });
}

export const { init } = definePage({
  name: '404',
  owner: 'W1-d',
  endpoints: [],
  note: '纯静态：把三个 href="#" 换成真实页面',
  init: wireExits,
});
