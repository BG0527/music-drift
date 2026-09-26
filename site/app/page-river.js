/**
 * 页面模块：`site/river.html`（W1-a 接线）
 *
 * 端点：`POST /api/river/draw`（本页唯一）。
 *   - 成功 → `/bottle.html?id=<瓶子 id>`；
 *   - 409 `NO_BOTTLE_AVAILABLE`（河道里没有可捞的瓶子）→ **空态**，文案直接用服务端给的；
 *   - 其余业务错误 → 出错态，文案同样来自服务端的 `error.message`（不自己编）；
 *   - 连不上 / 502 / 503（后端没起或冷启动）→ 唤醒态（`showRequestFailure` 负责分流）。
 *   - 未登录 → `requireUser()` 引到 `/login.html?next=/river.html`。
 *
 * 本文件**不改 HTML**（`site/*.html` 是发布副本，由 `tools/sync-site.mjs` 生成）：
 * 只用页面已有的 class 名（`.port.draw` / `.port.cast` / `footer .go` / `footer .tag`）定位。
 * 页面默认态是设计定的「空河道在等」——不画瓶子、不伪造数据；文案一律 `textContent`。
 */
import { post } from './api.js';
import { clearState, on, q, qa, showEmpty, showError, showLoading, showRequestFailure } from './dom.js';
import { requireUser } from './session.js';
import { definePage } from './page.js';

const DRAW_ENDPOINT = '/api/river/draw';
const CAST_TARGET = '/new.html';
const SEA_TARGET = '/sea.html';
/** 河道空 = 内核的稳定码（`NO_BOTTLE_AVAILABLE` → 409）：语义是「空态」，不是「出错」。 */
const EMPTY_RIVER_CODE = 'NO_BOTTLE_AVAILABLE';

let drawing = false;

/** 键盘可达（泊位在设计里是 `<div role="button">`，没有 tabindex）。 */
function activate(element, handler) {
  if (element === null) return;
  element.setAttribute('tabindex', '0');
  on(element, 'click', handler);
  on(element, 'keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handler();
  });
}

function setBusy(value) {
  drawing = value;
  const port = q('.port.draw');
  if (port !== null) port.setAttribute('aria-busy', String(value));
}

async function draw() {
  if (drawing) return;
  setBusy(true);
  showLoading('正在河道里撒网…');
  try {
    const user = await requireUser();
    if (user === null) {
      clearState();
      return;
    }
    const response = await post(DRAW_ENDPOINT);
    const id = response?.bottle?.id ?? null;
    if (typeof id !== 'string' || id === '') {
      showError('捞取失败：服务端没有返回瓶子 id。', { onRetry: draw });
      return;
    }
    location.assign(`/bottle.html?id=${encodeURIComponent(id)}`);
  } catch (error) {
    if (error?.code === EMPTY_RIVER_CODE) showEmpty(error.message, { onRetry: draw });
    else showRequestFailure(error, { onRetry: draw });
  } finally {
    setBusy(false);
  }
}

function wire() {
  activate(q('.port.draw'), draw);
  activate(q('.port.cast'), () => location.assign(CAST_TARGET));

  // 页脚「先去公海听听已经完成的作品」在设计稿里是 `href="#"`（点了没反应）；接到公海页。
  const sea = q('footer .go');
  if (sea !== null) sea.setAttribute('href', SEA_TARGET);

  // 心情标签是设计稿的演示控件：河道只有随机捞取，没有按心情筛选的端点。
  // 只标 `aria-disabled`（无声明的视觉变化），不改动构图与既有样式。
  for (const tag of qa('footer .tag')) {
    if (tag.getAttribute('aria-pressed') === 'true') continue;
    tag.setAttribute('aria-disabled', 'true');
    tag.setAttribute('title', '演示控件：河道按心情筛选尚未接入后端');
  }
}

export const { init } = definePage({
  name: 'river',
  owner: 'W1-a',
  endpoints: ['POST /api/river/draw'],
  note: '投下 → /new.html；捞到 → /bottle.html?id=；空河道/出错/唤醒用 dom.showState 系列',
  init: wire,
});
