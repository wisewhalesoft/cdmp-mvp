/**
 * TC-MIG-m296：BackfillBestCaseConditionPayloadDraftLists migration（M-B2）
 *   US-144 / AD-E07-18 §18.12.10
 *
 * 對應 test spec（F050-test.md §十六 O 群組）：
 *   - TS-F050-O07：draft + NOT NULL + 無 best_case → 補入；ready 不回填；null-payload 不回填
 *   - TS-F050-O08：draft 已含 best_case=['N'] → 正規化為 ['Y']
 *   - TS-F050-O09：idempotent — 已含 ['Y'] 連續 2 次無異動、不重複
 *   - TS-F050-O10：down() 移除 draft 名單 best_case 條目
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataSource } from 'typeorm';
import { BackfillBestCaseConditionPayloadDraftLists1711360000296 } from '../1711360000296-BackfillBestCaseConditionPayloadDraftLists';

describe('Migration 1711360000296: BackfillBestCaseConditionPayloadDraftLists (TS-F050-O07~O10)', () => {
  let migration: BackfillBestCaseConditionPayloadDraftLists1711360000296;
  const originalDbType = process.env.DB_TYPE;

  beforeEach(() => {
    migration = new BackfillBestCaseConditionPayloadDraftLists1711360000296();
    process.env.DB_TYPE = 'sqlite';
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
  });

  it('TS-F050-O07：draft+NOT NULL 回填；ready 不回填；null-payload 不回填', async () => {
    const ds = await setupSqlite();
    try {
      await seedList(ds, 'LIST_A', 'draft', { conditions: [], logic: 'AND' });
      await seedList(ds, 'LIST_B', 'ready', {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
        logic: 'AND',
      });
      await seedList(ds, 'LIST_C', 'draft', null);

      const qr = ds.createQueryRunner();
      await migration.up(qr);
      await qr.release();

      const a = await readPayload(ds, 'LIST_A');
      const b = await readPayload(ds, 'LIST_B');
      const c = await readRaw(ds, 'LIST_C');

      // LIST_A：draft → 補入 best_case:['Y']
      const aBest = a!.conditions.find((x) => x.columnName === 'best_case');
      expect(aBest).toBeDefined();
      expect(aBest!.values).toEqual(['Y']);

      // LIST_B：ready → 不回填（仍無 best_case）
      expect(b!.conditions.find((x) => x.columnName === 'best_case')).toBeUndefined();

      // LIST_C：null-payload → 仍為 null
      expect(c).toBeNull();
    } finally {
      await ds.destroy();
    }
  });

  it('TS-F050-O08：draft 已含 best_case=[N] → 正規化為 [Y]', async () => {
    const ds = await setupSqlite();
    try {
      await seedList(ds, 'LIST_D', 'draft', {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'best_case', fieldType: 'categorical', values: ['N'] },
        ],
        logic: 'AND',
      });

      const qr = ds.createQueryRunner();
      await migration.up(qr);
      await qr.release();

      const d = await readPayload(ds, 'LIST_D');
      const dBest = d!.conditions.find((x) => x.columnName === 'best_case');
      expect(dBest!.values).toEqual(['Y']);
    } finally {
      await ds.destroy();
    }
  });

  it('TS-F050-O09：idempotent — 已含 [Y] 連續 2 次無異動、不重複', async () => {
    const ds = await setupSqlite();
    try {
      await seedList(ds, 'LIST_E', 'draft', {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'best_case', fieldType: 'categorical', values: ['Y'] },
        ],
        logic: 'AND',
      });

      const qr1 = ds.createQueryRunner();
      await migration.up(qr1);
      await qr1.release();
      const qr2 = ds.createQueryRunner();
      await migration.up(qr2);
      await qr2.release();

      const e = await readPayload(ds, 'LIST_E');
      const bestEntries = e!.conditions.filter((x) => x.columnName === 'best_case');
      expect(bestEntries.length).toBe(1);
      expect(bestEntries[0].values).toEqual(['Y']);
    } finally {
      await ds.destroy();
    }
  });

  it('TS-F050-O10：down() 移除 draft 名單的 best_case 條目', async () => {
    const ds = await setupSqlite();
    try {
      await seedList(ds, 'LIST_A', 'draft', {
        conditions: [{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }],
        logic: 'AND',
      });

      const qr = ds.createQueryRunner();
      await migration.down(qr);
      await qr.release();

      const a = await readPayload(ds, 'LIST_A');
      expect(a!.conditions.find((x) => x.columnName === 'best_case')).toBeUndefined();
    } finally {
      await ds.destroy();
    }
  });
});

interface Cond {
  columnName: string;
  fieldType?: string;
  values?: string[];
}
interface Payload {
  conditions: Cond[];
  logic: string;
}

async function setupSqlite(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();
  await ds.query(`
    CREATE TABLE ob_list_definition (
      list_no VARCHAR(11) PRIMARY KEY,
      stage VARCHAR(20) NOT NULL DEFAULT 'draft',
      condition_payload TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return ds;
}

async function seedList(
  ds: DataSource,
  listNo: string,
  stage: string,
  payload: Payload | null,
): Promise<void> {
  await ds.query(
    `INSERT INTO ob_list_definition (list_no, stage, condition_payload, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [listNo, stage, payload === null ? null : JSON.stringify(payload)],
  );
}

async function readRaw(ds: DataSource, listNo: string): Promise<string | null> {
  const rows = await ds.query<Array<{ condition_payload: string | null }>>(
    `SELECT condition_payload FROM ob_list_definition WHERE list_no = ?`,
    [listNo],
  );
  return rows[0]?.condition_payload ?? null;
}

async function readPayload(ds: DataSource, listNo: string): Promise<Payload | null> {
  const raw = await readRaw(ds, listNo);
  return raw === null ? null : (JSON.parse(raw) as Payload);
}
