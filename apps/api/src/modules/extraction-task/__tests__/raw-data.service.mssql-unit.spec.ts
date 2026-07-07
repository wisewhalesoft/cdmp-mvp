/**
 * AD-E07-41 P4e — raw-data.service MSSQL 純函式 / 靜態守門（CI 恆常執行，免真實連線）。
 *
 * 覆蓋：§一 TYPEMAP-001..008（mapToMssqlType 矩陣）、§一 TYPEMAP-009/010/011（createRawTable DDL
 * 三分支字串斷言，以 fake DataSource 捕捉生成 SQL）、§三 DISPATCH-002（supportsBulk 三態，service 層）、
 * §四 BULKWRITE-005（openBulkWriter guard）、§十一 STATIC-001/002/003。
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RawDataService } from '../raw-data.service';
import type { ColumnMetadata } from '../extraction-executor.provider';

type Driver = 'postgres' | 'mssql' | 'sqlite';

/** RawDataService over a fake DataSource whose `query` records every generated SQL. */
function makeCap(type: Driver, extraOptions: Record<string, any> = {}) {
  const q = vi.fn().mockResolvedValue([]);
  const fakeDs = { options: { type, ...extraOptions }, query: q } as unknown as DataSource;
  return { svc: new RawDataService(fakeDs, null as any, null as any), q };
}

function mapMssql(dataType: string): string {
  const { svc } = makeCap('mssql');
  return (svc as any).mapToMssqlType(dataType);
}

