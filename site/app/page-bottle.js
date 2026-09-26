/**
 * 页面模块：`site/bottle.html`（瓶子详情）
 *
 * 归属：**W1-b**。共享层（`api/dom/session/page`）只消费，不改。
 *
 * 硬约束（`docs/deploy-plan-html.md` §8.2）：**HTML 是源、字节不改** —— 本文件只在运行时
 * 按页面已有 class 名定位、克隆示例节点当模板、填 `textContent`，绝不开 HTML 通道。
 *
 * 端点（`docs/deploy-plan-html.md` §7.3）：
 *   GET  /api/bottles/:id            → 曲名/状态/缺口/段/可选去向（**装置的数值全从它算**）
 *   POST /api/bottles/:id/segments   → 录一段（原始二进制 body + 时长走 x-audio-duration-ms）
 *   POST /api/segments/:id/listen    → 上报已听覆盖率（只增不减）；返回值给出点踩门槛
 *   POST /api/segments/:id/votes     → 赞 / 踩（两个独立的票）
 *   GET/POST /api/bottles/:id/messages → 私密留言
 *   POST /api/bottles/:id/resolution → 三选一去向（按服务端 availableResolutions 渲染）
 *   POST /api/bottles/:id/put-back   → 放回河道
 *   POST /api/reports                → 举报（进人工队列）
 *
 * 额外依赖（§7.3 未列，但没有它们这页做不成事）：
 *   GET /api/segments/:id/audio → 试听（存库 bytea + Range）
 *   GET /api/songs              → 第 N 段的**曲库预设时长**（t29：录音时长以它为准，±2s）。
 *                                 前端不许写死 20 秒，也不该猜：曲库是唯一权威来源。
 *
 * W4-a（用户第 2 轮需求 2/3/5，见 §13/§14.2）改了三件事：
 *   1. **接唱只能唱下一段**：可录段位唯一 = 服务端 `replacementContext.gapIndex`
 *      （缺失时退回 `missingSegmentIndexes[0]`，两者同源：都是 `gaps(state)[0]`）。
 *      页面上**没有任何"选段位来录"的控件** —— `.cap .listen` 是**试听**选段（试听与投票要用它），
 *      录制入口只有 `.gapBox .cta` 一个，且它的位置与文案都由服务端段号决定。
 *   2. **去向在接唱完之后才出现**：`.destCol` 默认 `hidden`，只有"我在这支瓶子里已经录过一段"
 *      （DTO 的 `segments` 里出现 `state.me.id`）才显示 —— 见 `renderDestinationGate()`。
 *      选完去向给出**说清结果的提示**（共享层状态条 + 页内留痕）再跳 `/river.html`。
 *   3. **试听全部**：把已录的段**按段号连播**（缺口跳过，不做混音 —— 后端没有混音端点），
 *      0 段时按钮不存在。运行期建控件（§10.2 已批准的既有模式）。
 *
 * W7（用户第 3 轮需求，§17）：公海详情页被删除，它顶部那条**沟槽时间轴 + 唱针**复刻到本页。
 * 几何与类名照抄那条时间轴（值见本文件 `TIMELINE_STYLE`），落位与三处必要偏离记在 §17.6。
 */
import { ApiError, get, post, postAudio } from './api.js';
import {
  clearState,
  el,
  hide,
  on,
  q,
  qa,
  setVisible,
  show,
  showError,
  showLoading,
  showRequestFailure,
  showState,
} from './dom.js';
import { currentUser } from './session.js';
import { definePage } from './page.js';
import { countdown, startRecordingSession } from './recorder.js';

/** 三条水路：文案取自冻结 HTML，这里只做「标签 ↔ 服务端枚举」定位。 */
const RESOLUTION_ROWS = [
  { code: 'RIVER', label: '继续投河' },
  { code: 'RETURN', label: '回传' },
  { code: 'SEA', label: '入海' },
];

const STATUS_LABELS = {
  DRAFT: '发起者还没投河',
  IN_RIVER: '漂在河道里',
  HELD: '有人持有',
  SEA: '已在公海',
  DAMAGED: '接力链已断',
};

/** 点踩门槛的兜底（内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`）；正常路径一律用服务端返回值。 */
const DISLIKE_THRESHOLD_FALLBACK = 0.8;

/** 每 5 秒上报一次已听覆盖率（服务端按墙上时间限速，更密没有意义）。 */
const LISTEN_REPORT_INTERVAL_MS = 5_000;

/**
 * 选完去向之后：先把提示留在页面上，再跳回河道（W4-a 需求 3：不许"只跳转了事"）。
 * 2.2 秒够看清一句话，也让"提示曾经出现过"这件事可被外部观测到。
 */
const RESOLUTION_REDIRECT_DELAY_MS = 2_200;

/** 三条水路各自的"发生了什么"（W4-a 需求 3）：文案要说结果，不能只说"操作成功"。 */
const RESOLUTION_NOTICE = {
  RIVER: '已投进河道，等下一个陌生人接住。',
  RETURN: '已回传给投给你的那个人，由他决定下一步。',
  SEA: '已入海：这支瓶子进了公海，之后谁都能听到。',
};

/** 瓶身剖面在页面里的几何真值（取自定稿：格位从 76 到 1000，水面带高 24，切面斜 93/71）。 */
const PROFILE_LEFT = 76;
const PROFILE_RIGHT = 1000;
const WATER_SLANT_X = 93;
const WATER_SLANT_CONTROL_X = 71;

const state = {
  id: null,
  detail: null,
  me: null,
  /** `GET /api/songs` 的原始数组：用来找本瓶那首歌第 N 段的预设时长。 */
  songs: null,
  selectedIndex: null,
  /** 客户端算出的「听过区间并集」长度（colveredMs）；服务端另有只增不减的记账。 */
  coveredMs: 0,
  lastAudioMs: 0,
  listenView: null,
  audio: null,
  /** 段号 → 该段在瓶身上的 `.cap` 节点（投票后就地改数字）。 */
  capNodes: new Map(),
  reportTimer: null,
  /** 正在进行的录音会话（`recorder.js` 的 `startRecordingSession` 句柄）；不在录音时为 null。 */
  session: null,
  recordTimer: null,
  /** 选去向请求进行中（防连点第二条水路）。 */
  resolving: false,
};

// ------------------------------------------------------------------ 渲染小工具

function cellSlot(index) {
  const count = state.detail?.totalSegments ?? 4;
  const width = (PROFILE_RIGHT - PROFILE_LEFT) / count;
  return { left: PROFILE_LEFT + (index - 1) * width, width };
}

function setText(selector, value) {
  const node = q(selector);
  if (node !== null) node.textContent = value;
  return node;
}

/** 成功提示优先落在缺口格上；瓶子已完整（缺口格没了）时落到「选择去向」的说明行。 */
function announce(message) {
  const gapNote = q('.gapBox .gapNote');
  if (gapNote !== null && q('.gapBox') !== null) {
    gapNote.textContent = message;
    return;
  }
  setText('.destCol .sub', message);
}

function segmentByIndex(index) {
  return state.detail?.segments.find((segment) => segment.index === index) ?? null;
}

/**
 * **可录段位只有一个**（W4-a 需求 2）：服务端给的下一段。
 *
 * 两个字段同源（`queries.ts`：`replacementContext().gapIndex === gaps(state)[0]`、
 * `missingSegmentIndexes() === gaps(state)`），所以优先用更明确的 `replacementContext.gapIndex`
 * （它同时带出"缺口前一段是谁"），缺失时退回 `missingSegmentIndexes[0]`。
 * `null` = 没缺口（作品完整或已损坏）⇒ 谁都不能录。
 *
 * 段号**不从前端选择**：请求体里根本没有 index（契约 §16.8），段号由服务端 `nextRecordIndex` 决定。
 */
function recordTargetIndex() {
  const detail = state.detail;
  if (detail === null) return null;
  return detail.replacementContext?.gapIndex ?? detail.missingSegmentIndexes[0] ?? null;
}

/**
 * 我在这支瓶子里**已经录过一段**吗（= 接唱完了）。
 *
 * 用途（W4-a 需求 3）：`.destCol` 的门槛。为什么不用 `availableResolutions.length > 0`：
 * 发起者的 DRAFT 瓶子**还没录第 1 段时**服务端就已经给出 `['RIVER','SEA']`
 *（`resolution.ts`：DRAFT + 发起者 + 未完整 ⇒ RIVER/SEA）⇒ 那个条件会把去向提前放出来。
 * "我的段"用 `segments` 判：§9.1 的可见性保证**自己那一棒一定看得到**（含刚录完的那一段）。
 */
