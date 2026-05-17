import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ListChecks,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { MonthPicker } from '@/components/e07/MonthPicker';
import {
  listLists,
  type AssignmentListItem,
} from '@/api/assignment-list';
import { getBusinessRole } from '@/stores/auth-store';

/**
 * F088 / M03d — 準備完成名單清單（29d 模式 A）
 *
 * 對應 prototype: /prototypes/29d-ready-summary.html L177-222
 *
 * 路由：/assignment/ready-summary
 * RBAC：DirectorOrSectionChiefRoute（讀；section_chief 限自轄區）
 *
 * 主要區塊：
 *   - MonthPicker
 *   - 全部 ready 綠 banner + 執行月跑 CTA / 部分 ready 橙 banner / 無 ready 空狀態
 *   - section_chief 提示
 *   - 已 ready 名單卡片清單（依 createdAt DESC，點卡跳轉詳情）
 */

function toYYYYMMRaw(yyyyMm: string): string {
  return yyyyMm.replace('-', '');
}

function currentYmDisplay(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function ReadySummaryListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [ym, setYm] = useState(currentYmDisplay());
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<AssignmentListItem[]>([]);

  const businessRole = getBusinessRole();
  const isSectionChief = businessRole === 'section_chief';

  useEffect(() => {
    let aborted = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await listLists({ ym: toYYYYMMRaw(ym) });
        if (!aborted) setLists(data.lists ?? []);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        showToast(e?.response?.data?.message ?? '載入名單失敗', 'error');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  const readyLists = lists.filter((l) => l.stage === 'ready' && l.status === 'active');
  const notReadyLists = lists.filter(
    (l) =>
      l.status === 'active' && l.stage !== 'ready' && l.stage !== 'draft',
  );
  const totalActive = lists.filter((l) => l.status === 'active').length;
  const allReady = totalActive > 0 && readyLists.length === totalActive;
  const partial = readyLists.length > 0 && readyLists.length < totalActive;
  const noReady = readyLists.length === 0;

  const handleRunMonth = () => {
    navigate('/assignment/run');
  };

  return (
    <AppLayout
      title="準備完成名單"
      actions={<MonthPicker value={ym} onChange={setYm} />}
    >
      <main className="flex-1 p-6 space-y-4">
        {isSectionChief && (
          <div
            data-testid="section-chief-scope-banner"
            className="rounded-lg p-3 bg-purple-50 border border-purple-200 flex items-start gap-2 text-sm"
          >
            <Eye className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
            <div className="flex-1 text-purple-900">
              <p className="font-semibold">處長僅可查看自己轄區之 ready 名單</p>
              <p className="text-xs text-purple-700 mt-0.5">
                下方清單已過濾為您轄區內可見的名單；其他部門的設定僅部長 / Admin 可見。
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center text-gray-400 py-12">載入中...</div>
        )}

        {!loading && (
          <>
            {allReady && (
              <section
                data-testid="all-ready-banner"
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-green-700" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">
                        本月所有名單均已 ready · 可執行月跑
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        共 <strong>{readyLists.length}</strong> 筆名單已準備完成
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      data-testid="btn-run-month"
                      onClick={handleRunMonth}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <PlayCircle className="w-4 h-4" />
                        執行月跑
                      </span>
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {partial && (
              <section
                data-testid="partial-ready-banner"
                className="bg-amber-50/60 border border-amber-200 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm text-amber-900">
                    <p className="font-semibold">
                      本月仍有 <span>{notReadyLists.length}</span> 筆名單未進入 ready 階段，無法執行月跑
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      未 ready 名單：
                      <span className="font-mono ml-1">
                        {notReadyLists.map((l) => l.listNo).join(', ')}
                      </span>
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      請先完成上述名單的「個別業務比例」與「簽核」階段。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="btn-run-month"
                    disabled
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <PlayCircle className="w-4 h-4" />
                      執行月跑
                    </span>
                  </Button>
                </div>
              </section>
            )}

            {noReady && totalActive === 0 && (
              <section
                data-testid="no-ready-empty"
                className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <ListChecks className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">
                  本月尚無名單
                </h3>
                <p className="text-sm text-gray-500 max-w-md">
                  請先至「名單定義」建立名單，並完成五階段流程後再回到本頁執行月跑。
                </p>
              </section>
            )}

            {noReady && totalActive > 0 && (
              <section
                data-testid="no-ready-empty"
                className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">
                  本月尚無 ready 名單
                </h3>
                <p className="text-sm text-gray-500 max-w-md">
                  本月共有 {totalActive} 筆名單，但都未進入 ready 階段；請先完成各階段。
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="btn-run-month"
                  disabled
                  className="mt-4"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <PlayCircle className="w-4 h-4" />
                    執行月跑
                  </span>
                </Button>
              </section>
            )}

            {readyLists.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-800 inline-flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-green-700" />
                    已 ready 名單清單
                    <span className="text-xs text-gray-400 font-normal">
                      （依 created_at 倒序）
                    </span>
                  </h3>
                  <span className="text-xs text-gray-500">
                    共 <strong>{readyLists.length}</strong> 筆
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {readyLists.map((l) => (
                    <div
                      key={l.listNo}
                      data-testid={`ready-card-${l.listNo}`}
                      className="rounded-lg border border-gray-200 hover:border-primary hover:shadow-sm transition p-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-primary text-sm">
                            {l.listNo}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3" />
                            ready
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {l.listNm}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          建立者 {l.createdBy} · {l.createdAt.slice(0, 10)}
                        </p>
                      </div>
                      <Link
                        to={`/assignment/ready-summary/${l.listNo}`}
                        data-testid={`ready-card-link-${l.listNo}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary border border-blue-200 rounded-md hover:bg-blue-50"
                      >
                        <Eye className="w-3 h-3" />
                        查看詳情
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </AppLayout>
  );
}
