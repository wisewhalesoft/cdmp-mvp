---
type: test-design-feature
feature_id: F111
feature_name: 分派總覽儀表板（客戶名單分派模組新首頁；部長 / 處長 / Admin 唯讀彙總）
priority: P1
related_spec: /docs/specs/features/F111-assignment-overview-dashboard.md
source_ad: /docs/specs/implementation-log/AD-E07-46-assignment-overview-dashboard.md
source_stories: [US-177]
spec_version: "1.0"
ad_version: "1.0"
last_updated: 2026-07-12
blocked_by: [F049, F088, F063, F064, F097]
related: [F050, F055, F056, AD-E07-45]
---

# F111：分派總覽儀表板（客戶名單分派模組新首頁）— 測試設計

> ⚠️ **範圍**：本文件為測試設計（test design），是 tdd-implementation 的**可執行真值來源**。**不含** production code、測試實作碼（`.spec.ts`）。依 CLAUDE.md Agent Workflow 邊界，test-designer 僅設計測試場景，不寫產品程式碼、不寫實際 test 檔。
>
> **驗收紅線（Definition of Done）**：
> 1. **區塊獨立失敗全綠**（AC-15 / BR-9 / I-OVW-BLOCK-ISOLATE-01）：四區塊任一（或多個同時）拋例外時，HTTP 恆為 200，僅該區塊 `{error:true, errorCode}`，其餘區塊正常 = 核心紅線。
> 2. **Guard 例外不受區塊包裝影響**（I-OVW-GUARD-PROPAGATE-01）：`role='user'` 呼叫必須是**真正的 403**（HTTP 層級），**不可**被誤實作為 200 + 四區塊皆 error = 高風險紅線（AD §9 特別點名之易誤植陷阱）。
> 3. **empty ≠ zero ≠ error 三態不可混淆**（BR-4 / I-OVW-EMPTY-NEQ-ZERO-01）：`hasActiveLists=false⇒total=null`（非 0）；`hasCompletedRun=false` 為合法空狀態（`error=false`），**不得**與底層拋例外之 `error=true` 混淆 = 核心紅線（AD §3.4 明文警告之實作陷阱）。
> 4. **去重不變式**（I-OVW-DEDUP-01）：`selectedYm===currentWorkYm` 或 `selectedYm===targetWorkYm` 兩種對稱情境下，`computeDeptEstimate` 皆恰呼叫 2 次（非 3 次）。
> 5. **Scope 透傳、不重新實作**（I-OVW-SCOPE-PASSTHROUGH-01）：聚合層不得自行判斷 `deptCode` 比對或資料列過濾；一律驗證 `actor` 有透傳給下游服務。
> 6. **`tsc --noEmit -p tsconfig.build.json` 零錯誤**（`@cdmp/shared` 新增 `AssignmentOverviewResponse` 全部巢狀 interface，feedback_vitest_no_typecheck 教訓：vitest 不做型別檢查，必跑）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F111 spec](../../specs/features/F111-assignment-overview-dashboard.md)（§4 AC-1~17 / §5 DTO / §6 BR-1~13）+ [AD-E07-46](../../specs/implementation-log/AD-E07-46-assignment-overview-dashboard.md)（§3 全部設計決策 + §7 不變式 + §9 測試邊界建議 + §10 檔案異動清單）|
| QA / Tester | 本文件（全部）+ error-handling.md#assignment-role-errors |
| CI/CD Owner | 本文件「自動化就緒度」；全數 mock，無 PG/MSSQL 依賴，CI 常駐 |
| Product Analyst | 本文件「相依與風險」+ AD §11（風險與殘留議題，2 項待業務確認事項） |

---

## Glossary（防漂移 — 識別符一覽）

> 所有實作必須嚴格遵守下列識別符，源自 F111 spec §5.2 凍結 DTO 與 AD-E07-46 §3/§4/§7 契約，防止多 agent 流程下游擅自改名（feedback_tdd_naming_drift 教訓）。

| 識別符 | 不可改為 |
|---|---|
| `errorCode` 四值：`STAGE_TODO_UNAVAILABLE` / `RUN_READINESS_UNAVAILABLE` / `DIALING_VOLUME_UNAVAILABLE` / `RECENT_RUN_UNAVAILABLE` | 大小寫變體 / 縮寫（如 `STAGE_UNAVAILABLE`） |
| `emptyReason` 兩值：`'noRun'` / `'noCompletedRun'` | NO_RUN / NONE / EMPTY |
| `wrapBlock` / `sumWorkdayCases` / `deriveDeptDistribution`（`assignment-overview.util.ts` 純函式） | wrapResult / sumCases / buildDeptDistribution |
| `AssignmentOverviewService.getOverview` / `fetchStageTodoBlock` / `fetchRunReadinessBlock` / `fetchDialingVolumeBlock` / `fetchRecentRunBlock` | get / fetchX |
| `DirectorOrSectionChiefGuard` + `@RequireDirectorOrSectionChief()` | SalesManagerGuard（已 DEPRECATED，見 feedback_e07_controllers_use_sales_manager_guard）|
| `E07_ROLE_NOT_ASSIGNED`（403，`role='user'` 專屬）| AUTH_FORBIDDEN / E07_FORBIDDEN_DIRECTOR_ONLY（已 DEPRECATED） |
| `scope.role` 三值：`'director'` / `'section_chief'` / `'admin'` | Director / SECTION_CHIEF（大小寫） |
| `scope.scoped`（boolean） | isScoped / scopedFlag |
| `canNavigateToTrigger` | canTrigger / showTriggerLink |
| `hasActiveLists` / `hasAnyList` / `hasCompletedRun`（三個語意不同的 boolean，**不可互相替代**） | 見下方「三個 has* 欄位對照」 |
| query key `['assignment','overview',ym]` | ['overview', ym] / ['assignment-overview', ym] |
| Sidebar 項目：「分派總覽」（`/assignment/overview`，順序 #1）/「篩選欄位」（`/assignment/field-base`，順序 #2） | 順序或路由不可調換 |
| Invariant ID：`I-OVW-COMPOSE-ONLY-01` / `I-OVW-BLOCK-ISOLATE-01` / `I-OVW-GUARD-PROPAGATE-01` / `I-OVW-DEDUP-01` / `I-OVW-EMPTY-NEQ-ZERO-01` / `I-OVW-SCOPE-PASSTHROUGH-01` / `I-OVW-NO-WRITE-01` | 不可簡寫 |

### 三個 `has*` 欄位對照（易混淆，逐一區分）

| 欄位 | 所屬區塊 | 語意 | `false` 時的正確表現 |
|---|---|---|---|
| `stageTodo.hasAnyList` | 區塊一 | 選定月份是否存在**任何**（含 disabled）`ob_list_definition` | 五張 KPI 卡皆 0 + 引導文案（AC-4） |
| `dialingVolume.headline.<month>.hasActiveLists` | 區塊三 | 該月（依 scope）是否 ≥1 active 名單**且**估算出非空 `departments[]` | `total=null`（非 0，AC-9 / BR-4） |
| `recentRun.hasCompletedRun` | 區塊四 | 選定月份是否存在 ≥1 筆 `completed` 月跑 | 依 `emptyReason` 差異化空狀態（AC-14） |

> `stageTodo.notReadyLists=[]` 可能對應兩種完全不同情境（詳見 D 組 EMPTY-008/009）：(a) `hasAnyList=false`（本月無任何名單）或 (b) `hasAnyList=true` 但全數已 `ready`（本月有名單、皆已完成）。兩者 UI 文案不同，**不可共用同一個空狀態分支**。

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| **測試邊界**（AD-E07-46 §10）| `AssignmentOverviewService` 本身**零 SQL**、**零 Repository 注入**（I-OVW-COMPOSE-ONLY-01），僅呼叫 5 個既有服務之 public method。因此 `assignment-overview.service.spec.ts` / `.controller.spec.ts` / `.util.spec.ts` **全數可以純 mock 進行，不需要真實 DB 連線**（無 PG、無 MSSQL 依賴），CI 常駐執行。四個底層服務（`listLists` / `calculateReadiness` / `computeDeptEstimate` / `listRuns` + `getSummary`）各自既有的 DB 測試邊界維持不變，本文件不重複驗證其內部 SQL 正確性，只驗證「聚合層如何組裝/隔離/透傳這些服務的回應」。 |
| 主要測試層 | Backend Unit（`assignment-overview.service.spec.ts` 以 `vi.fn()` mock 5 個注入服務；`assignment-overview.controller.spec.ts` 以 Supertest + mock service 驗證 guard/route；`assignment-overview.util.spec.ts` 純函式）；Frontend Component（React Testing Library + MSW，mock `getAssignmentOverview` API） |
| Regression Guard | `I-OVW-COMPOSE-ONLY-01`（零 Repository 注入）/ `I-OVW-GUARD-PROPAGATE-01`（guard 例外不受 wrapBlock 影響）/ `I-OVW-NO-WRITE-01`（無寫入呼叫）三者皆以靜態掃描或型別/DI 層級驗證，非功能性斷言 |
| Mock 而非 Stub | 5 個注入服務（`AssignmentListService` / `MonthlyRunReadinessService` / `Stage0EstimateService` / `AssignmentRunService` / `AssignmentRunReportService`）以 `vi.fn().mockResolvedValue(...)` / `mockRejectedValue(...)` 提供，回傳值形狀須精確符合各自既有回應型別（`Stage0DeptEstimateResult` 等），非任意簡化物件 |
| 前端狀態管理 | TanStack Query 單一 query key `['assignment','overview', ym]`；四區塊共用同一次 fetch 結果，元件邊界對齊 DTO 邊界（`response.stageTodo`/`.runReadiness`/`.dialingVolume`/`.recentRun`），非四個獨立 HTTP 請求 |
| **AC-3 月份切換之「各自獨立載入」設計澄清** | 因架構決策為單一聚合端點（非四個獨立端點），月份切換時四區塊**同時**發出、**同時**回應，不存在「區塊 A 已完成、區塊 B 仍載入」之時間差情境。AC-3「尚未回應之區塊各自顯示載入中狀態」在此架構下等價於「整頁（四區塊）共用同一個載入態，回應後依各自 `error`/資料分流」；本文件 O 組（前端）依此架構事實設計，不虛構不存在的跨區塊非同步時序測試（見「風險與缺口」第 1 項）。 |

