import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  ListChecks,
  BarChart3,
  AlertTriangle,
  Lock,
  Download,
  GitCompare,
  CheckCircle2,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  getSnapshotByType,
  getRun,
  type SingleSnapshotResponse,
  type SnapshotType,
  type RunProgressResponse,
} from '@/api/assignment-run';
import {
  SnapshotConfigView,
  type SnapshotConfigPayload,
} from './_components/snapshot-config-view';
import { SnapshotArrayView } from './_components/snapshot-array-view';
import { SnapshotResultTable } from './_components/snapshot-result-table';
import { RunPageBreadcrumb } from './_components/run-page-breadcrumb';

/**
 * F066 v1.3 — 月名單分派快照詳情頁（使用者友善重構）
 *
 * 對應 prototype: prototypes/35-snapshot-detail.html
 *
 * 排版對齊「篩選欄位」/「計分卡設定」：標題+說明、run 資訊卡、底線分頁、中文欄名、decode badge。
 *   - 設定快照：SnapshotConfigView（中文欄名 + badge）
 *   - 輸入名單：SnapshotArrayView（中文表頭 + 前端過濾）
 *   - 分派結果：SnapshotResultTable（分頁端點 §5.3，對齊匯出 23 欄 + 後端搜尋）
 *
 * URL: /assignment/snapshots?runId=...&type=config|input_list|result
 * RBAC: DirectorOrSectionChiefRoute
 */

const TAB_META: Record<
  SnapshotType,
  { label: string; icon: typeof FileText; description: string }
> = {
  config: {
    label: '設定快照',
    icon: FileText,
    description: '本次分派當時採用的名單定義、計分卡分數區間、分級對應與部門／人員比例。',
  },
  input_list: {
    label: '輸入名單',
    icon: ListChecks,
    description: '本次分派前篩選出的候選客戶名單。',
  },
  result: {
    label: '分派結果',
    icon: BarChart3,
    description: '本次分派完成後每位客戶對應到的承辦人員（欄位與「結果摘要」匯出 Excel 一致）。',
  },
};

