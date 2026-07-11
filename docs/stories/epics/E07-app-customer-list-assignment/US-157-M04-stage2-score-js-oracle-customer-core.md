---
last-updated: 2026-06-24
version: v1.0
change-summary: "新增 Story：月名單分派 Stage 2 計分 JS oracle 補齊 customer_core 欄位取值——resolveColumnValue 目前對 CUS_SEX / AGE / CAREA_NO1/NO2 / CELLULAR / EDUCAT_BACK / HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM / LOAN_RATE 全回空字串（不計分），需補 customer_core JOIN 並對齊 PG 下推表達式"
---

# US-157：月名單分派 Stage 2 計分 JS Oracle 補齊 customer_core 欄位取值

> **Story ID**：US-157
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5
> **Feature**：F103 月名單分派計分引擎欄位來源修正

---

## User Story

**As a** 系統（月名單分派引擎 JS oracle 路徑）
**I want** `resolveColumnValue` 能取得 customer_core 的客戶屬性欄位值
**So that** JS oracle 計分結果（非 PG 路徑）與 PG 下推計分結果等價（EQ DoD），確保測試的 golden path 能真實驗證計分邏輯

---

## 背景說明

Stage 2 計分有兩套平行實作：

| 路徑 | 入口 | 環境 |
|------|------|------|
| PG 下推 SQL | `buildStage2ScoreExpr`（stage2to4-sql-builder.ts） | 正式月名單分派（DB_TYPE=postgres） |
| JS oracle | `computeScore` → `resolveColumnValue`（assignment-run-pipeline.service.ts） | 單元測試 golden path / 非 PG 環境 |

目前 `resolveColumnValue` 的 switch 僅處理 `LIST_MONTH`、`PROJECT_TP`、`CAR_YEAR`、`COMMISSION`（已是死碼）；其餘所有欄位（含 CUS_SEX / AGE / CAREA_NO1 等所有 customer_core 欄位）走 default，回傳空字串 `''`，不計分。

根據 AD-E07-10-L，下列 customer_core 欄位需在 JS oracle 中取值：

| column_name | 需取資料 | 取值方式（JS） |
|-------------|----------|----------------|
| CUS_SEX | customer_core.gender | 字串直接取（缺值 `'3'`） |
| AGE | customer_core.date_of_birth | `new Date().getFullYear() - dob.getFullYear()`（缺值 `0`） |
| CAREA_NO1 | customer_core.home_phone | `home_phone ? 1 : 0` |
| CAREA_NO2 | customer_core.contact_phone | `contact_phone ? 1 : 0` |
| CELLULAR | customer_core.mobile_phone | `mobile_phone ? 1 : 0` |
| EDUCAT_BACK | customer_core.education_code | 字串直接取（缺值 `''`） |
| HPOST_NUM_NM | customer_core.residential_zip | 字串直接取（缺值 `''`） |
| CPOST_NUM_NM | customer_core.mailing_zip | 字串直接取（缺值 `''`） |
| CO_NUM_NM | customer_core.company_zip | 字串直接取（缺值 `''`） |
| LOAN_RATE | ob_pool_data.loan_rate | 數值直接取（缺值 `0`） |

其中 `ADD_UN_CAPITAL`（ob_arreturndf_min_cap.add_un_capital）的 JS oracle 取值亦需在此 story 或 US-156 中明確決議。

---

## Acceptance Criteria

### AC-1：resolveColumnValue 補齊全部 customer_core 欄位

- **Given** 月名單分派 JS oracle 路徑（`DB_TYPE != 'postgres'` 或單元測試環境）呼叫 `computeScore`
- **When** active 欄含 CUS_SEX / AGE / CAREA_NO1 / CAREA_NO2 / CELLULAR / EDUCAT_BACK / HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM
- **Then** `resolveColumnValue` 對上述每個欄位回傳符合 AD-E07-10-L 語意的值，而非空字串 `''`；具體取值邏輯需與 PG 下推 `resolveColumnSource` 的表達式等價（如 CAREA_NO1 → `home_phone ? 1 : 0` 對應 PG `(cc.home_phone IS NOT NULL)::int`）

### AC-2：COMMISSION 死碼從 resolveColumnValue 移除

- **Given** `resolveColumnValue` 中存在 `case 'COMMISSION'`
- **When** 稽核確認 COMMISSION 在 legacy dump 完全不存在
- **Then** 從 `resolveColumnValue` switch 移除該 case；移除後所有既有測試仍通過

### AC-3：JS oracle 計分結果與 PG 下推 EQ 等價

