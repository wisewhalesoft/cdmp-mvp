import { useState } from 'react';
import {
  Copy,
  X,
  Recycle,
  ChevronRight,
  Loader2,
  ClipboardList,
  CopyCheck,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import type {
  AssignmentListItem,
  CopyDuplicateCheckItem,
} from '@/api/assignment-list';
import { stageLabel } from '../_utils/labels';
import {
  useConditionDecoder,
  type ConditionDecoder,
} from '../_hooks/use-condition-decoder';

/** 條件摘要涉及之欄位（whitelist snake_case），供 decoder 預載對應 options。 */
const COPY_SUMMARY_COLUMNS = ['prod_kind', 'spec_tp', 'caseyear', 'case_status'];

/**
 * F050 Phase 3 P2-6 — 從上月複製名單 modal
 *
 * 對應 prototype 27a-list-create-draft.html L130-310
 *
 * 顯示上月（prevYm）的 active 名單清單；點 row 觸發 onCopy(list)，
 * 父層自行將該 list 的欄位填入新名單 form state。
 *
 * 注意：後端 createList DTO 支援 copyFromListNo 欄位（僅用於 audit），
 * 實際資料複製需 FE 自行做（讀上月名單欄位 → setForm state）。
 */

/**
 * 計算上月 YYYYMM（跨年正確處理）。
 * @example computePrevYm('202601') === '202512'
 */
export function computePrevYm(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return '';
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(4, 6), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return '';
  const prev = new Date(Date.UTC(y, m - 1, 1));
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const py = prev.getUTCFullYear();
  const pm = prev.getUTCMonth() + 1;
  return `${py}${String(pm).padStart(2, '0')}`;
}

export interface CopyFromPrevMonthModalProps {
  open: boolean;
  prevYm: string;
  lists: AssignmentListItem[];
  loading: boolean;
  /**
   * F118：本作業月「已複製過」判定結果（後端 GET copy-duplicate-check）。
   *
   * - `undefined`（或省略）＝判定資料不可得 → AC-10 降級：不顯示任何徽章、
   *   點擊「使用此名單」直接沿用既有帶入流程（行為與 F118 實作前完全相同）。
   * - 有值 → 依 listNo 對照；`alreadyCopied=true` 者渲染徽章並於點擊時二次確認。
   */
  duplicateItems?: CopyDuplicateCheckItem[];
  onCopy: (list: AssignmentListItem) => void;
  onClose: () => void;
}

/** F118：以 listNo 為 key 之「已複製過」對照（僅收 alreadyCopied=true 且有目標編號者）。 */
function buildCopiedLookup(
  duplicateItems: CopyDuplicateCheckItem[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of duplicateItems ?? []) {
    if (item.alreadyCopied && item.copiedToListNo) {
      map.set(item.listNo, item.copiedToListNo);
    }
  }
  return map;
}

/**
 * F118 AC-1 / AC-4：「已複製過」徽章（靛紫 pill，對齊 prototype 27a L1198-1202）。
 * 目標編號為純文字，**不**做成連結（D-8：導航離開會丟失本表單已填內容）。
 */
function AlreadyCopiedBadge({ copiedToListNo }: { copiedToListNo: string }) {
  return (
    <span
      data-testid="already-copied-badge"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
      style={{ background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE' }}
    >
      <CopyCheck className="w-3 h-3" />
      已複製為 <span className="font-mono">{copiedToListNo}</span>
    </span>
  );
}

/**
 * F118 AC-3：已複製過候選之二次確認（巢狀 alertdialog，對齊 prototype 27a L444-488）。
 * 不 disable「使用此名單」——使用者可能刻意要建立條件不同的衍生名單。
 */
function DuplicateConfirmDialog({
  sourceListNo,
  targetListNo,
  onCancel,
  onConfirm,
}: {
  sourceListNo: string;
  targetListNo: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      data-testid="dup-confirm-modal"
      role="alertdialog"
      aria-modal="true"
      aria-label="本月已有內容相同的名單"
      className="absolute inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <CopyCheck className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-800">
              本月已有內容相同的名單
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              確認後仍會照常帶入欄位，可再修改條件
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-900">
              <p>
                本作業月已有一份與{' '}
                <span className="font-mono font-semibold">{sourceListNo}</span>{' '}
                <strong>篩選條件與卡別完全相同</strong>的名單：
                <span
                  data-testid="dup-confirm-target-list-no"
                  className="font-mono font-semibold"
                >
                  {targetListNo}
                </span>
                。
              </p>
              <p className="text-xs mt-1.5 text-amber-800">
                若直接複製後<strong>不修改任何條件</strong>即儲存，系統會拒絕建立（
                <code className="font-mono">422 LIST_NO_DUPLICATE</code>）。
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-blue-50/60 border border-blue-200 p-3 flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-blue-900">
              若您是<strong>刻意</strong>要以這份名單為基礎建立條件不同的衍生名單，
              請於確認後<strong>修改篩選條件</strong>（使其不再等價），即可正常儲存。
            </p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-gray-50/50">
          <button
            type="button"
            data-testid="btn-cancel-dup-copy"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-white rounded-md border border-gray-200"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="btn-confirm-dup-copy"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-blue-700 shadow-sm"
          >
            <Copy className="w-4 h-4" />
            仍要以此名單為基礎建立
          </button>
        </div>
      </div>
    </div>
  );
}

/** 名單條件摘要：欄位名稱與（類別型）值代碼皆解碼為中文；查無對照回傳原始代碼。 */
function formatConditionSummary(
  list: AssignmentListItem,
  decoder: ConditionDecoder,
): string {
  const parts: string[] = [];
  if (list.prodKind)
    parts.push(
      `${decoder.decodeField('prod_kind')}：${decoder.decodeValue('prod_kind', list.prodKind)}`,
    );
  if (list.specTp)
    parts.push(
      `${decoder.decodeField('spec_tp')}：${decoder
        .decodeValues('spec_tp', list.specTp.split('$$').filter(Boolean))
        .join('、')}`,
    );
  if (list.caseYear)
    parts.push(
      `${decoder.decodeField('caseyear')}：${decoder
        .decodeValues('caseyear', list.caseYear.split('$$').filter(Boolean))
        .join('、')}`,
    );
  if (list.caseStatus)
    parts.push(
      `${decoder.decodeField('case_status')}：${decoder
        .decodeValues('case_status', list.caseStatus.split('$$').filter(Boolean))
        .join('、')}`,
    );
  if (parts.length === 0) return '無條件';
  return parts.slice(0, 3).join(' / ') + (parts.length > 3 ? ' …' : '');
}

export function CopyFromPrevMonthModal({
  open,
  prevYm,
  lists,
  loading,
  duplicateItems,
  onCopy,
  onClose,
}: CopyFromPrevMonthModalProps) {
  const decoder = useConditionDecoder(COPY_SUMMARY_COLUMNS);
  // F118 AC-3：待二次確認之候選（null＝無確認中之候選）
  const [pendingDup, setPendingDup] = useState<AssignmentListItem | null>(null);
  const copiedLookup = buildCopiedLookup(duplicateItems);

  // F118 AC-3：已複製過 → 先二次確認；未複製過（含 AC-10 判定不可得）→ 直接沿用既有帶入流程
  const handleUse = (list: AssignmentListItem) => {
    if (copiedLookup.has(list.listNo)) {
      setPendingDup(list);
      return;
    }
    onCopy(list);
  };

  const confirmPendingDup = () => {
    const target = pendingDup;
    setPendingDup(null);
    if (target) onCopy(target);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="copy-prev-month-modal"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-base font-semibold text-gray-800">
                  從上月複製名單
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  上月（<code className="font-mono text-primary">{prevYm}</code>）啟用中名單；點「使用此名單」帶入欄位至新名單
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="btn-close-copy-modal"
              aria-label="關閉"
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div
                data-testid="copy-modal-loading"
                className="p-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                載入上月名單中...
              </div>
            )}

            {!loading && lists.length === 0 && (
              <div
                data-testid="copy-modal-empty"
                className="p-8 flex flex-col items-center text-center"
              >
                <ClipboardList className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  上月（{prevYm}）無啟用中名單可複製
                </p>
              </div>
            )}

            {!loading && lists.length > 0 && (
              <ul className="space-y-2">
                {lists.map((l) => {
                  // F118：null＝未複製過或判定不可得（AC-10 降級）→ 不渲染徽章
                  const copiedToListNo = copiedLookup.get(l.listNo) ?? null;
                  return (
                  <li
                    key={l.listNo}
                    data-testid={`copy-row-${l.listNo}`}
                    data-already-copied={copiedToListNo !== null ? 'true' : 'false'}
                    data-copied-to-list-no={copiedToListNo ?? ''}
                    className="border border-gray-200 rounded-lg p-3 hover:border-primary transition flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-primary text-sm">
                          {l.listNo}
                        </span>
                        <span className="text-sm font-medium text-gray-800">
                          {l.listNm}
                        </span>
                        {l.crEnabled === true && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700">
                            <Recycle className="w-3 h-3" />
                            CR 啟用
                          </span>
                        )}
                        {l.crEnabled === false && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500">
                            CR 停用
                          </span>
                        )}
                        {copiedToListNo !== null && (
                          <AlreadyCopiedBadge copiedToListNo={copiedToListNo} />
                        )}
                      </div>
                      <p className="text-xs text-gray-600 break-all">
                        {formatConditionSummary(l, decoder)}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        建立者 {l.createdBy} · 階段 {stageLabel(l.stage)}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`btn-use-${l.listNo}`}
                      onClick={() => handleUse(l)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 shrink-0"
                    >
                      使用此名單
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/50 flex items-start justify-between gap-3">
            <div className="text-[11px] text-gray-500 space-y-1">
              <p>
                複製後帶入名稱（月份自動前捲）、卡別、CR 開關、篩選條件與撈案期間；名單編號於儲存時重新產生。
              </p>
              <p className="flex items-start gap-1">
                <CopyCheck className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#4338CA' }} />
                標示「已複製為 …」者，代表本月已有條件與卡別完全相同的名單；仍可選用，但需二次確認。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-white shrink-0"
            >
              取消
            </button>
          </div>
        </div>
      </div>

      {/* F118 AC-3：巢狀二次確認 dialog（僅在點擊「已複製過」候選時出現） */}
      {pendingDup && (
        <DuplicateConfirmDialog
          sourceListNo={pendingDup.listNo}
          targetListNo={copiedLookup.get(pendingDup.listNo) ?? ''}
          onCancel={() => setPendingDup(null)}
          onConfirm={confirmPendingDup}
        />
      )}
    </div>
  );
}
