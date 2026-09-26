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
 * - 演示导航（`demo-nav.js` 追加到 `body`、`position:fixed`）**不在 stage 内** ⇒ 不被缩放。
 * - 页面里若有 `position:fixed` 元素，会因 stage 的 transform 而改为相对 stage —— 这正是想要的
 *   （画布内的一切一起缩放）。
 */

const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 900;
const STAGE_ID = 'fit-stage';

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
    const scale = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
    stage.style.transform = `scale(${String(scale)})`;
    stage.style.left = `${String((vw - CANVAS_WIDTH * scale) / 2)}px`;
    stage.style.top = `${String((vh - CANVAS_HEIGHT * scale) / 2)}px`;
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  if (window.visualViewport !== undefined && window.visualViewport !== null) {
    window.visualViewport.addEventListener('resize', apply);
  }
  return true;
}