---

## Acceptance Test Design（AC-1 ~ AC-17 對照）

| AC | Given / When / Then 摘要 | 對應 TS |
|---|---|---|
| AC-1 | director/section_chief/admin → 200；`user` → 403 `E07_ROLE_NOT_ASSIGNED`；admin 視角等同部長 | CTRL-001~006, SVC-002 |
| AC-2 | 處長 `scope.scoped=true`；部門列僅轄區；`orgTotal`/`deptAssignedTotal`/`gap`/`ratio`=null | SCOPE-001~002, UTIL-009 |
| AC-3 | 月份選擇器預設下月；切換月份四區塊依新 `ym` 重載；未回應區塊顯示載入中 | FE-MONTH-001~003, FE-STATE-006 |
| AC-4 | 五張 KPI 卡對應 `stageCounts`；點擊導向 Kanban 並聚焦；`hasAnyList=false` 空狀態 | EMPTY-008, FE-PANEL-001~002 |
| AC-5 | `notReadyLists` 逐筆可點導向 Detail Drawer；全數 `ready` 時正向提示 | EMPTY-009, FE-PANEL-003~005 |
| AC-6 | `allReady` + `readyCount/totalActiveLists`；`monthlyRunStatus` 獨立於 `allReady`；`running` 額外提示 | FE-PANEL-006~007 |
| AC-7 | 4 項 ETL 來源 + 計分卡狀態；未通過項警示+簡短原因 | FE-PANEL-008 |
| AC-8 | 本頁不提供觸發按鈕；`canNavigateToTrigger` 依角色差異化 | SCOPE-003~005, FE-PANEL-009 |
| AC-9 | 本月/次月固定對比（不受選擇器影響）；`hasActiveLists=false⇒total=null` | EMPTY-001~003, FE-PANEL-010~011 |
| AC-10 | 選定月份每日圖表；hover 顯示明細；非工作日不計入 | FE-PANEL-012~013 |
| AC-11 | 部門分佈；`overThreshold` 紅色警示；`threshold=null` 不警示；`perPerson=null` 顯示「—」 | UTIL-004~010, FE-PANEL-014~016 |
| AC-12 | 處長僅見轄區；本月/次月對比標示「（僅本部門）」 | SCOPE-001, EMPTY-002（scopedToDept） |
| AC-13 | `deptSummary`/`levelDistribution`/`tierDistribution`；`alert` 警示；處長僅轄區列 | RECENT-001~004, FE-PANEL-018, FE-PANEL-023 |
| AC-14 | `hasCompletedRun=false` 依 `emptyReason` 差異化文案；不 fallback 其他月份 | EMPTY-004~007, FE-PANEL-019~022 |
| AC-15 | Loading/Empty/Error 三態各自明確；任一區塊失敗不影響其他三區塊 | ISO-001~008, FE-STATE-001~006 |
| AC-16 | 所有可點擊元素僅導覽；不呼叫寫入 API | STATIC-004, FE-READONLY-001 |
| AC-17 | 「分派總覽」為 sidebar 第 1 項；「篩選欄位」第 2 項 | FE-SIDEBAR-001~005 |

---

## 追溯矩陣（BR / Invariant → 測試場景）

| BR / Invariant | 摘要 | 對應 TS |
|---|---|---|
| BR-1 / I-OVW-NO-WRITE-01 | 完全唯讀 | STATIC-001, STATIC-004, FE-READONLY-001 |
| BR-2 | 薄型聚合、不新增重查詢 | STATIC-001 |
| BR-3 / I-OVW-SCOPE-PASSTHROUGH-01 | 處長 scope = 安全邊界，透傳而非重新實作 | SCOPE-002, UNSCOPED-001~002, UTIL-009 |
| BR-4 / I-OVW-EMPTY-NEQ-ZERO-01 | empty ≠ zero | EMPTY-001~009 |
| BR-5 | 最近一次月跑選取（`finishedAt` desc，次選 `triggeredAt`） | RECENT-001~004 |
| BR-6 | 月份選擇器 vs 固定本月/次月軸為獨立維度 | EMPTY-001~002（headline 固定），FE-MONTH-001 |
| BR-7 | 就緒燈號 vs 月跑狀態為不同維度 | FE-PANEL-006 |
| BR-8 | 月跑空狀態兩態 | EMPTY-004~007 |
| BR-9 / I-OVW-BLOCK-ISOLATE-01 | 區塊獨立失敗 | ISO-001~008 |
| BR-10 / I-OVW-NO-WRITE-01 | 無寫入 API | STATIC-004, FE-READONLY-001 |
| BR-11 | 待辦清單不分頁（前端 50 筆上限） | FE-PANEL-005 |
| BR-12 | 全域重新整理 | （前端互動細節，交 tdd-implementation 依 UI 元件庫慣例實作；本文件不另立測項，涵蓋於 FE-MONTH-002 之重取邏輯） |
| BR-13 | Sidebar 排序 | FE-SIDEBAR-001~003 |
| I-OVW-COMPOSE-ONLY-01 | 零 Repository 注入 | STATIC-001 |
| I-OVW-GUARD-PROPAGATE-01 | Guard 例外不受區塊包裝影響 | CTRL-010 |
| I-OVW-DEDUP-01 | `computeDeptEstimate` 去重 | DEDUP-001~004 |

---

## 一、後端測試場景

> 目標檔案：`assignment-overview.controller.spec.ts`（CTRL 組）／`assignment-overview.service.spec.ts`（SVC-COMPOSE / ISO / EMPTY / DEDUP / HAL / SCOPE / UNSCOPED / RISK / RECENT / STATIC-002~004 組）／`assignment-overview.util.spec.ts`（UTIL 組）。

### A. CTRL — Controller：Guard / 角色 / 路由（AC-1，I-OVW-GUARD-PROPAGATE-01）

> 對齊 AD §9「Guard 例外不受影響 regression guard」：本組 mock `AssignmentOverviewService`（不觸及其內部邏輯），專注驗證 guard pipeline 與 controller 層之 query 解析。

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-CTRL-001 | `businessRole='director'` → 200 | AC-1 | Director JWT；mock service 回傳合法 `AssignmentOverviewResponse` | GET `/api/v1/assignment/overview?ym=202608` | HTTP 200；body 為完整 `AssignmentOverviewResponse` 形狀 |
| TS-F111-CTRL-002 | `businessRole='section_chief'` → 200 | AC-1 | Section Chief JWT | GET `/api/v1/assignment/overview?ym=202608` | HTTP 200 |
| TS-F111-CTRL-003 | `role='admin'` → 200 | AC-1 | Admin JWT（`businessRole=null`） | GET `/api/v1/assignment/overview?ym=202608` | HTTP 200 |
| TS-F111-CTRL-004 | `role='user'`（無 businessRole）→ 403 `E07_ROLE_NOT_ASSIGNED`，service 未被呼叫 | AC-1 | Plain user JWT | GET `/api/v1/assignment/overview` | HTTP 403；`error='E07_ROLE_NOT_ASSIGNED'`；`service.getOverview` **未被呼叫**（spy 驗證呼叫次數 0） |
| TS-F111-CTRL-005 | 未帶 Token → 401 `AUTH_TOKEN_MISSING` | 前置條件（F111 §3）| 無 Authorization header | GET `/api/v1/assignment/overview` | HTTP 401 |
| TS-F111-CTRL-006 | Token 過期 → 401 `AUTH_TOKEN_EXPIRED` | 前置條件 | 過期 JWT | GET `/api/v1/assignment/overview` | HTTP 401 |
| TS-F111-CTRL-007 | `ym` 格式不符（非 6 位數字）→ 400 `VALIDATION_ERROR`，service 未被呼叫 | F111 §5.1 Query | Director JWT；`ym='2026-08'` 與 `ym='abcdef'` 兩變體 | GET `/api/v1/assignment/overview?ym=2026-08` | HTTP 400；`error='VALIDATION_ERROR'`；`service.getOverview` 未被呼叫 |
| TS-F111-CTRL-008 | `ym` 省略 → controller 以 `SystemService.getCurrentWorkYm()` 作為 `selectedYm` 傳入 service | F111 §5.1 | Director JWT；mock `systemService.getCurrentWorkYm()='202607'` | GET `/api/v1/assignment/overview`（無 `ym` query） | `service.getOverview` 被呼叫時第一參數 `==='202607'` |
| TS-F111-CTRL-009 | `ym` 有值 → 原樣透傳，不套用預設值 | F111 §5.1 | `ym='202609'` | GET `/api/v1/assignment/overview?ym=202609` | `service.getOverview` 被呼叫時第一參數 `==='202609'`（非 `getCurrentWorkYm()`） |
| TS-F111-CTRL-010 | ⚠️【紅線】`role='user'` 時回應**必須**是真正的 HTTP 403，**不可**被誤實作為 200 + 四區塊皆 `error:true` | I-OVW-GUARD-PROPAGATE-01（AD §9 特別點名） | Plain user JWT | GET `/api/v1/assignment/overview` | HTTP status **精確為 403**（非 200）；response body **不含** `stageTodo`/`runReadiness`/`dialingVolume`/`recentRun`/`scope` 任一鍵（即非 `AssignmentOverviewResponse` 形狀）；body 為標準錯誤格式 `{error, message}` |
| TS-F111-CTRL-011 | 端點不受 `FeatureFlagGuard(ENABLE_E07_REFACTOR_PHASE3)` 影響（OQ-F111-04 裁定 regression guard） | AD §3.3 裁定 | Director JWT；環境變數 `ENABLE_E07_REFACTOR_PHASE3` 分別設為 `false`/未設定 | GET `/api/v1/assignment/overview` | HTTP 200（不因該旗標關閉而被攔截，對齊 `Stage0EstimateController` 既有讀取端點慣例） |

