---
spec-id: F100
title: Stage 2~4 SQL 下推 + v2 真實計分引擎（ob_levelcard_* 權重 / customer_core join / CR EXISTS / st4_exchange）
feature-id: F100
source-story: AD 驅動（AD-E07-28 P3）
epic: E07
module: M04 分派執行（月跑執行模型重構 P3）
priority: P0-MVP
version: "1.0"
date: 2026-06-02
status: Draft
---

# F100: Stage 2~4 SQL 下推 + v2 真實計分引擎（AD-E07-28 P3）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-02

> ⚠️ **PRODUCTION 計分 / 分派結果變更警告（必讀）**：本 feature 將 Stage 2（計分）/ Stage 3（CR）/ Stage 4（st4_exchange 分派）下推為 SQL，**並以 SQL 補完 v2 真實計分引擎**（取代 `executeV2` 之 JS 簡化版——現行 `computeScore` 僅實作可從 `ob_pool_data` 直接取的欄位，客戶屬性欄位 join `customer_core` 標註「v2.1 補完」尚未實作）。因此 P3 不只是「機制等價改寫」，還包含「**計分引擎由簡化版升級為真實版**」，可能改變 production 各名單之 score / card_level / tier_level / 分派結果。上線前必須通過 **PG 真庫 JS↔SQL 逐 list 結果等價測試**（§4 AC-8，P3 Definition of Done）作為門檻；對「計分升級造成的差異」須業務知會 + 差異驗收（見 §9）。
>
> **v1.0（2026-06-02 / AD-E07-28 P3）**：依 [AD-E07-28 §5 P3 / §6](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) 與 [architecture-spec.md §5.13.4](../architecture-spec.md) 落地。範圍：Stage 2 計分（`ob_levelcard_score` 區間/類別權重 `SUM(CASE…)` + `customer_core` `LEFT JOIN`）、score→card_level→tier_level（`LEFT JOIN`）、Stage 3 CR（`EXISTS`）、Stage 4 st4_exchange（`ROW_NUMBER()` + `CEIL(×0.1)` 視窗函式）。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md` / AD 文件；不撰寫 production / test 程式碼；不跑 migration；P3 在 [F099](F099-stage1-sql-pushdown.md)（P2）已寫入之 `ob_monthly_run_result` 上下推計分 / 分派。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [AD-E07-28 §5 P3 / §6](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)（**權威**）+ `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`executeV2` L378~ / `computeScore` L521~ / `collectCrCandidates` / st4_exchange L449~503）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（**UTF-16LE，st4_exchange ground truth**）+ [F094 entity](F094-monthly-run-result-table.md)（計分 / 分派欄位）+ data-model.md（`ob_levelcard_*` / `ob_tier` / `customer_core`） |
| Test Designer | 本文件 §4 AC（**AC-5 OQ-06 排序鍵 / AC-8 JS↔SQL 等價門檻**）+ §10 測試覆蓋點名 |
| Architect | 本文件 + [AD-E07-28 §5 P3](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md) |
| 圖表 | [diagrams/F100-stage2-4-pushdown-flow.mmd](../diagrams/F100-stage2-4-pushdown-flow.mmd) |

---

## 1. 功能摘要

把 Stage 2~4 也下推為 SQL，消除「Stage 1 寫表後又讀回 heap 計分」的往返，並以 SQL 補完 v2 真實計分引擎（取代 `executeV2` 的 JS 簡化版）：

