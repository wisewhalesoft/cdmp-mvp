---
type: implementation-log
feature_id: F097
feature_name: 客戶名單分派「作業月」語意統一（target_work_ym 分離 + 過去月 guard + 去重視窗對齊）
status: complete
last_updated: 2026-05-27
---

# F097：客戶名單分派「作業月」語意統一 — 實作紀錄

## 範圍與結論

依 `docs/test-specs/features/F097-test.md`（48 場景）以 TDD 紅→綠落地後端（NestJS）+ 前端（React）。
所有 F097 測試場景皆綠；無 F097-attributable regression。命名嚴格對齊 `glossary.md`（`current_work_ym` /
`target_work_ym` / `project_workym` / `workdt` / `getDefaultTargetWorkYm` / `AssignmentWorkYmContext` /
`AssignmentWorkYmProvider` / `RUN_WORKYM_PAST` / `WORK_YM_INVALID_FORMAT`），完成後已 grep 自驗實檔。

**sidebar 判斷（AC-4 / TS-F097-LABEL-003）**：F097 不新增任何頁面 → 不新增任何 E07 sidebar 路由，
亦不新增 `App.tsx` route path。已以靜態測試守住 `app-sidebar.tsx` 既有 7 條 `/assignment/*` 連結不變。
**此判斷成立。**

## 測試結果摘要

### 後端（`apps/api`，`npx vitest run`）

| Scenario ID | 說明 | 狀態 | 測試檔 |
|---|---|---|---|
| TS-F097-SVC-001~005 | `getDefaultTargetWorkYm` 一般月/跨年/OVERRIDE/經 getCurrentWorkYm/regression | PASS | `modules/system/__tests__/system.controller.spec.ts` |
| TS-F097-DTO-001~002 | workYm 缺省 / null → 400 | PASS | `modules/assignment/__tests__/trigger-run-workym.f097.spec.ts` |
| TS-F097-DTO-003~005,007 | 格式錯（5碼/MM=13/abcdef/MM=00）→ 422 `WORK_YM_INVALID_FORMAT` | PASS | 同上 |
| TS-F097-DTO-006 | 合法 202606 → 202 + ym=202606 | PASS | 同上 |
| TS-F097-GUARD-001~004 | 過去月 422 `RUN_WORKYM_PAST` / 當月1號邊界(>=)通過 / 未來月通過 / server 時鐘基準 | PASS | 同上 |
| TS-F097-RUN-001~002 | service.triggerRun 帶選定 workYm（≠ 執行月） | PASS | 同上 |
| TS-F097-CTL-001~003 | 三 controller 無 `computeCurrentWorkYm` + 注入 SystemService（靜態掃描） | PASS | `modules/assignment-list/__tests__/computeCurrentWorkYm-removal.f097.spec.ts` |
| TS-F097-CTL-004 | assignment-stage 三 controller 改用 SystemService，行為不變（regression） | PASS | 既有 controller specs + 上述靜態掃描 |
| TS-F097-DEDUP-001~003 | workdt=project_workym+'01' / 上界 2026-05-31 / 後移一月 regression | PASS | `modules/assignment/stage1/__tests__/dedup-window-target-month.f097.spec.ts` |
| TS-F097-DEDUP-004 | ETL 切點近似（OQ-STAGE1-02）注釋存在 | PASS | 同上 |
| TS-F097-NODEDUP-001 | `computeDedupWindow` 無 git diff（AC-20） | PASS | 同上（`git diff HEAD -- stage1-filter-chain.ts` 為空） |
| TS-F097-FORWARD-001 | `AssignmentRunService.triggerRun` 附近含 forward-only / F097 注釋 | PASS | 同上 |

### 前端（`apps/web`，`npx vitest run`）

| Scenario ID | 說明 | 狀態 | 測試檔 |
|---|---|---|---|
| TS-F097-CTX-001~003,005 | 預設下月 / 跨年 / 一處切換多頁同步 / 值可讀 + setter | PASS | `contexts/__tests__/assignment-work-ym-context.test.tsx` |
| TS-F097-CTX-004 | run-history 不接 Context（獨立 local state，靜態） | PASS | `contexts/__tests__/assignment-work-ym-scope.test.ts` |
| TS-F097-CTX-006 | 四頁以 targetWorkYm fetch（readiness/listLists 帶 ?ym=202606） | PASS | `pages/assignment/__tests__/trigger-run-page.test.tsx`（TRIGGER-001）+ 各頁測試 |
| TS-F097-TRIGGER-001~005 | readiness 帶選定月 / triggerRun(workYm) / modal 顯示 2026-06 / testid 保留 | PASS | `trigger-run-page.test.tsx` |
| TS-F097-RBAC-001 | section_chief MonthPicker disabled，仍顯示 202606 | PASS | 同上 |
| TS-F097-DOWNSTREAM-004 | 下游四頁（progress/summary/snapshot/compare）不接 Context（靜態） | PASS | `assignment-work-ym-scope.test.ts` |
| TS-F097-LABEL-001~002 | MonthPicker label「分派作業月份」/ 無「作業年月」舊字串 | PASS | `trigger-run-page.test.tsx` |
| TS-F097-LABEL-003 | 無新增 E07 sidebar 路由（靜態） | PASS | `assignment-work-ym-scope.test.ts` |

