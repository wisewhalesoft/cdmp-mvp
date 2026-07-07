/**
 * AD-E07-41 P4a — CLEANUP 真實 MSSQL 整合（CLEANUP-004 成功後無殘留 / CLEANUP-005 失敗後清理 + 同 logId 重跑不撞名）。
 * 清理實際由 NodeOutputStore.cleanupAll() 之 DB_TYPE==='mssql' 分支貫穿（DB_TYPE 由 preload 設 mssql）。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NodeDispatcher } from '../node-dispatcher';
import { NodeOutputStore } from '../node-output-store';
import { PipelineRunner } from '../pipeline-runner';
import { ExtractHandlerMssql } from '../handlers/extract-handler-mssql';
import { FieldMappingHandlerMssql } from '../handlers/field-mapping-handler-mssql';
import { DerivedFieldHandlerMssql } from '../handlers/derived-field-handler-mssql';
import { TypeCastHandlerMssql } from '../handlers/type-cast-handler-mssql';
import { ConditionalHandlerMssql } from '../handlers/conditional-handler-mssql';
import { NodeExecutor, PipelineDefinition, PipelineRunnerConfig } from '../types';
import { connectMssql, teardownMssql, MssqlHarness, uniqueLogId, tempName, objectExists } from './_p4a-mssql-harness';

vi.setConfig({ testTimeout: 60000 });

let h: MssqlHarness;
let raw = '';
beforeAll(async () => {
  h = await connectMssql();
  if (!h.reachable || !h.qr) return;
  raw = 'raw_p4a_clean_' + Math.random().toString(16).slice(2, 10);
  await h.qr.query(`CREATE TABLE dbo.${raw} (code NVARCHAR(10), name NVARCHAR(50))`);
  await h.qr.query(`INSERT INTO dbo.${raw} (code, name) VALUES (N'1',N'借新還舊'),(N'2',N'中古車商')`);
}, 60000);
afterAll(async () => {
  if (h?.qr && raw) await h.qr.query(`IF OBJECT_ID('dbo.${raw}') IS NOT NULL DROP TABLE dbo.${raw}`);
  await teardownMssql(h);
  restoreDbType();
});
function guard(ctx: { skip: () => void }): boolean {
  if (!h?.reachable || !h.qr) {
    console.warn('[P4a cleanup int] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

const NODE_IDS = ['e1', 'f1', 'd1', 't1', 'c1'];
function definition(): PipelineDefinition {
  return {
    nodes: [
      { id: 'e1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'raw_data_extract', label: 'e', rawTable: raw } },
      { id: 'f1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'field_mapping', label: 'f', mappings: [{ sourceColumn: 'name', targetColumn: 'name2' }], dropUnmapped: false } },
      { id: 'd1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'derived_field', label: 'd', expressions: [{ outputColumn: 'uid', expression: 'gen_random_uuid()', outputType: 'TEXT' }] } },
      { id: 't1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'type_cast', label: 't', castRules: [] } },
      { id: 'c1', type: 'pipelineNode', position: { x: 0, y: 0 }, data: { nodeType: 'conditional', label: 'c', rules: [{ targetColumn: 'label', conditions: [{ when: `code = '1'`, then: `'ONE'` }], elseValue: 'code' }] } },
    ],
    edges: [
      { id: 'e-ef', source: 'e1', target: 'f1' },
      { id: 'e-fd', source: 'f1', target: 'd1' },
      { id: 'e-dt', source: 'd1', target: 't1' },
      { id: 'e-tc', source: 't1', target: 'c1' },
    ],
  };
}
function dispatcher(overrides: Record<string, NodeExecutor> = {}): NodeDispatcher {
  const d = new NodeDispatcher();
  d.register(new ExtractHandlerMssql());
  d.register(new FieldMappingHandlerMssql());
  d.register(new DerivedFieldHandlerMssql());
  d.register(new TypeCastHandlerMssql());
  d.register(new ConditionalHandlerMssql());
  for (const ex of Object.values(overrides)) d.register(ex);
  return d;
}
const cfg = (logId: string): PipelineRunnerConfig => ({ batchSize: 10000, upsertBatchSize: 500, isTestRun: false, pipelineId: 'p', logId });
const noop = async () => {};

describe('P4a CLEANUP MSSQL 整合', () => {
  it('CLEANUP-004: 完整 group-1 pipeline 成功後，tempdb 內 5 個 ## 皆無殘留', async (ctx) => {
    if (!guard(ctx)) return;
    const logId = uniqueLogId();
    const runner = new PipelineRunner(dispatcher(), new NodeOutputStore());
    const logs = await runner.run(definition(), cfg(logId), h.qr!, noop);
    expect(logs.every((l) => l.status === 'completed')).toBe(true);
    for (const id of NODE_IDS) {
      expect(await objectExists(h.qr!, tempName(id, logId)), `${id} ## 應已清理`).toBe(false);
    }
  });

  it('CLEANUP-005: pipeline 失敗後上游 ## 已清理，同 logId 重跑不因表名衝突失敗', async (ctx) => {
    if (!guard(ctx)) return;
    const logId = uniqueLogId();
    const throwingDerived: NodeExecutor = {
      nodeType: 'derived_field',
      execute: async () => {
        throw new Error('simulated derived failure');
      },
    };
    // run 1：derived 失敗
    const r1 = new PipelineRunner(dispatcher({ derived_field: throwingDerived }), new NodeOutputStore());
    const logs1 = await r1.run(definition(), cfg(logId), h.qr!, noop);
    expect(logs1.find((l) => l.nodeId === 'd1')!.status).toBe('failed');
    // 上游 extract/field_mapping ## 已清理
    expect(await objectExists(h.qr!, tempName('e1', logId))).toBe(false);
    expect(await objectExists(h.qr!, tempName('f1', logId))).toBe(false);

    // run 2：同 logId 正常重跑 → 不因 'there is already an object named' 失敗
    const r2 = new PipelineRunner(dispatcher(), new NodeOutputStore());
    const logs2 = await r2.run(definition(), cfg(logId), h.qr!, noop);
    expect(logs2.every((l) => l.status === 'completed')).toBe(true);
    // 重跑後亦無殘留
    for (const id of NODE_IDS) {
      expect(await objectExists(h.qr!, tempName(id, logId))).toBe(false);
    }
  });
});
