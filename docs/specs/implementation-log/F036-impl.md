---
type: implementation-log
feature_id: F036
feature_name: 目標表 Domain-Oriented 規劃
status: complete
last_updated: 2026-03-24
---

# F036: 目標表 Domain-Oriented 規劃 -- 實作紀錄

## 測試結果摘要

### 後端 E2E 測試（18 項全部通過）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F036-001 | 回傳 4 個目標表清單 | PASS |
| TS-F036-002 | 各目標表 columnCount 正確 | PASS |
| TS-F036-003 | 各目標表回應欄位結構完整 | PASS |
| TS-F036-004 | domain 欄位值正確對應 | PASS |
| TS-F036-005 | customer_core schema 欄位清單正確 | PASS |
| TS-F036-006 | customer_interaction schema 欄位清單正確 | PASS |
| TS-F036-007 | customer_financial schema 欄位清單正確 | PASS |
| TS-F036-008 | customer_service schema 欄位清單正確 | PASS |
| TS-F036-009 | schema 回應中 ETL 追蹤欄位標示正確 | PASS |
| TS-F036-010 | schema 回應中主鍵欄位標示正確 | PASS |
| TS-F036-011 | schema 回應中追蹤欄位 nullable 標示正確 | PASS |
| TS-F036-012 | schema 回應中各欄位均含 description | PASS |
| TS-F036-013 | 查詢不存在的目標表 404 | PASS |
| TS-F036-014 | User 角色存取目標表清單 API 回 403 | PASS |
| TS-F036-015 | User 角色存取目標表 Schema API 回 403 | PASS |
| TS-F036-016 | 未登入存取目標表清單 API 回 401 | PASS |
| TS-F036-017 | 未登入存取目標表 Schema API 回 401 | PASS |
| TS-F036-020 | 目標表名稱為空字串時回 404 | PASS |

### 後端 Unit 測試（3 項全部通過）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F036-018 (unit) | Load 執行後追蹤欄位自動填充（非 null） | PASS |
| TS-F036-019 (unit) | Load 執行後追蹤欄位值合理性驗證 | PASS |
| - | data_source 未提供時為 null | PASS |

### TS-F036-018/019 E2E 備註

完整 E2E 級測試（Pipeline 含 Load 節點端對端寫入目標表）依賴 F030（Pipeline 執行 Load 節點實際寫入），目前以 unit test 驗證 `injectEtlTrackingFields()` 函式邏輯。待 F030 Load 節點寫入功能完成後，可補充 E2E 測試。

### 前端單元測試（9 項全部通過）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| FE-001 | 頁面標題與副標題正確渲染 | PASS |
| FE-002 | breadcrumb 渲染正確 | PASS |
| FE-003 | 4 個 Domain 卡片含正確 badge 與欄位數 | PASS |
| FE-004 | 展開卡片顯示 schema 欄位表格 | PASS |
| FE-005 | PK 標示紅色 * 前綴與 PK 標籤 | PASS |
| FE-006 | ETL 追蹤欄位灰色背景與「系統自動填充」標籤 | PASS |
| FE-007 | 收合卡片隱藏表格 | PASS |
| FE-008 | Domain badge 顏色正確（core=blue, interaction=green, financial=amber, service=purple） | PASS |
| FE-009 | chevron 展開時旋轉 180 度 | PASS |

## 檔案變更清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| `apps/api/src/modules/etl/target-table-schemas.ts` | new | 4 個目標表完整 Schema 靜態定義（TypeScript 常數） |
| `apps/api/src/modules/etl/target-table.service.ts` | new | TargetTableService：getAll() / getSchema() |
| `apps/api/src/modules/etl/target-table.controller.ts` | new | TargetTableController：2 個 GET endpoint，admin-only RBAC |
| `apps/api/src/modules/etl/etl-tracking.util.ts` | new | injectEtlTrackingFields() 工具函式（ETL 追蹤欄位自動填充） |
| `apps/api/src/modules/etl/etl.module.ts` | modified | 註冊 TargetTableController 與 TargetTableService |
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 PIPELINE_TARGET_TABLE_NOT_FOUND 錯誤碼 |
| `apps/api/test/target-table.e2e-spec.ts` | new | 18 項 E2E 測試（含 RBAC、404、401、schema 完整性驗證） |
| `apps/api/src/modules/etl/__tests__/etl-tracking.util.spec.ts` | new | 3 項 Unit 測試（追蹤欄位自動填充邏輯） |
| `packages/shared/src/index.ts` | modified | 新增 TargetTable 相關 shared types（4 個 interface） |
| `apps/web/src/api/etl-pipelines.ts` | modified | 新增 getTargetTables / getTargetTableSchema API 函式 |
| `apps/web/src/pages/etl-pipelines/target-tables-page.tsx` | new | 目標表定義瀏覽頁面（嚴格遵守原型 22-target-tables.html） |
| `apps/web/src/pages/etl-pipelines/__tests__/target-tables-page.test.tsx` | new | 9 項前端單元測試 |
| `apps/web/src/pages/etl-pipelines/editor/properties-panel.tsx` | modified | LoadProperties 改為 API 驅動，移除硬編碼 TARGET_TABLES / FIELD_MAPPINGS |
| `apps/web/src/App.tsx` | modified | 新增 `/etl-pipelines/target-tables` 路由 |

## 架構決策

1. **靜態 Schema 定義（非 ORM Entity）**：遵循 data-model.md 規定，目標表不納入 ORM Entity 管理。以 TypeScript 常數 `TARGET_TABLE_SCHEMAS` 定義 4 個表的完整欄位，避免 DB 相依。
2. **ETL_TRACKING_COLUMNS 共用陣列**：3 個追蹤欄位（data_source / _etl_loaded_at / _etl_pipeline_id）以共用常數定義，spread 到各表 columns 尾端，確保一致性。
3. **Service 層查詢**：純記憶體查詢（find from array），無 DB 操作，效能極佳。
4. **injectEtlTrackingFields 獨立函式**：ETL 追蹤欄位注入邏輯獨立於 Service，便於 Load 節點執行時直接呼叫。
5. **前端 LoadProperties API 驅動**：移除所有硬編碼目標表清單與欄位定義，改為呼叫 `getTargetTables()` 和 `getTargetTableSchema()` API 動態載入，確保前後端資料一致。
6. **前端目標表頁面**：嚴格遵守原型 `22-target-tables.html`，包括 Domain badge 顏色、PK 紅色標示、ETL 追蹤欄位灰色背景、chevron 旋轉動畫等。
7. **路由設計**：新增 `/etl-pipelines/target-tables` 路由，與現有 ETL Pipeline 頁面層級一致。

## 阻塞問題

無
