import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Info,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  deleteCardType,
  getDeletePreview,
  type CardTypeListItem,
} from '@/api/card-type';

/**
 * F072：停用 CARD_TYPE Modal（級聯 hard delete + 二次確認）
 *
 * 對應 prototype 28 line 587~693（deleteCardTypeModal）。
 *
 * 流程：
 *   1. 開啟時呼叫 GET /delete-preview 取得 5 表 cascade count + listDefinitionsAffected
 *   2. 顯示影響範圍表 + 排除項說明
 *   3. 若 listDefinitionsAffected > 0 → 顯示名單定義引用警告
 *   4. 二次確認 checkbox 勾選後「確認永久刪除」按鈕才 enabled
 *   5. 確認 → 呼叫 DELETE ?confirmCascade=true
 *
 * 錯誤碼：
 *   - 404 CARD_TYPE_NOT_FOUND → toast + 關閉
 *   - 409 ASSIGNMENT_RUN_ALREADY_RUNNING → toast + 關閉
 *   - 422 CARD_TYPE_CASCADE_NOT_CONFIRMED → 不該發生（已帶 confirmCascade=true），仍回 toast
 */

interface Props {
  open: boolean;
  target: CardTypeListItem | null;
  onClose: () => void;
  onDeleted?: (cardType: string) => void;
}

export function DeleteCardTypeModal({
  open,
  target,
  onClose,
  onDeleted,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Reset 二次確認 checkbox 狀態
  useEffect(() => {
    if (open) setConfirmed(false);
  }, [open]);

  // Esc 關閉
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // 取得預覽
  const previewQuery = useQuery({
    queryKey: ['card-type-delete-preview', target?.cardType],
    queryFn: () => getDeletePreview(target!.cardType),
    enabled: open && !!target,
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: (cardType: string) => deleteCardType(cardType),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['card-types'] });
      showToast(`已停用計分卡類型 ${data.cardType}`, 'success');
      onDeleted?.(data.cardType);
      onClose();
    },
    onError: (err: any) => {
      const body = err?.response?.data;
      const code = body?.error;
      if (code === 'CARD_TYPE_NOT_FOUND') {
        showToast('計分卡類型不存在或已停用', 'error');
        onClose();
      } else if (code === 'ASSIGNMENT_RUN_ALREADY_RUNNING') {
        showToast('分派執行中，無法停用', 'error');
        onClose();
      } else {
        showToast(body?.message ?? '停用失敗，請稍後再試', 'error');
      }
    },
  });

  function handleConfirm() {
    if (!target || !confirmed) return;
    deleteMutation.mutate(target.cardType);
  }

  if (!open || !target) return null;

  const cascade = previewQuery.data?.cascade;
  const listDefAffected = previewQuery.data?.listDefinitionsAffected ?? 0;

  return (
    <div className="fixed inset-0 z-50" data-testid="delete-card-type-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-labelledby="delete-card-type-title"
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3
              id="delete-card-type-title"
              className="text-lg font-semibold text-red-600 flex items-center gap-2"
            >
              <AlertTriangle size={24} />
              停用計分卡類型
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-md"
              aria-label="關閉"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <p className="text-sm text-gray-800">
                確定停用 CARD_TYPE{' '}
                <code className="font-mono font-semibold text-gray-900">
                  {target.cardType}
                </code>{' '}
                <span className="font-semibold">— {target.cardName}</span>？
              </p>
              <p className="text-xs text-red-600 mt-1">
                此操作將級聯 hard delete 以下資料且不可復原
              </p>
            </div>

            {/* 影響範圍 */}
            <div className="bg-red-50/30 border border-red-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <AlertOctagon size={16} className="text-red-600" />
                影響範圍：將被永久刪除的紀錄筆數
              </h4>
              {previewQuery.isLoading && (
                <p className="text-sm text-gray-500" data-testid="preview-loading">
                  載入預覽中…
                </p>
              )}
              {previewQuery.isError && (
                <p className="text-sm text-red-600" role="alert">
                  無法載入預覽，請關閉重試
                </p>
              )}
              {cascade && (
                <table className="w-full text-sm">
                  <tbody>
                    <CascadeRow
                      label="ob_levelcard_version"
                      count={cascade.versions}
                    />
                    <CascadeRow
                      label="ob_levelcard_column"
                      count={cascade.columns}
                    />
                    <CascadeRow
                      label="ob_levelcard_score"
                      count={cascade.scores}
                    />
                    <CascadeRow
                      label="ob_levelcard_level"
                      count={cascade.levels}
                    />
                    <CascadeRow
                      label="ob_tier"
                      count={cascade.tierMappings}
                    />
                    <tr>
                      <td className="py-1.5 text-gray-700">
                        <code>ob_card_type</code>{' '}
                        <span className="text-xs text-gray-400">（本身）</span>
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold text-red-600 tabular-nums">
                        1 筆
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              <div className="mt-3 pt-3 border-t border-gray-200 bg-gray-50/60 -mx-4 -mb-4 p-3 rounded-b-lg">
                <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5 mb-1.5">
                  <Info size={14} className="text-gray-500" />
                  不受影響（保留）
                </p>
                <ul className="text-xs text-gray-600 space-y-0.5 ml-5 list-disc">
                  <li>
                    <code>assignment_run_snapshot</code> — 歷史月名單分派 payload 完整保留
                  </li>
                  <li>
                    <code>ob_pool_data_list</code> — 歷史分派結果不變
                  </li>
                  <li>
                    <code>ob_list_definition</code> — 名單定義紀錄保留（由業務主管自行處理）
                  </li>
                </ul>
              </div>
            </div>

            {/* 名單定義引用警告 */}
            {listDefAffected > 0 && (
              <div
                data-testid="list-def-warn"
                className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    size={16}
                    className="text-amber-600 mt-0.5 shrink-0"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900">
                      名單定義引用警告
                    </p>
                    <p className="text-gray-700 mt-1">
                      該計分卡仍有{' '}
                      <span className="font-bold text-amber-900">
                        {listDefAffected}
                      </span>{' '}
                      筆生效中的名單定義（ob_list_definition）引用 CARD_TYPE ={' '}
                      <code>{target.cardType}</code>
                    </p>
                    <p className="text-gray-700 mt-1">
                      停用後這些名單定義的月名單分派將因無計分設定而無法執行，請確認已妥善處理相關名單定義後再停用
                    </p>
                    <a
                      href="#/assignment/list-definition"
                      className="inline-flex items-center gap-1 mt-2 text-blue-600 hover:underline font-medium"
                    >
                      查看相關名單定義
                      <ArrowRight size={12} />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* 二次確認 */}
            <label className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition">
              <input
                data-testid="confirm-checkbox"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-red-600 border-gray-200 rounded focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">
                我已確認上述影響範圍與名單定義引用，知悉此操作不可復原（級聯 hard delete）
              </span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              取消
            </button>
            <button
              data-testid="confirm-delete-btn"
              onClick={handleConfirm}
              disabled={
                !confirmed ||
                deleteMutation.isPending ||
                previewQuery.isLoading
              }
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Trash2 size={16} />
              {deleteMutation.isPending ? '刪除中…' : '確認永久刪除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CascadeRow({ label, count }: { label: string; count: number }) {
  return (
    <tr className="border-b border-red-100/50">
      <td className="py-1.5 text-gray-700">
        <code>{label}</code>
      </td>
      <td className="py-1.5 text-right font-mono font-semibold text-red-600 tabular-nums">
        {count} 筆
      </td>
    </tr>
  );
}
