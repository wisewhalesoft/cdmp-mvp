---
type: test-design-feature
feature_id: F112
feature_name: 類別型篩選欄位可選值自動建議（從實際資料批次帶入，distinct-values + options/bulk）
priority: P2
related_spec: /docs/specs/features/F112-auto-suggest-categorical-options.md
source_ad: /docs/specs/implementation-log/AD-E07-47-auto-suggest-categorical-options.md
source_stories: [US-178]
spec_version: "1.0"
last_updated: 2026-07-12
blocked_by: [F075, F076, F109]
---

# F112：類別型篩選欄位可選值自動建議（從實際資料批次帶入）— 測試設計

> **範圍**：本文件為測試設計（test design），是 tdd-implementation 的**可執行真值來源**。**不含** production code、測試實作碼（`.spec.ts`）、migration、entity 定義。依 CLAUDE.md Agent Workflow 邊界，test-designer 僅設計測試場景，不寫產品程式碼、不寫實際 test 檔。
>
> **權威來源優先序**：AD-E07-47 > F112 spec v1.0（AD §3.6/§9/§11 已明文：spec §5.1 錯誤碼表與 §12.3 建議欄尚未同步 AD 裁定，本文件一律採 AD 裁定值，見下方「Glossary — spec/AD 落差鎖定」）。
>
> **驗收紅線（Definition of Done）**：
> 1. **I-DVAL-READY-BEFORE-EXIST-01 必過**（ORDER 群組）：來源表不存在時必須回 503（未就緒），**不可**被欄位存在性檢查搶先誤判為 404 = AD §3 明文之高風險陷阱，直接對應本專案「逾時/未就緒被靜默吞掉」之既有教訓（BR-11）。
> 2. **`DISTINCT_VALUES_QUERY_TIMEOUT` 必為 500，不可為 504**（TIMEOUT-002）：spec 原文建議 504，AD-E07-47 §3.6 已推翻並改判 500（比照 `STAGE0_ESTIMATE_TIMEOUT` 前例）；本專案全域無任何 504 使用前例，此為 regression guard 防止 tdd-implementation 誤讀 spec 舊文字。
> 3. **RBAC 拒絕錯誤碼精確斷言**（GUARD 群組）：本文件已逐行查證 `DirectorGuard` / `DirectorOrSectionChiefGuard` 原始碼——處長（section_chief）拒絕碼為 `E07_REQUIRES_DIRECTOR`，無角色一般使用者拒絕碼為 `E07_ROLE_NOT_ASSIGNED`，**兩者不同、皆非** spec/AD 敘述性文字籠統提及的 `AUTH_FORBIDDEN`；斷言錯誤碼字串而非僅斷言 HTTP 403，避免下游誤用錯誤碼。
> 4. **稽核彙總單筆**（AUDIT-001）：一次 bulk 呼叫（N 筆新增）僅寫入 `assignment_audit_log` **恰好 1 筆**，寫入既有 `after_value` 欄位（entity 無獨立 `details` 欄）。
> 5. **冪等略過三態全綠**（BULK-003/004/005）：既有 active 值、既有 inactive 值、批次內重複值，三者皆須略過且**不得**回 409，與 F076 單筆新增端點的 409 行為刻意分歧，不可誤用共用邏輯。
> 6. **`tsc --noEmit -p tsconfig.build.json` 零錯誤**（新增 4 個錯誤碼常數 + `DistinctValuesResult` / `BulkCreateOptionsResult` 介面 + DTO，feedback_vitest_no_typecheck 教訓：vitest 不做型別檢查，必跑）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F112 spec](../../specs/features/F112-auto-suggest-categorical-options.md)（§5 凍結 DTO / §6 BR-1~13）+ [AD-E07-47](../../specs/implementation-log/AD-E07-47-auto-suggest-categorical-options.md)（§3 全部裁定含程式碼契約 / §7 不變式 / §8 測試邊界建議 / §9 檔案異動清單）+ `pooldata-field-whitelist.service.ts`（`getAvailableColumns` 既有 dialect-branch 範本）+ `pooldata-field-option.service.ts`（`createOption` / `_writeAudit` 範本）+ `director.guard.ts` / `director-or-section-chief.guard.ts`（本文件已查證之實際錯誤碼）|
| QA / Tester | 本文件全部 + `error-handling.md#assignment-code-errors`（**注意**：4 新碼於本文件寫作當下尚未登錄，見「殘留風險」§C）|
| CI/CD Owner | 本文件「測試層與自動化就緒度」；F112 **無**需要真實 MSSQL 連線之案例（見「SQLite / mock 測試邊界」節），可全數併入既有 unit 測試套件、無需序列化或特殊 DB 隔離 |
| Product Analyst | 「殘留風險與待決問題」§A~E |
| UI/UX Designer | FE1/FE2 群組（五態呈現語意）+ prototype `37-base-code.html`（視覺細節以其為準，本文件僅約束語意） |

---

## Glossary — spec/AD 落差鎖定（防漂移）

> 本表為 test-designer 逐行比對 F112 spec v1.0、AD-E07-47 v1.0 與**實際原始碼**（`director.guard.ts` / `director-or-section-chief.guard.ts`）後鎖定之權威值。多 agent TDD 流程下游若僅讀 spec 表面文字容易誤用舊值（feedback_tdd_naming_drift 教訓），以下每一項本文件測試場景一律採「本文件採用值」欄。

| 項目 | spec v1.0 原文 / AD 敘述性文字 | 本文件採用值（已查證） | 依據 |
|---|---|---|---|
| `DISTINCT_VALUES_QUERY_TIMEOUT` HTTP status | spec §5.1 建議 **504** | **500**（`InternalServerErrorException`） | AD §3.6，比照 `STAGE0_ESTIMATE_TIMEOUT` 前例；本專案全域搜尋無任何 504 使用前例 |
| bulk 稽核「詳情」欄位 | spec §5.2/§6 BR-13 文字寫 `details = {...}` | 寫入既有 `after_value`（jsonb）；`AssignmentAuditLog` entity **無**獨立 `details` 欄 | AD §2 / §3.8 |
| `distinct-values` 執行順序 | spec §5.1 條列：步驟3 欄位存在性 → 步驟4 表就緒 | **表就緒檢查必須先於欄位存在性檢查**（I-DVAL-READY-BEFORE-EXIST-01） | AD §3 圖示 + 文字說明（表不存在時 `INFORMATION_SCHEMA.COLUMNS` 天然回 0 列，若不先查表就緒會被誤判為 404） |
| section_chief 呼叫寫入/偵測端點之拒絕碼 | spec AC-17 / F076 既有敘述籠統寫「403 `AUTH_FORBIDDEN`」 | **403 `E07_REQUIRES_DIRECTOR`**（`DirectorGuard` 實際拋出） | 本文件直接查證 `apps/api/src/common/guards/director.guard.ts:45,60` 原始碼 |
| 無業務角色一般使用者呼叫之拒絕碼 | spec 未明確區分（AC-18 僅述「無法進入頁面」） | **403 `E07_ROLE_NOT_ASSIGNED`**（class 級 `DirectorOrSectionChiefGuard` 先攔截，比 `DirectorGuard` 更早觸發，與 section_chief 的碼**不同**） | 本文件查證 `director-or-section-chief.guard.ts:43,62` 原始碼 |
| distinct 查詢逾時沿用對象 | spec OQ-178-02 假設「沿用既有 tedious driver requestTimeout（約 15s）」 | **不沿用**；全域 driver `requestTimeout` 現已調至 3,600,000ms（1 小時），本功能改用獨立 `Promise.race` app-level 逾時（`DISTINCT_VALUES_TIMEOUT_MS`，預設 15000ms，可 env 覆寫，與全域 driver timeout 脫鉤） | AD §1 / §3.5（P6c 效能修復後的既成事實，spec 假設已過時） |
| Entry 2 新按鈕之處長可見性模式 | spec §7.3「處長不渲染」 | 與 `options-tab.tsx` **既有**「新增可選值」按鈕之 `disabled={!canWrite}`（DOM 存在僅 disabled）模式**不同**；新按鈕須整個不進 DOM，斷言方式須為「元素不存在」而非「元素 disabled」 | 本文件查證 `options-tab.tsx:87,469` 既有實作模式；見 FE2-003 與「殘留風險」§D |

---

## 測試層與自動化就緒度