- **Stage 2 計分**：`ob_levelcard_score` 的區間型（`level2_s`/`level2_e`）與類別型（`level1`）權重，以 `JOIN` + `SUM(CASE WHEN …)` 在 SQL 累加；客戶屬性欄位（`computeScore` 之 `resolveColumnValue` default 分支標註「需 join customer_core，v2.1 補完」）以 `LEFT JOIN customer_core` 補齊。
- **score → card_level → tier_level**：score 經 `ob_levelcard_level`（區間 `score_s`/`score_e`）→ card_level，再經 `ob_tier`（card_type + card_level）→ tier_level，以 `LEFT JOIN` 完成。
- **Stage 3 CR 動態回分**：`is_cr` 標記改以 `EXISTS`（查歷史 `ob_monthly_run_result` 未成交案件）下推；僅 `cr_enabled` 名單套用。
- **Stage 4 st4_exchange**：T1/T2 案件 10%（向上取整、保底 1）轉該部門 T3（資深）員工，以 `ROW_NUMBER() OVER (PARTITION BY … ORDER BY <排序鍵>)` + `CEIL(count × 0.1)` 視窗函式表達。排序鍵之語意推導見 **§5 / AC-5（OQ-06）**。

P3 完成後 Stage 1~4 全程 set-based，heap 僅承載 SQL 參數與少量編排狀態，F2 全解。

## 2. 使用者故事

**As a** 分派維運人員 / 系統架構維運人員
**I want** 計分、CR、st4_exchange 分派全在 DB 內以 SQL 完成、不把案件讀回 worker heap，且 v2 計分引擎以真實 `customer_core` 屬性補完
**So that** prod 量級月跑全程不再 OOM，計分結果反映完整計分卡定義（含客戶屬性），且 st4_exchange 之「哪 10% 被交換」有明確可重現的排序語意

## 3. 前置條件

- [F099](F099-stage1-sql-pushdown.md)（P2）已交付：Stage 1 已以 `INSERT…SELECT` 寫入 `ob_monthly_run_result`（案件識別 + custo_no/settle_src/assignday）。
- `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier` / `ob_levelcard_version`（active）表存在且可 join。
- `customer_core` 表存在（[F036](F036-target-tables.md) 85 欄位），可 `LEFT JOIN` 補客戶屬性。
- 員工 tier 來源 `ob_empl_set.prod_type='TIER:T*'`（現況；v2.1 後改讀 user.metadata，OQ-E07-26，本 feature 沿用現況）。
- `ob_dept_pct`（部門比例，per project_workym + list_no）、`ob_empl_set`（list_no + deptid_m + ration）。

## 4. 驗收標準

### AC-1：Stage 2 計分以 `SUM(CASE…)` + `customer_core` LEFT JOIN 下推

- **Given** 一份名單之案件已由 Stage 1 寫入 `ob_monthly_run_result`，且該 card_type 有 active version
- **When** Stage 2 計分下推
- **Then** 對該 version 之 active `ob_levelcard_column`，以 `JOIN ob_levelcard_score` + `SUM(CASE WHEN <區間/類別命中> THEN score ELSE 0 END)` 在 SQL 累加 score
  - 區間型（`level2_s`/`level2_e` 有值）：欄位值落在 `[level2_s, level2_e]` 區間 → 取分
  - 類別型（`level1` 有值）：欄位值字串相等（trim 後）→ 取分
- **And** 可從 `ob_pool_data` 直接取的欄位（LIST_MONTH→month_cnt、PROJECT_TP→spec_tp、CAR_YEAR→CURRENT_YEAR−year_produ）沿用既有映射；客戶屬性欄位（CUS_SEX / CAREA / AGE 等）以 `LEFT JOIN customer_core` 補齊（取代 `computeScore` 之 default 分支 TODO）

> **[ASSUMPTION] A-1**：欄位 → 來源表 / 欄位之映射以 [architecture-spec.md §3.10 計分欄位對照表](../architecture-spec.md)（`assignment-run-pipeline.service.ts` 註解 L511~ 引用之「架構 spec L3542 表」）為權威。**customer_core 補完之欄位清單由 tdd-implementation 對齊該表**；本 spec 要求「凡 `computeScore` default 分支標 customer_core 之欄位，P3 須以 LEFT JOIN 補齊計分」，等價性由 AC-8 守住。

### AC-2：score → card_level → tier_level 以 LEFT JOIN 下推

