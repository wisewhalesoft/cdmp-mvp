---
spec-id: F091
title: Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE）
feature-id: F091
source-story: US-134
epic: E07
module: M04 分派執行（Stage 1 精確化工程 Phase 2）
priority: P0-MVP
version: "1.0"
date: 2026-05-26
status: Draft
---

# F091: Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE）（Stage 1 精確化 Phase 2）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-26

> ⚠️ **PRODUCTION 行為變更警告（必讀）**：本 feature 是「Stage 1 精確化工程」三階段中**唯一改變 production 月跑分派案件數**的階段。依 [AD-E07-23 DP-AD23-2 / AD-E07-24 §24.2~§24.3](../architecture-spec.md)，本變更**無 feature flag 保護，deploy 後立即生效於所有環境（含 production）**。Stage 1 補入三個遺漏步驟後，月跑分派案件數將減少（過濾掉不符期別 / 近期已派 / 特殊業務排除之案件）。**Phase 2 PR merge 前須完成 deploy 前業務知會**（見 §13）。
>
> **v1.0（2026-05-26 / Stage 1 精確化工程 Phase 2）**：依 [architecture-spec.md AD-E07-22 v1.1](../architecture-spec.md)（全部 DP 已 Resolved）落地。將月跑 Stage 1 補齊原系統 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 現行 pipeline 尚未實作的三個步驟：① MONTH_CNT 期別過濾、② 近 3 個月已派案去重、③ 特殊 DELETE（LIST_NM 字串比對）。三步驟封裝為共用的 `Stage1FilterChain`，供月跑（寫入模式）與 F092 dry-run（唯讀模式）共用，消除 estimate / run 雙軌 drift。
>
> **Phase 邊界**：本 feature 改變月跑 Stage 1 行為。依賴 [F090](F090-obpooldata-list-etl.md)（Phase 1）已載入 `ob_pool_data_list` legacy 歷史（否則近 3 個月去重查詢回空集合）。F092（Phase 3 dry-run 升級）依賴本 feature 之 `Stage1FilterChain`。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md`（AD-E07-22 / AD-E07-23 為權威，由 system-architect 維護）、不變更 `data-model.md`（`ob_pool_data` / `ob_pool_data_list` 欄位全部已存在，§22.5 已確認無需新增欄位）；不撰寫 code / test（由 tdd-implementation 落地）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [architecture-spec.md AD-E07-22 / AD-E07-23](../architecture-spec.md) + `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（**逐行 ground truth**）+ `apps/api/src/modules/assignment/stage1/stage1-query-composer.ts`（既有欄位篩選）+ `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`runStage1ForList`） |
| QA / Tester | 本文件（§4 逐條 SP 對照 AC） + [error-handling.md#assignment-errors](../error-handling.md#assignment-errors) |
| Architect | 本文件 + [architecture-spec.md AD-E07-22 / AD-E07-24](../architecture-spec.md) |

---

## 1. 功能摘要

補齊月跑 Stage 1 案件挑選鏈，使其與原系統 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 逐步驟對齊。現行 Stage 1 僅實作「欄位篩選」（`buildStage1WhereConditions()`，路徑 A/B）；本 feature 補入 SP 中尚未實作的三步驟：

1. **MONTH_CNT 期別過濾**：依名單 `list_period_start` / `list_period_end` / `list_interval` 生成期別集合，過濾 `month_cnt`。
2. **近 3 個月已派案去重**：排除 `custo_no` 出現在 `ob_pool_data_list`（近 3 個月去重視窗）的案件。
3. **特殊 DELETE**：依名單 `list_nm` 字串比對（中結強案 / 中結 / 年資），以及詐騙白牌（`LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`），排除特定案件。

三步驟與既有欄位篩選一起封裝為 `Stage1FilterChain`（純函式群組 + 一個 async 主入口 `executeStage1Chain`），供月跑（`dryRun: false`，寫入 + 回傳完整案件列）與 F092 dry-run（`dryRun: true`，COUNT 唯讀）共用同一套實作。

## 2. 使用者故事

**As a** 業務部長 / 分派維運人員
**I want** 月跑 Stage 1 完整套用原系統的期別過濾、近 3 個月去重與特殊業務排除規則
**So that** 分派結果不含不符期別、近期已派、或業務規則排除（中結強案 / 滿期 / 年資 / 詐騙白牌）之案件，與原系統行為一致

## 3. 前置條件

- [F090](F090-obpooldata-list-etl.md)（Phase 1）已完成：`ob_pool_data_list` 含 legacy 派案歷史（`data_source` 欄存在），否則 AC-2 近 3 個月去重永遠回空集合
- 既有 `buildStage1WhereConditions()`（`stage1-query-composer.ts`）可用（欄位篩選，路徑 A/B）
- `ob_pool_data` / `ob_pool_data_list` 之 special-delete / 去重所需欄位均已存在（§22.5 已確認）
- `ob_list_definition` 之 `list_period_start` / `list_period_end` / `list_interval` 為 INTEGER 一級欄位（J8 拍板不入 whitelist）

## 4. 驗收標準（逐條對照 SP）

> 所有 AC 以原系統 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 為 ground truth；TDD / QA 須以 SP 行為為驗收基準，**忠實複刻、不優化合併**（DP-AD22-1）。

### AC-1：MONTH_CNT 期別過濾（對應 SP `@TmpTbl` WHILE 迴圈 + `WHERE o.MONTH_CNT IN (...)`）

- **Given** 名單之 `list_period_start` / `list_period_end` / `list_interval` 均非 NULL 且 `list_interval > 0`
- **When** Stage 1 執行該名單之案件挑選
- **Then** 生成期別集合 `months = [list_period_start, list_period_start + list_interval, ...]`（步進 `list_interval`，`<= list_period_end`）
- **And** 對 `ob_pool_data` 加上 fragment `"month_cnt" IN (:...monthCntVals)`，以 `AND` 連接至既有欄位篩選 fragments
- **And**（邊界）`list_period_start` / `list_period_end` / `list_interval` 任一為 NULL → **skip 此 fragment（不過濾 month_cnt）並記 warning**（不阻擋月跑）
- **And**（邊界）`list_interval <= 0` → skip + warning（防 infinite loop）
- **And**（邊界）生成的 `months` 為空集合 → skip

> **SP 對照**：SP L38~L43 以 `WHILE @LIST_PERIOD_START <= @LIST_PERIOD_END` 步進 `@LIST_INTERVAL` 建 `@TmpTbl`，L65 `WHERE o.MONTH_CNT IN (SELECT Data FROM @TmpTbl)`。

### AC-2：近 3 個月已派案去重（對應 SP L73~L87 CUSTO_NO 去重 DELETE）

- **Given** [F090](F090-obpooldata-list-etl.md) 已載入 `ob_pool_data_list` legacy 歷史
- **When** Stage 1 執行該名單之案件挑選（套完 AC-1 期別過濾後）
- **Then** 計算去重視窗：
  - `assigndayStart = workdt − 3 個月`（yyyyMMdd 字串；`workdt = PROJECT_WORKYM + '01'`）
  - `assigndayEnd = workdt − 1 日`（本月第一天前一日，即上月末日；**DP-AD21-3 近似上界**，取代 SP 之 `MAX(OBASSSIGNSET.CASEDT)` 動態上界）
- **And** 查詢去重 CUSTO_NO 集合：`SELECT DISTINCT custo_no FROM ob_pool_data_list WHERE assignday >= :assigndayStart AND assignday <= :assigndayEnd AND custo_no IS NOT NULL`（**不加 `data_source` 過濾**，涵蓋 `etl_legacy` + `monthly_run` 聯集，F090 BR-5）
- **And** 於應用層排除 `custo_no` 落在該去重集合的案件（`pool.filter(c => !recentAssignedCustoNos.has(c.custo_no))`）
- **And**（效能）若去重視窗記錄龐大，建議於 `ob_pool_data_list.assignday` 建索引（`idx_ob_pool_data_list_assignday`，已於 data-model.md v1.15 / [AD-E07-22 §22.3](../architecture-spec.md) 規範）

> **SP 對照差異**：SP `@Q_ASSIGNDAY_E = ISNULL(MAX(o.CASEDT), DATEADD(DD,-1,@WORKDT))` 以 `OBASSSIGNSET` 前次執行日動態調整上界；本系統 Phase 1/2 不建 `OBASSSIGNSET` ETL，採近似上界 `workdt − 1 日`（即 SP 之 ISNULL fallback 值）。此差異為 DP-AD21-3 拍板接受，精確上界列為 follow-up（OQ-STAGE1-02）。

### AC-3：特殊 DELETE — 中結強案（對應 SP L90~L95，`LIST_NM LIKE '%中結%強案%'`）

- **Given** 名單 `list_nm` **同時包含**「中結」與「強案」（`list.list_nm.includes('中結') && list.list_nm.includes('強案')`）
- **When** Stage 1 套用特殊 DELETE
- **Then** 排除符合以下任一條件的案件：
  - `Number(payt_term) >= Number(deal_num) - 3`（已繳期數接近總期數 − 3，接近中結），**或**
  - `appl_no` 以 `'T'` 或 `'Y'` 開頭（`appl_no.startsWith('T') || appl_no.startsWith('Y')`）
- **And** 型別處理：`payt_term` 為 INTEGER；`deal_num` 為 NUMERIC（entity `string | null`），比較前以 `Number()` 轉換

> **SP 對照**：SP L93~L94 `DELETE ... WHERE (PAYT_TERM >= DEAL_NUM - 3) OR (APPL_NO LIKE 'T%' OR APPL_NO LIKE 'Y%')`。

### AC-4：特殊 DELETE — 中結（對應 SP L98~L101，`LIST_NM LIKE '%中結%'`，依 SP 順序不與 AC-3 合併）

- **Given** 名單 `list_nm` **包含**「中結」（無論是否含「強案」；本規則比 AC-3 寬，可能與 AC-3 雙重刪除）
- **When** Stage 1 套用特殊 DELETE（在 AC-3 之後，依 SP 順序）
- **Then** 排除符合以下條件的案件：`Number(payt_num) > Number(deal_num) - 8` **且** `spec_name` 包含「滿」（`spec_name?.includes('滿')`）
- **And** 型別處理：`payt_num` 為 INTEGER；`deal_num` 為 NUMERIC，比較前 `Number()` 轉換

> **SP 對照**：SP L100 `delete ... WHERE (PAYT_NUM > DEAL_NUM - 8) AND SPEC_NAME LIKE '%滿%'`。**注意**：SP L98 的 `LIST_NM LIKE '%中結%'` 比 L90 的「中結強案」更寬（涵蓋中結強案名單），可能對同一名單造成雙重刪除規則套用；**本系統忠實複刻 SP 順序，不做優化合併**（[AD-E07-22 §22.4 注意段](../architecture-spec.md)）。

### AC-5：特殊 DELETE — 年資 15 年（對應 SP L108~L112，`LIST_NM LIKE '%年資%'`）

- **Given** 名單 `list_nm` **包含**「年資」
- **When** Stage 1 套用特殊 DELETE
- **Then** 排除 `ISNULL(year_produ, '1900') < (當年 − 15)` 的案件（出廠年份距今超過 15 年）
- **And** 實作：`const currentYear = workdt.getFullYear(); pool.filter(c => !((c.year_produ ?? '1900') < String(currentYear - 15)))`（字串比較，對齊 SP `ISNULL(YEAR_PRODU, '1900') < DATEPART(YEAR, @WORKDT) - 15`）

> **SP 對照**：SP L111 `delete ... WHERE (ISNULL(YEAR_PRODU, '1900') < DATEPART(YEAR, @WORKDT) - 15)`。

### AC-6：特殊 DELETE — 詐騙白牌（對應 SP L69，`LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`）

- **Given** Stage 1 套用特殊 DELETE
- **When** 案件之 `list_type = '01'` 且 `spec_name` 包含「白牌」（`spec_name?.includes('白牌')`）
- **Then** 排除該案件（**此規則為無條件套用，不依賴 `list_nm`**；SP 於 `#TargetCase` 建立後即直接 DELETE）
- **And** 此規則於 AC-1（期別過濾）之後、AC-2（去重）之前或之後套用均可（SP L69 位於 L65 期別過濾後、L77 去重前；建議依 SP 順序置於去重前）

