/**
 * AD-E07-38 P1a — 不需 MSSQL 容器的單元回歸（REG-002 / REG-003 / HELPER-001 + column-types 值域）。
 *
 * 本檔為一般 *.spec.ts（非 *.mssql.spec.ts），恆常執行、不 gating：
 *   - REG-002：column-types.ts 既有 3 helper 新增 mssql 分支後，sqlite / postgres 既有回傳值不變。
 *   - HELPER-001（I-MSSQL-HELPER-SCOPE-01）：4 個 auth entity 內無重複 process.env.DB_TYPE 條件判斷。
 *   - REG-003：三設定點顯式三分支後，未知 DB_TYPE 落入 postgres 隱式 fallback（記錄現況，非新斷言）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ORIGINAL_DB_TYPE = process.env.DB_TYPE;

async function loadColumnTypes(dbType: string | undefined) {
  if (dbType === undefined) delete process.env.DB_TYPE;
  else process.env.DB_TYPE = dbType;
  vi.resetModules();
  return await import('@/common/database/column-types');
}

async function loadDataSourceType(dbType: string): Promise<string> {
  process.env.DB_TYPE = dbType;
  vi.resetModules();
  const mod = await import('@/database/data-source');
  return (mod.default.options as { type: string }).type;
}

afterEach(() => {
  // 還原全域預設（test/setup.ts = 'sqlite'），避免污染同 worker 後續 spec。
  if (ORIGINAL_DB_TYPE === undefined) delete process.env.DB_TYPE;
  else process.env.DB_TYPE = ORIGINAL_DB_TYPE;
  vi.resetModules();
});

describe('AD-E07-38 P1a REG-002 — column-types 既有分支值不因新增 mssql 分支而改變', () => {
  it('sqlite 分支值不變（datetime / simple-json / integer）', async () => {
    const m = await loadColumnTypes('sqlite');
    expect(m.dateColumnType).toBe('datetime');
    expect(m.jsonColumnType).toBe('simple-json');
    expect(m.surrogatePkType).toBe('integer');
    // 新增 helper 於 sqlite 的值（boolean / uuid / text）
    expect(m.boolColumnType).toBe('boolean');
    expect(m.uuidColumnType).toBe('uuid');
    expect(m.longTextColumnType).toBe('text');
    expect(m.longTextColumnLength).toBeUndefined();
    // P5i / I-MSSQL-NVARCHAR-DISPLAY-01：sqlite 維持 'varchar'（與現行 literal 'varchar' 逐值等價，零回歸）
    expect(m.nvarcharColumnType).toBe('varchar');
  });

  it('postgres 分支值不變（timestamp / jsonb / bigint）', async () => {
    const m = await loadColumnTypes('postgres');
    expect(m.dateColumnType).toBe('timestamp');
    expect(m.jsonColumnType).toBe('jsonb');
    expect(m.surrogatePkType).toBe('bigint');
    expect(m.boolColumnType).toBe('boolean');
    expect(m.uuidColumnType).toBe('uuid');
    expect(m.longTextColumnType).toBe('text');
    expect(m.longTextColumnLength).toBeUndefined();
    // P5i：postgres 維持 'varchar'（與現行 literal 'varchar' 逐值等價，零回歸）
    expect(m.nvarcharColumnType).toBe('varchar');
  });

  it('mssql 分支值正確（datetime2 / simple-json / bigint / bit / uniqueidentifier / nvarchar+MAX）', async () => {
    const m = await loadColumnTypes('mssql');
    expect(m.dateColumnType).toBe('datetime2');
    expect(m.jsonColumnType).toBe('simple-json');
    expect(m.surrogatePkType).toBe('bigint');
    expect(m.boolColumnType).toBe('bit');
    expect(m.uuidColumnType).toBe('uniqueidentifier');
    expect(m.longTextColumnType).toBe('nvarchar');
    expect(m.longTextColumnLength).toBe('MAX');
    // P5i / I-MSSQL-NVARCHAR-DISPLAY-01：mssql 取 'nvarchar'（Unicode 安全，避免 BIN collation byte 截斷）
    expect(m.nvarcharColumnType).toBe('nvarchar');
  });
});

describe('AD-E07-38 P1a HELPER-001 — 型別分歧收斂進 column-types.ts（I-MSSQL-HELPER-SCOPE-01）', () => {
  const entityDir = path.resolve(__dirname, '..', 'entities');
  const authEntities = [
    'user.entity.ts',
    'role.entity.ts',
    'token-blocklist.entity.ts',
    'password-reset-token.entity.ts',
  ];

  it.each(authEntities)('%s 內無 process.env.DB_TYPE 條件判斷', (file) => {
    const src = fs.readFileSync(path.join(entityDir, file), 'utf-8');
    expect(src.includes('process.env.DB_TYPE')).toBe(false);
  });
});

describe('REG-003 — data-source.ts 僅支援 mssql（PG 全面移除後不再有 postgres fallback）', () => {
  it('DB_TYPE=mssql → data-source.ts 型別為 mssql', async () => {
    expect(await loadDataSourceType('mssql')).toBe('mssql');
  });

  it('DB_TYPE 未設 / 未知 → data-source.ts 一律為 mssql（不再 fallback postgres）', async () => {
    expect(await loadDataSourceType('unknown-driver')).toBe('mssql');
  });
});