- **Given** 案件已計得 score
- **When** 解析等級
- **Then** `LEFT JOIN ob_levelcard_level`（同 card_type + card_version，`score BETWEEN score_s AND score_e`）→ card_level；再 `LEFT JOIN ob_tier`（同 card_type + card_level）→ tier_level
- **And** card_level 為 NULL 之 fallback（`ob_tier.card_level IS NULL` 之 tier）語意與 JS 版（`assignment-run-pipeline.service.ts` L440~445）等價

### AC-3：無 active version / score 為 NULL 之邊界與 JS 版等價

- **Given** 某 card_type 無 active version，或 score 計算不出（無 active column）
- **When** 下推
- **Then** score / card_level / tier_level 之 NULL 行為與 JS 版（L427~445）等價（無 version → score NULL；score NULL → 不查 level）
- **And** 邊緣 CARD_TYPE（HB/SEB/SEC 等）之 skip 行為沿用 [F061 v1.2](F061-trigger-assignment-run.md)（`report_payload.skippedCases`，月跑仍 completed），P3 不改此語意

### AC-4：Stage 3 CR 以 EXISTS 下推

- **Given** `cr_enabled = true` 之名單
- **When** 標記 `is_cr`
- **Then** 以 `EXISTS`（查歷史 `ob_monthly_run_result` 未成交 `result_status='PENDING'` 之同案件 `(orgno, appl_no)`）下推；命中 → `is_cr='Y'`，否則 `'N'`
- **And** `cr_enabled = false` 之名單一律 `is_cr='N'`（不查歷史）
- **And** 與 JS 版 `collectCrCandidates(ym)` + `crApplPerList.has(\`${orgno}:${appl_no}\`)`（L405~412 / L479~480）結果等價

> **[ASSUMPTION] A-2**：CR 候選來源（歷史 `ob_monthly_run_result` 或短期雙軌之 snapshot type=result）依 [F094 §Phase 邊界](F094-monthly-run-result-table.md)（`collectCrCandidates` 短期維持讀 snapshot，中長期改查本表屬 Phase C）。**P3 之 CR `EXISTS` 來源表由 tdd-implementation 對齊當時 `collectCrCandidates` 之實際來源**；若仍讀 snapshot，`EXISTS` 子查詢對 snapshot；切換至 `ob_monthly_run_result` 屬獨立 follow-up，等價性由 AC-8 守住。

### AC-5：Stage 4 st4_exchange 視窗函式排序鍵（OQ-06 結論）

- **Given** 某名單之案件已計得 tier_level，該部門有 T3（資深）員工
- **When** 決定「哪些 T1/T2 案件被交換為資深員工」
- **Then** 以 `ROW_NUMBER() OVER (PARTITION BY list_no ORDER BY <排序鍵>)` 標序，取前 `CEIL(可交換案件數 × 0.1)`（保底 1）件
- **And** 排序鍵語意依下述 **OQ-06 推導結論**：

