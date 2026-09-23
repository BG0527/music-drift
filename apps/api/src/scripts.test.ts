/**
 * 启动路径守卫（t19 Finding：README 照着做**起不来**）。
 *
 * 事实：`db:migrate` / `db:seed` 显式带了 `--env-file-if-exists=../../.env`，而 `start` / `dev` 没有
 * ⇒ 从仓库根 `pnpm --filter @music-drift/api start` 会走「未配置 DATABASE_URL」降级：
 * `/api/auth/*`、`/api/segments/:id/audio` 与全部 DB 路由**都不挂**，`/api/songs` 返回 404。
 * README 教用户「复制 .env.example → 跑 migrate → 起服务」，照着做服务是坏的，且**症状像代码 bug**。
 *
 * 这个守卫把「哪些脚本必须加载根 .env」写成可证伪的清单：
 * - 凡是**启动服务**或**连数据库**的脚本，都必须带 `--env-file-if-exists=../../.env`；
 * - 并显式断言路径是 `../../.env`（`apps/api` 的 cwd 决定；写成 `../.env` 会静默读不到）；
 * - 纯前端/纯测试脚本不需要（避免把无关脚本也硬塞 flag）。
 *
 * 反向对照（本文件的价值所在）：删掉 `start` 里的 flag → 本测试必须红。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {
  scripts: Record<string, string>;
};

/** 启动服务或连数据库的脚本 —— 缺 flag 就是「照 README 做会坏」。 */
const NEEDS_ROOT_ENV = ['start', 'dev', 'db:migrate', 'db:seed', 'live-check:db'] as const;

/** 明确**不**需要该 flag 的脚本（写在这里，防止将来有人一刀切地全都加上）。 */
const DOES_NOT_NEED_ROOT_ENV = [
  'test',
  'test:watch',
  'test:integration',
  'typecheck',
  'db:generate',
] as const;

const ENV_FLAG = '--env-file-if-exists=../../.env';

describe('apps/api 脚本：启动/连库路径必须加载根 .env', () => {
  it('服务与数据库脚本都带 --env-file-if-exists=../../.env（与 db:migrate 口径一致）', () => {
    for (const name of NEEDS_ROOT_ENV) {
      const script = pkg.scripts[name];
      expect(script, `scripts.${name} 应存在`).toBeTypeOf('string');
      expect(script, `scripts.${name} 缺 ${ENV_FLAG}`).toContain(ENV_FLAG);
    }
  });

  it('路径必须是 ../../.env（apps/api 的 cwd 决定），且不能是别处的 .env', () => {
    for (const name of NEEDS_ROOT_ENV) {
      const script = pkg.scripts[name] ?? '';
      expect(script).toContain('--env-file-if-exists=../../.env');
      expect(script, `scripts.${name} 不应指向其他 .env`).not.toMatch(
        /--env-file(?!-if-exists=\.\.\/\.\.\/\.env)/,
      );
    }
  });

  /**
   * ⚠️ 这里断言**完整命令**而不是"包含几个片段"：本文件第一版只断言 dev 里同时有 `watch`、`src/server.ts`
   * 和那个 flag —— 而当时把 flag 插在 `tsx` 与 `watch` 之间的写法（`tsx --env-file-… watch src/server.ts`）
   * **照样通过**，实际却把 `watch` 当成了入口模块：
   *   `Cannot find module 'D:\...ppspi\watch'`（ERR_MODULE_NOT_FOUND，服务根本起不来）。
   * 断言太软 = 守卫只会点头。顺序在 tsx 这里是语义的一部分：子命令必须在 node flag 之后。
   */
  it('start / dev 的完整命令被钉死（tsx 的子命令顺序是语义的一部分）', () => {
    expect(pkg.scripts['start']).toBe('tsx --env-file-if-exists=../../.env src/server.ts');
    expect(pkg.scripts['dev']).toBe('tsx watch --env-file-if-exists=../../.env src/server.ts');
  });

  it('dev 是 watch 形态、start 是一次性形态：两者入口一致，只差 watch', () => {
    const start = pkg.scripts['start'] ?? '';
    const dev = pkg.scripts['dev'] ?? '';
    expect(start).toContain('src/server.ts');
    expect(dev).toContain('src/server.ts');
    // `tsx watch` 子命令必须紧跟在 tsx 之后（前面只允许出现 node 的 --env-file 之外的 flag 会破坏它）
    expect(dev.startsWith('tsx watch ')).toBe(true);
  });

  it('纯测试/类型脚本不加载 .env（基线命令不得依赖数据库配置）', () => {
    for (const name of DOES_NOT_NEED_ROOT_ENV) {
      expect(pkg.scripts[name] ?? '', `scripts.${name} 不该加载 .env`).not.toContain('--env-file');
    }
  });
});
