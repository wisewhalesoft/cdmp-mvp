import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Info, Plus, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  createCardLevel,
  type CardLevelItem,
  type CardType,
} from '@/api/assignment-scoring';

/**
 * F055 v1.5：新增 CARD_LEVEL 等級 Modal
 *
 * 對應 prototype 28 L915~981（levelModal） + L1672~1796（openLevelModal / submitAddLevel）。
 *
 * 功能（v1.5）：
 *   - CARD_TYPE 由 Tab 1 selectedCardType 帶入，disabled（BR-7 範圍鎖）
 *   - cardLevel auto-suggest：A~J 找第一個未使用的代碼；input 自動 uppercase + maxLength=1
 *   - scoreS / scoreE auto-suggest：
 *     - levels 為空 → scoreS=0, scoreE=999
 *     - levels 非空 → scoreS 留空（待填），scoreE = min(existing.scoreS) - 1
 *   - 必填 + 數值 + scoreE >= scoreS 客端驗證
 *   - 422 CARD_LEVEL_DUPLICATE → cardLevel 欄位 inline 錯誤
 *   - 422 SCORING_RANGE_OVERLAP → scoreS/scoreE 欄位 inline 錯誤
 *   - 422 VALIDATION_ERROR → 通用 api-error 區域
 *   - 409 SCORING_VERSION_LOCKED / 404 CARD_TYPE_NOT_FOUND → toast + modal 關閉
 *
 * 注意：
 *   - body 不含 `cardVersion`（後端依 active 版本帶入）
 *   - 月名單分派鎖 disable 由父層按鈕負責；本 modal 內 submit 仍會送 API，由 server 回 409
 */

function nextAvailableLevel(existingCodes: string[]): string {
  for (const c of 'ABCDEFGHIJ') {
    if (!existingCodes.includes(c)) return c;
  }
  return '';
}

interface Props {
  open: boolean;
  cardType: CardType;
  cardName?: string;
  existingLevels: CardLevelItem[];
  onClose: () => void;
  onCreated?: (created: {
    cardType: string;
    cardVersion: number;
    cardLevel: string;
    scoreS: number;
    scoreE: number;
  }) => void;
}

