/**
 * 页面模块：`site/drift-log.html`（漂流日志 / 刻痕盘）
 *
 * 归属：**W1-b**。共享层只消费，不改；HTML 是源，字节不改（`docs/deploy-plan-html.md` §8.2）。
 *
 * 端点：
 *   GET /api/bottles/:id/events → 真实事件流（`{seq,type,actorId,occurredAt,occurredAtMs}[]`，
 *                                 已经按 §9.1/§9.2 裁过可见性，seq 是裁后的连续序号）
 *   GET /api/bottles/:id        → 曲名与「操作者代号」（§7.3 只列了 events，但页头的曲名、
 *                                 以及 `actorId → 匿名代号` 的映射只能从这里拿，见汇报）
 *
 * 装置语义（冻结 HTML 的注释就是契约）：
 *   弧长＝这一笔的重量（按操作类型），半径从小到大＝时间从早到晚，间隔固定 10°；
 *   **盘面是干的，只有最新那一笔还湿着**（它下面压着一道冷光水痕，末端滴水积成一小汪）。
 *   ⇒ 事件有几条就画几笔；湿痕永远只挂在**最后**一笔下面，绝不每笔都湿。
 */
import { ApiError, get } from './api.js';
import { clearState, hide, on, q, qa, show, showEmpty, showError, showLoading, showRequestFailure } from './dom.js';
import { definePage } from './page.js';

/** 刻痕盘几何（反解自定稿：圆心是盘心那个小点，半径 52→282、每道 +23、间隔 10°）。 */
const CENTER = { x: 197, y: 242 };
const FIRST_RADIUS = 52;
const MAX_RADIUS = 282;
const RADIUS_STEP = 23;
const GAP_DEGREES = 10;
const FIRST_ANGLE = -75;
/** 定稿里最新那一笔的末端与那汪水的相对位置（用来把水汪挪到真实最新一笔的末端）。 */
const SPILL_ANCHOR = { x: 69, y: 493.3 };

/**
 * 每一类事件在盘上的「一笔」：模板下标取自定稿里那 12 条 path（0 发起 / 1 接唱 / 2 投河 /
 * 3 捞取 / 8 回传 / 9-10 完成（双线）/ 11 入海），弧长取自那一笔在定稿里的实际张角。
 * 文案与页头「只记核心操作」一句一致；不在表里的事件（投票 / 留言）不刻痕。
 */
const MARKS = {
  BOTTLE_CREATED: { template: [0], span: 22, op: '发起：选定了这首歌' },
  SEGMENT_RECORDED: { template: [1], span: 46, op: '接唱：有人录下了一段' },
  SEGMENT_COMPLETED: { template: [9, 10], span: 46, op: '完成：最后一段录好了，作品完整' },
  BOTTLE_CAST_TO_RIVER: { template: [2], span: 30, op: '投河：交给河道，等待下一位' },
  BOTTLE_DRAWN: { template: [3], span: 26, op: '捞取：有人从河道里把它拿走了' },
  BOTTLE_PUT_BACK: { template: [2], span: 30, op: '放回：交还河道，等下一个陌生人' },
  BOTTLE_RETURNED: { template: [8], span: 50, op: '回传：交回上游的传递者' },
  BOTTLE_REWOUND: { template: [8], span: 50, op: '退回：瓶子交回上一棒，等补位' },
  BOTTLE_WENT_TO_SEA: { template: [11], span: 84, op: '入海：成为公海里的公共作品' },
  BOTTLE_GAP_OPENED: { template: [6], span: 26, op: '斩浪：缺口打开，等陌生人补位' },
  SEGMENT_CUT: { template: [6], span: 26, op: '斩浪：这一段被投票移除了' },
  BOTTLE_DAMAGED: { template: [6], span: 26, op: '损坏：接力链断了，作品停漂' },
};

/** 页头一句「只记核心操作」：投票与留言是段级互动，不进刻痕（数量照实写在页面上）。 */
const INTERACTION_TYPES = new Set(['VOTE_CAST', 'MESSAGE_ATTACHED']);

const state = {
  id: null,
  detail: null,
  /** 段作者 id → 该段在本瓶子里显示的匿名代号（§12.1：不跨瓶关联）。 */
  codes: new Map(),
};

