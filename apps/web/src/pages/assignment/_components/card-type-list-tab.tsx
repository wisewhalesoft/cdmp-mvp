import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Info,
  MousePointerClick,
  Pencil,
  Plus,
  Trash2,
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
                  card_type
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">
                  card_name
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">
                  PROD_KIND
                </th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">
                  status
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
          setSelected({
            cardType: item.cardType,
            cardName: item.cardName,
            prodKind: item.prodKind,
            prodKindName: item.prodKindName,
            status: 'active',
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
 * F069 AC-4 / AC-5：頂部 PROD_KIND info banner（跨 Tab 持續可見）
 * 對應 prototype 28 line 150~168。
 */
export function ProdKindInfoBanner({
  selectedCard,
}: {
  selectedCard: CardTypeListItem | null;
}) {
  return (
    <div
      className="mb-4 rounded-lg p-3 bg-blue-50/60 border border-blue-100 text-sm text-gray-700"
      data-testid="prod-kind-banner"
    >
      <div className="flex items-start gap-2">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-gray-800">
            產品類別（PROD_KIND）由「代碼維護」管理
            <a
              href="#/assignment/base-codes"
              className="text-blue-600 hover:underline ml-2 inline-flex items-center gap-1"
              data-testid="banner-link-base-codes"
            >
              前往代碼維護
              <ArrowRight size={12} />
            </a>
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {selectedCard ? (
              <>
                目前選中：CARD_TYPE ={' '}
                <span className="font-mono font-semibold text-gray-800">
                  {selectedCard.cardType}
                </span>{' '}
                {selectedCard.cardName}
                <span className="text-gray-300 mx-2">·</span>
                PROD_KIND ={' '}
                <ProdKindBadge
                  prodKind={selectedCard.prodKind}
                  prodKindName={selectedCard.prodKindName}
                  size="sm"
                />
              </>
            ) : (
              <span className="text-gray-500">
                尚未選擇 CARD_TYPE，請於下方 Tab 1 選取或新增
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

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
