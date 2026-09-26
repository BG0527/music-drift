/**
 * 页面模块：`site/new.html`（W1-a 接线；W4-a 改流程）
 *
 * 端点：
 *   - `GET /api/songs`（裸数组，见 `packages/shared/src/contracts/songs.ts`）→ 替换页面的 5 条演示曲目；
 *   - `POST /api/bottles`（请求体 `{ songId }`，见 `bottles.ts` 的 `CreateBottleRequestSchema`）
 *     → 建瓶（`DRAFT`）。
 *
 * **W4-a 需求 4：本页不再录音。** 用户第 2 轮要求「投瓶：选好歌后进入接唱页，不直接在选歌页唱」，
 * 所以这里的动作是「选这首，去接唱」：建一只 DRAFT 瓶 → 跳 `/bottle.html?id=<新瓶 id>`，
 * 录音（第 N 段）与「选择去向」都发生在**瓶子详情页**（那里本来就有唯一的缺口格与去向）。
 * 因此：
 *   - 本页**不再 import `./recorder.js`**，也不再申请麦克风（点按钮不会占用麦克风）；
 *   - 上传段的端点是 `/bottle.html` 的事，本页不再 `POST /api/bottles/:id/segments`。
 * 为什么比以前更省：接唱页已经有一套完整的「缺口 → 录一段 → 选去向」实现，复用它是零新增。
 *
 * 本文件**不改 HTML**（`site/*.html` 是发布副本，由 `tools/sync-site.mjs` 生成）：
 *   - 卡片：克隆页面第 1 格（`.bay`）当模板，位置/盆沿错位照抄页面各格自己的 inline style；
 *   - 干盆说明：克隆页面第 2 格那行 `.note`（原文「这首还没有切分，暂不能发起」）；
 *   - 盆（SVG）：克隆页面自己画好的「有水位」与「干盆」两组 `<g>`，按各格的 `transform` 摆回去
 *     —— 设计稿的语义是「盆里的水位＝这首已切好的段位」，所以盆必须跟着数据走；
 *   - 文本一律 `textContent`，不拼 HTML。
 */
import { get, post } from './api.js';
import {
  clearState,
  hide,
  on,
  q,
  qa,
  setVisible,
  showEmpty,
  showLoading,
  showRequestFailure,
  showWaking,
} from './dom.js';
import { requireUser } from './session.js';
import { definePage } from './page.js';

const SONGS_ENDPOINT = '/api/songs';
const BOTTLES_ENDPOINT = '/api/bottles';
/** 设计稿只有五格（五个 `left`、五只盆的 `transform`）；多的曲目用计数文案如实说明。 */
const MAX_SLOTS = 5;
/** 设计稿的两行「状态示例」是演示文案：本页没有把它们接上任何东西，所以在页面上标出来。 */
const SAMPLE_SUFFIX = ' · 示例';
/**
 * 按钮文案（W4-a 需求 4）。
 *
 * 定稿写死的是「选这首，录第 1 段」，但本页现在**已经不能录音**了
 * （录第几段由服务端在接唱页决定，见 `docs/deploy-plan-html.md` §13 需求 4）
 * —— 留着那句话就是"按钮说 A、实际做 B"。所以运行期换成真实动作；
 * 图标仍是定稿的麦克风（它表示"你要开唱了"，不是"现在就在这里录"）。
 */
const ACTION_LABEL = '选这首，去接唱';
const TEXT = {
  checking: '正在确认登录状态…',
  creating: '正在发起这支瓶子…',
  going: '瓶子开好了，正在带你进接唱页…',
  retry: '重试：去接唱',
};

/** 从页面自身抄下来的模板与视觉值（不新增任何设计值）。 */
const design = {
  bay: null,
  slotStyles: [],
  note: null,
  dish: { wet: null, dry: null },
  dishTransforms: [],
  dryLabel: '',
  dryNote: '',
  samples: { noMatch: '', empty: '' },
};

let songs = [];
let query = '';
/** 正在发起的那一格（同一时刻只允许一次建瓶，避免连点出两只空瓶）。 */
let pendingBay = null;

// ────────────────────────────────────────────────────────────── 设计稿取样（只跑一次）

function captureDesign() {
  const bays = qa('.rack .bay');
  design.bay = bays[0] ?? null;
  design.slotStyles = bays.map((bay) => ({
    bay: bay.getAttribute('style'),
    edge: bay.querySelector('.edge')?.getAttribute('style') ?? null,
  }));
  const dryBay = bays.find((bay) => bay.querySelector('.note') !== null) ?? null;
  design.note = dryBay?.querySelector('.note') ?? null;
  design.dryLabel = dryBay?.querySelector('.act')?.textContent.trim() ?? '';
  design.dryNote = design.note?.textContent ?? '';

  const dishes = qa('svg.art > g');
  design.dishTransforms = dishes.map((node) => node.getAttribute('transform'));
  design.dish.wet = dishes.find((node) => node.querySelector('use[href="#pool"]') !== null) ?? null;
  design.dish.dry =
    dishes.find((node) => node.querySelector('use[href="#masterBlank"]') !== null) ?? null;

  const sampleTexts = qa('.states .st span:not(.cat)');
  design.samples.noMatch = sampleTexts[0]?.textContent ?? '曲库里没有找到匹配的歌，换个词试试。';
  design.samples.empty = sampleTexts[1]?.textContent ?? '曲库还没有可选的歌。';

  // 两行状态示例没有被接上任何东西 ⇒ 在页面上标成演示文案（标签是唯一的说明位）。
  for (const label of qa('.states .st .cat')) {
    if (!label.textContent.includes(SAMPLE_SUFFIX)) label.textContent += SAMPLE_SUFFIX;
  }
}

