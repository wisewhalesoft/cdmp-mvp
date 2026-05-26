---
type: test-design-feature
feature_id: F091
feature_name: Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE）
priority: P0-MVP
related_spec: /docs/specs/features/F091-stage1-complete-month-cnt-dedup-special-delete.md
spec_version: "1.0"
covers:
  - F091
  - US-134
last_updated: 2026-05-26
---

# F091：Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE）— 測試設計

> ⚠️ **PRODUCTION 行為變更（測試設計必讀）**：本 feature 是三階段中**唯一改變 production 月跑分派案件數**的階段（[AD-E07-24 §24.2](../../../specs/architecture-spec.md)）。月跑案件數將**減少**（過濾不符期別 / 近期已派 / 特殊業務排除之案件）。**所有既有的 Stage 1 pipeline integration test 必須更新預期案件數**。無 feature flag，deploy 後立即生效。
>
> **測試設計範圍（v1.0 / 2026-05-26）**：
> 1. MONTH_CNT 期別過濾（SP L38~L65 等效，`buildMonthCntFragment`）
> 2. 近 3 個月已派案去重（SP L73~L87 等效，應用層 filter）
> 3. 特殊 DELETE 四類（SP L69 / L90~L112 等效，應用層 filter）
> 4. `Stage1FilterChain` 封裝：執行順序、skip 行為保留、月跑 / dry-run 共用一致性
> 5. Regression：既有欄位篩選 / `EMPTY_CONDITIONS` 行為不破壞；對既有 pipeline 測試的衝擊標注
>
> **Ground Truth**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（SP L38~L65 / L69 / L73~L87 / L90~L112）

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F091-stage1-complete-month-cnt-dedup-special-delete.md` + `architecture-spec.md` AD-E07-22 / AD-E07-23 + `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` + `stage1-query-composer.ts`（既有 `buildStage1WhereConditions`）+ `assignment-run-pipeline.service.ts`（`runStage1ForList` 改呼叫入口） |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Unit（純函式 `buildMonthCntFragment` / `applySpecialDeletes`）；Integration（PostgreSQL TestContainer，去重需真實 ob_pool_data_list） |
| 純函式測試 | `buildMonthCntFragment`、`applySpecialDeletes` 為純函式，無 DB 依賴，均可 Unit 測試 |
| 去重 / executeStage1Chain | async（需查 `ob_pool_data_list`），Integration 層驗證；Unit 層以 mock poolDataListRepo 覆蓋 |
| Mock 注意 | `list_nm` 字串比對 mock 須含真實繁體中文（中結 / 強案 / 滿 / 年資 / 白牌）；`assignday` mock 須為 yyyyMMdd 字串格式（與 F090 ETL 格式一致）|
| Regression 標注 | 既有 Stage 1 pipeline Integration test 的**預期案件數將改變**（三步驟補入後案件數減少）；建議在此 feature PR merge 前更新或停用既有 baseline 斷言 |

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F091-MC-001~006 | 6 | 高 | Unit（純函式） | buildMonthCntFragment：正常 / 邊界 / skip |
| TS-F091-DD-001~005 | 5 | 高（Unit mock + Integration PG TC） | Unit/Integration | 去重視窗計算 + 應用層 filter + 聯集來源 |
| TS-F091-SD-001~008 | 8 | 高 | Unit（純函式 + mock） | 特殊 DELETE 四類（SP 逐條對照） |
| TS-F091-CH-001~005 | 5 | 高（混合） | Unit/Integration | Stage1FilterChain 封裝：執行順序 + skip 保留 + dry-run 一致性 |
| TS-F091-RG-001~003 | 3 | 高 | Unit / Regression | 既有 buildStage1WhereConditions / EMPTY_CONDITIONS / pipeline test 標注 |

---

## 一、MONTH_CNT 期別過濾（SP L38~L65）

> **設計依據**：F091 AC-1；AD-E07-22 §22.2；SP L38~L43（WHILE 迴圈）+ L65（`WHERE MONTH_CNT IN`）

---

### TS-F091-MC-001：正常生成期別集合 — interval=1（start=1, end=6）

- **關聯需求**：F091 AC-1；SP L38~L43 + L65；AD-E07-22 §22.2
- **測試類型**：Positive / Unit
- **測試層**：Unit（`buildMonthCntFragment` 純函式）
- **前置條件**：
  - `ObListDefinition` mock：`list_period_start=1`、`list_period_end=6`、`list_interval=1`
- **步驟**：
  1. 呼叫 `buildMonthCntFragment(list)` 取得 fragment
  2. 驗證 `fragment` 非 null
  3. 驗證 `fragment.fragment` 包含 `"month_cnt" IN (:...monthCntVals)` 形式
  4. 驗證 `fragment.params.monthCntVals` 陣列等於 `[1, 2, 3, 4, 5, 6]`（共 6 個值）
- **預期結果**：
  - `monthCntVals = [1, 2, 3, 4, 5, 6]`（SP WHILE 迴圈等效）
  - SQL fragment 含 `IN (:...monthCntVals)`
- **SP 對照**：SP L38 `WHILE @LIST_PERIOD_START <= @LIST_PERIOD_END`，L42 步進 `@LIST_INTERVAL`，L65 `WHERE o.MONTH_CNT IN (SELECT Data FROM @TmpTbl)`

---

### TS-F091-MC-002：interval=2（奇數期別集合）

- **關聯需求**：F091 AC-1
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_period_start=1`、`list_period_end=6`、`list_interval=2`
- **步驟**：
  1. 呼叫 `buildMonthCntFragment(list)`
  2. 驗證 `params.monthCntVals = [1, 3, 5]`（start=1, +2, +2 = 5 <= 6；下一個 7 > 6 停止）
