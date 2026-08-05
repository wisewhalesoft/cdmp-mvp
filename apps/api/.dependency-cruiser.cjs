/**
 * dependency-cruiser 設定 — apps/api
 *
 * 由 test-generator（ring-setup）建立，供 F117 等 feature 之 metric gate #4 使用：
 *   - no-circular：禁止 runtime 循環相依
 *   - no-orphans：業務模組內禁止孤兒檔（未被任何檔案 import，通常代表死碼或漏接線）
 *
 * 執行： npm run deps:check --workspace=apps/api
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        '模組間不得存在 runtime 循環相依（型別循環於編譯時會被抹除，不在此列，見 tsPreCompilationDeps:false）',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'src 內非入口檔案若未被任何模組 import，可能為死碼',
      from: { orphan: true, pathNot: ['\\.spec\\.ts$', '\\.e2e-spec\\.ts$', 'main\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: false,
    exclude: { path: '\\.(spec|test|itest|e2e-spec)\\.ts$' },
  },
};
