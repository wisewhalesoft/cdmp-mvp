/**
 * Entity unit test: ObLevelcardColumn — match_type 欄位
 * （F054 v1.3 / AD-E07-2 補充 / 2026-05-18）
 *
 * 涵蓋：
 *   1) Entity metadata 含 match_type Column
 *   2) match_type type=varchar、length=20、nullable=false
 *   3) match_type 對應 DB 欄位名 "match_type"
 *   4) MatchType enum 含 CATEGORY / RANGE / COMPOSITE 三正式值且無 EXACT/NUMERIC/LITERAL 變體
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { ObLevelcardColumn } from '../ob-levelcard-column.entity';
import {
  MatchType,
  MATCH_TYPE_VALUES,
} from '@/modules/assignment-scoring/dto/match-type.enum';

describe('ObLevelcardColumn entity — match_type 欄位 (F054 v1.3)', () => {
  it('1) Entity metadata 應含 match_type Column', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ObLevelcardColumn,
    );
    const matchTypeCol = columns.find(
      (c) => c.propertyName === 'match_type',
    );
    expect(matchTypeCol).toBeDefined();
  });

  it('2) match_type 對應 DB 欄位名為 "match_type"', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ObLevelcardColumn,
    );
    const matchTypeCol = columns.find(
      (c) => c.propertyName === 'match_type',
    );
    expect(matchTypeCol?.options?.name).toBe('match_type');
  });

  it('3) match_type Column type=varchar、length=20', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ObLevelcardColumn,
    );
    const matchTypeCol = columns.find(
      (c) => c.propertyName === 'match_type',
    );
    expect(matchTypeCol?.options?.type).toBe('varchar');
    expect(matchTypeCol?.options?.length).toBe(20);
  });

  it('4) match_type 不可為 NULL（Column option 預設或顯式 NOT NULL）', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ObLevelcardColumn,
    );
    const matchTypeCol = columns.find(
      (c) => c.propertyName === 'match_type',
    );
    // TypeORM Column 預設 nullable=false；若 spec 後續放寬需顯式設為 true
    expect(matchTypeCol?.options?.nullable).not.toBe(true);
  });
});

describe('MatchType enum — 三正式列舉值', () => {
  it('5) MatchType 含 CATEGORY / RANGE / COMPOSITE', () => {
    expect(MatchType.CATEGORY).toBe('CATEGORY');
    expect(MatchType.RANGE).toBe('RANGE');
    expect(MatchType.COMPOSITE).toBe('COMPOSITE');
  });

  it('6) MATCH_TYPE_VALUES 僅含三正式值', () => {
    expect([...MATCH_TYPE_VALUES].sort()).toEqual(
      ['CATEGORY', 'COMPOSITE', 'RANGE'].sort(),
    );
  });

  it('7) MatchType 不含 EXACT / NUMERIC / LITERAL 變體', () => {
    const values = Object.values(MatchType);
    expect(values).not.toContain('EXACT');
    expect(values).not.toContain('NUMERIC');
    expect(values).not.toContain('LITERAL');
  });
});

describe('AssignmentAuditLog action — SCORING_INTEGRITY_WARN 新值', () => {
  it('8) action union type 含 SCORING_INTEGRITY_WARN（編譯期型別檢查）', () => {
    // 編譯期 type narrowing 驗證：以下賦值不應觸發 TS 編譯錯誤
    const action: import('../assignment-audit-log.entity').AssignmentAuditLog['action'] =
      'SCORING_INTEGRITY_WARN';
    expect(action).toBe('SCORING_INTEGRITY_WARN');
    // 25 chars，仍在 VARCHAR(30) 內
    expect('SCORING_INTEGRITY_WARN'.length).toBeLessThanOrEqual(30);
  });
});
