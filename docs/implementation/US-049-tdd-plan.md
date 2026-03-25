# US-049: 目標表 Domain-Oriented 規劃 — TDD 實作計畫

> **版本**: 1.0
> **日期**: 2026-03-25
> **狀態**: 計畫中
> **對應功能規格**: F036 v2.0
> **對應測試設計**: F036-test.md v2.0（40 個場景）

---

## 0. 現況分析與差距識別

### 已完成（F036-impl.md v1.0）

F036 v1.0 已實作完成，基於「4 個目標表（placeholder schema）」的設計：

| 項目 | v1.0 現況 | v2.0 目標 |
|------|----------|----------|
| 目標表數量 | 4 個（customer_core/interaction/financial/service） | **1 個**（僅 customer_core） |
| customer_core 欄位 | 13 個（generic placeholder） | **約 49 個**（A~H 八分類，嚴格對應 ZZIP + MLMC 來源） |
| ETL 轉換函式 | 僅 `injectEtlTrackingFields` | 新增：電話合併、佔位值過濾、DECIMAL 轉換、客戶類型對應、代碼描述轉換 |
| 前端目標表頁面 | 顯示 4 個 Domain 卡片 | 僅顯示 1 個 customer_core |
| 前端欄位對應介面 | 簡易 input 對應 | 維持現有（已透過 API 驅動，自動適應 schema 變更） |
| Database Migration | 無（靜態 schema 定義，不建表） | **新增 migration**：建立 customer_core 實體表（約 49 欄位） |

### 主要變更項目

1. **後端 — Schema 重寫**：`target-table-schemas.ts` 從 4 表 placeholder 改為 1 表 49 欄完整定義
2. **後端 — ETL 轉換函式**：新增 5 類轉換函式（電話合併、佔位值過濾、DECIMAL 轉換、客戶類型對應、代碼描述轉換）
3. **後端 — E2E 測試重寫**：`target-table.e2e-spec.ts` 全面更新以匹配新 schema
4. **後端 — Database Migration**：建立 `customer_core` 實體表
5. **前端 — 目標表頁面更新**：適配 1 表設計（大部分透過 API 自動適應）
6. **前端 — 測試更新**：mock data 改為 1 表 49 欄
7. **Shared Types**：維持不變（interface 已足夠泛用）

---

## 1. 實作順序總覽

```
Phase A：後端核心（Steps 1-5）— 序列執行
Phase B：ETL 轉換函式（Steps 6-10）— 可與 Phase A 完成後平行
Phase C：前端適配（Steps 11-13）— 依賴 Phase A 的 API contract
Phase D：E2E 級整合測試（Steps 14-15）— 依賴 Phase A + B
Phase E：Database Migration（Step 16）— 可與 Phase B 平行
```

### 依賴關係圖

```
Step 1 (Schema Unit) ──→ Step 2 (Schema 實作)
                              │
                              ├──→ Step 3 (Service Unit) ──→ Step 4 (Service 實作)
                              │                                    │
                              │                                    ├──→ Step 5 (E2E 測試)
                              │                                    │
                              │                              Step 11 (前端 mock 更新)
                              │                                    │
                              │                              Step 12 (前端頁面適配)
                              │                                    │
                              │                              Step 13 (前端 Load 節點)
                              │
Step 6 (電話合併 Unit) ─┐
Step 7 (DECIMAL Unit) ──┤
Step 8 (客戶類型 Unit) ──┼──→ Step 9 (轉換函式實作) ──→ Step 10 (代碼描述 Unit)
                         │
Step 16 (Migration) ─────┤
                         │
                    Step 14 (ETL 追蹤 E2E) ──→ Step 15 (衝突解決 E2E)
```

**可平行的步驟**：
- Steps 6, 7, 8 彼此獨立，可平行
- Step 16（Migration）與 Steps 6-10 可平行
- Steps 11-13（前端）與 Steps 6-10（轉換函式）可平行

---

## Phase A：後端 Schema 重寫（Steps 1-5）

### Step 1：customer_core Schema 定義 — Unit Tests（Red）

**目標**：建立 customer_core 完整 49 欄位 schema 定義的 Unit Test

**對應測試場景**：TS-F036-039, TS-F036-040

**Red — 先寫測試**：

建立 `apps/api/src/modules/etl/__tests__/target-table-schemas.spec.ts`：

