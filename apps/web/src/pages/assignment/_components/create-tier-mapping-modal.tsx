import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, GitFork, ShieldAlert, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  createTierMapping,
  TIER_LEVEL_ENUM,
  type TierMappingItem,
} from '@/api/assignment-scoring';

/**
 * F056 v1.5：新增 TIER_LEVEL 對應 Modal
 *
 * 對應 prototype 28 line 785~884（tierModal）+ line 1549~1590（onTierModeChange）。
 *
 * 功能（v1.5）：
 *   - Standard / Fallback radio card 模式切換
 *     - Standard：含 CARD_LEVEL 下拉（A/B/C/D，來源 ob_levelcard_level active 版本）
 *     - Fallback：CARD_LEVEL 自動帶 NULL
 *   - TIER_LEVEL 下拉硬編碼 T1~T10（不允許自由輸入）
 *   - LIST_NM 選填（最多 30 字元）
 *   - 互斥檢查：DB 有 Standard → Fallback radio disabled；DB 有 Fallback → Standard radio disabled
 *   - 422 CARD_TYPE_FALLBACK_STANDARD_MUTEX → 顯示行內錯誤
 *
 * 注意：本元件不檢查當前 selectedCardType 為何（由父層 TierMappingTabV15 注入），
 *   保持元件純度便於單測。
 */

type Mode = 'standard' | 'fallback';

interface Props {
  open: boolean;
  cardType: string;
  cardName?: string;
  availableCardLevels: string[];
  /** 該 cardType 既有 mappings；供互斥檢查與 disabled 計算 */
  existingMappings: TierMappingItem[];
  onClose: () => void;
  onCreated?: (mapping: TierMappingItem) => void;
}

