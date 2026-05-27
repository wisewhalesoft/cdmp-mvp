---
type: test-design-feature
feature_id: F091
feature_name: Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特例 DELETE SP 修正）
priority: P0-MVP
related_spec: /docs/specs/features/F091-stage1-complete-month-cnt-dedup-special-delete.md
spec_version: "2.0"
covers:
  - F091
  - US-134
last_updated: 2026-05-27
---

# F091：Stage 1 補完整（MONTH_CNT 期別過濾 + 近 3 個月去重 + 特例 DELETE SP 修正）— 測試設計

> ⚠️ **v2.0 重大修正（2026-05-27）**：依 F091 spec v2.0（AD-E07-26 特例規則 SP 修正）全面升版。三項核心變更：
>
> **【修正 1】特例 DELETE 觸發關鍵字全面更正（high-severity bug fix，AD-E07-26 §26.2）**
> - v1.0 用「中結強案」/「中結」/「年資」為觸發，經 Node.js UTF-16LE 解碼確認均為 mojibake 誤判
> - v2.0 正確觸發：`R-PERIOD-MOTORCYCLE` → 「期中」+「機車」；`R-PERIOD-XIAOZI` → 「期中」；`R-YEAR-ABOVE` → 「年以上」
> - 排除條件修正：`R-PERIOD-XIAOZI` 排除條件由 `spec_name LIKE '%滿%'` 改為 `spec_name LIKE '%小資%'`
> - **Regression 防回退為本輪最關鍵驗收項目**（見 §六 TS-F091-RGv2 群組）
>
> **【修正 2】去重上界升級（AD-E07-25 DP-AD25-4）**
> - `assigndayEnd` 由固定 `workdt − 1 日` 改為 `MIN(MAX(ob_pool_data_list.assignday), workdt − 1 日)`
> - `MAX(assignday)` 為 NULL（無歷史）時退化 `workdt − 1 日`
>
> **【修正 3】year_produ 改 parseInt 數值比較（AD-E07-26 DP-AD26-2）**
> - `R-YEAR-ABOVE` 由字串比較改為 `parseInt(year_produ ?? '1900', 10) < workdt.getFullYear() − 15`
> - 防禦非數值 / 空字串邊界
>
> **對既有 F091 test spec（v1.0）的影響**：
> - TS-F091-SD-001（詐騙白牌）：無變化，維持
> - TS-F091-SD-002~003（v1.0 中結強案）：廢棄，以 v2.0 機車期中場景（TS-F091-SDv2-002~003）取代
> - TS-F091-SD-004（v1.0 中結/滿規則）：廢棄，以 v2.0 期中小資場景（TS-F091-SDv2-004~005）取代
> - TS-F091-SD-005（v1.0 年資字串比較）：廢棄，以 v2.0 年以上 parseInt 場景（TS-F091-SDv2-006~007）取代
> - TS-F091-SD-006~008（執行順序 / 非觸發 / deal_num 型別）：部分更新見本文件 §五
> - TS-F091-DD-001（去重視窗）：補充上界動態計算場景（TS-F091-DDv2-001a/001b）
> - 所有 v1.0 中提及「中結/強案/年資」的 mock 字串須全面替換為 v2.0 正確關鍵字

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F091-stage1-complete-month-cnt-dedup-special-delete.md`（v2.0）+ `architecture-spec.md` AD-E07-22 / AD-E07-25 §25.5 / AD-E07-26 + `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（UTF-16LE 解碼後 ground truth）+ `stage1-filter-chain.ts`（`applyListNmSpecialDeletes()` 待修正）+ [F094](F094-test.md)（結果落點） |
| QA / Tester | 本文件（特別關注 §六 Regression 防回退群組）+ `error-handling.md#assignment-errors` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Unit（純函式 `buildMonthCntFragment` / `applyListNmSpecialDeletes` / `computeDedupWindow`）；Integration（PostgreSQL TestContainer，去重上界 + 去重聯集） |
| v2.0 重點 | 特例 DELETE 觸發關鍵字全面以正確中文字串 mock（期中機車 / 期中 / 年以上 / 小資 / 白牌）；舊觸發字（中結 / 強案 / 年資 / 滿）之名單不再錯誤套用規則（Regression guard 群組）|
| Mock 注意 | `list_nm` 字串 mock 必須含真實繁體中文（AD-E07-26 BR-8 / 記憶 feedback_mock_real_system_contract）；`assignday` mock 須為 yyyyMMdd 字串格式（8 字元）|
| Regression 標注 | 既有 Stage 1 pipeline Integration test 之**預期案件數須更新**（特例 DELETE 觸發條件變更後，過去誤排的案件將回流，特例規則精確套用後案件數以 SP 為準）|

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F091-MC-001~006（MONTH_CNT，v1.0 維持）| 6 | 高 | Unit（純函式）| 不受 v2.0 影響，原案例不變 |
| TS-F091-DDv2-001a/001b + 001~005（去重，v2.0 補上界）| 7 | 高（混合）| Unit/Integration | 補充動態上界計算 2 個場景；餘 5 個 v1.0 場景維持 |
| TS-F091-SDv2-001~009（特例 DELETE v2.0 版）| 9 | 高 | Unit（純函式）| 全面以 v2.0 正確觸發字 mock；v1.0 SDv1 場景廢棄 |
| TS-F091-CH-001~005（Stage1FilterChain，部分更新）| 5 | 高（混合）| Unit/Integration | CH-001 執行順序說明更新（年以上取代年資等） |
| TS-F091-RGv2-001~005（Regression 防回退，v2.0 新增）| 5 | 高 | Unit / Regression | **最關鍵群組**：確認舊錯誤觸發不再觸發；新觸發正確套用 |
| TS-F091-RG-001~003（v1.0 Regression 標注，部分維持）| 3 | 高（標注型）| Unit / Regression | RG-002/003 更新說明：案件數因 v2.0 觸發條件變更而再調整 |

