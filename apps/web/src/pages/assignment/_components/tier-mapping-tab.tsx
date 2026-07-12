import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CloudOff,
  Eye,
  GitFork,
  Info,
  Inbox,
  ListChecks,
  Loader2,
  PieChart,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import {
  deleteTierMapping,
  getCardLevels,
  getTierMapping,
  LEGACY_TIER_VALUES,
  type TierMappingItem,
  type CardType,
} from '@/api/assignment-scoring';
import { useSelectedCardType } from '../_hooks/use-selected-card-type';
import { useCardLevelHistogram } from '../_hooks/use-card-level-histogram';
import {
  deriveTierDistribution,
  type LevelBand,
  type TierDistResult,
} from '../_utils/sampling-estimate';
import { NoCardTypeSelectedEmpty } from './card-type-list-tab';
import { CreateTierMappingModal } from './create-tier-mapping-modal';
// Iter 8：拔除 VersionStrip（prototype 28 v3+ 已移除 .version-strip）；
// 版本資訊改顯示於 SelectedCardTypeBanner（Shell 層）。

/**
 * F056 v1.5：TIER_LEVEL 對應表 Tab 5
 *
 * 對應 prototype 28 line 414~470（panel-tier）+ line 1293~1361（renderTier）。
 *
 * 功能（v1.5）：
 *   - 依 context selectedCardType 篩選 mappings
 *   - Mode Banner：依當前 cardType 紀錄狀態顯示 Standard N 筆 / Fallback / 尚未建立
 *   - Fallback 規則說明 banner
 *   - 表格列：
 *     - Fallback 列含紫色底色
 *     - 規則類型 badge：Standard 藍 / Fallback 紫
 *     - 待遷移舊後綴值（T5M / THC / T3C 等）顯示琥珀 legacy badge
 *   - 操作：新增（開 CreateTierMappingModal）/ 刪除（含 fallback NULL）
 *
 * Props：
 *   - isLocked：月名單分派鎖（disabled 寫入按鈕；由父頁面提供）
 *   - availableCardLevels：當前 cardType 的 CARD_LEVEL 等級清單（供 Modal CARD_LEVEL 下拉）
 *     若未提供，預設 ['A','B','C','D']（Iter 5b 暫定 hardcoded，Iter 6 可改 useQuery）
 */

interface Props {
  isLocked?: boolean;
  availableCardLevels?: string[];
}