| 項目 | 說明 |
|---|---|
| **無需真實 MSSQL 連線**（與 F109 之關鍵差異） | F109（`customer_core` 條件式 JOIN）之核心案例須連真實 PG/MSSQL；F112 之 `distinct-values` / `options/bulk` 兩端點**全數**可用 mocked `dataSource.query` / `fieldRepo` / `optionRepo` / `auditRepo` / `manager.transaction` 驗證（沿用既有 `pooldata-field-whitelist.service.spec.ts` 對 `getAvailableColumns` 之既有 mock 慣例：`dataSource.options.type` 與 `dataSource.query` 皆為測試替身，非真實連線）。MSSQL 專屬行為（`TOP`/方括號欄名/`INFORMATION_SCHEMA` 大寫）以「斷言傳入 `dataSource.query` 之 SQL 字串內容」驗證，非對真實 MSSQL 執行。 |
| **`customer_core` 邊界** | `customer_core` 現況僅存在於 MSSQL（無 SQLite/PG 對應表）。本文件所有涉及 `customer_core` 的案例（SRC-002、DEDUP-*、FE2-004 之 TC-178-07 對應情境）一律停留在 mock 層級（斷言 SQL 字串含 `customer_core` 字面量、`_resolveDistinctValueSource` 回傳值正確），**不**對真實 MSSQL `customer_core` 表執行查詢；與 F109 之 PG-integration 路徑性質不同，不可混淆測試策略。 |
| **逾時測試不等待真實秒數** | TIMEOUT 群組以測試注入極小 `DISTINCT_VALUES_TIMEOUT_MS`（比照 AD §8 建議之 F049 `timeoutMs=0` 慣例）驗證 `Promise.race` 邏輯正確，不等待真實 15s。 |
| **前端測試層** | React Testing Library + 現有 API mock 慣例（`vi.mock('@/api/pooldata-fields')` 或 MSW，沿用 F075/F076/F109 既有前端測試慣例）。 |
| **CI 隔離需求** | 無。本 Feature 不需要唯一 schema 隔離、不需要與 F098~F104/F109 之 `.pg.spec.ts` 序列執行，可併入一般 unit 測試套件平行執行。 |

### 案例群組彙總

| 群組 | 說明 | 案例數 |
|---|---|---|
| SRC | 來源表解析（`_resolveDistinctValueSource`） | 5 |
| ORDER | 就緒優先於存在性（I-DVAL-READY-BEFORE-EXIST-01） | 3 |
| SAFE | 欄位名稱安全驗證（I-DVAL-SAFE-INTERP-01） | 4 |
| DISTINCT | DISTINCT 查詢 + cap/truncation/NULL/排序/空狀態 | 7 |
| TIMEOUT | app-level 逾時（I-DVAL-SCAN-BOUND-01 / I-DVAL-TIMEOUT-EXPLICIT-01） | 4 |
| DEDUP | `alreadyOption` 去重（BR-2） | 3 |
| BULK | `options/bulk` 交易 + 冪等 + 驗證（I-DVAL-BULK-TX-01） | 14 |
| AUDIT | 稽核彙總單筆（I-DVAL-AUDIT-SUMMARY-01） | 5 |
| GUARD | RBAC + Feature Flag（I-DVAL-GUARD-PARITY-01） | 11 |
| ROUTE | 路由不遮蔽 regression | 3 |
| **後端小計** | | **59** |
| FE1 | 進入點 1 核心流程（`fields-tab.tsx`） | 7 |
| FE1STATE | 進入點 1 五態呈現 | 6 |
| FE2 | 進入點 2 核心流程（`options-tab.tsx`） | 7 |
| FEREG | 前端不變範圍 regression | 2 |
| **前端小計** | | **22** |
| **合計** | | **81** |

---

## 追溯矩陣（AC / TC / BR / Invariant → Test ID）

| 來源 | 對應 Test ID |
|---|---|
| AC-1 / TC-178-01 / BR-1 / BR-12 | FE1-001, SRC-003, GUARD-001, GUARD-002 |
| AC-2 / TC-178-02 / BR-1 | FE1-004, SRC-004 |
| AC-3 / TC-178-03 | FE1-002 |
| AC-4 / TC-178-04 | FE1-006 |
| AC-5 / TC-178-03 / BR-9 | FE1-005, FE1-007 |
| AC-6 / TC-178-07 / BR-12 | SRC-001, SRC-002, FE2-001 |
| AC-7 / TC-178-05 / BR-2 | DEDUP-001, DEDUP-002, FE2-004 |
| AC-8 / TC-178-06 | BULK-002, BULK-006, FE2-006, FE2-007 |
| AC-9 / TC-178-08 / BR-2 | DEDUP-001, DEDUP-002, FE2-005 |
| AC-10 / BR-4 | FE1-005, FE2-006, BULK-006 |
| AC-11 / TC-178-09 / BR-5 | DISTINCT-001, DISTINCT-002, DISTINCT-003, FE1STATE-003 |
| AC-12 / TC-178-10 / BR-11 | ORDER-001, ORDER-002, ORDER-003, FE1STATE-004 |
| AC-13 / TC-178-11 / BR-11 | TIMEOUT-001, TIMEOUT-002, TIMEOUT-003, TIMEOUT-004, FE1STATE-005 |
| AC-14 / TC-178-12 | DISTINCT-006, FE1STATE-002 |
| AC-15 / TC-178-13 / BR-3 | BULK-003, BULK-004, BULK-005, BULK-012 |
| AC-16 | GUARD-001, GUARD-002, GUARD-006, GUARD-007 |
| AC-17 / TC-178-14 / BR-6 | GUARD-003, GUARD-004, GUARD-008, GUARD-009, FE2-003 |
| AC-18 | GUARD-004, GUARD-009（僅 API 層確認；頁面層存取權沿用 F075/F076 既有套件，不重複造測，見「殘留風險」§B） |
| BR-7（Feature Flag gating） | GUARD-005, GUARD-010 |
| BR-8（不取代逐筆新增） | FEREG-002 |
| BR-10（欄位名安全） | SAFE-001, SAFE-002, SAFE-003, SAFE-004 |
| BR-13（稽核彙總） | AUDIT-001, AUDIT-002, AUDIT-003 |
| I-DVAL-SAFE-INTERP-01 | SAFE-001, SAFE-002, SAFE-003, SAFE-004 |
| I-DVAL-READY-BEFORE-EXIST-01 | ORDER-001, ORDER-002 |
| I-DVAL-SCAN-BOUND-01 | DISTINCT-001, TIMEOUT-001 |
| I-DVAL-NO-SAMPLE-01 | DISTINCT-007 |
| I-DVAL-TIMEOUT-EXPLICIT-01 | TIMEOUT-001~004, ORDER-001, ORDER-003 |
| I-DVAL-BULK-TX-01 | BULK-014 |
| I-DVAL-AUDIT-SUMMARY-01 | AUDIT-001, AUDIT-002 |
| I-DVAL-GUARD-PARITY-01 | GUARD-001~011, ROUTE-001~003 |

---

## 一、SRC — 來源表解析（`_resolveDistinctValueSource`）

> **設計依據**：AD §3.2；spec §5.1 步驟 1；BR-12。

### TS-F112-SRC-001：白名單既存欄位、`data_source='ob_pool_data'` → 查 `ob_pool_data`
- **關聯**：AC-6 / BR-12
- **類型**：Positive / Unit（mock `fieldRepo.findOne`）
- **前置**：mock 白名單回傳 `{column_name:'prod_kind', field_type:'categorical', dataSource:'ob_pool_data'}`
- **步驟**：呼叫 `getDistinctValues('prod_kind')`
- **預期**：`_resolveDistinctValueSource` 回傳 `{table:'ob_pool_data'}`；後續 DISTINCT 查詢 SQL 字串含 `FROM ob_pool_data`

---

### TS-F112-SRC-002：白名單既存欄位、`data_source='customer_core'` → 查 `customer_core`
- **關聯**：AC-6 / TC-178-07 / BR-12
- **類型**：Positive / Unit
- **前置**：mock 白名單回傳 `{column_name:'occupation_desc', field_type:'categorical', dataSource:'customer_core'}`
- **步驟**：呼叫 `getDistinctValues('occupation_desc')`
- **預期**：回傳 `{table:'customer_core'}`；DISTINCT SQL 字串含 `FROM customer_core`（非 `ob_pool_data`）；回應 `dataSource:'customer_core'`

---

### TS-F112-SRC-003：欄位不存在於白名單（進入點 1）→ 固定 `ob_pool_data`，全部 `alreadyOption=false`
- **關聯**：AC-1 / BR-12
- **類型**：Positive / Unit
- **前置**：mock `fieldRepo.findOne` 回傳 `null`（欄位尚未列入白名單）
- **步驟**：呼叫 `getDistinctValues('risk_level')`
- **預期**：`{table:'ob_pool_data'}`；不因白名單不存在而拋錯；回應中每個 distinct 值之 `alreadyOption` 皆為 `false`（無論 `pooldata_field_option` 表中是否有其他欄位之選項殘留，皆與此欄位無關）

---

### TS-F112-SRC-004：欄位存在於白名單但 `field_type != 'categorical'` → 400，重用既有錯誤碼
- **關聯**：AC-2 / BR-1
- **類型**：Negative / Unit
- **前置**：mock 白名單回傳 `{column_name:'settle_src', field_type:'numeric', dataSource:'ob_pool_data'}`
- **步驟**：呼叫 `getDistinctValues('settle_src')`
- **預期**：拋出 400，`error === 'POOLDATA_OPTION_FIELD_TYPE_INVALID'`（**不是**新錯誤碼，沿用 F076 既有碼；spec §9 交叉參照已列為「沿用」）；`dataSource.query` 從未被呼叫（未走到 DISTINCT 查詢分支）

---

### TS-F112-SRC-005：來源解析不過濾 `is_active`（`assertCategorical` 語意不共用）
- **關聯**：AD §3.2「不論 is_active」
- **類型**：Positive / Unit
- **前置**：mock 白名單回傳之欄位 `is_active=false`（欄位已被停用）但 `field_type='categorical'`
- **步驟**：呼叫 `getDistinctValues(...)`
- **預期**：正常解析出 table，**不**因 `is_active=false` 而拋 404（`_resolveDistinctValueSource` 刻意不呼叫 `assertCategorical()`，兩者語意不同，見 AD §3.2 末段說明）

---

