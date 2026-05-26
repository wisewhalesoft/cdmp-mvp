/**
 * F090 / AD-E07-21 §21.3（DP-AD21-2 方案 A）
 * Migration m291 AddObPoolDataListDataSource + entity 一致性 + ETL config 護欄
 *
 * 涵蓋測試設計：
 *   - TS-F090-MIG-001：up() 新增 data_source 欄 + index（PostgreSQL）
 *   - TS-F090-MIG-002：down() 反序移除 index + 欄（可逆，不 DROP TABLE）
 *   - TS-F090-MIG-003：SQLite 環境 no-op（DB_TYPE=sqlite）
 *   - TS-F090-ENT-001：entity @Column data_source 屬性（name/length/nullable）
 *   - TS-F090-ENT-002：entity 與 migration 一致性（length=20、nullable、header 同步提示）
 *   - TS-F090-ETL-005：E07-OBPOOLDATA_LIST-Load 設定護欄（非 fullMode、partition-replace、無 TRUNCATE）
 *
 * 測試層：mock queryRunner SQL 斷言（對齊 m16/m270 既有 migration 測試慣例）
 *         + 原始碼 / 設定檔靜態分析。本專案無 PG TestContainer（package 未安裝），
 *         真實 PG up/down 行為驗證標 DEFERRED 於 staging 手動執行。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';
import type { QueryRunner } from 'typeorm';
import { AddObPoolDataListDataSource1711360000291 } from '../1711360000291-AddObPoolDataListDataSource';
import { getMetadataArgsStorage } from 'typeorm';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';

const ENTITY_PATH = path.resolve(
  __dirname,
  '../../entities/ob-pool-data-list.entity.ts',
);
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../1711360000291-AddObPoolDataListDataSource.ts',
);
const ETL_CONFIG_PATH = path.resolve(
  __dirname,
  '../../../../../../scripts/e07-etl-config.json',
);

describe('Migration m291: AddObPoolDataListDataSource (F090 / AD-E07-21)', () => {
  let migration: AddObPoolDataListDataSource1711360000291;
  let queryRunner: { query: ReturnType<typeof vi.fn> };
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new AddObPoolDataListDataSource1711360000291();
    queryRunner = { query: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  // ---- TS-F090-MIG-001 ----
  describe('up() — PostgreSQL', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F090-MIG-001a: ADD COLUMN data_source VARCHAR(20) NULL', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const addCol = sqls.find((s) =>
        /ALTER\s+TABLE\s+ob_pool_data_list\s+ADD\s+COLUMN.*data_source\s+VARCHAR\s*\(\s*20\s*\)/i.test(s),
      );
      expect(addCol).toBeDefined();
      // nullable（無 NOT NULL）
      expect(addCol).not.toMatch(/NOT\s+NULL/i);
    });

    it('TS-F090-MIG-001b: CREATE INDEX idx_ob_pool_data_list_data_source', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const idx = sqls.find((s) =>
        /CREATE\s+INDEX.*idx_ob_pool_data_list_data_source\s+ON\s+ob_pool_data_list\s*\(\s*data_source\s*\)/i.test(s),
      );
      expect(idx).toBeDefined();
    });

    it('TS-F090-MIG-001c: up() 不執行 UPDATE / backfill（NULL 視同 monthly_run）', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      expect(sqls.some((s) => /^\s*UPDATE\s+ob_pool_data_list/i.test(s))).toBe(false);
    });
  });

  // ---- TS-F090-MIG-002 ----
  describe('down() — PostgreSQL（可逆）', () => {
    beforeEach(() => {
      delete process.env.DB_TYPE;
    });

    it('TS-F090-MIG-002a: DROP INDEX 後 DROP COLUMN data_source', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      const dropIdxIdx = sqls.findIndex((s) =>
        /DROP\s+INDEX.*idx_ob_pool_data_list_data_source/i.test(s),
      );
      const dropColIdx = sqls.findIndex((s) =>
        /ALTER\s+TABLE\s+ob_pool_data_list\s+DROP\s+COLUMN.*data_source/i.test(s),
      );
      expect(dropIdxIdx).toBeGreaterThanOrEqual(0);
      expect(dropColIdx).toBeGreaterThanOrEqual(0);
      // index 先於 column 移除
      expect(dropIdxIdx).toBeLessThan(dropColIdx);
    });

    it('TS-F090-MIG-002b: down() 不 DROP TABLE（僅移除欄位/索引）', async () => {
      await migration.down(queryRunner as unknown as QueryRunner);
      const sqls = queryRunner.query.mock.calls.map((c) => c[0] as string);
      expect(sqls.some((s) => /DROP\s+TABLE/i.test(s))).toBe(false);
    });
  });

  // ---- TS-F090-MIG-003 ----
  describe('SQLite — no-op 慣例', () => {
    it('TS-F090-MIG-003a: up() SQLite 完全略過（synchronize 涵蓋）', async () => {
      process.env.DB_TYPE = 'sqlite';
      await migration.up(queryRunner as unknown as QueryRunner);
      expect(queryRunner.query).not.toHaveBeenCalled();
    });

    it('TS-F090-MIG-003b: down() SQLite 完全略過（對稱設計）', async () => {
      process.env.DB_TYPE = 'sqlite';
      await migration.down(queryRunner as unknown as QueryRunner);
      expect(queryRunner.query).not.toHaveBeenCalled();
    });

    it('TS-F090-MIG-003c: 原始碼含 DB_TYPE==="sqlite" 分支（up + down 對稱）', () => {
      const src = readFileSync(MIGRATION_PATH, 'utf8');
      const sqliteGuards = src.match(/process\.env\.DB_TYPE\s*===\s*'sqlite'/g) || [];
      // up() 與 down() 各一處
      expect(sqliteGuards.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---- TS-F090-ENT-001 / ENT-002 ----
describe('Entity ob-pool-data-list.entity.ts — data_source（F090 ENT）', () => {
  it('TS-F090-ENT-001: @Column metadata name=data_source length=20 nullable=true', () => {
    const cols = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ObPoolDataList,
    );
    const dataSourceCol = cols.find(
      (c) => (c.options?.name ?? c.propertyName) === 'data_source',
    );
    expect(dataSourceCol).toBeDefined();
    expect(dataSourceCol!.propertyName).toBe('data_source');
    expect(dataSourceCol!.options.length).toBe(20);
    expect(dataSourceCol!.options.nullable).toBe(true);
    expect(dataSourceCol!.mode).toBe('regular'); // 非 PrimaryColumn
  });

  it('TS-F090-ENT-002a: entity 宣告 varchar(20) 與 migration VARCHAR(20) 一致', () => {
    const entSrc = readFileSync(ENTITY_PATH, 'utf8');
    expect(entSrc).toMatch(
      /@Column\(\{\s*name:\s*'data_source',\s*type:\s*'varchar',\s*length:\s*20,\s*nullable:\s*true\s*\}\)/,
    );
    const migSrc = readFileSync(MIGRATION_PATH, 'utf8');
    expect(migSrc).toMatch(/data_source\s+VARCHAR\s*\(\s*20\s*\)/i);
  });

  it('TS-F090-ENT-002b: entity header 含「任一邊改動，另一邊同步修」提示', () => {
    const entSrc = readFileSync(ENTITY_PATH, 'utf8');
    expect(entSrc).toContain('任一邊改動，另一邊同步修');
  });
});

// ---- TS-F090-ETL-005 ----
describe('ETL config E07-OBPOOLDATA_LIST-Load 護欄（F090 ETL-005）', () => {
  const config = JSON.parse(readFileSync(ETL_CONFIG_PATH, 'utf8'));

  it('extractionTasks 含 E07-OBPOOLDATA_LIST-Extract（OBPOOLDATA_LIST / full）', () => {
    const task = config.extractionTasks.find(
      (t: any) => t.name === 'E07-OBPOOLDATA_LIST-Extract',
    );
    expect(task).toBeDefined();
    expect(task.datasourceName).toBe('APYHFC16.OB');
    expect(task.sourceSchema).toBe('dbo');
    expect(task.sourceTable).toBe('OBPOOLDATA_LIST');
    expect(task.mode).toBe('full');
  });

  it('pipelines 含 E07-OBPOOLDATA_LIST-Load（targetTable=ob_pool_data_list）', () => {
    const pipe = config.pipelines.find(
      (p: any) => p.name === 'E07-OBPOOLDATA_LIST-Load',
    );
    expect(pipe).toBeDefined();
    expect(pipe.targetTable).toBe('ob_pool_data_list');
  });

  it('TS-F090-ETL-005a: Load 為 partition-replace（fullMode=false，無 fullMode:true）', () => {
    const pipe = config.pipelines.find(
      (p: any) => p.name === 'E07-OBPOOLDATA_LIST-Load',
    );
    expect(pipe.fullMode).toBe(false);
    expect(pipe.loadMode).toBe('partition_replace');
    expect(pipe.partitionColumn).toBe('data_source');
    expect(pipe.partitionValue).toBe('etl_legacy');
  });

  it('TS-F090-ETL-005b: 設定檔不含 TRUNCATE ob_pool_data_list（regression guard）', () => {
    const raw = readFileSync(ETL_CONFIG_PATH, 'utf8');
    expect(raw).not.toMatch(/TRUNCATE\s+(TABLE\s+)?["']?ob_pool_data_list/i);
  });

  // F090 spec gap 已裁示：歷史限定改用 ASSIGNDAY < 本月第一天（來源表無 PROJECT_WORKYM）
  it('TS-F090-ETL-001(config): _historicalLimit 採 ASSIGNDAY < currentMonthFirstDay（spec gap 已解）', () => {
    const pipe = config.pipelines.find(
      (p: any) => p.name === 'E07-OBPOOLDATA_LIST-Load',
    );
    const hl = pipe._historicalLimit;
    expect(hl).toBeDefined();
    expect(hl.sourceFilterColumn).toBe('ASSIGNDAY');
    expect(hl.sourceFilterOperator).toBe('<');
    expect(hl.sourceFilterValueExpr).toBe('currentMonthFirstDay');
    // spec gap 已解決：不再留 _SPEC_GAP placeholder、不再 null
    expect(hl._SPEC_GAP).toBeUndefined();
    expect(hl.sourceFilterColumn).not.toBeNull();
    // ASSIGNDAY 須為實際存在的來源欄位（出現在 fieldMappings.sourceColumn）
    const srcCols = new Set(pipe.fieldMappings.map((m: any) => m.sourceColumn));
    expect(srcCols.has('ASSIGNDAY')).toBe(true);
  });

  it('TS-F090-ETL-004(靜態): fieldMappings 涵蓋去重/特殊DELETE所需欄位 + PK 三欄', () => {
    const pipe = config.pipelines.find(
      (p: any) => p.name === 'E07-OBPOOLDATA_LIST-Load',
    );
    const targetCols = new Set(pipe.fieldMappings.map((m: any) => m.targetColumn));
    // PK 三欄
    for (const c of ['list_no', 'orgno', 'appl_no']) expect(targetCols.has(c)).toBe(true);
    // F091 去重 / 特殊 DELETE 所需
    for (const c of [
      'custo_no', 'assignday', 'payt_term', 'deal_num', 'payt_num',
      'spec_name', 'year_produ', 'month_cnt',
    ]) {
      expect(targetCols.has(c)).toBe(true);
    }
    // data_source 不應出現在來源映射（由 partition-replace 自動填）
    expect(targetCols.has('data_source')).toBe(false);
    // settle_src（NOT NULL）必須映射
    expect(targetCols.has('settle_src')).toBe(true);
  });
});
