import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getCurrentWorkYm } from '@/api/assignment-list';

/**
 * F097 / US-137 / AD-E07-27 §27.5 — 分派作業月份共享狀態（AssignmentWorkYmContext）
 *
 * 概念分離（glossary §1 / §2）：
 *   - currentWorkYm（系統錨點月）：真實日曆當月，由後端 GET /api/v1/system/current-work-ym 取得，
 *     前端不得自行 new Date() 計算。
 *   - targetWorkYm（分派作業月份 / 作業月）：使用者正在作業的目標月份，預設 = currentWorkYm + 1（下月）。
 *
 * 涵蓋頁面（consume）：名單定義 / 準備完成摘要 / Stage 0 試算 / 月名單分派觸發（四頁，一處切換全頁同步）。
 * 不涵蓋：月名單分派歷史頁（run-history，獨立 local state）、下游結果頁（讀 run.project_workym，不加 MonthPicker）。
 *
 * 值一律以 YYYYMM 字串表示（與後端 / DB project_workym 一致）；MonthPicker 之 YYYY-MM 由消費頁轉換。
 */

export interface AssignmentWorkYmContextValue {
  /** 系統錨點月（YYYYMM），由 API 取得；初始化前為 '' */
  currentWorkYm: string;
  /** 分派作業月份（YYYYMM），預設 = currentWorkYm + 1 */
  targetWorkYm: string;
  /** 更新分派作業月份（YYYYMM） */
  setTargetWorkYm: (ym: string) => void;
}

const AssignmentWorkYmContext = createContext<
  AssignmentWorkYmContextValue | undefined
>(undefined);

/**
 * addOneMonth：YYYYMM + 1 個月（跨年正確：'202512' → '202601'）。
 */
export function addOneMonth(ym: string): string {
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(4, 6), 10); // 1-based
  const total = y * 12 + (m - 1) + 1;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}${String(nm).padStart(2, '0')}`;
}

export interface AssignmentWorkYmProviderProps {
  children: ReactNode;
}

export function AssignmentWorkYmProvider({
  children,
}: AssignmentWorkYmProviderProps) {
  const [currentWorkYm, setCurrentWorkYm] = useState<string>('');
  const [targetWorkYm, setTargetWorkYm] = useState<string>('');

  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const { currentWorkYm: cur } = await getCurrentWorkYm();
        if (aborted) return;
        setCurrentWorkYm(cur);
        // 僅在使用者尚未手動選定時，以「下月」初始化（避免覆寫使用者選擇）
        setTargetWorkYm((prev) => (prev ? prev : addOneMonth(cur)));
      } catch {
        // graceful degradation：API 失敗時維持空值，消費頁自行容錯
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  const value = useMemo<AssignmentWorkYmContextValue>(
    () => ({ currentWorkYm, targetWorkYm, setTargetWorkYm }),
    [currentWorkYm, targetWorkYm],
  );

  return (
    <AssignmentWorkYmContext.Provider value={value}>
      {children}
    </AssignmentWorkYmContext.Provider>
  );
}

/**
 * useAssignmentWorkYm：consume 共享分派作業月份狀態。
 * 須在 AssignmentWorkYmProvider 之下使用。
 */
export function useAssignmentWorkYm(): AssignmentWorkYmContextValue {
  const ctx = useContext(AssignmentWorkYmContext);
  if (!ctx) {
    throw new Error(
      'useAssignmentWorkYm 必須在 AssignmentWorkYmProvider 之內使用',
    );
  }
  return ctx;
}
