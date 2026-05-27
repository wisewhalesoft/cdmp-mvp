---
spec-id: F091
title: Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特例 DELETE SP 修正）
feature-id: F091
source-story: US-134（AD 驅動；AD-E07-22 / AD-E07-26）
epic: E07
module: M04 分派執行（Stage 1 精確化工程 Phase 2 / Phase A 特例修正）
priority: P0-MVP
version: "2.0"
date: 2026-05-27
status: Draft
---

# F091: Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特例 DELETE SP 修正）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-27

> ⚠️ **PRODUCTION 行為變更警告（必讀）**：本 feature 是「Stage 1 精確化工程」中**唯一改變 production 月跑分派案件數**的階段，且 v2.0 進一步**修正特例 DELETE 觸發條件之 high-severity bug**。依 [AD-E07-23 DP-AD23-2](../architecture-spec.md) 與 [AD-E07-26 DP-AD26-1](../architecture-spec.md)，本變更**無 feature flag 保護，deploy 後立即生效於所有環境（含 production）**，與 [F094](F094-monthly-run-result-table.md)（Phase A 結果表切換）同批 deploy。修正後各類名單之過濾案件數將顯著改變。**Phase A PR merge 前須完成 deploy 前業務知會 + 各類名單案件數差異驗收**（見 §13）。
>
> **v2.0（2026-05-27 / AD-E07-26 特例規則 SP 落差修正 + AD-E07-25 去重上界升級）**：依 [architecture-spec.md AD-E07-26 v1.1](../architecture-spec.md)（全 DP Resolved）落地三項變更：
> 1. **特例 DELETE 觸發條件 SP 修正（high-severity bug fix）**：v1.0 之觸發關鍵字（「中結強案」/「中結」/「年資」+ `spec_name LIKE '%滿%'`）為 **mojibake 誤判**，與 SP 實際完全不符。經 Node.js UTF-16LE 解碼確認 SP 真實觸發為「**期中機車**」/「**期中**」/「**年以上**」，排除條件含 `spec_name LIKE '%小資%'`（非「滿」）。本輪改為 SP 正確版（§4 AC-3~AC-6 / §5.3）。
> 2. **去重上界升級（AD-E07-25 DP-AD25-4）**：去重視窗上界由固定 `workdt − 1 日` 改為 `MIN(MAX(ob_pool_data_list.assignday), workdt − 1 日)`（NULL 退化 `workdt − 1 日`）。
> 3. **year_produ 比較補 `parseInt`（AD-E07-26 DP-AD26-2）**：`R-YEAR-ABOVE` 改用 `parseInt(year_produ ?? '1900') < workdt.getFullYear() − 15` 數值比較，與 `deal_num` / `payt_term` 之 `Number()` 風格一致。
>
> **v1.0（2026-05-26 / Stage 1 精確化工程 Phase 2）**：補齊月跑 Stage 1 三步驟（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特例 DELETE），封裝為共用 `Stage1FilterChain`。**v1.0 之特例 DELETE 觸發關鍵字（中結強案 / 中結 / 年資）已於 v2.0 修正為 SP 正確版（期中機車 / 期中 / 年以上），見上方 v2.0 第 1 項**。
>
> **Phase 邊界**：本 feature 改變月跑 Stage 1 行為。依賴 [F090](F090-obpooldata-list-etl.md)（已載入 `ob_pool_data_list` legacy 歷史）；v2.0 之去重上界與結果落點與 [F094](F094-monthly-run-result-table.md)（結果改寫 `ob_monthly_run_result`）同屬 Phase A 同批 deploy；[F092](F092-stage1-dry-run-estimate.md)（dry-run 升級）依賴本 feature 之 `Stage1FilterChain`；[F095](F095-applied-special-rules-readonly.md)（前端唯讀呈現）與本 feature 之 trigger 判斷共用同一 pure utility。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md`（AD-E07-22 / AD-E07-25 / AD-E07-26 為權威，由 system-architect 維護）、不變更 `data-model.md`（所需欄位全部已存在，AD-E07-26 §26.5 已確認本輪不新建任何 DB 欄位）；不撰寫 code / test（由 tdd-implementation 落地）；結果表落點切換之資料契約見 [F094](F094-monthly-run-result-table.md)（本檔僅引用）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [architecture-spec.md AD-E07-22 / AD-E07-25 §25.5 / AD-E07-26](../architecture-spec.md)（**權威**）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（**逐行 ground truth，已用 UTF-16LE 解碼驗證**）+ `apps/api/src/modules/assignment/stage1/stage1-filter-chain.ts`（`applyListNmSpecialDeletes()` 待修正）+ [F094](F094-monthly-run-result-table.md)（結果落點） |
| QA / Tester | 本文件（§4 逐條 SP 對照 AC + §13 production 影響）+ [error-handling.md#assignment-errors](../error-handling.md#assignment-errors) |
| Architect | 本文件 + [architecture-spec.md AD-E07-22 / AD-E07-25 / AD-E07-26](../architecture-spec.md) |

---

## 1. 功能摘要

補齊月跑 Stage 1 案件挑選鏈，使其與原系統 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 逐步驟對齊。現行 Stage 1 僅實作「欄位篩選」（`buildStage1WhereConditions()`，路徑 A/B）；本 feature 補入並修正 SP 中之三步驟：

1. **MONTH_CNT 期別過濾**：依名單 `list_period_start` / `list_period_end` / `list_interval` 生成期別集合，過濾 `month_cnt`。
2. **近 3 個月已派案去重**：排除 `custo_no` 出現在 `ob_pool_data_list`（去重視窗）的案件；**去重上界 v2.0 升級為 `MIN(MAX(assignday), workdt − 1 日)`**（AD-E07-25 DP-AD25-4）。
3. **特例 DELETE（SP 修正版）**：依名單 `list_nm` 字串比對（**期中機車 / 期中 / 年以上**，v2.0 修正前為誤判之中結強案 / 中結 / 年資），以及詐騙白牌（`list_type='01' AND spec_name LIKE '%白牌%'`，無條件），排除特定案件。

三步驟與既有欄位篩選一起封裝為 `Stage1FilterChain`（純函式群組 + 一個 async 主入口 `executeStage1Chain`），供月跑（`dryRun: false`，寫入 [F094](F094-monthly-run-result-table.md) `ob_monthly_run_result` + 回傳完整案件列）與 F092 dry-run（`dryRun: true`，COUNT 唯讀）共用同一套實作。

## 2. 使用者故事

**As a** 業務部長 / 分派維運人員
**I want** 月跑 Stage 1 完整且正確地套用原系統的期別過濾、近 3 個月去重與特例業務排除規則（依 SP 真實規範：期中機車 / 期中小資 / 年以上 / 詐騙白牌）
**So that** 分派結果不含不符期別、近期已派、或業務規則排除之案件，與原系統行為一致；且過去因觸發關鍵字誤判（中結 / 年資）導致的錯誤排除被修正

## 3. 前置條件

- [F090](F090-obpooldata-list-etl.md)（Phase 1）已完成：`ob_pool_data_list` 含 legacy 派案歷史，否則 AC-2 近 3 個月去重永遠回空集合
- [F094](F094-monthly-run-result-table.md)（Phase A 結果表）已建立 `ob_monthly_run_result`：月跑 Stage 1 寫入目標自本 feature 起改為該表（與本 feature 同批 deploy）
- 既有 `buildStage1WhereConditions()`（欄位篩選，路徑 A/B）可用
- `ob_pool_data` / `ob_pool_data_list` 之特例 DELETE / 去重所需欄位均已存在（AD-E07-26 §26.5 已確認本輪不新建欄位）
- `ob_list_definition.list_nm`（特例 trigger 判斷來源）/ `list_period_start` / `list_period_end` / `list_interval` 一級欄位可用

## 4. 驗收標準（逐條對照 SP）

> 所有 AC 以原系統 SP `SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list` 為 ground truth（**已用 Node.js UTF-16LE 解碼逐行驗證真實規則**）；TDD / QA 須以 SP 行為為驗收基準，**忠實複刻、不優化合併**（AD-E07-26 §26.4）。

### AC-1：MONTH_CNT 期別過濾（對應 SP `@TmpTbl` WHILE 迴圈 + `WHERE o.MONTH_CNT IN (...)`）

- **Given** 名單之 `list_period_start` / `list_period_end` / `list_interval` 均非 NULL 且 `list_interval > 0`
- **When** Stage 1 執行該名單之案件挑選
- **Then** 生成期別集合 `months = [list_period_start, list_period_start + list_interval, ...]`（步進 `list_interval`，`<= list_period_end`）
- **And** 對 `ob_pool_data` 加上 fragment `"month_cnt" IN (:...monthCntVals)`，以 `AND` 連接至既有欄位篩選 fragments
- **And**（邊界）`list_period_start` / `list_period_end` / `list_interval` 任一為 NULL → **skip 此 fragment（不過濾 month_cnt）並記 warning**（不阻擋月跑）
- **And**（邊界）`list_interval <= 0` → skip + warning（防 infinite loop）
- **And**（邊界）生成的 `months` 為空集合 → skip

> **SP 對照**：SP L37~L43 以 `WHILE @LIST_PERIOD_START <= @LIST_PERIOD_END` 步進 `@LIST_INTERVAL` 建 `@TmpTbl`，L65 `WHERE o.MONTH_CNT IN (SELECT Data FROM @TmpTbl)`。

### AC-2：近 3 個月已派案去重（對應 SP L73~L87 CUSTO_NO 去重 DELETE；v2.0 上界升級）

- **Given** [F090](F090-obpooldata-list-etl.md) 已載入 `ob_pool_data_list` legacy 歷史
- **When** Stage 1 執行該名單之案件挑選（套完 AC-1 期別過濾後）
- **Then** 計算去重視窗：
  - `assigndayStart = workdt − 3 個月`（yyyyMMdd 字串；`workdt = PROJECT_WORKYM + '01'`）
  - `assigndayEnd = MIN( MAX(ob_pool_data_list.assignday), workdt − 1 日 )`（**v2.0 升級，AD-E07-25 DP-AD25-4**）：
    - 先 `SELECT MAX(assignday) FROM ob_pool_data_list WHERE assignday IS NOT NULL` 取得 `maxAssignday`
    - 若 `maxAssignday` 為 NULL（表無歷史）→ 退化為 `workdt − 1 日`（即本月第一天前一日 / 上月末日）
    - 否則取 `MIN(maxAssignday, workdt − 1 日)`（取較小者，防 ETL 載入異常未來日期穿越本月）
- **And** 查詢去重 CUSTO_NO 集合：`SELECT DISTINCT custo_no FROM ob_pool_data_list WHERE assignday >= :assigndayStart AND assignday <= :assigndayEnd AND custo_no IS NOT NULL`（**不加 `data_source` 過濾**；單源化後 `ob_pool_data_list` 僅含 `'etl_load'` 歷史，[F090 v2.0 BR-5](F090-obpooldata-list-etl.md)）
- **And** 於應用層排除 `custo_no` 落在該去重集合的案件（`pool.filter(c => !recentAssignedCustoNos.has(c.custo_no))`）
- **And**（效能）依賴 `ob_pool_data_list.assignday` 索引（`idx_ob_pool_data_list_assignday`，已於 data-model.md v1.15 / [AD-E07-22 §22.3](../architecture-spec.md) 規範）

> **SP 對照差異**：SP L75~L76 `@Q_ASSIGNDAY_E = DATEADD(DD,-1,@WORKDT)`，再 `SELECT @Q_ASSIGNDAY_E = ISNULL(MAX(o.CASEDT), @Q_ASSIGNDAY_E) FROM OBASSIGNSET ...` 以前次執行日動態調整上界。本系統不建 `OBASSIGNSET` ETL，v2.0 改以本表 `MAX(assignday)` 推導近似上界（取代固定 `workdt − 1 日`），較 v1.0 更貼近 ETL 載入之最新歷史，但仍非 SP 之精確 `MAX(CASEDT)`。精確上界（OBASSIGNSET）列為 follow-up（OQ-STAGE1-02）。

### AC-3：特例 DELETE — 詐騙白牌（對應 SP L66~L68，無條件）

- **Given** Stage 1 套用特例 DELETE
- **When** 案件之 `list_type = '01'` 且 `spec_name` 包含「白牌」（`spec_name?.includes('白牌')`）
- **Then** 排除該案件（**此規則為無條件套用，不依賴 `list_nm`**；SP 於 `#TargetCase` 建立、期別過濾後即直接 DELETE）
- **And** 規則 ID = `R-FRAUD-WHITEBOARD`

