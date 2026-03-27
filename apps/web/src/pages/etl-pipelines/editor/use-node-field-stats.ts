import { useState, useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  computeNodeFieldStats,
  getBadgeDescriptor,
  type BadgeDescriptor,
  type NodeFieldStats,
} from './node-field-stats';

interface UseNodeFieldStatsResult {
  stats: NodeFieldStats | null;
  badge: BadgeDescriptor | null;
  loading: boolean;
}

/**
 * React Hook that computes field stats + badge descriptor for a given node.
 * Uses a stable fingerprint to avoid re-triggering on every render
 * (React Flow's getNodes/getEdges returns new array refs each time).
 */
export function useNodeFieldStats(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): UseNodeFieldStatsResult {
  const [stats, setStats] = useState<NodeFieldStats | null>(null);
  const [loading, setLoading] = useState(true);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const requestIdRef = useRef(0);

  // Always keep refs up to date
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Build fingerprint from topology + node data
  const edgeKey = edges.map((e) => `${e.source}>${e.target}`).join(',');
  const nodeKey = nodes.map((n) => {
    const d = n.data as Record<string, unknown>;
    return `${n.id}:${d.nodeType}:${d.rawTable || ''}:${d.dropUnmapped || ''}:${JSON.stringify(d.mappings || d.expressions || d.castRules || d.rules || '')}`;
  }).join(';');
  const fingerprint = `${nodeId}|${edgeKey}|${nodeKey}`;

  useEffect(() => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);

    computeNodeFieldStats(nodeId, nodesRef.current, edgesRef.current)
      .then((result) => {
        // Only apply if this is still the latest request
        if (requestIdRef.current === currentRequestId) {
          setStats(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (requestIdRef.current === currentRequestId) {
          setStats(null);
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const badge = stats ? getBadgeDescriptor(stats) : null;

  return { stats, badge, loading };
}