// ────────────────────────────────────────────────────────────── 数据

function isSplit(song) {
  return Array.isArray(song?.segments) && song.segments.length > 0;
}

function averageSeconds(song) {
  const durations = (song?.segments ?? [])
    .map((segment) => segment?.durationMs)
    .filter((value) => typeof value === 'number' && value > 0);
  if (durations.length === 0) return null;
  const total = durations.reduce((sum, value) => sum + value, 0);
  return Math.round(total / durations.length / 1000);
}

function filtered() {
  if (query === '') return songs;
  const needle = query.toLowerCase();
  return songs.filter((song) => String(song.title).toLowerCase().includes(needle));
}

async function load() {
  showLoading('正在读取曲库…');
  clearPlaceholders();
  try {
    const list = await get(SONGS_ENDPOINT);
    songs = Array.isArray(list) ? list : [];
    render();
  } catch (error) {
    showRequestFailure(error, { onRetry: load });
  }
}

/** 演示数据不能停留：先把 5 条假曲目、假计数撤掉，再等真数据。 */
function clearPlaceholders() {
  q('.rack')?.replaceChildren();
  clearDishes();
  for (const node of qa('.tally .n')) node.textContent = '—';
  const count = q('.plate .count');
  if (count !== null) count.textContent = '正在读取曲库…';
}

// ────────────────────────────────────────────────────────────── 渲染

function render() {
  const shown = filtered();
  renderRack(shown);
  renderTally();
  renderCount(shown.length);
  renderStates(shown.length);
}

function renderTally() {
  const split = songs.filter(isSplit).length;
  const nodes = qa('.tally .n');
  if (nodes[0] !== undefined) nodes[0].textContent = String(split);
  if (nodes[1] !== undefined) nodes[1].textContent = String(songs.length - split);
}

function renderCount(shownCount) {
  const node = q('.plate .count');
  if (node === null) return;
  const capped = songs.length > MAX_SLOTS ? `（此处显示前 ${MAX_SLOTS} 首）` : '';
  node.textContent =
    query === ''
      ? `曲库共 ${songs.length} 首${capped}`
      : `匹配 ${shownCount} 首 · 曲库共 ${songs.length} 首${capped}`;
}

/** 空态 / 无匹配用 `dom.showState` 系列；文案取自设计稿自己那两句（只把「蓝」换成真实过滤词）。 */
function renderStates(shownCount) {
  if (songs.length === 0) {
    showEmpty(design.samples.empty, { onRetry: load });
    return;
  }
  if (shownCount === 0) {
    showEmpty(design.samples.noMatch.replace(/「[^」]*」/, `「${query}」`));
    return;
  }
  clearState();
}

function renderRack(shown) {
  const rack = q('.rack');
  if (rack === null) return;
  const slots = Math.min(shown.length, design.slotStyles.length, MAX_SLOTS);
  const cards = [];
  const dishes = [];
  for (let index = 0; index < slots; index += 1) {
    const song = shown[index];
    cards.push(buildBay(song, index));
    dishes.push(buildDish(song, index));
  }
  rack.replaceChildren(...cards);
  const art = q('svg.art');
  if (art !== null) {
    for (const node of qa('svg.art > g', art)) node.remove();
    art.append(...dishes);
  }
}

function clearDishes() {
  const art = q('svg.art');
  if (art === null) return;
  for (const node of qa('svg.art > g', art)) node.remove();
}

function buildBay(song, slot) {
  const bay = design.bay.cloneNode(true);
  const slotStyle = design.slotStyles[slot] ?? {};
  if (typeof slotStyle.bay === 'string') bay.setAttribute('style', slotStyle.bay);
  const edge = bay.querySelector('.edge');
  if (edge !== null && typeof slotStyle.edge === 'string') edge.setAttribute('style', slotStyle.edge);

  bay.querySelector('.song').textContent = String(song.title);
  renderSegmentMeta(bay.querySelector('.meta.m1'), song);
  const source = bay.querySelector('.meta.m2');
  if (source !== null) source.textContent = `来源 ${song.licensedSource ?? '未知'}`;

  const note = ensureNote(bay);
  const act = bay.querySelector('.act');
  bay.dataset.songId = String(song.id ?? '');

  if (isSplit(song)) {
    setActLabel(act, ACTION_LABEL);
    act.disabled = false;
    note.textContent = '';
    hide(note);
    bay.dataset.actionState = 'idle';
    on(act, 'click', () => void chooseForBottle(bay, song));
  } else {
    setActLabel(act, design.dryLabel);
    act.disabled = true;
    note.textContent = design.dryNote;
    setVisible(note, true);
    bay.dataset.actionState = 'dry';
  }
  return bay;
}