export function TierMappingTabV15({
  isLocked = false,
  availableCardLevels = ['A', 'B', 'C', 'D'],
}: Props) {
  const { selectedCardType, selectedCardName } = useSelectedCardType();
  const [createOpen, setCreateOpen] = useState(false);

  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['tier-mapping', selectedCardType],
    queryFn: () => getTierMapping(selectedCardType!),
    enabled: !!selectedCardType,
  });

  const mappings = query.data?.mappings ?? [];

  // 依 cardLevel 排序：null 排末尾、其他升冪
  const sortedMappings = useMemo(() => {
    return [...mappings].sort((a, b) => {
      const aNull = a.cardLevel == null;
      const bNull = b.cardLevel == null;
      if (aNull && !bNull) return 1;
      if (!aNull && bNull) return -1;
      if (aNull && bNull) return 0;
      return (a.cardLevel ?? '').localeCompare(b.cardLevel ?? '');
    });
  }, [mappings]);

  const standardCount = mappings.filter((m) => m.cardLevel != null).length;
  const fallbackCount = mappings.filter((m) => m.cardLevel == null).length;

  // F056 v1.6 / AD-E07-45 §3.4.2：預估各 TIER 分布 —— 由共用之 histogram 快取 client-side 推算，
  // 不呼叫 §5.5 端點、切換分頁不重新掃描（histogram 每 cardType 快取一次，與 Tab 4 共用同一 key）。
  const activeLevelsQuery = useQuery({
    queryKey: ['card-levels', selectedCardType],
    queryFn: () => getCardLevels(selectedCardType! as CardType),
    enabled: !!selectedCardType,
  });
  const activeLevels: LevelBand[] = useMemo(
    () =>
      (activeLevelsQuery.data?.levels ?? []).map((l) => ({
        cardLevel: l.cardLevel,
        scoreS: l.scoreS,
        scoreE: l.scoreE,
      })),
    [activeLevelsQuery.data],
  );
  const histogramQuery = useCardLevelHistogram(selectedCardType, activeLevels);
  const histoData = histogramQuery.data;

  const tierDist = useMemo(() => {
    if (!histoData) return null;
    return deriveTierDistribution(
      histoData.histogram ?? [],
      activeLevels,
      mappings,
      histoData.sampleSize ?? 0,
      histoData.totalCount ?? 0,
    );
  }, [histoData, activeLevels, mappings]);

  const deleteMutation = useMutation({
    mutationFn: ({
      cardType,
      cardLevel,
    }: {
      cardType: string;
      cardLevel: string | null;
    }) => deleteTierMapping(cardType, cardLevel),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tier-mapping', selectedCardType],
      });
      showToast('已刪除對應', 'success');
    },
    onError: (err: any) => {
      const body = err?.response?.data;
      const code = body?.error;
      if (code === 'TIER_MAPPING_NOT_FOUND') {
        showToast('對應紀錄不存在或已被刪除', 'error');
      } else if (code === 'SCORING_VERSION_LOCKED') {
        showToast('分派執行中，無法刪除對應', 'error');
      } else {
        showToast(body?.message ?? '刪除失敗', 'error');
      }
    },
  });

  function handleDelete(m: TierMappingItem) {
    if (isLocked) return;
    const ok = window.confirm(
      m.cardLevel == null
        ? `確定刪除 ${m.cardType} 的 Fallback 對應（→ ${m.tierLevel}）？`
        : `確定刪除 ${m.cardType} / ${m.cardLevel} → ${m.tierLevel} 對應？`,
    );
    if (!ok) return;
    deleteMutation.mutate({
      cardType: m.cardType,
      cardLevel: m.cardLevel,
    });
  }

  // 未選中 CARD_TYPE → 空狀態
  if (!selectedCardType) {
    return (
      <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 shadow-sm">
        <NoCardTypeSelectedEmpty />
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-b-lg border border-gray-200 border-t-0 shadow-sm"
      data-testid="tier-mapping-tab-v15"
    >
      {/* Iter 8（prototype B 排列）：拔除頂部 version-strip；版本/PROD_KIND 改由
          SelectedCardTypeBanner 在 Shell 層統一顯示。 */}

      {/* Mode Banner */}
      <ModeBanner standardCount={standardCount} fallbackCount={fallbackCount} />

      <div className="grid grid-cols-3 gap-0">
        {/* 左：TIER 對應表（2/3） */}
        <div className="col-span-2 border-r border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/40 flex items-center gap-3">
        <span className="text-sm text-gray-500">
          共 {mappings.length} 筆對應
        </span>
        <button
          data-testid="btn-add-tier-v15"
          onClick={() => setCreateOpen(true)}
          disabled={isLocked}
          title={isLocked ? '分派執行中，無法修改計分設定' : '新增 TIER 對應'}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
          新增對應
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/60">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">
                等級代碼
              </th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">
                TIER 代碼
              </th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">
                規則類型
              </th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-sm text-gray-400">
                  載入中…
                </td>
              </tr>
            )}
            {!query.isLoading && sortedMappings.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-sm text-gray-400">
                  <Inbox
                    size={32}
                    className="text-gray-300 mx-auto mb-2"
                    strokeWidth={1.5}
                  />
                  <p>目前無 TIER_LEVEL 對應</p>
                  <p className="text-xs text-gray-400 mt-1">
                    請點擊上方「+ 新增對應」開始
                  </p>
                </td>
              </tr>
            )}
            {sortedMappings.map((m) => {
              const isFallback = m.cardLevel == null;
              const rowKey = m.cardLevel ?? 'null';
              const isLegacy = LEGACY_TIER_VALUES.has(m.tierLevel);
              return (
                <tr
                  key={`${m.cardType}|${rowKey}`}
                  data-testid={`tier-row-${m.cardType}-${rowKey}`}
                  className={
                    'border-b border-gray-200 transition ' +
                    (isFallback ? 'bg-purple-50/50' : 'hover:bg-gray-50/50')
                  }
                >
                  <td className="px-5 py-3">
                    {isFallback ? (
                      <span className="text-purple-600 italic text-xs">
                        — (Fallback)
                      </span>
                    ) : (
                      <span
                        className={
                          'inline-flex items-center justify-center w-7 h-7 text-sm font-semibold rounded-md ' +
                          cardLevelColor(m.cardLevel!)
                        }
                      >
                        {m.cardLevel}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-mono font-semibold text-gray-900">
                      {m.tierLevel}
                    </span>
                    {isLegacy && (
                      <span
                        data-testid={`legacy-tier-badge-${m.cardType}-${rowKey}`}
                        className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700"
                        title={`原值 ${m.tierLevel}，待後端遷移至 T1~T10 列舉`}
                      >
                        <AlertCircle size={10} />
                        待遷移
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {isFallback ? (
                      <span
                        data-testid={`rule-badge-${m.cardType}-${rowKey}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700"
                      >
                        <GitFork size={12} />
                        Fallback
                      </span>
                    ) : (
                      <span
                        data-testid={`rule-badge-${m.cardType}-${rowKey}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700"
                      >
                        <ListChecks size={12} />
                        Standard
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(m)}
                      disabled={isLocked}
                      title={isLocked ? '分派執行中' : '刪除對應'}
                      aria-label={`刪除 ${m.cardType} ${rowKey}`}
                      data-testid={`delete-tier-${m.cardType}-${rowKey}`}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          <Info size={14} className="inline mr-1 text-gray-400" />
          月名單分派 Stage 2 完成 CARD_LEVEL 計算後，依此表 join 寫入
          ob_pool_data_list.tier_level
        </p>
      </div>
        </div>

        {/* 右：預估各 TIER 分布（1/3，F056 §5.5 / AD-E07-45：抽樣估算三態，資訊架構比照 Tab 4） */}
        <TierDistPanel
          isLoading={histogramQuery.isLoading}
          isError={histogramQuery.isError}
          onRetry={() => void histogramQuery.refetch()}
          sampleSize={histoData?.sampleSize ?? 0}
          totalCount={histoData?.totalCount ?? 0}
          dist={tierDist}
        />
      </div>

      <CreateTierMappingModal
        open={createOpen}
        cardType={selectedCardType}
        cardName={selectedCardName ?? undefined}
        availableCardLevels={availableCardLevels}
        existingMappings={mappings}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}

// =========================
// Helpers
// =========================

function ModeBanner({
  standardCount,
  fallbackCount,
}: {
  standardCount: number;
  fallbackCount: number;
}) {
  const total = standardCount + fallbackCount;

  if (total === 0) {
    return (
      <div
        data-testid="tier-mode-banner"
        className="mx-4 mt-3 mb-2 flex items-start gap-2 p-3 rounded-lg text-xs bg-gray-50 border border-gray-200"
      >
        <Info size={16} className="text-gray-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-gray-700">尚未建立 TIER_LEVEL 對應</p>
          <p className="text-gray-600 mt-0.5">
            新增時請選擇規則類型（Standard 依等級 / Fallback 不分等級）
          </p>
        </div>
      </div>
    );
  }
  if (fallbackCount > 0 && standardCount === 0) {
    return (
      <div
        data-testid="tier-mode-banner"
        className="mx-4 mt-3 mb-2 flex items-start gap-2 p-3 rounded-lg text-xs bg-purple-50 border border-purple-200"
      >
        <GitFork size={16} className="text-purple-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-purple-800">
            目前 CARD_TYPE 採用 Fallback 規則（{fallbackCount} 筆）
          </p>
          <p className="text-purple-700 mt-0.5">不分等級直接對應 TIER_LEVEL</p>
        </div>
      </div>
    );
  }
  // 預設：採 Standard 規則
  return (
    <div
      data-testid="tier-mode-banner"
      className="mx-4 mt-3 mb-2 flex items-start gap-2 p-3 rounded-lg text-xs bg-blue-50 border border-blue-100"
    >
      <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium text-gray-800">
          目前 CARD_TYPE 採用 Standard 規則（{standardCount} 筆）
        </p>
      </div>
    </div>
  );
}

function cardLevelColor(level: string): string {
  switch (level) {
    case 'A':
      return 'bg-emerald-100 text-emerald-700';
    case 'B':
      return 'bg-blue-100 text-blue-700';
    case 'C':
      return 'bg-amber-100 text-amber-700';
    case 'D':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

const TIER_DOT: Record<string, string> = {
  T1: 'bg-indigo-500',
  T2: 'bg-blue-500',
  T3: 'bg-cyan-500',
  T4: 'bg-teal-500',
  T5: 'bg-emerald-500',
  T6: 'bg-lime-500',
  T7: 'bg-amber-500',
  T8: 'bg-orange-500',
  T9: 'bg-rose-500',
  T10: 'bg-fuchsia-500',
};

/**
 * F056 v1.6 / AD-E07-45：預估各 TIER 分布面板（三態 + 無對應 + Fallback）。
 * 資訊架構比照 Tab 4（分類代碼 + 筆數 + 佔比 + 進度條）。純唯讀，讀鎖豁免。
 */
function TierDistPanel({
  isLoading,
  isError,
  onRetry,
  sampleSize,
  totalCount,
  dist,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  sampleSize: number;
  totalCount: number;
  dist: TierDistResult | null;
}) {
  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-200 bg-blue-50/30">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <PieChart size={16} className="text-blue-600" />
            預估各 TIER 分布
          </h4>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700"
            title="抽樣估算值，非精確全量計數"
          >
            <Sparkles size={12} />約 · 估算
          </span>
        </div>
        {!isLoading && !isError && dist && (
          <p
            data-testid="tier-dist-sample-caption"
            className="text-[11px] text-gray-500 mt-1.5 flex items-start gap-1"
          >
            <Info size={12} className="text-gray-400 shrink-0 mt-0.5" />
            <span>
              套 active 門檻分級 → 依對應規則映射彙總至 TIER（多對一加總）· 樣本{' '}
              <span className="tabular-nums font-medium">
                {sampleSize.toLocaleString()}
              </span>
              ／母體{' '}
              <span className="tabular-nums font-medium">
                {totalCount.toLocaleString()}
              </span>{' '}
              筆
            </span>
          </p>
        )}
      </div>

      {/* 載入中 */}
      {isLoading && (
        <div
          data-testid="tier-dist-loading"
          data-state="loading"
          className="p-5 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={16} className="animate-spin text-blue-600" /> 估算中…
          </div>
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i}>
                <div className="h-3 w-14 rounded bg-gray-100 animate-pulse" />
                <div className="w-full h-2 rounded-full bg-gray-100 animate-pulse mt-1" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 估算失敗（可重試，永不留白） */}
      {!isLoading && isError && (
        <div
          data-testid="tier-dist-error"
          data-state="error"
          className="p-6 flex flex-col items-center text-center gap-2"
        >
          <CloudOff size={32} className="text-gray-300" />
          <p className="text-sm font-medium text-gray-700">預估分布暫時無法取得</p>
          <p className="text-xs text-gray-400">估算服務逾時或連線異常，請稍後再試</p>
          <button
            type="button"
            data-testid="tier-dist-retry"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
          >
            <RefreshCw size={14} />
            重新整理
          </button>
        </div>
      )}

      {/* 無對應規則提示（AC-12：不留白、不報錯） */}
      {!isLoading && !isError && dist && dist.mode === 'none' && (
        <div
          data-testid="tier-dist-empty"
          data-state="empty"
          className="p-6 flex flex-col items-center text-center gap-2"
        >
          <GitFork size={32} className="text-gray-300" />
          <p className="text-sm font-medium text-gray-700">尚未設定 TIER 對應規則</p>
          <p className="text-xs text-gray-400">
            請先於左側新增對應後，即可查看各 TIER 分布預估
          </p>
        </div>
      )}

      {/* 已顯示估算（standard / fallback） */}
      {!isLoading && !isError && dist && dist.mode !== 'none' && (
        <div
          data-testid="tier-dist-ready"
          data-state="estimate"
          className="p-5 space-y-3"
        >
          {dist.mode === 'fallback' && (
            <div className="mb-1 flex items-start gap-1.5 rounded-md bg-purple-50 border border-purple-200 p-2 text-[11px] text-purple-700">
              <GitFork size={14} className="mt-0.5 shrink-0" />
              Fallback 規則 · 不分等級，全部可計分案件歸單一 TIER
            </div>
          )}
          {dist.rows.map((r) => {
            const dot = TIER_DOT[r.tierLevel] ?? 'bg-gray-500';
            const w = Math.min(100, Math.round(r.ratio * 100));
            return (
              <div key={r.tierLevel} data-testid={`tier-dist-row-${r.tierLevel}`}>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                    <span className="font-mono font-semibold">{r.tierLevel}</span>
                  </span>
                  <span className="text-right leading-tight">
                    <span
                      data-testid={`tier-dist-count-${r.tierLevel}`}
                      className="block font-semibold text-gray-900 tabular-nums"
                    >
                      約 {r.count.toLocaleString()} 筆
                    </span>
                    <span className="block text-[11px] text-gray-400 tabular-nums">
                      {(r.ratio * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
                  <div className={`h-2 ${dot}`} style={{ width: `${w}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 唯讀說明（AC-13 / AD-E07-45 §6 讀鎖豁免） */}
      <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50/40">
        <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
          <Eye size={12} className="mt-0.5 shrink-0" />
          唯讀預估 · 月名單分派執行中仍可檢視，不受編輯鎖影響
        </p>
      </div>
    </div>
  );
}
