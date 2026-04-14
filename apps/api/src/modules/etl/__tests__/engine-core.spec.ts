/**
 * F042: ETL 執行引擎核心框架測試
 * 覆蓋 TS-F042-001 ~ TS-F042-021
 * In-DB SQL Strategy: DataSet 為 { tempTable, rowCount }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { topologicalSort } from '../engine/topological-sort';
import { NodeOutputStore } from '../engine/node-output-store';
import { NodeDispatcher } from '../engine/node-dispatcher';
import { PipelineRunner, LogUpdateCallback } from '../engine/pipeline-runner';
import {
  PipelineNode,
  PipelineEdge,
  PipelineDefinition,
  DataSet,
  NodeExecutor,
  NodeExecutionContext,
  NodeLogEntry,
  emptyDataSet,
  makeTempTableName,
} from '../engine/types';

// --- Helper: build PipelineNode ---
function makeNode(id: string, nodeType: string, label?: string): PipelineNode {
  return {
    id,
    type: 'pipelineNode',
    position: { x: 0, y: 0 },
    data: { nodeType, label: label ?? id },
  };
}

function makeEdge(source: string, target: string, targetHandle?: string): PipelineEdge {
  return { id: `${source}-${target}`, source, target, targetHandle };
}

// --- Mock Executor ---
function createMockExecutor(nodeType: string, output?: DataSet): NodeExecutor {
  return {
    nodeType,
    execute: vi.fn().mockResolvedValue(output ?? { tempTable: 'mock_temp_table', rowCount: 1 }),
  };
}

function createFailingExecutor(nodeType: string, errorMsg: string): NodeExecutor {
  return {
    nodeType,
    execute: vi.fn().mockRejectedValue(new Error(errorMsg)),
  };
}

// --- Mock LogUpdateCallback ---
function createLogCallback(): { callback: LogUpdateCallback; calls: any[] } {
  const calls: any[] = [];
  const callback: LogUpdateCallback = vi.fn(async (nodeLogs, status, errorMessage) => {
    calls.push({
      nodeLogs: JSON.parse(JSON.stringify(nodeLogs)),
      status,
      errorMessage,
    });
  });
  return { callback, calls };
}

// --- Mock QueryRunner (for temp table cleanup) ---
function createMockQueryRunner() {
  return {
    query: vi.fn().mockResolvedValue([]),
  } as any;
}

// ===== Topological Sort Tests =====

describe('topologicalSort', () => {
  // TS-F042-001: 線性 Pipeline 拓撲排序正確性
  it('TS-F042-001: should sort linear pipeline n1→n2→n3', () => {
    const nodes = [makeNode('n1', 'raw_data_extract'), makeNode('n2', 'dedup'), makeNode('n3', 'target_load')];
    const edges = [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')];

    const result = topologicalSort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.sorted).toEqual(['n1', 'n2', 'n3']);
  });

  // TS-F042-002: Seed Pipeline 19 節點拓撲排序正確性
  it('TS-F042-002: should correctly sort seed-pipeline nodes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const seedPath = path.resolve(__dirname, '../../../../../../scripts/seed-pipeline-definition.json');
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    const { nodes, edges } = seed.definition;

    const result = topologicalSort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.sorted.length).toBe(nodes.length);

    const idx = (id: string) => result.sorted.indexOf(id);

    // ZZIP branch: e1 → df_zzip_ctype_pad1 → lk_edu1 → ... → m1 → d1 → df1 → fm1
    expect(idx('e1')).toBeLessThan(idx('df_zzip_ctype_pad1'));
    expect(idx('df_zzip_ctype_pad1')).toBeLessThan(idx('lk_edu1'));
    expect(idx('e1')).toBeLessThan(idx('m1'));
    expect(idx('e2')).toBeLessThan(idx('df_zzip_ctype_pad2'));
    expect(idx('df_zzip_ctype_pad2')).toBeLessThan(idx('lk_edu2'));
    expect(idx('e2')).toBeLessThan(idx('m1'));
    expect(idx('m1')).toBeLessThan(idx('d1'));
    expect(idx('d1')).toBeLessThan(idx('df1'));
    expect(idx('df1')).toBeLessThan(idx('fm1'));
    // Final merge → conditional → derived → target load
    expect(idx('fm1')).toBeLessThan(idx('m4'));
    expect(idx('fm2')).toBeLessThan(idx('m4'));
    expect(idx('m4')).toBeLessThan(idx('cd1'));
    expect(idx('cd1')).toBeLessThan(idx('df3'));
    expect(idx('df3')).toBeLessThan(idx('tl1'));
  });

  // TS-F042-003: 循環依賴偵測
  it('TS-F042-003: should detect cycle A→B→C→A', () => {
    const nodes = [makeNode('A', 'dedup'), makeNode('B', 'dedup'), makeNode('C', 'dedup')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')];

    const result = topologicalSort(nodes, edges);
    expect(result.hasCycle).toBe(true);
    expect(result.sorted.length).toBeLessThan(3);
  });

  // TS-F042-004: 無 edges Pipeline（孤立節點）按陣列順序執行
  it('TS-F042-004: should preserve original order for isolated nodes', () => {
    const nodes = [makeNode('x1', 'dedup'), makeNode('x2', 'dedup')];
    const edges: PipelineEdge[] = [];

    const result = topologicalSort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.sorted).toEqual(['x1', 'x2']);
  });

  // TS-F042-019: 同層多節點按原始陣列順序執行
  it('TS-F042-019: should preserve original order for same-level nodes', () => {
    const nodes = [makeNode('a', 'dedup'), makeNode('b', 'dedup'), makeNode('c', 'dedup')];
    const edges: PipelineEdge[] = [];

    const result = topologicalSort(nodes, edges);
    expect(result.sorted).toEqual(['a', 'b', 'c']);
  });
});

// ===== Node Input Collection Tests =====

describe('PipelineRunner input collection', () => {
  let dispatcher: NodeDispatcher;
  let outputStore: NodeOutputStore;
  let runner: PipelineRunner;

  beforeEach(() => {
    dispatcher = new NodeDispatcher();
    outputStore = new NodeOutputStore();
    runner = new PipelineRunner(dispatcher, outputStore);
  });

  // TS-F042-006: 單路上游（無 targetHandle）
  it('TS-F042-006: single upstream without targetHandle → inputs.default', async () => {
    const ds1: DataSet = { tempTable: 'etl_tmp_n1_abc', rowCount: 1 };
    outputStore.set('n1', ds1);

    let capturedInputs: Record<string, DataSet> | undefined;
    const mockExec: NodeExecutor = {
      nodeType: 'dedup',
      execute: vi.fn(async (ctx) => {
        capturedInputs = ctx.inputs;
        return { tempTable: 'etl_tmp_n2_abc', rowCount: 0 };
      }),
    };
    dispatcher.register(createMockExecutor('raw_data_extract'));
    dispatcher.register(mockExec);

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'raw_data_extract'), makeNode('n2', 'dedup')],
      edges: [makeEdge('n1', 'n2')],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    await runner.run(definition, { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' }, mockQr, callback);

    expect(capturedInputs).toBeDefined();
    expect(capturedInputs!['default']).toBeDefined();
    // n1 executor returned mock_temp_table, rowCount: 1
    expect(capturedInputs!['default'].tempTable).toBe('mock_temp_table');
    expect(capturedInputs!['default'].rowCount).toBe(1);
  });

  // TS-F042-007: 雙路上游（left-input / right-input）
  it('TS-F042-007: merge node receives left-input and right-input', async () => {
    const dsL: DataSet = { tempTable: 'etl_tmp_left', rowCount: 1 };
    const dsR: DataSet = { tempTable: 'etl_tmp_right', rowCount: 1 };

    let capturedInputs: Record<string, DataSet> | undefined;

    const leftExec: NodeExecutor = {
      nodeType: 'raw_data_extract',
      execute: vi.fn(async (ctx) => {
        if (ctx.node.id === 'left') return dsL;
        return dsR;
      }),
    };

    const mergeExec: NodeExecutor = {
      nodeType: 'merge',
      execute: vi.fn(async (ctx) => {
        capturedInputs = ctx.inputs;
        return { tempTable: 'etl_tmp_m1', rowCount: 0 };
      }),
    };

    dispatcher.register(leftExec);
    dispatcher.register(mergeExec);

    const definition: PipelineDefinition = {
      nodes: [
        makeNode('left', 'raw_data_extract'),
        makeNode('right', 'raw_data_extract'),
        makeNode('m1', 'merge'),
      ],
      edges: [
        makeEdge('left', 'm1', 'left-input'),
        makeEdge('right', 'm1', 'right-input'),
      ],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    await runner.run(definition, { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' }, mockQr, callback);

    expect(capturedInputs).toBeDefined();
    expect(capturedInputs!['left-input'].tempTable).toBe('etl_tmp_left');
    expect(capturedInputs!['right-input'].tempTable).toBe('etl_tmp_right');
  });

  // TS-F042-008: 上游輸出不存在 → 空 DataSet
  it('TS-F042-008: missing upstream output → empty DataSet', async () => {
    let capturedInputs: Record<string, DataSet> | undefined;

    const exec: NodeExecutor = {
      nodeType: 'dedup',
      execute: vi.fn(async (ctx) => {
        capturedInputs = ctx.inputs;
        return { tempTable: '', rowCount: 0 };
      }),
    };

    dispatcher.register({
      nodeType: 'raw_data_extract',
      execute: vi.fn(async () => emptyDataSet()),
    });
    dispatcher.register(exec);

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'raw_data_extract'), makeNode('n2', 'dedup')],
      edges: [makeEdge('n1', 'n2')],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    await runner.run(definition, { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' }, mockQr, callback);

    expect(capturedInputs!['default']).toEqual({ tempTable: '', rowCount: 0 });
  });
});

// ===== NodeDispatcher Tests =====

describe('NodeDispatcher', () => {
  // TS-F042-009: 根據 nodeType 分派正確 Executor
  it('TS-F042-009: dispatches correct executor for each nodeType', () => {
    const dispatcher = new NodeDispatcher();
    const types = [
      'raw_data_extract', 'merge', 'dedup', 'type_cast',
      'derived_field', 'field_mapping', 'conditional', 'target_load',
    ];

    for (const t of types) {
      dispatcher.register(createMockExecutor(t));
    }

    for (const t of types) {
      const exec = dispatcher.getExecutor(t);
      expect(exec.nodeType).toBe(t);
    }
  });

  // TS-F042-010: 未知 nodeType 回傳錯誤
  it('TS-F042-010: throws for unknown nodeType', () => {
    const dispatcher = new NodeDispatcher();
    expect(() => dispatcher.getExecutor('unknown_type')).toThrow('未知的節點類型：unknown_type');
  });
});

// ===== PipelineRunner Integration Tests =====

describe('PipelineRunner', () => {
  let dispatcher: NodeDispatcher;
  let outputStore: NodeOutputStore;
  let runner: PipelineRunner;

  beforeEach(() => {
    dispatcher = new NodeDispatcher();
    outputStore = new NodeOutputStore();
    runner = new PipelineRunner(dispatcher, outputStore);
  });

  // TS-F042-005: 空 nodes Pipeline 直接完成
  it('TS-F042-005: empty pipeline completes immediately', async () => {
    const definition: PipelineDefinition = { nodes: [], edges: [] };
    const { callback, calls } = createLogCallback();

    const mockQr = createMockQueryRunner();
    const result = await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    expect(result).toEqual([]);
    expect(calls[calls.length - 1].status).toBe('completed');
  });

  // TS-F042-012: 節點完成後回寫 completed 狀態與統計資訊
  it('TS-F042-012: node completion records completed status and stats', async () => {
    const output: DataSet = { tempTable: 'etl_tmp_n1', rowCount: 2 };
    dispatcher.register({ nodeType: 'dedup', execute: vi.fn(async () => output) });

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'dedup')],
      edges: [],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    const result = await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    const log = result[0];
    expect(log.status).toBe('completed');
    expect(log.outputRowCount).toBe(2);
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(log.inputRowCount).toBe(0); // root node, no inputs
  });

  // TS-F042-013: 節點執行失敗 — 標記 failed 並中止後續節點
  it('TS-F042-013: node failure marks failed and skips remaining', async () => {
    dispatcher.register(createFailingExecutor('raw_data_extract', 'n1 執行失敗'));
    dispatcher.register(createMockExecutor('dedup'));
    dispatcher.register(createMockExecutor('target_load'));

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'raw_data_extract'), makeNode('n2', 'dedup'), makeNode('n3', 'target_load')],
      edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
    };

    const mockQr = createMockQueryRunner();
    const { callback, calls } = createLogCallback();
    const result = await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    expect(result[0].status).toBe('failed');
    expect(result[0].errorMessage).toContain('n1 執行失敗');
    expect(result[1].status).toBe('skipped');
    expect(result[2].status).toBe('skipped');

    const lastCall = calls[calls.length - 1];
    expect(lastCall.status).toBe('failed');
    expect(lastCall.errorMessage).toContain('n1');
  });

  // TS-F042-014: 循環依賴導致 Pipeline 失敗
  it('TS-F042-014: cycle detection fails pipeline with all nodes pending', async () => {
    const definition: PipelineDefinition = {
      nodes: [makeNode('A', 'dedup'), makeNode('B', 'dedup'), makeNode('C', 'dedup')],
      edges: [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')],
    };

    const mockQr = createMockQueryRunner();
    const { callback, calls } = createLogCallback();
    const result = await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    for (const log of result) {
      expect(log.status).toBe('pending');
    }

    const lastCall = calls[calls.length - 1];
    expect(lastCall.status).toBe('failed');
    expect(lastCall.errorMessage).toContain('循環依賴');
  });

  // TS-F042-015: 未知 nodeType 導致節點 failed 並中止 Pipeline
  it('TS-F042-015: unknown nodeType fails node and aborts pipeline', async () => {
    dispatcher.register(createMockExecutor('dedup'));

    const definition: PipelineDefinition = {
      nodes: [makeNode('n_unknown', 'unsupported_node'), makeNode('n2', 'dedup')],
      edges: [makeEdge('n_unknown', 'n2')],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    const result = await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    expect(result[0].status).toBe('failed');
    expect(result[0].errorMessage).toBe('未知的節點類型：unsupported_node');
    expect(result[1].status).toBe('skipped');
  });

  // TS-F042-016: 測試執行模式 isTestRun 傳遞
  it('TS-F042-016: isTestRun flag passed to executor context', async () => {
    let receivedIsTestRun: boolean | undefined;
    dispatcher.register({
      nodeType: 'target_load',
      execute: vi.fn(async (ctx) => {
        receivedIsTestRun = ctx.isTestRun;
        return { tempTable: '', rowCount: 0 };
      }),
    });

    const definition: PipelineDefinition = {
      nodes: [makeNode('tl1', 'target_load')],
      edges: [],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: true, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    expect(receivedIsTestRun).toBe(true);
  });

  // TS-F042-017: Pipeline 完成後 nodeOutputMap 清理（temp tables dropped）
  it('TS-F042-017: output store cleared after pipeline completion', async () => {
    dispatcher.register(createMockExecutor('dedup'));

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'dedup'), makeNode('n2', 'dedup'), makeNode('n3', 'dedup')],
      edges: [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    expect(outputStore.size).toBe(0);
    // Verify DROP TABLE was called for cleanup
    const dropCalls = (mockQr.query as any).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('DROP TABLE'),
    );
    expect(dropCalls.length).toBeGreaterThan(0);
  });

  // TS-F042-018: 記憶體回收 — 節點輸出在所有下游完成後釋放
  it('TS-F042-018: node output released only after all downstream complete', async () => {
    const releaseSpied: string[] = [];
    const origRelease = outputStore.release.bind(outputStore);
    outputStore.release = vi.fn((nodeId: string) => {
      releaseSpied.push(nodeId);
      origRelease(nodeId);
    });

    let execCount = 0;
    dispatcher.register({
      nodeType: 'dedup',
      execute: vi.fn(async () => {
        execCount++;
        return { tempTable: `etl_tmp_exec_${execCount}`, rowCount: 1 };
      }),
    });

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'dedup'), makeNode('n2', 'dedup'), makeNode('n3', 'dedup')],
      edges: [makeEdge('n1', 'n2'), makeEdge('n1', 'n3')],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    expect(releaseSpied).toContain('n1');
  });

  // TS-F042-011: Running status recorded before execution
  it('TS-F042-011: node status set to running before executor runs', async () => {
    dispatcher.register({
      nodeType: 'dedup',
      execute: vi.fn(async () => {
        return { tempTable: '', rowCount: 0 };
      }),
    });

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'dedup')],
      edges: [],
    };

    const mockQr = createMockQueryRunner();
    const { callback, calls } = createLogCallback();
    await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    const firstUpdate = calls.find(c => c.nodeLogs[0]?.status === 'running');
    expect(firstUpdate).toBeDefined();
    expect(firstUpdate!.status).toBe('running');
  });

  // TS-F042-020: Pipeline 成功完成 callback
  it('TS-F042-020: successful pipeline reports completed status', async () => {
    dispatcher.register(createMockExecutor('dedup'));

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'dedup')],
      edges: [],
    };

    const mockQr = createMockQueryRunner();
    const { callback, calls } = createLogCallback();
    await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: false, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    const lastCall = calls[calls.length - 1];
    expect(lastCall.status).toBe('completed');
  });

  // TS-F042-021: test run isTestRun=true propagated
  it('TS-F042-021: test run mode propagated to config', async () => {
    let capturedContext: NodeExecutionContext | undefined;
    dispatcher.register({
      nodeType: 'dedup',
      execute: vi.fn(async (ctx) => {
        capturedContext = ctx;
        return { tempTable: '', rowCount: 0 };
      }),
    });

    const definition: PipelineDefinition = {
      nodes: [makeNode('n1', 'dedup')],
      edges: [],
    };

    const mockQr = createMockQueryRunner();
    const { callback } = createLogCallback();
    await runner.run(
      definition,
      { batchSize: 100, upsertBatchSize: 100, isTestRun: true, pipelineId: 'p1', logId: 'l1' },
      mockQr,
      callback,
    );

    expect(capturedContext!.isTestRun).toBe(true);
    expect(capturedContext!.pipelineId).toBe('p1');
    expect(capturedContext!.logId).toBe('l1');
  });
});

// ===== makeTempTableName Tests =====

describe('makeTempTableName', () => {
  it('generates temp table name with nodeId and logId prefix', () => {
    const name = makeTempTableName('e1', 'abcd1234-5678-9012-3456-789012345678');
    expect(name).toBe('etl_tmp_e1_abcd1234');
  });

  it('sanitizes special characters in nodeId', () => {
    const name = makeTempTableName('node-1', 'abcd1234-5678');
    expect(name).toBe('etl_tmp_node_1_abcd1234');
  });
});

// ===== NodeOutputStore temp table management =====

describe('NodeOutputStore', () => {
  it('getAllTempTables returns all non-empty temp table names', () => {
    const store = new NodeOutputStore();
    store.set('n1', { tempTable: 'etl_tmp_n1', rowCount: 10 });
    store.set('n2', { tempTable: 'etl_tmp_n2', rowCount: 5 });
    store.set('n3', { tempTable: '', rowCount: 0 }); // empty dataset

    const tables = store.getAllTempTables();
    expect(tables).toEqual(['etl_tmp_n1', 'etl_tmp_n2']);
  });

  it('cleanupAll drops all temp tables and clears store', async () => {
    const store = new NodeOutputStore();
    store.set('n1', { tempTable: 'etl_tmp_n1', rowCount: 10 });
    store.set('n2', { tempTable: 'etl_tmp_n2', rowCount: 5 });

    const mockQr = createMockQueryRunner();
    await store.cleanupAll(mockQr);

    expect(store.size).toBe(0);
    const dropCalls = (mockQr.query as any).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('DROP TABLE'),
    );
    expect(dropCalls.length).toBe(2);
  });
});
