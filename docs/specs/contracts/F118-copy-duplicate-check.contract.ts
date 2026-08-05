/**
 * F118 — 從上月複製名單顯示「已複製過」提示
 * 共用 FE/BE 契約（type-only）。由 test-generator 於實作前撰寫，供
 * apps/api（assignment-list.controller.ts / assignment-list.service.ts）與
 * apps/web（apps/web/src/api/assignment-list.ts / _components/copy-from-prev-month-modal.tsx /
 * list-create-draft-page.tsx）雙方於實作前對齊。
 *
 * 權威來源：
 *   - docs/specs/features/F118-copy-from-prev-month-duplicate-indicator.md §4（AC-1~AC-11）/ §5 / §6（BR-1~BR-9）
 *   - docs/specs/features/F050-create-list-definition.md §4 AC-5（母流程；「從上月複製」宿主，
 *     OQ-F118-B3 裁決已對齊「以現行實作為準」——帶入名稱/前捲月份、cr_enabled 沿用來源、
 *     帶入 card_type、候選過濾 status='active' AND condition_payload IS NOT NULL，無 stage='ready'）
 *   - docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md §5（GET 端點契約 v1.1 / checkCopyDuplicates 虛擬碼 / §5.3 ORDER BY 修正）
 *   - docs/test-specs/features/F118-test.md（測試場景全表 + 本檔未涵蓋之 test-id 裁定）
 *
 * 本檔為 type-only 參考契約，不含任何 runtime 邏輯，亦不是 production 程式碼；
 * 兩端實作時各自維護自己的型別檔（apps/api DTO / apps/web api client），
 * 但欄位形狀、語意、guard 行為、test-id 須與本檔一致，不一致視為契約漂移（regression）。
 *
 * 不得修改 F050 既有「從上月複製」帶入欄位行為（AC-8）；本檔僅新增 F118 增量端點與 UI 契約。
 */

// ============================================================
// GET /api/v1/assignment/lists/copy-duplicate-check
// ============================================================

/**
 * Query params（F118 §5.1.1，人工審閱閘定案 v1.1：GET，非 AD-E07-48 v1.0 之 POST 草案）。
 *
 * 兩者皆必填、格式 YYYYMM（6 碼數字）；格式違反或缺漏 → 422 VALIDATION_ERROR
 * （沿用本 controller 既有 `ym` 查詢參數之慣例，非另創錯誤碼 —— F118 §5.2 明訂本 feature
 * 不新增錯誤碼）。
 *
 * currentYm 由呼叫端帶入（F097 作業月語意），後端**不得**自行推導系統當月（AC-5）。
 * prevYm 與呼叫端決定 Modal 候選清單所用之 `computePrevYm(currentYm)` 應為同一值（AC-5 末句）。
 */
export interface CopyDuplicateCheckQuery {
  prevYm: string; // YYYYMM
  currentYm: string; // YYYYMM
}

/** items[] 單筆判定結果（BR-9 候選過濾：prevYm 全部 status='active' AND condition_payload IS NOT NULL） */
export interface CopyDuplicateCheckItem {
  listNo: string; // prevYm 候選之 listNo
  alreadyCopied: boolean;
  /** alreadyCopied=false 時恆為 null；true 時為本月等價名單之 listNo（多筆等價取 list_no 最小者，BR-4） */
  copiedToListNo: string | null;
}

export interface CopyDuplicateCheckResponse {
  prevYm: string;
  currentYm: string;
  items: CopyDuplicateCheckItem[];
}

/**
 * 後端不變式（AD-E07-48 §5.2 / §8，皆為後端不變式，前端無需感知）：
 *
 *   BR-1 / I-F118-SINGLE-NORMALIZE-01
 *     判定與 AssignmentListService.findActiveConditionDuplicate（F050 建立/編輯流程之
 *     422 LIST_NO_DUPLICATE 判定）共用同一 private normalizeConditionPayload。
 *     結構性保證：對 alreadyCopied=false 之候選原樣 createList 不得 422；
 *     對 alreadyCopied=true 之候選原樣 createList 必定 422 且
 *     details.conflictListNo === copiedToListNo（AC-2 雙向一致性）。
 *
 *   BR-3 / I-F118-CONST-QUERY-01
 *     查詢次數為常數（loadSystemFixedFields + 上月候選 + 本月 active 名單 = 3 次），
 *     不隨候選筆數 N 線性增加（AC-7）。
 *
 *   BR-4 / I-F118-CONFLICT-ORDER-01
 *     多筆同簽章等價名單時，選取 list_no 字典序最小者；
 *     findActiveConditionDuplicate 之既有查詢同步加上相同 ORDER BY（§5.3，
 *     對既有已上線程式碼之唯一修改點，需回歸測試）。
 *
 *   BR-5   正規化排除 pooldata_field_whitelist.is_system_fixed=true 欄位（如 best_case）。
 *   BR-6 / 不引入快取：Modal 每次開啟重新查詢（AC-6）。
 *   BR-7   card_type 為判定之一部分，NULL 與 NULL 視為相等；不同視為不等價。
 *   BR-8   僅比對本月 status='active' 之名單。
 *   BR-9   候選過濾 = prevYm 之 status='active' AND condition_payload IS NOT NULL（不含 stage='ready'）。
 *
 *   AC-10 / I-F118-READONLY-JUDGE-01
 *     判定失敗（DB 錯誤等）不阻擋 Modal；以「全部未標示」降級，Modal 正常列出候選。
 *     判定端點本身不寫入任何資料表，不影響 createList/updateList 既有 422 檢查路徑。
 */

