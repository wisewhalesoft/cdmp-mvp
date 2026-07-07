/**
 * AD-E07-41 P4a — CLEANUP 群組 UNIT（黑盒 spy，不預設清理呼叫者位置；CI 恆常執行）。
 *
 * 覆蓋 CLEANUP-001（成功兩路徑各節點清理）、CLEANUP-002（中途失敗仍清上游）。
 * 清理實際掛載於 NodeOutputStore.cleanupAll()（DB_TYPE==='mssql' 分支，見 impl log CLEANUP-003），
 * 本測試不假設掛載點——僅斷言真實 production helper dropMssqlTempTableIfExists 被呼叫之次數與參數。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as tempTableUtil from '../handlers/mssql/temp-table.util';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeOutputStore } from '../node-output-store';
import { PipelineRunner } from '../pipeline-runner';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { FieldMappingHandlerMssql } from '../handlers/field-mapping-handler-mssql';
import { DerivedFieldHandlerMssql } from '../handlers/derived-field-handler-mssql';
import { TypeCastHandlerMssql } from '../handlers/type-cast-handler-mssql';
import { ConditionalHandlerMssql } from '../handlers/conditional-handler-mssql';
import { NodeExecutor, PipelineDefinition, PipelineRunnerConfig } from '../types';

function mockQr(rowCount = 3) {
  const calls: { sql: string; params?: any[] }[] = [];
  const query = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (sql.includes('tempdb.sys.columns')) return [{ column_name: 'a', column_id: 1 }, { column_name: 'b', column_id: 2 }];
    if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [{ table_name: 'x' }];
    if (sql.includes('COUNT(*)')) return [{ cnt: rowCount }];
    return [];
  });
  return { query, calls } as any;
}

const LOG = 'abcd1234-eeee';
const NODES = [
  { id: 'e1', nodeType: 'raw_data_extract', data: { rawTable: 'raw_test' } },
  { id: 'f1', nodeType: 'field_mapping', data: { mappings: [{ sourceColumn: 'a', targetColumn: 'a' }], dropUnmapped: false } },
  { id: 'd1', nodeType: 'derived_field', data: { expressions: [{ outputColumn: 'd', expression: 'gen_random_uuid()', outputType: 'TEXT' }] } },
  { id: 't1', nodeType: 'type_cast', data: { castRules: [] } },
  { id: 'c1', nodeType: 'conditional', data: { rules: [{ targetColumn: 'a', conditions: [{ when: `a = '1'`, then: `'2'` }], elseValue: 'a' }] } },
];

function buildDefinition(): PipelineDefinition {
  return {
    nodes: NODES.map((n) => ({ id: n.id, type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: n.nodeType, label: n.id, ...n.data } })),
    edges: [
      { id: 'e-ef', source: 'e1', target: 'f1' },
      { id: 'e-fd', source: 'f1', target: 'd1' },
      { id: 'e-dt', source: 'd1', target: 't1' },
      { id: 'e-tc', source: 't1', target: 'c1' },
    ],
  };
}

function buildDispatcher(overrides: Record<string, NodeExecutor> = {}): NodeDispatcher {
  const d = new NodeDispatcher();
  d.register(new ExtractHandlerMssql());
  d.register(new FieldMappingHandlerMssql());
  d.register(new DerivedFieldHandlerMssql());
  d.register(new TypeCastHandlerMssql());
  d.register(new ConditionalHandlerMssql());
  for (const ex of Object.values(overrides)) d.register(ex);
  return d;
}

const CONFIG: PipelineRunnerConfig = { batchSize: 10000, upsertBatchSize: 500, isTestRun: false, pipelineId: 'p', logId: LOG };
const noop = async () => {};
const tn = (nodeId: string) => `##etl_tmp_${nodeId}_abcd1234`;

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

describe('P4a CLEANUP UNIT (黑盒 spy)', () => {
  it('CLEANUP-001: 成功執行後，5 個 ## 暫存表各觸發 1 次 dropMssqlTempTableIfExists', async () => {
    const runner = new PipelineRunner(buildDispatcher(), new NodeOutputStore());
    const logs = await runner.run(buildDefinition(), CONFIG, mockQr(3), noop);

    expect(logs.every((l) => l.status === 'completed')).toBe(true);
    expect(dropSpy).toHaveBeenCalledTimes(5);
    const dropped = dropSpy.mock.calls.map((c) => c[1]);
    expect(new Set(dropped)).toEqual(new Set(['e1', 'f1', 'd1', 't1', 'c1'].map(tn)));
  });

  it('CLEANUP-002: 中途節點（derived_field）失敗，已完成上游（extract/field_mapping）仍被清理', async () => {
    const throwingDerived: NodeExecutor = {
      nodeType: 'derived_field',
      execute: async () => {
        throw new Error('simulated derived failure');
      },
    };
    const runner = new PipelineRunner(buildDispatcher({ derived_field: throwingDerived }), new NodeOutputStore());
    const logs = await runner.run(buildDefinition(), CONFIG, mockQr(3), noop);

    expect(logs.find((l) => l.nodeId === 'd1')!.status).toBe('failed');
    const dropped = dropSpy.mock.calls.map((c) => c[1]);
    // 前 2 個成功節點之 ## 表各被清理 1 次
    expect(dropped).toContain(tn('e1'));
    expect(dropped).toContain(tn('f1'));
    // 失敗節點 derived 未成功建表 → 不強制要求（且不應出現下游 t1/c1）
    expect(dropped).not.toContain(tn('t1'));
    expect(dropped).not.toContain(tn('c1'));
  });
});
