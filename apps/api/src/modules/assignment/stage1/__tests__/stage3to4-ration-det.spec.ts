/**
 * F101 / AD-E07-29 — DET 確定性靜態掃描（無 DB，純檔案 grep）
 *
 * 對應 F101-test.md：
 *   - DET-001：Stage 3/4/ASSIGNDAY 全程無亂數（NEWID / Math.random / ORDER BY RANDOM / crypto.randomUUID）
 *   - DET-002：ob_assign_set / ObAssignSet / OBASSIGNSET 無引用（AC-18 / BR-F101-18）
 *   - DET-003：runStage4Sql senior swap（st4_exchange）已移除（I-NO-ST4-EXCHANGE）
 *
 * ⚠️ feedback_grep_negative_lookahead：以 fs 讀檔 + JS regex 驗證，不依賴 Grep tool 行為。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..');
const F101_FILES = [
  join(DIR, 'stage3to4-ration.ts'),
  join(DIR, 'stage3to4-ration-sql.ts'),
  join(DIR, 'stage2to4-sql-executor.ts'),
  join(__dirname, '..', '..', 'services', 'assignment-run-pipeline.service.ts'),
];

/**
 * 移除 block 註解（//+/star-star/）與 line 註解（//）後再掃描——I-DET-01 規範「執行邏輯」無亂數，
 * docstring / 行內註解描述 legacy SP 之 NEWID() 或解釋 senior swap 已移除屬合法說明，不應誤判。
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments（避開 URL :// — 保留 : 前綴）
}

function readAllCode(): string {
  return F101_FILES.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
}

describe('F101 DET — 確定性靜態掃描', () => {
  it('DET-001：Stage 3/4/ASSIGNDAY 全程無亂數函式', () => {
    const src = readAllCode();
    // NEWID() / Math.random() / ORDER BY RANDOM() / crypto.randomUUID()
    expect(src).not.toMatch(/NEWID\s*\(\s*\)/i);
    expect(src).not.toMatch(/Math\.random\s*\(/);
    expect(src).not.toMatch(/ORDER\s+BY\s+RANDOM\s*\(/i);
    expect(src).not.toMatch(/crypto\.randomUUID/);
  });

  it('DET-002：ob_assign_set / ObAssignSet / OBASSIGNSET 無引用（AC-18）', () => {
    // 比例分派核心檔案（含註解）皆不得引用 ob_assign_set（BR-F101-18）。
    const rationFiles = [
      readFileSync(join(DIR, 'stage3to4-ration.ts'), 'utf8'),
      readFileSync(join(DIR, 'stage3to4-ration-sql.ts'), 'utf8'),
    ].join('\n');
    expect(rationFiles).not.toMatch(/ob_assign_set/i);
    expect(rationFiles).not.toMatch(/ObAssignSet/);
    expect(rationFiles).not.toMatch(/OBASSIGNSET/);
  });

  it('DET-003：runStage4Sql senior swap（st4_exchange）已移除', () => {
    const executorCode = stripComments(
      readFileSync(join(DIR, 'stage2to4-sql-executor.ts'), 'utf8'),
    );
    // 已無 runStage4Sql export、無 seniorEmplid / defaultEmplid context 欄位、無 10% CEIL swap CTE。
    expect(executorCode).not.toMatch(/export\s+async\s+function\s+runStage4Sql/);
    expect(executorCode).not.toMatch(/seniorEmplid/);
    expect(executorCode).not.toMatch(/defaultEmplid/);
    expect(executorCode).not.toMatch(/CEIL\s*\(\s*e\.total\s*\*\s*0\.1\s*\)/);
    // ration 分派 SQL（執行碼）不含 senior swap 邏輯。
    const rationSqlCode = stripComments(
      readFileSync(join(DIR, 'stage3to4-ration-sql.ts'), 'utf8'),
    );
    expect(rationSqlCode).not.toMatch(/senior/i);
    expect(rationSqlCode).not.toMatch(/exchange/i);
  });
});