> **SP 對照**：SP L69 `DELETE FROM #TargetCase WHERE LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`（緊接 L65 期別過濾之後）。
>
> **[ASSUMPTION] A-1（結構化旗標 follow-up）**：AC-3~AC-6 之 `list_nm` 字串比對（`includes('中結')` 等）繼承 SP 之字串脆弱性（名稱異動 / collation 不一致可能 miss）；此為業務明確接受之風險（DP-AD22-1 忠實複刻）。結構化旗標（`ob_list_definition.special_delete_rules`）保留為 follow-up [OQ-STAGE1-01](../open-questions.md)（亦見本檔 §12 + [AD-E07-24 §24.6](../architecture-spec.md)），業務反映名稱異動致規則未生效時觸發。

### AC-7：三步驟封裝為共用 `Stage1FilterChain`（供月跑 + F092 dry-run 共用）

- **Given** 月跑 Stage 1 與 F092 dry-run 需共用同一篩選鏈（避免 estimate / run drift）
- **When** 實作三步驟
- **Then** 三步驟與既有 `buildStage1WhereConditions()` 一起封裝為 `Stage1FilterChain`（[AD-E07-23 §23.2](../architecture-spec.md)）：
  - `buildStage1WhereConditions(list)` — 既有欄位篩選（路徑 A/B），**不變更**
  - `buildMonthCntFragment(list)` — 新增（AC-1）
  - `applySpecialDeletes(pool, list, workdt)` — 新增（AC-3~AC-6，應用層 array filter）
  - `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun })` — 新增主入口
