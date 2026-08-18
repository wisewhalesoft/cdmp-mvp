---
spec-id: F119
title: 類別型篩選欄位新增文字比對運算子（包含 / 不包含 / 完全等於）
feature-id: F119
source-story: US-183
epic: E07
module: M01 名單定義（草稿階段篩選條件建構子流程，涵蓋建立草稿與編輯草稿兩進入點）
priority: P1
version: "1.1"
date: 2026-08-18
status: Draft
---

# F119: 類別型篩選欄位新增文字比對運算子（包含 / 不包含 / 完全等於）

Priority: P1（Should Have / Phase 2 Advanced） | Status: **Draft** | Last Updated: 2026-08-18

> **v1.1（2026-08-18 / AC-15 descope —— 快照條件顯示移出範圍）**：v1.0 AC-15 / §5.2 / BR-10 以「月跑快照條件檢視為既有顯示端、本輪僅需擴充顯示格式」為前提，**該前提經 system-architect 追查後推翻**：快照 `config_payload.listDefinitions[]` 從未攜帶 `condition_payload`（`assignment-run-pipeline.service.ts:1802-1806` 僅 5 欄），前端 6 個 snapshot 元件對 `conditionPayload` / `columnName` **零命中**——快照根本不顯示篩選條件，屬 [F066](F066-view-run-snapshot-detail.md) **既有功能缺口**而非顯示格式問題。**使用者已裁決 descope 並另開票**。本版變更：
> 1. **AC-15 縮為兩個真實顯示端**：名單詳情 Drawer（`ListDetailDrawer.tsx:296`）與名單定義列表（`list-definition-page.tsx:188`）；移除快照條件檢視。
> 2. **§5.2** 受影響端點表：`full-snapshot` 一列註明其為 Drawer 之**即時讀取**來源（非月跑凍結快照）；月跑快照相關端點改列為**不受影響**並附技術理由。
> 3. **BR-10** 消費端清單移除「快照條件檢視」——**本規則之核心價值（單一共用格式化函式、禁止各頁自拼字串）不變**，且明訂日後補齊快照條件顯示時須複用同一函式。
> 4. **§13.3 新增 A-7**：完整記錄技術證據（含檔案行號）、定性、descope 理由與另開票建議。
> 5. **§12.1 SA-7 收斂為 no-op**（其「條件固化於快照」之前提同屬誤判，故不存在快照序列化往返風險）；§7 / §8 / §10 T-26 / §10 回歸 / §11 checklist 同步縮減。
> 6. US-183 AC-13 之對應 descope 由 **product-analyst** 執行；本 spec **未**修改 US-183。
> **AC / BR 總數不變**（18 AC / 15 BR）；仍為**無 migration、無新端點、無新錯誤碼**。
>
> **v1.0（2026-08-18 / US-183 v1.2 初版）**：為類別型（categorical）篩選欄位在既有「勾選可選值清單」（`IN`）之外，新增三種文字比對運算子（`contains` / `not_contains` / `equals`），單一關鍵字、`ob_pool_data` / `customer_core` / `customer_financial` 三來源全支援。核心設計裁定：
> 1. **`condition_payload` 純加性擴充**（新增 optional `operator` / `keyword` 兩個 key）——JSON 欄位，**不需 migration**、不需資料遷移；舊資料無 `operator` 一律解讀為 `in`（BR-11 / AC-17）。
> 2. **SQL 產生僅有一個共用落點**（`buildCategoricalFragment`）——擴充該函式即同時涵蓋 **5 條執行路徑**（MSSQL 下推 / PG 下推 / JS filter chain / Stage 0 部門估算 / 草稿抽樣估算），此為 AC-14 一致性之**結構性保證**，亦為本 feature 成本可控之關鍵（BR-4）。`customer_core` / `customer_financial` 依既有 `I-CC-COMPOSER-SCOPE-01` / `I-CF-COMPOSER-SCOPE-01` **不走** composer，兩個建構器須各自擴充（BR-5）。
> 3. **重複名單簽章擴充採新區段標記 `:catop:`**，使「無 operator 之舊資料」與「顯式 `operator: 'in'`」產生**與現行逐字元相同**之簽章（BR-9），既有名單不被誤判為變更。
> 4. **不新增錯誤碼**——全數重用既有 `VALIDATION_ERROR`（422）（BR-12 / §5.3）。
> 5. **不需 UI 新增偵測邏輯之 Stage 0 缺口**：`STAGE0_LIST_ESTIMATE_PARTIAL` warning 後端**已存在**，本 feature 僅要求前端渲染（AC-13）。
>
> **本 spec 相對 US-183 之新增 AC（2 條，非 US-183 字面要求，理由見 §13.1）**：AC-6（後端互斥防呆）、AC-11（零可選值之類別型欄位仍須可設定）。
>
> **⚠️ 未解除之上游相依**：`docs/specs/data-model.md` 之 `condition_payload` schema 需同步補述 `operator` / `keyword`——**該檔為 system-architect 之地盤，本輪未改**，需求已逐條列於 §12。[F050](F050-create-list-definition.md) §5.4 / BR-6 / BR-7 亦需加性補述，本輪**刻意未逕自改寫**（沿用 [F118 §12.2](F118-copy-from-prev-month-duplicate-indicator.md) 之處置慣例），建議文字見 §12.2。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| System Architect | 本文件 §5 / §6 / §12 + [F050](F050-create-list-definition.md) §5.4 / BR-6 / BR-7 + [F109](F109-customer-source-filter-fields.md) §6 BR-2 / BR-3 + `apps/api/src/modules/assignment/stage1/stage1-query-composer.ts` + `stage1-customer-core-clause.ts` + `stage1-customer-financial-clause.ts` |
| TDD Developer | 本文件 + [F050](F050-create-list-definition.md) §5.4 + [F051](F051-edit-list-definition.md) §5 + `data-model.md#ob_list_definitionobmlistdf--名單定義` + AD（system-architect 產出後） |
| QA / Tester | 本文件 §4 / §10 + [error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)（`VALIDATION_ERROR`，本 feature **不**新增錯誤碼） |
| UI/UX Designer | 本文件 §7 + `prototypes/27a-list-create-draft.html` + `prototypes/27b-list-edit-draft.html` + `prototypes/30-stage0-estimate.html` |
| DevOps | 無（本 feature **無** migration、**無**新環境變數、**無**新端點） |

---

## 對應 User Story

- 來源 Story：[US-183-M01-categorical-text-match-operators.md](../../stories/epics/E07-app-customer-list-assignment/US-183-M01-categorical-text-match-operators.md)（**v1.2，已通過人工審閱閘；16 AC / 16 TC 為最終業務契約**）
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 宿主流程：[F050 v2.4 建立草稿名單](F050-create-list-definition.md)（建立進入點）、[F051 v2.2.1 編輯草稿名單](F051-edit-list-definition.md)（編輯進入點）

---

## 1. 功能摘要

類別型篩選欄位之條件設定，現行**唯一**語意為「勾選 `pooldata_field_option` 已登錄之可選值」＝ SQL `IN (...)`。對於值域極廣、無法窮舉之欄位（如主約專案名稱 `ob_pool_data.spec_name`），此語意無法表達「含某關鍵字」與「不含某關鍵字」。

本 feature 於 categorical 條件新增 `operator` 概念，四值擇一：`in`（現況，預設）/ `contains` / `not_contains` / `equals`；後三者搭配單一關鍵字 `keyword`。

**範圍**：`condition_payload` schema 純加性擴充 + SQL fragment 建構器擴充（3 個落點）+ 重複判定簽章擴充 + 條件建構子 UI（建立 / 編輯兩頁）+ 條件顯示端 + Stage 0 部門估算頁既有 warning 渲染。

**不在範圍**：numeric / date 型欄位之運算子擴充；同列多關鍵字（OR / AND）；legacy 連續多關鍵字 LIKE（`%期中%機車%`）；不分大小寫 / 全半形正規化比對；為文字運算子引入新的效能機制（索引、物化、抽樣延伸）；編輯草稿頁補「預估命中筆數」面板（US-183 OQ-183-04 已裁決不納入）。

**成本控制之結構性事實（本 feature 之核心）**：`buildCategoricalFragment()`（`stage1-query-composer.ts:358`）經 `buildStage1WhereConditions()` 被**五條執行路徑共用**，擴充一處即五條同時生效——此為 AC-14「五處篩選邏輯一致」得以「依建構即成立」而非「靠測試維持」之根據（BR-4）。

## 2. 使用者故事

**As a** 部長（Director）或 Admin
**I want** 類別型篩選欄位除「勾選可選值」外，還能選「包含 / 不包含 / 完全等於」並輸入一個關鍵字
**So that** 我能直接對值域極廣、無法窮舉可選值的欄位（如主約專案名稱含「勁便利」）設定篩選條件，不必先把成千上百種值全部登錄為可選值

## 3. 前置條件

- 沿用 [F050](F050-create-list-definition.md) §3 / [F051](F051-edit-list-definition.md) 建立與編輯草稿名單之全部前置條件（JWT / `DirectorGuard` / `stage = 'draft'` / 作業月 / 無執行中月名單分派 / Feature Flag）
- 目標欄位已存在於 [F075](F075-manage-pooldata-field-whitelist.md) `pooldata_field_whitelist` 且 `is_active = true`、`field_type = 'categorical'`
- **[ASSUMPTION A-1]** US-183 之主要業務範例欄位「主約專案名稱」（`ob_pool_data.spec_name`）**目前不在部署 seed `pooldata-field-whitelist.json` 內**（已逐筆查證，seed 之 `ob_pool_data` categorical 欄位為 `best_case` / `brand_name` / `case_status` / `caseyear` / `payt_num` / `prod_kind` / `prod_type_name` / `settle_src` / `spec_tp`）。本 feature **不**負責 seed 該欄位；使用者須先經 [F075](F075-manage-pooldata-field-whitelist.md) 新增篩選欄位流程將 `spec_name` 加入白名單。此為前置作業，非本 feature 之缺口（見 §13.2 A-1）