- **TS-F036-039**：驗證 customer_core schema 涵蓋 A~H 所有分類欄位
  - A 類（5 欄）：customer_id, source_customer_no, customer_type, name, english_name
  - B 類（5 欄）：gender, date_of_birth, marital_status, education_code, education_desc
  - C 類（6 欄）：mobile_phone, home_phone, contact_phone, office_phone, email, line_account
  - D 類（6 欄）：residential_zip, residential_address, mailing_zip, mailing_address, company_zip, company_address
  - E 類（10 欄）：company_name, occupation_code, occupation_desc, job_title_code, job_title_desc, job_level, industry_code, industry_desc, work_years, company_scale
  - F 類（10 欄）：monthly_income, approved_income, income_source, capital, credit_limit, has_real_estate, debt_flag, fine_flag, address_anomaly_flag, mainland_flag
  - G 類（7 欄）：owner_name, owner_id, owner_birth, established_capital, employee_count, is_listed, parent_customer_id
  - H 類（5 欄）：source_created_at, source_updated_at, data_source, _etl_loaded_at, _etl_pipeline_id
  - 總欄位數 = 5+5+6+6+10+10+7+5 = **54**（注意：測試設計中 A~H 加總為 54，但 columnCount 說「約 45」；以 schema 定義實際值為準，見風險註記）
- **TS-F036-040**：驗證排除欄位不存在
  - spouse_nm, father_nm, mother_nm, print_flg, id_check, id_check_date, issue_add, issue_class, issue_date, old_p_id, appli_mark, spon_mark

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/target-table-schemas.spec.ts`（新建）

---

### Step 2：customer_core Schema 定義 — 實作（Green）

**目標**：重寫 `target-table-schemas.ts`，定義完整 49 欄位

**Green — 實作程式碼**：

重寫 `apps/api/src/modules/etl/target-table-schemas.ts`：
- 移除 customer_interaction, customer_financial, customer_service 三個 placeholder 表
- 將 customer_core 的 columns 替換為 A~H 八分類完整欄位（依 F036 v2.0 Section 11 定義）
- 每個欄位定義：name, type, nullable, isPrimaryKey, isEtlTracking, description
- ETL_TRACKING_COLUMNS 共用陣列保留，但 `data_source.nullable` 改為 `false`（依 F036 v2.0 Section 11.H）
- displayName 改為 `"Customer Core（客戶主檔）"`（依 F036 v2.0 API 規格）

**架構選項**：依 architecture-spec.md AD-E05-6 建議，可選擇：
- 方案 A（簡單）：繼續在 `target-table-schemas.ts` 中直接定義（適合 Phase 1 僅 1 表）
- 方案 B（可擴展）：建立 `target-tables/` 子目錄，`customer-core.definition.ts` + `index.ts`（架構規格建議）

**建議**：Phase 1 僅 1 表，採用方案 A 保持簡單；若未來 Phase 2 新增表再重構為方案 B。

**Refactor**：將 displayName、description 等中英夾雜的字串統一格式。

**預計涉及檔案**：
- `apps/api/src/modules/etl/target-table-schemas.ts`（修改）

---

### Step 3：TargetTableService — Unit Tests 更新（Red）

**目標**：確保 Service 層正確處理 1 表 schema

**對應測試場景**：TS-F036-001, TS-F036-002, TS-F036-003, TS-F036-012, TS-F036-013

**Red — 先寫測試**：

可在 `apps/api/src/modules/etl/__tests__/target-table.service.spec.ts`（新建或更新）中寫：

- `getAll()` 回傳 data 陣列長度 = 1
- `getAll()` 回傳的 `data[0].tableName === "customer_core"`
- `getAll()` 回傳物件含且僅含 tableName/displayName/domain/columnCount/description 五欄位
- `getAll()` 不含 customer_interaction/financial/service
- `getSchema("customer_core")` 回傳正確 columns 長度
- `getSchema("customer_unknown")` 拋出 NotFoundException
- `getSchema("customer_interaction")` 拋出 NotFoundException（Phase 2/3 不存在）
- `getSchema("customer_financial")` 拋出 NotFoundException
- `getSchema("customer_service")` 拋出 NotFoundException

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/target-table.service.spec.ts`（新建）

---

### Step 4：TargetTableService — 實作更新（Green）

**目標**：Service 層無需修改（已是通用邏輯），確認測試通過即可

