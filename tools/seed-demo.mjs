/**
 * 演示账号种子（W3）—— 让「我的」/me.html 与公海 `/sea.html` **有内容**。
 *
 * 为什么需要它（`docs/deploy-plan-html.md` §11.3）：接线全部通了，但演示库里 `notifications`
 * 是 0 行、演示账号也没有收藏/徽章 ⇒ 评委用一个新账号进来，「我的」页看起来像没做完。
 *
 * 本脚本只走**公开 API**（`apps/api` 的 HTTP 端点），不写 SQL、不 import 后端代码：
 *   - 建号：`POST /api/auth/register`（201）/ `POST /api/auth/login`（200，已存在时）；
 *   - 建瓶与录音：`POST /api/bottles`、`POST /api/bottles/:id/segments`（原始二进制 + `x-audio-duration-ms`）；
 *   - 补段：`POST /api/sea/:id/targeted-segment`（公海未完成作品指定接唱，**确定性**，不依赖河道随机）；
 *   - 入海：`POST /api/bottles/:id/resolution`；
 *   - 收藏：`POST /api/collections/:bottleId`；只读：`/api/me/*`、`/api/notifications`、`/api/songs`、`/api/sea`。
 *
 * 幂等口径 = **声明式保证**（重复跑不堆数据）：
 *   目标是「演示账号在『我的』页三块面板都非空，且至少有一条未读通知」。每次运行先读现状，
 *   只补缺的那一项 —— 连跑两次（状态已满足）第二次**什么都不建**。
 *   唯一的例外是「未读通知」：`POST /api/notifications/:id/read` 之外后端**没有**"标记未读"的端点，
 *   而被 W3 走查消费掉之后它就空了 ⇒ 那时本脚本再造一支"演示账号参与、最终完整入海"的新瓶子
 *   （这是**唯一**能从公开 API 造出未读通知的路径：BOTTLE_COMPLETED 通知只发给当时的参与者）。
 *
 * 音频字节：Node 里没有 `MediaRecorder` ⇒ 这里上传**合成的 WebM 容器**（文件头是 EBML 魔数
 * `1A 45 DF A3`，其余是确定性伪随机字节）。它能通过服务端的**容器嗅探 + 时长**两道守门人，
 * 但它**不是可解码的音频**（`<audio>` 放不出声）。真实可播放的音频由 `tools/walkthrough.mjs`
 * 用真 `MediaRecorder` 产出并写进它的那支瓶子。这一点在 `docs/site-runbook.md` 里如实标注。
 *
 * 用法：
 *   node tools/seed-demo.mjs                 # 对 http://127.0.0.1:8787 施种（默认）
 *   node tools/seed-demo.mjs --base=http://127.0.0.1:5173   # 也可以经站点服务器的同源反代
 */
/* eslint-disable no-console */
import { pathToFileURL } from 'node:url';

/** 演示账号（口令写进 `docs/site-runbook.md`；评委用它登录看「我的」页）。 */
export const DEMO = Object.freeze({
  handle: 'demo',
  email: 'demo@example.com',
  password: 'SeaDrift2026',
});

/**
 * 陪练账号：一个瓶子要 4 段、而内核禁止同一人在同一瓶子里唱两次（`CANNOT_RECORD_TWICE_IN_BOTTLE`），
 * 所以"完整入海的作品"至少需要 4 个不同的人。它们没有别的用途，也不该被评委用。
 */
export const RELAYS = Object.freeze([
  Object.freeze({ handle: 'driftmate1', email: 'driftmate1@example.com', password: 'SeaDrift2026' }),
  Object.freeze({ handle: 'driftmate2', email: 'driftmate2@example.com', password: 'SeaDrift2026' }),
  Object.freeze({ handle: 'driftmate3', email: 'driftmate3@example.com', password: 'SeaDrift2026' }),
]);