## 4. 驗收標準

> **全 AC 共用之用語定義**
> - **文字運算子**：`contains` / `not_contains` / `equals` 三者之合稱。
> - **關鍵字**：`keyword` 欄位經 trim（去除前後空白，含半形空格、全形空格 U+3000、Tab、換行）後之字串。
> - **來源**：該條件之 `columnName` 於 [F075](F075-manage-pooldata-field-whitelist.md) 白名單所登錄之 `data_source`（`ob_pool_data` / `customer_core` / `customer_financial`，[F109](F109-customer-source-filter-fields.md) BR-1 引入之概念）。
> - **五條執行路徑**：MSSQL SQL 下推（`stage1-sql-builder-mssql.ts`）、PG SQL 下推（`stage1-sql-builder.ts`）、JS filter chain（`stage1-filter-chain.ts`）、Stage 0 部門 / 每日估算（`stage0-estimate.service.ts`）、草稿命中預估抽樣估算（`assignment-list.service.ts` / `sampling-estimator.ts`）。

### AC-1：類別型條件列新增運算子，預設 `in`（US-183 AC-1）

- **Given** 部長 / Admin 於建立或編輯草稿名單時新增（或編輯既有）一列 categorical 篩選條件
- **When** 該條件列渲染比對方式選項
- **Then** 提供四個選項：`in`（顯示為「IN」，核取清單，**預設選中**）/ `contains`（「包含」）/ `not_contains`（「不包含」）/ `equals`（「完全等於」）
- **And** 未選擇任何運算子時，行為與本 feature 上線前**完全相同**（核取清單 + `IN (...)`），不影響任何既有操作路徑
- **And** `operator` 僅適用於 `fieldType = 'categorical'`；numeric / date 條件送出 `operator` 或 `keyword` 一律回 422 `VALIDATION_ERROR`（BR-1）

### AC-2：`contains`（文字包含）篩選語意（US-183 AC-2）

