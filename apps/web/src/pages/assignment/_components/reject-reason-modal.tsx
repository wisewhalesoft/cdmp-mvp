import { useState } from 'react';
import { AlertTriangle, Clock, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RejectReasonChips } from './reject-reason-chips';

/**
 * F087 — 簽核拒絕原因對話框（就地操作版）
 *
 * 對應 prototype: /prototypes/27-list-definition.html approval 卡片「拒絕」就地動作
 * （29c 簽核審閱獨立頁已於 2026-05-26 移除，拒絕改在名單定義頁卡片就地完成）
 *
 * 規則（spec F087 AC-2/AC-3）：
 *   - 拒絕原因必填（1-500 字），空白時「確認拒絕」disabled
 *   - 提供 5 個常用原因 chip 快速套用
 *   - 確認後由父層呼叫 reject API（stage: approval → personnel_ratio，清空 ob_empl_set）
 *
 * testId：reject-modal / reject-reason-textarea / reject-reason-chips / btn-confirm-reject
 */

export interface RejectReasonModalProps {
  open: boolean;
  /** 受拒絕的名單編號（顯示於說明文字） */
  listNo: string | null;
  loading?: boolean;
  /** 帶入 trim 後的拒絕原因；父層負責呼叫 API */
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function RejectReasonModal({
  open,
  listNo,
  loading = false,
  onConfirm,
  onCancel,
}: RejectReasonModalProps) {
  const [rejectReason, setRejectReason] = useState('');

  if (!open) return null;

  const trimmed = rejectReason.trim();
  const reasonValid = trimmed.length > 0;

  const handleCancel = () => {
    if (loading) return;
    setRejectReason('');
    onCancel();
  };

  const handleConfirm = () => {
    if (!reasonValid) return;
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="reject-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleCancel}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
              <MessageSquareWarning className="w-5 h-5 text-amber-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-800">
                拒絕名單並退回個別業務比例？
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {listNo ? (
                  <>
                    名單 <code className="font-mono text-primary">{listNo}</code>{' '}
                    將退回「個別業務比例」階段，並清除已設定的業務員比例
                  </>
                ) : (
                  '名單將退回「個別業務比例」階段，並清除已設定的業務員比例'
                )}
              </p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="rounded-lg bg-amber-50/60 border border-amber-200 p-3 flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">拒絕後將觸發：</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  <li>名單退回「個別業務比例」階段</li>
                  <li>清空所有部門的個別業務員比例</li>
                  <li>部門比例保留不變</li>
                  <li>拒絕原因於下次編輯頁主動顯示</li>
                </ul>
              </div>
            </div>

            <div>
              <label
                htmlFor="reject-reason-textarea"
                className="block text-xs font-semibold text-gray-700 mb-1.5"
              >
                拒絕原因 <span className="text-danger">*</span>
                <span className="text-gray-400 font-normal">（必填，1-500 字）</span>
              </label>
              <textarea
                id="reject-reason-textarea"
                data-testid="reject-reason-textarea"
                rows={4}
                maxLength={500}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="請填寫具體原因，讓處長能據以調整個別業務員比例"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
              />
              <div className="flex items-center justify-end mt-1">
                <p className="text-xs text-gray-400">
                  <span>{rejectReason.length}</span> / 500
                </p>
              </div>
            </div>

            <RejectReasonChips
              onApply={(reason) => setRejectReason(reason)}
              disabled={loading}
            />
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50/50">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-white disabled:opacity-40"
            >
              取消
            </button>
            <Button
              type="button"
              variant="warning"
              loading={loading}
              loadingText="拒絕中..."
              disabled={!reasonValid}
              onClick={handleConfirm}
              data-testid="btn-confirm-reject"
            >
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                確認拒絕
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
