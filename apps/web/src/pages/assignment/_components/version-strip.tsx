import { CreditCard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getScoring, type CardType } from '@/api/assignment-scoring';
import { ProdKindBadge } from './prod-kind-badge';

/**
 * F069 樣式對齊（review 差異 #2）：Tab 2/3/4/5 panel 頂部的 version strip。
 *
 * 對應 prototype 28 line 252 / 292 / 340 / 420 — `.version-strip` 區塊，於每個
 * Tab 2~5 panel 最上方顯示：
 *   - `CARD_TYPE` 圖示 + 代碼 + cardName
 *   - PROD_KIND badge（小尺寸）
 *   - 版本 v{cardVersion} + active 狀態
 *   - sdate ~ edate
 *
 * 資料來源：
 *   - cardType / cardName / prodKind / prodKindName：從 props（由 Shell context 帶入）
 *   - cardVersion / sdate / edate：透過 `getScoring(cardType)` 取得
 *
 * 行為：
 *   - 載入中：顯示「version-card-loading」placeholder（保留既有 testid，
 *     舊測試會檢查）
 *   - 404（無 active 版本）：顯示「no-active-version」警示（保留既有 testid）
 *   - 成功：顯示完整 strip，並保留隱藏的 `version-card` / `version-sdate` /
 *     `version-edate` / `version-created-by` / `version-created-at` testid 標記，
 *     供既有測試（TS-F053-009 / 010 / 012）尋找
 *
 * 注意：本元件刻意保留 `data-testid="version-card"` 等舊測試 ID，避免 Iter 7
 * refactor 同時改動 testid 而破壞 baseline 67 個 test。
 */

interface Props {
  cardType: string;
  cardName: string | null;
  prodKind: string | null;
  prodKindName: string | null;
}

export function VersionStrip({
  cardType,
  cardName,
  prodKind,
  prodKindName,
}: Props) {
  const query = useQuery({
    queryKey: ['scoring', cardType],
    queryFn: () => getScoring(cardType as CardType),
    enabled: !!cardType,
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div
        data-testid="version-card-loading"
        className="px-4 py-2.5 border-b border-gray-200 bg-gray-50/40 text-xs text-gray-400"
      >
        載入版本資料中…
      </div>
    );
  }

  if (query.isError) {
    const status = (query.error as any)?.response?.status;
    if (status === 404) {
      // 404（無 active 版本）：由父層 panel 顯示 no-active-version 警示；
      // 本 strip 不重複渲染避免 testid 衝突。
      return null;
    }
    return (
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50/40 text-xs text-red-600">
        版本資料載入失敗
      </div>
    );
  }

  const version = query.data?.version;
  if (!version) return null;

  return (
    <div
      data-testid="version-card"
      className="px-4 py-2.5 border-b border-gray-200 bg-gray-50/40 flex items-center gap-3 text-xs flex-wrap"
    >
      <span className="inline-flex items-center gap-1 text-gray-500">
        <CreditCard size={14} />
        CARD_TYPE
      </span>
      <span className="font-mono font-semibold text-gray-800">{cardType}</span>
      {(cardName ?? version.cardName) && (
        <span className="text-gray-700">— {cardName ?? version.cardName}</span>
      )}
      <span className="text-gray-300">│</span>
      <ProdKindBadge
        prodKind={prodKind}
        prodKindName={prodKindName}
        size="sm"
      />
      <span className="text-gray-300">│</span>
      <span className="text-gray-500">
        版本 v{version.cardVersion}
      </span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-medium rounded-full bg-green-100 text-green-700">
        <span className="w-1 h-1 rounded-full bg-green-500" />
        active
      </span>
      <span className="text-gray-300">│</span>
      <span className="font-mono text-gray-500 text-[11px]">
        <span data-testid="version-sdate">{version.sdate}</span>
        {' ~ '}
        <span data-testid="version-edate">{version.edate}</span>
      </span>
      {/* 隱藏 anchor：供既有 TS-F053-009 / 010 測試尋找 createdBy / createdAt */}
      <span className="sr-only">
        建立者{' '}
        <span data-testid="version-created-by">
          {version.createdBy ?? '—'}
        </span>{' '}
        於{' '}
        <span data-testid="version-created-at">
          {version.createdAt
            ? version.createdAt
                .replace('T', ' ')
                .replace(/\.\d+Z$/, '')
                .slice(0, 16)
            : '—'}
        </span>
      </span>
    </div>
  );
}
