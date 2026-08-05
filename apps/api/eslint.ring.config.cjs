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
  {
    // F118（2026-08-04）：新增 checkCopyDuplicates 方法 + findActiveConditionDuplicate 之
    // ORDER BY 一行修改。assignment-list.controller.ts（237 行）沿用與 dept-ratio 相同的
    // max-lines 門檻（400）——現況遠低於門檻，屬有意義的檢查。
    //
    // assignment-list.service.ts（開工前已 1580 行，既有、非 F118 造成之技術債，見
    // docs/test-specs/features/F118-test.md「max-lines 門檻特別說明」與
    // docs/test-specs/risks-and-gaps.md「F118」）：per-function 規則
    // （complexity / max-lines-per-function / max-depth）不受檔案總長度影響，
    // 仍能有意義地檢查新增之 checkCopyDuplicates；max-lines 門檻設為現況 + 合理增量
    // （1650，容納新方法 ~50-70 行），使其仍能偵測「F118 是否讓檔案不成比例地繼續膨脹」，
    // 而非對既有債務重複告警、也不悄悄調高到毫無意義的天花板。
    files: [
      'src/modules/assignment-list/assignment-list.controller.ts',
      'src/modules/assignment-list/assignment-list.service.ts',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    rules: {
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      'max-lines': ['error', { max: 1650, skipBlankLines: true, skipComments: true }],
    },
  },
];