- **預期結果**：
  - `monthCntVals = [1, 3, 5]`（奇數期別，偶數期別 2/4/6 不含）

---

### TS-F091-MC-003：邊界 — start=end（單一期別）

- **關聯需求**：F091 AC-1（邊界：`list_period_start = list_period_end`）
- **測試類型**：Boundary / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_period_start=6`、`list_period_end=6`、`list_interval=1`
- **步驟**：
  1. 呼叫 `buildMonthCntFragment(list)`
  2. 驗證 `params.monthCntVals = [6]`（只有一個值）
- **預期結果**：
  - 結果不為空、不為 null；`monthCntVals = [6]`（單一期別）

---

### TS-F091-MC-004：邊界 — interval > (end - start)（只產生 start 一個值）

- **關聯需求**：F091 AC-1（邊界）
- **測試類型**：Boundary / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list_period_start=3`、`list_period_end=5`、`list_interval=10`
- **步驟**：
  1. 呼叫 `buildMonthCntFragment(list)`
  2. 驗證 `params.monthCntVals = [3]`（start=3 <= end=5，插入 3；下一個 13 > 5，停止）
- **預期結果**：
  - `monthCntVals = [3]`（只有 start 一個值）

---

### TS-F091-MC-005：缺值 skip — list_period_* 任一 null → skip + warning（不阻擋月跑）

- **關聯需求**：F091 AC-1（邊界：「任一為 NULL → skip 此 fragment + warning，不阻擋月跑」）；BR-4
- **測試類型**：Negative / Unit（三個子場景）
- **測試層**：Unit（純函式）

**子場景 5a：list_period_start = null**
- **前置條件**：`list_period_start = null`、`list_period_end = 6`、`list_interval = 1`
- **步驟**：呼叫 `buildMonthCntFragment(list)`
- **預期結果**：回傳 `null`（skip）；fragment 為 null；**不 throw**

**子場景 5b：list_period_end = null**
- **前置條件**：`list_period_start = 1`、`list_period_end = null`、`list_interval = 1`
- **步驟**：呼叫 `buildMonthCntFragment(list)`
- **預期結果**：回傳 `null`；**不 throw**

**子場景 5c：list_interval = null（或 = 0 或 < 0）**
- **前置條件**：`list_period_start = 1`、`list_period_end = 6`、`list_interval = 0`
- **步驟**：呼叫 `buildMonthCntFragment(list)`
- **預期結果**：回傳 `null`（防 infinite loop）；**不 throw**；`warnings` 含 `{ code: 'MONTH_CNT_INTERVAL_INVALID' }` 或等效 warning

---

### TS-F091-MC-006：MONTH_CNT fragment 以 AND 連接至欄位篩選 fragments

- **關聯需求**：F091 AC-1（「以 AND 連接至既有欄位篩選 fragments」）；AD-E07-22 §22.2
- **測試類型**：Positive / Unit
- **測試層**：Unit（`executeStage1Chain` mock 驗證 SQL 組合）
- **前置條件**：
  - `list_period_start=1`、`list_period_end=3`、`list_interval=1`
  - `condition_payload` 含 `prod_kind` categorical fragment（已有欄位篩選）
- **步驟**：
  1. 呼叫 `executeStage1Chain` 或 `buildStage1WhereConditions` 後再組合 month_cnt fragment
  2. 驗證最終 SQL WHERE 子句形如：`("prod_kind" IN (:...cat0)) AND ("month_cnt" IN (:...monthCntVals))`
- **預期結果**：
  - MONTH_CNT fragment 以 `AND` 連接在欄位篩選之後（非 OR）
  - 兩個 fragment 均存在、不互相覆蓋

---

