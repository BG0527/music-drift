/**
 * 一屏适配：把定稿的 1440×900 画布**等比缩放**到当前窗口，并居中。
 *
 * 为什么这么做（而不是重排）：
 * - 11 张定稿是**固定画布 + 绝对定位**（`html,body{width:1440px;height:900px}`），
 *   重排会逐页破坏已验收的构图；等比缩放则**一屏必然完整、构图一字不动**。
 * - 只改渲染尺寸，不改任何页面的 HTML/CSS 源（源仍是设计稿，见 `docs/deploy-plan-html.md` §8）。
 *
 * 关键细节：
 * - 只把**画布**（`body` 的现有子元素）搬进 `#fit-stage` 并缩放；`#fit-stage` 是 `position:absolute`
 *   的定位祖先，所以页面里 `position:absolute; inset:0` 的块解析结果与原来 `body` 时**完全一致**。
 * - 站点导航（`top-nav.js` 追加到 `body`、`position:fixed`）**不在 stage 内** ⇒ 不被缩放。
 * - 页面里若有 `position:fixed` 元素，会因 stage 的 transform 而改为相对 stage —— 这正是想要的
 *   （画布内的一切一起缩放）。
 */

const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 900;
const STAGE_ID = 'fit-stage';
/**
 * 「浮层安全带」——**可翻转的取舍开关，不是随便定的数字**：
 *
 * - `0`（当前）＝**铺满优先**：画布按 cover 放大填满视口（用户明确要求过两次「刚好铺满屏幕」）。
 *   代价：宽高比接近 16:10 时（实测 1680×1003）上下各约 24px 的设计留白被裁掉，
 *   底部居中的状态条会切到 /bottle.html 的「入海」行约 6px、/drift-log.html 的操作行 6–8px。
 *   缓解：状态条只在有状态时出现、非错误态 6–12s 自动消失；1440×900 下实测碰撞为 0。
 * - `80` ＝**不压内容优先**：把上下各 80px 当内容一起保护 ⇒ cover 退回 contain（出现留白带），
 *   浮层落进留白带、永不压内容，但**屏幕不再铺满**。
 *
 * 两者在 16:10 附近**不可能同时成立**：这些页的内容纵向占 832/900px，剩余留白比浮层需要的还少
 *（底部要 16+61px、顶部要 16+44px）。想换另一种，只改这一个数字。
 */
const OVERLAY_SAFE_BAND = 0;

/**
 * 内容安全框：**不在 `aria-hidden="true"` 下的文字/可交互元素**的并集（画布坐标系）。
 *
 * 为什么用这条判据：契约强制所有装饰件 `aria-hidden="true"`（母题装置、沟槽、掠光…），
 * 所以"要保证不被裁"的东西正好＝不在 aria-hidden 里的、有文字或可交互的元素。
 */
function contentBox(root) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('[aria-hidden="true"]') !== null) continue;
    // 只认**自己的直接文字节点**（容器的 rect 往往就是整张画布，会把内容框撑满 ⇒ cover 永远不可能）
    let own = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) own += node.textContent ?? '';
    }
    const interactive = el.matches('a[href],button,input,select,textarea,label,[role="button"]');
    if (own.trim() === '' && !interactive) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (!Number.isFinite(left)) return null;
  // 把上下两条「浮层安全带」算进安全带内：宁可退回 contain（留白），也不让浮层盖住内容。
  return {
    left,
    top: Math.max(0, top - OVERLAY_SAFE_BAND),
    right,
    bottom: Math.min(CANVAS_HEIGHT, bottom + OVERLAY_SAFE_BAND),
  };
}

/**
 * 把 `value` 夹进 `[min, max]`；**无解时返回 `null`**（而不是取中点）。
 *
 * 为什么这里必须返回 null：中点是一个"看起来居中、实则内容被裁"的假解 —— 实测
 * 登录态下的 `/me.html` 就因此被切掉最后一行（`p`「徽章是派生的（不落库）…」底边 1031 > 视口 1019）。
 * 无解时正确的动作是**退回 contain**（宁可有留白，不裁内容），由调用方处理。
 */
function clampOrNull(value, min, max) {
  if (min > max) return null;
  return Math.min(Math.max(value, min), max);
}

