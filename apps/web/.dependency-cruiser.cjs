/**
 * dependency-cruiser 設定 — apps/web
 *
 * 由 test-generator（ring-setup）建立，供 F117 等 feature 之 metric gate #4 使用。
 * 執行： npm run deps:check --workspace=apps/web
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '元件 / API client 間不得存在 runtime 循環相依',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: false,
    exclude: { path: '\\.(spec|test)\\.tsx?$' },
  },
};