## 二、ORDER — 就緒優先於存在性（I-DVAL-READY-BEFORE-EXIST-01）

> **設計依據**：AD §3「執行順序之關鍵修正」——**本文件核心紅線群組**。spec §5.1 條列順序（步驟3欄位存在性在前、步驟4表就緒在後）與 AD 裁定順序相反，AD 裁定為權威。

### TS-F112-ORDER-001：⚠️【紅線】來源表不存在 + 欄位確實不存在於該表 → 必須回 503，不可誤判為 404
- **關聯**：AC-12 / I-DVAL-READY-BEFORE-EXIST-01
- **類型**：Positive / Unit（**regression guard，防止未來重構調換兩檢查順序**）
- **前置**：mock `_checkTableExists` 回 `false`（模擬 `customer_core` 表尚未由 ETL 建立）；此情境下 `_checkColumnExists` 若真的被呼叫也必然回 `false`（因為表不存在，`INFORMATION_SCHEMA.COLUMNS` 對不存在的表天然回 0 列）
- **步驟**：呼叫 `getDistinctValues('occupation_desc')`（白名單解析出 `table='customer_core'`）
- **預期**：拋出 **503** `CUSTOMER_CORE_NOT_READY`；**不得**為 404 `SOURCE_COLUMN_NOT_FOUND`；`_checkColumnExists` **從未被呼叫**（短路，證明就緒檢查確實先執行且提前 return）

---

### TS-F112-ORDER-002：對照組 — 來源表存在但欄位確實不存在 → 404（就緒檢查通過後才進入欄位檢查）
- **關聯**：AC-12（對照，證明兩檢查邏輯獨立且皆正確運作，非永遠回 503）
- **類型**：Positive / Unit
- **前置**：mock `_checkTableExists` 回 `true`；mock `_checkColumnExists` 回 `false`
- **步驟**：呼叫 `getDistinctValues('nonexistent_col')`
- **預期**：拋出 **404** `SOURCE_COLUMN_NOT_FOUND`（僅在表就緒之後，欄位確實不存在才回 404，與 ORDER-001 形成明確對照）

---

### TS-F112-ORDER-003：`ob_pool_data` 未就緒 → `OBPOOLDATA_NOT_READY`；`customer_core` 未就緒 → `CUSTOMER_CORE_NOT_READY`（碼依來源表區分）
- **關聯**：AC-12 / spec §5.1 錯誤碼表
- **類型**：Positive / Unit
- **前置**：分別以 `table='ob_pool_data'`／`table='customer_core'` 且 `_checkTableExists` 皆回 `false` 執行
- **步驟**：各呼叫一次 `getDistinctValues`
- **預期**：`ob_pool_data` 情境 → 503 `OBPOOLDATA_NOT_READY`（沿用既有碼）；`customer_core` 情境 → 503 `CUSTOMER_CORE_NOT_READY`（新碼）；兩者皆為 `ServiceUnavailableException`，HTTP 503

---

## 三、SAFE — 欄位名稱安全驗證（I-DVAL-SAFE-INTERP-01）

> **設計依據**：AD §3.3/§3.4；BR-10。`columnName` 為 SQL 識別字不可參數化，正則檢查為第一道防線，且是 `getDistinctValues` 函式的**第一行**（先於白名單查詢）。

### TS-F112-SAFE-001：`columnName` 不符 `SAFE_COLUMN_NAME_RE` → 400，且無任何 DB 呼叫發生
- **關聯**：BR-10 / I-DVAL-SAFE-INTERP-01
- **類型**：Negative / Unit
- **前置**：`columnName = 'Risk-Level'`（含大寫、連字號，不符 `^[a-z][a-z0-9_]{0,63}$`）
- **步驟**：呼叫 `getDistinctValues('Risk-Level')`
- **預期**：拋出 400 `SOURCE_COLUMN_NAME_INVALID`；**斷言 `fieldRepo.findOne` 與 `dataSource.query` 皆從未被呼叫**（正則檢查是函式第一行，先於白名單解析，AD §3.4 程式碼順序）

---

### TS-F112-SAFE-002：SQL injection 嘗試（`a; drop table ob_pool_data;--`）被正則拒絕，不進入任何查詢建構
- **關聯**：BR-10 / 安全性
- **類型**：Negative / Unit（Adversarial）
- **前置**：`columnName = 'a; drop table ob_pool_data;--'`
- **步驟**：呼叫 `getDistinctValues(...)`
- **預期**：因含空白/分號等非法字元，正則測試失敗 → 400 `SOURCE_COLUMN_NAME_INVALID`；不產生任何 SQL 字串、`dataSource.query` 未被呼叫（與 SAFE-001 同一斷言手法，此案例明確標註「adversarial」以證明防線對惡意輸入同樣有效，非僅對合法但格式不對的輸入有效）

---

### TS-F112-SAFE-003：`columnName` 符合正則、但不存在於 INFORMATION_SCHEMA（來源表已就緒）→ 404
- **關聯**：BR-10 / AC-12（對照，非未就緒）
- **類型**：Negative / Unit
- **前置**：`columnName = 'nonexistent_col'`（合法格式）；`_checkTableExists` 回 `true`；`_checkColumnExists` 回 `false`
- **步驟**：呼叫 `getDistinctValues('nonexistent_col')`
- **預期**：404 `SOURCE_COLUMN_NOT_FOUND`（與 ORDER-002 為同一案例之不同切角，此處聚焦於「正則通過但仍非安全通行證」之語意）

---

### TS-F112-SAFE-004：合法欄位名稱（含底線與數字，如 `monthly_income_desc`）通過正則與存在性檢查，正常進入 DISTINCT 查詢
- **關聯**：BR-10（正向控制組，避免正則過嚴誤傷合法欄名）
- **類型**：Positive / Unit
- **前置**：`columnName = 'monthly_income_desc'`；表就緒、欄位存在
- **步驟**：呼叫 `getDistinctValues('monthly_income_desc')`
- **預期**：不拋任何 400/404；正常執行至 DISTINCT 查詢分支（`_runDistinctQuery` 被呼叫，`columnName` 被安全內插進 SQL 字串）

---

## 四、DISTINCT — DISTINCT 查詢 + cap/truncation/NULL/排序/空狀態

> **設計依據**：AD §3.4/§3.5；spec §5.1 步驟 5~7；BR-5。

### TS-F112-DISTINCT-001：MSSQL 方言 → SQL 含 `TOP (201)` 與方括號欄名；SQLite/mock 方言 → SQL 含 `LIMIT 201`（CAP=200 預設）
- **關聯**：AC-11 / spec §5.1 步驟 5
- **類型**：Positive / Unit（SQL-shape assertion，非對真實 DB 執行）
- **前置**：分別 mock `dataSource.options.type = 'mssql'` 與非 `'mssql'`
- **步驟**：呼叫 `_runDistinctQuery('ob_pool_data', 'prod_kind')`（或透過 `getDistinctValues` 間接觸發），擷取傳入 `dataSource.query` 的 SQL 字串
- **預期**：MSSQL 分支 SQL 含 `SELECT DISTINCT TOP (201) [prod_kind] AS v FROM ob_pool_data WHERE [prod_kind] IS NOT NULL ORDER BY [prod_kind]`；非 MSSQL 分支含 `SELECT DISTINCT "prod_kind" AS v FROM ob_pool_data WHERE "prod_kind" IS NOT NULL ORDER BY "prod_kind" LIMIT 201`（`201 = DISTINCT_VALUES_CAP(200) + 1`）

---

### TS-F112-DISTINCT-002：distinct 筆數 ≤ CAP（如 55 筆）→ `truncated=false`，全數回傳，`totalReturned=55`
- **關聯**：AC-11（對照組，非超量情境）
- **類型**：Positive / Unit
- **前置**：mock 查詢回傳 55 筆 distinct 值（模擬 `occupation_desc`）
- **步驟**：呼叫 `getDistinctValues('occupation_desc')`
- **預期**：`values.length===55`；`truncated===false`；`totalReturned===55`；`cap===200`

---

### TS-F112-DISTINCT-003：distinct 筆數 = CAP+1（探測列）與 CAP+5（明顯超量）→ 皆 `truncated=true`，`values.length===CAP`，探測列被丟棄
- **關聯**：AC-11 / TC-178-09 / BR-5
- **類型**：Boundary / Unit
- **前置**：分別 mock 查詢回傳 201 筆與 205 筆
- **步驟**：各呼叫一次 `getDistinctValues`
- **預期**：兩情境皆 `truncated===true`；`values.length===200`（非 201 或 205，探測用的第 201+ 列已被 `.slice(0, CAP)` 丟棄）；`totalReturned===200`（非實際回傳列數）

---

### TS-F112-DISTINCT-004：NULL 值排除（`WHERE ... IS NOT NULL`），不出現於結果
- **關聯**：spec §5.1 步驟 5 / AC-14 語意基礎
- **類型**：Positive / Unit
- **前置**：mock 查詢 SQL 已含 `IS NOT NULL`（由 DISTINCT-001 之 SQL-shape 斷言涵蓋 SQL 文字本身）；此案例聚焦於「driver 回傳結果中若混入 `null`/`undefined` 元素」之防禦性行為
- **步驟**：mock `dataSource.query` 回傳陣列中混入一筆 `{v: null}`（模擬異常 driver 行為）
- **預期**：`String(null)` 之防呆行為以程式碼實作面向決定；本案例最低驗收標準為「正常路徑不因此拋未捕捉例外」（若 tdd-implementation 需要額外過濾，屬實作細節，非本測試強制斷言值）