> **SP 對照（已解碼驗證）**：SP L66 註解「特殊機車白牌案件刪除期中」；L67~L68 `DELETE FROM #TargetCase WHERE LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`（緊接 L65 期別過濾之後、L73 去重之前）。

### AC-4：特例 DELETE — 機車期中滿期前 3 個月（對應 SP L89~L94，`LIST_NM LIKE '%期中%機車%'`）

- **Given** 名單 `list_nm` **同時包含**「期中」與「機車」（`list.list_nm.includes('期中') && list.list_nm.includes('機車')`）
- **When** Stage 1 套用特例 DELETE
- **Then** 排除符合以下任一條件的案件：
  - `Number(payt_term) >= Number(deal_num) − 3`（已繳期數接近總期數 − 3，接近滿期），**或**
  - `appl_no` 以 `'T'` 或 `'Y'` 開頭（`appl_no.startsWith('T') || appl_no.startsWith('Y')`）
- **And** 型別處理：`payt_term` 為 INTEGER；`deal_num` 為 NUMERIC（entity `string | null`），比較前以 `Number()` 轉換
- **And** 規則 ID = `R-PERIOD-MOTORCYCLE`

> **SP 對照（已解碼驗證）**：SP L89 `IF EXISTS (... LIST_NM LIKE '%期中%機車%')`；L92~L93 `DELETE #TargetCase WHERE (PAYT_TERM >= DEAL_NUM - 3) OR (APPL_NO LIKE 'T%' OR APPL_NO LIKE 'Y%')`。
>
> **⚠️ v2.0 修正**：v1.0 誤以「中結強案」為觸發（mojibake）。**排除條件邏輯（payt_term / appl_no）與 v1.0 相同，但觸發名單由「中結強案」修正為「期中機車」**——含「中結」「強案」名單**不再**錯誤套用此規則；含「期中機車」名單改為正確套用（AD-E07-26 §26.2）。