---

## 一、MONTH_CNT 期別過濾（v1.0 案例維持不變）

> **不受 v2.0 影響。** 以下 6 個場景（TS-F091-MC-001~006）定義與 v1.0 完全相同，不重複展開。TDD Developer 請直接參照 v1.0 定義實作與驗收。
>
> 場景編號：TS-F091-MC-001（interval=1）、TS-F091-MC-002（interval=2）、TS-F091-MC-003（start=end 單一期別）、TS-F091-MC-004（interval > range）、TS-F091-MC-005（null skip 三子場景）、TS-F091-MC-006（AND 連接）。
>
> **SP 對照**：SP L37~L43（WHILE 迴圈）+ L65（`WHERE o.MONTH_CNT IN`）。

---

## 二、近 3 個月已派案去重（v2.0 補上界動態計算）

> **設計依據**：F091 v2.0 AC-2；AD-E07-25 DP-AD25-4；SP L73~L87

---

### TS-F091-DDv2-001a：去重上界動態計算 — MAX(assignday) 存在且早於 workdt-1

- **關聯需求**：F091 v2.0 AC-2（`assigndayEnd = MIN(MAX(ob_pool_data_list.assignday), workdt−1日)`）；AD-E07-25 DP-AD25-4
- **測試類型**：Positive / Unit
- **測試層**：Unit（mock `poolDataListRepo.createQueryBuilder` 回傳固定 MAX）
- **前置條件**：
  - `workdt = new Date('2026-06-01')`（即 `workdt − 1 日 = 2026-05-31`，yyyyMMdd = `'20260531'`）
  - mock `poolDataListRepo` 的 `SELECT MAX(assignday) FROM ob_pool_data_list WHERE assignday IS NOT NULL` 回傳 `'20260415'`（早於 `'20260531'`）
- **步驟**：
  1. 呼叫 `computeDedupWindow(workdt, poolDataListRepo)`（或等效去重上界計算函式）
  2. 驗證回傳的 `assigndayEnd`
- **預期結果**：
  - `assigndayEnd = '20260415'`（取 MIN：`'20260415'` < `'20260531'`）
  - `assigndayStart = '20260301'`（workdt − 3 個月，不受影響）
- **設計說明**：防止 ETL 異常載入「未來 assignday」使去重視窗穿越本月

---

### TS-F091-DDv2-001b：去重上界退化 — MAX(assignday) 為 NULL

- **關聯需求**：F091 v2.0 AC-2（NULL 退化 `workdt − 1 日`）；AD-E07-25 DP-AD25-4
- **測試類型**：Negative / Unit（退化行為）
- **測試層**：Unit（mock `poolDataListRepo` 回傳 NULL）
- **前置條件**：
  - `workdt = new Date('2026-06-01')`
  - mock `SELECT MAX(assignday) FROM ob_pool_data_list WHERE assignday IS NOT NULL` 回傳 `null`（表為空或全無 assignday）
- **步驟**：
  1. 呼叫 `computeDedupWindow(workdt, poolDataListRepo)`
  2. 驗證 `assigndayEnd`
- **預期結果**：
  - `assigndayEnd = '20260531'`（退化為 `workdt − 1 日`，與 v1.0 固定上界相同）
  - **不 throw**（NULL 為正常退化，非錯誤）

---

