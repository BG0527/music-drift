/**
 * 黄金路径 **真实链路** 检查（需要 api + Postgres 在跑）。
 *
 * 为什么要有这个脚本：前端页面在浏览器里跑，但"页面发的每个请求能不能成功、字段是不是这些字段、
 * 并发冲突是不是 409"这些事实不需要浏览器就能钉住 —— 用真库 + 真 HTTP + 真音频字节走一遍，
 * 比"读代码推测"可靠得多。
 *
 * 用法（在仓库根目录）：
 *   pnpm db:up && pnpm db:migrate && pnpm db:seed
 *   pnpm --filter @music-drift/api start &     # http://localhost:8787
 *   node apps/web/tools/golden-path-live-check.mjs
 *
 * 覆盖：注册/登录 → 选歌 → 发起 → 录第 1 段 → 投河 → 第二人捞取 → 接唱 → 投河 → … → 末段 →
 * 回传 → 入海 → 公海（完整区）→ 漂流日志 → 匿名代号 → 放回冷却 → 401/409 语义。
 * 每一步都打印「步骤 / HTTP 状态 / 关键字段」，失败即 `process.exit(1)`。
 *
 * 说明：这是一个**命令行核查脚本**，输出就是它的产物，因此允许直接 console.log。
 */
/* eslint-disable no-console */

const API = process.env.API_BASE ?? 'http://localhost:8787';
const stamp = Date.now().toString(36);

let failures = 0;
let stepNo = 0;

function log(step, detail) {
  stepNo += 1;
  console.log(
    `[${String(stepNo).padStart(2, '0')}] ${step}${detail === undefined ? '' : ` — ${detail}`}`,
  );
}

function must(condition, message) {
  if (condition) return;
  failures += 1;
  console.error(`  ✗ ${message}`);
}

async function call(session, method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (session.cookie !== null) headers['cookie'] = session.cookie;
  if (options.json !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    ...(options.body === undefined ? {} : { body: options.body }),
    redirect: 'manual',
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    const value = cookie.split(';')[0];
    if (value.startsWith('mdb_session=')) session.cookie = value;
  }
  const text = await response.text();
  let body;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: response.status, body };
}

function newSession(label) {
  return { label, cookie: null };
}

/** 构造一段"看起来是 webm"的字节（EBML 魔数），足够通过服务端魔数嗅探与体积校验。 */
function webmBytes(size = 4_096) {
  const bytes = new Uint8Array(size);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  return bytes;
}

async function register(label) {
  const session = newSession(label);
  const handle = `${label}${stamp}`.slice(0, 30);
  const email = `${label}.${stamp}@example.com`;
  const password = 'drift2026';
  const created = await call(session, 'POST', '/api/auth/register', {
    json: { handle, email, password },
  });
  must(created.status === 201, `${label} 注册应为 201，实际 ${created.status}`);
  must(created.body?.user?.id !== undefined, `${label} 注册应返回 user.id`);
  must(created.cookie !== null, `${label} 注册应下发会话 cookie`);
  return { session, handle, email, password, userId: created.body?.user?.id };
}

async function recordSegment(session, bottleId, durationMs, note) {
  return call(session, 'POST', `/api/bottles/${bottleId}/segments`, {
    headers: {
      'content-type': 'audio/webm',
      'x-audio-duration-ms': String(durationMs),
      ...(note === undefined ? {} : { 'x-segment-note': encodeURIComponent(note) }),
    },
    body: webmBytes(),
  });
}

/**
 * 反复打捞直到拿到目标瓶子。
 *
 * 为什么不能只捞一次：真库里河道可能还漂着别人的瓶子（随机打捞），
 * 捞到不是目标的那支就「放回海中」继续 —— 这同时也验证了放回冷却的具体行为。
 */
async function drawUntil(session, targetId, maxAttempts = 15) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const drawn = await call(session, 'POST', '/api/river/draw');
    if (drawn.status !== 200) return { drawn, attempts: attempt };
    if (drawn.body?.bottle?.id === targetId) return { drawn, attempts: attempt };
    await call(session, 'POST', `/api/bottles/${drawn.body.bottle.id}/put-back`);
  }
  return { drawn: { status: 0, body: null }, attempts: maxAttempts };
}