**Green**：由於 Service 邏輯是從 `TARGET_TABLE_SCHEMAS` 陣列 find/map，Step 2 已修改底層資料，理論上 Service 無需改動。若測試全過，跳過此步。

**預計涉及檔案**：
- `apps/api/src/modules/etl/target-table.service.ts`（可能無需修改）

---

### Step 5：E2E 測試重寫（Red → Green）

**目標**：重寫 `target-table.e2e-spec.ts` 以匹配 v2.0 測試場景

**對應測試場景**：TS-F036-001 ~ TS-F036-017, TS-F036-037, TS-F036-038

**Red — 重寫測試**：

完全重寫 `apps/api/test/target-table.e2e-spec.ts`：

**類別一：目標表清單 API（TS-F036-001 ~ TS-F036-003）**

| 場景 ID | 測試內容 | 驗證邏輯 |
|---------|---------|---------|
| TS-F036-001 | Phase 1 MVP 僅回傳 1 個目標表 | `data.length === 1`; `data[0].tableName === "customer_core"`; 不含 interaction/financial/service |
| TS-F036-002 | 回應結構完整 | 物件含且僅含 5 個屬性；各屬性型別正確；值非空 |
| TS-F036-003 | columnCount 與 domain 正確 | `columnCount` 與 schema 實際欄位數一致；`domain === "core"`；displayName 含 "Customer Core" |

**類別二：Schema API（TS-F036-004 ~ TS-F036-011）**

| 場景 ID | 測試內容 | 驗證邏輯 |
|---------|---------|---------|
| TS-F036-004 | customer_core schema 欄位總數 | `columns.length` 為正確欄位數（A~H 分類加總） |
| TS-F036-005 | A 類欄位定義正確 | customer_id(UUID/PK), source_customer_no(VARCHAR/NOT NULL), customer_type(VARCHAR/NOT NULL), name(VARCHAR/NOT NULL), english_name(VARCHAR/nullable) |
| TS-F036-006 | B 類欄位定義正確 | gender, date_of_birth(DATE), marital_status, education_code, education_desc 均 nullable |
| TS-F036-007 | C 類欄位定義正確 | 6 個電話/email/line 欄位均 VARCHAR/nullable |
| TS-F036-008 | F 類型別定義正確 | monthly_income/capital/credit_limit 為 DECIMAL；address_anomaly_flag/mainland_flag 為 SMALLINT/INTEGER；debt_flag/fine_flag 為 CHAR/VARCHAR |
| TS-F036-009 | ETL 追蹤欄位標示正確 | data_source(NOT NULL), _etl_loaded_at(TIMESTAMP/NOT NULL), _etl_pipeline_id(UUID/NOT NULL) 均 isEtlTracking=true；source_created_at/source_updated_at 存在 |
| TS-F036-010 | 主鍵欄位正確 | 恰好 1 個 isPrimaryKey=true（customer_id）；其餘皆 false |
| TS-F036-011 | 所有欄位含非空 description | 遍歷 columns 驗證 description 為非空字串 |

**類別三：Negative（TS-F036-012 ~ TS-F036-017）**

| 場景 ID | 測試內容 | 驗證邏輯 |
|---------|---------|---------|
| TS-F036-012 | 不存在的表回 404 | `customer_unknown` → 404 + PIPELINE_TARGET_TABLE_NOT_FOUND |
| TS-F036-013 | Phase 2/3 未建立表回 404 | customer_interaction/financial/service 各自回 404 |
| TS-F036-014 | User 角色存取清單 403 | userToken → 403 + AUTH_FORBIDDEN |
| TS-F036-015 | User 角色存取 schema 403 | userToken → 403 + AUTH_FORBIDDEN |
| TS-F036-016 | 無 token 清單 401 | 無 header → 401 + AUTH_TOKEN_MISSING |
| TS-F036-017 | 無 token schema 401 | 無 header → 401 + AUTH_TOKEN_MISSING |

**類別八：Boundary（TS-F036-037, TS-F036-038）**

| 場景 ID | 測試內容 | 驗證邏輯 |
|---------|---------|---------|
| TS-F036-037 | 特殊字元表名 | `customer%20core`、`customer-core` → 404 |
| TS-F036-038 | 空路徑參數 | `//schema` → 404 或路由不匹配 |

