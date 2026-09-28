import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (): string =>
  readFileSync(resolve(process.cwd(), 'tools', 'golden-path-live-check.mjs'), 'utf8');

describe('golden path 使用公共 BottleDetail / 日志契约', () => {
  it('RETURN 后通过 C 会话的 isHolder 验证持有权，不读取已删除的稳定 UUID', () => {
    const text = source();

    expect(text).not.toContain('.holderId');
    expect(text).toMatch(/call\(C\.session, 'GET', `\/api\/bottles\/\$\{bottleId\}`\)/);
    expect(text).toMatch(/body\?\.isHolder === true/);
  });

  it('系统日志按公开 actorCode 判断，不读取已删除的 actorId', () => {
    const text = source();

    expect(text).not.toContain("event.actorId === 'SYSTEM'");
    expect(text).toContain("event.actorCode === '系统'");
  });
});
