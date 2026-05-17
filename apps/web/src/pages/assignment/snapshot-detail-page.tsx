import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  FileText,
  ListChecks,
  BarChart3,
  AlertTriangle,
  Lock,
  Download,
  GitCompare,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  getSnapshotByType,
  type SingleSnapshotResponse,
  type SnapshotType,
} from '@/api/assignment-run';
import {
  SnapshotConfigView,
  type SnapshotConfigPayload,
} from './_components/snapshot-config-view';
import { SnapshotArrayView } from './_components/snapshot-array-view';

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
        {/* Phase 3 P2-2: Run Info Bar — READ-ONLY + 下載 / 以此比對 */}
        {runId && (
          <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Run ID</span>
              <code className="font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                {runId}
              </code>
              <span
                data-testid="readonly-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200"
              >
                <Lock className="w-3 h-3" />
                READ-ONLY 不可變
              </span>
              <span className="text-gray-400">
                · 快照保留 3 年（AD-E07-3）
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="btn-download-snapshot"
                onClick={() => {
                  if (!data) return;
                  const blob = new Blob(
                    [JSON.stringify(data.data, null, 2)],
                    { type: 'application/json' },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `snapshot-${runId}-${activeType}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                disabled={!data}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-primary border border-blue-200 rounded-md hover:bg-blue-50 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                下載 JSON
              </button>
              <button
                type="button"
                data-testid="btn-compare-from-snapshot"
                onClick={() =>
                  navigate(`/assignment/compare?runA=${runId}&runB=`)
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <GitCompare className="w-3.5 h-3.5" />
                以此比對
              </button>
            </div>
          </div>
        )}

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
                {TAB_CONFIG[activeType].label}（type ={' '}
                <code className="font-mono text-xs">{activeType}</code>）
              </h3>
            </div>
            <div className="p-5">
              {/* Phase 3 P2-2：依 type 渲染正規化 view */}
              {activeType === 'config' && (
                <SnapshotConfigView
                  payload={data.data as SnapshotConfigPayload | null}
                />
              )}
              {activeType === 'input_list' && (
                <SnapshotArrayView
                  payload={data.data as Record<string, unknown> | null}
                  arrayKey="cases"
                  title="輸入名單（cases）"
                />
              )}
              {activeType === 'result' && (
                <SnapshotArrayView
                  payload={data.data as Record<string, unknown> | null}
                  arrayKey="assignments"
                  title="分派結果（assignments）"
                />
              )}
            </div>
            {/* 原始 JSON （摺疊起來；除錯用） */}
            <details className="border-t border-gray-200 bg-gray-50/40">
              <summary className="px-5 py-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
                展開原始 JSON（除錯用）
              </summary>
              <pre
                data-testid="snapshot-json"
                className="overflow-auto text-xs font-mono text-gray-700 bg-gray-50/50 p-4 max-h-[40vh]"
              >
                {JSON.stringify(data.data, null, 2)}
              </pre>
            </details>
          </section>
        )}
      </main>
    </AppLayout>
  );
}
