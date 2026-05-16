---
type: implementation-log
feature_id: AD-E07-v3.0-P1-B2-supplementary
feature_name: E07 重構 P1 B2 補完（m17/m18 + case_status/cr_enabled + historical readonly + system/current-work-ym）
status: complete
last_updated: 2026-05-16
---

# AD-E07 v3.0 P1 B2 補完 — Implementation Log

承接 commit 6899cba (P1 B2 主任務)，補完 B2 留下的 7 項任務。

## 任務範圍

1. m17 migration：ob_list_definition.case_status VARCHAR(14) NULL
2. m18 migration：ob_list_definition.cr_enabled BOOLEAN NOT NULL DEFAULT false
3. ObListDefinition entity 補 case_status + cr_enabled
4. AssignmentListService 補欄位寫入持久化
5. service 層歷史月份寫入攔截（LIST_HISTORICAL_READONLY 403）
6. GET /api/v1/system/current-work-ym 端點
7. accounts-sales-manager.e2e-spec.ts 標 DEPRECATED

## Test Results Summary

| Test Suite | Tests | Status |
|---|---|---|
| m17-list-definition-case-status.spec | 3 | PASS |
| m18-list-definition-cr-enabled.spec | 3 | PASS |
| assignment-list.service.spec (回歸) | 23 | PASS |
| assignment-list.controller.spec (回歸) | 38 | PASS |
| historical-month-readonly.spec (新增) | 6 | PASS |
| system.controller.spec (新增) | 5 | PASS |
| 全 migration suite (含 sqlite smoke) | 75 | PASS |

## Files Changed

| File | Change | LOC | Description |
|---|---|---|---|
| apps/api/src/database/migrations/1711360000181-AddObListDefinitionCaseStatus.ts | new | 34 | m17 migration |
| apps/api/src/database/migrations/1711360000182-AddObListDefinitionCrEnabled.ts | new | 31 | m18 migration |
| apps/api/src/database/migrations/__tests__/m17-list-definition-case-status.spec.ts | new | 67 | m17 TDD |
| apps/api/src/database/migrations/__tests__/m18-list-definition-cr-enabled.spec.ts | new | 70 | m18 TDD |
| apps/api/src/database/entities/ob-list-definition.entity.ts | modified | +10 | 補 case_status + cr_enabled |
| apps/api/src/modules/assignment-list/assignment-list.service.ts | modified | +35 | 欄位寫入 + assertNotHistorical + ForbiddenException import |
| apps/api/src/modules/assignment-list/assignment-list.controller.ts | modified | +4 | update/disable/delete 傳入 currentWorkYm |
| apps/api/src/modules/assignment-list/__tests__/historical-month-readonly.spec.ts | new | 180 | 歷史月份攔截 TDD |
| apps/api/src/modules/system/system.service.ts | new | 27 | currentWorkYm 計算 |
| apps/api/src/modules/system/system.controller.ts | new | 31 | GET /current-work-ym |
| apps/api/src/modules/system/system.module.ts | new | 31 | SystemModule |
| apps/api/src/modules/system/__tests__/system.controller.spec.ts | new | 85 | SystemController TDD |
| apps/api/src/app.module.ts | modified | +2 | 註冊 SystemModule |
| apps/api/test/accounts-sales-manager.e2e-spec.ts | modified | +14 | 整檔 describe.skip 標 DEPRECATED |

總計：新增 9 檔 / 修改 5 檔。

## 歷史月份攔截覆蓋的 endpoint

| HTTP | Path | Controller method | Service method |
|---|---|---|---|
| PUT | /api/v1/assignment/lists/:listNo | AssignmentListController.update | updateList(..., currentWorkYm) |
| PUT | /api/v1/assignment/lists/:listNo/disable | AssignmentListController.disable | disableList(..., currentWorkYm) |
| DELETE | /api/v1/assignment/lists/:listNo | AssignmentListController.deleteList | disableList(..., currentWorkYm) |

POST /api/v1/assignment/lists（create）天然安全：project_workym 由 currentWorkYm 強制注入，無歷史寫入路徑。

## /system/current-work-ym 端點規格

- Path：GET /api/v1/system/current-work-ym
- Auth：AuthGuard（任何登入用戶皆可呼叫）
- Response：`{ "currentWorkYm": "YYYYMM" }`
- 邏輯：依 architecture-spec.md §E07 AD，每月 1 號 0:00 切換至當月
- Override：環境變數 OVERRIDE_CURRENT_WORK_YM=YYYYMM 強制覆蓋

## accounts-sales-manager.e2e-spec.ts 處置

- 三個 describe block 全部標 `describe.skip` + `[DEPRECATED]` 前綴
- 檔頭加入 DEPRECATED 區塊註釋，引導至 F006a / F004 新測試
- 保留檔案以供歷史追溯，建議於 P2 階段物理刪除

## 架構決策

1. **service method 新增 optional currentWorkYm 參數**（而非新增獨立 method）
   - 理由：保持 API surface 最小、向下相容既有 service 單元測試
   - 配合：controller 一律傳入 currentWorkYm，service 單元測試可選擇是否傳入
2. **SystemService.getCurrentWorkYm 暫不取代 AssignmentListController.computeCurrentWorkYm**
   - 理由：避免本次補完造成 controller 大幅 refactor，後續 P2 可遷移
   - 兩者邏輯完全一致（OVERRIDE 環境變數 + YYYYMM of today）
3. **m17 case_status VARCHAR(14) 為 NULL**
   - 理由：相容既有 v1.x 資料（舊紀錄無 case_status）；新增 / 編輯時由 service 層強制驗證
4. **m18 cr_enabled BOOLEAN NOT NULL DEFAULT false**
   - 理由：per-LIST CR 回分開關需強制存在；保守起始值 false

## Blocking Issues

無。所有任務全數完成且 test 全 PASS。

## 下一步建議

**P1 B3：M02 評分組態**（per AD-E07 v3.0 計劃）
- F055 v1.5 已部分實作（create-card-level 進行中，見 git status）
- B3 範圍預期：scoring config 全 CRUD 收斂、card-level threshold 編輯、card_type stats 強化
- 建議先 align scoring-config-page.tsx / assignment-scoring.service.ts 既有重構與 B3 計劃
