import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, FileText, ListChecks, BarChart3, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  getSnapshotByType,
  type SingleSnapshotResponse,
  type SnapshotType,
} from '@/api/assignment-run';

/**
 * F066 — 月跑快照詳情頁
 *
 * 對應 prototype: /prototypes/35-snapshot-detail.html
 *
 * 範圍：
 *   - 3 個 tab：config / inputList / result
 *   - 顯示 raw JSON（待 P2 補正規化表格）
 *   - URL: /assignment/snapshots?runId=...&type=config|input_list|result
 *
 * RBAC: DirectorOrSectionChiefRoute
 */

const TAB_CONFIG: Record<
  SnapshotType,
  { label: string; icon: typeof FileText; description: string }
> = {
  config: {
    label: '設定快照',
    icon: FileText,
    description: '月跑當下使用之 list_definition / 部門比例 / 個別比例 / 計分卡版本快照',
  },
  input_list: {
    label: '輸入名單',
    icon: ListChecks,
    description: '月跑前篩選出之候選 OBPOOLDATA 客戶清單（Stage 1 候選快照）',
  },
  result: {
    label: '分派結果',
    icon: BarChart3,
    description: '月跑完成後之最終分派結果（含 customer_id → assignee 映射）',
  },
};

export function SnapshotDetailPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get('runId') ?? '';
  const initialType = (searchParams.get('type') as SnapshotType) || 'config';

  const [activeType, setActiveType] = useState<SnapshotType>(initialType);
  const [data, setData] = useState<SingleSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setError('缺少 runId 參數');
      setLoading(false);
      return;
    }
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getSnapshotByType(runId, activeType);
        if (!aborted) setData(result);
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { message?: string } } };
        if (!aborted) {
          if (e.response?.status === 404) {
            setError(`快照不存在或已被清除（type=${activeType}）`);
          } else {
            setError(e?.response?.data?.message ?? '載入快照失敗');
          }
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runId, activeType]);

  const selectTab = (type: SnapshotType) => {
    setActiveType(type);
    const next = new URLSearchParams(searchParams);
    next.set('type', type);
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout
      headerLeft={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/assignment/history')}
            className="text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">快照詳情</h1>
          {runId && (
            <code className="font-mono text-xs text-primary px-2 py-0.5 bg-blue-50 rounded">
              {runId}
            </code>
          )}
        </div>
      }
    >
      <main className="flex-1 p-6 space-y-4">
        {/* Tab nav */}
        <div className="flex items-center gap-2" data-testid="snapshot-tabs">
          {(['config', 'input_list', 'result'] as const).map((t) => {
            const cfg = TAB_CONFIG[t];
            const Icon = cfg.icon;
            const isActive = activeType === t;
            return (
              <button
                key={t}
                type="button"
                data-testid={`snapshot-tab-${t}`}
                onClick={() => selectTab(t)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500">{TAB_CONFIG[activeType].description}</p>

        {loading && (
          <div className="p-12 text-center text-gray-400" data-testid="snapshot-loading">
            載入快照中...
          </div>
        )}

        {error && (
          <div
            data-testid="snapshot-error"
            className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {data && !loading && !error && (
          <section
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            data-testid="snapshot-data"
          >
            <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
              <Camera className="w-4 h-4 text-gray-600" />
              <h3 className="text-sm font-semibold text-gray-800">
                {TAB_CONFIG[activeType].label}（type = <code className="font-mono text-xs">{activeType}</code>）
              </h3>
            </div>
            <pre
              data-testid="snapshot-json"
              className="overflow-auto text-xs font-mono text-gray-700 bg-gray-50/50 p-4 max-h-[60vh]"
            >
              {JSON.stringify(data.data, null, 2)}
            </pre>
          </section>
        )}
      </main>
    </AppLayout>
  );
}
