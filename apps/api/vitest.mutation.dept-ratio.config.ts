import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Stryker（dept-ratio 標的）專用 vitest include 範圍。
 *
 * 對應 `stryker.dept-ratio.conf.json`，只 mutate
 * `src/modules/assignment-stage/dept-ratio.service.ts`（F079 + F117）。
 *
 * 為何不沿用全域 `vitest.config.ts`：
 *   1. 全域 include（`src/**\/*.spec.ts`）會把整個 src 樹的 unit spec 拉進
 *      Stryker 的 initial dry run，其中含 HEAD baseline 即紅、與本標的無關的
 *      `*.mssql.spec.ts`（打共用 dev MSSQL，deadlock/timeout 且集合不固定）。
 *      Stryker 要求 dry run 全綠才產出分數 —— 一顆無關紅測試即讓整條 gate
 *      「無分數」（非分數偏低）。
 *   2. 全域 include 的 `test/**\/*.spec.ts` 不比對本專案 e2e 慣用的
 *      `*.e2e-spec.ts` 命名，會漏掉 `test/f117-dept-ratio-director-filter.e2e-spec.ts`
 *      —— 而該檔是唯一能殺死 `computeActiveDirectorMap()` 內 TypeORM QueryBuilder
 *      SQL 字串突變（'TRIM(e.dept_code)'、'處長'、orderBy 方向）的測試；mock repo
 *      的 unit test 結構上無法偵測（mock 不執行真實 SQL）。
 *
 * 詳見 docs/test-specs/risks-and-gaps.md「F117」R-F117-05。
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: [
      'src/modules/assignment-stage/__tests__/dept-ratio.service.spec.ts',
      'test/f117-dept-ratio-director-filter.e2e-spec.ts',
    ],
    exclude: ['**/node_modules/**', '**/*.mssql.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [swc.vite()],
});