function hasSung() {
  const detail = state.detail;
  const me = state.me;
  if (detail === null || me === null) return false;
  return detail.segments.some((segment) => segment.ownerId === me.id);
}

/**
 * SVG 图形的显隐：`dom.js` 的 `hide()` 走的是 `hidden` 属性（HTML 元素的属性），
 * 对 `<path>`/`<g>` 这类 SVG 节点不保险 ⇒ 这里同时写 `display`，用计算样式说话。
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

/** 水位＝从第 1 段起**连续**录满的段数（干格＝缺口：缺口之后的水面不凭空盖过去）。 */
function waterFrontIndex() {
  const detail = state.detail;
  if (detail === null) return 0;
  let front = 0;
  while (front < detail.totalSegments && segmentByIndex(front + 1) !== null) front += 1;
  return front;
}

function formatClock(ms) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ 初始化

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  const back = q('.back');
  if (back !== null) back.setAttribute('href', '/river.html');
  state.id = id;

  if (id === null || id === '') {
    showError('地址里没有瓶子 id（应为 /bottle.html?id=<瓶子 id>）。点左上角「回河道」回去重新捞一支。');
    return;
  }

  showLoading('正在加载这支瓶子…');
  try {
    const [detail, me, songs] = await Promise.all([
      get(`/api/bottles/${encodeURIComponent(id)}`),
      currentUser(),
      get('/api/songs').catch(() => null),
    ]);
    state.detail = detail;
    state.me = me;
    state.songs = songs;
    clearState();
    render();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      showError('这支瓶子不存在，或已经被撤下。点左上角「回河道」回去重新捞一支。');
      return;
    }
    showRequestFailure(error, { onRetry: load });
  }
}

function render() {
  renderHeader();
  renderProfile();
  renderResolution();
  /** 顺序要紧：先把去向行按服务端选项画好，再决定整列显不显示（W4-a 需求 3）。 */
  renderDestinationGate();
  renderPutBack();
  renderLinks();
  state.selectedIndex = null;
  /** 先把「没有可试听段」的列清干净（否则定稿里的演示进度/计数会留在页面上）。 */
  renderListenColumn();
  renderListenAll();
  /** W7：时间轴先按真数据画一次（0 段时也要画成"全空、没有唱针"，不留假进度）。 */
  paintTimeline();
  const first = state.detail.segments[0];
  if (first !== undefined) void selectSegment(first.index);
}

// ------------------------------------------------------------------ 页头 / 缺口说明

function renderHeader() {
  const detail = state.detail;
  setText('.work', detail.songTitle);
  setText('.maker .v', detail.initiatorCode);
  setText('.pill', STATUS_LABELS[detail.status] ?? detail.status);

  const meta = qa('.metaRow span');
  if (meta[0] !== undefined) meta[0].textContent = `已录 ${detail.recordedCount} / ${detail.totalSegments} 段`;
  if (meta[1] !== undefined) {
    meta[1].textContent =
      detail.missingSegmentIndexes.length === 0
        ? '作品完整：歌里的每一段都有人唱了'
        : `作品还不完整：缺第 ${detail.missingSegmentIndexes.join('、')} 段`;
  }

  /** §9.1 的裁剪必须能解释：`hiddenLaterSegmentCount > 0` 时补一句"不是丢了，是你看不到"。 */
  const metaRow = q('.metaRow');
  const hiddenNote = q('.w1b-hiddenNote');
  if (detail.hiddenLaterSegmentCount > 0) {
    if (hiddenNote !== null) {
      hiddenNote.textContent = `另有 ${detail.hiddenLaterSegmentCount} 段还在漂流中（你看不到）`;
    } else if (metaRow !== null) {
      metaRow.append(
        el('span', { class: 'w1b-hiddenNote', text: `另有 ${detail.hiddenLaterSegmentCount} 段还在漂流中（你看不到）` }),
      );
    }
  } else {
    hiddenNote?.remove();
  }

  /** 「缺口是歌里固定的段位…」这句只在**真有缺口**时显示（冻结文案，不改说法）。 */
  const note = q('.note');
  if (note !== null) {
    if (detail.missingSegmentIndexes.length > 0) show(note);
    else hide(note);
  }

  const front = waterFrontIndex();
  setText('.heroLab', front === 0 ? '瓶身剖面 · 水还没进来' : `瓶身剖面 · 水只到第 ${front} 段`);
}

// ------------------------------------------------------------------ 瓶身剖面：格位 / 水位 / 分隔线

/**
 * 冻结 HTML 里每一类示例节点都只留一份当样板（第 1/2/3 格的 `.segNum`/`.segLab`、三个 `.cap`），
 * 而且要**只取一次**：重渲染时页面上已经没有"示例"了，再去 DOM 里找会把上一次渲染的产物当样板。
 * `.gapBox` / `.selMark` 是**同一个节点**反复搬（CTA 的事件是在 `wire()` 里绑到它身上的）。
 */
const templates = { num: null, lab: null, cap: null, gapBox: null, selMark: null, parent: null };

function captureTemplates() {
  if (templates.cap !== null) return true;
  const num = qa('.segNum')[0];
  const lab = qa('.segLab')[0];
  const cap = qa('.cap')[0];
  const gapBox = q('.gapBox');
  const selMark = q('.selMark');
  if (num === undefined || lab === undefined || cap === undefined || gapBox === null) return false;
  templates.num = num.cloneNode(true);
  templates.lab = lab.cloneNode(true);
  templates.cap = cap.cloneNode(true);
  templates.gapBox = gapBox;
  templates.selMark = selMark;
  templates.parent = num.parentNode;
  for (const node of qa('.segNum')) node.remove();
  for (const node of qa('.segLab')) node.remove();
  for (const node of qa('.cap')) node.remove();
  return true;
}

function renderProfile() {
  const detail = state.detail;
  if (!captureTemplates()) return;
  const parent = templates.parent;
  if (parent === null) return;

  /**
   * **幂等**（W4-a 修的真 bug，见 `docs/deploy-plan-html.md` §14.3）：
   * 每次渲染前先把上一次渲染出来的格子撤干净，再按这一次的数据重建。
   * `captureTemplates()` 只在第一次跑时移除冻结 HTML 的样板；之后 `.segNum`/`.segLab`/`.cap`
   * 就全是本函数的产物 —— 不清就每渲染一次再 append 一遍（4 → 8 → 12），
   * 而两批节点的 `text/left/top/width` 完全重合 ⇒ **视觉看不出来**，只有计数能戳破。
   */
  for (const node of qa('.segNum, .segLab, .cap', parent)) node.remove();
  templates.gapBox.remove();
  templates.selMark?.remove();
  state.capNodes.clear();

  for (let index = 1; index <= detail.totalSegments; index += 1) {
    const slot = cellSlot(index);
    const segment = segmentByIndex(index);
    /** 缺口 = 歌里固定的段位没人录；`gap` 是冻结 HTML 里已有的「干格」视觉。 */
    const dry = segment === null;

    const num = templates.num.cloneNode(true);
    num.textContent = String(index);
    num.className = dry ? 'segNum mono gap' : 'segNum mono';
    num.style.left = `${slot.left}px`;
    num.style.width = `${slot.width}px`;
    parent.append(num);

    const lab = templates.lab.cloneNode(true);
    lab.textContent = `第 ${index} 段`;
    lab.className = `segLab meta${dry ? ' gap' : ''}`;
    lab.style.left = `${slot.left}px`;
    lab.style.width = `${slot.width}px`;
    parent.append(lab);

    if (segment === null) continue;

    const cap = templates.cap.cloneNode(true);
    cap.style.left = `${slot.left}px`;
    cap.style.width = `${slot.width}px`;
    const code = cap.querySelector('.code');
    const spans = cap.querySelectorAll('.line span');
    const listen = cap.querySelector('.listen');
    if (code !== null) code.textContent = segment.ownerCode;
    if (spans[0] !== undefined) spans[0].textContent = formatClock(segment.durationMs);
    if (spans[1] !== undefined) spans[1].textContent = `赞 ${segment.likeCount}`;
    if (spans[2] !== undefined) spans[2].textContent = `踩 ${segment.dislikeCount}`;
    if (listen !== null) {
      listen.setAttribute('href', '#');
      listen.textContent = '听';
      on(listen, 'click', (event) => {
        event.preventDefault();
        void selectSegment(index, { autoPlay: true });
      });
    }
    parent.append(cap);
    state.capNodes.set(index, cap);
  }

  // 缺口盒长在**服务端给的那一格**（= 下一次会录的段号，需求 2 的"只有一个可录段位"就落在这里）
  const gapIndex = recordTargetIndex();
  if (gapIndex !== null) {
    const slot = cellSlot(gapIndex);
    const gapBox = templates.gapBox;
    gapBox.style.left = `${slot.left + 10}px`;
    gapBox.style.width = `${slot.width - 20}px`;
    parent.append(gapBox);
    renderGapBox(gapIndex);
  }

  const selMark = templates.selMark;
  if (selMark !== null) {
    parent.append(selMark);
    hide(selMark);
  }
  renderRolls();
  renderWater();
  renderDividers();
}

