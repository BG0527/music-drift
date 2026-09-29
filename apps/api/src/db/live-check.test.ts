/**
 * t19 Part 1b 的回归钉：**端到端检查必须跑在自己的可抛弃库上**。
 *
 * 为什么用"读文本 + 读纯函数"而不是跑一遍脚本来测：脚本要起服务、连真库、跑 27 步（那是
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

const scriptPath = fileURLToPath(
  new URL('../../../web/tools/golden-path-live-check.mjs', import.meta.url),
);
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

  it('外部模式必须**显式**开启（默认值随端口迁移仍需显式开启——守卫端口无关，那正是运气来源）', () => {
    // 旧写法是 `const API = process.env.API_BASE ?? 'http://localhost:<旧默认端口>'`（端口已迁 8788）——
    // 静默默认连 dev 服务。模式串必须**端口无关**：钉死具体端口会让迁移后的同类写法绕过守卫。
    expect(script).not.toMatch(/API_BASE\s*\?\?\s*'http:\/\/localhost:\d+'/);
    expect(script).toContain('API_BASE');
  });
});

describe('第 27 步 /api/me/bottles（P0 漂流日志的端到端证明）', () => {
  it('脚本里真的有这一步，且覆盖 role / mySegmentIndexes / 斩浪后仍算参与过', () => {
    expect(script).toContain('/api/me/bottles');
    expect(script).toMatch(/mySegmentIndexes/);
    expect(script).toMatch(/role/);
    // 斩浪语义（§16.7）—— 这条端点最容易写错的地方，必须在端到端检查里出现
    expect(script).toMatch(/斩浪/);
    expect(script).toMatch(/DAMAGED/);
  });

  it('步数为 27：脚本正文与注释里不得再残留旧口径「26 步」', () => {
    expect(script).toContain('27 步');
    expect(script).not.toMatch(/26 步/);
  });
});

describe('外部模式不可能被误当验收证据（captain 裁决 ②）', () => {
  it('开头就打印醒目横幅「外部模式 · 非验收证据」', () => {
    expect(script).toContain('⚠ 外部模式 · 非验收证据');
    // 横幅必须在跑检查之前（runChecks 调用之前出现）
    expect(script.indexOf('⚠ 外部模式 · 非验收证据')).toBeLessThan(
      script.indexOf('await runChecks()'),
    );
  });

  it('非确定性步骤单列「未复现（数据不受控）」，与 pass/fail 并列且不计 pass', () => {
    expect(script).toContain('未复现（数据不受控');
    expect(script).toMatch(/inconclusive/);
  });

  it('hermetic 模式下「未复现」必须升级为失败（数据受控时没有借口）', () => {
    // unreproducible(): 外部模式计 inconclusive；hermetic 模式必须走 must(false, ...)
    expect(script).toMatch(/hermetic === null[\s\S]{0,200}inconclusive/);
    expect(script).toMatch(/unreproducible[\s\S]{0,400}must\(false/);
  });

  it('空的 API_BASE 视为"没给"（否则会静默进入外部模式、把配置错误伪装成检查失败）', () => {
    // 实测踩过：`API_BASE= node …` → API='' → 进了"外部模式"，所有请求打向空 URL 全红。
    // 空字符串在 shell/CI 里非常常见（`API_BASE=$SOMETHING_UNSET`），必须当"未设置"处理。
    expect(script).toMatch(/API_BASE[\s\S]{0,160}length > 0/);
  });

  it('文献层写死「验收证据只认 hermetic 模式」（脚本注释 + docs/api.md）', () => {
    expect(script).toContain('验收证据只认 hermetic');
    const api = readFileSync(
      fileURLToPath(new URL('../../../../docs/api.md', import.meta.url)),
      'utf8',
    );
    expect(api).toContain('验收证据只认 hermetic');
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
