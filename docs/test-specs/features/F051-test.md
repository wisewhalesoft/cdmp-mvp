---
type: test-design-feature
feature_id: F051
feature_name: 編輯名單定義（whitelist-driven v2.2.1）
priority: P0-MVP
related_spec: /docs/specs/features/F051-edit-list-definition.md
spec_version: "2.2.1"
covers:
  - F051
  - US-106
  - US-121
  - US-123
  - US-144
date: 2026-05-20
last_updated: 2026-05-28
---

# F051：編輯名單定義（whitelist-driven v2.1）— 測試設計

> **v2.1 測試設計範圍**：本文件覆蓋 F051 v2.1 whitelist-driven 重構全部 19 個測試場景，包含 condition_payload 覆寫驗證、columnName 白名單防呆、stage 保護（K1/K3）、舊名單 LEGACY 唯讀模式（US-123 AC-2）、backward-compat 衍生欄位覆寫、INACTIVE 選項警示、稽核日誌 before/after。對應 GAP-LIST §A1~A3、§B3、§C1~C3、§G5、§K1、§K3 的完整解除驗收。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F051-edit-list-definition.md` v2.1 + `error-handling.md` §assignment-list-errors + `architecture-spec.md` §18.4 §18.6 §18.8 |
| QA / Tester | 本文件 + `error-handling.md` §assignment-list-errors |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | 後端 Integration（Supertest API + DB 驗證）、前端 Component（RTL + MSW） |
| 關鍵語意差異（vs F050） | updateList 含 `assertNotHistorical`、stage guard（draft 限制）、`excludeListNo` 唯一性比對、舊名單 LEGACY 防呆 |

---

## 一、condition_payload 必填與 DTO 驗證

### TS-F051-001：conditions 陣列為空時後端回 422

- **關聯需求**：F051 AC-6 / US-121 AC-1 / GAP B3
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：部長帳號已登入；名單 `OB202605001` status=active, stage=draft, condition_payload IS NOT NULL
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605001`，body 含 `conditionPayload: { conditions: [], logic: "AND" }`
  2. 驗證回應
- **預期結果**：HTTP 422，訊息含「篩選條件不得為空」

---

## 二、columnName 白名單驗證

### TS-F051-002：columnName 不在白名單或 is_active=false 時回 422 CONDITION_COLUMN_NOT_IN_WHITELIST

- **關聯需求**：F051 AC-8 / US-121 AC-2 / GAP A3
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：白名單 `settle_src` 已停用（is_active=false）；名單 `OB202605001` stage=draft
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605001`，`conditionPayload.conditions` 含 `{ columnName: "settle_src", fieldType: "categorical", values: ["Y"] }`
  2. 驗證回應
- **預期結果**：HTTP 422，`CONDITION_COLUMN_NOT_IN_WHITELIST`，response 含 `columnName: "settle_src"`

---

## 三、list_period_* 保留欄位防呆

### TS-F051-003：list_period_* 入 conditions 時回 400 RESERVED_FIELD_IN_CONDITIONS

- **關聯需求**：F051 AC-9 / J8
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：名單 `OB202605001` stage=draft
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605001`，`conditions` 含 `{ columnName: "list_period_start", ... }`
  2. 驗證回應
- **預期結果**：HTTP 400，`RESERVED_FIELD_IN_CONDITIONS`

---

## 四、INACTIVE 選項警示（非阻擋）

### TS-F051-004：categorical 條件含 inactive option 時 200 OK + warnings 正確

- **關聯需求**：F051 AC-10
- **測試類型**：Positive with warning / Integration（Supertest）
- **前置條件**：`pooldata_field_option`：`prod_kind` 選項 `02` 已停用；名單 `OB202605001` stage=draft
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605001`，`conditions = [{ columnName: "prod_kind", fieldType: "categorical", values: ["01", "02"] }]`
  2. 驗證回應
- **預期結果**：
  - HTTP 200 OK（成功更新）
  - response 含 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["prod_kind"] }]`

