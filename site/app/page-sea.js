/**
 * 页面模块：`site/sea.html` —— 公海大厅接真数据（W1-c）
 *
 * 本页 HTML 是 `tools/sync-site.mjs` 生成的设计稿副本，里面**没有** `data-bind` 挂点
 * （§8.2 只注入 viewport 与 script），所以接线一律按**页面已有 class 名**定位：
 * 用 `el()` 重建节点后 `replaceWith`，文本只走 `textContent`（`el({ text })`），全程不碰 HTML 注入。
 *
 * 稿子里的六个 `.col` 是**位置模板**：`left` / `--wy` / `--tilt` 从它们身上抄下来；
 * 真数据不足六支就少画几列（**绝不补假数据**），涟漪环也按列开关。
 *
 * 数据口径（`packages/shared/src/contracts/bottles.ts`）：
 * - `GET /api/sea?seaZone=COMPLETED|INCOMPLETE&limit=&cursor=` → `{ items: BottleSummary[], nextCursor }`；
 * - 状态由数据推导：`missingSegmentIndexes` 为空 = 完整（「全部段位都有人唱过」），否则列缺口；
 * - 游标是**不透明字符串**，只原样回传；末页 `nextCursor === null` ⇒ **不再画下一页页码**。
 */
import { get } from './api.js';
import {
  clearState,
  el,
  hide,
  on,
  q,
  qa,
  show,
  showEmpty,
  showLoading,
  showRequestFailure,
} from './dom.js';
import { definePage } from './page.js';

/** 稿子一屏六支（`sea.html` 六个 `.col`）。 */
const PAGE_SIZE = 6;

/** 分区顺序 = `sea.html` 里 `.zones li[role=tab]` 的顺序（第一项是完整作品区）。 */
const ZONES = [
  { key: 'COMPLETED', wait: false },
  { key: 'INCOMPLETE', wait: true },
];

/**
 * `.lede` 在稿子里是「完整作品区」的口径（"只能听，不能接"）。
 * 切到等待接力区时换成**同一份稿子**里该区的文案（`.empty` B 的正文），不新造文案 ——
 * 否则页面会在允许「指定接唱」的区里写着"不能接"。
 */