export const DEFAULT_BASE = process.env['MDB_API_BASE'] ?? 'http://127.0.0.1:8787';

/** 合成段的字节数：够过"体积 > 0"，又远小于 4 MB 上限。 */
const SEGMENT_BYTES = 4096;
const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

/**
 * 合成一个 WebM 容器（**不是真音频**，见文件头说明）。
 * @param {number} [bytes]
 * @returns {Uint8Array}
 */
export function synthesizeSegmentBytes(bytes = SEGMENT_BYTES) {
  const out = new Uint8Array(Math.max(4, bytes));
  out.set(EBML_MAGIC, 0);
  let state = 0x9e3779b9;
  for (let index = 4; index < out.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[index] = state & 0xff;
  }
  return out;
}

/** 极简 cookie 会话客户端（只用 `node:http` 的 fetch，无依赖）。一次请求一个实例。 */
export function createApiClient(base = DEFAULT_BASE) {
  const origin = base.replace(/\/+$/, '');
  let cookie = null;
  return {
    base: origin,
    get cookie() {
      return cookie;
    },
    /** 从浏览器上下文里借一条会话（走查脚本用：页面登录后把 cookie 交给本客户端做断言）。 */
    useCookie(value) {
      cookie = value === '' ? null : value;
    },
    /**
     * @param {'GET'|'POST'|'DELETE'} method
     * @param {string} path
     * @param {{ json?: unknown, raw?: Uint8Array, contentType?: string,
     *           headers?: Record<string,string> }} [options]
     */
    async request(method, path, options = {}) {
      const { json, raw, contentType, headers = {} } = options;
      const outgoing = { ...headers };
      let body;
      if (json !== undefined) {
        outgoing['content-type'] = 'application/json';
        body = JSON.stringify(json);
      } else if (raw !== undefined) {
        outgoing['content-type'] = contentType ?? 'application/octet-stream';
        body = raw;
      }
      if (cookie !== null) outgoing.cookie = cookie;
      const response = await fetch(`${origin}${path}`, { method, headers: outgoing, body });
      for (const line of response.headers.getSetCookie()) {
        const pair = line.split(';')[0] ?? '';
        if (pair.startsWith('mdb_session=')) cookie = pair;
      }
      const text = await response.text();
      let parsed = null;
      if (text !== '') {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }
      return { status: response.status, body: parsed, text };
    },
  };
}

function expect(response, statuses, what) {
  if (!statuses.includes(response.status)) {
    const message = response.body?.error?.message ?? response.text.slice(0, 200);
    throw new Error(`${what} 失败：HTTP ${String(response.status)} ${message}`);
  }
  return response.body;
}

async function call(client, method, path, options, statuses, what) {
  return expect(await client.request(method, path, options), statuses, what);
}

/**
 * 建号或登录（幂等）：注册成功即已登录；已存在则用同一口令登录。
 * @returns {Promise<'created'|'existing'>}
 */
async function ensureSession(client, account) {
  const registered = await client.request('POST', '/api/auth/register', {
    json: { handle: account.handle, email: account.email, password: account.password },
  });
  if (registered.status === 201) return 'created';
  if (registered.status !== 409) {
    expect(registered, [201], `注册 ${account.handle}`);
  }
  const logged = await client.request('POST', '/api/auth/login', {
    json: { email: account.email, password: account.password },
  });
  if (logged.status !== 200) {
    throw new Error(
      `账号 ${account.handle} 已存在但登录失败（HTTP ${String(logged.status)}）。` +
        `若它的口令被改过，请先删掉该账号（或换一个 handle/email 再跑）：` +
        `docker exec music-drift-postgres psql -U music_drift -d music_drift -c "delete from users where handle = '${account.handle}'"`,
    );
  }
  return 'existing';
}

