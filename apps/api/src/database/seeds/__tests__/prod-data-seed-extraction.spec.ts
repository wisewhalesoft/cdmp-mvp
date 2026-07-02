/**
 * F090 reproducible-seed 補強：extraction_tasks + OBPOOLDATA_LIST-Load pipeline
 * 由 docker compose data-seed（prod-data-seed.ts）自動、冪等建立。
 *
 * 測試對象：
 *   - data/extraction-tasks.json（19 個擷取任務：5 個 E07 核心 + 14 個客戶來源）
 *   - data/etl-pipelines.json（補 E07-OBPOOLDATA_LIST-Load）
 *   - prod-data-seed.ts: seedExtractionTasks（冪等 by name / resolve datasource / resolve user / direct INSERT）
 *
 * 等價基準：dev DB 既有 API（seed-e07-etl.mjs）建立的 5 個 extraction_tasks + pipelines
 *   raw_table_name 衍生公式 = 'raw_' + id.replace(/-/g,'').substring(0,8)
 *   （與 extraction-task.service.createTask 一致）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  seedExtractionTasks,
  ExtractionTaskSeed,
  deriveRawTableName,
} from '../prod-data-seed';

const DATA_DIR = resolve(__dirname, '..', 'data');

function loadJson<T>(file: string): T[] {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf-8')) as T[];
}

// === dev DB ground truth（API seed-e07-etl.mjs 建立者）===
const DEV_DB_TASKS = [
  { name: 'E07-OBPOOLDATA-Extract', id: '6d58393b-9a21-486a-a971-012160d25a32', sourceTable: 'OBPOOLDATA', rawTableName: 'raw_6d58393b', schedule: '0 2 1 * *' },
  { name: 'E07-OBEMPHIRE-Extract', id: 'e1e951d7-45e2-40c2-931e-93158ca253b6', sourceTable: 'OBEMPHIRE', rawTableName: 'raw_e1e951d7', schedule: '0 3 * * *' },
  { name: 'E07-OBCALENDAR-Extract', id: 'dfb3b313-b847-44f1-83c7-84d8f76e1863', sourceTable: 'OBCALENDAR', rawTableName: 'raw_dfb3b313', schedule: '0 4 1 1 *' },
  { name: 'E07-OBARRETURNDF_MIN_CAP-Extract', id: '970da79c-a283-415b-8f33-f27a1ec2a570', sourceTable: 'OB_ARRETURNDF_MIN_CAP', rawTableName: 'raw_970da79c', schedule: '0 2 1 * *' },
  { name: 'E07-OBPOOLDATA_LIST-Extract', id: '33dc3771-bae0-4303-9fb3-aff2cd5ad72e', sourceTable: 'OBPOOLDATA_LIST', rawTableName: 'raw_33dc3771', schedule: '0 1 1 * *' },
];

const APYHFC16_DATASOURCE_ID = 'af5f69a7-c3e4-41fe-b1e5-16b23f9509f8';

// === extraction-tasks.json ===
describe('data/extraction-tasks.json', () => {
  const tasks = loadJson<ExtractionTaskSeed>('extraction-tasks.json');

  it('涵蓋 5 個 E07 核心 + 14 個客戶來源 = 19 個 extraction task', () => {
    expect(tasks).toHaveLength(19);
    const names = tasks.map((t) => t.name);
    for (const n of [
      'E07-OBARRETURNDF_MIN_CAP-Extract',
      'E07-OBCALENDAR-Extract',
      'E07-OBEMPHIRE-Extract',
      'E07-OBPOOLDATA-Extract',
      'E07-OBPOOLDATA_LIST-Extract',
    ]) {
      expect(names, `缺少核心 ${n}`).toContain(n);
    }
    // 客戶來源 task（非 E07-，和勁/和潤/興業 × 代碼/客戶/產業別/重車/郵遞區號）= 14
    expect(names.filter((n) => !n.startsWith('E07-'))).toHaveLength(14);
  });

  it('每個 task 的 id / source_table / raw_table_name / schedule 與 dev DB API 建立者等價', () => {
    for (const expected of DEV_DB_TASKS) {
      const t = tasks.find((x) => x.name === expected.name);
      expect(t, `缺少 ${expected.name}`).toBeDefined();
      expect(t!.id).toBe(expected.id);
      expect(t!.sourceTable).toBe(expected.sourceTable);
      expect(t!.rawTableName).toBe(expected.rawTableName);
      expect(t!.schedule).toBe(expected.schedule);
      expect(t!.mode).toBe('full');
      expect(t!.sourceSchema).toBe('dbo');
      expect(t!.datasourceName).toBe('APYHFC16.OB');
    }
  });

  it('rawTableName 與 id 衍生公式一致（raw_ + id 前 8 hex）', () => {
    for (const t of tasks) {
      expect(t.rawTableName).toBe(deriveRawTableName(t.id));
    }
  });

  it('OBPOOLDATA_LIST-Extract 帶 sourceFilter（ASSIGNDAY < 本月，F090 歷史限定）', () => {
    const t = tasks.find((x) => x.name === 'E07-OBPOOLDATA_LIST-Extract')!;
    expect(t.sourceFilter).toBeDefined();
    expect(t.sourceFilter!.column).toBe('ASSIGNDAY');
    expect(t.sourceFilter!.operator).toBe('<');
    expect(t.sourceFilter!.valueExpr).toBe('currentMonthFirstDay');
  });
});

// === etl-pipelines.json：OBPOOLDATA_LIST-Load ===
describe('data/etl-pipelines.json E07-OBPOOLDATA_LIST-Load', () => {
  const pipelines = loadJson<any>('etl-pipelines.json');
  const list = pipelines.find((p: any) => p.name === 'E07-OBPOOLDATA_LIST-Load');

  it('已新增 E07-OBPOOLDATA_LIST-Load', () => {
    expect(list).toBeDefined();
  });

  it('既有 5 個 E07 pipeline 仍存在（不破壞）', () => {
    const names = pipelines.map((p: any) => p.name);
    for (const n of [
      'E07-OBARRETURNDF_MIN_CAP-Load',
      'E07-OBCALENDAR-Load',
      'E07-OBEMPHIRE-Load',
      'E07-OBPOOLDATA-Load',
      'ETL for Customer Core',
    ]) {
      expect(names, `缺少 ${n}`).toContain(n);
    }
  });

  it('target_load node 為 partition_replace（data_source=etl_load），非 fullMode', () => {
    const tl = list.definition.nodes.find((n: any) => n.data.nodeType === 'target_load');
    expect(tl.data.loadMode).toBe('partition_replace');
    expect(tl.data.partitionColumn).toBe('data_source');
    // v2.0（AD-E07-25 DP-AD25-1 單源化）：partitionValue 'etl_legacy' → 'etl_load'
    expect(tl.data.partitionValue).toBe('etl_load');
    expect(tl.data.partitionValue).not.toBe('etl_legacy');
    expect(tl.data.targetTable).toBe('ob_pool_data_list');
    // 與 dev DB 一致：partition_replace 不輸出 fullMode 欄位
    expect(tl.data.fullMode).toBeUndefined();
  });

  it('raw_data_extract node 帶歷史限定 sourceFilter（ASSIGNDAY < currentMonthFirstDay）', () => {
    const e1 = list.definition.nodes.find((n: any) => n.data.nodeType === 'raw_data_extract');
    expect(e1.data.sourceFilter).toEqual({
      column: 'ASSIGNDAY',
      operator: '<',
      valueExpr: 'currentMonthFirstDay',
    });
    // rawTable / extractionRef 與 dev DB OBPOOLDATA_LIST-Extract raw_table_name 等價
    expect(e1.data.rawTable).toBe('raw_33dc3771');
    expect(e1.data.extractionRef.sourceTable).toBe('raw_33dc3771');
    expect(e1.data.extractionRef.datasourceName).toBe('APYHFC16.OB');
  });

  it('field_mapping 122 欄、dropUnmapped、含 ASSIGNDAY→assignday', () => {
    const fm = list.definition.nodes.find((n: any) => n.data.nodeType === 'field_mapping');
    expect(fm.data.mappings).toHaveLength(122);
    expect(fm.data.dropUnmapped).toBe(true);
    expect(fm.data.mappings).toContainEqual({
      sourceColumn: 'ASSIGNDAY',
      targetColumn: 'assignday',
      defaultValue: null,
    });
  });

  it('step_count=3、version=1、status/version_status 與既有 E07 Load 一致', () => {
    expect(list.step_count).toBe(3);
    expect(list.version).toBe(1);
    expect(list.status).toBe('active');
    expect(list.version_status).toBe('draft');
    expect(list.enabled).toBe(false);
  });
});

// === seedExtractionTasks 冪等行為（mock QueryRunner，模擬真實 contract）===
describe('seedExtractionTasks', () => {
  /**
   * mock QueryRunner：模擬真實 contract
   *   - SELECT id FROM extraction_tasks WHERE name = $1 → 回 array（已存在 [{id}]，不存在 []）
   *   - SELECT id FROM datasources WHERE name = $1 → 回 [{id}]
   *   - resolveSeedUserId 的 SELECT users → 回 [{id}]
   *   - INSERT → 回 []
   */
  function createMockQr(opts: {
    existingTaskNames?: string[];
    datasourceId?: string | null;
    userId?: string;
  } = {}) {
    const { existingTaskNames = [], datasourceId = APYHFC16_DATASOURCE_ID, userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } = opts;
    const calls: { sql: string; params?: any[] }[] = [];

    const query = vi.fn(async (sql: string, params?: any[]) => {
      calls.push({ sql, params });

      // datasource resolve by name
      if (sql.includes('FROM datasources') && sql.includes('name')) {
        return datasourceId ? [{ id: datasourceId }] : [];
      }
      // resolveSeedUserId（dev admin / fallback admin）
      if (sql.includes('FROM users')) {
        return [{ id: userId }];
      }
      // existence check by name
      if (sql.includes('FROM extraction_tasks') && (sql.includes('WHERE name') || sql.includes('name ='))) {
        const name = params?.[0];
        return existingTaskNames.includes(name) ? [{ id: 'existing-' + name }] : [];
      }
      // INSERT
      return [];
    });

    return { query, calls } as any;
  }

  function insertCalls(qr: any) {
    return qr.calls.filter((c: any) => /INSERT\s+INTO\s+extraction_tasks/i.test(c.sql));
  }

  it('全部不存在 → INSERT 全部 19 筆，核心 5 筆含固定 id + 衍生 raw_table_name', async () => {
    const qr = createMockQr({ existingTaskNames: [] });
    await seedExtractionTasks(qr);

    const inserts = insertCalls(qr);
    expect(inserts).toHaveLength(19);

    // 驗證核心 5 筆 INSERT 帶正確 id 與 raw_table_name
    for (const expected of DEV_DB_TASKS) {
      const call = inserts.find((c: any) => c.params?.includes(expected.id));
      expect(call, `未 INSERT ${expected.name}`).toBeDefined();
      expect(call!.params).toContain(expected.rawTableName);
      expect(call!.params).toContain(expected.sourceTable);
    }
  });

  it('全部已存在 → 0 INSERT（冪等 SKIP，不洗 production）', async () => {
    const allNames = loadJson<ExtractionTaskSeed>('extraction-tasks.json').map((t) => t.name);
    const qr = createMockQr({ existingTaskNames: allNames });
    await seedExtractionTasks(qr);
    expect(insertCalls(qr)).toHaveLength(0);
  });

  it('部分已存在 → 只 INSERT 缺少者（19 - 2 = 17）', async () => {
    const qr = createMockQr({ existingTaskNames: ['E07-OBPOOLDATA-Extract', 'E07-OBEMPHIRE-Extract'] });
    await seedExtractionTasks(qr);
    const inserts = insertCalls(qr);
    expect(inserts).toHaveLength(17);
    // 已存在的不應被 INSERT
    expect(inserts.find((c: any) => c.params?.includes('6d58393b-9a21-486a-a971-012160d25a32'))).toBeUndefined();
    // 缺少的應 INSERT
    expect(inserts.find((c: any) => c.params?.includes('33dc3771-bae0-4303-9fb3-aff2cd5ad72e'))).toBeDefined();
  });

  it('每筆 INSERT 帶其 datasourceName 逐一解析出的 datasource_id（per-task 解析）', async () => {
    const qr = createMockQr({ existingTaskNames: [], datasourceId: APYHFC16_DATASOURCE_ID });
    await seedExtractionTasks(qr);
    for (const call of insertCalls(qr)) {
      expect(call.params).toContain(APYHFC16_DATASOURCE_ID);
    }
  });

  it('task 引用的 datasource 不存在 → 拋錯且不 INSERT（fail-fast，避免建立懸空 FK）', async () => {
    const qr = createMockQr({ existingTaskNames: [], datasourceId: null });
    await expect(seedExtractionTasks(qr)).rejects.toThrow(/datasource/);
    expect(insertCalls(qr)).toHaveLength(0);
  });
});
