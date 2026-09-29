/**
 * 无依赖本地静态服务器 + 同源 API 反代（W0；归属：captain 后续可改）
 *
 * 为什么必须自己写一个：定稿页里的字体是**仓库内的真实 woff2**（4 行本地 `@import`，
 * 路径形如 `/node_modules/.pnpm/...`），`file://` 下 Chromium 的跨文件 CSS `@import` 限制会让
 * 字体静默回退；而且**会话 cookie 是 `HttpOnly + SameSite=Lax`、后端没有任何 CORS**
 * ⇒ 静态页与 `/api` 必须同源，否则"登录看起来成功、下一页立刻掉线"。
 * 装依赖被 AGENTS §7 禁止，所以只用 `node:http`。
 *
 * 用法：
 *   node tools/site-server.mjs                      # 站点 5173，反代到 API 8788
 *   node tools/site-server.mjs --port=5173 --api-port=8788
 *
 * 路由：
 *   `/`            → 302 → `/river.html`
 *   `/api/*`       → 反代 `127.0.0.1:<api-port>`（**完整转发 method/headers/body**，
 *                    `set-cookie` 原样带回；请求与响应都是流式 pipe，不把音频读进内存）
 *   `/healthz`     → 同上反代（验收第 2 条的探针）
 *   `/node_modules/*` → 从仓库根服务（页面里那 4 行本地字体 `@import` 依赖它）
 *   其余           → 从 `site/` 服务；找不到文件 → `site/404.html` + HTTP 404
 */

import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SITE_ROOT = join(REPO_ROOT, 'site');
const API_HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

/** hop-by-hop 头不能透传（RFC 9110 §7.6.1）；`set-cookie` **必须**透传，见 transferHeaders。 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function readArg(argv, name, fallback) {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && argv[index + 1] !== undefined) return argv[index + 1];
  return fallback;
}

function readPort(argv, name, fallback) {
  const raw = readArg(argv, name, String(fallback));
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`[site] --${name} 不是合法端口：${raw}`);
    process.exit(1);
  }
  return port;
}

const argv = process.argv.slice(2);
const DEFAULT_API_PORT = Number.parseInt(process.env.API_PORT ?? '8788', 10);
const PORT = readPort(argv, 'port', 5173);
const API_PORT = readPort(argv, 'api-port', Number.isInteger(DEFAULT_API_PORT) ? DEFAULT_API_PORT : 8788);

function isProxyPath(pathname) {
  return pathname === '/healthz' || pathname === '/api' || pathname.startsWith('/api/');
}

/** 解析静态文件：`/node_modules/*` 走仓库根（字体），其余一律限制在 `site/` 内（防目录穿越）。 */
function resolveStaticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const fromRepoRoot = decoded === '/node_modules' || decoded.startsWith('/node_modules/');
  const base = fromRepoRoot ? REPO_ROOT : SITE_ROOT;
  const relative = decoded.replace(/^\/+/, '');
  const target = normalize(join(base, relative === '' ? 'river.html' : relative));
  if (target !== base && !target.startsWith(base + sep)) return null;
  if (!existsSync(target)) return null;
  if (statSync(target).isDirectory()) return null;
  return target;
}

function serveStatic(req, res, pathname) {
  const file = resolveStaticFile(pathname);
  if (file === null) {
    const notFound = join(SITE_ROOT, '404.html');
    if (!existsSync(notFound)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 not found');
      return;
    }
    res.writeHead(404, {
      'content-type': MIME['.html'],
      'cache-control': 'no-store',
      'x-site-file': '404.html',
    });
    createReadStream(notFound).pipe(res);
    return;
  }

  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    // 免构建 ⇒ 无指纹，开发期一律不缓存，免得评委/队友拿到旧 JS。
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

/** 反代：完整转发 method / headers / body；响应 set-cookie 原样带回（会话同源的关键）。 */
function proxy(req, res) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'host') continue;
    if (HOP_BY_HOP.has(key)) continue;
    headers[key] = value;
  }
  headers.host = `${API_HOST}:${API_PORT}`;

  const upstream = httpRequest(
    { host: API_HOST, port: API_PORT, method: req.method, path: req.url, headers },
    (upstreamRes) => {
      const out = {};
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (HOP_BY_HOP.has(key.toLowerCase())) continue;
        // `set-cookie` 在 Node 里是数组：原样透传，**不改任何属性**（HttpOnly/SameSite/Path 保持后端原样）。
        out[key] = value;
      }
      res.writeHead(upstreamRes.statusCode ?? 502, out);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const reason =
      error?.code === 'ECONNREFUSED'
        ? `后端 API 未启动（${API_HOST}:${API_PORT} 未监听）。先跑：pnpm --filter @music-drift/api dev`
        : `反向代理失败：${error?.code ?? error?.message ?? 'unknown'}`;
    res.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
      'x-site-upstream': 'down',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ error: { message: reason, violations: [] } }));
  });

  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

const server = createServer((req, res) => {
  const target = req.url ?? '/';
  const stop = target.search(/[?#]/);
  const pathname = stop === -1 ? target : target.slice(0, stop);

  if (pathname === '/') {
    res.writeHead(302, { location: '/river.html', 'cache-control': 'no-store' });
    res.end();
    return;
  }

  if (isProxyPath(pathname)) {
    proxy(req, res);
    return;
  }

  serveStatic(req, res, pathname);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[site] 端口 ${PORT} 已被占用：先停掉占用进程，或换端口 node tools/site-server.mjs --port=5174`);
    process.exit(1);
  }
  console.error('[site] 服务器错误：', error);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`站点在 http://localhost:${PORT}`);
  console.log(`  静态根目录：${SITE_ROOT}`);
  console.log(`  本地字体：/node_modules/* → ${REPO_ROOT}`);
  console.log(`  同源反代：/api/* 与 /healthz → http://${API_HOST}:${API_PORT}`);
});
