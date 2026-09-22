import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DOMAIN_DIR = dirname(fileURLToPath(import.meta.url));

/** 唯一允许出现 `Date.now()` 的文件：生产时钟适配器（内核命令永不直接调用）。 */
const WALL_CLOCK_ADAPTERS = ['ports.ts'];

const FORBIDDEN_EVERYWHERE = ['new Date(', 'Math.random(', 'fetch(', 'require(', 'process.env'];
const FORBIDDEN_UNLESS_ADAPTER = [...FORBIDDEN_EVERYWHERE, 'Date.now(', "from 'node:"];

/** 只扫代码：去掉块注释与行注释，避免「文档里提到这些 API」被误判为违规。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('ADR-005 不变式 4 — 内核零 IO、零隐式时间源', () => {
  it('领域源码里没有墙上时钟、全局随机、网络、文件系统或环境变量', () => {
    const files = readdirSync(DOMAIN_DIR).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    expect(files.length).toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(join(DOMAIN_DIR, file), 'utf8'));
      const forbidden = WALL_CLOCK_ADAPTERS.includes(file)
        ? FORBIDDEN_EVERYWHERE
        : FORBIDDEN_UNLESS_ADAPTER;
      for (const needle of forbidden) {
        if (source.includes(needle)) {
          offenders.push(`${file}: ${needle}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('时钟、ID、随机源都是从外部注入的端口', async () => {
    const domain = await import('./index');

    for (const symbol of [
      'createManualClock',
      'createSystemClock',
      'createSequentialIds',
      'createDomainContext',
    ]) {
      expect(typeof domain[symbol as keyof typeof domain], `index 应导出 ${symbol}`).toBe(
        'function',
      );
    }
  });
});
