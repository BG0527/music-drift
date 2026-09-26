/**
 * 页面模块：`site/me.html`（W0 空壳）
 *
 * 归属：**W1-c** agent 独占本文件（`site/app/` 下的共享层只有 captain 能改）。
 * 本文件由 `me.html` 的 `<script type="module" src="/app/page-me.js">` 引入；
 * `definePage` 会在 DOMContentLoaded 之后自动调用一次 `init()`（也可手动 import 后调用）。
 *
 * W1 要做的事：把下面的 `endpoints` 逐个接上真数据，渲染一律走 `bind()`（只写 textContent）。
 * 四个状态用 `showLoading / showEmpty / showError / showWaking`（见 app/dom.js）。
 */
import { definePage } from './page.js';

export const { init } = definePage({
  name: 'me',
  owner: 'W1-c',
  endpoints: [
    'GET /api/me/bottles',
    'GET /api/notifications',
    'POST /api/notifications/:id/read',
    'GET /api/me/collections',
    'GET /api/me/badges',
    'GET /api/me/anonymous-codes',
  ],
});
