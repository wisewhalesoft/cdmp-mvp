/**
 * F050 v2.1 重構（AD-E07-18 §18.7 Step 1 / §18.7 Step 5 / GAP-LIST §I1）：
 *   AppModule 不再 import AssignmentCodeModule；assignment-code/ 目錄已刪除。
 *
 * 對應 test spec：
 *   - TS-F068-DEP-005：`assignment-code/` 模組目錄已刪除
 *     - app.module.ts 中**不含** AssignmentCodeModule import
 *     - assignment-code/ 目錄**不存在**
 *
 * 涵蓋 cases（C5 拍板：regression-guard 靜態檔案掃描）：
 *   - app.module.ts 內容不含 'AssignmentCodeModule' 字串
 *   - apps/api/src/modules/assignment-code/ 目錄不存在
 *
 * 註：本 spec 為 W10/W11/W12 共同的 regression guard，W10 commit 後 app.module.ts
 * 條件可立即綠；W11/W12 commit 後目錄條件才綠。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('TS-F068-DEP-005：F068 模組廢除 regression guard', () => {
  const SRC_ROOT = path.resolve(__dirname, '..');

  it('app.module.ts 不含 AssignmentCodeModule import 與 imports[] 引用', () => {
    const appModulePath = path.join(SRC_ROOT, 'app.module.ts');
    expect(fs.existsSync(appModulePath)).toBe(true);
    const content = fs.readFileSync(appModulePath, 'utf8');

    // import 宣告
    expect(content).not.toMatch(/import\s*\{\s*AssignmentCodeModule\s*\}/);
    // imports[] 陣列引用
    expect(content).not.toMatch(/\bAssignmentCodeModule\b/);
  });

  it('apps/api/src/modules/assignment-code/ 目錄不存在', () => {
    const moduleDir = path.join(SRC_ROOT, 'modules', 'assignment-code');
    expect(fs.existsSync(moduleDir)).toBe(false);
  });
});
