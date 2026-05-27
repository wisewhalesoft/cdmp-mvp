/**
 * F094 / AD-E07-25 §25.4（DP-AD25-2 / DP-AD25-6，Phase A）
 * Migration m292 CreateObMonthlyRunResult + entity 一致性
 *
 * 涵蓋測試設計（F094-test）：
 *   - TS-F094-MIG-001：up() 建表 + 複合 PK + FK CASCADE + 索引（PostgreSQL）
 *   - TS-F094-MIG-002：down() DROP TABLE 可逆（不影響 FK 目標表 assignment_run）
 *   - TS-F094-MIG-003：SQLite 環境 no-op（DB_TYPE=sqlite）
 *   - TS-F094-ENT-001：entity TIMESTAMP 欄位用 dateColumnType（不存在 datetime 硬編）；assignday 字串 nullable
 *   - TS-F094-ENT-002：entity 複合 PK 四欄 + FK onDelete CASCADE + class 名稱 ObMonthlyRunResult
 *
 * 測試層：mock queryRunner（createTable / createForeignKey / createIndex / dropTable）斷言 + 原始碼靜態分析
 *         + TypeORM getMetadataArgsStorage 反射。本專案無 PG TestContainer（package 未安裝，memory：
 *         feedback_pg_advisory_lock_sqlite_compat 決策 B）；真實 PG up/down + FK CASCADE 行為驗證標
 *         DEFERRED 於 staging 手動執行（pipeline service spec 以 better-sqlite3 in-memory 涵蓋 FK CASCADE 行為）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';
import type { QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { getMetadataArgsStorage } from 'typeorm';

import { CreateObMonthlyRunResult1711360000292 } from '../1711360000292-CreateObMonthlyRunResult';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';

const ENTITY_PATH = path.resolve(
  __dirname,
  '../../entities/ob-monthly-run-result.entity.ts',
);
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../1711360000292-CreateObMonthlyRunResult.ts',
);

interface MockQueryRunner {
  createTable: ReturnType<typeof vi.fn>;
  createForeignKey: ReturnType<typeof vi.fn>;
  createIndex: ReturnType<typeof vi.fn>;
  dropTable: ReturnType<typeof vi.fn>;
}

describe('Migration m292: CreateObMonthlyRunResult (F094 / AD-E07-25)', () => {
  let migration: CreateObMonthlyRunResult1711360000292;
  let qr: MockQueryRunner;
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new CreateObMonthlyRunResult1711360000292();
    qr = {
      createTable: vi.fn().mockResolvedValue(undefined),
      createForeignKey: vi.fn().mockResolvedValue(undefined),
      createIndex: vi.fn().mockResolvedValue(undefined),
      dropTable: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  // ---- TS-F094-MIG-001 ----
  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F094-MIG-001a: createTable ob_monthly_run_result，PK 為 (run_id, list_no, orgno, appl_no) 四欄', async () => {
      await migration.up(qr as unknown as QueryRunner);
      expect(qr.createTable).toHaveBeenCalledTimes(1);
      const table = qr.createTable.mock.calls[0][0] as Table;
      expect(table.name).toBe('ob_monthly_run_result');
      const pkCols = table.columns
        .filter((c) => c.isPrimary)
        .map((c) => c.name)
        .sort();
      expect(pkCols).toEqual(['appl_no', 'list_no', 'orgno', 'run_id']);
    });

    it('TS-F094-MIG-001b: FK fk_omrr_run → assignment_run(run_id) ON DELETE CASCADE', async () => {
      await migration.up(qr as unknown as QueryRunner);
      expect(qr.createForeignKey).toHaveBeenCalledTimes(1);
      const [tableName, fk] = qr.createForeignKey.mock.calls[0] as [string, TableForeignKey];
      expect(tableName).toBe('ob_monthly_run_result');
      expect(fk.name).toBe('fk_omrr_run');
      expect(fk.columnNames).toEqual(['run_id']);
      expect(fk.referencedTableName).toBe('assignment_run');
      expect(fk.referencedColumnNames).toEqual(['run_id']);
      expect(fk.onDelete).toBe('CASCADE');
    });

    it('TS-F094-MIG-001c: 建立 4 個索引（run_id / list_run / custo_no partial / assignday partial）', async () => {
      await migration.up(qr as unknown as QueryRunner);
      const idxNames = qr.createIndex.mock.calls.map((c) => (c[1] as TableIndex).name);
      expect(idxNames).toEqual(
        expect.arrayContaining([
          'idx_omrr_run_id',
          'idx_omrr_list_run',
          'idx_omrr_custo_no',
          'idx_omrr_assignday',
        ]),
      );
      // partial index（custo_no / assignday IS NOT NULL）
      const custoIdx = qr.createIndex.mock.calls
        .map((c) => c[1] as TableIndex)
        .find((i) => i.name === 'idx_omrr_custo_no');
      expect(custoIdx!.where).toMatch(/custo_no IS NOT NULL/);
      const assigndayIdx = qr.createIndex.mock.calls
        .map((c) => c[1] as TableIndex)
        .find((i) => i.name === 'idx_omrr_assignday');
      expect(assigndayIdx!.where).toMatch(/assignday IS NOT NULL/);
    });

    it('TS-F094-MIG-001d: assignday nullable + result_status default PENDING + settle_src default N', async () => {
      await migration.up(qr as unknown as QueryRunner);
      const table = qr.createTable.mock.calls[0][0] as Table;
      const byName = (n: string) => table.columns.find((c) => c.name === n)!;
      expect(byName('assignday').isNullable).toBe(true);
      expect(String(byName('result_status').default)).toMatch(/PENDING/);
      expect(String(byName('settle_src').default)).toMatch(/N/);
      expect(byName('settle_src').isNullable).toBe(false);
    });
  });

  // ---- TS-F094-MIG-002 ----
  describe('down() — PostgreSQL（可逆）', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F094-MIG-002a: down() DROP TABLE ob_monthly_run_result', async () => {
      await migration.down(qr as unknown as QueryRunner);
      expect(qr.dropTable).toHaveBeenCalledTimes(1);
      expect(qr.dropTable.mock.calls[0][0]).toBe('ob_monthly_run_result');
    });

    it('TS-F094-MIG-002b: down() 不刪 assignment_run（FK 目標表）', async () => {
      await migration.down(qr as unknown as QueryRunner);
      const dropped = qr.dropTable.mock.calls.map((c) => c[0]);
      expect(dropped).not.toContain('assignment_run');
    });
  });

  // ---- TS-F094-MIG-003 ----
  describe('SQLite — no-op 慣例', () => {
    it('TS-F094-MIG-003a: up() SQLite 完全略過（synchronize 涵蓋）', async () => {
      process.env.DB_TYPE = 'sqlite';
      await migration.up(qr as unknown as QueryRunner);
      expect(qr.createTable).not.toHaveBeenCalled();
      expect(qr.createForeignKey).not.toHaveBeenCalled();
      expect(qr.createIndex).not.toHaveBeenCalled();
    });

    it('TS-F094-MIG-003b: down() SQLite 完全略過', async () => {
      process.env.DB_TYPE = 'sqlite';
      await migration.down(qr as unknown as QueryRunner);
      expect(qr.dropTable).not.toHaveBeenCalled();
    });

    it('TS-F094-MIG-003c: 原始碼含 DB_TYPE==="sqlite" 分支（up + down 對稱）', () => {
      const src = readFileSync(MIGRATION_PATH, 'utf8');
      const sqliteGuards = src.match(/process\.env\.DB_TYPE\s*===\s*'sqlite'/g) || [];
      expect(sqliteGuards.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---- TS-F094-ENT-001 / ENT-002 ----
describe('Entity ob-monthly-run-result.entity.ts — F094 ENT', () => {
  it('TS-F094-ENT-001a: created_at / updated_at 使用 dateColumnType helper（非 datetime 硬編）', () => {
    const src = readFileSync(ENTITY_PATH, 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*dateColumnType[^}]*\}\s*from/);
    expect(src).toMatch(/name:\s*'created_at',\s*type:\s*dateColumnType/);
    expect(src).toMatch(/name:\s*'updated_at',\s*type:\s*dateColumnType/);
    // 不存在 type: 'datetime' 硬編
    expect(src).not.toMatch(/type:\s*'datetime'/);
  });

  it('TS-F094-ENT-001b: assignday 為字串型別 varchar(100) nullable（非 DATE 型別）', () => {
    const cols = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ObMonthlyRunResult,
    );
    const assignday = cols.find((c) => (c.options?.name ?? c.propertyName) === 'assignday');
    expect(assignday).toBeDefined();
    expect(assignday!.options.type).toBe('varchar');
    expect(assignday!.options.length).toBe(100);
    expect(assignday!.options.nullable).toBe(true);
  });

  it('TS-F094-ENT-002a: 複合 PK 四欄 run_id / list_no / orgno / appl_no', () => {
    const cols = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ObMonthlyRunResult,
    );
    const pkCols = cols
      .filter((c) => c.mode === 'regular' && c.options.primary)
      .map((c) => c.options?.name ?? c.propertyName)
      .sort();
    expect(pkCols).toEqual(['appl_no', 'list_no', 'orgno', 'run_id']);
  });

  it('TS-F094-ENT-002b: FK ManyToOne → AssignmentRun 含 onDelete CASCADE', () => {
    const relations = getMetadataArgsStorage().relations.filter(
      (r) => r.target === ObMonthlyRunResult,
    );
    expect(relations.length).toBeGreaterThanOrEqual(1);
    const fkRel = relations[0];
    expect(fkRel.relationType).toBe('many-to-one');
    expect((fkRel.options as { onDelete?: string }).onDelete).toBe('CASCADE');
  });

  it('TS-F094-ENT-002c: entity class 名稱為 ObMonthlyRunResult（避免命名漂移）', () => {
    expect(ObMonthlyRunResult.name).toBe('ObMonthlyRunResult');
  });

  it('TS-F094-ENT-002d: entity header 含「任一邊改動，另一邊同步修」提示', () => {
    const src = readFileSync(ENTITY_PATH, 'utf8');
    expect(src).toContain('任一邊改動，另一邊同步修');
  });
});
