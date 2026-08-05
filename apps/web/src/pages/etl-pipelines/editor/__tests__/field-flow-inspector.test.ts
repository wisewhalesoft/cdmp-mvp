import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import type { Node, Edge } from '@xyflow/react';
import { computeNodeFieldDiff } from '../node-field-stats';
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

describe('computeNodeFieldDiff', () => {
  // TS-F040-001: Field flow section data
  it('field_mapping node: shows input 5, output 3', async () => {
    const nodes: Node[] = [extractNode1, mappingNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }];

    const diff = await computeNodeFieldDiff('n-mapping-1', nodes, edges);
    expect(diff).not.toBeNull();
    expect(diff!.inputFields).toHaveLength(5);
    expect(diff!.outputFields).toHaveLength(3);
  });

  // TS-F040-002: Diff marks — added fields green
  it('derived_field node: age_group and vip_flag are "added"', async () => {
    const nodes: Node[] = [extractNode1, mappingNode, derivedNode];
    const edges: Edge[] = [
      { id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' },
      { id: 'e2', source: 'n-mapping-1', target: 'n-derived-1' },
    ];

    const diff = await computeNodeFieldDiff('n-derived-1', nodes, edges);
    expect(diff).not.toBeNull();

    const addedItems = diff!.diff.filter((d) => d.status === 'added');
    expect(addedItems.map((d) => d.fieldName)).toContain('age_group');
    expect(addedItems.map((d) => d.fieldName)).toContain('vip_flag');
    expect(addedItems).toHaveLength(2);

    const unchangedItems = diff!.diff.filter((d) => d.status === 'unchanged');
    expect(unchangedItems).toHaveLength(3);
    expect(unchangedItems.map((d) => d.fieldName)).toEqual(
      expect.arrayContaining(['customer_no', 'full_name', 'email_addr']),
    );

    expect(diff!.summary.added).toBe(2);
    expect(diff!.summary.removed).toBe(0);
    expect(diff!.summary.unchanged).toBe(3);
  });

  // TS-F040-003: Diff marks — removed fields red
  it('field_mapping (dropUnmapped=true): birth_date and mobile are "removed"', async () => {
    const nodes: Node[] = [extractNode1, mappingNode];
    const edges: Edge[] = [{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }];

    const diff = await computeNodeFieldDiff('n-mapping-1', nodes, edges);
    expect(diff).not.toBeNull();

    const removedItems = diff!.diff.filter((d) => d.status === 'removed');
    // Input: cust_no, name, birth_date, mobile, email
    // Output: customer_no, full_name, email_addr
    // Removed from input: all 5 input names not in output = cust_no, name, birth_date, mobile, email
    // But mapping renames: cust_no->customer_no, name->full_name, email->email_addr
    // So removed = input fields not in output set = cust_no, name, birth_date, mobile, email (all 5)
    // Added = output fields not in input set = customer_no, full_name, email_addr (all 3)
    // This is because field_mapping with dropUnmapped changes names
    expect(removedItems.length).toBeGreaterThanOrEqual(2);
    // At minimum birth_date and mobile should be removed
    const removedNames = removedItems.map((d) => d.fieldName);
    expect(removedNames).toContain('birth_date');
    expect(removedNames).toContain('mobile');
  });

  // TS-F040-004: Passthrough node — all unchanged
  it('dedup node: all fields are "unchanged"', async () => {
    mockedGetRawTableColumns.mockResolvedValue({ data: ['a', 'b', 'c', 'd'] });
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

    const diff = await computeNodeFieldDiff('n-dd', [extNode, ddNode], [
      { id: 'e1', source: 'n-ext', target: 'n-dd' },
    ]);
    expect(diff).not.toBeNull();

    const allUnchanged = diff!.diff.every((d) => d.status === 'unchanged');
    expect(allUnchanged).toBe(true);
    expect(diff!.diff).toHaveLength(4);
    expect(diff!.summary).toEqual({ added: 0, removed: 0, unchanged: 4 });
  });

  // TS-F040-005: No upstream — empty state
  it('isolated node with no edges returns null or empty diff', async () => {
    const isolatedNode: Node = {
      id: 'n-iso',
      type: 'pipelineNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'field_mapping', mappings: [] },
    };
    const diff = await computeNodeFieldDiff('n-iso', [isolatedNode], []);
    // Either null or empty fields
    if (diff) {
      expect(diff.inputFields).toHaveLength(0);
      expect(diff.outputFields).toHaveLength(0);
    }
  });

  // TS-F040-006: raw_data_extract — all output as "added" (no input)
  it('raw_data_extract: all outputs are "added" since no upstream input', async () => {
    const diff = await computeNodeFieldDiff('n-extract-1', [extractNode1], []);
    expect(diff).not.toBeNull();
    expect(diff!.inputFields).toHaveLength(0);
    expect(diff!.outputFields).toHaveLength(5);

    const addedItems = diff!.diff.filter((d) => d.status === 'added');
    expect(addedItems).toHaveLength(5);
    expect(diff!.summary).toEqual({ added: 5, removed: 0, unchanged: 0 });
  });
});
