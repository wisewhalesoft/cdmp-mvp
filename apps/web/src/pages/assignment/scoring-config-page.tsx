import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CreditCard,
  Eye,
  GitFork,
  Hash,
  Info,
  Layers,
  Layers3,
  Pencil,
  Ban,
  Check,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { listCardTypes, getCardTypeStats } from '@/api/card-type';
import {
  CardType,
  CardLevelItem,
  ScoringScoreItem,
  TierMappingItem,
  createDimension,
  createTierMapping,
  deleteCardLevel,
  deleteTierMapping,
  disableDimension,
  getCardLevels,
  getScoring,
  getTierMapping,
  previewCardLevels,
  updateCardLevels,
  updateDimensions,
  updateTierMapping,
} from '@/api/assignment-scoring';
// Iter 5a 新增（F069~F072 5-Tab Shell + Tab 1）
import {
  SelectedCardTypeProvider,
  useSelectedCardType,
} from './_hooks/use-selected-card-type';
import {
  CardTypeListTab,
  ProdKindInfoBanner,
  NoCardTypeSelectedEmpty,
} from './_components/card-type-list-tab';
import { RunLockBanner } from './_components/run-lock-banner';
// Iter 5b 新增（F056 v1.5 Tab 5 改造）
import { TierMappingTabV15 } from './_components/tier-mapping-tab';
// Iter 7（review fix）：footer note 樣式對齊
// Iter 8（prototype B 排列）：拔除 VersionStrip（已刪除 _components/version-strip.tsx）。
import { ScoringConfigFooterNote } from './_components/footer-note';

/**
 * F053 / F054 / F055 / F056：計分卡設定頁
 *
 * 對應 prototype: /prototypes/28-scoring-config.html
 *
 * 結構：
 *   - 版本選擇器（cardType 切換；cardVersion 鎖 active）
 *   - 版本資訊卡片
 *   - 4 個 Tab：計分維度 / 分數設定 / CARD_LEVEL 門檻 / TIER_LEVEL 對應
 *   - Modal：新增維度、編輯/新增分數區間、新增 TIER 對應、停用維度確認
 *
 * 商業規則：
 *   - 覆寫式編輯（無草稿，BR-1）
 *   - 月跑鎖（API 回 409 SCORING_VERSION_LOCKED 時禁用按鈕）
 *   - Fallback CARD_TYPE（M5 / M3 / HC / C3，card_level=NULL）以紫色底色顯示
 */

type TabKey = 'dim' | 'score' | 'level' | 'tier';

// TAB_LABELS 為 v1.4 legacy 預留；Iter 5a 已改用 5-Tab Shell，本物件僅供 console debug。
// 標 `void` 防止 TS6133 unused-variable 警告。
void ({
  dim: '計分維度',
  score: '分數設定',
  level: 'CARD_LEVEL 門檻',
  tier: 'TIER_LEVEL 對應',
} satisfies Record<TabKey, string>);

interface ScoringDimUI {
  columnName: string;
  columnLabel: string;
  scoreSummary: string;
  scores: ScoringScoreItem[];
}

interface VersionUI {
  cardType: string;
  cardName: string | null;
  cardVersion: number;
  sdate: string;
  edate: string;
  createdBy: string | null;
  createdAt: string | null;
}

type Toast = { type: 'success' | 'error'; message: string } | null;

// =========================
// 主頁面（Iter 5a：拆分為 5-Tab Shell + Legacy Tab 2~5 內容）
//
// Shell 元件 ScoringConfigPage 提供：
//   - SelectedCardTypeProvider（context 串接 Tab 1 ↔ Tab 2~5）
//   - PROD_KIND info banner（跨 Tab 持續可見）
//   - 5-Tab 結構（Tab 1 CARD_TYPE / Tab 2~5 既有實作）
//   - Tab 2~5 依 selectedCardType 篩選資料；未選中時顯示「請先於 Tab 1 選擇計分卡類型」
//
// 既有 v1.4 4-Tab 主體保留於 ScoringConfigLegacyTabs（內含 cardType selector / dim / score / level / tier
// 等元件），Tab 2~5 直接渲染此元件；Iter 5b 會逐步移除既有 selector，改由 context 完全取代。
// =========================

export function ScoringConfigPage() {
  return (
    <SelectedCardTypeProvider>
      <ScoringConfigShell />
    </SelectedCardTypeProvider>
  );
}

type TopTabKey = 'cardtype' | 'dim' | 'score' | 'level' | 'tier';

const TOP_TAB_LABELS: Record<TopTabKey, { label: string; icon: any }> = {
  cardtype: { label: 'CARD_TYPE', icon: CreditCard },
  dim: { label: '計分維度', icon: Layers },
  score: { label: '分數設定', icon: Hash },
  level: { label: 'CARD_LEVEL 門檻', icon: BarChart3 },
  tier: { label: 'TIER_LEVEL 對應', icon: Layers3 },
};