const LEDE = {
  COMPLETED:
    '聆听那些经历漂流与合唱、完全绽放的终极乐章。作品一旦入海就不再漂流 —— 这里只能听，不能接。',
  INCOMPLETE: '这里的作品都还差几个段位，等着有人补上——补完才会进完整作品区。',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** 稿子 `最近更新 2026/9/23 20:38` 的写法（月/日不补零，时分补零，本地时区）。 */
function fmtDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

/** 缺口文案；`missingSegmentIndexes` 直接来自服务端（ADR-015：缺口 = 歌里固定的段位）。 */
function gapText(missing) {
  return `缺第 ${missing.join('、')} 段（成品里这段时间是静音）`;
}

/**
 * 涟漪环内圈 = 段位刻度（`pathLength="100"`，四段弧 + 四个缺口）：按 `totalSegments` 均分，
 * 缺口段整段留空。`totalSegments = 4` 且无缺口时逐字复现稿子的 `18 7`。
 */
function ringDasharray(totalSegments, missingIndexes) {
  const unit = 100 / totalSegments;
  const missing = new Set(missingIndexes);
  const parts = [];
  for (let index = 1; index <= totalSegments; index += 1) {
    if (missing.has(index)) parts.push(0.01, unit - 0.01);
    else parts.push(unit * 0.72, unit * 0.28);
  }
  return parts.map((value) => Math.round(value * 100) / 100).join(' ');
}

async function start() {
  const fleet = q('main > ul.fleet');
  const waitFleet = q('main > ul.fleet[hidden]');
  const emptyBlocks = qa('main > .empty');
  const tabs = qa('.zones li[role=tab]');
  const countNodes = tabs.map((tab) => q('.n', tab));
  const lede = q('.hero .lede');
  const heroLede = lede === null ? '' : lede.textContent;
  const pagesNav = q('.foot .pages');
  const pagesList = q('.foot .pages ol');
  const pagesNote = q('.foot .pages > span.meta:last-child');
  const ringEllipses = qa('.rings ellipse');

  // 位置模板：六列的 left / --wy / --tilt 与结构，全部抄自稿子（不足六支时只用前 N 份）。
  const columnTemplate = qa(':scope > li.col', fleet)[0]?.cloneNode(true) ?? null;
  const columnStyles = qa(':scope > li.col', fleet).map((li) => li.getAttribute('style') ?? '');

  // 稿子里的「等待接力」规格证据（第二张 `.fleet[hidden]`）只当类名参考，随后清空 —— 不留假数据。
  waitFleet?.replaceChildren();
  qa('main > .empty a').forEach((link) => link.setAttribute('href', '/river.html'));
  // 真数据回来之前，页面上不能挂着演示内容（「占位曲目 · 一」与 39 / 12 都是稿子里的假数据）。
  fleet?.replaceChildren();
  // `.fleet { inset:0 }` 铺满整页、又排在 `.zones`/`.hero` 之后 ⇒ 它会吃掉这两个区块的点击
  //（分区切不过去）。整层不接收指针事件，只把真正可点的 `.listen` 例外打开。
  if (fleet !== null) fleet.style.pointerEvents = 'none';
  for (const block of emptyBlocks) hide(block);
  for (const node of countNodes) if (node !== null) node.textContent = '';

  /** zoneKey → { pages: [{ items, nextCursor }], index, loaded }（`pages[0]` = 第一页）。 */
  const zones = new Map(ZONES.map((zone) => [zone.key, { pages: [], index: 0, loaded: false }]));
  let current = ZONES[0].key;

  const lastPageOf = (zoneKey) => {
    const pages = zones.get(zoneKey)?.pages ?? [];
    return pages.length === 0 ? null : pages[pages.length - 1];
  };

  async function fetchPage(zoneKey, cursor) {
    return await get('/api/sea', {
      query: {
        seaZone: zoneKey,
        limit: PAGE_SIZE,
        ...(typeof cursor === 'string' && cursor !== '' ? { cursor } : {}),
      },
    });
  }

  /**
   * 分区支数的**真值口径**：第一页条数；`nextCursor` 还在就补一个 `+`（说明是"至少这么多"）。
   * 服务端不下发总数，所以这里**不猜**总数、也不写死 39 / 12。
   */
  function zoneCountLabel(zoneKey) {
    const state = zones.get(zoneKey);
    if (state === null || state === undefined || state.pages.length === 0) return '';
    const more = state.pages.some((page) => page.nextCursor !== null);
    return `${state.pages[0].items.length}${more ? '+' : ''}`;
  }

  function renderTabs() {
    for (const [index, tab] of tabs.entries()) {
      const zoneKey = ZONES[index]?.key;
      if (zoneKey === undefined) continue;
      tab.setAttribute('aria-selected', zoneKey === current ? 'true' : 'false');
      tab.style.cursor = 'pointer';
      const count = countNodes[index];
      if (count !== null) count.textContent = zoneCountLabel(zoneKey);
    }
    if (lede !== null) {
      lede.textContent = current === 'INCOMPLETE' ? LEDE.INCOMPLETE : heroLede;
    }
  }

  function renderFooter() {
    const state = zones.get(current);
    const page = state.pages[state.index];
    const known = state.pages.length;
    const hasMore = page.nextCursor !== null;
    const label = ZONES.find((zone) => zone.key === current)?.key === 'INCOMPLETE' ? '等待接力' : '完整作品';

    // 每次都**重查** `.tail`：上一次渲染把它整个换掉了，抓着旧引用会让页脚永远停在第 1 页。
    const tail = q('.foot .tail');
    if (tail !== null) {
      tail.replaceWith(
        el('p', { class: 'meta tail' }, [
          el('span', { class: 'dot', 'aria-hidden': 'true' }),
          `${label} · 本页 `,
          el('span', { class: 'mono', text: page.items.length }),
          ' 支',
        ]),
      );
    }

    if (pagesList !== null) {
      pagesList.replaceChildren();
      // 只画「已取到的页」+「服务端确认还有的下一页」：`nextCursor === null` 时不伪造页码。
      const pageCount = known + (hasMore ? 1 : 0);
      for (let number = 1; number <= pageCount; number += 1) {
        const link = el('a', {
          href: '#',
          text: String(number),
          on: {
            click: (event) => {
              event.preventDefault();
              void goToPage(number);
            },
          },
        });
        if (number === state.index + 1) link.setAttribute('aria-current', 'page');
        pagesList.append(el('li', {}, [link]));
      }
    }
    if (pagesNote !== null) {
      pagesNote.textContent = `第 ${state.index + 1} 页 · ${hasMore ? '后面还有更多' : '已到最后一页'}`;
    }
    if (pagesNav !== null) hide(pagesNav);
    if (pagesNav !== null) show(pagesNav);
  }

  function renderFleet(_zoneKey) {
    const state = zones.get(current);
    const page = state.pages[state.index];
    const zone = ZONES.find((candidate) => candidate.key === current);
    const items = page.items;

    for (const [index, block] of emptyBlocks.entries()) {
      const belongs = ZONES[index]?.key === current;
      if (belongs && items.length === 0) show(block);
      else hide(block);
    }

    if (fleet === null || columnTemplate === null) return;
    fleet.replaceChildren();
    if (items.length === 0) {
      hide(fleet);
      return;
    }
    show(fleet);

    items.forEach((item, position) => {
      const column = columnTemplate.cloneNode(true);
      column.className = zone?.wait === true ? 'col wait' : 'col';
      column.setAttribute('style', columnStyles[position] ?? columnStyles[0] ?? '');

      const song = q('.entry .song', column);
      if (song !== null) song.textContent = item.songTitle;

      const rec = q('.entry .rec', column);
      if (rec !== null) {
        rec.replaceWith(
          el('p', { class: 'rec' }, [
            '已录 ',
            el('b', { class: 'mono', text: item.recordedCount }),
            ' / ',
            el('b', { class: 'mono', text: item.totalSegments }),
            ' 段',
          ]),
        );
      }

      const status = q('.entry .st', column);
      if (status !== null) {
        const complete = item.missingSegmentIndexes.length === 0;
        status.className = complete ? 'st ok' : 'st gap';
        status.textContent = complete
          ? '全部段位都有人唱过'
          : gapText(item.missingSegmentIndexes);
      }

      const time = q('.entry .tm', column);
      if (time !== null) {
        time.replaceWith(
          el('p', { class: 'tm' }, [
            '最近更新 ',
            el('span', { class: 'mono', text: fmtDateTime(item.updatedAt) }),
          ]),
        );
      }

      const listen = q('.entry .listen', column);
      if (listen !== null) {
        /** W7：公海详情页已删除 ⇒「听这支作品」**直达瓶子详情**（同一支瓶子的同一个页面）。 */
        listen.setAttribute('href', `/bottle.html?id=${encodeURIComponent(item.id)}`);
        listen.textContent = '听这支作品';
        listen.style.pointerEvents = 'auto';
      }

      fleet.append(column);
    });

    // 涟漪环：每列一对（外圈 + 内圈），只开有瓶子的列；内圈的四段弧按真实段位/缺口画。
    if (ringEllipses.length === 12) {
      const outer = ringEllipses.slice(0, 6);
      const inner = ringEllipses.slice(6);
      for (let column = 0; column < 6; column += 1) {
        const item = items[column];
        for (const ellipse of [outer[column], inner[column]]) {
          if (ellipse === undefined) continue;
          if (item === undefined) ellipse.setAttribute('display', 'none');
          else ellipse.removeAttribute('display');
        }
        if (item !== undefined && inner[column] !== undefined) {
          inner[column].setAttribute(
            'stroke-dasharray',
            ringDasharray(item.totalSegments, item.missingSegmentIndexes),
          );
        }
      }
    }
  }

  function render() {
    renderTabs();
    renderFleet(current);
    renderFooter();
  }

  async function goToPage(number) {
    const state = zones.get(current);
    if (number >= 1 && number <= state.pages.length) {
      state.index = number - 1;
      render();
      return;
    }
    const last = lastPageOf(current);
    if (last === null || last.nextCursor === null) return;
    showLoading('正在翻页…');
    try {
      const page = await fetchPage(current, last.nextCursor);
      state.pages.push(page);
      state.index = state.pages.length - 1;
      clearState();
      render();
    } catch (error) {
      showRequestFailure(error, { onRetry: () => void goToPage(number) });
    }
  }

  async function selectZone(index) {
    const zone = ZONES[index];
    if (zone === undefined) return;
    const state = zones.get(zone.key);
    if (state.pages.length === 0) {
      showLoading('正在加载公海…');
      try {
        const page = await fetchPage(zone.key, null);
        state.pages.push(page);
        state.loaded = true;
        clearState();
      } catch (error) {
        showRequestFailure(error, { onRetry: () => void selectZone(index) });
        return;
      }
    }
    current = zone.key;
    render();
    if (state.pages[0].items.length === 0) {
      showEmpty('这个分区现在还是空的。');
    } else {
      clearState();
    }
  }

  tabs.forEach((tab, index) => {
    on(tab, 'click', () => void selectZone(index));
  });

  showLoading('正在加载公海…');
  const [completed, incomplete] = await Promise.all([
    fetchPage('COMPLETED', null).catch((error) => error),
    fetchPage('INCOMPLETE', null).catch((error) => error),
  ]);
  for (const [zoneKey, result] of [
    ['COMPLETED', completed],
    ['INCOMPLETE', incomplete],
  ]) {
    const state = zones.get(zoneKey);
    if (result instanceof Error) continue;
    state.pages.push(result);
    state.loaded = true;
  }
  if (completed instanceof Error) {
    showRequestFailure(completed, { onRetry: () => void start() });
    renderTabs();
    return;
  }
  clearState();
  render();
}

export const { init } = definePage({
  name: 'sea',
  owner: 'W1-c',
  endpoints: ['GET /api/sea'],
  init: start,
});
