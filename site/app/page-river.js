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
 * 页脚的心情标签（`.tag`）是本页唯一的「纯交互」件（W14）：切换选中态**不调用任何端点**，
 * 视觉就是页面自己的 `.tag[aria-pressed='true']`，本身不增删节点 ⇒ 构图坐标一动不动。
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

/** 心情标签 = 页脚那排 `<button class="tag">`：全部 / 深夜 / 通勤 / 告白 / 雨天。 */
const TAG_SELECTOR = 'footer .tag';

/**
 * 选中的心情（= 那个标签的文字）。**存在模块作用域，不挂在某个节点上**：
 * 页面重渲染、页脚被换掉之后要按它把选中态拨回来，否则用户点出来的选择会被一次重画抹回定稿默认。
 */
let mood = null;

const tagLabel = (tag) => (tag.textContent ?? '').trim();

/**
 * **单选**：恰有一个标签 `aria-pressed="true"`。
 * 依据：这排标签的第一个是「全部」（定稿就把它标成选中），即"复位项" —— 多选会让「全部 + 深夜」自相矛盾；
 * 它们的位置与措辞（深夜/通勤/告白/雨天）也是筛选取景的语义。
 * 首次调用采纳页面自带的默认态；之后一律以 `mood` 为准 —— 这就是"重挂载后状态还在"的全部机制。
 */
function syncMood() {
  const tags = qa(TAG_SELECTOR);
  if (tags.length === 0) return;
  if (mood === null || !tags.some((tag) => tagLabel(tag) === mood)) {
    mood = tagLabel(tags.find((tag) => tag.getAttribute('aria-pressed') === 'true') ?? tags[0]);
  }
  for (const tag of tags) tag.setAttribute('aria-pressed', String(tagLabel(tag) === mood));
}

/** 点中的那个成为唯一选中项；再点它本身是空操作（有「全部」当复位项 ⇒ 不存在"一个都没选"）。 */
function selectMood(tag) {
  const next = tagLabel(tag);
  if (next === mood) return;
  mood = next;
  syncMood();
}

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

  // 心情标签：**只切 `aria-pressed`**（页面自己的激活态语言就是 `.tag[aria-pressed='true']`），
  // 不增删任何节点 ⇒ 河道页的构图坐标一个都不动。点击走**事件委托**：重挂载出来的新节点无需重新绑。
  syncMood();
  on(document, 'click', (event) => {
    const tag = event.target instanceof Element ? event.target.closest(TAG_SELECTOR) : null;
    if (tag !== null) selectMood(tag);
  });
  // 页面重渲染 / 页脚重挂载（`showState` 系列会动 body，数据渲染会换掉页脚）之后把选择拨回来。
  // `syncMood` 只改属性、不插节点 ⇒ 不会自激（本观察者只看 childList）。
  new MutationObserver(syncMood).observe(document.body, { childList: true, subtree: true });
}

export const { init } = definePage({
  name: 'river',
  owner: 'W1-a',
  endpoints: ['POST /api/river/draw'],
  note: '投下 → /new.html；捞到 → /bottle.html?id=；空河道/出错/唤醒用 dom.showState 系列',
  init: wire,
});