### AC-5：特例 DELETE — 期中小資最後七期（對應 SP L97~L100，`LIST_NM LIKE '%期中%'`，依 SP 順序不與 AC-4 合併）

- **Given** 名單 `list_nm` **包含**「期中」（無論是否含「機車」；本規則比 AC-4 寬，可能與 AC-4 雙重刪除）
- **When** Stage 1 套用特例 DELETE（在 AC-4 之後，依 SP 順序）
- **Then** 排除符合以下條件的案件：`Number(payt_num) > Number(deal_num) − 8` **且** `spec_name` 包含「小資」（`spec_name?.includes('小資')`）
- **And** 型別處理：`payt_num` 為 INTEGER；`deal_num` 為 NUMERIC，比較前 `Number()` 轉換
- **And** 規則 ID = `R-PERIOD-XIAOZI`

> **SP 對照（已解碼驗證）**：SP L97 `IF EXISTS (... LIST_NM LIKE '%期中%')`；L99 `delete from #TargetCase WHERE (PAYT_NUM > DEAL_NUM - 8) AND SPEC_NAME LIKE '%小資%'`。**注意**：L97 的 `'%期中%'` 比 L89 的「期中機車」更寬（涵蓋期中機車名單），對同一「期中機車」名單造成雙重刪除規則套用；**本系統忠實複刻 SP 順序，不做優化合併**（AD-E07-26 §26.4 注意段）。
>
> **⚠️ v2.0 修正**：v1.0 誤以「中結」為觸發且排除條件用 `spec_name LIKE '%滿%'`（mojibake）。**v2.0 修正為觸發「期中」、排除條件 `spec_name LIKE '%小資%'`**（觸發條件與刪除條件均與 v1.0 不同，AD-E07-26 §26.2）。