---

### TS-F112-DISTINCT-005：結果依 `ORDER BY` 遞增排序回傳
- **關聯**：spec §5.1 步驟 5（`ORDER BY [col]`）
- **類型**：Positive / Unit
- **前置**：mock 查詢回傳已排序陣列（`['一般', '個人', '法人']` 依 SQL ORDER BY 語意）
- **步驟**：呼叫 `getDistinctValues(...)`
- **預期**：回應 `values[]` 保持 mock 回傳之順序（service 層不重新排序，排序責任在 SQL `ORDER BY`，由 DISTINCT-001 之 SQL-shape 斷言確保 SQL 文字含 `ORDER BY`）

---

### TS-F112-DISTINCT-006：欄位全 NULL / 無任何非 NULL 值 → 200，`values:[]`，`totalReturned:0`，`truncated:false`（與 503/500 錯誤路徑明確區隔）
- **關聯**：AC-14 / TC-178-12
- **類型**：Positive / Unit（**與 ORDER/TIMEOUT 群組之錯誤路徑走完全不同分支，避免混淆為查詢失敗**）
- **前置**：`_checkTableExists` 回 `true`、`_checkColumnExists` 回 `true`、mock DISTINCT 查詢回傳 `[]`
- **步驟**：呼叫 `getDistinctValues(...)`
- **預期**：HTTP 200；`values.length===0`；`totalReturned===0`；`truncated===false`；**不拋任何例外**（與 ORDER-001/003 的 503、TIMEOUT-001 的 500 路徑在程式碼分支上完全獨立）

---

### TS-F112-DISTINCT-007：靜態 regression — DISTINCT 查詢 SQL 不含 `TABLESAMPLE`（I-DVAL-NO-SAMPLE-01）
- **關聯**：AD §3.5「精確 DISTINCT vs 抽樣」裁定 / I-DVAL-NO-SAMPLE-01
- **類型**：Positive / Unit（靜態掃描，比照 F109 NULLEXC-006 之 `COALESCE` 靜態掃描手法）
- **步驟**：讀取 `_runDistinctQuery` 原始碼或擷取其產出之 SQL 字串；正則掃描 `TABLESAMPLE` 關鍵字
- **預期**：無匹配（防止未來重構誤將 `getDistinctValues` 改接 `sampling-estimator.ts` 之 TABLESAMPLE 路徑，破壞「完整性優先於延遲」之產品語意——AD §3.5 明文本端點的存在理由與抽樣完全相斥）

---

## 五、TIMEOUT — app-level 逾時（I-DVAL-SCAN-BOUND-01 / I-DVAL-TIMEOUT-EXPLICIT-01）

> **設計依據**：AD §3.5（核心裁定）/ §3.6。**本群組之 HTTP 500（非 504）為本文件最關鍵之 regression guard 之一**。

### TS-F112-TIMEOUT-001：查詢執行時間超過 `DISTINCT_VALUES_TIMEOUT_MS` → `Promise.race` 逾時分支勝出，拋出 500 `DISTINCT_VALUES_QUERY_TIMEOUT`
- **關聯**：AC-13 / TC-178-11 / I-DVAL-SCAN-BOUND-01
- **類型**：Negative / Unit
- **前置**：測試注入極小 `DISTINCT_VALUES_TIMEOUT_MS`（如 1ms，比照 AD §8 建議之 F049 `timeoutMs=0` 慣例）；mock 查詢 promise 故意延遲 resolve（如 50ms 後才 resolve，確保逾時分支必然先觸發）
- **步驟**：呼叫 `getDistinctValues(...)`
- **預期**：`InternalServerErrorException` 拋出，`error==='DISTINCT_VALUES_QUERY_TIMEOUT'`；**不等待真實 15s**（測試執行時間應在毫秒等級完成）

---

### TS-F112-TIMEOUT-002：⚠️【紅線】HTTP status 必為 500，明確斷言非 504
- **關聯**：AC-13 / AD §3.6 裁定 / regression guard
- **類型**：Negative / Unit（**防止 tdd-implementation 誤讀 spec 舊文字改用 504**）
- **步驟**：同 TIMEOUT-001，額外斷言 exception 類別
- **預期**：拋出的例外為 `InternalServerErrorException`（NestJS 對應 HTTP **500**）；**明確斷言非** `GatewayTimeoutException`／HTTP 504（全域搜尋本專案程式碼庫應無任何 504 使用前例，此為額外的程式碼庫級 regression 掃描建議，非僅端點級斷言）

---

### TS-F112-TIMEOUT-003：查詢過程拋出非預期例外（如真實 SQL 語法錯誤）→ 同樣收斂為 500 `DISTINCT_VALUES_QUERY_TIMEOUT`，不外洩原始錯誤訊息
- **關聯**：AD §3.5「忠實比照 `Stage0EstimateService.estimateListCount` 既有 catch 語意」
- **類型**：Negative / Unit
- **前置**：mock 查詢 promise reject 一個非 `InternalServerErrorException` 的普通 `Error('syntax error near ...')`
- **步驟**：呼叫 `getDistinctValues(...)`
- **預期**：最終拋出仍為 `InternalServerErrorException` + `error==='DISTINCT_VALUES_QUERY_TIMEOUT'`（**不是**原始 `Error` 訊息透傳）；前端不會看到 `syntax error near ...` 字樣（防止內部錯誤細節外洩）

---

### TS-F112-TIMEOUT-004：逾時／任何查詢例外，永不吞為 200 空清單
- **關聯**：AC-13 / BR-11 / I-DVAL-TIMEOUT-EXPLICIT-01
- **類型**：Negative / Unit（regression，呼應 AC-14 之對照）
- **步驟**：同 TIMEOUT-001/003 情境
- **預期**：無論逾時或例外，回應皆為拋出之例外物件（500），**絕不**回傳 `{values:[], totalReturned:0, truncated:false}`（該回應形狀專屬於 DISTINCT-006 之合法空狀態，兩者程式碼路徑必須明確分岔，不可共用同一 catch 分支意外吞掉例外）

---

## 六、DEDUP — `alreadyOption` 去重（BR-2）

> **設計依據**：AD §3.4 步驟 7；spec §5.1 步驟 7；BR-2「含已停用」。

### TS-F112-DEDUP-001：既有 ACTIVE 可選值 → 對應 distinct 值標註 `alreadyOption=true`
- **關聯**：AC-7 / AC-9
- **類型**：Positive / Unit
- **前置**：mock `optionRepo.find` 回傳 `[{option_value:'醫師'}]`（`is_active` 未過濾，查詢本身不加 `WHERE is_active`）；distinct 值含 `['工程師','醫師','教師']`
- **步驟**：呼叫 `getDistinctValues('occupation_desc')`
- **預期**：`醫師` 對應項 `alreadyOption===true`；`工程師`/`教師` 為 `false`

---

### TS-F112-DEDUP-002：既有 INACTIVE 可選值仍標註 `alreadyOption=true`（BR-2「含已停用」核心斷言）
- **關聯**：AC-7 第 1 句「不論啟用或停用」/ BR-2
- **類型**：Positive / Unit（**核心紅線，防止誤加 `is_active=true` filter**）
- **前置**：mock `optionRepo.find` 查詢**不帶** `is_active` 條件，回傳含 1 筆 `is_active=false` 之既有選項 `{option_value:'教師', is_active:false}`
- **步驟**：呼叫 `getDistinctValues('occupation_desc')`
- **預期**：`教師` 對應項 `alreadyOption===true`（即使該選項已停用亦視為「已存在」而排除於候選清單外）；額外斷言 `optionRepo.find` 呼叫參數中**不含** `is_active` 篩選條件（regression guard，防止未來重構誤加 active-only filter 而破壞 BR-2）

---

### TS-F112-DEDUP-003：進入點 1（欄位不存在於白名單）→ 全部 `alreadyOption=false`，不受其他無關欄位既有選項影響
- **關聯**：AC-1 第 4 句
- **類型**：Positive / Unit
- **前置**：`fieldRepo.findOne` 回傳 `null`；`optionRepo.find({where:{column_name:'risk_level'}})` 回傳 `[]`（新欄位，尚無任何選項）
- **步驟**：呼叫 `getDistinctValues('risk_level')`
- **預期**：全部候選值 `alreadyOption===false`（與 SRC-003 為同一情境的不同驗證切角：SRC-003 聚焦來源表解析，DEDUP-003 聚焦 `alreadyOption` 計算）

---

## 七、BULK — `options/bulk` 交易設計（I-DVAL-BULK-TX-01）

> **設計依據**：AD §3.7/§3.11；spec §5.2。

### TS-F112-BULK-001：整批操作包在單一 DB transaction 內
- **關聯**：BR-3 / I-DVAL-BULK-TX-01
- **類型**：Positive / Unit
- **前置**：mock `optionRepo.manager.transaction`
- **步驟**：呼叫 `createOptionsBulk('occupation_desc', [{optionValue:'工程師',optionLabel:'工程師'}], actor)`
- **預期**：`manager.transaction` 恰好被呼叫 1 次，包住既有值查詢、`maxOrder` 推導、INSERT 三步驟

---