### TS-F091-DDv2-001c：去重上界 — MAX(assignday) 晚於 workdt-1（防未來日穿越）

- **關聯需求**：F091 v2.0 AC-2（`MIN(MAX, workdt−1)`；若 ETL 異常載入未來日則 MIN 取 workdt-1）
- **測試類型**：Boundary / Unit
- **測試層**：Unit（mock）
- **前置條件**：
  - `workdt = new Date('2026-06-01')`（`workdt − 1 日 = '20260531'`）
  - mock `MAX(assignday) = '20261231'`（異常未來日）
- **步驟**：
  1. 呼叫 `computeDedupWindow(workdt, poolDataListRepo)`
  2. 驗證 `assigndayEnd`
- **預期結果**：
  - `assigndayEnd = '20260531'`（MIN 選 workdt−1，拒絕未來日穿越本月）

---

> **v1.0 去重案例（TS-F091-DD-001~005）維持**：
> - TS-F091-DD-001（視窗計算正確）：補充說明「assigndayEnd 由 computeDedupWindow 動態決定，非固定 workdt-1」
> - TS-F091-DD-002~005（custo_no filter / NULL 不排 / 空集合退化 / 聯集來源）：不受 v2.0 影響，原案例維持

---

## 三、特例 DELETE v2.0（SP 修正版）

> **⚠️ 重要：v1.0 TS-F091-SD-002~005 已廢棄**（觸發關鍵字為 mojibake 誤判）。本節 TS-F091-SDv2-001~009 為 v2.0 正式版，以 SP UTF-16LE 解碼結果為 ground truth。
>
> **設計依據**：F091 v2.0 AC-3~AC-6；AD-E07-26 §26.2；SP L66~L68 / L89~L94 / L97~L100 / L105~L108（已解碼驗證）

---

### TS-F091-SDv2-001：詐騙白牌 — list_type='01' AND spec_name 含「白牌」（無條件，v1.0 場景維持）

- **關聯需求**：F091 v2.0 AC-3；SP L66~L68
- **測試類型**：Positive / Unit
- **測試層**：Unit（`applyListNmSpecialDeletes` 純函式）
- **前置條件**：
  - `list.list_nm = '一般催收名單'`（不含任何觸發字）
  - pool 含 3 筆：
    - `{ list_type: '01', spec_name: '詐騙白牌方案' }`（應排除）
    - `{ list_type: '02', spec_name: '詐騙白牌方案' }`（list_type 不符 → 保留）
    - `{ list_type: '01', spec_name: '一般方案' }`（spec_name 不含「白牌」→ 保留）
- **步驟**：
  1. 呼叫 `applyListNmSpecialDeletes(pool, list, workdt)`
  2. 驗證結果 pool 大小與成員
- **預期結果**：
  - 結果 pool 為 2 筆（第 1 筆被排除）
  - 此規則**不依賴 list_nm**（`isSystemMandatory: true`，無條件套用）
- **SP 對照**：SP L67~L68 `DELETE FROM #TargetCase WHERE LIST_TYPE='01' AND SPEC_NAME LIKE '%白牌%'`

---

### TS-F091-SDv2-002：機車期中規則 — list_nm 含「期中」+「機車」觸發（v2.0 新觸發）

- **關聯需求**：F091 v2.0 AC-4；SP L89~L94（`LIST_NM LIKE '%期中%機車%'`）；AD-E07-26 §26.2
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '機車期中催收名單'`（同時含「機車」與「期中」）
  - pool 含 4 筆：
    - `{ payt_term: 21, deal_num: '24', appl_no: 'A001' }`（21 >= 24-3=21 → 排除）
    - `{ payt_term: 20, deal_num: '24', appl_no: 'A002' }`（20 < 21 → 保留）
    - `{ payt_term: 5, deal_num: '36', appl_no: 'T003' }`（T 開頭 → 排除）
    - `{ payt_term: 5, deal_num: '36', appl_no: 'Y004' }`（Y 開頭 → 排除）
- **步驟**：
  1. 呼叫 `applyListNmSpecialDeletes(pool, list, workdt)`
  2. 驗證排除名單
- **預期結果**：
  - `A001`（payt_term 達閾值）、`T003`（T 開頭）、`Y004`（Y 開頭）被排除
  - `A002` 保留（payt_term=20 < deal_num-3=21）
  - 結果 pool 為 1 筆（A002）
- **型別注意**：`deal_num` 為 `string | null`，比較前需 `Number(deal_num)` 轉換
- **SP 對照**：SP L89 `IF EXISTS (... LIST_NM LIKE '%期中%機車%')`；L92~L93 `DELETE WHERE (PAYT_TERM >= DEAL_NUM - 3) OR (APPL_NO LIKE 'T%' OR APPL_NO LIKE 'Y%')`

---

### TS-F091-SDv2-003：機車期中規則 — 邊界值（payt_term = deal_num-4 不排；payt_term = deal_num-3 排）

- **關聯需求**：F091 v2.0 AC-4（邊界：`>= deal_num - 3`）
- **測試類型**：Boundary / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '機車期中優先名單'`（含「機車」+「期中」）
  - pool 含 2 筆：
    - `{ payt_term: 20, deal_num: '24', appl_no: 'B001' }`（20 = 24-4 < 21 → **保留**）
    - `{ payt_term: 21, deal_num: '24', appl_no: 'B002' }`（21 = 24-3 = 21 → **排除**）
