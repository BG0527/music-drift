# t14 真浏览器探针 · 配方与增量（qa-e2e · 2026-09-24）

> **这份文档补什么**：`docs/handover/browser-probe-recipe.md`（audio-engineer 写的基线配方）**已经有**五个要点：
> 假麦克风、一次性库、一次性 API、`mdb_session` cookie 注入、挂钩 `window.Audio` 抓游离元素。
> **本文件只写 t14 相对它的增量**，以及复用时要避开的两个坑。基线配方照旧有效，不重抄一遍。
>
> 与基线一致的口径：探针**不入库为依赖**（AGENTS.md §7：E2E 工具属待裁决项），
> 运行副本在**仓库外** `D:/music-e2e-probe/`；但**配方必须能在仓库里重建** —— 就是本文 + 基线配方。

## 1. 有什么、在哪

| 文件 | 作用 | 规模 |
| --- | --- | --- |
| `D:/music-e2e-probe/t14-probe.mjs` | t14 主探针：5 个阶段（cap / golden / race-claim / race-river / webkit），53 条断言 | ~1210 行 |
| `D:/music-e2e-probe/claim-race.mjs` | 并发抢占的**定点 HTTP 实验**（只起一次性库 + API，不起浏览器，快）：exp-1/2/3/4 | ~310 行 |
| `D:/music-e2e-probe/cap2.mjs` | 只测"这个浏览器有没有 `MediaRecorder`/`getUserMedia`"的最小脚本（**排查环境问题先跑它**） | ~100 行 |
| `docs/e2e/t14-browser-run.txt` | 最终一轮的完整原始输出（53 断言 / 50 通过 / 3 失败） | — |

```bash
node D:/music-e2e-probe/t14-probe.mjs chromium cap golden race-claim race-river webkit
node D:/music-e2e-probe/claim-race.mjs
node D:/music-e2e-probe/cap2.mjs webkit chromium        # 先确认引擎能力，再谈别的
```

`[result] ALL PASS` + 退出码 0 = 全通过；有 FAIL 时退出码 1 并在末尾汇总。
**不许加自动重试**：探针里唯一的 `waitForFunction` 是在**有界时间内等一个异步条件**（媒体元数据加载完），
超时即判红并报出等了多久。

## 2. ⭐ 增量一：用**生产构建 + 静态服务**替掉 vite dev server（去掉 HMR 这个变量）

**为什么**：基线配方 §4 用"安静窗口纪律"（跑前确认近 70 秒没人改前端源码）对付 HMR。
但 t14 派单时 `frontend-ds` **正在改** `apps/web/src/design-system/**`（`find apps/web/src -newermt '-6 minutes'` 持续有命中），
根本等不到安静窗口。dev server 下"通过与否取决于别人此刻在不在写文件" —— 这不是可信的端到端结论。

**做法**：`vite build` 输出到**仓库外**，再起一个 ~40 行的静态服务，把 `/api` 反代到一次性 API
（浏览器里用的是**相对** `/api`，所以必须由这一层代理）。附带多证明一件 dev server 证明不了的事：
**打出来的产物本身可用**。需要退回 dev server 时设 `T14_SERVE=dev`。

```js
const OUT_DIR = 'D:/music-e2e-probe/dist';   // 仓库外：保持"脚本只读仓库"这条纪律

function buildWeb() {
  mkdirSync(OUT_DIR, { recursive: true });
  const viteBin = join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  const result = spawnSync(
    process.execPath,
    [viteBin, 'build', '--outDir', OUT_DIR, '--emptyOutDir', '--logLevel', 'warn'],
    { cwd: WEB_DIR, encoding: 'utf8', env: process.env },
  );
  if (result.status !== 0) { console.error(result.stdout, result.stderr); process.exit(1); }
}

async function startStaticServer(port, apiTarget) {
  const server = createHttpServer((req, res) => {
    if (req.url !== undefined && req.url.startsWith('/api')) {
      const proxied = httpRequest(
        apiTarget + req.url,
        { method: req.method, headers: { ...req.headers, host: new URL(apiTarget).host } },
        (upstream) => { res.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(res); },
      );
      proxied.on('error', () => { res.writeHead(502).end('proxy error'); });
      req.pipe(proxied);
      return;
    }
    const path = (req.url ?? '/').split('?')[0];
    let file = join(OUT_DIR, path);
    if (!existsSync(file) || path === '/') file = join(OUT_DIR, 'index.html');
    if (!existsSync(file)) {   // SPA 回退：11 条前端路由都由前端自己分派
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
         .end(readFileSync(join(OUT_DIR, 'index.html')));
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { close: async () => { await new Promise((resolve) => server.close(resolve)); } };
}
```