- **And** 月跑 `runStage1ForList()` 改為呼叫 `executeStage1Chain(..., { dryRun: false })`，取得完整案件列（`cases`）
- **And**（架構建議）`Stage1FilterChain` 提取為獨立 Injectable（`Stage1FilterChainService`），置於共用模組，避免 `AssignmentListModule` 直接依賴 `AssignmentRunModule` repository（[AD-E07-23 §23.5](../architecture-spec.md)）

### AC-8：執行順序與 skip 行為保留

- **Given** Stage 1 完整鏈執行
- **When** 對單一名單挑案
- **Then** 執行順序對齊 SP：① 欄位篩選（`buildStage1WhereConditions`）→ ② MONTH_CNT 期別過濾（AC-1）→ ③ 詐騙白牌 DELETE（AC-6）→ ④ 近 3 個月去重（AC-2）→ ⑤ 特殊 DELETE 中結強案 / 中結 / 年資（AC-3~AC-5，依 SP 順序）
- **And** 既有 `skipReason='EMPTY_CONDITIONS'` 行為保留：欄位篩選無有效條件時 skip 該名單、不挑案、記 warning（不受本 feature 影響）

## 5. 資料契約

> 本 feature **不新增 entity 欄位、不新增 migration**（[AD-E07-22 §22.5](../architecture-spec.md) 已確認所有所需欄位存在）。