/**
 * 水里浮着的纸卷＝「已经录进这一格的声音」。定稿画了 3 卷（因为它自己是 3 段版本），
 * 所以这里必须按真实水位显隐：录了几段就浮几卷，干格上不浮。
 */
function renderRolls() {
  const front = waterFrontIndex();
  qa('svg rect[fill="url(#gPaper)"]').forEach((rect, position) => {
    setShapeVisible(rect.parentNode, position + 1 <= front);
  });
}

function renderGapBox(gapIndex) {
  const canRecord = recordingAllowed();
  const preset = presetDurationFor(gapIndex);

  setText('.gapBox .gapKind', '缺口');
  setText('.gapBox .gapHead', canRecord ? `第 ${gapIndex} 段由你开第一句` : `第 ${gapIndex} 段还空着`);
  const cta = q('.gapBox .cta');
  const note = q('.gapBox .gapNote');
  if (cta !== null) {
    cta.disabled = false;
    cta.textContent = `录第 ${gapIndex} 段`;
    cta.setAttribute('aria-label', `录第 ${gapIndex} 段`);
    if (canRecord && preset !== null) show(cta);
    else hide(cta);
  }
  if (note === null) return;
  if (!canRecord) {
    note.textContent = '这一段只有发起者（尚未投河时）或当前持有者能录：你看得到缺口，但录不了它。';
    return;
  }
  /** 需求 2：把"不许自选"写在接唱区里（页面上没有任何选段位的控件，这句是唯一的解释位）。 */
  const head = `接唱只能唱这一段：第 ${gapIndex} 段是服务端给你的下一段。`;
  if (preset === null) {
    note.textContent = `${head}这一段的曲库预设时长缺失，服务端会拒绝上传（没有权威时长就核不了录音长度），先在曲库补上这一段。`;
    return;
  }
  note.textContent = `${head}按曲库预设 ${formatClock(preset)} 录，录完再选去向。不点开就不会占用你的麦克风。`;
}

/** 水位只画到「连续录满」的那一段；没有一段录满时整片水都不画（瓶子是干的）。 */
function renderWater() {
  const bodyPath = q('svg path[fill="url(#gWater)"]');
  const edge = q('svg path[stroke="#eafcff"][stroke-opacity=".5"]');
  const surface = q('svg rect[x="60"][y="430"]');
  const surfaceLine = q('svg line[y1="430"][stroke-opacity=".4"]');
  if (bodyPath === null) return;

  const front = waterFrontIndex();
  const frontX = PROFILE_LEFT + front * cellSlot(1).width;
  const bottomX = frontX + WATER_SLANT_X;
  const controlX = frontX + WATER_SLANT_CONTROL_X;

  if (front === 0) {
    setShapeVisible(bodyPath, false);
    setShapeVisible(edge, false);
    setShapeVisible(surface, false);
    setShapeVisible(surfaceLine, false);
    return;
  }
  setShapeVisible(bodyPath, true);
  setShapeVisible(edge, true);
  setShapeVisible(surface, true);
  setShapeVisible(surfaceLine, true);
  bodyPath.setAttribute('d', `M60 430 H${frontX} Q${controlX} 468 ${bottomX} 592 H60 Z`);
  edge?.setAttribute('d', `M${frontX} 430 Q${controlX} 468 ${bottomX} 592`);
  surface?.setAttribute('width', String(frontX - 60));
  surfaceLine?.setAttribute('x2', String(frontX));
}

/** 格位分隔线：最后一条边界只留刻线，之前的通高（与定稿画法一致）。 */
function renderDividers() {
  const detail = state.detail;
  const tickGroup = q('svg g[stroke="#e4f7fc"][stroke-opacity=".18"]');
  const fullLines = qa('svg line[stroke="#f3f9fa"][stroke-opacity=".13"]');
  if (tickGroup === null || fullLines.length === 0) return;
  const tickTemplate = tickGroup.querySelector('line');
  const fullTemplate = fullLines[0];
  const fullParent = fullTemplate.parentNode;
  if (tickTemplate === null || fullParent === null) return;

  for (const line of fullLines) line.remove();
  for (const line of qa('line', tickGroup)) line.remove();

  for (let boundary = 1; boundary < detail.totalSegments; boundary += 1) {
    const x = PROFILE_LEFT + boundary * cellSlot(1).width;
    const tick = tickTemplate.cloneNode(true);
    tick.setAttribute('x1', String(x));
    tick.setAttribute('x2', String(x));
    tickGroup.append(tick);
    if (boundary < detail.totalSegments - 1) {
      const column = fullTemplate.cloneNode(true);
      column.setAttribute('x1', String(x));
      column.setAttribute('x2', String(x));
      fullParent.append(column);
    }
  }
}

// ------------------------------------------------------------------ 三选一去向

function renderResolution() {
  const available = state.detail.availableResolutions;
  qa('.destRow').forEach((row, position) => {
    const spec = RESOLUTION_ROWS[position];
    if (spec === undefined) return;
    const usable = available.includes(spec.code);
    /** 设计要求：**不可用就禁用，不隐藏**（禁用形态取 DESIGN.md：muted + 与可用有明显形态差异）。 */
    row.disabled = !usable;
    row.setAttribute('aria-disabled', usable ? 'false' : 'true');
    row.style.cursor = usable ? 'pointer' : 'not-allowed';
    const title = row.querySelector('.t');
    if (title !== null) title.style.color = usable ? '' : 'var(--muted)';
    const glyph = row.querySelector('.glyph');
    if (glyph !== null) glyph.style.opacity = usable ? '' : '.45';
  });

  const sub = q('.destCol .sub');
  if (sub !== null) {
    sub.textContent =
      available.length === 0
        ? '现在这支瓶子不由你定去向（只有持有者、或「还没投河的发起者」能选）。可选去向由服务端给。'
        : `你现在可选 ${available.length} 条水路；想去向由服务端给，不可用的照样列出来但点不动。`;
  }
}

/**
 * **去向在接唱完之后才出现**（W4-a 需求 3）。
 *
 * 判据只有一条：我在这支瓶子里录过一段（`hasSung()`）—— 因为"接唱完"这件事的唯一痕迹
 * 就是"段链里有我的段"。刚到一支还没唱过的瓶子（含自己刚建立、还没录的 DRAFT），
 * 整列 `hidden`：用户第 2 轮原话是「选择去向我记得是在接唱完之后才出现的」。
 *
 * 为什么不是"本会话录完才显示"：录完刷新页面就不能定去向了 ⇒ 瓶子会卡死在 DRAFT/HELD。
 * 服务端的 `availableResolutions` 仍是权威：不可用**禁用不隐藏**（`renderResolution()` 照旧）。
 */
function renderDestinationGate() {
  const col = q('.destCol');
  if (col === null) return;
  setVisible(col, hasSung());
}

// ------------------------------------------------------------------ 试听 / 投票

async function selectSegment(index, options = {}) {
  const segment = segmentByIndex(index);
  if (segment === null) return;
  /** 换段试听＝中断连播（需求 5 的"可中断"）。 */
  if (listenAll.playing) stopListenAll();
  state.selectedIndex = index;

  qa('.segLab').forEach((lab, position) => {
    const cellIndex = position + 1;
    const dry = segmentByIndex(cellIndex) === null;
    lab.className = `segLab meta${dry ? ' gap' : ''}${cellIndex === index ? ' sel' : ''}`;
  });
  const slot = cellSlot(index);
  const mark = q('.selMark');
  if (mark !== null) {
    mark.style.left = `${slot.left + (slot.width - 60) / 2}px`;
    show(mark);
  }

  setText('.listenCol h2 span', `第 ${index} 段　${segment.ownerCode}　在瓶身上点「听」换段`);
  setText('.votesNote', '正在读取服务端记录的已听覆盖率…');
  await loadAudioFor(segment);
  if (options.autoPlay === true) void playAudio();
}

async function loadAudioFor(segment) {
  stopListenReporting();
  state.coveredMs = 0;
  state.lastAudioMs = 0;
  if (state.audio === null) {
    state.audio = el('audio', { preload: 'auto' });
    document.body.append(state.audio);
    bindAudioEvents();
  }
  state.audio.src = `/api/segments/${encodeURIComponent(segment.id)}/audio`;
  updateTransport(0, segment.durationMs ?? 0);

  /** 选段即问一次服务端进度：门槛与「已听多少」都以服务端记账为准（该端点没有 GET 版本）。 */
  try {
    const progress = await post(`/api/segments/${encodeURIComponent(segment.id)}/listen`, { coveredMs: 0 });
    state.listenView = progress;
    renderVotesNote();
  } catch (error) {
    setText('.votesNote', error instanceof ApiError ? error.message : '读不到已听进度。');
  }
}

