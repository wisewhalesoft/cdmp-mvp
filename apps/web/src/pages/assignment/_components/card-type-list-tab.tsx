import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CreditCard,
  GitBranch,
  MousePointerClick,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import {
  listCardTypes,
  type CardTypeListItem,
} from '@/api/card-type';
import { useSelectedCardType } from '../_hooks/use-selected-card-type';
import { ProdKindBadge } from './prod-kind-badge';
import { CreateCardTypeModal } from './create-card-type-modal';
import { EditCardTypeModal } from './edit-card-type-modal';
import { DeleteCardTypeModal } from './delete-card-type-modal';
import { CardTypeSwitcher } from './card-type-switcher';

/**
 * F069：CARD_TYPE 計分卡類型清單 Tab 1
 *
 * 對應 prototype 28 line 212~247（panel-cardtype）+ line 1082~1131（renderCardTypeList）。
 *
 * 行為（AC-1 ~ AC-6）：
 *   - 載入時 GET /card-types?status=active
 *   - 預設選中第一列（自動透過 useEffect 同步 context）
 *   - 點 row 切換選中（高亮 + 同步 context 給 Tab 2~5）
 *   - 點操作欄按鈕（編輯 / 停用）不觸發 row click
 *   - 月跑鎖時所有寫入按鈕（新增 / 編輯 / 停用）disabled + title hint
 *   - 空清單顯示 empty state（提示新增）
 *
 * Props：
 *   - isLocked：月跑鎖狀態（由父頁面提供，目前 Iter 5a 暫定 false；Iter 5b 可從 assignment_run 取）
 */

interface Props {
  isLocked?: boolean;
}