### B. SVC-COMPOSE — 組合成功路徑（Composition Happy Path）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-SVC-001 | 部長視角：5 個服務全數成功 → 組裝完整 response | AC-1, F111 §5.2 | mock `listLists`/`calculateReadiness`/`computeDeptEstimate`/`listRuns`/`getSummary` 皆回傳合法值（見「測試資料」章節 Fixture-Director）；actor businessRole='director' | 呼叫 `getOverview('202608', directorActor)` | 四區塊皆 `error:false`；`selectedYm='202608'`；`currentWorkYm`/`targetWorkYm` 取自 `SystemService`；`scope={role:'director',deptCode:null,scoped:false}` |
| TS-F111-SVC-002 | Admin 視角：組裝結果與 director 等價（全公司、不限轄區） | AC-1 末條 | actor `role='admin'`，其餘 mock 同 SVC-001 | 呼叫 `getOverview('202608', adminActor)` | `scope={role:'admin',deptCode:null,scoped:false}`；其餘欄位與 SVC-001 同構 |

### C. ISO — 區塊獨立失敗（AC-15 / BR-9 / I-OVW-BLOCK-ISOLATE-01）

> ⚠️【核心紅線群組】驗證 AD §3.4 之 `wrapBlock` + `Promise.allSettled` 機制：任一（或多個）底層服務拋例外，**端點整體恆回 HTTP 200**，僅該區塊降級。

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-ISO-001 | `listLists` 拋例外 → `stageTodo.error=true` | AC-15, BR-9 | mock `listLists` reject；其餘 4 個服務成功 | `getOverview` | HTTP 200；`stageTodo={error:true, errorCode:'STAGE_TODO_UNAVAILABLE', message:<zh-TW文字>}`；`runReadiness`/`dialingVolume`/`recentRun` 皆 `error:false` 且資料完整 |
| TS-F111-ISO-002 | `calculateReadiness` 拋例外 → `runReadiness.error=true` | AC-15, BR-9 | mock `calculateReadiness` reject | `getOverview` | `runReadiness={error:true, errorCode:'RUN_READINESS_UNAVAILABLE'}`；其餘 3 區塊正常 |
| TS-F111-ISO-003 | 任一次 `computeDeptEstimate`（headline 或 selected）拋例外 → `dialingVolume.error=true` | AC-15, BR-9, TC-177-12 | mock `computeDeptEstimate` 對其中一個 `ym` reject（其餘 ym 成功） | `getOverview` | `dialingVolume={error:true, errorCode:'DIALING_VOLUME_UNAVAILABLE'}`；其餘 3 區塊正常；HTTP 200（TC-177-12 對應案例） |
| TS-F111-ISO-004 | `listRuns` 拋例外 → `recentRun.error=true` | AC-15, BR-9 | mock `listRuns` reject | `getOverview` | `recentRun={error:true, errorCode:'RECENT_RUN_UNAVAILABLE'}`；其餘 3 區塊正常 |
| TS-F111-ISO-005 | `listRuns` 成功（含 1 筆 completed）但 `getSummary` 拋例外 → 同樣歸類 `recentRun.error=true` | AC-15, BR-9, AD §3.4 錯誤來源對照表 | mock `listRuns` 回傳含 1 筆 `completed`；mock `getSummary` reject | `getOverview` | `recentRun={error:true, errorCode:'RECENT_RUN_UNAVAILABLE'}`（與 ISO-004 同 errorCode，來源不同但區塊邊界相同，驗證 AD §3.4「區塊邊界為整塊而非子呼叫 granularity」） |
| TS-F111-ISO-006 | 多區塊同時失敗（如 `listLists` + `computeDeptEstimate` 同時 reject） → 各自獨立標記，未失敗區塊不受影響 | AC-15, I-OVW-BLOCK-ISOLATE-01 | mock `listLists` 與 `computeDeptEstimate` 皆 reject；`calculateReadiness`/`listRuns` 成功 | `getOverview` | `stageTodo.error=true`（`STAGE_TODO_UNAVAILABLE`）且 `dialingVolume.error=true`（`DIALING_VOLUME_UNAVAILABLE`）同時成立；`runReadiness`/`recentRun` 仍 `error:false` 且資料完整；HTTP 200 |
| TS-F111-ISO-007 | 四區塊全數失敗（極端情境） → HTTP 仍為 200，四區塊各自標記正確 `errorCode` | AC-15, I-OVW-BLOCK-ISOLATE-01（防禦性上限案例） | 5 個服務呼叫全數 reject | `getOverview` | HTTP 200；`stageTodo`/`runReadiness`/`dialingVolume`/`recentRun` 皆 `error:true`，`errorCode` 分別正確對應各自來源；response 頂層 `selectedYm`/`currentWorkYm`/`targetWorkYm`/`scope` 仍正確填值（不受區塊失敗影響，因這些欄位由 `SystemService`/純函式算出，非四個底層服務） |
| TS-F111-ISO-008 | 區塊錯誤訊息為固定 zh-TW 使用者可讀文字，不洩漏底層例外原始 message/stack | BR-9「非技術堆疊」 | mock `listLists` reject with `new Error('ECONNREFUSED 5432 detail...')` | `getOverview` | `stageTodo.message` 為固定文案（如「本區塊資料暫時無法取得，請稍後重試。」），**不含**原始例外訊息字串（`ECONNREFUSED` 等技術細節不外洩） |

### D. EMPTY — empty ≠ zero ≠ error 三態區分（BR-4 / I-OVW-EMPTY-NEQ-ZERO-01）

> ⚠️【核心紅線群組】區分「合法空值」（`error:false` 的正常回傳）與「呼叫失敗」（`error:true`），兩者在程式碼中必須是完全不同分支（AD §3.4 末段明文警告：`tdd-implementation` 落地時不得將「查無 completed run」誤實作為 throw 後被 `wrapBlock` 捕捉）。

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-EMPTY-001 | 某月 `computeDeptEstimate` 回傳 `departments=[]` → `hasActiveLists=false`，`total=null`（非 0） | AC-9, BR-4, OQ-F111-01 | mock `computeDeptEstimate(currentWorkYm)` 回傳 `{...departments:[], days:[]}` | `getOverview` | `dialingVolume.headline.currentMonth={total:null, hasActiveLists:false, ...}`（**不得**為 `total:0`） |
| TS-F111-EMPTY-002 | 某月 `departments.length>0` → `hasActiveLists=true`，`total` 為 `sumWorkdayCases` 之真實加總 | AC-9, BR-4 | mock 回傳含 `departments` 與 `days[].deptCells` 之已知案量 | `getOverview` | `hasActiveLists=true`；`total` 精確等於手算之工作日案量加總（非估算） |
| TS-F111-EMPTY-003 | `hasActiveLists=false` 為合法空值，**不等於**錯誤 → `dialingVolume.error` 仍為 `false` | BR-4, AD §3.4 末段 | 同 EMPTY-001（`computeDeptEstimate` 正常回傳、非 reject） | `getOverview` | `dialingVolume.error===false`（非 `true`）；區塊邊界正常渲染，僅 `total` 為 `null` |
| TS-F111-EMPTY-004 | `listRuns` 回傳空陣列 → `noRun` 空狀態 | AC-14, BR-8 | mock `listRuns(ym)` 回傳 `[]` | `getOverview` | `recentRun={hasCompletedRun:false, emptyReason:'noRun', latestRunStatus:null, latestRunId:null}` |
| TS-F111-EMPTY-005 | `listRuns` 僅含 `failed`/`running`/`pending`（無 `completed`）→ `noCompletedRun` 空狀態，取最新一筆之狀態 | AC-14, BR-8, TC-177-11 | mock `listRuns(ym)` 回傳 `[{status:'failed', runId:'r1', ...}]`（`listRuns` 已依 `created_at DESC` 排序，`runs[0]` 為最新） | `getOverview` | `recentRun={hasCompletedRun:false, emptyReason:'noCompletedRun', latestRunStatus:'failed', latestRunId:'r1'}` |
| TS-F111-EMPTY-006 | ⚠️【陷阱】`listRuns` 或 `getSummary` **拋例外**時，**不得**被誤判為 `noCompletedRun` 空狀態；必須落入 `recentRun.error=true` 分支 | AD §3.4 末段明文警告 | mock `listRuns` reject（同 ISO-004 情境） | `getOverview` | `recentRun.error===true`（**不是** `{hasCompletedRun:false, emptyReason:...}` 形狀）；兩種情境（空值 vs 例外）之回應物件形狀（discriminated union 之 `error` 鍵）明確不同，驗證為 tdd-implementation 兩條獨立程式碼分支 |
| TS-F111-EMPTY-007 | `hasCompletedRun=false` 兩種空狀態下，`recentRun.error` 恆為 `false` | BR-4, BR-8 | 分別以 EMPTY-004（noRun）與 EMPTY-005（noCompletedRun）情境 | `getOverview` | 兩案例之 `recentRun.error===false`（regression guard，與 EMPTY-006 對照互證） |
| TS-F111-EMPTY-008 | `listLists` 回傳 `lists=[]`（`hasAnyList=false`）→ 五階段皆 0，無未完成清單 | AC-4, BR-4 | mock `listLists` 回傳 `{lists:[], stageCounts:{draft:0,dept_ratio:0,personnel_ratio:0,approval:0,ready:0,disabled:0}}` | `getOverview` | `stageTodo={stageCounts:{...全 0}, notReadyLists:[], notReadyCount:0, hasAnyList:false}` |
| TS-F111-EMPTY-009 | ⚠️【陷阱】`listLists` 回傳之名單皆為 `active` 且 `stage='ready'`（`hasAnyList=true` 但 `notReadyLists=[]`）→ **不可**與 EMPTY-008 混淆 | AC-5 末條, D 組 has* 對照表 | mock `listLists` 回傳 8 筆全數 `status='active', stage='ready'` | `getOverview` | `stageTodo.hasAnyList===true`（**非** `false`）；`stageTodo.notReadyLists===[]`；`stageTodo.stageCounts.ready===8`（非全 0）——與 EMPTY-008 之 `notReadyLists=[]` 表面相同但 `hasAnyList` 與 `stageCounts` 截然不同，前端需依此呈現不同文案（AC-4 引導建立 vs AC-5「目前無未完成名單」正向提示） |

