import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  ChevronRight,
  Save,
  Play,
  GitBranch,
  Rocket,
  MousePointerClick,
} from 'lucide-react';
import { Toolbox } from './toolbox';
import { PropertiesPanel } from './properties-panel';
import { PublishConfirmDialog } from './publish-confirm-dialog';
import { PipelineNode } from './pipeline-node';
import { TooltipManagerProvider } from './badge-tooltip';
import { getNodeDef, canConnect } from './node-types';
import {
  getPipelineDefinition,
  savePipelineDefinition,
  getRawTables,
  getPipelines,
  publishPipelineVersion,
  testPipeline,
  getPipelineProgress,
} from '@/api/etl-pipelines';
import type { RawTableItem, PipelineDefinition } from '@cdmp/shared';

const nodeTypes: NodeTypes = {
  pipelineNode: PipelineNode,
};

export function PipelineEditorPage() {
  const { id: pipelineId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [rawTables, setRawTables] = useState<RawTableItem[]>([]);
  const [pipelineName, setPipelineName] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [versionStatus, setVersionStatus] = useState<string>('draft');
  const [versionNumber, setVersionNumber] = useState<number>(1);
  const [versionId, setVersionId] = useState<string>('');
  const [showToolbox, setShowToolbox] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Warn on browser close/refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Safe navigate with dirty check
  const safeNavigate = useCallback(
    (path: string) => {
      if (isDirtyRef.current) {
        const confirmed = window.confirm('您有未儲存的變更，確定要離開嗎？');
        if (!confirmed) return;
      }
      navigate(path);
    },
    [navigate],
  );

  // Load data
  useEffect(() => {
    if (!pipelineId) return;

    const load = async () => {
      try {
        const [defRes, rawRes, pipelinesRes] = await Promise.all([
          getPipelineDefinition(pipelineId),
          getRawTables(),
          getPipelines({ keyword: '', page: 1, pageSize: 100 }),
        ]);

        // Find pipeline name
        const pipeline = pipelinesRes.data.find((p) => p.id === pipelineId);
        setPipelineName(pipeline?.name || 'Pipeline');
        setVersionLabel(`v${defRes.version} (${defRes.status})`);
        setVersionStatus(defRes.status);
        setVersionNumber(defRes.version);
        setVersionId(defRes.versionId);

        // Load definition
        if (defRes.definition.nodes.length > 0) {
          const loadedNodes: Node[] = defRes.definition.nodes.map((n) => ({
            id: n.id,
            type: 'pipelineNode',
            position: n.position,
            data: n.data,
            selected: false,
          }));
          const loadedEdges: Edge[] = defRes.definition.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
            type: 'default',
            animated: false,
          }));
          setNodes(loadedNodes);
          setEdges(loadedEdges);
        }

        setRawTables(rawRes.data);
      } catch {
        // Error handled by API interceptor
      }
    };

    load();
  }, [pipelineId, setNodes, setEdges]);

  // Mark dirty on change
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Only mark dirty for position changes and data changes, not selection
      const hasMeaningfulChange = changes.some(
        (c) => c.type === 'position' || c.type === 'remove' || c.type === 'add',
      );
      if (hasMeaningfulChange) setIsDirty(true);
    },
    [onNodesChange],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      const hasMeaningfulChange = changes.some(
        (c) => c.type === 'remove' || c.type === 'add',
      );
      if (hasMeaningfulChange) setIsDirty(true);
    },
    [onEdgesChange],
  );

  // Connection validation
  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourceType = (sourceNode.data as Record<string, unknown>).nodeType as string;
      const targetType = (targetNode.data as Record<string, unknown>).nodeType as string;

      return canConnect(sourceType, targetType);
    },
    [nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      const sourceType = (sourceNode.data as Record<string, unknown>).nodeType as string;
      const targetType = (targetNode.data as Record<string, unknown>).nodeType as string;

      if (!canConnect(sourceType, targetType)) {
        setConnectionError('此連線不被允許');
        setTimeout(() => setConnectionError(null), 3000);
        return;
      }

      setEdges((eds) => addEdge(connection, eds));
      setIsDirty(true);
    },
    [nodes, setEdges],
  );

  // Node selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Update selected node when nodes change
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find((n) => n.id === selectedNode.id);
      if (updated) {
        setSelectedNode(updated);
      }
    }
  }, [nodes, selectedNode]);

  // Node data change from properties panel
  const handleNodeDataChange = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...(n.data as Record<string, unknown>), ...updates } }
            : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes],
  );

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
      setIsDirty(true);
    },
    [setNodes, setEdges],
  );

  // Drag & Drop from toolbox
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/pipeline-node');
      if (!nodeType || !reactFlowInstance || !reactFlowWrapper.current) return;

      const nodeDef = getNodeDef(nodeType);
      if (!nodeDef) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: 'pipelineNode',
        position,
        data: {
          nodeType,
          label: nodeDef.label,
          subtitle: '',
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
    },
    [reactFlowInstance, setNodes],
  );

  // Save
  const handleSave = useCallback(async () => {
    if (!pipelineId) return;
    setSaving(true);
    try {
      const definition: PipelineDefinition = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type || 'pipelineNode',
          position: n.position,
          data: n.data as Record<string, unknown>,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
      };
      const res = await savePipelineDefinition(pipelineId, { definition });
      setVersionId(res.versionId);
      setVersionNumber(res.version);
      setVersionStatus(res.status ?? 'draft');
      setVersionLabel(`v${res.version} (${res.status ?? 'draft'})`);
      setIsDirty(false);
      setToast({ title: 'Pipeline 已儲存', message: `版本 v${res.version}` });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ title: '儲存失敗', message: '請稍後再試' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [pipelineId, nodes, edges]);

  // Test execution
  const handleTestRun = useCallback(async () => {
    if (!pipelineId) return;
    // Auto-save before test if dirty
    if (isDirty) {
      await handleSave();
    }
    setTesting(true);
    try {
      const res = await testPipeline(pipelineId);
      setToast({ title: '測試執行已開始', message: '請稍候...' });
      setTimeout(() => setToast(null), 3000);

      // Poll progress until completed
      const pollInterval = setInterval(async () => {
        try {
          const progress = await getPipelineProgress(pipelineId);
          if (progress.status === 'completed') {
            clearInterval(pollInterval);
            setTesting(false);
            // Reload version info to get correct versionId and status
            try {
              const defRes = await getPipelineDefinition(pipelineId);
              setVersionId(defRes.versionId);
              setVersionNumber(defRes.version);
              setVersionStatus(defRes.status);
              setVersionLabel(`v${defRes.version} (${defRes.status})`);
            } catch { /* keep local state */ }
            setToast({ title: '測試執行成功', message: `Pipeline 測試通過` });
            setTimeout(() => setToast(null), 3000);
          } else if (progress.status === 'failed') {
            clearInterval(pollInterval);
            setTesting(false);
            setToast({ title: '測試執行失敗', message: '請查看日誌了解詳情' });
            setTimeout(() => setToast(null), 5000);
          }
        } catch {
          clearInterval(pollInterval);
          setTesting(false);
        }
      }, 2000);
    } catch {
      setTesting(false);
      setToast({ title: '測試執行失敗', message: '請稍後再試' });
      setTimeout(() => setToast(null), 3000);
    }
  }, [pipelineId, isDirty, handleSave, versionNumber]);

  // Publish
  const handlePublish = useCallback(async () => {
    if (!pipelineId || !versionId) return;
    setPublishing(true);
    try {
      const res = await publishPipelineVersion(pipelineId, versionId);
      setVersionStatus('published');
      setVersionLabel(`v${res.version} (published)`);
      setShowPublishDialog(false);
      setToast({
        title: '版本已發布',
        message: `v${res.version} 已發布，Pipeline 現在可以啟用排程`,
      });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ title: '發布失敗', message: '請稍後再試' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setPublishing(false);
    }
  }, [pipelineId, versionId]);

  const isEmpty = nodes.length === 0;

  return (
    <div className="bg-[#F9FAFB] min-h-screen overflow-hidden" data-testid="pipeline-editor">
      {/* Top Toolbar */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => safeNavigate('/etl-pipelines')}
            className="text-gray-400 hover:text-[#2563EB]"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <nav className="flex items-center text-sm text-gray-500">
            <button
              onClick={() => safeNavigate('/etl-pipelines')}
              className="hover:text-[#2563EB]"
            >
              Pipeline 清單
            </button>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">{pipelineName}</span>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-[#2563EB] font-medium">編輯器</span>
          </nav>
          {versionLabel && (
            <span
              className={`ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                versionStatus === 'published'
                  ? 'bg-green-100 text-green-700'
                  : versionStatus === 'testing'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
              data-testid="version-badge"
            >
              {versionLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestRun}
            disabled={testing || nodes.length === 0}
            className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="test-run-btn"
          >
            <Play className="w-4 h-4" />
            {testing ? '測試中...' : '測試執行'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50"
            data-testid="save-btn"
          >
            <Save className="w-4 h-4" />
            {saving ? '儲存中...' : '儲存'}
          </button>
          {versionStatus !== 'published' && (
            <button
              onClick={() => setShowPublishDialog(true)}
              disabled={versionStatus !== 'testing'}
              title={versionStatus === 'draft' ? '請先完成測試執行' : undefined}
              className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="publish-btn"
            >
              <Rocket className="w-4 h-4" />
              發布
            </button>
          )}
          <button
            onClick={() => safeNavigate(`/etl-pipelines/${pipelineId}/versions`)}
            className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
            data-testid="versions-btn"
          >
            <GitBranch className="w-4 h-4" />
            版本
          </button>
        </div>
      </header>

      {/* 3-Column Layout */}
      <div className="fixed top-14 left-0 right-0 bottom-0 flex">
        {/* Left: Toolbox */}
        {showToolbox && <Toolbox onCollapse={() => setShowToolbox(false)} />}

        {/* Center: Canvas */}
        <div
          className="flex-1 relative overflow-hidden"
          ref={reactFlowWrapper}
          data-testid="editor-canvas"
        >
          <TooltipManagerProvider nodes={nodes} edges={edges}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onInit={setReactFlowInstance}
              nodeTypes={nodeTypes}
              isValidConnection={isValidConnection}
              fitView
              className="canvas-bg"
              data-testid="react-flow"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
              <Controls
                showInteractive={false}
                className="!bg-white !rounded-lg !shadow-md !border !border-[#E5E7EB]"
              />
            </ReactFlow>
          </TooltipManagerProvider>
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" data-testid="empty-canvas">
              <div className="text-center text-gray-400">
                <MousePointerClick className="w-16 h-16 mx-auto mb-4" />
                <p className="text-lg font-medium">從左側工具箱拖拉節點至此</p>
                <p className="text-sm mt-1">開始建立 ETL 資料流程</p>
              </div>
            </div>
          )}

          {/* Connection Error Toast */}
          {connectionError && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm z-50"
              data-testid="connection-error"
            >
              {connectionError}
            </div>
          )}
        </div>

        {/* Right: Properties Panel */}
        <PropertiesPanel
          selectedNode={selectedNode}
          rawTables={rawTables}
          nodes={nodes}
          edges={edges}
          onNodeDataChange={handleNodeDataChange}
          onDeleteNode={handleDeleteNode}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50" data-testid="save-toast">
          <div className="bg-white rounded-lg shadow-lg border border-[#E5E7EB] p-4 flex items-start gap-3 min-w-[320px] border-l-4 border-l-[#22C55E]">
            <div>
              <p className="text-sm font-medium text-gray-800">{toast.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{toast.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Publish Confirm Dialog */}
      <PublishConfirmDialog
        open={showPublishDialog}
        versionNumber={versionNumber}
        loading={publishing}
        onConfirm={handlePublish}
        onCancel={() => setShowPublishDialog(false)}
      />
    </div>
  );
}