async function listSongs(client) {
  const songs = await call(client, 'GET', '/api/songs', {}, [200], '读曲库');
  /**
   * 只挑**已切分**的歌：`song_segments` 没有预设段落的曲目在 `/new.html` 上是"干盆"（不能发起），
   * 上传时服务端也会以 `AUDIO_SEGMENT_PRESET_MISSING` fail-closed。演示库里有别的曲目（如用户上传的），
   * 不能因为"库里存在一首没切分的歌"就让施种失败。
   */
  const usable = (Array.isArray(songs) ? songs : []).filter(
    (song) => Array.isArray(song.segments) && song.segments.length > 0,
  );
  if (usable.length === 0) {
    throw new Error('曲库里没有已切分的曲目：先跑 `pnpm --filter @music-drift/api db:seed`（3 首占位曲 × 4 段）');
  }
  return usable;
}

function presetFor(song, index) {
  const segment = song.segments.find((candidate) => candidate.index === index);
  if (segment === undefined || !(segment.durationMs > 0)) {
    throw new Error(`曲目《${String(song.title)}》第 ${String(index)} 段没有预设时长`);
  }
  return segment.durationMs;
}

/** 传一段（原始二进制协议：`content-type` 就是音频 MIME、时长走 `x-audio-duration-ms`）。 */
async function uploadSegment(client, bottleId, durationMs, what) {
  return call(
    client,
    'POST',
    `/api/bottles/${encodeURIComponent(bottleId)}/segments`,
    {
      raw: synthesizeSegmentBytes(),
      contentType: 'audio/webm',
      headers: { 'x-audio-duration-ms': String(Math.round(durationMs)) },
    },
    [201],
    what,
  );
}

/**
 * 往一支已有瓶子里塞一段**合成容器**（EBML 魔数，不可解码）。
 * 走查脚本在"环境给不出假麦克风"时用它做降级，并会在输出里明确标注降级。
 */
export async function uploadSyntheticSegment(client, bottleId, durationMs) {
  return uploadSegment(client, bottleId, durationMs, '上传合成段（降级路径）');
}

/** 建瓶 + 录第 1 段（发起者路径）。返回 `{ bottleId, index }`。 */
async function openBottleWithFirstSegment(client, song) {
  const created = await call(client, 'POST', '/api/bottles', { json: { songId: song.id } }, [201], '建瓶');
  const bottleId = created?.id;
  if (typeof bottleId !== 'string' || bottleId === '') {
    throw new Error('建瓶失败：服务端没有返回瓶子 id');
  }
  const uploaded = await uploadSegment(client, bottleId, presetFor(song, 1), '上传第 1 段');
  return { bottleId, index: Number(uploaded.index) };
}

/** 指定接唱（只对公海**未完成**作品开放）：把下一段交给某个账号录。 */
async function takeTargetedSegment(client, bottleId) {
  return call(
    client,
    'POST',
    `/api/sea/${encodeURIComponent(bottleId)}/targeted-segment`,
    {},
    [200],
    '指定接唱',
  );
}

async function chooseResolution(client, bottleId, resolution) {
  return call(
    client,
    'POST',
    `/api/bottles/${encodeURIComponent(bottleId)}/resolution`,
    { json: { resolution } },
    [200],
    `选去向 ${resolution}`,
  );
}

async function detailOf(client, bottleId) {
  return call(client, 'GET', `/api/bottles/${encodeURIComponent(bottleId)}`, {}, [200], '读瓶子详情');
}

/**
 * 造一支「演示账号参与、最终**完整并入海**」的作品。
 *
 * 路径全部是确定性的（不依赖 `POST /api/river/draw` 的随机性）：
 *   陪练1 建瓶 + 录第 1 段 → 入海（此刻未完成，落在公海未完成区）
 *   → 陪练2 / 演示账号 / 陪练3 依此「指定接唱 → 录下一段 → 入海」
 *   → 最后一位补齐第 4 段并选入海 ⇒ 内核判定完整 ⇒ 给**全部参与者**发 `BOTTLE_COMPLETED`
 *     （演示账号因此拿到未读通知），同时它作为接唱者拿到 `DRIFT_PARTICIPANT` 徽章。
 *
 * @returns {Promise<string>} bottleId
 */
