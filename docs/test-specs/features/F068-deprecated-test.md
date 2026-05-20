---
type: test-design-feature
feature_id: F068
feature_name: 指派代碼查詢（已廢棄）
priority: P0-MVP
status: deprecated
related_spec: /docs/specs/features/F068-get-assignment-code.md
spec_version: "deprecated"
covers:
  - F068
  - US-124
date: 2026-05-20
last_updated: 2026-05-20
---

# F068：指派代碼查詢（已廢棄）— 測試設計

> **廢棄說明**：F068 `assignment-code/` 模組已於 F050 v2.1 重構中完整刪除（AD-E07-18 §18.2.11）。
> 本文件覆蓋 **廢棄驗證場景**，確認所有 F068 端點已回傳 404、模組目錄已刪除、錯誤碼已移除、Sidebar 已移除，
> 以及 F069 同 PR 部署閘門（§18.2.7）。
> 對應 GAP-LIST §I（I1~I3）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `US-124-M06-deprecate-f068-merge-field-base.md` + `architecture-spec.md §18.2.11` + `error-handling.md`（確認 3 個錯誤碼已刪除） |
| QA / Tester | 本文件 + `M06-regression-guards.md`（TC-GUARD-M06-F068-001/002） |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Integration（Supertest）、Regression Guard（靜態分析 / 檔案掃描）、Frontend Component（RTL） |
| 驗證重點 | 端點 404、module 目錄不存在、錯誤碼不存在於 codebase、Sidebar 不含 F068 入口、F069 同 PR 閘 |
| 前置條件 | F050 v2.1 重構 PR 合併後（含 M3~M5 migration 執行後環境） |

---

## 一、API 端點已廢棄（回傳 404）

### TS-F068-DEP-001：GET /api/v1/assignment-codes 回傳 404

- **關聯需求**：US-124 AC-1 / AD-E07-18 §18.2.11 / GAP I1
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：F050 v2.1 重構分支已合併；應用程式正常啟動
- **步驟**：
  1. 使用有效 JWT（任意角色）發送 `GET /api/v1/assignment-codes`
  2. 記錄回應狀態碼與 body
- **預期結果**：
  - HTTP 404
  - body 不含舊 F068 資料（無 assignment_code / code_list 欄位）
  - **不可** 回傳 403 或 500（代表路由仍存在）

---

### TS-F068-DEP-002：GET /api/v1/assignment-codes/:id 回傳 404

- **關聯需求**：US-124 AC-1 / GAP I1
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：同 TS-F068-DEP-001
- **步驟**：
  1. 使用有效 JWT 發送 `GET /api/v1/assignment-codes/some-valid-id`
  2. 記錄回應狀態碼
- **預期結果**：HTTP 404（路由不存在）

---

### TS-F068-DEP-003：POST /api/v1/assignment-codes 回傳 404

- **關聯需求**：US-124 AC-1 / GAP I1
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：同 TS-F068-DEP-001
- **步驟**：
  1. 使用 Director JWT 發送 `POST /api/v1/assignment-codes`，body 含任意 JSON
  2. 記錄回應狀態碼
- **預期結果**：HTTP 404（路由不存在，**不可** 回傳 201 或 400）

---

## 二、廢棄錯誤碼已移除（Regression Guard）

### TS-F068-DEP-004：error-handling 規格不再含 F068 廢棄錯誤碼

- **關聯需求**：US-124 AC-3 / GAP I2
- **測試類型**：Negative / Regression Guard（靜態掃描）
- **前置條件**：F050 v2.1 重構 PR 合併後
- **步驟**：
  1. 掃描 `src/` 下所有 `.ts` 檔，搜尋字串 `ASSIGNMENT_CODE_NOT_FOUND`
  2. 掃描 `src/` 下所有 `.ts` 檔，搜尋字串 `ASSIGNMENT_CODE_DUPLICATE`
  3. 掃描 `src/` 下所有 `.ts` 檔，搜尋字串 `ASSIGNMENT_CODE_INVALID_FORMAT`
- **預期結果**：
  - 三個搜尋均 **零比對**（廢棄錯誤碼已從 codebase 刪除）
  - 若任一搜尋有結果 → 測試失敗，需人工確認是否殘留

---

### TS-F068-DEP-005：`assignment-code/` 模組目錄已刪除

- **關聯需求**：US-124 AC-2 / AD-E07-18 §18.2.11 / GAP I1
- **測試類型**：Negative / Regression Guard（檔案系統驗證）
- **前置條件**：F050 v2.1 重構 PR 合併後
- **步驟**：
  1. 檢查 `src/` 目錄下是否存在 `assignment-code/` 子目錄（或其 controller/service/module/dto 等相關檔案）
  2. 檢查 `src/app.module.ts`（或主 module）是否仍 import `AssignmentCodeModule`