function ScoringConfigShell() {
  const navigate = useNavigate();
  const [topTab, setTopTab] = useState<TopTabKey>('cardtype');
  const { selectedCardItem, setSelected } = useSelectedCardType();
  // Iter 5b：月跑鎖暫由 Legacy 內 fetchAll 取得；Shell 預設 false。
  // OPEN-J / OPEN-E：Iter 6+ 待整合 /assignment-run 端點查詢真實狀態，
  // 將實際 lock 狀態下傳給所有 Tab（包含 Tab 1 / Tab 5）以統一 UX。
  // Iter 7 已將 Tab 1 / Tab 5 接通 isLocked prop 通道；目前 Shell 層仍為 false，
  // Legacy 內部仍依靠 SCORING_VERSION_LOCKED 422 偵測切換 banner。
  const isLocked = false;

  // 計分維度數量（用於 Tab 計數 badge；只在已選 CARD_TYPE 時才查詢）
  const dimensionsQuery = useQuery({
    queryKey: ['scoring', selectedCardItem?.cardType, 'dimensions'],
    queryFn: () =>
      getScoring(selectedCardItem!.cardType as CardType).then(
        (s) => s.dimensions,
      ),
    enabled: !!selectedCardItem?.cardType,
    retry: false,
  });

  // CARD_TYPE 數量（用於 Tab 計數 badge）
  const cardTypesQuery = useQuery({
    queryKey: ['card-types'],
    queryFn: () => listCardTypes('active'),
    retry: false,
  });

  // Iter 9：banner KPI 5 欄統計（dim/score/level/tier/listDefsAffected）
  const statsQuery = useQuery({
    queryKey: ['card-type-stats', selectedCardItem?.cardType],
    queryFn: () => getCardTypeStats(selectedCardItem!.cardType),
    enabled: !!selectedCardItem?.cardType,
    retry: false,
  });

  // Banner stats props：當 query 未 ready 時用全 0 預設，避免 type 報錯
  const bannerStats = statsQuery.data ?? {
    cardType: selectedCardItem?.cardType ?? '',
    dimCount: 0,
    scoreCount: 0,
    levelCount: 0,
    tierCount: 0,
    listDefsAffected: 0,
  };

  // Tab 2~5 需要選中 CARD_TYPE 才能顯示內容
  const needsSelection = topTab !== 'cardtype';
  const hasSelection = !!selectedCardItem;

  const cardTypeCount = cardTypesQuery.data?.cardTypes.length;
  const dimCount = dimensionsQuery.data?.length;
  const availableCardTypes = cardTypesQuery.data?.cardTypes ?? [];

  // Iter 8（排列 B）：切換器點他張卡時，從清單找到對應 item 寫入 context
  function handleSwitchCardType(code: string) {
    const target = availableCardTypes.find((c) => c.cardType === code);
    if (target) setSelected(target);
  }

  // Iter 8（排列 B）：KPI 點擊 → 切到對應 Tab
  function handleSwitchTab(tab: 'dim' | 'score' | 'level' | 'tier') {
    setTopTab(tab);
  }

  // Iter 9：KPI 第 5 個（listdef）點擊 → 跳至名單定義頁，帶 cardType filter query
  // 註：list-definition 頁目前為 stub（AssignmentStubPage），尚未支援 cardType query 解析；
  // 先確保 URL 正確以利後續 F074 實作頁面時直接讀 query string 設預設 filter。
  function handleGoToListDefinitions(code: string) {
    navigate(`/assignment/list-definitions?cardType=${encodeURIComponent(code)}`);
  }

  return (
    <AppLayout title="計分卡設定">
      <main className="flex-1 p-6">
        {/* F069 排列 B：頂部「目前編輯中的計分卡」狀態卡（含 metadata + KPI + 切換器）
            Iter 9：stats 改 required，串接 GET /:cardType/stats；KPI 第 5 個（listdef）
            點擊 navigate 至 /assignment/list-definitions?cardType=... */}
        <ProdKindInfoBanner
          selectedCardType={selectedCardItem}
          monthRunLocked={isLocked}
          availableCardTypes={availableCardTypes}
          onSwitchCardType={handleSwitchCardType}
          stats={bannerStats}
          onSwitchTab={handleSwitchTab}
          onGoToListDefinitions={handleGoToListDefinitions}
        />

        {/* F069 AC-6：月跑鎖警告 banner */}
        <RunLockBanner isLocked={isLocked} />

        {/* 5-Tab 切換列（依 prototype 28 line 179~210 平鋪） */}
        <div className="bg-white rounded-t-lg border border-gray-200 border-b-0">
          <div className="flex items-center px-4 border-b border-gray-200">
            {(['cardtype', 'dim', 'score', 'level', 'tier'] as TopTabKey[]).map(
              (key) => {
                const { label, icon: Icon } = TOP_TAB_LABELS[key];
                const active = topTab === key;
                // review 差異 #3：CARD_TYPE / 計分維度 加 count badge
                let badge: number | undefined;
                if (key === 'cardtype') badge = cardTypeCount;
                else if (key === 'dim') badge = dimCount;
                return (
                  <button
                    key={key}
                    data-testid={`tab-${key}`}
                    onClick={() => setTopTab(key)}
                    className={
                      'px-4 py-3 text-sm font-medium border-b-2 transition ' +
                      (active
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-800')
                    }
                  >
                    <Icon className="w-3.5 h-3.5 inline mr-1" />
                    {label}
                    {badge !== undefined && (
                      <span
                        className={
                          'ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-medium rounded-full ' +
                          (active
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-gray-100 text-gray-500')
                        }
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              },
            )}
            <span className="ml-auto pr-3 text-xs text-gray-400">
              資料來源{' '}
              <code className="text-gray-500">
                ob_card_type / ob_levelcard_* / ob_tier
              </code>
            </span>
          </div>
        </div>

        {topTab === 'cardtype' && <CardTypeListTab isLocked={isLocked} />}
        {needsSelection && !hasSelection && (
          <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 shadow-sm">
            <NoCardTypeSelectedEmpty
              onSwitchToTab1={() => setTopTab('cardtype')}
            />
          </div>
        )}
        {needsSelection && hasSelection && topTab !== 'tier' && (
          // Tab 2~4 沿用 v1.4 ScoringConfigLegacyTabs 內部的 panel 邏輯
          // Iter 7 已拆解：不再渲染 AppLayout / 月跑鎖 banner / 版本選擇器 / 4-Tab 列 / footer。
          // 改由 Shell 控制這些外殼，Legacy 只渲染對應 panel + modal + toast。
          // Iter 8：移除 selectedCardItem prop（VersionStrip 已拔除）
          <ScoringConfigLegacyTabs
            forceCardType={selectedCardItem!.cardType}
            forceTab={topTab as TabKey}
          />
        )}
        {needsSelection && hasSelection && topTab === 'tier' && (
          // Iter 5b：Tab 5 採全新 v1.5 元件（互斥 / TIER 列舉 / 待遷移 badge）
          // Iter 8：移除 selectedCardItem prop（VersionStrip 已拔除）
          <TierMappingTabV15 isLocked={isLocked} />
        )}

        {/* Iter 7（review 差異 #29）：footer note 提升到 Shell，所有 Tab 都看得到 */}
        <ScoringConfigFooterNote />
      </main>
    </AppLayout>
  );
}

/**
 * v1.4 既有 4-Tab 內容（計分維度 / 分數 / CARD_LEVEL / TIER）
 * 接收 prop：
 *   - `forceCardType`：Shell 傳入 selectedCardType 時優先使用此值
 *   - `forceTab`：Iter 5b 5-Tab 平鋪後 Shell 控制當前 Tab；本元件直接渲染對應內容
 * Iter 5b：Tab 5（TIER）已由 TierMappingTabV15 取代，Shell 不再以 forceTab='tier' 呼叫此元件。
 * Iter 8：移除 selectedCardItem prop（拔除 VersionStrip）。
 */
export function ScoringConfigLegacyTabs({
  forceCardType,
  forceTab,
}: {
  forceCardType?: string;
  forceTab?: TabKey;
} = {}) {
  const [cardType, setCardTypeInternal] = useState<CardType>(
    (forceCardType as CardType) ?? 'H',
  );

  // 同步 forceCardType 變化（context 觸發 setSelected 後 Shell rerender 傳新 prop）
  useEffect(() => {
    if (forceCardType && forceCardType !== cardType) {
      setCardTypeInternal(forceCardType as CardType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceCardType]);

  // Iter 7 重構：原內部 4-Tab 列移除後，本元件不再自切 Tab；setCardType / setTab
  // 不再使用。tab 直接從 forceTab（或預設 'dim'）取值。
  const [tabInternal] = useState<TabKey>(forceTab ?? 'dim');
  const tab = forceTab ?? tabInternal;
  const [version, setVersion] = useState<VersionUI | null>(null);
  const [dimensions, setDimensions] = useState<ScoringDimUI[]>([]);
  const [levels, setLevels] = useState<CardLevelItem[]>([]);
  const [tierMappings, setTierMappings] = useState<TierMappingItem[]>([]);
  // loading state 保留用於 VersionCard placeholder 路徑（Iter 7 已改由 VersionStrip 提供）；
  // 內部 setLoading 仍保留以維持 fetchAll 既有流程，不對外暴露
  const [, setLoading] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Modals
  const [dimModalOpen, setDimModalOpen] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [disableTarget, setDisableTarget] = useState<ScoringDimUI | null>(null);

  // v1.3 / v1.4 新增：編輯 / 刪除 Modal 狀態（每列觸發）
  const [dimEditTarget, setDimEditTarget] = useState<ScoringDimUI | null>(null);
  const [scoreEditTarget, setScoreEditTarget] = useState<{
    dim: ScoringDimUI;
    scoreIdx: number;
  } | null>(null);
  const [scoreDeleteTarget, setScoreDeleteTarget] = useState<{
    dim: ScoringDimUI;
    scoreIdx: number;
  } | null>(null);
  const [levelDeleteTarget, setLevelDeleteTarget] = useState<CardLevelItem | null>(null);
  const [tierEditTarget, setTierEditTarget] = useState<TierMappingItem | null>(null);
  const [tierDeleteTarget, setTierDeleteTarget] = useState<TierMappingItem | null>(null);

  // === Toast helper ===
  function showToast(t: Toast) {
    setToast(t);
    if (t) {
      window.setTimeout(() => setToast(null), 2500);
    }
  }

  // === 載入 cardType 對應資料 ===
  const fetchAll = useCallback(async (ct: CardType) => {
    setLoading(true);
    setVersionError(null);
    try {
      const scoring = await getScoring(ct);
      setVersion(scoring.version);
      setDimensions(scoring.dimensions);

      try {
        const cl = await getCardLevels(ct);
        setLevels(cl.levels);
      } catch (e: any) {
        // 該 cardType 無 active 版本時 levels 為空
        if (e?.response?.status !== 404) throw e;
        setLevels([]);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setVersion(null);
        setDimensions([]);
        setVersionError('目前無生效的計分版本，請聯繫 IT 確認設定');
      } else {
        setVersionError(err?.response?.data?.message ?? '讀取失敗');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTier = useCallback(async () => {
    try {
      // F056 v1.5：cardType 改為必填，傳入當前選中 cardType
      const tm = await getTierMapping(cardType);
      setTierMappings(tm.mappings);
    } catch (err: any) {
      // tier-mapping 依 cardType 篩選；錯誤靜默讓 Tab 自行顯示空狀態
      if (err?.response?.status !== 401) {
        setTierMappings([]);
      }
    }
  }, [cardType]);

  useEffect(() => {
    fetchAll(cardType);
  }, [cardType, fetchAll]);

  useEffect(() => {
    fetchTier();
  }, [fetchTier]);

  // === 月跑鎖偵測（從錯誤碼推斷）===
  function checkLockFromError(err: any): boolean {
    const code = err?.response?.data?.error;
    if (code === 'SCORING_VERSION_LOCKED') {
      setIsLocked(true);
      return true;
    }
    return false;
  }

  // === 寫入操作 wrapper ===
  async function runWriteOp<T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError = '操作失敗',
  ): Promise<T> {
    try {
      const result = await op();
      showToast({ type: 'success', message: onSuccess });
      setIsLocked(false);
      return result;
    } catch (err: any) {
      if (checkLockFromError(err)) {
        showToast({
          type: 'error',
          message: '分派執行中，無法修改計分設定',
        });
      } else {
        const msg = err?.response?.data?.message ?? onError;
        showToast({ type: 'error', message: msg });
      }
      // 一律 throw 讓呼叫端 catch（Modal 不關閉 / 表單保留錯誤訊息）
      throw err;
    }
  }

  // ===== Render =====
  //
  // Iter 7 重構（review 差異 #1 / #2 / #29）：
  //   - 移除 <AppLayout>、月跑鎖 banner、版本選擇器卡片、4-Tab 列、footer note；
  //     這些外殼由 Shell（ScoringConfigShell）統一管理，避免巢狀。
  //   - 月跑鎖 banner 改由 Shell 的 <RunLockBanner> 顯示；本元件仍保留
  //     `data-testid="lock-banner"`（既有測試 F054-017 / F056-025 依此判斷），
  //     位置移到 Fragment 頂部、僅在 isLocked=true 時 render。
  //   - <VersionStrip> 改顯示在 panel 頂部（替代既有 VersionCard）；保留
  //     `version-card` / `version-sdate` / `version-edate` / `version-created-by`
  //     / `version-created-at` testid 以維持向後相容。
  //   - 404 路徑改用 VersionStrip 內建 `no-active-version` 顯示。

  return (
    <>
      {/* 月跑鎖 banner（保留 testid 給既有測試；Shell RunLockBanner 是另一個獨立 banner） */}
      {isLocked && (
        <div
          data-testid="lock-banner"
          className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-700"
        >
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-[#F59E0B]">分派執行中，無法修改計分設定</p>
            <p className="text-xs text-gray-600 mt-0.5">
              月跑期間（assignment_run.status IN pending/running）所有寫入功能將被鎖定
            </p>
          </div>
        </div>
      )}

      {/* Iter 8（prototype B 排列）：拔除 VersionStrip；版本資訊改顯示於 Shell 層的
          SelectedCardTypeBanner（含 metadata 三行 version/起訖/createdBy·createdAt）。
          404 警示保留：fetchAll 拿到 404 時 versionError 仍會被設定，此處渲染
          `no-active-version` 警示讓 Tab 2~4 的內容區呈現警告而非空表。 */}
      {versionError && (
        <div
          data-testid="no-active-version"
          className="bg-white border border-[#E5E7EB] border-t-0 rounded-b-lg shadow-sm p-4 text-sm text-gray-700 flex items-start gap-2"
        >
          <AlertTriangle className="w-5 h-5 text-[#F59E0B] mt-0.5 shrink-0" />
          <span>{versionError}</span>
        </div>
      )}

      {!versionError && (
        <>
          {tab === 'dim' && (
            <DimensionsTab
              dimensions={dimensions}
              isLocked={isLocked}
              onAdd={() => setDimModalOpen(true)}
              onEdit={(d) => setDimEditTarget(d)}
              onDisable={(d) => {
                setDisableTarget(d);
                setDisableModalOpen(true);
              }}
            />
          )}
          {tab === 'score' && (
            <ScoresTab
              dimensions={dimensions}
              isLocked={isLocked}
              onAddScore={() => setScoreModalOpen(true)}
              onEditScore={(dim, scoreIdx) =>
                setScoreEditTarget({ dim, scoreIdx })
              }
              onDeleteScore={(dim, scoreIdx) =>
                setScoreDeleteTarget({ dim, scoreIdx })
              }
            />
          )}
          {tab === 'level' && (
            <CardLevelsTab
              cardType={cardType}
              cardVersion={version?.cardVersion ?? 1}
              levels={levels}
              setLevels={setLevels}
              isLocked={isLocked}
              onSaved={() => fetchAll(cardType)}
              onDelete={(lvl) => setLevelDeleteTarget(lvl)}
              runWriteOp={runWriteOp}
            />
          )}
          {tab === 'tier' && (
            <TierMappingTab
              mappings={tierMappings}
              onAdd={() => setTierModalOpen(true)}
              onEdit={(m) => setTierEditTarget(m)}
              onDelete={(m) => setTierDeleteTarget(m)}
              isLocked={isLocked}
            />
          )}
        </>
      )}

      {/* Modals */}
      {dimModalOpen && (
        <DimensionModal
          cardType={cardType}
          cardVersion={version?.cardVersion ?? 1}
          onClose={() => setDimModalOpen(false)}
          onSaved={async () => {
            setDimModalOpen(false);
            await fetchAll(cardType);
            showToast({ type: 'success', message: '維度新增成功' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {scoreModalOpen && (
        <ScoreEditModal
          cardType={cardType}
          cardVersion={version?.cardVersion ?? 1}
          dimensions={dimensions}
          onClose={() => setScoreModalOpen(false)}
          onSaved={async () => {
            setScoreModalOpen(false);
            await fetchAll(cardType);
            showToast({ type: 'success', message: '分數區間儲存成功' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {tierModalOpen && (
        <TierAddModal
          cardType={cardType}
          levels={levels}
          onClose={() => setTierModalOpen(false)}
          onSaved={async () => {
            setTierModalOpen(false);
            await fetchTier();
            showToast({ type: 'success', message: 'TIER 對應新增成功' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {disableModalOpen && disableTarget && (
        <DisableConfirmModal
          target={disableTarget}
          cardType={cardType}
          onClose={() => {
            setDisableModalOpen(false);
            setDisableTarget(null);
          }}
          onConfirmed={async () => {
            setDisableModalOpen(false);
            setDisableTarget(null);
            await fetchAll(cardType);
            showToast({ type: 'success', message: '維度已停用' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {/* v1.3：DimensionsTab 編輯 Modal（沿用 updateDimensions 覆寫式編輯）*/}
      {dimEditTarget && (
        <DimensionEditModal
          target={dimEditTarget}
          cardType={cardType}
          cardVersion={version?.cardVersion ?? 1}
          onClose={() => setDimEditTarget(null)}
          onSaved={async () => {
            setDimEditTarget(null);
            await fetchAll(cardType);
            showToast({ type: 'success', message: '維度編輯成功' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {/* v1.3：ScoresTab 單筆 score 編輯 Modal */}
      {scoreEditTarget && (
        <ScoreSingleEditModal
          dim={scoreEditTarget.dim}
          scoreIdx={scoreEditTarget.scoreIdx}
          cardType={cardType}
          cardVersion={version?.cardVersion ?? 1}
          onClose={() => setScoreEditTarget(null)}
          onSaved={async () => {
            setScoreEditTarget(null);
            await fetchAll(cardType);
            showToast({ type: 'success', message: '分數區間更新成功' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {/* v1.3：ScoresTab 單筆 score 刪除確認 Modal */}
      {scoreDeleteTarget && (
        <ScoreDeleteConfirmModal
          dim={scoreDeleteTarget.dim}
          scoreIdx={scoreDeleteTarget.scoreIdx}
          cardType={cardType}
          cardVersion={version?.cardVersion ?? 1}
          onClose={() => setScoreDeleteTarget(null)}
          onConfirmed={async () => {
            setScoreDeleteTarget(null);
            await fetchAll(cardType);
            showToast({ type: 'success', message: '分數區間已刪除' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {/* v1.3：CardLevelsTab 刪除確認 Modal（含 AC-7 警告 + cascade 409 顯示）*/}
      {levelDeleteTarget && (
        <LevelDeleteConfirmModal
          target={levelDeleteTarget}
          cardType={cardType}
          cardVersion={version?.cardVersion ?? 1}
          onClose={() => setLevelDeleteTarget(null)}
          onConfirmed={async () => {
            setLevelDeleteTarget(null);
            await fetchAll(cardType);
            showToast({ type: 'success', message: 'CARD_LEVEL 已刪除' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {/* v1.4：TierMappingTab 編輯 Modal */}
      {tierEditTarget && (
        <TierEditModal
          target={tierEditTarget}
          onClose={() => setTierEditTarget(null)}
          onSaved={async () => {
            setTierEditTarget(null);
            await fetchTier();
            showToast({ type: 'success', message: 'TIER 對應更新成功' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {/* v1.4：TierMappingTab 刪除確認 Modal（含 fallback NULL 路徑）*/}
      {tierDeleteTarget && (
        <TierDeleteConfirmModal
          target={tierDeleteTarget}
          onClose={() => setTierDeleteTarget(null)}
          onConfirmed={async () => {
            setTierDeleteTarget(null);
            await fetchTier();
            showToast({ type: 'success', message: 'TIER 對應已刪除' });
          }}
          runWriteOp={runWriteOp}
        />
      )}

      {toast && (
        <div
          data-testid="toast"
          className={
            'fixed top-20 right-6 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium border ' +
            (toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700')
          }
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

// =========================
// 子元件
// =========================
//
// Iter 7 重構：原 `VersionCard` / `TabBtn` 已不再使用 — VersionCard 由
// `_components/version-strip.tsx` 取代；TabBtn 由 Shell 內聯 button 取代。
// 兩者已刪除以保持檔案精簡。

// =========================
// Tab 1: 計分維度
// =========================

function DimensionsTab({
  dimensions,
  isLocked,
  onAdd,
  onEdit,
  onDisable,
}: {
  dimensions: ScoringDimUI[];
  isLocked: boolean;
  onAdd: () => void;
  onEdit: (d: ScoringDimUI) => void;
  onDisable: (d: ScoringDimUI) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="bg-white rounded-b-lg border border-[#E5E7EB] border-t-0 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-gray-50/60">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">column_name</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">column_label</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">類型</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">分數區間摘要</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {dimensions.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                  無計分維度資料
                </td>
              </tr>
            )}
            {dimensions.map((d) => {
              const isExpanded = expanded[d.columnName] === true;
              const hasLevel1 = d.scores.some((s) => s.level1 !== null);
              return (
                <Fragment key={d.columnName}>
                  <tr
                    className="border-b border-[#E5E7EB] hover:bg-gray-50/50 transition cursor-pointer"
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [d.columnName]: !isExpanded,
                      }))
                    }
                    data-testid={`dim-row-${d.columnName}`}
                  >
                    <td className="px-5 py-3 font-mono text-sm font-semibold text-gray-900">
                      {d.columnName}
                    </td>
                    <td className="px-5 py-3 text-gray-700">{d.columnLabel}</td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          'inline-flex px-2 py-0.5 text-xs rounded-full ' +
                          (hasLevel1
                            ? 'bg-cyan-100 text-cyan-700'
                            : 'bg-violet-100 text-violet-700')
                        }
                      >
                        {hasLevel1 ? '類別型' : '數值型'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{d.scoreSummary}</td>
                    <td className="px-5 py-3 text-right">
                      {/* prototype 28 L1085-1093：icon-only pencil + ban，gap-1 兩顆按鈕 */}
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`edit-dim-${d.columnName}`}
                          title="編輯"
                          disabled={isLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(d);
                          }}
                          className={
                            'action-btn p-1.5 text-gray-500 hover:text-[#2563EB] hover:bg-blue-50 rounded transition ' +
                            (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                          }
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          data-testid={`disable-${d.columnName}`}
                          title="停用"
                          disabled={isLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDisable(d);
                          }}
                          className={
                            'action-btn p-1.5 text-gray-500 hover:text-[#F59E0B] hover:bg-amber-50 rounded transition ' +
                            (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                          }
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr
                      data-testid={`dim-detail-${d.columnName}`}
                      className="bg-gray-50/40"
                    >
                      <td colSpan={5} className="px-5 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left py-1 pr-3">level1</th>
                              <th className="text-left py-1 pr-3">level2_s</th>
                              <th className="text-left py-1 pr-3">level2_e</th>
                              <th className="text-right py-1">score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.scores.map((s, idx) => (
                              <tr key={idx} className="text-gray-700">
                                <td className="py-1 pr-3 font-mono">
                                  {s.level1 ?? <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-1 pr-3 font-mono">
                                  {s.level2S ?? <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-1 pr-3 font-mono">
                                  {s.level2E ?? <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-1 text-right font-semibold">{s.score}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#E5E7EB]">
        <span className="text-sm text-gray-500">共 {dimensions.length} 個維度</span>
        <button
          type="button"
          data-testid="btn-add-dim"
          onClick={onAdd}
          disabled={isLocked}
          className={
            'inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-sm ' +
            (isLocked ? 'opacity-50 cursor-not-allowed' : '')
          }
        >
          <Plus className="w-3.5 h-3.5" />
          新增維度
        </button>
      </div>
    </div>
  );
}

// =========================
// Tab 2: 分數設定（彙整唯讀）
// =========================

function ScoresTab({
  dimensions,
  isLocked,
  onAddScore,
  onEditScore,
  onDeleteScore,
}: {
  dimensions: ScoringDimUI[];
  isLocked: boolean;
  onAddScore: () => void;
  onEditScore: (dim: ScoringDimUI, scoreIdx: number) => void;
  onDeleteScore: (dim: ScoringDimUI, scoreIdx: number) => void;
}) {
  const [filterColumn, setFilterColumn] = useState<string>('ALL');

  // 攜帶 source dim + scoreIdx 以便編輯 / 刪除走整批覆寫式 PUT
  const flatRows = useMemo(() => {
    const rows: Array<{
      dim: ScoringDimUI;
      scoreIdx: number;
      columnName: string;
      level1: string | null;
      level2S: string | null;
      level2E: string | null;
      score: number;
    }> = [];
    dimensions.forEach((d) => {
      if (filterColumn !== 'ALL' && d.columnName !== filterColumn) return;
      d.scores.forEach((s, scoreIdx) => {
        rows.push({
          dim: d,
          scoreIdx,
          columnName: d.columnName,
          level1: s.level1,
          level2S: s.level2S,
          level2E: s.level2E,
          score: s.score,
        });
      });
    });
    return rows;
  }, [dimensions, filterColumn]);

  return (
    <div className="bg-white rounded-b-lg border border-[#E5E7EB] border-t-0 shadow-sm">
      <div className="px-4 py-3 border-b border-[#E5E7EB] bg-gray-50/40 flex items-center gap-3">
        <label className="text-xs text-gray-500">維度欄位</label>
        <div className="relative">
          <select
            value={filterColumn}
            onChange={(e) => setFilterColumn(e.target.value)}
            className="pl-3 pr-8 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
          >
            <option value="ALL">全部維度</option>
            {dimensions.map((d) => (
              <option key={d.columnName} value={d.columnName}>
                {d.columnName}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <span className="ml-auto text-xs text-gray-400">
          資料表 <code>ob_levelcard_score</code>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-gray-50/60">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">column_name</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">level1</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">level2_s</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">level2_e</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">score</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                  無分數區間資料
                </td>
              </tr>
            )}
            {flatRows.map((r, idx) => (
              <tr key={idx} className="border-b border-[#E5E7EB]">
                <td className="px-5 py-2 font-mono text-xs text-gray-700">{r.columnName}</td>
                <td className="px-5 py-2 font-mono text-xs">
                  {r.level1 ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-2 font-mono text-xs">
                  {r.level2S ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-2 font-mono text-xs">
                  {r.level2E ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-2 text-right font-semibold">{r.score}</td>
                <td className="px-5 py-2 text-right">
                  {/* prototype 28 L1127-1131：pencil + trash icon-only */}
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      data-testid={`edit-score-${idx}`}
                      title="編輯分數區間"
                      disabled={isLocked}
                      onClick={() => onEditScore(r.dim, r.scoreIdx)}
                      className={
                        'action-btn p-1.5 text-gray-500 hover:text-[#2563EB] hover:bg-blue-50 rounded transition ' +
                        (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                      }
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      data-testid={`delete-score-${idx}`}
                      title="刪除分數區間"
                      disabled={isLocked}
                      onClick={() => onDeleteScore(r.dim, r.scoreIdx)}
                      className={
                        'action-btn p-1.5 text-gray-500 hover:text-[#EF4444] hover:bg-red-50 rounded transition ' +
                        (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-[#E5E7EB] flex items-center justify-between">
        <p className="text-xs text-gray-500">
          <Info className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
          類別型 (level1) 與數值型 (level2_s ~ level2_e) 為二擇一；數值區間不可重疊（BR-3）
        </p>
        <button
          type="button"
          data-testid="btn-add-score"
          onClick={onAddScore}
          disabled={isLocked || dimensions.length === 0}
          className={
            'inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-sm ' +
            (isLocked || dimensions.length === 0
              ? 'opacity-50 cursor-not-allowed'
              : '')
          }
        >
          <Plus className="w-3.5 h-3.5" />
          新增分數區間
        </button>
      </div>
    </div>
  );
}

// =========================
// Tab 3: CARD_LEVEL 門檻
// =========================

interface LevelDraft {
  cardLevel: string;
  scoreS: string;
  scoreE: string;
}

function CardLevelsTab({
  cardType,
  cardVersion,
  levels,
  setLevels,
  isLocked,
  onSaved,
  onDelete,
  runWriteOp,
}: {
  cardType: CardType;
  cardVersion: number;
  levels: CardLevelItem[];
  setLevels: (l: CardLevelItem[]) => void;
  isLocked: boolean;
  onSaved: () => void;
  onDelete: (lvl: CardLevelItem) => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [drafts, setDrafts] = useState<LevelDraft[]>([]);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(
      levels.map((l) => ({
        cardLevel: l.cardLevel,
        scoreS: String(l.scoreS),
        scoreE: String(l.scoreE),
      })),
    );
    setPreview(null);
    setErrorMap({});
  }, [levels]);

  // debounce preview
  useEffect(() => {
    if (drafts.length === 0) return;
    const valid = drafts.every(
      (d) =>
        d.scoreS !== '' &&
        d.scoreE !== '' &&
        !Number.isNaN(Number(d.scoreS)) &&
        !Number.isNaN(Number(d.scoreE)),
    );
    if (!valid) return;

    const t = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await previewCardLevels(
          cardType,
          drafts.map((d) => ({
            cardLevel: d.cardLevel,
            scoreS: Number(d.scoreS),
            scoreE: Number(d.scoreE),
          })),
        );
        setPreview(res.distribution);
      } catch {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [drafts, cardType]);

  function updateDraft(idx: number, patch: Partial<LevelDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setErrorMap({});
    const payloadLevels = drafts.map((d) => ({
      cardLevel: d.cardLevel,
      scoreS: Number(d.scoreS),
      scoreE: Number(d.scoreE),
    }));
    try {
      await runWriteOp(
        () =>
          updateCardLevels({ cardType, cardVersion, levels: payloadLevels }),
        '門檻儲存成功',
      );
      setLevels(payloadLevels);
      onSaved();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'SCORING_RANGE_OVERLAP') {
        // 標記所有等級為紅框（簡化：使用者自行查看是哪一筆）
        const m: Record<string, string> = {};
        drafts.forEach((d) => {
          m[d.cardLevel] = '與其他等級區間重疊，請調整';
        });
        setErrorMap(m);
      }
    }
  }

  const distributionTotal = useMemo(
    () =>
      preview
        ? Object.values(preview).reduce((sum, v) => sum + v, 0)
        : null,
    [preview],
  );

  return (
    <div className="bg-white rounded-b-lg border border-[#E5E7EB] border-t-0 shadow-sm">
      <div className="grid grid-cols-3 gap-0">
        <div className="col-span-2 border-r border-[#E5E7EB]">
          <div className="px-4 py-3 border-b border-[#E5E7EB] bg-gray-50/40 flex items-center gap-3">
            <h4 className="text-sm font-semibold text-gray-700">
              總分區間 → CARD_LEVEL 對應
            </h4>
            <span className="text-xs text-gray-400 ml-auto">
              資料表 <code>ob_levelcard_level</code>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">card_level</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">score_s（下限）</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">score_e（上限）</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {drafts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-400 text-sm">
                      無 CARD_LEVEL 資料
                    </td>
                  </tr>
                )}
                {drafts.map((d, idx) => {
                  const err = errorMap[d.cardLevel];
                  return (
                    <tr key={d.cardLevel} className="border-b border-[#E5E7EB]">
                      <td className="px-5 py-2">
                        <span
                          className={
                            'inline-flex items-center justify-center w-8 h-8 text-sm font-semibold rounded-md ' +
                            (d.cardLevel === 'A'
                              ? 'bg-emerald-100 text-emerald-700'
                              : d.cardLevel === 'B'
                                ? 'bg-blue-100 text-blue-700'
                                : d.cardLevel === 'C'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-100 text-rose-700')
                          }
                        >
                          {d.cardLevel}
                        </span>
                      </td>
                      <td className="px-5 py-2">
                        <input
                          type="number"
                          data-testid={`level-${d.cardLevel}-scoreS`}
                          value={d.scoreS}
                          onChange={(e) =>
                            updateDraft(idx, { scoreS: e.target.value })
                          }
                          disabled={isLocked}
                          className={
                            'w-24 px-2 py-1 text-sm border rounded font-mono ' +
                            (err
                              ? 'border-[#EF4444] ring-1 ring-[#EF4444]/30'
                              : 'border-[#E5E7EB]') +
                            (isLocked ? ' bg-gray-50 cursor-not-allowed' : '')
                          }
                        />
                      </td>
                      <td className="px-5 py-2">
                        <input
                          type="number"
                          data-testid={`level-${d.cardLevel}-scoreE`}
                          value={d.scoreE}
                          onChange={(e) =>
                            updateDraft(idx, { scoreE: e.target.value })
                          }
                          disabled={isLocked}
                          className={
                            'w-24 px-2 py-1 text-sm border rounded font-mono ' +
                            (err
                              ? 'border-[#EF4444] ring-1 ring-[#EF4444]/30'
                              : 'border-[#E5E7EB]') +
                            (isLocked ? ' bg-gray-50 cursor-not-allowed' : '')
                          }
                        />
                      </td>
                      <td className="px-5 py-2 text-right">
                        {/* prototype 28 L1147-1151：每列 check 單列儲存（觸發整批 PUT，與 spec 5.1 三欄複合鍵 UPDATE 語意一致）；v1.3 新增 trash */}
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`save-level-${d.cardLevel}`}
                            title="儲存此列"
                            disabled={isLocked}
                            onClick={() => handleSave()}
                            className={
                              'action-btn p-1.5 text-gray-500 hover:text-[#2563EB] hover:bg-blue-50 rounded transition ' +
                              (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                            }
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-level-${d.cardLevel}`}
                            title="刪除此等級"
                            disabled={isLocked}
                            onClick={() =>
                              onDelete({
                                cardLevel: d.cardLevel,
                                scoreS: Number(d.scoreS),
                                scoreE: Number(d.scoreE),
                              })
                            }
                            className={
                              'action-btn p-1.5 text-gray-500 hover:text-[#EF4444] hover:bg-red-50 rounded transition ' +
                              (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#E5E7EB] flex items-center justify-between">
            {Object.keys(errorMap).length > 0 ? (
              <p
                data-testid="level-overlap-warn"
                className="text-xs text-[#EF4444] flex items-center gap-1.5"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>等級間區間重疊，請調整</span>
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                <Info className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                相鄰等級 score_e + 1 = 下一級 score_s（BR-1）
              </p>
            )}
            <button
              type="button"
              data-testid="btn-save-levels"
              onClick={handleSave}
              disabled={isLocked || drafts.length === 0}
              className={
                'inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-sm ' +
                (isLocked || drafts.length === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : '')
              }
            >
              <Save className="w-3.5 h-3.5" />
              儲存門檻
            </button>
          </div>
        </div>

        {/* Preview */}
        <div>
          <div className="px-4 py-3 border-b border-[#E5E7EB] bg-blue-50/30">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#2563EB]" />
              預估各等級分佈
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              基於目前 ob_pool_data_list（debounce 300ms）
            </p>
          </div>
          <div className="p-5 space-y-3" data-testid="preview-distribution">
            {previewLoading && (
              <p className="text-xs text-gray-400">計算中...</p>
            )}
            {!previewLoading && preview &&
              drafts.map((d) => {
                const count = preview[d.cardLevel] ?? 0;
                const pct = distributionTotal && distributionTotal > 0
                  ? Math.round((count / distributionTotal) * 100)
                  : 0;
                const dotBar =
                  d.cardLevel === 'A'
                    ? 'bg-emerald-500'
                    : d.cardLevel === 'B'
                      ? 'bg-blue-500'
                      : d.cardLevel === 'C'
                        ? 'bg-amber-500'
                        : 'bg-rose-500';
                return (
                  <div key={d.cardLevel}>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <span className={`w-2.5 h-2.5 rounded-full ${dotBar}`} />
                        {d.cardLevel} 級
                      </span>
                      <span
                        data-testid={`preview-${d.cardLevel}`}
                        className="font-semibold text-gray-900 tabular-nums"
                      >
                        {count.toLocaleString()} 人
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
                      <div
                        className={`h-2 ${dotBar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {!previewLoading && !preview && drafts.length > 0 && (
              <p className="text-xs text-gray-400">無預覽資料</p>
            )}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between text-xs text-gray-500">
              <span>樣本來源</span>
              <span data-testid="preview-source" className="font-mono">
                ob_pool_data n = {distributionTotal ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================
// Tab 4: TIER_LEVEL 對應
// =========================

function TierMappingTab({
  mappings,
  onAdd,
  onEdit,
  onDelete,
  isLocked,
}: {
  mappings: TierMappingItem[];
  onAdd: () => void;
  onEdit: (m: TierMappingItem) => void;
  onDelete: (m: TierMappingItem) => void;
  isLocked: boolean;
}) {
  return (
    <div className="bg-white rounded-b-lg border border-[#E5E7EB] border-t-0 shadow-sm">
      <div className="px-4 py-3 border-b border-[#E5E7EB] bg-gray-50/40 flex items-center gap-3">
        <h4 className="text-sm font-semibold text-gray-700">
          CARD_TYPE × CARD_LEVEL → TIER_LEVEL
        </h4>
        <span className="text-xs text-gray-400">
          資料表 <code>ob_tier</code> · PK (card_type, card_level)
        </span>
        <button
          type="button"
          data-testid="btn-add-tier"
          onClick={onAdd}
          disabled={isLocked}
          className={
            'ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-sm ' +
            (isLocked ? 'opacity-50 cursor-not-allowed' : '')
          }
        >
          <Plus className="w-3.5 h-3.5" />
          新增對應
        </button>
      </div>
      <div
        data-testid="fallback-banner"
        className="mx-4 mt-3 mb-1 flex items-start gap-2 p-3 bg-purple-50/60 border border-purple-200 rounded-lg text-xs text-gray-700"
      >
        <GitFork className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-purple-700">Fallback 規則說明</p>
          <p className="text-gray-600 mt-0.5">
            當 CARD_TYPE 為計分卡體系外（如 <code>M5</code> / <code>M3</code> /
            <code>HC</code> / <code>C3</code>，於 ob_levelcard_version 無對應版本），
            CARD_LEVEL 留空（NULL）即為 fallback 規則 — 不分等級直接對應 TIER_LEVEL（如 M5 → T5M）。
            表中以紫色底色與「Fallback」標籤區分。
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-gray-50/60">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">card_type</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">card_level</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">tier_level</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">
                list_nm（描述性）
              </th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">類型</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                  無對應資料
                </td>
              </tr>
            )}
            {mappings.map((m) => {
              const isFallback = m.cardLevel === null;
              return (
                <tr
                  key={`${m.cardType}|${m.cardLevel ?? '_null'}`}
                  data-testid={`tier-row-${m.cardType}-${m.cardLevel ?? 'null'}`}
                  className={
                    'border-b border-[#E5E7EB] ' +
                    (isFallback ? 'bg-purple-50/60' : 'hover:bg-gray-50/50')
                  }
                >
                  <td className="px-5 py-3">
                    <span
                      className={
                        'inline-flex px-2 py-0.5 text-xs font-mono font-semibold rounded ' +
                        (isFallback
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700')
                      }
                    >
                      {m.cardType}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-sm">
                    {m.cardLevel ?? <span className="text-purple-500 italic">NULL</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex px-2 py-0.5 text-xs font-mono font-semibold rounded bg-blue-100 text-blue-700">
                      {m.tierLevel}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {m.listNm ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {isFallback ? (
                      <span
                        data-testid={`fallback-badge-${m.cardType}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700"
                      >
                        <GitFork className="w-3 h-3" />
                        Fallback
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                        標準
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {/* prototype 28 L1168-1173：pencil + trash 操作按鈕 */}
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        data-testid={`edit-tier-${m.cardType}-${m.cardLevel ?? 'null'}`}
                        title="編輯對應"
                        disabled={isLocked}
                        onClick={() => onEdit(m)}
                        className={
                          'action-btn p-1.5 text-gray-500 hover:text-[#2563EB] hover:bg-blue-50 rounded transition ' +
                          (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                        }
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        data-testid={`delete-tier-${m.cardType}-${m.cardLevel ?? 'null'}`}
                        title="刪除對應"
                        disabled={isLocked}
                        onClick={() => onDelete(m)}
                        className={
                          'action-btn p-1.5 text-gray-500 hover:text-[#EF4444] hover:bg-red-50 rounded transition ' +
                          (isLocked ? 'opacity-30 cursor-not-allowed' : '')
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-[#E5E7EB] flex items-center justify-between">
        <span className="text-sm text-gray-500">共 {mappings.length} 筆對應</span>
        <p className="text-xs text-gray-500">
          <Info className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
          月跑 Stage 2 完成 CARD_LEVEL 計算後依此表 join 寫入 ob_pool_data_list.tier_level
        </p>
      </div>
    </div>
  );
}

// =========================
// Modals
// =========================

function DimensionModal({
  cardType,
  cardVersion,
  onClose,
  onSaved,
  runWriteOp,
}: {
  cardType: CardType;
  cardVersion: number;
  onClose: () => void;
  onSaved: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [columnName, setColumnName] = useState('');
  const [columnLabel, setColumnLabel] = useState('');
  const [scores, setScores] = useState<ScoringScoreItem[]>([
    { level1: null, level2S: '0', level2E: '99', score: 10 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function updateScore(idx: number, patch: Partial<ScoringScoreItem>) {
    setScores((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }

  async function handleSubmit() {
    setFormError(null);
    if (!columnName || !columnLabel) {
      setFormError('columnName 與 columnLabel 為必填');
      return;
    }
    setSubmitting(true);
    try {
      await runWriteOp(
        () =>
          createDimension({
            cardType,
            cardVersion,
            columnName,
            columnLabel,
            scores,
          }),
        '維度新增成功',
      );
      onSaved();
    } catch (err: any) {
      // Modal 不關閉，僅顯示錯誤訊息（422 場景）
      setFormError(err?.response?.data?.message ?? '新增失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="dim-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-semibold text-gray-900">新增計分維度</h3>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                column_name <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                maxLength={30}
                placeholder="例：CONTRACT_YEARS"
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
              <p className="text-xs text-gray-400 mt-1">最多 30 字元（VARCHAR(30)）</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                column_label <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                value={columnLabel}
                onChange={(e) => setColumnLabel(e.target.value)}
                maxLength={30}
                placeholder="例：契約年資"
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">初始分數區間</p>
              <div className="space-y-2">
                {scores.map((s, idx) => (
                  <ScoreRowEditor
                    key={idx}
                    score={s}
                    onChange={(patch) => updateScore(idx, patch)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setScores((prev) => [
                    ...prev,
                    { level1: null, level2S: '0', level2E: '99', score: 10 },
                  ])
                }
                className="mt-2 text-xs text-[#2563EB] hover:underline"
              >
                + 新增區間
              </button>
            </div>

            {formError && (
              <div
                data-testid="dim-modal-error"
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="dim-modal-submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '確認新增'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreRowEditor({
  score,
  onChange,
}: {
  score: ScoringScoreItem;
  onChange: (patch: Partial<ScoringScoreItem>) => void;
}) {
  // 類別型 vs 數值型二擇一
  const mode: 'cat' | 'num' = score.level1 !== null ? 'cat' : 'num';
  return (
    <div className="border border-[#E5E7EB] rounded-md p-2 grid grid-cols-5 gap-2 items-end">
      <div>
        <label className="block text-[10px] text-gray-500 mb-1">類型</label>
        <select
          value={mode}
          onChange={(e) => {
            if (e.target.value === 'cat') {
              onChange({ level1: '', level2S: null, level2E: null });
            } else {
              onChange({ level1: null, level2S: '0', level2E: '99' });
            }
          }}
          className="w-full px-1 py-1 text-xs border border-[#E5E7EB] rounded"
        >
          <option value="num">數值型</option>
          <option value="cat">類別型</option>
        </select>
      </div>
      {mode === 'cat' ? (
        <div className="col-span-3">
          <label className="block text-[10px] text-gray-500 mb-1">level1</label>
          <input
            type="text"
            value={score.level1 ?? ''}
            onChange={(e) => onChange({ level1: e.target.value })}
            maxLength={10}
            className="w-full px-1 py-1 text-xs border border-[#E5E7EB] rounded font-mono"
          />
        </div>
      ) : (
        <>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">level2_s</label>
            <input
              type="text"
              value={score.level2S ?? ''}
              onChange={(e) => onChange({ level2S: e.target.value })}
              maxLength={10}
              className="w-full px-1 py-1 text-xs border border-[#E5E7EB] rounded font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">level2_e</label>
            <input
              type="text"
              value={score.level2E ?? ''}
              onChange={(e) => onChange({ level2E: e.target.value })}
              maxLength={10}
              className="w-full px-1 py-1 text-xs border border-[#E5E7EB] rounded font-mono"
            />
          </div>
          <div />
        </>
      )}
      <div>
        <label className="block text-[10px] text-gray-500 mb-1">score</label>
        <input
          type="number"
          value={score.score}
          onChange={(e) => onChange({ score: Number(e.target.value) })}
          className="w-full px-1 py-1 text-xs border border-[#E5E7EB] rounded text-right"
        />
      </div>
    </div>
  );
}

function ScoreEditModal({
  cardType,
  cardVersion,
  dimensions,
  onClose,
  onSaved,
  runWriteOp,
}: {
  cardType: CardType;
  cardVersion: number;
  dimensions: ScoringDimUI[];
  onClose: () => void;
  onSaved: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  // 簡化：透過此 Modal 可選擇現有維度並覆寫 scores
  const [selectedColumn, setSelectedColumn] = useState<string>(
    dimensions[0]?.columnName ?? '',
  );
  const dim = dimensions.find((d) => d.columnName === selectedColumn);
  const [scores, setScores] = useState<ScoringScoreItem[]>(dim?.scores ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setScores(dim?.scores ?? []);
  }, [dim]);

  async function handleSubmit() {
    if (!dim) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await runWriteOp(
        () =>
          updateDimensions({
            cardType,
            cardVersion,
            dimensions: [
              {
                columnName: dim.columnName,
                columnLabel: dim.columnLabel,
                scores,
              },
            ],
          }),
        '分數區間儲存成功',
      );
      onSaved();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onClose()} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-semibold text-gray-900">編輯分數區間</h3>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                column_name
              </label>
              <select
                value={selectedColumn}
                onChange={(e) => setSelectedColumn(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg bg-white"
              >
                {dimensions.map((d) => (
                  <option key={d.columnName} value={d.columnName}>
                    {d.columnName} — {d.columnLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              {scores.map((s, idx) => (
                <ScoreRowEditor
                  key={idx}
                  score={s}
                  onChange={(patch) =>
                    setScores((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
                    )
                  }
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  setScores((prev) => [
                    ...prev,
                    { level1: null, level2S: '0', level2E: '99', score: 10 },
                  ])
                }
                className="text-xs text-[#2563EB] hover:underline"
              >
                + 新增區間
              </button>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-gray-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
              <span>
                類別型 (level1) 與數值型 (level2_s ~ level2_e) 為二擇一；數值區間不可與既有區間重疊；違反時 422{' '}
                <code>SCORING_RANGE_OVERLAP</code>
              </span>
            </div>
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierAddModal({
  cardType,
  levels,
  onClose,
  onSaved,
  runWriteOp,
}: {
  cardType: CardType;
  levels: CardLevelItem[];
  onClose: () => void;
  onSaved: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [formCardType, setFormCardType] = useState<string>(cardType);
  const [formCardLevel, setFormCardLevel] = useState<string>('');
  const [tierLevel, setTierLevel] = useState('');
  const [listNm, setListNm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!formCardType || !tierLevel) {
      setFormError('card_type 與 tier_level 為必填');
      return;
    }
    setSubmitting(true);
    try {
      await runWriteOp(
        () =>
          createTierMapping({
            cardType: formCardType,
            cardLevel: formCardLevel === '' ? null : formCardLevel,
            tierLevel,
            listNm: listNm || null,
          }),
        'TIER 對應新增成功',
      );
      onSaved();
    } catch (err: any) {
      // 422 Modal 不關閉
      setFormError(err?.response?.data?.message ?? '新增失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="tier-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-semibold text-gray-900">新增 TIER_LEVEL 對應</h3>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  card_type <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  type="text"
                  value={formCardType}
                  onChange={(e) => setFormCardType(e.target.value)}
                  maxLength={5}
                  placeholder="H / S / E / M5 / M3 / HC / C3"
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">VARCHAR(5)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  card_level（留空 = fallback）
                </label>
                <select
                  data-testid="tier-modal-cardlevel"
                  value={formCardLevel}
                  onChange={(e) => setFormCardLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono bg-white"
                >
                  <option value="">（fallback / NULL）</option>
                  {levels.map((l) => (
                    <option key={l.cardLevel} value={l.cardLevel}>
                      {l.cardLevel}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                  <GitFork className="w-3 h-3" />
                  留空 = fallback 規則
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                tier_level <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                value={tierLevel}
                onChange={(e) => setTierLevel(e.target.value)}
                maxLength={5}
                placeholder="例：T1 / T2 / T5M / THC"
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">VARCHAR(5)，業務方自由定義</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                list_nm（optional）
              </label>
              <input
                type="text"
                value={listNm}
                onChange={(e) => setListNm(e.target.value)}
                maxLength={30}
                placeholder="例：高資產卡 A 級"
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg"
              />
              <p className="text-xs text-gray-400 mt-1">最多 30 字元，不參與 PK 與 join</p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-gray-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
              <div>
                <p>
                  (card_type, card_level) 重複時：422 <code>TIER_LEVEL_DUPLICATE</code>
                </p>
                <p className="mt-1">
                  非 fallback 場景下，CARD_LEVEL 必須存在於 active 版本：422{' '}
                  <code>CARD_LEVEL_NOT_FOUND_IN_VERSION</code>
                </p>
              </div>
            </div>

            {formError && (
              <div
                data-testid="tier-modal-error"
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="tier-modal-submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '確認新增'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DisableConfirmModal({
  target,
  cardType,
  onClose,
  onConfirmed,
  runWriteOp,
}: {
  target: ScoringDimUI;
  cardType: CardType;
  onClose: () => void;
  onConfirmed: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await runWriteOp(
        () => disableDimension(cardType, target.columnName),
        '維度已停用',
      );
      onConfirmed();
    } catch {
      // 月跑鎖等錯誤已透過 toast 顯示
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="disable-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-md relative"
        >
          <div className="px-6 pt-6 pb-2 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-[#F59E0B]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">停用計分維度</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              確定停用維度{' '}
              <code className="font-mono font-semibold text-gray-800">
                {target.columnName}
              </code>
              <br />
              「<span className="font-semibold text-gray-800">{target.columnLabel}</span>」？
            </p>
          </div>
          <div className="px-6 pb-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-gray-700">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-[#F59E0B] mb-1">軟刪除（status=inactive）</p>
                  <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                    <li>停用後計分頁面不再顯示此維度</li>
                    <li>fn_calc_tier_level 透過 status='active' 過濾</li>
                    <li>寫入 assignment_audit_log（action=DISABLE）</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="disable-modal-confirm"
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#F59E0B] rounded-lg hover:bg-amber-600 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '確認停用'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================
// v1.3 / v1.4 新增 Modals：編輯 / 刪除流程
// =========================

/** F054：每列 pencil → 編輯既有維度（修改 columnLabel + 整批 scores） */
function DimensionEditModal({
  target,
  cardType,
  cardVersion,
  onClose,
  onSaved,
  runWriteOp,
}: {
  target: ScoringDimUI;
  cardType: CardType;
  cardVersion: number;
  onClose: () => void;
  onSaved: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [columnLabel, setColumnLabel] = useState(target.columnLabel);
  const [scores, setScores] = useState<ScoringScoreItem[]>(target.scores);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function updateScore(idx: number, patch: Partial<ScoringScoreItem>) {
    setScores((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }

  async function handleSubmit() {
    setFormError(null);
    if (!columnLabel) {
      setFormError('columnLabel 為必填');
      return;
    }
    setSubmitting(true);
    try {
      await runWriteOp(
        () =>
          updateDimensions({
            cardType,
            cardVersion,
            dimensions: [
              {
                columnName: target.columnName,
                columnLabel,
                scores,
              },
            ],
          }),
        '維度編輯成功',
      );
      onSaved();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? '編輯失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="dim-edit-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-semibold text-gray-900">編輯計分維度</h3>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                column_name（不可修改）
              </label>
              <input
                type="text"
                value={target.columnName}
                readOnly
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                column_label <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                data-testid="dim-edit-label"
                value={columnLabel}
                onChange={(e) => setColumnLabel(e.target.value)}
                maxLength={30}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">分數區間</p>
              <div className="space-y-2">
                {scores.map((s, idx) => (
                  <ScoreRowEditor
                    key={idx}
                    score={s}
                    onChange={(patch) => updateScore(idx, patch)}
                  />
                ))}
              </div>
            </div>
            {formError && (
              <div
                data-testid="dim-edit-error"
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="dim-edit-submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** F054：單筆 score 編輯 Modal（前端組整批 scores 走 updateDimensions） */
function ScoreSingleEditModal({
  dim,
  scoreIdx,
  cardType,
  cardVersion,
  onClose,
  onSaved,
  runWriteOp,
}: {
  dim: ScoringDimUI;
  scoreIdx: number;
  cardType: CardType;
  cardVersion: number;
  onClose: () => void;
  onSaved: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [draft, setDraft] = useState<ScoringScoreItem>({ ...dim.scores[scoreIdx] });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    setSubmitting(true);
    try {
      const newScores = dim.scores.map((s, i) => (i === scoreIdx ? draft : s));
      await runWriteOp(
        () =>
          updateDimensions({
            cardType,
            cardVersion,
            dimensions: [
              {
                columnName: dim.columnName,
                columnLabel: dim.columnLabel,
                scores: newScores,
              },
            ],
          }),
        '分數區間更新成功',
      );
      onSaved();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="score-edit-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-md relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-semibold text-gray-900">編輯分數區間</h3>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-3">
            <p className="text-xs text-gray-500">
              維度 <code className="font-mono text-gray-700">{dim.columnName}</code>
              （{dim.columnLabel}）的第 {scoreIdx + 1} 個區間
            </p>
            <ScoreRowEditor
              score={draft}
              onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                score 分數
              </label>
              <input
                type="number"
                data-testid="score-edit-score"
                value={draft.score}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, score: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono"
              />
            </div>
            {formError && (
              <div
                data-testid="score-edit-error"
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="score-edit-submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** F054：單筆 score 刪除確認 Modal（重組剩餘 scores 走 updateDimensions） */
function ScoreDeleteConfirmModal({
  dim,
  scoreIdx,
  cardType,
  cardVersion,
  onClose,
  onConfirmed,
  runWriteOp,
}: {
  dim: ScoringDimUI;
  scoreIdx: number;
  cardType: CardType;
  cardVersion: number;
  onClose: () => void;
  onConfirmed: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const target = dim.scores[scoreIdx];

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const newScores = dim.scores.filter((_, i) => i !== scoreIdx);
      await runWriteOp(
        () =>
          updateDimensions({
            cardType,
            cardVersion,
            dimensions: [
              {
                columnName: dim.columnName,
                columnLabel: dim.columnLabel,
                scores: newScores,
              },
            ],
          }),
        '分數區間已刪除',
      );
      onConfirmed();
    } catch {
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="score-delete-confirm-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-md relative"
        >
          <div className="px-6 pt-6 pb-2 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-[#EF4444]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              刪除分數區間
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              確定刪除維度{' '}
              <code className="font-mono font-semibold text-gray-800">
                {dim.columnName}
              </code>{' '}
              的此區間？
            </p>
            <p className="text-xs text-gray-500 mt-2 font-mono">
              {target.level1 ?? '—'} / {target.level2S ?? '—'} ~{' '}
              {target.level2E ?? '—'} = {target.score}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="score-delete-confirm"
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#EF4444] rounded-lg hover:bg-red-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '確認刪除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** F055 v1.3：CARD_LEVEL 刪除確認 Modal（含 AC-7 警告 + 409 CARD_LEVEL_REFERENCED 顯示） */
function LevelDeleteConfirmModal({
  target,
  cardType,
  cardVersion,
  onClose,
  onConfirmed,
  runWriteOp,
}: {
  target: CardLevelItem;
  cardType: CardType;
  cardVersion: number;
  onClose: () => void;
  onConfirmed: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConfirm() {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await runWriteOp(
        () => deleteCardLevel(cardType, cardVersion, target.cardLevel),
        'CARD_LEVEL 已刪除',
      );
      onConfirmed();
    } catch (err: any) {
      // AC-7：409 CARD_LEVEL_REFERENCED 在對話框 inline 顯示，不關閉
      const code = err?.response?.data?.error;
      const msg = err?.response?.data?.message;
      if (code === 'CARD_LEVEL_REFERENCED') {
        setErrorMsg(
          msg ??
            '此 CARD_LEVEL 仍被 TIER_LEVEL 對應引用，請先於 F056 移除對應後再刪除',
        );
      } else if (code === 'CARD_LEVEL_RECORD_NOT_FOUND') {
        setErrorMsg(msg ?? '此 CARD_LEVEL 紀錄不存在（可能已被其他人刪除）');
      } else {
        // 月跑鎖 / auth 等其他錯誤由 runWriteOp 的 toast 處理；對話框關閉
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="level-delete-confirm-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-md relative"
        >
          <div className="px-6 pt-6 pb-2 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-[#EF4444]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              刪除 CARD_LEVEL 等級
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              確定刪除等級{' '}
              <code className="font-mono font-semibold text-gray-800">
                {target.cardLevel}
              </code>
              （{target.scoreS} ~ {target.scoreE} 分）？
            </p>
          </div>
          <div className="px-6 pb-2">
            {/* AC-7 警告（規格指定文字：月跑 Stage 2 / TIER_LEVEL 對應 / F056） */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-gray-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-[#F59E0B] mb-1">注意</p>
                  <p>
                    刪除後此等級不再參與月跑 Stage 2 分級。若 TIER_LEVEL 對應（F056）中仍有此{' '}
                    <code>(cardType, cardLevel)</code> 紀錄，將無法刪除（409{' '}
                    <code>CARD_LEVEL_REFERENCED</code>）。
                  </p>
                </div>
              </div>
            </div>
            {errorMsg && (
              <div
                data-testid="level-delete-error"
                className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="level-delete-confirm"
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#EF4444] rounded-lg hover:bg-red-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '確認刪除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** F056 v1.4：TIER 對應編輯 Modal（透過 PUT batch UPSERT 走單筆更新） */
function TierEditModal({
  target,
  onClose,
  onSaved,
  runWriteOp,
}: {
  target: TierMappingItem;
  onClose: () => void;
  onSaved: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [tierLevel, setTierLevel] = useState(target.tierLevel);
  const [listNm, setListNm] = useState(target.listNm ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!tierLevel) {
      setFormError('tier_level 為必填');
      return;
    }
    setSubmitting(true);
    try {
      await runWriteOp(
        // F056 v1.5：updateTierMapping 加 cardType query
        () =>
          updateTierMapping(target.cardType, {
            mappings: [
              {
                cardType: target.cardType,
                cardLevel: target.cardLevel,
                tierLevel,
                listNm: listNm === '' ? null : listNm,
              },
            ],
          }),
        'TIER 對應更新成功',
      );
      onSaved();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? '更新失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="tier-edit-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-semibold text-gray-900">編輯 TIER 對應</h3>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  card_type（PK，不可修改）
                </label>
                <input
                  type="text"
                  value={target.cardType}
                  readOnly
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono bg-gray-50 text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  card_level（PK，不可修改）
                </label>
                <input
                  type="text"
                  value={target.cardLevel ?? 'NULL (fallback)'}
                  readOnly
                  className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono bg-gray-50 text-gray-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                tier_level <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                data-testid="tier-edit-tierLevel"
                value={tierLevel}
                onChange={(e) => setTierLevel(e.target.value)}
                maxLength={5}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                list_nm（optional）
              </label>
              <input
                type="text"
                data-testid="tier-edit-listNm"
                value={listNm}
                onChange={(e) => setListNm(e.target.value)}
                maxLength={30}
                className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg"
              />
            </div>
            {formError && (
              <div
                data-testid="tier-edit-error"
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="tier-edit-submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** F056 v1.4：TIER 對應刪除確認 Modal（含 fallback NULL 路徑） */
function TierDeleteConfirmModal({
  target,
  onClose,
  onConfirmed,
  runWriteOp,
}: {
  target: TierMappingItem;
  onClose: () => void;
  onConfirmed: () => void;
  runWriteOp: <T>(
    op: () => Promise<T>,
    onSuccess: string,
    onError?: string,
  ) => Promise<T>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const isFallback = target.cardLevel === null;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await runWriteOp(
        () => deleteTierMapping(target.cardType, target.cardLevel),
        'TIER 對應已刪除',
      );
      onConfirmed();
    } catch {
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          data-testid="tier-delete-confirm-modal"
          className="bg-white rounded-xl shadow-2xl w-full max-w-md relative"
        >
          <div className="px-6 pt-6 pb-2 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-[#EF4444]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              刪除 TIER 對應
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              確定刪除對應{' '}
              <code className="font-mono font-semibold text-gray-800">
                {target.cardType} × {target.cardLevel ?? 'NULL'}
              </code>{' '}
              → <code className="font-mono">{target.tierLevel}</code>？
            </p>
            {isFallback && (
              <p className="text-xs text-purple-600 mt-2 inline-flex items-center gap-1 justify-center">
                <GitFork className="w-3 h-3" />
                fallback 規則（card_level IS NULL）
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-[#E5E7EB] rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="tier-delete-confirm"
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-[#EF4444] rounded-lg hover:bg-red-700 shadow-sm disabled:opacity-50"
            >
              {submitting ? '處理中...' : '確認刪除'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