### AC-6：特例 DELETE — 年以上車齡超 15 年（對應 SP L105~L108，`LIST_NM LIKE '%年以上%'`；v2.0 補 parseInt）

- **Given** 名單 `list_nm` **包含**「年以上」
- **When** Stage 1 套用特例 DELETE
- **Then** 排除 `parseInt(year_produ ?? '1900') < (workdt.getFullYear() − 15)` 的案件（出廠年份距今超過 15 年）
- **And** 實作：`const cutoffYear = workdt.getFullYear() - 15; pool.filter(c => !(parseInt(c.year_produ ?? '1900', 10) < cutoffYear))`（**v2.0 改數值比較**，AD-E07-26 DP-AD26-2，與 `deal_num` / `payt_term` 之 `Number()` 風格一致）
- **And** 規則 ID = `R-YEAR-ABOVE`

> **SP 對照（已解碼驗證）**：SP L105 `if EXISTS (... LIST_NM LIKE '%年以上%')`；L107 `delete from #TargetCase WHERE (ISNULL(YEAR_PRODU,'1900') < DATEPART(YEAR,@WORKDT) - 15)`。
>
> **⚠️ v2.0 修正**：v1.0 誤以「年資」為觸發且採字串比較（mojibake）。**v2.0 修正觸發為「年以上」並補 `parseInt` 數值比較**（4 位數字字串與數值比較等效，但 `parseInt` 防禦性更佳；AD-E07-26 §26.2 / DP-AD26-2）。

### AC-7：三步驟封裝為共用 `Stage1FilterChain`（供月跑 + F092 dry-run + F095 trigger 推導共用）

- **Given** 月跑 Stage 1、F092 dry-run、F095 前端唯讀推導需共用同一 trigger 判斷邏輯（避免 estimate / run / UI 三軌 drift）
- **When** 實作三步驟
- **Then** 三步驟與既有 `buildStage1WhereConditions()` 一起封裝為 `Stage1FilterChain`（[AD-E07-23 §23.2](../architecture-spec.md)）：
  - `buildStage1WhereConditions(list)` — 既有欄位篩選（路徑 A/B），**不變更**
  - `buildMonthCntFragment(list)` — 新增（AC-1）
  - `applyListNmSpecialDeletes(pool, list, workdt)` — **v2.0 修正 3 條 trigger 關鍵字 + parseInt**（AC-3~AC-6，應用層 array filter）
  - `computeDedupWindow(workdt, poolDataListRepo)` — v2.0 升級去重上界（AC-2）
  - `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun })` — 主入口