/**
 * 进度条的分母：`MediaRecorder` 产出的 webm 常常**不写 Duration**（`audio.duration` 是 Infinity），
 * 这时按容器推算会得到"分母不可用" ⇒ 退回服务端记的段时长（权威值），进度条才不会停在 0:00。
 */
function totalMsWithFallback(audio) {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration * 1000;
  const segment = state.selectedIndex === null ? null : segmentByIndex(state.selectedIndex);
  return segment?.durationMs ?? 0;
}

function bindAudioEvents() {
  const audio = state.audio;
  on(audio, 'timeupdate', () => {
    const currentMs = audio.currentTime * 1000;
    const delta = currentMs - state.lastAudioMs;
    /** 拖动进度条不算"听过"：跳变（>1.2s）只移动游标，不计入覆盖时长。 */
    if (delta > 0 && delta < 1_200) state.coveredMs += delta;
    state.lastAudioMs = currentMs;
    updateTransport(currentMs, totalMsWithFallback(audio));
  });
  on(audio, 'seeking', () => {
    state.lastAudioMs = audio.currentTime * 1000;
  });
  on(audio, 'play', () => startListenReporting());
  on(audio, 'pause', () => {
    stopListenReporting();
    void reportListen();
  });
  on(audio, 'ended', () => {
    stopListenReporting();
    void reportListen();
  });
  on(audio, 'error', () => setText('.votesNote', '这一段音频取不到（可能还没录，或被撤下）。'));
}

function updateTransport(currentMs, totalMs) {
  const span = totalMs > 0 ? Math.min(1, currentMs / totalMs) : 0;
  const fill = q('.bar .fill');
  const head = q('.bar .head');
  if (fill !== null) fill.style.width = `${Math.round(span * 400)}px`;
  if (head !== null) head.style.left = `${Math.round(span * 400) - 2}px`;
  setText('.timecode', `${formatClock(currentMs)} / ${formatClock(totalMs)}`);
  const index = state.selectedIndex;
  /** W7：时间轴与这条进度条是同一件事的两种画法 —— 每次进度更新都让唱针跟着走。 */
  paintTimeline();
  if (index === null) return;
  q('.bar')?.setAttribute('aria-label', `第 ${index} 段播放进度 ${formatClock(currentMs)} / ${formatClock(totalMs)}`);
  q('.play')?.setAttribute('aria-label', state.audio?.paused === false ? `暂停第 ${index} 段` : `播放第 ${index} 段`);
}

async function playAudio() {
  const audio = state.audio;
  if (audio === null || state.selectedIndex === null) return;
  if (listenAll.playing) stopListenAll();
  if (audio.paused === false) {
    audio.pause();
    return;
  }
  try {
    await audio.play();
  } catch {
    setText('.votesNote', '播放被浏览器拦下了：再点一次唱片上的三角。');
  }
}

function startListenReporting() {
  stopListenReporting();
  state.reportTimer = window.setInterval(() => void reportListen(), LISTEN_REPORT_INTERVAL_MS);
}

function stopListenReporting() {
  if (state.reportTimer !== null) {
    window.clearInterval(state.reportTimer);
    state.reportTimer = null;
  }
}

async function reportListen() {
  const index = state.selectedIndex;
  const segment = index === null ? null : segmentByIndex(index);
  if (segment === null) return;
  try {
    const progress = await post(`/api/segments/${encodeURIComponent(segment.id)}/listen`, {
      coveredMs: Math.round(state.coveredMs),
    });
    if (index === state.selectedIndex) {
      state.listenView = progress;
      renderVotesNote();
    }
  } catch {
    // 上报失败不改页面（下一轮再报）；点踩时服务端仍会给真实判定。
  }
}

function renderListenColumn() {
  const segment = state.selectedIndex === null ? null : segmentByIndex(state.selectedIndex);
  renderVoteButtons();
  if (segment !== null) return;
  setText('.listenCol h2 span', '现在没有你能试听的段');
  setText('.votesNote', '还没有可试听的段，也就没有可投票的段。');
  updateTransport(0, 0);
}

/** 赞 / 踩的计数只认服务端；没有选中段时归零（别把定稿里的演示数字留在页面上）。 */
function renderVoteButtons() {
  const segment = state.selectedIndex === null ? null : segmentByIndex(state.selectedIndex);
  const counters = qa('.voteBtn .n');
  if (counters[0] !== undefined) counters[0].textContent = String(segment?.likeCount ?? 0);
  if (counters[1] !== undefined) counters[1].textContent = String(segment?.dislikeCount ?? 0);
}

/** 段附言（`Segment.note`）：定稿的 `.cap` 行放不下第 4 项，所以并进这一列的自由文本行。 */
function noteSuffix(segment) {
  return segment !== null && segment.note !== null && segment.note !== '' ? `　｜ 本段附言：${segment.note}` : '';
}

function renderVotesNote() {
  const segment = state.selectedIndex === null ? null : segmentByIndex(state.selectedIndex);
  const view = state.listenView;
  if (segment !== null && state.me !== null && segment.ownerId === state.me.id) {
    setText('.votesNote', `这是你自己录的段：可以点赞，但不能点踩。${noteSuffix(segment)}`);
    return;
  }
  if (view === null) return;
  const threshold = Math.round((view.threshold ?? DISLIKE_THRESHOLD_FALLBACK) * 100);
  const listened = Math.round((view.ratio ?? 0) * 100);
  setText(
    '.votesNote',
    (view.reachedThreshold === true
      ? `服务端记录已听 ${listened}%，已达到点踩门槛（${threshold}%）。`
      : `还没听满：服务端记录已听 ${listened}%，要到 ${threshold}% 才能点踩。`) + noteSuffix(segment),
  );
}

async function castVote(value) {
  const index = state.selectedIndex;
  const segment = index === null ? null : segmentByIndex(index);
  if (segment === null) return;
  try {
    const result = await post(`/api/segments/${encodeURIComponent(segment.id)}/votes`, { value });
    clearState();
    segment.likeCount = result.likeCount;
    segment.dislikeCount = result.dislikeCount;
    renderCellCounts(index);
    state.listenView = { ...(state.listenView ?? {}), ratio: result.listenedRatio };
    renderVotesNote();
    if (result.segmentCut === true) {
      setText('.votesNote', '这一段踩数到顶，已经被斩浪移出作品；瓶子已重新投回河道等补位。');
      await refresh();
    }
  } catch (error) {
    showError(error instanceof ApiError ? error.message : '投票失败。');
  }
}

function renderCellCounts(index) {
  const segment = segmentByIndex(index);
  const cap = state.capNodes.get(index);
  if (segment === null || cap === undefined) return;
  const spans = cap.querySelectorAll('.line span');
  if (spans[1] !== undefined) spans[1].textContent = `赞 ${segment.likeCount}`;
  if (spans[2] !== undefined) spans[2].textContent = `踩 ${segment.dislikeCount}`;
  if (index === state.selectedIndex) renderVoteButtons();
}

// ------------------------------------------------------------------ 试听全部（W4-a 需求 5）

/**
 * 「试听全部」＝把**已录的段按段号连播**，缺口跳过。
 *
 * 为什么不是"先拼成一条音频"：后端没有混音/导出端点（§13 需求 5 原文：「不需要导出」），
 * 前端也不该伪造 —— 串行播放在听感上就是"按顺序把这首歌听完"，代价只是段与段之间有一道接缝，
 * 且不引入任何依赖。
 *
 * 落位：定稿自己那一行 `.votes`（赞 / 踩）的尾部。为什么是这里：
 *   - 那一行是 `display:flex`，横向还剩 ~280px ⇒ 加一枚按钮**不动任何纵向坐标**；
 *     `.listenCol` 从 630 排到 851，离底栏分隔线（852）只剩 1px，另起一行的方案必然压到底栏；
 *   - 形态直接借页面自己的 `.voteBtn`（边框/高度/字号全部照抄既有类，不新造视觉值）。
 * 借用类名安全：`renderVoteButtons()` 只认 `.voteBtn .n`（本按钮没有 `.n`），
 * 而 `wire()` 的 `qa('.voteBtn')` 在 init 时就抓完了定稿里的赞/踩两枚。
 *
 * 0 段时**按钮不存在**（需求 5：不要留一个点了没反应的按钮）。
 */
