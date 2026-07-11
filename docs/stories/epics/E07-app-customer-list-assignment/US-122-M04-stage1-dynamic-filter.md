---
story-id: US-122
title: 月名單分派 Stage 1 動態 WHERE 條件執行（condition_payload 驅動）
epic: E07 — 客戶名單分派
module: M04 分派執行
priority: Must Have
status: Draft
date: 2026-05-19
version: "1.0"
source-feature-spec: F050-create-list-definition, F081-trigger-assignment-run
---

# US-122：月名單分派 Stage 1 動態 WHERE 條件執行（condition_payload 驅動）

> **Story ID**：US-122
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** 部長（Director）或 Admin
**I want** 觸發月名單分派後，系統依每份名單定義的篩選條件（condition_payload）動態過濾 OBPOOLDATA 案件池，而非撈取全表
**So that** 每份名單只取到符合其業務條件的案件，分派結果精確反映業務主管在名單定義時設定的篩選邏輯

---

## 背景說明

現行月名單分派 Stage 1 採全表讀取 OBPOOLDATA（GAP-LIST D1 / D2）。v2.1 重構後，Stage 1 必須依 `condition_payload` 動態組合 WHERE 條件。

**條件組合語意**：
- 多個欄位條件之間：**AND**（案件必須同時符合所有欄位條件）
- 同一類別型欄位的多個值之間：**OR / IN**（符合任一值即納入）
- 數值型欄位：**BETWEEN min AND max**（含邊界）

**backward-compat fallback**：condition_payload 為 NULL 的舊遷移名單，Stage 1 自動讀取 6 個 entity column，月名單分派不中斷（J6 / D4）。

**涵蓋 GAP-LIST 項目**：A6、D1、D2、D3、D4、J6、K4

---

## 驗收標準

### AC-1：condition_payload 驅動 Stage 1 動態過濾

- **Given** 月名單分派被觸發（US-081），Stage 1 開始讀取 `stage = 'ready'` 的名單列表
- **When** Stage 1 處理某名單 LIST_NO 時
- **Then** 系統讀取該名單的 `condition_payload`，將所有條件以 **AND** 邏輯組合為 OBPOOLDATA 的 WHERE 子句，只取符合全部條件的案件
- **And** 不讀取全表（不使用無 WHERE 的 `SELECT *`）

> **業務意義（A6/D1/D2）**：月名單分派結果精確反映每份名單的篩選邏輯，避免超出業務範圍的案件被錯誤納入分派。

---

### AC-2：類別型條件以 IN 語意比對多值

- **Given** 某名單條件包含 `{ columnName: "prod_kind", fieldType: "categorical", values: ["01", "02"] }`
- **When** Stage 1 組合 WHERE 子句
- **Then** 該欄位的比對條件為 `OBPOOLDATA.prod_kind IN ('01', '02')`（符合任一值即納入，OR 語意）
- **And** 儲存格式（JSON array 或 `$$` 分隔字串）在讀取時正確還原為查詢可用的值清單

> **業務意義（A6/D3）**：解決舊 SP 中 `LIKE '%val$$%'` 三段比對的不穩定問題，改以標準 SQL IN 語意，比對結果一致且可預期。

---

### AC-3：數值型條件以 BETWEEN 語意比對區間

- **Given** 某名單條件包含 `{ columnName: "month_cnt", fieldType: "numeric", min: 1, max: 6 }`
- **When** Stage 1 組合 WHERE 子句
- **Then** 該欄位的比對條件為 `OBPOOLDATA.month_cnt BETWEEN 1 AND 6`（含邊界值）

> **業務意義（A6）**：數值型欄位（如 MONTH_CNT 還款期數）以區間語意比對，符合業務「取特定期數範圍案件」的意圖。

---

### AC-4：condition_payload IS NULL 時 fallback 讀取 entity column

- **Given** 某名單定義的 `condition_payload` 為 NULL（舊遷移資料，尚未透過 Phase 3a E2 backfill migration 轉換）
- **When** Stage 1 讀取該名單
- **Then** 系統自動 fallback，改以 6 個 entity column（`prod_kind` / `caseyear` / `spec_tp` / `settle_src` / `case_status` / `card_type`）組合 WHERE 條件
- **And** fallback 路徑不報錯，月名單分派繼續正常執行完成
- **And** fallback 行為不修改名單資料（不觸發 condition_payload 寫入）

> **業務意義（D4/J6）**：保障遷移期間舊名單的月名單分派不中斷，業務主管無需手動重設舊名單條件。

---

### AC-5：Stage 1 只讀取 stage = 'ready' 的名單（沿用既有）

- **Given** 月名單分派 Stage 1 執行
- **When** 系統讀取名單列表
- **Then** 僅讀取 `stage = 'ready'`（且 `status = 'active'`）的名單，draft / dept_ratio / personnel_ratio / approval 階段的名單一律排除
- **And** 此規則與 v1.0 一致，本次重構不改變（K4 保留）