> **OQ-06 結論（依 legacy SP ground truth 推導）**：
>
> 已 UTF-16LE 解碼 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（英文版主檔解碼成功；中文版 `Stage4_*.sql` 解碼為 mojibake、**不採信**，遵 feedback_sp_utf16le_decode 教訓僅用成功解碼者）。SP 中「選哪些案件被交換」之排序鍵為：
>
> ```sql
> -- SP #CHANGE_CASES CTE（TEMP）：每位課長/主任身上的 T1/T2/T3 非 CR 案件，
> -- 以「亂數」排序，取前 CHANGE_COUNT（= ROUND(TOTAL_COUNT*0.1, 0)）件作為應交換案件
> ROW_NUMBER() OVER (PARTITION BY A.OB_DEPT, A.OB_EMPLID ORDER BY NEWID()) SEQ
> ...
> JOIN #ASSIGN_EMP B ON A.OB_EMPLID=B.EMPLID AND A.SEQ <= B.CHANGE_COUNT
> ```
> （SP 主檔 `#CHANGE_CASES` 之 `;WITH TEMP AS (… ROW_NUMBER() OVER (PARTITION BY A.OB_DEPT,A.OB_EMPLID ORDER BY NEWID()) SEQ …)` 段；另有 `CHANGE_RN = ROW_NUMBER() OVER (PARTITION BY A.OB_DEPT ORDER BY A.ASSIGNDAY)` 但其僅用於「後續輪流平分給同處專員」之分派順序，**非**「選哪些被交換」。）
>
> **推論**：legacy SP 對「哪 10% 被交換」採 **`NEWID()`（SQL Server 隨機 GUID）排序 → 即隨機取 10%、無業務排序語意**。這與現行 JS `executeV2` 之「依 `scoredPool` 陣列順序（pool `getMany()` 無顯式 ORDER BY）取前 10%」在語意上一致：**兩者皆為「任取 10%」、不承載特定業務優先序**。
>
> **採用之 SQL 排序鍵**：為兼顧「無業務語意」與「SQL 下推之可重現性 / 等價測試之可決定性」，採 **`ROW_NUMBER() OVER (PARTITION BY list_no ORDER BY orgno, appl_no)`**（穩定、可重現的 PK 序），而非 `ORDER BY random()`（不可重現、無法做 deterministic 等價測試）。理由：(a) SP 語意本為隨機 → 任一穩定序皆與「隨機取 10%」業務等價（被交換之「集合大小」相同、具體成員無業務優先序要求）；(b) deterministic 排序使 JS↔SQL 等價測試（AC-8）可逐 list 精確比對。
>
> **✅ 與 JS 現況之語意落差（已裁定 = 對齊現行 JS 簡化版，使用者 2026-06-02 / OQ-F100-01 RESOLVED）**：JS `executeV2` 之 st4_exchange 為**簡化版**——`PARTITION BY list_no`（全名單一池）、交換對象一律指向 `seniorEmpls[0]`（單一資深員工）。**P3 下推一律對齊此現行 JS 簡化版語意**：AC-5 維持 `PARTITION BY list_no` + deterministic `ORDER BY orgno, appl_no`（與 AD-E07-28 §5 P3「`ROW_NUMBER()+CEIL(×0.1)`」一致），AC-6 維持單一 senior 接收。
> legacy SP 之真實交換為 **`PARTITION BY OB_DEPT, OB_EMPLID`（每位主管各取自身案件 10%）+ 主管↔專員「等量配對交換」**（找該專員身上相同 `assignday` 的 T32/T4 案件對換、避免重複、配對失敗則整批不交換 + 寄信告警）——此真實配對交換語意（含寄信告警 / 整批失敗回滾等 legacy 副作用）**明確 out-of-scope，不復刻、不實作**。此處保留說明僅供追溯 SP 原意，非待決分支。

- **And** 交換數量 = `CEIL(可交換 T1/T2 案件數 × 0.1)`，保底 1（與 JS L469~472 `Math.max(1, Math.ceil(exchangeableIdx.length * 0.1))` 等價）
- **And** 僅當該部門存在 T3 資深員工（`seniorEmpls.length > 0`）時才交換（與 JS L470 等價）

### AC-6：員工分配下推

- **Given** 案件之 tier_level 與是否在交換集
- **When** 指派員工
- **Then** 在交換集 → 指向資深員工；其餘 → defaultEmpl（`newEmpls[0] ?? listEmpls[0]`，與 JS L460/L483 等價）
- **And** 部門過濾沿用 `ob_dept_pct`（project_workym + list_no）→ `deptid_m` 比對（JS L450~457）

> **[ASSUMPTION] A-3**：員工分配之 JS 版（`exchangeSet.has(i) ? seniorEmpls[0] : defaultEmpl`）為簡化版（單一 senior / 單一 default）。**OQ-F100-01 已裁定 = 對齊現行 JS（使用者 2026-06-02）**，故本 AC 維持簡化版不改。SP 之「輪流平分給同處專員」（`CHANGE_RN % 專員數`）配對交換邏輯為 out-of-scope，不實作（見 AC-5 ✅ 落差段）。

### AC-7：可中斷邊界 / 冪等 / I-RUN-EST-01 延續

