---
type: test-design-feature
feature_id: F076
feature_name: 類別型欄位可選值管理（v1.5）
priority: P0-MVP
related_spec: /docs/specs/features/F076-manage-categorical-field-values.md
spec_version: "1.5"
covers:
  - F076
  - US-103
  - US-125
date: 2026-05-20
last_updated: 2026-05-20
---

# F076：類別型欄位可選值管理（v1.5）— 測試設計

> **v1.5 測試設計範圍**：本文件覆蓋 F076 v1.5 重構 seed 新增的 8 個測試場景：case_status 4 筆 seed 正確性、caseyear 8 筆確認、spec_tp 32 筆真實 dump（非 placeholder）、冪等執行驗證、停用選項的動態載入、停用不回溯語意，及 RBAC 防呆。對應 GAP-LIST §E4、§E5、§E6。v1.0~v1.4 既有 AC（AC-1~AC-10）的測試場景由既有 E2E suite 覆蓋，不在本文件重複列出。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F076-manage-categorical-field-values.md` v1.5 + `data-model.md#pooldata-field-option` + `architecture-spec.md §18.3`（M3/M4 migration） |
| QA / Tester | 本文件 + `error-handling.md` §assignment-role-errors |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Migration Integration（Test Container 或 SQLite in-memory + 實際 migration 執行）、後端 Integration（Supertest）、前端 Component（RTL + MSW） |
| seed 冪等依賴 | M3（spec_tp 32 筆 UPSERT）/ M4（case_status 4 筆 + whitelist 1 筆 DO NOTHING）；見 `migration/M01-migration-test.md` |

---

## 一、seed 正確性驗證

### TS-F076-001：seed case_status 4 筆（01/02/03/04）冪等執行後正確存在

- **關聯需求**：F076 AC-3 v1.5 / US-125 AC-2 / GAP E4
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：執行 M4（`1711360000284-SeedCaseStatusWhitelistAndOptions.ts`）up()
- **步驟**：
  1. 查詢 DB `SELECT option_value, option_label, is_active FROM pooldata_field_option WHERE column_name = 'case_status' ORDER BY option_value`
  2. 驗證結果
- **預期結果**：
  - 回傳 4 筆，option_value 分別為 `01`、`02`、`03`、`04`
  - 所有 4 筆 `is_active = true`
  - `01` option_label 含「期中」；`02` 含「中結」；`03` 含「滿期」；`04` 含「滿期」

---

### TS-F076-002：seed caseyear 8 筆（0~6 + 99）冪等執行後正確存在

- **關聯需求**：F076 AC-3 / US-125 AC-1 / J5
- **測試類型**：Positive / Integration（DB 驗證）
- **前置條件**：caseyear seed 已執行（由 m22 現行 migration 完成）
- **步驟**：
  1. 查詢 `SELECT option_value FROM pooldata_field_option WHERE column_name = 'caseyear' AND is_active = true ORDER BY option_value`
- **預期結果**：
  - 回傳 8 筆：`0`、`1`、`2`、`3`、`4`、`5`、`6`、`99`
  - 無 `7`、`8`、`9`、`10`（舊 hardcoded 11 筆範圍的多餘值）

---

### TS-F076-003：seed spec_tp 32 筆（真實 OBMCODEDF dump）非 placeholder 3 筆

- **關聯需求**：F076 AC-3 v1.5 / GAP E5 / M3
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：執行 M3（`1711360000283-UpsertSpecTpOptions32.ts`）up()
- **步驟**：
  1. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'spec_tp'`
  2. 查詢確認 m24 placeholder 的 3 筆代碼（`01`/`02`/`03`，若為 placeholder）**不再**是唯一存在的 3 筆
- **預期結果**：
  - count = 32（真實 OBMCODEDF TBL_ID='09' dump 筆數）
  - 所有 32 筆 `is_active = true`
  - **注意**：Phase 5 TDD Developer 實作前需先讀取 `reference/DumpData/OBMCODEDF_20260505.csv` 核實確切 32 筆 OBMVALUE；若實際筆數非 32，以 CSV 實際值為準並更新本 assertion（TEST-RISK-005）

---

### TS-F076-004：spec_tp seed 重複執行不產生重複（UPSERT 冪等）

- **關聯需求**：F076 AC-3 / M3 idempotency
- **測試類型**：Boundary / Migration Integration（DB 驗證）
- **前置條件**：M3 up() 已執行一次
- **步驟**：
  1. 再次執行 M3 up()（第二次）
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'spec_tp'`
- **預期結果**：count 與第一次執行後相同（不新增重複記錄；ON CONFLICT UPSERT 語意）

---

### TS-F076-005：case_status seed 重複執行不產生重複（DO NOTHING 冪等）

- **關聯需求**：F076 AC-3 / M4 idempotency
- **測試類型**：Boundary / Migration Integration（DB 驗證）
- **前置條件**：M4 up() 已執行一次
- **步驟**：
  1. 再次執行 M4 up()（第二次）
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'case_status'`
- **預期結果**：count = 4（不因重複執行增加；DO NOTHING/INSERT OR IGNORE 冪等）

---

## 二、動態選項載入（管理員停用後即時反映）

### TS-F076-006：停用 caseyear 選項 `99` 後，名單表單 caseyear 選項只顯示 7 筆

- **關聯需求**：US-125 AC-4 動態載入
- **測試類型**：Positive / Frontend Component（RTL + MSW）
- **前置條件**：MSW mock `GET /api/v1/pooldata-fields/caseyear/options?active=true` 回傳 7 筆（0~6，不含 99，模擬 `99` 已停用）
- **步驟**：
  1. 渲染名單定義新增/編輯表單，使用者選取 caseyear 欄位
  2. 查看多選元件的選項清單
- **預期結果**：
  - 顯示 7 個選項（0~6）
  - `99` 不顯示（已停用）
  - 選項數量依 API 動態決定（無 hardcoded 邏輯）

---

## 三、停用選項不回溯語意

### TS-F076-007：停用選項不回溯：既有名單 condition_payload 含已停用值仍可月跑

- **關聯需求**：F076 BR-4 / US-122 AC-6
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：
  - 名單 `OB202605020` condition_payload 含 `{ columnName: "prod_kind", fieldType: "categorical", values: ["01","02"] }`
  - `pooldata_field_option`：`prod_kind` 選項 `02` 已停用（`is_active = false`）
  - 名單 stage=ready
- **步驟**：
  1. 觸發月跑（或呼叫 Stage 1 buildStage1Query 相關整合測試）
  2. 驗證 Stage 1 執行行為
- **預期結果**：
  - Stage 1 以 `prod_kind IN ('01','02')` 正常過濾 ob_pool_data（**不因停用而移除 `02`**）
  - 月跑完成，不報錯
  - 月跑完成後名單的 condition_payload 未被修改（停用不回溯）

---

## 四、RBAC 防呆

### TS-F076-008：處長呼叫 F076 寫入 API 回 403

- **關聯需求**：F076 AC-2
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：帳號持有「處長」角色（business_role = 'section_chief'）
- **步驟**：
  1. POST `/api/v1/pooldata-fields/prod_kind/options`（新增可選值 API），使用處長 JWT
  2. 驗證回應
- **預期結果**：HTTP 403，`error_code: AUTH_FORBIDDEN`

---

## 附錄：GAP 覆蓋對照

| GAP | 覆蓋場景 |
|---|---|
| E4 | TS-F076-001（case_status 4 筆 seed） |
| E5 | TS-F076-003（spec_tp 32 筆 dump） |
| E6 | TS-F076-002（caseyear / prod_kind seed 確認） |
