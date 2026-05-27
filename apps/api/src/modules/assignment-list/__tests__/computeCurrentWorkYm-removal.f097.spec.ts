/**
 * F097 / AC-15 — 三 controller static computeCurrentWorkYm 移除（靜態掃描 regression）
 *
 * 涵蓋：
 *   - TS-F097-CTL-001：assignment-list.controller.ts 不含 computeCurrentWorkYm + 注入 SystemService
 *   - TS-F097-CTL-002：stage0-estimate.controller.ts 不含 computeCurrentWorkYm + 注入 SystemService
 *   - TS-F097-CTL-003：assignment-run.controller.ts 不含 computeCurrentWorkYm + 注入 SystemService
 *
 * 以實際檔案內容掃描（fs.readFileSync）驗證命名 drift / 殘留 static method，
 * 不可僅靠 Grep（依專案 feedback_grep_negative_lookahead）。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_SRC = join(__dirname, '..', '..', '..');

function read(relPath: string): string {
  return readFileSync(join(API_SRC, relPath), 'utf-8');
}

describe('F097 AC-15：三 controller computeCurrentWorkYm 移除（靜態掃描）', () => {
  const cases: Array<{ id: string; file: string }> = [
    {
      id: 'TS-F097-CTL-001',
      file: 'modules/assignment-list/assignment-list.controller.ts',
    },
    {
      id: 'TS-F097-CTL-002',
      file: 'modules/assignment-list/stage0-estimate.controller.ts',
    },
    {
      id: 'TS-F097-CTL-003',
      file: 'modules/assignment/assignment-run.controller.ts',
    },
  ];

  for (const { id, file } of cases) {
    it(`${id}：${file} 不含 computeCurrentWorkYm 字串`, () => {
      const src = read(file);
      expect(src).not.toContain('computeCurrentWorkYm');
    });

    it(`${id}：${file} 注入 SystemService`, () => {
      const src = read(file);
      expect(src).toContain('SystemService');
      // 建構子注入（private readonly systemService）
      expect(src).toMatch(/systemService\s*:\s*SystemService/);
    });
  }

  it('assignment-stage 三 controller 不再靜態引用 AssignmentListController.computeCurrentWorkYm', () => {
    const stageFiles = [
      'modules/assignment-stage/dept-ratio.controller.ts',
      'modules/assignment-stage/personnel-ratio.controller.ts',
      'modules/assignment-stage/stage-action.controller.ts',
    ];
    for (const f of stageFiles) {
      const src = read(f);
      expect(src).not.toContain('computeCurrentWorkYm');
    }
  });
});