- **步驟**：執行 `applyListNmSpecialDeletes`
- **預期結果**：
  - `B001`（payt_term=20 < 21，嚴格小於閾值）保留
  - `B002`（payt_term=21 >= 21，達到閾值）排除

---

### TS-F091-SDv2-004：期中小資規則 — list_nm 含「期中」觸發（v2.0 新排除條件 %小資%）

- **關聯需求**：F091 v2.0 AC-5；SP L97~L100（`LIST_NM LIKE '%期中%'`；`SPEC_NAME LIKE '%小資%'`）；AD-E07-26 §26.2
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '期中催收名單'`（含「期中」，**不含**「機車」）
  - pool 含 3 筆：
    - `{ payt_num: 17, deal_num: '24', spec_name: '小資分期方案' }`（17 > 24-8=16 且 spec_name 含「小資」→ **排除**）
    - `{ payt_num: 16, deal_num: '24', spec_name: '小資分期方案' }`（16 ≤ 16，條件「>」不成立 → **保留**）
    - `{ payt_num: 17, deal_num: '24', spec_name: '一般方案' }`（spec_name 不含「小資」→ **保留**）
- **步驟**：呼叫 `applyListNmSpecialDeletes`
- **預期結果**：
  - 第 1 筆排除（`payt_num > deal_num-8` 且 `spec_name` 含「小資」）
  - 第 2 筆保留（payt_num=16 ≤ 16，條件 `>` 不成立）
  - 第 3 筆保留（spec_name 不含「小資」）
- **型別注意**：`payt_num` 為 INTEGER；`deal_num` 為 `string | null`，`Number()` 轉換
- **SP 對照**：SP L99 `delete from #TargetCase WHERE (PAYT_NUM > DEAL_NUM - 8) AND SPEC_NAME LIKE '%小資%'`
- **⚠️ v1.0 差異**：v1.0 排除條件誤用 `%滿%`；v2.0 修正為 `%小資%`——含「信貸滿期」但**不含**「小資」之案件**不再被排除**（見 TS-F091-RGv2-004 regression guard）

---

### TS-F091-SDv2-005：期中小資規則 — 邊界值（payt_num = deal_num-8 不排；payt_num = deal_num-7 排）

- **關聯需求**：F091 v2.0 AC-5（邊界：`payt_num > deal_num − 8`，嚴格大於）
- **測試類型**：Boundary / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '期中個人信貸名單'`（含「期中」）
  - pool 含 2 筆（均含 `spec_name = '小資方案'`）：
    - `{ payt_num: 16, deal_num: '24', spec_name: '小資方案' }`（16 = 24-8，非「>」→ **保留**）
    - `{ payt_num: 17, deal_num: '24', spec_name: '小資方案' }`（17 = 24-7，17 > 16 → **排除**）
- **步驟**：執行 `applyListNmSpecialDeletes`
- **預期結果**：
  - `payt_num=16` 保留（等於 deal_num-8，條件 `>` 不成立）
  - `payt_num=17` 排除（嚴格大於 deal_num-8）

---

### TS-F091-SDv2-006：年以上規則 — list_nm 含「年以上」觸發（v2.0 parseInt 數值比較）

- **關聯需求**：F091 v2.0 AC-6；SP L105~L108（`LIST_NM LIKE '%年以上%'`）；AD-E07-26 DP-AD26-2
- **測試類型**：Positive / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '5年以上車主催收名單'`（含「年以上」）
  - `workdt = new Date('2026-06-01')`；`cutoffYear = 2026 - 15 = 2011`
  - pool 含 4 筆：
    - `{ year_produ: '2010' }`（parseInt('2010')=2010 < 2011 → **排除**）
    - `{ year_produ: '2011' }`（parseInt('2011')=2011，不嚴格小於 2011 → **保留**）
    - `{ year_produ: '2020' }`（2020 >= 2011 → **保留**）
    - `{ year_produ: null }`（null → `parseInt('1900')=1900 < 2011` → **排除**）
