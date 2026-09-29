/**
 * 演示账号种子（W3）—— 让「我的」/me.html 与公海 `/sea.html` **有内容**。
 *
 * 为什么需要它（`docs/deploy-plan-html.md` §11.3）：接线全部通了，但演示库里 `notifications`
 * 是 0 行、演示账号也没有收藏/通知 ⇒ 评委用一个新账号进来，「我的」页看起来像没做完。
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
 * 音频字节（W8 起）：上传的是 **`tools/fixtures/demo-segment.webm` 里的真 WebM/Opus**
 * （无头 Chromium 假麦克风 + 真 `MediaRecorder` 录出来的，由 `node tools/record-fixture.mjs` 生成，
 * 浏览器能解码、点「试听」真的出声）。Node 里没有 `MediaRecorder`，所以字节**离线录一次、随仓复用**：
 * fixture 缺失时本脚本**直接报错**并给出重建命令，**不会**退回旧的"魔数 + 伪随机字节"合成容器
 * ——那正是 W8 要消灭的哑音频（`DEMUXER_ERROR_COULD_NOT_OPEN`）。
 * 施种末尾还会回读演示账号自己的每一段做**形态自检**（真 WebM 必有 DocType `webm` 与 CodecID
 * `A_OPUS`）；若库里还留着旧合成段，就用 `--print-repair-sql` 打出的 SQL 换掉它（见下面的
 * `repairSyntheticAudioSql`）。
 *
 * 用法：
 *   node tools/seed-demo.mjs                 # 对 http://127.0.0.1:8788 施种（默认）
 *   node tools/seed-demo.mjs --base=http://127.0.0.1:5173   # 也可以经站点服务器的同源反代
 *   node tools/seed-demo.mjs --print-repair-sql             # 只打印"把旧合成段换成真音频"的 SQL
 */
/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { DEFAULT_FIXTURE } from './record-fixture.mjs';

/** 演示账号（口令写进 `docs/site-runbook.md`；评委用它登录看「我的」页）。 */
export const DEMO = Object.freeze({
  handle: 'demo',
  password: 'SeaDrift2026',
});

/**
 * 陪练账号：一个瓶子要 4 段、而内核禁止同一人在同一瓶子里唱两次（`CANNOT_RECORD_TWICE_IN_BOTTLE`），
 * 所以"完整入海的作品"至少需要 4 个不同的人。它们没有别的用途，也不该被评委用。
 */
export const RELAYS = Object.freeze([
  Object.freeze({ handle: 'driftmate1', password: 'SeaDrift2026' }),
  Object.freeze({ handle: 'driftmate2', password: 'SeaDrift2026' }),
  Object.freeze({ handle: 'driftmate3', password: 'SeaDrift2026' }),
]);

export const DEFAULT_BASE = process.env['MDB_API_BASE'] ?? 'http://127.0.0.1:8788';

/** 段音频 fixture：真 WebM/Opus，由 `node tools/record-fixture.mjs` 录制（见 `tools/fixtures/README.md`）。 */
export const SEGMENT_FIXTURE = DEFAULT_FIXTURE;

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

/**
 * 真 WebM/Opus 的形态判据（不是"能过服务端嗅探"就算数）：
 * EBML 魔数 + DocType `webm` + CodecID `A_OPUS`。旧合成容器只有魔数，两串都搜不到。
 * @param {Uint8Array} bytes
 * @returns {{ ok: boolean, reason: string }}
 */
export function inspectSegmentAudio(bytes) {
  if (bytes.length < 8) return { ok: false, reason: `字节太少（${String(bytes.length)}）` };
  const magicOk = EBML_MAGIC.every((byte, position) => bytes[position] === byte);
  if (!magicOk) return { ok: false, reason: '不是 EBML（文件头不是 1A 45 DF A3）' };
  const text = Buffer.from(bytes).toString('latin1');
  const hasWebm = text.includes('webm');
  const hasOpus = text.includes('A_OPUS');
  if (!hasWebm || !hasOpus) {
    return { ok: false, reason: `EBML 里没有 DocType webm/A_OPUS（webm=${String(hasWebm)} opus=${String(hasOpus)}）` };
  }
  return { ok: true, reason: `真 WebM/Opus（${String(bytes.length)} 字节）` };
}

let cachedAudio = null;

/**
 * 读 fixture 并做形态自检（读不到/不像真音频就抛，绝不静默降级）。
 * @param {string} [path]
 * @returns {{ path: string, bytes: Uint8Array }}
 */