### 5.1 `Stage1FilterChain` 主入口契約（概念）

```
executeStage1Chain(
  list: ObListDefinition,
  workdt: Date,                          // PROJECT_WORKYM + '01'
  poolRepo: Repository<ObPoolData>,
  poolDataListRepo: Repository<ObPoolDataList>,   // 去重查詢用
  opts: { dryRun: boolean }
): Promise<Stage1ChainResult>
```

```typescript
interface Stage1ChainResult {
  count: number;            // 篩選後案件數（dry-run 與 run 均返回）
  cases?: ObPoolData[];     // run 模式回完整案件列；dry-run 模式為 undefined（不載入記憶體）
  skipped: boolean;
  skipReason?: Stage1SkipReason;          // 'EMPTY_CONDITIONS'
  warnings: Stage1ComposerWarning[];      // 含 month_cnt skip 等非阻擋 warning
}
```

### 5.2 去重視窗參數

| 參數 | 計算 | 對應 SP |
|---|---|---|
| `assigndayStart` | `workdt − 3 個月`（yyyyMMdd 字串） | `@Q_ASSIGNDAY_S = CONVERT(VARCHAR, DATEADD(MONTH,-3,@WORKDT),112)` |
| `assigndayEnd` | `workdt − 1 日`（上月末日 yyyyMMdd，近似上界） | `@Q_ASSIGNDAY_E = DATEADD(DD,-1,@WORKDT)`（取代 `MAX(OBASSSIGNSET.CASEDT)`） |

