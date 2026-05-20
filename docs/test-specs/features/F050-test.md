---
type: test-design-feature
feature_id: F050
feature_name: 新增名單定義（whitelist-driven v2.1）
priority: P0-MVP
related_spec: /docs/specs/features/F050-create-list-definition.md
spec_version: "2.1"
covers:
  - F050
  - US-106
  - US-121
  - US-123
  - US-125
date: 2026-05-20
last_updated: 2026-05-20
---

# F050：新增名單定義（whitelist-driven v2.1）— 測試設計

> **v2.1 測試設計範圍**：本文件覆蓋 F050 v2.1 whitelist-driven 重構全部 30 個測試場景，包含 condition_payload 必填驗證、columnName 白名單驗證、list_period_* 保留欄位防呆、backward-compat 衍生欄位、prod_kind 交集唯一性、caseyear/case_status 動態選項、INACTIVE 選項警示、LEGACY_LIST_NOT_COPYABLE，以及前端必填驗證 UI。對應 GAP-LIST §A1~A3、§B1~B3、§C1~C3、§G1~G4 的完整解除驗收。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F050-create-list-definition.md` v2.1 + `error-handling.md` §assignment-list-errors + `architecture-spec.md` §18.4 §18.6 §18.8 |
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

## 附錄：GAP 覆蓋對照

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