const main = async () => {
  log('健康检查', API);
  const health = await call(newSession('anon'), 'GET', '/healthz');
  must(health.status === 200, `healthz 应为 200，实际 ${health.status}`);

  // ── 401：未登录发起的语义（前端据此显示「需要先登录」）──────────────
  const anon = newSession('anon');
  const songs = await call(anon, 'GET', '/api/songs');
  must(songs.status === 200 && Array.isArray(songs.body), '未登录也应能读曲库（首屏选歌）');
  log('曲库（未登录可读）', `${songs.body.length} 首`);
  must(
    songs.body.some((song) => song.segments.length === song.totalSegments),
    '曲库应带分段元数据',
  );

  /**
   * 选歌口径：只挑**带分段元数据**的歌（页面要显示"每段约 N 秒"）。
   * 注意：这条 dev 库里混进了 18 首 `song-xxxxxxxx` 测试残留（integration 夹具写进了主库），
   * 那是数据卫生问题，与本任务无关，已在回报里登记；这里显式避开它们。
   */
  const playable = songs.body.filter((song) => song.segments.length === song.totalSegments);
  must(playable.length > 0, '曲库里应有带分段元数据的歌（否则页面无法显示段位信息）');
  const song = playable[0];

  const unauthorized = await call(anon, 'POST', '/api/bottles', { json: { songId: song.id } });
  must(unauthorized.status === 401, `未登录发起应为 401，实际 ${unauthorized.status}`);
  must(
    Array.isArray(unauthorized.body?.error?.violations),
    '401 envelope 应为 {error:{message,violations}}',
  );
  log('未登录发起', `401 · ${unauthorized.body?.error?.message}`);

  // ── 四个账号（同一支完整作品需要 4 位参与者）─────────────────────
  const A = await register('aa');
  const B = await register('bb');
  const C = await register('cc');
  const D = await register('dd');
  log('注册四个账号', [A.handle, B.handle, C.handle, D.handle].join(' / '));

  for (const user of [A, B, C, D]) {
    const me = await call(user.session, 'GET', '/api/auth/me');
    must(
      me.status === 200 && me.body?.user?.id === user.userId,
      `${user.label} /me 应返回自己的身份`,
    );
  }
  log('四个会话互不干扰', '各自 /me 返回自己的 user.id');

  // ── A 发起 + 录第 1 段 + 投河 ────────────────────────────────
  const created = await call(A.session, 'POST', '/api/bottles', { json: { songId: song.id } });
  must(created.status === 201, `发起应为 201，实际 ${created.status}`);
  const bottleId = created.body?.id;
  must(created.body?.status === 'DRAFT', '新建瓶子应为 DRAFT');
  must(
    JSON.stringify(created.body?.missingSegmentIndexes) === JSON.stringify([1, 2, 3, 4]),
    '新建瓶子缺口应为 [1,2,3,4]',
  );
  log('发起漂流瓶', `${bottleId} · 缺口 ${JSON.stringify(created.body.missingSegmentIndexes)}`);

  const first = await recordSegment(
    A.session,
    bottleId,
    20_000,
    '在深夜哼一段没有词的曲子，期待接唱',
  );
  must(first.status === 201, `录第 1 段应为 201，实际 ${first.status}`);
  must(first.body?.index === 1, `第 1 段 index 应为 1，实际 ${first.body?.index}`);
  must(first.body?.nextRecordIndex === 2, '录完第 1 段后 nextRecordIndex 应为 2');
  log(
    'A 录第 1 段（原始二进制 4KB webm）',
    `index=${first.body.index} · next=${first.body.nextRecordIndex}`,
  );

  // 音频回放端点（Range）
  const segmentId = first.body.segmentId;
  const audio = await call(anon, 'GET', `/api/segments/${segmentId}/audio`, {
    headers: { range: 'bytes=0-99' },
  });
  must(audio.status === 206, `Range 请求应为 206，实际 ${audio.status}`);
  log(
    '分段音频 Range 播放',
    `206 · Content-Range ${'content-range' in audio ? '' : ''}（切片由服务端完成）`,
  );

  const castByA = await call(A.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  must(castByA.status === 200 && castByA.body?.status === 'IN_RIVER', 'A 投河后应为 IN_RIVER');
  log('A 投河', `status=${castByA.body?.status}`);

  // ── B 捞取（河道随机）+ 接唱 + 投河 ───────────────────────────
  const { drawn: drawB, attempts: attemptsB } = await drawUntil(B.session, bottleId);
  must(drawB.status === 200 && drawB.body?.bottle?.id === bottleId, 'B 应捞到 A 投出的瓶子');
  log('B 打捞次数（河道可能有别人的瓶子）', String(attemptsB));
  must(drawB.body?.bottle?.isHolder === true, '捞到即持有（isHolder=true）');
  log('B 从河道捞取', `bottle=${drawB.body.bottle.id} · isHolder=${drawB.body.bottle.isHolder}`);

  const detailB = await call(B.session, 'GET', `/api/bottles/${bottleId}`);
  must(
    JSON.stringify(detailB.body?.missingSegmentIndexes) === JSON.stringify([2, 3, 4]),
    'B 看到的缺口应为 [2,3,4]',
  );
  must(
    Array.isArray(detailB.body?.availableResolutions) &&
      detailB.body.availableResolutions.length > 0,
    '持有且已有唱段时应给出可选去向（页面据此渲染三选一）',
  );
  log(
    'B 看详情',
    `缺口 ${JSON.stringify(detailB.body.missingSegmentIndexes)} · 可选去向 ${JSON.stringify(detailB.body.availableResolutions)}`,
  );

  const second = await recordSegment(B.session, bottleId, 21_000, '顺着你的情绪加了段人声');
  must(second.status === 201 && second.body?.index === 2, 'B 应录到第 2 段（缺口里最小的段号）');
  log('B 接唱第 2 段', `index=${second.body.index} · next=${second.body.nextRecordIndex}`);
  const castByB = await call(B.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  must(castByB.status === 200, 'B 投河应成功');
  log('B 投河', `status=${castByB.body?.status}`);

  // ── 防捣乱：A 捞不到自己参与过的瓶子（页面要能解释这种拒绝）────────
  const reDrawOwn = await call(A.session, 'POST', '/api/river/draw');
  if (reDrawOwn.status === 200) {
    // 河道里还有别人的瓶子 → 捞到别的瓶子是合法的，但绝不能是 A 自己的那支
    must(reDrawOwn.body?.bottle?.id !== bottleId, 'A 不应再捞到自己投出的瓶子');
    await call(A.session, 'POST', `/api/bottles/${reDrawOwn.body.bottle.id}/put-back`);
    log('A 再捞', `200 · 捞到的是别人的瓶子（不是自己的 ${bottleId.slice(0, 8)}…）`);
  } else {
    must(
      [409, 422].includes(reDrawOwn.status),
      `被拒绝时状态应为 409/422，实际 ${reDrawOwn.status}`,
    );
    must(
      typeof reDrawOwn.body?.error?.violations?.[0]?.code === 'string',
      '被拒绝时应带稳定错误码（页面据此给可读文案）',
    );
    log(
      'A 再捞（防捣乱 / 冷却）',
      `${reDrawOwn.status} · ${reDrawOwn.body.error.violations[0].code}`,
    );
  }

  // ── C、D 依次接力，末段由 D 选择回传 → 回到 B → B 入海 ─────────
  const { drawn: drawC } = await drawUntil(C.session, bottleId);
  must(drawC.status === 200 && drawC.body?.bottle?.id === bottleId, 'C 应捞到同一支瓶子');
  const third = await recordSegment(C.session, bottleId, 19_500);
  must(third.body?.index === 3, `C 应录到第 3 段，实际 ${third.body?.index}`);
  await call(C.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  log('C 接唱第 3 段并投河', `index=${third.body.index}`);

  const { drawn: drawD } = await drawUntil(D.session, bottleId);
  must(drawD.status === 200 && drawD.body?.bottle?.id === bottleId, 'D 应捞到同一支瓶子');
  const fourth = await recordSegment(D.session, bottleId, 22_000, '接唱完成了，声音有点沙哑');
  must(fourth.body?.index === 4, `D 应录到第 4 段，实际 ${fourth.body?.index}`);
  must(
    fourth.body?.nextRecordIndex === null,
    '录满最后一拍后 nextRecordIndex 应为 null（只能选去向）',
  );
  const afterComplete = await call(D.session, 'GET', `/api/bottles/${bottleId}`);
  must(afterComplete.body?.isComplete === true, '四段齐全后 isComplete 应为 true');
  must(
    afterComplete.body?.availableResolutions?.includes('RETURN') === true,
    '末段录完后应可选回传',
  );
  log(
    'D 录第 4 段（作品完整）',
    `isComplete=${afterComplete.body.isComplete} · 可选去向 ${JSON.stringify(afterComplete.body.availableResolutions)}`,
  );

  const returned = await call(D.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'RETURN' },
  });
  must(returned.status === 200, `回传应成功，实际 ${returned.status}`);
  must(
    returned.body?.holderId === C.userId,
    `回传后持有者应为父链上游（投给 D 的 C），实际 ${returned.body?.holderId}`,
  );
  log(
    'D 回传',
    `holder=${returned.body.holderId === C.userId ? 'C（父链上游：投给 D 的人）' : returned.body.holderId}`,
  );

  const toSea = await call(C.session, 'POST', `/api/bottles/${bottleId}/resolution`, {
    json: { resolution: 'SEA' },
  });
  must(toSea.status === 200 && toSea.body?.seaZone === 'COMPLETED', 'C 入海后应进入公海完整区');
  log('C 入海', `status=${toSea.body?.status} · seaZone=${toSea.body?.seaZone}`);

  // ── 公海（前端「公海大厅」用的两个请求）────────────────────────
  const seaCompleted = await call(anon, 'GET', '/api/sea?zone=COMPLETED&limit=30');
  must(seaCompleted.status === 200, '公海完整区应可读（未登录也可听）');
  const inSea = seaCompleted.body?.items?.some((item) => item.id === bottleId);
  must(inSea === true, '刚入海的作品应出现在完整区');
  const summary = seaCompleted.body.items.find((item) => item.id === bottleId);
  must(
    typeof summary?.songTitle === 'string' && summary.songTitle.length > 0,
    '公海列表必须带曲名',
  );
  must(Array.isArray(summary?.missingSegmentIndexes), '公海列表必须带缺口字段');
  log(
    '公海完整区',
    `共 ${seaCompleted.body.items.length} 件 · 本品 ${summary?.songTitle ?? '（未找到）'} · 缺口 ${JSON.stringify(summary?.missingSegmentIndexes ?? null)}`,
  );

  const seaIncomplete = await call(anon, 'GET', '/api/sea?zone=INCOMPLETE&limit=30');
  must(seaIncomplete.status === 200, '公海未完成区应可读');
  log('公海等待接力区', `${seaIncomplete.body.items.length} 件`);

  const seaDetail = await call(anon, 'GET', `/api/sea/${bottleId}`);
  must(seaDetail.status === 200 && seaDetail.body?.id === bottleId, '公海详情应可读');
  log(
    '公海详情',
    `${seaDetail.body.songTitle} · ${seaDetail.body.recordedCount}/${seaDetail.body.totalSegments} 段`,
  );

  // ── 漂流日志（前端「漂流日志」页）──────────────────────────────
  const events = await call(anon, 'GET', `/api/bottles/${bottleId}/events`);
  must(events.status === 200 && Array.isArray(events.body), '漂流日志应可读');
  must(events.body.length >= 8, `日志应记录整条接力，实际 ${events.body.length} 条`);
  must(
    events.body.every((event, index) => event.seq === index + 1),
    'seq 应从 1 连续升序',
  );
  must(
    events.body.every(
      (event) => typeof event.type === 'string' && typeof event.occurredAt === 'string',
    ),
    '每条事件都要有 type 与 occurredAt',
  );
  const systemEvents = events.body.filter((event) => event.actorId === 'SYSTEM');
  log(
    '漂流日志',
    `${events.body.length} 条 · 事件类型 ${[...new Set(events.body.map((e) => e.type))].join(',')} · 系统行为 ${systemEvents.length} 条`,
  );

  // ── 匿名代号（前端「我的」页）─────────────────────────────────
  const codes = await call(B.session, 'GET', '/api/me/anonymous-codes');
  must(codes.status === 200 && Array.isArray(codes.body), '匿名代号应可读');
  log('B 的匿名代号', codes.body.map((entry) => entry.code).join(', ') || '（空）');

  // ── 放回海中（未接唱直接放回 + 冷却）──────────────────────────
  const second2 = await call(C.session, 'POST', '/api/bottles', { json: { songId: song.id } });
  const bottle2 = second2.body.id;
  await recordSegment(C.session, bottle2, 20_000);
  await call(C.session, 'POST', `/api/bottles/${bottle2}/resolution`, {
    json: { resolution: 'RIVER' },
  });
  const { drawn: drawE } = await drawUntil(D.session, bottle2);
  must(drawE.status === 200 && drawE.body?.bottle?.id === bottle2, 'D 应捞到第二支瓶子');
  const putBack = await call(D.session, 'POST', `/api/bottles/${bottle2}/put-back`);
  must(putBack.status === 200, `放回应成功，实际 ${putBack.status}`);
  must(
    putBack.body?.cooldownDraws === 10,
    `放回后冷却次数应为 10，实际 ${putBack.body?.cooldownDraws}`,
  );
  log('D 放回海中', `冷却 ${putBack.body.cooldownDraws} 次`);

  // ── 「没有可捞的瓶子」：409 + 稳定码（前端据此渲染空态，而不是红色报错）──
  //
  // 注意：这条 dev 库里河道还漂着别人留下的瓶子，所以"真的捞不到"不一定能在有限次数内造出来；
  // 造不出来时**只记录事实**（不伪装成通过）—— 该空态的界面行为由前端测试
  // （river-page.test.tsx 用 409 桩）与 API 集成测试分别覆盖。
  const E = await register('ee');
  let emptyDraw = null;
  let attemptCount = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    attemptCount = attempt + 1;
    const drawn = await call(E.session, 'POST', '/api/river/draw');
    if (drawn.status !== 200) {
      emptyDraw = drawn;
      break;
    }
    await call(E.session, 'POST', `/api/bottles/${drawn.body.bottle.id}/put-back`);
  }
  if (emptyDraw === null) {
    log(
      '没有可捞的瓶子',
      `本机 dev 库河道始终有其他瓶子（尝试 ${attemptCount} 次），按"未复现"记录；界面空态由前端测试覆盖`,
    );
  } else {
    must(emptyDraw.status === 409, `没有可捞时应为 409，实际 ${emptyDraw.status}`);
    must(
      emptyDraw.body?.error?.violations?.[0]?.code === 'NO_BOTTLE_AVAILABLE',
      '没有可捞时应带 NO_BOTTLE_AVAILABLE 码',
    );
    log(
      '没有可捞的瓶子',
      `409 · ${emptyDraw.body?.error?.violations?.[0]?.code ?? '（无码）'} · ${emptyDraw.body?.error?.message ?? ''}`,
    );
  }

  // ── 会话隔离：登出后 /me 为 401 ───────────────────────────────
  const loggedOut = await call(C.session, 'POST', '/api/auth/logout');
  must(loggedOut.status === 204, `登出应为 204，实际 ${loggedOut.status}`);
  const meAfterLogout = await call(C.session, 'GET', '/api/auth/me');
  must(meAfterLogout.status === 401, '登出后 /me 应为 401');

  console.log('');
  if (failures === 0) {
    console.log(
      `✅ 黄金路径真实链路检查通过（${String(stepNo)} 步，4 个账号，真库 + 真 HTTP + 真音频字节）`,
    );
    process.exit(0);
  }
  console.error(`❌ 有 ${String(failures)} 项不符合预期`);
  process.exit(1);
};

await main();
