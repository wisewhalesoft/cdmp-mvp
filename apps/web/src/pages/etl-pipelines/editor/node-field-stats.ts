/**
 * Node field statistics computation — shared by Badge, Inspector Diff, and Tooltip.
 *
 * Extracted from properties-panel.tsx to enable reuse across components.
 */
import type { Node, Edge } from '@xyflow/react';
import { getRawTableColumns } from '@/api/etl-pipelines';

// ─── Interfaces ───────────────────────────────────────────────

/** Badge rendering descriptor */
export interface BadgeDescriptor {
  label: string;
  colorClass: string;
  /** Tailwind class for the prefix color dot */
  dotClass: string;
}

/** Discriminated union for node-type-specific metadata */
export type NodeFieldStatsMeta =
  | { type: 'raw_data_extract'; columnCount: number }
  | { type: 'merge'; leftCount: number; rightCount: number; outputCount: number }
  | { type: 'derived_field'; derivedCount: number }
  | { type: 'field_mapping'; inputCount: number; outputCount: number; droppedCount: number }
  | { type: 'type_cast'; castCount: number }
  | { type: 'conditional'; ruleCount: number }
  | { type: 'target_load'; loadCount: number }
  | { type: 'passthrough'; outputCount: number };

export interface NodeFieldStats {
  nodeType: string;
  inputFieldCount: number;
  outputFieldCount: number;
  meta: NodeFieldStatsMeta;
}

/** Field diff status */
export type FieldDiffStatus = 'added' | 'removed' | 'unchanged';

export interface FieldDiffItem {
  fieldName: string;
  status: FieldDiffStatus;
}

export interface NodeFieldDiff {
  nodeId: string;
  nodeType: string;
  inputFields: string[];
  outputFields: string[];
  diff: FieldDiffItem[];
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
}

// ─── computeNodeOutputColumns ─────────────────────────────────

/**
 * Compute output columns of a given node by walking the graph backward.
 * Returns a deduplicated list of column names.
 */
export async function computeNodeOutputColumns(
  targetNodeId: string,
  nodes: Node[],
  edges: Edge[],
): Promise<string[]> {
  const getParents = (nid: string) =>
    edges.filter((e) => e.target === nid).map((e) => e.source);

  const compute = async (nid: string, visited: Set<string>): Promise<string[]> => {
    if (visited.has(nid)) return [];
    visited.add(nid);

    const node = nodes.find((n) => n.id === nid);
    if (!node) return [];
    const data = node.data as Record<string, unknown>;
    const nodeType = data.nodeType as string;

    const parentIds = getParents(nid);
    const parentOutputs = await Promise.all(parentIds.map((pid) => compute(pid, visited)));
    const inputColumns = [...new Set(parentOutputs.flat())];

    switch (nodeType) {
      case 'raw_data_extract': {
        const rawTable = data.rawTable as string | undefined;
        if (!rawTable) return [];
        try {
          const res = await getRawTableColumns(rawTable);
          return res.data;
        } catch {
          return [];
        }
      }
      case 'field_mapping': {
        const mappings = (data.mappings as { sourceColumn: string; targetColumn: string }[]) || [];
        const dropUnmapped = data.dropUnmapped as boolean;
        if (dropUnmapped && mappings.length > 0) {
          return mappings.map((m) => m.targetColumn);
        }
        // Keep all input columns, apply renames
        const result = [...inputColumns];
        for (const m of mappings) {
          const idx = result.indexOf(m.sourceColumn);
          if (idx !== -1) {
            result[idx] = m.targetColumn;
          }
        }
        return [...new Set(result)];
      }
      case 'derived_field': {
        const expressions = (data.expressions as { outputColumn: string }[]) || [];
        const added = expressions.map((e) => e.outputColumn);
        return [...inputColumns, ...added];
      }
      case 'type_cast':
      case 'dedup':
      case 'conditional':
      case 'filter':
      case 'null_handler':
      case 'string_process':
      case 'encrypt':
      case 'aggregate':
      case 'lookup':
        return inputColumns;
      case 'merge':
        return inputColumns;
      default:
        return inputColumns;
    }
  };

  return compute(targetNodeId, new Set());
}

// ─── getUpstreamColumns ───────────────────────────────────────

/**
 * Get the input columns of a node by computing outputs of all parent nodes.
 */
