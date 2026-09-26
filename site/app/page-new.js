/**
 * 页面模块：`site/new.html`（W1-a 接线；W1-b 补上段上传）
 *
 * 端点（顺序不可反：段挂在下好的瓶上）：
 *   - `GET /api/songs`（裸数组，见 `packages/shared/src/contracts/songs.ts`）→ 替换页面的 5 条演示曲目；
 *   - `POST /api/bottles`（请求体 `{ songId }`，见 `bottles.ts` 的 `CreateBottleRequestSchema`）
 *     → 建瓶（`DRAFT`）；
 *   - `POST /api/bottles/:id/segments`（**原始二进制**：`Content-Type` = 音频 MIME、body = 字节流、
 *     时长走 `x-audio-duration-ms`；见 `bottles.ts:277`）→ 把刚录的这一段真的放进瓶里；
 *   - 两步都成功 → `/bottle.html?id=<瓶 id>`。
 *
 * 为什么瓶 id 要记在本次录音会话里：上传失败重试**只重传段**——
 * 瓶已经在了，再发一次 `POST /api/bottles` 就会多出一只空瓶。
 * 录音规则（容器协商、麦克风失败文案、时长＝开始/停止的时间戳差值）走共享层 `./recorder.js`，
 * 本页不再自己抄一份；明显不合格的录制（<15s / >30s）仍在本地就拦下，不占用一次 422。
 *
 * 本文件**不改 HTML**（`site/*.html` 是发布副本，由 `tools/sync-site.mjs` 生成）：
 *   - 卡片：克隆页面第 1 格（`.bay`）当模板，位置/盆沿错位照抄页面各格自己的 inline style；
 *   - 干盆说明：克隆页面第 2 格那行 `.note`（原文「这首还没有切分，暂不能发起」）；
 *   - 盆（SVG）：克隆页面自己画好的「有水位」与「干盆」两组 `<g>`，按各格的 `transform` 摆回去
 *     —— 设计稿的语义是「盆里的水位＝这首已切好的段位」，所以盆必须跟着数据走；
 *   - 文本一律 `textContent`，不拼 HTML。
 */
import { get, post, postAudio } from './api.js';
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
import { SEGMENT_MAX_MS, SEGMENT_MIN_MS, startRecordingSession } from './recorder.js';

const SONGS_ENDPOINT = '/api/songs';
const BOTTLES_ENDPOINT = '/api/bottles';
/** 设计稿只有五格（五个 `left`、五只盆的 `transform`）；多的曲目用计数文案如实说明。 */
const MAX_SLOTS = 5;
/** 设计稿的两行「状态示例」是演示文案：本页没有把它们接上任何东西，所以在页面上标出来。 */
const SAMPLE_SUFFIX = ' · 示例';
/**
 * 每段时长区间（`RecordSegmentRequestSchema.durationMs`：15–30 秒）：本地先把明显不合格的录制拦下。
 * 这两个常量来自共享层 `./recorder.js`（源头是 `packages/shared/src/audio/constants.ts`），本页不再抄。
 */
/** 区间文案只有一处来源，注记行与提示语都用它。 */
const SEGMENT_SECONDS = `${SEGMENT_MIN_MS / 1000}–${SEGMENT_MAX_MS / 1000}`;
const TEXT = {
  checking: '正在确认登录状态…',
  requesting: '正在请求麦克风…',
  stop: '停止录音',
  submit: '发起这支瓶子',
  retryCreate: '重试发起',
  retryUpload: '重试上传',
  uploading: '上传中：正在把这一段放进瓶子…',
  uploaded: '上传成功：正在打开这支瓶子…',
};

/** `POST /api/bottles/:id/segments`（瓶 id 必须过 `encodeURIComponent`）。 */
function segmentsEndpoint(bottleId) {
  return `${BOTTLES_ENDPOINT}/${encodeURIComponent(bottleId)}/segments`;
}

/** 从页面自身抄下来的模板与视觉值（不新增任何设计值）。 */
const design = {
  bay: null,
  slotStyles: [],
  note: null,
  dish: { wet: null, dry: null },
  dishTransforms: [],
  labels: { record: '', dry: '' },
  dryNote: '',
  samples: { noMatch: '', empty: '' },
};

let songs = [];
let query = '';
/** 当前录音会话（同一时刻只录一格）。 */
let take = null;

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
  design.labels.record = bays[0]?.querySelector('.act')?.textContent.trim() ?? '';
  design.labels.dry = dryBay?.querySelector('.act')?.textContent.trim() ?? '';
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
  if (take !== null) abortTake();
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
    setActLabel(act, design.labels.record);
    act.disabled = false;
    note.textContent = '';
    hide(note);
    bay.dataset.recordState = 'idle';
    on(act, 'click', () => void onAct(bay, song));
  } else {
    setActLabel(act, design.labels.dry);
    act.disabled = true;
    note.textContent = design.dryNote;
    setVisible(note, true);
    bay.dataset.recordState = 'dry';
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

// ────────────────────────────────────────────────────────────── 录音 → 发起

function setNoteText(bay, text) {
  const note = ensureNote(bay);
  if (note === null) return;
  note.textContent = text ?? '';
  setVisible(note, typeof text === 'string' && text !== '');
}

/** `retryLabel`：失败后要按的动作不一样（还没建瓶 = 重试发起；瓶已在 = 重试上传）。 */
function setBayState(bay, state, text, retryLabel = TEXT.retryCreate) {
  bay.dataset.recordState = state;
  const act = bay.querySelector('.act');
  setNoteText(bay, text ?? null);
  if (act === null) return;
  if (state === 'recording') {
    setActLabel(act, TEXT.stop);
    act.disabled = false;
  } else if (state === 'requesting') {
    setActLabel(act, TEXT.requesting);
    act.disabled = true;
  } else if (state === 'uploading') {
    setActLabel(act, TEXT.submit);
    act.disabled = true;
  } else if (state === 'recorded') {
    setActLabel(act, TEXT.submit);
    act.disabled = false;
  } else if (state === 'failed') {
    setActLabel(act, retryLabel);
    act.disabled = false;
  } else {
    setActLabel(act, design.labels.record);
    act.disabled = false;
  }
}

function recordingText(seconds) {
  return `录制中 ${seconds} 秒（每段 ${SEGMENT_SECONDS} 秒）· 点「${TEXT.stop}」结束`;
}

function recordedText(durationMs) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return `已录 ${seconds} 秒 · 点「${TEXT.submit}」上传这一段并建瓶`;
}