- **步驟**：呼叫 `applyListNmSpecialDeletes(pool, list, workdt)`
- **預期結果**：
  - `year_produ='2010'` 排除
  - `year_produ=null` 排除（`parseInt(null ?? '1900', 10)` = 1900）
  - `year_produ='2011'` 保留（2011 不小於 2011）
  - `year_produ='2020'` 保留
- **⚠️ v1.0 差異**：v1.0 用字串比較；v2.0 用 `parseInt()` 數值比較。行為等效（4 位數固定長度），但 `parseInt` 防禦非數值輸入
- **SP 對照**：SP L107 `WHERE (ISNULL(YEAR_PRODU,'1900') < DATEPART(YEAR,@WORKDT) - 15)`（SP 數值比較）

---

### TS-F091-SDv2-007：年以上規則 — year_produ 非數值防禦（parseInt 邊界）

- **關聯需求**：F091 v2.0 AC-6（v2.0 補 `parseInt` 防禦，AD-E07-26 DP-AD26-2）
- **測試類型**：Negative / Unit（防禦性邊界）
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '3年以上機車名單'`（含「年以上」）
  - `workdt = new Date('2026-06-01')`；`cutoffYear = 2011`
  - pool 含 3 筆：
    - `{ year_produ: '' }`（空字串；`parseInt('', 10)` = NaN → **不排除**，防止 NaN 判斷錯誤）
    - `{ year_produ: 'N/A' }`（非數值；`parseInt('N/A', 10)` = NaN → **不排除**）
    - `{ year_produ: '200' }`（3 位數，但 parseInt('200')=200 < 2011 → **排除**）
- **步驟**：
  1. 呼叫 `applyListNmSpecialDeletes(pool, list, workdt)`
  2. 驗證 NaN 不被錯誤排除（`NaN < 2011` 在 JS 為 false）
- **預期結果**：
  - `year_produ=''` 保留（NaN < 2011 = false）
  - `year_produ='N/A'` 保留（NaN < 2011 = false）
  - `year_produ='200'` 排除（200 < 2011 = true）
  - **不 throw**（防禦性通過）

---

### TS-F091-SDv2-008：含「期中機車」名單 — 雙重套用（AC-4 + AC-5 依 SP 順序不合併）

- **關聯需求**：F091 v2.0 AC-4 + AC-5；BR-1（忠實複刻 SP 順序）；SP L89 → L97 獨立兩個 IF EXISTS
- **測試類型**：Positive / Unit（順序驗證）
- **測試層**：Unit（純函式，spy 執行順序或依序 mock 回傳值）
- **前置條件**：
  - `list.list_nm = '機車期中小資催收名單'`（**同時含「期中」與「機車」**，AC-4 + AC-5 均觸發）
  - pool 含 3 筆：
    - 案件 A：`{ payt_term: 21, deal_num: '24', appl_no: 'A001', payt_num: 5, spec_name: '一般' }`（AC-4 排除）
    - 案件 B：`{ payt_term: 5, deal_num: '24', appl_no: 'B001', payt_num: 17, spec_name: '小資方案' }`（AC-4 不排 / AC-5 排）
    - 案件 C：`{ payt_term: 5, deal_num: '24', appl_no: 'C001', payt_num: 5, spec_name: '一般' }`（AC-4/5 均不排）
- **步驟**：
  1. 呼叫 `applyListNmSpecialDeletes(pool, list, workdt)`
  2. 驗證 AC-4 先執行、AC-5 後執行（pool 大小在 AC-4 後應為 2 筆，AC-5 後為 1 筆）
- **預期結果**：
  - 案件 A 在 AC-4 階段排除（payt_term=21 >= deal_num-3=21）
  - 案件 B 在 AC-5 階段排除（payt_num=17 > deal_num-8=16 且 spec_name 含「小資」）
  - 案件 C 保留
  - 最終 pool 只剩案件 C（1 筆）
  - 兩條規則獨立套用（**不合併**為一條 OR 條件）
- **SP 對照**：SP L89（期中機車 IF EXISTS）→ L97（期中 IF EXISTS）獨立順序

---

### TS-F091-SDv2-009：非 v2.0 觸發名單不受影響（一般名單 / 含舊關鍵字名單）

- **關聯需求**：F091 v2.0 AC-4~AC-6（「各以 list_nm includes 觸發；非觸發名單不受影響」）；BR-8（**禁止沿用 v1.0 誤判關鍵字**）
- **測試類型**：Negative / Unit（三子場景）
- **測試層**：Unit（純函式）

**子場景 9a：一般名單**
- **前置條件**：`list.list_nm = '一般催收名單'`（不含任何 v2.0 觸發字）
- pool 含 5 筆，其中有 `payt_term >= deal_num-3`、T 開頭 `appl_no`、`payt_num > deal_num-8 AND spec_name含'小資'`、`year_produ`距今 > 15 年的案件
- **預期結果**：pool 僅詐騙白牌被排除（若存在），其餘規則不觸發

**子場景 9b：含「中結」/ 「年資」等 v1.0 誤判關鍵字名單（Regression guard）**
- **前置條件**：`list.list_nm = '中結強案年資催收名單'`（含 v1.0 誤判觸發字，但**不含** v2.0 正確觸發字「期中」/「機車」/「年以上」）
- pool 含符合各規則排除條件的案件（若 v2.0 實作正確，這些案件**不應被排除**）
- **預期結果**：
  - `R-PERIOD-MOTORCYCLE` / `R-PERIOD-XIAOZI` / `R-YEAR-ABOVE` **均不觸發**
  - 僅 `R-FRAUD-WHITEBOARD`（無條件）可能排除詐騙白牌案件
  - 其餘案件保留（舊 v1.0 誤判行為不再發生）

**子場景 9c：含「年資」但不含「年以上」名單**
- **前置條件**：`list.list_nm = '年資管理名單'`（v1.0 誤判觸發 `R-YEAR-ABOVE`；v2.0 不觸發）
- pool 含 `year_produ = '2005'`（距今 > 15 年，若 `R-YEAR-ABOVE` 觸發則被排除）
- **預期結果**：`year_produ='2005'` **保留**（`R-YEAR-ABOVE` 不觸發，因 list_nm 不含「年以上」）

---

## 四、Stage1FilterChain 封裝（v2.0 執行順序更新）

> TS-F091-CH-001~005 整體邏輯不變，但執行順序說明與 mock 字串需更新為 v2.0 正確關鍵字。

---

### TS-F091-CH-001v2：執行順序對照 SP v2.0（期中機車 → 期中 → 年以上）

- **關聯需求**：F091 v2.0 AC-8；AD-E07-22 §22.4（執行順序）；SP L66 → L73 → L89 → L97 → L105 順序
- **測試類型**：Positive / Unit
- **測試層**：Unit（spy 執行順序）
- **前置條件**：
  - `list.list_nm = '機車期中小資5年以上催收名單'`（**v2.0 正確**：含「機車」+「期中」+「年以上」，全部規則觸發）
  - ⚠️ **v1.0 差異**：v1.0 用「中結強案年資名單」；v2.0 須改為此正確觸發字名單
- **步驟**：
  1. 呼叫 `executeStage1Chain(list, workdt, poolRepo, poolDataListRepo, { dryRun: false })`
  2. 記錄各步驟呼叫時間順序
- **預期結果**：
  - 執行順序：① `buildStage1WhereConditions`（欄位篩選 DB query）→ ② `buildMonthCntFragment`（month_cnt）→ ③ `R-FRAUD-WHITEBOARD` filter（詐騙白牌，L67）→ ④ `computeDedupWindow` + 去重 DB query + filter（L73）→ ⑤ `R-PERIOD-MOTORCYCLE` filter（機車期中，L89）→ ⑥ `R-PERIOD-XIAOZI` filter（期中小資，L97）→ ⑦ `R-YEAR-ABOVE` filter（年以上，L105）
  - 詐騙白牌在去重**之前**執行（對齊 SP L67 在 L73 之前）

---

> **v1.0 TS-F091-CH-002~005 維持**（EMPTY_CONDITIONS skip / 月跑模式 / dry-run 一致性 / MONTH_CNT skip 不阻擋），mock `list_nm` 字串若含 v1.0 誤判觸發字需更新為 v2.0 正確字串。

---

## 五、v1.0 特例 DELETE 場景廢棄聲明

以下 v1.0 場景已廢棄，**不應實作或執行**（觸發關鍵字為 mojibake 誤判）：

| 廢棄場景 | 廢棄原因 | v2.0 替代 |
|---|---|---|
| TS-F091-SD-002（「中結強案」觸發）| 觸發字「中結強案」為 mojibake | TS-F091-SDv2-002~003 |
| TS-F091-SD-003（「中結強案」邊界）| 同上 | TS-F091-SDv2-003 |
| TS-F091-SD-004（「中結」+「滿」規則）| 觸發字「中結」/排除條件「滿」均為 mojibake | TS-F091-SDv2-004~005 |
| TS-F091-SD-005（「年資」字串比較）| 觸發字「年資」為 mojibake；字串比較已改 parseInt | TS-F091-SDv2-006~007 |
| TS-F091-SD-006（「中結強案」+ 雙重套用）| 同上 | TS-F091-SDv2-008 |

TS-F091-SD-001（詐騙白牌）、TS-F091-SD-007（非觸發名單）、TS-F091-SD-008（deal_num 型別轉換）：**維持**，由 TS-F091-SDv2-001 / SDv2-009 / SDv2-002 覆蓋（deal_num 型別驗證邏輯不變，見 SDv2-002）。

---

## 六、Regression 防回退（v2.0 最關鍵群組）

> **設計依據**：F091 v2.0 BR-8；AD-E07-26 §26.2；DP-AD26-1

---

### TS-F091-RGv2-001：Grep guard — 原始碼不含 v1.0 誤判關鍵字（「中結」/「強案」/「年資」/「滿」作為觸發字）

- **關聯需求**：F091 v2.0 BR-8（「**禁止沿用 v1.0 誤判關鍵字**」）；AD-E07-26 DP-AD26-1
- **測試類型**：Regression / Unit（靜態 grep）
- **測試層**：Unit（原始碼靜態分析）
- **前置條件**：`stage1-filter-chain.ts`（`applyListNmSpecialDeletes` / `matchesSpecialRule`）已依 v2.0 修正
- **步驟**：
  1. 在 `stage1-filter-chain.ts` 中 grep `'中結'`、`'強案'`、`'年資'`、`'滿'` 這四個字串作為 `includes()` 或 `LIKE` 的觸發判斷依據
  2. 確認**不存在** `listNm.includes('中結')`、`listNm.includes('強案')`、`listNm.includes('年資')` 或等效模式
  3. 確認**不存在** `spec_name.includes('滿')` 或等效排除條件（`'滿'` 仍可出現於非觸發上下文，故 grep 需限定 trigger 判斷段落）
- **預期結果**：
  - 上述四個 v1.0 誤判字串**不作為 trigger 或排除條件**出現於特例 DELETE 邏輯
  - grep 結果若命中，必須是有意義的業務字串（如 log message），非 trigger 判斷
- **DB 需求**：無（靜態分析）

---

### TS-F091-RGv2-002：行為 guard — 含「中結」名單不被誤套機車期中 / 期中小資規則

- **關聯需求**：F091 v2.0 BR-8；TS-F091-SDv2-009b（行為驗證）
- **測試類型**：Regression / Unit
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '中結強案催收名單'`（v1.0 誤判觸發，v2.0 應不觸發 AC-4/AC-5）
  - pool 含 2 筆：
    - `{ payt_term: 21, deal_num: '24', spec_name: '小資方案', payt_num: 17 }`（若 AC-4/5 誤觸發則被排除）
    - `{ list_type: '01', spec_name: '詐騙白牌方案' }`（AC-3 無條件排除）
