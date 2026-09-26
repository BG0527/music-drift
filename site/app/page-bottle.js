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
 */
import { ApiError, get, post } from './api.js';
import { clearState, el, hide, on, q, qa, show, showError, showLoading, showRequestFailure } from './dom.js';
import { currentUser } from './session.js';
import { definePage } from './page.js';

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

/**
 * 与 `@music-drift/shared/audio` 的 `RECORDER_MIME_PREFERENCES` 同序。
 * 浏览器不能 import TS，所以这是本页唯一一份本地副本；契约改了要同步这里（已写进汇报）。
 */
const RECORDER_MIME_PREFERENCES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

/** 点踩门槛的兜底（内核 `DEFAULT_POLICY.dislikeListenRatioThreshold`）；正常路径一律用服务端返回值。 */
const DISLIKE_THRESHOLD_FALLBACK = 0.8;

/** 每 5 秒上报一次已听覆盖率（服务端按墙上时间限速，更密没有意义）。 */
const LISTEN_REPORT_INTERVAL_MS = 5_000;

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
  recorder: null,
  recordTimer: null,
  mediaStream: null,
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
  renderPutBack();
  renderLinks();
  state.selectedIndex = null;
  /** 先把「没有可试听段」的列清干净（否则定稿里的演示进度/计数会留在页面上）。 */
  renderListenColumn();
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

  // 缺口盒长在**第一个缺口**那一格（就是服务端下一次会录的段号）
  const gapIndex = detail.missingSegmentIndexes[0] ?? null;
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
  if (preset === null) {
    note.textContent =
      '这一段的曲库预设时长缺失，服务端会拒绝上传（没有权威时长就核不了录音长度），先在曲库补上这一段。';
    return;
  }
  note.textContent = `这一段按曲库预设 ${formatClock(preset)} 录，录完再选去向。不点开就不会占用你的麦克风。`;
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

// ------------------------------------------------------------------ 试听 / 投票

async function selectSegment(index, options = {}) {
  const segment = segmentByIndex(index);
  if (segment === null) return;
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
  if (index === null) return;
  q('.bar')?.setAttribute('aria-label', `第 ${index} 段播放进度 ${formatClock(currentMs)} / ${formatClock(totalMs)}`);
  q('.play')?.setAttribute('aria-label', state.audio?.paused === false ? `暂停第 ${index} 段` : `播放第 ${index} 段`);
}

async function playAudio() {
  const audio = state.audio;
  if (audio === null || state.selectedIndex === null) return;
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

function recordingSupport() {
  const secure =
    window.isSecureContext === true || ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  if (!secure) {
    return '录音只在 https:// 或 localhost 下可用（http 页面里浏览器不开放麦克风）。请用 http://localhost:5182 打开本页。';
  }
  if (navigator.mediaDevices?.getUserMedia === undefined) {
    return '这个浏览器没有麦克风接口（getUserMedia），请换较新的 Chrome / Edge / Safari。';
  }
  if (window.MediaRecorder === undefined) {
    return '这个浏览器不支持 MediaRecorder，录不了音，请换较新的 Chrome / Edge / Safari。';
  }
  return null;
}

function pickRecorderMime() {
  for (const candidate of RECORDER_MIME_PREFERENCES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // 探测失败按不支持处理，继续试下一个候选
    }
  }
  return null;
}

function describeMicrophoneError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return '麦克风权限被拒绝：点地址栏左侧的锁形图标 → 网站设置 → 麦克风改为「允许」，然后重试。';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '没有检测到可用的麦克风：接上或启用麦克风后重试。';
    case 'NotReadableError':
    case 'TrackStartError':
      return '麦克风被其他程序占用了：关掉正在用麦克风的程序（会议 / 录音工具）再重试。';
    default:
      return '麦克风启动失败：检查系统权限与设备后重试。';
  }
}

