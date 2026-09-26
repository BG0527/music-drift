/**
 * 共享层 · DOM 与状态（W0 冻结；之后只有 captain 能改）
 *
 * 纪律（ADR：`docs/deploy-plan-html.md` §3 第 14 条）：**一切文本只走 `textContent`**，
 * 任何"把字符串当 HTML 解析"的 API 在本层**不存在**（连名字都不出现，免得静态守卫误伤注释）。
 * 匿名代号 / 曲名 / 留言都是用户输入，一次 HTML 注入就可能被偷会话。
 * 所以本模块只提供文本通道（`bind` / `el({ text })`），不提供任何 HTML 注入入口。
 *
 * 用法（W1 只消费，不要改本文件）：
 *   import { q, qa, on, bind, bindMany, el, show, hide,
 *            showLoading, showEmpty, showError, showWaking, clearState } from './dom.js';
 *
 *   bind('bottle.title', bottle.title);            // 填所有 [data-bind="bottle.title"]
 *   bindMany({ 'bottle.mood': mood, 'bottle.code': code });
 *   const list = q('#segments');
 *   for (const seg of segments) list.append(el('li', { class: 'seg' }, [el('span', { text: seg.label })]));
 *   on(q('#vote-up'), 'click', () => post('/api/segments/' + seg.id + '/votes', { value: 'UP' }));
 */

const SHARED_STYLES_HREF = '/app/assets/base.css';
const STATE_KINDS = ['loading', 'empty', 'error', 'waking'];
const STATE_FALLBACK_TEXT = {
  loading: '正在加载…',
  empty: '这里还是空的。',
  error: '出错了，请稍后重试。',
  waking: '正在唤醒服务：第一次请求可能要等十几秒，请不要刷新。',
};

let baseStylesReady = false;

/** 注入共享层样式（只有演示导航与状态条；**不动设计稿的任何视觉值**）。可重复调用。 */
export function ensureBaseStyles() {
  if (baseStylesReady) return;
  baseStylesReady = true;
  if (document.querySelector('link[data-shared-styles]') !== null) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = SHARED_STYLES_HREF;
  link.setAttribute('data-shared-styles', '');
  document.head.append(link);
}

export function q(selector, root = document) {
  return root.querySelector(selector);
}

/** `Array.from` 而不是 NodeList：W1 里 `.map` / `.forEach` 更顺手。 */
export function qa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** 绑事件，返回解绑函数。 */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** 用 `hidden` 属性隐藏（base.css 里 `[hidden] { display: none !important }`，压得住页面自己的 display）。 */
export function hide(element) {
  if (element !== null && element !== undefined) element.hidden = true;
  return element;
}

export function show(element) {
  if (element !== null && element !== undefined) element.hidden = false;
  return element;
}

export function setVisible(element, visible) {
  return visible ? show(element) : hide(element);
}

export function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

const BIND_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;

/**
 * 按 `data-bind="<name>"` 取值写文本（**只写 textContent**）。
 * @returns {number} 命中的节点数（W1 可用它自查"挂点是否接上"）
 */
export function bind(name, value, root = document) {
  if (typeof name !== 'string' || !BIND_NAME_PATTERN.test(name)) {
    throw new Error(`data-bind 名字不合法：${String(name)}（只允许字母数字与 _ . : -）`);
  }
  const nodes = qa(`[data-bind="${name}"]`, root);
  const text = toText(value);
  for (const node of nodes) node.textContent = text;
  return nodes.length;
}

export function bindMany(entries, root = document) {
  let count = 0;
  for (const [name, value] of Object.entries(entries)) count += bind(name, value, root);
  return count;
}

