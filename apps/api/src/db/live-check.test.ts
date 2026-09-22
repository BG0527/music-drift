/**
 * t19 Part 1b 的回归钉：**端到端检查必须跑在自己的可抛弃库上**。
 *
 * 为什么用"读文本 + 读纯函数"而不是跑一遍脚本来测：脚本要起服务、连真库、跑 26 步（那是
 * `node apps/web/tools/golden-path-live-check.mjs` 的活，属验证命令，不属单测基线）。
 * 但"它有没有把环境隔离这件事**做在代码里**"完全可以静态钉住 —— 而这次的病根正是
 * 它把隔离留给了"环境恰好干净"。
 *
 * 反向对照：把脚本里的自建库调用删掉 → 本文件先红。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isDerivedTestDatabaseName } from './test-database.js';

const scriptPath = fileURLToPath(new URL('../../../web/tools/golden-path-live-check.mjs', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');
const packagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts: Record<string, string> };

describe('live-check 的数据库隔离（hermetic）', () => {
  it('默认模式自建可抛弃库：调用 live-check:db create，并解析它打印的连接串', () => {
    expect(pkg.scripts['live-check:db']).toContain('src/db/live-check.ts');
    expect(script).toContain('live-check:db');
    expect(script).toContain('create');
    expect(script).toMatch(/databaseUrl/);
  });

  it('结束时删掉自己的库（含失败路径），并回收超龄残留库', () => {
    expect(script).toContain("'drop'");
    expect(script).toMatch(/finally/);
    expect(script).toMatch(/sweep/);
  });

  it('用独立端口启动自己的 API，且把自建库的连接串显式传进去', () => {
    expect(script).toMatch(/PORT|port/);
    expect(script).toContain('DATABASE_URL');
    expect(script).toMatch(/healthz/);
  });

  it('外部模式必须**显式**开启（不再默默用 8787 的 dev 服务，那正是运气来源）', () => {
    // 旧写法是 `const API = process.env.API_BASE ?? 'http://localhost:8787'` —— 静默默认连 dev 服务
    expect(script).not.toMatch(/process\.env\.API_BASE\s*\?\?\s*'http:\/\/localhost:8787'/);
    expect(script).toContain('API_BASE');
  });
});

describe('派生测试库命名守卫（删库前的结构性保险，不靠操作纪律）', () => {
  it('只认 music_drift_test_<...> 派生名', () => {
    expect(isDerivedTestDatabaseName('music_drift_test_1790105123_36828_ab12cd')).toBe(true);
  });

  it('开发库 / 基础库名 / 系统库一律不认（绝不误删）', () => {
    for (const name of ['music_drift', 'music_drift_test', 'postgres', 'template0', 'template1']) {
      expect(isDerivedTestDatabaseName(name)).toBe(false);
    }
  });

  it('前缀相似但不同名的库也不认（防止 like 模式误伤）', () => {
    for (const name of ['music_drift_testx', 'xmusic_drift_test_1_a', 'music_drift_prod_1_a']) {
      expect(isDerivedTestDatabaseName(name)).toBe(false);
    }
  });
});
