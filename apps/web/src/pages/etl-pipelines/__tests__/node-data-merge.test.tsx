import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node } from '@xyflow/react';

/**
 * Bug: Transform Node NULL 處理 欄位選擇無法被儲存/讀取
 *
 * Root cause: handleNodeDataChange in pipeline-editor-page.tsx REPLACES
 * node data instead of MERGING updates. Combined with updateData in
 * properties-panel.tsx spreading stale nodeData, partial updates from
 * property panels can overwrite each other.
 *
 * Fix:
 * 1. handleNodeDataChange should MERGE updates with current node data
 *    (using functional updater to access fresh state)
 * 2. updateData should pass ONLY partial updates (not pre-merged data)
 *
 * This test suite validates the fix by checking that PropertiesPanel
 * passes only PARTIAL updates to onNodeDataChange, and that
 * handleNodeDataChange merges them with existing node data.
 */

// We need to mock node-types since PropertiesPanel imports from it
vi.mock('../editor/node-types', () => ({
  getNodeDef: (nodeType: string) => {
    const defs: Record<string, any> = {
      null_handler: { type: 'null_handler', label: 'NULL 處理', category: 'transform' },
      format_convert: { type: 'format_convert', label: '格式轉換', category: 'transform' },
    };
    return defs[nodeType] || null;
  },
  getCategoryColor: () => ({
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    accent: 'bg-purple-500',
    handle: '#9333EA',
  }),
  getCategoryLabel: (cat: string) => cat,
}));

import { PropertiesPanel } from '../editor/properties-panel';

describe('PropertiesPanel: updateData should pass only PARTIAL updates', () => {
  const mockOnNodeDataChange = vi.fn();
  const mockOnDeleteNode = vi.fn();

  const nullHandlerNode: Node = {
    id: 'transform-1',
    type: 'pipelineNode',
    position: { x: 400, y: 200 },
    data: {
      nodeType: 'null_handler',
      label: 'NULL 處理',
      subtitle: 'strategy: default_value',
      columns: ['customer_id', 'name'],
      strategy: 'default_value',
      defaultValue: 'N/A',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPanel(selectedNode: Node | null = nullHandlerNode) {
    return render(
      <PropertiesPanel
        selectedNode={selectedNode}
        rawTables={[]}
        nodes={selectedNode ? [selectedNode] : []}
        edges={[]}
        onNodeDataChange={mockOnNodeDataChange}
        onDeleteNode={mockOnDeleteNode}
      />,
    );
  }

  it('should pass only strategy/subtitle updates when strategy is changed (not full node data)', () => {
    renderPanel();

    const strategySelect = screen.getByTestId('null-handler-strategy-select');
    fireEvent.change(strategySelect, { target: { value: 'delete_row' } });

    expect(mockOnNodeDataChange).toHaveBeenCalledTimes(1);
    const [nodeId, updates] = mockOnNodeDataChange.mock.calls[0];
    expect(nodeId).toBe('transform-1');

    // After the fix, updateData should pass ONLY the changed fields
    // It should NOT include columns, defaultValue, nodeType, label, etc.
    expect(updates).toEqual({
      strategy: 'delete_row',
      subtitle: 'strategy: delete_row',
    });
  });

  it('should pass only columns update when a column is added (not full node data)', () => {
    renderPanel();

    const columnInput = screen.getByTestId('null-handler-column-input');
    fireEvent.change(columnInput, { target: { value: 'email' } });
    fireEvent.keyDown(columnInput, { key: 'Enter' });

    expect(mockOnNodeDataChange).toHaveBeenCalledTimes(1);
    const [nodeId, updates] = mockOnNodeDataChange.mock.calls[0];
    expect(nodeId).toBe('transform-1');

    // After the fix, only the columns field should be in the update
    expect(updates).toEqual({
      columns: ['customer_id', 'name', 'email'],
    });
  });

  it('should pass only defaultValue update when default value changes', () => {
    renderPanel();

    const defaultInput = screen.getByTestId('null-handler-default-input');
    fireEvent.change(defaultInput, { target: { value: 'UNKNOWN' } });

    expect(mockOnNodeDataChange).toHaveBeenCalledTimes(1);
    const [nodeId, updates] = mockOnNodeDataChange.mock.calls[0];
    expect(nodeId).toBe('transform-1');

    expect(updates).toEqual({
      defaultValue: 'UNKNOWN',
    });
  });
});