### E. DEDUP — `computeDeptEstimate` 去重（OQ-F111-02 / I-OVW-DEDUP-01）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-DEDUP-001 | `selectedYm === currentWorkYm`（`targetWorkYm` 相異）→ `computeDeptEstimate` 恰呼叫 2 次 | OQ-F111-02, I-OVW-DEDUP-01 | `currentWorkYm='202607'`, `targetWorkYm='202608'`, `selectedYm='202607'`；spy `computeDeptEstimate` | `getOverview('202607', actor)` | `computeDeptEstimate` 呼叫次數 `===2`（分別對應 `'202607'`、`'202608'`） |
| TS-F111-DEDUP-002 | `selectedYm === targetWorkYm`（對稱情境，AD §3.7.1 特別點名不可漏判）→ 恰呼叫 2 次 | I-OVW-DEDUP-01 | `currentWorkYm='202607'`, `targetWorkYm='202608'`, `selectedYm='202608'` | `getOverview('202608', actor)` | 呼叫次數 `===2` |
| TS-F111-DEDUP-003 | `selectedYm` 與 `currentWorkYm`/`targetWorkYm` 皆相異（三個不同月份）→ 恰呼叫 3 次 | I-OVW-DEDUP-01 | `currentWorkYm='202607'`, `targetWorkYm='202608'`, `selectedYm='202609'` | `getOverview('202609', actor)` | 呼叫次數 `===3` |
| TS-F111-DEDUP-004 | 每次呼叫之 `ym` 參數為相異值，無重複呼叫同一 `ym` | I-OVW-DEDUP-01 | 同 DEDUP-003 情境 | 檢視 spy 之 `mock.calls` 各筆第一參數 | 三次呼叫之 `ym` 參數集合恰為 `{'202607','202608','202609'}`，無重複 |

### F. HAL — `hasActiveLists` 邊界（OQ-F111-01）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-HAL-001 | 已知限制：有 active 名單但尚未設定 `ob_dept_pct` 比例（`deptCells` 全 0 遭既有「整期 0 件部門隱藏」邏輯過濾）→ `departments=[]` → `hasActiveLists` 仍判為 `false`（AD §3.7.2 已知邊界，非 bug） | AD §3.7.2, §11.1 | mock `computeDeptEstimate` 回傳 `departments=[]`（模擬「有名單但比例未設定」情境，與 EMPTY-001「完全無名單」情境同一回應形狀，聚合層無法區分兩種根因） | `getOverview` | `hasActiveLists===false`；`total===null`（此為 AD 明文裁定之刻意行為，測試斷言目的是**鎖定此行為不被未來實作意外改動**，而非驗證「應該要能區分根因」） |

### G. SCOPE — 處長轄區透傳（AC-2, AC-8, AC-12, BR-3, I-OVW-SCOPE-PASSTHROUGH-01）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-SCOPE-001 | 處長視角：`scope.deptCode` 取自 `computeDeptEstimate` 回應之 `scope.deptCode`（§3.9 附註回填機制） | AC-2, AD §3.9 | actor `businessRole='section_chief'`；mock `computeDeptEstimate` 回傳 `{scope:{role:'section_chief',deptCode:'D003',scoped:true}, departments:[...], ...}` | `getOverview(ym, sectionChiefActor)` | 頂層 `scope={role:'section_chief', deptCode:'D003', scoped:true}`（非 `null`） |
| TS-F111-SCOPE-002 | `actor` 原樣透傳給 `listLists` / `computeDeptEstimate` / `getSummary`，聚合層不重新實作任何 `deptCode` 比對邏輯 | BR-3, I-OVW-SCOPE-PASSTHROUGH-01 | actor 為固定物件 `sectionChiefActor` | `getOverview` | 三個服務之 mock 呼叫參數中皆含 `actor===sectionChiefActor`（同一參照或深比對相符，非重新建構的物件）；`AssignmentOverviewService` 原始碼中**不存在**任何 `deptCode ===` 或 `EXISTS ob_dept_pct` 字樣（regression guard，防止未來實作繞過既有服務自建過濾邏輯） |
| TS-F111-SCOPE-003 | 處長視角 `canNavigateToTrigger=false` | AC-8 | actor businessRole='section_chief' | `getOverview` | `runReadiness.canNavigateToTrigger===false` |
| TS-F111-SCOPE-004 | 部長視角 `canNavigateToTrigger=true` | AC-8 | actor businessRole='director' | `getOverview` | `runReadiness.canNavigateToTrigger===true` |
| TS-F111-SCOPE-005 | Admin 視角 `canNavigateToTrigger=true` | AC-8 末條「admin 視角等同部長」 | actor role='admin' | `getOverview` | `runReadiness.canNavigateToTrigger===true` |

### H. UNSCOPED — 區塊二就緒狀態維持全月視角（OQ-F111-03 裁定 regression guard）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-UNSCOPED-001 | 處長視角：`calculateReadiness` 呼叫時**不帶** `actor`/scope 參數 | AC-6/AC-7, OQ-F111-03 裁定, AD §3.6 | actor businessRole='section_chief'；spy `calculateReadiness` | `getOverview` | `calculateReadiness` 呼叫參數僅 `(ym)`，**不含**第二個 `actor`/`scope` 參數（驗證此為刻意裁定，非遺漏） |
| TS-F111-UNSCOPED-002 | 部長視角呼叫形狀與處長相同（無角色分歧的隱藏程式碼路徑） | AD §3.6 | actor businessRole='director' | `getOverview` | `calculateReadiness` 呼叫參數與 UNSCOPED-001 同構（僅 `ym`），確認未意外為不同角色新增分支 |

### I. RISK — 殘留議題邊界（AD §11.3，須明確測試之邊界情境）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-RISK-001 | 處長 + 區塊三（`dialingVolume`）恰好失敗 → `scope.deptCode` 無法回填，退回 `null`；整體回應仍正常返回（無崩潰） | AD §11.3（明確要求之邊界測試） | actor businessRole='section_chief'；mock `computeDeptEstimate`（任一/全部 ym）reject；其餘 3 服務成功 | `getOverview` | HTTP 200（service 層呼叫不拋例外）；頂層 `scope={role:'section_chief', deptCode:null, scoped:true}`（`deptCode` 退回 `null`，非拋錯或 undefined）；`dialingVolume.error===true`；`stageTodo`/`runReadiness`/`recentRun` 三區塊皆 `error:false` 且資料完整（不受區塊三失敗牽連） |
| TS-F111-RISK-002 | 正向對照：處長 + 區塊三成功 → `scope.deptCode` 確實被填入真實轄區代號 | AD §3.9 附註 | actor businessRole='section_chief'；`computeDeptEstimate` 全數成功並回傳 `scope.deptCode='D003'` | `getOverview` | 頂層 `scope.deptCode==='D003'`（非 `null`），與 RISK-001 形成對照，確認 fallback 僅在區塊三失敗時觸發 |

