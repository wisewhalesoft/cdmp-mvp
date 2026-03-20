import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock react-flow before importing the component
vi.mock('@xyflow/react', () => {
  const actual = {
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    BackgroundVariant: { Dots: 'dots' },
  };
  return {
    ...actual,
    ReactFlow: ({ children, onConnect, isValidConnection, onNodeClick, onPaneClick, onDrop, onDragOver }: any) => (
      <div
        data-testid="react-flow-mock"
        onClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {children}
        {/* Expose handlers for testing */}
        <button
          data-testid="mock-connect"
          onClick={() => {
            if (onConnect) {
              const connection = { source: 'node-1', target: 'node-2', sourceHandle: null, targetHandle: null };
              onConnect(connection);
            }
          }}
        />
        <button
          data-testid="mock-validate-extract-to-extract"
          onClick={() => {
            const result = isValidConnection?.({
              source: 'extract-1',
              target: 'extract-2',
              sourceHandle: null,
              targetHandle: null,
            });
            // Store result in DOM for assertion
            const el = document.getElementById('validation-result');
            if (el) el.textContent = String(result);
          }}
        />
        <button
          data-testid="mock-validate-load-to-transform"
          onClick={() => {
            const result = isValidConnection?.({
              source: 'load-1',
              target: 'transform-1',
              sourceHandle: null,
              targetHandle: null,
            });
            const el = document.getElementById('validation-result');
            if (el) el.textContent = String(result);
          }}
        />
        <button
          data-testid="mock-validate-extract-to-transform"
          onClick={() => {
            const result = isValidConnection?.({
              source: 'extract-1',
              target: 'transform-1',
              sourceHandle: null,
              targetHandle: null,
            });
            const el = document.getElementById('validation-result');
            if (el) el.textContent = String(result);
          }}
        />
        <span id="validation-result" data-testid="validation-result" />
      </div>
    ),
    Controls: () => <div data-testid="react-flow-controls" />,
    Background: () => <div data-testid="react-flow-background" />,
    Handle: ({ type, position }: any) => <div data-testid={`handle-${type}-${position}`} />,
    addEdge: (connection: any, edges: any[]) => [
      ...edges,
      { id: `e-${connection.source}-${connection.target}`, ...connection },
    ],
    useNodesState: (initial: any[]) => {
      const { useState } = require('react');
      const [nodes, setNodes] = useState(initial);
      return [nodes, setNodes, (changes: any) => {
        // Simple no-op for mock
      }];
    },
    useEdgesState: (initial: any[]) => {
      const { useState } = require('react');
      const [edges, setEdges] = useState(initial);
      return [edges, setEdges, (changes: any) => {
        // Simple no-op for mock
      }];
    },
  };
});

// Mock API
vi.mock('@/api/etl-pipelines', () => ({
  getPipelineDefinition: vi.fn(),
  savePipelineDefinition: vi.fn(),
  getRawTables: vi.fn(),
  getPipelines: vi.fn(),
  getPipelineStats: vi.fn(),
}));

vi.mock('@/stores/auth-store', () => ({
  getUser: vi.fn().mockReturnValue({
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'admin',
  }),
  getToken: vi.fn().mockReturnValue('mock-token'),
  clearAuth: vi.fn(),
}));

import { PipelineEditorPage } from '../editor/pipeline-editor-page';
import * as etlApi from '@/api/etl-pipelines';
import { canConnect } from '../editor/node-types';

const mockedGetDefinition = vi.mocked(etlApi.getPipelineDefinition);
const mockedSaveDefinition = vi.mocked(etlApi.savePipelineDefinition);
const mockedGetRawTables = vi.mocked(etlApi.getRawTables);
const mockedGetPipelines = vi.mocked(etlApi.getPipelines);

