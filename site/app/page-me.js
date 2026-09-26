/**
 * 页面模块：`site/me.html` —— 「我的」接真数据（W1-c）
 *
 * 本页 HTML 是设计稿副本（没有 `data-bind`），接线按**页面已有 class 名**定位、`el()` 重建节点。
 * 文本一律 `textContent`（`el({ text })`）。
 *
 * 端点（§7.3）：`GET /api/auth/me`、`/api/me/bottles`、`/api/notifications`、
 * `POST /api/notifications/:id/read`、`/api/me/collections`、`/api/me/badges`、`/api/me/anonymous-codes`；
 * 另外用 `GET /api/bottles/:id` 把收藏/徽章里的 `bottleId` 补成曲名（契约里收藏与徽章只给 id，不给曲名）。
 *
 * 沉积柱（`.lay`）的**每一层位 = 一个段位**，四种层态全部由真数据推导：
 * - `mySegmentIndexes` 里的段号 → `.sd.mine`（我唱的，右侧珊瑚刻记）；
 * - `missingSegmentIndexes` 里的段号 → `.wt`（这一段没有内容：缺口/被斩后留空）；
 * - 其余 → `.sd`（别人唱的）；
 * - 顶部段位是缺口时，沉积面（`.iface`）与还漂着的瓶子（`.float .flask`）落在**最高实心层之上**。
 *
 * 「收到回传 → 提示 + 等着你操作」的前端最后一公里（W9 收口，W6 已把后端补齐）：
 * - `GET /api/notifications` 的 `BOTTLE_RETURNED`（payload 带 `bottleId` / `songTitle`）⇒ 消息区那条用
 *   **中文**文案 + 设计稿的同一个记号（`li.hero`：暖引线、暖牌、动作「去看看」），点它先标已读再去那一支瓶子；
 * - `GET /api/me/bottles` 每行的 `awaitingMyAction`（CONTEXT §4.2：回传落到我手里、我只能选入海）⇒ 那一格
 *   按定稿画「回航泊位」：柱口系缆环（`.shaft` + `.hoop`）+ 立在环里的瓶子 + 文字区那枚实心暖牌「等你操作」，
 *   暖牌自己就是动作（点它 → `/bottle.html?id=…`）。
 * - **不画 `.due`**（定稿那行「回传决策时限 48 小时」）：契约里没有该字段、后端也没有"超时自动入海"的实现
 *   ⇒ 写了就是替系统许一个它不会兑现的诺。**只渲染服务端真给的东西**是本页的判据。
 */
import { get, post } from './api.js';
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
import { requireUser } from './session.js';
import { definePage } from './page.js';

/** 沉积柱：`.window { height:260px }`、`.lay { height:260px }`、四层各 65px（稿子口径）。 */
const COLUMN_HEIGHT = 260;
/** 稿子 `.window li { flex:1 }` 一屏正好五格；超过就只画前六格并把总数说清楚。 */
const MAX_CARDS = 6;
/** 消息区（`.msgs`）与内袋（`.pocket`）高度固定，行数超了会溢出边框 ⇒ 只画前几行 + 真实余量。 */
const MAX_MESSAGES = 3;
const MAX_POCKET_ROWS = 3;

const STATUS_LABEL = {
  DRAFT: '草稿 · 还没投河',
  IN_RIVER: '漂流中',
  HELD: '漂流中 · 已被接住',
  SEA: '已入海',
  DAMAGED: '已损坏',
};

const BADGE_LABEL = {
  RETURN_COMPLETED: '回传完成',
  DRIFT_PARTICIPANT: '漂流参与者',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

function fmtDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 可点击的 `<span>`：稿子里这两处只有文字（`.lk span`），所以只补交互语义，不动视觉。 */
function linkify(span, href) {
  if (span === null) return;
  span.setAttribute('role', 'link');
  span.setAttribute('tabindex', '0');
  span.style.cursor = 'pointer';
  const go = () => location.assign(href);
  on(span, 'click', go);
  on(span, 'keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      go();
    }
  });
}