async function buildCompletedSeaBottle(clients, song, log) {
  const [first, second, demo, last] = clients;
  const created = await openBottleWithFirstSegment(first, song);
  await chooseResolution(first, created.bottleId, 'SEA');
  log(`  建瓶 ${created.bottleId.slice(0, 8)}…（《${String(song.title)}》），第 1 段已录并入海`);

  for (const [actor, label] of [
    [second, '陪练2'],
    [demo, '演示账号'],
    [last, '陪练3'],
  ]) {
    const taken = await takeTargetedSegment(actor, created.bottleId);
    const index = Number(taken.missingSegmentIndexes?.[0] ?? 0);
    await uploadSegment(actor, created.bottleId, presetFor(song, index), `${label} 录第 ${String(index)} 段`);
    await chooseResolution(actor, created.bottleId, 'SEA');
    log(`  ${label} 补齐第 ${String(index)} 段并入海`);
  }

  const sea = await call(client0(clients), 'GET', `/api/sea/${encodeURIComponent(created.bottleId)}`, {}, [200], '读公海详情');
  if (sea.seaZone !== 'COMPLETED') {
    throw new Error(`作品没有落到公海已完成区（seaZone=${String(sea.seaZone)}）`);
  }
  return created.bottleId;
}

/** 取第 0 个客户端（只用于只读查询，谁问都一样）。 */
function client0(clients) {
  return clients[0];
}

/** 演示账号自己发起、投河后**留在河道**的瓶子（「我的」页要能看到"漂流中"的那一支）。 */
async function buildRiverBottle(demo, song, log) {
  const created = await openBottleWithFirstSegment(demo, song);
  await chooseResolution(demo, created.bottleId, 'RIVER');
  log(`  演示账号发起 ${created.bottleId.slice(0, 8)}…（《${String(song.title)}》）并投河（河道中）`);
  return created.bottleId;
}

function countUnread(notifications) {
  return notifications.filter((row) => row.readAt === null).length;
}

/**
 * 声明式施种：把「我的」页需要的三块内容补齐（幂等）。
 *
 * @param {{ base?: string, log?: (line: string) => void }} [options]
 * @returns {Promise<{ account: typeof DEMO, participated: number, completedSea: number,
 *                     inRiver: number, collections: number, badges: number,
 *                     notifications: number, unread: number, actions: string[] }>}
 */