---

## 五、舊名單 LEGACY 唯讀防呆

### TS-F051-005：舊名單（condition_payload IS NULL）送出 conditionPayload 時回 422 LEGACY_LIST_CONDITION_READONLY

- **關聯需求**：F051 AC-11 / 拍板 Q3 / US-123 AC-2
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：名單 `OB202504001` condition_payload IS NULL，stage=draft，status=active
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202504001`，body 含 `conditionPayload: { conditions: [...], logic: "AND" }`
  2. 驗證回應
- **預期結果**：HTTP 422，`error_code: LEGACY_LIST_CONDITION_READONLY`

---

### TS-F051-006：舊名單仍可編輯非篩選欄位（listNm / listPeriodStart 等）

- **關聯需求**：F051 AC-11 / US-123 AC-2 TC-123-03
- **測試類型**：Positive / Integration（Supertest + DB 驗證）
- **前置條件**：名單 `OB202504001` condition_payload IS NULL，stage=draft
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202504001`，body 只含 `listNm: "修改後名稱"`，不含 `conditionPayload`
  2. 驗證回應及 DB
- **預期結果**：
  - HTTP 200
  - DB `ob_list_definition.list_nm` = `"修改後名稱"`
  - `condition_payload` 仍為 NULL（未被修改）

---

## 六、stage 保護（K1 / K3）

### TS-F051-007：stage=dept_ratio 時嘗試寫入 conditionPayload 回 422 LIST_STAGE_TRANSITION_FORBIDDEN

- **關聯需求**：F051 AC-12 / K1
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：名單 `OB202605002` stage=dept_ratio，status=active
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605002`，body 含有效 `conditionPayload`
  2. 驗證回應
- **預期結果**：HTTP 422，`error_code: LIST_STAGE_TRANSITION_FORBIDDEN`

---

### TS-F051-008：stage=ready 時嘗試寫入 conditionPayload 回 422 LIST_STAGE_TRANSITION_FORBIDDEN

- **關聯需求**：F051 AC-12 / K1
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：名單 `OB202605003` stage=ready，status=active
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605003`，body 含有效 `conditionPayload`
  2. 驗證回應
- **預期結果**：HTTP 422，`error_code: LIST_STAGE_TRANSITION_FORBIDDEN`

---

### TS-F051-009：Rollback 退回 draft 後 conditionPayload 可正常寫入

- **關聯需求**：F051 AC-12 / K3 / §18.10 中（K3 rollback 後可寫）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：名單 `OB202605004` 原 stage=dept_ratio；透過 Rollback API（M03a）退回 stage=draft
- **步驟**：
  1. 確認名單現在 stage=draft
  2. PUT `/api/v1/assignment/list-definitions/OB202605004`，body 含有效 `conditionPayload: { conditions: [...], logic: "AND" }`
  3. 驗證回應
- **預期結果**：HTTP 200（成功更新），condition_payload 已被覆寫

---

## 七、月跑執行中防呆

### TS-F051-010：月跑執行中回 409，優先於 stage guard

- **關聯需求**：F051 AC-5 / F051 AC-12
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：`assignment_run` 有 status=running；名單 `OB202605005` stage=draft
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605005`，body 含有效 `conditionPayload`
  2. 驗證回應
- **預期結果**：HTTP 409，`error_code: ASSIGNMENT_RUN_ALREADY_RUNNING`（月跑鎖優先）

---

## 八、已停用名單防呆

### TS-F051-011：已停用名單直接呼叫 API 回 422 ASSIGNMENT_LIST_INACTIVE

- **關聯需求**：F051 AC-4
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：名單 `OB202605006` status=inactive
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605006`，body 含有效 `conditionPayload`
  2. 驗證回應
- **預期結果**：HTTP 422，`error_code: ASSIGNMENT_LIST_INACTIVE`，訊息：「已停用名單不可編輯」

---

## 九、backward-compat 衍生欄位覆寫

### TS-F051-012：覆寫後 spec_tp 衍生值對齊新 condition

