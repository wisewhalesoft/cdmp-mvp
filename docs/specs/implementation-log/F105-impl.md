---
type: implementation-log
feature_id: F105
feature_name: PROJECT_TP COMPOSITE 真語意復原（AD-E07-35）
status: complete
last_updated: 2026-06-25
---

# F105: PROJECT_TP COMPOSITE 真語意復原 — Implementation Log

## 摘要

依架構契約 **AD-E07-35**（PROJECT_TP COMPOSITE match kind 引擎契約）+ AD-E07-10-L v5.0，
推翻 F104 OQ-F104-03 的 category 單欄簡化（使用者 2026-06-25 拍板復原）。

PROJECT_TP 改為 legacy COMPOSITE 真語意：每個 score row **同時 AND 兩個子條件**——
`spec_tp` 代碼字串區間（codeExpr）AND 借新還舊衍生關鍵字相等（keywordExpr）。

根因（F104 缺口）：F104 以 `kind='category'` 處理 PROJECT_TP，`buildStage2ScoreExpr` category
分支「`if (sr.level1 === null) continue`」使 16 個 `level1=NULL` 非借新還舊 row 全部跳過 →
73.9% 客戶 PROJECT_TP=0（F067 差異報告確認為最大宗分差缺口 ~43%）。

兩路徑（PG 下推 + JS oracle）嚴格 EQ 等價，以 DoD 逐列等價測試驗收。

## 實作（AD-E07-35 契約釘死項）

1. **`ColumnSource` interface 擴充**：新增第三 kind `'composite'`，攜 `codeExpr` + `keywordExpr`
   （取代單一 `expr`）。`expr` 改為 optional；category/range 欄路徑不變（向後相容）。

2. **`resolveColumnSource('PROJECT_TP', cardType)`** 回 composite：
   - `codeExpr`：`COALESCE(o.spec_tp, '01')`（對齊 legacy `ISNULL(CAST(SPEC_TP AS VARCHAR),'01')`）。
   - `keywordExpr`：`CASE WHEN o.spec_name LIKE '%借新還舊%' THEN 'A' ELSE '' END`
     （F104 借新還舊關鍵字修正併入 keywordExpr）。

3. **`buildStage2ScoreExpr` composite 分支**：對每個 PROJECT_TP active score row 產生
   `WHEN TRIM(CAST(<codeExpr> AS text)) >= :lo AND TRIM(CAST(<codeExpr> AS text)) <= :hi
    AND TRIM(CAST(<keywordExpr> AS text)) = :v THEN :s`。
   - 字串比較（level2_s/e 為 spec_tp 補零兩碼，**不走 `Number()` range 路徑**，對齊 legacy 字串 BETWEEN）。
   - 巢狀 CASE、依 score row 順序第一命中取分（對齊既有 break 語意）。
   - 只納入 `level2_s` 與 `level2_e` 皆非 NULL 的 row（NULL 區間 row 跳過）。
   - `level1` NULL → bind `:v=''`（與 keywordExpr 輸出 '' 相等，等價 `COALESCE(:lv1,'')`）。
   - param 沿用既有 paramPrefix（多 list 不衝突）。

4. **JS oracle 對稱**：
   - `resolveColumnValue('PROJECT_TP')` 回結構化 `CompositeValue { code, keyword }`
     （`code = spec_tp ?? '01'`；`keyword = spec_name.includes('借新還舊') ? 'A' : ''`）。
   - 回傳型別擴充為 `string | number | CompositeValue`。
   - `computeScore` 新增 composite 分支（dispatch on `typeof value==='object' && 'code' in value`，
     置於 category/range 之前）：字串 `code >= lo && code <= hi && keyword === (level1??'').trim()`，
     第一命中取分。**與 PG 完全等價**。

5. **SALES_STS 維持 `kind:'category'` 不動**（AD-E07-35 明確聲明：COMPOSITE match_type 標籤不觸發
   composite 邏輯於 SALES_STS；SP 僅做 =LEVEL1）。其他欄不動。

