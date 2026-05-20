---
type: test-design-feature
feature_id: F050
feature_name: 新增名單定義（whitelist-driven v2.1.1）
priority: P0-MVP
related_spec: /docs/specs/features/F050-create-list-definition.md
spec_version: "2.1.1"
covers:
  - F050
  - US-106
  - US-121
  - US-123
  - US-125
  - US-126
  - US-127
  - US-128
  - US-129
date: 2026-05-20
last_updated: 2026-05-20
---

# F050：新增名單定義（whitelist-driven v2.1.1）— 測試設計

> **v2.1.1 測試設計補強（2026-05-20）**：在 v2.1 版 30 個場景基礎上，依 2026-05-20 業務複核決議 D1 / D2 / D4 / Q-A / Q-B 新增 4 個 stories（US-126 / US-127 / US-128 / US-129）的測試設計，共新增 **45 個測試場景**（A 群組 7 個 migration、B 群組 6 個 migration、C 群組 3 個 entity、D 群組 5 個 API、E 群組 6 個 DTO、F 群組 5 個 service、G 群組 5 個 Stage 1 composer、H 群組 8 個前端建立頁、I 群組 7 個前端編輯頁、J 群組 4 個 E2E、K 群組 2 個 regression guard）。核心新增：卡別改為動態下拉（US-126/127）、移除 prodBest 一級欄位（US-128）、best_case Y/N options seed（US-129）。

> **v2.1 測試設計範圍**：本文件覆蓋 F050 v2.1 whitelist-driven 重構全部 30 個測試場景，包含 condition_payload 必填驗證、columnName 白名單驗證、list_period_* 保留欄位防呆、backward-compat 衍生欄位、prod_kind 交集唯一性、caseyear/case_status 動態選項、INACTIVE 選項警示、LEGACY_LIST_NOT_COPYABLE，以及前端必填驗證 UI。對應 GAP-LIST §A1~A3、§B1~B3、§C1~C3、§G1~G4 的完整解除驗收。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer（v2.1.1 補強） | 本文件 + `F050-create-list-definition.md` v2.1.1 + `architecture-spec.md` §18.11（全 9 子節）+ `error-handling.md` §assignment-list-errors |
| TDD Developer（v2.1 原有場景） | 本文件 + `F050-create-list-definition.md` v2.1 + `error-handling.md` §assignment-list-errors + `architecture-spec.md` §18.4 §18.6 §18.8 |
| QA / Tester | 本文件 + `error-handling.md` §assignment-list-errors |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Unit（衍生規則 pure function）、後端 Integration（Service transaction + 唯一性 + Supertest API）、前端 Component（React Testing Library + MSW） |
| 關鍵依賴 | `pooldata_field_whitelist` 已 seed 6 筆（含 case_status）；`pooldata_field_option` 已 seed caseyear 8 筆、case_status 4 筆 |
| OQ 拍板引用 | OQ-TEST-001 已拍板（caseyear=99 wildcard 不加 year_cnt 條件）；OQ-TEST-002 已拍板（conditions=[] skip）— 本 spec 僅驗儲存側；月跑側見 IT-M01 |

---

## 一、condition_payload 必填與 DTO 驗證

### TS-F050-001：conditions 陣列為空時後端回 422

- **關聯需求**：F050 AC-10 / US-121 AC-1 / GAP B2
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：部長帳號已登入，`pooldata_field_whitelist` 已 seed 6 筆啟用
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，body 含 `conditionPayload: { conditions: [], logic: "AND" }` 及其他必填欄位
  2. 驗證回應
- **預期結果**：
  - HTTP 422
  - `error_code: VALIDATION_ERROR`（或 spec 定義之 422 錯誤碼）
  - 錯誤訊息含「篩選條件不得為空，請至少設定一個欄位」

---

### TS-F050-002：conditionPayload 完全缺失時後端回 422（DTO 必填驗證）

- **關聯需求**：F050 AC-7 v2.1 / GAP B2
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：同 TS-F050-001
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，body 不含 `conditionPayload` 欄位
  2. 驗證回應
- **預期結果**：HTTP 422；response 含必填欄位缺失錯誤訊息

---

## 二、columnName 白名單驗證

### TS-F050-003：columnName 不在白名單時回 422 CONDITION_COLUMN_NOT_IN_WHITELIST

- **關聯需求**：F050 AC-11 / US-121 AC-2 / GAP A3 / C2
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：白名單無 `INVALID_FIELD` 欄位（大寫，或任何不存在字串）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditionPayload.conditions = [{ columnName: "INVALID_FIELD", fieldType: "categorical", values: ["01"] }]`
  2. 驗證回應
- **預期結果**：
  - HTTP 422
  - `error_code: CONDITION_COLUMN_NOT_IN_WHITELIST`
  - response body 含 `columnName: "INVALID_FIELD"`

---

### TS-F050-004：columnName 對應 is_active=false 白名單欄位時回 422

- **關聯需求**：F050 AC-11 / US-121 TC-121-03
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：`pooldata_field_whitelist` 中 `settle_src` 欄位 `is_active = false`
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditionPayload.conditions = [{ columnName: "settle_src", fieldType: "categorical", values: ["Y"] }]`
  2. 驗證回應
- **預期結果**：
  - HTTP 422
  - `error_code: CONDITION_COLUMN_NOT_IN_WHITELIST`
  - response body 含 `columnName: "settle_src"`

---

## 三、list_period_* 保留欄位防呆

### TS-F050-005：list_period_start 入 conditions 時回 400 RESERVED_FIELD_IN_CONDITIONS

- **關聯需求**：F050 AC-12 / US-121 AC-5 / J8
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：部長帳號已登入
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditionPayload.conditions` 含 `{ columnName: "list_period_start", fieldType: "numeric", min: 1, max: 12 }`
  2. 驗證回應
- **預期結果**：
  - HTTP 400
  - `error_code: RESERVED_FIELD_IN_CONDITIONS`
  - 訊息說明 `list_period_start` 為保留欄位

---

### TS-F050-006：list_period_end / list_interval 同樣回 400（各一場景）

- **關聯需求**：F050 AC-12 / J8
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：同 TS-F050-005
- **步驟（list_period_end）**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 含 `{ columnName: "list_period_end", ... }`
  2. 驗證回應：HTTP 400，`RESERVED_FIELD_IN_CONDITIONS`
- **步驟（list_interval）**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 含 `{ columnName: "list_interval", ... }`
  2. 驗證回應：HTTP 400，`RESERVED_FIELD_IN_CONDITIONS`
- **預期結果**：兩個請求均回 HTTP 400，`RESERVED_FIELD_IN_CONDITIONS`

---

## 四、INACTIVE 選項警示（非阻擋）

### TS-F050-007：categorical 條件含 inactive option 值時 201 + warnings body 正確

- **關聯需求**：F050 AC-13 / US-121 AC-4
- **測試類型**：Positive with warning / Integration（Supertest）
- **前置條件**：`pooldata_field_option`：`prod_kind` 選項 `02` 已停用（`is_active = false`）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions = [{ columnName: "prod_kind", fieldType: "categorical", values: ["01", "02"] }]`（含已停用 `02`）
  2. 驗證回應
- **預期結果**：
  - HTTP 201 Created（成功寫入）
  - response body 含 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["prod_kind"] }]`
  - 名單確實被建立於 DB（list_no 存在）

---

## 五、backward-compat 衍生欄位

### TS-F050-008：5 個 backward-compat entity column 由後端衍生填入（prod_kind 衍生正確）

- **關聯需求**：F050 AC-15 / GAP C3 / §18.6
- **測試類型**：Positive / Integration（Supertest + DB 驗證）
- **前置條件**：白名單含 `prod_kind`（categorical）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions = [{ columnName: "prod_kind", fieldType: "categorical", values: ["01", "02"] }]`
  2. 取 response.listNo，查詢 DB `ob_list_definition` 該筆紀錄
  3. 驗證 `prod_kind` 欄位值
- **預期結果**：
  - HTTP 201
  - DB 中 `ob_list_definition.prod_kind` = `"01$$02"`（多值以 `$$` 分隔，對齊 §18.6 衍生規則）
  - request body 未包含 `prodKind` 欄位（前端不送出）

---

### TS-F050-009：case_status 條件未設定時 entity.case_status 衍生為空字串（NOT NULL 約束）

- **關聯需求**：§18.6 邊界 / §18.10 R3
- **測試類型**：Boundary / Integration（Supertest + DB 驗證）
- **前置條件**：白名單含 `prod_kind`，不含 `case_status` 在本次 conditions 中
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 只含 `prod_kind` 條件（無 `case_status`）
  2. 查詢 DB 驗證 `case_status` 欄位
