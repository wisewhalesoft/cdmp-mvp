import { useState, useEffect, useMemo, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { Search } from 'lucide-react';
import { computeNodeFieldDiff, type NodeFieldDiff, type FieldDiffItem } from './node-field-stats';

interface FieldFlowTabProps {
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
}

export function FieldFlowTab({ nodeId, nodes, edges }: FieldFlowTabProps) {
  const [diff, setDiff] = useState<NodeFieldDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setError(false);
    setSearchQuery('');

    computeNodeFieldDiff(nodeId, nodes, edges)
      .then((result) => {
        if (mountedRef.current) {
          setDiff(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
    };
  }, [nodeId, nodes, edges]);

  // Sort: added first, then removed, then unchanged
  const sortedDiff = useMemo(() => {
    if (!diff) return [];
    const order: Record<string, number> = { added: 0, removed: 1, unchanged: 2 };
    return [...diff.diff].sort((a, b) => order[a.status] - order[b.status]);
  }, [diff]);

  // Filter by search query
  const filteredDiff = useMemo(() => {
    if (!searchQuery.trim()) return sortedDiff;
    const q = searchQuery.toLowerCase();
    return sortedDiff.filter((item) => item.fieldName.toLowerCase().includes(q));
  }, [sortedDiff, searchQuery]);

  if (loading) {
    return (
      <div data-testid="field-flow-section" className="p-4">
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <span className="ml-2 text-sm text-gray-500">計算欄位中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="field-flow-section" className="p-4">
        <div className="text-center py-8 text-sm text-gray-500">
          無法計算欄位，請檢查上游節點設定
        </div>
      </div>
    );
  }

  if (!diff || (diff.inputFields.length === 0 && diff.outputFields.length === 0)) {
    return (
      <div data-testid="field-flow-section" className="p-4">
        <div className="text-center py-8 text-sm text-gray-400" data-testid="field-flow-empty">
          尚無欄位資料，請先完成節點設定
        </div>
      </div>
    );
  }

  return (
    <div data-testid="field-flow-section" className="p-4 space-y-3">
      {/* Summary Bar */}
      <div className="flex items-center gap-2 text-xs" data-testid="field-flow-summary">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700">
          +{diff.summary.added} 新增
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700">
          -{diff.summary.removed} 移除
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-50 text-gray-600">
          {diff.summary.unchanged} 不變
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="搜尋欄位..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          data-testid="field-flow-search"
        />
      </div>

      {/* Diff List */}
      <div className="space-y-0.5 max-h-[400px] overflow-y-auto" data-testid="field-flow-list">
        {filteredDiff.length === 0 && searchQuery && (
          <div className="text-center py-4 text-xs text-gray-400" data-testid="field-flow-no-results">
            無符合的欄位
          </div>
        )}
        {filteredDiff.map((item) => (
          <FieldDiffItemRow key={item.fieldName} item={item} />
        ))}
      </div>
    </div>
  );
}

function FieldDiffItemRow({ item }: { item: FieldDiffItem }) {
  const statusConfig = {
    added: { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
    removed: { dot: 'bg-red-500', text: 'text-red-600 line-through', bg: 'bg-red-50' },
    unchanged: { dot: 'border border-gray-300', text: 'text-gray-600', bg: '' },
  };

  const config = statusConfig[item.status];

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${config.bg}`}
      data-testid="field-item"
      data-diff={item.status}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`} />
      <span className={`truncate ${config.text}`}>{item.fieldName}</span>
    </div>
  );
}