**注意**（生产构建下`import.meta.env.DEV` 为 false ⇒ `/?design-system` 展示页不可达，这**是预期的**；
本仓库 `apps/web/src` 里只有 `App.tsx` 用到 `import.meta.env`，所以生产构建不影响任何页面）。

## 3. ⭐ 增量二：把"响应体"也记下来（只看状态码会漏掉最阴的失败形态）

`page.on('response')` 只记 `status` 是不够的：**"抢失败却回 200 + 摘要"** 这种失败形态，
状态码看起来完全正常。所以要记 `code`（稳定错误码）与**幂等写操作的响应体**：

```js
const entry = { ts: Date.now(), status: response.status(), method: ..., path: ..., code: null, body: null };
bucket.http.push(entry);
if (entry.method === 'POST' && /\/targeted-segment|\/river\/draw/.test(entry.path)) {
  response.text().then((text) => {
    const body = JSON.parse(text);
    entry.body = { id: body?.id ?? body?.bottle?.id ?? null, status: body?.status ?? null, seaZone: body?.seaZone ?? null };
  }).catch(() => undefined);
}
if (response.status() >= 400) { /* 同上，再取 error.violations[0].code */ }
```

**没这条就抓不到**：t14 的核心缺陷（`POST /api/sea/:id/targeted-segment` 抢占失败回 200，
见 `docs/e2e/t14-report.md` §4）当初就是因为两个窗口"都 200"看起来人畜无害。

## 4. ⭐ 增量三：两个"看起来像缺陷、其实是我错了"的坑（先读，省一轮）

### 4.1 匿名访问 `GET /api/auth/me` 的 **401 是契约行为**

`apps/web/src/features/api/queries.ts` 的 `useMeQuery` 显式把 401 映射成 `null`（= 未登录），
登录闸门就靠它。真表单注册流程必然先产生这个 401 ⇒ **"整轮无 4xx"这条断言会假红**。
正确写法：**精确列出预期的这一条**，其余一律算可疑（既不要假红，也不要开成"什么 4xx 都放过"）：

```js
const EXPECTED_ANON_401 = (item) => item.status === 401 && item.path.startsWith('/api/auth/me');
```

### 4.2 "看不到可播段"≠"解码失败"：别拿**已被持有（HELD）**的瓶子验回放

CONTEXT §9.1「漂流中只能听到自己这一棒之前的部分」⇒ 陌主人在一支 `HELD` 瓶子上**一首段都看不到**，
页面上是「还有 N 段现在看不到」+「还没有人唱过」。我第一版就是拿这种瓶子验 WebKit 回放，
于是把"没有可播段"误判成"WebKit 解码失败"。**回放夹具必须是公海上的作品**（段对所有人可见）。

### 4.3 别拿假字节验"能不能播"

`1a45dfa3` + 填充的 2KB 假字节过得了上传校验（服务端拿 `x-audio-duration-ms` 当权威），
但 `<audio>` 解不了它 —— 用它验"能不能出声"等于没验。**跨引擎回放必须用真录制的字节**：

```js
// Chromium 假麦克风真录 N 秒 → 取回字节到 node 侧 → 按 docs/api.md §2.4 上传
const realBytes = await recordRealBytes(pw, 20);          // 实测 321974 bytes
await uploadRealSegment(session, bottleId, realBytes, 20_000);
```

（`ondataavailable` 的 Blob 转 base64 要**按 8KB 分块** `String.fromCharCode(...)`，
一次性展开 30 万字节会炸栈。）

