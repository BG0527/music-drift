import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, activeNavKey, buildPath, matchRoute, safeNextPath } from './routes';

/**
 * 路由是**纯函数**：给一条 pathname，返回「哪一页 + 参数」。
 * 这里不引入 react-router（未在设计文档的依赖基线里登记），自建最小路由表。
 */
describe('路由表', () => {
  it('识别四个一级入口（河道 / 公海 / 我的 / 设置）', () => {
    expect(matchRoute('/river').name).toBe('river');
    expect(matchRoute('/sea').name).toBe('sea');
    expect(matchRoute('/me').name).toBe('profile');
    expect(matchRoute('/settings').name).toBe('settings');
    expect(NAV_ITEMS.map((item) => item.key)).toEqual(['river', 'sea', 'mine', 'settings']);
  });

  it('首页是 / 而不是 /home，登录页是 /login、选歌页是 /new', () => {
    expect(matchRoute('/').name).toBe('home');
    expect(matchRoute('/login').name).toBe('login');
    expect(matchRoute('/new').name).toBe('new');
  });

  it('漂流瓶页从路径里取出 id，并把 /log 子路径路由到漂流日志', () => {
    const bottle = matchRoute('/bottles/8f1d6c2e-0f1a-4a1e-9f2b-111111111111');
    expect(bottle.name).toBe('bottle');
    expect(bottle.params['id']).toBe('8f1d6c2e-0f1a-4a1e-9f2b-111111111111');

    const log = matchRoute('/bottles/8f1d6c2e-0f1a-4a1e-9f2b-111111111111/log');
    expect(log.name).toBe('bottleLog');
    expect(log.params['id']).toBe('8f1d6c2e-0f1a-4a1e-9f2b-111111111111');
  });

  it('公海详情路由已删除（用户裁决：与瓶子详情冲突）：/sea/:id 落到 notFound，/sea 仍是大厅', () => {
    expect(matchRoute('/sea').name).toBe('sea');
    const removed = matchRoute('/sea/8f1d6c2e-0f1a-4a1e-9f2b-222222222222');
    expect(removed.name).toBe('notFound');
    expect(removed.params['id']).toBeUndefined();
  });

  it('忽略查询串与尾斜杠，未知路径落到 notFound（不白屏）', () => {
    expect(matchRoute('/river?hello=1').name).toBe('river');
    expect(matchRoute('/sea/').name).toBe('sea');
    expect(matchRoute('/nope/deep').name).toBe('notFound');
    expect(matchRoute('/bottles/').name).toBe('notFound');
  });

  it('buildPath 与 matchRoute 互为逆运算（构造的链接一定能被匹配回来）', () => {
    const id = '8f1d6c2e-0f1a-4a1e-9f2b-333333333333';
    for (const [name, params] of [
      ['river', {}],
      ['bottle', { id }],
      ['bottleLog', { id }],
      ['sea', {}],
      ['settings', {}],
    ] as const) {
      const path = buildPath(name, params as Record<string, string>);
      expect(matchRoute(path).name).toBe(name);
    }
  });

  it('侧栏高亮：漂流瓶相关页归属「河道」，公海大厅归属「公海」', () => {
    expect(activeNavKey('river')).toBe('river');
    expect(activeNavKey('bottle')).toBe('river');
    expect(activeNavKey('bottleLog')).toBe('river');
    expect(activeNavKey('sea')).toBe('sea');
    expect(activeNavKey('profile')).toBe('mine');
    expect(activeNavKey('settings')).toBe('settings');
    expect(activeNavKey('login')).toBeNull();
    // G4/P1：admin 页高亮归「审核台」，不是河道（route-view 兜底会把 null 错标成河道）
    expect(activeNavKey('admin')).toBe('admin');
  });

  it('safeNextPath 只接受站内相对路径（防开放重定向）', () => {
    expect(safeNextPath('/bottles/abc')).toBe('/bottles/abc');
    expect(safeNextPath('https://evil.example/x')).toBe('/');
    expect(safeNextPath('//evil.example/x')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('bottles/abc')).toBe('/');
  });
});
