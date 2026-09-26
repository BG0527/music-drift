/**
 * 页面模块：`site/new.html`（W1-a 接线）
 *
 * 端点：
 *   - `GET /api/songs`（裸数组，见 `packages/shared/src/contracts/songs.ts`）→ 替换页面的 5 条演示曲目；
 *   - `POST /api/bottles`（请求体 `{ songId }`，见 `bottles.ts` 的 `CreateBottleRequestSchema`）
 *     → 发起成功 → `/bottle.html?id=<新瓶 id>`。
 *
 * 本文件**不改 HTML**（`site/*.html` 是发布副本，由 `tools/sync-site.mjs` 生成）：
 *   - 卡片：克隆页面第 1 格（`.bay`）当模板，位置/盆沿错位照抄页面各格自己的 inline style；
 *   - 干盆说明：克隆页面第 2 格那行 `.note`（原文「这首还没有切分，暂不能发起」）；
 *   - 盆（SVG）：克隆页面自己画好的「有水位」与「干盆」两组 `<g>`，按各格的 `transform` 摆回去
 *     —— 设计稿的语义是「盆里的水位＝这首已切好的段位」，所以盆必须跟着数据走；
 *   - 文本一律 `textContent`，不拼 HTML。
 *
 * 未接部分（已在页面上如实标注）：录音只留在本机内存，**没有上传**
 *   —— 段上传是 `POST /api/bottles/:id/segments`（原始二进制 body，本页任务未授权；
 *   共享层 `api.js` 也没有二进制通道），归 W1-b 的 `bottle.html`。
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
/** 每段时长区间（`RecordSegmentRequestSchema.durationMs`：15–30 秒）。 */
const SEGMENT_SECONDS = '15–30';
const TEXT = {
  checking: '正在确认登录状态…',
  requesting: '正在请求麦克风…',
  stop: '停止录音',
  submit: '发起这支瓶子',
  retry: '重试发起',
  uploading: '上传中：正在发起这支瓶子…',
};

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

function setBayState(bay, state, text) {
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
    setActLabel(act, TEXT.retry);
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
  return `已录 ${seconds} 秒 · 点「${TEXT.submit}」建瓶；录音仍在本机、尚未上传。`;
}

function micErrorMessage(error) {
  const name = error?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '麦克风被拒绝：允许本站使用麦克风后再试。';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到可用的麦克风。';
  if (name === 'NotReadableError') return '麦克风被其他程序占用了，关掉它再试。';
  return `麦克风不可用：${error?.message ?? '未知原因'}`;
}

function releaseStream(stream) {
  try {
    stream?.getTracks().forEach((track) => track.stop());
  } catch {
    /* 释放失败不影响状态机 */
  }
}

function abortTake() {
  if (take === null) return;
  if (take.ticker !== null) clearInterval(take.ticker);
  releaseStream(take.stream);
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

  if (navigator.mediaDevices?.getUserMedia === undefined) {
    setBayState(bay, 'failed', '录音只在 localhost 或 https 下可用（当前地址不满足）。');
    return;
  }
  setNoteText(bay, TEXT.requesting);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    setBayState(bay, 'failed', micErrorMessage(error));
    return;
  }

  let recorder;
  try {
    recorder = new MediaRecorder(stream);
  } catch (error) {
    releaseStream(stream);
    setBayState(bay, 'failed', `这个浏览器不能录音：${error?.message ?? 'MediaRecorder 不可用'}`);
    return;
  }

  take = { bay, song, stream, recorder, chunks: [], startedAt: Date.now(), ticker: null, blob: null, durationMs: 0 };
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data !== null && event.data.size > 0) take?.chunks.push(event.data);
  });
  recorder.addEventListener('stop', () => {
    if (take === null) return;
    const durationMs = Date.now() - take.startedAt;
    if (take.ticker !== null) clearInterval(take.ticker);
    releaseStream(take.stream);
    take.durationMs = durationMs;
    take.blob = new Blob(take.chunks, { type: recorder.mimeType || 'audio/webm' });
    take.stream = null;
    take.recorder = null;
    setBayState(bay, 'recorded', recordedText(durationMs));
  });

  recorder.start();
  take.ticker = setInterval(() => {
    if (take === null || take.bay !== bay) return;
    setNoteText(bay, recordingText(Math.round((Date.now() - take.startedAt) / 1000)));
  }, 1000);
  setBayState(bay, 'recording', recordingText(0));
}

function stopRecording() {
  if (take === null || take.recorder === null) return;
  take.recorder.stop();
}

async function submit(bay, song) {
  if (take === null || take.blob === null) return;
  setBayState(bay, 'uploading', TEXT.uploading);
  try {
    const bottle = await post(BOTTLES_ENDPOINT, { songId: song.id });
    const id = bottle?.id ?? null;
    if (typeof id !== 'string' || id === '') {
      setBayState(bay, 'failed', '发起失败：服务端没有返回瓶子 id。');
      return;
    }
    location.assign(`/bottle.html?id=${encodeURIComponent(id)}`);
  } catch (error) {
    setBayState(bay, 'failed', `发起失败：${error.message}`);
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
  endpoints: ['GET /api/songs', 'POST /api/bottles'],
  note: '曲库/计数/盆位接真数据；录音只在本机，段上传归 bottle.html',
  init: wire,
});
