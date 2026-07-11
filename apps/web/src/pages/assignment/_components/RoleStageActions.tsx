/**
 * F077 v1.3 BR-7 — Role × Stage 操作矩陣
 *
 * 對應 prototype: /prototypes/27-list-definition.html v2.3.1
 *
 * 矩陣（spec §6 BR-7）：
 *
 *   stage \ role         | admin / director              | section_chief
 *   ---------------------|-------------------------------|----------------
 *   draft                | 編輯 / 推進 / 停用 / 查看      | 查看
 *   dept_ratio           | 設定 / 退回 / 查看            | 查看
 *   personnel_ratio      | 檢視 / 退回 / 查看 / 快速模板  | 設定本部門 / 查看
 *   approval             | 核准 / 拒絕 / 查看            | 查看
 *   ready                | 退回 / 查看                   | 查看
 *
 * 橫切條件（C-1~C-5）：
 *   C-1 歷史月份 → 所有寫入按鈕 **DOM 完全不渲染**（查看保留）
 *   C-2 月名單分派鎖中 → 所有寫入按鈕 disabled；查看 enabled
 *   C-3 已停用名單（status='inactive'）→ 由父層篩掉，本元件不處理
 *   C-4 section_chief 轄區隔離 → 由父層 / 後端篩掉，本元件 role 行為依 effectiveIdentity
 *   C-5 「查看」按鈕在任何條件下均可觸發 Drawer
 *
 * BR-10 user 整頁封鎖：由父層處理（user 不應渲染本元件）。
 *
 * 按鈕文字（依 prototype 27 line 280-285 + v2.1 spec）：
 *   - 停用按鈕**必須全寫「停用」**，非縮寫「停」（F052 v2.1 AC-1）
 */

import { useNavigate } from 'react-router-dom';
import {
  Pencil,
  ArrowRight,
  Archive,
  Eye,
  Settings,
  RotateCcw,
  Stamp,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Stage } from '@/components/e07/StageBadge';
import type { EffectiveIdentity } from '@cdmp/shared';
import type { AssignmentListItem } from '@/api/assignment-list';

export interface RoleStageActionsProps {
  list: AssignmentListItem;
  identity: EffectiveIdentity;
  isHistorical: boolean;
  isLocked: boolean;
  onView: (list: AssignmentListItem) => void;
  onEdit?: (list: AssignmentListItem) => void;
  onAdvance?: (list: AssignmentListItem) => void;
  onDisable?: (list: AssignmentListItem) => void;
  onConfigure?: (list: AssignmentListItem) => void;
  onRollback?: (list: AssignmentListItem) => void;
  onReview?: (list: AssignmentListItem) => void;
  onApprove?: (list: AssignmentListItem) => void;
  onReject?: (list: AssignmentListItem) => void;
  onQuickTemplate?: (list: AssignmentListItem) => void;
  onSetMyDept?: (list: AssignmentListItem) => void;
}

interface ActionButtonProps {
  testId: string;
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'neutral';
}

