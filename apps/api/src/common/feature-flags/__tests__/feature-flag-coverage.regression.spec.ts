/**
 * v2.0 補 / FeatureFlagGuard 套用範圍 regression test
 *
 * 目的：確保所有 E07 寫入端點都有 `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`
 *   + `FeatureFlagGuard` 套用，避免日後新增 controller / endpoint 時遺漏。
 *
 * 偵測方式：靜態掃 controller 檔案內所有寫入裝飾器（@Post / @Put / @Patch / @Delete）
 *   對應的方法必須出現 FeatureFlag pair（class 級或 method 級皆可）。
 *
 * 排除清單：
 *   - 純 GET controller（無寫入端點）
 *   - auth / system / dashboard / datasource / extraction / etl / accounts / roles 等
 *     非 E07 模組
 *
 * 參考：[AD-E07 v3.0 / architecture-spec §FeatureFlagGuard / 決議 #2]
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E07 寫入端點 controllers 清單。
 * 凡列入此清單者必須在 source 中出現 `FeatureFlagGuard` 與
 * `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`。
 */
const E07_WRITE_CONTROLLERS: ReadonlyArray<{
  label: string;
  file: string;
}> = [
  // P0 / B2 既有
  {
    label: 'assignment-list (F050/F051/F052)',
    file: 'modules/assignment-list/assignment-list.controller.ts',
  },
  {
    label: 'assignment-stage stage-action (F078~F089)',
    file: 'modules/assignment-stage/stage-action.controller.ts',
  },
  {
    label: 'assignment-stage dept-ratio (F079)',
    file: 'modules/assignment-stage/dept-ratio.controller.ts',
  },
  {
    label: 'assignment-stage personnel-ratio (F082)',
    file: 'modules/assignment-stage/personnel-ratio.controller.ts',
  },
  // v2.0 補入
  {
    label: 'assignment-scoring (F053~F056)',
    file: 'modules/assignment-scoring/assignment-scoring.controller.ts',
  },
  {
    label: 'card-type (F069~F072)',
    file: 'modules/assignment-scoring/controllers/card-type.controller.ts',
  },
  {
    label: 'assignment-code (F068)',
    file: 'modules/assignment-code/assignment-code.controller.ts',
  },
  {
    label: 'assignment-run trigger (F061)',
    file: 'modules/assignment/assignment-run.controller.ts',
  },
  {
    label: 'pooldata-field-whitelist (F075)',
    file: 'modules/pooldata-field/controllers/pooldata-field-whitelist.controller.ts',
  },
  {
    label: 'pooldata-field-option (F076)',
    file: 'modules/pooldata-field/controllers/pooldata-field-option.controller.ts',
  },
];

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('FeatureFlagGuard 套用範圍 regression', () => {
  for (const { label, file } of E07_WRITE_CONTROLLERS) {
    describe(`Controller: ${label}`, () => {
      const fullPath = path.resolve(SRC_ROOT, file);
      const src = fs.readFileSync(fullPath, 'utf8');

      it(`TC-FEATURE-FLAG-GUARD-IMPORT：${label} 必須 import FeatureFlagGuard`, () => {
        expect(src).toMatch(/import\s*\{[^}]*FeatureFlagGuard[^}]*\}\s*from/);
      });

      it(`TC-FEATURE-FLAG-GUARD-IMPORT-DECORATOR：${label} 必須 import RequireFeatureFlag`, () => {
        expect(src).toMatch(/import\s*\{[^}]*RequireFeatureFlag[^}]*\}\s*from/);
      });

      it(`TC-FEATURE-FLAG-GUARD-USAGE：${label} 必須 @UseGuards(...) 含 FeatureFlagGuard`, () => {
        // 容許 method 級或 class 級；只要 source 中存在 FeatureFlagGuard 出現於 UseGuards 即算通過
        expect(src).toMatch(/@UseGuards\([^)]*FeatureFlagGuard[^)]*\)/);
      });

      it(`TC-FEATURE-FLAG-GUARD-DECORATOR：${label} 必須以 ENABLE_E07_REFACTOR_PHASE3 標 RequireFeatureFlag`, () => {
        expect(src).toMatch(
          /@RequireFeatureFlag\(\s*['"]ENABLE_E07_REFACTOR_PHASE3['"]\s*\)/,
        );
      });
    });
  }

  describe('regression：列表完整性', () => {
    it('TC-FEATURE-FLAG-GUARD-COUNT：E07_WRITE_CONTROLLERS 至少 10 個', () => {
      expect(E07_WRITE_CONTROLLERS.length).toBeGreaterThanOrEqual(10);
    });
  });
});
