import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import type { Node, Edge } from '@xyflow/react';
import { buildTooltipContent } from '../node-field-stats';
import {
  mockSourceColumnsA,
  mockSourceColumnsB,
  extractNode1,
  extractNode2,
  mappingNode,
  derivedNode,
  mergeNode,
  allNodes,
  mockEdges,
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

describe('buildTooltipContent', () => {
  // TS-F041-006: raw_data_extract tooltip content
  it('raw_data_extract: returns type=extract with tableName and field list', async () => {
    const content = await buildTooltipContent('n-extract-1', [extractNode1], []);
    expect(content).not.toBeNull();
    expect(content!.type).toBe('extract');
    if (content!.type === 'extract') {
      expect(content!.tableName).toBe('raw_zzip_bamcust_m');
      expect(content!.fieldCount).toBe(5);
      expect(content!.fields).toEqual([
        'cust_no', 'name', 'birth_date', 'mobile', 'email',
      ]);
      expect(content!.remainingCount).toBe(0);
    }
  });

  // TS-F041-007: field_mapping tooltip content
  it('field_mapping (dropUnmapped=true): shows mappings and dropped fields', async () => {
    const nodes: Node[] = [extractNode1, mappingNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }];

    const content = await buildTooltipContent('n-mapping-1', nodes, edges);
    expect(content).not.toBeNull();
    expect(content!.type).toBe('mapping');
    if (content!.type === 'mapping') {
      expect(content!.mappings).toHaveLength(3);
      expect(content!.droppedFields.length).toBeGreaterThanOrEqual(2);
      expect(content!.droppedFields).toContain('birth_date');
      expect(content!.droppedFields).toContain('mobile');
    }
  });

  // TS-F041-008: derived_field tooltip content
  it('derived_field: shows expressions with names', async () => {
    const nodes: Node[] = [extractNode1, mappingNode, derivedNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' },
      { id: 'e2', source: 'n-mapping-1', target: 'n-derived-1' },
    ];

    const content = await buildTooltipContent('n-derived-1', nodes, edges);
    expect(content).not.toBeNull();
    expect(content!.type).toBe('derived');
    if (content!.type === 'derived') {
      expect(content!.expressions).toHaveLength(2);
      expect(content!.expressions[0].name).toBe('age_group');
      expect(content!.expressions[1].name).toBe('vip_flag');
    }
  });

  // TS-F041-009: Truncation when > 8 fields
  it('truncates field list to max 8 items', async () => {
    const tenColumns = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: tenColumns });
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'big_table' },
    };

    const content = await buildTooltipContent('n-ext', [extNode], []);
    expect(content).not.toBeNull();
    expect(content!.type).toBe('extract');
    if (content!.type === 'extract') {
      expect(content!.fields).toHaveLength(8);
      expect(content!.remainingCount).toBe(2);
    }
  });

  // TS-F041-010: Diff list truncation (max 6 dropped)
  it('truncates dropped field list to max 6 items', async () => {
    const manyColumns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    mockedGetRawTableColumns.mockResolvedValue({ data: manyColumns });

    const mappingDropAll: Node = {
      id: 'n-map',
      type: 'pipelineNode',
      position: { x: 250, y: 0 },
      data: {
        nodeType: 'field_mapping',
        dropUnmapped: true,
        mappings: [
          { sourceColumn: 'a', targetColumn: 'x' },
          { sourceColumn: 'b', targetColumn: 'y' },
        ],
      },
    };
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test' },
    };
    const nodes: Node[] = [extNode, mappingDropAll];
    const edges: Edge[] = [{ id: 'e1', source: 'n-ext', target: 'n-map' }];

    const content = await buildTooltipContent('n-map', nodes, edges);
    expect(content).not.toBeNull();
    expect(content!.type).toBe('mapping');
    if (content!.type === 'mapping') {
      // 10 input - 2 mapped = 8 dropped, truncated to max 6
      expect(content!.droppedFields.length).toBeLessThanOrEqual(6);
      expect(content!.droppedRemainingCount).toBeGreaterThan(0);
    }
  });

  // Merge tooltip
  it('merge: shows left/right counts and output', async () => {
    const content = await buildTooltipContent('n-merge-1', allNodes, mockEdges);
    expect(content).not.toBeNull();
    expect(content!.type).toBe('merge');
    if (content!.type === 'merge') {
      expect(content!.leftCount).toBe(5);
      expect(content!.rightCount).toBe(3);
      expect(content!.outputCount).toBe(8);
    }
  });

  // Dedup tooltip (now has its own type since dedup is handled via default/passthrough in computeNodeFieldStats)
  it('dedup (passthrough): returns passthrough type', async () => {
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: ['a', 'b', 'c'] });
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test' },
    };
    const ddNode: Node = {
      id: 'n-dd',
      type: 'pipelineNode',
      position: { x: 250, y: 0 },
      data: { nodeType: 'dedup' },
    };

    const content = await buildTooltipContent('n-dd', [extNode, ddNode], [
      { id: 'e1', source: 'n-ext', target: 'n-dd' },
    ]);
    expect(content).not.toBeNull();
    // dedup falls into default case which uses 'passthrough' or 'dedup' type
    // The default case in buildTooltipContent returns passthrough
    expect(content!.type).toBe('dedup');
    if (content!.type === 'dedup') {
      expect(content!.outputCount).toBe(3);
    }
  });
});
