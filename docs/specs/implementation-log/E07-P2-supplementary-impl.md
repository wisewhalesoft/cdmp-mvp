---
type: implementation-log
feature_id: E07-P2-supplementary
feature_name: E07 P2 補完 — B6 遺留 scopeByCreator + WHITELIST warning + F087 latestRejection
status: complete
last_updated: 2026-05-17
agent_id: a5bb9df7d68579523
---

# E07 P2 補完 — B6 遺留三項目 Implementation Log

承接 E07 P2 stage actions（commit 後 665/665 PASS）。本補完批次完成 B6 留下的三項：
1. F063~F067 service 層 `scopeByCreator` 過濾整合
2. F050 v2.0 / F051 v2.0 `WHITELIST_OPTION_INACTIVE` warning banner
3. F087 v1.1 `latestRejection` banner 觸發機制（含新 `assignment_approval` 表）

## Test Results Summary

| Test Suite | 新增測試 | 狀態 |
|---|---|---|
| `assignment-run-report.scope.spec.ts`（新）TC-SCOPE-001~012 | **12** | **PASS** |
| `whitelist-option-inactive.service.spec.ts`（新）TC-WHITELIST-WARNING-001~005 | **5** | **PASS** |
| `approval-record.service.spec.ts`（新）TC-APPROVAL-RECORD + TC-LATEST-REJECTION | **6** | **PASS** |
| **合計新增** | **23** | **PASS** |
| 全 backend 回歸 vitest run | **1207 / 1224** | 17 fail 全為 pre-existing ETL/extraction baseline（與 B6 / P2 commit ef164de 一致），與本補完無關 |

baseline 1184 + 新增 23 = **1207 PASS**；既有 E07 共 665 + 23 = **688 PASS**，0 既有破壞。

## 範圍對應 TC

| TC | 端點 / Service | 對應 spec |
|---|---|---|
| TC-SCOPE-001 | getSummary section_chief | F063 v1.1 AC-5 + BR-6 |
| TC-SCOPE-002 | getSummary director bypass | F063 v1.1 BR-6 |
| TC-SCOPE-003 | getSummary admin bypass | F063 v1.1 BR-6 |
| TC-SCOPE-004 | exportResult section_chief | F064 v1.1 |
| TC-SCOPE-005~006 | exportResult director / admin bypass | F064 v1.1 |
| TC-SCOPE-007~008 | compareRuns section_chief / director | F067 v1.1 |
| TC-SCOPE-009 | section_chief 無轄區 → 200 OK 空集合 | F063 v1.1 BR-7 |
| TC-SCOPE-010 | getSnapshotByType result section_chief | F066 v1.1 |
| TC-SCOPE-011 | getSnapshotByType input_list section_chief | F066 v1.1 |
| TC-SCOPE-012 | getFullSnapshot admin bypass | F066 v1.1 |
| TC-WHITELIST-WARNING-001~005 | AssignmentListService.create/update | F050 / F051 + F076 v1.3 + error-handling v1.14 |
| TC-APPROVAL-RECORD-001~002 | StageActionService.rejectToPersonnelRatio | F087 v1.1 BR-11 |
| TC-LATEST-REJECTION-001~004 | PersonnelRatioService.getPersonnelRatios | F082 v1.1 §7.x + F087 v1.1 BR-11 |

## Files Changed