export async function ensureDemoData(options = {}) {
  const base = options.base ?? DEFAULT_BASE;
  const log = options.log ?? (() => {});
  const actions = [];

  const demo = createApiClient(base);
  const relays = RELAYS.map(() => createApiClient(base));

  const demoState = await ensureSession(demo, DEMO);
  const relayStates = [];
  for (const [index, client] of relays.entries()) {
    relayStates.push(await ensureSession(client, RELAYS[index]));
  }
  log(
    `账号：${DEMO.handle}（${demoState === 'created' ? '新建' : '已存在'}）；` +
      `陪练：${RELAYS.map((relay, index) => `${relay.handle}(${relayStates[index]})`).join('、')}`,
  );

  const songs = await listSongs(demo);

  /** 现状：我参与过的瓶子 / 通知 / 收藏 / 徽章。 */
  async function snapshot() {
    const bottles = await call(demo, 'GET', '/api/me/bottles', {}, [200], '读我的漂流瓶');
    const notifications = await call(demo, 'GET', '/api/notifications', {}, [200], '读通知');
    const collections = await call(demo, 'GET', '/api/me/collections', {}, [200], '读收藏');
    const badges = await call(demo, 'GET', '/api/me/badges', {}, [200], '读徽章');
    return { items: bottles.items ?? [], notifications: notifications.items ?? [], collections, badges };
  }

  let state = await snapshot();
  const completedSea = () =>
    state.items.find(
      (item) => item.status === 'SEA' && item.seaZone === 'COMPLETED' && item.mySegmentIndexes.length > 0,
    ) ?? null;
  const riverItem = () =>
    state.items.find(
      (item) => item.role === 'INITIATOR' && (item.status === 'IN_RIVER' || item.status === 'HELD'),
    ) ?? null;

  // ① 至少一支「我参与过、已完整入海」的作品（= 徽章与通知的来源）
  let seaBottleId = completedSea()?.id ?? null;
  if (seaBottleId === null) {
    seaBottleId = await buildCompletedSeaBottle([relays[0], relays[1], demo, relays[2]], songs[0], log);
    actions.push('造了一支完整入海的作品（演示账号为接唱者）');
    state = await snapshot();
  }

  // ② 至少一支「我发起、还在河道」的作品
  if (riverItem() === null) {
    await buildRiverBottle(demo, songs[1], log);
    actions.push('造了一支发起后投河的瓶子（河道中）');
    state = await snapshot();
  }

  // ③ 至少一条未读通知（被走查消费掉之后才需要再造；见文件头"幂等口径"）
  if (countUnread(state.notifications) === 0) {
    const fresh = await buildCompletedSeaBottle([relays[0], relays[1], demo, relays[2]], songs[2], log);
    actions.push(`再造一支完整入海的作品 ${fresh.slice(0, 8)}…（补回未读通知）`);
    state = await snapshot();
  }

  // ④ 至少一件收藏（只对「已完成并进入公海」的作品开放）
  if (state.collections.length === 0) {
    const target = completedSea()?.id ?? seaBottleId;
    await call(demo, 'POST', `/api/collections/${encodeURIComponent(target)}`, {}, [201], '收藏作品');
    actions.push('收藏了一支完整作品');
    state = await snapshot();
  }

  const unread = countUnread(state.notifications);
  const result = {
    account: DEMO,
    participated: state.items.length,
    completedSea: state.items.filter((item) => item.status === 'SEA' && item.seaZone === 'COMPLETED').length,
    inRiver: state.items.filter((item) => item.status === 'IN_RIVER' || item.status === 'HELD').length,
    collections: state.collections.length,
    badges: state.badges.length,
    notifications: state.notifications.length,
    unread,
    actions,
    seaBottleId,
  };

  if (result.completedSea < 1 || result.inRiver < 1 || result.collections < 1 || result.badges < 1) {
    throw new Error(`施种后仍未满足「我的」页非空：${JSON.stringify(result)}`);
  }
  if (unread < 1) {
    throw new Error('施种后仍没有未读通知：通知的未读态无法从公开 API 造出来（见文件头说明）');
  }
  return result;
}

function parseArgs(argv) {
  const args = new Map();
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args.set(key, value ?? 'true');
  }
  return args;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const base = args.get('base') ?? DEFAULT_BASE;
  try {
    const result = await ensureDemoData({ base, log: (line) => console.log(line) });
    console.log('');
    console.log(`演示账号：${result.account.handle} / ${result.account.email} / ${result.account.password}`);
    console.log(
      `  「我的」页内容：参与过 ${String(result.participated)} 支` +
        `（完整入海 ${String(result.completedSea)} · 河道/持有中 ${String(result.inRiver)}）` +
        ` · 收藏 ${String(result.collections)} · 徽章 ${String(result.badges)}` +
        ` · 通知 ${String(result.notifications)}（未读 ${String(result.unread)}）`,
    );
    console.log(
      result.actions.length === 0
        ? '  本次没有新增任何数据（幂等：状态已满足）'
        : `  本次新增：${result.actions.join('；')}`,
    );
    console.log(`  接口基址：${base}`);
    process.exit(0);
  } catch (error) {
    console.error(`seed-demo 失败：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