export function CreateCardLevelModal({
  open,
  cardType,
  cardName,
  existingLevels,
  onClose,
  onCreated,
}: Props) {
  // 計算 auto-suggest 初值（依 existingLevels）
  const suggest = useMemo(() => {
    const existingCodes = existingLevels.map((l) => l.cardLevel);
    const nextLevel = nextAvailableLevel(existingCodes);
    if (existingLevels.length === 0) {
      return { cardLevel: nextLevel || 'A', scoreS: '0', scoreE: '999' };
    }
    const lowest = existingLevels
      .slice()
      .sort((a, b) => a.scoreS - b.scoreS)[0];
    return {
      cardLevel: nextLevel,
      scoreS: '',
      scoreE: String(Math.max(0, lowest.scoreS - 1)),
    };
  }, [existingLevels]);

  const [cardLevel, setCardLevel] = useState(suggest.cardLevel);
  const [scoreS, setScoreS] = useState(suggest.scoreS);
  const [scoreE, setScoreE] = useState(suggest.scoreE);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [cardLevelError, setCardLevelError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // 開啟時 reset 所有欄位
  useEffect(() => {
    if (open) {
      setCardLevel(suggest.cardLevel);
      setScoreS(suggest.scoreS);
      setScoreE(suggest.scoreE);
      setValidationError(null);
      setCardLevelError(null);
      setScoreError(null);
      setApiError(null);
    }
  }, [open, suggest.cardLevel, suggest.scoreS, suggest.scoreE]);

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
    mutationFn: (payload: Parameters<typeof createCardLevel>[0]) =>
      createCardLevel(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['card-levels', cardType] });
      showToast(
        `等級 ${data.cardLevel} 已新增（區間 ${data.scoreS}~${data.scoreE}）`,
        'success',
      );
      onCreated?.(data);
      onClose();
    },
    onError: (err: any) => {
      const body = err?.response?.data;
      const code = body?.error;
      if (code === 'CARD_LEVEL_DUPLICATE') {
        setCardLevelError(body?.message ?? '等級代碼已存在於選中計分版本');
      } else if (code === 'SCORING_RANGE_OVERLAP') {
        setScoreError(body?.message ?? '新增區間與既有等級重疊，請調整');
      } else if (code === 'VALIDATION_ERROR') {
        setApiError(body?.message ?? '請求參數不符規範');
      } else if (code === 'SCORING_VERSION_LOCKED') {
        showToast('分派執行中，無法修改 CARD_LEVEL 設定', 'error');
        onClose();
      } else if (code === 'CARD_TYPE_NOT_FOUND') {
        showToast('計分卡類型不存在或已停用', 'error');
        onClose();
      } else {
        showToast(body?.message ?? '新增失敗，請稍後再試', 'error');
      }
    },
  });

  function validate(): { ok: boolean; ss?: number; se?: number } {
    setValidationError(null);
    setCardLevelError(null);
    setScoreError(null);
    setApiError(null);

    if (!/^[A-Z]$/.test(cardLevel)) {
      setCardLevelError('等級代碼必須為單一大寫英文字元（A~Z）');
      return { ok: false };
    }
    if (scoreS === '' || scoreE === '') {
      setValidationError('score_s 與 score_e 為必填數值');
      return { ok: false };
    }
    const ss = Number(scoreS);
    const se = Number(scoreE);
    if (!Number.isFinite(ss) || !Number.isFinite(se)) {
      setValidationError('score_s 與 score_e 必須為整數');
      return { ok: false };
    }
    if (ss < 0) {
      setScoreError('score_s 必須 ≥ 0');
      return { ok: false };
    }
    if (se < ss) {
      setScoreError(`score_e (${se}) 必須 ≥ score_s (${ss})`);
      return { ok: false };
    }
    return { ok: true, ss, se };
  }

  function handleSubmit() {
    const v = validate();
    if (!v.ok) return;
    mutation.mutate({
      cardType,
      cardLevel,
      scoreS: v.ss as number,
      scoreE: v.se as number,
    });
  }

  if (!open) return null;

  const ctDisplay = cardName ? `${cardType} — ${cardName}` : cardType;

  // BR-1 hint 文字：依既有等級內容動態顯示
  const sortedLevels = existingLevels
    .slice()
    .sort((a, b) => b.scoreS - a.scoreS);

  return (
    <div className="fixed inset-0 z-50" data-testid="create-card-level-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-labelledby="create-card-level-title"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3
              id="create-card-level-title"
              className="text-lg font-semibold text-gray-900"
            >
              新增 CARD_LEVEL 等級
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
            {/* CARD_TYPE disabled */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                計分卡類型
              </label>
              <input
                data-testid="level-modal-card-type"
                type="text"
                disabled
                value={ctDisplay}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">
                由 Tab 1 選中狀態帶入，不可修改（BR-7 CARD_TYPE 範圍鎖）
              </p>
            </div>

            {/* CARD_LEVEL */}
            <div>
              <label
                htmlFor="level-modal-card-level-input"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                等級代碼 <span className="text-red-600">*</span>
              </label>
              <input
                id="level-modal-card-level-input"
                data-testid="level-modal-card-level"
                type="text"
                maxLength={1}
                autoComplete="off"
                value={cardLevel}
                onChange={(e) =>
                  setCardLevel(e.target.value.toUpperCase().slice(0, 1))
                }
                className={
                  'w-full px-3 py-2 text-sm border rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
                  (cardLevelError
                    ? 'border-red-500 border-2'
                    : 'border-gray-200')
                }
              />
              {cardLevelError && (
                <p
                  data-testid="level-modal-card-level-error"
                  className="text-xs text-red-600 mt-1"
                  role="alert"
                >
                  {cardLevelError}
                </p>
              )}
            </div>

            {/* score_s / score_e */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="level-modal-score-s-input"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  卡片分數起始值 <span className="text-red-600">*</span>
                </label>
                <input
                  id="level-modal-score-s-input"
                  data-testid="level-modal-score-s"
                  type="number"
                  min={0}
                  value={scoreS}
                  onChange={(e) => setScoreS(e.target.value)}
                  className={
                    'w-full px-3 py-2 text-sm border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
                    (scoreError ? 'border-red-500 border-2' : 'border-gray-200')
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="level-modal-score-e-input"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  卡片分數終止值 <span className="text-red-600">*</span>
                </label>
                <input
                  id="level-modal-score-e-input"
                  data-testid="level-modal-score-e"
                  type="number"
                  min={0}
                  value={scoreE}
                  onChange={(e) => setScoreE(e.target.value)}
                  className={
                    'w-full px-3 py-2 text-sm border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
                    (scoreError ? 'border-red-500 border-2' : 'border-gray-200')
                  }
                />
              </div>
            </div>
            {scoreError && (
              <p
                data-testid="level-modal-score-error"
                className="text-xs text-red-600 -mt-2"
                role="alert"
              >
                {scoreError}
              </p>
            )}

            {/* BR-1 v1.5 hint：允許 gap */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs flex items-start gap-2">
              <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div className="text-gray-700">
                {sortedLevels.length === 0 ? (
                  <>
                    <p className="font-medium text-gray-800">
                      將建立第一個等級
                    </p>
                    <p className="text-gray-600 mt-0.5">
                      建議從 A 級開始（最高分），score_e 通常設為 999
                    </p>
                  </>
                ) : (
                  <p className="font-medium text-gray-800">
                    新區間不可與既有等級重疊；允許 gap，相鄰等級不強制連續
                  </p>
                )}
              </div>
            </div>

            {/* 必填 / 通用 validation 錯誤 */}
            {validationError && (
              <div
                data-testid="level-modal-validation-error"
                className="flex items-start gap-2 text-xs text-red-600"
                role="alert"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {validationError}
              </div>
            )}
            {/* API 通用錯誤（422 VALIDATION_ERROR / 其他） */}
            {apiError && (
              <div
                data-testid="level-modal-api-error"
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-start gap-2"
                role="alert"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{apiError}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              取消
            </button>
            <button
              data-testid="level-modal-submit"
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              {mutation.isPending ? '送出中…' : '新增等級'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