### J. UTIL — 純函式（`assignment-overview.util.ts`）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-UTIL-001 | `wrapBlock(fn, errorCode, logger)`：`fn` 成功 resolve → 回傳 `{error:false, ...data}` | AD §3.4 | `fn = () => Promise.resolve({foo:'bar'})` | `await wrapBlock(fn, 'STAGE_TODO_UNAVAILABLE', logger)` | 回傳 `{error:false, foo:'bar'}` |
| TS-F111-UTIL-002 | `fn` reject（或內部 throw）→ 回傳 `{error:true, errorCode, message}`；`wrapBlock` 自身**永不 reject** | AD §3.4「永不 reject 的 wrapper」 | `fn = () => Promise.reject(new Error('boom'))` | `await wrapBlock(fn, 'RUN_READINESS_UNAVAILABLE', logger)`（不包 try/catch） | 呼叫**不拋出**；回傳 `{error:true, errorCode:'RUN_READINESS_UNAVAILABLE', message:<string>}` |
| TS-F111-UTIL-003 | 錯誤訊息為固定使用者可讀文字，非原始 `Error.message` | BR-9 | `fn` reject with `new Error('SQL syntax error near...')` | `wrapBlock(fn, ..., logger)` | `message` 為固定文案（如「本區塊資料暫時無法取得，請稍後重試。」），不含 `'SQL syntax error'` 字樣 |
| TS-F111-UTIL-004 | `sumWorkdayCases(r)`：僅加總 `isWorkday=true` 之 `deptCells.cases` | §3.7.3 | `r.days=[{isWorkday:true, deptCells:[{cases:100}]}, {isWorkday:false, deptCells:[{cases:9999}]}]` | `sumWorkdayCases(r)` | 回傳 `100`（非工作日之 9999 被排除，即使其 `deptCells` 非空） |
| TS-F111-UTIL-005 | 跨部門、跨日正確加總 | §3.7.3 | 3 個工作日，每日 2 個部門，各自不同 `cases` 值 | `sumWorkdayCases(r)` | 回傳值 = 手算之全部工作日 × 全部部門 `cases` 總和 |
| TS-F111-UTIL-006 | `days=[]` → 回傳 0 | Boundary | `r.days=[]` | `sumWorkdayCases(r)` | 回傳 `0`（非 `null`/`NaN`） |
| TS-F111-UTIL-007 | `deriveDeptDistribution(r)`：依 `days[].deptCells` 正確彙總每部門 `totalCases`（僅工作日） | §3.7.3 | 2 部門 × 2 工作日 + 1 非工作日（其 `deptCells` 應被排除） | `deriveDeptDistribution(r)` | 每部門 `totalCases` 僅含 2 個工作日之加總，不含非工作日 |
| TS-F111-UTIL-008 | 非 scoped 模式：`ratio` 為佔總數百分比，四捨五入至小數點後 1 位 | §3.7.3 | `r.scope.scoped=false`；部門 A `totalCases=9600`，總數 `29722` | `deriveDeptDistribution(r)` | 部門 A `ratio===32.3`（`Math.round(9600/29722*1000)/10`） |
| TS-F111-UTIL-009 | Scoped 模式（處長）：`ratio` 恆為 `null`，不論 `totalCases` 為何 | AC-2, §3.7.3, I-OVW-SCOPE-PASSTHROUGH-01 | `r.scope.scoped=true` | `deriveDeptDistribution(r)` | 所有部門項目之 `ratio===null`（即使該部門 `totalCases>0`） |
| TS-F111-UTIL-010 | `grandTotal=0`（所有部門 `totalCases=0`）非 scoped 模式 → `ratio=0`，非 `NaN`/`Infinity` | Boundary, 沿用 US-169 AC-2 慣例 | `r.scope.scoped=false`；所有 `deptCells.cases=0` | `deriveDeptDistribution(r)` | 每部門 `ratio===0`（除以零已有防禦，`grandTotal>0` 判斷式生效） |

### K. RECENT — 最近一次月跑選取（BR-5）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-RECENT-001 | 多筆 `completed` run → 取 `finishedAt` 最新者（非 `listRuns` 原始排序之 `created_at DESC` 首筆） | BR-5 | mock `listRuns` 回傳 3 筆 `completed`，`created_at` 遞減排序但 `finishedAt` 順序與之不同（如最新建立者反而最早完成） | `getOverview` | `getSummary` 被呼叫之 `runId` 為 `finishedAt` 最大者，**非** `runs[0]`（`created_at` 最新者） |
| TS-F111-RECENT-002 | 某筆 `completed` run 之 `finishedAt` 為 `null` → 以 `triggeredAt` 作為比較基準（BR-5「次選」） | BR-5 | 2 筆 `completed`：run A `finishedAt=null, triggeredAt='2026-08-02T10:00'`；run B `finishedAt='2026-08-01T09:00'` | `getOverview` | 選中 run A（`triggeredAt` 10:00 晚於 run B `finishedAt` 09:00），驗證缺值 fallback 邏輯生效 |
| TS-F111-RECENT-003 | 非 `completed` 狀態（`failed`/`running`/`pending`）不參與「最新完成」選取，即使其時間戳最新 | BR-5 | 1 筆 `completed`（較早）+ 1 筆 `running`（時間戳最新） | `getOverview` | `getSummary` 僅被呼叫於該 `completed` 筆之 `runId`；`running` 該筆完全不影響選取結果 |
| TS-F111-RECENT-004 | `noCompletedRun` 空狀態下，`latestRunStatus`/`latestRunId` 取 `listRuns()[0]`（既有 `created_at DESC` 排序之首筆，不重新排序） | BR-8, AD §3.8「`runs[0]` 即為最新一筆」 | mock `listRuns` 回傳 `[{runId:'r-newest', status:'running', ...}, {runId:'r-older', status:'failed', ...}]`（已依 `created_at DESC` 排序） | `getOverview` | `recentRun={hasCompletedRun:false, emptyReason:'noCompletedRun', latestRunStatus:'running', latestRunId:'r-newest'}`（取陣列首筆，非額外重新排序或取最舊） |

### L. STATIC — 架構不變式靜態守門（I-OVW-COMPOSE-ONLY-01 / I-OVW-NO-WRITE-01）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-STATIC-001 | `AssignmentOverviewService` 建構子未注入任何 `Repository<T>` / `DataSource` | I-OVW-COMPOSE-ONLY-01, BR-2 | 讀取 `assignment-overview.service.ts` 原始碼 | 靜態掃描 constructor 參數型別 / import 清單 | 不含 `@InjectRepository` 裝飾器、不含 `Repository<` / `DataSource` 型別標註；僅含 5 個既有 service 型別（`AssignmentListService`/`MonthlyRunReadinessService`/`Stage0EstimateService`/`AssignmentRunService`/`AssignmentRunReportService`）+ `SystemService` |
| TS-F111-STATIC-002 | `AssignmentOverviewModule` 可正確編譯並解析出注入完整的 `AssignmentOverviewService`（regression guard，驗證 §3.2 wiring 缺口修補生效） | AD §3.2, §3.1 | `Test.createTestingModule({imports:[AssignmentOverviewModule, ...其依賴之測試替身]})` | `moduleRef.compile()` 後 `get(AssignmentOverviewService)` | 編譯不拋出 `UnknownDependenciesException`（尤其是 `AssignmentRunService`/`AssignmentRunReportService` 兩者，因 §3.2 修補前 `AssignmentModule` 未 export 兩者）；解析出的 service 實例非 `undefined` |
| TS-F111-STATIC-003 | `getOverview` controller method 無 `@RequireDirector()` metadata（純讀端點定位，AC-8「本頁僅狀態，不觸發」的架構層佐證） | AD §3.3, §5 | 讀取 `assignment-overview.controller.ts` | 以 `Reflector`/裝飾器 metadata 讀取 `getOverview` handler | 無 `REQUIRE_DIRECTOR_KEY` metadata（section_chief 呼叫本端點不因此被 `DirectorGuard` 攔截，與 CTRL-002 呼應） |
| TS-F111-STATIC-004 | `assignment-overview.service.ts` 原始碼不含任何寫入語意 method 呼叫 | I-OVW-NO-WRITE-01, BR-10, AC-16 | 讀取原始碼 | regex 掃描 `createList(` / `updateList(` / `triggerRun(` / `.save(` / `.remove(` / `.delete(` / `.update(` 等寫入語意呼叫 | 掃描結果為 0 命中 |

---

## 二、前端測試場景

> 目標檔案：`assignment-overview-page.tsx` + `_components/overview/{stage-todo-panel,run-readiness-panel,dialing-volume-panel,recent-run-panel,overview-block-status}.tsx`；`app-sidebar.tsx`（既有 `app-sidebar.test.tsx` 新增斷言）。技術棧：Vitest + React Testing Library + MSW，mock `getAssignmentOverview` API（單一端點）。

### M. ROLE — 角色存取渲染差異（AC-1, AC-2, AC-8, AC-12）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-FE-ROLE-001 | 部長：四區塊全渲染 + 觸發連結可見 | AC-1, TC-177-01 | MSW stub 回傳全公司 response（`scope.scoped=false`）；director 身分 | render `<AssignmentOverviewPage />` | 四個 panel 皆渲染實際資料；`run-readiness-panel` 顯示「前往觸發月名單分派」連結 |
| TS-F111-FE-ROLE-002 | 處長：顯示「轄區檢視」徽章 + 部門名稱；部門相關數字標示「（僅本部門）」；無觸發連結 | AC-2, AC-8, AC-12, TC-177-02, TC-177-08 | MSW stub 回傳 `scope={role:'section_chief',deptCode:'D003',scoped:true}` | render page | 頁面頂端存在「轄區檢視」徽章文字 + 部門名稱；`dialing-volume-panel` headline 顯示「（僅本部門）」字樣；`run-readiness-panel` **不存在**任何觸發連結 DOM 節點 |
| TS-F111-FE-ROLE-003 | 一般使用者：主體內容封鎖，顯示專屬說明卡，不顯示任何區塊資料 | AC-1, TC-177-03 | 使用者身分 `role='user'`（本頁自身之封鎖狀態渲染，獨立於路由層 guard） | render page | 顯示「分派總覽為部長 / 處長 / Admin 專屬功能」文字；四個 panel 元件**皆未渲染**（DOM 中無任何區塊資料節點） |
| TS-F111-FE-ROLE-004 | Admin：渲染與部長等價（全公司視角 + 觸發連結） | AC-1 末條 | MSW stub `scope={role:'admin',deptCode:null,scoped:false}` | render page | 與 ROLE-001 同構斷言 |

