import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import type { Node, Edge } from '@xyflow/react';
import {
  computeNodeFieldStats,
  getBadgeDescriptor,
  type NodeFieldStats,
  type BadgeDescriptor,
} from '../node-field-stats';
import {
  mockSourceColumnsA,
  mockSourceColumnsB,
  extractNode1,
  extractNode2,
  mappingNode,
  derivedNode,
  mergeNode,
  loadNode,
  typeCastNode,
  conditionalNode,
  dedupNode,
  unconfiguredExtractNode,
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

describe('computeNodeFieldStats + getBadgeDescriptor', () => {
  // TS-F039-001: raw_data_extract Badge
  it('raw_data_extract: blue badge "→ 5 欄位"', async () => {
    const stats = await computeNodeFieldStats('n-extract-1', [extractNode1], []);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({ type: 'raw_data_extract', columnCount: 5 });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('→ 5 欄位');
    expect(badge.colorClass).toContain('bg-blue-500/10');
    expect(badge.colorClass).toContain('text-blue-600');
    expect(badge.dotClass).toBe('bg-blue-600');
  });

  // TS-F039-002: field_mapping (dropUnmapped=true) Badge
  it('field_mapping (dropUnmapped=true): red badge "5 → 3（-2）"', async () => {
    const nodes: Node[] = [extractNode1, mappingNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }];

    const stats = await computeNodeFieldStats('n-mapping-1', nodes, edges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({
      type: 'field_mapping',
      inputCount: 5,
      outputCount: 3,
      droppedCount: 2,
    });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('5 → 3（-2）');
    expect(badge.colorClass).toContain('bg-red-500/10');
    expect(badge.colorClass).toContain('text-red-600');
    expect(badge.dotClass).toBe('bg-red-500');
  });

  // TS-F039-003: field_mapping (dropUnmapped=false) Badge
  it('field_mapping (dropUnmapped=false): gray badge', async () => {
    const mappingNoDropNode: Node = {
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
    const nodes: Node[] = [extractNode1, mappingNoDropNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }];

    const stats = await computeNodeFieldStats('n-mapping-1', nodes, edges);
    expect(stats).not.toBeNull();

    const badge = getBadgeDescriptor(stats!);
    // field_mapping always uses red (per prototype)
    expect(badge.colorClass).toContain('bg-red-500/10');
    expect(badge.colorClass).toContain('text-red-600');
  });

  // TS-F039-004: derived_field Badge
  it('derived_field: green badge "+2 衍生欄位"', async () => {
    const nodes: Node[] = [extractNode1, mappingNode, derivedNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' },
      { id: 'e2', source: 'n-mapping-1', target: 'n-derived-1' },
    ];

    const stats = await computeNodeFieldStats('n-derived-1', nodes, edges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({ type: 'derived_field', derivedCount: 2 });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('+2 衍生欄位');
    expect(badge.colorClass).toContain('bg-green-500/10');
    expect(badge.colorClass).toContain('text-green-600');
    expect(badge.dotClass).toBe('bg-green-500');
  });

  // TS-F039-005: merge Badge
  it('merge: amber badge "左 5 + 右 3 → 8"', async () => {
    const stats = await computeNodeFieldStats('n-merge-1', allNodes, mockEdges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({
      type: 'merge',
      leftCount: 5,
      rightCount: 3,
      outputCount: 8,
    });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('左 5 + 右 3 → 8');
    expect(badge.colorClass).toContain('bg-amber-500/10');
    expect(badge.colorClass).toContain('text-amber-700');
    expect(badge.dotClass).toBe('bg-amber-500');
  });

  // TS-F039-006: target_load Badge
  it('target_load: green badge "載入 8 欄位"', async () => {
    const stats = await computeNodeFieldStats('n-load-1', allNodes, mockEdges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({ type: 'target_load', loadCount: 8 });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('載入 8 欄位');
    expect(badge.colorClass).toContain('bg-green-500/10');
    expect(badge.colorClass).toContain('text-green-600');
    expect(badge.dotClass).toBe('bg-green-500');
  });

  // TS-F039-007: type_cast Badge
  it('type_cast: gray badge "4 型別轉換"', async () => {
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: ['a', 'b', 'c', 'd'] });
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test' },
    };
    const nodes: Node[] = [extNode, typeCastNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-ext', target: 'n-typecast-1' }];

    const stats = await computeNodeFieldStats('n-typecast-1', nodes, edges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({ type: 'type_cast', castCount: 4 });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('4 型別轉換');
    expect(badge.colorClass).toContain('bg-gray-400/10');
    expect(badge.colorClass).toContain('text-gray-500');
    expect(badge.dotClass).toBe('bg-gray-400');
  });

  // TS-F039-008: conditional Badge
  it('conditional: amber badge "3 條件規則"', async () => {
    mockedGetRawTableColumns.mockResolvedValueOnce({ data: ['a', 'b', 'c', 'd', 'e'] });
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test' },
    };
    const nodes: Node[] = [extNode, conditionalNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-ext', target: 'n-conditional-1' }];

    const stats = await computeNodeFieldStats('n-conditional-1', nodes, edges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({ type: 'conditional', ruleCount: 3 });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('3 條件規則');
    expect(badge.colorClass).toContain('bg-amber-500/10');
    expect(badge.colorClass).toContain('text-amber-700');
    expect(badge.dotClass).toBe('bg-amber-500');
  });

  // TS-F039-009: dedup Badge
  it('dedup: gray badge "→ 6"', async () => {
    mockedGetRawTableColumns.mockResolvedValue({ data: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'test' },
    };
    const nodes: Node[] = [extNode, dedupNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-ext', target: 'n-dedup-1' }];

    const stats = await computeNodeFieldStats('n-dedup-1', nodes, edges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({ type: 'passthrough', outputCount: 6 });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('→ 6');
    expect(badge.colorClass).toContain('bg-gray-400/10');
    expect(badge.colorClass).toContain('text-gray-500');
    expect(badge.dotClass).toBe('bg-gray-400');
  });

  // TS-F039-010: Unconfigured node returns null stats (no badge)
  it('unconfigured raw_data_extract returns null stats', async () => {
    const stats = await computeNodeFieldStats(
      'n-extract-unconfigured',
      [unconfiguredExtractNode],
      [],
    );
    expect(stats).toBeNull();
  });

  // TS-F039-011: API error returns null stats
  it('API error returns null stats', async () => {
    mockedGetRawTableColumns.mockRejectedValueOnce(new Error('API Error'));
    const extNode: Node = {
      id: 'n-ext',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'raw_data_extract', rawTable: 'broken' },
    };
    const stats = await computeNodeFieldStats('n-ext', [extNode], []);
    expect(stats).toBeNull();
  });

  // TS-F039-012: Isolated transform node (no upstream)
  it('isolated field_mapping node (no incoming edges) returns null', async () => {
    const isolatedMapping: Node = {
      id: 'n-iso',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'field_mapping', dropUnmapped: true, mappings: [] },
    };
    const stats = await computeNodeFieldStats('n-iso', [isolatedMapping], []);
    expect(stats).toBeNull();
  });
});