- **And** 月跑 `runStage1ForList()` 改為呼叫 `executeStage1Chain(..., { dryRun: false })`，取得完整案件列（`cases`，型別為 `Partial<ObMonthlyRunResult>[]`，見 [F094](F094-monthly-run-result-table.md)）
- **And** **trigger 判斷須提取為 pure utility**（如 `matchesSpecialRule(listNm, ruleId)` / `deriveAppliedSpecialRules(listNm)`），供 `applyListNmSpecialDeletes`（本 feature）與 [F095 `deriveAppliedSpecialRules`](F095-applied-special-rules-readonly.md) **共用同一份判斷**（AD-E07-26 §26.5 注意段，避免不同步）
- **And**（架構建議）`Stage1FilterChain` 提取為獨立 Injectable（`Stage1FilterChainService`），避免模組循環依賴（[AD-E07-23 §23.5](../architecture-spec.md)）

### AC-8：執行順序與 skip 行為保留

- **Given** Stage 1 完整鏈執行
- **When** 對單一名單挑案
- **Then** 執行順序對齊 SP：① 欄位篩選（`buildStage1WhereConditions`）→ ② MONTH_CNT 期別過濾（AC-1）→ ③ 詐騙白牌 DELETE（AC-3，SP L67）→ ④ 近 3 個月去重（AC-2，SP L73~L87）→ ⑤ 機車期中（AC-4）→ ⑥ 期中小資（AC-5）→ ⑦ 年以上（AC-6）（AC-4~AC-6 依 SP L89/L97/L105 順序）
- **And** 既有 `skipReason='EMPTY_CONDITIONS'` 行為保留：欄位篩選無有效條件時 skip 該名單、不挑案、記 warning（不受本 feature 影響）

## 5. 資料契約

> 本 feature **不新增 entity 欄位、不新增 migration**（AD-E07-26 §26.5 已確認本輪不新建任何 DB 欄位）。月跑寫入目標表 `ob_monthly_run_result` 之 schema 見 [F094 §5](F094-monthly-run-result-table.md)（本 feature 僅引用其型別）。

### 5.1 `Stage1FilterChain` 主入口契約（概念）

```
executeStage1Chain(
  list: ObListDefinition,
  workdt: Date,                          // PROJECT_WORKYM + '01'
  poolRepo: Repository<ObPoolData>,
  poolDataListRepo: Repository<ObPoolDataList>,   // 去重查詢 + MAX(assignday) 上界推導用
  opts: { dryRun: boolean }
): Promise<Stage1ChainResult>
```

```typescript
interface Stage1ChainResult {
  count: number;                          // 篩選後案件數（dry-run 與 run 均返回）
  cases?: Partial<ObMonthlyRunResult>[];  // run 模式回完整案件列（型別見 F094）；dry-run 模式為 undefined（不載入記憶體）
  skipped: boolean;
  skipReason?: Stage1SkipReason;          // 'EMPTY_CONDITIONS'
  warnings: Stage1ComposerWarning[];      // 含 month_cnt skip 等非阻擋 warning
  appliedRuleIds: SpecialRuleId[];        // 本名單實際套用之特例規則 ID（與 F095 推導一致）
}
```

### 5.2 去重視窗參數（v2.0 升級）

| 參數 | 計算 | 對應 SP |
|---|---|---|
| `assigndayStart` | `workdt − 3 個月`（yyyyMMdd 字串） | `@Q_ASSIGNDAY_S = CONVERT(VARCHAR, DATEADD(MONTH,-3,@WORKDT),112)` |
| `assigndayEnd` | `MIN( MAX(ob_pool_data_list.assignday), workdt − 1 日 )`；`MAX` 為 NULL 時退化 `workdt − 1 日`（**v2.0，DP-AD25-4**）| SP 之 `ISNULL(MAX(OBASSIGNSET.CASEDT), DATEADD(DD,-1,@WORKDT))`（本系統以 `ob_pool_data_list.MAX(assignday)` 近似 `MAX(CASEDT)`）|

### 5.3 特例 DELETE 規則對照表（v2.0 SP 修正版）

| 規則 ID | 觸發條件（`list_nm` / 無條件） | 排除條件 | SP 行 | v1.0 誤判（已修正）|
|---|---|---|---|---|
| `R-FRAUD-WHITEBOARD`（AC-3） | 無條件（所有名單） | `list_type='01' AND spec_name LIKE '%白牌%'` | L66~L68 | （無變化）|
| `R-PERIOD-MOTORCYCLE`（AC-4） | `list_nm` 含「期中」**且**「機車」 | `Number(payt_term) >= Number(deal_num) − 3` **OR** `appl_no LIKE 'T%'/'Y%'` | L89~L94 | v1.0 誤判觸發為「中結強案」|
| `R-PERIOD-XIAOZI`（AC-5） | `list_nm` 含「期中」 | `Number(payt_num) > Number(deal_num) − 8` **AND** `spec_name LIKE '%小資%'` | L97~L100 | v1.0 誤判觸發「中結」+ 排除 `%滿%` |
| `R-YEAR-ABOVE`（AC-6） | `list_nm` 含「年以上」 | `parseInt(year_produ ?? '1900') < workdt.getFullYear() − 15` | L105~L108 | v1.0 誤判觸發「年資」+ 字串比較 |

