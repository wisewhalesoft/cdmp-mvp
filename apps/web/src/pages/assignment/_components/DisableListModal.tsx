/**
 * F052 v2.1 — 停用名單確認對話框
 *
 * 對應 prototype: /prototypes/27-list-definition.html v2.3.1 第 298-332 行
 *
 * 重要：所有「停用」文字必須全寫，**不可縮寫為「停」**（F052 v2.1 AC-1）。
 *
 * 流程：
 *   1. 使用者點擊卡片「停用」按鈕 → 父層 setDisableTarget(list)
 *   2. Modal 渲染顯示警告 + 名單資訊 + 確認 checkbox
 *   3. 使用者勾選 checkbox + 點「確認停用」→ 呼叫 onConfirm
 *   4. API 回 200 → 父層刷新清單 + 關閉 modal
 *
 * 軟刪除語意：不可還原；月名單分派鎖中應於外層提前阻擋（本元件不重複檢查）。
 */

import { useState } from 'react';
import { AlertTriangle, Archive, X } from 'lucide-react';
import type { AssignmentListItem } from '@/api/assignment-list';

export interface DisableListModalProps {
  target: AssignmentListItem | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DisableListModal({
  target,
  loading,
  onConfirm,
  onCancel,
}: DisableListModalProps) {
  const [checked, setChecked] = useState(false);

  if (!target) return null;

  return (
    <div
      data-testid="disable-confirm-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onCancel}
    >
      <div
        data-testid="disable-confirm-modal"
        role="dialog"
        aria-label="確認停用名單"
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
            <Archive className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-800">
              確認停用名單{' '}
              <code className="font-mono text-blue-700">{target.listNo}</code>？
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">軟刪除（限草稿階段）</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="關閉"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="rounded-md bg-red-50/50 border border-red-100 p-3 text-sm text-red-800">
            <p className="font-semibold flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              此操作將軟刪除名單
            </p>
            <p className="text-xs mt-1 text-red-700">
              停用後名單可於「已停用」分區查詢；無法直接還原。
            </p>
          </div>
          <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">名單名稱</span>
              <span className="text-gray-800 font-medium">{target.listNm}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">階段</span>
              <span className="text-gray-800 font-medium">草稿</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">建立者</span>
              <span className="text-gray-800 font-medium">{target.createdBy}</span>
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              data-testid="disable-confirm-checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 rounded text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">我確認停用此名單。</span>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-gray-50/50">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-white rounded-md border border-gray-200 disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="btn-disable-confirm"
            disabled={!checked || loading}
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            <Archive className="w-4 h-4" />
            確認停用
          </button>
        </div>
      </div>
    </div>
  );
}