/**
 * 本地门（契约 15–30 秒）：录太短/太长在**提交前**就拦下并就地提示，
 * 不浪费一次往返去换后端的 `AUDIO_DURATION_OUT_OF_RANGE`。
 * 返回 `null` = 这次录制可以提交（是否合该段曲库预设由服务端权威判定，服务端的话原样显示）。
 */
function localDurationIssue(durationMs) {
  const seconds = (durationMs / 1000).toFixed(1);
  if (durationMs < SEGMENT_MIN_MS) {
    return `录太短：这次只录了 ${seconds} 秒，每段要 ${SEGMENT_SECONDS} 秒，请重新录制。`;
  }
  if (durationMs > SEGMENT_MAX_MS) {
    return `录太长：这次录了 ${seconds} 秒，每段要 ${SEGMENT_SECONDS} 秒，请重新录制。`;
  }
  return null;
}

function abortTake() {
  if (take === null) return;
  if (take.ticker !== null) clearInterval(take.ticker);
  /** `cancel()` 会松开麦克风且**不**触发 `onStop`：被放弃的这一段不该再上传（已停下的会话是 null）。 */
  take.session?.cancel();
  take = null;
}

async function onAct(bay, song) {
  const state = bay.dataset.recordState;
  if (state === 'idle') await startRecording(bay, song);
  else if (state === 'recording') stopRecording();
  else if (state === 'recorded' || state === 'failed') await submit(bay, song);
  // requesting / uploading / dry：进行中或不可用，忽略点击（按钮已 disabled）
}

async function startRecording(bay, song) {
  if (take !== null) return;
  setBayState(bay, 'requesting', TEXT.checking);
  try {
    const user = await requireUser();
    if (user === null) {
      setBayState(bay, 'idle');
      return;
    }
  } catch (error) {
    setBayState(bay, 'failed', `读取登录状态失败：${error.message}`);
    return;
  }

  setNoteText(bay, TEXT.requesting);

  const started = await startRecordingSession({
    onStop: ({ blob, durationMs }) => {
      if (take === null || take.bay !== bay) return;
      if (take.ticker !== null) clearInterval(take.ticker);
      const issue = localDurationIssue(durationMs);
      if (issue !== null) {
        // 不合格的录制直接丢掉（会话清空 ⇒ 按钮回到「录音」，可以立刻重录）。
        take = null;
        setBayState(bay, 'idle', issue);
        return;
      }
      take.ticker = null;
      take.session = null;
      take.durationMs = durationMs;
      take.blob = blob;
      setBayState(bay, 'recorded', recordedText(durationMs));
    },
  });
  if (!started.ok) {
    setBayState(bay, 'failed', started.message);
    return;
  }

  take = {
    bay,
    song,
    session: started.session,
    ticker: null,
    blob: null,
    durationMs: 0,
    /** 建瓶成功后写进来：上传失败重试时靠它只重传段。 */
    bottleId: null,
  };
  take.ticker = setInterval(() => {
    if (take === null || take.bay !== bay) return;
    setNoteText(bay, recordingText(Math.round(take.session.elapsedMs() / 1000)));
  }, 1000);
  setBayState(bay, 'recording', recordingText(0));
}

function stopRecording() {
  take?.session?.stop();
}

/**
 * 建瓶 → 传段 → 跳转。瓶 id 记在 `take.bottleId`：失败重试时它已非空，
 * 于是**跳过建瓶**只重传段（否则每次重试都会多出一只空瓶）。
 */
async function submit(bay, song) {
  const current = take;
  if (current === null || current.blob === null) return;
  setBayState(bay, 'uploading', TEXT.uploading);
  try {
    if (current.bottleId === null) {
      const bottle = await post(BOTTLES_ENDPOINT, { songId: song.id });
      const id = bottle?.id ?? null;
      if (typeof id !== 'string' || id === '') {
        setBayState(bay, 'failed', '发起失败：服务端没有返回瓶子 id。', TEXT.retryCreate);
        return;
      }
      current.bottleId = id;
    }
    const bottleId = current.bottleId;
    await postAudio(segmentsEndpoint(bottleId), current.blob, { durationMs: current.durationMs });
    setNoteText(bay, TEXT.uploaded);
    location.assign(`/bottle.html?id=${encodeURIComponent(bottleId)}`);
  } catch (error) {
    // 业务错误照原样显示服务端 message（本页不重写它的文案）。
    const retryLabel = current.bottleId === null ? TEXT.retryCreate : TEXT.retryUpload;
    setBayState(bay, 'failed', error.message, retryLabel);
    if (error?.isServiceDown === true) showWaking(null, { onRetry: () => void submit(bay, song) });
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
  endpoints: ['GET /api/songs', 'POST /api/bottles', 'POST /api/bottles/:id/segments'],
  note: '曲库/计数/盆位接真数据；录制 → 建瓶 → 传这一段 → 跳 bottle.html',
  init: wire,
});
