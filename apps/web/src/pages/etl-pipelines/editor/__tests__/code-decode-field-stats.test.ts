import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as etlPipelinesApi from '@/api/etl-pipelines';
import type { Node, Edge } from '@xyflow/react';
import {
  computeNodeOutputColumns,
  computeNodeFieldStats,
  getBadgeDescriptor,
  buildTooltipContent,
} from '../node-field-stats';

vi.mock('@/api/etl-pipelines');

const mockedGetRawTableColumns = vi.mocked(etlPipelinesApi.getRawTableColumns);

// Upstream main-data columns (mirrors customer_core big-branch shape)
const mainColumns = ['EDUCAT_BACK', 'VOCATION_CODE', 'cust_no'];

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRawTableColumns.mockImplementation(async (tableName: string) => {
    if (tableName === 'raw_main') return { data: mainColumns };
    return { data: [] };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Extract feeding the code_decode node (main data flow)
const extractNode: Node = {
  id: 'n-extract',
  type: 'pipelineNode',
  position: { x: 0, y: 0 },
  data: { nodeType: 'raw_data_extract', rawTable: 'raw_main' },
};

// code_decode node: 2 mappings, each with a single output alias (F110 §14.2 shape)
const codeDecodeNode: Node = {
  id: 'n-code-decode',
  type: 'pipelineNode',
  position: { x: 250, y: 0 },
  data: {
    nodeType: 'code_decode',
    label: '代碼解碼',
    lookupSource: 'raw_dict',
    mappings: [
      {
        matchColumn: 'EDUCAT_BACK',
        lookupMatchColumn: 'TBL_CD',
        filter: "TBL_ID = 'A2'",
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' }],
      },
      {
        matchColumn: 'VOCATION_CODE',
        lookupMatchColumn: 'TBL_CD',
        filter: "TBL_ID = 'A4'",
        outputColumns: [{ lookupColumn: 'TBL_DESC1', outputAlias: 'occupation_desc' }],
      },
    ],
  },
};

const edges: Edge[] = [{ id: 'e1', source: 'n-extract', target: 'n-code-decode' }];

describe('code_decode — computeNodeOutputColumns (F110 AC-2, mirrors lookup)', () => {
  it('output columns = input columns + all mapping outputAliases', async () => {
    const result = await computeNodeOutputColumns('n-code-decode', [extractNode, codeDecodeNode], edges);
    expect(result).toEqual([
      'EDUCAT_BACK',
      'VOCATION_CODE',
      'cust_no',
      'education_desc',
      'occupation_desc',
    ]);
  });

  it('multiple outputColumns per mapping all contribute aliases', async () => {
    const multiOut: Node = {
      ...codeDecodeNode,
      data: {
        ...codeDecodeNode.data,
        mappings: [
          {
            matchColumn: 'EDUCAT_BACK',
            lookupMatchColumn: 'TBL_CD',
            outputColumns: [
              { lookupColumn: 'TBL_DESC1', outputAlias: 'education_desc' },
              { lookupColumn: 'TBL_DESC2', outputAlias: 'education_desc_en' },
            ],
          },
        ],
      },
    };
    const result = await computeNodeOutputColumns('n-code-decode', [extractNode, multiOut], edges);
    expect(result).toContain('education_desc');
    expect(result).toContain('education_desc_en');
    expect(result).toHaveLength(mainColumns.length + 2);
  });

  it('empty mappings passes through input columns unchanged', async () => {
    const empty: Node = {
      ...codeDecodeNode,
      data: { ...codeDecodeNode.data, mappings: [] },
    };
    const result = await computeNodeOutputColumns('n-code-decode', [extractNode, empty], edges);
    expect(result).toEqual(mainColumns);
  });
});

describe('code_decode — computeNodeFieldStats + getBadgeDescriptor', () => {
  it('meta reports decodeCount and produces an amber "+N 解碼欄位" badge', async () => {
    const stats = await computeNodeFieldStats('n-code-decode', [extractNode, codeDecodeNode], edges);
    expect(stats).not.toBeNull();
    expect(stats!.meta).toEqual({ type: 'code_decode', decodeCount: 2, outputCount: 5 });

    const badge = getBadgeDescriptor(stats!);
    expect(badge.label).toBe('+2 解碼欄位');
    expect(badge.colorClass).toContain('bg-amber-500/10');
    expect(badge.colorClass).toContain('text-amber-700');
    expect(badge.dotClass).toBe('bg-amber-500');
  });
});

describe('code_decode — buildTooltipContent', () => {
  it('returns type=code_decode with source, counts and matchColumn→alias rows', async () => {
    const content = await buildTooltipContent('n-code-decode', [extractNode, codeDecodeNode], edges);
    expect(content).not.toBeNull();
    expect(content!.type).toBe('code_decode');
    if (content!.type === 'code_decode') {
      expect(content!.source).toBe('raw_dict');
      expect(content!.mappingCount).toBe(2);
      expect(content!.decodeCount).toBe(2);
      expect(content!.outputs).toEqual([
        { matchColumn: 'EDUCAT_BACK', alias: 'education_desc' },
        { matchColumn: 'VOCATION_CODE', alias: 'occupation_desc' },
      ]);
      expect(content!.remainingCount).toBe(0);
    }
  });
});