- **關聯需求**：F051 AC-13 / GAP C3
- **測試類型**：Positive / Integration（Supertest + DB 驗證）
- **前置條件**：名單 `OB202605007` stage=draft，原 `spec_tp = "02$$04"`（舊值）
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605007`，`conditions = [{ columnName: "spec_tp", fieldType: "categorical", values: ["11", "12", "13"] }]`
  2. 查詢 DB
- **預期結果**：DB `ob_list_definition.spec_tp` = `"11$$12$$13"`（衍生規則，§18.6 以 `$$` 分隔）

---

## 十、prod_kind 交集唯一性（UPDATE 場景）

### TS-F051-013：prod_kind 唯一性交集語意（UPDATE 場景，排除自身）

- **關聯需求**：F051 AC-7 / §18.8
- **測試類型**：Boundary / Integration（Supertest）
- **前置條件**：名單 `OB202605008` stage=draft，card_type='A'；同月另有名單 `OB202605009`（active），`prod_kind = "02"`
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605008`，`conditions` 含 `prod_kind values: ["02"]`，`card_type: "A"`
  2. 驗證回應
- **預期結果**：HTTP 422，`LIST_NO_DUPLICATE`（與 `OB202605009` 有交集；自身 `OB202605008` 已排除比對）

---

## 十一、稽核日誌

### TS-F051-014：儲存成功後 assignment_audit_log 寫入 UPDATE 含 before/after JSONB

