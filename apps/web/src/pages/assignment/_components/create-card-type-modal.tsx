import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  createCardType,
  PROD_KIND_OPTIONS,
  type CreateCardTypeResponse,
} from '@/api/card-type';

/**
 * F070：新增 CARD_TYPE Modal
 *
 * 對應 prototype 28 line 487~540（createCardTypeModal）。
 *
 * 規則：
 *   - cardType：必填、最多 5 字元、英數字（VARCHAR(5)，前端再校驗 `^[A-Z0-9]{1,5}$`）
 *   - cardName：必填、最多 30 字元
 *   - prodKind：必填，下拉 01/02/03
 *
 * 錯誤碼處理：
 *   - 422 CARD_TYPE_DUPLICATE → 行內錯誤（cardType 欄位下方）
 *   - 422 VALIDATION_ERROR    → toast
 *   - 409 ASSIGNMENT_RUN_ALREADY_RUNNING → toast + 關閉（理論上由 Tab 1 按鈕 disabled 先擋掉）
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** 成功後通知父層（更新 selectedCardType 至新建項目） */
  onCreated?: (item: CreateCardTypeResponse) => void;
}

const CARD_TYPE_REGEX = /^[A-Z0-9]{1,5}$/;

export function CreateCardTypeModal({ open, onClose, onCreated }: Props) {
  const [cardType, setCardType] = useState('');
  const [cardName, setCardName] = useState('');
  const [prodKind, setProdKind] = useState('');
  const [cardTypeError, setCardTypeError] = useState<string | null>(null);
  const [cardNameError, setCardNameError] = useState<string | null>(null);
  const [prodKindError, setProdKindError] = useState<string | null>(null);

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Reset on open
  useEffect(() => {
    if (open) {
      setCardType('');
      setCardName('');
      setProdKind('');
      setCardTypeError(null);
      setCardNameError(null);
      setProdKindError(null);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const mutation = useMutation({
    // React Query v5 將 ctx 作為第二參數，wrap 避免把 ctx 當 payload 傳入
    mutationFn: (payload: Parameters<typeof createCardType>[0]) =>
      createCardType(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['card-types'] });
      showToast(`已新增計分卡類型 ${data.cardType}`, 'success');
      onCreated?.(data);
      onClose();
    },
    onError: (err: any) => {
      const body = err?.response?.data;
      const code = body?.error;
      if (code === 'CARD_TYPE_DUPLICATE') {
        setCardTypeError(
          `計分卡代碼 ${cardType} 已存在，請使用其他代碼`,
        );
      } else if (code === 'VALIDATION_ERROR') {
        const field = body?.details?.field;
        if (field === 'prodKind') {
          setProdKindError('PROD_KIND 不存在或已停用');
        } else {
          showToast(body?.message ?? '欄位驗證失敗', 'error');
        }
      } else if (code === 'ASSIGNMENT_RUN_ALREADY_RUNNING') {
        showToast('分派執行中，無法新增計分卡類型', 'error');
        onClose();
      } else {
        showToast(body?.message ?? '新增失敗，請稍後再試', 'error');
      }
    },
  });

  function validate(): boolean {
    let ok = true;
    setCardTypeError(null);
    setCardNameError(null);
    setProdKindError(null);

    if (!cardType.trim()) {
      setCardTypeError('請輸入 card_type 代碼');
      ok = false;
    } else if (!CARD_TYPE_REGEX.test(cardType)) {
      setCardTypeError('代碼僅允許 1~5 個大寫英數字字元（A-Z / 0-9）');
      ok = false;
    }
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
    if (!validate()) return;
    mutation.mutate({ cardType, cardName, prodKind });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="create-card-type-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-labelledby="create-card-type-title"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3
              id="create-card-type-title"
              className="text-lg font-semibold text-gray-900"
            >
              新增計分卡類型
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
                htmlFor="create-card-type-code"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                計分卡代碼 <span className="text-red-600">*</span>
              </label>
              <input
                id="create-card-type-code"
                type="text"
                maxLength={5}
                placeholder="例：HC"
                value={cardType}
                onChange={(e) => setCardType(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {cardTypeError && (
                <p className="text-xs text-red-600 mt-1" role="alert">
                  {cardTypeError}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                最多 5 字元（VARCHAR(5)），英數字，建立後不可修改
              </p>
            </div>
            <div>
              <label
                htmlFor="create-card-type-name"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                計分卡名稱 <span className="text-red-600">*</span>
              </label>
              <input
                id="create-card-type-name"
                type="text"
                maxLength={30}
                placeholder="例：高資產卡"
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
                htmlFor="create-card-type-prodkind"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                產品類別 <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <select
                  id="create-card-type-prodkind"
                  value={prodKind}
                  onChange={(e) => setProdKind(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">請選擇</option>
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
              {mutation.isPending ? '送出中…' : '確認新增'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