function ActionButton({
  testId,
  label,
  icon: Icon,
  onClick,
  disabled,
  variant = 'neutral',
}: ActionButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'text-blue-700 hover:bg-blue-50 border-blue-200'
      : variant === 'danger'
        ? 'text-red-700 hover:bg-red-50 border-red-200'
        : variant === 'secondary'
          ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
          : 'text-gray-700 hover:bg-gray-50 border-gray-200';
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border ${variantClass} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

/**
 * 渲染卡片下方的操作按鈕列。
 *
 * 順序由 prototype 卡片操作區決定（左至右）：寫入按鈕（依 stage 而定）→ 查看。
 */
export function RoleStageActions(props: RoleStageActionsProps) {
  const { list, identity, isHistorical, isLocked, onView } = props;
  const navigate = useNavigate();
  const stage = list.stage as Stage;

  // C-1：歷史月份 → 寫入按鈕完全不渲染（僅查看保留）
  const allowWrite = !isHistorical;
  // C-2：月名單分派鎖中 → 寫入按鈕 disabled；查看仍 enabled
  const writeDisabled = isLocked;

  // 是否為寫入者（admin / director）
  const isWriter = identity === 'admin' || identity === 'director';
  // 是否為處長
  const isSectionChief = identity === 'section_chief';

  const handleView = () => onView(list);
  const handleEdit = () => {
    if (props.onEdit) props.onEdit(list);
    else navigate(`/assignment/list-definitions/${list.listNo}/edit`);
  };

  const writeButtons: JSX.Element[] = [];

  if (allowWrite) {
    if (stage === 'draft') {
      if (isWriter) {
        writeButtons.push(
          <ActionButton
            key="edit"
            testId={`btn-edit-${list.listNo}`}
            label="編輯"
            icon={Pencil}
            onClick={handleEdit}
            disabled={writeDisabled}
            variant="primary"
          />,
          <ActionButton
            key="advance"
            testId={`btn-advance-${list.listNo}`}
            label="推進"
            icon={ArrowRight}
            onClick={() => props.onAdvance?.(list)}
            disabled={writeDisabled}
            variant="primary"
          />,
          <ActionButton
            key="disable"
            testId={`btn-disable-${list.listNo}`}
            label="停用"
            icon={Archive}
            onClick={() => props.onDisable?.(list)}
            disabled={writeDisabled}
            variant="danger"
          />,
        );
      }
    } else if (stage === 'dept_ratio') {
      if (isWriter) {
        writeButtons.push(
          <ActionButton
            key="configure"
            testId={`btn-configure-${list.listNo}`}
            label="設定"
            icon={Settings}
            onClick={() => props.onConfigure?.(list)}
            disabled={writeDisabled}
            variant="primary"
          />,
          <ActionButton
            key="rollback"
            testId={`btn-rollback-${list.listNo}`}
            label="退回"
            icon={RotateCcw}
            onClick={() => props.onRollback?.(list)}
            disabled={writeDisabled}
            variant="secondary"
          />,
        );
      }
    } else if (stage === 'personnel_ratio') {
      if (isWriter) {
        writeButtons.push(
          <ActionButton
            key="review"
            testId={`btn-review-${list.listNo}`}
            label="檢視"
            icon={Eye}
            onClick={() => props.onReview?.(list)}
            disabled={writeDisabled}
            variant="primary"
          />,
          <ActionButton
            key="rollback"
            testId={`btn-rollback-${list.listNo}`}
            label="退回"
            icon={RotateCcw}
            onClick={() => props.onRollback?.(list)}
            disabled={writeDisabled}
            variant="secondary"
          />,
          <ActionButton
            key="quick-template"
            testId={`btn-quick-template-${list.listNo}`}
            label="快速模板"
            icon={Zap}
            onClick={() => props.onQuickTemplate?.(list)}
            disabled={writeDisabled}
            variant="neutral"
          />,
        );
      } else if (isSectionChief) {
        writeButtons.push(
          <ActionButton
            key="set-my-dept"
            testId={`btn-set-my-dept-${list.listNo}`}
            label="設定本部門"
            icon={Settings}
            onClick={() => props.onSetMyDept?.(list)}
            disabled={writeDisabled}
            variant="primary"
          />,
        );
      }
    } else if (stage === 'approval') {
      if (isWriter) {
        writeButtons.push(
          <ActionButton
            key="approve"
            testId={`btn-approve-${list.listNo}`}
            label="核准"
            icon={Stamp}
            onClick={() => props.onApprove?.(list)}
            disabled={writeDisabled}
            variant="primary"
          />,
          <ActionButton
            key="reject"
            testId={`btn-reject-${list.listNo}`}
            label="拒絕"
            icon={XCircle}
            onClick={() => props.onReject?.(list)}
            disabled={writeDisabled}
            variant="danger"
          />,
        );
      }
    } else if (stage === 'ready') {
      if (isWriter) {
        writeButtons.push(
          <ActionButton
            key="rollback"
            testId={`btn-rollback-${list.listNo}`}
            label="退回"
            icon={RotateCcw}
            onClick={() => props.onRollback?.(list)}
            disabled={writeDisabled}
            variant="secondary"
          />,
        );
      }
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {writeButtons}
      <ActionButton
        testId={`btn-view-${list.listNo}`}
        label="查看"
        icon={Eye}
        onClick={handleView}
        disabled={false}
        variant="neutral"
      />
    </div>
  );
}