export function loadSegmentAudio(path = SEGMENT_FIXTURE) {
  if (cachedAudio !== null && cachedAudio.path === path) return cachedAudio;
  let bytes;
  try {
    bytes = new Uint8Array(readFileSync(path));
  } catch {
    throw new Error(
      `找不到段音频 fixture：${path}\n` +
        '  它是 seed 上传的**真音频**（旧的合成容器已废弃）。先录一份：\n' +
        '    node tools/record-fixture.mjs\n' +
        `  或用 --fixture=<path> 指定别的真 WebM/Opus 文件。`,
    );
  }
  const verdict = inspectSegmentAudio(bytes);
  if (!verdict.ok) {
    throw new Error(`fixture ${path} 不是可解码的 WebM/Opus：${verdict.reason}（重录：node tools/record-fixture.mjs --force）`);
  }
  cachedAudio = { path, bytes };
  return cachedAudio;
}

/**
 * 把**旧合成段**（W8 之前 seed 上传的"EBML 魔数 + 伪随机/零填充"，浏览器解不开）换成真音频。
 *
 * 定位三重条件（缺一不可，避免误伤其它 agent 的探针数据）：
 *   ① 瓶子由 seed 建的账号发起（`demo` / `driftmate1..3`）；
 *   ② 段字节数∈ {4096, 8192}（旧合成体的体量；真 fixture 是 ~321 KB）；
 *   ③ 字节里没有 DocType `webm` ⇒ 确实是假容器。
 * **可重跑**：第二次执行匹配 0 行。
 *
 * 需要先把 fixture 放进数据库容器（`pg_read_binary_file` 读的是**服务端文件系统**）：
 *   node tools/record-fixture.mjs
 *   docker cp tools/fixtures/demo-segment.webm music-drift-postgres:/tmp/mdb-demo-segment.webm
 *   node tools/seed-demo.mjs --print-repair-sql | docker exec -i music-drift-postgres psql -U music_drift -d music_drift -f -
 *
 * @param {string} [containerPath] fixture 在数据库容器里的路径
 * @returns {string} 可整段执行的 SQL
 */
export function repairSyntheticAudioSql(containerPath = '/tmp/mdb-demo-segment.webm') {
  return [
    '-- W8：把 seed 产的旧合成段（EBML 魔数 + 伪随机字节，浏览器 DEMUXER_ERROR_COULD_NOT_OPEN）',
    '-- 换成真 WebM/Opus fixture。定位三重条件：seed 账号发起 + 4096/8192 字节 + 无 webm DocType。',
    '-- 可重跑：第二次执行匹配 0 行。其它 agent 的探针数据不在范围内（不要放宽 handle 条件）。',
    'BEGIN;',
    '\\echo 将要替换的段数：',
    'SELECT count(*) AS synthetic_segments',
    'FROM   bottle_segments AS s',
    'JOIN   bottles AS b ON b.id = s.bottle_id',
    'JOIN   users   AS u ON u.id = b.initiator_id',
    'WHERE  u.handle IN (\'demo\', \'driftmate1\', \'driftmate2\', \'driftmate3\')',
    '  AND  octet_length(s.audio) IN (4096, 8192)',
    '  AND  position(\'webm\' in encode(s.audio, \'escape\')) = 0;',
    'UPDATE bottle_segments AS s',
    `SET    audio = pg_read_binary_file('${containerPath}'), audio_mime = 'audio/webm'`,
    'FROM   bottles AS b',
    'JOIN   users   AS u ON u.id = b.initiator_id',
    'WHERE  b.id = s.bottle_id',
    '  AND  u.handle IN (\'demo\', \'driftmate1\', \'driftmate2\', \'driftmate3\')',
    '  AND  octet_length(s.audio) IN (4096, 8192)',
    '  AND  position(\'webm\' in encode(s.audio, \'escape\')) = 0;',
    'COMMIT;',
    '',
  ].join('\n');
}

/**
 * 回读**演示账号自己**的每一段做形态自检（W8 收口）：发现假容器就报错并给可重跑的修复 SQL。
 * 只查 seed 数据，不碰别人的探针段（那句 SQL 的 handle 白名单同上）。
 */
