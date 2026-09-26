/**
 * 页面模块：`site/sea-detail.html` —— 公海作品详情接真数据（W1-c / W4-b）
 *
 * 本页 HTML 是设计稿副本（没有 `data-bind`），接线按**页面已有 class 名**定位、`el()` 重建节点。
 * 文本一律 `textContent`（`el({ text })`）。
 *
 * 端点（§7.3）与为什么多用一个：
 * - `GET /api/sea/:id` → `BottleSummary`（**不含 segments**）：本页的"是不是公海作品"闸门；
 * - `GET /api/bottles/:id` → `BottleDetail`：段链 / 匿名代号 / 时长 / 赞踩的真值来源
 *   （公海作品 `hiddenLaterSegmentCount === 0`，§9.2 入海后全部解锁），也是音频 id 的来源；
 * - `GET /api/segments/:id/audio` → `<audio>` 的 src（D-02：音频存库 + Range 流式）；
 * - `POST /api/sea/:id/targeted-segment`（指定接唱，仅未完成区）、
 *   `POST|DELETE /api/collections/:bottleId`（收藏，仅已完成并进入公海的作品）。
 *
 * W4-b 新增两条（用户第 2 轮需求 5 / 6；§13 只给落点、不给形态，形态由本文件按页面语言自定）：
 * - **试听全部**：把已录的段按 `index` 升序连播，没录的段跳过（后端**没有混音端点**，`§13` 需求 5
 *   明说"不做导出"）。实现上复用**同一个** `<audio>` 逐段换 `src`：既不会两段叠着响，
 *   也不需要为每段挂一个元素；"缺口＝静音跳过"。
 * - **听阶段的赞 / 踩**：接 `POST /api/segments/:id/votes`（§7.3 已登记），就地改计数；
 *   门槛（听满 80% 才能踩）**只由服务端判定**，前端不复刻规则、只逐字显示服务端的中文 message。
 *   为了让"点踩"在真实使用中够得着门槛，本页同时按瓶子页的同一口径上报已听覆盖率
 *   （`POST /api/segments/:id/listen`，§10.1 同类补登：不报就永远跨不过门槛）；
 *   上报与投票都用 `redirectOn401:false` —— 本页是公开的公海详情，跳登录页会打断试听
 *   （与 W1-c 的收藏控件同一处置），未登录时服务端的「请先登录再继续。」照样逐字显示。
 *
 * 几何全部**从稿子的 CSS 反推**（不改 HTML、不加 CSS）：`.band` 左右各 -76px ⇒ 沟槽在页面 x=76..1152，
 * 唱针"尖"在稿子里位于 x=720（第 3 段、播放进度 39%）；唱的段与进度都由真数据算。
 */
import { del, get, post } from './api.js';
import {
  clearState,
  el,
  hide,
  on,
  q,
  qa,
  show,
  showError,
  showLoading,
  showRequestFailure,
} from './dom.js';
import { definePage } from './page.js';

/** 沟槽几何：`.groove { left:76px; right:288px }`（画布 1440）。 */
const GROOVE_LEFT = 76;
const GROOVE_WIDTH = 1076;
/** 稿子里唱针尖所在的页面 x（`.arm { left:720px }` / `.tip` 中心 x=720）。 */
const STYLUS_X = 720;
/** 唱臂：`.arm { left:720px; top:298px; width:678px; rotate(-9.855deg) }` ⇒ 轴承在 (1388, 182)。 */
const ARM_Y = 298;
const ARM_PIVOT = { x: 1388, y: 182 };

/**
 * 新增控件的样式（W4-b）。**为什么只能运行时注入**：本页 CSS 与 `site/*.html` 都禁改
 * （§8.2「HTML 是源」），而 `:hover` / `[aria-pressed]` 这些**状态**没法用内联 style 表达
 * （内联样式优先级高于类选择器）。样式只值**本页既有的 token**：`--muted` / `--glass` / `--coral`
 * / `--line`（`:root` 里那 7 个里的 4 个），细线一律 1px、圆角一律 2px —— 与 `.ctrl` 同一套纪律，
 * 不自造新视觉、不引入新字号（13px / 14px 就是本页 `.votes` 与 `.ctrl` 的档）。
 */