- **步驟**：
  1. 呼叫 `applyListNmSpecialDeletes(pool, list, workdt)`
  2. 驗證第 1 筆是否保留
- **預期結果**：
  - 第 1 筆（`payt_term=21`，符合 AC-4 排除條件）**保留**（AC-4 未觸發，因 list_nm 不含「期中」+「機車」）
  - 第 2 筆（詐騙白牌）排除（AC-3 無條件）
  - 結果 pool = 1 筆（第 1 筆保留）

---

### TS-F091-RGv2-003：行為 guard — 含「期中」名單正確套用期中小資規則（v2.0 觸發確認）

- **關聯需求**：F091 v2.0 AC-5；v2.0 修正後「期中」名單確認正確觸發
- **測試類型**：Positive / Regression（驗證 v2.0 修正後正常觸發）
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '期中分期催收名單'`（含「期中」，v2.0 觸發 AC-5）
  - pool 含 2 筆：
    - `{ payt_num: 20, deal_num: '24', spec_name: '小資優惠方案' }`（20 > 24-8=16 且 spec_name 含「小資」→ **排除**）
    - `{ payt_num: 10, deal_num: '24', spec_name: '一般方案' }`（不含「小資」→ **保留**）
- **步驟**：
  1. 呼叫 `applyListNmSpecialDeletes`
  2. 確認 AC-5 觸發並排除第 1 筆
- **預期結果**：
  - 第 1 筆排除（v2.0 期中 + 小資 排除正確觸發）
  - 第 2 筆保留

---

### TS-F091-RGv2-004：行為 guard — 含「信貸滿期」spec_name 不再因 v1.0 誤規則排除

- **關聯需求**：F091 v2.0 AC-5（v1.0 排除條件 `%滿%` 已改為 `%小資%`）；AD-E07-26 §26.2
- **測試類型**：Regression / Unit（v1.0 舊排除行為不再出現）
- **測試層**：Unit（純函式）
- **前置條件**：
  - `list.list_nm = '期中車貸催收名單'`（含「期中」，觸發 AC-5）
  - pool 含 1 筆：`{ payt_num: 20, deal_num: '24', spec_name: '信貸滿期方案' }`（含「滿」但**不含**「小資」）
- **步驟**：
  1. 呼叫 `applyListNmSpecialDeletes`
  2. 驗證該案件是否被排除
- **預期結果**：
  - 該案件**保留**（v2.0 排除條件 `spec_name.includes('小資')`，「信貸滿期方案」不含「小資」，不符合）
  - **v1.0 行為（`includes('滿')` → 排除）不再出現**（Regression guard）

---

### TS-F091-RGv2-005：Grep guard — `stage1-filter-chain.ts` 含 v2.0 正確觸發字

- **關聯需求**：F091 v2.0 BR-8（v2.0 正確關鍵字確認存在）
- **測試類型**：Regression / Unit（靜態 grep）
- **測試層**：Unit（原始碼靜態分析）
- **前置條件**：`stage1-filter-chain.ts` 已依 v2.0 修正
- **步驟**：
  1. 在 `stage1-filter-chain.ts` 中 grep `'期中'`、`'機車'`、`'年以上'`、`'小資'`、`'白牌'` 作為 trigger 或排除條件字串
  2. 確認這 5 個字串**確實出現**於 `applyListNmSpecialDeletes` / `matchesSpecialRule` 邏輯中
- **預期結果**：
  - 5 個 v2.0 正確字串均存在於特例 DELETE 觸發 / 排除邏輯
  - 不存在任何 v1.0 誤判字串（見 TS-F091-RGv2-001）
- **DB 需求**：無

---

## 七、v1.0 Regression 驗證（更新說明）

### TS-F091-RG-001：既有 buildStage1WhereConditions 欄位篩選行為不破壞（v1.0 維持）

> 不受 v2.0 影響，定義與 v1.0 完全相同。

---

### TS-F091-RG-002：既有 Stage 1 pipeline Integration test 案件數變更標注（v2.0 更新）

- **關聯需求**：F091 v2.0 §13（⚠️ production 行為變更；觸發條件修正後案件數二次調整）
- **測試類型**：Regression（人工比對 + 標注）
- **測試層**：Integration（標注）
- **步驟**：
  1. 確認既有 `assignment-run-pipeline.service.spec.ts` 中 Stage 1 案件數之 baseline 斷言
  2. v2.0 注意：觸發條件修正後，過去被誤排除的案件（含「中結」「年資」名單）將**回流**，案件數可能**增加**；而正確觸發「期中機車」「期中」「年以上」名單之案件數可能**減少**（新正確排除）
  3. 以 `// F091 v2.0: SP bug fix — updated baseline: old misidentified trigger replaced by correct trigger` 標注更新後預期值
