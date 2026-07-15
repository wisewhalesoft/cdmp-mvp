import {
  Copy,
  X,
  Recycle,
  ChevronRight,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import type { AssignmentListItem } from '@/api/assignment-list';
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
  onCopy: (list: AssignmentListItem) => void;
  onClose: () => void;
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
  onCopy,
  onClose,
}: CopyFromPrevMonthModalProps) {
  const decoder = useConditionDecoder(COPY_SUMMARY_COLUMNS);
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
                {lists.map((l) => (
                  <li
                    key={l.listNo}
                    data-testid={`copy-row-${l.listNo}`}
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
                      onClick={() => onCopy(l)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 shrink-0"
                    >
                      使用此名單
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              複製後帶入名稱、卡別、CR 開關、篩選條件與撈案期間；名單編號於儲存時重新產生。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-white"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
