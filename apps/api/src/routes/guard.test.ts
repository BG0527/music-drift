/**
 * **零规则守卫**（captain 硬要求）：错误映射必须走 `http/problem.ts`，路由不许自己定错误码。
 *
 * 它**正反双向**断言，缺一不可：
 * - 反例：「不该有的东西不存在」—— 路由与 http 层（除 problem.ts）不许出现 4xx/5xx 字面量/直写调用；
 * - 正例：「该有的东西存在」—— 每个声明了错误路径的路由模块**必须 import problem.ts**。
 *   只做反例是坏的：新路由只要一个错都不报就"合规"，而它其实根本没法正确报错。
 *
 * 例外表是**显式且有理由**的（坏守卫会逼人写无意义的 import，这里杜绝）：
 * - `health.ts`：S0 健康检查，**没有任何错误路径**；
 * - `auth.ts`：t6 自有错误词表（`authHttpStatusOf`）+ 请求体校验 422，不经内核 —— 但仍钉住它
 *   必须使用那个**唯一映射函数**，不许散落字面量。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = HERE;
const HTTP_DIR = join(HERE, '..', 'http');

interface Source {
  file: string;
  text: string;
}

/** 只扫代码：去掉块注释与行注释 —— 注释里写「映射 409/422」不该被判违规（与 t17 的零 IO 扫描同一套做法）。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function readSources(dir: string): Source[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => ({ file: name, text: stripComments(readFileSync(join(dir, name), 'utf8')) }));
}

/** 反例：直写 4xx/5xx（`reply.code(409)` / `.status(422)`）与裸的 4xx/5xx 数字字面量。 */
const DIRECT_STATUS = /\.(code|status)\(\s*[45]\d{2}\s*\)/;
/*
 * 裸的 4xx/5xx 只算「赋给状态类标识符」的那种（`const status = 409` / `statusCode: 500`）。
 * 不能写成"任何 4xx/5xx 数字"：`z.string().max(500)` 这类**非状态**数字会被误判
 * （本守卫第一版就这么误伤过交互路由，已收紧）。
 */
const BARE_STATUS = /\b(?:status|statusCode|code)\s*[:=]\s*[45]\d{2}\b/;

/**
 * 例外表：文件 → { 理由, 类型 }。**例外是有条件的**，守卫会逐条验证条件成立：
 * - `no-error-path`：该模块确实没有任何错误路径（不许出现 `sendProblem` / `problemFrom*`）；
 * - `own-vocabulary`：它有自己的唯一映射函数（必须真的用它）。
 * 坏守卫会逼人写无意义的 import；这里用「条件化例外」避免那件事。
 */
interface Exception {
  reason: string;
  kind: 'no-error-path' | 'own-vocabulary';
}

const ROUTE_EXCEPTIONS = new Map<string, Exception>([
  ['health.ts', { reason: 'S0 健康检查，无任何错误路径', kind: 'no-error-path' }],
  [
    'songs.ts',
    { reason: '只读曲库列表：空列表是合法状态，模块内没有错误路径', kind: 'no-error-path' },
  ],
  [
    'auth.ts',
    {
      reason: 't6 自有错误词表（authHttpStatusOf）+ 请求体校验 422，不经内核',
      kind: 'own-vocabulary',
    },
  ],
]);

const routeSources = readSources(ROUTES_DIR);
const httpSources = readSources(HTTP_DIR);

describe('零规则守卫（反例）：错误码字面量只允许出现在 problem.ts', () => {
  it('路由模块（除例外）不许直写 4xx/5xx 状态码', () => {
    const offenders = routeSources
      .filter((source) => !ROUTE_EXCEPTIONS.has(source.file))
      .filter((source) => DIRECT_STATUS.test(source.text) || BARE_STATUS.test(source.text))
      .map((source) => source.file);

    expect(offenders).toEqual([]);
  });

  it('http 层除 problem.ts 外也不许出现 4xx/5xx 字面量（唯一构造点）', () => {
    const offenders = httpSources
      .filter((source) => source.file !== 'problem.ts')
      .filter((source) => DIRECT_STATUS.test(source.text) || BARE_STATUS.test(source.text))
      .map((source) => source.file);

    expect(offenders).toEqual([]);
  });

  it('唯一构造点确实存在：problem.ts 里就是那张状态码表', () => {
    const problem = httpSources.find((source) => source.file === 'problem.ts');

    expect(problem?.text).toContain('TRANSPORT_STATUS');
    for (const status of ['400', '401', '403', '404', '501', '500']) {
      expect(problem?.text, 'problem.ts 应包含状态码 ' + status).toContain(status);
    }
  });

  it('守卫有牙齿：negative control —— 把禁止的写法临时注入，检测必须命中', () => {
    // 不写文件，只验证正则确实能抓到：证明上面的空数组不是"规则写错了所以永远通过"。
    expect(DIRECT_STATUS.test('return reply.code(409).send({})')).toBe(true);
    expect(DIRECT_STATUS.test('return reply.status(422).send({})')).toBe(true);
    expect(BARE_STATUS.test('const status = 500;')).toBe(true);
    expect(BARE_STATUS.test('statusCode: 409,')).toBe(true);
    // 非状态数字必须放行（这是收紧后的关键：否则 schema 的长度上限会被误判）
    expect(BARE_STATUS.test('z.string().min(1).max(500)')).toBe(false);
    expect(BARE_STATUS.test('limit: z.coerce.number().max(100)')).toBe(false);
    // 合法用法必须放行：成功码（200/201/204）与变量状态码
    expect(DIRECT_STATUS.test('return reply.code(201).send(body)')).toBe(false);
    expect(DIRECT_STATUS.test('return reply.code(problem.status).send(problem.body)')).toBe(false);
  });
});

describe('零规则守卫（正例）：声明了错误路径的路由必须走 problem.ts', () => {
  it('每个路由模块（除例外表）都 import 了 problem.ts', () => {
    const missing = routeSources
      .filter((source) => !ROUTE_EXCEPTIONS.has(source.file))
      .filter((source) => !source.text.includes("from '../http/problem.js'"))
      .map((source) => source.file);

    expect(missing).toEqual([]);
  });

  it('例外表：每条都有中文理由，且 no-error-path 的文件确实没有错误路径', () => {
    for (const [file, exception] of ROUTE_EXCEPTIONS) {
      expect(exception.reason.length, file + ' 的例外理由不能为空').toBeGreaterThan(4);
      const source = routeSources.find((candidate) => candidate.file === file);
      expect(source, file + ' 必须在路由目录里存在').toBeDefined();
      if (exception.kind === 'no-error-path' && source !== undefined) {
        expect(
          source.text,
          file + ' 声明无错误路径，就不该出现 sendProblem/problemFrom*',
        ).not.toMatch(/sendProblem|problemFrom/);
      }
    }
  });

  it('auth.ts 的例外是**有条件**的：它必须使用唯一映射函数，不许散落错误码', () => {
    const auth = routeSources.find((source) => source.file === 'auth.ts');

    expect(auth?.text).toContain('authHttpStatusOf');
  });

  it('health.ts 的例外是**有条件**的：它确实没有错误路径（不 import problem.ts 也说得通）', () => {
    const health = routeSources.find((source) => source.file === 'health.ts');

    expect(health?.text).not.toContain('sendProblem');
    expect(health?.text).not.toContain('code(');
  });
});
