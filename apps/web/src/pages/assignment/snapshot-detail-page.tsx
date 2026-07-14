import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  ListChecks,
  BarChart3,
  Table2,
  AlertTriangle,
  Lock,
  Download,
  GitCompare,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  getSnapshotByType,
  getRun,
  getRunSummary,
  type SnapshotType,
  type RunProgressResponse,
  type RunSummaryResponse,
} from '@/api/assignment-run';
import {
  SnapshotConfigView,
  type SnapshotConfigPayload,
} from './_components/snapshot-config-view';
import { SnapshotInputSummary } from './_components/snapshot-input-summary';
import { SnapshotResultTable } from './_components/snapshot-result-table';
import { SnapshotPivotView } from './_components/snapshot-pivot-view';
import { RunPageBreadcrumb } from './_components/run-page-breadcrumb';

/** UI 分頁鍵：三種快照型別 + 樞紐分析（F116，非快照型別）。 */
type TabKey = SnapshotType | 'pivot';

/**
 * F066 v1.3 — 月名單分派快照詳情頁（對齊 prototype 35-snapshot-detail.html）
 *
 * 排版對齊「篩選欄位」/「計分卡設定」：標題+說明、run 資訊卡（含 tab 筆數 pill）、底線分頁。
 *   - 設定快照：SnapshotConfigView（中文欄名 + decode badge）
 *   - 輸入名單：SnapshotInputSummary（摘要卡 + 各名單明細 + 案號查詢）
 *   - 分派結果：SnapshotResultTable（摘要卡 + 分頁端點 §5.3 對齊匯出 23 欄 + 後端搜尋）
 *
 * 資料：getRun（meta）+ getRunSummary（摘要卡/pill）+ config 快照（mount，供設定 view 與輸入名稱 decode）
 *      + input_list 快照（進入分頁時延後載入）。
 *
 * URL: /assignment/snapshots?runId=...&type=config|input_list|result
 * RBAC: DirectorOrSectionChiefRoute
 */

const TAB_META: Record<
  TabKey,
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
  pivot: {
    label: '樞紐分析',
    icon: Table2,
    description: '各部門／承辦人員 × 名單代號 的分派案件數交叉表（對應「結果摘要」匯出樞紐分析頁）。',
  },
};

function formatWorkYm(ym?: string | null): string {
  if (ym && /^\d{6}$/.test(ym)) {
    return `${ym.slice(0, 4)} 年 ${parseInt(ym.slice(4, 6), 10)} 月`;
  }
  return ym ?? '—';
}