### N. MONTH — 分派作業月份選擇器（AC-3）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-FE-MONTH-001 | 月份選擇器預設值為下月（`target_work_ym`） | AC-3 | `AssignmentWorkYmProvider` 提供 `targetWorkYm='202608'` | render page（首次載入，未手動選過月份） | 月份選擇器顯示值 `===202608` |
| TS-F111-FE-MONTH-002 | 切換月份 → 以新 `ym` 重新請求端點，四區塊依新月份資料重繪 | AC-3, TC-177-04 | 頁面已顯示 `202608` 資料；MSW stub 對 `ym=202607` 回傳不同資料 | 於選擇器切換為 `202607` | `GET /api/v1/assignment/overview?ym=202607` 被呼叫（MSW 確認）；四區塊改渲染 `202607` 對應資料；選擇器本身顯示值變更為 `202607` |
| TS-F111-FE-MONTH-003 | Query key 隨 `ym` 變化（`['assignment','overview',ym]`） | AD §6 | TanStack Query devtools/queryClient spy | 切換月份 | 新 query key 之 `ym` 片段與所選月份一致；舊 query key 之快取資料不與新資料混淆 |

### O. STATE — 跨區塊三態與獨立失敗（AC-15）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-FE-STATE-001 | `stageTodo.error=true` → 僅該 panel 顯示錯誤提示，其餘 3 個正常渲染 | AC-15 | MSW stub response 中 `stageTodo={error:true,errorCode:'STAGE_TODO_UNAVAILABLE',message:'本區塊資料暫時無法取得，請稍後重試。'}`，其餘 3 區塊 `error:false` 含正常資料 | render page | `stage-todo-panel` 顯示該 `message` 文字；`run-readiness-panel`/`dialing-volume-panel`/`recent-run-panel` 正常顯示各自資料，DOM 無空白或錯誤殘留 |
| TS-F111-FE-STATE-002 | `runReadiness.error=true` → 同上模式 | AC-15 | 同上，改 `runReadiness.error=true` | render page | 僅 `run-readiness-panel` 顯示錯誤，其餘 3 正常 |
| TS-F111-FE-STATE-003 | `dialingVolume.error=true` → 同上模式（對應 TC-177-12） | AC-15, TC-177-12 | 同上，改 `dialingVolume.error=true` | render page | 僅 `dialing-volume-panel` 顯示錯誤，其餘 3 正常（含區塊一、二、四） |
| TS-F111-FE-STATE-004 | `recentRun.error=true` → 同上模式 | AC-15 | 同上，改 `recentRun.error=true` | render page | 僅 `recent-run-panel` 顯示錯誤，其餘 3 正常 |
| TS-F111-FE-STATE-005 | `overview-block-status` 共用 wrapper：loading / empty / error 三態各自可視覺區分（獨立 DOM 標記，非僅文字不同） | AC-15「三態須各自明確、可視覺區分」 | 分別以三種 props 渲染 `<OverviewBlockStatus state="loading"|"empty"|"error">` | render 三種變體 | 三態各自具備獨立可查詢之 `data-state` 屬性或 testid；三者互斥（同一時刻僅一種狀態存在於 DOM） |
| TS-F111-FE-STATE-006 | 初始載入（query pending，尚無任何資料）→ 四區塊**同時**顯示載入指示，非空白 | AC-3, AC-15 | MSW stub 回應延遲（pending promise 未 resolve） | render page | 四個 panel 皆顯示 loading 狀態（skeleton/spinner），DOM 非空白；無任何 panel 提前顯示舊資料或空狀態 |

### P. PANEL — 各區塊特定行為

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-FE-PANEL-001 | 點擊階段 KPI 卡 → 導向 Kanban 並帶該階段篩選/聚焦參數 | AC-4, TC-177-05 | `stageTodo.stageCounts.approval=3` | 點擊「待簽核」KPI 卡 | 路由導向 `/assignment/list-definitions`（帶 `stage=approval` 篩選參數或等效聚焦機制） |
| TS-F111-FE-PANEL-002 | `hasAnyList=false` → 五卡皆 0 + 引導文案 + 「前往建立」連結 | AC-4 | `stageTodo.hasAnyList=false, stageCounts` 全 0 | render `stage-todo-panel` | 五張 KPI 卡皆顯示 0；顯示「本月尚無名單定義，請至名單定義頁建立」文字；「前往建立」連結存在 |
| TS-F111-FE-PANEL-003 | `notReadyLists=[]` 但 `hasAnyList=true` → 「目前無未完成名單」正向提示（非空白） | AC-5 末條 | `stageTodo.hasAnyList=true, notReadyLists=[]`（呼應後端 EMPTY-009） | render panel | 顯示「目前無未完成名單」文字，非空白 DOM 區塊 |
| TS-F111-FE-PANEL-004 | 待辦清單項目點擊 → 導向該名單 Detail Drawer | AC-5, TC-177-06 | `notReadyLists=[{listNo:'OB202608005', listNm:'個貸名單', stage:'personnel_ratio'}]` | 點擊該筆 | Detail Drawer 開啟並顯示 `LIST-OB202608005` 之個別比例設定階段資訊 |
| TS-F111-FE-PANEL-005 | `notReadyCount>50` → 僅顯示前 50 筆 + 「查看全部」連結 | BR-11 | `stageTodo.notReadyLists.length=73, notReadyCount=73` | render panel | 清單渲染筆數 `===50`；顯示「查看全部」連結，導向 `/assignment/list-definitions` |
| TS-F111-FE-PANEL-006 | `allReady` 燈號與 `monthlyRunStatus` 徽章為兩個獨立可辨識的 DOM 元素（不混為一談） | AC-6, BR-7 | `allReady=false, readyCount=8, totalActiveLists=10, monthlyRunStatus='pending'` | render `run-readiness-panel` | 就緒燈號顯示「8 / 10」且非就緒；月跑狀態徽章獨立顯示「等待中」；兩者為不同 DOM 節點，不共用同一段文字 |
| TS-F111-FE-PANEL-007 | `monthlyRunStatus='running'` → 額外顯示「月名單分派執行中」提示 | AC-6 末條 | `monthlyRunStatus='running'` | render panel | 顯示「月名單分派執行中」提示文字（額外於狀態徽章之外） |
| TS-F111-FE-PANEL-008 | ETL 來源某項未通過 → 警示樣式 + 簡短原因；其餘 3 項正常 | AC-7, TC-177-07 | `etlStatus.pooldata={status:'failed', rowCount:0, ...}`，其餘 3 項 `status:'completed'` | render panel | 「客戶名單池」項目具警示樣式（如 class/aria-invalid）+ 簡短原因文字；其餘 3 項正常樣式，無警示 |
| TS-F111-FE-PANEL-009 | `canNavigateToTrigger` 差異化：`true` 顯示連結；`false` 連結**完全不存在**於 DOM（非 disabled） | AC-8, TC-177-08 | 分別 stub `canNavigateToTrigger=true`/`false` | render panel 兩變體 | `true`：「前往觸發月名單分派」連結存在且可點擊；`false`：`document.querySelector` 該連結為 `null`（DOM 不存在，非僅 `disabled` 屬性） |
| TS-F111-FE-PANEL-010 | `headline.<month>.total=null` → 顯示「—」+「本月尚無啟用名單」，不顯示 0 | AC-9, TC-177-09 | `headline.nextMonth={total:null, hasActiveLists:false}` | render `dialing-volume-panel` | 次月欄位顯示「—」；顯示「本月尚無啟用名單」等效文字；**不出現** `0` 字樣於該欄位 |
| TS-F111-FE-PANEL-011 | `total` 非 null → 顯示實際數字（千分位格式化） | AC-9 | `headline.currentMonth={total:42350, hasActiveLists:true}` | render panel | 本月欄位顯示 `42,350`（或等效格式化數字），非「—」 |
| TS-F111-FE-PANEL-012 | 每日圖表資料點 hover → 顯示當日明細件數 | AC-10 | `selected.days=[{date:'2026-08-03', isWorkday:true, orgTotal:1234, ...}]` | hover 該工作日資料點 | tooltip 顯示 `1234`（或等效明細） |
| TS-F111-FE-PANEL-013 | 非工作日資料點於圖表中呈現方式明確區分（不計入或標示為 0） | AC-10 | `selected.days` 含 `{isWorkday:false, orgTotal:0, deptCells:[]}` | render 圖表 | 該日資料點視覺上與工作日區分（不同顏色/不渲染柱狀/明確標示），不與工作日案量混淆 |
| TS-F111-FE-PANEL-014 | `deptCells[].overThreshold=true` → 紅色警示 + 門檻文字 | AC-11, TC-177-10 | `deptCells=[{deptCode:'D002', perPerson:20, overThreshold:true}]`，`threshold=15` | render 部門可行性表格 | D002 該欄位具紅色警示樣式；顯示「超過每人每日上限 15 件」等效文字 |
| TS-F111-FE-PANEL-015 | `perPerson=null` → 顯示「—」+ 說明，不顯示 0/`Infinity`/`NaN` | AC-11 末條 | `deptCells=[{deptCode:'D004', perPerson:null, overThreshold:false}]`（在職人數 0） | render 表格 | 該欄位顯示「—」+ 說明文字；**不出現** `0`、`Infinity`、`NaN` 字樣 |
| TS-F111-FE-PANEL-016 | `threshold=null` → 全表無任何超門檻警示 | AC-11「未設定時不顯示警示」 | `selected.threshold=null`；`deptCells` 值不論高低 | render 表格 | 無任何欄位具警示樣式（即使 `perPerson` 數值很大） |
| TS-F111-FE-PANEL-017 | `deptDistribution[].ratio=null`（處長）→ 佔比數字不渲染，僅顯示絕對件數 | AC-2, AC-12 | 處長視角，`deptDistribution=[{deptCode:'D003', totalCases:9600, ratio:null}]` | render 部門分佈區塊 | 顯示 `9600` 件數；不顯示任何百分比/佔比數字（DOM 中無 ratio 相關文字節點，或明確以「—」呈現） |
| TS-F111-FE-PANEL-018 | `hasCompletedRun=true` → 部門落差表 + CARD_LEVEL 分布 + TIER 分布全數渲染；`alert=true` 列高亮 | AC-13 | `recentRun` 含 `deptSummary`（1 筆 `alert:true`）+ `levelDistribution` + `tierDistribution` | render `recent-run-panel` | 部門落差表渲染全部列；`alert=true` 該列具警示樣式；CARD_LEVEL / TIER 分布圖表皆渲染 |
| TS-F111-FE-PANEL-019 | `emptyReason='noRun'` → 對應文案（與 noCompletedRun 不同） | AC-14, TC-177-11 | `recentRun={hasCompletedRun:false, emptyReason:'noRun', latestRunStatus:null}` | render panel | 顯示「本月尚無已完成的月名單分派結果」等效文字（不提及執行狀態，因根本無任何 run 紀錄） |
| TS-F111-FE-PANEL-020 | `emptyReason='noCompletedRun'` + `latestRunStatus='running'` → 反映「執行中」之專屬文案 | AC-14 | `emptyReason='noCompletedRun', latestRunStatus='running'` | render panel | 顯示「本月月名單分派執行中，尚無可回顧結果」等效文字 |
| TS-F111-FE-PANEL-021 | `emptyReason='noCompletedRun'` + `latestRunStatus='failed'` → 反映「執行失敗」之專屬文案，與 020 明確不同 | AC-14, TC-177-11 | `emptyReason='noCompletedRun', latestRunStatus='failed'` | render panel | 顯示「本月最近一次月名單分派執行失敗，尚無可回顧結果」等效文字；與 PANEL-020（running 文案）斷言不同字串 |
| TS-F111-FE-PANEL-022 | 空狀態下**不** fallback 顯示其他月份之月跑資料（regression） | AC-14「不自動 fallback」 | `recentRun.hasCompletedRun=false`（選定月份無資料） | render panel | DOM 中不出現任何具體 `runId`/`deptSummary`/`levelDistribution` 等實際資料內容，僅顯示空狀態文案 |
| TS-F111-FE-PANEL-023 | 「查看完整結果摘要」帶 `runId`；「查看執行歷史」導向 `/assignment/history` | AC-13 末條 | `recentRun.runId='e3c839b7-...'` | 檢視兩個連結 | 「查看完整結果摘要」連結 URL 含 `runId=e3c839b7-...`；「查看執行歷史」連結 `href` 為 `/assignment/history` |