- **Given** P3 為單一大 `INSERT…SELECT`（含 join）或在 P2 結果上 `UPDATE…FROM`
- **When** 執行
- **Then** 可中斷邊界仍為「list 與 list 之間」「Stage 與 Stage 之間」（[AD-E07-28 §9.3](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)，單一 list 之大查詢一旦開始即跑完該 list）
- **And** 冪等清理（I-IDEM-01）延續 [F099 AC-9](F099-stage1-sql-pushdown.md)
- **And** 若 P3 重構為「單一大 `INSERT…SELECT` 含 Stage 1~4 全 join」，Stage 1 之 WHERE/JOIN core 仍須來自 `buildStage1Sql`（I-RUN-EST-01 不因 P3 合併而失效；estimate 路徑仍只跑 Stage 1 COUNT，不含計分 join）

> **不變式延續**：I-RUN-EST-01（[F099](F099-stage1-sql-pushdown.md)）/ I-IDEM-01 / I-NOLOAD-01 於 P3 持續成立。**[ASSUMPTION] A-4**：estimate（Stage 0 試算）僅估「Stage 1 分派案件數」，**不**含 Stage 2~4 計分 / 交換（[F049](F049-stage0-daily-estimate.md) / [F092](F092-stage1-dry-run-estimate.md) 語意），故 P3 計分 join 只在 run 路徑，estimate 不受影響。

### AC-8：JS↔SQL 逐 list 結果等價測試（P3 Definition of Done）

- **Given** 一組代表性名單（含：各 card_type、有/無 active version、區間/類別計分欄位、有 customer_core join 欄位、cr_enabled 開/關、有/無 T3 資深員工之 st4_exchange）
- **When** 對同一輸入名單分別跑舊 JS pipeline（`executeV2`）與新 SQL 下推
- **Then** 兩者產出之 `ob_monthly_run_result`（score / card_level / tier_level / is_cr / dept_id / emplid / emplid_deptid）**逐列等價**
- **And** 此等價比對於 **PG 真庫**執行，為 SQL 版上線之**驗收門檻（P3 DoD）**
- **And** 因 P3 含「計分引擎由簡化版升級為真實版（customer_core 補完）」，**「升級造成的差異」與「下推 bug 造成的差異」須區分**：等價測試之基準應為「**升級後的預期值**」而非「JS 簡化版舊值」——即等價測試驗證 SQL 版 == 「JS 簡化版邏輯 + customer_core 補完之預期」，customer_core 補完造成的合理差異須業務知會（§9）

> **驗收門檻（P3 DoD）**：JS↔SQL 等價測試為 P3 上線硬性 DoD。**測試案例細節由 test-designer 設計**；本 spec 定義門檻與覆蓋要求：(a) 每個計分型別（區間 / 類別 / customer_core join）≥1 樣本；(b) score / level / tier NULL 邊界各一；(c) CR 開 / 關各一；(d) st4_exchange 有 / 無 T3、剛好觸發保底 1、10% 取整邊界各一；(e) 逐列精確相等（score / card_level / tier_level / is_cr / 員工）。**因 st4_exchange 排序鍵採 deterministic（AC-5），等價測試之「哪些被交換」可精確比對。**

## 5. st4_exchange 排序鍵 SP 佐證（OQ-06 詳細）

