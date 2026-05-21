---
type: test-design-feature
feature_id: F076
feature_name: 類別型欄位可選值管理（v1.6）
priority: P0-MVP
related_spec: /docs/specs/features/F076-manage-categorical-field-values.md
spec_version: "1.6"
covers:
  - F076
  - US-103
  - US-125
  - US-129
date: 2026-05-20
last_updated: 2026-05-20
---

# F076：類別型欄位可選值管理（v1.5）— 測試設計

> **v1.6 測試設計範圍**：本文件覆蓋 F076 v1.5 重構 seed 新增的 8 個測試場景（TS-F076-001~008），以及 v1.6 新增的 F050 v2.1.1 配套場景（TS-F076-009~011）：best_case Y/N 選項 seed 正確性、`'N'` 標籤覆寫驗證（UPSERT DO UPDATE）、及冪等執行。對應 GAP-LIST §E4、§E5、§E6（v1.5）及 F050 v2.1.1 US-129（v1.6）。v1.0~v1.4 既有 AC（AC-1~AC-10）的測試場景由既有 E2E suite 覆蓋，不在本文件重複列出。

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
| seed 冪等依賴 | M3（spec_tp **52 筆** UPSERT，OBMCODEDF TBL_ID='12'）/ M4（case_status 4 筆 + whitelist 1 筆 DO NOTHING）；見 `migration/M01-migration-test.md` |

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

### TS-F076-003：seed spec_tp 52 筆（真實 OBMCODEDF dump）非 placeholder 3 筆

- **關聯需求**：F076 AC-3 v1.5（2026-05-21 二次更正）/ GAP E5 / M3
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：執行 M3（`1711360000283-UpsertSpecTpOptions32.ts`）up()
- **步驟**：
  1. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'spec_tp'`
  2. 查詢確認 m24 placeholder 的 3 筆代碼（`01`/`02`/`03`，若為 placeholder）**不再**是唯一存在的 3 筆
  3. 確認典型代碼：`01='本牌/新車'`、`11='他牌/新車'`、`42='重車_新車'`、`48='3C通訊家電'`、`99='其他'`
- **預期結果**：
  - count = 52（真實 OBMCODEDF TBL_ID='12' dump 筆數，option_value=TBL_CD、option_label=TBL_DESC1）
  - 所有 52 筆 `is_active = true`
  - **歷史**：TEST-RISK-005 已 ✅ Resolved 兩次（v1：32 筆 / `TBL_ID='09'` 筆誤；v1.1：`TBL_ID='02'` 32 筆筆誤；v2：52 筆 / `TBL_ID='12'` 正解，2026-05-21）

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

## 五、v1.6 新增測試場景（F050 v2.1.1 best_case Y/N options 配套）

> **v1.6 範圍說明**：F050 v2.1.1 引入 Migration M-A1（`m286-SeedBestCaseFieldAndOptions.ts`），在 `pooldata_field_option` 中 UPSERT `best_case` 欄位的 Y/N 兩個可選值。本節場景驗證 options seed 正確落地，並與 F050-test.md A 群組形成雙向引用。
>
> **cross-ref**：`docs/test-specs/features/F050-test.md` § 十四 A 群組：TS-F050-A02（Y/N 2 筆存在）、TS-F050-A03（UPSERT DO UPDATE 語意）、TS-F050-A04（`N` label 覆寫驗證）
>
> **大小寫警告**：`best_case` 選項值在 ob_pool_data 中為 ETL 落地的 varchar(1)，儲存為大寫 `'Y'` / `'N'`。所有 mock、seed、assertion 必須使用大寫，否則 Stage 1 `IN` 比對會 silent miss（見 `[[feedback_mock_real_system_contract]]`）。

---

### TS-F076-009：M-A1 seed 後 best_case 有 Y / N 兩筆可選值

- **關聯需求**：US-129 AC-1 / F076 AC-3 / TS-F050-A02（跨 Feature 引用）
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：M-A1（`m286-SeedBestCaseFieldAndOptions.ts`）up() 已執行
- **步驟**：
  1. 查詢 `SELECT option_value, option_label, is_active FROM pooldata_field_option WHERE column_name = 'best_case' ORDER BY option_value`
- **預期結果**：
  - 回傳 2 筆，option_value 分別為 `'N'`、`'Y'`（字母排序）
  - 兩筆均 `is_active = true`
  - `'Y'` 的 option_label 含「優質」（例：`'優質案件'`）
  - `'N'` 的 option_label 含「非優質」（例：`'非優質案件'`）；**不應為「一般案件」**（m240 舊標籤）

---

### TS-F076-010：M-A1 `'N'` 標籤覆寫驗證（UPSERT DO UPDATE — 非 DO NOTHING）

- **關聯需求**：US-129 AC-3 / F076 AC-3 v1.6 / TS-F050-A03、TS-F050-A04（跨 Feature 引用）
- **測試類型**：Boundary / Migration Integration（DB 驗證）
- **前置條件**：
  - `pooldata_field_option` 中已有一筆 `{ column_name: 'best_case', option_value: 'N', option_label: '一般案件' }`（模擬 m240 的舊標籤殘留）
  - 執行 M-A1 up()
- **步驟**：
  1. 查詢 `SELECT option_label FROM pooldata_field_option WHERE column_name = 'best_case' AND option_value = 'N'`
- **預期結果**：
  - `option_label` 為 `'非優質案件'`（或設計文件所定義的新標籤）
  - **不應為** `'一般案件'`（確認 DO UPDATE SET option_label = EXCLUDED.option_label 有效執行，非 DO NOTHING 跳過）
- **說明**：此場景是 F076 options seed 與 F075 whitelist seed 的關鍵差異——options 必須用 DO UPDATE 以確保標籤可覆寫；whitelist 用 DO NOTHING 因無 label 欄位需更新。

---

### TS-F076-011：best_case options seed 重複執行後仍為 2 筆（冪等）

- **關聯需求**：US-129 AC-5 / F076 AC-3 / TS-F050-A06（跨 Feature 引用）
- **測試類型**：Boundary / Migration Integration（DB 驗證）
- **前置條件**：M-A1 up() 已執行一次
- **步驟**：
  1. 再次執行 M-A1 up()（第二次）
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'best_case'`
- **預期結果**：count = 2（UPSERT 冪等，重複執行不新增重複記錄）

---

## 附錄：GAP 覆蓋對照

| GAP | 覆蓋場景 |
|---|---|
| E4 | TS-F076-001（case_status 4 筆 seed） |
| E5 | TS-F076-003（spec_tp 52 筆 dump，TBL_ID='12'） |
| E6 | TS-F076-002（caseyear / prod_kind seed 確認） |
| F050 v2.1.1 US-129 | TS-F076-009~011（best_case Y/N options seed） |