## 二、近 3 個月已派案去重（SP L73~L87）

> **設計依據**：F091 AC-2；AD-E07-22 §22.3；SP L74~L87（`@Q_ASSIGNDAY_S` / `@Q_ASSIGNDAY_E` / DELETE JOIN TMP）
> **去重上界近似**：本系統採 `workdt - 1 日`（近似 SP 的 `ISNULL(MAX(OBASSSIGNSET.CASEDT), workdt-1)`，DP-AD21-3）

---

### TS-F091-DD-001：去重視窗計算正確（assigndayStart / assigndayEnd）

- **關聯需求**：F091 AC-2；F091 §5.2 去重視窗參數；SP L74~L75
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式 or mock，驗證參數計算邏輯）
- **前置條件**：
  - `workdt = new Date('2026-06-01')` 即 `PROJECT_WORKYM = '202606'` + `'01'`
- **步驟**：
  1. 計算 `assigndayStart = workdt - 3 個月` → `'20260301'`（yyyyMMdd 字串）
  2. 計算 `assigndayEnd = workdt - 1 日` → `'20260531'`（上月末日 yyyyMMdd）
  3. 驗證兩個值格式為 yyyyMMdd 字串（8 字元，非 Date 物件、非 ISO）
- **預期結果**：
  - `assigndayStart = '20260301'`（2026-06-01 - 3 個月 = 2026-03-01）
  - `assigndayEnd = '20260531'`（2026-06-01 - 1 日 = 2026-05-31）
  - 兩值均為 yyyyMMdd 字串
- **SP 對照**：SP L74 `@Q_ASSIGNDAY_S = CONVERT(VARCHAR, DATEADD(MONTH,-3,@WORKDT),112)`；L75 `@Q_ASSIGNDAY_E = CONVERT(VARCHAR, DATEADD(DD,-1,@WORKDT),112)`（近似值）

---

### TS-F091-DD-002：custo_no 在去重集合 → 從結果刪除

- **關聯需求**：F091 AC-2；SP L85~L87（DELETE JOIN TMP）
- **測試類型**：Positive / Unit
- **測試層**：Unit（mock `poolDataListRepo`）
- **前置條件**：
  - `workdt = new Date('2026-06-01')`；視窗 `['20260301', '20260531']`
  - mock `poolDataListRepo.createQueryBuilder()` 回傳去重集合 `Set { 'C000001', 'C000002' }`
  - `pool`（欄位篩選後案件列表）含 5 筆案件：
    - `custo_no = 'C000001'`（在去重集合中）
    - `custo_no = 'C000002'`（在去重集合中）
    - `custo_no = 'C000003'`（不在去重集合）
    - `custo_no = 'C000004'`（不在去重集合）
    - `custo_no = 'C000005'`（不在去重集合）
- **步驟**：
  1. 呼叫 `executeStage1Chain`（或等效去重步驟）
  2. 驗證結果中 `custo_no = 'C000001'` 和 `'C000002'` 已從案件列表移除
  3. 驗證 `custo_no = 'C000003'`、`'C000004'`、`'C000005'` 保留
- **預期結果**：
  - pool filter 後剩 3 筆（C000003 / C000004 / C000005）
  - 去重過濾為應用層 `pool.filter(c => !recentAssignedCustoNos.has(c.custo_no))`
- **SP 對照**：SP L85~L87 `DELETE A FROM #TargetCase A JOIN TMP B ON A.CUSTO_NO = B.CUSTO_NO`

---

### TS-F091-DD-003：custo_no IS NULL 的案件不被誤排除

- **關聯需求**：F091 AC-2（「`custo_no IS NOT NULL` 條件，避免 NULL 案件誤排」）；SP L79~L80（`AND custo_no IS NOT NULL`）
- **測試類型**：Negative / Unit
- **測試層**：Unit（mock）
- **前置條件**：
  - mock 去重集合含 `'C000001'`
  - pool 含一筆 `custo_no = null` 的案件
- **步驟**：
  1. 執行去重 filter
  2. 驗證 `custo_no = null` 的案件保留（Set 中不存在 null，`!Set.has(null)` 為 true）
- **預期結果**：
  - `custo_no = null` 案件**不被刪除**
  - 去重查詢 SQL 含 `AND custo_no IS NOT NULL`（不把 NULL 加入去重集合）

---

### TS-F091-DD-004：無歷史（ob_pool_data_list 為空）→ 去重不過濾（退化行為）

- **關聯需求**：F091 §7 錯誤場景（「ob_pool_data_list 無 legacy 歷史 → 去重查詢回空集合 → 不過濾」）
- **測試類型**：Negative / Unit
- **測試層**：Unit（mock `poolDataListRepo` 回空集合）
- **前置條件**：
  - mock `poolDataListRepo` 的去重查詢回傳空 `Set {}`（0 個 custo_no）
  - pool 含 10 筆案件
