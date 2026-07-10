import {
  Copy,
  X,
  ChevronRight,
  Loader2,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { PersonnelRatioCopySource } from '@/api/assignment-stage';

/**
 * 個別業務比例設定頁 — 「從本月其他名單複製」modal（設定頁 UX 優化）。
 *
 * 顯示本月其他 active 名單中，已於本部門設定個別業務比例者；點「使用此設定」
 * 觸發 onCopy(source)，父層（PersonnelRatioForm）將該來源之 emp→ration 套入本部門表單。
 *
 * 對齊既有 copy-from-prev-month-modal.tsx 之視覺與互動慣例（backdrop 關閉 / row 卡片 /
 * 右側行動按鈕），差異在於：來源限定「本月、同部門」，複製對象為員工比例（非名單欄位）。
 */

export interface CopyDeptRatioModalProps {
  open: boolean;
  /** 目標部門代碼（顯示用） */
  deptCode: string;
  /** 目標部門名稱（顯示用） */
  deptName: string;
  loading: boolean;
  sources: PersonnelRatioCopySource[];
  onCopy: (source: PersonnelRatioCopySource) => void;
  onClose: () => void;
}

export function CopyDeptRatioModal({
  open,
  deptCode,
  deptName,
  loading,
  sources,
  onCopy,
  onClose,
}: CopyDeptRatioModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid={`copy-dept-ratio-modal-${deptCode}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-base font-semibold text-gray-800">
                  從本月其他名單複製業務比例
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  複製至{' '}
                  <span className="font-mono text-primary">{deptCode}</span>{' '}
                  {deptName}；選擇本月其他名單於本部門的比例設定帶入，作為起點後可再調整
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="btn-close-copy-dept-modal"
              aria-label="關閉"
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div
                data-testid="copy-dept-modal-loading"
                className="p-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                載入本月其他名單中...
              </div>
            )}

            {!loading && sources.length === 0 && (
              <div
                data-testid="copy-dept-modal-empty"
                className="p-8 flex flex-col items-center text-center"
              >
                <ClipboardList className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  本月其他名單尚未於本部門（{deptName}）設定個別業務比例，無可複製來源
                </p>
              </div>
            )}

            {!loading && sources.length > 0 && (
              <ul className="space-y-2">
                {sources.map((s) => {
                  const sumOk = Math.abs(s.deptSum - 100) <= 0.01;
                  return (
                    <li
                      key={s.listNo}
                      data-testid={`copy-dept-source-${s.listNo}`}
                      className="border border-gray-200 rounded-lg p-3 hover:border-primary transition flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-primary text-sm">
                            {s.listNo}
                          </span>
                          <span className="text-sm font-medium text-gray-800">
                            {s.listNm}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600 flex-wrap">
                          <span>{s.memberCount} 位業務員</span>
                          <span className="text-gray-300">·</span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              sumOk ? 'text-green-700' : 'text-amber-700'
                            }`}
                          >
                            {sumOk ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <AlertCircle className="w-3 h-3" />
                            )}
                            加總 {s.deptSum.toFixed(2)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1 truncate">
                          {s.employees
                            .map((e) => `${e.empName} ${e.ration}%`)
                            .join('、')}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid={`btn-use-source-${s.listNo}`}
                        onClick={() => onCopy(s)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 shrink-0"
                      >
                        使用此設定
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              複製後僅帶入各業務員比例（可再調整）；不影響來源名單。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-white"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
