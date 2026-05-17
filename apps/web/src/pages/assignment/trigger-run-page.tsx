import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { useToast } from '@/components/ui/toast';
import { triggerRun } from '@/api/assignment-run';

/**
 * F061 — 觸發月跑頁
 *
 * 對應 prototype: /prototypes/31-trigger-run.html
 *
 * RBAC: DirectorRoute（director only）
 *
 * 流程：
 *   1. 顯示當前月份 + 月跑說明
 *   2. 確認 modal（不可逆操作）
 *   3. POST /assignment/runs → 取得 runId
 *   4. 導航至 /assignment/run-progress?runId={runId}
 *
 * FeatureFlag: ENABLE_E07_REFACTOR_PHASE3 — 由 backend 攔截，FE 不重複檢查。
 */

export function TriggerRunPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning] = useState(false);

  const handleTrigger = async () => {
    setRunning(true);
    try {
      const result = await triggerRun();
      showToast(`月跑已觸發（runId: ${result.runId}）`, 'success');
      navigate(`/assignment/run-progress?runId=${result.runId}`);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const status = e?.response?.status;
      let msg = e?.response?.data?.message ?? '月跑觸發失敗';
      if (status === 409) {
        msg = '當月已有月跑執行中或已完成，請至執行歷史檢視';
      } else if (status === 503) {
        msg = '功能未啟用（ENABLE_E07_REFACTOR_PHASE3=false），請聯絡 Admin';
      }
      showToast(msg, 'error');
      setShowConfirm(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppLayout title="觸發月跑">
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <PlayCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800">觸發本月月跑</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  將執行所有 <strong>準備完成（ready）</strong> 階段名單之客戶分派計算
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900 space-y-1.5">
                <p className="font-semibold">不可逆操作</p>
                <ul className="text-xs space-y-1 list-disc pl-5">
                  <li>月跑觸發後將鎖定本月名單編輯（locked banner 顯示於名單定義頁）。</li>
                  <li>每月僅可觸發一次；如需重跑請聯絡 Admin。</li>
                  <li>處長無觸發權；本頁僅 admin / 部長可達。</li>
                </ul>
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-700">月跑流程</p>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="px-2 py-1 bg-white border border-gray-200 rounded">Stage 1 候選</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="px-2 py-1 bg-white border border-gray-200 rounded">Stage 2 評分</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="px-2 py-1 bg-white border border-gray-200 rounded">Stage 3 部門分派</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="px-2 py-1 bg-white border border-gray-200 rounded">Stage 4 個別分派</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="px-2 py-1 bg-green-100 text-green-700 border border-green-200 rounded">完成</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/assignment/list-definitions')}
              >
                返回名單定義
              </Button>
              <Button
                type="button"
                variant="primary"
                data-testid="btn-trigger"
                onClick={() => setShowConfirm(true)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <PlayCircle className="w-4 h-4" />
                  觸發月跑
                </span>
              </Button>
            </div>
          </section>
        </div>
      </main>

      <ConfirmModal
        open={showConfirm}
        variant="warning"
        title="確認觸發本月月跑？"
        description={
          <div className="space-y-2 text-xs text-gray-600">
            <p>
              將執行客戶分派計算並寫入快照。觸發後 <strong>無法取消</strong>。
            </p>
            <p className="flex items-center gap-1 justify-center text-amber-700">
              <AlertTriangle className="w-3 h-3" />
              請確認所有 ready 階段名單已就緒
            </p>
          </div>
        }
        confirmLabel="確認觸發"
        loading={running}
        loadingText="觸發中..."
        onConfirm={handleTrigger}
        onCancel={() => !running && setShowConfirm(false)}
      />
    </AppLayout>
  );
}