- **步驟**：
  1. 執行去重 filter
  2. 驗證 pool 仍為 10 筆（無任何案件被刪除）
- **預期結果**：
  - pool 大小不變（退化為不過濾，等同 F090 部署前的行為）
  - 不 throw、不記 error（空集合為正常狀態）

---

### TS-F091-DD-005：去重來源聯集 — etl_legacy + monthly_run 兩來源均納入

- **關聯需求**：F091 AC-2（「不加 `data_source` 過濾，涵蓋 etl_legacy + monthly_run 聯集」）；F090 BR-5
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer；需真實 ob_pool_data_list seed）
- **前置條件**：
  - `ob_pool_data_list` seed：
    - `custo_no = 'CE001'`，`data_source = 'etl_legacy'`，`assignday = '20260401'`（在視窗內）
    - `custo_no = 'CM001'`，`data_source = 'monthly_run'`，`assignday = '20260415'`（在視窗內）
    - `custo_no = 'CN001'`，`data_source = NULL`，`assignday = '20260420'`（在視窗內）
  - `workdt = new Date('2026-06-01')`；視窗 `['20260301', '20260531']`
  - pool 含三筆：`custo_no = 'CE001'`、`'CM001'`、`'CN001'`、`'CX001'`（不在去重集合）
- **步驟**：
  1. 執行去重查詢（真實 PostgreSQL，不加 data_source 過濾）
  2. 確認去重集合含 `'CE001'`、`'CM001'`、`'CN001'`
  3. 執行 filter 後驗證 pool 只剩 `'CX001'`
- **預期結果**：
  - 去重集合大小 = 3（三種來源均被納入）
  - pool filter 後僅 `'CX001'` 一筆（其餘三筆均被去重）
  - 去重 SQL **不含** `AND data_source = ...`（regression guard）
- **DB 需求**：PostgreSQL TestContainer

---

## 三、特殊 DELETE（SP L69 / L90~L112）

> **設計依據**：F091 AC-3~AC-6；AD-E07-22 §22.4；SP L69（詐騙白牌）+ L90~L112（三規則）
> **重要**：SP 忠實複刻、不優化合併（DP-AD22-1）；mock 須含真實繁體中文字串

---

### TS-F091-SD-001：詐騙白牌 — list_type='01' AND spec_name 含「白牌」（無條件，不依賴 list_nm）

- **關聯需求**：F091 AC-6；SP L69（`DELETE WHERE LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`）
- **測試類型**：Positive / Unit
- **測試層**：Unit（`applySpecialDeletes` 純函式）
- **前置條件**：
  - `list.list_nm = '一般催收名單'`（不含「中結」/「年資」等觸發字）
  - pool 含 3 筆：
    - `{ list_type: '01', spec_name: '詐騙白牌方案' }`（應排除）
    - `{ list_type: '02', spec_name: '詐騙白牌方案' }`（list_type 不符，不排除）
    - `{ list_type: '01', spec_name: '一般方案' }`（spec_name 不含「白牌」，不排除）
- **步驟**：
  1. 呼叫 `applySpecialDeletes(pool, list, workdt)`
  2. 驗證結果 pool 大小
- **預期結果**：
  - 結果 pool 為 2 筆（第 1 筆被排除）
  - `list_type='01' AND spec_name含'白牌'` 的案件被排除
  - 此規則適用於**所有名單**（不檢查 `list_nm`）
- **SP 對照**：SP L68~L69 `DELETE FROM #TargetCase WHERE LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`

---

### TS-F091-SD-002：中結強案規則 — payt_term >= deal_num - 3（排除）

- **關聯需求**：F091 AC-3；SP L90~L94
- **測試類型**：Positive / Unit
- **測試層**：Unit（`applySpecialDeletes` 純函式）
- **前置條件**：
  - `list.list_nm = '中結強案特催名單'`（同時含「中結」和「強案」）
  - pool 含 4 筆：
    - `{ payt_term: 21, deal_num: '24', appl_no: 'A001' }`（payt_term=21 >= 24-3=21 → 排除）
    - `{ payt_term: 20, deal_num: '24', appl_no: 'A002' }`（payt_term=20 < 21 → 保留）
    - `{ payt_term: 5, deal_num: '36', appl_no: 'T003' }`（appl_no 以 T 開頭 → 排除）
    - `{ payt_term: 5, deal_num: '36', appl_no: 'Y004' }`（appl_no 以 Y 開頭 → 排除）
- **步驟**：
  1. 呼叫 `applySpecialDeletes(pool, list, workdt)`
  2. 驗證結果中被排除的案件