- **Given** 相同案件資料（pool + customer_core 欄位值）
- **When** 分別以 JS oracle（`computeScore`）與 PG 下推（`buildStage2ScoreExpr` 生成 SQL）計分
- **Then** 兩者計分結果相同（或差距在 EQ DoD 允許誤差內）；`stage2to4-sql-builder.spec.ts` 的 EQ 群組測試全部通過

### AC-4：LOAN_RATE 欄位確認

- **Given** `LOAN_RATE` 在 legacy dump 的 E5/S5 card_type 有使用；AD-E07-10-L 列為 `ob_pool_data.loan_rate`
- **When** 執行稽核
- **Then** `resolveColumnValue` 有 `case 'LOAN_RATE'`，回傳 `pool.loan_rate ?? 0`（numeric）；PG 下推對應 `COALESCE(o.loan_rate, 0)` 已有或補齊；兩邊等價

---

## 技術備註

- **函式位置**：`apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` → `resolveColumnValue`（line ~1073）
- **JS oracle 的 customer_core 資料來源**：
  - `computeScore` 目前簽章：`(pool: ObPoolData, cardType, cardVersion, activeColumns, allScores)`
  - customer_core 資料目前**未傳入**此函式；需確認擴充簽章或由呼叫端 pre-fetch 並附帶

  [SCHEMA GAP-157-01] `computeScore` 函式目前無 customer_core 參數。補齊需決定：(a) 擴充函式簽章加 `customerCore?: CustomerCore` 參數，或 (b) 呼叫端預先查詢後將客戶屬性合併至 pool 物件。需 spec-writer 決議後實作。

- **ADD_UN_CAPITAL 的 JS oracle 取值**：ob_arreturndf_min_cap 資料目前未在 pipeline 中載入。補齊方式需決議：(a) `computeScore` 另傳 `arCapital?: number` 參數，或 (b) 由呼叫端 batch 查詢後附帶於 pool 物件自訂欄位。

  [SCHEMA GAP-157-02] JS oracle 無 ob_arreturndf_min_cap 存取路徑；需 spec-writer 決定資料流。

- **AGE 計算精度**：`new Date().getFullYear() - dob.getFullYear()` 為近似值（未考慮當年度尚未過生日）；PG 端 `EXTRACT(YEAR FROM age(date_of_birth))` 精確到月。需確認兩邊是否接受此差異，或統一為近似算法。

---

## [SCHEMA GAP]

- **[SCHEMA GAP-157-01]**：`computeScore` 函式簽章需擴充以接收 customer_core 欄位資料。現行簽章不含此參數，補齊需動函式介面及所有呼叫點。spec-writer 需決議介面設計再實作。
- **[SCHEMA GAP-157-02]**：JS oracle 路徑無 ob_arreturndf_min_cap 存取路徑。ADD_UN_CAPITAL 的 JS oracle 取值設計需 spec-writer 決議（與 US-156 PG 下推分開追蹤）。

## [OPEN QUESTION]

- **OQ-157-01**：AGE 計算是否接受「年份差（近似）」在 JS oracle 與 PG 的輕微差異（生日未到者差 1 歲）？若 EQ DoD 要求完全等價，需統一演算法。
- **OQ-157-02**：`resolveColumnValue` 補齊後，非 PG 路徑（SQLite 測試環境）是否實際有 customer_core 表可查，或需 mock 資料？需確認測試設計範圍。

---

## Dependencies

- **Blocked By**：US-156（逐欄稽核清單需先完成，確認需補齊的欄位集合）
- **Blocks**：US-158（Stage 2 計分驗收：202606 重跑 tier spread）

---

## Definition of Done

- [ ] `resolveColumnValue` switch 補齊全部 customer_core 欄位（至少 CUS_SEX / AGE / CAREA_NO1 / CAREA_NO2 / CELLULAR / EDUCAT_BACK / HPOST_NUM_NM / CPOST_NUM_NM / CO_NUM_NM / LOAN_RATE）
- [ ] `computeScore` 或其呼叫端可取得 customer_core 資料（SCHEMA GAP-157-01 解決）
- [ ] ADD_UN_CAPITAL JS oracle 取值設計決議並實作（SCHEMA GAP-157-02 解決）
- [ ] `COMMISSION` 從 `resolveColumnValue` 移除
- [ ] EQ DoD 測試（`stage2to4-sql-builder.spec.ts`）全通過，JS oracle 與 PG 下推結果等價
- [ ] `tsc --noEmit -p tsconfig.build.json` 乾淨

---

## Related

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **Architecture Spec**：AD-E07-10-L（`architecture-spec.md` §4063–4093）
- **Related Stories**：US-156（PG 下推稽核 + ADD_UN_CAPITAL 補齊），US-158（202606 重跑驗收）
