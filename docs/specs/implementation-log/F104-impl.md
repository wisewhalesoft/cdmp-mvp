---
type: implementation-log
feature_id: F104
feature_name: Stage 2 計分引擎 AD-E07-10-L v4.0 全欄對齊 legacy SP（借新還舊關鍵字 + CUS_SEX range 與分流 + 縣市名 LEFT3 + per-card default + SALES_STS 關鍵字）
status: complete
last_updated: 2026-06-24
---

# F104：Stage 2 計分引擎全欄對齊 legacy SP — Implementation Log

> 對齊 [F104 spec](../features/F104-stage2-ad-e07-10-l-full-legacy-alignment.md) + AD-E07-10-L v4.0（§4063–4162）+ AD-E07-32/33/34 + [F104-test.md](../../test-specs/features/F104-test.md)。
> 兩條計分路徑（PG 下推 `resolveColumnSource`/`buildStage2ScoreExpr` + JS oracle `resolveColumnValue`/`computeScore`）完全對齊 legacy SP 真語意；EQ DoD 逐列等價（誤差=0）全綠。

## Test Results Summary

### F104 新增測試（共 70 案，全綠）

| 測試群組 | 案例 | 檔案 | 結果 |
|---------|------|------|------|
| KW（PROJECT_TP 借新還舊 / SALES_STS 中古車商） | KW-001~004（unit/靜態） + KW-005/006（PG EQ） | f104.spec / f104.pg.spec | PASS |
| SEX（CUS_SEX range + safe-cast + 計分 default 3） | SEX-001/002（unit） + SEX-003/004（PG EQ） | f104.spec / f104.pg.spec | PASS |
| BRANCH（五欄 isCorp 分流） | BRANCH-001~008（unit） + BRANCH-009/010（PG EQ） | f104.spec / f104.pg.spec | PASS |
| **SAFE（cus_sex NULL-safe cast，高嚴重度紅線）** | SAFE-004a/b/001a/002a（unit） + SAFE-001/002/003/005/006（PG，不拋例外 + EQ） | f104.spec / f104.pg.spec | **PASS** |
| AGE100（>100 排除 + 法人 0） | AGE100-001~004/PG（unit） + AGE100-005（PG EQ） | f104.spec / f104.pg.spec | PASS |
| EDU（補零 + per-card default + range 字串） | EDU-001~005（unit） + EDU-006/007（PG EQ） | f104.spec / f104.pg.spec | PASS |
| CITY（縣市 LEFT3 + per-card default） | CITY-001/004~008（unit） + CITY-002/003/009/010（PG EQ） | f104.spec / f104.pg.spec | PASS |
| PCD（LIST_MONTH / LOAN_RATE per-card default） | PCD-001~006/PG（unit） + PCD-007/008（PG EQ） | f104.spec / f104.pg.spec | PASS |
| **EQ（JS↔SQL 逐列等價 DoD，誤差=0）** | EQ-012（S5 綜合大場景）+ 各群組 EQ 散落（KW/SEX/BRANCH/SAFE/AGE100/EDU/CITY/PCD） | f104.pg.spec | **PASS** |
| SIG（簽章 + 介面變更） | SIG-001~004（cardType；CustomerCoreRow；MAPPED/CUSTOMER_CORE 集合） | f104.spec | PASS |
| OQ-TDS-F104-03（未知 card_type fallback） | UNKNOWN / UNKNOWN-JS | f104.spec | PASS |
| REG-005（fs+regex 靜態掃描舊關鍵字/欄名全清，去註解後） | builder + pipeline 兩檔 | f104.spec | PASS |
| UPGRADE（202606 重跑 tier spread，AC-13~16） | UPGR-001~005 | — | **DEFERRED**（需業務 live 重跑，orchestrator 交付後另跑） |

### F103 既有測試更新（依 F104-test.md §十四，全綠）