## 5. ⭐ 增量四：断言口径要用"服务端判定 + DB 行"，不要用"URL 变了"

`TargetedSegmentButton` 只要 POST 返回 200 就 `navigate()`。所以**URL 变化只说明"它以为成功了"**，
不能当作"抢到了"的证据。t14 的不变量断言一律取：

- 服务端视角：`GET /api/bottles/:id` 的 `isHolder`（互斥：两个窗口必须一真一假）；
- DB 视角：`select count(*) from holdings where bottle_id = $1 and released_at is null` = 1
  （`holdings_active_bottle_uniq` 是那条部分唯一索引）；
- 前置条件也要断言（否则"通过"可能是靠运气）：造并发场景前先查
  `select count(*) from bottles where status = 'IN_RIVER'`，**必须恰好 1 支**。

## 6. 断言清单（53 条，按阶段）

| 阶段 | 覆盖 | 条数 |
| --- | --- | --- |
| `cap` | Chromium 三项能力齐备 + WebM/Opus 容器；WebKit 能力**实测并如实记录**（不当断言虚增通过数） | 2 |
| `golden` | 真表单注册×2 · 选歌发起 · 录满自动停 · 预设时长文案 · 确认投递禁用态 · 投河播报 · **河道恰好 1 支（前置）** · 捞到的就是那支 · 真实音频可解码 · 播放真的在走（两段采样递进）· 入海后 DB status=SEA · 公海等待接力区可见 · 漂流日志≥2 条且不泄账号 · 「我的」认领 · 非预期 4xx=0 · 唯一 4xx 是匿名 401 · `/listen` 全 2xx（t30 未回归）· 无 JS 异常 · HMR-free 口径 | 23 |
| `race-claim` | 两窗口都看到入口 · 活跃持有者恰好 1 人 · `isHolder` 互斥 · **输的一方有可见解释** | 4 |
| `race-river` | ×3 轮：河道恰好 1 支（前置）· 只一人拿到 · 输方看到"已被别人拿走"· 输方拿到 409 `HOLDING_ALREADY_TAKEN` · 活跃持有者 1 人 | 15 |
| `webkit` | 河道页不白屏 · 不支持录音时明确说明 · 「开始录制」禁用（fail-closed）· 拿到真实音频元素 · 能解码 WebM/Opus · 播放真的在走 · 无非预期 4xx · 无 JS 异常 · 夹具抢到持有权 | 9 |

## 6.5 移动端断点回归：**不要**在本探针里新写几何量测

t14 范围含"移动端断点回归"，但仓库**已经有唯一判据**：`apps/web/tools/one-screen-check.mjs`
（12 条路由 × 声明式锚点 `data-anchor` + 反向控制 + hermetic 数据）。**直接跑它**：

```bash
node apps/web/tools/one-screen-check.mjs --viewport=375x812 --shot=docs/e2e/shots/t14-375
node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/e2e/shots/t14-1440
node apps/web/tools/one-screen-check.mjs --viewport=375x812 --negative-control   # 反向控制
```

坑（我踩过，已记进 `docs/e2e/t14-report.md` §6.5）：该文件**头部注释与实现不一致** ——
注释说反向控制"要求全部路由 FAIL 且 `exit 1`"，实现是"反向控制**成立**时 `exit 0`"，
且手机口径下判"**有锚点的**路由全红"（`/log` 与 404 页没有锚点）。**照注释读会把"通过"读成"守卫坏了"。**
看结论请认脚本最后那行 `✅ 反向控制成立…`，别只认退出码。

## 7. 本次跑出来的结论去哪看

- 结果与三个失败项的根因、影响面、建议：`docs/e2e/t14-report.md`
- 原始输出：`docs/e2e/t14-browser-run.txt`
- 断点回归的原始输出：`docs/e2e/t14-layout-375.txt` / `-1440.txt` / `-negative-control.txt`（截图在 `docs/e2e/shots/`）
- 未验证项（触控目标尺寸、WebKit 真录制、动效观感）在报告 §7 逐条列了，**不要当成已验证**