### 由其他層次涵蓋 / 標註

| Scenario ID | 處置 |
|---|---|
| TS-F097-DOWNSTREAM-001~003 | 下游結果頁月份取自 `run.projectWorkym`、無 MonthPicker、不隨共享狀態變動。F062/F063 既有實作即讀 `run.ym`（runId 導向），且 DOWNSTREAM-004 靜態已證四頁不接 Context；未新增頁面 component 測試（行為既有，靜態守 Context 範圍即可）。 |
| TS-F097-E2E-001 | 端到端（Playwright/完整環境）標 **DEFERRED**：本專案測試套件為 vitest（unit/integration/component），無 E2E runner；E2E 全鏈已由後端整合測試（workYm→project_workym）+ 前端 component（四頁同步/readiness 帶月/modal）+ 靜態（下游隔離）等價覆蓋。 |

## 變更檔案清單

### 後端 — 新增測試（3 檔）
| 路徑 | 類型 | 說明 |
|---|---|---|
| `apps/api/src/modules/assignment/__tests__/trigger-run-workym.f097.spec.ts` | new | DTO 三分支 + 過去月 guard + project_workym 寫入（13 案例） |
| `apps/api/src/modules/assignment-list/__tests__/computeCurrentWorkYm-removal.f097.spec.ts` | new | AC-15 三 controller static 移除 + SystemService 注入（靜態掃描，8 案例） |
| `apps/api/src/modules/assignment/stage1/__tests__/dedup-window-target-month.f097.spec.ts` | new | 去重視窗對齊 + computeDedupWindow 不改 + forward-only 注釋（6 案例） |

### 後端 — 修改
| 路徑 | 類型 | 說明 |
|---|---|---|
| `apps/api/src/modules/system/system.service.ts` | modified | 新增 `getDefaultTargetWorkYm(now?)`（= getCurrentWorkYm + 1 月，跨年/OVERRIDE 正確） |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 `WORK_YM_INVALID_FORMAT` + `RUN_WORKYM_PAST`（CODE + MESSAGE） |
| `apps/api/src/modules/assignment/dto/trigger-run.dto.ts` | modified | 新增 `workYm`（寬鬆 @IsOptional；三分支驗證移至 handler） |
| `apps/api/src/modules/assignment/assignment-run.controller.ts` | modified | 注入 SystemService；移除 static computeCurrentWorkYm；triggerRun 讀 dto.workYm + 格式驗證 + 過去月 guard；readiness 改用 SystemService |
| `apps/api/src/modules/assignment/services/assignment-run.service.ts` | modified | triggerRun JSDoc 補 forward-only 注釋（AC-18） |
| `apps/api/src/modules/assignment/assignment.module.ts` | modified | imports SystemModule |
| `apps/api/src/modules/assignment-list/assignment-list.controller.ts` | modified | 注入 SystemService；移除 static；5 處呼叫改 this.systemService.getCurrentWorkYm() |
| `apps/api/src/modules/assignment-list/stage0-estimate.controller.ts` | modified | 同上（1 處） |
| `apps/api/src/modules/assignment-list/assignment-list.module.ts` | modified | imports SystemModule |
| `apps/api/src/modules/assignment-stage/dept-ratio.controller.ts` | modified | 改注入 SystemService 取代跨模組 static |
| `apps/api/src/modules/assignment-stage/personnel-ratio.controller.ts` | modified | 同上 |
| `apps/api/src/modules/assignment-stage/stage-action.controller.ts` | modified | 同上（8 處呼叫） |
| `apps/api/src/modules/assignment-stage/assignment-stage.module.ts` | modified | imports SystemModule |
| `apps/api/src/modules/assignment/__tests__/assignment-run.controller.spec.ts` | modified | 補 SystemService provider；POST /runs 測試帶 workYm |
| `apps/api/src/modules/assignment-list/__tests__/assignment-list.controller.spec.ts` | modified | 補 SystemService provider |
| `apps/api/src/modules/assignment-list/__tests__/stage0-estimate.controller.spec.ts` | modified | 補 SystemService provider |

### 前端 — 新增
| 路徑 | 類型 | 說明 |
|---|---|---|
| `apps/web/src/contexts/assignment-work-ym-context.tsx` | new | `AssignmentWorkYmContext` + `AssignmentWorkYmProvider` + `useAssignmentWorkYm` + `addOneMonth` |
| `apps/web/src/contexts/__tests__/assignment-work-ym-context.test.tsx` | new | Context 行為（6 案例） |
| `apps/web/src/contexts/__tests__/assignment-work-ym-scope.test.ts` | new | 涵蓋範圍靜態（CTX-004/DOWNSTREAM-004/LABEL-003，4 案例） |