- **預期結果**：
  - `A001`（payt_term 達到閾值）、`T003`（T 開頭）、`Y004`（Y 開頭）被排除
  - `A002` 保留（payt_term=20 < 24-3=21）
  - 結果 pool 為 1 筆（A002）
- **型別注意**：`payt_term` 為 INTEGER；`deal_num` 為 `string | null`，比較前需 `Number(deal_num)` 轉換
- **SP 對照**：SP L93~L94 `WHERE (PAYT_TERM >= DEAL_NUM - 3) OR (APPL_NO LIKE 'T%' OR APPL_NO LIKE 'Y%')`

---

### TS-F091-SD-003：中結強案規則 — 邊界值（payt_term = deal_num - 4 不排除；payt_term = deal_num - 3 排除）

- **關聯需求**：F091 AC-3（邊界：`payt_term >= deal_num - 3`）
- **測試類型**：Boundary / Unit
- **測試層**：Unit（純函式）
- **前置條件**：`list.list_nm = '中結強案名單'`；pool 含兩筆：
  - `{ payt_term: 20, deal_num: '24' }`（20 = 24-4 < 21 → 保留）
  - `{ payt_term: 21, deal_num: '24' }`（21 = 24-3 = 21 → 排除）
- **步驟**：執行 `applySpecialDeletes`
- **預期結果**：
  - `payt_term=20` 保留（payt_term=20 < deal_num-3=21，未達閾值）
  - `payt_term=21` 排除（payt_term=21 >= deal_num-3=21，達到閾值）

---

### TS-F091-SD-004：中結規則（含 deal_num-8 閾值）— payt_num > deal_num-8 AND spec_name 含「滿」

- **關聯需求**：F091 AC-4；SP L98~L100（`LIST_NM LIKE '%中結%'`；`PAYT_NUM > DEAL_NUM - 8 AND SPEC_NAME LIKE '%滿%'`）
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '中結定型化契約名單'`（含「中結」但不含「強案」）
  - pool 含 3 筆：
    - `{ payt_num: 17, deal_num: '24', spec_name: '信貸滿期' }`（payt_num=17 > 24-8=16 且 spec_name 含「滿」→ 排除）
    - `{ payt_num: 16, deal_num: '24', spec_name: '信貸滿期' }`（payt_num=16 = deal_num-8，非「>」→ 保留）
    - `{ payt_num: 17, deal_num: '24', spec_name: '一般方案' }`（spec_name 不含「滿」→ 保留）
- **步驟**：呼叫 `applySpecialDeletes`
- **預期結果**：
  - 第 1 筆排除（payt_num > deal_num-8 且 spec_name 含「滿」）
  - 第 2 筆保留（payt_num=16 ≤ deal_num-8=16，條件 `>` 不成立）
  - 第 3 筆保留（spec_name 不含「滿」）
- **型別注意**：`payt_num` 為 INTEGER；`deal_num` 為 `string | null`，`Number()` 轉換
- **SP 對照**：SP L100 `DELETE WHERE (PAYT_NUM > DEAL_NUM - 8) AND SPEC_NAME LIKE '%滿%'`

---

### TS-F091-SD-005：年資 15 年規則 — year_produ < 當年 - 15

- **關聯需求**：F091 AC-5；SP L108~L111（`LIST_NM LIKE '%年資%'`；`ISNULL(YEAR_PRODU,'1900') < DATEPART(YEAR,@WORKDT) - 15`）
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '年資管理名單'`（含「年資」）
  - `workdt = new Date('2026-06-01')`；`currentYear = 2026`；閾值 = `2026 - 15 = 2011`
  - pool 含 4 筆：
    - `{ year_produ: '2010' }`（'2010' < '2011' → 排除）
    - `{ year_produ: '2011' }`（'2011' ≮ '2011' → 保留，字串比較等於不排除）
    - `{ year_produ: '2020' }`（'2020' ≮ '2011' → 保留）
    - `{ year_produ: null }`（null → 視為 '1900'，'1900' < '2011' → 排除）
- **步驟**：呼叫 `applySpecialDeletes(pool, list, workdt)`
- **預期結果**：
  - `year_produ='2010'` 排除（字串 '2010' < '2011'）
  - `year_produ=null` 排除（`(null ?? '1900') = '1900'`，'1900' < '2011'）
  - `year_produ='2011'` 保留（'2011' ≮ '2011'，不滿足嚴格小於）
  - `year_produ='2020'` 保留
- **實作注意**：字串比較（不轉 int），對齊 SP `ISNULL(YEAR_PRODU,'1900') < DATEPART(YEAR,@WORKDT) - 15`（SP 數值比較；本系統 `year_produ` 為字串，需確認字串比較語意與 SP 數值比較一致：字串 '2010' < '2011' 在長度固定 4 碼時等效數值比較）