> **執行順序（依 SP）**：`R-FRAUD-WHITEBOARD`（L67，去重前）→ 去重（L73）→ `R-PERIOD-MOTORCYCLE`（L89）→ `R-PERIOD-XIAOZI`（L97）→ `R-YEAR-ABOVE`（L105），各規則獨立不合併。含「期中機車」名單同時觸發 `R-PERIOD-MOTORCYCLE` + `R-PERIOD-XIAOZI`（SP 行為，忠實複刻）。

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **忠實複刻、不優化合併**（AD-E07-26 §26.4）：特例 DELETE 依 SP 順序逐條套用，機車期中（AC-4）與期中小資（AC-5）即使對同一「期中機車」名單雙重套用亦不合併 |
| BR-2 | **去重上界 v2.0 升級**（DP-AD25-4）：`assigndayEnd = MIN(MAX(ob_pool_data_list.assignday), workdt − 1 日)`，NULL 退化 `workdt − 1 日`；不建 `OBASSIGNSET` ETL；精確上界列為 OQ-STAGE1-02 follow-up |
| BR-3 | **去重來源單源化**：去重查詢 `ob_pool_data_list` 不加 `data_source` 過濾；單源化後本表僅含 `'etl_load'`（[F090 v2.0](F090-obpooldata-list-etl.md) / AD-E07-25）；月跑提案已改寫 `ob_monthly_run_result`（[F094](F094-monthly-run-result-table.md)）不再混入本表 |
| BR-4 | **MONTH_CNT skip 不阻擋**：`list_period_*` 任一 NULL 或 `list_interval <= 0` → skip month_cnt fragment + warning，名單仍依其餘條件挑案（不整筆 skip） |
| BR-5 | **單一篩選鏈 + trigger pure utility**（AD-E07-23 §23.1 / AD-E07-26 §26.5）：月跑、F092 dry-run、F095 前端推導共用 `Stage1FilterChain` 與同一份 trigger 判斷 pure utility，禁止三處各寫一套 |
| BR-6 | **既有 `EMPTY_CONDITIONS` skip 保留**：欄位篩選無有效條件 → skip 該名單（不受本 feature 影響） |
| BR-7 | **應用層去重 / 特例 DELETE**：去重與特例 DELETE 因需查 `ob_pool_data_list`（async）或字串比對，於應用層 array filter 執行（非純 SQL fragment），對齊 [AD-E07-22 §22.3 / §22.4](../architecture-spec.md) |
| BR-8 | **trigger mojibake bug fix（v2.0）**：特例 DELETE 觸發關鍵字以 SP UTF-16LE 解碼結果為準（期中機車 / 期中 / 年以上 / 小資 / 白牌），**禁止沿用 v1.0 之誤判關鍵字（中結 / 強案 / 年資 / 滿）**；TDD 須以 mock `list_nm` 含正確中文驗證觸發（[記憶 feedback_mock_real_system_contract]）|

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `ob_pool_data_list` 無 legacy 歷史（F090 未執行）| 去重查詢回空集合 + `MAX(assignday)` 為 NULL → 上界退化 `workdt − 1 日`、不過濾 custo_no（退化為現行行為）；建議部署順序強制 F090 先於 F091 上線 | [F090](F090-obpooldata-list-etl.md) |
| `list_period_*` 缺值 | skip month_cnt fragment + warning，名單仍挑案（BR-4） | [AD-E07-22 §22.2](../architecture-spec.md) |
| `list_interval <= 0` | skip + warning（防 infinite loop） | [AD-E07-22 §22.2](../architecture-spec.md) |
| `MAX(assignday)` 為異常未來日期（> workdt − 1 日）| `MIN()` 取 `workdt − 1 日`，不穿越本月（BR-2） | [AD-E07-25 §25.5](../architecture-spec.md) |
| `assignday` 格式不一致 | 字串比對 miss，去重失效；須由 F090 ETL 確保 `assignday` 格式為 yyyyMMdd（[F090 §7](F090-obpooldata-list-etl.md)） | — |
| `list_nm` 名稱異動致特例 DELETE 未觸發 | 業務接受之已知風險（BR-8 忠實複刻字串比對）；觸發 OQ-STAGE1-01 結構化旗標改良 | [AD-E07-26 §26.5](../architecture-spec.md) |

## 8. 相依性

