import { useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { useToast } from '@/components/ui/toast';
import {
  approveList as apiApproveList,
  rejectList as apiRejectList,
  rollbackToApproval as apiRollbackToApproval,
  type StageTransitionResponse,
} from '@/api/assignment-stage';

/**
 * M03c / M03d — 簽核審閱 + Rollback 操作列（F086 / F087 / F089）
 *
 * 用途：list-edit / list-detail 頁底部固定操作列。
 *
 * 規則：
 *   - stage='approval'：顯示 簽核通過（→ ready）+ 退件（→ personnel_ratio + reason）
 *   - stage='ready'：顯示 Rollback 至簽核（→ approval）
 *   - 其他 stage：不渲染（return null）
 *
 * RBAC：director only（F086/F087/F089 spec §5）。
 */

export interface ApproveRejectBarProps {
  listNo: string;
  stage: 'approval' | 'ready' | string;
  /** 完成 stage 變更後通知父層 refresh。 */
  onTransitioned?: (response: StageTransitionResponse) => void;
  /** 隱藏整個 bar（例如 section_chief 視角）。 */
  hidden?: boolean;
}

export function ApproveRejectBar({
  listNo,
  stage,
  onTransitioned,
  hidden,
}: ApproveRejectBarProps) {
  const { showToast } = useToast();

  const [approving, setApproving] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);

  const [rejecting, setRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [rolling, setRolling] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);

  if (hidden) return null;
  if (stage !== 'approval' && stage !== 'ready') return null;

  const handleApprove = async () => {
    setApproving(true);
    try {
      const resp = await apiApproveList(listNo);
      showToast(`名單 ${listNo} 簽核通過 → 準備完成`, 'success');
      onTransitioned?.(resp);
      setShowApproveConfirm(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '簽核失敗', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showToast('請填寫退件原因', 'warning');
      return;
    }
    setRejecting(true);
    try {
      const resp = await apiRejectList(listNo, { rejectReason: rejectReason.trim() });
      showToast(`名單 ${listNo} 已退件 → 退回個別比例`, 'warning');
      onTransitioned?.(resp);
      setShowRejectModal(false);
      setRejectReason('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '退件失敗', 'error');
    } finally {
      setRejecting(false);
    }
  };

  const handleRollback = async () => {
    setRolling(true);
    try {
      const resp = await apiRollbackToApproval(listNo);
      showToast(`名單 ${listNo} 已 Rollback → 退回簽核階段`, 'warning');
      onTransitioned?.(resp);
      setShowRollbackConfirm(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? 'Rollback 失敗', 'error');
    } finally {
      setRolling(false);
    }
  };

  return (
    <>
      <div
        data-testid="approve-reject-bar"
        className="flex items-center justify-end gap-3 p-4 bg-white border-t border-gray-200"
      >
        {stage === 'approval' && (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowRejectModal(true)}
            >
              <span className="inline-flex items-center gap-1.5 text-warning">
                <X className="w-4 h-4" />
                退件
              </span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => setShowApproveConfirm(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                簽核通過
              </span>
            </Button>
          </>
        )}
        {stage === 'ready' && (
          <Button
            type="button"
            variant="warning"
            onClick={() => setShowRollbackConfirm(true)}
          >
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4" />
              Rollback 至簽核
            </span>
          </Button>
        )}
      </div>

      {/* 簽核通過 confirm（info） */}
      <ConfirmModal
        open={showApproveConfirm}
        variant="success"
        title={`確認簽核通過名單 ${listNo}？`}
        description={
          <p className="text-xs text-gray-600">
            簽核通過後名單將進入 <strong>準備完成</strong> 階段，並於下次月跑觸發時參與分派。
          </p>
        }
        confirmLabel="確認簽核"
        loading={approving}
        loadingText="處理中..."
        onConfirm={handleApprove}
        onCancel={() => setShowApproveConfirm(false)}
      />

      {/* 退件 modal（reason 必填） */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50" data-testid="reject-modal">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRejectModal(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800">退件並退回個別比例</h3>
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  aria-label="關閉"
                  className="p-1 hover:bg-gray-100 rounded-md"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-gray-600">
                  名單 <code className="font-mono text-primary">{listNo}</code> 將退回個別比例階段；下次推進需重新簽核。
                </p>
                <div>
                  <label
                    htmlFor="rejectReason"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    退件原因 <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="rejectReason"
                    data-testid="input-reject-reason"
                    rows={3}
                    maxLength={200}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="例：個別比例分配不均，請重新調整"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {rejectReason.length} / 200
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <Button
                  type="button"
                  variant="warning"
                  loading={rejecting}
                  loadingText="退件中..."
                  disabled={!rejectReason.trim()}
                  onClick={handleReject}
                >
                  確認退件
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rollback confirm（warning） */}
      <ConfirmModal
        open={showRollbackConfirm}
        variant="warning"
        title={`Rollback 名單 ${listNo} 至簽核階段？`}
        description={
          <p className="text-xs text-amber-700">
            此操作將退回 <strong>簽核</strong> 階段；準備完成的設定保留。
          </p>
        }
        confirmLabel="確認 Rollback"
        loading={rolling}
        loadingText="處理中..."
        onConfirm={handleRollback}
        onCancel={() => setShowRollbackConfirm(false)}
      />
    </>
  );
}