const listenAll = { button: null, audio: null, queue: [], cursor: 0, playing: false };

/** 已录的段（按段号升序）：缺口天然不在里面，所以"缺口跳过"是构造出来的，不需要额外判断。 */
function playableSegments() {
  return [...(state.detail?.segments ?? [])].sort((left, right) => left.index - right.index);
}

function ensureListenAllButton() {
  const row = q('.votes');
  if (row === null) return null;
  if (listenAll.button !== null && listenAll.button.isConnected) return listenAll.button;
  const button = el('button', { class: 'voteBtn w4a-listenAll', type: 'button' });
  on(button, 'click', () => {
    if (listenAll.playing) stopListenAll();
    else startListenAll();
  });
  row.append(button);
  listenAll.button = button;
  return button;
}

function ensureListenAllAudio() {
  if (listenAll.audio !== null) return listenAll.audio;
  const audio = el('audio', { class: 'w4a-listenAllAudio', preload: 'auto' });
  on(audio, 'ended', () => advanceFrom(listenAll.cursor));
  on(audio, 'timeupdate', () => {
    if (!listenAll.playing) return;
    const segment = listenAll.queue[listenAll.cursor];
    if (segment === undefined || typeof segment.durationMs !== 'number' || segment.durationMs <= 0) return;
    /**
     * `MediaRecorder` 的 webm 常常**不写 Duration**（占位 0:00 的分母问题同源）⇒ `ended` 不保证来。
     * 服务端记的段时长是权威值，用它兜底推进（250ms 容差）。
     */
    if (audio.currentTime * 1000 >= segment.durationMs - 250) advanceFrom(listenAll.cursor);
    /** W7：连播时唱针也要跟着走（两个播放源共一条时间轴）。 */
    paintTimeline();
  });
  on(audio, 'error', () => {
    if (!listenAll.playing) return;
    setText('.votesNote', '连播中断：有一段音频取不到。');
    stopListenAll();
  });
  document.body.append(audio);
  listenAll.audio = audio;
  return audio;
}

/** 只有"还在同一段上"才推进：`ended` 与 `timeupdate` 可能对同一段各报一次。 */
function advanceFrom(cursor) {
  if (!listenAll.playing || listenAll.cursor !== cursor) return;
  playQueueAt(cursor + 1);
}

function playQueueAt(index) {
  const audio = listenAll.audio;
  const segment = listenAll.queue[index];
  if (audio === null || segment === undefined) {
    stopListenAll();
    return;
  }
  listenAll.cursor = index;
  audio.src = `/api/segments/${encodeURIComponent(segment.id)}/audio`;
  renderListenAllLabel();
  paintTimeline();
  const started = audio.play();
  if (started !== undefined && typeof started.catch === 'function') {
    started.catch(() => {
      setText('.votesNote', '浏览器拦下了连播：再点一次「试听全部」重试。');
      stopListenAll();
    });
  }
}

function startListenAll() {
  const segments = playableSegments();
  if (segments.length === 0) return;
  stopListenAll();
  /** 与单段试听互斥：两个都在放就成了两条声道。 */
  const single = state.audio;
  if (single !== null && single.paused === false) single.pause();
  listenAll.queue = segments;
  listenAll.playing = true;
  ensureListenAllAudio();
  playQueueAt(0);
}

/** 停止（可中断）：再点一次按钮、或换段试听时都会走这里。 */
function stopListenAll() {
  const audio = listenAll.audio;
  if (audio !== null && audio.paused === false) audio.pause();
  listenAll.playing = false;
  listenAll.queue = [];
  listenAll.cursor = 0;
  renderListenAllLabel();
  /** W7：退出连播后唱针回到"正在试听的那一段"（不再停在连播游标上）。 */
  paintTimeline();
}

function renderListenAllLabel() {
  const button = listenAll.button;
  if (button === null || !button.isConnected) return;
  const total = playableSegments().length;
  if (listenAll.playing && listenAll.queue.length > 0) {
    const current = listenAll.queue[listenAll.cursor];
    button.textContent = `停止试听（${listenAll.cursor + 1}/${listenAll.queue.length}）`;
    button.setAttribute('aria-label', `停止试听连播：正在播第 ${current?.index ?? 0} 段（共 ${listenAll.queue.length} 段）`);
    button.title = '再点一次停止连播';
    return;
  }
  button.textContent = '试听全部';
  button.setAttribute('aria-label', `试听全部：按段号顺序连播这 ${total} 段，缺口跳过，不做混音`);
  button.title = '按段号顺序连播已录的段；缺口跳过（不做混音、不导出）';
}

/** 每次渲染都过一遍：有段就有按钮（并且标签回到"试听全部"），0 段就把按钮摘掉。 */
function renderListenAll() {
  const row = q('.votes');
  if (row === null) return;
  if (playableSegments().length === 0) {
    stopListenAll();
    listenAll.button?.remove();
    listenAll.button = null;
    return;
  }
  ensureListenAllButton();
  renderListenAllLabel();
}

// ------------------------------------------------------------------ W7：播放时间轴 + 唱针（§17.1 需求 2）

/**
 * 公海详情页（`site/sea-detail.html`）已按用户第 3 轮需求删除；它顶部那条**沟槽时间轴 + 唱针**
 * 复刻到这里。两件装置的语义**不重复**（§17.1）：
 *   - 上方的「瓶身剖面」回答"哪些段录了、缺哪段"（纵向水位 + 干格，段与段的**有无**）；
 *   - 这条时间轴回答"现在放到哪儿、这一段多长"（横向沟槽 + 唱针 + 段刻度，是**播放头**）。
 *
 * 落位（页面 y 207..272 是唯一一条空带）：剖面与试听列之间（y 535..600）会横切剖面的**水面斜边**
 * —— "水只到第 N 段"正是靠那条边读出来的，压上去就毁掉剖面的读法 ⇒ 时间轴放在页头之下、
 * 剖面之上：不动任何既有坐标（改前/改后几何逐项比对为 0 位移，见 §17.6）。
 *
 * 横向对齐**剖面格位**（左 76 / 宽 924）而不是海面的 1076 ⇒ 时间轴的段边界与剖面的格子同一条竖线，
 * 缺口格与时间轴上的空段上下对齐。类名与数值照抄 `site/sea-detail.html` 的那条时间轴
 * （该文件已删，值在这里以运行时 `<style>` 存活）；三处必要偏离（`.band`/`.sheen`/`.refl` 不带过来、
 * 唱针用本页 `.bar .head` 的 2px 珊瑚竖线语言）都记在 §17.6。
 */