function formatAt(iso) {
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * SVG 图形的显隐：`dom.js` 的 `hide()` 走 `hidden` 属性（HTML 元素的属性），对 `<path>`/`<g>`
 * 不保险 ⇒ 这里同时写 `display`，让"没有刻痕时盘面是干的"这条语义可以按计算样式验证。
 */
function setShapeVisible(node, visible) {
  if (node === null || node === undefined) return;
  if (visible) {
    node.removeAttribute('hidden');
    node.style.display = '';
  } else {
    node.setAttribute('hidden', '');
    node.style.display = 'none';
  }
}

/** 圆心、半径、起止角 → 一条顺时针短弧（定稿里全是 `A r r 0 0 1`）。 */
function arcPath(radius, fromDeg, spanDeg) {
  const toDeg = fromDeg + spanDeg;
  const startX = CENTER.x + radius * Math.cos(degToRad(fromDeg));
  const startY = CENTER.y + radius * Math.sin(degToRad(fromDeg));
  const endX = CENTER.x + radius * Math.cos(degToRad(toDeg));
  const endY = CENTER.y + radius * Math.sin(degToRad(toDeg));
  return {
    d: `M${round1(startX)} ${round1(startY)} A${radius} ${radius} 0 0 1 ${round1(endX)} ${round1(endY)}`,
    endX,
    endY,
  };
}

/** 每条事件 → 一笔（`index` 是可见事件里的位置，决定半径与画在盘上的先后）。 */
function markOf(event, position) {
  const spec = MARKS[event.type] ?? {
    template: [3],
    span: 26,
    op: `${event.type}（这个事件类型还没有专门的刻法）`,
  };
  return { ...spec, position };
}

/** 最后一段录好的那一条 SEGMENT_RECORDED 就是「完成」那一笔（只在作品真的完整、且没有隐藏段时）。 */
function completingVisibleIndex(events) {
  if (state.detail === null || state.detail.isComplete !== true || state.detail.hiddenLaterSegmentCount > 0) {
    return -1;
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === 'SEGMENT_RECORDED') return index;
  }
  return -1;
}

function codeFor(actorId) {
  if (actorId === 'SYSTEM') return '系统';
  return state.codes.get(actorId) ?? '匿名歌手';
}

// ------------------------------------------------------------------ 渲染

function renderEvents(events, hiddenInteractionCount) {
  const roll = q('.roll');
  const ol = q('.roll ol');
  const countNode = q('.hright .n');
  if (roll === null || ol === null) return;

  const marks = events.map(markOf);
  renderLathe(marks);

  if (countNode !== null) countNode.textContent = String(marks.length);

  const sub = q('.sub');
  if (sub !== null) {
    sub.textContent =
      hiddenInteractionCount > 0
        ? `这里只记核心操作：发起、接唱、捞取、投河、回传、入海。操作者只显示匿名代号。另有 ${hiddenInteractionCount} 条段级互动（投票 / 留言）不进刻痕。`
        : '这里只记核心操作：发起、接唱、捞取、投河、回传、入海。操作者只显示匿名代号。';
  }

  const rowTemplate = ol.querySelector('li');
  if (rowTemplate === null) return;
  rowTemplate.remove();
  for (const row of qa('li', ol)) row.remove();

  if (marks.length === 0) {
    hide(ol);
    showEmpty('这支瓶子还没有可记的刻痕：等它真正开始漂流，这里会一条条长出来。', { target: roll });
    return;
  }
  show(ol);

  marks.forEach((mark, position) => {
    const row = rowTemplate.cloneNode(true);
    const seq = row.querySelector('.seq');
    const op = row.querySelector('.op');
    const who = row.querySelector('.who');
    const at = row.querySelector('.at');
    if (seq !== null) seq.textContent = `#${pad2(position + 1)}`;
    if (op !== null) op.textContent = mark.op;
    if (who !== null) who.textContent = codeFor(events[position].actorId);
    if (at !== null) at.textContent = formatAt(events[position].occurredAt);
    /** 终局那一笔才配珊瑚色的左沿（定稿：珊瑚全页仅此两处）。 */
    if (position === marks.length - 1) row.classList.add('last');
    ol.append(row);
  });

  /** 行数超过盘高时内部滚动，而不是被 `overflow:hidden` 裁掉一半（行数够少时没有任何视觉变化）。 */
  roll.style.overflowY = 'auto';
}

