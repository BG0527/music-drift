# syntax=docker/dockerfile:1
# =============================================================================
# music-drift 单服务同源镜像（t33 · 推荐拓扑，取代 docs/deploy-plan-html.md 的旧 HTML 方案）
#
# 一个容器 = 一个域名 = 天然同源：
#   gateway(:8080) ── 静态 apps/web/dist（SPA 回退）
#                └─ 反代 /api 与 /healthz → 同容器 Fastify(:8788)
# 为什么必须同源：会话 cookie 是 HttpOnly + SameSite=Lax 且全仓无 CORS 配置
# （docs/deploy-plan-html.md §1 已核实）—— 静态与 API 不同源时登录立刻掉线。
# 为什么用网关而不是改 apps/api：apps/api 一行不改（部署不侵入业务代码）。
#
# 构建：docker build -t music-drift-app .
# 运行：docker compose -f docker-compose.prod.yml up -d --build   （步骤见 docs/deploy-runbook.md）
# =============================================================================
FROM node:22-bookworm-slim

# 锁 pnpm = 根 package.json 的 packageManager（corepack 直连默认 registry，容器内无宿主代理干扰）
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

# 整仓拷入（清单 + 源码 + 锁文件；.env 有意不拷 —— 密钥只经 compose 环境注入，绝不进镜像）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages packages
COPY apps apps

# 依赖安装（frozen-lockfile = 只认 pnpm-lock.yaml，不改锁；allowBuilds 只放行 esbuild）。
# registry 必须与锁文件同源：pnpm-lock.yaml 的 tarball URL 由 npmmirror 生成
#（本机 .npmrc 的 taobao 域已永久迁移到 npmmirror），容器内若用默认 npmjs 会触发
# pnpm 的 tarball/元数据一致性策略拒绝安装（t33 实测报错原文见 runbook §5.2）。
RUN pnpm config set registry https://registry.npmmirror.com \
    && pnpm install --frozen-lockfile

# 前端产物：apps/web/dist（评委看到的东西就在这一步产生）
RUN pnpm --filter @music-drift/web build

# 同源网关：静态 + /api 反代（node:http 手写，零新增依赖；package.json type=module ⇒ ESM）
RUN cat > /app/gateway.mjs <<'GATEWAY_EOF'
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = '/app/apps/web/dist';
const API = 'http://127.0.0.1:8788';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  const path = url.split('?')[0] ?? '/';
  // /api/* 与 /healthz → 同容器 Fastify（cookie/Range 原样透传 ⇒ 同源会话与音频 Range 不受影响）
  if (path.startsWith('/api') || path === '/healthz') {
    const proxied = http.request(
      API + url,
      { method: req.method, headers: { ...req.headers, host: '127.0.0.1:8788' } },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxied.on('error', () => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('api unreachable');
    });
    req.pipe(proxied);
    return;
  }
  // 静态：命中文件直发；带扩展名的缺失 = 404（不把丢资源伪装成 200）；
  // 无扩展名 = SPA 回退 index.html（11 条前端路由由客户端路由分派）
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (/\.[a-z0-9]+$/.test(path)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    file = join(DIST, 'index.html');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    // index.html 不缓存（改文案发版后评委立刻看到新字节）；带指纹的静态资源可缓存
    'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(res);
});

const port = Number(process.env.GATEWAY_PORT ?? 8080);
server.listen(port, '0.0.0.0', () => {
  console.log(`[gateway] :${port} static(dist) + /api -> 127.0.0.1:8788`);
});
GATEWAY_EOF

ENV GATEWAY_PORT=8080
EXPOSE 8080

# 启动序列（fail-fast）：迁移 → 种子（admin 口令只来自环境，缺失则跳过并告警）→ Fastify(后台) + 网关(前台)。
# 任一前置步骤失败 ⇒ 容器退出（compose restart 策略会把它暴露成 CrashLoop，而不是带病运行）。
CMD ["sh", "-c", "pnpm --filter @music-drift/api db:migrate && pnpm --filter @music-drift/api db:seed && { pnpm --filter @music-drift/api start & node /app/gateway.mjs; }"]
