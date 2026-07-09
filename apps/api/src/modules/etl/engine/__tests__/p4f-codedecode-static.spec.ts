/**
 * F110 / US-173 — AD-E07-41 P4f `code_decode`：STATIC 靜態守門 + REG-LOOKUP + DISPATCH-004（CI 恆常執行）。
 *
 * 覆蓋（AD-E07-41-P4-codedecode-test §九 STATIC / §八 REG-LOOKUP / §三 DISPATCH-004）：
 *   - STATIC-001：五項不變式名稱於兩 handler 檔案註解中原字鎖定。
 *   - STATIC-003：兩 handler 全文零殘留 `ALTER TABLE ... ADD` / `UPDATE ... FROM`（PG：`UPDATE ... SET ... FROM`）。
 *   - STATIC-004：各檔僅一個 handler class，無依 DB_TYPE/isPostgres 切換 SQL 產生邏輯之分支。
 *   - 檔名鎖定：兩新檔存在。
 *   - REG-LOOKUP-003：lookup-handler(-mssql).ts 未被本次變更修改（特徵內容仍在、未 import code-decode）。
 *   - DISPATCH-004：NodeDispatcher / node-dispatcher.ts / pipeline-runner.ts / types.ts 未因新增 handler 而改動。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HANDLERS_DIR = path.resolve(__dirname, '../handlers');
const ENGINE_DIR = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(p, 'utf8');

const CD_PG = 'code-decode-handler.ts';
const CD_MSSQL = 'code-decode-handler-mssql.ts';

const INVARIANTS = [
  'I-CODEDECODE-JOIN-FILTER-01',
  'I-CODEDECODE-DEDUP-TIEBREAK-01',
  'I-CODEDECODE-NORMALIZE-01',
  'I-CODEDECODE-COLLISION-01',
  'I-CODEDECODE-EQ-01',
];

// =====================================================================
// 檔名鎖定
// =====================================================================
describe('P4f STATIC 檔名鎖定', () => {
  it('code-decode-handler.ts / code-decode-handler-mssql.ts 皆存在', () => {
    expect(fs.existsSync(path.join(HANDLERS_DIR, CD_PG))).toBe(true);
    expect(fs.existsSync(path.join(HANDLERS_DIR, CD_MSSQL))).toBe(true);
  });
});

// =====================================================================
// STATIC-001 — 五項不變式名稱原字鎖定
// =====================================================================
describe('P4f STATIC-001 (五項不變式名稱於兩 handler 註解原字鎖定)', () => {
  for (const file of [CD_PG, CD_MSSQL]) {
    const src = read(path.join(HANDLERS_DIR, file));
    for (const inv of INVARIANTS) {
      it(`${file} 含 ${inv}`, () => {
        expect(src).toContain(inv);
      });
    }
  }
});

// =====================================================================
// STATIC-003 — 零就地更新策略殘留（防止誤沿用 lookup 之 ALTER+UPDATE）
// =====================================================================
describe('P4f STATIC-003 (零 ALTER TABLE ... ADD / UPDATE ... FROM 字面)', () => {
  for (const file of [CD_PG, CD_MSSQL]) {
    const src = read(path.join(HANDLERS_DIR, file));
    it(`${file} 零 ALTER TABLE ... ADD`, () => {
      expect(src).not.toMatch(/ALTER\s+TABLE[^\n;]*\bADD\b/i);
      expect(src).not.toMatch(/ADD\s+COLUMN/i);
    });
    it(`${file} 零 UPDATE ... FROM（就地更新策略）`, () => {
      expect(src).not.toMatch(/\bUPDATE\b[^\n;]*\bFROM\b/i);
    });
  }
});

// =====================================================================
// STATIC-004 — 各檔單一 handler class，無 DB_TYPE/isPostgres 分支
// =====================================================================
describe('P4f STATIC-004 (單一 handler class，無 DB_TYPE 分支)', () => {
  for (const file of [CD_PG, CD_MSSQL]) {
    const src = read(path.join(HANDLERS_DIR, file));
    it(`${file} 恰含一個 implements NodeExecutor 的 handler class`, () => {
      const classes = [...src.matchAll(/class\s+\w+\s+implements\s+NodeExecutor/g)];
      expect(classes.length).toBe(1);
    });
    it(`${file} 無依 DB_TYPE / isPostgres / === 'mssql'|'postgres' 切換之 SQL 邏輯分支`, () => {
      expect(src.includes('DB_TYPE')).toBe(false);
      expect(src.includes('isPostgres')).toBe(false);
      expect(src).not.toMatch(/===\s*['"](mssql|postgres)['"]/);
    });
  }
});

// =====================================================================
// SELECTINTO 靜態 — 各檔 SELECT INTO / CREATE TEMP TABLE 主體正確
// =====================================================================
describe('P4f STATIC SELECTINTO 主體', () => {
  it('MSSQL 版走 createMssqlTempTable（SELECT INTO ##）、OPTION (HASH JOIN)', () => {
    const src = read(path.join(HANDLERS_DIR, CD_MSSQL));
    expect(src).toContain('createMssqlTempTable');
    expect(src).toContain('OPTION (HASH JOIN)');
    expect(src).toContain("'##' + makeTempTableName");
  });
  it('PG 版走 CREATE TEMP TABLE ... AS SELECT、無 OPTION (HASH JOIN)', () => {
    const src = read(path.join(HANDLERS_DIR, CD_PG));
    expect(src).toContain('CREATE TEMP TABLE');
    expect(src.includes('OPTION (HASH JOIN)')).toBe(false);
    expect(src.includes('mssql/temp-table.util')).toBe(false);
  });
});

// =====================================================================
// REG-LOOKUP-003 — lookup handler 未被本次變更修改
// =====================================================================
describe('P4f REG-LOOKUP-003 (lookup-handler(-mssql).ts 未被修改)', () => {
  it('lookup-handler.ts 仍 ALTER TABLE ADD COLUMN IF NOT EXISTS，未 import code-decode', () => {
    const src = read(path.join(HANDLERS_DIR, 'lookup-handler.ts'));
    expect(src).toContain('ADD COLUMN IF NOT EXISTS');
    expect(src.includes('code-decode')).toBe(false);
  });
  it('lookup-handler-mssql.ts 仍 ALTER TABLE / trimCast，未 import code-decode', () => {
    const src = read(path.join(HANDLERS_DIR, 'lookup-handler-mssql.ts'));
    expect(src).toContain('ALTER TABLE');
    expect(src).toContain('function trimCast');
    expect(src.includes('code-decode')).toBe(false);
  });
});

// =====================================================================
// DISPATCH-004 — 引擎核心檔案未因新增 handler 而改動
// =====================================================================
describe('P4f DISPATCH-004 (NodeDispatcher/pipeline-runner/types 未因 code_decode 改動)', () => {
  it('node-dispatcher.ts 不引用 code_decode / code-decode（driver 差異封裝於個別 handler）', () => {
    const src = read(path.join(ENGINE_DIR, 'node-dispatcher.ts'));
    expect(src.includes('code-decode')).toBe(false);
    expect(src.includes('code_decode')).toBe(false);
  });
  it('pipeline-runner.ts 不引用 code_decode / code-decode', () => {
    const src = read(path.join(ENGINE_DIR, 'pipeline-runner.ts'));
    expect(src.includes('code-decode')).toBe(false);
    expect(src.includes('code_decode')).toBe(false);
  });
  it('types.ts 不引用 code_decode（NodeExecutor 抽象未變）', () => {
    const src = read(path.join(ENGINE_DIR, 'types.ts'));
    expect(src.includes('code_decode')).toBe(false);
  });
});