/** @returns {boolean} 是否成功装上（非 1440×900 画布的页面不做任何事） */
export function installFit() {
  const body = document.body;
  if (body === null) return false;
  if (document.getElementById(STAGE_ID) !== null) return true; // 幂等
  if (body.dataset.fitOff === 'true') return false; // 逃生开关：<body data-fit-off="true">

  const rect = body.getBoundingClientRect();
  const isCanvas = Math.round(rect.width) === CANVAS_WIDTH && Math.round(rect.height) === CANVAS_HEIGHT;
  if (!isCanvas && body.offsetWidth !== CANVAS_WIDTH) return false;

  const stage = document.createElement('div');
  stage.id = STAGE_ID;
  stage.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    `width:${CANVAS_WIDTH}px`,
    `height:${CANVAS_HEIGHT}px`,
    'transform-origin:top left',
  ].join(';');

  // 把画布的现有子元素整体搬进 stage（不动任何一个元素的样式与顺序）
  while (body.firstChild !== null) stage.append(body.firstChild);
  body.append(stage);

  // **搬家后、缩放前**量内容安全框（此时 rect 就是画布坐标）
  const content = contentBox(stage);

  // body 从"画布"变成"视口容器"：铺满视口、出血裁掉、底色沿用契约的 --ink
  const ink = getComputedStyle(body).backgroundColor;
  // `html` 也必须一起收：页面 CSS 是 `html,body{width:1440px;height:900px}`，
  // 只改 body 的话 html 仍是 1440×900 ⇒ 文档还能滚（探针实测 1366/1280 下 scroll=1440x900）。
  for (const [prop, value] of [
    ['width', '100vw'],
    ['height', '100dvh'],
    ['overflow', 'hidden'],
  ]) {
    document.documentElement.style.setProperty(prop, value, 'important');
  }
  for (const [prop, value] of [
    ['position', 'relative'],
    ['width', '100vw'],
    ['height', '100dvh'],
    ['overflow', 'hidden'],
    ['margin', '0'],
  ]) {
    body.style.setProperty(prop, value, 'important');
  }
  // 视口比例与画布不一致时留白，用同一底色填满，不出现白边
  if (ink !== '' && ink !== 'rgba(0, 0, 0, 0)') document.documentElement.style.background = ink;

  const apply = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw === 0 || vh === 0) return;

    // 先按"铺满"取倍数（cover）：这保证**没有留白**。
    const cover = Math.max(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
    // 再看"铺满会不会裁到内容"：把内容安全框按 cover 放大后，能通过平移让它落进视口吗？
    let scale = cover;
    if (content !== null) {
      const needW = (content.right - content.left) * cover;
      const needH = (content.bottom - content.top) * cover;
      if (needW > vw || needH > vh) {
        // 铺满必然裁到内容 ⇒ 退回"装得下"（contain），宁可有留白也不裁内容
        scale = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
      }
    }

    // 平移：默认居中；若有内容安全框，则把偏移夹到"内容不越界"的区间里。
    // **区间为空（无解）时必须退回 contain** —— 取中点会得到一个"看起来居中、实则内容被裁"的假解
    //（实测登录态 /me.html 的最后一行就是这样被切掉的）。
    const centerX = (vw - CANVAS_WIDTH * scale) / 2;
    const centerY = (vh - CANVAS_HEIGHT * scale) / 2;
    let x = centerX;
    let y = centerY;
    if (content !== null) {
      const clampedX = clampOrNull(centerX, vw - content.right * scale, -content.left * scale);
      const clampedY = clampOrNull(centerY, vh - content.bottom * scale, -content.top * scale);
      if (clampedX === null || clampedY === null) {
        // 铺满放不下内容 ⇒ 退回"装得下"，并重新按 contain 居中
        scale = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
        x = (vw - CANVAS_WIDTH * scale) / 2;
        y = (vh - CANVAS_HEIGHT * scale) / 2;
      } else {
        x = clampedX;
        y = clampedY;
      }
    }

    stage.style.transform = `scale(${String(scale)})`;
    stage.style.left = `${String(x)}px`;
    stage.style.top = `${String(y)}px`;
    stage.dataset.fitMode = scale === cover ? 'cover' : 'contain';
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  if (window.visualViewport !== undefined && window.visualViewport !== null) {
    window.visualViewport.addEventListener('resize', apply);
  }
  return true;
}
