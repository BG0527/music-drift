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
