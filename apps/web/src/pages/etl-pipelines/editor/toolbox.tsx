import { useState, type DragEvent } from 'react';
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
  PanelLeftClose,
  Shuffle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  EXTRACT_NODES,
  TRANSFORM_NODES,
  LOAD_NODES,
  type ToolboxNodeDef,
} from './node-types';

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

interface ToolboxProps {
  onCollapse: () => void;
}

function ToolboxItem({ node }: { node: ToolboxNodeDef }) {
  const IconComp = ICON_MAP[node.icon];
  const iconColor =
    node.category === 'extract'
      ? 'text-blue-500'
      : node.category === 'transform'
        ? 'text-amber-500'
        : 'text-green-500';

  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData('application/pipeline-node', node.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="toolbox-item flex items-center gap-2 px-4 py-2 text-sm text-gray-700 cursor-grab hover:bg-[#F9FAFB]"
      draggable
      onDragStart={onDragStart}
      data-testid={`toolbox-item-${node.type}`}
    >
      {IconComp && <IconComp className={`w-4 h-4 ${iconColor}`} />}
      <span>{node.label}</span>
    </div>
  );
}

function AccordionSection({
  title,
  icon: Icon,
  iconColor,
  badgeBg,
  badgeText,
  count,
  nodes,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  count: number;
  nodes: ToolboxNodeDef[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[#E5E7EB]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50"
        data-testid={`toolbox-section-${title.toLowerCase()}`}
      >
        <span className={`flex items-center gap-2 text-xs font-semibold ${iconColor}`}>
          <Icon className="w-3.5 h-3.5" />
          {title}
        </span>
        <div className="flex items-center gap-1">
          <span className={`text-xs ${badgeBg} ${badgeText} px-1.5 py-0.5 rounded`}>{count}</span>
          {open ? (
            <ChevronDown className="w-3 h-3 text-gray-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-400" />
          )}
        </div>
      </button>
      {open && (
        <div className="pb-1">
          {nodes.map((node) => (
            <ToolboxItem key={node.type} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbox({ onCollapse }: ToolboxProps) {
  return (
    <aside
      className="w-[200px] bg-white border-r border-[#E5E7EB] overflow-y-auto flex-shrink-0"
      data-testid="toolbox"
    >
      <div className="p-3 border-b border-[#E5E7EB] flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          節點工具箱
        </span>
        <button
          onClick={onCollapse}
          className="text-gray-400 hover:text-gray-600"
          data-testid="toolbox-collapse-btn"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <AccordionSection
        title="Extract"
        icon={Database}
        iconColor="text-blue-600"
        badgeBg="bg-blue-100"
        badgeText="text-blue-600"
        count={EXTRACT_NODES.length}
        nodes={EXTRACT_NODES}
      />

      <AccordionSection
        title="Transform"
        icon={Shuffle}
        iconColor="text-amber-600"
        badgeBg="bg-amber-100"
        badgeText="text-amber-600"
        count={TRANSFORM_NODES.length}
        nodes={TRANSFORM_NODES}
      />

      <AccordionSection
        title="Load"
        icon={Upload}
        iconColor="text-green-600"
        badgeBg="bg-green-100"
        badgeText="text-green-600"
        count={LOAD_NODES.length}
        nodes={LOAD_NODES}
        defaultOpen={true}
      />
    </aside>
  );
}