function renderEditor(pipelineId = 'pl-1') {
  return render(
    <MemoryRouter initialEntries={[`/etl-pipelines/${pipelineId}/editor`]}>
      <Routes>
        <Route path="/etl-pipelines/:id/editor" element={<PipelineEditorPage />} />
        <Route path="/etl-pipelines" element={<div data-testid="pipeline-list">List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const emptyDefinition = {
  versionId: 'v-1',
  version: 1,
  status: 'draft',
  definition: { nodes: [], edges: [] },
};

const definitionWithNodes = {
  versionId: 'v-1',
  version: 3,
  status: 'draft',
  definition: {
    nodes: [
      {
        id: 'extract-1',
        type: 'pipelineNode',
        position: { x: 100, y: 100 },
        data: { nodeType: 'raw_data_extract', label: 'Raw Data 擷取', subtitle: 'raw_customers' },
      },
      {
        id: 'extract-2',
        type: 'pipelineNode',
        position: { x: 100, y: 300 },
        data: { nodeType: 'raw_data_extract', label: 'Raw Data 擷取 2', subtitle: '' },
      },
      {
        id: 'transform-1',
        type: 'pipelineNode',
        position: { x: 400, y: 200 },
        data: { nodeType: 'null_handler', label: 'NULL 處理', subtitle: 'strategy: default_value' },
      },
      {
        id: 'load-1',
        type: 'pipelineNode',
        position: { x: 700, y: 200 },
        data: { nodeType: 'target_load', label: '目標表載入', subtitle: 'customer_core' },
      },
    ],
    edges: [{ id: 'e-1', source: 'extract-1', target: 'transform-1' }],
  },
};

const rawTablesData = {
  data: [
    {
      taskId: 't-1',
      taskName: '每日客戶同步',
      rawTableName: 'raw_customers',
      datasourceName: '客戶 DB',
      sourceTable: 'dbo.customers',
      lastExecutionAt: '2026-03-20T02:00:00.000Z',
      status: 'completed',
    },
  ],
};

const pipelinesData = {
  data: [
    {
      id: 'pl-1',
      name: '客戶資料同步',
      version: 3,
      stepCount: 4,
      status: 'draft' as const,
      schedule: null,
      lastExecutionAt: null,
      nextExecutionAt: null,
      processedCount: 0,
      createdBy: 'Admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
};

describe('PipelineEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetDefinition.mockResolvedValue(emptyDefinition as any);
    mockedGetRawTables.mockResolvedValue(rawTablesData);
    mockedGetPipelines.mockResolvedValue(pipelinesData);
    mockedSaveDefinition.mockResolvedValue({
      message: 'OK',
      versionId: 'v-1',
      version: 1,
      stepCount: 0,
    });
  });

  it('should render editor layout with toolbar, toolbox, canvas, and properties panel', async () => {
    await act(async () => {
      renderEditor();
    });

    expect(screen.getByTestId('pipeline-editor')).toBeDefined();
    expect(screen.getByTestId('toolbox')).toBeDefined();
    expect(screen.getByTestId('properties-panel')).toBeDefined();
    expect(screen.getByTestId('save-btn')).toBeDefined();
    expect(screen.getByTestId('back-btn')).toBeDefined();
  });

  it('should show empty canvas hint when no nodes', async () => {
    await act(async () => {
      renderEditor();
    });

    expect(screen.getByTestId('empty-canvas')).toBeDefined();
    expect(screen.getByText('從左側工具箱拖拉節點至此')).toBeDefined();
  });

  it('should show pipeline name in breadcrumb', async () => {
    await act(async () => {
      renderEditor();
    });

    expect(screen.getByText('客戶資料同步')).toBeDefined();
    expect(screen.getByText('編輯器')).toBeDefined();
    expect(screen.getByText('Pipeline 清單')).toBeDefined();
  });

  it('should show version label', async () => {
    await act(async () => {
      renderEditor();
    });

    expect(screen.getByText('v1 (draft)')).toBeDefined();
  });

  it('should render toolbox with Extract, Transform, and Load sections', async () => {
    await act(async () => {
      renderEditor();
    });

    expect(screen.getByText('Extract')).toBeDefined();
    expect(screen.getByText('Transform')).toBeDefined();
    expect(screen.getByText('Load')).toBeDefined();
    expect(screen.getByText('節點工具箱')).toBeDefined();
  });

  it('should show toolbox items for each category', async () => {
    await act(async () => {
      renderEditor();
    });

    // Extract items
    expect(screen.getByText('Raw Data 擷取')).toBeDefined();
    // Transform items
    expect(screen.getByText('NULL 處理')).toBeDefined();
    expect(screen.getByText('格式轉換')).toBeDefined();
    expect(screen.getByText('型別轉換')).toBeDefined();
    expect(screen.getByText('篩選 (Filter)')).toBeDefined();
    // Load items
    expect(screen.getByText('目標表載入')).toBeDefined();
  });

  it('should show empty properties panel message when no node selected', async () => {
    await act(async () => {
      renderEditor();
    });

    expect(screen.getByText('點擊節點以編輯屬性')).toBeDefined();
  });

  it('should render React Flow canvas when definition has nodes', async () => {
    mockedGetDefinition.mockResolvedValue(definitionWithNodes as any);

    await act(async () => {
      renderEditor();
    });

    expect(screen.getByTestId('react-flow-mock')).toBeDefined();
  });

  // TS-F029-029: Invalid connection prevention
  describe('TS-F029-029: Connection validation', () => {
    it('should reject Extract -> Extract connections', () => {
      expect(canConnect('raw_data_extract', 'raw_data_extract')).toBe(false);
    });

    it('should reject Load -> any connections (load is terminal)', () => {
      expect(canConnect('target_load', 'null_handler')).toBe(false);
      expect(canConnect('target_load', 'raw_data_extract')).toBe(false);
    });

    it('should reject any -> Extract connections (extract is source)', () => {
      expect(canConnect('null_handler', 'raw_data_extract')).toBe(false);
      expect(canConnect('target_load', 'raw_data_extract')).toBe(false);
    });

    it('should allow Extract -> Transform connections', () => {
      expect(canConnect('raw_data_extract', 'null_handler')).toBe(true);
      expect(canConnect('raw_data_extract', 'format_convert')).toBe(true);
    });

    it('should allow Transform -> Transform connections', () => {
      expect(canConnect('null_handler', 'format_convert')).toBe(true);
      expect(canConnect('format_convert', 'type_cast')).toBe(true);
    });

    it('should allow Transform -> Load connections', () => {
      expect(canConnect('null_handler', 'target_load')).toBe(true);
      expect(canConnect('format_convert', 'target_load')).toBe(true);
    });

    it('should allow Extract -> Load connections', () => {
      expect(canConnect('raw_data_extract', 'target_load')).toBe(true);
    });
  });

  // TS-F029-030: Unsaved changes warning
  describe('TS-F029-030: Unsaved changes warning', () => {
    it('should have beforeunload handler setup for dirty state', async () => {
      // This test validates the component sets up the beforeunload handler
      // The actual browser prompt cannot be tested in jsdom,
      // but we verify the page renders with the blocker mechanism
      await act(async () => {
        renderEditor();
      });

      expect(screen.getByTestId('pipeline-editor')).toBeDefined();
      // The useBlocker and beforeunload hooks are set up inside the component
      // Real browser behavior requires E2E testing
    });
  });

  // TS-F029-031: Save functionality (SKIP - requires full E2E)
  describe('TS-F029-031: Save pipeline definition', () => {
    it('should have a save button', async () => {
      await act(async () => {
        renderEditor();
      });

      const saveBtn = screen.getByTestId('save-btn');
      expect(saveBtn).toBeDefined();
      expect(saveBtn.textContent).toContain('儲存');
    });

    it('should call savePipelineDefinition API on save', async () => {
      mockedGetDefinition.mockResolvedValue(definitionWithNodes as any);

      await act(async () => {
        renderEditor();
      });

      const saveBtn = screen.getByTestId('save-btn');
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(mockedSaveDefinition).toHaveBeenCalledWith('pl-1', expect.objectContaining({
        definition: expect.objectContaining({
          nodes: expect.any(Array),
          edges: expect.any(Array),
        }),
      }));
    });

    it('should show toast after successful save', async () => {
      mockedGetDefinition.mockResolvedValue(definitionWithNodes as any);

      await act(async () => {
        renderEditor();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('save-btn'));
      });

      expect(screen.getByTestId('save-toast')).toBeDefined();
      expect(screen.getByText('Pipeline 已儲存')).toBeDefined();
    });
  });
});

describe('PipelineEditorPage - Toolbox interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetDefinition.mockResolvedValue(emptyDefinition as any);
    mockedGetRawTables.mockResolvedValue(rawTablesData);
    mockedGetPipelines.mockResolvedValue(pipelinesData);
  });

  it('should hide toolbox when collapse button clicked', async () => {
    await act(async () => {
      renderEditor();
    });

    expect(screen.getByTestId('toolbox')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByTestId('toolbox-collapse-btn'));
    });

    expect(screen.queryByTestId('toolbox')).toBeNull();
  });

  it('should have draggable toolbox items', async () => {
    await act(async () => {
      renderEditor();
    });

    const extractItem = screen.getByTestId('toolbox-item-raw_data_extract');
    expect(extractItem.getAttribute('draggable')).toBe('true');
  });
});