- **Blocked By**：[F090](F090-obpooldata-list-etl.md)（Phase 1，`ob_pool_data_list` legacy 歷史）、[F094](F094-monthly-run-result-table.md)（Phase A，月跑寫入目標 `ob_monthly_run_result`）、既有 `buildStage1WhereConditions()` / `AssignmentRunPipelineService`
- **Blocks**：[F092](F092-stage1-dry-run-estimate.md)（dry-run 複用 `Stage1FilterChain`）、[F095](F095-applied-special-rules-readonly.md)（共用 trigger pure utility）
- **同批 deploy（Phase A）**：[F094](F094-monthly-run-result-table.md)（結果表切換）、[F095](F095-applied-special-rules-readonly.md)（前端唯讀 API）

## 9. 交叉參考

- 架構決策：[architecture-spec.md AD-E07-26 v1.1](../architecture-spec.md)（特例規則 SP 落差修正，**權威來源**）、[AD-E07-22 v1.1](../architecture-spec.md)（三步驟落地）、[AD-E07-25 §25.5](../architecture-spec.md)（去重上界 MAX(assignday)）、[AD-E07-23 §23.1~§23.2](../architecture-spec.md)（`Stage1FilterChain` 單一來源）
- ground truth SP：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（L37~L65 期別 / L66~L68 詐騙白牌 / L73~L87 去重 / L89~L108 特例 DELETE；**已 UTF-16LE 解碼驗證**）
- 既有實作：`apps/api/src/modules/assignment/stage1/stage1-filter-chain.ts`（`applyListNmSpecialDeletes`，**v2.0 待修正 trigger + parseInt**）、`assignment-run-pipeline.service.ts`（`runStage1ForList`）
- 資料模型：[data-model.md](../data-model.md)（`ob_pool_data` / `ob_pool_data_list` / `ob_monthly_run_result`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 相關功能：[F090](F090-obpooldata-list-etl.md)、[F092](F092-stage1-dry-run-estimate.md)、[F094](F094-monthly-run-result-table.md)、[F095](F095-applied-special-rules-readonly.md)、[F061](F061-trigger-assignment-run.md)（月跑觸發）、[F049](F049-stage0-daily-estimate.md)、[F088](F088-ready-stage-summary.md)

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 關鍵測試案例（以 SP 行為為 ground truth）：
  - MONTH_CNT：`list_period_start=1, end=6, interval=1` → months=[1..6]；`interval=2`（1,3,5）；缺值 → skip + warning；`interval=0` → skip + warning
  - 近 3 個月去重：去重視窗 `assigndayStart = workdt−3月`、`assigndayEnd = MIN(MAX(assignday), workdt−1日)`；`MAX(assignday)` NULL → 退化 `workdt−1日`；`MAX(assignday)` 為未來日期 → 取 `workdt−1日`；`custo_no` 在集合中 → 排除；`custo_no IS NULL` 不誤排除
  - **特例 DELETE 詐騙白牌**：`list_type='01' AND spec_name 含白牌` 無條件排除（不依賴 list_nm）
  - **特例 DELETE 機車期中（R-PERIOD-MOTORCYCLE）**：`list_nm` 含「期中」+「機車」→ `payt_term >= deal_num−3` 排除、`appl_no` 前綴 T/Y 排除、`deal_num` 字串需 Number 轉換
  - **特例 DELETE 期中小資（R-PERIOD-XIAOZI）**：`list_nm` 含「期中」→ `payt_num > deal_num−8 AND spec_name 含小資` 排除
  - **特例 DELETE 年以上（R-YEAR-ABOVE）**：`list_nm` 含「年以上」→ `parseInt(year_produ) < 當年−15` 排除；`year_produ` NULL → 視為 1900 排除；`year_produ` 非數字 → parseInt 行為驗證
  - **regression（bug fix 防回退）**：`list_nm` 含「中結」「強案」「年資」之名單**不再**觸發任何特例 DELETE（除詐騙白牌無條件）；`spec_name 含「滿」`（無「小資」）不被 R-PERIOD-XIAOZI 排除
  - 機車期中 + 期中小資雙重套用：`list_nm` 同含「期中」「機車」時兩規則皆套用（不合併，BR-1）
  - **trigger pure utility 一致性**：`applyListNmSpecialDeletes` 與 [F095 `deriveAppliedSpecialRules`](F095-applied-special-rules-readonly.md) 對同一 `list_nm` 推導之 `appliedRuleIds` 完全一致
  - `Stage1FilterChain` 月跑模式 vs dry-run 模式對同一 fixture 回相同 count（F092 前置）
  - regression：既有欄位篩選 + `EMPTY_CONDITIONS` skip 行為不破壞；月跑寫入目標為 `ob_monthly_run_result`（[F094](F094-monthly-run-result-table.md)）
