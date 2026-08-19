---
type: implementation-log
feature_id: F119
feature_name: 類別型篩選欄位文字比對運算子（包含／不包含／完全等於）
status: complete
last_updated: 2026-08-18
---

# F119: 類別型篩選欄位文字比對運算子 — Implementation Log

依 `AD-E07-50` v1.2（技術權威）+ `F119` v1.1（業務契約 18 AC / 15 BR）+ 四份 prototype（UI ground truth）
+ `ui-ux-design-overview.md` 附錄 C（C-1~C-19）實作；約束環由 test-generator 於 `46b00b7` 先行撰寫（對實作盲眼）。

**本實作未新增、修改、弱化或 skip 任何測試檔**。兩項測試爭議以 SendMessage 交 `tg-f119` 裁決，
由其自行改寫測試（見 §測試爭議）。

## Test Results Summary

### 約束環（13 檔 / 254 案例通過，其中 F119 新增 107 案例）

| 檔案 | 案例 | 狀態 |
|---|---|---|
| `f119-categorical-operator-fragment.spec.ts` | 28 | PASS |
| `f119-customer-core-categorical-operator.spec.ts` | 8 | PASS |
| `f119-customer-financial-categorical-operator.spec.ts` | 6 | PASS |
| `f119-condition-validation.spec.ts` | 13 | PASS |
| `f119-signature-backcompat-duplicate.spec.ts` | 10 | PASS |
| `f119-preview-hit-count-text-operators.spec.ts` | 7 | PASS |
| `f119-categorical-collation.mssql.spec.ts`（真實 MSSQL BIN collation） | 7 | PASS |
| `_utils/__tests__/f119-labels.test.ts` | 6 | PASS |
| `_utils/__tests__/f119-condition-summary.test.ts` | 7 | PASS |
| `list-create-draft-page.test.tsx`（含 F119 11 案例） | 69 | PASS |
| `list-edit-draft-page.test.tsx`（含 F119 4 案例） | 31 | PASS |
| `list-kanban-page.test.tsx`（含 F119 3 案例） | 42 | PASS |
| `stage0-estimate-page.test.tsx`（含 F119 4 案例） | 20 | PASS |

後端 7 檔 79 案例、前端 6 檔 175 案例，全數綠燈。

### 關鍵 AC / 不變式覆蓋

| 項目 | 驗證方式 |
|---|---|
| BR-6 NULL 八格矩陣 | `MATRIX-001~008` 以 better-sqlite3 真實執行 fragment 比對列選取結果 |
| BR-7 跳脫（AC-9） | `LITERAL-001~004`：`100%` 不誤命中 `1000元`、`A_B` 不誤命中 `AXB` |
| BR-8 大小寫／全半形敏感 | 真實 MSSQL `Chinese_Taiwan_Stroke_BIN`（`COLLATION-001` 先查證 collation 前提） |
| AC-17 簽章向後相容 | `T-11`/`T-12`：顯式 `in` ≡ 缺漏 `operator`，`:cat:` 區段逐字元不變 |
| AC-16 重複判定 | `T-13~T-16`：contains vs not_contains 不判重複、同運算子同關鍵字仍 422 |
| `I-CATOP-CASEYEAR-EXCLUDE-01` | createList / previewHitCount 兩路徑各一真紅案例 + 前端下拉 disabled |

### 型別檢查

- `apps/api`：`npx tsc --noEmit -p tsconfig.build.json` → 0 error
- `apps/web`：`npx tsc -b --noEmit` → 0 error

### 既有測試回歸

- `apps/web` 全套件：**1687 passed / 0 failed**（131 檔）
- `apps/api` 非 `.mssql` 套件：**2958 passed**；每次執行有 1 個「單跑必過、合跑偶紅」之非決定性檔案
  （兩次執行為不同檔案：`ready-summary-detail-page` / `legacy-grep-regression`），屬既知 CPU 競爭偽紅
- 實作過程發現並修正 1 個**真實回歸**（見 §實作決策 4）

## Files Changed

### 後端（修改）