/**
 * 建元素（**唯一出口，永不解析 HTML 字符串**）。
 * `props`：`class` / `text`（→ textContent）/ `dataset`（对象）/ `on`（事件对象）/ 其余走 setAttribute。
 * `children`：Node、字符串或它们的数组；`null`/`undefined`/`false` 自动跳过（方便条件渲染）。
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = toText(value);
    else if (key === 'text') node.textContent = toText(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'on') {
      for (const [type, handler] of Object.entries(value)) node.addEventListener(type, handler);
    } else node.setAttribute(key, value === true ? '' : toText(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(toText(child)));
  }
  return node;
}

// ------------------------------------------------------------------ 四种状态

let stateBar = null;

function buildStateNode(inline) {
  return el('div', { class: `app-state${inline ? ' app-state--inline' : ''}`, role: 'status', 'aria-live': 'polite' }, [
    el('span', { class: 'app-state__dot', 'aria-hidden': 'true' }),
    el('span', { class: 'app-state__text' }),
    el('button', { class: 'app-state__retry', type: 'button', text: '重试', hidden: true }),
  ]);
}

/** 全局状态条：固定在左下角，**不占页面构图**（与右下角的演示导航分开）。 */
function ensureStateBar() {
  if (stateBar !== null && stateBar.isConnected) return stateBar;
  ensureBaseStyles();
  stateBar = buildStateNode(false);
  stateBar.id = 'app-state';
  stateBar.hidden = true;
  document.body.append(stateBar);
  return stateBar;
}

/** 就地状态块：挂在 `target` 里面（列表区域用空/出错态时用这个）。 */
function ensureInlineState(target) {
  const existing = target.querySelector(':scope > .app-state--inline');
  if (existing !== null) return existing;
  const node = buildStateNode(true);
  target.append(node);
  return node;
}

/**
 * 显示一种状态。`kind` ∈ `loading` | `empty` | `error` | `waking`。
 * @param {string} kind
 * @param {string|Error|null} [message] 给 `Error` 时取 `.message`
 * @param {{ target?: Element|null, onRetry?: (() => void)|null }} [options]
 *        `target` 省略 = 用全局状态条；给定 = 状态块挂在那个元素里。
 */
export function showState(kind, message = null, options = {}) {
  if (!STATE_KINDS.includes(kind)) throw new Error(`未知状态：${String(kind)}`);
  const { target = null, onRetry = null } = options;
  const node = target === null ? ensureStateBar() : ensureInlineState(target);
  node.dataset.state = kind;
  node.hidden = false;
  const text = message instanceof Error ? message.message : message;
  node.querySelector('.app-state__text').textContent = toText(text ?? STATE_FALLBACK_TEXT[kind]);
  const retry = node.querySelector('.app-state__retry');
  if (typeof onRetry === 'function') {
    retry.hidden = false;
    retry.onclick = (event) => {
      event.preventDefault();
      onRetry();
    };
  } else {
    retry.hidden = true;
    retry.onclick = null;
  }
  return node;
}

export function showLoading(message = null, options = {}) {
  return showState('loading', message, options);
}

export function showEmpty(message = null, options = {}) {
  return showState('empty', message, options);
}

/** `showError(err, { onRetry })` —— 传 `ApiError` 时自动用它的中文 `message`。 */
export function showError(message = null, options = {}) {
  return showState('error', message, options);
}

/** 后端冷启动用：**不要白屏**（免费容器休眠后首次请求要等十几秒）。 */
export function showWaking(message = null, options = {}) {
  return showState('waking', message, options);
}

/**
 * 清掉状态：给 `target` 时移除该元素内的就地状态块，否则隐藏全局状态条。
 * @param {{ target?: Element|null }} [options]
 */
export function clearState(options = {}) {
  const { target = null } = options;
  if (target === null) {
    if (stateBar !== null) stateBar.hidden = true;
    return;
  }
  const node = target.querySelector(':scope > .app-state--inline');
  if (node !== null) node.remove();
}

/**
 * 冷启动友好的错误分流：后端没起来 → `waking`，其余 → `error`。
 * @param {unknown} error
 * @param {{ target?: Element|null, onRetry?: (() => void)|null }} [options]
 */
export function showRequestFailure(error, options = {}) {
  const down = error !== null && typeof error === 'object' && error.isServiceDown === true;
  return down ? showWaking(null, options) : showError(error, options);
}
