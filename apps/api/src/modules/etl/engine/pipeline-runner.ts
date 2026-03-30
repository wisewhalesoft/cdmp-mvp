/**
 * F042: PipelineRunner
 * DAG 遍歷、節點分派協調、node_logs 狀態回寫、temp table 生命週期管理
 * In-DB SQL Strategy: 所有節點產出 temp table，Pipeline 結束後統一 DROP
 */

import {
  PipelineDefinition,
  PipelineRunnerConfig,
  NodeLogEntry,
  DataSet,
  emptyDataSet,
} from './types';
import { topologicalSort } from './topological-sort';
import { NodeOutputStore } from './node-output-store';
import { NodeDispatcher } from './node-dispatcher';
import { QueryRunner } from 'typeorm';

export interface LogUpdateCallback {
  (nodeLogs: NodeLogEntry[], status: 'running' | 'completed' | 'failed', errorMessage?: string): Promise<void>;
}

export class PipelineRunner {
  constructor(
    private readonly dispatcher: NodeDispatcher,
    private readonly outputStore: NodeOutputStore,
  ) {}

  async run(
    definition: PipelineDefinition,
    config: PipelineRunnerConfig,
    queryRunner: QueryRunner,
    onLogUpdate: LogUpdateCallback,
  ): Promise<NodeLogEntry[]> {
    const { nodes, edges } = definition;

    // Empty pipeline → completed immediately
    if (nodes.length === 0) {
      await onLogUpdate([], 'completed');
      return [];
    }

    // Topological sort
    const { sorted, hasCycle } = topologicalSort(nodes, edges);

    // Initialize node logs
    const nodeLogs: NodeLogEntry[] = nodes.map((node) => ({
      nodeId: node.id,
      nodeType: node.data.nodeType,
      nodeName: node.data.label,
      status: 'pending' as const,
      durationMs: 0,
    }));

    const nodeLogMap = new Map<string, NodeLogEntry>();
    for (const log of nodeLogs) {
      nodeLogMap.set(log.nodeId, log);
    }

    // Cycle detection
    if (hasCycle) {
      await onLogUpdate(nodeLogs, 'failed', '循環依賴：Pipeline 定義中存在循環依賴，無法執行');
      return nodeLogs;
    }

    // Build node lookup
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Build reference count for temp table release
    const refCount = new Map<string, number>();
    for (const edge of edges) {
      refCount.set(edge.source, (refCount.get(edge.source) ?? 0) + 1);
    }

    // Build upstream map (for releasing after downstream completes)
    const upstreamMap = new Map<string, string[]>();
    for (const edge of edges) {
      const upstreams = upstreamMap.get(edge.target) ?? [];
      upstreams.push(edge.source);
      upstreamMap.set(edge.target, upstreams);
    }

    // Execute nodes in topological order
    let failed = false;

    try {
      for (const nodeId of sorted) {
        const nodeLog = nodeLogMap.get(nodeId)!;

        if (failed) {
          nodeLog.status = 'skipped';
          continue;
        }

        const node = nodeMap.get(nodeId)!;

        // Mark running
        nodeLog.status = 'running';
        await onLogUpdate(nodeLogs, 'running');

        const startTime = Date.now();

        try {
          // Collect inputs from upstream nodes
          const inputs = this.collectInputs(nodeId, edges);

          // Calculate total input row count
          let inputRowCount = 0;
          for (const ds of Object.values(inputs)) {
            inputRowCount += ds.rowCount;
          }
          nodeLog.inputRowCount = inputRowCount;

          // Get executor and execute
          const executor = this.dispatcher.getExecutor(node.data.nodeType);
          const output = await executor.execute({
            node,
            inputs,
            pipelineId: config.pipelineId,
            logId: config.logId,
            isTestRun: config.isTestRun,
            queryRunner,
          });

          // Store output
          this.outputStore.set(nodeId, output);

          // Mark completed
          nodeLog.status = 'completed';
          nodeLog.durationMs = Date.now() - startTime;
          nodeLog.outputRowCount = output.rowCount;

          await onLogUpdate(nodeLogs, 'running');

          // Release upstream outputs if no longer needed
          this.releaseUpstreamIfDone(nodeId, upstreamMap, refCount);
        } catch (err: any) {
          nodeLog.status = 'failed';
          nodeLog.durationMs = Date.now() - startTime;
          nodeLog.errorMessage = err?.message || String(err);
          failed = true;

          // Mark all remaining nodes as skipped
          for (const remainingId of sorted) {
            const remainingLog = nodeLogMap.get(remainingId)!;
            if (remainingLog.status === 'pending') {
              remainingLog.status = 'skipped';
            }
          }

          await onLogUpdate(
            nodeLogs,
            'failed',
            `節點 ${nodeId} 失敗：${nodeLog.errorMessage}`,
          );

          // Clean up temp tables
          await this.outputStore.cleanupAll(queryRunner);
          return nodeLogs;
        }
      }

      // All nodes completed successfully — cleanup temp tables
      await this.outputStore.cleanupAll(queryRunner);
      await onLogUpdate(nodeLogs, 'completed');
      return nodeLogs;
    } catch (err) {
      // Unexpected error — ensure cleanup
      try {
        await this.outputStore.cleanupAll(queryRunner);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * Collect inputs for a node based on edges
   */
  private collectInputs(
    nodeId: string,
    edges: { source: string; target: string; targetHandle?: string }[],
  ): Record<string, DataSet> {
    const inputs: Record<string, DataSet> = {};

    for (const edge of edges) {
      if (edge.target !== nodeId) continue;

      const handleKey = edge.targetHandle ?? 'default';
      const upstream = this.outputStore.get(edge.source);
      inputs[handleKey] = upstream ?? emptyDataSet();
    }

    return inputs;
  }

  /**
   * Release upstream node outputs when all downstream nodes have consumed them
   */
  private releaseUpstreamIfDone(
    nodeId: string,
    upstreamMap: Map<string, string[]>,
    refCount: Map<string, number>,
  ): void {
    const upstreams = upstreamMap.get(nodeId) ?? [];
    for (const upstreamId of upstreams) {
      const remaining = (refCount.get(upstreamId) ?? 1) - 1;
      refCount.set(upstreamId, remaining);
      if (remaining <= 0) {
        this.outputStore.release(upstreamId);
      }
    }
  }
}