| File Path | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/assignment/stage1/stage1-query-composer.ts` | modified | 新增 `CategoricalOperator` / `resolveCategoricalOperator` / `isTextCategoricalOperator` / `escapeLikeKeyword` / `CategoricalOperatorFragmentInput` / `buildCategoricalOperatorFragment`；`buildCategoricalFragment` 之 `in` 與三種文字運算子皆改由新函式產生（`in` 輸出逐字元不變）；`caseyear` 加 defense-in-depth 防線 |
| `apps/api/src/modules/assignment/stage1/stage1-customer-core-clause.ts` | modified | `DIRECT_MATCH_COLUMNS` 與 `cpost_city` 合併為單一分支，經 `buildCustomerCoreCategorical` 委派共用函式（`nullKeptOnNotContains: false`） |
| `apps/api/src/modules/assignment/stage1/stage1-customer-core-clause-mssql.ts` | modified | 同上（`buildCustomerCoreCategoricalMssql`），與 PG 版逐條等價 |
| `apps/api/src/modules/assignment/stage1/stage1-customer-financial-clause.ts` | modified | `categorical` 分支經 `buildCustomerFinancialCategorical` 委派共用函式 |
| `apps/api/src/modules/assignment-list/dto/condition-item.dto.ts` | modified | 新增 `operator`（`@IsIn` 四值）/ `keyword`（`@IsString` + `@Length(1,100)`）；**修改**既有 `values` 之 `@ValidateIf` 條件為 `categorical && !isTextOperator` |
| `apps/api/src/modules/assignment-list/assignment-list.service.ts` | modified | 新增 `KEYWORD_MAX_LEN` / `TEXT_OPERATOR_EXCLUDED_COLUMNS` 常數、`assertCategoricalOperatorRules`（驗證第 4 步，兩個驗證入口共用）、`normalizeCategoricalKeywords`（BR-2 trim 落庫）；`normalizeConditionPayload` 擴充 `:catop:` 區段並補 `systemFixedColumnNames` 預設值；createList / updateList / previewHitCount 三處接上 trim 步驟 |
| `apps/api/src/database/entities/ob-list-definition.entity.ts` | modified | `ObListDefinitionConditionItem` 新增 `operator?` / `keyword?`（純加性，無 migration） |

### 前端（新增）

| File Path | Change Type | Description |
|---|---|---|
| `apps/web/src/pages/assignment/_utils/condition-summary.ts` | new | `formatConditionSummary()`（BR-10 唯一格式化來源）+ `ConditionSummaryDecoder` + `toSummaryDecoder()` 轉接器 |
| `apps/web/src/pages/assignment/_components/categorical-values-picker.tsx` | new | 建立／編輯兩頁**共用**之 `CategoricalValuesPicker`（原為兩份副本，見 §實作決策 3）＋ `keywordError()` / `applyOperatorSwitch()` / `needsOperatorSwitchConfirm()` 純函式 ＋ `OperatorSwitchConfirmModal` |

### 前端（修改）

| File Path | Change Type | Description |
|---|---|---|
| `apps/web/src/api/assignment-list.ts` | modified | `ConditionItem` 新增 `operator?` / `keyword?` |
| `apps/web/src/pages/assignment/_utils/labels.ts` | modified | 新增 `CATEGORICAL_OPERATORS` / `OPERATOR_LABEL` / `operatorLabel()` / `resolveCategoricalOperator()`（前端唯一 fallback 落點）/ `isTextOperator()` / `trimKeyword()` / `KEYWORD_MAX_LEN` / `TEXT_OPERATOR_EXCLUDED_COLUMNS` / `TEXT_OP_PERF_HINT` |
| `apps/web/src/pages/assignment/list-definition-page.tsx` | modified | `renderConditionChips` 改呼叫 `formatConditionSummary`；chip 加 `data-condition-summary` + `max-w-full truncate` + `title`（C-14） |
| `apps/web/src/pages/assignment/_components/ListDetailDrawer.tsx` | modified | 條件標題行改由 `formatConditionSummary` 產生；文字運算子條件另加運算子徽章（靛紫）+ 關鍵字徽章（藍）（C-15） |
| `apps/web/src/pages/assignment/list-create-draft-page.tsx` | modified | 移除自有 picker 副本改用共用元件；`BuilderCondition` 加 `operator?`/`keyword?`；`toConditionItem` 依形態分流（`in` 不送 `operator` key，C-17）；`isConditionComplete` 納入關鍵字；`validate()` 加 AC-8 就地驗證；複製上月保留運算子形態；接上二次確認 modal |
| `apps/web/src/pages/assignment/list-edit-draft-page.tsx` | modified | 同上；另含載入既有 `operator`/`keyword` 預填（AC-18） |
| `apps/web/src/pages/assignment/stage0-estimate-page.tsx` | modified | 新增 `STAGE0_LIST_ESTIMATE_PARTIAL` 頁首 amber banner（逐筆 `stage0-partial-item`，置於警告堆疊最上方）+ 件數 KPI「不完整」徽章（C-18） |

## Architectural Decisions

1. **`in` 亦路由至共用函式**（`I-CATOP-SINGLE-FRAGMENT-01`）：AD §3.3 只要求文字運算子共用，但不變式文字為「全部四運算子」。
   已確認新舊 `in` 輸出逐字元相同（`"${col}" IN (:...cat${n})` + 同 params），故一併收斂。
   **例外**：`caseyear` 之 `IN` 分支依 AD §3.8 明文「保持現狀完全不變」而未改動（該分支做整數轉型，與關鍵字比對／NULL 判斷正交）。

2. **`formatConditionSummary` 的 decoder 介面**：AD §3.6 稱沿用 `use-condition-decoder.ts` 之 `ConditionDecoder`，
   但該既有介面為 `{ decodeField, decodeValue, decodeValues }`，而 prototype 與環的斷言採 `{ fieldDisplayName, valueLabel }`。
   採 prototype 形狀定義 `ConditionSummaryDecoder`，另提供 `toSummaryDecoder()` 轉接既有 hook——
   維持單一格式化來源，且不改動既有 hook 契約（零回歸面）。

3. **`CategoricalValuesPicker` 由兩份副本收斂為單一共用元件**：AD §3.6 假設「建立／編輯兩頁共用同一元件」，
   但實際程式碼為兩份幾乎逐字相同的頁內副本（編輯頁註記「編輯頁自有副本」）。
   若各自加運算子邏輯，AC-18（兩進入點行為一致）將由「同一份程式碼」退化為「兩份靠測試守住」。
   已抽出至 `_components/categorical-values-picker.tsx`，兩頁 import 同一元件。既有值選擇器測試（全選／清除／完成／chip）全數維持綠燈。

4. **修正一個真實回歸（自行發現）**：`buildCategoricalOperatorFragment` 之 JSDoc 原以反引號舉例客戶來源欄位運算式，
   觸發既有 `I-CC-COMPOSER-SCOPE-01` 靜態掃描（`TS-F109-COMPSCOPE-001` 禁 composer 出現反引號／單引號包住的 `cc.<col>`）。
   已改寫該註解為不含該類字面片段（改為指向兩個 clause 檔案）。此為本輪唯一由本實作造成的既有測試紅燈，已修復。

5. **驗證層順序**：`assertCategoricalOperatorRules` 置於既有「min-count → reserved → 同名重複 → whitelist」之後為第 4 步，
   兩個驗證入口（`validateConditionPayload` / `validateConditionsForPreview`）共用同一 private helper，
   避免 `I-CATOP-VALIDATION-LAYER-01` 所禁止的 DTO 層多組 `@ValidateIf` 互斥組合。

## 測試爭議與裁決（交 tg-f119，未自行修改測試）

| # | 爭議 | 裁決 |
|---|---|---|
| 1 | `F119-FE-010` 查詢 `value-checkbox-0-0`，但同 describe 之 mock 給 `prod_kind` 的 `optionValue` 為 `'01'`；本專案 testid 慣例為 `value-checkbox-{列 idx}-{optionValue}`（同檔既有測試 L372/L424/L577 可佐證）→ 該 testid 不可達 | tg-f119 已修測試為 `value-checkbox-0-01` |
| 2 | `F119-EDIT-002` 以非空關鍵字切回 IN 並期待面板立即切換，與 prototype `setCondOperator()` 及附錄 C C-3~C-5「另一側有內容須二次確認」互斥 | tg-f119 裁定**維持 prototype 設計**，已改寫測試為「先出現 `operator-switch-confirm-modal`、`operator-switch-loss` 須列出『勁便利』、按 `operator-switch-confirm` 後才切換」，並新增對照組 `F119-EDIT-002b`（兩側皆空 → 不彈窗）。實作已據此補上確認 modal |

## Blocking Issues

無阻塞。以下為**非本 feature 造成**、但影響驗收判讀之環境議題，供 team lead 追蹤：

- **`stage1-sql-pushdown.mssql.spec.ts` 之既有紅燈與 F119 無關（已由 team lead A/B 對照證實）**：

  | 條件 | 結果 |
  |---|---|
  | 實作前 第 1 次 | 15 failed / 8 passed |
  | 實作前 第 2 次 | 16 failed / 8 passed |
  | 實作後（受併跑污染） | 22 failed / 3 passed（離群值） |
  | 實作後（背靠背乾淨重跑） | **15 failed / 8 passed** |

  乾淨條件下實作前後完全一致。**不需處理。**

- **根因（本實作查證，供日後不再重查）**：`.mssql.spec.ts` 之 `.env.test.mssql` 指向**真實 dev CDMP**
  （172.20.202.212），而該 spec 之 count 斷言（如 `expect(count).toBe(1)`）隱含「dev pool 近乎為空」之前置條件。
  實查 dev `ob_pool_data` 現有 **1,679,496** 列（`prod_kind='01'` 佔 **1,245,613** 列），spec 僅 seed 2~3 筆 P3A 前綴列
  → 症狀為 `expected 75771 to be 1`。該 spec 之 JS oracle 與 SQL 下推兩側同源於 `buildStage1WhereConditions`，
  兩側皆回傳 ~7.5 萬列，證明是**資料面**而非 SQL 面。另查到 2 筆 `appl_no LIKE 'P3A%'` 殘留列，
  為先前 worker crash 未執行 `cleanupP3A` 所致。
- 上述 spec 所需之 `prod_kind IN` SQL 已逐字比對確認與 F119 上線前相同
  （舊：`` `"${poolDataCol}" IN (:...${paramName})` ``；新：共用函式之 `` `${colExpr} IN (:...${paramName})` ``，
  `colExpr = "${poolDataCol}"`、`paramName = cat${paramIdx}`）。

## 部署前置條件（沿用 AD §10.1，未變更）

`ob_pool_data.spec_name`（主約專案名稱）不在 `pooldata-field-whitelist.json` 部署 seed 內。
四運算子機制本身不受影響，但 US-183 之代表性業務範例需先經 F075 於目標環境新增該欄位方能示範。