**Green**：Step 2 已完成 schema 重寫，E2E 測試應自然通過。若有不通過項目，調整 schema 定義。

**預計涉及檔案**：
- `apps/api/test/target-table.e2e-spec.ts`（重寫）

---

## Phase B：ETL 轉換函式（Steps 6-10）

### Step 6：電話合併函式（Red → Green → Refactor）

**目標**：實作電話合併與佔位值過濾函式

**對應測試場景**：TS-F036-018, TS-F036-019, TS-F036-020, TS-F036-021

**Red — 先寫測試**：

建立 `apps/api/src/modules/etl/__tests__/etl-transforms.spec.ts`：

```
describe('mergePhone')
  TS-F036-018: ("02", "27123456") → "02-27123456"
  TS-F036-019: ("00", "0000000000") → null
  TS-F036-020: 三種電話欄位佔位值均 → null
  TS-F036-021: (null, "27123456") → null; ("02", null) → null; ("", "") → null
```

**Green — 實作**：

建立 `apps/api/src/modules/etl/etl-transforms.ts`（或 `transforms/phone-merge.ts`）：

```typescript
export function mergePhone(areaCode: string | null, telNo: string | null): string | null
```

- 若 areaCode 或 telNo 為 null/空 → return null
- 合併為 `${areaCode}-${telNo}`
- 檢查佔位值：全零模式、空字串 → return null
- 否則回傳合併結果

**Refactor**：佔位值判斷提取為 `isPlaceholder()` 私有函式。

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/etl-transforms.spec.ts`（新建）
- `apps/api/src/modules/etl/etl-transforms.ts`（新建）

---

### Step 7：DECIMAL 型別轉換函式（Red → Green）

**目標**：varchar → DECIMAL 轉換

**對應測試場景**：TS-F036-022, TS-F036-023

**Red — 先寫測試**：

在 `etl-transforms.spec.ts` 中新增：

```
describe('toDecimal')
  TS-F036-022: "5000000" → 5000000; "12500000.50" → 12500000.50; "0" → 0
  TS-F036-023: "ABC" → null; "" → null; null → null
```

**Green — 實作**：

在 `etl-transforms.ts` 中新增：

```typescript
export function toDecimal(value: string | null): number | null
```

- parseFloat + isNaN 檢查
- null/空字串 → null

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/etl-transforms.spec.ts`（擴充）
- `apps/api/src/modules/etl/etl-transforms.ts`（擴充）

---

### Step 8：客戶類型對應函式（Red → Green）

**目標**：MLMC.CUTYPE 轉換（1→01, 2→02）與 ZZIP.CUSTOM_MK 直接映射

**對應測試場景**：TS-F036-024, TS-F036-025

**Red — 先寫測試**：

```
describe('mapCustomerType')
  TS-F036-024: ("MLMC", "1") → "01"; ("MLMC", "2") → "02"
  TS-F036-025: ("ZZIP", "01") → "01"; ("ZZIP", "02") → "02"; ("ZZIP", "04") → "04"
```

**Green — 實作**：

```typescript
export function mapCustomerType(source: 'ZZIP' | 'MLMC', value: string): string
```

- ZZIP：直接回傳（已是兩位格式）
- MLMC：`padStart(2, '0')` 補零

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/etl-transforms.spec.ts`（擴充）
- `apps/api/src/modules/etl/etl-transforms.ts`（擴充）

---

### Step 9：轉換函式模組整合

**目標**：確保所有轉換函式可正常匯出使用

**Refactor**：
- 統一匯出介面
- 若函式數量 > 5，考慮拆分至 `transforms/` 子目錄（與架構規格建議一致）

---

### Step 10：代碼描述轉換函式（Red → Green）

**目標**：code 保留 + desc 由對照表查詢

**對應測試場景**：TS-F036-026, TS-F036-027

**注意**：依賴 US-030（代碼對照表）。若 US-030 尚未完成，以 stub/mock 替代。

**Red — 先寫測試**：

```
describe('lookupCodeDescription')
  TS-F036-026: education_code="03" → education_code 保留, education_desc 從對照表查得
  TS-F036-027: occupation_code="XXXX"（不存在）→ occupation_code 保留, occupation_desc = null
