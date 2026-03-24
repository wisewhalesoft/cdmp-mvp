import { useState, useEffect, useCallback } from 'react';
import { X, Database, Upload, CircleSlash, Type, Repeat } from 'lucide-react';
import { getPipelineVersionDiff } from '@/api/etl-pipelines';
import type {
  PipelineVersionListItem,
  PipelineVersionDiffResponse,
  PipelineVersionDiffNodeAdded,
  PipelineVersionDiffNodeRemoved,
  PipelineVersionDiffNodeModified,
} from '@cdmp/shared';

interface VersionDiffViewProps {
  pipelineId: string;
  versions: PipelineVersionListItem[];
  initialFrom: number;
  initialTo: number;
  onClose: () => void;
}

function getNodeIcon(nodeType: string) {
  switch (nodeType) {
    case 'extract':
      return <Database className="w-4 h-4 text-blue-500" />;
    case 'load':
      return <Upload className="w-4 h-4 text-green-500" />;
    case 'null_handler':
      return <CircleSlash className="w-4 h-4 text-amber-500" />;
    case 'format_converter':
      return <Type className="w-4 h-4 text-amber-500" />;
    case 'type_converter':
      return <Repeat className="w-4 h-4 text-amber-500" />;
    default:
      return <CircleSlash className="w-4 h-4 text-gray-400" />;
  }
}

export function VersionDiffView({
  pipelineId,
  versions,
  initialFrom,
  initialTo,
  onClose,
}: VersionDiffViewProps) {
  const [fromVersion, setFromVersion] = useState(initialFrom);
  const [toVersion, setToVersion] = useState(initialTo);
  const [diff, setDiff] = useState<PipelineVersionDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPipelineVersionDiff(pipelineId, fromVersion, toVersion);
      setDiff(res);
    } catch {
      // handled by API client
    } finally {
      setLoading(false);
    }
  }, [pipelineId, fromVersion, toVersion]);

  useEffect(() => {
    if (fromVersion && toVersion && fromVersion !== toVersion) {
      fetchDiff();
    }
  }, [fetchDiff, fromVersion, toVersion]);

  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

  // Build node lists for left/right panels from diff data
  const renderLeftPanel = () => {
    if (!diff) return null;
    const { nodesRemoved, nodesModified } = diff.changes;

    return (
      <div className="divide-y divide-gray-200 text-sm">
        {/* Show removed nodes (exist in FROM but not TO) */}
        {nodesRemoved.map((node: PipelineVersionDiffNodeRemoved) => (
          <div
            key={node.nodeId}
            className="px-4 py-2.5 flex items-center gap-2 bg-red-50 border-l-4 border-l-red-400"
          >
            {getNodeIcon(node.nodeType)}
            <span className="text-red-700 font-medium">{node.nodeName}</span>
            <span className="text-xs text-red-600 ml-auto">已刪除</span>
          </div>
        ))}
        {/* Show modified nodes (old values) */}
        {nodesModified.map((node: PipelineVersionDiffNodeModified) => (
          <div
            key={`${node.nodeId}-${node.field}`}
            className="px-4 py-2.5 flex items-center gap-2 bg-amber-50 border-l-4 border-l-amber-400"
          >
            <CircleSlash className="w-4 h-4 text-amber-500" />
            <span className="text-gray-700">{node.field}</span>
            <span className="text-xs text-amber-600 ml-auto">
              {node.field}:{' '}
              <del className="text-red-500">{String(node.oldValue)}</del>
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderRightPanel = () => {
    if (!diff) return null;
    const { nodesAdded, nodesModified } = diff.changes;

    return (
      <div className="divide-y divide-gray-200 text-sm">
        {/* Show added nodes (exist in TO but not FROM) */}
        {nodesAdded.map((node: PipelineVersionDiffNodeAdded) => (
          <div
            key={node.nodeId}
            className="px-4 py-2.5 flex items-center gap-2 bg-green-50 border-l-4 border-l-green-400"
          >
            {getNodeIcon(node.nodeType)}
            <span className="text-green-700 font-medium">{node.nodeName}</span>
            <span className="text-xs text-green-600 ml-auto">新增</span>
          </div>
        ))}
        {/* Show modified nodes (new values) */}
        {nodesModified.map((node: PipelineVersionDiffNodeModified) => (
          <div
            key={`${node.nodeId}-${node.field}`}
            className="px-4 py-2.5 flex items-center gap-2 bg-amber-50 border-l-4 border-l-amber-400"
          >
            <CircleSlash className="w-4 h-4 text-amber-500" />
            <span className="text-gray-700">{node.field}</span>
            <span className="text-xs text-amber-600 ml-auto">
              {node.field}:{' '}
              <ins className="text-green-600 no-underline font-medium">
                {String(node.newValue)}
              </ins>
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderSummary = () => {
    if (!diff) return null;
    const { nodesAdded, nodesRemoved, nodesModified, edgesAdded } = diff.changes;

    return (
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center gap-6 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-400" />
          新增 {nodesAdded.length} 個節點
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-400" />
          刪除 {nodesRemoved.length} 個節點
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-400" />
          修改 {nodesModified.length} 個節點
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          新增 {edgesAdded.length} 條連線
        </span>
      </div>
    );
  };

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6"
      data-testid="diff-view"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">版本比對</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500">從</label>
            <select
              className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-600/20"
              value={fromVersion}
              onChange={(e) => setFromVersion(Number(e.target.value))}
              data-testid="diff-from-select"
            >
              {sortedVersions
                .filter((v) => v.version !== toVersion)
                .map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version}
                  </option>
                ))}
            </select>
            <label className="text-gray-500">到</label>
            <select
              className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-600/20"
              value={toVersion}
              onChange={(e) => setToVersion(Number(e.target.value))}
              data-testid="diff-to-select"
            >
              {sortedVersions
                .filter((v) => v.version !== fromVersion)
                .map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version}
                  </option>
                ))}
            </select>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            data-testid="diff-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500">載入中...</div>
      ) : diff ? (
        <>
          {/* Side-by-side diff */}
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            {/* Left panel */}
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                版本 v{fromVersion}
              </div>
              {renderLeftPanel()}
            </div>
            {/* Right panel */}
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                版本 v{toVersion}
              </div>
              {renderRightPanel()}
            </div>
          </div>

          {/* Summary */}
          {renderSummary()}
        </>
      ) : null}
    </div>
  );
}