- mock 契約注意（[記憶 feedback_mock_real_system_contract]）：`list_nm` 字串比對之 mock 須含**真實中文**（期中 / 機車 / 小資 / 年以上 / 白牌，**非** v1.0 之中結 / 強案 / 滿 / 年資）與大小寫 / 編碼一致；`assignday` mock 須為 yyyyMMdd 字串格式

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | 特例 DELETE 之 `list_nm` 字串比對脆弱性為業務接受風險（AD-E07-26 §26.4 忠實複刻）；結構化旗標保留為 OQ-STAGE1-01 follow-up | Resolved（引用 AD-E07-26 DP-AD26-3） |
| A-2 | 去重上界採 `MIN(MAX(assignday), workdt−1日)`（DP-AD25-4）；精確上界（OBASSIGNSET）為 OQ-STAGE1-02 follow-up | Resolved（引用 AD-E07-25） |
| A-3 | `Stage1FilterChain` 之模組歸屬（獨立 Injectable vs 既有模組）由 tdd-implementation 依 AD-E07-23 §23.5 循環依賴分析決定 | [ASSUMPTION] |
| A-4 | trigger 判斷 pure utility 之函數簽名（`matchesSpecialRule` / `deriveAppliedSpecialRules`）由 tdd-implementation 與 F095 協調統一；本 feature 僅要求「共用同一份」 | [ASSUMPTION] |

## 12. Follow-up / Open Questions

| OQ 編號 | 議題 | 現況決策 | 狀態 |
|---|---|---|---|
| OQ-STAGE1-01 | 特例 DELETE 結構化旗標（`ob_list_definition.special_delete_rules` JSONB）取代 `list_nm` 字串比對 | 本輪不新建 DB 欄位（AD-E07-26 DP-AD26-3）；維持忠實複刻字串比對；業務反映名稱異動致規則未生效時觸發 | Open（Low，follow-up） |
| OQ-STAGE1-02 | `OBASSIGNSET` ETL 精確去重上界（`MAX(CASEDT)`）同步 | 維持 `MIN(MAX(ob_pool_data_list.assignday), workdt−1日)` 近似（DP-AD25-4）；業務驗收近似誤差不可接受時觸發 | Open（Low） |
| OQ-STAGE1-99 | `caseyear='99'` wildcard 之 `year_cnt` 語意與 SP `0 <= year_cnt < 15` 封頂不一致 | 沿用 [F049 OQ-E07-STAGE0-99](F049-stage0-daily-estimate.md) 決策（'99' 為原系統停用選項，屬理論邊界，維持完全 skip year_cnt） | Open（理論邊界） |

## 13. Production 影響標注（⚠️ 重點）

- **本 Phase（F091）是改變 production 月跑分派案件數的階段**（[AD-E07-26 DP-AD26-1](../architecture-spec.md)），與 [F094](F094-monthly-run-result-table.md)（結果表切換）同批 deploy（Phase A）。
- **無 feature flag、deploy 後立即生效於所有環境（含 production）**（DP-AD23-2 / DP-AD26-1）。v2.0 之 trigger 修正屬 **high-severity bug fix**，將顯著改變各類名單之過濾案件數：
  - 含「**中結**」「**強案**」「**年資**」之名單：v1.0 錯誤套用之 payt_term / appl_no / 車齡過濾將**移除**（這些名單分派案件數**增加**）
  - 含「**期中機車**」「**期中小資**」「**年以上**」之名單：v1.0 漏掉之過濾改為正確套用（這些名單分派案件數**減少**）
  - 詐騙白牌（無條件）與 MONTH_CNT 期別過濾 + 近 3 個月去重之新增過濾：分派案件數整體**減少**
- **風險管控（無 flag 版本，[AD-E07-26 DP-AD26-1](../architecture-spec.md)）**：
  1. **Deploy 前業務知會 + 案件數差異驗收（必要）**：Phase A PR merge 前，業務主管須已知悉本次 deploy 將改變各類名單的分派案件數方向（如上），並於 staging/dev 完成各類名單案件數差異驗收。
  2. **部署前 dry-run 驗證（建議）**：[F092](F092-stage1-dry-run-estimate.md) 完成後，於 staging/dev 執行完整月跑 dry-run，比對 deploy 前後（v1.0 vs v2.0）案件數差異，依名單 `list_nm` 分類確認過濾量符合業務預期。
  3. **無 flag 回滾**：一旦 deploy，無法透過 flag 回滾；若結果不符預期，須提交 hotfix PR 回退（移除 MONTH_CNT fragment + 去重 + 特例 DELETE filter，或回退 trigger 關鍵字）。此為明確接受之 trade-off。
- **不影響範圍**：Stage 2（計分）、Stage 3/4（部門/人員分配）讀取 Stage 1 寫入後之結果，為下游消費；API endpoint 簽名不變（改動在 service / pure function 層）。月跑寫入目標表切換之影響見 [F094 §13](F094-monthly-run-result-table.md)。
</content>
</invoke>