// ============================================================
// Guard（AD-E07-48 §5.1）
// ============================================================

/**
 * class 級既有 DirectorOrSectionChiefGuard（讀）；method **不**加 @RequireDirector
 * （比照既有 getFullSnapshot 唯讀端點慣例）。
 * **不**套用 FeatureFlagGuard（ENABLE_E07_REFACTOR_PHASE3）/ LIST_HISTORICAL_READONLY /
 * ASSIGNMENT_RUN_ALREADY_RUNNING（純唯讀提示，不影響任何寫入路徑，I-F118-READONLY-JUDGE-01）。
 *
 * RBAC 矩陣（與既有 GET /assignment/lists 等唯讀端點一致）：
 *   未登入            → 401 AUTH_TOKEN_MISSING
 *   businessRole=null → 403 E07_ROLE_NOT_ASSIGNED
 *   section_chief     → 200（唯讀，非寫入）
 *   director / admin  → 200
 *
 * 路由宣告位置：assignment/lists controller 下新增 @Get('copy-duplicate-check')，
 * **必須宣告於任何 @Get(':listNo...') 動態路由之前**（GET 化後新引入之排序限制）。
 */

// ============================================================
// 前端整合契約（本 feature 之增量部分；未涵蓋於既有 F050 前端契約）
// ============================================================

/**
 * apps/web/src/api/assignment-list.ts 新增匯出函式（型別參考，實作細節前端自定）：
 *
 *   export function checkCopyDuplicates(
 *     params: { prevYm: string; currentYm: string },
 *   ): Promise<CopyDuplicateCheckResponse>
 *
 *   呼叫 GET /assignment/lists/copy-duplicate-check?prevYm=...&currentYm=...
 */

/**
 * CopyFromPrevMonthModal 新增 optional prop（既有 props 不變，AC-8 回歸）：
 *
 *   duplicateItems?: CopyDuplicateCheckItem[]
 *
 *   - undefined（或省略）：AC-10 降級 —— 行為與 F118 實作前完全相同（無徽章、無二次確認）。
 *   - 有值：依 listNo 建立 lookup；alreadyCopied=true 之候選列渲染徽章 + 二次確認流程。
 */

/**
 * test-id 契約（前端實作與 e2e fidelity 測試共同權威）。
 * 前綴 "★prototype" 者逐字沿用 prototypes/27a-list-create-draft.html 既有 data-testid；
 * 其餘為 docs/test-specs/features/F118-test.md 新定義（prototype 原型僅有 id，無 data-testid）。
 */
export const F118_TEST_IDS = {
  /** ★prototype L1200：靛紫 pill，含「已複製為 {copiedToListNo}」，純文字不可導航（D-8） */
  alreadyCopiedBadge: 'already-copied-badge',
  /** 既有（F050）候選列 test-id 慣例：copy-row-{listNo}；F118 追加 data-already-copied / data-copied-to-list-no 屬性 */
  candidateRowPrefix: 'copy-row-', // + listNo
  /** 既有（F050）「使用此名單」按鈕：btn-use-{listNo} */
  useButtonPrefix: 'btn-use-', // + listNo
  /** 二次確認彈窗（AC-3），本檔新定義 */
  dupConfirmModal: 'dup-confirm-modal',
  dupConfirmTargetListNo: 'dup-confirm-target-list-no',
  btnConfirmDupCopy: 'btn-confirm-dup-copy',
  btnCancelDupCopy: 'btn-cancel-dup-copy',
  /** ★prototype L165：role="status"，AC-11 持續提醒列 */
  dupReminderBanner: 'dup-reminder-banner',
  /** 關閉 AC-11 提醒列，本檔新定義 */
  btnCloseDupReminder: 'btn-close-dup-reminder',
} as const;

// ============================================================
// 錯誤碼
// ============================================================

/** 本 feature 不新增錯誤碼（§5.2）。真正的重複攔截仍為既有 F050 LIST_NO_DUPLICATE（422）。 */
export const F118_NO_NEW_ERROR_CODES = true as const;
