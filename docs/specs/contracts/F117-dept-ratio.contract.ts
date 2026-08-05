/**
 * F117 — 部門比例設定頁僅提供「有在職處長」之部門設定
 * 共用 FE/BE 契約（type-only）。由 test-generator 於實作前撰寫，供
 * apps/api（dept-ratio.controller.ts / dept-ratio.service.ts）與
 * apps/web（apps/web/src/api/assignment-stage.ts）雙方於實作前對齊。
 *
 * 權威來源：
 *   - docs/specs/features/F117-dept-ratio-director-required-filter.md §5（AC-1~AC-10 / BR-1~BR-11）
 *   - docs/specs/features/F079-set-dept-ratio.md §5（母流程契約，本檔僅疊加增量欄位）
 *   - docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md §4（GET 契約增量 / PUT 流程增量）
 *   - docs/specs/error-handling.md#assignment-ratio-errors（RATIO_DEPT_DIRECTOR_REQUIRED）
 *
 * 本檔為 type-only 參考契約，不含任何 runtime 邏輯，亦不是 production 程式碼；
 * 兩端實作時各自維護自己的型別檔（apps/api DTO / apps/web api client），
 * 但欄位形狀與語意須與本檔一致，不一致視為契約漂移（regression）。
 *
 * 不得修改 F079 既有欄位語意；本檔僅新增 F117 增量欄位。
 */

// ============================================================
// GET /api/v1/assignment/ratios/dept/{listNo}
// ============================================================

/**
 * Query params（F117 §5.1 增量）。
 *
 * requireDirector:
 *   - false（預設）：既有 F079 行為，回應形狀 100% 不變（AC-10 回歸基準）。
 *   - true：套用 AC-1 三分類過濾規則（BR-2）——「有處長部門」保留可編輯、
 *     「孤兒部門」保留鎖定、「無關部門」自陣列移除並計入 hiddenNoDirectorCount。
 *
 * 與既有 excludeZeroRatio（F088 準備完成摘要使用）為正交 flag，可並存（BR-8）。
 */
export interface GetDeptRatiosQuery {
  requireDirector?: boolean;
  excludeZeroRatio?: boolean; // 既有 F079/F088 flag，本契約僅重申正交性，不重複定義語意
}

/**
 * deptRatios[] 單列形狀（F079 既有欄位 + F117 增量欄位）。
 */
export interface DeptRatioRow {
  // ---- F079 既有欄位（不得變更語意） ----
  obdeptId: string;
  obdeptNm: string;
  ration: number;
  isActive: boolean; // F079 AC-2：部門是否仍有在職員工（「已下線」徽章依據）。與 hasActiveDirector 為正交維度（BR-10）
  directorName: string | null; // F079 BR-14：該部門處長姓名，無對應人員為 null

  // ---- F117 增量欄位（AD-E07-48 §4.2）：無論 requireDirector 是否帶入皆恆計算並回傳 ----
  /** BR-1 判定；directorName !== null 之布林投影（獨立欄位，前端不得以字串判定） */
  hasActiveDirector: boolean;
  /** === hasActiveDirector；孤兒部門為 false（前端 disabled 依據，AC-3） */
  isRatioEditable: boolean;
}

/**
 * GET response（F079 既有形狀 + F117 §5.1 增量欄位）。
 */
export interface GetDeptRatiosResponse {
  listNo: string;
  listNm: string;
  projectWorkym: string;
  stage: 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval' | 'ready';
  deptRatios: DeptRatioRow[];
  /**
   * 涵蓋所有回傳列（可編輯 + 鎖定），不含已隱藏之「無關部門」（AC-5）。
   * requireDirector=false 時與 F079 既有語意完全相同（AC-10）。
   */
  total: number;
  isReadOnly: boolean; // F079 既有：stage !== 'dept_ratio' 時為 true
  /**
   * F117 §5.1 新增：本次因 AC-1 被隱藏之「無關部門」數量（AC-8 資訊列來源）。
   * requireDirector=false 時恆為 0（AC-10 回歸基準）。
   */
  hiddenNoDirectorCount: number;
}

// ============================================================
// PUT /api/v1/assignment/ratios/dept/{listNo}
// ============================================================

/** PUT request body（F079 既有形狀，未變更 —— F117 僅疊加伺服器端驗證規則，見下方 BR 註記） */
export interface SetDeptRatiosRequestItem {
  obdeptId: string;
  obdeptNm: string;
  ration: number;
}

export interface SetDeptRatiosRequest {
  deptRatios: SetDeptRatiosRequestItem[];
}

/** PUT response（F079 既有形狀，未變更） */
export interface SetDeptRatiosResponse {
  listNo: string;
  savedCount: number; // 最終持久化列數（含 F117 BR-4 保留之孤兒列，非 payload 列數）
  total: number; // 最終持久化集合之加總（BR-7）
  savedAt: string;
  savedBy: string;
}

/**
 * PUT 伺服器端規則（F117 §5.2 / AD-E07-48 §4.3，皆為後端不變式，前端無需感知）：
 *
 *   BR-4  孤兒列保留：寫入前讀取既有列，識別孤兒部門（無在職處長 且 既有 ration > 0）；
 *         覆寫式 DELETE+INSERT 時孤兒列一律以既有值重新寫回，不論是否出現於 payload。
 *   BR-5  鎖定列以既有值為準：payload 若含孤兒部門且值與既有不同，忽略 payload 值，不回錯誤。
 *   BR-6  無處長新配置攔截：payload 含「無在職處長 且 非孤兒」之部門、ration > 0
 *         → 422 RATIO_DEPT_DIRECTOR_REQUIRED（見下方錯誤碼）。
 *   BR-7  加總驗證範圍 = 「payload 列（扣除被忽略之孤兒列）∪ 保留之孤兒列」之最終持久化集合，
 *         非原始 payload（既有 RATIO_SUM_NOT_100 之判定基準因此改變）。
 *   BR-9  稽核完整性：assignment_audit_log.after_value 必須含最終持久化集合（含保留之孤兒列）。
 */

// ============================================================
// 錯誤碼（error-handling.md#assignment-ratio-errors）
// ============================================================

export const RATIO_DEPT_DIRECTOR_REQUIRED = 'RATIO_DEPT_DIRECTOR_REQUIRED' as const;

export interface RatioDeptDirectorRequiredError {
  error: {
    code: typeof RATIO_DEPT_DIRECTOR_REQUIRED;
    message: string; // 訊息須指明該部門代碼（AC-6）
    details: [];
  };
}

/** HTTP 狀態碼：422（沿用既有 RATIO_SUM_NOT_100 / RATIO_OUT_OF_RANGE 之 422 慣例） */
export const RATIO_DEPT_DIRECTOR_REQUIRED_STATUS = 422 as const;
