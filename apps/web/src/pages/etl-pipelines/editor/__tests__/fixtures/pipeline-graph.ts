import type { Node, Edge } from '@xyflow/react';

// ─── Mock source columns ──────────────────────────────────────
export const mockSourceColumnsA = ['cust_no', 'name', 'birth_date', 'mobile', 'email'];
export const mockSourceColumnsB = ['cust_no', 'score', 'risk_level'];

// ─── Nodes ────────────────────────────────────────────────────

export const extractNode1: Node = {
  id: 'n-extract-1',
  type: 'pipelineNode',
  position: { x: 0, y: 0 },
  data: {
    nodeType: 'raw_data_extract',
    label: 'Raw Data 擷取',
    rawTable: 'raw_zzip_bamcust_m',
  },
};

export const extractNode2: Node = {
  id: 'n-extract-2',
  type: 'pipelineNode',
  position: { x: 0, y: 200 },
  data: {
    nodeType: 'raw_data_extract',
    label: 'Raw Data 擷取 2',
    rawTable: 'raw_score_table',
  },
};

export const mappingNode: Node = {
  id: 'n-mapping-1',
  type: 'pipelineNode',
  position: { x: 250, y: 0 },
  data: {
    nodeType: 'field_mapping',
    label: '欄位對應',
    dropUnmapped: true,
    mappings: [
      { sourceColumn: 'cust_no', targetColumn: 'customer_no' },
      { sourceColumn: 'name', targetColumn: 'full_name' },
      { sourceColumn: 'email', targetColumn: 'email_addr' },
    ],
  },
};

export const derivedNode: Node = {
  id: 'n-derived-1',
  type: 'pipelineNode',
  position: { x: 500, y: 0 },
  data: {
    nodeType: 'derived_field',
    label: '衍生欄位',
    expressions: [
      { outputColumn: 'age_group', expression: 'CASE WHEN age > 30 THEN "senior" ELSE "junior" END' },
      { outputColumn: 'vip_flag', expression: 'IF(score > 100, true, false)' },
    ],
  },
};

export const mergeNode: Node = {
  id: 'n-merge-1',
  type: 'pipelineNode',
  position: { x: 750, y: 100 },
  data: {
    nodeType: 'merge',
    label: '合併',
  },
};

export const loadNode: Node = {
  id: 'n-load-1',
  type: 'pipelineNode',
  position: { x: 1000, y: 100 },
  data: {
    nodeType: 'target_load',
    label: '目標表載入',
    targetTable: 'customer_core',
  },
};

// ─── Additional type nodes for testing ────────────────────────

export const typeCastNode: Node = {
  id: 'n-typecast-1',
  type: 'pipelineNode',
  position: { x: 250, y: 0 },
  data: {
    nodeType: 'type_cast',
    label: '型別轉換',
    casts: [
      { column: 'amount', fromType: 'VARCHAR', toType: 'DECIMAL' },
      { column: 'date_str', fromType: 'VARCHAR', toType: 'DATE' },
      { column: 'flag', fromType: 'VARCHAR', toType: 'BOOLEAN' },
      { column: 'count', fromType: 'VARCHAR', toType: 'INTEGER' },
    ],
  },
};

export const conditionalNode: Node = {
  id: 'n-conditional-1',
  type: 'pipelineNode',
  position: { x: 250, y: 0 },
  data: {
    nodeType: 'conditional',
    label: '條件轉換',
    rules: [
      { name: 'VIP 判斷', condition: 'score > 100' },
      { name: '風險分級', condition: 'risk_level > 3' },
      { name: '年齡分組', condition: 'age > 30' },
    ],
  },
};

export const dedupNode: Node = {
  id: 'n-dedup-1',
  type: 'pipelineNode',
  position: { x: 250, y: 0 },
  data: {
    nodeType: 'dedup',
    label: '去重',
    dedupColumns: ['cust_no'],
  },
};

// Extract node without rawTable set (unconfigured)
export const unconfiguredExtractNode: Node = {
  id: 'n-extract-unconfigured',
  type: 'pipelineNode',
  position: { x: 0, y: 0 },
  data: {
    nodeType: 'raw_data_extract',
    label: 'Raw Data 擷取',
  },
};

// ─── Edges ────────────────────────────────────────────────────

export const mockEdges: Edge[] = [
  { id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' },
  { id: 'e2', source: 'n-mapping-1', target: 'n-derived-1' },
  { id: 'e3', source: 'n-derived-1', target: 'n-merge-1', targetHandle: 'left-input' },
  { id: 'e4', source: 'n-extract-2', target: 'n-merge-1', targetHandle: 'right-input' },
  { id: 'e5', source: 'n-merge-1', target: 'n-load-1' },
];

export const allNodes: Node[] = [
  extractNode1,
  extractNode2,
  mappingNode,
  derivedNode,
  mergeNode,
  loadNode,
];

// ─── Expected outputs ─────────────────────────────────────────

export const expectedOutputs: Record<string, string[]> = {
  'n-extract-1': mockSourceColumnsA,
  'n-extract-2': mockSourceColumnsB,
  'n-mapping-1': ['customer_no', 'full_name', 'email_addr'],
  'n-derived-1': ['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag'],
  'n-merge-1': ['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag', 'cust_no', 'score', 'risk_level'],
};