const CONTROL_STYLE_ID = 'w4b-control-style';
const CONTROL_STYLE = [
  '.w4b-all{width:96px;height:44px;border:1px solid var(--line);border-radius:2px;background:transparent;',
  "color:var(--muted);font-family:'LXGW WenKai',serif;font-size:14px;letter-spacing:.06em;",
  'display:flex;align-items:center;justify-content:center;cursor:pointer;}',
  '.w4b-all:hover,.w4b-all:focus-visible{border-color:var(--glass);color:var(--glass);}',
  '.w4b-all[aria-pressed="true"]{border-color:var(--coral);color:var(--coral);}',
  '.w4b-vote{background:transparent;border:0;padding:0;font-family:inherit;font-size:13px;',
  'color:var(--muted);cursor:pointer;}',
  '.w4b-vote:hover:enabled,.w4b-vote:focus-visible{color:var(--glass);}',
  '.w4b-vote[aria-pressed="true"]{color:var(--glass);}',
  '.w4b-vote:disabled{color:var(--muted);cursor:default;opacity:.6;}',
].join('');

/** 每 5 秒上报一次已听覆盖率（服务端按**真实墙上时间**限速，更密没有意义；与瓶子页同口径）。 */
const LISTEN_REPORT_INTERVAL_MS = 5_000;
/** `timeupdate` 的单步跳变上限：拖动进度条/倍速播放不算"听过"（与瓶子页同一判据）。 */
const SEEK_JUMP_MS = 1_200;