/**
 * 层态推导。`cut` 只在**可证明**时才画：
 * 我是接唱者、当前一段有效的都不剩、而缺口恰好只有一个 ⇒ 被斩的那一段一定就是它
 * （ADR-015 §16.7：斩浪后该段不再出现在有效段列表里，缺口由 `missingSegmentIndexes` 表达）。
 * 缺口多于一个时无法确定是哪一段，就不画 `.cut`（不猜）。
 */
function layerKinds(item) {
  const mine = new Set(item.mySegmentIndexes);
  const missing = new Set(item.missingSegmentIndexes);
  const provableCut =
    item.role === 'SINGER' && item.mySegmentIndexes.length === 0 && item.missingSegmentIndexes.length === 1
      ? item.missingSegmentIndexes[0]
      : null;
  const kinds = new Map();
  for (let index = 1; index <= item.totalSegments; index += 1) {
    if (mine.has(index)) kinds.set(index, 'mine');
    else if (missing.has(index)) kinds.set(index, index === provableCut ? 'cut' : 'gap');
    else kinds.set(index, 'other');
  }
  return kinds;
}

async function start() {
  const handle = q('.sleeve .who .handle');
  const mail = q('.sleeve .who .mail');
  const stamp = q('.sleeve .who .stamp');
  const codeField = q('.codeslot .field');
  const crateCount = q('.crate .chead .cat');
  const windowBox = q('.window');
  const windowList = q('.window ul');
  const messages = q('.msgs');
  const messageList = q('.msgs ul');
  const pockets = qa('.pockets .pocket');
  const collectionPocket = pockets[0] ?? null;
  const badgePocket = pockets[1] ?? null;

  const cardNodes = windowList === null ? [] : qa(':scope > li', windowList);
  // 结构模板取第 4 格（只有四层沉积、没有水腔/浮瓶/暖牌），浮瓶 svg 从有水腔的那几格里抄一份。
  const cardTemplate = cardNodes[3]?.cloneNode(true) ?? cardNodes[0]?.cloneNode(true) ?? null;
  const messageTemplate = messageList === null ? null : qa(':scope > li', messageList)[1]?.cloneNode(true) ?? null;
  // 稿子里的浮瓶就是 `<svg class="float flask f200">` **本身**（不是某个容器里的 svg）⇒ 按 `svg.float` 抄。
  const flaskTemplate =
    cardNodes.map((node) => q('svg.float', node)).find((node) => node !== null && node !== undefined) ?? null;
  /**
   * 「回航泊位」的三件装饰只长在**第 1 格**上（定稿里那一格就是回传格）：柱口系缆环（`.hoop`）、
   * 立在环里的瓶子（`svg.float.fstand`）、文字区那枚实心暖牌（`.st`）。结构模板取的是第 4 格
   * （干净的沉积柱），所以要在清空之前把它们抄下来。
   */
  const stateMarkTemplate = cardNodes.map((node) => q('.txt > .st', node)).find((node) => node != null) ?? null;
  const standTemplate = cardNodes.map((node) => q('svg.float.fstand', node)).find((node) => node != null) ?? null;
  /** 消息区那条「回传」用的是同一枚记号（环 + 立瓶），也从冻结稿里抄。 */
  const heroMarkTemplate =
    messageList === null ? null : (q(':scope > li.hero .mrow > svg', messageList)?.cloneNode(true) ?? null);

  // 先同步抹掉稿子里的假数据（网络没回来之前页面上不能留"午夜的听众"这类演示内容）。
  if (handle !== null) handle.textContent = '载入中…';
  if (mail !== null) mail.textContent = '';
  if (stamp !== null) hide(stamp);
  if (codeField !== null) codeField.textContent = '';
  if (crateCount !== null) crateCount.textContent = '';
  windowList?.replaceChildren();
  messageList?.replaceChildren();

  const user = await requireUser();
  if (user === null) return; // 已跳登录页
  if (handle !== null) handle.textContent = user.handle;
  if (mail !== null) mail.textContent = user.email;
  if (stamp !== null) {
    // 徽章式的那枚「管理员账号」只在真是管理员时出现（稿子里它是演示数据）。
    if (user.role === 'ADMIN') show(stamp);
    else hide(stamp);
  }

  showLoading('正在取回你的漂流记录…');

  const [bottles, notifications, collections, badges, codes] = await Promise.all([
    get('/api/me/bottles').catch((error) => error),
    get('/api/notifications').catch((error) => error),
    get('/api/me/collections').catch((error) => error),
    get('/api/me/badges').catch((error) => error),
    get('/api/me/anonymous-codes').catch((error) => error),
  ]);
  if (bottles instanceof Error) {
    showRequestFailure(bottles, { onRetry: () => location.reload() });
    return;
  }
  clearState();

  // ─────────────────────────────────────────────────────────── 匿名代号（每瓶一枚）
  if (codeField !== null) {
    if (codes instanceof Error || codes.length === 0) {
      codeField.textContent = '—';
      codeField.title = '你还没有参与过任何漂流瓶，所以还没有匿名代号。';
    } else {
      codeField.textContent = codes.map((row) => row.code).join(' · ');
      codeField.title = codes.map((row) => `${row.code}（${row.bottleId.slice(0, 8)}）`).join('\n');
    }
  }

  // ─────────────────────────────────────────────────────────── 我参与过的漂流瓶
  const items = bottles.items ?? [];
  if (crateCount !== null) {
    crateCount.textContent =
      items.length > MAX_CARDS ? `共 ${items.length} 支 · 列表画前 ${MAX_CARDS} 支` : `共 ${items.length} 支`;
  }
  if (windowList !== null && cardTemplate !== null) {
    if (items.length === 0) {
      showEmpty('你还没有参与过任何漂流瓶：去河道捞一个，或者自己发起一支。', {
        target: windowBox ?? windowList,
      });
    } else {
      items.slice(0, MAX_CARDS).forEach((item, position) => {
        windowList.append(buildCard(item, position));
      });
    }
  }

  function buildCard(item, position) {
    const card = cardTemplate.cloneNode(true);
    const layerHeight = COLUMN_HEIGHT / item.totalSegments;
    const kinds = layerKinds(item);
    const lay = q('.lay', card);

    if (lay !== null) {
      lay.replaceChildren();
      for (let index = 1; index <= item.totalSegments; index += 1) {
        const kind = kinds.get(index);
        // 稿子只有 b1..b4 四档底纹；段数 >4 时复用最深一档（数据里出现不了，见 seed：3 曲 × 4 段）。
        const band = `b${Math.min(index, 4)}`;
        const stateClass = kind === 'mine' ? 'sd mine' : kind === 'cut' ? 'cut' : kind === 'gap' ? 'wt' : 'sd';
        lay.append(
          el('i', {
            class: `${band} ${stateClass}`,
            style: `bottom:${(index - 1) * layerHeight}px;height:${layerHeight}px`,
          }, [
            el('b', {
              class: kind === 'gap' || kind === 'cut' ? 'no ghost' : 'no',
              text: String(index),
            }),
          ]),
        );
      }
      // 顶部还是水腔 ⇒ 沉积面在最高实心层之上，瓶子还漂在水里没有落下来。
      const solidTop = [...kinds.entries()]
        .filter(([, kind]) => kind === 'mine' || kind === 'other')
        .reduce((max, [index]) => Math.max(max, index), 0);
      if (kinds.get(item.totalSegments) === 'gap' && solidTop > 0) {
        const surface = solidTop * layerHeight;
        lay.append(el('i', { class: 'iface', style: `bottom:${surface}px` }));
        if (flaskTemplate !== null) {
          const flask = flaskTemplate.cloneNode(true);
          flask.setAttribute('class', 'float flask');
          flask.setAttribute('style', `bottom:${Math.max(0, surface - 6)}px`);
          card.append(flask);
        }
      }
    }

    const role = q('.r1 .role', card);
    if (role !== null) {
      role.className = item.role === 'INITIATOR' ? 'role mine' : 'role';
      role.textContent = item.role === 'INITIATOR' ? '我发起的' : '我接唱的';
    }
    const slot = q('.r1 .slot', card);
    if (slot !== null) slot.textContent = pad2(position + 1);
    const title = q('.t', card);
    if (title !== null) title.textContent = item.songTitle;

    /**
     * 「等你操作」那一套只服务端**真给了**才画：`awaitingMyAction`（CONTEXT §4.2：回传落到我手里、
     * 我只能选入海）。模板那一格没有这套节点 ⇒ 先清干净，再在真待我操作的那一支上重建。
     * **不画 `.due`**（定稿那行「回传决策时限 48 小时」）：契约没有该字段、后端也没有超时自动入海，
     * 写了就是让界面替系统许一个不会兑现的诺。
     */
    qa('.txt > .st, .txt > .due', card).forEach((node) => node.remove());
    for (const node of qa('.txt > .d', card)) node.remove();

    const lines = [];
    lines.push(el('p', { class: 'd', text: `已录 ${item.recordedCount} / ${item.totalSegments} 段` }));
    if (item.mySegmentIndexes.length > 0) {
      lines.push(el('p', { class: 'd', text: `我唱的：第 ${item.mySegmentIndexes.join('、')} 段` }));
    } else {
      lines.push(el('p', { class: 'd warn', text: '我唱的那一段被斩浪删除了（仍算参与过）' }));
    }
    lines.push(
      item.missingSegmentIndexes.length === 0
        ? el('p', { class: 'd ok', text: '全部段位都有人唱过' })
        : el('p', { class: 'd warn', text: `缺第 ${item.missingSegmentIndexes.join('、')} 段` }),
    );
    const zone =
      item.status === 'SEA'
        ? item.seaZone === 'COMPLETED'
          ? ' · 完整作品'
          : ' · 等待接力'
        : '';
    lines.push(el('p', { class: 'd', text: `${STATUS_LABEL[item.status] ?? item.status}${zone}` }));

    const links = q('.lk', card);
    if (links !== null) {
      links.before(...lines);
      // 定稿的顺序是：正文行 → 暖牌 → 两个链接（所以暖牌要在正文之后插）。
      if (item.awaitingMyAction === true) appendActionMark(card, item, links);
      const [open, log] = qa('span', links);
      linkify(open ?? null, `/bottle.html?id=${encodeURIComponent(item.id)}`);
      linkify(log ?? null, `/drift-log.html?id=${encodeURIComponent(item.id)}`);
    } else {
      card.append(...lines);
      if (item.awaitingMyAction === true) appendActionMark(card, item, null);
    }
    return card;
  }

  /**
   * 「回航泊位」的可见记号（**只在 `awaitingMyAction === true` 时调用**）：柱口系缆环 + 立在环里的瓶子
   * + 文字区那枚实心暖牌。暖牌**自己就是动作** —— 点它去那一支瓶子（定稿上它的位置在正文之后、链接之前）。
   * 文本一律取冻结稿里的原文，这里不新写一个字。
   */
  function appendActionMark(card, item, links) {
    const lay = q('.lay', card);
    if (lay !== null) {
      lay.classList.add('ret');
      lay.prepend(el('i', { class: 'shaft' }));
      lay.append(el('i', { class: 'hoop' }));
    }
    if (standTemplate !== null) card.prepend(standTemplate.cloneNode(true));
    if (stateMarkTemplate !== null) {
      const mark = stateMarkTemplate.cloneNode(true);
      linkify(mark, `/bottle.html?id=${encodeURIComponent(item.id)}`);
      if (links !== null) links.before(mark);
      else card.append(mark);
    }
  }

  // ─────────────────────────────────────────────────────────── 消息（只显示自己的）
  if (messageList !== null && messageTemplate !== null) {
    const rows = notifications instanceof Error ? [] : (notifications.items ?? []);
    if (rows.length === 0) {
      showEmpty('还没有消息：留言送达/未送达、作品完成入海都会落到这里。', {
        target: messages ?? messageList,
      });
    } else {
      const shown = rows.slice(0, MAX_MESSAGES);
      for (const row of shown) messageList.append(buildMessage(row));
      if (rows.length > shown.length) {
        messageList.append(
          el('li', {}, [
            el('div', { class: 'mrow' }, [
              el('span', { class: 'read', text: `另有 ${rows.length - shown.length} 条消息未显示` }),
            ]),
          ]),
        );
      }
    }
  }

  function buildMessage(row) {
    const item = messageTemplate.cloneNode(true);
    const payload = row.payload ?? {};
    const songTitle = typeof payload.songTitle === 'string' ? payload.songTitle : null;
    const bottleId = typeof payload.bottleId === 'string' ? payload.bottleId : null;
    const labels = {
      // 回传落到我手里（CONTEXT §4.2）：标题与说明取自定稿「我的」页那一行，动作是「去看看」。
      BOTTLE_RETURNED: {
        lab: songTitle === null ? '有一支作品回传到你手里了' : `《${songTitle}》回传到你手里了`,
        detail: '完整版本已经沿父链回到发起者手里 —— 你只能把它送进公海。',
      },
      MESSAGE_DELIVERED: {
        lab: '收到一条私密留言',
        detail: songTitle === null ? '有一条留给你的话随作品送到你手里。' : `《${songTitle}》里有一条留给你的话。`,
      },
      MESSAGE_UNDELIVERED: {
        lab: '你的留言未送达',
        detail:
          songTitle === null
            ? '作品中途进了公海，留言没能交到对方手里。'
            : `《${songTitle}》中途进了公海，留言没能交到对方手里。`,
      },
      BOTTLE_COMPLETED: {
        lab: '你参与的作品已完成',
        detail:
          songTitle === null
            ? '所有段位都补齐并进入公海，可以回听完整接力链。'
            : `《${songTitle}》已补齐所有段位并进入公海，可以回听完整接力链。`,
      },
    };
    const known = labels[row.type] ?? null;
    const lab = q('.mrow .lab', item);
    if (lab !== null) lab.textContent = known === null ? row.type : known.lab;
    const detail = q('.mdet', item);
    if (detail !== null) {
      detail.textContent =
        known === null ? `（未识别的通知类型 ${row.type}，原始时间 ${fmtDate(row.createdAt)}）` : known.detail;
    }
    const pill = q('.mrow .pill', item);
    const read = q('.mrow .read', item);
    const unread = row.readAt === null;
    if (unread) {
      read?.remove();
      if (pill !== null) pill.textContent = '未读';
    } else {
      pill?.remove();
      if (read !== null) {
        read.textContent = `已读 ${fmtDate(row.readAt)}`;
      }
    }
    const go = q('.mrow .go', item);
    if (go !== null) {
      if (unread) {
        go.textContent = '标记已读';
        go.setAttribute('role', 'button');
        go.setAttribute('tabindex', '0');
        go.style.cursor = 'pointer';
        const markRead = () => void readNotification(item, row, go);
        on(go, 'click', markRead);
        on(go, 'keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            markRead();
          }
        });
      } else {
        go.textContent = '已读';
        go.style.cursor = 'default';
      }
    }
    return item;
  }

  /** 就地更新未读态（`POST /api/notifications/:id/read`）：不跳页、不重排整块消息区。 */
  async function readNotification(item, row, go) {
    if (row.readAt !== null) return;
    go.setAttribute('aria-busy', 'true');
    try {
      await post(`/api/notifications/${row.id}/read`);
    } catch (error) {
      go.removeAttribute('aria-busy');
      showRequestFailure(error);
      return;
    }
    row.readAt = new Date().toISOString();
    const pill = q('.mrow .pill', item);
    if (pill !== null) {
      pill.replaceWith(el('span', { class: 'read', text: `已读 ${fmtDate(row.readAt)}` }));
    }
    go.textContent = '已读';
    go.style.cursor = 'default';
    go.removeAttribute('aria-busy');
    go.removeAttribute('tabindex');
  }

  // ─────────────────────────────────────────────────────────── 收藏 / 徽章
  async function titleOf(bottleId) {
    try {
      const detail = await get(`/api/bottles/${bottleId}`);
      return detail.songTitle ?? null;
    } catch {
      return null;
    }
  }

  if (collectionPocket !== null) {
    const rows = Array.isArray(collections) ? collections : [];
    if (rows.length === 0) {
      // 说明段（上面那条 `.pocket > p`）已经把规则讲清楚了，空态只报"没有"，不重复一遍规则。
      showEmpty('还没有收藏。', { target: collectionPocket });
    } else {
      q(':scope > p', collectionPocket)?.remove();
      const shown = rows.slice(0, MAX_POCKET_ROWS);
      for (const row of shown) {
        const title = await titleOf(row.bottleId);
        const go = el('span', { class: 'go', text: title === null ? '去听' : `听《${title}》` });
        collectionPocket.append(
          el('div', { class: 'mrow' }, [
            el('span', { class: 'lab', text: title ?? row.bottleId.slice(0, 8) }),
            el('span', { class: 'read', text: fmtDate(row.createdAt) }),
            go,
          ]),
        );
        linkify(go, `/bottle.html?id=${encodeURIComponent(row.bottleId)}`);
      }
      if (rows.length > shown.length) {
        collectionPocket.append(
          el('div', { class: 'mrow' }, [
            el('span', { class: 'read', text: `另有 ${rows.length - shown.length} 件收藏` }),
          ]),
        );
      }
    }
  }

  if (badgePocket !== null) {
    const rows = Array.isArray(badges) ? badges : [];
    if (rows.length === 0) {
      showEmpty('还没有徽章。', { target: badgePocket });
    } else {
      q(':scope > p', badgePocket)?.remove();
      const shown = rows.slice(0, MAX_POCKET_ROWS);
      for (const row of shown) {
        const title = await titleOf(row.bottleId);
        const go = el('span', { class: 'go', text: '去听' });
        badgePocket.append(
          el('div', { class: 'mrow' }, [
            el('span', { class: 'lab', text: BADGE_LABEL[row.kind] ?? row.kind }),
            el('span', {
              class: 'read',
              text: `${title === null ? row.bottleId.slice(0, 8) : `《${title}》`} · ${fmtDate(row.grantedAt)}`,
            }),
            go,
          ]),
        );
        linkify(go, `/bottle.html?id=${encodeURIComponent(row.bottleId)}`);
      }
      if (rows.length > shown.length) {
        badgePocket.append(
          el('div', { class: 'mrow' }, [
            el('span', { class: 'read', text: `另有 ${rows.length - shown.length} 枚徽章` }),
          ]),
        );
      }
    }
  }
}

export const { init } = definePage({
  name: 'me',
  owner: 'W1-c',
  endpoints: [
    'GET /api/auth/me',
    'GET /api/me/bottles',
    'GET /api/notifications',
    'POST /api/notifications/:id/read',
    'GET /api/me/collections',
    'GET /api/me/badges',
    'GET /api/me/anonymous-codes',
    'GET /api/bottles/:id',
  ],
  init: start,
});