- **預期結果**：
  - `assignment-code/` 目錄 **不存在**
  - `app.module.ts` 中 **不含** `AssignmentCodeModule` import
  - 若目錄或 import 仍存在 → 測試失敗

---

## 三、F069 同 PR 部署閘門

### TS-F068-DEP-006：F069 prodKindName 改用 pooldata_field_option（M5 閘門驗證）

- **關聯需求**：US-124 AC-4 / AD-E07-18 §18.2.7 / GAP I3
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：
  - M5（DELETE ob_code_df TBL_ID IN ('PROD_KIND','SPEC_TP','CASE_STATUS')）已執行
  - F069 Service 已改為從 `pooldata_field_option` 讀取 prod_kind label
- **步驟**：
  1. 呼叫 F069 提供 prod_kind name 的端點（依實際路由）
  2. 驗證回應資料來源
- **預期結果**：
  - 回傳的 prod_kind label 資料來自 `pooldata_field_option`（而非 `ob_code_df`）
  - M5 刪除後 ob_code_df 已無 TBL_ID='PROD_KIND' 紀錄，F069 仍能正常回傳（**不因 ob_code_df 刪除而 500**）

---

### TS-F068-DEP-007：M5 執行後 ob_code_df TBL_ID='PROD_KIND'/'SPEC_TP'/'CASE_STATUS' 紀錄不存在

- **關聯需求**：AD-E07-18 §18.2.7 / §18.4（M5 高風險）/ GAP I3
- **測試類型**：Negative / Migration Integration（DB 驗證）
- **前置條件**：M5（`1711360000285-DeleteObCodeDf3TblIds.ts`）up() 已執行（tbl_id 採 m150 轉碼後英文常數）
- **步驟**：
  1. 查詢 `SELECT COUNT(*) FROM ob_code_df WHERE tbl_id IN ('PROD_KIND','SPEC_TP','CASE_STATUS')`
- **預期結果**：
  - count = 0（3 個 TBL_ID 的所有紀錄已刪除）
  - **注意**：M5 為不可逆操作，此測試在 staging 環境執行；prod 需備份確認後方執行

---

### TS-F068-DEP-008：M5 執行前若 F069 未切換來源，應阻止 M5 執行（部署閘）

- **關聯需求**：AD-E07-18 §18.2.7 / GAP I3
- **測試類型**：Negative / Deployment Gate（CI 前置檢查）
- **前置條件**：模擬 F069 Service 仍讀取 ob_code_df（未切換）
- **步驟**：
  1. 執行 CI deployment gate 腳本：掃描 F069 Service 是否仍含 `FROM ob_code_df WHERE tbl_id` 的查詢
  2. 若找到 → gate 失敗，阻止 M5 migration 執行
- **預期結果**：
  - Gate 腳本偵測到 F069 未切換 → 回傳 exit code 非 0
  - M5 migration 不可在 F069 未切換前執行
  - **注意**：此為 CI pipeline 部署防護設計，需 Phase 5 TDD Developer 確認實作方式

---

## 四、Sidebar 廢棄驗證

### TS-F068-DEP-009：前端 Sidebar 不含 F068「指派代碼」入口

- **關聯需求**：US-124 AC-5 / GAP I1
- **測試類型**：Negative / Frontend Component（RTL） / Regression Guard（靜態掃描）
- **前置條件**：F050 v2.1 重構 PR 合併後，前端 Sidebar 組件已更新
- **步驟**：
  1. 靜態掃描：搜尋 Sidebar 相關 `.tsx` 檔，確認不含 `assignment-code`、`指派代碼`、`AssignmentCode` 等關鍵字
  2. RTL 測試：渲染 `<Sidebar>` 組件（任意角色 JWT），查詢所有導覽連結文字
- **預期結果**：
  - 靜態掃描：零比對（Sidebar 程式碼已移除 F068 入口）
  - RTL 驗證：`screen.queryByText('指派代碼')` 回傳 `null`（DOM 中不存在此入口）
  - **不接受** CSS 隱藏（`display:none`）—— 必須確認 DOM 完全不渲染

---

## 附錄：GAP 覆蓋對照

| GAP | 覆蓋場景 |
|---|---|
| I1（F068 端點 + 模組刪除） | TS-F068-DEP-001、TS-F068-DEP-002、TS-F068-DEP-003、TS-F068-DEP-005、TS-F068-DEP-009 |
| I2（錯誤碼移除） | TS-F068-DEP-004 |
| I3（F069 同 PR 閘門） | TS-F068-DEP-006、TS-F068-DEP-007、TS-F068-DEP-008 |

## 附錄：AD-E07-18 §18.10 高風險邊界案例覆蓋

| §18.10 案例 | 覆蓋場景 |
|---|---|
| Risk-9（M5 刪除 ob_code_df 前未同步 F069） | TS-F068-DEP-006、TS-F068-DEP-007、TS-F068-DEP-008 |