### TS-F112-BULK-002：`display_order` 為現有 max+1，依輸入順序遞增
- **關聯**：AC-8 / AC-10
- **類型**：Positive / Unit
- **前置**：既有選項 `max(display_order)=3`；輸入 `options=[{optionValue:'A',...},{optionValue:'B',...}]`（皆為新值）
- **步驟**：呼叫 `createOptionsBulk(...)`
- **預期**：`A.display_order===4`；`B.display_order===5`（依輸入陣列順序遞增，非依 `optionValue` 字母排序）

---

### TS-F112-BULK-003：既有 ACTIVE 值 → 略過，不報錯，不回 409，不修改既有紀錄
- **關聯**：AC-15 / BR-3
- **類型**：Boundary / Unit（**與 F076 單筆 `createOption` 之 409 行為刻意分歧**）
- **前置**：既有選項 `{option_value:'醫師', is_active:true, option_label:'醫師'}`；輸入 `options` 含 `{optionValue:'醫師', optionLabel:'醫生'}`（同值不同 label）
- **步驟**：呼叫 `createOptionsBulk(...)`
- **預期**：不拋 409；`skippedCount` 對此值 +1；DB 中既有紀錄 `option_label` 仍為 `'醫師'`（**不被** `optionLabel:'醫生'` 覆寫，BR-3「維持既有紀錄不變」）

---

### TS-F112-BULK-004：既有 INACTIVE 值 → 略過，不重新啟用（不觸發 reactivate 語意）
- **關聯**：AC-15 / BR-3「既有 inactive 亦不改動」
- **類型**：Boundary / Unit
- **前置**：既有選項 `{option_value:'教師', is_active:false}`；輸入含 `{optionValue:'教師', optionLabel:'教師'}`
- **步驟**：呼叫 `createOptionsBulk(...)`
- **預期**：`skippedCount` +1；DB 中該紀錄 `is_active` 仍為 `false`（**不被** bulk 端點意外重啟；重新啟用需走既有 F076 `PATCH :optionValue` 端點，非本功能職責）

---

### TS-F112-BULK-005：批次內重複值 → 首次出現者建立，其餘略過
- **關聯**：AC-15 / BR-3「批次內重複亦略過，首次為準」
- **類型**：Boundary / Unit
- **前置**：輸入 `options=[{optionValue:'X',optionLabel:'第一個'},{optionValue:'X',optionLabel:'第二個'}]`（DB 中無既有 `'X'`）
- **步驟**：呼叫 `createOptionsBulk(...)`
- **預期**：`createdCount===1`；`skippedCount===1`；新建紀錄 `option_label==='第一個'`（首次出現者為準，第二筆 `'第二個'` 被略過）

---

### TS-F112-BULK-006：回應形狀 `{columnName, createdCount, skippedCount, options}` 正確，`options[]` 僅含實際新增項且依 `display_order` 遞增
- **關聯**：AC-8 / AC-10 / spec §5.2 Response
- **類型**：Positive / Unit
- **前置**：輸入 2 新值 + 1 既有值（3 筆輸入）
- **步驟**：呼叫 `createOptionsBulk(...)`
- **預期**：`createdCount===2`；`skippedCount===1`；`options.length===2`（**不含**被略過的既有值）；每筆含 `{optionValue, optionLabel, isActive:true}`；`optionValue===optionLabel`（承接前端組裝的預設值，AC-10）

---

### TS-F112-BULK-007：欄位不存在於白名單 → 404 `POOLDATA_FIELD_NOT_FOUND`（tx 外，事先攔截）
- **關聯**：spec §5.2 錯誤碼表
- **類型**：Negative / Unit
- **前置**：mock `assertCategorical` 對不存在欄位拋 404
- **步驟**：呼叫 `createOptionsBulk('nonexistent_col', [...], actor)`
- **預期**：拋出 404 `POOLDATA_FIELD_NOT_FOUND`；`optionRepo.manager.transaction` **從未被呼叫**（守門發生在 tx 開啟之前，AD §3.7 註解「tx 外，與 createOption 既有呼叫順序一致」）

---

### TS-F112-BULK-008：欄位存在但非 categorical → 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`（tx 外）
- **關聯**：spec §5.2 錯誤碼表
- **類型**：Negative / Unit
- **前置**：mock `assertCategorical` 對非 categorical 欄位拋 400
- **步驟**：呼叫 `createOptionsBulk('date_of_birth', [...], actor)`
- **預期**：拋出 400 `POOLDATA_OPTION_FIELD_TYPE_INVALID`；transaction 未開啟

---

### TS-F112-BULK-009：`options` 空陣列 → 422 `VALIDATION_ERROR`（`ArrayMinSize(1)`）
- **關聯**：spec §5.2 DTO 驗證規則
- **類型**：Negative / Unit（DTO 層，class-validator）
- **前置**：Request body `{options: []}`
- **步驟**：DTO 驗證
- **預期**：422 `VALIDATION_ERROR`（全域 filter 既有邏輯將 class-validator 400 陣列格式重映為 422，無需額外程式碼）

---

### TS-F112-BULK-010：`options.length > DISTINCT_VALUES_CAP`（201 筆）→ 422 `VALIDATION_ERROR`（`ArrayMaxSize`）
- **關聯**：spec §5.2 DTO 驗證規則 / AD §3.11「與 GET 端點回傳上限恆一致」
- **類型**：Boundary / Unit
- **前置**：Request body `options` 含 201 筆
- **步驟**：DTO 驗證
- **預期**：422 `VALIDATION_ERROR`；**額外斷言** `ArrayMaxSize` 之上限值與 `DISTINCT_VALUES_CAP` 為同一常數 import（非各自寫死 `200` 字面量），確保未來 env 覆寫 `POOLDATA_DISTINCT_VALUES_CAP` 時 GET/POST 兩端點上限恆一致

---

### TS-F112-BULK-011：`optionValue` 超過 64 字元 / `optionLabel` 超過 100 字元 → 422 `VALIDATION_ERROR`
- **關聯**：spec §5.2 DTO 驗證規則（對齊 entity VARCHAR 長度）
- **類型**：Boundary / Unit
- **前置**：`optionValue` 長度 65；另一案例 `optionLabel` 長度 101
- **步驟**：DTO 驗證
- **預期**：兩案例皆 422 `VALIDATION_ERROR`

---

### TS-F112-BULK-012：全部候選值皆略過（`createdCount=0`）→ 仍回 200 OK，非錯誤
- **關聯**：AC-15 第 2 句
- **類型**：Boundary / Unit
- **前置**：輸入 `options` 全部為既有值
- **步驟**：呼叫 `createOptionsBulk(...)`
- **預期**：HTTP 200；`createdCount===0`；`skippedCount===options.length`；`options:[]`；**不拋任何例外**；`manager.save` 對空陣列**不被呼叫**（AD §3.7「避免對空陣列呼叫 save 產生的無謂 round-trip」，可作為次要斷言）

---

### TS-F112-BULK-013：交易原子性 — 迴圈中途 DB 寫入失敗 → 整批 rollback，無部分寫入
- **關聯**：spec §10 後端關鍵測試案例
- **類型**：Negative / Unit
- **前置**：mock `manager.save` 對第 2 次呼叫（或迴圈中途）拋出 DB 錯誤
- **步驟**：呼叫 `createOptionsBulk(...)`（含 3 筆新值）
- **預期**：整個 `createOptionsBulk` 呼叫拋出例外；DB 查詢驗證（或 mock 斷言）確認**無任何一筆**已寫入（transaction rollback，非部分成功）

---

### TS-F112-BULK-014：既有值判定與 `maxOrder` 推導共用同一次 `manager.find` 查詢（I-DVAL-BULK-TX-01）
- **關聯**：I-DVAL-BULK-TX-01（不得對每個候選值各自查詢一次）
- **類型**：Positive / Unit（效能/正確性 regression guard）
- **前置**：輸入 `options` 含 10 筆候選值
- **步驟**：呼叫 `createOptionsBulk(...)`，監控 `manager.find(PooldataFieldOption, ...)` 呼叫次數
- **預期**：`manager.find` 恰好被呼叫 **1 次**（不因候選值筆數增加而線性增加查詢次數；`existingValues` Set 與 `maxOrder` 皆由這唯一一次查詢結果推導）

---

## 八、AUDIT — 稽核彙總單筆（I-DVAL-AUDIT-SUMMARY-01）

> **設計依據**：AD §3.8；BR-13。

### TS-F112-AUDIT-001：⚠️【紅線】一次 bulk 呼叫（N 筆新增）僅寫入 `assignment_audit_log` **恰好 1 筆**（非 N 筆）
- **關聯**：BR-13 / I-DVAL-AUDIT-SUMMARY-01
- **類型**：Positive / Unit
- **前置**：輸入 3 筆全新候選值
- **步驟**：呼叫 `createOptionsBulk(...)`，統計 `auditRepo.save` 呼叫次數
- **預期**：`auditRepo.save` 恰好被呼叫 **1 次**（**不是** 3 次；逐筆各寫一筆為明確禁止行為，AD §3.8/§7）

---

### TS-F112-AUDIT-002：`entity_id === columnName`（不含 `.optionValue` 後綴），與既有單筆 `_writeAudit` 之組成方式不同
- **關聯**：BR-13
- **類型**：Positive / Unit
- **步驟**：檢視 AUDIT-001 案例中寫入之稽核紀錄
- **預期**：`entity_type==='pooldata_field_option'`；`entity_id==='occupation_desc'`（**不是** `'occupation_desc.工程師'`，與既有 `_writeAudit` 單筆情境之 `${columnName}.${optionValue}` 組成方式刻意不同）；`action==='CREATE'`