---

### AC-6：停用白名單欄位不中斷月名單分派

- **Given** 名單定義的 condition_payload 中包含欄位 `settle_src`；管理員事後停用白名單中的 `settle_src` 欄位（`is_active = false`）
- **When** 月名單分派 Stage 1 執行時讀取此名單
- **Then** 月名單分派仍正確依 condition_payload 中的 `settle_src` 條件過濾 OBPOOLDATA，不因欄位被停用而報錯或跳過該條件
- **And** 月名單分派讀取 condition_payload 時不查詢白名單的 is_active 狀態（條件已固化於儲存時）

> **業務意義**：停用欄位的「不回溯」語意延伸至月名單分派執行。已提交的名單條件不因管理員後續維護白名單而失效（與 US-102 AC-8 / US-103 AC-7 一致）。

---

## 技術備註

- Stage 1 動態 SQL 組合的具體實作策略（ORM / raw query / query builder）由 **Phase 3a system-architect** 決定（GAP-LIST D1~D3）
- condition_payload JSON schema 由 **Phase 2 spec-writer** 在 F050 spec 定義；本 Story 僅定義 user-facing 篩選語意
- fallback 的 6 個 entity column 讀取邏輯（D4）亦由 Phase 3a 設計
- 月名單分派為非同步執行（AD-E07-2），Stage 1 的執行進度可由 US-082 查看

---

## 測試案例

### TC-122-01：多欄位 AND 條件正確過濾

- **Given**：名單條件 `prod_kind IN ['01'] AND spec_tp IN ['02','04'] AND settle_src IN ['Y']`；OBPOOLDATA 有 5 筆案件（僅 2 筆全部符合）
- **When**：月名單分派 Stage 1 執行
- **Then**：Stage 1 輸出 2 筆符合案件，其他 3 筆正確排除

### TC-122-02：categorical 多值 IN 語意正確

- **Given**：名單條件 `prod_kind IN ['01', '02']`；OBPOOLDATA 有 prod_kind='01'、'02'、'03' 各 1 筆
- **When**：Stage 1 執行
- **Then**：取出 prod_kind='01' 和 '02' 各 1 筆，共 2 筆；prod_kind='03' 排除

### TC-122-03：numeric BETWEEN 正確

- **Given**：名單條件 `month_cnt BETWEEN 1 AND 6`；OBPOOLDATA 有 month_cnt=1, 6, 7 各 1 筆
- **When**：Stage 1 執行
- **Then**：month_cnt=1 和 6 均納入（含邊界），month_cnt=7 排除

### TC-122-04：condition_payload IS NULL 時 fallback 正常執行

- **Given**：舊名單 condition_payload = NULL；entity column prod_kind='01'、spec_tp='02'
- **When**：月名單分派 Stage 1 執行此名單
- **Then**：Stage 1 以 entity column 組合 WHERE 條件，月名單分派完成不報錯；condition_payload 仍為 NULL（未被修改）

### TC-122-05：非 ready 名單不被月名單分派讀取

- **Given**：名單 `OB202507001` stage = 'draft'；名單 `OB202507002` stage = 'ready'
- **When**：月名單分派 Stage 1 執行
- **Then**：只讀取 `OB202507002`；`OB202507001` 不出現在 Stage 1 處理清單中

### TC-122-06：停用白名單欄位不影響既有名單月名單分派

- **Given**：名單條件含 `settle_src`；白名單 `settle_src` 被停用
- **When**：月名單分派 Stage 1 執行此名單
- **Then**：Stage 1 仍依 `settle_src` 條件過濾，月名單分派完成不報錯

---

## 依賴關係

- **Blocked By**：US-121（condition_payload 驗證規則與語意定義）、US-081（月名單分派觸發機制，Stage 1 為月名單分派的一部分）
- **Blocks**：月名單分派 Stage 2~4 邏輯（依賴 Stage 1 的案件輸出清單）

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] 多欄位 AND 邏輯測試（TC-122-01）
- [ ] categorical IN 語意測試（TC-122-02）
- [ ] numeric BETWEEN 語意測試（TC-122-03）
- [ ] fallback 讀取 entity column 測試（TC-122-04）
- [ ] 非 ready 名單排除測試（TC-122-05）
- [ ] 停用欄位不中斷月名單分派測試（TC-122-06）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **GAP-LIST**：`docs/specs/implementation-log/F050-v2.1-refactor-gap-list.md`（A6、D1~D4、J6、K4）
- **相關 Stories**：US-081（月名單分派觸發）、US-082（執行進度查看）、US-121（condition_payload 驗證規則）、US-123（舊名單 backward-compat 讀取）、US-102（白名單欄位停用不回溯語意）、US-103（可選值停用不回溯語意）
- **Feature Spec**：`docs/specs/features/F050-create-list-definition.md`