### Q. READONLY — 唯讀特性驗證（AC-16, TC-177-13）

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-FE-READONLY-001 | 完整頁面互動（點擊全部可點擊元素）不觸發任何寫入型 API 呼叫 | AC-16, TC-177-13 | MSW spy 攔截 POST/PUT/PATCH/DELETE 至任何 `/api/v1/assignment/**` 路徑；頁面完整渲染含全部區塊資料 | 依序點擊：KPI 卡、待辦清單項、觸發連結（若存在，僅驗證導覽非呼叫）、查看全部連結、結果摘要連結、執行歷史連結、「重新整理」按鈕 | 全程僅觀察到 `GET /api/v1/assignment/overview` 請求（含「重新整理」重新呼叫）；**零筆** POST/PUT/PATCH/DELETE 請求被送出 |

### R. SIDEBAR — 導覽入口變更（AC-17, TC-177-14, BR-13）

> 目標檔案：既有 `apps/web/src/components/layout/__tests__/app-sidebar.test.tsx` 新增斷言。現況（F111 實作前）「客戶名單分派」群組 `items[0]` 為「篩選欄位」（`/assignment/field-base`）；F111 後應改為「分派總覽」為 `items[0]`。

| ID | 場景 | 關聯需求 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|------|---------|
| TS-F111-FE-SIDEBAR-001 | 「客戶名單分派」群組 `items[0]` 為「分派總覽」 | AC-17, TC-177-14, BR-13 | 讀取 sidebar 設定（`NAV_CONFIG` 或等效常數） | 尋找 `label==='客戶名單分派'` 群組，取 `items[0]` | `items[0].to==='/assignment/overview'`；`items[0].label==='分派總覽'` |
| TS-F111-FE-SIDEBAR-002 | `items[1]` 為「篩選欄位」（原第 1 項降為第 2 項，路由/功能不變） | AC-17, TC-177-14, BR-13 | 同上 | 取 `items[1]` | `items[1].to==='/assignment/field-base'`；`items[1].label==='篩選欄位'` |
| TS-F111-FE-SIDEBAR-003 | 其餘既有 6 項（計分卡設定/名單定義/準備完成摘要/Stage 0 試算/觸發月名單分派/執行歷史）相對順序不受影響 | AC-17「其餘既有項目相對順序不受影響」 | 同上 | 取 `items[2..7]` | 依序為：計分卡設定、名單定義、準備完成摘要、Stage 0 試算、觸發月名單分派、執行歷史（與 F111 前相對順序一致，僅整體因新增首項而全部後移一位） |
| TS-F111-FE-SIDEBAR-004 | 「分派總覽」項目 `requires='director_or_section_chief'`（部長/處長/admin 可見，user 不可見） | AC-1, AC-17 | 沿用既有 `matchesRequires` 測試模式，分別以 director / section_chief / admin / user 四種身分渲染 sidebar | render `<AppSidebar />` 四變體 | director/section_chief/admin 三者 DOM 中可見「分派總覽」項目；user 身分該群組整體不渲染（沿用既有「客戶名單分派」群組封鎖邏輯） |
| TS-F111-FE-SIDEBAR-005 | 點擊「客戶名單分派」群組標籤本身（若群組可點擊導覽）→ 導向 `/assignment/overview` | AC-17 末條 | 群組標籤具導覽行為（若既有元件支援群組點擊） | 點擊群組標籤 | 路由導向 `/assignment/overview`（若既有 sidebar 元件不支援群組本身可點擊導覽，本案例改為靜態斷言：群組無點擊導覽時本條不適用，由 tdd-implementation 依既有元件能力確認並回報） |

---

## 三、測試資料（Fixture 原型）

> 供後端 SVC-COMPOSE / ISO / EMPTY / SCOPE 等組共用之標準 mock 回應形狀，逐欄對齊 F111 spec §5.3 Response 範例（部長視角，選定月份 202608）。

### Fixture-Director（部長視角，全數成功）

```jsonc
// mock listLists() 回傳
{
  "lists": [
    { "listNo": "OB202608005", "listNm": "個貸名單", "status": "active", "stage": "personnel_ratio" },
    { "listNo": "OB202608009", "listNm": "車貸名單", "status": "active", "stage": "draft" }
    // ...其餘 8 筆 stage='ready' 或 disabled
  ],
  "stageCounts": { "draft": 1, "dept_ratio": 0, "personnel_ratio": 1, "approval": 0, "ready": 8, "disabled": 2 }
}

// mock calculateReadiness('202608') 回傳
{
  "totalActiveLists": 10, "readyCount": 8, "allReady": false,
  "notReadyLists": [{ "listNo": "OB202608005", "listNm": "個貸名單", "stage": "personnel_ratio" }],
  "monthlyRunStatus": "pending", "scoringActive": true,
  "etlStatus": {
    "pooldata": { "status": "completed", "lastRunAt": "2026-08-01T02:10:00Z", "rowCount": 3631548 },
    "emphire": { "status": "completed", "lastRunAt": "2026-08-01T02:12:00Z", "rowCount": 1180 },
    "calendar": { "status": "completed", "lastRunAt": "2026-08-01T02:13:00Z", "rowCount": 366 },
    "arreturndf": { "status": "completed", "lastRunAt": "2026-08-01T02:15:00Z", "rowCount": 55863 }
  },
  "sourcesAllHaveData": true, "emptySourceTables": []
}

// mock computeDeptEstimate('202608', {actor}) 回傳（selected 對應月份）
{
  "ym": "202608", "mode": "aggregated", "calendarSource": "weekday",
  "startDate": "2026-08-01", "endDate": "2026-08-31",
  "scope": { "role": "director", "deptCode": null, "scoped": false },
  "departments": [{ "deptCode": "XVE1", "deptName": "北區電銷1", "activeHeadcount": 27 }],
  "days": [
    { "date": "2026-08-03", "weekday": "一", "isWorkday": true,
      "deptCells": [{ "deptCode": "XVE1", "cases": 480, "perPerson": 18, "overThreshold": true }] },
    { "date": "2026-08-09", "weekday": "日", "isWorkday": false, "deptCells": [] }
  ],
  "threshold": 15, "warnings": [], "poolCount": 50000, "poolWarning": null
}

// mock listRuns({ym:'202608'}) 回傳（created_at DESC）
[{ "runId": "e3c839b7-...", "status": "completed", "finishedAt": new Date("2026-08-02T09:00:00Z"), "triggeredAt": new Date("2026-08-02T08:00:00Z") }]

// mock getSummary('e3c839b7-...', actor) 回傳
{
  "runId": "e3c839b7-...", "projectWorkym": "202608", "finishedAt": new Date("2026-08-02T09:00:00Z"),
  "totalCases": 55863, "coverageRate": 0.98, "emplCount": 91,
  "deptSummary": [{ "deptId": "XVE1", "deptName": "北區電銷1", "configRatio": 32.5, "actualCount": 18200, "actualRatio": 32.6, "deviation": 0.1, "alert": false }],
  "levelDistribution": [{ "cardLevel": "A", "count": 6271, "ratio": 11.2 }],
  "tierDistribution": [{ "tierLevel": "T1", "count": 1748, "ratio": 3.1 }]
}
```

