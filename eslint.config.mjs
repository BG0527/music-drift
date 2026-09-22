import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '.agent-teams/**',
      '.dsh/**',
      'docs/figma/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '**/*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // t9 零规则守卫（可执行版）：错误映射必须走 `apps/api/src/http/problem.ts`。
    // 只禁**参数为 4xx/5xx** 的直写 —— 成功码（200/201/204）与变量状态码必须放行，
    // 否则会误伤「登出 204」「创建 201」这类合法用法（captain 收窄要求）。
    // 例外：`auth.ts`（t6 自有词表 authHttpStatusOf + 请求体校验 422）、`health.ts`/`songs.ts`（无错误路径）。
    files: ['apps/api/src/routes/**/*.ts'],
    ignores: ['**/*.test.ts', 'apps/api/src/routes/auth.ts', 'apps/api/src/routes/health.ts', 'apps/api/src/routes/songs.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name=/^(code|status)$/][arguments.0.value=/^[45]/]",
          message: '错误映射必须走 http/problem.ts（传输层码或内核 violations），不要在路由里直写 4xx/5xx。',
        },
        {
          selector: 'ThrowStatement',
          message: '路由不要抛裸错：那会把 SQL/堆栈带进响应体（app.ts 的 errorHandler 只做兜底）。',
        },
      ],
    },
  },
  {
    // ADR-005 不变式 4 / t5 不变量：**时间戳统一走注入时钟**。
    // API 与持久化层禁止自取墙上时间（`Date.now()` / `new Date()`），
    // 它们必须用 `createSystemClock()`（唯一授权位置：domain/ports.ts）把时间注入下去。
    // 测试与迁移/种子脚本不受此限（它们的"现在"本身就是测试夹具的一部分）。
    files: ['apps/api/src/**/*.ts', 'packages/shared/src/contracts/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      '**/*.integration.test.ts',
      '**/global-setup.ts',
      '**/test-helpers.ts',
      // 测试基础设施：这里的时间只用于**测试库命名**与**陈旧库回收阈值**，
      // 不产生任何业务时间戳（业务时间一律 createSystemClock 注入）。
      '**/db/test-database.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: '禁止直接读墙上时钟：请用 createSystemClock() 注入时间（ADR-005 不变式 4）。',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            '禁止 new Date() 取当前时间：请用 createSystemClock() 注入时间（ADR-005 不变式 4）。',
        },
      ],
    },
  },
  prettier,
);