```

**Green — 實作**：

```typescript
export function lookupCodeDescription(
  codeType: string,
  codeValue: string,
  codeLookupTable: Map<string, string>,
): { code: string; desc: string | null }
```

- 純函式：接收 codeLookupTable（Map），查詢 desc
- code 原值保留；找不到則 desc = null

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/etl-transforms.spec.ts`（擴充）
- `apps/api/src/modules/etl/etl-transforms.ts`（擴充）

---

## Phase C：前端適配（Steps 11-13）

### Step 11：前端 Mock Data 與共用型別更新（Red）

**目標**：更新前端測試的 mock data，改為 1 表 schema

**對應測試場景**：前端全部（target-tables-page.test.tsx 中的 9 項）

**Red — 更新測試**：

修改 `apps/web/src/pages/etl-pipelines/__tests__/target-tables-page.test.tsx`：

- `mockTableList.data` 從 4 筆改為 1 筆（僅 customer_core）
- `mockCoreSchema.columns` 更新為完整 49 欄（或至少代表性子集）
- 更新頁面標題驗證：`"系統預定義的 4 個"` → `"系統預定義的 1 個"`（或依實際 UI 文案）
- 移除 4 卡片相關 assertion（card-interaction, card-financial, card-service）
- 調整 badge 顏色測試：僅驗證 core 的 blue 配色
- 更新 columnCount 驗證
- 保留：展開/收合、PK 標示、ETL tracking 標示、chevron 旋轉

**預計涉及檔案**：
- `apps/web/src/pages/etl-pipelines/__tests__/target-tables-page.test.tsx`（修改）

---

### Step 12：前端目標表頁面適配（Green）

**目標**：更新 `target-tables-page.tsx` 以適配 1 表設計

**Green — 修改程式碼**：

修改 `apps/web/src/pages/etl-pipelines/target-tables-page.tsx`：

- 頁面副標題更新：`"系統預定義的 4 個 Domain Data Product 目標表"` → `"Phase 1 MVP 預定義 1 個 Domain Data Product 目標表，由 ETL Pipeline Load 節點寫入"`（或依原型 22 最新內容）
- 由於頁面是 API 驅動的動態渲染，核心渲染邏輯（cards loop、columns table）無需修改
- Domain colors map 保留（未來 Phase 2 會用到）
- 確認展開 customer_core 時能正確顯示 49 欄位（需驗證 max-height overflow scroll 是否足夠）

**預計涉及檔案**：
- `apps/web/src/pages/etl-pipelines/target-tables-page.tsx`（修改）

---

### Step 13：前端 Load 節點適配驗證

**目標**：驗證 LoadProperties 元件在 1 表 schema 下行為正確

**對應測試場景**：TS-F036-030, TS-F036-031, TS-F036-032, TS-F036-033, TS-F036-034

**注意**：LoadProperties 元件已是 API 驅動（`getTargetTables` + `getTargetTableSchema`），理論上自動適應 schema 變更。

**Red — 寫測試**（若尚未有 LoadProperties 單元測試）：

建立 `apps/web/src/pages/etl-pipelines/editor/__tests__/load-properties.test.tsx`：

- **TS-F036-030**：目標表下拉選單顯示 1 個選項（customer_core），不顯示其他 3 個
- **TS-F036-031**：選擇後自動載入欄位對應介面，欄位數量正確
- **TS-F036-032**：ETL 追蹤欄位顯示「系統自動填充」，Lock icon，不可編輯
- **TS-F036-033**：來源欄位 input 可輸入（模擬下拉或拖曳）
- **TS-F036-034**：已對應欄位值正確更新

**Green**：LoadProperties 元件可能無需修改。若測試揭露問題再調整。

**預計涉及檔案**：
- `apps/web/src/pages/etl-pipelines/editor/__tests__/load-properties.test.tsx`（新建）
- `apps/web/src/pages/etl-pipelines/editor/properties-panel.tsx`（可能修改）

---

## Phase D：E2E 級整合測試（Steps 14-15）

### Step 14：ETL 追蹤欄位自動填充 E2E 驗證

**對應測試場景**：TS-F036-035, TS-F036-036

**狀態**：依賴 F030（Pipeline 執行 Load 節點寫入）完成。

**策略**：
- 若 F030 Load 節點寫入已完成：寫 E2E 測試，觸發 Pipeline 執行，驗證 customer_core 表寫入資料的追蹤欄位
- 若 F030 尚未完成：以 Unit Test 驗證 `injectEtlTrackingFields()` 函式（已在 v1.0 完成），標記 E2E 為 DEFERRED