---

### TS-F112-AUDIT-003：`after_value` 內容正確（`createdValues`/`createdCount`/`skippedCount`/`source`），`before_value` 為 null
- **關聯**：BR-13 / Glossary「details→after_value」
- **類型**：Positive / Unit
- **前置**：3 筆輸入，2 筆新建 1 筆略過
- **步驟**：檢視寫入之稽核紀錄
- **預期**：`before_value===null`；`after_value.createdValues` 為長度 2 的陣列（僅含實際新建之 `option_value`）；`after_value.createdCount===2`；`after_value.skippedCount===1`；`after_value.source==='bulk_auto_suggest'`；**斷言寫入目標為既有 `after_value` 欄位，非新增 `details` 欄位**（regression guard，防止 tdd-implementation 誤讀 spec 舊文字新增 entity 欄位）

---

### TS-F112-AUDIT-004：稽核寫入失敗不 rollback 已提交的可選值（BR-7 沿用）
- **關聯**：AD §3.8「稽核失敗不 rollback」
- **類型**：Negative / Unit
- **前置**：mock `auditRepo.save` 拋出例外；DB 選項寫入（tx 內）已成功 commit
- **步驟**：呼叫 `createOptionsBulk(...)`
- **預期**：`_writeBulkAudit` 內部 catch 吞掉例外（不向上拋出）；`createOptionsBulk` 整體呼叫仍正常回傳 `{createdCount, skippedCount, options}`（HTTP 200）；已寫入的可選值紀錄**不被回滾**

---

### TS-F112-AUDIT-005：既有單筆 `_writeAudit` 簽名與行為不受影響（regression）
- **關聯**：AD §3.8「不修改既有 `_writeAudit` 簽名」
- **類型**：Regression / Unit
- **步驟**：對既有 F076 單筆 `createOption` 執行既有測試套件（或等價斷言：`_writeAudit(actor, action, columnName, optionValue, before, after)` 簽名參數個數與型別不變）
- **預期**：既有單筆新增之稽核行為（`entity_id = columnName.optionValue`）與呼叫點完全不受 `_writeBulkAudit` 新增影響

---

## 九、GUARD — RBAC + Feature Flag 一致性（I-DVAL-GUARD-PARITY-01）

> **設計依據**：AD §3.10；本文件「Glossary」表已查證之實際錯誤碼。**兩個 controller 之 guard 堆疊為 `AuthGuard → FeatureFlagGuard → DirectorOrSectionChiefGuard → DirectorGuard`（class 級）+ method 級 `@RequireDirector()` + `@RequireFeatureFlag(...)`**，故 Feature Flag 檢查發生在角色檢查之前。

### TS-F112-GUARD-001：部長（director）呼叫 `GET :columnName/distinct-values` → 200
- **關聯**：AC-16
- **類型**：Positive / Integration（Supertest 或 controller unit + guard mock）
- **前置**：JWT `businessRole='director'`；Feature Flag 開啟
- **步驟**：GET 請求
- **預期**：HTTP 200

---

### TS-F112-GUARD-002：Admin（`role='admin'`）呼叫 `GET :columnName/distinct-values` → 200
- **關聯**：AC-16
- **類型**：Positive / Integration
- **步驟**：同上，改用 admin JWT
- **預期**：HTTP 200（`DirectorGuard` 對 `role==='admin'` 之允許分支）

---

### TS-F112-GUARD-003：⚠️ 處長（section_chief）呼叫 `GET :columnName/distinct-values` → 403 `E07_REQUIRES_DIRECTOR`（**非** `AUTH_FORBIDDEN`）
- **關聯**：AC-17 / TC-178-14
- **類型**：Negative / Integration
- **前置**：JWT `businessRole='section_chief'`
- **步驟**：GET 請求
- **預期**：HTTP 403；`res.body.error === 'E07_REQUIRES_DIRECTOR'`（**斷言精確錯誤碼字串**，本文件已查證 `director.guard.ts` 原始碼，section_chief 通過 class 級 `DirectorOrSectionChiefGuard` 後在 method 級 `DirectorGuard` 被攔截）

---

### TS-F112-GUARD-004：無業務角色一般使用者呼叫 → 403 `E07_ROLE_NOT_ASSIGNED`（與 section_chief 之碼**不同**）
- **關聯**：AC-18
- **類型**：Negative / Integration
- **前置**：JWT 無 `businessRole`（或非 director/section_chief/admin 任一值）
- **步驟**：GET 請求
- **預期**：HTTP 403；`res.body.error === 'E07_ROLE_NOT_ASSIGNED'`（在 class 級 `DirectorOrSectionChiefGuard` 即被攔截，**比** section_chief 更早失敗，兩者錯誤碼與失敗層級皆不同，不可混用同一斷言）

---

### TS-F112-GUARD-005：Feature Flag 關閉時，即使是部長亦回 503 `FEATURE_NOT_ENABLED`（flag 檢查先於角色檢查）
- **關聯**：BR-7
- **類型**：Negative / Integration
- **前置**：JWT `businessRole='director'`；`ENABLE_E07_REFACTOR_PHASE3=false`
- **步驟**：GET 請求
- **預期**：HTTP 503 `FEATURE_NOT_ENABLED`（guard 陣列順序 `FeatureFlagGuard` 在 `DirectorOrSectionChiefGuard`/`DirectorGuard` 之前，即使角色合法仍被 flag 攔截，驗證 guard chain 順序）

---

### TS-F112-GUARD-006~010：`POST :columnName/options/bulk` 之 RBAC 鏡射（部長200 / Admin 200 / 處長403 E07_REQUIRES_DIRECTOR / 一般使用者403 E07_ROLE_NOT_ASSIGNED / flag off 503）
- **關聯**：AC-16 / AC-17 / BR-7 / I-DVAL-GUARD-PARITY-01
- **類型**：Positive+Negative / Integration
- **前置與步驟**：與 GUARD-001~005 完全鏡射，僅改為 `POST :columnName/options/bulk`（`options` body 給合法最小值 `[{optionValue:'X',optionLabel:'X'}]`）
- **預期**：五種角色/flag 組合之 HTTP status 與 `error` 碼與 GUARD-001~005 逐一對應相同（**I-DVAL-GUARD-PARITY-01 之直接斷言**：兩端點 guard 組合須逐字一致）

---

### TS-F112-GUARD-011：regression — 處長仍可正常呼叫既有純讀端點（`GET /pooldata-fields`、`GET .../options`），新端點的嚴格化不影響既有唯讀端點
- **關聯**：AD §3.10「這是驅動寫入流程的偵測查詢，而非單純資料展示查詢」
- **類型**：Regression / Integration
- **前置**：JWT `businessRole='section_chief'`
- **步驟**：分別呼叫既有 `listFields`（`GET /pooldata-fields`，無 method 級 `@RequireDirector()`）與 `listOptions`（`GET .../options`，同樣無 method 級 guard）
- **預期**：兩者皆 HTTP 200（class 級 `DirectorOrSectionChiefGuard` 允許 section_chief 通過，且這兩個既有端點**未**額外標 `@RequireDirector()`）；與 `distinct-values`／`options/bulk` 這兩個**新增**且**特意收緊**至部長專屬的端點形成對比，證明新端點的收緊未波及既有唯讀端點

---

## 十、ROUTE — 路由不遮蔽 regression（AD §9）

### TS-F112-ROUTE-001：新增 `:columnName/distinct-values` 後，既有 `GET available-columns` 仍正確路由（不被誤判為 `columnName='available-columns'`）
- **關聯**：AD §3.1 / 既有 TS-F075-E2E-008
- **類型**：Regression / Integration
- **步驟**：對既有 `TS-F075-E2E-008` 對應之測試套件重跑（或等價斷言：GET `/pooldata-fields/available-columns` 呼叫 `getAvailableColumns()`，非誤入 `getDistinctValues('available-columns')`）
- **預期**：既有測試維持綠燈，行為不變

---

### TS-F112-ROUTE-002：既有 `:columnName/active-options-count` 與新增 `:columnName/distinct-values` 為互不影響的兩段式靜態字面量，皆正確路由
- **關聯**：AD §3.1「兩段路徑，不受任何既有單段動態路由遮蔽」
- **類型**：Regression / Integration
- **步驟**：分別呼叫 `GET /pooldata-fields/prod_kind/active-options-count` 與 `GET /pooldata-fields/prod_kind/distinct-values`
- **預期**：各自導向對應的 controller method，互不遮蔽

---

### TS-F112-ROUTE-003：新增 `POST bulk` 不遮蔽既有 `POST /`（單筆新增）、`PATCH reorder`、`PATCH :optionValue/deactivate`、`PATCH :optionValue`
- **關聯**：AD §3.1「該 controller 無任何動態 POST 路由，不論註冊順序皆無遮蔽風險」
- **類型**：Regression / Integration
- **步驟**：對既有 F076 全部寫入端點（單筆新增、reorder、deactivate、reactivate）重跑既有測試套件
- **預期**：全數維持綠燈；額外驗證 `POST /pooldata-fields/:columnName/options/bulk` 與 `POST /pooldata-fields/:columnName/options`（單筆）各自導向正確 handler（HTTP method 相同但路徑字面量不同，NestJS 依完整路徑匹配，無 route param 衝突）