| 檔案 | 案例數 | 變更 | 結果 |
|------|--------|------|------|
| `stage2to4-score-source-f103.spec.ts` | 39 | cc fixture 7 欄改名（gender→cus_sex 等）；所有 resolveColumnValue 呼叫加 cardType；CC-001~010 取值語意（CUS_SEX range、CAREA 分流、AGE >100、EDUCAT 補零+per-card、縣市 LEFT3+default、LOAN_RATE per-card）；PJTP '專案'→'借新還舊'；SALES_STS '經銷商'→'中古車商'；AUDIT-002/003 CAREA presence | PASS |
| `stage2to4-score-source-f103.pg.spec.ts` | 16 | customer_core DDL + seedCustomerCore 7 欄改名；seedFullCard CUS_SEX range / EDUCAT range；EQ-001/002 cc fixture；EQ-004 spec_name 借新還舊；EQ-006 中古車商 | PASS |
| `stage2to4-sql-builder.spec.ts` | 14 | CUS_SEX 維度測試 cc.gender→cc.cus_sex（range score） | PASS |
| `stage2to4-sql-pushdown.pg.spec.ts`（F100） | 19 | customer_core DDL + seedCustomerCore 改名；CUS_SEX category→range；CJOIN/EQ-002 fixtures cus_sex；EQ-004 trim 邊界改測 PROJECT_TP（category） | PASS |
| `assignment-run-pipeline-p3.pg.spec.ts`（F100） | 7 | customer_core DDL + seedCustomerCore 改名；CUS_SEX category→range；EQ-003 fixture | PASS |
| `assignment-run-pipeline-bugfix.pg.spec.ts` | — | customer_core DDL 改名（未用 CUS_SEX 計分，無行為改變） | PASS |

### 回歸（REG-001~004）

- F098~F104 stage1 PG 序列（含 F100/F101/F102 計分/分派）：**399/399 全綠**（`vitest run src/modules/assignment/stage1 --no-file-parallelism`）。
- assignment + assignment-list + assignment-scoring 全套（serial）：**1316 passed / 1 skipped / 11 todo / 0 failed**。
- 全 API 套件（serial）：見「驗收紅線」段。

### 型別 gate（AC-17）

- `tsc --noEmit -p tsconfig.build.json`：**exit 0（零錯誤）**。
- base `tsconfig.json`（含 spec）：本次新增/修改之檔案皆零型別錯誤。唯一殘留 `stage2to4-sql-pushdown.pg.spec.ts(770) crEnabled` + `historical-month-readonly.spec.ts` 為 **pre-existing**（git stash 對 HEAD baseline 重跑同錯，與 F104 無關；build config 已排除 spec，runtime 不受影響）。

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts` | modified | `resolveColumnSource(columnName, cardType)` 加 cardType；新增 `CARD_DEFAULTS` 矩陣 + `cardDefault()` export + `SAFE_INT_CUS_SEX` / `IS_PERSONAL_GATING` fragment + `cityColumnSource()` helper；全欄 F104 語意（CUS_SEX range safe-cast、五欄 isCorp 分流、PROJECT_TP/SALES_STS 關鍵字、縣市 LEFT3、EDUCAT 補零+per-card、LIST_MONTH/LOAN_RATE per-card）；`buildStage2ScoreExpr` 傳 cardType |
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | modified | `CustomerCoreRow` 介面 7 欄改名（cus_sex/carea_no1/carea_no2/cellular/hpost_city/cpost_city/co_city）；新增 `safeIntCusSex()` / `isCorporateCusSex()` export helper；`resolveColumnValue(...,cardType)` 加 cardType + 全欄 F104 語意；新增 `resolveCityValue()` private helper；`computeScore` 傳 cardType；`prefetchScoringSources` SELECT 改新欄名；import `cardDefault` |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f104.spec.ts` | new | F104 unit/靜態（KW/SEX/BRANCH/SAFE/AGE100/EDU/CITY/PCD/SIG/UNKNOWN/REG-005，49 案） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f104.pg.spec.ts` | new | F104 PG EQ DoD（KW/SEX/SAFE/BRANCH/AGE100/EDU/CITY/PCD/EQ-012，21 案） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f103.spec.ts` | modified | 依 §十四更新（cc 改名 + cardType + F104 語意） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-score-source-f103.pg.spec.ts` | modified | 依 §十四更新（DDL/seed/CUS_SEX range/借新還舊/中古車商） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-builder.spec.ts` | modified | CUS_SEX 維度 cc.gender→cc.cus_sex（range） |
| `apps/api/src/modules/assignment/stage1/__tests__/stage2to4-sql-pushdown.pg.spec.ts` | modified | DDL/seedCustomerCore 改名；CUS_SEX category→range；trim 邊界改測 PROJECT_TP |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-p3.pg.spec.ts` | modified | DDL/seedCustomerCore 改名；CUS_SEX category→range |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline-bugfix.pg.spec.ts` | modified | customer_core DDL 改名（一致性，無行為改變） |