**已有 Unit Test（v1.0）**：
- `etl-tracking.util.spec.ts` 中 3 項測試已涵蓋基本邏輯
- 可能需更新：`data_source` 在 v2.0 規格中 `nullable=false`，需確保函式在無 dataSourceName 時拋錯或給預設值

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/etl-tracking.util.spec.ts`（可能更新）
- `apps/api/src/modules/etl/etl-tracking.util.ts`（可能更新）

---

### Step 15：衝突解決整合測試

**對應測試場景**：TS-F036-028, TS-F036-029

**狀態**：依賴 US-042（Pipeline 編輯器 Transform 節點衝突解決邏輯）完成。US-049 明確標注「於 US-042 處理」。

**策略**：
- 若 US-042 已完成：寫 Integration Test，模擬兩來源衝突資料，驗證以 source_updated_at 較新者為準
- 若 US-042 尚未完成：標記為 DEFERRED，在本次實作中僅建立測試骨架（空 test 含 `.todo()` 標記）

**預計涉及檔案**：
- `apps/api/src/modules/etl/__tests__/etl-conflict-resolution.spec.ts`（新建，可能 DEFERRED）

---

## Phase E：Database Migration（Step 16）

### Step 16：customer_core 資料表 Migration

**目標**：建立 `customer_core` 實體表，約 49 欄位 + 索引

**對應規格**：F036 Section 11（A~H 欄位定義）、architecture-spec.md（索引建議）

**Migration 內容**：

```sql
CREATE TABLE customer_core (
  -- A. 識別與分類
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_customer_no VARCHAR(20) NOT NULL,
  customer_type VARCHAR(2) NOT NULL,
  name VARCHAR(100) NOT NULL,
  english_name VARCHAR(60),
  -- B. 個人屬性
  gender VARCHAR(1),
  date_of_birth DATE,
  marital_status VARCHAR(1),
  education_code VARCHAR(2),
  education_desc VARCHAR(50),
  -- C. 聯絡資訊
  mobile_phone VARCHAR(20),
  home_phone VARCHAR(20),
  contact_phone VARCHAR(20),
  office_phone VARCHAR(20),
  email VARCHAR(40),
  line_account VARCHAR(50),
  -- D. 地址
  residential_zip VARCHAR(6),
  residential_address VARCHAR(100),
  mailing_zip VARCHAR(6),
  mailing_address VARCHAR(100),
  company_zip VARCHAR(6),
  company_address VARCHAR(100),
  -- E. 職業與就業
  company_name VARCHAR(100),
  occupation_code VARCHAR(4),
  occupation_desc VARCHAR(50),
  job_title_code VARCHAR(4),
  job_title_desc VARCHAR(50),
  job_level VARCHAR(2),
  industry_code VARCHAR(6),
  industry_desc VARCHAR(100),
  work_years DECIMAL(8,2),
  company_scale VARCHAR(1),
  -- F. 財務與風控
  monthly_income DECIMAL(8,0),
  approved_income INTEGER,
  income_source VARCHAR(5),
  capital DECIMAL(12,0),
  credit_limit DECIMAL(12,0),
  has_real_estate VARCHAR(1),
  debt_flag CHAR(1),
  fine_flag CHAR(1),
  address_anomaly_flag SMALLINT,
  mainland_flag SMALLINT,
  -- G. 企業客戶專屬
  owner_name VARCHAR(50),
  owner_id VARCHAR(10),
  owner_birth DATE,
  established_capital DECIMAL(12,0),
  employee_count VARCHAR(6),
  is_listed VARCHAR(6),
  parent_customer_id VARCHAR(10),
  -- H. 稽核與 ETL 追蹤
  source_created_at TIMESTAMP,
  source_updated_at TIMESTAMP,
  data_source VARCHAR(50) NOT NULL,
  _etl_loaded_at TIMESTAMP NOT NULL,
  _etl_pipeline_id UUID NOT NULL
);
```

**索引**（依 architecture-spec.md 建議）：

```sql
CREATE UNIQUE INDEX idx_customer_core_source_no ON customer_core(source_customer_no);
CREATE INDEX idx_customer_core_etl_pipeline ON customer_core(_etl_pipeline_id);
```

**Migration 策略**：
- 使用 TypeORM Migration CLI：`npx typeorm migration:create src/database/migrations/CreateCustomerCore`
- 注意：目標表**不建立 TypeORM Entity**（依 AD-E05-5 設計決策），使用原始 SQL migration
- Migration 需同時支援 up（建表）和 down（刪表）

**預計涉及檔案**：
- `apps/api/src/database/migrations/XXXXXXX-CreateCustomerCore.ts`（新建）

---

## 2. 前後端整合點

### API Contract 定義

兩個 API 端點的 request/response 格式已定義於 `packages/shared/src/index.ts`：

```typescript
// 已存在，無需修改
interface TargetTableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isEtlTracking: boolean;
  description: string;
}

