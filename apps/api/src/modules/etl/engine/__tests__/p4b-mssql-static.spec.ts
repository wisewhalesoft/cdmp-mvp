/**
 * AD-E07-41 P4b — STATIC 靜態守門 + REG + DISPATCH-002 + RESOLVE-001 + ALTERCOL-GATE-001（CI 恆常執行）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HANDLERS_DIR = path.resolve(__dirname, '../handlers');
const read = (p: string) => fs.readFileSync(p, 'utf8');

const MERGE_MSSQL = 'merge-handler-mssql.ts';
const LOOKUP_MSSQL = 'lookup-handler-mssql.ts';

// =====================================================================
// STATIC-001 (🔴 呼應 ALTERCOL) — lookup-handler-mssql.ts 原始碼守門
// =====================================================================
describe('P4b STATIC-001 (lookup-handler-mssql 原始碼零陷阱字面)', () => {
  const src = read(path.join(HANDLERS_DIR, LOOKUP_MSSQL));

  it('零 ADD COLUMN 字面命中', () => {
    expect(src).not.toMatch(/ADD\s+COLUMN/i);
  });
  it('零 IF NOT EXISTS（PG 專屬語法糖）', () => {
    expect(src).not.toMatch(/IF\s+NOT\s+EXISTS/i);
  });
  it('ALTER 型別為 NVARCHAR(MAX)，零裸 TEXT 型別宣告', () => {
    expect(src).toContain('ADD "${alias}" NVARCHAR(MAX)');
    // 原始碼不得出現「ADD ... TEXT」型別宣告
    expect(src).not.toMatch(/ADD[^;]*\bTEXT\b/);
  });
  it('零小寫 information_schema 命中（catalog 一律大寫 / tempdb.sys.columns）', () => {
    expect(src.includes('information_schema')).toBe(false);
    expect(src).toContain('INFORMATION_SCHEMA.TABLES');
  });
  it('零殘留 ::text（改 TRY_CAST）', () => {
    expect(src.includes('::text')).toBe(false);
  });
});

// =====================================================================
// STATIC-004 (UPDATEFROM-UNIT-001 落地驗收) — target 於 FROM 宣告
// =====================================================================
describe('P4b STATIC-004 (UPDATE target 併入 FROM，非 naive 就地別名)', () => {
  const src = read(path.join(HANDLERS_DIR, LOOKUP_MSSQL));

  it('UPDATE 之 target 以 FROM ##t AS _src JOIN (sub) 形式出現，非 UPDATE _src ... FROM (sub)', () => {
    // buildUpdateFromSql 之 UPDATE 骨幹：target 併入 FROM、子查詢以 JOIN 併入（非直接 FROM 子查詢）
    expect(src).toContain('`UPDATE _src SET ${setClauses.join(\', \')} `');
    expect(src).toContain('`FROM "${inputTable}" AS _src `');
    expect(src).toContain('`JOIN (${lookupSubQuery}) _lk `');
    // 註：DELETE 之 NOT EXISTS 子查詢合法使用 `FROM (${lookupSubQuery}) _lk`（相關子查詢），
    //     故此處不以「FROM (sub)」為全域禁字，改以上方 UPDATE 骨幹之正向模式守門。
  });

  it('skip_row DELETE 為兩段式（DELETE _src FROM ##t AS _src），非 DELETE FROM ##t AS _src（真實 MSSQL 語法錯誤）', () => {
    expect(src).toMatch(/DELETE\s+_src\s+FROM\s+"\$\{inputTable\}"\s+AS\s+_src/);
  });
});

// =====================================================================
// STATIC-002 — 檔名鎖定
// =====================================================================
describe('P4b STATIC-002 (檔名鎖定)', () => {
  it('merge-handler-mssql.ts / lookup-handler-mssql.ts 皆存在', () => {
    expect(fs.existsSync(path.join(HANDLERS_DIR, MERGE_MSSQL))).toBe(true);
    expect(fs.existsSync(path.join(HANDLERS_DIR, LOOKUP_MSSQL))).toBe(true);
  });
});

// =====================================================================
// STATIC-003 — P4a 產出（resolve-raw-table-mssql / temp-table.util）未被本輪覆寫
// =====================================================================
describe('P4b STATIC-003 (P4a additive 產出未被覆寫)', () => {
  it('temp-table.util.ts 仍恰含 4 個匯出函式（P4a 簽章不動）', () => {
    const util = read(path.join(HANDLERS_DIR, 'mssql/temp-table.util.ts'));
    const fns = [...util.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    expect(new Set(fns)).toEqual(
      new Set([
        'dropMssqlTempTableIfExists',
        'createMssqlTempTable',
        'getMssqlTempTableColumns',
        'countMssqlTempTableRows',
      ]),
    );
    expect(fns.length).toBe(4);
  });

  it('resolve-raw-table-mssql.ts 仍匯出 resolveRawTableMssql，未 import merge/lookup handler', () => {
    const resolve = read(path.join(HANDLERS_DIR, 'resolve-raw-table-mssql.ts'));
    expect(resolve).toContain('export async function resolveRawTableMssql');
    // 不得新增對 merge/lookup handler 之 import（註解提及檔名不算；只禁 import 語句）
    expect(resolve).not.toMatch(/import[^;]*from\s*'\.\/merge-handler/);
    expect(resolve).not.toMatch(/import[^;]*from\s*'\.\/lookup-handler/);
  });
});

// =====================================================================
// RESOLVE-001 — lookup-handler-mssql 呼叫既有 resolveRawTableMssql（DRY）
// =====================================================================
describe('P4b RESOLVE-001 (重用既有 resolveRawTableMssql，未重新實作)', () => {
  const src = read(path.join(HANDLERS_DIR, LOOKUP_MSSQL));
  it('import resolveRawTableMssql from ./resolve-raw-table-mssql 存在', () => {
    expect(src).toMatch(/import\s*\{[^}]*resolveRawTableMssql[^}]*\}\s*from\s*'\.\/resolve-raw-table-mssql'/);
  });
});

// =====================================================================
// REG-002 — PG 原始檔（merge/lookup）逐位元組未變
// =====================================================================
describe('P4b REG-002 (PG merge/lookup handler 未被改為 mssql)', () => {
  it('merge-handler.ts 仍 CREATE TEMP TABLE / information_schema，未 import mssql helper', () => {
    const src = read(path.join(HANDLERS_DIR, 'merge-handler.ts'));
    expect(src).toContain('CREATE TEMP TABLE');
    expect(src).toContain('information_schema.columns');
    expect(src.includes('mssql/temp-table.util')).toBe(false);
    expect(src.includes('-mssql')).toBe(false);
  });
  it('lookup-handler.ts 仍 ALTER TABLE ADD COLUMN IF NOT EXISTS / UPDATE...FROM(sub)，未 import mssql helper', () => {
    const src = read(path.join(HANDLERS_DIR, 'lookup-handler.ts'));
    expect(src).toContain('ADD COLUMN IF NOT EXISTS');
    expect(src).toContain('resolve-raw-table');
    expect(src.includes('mssql/temp-table.util')).toBe(false);
    expect(src.includes('resolve-raw-table-mssql')).toBe(false);
  });
});

// =====================================================================
// DISPATCH-002 — createDispatcher 之 PG 預設分支不變
// 🔴 AD-E07-41 P4c（DISPATCH-001）已落地 DB_TYPE 分支（P4b 原「延後未接線」狀態於本輪結束）。
//    原斷言「無 mssql 分支」不再適用；改驗證 PG handler 於預設（非 mssql）分支仍逐一註冊、順序不變。
// =====================================================================
describe('P4b DISPATCH-002 (createDispatcher — 9 個 PG handler 預設分支不變)', () => {
  const svc = read(path.resolve(__dirname, '../../etl-pipeline-execution.service.ts'));
  it('PG handler 於預設分支仍逐一註冊、順序不變（F110/US-173 後為 10 個，既有 9 個順序不變 + CodeDecodeHandler 附加於末）', () => {
    const registers = [...svc.matchAll(/dispatcher\.register\(new\s+(\w+)\(\)\)/g)]
      .map((m) => m[1])
      .filter((n) => !n.endsWith('Mssql'));
    expect(registers).toEqual([
      'ExtractHandler',
      'MergeHandler',
      'DedupHandler',
      'TypeCastHandler',
      'DerivedFieldHandler',
      'FieldMappingHandler',
      'ConditionalHandler',
      'TargetLoadHandler',
      'LookupHandler',
      'CodeDecodeHandler',
    ]);
  });
});

// =====================================================================
// ALTERCOL-GATE-001 — 冪等機制決策記錄於 impl log
// =====================================================================
describe('P4b ALTERCOL-GATE-001 (冪等機制之實作位置須於 impl log 記錄)', () => {
  const implLog = path.resolve(__dirname, '../../../../../../../docs/specs/implementation-log/AD-E07-41-P4b-impl.md');
  it('impl log 存在且記錄選項甲（JS 端 getMssqlTempTableColumns 預查）', () => {
    expect(fs.existsSync(implLog), `impl log 應存在：${implLog}`).toBe(true);
    const md = read(implLog);
    expect(md).toContain('ALTERCOL-GATE-001');
    expect(md).toContain('選項甲');
    expect(md).toContain('getMssqlTempTableColumns');
  });
});