- **預期結果**：
  - HTTP 201
  - `ob_list_definition.case_status` = `""` （空字串；NOT NULL 約束，不可為 null；§18.6）

---

### TS-F050-010：prod_kind 未設定條件時 entity.prod_kind 衍生為空字串

- **關聯需求**：§18.6 邊界 / §18.10 R1
- **測試類型**：Boundary / Integration（Supertest + DB 驗證）
- **前置條件**：白名單含 `spec_tp`
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 只含 `spec_tp` 條件（無 `prod_kind`）
  2. 查詢 DB 驗證 `prod_kind` 欄位
- **預期結果**：
  - `ob_list_definition.prod_kind` = `""` （空字串；NOT NULL；§18.6）

---

### TS-F050-011：caseyear 未設定條件時 entity.caseyear 衍生為 null

- **關聯需求**：§18.6
- **測試類型**：Boundary / Integration（DB 驗證）
- **前置條件**：`conditions` 不含 `caseyear`
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`（不含 caseyear 條件）
  2. 查詢 DB 驗證 `caseyear` 欄位
- **預期結果**：`ob_list_definition.caseyear` IS NULL（nullable 欄位，無條件時為 null）

---

### TS-F050-012：同一 columnName 重複出現兩次時回 422 VALIDATION_ERROR

- **關聯需求**：§18.6 防禦規則（多條件同 columnName 重複）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：白名單含 `prod_kind`（active）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions = [{ columnName: "prod_kind", ... }, { columnName: "prod_kind", ... }]`（重複兩筆）
  2. 驗證回應
- **預期結果**：HTTP 422，`VALIDATION_ERROR`，訊息說明同一欄位不得重複

---

## 六、prod_kind 交集唯一性（§18.8）

### TS-F050-013：prod_kind 交集語意衝突（['01','02'] vs ['02','03']）回 422 LIST_NO_DUPLICATE

- **關聯需求**：F050 AC-4 / §18.8 / §18.10 高風險
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：DB 已存在名單 `OB202605001`（active, stage=ready, card_type='A'），其 `prod_kind = "02$$03"`（代表 values = ['02','03']）；當前 project_workym 為 202605
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 含 `prod_kind values: ["01","02"]`，`card_type: "A"`
  2. 驗證回應
- **預期結果**：
  - HTTP 422
  - `error_code: LIST_NO_DUPLICATE`
  - response detail 含 `conflictListNo: "OB202605001"`、`intersectionValues: ["02"]`

---

### TS-F050-014：prod_kind 無交集（['03'] vs ['01','02']）通過唯一性檢查

- **關聯需求**：§18.8
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：DB 已存在名單，其 `prod_kind = "01$$02"`（values=['01','02']）；card_type='A'
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 含 `prod_kind values: ["03"]`，`card_type: "A"`
  2. 驗證回應
- **預期結果**：HTTP 201（成功建立，無衝突）

---

### TS-F050-015：新名單未設 prod_kind 條件時跳過唯一性檢查

- **關聯需求**：§18.8 規則第 4 點
- **測試類型**：Boundary / Integration（Supertest）
- **前置條件**：DB 已存在名單，其 `prod_kind = "01"`；card_type='A'
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 不含 `prod_kind`（values 空），`card_type: "A"`
  2. 驗證回應
- **預期結果**：HTTP 201（prod_kind 無條件 → 跳過唯一性檢查）

---

### TS-F050-016：唯一性比對對象為舊名單（IS NULL）時從 entity column 讀取

- **關聯需求**：§18.8 規則第 2 點
- **測試類型**：Boundary / Integration（Supertest）
- **前置條件**：DB 已存在舊名單（`condition_payload IS NULL`，`prod_kind = "02"` entity column，`card_type='A'`，status=active）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 含 `prod_kind values: ["02"]`，`card_type: "A"`
  2. 驗證回應
- **預期結果**：
  - HTTP 422，`LIST_NO_DUPLICATE`（舊名單 prod_kind `"02"` 與新名單 `["02"]` 有交集）
  - 即使舊名單 condition_payload IS NULL，唯一性檢查仍正確觸發

---

## 七、複製名單

### TS-F050-017：copyFromListNo 來源 condition_payload IS NOT NULL 時複製成功

- **關聯需求**：F050 AC-5
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：DB 已存在名單 `OB202604001`，status=active, stage=ready, `condition_payload` 有有效 JSON
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，body 含 `copyFromListNo: "OB202604001"`，`list_nm: "複製名單"` 等必填欄位
  2. 驗證回應及新建名單的 condition_payload 內容
- **預期結果**：
  - HTTP 201
  - 新建名單的 `condition_payload` 等於來源名單的 `condition_payload`
  - `list_no` 為新生成的流水號（非 `OB202604001`）

---

### TS-F050-018：copyFromListNo 來源 condition_payload IS NULL 時回 422 LEGACY_LIST_NOT_COPYABLE

- **關聯需求**：F050 AC-5 / 拍板 Q4
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：DB 已存在舊名單 `OB202504001`，`condition_payload IS NULL`
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，body 含 `copyFromListNo: "OB202504001"`
  2. 驗證回應
- **預期結果**：
  - HTTP 422
  - `error_code: LEGACY_LIST_NOT_COPYABLE`
  - response detail 含 `copyFromListNo: "OB202504001"`

---

### TS-F050-019：複製來源 dropdown 已過濾 condition_payload IS NULL 的名單（UI 場景）

- **關聯需求**：F050 AC-5 UI / GAP G1
- **測試類型**：Positive / Frontend Component（RTL + MSW）
- **前置條件**：API mock：`GET /api/v1/assignment/list-definitions?stage=ready&status=active` 回傳包含一筆有 `conditionPayload` 的名單 + 一筆 `conditionPayload: null` 的名單
- **步驟**：
  1. 渲染新增名單表單，點擊「複製名單」按鈕
  2. 查看來源選擇 dropdown 清單
- **預期結果**：
  - dropdown 只顯示 `conditionPayload IS NOT NULL` 的名單
  - `conditionPayload: null` 的舊名單不出現在 dropdown 中

---

## 八、月跑執行中 / 流水號上限 / LIST_NO 格式

### TS-F050-020：月跑執行中新增名單回 409 ASSIGNMENT_RUN_ALREADY_RUNNING

- **關聯需求**：F050 AC-6
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：`assignment_run` 存在 `status = 'running'` 的紀錄
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions` 含合法 body
  2. 驗證回應
- **預期結果**：HTTP 409，`error_code: ASSIGNMENT_RUN_ALREADY_RUNNING`

---

### TS-F050-021：同月 999 筆上限觸發回 422 LIST_NO_LIMIT_EXCEEDED

- **關聯需求**：F050 AC-3
- **測試類型**：Boundary / Integration（Supertest）
- **前置條件**：當月 `ob_list_definition` 已有 999 筆（含 active + inactive）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions` 嘗試新增第 1000 筆
  2. 驗證回應
- **預期結果**：HTTP 422，`error_code: LIST_NO_LIMIT_EXCEEDED`，訊息含當月 YYYYMM

---

### TS-F050-022：LIST_NO 格式自動產生符合 OB{YYYYMM}{NNN}

- **關聯需求**：F050 AC-2
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：當月 `ob_list_definition` 無任何紀錄（流水號從 001 開始）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions` 含合法 condition_payload
  2. 取 response.listNo
- **預期結果**：
  - `listNo` 符合正規表達式 `/^OB\d{6}\d{3}$/`（共 11 字元）
  - `listNo` 含當月 YYYYMM

---

## 九、稽核日誌

### TS-F050-023：儲存成功後 assignment_audit_log 寫入 CREATE 紀錄

- **關聯需求**：F050 AC-9
- **測試類型**：Positive / Integration（DB 驗證）
- **前置條件**：部長帳號已登入
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions` 成功（201）
  2. 查詢 DB `assignment_audit_log` 最新一筆
- **預期結果**：
  - `action = 'CREATE'`
  - `entity_type = 'ob_list_definition'`
  - `entity_id = <新建 list_no>`

---

## 十、stage 保護與月跑優先序

### TS-F050-024：月跑執行中優先於 stage guard（月跑 409 優先回應）