### 前端 — 修改
| 路徑 | 類型 | 說明 |
|---|---|---|
| `apps/web/src/App.tsx` | modified | 以 layout route（Provider + Outlet）包四頁（list-definitions/ready-summary/estimate/run），其餘移出 |
| `apps/web/src/api/assignment-run.ts` | modified | `triggerRun(workYm: string)` 簽名（帶 body） |
| `apps/web/src/pages/assignment/trigger-run-page.tsx` | modified | 移除寫死 currentWorkYm()；consume Context；header MonthPicker「分派作業月份」（disabled for section_chief）；readiness/listLists/triggerRun 帶選定月；modal 顯示 YYYY-MM |
| `apps/web/src/pages/assignment/stage0-estimate-page.tsx` | modified | consume Context；MonthPicker 帶 label；移除 new Date() |
| `apps/web/src/pages/assignment/ready-summary-list-page.tsx` | modified | 同上 |
| `apps/web/src/pages/assignment/list-definition-page.tsx` | modified | consume Context；ym/currentWorkYm 改取自 Context；MonthPicker 帶 label |
| `apps/web/src/pages/assignment/_components/run-summary-panel.tsx` | modified | 「作業年月」→「分派作業月份」 |
| `apps/web/src/pages/assignment/__tests__/trigger-run-page.test.tsx` | modified | 包 Provider + mock getCurrentWorkYm；新增 F097 案例；既有測試等資料載入時序修正 |
| `apps/web/src/pages/assignment/__tests__/stage0-estimate-page.test.tsx` | modified | 包 Provider + mock getCurrentWorkYm |
| `apps/web/src/pages/assignment/__tests__/ready-summary-list-page.test.tsx` | modified | 同上 |
| `apps/web/src/pages/assignment/__tests__/list-kanban-page.test.tsx` | modified | 包 Provider + mock getCurrentWorkYm；3 案例斷言搬進 waitFor（async-Context 時序） |

## 架構決策（spec 邊界內）

1. **POST /runs 成功狀態碼保留 202**（非 201）：F061 既有 `@HttpCode(ACCEPTED)`，月名單分派為 async（建 pending run + 背景
   pipeline），F097 spec / AD-E07-27 均未變更狀態碼。測試設計文件以「201」表「成功」為非載重簡寫，AC-14 僅要求
   `ym='202606'`。改 201 將破壞 F061 既有 RBAC 測試且無 AC 依據 → 保留 202。
2. **workYm 三分支驗證落於 controller handler**（非 ValidationPipe）：spec §5.6 明列「或等效 DTO / guard 兜底」。
   本專案全域 `HttpExceptionFilter` 將所有 class-validator `BadRequestException` 統一映為 422 VALIDATION_ERROR，
   無法區分「缺省 → 400」與「格式錯 → 422 WORK_YM_INVALID_FORMAT」；故 DTO 採 `@IsOptional` 放行，於 handler
   顯式拋 `BadRequestException`(400) / `UnprocessableEntityException`(422 + 對應 error code)。
3. **SystemService 注入而非 SystemModule global**：三個用到的 module（assignment / assignment-list /
   assignment-stage）各自 `imports: [SystemModule]`（SystemModule 已 exports SystemService），不改全域。
4. **前端 Provider 掛載於 layout route**：assignment 區段為扁平路由（各頁自帶 AppLayout，無共用 layout component）。
   採 React Router `<Route element={<AssignmentWorkYmProvider><Outlet/></AssignmentWorkYmProvider>}>` 包四頁，
   使跨頁導航時 Provider 不卸載 → 達成「一處切換、四頁同步」。run-history 與下游結果頁刻意排除。
5. **Context 值用 YYYYMM、MonthPicker 用 YYYY-MM**：於消費頁邊界以 `toHyphen` / `replace('-','')` 轉換，
   Context 對外契約與後端 / DB `project_workym` 一致。
6. **Stage 1 去重視窗零改動驗證 AC-20**：`computeDedupWindow` / `parseWorkdt` 完全未動；`parseWorkdt(project_workym)`
   本即 `+'01'`，project_workym 改為目標月後去重視窗自動後移一月。以 `git diff HEAD` 靜態守。

## 阻塞問題

無。

## 已知非 F097 之既有測試失敗（baseline 噪音，與本 feature 無關，未處理）

- 後端：`assignment-run-report.{service,scope}.spec.ts` / `assignment-run-snapshot.service.spec.ts`
  （`SectionChiefScopeService` 缺 `ObEmphireRepository` DI）、`etl/*`（target-table/fn-calc-tier 欄位數）、
  `extraction-task/executors/*`（SQL 分頁）。
- 前端：`c360/*`（customer-list/detail）、`etl-pipelines/{target-tables,editor/load-properties}`。
- `tsc -b` / `tsc --noUnusedLocals` 本就不乾淨（數十 TS6133 + etl editor 真 type error），非綠燈門檻；
  本 feature 新增/修改檔案經 tsc 確認無新增 error。