| SP 區段（`SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`，UTF-16LE 解碼） | 排序鍵 | 用途 |
|------|------|------|
| `#ASSIGN_EMP` 建表：`ROW_NUMBER() OVER (PARTITION BY A.DEPTID_M, B.TITLE_CODE ORDER BY A.EMPLID) RN` + `ROUND(C.TOTAL_COUNT*0.1,0) AS CHANGE_COUNT` | `EMPLID`（員工序，用於專員輪流分派之 RN） | 計算每位主管「應交換數量」= 當月案件數 × 10% |
| `#CHANGE_CASES` 之 `;WITH TEMP`：`ROW_NUMBER() OVER (PARTITION BY A.OB_DEPT, A.OB_EMPLID ORDER BY NEWID()) SEQ` → `JOIN #ASSIGN_EMP ON … AND A.SEQ <= B.CHANGE_COUNT` | **`NEWID()`（隨機）** | **「選哪些 T1/T2/T3 非 CR 案件被交換」之排序鍵 → 隨機取前 10%** |
| `#CHANGE_CASES` 之 `CHANGE_RN = ROW_NUMBER() OVER (PARTITION BY A.OB_DEPT ORDER BY A.ASSIGNDAY)` | `ASSIGNDAY` | 後續「輪流平分給同處專員（`CHANGE_RN % 專員數`）」之分派順序，**非選案** |
| `#OBPOOLDATA_LIST_T4` / `#EXCHANGE_APPL`：`ROW_NUMBER() OVER (PARTITION BY A.ASSIGNDAY, A.OB_EMPLID ORDER BY A.OB_EMPLID) SEQ_T4` | `ASSIGNDAY + OB_EMPLID` | 主管 T1/T2/T3 與專員 T32/T4 之「相同 assignday 配對」鍵（避免同案重複交換） |

**結論**：選案排序鍵在 legacy SP = **隨機（`NEWID()`）**，無業務優先序。本 spec AC-5 採 **deterministic `ORDER BY orgno, appl_no`**（業務等價於隨機，且可做 deterministic 等價測試）。SP 與 JS 現況之配對交換 / partition 維度落差已由 **OQ-F100-01 裁定 = 對齊現行 JS 簡化版**（`PARTITION BY list_no` + 單一 senior；SP 主管↔專員配對交換 out-of-scope、不實作，見 §11 + AC-5 ✅ 落差段）。

## 6. 假設與約束

- **[CONSTRAINT] C-1**：P3 在 [F099](F099-stage1-sql-pushdown.md) 已寫入之 `ob_monthly_run_result` 上補計分 / 分派（`UPDATE…FROM` 或重構單一大 `INSERT…SELECT`）。
- **[CONSTRAINT] C-2**：員工 tier 來源沿用 `ob_empl_set.prod_type='TIER:T*'`（現況，OQ-E07-26 v2.1 升級不在本 feature scope）。
- **[CONSTRAINT] C-3**：st4_exchange 排序鍵採 deterministic（AC-5），不採 `random()`（保證等價測試可決定）。
- **[ASSUMPTION] A-5**：customer_core join 後計分 SQL 複雜度 / 效能須以 `EXPLAIN ANALYZE` 驗證計畫；必要時加索引（沿用 m297/m298 partial index 模式，[AD-E07-28 §10](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)）。

## 7. 相依關係

- **前置**：[F099](F099-stage1-sql-pushdown.md)（P2，Stage 1 已寫入 `ob_monthly_run_result`）、[F098](F098-monthly-run-worker-extraction.md)（P1 worker）、[F036](F036-target-tables.md)（customer_core）、[F094](F094-monthly-run-result-table.md)（計分 / 分派欄位）。
- **修訂既有**：[AD-E07-25](../architecture-spec.md)（寫入方式 JS `save()` → SQL）；取代 `executeV2` 之 JS 簡化計分。
- **不影響**：[F049](F049-stage0-daily-estimate.md) / [F092](F092-stage1-dry-run-estimate.md)（estimate 僅估 Stage 1，不含計分，A-4）。

## 8. 錯誤情境

| 情境 | 系統回應 |
|------|---------|
| JS↔SQL 計分等價測試未通過 | **阻擋上線**（P3 DoD 未達成） |
| customer_core join 缺對應客戶（LEFT JOIN 無 match） | 客戶屬性欄位以 NULL 參與計分（與 JS default 分支之缺值行為對齊，AC-1） |
| 邊緣 CARD_TYPE（HB/SEB/SEC） | 沿用 [F061 v1.2](F061-trigger-assignment-run.md) skip + `report_payload.skippedCases`，月跑仍 completed |

> 本 feature **不新增 HTTP 錯誤碼**。

## 9. Production 計分升級差異知會

