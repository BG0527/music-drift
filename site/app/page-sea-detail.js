/**
 * 页面模块：`site/sea-detail.html` —— 公海作品详情接真数据（W1-c）
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
      votesNode.replaceChildren(
        el('span', { text: `赞 ${segment?.likeCount ?? 0}` }),
        el('i'),
        el('span', { text: `踩 ${segment?.dislikeCount ?? 0}` }),
      );
    }
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

  function selectSegment(index, options = {}) {
    const segment = byIndex.get(index);
    if (segment === undefined || audio === null) return;
    current = index;
    audio.src = `/api/segments/${segment.id}/audio`;
    renderDeck();
    if (options.autoplay === true) {
      // 播放失败（自动播放策略等）不该冒泡成页面错误：控件状态本身就是反馈。
      audio.play().catch(() => {});
    }
  }

  on(audio, 'timeupdate', () => {
    paintStylus();
    renderTransport();
  });
  on(audio, 'play', renderTransport);
  on(audio, 'pause', renderTransport);
  on(audio, 'loadedmetadata', () => {
    paintStylus();
    renderTransport();
  });
  on(audio, 'ended', () => {
    // 一段放完自动走到下一段（真实接力链的听法）；本段是最后一段就停下。
    const next = segments.find((segment) => segment.index > (current ?? 0));
    if (next === undefined) {
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

  renderDeck();
  if (segments.length > 0) selectSegment(segments[0].index, { autoplay: false });
}

export const { init } = definePage({
  name: 'sea-detail',
  owner: 'W1-c',
  endpoints: [
    'GET /api/sea/:id',
    'GET /api/bottles/:id',
    'GET /api/segments/:id/audio',
    'POST /api/sea/:id/targeted-segment',
    'POST|DELETE /api/collections/:bottleId',
  ],
  init: start,
});
