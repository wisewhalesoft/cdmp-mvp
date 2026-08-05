import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Stryker（assignment-list 標的）專用 vitest include 範圍。
 *
 * 對應 `stryker.assignment-list.conf.json`，只 mutate
 * `src/modules/assignment-list/assignment-list.service.ts`（F048/F050/F051/F052/F118）。
 *
 * include 涵蓋該模組全部 SQLite unit spec，而非僅 F118 新增之
 * `f118-copy-duplicate-check.spec.ts`：該檔為既有 1682 行大檔，若只納入新測試，
 * 其既有邏輯（createList / updateList / normalizeConditionPayload 等）會被判為
 * NoCoverage，產出一個「看似低但失真」的分數。
 *
 * 刻意排除：
 *   - `*.mssql.spec.ts`：需外部 dev MSSQL，baseline 即不穩定（deadlock/timeout），
 *     會讓 dry run 失敗 → 整條 gate 無分數。
 *   - `test/*.e2e-spec.ts`：HTTP + Guard 完整開銷。本模組既有 unit spec 本身即為
 *     真實 SQLite round-trip，已足以偵測 ORDER BY / 欄位名等字串突變（與 F117
 *     需 e2e 才能殺死 QueryBuilder 字串突變的情況不同）。
 *
 * ⚠️ 已知不穩定（2026-08-05，Windows）：本標的之 Stryker dry run 偶發原生崩潰
 *    `exit code 3221225477`（0xC0000005 ACCESS_VIOLATION），推測為 better-sqlite3
 *    於 Stryker 沙箱內大量建立/銷毀 in-memory DataSource 所致。同一份設定實測
 *    4 次中失敗 3 次、成功 1 次 —— **非設定問題，重跑即可**（伴隨出現的
 *    `[vite] Failed to load source map ... stryker-setup.js.map` 僅為警告，非死因；
 *    曾嘗試以 swc `sourceMaps:false` 消除該警告，對崩潰無效，已還原）。
 *    dept-ratio 標的僅 2 個 spec 檔，未觀察到此現象。CI 若採用本 gate 應加重試。
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/modules/assignment-list/__tests__/*.spec.ts'],
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
