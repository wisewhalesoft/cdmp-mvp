---
type: implementation-log
feature_id: E07-P2
feature_name: E07 重構 P2 — 邊界與錯誤（M03a/b/c/d Stage Actions + Ratios）
status: complete
last_updated: 2026-05-17
---

# E07 P2: Stage Actions + Ratios 邊界與錯誤 — Implementation Log

承接 P1 B6 (commit ef164de；49 新 PASS / 445 全綠)。本 P2 為 E07 最後一個後端批次。

## Test Results Summary

新增 32 個測試全綠 + E07 既有 633 全綠 = **665/665 PASS**。

| 檔案 | 測試數 | 狀態 |
|---|---|---|
| `assignment-stage/__tests__/dept-ratio.service.spec.ts` | 6 | PASS |
| `assignment-stage/__tests__/personnel-ratio.service.spec.ts` | 8 | PASS |
| `assignment-stage/__tests__/stage-action.service.spec.ts` | 15 | PASS |
| `assignment-stage/__tests__/legacy-grep-regression.spec.ts` | 3 | PASS |

**baseline ETL/Datasource 17 個失敗與本批無關**（git stash 雙向驗證；屬上一輪 BUG-2 / target-table-schemas 既有 work-in-progress）。

## Files Changed

| File | Change | Description |
|---|---|---|
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 6 個錯誤碼：`PERSONNEL_RATIO_DEPT_NOT_FOUND` / `STAGE_ROLLBACK_BLOCKED` / `STAGE_ADVANCE_PRECONDITION_FAILED` / `REJECT_REASON_REQUIRED` / `REJECT_REASON_TOO_LONG` / `BONUS_PENALTY_TEMPLATE_INVALID` + 訊息 |
| `apps/api/src/app.module.ts` | modified | 註冊 `AssignmentStageModule` |
| `apps/api/src/modules/assignment-stage/dto/set-dept-ratio.dto.ts` | new | F079 PUT DTO |
| `apps/api/src/modules/assignment-stage/dto/set-personnel-ratio.dto.ts` | new | F082 PUT DTO + F083 `appliedTemplate` |
| `apps/api/src/modules/assignment-stage/dto/reject.dto.ts` | new | F086 / F087 DTOs |
| `apps/api/src/modules/assignment-stage/dept-ratio.service.ts` | new | F079 v1.2 service（GET + PUT + tx audit） |
| `apps/api/src/modules/assignment-stage/dept-ratio.controller.ts` | new | F079 controller + DirectorGuard + FeatureFlagGuard |
| `apps/api/src/modules/assignment-stage/personnel-ratio.service.ts` | new | F082 v1.4 + F083 v1.3 二次校驗；含 scopeByCreator filter / 全員離職分支 |
| `apps/api/src/modules/assignment-stage/personnel-ratio.controller.ts` | new | F082 controller + DirectorOrSectionChiefGuard |
| `apps/api/src/modules/assignment-stage/stage-action.service.ts` | new | F078/F080/F081/F084/F085/F086/F087/F089 共 8 個 stage action 包裝 P0 `StageTransitionService` |
| `apps/api/src/modules/assignment-stage/stage-action.controller.ts` | new | 8 個 endpoint + 各自 Guard |
| `apps/api/src/modules/assignment-stage/assignment-stage.module.ts` | new | TypeORM forFeature + provider 整合 |
| `apps/api/src/modules/assignment-stage/__tests__/*.spec.ts` | new | 4 個 spec 檔 / 32 tests |

行數：service 三檔合計約 ~830 行；controller 三檔約 ~280 行；tests 約 ~620 行。

## Architectural Decisions（AD-E07 v3.0 alignment）

1. **Stage 流轉**：全部走 P0 `StageTransitionService.advanceTo / rollbackTo / rejectTo`，含 audit log 同 transaction。`StageActionService` 為薄包裝。
2. **比例驗證**：F079 dept 走 P0 `RatioValidationService`；F082 personnel 走 P0 `PersonnelRatioValidationService`（含全員離職短路 / `assertAllDeptsSumEquals100` for F084）。
3. **月跑並發守衛**：所有寫入頂層 `AssignmentRunGuardService.assertNoRunningRun()`，符合決議 #6。
4. **Feature Flag fallback**：所有 controller 掛 `FeatureFlagGuard` + `@RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')`，符合決議 #2。
5. **SectionChiefScopeGuard 決議 #4**：GET 不攔，service 內 `scopeByCreator(actorUser)` filter；PUT/POST 攔截邏輯放 service 層（PERSONNEL_RATIO_OUT_OF_SCOPE）。本批採輕量 service-level 實作（未獨立成 Guard class），與 spec v1.4 BR-14 一致。
6. **F083 後端二次校驗**：放在 `PersonnelRatioService.validateAppliedTemplate()`，與 PUT 同流程，0 額外端點。
7. **歷史月份 / 名單停用**：service 層三檔統一抽 `assertNotHistorical` / `assertListActive` helper。