---

### TS-F091-SD-006：list_nm 觸發條件 — 中結強案 AND 中結雙重套用（不合併，忠實複刻 SP 順序）

- **關聯需求**：F091 AC-3~AC-4（SP L90 + L98 雙重條件，DP-AD22-1 忠實複刻、不合併）；BR-1
- **測試類型**：Positive / Unit（順序驗證）
- **測試層**：Unit（純函式，spy 執行順序）
- **前置條件**：
  - `list.list_nm = '中結強案方案'`（**同時含「中結」和「強案」**，兩條規則均觸發）
  - pool 含 3 筆（AC-3 規則排除後部分案件，AC-4 規則在剩餘案件中再排除）：
    - 案件 A：`payt_term=21, deal_num='24'`（AC-3 排除）
    - 案件 B：`payt_num=17, deal_num='24', spec_name='信貸滿期'`（AC-3 不排除；AC-4 排除）
    - 案件 C：`payt_num=5, deal_num='24', spec_name='一般'`（AC-3 / AC-4 均不排除）
- **步驟**：
  1. 呼叫 `applySpecialDeletes(pool, list, workdt)`
  2. 驗證 AC-3（中結強案）先執行、AC-4（中結）後執行
  3. 驗證最終結果 pool
- **預期結果**：
  - 案件 A 在 AC-3 階段被排除
  - 案件 B 在 AC-4 階段被排除（AC-3 不排除 B，因 payt_term=5 < 21；AC-4 因 payt_num=17 > 24-8=16 且 spec_name 含「滿」排除）
  - 案件 C 保留
  - 最終 pool 只剩案件 C（1 筆）
  - 兩條規則獨立套用（不合併為一條 OR 條件）
- **SP 對照**：SP L90 中結強案判斷 → L98 中結判斷（獨立兩個 IF EXISTS）

---

### TS-F091-SD-007：非觸發名單不受影響

- **關聯需求**：F091 AC-3~AC-5（「各以 list_nm includes 觸發；非觸發名單不受影響」）
- **測試類型**：Negative / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '一般催收名單'`（不含任何觸發字）
  - pool 含 5 筆，其中有 `payt_term >= deal_num-3`、`appl_no` 以 T 開頭、`year_produ` 距今 > 15 年的案件（若觸發規則會被排除）
- **步驟**：呼叫 `applySpecialDeletes(pool, list, workdt)`
- **預期結果**：
  - pool 大小不變（仍為 5 筆）；任何案件均未被排除
  - 詐騙白牌規則（無條件）**仍套用**（若有 `list_type='01' AND spec_name含'白牌'` 的案件仍被排除）

---

### TS-F091-SD-008：deal_num 型別轉換 — string | null 需 Number() 轉換

- **關聯需求**：F091 AC-3 / AC-4（「`deal_num` 為 NUMERIC，entity `string | null`，比較前需 `Number()` 轉換」）；AD-E07-22 §22.4
- **測試類型**：Negative / Unit（型別安全）
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '中結強案名單'`
  - pool 含一筆：`{ payt_term: 21, deal_num: '24.0' }`（deal_num 為 string，含小數點）
- **步驟**：
  1. 呼叫 `applySpecialDeletes`
  2. 驗證 `Number('24.0') - 3 = 21`，`payt_term=21 >= 21` → 應排除
- **預期結果**：
  - 該案件被排除（`Number('24.0')` = 24，24-3=21，21 >= 21）
  - 不因字串比較（'21' >= '24'）導致誤判（**regression guard**：`'24.0' - 3` 字串操作會產生 NaN）

---

## 四、Stage1FilterChain 封裝驗證

> **設計依據**：F091 AC-7 / AC-8；AD-E07-22 §22.4 / AD-E07-23 §23.1~§23.2

---

### TS-F091-CH-001：執行順序對照 SP（① 欄位篩選 → ② MONTH_CNT → ③ 詐騙白牌 → ④ 去重 → ⑤ 特殊 DELETE）

- **關聯需求**：F091 AC-8；AD-E07-22 §22.4（執行順序）；SP 全流程（L48~L65 欄位篩選 → L65 month_cnt → L69 詐騙白牌 → L77~L87 去重 → L90~L112 特殊 DELETE）
- **測試類型**：Positive / Unit
- **測試層**：Unit（spy 執行順序 or 依序 mock 回傳值）
- **前置條件**：
  - 建立可觀察執行順序的 spy：`buildStage1WhereConditions`、`buildMonthCntFragment`、`applySpecialDeletes`（詐騙白牌、去重、其他）
  - `list.list_nm = '中結強案年資名單'`（全部規則觸發）
