import { useState } from 'react';
import {
  AlertOctagon,
  User,
  Clock,
  ChevronsUp,
  ChevronsDown,
  X,
} from 'lucide-react';

/**
 * 29b 拒絕 banner（full ↔ slim 可折疊）。
 *
 * 對應 prototype 29b-personnel-ratio-config.html L183-223。
 *
 * 行為：
 *   - `latestRejection = null` → 不渲染
 *   - 初始 full 模式：完整顯示原因 + 拒絕者 + 時間
 *   - 點「折疊」→ slim 模式（只顯 1 行）
 *   - 點「展開查看」→ 回 full
 *   - 點「關閉」→ 觸發 onClose；未傳則本地隱藏
 */

export interface LatestRejection {
  rejectReason: string;
  rejectorId: string;
  rejectorName: string | null;
  rejectorRole: string | null;
  rejectedAt: string;
}

export interface RejectionBannerProps {
  latestRejection: LatestRejection | null;
  /** 父層可選擇接管關閉行為（不傳則本地隱藏） */
  onClose?: () => void;
}

function roleLabel(role: string | null): string {
  if (role === 'director' || role === 'admin') return '部長';
  if (role === 'section_chief') return '處長';
  return role ?? '';
}

function formatRejectedAt(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${mo}/${day} ${h}:${mi}`;
  } catch {
    return iso;
  }
}

export function RejectionBanner({
  latestRejection,
  onClose,
}: RejectionBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [localClosed, setLocalClosed] = useState(false);

  if (!latestRejection || localClosed) return null;

  const displayName = latestRejection.rejectorName ?? latestRejection.rejectorId;
  const role = roleLabel(latestRejection.rejectorRole);
  const when = formatRejectedAt(latestRejection.rejectedAt);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setLocalClosed(true);
    }
  };

  if (collapsed) {
    return (
      <div
        data-testid="rejection-banner-slim"
        className="rounded-lg p-2.5 bg-red-50/70 border border-red-200 flex items-center justify-between text-xs"
      >
        <div className="flex items-center gap-2 text-red-800">
          <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
          <span>有 1 筆拒絕記錄</span>
          <span className="text-red-400">·</span>
          <span className="font-mono">
            {displayName}
            {role ? `（${role}）` : ''} {when}
          </span>
        </div>
        <button
          type="button"
          data-testid="btn-expand"
          onClick={() => setCollapsed(false)}
          className="text-red-700 hover:underline inline-flex items-center gap-1"
        >
          <ChevronsDown className="w-3 h-3" />
          展開查看
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="rejection-banner-full"
      role="alert"
      className="rounded-lg p-4 bg-red-50 border border-red-200"
    >
      <div className="flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-900">
            本名單曾於簽核階段被拒絕，已退回個別業務比例設定階段
          </p>
          <div className="mt-2 space-y-1 text-xs text-red-800">
            <p>
              <User className="w-3 h-3 inline mr-0.5" />
              拒絕者：<strong>{displayName}</strong>
              {role ? `（${role}）` : ''}
              <span className="mx-1 text-red-300">·</span>
              <Clock className="w-3 h-3 inline mr-0.5" />
              {when}
            </p>
            <p className="bg-white/60 border border-red-200 rounded px-2 py-1.5 font-mono text-[12px] leading-relaxed mt-1">
              {latestRejection.rejectReason}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            data-testid="btn-collapse"
            onClick={() => setCollapsed(true)}
            className="text-xs text-red-700 hover:bg-red-100 px-2 py-1 rounded inline-flex items-center gap-1"
          >
            <ChevronsUp className="w-3 h-3" />
            折疊
          </button>
          <button
            type="button"
            data-testid="btn-close"
            onClick={handleClose}
            className="text-xs text-red-700 hover:bg-red-100 px-2 py-1 rounded inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
