import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, ListChecks } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { FieldsTab } from './_components/fields-tab';
import { OptionsTab } from './_components/options-tab';

/**
 * F050 v2.1 Phase 5d 波 3：FieldBasePage — F075 + F076 統一頁面（2-Tab 容器）
 *
 * 對應 prototype: /prototypes/37-base-code.html line 124-323
 *
 * 設計拍板（J4 / AD-E07-18 §18.1）：
 *   - 37a（pooldata-whitelist）+ 37b（categorical-field-values）合併為 37 之 2-Tab
 *   - sidebar entry「篩選欄位」(波 1) 進入此頁
 *   - 「代碼維護」（F068）已廢除，PROD_KIND / SPEC_TP / CASE_STATUS 改入 F076 options
 *
 * URL pattern：/assignment/field-base?tab=fields|options
 *   - 預設 tab=fields
 *   - useSearchParams 雙向同步
 *   - ?col=XX 為 OptionsTab 之 deep link hint（自動展開該 accordion；波 5）
 *
 * RBAC: DirectorOrSectionChiefRoute（讀），DirectorGuard（寫入由 backend 攔截）
 */

type TabKey = 'fields' | 'options';

export function FieldBasePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: TabKey = rawTab === 'options' ? 'options' : 'fields';

  const setActiveTab = (next: TabKey) => {
    // 保留其他 query params（如 ?col=...）
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', next);
    setSearchParams(newParams, { replace: true });
  };

  const breadcrumb = useMemo(
    () => (
      <nav aria-label="麵包屑" className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">客戶名單分派</span>
        <svg
          className="w-3.5 h-3.5 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-semibold text-gray-800">篩選欄位</span>
      </nav>
    ),
    [],
  );

  return (
    <AppLayout headerLeft={breadcrumb}>
      <main className="flex-1" data-testid="field-base-page">
        {/* 標題列 */}
        <div className="px-6 pt-5 pb-3">
          <h1 className="text-xl font-semibold text-gray-800">篩選欄位</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理可用於名單定義的篩選欄位與其可選值
          </p>
        </div>

        {/* Tab 導覽 */}
        <div className="px-6">
          <div className="bg-white border border-[#E5E7EB] border-b-0 rounded-t-lg">
            <div className="flex items-center px-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="tab-fields"
                  onClick={() => setActiveTab('fields')}
                  className={`relative px-4 py-3 text-sm font-medium ${
                    activeTab === 'fields'
                      ? 'text-[#2563EB] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-[#2563EB]'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  欄位管理
                </button>
                <button
                  type="button"
                  data-testid="tab-options"
                  onClick={() => setActiveTab('options')}
                  className={`relative px-4 py-3 text-sm font-medium ${
                    activeTab === 'options'
                      ? 'text-[#2563EB] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-[#2563EB]'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  可選值管理
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab panel（依 activeTab 切換） */}
        {activeTab === 'fields' ? (
          <div data-testid="panel-fields" className="px-6 pb-6">
            <div className="bg-white border border-[#E5E7EB] border-t-0 rounded-b-lg shadow-sm">
              <FieldsTab />
            </div>
          </div>
        ) : (
          <div data-testid="panel-options" className="px-6 pb-6">
            <div className="bg-white border border-[#E5E7EB] border-t-0 rounded-b-lg shadow-sm">
              <OptionsTab />
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
