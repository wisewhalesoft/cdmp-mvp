import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import type { Node, Edge } from '@xyflow/react';
import { computeNodeOutputColumns } from '../node-field-stats';
import {
  mockSourceColumnsA,
  mockSourceColumnsB,
  extractNode1,
  mappingNode,
  derivedNode,
} from './fixtures/pipeline-graph';

vi.mock('@/api/etl-pipelines');

const mockedGetRawTableColumns = vi.mocked(etlPipelinesApi.getRawTableColumns);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRawTableColumns.mockImplementation(async (tableName: string) => {
    if (tableName === 'raw_zzip_bamcust_m') return { data: mockSourceColumnsA };
    if (tableName === 'raw_score_table') return { data: mockSourceColumnsB };
    return { data: [] };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeNodeOutputColumns', () => {
  // TS-F039-013
  it('raw_data_extract: returns columns from API', async () => {
    const result = await computeNodeOutputColumns(
      'n-extract-1',
      [extractNode1],
      [],
    );
    expect(result).toEqual(['cust_no', 'name', 'birth_date', 'mobile', 'email']);
    expect(mockedGetRawTableColumns).toHaveBeenCalledTimes(1);
    expect(mockedGetRawTableColumns).toHaveBeenCalledWith('raw_zzip_bamcust_m');
  });

  // TS-F039-014
  it('field_mapping (dropUnmapped=true): only mapped targetColumns survive', async () => {
    const nodes: Node[] = [extractNode1, mappingNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }];

    const result = await computeNodeOutputColumns('n-mapping-1', nodes, edges);
    expect(result).toEqual(['customer_no', 'full_name', 'email_addr']);
    // birth_date and mobile should NOT appear
    expect(result).not.toContain('birth_date');
    expect(result).not.toContain('mobile');
  });

  // TS-F039-015
  it('field_mapping (dropUnmapped=false): all fields preserved with renames', async () => {
    const mappingNodeNoDropNode: Node = {
      ...mappingNode,
      data: {
        ...mappingNode.data,
        dropUnmapped: false,
        mappings: [
          { sourceColumn: 'cust_no', targetColumn: 'customer_no' },
          { sourceColumn: 'email', targetColumn: 'email_addr' },
        ],
      },
    };
    const nodes: Node[] = [extractNode1, mappingNodeNoDropNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }];

    const result = await computeNodeOutputColumns('n-mapping-1', nodes, edges);
    // Original: cust_no, name, birth_date, mobile, email
    // After renames: customer_no, name, birth_date, mobile, email_addr
    expect(result).toContain('customer_no');
    expect(result).toContain('name');
    expect(result).toContain('birth_date');
    expect(result).toContain('mobile');
    expect(result).toContain('email_addr');
    expect(result).toHaveLength(5);
  });

  // TS-F039-016
  it('derived_field: input columns plus new derived columns', async () => {
    const simpleExtract: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'raw_zzip_bamcust_m' },
    };
    // Simplified upstream: just extract -> derived
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: ['col_1', 'col_2'] });
    const derivedSimple: Node = {
      id: 'n-der',
      type: 'pipelineNode',
      position: { x: 200, y: 0 },
      data: {
        nodeType: 'derived_field',
        expressions: [
          { outputColumn: 'new_col_a' },
          { outputColumn: 'new_col_b' },
        ],
      },
    };
    const nodes: Node[] = [simpleExtract, derivedSimple];
    const edges: Edge[] = [{ id: 'e1', source: 'n-ext', target: 'n-der' }];

    const result = await computeNodeOutputColumns('n-der', nodes, edges);
    expect(result).toEqual(['col_1', 'col_2', 'new_col_a', 'new_col_b']);
  });

  // TS-F039-017
  it('merge: union of left and right inputs (deduplicated)', async () => {
    mockedGetRawTableColumns
      .mockResolvedValueOnce({ data: ['a', 'b', 'c'] })
      .mockResolvedValueOnce({ data: ['c', 'd', 'e'] });

    const leftNode: Node = {
      id: 'n-left',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'left_table' },
    };
    const rightNode: Node = {
      id: 'n-right',
      type: 'pipelineNode',
      position: { x: 0, y: 200 },
      data: { nodeType: 'raw_data_extract', rawTable: 'right_table' },
    };
    const mNode: Node = {
      id: 'n-merge',
      type: 'pipelineNode',
      position: { x: 250, y: 100 },
      data: { nodeType: 'merge' },
    };
    const nodes: Node[] = [leftNode, rightNode, mNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'n-left', target: 'n-merge', targetHandle: 'left-input' },
      { id: 'e2', source: 'n-right', target: 'n-merge', targetHandle: 'right-input' },
    ];

    const result = await computeNodeOutputColumns('n-merge', nodes, edges);
    // Should be deduplicated union: a, b, c, d, e
    expect(result).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd', 'e']));
    expect(result).toHaveLength(5);
  });

  // TS-F039-018
  it('type_cast: passes through column names unchanged', async () => {
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: ['id', 'amount', 'date_str'] });

    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test_table' },
    };
    const tcNode: Node = {
      id: 'n-tc',
      type: 'pipelineNode',
      position: { x: 250, y: 0 },
      data: {
        nodeType: 'type_cast',
        casts: [
          { column: 'amount', toType: 'DECIMAL' },
          { column: 'date_str', toType: 'DATE' },
        ],
      },
    };
    const result = await computeNodeOutputColumns('n-tc', [extNode, tcNode], [
      { id: 'e1', source: 'n-ext', target: 'n-tc' },
    ]);
    expect(result).toEqual(['id', 'amount', 'date_str']);
  });

  // TS-F039-019
  it('dedup: passes through column names unchanged', async () => {
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: ['x', 'y', 'z'] });

    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test_table' },
    };
    const ddNode: Node = {
      id: 'n-dd',
      type: 'pipelineNode',
      position: { x: 250, y: 0 },
      data: { nodeType: 'dedup' },
    };
    const result = await computeNodeOutputColumns('n-dd', [extNode, ddNode], [
      { id: 'e1', source: 'n-ext', target: 'n-dd' },
    ]);
    expect(result).toEqual(['x', 'y', 'z']);
  });

  // TS-F039-020
  it('conditional: passes through column names unchanged', async () => {
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: ['col_a', 'col_b'] });

    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test_table' },
    };
    const condNode: Node = {
      id: 'n-cond',
      type: 'pipelineNode',
      position: { x: 250, y: 0 },
      data: {
        nodeType: 'conditional',
        rules: [{ name: 'rule1' }, { name: 'rule2' }, { name: 'rule3' }],
      },
    };
    const result = await computeNodeOutputColumns('n-cond', [extNode, condNode], [
      { id: 'e1', source: 'n-ext', target: 'n-cond' },
    ]);
    expect(result).toEqual(['col_a', 'col_b']);
  });

  // TS-F039-021
  it('recursive graph traversal: extract -> mapping -> derived', async () => {
    const nodes: Node[] = [extractNode1, mappingNode, derivedNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' },
      { id: 'e2', source: 'n-mapping-1', target: 'n-derived-1' },
    ];

    const result = await computeNodeOutputColumns('n-derived-1', nodes, edges);
    expect(result).toEqual([
      'customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag',
    ]);
    expect(mockedGetRawTableColumns).toHaveBeenCalledTimes(1);
  });

  // TS-F039-022
  it('cycle protection: does not infinite loop on circular edges', async () => {
    const nodeA: Node = {
      id: 'n-a',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'dedup' },
    };
    const nodeB: Node = {
      id: 'n-b',
      type: 'pipelineNode',
      position: { x: 250, y: 0 },
      data: { nodeType: 'dedup' },
    };
    const cycleEdges: Edge[] = [
      { id: 'e1', source: 'n-a', target: 'n-b' },
      { id: 'e2', source: 'n-b', target: 'n-a' },
    ];

    // Should not hang/throw — returns empty or minimal result
    const result = await computeNodeOutputColumns('n-a', [nodeA, nodeB], cycleEdges);
    expect(Array.isArray(result)).toBe(true);
  });

  // Additional: raw_data_extract with no rawTable set
  it('raw_data_extract without rawTable returns empty array', async () => {
    const unconfigured: Node = {
      id: 'n-unc',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract' },
    };
    const result = await computeNodeOutputColumns('n-unc', [unconfigured], []);
    expect(result).toEqual([]);
  });

  // Additional: API failure returns empty
  it('raw_data_extract with API failure returns empty array', async () => {
    mockedGetRawTableColumns.mockRejectedValueOnce(new Error('API Error'));
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'broken_table' },
    };
    const result = await computeNodeOutputColumns('n-ext', [extNode], []);
    expect(result).toEqual([]);
  });
});
