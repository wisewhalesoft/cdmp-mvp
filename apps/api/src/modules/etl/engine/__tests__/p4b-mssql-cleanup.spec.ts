/**
 * AD-E07-41 P4b — CLEANUP 群組 UNIT（黑盒 spy；CI 恆常執行）。
 *
 * 驗證既有 NodeOutputStore.cleanupAll()（DB_TYPE==='mssql' 分支 + createdTables 累積集合，P4a CLEANUP-003）
 * 正確涵蓋 merge（新建 ## 表）與 lookup（原地修改，回傳與輸入相同 tempTable）兩種 DataSet.tempTable 回傳模式。
 *
 * 本測試不重議掛載位置，僅斷言真實 production helper dropMssqlTempTableIfExists 之呼叫次數與對象。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as tempTableUtil from '../handlers/mssql/temp-table.util';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeOutputStore } from '../node-output-store';
import { PipelineRunner } from '../pipeline-runner';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { LookupHandlerMssql } from '../handlers/lookup-handler-mssql';
import { MergeHandlerMssql } from '../handlers/merge-handler-mssql';
import { NodeExecutor, PipelineDefinition, PipelineRunnerConfig } from '../types';

function mockQr(rowCount = 3) {
  const calls: { sql: string; params?: any[] }[] = [];
  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (sql.includes('tempdb.sys.columns')) return [{ column_name: 'CUSTID', column_id: 1 }, { column_name: 'x', column_id: 2 }];
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [{ table_name: 'x' }];
    if (sql.includes('COUNT(*)')) return [{ cnt: rowCount }];
    return [];
  });
  return { query, calls } as any;
}

const LOG = 'abcd1234-eeee';
const tn = (nodeId: string) => `##etl_tmp_${nodeId}_abcd1234`;

// e1,e2 (extract) → lk1 (lookup default from e1，原地回傳 ##e1) → m1 (merge left=lk1(##e1), right=e2(##e2))
function buildDefinition(): PipelineDefinition {
  const mk = (id: string, nodeType: string, data: Record<string, unknown>) => ({
    id,
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: { nodeType, label: id, ...data },
  });
  return {
    nodes: [
      mk('e1', 'raw_data_extract', { rawTable: 'raw_a' }),
      mk('e2', 'raw_data_extract', { rawTable: 'raw_b' }),
      mk('lk1', 'lookup', {
        matchColumn: 'CUSTID',
        lookupMatchColumn: 'TBL_CD',
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'v_desc' }],
        noMatchStrategy: 'null',
        lookupSource: 'raw_lk',
      }),
      mk('m1', 'merge', { conditions: [{ leftColumn: 'CUSTID', rightColumn: 'CUSTID', operator: '=' }] }),
    ],
    edges: [
      { id: 'e-e1-lk1', source: 'e1', target: 'lk1' },
      { id: 'e-lk1-m1', source: 'lk1', target: 'm1', targetHandle: 'left-input' },
      { id: 'e-e2-m1', source: 'e2', target: 'm1', targetHandle: 'right-input' },
    ],
  };
}

function buildDispatcher(overrides: Record<string, NodeExecutor> = {}): NodeDispatcher {
  const d = new NodeDispatcher();
  d.register(new ExtractHandlerMssql());
  d.register(new LookupHandlerMssql());
  d.register(new MergeHandlerMssql());
  for (const ex of Object.values(overrides)) d.register(ex);
  return d;
}

const CONFIG: PipelineRunnerConfig = { batchSize: 10000, upsertBatchSize: 500, isTestRun: false, pipelineId: 'p', logId: LOG };
const noop = async () => {};

let prevDbType: string | undefined;
let dropSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  prevDbType = process.env.DB_TYPE;
  process.env.DB_TYPE = 'mssql';
  dropSpy = vi.spyOn(tempTableUtil, 'dropMssqlTempTableIfExists').mockResolvedValue(undefined);
});
afterEach(() => {
  dropSpy.mockRestore();
  if (prevDbType === undefined) delete process.env.DB_TYPE;
  else process.env.DB_TYPE = prevDbType;
});

describe('P4b CLEANUP UNIT (黑盒 spy)', () => {
  it('CLEANUP-001: merge 新建之 ## 表（##m1）被納入 createdTables 並於 cleanupAll 清理', async () => {
    const runner = new PipelineRunner(buildDispatcher(), new NodeOutputStore());
    const logs = await runner.run(buildDefinition(), CONFIG, mockQr(3), noop);
    expect(logs.every((l) => l.status === 'completed')).toBe(true);
    const dropped = dropSpy.mock.calls.map((c) => c[1]);
    expect(dropped).toContain(tn('m1'));
  });

  it('CLEANUP-002: lookup 原地回傳與上游相同 tempTable（##e1），Set 去重 → 僅清理一次', async () => {
    const runner = new PipelineRunner(buildDispatcher(), new NodeOutputStore());
    await runner.run(buildDefinition(), CONFIG, mockQr(3), noop);
    const dropped = dropSpy.mock.calls.map((c) => c[1]);
    // ##e1 於 e1（產生）與 lk1（原地回傳）皆被 store.set，但 createdTables 為 Set → 只清一次
    expect(dropped.filter((t) => t === tn('e1')).length).toBe(1);
    // 三張 distinct 暫存表：##e1（=lk1 原地）、##e2、##m1
    expect(new Set(dropped)).toEqual(new Set([tn('e1'), tn('e2'), tn('m1')]));
    expect(dropSpy).toHaveBeenCalledTimes(3);
  });
});
