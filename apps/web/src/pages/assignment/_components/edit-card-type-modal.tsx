import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Info, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  updateCardType,
  PROD_KIND_OPTIONS,
  type CardTypeListItem,
} from '@/api/card-type';

/**
 * F071：編輯 CARD_TYPE Modal
 *
 * 對應 prototype 28 line 542~585（editCardTypeModal）。
 *
 * 規則：
 *   - cardType 欄位 disabled（join key 建立後不可修改）
 *   - cardName：必填、最多 30 字元
 *   - prodKind：必填（下拉預填現值）
 *
 * 錯誤碼：
 *   - 404 CARD_TYPE_NOT_FOUND → toast + 關閉
 *   - 422 VALIDATION_ERROR    → toast
 *   - 409 ASSIGNMENT_RUN_ALREADY_RUNNING → toast + 關閉
 */

interface Props {
  open: boolean;
  target: CardTypeListItem | null;
  onClose: () => void;
  onUpdated?: (cardType: string) => void;
}

export function EditCardTypeModal({
  open,
  target,
  onClose,
  onUpdated,
}: Props) {
  const [cardName, setCardName] = useState('');
  const [prodKind, setProdKind] = useState('');
  const [cardNameError, setCardNameError] = useState<string | null>(null);
  const [prodKindError, setProdKindError] = useState<string | null>(null);

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && target) {
      setCardName(target.cardName);
      setProdKind(target.prodKind);
      setCardNameError(null);
      setProdKindError(null);
    }
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const mutation = useMutation({
    mutationFn: ({
      cardType,
      payload,
    }: {
      cardType: string;
      payload: { cardName: string; prodKind: string };
    }) => updateCardType(cardType, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['card-types'] });
      showToast(`已更新 ${data.cardType}`, 'success');
      onUpdated?.(data.cardType);
      onClose();
    },
    onError: (err: any) => {
      const body = err?.response?.data;
      const code = body?.error;
      if (code === 'CARD_TYPE_NOT_FOUND') {
        showToast('計分卡類型不存在或已停用', 'error');
        onClose();
      } else if (code === 'VALIDATION_ERROR') {
        const field = body?.details?.field;
        if (field === 'prodKind') {
          setProdKindError('PROD_KIND 不存在或已停用');
        } else {
          showToast(body?.message ?? '欄位驗證失敗', 'error');
        }
      } else if (code === 'ASSIGNMENT_RUN_ALREADY_RUNNING') {
        showToast('分派執行中，無法編輯', 'error');
        onClose();
      } else {
        showToast(body?.message ?? '更新失敗，請稍後再試', 'error');
      }
    },
  });

  function validate(): boolean {
    let ok = true;
    setCardNameError(null);
    setProdKindError(null);
    if (!cardName.trim()) {
      setCardNameError('請輸入 card_name 名稱');
      ok = false;
    } else if (cardName.length > 30) {
      setCardNameError('名稱不得超過 30 字元');
      ok = false;
    }
    if (!prodKind) {
      setProdKindError('請選擇 PROD_KIND');
      ok = false;
    }
    return ok;
  }

  function handleSubmit() {
    if (!target) return;
    if (!validate()) return;
    mutation.mutate({
      cardType: target.cardType,
      payload: { cardName, prodKind },
    });
  }

  if (!open || !target) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="edit-card-type-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-labelledby="edit-card-type-title"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3
              id="edit-card-type-title"
              className="text-lg font-semibold text-gray-900"
            >
              編輯計分卡類型
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
              <label
                htmlFor="edit-card-type-code"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                card_type 代碼
              </label>
              <input
                id="edit-card-type-code"
                type="text"
                disabled
                value={target.cardType}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Info size={12} />
                代碼建立後不可修改（若需更名請停用後重新建立）
              </p>
            </div>
            <div>
              <label
                htmlFor="edit-card-type-name"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                card_name 名稱 <span className="text-red-600">*</span>
              </label>
              <input
                id="edit-card-type-name"
                type="text"
                maxLength={30}
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {cardNameError && (
                <p className="text-xs text-red-600 mt-1" role="alert">
                  {cardNameError}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="edit-card-type-prodkind"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                PROD_KIND 產品類別 <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <select
                  id="edit-card-type-prodkind"
                  value={prodKind}
                  onChange={(e) => setProdKind(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {PROD_KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
              </div>
              {prodKindError && (
                <p className="text-xs text-red-600 mt-1" role="alert">
                  {prodKindError}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                來源：代碼維護（ob_code_df, tbl_id=&#39;PROD_KIND&#39;）
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? '儲存中…' : '儲存變更'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