export function CardTypeListTab({ isLocked = false }: Props) {
  const { selectedCardType, setSelected } = useSelectedCardType();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CardTypeListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardTypeListItem | null>(
    null,
  );

  const query = useQuery({
    queryKey: ['card-types'],
    queryFn: () => listCardTypes('active'),
  });

  const cards = query.data?.cardTypes ?? [];

  // AC-2：清單載入後若尚未選中，自動選中第一列
  useEffect(() => {
    if (cards.length > 0 && !selectedCardType) {
      setSelected(cards[0]);
    }
  }, [cards, selectedCardType, setSelected]);

  // 若目前 selectedCardType 已不在清單（例如剛被停用），清除 selection
  useEffect(() => {
    if (
      selectedCardType &&
      cards.length > 0 &&
      !cards.some((c) => c.cardType === selectedCardType)
    ) {
      setSelected(cards[0] ?? null);
    }
  }, [cards, selectedCardType, setSelected]);

  const writeBtnTitle = isLocked
    ? '分派執行中，無法修改計分設定'
    : undefined;

  return (
    <div
      className="bg-white rounded-b-lg border border-gray-200 border-t-0 shadow-sm"
      data-testid="card-type-list-tab"
    >
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/40 flex items-center gap-3">
        <span className="text-sm text-gray-500">
          共 {cards.length} 個計分卡類型
        </span>
        <button
          onClick={() => setCreateOpen(true)}
          disabled={isLocked}
          title={writeBtnTitle}
          data-testid="btn-add-card-type"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
          新增計分卡類型
        </button>
      </div>

      {query.isLoading && (
        <div className="py-12 text-center text-sm text-gray-500">
          載入中…
        </div>
      )}

      {query.isError && (
        <div className="py-12 text-center text-sm text-red-600">
          清單載入失敗，請重新整理頁面
        </div>
      )}

      {!query.isLoading && !query.isError && cards.length === 0 && (
        <div className="py-16 text-center" data-testid="card-type-empty">
          <CreditCard
            size={48}
            className="text-gray-300 mx-auto"
            strokeWidth={1.5}
          />
          <p className="text-sm font-medium text-gray-700 mt-3">
            尚未設定任何計分卡類型
          </p>
          <p className="text-xs text-gray-500 mt-1">
            請點擊下方「+ 新增計分卡類型」開始設定
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={isLocked}
            title={writeBtnTitle}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            新增計分卡類型
          </button>
        </div>
      )}

      {cards.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="w-8 px-3 py-3" aria-label="選中標示" />
                <th className="text-left px-5 py-3 font-semibold text-gray-600">
                  計分卡代碼
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">
                  計分卡名稱
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">
                  產品類別
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">
                  狀態
                </th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const isSelected = c.cardType === selectedCardType;
                return (
                  <tr
                    key={c.cardType}
                    onClick={() => setSelected(c)}
                    data-testid={`card-type-row-${c.cardType}`}
                    data-selected={isSelected}
                    aria-selected={isSelected}
                    className={
                      'border-b border-gray-200 hover:bg-blue-50/30 transition cursor-pointer ' +
                      (isSelected
                        ? 'bg-blue-50/60 [&>td:first-child]:shadow-[inset_4px_0_0_0_#2563EB]'
                        : '')
                    }
                  >
                    <td className="w-8 px-3 py-3 text-center">
                      {isSelected && (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-600" />
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono font-semibold text-gray-900">
                      {c.cardType}
                    </td>
                    <td className="px-5 py-3 text-gray-900">{c.cardName}</td>
                    <td className="px-5 py-3">
                      <ProdKindBadge
                        prodKind={c.prodKind}
                        prodKindName={c.prodKindName}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {c.status}
                      </span>
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setEditTarget(c)}
                          disabled={isLocked}
                          title={writeBtnTitle ?? '編輯'}
                          aria-label={`編輯 ${c.cardType}`}
                          data-testid={`btn-edit-${c.cardType}`}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          disabled={isLocked}
                          title={writeBtnTitle ?? '停用'}
                          aria-label={`停用 ${c.cardType}`}
                          data-testid={`btn-delete-${c.cardType}`}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateCardTypeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(item) => {
          // F070 AC-1：新增成功後自動選中新項目
          // Iter 9：新建卡的 metadata（cardVersion=1、sdate=今日…）由 backend 在 listCardTypes
          // 下次 refetch 時提供；此時先以 createCardType response 已知的 cardVersion 帶入，
          // 其餘 metadata 暫填 null，等下一次 listCardTypes refetch 補齊。
          setSelected({
            cardType: item.cardType,
            cardName: item.cardName,
            prodKind: item.prodKind,
            prodKindName: item.prodKindName,
            status: 'active',
            cardVersion: item.cardVersion ?? null,
            sdate: null,
            edate: null,
            createdBy: null,
            createdAt: item.createdAt ?? null,
          });
        }}
      />
      <EditCardTypeModal
        open={!!editTarget}
        target={editTarget}
        onClose={() => setEditTarget(null)}
      />
      <DeleteCardTypeModal
        open={!!deleteTarget}
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(deletedCardType) => {
          // F072 AC-6：若停用為當前選中，清除 selection（讓 Tab 2~5 顯示空狀態）
          if (selectedCardType === deletedCardType) {
            setSelected(null);
          }
        }}
      />
    </div>
  );
}

/**
 * F069 排列 B（單列三欄）：頂部「目前編輯中的計分卡」狀態卡
 *
 * 對應 prototype 28 line 148~197 + line 1064~1203（updateBanner）。
 *
 * 三欄佈局（≥1280px / xl breakpoint）：
 *   - 欄 1（col-span-5）：身分區 — tile + cardName + PROD_KIND badge + status pill
 *   - 欄 2（col-span-3）：metadata — version / sdate~edate / createdBy · createdAt
 *   - 欄 3（col-span-4）：KPI 5 欄（dim/score/level/tier/listDefsAffected）+ 切換器
 *
 * <1280px 退化為單欄垂直堆疊（divide-y 取代 divide-x）。
 *
 * 主題切換：
 *   - normal：white 背景 + divide-border + tile primary
 *   - placeholder（selectedCardType=null）：dashed gray，身分區跨 col-span-12，
 *     metadata/stats 欄 hidden
 *   - month-run-lock（monthRunLocked=true）：amber-50 背景 + divide-amber-200 +
 *     KPI hover amber-100；切換器 trigger disabled
 *
 * 注意：
 *   - stats prop 為 optional；undefined 時隱藏 KPI 列（父層尚未提供統計資料）
 *   - selectedCardType 為 BannerCardType（CardTypeListItem 擴充 cardVersion / sdate /
 *     edate / createdBy / createdAt 等 optional metadata 欄位）
 */

/**
 * Iter 9：CardTypeListItem 已含 5 個 metadata 欄位（cardVersion / sdate / edate /
 * createdBy / createdAt），BannerCardType 直接以 CardTypeListItem 為形狀，
 * 不再額外擴充欄位。保留 alias 以表達 banner 的語意角色。
 */
export type BannerCardType = CardTypeListItem;

export interface BannerStats {
  dimCount: number;
  scoreCount: number;
  levelCount: number;
  tierCount: number;
  listDefsAffected: number;
}

export interface SelectedCardTypeBannerProps {
  selectedCardType: BannerCardType | null;
  monthRunLocked?: boolean;
  availableCardTypes: CardTypeListItem[];
  onSwitchCardType: (code: string) => void;
  /**
   * Iter 9：stats 改 required。父層 page 一定會傳（透過 useQuery 取 /stats endpoint）；
   * 未選中（selectedCardType=null）時 banner 走 placeholder 分支，不會讀 stats。
   */
  stats: BannerStats;
  onSwitchTab?: (tab: 'dim' | 'score' | 'level' | 'tier') => void;
  onGoToListDefinitions?: (code: string) => void;
}

function fmtDate(yyyymmdd: string | null | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(
    6,
    8,
  )}`;
}

function DashOrText({ value }: { value: string | null | undefined }) {
  const isDash = value == null || value === '—' || value === '';
  if (isDash) {
    return <span className="text-gray-300">—</span>;
  }
  return <>{value}</>;
}

export function SelectedCardTypeBanner({
  selectedCardType,
  monthRunLocked = false,
  availableCardTypes,
  onSwitchCardType,
  stats,
  onSwitchTab,
  onGoToListDefinitions,
}: SelectedCardTypeBannerProps) {
  const isAmber = monthRunLocked;
  const ct = selectedCardType;

  const containerClass = (() => {
    if (isAmber) {
      return 'mb-4 rounded-xl bg-amber-50/60 border border-amber-200 shadow-sm';
    }
    if (!ct) {
      return 'mb-4 rounded-xl bg-gray-50 border-2 border-dashed border-gray-300';
    }
    return 'mb-4 rounded-xl bg-white border border-border shadow-sm';
  })();

  const gridClass = isAmber
    ? 'grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-amber-200'
    : 'grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-border';

  // ===== Placeholder（selectedCardType=null）=====
  if (!ct) {
    return (
      <div className={containerClass} data-testid="prod-kind-banner">
        <div className={gridClass} data-testid="banner-grid">
          <div
            data-testid="banner-selection"
            className="xl:col-span-12 px-5 py-3 flex items-center gap-3 min-w-0"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
              <MousePointerClick className="w-6 h-6 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              <div className="text-sm font-semibold text-gray-700 leading-tight">
                尚未選擇 CARD_TYPE
              </div>
              <div className="text-xs text-gray-500 mt-1">
                請於下方 Tab 1 選取或新增一筆計分卡類型，或點右側「切換」直接選一張
              </div>
            </div>
            {/* 切換器 reattach 到身分區末尾 */}
            <div className="ml-auto shrink-0">
              <CardTypeSwitcher
                selectedCardType={null}
                availableCardTypes={availableCardTypes}
                monthRunLocked={monthRunLocked}
                onSwitchCardType={onSwitchCardType}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== 已選中：三欄式 =====
  const tileBg = isAmber ? 'bg-amber-500' : 'bg-primary';
  const statusPill =
    ct.status === 'active' ? (
      <span
        data-testid="banner-status-pill"
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-success"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        active
      </span>
    ) : (
      <span
        data-testid="banner-status-pill"
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        inactive
      </span>
    );

  const sdateFmt = fmtDate(ct.sdate);
  const edateFmt = fmtDate(ct.edate);
  // Iter 9：cardVersion 後端回 number | null；UI 顯示 `v{n}`，null 時 `—`
  const versionStr =
    ct.cardVersion == null ? null : `v${ct.cardVersion}`;

  // KPI button base
  const kpiBtnTheme = isAmber
    ? 'flex flex-col items-center justify-center px-1 py-1.5 rounded-md text-center transition hover:bg-amber-100 focus:outline-none focus:bg-amber-100'
    : 'flex flex-col items-center justify-center px-1 py-1.5 rounded-md text-center transition hover:bg-gray-100 focus:outline-none focus:bg-gray-100';

  const listAffected = stats.listDefsAffected;
  const affectedNumberColor =
    listAffected > 0 ? 'text-amber-600' : 'text-gray-900';
  const affectedLabelColor =
    listAffected > 0 ? 'text-amber-700 font-medium' : 'text-gray-500';

  return (
    <div className={containerClass} data-testid="prod-kind-banner">
      <div className={gridClass} data-testid="banner-grid">
        {/* === 欄 1：身分區 === */}
        <div
          data-testid="banner-selection"
          className="xl:col-span-5 px-5 py-3 flex items-center gap-3 min-w-0"
        >
          <div
            className={`w-14 h-14 rounded-xl ${tileBg} flex items-center justify-center shrink-0 shadow-sm`}
          >
            <span className="font-mono text-3xl font-bold text-white leading-none">
              {ct.cardType}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-gray-900 leading-tight truncate">
              {ct.cardName}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <ProdKindBadge
                prodKind={ct.prodKind}
                prodKindName={ct.prodKindName}
                size="sm"
              />
              {statusPill}
            </div>
          </div>
        </div>

        {/* === 欄 2：metadata === */}
        <div
          data-testid="banner-meta"
          className="xl:col-span-3 px-5 py-3 flex flex-col justify-center gap-1 text-xs text-gray-500 min-w-0"
        >
          <div
            className="inline-flex items-center gap-1.5"
            title="cardVersion"
          >
            <GitBranch className="w-3 h-3 shrink-0" />
            <span className="font-mono text-gray-700">
              <DashOrText value={versionStr} />
            </span>
          </div>
          <div
            className="inline-flex items-center gap-1.5"
            title="生效起訖"
          >
            <Calendar className="w-3 h-3 shrink-0" />
            <span className="truncate">
              <DashOrText value={sdateFmt} /> ~ <DashOrText value={edateFmt} />
            </span>
          </div>
          <div
            className="inline-flex items-center gap-1.5 min-w-0"
            title="建立者 · 建立時間"
          >
            <UserIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">
              <DashOrText value={ct.createdBy} />
              {' · '}
              <DashOrText value={ct.createdAt} />
            </span>
          </div>
        </div>

        {/* === 欄 3：KPI + 切換器 === */}
        <div
          data-testid="banner-stats-col"
          className="xl:col-span-4 px-3 py-2 flex flex-col gap-1.5 min-w-0"
        >
          {/* Iter 9：stats 改 required；KPI 列恆顯示 */}
          <div
            data-testid="banner-stats"
            className="grid grid-cols-5 gap-0.5"
          >
              <button
                type="button"
                data-testid="kpi-dim"
                onClick={() => onSwitchTab?.('dim')}
                className={kpiBtnTheme}
                title="計分維度"
              >
                <span
                  data-testid="kpi-dim-number"
                  className="text-base font-bold text-gray-900 leading-none"
                >
                  {stats.dimCount}
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5">維度</span>
              </button>
              <button
                type="button"
                data-testid="kpi-score"
                onClick={() => onSwitchTab?.('score')}
                className={kpiBtnTheme}
                title="分數設定"
              >
                <span
                  data-testid="kpi-score-number"
                  className="text-base font-bold text-gray-900 leading-none"
                >
                  {stats.scoreCount}
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5">分數</span>
              </button>
              <button
                type="button"
                data-testid="kpi-level"
                onClick={() => onSwitchTab?.('level')}
                className={kpiBtnTheme}
                title="CARD_LEVEL 門檻"
              >
                <span
                  data-testid="kpi-level-number"
                  className="text-base font-bold text-gray-900 leading-none"
                >
                  {stats.levelCount}
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5">LEVEL</span>
              </button>
              <button
                type="button"
                data-testid="kpi-tier"
                onClick={() => onSwitchTab?.('tier')}
                className={kpiBtnTheme}
                title="TIER_LEVEL 對應"
              >
                <span
                  data-testid="kpi-tier-number"
                  className="text-base font-bold text-gray-900 leading-none"
                >
                  {stats.tierCount}
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5">TIER</span>
              </button>
              <button
                type="button"
                data-testid="kpi-listdef"
                onClick={() => onGoToListDefinitions?.(ct.cardType)}
                className={kpiBtnTheme}
                title={
                  listAffected > 0
                    ? `動此 CARD_TYPE 會影響 ${listAffected} 個名單定義`
                    : '目前無名單定義引用此 CARD_TYPE'
                }
              >
                <span
                  data-testid="kpi-listdef-number"
                  className={`text-base font-bold ${affectedNumberColor} leading-none inline-flex items-center gap-0.5`}
                >
                  {listAffected > 0 && (
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                  )}
                  {listAffected}
                </span>
                <span
                  data-testid="kpi-listdef-label"
                  className={`text-[10px] mt-0.5 ${affectedLabelColor}`}
                >
                  名單
                </span>
              </button>
            </div>
          <div className="flex justify-end px-2">
            <CardTypeSwitcher
              selectedCardType={ct.cardType}
              availableCardTypes={availableCardTypes}
              monthRunLocked={monthRunLocked}
              onSwitchCardType={onSwitchCardType}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 向後相容 alias：scoring-config-page.tsx 仍以 ProdKindInfoBanner 命名 import；
 * Iter 8（排列 B）後此元件實質改為 SelectedCardTypeBanner。
 * 後續 PR 將 import 改為 SelectedCardTypeBanner 後可移除此 alias。
 */
export const ProdKindInfoBanner = SelectedCardTypeBanner;

/**
 * F069 AC-5 / Tab 2~5 placeholder：未選中時的空狀態
 * 對應 prototype 28 line 253~262。
 */
export function NoCardTypeSelectedEmpty({
  onSwitchToTab1,
}: {
  onSwitchToTab1?: () => void;
}) {
  return (
    <div className="py-20 text-center" data-testid="no-card-type-selected">
      {/* Iter 7 review 差異 #11：改用 mouse-pointer-click，語意更貼合「請點 Tab 1」 */}
      <MousePointerClick
        size={40}
        className="text-gray-300 mx-auto"
        strokeWidth={1.5}
      />
      <p className="text-sm font-medium text-gray-700 mt-3">
        請先於 Tab 1 選擇計分卡類型
      </p>
      <p className="text-xs text-gray-500 mt-1">
        本頁面內容依 CARD_TYPE 篩選顯示
        <br />
        請先切換至「CARD_TYPE」Tab 並選取或新增一筆
      </p>
      {onSwitchToTab1 && (
        <button
          onClick={onSwitchToTab1}
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-sm text-gray-700 rounded-md hover:bg-gray-50 transition"
        >
          <ArrowLeft size={16} />
          前往 Tab 1
        </button>
      )}
    </div>
  );
}