---

## 十一、FE1 — 進入點 1 核心流程（`fields-tab.tsx`）

> **設計依據**：spec §7.2；AC-1~5。UI 視覺細節以 `prototypes/37-base-code.html` 為準（本文件僅約束語意與呼叫順序）。

### TS-F112-FE1-001：選定類別型欄位 → 呼叫 `getDistinctValues`，渲染核取清單全選
- **關聯**：AC-1 / TC-178-01
- **類型**：Positive / Component（RTL）
- **前置**：mock `getDistinctValues` 回傳 `{values:[{value:'01',alreadyOption:false},{value:'02',alreadyOption:false}], totalReturned:2, truncated:false, cap:200}`
- **步驟**：於「新增篩選欄位」Modal 中，`field_type` 確定為 `categorical`（dropdown 選擇或 radio 切換）
- **預期**：`getDistinctValues` 被呼叫 1 次；畫面顯示核取清單，2 個選項皆為勾選狀態；顯示文字含「偵測到 2 個可選值，是否一併新增？」

---

### TS-F112-FE1-002：使用者可個別取消勾選候選值
- **關聯**：AC-3 / TC-178-03
- **類型**：Positive / Component
- **前置**：核取清單已顯示 5 個候選值，全選
- **步驟**：使用者點擊取消勾選其中 2 個
- **預期**：僅剩 3 個維持勾選狀態；欄位本身的建立流程（其他表單欄位）不受影響（不因取消勾選而重置或停用其他表單元件）

---

### TS-F112-FE1-003：全選／清除捷徑按鈕與即時計數
- **關聯**：任務指定 UI 語意（全選/清除/即時計數）
- **類型**：Positive / Component
- **步驟**：點擊「清除」→ 全部取消勾選；再點擊「全選」→ 全部恢復勾選
- **預期**：計數文字隨勾選數量即時更新（例如「已選 0 / 5」→「已選 5 / 5」）；**視覺呈現細節（按鈕樣式/位置）由 UI/UX Designer 依 prototype 決定，本測試僅驗證語意行為**

---

### TS-F112-FE1-004：選定數值型／日期型欄位 → 不顯示核取清單，且**不呼叫** `getDistinctValues`
- **關聯**：AC-2 / TC-178-02
- **類型**：Negative / Component
- **步驟**：`field_type` 確定為 `numeric` 或 `date`
- **預期**：`getDistinctValues` **從未被呼叫**（斷言 mock 呼叫次數為 0）；畫面不顯示任何核取清單；若先前因選 categorical 已顯示清單、之後切回 numeric/date，清單應隱藏或清除

---

### TS-F112-FE1-005：儲存時呼叫順序為 `createField` **先於** `createOptionsBulk`，且 bulk payload 之 `optionValue===optionLabel===`勾選值本身
- **關聯**：AC-5 / AC-10
- **類型**：Positive / Component
- **前置**：核取清單勾選 3 個值；mock `createField` 成功回傳新建欄位
- **步驟**：點擊「儲存」
- **預期**：`createField` 先被呼叫且 resolve 成功後，`createOptionsBulk` 才被呼叫（斷言呼叫順序，非僅呼叫次數）；`createOptionsBulk` 之 `options` 參數為 3 筆，每筆 `{optionValue: v, optionLabel: v}`（`v` 為勾選之 distinct 值本身，非任何轉換值）

---

### TS-F112-FE1-006：全部取消勾選後儲存 → 僅呼叫 `createField`，**不呼叫** `createOptionsBulk`
- **關聯**：AC-4 / TC-178-04
- **類型**：Negative / Component
- **前置**：核取清單全部取消勾選
- **步驟**：點擊「儲存」
- **預期**：`createField` 被呼叫且成功；`createOptionsBulk` **從未被呼叫**（勾選數為 0 時不觸發第二次呼叫，spec §5.3 步驟 2「若步驟1成功且核取清單有 ≥1 個勾選值」之反向分支）

---

### TS-F112-FE1-007：`createField` 成功、`createOptionsBulk` 失敗 → 顯示非阻斷警告，欄位建立結果仍視為成功
- **關聯**：AC-5 第 3 句 / BR-9
- **類型**：Negative / Component
- **前置**：mock `createField` 成功；mock `createOptionsBulk` reject
- **步驟**：點擊「儲存」（核取清單有勾選值）
- **預期**：畫面顯示非阻斷警告（例如 toast/banner：「欄位已建立，但可選值帶入失敗，請至『可選值管理』重試」）；**不**顯示整體儲存失敗訊息；Modal 關閉或欄位清單刷新以反映欄位已成功建立（欄位建立這件事本身不因 bulk 失敗而回滾，AD §3.9「categorical 欄位允許零可選值為合法穩態」）

---

## 十二、FE1STATE — 進入點 1 五態呈現（AC-9/11/12/13/14，BR-11）

> **設計依據**：spec §7.2；BR-11「禁止任何狀態以無提示空白清單呈現」。五態必須**各自獨立、互不混淆**。

### TS-F112-FE1STATE-001：loading 狀態 — `getDistinctValues` 呼叫期間顯示載入中提示
- **關聯**：spec §7.2
- **類型**：Positive / Component
- **步驟**：mock `getDistinctValues` 回傳一個 pending 中的 Promise
- **預期**：畫面顯示載入中指示（spinner/skeleton 等），非空白

---

### TS-F112-FE1STATE-002：空狀態（AC-14）— `values:[]` + `totalReturned:0` → 顯示「未偵測到任何可選值」，與錯誤狀態不同文案
- **關聯**：AC-14 / TC-178-12
- **類型**：Positive / Component
- **前置**：mock `getDistinctValues` resolve `{values:[], totalReturned:0, truncated:false, cap:200}`
- **步驟**：觸發偵測
- **預期**：畫面顯示「未偵測到任何可選值」；**不**顯示任何錯誤圖示或錯誤文案（與 FE1STATE-004/005 明確區隔）；使用者仍可正常完成欄位建立（儲存按鈕不因此被停用）

---

### TS-F112-FE1STATE-003：truncated 警告（AC-11）— `truncated:true` → 顯示「相異值數量過多」警告，區別於一般清單
- **關聯**：AC-11 / TC-178-09
- **類型**：Positive / Component
- **前置**：mock 回傳 `{values:[...200筆], totalReturned:200, truncated:true, cap:200}`
- **步驟**：觸發偵測
- **預期**：畫面顯示含「相異值數量過多」/「超過 200 筆」字樣之警告；使用者仍可選擇（a）取消偵測不帶入任何可選值，或（b）改走既有逐筆新增流程（畫面提供對應操作，非僅顯示警告文字後卡住）

---

### TS-F112-FE1STATE-004：503 未就緒錯誤（AC-12）— 顯示明確錯誤訊息，非空白
- **關聯**：AC-12 / TC-178-10
- **類型**：Negative / Component
- **前置**：mock `getDistinctValues` reject，`error.response.error==='OBPOOLDATA_NOT_READY'`
- **步驟**：觸發偵測
- **預期**：畫面顯示「來源資料尚未就緒，請稍後再試或聯繫系統管理員」等明確錯誤文案；**不**顯示空白核取清單（BR-11 核心斷言）

---

### TS-F112-FE1STATE-005：500 逾時錯誤（AC-13）— 顯示逾時專屬錯誤訊息 + 重試按鈕，文案與 503 不同
- **關聯**：AC-13 / TC-178-11
- **類型**：Negative / Component
- **前置**：mock `getDistinctValues` reject，`error.response.error==='DISTINCT_VALUES_QUERY_TIMEOUT'`
- **步驟**：觸發偵測
- **預期**：畫面顯示逾時專屬文案（**非**未就緒文案，前端依 `error` 代碼字串分流顯示邏輯，非依賴 HTTP status 數值，AD §6）；提供「重試」操作按鈕；點擊重試 → 重新呼叫 `getDistinctValues`

---

### TS-F112-FE1STATE-006：regression — 上述四種非「正常清單」狀態（空狀態／truncated／503／500）皆不得以「無文字之空白核取清單」呈現
- **關聯**：BR-11
- **類型**：Regression / Component
- **步驟**：逐一切換 FE1STATE-002~005 之 mock 情境
- **預期**：每個狀態畫面上皆存在對應的說明文字節點（非僅一個空的 `<ul>`/`<div>` 容器），四態彼此文案互不相同（可用於使用者辨識目前狀況）

---

## 十三、FE2 — 進入點 2 核心流程（`options-tab.tsx`）

> **設計依據**：spec §7.3；AC-6~9。

### TS-F112-FE2-001：categorical 欄位對部長顯示「從實際資料帶入可選值」按鈕
- **關聯**：AC-6
- **類型**：Positive / Component
- **前置**：登入身份為 director；當前欄位 `field_type==='categorical'`
- **步驟**：渲染 `options-tab.tsx`
- **預期**：`getByTestId('btn-import-options-{columnName}')` 存在

---

### TS-F112-FE2-002：numeric／date 欄位不顯示此按鈕
- **關聯**：AC-6 隱含範圍限制 / BR-1
- **類型**：Negative / Component
- **步驟**：切換至 `field_type==='numeric'` 欄位
- **預期**：`queryByTestId('btn-import-options-{columnName}')` 為 `null`

---

