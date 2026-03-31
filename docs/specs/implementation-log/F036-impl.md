---
type: implementation-log
feature_id: F036
feature_name: 目標表 Domain-Oriented 規劃
status: complete
last_updated: 2026-03-25
version: "2.0"
---

# F036 v2.0: 目標表 Domain-Oriented 規劃 -- 實作紀錄

## 版本變更摘要

v1.0 -> v2.0 主要變更：
- 目標表從 4 個 placeholder 表縮減為 **1 個 customer_core**（Phase 1 MVP）
- customer_core 欄位從 13 個 generic 欄位擴展為 **79 個 A~H 八分類完整定義**
- 新增 **ETL 轉換函式**（電話合併、DECIMAL 轉換、客戶類型對應、代碼描述轉換）
- 新增 **Database Migration**（customer_core 實體表 + 索引）
- 前端頁面適配 1 表設計

## 測試結果總覽

### Phase A：後端 Schema + Service + E2E

| 場景 ID | 說明 | 狀態 |
|---------|------|------|
| TS-F036-001 | Phase 1 MVP 僅回傳 1 個目標表 | PASS |
| TS-F036-002 | 回應結構完整（5 個屬性） | PASS |
| TS-F036-003 | columnCount=79, domain=core | PASS |
| TS-F036-004 | Schema 欄位總數 79 | PASS |
| TS-F036-005 | A 類欄位定義正確 | PASS |
| TS-F036-006 | B 類欄位定義正確 | PASS |
| TS-F036-007 | C 類欄位定義正確 | PASS |
| TS-F036-008 | F 類型別定義正確 | PASS |
| TS-F036-009 | ETL 追蹤欄位標示正確 | PASS |
| TS-F036-010 | 主鍵欄位正確 | PASS |
| TS-F036-011 | 所有欄位含非空 description | PASS |
| TS-F036-012 | 不存在表回 404 | PASS |
| TS-F036-013 | Phase 2/3 表回 404 | PASS |
| TS-F036-014 | User 角色 403 | PASS |
| TS-F036-015 | User 角色 schema 403 | PASS |
| TS-F036-016 | 無 token 401 | PASS |
| TS-F036-017 | 無 token schema 401 | PASS |
| TS-F036-037 | 特殊字元表名 404 | PASS |
| TS-F036-038 | 空路徑參數 | PASS |
| TS-F036-039 | Schema 涵蓋 A~H 八分類 | PASS |
| TS-F036-040 | 排除欄位不存在 | PASS |

### Phase B：ETL 轉換函式

| 場景 ID | 說明 | 狀態 |
|---------|------|------|
| TS-F036-018 | 電話合併 -- 正常 | PASS |
| TS-F036-019 | 電話合併 -- 佔位值 | PASS |
| TS-F036-020 | 電話合併 -- 各欄位佔位值 | PASS |
| TS-F036-021 | 電話合併 -- 空值邊界 | PASS |
| TS-F036-022 | DECIMAL 轉換 -- 有效 | PASS |
| TS-F036-023 | DECIMAL 轉換 -- 無效 | PASS |
| TS-F036-024 | 客戶類型 -- MLMC 轉換 | PASS |
| TS-F036-025 | 客戶類型 -- ZZIP 直接映射 | PASS |
| TS-F036-026 | 代碼描述 -- 正常轉換 | PASS |
| TS-F036-027 | 代碼描述 -- 未知代碼 | PASS |

### Phase C：前端適配

| 場景 ID | 說明 | 狀態 |
|---------|------|------|
| TS-F036-030 | Load 節點選擇器 1 選項 | PASS |
| TS-F036-031 | 選擇後自動載入欄位 | PASS |
| TS-F036-032 | ETL 追蹤欄位不可手動對應 | PASS |
| TS-F036-033 | 欄位對應輸入可編輯 | PASS |
| TS-F036-034 | 欄位對應值正確更新 | PASS |

### DEFERRED 場景

| 場景 ID | 說明 | 原因 |
|---------|------|------|
| TS-F036-028 | 衝突解決 -- MLMC 較新 | 依賴 US-042 Transform 節點 |
| TS-F036-029 | 衝突解決 -- ZZIP 較新 | 依賴 US-042 Transform 節點 |
| TS-F036-035 | ETL 追蹤自動填充 E2E | 依賴 F030 Pipeline 執行 Load 寫入 |
| TS-F036-036 | 追蹤欄位值合理性 | 依賴 F030 Pipeline 執行 Load 寫入 |

## 檔案變更清單

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| apps/api/src/modules/etl/target-table-schemas.ts | modified | 重寫為 1 表 79 欄位（A~H 八分類完整定義） |
| apps/api/src/modules/etl/etl-transforms.ts | new | ETL 轉換函式（mergePhone, toDecimal, mapCustomerType, lookupCodeDescription） |
| apps/api/src/modules/etl/__tests__/target-table-schemas.spec.ts | new | Schema 定義 Unit Test（43 項） |
| apps/api/src/modules/etl/__tests__/target-table.service.spec.ts | new | Service 層 Unit Test（8 項） |
| apps/api/src/modules/etl/__tests__/etl-transforms.spec.ts | new | ETL 轉換函式 Unit Test（29 項） |
| apps/api/test/target-table.e2e-spec.ts | modified | 重寫 E2E 測試以匹配 v2.0（19 項） |
| apps/api/src/database/migrations/1711360000000-CreateCustomerCore.ts | new | Database Migration（customer_core 表 + 索引） |
| apps/web/src/pages/etl-pipelines/target-tables-page.tsx | modified | 頁面副標題更新為 Phase 1 MVP 1 表 |
| apps/web/src/pages/etl-pipelines/__tests__/target-tables-page.test.tsx | modified | 前端測試更新為 1 表 79 欄位 mock data |
| apps/web/src/pages/etl-pipelines/editor/__tests__/load-properties.test.tsx | new | LoadProperties 元件測試（5 項） |

## 架構決策

- **Schema 定義方式**：保留單檔 `target-table-schemas.ts` 方案（Phase 1 僅 1 表，保持簡單）。Phase 2 新增表時再重構為子目錄結構。
- **columnCount 動態計算**：Service 層 `getAll()` 使用 `columns.length` 動態計算，不硬編碼數字。
- **欄位型別含精度**：型別字串包含完整精度資訊（如 `VARCHAR(20)`, `DECIMAL(8,2)`），與 Migration DDL 一致。
- **ETL 追蹤欄位 nullable**：`data_source` 在 v2.0 規格中改為 `NOT NULL`（v1.0 為 nullable）。
- **Migration 策略**：使用原始 SQL Migration（不建立 TypeORM Entity），符合 AD-E05-5 設計決策。
- **轉換函式為純函式**：`mergePhone`, `toDecimal`, `mapCustomerType`, `lookupCodeDescription` 皆為無副作用純函式，方便 Unit Test。

## 測試統計

- 後端 Unit Test：43（schema）+ 8（service）+ 29（transforms）= **80 項全過**
- 後端 E2E Test：**19 項全過**
- 前端 Test：9（target-tables-page）+ 5（load-properties）= **14 項全過**
- **總計：113 項測試，全部通過**
- 全專案回歸測試：後端 341 unit + 411 E2E + 前端 515 = **1,267 項全部通過**