const TIMELINE_STYLE_ID = 'w7-timeline-style';
const TIMELINE_TOP = 210;
const TIMELINE_WIDTH = PROFILE_RIGHT - PROFILE_LEFT;
const TIMELINE_GROOVE_TOP = 22;
const TIMELINE_GROOVE_HEIGHT = 13;
const TIMELINE_MARKS_TOP = 41;
const TIMELINE_STYLE = [
  `.w7-timeline{position:absolute;left:${String(PROFILE_LEFT)}px;top:${String(TIMELINE_TOP)}px;`,
  `width:${String(TIMELINE_WIDTH)}px;height:58px;}`,
  '.w7-timeline-lab{position:absolute;left:0;top:0;font-size:11px;letter-spacing:.18em;',
  'color:rgba(243,249,250,.5);}',
  `.w7-timeline .groove{position:absolute;left:0;right:0;top:${String(TIMELINE_GROOVE_TOP)}px;`,
  `height:${String(TIMELINE_GROOVE_HEIGHT)}px;}`,
  '.w7-timeline .groove::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;',
  'background:linear-gradient(90deg,rgba(216,243,246,0),rgba(216,243,246,.15) 12%,',
  'rgba(216,243,246,.16) 82%,rgba(216,243,246,.05) 100%);}',
  '.w7-timeline .seg{position:absolute;top:0;height:13px;}',
  '.w7-timeline .seg.on{border-top:1px solid rgba(216,243,246,.38);border-bottom:1px solid rgba(216,243,246,.38);}',
  '.w7-timeline .seg.off{border-top:1px solid rgba(216,243,246,.15);border-bottom:1px solid rgba(216,243,246,.15);}',
  '.w7-timeline .core{position:absolute;top:1px;bottom:1px;left:0;right:0;',
  'background:repeating-linear-gradient(90deg,rgba(127,209,217,.78) 0 1px,rgba(127,209,217,.16) 1px 3.4px);}',
  '.w7-timeline .seg.on .core{',
  '-webkit-mask-image:linear-gradient(90deg,rgba(255,255,255,.58),#fff 28%,rgba(255,255,255,.66) 60%,#fff 88%);',
  'mask-image:linear-gradient(90deg,rgba(255,255,255,.58),#fff 28%,rgba(255,255,255,.66) 60%,#fff 88%);}',
  '.w7-timeline .seg.off .core{',
  'background:repeating-linear-gradient(90deg,rgba(169,199,207,.17) 0 1px,rgba(169,199,207,.03) 1px 3.4px);}',
  '.w7-timeline .dull{position:absolute;top:0;bottom:0;right:0;',
  'background:linear-gradient(90deg,rgba(5,15,20,0),rgba(5,15,20,.44) 8%,rgba(5,15,20,.64) 100%);}',
  '.w7-timeline .seg.empty{border-top:1px dashed rgba(246,215,154,.7);',
  'border-bottom:1px dashed rgba(246,215,154,.7);',
  '-webkit-mask-image:linear-gradient(90deg,#fff 0 29%,rgba(255,255,255,0) 29% 71%,#fff 71% 100%);',
  'mask-image:linear-gradient(90deg,#fff 0 29%,rgba(255,255,255,0) 29% 71%,#fff 71% 100%);}',
  '.w7-timeline .cut{position:absolute;top:0;height:13px;width:2px;background:rgba(246,215,154,.8);}',
  '.w7-timeline .voidwash{position:absolute;top:0;height:13px;background:rgba(246,215,154,.05);}',
  '.w7-timeline .sep{position:absolute;top:-6px;height:25px;width:1px;background:rgba(243,249,250,.09);}',
  '.w7-timeline .voidlabel{position:absolute;top:50%;transform:translateY(-50%);text-align:center;',
  'font-size:13.5px;letter-spacing:.06em;color:var(--warm);}',
  '.w7-timeline .w7-needle{position:absolute;top:16px;width:2px;height:25px;background:var(--coral);}',
  '.w7-timeline .w7-tip{position:absolute;top:19px;width:20px;height:20px;margin-left:-10px;border-radius:50%;',
  'background:radial-gradient(circle,rgba(212,85,58,.4),rgba(212,85,58,0) 68%);}',
  '.w7-timeline .w7-tip::after{content:"";position:absolute;left:50%;top:50%;width:6px;height:6px;',
  'margin:-3px 0 0 -3px;border-radius:50%;background:var(--coral);}',
  `.w7-timeline .marks{position:absolute;left:0;right:0;top:${String(TIMELINE_MARKS_TOP)}px;`,
  'height:17px;display:grid;}',
  '.w7-timeline .marks > div{display:flex;align-items:baseline;gap:10px;}',
  '.w7-timeline .marks .cat{font-family:Quattrocento,serif;font-size:11px;letter-spacing:.24em;',
  'color:rgba(243,249,250,.5);}',
  '.w7-timeline .marks .d{font-family:Quattrocento,serif;font-size:13px;color:var(--muted);}',
  '.w7-timeline .marks .d.warm{color:var(--warm);}',
].join('');

/** 时间轴节点引用（一次建成，之后只改类名/位置；`shape` 变了才重建子节点）。 */
const timeline = { root: null, lab: null, groove: null, marks: null, needle: null, tip: null, shape: null };

function ensureTimeline() {
  if (timeline.root !== null && timeline.root.isConnected) return timeline;
  const main = q('main');
  if (main === null) return null;
  if (document.getElementById(TIMELINE_STYLE_ID) === null) {
    const style = document.createElement('style');
    style.id = TIMELINE_STYLE_ID;
    style.textContent = TIMELINE_STYLE;
    document.head.append(style);
  }
  timeline.lab = el('p', { class: 'w7-timeline-lab meta', text: '播放时间轴' });
  timeline.groove = el('div', { class: 'groove' });
  timeline.marks = el('div', { class: 'marks' });
  /**
   * 唱针：一条 2px 珊瑚竖线（本页 `.bar .head` 的既有语言）+ 稿子里那枚 `.tip`（珊瑚点 + 光晕）。
   * 装饰件一律 `aria-hidden`（契约：装饰不进内容安全框，`fit.js`/`probe-fit` 都不把它当内容）。
   */
  timeline.needle = el('span', { class: 'w7-needle', 'aria-hidden': 'true', dataset: { w7Needle: '' } });
  timeline.tip = el('span', { class: 'w7-tip', 'aria-hidden': 'true' });
  timeline.root = el(
    'section',
    { class: 'w7-timeline', 'aria-label': '播放时间轴：整条沟槽是这首歌，唱针＝播放头', dataset: { w7Timeline: '' } },
    [timeline.lab, timeline.groove, timeline.needle, timeline.tip, timeline.marks],
  );
  main.append(timeline.root);
  timeline.shape = null;
  return timeline;
}

/** 当前"放到哪儿"：连播看连播游标，否则看正在试听的那一段；两者都取**真实**播放位置。 */
function timelineCursor() {
  if (listenAll.playing) {
    const segment = listenAll.queue[listenAll.cursor] ?? null;
    if (segment === null) return null;
    return {
      index: segment.index,
      currentMs: listenAll.audio === null ? 0 : listenAll.audio.currentTime * 1000,
      totalMs: segment.durationMs ?? 0,
    };
  }
  const index = state.selectedIndex;
  const segment = index === null ? null : segmentByIndex(index);
  if (segment === null) return null;
  return {
    index: segment.index,
    currentMs: state.audio === null ? 0 : state.audio.currentTime * 1000,
    totalMs: state.audio === null ? (segment.durationMs ?? 0) : totalMsWithFallback(state.audio),
  };
}

/** 段数/缺口/时长变了才重建沟槽与刻度（数值全部来自服务端 DTO，不写死段数与时长）。 */
function timelineShape(detail) {
  const segments = detail.segments
    .map((segment) => `${String(segment.index)}:${String(segment.durationMs)}`)
    .join(',');
  return `${String(detail.totalSegments)}/${detail.missingSegmentIndexes.join(',')}/${segments}`;
}

function buildTimelineShape(view, segWidth) {
  const detail = state.detail;
  const total = detail.totalSegments;
  const missing = new Set(detail.missingSegmentIndexes);
  const children = [];
  const marks = [];
  for (let index = 1; index <= total; index += 1) {
    const segment = segmentByIndex(index);
    const node = el('div', { class: 'seg off', style: `left:${String((index - 1) * segWidth)}px;width:${String(segWidth)}px` });
    if (segment === null) {
      /** 缺口段：槽壁被切断、中间让出背景（与稿子同一个 `.seg.empty`），它在时间轴上**看得见**。 */
      node.className = 'seg empty';
    } else {
      node.append(el('span', { class: 'core' }));
    }
    children.push(node);
    marks.push(
      el('div', {}, [
        el('span', { class: 'cat', text: `A${String(index)}` }),
        el('span', {
          class: segment === null ? 'd warm' : 'd',
          text: segment === null ? '静音' : formatClock(segment.durationMs),
        }),
      ]),
    );
  }

  const firstGap = [...missing].sort((left, right) => left - right)[0];
  if (firstGap !== undefined) {
    const left = (firstGap - 1) * segWidth;
    children.push(el('span', { class: 'voidwash', style: `left:${String(left)}px;width:${String(segWidth)}px` }));
    children.push(el('span', { class: 'cut', style: `left:${String(left)}px` }));
    children.push(el('span', { class: 'cut', style: `left:${String(left + segWidth - 2)}px` }));
    children.push(
      el('p', { class: 'voidlabel', style: `left:${String(left)}px;width:${String(segWidth)}px`, text: '这一段还没有人唱' }),
    );
  }
  for (let index = 0; index <= total; index += 1) {
    children.push(el('span', { class: 'sep', style: `left:${String(index * segWidth)}px` }));
  }
  view.groove.replaceChildren(...children);
  view.marks.style.gridTemplateColumns = `repeat(${String(total)}, ${String(segWidth)}px)`;
  view.marks.replaceChildren(...marks);
}

/**
 * 重画时间轴。**跟着播放走**：段边界与段号来自服务端段数据，唱针位置＝当前段的播放进度
 * （单段试听与「试听全部」两个播放源都喂进来 —— 唱针只有一个，图里也只该有一条时间轴）。
 */