### Fixture-SectionChief（處長視角，D003 轄區）

- `computeDeptEstimate` 回傳 `scope={role:'section_chief', deptCode:'D003', scoped:true}`；`departments` 僅含 `D003`；`days[].orgTotal`/`deptAssignedTotal`/`gap` 皆為 `null`；`deptDistribution[].ratio` 皆為 `null`。
- `listLists` 回傳之 `lists[]` 僅含轄區 D003 之名單（section_chief 過濾由 `listLists` 內部既有邏輯達成，mock 時直接回傳已過濾後的子集，不在測試中重新實作過濾）。
- `getSummary` 之 `deptSummary` 僅含 `deptId==='D003'` 一列。

### Actor Fixture

| 名稱 | `role` | `businessRole` | 用途 |
|---|---|---|---|
| `directorActor` | `'user'` | `'director'` | 部長路徑全部案例 |
| `sectionChiefActor` | `'user'` | `'section_chief'` | 處長路徑全部案例 |
| `adminActor` | `'admin'` | `null` | admin 路徑案例 |
| `plainUserActor` | `'user'` | `null` | 403 案例（CTRL-004/010） |

---

## 四、自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| CTRL（Controller guard/route） | 高 | Supertest + mock service；無 DB 依賴，CI 常駐 |
| SVC-COMPOSE / ISO / EMPTY / DEDUP / HAL / SCOPE / UNSCOPED / RISK / RECENT（Service） | 高 | 純 `vi.fn()` mock 5 個注入服務；`Promise.allSettled` 行為可決定性重現，CI 常駐 |
| UTIL（純函式） | 高 | 無 I/O，最快回饋層 |
| STATIC（架構守門） | 高 | 靜態掃描 / Nest TestingModule 編譯測試，無需真實資料 |
| FE-ROLE / FE-MONTH / FE-STATE / FE-PANEL / FE-READONLY | 高 | React Testing Library + MSW；全數 mock API 回應，無真實後端依賴 |
| FE-SIDEBAR | 高 | 沿用既有 `app-sidebar.test.tsx` 既有測試基礎設施 |
| 「重新整理」按鈕確切節流/防抖行為（BR-12 實作細節） | 中 | 行為存在性（READONLY-001 已涵蓋其僅呼叫 GET）已驗證；确切節流策略屬 tdd-implementation 自由度，非本文件強制項 |

---

## 五、相依與風險

| 項目 | 內容 |
|---|---|
| 相依功能 | F001（JWT 驗證）、F049（`computeDeptEstimate` 契約，本文件 mock 形狀須與 F049 現行回應同構）、F088（`calculateReadiness` 組裝，`ReadinessResult` 形狀）、F063/F064（`getSummary` 契約與 scope）、F097（`SystemService` 作業月份） |
| 環境依賴 | 無（本 feature 之聚合層測試全數可 mock，AD §10「測試邊界建議」已明文：`assignment-overview.service.spec.ts` 不需要真實 DB 連線） |
| 風險-1（AD §11.2，待業務確認） | `calculateReadiness` 對處長維持全月視角，`runReadiness.notReadyLists` 會列出全公司未就緒名單（非僅轄區）。本文件 UNSCOPED 組依此**現行裁定**設計為 regression guard（鎖定「不收斂」為目前正確行為），但此為業務語意裁定而非純技術決策；若未來業務要求收斂為僅轄區，UNSCOPED-001/002 之期望值需要反向修訂（連同 `calculateReadiness` 簽名擴充），屬非本測試設計阻擋項，記錄於此供 Product Analyst 追蹤。 |
| 風險-2（AD §11.3，已設計對應測試） | `scope.deptCode` 依賴區塊三（`dialingVolume`）成功才能回填；區塊三失敗時退回 `null`，前端「轄區檢視」徽章僅能顯示通用文案而無法標示具體部門名稱。本文件 RISK-001/002 已覆蓋此邊界之後端行為；前端「徽章缺部門名稱時之 fallback 文案」細節請 tdd-implementation 落地時一併確認（本文件 FE-ROLE-002 假設區塊三成功之常態情境，未另立「處長+區塊三失敗」之前端專屬案例，因後端行為已在 RISK-001 鎖定，前端僅需優雅降級顯示、非阻擋項）。 |
| 風險-3（HAL 邊界，AD §11.1） | 「有 active 名單但所有部門比例捨入後皆為 0」之極端情境會使 `hasActiveLists` 誤判為 `false`（顯示「—」而非可能存在但極小的數字）。方向保守、機率極低，AD 已明文列為已知限制不阻擋實作；HAL-001 僅鎖定此行為不被意外改動，不代表要求修正。 |
| 風險-4（listLists payload 較重，AD §11.4） | `listLists` 回傳含 `conditionPayload`/`deptCount`/`empCount` 等本端點不需要之欄位（BR-2 重用既有服務之必然代價）。本文件測試僅斷言使用到的欄位（`stageCounts`/`notReadyLists`/`hasAnyList`），不對回應 payload 大小或未使用欄位提出額外測試要求。 |

---

## 六、風險與缺口（本文件刻意留白項，含理由）

1. **AC-3「月份切換期間各區塊獨立顯示載入中」之字面情境未獨立設計非同步時序測試**：因架構決策為單一聚合端點（AD §6，四區塊共用同一次 fetch），四區塊必然同時進入 loading、同時取得結果，不存在「區塊 A 已完成、區塊 B 仍載入」的真實時間差。FE-STATE-006（初始載入四區塊同時 loading）與 FE-MONTH-002（切換月份後四區塊同時更新）已充分覆蓋此架構下的實際可觀察行為；未另立「僅部分區塊完成」之測試，因該情境在現行架構下不可能發生（若未來改為前端四個獨立請求，需回頭補測）。
2. **底層四個服務（`listLists`/`calculateReadiness`/`computeDeptEstimate`/`listRuns`+`getSummary`）之內部 SQL / PG-only 邊界不重複驗證**：AD §10「測試邊界建議」明文本端點不新增任何 SQL，四個底層服務之既有測試邊界（含 F109 customer_core PG-only 依賴等）維持不變；本文件僅驗證「聚合層如何組裝/隔離/透傳」，非重新驗證底層服務之計算正確性。
3. **前端圖表函式庫（recharts）之像素級渲染 / 精確配色不列入測試範圍**：FE-PANEL-012（hover 顯示明細）僅驗證資料綁定與互動行為存在，不驗證圖表視覺樣式細節（顏色、版位），此類交由 UI/UX 目視驗證，非自動化測試職責。
4. **BR-12「全域重新整理」之確切節流/防抖策略不列為強制斷言**：本文件僅驗證重新整理按鈕觸發之呼叫為 GET（READONLY-001），未規定其 debounce 時間或重複點擊防抖策略，因 spec §7 未定義此細節，屬 tdd-implementation 依現有 UI 元件庫慣例之實作自由度。
5. **FE-SIDEBAR-005（群組標籤本身可點擊導覽）之條件式設計**：F111 spec AC-17 使用「若群組本身可點擊導覽」之條件句，顯示既有 sidebar 元件是否支援群組標籤點擊尚待確認；本文件保留此案例但註明條件式適用範圍，避免對不存在的既有能力提出無法滿足的強制斷言。

---

## 七、版本紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-07-12 | 初版（F111/US-177/AD-E07-46）：後端 62 個場景（CTRL/SVC-COMPOSE/ISO/EMPTY/DEDUP/HAL/SCOPE/UNSCOPED/RISK/UTIL/RECENT/STATIC 共 12 組）+ 前端 42 個場景（ROLE/MONTH/STATE/PANEL/READONLY/SIDEBAR 共 6 組），合計 104 個測試場景。覆蓋 AC-1~17 全部、TC-177-01~14 全部、BR-1~13 全部、7 個 I-OVW-* 不變式全部。核心紅線：區塊獨立失敗（ISO 組）、Guard 例外不受區塊包裝影響（CTRL-010）、empty≠zero≠error 三態區分（EMPTY 組，含 EMPTY-006/009 兩處誤植陷阱守門）、去重不變式（DEDUP 組）、殘留議題邊界（RISK 組）。 |
