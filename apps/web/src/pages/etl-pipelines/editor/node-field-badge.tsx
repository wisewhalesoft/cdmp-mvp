import { memo } from 'react';
import type { BadgeDescriptor } from './node-field-stats';

interface NodeFieldBadgeProps {
  badge: BadgeDescriptor | null;
  loading?: boolean;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function NodeFieldBadgeComponent({ badge, loading, onMouseEnter, onMouseLeave }: NodeFieldBadgeProps) {
  if (loading) {
    return (
      <div
        className="mt-2 text-center"
        data-testid="node-badge-loading"
      >
        <span className="inline-block px-1.5 py-[3px] rounded text-[10px] bg-gray-50 text-gray-400 animate-pulse leading-none">
          …
        </span>
      </div>
    );
  }

  if (!badge) return null;

  return (
    <div
      className="mt-2 text-center"
      data-testid="node-badge"
      aria-label={`欄位統計: ${badge.label}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-[10px] font-medium leading-none whitespace-nowrap ${badge.colorClass}`}
        data-testid="node-badge-label"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dotClass}`}
        />
        {badge.label}
      </span>
    </div>
  );
}

export const NodeFieldBadge = memo(NodeFieldBadgeComponent);