export function CreateTierMappingModal({
  open,
  cardType,
  cardName,
  availableCardLevels,
  existingMappings,
  onClose,
  onCreated,
}: Props) {
  // 依既有紀錄計算 standard / fallback count（互斥邏輯）
  const { standardCount, fallbackCount } = useMemo(() => {
    let s = 0;
    let f = 0;
    for (const m of existingMappings) {
      if (m.cardLevel == null) f += 1;
      else s += 1;
    }
    return { standardCount: s, fallbackCount: f };
  }, [existingMappings]);

  const fallbackDisabled = standardCount > 0;
  const standardDisabled = fallbackCount > 0;

  // 預設模式：若 Standard disabled 則用 Fallback；否則預設 Standard
  const defaultMode: Mode = standardDisabled ? 'fallback' : 'standard';
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [cardLevel, setCardLevel] = useState('');
  const [tierLevel, setTierLevel] = useState('');
  const [mutexError, setMutexError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setMode(standardDisabled ? 'fallback' : 'standard');
      setCardLevel('');
      setTierLevel('');
      setMutexError(null);
      setValidationError(null);
    }
  }, [open, standardDisabled]);

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
    mutationFn: (payload: Parameters<typeof createTierMapping>[0]) =>
      createTierMapping(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tier-mapping', cardType] });
      showToast(
        `已新增 ${data.cardType} ${data.cardLevel ?? 'Fallback'} → ${data.tierLevel}`,
        'success',
      );
      onCreated?.(data);
      onClose();
    },
    onError: (err: any) => {
      const body = err?.response?.data;
      const code = body?.error;
      if (code === 'CARD_TYPE_FALLBACK_STANDARD_MUTEX') {
        setMutexError(
          body?.message ?? '同一計分卡類型不可同時存在 Fallback 與 Standard 規則',
        );
      } else if (code === 'TIER_LEVEL_INVALID_ENUM') {
        setValidationError('TIER_LEVEL 必須為 T1~T10 之一');
      } else if (code === 'TIER_LEVEL_DUPLICATE') {
        setValidationError(body?.message ?? '此 (CARD_TYPE, CARD_LEVEL) 對應已存在');
      } else if (code === 'CARD_LEVEL_NOT_FOUND_IN_VERSION') {
        setValidationError('CARD_LEVEL 不存在於該 CARD_TYPE 之 active 計分版本');
      } else if (code === 'CARD_TYPE_NOT_FOUND') {
        showToast('計分卡類型不存在或已停用', 'error');
        onClose();
      } else if (code === 'SCORING_VERSION_LOCKED') {
        showToast('分派執行中，無法修改計分設定', 'error');
        onClose();
      } else {
        showToast(body?.message ?? '新增失敗，請稍後再試', 'error');
      }
    },
  });

  function validate(): boolean {
    setValidationError(null);
    if (mode === 'standard' && !cardLevel) {
      setValidationError('請選擇 CARD_LEVEL');
      return false;
    }
    if (!tierLevel) {
      setValidationError('請選擇 TIER_LEVEL');
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      cardType,
      cardLevel: mode === 'fallback' ? null : cardLevel,
      tierLevel,
      listNm: null,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="create-tier-mapping-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-labelledby="create-tier-title"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3
              id="create-tier-title"
              className="text-lg font-semibold text-gray-900"
            >
              新增 TIER_LEVEL 對應
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
            {/* 規則類型 Radio Card */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                規則類型 <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={
                    'cursor-pointer border-2 rounded-lg p-3 flex items-start gap-2 transition ' +
                    (mode === 'standard'
                      ? 'border-blue-600 bg-blue-50/40'
                      : 'border-gray-200 bg-white') +
                    (standardDisabled ? ' opacity-50 cursor-not-allowed' : '')
                  }
                >
                  <input
                    type="radio"
                    name="tierMode"
                    value="standard"
                    checked={mode === 'standard'}
                    disabled={standardDisabled}
                    onChange={() => {
                      if (!standardDisabled) {
                        setMode('standard');
                        setMutexError(null);
                      }
                    }}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">
                      Standard（依等級）
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      依 CARD_LEVEL 等級 (A/B/C/D...) 對應不同 TIER_LEVEL
                    </div>
                  </div>
                </label>
                <label
                  className={
                    'cursor-pointer border-2 rounded-lg p-3 flex items-start gap-2 transition ' +
                    (mode === 'fallback'
                      ? 'border-purple-500 bg-purple-50/40'
                      : 'border-gray-200 bg-white') +
                    (fallbackDisabled ? ' opacity-50 cursor-not-allowed' : '')
                  }
                >
                  <input
                    type="radio"
                    name="tierMode"
                    value="fallback"
                    checked={mode === 'fallback'}
                    disabled={fallbackDisabled}
                    onChange={() => {
                      if (!fallbackDisabled) {
                        setMode('fallback');
                        setMutexError(null);
                      }
                    }}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">
                      Fallback（不分等級）
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      CARD_LEVEL 留空（NULL），不分等級直接對應 TIER_LEVEL
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* 互斥警告（依當前選定 CARD_TYPE 的 ob_tier 紀錄動態顯示） */}
            {(standardDisabled || fallbackDisabled) && (
              <div
                data-testid="mutex-warn"
                className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs flex items-start gap-2"
              >
                <ShieldAlert
                  size={16}
                  className="text-amber-600 mt-0.5 shrink-0"
                />
                <div className="text-gray-800">
                  {standardDisabled && (
                    <>
                      該 CARD_TYPE 已存在 <strong>{fallbackCount}</strong> 筆
                      Fallback 規則。若要改用 Standard，請先移除既有 Fallback 對應
                    </>
                  )}
                  {fallbackDisabled && (
                    <>
                      該 CARD_TYPE 已存在 <strong>{standardCount}</strong> 筆
                      Standard 規則。若要改用 Fallback，請先移除既有 Standard 對應
                    </>
                  )}
                </div>
              </div>
            )}

            {/* CARD_TYPE disabled */}
            <div>
              <label
                htmlFor="tier-card-type"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                計分卡類型
              </label>
              <input
                id="tier-card-type"
                type="text"
                disabled
                value={cardName ? `${cardType} — ${cardName}` : cardType}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">
                由 Tab 1 選中狀態帶入，不可修改
              </p>
            </div>

            {/* Standard 模式：CARD_LEVEL 下拉 */}
            {mode === 'standard' && (
              <div>
                <label
                  htmlFor="tier-card-level"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  等級代碼 <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <select
                    id="tier-card-level"
                    value={cardLevel}
                    onChange={(e) => setCardLevel(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">請選擇</option>
                    {availableCardLevels.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  來源：當前 CARD_TYPE 之 active 版本 ob_levelcard_level
                </p>
              </div>
            )}

            {/* Fallback 模式：提示 */}
            {mode === 'fallback' && (
              <div
                data-testid="fallback-hint"
                className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-800 flex items-start gap-2"
              >
                <GitFork
                  size={16}
                  className="text-purple-600 mt-0.5 shrink-0"
                />
                <span>
                  CARD_LEVEL 將自動帶入 <code>NULL</code>（不分等級）
                </span>
              </div>
            )}

            {/* TIER_LEVEL 下拉（T1~T10） */}
            <div>
              <label
                htmlFor="tier-tier-level"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                TIER 代碼 <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <select
                  id="tier-tier-level"
                  value={tierLevel}
                  onChange={(e) => setTierLevel(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-lg bg-white font-mono appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">請選擇</option>
                  {TIER_LEVEL_ENUM.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                固定列舉 T1~T10，不允許自由輸入（v1.5 規格 / BR-2）
              </p>
            </div>

            {/* 錯誤訊息 */}
            {validationError && (
              <div
                data-testid="validation-error"
                className="flex items-start gap-2 text-xs text-red-600"
                role="alert"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {validationError}
              </div>
            )}
            {mutexError && (
              <div
                data-testid="mutex-error"
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2"
                role="alert"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {mutexError}
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
              data-testid="btn-tier-confirm"
              onClick={handleSubmit}
              // Iter 7 review 差異 #21：互斥模式時阻止送出（先擋於 client，
              // 不依賴 422 server roundtrip）
              disabled={
                mutation.isPending ||
                (mode === 'standard' && standardDisabled) ||
                (mode === 'fallback' && fallbackDisabled)
              }
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? '送出中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