interface TargetTableSummary {
  tableName: string;
  displayName: string;
  domain: string;
  columnCount: number;
  description: string;
}

interface TargetTableListResponse {
  data: TargetTableSummary[];
}

interface TargetTableSchemaResponse {
  tableName: string;
  displayName: string;
  domain: string;
  description: string;
  columns: TargetTableColumn[];
}
```

**重要**：Shared types 已足夠泛用，不需要修改。`TargetTableSchemaResponse` 支援任意數量的 columns，且欄位結構完整。

### 前端 API 函式

已存在於 `apps/web/src/api/etl-pipelines.ts`：
- `getTargetTables()` → `GET /api/v1/etl/target-tables`
- `getTargetTableSchema(tableName)` → `GET /api/v1/etl/target-tables/:tableName/schema`

**不需修改**。

---

## 3. 欄位數量澄清

### 風險：「約 45 欄位」vs 實際 A~H 加總

F036 v2.0 Section 11 A~H 八個分類的欄位加總：

| 分類 | 欄位數 |
|------|--------|
| A. 識別與分類 | 5 |
| B. 個人屬性 | 5 |
| C. 聯絡資訊 | 6 |
| D. 地址 | 6 |
| E. 職業與就業 | 10 |
| F. 財務與風控 | 10 |
| G. 企業客戶專屬 | 7 |
| H. 稽核與 ETL 追蹤 | 5 |
| **總計** | **54** |

但 F036 v2.0 API 範例顯示 `"columnCount": 45`，US-049 和 F036 標題都說「約 45 欄位」。

**決策**：以實際 schema 定義（A~H 分類表格）為權威來源。若 A~H 加總為 54，則 `columnCount` 應為 54。API 範例中的 `45` 是粗估值。測試設計 TS-F036-001 已標注「允許 ±1，以實際 schema 定義為準」。

**行動**：實作時以 54 欄位為準（或實際定義數量），columnCount 由 `columns.length` 動態計算（Service 已如此實作），API 範例中的 45 僅供參考。

---

## 4. 測試場景 → 步驟對照表

| 場景 ID | 場景名稱 | 所屬步驟 | 測試層級 |
|---------|---------|---------|---------|
| TS-F036-001 | Phase 1 MVP 僅回傳 1 個目標表 | Step 3, 5 | Unit + E2E |
| TS-F036-002 | 回應結構完整 | Step 3, 5 | Unit + E2E |
| TS-F036-003 | columnCount 與 domain 正確 | Step 3, 5 | Unit + E2E |
| TS-F036-004 | schema 欄位總數正確 | Step 5 | E2E |
| TS-F036-005 | A 類欄位定義正確 | Step 5 | E2E |
| TS-F036-006 | B 類欄位定義正確 | Step 5 | E2E |
| TS-F036-007 | C 類欄位定義正確 | Step 5 | E2E |
| TS-F036-008 | F 類型別定義正確 | Step 5 | E2E |
| TS-F036-009 | ETL 追蹤欄位標示正確 | Step 5 | E2E |
| TS-F036-010 | 主鍵欄位正確 | Step 5 | E2E |
| TS-F036-011 | 所有欄位含非空 description | Step 5 | E2E |
| TS-F036-012 | 不存在表回 404 | Step 3, 5 | Unit + E2E |
| TS-F036-013 | Phase 2/3 表回 404 | Step 3, 5 | Unit + E2E |
| TS-F036-014 | User 角色 403 | Step 5 | E2E |
| TS-F036-015 | User 角色 schema 403 | Step 5 | E2E |
| TS-F036-016 | 無 token 401 | Step 5 | E2E |
| TS-F036-017 | 無 token schema 401 | Step 5 | E2E |
| TS-F036-018 | 電話合併 — 正常 | Step 6 | Unit |
| TS-F036-019 | 電話合併 — 佔位值 | Step 6 | Unit |
| TS-F036-020 | 電話合併 — 各欄位佔位值 | Step 6 | Unit |
| TS-F036-021 | 電話合併 — 空值邊界 | Step 6 | Unit |
| TS-F036-022 | DECIMAL 轉換 — 有效 | Step 7 | Unit |
| TS-F036-023 | DECIMAL 轉換 — 無效 | Step 7 | Unit |
| TS-F036-024 | 客戶類型 — MLMC 轉換 | Step 8 | Unit |
| TS-F036-025 | 客戶類型 — ZZIP 直接映射 | Step 8 | Unit |
| TS-F036-026 | 代碼描述 — 正常轉換 | Step 10 | Unit |
| TS-F036-027 | 代碼描述 — 未知代碼 | Step 10 | Unit |
| TS-F036-028 | 衝突解決 — MLMC 較新 | Step 15 | Integration（DEFERRED） |
| TS-F036-029 | 衝突解決 — ZZIP 較新 | Step 15 | Integration（DEFERRED） |
| TS-F036-030 | Load 節點選擇器 1 選項 | Step 13 | Frontend Integration |
| TS-F036-031 | 選擇後自動載入欄位 | Step 13 | Frontend Integration |
| TS-F036-032 | ETL 追蹤欄位不可手動對應 | Step 13 | Frontend Integration |
| TS-F036-033 | 欄位對應拖曳 | Step 13 | Frontend Integration |
| TS-F036-034 | 欄位對應下拉選單 | Step 13 | Frontend Integration |
| TS-F036-035 | ETL 追蹤自動填充 E2E | Step 14 | E2E（DEFERRED） |
| TS-F036-036 | 追蹤欄位值合理性 | Step 14 | E2E（DEFERRED） |
| TS-F036-037 | 特殊字元表名 | Step 5 | E2E Boundary |
| TS-F036-038 | 空路徑參數 | Step 5 | E2E Boundary |
| TS-F036-039 | Schema 涵蓋 A~H | Step 1 | Unit |
| TS-F036-040 | 排除欄位不存在 | Step 1 | Unit |

---

## 5. DEFERRED 場景說明

以下場景因跨模組依賴，在本次 US-049 實作中標記為 DEFERRED：

| 場景 | 原因 | 前置條件 |
|------|------|---------|
| TS-F036-028, TS-F036-029 | 衝突解決邏輯「於 US-042 處理」 | US-042 Pipeline 編輯器 Transform 節點完成 |
| TS-F036-035, TS-F036-036 | E2E 級 Pipeline 執行寫入 | F030 Pipeline 執行 Load 節點寫入 customer_core 完成 |

---

## 6. 預估工作量

| Phase | 步驟 | 估計時間 |
|-------|------|---------|
| A | Steps 1-5（Schema 重寫 + E2E） | 2-3 小時 |
| B | Steps 6-10（ETL 轉換函式） | 1.5-2 小時 |
| C | Steps 11-13（前端適配） | 1-1.5 小時 |
| D | Steps 14-15（E2E 級整合） | 0.5 小時（多為 DEFERRED） |
| E | Step 16（Migration） | 0.5 小時 |
| **Total** | | **5.5-7.5 小時** |

---

## 7. Checklist（完成標準）

- [ ] `target-table-schemas.ts` 重寫為 1 表 49+ 欄位（A~H 分類完整）
- [ ] Unit Test：TS-F036-039, TS-F036-040 通過
- [ ] Service Unit Test：TS-F036-001~003, TS-F036-012~013 通過
- [ ] E2E Test：TS-F036-001~017, TS-F036-037~038 通過（共 20 項）
- [ ] ETL 轉換函式 Unit Test：TS-F036-018~027 通過（共 10 項）
- [ ] 前端頁面測試更新並通過（9+ 項）
- [ ] 前端 LoadProperties 測試：TS-F036-030~034 通過（共 5 項）
- [ ] Database Migration 建立（customer_core 表 + 索引）
- [ ] Shared types 無需修改（確認相容性）
- [ ] TS-F036-028/029/035/036 標記為 DEFERRED（含原因記錄）
- [ ] 更新 `docs/specs/implementation-log/F036-impl.md` 為 v2.0
