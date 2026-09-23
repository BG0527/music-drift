/**
 * 最小路由表（纯函数）。
 *
 * 为什么自建而不是引 react-router：`docs/architecture.md` §4 的依赖基线里**没有**路由库，
 * 按 AGENTS.md §7 不能自行引入中间件。P0 闭环只有 11 条路径，一张表 + 一个 History 监听足够。
 *
 * 纪律：`matchRoute` / `buildPath` 必须互为逆运算（有测试钉住），页面不允许自己拼字符串路径。
 */

export type RouteName =
  | 'login'
  | 'home'
  | 'new'
  | 'river'
  | 'bottle'
  | 'bottleLog'
  | 'sea'
  | 'seaDetail'
  | 'profile'
  | 'settings'
  | 'admin'
  | 'notFound';

export interface RouteMatch {
  name: RouteName;
  /** 路径参数（当前只有 `id`）。 */
  params: Record<string, string>;
  /** 去掉查询串之后的规范化路径。 */
  path: string;
}

interface RoutePattern {
  name: RouteName;
  segments: readonly string[];
}

const PATTERNS: readonly RoutePattern[] = [
  { name: 'login', segments: ['login'] },
  { name: 'home', segments: [] },
  { name: 'new', segments: ['new'] },
  { name: 'river', segments: ['river'] },
  { name: 'bottleLog', segments: ['bottles', ':id', 'log'] },
  { name: 'bottle', segments: ['bottles', ':id'] },
  { name: 'sea', segments: ['sea'] },
  { name: 'seaDetail', segments: ['sea', ':id'] },
  { name: 'profile', segments: ['me'] },
  { name: 'settings', segments: ['settings'] },
  // 审核台（仅管理员；权限由服务端判定，前端只负责别把入口露给普通用户）
  { name: 'admin', segments: ['admin'] },
];

function toSegments(pathname: string): string[] {
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? '';
  return withoutQuery.split('/').filter((segment) => segment.length > 0);
}

/** 把一条 pathname 解析成「哪一页 + 参数」；认不出来就是 `notFound`（页面渲染 404 空态，不白屏）。 */
export function matchRoute(pathname: string): RouteMatch {
  const segments = toSegments(pathname);
  for (const pattern of PATTERNS) {
    if (pattern.segments.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < pattern.segments.length; index += 1) {
      const expected = pattern.segments[index]!;
      const actual = segments[index]!;
      if (expected.startsWith(':')) {
        params[expected.slice(1)] = decodeURIComponent(actual);
        continue;
      }
      if (expected !== actual) {
        matched = false;
        break;
      }
    }
    if (matched) return { name: pattern.name, params, path: `/${segments.join('/')}` };
  }
  return { name: 'notFound', params: {}, path: `/${segments.join('/')}` };
}

/** 反向构造路径（页面里禁止手拼 `/bottles/${id}/log`）。 */
export function buildPath(name: RouteName, params: Record<string, string> = {}): string {
  if (name === 'notFound') return '/';
  const pattern = PATTERNS.find((candidate) => candidate.name === name);
  if (pattern === undefined) return '/';
  const segments = pattern.segments.map((segment) =>
    segment.startsWith(':') ? (params[segment.slice(1)] ?? '') : segment,
  );
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export interface AppNavItem {
  key: 'river' | 'sea' | 'mine' | 'settings' | 'admin';
  label: string;
  href: string;
}

/**
 * 一级导航四入口（桌面侧栏 / 移动底栏共用）。
 * 来源：Figma 帧 `home-river` 的侧栏 IA（`docs/figma/CONFLICTS.md` 采纳清单 #1）；
 * 移动端折叠形态见 C-14 裁决。key 与设计系统 `SidebarNav` 的图标默认表对齐。
 */
/** 审核台入口：只在 `session.isAdmin` 时追加（**权限判定在服务端**，这里只是别露错入口）。 */
export const ADMIN_NAV_ITEM: AppNavItem = { key: 'admin', label: '审核台', href: '/admin' };

export const NAV_ITEMS: readonly AppNavItem[] = [
  { key: 'river', label: '河道', href: '/river' },
  { key: 'sea', label: '公海', href: '/sea' },
  { key: 'mine', label: '我的', href: '/me' },
  { key: 'settings', label: '设置', href: '/settings' },
];

/** 侧栏高亮归属：漂流瓶页与日志属于「河道」，公海详情属于「公海」。 */
export function activeNavKey(name: RouteName): AppNavItem['key'] | null {
  switch (name) {
    case 'home':
    case 'river':
    case 'bottle':
    case 'bottleLog':
    case 'new':
      return 'river';
    case 'sea':
    case 'seaDetail':
      return 'sea';
    case 'profile':
      return 'mine';
    case 'settings':
      return 'settings';
    case 'admin':
      return null;
    default:
      return null;
  }
}

/**
 * 登录后跳回的站内路径。**只接受 `/` 开头的单斜杠相对路径** ——
 * `//evil.example` 与 `https://…` 都会被退回首页（防开放重定向）。
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (raw.includes('\\')) return '/';
  return raw;
}

export interface LinkClickLike {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface LinkTargetLike {
  href: string | null;
  target: string | null;
  download: boolean;
}

/**
 * 「这个点击要不要交给客户端路由？」—— 纯函数，便于把边界钉在测试里。
 *
 * 返回要导航的内部路径，或 `null`（说明交给浏览器：外链、下载、新窗口、修饰键点击）。
 * 设计系统里的 `SidebarNav` / `BottomNav` 渲染的是**真锚点**（`<a href>`），
 * 所以外壳只需在这一层做拦截，不必改设计系统组件。
 */
export function interceptTarget(
  event: LinkClickLike,
  anchor: LinkTargetLike | null,
): string | null {
  if (event.defaultPrevented) return null;
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (anchor === null) return null;
  if (anchor.target === '_blank' || anchor.download) return null;
  const href = anchor.href;
  if (href === null || !href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}
