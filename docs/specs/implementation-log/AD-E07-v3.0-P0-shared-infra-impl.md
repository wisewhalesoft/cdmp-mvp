---
type: implementation-log
feature_id: AD-E07-v3.0-P0
feature_name: E07 合併重構 P0 共用基礎建設（12 元件 + m14 + E2E 骨架）
status: complete
last_updated: 2026-05-16
agent_id: a8436c0a9653c8098
---

# AD-E07 v3.0 P0 — 共用基礎建設實作日誌

## 範圍

依用戶確認 v2 計畫之 P0（4 人日，後端為主）範圍，產出 E07 重構基礎建設層：12 個共用元件 + m14 migration + E2E 骨架。本日誌不重複規劃內容；對應 spec 為 [architecture-spec.md L1042~L1047](../architecture-spec.md) §E07 後端 Guard / Service 元件清單與 [data-model.md §m14 Migration 規範](../data-model.md)。

## 測試結果摘要

| TC ID | 描述 | 狀態 |
|---|---|---|
| TC-MIG-m14-1~8 | m14 migration：ADD column / CHECK / index / DROP legacy / 順序 / SQLite 退化 | PASS（9 tests） |
| TC-GUARD-DIR-1~6 | DirectorGuard 6 case | PASS |
| TC-GUARD-SC-1~6 | SectionChiefGuard 6 case | PASS |
| TC-GUARD-DOS-1~6 | DirectorOrSectionChiefGuard 6 case（E07_ROLE_NOT_ASSIGNED 訊息驗證） | PASS |
| TC-FF-GUARD-1~6 | FeatureFlagGuard 6 case（"true" / "TRUE" / unset / "false" / "0"） | PASS |
| TC-LEGACY-1~4 | LegacyDetectionService 4 case | PASS |
| TC-RUN-GUARD-1~4 | AssignmentRunGuardService 4 case（含 workYm 過濾） | PASS |
| TC-RATIO-1~9 | RatioValidationService 9 case（sum=100 容差 / range） | PASS |
| TC-PERSONNEL-1~7 | PersonnelRatioValidationService 7 case（含全員離職短路） | PASS |
| TC-STAGE-1~8 | StageTransitionService 8 case（advanceTo/rollbackTo/rejectTo） | PASS |
| TC-READINESS-1~5 | MonthlyRunReadinessService 5 case | PASS |
| TC-E2E-HAPPY-001~005 | E07 五階段 happy path | TODO（骨架，待 controller 實作後解鎖） |

**P0 範圍合計：70 / 70 通過。** 全套 unit suite 17 個 pre-existing fail（ETL / extraction / target-table）與本批次無關，未動到該區檔案，已驗證屬 clean tree 既有狀態。