- P3 含「`computeScore` 客戶屬性欄位由 customer_core 補完」，可能改變 score / card_level / tier_level / 分派結果。
- **deploy 前須**：(a) 對代表性名單跑「JS 簡化版 vs SQL 真實版」差異報告，量化各名單 score 分佈 / 等級分佈 / 分派變化；(b) 業務知會並驗收差異（沿用 [F067](F067-compare-run-results.md) 比對工具，NFR-005 主驗收）。

## 10. 測試覆蓋點名（test-designer / tdd 承接）

| 項目 | 承接 agent | 覆蓋要求 |
|------|-----------|---------|
| **JS↔SQL 逐列計分 / 分派等價矩陣**（AC-8，P3 DoD） | test-designer | PG 真庫；計分型別 / NULL / CR / st4_exchange 邊界全覆蓋；逐列精確相等 |
| Stage 2 `SUM(CASE…)` 區間 / 類別計分（AC-1） | test-designer | 區間命中 / 邊界 / 類別 trim 相等 |
| customer_core LEFT JOIN 補計分（AC-1） | test-designer | 有 / 無 match；NULL 屬性 |
| score→level→tier LEFT JOIN（AC-2 / AC-3） | test-designer | NULL fallback |
| Stage 3 CR EXISTS（AC-4） | test-designer | cr_enabled 開 / 關；歷史命中 / 未命中 |
| **st4_exchange 排序鍵 deterministic（AC-5 / OQ-06）** | test-designer | 取整邊界 / 保底 1 / 無 T3；「哪些被交換」可精確比對 |
| st4_exchange partition / 員工分配（OQ-F100-01 已裁定 = 對齊 JS 簡化版） | test-designer | 以 `PARTITION BY list_no` + 單一 senior 為基準測；SP 配對交換 out-of-scope、不測 |
| customer_core join 效能 `EXPLAIN ANALYZE`（A-5） | tdd-implementation | 計畫驗證 + 必要索引 |
| Production 計分差異報告（§9） | test-designer + 業務 | F067 比對 |

## 11. Open Questions / 已解決事項

**本 feature 無待裁 open question。** st4_exchange 相關決策均已由使用者於 2026-06-02 拍板：

| ID | 狀態 | 決議 | 影響 |
|----|------|------|------|
| **OQ-F100-01**（解 AD 之 OQ-AD28-06） | ✅ **RESOLVED（使用者 2026-06-02）= 對齊現行 JS 簡化版** | st4_exchange 維持 `PARTITION BY list_no` + 單一 senior 接收 + deterministic `ORDER BY orgno, appl_no`（AC-5 / AC-6）；**不**復刻 legacy SP 之 `PARTITION BY OB_DEPT, OB_EMPLID` 主管↔專員等量配對交換與「整批失敗回滾 / 寄信告警」等副作用——該真實配對交換語意明確 **out-of-scope，不實作**（若未來業務要求精準復刻 SP，須另立 spec 含配對表 / 告警機制） | Stage 4「哪些被交換、換給誰」維持 JS 簡化版；AC-5 / AC-6 / A-3 不再有待決分支 |
| **OQ-AD28-06**（沿用 AD） | ✅ **RESOLVED**（收斂於 OQ-F100-01） | 排序鍵：OQ-06 已結論（SP 隨機 → 採 deterministic `ORDER BY orgno, appl_no`，見 AC-5）；partition 維度 + 配對語意：對齊現行 JS（見 OQ-F100-01） | 同上 |

## 12. 相關

- AD：[AD-E07-28 §5 P3 / §6 / §12 OQ-AD28-06](../implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)
- 架構：[architecture-spec.md §5.13](../architecture-spec.md)
- SP ground truth：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（UTF-16LE）
- 圖表：[diagrams/F100-stage2-4-pushdown-flow.mmd](../diagrams/F100-stage2-4-pushdown-flow.mmd)
- 前置：[F099](F099-stage1-sql-pushdown.md)（P2）、[F098](F098-monthly-run-worker-extraction.md)（P1）、[F036](F036-target-tables.md)（customer_core）
- 計分升級驗收：[F067](F067-compare-run-results.md)
