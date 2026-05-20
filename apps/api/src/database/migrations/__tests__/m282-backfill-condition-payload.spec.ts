/**
 * TC-MIG-m282: BackfillListDefinitionConditionPayload migration
 *   F050 v2.1 重構（AD-E07-18 §18.3 M2 / 拍板 2 一次性 backfill）
 *
 * 對應 test spec：MT-M2-001 / 002 / 003 / 005 / 006
 *
 * MT-M2-004 **SKIP** — test designer 設計時誤用 year_cnt（numeric），但 5a backward-compat 範圍
 *   只含 5 個 categorical entity column（prod_kind / caseyear / spec_tp / case_status / settle_src）；
 *   entity 無 year_cnt 欄位，且 M2 backfill 不衍生 numeric。在 implementation log 註明 SKIP 原因。
 *
 * 涵蓋 case：
 *   - MT-M2-001：5 個 entity 欄位完整 backfill → condition_payload 含 5 個 condition
 *   - MT-M2-002：NULL 欄位不轉換 → 該條件不入 condition_payload
 *   - MT-M2-003：5 個欄位全 NULL → conditions=[] + _backfill_empty: true（OQ-TEST-002）
 *   - MT-M2-005：condition_payload 已有值不覆寫（冪等保護 WHERE condition_payload IS NULL）
 *   - MT-M2-006：down() 將 condition_payload 清除為 NULL
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataSource } from 'typeorm';
import { AddObListDefinitionConditionPayload1711360000281 } from '../1711360000281-AddObListDefinitionConditionPayload';
import { BackfillListDefinitionConditionPayload1711360000282 } from '../1711360000282-BackfillListDefinitionConditionPayload';

const YM = '202605';

async function setupSchemaAndM281(): Promise<DataSource> {
  process.env.DB_TYPE = 'sqlite';
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();

  // 建簡化版 ob_list_definition
  await ds.query(`
    CREATE TABLE ob_list_definition (
      list_no VARCHAR(11) PRIMARY KEY,
      list_nm VARCHAR(45) NOT NULL,
      prod_kind VARCHAR(255) NOT NULL,
      caseyear VARCHAR(255),
      spec_tp VARCHAR(255),
      case_status VARCHAR(14),
      settle_src VARCHAR(6),
      list_type VARCHAR(255) NOT NULL DEFAULT '01',
      status VARCHAR(10) NOT NULL DEFAULT 'active'
    )
  `);

  // 跑 m281（補 condition_payload 欄位）
  const m281 = new AddObListDefinitionConditionPayload1711360000281();
  const qr = ds.createQueryRunner();
  try {
    await m281.up(qr);
  } finally {
    await qr.release();
  }
  return ds;
}

async function runM282Up(ds: DataSource): Promise<void> {
  const m282 = new BackfillListDefinitionConditionPayload1711360000282();
  const qr = ds.createQueryRunner();
  try {
    await m282.up(qr);
  } finally {
    await qr.release();
  }
}

async function runM282Down(ds: DataSource): Promise<void> {
  const m282 = new BackfillListDefinitionConditionPayload1711360000282();
  const qr = ds.createQueryRunner();
  try {
    await m282.down(qr);
  } finally {
    await qr.release();
  }
}

async function fetchPayload(ds: DataSource, listNo: string): Promise<any> {
  const rows = await ds.query<Array<{ condition_payload: string | null }>>(
    `SELECT condition_payload FROM ob_list_definition WHERE list_no = '${listNo}'`,
  );
  const raw = rows[0]?.condition_payload;
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

describe('Migration 1711360000282: BackfillListDefinitionConditionPayload (TC-MIG-m282 / MT-M2)', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = await setupSchemaAndM281();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('MT-M2-001：5 個 entity 欄位完整 → condition_payload 含 5 個 condition', async () => {
    await ds.query(
      `INSERT INTO ob_list_definition (list_no, list_nm, prod_kind, caseyear, spec_tp, case_status, settle_src)
       VALUES ('OB202605001', 'L1', 'A1$$A2', '1$$3', '01', '02', 'X')`,
    );

    await runM282Up(ds);

    const payload = await fetchPayload(ds, 'OB202605001');
    expect(payload.logic).toBe('AND');
    expect(payload.conditions).toEqual(
      expect.arrayContaining([
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['A1', 'A2'] },
        { columnName: 'caseyear', fieldType: 'categorical', values: ['1', '3'] },
        { columnName: 'spec_tp', fieldType: 'categorical', values: ['01'] },
        { columnName: 'case_status', fieldType: 'categorical', values: ['02'] },
        { columnName: 'settle_src', fieldType: 'categorical', values: ['X'] },
      ]),
    );
    expect(payload.conditions.length).toBe(5);
    expect(payload._backfill_empty).toBeUndefined();
  });

  it('MT-M2-002：NULL 欄位不轉換 → 該條件不入 condition_payload', async () => {
    // prod_kind 必填，其他 4 個欄位 NULL
    await ds.query(
      `INSERT INTO ob_list_definition (list_no, list_nm, prod_kind, caseyear, spec_tp, case_status, settle_src)
       VALUES ('OB202605002', 'L2', 'A1', NULL, NULL, NULL, NULL)`,
    );

    await runM282Up(ds);

    const payload = await fetchPayload(ds, 'OB202605002');
    expect(payload.conditions).toEqual([
      { columnName: 'prod_kind', fieldType: 'categorical', values: ['A1'] },
    ]);
  });

  it('MT-M2-003：5 個欄位全空 → conditions=[] + _backfill_empty: true（OQ-TEST-002）', async () => {
    // prod_kind = '' 視為「全 5 個欄位均空」異常名單
    await ds.query(
      `INSERT INTO ob_list_definition (list_no, list_nm, prod_kind, caseyear, spec_tp, case_status, settle_src)
       VALUES ('OB202605003', 'L3', '', NULL, NULL, NULL, NULL)`,
    );

    await runM282Up(ds);

    const payload = await fetchPayload(ds, 'OB202605003');
    expect(payload).toEqual({ conditions: [], logic: 'AND', _backfill_empty: true });
  });

  it('MT-M2-005：condition_payload 已有值不覆寫（冪等保護 WHERE condition_payload IS NULL）', async () => {
    const manual = JSON.stringify({
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['MANUAL'] }],
      logic: 'AND',
    });
    await ds.query(
      `INSERT INTO ob_list_definition (list_no, list_nm, prod_kind, caseyear, spec_tp, case_status, settle_src, condition_payload)
       VALUES ('OB202605005', 'L5', 'A1', NULL, NULL, NULL, NULL, '${manual.replace(/'/g, "''")}')`,
    );

    await runM282Up(ds);

    const payload = await fetchPayload(ds, 'OB202605005');
    expect(payload.conditions).toEqual([
      { columnName: 'prod_kind', fieldType: 'categorical', values: ['MANUAL'] },
    ]);
  });

  it('MT-M2-006：down() 將 condition_payload 清除為 NULL', async () => {
    await ds.query(
      `INSERT INTO ob_list_definition (list_no, list_nm, prod_kind, caseyear, spec_tp, case_status, settle_src)
       VALUES ('OB202605006', 'L6', 'A1', '1', NULL, NULL, NULL)`,
    );

    await runM282Up(ds);
    let payload = await fetchPayload(ds, 'OB202605006');
    expect(payload).not.toBeNull();

    await runM282Down(ds);
    payload = await fetchPayload(ds, 'OB202605006');
    expect(payload).toBeNull();
  });

  it('MT-M2-005b：第二次跑 up() 不重複處理（idempotency）', async () => {
    await ds.query(
      `INSERT INTO ob_list_definition (list_no, list_nm, prod_kind, caseyear, spec_tp, case_status, settle_src)
       VALUES ('OB202605007', 'L7', 'A1', NULL, NULL, NULL, NULL)`,
    );

    await runM282Up(ds);
    const firstPayload = await fetchPayload(ds, 'OB202605007');

    // 第二次 up：對已 backfill 之列保持原狀
    await runM282Up(ds);
    const secondPayload = await fetchPayload(ds, 'OB202605007');
    expect(secondPayload).toEqual(firstPayload);
  });
});