- **預期結果**：
  - 受影響的 baseline 斷言已識別並更新（反映 v2.0 正確觸發後的真實案件數）
  - 更新後斷言以 SP ground truth 為準

---

### TS-F091-RG-003：Stage0EstimateService 舊版 estimateListCount 基準升級通知（v1.0 維持）

> 不受 v2.0 影響，定義與 v1.0 完全相同。

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F091-MC-001~006（MONTH_CNT 純函式） | 高 | 純函式，無 DB；與 v2.0 無關 |
| TS-F091-DDv2-001a~001c（去重上界動態計算） | 高 | mock `poolDataListRepo`；無真實 DB |
| TS-F091-DD-002~005（去重 filter / 聯集） | 高（DD-005 需 PG TC）| 維持 v1.0 就緒度 |
| TS-F091-SDv2-001~009（特例 DELETE v2.0）| 高 | 純函式 `applyListNmSpecialDeletes`；v2.0 正確中文 mock 必須為繁體中文（期中 / 機車 / 年以上 / 小資 / 白牌）|
| TS-F091-CH-001v2 + CH-002~005（執行順序 + skip）| 高（PG TC：CH-003/004）| CH-001 mock 字串更新為 v2.0；餘維持 |
| TS-F091-RGv2-001~005（v2.0 Regression 防回退）| 高 | RGv2-001/005 為靜態 grep；RGv2-002~004 為純函式行為驗證 |
| TS-F091-RG-001~003（v1.0 Regression 標注）| 高（標注型）| RG-002 更新說明；餘維持 |