function renderLathe(marks) {
  const svg = q('.lathe');
  if (svg === null) return;
  const arcGroup = svg.querySelector('g[fill="none"][stroke-linecap="round"]');
  const labelGroup = svg.querySelector('g[font-family]');
  const wetPath = svg.querySelector('path[stroke^="url(#wet)"]');
  if (arcGroup === null || labelGroup === null) return;

  const templates = qa('path', arcGroup);
  const textTemplate = labelGroup.querySelector('text');
  const spill = spillNodes(svg);
  if (templates.length === 0 || textTemplate === null) return;

  arcGroup.dataset.w1bArcs = '';
  labelGroup.dataset.w1bLabels = '';
  for (const node of templates) node.remove();
  for (const node of qa('text', labelGroup)) node.remove();

  if (marks.length === 0) {
    setShapeVisible(wetPath, false);
    for (const node of spill) setShapeVisible(node, false);
    return;
  }

  /** 条数多于定稿的 11 笔时向外扩不动了（盘就这么大）⇒ 把步长压小，保证全部落在盘内。 */
  const step =
    marks.length <= 11 ? RADIUS_STEP : (MAX_RADIUS - FIRST_RADIUS) / Math.max(1, marks.length - 1);

  let angle = FIRST_ANGLE;
  let lastArc = null;
  marks.forEach((mark, position) => {
    const centerRadius = FIRST_RADIUS + position * step;
    const paths = mark.template.map((templateIndex, lineIndex) => {
      const template = templates[templateIndex] ?? templates[templates.length - 1];
      const radius = mark.template.length === 1 ? centerRadius : centerRadius + (lineIndex === 0 ? -2.25 : 2.25);
      const arc = arcPath(radius, angle, mark.span);
      const node = template.cloneNode(true);
      node.setAttribute('d', arc.d);
      arcGroup.append(node);
      return arc;
    });
    lastArc = paths[paths.length - 1];

    const labelRadius = centerRadius - 13;
    const labelAngle = angle + mark.span / 2;
    const label = textTemplate.cloneNode(true);
    label.setAttribute('x', String(round1(CENTER.x + labelRadius * Math.cos(degToRad(labelAngle)))));
    label.setAttribute('y', String(round1(CENTER.y + labelRadius * Math.sin(degToRad(labelAngle)))));
    label.textContent = `#${pad2(position + 1)}`;
    labelGroup.append(label);

    angle += mark.span + GAP_DEGREES;
  });

  /** 只有最新那一笔是湿的：湿痕就是它自己的弧（定稿里也是同一条 d、只多一道 9px 的冷光）。 */
  if (wetPath !== null && lastArc !== null) {
    wetPath.setAttribute('d', lastArc.d);
    setShapeVisible(wetPath, true);
  }
  /** 水汪跟着最新一笔的末端走（定稿里它正压在那道弧的末端下）。 */
  const shiftX = lastArc.endX - SPILL_ANCHOR.x;
  const shiftY = lastArc.endY - SPILL_ANCHOR.y;
  for (const node of spill) {
    setShapeVisible(node, true);
    /** 基准 transform 只记一次：重渲染（重试）时不能把位移越叠越多。 */
    if (node.dataset.w1bBaseTransform === undefined) {
      node.dataset.w1bBaseTransform = node.getAttribute('transform') ?? '';
    }
    const base = node.dataset.w1bBaseTransform;
    const prefix = `translate(${round1(shiftX)} ${round1(shiftY)})`;
    node.setAttribute('transform', base === '' ? prefix : `${prefix} ${base}`);
  }
}

/** 盘边那一小汪水（两道高光 + 一个溅点 + 停在里面的瓶子）——四处要一起挪。 */
function spillNodes(svg) {
  const nodes = [];
  for (const path of qa('path', svg)) {
    const stroke = path.getAttribute('stroke') ?? '';
    if (stroke.startsWith('rgba(228,247,252') || stroke.startsWith('rgba(203,238,246')) nodes.push(path);
  }
  const ellipse = svg.querySelector('ellipse');
  if (ellipse !== null) nodes.push(ellipse);
  const bottle = svg.querySelector('g[transform^="translate(101"]');
  if (bottle !== null) nodes.push(bottle);
  return nodes;
}

// ------------------------------------------------------------------ 装配

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  state.id = id;
  const crumb = q('.crumb');
  if (crumb !== null) {
    /** 冻稿里「回漂流瓶」是个 span（不可点）：运行时补上跳转，让它真的回得去。 */
    crumb.setAttribute('role', 'link');
    crumb.setAttribute('tabindex', '0');
    crumb.style.cursor = 'pointer';
    const go = () =>
      location.assign(id === null || id === '' ? '/river.html' : `/bottle.html?id=${encodeURIComponent(id)}`);
    on(crumb, 'click', go);
    on(crumb, 'keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        go();
      }
    });
  }

  if (id === null || id === '') {
    showError('地址里没有瓶子 id（应为 /drift-log.html?id=<瓶子 id>）。点左上角「回漂流瓶」回去挑一支。');
    return;
  }

  showLoading('正在读这支瓶子的刻痕…');
  try {
    const events = await get(`/api/bottles/${encodeURIComponent(id)}/events`);
    /** 曲名与操作者代号只能从详情拿（events 里只有 actorId）—— §7.3 未列，见汇报。 */
    const detail = await get(`/api/bottles/${encodeURIComponent(id)}`).catch(() => null);
    state.detail = detail;
    if (detail !== null) {
      for (const segment of detail.segments) state.codes.set(segment.ownerId, segment.ownerCode);
      const song = q('.hright .song');
      if (song !== null) song.textContent = detail.songTitle;
    }
    clearState({ target: q('.roll') });
    clearState();

    const visible = events.filter((event) => !INTERACTION_TYPES.has(event.type));
    const hiddenInteractionCount = events.length - visible.length;
    const completeAt = completingVisibleIndex(visible);
    const withCompletion = visible.map((event, position) =>
      position === completeAt ? { ...event, type: 'SEGMENT_COMPLETED' } : event,
    );
    renderEvents(withCompletion, hiddenInteractionCount);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      showError('这支瓶子不存在，或它还没有任何可记的事件。点左上角「回漂流瓶」回去挑一支。');
      return;
    }
    showRequestFailure(error, { onRetry: load });
  }
}

export const { init } = definePage({
  name: 'drift-log',
  owner: 'W1-b',
  endpoints: ['GET /api/bottles/:id/events'],
  note: '额外必需：GET /api/bottles/:id（曲名与操作者匿名代号）',
  init: load,
});