### 5.3 特殊 DELETE 規則對照表

| 規則 | 觸發條件（`list_nm` / 無條件） | 排除條件 | SP 行 |
|---|---|---|---|
| 詐騙白牌（AC-6） | 無條件（所有名單） | `list_type='01' AND spec_name LIKE '%白牌%'` | L69 |
| 中結強案（AC-3） | `list_nm` 含「中結」**且**「強案」 | `payt_term >= deal_num - 3` **OR** `appl_no LIKE 'T%'/'Y%'` | L90~L94 |
| 中結（AC-4） | `list_nm` 含「中結」 | `payt_num > deal_num - 8` **AND** `spec_name LIKE '%滿%'` | L98~L100 |
| 年資 15 年（AC-5） | `list_nm` 含「年資」 | `ISNULL(year_produ,'1900') < 當年 - 15` | L108~L111 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **忠實複刻、不優化合併**（DP-AD22-1）：特殊 DELETE 依 SP 順序逐條套用，中結強案（AC-3）與中結（AC-4）即使對同一名單雙重套用亦不合併 |
| BR-2 | **近似去重上界**（DP-AD21-3）：`assigndayEnd = workdt − 1 日`，不建 `OBASSSIGNSET` ETL；精確上界列為 OQ-STAGE1-02 follow-up |
| BR-3 | **去重來源聯集**：去重查詢 `ob_pool_data_list` 不加 `data_source` 過濾，涵蓋 `etl_legacy` + `monthly_run`（F090 BR-5） |
| BR-4 | **MONTH_CNT skip 不阻擋**：`list_period_*` 任一 NULL 或 `list_interval <= 0` → skip month_cnt fragment + warning，名單仍依其餘條件挑案（不整筆 skip） |
| BR-5 | **單一篩選鏈**（AD-E07-23 §23.1）：月跑與 F092 dry-run 共用 `Stage1FilterChain`，禁止另寫一套估算邏輯 |
| BR-6 | **既有 `EMPTY_CONDITIONS` skip 保留**：欄位篩選無有效條件 → skip 該名單（不受本 feature 影響） |
| BR-7 | **應用層去重 / 特殊 DELETE**：去重與特殊 DELETE 因需查 `ob_pool_data_list`（async）或字串比對，於應用層 array filter 執行（非純 SQL fragment），對齊 [AD-E07-22 §22.3 / §22.4](../architecture-spec.md) |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `ob_pool_data_list` 無 legacy 歷史（F090 未執行）| 去重查詢回空集合 → 不過濾（退化為現行行為）；建議部署順序強制 F090 先於 F091 上線 | [F090](F090-obpooldata-list-etl.md) |
| `list_period_*` 缺值 | skip month_cnt fragment + warning，名單仍挑案（BR-4） | [AD-E07-22 §22.2](../architecture-spec.md) |
| `list_interval <= 0` | skip + warning（防 infinite loop） | [AD-E07-22 §22.2](../architecture-spec.md) |
| `assignday` 格式不一致 | 字串比對 miss，去重失效；須由 F090 ETL 確保 `assignday` 格式為 yyyyMMdd（[F090 §7](F090-obpooldata-list-etl.md)） | — |
| `list_nm` 名稱異動致特殊 DELETE 未觸發 | 業務接受之已知風險（BR-1）；觸發 OQ-STAGE1-01 結構化旗標改良 | [AD-E07-24 §24.6](../architecture-spec.md) |