/** `4 段 | 每段约 20 秒`：段数与时长都来自数据（契约禁止写死 4）。 */
function renderSegmentMeta(meta, song) {
  if (meta === null) return;
  const nodes = Array.from(meta.childNodes);
  const seconds = averageSeconds(song);
  if (nodes[0] !== undefined) nodes[0].textContent = `${song.totalSegments} 段`;
  for (const node of nodes.slice(1)) {
    const isSeparator = node.nodeType === Node.ELEMENT_NODE && node.classList.contains('sep');
    if (isSeparator) {
      if (seconds === null) node.remove();
      continue;
    }
    if (seconds === null) node.remove();
    else node.textContent = `每段约 ${seconds} 秒`;
  }
}

/** 盆跟着数据走：已切分用「有水位」那只，未切分用「干盆」那只（克隆页面自己画好的两组）。 */
function buildDish(song, slot) {
  const template = isSplit(song) ? design.dish.wet : design.dish.dry;
  const node = template.cloneNode(true);
  const transform = design.dishTransforms[slot];
  if (transform !== null && transform !== undefined) node.setAttribute('transform', transform);
  return node;
}

function ensureNote(bay) {
  let note = bay.querySelector('.note');
  if (note === null && design.note !== null) {
    note = design.note.cloneNode(true);
    note.textContent = '';
    bay.append(note);
  }
  return note;
}

/** 按钮文案在设计稿里是图标后面的那个文本节点（干盆那格没有图标）——只改它，不动 svg。 */
function setActLabel(act, text) {
  if (act === null || typeof text !== 'string' || text === '') return;
  const last = act.lastChild;
  if (last !== null && last.nodeType === Node.TEXT_NODE) last.textContent = text;
  else act.append(document.createTextNode(text));
}

// ────────────────────────────────────────────────────────────── 选歌 → 建瓶 → 去接唱

function setNoteText(bay, text) {
  const note = ensureNote(bay);
  if (note === null) return;
  note.textContent = text ?? '';
  setVisible(note, typeof text === 'string' && text !== '');
}

function setBayState(bay, state) {
  bay.dataset.actionState = state;
  const act = bay.querySelector('.act');
  if (act === null) return;
  if (state === 'creating') {
    setActLabel(act, TEXT.creating);
    act.disabled = true;
  } else if (state === 'going') {
    setActLabel(act, TEXT.going);
    act.disabled = true;
  } else if (state === 'failed') {
    setActLabel(act, TEXT.retry);
    act.disabled = false;
  } else {
    setActLabel(act, ACTION_LABEL);
    act.disabled = false;
  }
}

/**
 * `选这首，去接唱`：建一只 DRAFT 瓶，然后跳接唱页。
 *
 * 建瓶**只发一次**：拿到 id 之前失败可以重试；拿到 id 之后在这里只会跳转，
 * 不再有"重试又建一只空瓶"的路径（本页已无段上传，建瓶成功即离开本页）。
 */
async function chooseForBottle(bay, song) {
  if (pendingBay !== null) return;
  pendingBay = bay;
  setBayState(bay, 'creating');
  setNoteText(bay, TEXT.checking);
  try {
    const user = await requireUser();
    if (user === null) {
      // 已跳登录页；把这一格恢复成可点，免得用户返回时看到一张卡住的卡片。
      pendingBay = null;
      setBayState(bay, 'idle');
      setNoteText(bay, '');
      return;
    }
    setNoteText(bay, TEXT.creating);
    const bottle = await post(BOTTLES_ENDPOINT, { songId: song.id });
    const id = bottle?.id ?? null;
    if (typeof id !== 'string' || id === '') {
      pendingBay = null;
      setBayState(bay, 'failed');
      setNoteText(bay, '发起失败：服务端没有返回瓶子 id。');
      return;
    }
    setBayState(bay, 'going');
    setNoteText(bay, TEXT.going);
    location.assign(`/bottle.html?id=${encodeURIComponent(id)}`);
  } catch (error) {
    pendingBay = null;
    // 业务错误照原样显示服务端 message（本页不重写它的文案）。
    setBayState(bay, 'failed');
    setNoteText(bay, error?.message ?? '发起失败，请重试。');
    if (error?.isServiceDown === true) showWaking(null, { onRetry: () => void chooseForBottle(bay, song) });
  }
}

// ────────────────────────────────────────────────────────────── 装配

function wire() {
  captureDesign();
  const input = q('.plate input');
  if (input !== null) {
    on(input, 'input', () => {
      query = input.value.trim();
      render();
    });
  }
  void load();
}

export const { init } = definePage({
  name: 'new',
  owner: 'W1-a',
  endpoints: ['GET /api/songs', 'POST /api/bottles'],
  note: '曲库/计数/盆位接真数据；选曲 → 建 DRAFT 瓶 → 跳 bottle.html 接唱（W4-a：本页不再录音）',
  init: wire,
});