- **Given** 某條件列 `operator = 'contains'`、關鍵字為 K
- **When** 系統於五條執行路徑任一套用此條件
- **Then** 僅保留「該欄位值不為 NULL 且包含 K」之案件
- **And** 欄位值為 NULL 之案件一律**不符合**，三來源結果方向一致，**不需依來源分流**：`ob_pool_data` 之 NULL 因空值本就不含任何關鍵字而被排除；`customer_core` / `customer_financial` 之 NULL（含 LEFT JOIN 查無對應客戶）則因既有不變式 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01`（客戶欄不得 COALESCE、由 SQL 三值邏輯天然排除）而被排除
- **And** 比對為子字串比對，關鍵字出現在欄位值之任何位置（頭 / 中 / 尾）皆算符合

### AC-3（★核心）：`not_contains`（文字不包含）篩選語意，NULL 依來源分流（US-183 AC-3）

- **Given** 某條件列 `operator = 'not_contains'`、關鍵字為 K
- **When** 系統套用此條件
- **Then** 保留「該欄位值不含 K」之案件；NULL 案件之處理**依來源分流**：

  | 來源 | NULL 案件 | 根據 |
  |---|---|---|
  | `ob_pool_data` | **保留**（視為「不包含」） | 業務裁定：一個未填寫該欄位的案件，理應落在「不含 K」之集合內，不應被 `NOT LIKE` 對 NULL 之預設行為悄悄濾除 |
  | `customer_core` | **排除**（視為「資料不明」） | 既有不變式 `I-CC-NULL-EXCLUDE-01`，**沿用不變更** |
  | `customer_financial` | **排除**（視為「資料不明」） | 既有不變式 `I-CF-NULL-EXCLUDE-01`，**沿用不變更** |

- **And** `ob_pool_data` 來源下，本裁定與 AC-2 對 NULL 之處理**刻意不對稱**（NULL 在 `contains` 下排除、在 `not_contains` 下保留），此為業務主管確認之預期行為，**非缺陷**，測試須正面斷言此不對稱
- **And** `customer_core` / `customer_financial` 來源下，`contains` / `not_contains` / `equals` 三者對 NULL 之處理方向**一致**（皆排除）；**全系統唯一例外**為 `ob_pool_data` 之 `not_contains`
- **And** 本 feature **不得**修改 `I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01` 本身，亦**不得**為客戶來源另立 `IS NULL` 特判分支（BR-5）

### AC-4：`equals`（文字完全等於）篩選語意（US-183 AC-4）

- **Given** 某條件列 `operator = 'equals'`、關鍵字為 K
- **When** 系統套用此條件
- **Then** 僅保留「該欄位值與 K 逐字元完全相同」之案件（`col = K` 語意，非 `LIKE`）
- **And** 欄位值為 NULL 之案件一律不符合（三來源方向一致，理由同 AC-2）
- **And** `equals` 與「`in` 且只勾選一個值」在**篩選結果上**可能等價，但兩者為不同之條件表達，於重複判定中視為**不同簽章**（AC-16 / BR-9）

### AC-5：運算子切換時介面互斥且舊輸入被清除（US-183 AC-5）

- **Given** 使用者將某條件列之運算子由 `in` 切換為任一文字運算子（或反向）
- **When** 切換發生
- **Then** 介面切換顯示型態：`in` → 核取清單（隱藏文字輸入框）；文字運算子 → 單一文字輸入框（隱藏核取清單）；兩者**不同時顯示**
- **And** 切換後前一種運算子之輸入內容須被**清除**（`in` → 文字：清空 `values`；文字 → `in`：清空 `keyword`），**不得**殘留於表單狀態並隨送出 payload 一併儲存
- **And** 切換至文字運算子後，文字輸入框為空（不預填任何值）

### AC-6：後端互斥防呆（★本 spec 新增，defense-in-depth）

- **Given** 送達後端之 `conditions[]` 條目違反互斥（`operator = 'in'` 或缺漏但帶有非空 `keyword`；或 `operator` 為文字運算子但帶有非空 `values`）
- **When** `createList` / `updateList` / `preview-hit-count` 任一端點驗證 payload
- **Then** 回 422 `VALIDATION_ERROR`，訊息明確指出違反互斥之 `columnName`
- **And** **不採靜默丟棄 / 靜默正規化**——沿用 [F050](F050-create-list-definition.md) BR-6 對 schema 違規一律拒絕之既有慣例（`injectSystemFixedConditions` 之靜默正規化僅適用 system-fixed 欄位，屬另一機制，不適用於此）
- **And** 此為 AC-5「不得殘留並一併送出」之伺服器端保證：即使前端狀態管理出錯，錯誤條件亦不會靜默落庫

### AC-7：MVP 限制為單一關鍵字（US-183 AC-6）

- **Given** 使用者選擇任一文字運算子
- **When** 輸入關鍵字
- **Then** `keyword` 為**單一字串**（非陣列、非以分隔符號切分之多值）；使用者輸入之任何分隔符號（逗號、`$$`、空白等）一律視為關鍵字內容之一部分，**不**做切分
- **And** 需要多關鍵字時由使用者自行新增多列條件（沿用既有列間 AND 語意，[F050](F050-create-list-definition.md) BR-7 (4)）
- **And** 系統**不提供**同列多關鍵字之 OR / AND 語意

### AC-8：關鍵字驗證——非空白、trim、長度（US-183 AC-7）

- **Given** 使用者選擇任一文字運算子
- **When** 儲存（或請求命中預估）
- **Then** 系統依下表驗證，違反一律 422 `VALIDATION_ERROR` 並阻擋儲存：

  | 情境 | 判定 | 訊息（示意，最終文案由 §5.3 定義） |
  |---|---|---|
  | `keyword` 缺漏 / `null` / 空字串 | 拒絕 | 「{欄位} 使用文字比對運算子時，關鍵字為必填」 |
  | `keyword` trim 後長度 = 0（純空白，含全形空格 U+3000） | 拒絕 | 同上 |
  | `keyword` trim 後長度 > 100 | 拒絕 | 「{欄位} 關鍵字長度不得超過 100 個字元」 |
  | `keyword` 非字串型別 | 拒絕 | 「{欄位} 關鍵字必須為字串」 |

- **And** 儲存時實際落庫之 `keyword` 為 **trim 後**之字串（前後空白不落庫，BR-2）；關鍵字**內部**之空白一律保留（「勁 便利」與「勁便利」為不同關鍵字）
- **And** 此驗證強度與現行 `in` 之 `values` `@ArrayMinSize(1)` **對等**，不因改用文字運算子而降低

### AC-9：使用者輸入之特殊字元視為字面值（US-183 AC-8）

- **Given** 關鍵字含資料庫萬用字元語法保留字元（`%` / `_` / `[` / `]` / `^`，以及跳脫字元本身）
- **When** 系統套用此條件
- **Then** 系統將這些字元視為**字面值**比對——關鍵字「50%達成率」只比對真的包含字串 `50%達成率` 之案件，`%` **不得**被解讀為任意字元序列、`_` **不得**被解讀為任意單一字元
- **And** 此行為在 `contains` / `not_contains` / `equals` 三種運算子下皆須一致成立（`equals` 因採 `=` 比對而天然成立，`contains` / `not_contains` 須由跳脫機制保證）
- **And** 跳脫之**具體技術手段**（`ESCAPE` 子句 / 字元集 / 方言差異）由 system-architect 決定（§12.1 SA-2）；本 AC 僅定義**行為契約**

### AC-10：三個資料來源之類別型欄位皆支援四種運算子（US-183 AC-9）

- **Given** 某 categorical 欄位之 `data_source` 為 `ob_pool_data` / `customer_core` / `customer_financial` 三者之一
- **When** 使用者設定該欄位之條件
- **Then** 四種運算子**同等可選**，UI 呈現、驗證規則、關鍵字語意完全一致，使用者不會因欄位背後來源不同而看到功能缺漏
- **And** NULL 處理依 AC-2 / AC-3 / AC-4（僅 `not_contains` 依來源分流）
- **And** 各來源之 SQL fragment 由其既有建構器產生（`ob_pool_data` → `buildCategoricalFragment`；`customer_core` → `buildCustomerCoreClause`；`customer_financial` → `buildCustomerFinancialClause`），不得為本 feature 打破 `I-CC-COMPOSER-SCOPE-01` / `I-CF-COMPOSER-SCOPE-01`（BR-5）

### AC-11：零可選值之類別型欄位仍須可設定條件（★本 spec 新增）

- **Given** 某 categorical 白名單欄位在 `pooldata_field_option` 中**沒有任何**已登錄可選值（例如剛由 [F075](F075-manage-pooldata-field-whitelist.md) 新增之 `spec_name`）
- **When** 使用者於條件建構子選用該欄位
- **Then** 該欄位須可正常加入條件列，並可選用任一文字運算子完成設定與儲存
- **And** 選 `in` 時核取清單為空為**既有合法狀態**（顯示「未選擇任何值」），儲存時仍受 `values` 至少 1 個元素之既有驗證擋下——此非本 feature 造成之限制
- **And** 條件建構子之「新增條件」下拉**不得**以「該欄位無可選值」為由過濾掉 categorical 欄位（否則本 feature 之核心業務動機——為無法窮舉可選值之欄位提供篩選手段——將無法達成）

### AC-12：選用文字運算子時顯示效能提示（US-183 AC-10）

- **Given** 某條件列切換為任一文字運算子
- **When** 該運算子生效
- **Then** 介面顯示告知性提示，說明模糊比對較耗時、預估可能逾時（確切文案由 ui-ux-designer 定案，OQ-183-01）
- **And** 提示**不阻擋**任何操作、不需使用者確認、不影響儲存
- **And** 切回 `in` 時提示消失

### AC-13：Stage 0 部門估算頁須渲染既有 `STAGE0_LIST_ESTIMATE_PARTIAL` warning（US-183 AC-11）

- **Given** 個別名單於 Stage 0 部門維度估算之 `estimateListCount` 查詢逾時，後端已依現況邏輯將該名單自 `listTotals` 排除並產生 warning `{ code: 'STAGE0_LIST_ESTIMATE_PARTIAL', listNo, message }`（`stage0-estimate.service.ts:557-570`）
- **When** 使用者檢視 Stage 0 部門估算頁
- **Then** 該 warning 須被渲染出來，使用者可辨識「哪一張名單估算逾時」與「本次合計未涵蓋該名單」
- **And** 前端**不得**丟棄該 warning——現況 `stage0-estimate-page.tsx` 僅處理 `SCOPE_UNRESOLVED`（`:177`）、`CALENDAR_EMPTY`（`:447`）與獨立欄位 `poolWarning = 'POOL_COUNT_LOW'`（`:467`），`STAGE0_LIST_ESTIMATE_PARTIAL` 完全未呈現，導致合計數字被誤讀為完整值
- **And** 契約來源：本 warning 已登錄於 [error-handling.md#assignment-run-warnings](../error-handling.md#assignment-run-warnings)（v1.20 補登，含 payload 結構與前端呈現要求）
- **And** 渲染須沿用既有 warning 呈現管道（不另建平行機制）；**確切呈現位置與樣式**（列內 inline / 頁首彙總 / 兩者兼具）由 ui-ux-designer 定案（US-183 §不含範圍）
- **And** 多張名單同時逾時時，每一張皆須可辨識（不得只顯示一則泛用訊息而遺失 `listNo`）
- **And** warning 之顯示**不阻擋**頁面其餘內容渲染
- **And**（範圍）本 AC 之修正對象為**同一 warning code 之渲染邏輯**，技術上無法只針對「文字運算子觸發之逾時」渲染；**建議預設為不分觸發原因一律渲染**，最終範圍認定由 system-architect 依 OQ-183-03 定案（§12.1 SA-5）

### AC-14（★核心）：五條執行路徑之篩選邏輯一致（US-183 AC-12）

- **Given** 同一份名單使用相同之文字運算子條件
- **When** 分別經由五條執行路徑計算
- **Then** 五處對「某案件是否符合此條件」之判定**完全一致**，含 AC-3 之 NULL 分流規則、AC-9 之字面值語意、AC-4 之逐字元比對
- **And** 一致性須由「共用同一 fragment 建構器」之結構保證（BR-4 / BR-5），**不得**任一路徑自行實作關鍵字比對或 NULL 判斷
- **And** 草稿命中預估因採抽樣估算（[F050](F050-create-list-definition.md) BR-15 / AD-E07-45）而為估算值，本 AC **不**要求數字逐筆相等；要求的是**篩選邏輯本身**一致
- **And** MSSQL 與 PG 兩份 SQL builder 之文字比對語意須等價（本專案現行 DB 為 MSSQL；PG 路徑仍存在於程式碼，見 §12.1 SA-3）

### AC-15：名單詳情 Drawer 與名單定義列表正確呈現文字條件（US-183 AC-13，**v1.1 已 descope 快照**）

- **Given** 某名單條件含文字運算子
- **When** 使用者於**名單詳情 Drawer**（`_components/ListDetailDrawer.tsx`）或**名單定義列表**（`list-definition-page.tsx`）查看該名單之篩選條件
- **Then** 畫面呈現「欄位顯示名稱 + 運算子中文標籤 + 關鍵字」，例如「主約專案名稱 包含「勁便利」」
- **And** **不得**顯示為空白、`IN []`、`IN (空清單)`、或僅顯示欄位名而無條件內容
- **And** 運算子中文標籤全系統統一：`in` →「IN」/ `contains` →「包含」/ `not_contains` →「不包含」/ `equals` →「完全等於」（BR-10）
- **And** 上述兩個顯示端共用**同一格式化函式**，不得各頁各自拼字串（BR-10）
- **And**（**v1.1 範圍變更**）**月跑快照之條件檢視不在本 feature 範圍**——經查證，快照根本**未記錄**任何篩選條件，此為 [F066](F066-view-run-snapshot-detail.md) 之既有功能缺口而非顯示格式問題，已由使用者裁決 descope 並另開票（完整技術證據與 descope 理由見 §13.3 A-7）

### AC-16（★核心）：重複名單判定須能區分運算子語意（US-183 AC-14）

- **Given** 兩份名單條件僅運算子不同（例如「主約專案名稱 包含 勁便利」vs「主約專案名稱 不包含 勁便利」），其餘條件與 `card_type` 完全相同
- **When** 執行既有 `LIST_NO_DUPLICATE`「完整條件集相等 + `card_type`」重複判定（[F050](F050-create-list-definition.md) BR-2 v2.2 語意）
- **Then** 兩者**必須**被判定為**不同名單**，儲存成功、**不**觸發 422 `LIST_NO_DUPLICATE`
- **And** 此要求適用於任意兩種運算子之組合（`in` vs `contains`、`contains` vs `not_contains`、`contains` vs `equals`、`in`〔單值〕vs `equals`〔同值〕等皆須視為不同）
- **And** 同運算子、同關鍵字 → 仍須判定為**相同**（重複攔截不得失效）
- **And** 關鍵字之比對為**大小寫與全半形敏感**（沿用 BR-8 之比對語意）：`contains "ABC"` 與 `contains "abc"` 為不同條件
- **And** 具體簽章格式見 BR-9；[F118](F118-copy-from-prev-month-duplicate-indicator.md)「已複製過」判定因重用同一正規化函式而自動繼承本擴充，無需另行修改

### AC-17：舊資料無 `operator` 一律視為 `in`，向後相容（US-183 AC-15）

- **Given** 本 feature 上線前建立之名單，其 `condition_payload.conditions[]` 無 `operator` / `keyword` key
- **When** 系統讀取、顯示、執行 Stage 1 / 估算、或執行重複判定
- **Then** 一律解讀為 `in`，行為與上線前**完全相同**；**不需**資料遷移、**不需** migration
- **And** 顯式 `operator: 'in'` 與**缺漏** `operator` 兩者於**簽章、SQL、顯示**三方面須產生**完全相同**之結果（BR-9 / BR-11）——否則既有名單一經編輯儲存即因簽章改變而被誤判為不同名單
- **And** 既有名單之編輯、[US-181 / F118](F118-copy-from-prev-month-duplicate-indicator.md)「從上月複製」、快照回溯等既有流程皆不受影響
- **And** `condition_payload IS NULL` 之 legacy 名單（路徑 B fallback，[F050](F050-create-list-definition.md) BR-10）不受本 feature 任何影響

### AC-18：建立草稿與編輯草稿兩進入點行為一致（US-183 AC-16）

- **Given** 部長 / Admin 分別於「建立草稿名單」（`27a`）與「編輯草稿名單」（`27b`）頁設定 categorical 條件
- **When** 於任一頁選擇運算子並輸入關鍵字
- **Then** 兩頁之運算子選項、互斥切換（AC-5）、驗證規則（AC-7 / AC-8）、特殊字元處理（AC-9）、效能提示（AC-12）**完全一致**
- **And** 一致性須由**共用同一條件建構子元件**保證（現行 `CategoricalValuesPicker` 已於兩頁重複使用），不得一頁支援、另一頁維持舊版
- **And**（範圍澄清）本一致性限於「篩選條件建構子元件本身」；編輯草稿頁**不**因本 feature 而被要求補上「預估命中筆數」面板（US-183 OQ-183-04 已裁決不納入本輪；此為 US-176 之既有 deferred 缺口）

---

### AC 對照表（US-183 → F119）

| US-183 AC | F119 AC | 備註 |
|---|---|---|
| AC-1 運算子選擇 | AC-1 | 追加「`operator` 僅適用 categorical」之明文 |
| AC-2 包含語意 | AC-2 | — |
| AC-3 不包含語意（來源分流） | AC-3 | 分流表格化 |
| AC-4 完全等於語意 | AC-4 | 追加「與單值 `in` 於重複判定視為不同」 |
| AC-5 互斥切換 | AC-5 | UI 層 |
| — | **AC-6** | **本 spec 新增**：後端互斥防呆（AC-5 之伺服器端保證） |
| AC-6 單一關鍵字 | AC-7 | 追加「分隔符號不切分」 |
| AC-7 關鍵字非空白 | AC-8 | 追加 trim 語意與長度上限 100 |
| AC-8 特殊字元字面值 | AC-9 | 明列字元集，實作手法交 SA |
| AC-9 三來源支援 | AC-10 | 追加建構器歸屬 |
| — | **AC-11** | **本 spec 新增**：零可選值欄位仍可設定（源自 US-183 背景動機） |
| AC-10 效能提示 | AC-12 | — |
| AC-11 Stage 0 warning 渲染 | AC-13 | 明定前端渲染契約 |
| AC-12 三處一致 | AC-14 | **擴為五條路徑**（US-183 述及三處，經查證實際共用點為五條） |
| AC-13 條件顯示 | AC-15 | 追加統一標籤與單一格式化來源 |
| AC-14 重複判定 | AC-16 | 追加簽章格式（BR-9） |
| AC-15 向後相容 | AC-17 | 追加「顯式 `in` ≡ 缺漏」之硬性要求 |
| AC-16 兩進入點一致 | AC-18 | — |

## 5. API 規格

> **路由前綴校正**：`AssignmentListController` 實際前綴為 **`assignment/lists`**（非 [F050](F050-create-list-definition.md) §6.1 / [F051](F051-edit-list-definition.md) 所載之 `assignment/list-definitions`）；估算相關端點則確為 `assignment/list-definitions/...`（`Stage0EstimateController`）。此為既有文件漂移，[F118 §5.1.1](F118-copy-from-prev-month-duplicate-indicator.md) 已記錄，本 spec 沿用實際值。

### 5.1 `condition_payload` categorical 條件擴充（本 feature 之唯一 schema 變更）

**新增兩個 optional key**（純加性，JSON 欄位，**不需 migration**）：

```jsonc
{
  "conditions": [
    // (a) 現況 IN 條件 —— 本 feature 上線後之表達完全不變
    { "columnName": "prod_kind", "fieldType": "categorical", "values": ["01", "02"] },

    // (b) 顯式 in（與 (a) 語意、簽章、SQL 完全等價）
    { "columnName": "prod_kind", "fieldType": "categorical", "operator": "in", "values": ["01", "02"] },

    // (c) 文字包含
    { "columnName": "spec_name", "fieldType": "categorical", "operator": "contains", "keyword": "勁便利" },

    // (d) 文字不包含
    { "columnName": "spec_name", "fieldType": "categorical", "operator": "not_contains", "keyword": "勁便利" },

    // (e) 文字完全等於
    { "columnName": "occupation_desc", "fieldType": "categorical", "operator": "equals", "keyword": "軍公教" }
  ],
  "logic": "AND"
}
```

**欄位契約**

| 欄位 | 型別 | 必填條件 | 規則 |
|---|---|---|---|
| `operator` | `"in" \| "contains" \| "not_contains" \| "equals"` | 選填 | 缺漏 ≡ `"in"`（BR-11）。僅 `fieldType = 'categorical'` 可帶；numeric / date 帶入 → 422。非四值之一 → 422 |
| `keyword` | `string` | `operator` 為文字運算子時**必填** | trim 後長度 1~100；純空白 → 422；`operator = 'in'`（或缺漏）時帶入非空 `keyword` → 422（AC-6） |
| `values` | `string[]` | `operator = 'in'`（或缺漏）時**必填**（≥1，既有規則不變） | `operator` 為文字運算子時帶入非空 `values` → 422（AC-6） |

**`fieldType` 維持三值**（`categorical` / `numeric` / `date`）——本 feature **不**新增 `fieldType`，運算子為 categorical 之子屬性。理由見 §13.1 D-1。

### 5.2 受影響之 API 端點（無新增端點）

| 端點 | 方法 | 影響面 | 說明 |
|---|---|---|---|
| `/api/v1/assignment/lists` | POST | **Request + 驗證** | `conditionPayload.conditions[]` 接受 `operator` / `keyword`；新增 AC-6 / AC-8 驗證；重複判定簽章改用 BR-9 新格式 |
| `/api/v1/assignment/lists/:listNo` | PUT | **Request + 驗證** | 同上（[F051](F051-edit-list-definition.md) 覆寫式更新） |
| `/api/v1/assignment/list-definitions/preview-hit-count` | POST | **Request + 估算結果** | 接受未儲存 payload，須套用同一驗證與同一 fragment 建構（[F050](F050-create-list-definition.md) §6.3 / BR-15） |
| `/api/v1/assignment/list-definitions/:listNo/estimate` | GET | **估算結果** | 單一名單 Stage 0 精確試算；經 `buildStage1WhereConditions` 自動生效，無 request 變更 |
| `/api/v1/assignment/stage0/dept-estimate` | GET | **Response 消費方式** | 回應 schema **不變**；本 feature 要求前端渲染既有 `warnings[]` 之 `STAGE0_LIST_ESTIMATE_PARTIAL`（AC-13） |
| `/api/v1/assignment/stage0/daily-estimate` | GET | **估算結果** | 同 `:listNo/estimate`，無 request 變更 |
| `/api/v1/assignment/lists` | GET | **Response 顯示** | 列表回傳之 `conditionPayload` 含新 key；顯示端須依 AC-15 呈現 |
| `/api/v1/assignment/lists/:listNo/full-snapshot` | GET | **Response 顯示** | 名單詳情 Drawer 之資料來源（[F050](F050-create-list-definition.md) §6.2，即時讀取 `ob_list_definition.condition_payload`，**非**月跑凍結快照）；條件區塊顯示須依 AC-15 |
| `/api/v1/assignment/lists/copy-duplicate-check` | GET | **判定結果** | [F118](F118-copy-from-prev-month-duplicate-indicator.md) 判定重用同一正規化函式，簽章擴充後自動生效，**無**額外修改 |
| 月名單分派執行端點（Stage 1） | — | **執行結果** | 條件經 `buildStage1WhereConditions` 自動生效（BR-4），無 request / response schema 變更 |
| 月跑快照相關端點（[F066](F066-view-run-snapshot-detail.md)） | — | **不受影響**（v1.1 descope） | 快照 `config_payload.listDefinitions[]` **未攜帶** `condition_payload`（`assignment-run-pipeline.service.ts:1802-1806` 僅 `listNo` / `listNm` / `cardType` / `crEnabled` / `caseStatus`），前端快照元件亦無任何條件渲染邏輯。**快照根本不顯示篩選條件**，故本 feature 對其零影響；補齊屬 F066 之獨立缺口（§13.3 A-7） |

> **無新增端點、無 request 必填欄位變更、無 response 欄位移除** —— 本 feature 對 API 之變更全為**加性**，既有 client 不帶 `operator` 時行為完全不變（AC-17）。

### 5.3 錯誤碼

**本 feature 不新增錯誤碼**，全數重用既有 `VALIDATION_ERROR`（422，`apps/api/src/common/errors/error-codes.ts:2`）。理由：本 feature 之全部驗證失敗情境皆屬「`condition_payload` schema 違規」，與 [F050](F050-create-list-definition.md) §5.4 既有規則表之處置（`categorical values` 缺漏 / `logic` 非 AND / `fieldType` 非三值皆回 `VALIDATION_ERROR`）同類；為單一 schema 內之欄位組合規則另立錯誤碼會使錯誤碼表膨脹而不增加可行動性（BR-12）。

| 情境 | HTTP | 錯誤碼 | 訊息 |
|---|---|---|---|
| `operator` 非四值之一 | 422 | `VALIDATION_ERROR` | 「operator 必須為 in / contains / not_contains / equals 之一」 |
| numeric / date 條件帶 `operator` 或 `keyword` | 422 | `VALIDATION_ERROR` | 「operator / keyword 僅適用於 categorical 篩選條件」 |
| 文字運算子但 `keyword` 缺漏 / 空 / 純空白 | 422 | `VALIDATION_ERROR` | 「{columnName} 使用文字比對運算子時，關鍵字為必填且不得為空白」 |
| `keyword` trim 後長度 > 100 | 422 | `VALIDATION_ERROR` | 「{columnName} 關鍵字長度不得超過 100 個字元」 |
| `keyword` 非字串 | 422 | `VALIDATION_ERROR` | 「{columnName} 關鍵字必須為字串」 |
| 互斥違規（文字運算子 + 非空 `values`；或 `in` + 非空 `keyword`） | 422 | `VALIDATION_ERROR` | 「{columnName} 之比對方式與設定值不相符，請重新設定」 |
| 兩份名單條件集完全相同（含運算子與關鍵字） | 422 | `LIST_NO_DUPLICATE` | 既有碼，語意不變（[error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)） |

> 全部訊息文案以 `ERROR_MESSAGES` 既有慣例撰寫（繁體中文、可行動）；最終字串以 system-architect / TDD 落地為準，但**須包含 `columnName`**（多條件表單中若不指出是哪一列，使用者無從修正）。

## 6. 業務規則

> 本節 BR 編號為 **F119 檔案內編號**；引用他 feature 之規則一律標明來源（如「[F050](F050-create-list-definition.md) BR-7」），與既有各 feature 之 BR 編號**不衝突**（本專案 BR 編號為 feature-scoped，見 [F117](F117-dept-ratio-director-required-filter.md) / [F118](F118-copy-from-prev-month-duplicate-indicator.md) 慣例）。

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`operator` 契約**：合法值 `in` / `contains` / `not_contains` / `equals`（US-183 已拍板決策 1，命名不得更動）。**僅** `fieldType = 'categorical'` 之條件可帶 `operator`；numeric / date 帶入即 422。缺漏 ≡ `in`（BR-11） |
| BR-2 | **`keyword` 契約**：型別 `string`；僅文字運算子可帶且為必填；儲存前執行 **trim**（去除前後之半形空白 / 全形空白 U+3000 / Tab / CR / LF），trim 後長度須為 1~100；**落庫值為 trim 後之值**（讀取端不再 trim，避免兩端不一致）。長度上限 100 為防禦性輸入界限（現行最長 categorical 來源欄位為 `ob_pool_data.spec_name` nvarchar(45)），**不**做 per-column 動態長度驗證（會使驗證耦合 schema 細節） |
| BR-3 | **互斥不變式**：一個 condition 條目只能落在兩種形態之一——`in` 形態（有 `values`、無 `keyword`）或文字形態（有 `keyword`、無 `values`）。前端切換即清空另一側（AC-5）；後端違反即 422（AC-6）。**不得**同時儲存兩套值 |
| BR-4 | **★單一 SQL 落點（成本與一致性之結構性保證）**：`ob_pool_data` 來源之運算子分支**必須**實作於 `buildCategoricalFragment()`（`stage1-query-composer.ts:358`）此**唯一**函式內。該函式經 `buildStage1WhereConditions()` 被**五條路徑**共用——`stage1-sql-builder-mssql.ts:73`（MSSQL 下推）、`stage1-sql-builder.ts:99`（PG 下推）、`stage1-filter-chain.ts:373`（JS chain）、`stage0-estimate.service.ts:804`（Stage 0 估算）、`assignment-list.service.ts:357`（草稿抽樣估算）。**禁止**在任一呼叫端另行實作關鍵字比對；AC-14 之一致性由此結構保證，非靠測試維持 |
| BR-5 | **客戶來源建構器各自擴充，且不得破壞既有不變式**：依 `I-CC-COMPOSER-SCOPE-01` / `I-CF-COMPOSER-SCOPE-01`，`customer_core` / `customer_financial` 條件**不走** composer，其運算子分支須分別實作於 `buildCustomerCoreClause`（`stage1-customer-core-clause.ts`）與 `buildCustomerFinancialClause`（`stage1-customer-financial-clause.ts`）。**不得**為本 feature 於客戶來源新增任何 `IS NULL` / `COALESCE` 特判——`I-CC-NULL-EXCLUDE-01` / `I-CF-NULL-EXCLUDE-01` 明文禁止；三種文字運算子之 NULL 排除語意皆由 SQL 三值邏輯天然達成（`cc.col LIKE …` / `cc.col NOT LIKE …` / `cc.col = …` 對 NULL 均求值為 NULL → WHERE 過濾），**恰好**符合 AC-2 / AC-3 / AC-4 對客戶來源之要求 |
| BR-6 | **NULL 語意矩陣（AC-2 / AC-3 / AC-4 之權威彙總）**：<br>・`in` → `ob_pool_data` **排除**；`customer_core` / `customer_financial` **排除**<br>・`contains` → `ob_pool_data` **排除**；客戶兩來源 **排除**<br>・`not_contains` → `ob_pool_data` **保留**（★全表唯一例外，須以顯式邏輯表達）；客戶兩來源 **排除**<br>・`equals` → `ob_pool_data` **排除**；客戶兩來源 **排除**<br><br>八格中僅「`ob_pool_data` × `not_contains`」需要顯式 NULL 保留邏輯；其餘七格皆為 SQL 三值邏輯之自然結果，**不得**為其撰寫任何 NULL 特判 |
| BR-7 | **字面值比對（跳脫行為契約）**：使用者輸入之 `keyword` 一律視為**字面字串**。`%` / `_` / `[` / `]` / `^` 及跳脫字元本身於 `contains` / `not_contains` 之樣式中**不得**保有萬用字元語意。`equals` 採 `=` 比對，天然無萬用字元語意，**不得**改用 `LIKE` 實作。**跳脫之具體手段交 system-architect**（§12.1 SA-2），但無論手段為何，AC-9 之行為契約不可退讓 |
| BR-8 | **比對敏感度沿用資料庫 collation**：現行 DB 為 MSSQL 2022 / `Chinese_Taiwan_Stroke_BIN`（逐 byte 比較，大小寫敏感、全半形敏感）。本 feature **不**做任何正規化（不 lower、不全半形轉換、不 Unicode NFC/NFD 正規化），與 legacy SP 之 `LIKE '%白牌%'` 現行行為一致（US-183 已拍板決策 6）。此敏感度同時適用於**篩選比對**與**重複判定簽章**（AC-16） |
| BR-9 | **★重複判定簽章擴充 + 向後相容保證**：`normalizeConditionPayload`（`assignment-list.service.ts:525`）之 categorical 分支改為依 `operator` 分流：<br><br>`operator = 'in'` **或缺漏** → `` `${columnName}:cat:${去重排序後 values.join(',')}` ``（**與現行逐字元完全相同**）<br>文字運算子 → `` `${columnName}:catop:${operator}:${trim 後 keyword}` ``<br><br>**設計要點**：①區段標記由 `:cat:` 改為 `:catop:`，可證明無碰撞——`in` 形態之字串必為 `col:cat:` 開頭，文字形態必為 `col:catop:` 開頭，兩者前綴互斥，任何 `values` 內容皆無法偽造出 `catop` 區段②`keyword` 於簽章中**不做大小寫 / 全半形折疊**（BR-8），故 `contains "ABC"` ≠ `contains "abc"`③文字形態之簽章**不含** `values`（互斥保證其為空，BR-3）④其餘既有行為完全不變：條件依 `columnName` 排序、排除 system-fixed 欄位、併入 `logic`、空簽章視為永不衝突。<br><br>**向後相容硬性要求**：對任何**不含** `operator` 之既有 payload，新函式之輸出須與舊函式**逐字元相同**（AC-17）；此須以「同一組既有名單 payload 跑新舊兩版比對」之回歸測試證明，而非僅靠推論 |
| BR-10 | **顯示層單一格式化來源**：運算子中文標籤（`in`→「IN」/ `contains`→「包含」/ `not_contains`→「不包含」/ `equals`→「完全等於」）與條件描述字串之組裝，須由**單一共用格式化函式**提供，供**名單詳情 Drawer**、**名單定義列表**、**建立 / 編輯頁條件摘要**共同使用。禁止各頁各自拼字串（既有 `IN []` 顯示缺陷即源於此，AC-15）。**v1.1**：消費端移除「快照條件檢視」（快照未記錄條件，§13.3 A-7）——本規則之核心價值（單一格式化函式、禁止各頁自拼）**不變**，僅消費端少一個；日後 F066 補齊快照條件顯示時，須直接複用同一函式而非另寫一份 |
| BR-11 | **缺漏 `operator` 之統一 fallback**：`operator` 之預設值解讀**必須**集中於單一處（讀取 / 正規化之入口），使 SQL 建構、簽章、顯示三端取得同一結果。**禁止**各消費點各自寫 `cond.operator ?? 'in'`——分散預設是「顯式 `in` 與缺漏 `in` 行為分歧」之典型成因（AC-17 之風險點） |
| BR-12 | **不新增錯誤碼**：全數重用 `VALIDATION_ERROR`（422）與既有 `LIST_NO_DUPLICATE`（422）。理由見 §5.3 |
| BR-13 | **既有 warning 不得靜默丟棄**：`STAGE0_LIST_ESTIMATE_PARTIAL` 為後端**已產生**之資料，前端未渲染即等同讓使用者誤讀合計數字。本規則要求前端渲染後端回傳之該 warning，並沿用既有 warning 呈現管道（AC-13）。此呼應專案既有教訓「逾時靜默回 0 / 空白造成業務誤判」（見 [F112](F112-auto-suggest-categorical-options.md) BR-11、`project_stage0_estimate_timeout_dedup_index`） |
| BR-14 | **零可選值不得阻擋欄位可用性**：條件建構子之欄位下拉不得以「該 categorical 欄位無已登錄可選值」為由過濾；`values` 至少 1 個元素之驗證僅在 `operator = 'in'` 時適用（AC-11） |
| BR-15 | **無 migration / 無資料遷移**：`condition_payload` 為 JSON 欄位，新增 optional key 不涉及 schema 變更（已查證 `ObListDefinitionConditionItem` interface 具 index signature，entity 側僅需擴充 TypeScript 型別）。既有列不需回填、不需 backfill script |

## 7. UI/UX 需求

> Prototype = UI ground truth（CLAUDE.md）。本 feature 需 ui-ux-designer 更新 `prototypes/27a-list-create-draft.html`、`prototypes/27b-list-edit-draft.html`、`prototypes/30-stage0-estimate.html`。**本節僅定義行為契約，不定義視覺**。

- **運算子選擇器**：每列 categorical 條件於現行寫死之 `IN` 標籤位置改為四選一控制項；預設 `IN`（AC-1）。控制項型態（下拉 / 分段按鈕 / 其他）由 ui-ux-designer 定案（OQ-183-01）
- **互斥顯示**：`IN` → 既有核取清單；文字運算子 → 單一文字輸入框；兩者不同時出現（AC-5）
- **切換清除**：切換即清空另一側輸入，且**不得**保留為隱藏狀態（AC-5）
- **效能提示**：選用文字運算子時顯示告知性提示（不阻擋），文案與位置由 ui-ux-designer 定案（AC-12 / OQ-183-01）
- **驗證回饋**：關鍵字為空 / 純空白 / 超長時，於該條件列就地顯示錯誤並阻擋儲存（AC-8）；錯誤須指出是哪一列
- **條件顯示**：名單詳情 Drawer 與名單定義列表皆呈現「欄位 + 運算子 + 「關鍵字」」，不得空白或 `IN []`（AC-15）。**月跑快照條件檢視不在本輪範圍**（快照未記錄條件，§13.3 A-7）
- **Stage 0 部門估算頁**：渲染 `STAGE0_LIST_ESTIMATE_PARTIAL` warning，使用者可辨識逾時之 `listNo` 且理解合計已排除該名單（AC-13）；呈現位置 / 樣式由 ui-ux-designer 定案
- **兩進入點一致**：建立（27a）與編輯（27b）共用同一元件，行為逐項一致（AC-18）
- **零可選值欄位**：即使無可選值仍可加入條件並以文字運算子完成設定（AC-11）

## 8. 依賴關係

- **Blocked By**：
  - [F075](F075-manage-pooldata-field-whitelist.md)（`field_type = 'categorical'` 分類 + `data_source`；A-1 之 `spec_name` 新增流程）
  - [F050 v2.4](F050-create-list-definition.md)（`condition_payload` source of truth + 建立進入點宿主 + `preview-hit-count`）
  - [F051 v2.2.1](F051-edit-list-definition.md)（編輯進入點宿主）
  - [F109](F109-customer-source-filter-fields.md)（`data_source` 概念 + `I-CC-NULL-EXCLUDE-01`，AC-3 分流之依據）
  - **F114**（`customer_financial` 來源 + `I-CF-NULL-EXCLUDE-01`）—— ⚠️ **該 feature 之 spec 檔不存在**（`docs/specs/features/` 無 `F114-*.md`，但 `stage1-customer-financial-clause.ts` 檔頭明載「F114」且已實作）。本 feature 對 `customer_financial` 之要求（AC-10 / BR-5）以**程式碼中之不變式 `I-CF-NULL-EXCLUDE-01` / `I-CF-COMPOSER-SCOPE-01` 為權威依據**。此登錄落差屬既有技術債（同類情形見 [open-questions.md](../open-questions.md) OQ-DOC-01），本輪未回填
  - [F049 v2.0](F049-stage0-daily-estimate.md)（Stage 0 部門估算頁，AC-13 之修正對象）
- **Blocks**：無已知下游 feature
- **相關**：
  - [F112](F112-auto-suggest-categorical-options.md)（distinct 值自動建議；與本 feature 之 `in` 運算子**並存非取代**——`in` 仍是可窮舉欄位之首選表達，文字運算子解決的是無法窮舉之情境）
  - [F118](F118-copy-from-prev-month-duplicate-indicator.md)（「已複製過」判定重用同一正規化函式，簽章擴充後自動繼承）
  - [F066](F066-view-run-snapshot-detail.md)（月跑快照詳情；**本 feature 對其零影響**——快照未記錄篩選條件，v1.1 已 descope，見 §13.3 A-7）

## 9. 交叉參照

- **宿主 spec**：[F050 §5.4 `condition_payload` JSON Schema](F050-create-list-definition.md) / [F050 BR-6 / BR-7](F050-create-list-definition.md) / [F051](F051-edit-list-definition.md)
- **資料模型**：[data-model.md#ob_list_definitionobmlistdf--名單定義](../data-model.md#ob_list_definitionobmlistdf--名單定義)（**待 system-architect 補述 `operator` / `keyword`，見 §12.1 SA-1**）
- **錯誤代碼**：[error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)（`VALIDATION_ERROR` / `LIST_NO_DUPLICATE`；本 feature **不新增**）
- **警告紀錄**：[error-handling.md#assignment-run-warnings](../error-handling.md#assignment-run-warnings) —— **`STAGE0_LIST_ESTIMATE_PARTIAL` 已於 error-handling.md v1.20（2026-08-18）補登**（含 payload 結構 `{ code, listNo, message }`、與 `STAGE0_ESTIMATE_TIMEOUT` 之區別、前端呈現要求）。產生邏輯於 `stage0-estimate.service.ts:557-570`，決策來源為 [architecture-spec.md](../architecture-spec.md) §5.15 / [AD-E07-36](../implementation-log/AD-E07-v3.6-f049-stage0-dept-matrix.md) OQ-F049-07。AC-13 僅要求**前端渲染**此既有 warning，不新增偵測邏輯
- **待決事項**：[open-questions.md](../open-questions.md) §「F119 類別型文字比對運算子（2026-08-18）」
- **圖表**：[diagrams/F119-categorical-operator-flow.mmd](../diagrams/F119-categorical-operator-flow.mmd)
- **Prototype**：`prototypes/27a-list-create-draft.html` / `prototypes/27b-list-edit-draft.html` / `prototypes/30-stage0-estimate.html`

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%；後端測試須同時涵蓋 **SQLite unit 與 MSSQL spec 兩軌**（專案既有規範）
- 實作後須執行 `tsc --noEmit -p tsconfig.build.json`（vitest 不做型別檢查，見專案記憶 `feedback_vitest_no_typecheck`）

**後端關鍵案例**

| # | 案例 | 對應 |
|---|---|---|
| T-1 | `contains` 於 `ob_pool_data`：值含 K → 命中；不含 → 不命中；NULL → **不命中** | AC-2 |
| T-2 | `not_contains` 於 `ob_pool_data`：不含 K → 命中；**NULL → 命中**；含 K → 不命中 | AC-3（★不對稱） |
| T-3 | `not_contains` 於 `customer_core`：不含 K 且非 NULL → 命中；**NULL（含查無對應客戶）→ 不命中** | AC-3 / `I-CC-NULL-EXCLUDE-01` |
| T-4 | `not_contains` 於 `customer_financial`：同 T-3 | AC-3 / `I-CF-NULL-EXCLUDE-01` |
| T-5 | `equals`：值恰為 K 命中；「K專案」「KA」不命中；NULL 不命中 | AC-4 |
| T-6 | 關鍵字含 `%` / `_` / `[`：僅字面值命中，不因萬用字元誤命中其他列 | AC-9 |
| T-7 | 大小寫 / 全半形敏感：`contains "ABC"` 不命中值為 `abc` 之列 | BR-8 |
| T-8 | 關鍵字為空 / 純半形空白 / 純全形空白 U+3000 / 長度 101 → 422 `VALIDATION_ERROR` | AC-8 |
| T-9 | 互斥違規（`contains` + `values` 非空／`in` + `keyword` 非空）→ 422 | AC-6 |
| T-10 | numeric / date 條件帶 `operator` 或 `keyword` → 422 | AC-1 |
| T-11 | **★向後相容回歸**：既有一組無 `operator` 之 payload，新版 `normalizeConditionPayload` 輸出與舊版**逐字元相同** | AC-17 / BR-9 |
| T-12 | **★顯式 `in` ≡ 缺漏**：`{operator:'in', values:[...]}` 與 `{values:[...]}` 產生相同簽章、相同 SQL fragment、相同顯示字串 | AC-17 / BR-11 |
| T-13 | **★重複判定**：`contains K` 與 `not_contains K`（其餘全同）→ 建立第二筆**不**回 422 | AC-16 |
| T-14 | 重複判定：`contains K` 與 `contains K`（其餘全同）→ **仍**回 422 `LIST_NO_DUPLICATE` | AC-16 |
| T-15 | 重複判定：`in ['勁便利']` 與 `equals '勁便利'` → 判為**不同**名單 | AC-4 / AC-16 |
| T-16 | 重複判定：`contains 'ABC'` 與 `contains 'abc'` → 判為**不同**名單 | AC-16 / BR-8 |
| T-17 | **★五路徑一致**：同一條件同一組 fixture，五條路徑對同一案件之「是否命中」判定相同（含 NULL 案件） | AC-14 / BR-4 |
| T-18 | MSSQL spec 軌：三種運算子於真實 `Chinese_Taiwan_Stroke_BIN` collation 下之比對結果符合 T-1 ~ T-7 | AC-14 / BR-8 |
| T-19 | 關鍵字前後空白經 trim 後落庫；內部空白保留 | AC-8 / BR-2 |
| T-20 | `condition_payload IS NULL` 之 legacy 名單（路徑 B）行為完全不變 | AC-17 |

**前端關鍵案例**

| # | 案例 | 對應 |
|---|---|---|
| T-21 | 條件列顯示四選項、預設 `IN`；未動作時送出 payload 與實作前相同（不含 `operator` key，或含 `operator:'in'` 且簽章等價） | AC-1 / AC-17 |
| T-22 | 切換 `IN`→`包含`：核取清單隱藏、文字框出現且為空、原勾選值不隨送出 | AC-5 |
| T-23 | 切換 `包含`→`IN`：文字框隱藏、關鍵字不隨送出 | AC-5 |
| T-24 | 空 / 純空白關鍵字 → 就地顯示錯誤、阻擋儲存 | AC-8 |
| T-25 | 選用文字運算子顯示效能提示，且不阻擋操作 | AC-12 |
| T-26 | **名單詳情 Drawer** 與**名單定義列表**顯示「主約專案名稱 不包含「勁便利」」，非空白、非 `IN []`（**v1.1 移除快照斷言**） | AC-15 |
| T-27 | **Stage 0 部門估算頁渲染 `STAGE0_LIST_ESTIMATE_PARTIAL`**：warning 存在時可見且含 `listNo`；多筆時逐筆可辨識；不存在時不顯示 | AC-13 |
| T-28 | 建立頁與編輯頁之運算子選項 / 驗證 / 切換行為逐項一致 | AC-18 |
| T-29 | 無可選值之 categorical 欄位仍出現在欄位下拉，且可用文字運算子完成設定 | AC-11 |

**回歸**：既有 `in` 條件之建立 / 編輯 / 複製 / 重複判定 / Stage 1 執行 / Stage 0 估算行為與實作前逐項一致（AC-17）。

## 11. 實作 Checklist

- [ ] `ConditionItemDto` 新增 `operator` / `keyword` + 驗證（AC-1 / AC-6 / AC-8；`@ValidateIf` 依 `fieldType` 與 `operator` 分流）
- [ ] `ObListDefinitionConditionItem` interface 擴充（TypeScript 型別；**無** migration，BR-15）
- [ ] `buildCategoricalFragment()` 運算子分支（**唯一落點**，BR-4），含 `ob_pool_data` `not_contains` 之 NULL 保留
- [ ] `buildCustomerCoreClause` / `buildCustomerFinancialClause` 運算子分支（BR-5，**不得**新增 NULL 特判）
- [ ] 跳脫機制（BR-7，手段由 AD 定；MSSQL / PG 兩方言等價）
- [ ] `normalizeConditionPayload` 簽章擴充 `:catop:`（BR-9）+ 向後相容回歸測試（T-11）
- [ ] `operator` 預設值集中解讀之單一 fallback 落點（BR-11）
- [ ] 顯示層共用格式化函式（BR-10）並套用至名單詳情 Drawer / 名單定義列表 / 建立編輯頁條件摘要（**不含**快照，v1.1 descope）
- [ ] 前端 `CategoricalValuesPicker` 擴充為運算子感知元件（建立 + 編輯兩頁共用，AC-1 / AC-5 / AC-18）
- [ ] 前端效能提示（AC-12）
- [ ] 前端 `stage0-estimate-page.tsx` 渲染 `STAGE0_LIST_ESTIMATE_PARTIAL`（AC-13 / BR-13）
- [ ] 條件欄位下拉不因零可選值而過濾（AC-11 / BR-14）
- [ ] `prototypes/27a` / `27b` / `30` 由 ui-ux-designer 更新並經人工審閱
- [ ] **無** migration、**無**新錯誤碼、**無**新端點（BR-12 / BR-15）

## 12. 交付給 system-architect

> 本節為**明確交辦清單**。以下項目屬架構決策或非 spec-writer 之檔案，本輪**刻意未動**。

### 12.1 需要 system-architect 決定 / 撰寫之事項

| # | 項目 | 說明 | 本 spec 之建議預設 |
|---|---|---|---|
| **SA-1** | **`data-model.md` 之 `condition_payload` schema 補述**（**必辦**） | `#ob_list_definitionobmlistdf--名單定義` 段之 `condition_payload` 說明須補入 categorical 條件之兩個 optional key：`operator`（`in`/`contains`/`not_contains`/`equals`，缺漏 ≡ `in`）與 `keyword`（string，trim 後 1~100，僅文字運算子）；並明載**不需 migration**、既有列不回填 | 直接採用本文 §5.1 之欄位契約表 |
| **SA-2** | **LIKE 跳脫之技術手段** | AC-9 / BR-7 只定義行為契約。須決定：`ESCAPE` 子句與跳脫字元選擇、跳脫字元集（`%` `_` `[` 及跳脫字元本身；MSSQL 之 `[` 於 pattern 具字元類語意，PG 無）、參數化方式（樣式字串於應用層組裝 vs SQL 端 CONCAT）、MSSQL / PG 兩份 builder 之等價保證 | 應用層組裝樣式字串並以參數帶入 + 明示 `ESCAPE`；跳脫落點置於共用 helper，兩方言共用 |
| **SA-3** | **PG 路徑是否仍需同步擴充** | 專案已全面遷移 MSSQL（`project_mssql_full_migration`），但 `stage1-sql-builder.ts`（PG）仍在程式碼中且被 `buildStage1WhereConditions` 共用。須裁定 PG 路徑是否同步實作文字運算子（涉及 `[` 語意差異與測試成本） | 同步擴充（成本低——共用 fragment 建構器；不同步將使兩 builder 語意分歧、違反既有雙版本並存形態） |
| **SA-4** | **`normalizeConditionPayload` 之抽出與共用** | 該函式現為 `AssignmentListService` 之 private method，[F118](F118-copy-from-prev-month-duplicate-indicator.md) BR-1 已要求判定與儲存端共用同一正規化。擴充後是否抽為共用 util、以及 [F118](F118-copy-from-prev-month-duplicate-indicator.md) copy-duplicate-check 之連帶影響 | 抽為共用純函式（`normalize-condition-payload.ts`），行為須完全等價；F118 判定自動繼承 |
| **SA-5** | **AC-13 修正範圍認定（＝US-183 OQ-183-03）** | `STAGE0_LIST_ESTIMATE_PARTIAL` 不分觸發原因（文字運算子 / 既有數值 / `IN` 條件皆可能逾時）。須裁定修正範圍限於本 feature 觸發情境或一併涵蓋既有情境 | **不分觸發原因一律渲染**——同一 warning code、同一渲染路徑，技術上無法只挑文字運算子觸發之個案；限縮反而需要額外標記機制，成本更高 |
| **SA-6** | **效能防護是否需要下限保護** | US-183 已拍板決策 5 明示「不引入新效能機制」。但 `LIKE '%K%'` 對 `ob_pool_data`（約 167 萬列）為全表掃描。須評估是否需要（a）估算路徑之額外逾時保護（b）是否延伸抽樣估算基礎架構至文字運算子（＝US-183 OQ-183-02，非阻塞） | 本輪不引入；沿用既有逾時機制 + AC-12 提示 + AC-13 warning 渲染。若實測顯示月跑 Stage 1 本身逾時，再另案處理 |
| **SA-7** | ~~`keyword` 於快照固化之表現~~ **（v1.1 已收斂為 no-op，無須裁示）** | v1.0 以「名單條件於月跑時固化於快照」為前提，要求驗證快照序列化往返不遺失新 key。**該前提經查證不成立**——快照 `config_payload.listDefinitions[]` 從未攜帶 `condition_payload`（`assignment-run-pipeline.service.ts:1802-1806`），Stage 1 係於執行當下自 `ob_list_definition` **即時讀取**條件。故不存在快照往返之遺失風險 | **無須動作**。惟若日後另案為 F066 補齊快照條件記錄（§13.3 A-7），該案須將 `operator` / `keyword` 一併納入快照 payload 契約 |

### 12.2 [F050](F050-create-list-definition.md) 需同步之加性補述（**本輪刻意未改**）

沿用 [F118 §12.2](F118-copy-from-prev-month-duplicate-indicator.md) 之處置慣例（跨 feature 之既有條文不由本輪逕自改寫），以下三處 F050 條文於 F119 上線後將與實際契約不符，建議由 team lead 核可後以 **F050 v2.5** 一次補述：

| # | F050 現行條文 | 建議補述 |
|---|---|---|
| 1 | §5.4 規則表：「categorical 條件須含 `values: string[]`（≥1 元素）」 | 加註「**僅** `operator = 'in'`（或缺漏）時適用；文字運算子改為 `keyword` 必填，見 [F119](F119-categorical-text-match-operators.md) §5.1」 |
| 2 | BR-6（`condition_payload` 為 source of truth） | 加註「categorical 條件自 [F119](F119-categorical-text-match-operators.md) 起支援 `operator` / `keyword`，缺漏 `operator` ≡ `in`」 |
| 3 | BR-7 (1)「categorical 條件以 SQL `columnName IN (v1, v2, ...)` 語意」 | 加註「此為 `operator = 'in'` 之語意；`contains` / `not_contains` / `equals` 之語意見 [F119](F119-categorical-text-match-operators.md) BR-6 / BR-7」 |

> **未逕自改寫之理由**：F050 為 P0-MVP 之 Draft v2.4、承載 14 個來源 Story 之契約，且其 §5.4 / BR-7 為多份下游 spec 交叉引用之權威段落；加性補述雖無爭議，但屬跨 feature 之權威條文變更，依專案「spec 與實作落差先停下修上游」之慣例應由 team lead 核可後統一為之，避免同一輪產生兩份互指之部分修訂。

### 12.3 不屬 spec-writer 且本輪未動之檔案

- `docs/specs/data-model.md`（system-architect；需求見 SA-1）
- `docs/specs/architecture-spec.md`（§18.5 `buildStage1WhereConditions` 段落需反映運算子分支）
- `docs/specs/implementation-log/AD-E07-*`（本 feature 之 AD 尚未建立）
- `prototypes/**`、`docs/ui-ux-design-overview.md`（ui-ux-designer）
- 任何程式碼 / 測試（tdd-implementation / test-generator）

## 13. 假設與裁決偏離

### 13.1 對 US-183 之裁決與新增（★ 本 spec 之核心產出）

| # | US-183 原文 / 未定義處 | 本 spec 裁決 | 理由 |
|---|---|---|---|
| **D-1** | 未定義 `operator` 應為 categorical 之子屬性、或新增 `fieldType`（如 `text`） | **採 categorical 子屬性**（`operator` + `keyword`），**不**新增 `fieldType` | ①白名單 `field_type` 為欄位層級屬性（[F075](F075-manage-pooldata-field-whitelist.md)），新增 `text` 型別將迫使同一欄位在「勾選可選值」與「文字比對」間二擇一，直接違反 US-183 AC-1「四種運算子並列供擇一」②`fieldType` 為三值 ENUM 且與 F075 `field_type` 對齊，新增值需連動白名單 schema、seed、UI 分組 → 波及面遠大於加兩個 optional key③加性擴充使 AC-17 向後相容「免於實作即成立」 |
| **D-2** | 運算子命名（US-183 已拍板決策 1 明列 `in` / `contains` / `not_contains` / `equals`） | **原樣採用，不更動** | 已為業務拍板項；且四值語意直白、與 SQL / 通用查詢 DSL 慣例一致。曾考慮 `like` / `not_like`（貼近 SQL）但拒絕——會把實作手段洩漏進業務契約，且 `equals` 並非 `LIKE` 實作（BR-7） |
| **D-3** | AC-7「阻擋儲存並顯示驗證錯誤」未定義關鍵字長度上限 | **trim 後 1~100 字元** | 驗證規則不可無界。100 為防禦性上限（現行最長 categorical 來源欄位 `ob_pool_data.spec_name` 為 nvarchar(45)），且不與任何 schema 長度耦合（per-column 動態驗證會使驗證邏輯依賴目標表 schema，跨三來源難以維持） |
| **D-4** | AC-5 只規範 **UI** 之互斥與清除，未規範**後端**收到違反互斥之 payload 時該如何 | **新增 AC-6：後端一律 422 拒絕**（不靜默丟棄、不靜默正規化） | ①AC-5 之「不得殘留並一併送出」若無伺服器端保證，前端狀態管理一出錯即靜默落庫髒資料，且該髒資料會影響簽章（AC-16）與顯示（AC-15）②沿用 [F050](F050-create-list-definition.md) BR-6 對 schema 違規一律拒絕之既有慣例；F050 之靜默正規化僅適用 system-fixed 欄位（BR-14），語境不同 |
| **D-5** | US-183 背景明示動機為「值域極廣、無法窮舉可選值之欄位」，但未定義此類欄位在 UI 上是否可被選取 | **新增 AC-11：零可選值之 categorical 欄位仍須可加入條件** | 若欄位下拉以「無可選值」過濾，則本 feature 之核心業務動機無法達成（新增之 `spec_name` 必然零可選值）。此非新增需求，而是使 US-183 之既述動機**可達成**之必要條件 |
| **D-6** | AC-12 述及「三處」路徑（Stage 0 試算 / 命中預估 / 月名單分派執行） | **擴為五條路徑**（AC-14） | 逐一查證 `buildStage1WhereConditions` 之呼叫端共 5 處（MSSQL 下推 / PG 下推 / JS filter chain / Stage 0 估算 / 草稿抽樣估算）。US-183 之「三處」為業務視角之分類，技術上對應 5 個呼叫點；一致性契約須涵蓋全部，否則遺漏之路徑即為分歧來源 |
| **D-7** | AC-14 只要求「業務結果不可退讓」，簽章格式交 spec-writer / architect | **定義 `:catop:` 區段格式（BR-9）並附無碰撞論證與向後相容硬性要求** | 現行簽章 `${col}:cat:${values}` 完全不含運算子；若沿用 `:cat:` 加尾綴，理論上可被 `values` 內容偽造（極低機率但不可證偽）。`:catop:` 使兩形態前綴互斥，無碰撞可被**證明**而非估計。向後相容則以「新舊輸出逐字元相同」之回歸測試而非推論來保證（T-11） |

### 13.2 假設清單

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`spec_name` 不在部署 seed 白名單內**（已逐筆查證 `pooldata-field-whitelist.json`）。使用者須先經 [F075](F075-manage-pooldata-field-whitelist.md) 新增該欄位方能使用 US-183 之主要業務範例。本 feature **不**負責 seed 該欄位（seed 屬 F075 / F076 之範疇，且 dev / prod 白名單內容可能已由管理者新增而與 seed 不同） | 已查證；**建議人工確認**是否要另案將 `spec_name` 納入 seed |
| A-2 | **`ObListDefinitionConditionItem` 具 index signature**（`[key: string]: unknown`，已查證 `ConditionItemDto` 亦然），故新增 optional key 於型別層為純加性，不破壞既有序列化 / 反序列化 | 已查證 |
| A-3 | **`customer_core` / `customer_financial` 之全部 categorical 欄位皆可直接套用文字比對**——現行 `DIRECT_MATCH_COLUMNS`（`gender` + 5 個 `_desc`）為直接值比對，天然支援 `LIKE`；`cpost_city` 為衍生欄（`LEFT(cpost_city,3)`），文字運算子套用於**衍生後之值**或**原始欄位值**須由 architect 明確（本 spec 預設：套用於**與 `in` 相同之運算式**，即衍生後之值，以維持同一欄位在四種運算子下之比對對象一致） | **交 system-architect 確認**（併入 SA-2） |
| A-4 | **`date_of_birth`（年齡）為 numeric 型**，不受本 feature 影響；`customer_financial` 之件數 / 次數欄亦為 numeric | 已查證 seed |
| A-5 | **US-183 AC-16 末段之交叉引用有誤植**：文中「AC-15 已明確排除」應為「AC-16」（v1.1→v1.2 AC 順移後之殘留），且 DoD 列表為 AC-1~AC-16。此為純交叉引用筆誤、**不影響任何業務裁定**，本 spec 依實際語意（＝AC-16 自身之範圍澄清）撰寫，**未**修改 US-183 | 已回報 team lead；不阻塞 |
| A-6 | **`equals` 之實作採 `=` 而非 `LIKE`**（BR-7）。若 architect 因參數型別 / collation 理由改採 `LIKE`（無萬用字元之樣式），行為須完全等價且 AC-9 仍須成立 | spec-writer 裁定，architect 可覆寫但須維持 AC 契約 |

### 13.3 v1.1 範圍變更：快照條件顯示 descope（A-7）

| 項目 | 內容 |
|---|---|
| **A-7** | **月跑快照未記錄篩選條件 —— F066 既有功能缺口，非本 feature 造成，v1.1 已 descope 並另開票** |
| **v1.0 之錯誤前提** | v1.0 AC-15 / §5.2 / BR-10 將「快照條件檢視」列為**既有顯示端**，認定本輪只需擴充顯示格式。**此前提不成立。** |
| **技術現況（已逐項驗證）** | ①`apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts:1802-1806` —— `buildConfigPayload()` 之 `listDefinitions[]` 僅攜帶 `listNo` / `listNm` / `cardType` / `crEnabled` / `caseStatus` 五個欄位，**從未攜帶 `condition_payload`**②前端 6 個 snapshot 元件（含 `snapshot-detail-page.tsx`）grep `conditionPayload` / `columnName` **零命中**——`run-summary-page.tsx:80` 之唯一 `columnName` 命中為 `skippedCases` metadata 之註解，與篩選條件無關③相對地，**兩個真實顯示端已確實渲染條件**：`_components/ListDetailDrawer.tsx:296`（資料源 `GET /assignment/lists/:listNo/full-snapshot`，**即時讀取** `ob_list_definition.condition_payload`，非月跑凍結快照）與 `list-definition-page.tsx:188` |
| **定性** | 這不是「顯示格式要修」，而是「快照條件顯示這項功能從未實作」。屬 [F066](F066-view-run-snapshot-detail.md) 之既有缺口 |
| **descope 理由（使用者裁決）** | ①**業務影響低**：名單一經推進至 `dept_ratio` 階段後 `condition_payload` 即唯讀鎖定（[F051](F051-edit-list-definition.md) 限 `stage = 'draft'`），而月跑之前置條件為全部 active 名單 `stage = 'ready'`（[F061](F061-trigger-assignment-run.md)），故「名單詳情 Drawer 之即時讀取值」與「月跑當下之條件」在正常流程下**無實質差異**——使用者要回溯月跑用了什麼條件，經 Drawer 查看即可②**與本 feature 之定性不符**：F119 全篇為**純加性**擴充（無 migration、無新端點、無新錯誤碼）；納入快照條件顯示須連帶改 `buildConfigPayload` 之快照 payload 契約、[F066](F066-view-run-snapshot-detail.md) spec、prototype `35-*`，並須處理「既有快照無此欄位」之向後相容，範圍與風險等級皆躍升③**不阻塞本 feature 之任何 AC**：AC-14 五路徑一致性、AC-16 重複判定、AC-17 向後相容均與快照無關 |
| **處置** | **另開票**（建議掛 F066，補齊「月跑快照記錄並顯示各名單篩選條件」）。屆時**必須複用** BR-10 之同一格式化函式，不得另寫一份（否則 `IN []` 類顯示缺陷會在新頁面重演） |
| **US-183 之對應處置** | US-183 AC-13 之同步 descope 由 **product-analyst** 執行；本 spec **未**修改 US-183（US-183 已通過人工審閱閘，非 spec-writer 可自行變更） |

## 14. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-08-18 | **AC-15 descope：快照條件顯示移出範圍**（使用者裁決）。v1.0 誤將「月跑快照條件檢視」列為既有顯示端；經查證快照 `config_payload.listDefinitions[]` 從未攜帶 `condition_payload`（`assignment-run-pipeline.service.ts:1802-1806`）、前端 snapshot 元件零條件渲染邏輯——屬 [F066](F066-view-run-snapshot-detail.md) 既有功能缺口，非顯示格式問題，另開票處理。AC-15 縮為名單詳情 Drawer + 名單定義列表兩端；§5.2 端點表、BR-10 消費端、§7 / §8 / §10 / §11 同步縮減；§12.1 SA-7 收斂為 no-op；新增 §13.3 A-7 完整記錄技術證據與 descope 理由。**AC / BR 總數不變（18 / 15）**，仍無 migration / 無新端點 / 無新錯誤碼。US-183 AC-13 之對應 descope 由 product-analyst 執行，本輪未改 US-183 |
| v1.0 | 2026-08-18 | 初版（DRAFT，依已通過人工審閱閘之 US-183 v1.2 撰寫）。18 AC / 15 BR；US-183 之 16 AC 逐條展開並新增 2 條（AC-6 後端互斥防呆、AC-11 零可選值欄位可用性，理由見 §13.1 D-4 / D-5）。核心裁定：D-1 採 categorical 子屬性而非新增 `fieldType`；D-6 一致性範圍自「三處」擴為**五條執行路徑**（查證 `buildStage1WhereConditions` 呼叫端）；D-7 重複判定簽章採 `:catop:` 區段並附無碰撞論證與向後相容硬性回歸要求。**不新增錯誤碼、不新增端點、不需 migration**。§12 列出交付 system-architect 之 7 項（含 `data-model.md` 補述）與 F050 之 3 處加性補述建議（**本輪刻意未改寫 F050**，沿用 F118 §12.2 慣例） |