async function assertSeededAudioReal(client, items, log) {
  const offenders = [];
  let checked = 0;
  for (const item of items) {
    if (!Array.isArray(item.mySegmentIndexes) || item.mySegmentIndexes.length === 0) continue;
    const detail = await detailOf(client, item.id);
    const segments = (detail?.segments ?? []).filter(
      (segment) => segment.isMine && item.mySegmentIndexes.includes(segment.index),
    );
    for (const segment of segments) {
      checked += 1;
      const bytes = await fetchSegmentBytes(client, segment.id);
      const verdict = inspectSegmentAudio(bytes);
      if (!verdict.ok) offenders.push(`${item.id.slice(0, 8)}… 第 ${String(segment.index)} 段（${verdict.reason}）`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `演示账号的 ${String(offenders.length)}/${String(checked)} 段不是可解码音频：${offenders.join('、')}\n` +
        '  用下面三步换成真 fixture（幂等，可重跑）：\n' +
        '    node tools/record-fixture.mjs\n' +
        '    docker cp tools/fixtures/demo-segment.webm music-drift-postgres:/tmp/mdb-demo-segment.webm\n' +
        '    node tools/seed-demo.mjs --print-repair-sql | docker exec -i music-drift-postgres psql -U music_drift -d music_drift -f -',
    );
  }
  log(`音频自检：演示账号的 ${String(checked)} 段全部是可解码的真 WebM/Opus`);
  return checked;
}

/** 拉段音频的原始字节（`createApiClient.request` 只解析 json/text，二进制要走这一条）。 */
async function fetchSegmentBytes(client, segmentId) {
  const headers = client.cookie === null ? {} : { cookie: client.cookie };
  const response = await fetch(`${client.base}/api/segments/${encodeURIComponent(segmentId)}/audio`, { headers });
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`读段音频失败：HTTP ${String(response.status)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
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
    json: { account: account.handle, password: account.password },
  });
  if (registered.status === 201) return 'created';
  if (registered.status !== 409) {
    expect(registered, [201], `注册 ${account.handle}`);
  }
  const logged = await client.request('POST', '/api/auth/login', {
    json: { account: account.handle, password: account.password },
  });
  if (logged.status !== 200) {
    throw new Error(
      `账号 ${account.handle} 已存在但登录失败（HTTP ${String(logged.status)}）。` +
        `若它的密码被改过，请先删掉该账号（或换一个 account 再跑）：` +
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
async function uploadSegment(client, bottleId, durationMs, what, fixture) {
  return call(
    client,
    'POST',
    `/api/bottles/${encodeURIComponent(bottleId)}/segments`,
    {
      raw: loadSegmentAudio(fixture).bytes,
      contentType: 'audio/webm',
      headers: { 'x-audio-duration-ms': String(Math.round(durationMs)) },
    },
    [201],
    what,
  );
}

/**
 * 往一支已有瓶子里塞一段**真音频**（内置 fixture，不经浏览器录制）。
 *
 * 名字里的 "Synthetic" 是 W8 之前的历史遗留：那时这条路径上传合成容器（见文件头说明），
 * 走查脚本（`tools/walkthrough.mjs`，归 W7）在环境给不出假麦克风时调用它做"降级"。
 * W8 起它上传的是**真 WebM/Opus**——降级只是"不录、用内置真音频"，不再是"用假音频"。
 */
export async function uploadSyntheticSegment(client, bottleId, durationMs) {
  return uploadSegment(client, bottleId, durationMs, '上传内置真音频段（跳过浏览器录制）');
}

/** 建瓶 + 录第 1 段（发起者路径）。返回 `{ bottleId, index }`。 */
async function openBottleWithFirstSegment(client, song, fixture) {
  const created = await call(client, 'POST', '/api/bottles', { json: { songId: song.id } }, [201], '建瓶');
  const bottleId = created?.id;
  if (typeof bottleId !== 'string' || bottleId === '') {
    throw new Error('建瓶失败：服务端没有返回瓶子 id');
  }
  const uploaded = await uploadSegment(client, bottleId, presetFor(song, 1), '上传第 1 段', fixture);
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
 *     （演示账号因此拿到未读通知），同时它作为接唱者留下漂流参与记录。
 *
 * @returns {Promise<string>} bottleId
 */
async function buildCompletedSeaBottle(clients, song, log, fixture) {
  const [first, second, demo, last] = clients;
  const created = await openBottleWithFirstSegment(first, song, fixture);
  await chooseResolution(first, created.bottleId, 'SEA');
  log(`  建瓶 ${created.bottleId.slice(0, 8)}…（《${String(song.title)}》），第 1 段已录并入海`);

  for (const [actor, label] of [
    [second, '陪练2'],
    [demo, '演示账号'],
    [last, '陪练3'],
  ]) {
    const taken = await takeTargetedSegment(actor, created.bottleId);
    const index = Number(taken.missingSegmentIndexes?.[0] ?? 0);
    await uploadSegment(actor, created.bottleId, presetFor(song, index), `${label} 录第 ${String(index)} 段`, fixture);
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
async function buildRiverBottle(demo, song, log, fixture) {
  const created = await openBottleWithFirstSegment(demo, song, fixture);
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
 * @param {{ base?: string, fixture?: string, log?: (line: string) => void }} [options]
 * @returns {Promise<{ account: typeof DEMO, participated: number, completedSea: number,
 *                     inRiver: number, collections: number,
 *                     notifications: number, unread: number, actions: string[] }>}
 */
export async function ensureDemoData(options = {}) {
  const base = options.base ?? DEFAULT_BASE;
  const fixture = options.fixture ?? SEGMENT_FIXTURE;
  const log = options.log ?? (() => {});
  const actions = [];

  /** 先读 fixture：缺了/不是真音频就在这里失败，绝不静默降级成合成容器。 */
  const audio = loadSegmentAudio(fixture);
  log(`段音频：${audio.path}（${String(audio.bytes.byteLength)} 字节，真 WebM/Opus）`);

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

  /** 现状：我参与过的瓶子 / 通知 / 收藏。 */
  async function snapshot() {
    const bottles = await call(demo, 'GET', '/api/me/bottles', {}, [200], '读我的漂流瓶');
    const notifications = await call(demo, 'GET', '/api/notifications', {}, [200], '读通知');
    const collections = await call(demo, 'GET', '/api/me/collections', {}, [200], '读收藏');
    return { items: bottles.items ?? [], notifications: notifications.items ?? [], collections };
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

  // ① 至少一支「我参与过、已完整入海」的作品（通知与参与记录的来源）
  let seaBottleId = completedSea()?.id ?? null;
  if (seaBottleId === null) {
    seaBottleId = await buildCompletedSeaBottle([relays[0], relays[1], demo, relays[2]], songs[0], log, fixture);
    actions.push('造了一支完整入海的作品（演示账号为接唱者）');
    state = await snapshot();
  }

  // ② 至少一支「我发起、还在河道」的作品
  if (riverItem() === null) {
    await buildRiverBottle(demo, songs[1], log, fixture);
    actions.push('造了一支发起后投河的瓶子（河道中）');
    state = await snapshot();
  }

  // ③ 至少一条未读通知（被走查消费掉之后才需要再造；见文件头"幂等口径"）
  if (countUnread(state.notifications) === 0) {
    const fresh = await buildCompletedSeaBottle(
      [relays[0], relays[1], demo, relays[2]],
      songs[2],
      log,
      fixture,
    );
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
    notifications: state.notifications.length,
    unread,
    actions,
    seaBottleId,
  };

  if (result.completedSea < 1 || result.inRiver < 1 || result.collections < 1) {
    throw new Error(`施种后仍未满足「我的」页非空：${JSON.stringify(result)}`);
  }
  if (unread < 1) {
    throw new Error('施种后仍没有未读通知：通知的未读态无法从公开 API 造出来（见文件头说明）');
  }
  /** W8 收口：自己造出来的数据必须**真能出声**（形态自检；发现旧合成段就报错并给可重跑 SQL）。 */
  result.audioChecked = await assertSeededAudioReal(demo, state.items, log);
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
  /** 只打印"把旧合成段换成真音频"的 SQL（可重跑），不做任何写操作。 */
  if (args.has('print-repair-sql')) {
    console.log(repairSyntheticAudioSql(args.get('container-path') ?? '/tmp/mdb-demo-segment.webm'));
    process.exit(0);
  }
  try {
    const result = await ensureDemoData({
      base,
      fixture: args.get('fixture'),
      log: (line) => console.log(line),
    });
    console.log('');
    console.log(`演示账号：${result.account.handle} / ${result.account.password}`);
    console.log(
      `  「我的」页内容：参与过 ${String(result.participated)} 支` +
        `（完整入海 ${String(result.completedSea)} · 河道/持有中 ${String(result.inRiver)}）` +
        ` · 收藏 ${String(result.collections)}` +
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