function formatWorkYm(ym?: string | null): string {
  if (ym && /^\d{6}$/.test(ym)) {
    return `${ym.slice(0, 4)} 年 ${parseInt(ym.slice(4, 6), 10)} 月`;
  }
  return ym ?? '—';
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  completed: { label: '已完成', cls: 'bg-green-100 text-success' },
  running: { label: '執行中', cls: 'bg-blue-100 text-blue-700' },
  pending: { label: '等待中', cls: 'bg-gray-100 text-gray-600' },
  failed: { label: '失敗', cls: 'bg-red-100 text-danger' },
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

export function SnapshotDetailPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get('runId') ?? '';
  const initialType = (searchParams.get('type') as SnapshotType) || 'config';

  const [activeType, setActiveType] = useState<SnapshotType>(initialType);
  const [run, setRun] = useState<RunProgressResponse | null>(null);
  const [data, setData] = useState<SingleSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Run 資訊卡：F062 getRun 一次載入（與快照 payload 解耦，避免分派結果分頁載入巨量 payload）
  useEffect(() => {
    if (!runId) return;
    let aborted = false;
    void (async () => {
      try {
        const r = await getRun(runId);
        if (!aborted) setRun(r);
      } catch {
        /* 資訊卡缺失不阻擋分頁內容 */
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runId]);

  // 設定快照 / 輸入名單 payload（分派結果分頁改用 SnapshotResultTable，不載 payload）
  useEffect(() => {
    if (!runId) {
      setError('網址缺少分派批次編號，請從執行歷史重新進入。');
      setLoading(false);
      return;
    }
    if (activeType === 'result') {
      setLoading(false);
      setError(null);
      setData(null);
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
            setError('找不到此份快照（可能已逾保留期或尚未建立）。');
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

  const payload = data?.payload ?? null;
  const status = run?.status ?? '';
  const statusMeta = STATUS_META[status] ?? { label: status || '—', cls: 'bg-gray-100 text-gray-600' };

  return (
    <AppLayout headerLeft={<RunPageBreadcrumb leaf="快照詳情" />}>
      <main className="flex-1 p-6 space-y-4">
        {/* 標題 + 說明 */}
        <div>
          <h1 className="text-xl font-semibold text-gray-800">快照詳情</h1>
          <p className="text-sm text-gray-500 mt-1">
            檢視本次月名單分派當時的設定、輸入名單與分派結果（唯讀紀錄）
          </p>
        </div>

        {/* Run 資訊卡 */}
        {runId && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${statusMeta.cls}`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {statusMeta.label}
                </span>
                <span className="text-lg font-semibold text-gray-800">
                  {formatWorkYm(run?.projectWorkym)}分派
                </span>
                <span
                  data-testid="readonly-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200"
                >
                  <Lock className="w-3 h-3" />
                  唯讀
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="btn-download-snapshot"
                  onClick={() => {
                    if (!payload) return;
                    const blob = new Blob([JSON.stringify(payload, null, 2)], {
                      type: 'application/json',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `snapshot-${runId}-${activeType}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!payload}
                  title={payload ? undefined : '分派結果請於「結果摘要」頁匯出 Excel'}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-primary border border-blue-200 rounded-md hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  下載快照檔
                </button>
                <button
                  type="button"
                  data-testid="btn-compare-from-snapshot"
                  onClick={() => navigate(`/assignment/compare?runA=${runId}&runB=`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  以此比對
                </button>
              </div>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-6 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">分派作業月份</div>
                <div className="text-sm font-semibold text-gray-800">{formatWorkYm(run?.projectWorkym)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">狀態</div>
                <div className="text-sm font-medium text-gray-800">{statusMeta.label}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">觸發者</div>
                <div className="text-sm font-medium text-gray-800">
                  {run?.triggeredByName ?? run?.triggeredBy ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">觸發時間</div>
                <div className="text-sm text-gray-700">{formatDateTime(run?.triggeredAt)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">完成時間</div>
                <div className="text-sm text-gray-700">{formatDateTime(run?.finishedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">總分派筆數</div>
                <div className="text-sm font-semibold text-gray-800 tabular-nums">
                  {run?.totalCases != null ? `${run.totalCases.toLocaleString()} 筆` : '—'}
                </div>
              </div>
            </div>
            <div className="px-5 pb-3 flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
              <span>批次編號</span>
              <code className="font-mono bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">
                {runId}
              </code>
              <span>· 保留 3 年</span>
            </div>
          </div>
        )}

        {/* 分頁 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div
            className="px-5 border-b border-gray-200 flex items-center gap-1"
            data-testid="snapshot-tabs"
          >
            {(['config', 'input_list', 'result'] as const).map((t) => {
              const cfg = TAB_META[t];
              const Icon = cfg.icon;
              const isActive = activeType === t;
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`snapshot-tab-${t}`}
                  onClick={() => selectTab(t)}
                  className={`px-4 py-3 text-sm font-medium inline-flex items-center gap-1.5 -mb-px border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">{TAB_META[activeType].description}</p>

            {activeType !== 'result' && loading && (
              <div className="p-12 text-center text-gray-400" data-testid="snapshot-loading">
                載入中…
              </div>
            )}

            {activeType !== 'result' && error && (
              <div
                data-testid="snapshot-error"
                className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <span className="text-red-800">{error}</span>
              </div>
            )}

            {activeType === 'config' && !loading && !error && (
              <SnapshotConfigView payload={payload as SnapshotConfigPayload | null} />
            )}

            {activeType === 'input_list' && !loading && !error && (
              <SnapshotArrayView
                payload={payload as Record<string, unknown> | null}
                arrayKey="cases"
                title="輸入名單"
              />
            )}

            {activeType === 'result' && <SnapshotResultTable runId={runId} />}
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