function paintTimeline() {
  const view = ensureTimeline();
  const detail = state.detail;
  if (view === null || detail === null) return;
  const total = detail.totalSegments;
  const segWidth = TIMELINE_WIDTH / total;
  const shape = timelineShape(detail);
  if (view.shape !== shape) {
    buildTimelineShape(view, segWidth);
    view.shape = shape;
  }

  const cursor = timelineCursor();
  const cursorIndex = cursor === null ? null : cursor.index;
  const progress =
    cursor === null || !(cursor.totalMs > 0) ? 0 : Math.min(1, Math.max(0, cursor.currentMs / cursor.totalMs));
  const missing = new Set(detail.missingSegmentIndexes);

  for (const [offset, node] of qa('.seg', view.groove).entries()) {
    const index = offset + 1;
    if (missing.has(index)) {
      node.className = 'seg empty';
      continue;
    }
    /** 唱针走过的段亮（`.on`）、没走过的暗（`.off`）；当前段在唱针之后压暗（`.dull`）。 */
    node.className = cursorIndex !== null && index <= cursorIndex ? 'seg on' : 'seg off';
    const dull = q('.dull', node);
    if (dull !== null) dull.remove();
    if (index === cursorIndex && progress > 0) {
      node.append(el('span', { class: 'dull', style: `left:${(progress * segWidth).toFixed(1)}px` }));
    }
  }

  const label = cursor === null ? '播放时间轴 · 还没有能试听的段' : `播放时间轴 · 唱针在第 ${String(cursorIndex)} 段`;
  if (view.lab.textContent !== label) view.lab.textContent = label;

  const on = cursor !== null;
  view.needle.hidden = !on;
  view.tip.hidden = !on;
  if (!on) return;
  const x = (cursorIndex - 1) * segWidth + progress * segWidth;
  view.needle.style.left = `${(x - 1).toFixed(1)}px`;
  view.tip.style.left = `${x.toFixed(1)}px`;
}

function renderPutBack() {
  const detail = state.detail;
  const button = q('.putBack .ghost');
  const note = q('.putBack span');
  if (button === null) return;
  const usable = detail.isHolder === true && detail.status === 'HELD';
  button.disabled = !usable;
  button.setAttribute('aria-disabled', usable ? 'false' : 'true');
  button.style.cursor = usable ? 'pointer' : 'not-allowed';
  button.style.opacity = usable ? '' : '.6';
  if (note !== null) {
    note.textContent = usable
      ? '放回去不接唱：会有一段时间捞不到同一支，其余什么都不记。'
      : '你此刻不是这支瓶子的持有者，放回不成立。';
  }
}

function renderLinks() {
  const journey = q('.journey');
  if (journey !== null) {
    journey.textContent = '看这只瓶子的漂流日志';
    journey.setAttribute('href', `/drift-log.html?id=${encodeURIComponent(state.id)}`);
  }
}

// ------------------------------------------------------------------ 录音：MediaRecorder → 原始二进制上传

function recordingAllowed() {
  const detail = state.detail;
  if (detail === null || detail.isComplete === true || detail.status === 'DAMAGED') return false;
  /**
   * 内核 `canRecordSegment`：DRAFT 只有发起者能录、HELD 只有持有者能录，其余状态谁都不能录。
   * DTO 不暴露 `initiatorId`，所以「我是不是发起者」用服务端给的 `availableResolutions` 反推
   *（`resolution.ts`：DRAFT 且非发起者恒为空数组）—— 不猜、不新增契约字段。
   */
  const byStatus =
    detail.status === 'DRAFT'
      ? detail.availableResolutions.length > 0
      : detail.status === 'HELD' && detail.isHolder === true;
  if (!byStatus) return false;
  /** 同一人在同一瓶子里只能唱一次（含被斩的段，`hasEverSung`）。 */
  return state.me === null || !detail.segments.some((segment) => segment.ownerId === state.me.id);
}

function presetDurationFor(index) {
  if (state.songs === null || state.detail === null) return null;
  const song = state.songs.find((item) => item.id === state.detail.songId);
  const duration = song?.segments?.find((item) => item.index === index)?.durationMs;
  return typeof duration === 'number' && duration > 0 ? duration : null;
}

async function startRecording() {
  /** 段号只从服务端来（需求 2）：页面上没有任何控件能改它。 */
  const gapIndex = recordTargetIndex();
  if (gapIndex === null) return;
  /** 这一段该录多久：唯一来源是曲库（`GET /api/songs`）；拿不到权威预设就只报已录时长、不自动停。 */
  const targetMs = presetDurationFor(gapIndex);
  const cta = q('.gapBox .cta');

  const started = await startRecordingSession({
    onStop: ({ blob, durationMs }) => {
      if (state.recordTimer !== null) {
        window.clearInterval(state.recordTimer);
        state.recordTimer = null;
      }
      state.session = null;
      void uploadRecording({ blob, elapsedMs: durationMs, gapIndex });
    },
  });
  if (!started.ok) {
    announce(started.message);
    showError(started.message);
    return;
  }

  state.session = started.session;
  state.recordTimer = window.setInterval(() => {
    const progress = countdown(targetMs, started.session.elapsedMs());
    const elapsed = formatClock(progress.elapsedMs);
    if (progress.remainingSeconds === null) {
      announce(`正在录音…已录 ${elapsed}（这一段没有曲库预设，不会自动停）。`);
    } else {
      announce(`正在录音…已录 ${elapsed}，还剩 ${progress.remainingSeconds} 秒（录满自动停）。`);
      if (cta !== null) cta.textContent = `停止上传（还剩 ${progress.remainingSeconds} 秒）`;
    }
    if (progress.reached) started.session.stop();
  }, 250);
}

function stopRecording() {
  state.session?.stop();
}

/**
 * 上传这一段：走共享层 `api.postAudio`（**原始二进制协议**：Content-Type = 音频 MIME、
 * body = 字节流、时长走 `x-audio-duration-ms`）。页内自写 `fetch` 会绕过共享层的
 * 401 统一处置（跳登录页）与错误信封解析，所以这里不再自己拼头、不再自己解析。
 */
async function uploadRecording({ blob, elapsedMs, gapIndex }) {
  announce('正在上传这一段…');
  const cta = q('.gapBox .cta');
  if (cta !== null) {
    cta.disabled = true;
    cta.textContent = '正在上传…';
  }
  try {
    const response = await postAudio(`/api/bottles/${encodeURIComponent(state.id)}/segments`, blob, {
      durationMs: elapsedMs,
    });
    clearState();
    state.detail = response.bottle;
    render();
    /**
     * 上传成功＝"接唱完了"⇒ 去向此刻才出现（`renderDestinationGate()`）。提示要说清两者，
     * 否则用户看不到去向是**刚出现的**。同一人在一支瓶子里只能唱一次，所以这里不再提"下一段"。
     */
    announce(
      `第 ${response.index} 段已经录好了（本段时长 ${formatClock(elapsedMs)}）。` +
        (response.nextRecordIndex === null
          ? '作品已经完整：'
          : `歌里还缺第 ${response.nextRecordIndex} 段等别人接，你的这一棒到此为止：`) +
        '现在选去向。',
    );
  } catch (error) {
    const message = error instanceof ApiError ? error.message : '上传失败，请重试。';
    announce(`上传失败：${message}（可以再点一次按钮重录）`);
    showError(message);
    const again = q('.gapBox .cta');
    if (again !== null) {
      again.disabled = false;
      again.textContent = `重录第 ${gapIndex} 段`;
    }
  }
}

// ------------------------------------------------------------------ 运行时面板（留言 / 举报）
// 冻结 HTML 里没有留言框、也没有举报理由框：这两件事必须有个输入通道，所以运行时建一个
// 居中面板（z-index 取 DESIGN.md 的 modal=300，遮罩取 rgba(water-void,.78)），按钮/输入框
// 只用本页已有的 token，不改任何既有构图。

const PANEL_STYLE_ID = 'w1b-panel-style';

