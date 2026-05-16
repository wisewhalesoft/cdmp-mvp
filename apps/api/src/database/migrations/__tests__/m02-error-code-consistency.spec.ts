/**
 * TC-GUARD-ERRORCODE-001 / TC-GUARD-TIMESTAMP-001（Iter 6）
 *
 * 對應 docs/test-specs/regression/M02-regression-guards.md。
 *
 * 採 fs read + JS regex（不用 Grep tool — memory feedback_grep_negative_lookahead），
 * 不依賴 DB connection，可在任何環境跑。
 *
 * 涵蓋：
 *   1. TC-GUARD-ERRORCODE-001：F055/F056 錯誤碼拆分後無殘留：
 *      - 舊 `CARD_LEVEL_NOT_FOUND`（裸名）應不再出現（已拆分為 IN_VERSION / RECORD / REFERENCED）
 *      - F069~F072 新增錯誤碼存在
 *      - F056 v1.5 新增 TIER_LEVEL_INVALID_ENUM / CARD_TYPE_FALLBACK_STANDARD_MUTEX 存在
 *      - F055 v1.5 新增 CARD_LEVEL_DUPLICATE（POST §5.4 / BR-9）
 *   2. TC-GUARD-TIMESTAMP-001：ob_card_type entity 日期欄位採 dateColumnType helper
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const API_ROOT = path.resolve(__dirname, '../../../..');

function readFile(rel: string): string {
  return fs.readFileSync(path.resolve(API_ROOT, rel), 'utf-8');
}

describe('TC-GUARD-ERRORCODE-001：M02 錯誤碼一致性 (fs + JS regex)', () => {
  const SERVICE_FILE =
    'src/modules/assignment-scoring/assignment-scoring.service.ts';
  const CARD_TYPE_SERVICE_FILE =
    'src/modules/assignment-scoring/services/card-type.service.ts';

  it('F055 錯誤碼拆分：service 內 CARD_LEVEL 相關錯誤碼皆為合法後綴（IN_VERSION / RECORD_NOT_FOUND / REFERENCED）', () => {
    const rawSource = readFile(SERVICE_FILE);
    // 移除註解（//...EOL 與 /*...*/）後再 regex，避免註解中提及舊錯誤碼導致誤判
    const sourceNoComments = rawSource
      .replace(/\/\*[\s\S]*?\*\//g, '') // 移除 /* block comments */
      .replace(/\/\/[^\n]*/g, ''); // 移除 // line comments

    const allOccurrences =
      sourceNoComments.match(/\bCARD_LEVEL_[A-Z_]+\b/g) ?? [];
    const validCodes = new Set([
      'CARD_LEVEL_NOT_FOUND_IN_VERSION',
      'CARD_LEVEL_RECORD_NOT_FOUND',
      'CARD_LEVEL_REFERENCED',
      // F055 v1.5 §5.4 POST 新增（error-handling.md v1.9 / F055 BR-9）
      'CARD_LEVEL_DUPLICATE',
    ]);
    const invalidTokens = new Set<string>();
    for (const occ of allOccurrences) {
      if (!validCodes.has(occ)) {
        invalidTokens.add(occ);
      }
    }
    expect(
      Array.from(invalidTokens),
      'service 內出現不合法的 CARD_LEVEL_* 錯誤碼（v1.4 已拆分為 IN_VERSION / RECORD_NOT_FOUND / REFERENCED）',
    ).toEqual([]);
  });

  it('F069~F072 新錯誤碼存在於 card-type.service.ts', () => {
    const source = readFile(CARD_TYPE_SERVICE_FILE);
    const requiredCodes = [
      'CARD_TYPE_NOT_FOUND',
      'CARD_TYPE_DUPLICATE',
      'CARD_TYPE_CASCADE_NOT_CONFIRMED',
      'ASSIGNMENT_RUN_ALREADY_RUNNING',
    ];
    for (const code of requiredCodes) {
      expect(
        source.includes(code),
        `card-type.service.ts 必須包含錯誤碼 ${code}`,
      ).toBe(true);
    }
  });

  it('F056 v1.5 新錯誤碼存在於 assignment-scoring.service.ts', () => {
    const source = readFile(SERVICE_FILE);
    const requiredCodes = [
      'TIER_LEVEL_INVALID_ENUM',
      'CARD_TYPE_FALLBACK_STANDARD_MUTEX',
      'CARD_TYPE_NOT_FOUND',
    ];
    for (const code of requiredCodes) {
      expect(
        source.includes(code),
        `service 必須包含 v1.5 錯誤碼 ${code}`,
      ).toBe(true);
    }
  });

  it('SCORING_VERSION_LOCKED 與 ASSIGNMENT_RUN_ALREADY_RUNNING 分流（依 OPEN-3 決議）', () => {
    const lockHelper = readFile(
      'src/modules/assignment-scoring/helpers/assignment-lock.helper.ts',
    );
    // 兩個碼必須同時存在於 helper
    expect(lockHelper).toContain('SCORING_VERSION_LOCKED');
    expect(lockHelper).toContain('ASSIGNMENT_RUN_ALREADY_RUNNING');
    // 必須有 kind 分流
    expect(lockHelper).toMatch(/kind.*scoring-edit|scoring-edit.*kind/i);
    expect(lockHelper).toMatch(/kind.*card-type-crud|card-type-crud.*kind/i);
  });
});

describe('TC-GUARD-TIMESTAMP-001：ob_card_type entity 日期欄位採 dateColumnType', () => {
  it('ob_card_type entity created_at / updated_at 用 dateColumnType helper（不可硬編碼 timestamp）', () => {
    const source = readFile(
      'src/database/entities/ob-card-type.entity.ts',
    );
    // import dateColumnType
    expect(source).toMatch(/import.*dateColumnType.*from.*column-types/);
    // 必須有 created_at 與 updated_at 使用 dateColumnType
    // 比對 `@Column({ name: 'created_at', type: dateColumnType, ... })`
    expect(
      /name:\s*'created_at'[^}]*type:\s*dateColumnType/.test(source),
      'ob_card_type.created_at 必須使用 dateColumnType helper',
    ).toBe(true);
    expect(
      /name:\s*'updated_at'[^}]*type:\s*dateColumnType/.test(source),
      'ob_card_type.updated_at 必須使用 dateColumnType helper',
    ).toBe(true);
    // 不可硬編碼 'timestamp'
    const tsCount = (source.match(/type:\s*'timestamp'/g) ?? []).length;
    expect(tsCount, 'ob_card_type entity 不可硬編碼 timestamp').toBe(0);
  });
});