// ---------------------------------------------------------------------------
// §一 TYPEMAP — mapToMssqlType 矩陣
// ---------------------------------------------------------------------------
describe('P4e TYPEMAP — mapToMssqlType', () => {
  it('TYPEMAP-001: 整數/布林家族恆等映射', () => {
    expect(mapMssql('int')).toBe('INT');
    expect(mapMssql('integer')).toBe('INT');
    expect(mapMssql('bigint')).toBe('BIGINT');
    expect(mapMssql('smallint')).toBe('SMALLINT');
    expect(mapMssql('tinyint')).toBe('TINYINT');
    expect(mapMssql('bit')).toBe('BIT');
    expect(mapMssql('bool')).toBe('BIT');
    expect(mapMssql('boolean')).toBe('BIT');
  });

  it('TYPEMAP-002: serial（PG 專屬防禦分支）→ INT（bigserial 亦命中 serial → INT，與 PG mapper 對稱）', () => {
    expect(mapMssql('serial')).toBe('INT');
    expect(mapMssql('bigserial')).toBe('INT');
  });

  it('TYPEMAP-003 (MUST-FIX): decimal/numeric/money 不得為固定精度 DECIMAL(p,s)，一律 NVARCHAR(MAX)', () => {
    for (const t of ['decimal', 'numeric', 'money', 'smallmoney', 'decimal(38,10)', 'numeric(8,2)']) {
      expect(mapMssql(t), t).toBe('NVARCHAR(MAX)');
    }
    // 明確不得出現固定精度 DECIMAL 字面（FINDING-P4D-01 同型缺陷家族防線）
    expect(mapMssql('decimal')).not.toMatch(/DECIMAL\s*\(/i);
  });

  it('TYPEMAP-004: 字串家族統一 NVARCHAR(MAX)（N-prefix，非裸 VARCHAR）', () => {
    for (const t of ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext', 'xml', 'varchar(50)']) {
      expect(mapMssql(t), t).toBe('NVARCHAR(MAX)');
    }
  });

  it('TYPEMAP-005: 日期時間家族 → DATETIME2；time → TIME', () => {
    for (const t of ['date', 'datetime', 'datetime2', 'smalldatetime', 'timestamp']) {
      expect(mapMssql(t), t).toBe('DATETIME2');
    }
    expect(mapMssql('time')).toBe('TIME');
  });

  it('TYPEMAP-006: 二進位家族 → VARBINARY(MAX)', () => {
    for (const t of ['binary', 'varbinary', 'image', 'bytea', 'blob']) {
      expect(mapMssql(t), t).toBe('VARBINARY(MAX)');
    }
  });

  it('TYPEMAP-007: 識別碼家族 → UNIQUEIDENTIFIER', () => {
    expect(mapMssql('uniqueidentifier')).toBe('UNIQUEIDENTIFIER');
    expect(mapMssql('uuid')).toBe('UNIQUEIDENTIFIER');
  });

  it('TYPEMAP-008 (Boundary): 未知型別 fallback NVARCHAR(MAX)（非拋錯）', () => {
    expect(mapMssql('some_weird_udt')).toBe('NVARCHAR(MAX)');
    expect(mapMssql('')).toBe('NVARCHAR(MAX)');
  });

  it('float/real → FLOAT/REAL（近似型別保留原生型別）', () => {
    expect(mapMssql('float')).toBe('FLOAT');
    expect(mapMssql('double precision')).toBe('FLOAT');
    expect(mapMssql('real')).toBe('REAL');
  });
});

// ---------------------------------------------------------------------------
// §一/§二 createRawTable DDL 三分支（TYPEMAP-009/010/011 之單元字串佐證 + REG）
// ---------------------------------------------------------------------------
describe('P4e ISPG/TYPEMAP — createRawTable 生成 DDL 三分支', () => {
  const cols: ColumnMetadata[] = [
    { name: 'CUST_NAME', dataType: 'nvarchar', isPrimary: false },
    { name: 'AMOUNT', dataType: 'decimal', isPrimary: false },
    { name: 'AGE', dataType: 'int', isPrimary: false },
  ];

  it('TYPEMAP-010/011 (MUST-FIX 目標): mssql 分支 → IDENTITY / DATETIME2 SYSUTCDATETIME / NVARCHAR(MAX)，且無 SQLite/PG 語法', async () => {
    const { svc, q } = makeCap('mssql');
    await svc.createRawTable('raw_deadbeef', cols);
    const ddl: string = q.mock.calls[0][0];
    expect(ddl).toContain('_cdmp_id INT IDENTITY(1,1) PRIMARY KEY');
    expect(ddl).toContain('_cdmp_extracted_at DATETIME2 DEFAULT SYSUTCDATETIME()');
    expect(ddl).toContain('"CUST_NAME" NVARCHAR(MAX)');
    expect(ddl).toContain('"AMOUNT" NVARCHAR(MAX)'); // decimal → NVARCHAR(MAX)
    expect(ddl).toContain('"AGE" INT');
    // T-SQL 無 CREATE TABLE IF NOT EXISTS → 以 OBJECT_ID 守門
    expect(ddl).toMatch(/IF OBJECT_ID\('dbo\.raw_deadbeef', 'U'\) IS NULL CREATE TABLE/);
    // 不得殘留 SQLite / PG 專屬語法（TYPEMAP-009 陷阱之反證）
    expect(ddl).not.toContain('AUTOINCREMENT');
    expect(ddl).not.toContain('SERIAL');
    expect(ddl).not.toContain('NOW()');
    expect(ddl).not.toContain('CREATE TABLE IF NOT EXISTS');
  });

  it('REG (postgres 分支不變): SERIAL / TIMESTAMP NOW() / IF NOT EXISTS', async () => {
    const { svc, q } = makeCap('postgres');
    await svc.createRawTable('raw_deadbeef', cols);
    const ddl: string = q.mock.calls[0][0];
    expect(ddl).toContain('_cdmp_id SERIAL PRIMARY KEY');
    expect(ddl).toContain('_cdmp_extracted_at TIMESTAMP DEFAULT NOW()');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS');
    expect(ddl).not.toContain('IDENTITY');
  });

  it('REG (sqlite 分支不變): AUTOINCREMENT / TEXT datetime(now) / IF NOT EXISTS', async () => {
    const { svc, q } = makeCap('sqlite');
    await svc.createRawTable('raw_deadbeef', cols);
    const ddl: string = q.mock.calls[0][0];
    expect(ddl).toContain('_cdmp_id INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(ddl).toContain("_cdmp_extracted_at TEXT DEFAULT (datetime('now'))");
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS');
    expect(ddl).not.toContain('IDENTITY');
  });

  it('CREATETABLE-003 (單一/複合 PK 於 mssql 分支語法正確)', async () => {
    const single = makeCap('mssql');
    await single.svc.createRawTable('raw_deadbeef', [
      { name: 'ID', dataType: 'int', isPrimary: true },
      { name: 'V', dataType: 'varchar', isPrimary: false },
    ]);
    const d1: string = single.q.mock.calls[0][0];
    expect(d1).toContain('"ID" INT PRIMARY KEY');
    expect(d1).not.toContain('IDENTITY'); // 有來源 PK → 不加 _cdmp_id

    const composite = makeCap('mssql');
    await composite.svc.createRawTable('raw_deadbeef', [
      { name: 'K1', dataType: 'int', isPrimary: true },
      { name: 'K2', dataType: 'varchar', isPrimary: true },
    ]);
    const d2: string = composite.q.mock.calls[0][0];
    expect(d2).toContain('PRIMARY KEY ("K1", "K2")');
  });
});

// ---------------------------------------------------------------------------
// §三 DISPATCH-002 / §四 BULKWRITE-005（service 層）
// ---------------------------------------------------------------------------
describe('P4e DISPATCH-002 / BULKWRITE-005 — capability + guard', () => {
  it('DISPATCH-002: supportsBulk 三態 — mssql=true、postgres/sqlite=false（與 supportsCopy 互斥）', () => {
    const ms = makeCap('mssql').svc;
    const pg = makeCap('postgres').svc;
    const lite = makeCap('sqlite').svc;
    expect(ms.supportsBulk()).toBe(true);
    expect(ms.supportsCopy()).toBe(false);
    expect(pg.supportsBulk()).toBe(false);
    expect(pg.supportsCopy()).toBe(true);
    expect(lite.supportsBulk()).toBe(false);
    expect(lite.supportsCopy()).toBe(false);
  });

  it('BULKWRITE-005: openBulkWriter 對 postgres/sqlite 目標拋錯（訊息含 MSSQL/SQL Server）', async () => {
    await expect(makeCap('postgres').svc.openBulkWriter('raw_deadbeef', ['a'])).rejects.toThrow(
      /MSSQL|SQL Server/,
    );
    await expect(makeCap('sqlite').svc.openBulkWriter('raw_deadbeef', ['a'])).rejects.toThrow(
      /MSSQL|SQL Server/,
    );
  });

  it('openBulkWriter 對空欄位清單拋錯', async () => {
    await expect(makeCap('mssql').svc.openBulkWriter('raw_deadbeef', [])).rejects.toThrow(/no columns/);
  });
});

// ---------------------------------------------------------------------------
// §十一 STATIC
// ---------------------------------------------------------------------------
describe('P4e STATIC — 事實鎖定', () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, '../raw-data.service.ts'), 'utf8');

  it('STATIC-001: mssql npm 版本鎖定 ^11.0.1', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.dependencies.mssql).toBe('^11.0.1');
  });

  it('STATIC-002: 新增方法簽章存在（supportsBulk/openBulkWriter/mapToMssqlType）', () => {
    const svc = makeCap('mssql').svc;
    expect(typeof svc.supportsBulk).toBe('function');
    expect(typeof svc.openBulkWriter).toBe('function');
    expect(typeof (svc as any).mapToMssqlType).toBe('function');
  });

  it('STATIC-003 (MUST-FIX): openBulkWriter 方法本體不含 formatCopyValue 呼叫字面', () => {
    const start = SRC.indexOf('async openBulkWriter(');
    expect(start).toBeGreaterThan(-1);
    // 方法本體終點：下一個 private helper（buildMssqlConnectionConfig）宣告處
    const end = SRC.indexOf('private buildMssqlConnectionConfig(', start);
    expect(end).toBeGreaterThan(start);
    const body = SRC.slice(start, end);
    expect(body.includes('formatCopyValue')).toBe(false);
  });
});
