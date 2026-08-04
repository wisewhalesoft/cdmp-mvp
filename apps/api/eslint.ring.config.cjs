/**
 * eslint 設定（flat config, ESLint 10）— 僅供 test-generator 之 metric gate #4 使用
 * （cyclomatic complexity / 函式長度 / 巢狀深度 / 檔案長度）。
 *
 * 刻意獨立於任何全域 eslint 設定之外（本專案原無 eslint 設定），
 * 只掃描本輪 feature 觸及之業務邏輯檔案，避免對既有全 repo 產生無關雜訊。
 *
 * 執行： npm run gate:complexity --workspace=apps/api
 */
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: [
      'src/modules/assignment-stage/dept-ratio.service.ts',
      'src/modules/assignment-stage/dept-ratio.controller.ts',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    rules: {
      // Uncle Bob 建議：單一函式 cyclomatic complexity 上限
      complexity: ['error', 10],
      // 單一函式長度上限（skip 空白/註解，避免文件字串誤判）
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      // 巢狀深度（if/for 巢狀過深為壞味道）
      'max-depth': ['error', 4],
      // 單一模組檔案長度上限（module size gate）
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
];