### TS-F112-FE2-003：⚠️ 處長身份下按鈕**完全不渲染**（非既有「新增可選值」按鈕之 disabled-but-visible 模式）
- **關聯**：AC-17 / spec §7.3「處長不渲染」
- **類型**：Negative / Component（**踩雷點，見「殘留風險」§D**）
- **前置**：登入身份為 section_chief（`canWrite===false`，比照既有 `options-tab.tsx:87` 之 `canWrite` 計算方式）
- **步驟**：渲染 `options-tab.tsx`
- **預期**：**斷言 `queryByTestId('btn-import-options-{columnName}') === null`**（元素不存在於 DOM）；**不可**僅斷言 `.disabled===true`——既有「新增可選值」按鈕採 `disabled={!canWrite}` 模式（DOM 中仍存在），若 tdd-implementation 誤沿用該既有 pattern 實作新按鈕，本測試斷言方式（`queryByTestId` 而非 `getByTestId(...).disabled`）能準確攔截此差異

---

### TS-F112-FE2-004：點擊按鈕 → 呼叫 `getDistinctValues` → Modal 僅列出 `alreadyOption===false` 之候選值，全選
- **關聯**：AC-7 / TC-178-05
- **類型**：Positive / Component
- **前置**：mock `getDistinctValues` 回傳 `values:[{value:'A',alreadyOption:true},{value:'B',alreadyOption:false},{value:'C',alreadyOption:false}]`
- **步驟**：點擊「從實際資料帶入可選值」
- **預期**：`getDistinctValues` 被呼叫；批次帶入 Modal 開啟，僅顯示 `B`、`C` 兩個候選項（**不顯示** `A`）；兩者皆預設勾選

---

### TS-F112-FE2-005：全部候選值皆已存在（`alreadyOption` 全 `true`）→ 顯示「無新可選值可帶入」，**不是**空核取清單
- **關聯**：AC-9 / TC-178-08
- **類型**：Positive / Component
- **前置**：mock 回傳全部 `alreadyOption:true`
- **步驟**：點擊按鈕
- **預期**：Modal 顯示「無新可選值可帶入」文字提示；**不**顯示一個沒有任何選項的空核取清單（與「查無資料的錯誤狀態」需視覺區隔，比照 FE1STATE-002 之空狀態語意）；使用者可正常關閉此 Modal，不被阻擋

---

### TS-F112-FE2-006：確認新增 → 呼叫 `createOptionsBulk`（僅含勾選值）→ 成功後呼叫 `listOptions` 刷新列表
- **關聯**：AC-8 / TC-178-06
- **類型**：Positive / Component
- **前置**：候選清單顯示 4 項，全選；mock `createOptionsBulk` 成功
- **步驟**：點擊「確認新增」
- **預期**：`createOptionsBulk(columnName, [4 筆 {optionValue,optionLabel}])` 被呼叫；成功後 `listOptions` 被重新呼叫（列表刷新）；畫面顯示結果提示（含 `createdCount`/`skippedCount`）

---

### TS-F112-FE2-007：使用者取消部分勾選 → 未勾選項不進入 `createOptionsBulk` payload
- **關聯**：AC-8 第 3 句「未被勾選的候選值不受影響」
- **類型**：Positive / Component
- **前置**：候選清單 4 項，使用者取消勾選其中 1 項
- **步驟**：點擊「確認新增」
- **預期**：`createOptionsBulk` payload 之 `options` 陣列僅含 3 筆（被取消勾選的 1 筆不在其中）

---

## 十四、FEREG — 前端不變範圍 regression（spec §7.4）

### TS-F112-FEREG-001：`numeric`／`date` 欄位之表單元件與行為不受本功能影響
- **關聯**：spec §7.4
- **類型**：Regression / Component
- **步驟**：對既有 numeric/date 欄位表單執行既有測試套件（或等價結構性斷言：無新增 DOM 節點、無新增 API 呼叫）
- **預期**：既有行為與 UI 結構不變

---

### TS-F112-FEREG-002：F076 既有「逐筆新增可選值」Modal 不受本功能影響（BR-8）
- **關聯**：BR-8 / spec §7.4
- **類型**：Regression / Component
- **步驟**：對既有「新增可選值」按鈕（單筆）與其 Modal 執行既有測試套件
- **預期**：既有流程（`createOption` 單筆呼叫、409 重複值行為等）維持不變，與新增之批次帶入 Modal 並存但邏輯互不干擾

---

## 殘留風險與待決問題

> 本節彙整本文件設計過程中識別之風險、測試邊界與待決事項，對應 CLAUDE.md「Agent Workflow 邊界」與本 Agent 之 Auto-Challenge 責任；已同步摘要附加至 `docs/test-specs/risks-and-gaps.md`。

### §A — `DISTINCT_VALUES_TIMEOUT_MS=15000` 為架構判斷值，未經真實 MSSQL 大表實測
AD §10.2 已明文：此預設值延續 spec 原始（已過時）15s 假設，未針對 `customer_core.occupation_desc`（55 種 distinct 值散佈於約 360 萬列、無索引）做過真實 MSSQL 計時驗證。**本測試設計對此僅能以「注入極小 timeoutMs」驗證 `Promise.race` 邏輯正確性**（TIMEOUT-001~004），**無法**驗證 15s 預算在真實資料量下是否足夠。真實計時驗證需 tdd-implementation 於 dev CDMP 手動執行一次（AD §11 待裁決項），非本文件測試範圍，亦非 test-designer 職責。

### §B — AC-18（一般使用者無法進入 M06 頁面）之頁面層存取權，本文件不重複造測
AC-18 所述「頁面存取控制」沿用 F075/F076 既有 M06 頁面層 RBAC，已由既有測試套件覆蓋。本文件僅在 GUARD-004/009 於 **API 層**確認 `distinct-values`/`options/bulk` 兩個新端點對無角色使用者之拒絕行為，避免與既有頁面層測試重複造測債。

### §C — `error-handling.md` 與 F112 spec 尚未同步 AD-E07-47 之裁定
AD §11 已將此列為 spec-writer 待辦（4 新碼登錄、504→500 修正）。**本文件已在「Glossary — spec/AD 落差鎖定」表中明確採用 AD 裁定值**，但若 tdd-implementation 過程中僅參照 F112 spec 原文字面（而非本文件或 AD），可能誤植 504 或誤加 `details` 欄位。建議 tdd-implementation 第一步即先在 `error-codes.ts` 依 AD §9 檔案異動清單新增 4 個常數（`DISTINCT_VALUES_QUERY_TIMEOUT` 明確標註 500），作為後續所有測試的前提。

### §D — Entry 2 新按鈕「處長不渲染」與既有「新增可選值」按鈕「disabled 但可見」模式不一致，屬實作陷阱
本文件查證 `options-tab.tsx:87,469` 既有實作採 `disabled={!canWrite}`（DOM 中仍存在該按鈕元素，僅是 disabled 狀態）。但 F112 spec §7.3 對新增之「從實際資料帶入可選值」按鈕明文要求「處長**不渲染**」（DOM 中完全不存在該元素）。若 tdd-implementation 依既有鄰近程式碼慣例直接複製 `disabled` pattern，將**無法通過** FE2-003（`queryByTestId(...) === null` 之斷言會失敗，因為元素雖 disabled 但仍會被 `queryByTestId` 找到）。此為典型「鄰近程式碼慣例 vs 本次 spec 明文要求」之落差，已在 FE2-003 測試設計中明確標註斷言方式以攔截此陷阱。

### §E — `Promise.race` 不真正取消資料庫端查詢（AD §10.1），非單元測試可驗證範圍
逾時後 orphaned 查詢仍在 DB 端繼續執行至完成或撞上全域 1 小時 driver timeout。此為與 `Stage0EstimateService` 既有行為一致之已知限制，非本 AD/本文件引入的新風險。**單元測試層級無法有意義地驗證「DB 端查詢是否被真正取消」**（需要真實 DB 連線與查詢監控），故本文件不為此設計測試案例，留待未來效能監控機制（AD §10.1 建議項）處理，非本次測試設計缺口。

---

## 總結

- **測試場景總數**：81（後端 59 + 前端 22）
- **AC 覆蓋**：US-178 全部 18 個 AC（AC-1~AC-18）皆有至少 1 個對應 Test ID，詳見「追溯矩陣」
- **TC 覆蓋**：US-178 全部 14 個 TC（TC-178-01~14）皆有對應 Test ID
- **BR 覆蓋**：F112 spec §6 全部 13 條 BR（BR-1~BR-13）皆有對應 Test ID
- **Invariant 覆蓋**：AD-E07-47 全部 8 個不變式（I-DVAL-*）皆有對應 Test ID
- **刻意排除範圍（非缺口，對齊 spec/AD 既定邊界）**：
  - `optionLabel` 二次翻譯（OQ-178-05 backlog，spec §1 明文不在本 Story 範圍）
  - 真實 MSSQL 大表逾時實測（AD §10.2 待 tdd-implementation 落地時手動驗證，非測試設計範圍）
  - `Promise.race` 之 DB 端查詢真實取消行為（AD §10.1 已知限制，非單元測試可測範圍）
  - 核取清單搜尋框／分頁等視覺互動細節（spec §7 明文交 ui-ux-designer 決議，本文件僅約束語意）
  - AC-18 頁面層存取控制（沿用 F075/F076 既有測試套件，本文件不重複造測，僅 API 層補強確認）