## 變更檔案清單

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/database/migrations/1711360000170-AddBusinessRoleDropLegacyFlags.ts` | new | m14 migration：ADD business_role + CHECK + partial index + DROP is_sales_manager / e07_role |
| `apps/api/src/database/migrations/__tests__/m14-business-role-merge.spec.ts` | new | TC-MIG-m14（9 tests / 含 SQLite 退化分支） |
| `apps/api/src/database/entities/user.entity.ts` | modified | 新增 `business_role` 欄位（is_sales_manager 暫保留，待 P1 後 DROP） |
| `apps/api/src/database/entities/ob-list-definition.entity.ts` | modified | 新增 `stage` 欄位（五階段流程，data-model L848） |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 7 個 E07 錯誤碼 + 對應中文訊息（E07_ROLE_NOT_ASSIGNED / FEATURE_NOT_ENABLED / RATIO_SUM_NOT_100 等） |
| `apps/api/src/common/decorators/business-role.decorator.ts` | new | `@RequireDirector` / `@RequireSectionChief` / `@RequireDirectorOrSectionChief` |
| `apps/api/src/common/guards/director.guard.ts` | new | 部長專屬 Guard |
| `apps/api/src/common/guards/section-chief.guard.ts` | new | 處長專用 Guard |
| `apps/api/src/common/guards/director-or-section-chief.guard.ts` | new | E07 一般入口 Guard（取代 SalesManagerGuard） |
| `apps/api/src/common/__tests__/director.guard.spec.ts` | new | DirectorGuard 6 case |
| `apps/api/src/common/__tests__/section-chief.guard.spec.ts` | new | SectionChiefGuard 6 case |
| `apps/api/src/common/__tests__/director-or-section-chief.guard.spec.ts` | new | DirectorOrSectionChiefGuard 6 case |
| `apps/api/src/common/feature-flags/feature-flag.decorator.ts` | new | `@RequireFeatureFlag('FLAG_NAME')` |
| `apps/api/src/common/feature-flags/feature-flag.guard.ts` | new | FeatureFlagGuard：env=true 放行；其餘 503 FEATURE_NOT_ENABLED |
| `apps/api/src/common/feature-flags/legacy-detection.service.ts` | new | OnApplicationBootstrap 啟動 hook：偵測 is_sales_manager 殘留 / invalid business_role |
| `apps/api/src/common/feature-flags/__tests__/feature-flag.guard.spec.ts` | new | 6 case |
| `apps/api/src/common/feature-flags/__tests__/legacy-detection.service.spec.ts` | new | 4 case（含 column dropped 容錯） |
| `apps/api/src/modules/assignment/services/assignment-run-guard.service.ts` | new | `assertNoRunningRun(workYm?)`：409 ASSIGNMENT_RUN_ALREADY_RUNNING |
| `apps/api/src/modules/assignment/services/ratio-validation.service.ts` | new | per-LIST_NO 部門比例 helper（assertSumEquals100 / assertEachInRange） |
| `apps/api/src/modules/assignment/services/personnel-ratio-validation.service.ts` | new | per-DEPT 個別比例 helper（含全員離職短路 v1.3） |
| `apps/api/src/modules/assignment/services/stage-transition.service.ts` | new | advanceTo / rollbackTo / rejectTo / assertStageEquals（同 transaction） |
| `apps/api/src/modules/assignment/services/monthly-run-readiness.service.ts` | new | F088 §5.2 readiness 聚合（allReady / monthlyRunStatus） |
| `apps/api/src/modules/assignment/services/__tests__/*.spec.ts` | new (×5) | 對應 5 個 service unit tests |
| `apps/api/test/fixtures/ob-emphire.fixture.ts` | new | F082 v1.3 §11 builder + D001/D002/D003 三部門資料集（含全員離職） |
| `apps/api/test/fixtures/users.fixture.ts` | new | 5 builders：admin / director / section_chief / regular / legacy sales_manager |
| `apps/api/test/e07-stage-happy-path.e2e-spec.ts` | new | E2E 5 階段 happy path 骨架（5 個 `it.todo`，待 controller 解鎖） |

## TDD 紅綠重構 cycle

每元件遵循 RED → GREEN → REFACTOR 流程；本批次完成 **11 個完整 cycle**：

1. m14 migration（RED：9 tests → GREEN：migration up/down → REFACTOR：SQLite 分支）
2. DirectorGuard（RED 6 → GREEN）
3. SectionChiefGuard（RED 6 → GREEN）
4. DirectorOrSectionChiefGuard（RED 6 → GREEN）
5. FeatureFlagGuard（RED 6 → GREEN）
6. LegacyDetectionService（RED 4 → GREEN → REFACTOR：regex 修正）
7. AssignmentRunGuardService（RED 4 → GREEN）
8. RatioValidationService（RED 9 → GREEN）
9. PersonnelRatioValidationService（RED 7 → GREEN）
10. StageTransitionService（RED 8 → GREEN → REFACTOR：mgr.findOne API 適配）
11. MonthlyRunReadinessService（RED 5 → GREEN）

## 架構決策對齊

- **E07_ROLE_NOT_ASSIGNED**：DirectorOrSectionChiefGuard 拋出時使用明示訊息「您尚未被指派 E07 業務角色，請聯絡系統管理員補設」（取代模糊 AUTH_FORBIDDEN），與 error-handling.md L230 一致。
- **business_role 單一欄位**：m14 不執行 backfill / UPDATE，per PO 決議「不向下相容、不保留 v1.x 業務主管旗標值」。is_sales_manager column 暫保留於 entity，待所有 callsite 改造後（P1+ 後續批次）由 m14 升級 step 5 完成 DROP。
- **全員離職邊界**：PersonnelRatioValidationService.assertDeptSumEquals100 當 activeEmployeeCount === 0 短路放行，對應 F082 v1.3 §決議 #1。
- **stage 欄位**：本批次先於 `ObListDefinition` entity 補欄位，便於 service 端引用；對應 m05~m13 中之 stage 欄位 migration 留待 spec-writer 明確化（spec 內僅出現 m12 update 規則，未明示哪支 migration 建立欄位本身）。

## 已知 / 後續 issue

1. **`assignment_audit_log.action` column 為 VARCHAR(10) + union type**：本批次 StageTransitionService 寫入 STAGE_ADVANCE / STAGE_ROLLBACK / STAGE_REJECT 名稱已超過 10 字元，由 service 端 truncate 寫入；應由後續 spec-writer / system-architect 擴 column 寬度（建議 VARCHAR(30)）與 union type。**屬 P1 後續 spec 議題**，不阻擋 P0 完成。
2. **`ob_empl_set.created_at / updated_at` 為 'timestamp'**：與 dateColumnType helper 規範不符，SQLite e2e 將失敗。本批次未動到 ob_empl_set entity（避免越權），由後續 ETL 修補批次處理。
3. **E2E 5 case 為 `it.todo`**：等待 controller 實作（P1 階段）解鎖；本批次先確立 E2E 結構與步驟對應 spec。
4. **17 個 pre-existing failing tests**（ETL / extraction / target-table）：屬 main 既有狀態，與本批次無關。

## 對應 spec / 規格參照

- [architecture-spec.md L1042~L1047](../architecture-spec.md)（E07 元件清單）
- [architecture-spec.md L463~L483](../architecture-spec.md)（Guard 清單與 AccountsService.updateBusinessRole）
- [data-model.md §User 實體補充 §m14](../data-model.md)
- [error-handling.md v1.14](../error-handling.md)
- [F002 v2.0 §4.6](../features/F002-user-login.md#e07-角色矩陣)
- [F006a](../features/F006a-update-business-role.md)
- [F073 v2.0](../features/F073-define-director-role.md) / [F074 v2.0](../features/F074-define-section-chief-role.md)
- [F077 BR-9](../features/F077-month-switch-and-stage-overview.md) / [F088 §5.2](../features/F088-ready-stage-summary.md)
- [F082 v1.3 §11 / §決議 #1](../features/F082-set-personnel-ratio.md)

## 下一階段提示

等用戶確認 P0 完成後，可進入 **P1 B1（E02 + business_role 指派）**：
- F006a controller / service（PATCH `/api/v1/accounts/:id/business-role`）
- AccountsService.updateBusinessRole() 同 transaction 寫 password_changed_at
- Frontend 帳號管理頁 business_role 篩選 + 編輯欄位
- 既有 SalesManagerGuard 全 callsite 替換為 DirectorOrSectionChiefGuard