## Architectural Decisions（本輪 impl 決策，落在規格/AD 範圍內）

- **EDUCAT_BACK 比較型別採「數值」（OQ-TDS-F104-02）**：DB 已查證 EDUCAT_BACK score row 為 range（level2，0 category / 29 range），值為補零字串（`'02'`/`'08'`/`'99'`）。JS `computeScore` range 分支以 `Number(value)` 數值比較，為使 PG↔JS EQ 嚴格相等，PG 端 `resolveColumnSource('EDUCAT_BACK')` 之 expr 在取得補零字串後**以 NULL-safe 數值化**（`CASE WHEN <padded> ~ '^[0-9]+$' THEN <padded>::int ELSE NULL END`），非字串 lexical BETWEEN。理由：補零兩碼字串於 `'01'..'99'` 範圍 lexical 與數值比較等價（EDU-007 驗 '08' BETWEEN '08' AND '99'）；數值化額外保護非數字 educat code（如 `'0D'`）→ safe-cast NULL → 不命中，與 JS `Number('0D')=NaN`→不命中對齊，且 PG 不拋 cast 例外。AD-E07-10-L v4.0 已標此為 tdd 落地決策（lexical 為技術債，未來非數字 educat 再評估）。
- **法人 AGE 取 0 之計分效果取決於 score row 區間**：legacy「法人→0」表示 AGE 取值 0；若某卡 AGE score 區間含 0（如 `[0,100]`），0 仍命中取分（PG=JS 一致）。本輪測試以「區間不含 0」（如 `[30,40]`）驗「法人不取分」之意圖，避免 0 落區間混淆。此為測試 fixture 設計，非引擎行為偏差（EQ DoD 已證兩路徑一致）。
- **CARD_DEFAULTS 集中常數表（AD-E07-33）**：per-card default 集中於 builder 之 `CARD_DEFAULTS` + `cardDefault()` export，PG/JS 兩路徑共用單一真值來源（JS 經 import）；未知 card_type 走 BR-F104-16 fallback（LIST_MONTH=25 / LOAN_RATE=0 / EDUCAT='02' / 縣市=null→不計分）。
- **EDUCAT/CUS_SEX 之 cus_sex 兩 default 嚴格分離（BR-F104-13a）**：計分 default=3（`safeIntCusSex(...) ?? 3`）；分流 gating default='1'（`isCorporateCusSex`：空/NULL→個人）。`isCorporateCusSex` 與 PG `IS_PERSONAL_GATING` 對稱反向，髒值（'C'/'D'）→ safe-cast NULL → 法人；EQ DoD（SAFE-005/006）驗兩路徑一致。

## Blocking Issues / Open Items

- **無 blocking**。所有 EQ DoD 通過、cus_sex NULL-safe 不拋例外、per-card default 逐格、tsc gate 零錯誤、F103/F100/F101/F102 不退化。
- **UPGRADE（202606 重跑驗收，AC-13~16）DEFERRED**：依 orchestrator 指示「不重跑 202606」，由 orchestrator 於本交付後另跑驗收 card_level ≥3 種 / tier 含 T1/T2 / 10 筆個人分流欄抽樣 / 髒值案件不中斷。
- **PROJECT_TP 複合條件（AD-E07-10-L v4.0 / OQ-4）**：本輪僅關鍵字修正（'%借新還舊%'），維持 F103 category 單欄模型；legacy 複合條件（spec_tp range AND spec_name 衍生=level1）若 F067 差異顯示偏差再另立 story（spec 已授權此簡化）。
