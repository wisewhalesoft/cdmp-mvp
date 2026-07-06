import { useState, useEffect } from 'react';
import { Lock, Hash, Tags, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FieldType, PooldataField } from '@/api/pooldata-fields';

/**
 * F075 v1.4.5 — Edit Field Modal
 *
 * 對應 prototype: /prototypes/37a-pooldata-whitelist.html L691-707
 *
 * v1.4.5 reverse v1.4 D-iii 決議：補回 Edit 流程（v1.4 暫不實作的決議於 v1.4.5 撤回）
 *
 * 設計：
 *   - 結構與新增 Modal 相同（fieldType radio + displayName）
 *   - columnName 為唯讀 chip（PK 不可變更，對應 prototype L287-295）
 *   - **不顯示**系統推斷 hint（AC-14 限定僅新增流程，prototype L704-705 註解）
 *   - categorical → 其他 fieldType 切換：由父層 page 偵測，submit 後由父層觸發既有 CategorySwitchConfirmModal
 *
 * 提交流程：
 *   - 父層接收 onSubmit(displayName, fieldType)
 *   - 父層判斷是否觸發 CategorySwitchConfirmModal（categorical → numeric/date 級聯）
 *   - 父層呼叫 updateField(columnName, { displayName, fieldType })
 */

const FIELD_TYPE_CARDS: Array<{
  type: FieldType;
  label: string;
  hint: string;
  Icon: typeof Tags;
}> = [
  {
    type: 'categorical',
    label: '類別型',
    hint: '多選列表',
    Icon: Tags,
  },
  { type: 'numeric', label: '數值型', hint: '數值範圍', Icon: Hash },
  { type: 'date', label: '日期型', hint: '日期範圍', Icon: Calendar },
];

export interface EditFieldModalProps {
  open: boolean;
  field: PooldataField | null;
  submitting?: boolean;
  errorMessage?: string | null;
  onSubmit: (payload: { displayName: string; fieldType: FieldType }) => void;
  onCancel: () => void;
}

export function EditFieldModal({
  open,
  field,
  submitting = false,
  errorMessage = null,
  onSubmit,
  onCancel,
}: EditFieldModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('categorical');

  // open 切換時重置（避免上一次的編輯狀態殘留）
  useEffect(() => {
    if (open && field) {
      setDisplayName(field.displayName);
      setFieldType(field.fieldType);
    }
  }, [open, field]);

  if (!open || !field) return null;

  const submitDisabled = !displayName.trim() || submitting;

  return (
    <div className="fixed inset-0 z-50" data-testid="edit-field-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={submitting ? undefined : onCancel}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-800">
              編輯篩選欄位
            </h3>
          </div>

          <div className="p-6 space-y-4">
            {errorMessage && (
              <div
                data-testid="edit-error"
                className="rounded-md p-2.5 bg-red-50 border border-red-200 text-xs text-red-800"
              >
                {errorMessage}
              </div>
            )}

            {/* ===== 欄位名稱 唯讀 chip（不可變更） ===== */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                欄位名稱
              </label>
              <div
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono"
                data-testid="readonly-column-name"
              >
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <span>{field.columnName}</span>
                <span className="ml-auto text-[10px] text-gray-400">不可變更</span>
              </div>
            </div>

            {/* ===== fieldType radio ===== */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                欄位類型 <span className="text-danger">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {FIELD_TYPE_CARDS.map(({ type, label, hint, Icon }) => (
                  <label
                    key={type}
                    className={`flex items-start gap-2 px-3 py-2.5 border rounded-lg cursor-pointer transition ${
                      fieldType === type
                        ? 'border-primary bg-blue-50/40'
                        : 'border-gray-200 hover:border-primary hover:bg-blue-50/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit-fieldType"
                      value={type}
                      data-testid={`edit-field-type-radio-${type}`}
                      checked={fieldType === type}
                      onChange={() => setFieldType(type)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {hint}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* ===== displayName ===== */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                顯示名稱 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                data-testid="edit-input-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                placeholder="例：風險等級"
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <Button
              type="button"
              variant="primary"
              loading={submitting}
              loadingText="更新中..."
              disabled={submitDisabled}
              data-testid="btn-submit-edit-field"
              onClick={() =>
                onSubmit({
                  displayName: displayName.trim(),
                  fieldType,
                })
              }
            >
              儲存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