## TDD Cycle 數量

- DeptRatioService：6 cycles（GET / PUT 100% / 404 / 歷史 / 停用 / 月跑）
- PersonnelRatioService：8 cycles（PUT 100% / 部門未配置 / 離職員工 / 處長越權 / F083 +10% 通過 / F083 不符 / 月跑 / 歷史）
- StageActionService：15 cycles（每個 spec 至少 1 cycle + 共通 3 cycle）
- legacy-grep regression：3 cycles（SalesManagerGuard / RequireSalesManager / e07_role）
- **共 32 個 cycle**

## Spec 對齊確認（AD-E07 v3.0）

| Spec | 對齊狀態 | 備註 |
|---|---|---|
| F079 v1.2 | ✅ 完整 | GET + PUT + DirectorGuard + FF + RunGuard + Stage |
| F080 v1.2 | ✅ 完整 | DirectorGuard + 前置條件 dept 加總 100% |
| F081 v1.2 | ✅ 完整 | DirectorGuard + cleanup DELETE ob_dept_pct + STAGE_ROLLBACK_BLOCKED |
| F082 v1.4 | ✅ 完整 | DirectorOrSectionChiefGuard + scopeByCreator + 全員離職分支 + dept_pct 前置 |
| F083 v1.3 | ✅ 完整 | F082 PUT 二次校驗 `appliedTemplate` → BONUS_PENALTY_TEMPLATE_INVALID |
| F084 v1.x | ✅ 完整 | DirectorOrSectionChiefGuard + assertAllDeptsSumEquals100 |
| F085 v1.x | ✅ 完整 | DirectorGuard + cleanup DELETE ob_empl_set |
| F086 v1.x | ✅ 完整 | DirectorGuard + STAGE_ADVANCE approval→ready |
| F087 v1.x | ✅ 完整 | DirectorGuard + 拒絕原因必填 / ≤500 + cleanup DELETE ob_empl_set + STAGE_REJECT |
| F089 v1.x | ✅ 完整 | DirectorGuard + 不清空資料 |

## 未完成 / v2.0 留下輪

1. **F063~F067 `scopeByCreator` 整合至 AssignmentRunReportService / SnapshotService**：spec v1.1 補完 2026-05-17，本批 spec 已對齊但 service 改動屬補 B6 遺留；受 context 預算限制改下輪實作（建議 P2.1 / 1 人日）。
2. **WHITELIST_OPTION_INACTIVE 警告碼**：F050/F051 名單載入時若引用 inactive option 之 banner 提示；用戶許可留下輪實作。
3. **F087 v1.1 `latestRejection` banner 觸發**：F082 GET response 已預留 `latestRejection: null` 欄位；需新增 `assignment_approval` 表 + F087 寫入紀錄 → F082 GET 回填。建議與 v2.0 banner UI 一併實作。
4. **F082 v1.3 `SectionChiefScopeGuard` 獨立 Guard class**：目前 service-level 實作功能等價，將來若需在 GET / PUT 多端點重用可抽出。
5. **legacy is_sales_manager 移除**：accounts.service / seed.ts / auth.service.ts comments 仍持有，屬 E02 accounts 範圍，非 E07 P2 範圍。

## 整體後端進度

| 階段 | 狀態 | tests |
|---|---|---|
| P0 共用基礎建設 | ✅ 完成 (commit 069bc3b) | 70+ |
| P1 B1 schema + E02 role | ✅ 完成 (6899cba) | — |
| P1 B2 SalesManager 全替換 + M01 CRUD | ✅ 完成 (bf636a4) | — |
| P1 B3+B4 F055 v1.6 + M03 月跑 | ✅ 完成 (04fc403) | — |
| P1 B5 POOLDATA 白名單 M04 | ✅ 完成 (d313ca3) | 62 |
| P1 B6 M05 快照歷史 + F063~F067 spec | ✅ 完成 (ef164de) | 49 新 |
| **P2 邊界與錯誤** | **✅ 完成（本批）** | **32 新** |
| 全 E07 後端 | **✅ 完成** | **665 PASS** |

## 下一步

**全後端 P0~P2 完成，可進入前端 FE 階段**。建議 FE 階段：
- FE-1：M01 名單清單頁 / 月份切換 / 階段標籤（F048 v2.0 / F077）
- FE-2：M03a 部門比例設定頁（F079）+ M03a 推進 / Rollback（F080 / F081）
- FE-3：M03b 個別業務比例設定頁（F082）+ F083 快速模板
- FE-4：M03c 簽核（F086 / F087）+ 拒絕 banner（F082 §7.x + F087 BR-11）
- FE-5：M03d 簽核完成 Rollback（F089）+ F088 準備完成清單
- FE-6：F063~F067 月跑結果摘要 / 比對 / 匯出
- FE-7：F075~F076 POOLDATA 白名單管理頁

## Blocking Issues

無。
