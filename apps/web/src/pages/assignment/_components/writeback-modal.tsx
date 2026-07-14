import { useState, useEffect } from 'react';
import {
  UploadCloud,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  previewWriteback,
  executeWriteback,
  type WritebackPreviewResponse,
  type WritebackResultResponse,
} from '@/api/assignment-run';

/**
 * F115 — 分派結果回寫外部 OBPOOLDATA_LIST：預覽 + 二次確認 modal
 *
 * 對應 prototype: prototypes/35-snapshot-detail.html（回寫預覽 modal）
 *
 * 流程：開啟即呼叫 preview（dry-run，不寫入）→ 顯示將更新筆數 / 涵蓋名單 / 外部連線狀態
 * → 使用者勾選二次確認 → 「確認回寫」呼叫 execute（真實寫入）→ 顯示結果 / 錯誤。
 */

function extractMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message ?? fallback;
}

export function WritebackModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<WritebackPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<WritebackResultResponse | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    void (async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const p = await previewWriteback(runId);
        if (!aborted) setPreview(p);
      } catch (err) {
        if (!aborted) setPreviewError(extractMessage(err, '載入預覽失敗'));
      } finally {
        if (!aborted) setPreviewLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runId]);

  const doExecute = async () => {
    setExecuting(true);
    setExecuteError(null);
    try {
      const r = await executeWriteback(runId);
      setResult(r);
    } catch (err) {
      setExecuteError(extractMessage(err, '回寫失敗'));
    } finally {
      setExecuting(false);
    }
  };

  const canExecute =
    !!preview &&
    preview.connectionAvailable &&
    confirmed &&
    !executing &&
    !result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="writeback-modal"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-gray-800">
              回寫至業務系統（OBPOOLDATA_LIST）
            </h3>
          </div>
          <button
            type="button"
            data-testid="writeback-close"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 結果 */}
          {result ? (
            <div
              data-testid="writeback-result"
              className="rounded-lg p-4 bg-green-50 border border-green-200 flex items-start gap-2 text-sm"
            >
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
              <div className="text-gray-700">
                <p className="font-semibold text-gray-800 mb-1">回寫完成</p>
                <p>
                  成功更新 <strong className="tabular-nums">{result.updated.toLocaleString()}</strong> 筆
                  {result.notMatched > 0 && (
                    <>
                      ，
                      <strong className="tabular-nums text-warning">
                        {result.notMatched.toLocaleString()}
                      </strong>{' '}
                      筆目標未命中（已標記待處理）
                    </>
                  )}
                  。
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  此動作會將本次分派結果寫入外部業務系統（催收作業使用）。寫入前請確認預覽內容，寫入後不可自動復原。
                </span>
              </div>

              {previewLoading && (
                <div className="p-8 text-center text-gray-400" data-testid="writeback-preview-loading">
                  載入預覽中…
                </div>
              )}

              {previewError && !previewLoading && (
                <div
                  data-testid="writeback-preview-error"
                  className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{previewError}</span>
                </div>
              )}

              {preview && !previewLoading && (
                <>
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">預覽（尚未寫入）</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                        <div
                          className="text-lg font-bold text-gray-800 tabular-nums"
                          data-testid="writeback-preview-total"
                        >
                          {preview.totalToWrite.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500">將更新筆數</div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-gray-800 tabular-nums">
                          {preview.byListNo.length}
                        </div>
                        <div className="text-[11px] text-gray-500">涵蓋名單數</div>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">
                      更新欄位：承辦部門、承辦人員、指派日、計分等級、分級、CR 相關欄。比對鍵：名單編號 + 機構 + 案號。未命中筆數於執行後回報。
                    </p>
                  </div>

                  {!preview.connectionAvailable && (
                    <div
                      data-testid="writeback-conn-warning"
                      className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800"
                    >
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>外部業務系統連線尚未就緒，暫時無法執行回寫。請先於「資料來源」設定並測試連線。</span>
                    </div>
                  )}

                  {executeError && (
                    <div
                      data-testid="writeback-error"
                      className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800"
                    >
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{executeError}</span>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      data-testid="writeback-confirm-checkbox"
                      checked={confirmed}
                      disabled={!preview.connectionAvailable}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    我已確認上述預覽內容無誤，同意寫入業務系統
                  </label>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            data-testid="writeback-cancel"
            onClick={onClose}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50"
          >
            {result ? '關閉' : '取消'}
          </button>
          {!result && (
            <button
              type="button"
              data-testid="writeback-execute-btn"
              onClick={doExecute}
              disabled={!canExecute}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              {executing ? '回寫中…' : '確認回寫'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
