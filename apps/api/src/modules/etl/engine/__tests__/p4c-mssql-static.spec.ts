/**
 * AD-E07-41 P4c — STATIC 靜態守門 + REG-002 + DISPATCH-003 + LITERAL-UNIT-003 + 決策關卡文件守門
 * （CI 恆常執行，不需 MSSQL 連線）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HANDLERS_DIR = path.resolve(__dirname, '../handlers');
const read = (p: string) => fs.readFileSync(p, 'utf8');
/**
 * 移除註解後回傳「純程式碼」——STATIC 零陷阱字面守門之意圖為「原始碼（active code）零 PG-only 構造」，
 * 文件註解合法引用 `ON CONFLICT`/`DISTINCT ON`/`LENGTH(TRIM` 等以說明「PG→MSSQL 如何改寫」，
 * 不應被誤判命中（handler SQL 字串內無 `//` 或 `/*`，簡易剝除安全）。
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const readCode = (p: string) => stripComments(read(p));

const DEDUP_MSSQL = 'dedup-handler-mssql.ts';
const TL_MSSQL = 'target-load-handler-mssql.ts';
const IMPL_LOG = path.resolve(
  __dirname,
  '../../../../../../../docs/specs/implementation-log/AD-E07-41-P4c-impl.md',
);

// =====================================================================
// STATIC-001 — 檔名鎖定
// =====================================================================
describe('P4c STATIC-001 (檔名鎖定)', () => {
  it('dedup-handler-mssql.ts / target-load-handler-mssql.ts 皆存在於 handlers/', () => {
    expect(fs.existsSync(path.join(HANDLERS_DIR, DEDUP_MSSQL))).toBe(true);
    expect(fs.existsSync(path.join(HANDLERS_DIR, TL_MSSQL))).toBe(true);
  });
});

// =====================================================================
// STATIC-002 — target-load-handler-mssql.ts 零 ON CONFLICT/EXCLUDED/DISTINCT ON
// =====================================================================
describe('P4c STATIC-002 (target-load-mssql 零 PG-only 去重/UPSERT 字面)', () => {
  const src = readCode(path.join(HANDLERS_DIR, TL_MSSQL));
  it('零 ON CONFLICT（大小寫）', () => {
    expect(src).not.toMatch(/ON CONFLICT/i);
  });
  it('零 EXCLUDED（大小寫）', () => {
    expect(src).not.toMatch(/EXCLUDED/i);
  });
  it('零 DISTINCT ON（大小寫）', () => {
    expect(src).not.toMatch(/DISTINCT ON/i);
  });
});

// =====================================================================
// STATIC-005 — dedup/target-load mssql 零小寫 information_schema
// =====================================================================
describe('P4c STATIC-005 (mssql handler 零小寫 information_schema)', () => {
  it('dedup-handler-mssql.ts 零 information_schema（catalog 一律 tempdb.sys / 大寫 INFORMATION_SCHEMA）', () => {
    const src = readCode(path.join(HANDLERS_DIR, DEDUP_MSSQL));
    expect(src.includes('information_schema')).toBe(false);
  });
  it('target-load-handler-mssql.ts 零小寫 information_schema，且含大寫 INFORMATION_SCHEMA', () => {
    const src = readCode(path.join(HANDLERS_DIR, TL_MSSQL));
    expect(src.includes('information_schema')).toBe(false);
    expect(src).toContain('INFORMATION_SCHEMA.TABLES');
    expect(src).toContain('INFORMATION_SCHEMA.COLUMNS');
    expect(src).toContain('INFORMATION_SCHEMA.TABLE_CONSTRAINTS');
    expect(src).toContain('INFORMATION_SCHEMA.KEY_COLUMN_USAGE');
  });
});

// =====================================================================
// LITERAL-UNIT-003 — LENGTH(TRIM 全站點無殘留（全改 LEN）
// =====================================================================
describe('P4c LITERAL-UNIT-003 (target-load-mssql 零 LENGTH(TRIM 殘留)', () => {
  const src = readCode(path.join(HANDLERS_DIR, TL_MSSQL));
  it('零 LENGTH(TRIM（改 LEN）', () => {
    expect(src.includes('LENGTH(TRIM')).toBe(false);
    expect(src).toContain('LEN(TRIM(');
  });
  it('零 ::TIMESTAMP / ::UUID（改 CAST）', () => {
    expect(src.includes('::TIMESTAMP')).toBe(false);
    expect(src.includes('::UUID')).toBe(false);
    expect(src).toContain('AS datetime2');
    expect(src).toContain('AS uniqueidentifier');
  });
});

// =====================================================================
// STATIC-003 — temp-table.util.ts additive-only（4 函式簽章不破壞；MssqlTempTableColumn 僅新增欄位）
// =====================================================================
describe('P4c STATIC-003 (temp-table.util additive-only)', () => {
  const util = read(path.join(HANDLERS_DIR, 'mssql/temp-table.util.ts'));
  it('仍恰含 4 個匯出函式（P4a 簽章不動）', () => {
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
  it('MssqlTempTableColumn 既有 name/columnId 語意保留 + 新增 dataType（additive）', () => {
    expect(util).toContain('name: string');
    expect(util).toContain('columnId: number');
    expect(util).toContain('dataType: string');
  });
  it('getMssqlTempTableColumns 回傳含 dataType（JOIN sys.types）', () => {
    expect(util).toContain('tempdb.sys.types');
    expect(util).toContain('dataType: r.data_type');
  });
});

// =====================================================================
// STATIC-004 — createDispatcher 含 DB_TYPE 分支 + 9 個 mssql handler
// =====================================================================
describe('P4c STATIC-004 (createDispatcher DB_TYPE 分支落地)', () => {
  const svc = read(path.resolve(__dirname, '../../etl-pipeline-execution.service.ts'));
  it('含 DB_TYPE 判斷（沿用 configService.get 慣例）', () => {
    expect(svc).toMatch(/DB_TYPE/);
    expect(svc).toContain("=== 'mssql'");
  });
  it('9 個 mssql handler 皆有註冊', () => {
    const mssqlRegs = [...svc.matchAll(/dispatcher\.register\(new\s+(\w+Mssql)\(\)\)/g)].map((m) => m[1]);
    expect(new Set(mssqlRegs)).toEqual(
      new Set([
        'ExtractHandlerMssql',
        'MergeHandlerMssql',
        'DedupHandlerMssql',
        'TypeCastHandlerMssql',
        'DerivedFieldHandlerMssql',
        'FieldMappingHandlerMssql',
        'ConditionalHandlerMssql',
        'TargetLoadHandlerMssql',
        'LookupHandlerMssql',
      ]),
    );
    expect(mssqlRegs.length).toBe(9);
  });
  it('PG handler 9 個仍保留（預設分支）', () => {
    const pgRegs = [...svc.matchAll(/dispatcher\.register\(new\s+(\w+)\(\)\)/g)].map((m) => m[1]).filter((n) => !n.endsWith('Mssql'));
    expect(pgRegs.length).toBe(9);
  });
});

// =====================================================================
// DISPATCH-003 — DB_TYPE 讀取沿用既有 configService.get<string>('DB_TYPE', 'sqlite') 慣例
// =====================================================================
describe('P4c DISPATCH-003 (沿用既有 DB_TYPE 讀取慣例)', () => {
  const svc = read(path.resolve(__dirname, '../../etl-pipeline-execution.service.ts'));
  it("configService.get<string>('DB_TYPE', 'sqlite') 慣例", () => {
    expect(svc).toMatch(/configService\.get<string>\('DB_TYPE',\s*'sqlite'\)/);
    expect(svc).toContain('ConfigService');
  });
});

// =====================================================================
// REG-002 — PG 原檔（dedup/target-load）未被改為 mssql
// =====================================================================
describe('P4c REG-002 (PG dedup/target-load handler 未被 mssql 化)', () => {
  it('dedup-handler.ts 仍 CREATE TEMP TABLE / DISTINCT ON / ctid / information_schema，未 import mssql helper', () => {
    const src = read(path.join(HANDLERS_DIR, 'dedup-handler.ts'));
    expect(src).toContain('CREATE TEMP TABLE');
    expect(src).toContain('DISTINCT ON');
    expect(src).toContain('ctid');
    expect(src).toContain('information_schema.columns');
    expect(src.includes('mssql/temp-table.util')).toBe(false);
    expect(src.includes('-mssql')).toBe(false);
  });
  it('target-load-handler.ts 仍 ON CONFLICT / EXCLUDED / DISTINCT ON / information_schema，未 import mssql helper', () => {
    const src = read(path.join(HANDLERS_DIR, 'target-load-handler.ts'));
    expect(src).toContain('ON CONFLICT');
    expect(src).toContain('EXCLUDED');
    expect(src).toContain('DISTINCT ON');
    expect(src).toContain('information_schema');
    expect(src.includes('mssql/temp-table.util')).toBe(false);
    expect(src.includes('-mssql')).toBe(false);
  });
});

// =====================================================================
// 決策關卡文件守門（Decision Gate）：impl log 須記錄
// =====================================================================
describe('P4c 決策關卡文件守門', () => {
  it('impl log 存在', () => {
    expect(fs.existsSync(IMPL_LOG), `impl log 應存在：${IMPL_LOG}`).toBe(true);
  });

  it('TLDEDUP-GATE-001：兩處 tie-breaker 之命名/共用 helper 決策已記錄', () => {
    const md = read(IMPL_LOG);
    expect(md).toContain('TLDEDUP-GATE-001');
    expect(md).toContain('buildDeterministicDedupTable');
  });

  it('CATALOG-GATE-001：擴充 helper（選項甲）vs 另寫查詢 之選擇已記錄', () => {
    const md = read(IMPL_LOG);
    expect(md).toContain('CATALOG-GATE-001');
    expect(md).toContain('選項甲');
  });

  it('CLEANUP-GATE-001：target-load 不依賴 NodeOutputStore.cleanupAll 之清理責任模型已記錄', () => {
    const md = read(IMPL_LOG);
    expect(md).toContain('CLEANUP-GATE-001');
    expect(md).toContain('NodeOutputStore');
  });
});