async function startRecording() {
  const gapIndex = state.detail?.missingSegmentIndexes[0] ?? null;
  if (gapIndex === null) return;
  const unsupported = recordingSupport();
  if (unsupported !== null) {
    announce(unsupported);
    showError(unsupported);
    return;
  }
  const mime = pickRecorderMime();
  if (mime === null) {
    const message = '这个浏览器不支持任何可用的录音容器（webm / mp4 / ogg），录不了音。';
    announce(message);
    showError(message);
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    const message = describeMicrophoneError(error);
    announce(`录音失败：${message}`);
    showError(message);
    return;
  }

  state.mediaStream = stream;
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  state.recorder = recorder;
  const startedAt = performance.now();
  const targetMs = presetDurationFor(gapIndex) ?? 20_000;
  const cta = q('.gapBox .cta');

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    if (state.recordTimer !== null) {
      window.clearInterval(state.recordTimer);
      state.recordTimer = null;
    }
    for (const track of stream.getTracks()) track.stop();
    state.mediaStream = null;
    state.recorder = null;
    void uploadRecording({
      blob: new Blob(chunks, { type: mime }),
      elapsedMs: Math.round(performance.now() - startedAt),
      gapIndex,
    });
  };

  recorder.start(1000);
  state.recordTimer = window.setInterval(() => {
    const elapsed = performance.now() - startedAt;
    const left = Math.max(0, Math.round((targetMs - elapsed) / 1000));
    announce(`正在录音…已录 ${formatClock(elapsed)}，还剩 ${left} 秒（录满自动停）。`);
    if (cta !== null) cta.textContent = `停止上传（还剩 ${left} 秒）`;
    if (elapsed >= targetMs) recorder.stop();
  }, 250);
}

function stopRecording() {
  if (state.recorder !== null && state.recorder.state === 'recording') state.recorder.stop();
}

async function uploadRecording({ blob, elapsedMs, gapIndex }) {
  announce('正在上传这一段…');
  const cta = q('.gapBox .cta');
  if (cta !== null) {
    cta.disabled = true;
    cta.textContent = '正在上传…';
  }
  try {
    const response = await postSegmentAudio(blob, elapsedMs);
    clearState();
    state.detail = response.bottle;
    render();
    announce(
      `第 ${response.index} 段已经录好了（本段时长 ${formatClock(elapsedMs)}）。${
        response.nextRecordIndex === null ? '作品已经完整，接下来选去向。' : `下一段该录第 ${response.nextRecordIndex} 段。`
      }`,
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

/**
 * 录音上传是**原始二进制协议**（Content-Type = 音频 MIME、时长走 `x-audio-duration-ms`、
 * 附言走 `?note=`），而共享层 `api.js` 的 `post()` 会把 body 做 JSON 序列化
 * ⇒ 这一处只能直接用 `fetch`（同源、带 cookie），错误照旧按契约信封抛 `ApiError`。
 * 共享层缺 `postBinary()` —— 已写进汇报，等 captain 决定是否补。
 */
async function postSegmentAudio(blob, durationMs) {
  const headers = {
    'content-type': blob.type === '' ? 'application/octet-stream' : blob.type,
    'x-audio-duration-ms': String(Math.round(durationMs)),
  };
  const response = await fetch(`/api/bottles/${encodeURIComponent(state.id)}/segments`, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: blob,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const envelope = parsed !== null && typeof parsed === 'object' ? parsed.error : null;
    const violations = Array.isArray(envelope?.violations) ? envelope.violations : [];
    throw new ApiError(
      typeof envelope?.message === 'string' && envelope.message !== ''
        ? envelope.message
        : `上传失败（HTTP ${response.status}）。`,
      {
        status: response.status,
        code: typeof violations[0]?.code === 'string' ? violations[0].code : null,
        violations,
        body: parsed ?? text,
      },
    );
  }
  if (parsed === null) throw new ApiError('服务返回的不是 JSON。', { status: response.status, kind: 'parse' });
  return parsed;
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
      if (row.disabled) return;
      try {
        const detail = await post(`/api/bottles/${encodeURIComponent(state.id)}/resolution`, {
          resolution: spec.code,
        });
        clearState();
        state.detail = detail;
        render();
        announce(`已按「${spec.label}」处置这支瓶子。`);
      } catch (error) {
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
      if (state.recorder !== null) stopRecording();
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