function ensureControlStyle() {
  if (document.getElementById(CONTROL_STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = CONTROL_STYLE_ID;
  style.textContent = CONTROL_STYLE;
  document.head.append(style);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function fmtClock(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

/** 契约给的是 `durationMs`（毫秒）；稿子的刻度写法是 `00:42`。 */
function fmtDuration(ms) {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? fmtClock(ms / 1000) : '--:--';
}

/** `入海时间` 的写法与稿子一致：`2026/9/23 20:38`（月/日不补零）。 */
function fmtDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

/** 母版号 = 作品的唯一标识：用真实 id 的前 8 位（稿子的 `MDB-0001-A` 就是这种"作品的身份证"）。 */
function masterNo(id) {
  return `MDB-${id.slice(0, 8).toUpperCase()}`;
}

async function start() {
  const crumb = q('.crumb');
  const crumbLink = q('.crumb a');
  const crumbState = q('.crumb .state');
  const title = q('.hd h1');
  const stampNo = q('.hd .stampno');
  const meta = q('main > p.meta');
  const gapnote = q('.gapnote');
  const groove = q('.groove');
  const marks = q('.marks');
  const chain = q('ol.chain');
  const chainHint = q('.cols .col-h .hint.warm');
  const credits = q('ul.credits');
  const mixBox = q('.mixbox p');
  const nowLine = q('.transport .now .line');
  const timeNode = q('.transport .time');
  const votesNode = q('.transport .votes');
  const readout = q('.transport .readout');
  const ctrl = q('.transport .ctrl');
  const audio = q('#sea-master');
  const footEtch = q('footer .etch');
  const arm = q('.rig .arm');
  const movable = qa('.rig .lift, .rig .shell, .rig .stylus, .rig .tip, .float .rip1, .float .rip2');
  const content = qa('main > :not(.crumb)').concat(qa('body > footer'));
  const playIcon = el('svg', { width: '11', height: '13', viewBox: '0 0 11 13', 'aria-hidden': 'true' }, [
    el('polygon', { points: '0 0 11 6.5 0 13', fill: 'currentColor' }),
  ]);
  const pauseIcon = q('.transport .ctrl svg');

  if (crumbLink !== null) crumbLink.setAttribute('href', '/sea.html');

  function setContentVisible(visible) {
    for (const node of content) {
      if (node === null) continue;
      if (visible) show(node);
      else hide(node);
    }
  }

  const params = new URLSearchParams(location.search);
  const bottleId = params.get('id');
  if (bottleId === null || bottleId === '') {
    setContentVisible(false);
    showError('地址里缺少作品 id：请从公海大厅点进一支作品。');
    return;
  }

  setContentVisible(false);
  showLoading('正在把它从水里提上来…');

  let sea;
  let detail;
  try {
    [sea, detail] = await Promise.all([get(`/api/sea/${bottleId}`), get(`/api/bottles/${bottleId}`)]);
  } catch (error) {
    if (error.status === 404) {
      showError(`公海里没有这支作品（${bottleId.slice(0, 8)}）：它可能已被接走、已损坏，或从未入海。`);
    } else {
      showRequestFailure(error, { onRetry: () => location.reload() });
    }
    return;
  }
  clearState();
  setContentVisible(true);

  const segments = [...detail.segments].sort((left, right) => left.index - right.index);
  const byIndex = new Map(segments.map((segment) => [segment.index, segment]));
  const missing = new Set(sea.missingSegmentIndexes);
  const total = sea.totalSegments;
  const segWidth = GROOVE_WIDTH / total;
  const isComplete = sea.missingSegmentIndexes.length === 0;

  /** 当前播放段（唱针位置＝当前播放段）：默认第一段**有录音的**段。 */
  let current = segments[0]?.index ?? null;

  /**
   * 连播状态（需求 5）：`playingAll` = 「试听全部」正在跑。
   * 队列就是 `segments`（已按 index 升序、**没录的段根本不进队列**）⇒「缺口＝跳过」是天然成立的，
   * 不需要为缺口造静音片段（后端没有混音端点，本阶段也不导出）。
   */
  let playingAll = false;
  /** 客户端累计的已听时长（换段清零）；**判定权在服务端**，这里只是上报的增量输入。 */
  let coveredMs = 0;
  let lastAudioMs = 0;
  let listenTimer = null;
  /** 当前段最近一次 `POST /api/segments/:id/listen` 的服务端视图：门槛百分比取自它，前端不写死 80%。 */
  let listenView = null;
  /** 本次会话我投过的票：segmentId → Set('LIKE'|'DISLIKE')（DTO 不给"我投过吗"，只能本地记状态）。 */
  const myVotes = new Map();
  /** 运行时新建的控件：0 段时保持 null ⇒ 一个都不画。 */
  let playAllButton = null;
  let voteControls = null;

  // ─────────────────────────────────────────────────────────── 标题 / 元信息 / 母版号
  if (title !== null) title.textContent = sea.songTitle;
  if (stampNo !== null) stampNo.textContent = masterNo(sea.id);
  if (footEtch !== null) footEtch.textContent = masterNo(sea.id);
  if (crumbState !== null) {
    const zone = sea.seaZone === 'COMPLETED' ? '完整作品' : '等待接力';
    crumbState.textContent = sea.seaZone === null ? sea.status : zone;
  }
  if (meta !== null) {
    const parts = [
      el('span', { text: `已录 ${sea.recordedCount} / ${sea.totalSegments} 段` }),
      isComplete
        ? null
        : el('span', {
            class: 'warm',
            text: `缺第 ${sea.missingSegmentIndexes.join('、')} 段`,
          }),
      detail.seaAt === null
        ? null
        : el('span', {}, ['入海时间 ', el('span', { class: 'mono', text: fmtDateTime(detail.seaAt) })]),
    ];
    meta.replaceChildren(...parts.filter((part) => part !== null));
  }
  if (gapnote !== null) {
    if (isComplete) hide(gapnote);
    else show(gapnote);
  }
  if (chainHint !== null) {
    if (isComplete) hide(chainHint);
    else {
      show(chainHint);
      chainHint.textContent = `缺第 ${sea.missingSegmentIndexes.join('、')} 段`;
    }
  }
  if (mixBox !== null) {
    mixBox.textContent = isComplete
      ? `${total} 段按序拼成纯人声版本，没有缺口。`
      : `${total} 段按序拼成纯人声版本，缺口留成静音。`;
  }
  if (crumb !== null && sea.seaZone === 'COMPLETED') {
    crumb.append(buildCollectControl());
  }

  // ─────────────────────────────────────────────────────────── 沟槽 / 刻度 / 段链
  function segNode(index) {
    const node = el('div', { class: 'seg off', style: `left:${(index - 1) * segWidth}px;width:${segWidth}px` });
    return node;
  }

  function renderGroove() {
    if (groove === null) return;
    const children = [];
    for (let index = 1; index <= total; index += 1) {
      const node = segNode(index);
      const segment = byIndex.get(index);
      if (segment === undefined) {
        node.className = 'seg empty';
        children.push(node);
        continue;
      }
      node.append(el('span', { class: 'core' }), el('i', { class: 'refl', text: segment.ownerCode }));
      children.push(node);
    }

    const firstGap = [...missing].sort((left, right) => left - right)[0];
    if (firstGap !== undefined) {
      const left = (firstGap - 1) * segWidth;
      children.push(el('span', { class: 'voidwash', style: `left:${left}px;width:${segWidth}px` }));
      children.push(el('span', { class: 'cut', style: `left:${left}px` }));
      children.push(el('span', { class: 'cut', style: `left:${left + segWidth - 2}px` }));
    }
    for (let index = 0; index <= total; index += 1) {
      children.push(el('span', { class: 'sep', style: `left:${index * segWidth}px` }));
    }
    if (firstGap !== undefined) {
      children.push(
        el('p', {
          class: 'voidlabel',
          style: `left:${(firstGap - 1) * segWidth}px;width:${segWidth}px`,
          text: '这一段还没有人唱',
        }),
      );
    }
    groove.replaceChildren(...children);
    paintStylus();
  }

  function paintStylus() {
    const segment = current === null ? null : byIndex.get(current);
    const progress =
      segment === null || audio === null || !Number.isFinite(audio.duration) || audio.duration <= 0
        ? 0
        : Math.min(1, Math.max(0, audio.currentTime / audio.duration));
    const position =
      segment === null ? GROOVE_LEFT : GROOVE_LEFT + (segment.index - 1) * segWidth + progress * segWidth;

    // 沟槽：唱针走过的段亮（`.on`），没走过的段暗（`.off`），当前段在唱针之后压暗（`.dull`）。
    // 缺口段（`.seg.empty`）不参与这套明暗：它表示"这一段时间里没有内容"，不是"唱针还没走到"。
    for (const [offset, node] of qa('.seg', groove ?? document).entries()) {
      const index = offset + 1;
      if (missing.has(index)) {
        node.className = 'seg empty';
        continue;
      }
      const played = segment !== null && index < segment.index;
      node.className = played || index === segment?.index ? 'seg on' : 'seg off';
      const old = q('.dull', node);
      if (old !== null) old.remove();
      if (index === segment?.index && progress > 0) {
        node.append(el('span', { class: 'dull', style: `left:${(progress * segWidth).toFixed(1)}px` }));
      }
    }

    // 唱臂：以稿子的轴承为定点，长度/角度由唱针位置反算（不写死角度）。
    if (arm !== null) {
      const length = Math.hypot(ARM_PIVOT.x - position, ARM_PIVOT.y - ARM_Y);
      const degrees = (Math.atan2(ARM_Y - ARM_PIVOT.y, ARM_PIVOT.x - position) * 180) / Math.PI;
      arm.style.left = `${position}px`;
      arm.style.width = `${length}px`;
      arm.style.transform = `rotate(${-degrees}deg)`;
    }
    for (const node of movable) {
      node.style.transform = `translateX(${position - STYLUS_X}px)`;
    }
  }

  function renderMarks() {
    if (marks === null) return;
    marks.style.gridTemplateColumns = `repeat(${total}, ${segWidth}px)`;
    const children = [];
    for (let index = 1; index <= total; index += 1) {
      const segment = byIndex.get(index);
      children.push(
        el('div', {}, [
          el('span', { class: 'cat', text: `A${index}` }),
          el('span', {
            class: segment === undefined ? 'd warm' : 'd',
            text: segment === undefined ? '静音' : fmtDuration(segment.durationMs),
          }),
        ]),
      );
    }
    marks.replaceChildren(...children);
  }

  function renderChain() {
    if (chain === null) return;
    const rows = [];
    for (let index = 1; index <= total; index += 1) {
      const segment = byIndex.get(index);
      if (segment === undefined) {
        rows.push(
          el('li', { class: 'row', dataset: { state: 'gap' } }, [
            el('span', { class: 'mk', text: `A${index}` }),
            el('span', { class: 'desc' }, [
              '这一段还没有人唱',
              el('em', { text: '缺口在成品里是静音，不会被别人的段顶替。' }),
            ]),
            el('span', { class: 'dur', text: '静音' }),
            sea.seaZone === 'INCOMPLETE'
              ? el('a', {
                  class: 'act',
                  href: '#',
                  role: 'button',
                  text: '指定接唱',
                  on: {
                    click: (event) => {
                      event.preventDefault();
                      void takeTargetedSegment(event.currentTarget);
                    },
                  },
                })
              : el('span', { class: 'act' }),
          ]),
        );
        continue;
      }
      const isCurrent = segment.index === current;
      rows.push(
        el('li', { class: 'row', ...(isCurrent ? { 'aria-current': 'true' } : {}) }, [
          el('span', { class: 'mk', text: `A${index}` }),
          el('span', { class: 'desc' }, [`第 ${index} 段`, el('span', { text: segment.ownerCode })]),
          el('span', { class: 'dur', text: fmtDuration(segment.durationMs) }),
          el('a', {
            class: 'act',
            href: '#',
            role: 'button',
            text: isCurrent ? '正在听' : '听',
            on: {
              click: (event) => {
                event.preventDefault();
                // 单段试听 = 退出连播态（否则按钮会一直停在「停止试听」骗人）
                playingAll = false;
                selectSegment(segment.index, { autoplay: true });
              },
            },
          }),
        ]),
      );
    }
    chain.replaceChildren(...rows);
  }

  function renderCredits() {
    if (credits === null) return;
    credits.replaceChildren(
      ...segments.map((segment) =>
        el('li', {}, [
          el('span', { class: 'code', text: segment.ownerCode }),
          el('span', { class: 'at', text: `第 ${segment.index} 段` }),
        ]),
      ),
    );
  }

  function renderTransport() {
    const segment = current === null ? null : byIndex.get(current);
    if (nowLine !== null) {
      nowLine.replaceChildren();
      if (segment === null) nowLine.append(el('b', { text: '还没有人唱过任何一段' }));
      else {
        nowLine.append(el('b', { text: `第 ${segment.index} 段` }), el('span', { text: segment.ownerCode }));
      }
    }
    if (timeNode !== null) {
      const elapsed = audio === null ? 0 : audio.currentTime;
      const totalSeconds = segment?.durationMs == null ? 0 : segment.durationMs / 1000;
      timeNode.replaceChildren(
        fmtClock(elapsed),
        el('span', { class: 'of', text: ` / ${fmtClock(totalSeconds)}` }),
      );
    }
    if (votesNode !== null) {
      /**
       * 赞 / 踩的计数是稿子**本来就有**的读数（`赞 3 ｜ 踩 0`）：W4-b 把这两个读数变成**按钮本体**
       * （同一行、同一 13px `--muted`、同一 1px 分隔线），所以没投票时这行与稿子逐像素同形，
       * 只是多了点击面。计数改为就地改写文本（不再 `replaceChildren`）—— 重建节点会让点击/焦点丢失。
       */
      if (voteControls === null) {
        votesNode.replaceChildren(
          el('span', { text: `赞 ${segment?.likeCount ?? 0}` }),
          el('i'),
          el('span', { text: `踩 ${segment?.dislikeCount ?? 0}` }),
        );
      } else {
        paintVotes(segment);
      }
    }
    if (playAllButton !== null) paintPlayAll();
    if (ctrl !== null) {
      const playing = audio !== null && audio.paused === false;
      ctrl.replaceChildren(playing ? pauseIcon : playIcon, document.createTextNode(playing ? '暂停' : '播放'));
    }
  }

  function renderDeck() {
    renderGroove();
    renderMarks();
    renderChain();
    renderCredits();
    renderTransport();
  }

  // ───────────────────────────── W4-b 需求 5：「试听全部」（连播已录的段，缺口跳过）

  /**
   * 放置理由：它是**播放动作**，所以住进播放控制簇（`.readout` 里 `.ctrl` 的右侧），
   * 与「播放/暂停」并排；盒子尺寸/圆角/细线沿用 `.ctrl`（96x44、2px、1px），
   * 只用 `--line` + `--muted` 表示"次级"，播放中换 `--coral`（本页"当下"的颜色：`aria-current` 的段号也是它）。
   */
  function buildPlayAllControl() {
    ensureControlStyle();
    const button = el('button', {
      type: 'button',
      class: 'w4b-all',
      'aria-pressed': 'false',
      text: '试听全部',
      on: { click: () => togglePlayAll() },
    });
    (readout ?? ctrl?.parentNode)?.append(button);
    return button;
  }

  function paintPlayAll() {
    const label = playingAll ? '停止试听' : '试听全部';
    if (playAllButton.textContent !== label) playAllButton.textContent = label;
    playAllButton.setAttribute('aria-pressed', playingAll ? 'true' : 'false');
    playAllButton.title = playingAll
      ? '再点一次：停下（停在当前这一段）'
      : `按录制顺序连播已录的 ${segments.length} 段；没录的段跳过，不混音、不导出`;
  }

  /** 再点一次＝中断（需求 5）：停播并退出连播态。 */
  function togglePlayAll() {
    if (audio === null || segments.length === 0) return;
    if (playingAll) {
      playingAll = false;
      audio.pause();
      renderTransport();
      return;
    }
    // 「全部」＝从头：即使此刻选着第 4 段，也回到第一段开始连播
    playingAll = true;
    selectSegment(segments[0].index, { autoplay: true });
  }

  // ───────────────────────────── W4-b 需求 6：听阶段的赞 / 踩

  /**
   * 赞 / 踩（`POST /api/segments/:id/votes`）作用于**当前正在听的这一段**——与 `.votes` 里
   * 那一对读数是同一个主体（读数就是按钮自己的文字）。两个票互相独立（契约 interactions.ts 顶部
   * 的已接受行为）⇒ 互不清零、互不抵消。
   */
  function buildVoteControls() {
    ensureControlStyle();
    const like = buildVoteButton('LIKE', '赞');
    const dislike = buildVoteButton('DISLIKE', '踩');
    votesNode.replaceChildren(like, el('i'), dislike);
    return { like, dislike };
  }

  function buildVoteButton(value, label) {
    return el('button', {
      type: 'button',
      class: 'w4b-vote',
      text: `${label} 0`,
      'aria-pressed': 'false',
      on: { click: () => void castVote(value) },
    });
  }

  function paintVotes(segment) {
    const mine = segment === null ? null : (myVotes.get(segment.id) ?? null);
    for (const [node, label, count, value] of [
      [voteControls.like, '赞', segment?.likeCount ?? 0, 'LIKE'],
      [voteControls.dislike, '踩', segment?.dislikeCount ?? 0, 'DISLIKE'],
    ]) {
      node.textContent = `${label} ${count}`;
      node.disabled = segment === null;
      node.setAttribute('aria-pressed', mine !== null && mine.has(value) ? 'true' : 'false');
      node.setAttribute('aria-label', `${segment === null ? '没有可听的段' : `第 ${segment.index} 段`}${label}`);
    }
    paintDislikeHint();
  }

  /** 门槛百分比**只从服务端响应取**；拿不到就说"要先听过这一段"，不杜撰数字。 */
  function paintDislikeHint() {
    if (voteControls === null) return;
    if (listenView === null) {
      voteControls.dislike.title = '点踩要先听过这一段：服务端按真实聆听时长判定。';
      return;
    }
    const threshold = Math.round((listenView.threshold ?? 0) * 100);
    const listened = Math.round((listenView.ratio ?? 0) * 100);
    voteControls.dislike.title =
      listenView.reachedThreshold === true
        ? `服务端记录已听 ${listened}%（门槛 ${threshold}%）`
        : `服务端记录已听 ${listened}%，到 ${threshold}% 才能点踩`;
  }

  async function castVote(value) {
    const segment = current === null ? null : byIndex.get(current);
    if (segment === null || voteControls === null) return;
    const node = value === 'LIKE' ? voteControls.like : voteControls.dislike;
    node.disabled = true;
    try {
      /**
       * 门槛（听满 X% 才能踩）、自踩、重复票**全部由服务端判**：前端不问"听了多久"、不写死 80%、
       * 也不预判自踩 —— 失败就把服务端的中文 `message` 原样显示（`showRequestFailure`）。
       * `redirectOn401:false`：本页是公开的公海详情，未登录的人照听照点，跳登录页会打断试听
       * （与 W1-c 的收藏控件同一处置），服务端的「请先登录再继续。」照样逐字显示。
       */
      const result = await post(
        `/api/segments/${encodeURIComponent(segment.id)}/votes`,
        { value },
        { redirectOn401: false },
      );
      // 就地更新计数（响应里的就是服务端新计数），不整页刷新
      segment.likeCount = result.likeCount;
      segment.dislikeCount = result.dislikeCount;
      const mine = myVotes.get(segment.id);
      if (mine === undefined) myVotes.set(segment.id, new Set([value]));
      else mine.add(value);
      clearState();
      renderTransport();
      /** 踩数到顶 ⇒ 这一段已被斩浪移出作品：本地数据整体作废，直接重读服务端真值。 */
      if (result.segmentCut === true) location.reload();
    } catch (error) {
      showRequestFailure(error);
    } finally {
      node.disabled = false;
    }
  }

  // ───────────────────────────── 已听覆盖率上报（需求 6 能真正够到门槛的前提）

  /** 换段：结账上一段 + 清零重新计。 */
  function resetListenTracking() {
    stopListenReporting();
    coveredMs = 0;
    lastAudioMs = 0;
    listenView = null;
  }

  /** 结账当前这一段（暂停 / 放完 / 换段 / 停止连播都要结一次）。 */
  function flushListen() {
    stopListenReporting();
    if (current === null || coveredMs <= 0) return;
    void reportListen();
  }

  function startListenReporting() {
    stopListenReporting();
    listenTimer = window.setInterval(() => void reportListen(), LISTEN_REPORT_INTERVAL_MS);
  }

  function stopListenReporting() {
    if (listenTimer !== null) {
      window.clearInterval(listenTimer);
      listenTimer = null;
    }
  }

  /**
   * 上报已听覆盖率（增量输入，**只增不减由服务端保证**；这里送的是客户端累计的"听过区间并集"）。
   *
   * 为什么本页必须报：点踩门槛读的是**服务端持久化**的覆盖率（`store/listenProgress.ts`）——
   * 不报，这个页面上的「踩」永远够不着门槛，新控件就是个死按钮。
   * 上报失败（未登录 / 网络抖动）不打断试听：投票时服务端仍会给出真实判定。
   */
  async function reportListen() {
    const segment = current === null ? null : byIndex.get(current);
    if (segment === null) return;
    try {
      const view = await post(
        `/api/segments/${encodeURIComponent(segment.id)}/listen`,
        { coveredMs: Math.round(coveredMs) },
        { redirectOn401: false },
      );
      /** 迟到的响应不许盖掉当前段的门槛提示（用户可能已经换段）。 */
      if (current === segment.index) {
        listenView = view;
        paintDislikeHint();
      }
    } catch {
      // 拿不到门槛提示而已
    }
  }

  function selectSegment(index, options = {}) {
    const segment = byIndex.get(index);
    if (segment === undefined || audio === null) return;
    const switched = index !== current;
    if (switched) {
      flushListen(); // 换 src 之后就报不了上一段了：先结账
      resetListenTracking();
    }
    current = index;
    audio.src = `/api/segments/${segment.id}/audio`;
    renderDeck();
    if (options.autoplay === true) {
      // 播放失败（自动播放策略等）不该冒泡成页面错误：控件状态本身就是反馈。
      audio.play().catch(() => {});
    }
    /** 选段即问一次服务端进度（这个端点没有 GET 版本）：门槛提示与"已听多少"都以此为准。 */
    if (switched) void reportListen();
  }

  on(audio, 'timeupdate', () => {
    if (audio !== null) {
      const currentMs = audio.currentTime * 1000;
      const delta = currentMs - lastAudioMs;
      /** 跳变（拖动进度条、倍速播放）不算"听过"：只移动游标，不记覆盖率（与瓶子页同一判据）。 */
      if (delta > 0 && delta < SEEK_JUMP_MS) coveredMs += delta;
      lastAudioMs = currentMs;
    }
    paintStylus();
    renderTransport();
  });
  on(audio, 'seeking', () => {
    if (audio !== null) lastAudioMs = audio.currentTime * 1000;
  });
  on(audio, 'play', () => {
    if (audio !== null) lastAudioMs = audio.currentTime * 1000;
    startListenReporting();
    renderTransport();
  });
  on(audio, 'pause', () => {
    flushListen();
    renderTransport();
  });
  on(audio, 'loadedmetadata', () => {
    paintStylus();
    renderTransport();
  });
  on(audio, 'ended', () => {
    flushListen();
    // 一段放完自动走到下一段（真实接力链的听法）；连播队列＝已录段，缺口天然不在队列里。
    const next = segments.find((segment) => segment.index > (current ?? 0));
    if (next === undefined) {
      playingAll = false; // 连播到头：按钮自己回到「试听全部」
      renderTransport();
      return;
    }
    selectSegment(next.index, { autoplay: true });
  });
  if (ctrl !== null) {
    on(ctrl, 'click', () => {
      if (audio === null) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });
  }

  async function takeTargetedSegment(link) {
    link.setAttribute('aria-disabled', 'true');
    try {
      await post(`/api/sea/${sea.id}/targeted-segment`);
    } catch (error) {
      link.removeAttribute('aria-disabled');
      showRequestFailure(error);
      return;
    }
    // 拿到这一段就归你录：作品现在在你手上，去瓶子页录（§6.2 指定接唱）。
    location.assign(`/bottle.html?id=${encodeURIComponent(sea.id)}`);
  }

  /**
   * 收藏（`POST|DELETE /api/collections/:bottleId`）。
   * 规则：**只有已完成并进入公海的作品可收藏**（否则 422 `COLLECTION_REQUIRES_FINISHED_WORK`）
   * ⇒ 未完成区根本不画这个控件；未登录也不画（`redirectOn401:false`，探测会话而不是被弹去登录页）。
   */
  function buildCollectControl() {
    const link = el('a', {
      class: 'cat',
      href: '#',
      role: 'button',
      'aria-pressed': 'false',
      text: '收藏',
      title: '收藏这支作品',
      on: {
        click: (event) => {
          event.preventDefault();
          void toggleCollect(event.currentTarget);
        },
      },
    });
    link.style.cursor = 'pointer';
    void refreshCollectState(link);
    return link;
  }

  function paintCollect(link, collected) {
    link.setAttribute('aria-pressed', collected ? 'true' : 'false');
    link.textContent = collected ? '已收藏' : '收藏';
    if (collected) link.style.color = 'var(--glass)';
    else link.style.removeProperty('color');
  }

  async function refreshCollectState(link) {
    try {
      const list = await get('/api/me/collections', { redirectOn401: false });
      const collected = Array.isArray(list) && list.some((row) => row.bottleId === sea.id);
      paintCollect(link, collected);
    } catch {
      // 未登录（401）或网络问题：收藏需要会话，直接不提供这个控件，不弹登录页打断试听。
      link.remove();
    }
  }

  async function toggleCollect(link) {
    const collected = link.getAttribute('aria-pressed') === 'true';
    try {
      if (collected) await del(`/api/collections/${sea.id}`);
      else await post(`/api/collections/${sea.id}`);
      paintCollect(link, !collected);
    } catch (error) {
      showRequestFailure(error);
    }
  }

  // 新控件一律**运行时创建**（§10.2 的既有模式）：这一段**没有已录的段就一个都不建**
  // ⇒「试听全部」与赞/踩都不会出现（0 段时页面上一个可点的假控件都不留）。
  if (segments.length > 0) {
    playAllButton = buildPlayAllControl();
    voteControls = buildVoteControls();
  }
  renderDeck();
  if (segments.length > 0) selectSegment(segments[0].index, { autoplay: false });
}

export const { init } = definePage({
  name: 'sea-detail',
  owner: 'W1-c / W4-b',
  endpoints: [
    'GET /api/sea/:id',
    'GET /api/bottles/:id',
    'GET /api/segments/:id/audio',
    'POST /api/sea/:id/targeted-segment',
    'POST|DELETE /api/collections/:bottleId',
    'POST /api/segments/:id/votes',
    'POST /api/segments/:id/listen',
  ],
  note: 'W4-b 新增控件（试听全部：同址逐段连播、无混音端点；听阶段赞/踩：门槛由服务端判）；listen 用于上报已听覆盖率，否则点踩永远够不到门槛',
  init: start,
});
