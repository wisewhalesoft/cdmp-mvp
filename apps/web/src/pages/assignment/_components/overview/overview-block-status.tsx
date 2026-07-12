import type { ReactNode } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import type { OverviewBlock } from '@cdmp/shared';

/**
 * F111 / AC-15 — 區塊三態共用 wrapper（loading / empty / error / content）。
 *
 * 單一聚合端點架構下，四區塊共用同一次 fetch：`loading` 為 query pending（頁面級），
 * `block.error===true` 為該區塊獨立失敗（HTTP 仍 200，其餘三區塊正常，I-OVW-BLOCK-ISOLATE-01）。
 * `empty` 為合法空狀態（error=false），與 error 明確區分（I-OVW-EMPTY-NEQ-ZERO-01）。
 *
 * 三態各自具備獨立 `data-state` 屬性（loading / empty / error / content），互斥呈現。
 */

type BlockState = 'loading' | 'error' | 'empty' | 'content';

export interface OverviewBlockStatusProps<T> {
  /** 供測試查詢與外部定位；同時作為 data-testid。 */
  testId: string;
  num: number;
  title: string;
  sub?: string;
  numBg?: string;
  numFg?: string;
  /** header 右側 slot（如觸發連結 / 選定月份 chip / 結果摘要連結）。 */
  right?: ReactNode;
  /** query 是否 pending（頁面級載入態）。 */
  loading: boolean;
  /** DTO 區塊（discriminated union）；error=true 時降級呈現。 */
  block: OverviewBlock<T> | undefined;
  /** 錯誤 / 重試共用重新整理 callback。 */
  onRetry: () => void;
  /** 合法空狀態（error=false 但無資料可呈現）；父層自行判定並提供 emptyContent。 */
  isEmpty?: boolean;
  emptyContent?: ReactNode;
  /** 內容渲染（block.error===false 時，block 即為攤平後的資料）。 */
  children: (data: { error: false } & T) => ReactNode;
}

function resolveState<T>(
  loading: boolean,
  block: OverviewBlock<T> | undefined,
  isEmpty: boolean,
): BlockState {
  if (loading) return 'loading';
  if (!block || block.error === true) return 'error';
  if (isEmpty) return 'empty';
  return 'content';
}

export function OverviewBlockStatus<T>({
  testId,
  num,
  title,
  sub,
  numBg = '#DBEAFE',
  numFg = '#1D4ED8',
  right,
  loading,
  block,
  onRetry,
  isEmpty = false,
  emptyContent,
  children,
}: OverviewBlockStatusProps<T>) {
  const state = resolveState(loading, block, isEmpty);
  const isError = state === 'error';

  return (
    <section
      data-testid={testId}
      data-state={state}
      className={`bg-white rounded-xl border p-5 ${
        isError ? 'border-red-200' : 'border-[#E5E7EB]'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-800 inline-flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-semibold"
            style={
              isError
                ? { background: '#FEE2E2', color: '#B91C1C' }
                : { background: numBg, color: numFg }
            }
          >
            {num}
          </span>
          {title}
          {sub && state === 'content' && (
            <span className="text-xs text-gray-400 font-normal">{sub}</span>
          )}
        </h2>
        {state === 'content' && right ? <div>{right}</div> : null}
      </div>

      {state === 'loading' && (
        <div className="grid grid-cols-1 gap-3" data-testid={`${testId}-loading`}>
          <div className="h-16 rounded-md bg-gray-100 animate-pulse" />
          <div className="h-16 rounded-md bg-gray-100 animate-pulse" />
        </div>
      )}

      {state === 'error' && (
        <div
          data-testid={`${testId}-error`}
          className="rounded-lg bg-red-50/60 border border-red-200 p-6 flex flex-col items-center text-center"
        >
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <CloudOff className="w-6 h-6 text-[#EF4444]" />
          </div>
          <p className="text-sm font-semibold text-red-900">
            {(block && block.error === true && block.message) ||
              '本區塊資料暫時無法取得，請稍後重試'}
          </p>
          <p className="text-xs text-red-700 mt-1">
            其他區塊不受影響（單一來源失敗時整體仍回 HTTP 200）。
          </p>
          <button
            type="button"
            data-testid={`${testId}-retry`}
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#EF4444] border border-red-300 rounded-md hover:bg-red-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            重試
          </button>
        </div>
      )}

      {state === 'empty' && (
        <div data-testid={`${testId}-empty`}>{emptyContent}</div>
      )}

      {state === 'content' && block && block.error === false && (
        <div data-testid={`${testId}-content`}>{children(block)}</div>
      )}
    </section>
  );
}
