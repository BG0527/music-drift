import { describe, expect, it } from 'vitest';
import { interceptTarget, type LinkClickLike } from './routes';

const plainClick: LinkClickLike = {
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

const link = (
  href: string | null,
  extra: Partial<{ target: string | null; download: boolean }> = {},
) => ({
  href,
  target: extra.target ?? null,
  download: extra.download ?? false,
});

describe('站内链接拦截决策（外壳的 SPA 导航）', () => {
  it('普通左键点站内链接 → 交给客户端路由', () => {
    expect(interceptTarget(plainClick, link('/sea'))).toBe('/sea');
    expect(interceptTarget(plainClick, link('/bottles/abc/log'))).toBe('/bottles/abc/log');
  });

  it('外链 / 协议相对链接 / 空 href 一律不拦（交给浏览器）', () => {
    expect(interceptTarget(plainClick, link('https://example.com'))).toBeNull();
    expect(interceptTarget(plainClick, link('//example.com'))).toBeNull();
    expect(interceptTarget(plainClick, link(null))).toBeNull();
    expect(interceptTarget(plainClick, null)).toBeNull();
  });

  it('修饰键、非左键、新窗口、下载链接都不拦（尊重浏览器行为）', () => {
    expect(interceptTarget({ ...plainClick, ctrlKey: true }, link('/sea'))).toBeNull();
    expect(interceptTarget({ ...plainClick, metaKey: true }, link('/sea'))).toBeNull();
    expect(interceptTarget({ ...plainClick, shiftKey: true }, link('/sea'))).toBeNull();
    expect(interceptTarget({ ...plainClick, altKey: true }, link('/sea'))).toBeNull();
    expect(interceptTarget({ ...plainClick, button: 1 }, link('/sea'))).toBeNull();
    expect(interceptTarget(plainClick, link('/sea', { target: '_blank' }))).toBeNull();
    expect(interceptTarget(plainClick, link('/sea', { download: true }))).toBeNull();
  });

  it('已被别人 preventDefault 的事件不再重复处理', () => {
    expect(interceptTarget({ ...plainClick, defaultPrevented: true }, link('/sea'))).toBeNull();
  });
});
