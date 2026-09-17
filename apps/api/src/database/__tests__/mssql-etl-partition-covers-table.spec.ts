/**
 * MssqlEtlPartitionCoversTable（*1751884800006*）補寫邏輯之單元測試（CI 恆常執行，免真實連線）。
 *
 * 這支 migration 會改寫正式環境既有 pipeline 的 definition，且旗標一旦誤加即代表
 * 「清除步驟由 per-partition DELETE 改為全表 TRUNCATE」——誤判會靜默清空整張業務表。
 * 故以 mock QueryRunner 攔截生成的 UPDATE，逐條釘死選取條件。
 */
import { describe, it, expect } from 'vitest';
import { QueryRunner } from 'typeorm';
import { MssqlEtlPartitionCoversTable1751884800006 } from '@/database/migrations/mssql/1751884800006-MssqlEtlPartitionCoversTable';

type VersionRow = { id: string; definition: string | null };

/** 記錄所有 UPDATE 的 mock QueryRunner；SELECT 回傳給定的版本列。 */
function makeQr(rows: VersionRow[]) {
  const updates: Array<{ id: string; definition: any }> = [];
  const qr = {
    query: async (sql: string, params?: any[]) => {
      if (/^\s*SELECT/i.test(sql)) return rows;
      if (/^\s*UPDATE/i.test(sql)) {
        updates.push({ id: params![1], definition: JSON.parse(params![0]) });
        return [];
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
  } as unknown as QueryRunner;
  return { qr, updates };
}

function targetLoadNode(over: Record<string, unknown> = {}) {
  return {
    id: 'tl1',
    data: {
      nodeType: 'target_load',
      targetTable: 'ob_pool_data_list',
      loadMode: 'partition_replace',
      partitionColumn: 'data_source',
      partitionValue: 'etl_load',
      ...over,
    },
  };
}

function row(id: string, nodes: any[]): VersionRow {
  return { id, definition: JSON.stringify({ nodes, edges: [] }) };
}

const migration = () => new MssqlEtlPartitionCoversTable1751884800006();

describe('MssqlEtlPartitionCoversTable — up（補寫）', () => {
  it('COVERS-001：白名單目標表（ob_pool_data_list / customer_financial）之 partition_replace 節點補上旗標', async () => {
    const { qr, updates } = makeQr([
      row('v1', [targetLoadNode()]),
      row('v2', [targetLoadNode({ targetTable: 'customer_financial' })]),
    ]);
    await migration().up(qr);
    expect(updates.length).toBe(2);
    for (const u of updates) {
      expect(u.definition.nodes[0].data.partitionCoversTable).toBe(true);
    }
  });

  it('COVERS-002：白名單外的 targetTable 不得補寫（避免誤把他表改為全表 TRUNCATE）', async () => {
    const { qr, updates } = makeQr([
      row('v1', [targetLoadNode({ targetTable: 'some_other_table' })]),
    ]);
    await migration().up(qr);
    expect(updates.length).toBe(0);
  });

  it('COVERS-003：非 partition_replace（fullMode / UPSERT 路徑）不受影響', async () => {
    const { qr, updates } = makeQr([
      row('v1', [targetLoadNode({ loadMode: undefined, fullMode: true })]),
      row('v2', [targetLoadNode({ targetTable: 'customer_core', loadMode: undefined })]),
    ]);
    await migration().up(qr);
    expect(updates.length).toBe(0);
  });

  it('COVERS-004：非 target_load 節點（extract / field_mapping）不受影響', async () => {
    const { qr, updates } = makeQr([
      row('v1', [
        { id: 'e1', data: { nodeType: 'raw_data_extract', targetTable: 'ob_pool_data_list' } },
        { id: 'fm1', data: { nodeType: 'field_mapping' } },
      ]),
    ]);
    await migration().up(qr);
    expect(updates.length).toBe(0);
  });

  it('COVERS-005（冪等）：旗標已為 true → 不再發出 UPDATE', async () => {
    const { qr, updates } = makeQr([
      row('v1', [targetLoadNode({ partitionCoversTable: true })]),
    ]);
    await migration().up(qr);
    expect(updates.length).toBe(0);
  });

  it('COVERS-006：同一 definition 內只動符合條件的節點，其餘節點與 edges 原樣保留', async () => {
    const { qr, updates } = makeQr([
      row('v1', [
        { id: 'e1', data: { nodeType: 'raw_data_extract', rawTable: 'raw_33dc3771' } },
        targetLoadNode(),
        targetLoadNode({ targetTable: 'some_other_table' }),
      ]),
    ]);
    await migration().up(qr);
    expect(updates.length).toBe(1);
    const nodes = updates[0].definition.nodes;
    expect(nodes[0].data.partitionCoversTable).toBeUndefined();
    expect(nodes[0].data.rawTable).toBe('raw_33dc3771'); // 既有欄位未被吃掉
    expect(nodes[1].data.partitionCoversTable).toBe(true);
    expect(nodes[2].data.partitionCoversTable).toBeUndefined();
    expect(updates[0].definition.edges).toEqual([]);
  });

  it('COVERS-007：definition 為 null / 非法 JSON / 無 nodes 陣列 → 跳過且不拋（不阻擋其他版本補寫）', async () => {
    const { qr, updates } = makeQr([
      { id: 'bad1', definition: null },
      { id: 'bad2', definition: '{not json' },
      { id: 'bad3', definition: JSON.stringify({ edges: [] }) },
      row('good', [targetLoadNode()]),
    ]);
    await expect(migration().up(qr)).resolves.toBeUndefined();
    expect(updates.map((u) => u.id)).toEqual(['good']);
  });

  it('COVERS-008（fresh deploy）：無任何 pipeline 版本 → no-op', async () => {
    const { qr, updates } = makeQr([]);
    await expect(migration().up(qr)).resolves.toBeUndefined();
    expect(updates.length).toBe(0);
  });
});

describe('MssqlEtlPartitionCoversTable — down（移除）', () => {
  it('COVERS-009：移除旗標並保留其餘欄位', async () => {
    const { qr, updates } = makeQr([
      row('v1', [targetLoadNode({ partitionCoversTable: true })]),
    ]);
    await migration().down(qr);
    expect(updates.length).toBe(1);
    const data = updates[0].definition.nodes[0].data;
    expect('partitionCoversTable' in data).toBe(false);
    expect(data.partitionValue).toBe('etl_load');
  });

  it('COVERS-010（冪等）：旗標不存在 → 不發出 UPDATE', async () => {
    const { qr, updates } = makeQr([row('v1', [targetLoadNode()])]);
    await migration().down(qr);
    expect(updates.length).toBe(0);
  });
});