- **關聯需求**：F050 AC-14 / K1
- **測試類型**：Boundary / Integration（Supertest）
- **前置條件**：`assignment_run` 有 `status = 'running'`（月跑進行中）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions` 含合法 body
  2. 驗證回應（此場景驗月跑優先語意）
- **預期結果**：HTTP 409，`ASSIGNMENT_RUN_ALREADY_RUNNING`（月跑鎖優先於其他驗證）

---

## 十一、前端 UI 驗證

### TS-F050-025：前端必填驗證：conditions 為空時阻擋送出並顯示錯誤提示

- **關聯需求**：F050 AC-7 v2.1 / GAP G2
- **測試類型**：Frontend Component（RTL）
- **前置條件**：渲染 list-create-draft-page 元件；whitelist API mock 回傳 6 筆
- **步驟**：
  1. 填入 `list_nm`、`list_period_start`、`list_period_end`、`list_interval`，但不新增任何條件
  2. 點擊「儲存」按鈕
- **預期結果**：
  - 按鈕未送出 API 請求
  - 頁面顯示錯誤提示「請至少設定一個篩選條件」

---

### TS-F050-026：前端必填欄位不再包含 prod_kind / caseyear / specTp 等 5 個欄位

- **關聯需求**：F050 AC-7 v2.1 / GAP G1/G2
- **測試類型**：Frontend Component（RTL）
- **前置條件**：渲染 list-create-draft-page；whitelist API 及 options API mock 已設定
- **步驟**：
  1. 填入 `list_nm` 及至少一個合法條件（conditions），但不填 `prod_kind` / `caseyear` 等
  2. 點擊「儲存」
- **預期結果**：
  - 表單通過前端驗證，發送 POST 請求
  - POST body 不含 `prodKind`、`caseYear`、`specTp`、`caseStatus`、`settleSrc` 等欄位

---

## 十二、動態選項來源（caseyear / case_status）

### TS-F050-027：caseyear 選項動態載入 8 筆（來自 pooldata_field_option，不 hardcoded）

- **關聯需求**：F050 §5 / US-125 AC-1/AC-4 / GAP A4
- **測試類型**：Frontend Component（RTL + MSW）
- **前置條件**：MSW mock `GET /api/v1/pooldata-fields/caseyear/options?active=true` 回傳 8 筆（0~6 + 99）
- **步驟**：
  1. 渲染表單，使用者選取 `caseyear` 欄位作為篩選條件
  2. 查看 caseyear 多選元件的選項
- **預期結果**：
  - 顯示 8 個選項（0、1、2、3、4、5、6、99）
  - 不顯示 7 或 10 等額外值（非 hardcoded 11 筆）
  - 選項確實來自 API 呼叫（MSW 攔截驗證）

---

### TS-F050-028：case_status 選項動態載入 4 筆（來自 pooldata_field_option，不讀 ob_code_df）

- **關聯需求**：US-125 AC-2 / GAP A5
- **測試類型**：Frontend Component（RTL + MSW）
- **前置條件**：MSW mock `GET /api/v1/pooldata-fields/case_status/options?active=true` 回傳 4 筆（01/02/03/04）；無任何呼叫 `/assignment/codes` 的 mock
- **步驟**：
  1. 渲染表單，使用者選取 `case_status` 欄位
  2. 查看 case_status 多選元件選項
- **預期結果**：
  - 顯示 4 個選項（01 期中、02 中結、03 滿期（含當月滿期）、04 滿期）
  - 無任何 Network 請求發往 `/api/v1/assignment/codes`（F068 已廢除）

---

## 十三、condition_payload schema 完整性

### TS-F050-029：condition_payload JSONB schema 各 fieldType 欄位齊全驗證

- **關聯需求**：F050 §5.4
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：白名單含 `prod_kind`（categorical）、`month_cnt`（numeric，如已加入）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 同時含：
     - categorical：`{ columnName: "prod_kind", fieldType: "categorical", values: ["01"] }`
     - numeric：`{ columnName: "month_cnt", fieldType: "numeric", min: 1, max: 6 }`
  2. 驗證回應及 DB 寫入
- **預期結果**：
  - HTTP 201
  - DB 中 `condition_payload` JSONB 含兩個 condition，fieldType 各自正確

---

### TS-F050-030：date fieldType 條件（birth_date demo）驗證 dateStart/dateEnd 欄位存在

- **關聯需求**：Phase 3b UI-Q5 / §18.5 date 型別
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：白名單含 `birth_date`（date 型別）
- **步驟**：
  1. POST `/api/v1/assignment/list-definitions`，`conditions` 含 `{ columnName: "birth_date", fieldType: "date", dateStart: "2000-01-01", dateEnd: "2005-12-31" }`
  2. 驗證回應及 DB 寫入
- **預期結果**：
  - HTTP 201
  - DB `condition_payload` 中 `birth_date` condition 含正確 `dateStart`、`dateEnd` 欄位

---

## 附錄 A：GAP 覆蓋對照（v2.1 原有）

| GAP | 覆蓋場景 |
|---|---|
| A1 | TS-F050-001/002/025/026 |
| A2 | TS-F050-029/030、MT-M1-001（migration test 文件） |
| A3 | TS-F050-003/004 |
| A4 | TS-F050-027 |
| A5 | TS-F050-028 |
| A6 | IT-M01-001/002/003（integration test 文件） |
| B2 | TS-F050-001/002 |
| B3 | TS-F051-001（F051 test 文件） |
| C2 | TS-F050-003/004 |
| C3 | TS-F050-008~012 |
| G1 | TS-F050-026 |
| G2 | TS-F050-025 |
| G3 | TS-F050-026 |
| G4 | TS-F050-029/030 |

---

## 十四、v2.1.1 補強測試設計（US-126 / US-127 / US-128 / US-129）

> **架構依據**：`architecture-spec.md` §18.11（全 9 子節）、F050 v2.1.1 AC-16、BR-12、§18.11.5~§18.11.7  
> **關鍵 memory 引用**：[[feedback_mock_real_system_contract]]（best_case 值大寫 `'Y'`/`'N'`，不可 mock 為小寫）；[[feedback_typeorm_null_pk_delete]]（down migration 不用 `repo.delete({field: null})`）；[[feedback_grep_negative_lookahead]]（regression guard 用 fs + regex，不可僅靠 Grep）

### A 群組：Migration M-A1 Tests

> **對應規格**：§18.11.3、US-129 AC-1/AC-3/AC-4  
> **測試類型**：Mock-based unit（對齊 m284 pattern）+ functional SQLite in-memory  
> **測試檔案（新建）**：`apps/api/src/database/migrations/__tests__/m286-seed-best-case-field-and-options.spec.ts`  
> **對應 F075-test.md**：TS-F075-v16-001~003（cross-ref，補 v1.6 seed 驗證）

#### TS-F050-A01：M-A1 up() PG — whitelist UPSERT 先於 options INSERT（FK 安全序）

- **關聯需求**：US-129 AC-4；§18.11.3 Step 1
- **測試類型**：Positive / Migration Unit（mock queryRunner）
- **前置條件**：mock `queryRunner.query`
- **步驟**：
  1. 執行 `migration.up(queryRunner)`
  2. 擷取 queryRunner.query 所有呼叫的 SQL 字串
  3. 找出 `pooldata_field_whitelist` INSERT 的索引 vs `pooldata_field_option` INSERT 的索引
- **預期結果**：whitelist INSERT 索引 < options INSERT 索引（whitelist 必先於 option，FK 安全）

---

#### TS-F050-A02：M-A1 up() PG — whitelist UPSERT 含 best_case / 優質案件 / categorical / ON CONFLICT DO UPDATE

- **關聯需求**：US-129 AC-4；F075 v1.6 AC-1；§18.11.3 Step 1
- **測試類型**：Positive / Migration Unit（mock queryRunner）
- **步驟**：
  1. 執行 `migration.up(queryRunner)`
  2. 驗證 whitelist INSERT SQL 內容
- **預期結果**：
  - SQL 含 `'best_case'`、`'優質案件'`、`'categorical'`
  - 含 `ON CONFLICT (column_name) DO UPDATE SET is_active=true`
  - 含 `display_name=EXCLUDED.display_name`

---

#### TS-F050-A03：M-A1 up() PG — Y/N 兩筆 options UPSERT（**含 DO UPDATE SET option_label**，非 DO NOTHING）

- **關聯需求**：US-129 AC-1；§18.11.3 Step 2；§18.11.2 決策 18.11.2
- **測試類型**：Positive / Migration Unit（mock queryRunner）
- **重點說明**：M-A1 採 `DO UPDATE SET option_label=EXCLUDED.option_label`（UPSERT），不同於 m284 的 `DO NOTHING`；這是覆寫 m240 舊 label 的關鍵設計
- **步驟**：
  1. 執行 `migration.up(queryRunner)`
  2. 過濾 `pooldata_field_option` INSERT 的 SQL（共 2 條）
  3. 驗證 Y 和 N 的 option INSERT SQL
- **預期結果**：
  - INSERT SQL 恰好 2 條（Y 和 N）
  - Y option：含 `'Y'`、`'優質案件'`、`TRUE`
  - N option：含 `'N'`、`'非優質案件'`、`TRUE`
  - 兩條 SQL 均含 `ON CONFLICT (column_name, option_value) DO UPDATE SET option_label=EXCLUDED.option_label`（非 `DO NOTHING`）

---

#### TS-F050-A04：**UPSERT 覆寫驗證（最關鍵）** — 模擬 m240 已存 `N='一般案件'`，執行 M-A1 後 N label 變為「非優質案件」

- **關聯需求**：US-129 AC-3；§18.11.9 R8；§18.11.2 決策 18.11.2
- **測試類型**：Boundary / Migration Functional（SQLite in-memory）
- **重點說明**：驗證 UPSERT 真正覆寫了 m240 遺留的舊 label，是 M-A1 最核心的業務正確性驗證
- **前置條件**：
  - 建立 SQLite in-memory DB，含 `pooldata_field_whitelist` / `pooldata_field_option` 表
  - **手動插入** `(column_name='best_case', option_value='N', option_label='一般案件', is_active=1)` 模擬 m240 狀態
- **步驟**：
  1. 執行 `migration.up(qr)`
  2. 查詢 `SELECT option_label FROM pooldata_field_option WHERE column_name='best_case' AND option_value='N'`
- **預期結果**：`option_label` = `'非優質案件'`（不是 `'一般案件'`；UPSERT 覆寫成功）

---

#### TS-F050-A05：M-A1 idempotent — 連續執行 2 次後 options=2 / whitelist=1（不重複）

- **關聯需求**：US-129 AC-3；§18.11.4 Idempotency
- **測試類型**：Boundary / Migration Functional（SQLite in-memory）
- **步驟**：
  1. 建立空 SQLite DB（含兩個 table）
  2. 執行 `migration.up(qr1)`，再執行 `migration.up(qr2)`（重複一次）
  3. 查詢 COUNT
- **預期結果**：
  - `COUNT(option WHERE column_name='best_case')` = 2
  - `COUNT(whitelist WHERE column_name='best_case')` = 1（無重複）

---

#### TS-F050-A06：M-A1 up() SQLite — 使用 `INSERT OR REPLACE INTO`（非 `ON CONFLICT`）

- **關聯需求**：US-129 AC-3 SQLite path；§18.11.3 Idempotency
- **測試類型**：Positive / Migration Unit（mock queryRunner + DB_TYPE=sqlite）
- **步驟**：
  1. 設定 `process.env.DB_TYPE = 'sqlite'`
  2. 執行 `migration.up(queryRunner)`
  3. 驗證所有 INSERT SQL
- **預期結果**：所有 INSERT 含 `INSERT OR REPLACE INTO`；不含 `ON CONFLICT`

---

#### TS-F050-A07：M-A1 down() — 僅刪 best_case Y/N options，不刪 whitelist，不影響其他欄位

- **關聯需求**：§18.11.3 down() 邏輯重點；US-129 技術備註
- **測試類型**：Negative / Migration Unit（mock queryRunner）
- **步驟**：
  1. 執行 `migration.down(queryRunner)`
  2. 驗證 DELETE SQL 內容
- **預期結果**：
  - 存在 DELETE FROM `pooldata_field_option` WHERE `column_name='best_case' AND option_value IN ('Y','N')`
  - **不存在**針對 `pooldata_field_whitelist` 的 DELETE（`best_case` 不屬本 migration 新建）
  - **不存在**針對 `prod_kind`、`case_status`、`caseyear` 等其他欄位的 DELETE

---

### B 群組：Migration M-A2 Tests

> **對應規格**：§18.11.4、US-128 AC-3、BR-12 §(2)  
> **測試類型**：Mock-based unit + functional SQLite in-memory  
> **測試檔案（新建）**：`apps/api/src/database/migrations/__tests__/m287-deprecate-prod-best-column.spec.ts`  
> **注意**：SQLite 表重建模式全欄位清單由 tdd-implementation 讀取 `ob-list-definition.entity.ts` 確認（§18.11.9 R9）；本 spec 不預設精確欄位數，以避免 spec 與 entity drift

#### TS-F050-B01：M-A2 up() PG Step 1 — UPDATE SET NULL WHERE IS NOT NULL

- **關聯需求**：US-128 AC-3；§18.11.4 up() Step 1
- **測試類型**：Positive / Migration Unit（mock queryRunner）
- **步驟**：執行 `migration.up(queryRunner)`；驗證 SQL 呼叫
- **預期結果**：queryRunner.query 含 `UPDATE ob_list_definition SET prod_best = NULL WHERE prod_best IS NOT NULL`

---

#### TS-F050-B02：M-A2 up() PG Step 2 — ALTER COLUMN DROP NOT NULL，且 UPDATE 先於 ALTER

- **關聯需求**：§18.11.4 up() Step 2；§18.11.2 決策 18.11.3
- **測試類型**：Positive / Migration Unit（mock queryRunner）
- **步驟**：執行 `migration.up(queryRunner)`；比較 UPDATE 與 ALTER 的呼叫順序
- **預期結果**：
  - 存在 `ALTER TABLE ob_list_definition ALTER COLUMN prod_best DROP NOT NULL`
  - UPDATE SQL 的索引 < ALTER SQL 的索引（Step 1 必先於 Step 2）

---

#### TS-F050-B03：M-A2 up() SQLite — 表重建模式含全欄位，prod_best 定義不含 NOT NULL；含 condition_payload / stage / cr_enabled

- **關聯需求**：§18.11.4 follow-up Q2；§18.11.9 R9
- **測試類型**：Positive / Migration Unit（mock queryRunner + DB_TYPE=sqlite）
- **步驟**：
  1. 設定 `process.env.DB_TYPE = 'sqlite'`
  2. 執行 `migration.up(queryRunner)`
  3. 驗證 SQL 序列
- **預期結果**：
  - 含 `CREATE TABLE` SQL；新 CREATE TABLE 中 `prod_best` 欄位不含 `NOT NULL` 約束
  - CREATE TABLE SQL 含 `condition_payload`、`stage`、`cr_enabled` 關鍵欄位（R9 風險緩解）
  - 含 `INSERT INTO ... SELECT ... FROM`（資料保留）
  - 含 `DROP TABLE`（舊表清除）

---

#### TS-F050-B04：**functional SQLite — 執行前 prod_best NOT NULL，執行後 nullable；既有非空資料全部變 NULL**

- **關聯需求**：US-128 AC-3；§18.11.4 up() Step 1+2
- **測試類型**：Positive / Migration Functional（SQLite in-memory）
- **前置條件**：
  - 建立 SQLite in-memory DB，`ob_list_definition` 含 `prod_best TEXT NOT NULL DEFAULT ''`
  - 插入 2 筆有非空 prod_best 的紀錄（如 `'Y'`、`'N'`）
- **步驟**：
  1. 執行 `migration.up(qr)`
  2. 查詢兩筆紀錄的 prod_best 值
  3. 嘗試 INSERT 新紀錄不提供 prod_best
- **預期結果**：
  - 查詢結果：兩筆 `prod_best` 均為 `null`
  - INSERT 新紀錄無 prod_best → 成功（nullable schema）

---

#### TS-F050-B05：M-A2 idempotent — 連續執行 2 次無 error，資料無差異（Step 1 WHERE IS NOT NULL 幂等）

- **關聯需求**：§18.11.4 Idempotency
- **測試類型**：Boundary / Migration Functional（SQLite in-memory）
- **步驟**：執行 `migration.up(qr1)` → 再執行 `migration.up(qr2)` → 驗證不拋例外
- **預期結果**：兩次執行均無 error；prod_best 全部為 null

---

#### TS-F050-B06：M-A2 down() — UPDATE NULL → 補空字串，ALTER SET NOT NULL，UPDATE 先於 ALTER

- **關聯需求**：§18.11.4 down() 邏輯重點
- **測試類型**：Positive / Migration Unit（mock queryRunner）
- **步驟**：執行 `migration.down(queryRunner)`；驗證 SQL 序列
- **預期結果**：
  - 含 `UPDATE ob_list_definition SET prod_best = '' WHERE prod_best IS NULL`（先）
  - 含 `ALTER TABLE ob_list_definition ALTER COLUMN prod_best SET NOT NULL`（後）
  - UPDATE 索引 < ALTER 索引

---

### C 群組：Entity Tests

> **對應規格**：§18.11.4 Entity 修改指引、F050 AC-16  
> **測試檔案（修改現有）**：`apps/api/src/modules/assignment-list/__tests__/ob-list-definition-entity.spec.ts`  
> **修改方式**：在現有測試末尾追加 describe block，不修改現有 test

#### TS-F050-C01：prod_best 欄位允許寫入 null（M-A2 後 nullable schema）

- **關聯需求**：US-128 AC-3；§18.11.4 Entity 修改指引
- **測試類型**：Positive / Entity Integration（SQLite in-memory + synchronize:true）
- **前置條件**：entity `prod_best` 已改為 `string | null`、`nullable: true`
- **步驟**：`repo.save({ ...minimalListData, prod_best: null })`
- **預期結果**：不拋例外；回存後 `entity.prod_best === null`

---

#### TS-F050-C02：card_type VARCHAR(5) 上限仍生效（regression — 不接受超過 5 字元）

- **關聯需求**：F050 AC-16；US-126 AC-3（後端 `@MaxLength(5)` 保留）
- **測試類型**：Negative / DTO Boundary（在 DTO 層驗證）
- **備註**：在 DTO test（E 群組 E-5/E-6）覆蓋；entity 層視 DB driver 行為而定；本場景記錄為 DTO 層測試引用點

---

#### TS-F050-C03：ob_card_type entity regression — 欄位結構不受 v2.1.1 改動影響

- **關聯需求**：I（regression 防護）
- **測試類型**：Positive / Entity Regression（static analysis）
- **步驟**：讀取 `ob-card-type.entity.ts` 的 `@Column` 宣告
- **預期結果**：`card_type`（PK）、`card_name`、`prod_kind`、`status` 四欄存在；無新增/刪除欄位

---

### D 群組：API Endpoint Tests

> **對應規格**：§18.11.5、F050 AC-16、US-126/127  
> **測試檔案（修改現有）**：`apps/api/src/modules/assignment-scoring/__tests__/card-type-list.service.spec.ts`  
> **修改方式**：在現有 describe block 末尾追加，不修改現有 test

#### TS-F050-D01：GET /card-types（無 query）→ 預設 status='active'，repository 以 `{ status: 'active' }` 過濾

- **關聯需求**：§18.11.5 Query param contract 預設值；F050 AC-16
- **測試類型**：Positive / Service Unit
- **步驟**：`service.listCardTypes({})` 或不傳 status
- **預期結果**：`cardTypeRepo.find` 被以 `{ where: { status: 'active' } }` 呼叫

---

#### TS-F050-D02：GET /card-types?status=all → repository 以 `{ where: {} }` 查詢（無 status 過濾）

- **關聯需求**：§18.11.5；US-127 AC-2（編輯模式需含 inactive）；§18.11.4 決策 18.11.4
- **測試類型**：Positive / Service Unit
- **步驟**：`service.listCardTypes({ status: 'all' })`
- **預期結果**：`cardTypeRepo.find` 被以 `{ where: {} }` 呼叫（無 status filter）

---

#### TS-F050-D03：GET /card-types?status=active → 與無 query 行為一致

- **關聯需求**：§18.11.5
- **測試類型**：Positive / Service Unit
- **步驟**：`service.listCardTypes({ status: 'active' })`
- **預期結果**：`cardTypeRepo.find` 被以 `{ where: { status: 'active' } }` 呼叫

---

#### TS-F050-D04：Response shape — 含 card_type / card_name / prod_kind / status 四欄；依 card_type 升冪

- **關聯需求**：F050 AC-16 選項顯示格式
- **測試類型**：Positive / Service Unit
- **前置條件**：mock 回 `[{ card_type: 'S5', ..., status: 'active' }, { card_type: 'E', ..., status: 'active' }]`（故意逆序）
- **步驟**：`service.listCardTypes({ status: 'active' })`
- **預期結果**：回傳陣列第一筆 `cardType === 'E'`（升冪）；每筆含 `cardName`、`prodKind`、`status` 欄位

---

#### TS-F050-D05：邊界 — 表內無 active 卡別 → 回 `{ cardTypes: [] }`，不拋 500

- **關聯需求**：F050 AC-16 fallback
- **測試類型**：Boundary / Service Unit
- **步驟**：`cardTypeRepo.find` mock 回 `[]`；`service.listCardTypes({ status: 'active' })`
- **預期結果**：回傳 `{ cardTypes: [] }`；不拋例外

---

### E 群組：DTO Tests

> **對應規格**：§18.11.6 方案 Y、F050 AC-16、US-126 AC-3  
> **測試檔案（修改現有）**：`apps/api/src/modules/assignment-list/__tests__/list-dto-validation.spec.ts`  
> **修改方式**：在現有 describe block 末尾追加 describe `v2.1.1 補強 (prodBest backward-compat + cardType MaxLength)`，不修改現有 test

#### TS-F050-E01：CreateListDto 接受 `prodBest: null`（方案 Y backward-compat，不 422）

- **關聯需求**：§18.11.6 方案 Y；US-128 技術備註
- **測試類型**：Positive / DTO Unit
- **步驟**：`plainToInstance(CreateListDto, baseCreate({ prodBest: null }))`；`validate(dto)`
- **預期結果**：errors 不含 `prodBest` 相關約束錯誤

---

#### TS-F050-E02：CreateListDto 接受 `prodBest: ''`（空字串，backward-compat）

- **關聯需求**：§18.11.6 方案 Y
- **步驟**：`baseCreate({ prodBest: '' })`；`validate(dto)`
- **預期結果**：無 prodBest validation error

---

#### TS-F050-E03：CreateListDto 接受 `prodBest: undefined`（欄位不傳，方案 Y @IsOptional）

- **關聯需求**：§18.11.6 方案 Y
- **步驟**：`baseCreate()` 不帶 prodBest 鍵
- **預期結果**：無 prodBest validation error

---

#### TS-F050-E04：UpdateListDto 同樣接受 prodBest null / undefined（backward-compat）

- **關聯需求**：§18.11.6 方案 Y
- **步驟**：`baseUpdate({ prodBest: null })`；`baseUpdate({ prodBest: undefined })`；各別 validate
- **預期結果**：均不產生 prodBest validation error

---

#### TS-F050-E05：CreateListDto `cardType` `@MaxLength(5)` — 6 字元拒絕（422）

- **關聯需求**：F050 AC-16；US-126 AC-3（後端 @MaxLength(5) 對齊 VARCHAR(5)）
- **測試類型**：Negative / DTO Unit（Boundary）
- **步驟**：`baseCreate({ cardType: 'ABCDEF' })`（6 字元）；`validate(dto)`
- **預期結果**：errors 中存在 `cardType` maxLength 約束錯誤

---

#### TS-F050-E06：CreateListDto `cardType` 5 字元通過驗證（邊界正向）

- **關聯需求**：F050 AC-16
- **測試類型**：Positive / DTO Unit（Boundary）
- **步驟**：`baseCreate({ cardType: 'ABCDE' })`（恰好 5 字元）；`validate(dto)`
- **預期結果**：無 cardType validation error

---

### F 群組：Service Tests

> **對應規格**：§18.11.6 service 改動指引（L378 / L540）、US-128 AC-5  
> **測試檔案（修改現有）**：`apps/api/src/modules/assignment-list/__tests__/assignment-list.service.spec.ts`  
> **修改方式**：在現有 describe block 末尾追加 describe `v2.1.1 prodBest ignore 行為`，不修改現有 test

#### TS-F050-F01：createList — DTO 含 `prodBest: null`，entity 寫入後 `prod_best === null`（非空字串 `''`）

- **關聯需求**：§18.11.6 service L378；US-128 AC-5
- **測試類型**：Positive / Service Integration（functional SQLite in-memory）
- **前置條件**：entity `prod_best` 已 nullable；DB 中 prod_best 欄位已允許 NULL
- **步驟**：`service.createList(baseDto({ prodBest: null }), actor)` → 讀回 DB 記錄
- **預期結果**：`record.prod_best === null`（不是 `''`）

---

#### TS-F050-F02：createList — DTO 不含 `prodBest` 欄位，entity `prod_best` 仍為 null

- **關聯需求**：§18.11.6
- **步驟**：`service.createList(baseDto() /* 不帶 prodBest */, actor)` → 讀回記錄
- **預期結果**：`record.prod_best === null`

---

#### TS-F050-F03：updateList — DTO 含 `prodBest: 'Y'`（舊客戶端），entity `prod_best` 不被更新（維持 null）

- **關聯需求**：§18.11.6 service L540 整行刪除；US-128 AC-5
- **測試類型**：Positive / Service Integration
- **前置條件**：DB 中名單 `prod_best=null`
- **步驟**：`service.updateList(listNo, { prodBest: 'Y', ...其他合法欄位 }, actor)` → 讀回記錄
- **預期結果**：`record.prod_best === null`（非 `'Y'`；service 不再讀 DTO.prodBest）

---

#### TS-F050-F04：GET list-by-id — prod_best=null 不拋例外，response prodBest 為 null

- **關聯需求**：§18.11.8 Backward-compat；E 群組 regression
- **步驟**：DB 中名單 `prod_best=null`；`service.getListByNo(listNo)`
- **預期結果**：不拋例外；response 中 `prodBest === null`（不是 `''`）

---

#### TS-F050-F05：GET list-by-month — 多筆名單 prod_best=null 時不拋例外

- **關聯需求**：§18.11.8 Backward-compat；E 群組 regression
- **步驟**：DB 中多筆名單 `prod_best=null`；`service.getListsByMonth(ym)`
- **預期結果**：回傳陣列；不拋例外

---

### G 群組：Stage 1 Composer Tests

> **對應規格**：§18.11.7、F050 BR-12 §(3)、BR-7  
> **測試檔案（修改現有）**：`apps/api/src/modules/assignment/stage1/__tests__/stage1-query-composer.spec.ts`  
> **修改方式**：在現有波 5（UCQ-025~028）之後追加 describe `波 6 — best_case categorical`，不修改現有 test  
> **關鍵記憶**：best_case 欄位在 `ob_pool_data` 為 `varchar(1)` 大寫值（`'Y'`/`'N'`），mock 必須用大寫，否則 stage 1 比對 case-sensitive silent miss（[[feedback_mock_real_system_contract]]）

#### TS-F050-G01：best_case 單值 `['Y']` → `"best_case" IN (:...cat0)`；params `{ cat0: ['Y'] }`

- **關聯需求**：F050 BR-12 §(3)；§18.11.7；US-129 AC-5
- **測試類型**：Positive / Unit（pure function）
- **Input**：`makeList({ condition_payload: { logic: 'AND', conditions: [{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }] } })`
- **注意**：`values: ['Y']`，大寫，不可用 `'y'`
- **預期結果**：`result.skipReason` 為 null；`result.where` 含 `"best_case"`；含 `IN (:...` pattern；`Object.values(result.params)[0]` 為 `['Y']`

---

#### TS-F050-G02：best_case 雙值 `['Y', 'N']` → IN 子句含兩個值

- **關聯需求**：BR-7（categorical IN 語意，多值 OR）
- **Input**：`values: ['Y', 'N']`（均大寫）
- **預期結果**：params 中 array 值為 `['Y', 'N']`；where 子句為單一 IN fragment

---

#### TS-F050-G03：best_case 與 prod_kind 並存 → 兩個 fragment AND 連接，params 不衝突

- **關聯需求**：BR-7；§18.11.7
- **Input**：`conditions: [{ columnName: 'prod_kind', values: ['01'] }, { columnName: 'best_case', values: ['Y'] }]`
- **預期結果**：where 同時含 `"prod_kind"` 和 `"best_case"`；以 `AND` 連接；params key 互不衝突

---

#### TS-F050-G04：best_case 不觸發 caseyear wildcard 特殊邏輯（regression）

- **關聯需求**：§18.11.2 決策 18.11.6；§18.2.8（best_case 無 wildcard 語意）
- **Input**：`conditions: [{ columnName: 'best_case', values: ['99'] }]`（故意用 caseyear 的 wildcard 值）
- **預期結果**：`result.skipReason` 為 null（不被 skip）；where 含 `"best_case" IN`（不走 caseyear 的 skip 路徑）；params 含 `['99']`

---

#### TS-F050-G05：columnName allowlist guard — `'best_case'` 通過正則 `/^[a-z][a-z0-9_]{0,63}$/`

- **關聯需求**：F050 BR-11；§18.11.7（路徑 A 通用路徑不拒絕 best_case）
- **Input**：`conditions: [{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }]`
- **預期結果**：`buildStage1WhereConditions(list)` 不拋例外；`result.skipReason` 為 null

---

### H 群組：Frontend Tests — list-create-draft-page

> **對應規格**：US-126 AC-1~5；US-128 AC-1；US-129 AC-5；F050 AC-16  
> **測試檔案（修改現有）**：`apps/web/src/pages/assignment/__tests__/list-create-draft-page.test.tsx`  
> **修改方式**：（1）更新 `fieldsFixture` 加入 `best_case`；（2）新增 `cardTypesFixture` mock 及對應 import；（3）末尾追加 describe `v2.1.1 補強 (US-126/US-128/US-129)`  
> **Mock import 路徑（Q1 已解）**：`import * as cardTypeApi from '@/api/card-type'`  
> **prototype ground truth**：`prototypes/27a-list-create-draft.html`（[[feedback_tdd_strict_prototype]]）

**cardTypesFixture（5 筆 active，依 card_type 升冪）**：
```
{ cardTypes: [
  { cardType: 'E',  cardName: '期中',     prodKind: '01', status: 'active' },
  { cardType: 'M',  cardName: '滿期',     prodKind: '03', status: 'active' },
  { cardType: 'OB', cardName: '一般催收', prodKind: '01', status: 'active' },
  { cardType: 'S5', cardName: '主力催收', prodKind: '02', status: 'active' },
  { cardType: 'S6', cardName: '重點戶',   prodKind: '02', status: 'active' },
] }
```

**best_case options fixture**：
```
{ options: [
  { columnName: 'best_case', optionValue: 'Y', optionLabel: '優質案件',   isActive: true },
  { columnName: 'best_case', optionValue: 'N', optionLabel: '非優質案件', isActive: true },
] }
```

#### TS-F050-H01：移除 prodBest input — `queryByTestId('input-prodBest')` 為 null（DOM 完全不存在）

- **關聯需求**：US-128 AC-1；F050 §5.2 移除欄位
- **測試類型**：Positive / Frontend Component（RTL）
- **步驟**：renderPage（預設 mock）；`await waitFor(...)`
- **預期結果**：`screen.queryByTestId('input-prodBest')` 為 `null`（DOM 中不存在，非 CSS hidden）

---

#### TS-F050-H02：卡別 `<select>` 以 testid `select-cardType` 渲染，tagName 為 SELECT

- **關聯需求**：US-126 AC-1；F050 AC-16；prototype 27a `data-testid="select-cardType"`
- **前置條件**：`cardTypes API` mock 回 5 筆 active
- **步驟**：`await waitFor(() => screen.getByTestId('select-cardType'))`
- **預期結果**：element 存在；tagName 為 `SELECT`

---

#### TS-F050-H03：卡別下拉首選項為「— 未選擇 —」且預設選中（空值）

- **關聯需求**：US-126 AC-2；F050 AC-16
- **步驟**：`await waitFor(...)`；取 select element 的第一個 option
- **預期結果**：第一個 option text 含「未選擇」；value 為空字串或 null；select 預設選中此項

---

#### TS-F050-H04：卡別下拉 options 來自 mock cardTypes API，共 6 個（1 首選 + 5 active），依升冪

- **關聯需求**：US-126 AC-1；F050 AC-16 顯示格式
- **步驟**：`await waitFor(...)`；取 select 所有 options
- **預期結果**：
  - 共 6 個 option（1 首選 + 5）
  - Option text 格式：`'S5 — 主力催收（02）'` 或含 `prod_kind` 的格式（以 prototype 27a L519 為準）
  - 依 card_type 升冪：E, M, OB, S5, S6

---

#### TS-F050-H05：選取 S5 後送出 DTO — `cardType === 'S5'`（純代碼字串，非顯示文字）

- **關聯需求**：US-126 AC-5；US-126 AC-2 DTO 送出值
- **前置條件**：`mockedCreateList.mockResolvedValue({ listNo: 'OB202605099' })`；填完必填欄位
- **步驟**：選取 S5 option；點「儲存草稿」
- **預期結果**：`mockedCreateList` 被呼叫時 request body `cardType === 'S5'`（純 card_type 字串）

---

#### TS-F050-H06：API 載入失敗時顯示 fallback 提示「卡別資料載入失敗，請重新整理頁面」；不阻擋儲存

- **關聯需求**：US-126 AC-4；F050 AC-16
- **前置條件**：`cardTypes API` mock 回 `Promise.reject(new Error('Network Error'))`
- **步驟**：renderPage；`await waitFor(...)`；驗證 fallback
- **預期結果**：`screen.getByText('卡別資料載入失敗，請重新整理頁面')` 存在；填完其他必填欄位後仍可送出（cardType 欄位 fallback 不阻擋儲存）

---

#### TS-F050-H07：篩選條件 dropdown 含 best_case「優質案件」選項

- **關聯需求**：US-129 AC-5；US-128 AC-4
- **前置條件**：`fieldsFixture` 含 `best_case`（displayName='優質案件'，fieldType='categorical'）
- **步驟**：點「新增條件」按鈕；`await waitFor(() => screen.getByTestId('add-field-dropdown'))`
- **預期結果**：dropdown 中可見「優質案件」文字（對應 best_case 欄位）

---

#### TS-F050-H08：新增 best_case categorical condition、選 Y → `conditionPayload.conditions` 含 best_case Y（大寫）

- **關聯需求**：US-128 AC-4；US-129 AC-5；BR-12 §(5)；[[feedback_mock_real_system_contract]]
- **前置條件**：`listOptions` mock 對 'best_case' 回 best_case options fixture；必填欄位已填
- **步驟**：新增 best_case 條件；勾選 Y（`optionValue: 'Y'`）；點儲存
- **預期結果**：`mockedCreateList` 被呼叫時 `conditionPayload.conditions` 含 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }`；`values` 中為大寫 `'Y'`，不可為 `'y'`

---

### I 群組：Frontend Tests — list-edit-draft-page

> **對應規格**：US-127 AC-1~5；US-128 AC-2；F050 AC-16  
> **測試檔案（修改現有）**：`apps/web/src/pages/assignment/__tests__/list-edit-draft-page.test.tsx`  
> **修改方式**：（1）更新 `fieldsFixture` 加入 `best_case`；（2）新增 `scenario5List`（inactive cardType）；（3）新增 `cardTypesAllFixture`（status=all，含 active + inactive）；（4）末尾追加 describe `v2.1.1 補強 (US-127/US-128)`  
> **Q3 已解**：`AssignmentListItem.cardType: string | null` 已存在（`assignment-list.ts:64`），可直接設 `cardType: 'OL2'`  
> **prototype ground truth**：`prototypes/27b-list-edit-draft.html`（[[feedback_tdd_strict_prototype]]）

**scenario5List（US-127 inactive 測試用，cardType='OL2' inactive）**：
```
{ ...scenario1List, listNo: 'OB202605005', cardType: 'OL2' }
```

**cardTypesAllFixture（status=all，含 active + inactive）**：
```
{ cardTypes: [
  { cardType: 'E',   cardName: '期中',     prodKind: '01', status: 'active'   },
  { cardType: 'M',   cardName: '滿期',     prodKind: '03', status: 'active'   },
  { cardType: 'OB',  cardName: '一般催收', prodKind: '01', status: 'active'   },
  { cardType: 'OL2', cardName: '舊催收卡', prodKind: '01', status: 'inactive' },
  { cardType: 'S5',  cardName: '主力催收', prodKind: '02', status: 'active'   },
  { cardType: 'S6',  cardName: '重點戶',   prodKind: '02', status: 'active'   },
] }
```

#### TS-F050-I01：編輯頁移除 prodBest input — DOM 完全不存在

- **關聯需求**：US-128 AC-2；F050 §5.2 移除欄位
- **前置條件**：`mockedListLists` 回 `[scenario1List]`；renderPage
- **步驟**：`await waitFor(...)` 後驗證
- **預期結果**：`screen.queryByTestId('input-prodBest')` 為 `null`

---

#### TS-F050-I02：編輯頁卡別 `select-cardType` 渲染，預填現有 cardType='S5'

- **關聯需求**：US-127 AC-1；F050 AC-16
- **前置條件**：`scenario1List.cardType = 'S5'`（active）；`cardTypes API (status=all)` mock 含 S5
- **步驟**：renderPage('OB202605001')；`await waitFor(...)`
- **預期結果**：`screen.getByTestId('select-cardType')` 存在；select 的 value 為 `'S5'`

---

#### TS-F050-I03：**名單現存 inactive 卡別（OL2）— 下拉含 OL2 disabled option + 附「已停用」文字**

- **關聯需求**：US-127 AC-2；F050 AC-16；Q-A 決議；prototype 27b L525-526
- **測試類型**：Positive / Frontend Component（RTL）
- **前置條件**：`scenario5List`（cardType='OL2'）；`cardTypes API (status=all)` mock 含 OL2（status='inactive'）
- **步驟**：renderPage('OB202605005')；`await waitFor(...)`；取 select element
- **預期結果**：
  - select 中存在一個 option value='OL2' 且 `option.disabled === true`
  - option text 含「已停用 — 僅供保留舊值」
  - active 選項（如 S5）的 disabled 屬性為 false
  - 預設選中值為 OL2（名單現存值）

---

#### TS-F050-I04：切換 inactive 卡別 OL2 → active S5 → PATCH 含新 cardType='S5'

- **關聯需求**：US-127 AC-3；F050 AC-16
- **前置條件**：同 I-3；`mockedUpdateList.mockResolvedValue({ listNo: 'OB202605005' })`
- **步驟**：renderPage；選取 S5 option；點「儲存變更」
- **預期結果**：`mockedUpdateList` 被呼叫時 request body `cardType === 'S5'`（非 OL2）

---

#### TS-F050-I05：清除卡別為「— 未選擇 —」→ PATCH cardType=null 或不帶 cardType

- **關聯需求**：US-127 AC-3；F050 AC-16
- **步驟**：renderPage（scenario5List）；選取「未選擇」option；點儲存
- **預期結果**：`mockedUpdateList` 被呼叫時 `cardType` 為 `null` 或欄位不存在

---

#### TS-F050-I06：LEGACY 名單（conditionPayload=null）仍可正常使用卡別下拉、可儲存

- **關聯需求**：US-127 技術備註 LEGACY 名單場景
- **前置條件**：`scenario3List`（conditionPayload=null）
- **步驟**：renderPage('OB202604099')；驗證 select-cardType 存在且不 disabled；切換卡別後點儲存
- **預期結果**：`select-cardType` 存在且未 disabled；`mockedUpdateList` 可被呼叫（不阻擋）

---

#### TS-F050-I07：stage != 'draft' 名單 — 主表單隱藏，卡別下拉不渲染（DOM 完全不存在）

- **關聯需求**：US-127 AC-4；F050 AC-14；K1 約束
- **前置條件**：`scenario4List`（stage='dept_ratio'）
- **步驟**：renderPage('OB202605003')；`await waitFor(...)`
- **預期結果**：`screen.queryByTestId('select-cardType')` 為 `null`（DOM 不渲染）；`screen.getByTestId('not-draft-banner')` 存在

---

### J 群組：E2E Tests

> **對應規格**：F050 AC-16；BR-12；§18.11.7；US-126/127/128/129  
> **測試檔案（新建）**：`apps/api/test/f050-v211-e2e.spec.ts`  
> **架構**：對齊 `f054-f061-composite.e2e-spec.ts` 風格；使用 NestJS TestingModule + SQLite in-memory（`buildEnv` 模式對齊 `create-list-v2.1.spec.ts`）；E2E 前執行 m286 / m287 的 up() 確保 best_case options 就緒、prod_best nullable

#### TS-F050-J01：建立含 best_case condition 的名單 → condition_payload JSONB 正確儲存，prod_best=null

- **關聯需求**：F050 AC-16；BR-12；US-128 AC-4
- **測試類型**：Positive / E2E（Integration）
- **Input**：POST `/api/v1/assignment/list-definitions`；body 含 `conditionPayload.conditions[{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }]`；director auth
- **預期結果**：HTTP 201；DB 中名單 `condition_payload.conditions` 含 best_case 條目；`prod_best === null`

---

#### TS-F050-J02：Stage 1 composer 對 best_case condition → SQL where 含 `"best_case" IN`；params 含大寫 `['Y']`

- **關聯需求**：BR-12 §(3)；§18.11.7；[[feedback_mock_real_system_contract]]
- **測試類型**：Positive / E2E Integration（pure function 驗證層）
- **Input**：帶 best_case condition 的名單；呼叫 `buildStage1WhereConditions(list)`
- **預期結果**：`result.where` 含 `"best_case"`；params 含 `['Y']`（大寫）；`result.skipReason` 為 null

---

#### TS-F050-J03：建立模式 cardType 全流程 — POST cardType='S5' → DB card_type='S5' → GET 回 cardType='S5'

- **關聯需求**：US-126 AC-5；F050 AC-16
- **前置條件**：`ob_card_type` seed 含 S5（active）
- **步驟**：POST DTO `{ cardType: 'S5', conditionPayload: ..., ... }` → GET 該名單
- **預期結果**：POST 201；GET response `cardType === 'S5'`；DB `ob_list_definition.card_type === 'S5'`

---

#### TS-F050-J04：編輯模式 inactive 保留 — DB 名單 cardType='OL2'，不變更直接 PATCH → DB cardType 仍 'OL2'

- **關聯需求**：US-127 AC-2（inactive 保留語意）
- **步驟**：建立 DB 中名單 `card_type='OL2'`；PATCH 送出 `{ cardType: 'OL2' }` → GET 驗證
- **預期結果**：PATCH 200；DB `card_type === 'OL2'`；不因 inactive 而 422

---

### K 群組：Regression / Cross-cutting Tests

> **測試檔案（修改現有 service spec）**：追加至 `apps/api/src/modules/assignment-list/__tests__/assignment-list.service.spec.ts`  
> **依據**：[[feedback_grep_negative_lookahead]]（用 fs + regex，不可僅靠 Grep 工具）

#### TS-F050-K01a：backend regression — `assignment-list.service.ts` 不再含 `dto.prodBest` 讀取（fs + regex）

- **關聯需求**：US-128 AC-5；§18.11.6 service L378/L540
- **測試類型**：Regression / Static Analysis（fs.readFileSync + regex）
- **步驟**：
  1. `readFileSync('apps/api/src/modules/assignment-list/assignment-list.service.ts', 'utf-8')`
  2. 以正規表達式測試：`/dto\.prodBest/` 和 `/prodBest\s*\?\?/`
- **預期結果**：兩個 regex 均不 match（service 不再讀 DTO.prodBest 或以 `prodBest ??` 寫入 entity）
- **允許殘留**：DTO 宣告的 `prodBest` 欄位定義；spec 中的 `prodBest` 字串（非 service 原始碼）

---

#### TS-F050-K01b：frontend regression — `list-create-draft-page.tsx` 不再含 `setProdBest` / `prodBest =` / `dto.prodBest =`（fs + regex）

- **關聯需求**：US-128 AC-5；前端 state 與 DTO 寫入點清理
- **測試類型**：Regression / Static Analysis（fs.readFileSync + regex）
- **步驟**：
  1. `readFileSync('apps/web/src/pages/assignment/list-create-draft-page.tsx', 'utf-8')`
  2. 以正規表達式測試：`/setProdBest/`、`/prodBest\s*=/`、`/dto\.prodBest\s*=/`
- **預期結果**：三個 regex 均不 match
- **允許殘留**：`import` 引用或型別宣告中的 `prodBest`（因方案 Y backward-compat 型別仍存在）

---

#### TS-F050-K01c：frontend regression — `list-edit-draft-page.tsx` 不再含 `setProdBest` / `prodBest =` / `dto.prodBest =`（fs + regex）

- **關聯需求**：US-128 AC-5；前端 state 與 DTO 寫入點清理
- **測試類型**：Regression / Static Analysis（fs.readFileSync + regex）
- **步驟**：
  1. `readFileSync('apps/web/src/pages/assignment/list-edit-draft-page.tsx', 'utf-8')`
  2. 以正規表達式測試：`/setProdBest/`、`/prodBest\s*=/`、`/dto\.prodBest\s*=/`
- **預期結果**：三個 regex 均不 match
- **允許殘留**：`import` 引用或型別宣告中的 `prodBest`

---

## 附錄 B：v2.1.1 覆蓋對應表（Story AC → 測試場景）

| Story | AC | 測試場景 |
|---|---|---|
| US-126 AC-1 | 卡別下拉渲染，選項來自 ob_card_type | H-02, H-04 |
| US-126 AC-2 | 首選項「未選擇」，DTO 送出 card_type 代碼 | H-03, H-05 |
| US-126 AC-3 | maxLength={2} 移除（後端 @MaxLength(5) 保留） | E-05, E-06 |
| US-126 AC-4 | API 失敗 fallback，不阻擋儲存 | H-06 |
| US-126 AC-5 | 選取卡別後 DTO 送出正確代碼字串 | H-05, J-03 |
| US-127 AC-1 | 編輯頁卡別下拉渲染，預填現有值 | I-02 |
| US-127 AC-2 | inactive 卡別 disabled 顯示（最關鍵場景） | I-03 |
| US-127 AC-3 | 可切換 active 或清除為「未選擇」| I-04, I-05 |
| US-127 AC-4 | 非 draft 名單不渲染卡別下拉 | I-07 |
| US-127 AC-5 | API 失敗 state 保留原有值 | I-06（延伸驗證） |
| US-128 AC-1 | 建立頁 prodBest input DOM 不存在 | H-01 |
| US-128 AC-2 | 編輯頁 prodBest input DOM 不存在 | I-01 |
| US-128 AC-3 | DB migration 清空 prod_best，schema nullable | B-04 |
| US-128 AC-4 | best_case dropdown 可用（依賴 US-129） | H-07, H-08 |
| US-128 AC-5 | prodBest state/DTO 死碼完全移除 | K-01a, K-01b, K-01c |
| US-129 AC-1 | Y/N options 存在，label 正確，UPSERT 覆寫 | A-02, A-03, A-04（最關鍵） |
| US-129 AC-2 | API 可回傳 best_case 2 筆 options | G-01（unit 驗 SQL），J-01（E2E 驗 payload） |
| US-129 AC-3 | Migration idempotent（UPSERT 重複執行） | A-04, A-05 |
| US-129 AC-4 | Whitelist 防呆確認 | A-01, A-02 |
| US-129 AC-5 | 前端篩選條件可加 best_case、選 Y/N | H-07, H-08 |
| F050 AC-16 | cardType 下拉完整契約 | H-02~06, I-02~05, D-01~05 |
| §18.11.2 決策 18.11.2 | M-A1 UPSERT 覆寫（非 DO NOTHING） | A-03, A-04 |
| §18.11.4 決策 18.11.3 | M-A2 schema+資料同一 migration | B-01, B-02, B-04 |
| §18.11.5 | card-type API query param contract | D-01, D-02, D-03 |
| §18.11.6 方案 Y | prodBest DTO backward-compat | E-01~04, F-03 |
| §18.11.7 | best_case Stage 1 通用 categorical | G-01~05 |
| §18.11.9 R8 | m240 N label 覆寫驗證 | A-04 |
| §18.11.9 R9 | SQLite 全欄位不遺漏 | B-03 |

---

## 附錄 C：v2.1.1 檔案分布計劃

| 操作 | 測試檔案路徑 | 涵蓋群組 |
|---|---|---|
| **新建** | `apps/api/src/database/migrations/__tests__/m286-seed-best-case-field-and-options.spec.ts` | A 群組（M-A1，7 場景） |
| **新建** | `apps/api/src/database/migrations/__tests__/m287-deprecate-prod-best-column.spec.ts` | B 群組（M-A2，6 場景） |
| **修改** | `apps/api/src/modules/assignment-list/__tests__/ob-list-definition-entity.spec.ts` | C 群組（追加，3 場景） |
| **修改** | `apps/api/src/modules/assignment-scoring/__tests__/card-type-list.service.spec.ts` | D 群組（追加，5 場景） |
| **修改** | `apps/api/src/modules/assignment-list/__tests__/list-dto-validation.spec.ts` | E 群組（追加，6 場景） |
| **修改** | `apps/api/src/modules/assignment-list/__tests__/assignment-list.service.spec.ts` | F 群組（追加，5 場景）+ K 群組（追加，3 場景） |
| **修改** | `apps/api/src/modules/assignment/stage1/__tests__/stage1-query-composer.spec.ts` | G 群組（波 6，5 場景） |
| **修改** | `apps/web/src/pages/assignment/__tests__/list-create-draft-page.test.tsx` | H 群組（追加，8 場景） |
| **修改** | `apps/web/src/pages/assignment/__tests__/list-edit-draft-page.test.tsx` | I 群組（追加，7 場景） |
| **新建** | `apps/api/test/f050-v211-e2e.spec.ts` | J 群組（4 場景） |
