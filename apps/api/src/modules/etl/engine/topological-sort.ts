/**
 * F042: Kahn's Algorithm 拓撲排序
 * 將 Pipeline DAG 轉換為線性執行順序
 */

import { PipelineNode, PipelineEdge } from './types';

export interface TopologicalSortResult {
  sorted: string[];
  hasCycle: boolean;
}

/**
 * Kahn's algorithm topological sort.
 * Returns sorted node IDs. If cycle detected, sorted.length < nodes.length.
 * Preserves original array order for nodes at the same level (stable).
 */
export function topologicalSort(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): TopologicalSortResult {
  if (nodes.length === 0) {
    return { sorted: [], hasCycle: false };
  }

  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // Initialize queue with in-degree 0 nodes (preserving original order)
  const queue: string[] = [];
  for (const node of nodes) {
    if (inDegree.get(node.id) === 0) {
      queue.push(node.id);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  const hasCycle = sorted.length < nodes.length;
  return { sorted, hasCycle };
}
