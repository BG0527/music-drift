import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('可运行参考页与产品退役规则一致', () => {
  it('真实音频黄金路径读取可解码录音素材，不再仅构造WebM魔数', () => {
    const text = readFileSync(resolve(process.cwd(), 'tools/golden-path-live-check.mjs'), 'utf8');
    expect(text).toContain('demo-segment.webm');
    expect(text).not.toContain('new Uint8Array(size)');
  });
  it('我的和设置参考页不再调用徽章或显示邮箱', () => {
    for (const file of ['app/page-me.js', 'app/page-settings.js', 'me.html', 'settings.html']) {
      const text = readFileSync(resolve(process.cwd(), '../../site', file), 'utf8');
      expect(text, file).not.toMatch(/\/api\/me\/badges|user\.email|我的徽章|listener@example\.com|账号与邮箱|代号（邮箱）/);
    }
  });
});
