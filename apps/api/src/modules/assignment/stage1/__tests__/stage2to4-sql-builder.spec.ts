/**
 * F100 / AD-E07-28 P3 — Stage 2~4 SQL builder 純函式 + NOLOAD 靜態 guard（無 Postgres）
 *
 * 對應測試設計（F100-test.md）：
 *   - NOLOAD-001：Stage 2~4 下推路徑不 re-hydrate 全 pool 回 heap 計分（靜態原始碼分析）
 *   - SCORE builder：buildStage2ScoreExpr NULL（無 active version）vs 0（有 active 0 命中）vs 累加
 *   - RG：MAPPED_SCORING_COLUMNS / CUSTOMER_CORE_COLUMNS 命名鎖定（feedback_tdd_naming_drift）
 *   - SQLG：named param 綁定（不字串拼接）
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  buildStage2ScoreExpr,
  MAPPED_SCORING_COLUMNS,
  CUSTOMER_CORE_COLUMNS,
} from '../stage2to4-sql-builder';
import type { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import type { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { MatchType } from '@/modules/assignment-scoring/dto/match-type.enum';

function col(columnName: string, status = 'active'): ObLevelcardColumn {
  return {
    card_type: 'T1',
    card_version: 1,
    column_name: columnName,
    status,
    match_type: MatchType.RANGE,
  } as ObLevelcardColumn;
}

function rangeScore(columnName: string, lo: string, hi: string, score: number): ObLevelcardScore {
  return {
    card_type: 'T1', card_version: 1, column_name: columnName,
    level1: null, level2_s: lo, level2_e: hi, score,
  } as ObLevelcardScore;
}

function catScore(columnName: string, level1: string, score: number): ObLevelcardScore {
  return {
    card_type: 'T1', card_version: 1, column_name: columnName,
    level1, level2_s: null, level2_e: null, score,
  } as ObLevelcardScore;
}

describe('F100 buildStage2ScoreExpr — Stage 2 SUM(CASE…) 純函式', () => {
  it('無 active version（cardVersion=null）→ scoreExpr=null（SCORE-006）', () => {
    const r = buildStage2ScoreExpr('T1', null, [], [], 'p');
    expect(r.scoreExpr).toBeNull();
    expect(r.needsCustomerCore).toBe(false);
  });

  it('有 active 但無可計分維度命中規則 → scoreExpr="0"（SCORE-007，與 NULL 區分）', () => {
    // 有 active column 但無對應 score row → 0
    const r = buildStage2ScoreExpr('T1', 1, [col('LIST_MONTH')], [], 'p');
    expect(r.scoreExpr).toBe('0');
  });

  it('區間 + 類別維度 → 巢狀 CASE 累加（+ 連接）', () => {
    const r = buildStage2ScoreExpr(
      'T1', 1,
      [col('LIST_MONTH'), col('PROJECT_TP')],
      [rangeScore('LIST_MONTH', '0', '5', 10), catScore('PROJECT_TP', '01', 5)],
      'p',
    );
    expect(r.scoreExpr).toContain('CASE');
    expect(r.scoreExpr).toContain(' + '); // 多維度累加
    // 區間用 >= / <=；類別用 TRIM(...) =
    expect(r.scoreExpr).toMatch(/>=/);
    expect(r.scoreExpr).toContain('TRIM');
  });

  it('customer_core 維度 → needsCustomerCore=true（cc 引用）', () => {
    const r = buildStage2ScoreExpr(
      'T1', 1, [col('CUS_SEX')], [catScore('CUS_SEX', 'M', 20)], 'p',
    );
    expect(r.needsCustomerCore).toBe(true);
    expect(r.scoreExpr).toContain('cc.gender');
  });

  it('純 ob_pool_data 維度 → needsCustomerCore=false（不 join customer_core）', () => {
    const r = buildStage2ScoreExpr(
      'T1', 1, [col('LIST_MONTH')], [rangeScore('LIST_MONTH', '0', '5', 10)], 'p',
    );
    expect(r.needsCustomerCore).toBe(false);
    expect(r.scoreExpr).not.toContain('cc.');
  });

  it('未映射 column_name（如 TEST_X / ADD_UN_CAPITAL）→ 不取分（比照 JS default）', () => {
    const r = buildStage2ScoreExpr(
      'T1', 1,
      [col('LIST_MONTH'), col('ADD_UN_CAPITAL'), col('TEST_X')],
      [rangeScore('LIST_MONTH', '0', '5', 10), rangeScore('ADD_UN_CAPITAL', '0', '100', 99)],
      'p',
    );
    // ADD_UN_CAPITAL / TEST_X 無映射 → 不取分；scoreExpr 僅含 LIST_MONTH 之 CASE
    expect(r.scoreExpr).toContain('o.month_cnt');
    expect(r.scoreExpr).not.toContain('99'); // ADD_UN_CAPITAL 分數不入 SQL
  });

  it('disabled column 已由呼叫端過濾（builder 不檢 status）— 僅傳 active', () => {
    // builder 只處理傳入之 activeColumns；disabled 過濾在呼叫端（status='active' WHERE）。
    const r = buildStage2ScoreExpr('T1', 1, [col('LIST_MONTH')], [rangeScore('LIST_MONTH', '0', '5', 10)], 'p');
    expect(r.scoreExpr).toContain('CASE');
  });

  it('SQLG：score / 區間界 / level1 以 named param（不字串拼接）', () => {
    const r = buildStage2ScoreExpr(
      'T1', 1, [col('LIST_MONTH')], [rangeScore('LIST_MONTH', '0', '5', 10)], 'p',
    );
    // 分數 / 區間界以 :param 出現，對應 params；不直接內嵌數值
    expect(r.scoreExpr).toMatch(/:p_\d+_(lo|hi|s)/);
    expect(Object.keys(r.params).length).toBeGreaterThan(0);
  });
});

describe('F100 RG — 計分欄位映射命名鎖定（feedback_tdd_naming_drift）', () => {
  it('已映射欄位含 architecture-spec §3.10 已列 customer_core 欄位', () => {
    expect(MAPPED_SCORING_COLUMNS).toContain('CUS_SEX');
    expect(MAPPED_SCORING_COLUMNS).toContain('AGE');
    expect(MAPPED_SCORING_COLUMNS).toContain('EDUCAT_BACK');
    expect(MAPPED_SCORING_COLUMNS).toContain('LIST_MONTH');
    expect(MAPPED_SCORING_COLUMNS).toContain('PROJECT_TP');
  });

  it('customer_core 客戶屬性欄位集（決定 LEFT JOIN）', () => {
    expect(CUSTOMER_CORE_COLUMNS.has('CUS_SEX')).toBe(true);
    expect(CUSTOMER_CORE_COLUMNS.has('AGE')).toBe(true);
    // ob_pool_data 直接取之欄位不在 customer_core 集合
    expect(CUSTOMER_CORE_COLUMNS.has('LIST_MONTH')).toBe(false);
    expect(CUSTOMER_CORE_COLUMNS.has('PROJECT_TP')).toBe(false);
    // SALES_STS / LOAN_RATE 來自 ob_pool_data（非 customer_core）
    expect(CUSTOMER_CORE_COLUMNS.has('SALES_STS')).toBe(false);
    expect(CUSTOMER_CORE_COLUMNS.has('LOAN_RATE')).toBe(false);
  });

  it('ADD_UN_CAPITAL（ob_arreturndf_min_cap）未映射 → 不在已映射集合（open item）', () => {
    expect(MAPPED_SCORING_COLUMNS as readonly string[]).not.toContain('ADD_UN_CAPITAL');
  });
});

describe('F100 NOLOAD-001 — Stage 2~4 下推不 re-hydrate 全 pool（靜態原始碼分析）', () => {
  const pipelinePath = path.resolve(
    __dirname,
    '../../services/assignment-run-pipeline.service.ts',
  );
  const src = fs.readFileSync(pipelinePath, 'utf8');

  it('Stage 2~4 下推方法存在且呼叫 set-based SQL（F101：runStage2and3Sql + runStage3to4RationSql）', () => {
    expect(src).toContain('executeStage2to4Pushdown');
    // F101 / AD-E07-29：原 runStage2to4Sql（含 st4_exchange placeholder）拆為
    //   runStage2and3Sql（計分 + CR）+ runStage3to4RationSql（真實比例分派），皆為 set-based SQL。
    expect(src).toContain('runStage2and3Sql');
    expect(src).toContain('runStage3to4RationSql');
  });

  it('下推路徑透過 skipHydration 跳過 re-hydrate（pool 為空，I-NOLOAD-01）', () => {
    expect(src).toContain('skipHydration');
    // skipHydration 為 true 時直接回傳空 pool（不呼叫 hydratePoolByPk）
    expect(src).toMatch(/skipHydration\b[\s\S]{0,200}pool:\s*\[\]/);
  });

  it('executeStage2to4Pushdown 不呼叫 hydratePoolByPk / computeScore（不 read-back heap 計分）', () => {
    // 取 executeStage2to4Pushdown 方法區塊
    const start = src.indexOf('private async executeStage2to4Pushdown');
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf('private async', start + 50);
    const block = src.slice(start, end > 0 ? end : undefined);
    expect(block).not.toContain('hydratePoolByPk');
    expect(block).not.toContain('this.computeScore');
    expect(block).not.toContain('pool.map(');
  });
});
