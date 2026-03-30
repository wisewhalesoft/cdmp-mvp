/**
 * F042: NodeDispatcher
 * 根據 nodeType 路由至對應 NodeExecutor
 */

import { NodeExecutor } from './types';

export class NodeDispatcher {
  private registry = new Map<string, NodeExecutor>();

  register(executor: NodeExecutor): void {
    this.registry.set(executor.nodeType, executor);
  }

  getExecutor(nodeType: string): NodeExecutor {
    const executor = this.registry.get(nodeType);
    if (!executor) {
      throw new Error(`未知的節點類型：${nodeType}`);
    }
    return executor;
  }

  hasExecutor(nodeType: string): boolean {
    return this.registry.has(nodeType);
  }
}