const STATUS_META: Record<string, { label: string; cls: string; text: string }> = {
  completed: { label: '已完成', cls: 'bg-green-100 text-success', text: 'text-success' },
  running: { label: '執行中', cls: 'bg-blue-100 text-blue-700', text: 'text-blue-700' },
  pending: { label: '等待中', cls: 'bg-gray-100 text-gray-600', text: 'text-gray-700' },
  failed: { label: '失敗', cls: 'bg-red-100 text-danger', text: 'text-danger' },
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

/** 觸發時間 + 3 年（快照保留期）→ 'YYYY-MM-DD'。 */
function retentionDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function SnapshotDetailPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const runId = searchParams.get('runId') ?? '';
  const initialType = (searchParams.get('type') as TabKey) || 'config';

  const [activeType, setActiveType] = useState<TabKey>(initialType);
  const [run, setRun] = useState<RunProgressResponse | null>(null);
  const [summary, setSummary] = useState<RunSummaryResponse | null>(null);

  const [configPayload, setConfigPayload] = useState<SnapshotConfigPayload | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [inputPayload, setInputPayload] = useState<{ cases?: unknown[] } | null>(null);
  const [inputLoading, setInputLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  // mount：run meta + summary（摘要卡/pill）+ config 快照（設定 view + 輸入名稱 decode）
  useEffect(() => {
    if (!runId) {
      setConfigError('網址缺少分派批次編號，請從執行歷史重新進入。');
      setConfigLoading(false);
      return;
    }
    let aborted = false;
    setInputPayload(null);
    setInputError(null);
    void (async () => {
      try {
        const r = await getRun(runId);
        if (!aborted) setRun(r);
      } catch {
        /* 資訊卡缺失不阻擋內容 */
      }
    })();
    void (async () => {
      try {
        const s = await getRunSummary(runId);
        if (!aborted) setSummary(s);
      } catch {
        /* 摘要缺失 → 卡片顯示 — */
      }
    })();
    void (async () => {
      setConfigLoading(true);
      setConfigError(null);
      try {
        const res = await getSnapshotByType(runId, 'config');
        if (!aborted) setConfigPayload(res.payload as SnapshotConfigPayload | null);
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { message?: string } } };
        if (!aborted) {
          setConfigError(
            e.response?.status === 404
              ? '找不到此份快照（可能已逾保留期或尚未建立）。'
              : e?.response?.data?.message ?? '載入快照失敗',
          );
        }
      } finally {
        if (!aborted) setConfigLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runId]);

  // 輸入名單 payload：進入該分頁時延後載入（避免非必要時載入巨量 cases）
  useEffect(() => {
    if (activeType !== 'input_list' || !runId || inputPayload) return;
    let aborted = false;
    void (async () => {
      setInputLoading(true);
      setInputError(null);
      try {
        const res = await getSnapshotByType(runId, 'input_list');
        if (!aborted) setInputPayload((res.payload as { cases?: unknown[] } | null) ?? { cases: [] });
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { message?: string } } };
        if (!aborted) {
          setInputError(
            e.response?.status === 404
              ? '找不到此份快照（可能已逾保留期或尚未建立）。'
              : e?.response?.data?.message ?? '載入快照失敗',
          );
        }
      } finally {
        if (!aborted) setInputLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [activeType, runId, inputPayload]);

  const selectTab = (type: TabKey) => {
    setActiveType(type);
    const next = new URLSearchParams(searchParams);
    next.set('type', type);
    setSearchParams(next, { replace: true });
  };

  const status = run?.status ?? '';
  const statusMeta =
    STATUS_META[status] ?? { label: status || '—', cls: 'bg-gray-100 text-gray-600', text: 'text-gray-700' };
  const retainUntil = retentionDate(run?.triggeredAt);

  const downloadPayload =
    activeType === 'config' ? configPayload : activeType === 'input_list' ? inputPayload : null;

  const tabCount = (t: TabKey): number | null => {
    if (t === 'input_list') {
      return summary?.stage1Count ?? (inputPayload?.cases?.length ?? null);
    }
    if (t === 'result') {
      return run?.totalCases ?? summary?.stage4Count ?? null;
    }
    return null;
  };

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
                    if (!downloadPayload) return;
                    const blob = new Blob([JSON.stringify(downloadPayload, null, 2)], {
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
                  disabled={!downloadPayload}
                  title={downloadPayload ? undefined : '分派結果請於「結果摘要」頁匯出 Excel'}
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
                <div className={`text-sm font-medium ${statusMeta.text}`}>{statusMeta.label}</div>
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
              <span>· {retainUntil ? `保留至 ${retainUntil}（3 年）` : '保留 3 年'}</span>
            </div>
          </div>
        )}

        {/* 分頁 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div
            className="px-5 border-b border-gray-200 flex items-center gap-1"
            data-testid="snapshot-tabs"
          >
            {(['config', 'input_list', 'result', 'pivot'] as const).map((t) => {
              const cfg = TAB_META[t];
              const Icon = cfg.icon;
              const isActive = activeType === t;
              const count = tabCount(t);
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
                  {count != null && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full tabular-nums">
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">{TAB_META[activeType].description}</p>

            {/* 設定快照 */}
            {activeType === 'config' && (
              <>
                {configLoading && (
                  <div className="p-12 text-center text-gray-400" data-testid="snapshot-loading">
                    載入中…
                  </div>
                )}
                {configError && !configLoading && (
                  <div
                    data-testid="snapshot-error"
                    className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
                  >
                    <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                    <span className="text-red-800">{configError}</span>
                  </div>
                )}
                {!configLoading && !configError && <SnapshotConfigView payload={configPayload} />}
              </>
            )}

            {/* 輸入名單 */}
            {activeType === 'input_list' && (
              <>
                {inputLoading && (
                  <div className="p-12 text-center text-gray-400" data-testid="snapshot-loading">
                    載入中…
                  </div>
                )}
                {inputError && !inputLoading && (
                  <div
                    data-testid="snapshot-error"
                    className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
                  >
                    <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                    <span className="text-red-800">{inputError}</span>
                  </div>
                )}
                {!inputLoading && !inputError && (
                  <SnapshotInputSummary
                    payload={inputPayload}
                    listDefs={configPayload?.listDefinitions}
                    summary={summary}
                    run={run}
                  />
                )}
              </>
            )}

            {/* 分派結果 */}
            {activeType === 'result' && (
              <SnapshotResultTable runId={runId} summary={summary} />
            )}

            {/* 樞紐分析 */}
            {activeType === 'pivot' && <SnapshotPivotView runId={runId} />}
          </div>
        </div>

        {/* 說明 footer */}
        <div className="flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-gray-700 mb-0.5">關於快照</p>
            <p>
              三份快照（設定 / 輸入名單 / 分派結果）為分派完成當下的唯讀紀錄，可作為稽核與問題排查依據，保留 3 年。需要完整資料可使用「下載快照檔」。
            </p>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