- **步驟**：
  1. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: false })`
  2. 記錄各步驟呼叫時間順序
- **預期結果**：
  - 執行順序：`buildStage1WhereConditions`（欄位篩選 DB query）→ `buildMonthCntFragment`（month_cnt fragment）→ 詐騙白牌 filter → 去重 DB query + filter → 中結強案 filter → 中結 filter → 年資 filter
  - 詐騙白牌在去重**之前**執行（對齊 SP L69 在 L77 之前）

---

### TS-F091-CH-002：EMPTY_CONDITIONS skip 保留（既有行為不破壞）

- **關聯需求**：F091 AC-8（「既有 `skipReason='EMPTY_CONDITIONS'` 行為保留」）；BR-6
- **測試類型**：Regression / Unit
- **測試層**：Unit（mock）
- **前置條件**：
  - `list.condition_payload = { conditions: [] }`（或路徑 B 全空欄位）
  - `buildStage1WhereConditions` 回傳 `skipReason = 'EMPTY_CONDITIONS'`
- **步驟**：
  1. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: false })`
  2. 驗證回傳的 `Stage1ChainResult`
- **預期結果**：
  - `result.skipped === true`
  - `result.skipReason === 'EMPTY_CONDITIONS'`
  - `result.count === 0`（skip 名單不挑案）
  - MONTH_CNT / 去重 / 特殊 DELETE 步驟**不執行**（skip 後直接回傳，不繼續下游步驟）

---

### TS-F091-CH-003：月跑模式回傳完整案件列表

- **關聯需求**：F091 AC-7（「月跑呼叫 `executeStage1Chain(..., { dryRun: false })`，取得完整案件列（`cases`）」）；AD-E07-23 §23.2
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer；需 ob_pool_data seed）
- **前置條件**：
  - `ob_pool_data` seed 含 10 筆符合 list 條件的案件
  - `ob_pool_data_list` seed 含 2 筆去重 custo_no（視窗內）
  - `list.list_nm = '一般名單'`（不觸發特殊 DELETE）
  - `list_period_start=1`、`list_period_end=6`、`list_interval=1`（MONTH_CNT 過濾）
  - seed 中 7 筆 `month_cnt IN (1..6)`，3 筆 `month_cnt = 9`（會被 MONTH_CNT 過濾）
- **步驟**：
  1. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: false })`
  2. 驗證 `result.cases` 非 undefined
  3. 驗證 `result.cases.length`（10 - 3[MONTH_CNT] - 2[去重]，若去重 custo_no 均在剩餘 7 筆中 = 5 筆）
- **預期結果**：
  - `result.cases !== undefined`（月跑模式回傳完整案件列表）
  - `result.count === result.cases.length`（count 與 cases 長度一致）
  - `result.skipped === false`
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F091-CH-004：月跑 vs dry-run 同 fixture 回相同 count（F092 前置驗證）

- **關聯需求**：F091 §10（「`Stage1FilterChain` 月跑模式 vs dry-run 模式對同一 fixture 回相同 count（F092 前置）」）；F092 AC-3
- **測試類型**：Positive / Integration（關鍵場景）
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：同 CH-003 之 seed 狀態（同一 ob_pool_data / ob_pool_data_list 快照）
- **步驟**：
  1. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: false })`，記錄 `runResult.count`
  2. **不寫入** `ob_pool_data_list`（或 rollback）
  3. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: true })`，記錄 `dryResult.count`
- **預期結果**：
  - `dryResult.count === runResult.count`（精確一致，允許 ±0）
  - `dryResult.cases === undefined`（dry-run 不回傳案件列表）
  - `runResult.cases !== undefined`（月跑回傳案件列表）
- **DB 需求**：PostgreSQL TestContainer
- **備註**：本案例是 F092 AC-3 的核心驗收前提；若此場景 pass，F092 dry-run 精確性才有保障。

---

### TS-F091-CH-005：MONTH_CNT skip（list_period_* null）→ 月跑仍繼續（不阻擋）

- **關聯需求**：F091 AC-1（「skip + warning，名單仍依其餘條件挑案」）；BR-4
- **測試類型**：Positive / Unit
- **測試層**：Unit（mock）
- **前置條件**：
  - `list_period_start = null`（MONTH_CNT fragment skip）
  - `buildStage1WhereConditions` 回傳有效欄位篩選（非 EMPTY_CONDITIONS）
  - mock `poolDataListRepo` 去重查詢回空集合（無歷史）
- **步驟**：
  1. 呼叫 `executeStage1Chain(..., { dryRun: false })`
  2. 驗證 `result.skipped === false`
  3. 驗證 `result.warnings` 含 MONTH_CNT skip warning
  4. 驗證 `result.count > 0`（欄位篩選有效，正常挑案）
- **預期結果**：
  - MONTH_CNT fragment 缺失不導致 `skipped = true`
  - warning 紀錄 MONTH_CNT skip 原因
  - 月跑照常繼續（僅少了 month_cnt 篩選）

---

## 五、Regression 驗證

> **設計依據**：F091 §13（PRODUCTION 行為變更警告）；現有 pipeline test 的影響

---

### TS-F091-RG-001：既有 buildStage1WhereConditions 欄位篩選行為不破壞

- **關聯需求**：F091 AC-7（「`buildStage1WhereConditions(list)` 既有欄位篩選，**不變更**」）
- **測試類型**：Regression / Unit
- **測試層**：Unit（純函式）
- **前置條件**：呼叫 `buildStage1WhereConditions` 時不傳入 month_cnt 相關欄位
- **步驟**：
  1. 以既有測試案例（如 TS-F049-EST-001~009）的 fixture 再次呼叫 `buildStage1WhereConditions`
  2. 驗證回傳結果與 F049 期望值一致
- **預期結果**：
  - `buildStage1WhereConditions` 回傳結果不受 F091 改動影響（純函式無副作用）
  - `IN`、`BETWEEN`、`caseyear → year_cnt` 映射等既有行為全部保留

---

### TS-F091-RG-002：既有 Stage 1 pipeline Integration test 案件數變更標注

- **關聯需求**：F091 §13（⚠️ production 行為變更；「月跑分派案件數將減少」）
- **測試類型**：Regression（人工比對 + 標注）
- **測試層**：Integration（標注，非新增場景）
- **步驟**：
  1. 確認既有 `assignment-run-pipeline.service.spec.ts`（或 `engine-target-load.spec.ts`）中**任何對 Stage 1 案件數的 baseline 斷言**
  2. 標注受影響的斷言：F091 merge 後案件數 = 原 baseline × (過濾率)
  3. 在 F091 PR 中，以 `// F091: updated baseline due to MONTH_CNT + dedup + special-delete` 標注更新後的預期值