- **關聯需求**：F051 AC-2
- **測試類型**：Positive / Integration（DB 驗證）
- **前置條件**：名單 `OB202605010` stage=draft；有原始 condition_payload
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/OB202605010`，body 含新的 `conditionPayload`
  2. 查詢 `assignment_audit_log` 最新一筆
- **預期結果**：
  - `action = 'UPDATE'`
  - `entity_type = 'ob_list_definition'`
  - `entity_id = 'OB202605010'`
  - `before_value` 含舊 condition_payload JSON
  - `after_value` 含新 condition_payload JSON

---

## 十二、前端 UI — 編輯頁載入

### TS-F051-015：編輯頁載入 conditionPayload IS NOT NULL 時正確解析為動態 conditions UI

- **關聯需求**：F051 AC-1 / GAP G5
- **測試類型**：Frontend Component（RTL + MSW）
- **前置條件**：MSW mock `GET /api/v1/assignment/list-definitions/OB202605011` 回傳含 `conditionPayload: { conditions: [{ columnName: "prod_kind", fieldType: "categorical", values: ["01","02"] }], logic: "AND" }`
- **步驟**：
  1. 渲染 list-edit-draft-page，載入名單 `OB202605011`
  2. 查看篩選條件區塊
- **預期結果**：
  - 篩選條件區塊顯示一個 `prod_kind` 條件，含 `01`、`02` 勾選狀態
  - 條件元件為可互動狀態（未 disabled）

---

## 十三、前端 UI — 舊名單 LEGACY banner

### TS-F051-016：舊名單（IS NULL）編輯頁篩選條件區塊為唯讀，顯示「（舊格式）」前綴

- **關聯需求**：F051 AC-11 / US-123 AC-2
- **測試類型**：Frontend Component（RTL + MSW）
- **前置條件**：MSW mock 回傳名單 `condition_format: "legacy"`（或 `conditionPayload: null`），entity column `prod_kind = "01"`, `spec_tp = "02$$04"`
- **步驟**：
  1. 渲染 list-edit-draft-page，載入舊名單
  2. 查看篩選條件區塊
- **預期結果**：
  - 篩選條件區塊以唯讀摘要形式顯示，含「（舊格式）PROD_KIND=01；SPEC_TP=02$$04」格式文字
  - DOM 中無可互動的條件輸入元件

---

### TS-F051-017：舊名單編輯頁「新增 / 刪除條件」按鈕停用

- **關聯需求**：F051 AC-11 UI
- **測試類型**：Frontend Component（RTL）
- **前置條件**：同 TS-F051-016（舊名單 legacy）
- **步驟**：
  1. 渲染舊名單編輯頁
  2. 查詢「新增條件」及「刪除條件」按鈕的狀態
- **預期結果**：
  - `data-testid="btn-add-condition"` 元素不存在於 DOM，或 `disabled` attribute 為 true
  - `data-testid="btn-delete-condition"` 元素不存在於 DOM，或為 disabled

---

### TS-F051-018：舊名單編輯頁提示訊息文字正確

- **關聯需求**：F051 AC-11 / US-123 AC-2
- **測試類型**：Frontend Component（RTL）
- **前置條件**：同 TS-F051-016
- **步驟**：
  1. 渲染舊名單編輯頁
  2. 查詢提示訊息元素
- **預期結果**：頁面顯示「此名單使用舊格式儲存，篩選條件暫時無法編輯。待系統完成資料轉換後，即可在此介面修改篩選條件」

---

### TS-F051-019：新名單（conditionPayload IS NOT NULL）不顯示 LEGACY 標籤

- **關聯需求**：US-123 TC-123-05 / Phase 3b UI 27b
- **測試類型**：Frontend Component（RTL + MSW）
- **前置條件**：MSW mock 回傳名單含有效 `conditionPayload`（非 null）
- **步驟**：
  1. 渲染 list-edit-draft-page，載入新名單
  2. 查詢 LEGACY 相關 DOM 元素
- **預期結果**：
  - 頁面不顯示「舊格式」前綴、LEGACY banner 或提示訊息
  - 篩選條件區塊為可互動狀態

---

## 附錄：GAP 覆蓋對照

| GAP | 覆蓋場景 |
|---|---|
| A1 | TS-F051-001 |
| A2 | TS-F051-015 |
| A3 | TS-F051-002 |
| B3 | TS-F051-001 |
| C1 | TS-F051-014（audit log 驗寫入） |
| C2 | TS-F051-002 |
| C3 | TS-F051-012 |
| G5 | TS-F051-015 |
| K1 | TS-F051-007/008 |
| K3 | TS-F051-009 |

---

## 十四、v2.2 / v2.2.1 補強測試設計（US-144 best_case 系統固定篩選條件）

> **spec 版本**：F051 v2.2（updateList 注入 BR-14）/ v2.2.1（最低條件數語意修正 AC-6）
> **對應 Story**：US-144 AC-2（updateList 竄改正規化）
> **架構引用**：AD-E07-18 §18.12.4（injectSystemFixedConditions 契約）、§18.12.5（呼叫堆疊 updateList 路徑）
> **說明**：updateList 場景測試設計同 F050 N 群組，F051-test.md 額外補充前端編輯頁場景（已移至 F050-test.md R 群組，此處記錄 cross-ref）以及 min-count 語意更新場景（F051 v2.2.1 AC-6）

### TS-F051-020：updateList — 有提供 conditionPayload + 不含 best_case → DB 更新後含 best_case: ['Y']

- **關聯需求**：F051 v2.2 AC-14 / US-144 AC-2
- **測試類型**：Positive / Service Integration（SQLite in-memory）
- **前置條件**：
  - DB 中有效 draft 名單（`condition_payload IS NOT NULL`）
  - `pooldata_field_whitelist.best_case.is_system_fixed = true`
- **步驟**：
  1. PUT `/api/v1/assignment/list-definitions/{listNo}`，body `conditionPayload.conditions` 含 1 個非系統固定條件（如 `prod_kind`），不含 `best_case`
  2. 讀回 DB
- **預期結果**：
  - HTTP 200
  - `condition_payload.conditions` 含 `best_case: ['Y']`；`prod_kind` 條目仍存在

---

### TS-F051-021：updateList — payload 含 best_case values: ['N']（竄改）→ 靜默正規化，200 OK

- **關聯需求**：F051 v2.2 AC-14 tamper-normalization / US-144 TC-144-02
- **測試類型**：Boundary（tamper-proof）/ Integration（Supertest）
- **前置條件**：同 TS-F051-020；名單 stage=draft
- **步驟**：
  1. PUT body 含 `conditionPayload.conditions`: `[{ columnName: 'prod_kind', ... }, { columnName: 'best_case', fieldType: 'categorical', values: ['N'] }]`
- **預期結果**：
  - HTTP 200（不 422）
  - DB 中 `best_case.values === ['Y']`（靜默修正，不回錯誤）

---

### TS-F051-022：updateList min-count（v2.2.1）— 僅含 best_case（system-fixed）→ 422 VALIDATION_ERROR

- **關聯需求**：F051 v2.2.1 AC-6 / US-144 / §18.12.8
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：名單 stage=draft；`condition_payload IS NOT NULL`
- **步驟**：
  1. PUT body `conditionPayload.conditions = [{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }]`（僅系統固定條件）
  2. 驗證回應
- **預期結果**：
  - HTTP 422
  - `error_code: VALIDATION_ERROR`
  - 訊息含「至少 1 個非系統固定」語意

---

### TS-F051-023：updateList min-count — 1 個非系統固定 + best_case → 通過驗證（最小合法 payload 邊界）

- **關聯需求**：F051 v2.2.1 AC-6 OK path（Boundary）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：同 TS-F051-022
- **步驟**：
  1. PUT body `conditionPayload.conditions = [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }, { columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }]`
  2. 驗證回應
- **預期結果**：HTTP 200；DB 含 best_case: ['Y']

---

### TS-F051-024：updateList — condition_payload IS NULL 舊名單 + 不帶 conditionPayload → 不觸發注入（LEGACY 路徑不變）

- **關聯需求**：F051 v2.2 AC-14「僅在有提供 conditionPayload 時套用」/ AC-11 LEGACY 路徑
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：名單 `condition_payload IS NULL`（舊遷移名單）
- **步驟**：
  1. PUT body 只含 `{ listNm: '修改後名稱' }`（不帶 conditionPayload）
  2. 讀回 DB
- **預期結果**：
  - HTTP 200
  - `condition_payload` 仍為 `null`（未被注入 best_case）
  - `list_nm` 已更新

---

### TS-F051-025：updateList — 提供 conditionPayload 給舊名單（condition_payload IS NULL）→ 422 LEGACY_LIST_CONDITION_READONLY（注入不執行）

- **關聯需求**：F051 AC-11 防呆在 injectSystemFixedConditions 之前執行（§18.12.5 call-stack 順序）
- **測試類型**：Negative / Integration（Supertest）
- **前置條件**：名單 `condition_payload IS NULL`；stage=draft
- **步驟**：
  1. PUT body 含有效 `conditionPayload`
- **預期結果**：
  - HTTP 422
  - `error_code: LEGACY_LIST_CONDITION_READONLY`
  - 不回 best_case 相關錯誤（LEGACY guard 先觸發，inject 邏輯不進入）

---

## 附錄 B：v2.2 / v2.2.1 覆蓋對應表（Story AC → 測試場景）

| AC / TC | 說明 | 測試場景 |
|---|---|---|
| US-144 AC-2 / TC-144-02 | updateList 竄改正規化（N → Y） | TS-F051-021 |
| F051 v2.2 AC-14 | updateList 注入 + 不含 best_case → 補入 | TS-F051-020 |
| F051 v2.2 AC-14（4-state） | 舊名單（IS NULL）不注入 | TS-F051-024 |
| F051 v2.2 AC-12（ordering） | LEGACY guard 先於 inject | TS-F051-025 |
| F051 v2.2.1 AC-6 | min-count 排除 system-fixed（updateList） | TS-F051-022、TS-F051-023 |

> **前端編輯頁鎖定列場景**（AC-3 / AC-4）已移至 F050-test.md 十六節 R 群組（TS-F050-R01~R03），因前端建立與編輯頁共用同一 list-edit-draft-page 測試檔案，集中管理避免重複。