## 8. 相依性

- **Blocked By**：[F090](F090-obpooldata-list-etl.md)（Phase 1，`ob_pool_data_list` legacy 歷史）、既有 `buildStage1WhereConditions()`、`AssignmentRunPipelineService.runStage1ForList()`
- **Blocks**：[F092](F092-stage1-dry-run-estimate.md)（Phase 3 dry-run 複用 `Stage1FilterChain`）

## 9. 交叉參考

- 架構決策：[architecture-spec.md AD-E07-22 v1.1](../architecture-spec.md)（三步驟落地設計，**權威來源**）、[AD-E07-23 §23.1~§23.2](../architecture-spec.md)（`Stage1FilterChain` 單一來源）、[AD-E07-24 §24.2~§24.3](../architecture-spec.md)（Phase 2 production 影響 + 風險管控）、[AD-E07-21 §21.5~§21.6](../architecture-spec.md)（去重視窗資料來源）
- ground truth SP：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（L38~L65 期別 / L69 詐騙白牌 / L73~L87 去重 / L90~L112 特殊 DELETE）
- 既有實作：`apps/api/src/modules/assignment/stage1/stage1-query-composer.ts`（`buildStage1WhereConditions`，**不變更**）、`apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`runStage1ForList`，改呼叫 `executeStage1Chain`）
- 資料模型：[data-model.md](../data-model.md)（`ob_pool_data` / `ob_pool_data_list`，所需欄位全部存在）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 相關功能：[F090](F090-obpooldata-list-etl.md)、[F092](F092-stage1-dry-run-estimate.md)、[F061](F061-trigger-assignment-run.md)（月跑觸發）、[F049](F049-stage0-daily-estimate.md)（BR-6 估算上界語意，F092 將升級）、[F088](F088-ready-stage-summary.md)（estimateCases 物化，F092 將升級）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 關鍵測試案例（以 SP 行為為 ground truth）：
  - MONTH_CNT：`list_period_start=1, end=6, interval=1` → months=[1..6]，過濾 `month_cnt IN (1..6)`
  - MONTH_CNT：`interval=2`（1,3,5）、`list_period_*` 缺值 → skip + warning、`interval=0` → skip + warning
  - 近 3 個月去重：去重視窗正確（`workdt−3月` ~ `workdt−1日`）、`custo_no` 在集合中 → 排除、`custo_no IS NULL` 案件不誤排除
  - 去重來源聯集：`etl_legacy` + `monthly_run` 兩來源 custo_no 均納入去重（mock 須含兩來源）
  - 特殊 DELETE 中結強案：`payt_term >= deal_num - 3` 排除、`appl_no` 前綴 T/Y 排除、`deal_num` 字串需 Number 轉換
  - 特殊 DELETE 中結：`payt_num > deal_num - 8 AND spec_name 含滿` 排除
  - 特殊 DELETE 年資：`year_produ < 當年-15` 排除、`year_produ` NULL → 視為 '1900' 排除
  - 詐騙白牌：`list_type='01' AND spec_name 含白牌` 無條件排除（不依賴 list_nm）
  - 中結強案 + 中結雙重套用：`list_nm` 同含中結+強案時兩規則皆套用（不合併，BR-1）
  - `Stage1FilterChain` 月跑模式 vs dry-run 模式對同一 fixture 回相同 count（F092 前置）
  - regression：既有欄位篩選 + `EMPTY_CONDITIONS` skip 行為不破壞
- mock 契約注意（[記憶 feedback_mock_real_system_contract]）：`list_nm` 字串比對之 mock 須含真實中文（中結 / 強案 / 滿期 / 年資 / 白牌）與大小寫 / 編碼一致；`assignday` mock 須為 yyyyMMdd 字串格式（與 F090 ETL 載入格式一致）

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | 特殊 DELETE 之 `list_nm` 字串比對脆弱性為業務接受風險（DP-AD22-1）；結構化旗標保留為 OQ-STAGE1-01 follow-up | Resolved（引用 AD-E07-22） |
| A-2 | 近 3 個月去重上界採近似 `workdt−1日`（DP-AD21-3）；精確上界（OBASSSIGNSET）為 OQ-STAGE1-02 follow-up | Resolved（引用 AD-E07-21） |
| A-3 | `Stage1FilterChain` 之模組歸屬（獨立 Injectable vs 既有模組）由 tdd-implementation 依 AD-E07-23 §23.5 循環依賴分析決定 | [ASSUMPTION] |

## 12. Follow-up / Open Questions

| OQ 編號 | 議題 | 現況決策 | 狀態 |
|---|---|---|---|
| OQ-STAGE1-01 | 特殊 DELETE 結構化旗標（`ob_list_definition.special_delete_rules`）取代 `list_nm` 字串比對 | 維持忠實複刻（DP-AD22-1）；業務反映名稱異動致規則未生效時觸發 | Open（Low） |
| OQ-STAGE1-02 | `OBASSSIGNSET` ETL 精確去重上界（`@Q_ASSIGNDAY_E = MAX(CASEDT)`）同步 | 維持近似 `workdt−1日`（DP-AD21-3）；業務驗收近似誤差不可接受時觸發 | Open（Low） |
| OQ-STAGE1-99 | `caseyear='99'` wildcard 之 `year_cnt` 語意與 SP `0 <= year_cnt < 15` 封頂不一致 | 沿用 [F049 OQ-E07-STAGE0-99](F049-stage0-daily-estimate.md) 決策（'99' 為原系統停用選項，屬理論邊界，維持完全 skip year_cnt） | Open（理論邊界） |

## 13. Production 影響標注（⚠️ 重點）

- **本 Phase（F091）是唯一改變 production 月跑分派案件數的階段**（[AD-E07-24 §24.2](../architecture-spec.md)）。
- **無 feature flag、deploy 後立即生效於所有環境（含 production）**（DP-AD23-2）。Stage 1 補入三步驟後，月跑分派案件數將**減少**（過濾不符期別 / 近期已派 / 特殊業務排除之案件）。
- **風險管控（無 flag 版本，[AD-E07-24 §24.3](../architecture-spec.md)）**：
  1. **Deploy 前業務知會（必要）**：Phase 2 PR merge 前，業務主管須已知悉本次 deploy 將改變月跑分派案件數，並確認 deploy 時間點不在月跑執行中。
  2. **部署前 dry-run 驗證（建議）**：F092 完成後，於 staging/dev 執行完整月跑 dry-run，比對 deploy 前後案件數差異，確認過濾量符合業務預期。
  3. **無 flag 回滾**：一旦 deploy，無法透過 flag 回滾；若結果不符預期，須提交 hotfix PR 回退三步驟（移除 MONTH_CNT fragment + 去重 + 特殊 DELETE filter）。此為明確接受之 trade-off。
- **不影響範圍**：Stage 2（計分）、Stage 3/4（部門/人員分配）讀取 Stage 1 寫入後的 `ob_pool_data_list`，為下游消費，無需改動；API endpoint 簽名不變（改動在 service / pure function 層）。