- **預期結果**：
  - 受影響的 baseline 斷言已識別並更新（不產生 false failure）
  - 更新後斷言反映「三步驟補入後的真實案件數」
- **備註**：此案例不新增測試，而是提醒 TDD Developer 在實作 F091 時必須同步更新既有測試的預期值。

---

### TS-F091-RG-003：Stage0EstimateService 舊版 estimateListCount 基準升級通知

- **關聯需求**：F091 §9（「Blocks：F092（Phase 3 dry-run 複用 Stage1FilterChain）」）；F049 §11（BR-6 升級）
- **測試類型**：Regression（標注通知）
- **測試層**：Unit（標注）
- **步驟**：
  1. 確認 `stage0-estimate.service.spec.ts` 中 `estimateListCount` 的現行測試（若存在）
  2. 標注：F091 後，`estimateListCount` 尚未升級為完整鏈（F092 才升級）；此期間估算值仍為欄位篩選版（偏高）
  3. 確認此差異在 F092 測試設計中以 AC-3（dry-run ≡ run 精確一致）覆蓋
- **預期結果**：
  - F091 不修改 `estimateListCount`；估算與月跑的偏差在 F092 修正
  - 已標注此「暫時差異期」，避免誤認為 bug

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F091-MC-001~005（MONTH_CNT 純函式） | 高 | 純函式，無 DB；直接 unit 測試 `buildMonthCntFragment` |
| TS-F091-MC-006（AND 連接） | 高 | mock 驗證 SQL 組合；無真實 DB |
| TS-F091-DD-001~004（去重視窗 + mock） | 高 | mock poolDataListRepo；純計算 + filter |
| TS-F091-DD-005（去重聯集 PG TC） | 高（需 PG TC） | 需 PostgreSQL TestContainer；真實 SQL 驗證 data_source 不過濾 |
| TS-F091-SD-001~008（特殊 DELETE 純函式） | 高 | 純函式 `applySpecialDeletes`；中文字串 mock 必須包含真實繁體中文 |
| TS-F091-CH-001~002（執行順序 + skip） | 高 | spy / mock 順序驗證；無 DB |
| TS-F091-CH-003~004（月跑 + dry-run 一致性） | 高（需 PG TC） | 需 PostgreSQL TestContainer；種子資料含 ob_pool_data + ob_pool_data_list |
| TS-F091-CH-005（MONTH_CNT skip 不阻擋） | 高 | mock 驗證 warning 不導致 skip |
| TS-F091-RG-001~003（regression 標注） | 高（標注型） | RG-001 可自動化；RG-002/003 為人工比對後更新斷言 |