export async function getUpstreamColumns(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Promise<string[]> {
  const parentIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  if (parentIds.length === 0) return [];

  const parentOutputs = await Promise.all(
    parentIds.map((pid) => computeNodeOutputColumns(pid, nodes, edges)),
  );
  return [...new Set(parentOutputs.flat())];
}

/**
 * For merge nodes, get left and right input columns separately.
 */
export async function getMergeInputColumns(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Promise<{ leftColumns: string[]; rightColumns: string[] }> {
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  let leftColumns: string[] = [];
  let rightColumns: string[] = [];

  for (const edge of incomingEdges) {
    const cols = await computeNodeOutputColumns(edge.source, nodes, edges);
    if (edge.targetHandle === 'right-input' || edge.sourceHandle === 'right-output') {
      rightColumns = cols;
    } else {
      leftColumns = cols;
    }
  }

  return { leftColumns, rightColumns };
}

// ─── computeNodeFieldStats ────────────────────────────────────

/**
 * Compute field statistics for a given node.
 * Returns null if the node is not ready (no output columns).
 */
export async function computeNodeFieldStats(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Promise<NodeFieldStats | null> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  const nodeType = data.nodeType as string;

  try {
    const outputColumns = await computeNodeOutputColumns(nodeId, nodes, edges);
    const inputColumns = await getUpstreamColumns(nodeId, nodes, edges);

    switch (nodeType) {
      case 'raw_data_extract': {
        if (outputColumns.length === 0) return null;
        return {
          nodeType,
          inputFieldCount: 0,
          outputFieldCount: outputColumns.length,
          meta: { type: 'raw_data_extract', columnCount: outputColumns.length },
        };
      }
      case 'merge': {
        const { leftColumns, rightColumns } = await getMergeInputColumns(nodeId, nodes, edges);
        if (leftColumns.length === 0 && rightColumns.length === 0) return null;
        return {
          nodeType,
          inputFieldCount: leftColumns.length + rightColumns.length,
          outputFieldCount: outputColumns.length,
          meta: {
            type: 'merge',
            leftCount: leftColumns.length,
            rightCount: rightColumns.length,
            outputCount: outputColumns.length,
          },
        };
      }
      case 'derived_field': {
        const expressions = (data.expressions as { outputColumn: string }[]) || [];
        if (expressions.length === 0) return null;
        return {
          nodeType,
          inputFieldCount: inputColumns.length,
          outputFieldCount: outputColumns.length,
          meta: { type: 'derived_field', derivedCount: expressions.length },
        };
      }
      case 'field_mapping': {
        const mappings = (data.mappings as { sourceColumn: string; targetColumn: string }[]) || [];
        const dropUnmapped = data.dropUnmapped as boolean;
        if (mappings.length === 0 && inputColumns.length === 0) return null;
        const droppedCount = dropUnmapped ? Math.max(0, inputColumns.length - outputColumns.length) : 0;
        return {
          nodeType,
          inputFieldCount: inputColumns.length,
          outputFieldCount: outputColumns.length,
          meta: {
            type: 'field_mapping',
            inputCount: inputColumns.length,
            outputCount: outputColumns.length,
            droppedCount,
          },
        };
      }
      case 'type_cast': {
        const casts = (data.castRules as unknown[]) || (data.casts as unknown[]) || [];
        if (casts.length === 0 && inputColumns.length === 0) return null;
        return {
          nodeType,
          inputFieldCount: inputColumns.length,
          outputFieldCount: outputColumns.length,
          meta: { type: 'type_cast', castCount: casts.length },
        };
      }
      case 'conditional': {
        const rules = (data.rules as unknown[]) || [];
        if (rules.length === 0 && inputColumns.length === 0) return null;
        return {
          nodeType,
          inputFieldCount: inputColumns.length,
          outputFieldCount: outputColumns.length,
          meta: { type: 'conditional', ruleCount: rules.length },
        };
      }
      case 'target_load': {
        if (inputColumns.length === 0) return null;
        return {
          nodeType,
          inputFieldCount: inputColumns.length,
          outputFieldCount: inputColumns.length,
          meta: { type: 'target_load', loadCount: inputColumns.length },
        };
      }
      default: {
        // Passthrough nodes: dedup, filter, null_handler, etc.
        if (inputColumns.length === 0) return null;
        return {
          nodeType,
          inputFieldCount: inputColumns.length,
          outputFieldCount: outputColumns.length,
          meta: { type: 'passthrough', outputCount: outputColumns.length },
        };
      }
    }
  } catch {
    return null;
  }
}

// ─── getBadgeDescriptor ───────────────────────────────────────

/**
 * Convert NodeFieldStats into a BadgeDescriptor for rendering.
 */
export function getBadgeDescriptor(stats: NodeFieldStats): BadgeDescriptor {
  const meta = stats.meta;

  switch (meta.type) {
    case 'raw_data_extract':
      return {
        label: `→ ${meta.columnCount} 欄位`,
        colorClass: 'bg-blue-500/10 text-blue-600',
        dotClass: 'bg-blue-600',
      };
    case 'merge':
      return {
        label: `左 ${meta.leftCount} + 右 ${meta.rightCount} → ${meta.outputCount}`,
        colorClass: 'bg-amber-500/10 text-amber-700',
        dotClass: 'bg-amber-500',
      };
    case 'derived_field':
      return {
        label: `+${meta.derivedCount} 衍生欄位`,
        colorClass: 'bg-green-500/10 text-green-600',
        dotClass: 'bg-green-500',
      };
    case 'field_mapping':
      return {
        label: meta.droppedCount > 0
          ? `${meta.inputCount} → ${meta.outputCount}（-${meta.droppedCount}）`
          : `${meta.inputCount} → ${meta.outputCount}`,
        colorClass: 'bg-red-500/10 text-red-600',
        dotClass: 'bg-red-500',
      };
    case 'type_cast':
      return {
        label: `${meta.castCount} 型別轉換`,
        colorClass: 'bg-gray-400/10 text-gray-500',
        dotClass: 'bg-gray-400',
      };
    case 'conditional':
      return {
        label: `${meta.ruleCount} 條件規則`,
        colorClass: 'bg-amber-500/10 text-amber-700',
        dotClass: 'bg-amber-500',
      };
    case 'target_load':
      return {
        label: `載入 ${meta.loadCount} 欄位`,
        colorClass: 'bg-green-500/10 text-green-600',
        dotClass: 'bg-green-500',
      };
    case 'passthrough':
      return {
        label: `→ ${meta.outputCount}`,
        colorClass: 'bg-gray-400/10 text-gray-500',
        dotClass: 'bg-gray-400',
      };
  }
}

// ─── computeNodeFieldDiff ─────────────────────────────────────

/**
 * Compute the field diff between input and output of a node.
 */
export async function computeNodeFieldDiff(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Promise<NodeFieldDiff | null> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  const nodeType = data.nodeType as string;

  try {
    const outputFields = await computeNodeOutputColumns(nodeId, nodes, edges);
    const inputFields = await getUpstreamColumns(nodeId, nodes, edges);

    const inputSet = new Set(inputFields);
    const outputSet = new Set(outputFields);

    const diff: FieldDiffItem[] = [];

    // Added: in output but not input
    for (const f of outputFields) {
      if (!inputSet.has(f)) {
        diff.push({ fieldName: f, status: 'added' });
      }
    }

    // Removed: in input but not output
    for (const f of inputFields) {
      if (!outputSet.has(f)) {
        diff.push({ fieldName: f, status: 'removed' });
      }
    }

    // Unchanged: in both
    for (const f of outputFields) {
      if (inputSet.has(f)) {
        diff.push({ fieldName: f, status: 'unchanged' });
      }
    }

    const summary = {
      added: diff.filter((d) => d.status === 'added').length,
      removed: diff.filter((d) => d.status === 'removed').length,
      unchanged: diff.filter((d) => d.status === 'unchanged').length,
    };

    return {
      nodeId,
      nodeType,
      inputFields,
      outputFields,
      diff,
      summary,
    };
  } catch {
    return null;
  }
}

// ─── Tooltip content builders ─────────────────────────────────

/** Discriminated union for rich tooltip content per node type */
export type BadgeTooltipContent =
  | {
      type: 'extract';
      tableName: string;
      fieldCount: number;
      fields: string[];
      remainingCount: number;
    }
  | {
      type: 'merge';
      joinType: string;
      joinKey: string;
      leftCount: number;
      rightCount: number;
      outputCount: number;
      overlapCount: number;
    }
  | {
      type: 'dedup';
      keyColumn: string;
      strategy: string;
      timestampColumn: string;
      outputCount: number;
    }
  | {
      type: 'derived';
      expressions: { name: string; expression: string; outputType: string }[];
    }
  | {
      type: 'mapping';
      inputCount: number;
      outputCount: number;
      dropCount: number;
      mappings: { source: string; target: string }[];
      mappingRemainingCount: number;
      droppedFields: string[];
      droppedRemainingCount: number;
    }
  | {
      type: 'typecast';
      casts: { column: string; fromType: string; toType: string }[];
    }
  | {
      type: 'conditional';
      ruleCount: number;
      rules: { index: number; target: string; when: string; then: string; else_: string }[];
      remainingCount: number;
    }
  | {
      type: 'load';
      targetTable: string;
      fieldCount: number;
      fields: string[];
      remainingCount: number;
    }
  | {
      type: 'passthrough';
      nodeType: string;
      outputCount: number;
      fields: string[];
      remainingCount: number;
    };

const FIELD_LIST_MAX = 8;
const MAPPING_LIST_MAX = 8;
const DROPPED_LIST_MAX = 6;
const RULE_LIST_MAX = 3;

/**
 * Build tooltip content based on node type and field stats.
 */
export async function buildTooltipContent(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Promise<BadgeTooltipContent | null> {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  const nodeType = data.nodeType as string;

  try {
    const outputColumns = await computeNodeOutputColumns(nodeId, nodes, edges);
    const inputColumns = await getUpstreamColumns(nodeId, nodes, edges);

    switch (nodeType) {
      case 'raw_data_extract': {
        const rawTable = (data.rawTable as string) || '未設定';
        const showFields = outputColumns.slice(0, FIELD_LIST_MAX);
        const remaining = Math.max(0, outputColumns.length - FIELD_LIST_MAX);
        return {
          type: 'extract',
          tableName: rawTable,
          fieldCount: outputColumns.length,
          fields: showFields,
          remainingCount: remaining,
        };
      }
      case 'merge': {
        const { leftColumns, rightColumns } = await getMergeInputColumns(nodeId, nodes, edges);
        const rightSet = new Set(rightColumns);
        let overlap = 0;
        for (const c of leftColumns) {
          if (rightSet.has(c)) overlap++;
        }
        const joinKey = (data.joinKey as string) || '';
        const joinType = (data.joinType as string) || 'FULL';
        return {
          type: 'merge',
          joinType,
          joinKey,
          leftCount: leftColumns.length,
          rightCount: rightColumns.length,
          outputCount: outputColumns.length,
          overlapCount: overlap,
        };
      }
      case 'dedup': {
        const keyColumn = (data.dedupKey as string) || (data.keyCol as string) || '';
        const strategy = (data.strategy as string) || '';
        const timestampColumn = (data.timestampColumn as string) || (data.tsCol as string) || '';
        return {
          type: 'dedup',
          keyColumn,
          strategy,
          timestampColumn,
          outputCount: outputColumns.length,
        };
      }
      case 'derived_field': {
        const expressions = (data.expressions as { outputColumn: string; expression?: string; outputType?: string }[]) || [];
        return {
          type: 'derived',
          expressions: expressions.map((e) => ({
            name: e.outputColumn,
            expression: e.expression || '',
            outputType: e.outputType || '',
          })),
        };
      }
      case 'field_mapping': {
        const mappings = (data.mappings as { sourceColumn: string; targetColumn: string }[]) || [];
        const dropUnmapped = data.dropUnmapped as boolean;
        const showMappings = mappings.slice(0, MAPPING_LIST_MAX);
        const mappingRemaining = Math.max(0, mappings.length - MAPPING_LIST_MAX);
        let droppedFields: string[] = [];
        if (dropUnmapped) {
          droppedFields = inputColumns.filter(
            (c) => !mappings.some((m) => m.sourceColumn === c),
          );
        }
        const showDropped = droppedFields.slice(0, DROPPED_LIST_MAX);
        const droppedRemaining = Math.max(0, droppedFields.length - DROPPED_LIST_MAX);
        return {
          type: 'mapping',
          inputCount: inputColumns.length,
          outputCount: outputColumns.length,
          dropCount: droppedFields.length,
          mappings: showMappings.map((m) => ({ source: m.sourceColumn, target: m.targetColumn })),
          mappingRemainingCount: mappingRemaining,
          droppedFields: showDropped,
          droppedRemainingCount: droppedRemaining,
        };
      }
      case 'type_cast': {
        const casts = (data.castRules as { column: string; fromType?: string; toType: string }[])
          || (data.casts as { column: string; fromType?: string; toType: string }[])
          || [];
        return {
          type: 'typecast',
          casts: casts.map((c) => ({
            column: c.column,
            fromType: c.fromType || '',
            toType: c.toType,
          })),
        };
      }
      case 'conditional': {
        const rules = (data.rules as { target?: string; name?: string; condition?: string; when?: string; then?: string; else_?: string }[]) || [];
        const showRules = rules.slice(0, RULE_LIST_MAX);
        const remaining = Math.max(0, rules.length - RULE_LIST_MAX);
        return {
          type: 'conditional',
          ruleCount: rules.length,
          rules: showRules.map((r, i) => ({
            index: i + 1,
            target: r.target || r.name || '',
            when: r.when || r.condition || '',
            then: r.then || '',
            else_: r.else_ || '',
          })),
          remainingCount: remaining,
        };
      }
      case 'target_load': {
        const targetTable = (data.targetTable as string) || '';
        const showFields = inputColumns.slice(0, FIELD_LIST_MAX);
        const remaining = Math.max(0, inputColumns.length - FIELD_LIST_MAX);
        return {
          type: 'load',
          targetTable,
          fieldCount: inputColumns.length,
          fields: showFields,
          remainingCount: remaining,
        };
      }
      default: {
        // Passthrough nodes: dedup, filter, null_handler, etc.
        const showFields = outputColumns.slice(0, FIELD_LIST_MAX);
        const remaining = Math.max(0, outputColumns.length - FIELD_LIST_MAX);
        return {
          type: 'passthrough',
          nodeType,
          outputCount: outputColumns.length,
          fields: showFields,
          remainingCount: remaining,
        };
      }
    }
  } catch {
    return null;
  }
}
