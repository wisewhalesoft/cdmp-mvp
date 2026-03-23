import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Database,
  GitMerge,
  Columns,
  Type,
  GitBranch,
  CircleSlash,
  Repeat,
  Filter,
  CopyMinus,
  Search,
  TextCursor,
  Shield,
  Sigma,
  Calculator,
  Upload,
} from 'lucide-react';
import { getNodeDef, getCategoryColor, getCategoryLabel, type NodeCategory } from './node-types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Database,
  GitMerge,
  Columns,
  Type,
  GitBranch,
  CircleSlash,
  Repeat,
  Filter,
  CopyMinus,
  Search,
  TextCursor,
  Shield,
  Sigma,
  Calculator,
  Upload,
};

interface PipelineNodeData {
  nodeType: string;
  label?: string;
  subtitle?: string;
  [key: string]: unknown;
}

function PipelineNodeComponent({ data, selected }: NodeProps & { data: PipelineNodeData }) {
  const nodeDef = getNodeDef(data.nodeType);
  if (!nodeDef) return null;

  const colors = getCategoryColor(nodeDef.category);
  const IconComp = ICON_MAP[nodeDef.icon];
  const label = data.label || nodeDef.label;
  const subtitle = data.subtitle || '';

  return (
    <div
      className={`bg-white rounded-lg shadow-md border-l-4 ${colors.border} px-4 py-3 w-[180px] ${selected ? 'ring-2 ring-[#2563EB]' : ''}`}
      data-testid="pipeline-node"
    >
      {/* Input Handle - not for extract nodes */}
      {nodeDef.category !== 'extract' && data.nodeType !== 'merge' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-gray-400 !border-white !border-2"
        />
      )}
      {/* Merge node: dual input handles */}
      {data.nodeType === 'merge' && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="left-input"
            style={{ top: '33%' }}
            className="!w-2 !h-2 !bg-gray-400 !border-white !border-2"
          />
          <Handle
            type="target"
            position={Position.Left}
            id="right-input"
            style={{ top: '67%' }}
            className="!w-2 !h-2 !bg-gray-400 !border-white !border-2"
          />
        </>
      )}

      <div className="flex items-center gap-2 mb-1">
        {IconComp && <IconComp className={`w-4 h-4 ${colors.icon}`} />}
        <span className={`text-xs font-semibold ${colors.label}`}>
          {getCategoryLabel(nodeDef.category)}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}

      {/* Output Handle - not for load nodes */}
      {nodeDef.category !== 'load' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-gray-400 !border-white !border-2"
        />
      )}
    </div>
  );
}

export const PipelineNode = memo(PipelineNodeComponent);