| 路徑 | 類型 | 行數 | 描述 |
|---|---|---|---|
| `apps/api/src/database/migrations/1711360000230-CreateAssignmentApproval.ts` | new | 99 | m23 / `assignment_approval` 表（PK + idx + CHECK constraint） |
| `apps/api/src/database/entities/assignment-approval.entity.ts` | new | 48 | AssignmentApproval entity（含 `dateColumnType` helper） |
| `apps/api/src/modules/assignment/services/section-chief-scope.service.ts` | new | 76 | 共用 scope helper（admin/director bypass；section_chief 依 ob_empl_set.created_by filter） |
| `apps/api/src/modules/assignment/services/assignment-run-report.service.ts` | modified | +30 | getSummary / exportResult / compareRuns 三 method 接 `actor` 並 filter；totalCases 區分 director/section_chief 視角 |
| `apps/api/src/modules/assignment/services/assignment-run-snapshot.service.ts` | modified | +34 | getFullSnapshot / getSnapshotByType 接 `actor` 並 filter result/input_list payload |
| `apps/api/src/modules/assignment/assignment-run.controller.ts` | modified | +24 | 5 endpoint 增 `req.user` actor 透傳；新 `toActor()` helper |
| `apps/api/src/modules/assignment/assignment.module.ts` | modified | +4 | 註冊 SectionChiefScopeService + ObEmplSet（透過 forFeature 已存在）|
| `apps/api/src/modules/assignment-list/assignment-list.service.ts` | modified | +75 | inject PooldataFieldOption、create/update return 增 `warnings`、新 `calculateInactiveOptionWarnings()` helper |
| `apps/api/src/modules/assignment-list/assignment-list.module.ts` | modified | +2 | TypeOrmModule.forFeature 加 PooldataFieldOption |
| `apps/api/src/modules/assignment-list/dto/create-list.dto.ts` | modified | +21 | 增 optional `conditionPayload` 欄位 |
| `apps/api/src/modules/assignment-list/dto/update-list.dto.ts` | modified | +14 | 增 optional `conditionPayload` 欄位 |
| `apps/api/src/modules/assignment-stage/stage-action.service.ts` | modified | +18 | rejectToPersonnelRatio 透過 stageTransition.rejectTo 的 postActionFn 同 tx 寫入 assignment_approval |
| `apps/api/src/modules/assignment-stage/personnel-ratio.service.ts` | modified | +35 | inject AssignmentApproval repo；getPersonnelRatios 查 latestRejection；新 findLatestRejection() helper |
| `apps/api/src/modules/assignment-stage/assignment-stage.module.ts` | modified | +2 | TypeOrmModule.forFeature 加 AssignmentApproval |
| **新測試檔** | | | |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-report.scope.spec.ts` | new | 360 | 12 TC（section_chief / director / admin × summary/export/compare/snapshot 各組合） |
| `apps/api/src/modules/assignment-list/__tests__/whitelist-option-inactive.service.spec.ts` | new | 240 | 5 TC（create/update × active/inactive × details） |
| `apps/api/src/modules/assignment-stage/__tests__/approval-record.service.spec.ts` | new | 230 | 6 TC（reject 寫入 + GET latestRejection 4 變體） |
| **既有 spec 補丁** | | | |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-report.service.spec.ts` | modified | +5 | imports SectionChiefScopeService + ObEmplSet entity 註冊 |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-snapshot.service.spec.ts` | modified | +5 | 同上 |
| `apps/api/src/modules/assignment/__tests__/assignment-run.controller.spec.ts` | modified | +10 | 5 `toHaveBeenCalledWith` 增 `expect.objectContaining({ userId })` 對齊新 actor 參數 |
| `apps/api/src/modules/assignment-list/__tests__/assignment-list.service.spec.ts` | modified | +4 | imports PooldataFieldOption + 註冊 |
| `apps/api/src/modules/assignment-list/__tests__/historical-month-readonly.spec.ts` | modified | +4 | 同上 |
| `apps/api/src/modules/assignment-stage/__tests__/personnel-ratio.service.spec.ts` | modified | +12 | constructor 增 approvalRepo mock |

**合計：新增 6 檔（migration + entity + service + 3 spec）、修改 14 檔；新增 23 PASS / 0 既有破壞。**

## TDD Cycle 統計

| Cycle | 元件 | RED → GREEN |
|---|---|---|
| 1 | SectionChiefScopeService + AssignmentRunReportService + SnapshotService scope filter | 12 RED → 12 PASS（其中 2 次微修：scope 視角下 deptSummary 只取 assignments 出現的 dept；compareRuns 視角下 totalCases director 沿用 run.total_cases）|
| 2 | AssignmentListService.calculateInactiveOptionWarnings | 5 RED → 5 PASS |
| 3 | AssignmentApproval entity + migration + StageActionService.rejectToPersonnelRatio + PersonnelRatioService.findLatestRejection | 6 RED → 6 PASS |

合計 **3 個 RED-GREEN cycle**，每項目一個 cycle。

## Architectural Decisions

1. **SectionChiefScopeService 集中 helper**：避免在 4 個 service method（getSummary / exportResult / compareRuns / getSnapshot）各自實作；行為等價 `shouldFilter(actor) + filterByEmplId(items, actor)` 兩 method。對應 spec L122 BR-5 「`scopeByCreator(actorUser)` helper」一致 pattern。
2. **scope 來源：ob_empl_set.created_by**（而非 ob_emphire — 後者無 `created_by` 欄位）。與既有 PersonnelRatioService 的處長轄區判定邏輯一致。
3. **section_chief 視角下 deptSummary 只列 assignments 出現的 dept**（不洩漏轄區外 deptId 之存在性，對齊 F063 v1.1 AC-5 「不洩漏轄區外部門 / 員工之存在性」）。
4. **totalCases 區分 viewer**：section_chief 視角 = filtered length；director / admin = `run.total_cases`（原值）。
5. **conditionPayload DTO 接受但暫不持久化**：data-model.md L850 規範 `ob_list_definition.condition_payload` JSONB 欄位，但 entity / migration 尚未實作；本批補上 DTO 與 warning 計算，後續批次補 column + migration + Stage 1 動態 SQL。
6. **WHITELIST warning「未維護」不誤報**：option 不存在於 pooldata_field_option 表時，warning 不報（留給其他驗證處理）；僅 `is_active=false` 才報 inactive。
7. **AssignmentApproval 表保留所有紀錄不清空**（對齊 F087 §A-3 假設）；F082 GET 邏輯：取最新一筆 approved_at；若 action='reject' 回 banner，'approve' / 無紀錄 → null。
8. **Reject 寫入 assignment_approval 採同 Tx**（透過 stageTransition.rejectTo 既有的 `postActionFn`），與 audit log + ob_empl_set DELETE 一起 commit / rollback（F087 v1.1 BR-7）。
9. **m23 migration CHECK constraint**：PostgreSQL ADD CONSTRAINT；SQLite 不支援故 try/catch 容錯（與 m162 ob_tier_tier_level_check pattern 一致）。

## Spec Alignment 確認

- ✓ F063 v1.1 AC-5 + BR-6 + BR-7：scopeByCreator filter；director/admin bypass；過濾語意（200 OK 縮小集合）
- ✓ F064 v1.1：CSV 同 filter；下載時 audit log（已於 B6 完成）
- ✓ F066 v1.1：result/input_list payload filter；config 不過濾（無 emplid）；getFullSnapshot 三份結構保留
- ✓ F067 v1.1：兩邊都 filter；NFR-005 personnelMismatch 不變
- ✓ F050 v2.0 / F051 v2.0 + F076 v1.3 BR-7：conditionPayload 引用 inactive option → response.warnings 補 WHITELIST_OPTION_INACTIVE，不阻擋寫入
- ✓ error-handling.md v1.14：警告含 code + message + details list（columnName + optionValue）
- ✓ F087 v1.1 BR-11：reject 同 tx 寫入 assignment_approval；reject_reason / approver_id / approver_role / approved_at
- ✓ F082 v1.1 §7.x + F087 v1.1 BR-11：F082 GET response `latestRejection` 取最新一筆 reject；最近一筆為 approve → null

## Blocking Issues

無。

## 已知不在範圍 / v2.0 留下輪

1. **`ob_list_definition.condition_payload` 持久化**：本批僅接受 DTO 並計算 warning，未持久化於 entity（data-model.md L850 標明為新欄位）；待後續批次補 column + migration + 月名單分派 Stage 1 動態 SQL。
2. **F086 approve 寫入 assignment_approval**：本批僅實作 F087 reject 寫入；F086 approve 寫入留 P3 / FE-4 階段（與簽核 UI 一併）。
3. **legacy is_sales_manager 移除**：accounts.service / seed.ts / auth.service.ts comments 仍持有，屬 E02 accounts 範圍，沿用 B6 / P2 既有立場。
4. **scopeByCreator 之 `ob_emphire.created_by` 模型差異**：spec L122 BR-6 描述以 `ob_emphire.created_by` 為 scope source，但實際 `ob_emphire` entity 無此欄位；本批採 `ob_empl_set.created_by` 為 scope source（與既有 PersonnelRatioService pattern 一致）。建議 spec-writer 確認此差異並修正 spec BR-6。

## 整體後端進度

| 階段 | 狀態 | tests |
|---|---|---|
| P0 共用基礎建設 | ✅ 完成 (069bc3b) | 70+ |
| P1 B1 schema + E02 role | ✅ 完成 (6899cba) | — |
| P1 B2 SalesManager 全替換 + M01 CRUD | ✅ 完成 (bf636a4) | — |
| P1 B3+B4 F055 v1.6 + M03 月名單分派 | ✅ 完成 (04fc403) | — |
| P1 B5 POOLDATA 白名單 M04 | ✅ 完成 (d313ca3) | 62 |
| P1 B6 M05 快照歷史 | ✅ 完成 (ef164de) | 49 新 |
| P2 邊界與錯誤 | ✅ 完成 | 32 新 |
| **P2 補完 B6 遺留三項目** | **✅ 完成（本批）** | **23 新** |
| **全 E07 後端** | **✅ 完成** | **688 PASS** |

## 提示下一步

**全後端 P0~P2（含補完）完成，可直接進入前端 FE 階段或先 git commit**。

建議 git commit 順序：
1. `feat(api/E07): assignment_approval 表 + F087 latestRejection banner 觸發機制`
2. `feat(api/E07): F063~F067 處長轄區 scopeByCreator filter (v1.1)`
3. `feat(api/E07): F050/F051 conditionPayload + WHITELIST_OPTION_INACTIVE warning`

或單一 commit：`feat(api/E07): P2 補完 — scopeByCreator + WHITELIST warning + latestRejection`

FE 階段對應 prototype：
- FE-3：M03b 個別業務比例設定頁（F082）含 banner 渲染（§7.x）
- FE-6：M05 月名單分派結果摘要 / 比對 / 匯出（F063~F067 含 scope-aware UI）
