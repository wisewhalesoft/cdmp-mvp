/**
 * AD-E07-41 P4a — STATIC 靜態守門 + DISPATCH-002 + CAST-UNIT-004 + REG-002（CI 恆常執行）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HANDLERS_DIR = path.resolve(__dirname, '../handlers');
const read = (p: string) => fs.readFileSync(p, 'utf8');

const MSSQL_HANDLER_FILES = [
  'extract-handler-mssql.ts',
  'field-mapping-handler-mssql.ts',
  'derived-field-handler-mssql.ts',
  'type-cast-handler-mssql.ts',
  'conditional-handler-mssql.ts',
];
const SCAN_FILES = [...MSSQL_HANDLER_FILES, 'resolve-raw-table-mssql.ts', 'mssql/temp-table.util.ts'];

describe('P4a STATIC-001 (I-MSSQL-CATALOG-CASE-01 / I-MSSQL-TEMP-METADATA-01)', () => {
  it('6+ 個新檔內零小寫 information_schema 命中；## 欄位內省一律 tempdb.sys.columns', () => {
    for (const f of SCAN_FILES) {
      const src = read(path.join(HANDLERS_DIR, f));
      expect(src.includes('information_schema'), `${f} 不得含小寫 information_schema`).toBe(false);
    }
  });

  it('extract 版查真實表用大寫 INFORMATION_SCHEMA.TABLES；欄位內省用 tempdb.sys.columns', () => {
    const extractSrc = read(path.join(HANDLERS_DIR, 'extract-handler-mssql.ts'));
    expect(extractSrc).toContain('INFORMATION_SCHEMA.TABLES');
    const util = read(path.join(HANDLERS_DIR, 'mssql/temp-table.util.ts'));
    expect(util).toContain('tempdb.sys.columns');
  });
});

describe('P4a STATIC-002 (檔名鎖定)', () => {
  it('5 個 mssql handler 檔皆存在', () => {
    for (const f of MSSQL_HANDLER_FILES) {
      expect(fs.existsSync(path.join(HANDLERS_DIR, f)), f).toBe(true);
    }
  });
});

describe('P4a STATIC-003 (temp-table.util additive，勿覆寫)', () => {
  const util = read(path.join(HANDLERS_DIR, 'mssql/temp-table.util.ts'));

  it('恰含 4 個匯出函式（drop / create / getColumns / countRows）', () => {
    const exportedFns = [...util.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    expect(new Set(exportedFns)).toEqual(
      new Set([
        'dropMssqlTempTableIfExists',
        'createMssqlTempTable',
        'getMssqlTempTableColumns',
        'countMssqlTempTableRows',
      ]),
    );
    expect(exportedFns.length).toBe(4);
  });

  it('P4-spike-2 既有 dropMssqlTempTableIfExists 簽章逐字元保留（additive 未覆寫）', () => {
    expect(util).toContain(
      `IF OBJECT_ID('tempdb..' + @0) IS NOT NULL DROP TABLE ${'${tempTableName}'}`,
    );
  });
});

describe('P4a STATIC-004 (getValidationRegex 三型別公式落地於原始碼)', () => {
  const castSrc = read(path.join(HANDLERS_DIR, 'type-cast-handler-mssql.ts'));

  it('INTEGER/DECIMAL/DATE 之字元類別驗證邏輯存在於原始碼', () => {
    expect(castSrc).toContain('integerValidation');
    expect(castSrc).toContain('decimalValidation');
    expect(castSrc).toContain('dateValidation');
    expect(castSrc).toContain("NOT LIKE '%[^0-9]%'"); // 數字字元類別
    expect(castSrc).toContain("CHARINDEX('.'"); // DECIMAL 拆整數/小數
    expect(castSrc).toContain('> 0'); // 空字串守門
  });
});

describe('P4a CAST-UNIT-004 (default .* 為不可達死碼)', () => {
  const castSrc = read(path.join(HANDLERS_DIR, 'type-cast-handler-mssql.ts'));

  it('外層白名單先擋非法 targetType，buildValidation default 分支不可達', () => {
    expect(castSrc).toMatch(/if \(!\['DECIMAL', 'INTEGER', 'DATE'\]\.includes\(rule\.targetType\)\)/);
    expect(castSrc).toContain('不支援的型別轉換');
  });
});

describe('P4a REG-002 (5 個 PG handler 未被改為 mssql)', () => {
  const PG_FILES = [
    'extract-handler.ts',
    'field-mapping-handler.ts',
    'derived-field-handler.ts',
    'type-cast-handler.ts',
    'conditional-handler.ts',
  ];
  it('PG handler 仍為 CREATE TEMP TABLE / information_schema，且未 import mssql helper', () => {
    for (const f of PG_FILES) {
      const src = read(path.join(HANDLERS_DIR, f));
      expect(src, f).toContain('CREATE TEMP TABLE');
      expect(src.includes('mssql/temp-table.util'), `${f} 不應 import mssql helper`).toBe(false);
      expect(src.includes('-mssql'), `${f} 不應 import mssql 平行檔`).toBe(false);
    }
  });
});

describe('P4a DISPATCH-002 (createDispatcher 未接 DB_TYPE 分支，9 個 PG handler 不變)', () => {
  const svc = read(path.resolve(__dirname, '../../etl-pipeline-execution.service.ts'));
  it('createDispatcher 仍註冊 9 個 PG handler，無 mssql 分支', () => {
    const registers = [...svc.matchAll(/dispatcher\.register\(new\s+(\w+)\(\)\)/g)].map((m) => m[1]);
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
    ]);
    expect(svc.includes('HandlerMssql')).toBe(false);
    expect(svc).not.toMatch(/DB_TYPE.*===.*'mssql'/);
  });
});