6. PROJECT_TP 不需 cc/ar join（用 o.spec_tp/o.spec_name）；`needsCustomerCore`/`needsArCapital`
   對 PROJECT_TP 不變（false）。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts` | modified | `ColumnSource` 加 `composite` kind + codeExpr/keywordExpr；`resolveColumnSource('PROJECT_TP')` 改 composite；`buildStage2ScoreExpr` 新增 composite 分支 |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | 新增 `CompositeValue` interface；`resolveColumnValue('PROJECT_TP')` 回 `{code,keyword}`；`computeScore` 新增 composite 比對分支；回傳型別擴充 |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-builder.spec.ts` | modified | 「區間+類別」改用 SALES_STS 驗 category；新增 PROJECT_TP composite 純函式測試 |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f104.spec.ts` | modified | KW-001/KW-002 改 composite 語意；ResolveFn 回傳型別擴充 |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f103.spec.ts` | modified | PJTP-001~004 改 composite；GHOST-001 result 型別；ResolveFn 回傳型別擴充 |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f104.pg.spec.ts` | modified | KW-005 改 composite；新增 `seedCompositeScore` helper；新增 **F105 EQ DoD 群組**（8 案，AD-E07-35 樣本） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f103.pg.spec.ts` | modified | seedFullCard PROJECT_TP 改 composite；EQ-004/005 對齊；新增 `seedCompositeScore` |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.pg.spec.ts` | modified | seedStandardCardT1 PROJECT_TP 改 composite；SCORE-003 / EQ-004 trim 邊界改 level2 padding |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-p3.pg.spec.ts` | modified | seedStandardCard PROJECT_TP 改 composite |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-bugfix.pg.spec.ts` | modified | seedStandardCard PROJECT_TP 改 composite |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-v2.service.spec.ts` | modified | LIST_MONTH+PROJECT_TP 計分測試 PROJECT_TP 改 composite |

## Test Results Summary

### F105 EQ DoD（AD-E07-35 樣本，PG，新增）

| Scenario ID | spec_tp / spec_name | 期望分數 | Status |
|-------------|---------------------|---------|--------|
| PJTP-EQ-01 | 06 / 借新還舊專案 → A\|06 | 37 | PASS |
| PJTP-EQ-02 | 06 / 一般專案 → NULL\|06 | 35 | PASS |
| PJTP-EQ-03 | 12 / 一般專案 → NULL\|12 | 28 | PASS |
| PJTP-EQ-04 | 01 / 一般專案 → NULL\|01 | 19 | PASS |
| PJTP-EQ-05 | 22 / 借新還舊 → A\|22 | 37 | PASS |
| PJTP-EQ-06 | 22 / 一般專案 → NULL\|22 | 37 | PASS |
| PJTP-EQ-07 | 99 / 無代碼（無 row 命中） | 0 | PASS |
| PJTP-EQ-08 | NULL / NULL（COALESCE '01'） | 19 | PASS |

（涵蓋「同代碼 A vs NULL row 共存」keyword AND 分流，如 spec_tp='06'。）

### 全套執行結果（2026-06-25，cdmp-postgres-test 5433）

| 套件 | 結果 |
|------|------|
| 非 PG 觸及單元（builder / f103 / f104 spec） | 103 pass / 0 fail |
| assignment 全模組非 PG | 1169 pass / 1 skip / 0 fail |
| assignment 全 9 PG specs（序列） | 156 pass / 0 fail |
| assignment-scoring + assignment-list | 545 pass / 0 fail |
| `tsc --noEmit -p tsconfig.build.json`（硬性 DoD） | exit 0（零錯誤） |

## Architectural Decisions

- composite WHEN 子句以 `:v` bind level1 trim 值（NULL → `''`），等價 AD spec 之 `= COALESCE(:lv1,'')`
  —— 一律 bind 非 NULL trimmed string，免 SQL 端額外 COALESCE，且與 JS `keyword === lv1`（lv1='' for null）一致。
- composite codeExpr / keywordExpr 兩端 TRIM（對齊既有 category trim 風格 + 處理 padding）。
- PG/JS 第一命中順序依 `scoreRepo.find()` heap 順序——`assertEq`（JS=PG 逐列等價）為最終把關，
  任何順序分歧立即被 EQ 斷言捕捉。

## Known Pre-existing（與 F105 無關，未退化）

- `tsc -p tsconfig.json`（base，含 specs）殘留 `crEnabled` excess-property 錯誤於
  `stage2to4-sql-pushdown.pg.spec.ts` CDEF 測試（F102 遺留，已存於 HEAD，本次未觸碰）。
  硬性 DoD `tsconfig.build.json`（排除 *.spec.ts）為零錯誤。
- ETL 模組 10 fail / 3 files（`fn-calc-tier-level` / `target-table.service` / `target-table-schemas`）
  ＝customer_core entity 欄數（US-161/m301）+ tier fallback 既有期望，pre-existing baseline，
  F105 未動 ETL / entity / migration。

## Blocking Issues

無。

## 後續（交付後 orchestrator 負責）

- **不重跑月名單分派 202606**（本次交付不含）；orchestrator 另跑驗收 001 tier 分佈
  （預期 PROJECT_TP 復原後 73.9% 客戶不再 PROJECT_TP=0，分差缺口收斂）。