function ensurePanelStyle() {
  if (document.getElementById(PANEL_STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = PANEL_STYLE_ID;
  style.textContent = [
    '.w1b-scrim{position:fixed;inset:0;z-index:200;background:rgba(3,17,23,.78);backdrop-filter:blur(2px);}',
    '.w1b-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:300;width:520px;',
    'padding:22px 24px 20px;background:var(--ink);border:1px solid var(--line);border-radius:2px;color:var(--paper);',
    "font-family:'LXGW WenKai',serif;}",
    '.w1b-panel__title{font-size:16px;font-weight:700;}',
    '.w1b-panel__intro{margin-top:8px;font-size:12.5px;line-height:1.6;color:var(--muted);}',
    '.w1b-panel__msg{margin-top:10px;font-size:12.5px;line-height:1.6;color:var(--warm);}',
    '.w1b-panel label{display:block;margin-top:14px;font-size:12.5px;color:var(--muted);}',
    '.w1b-panel select,.w1b-panel textarea{width:100%;margin-top:6px;padding:9px 10px;background:rgba(243,249,250,.05);',
    'border:1px solid var(--line);border-radius:2px;color:var(--paper);font-family:inherit;font-size:14px;}',
    '.w1b-panel textarea{min-height:84px;resize:none;}',
    '.w1b-panel__actions{margin-top:16px;display:flex;gap:12px;}',
    '.w1b-panel button{height:40px;padding:0 18px;border-radius:2px;font-family:inherit;font-size:14px;}',
    '.w1b-panel button[type="submit"]{border:0;background:var(--coral);color:var(--ink);}',
    '.w1b-panel button[type="button"]{border:1px solid rgba(243,249,250,.2);background:transparent;color:var(--paper);}',
  ].join('');
  document.head.append(style);
}

function buildPanel({ title, intro, field, submitLabel }) {
  ensurePanelStyle();
  const scrim = el('div', { class: 'w1b-scrim' });
  const message = el('p', { class: 'w1b-panel__msg', role: 'status' });
  const submit = el('button', { type: 'submit', text: submitLabel });
  const form = el('form', { class: 'w1b-panel', 'aria-label': title }, [
    el('p', { class: 'w1b-panel__title', text: title }),
    el('p', { class: 'w1b-panel__intro', text: intro }),
    field,
    message,
    el('div', { class: 'w1b-panel__actions' }, [submit, el('button', { type: 'button', text: '关闭' })]),
  ]);
  const close = () => {
    scrim.remove();
    form.remove();
  };
  on(scrim, 'click', close);
  on(form.querySelector('button[type="button"]'), 'click', close);
  document.body.append(scrim, form);
  return { form, message, submit, close };
}

async function openMessagePanel() {
  const detail = state.detail;
  const mine = state.me;
  /** 收件人 = 该段的作者（服务端按段号解析，不采信前端送来的身份）；自己的段不能当目标。 */
  const targets = detail.segments.filter((segment) => mine === null || segment.ownerId !== mine.id);
  const select =
    targets.length === 0
      ? null
      : el(
          'select',
          {},
          targets.map((segment) =>
            el('option', { value: String(segment.index), text: `第 ${segment.index} 段 · ${segment.ownerCode}` }),
          ),
        );
  const textarea = el('textarea', { maxlength: '500', placeholder: '只说给这位接唱者听（最多 500 字）' });
  const panel = buildPanel({
    title: '私密留言',
    intro:
      targets.length === 0
        ? '现在还没有可以留言的段：留言只能送给别人录的那一段的作者。'
        : '留言只有这段的作者本人（以及你自己）看得到，其他接唱者与发起者都看不到。',
    field: el('div', {}, [
      select === null ? null : el('label', { text: '送给哪一段的作者' }, [select]),
      el('label', { text: '留言内容' }, [textarea]),
    ]),
    submitLabel: '送出',
  });
  if (select === null) {
    panel.submit.disabled = true;
    return;
  }

  try {
    const existing = await get(`/api/bottles/${encodeURIComponent(state.id)}/messages`);
    if (existing.length > 0 && panel.form.isConnected) {
      panel.message.textContent = `这支瓶子里与你有关的留言已有 ${existing.length} 条（你发的 + 送给你的）。`;
    }
  } catch {
    // 读不到已有留言不影响发送
  }

  on(panel.form, 'submit', async (event) => {
    event.preventDefault();
    const content = textarea.value.trim();
    if (content === '') {
      panel.message.textContent = '先写点什么再送出。';
      return;
    }
    panel.submit.disabled = true;
    try {
      const sent = await post(`/api/bottles/${encodeURIComponent(state.id)}/messages`, {
        content,
        targetSegmentIndex: Number(select.value),
      });
      panel.message.textContent = `留言已送出：第 ${sent.targetSegmentIndex} 段的作者拿到瓶子时会收到。`;
      textarea.value = '';
    } catch (error) {
      panel.message.textContent = error instanceof ApiError ? error.message : '留言失败。';
    } finally {
      panel.submit.disabled = false;
    }
  });
}

function openReportPanel() {
  const textarea = el('textarea', { maxlength: '500', placeholder: '写清哪里不对（最多 500 字）' });
  const panel = buildPanel({
    title: '举报这支瓶子',
    intro: '举报进人工队列，不是自动删除：审核台看过才会处置，处置不影响你继续听。',
    field: el('label', { text: '举报理由' }, [textarea]),
    submitLabel: '提交举报',
  });
  on(panel.form, 'submit', async (event) => {
    event.preventDefault();
    const reason = textarea.value.trim();
    if (reason === '') {
      panel.message.textContent = '请填写举报理由。';
      return;
    }
    panel.submit.disabled = true;
    try {
      await post('/api/reports', { targetType: 'BOTTLE', targetId: state.id, reason });
      panel.message.textContent = '已进入人工审核队列（举报不会自动删除任何东西）。';
      textarea.value = '';
    } catch (error) {
      panel.message.textContent = error instanceof ApiError ? error.message : '举报提交失败。';
    } finally {
      panel.submit.disabled = false;
    }
  });
}

// ------------------------------------------------------------------ 接线（只接一次；重建的节点在 render 里各自绑）

async function refresh() {
  state.detail = await get(`/api/bottles/${encodeURIComponent(state.id)}`);
  render();
}

function wire() {
  qa('.destRow').forEach((row, position) => {
    const spec = RESOLUTION_ROWS[position];
    if (spec === undefined) return;
    on(row, 'click', async () => {
      if (row.disabled || state.resolving) return;
      state.resolving = true;
      try {
        const detail = await post(`/api/bottles/${encodeURIComponent(state.id)}/resolution`, {
          resolution: spec.code,
        });
        clearState();
        state.detail = detail;
        render();
        const notice = RESOLUTION_NOTICE[spec.code] ?? `已按「${spec.label}」处置这支瓶子。`;
        /**
         * 成功提示（需求 3）：共享层状态条说清"发生了什么"，页内那一行同样留痕 ——
         * 状态条是底部居中的浮层（`dom.js` 里非错误态到点会自己淡出），
         * 页内文案跟着页面走，跳转前一定读得到。
         * 状态种类只有 loading/empty/error/waking（共享层是冻结的），成功用中性的 `empty`：
         * 它的点是 muted 色 —— 不是错误色，也不是"正在加载"的脉冲。
         */
        setText('.destCol .sub', notice);
        showState('empty', notice);
        await new Promise((resolve) => setTimeout(resolve, RESOLUTION_REDIRECT_DELAY_MS));
        location.assign('/river.html');
      } catch (error) {
        state.resolving = false;
        showError(error instanceof ApiError ? error.message : '选去向失败。');
      }
    });
  });

  on(q('.play'), 'click', () => void playAudio());

  const votes = qa('.voteBtn');
  if (votes[0] !== undefined) on(votes[0], 'click', () => void castVote('LIKE'));
  if (votes[1] !== undefined) {
    on(votes[1], 'click', () => {
      const segment = state.selectedIndex === null ? null : segmentByIndex(state.selectedIndex);
      if (segment !== null && state.me !== null && segment.ownerId === state.me.id) {
        showError('自己的段不能点踩（内核规则：自踩不成立）。');
        return;
      }
      void castVote('DISLIKE');
    });
  }

  const putBack = q('.putBack .ghost');
  if (putBack !== null) {
    on(putBack, 'click', async () => {
      if (putBack.disabled) return;
      try {
        const result = await post(`/api/bottles/${encodeURIComponent(state.id)}/put-back`);
        clearState();
        /** 放回返回的是 `BottleSummary`（没有段与可选去向）⇒ 必须重取详情，不能就地合并。 */
        await refresh();
        announce(`已放回河中：接下来 ${result.cooldownDraws} 次捞取不会再捞到它。`);
      } catch (error) {
        showError(error instanceof ApiError ? error.message : '放回失败。');
      }
    });
  }

  const cta = q('.gapBox .cta');
  if (cta !== null) {
    on(cta, 'click', () => {
      if (state.session !== null) stopRecording();
      else void startRecording();
    });
  }

  const links = qa('.bottom .botLink');
  if (links[0] !== undefined) {
    on(links[0], 'click', (event) => {
      event.preventDefault();
      void openMessagePanel();
    });
  }
  if (links[1] !== undefined) {
    on(links[1], 'click', (event) => {
      event.preventDefault();
      openReportPanel();
    });
  }
}

export const { init } = definePage({
  name: 'bottle',
  owner: 'W1-b',
  endpoints: [
    'GET /api/bottles/:id',
    'POST /api/bottles/:id/segments',
    'POST /api/segments/:id/listen',
    'POST /api/segments/:id/votes',
    'GET/POST /api/bottles/:id/messages',
    'POST /api/bottles/:id/resolution',
    'POST /api/bottles/:id/put-back',
    'POST /api/reports',
  ],
  note: '额外必需：GET /api/segments/:id/audio（试听）、GET /api/songs（该段曲库预设时长）',
  init: async () => {
    wire();
    await load();
  },
});
