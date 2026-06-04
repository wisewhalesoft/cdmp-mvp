---
type: test-design-feature
feature_id: F100
feature_name: Stage 2~4 SQL 下推 + v2 真實計分引擎（ob_levelcard_* 權重 / customer_core join / CR EXISTS / st4_exchange）
priority: P0-MVP
related_spec: /docs/specs/features/F100-stage2-4-sql-pushdown-scoring.md
spec_version: "1.0"
covers:
  - F100
source_ad: /docs/specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md
last_updated: 2026-06-02
---

# F100：Stage 2~4 SQL 下推 + v2 真實計分引擎（AD-E07-28 P3）— 測試設計

> ⚠️ **範圍限定 P3（F100）**。P1（F098 worker 抽離）與 P2（F099 Stage 1 下推）**已完成提交、不在本文件範圍**。本文件不寫 production / 最終測試實作碼，僅產出測試策略與案例清單，由 tdd-implementation 承接。
>
> **核心驗收哲學（與 P1/P2 的本質差異）**：P1/P2 是「**改機制、結果可證等價**」——golden oracle = 跑現行 JS。**P3 不是純等價變更**——它把計分引擎**從 v1 簡化版升級為 v2 真實版**：現行 `computeScore` 僅實作可從 `ob_pool_data` 直接取的欄位（`LIST_MONTH`/`PROJECT_TP`/`CAR_YEAR`/`COMMISSION`），其餘客戶屬性欄位（`CUS_SEX`/`CAREA`/`AGE` 等）之 `resolveColumnValue` default 分支**回傳空字串 `''` → 永不匹配 → 不計分**（標「v2.1 補完」尚未實作）。P3 以 `LEFT JOIN customer_core` 補完這些欄位的計分。
>
> 因此 **golden oracle 不是「跑現行 JS v1 簡化版」**，而是「**依計分卡規則（`ob_levelcard_score` 區間/類別權重）+ `customer_core` 屬性，以確定性 seed 手算之預期 score/card_level/tier_level**」（見 §一手算預期矩陣）。
>
> **唯一硬性 Definition of Done（AC-8）** = SQL 版逐列輸出（score / card_level / tier_level / is_cr / dept_id / emplid / emplid_deptid）== **升級後手算預期值**（PG 真庫、逐列 PK 比對）。**升級造成的合理差異**（v1 未算 customer_core → v2 補上）**與下推 bug 造成的差異必須區分**：等價斷言的基準是「升級後預期值」，**不是** JS 簡化版舊值。
>
> **已拍板決策（測試據此驗收，無待裁 OQ）**：
> - **OQ-F100-01 / OQ-AD28-06 = 對齊現行 JS 簡化版**（使用者 2026-06-02）：st4_exchange 維持 `PARTITION BY list_no`（全名單一池）+ 單一 senior 接收（`seniorEmpls[0]`）+ deterministic `ORDER BY orgno, appl_no`。legacy SP 之 `PARTITION BY OB_DEPT, OB_EMPLID` 主管↔專員等量配對交換、寄信告警、整批回滾等副作用**明確 out-of-scope，不復刻、不測**。
> - **OQ-06 排序鍵**：SP ground truth 為 `NEWID()`（隨機）→ 下推採 deterministic `ROW_NUMBER() OVER (PARTITION BY list_no ORDER BY orgno, appl_no)`（業務等價於隨機、且可做 deterministic 逐列等價測試）。
> - **CI 必起 Postgres**：等價測試、`SUM(CASE…)` 計分、`LEFT JOIN customer_core`、`EXISTS` CR、視窗函式 st4_exchange 一律對真 Postgres 跑，沿用 `docker-compose.test.yml` postgres-test 容器（F038/F075/M01/F098/F099 慣例）。better-sqlite3 不具代表性（視窗函式 / `SUM(CASE…)` 行為差異）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F100 spec](../../specs/features/F100-stage2-4-sql-pushdown-scoring.md)（§4 AC-1~AC-8 / §5 OQ-06 / §10）+ [AD-E07-28 §5 P3 / §6](../../specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)（**權威**）+ `assignment-run-pipeline.service.ts`（`executeV2` L420~、`computeScore` L560~、`resolveColumnValue` L603~、`collectCrCandidates` L628~、st4_exchange L488~542）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（**UTF-16LE，st4_exchange ground truth**）+ 計分 entity（`ob-levelcard-{column,score,level,version}.entity.ts` / `ob-tier.entity.ts` / `ob-dept-pct.entity.ts` / `ob-empl-set.entity.ts`）+ `customer_core`（data-model.md / F036）+ `ob-monthly-run-result.entity.ts`（寫入目標）+ 既有 `assignment-run-pipeline-v2.service.spec.ts`（JS 簡化版基準，TC-V2-STAGE2/3/4）|
| QA / Tester | 本文件（特別 §一手算預期矩陣 + §二 SCORE 計分 + §五 EXCH st4_exchange 邊界 + §六 EQ 升級差異 vs 下推 bug 區分）|
| Architect | 本文件 §十一風險與待決 + [AD-E07-28 §10](../../specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)|
| CI/CD Owner | 本文件「自動化就緒度」+「需 Postgres 案例彙整」|
| Product Analyst / 業務 | §七 UPGR — F067 計分升級差異驗收 gate（上線硬性前置，§9 / NFR-005）|

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| **驗收紅線** | **EQ 群組（SQL 版逐列輸出 == 升級後手算預期，PG 真庫逐列 PK `toEqual`）= P3 Definition of Done（AC-8）**。未全綠 → 阻擋 SQL 版上線。**外加 UPGR（F067 計分升級差異報告 + 業務驗收）為上線硬性前置（§9 / NFR-005）**。 |
| 主要測試層 | ① **PG Integration（強制 Postgres）**：EQ 升級後逐列等價、SCORE `SUM(CASE…)` 區間/類別計分、CJOIN `LEFT JOIN customer_core`、LEVTIER score→level→tier、CR `EXISTS`、EXCH st4_exchange 視窗函式；② **Unit（純函式 / 靜態）**：I-NOLOAD-01 靜態 guard（Stage 2~4 不 read-back heap）、I-RUN-EST-01 延續、SQL 注入防禦、`tsc` gate |
| **等價基準（Oracle）** | **手算預期值（非跑 JS v1）**。以確定性 seed 之計分卡設定（`ob_levelcard_score` 區間/類別權重）+ `customer_core` 屬性，依規則手算 score/card_level/tier_level/is_cr/emplid（見 §一矩陣）。**禁止以「跑現行 JS v1 簡化版」當 oracle**（v1 不算 customer_core，會把「應升級補上的分」當 0，反而把下推正確值判為 fail）。**亦禁止「SQL 自我斷言預期值」**（SQL 與手算同錯則假綠 → 手算須在文件中寫死數字、由人複核）。 |
| 升級差異 vs 下推 bug 區分 | （a）**升級造成的合理差異**：僅出現在「有 customer_core 計分欄位」之案件（v1 該欄計 0、v2 補上權重）→ 由 §一矩陣對「有/無 customer_core 欄位」分別寫死預期，差異可解釋。（b）**下推 bug 造成的差異**：出現在「無 customer_core 欄位」之案件（純 `ob_pool_data` 欄位，v1 與 v2 應完全相同）→ 此類案件 SQL 必須與 v1 JS 逐列相等（**此子集可同時對 JS v1 比對**，作為「下推未引入 regression」的旁證）。**EQ 矩陣明確標注每案屬 (a) 或 (b)**。 |
| Mock / Seed 注意 | seed 須模擬真實 contract（記憶 feedback_mock_real_system_contract）：① 計分卡 active 版本（`ob_levelcard_version.status='active'` + 對應 `ob_levelcard_column.status='active'`）；② `ob_levelcard_score` 區間型（`level2_s`/`level2_e` 為 `varchar`，trim 後數值比較）vs 類別型（`level1` 為 `varchar`，trim 後字串相等）；③ `customer_core` 屬性格式對齊 data-model.md（F036 85 欄位）；④ 員工 tier 標記 `ob_empl_set.prod_type='TIER:T1'|'TIER:T2'|'TIER:T3'`（slice(5) 取 `T*`）；⑤ `ob_tier` card_level NULL fallback 列（`card_level IS NULL`）。 |
| 型別 gate | 實作後必須跑 `tsc --noEmit -p tsconfig.build.json`（vitest 不檢型別；US-144 登入 500 教訓 / 記憶 feedback_vitest_no_typecheck）。 |
| SP 解碼 | `SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql` 為 **UTF-16LE**，須 `node ... toString('utf16le')` 解碼再讀（記憶 feedback_sp_utf16le_decode）；**中文版 `Stage4_*.sql` 解碼為 mojibake，不採信**（僅用成功解碼之英文主檔，spec §5 已據此推導 OQ-06）。 |

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | 說明 |
|---|---|---|---|---|---|
| EQ（SQL 版逐列 == 升級後手算預期）| 8 | PG Integration | **是** | 高 | **P3 DoD（AC-8）**；逐列 PK `toEqual`；代表性名單矩陣見 §六；每案標 (a) 升級差異 / (b) 下推等價 |
| SCORE（Stage 2 `SUM(CASE…)` 區間/類別計分，AC-1）| 7 | PG Integration | **是** | 高 | 區間命中 / 區間邊界 / 類別 trim 相等 / 多維度累加 / disabled column 不計 / 無 active version / score=0 |
| CJOIN（`LEFT JOIN customer_core` 補計分，AC-1）| 4 | PG Integration | **是** | 高 | 有 match（屬性命中取分）/ 無 match（NULL 屬性不取分）/ 純 ob_pool_data 欄位不受影響 / 混合維度 |
| LEVTIER（score→card_level→tier_level，AC-2/AC-3）| 5 | PG Integration | **是** | 高 | level 區間命中 / score 落空（無 level → card_level NULL）/ tier card_level NULL fallback / score NULL 不查 level / 邊界 score=score_e |
| CR（Stage 3 `EXISTS` 動態回分，AC-4）| 5 | PG Integration | **是** | 高 | cr_enabled 開+歷史命中→Y / 開+未命中→N / 關→一律 N / 已成交不算未成交 / 與 JS `collectCrCandidates` 等價 |
| EXCH（Stage 4 st4_exchange 視窗函式，AC-5/AC-6）| 8 | PG Integration | **是** | 高 | 有/無 T3 / 保底 1 / 10% 取整邊界（CEIL vs SP ROUND 差異）/ deterministic 選案可精確比對 / 交換對象單一 senior / 其餘 default / partition by list_no |
| RUNEST（I-RUN-EST-01 estimate 不含計分 join，AC-7/A-4）| 2 | Unit + PG Integration | 部分 | 高 | estimate 路徑僅跑 Stage 1 COUNT，不含 Stage 2~4 join；P3 合併不破壞 estimate≡run |
| NOLOAD（I-NOLOAD-01 Stage 2~4 不 read-back heap）| 3 | Unit（靜態）+ PG | 部分 | 高 | 下推路徑無「Stage 1 寫表後讀回 heap 計分」；無 `scoredPool = pool.map(...)` 全物化 |
| IDEM（冪等 / transaction 邊界，AC-7）| 3 | PG Integration | **是** | 中 | 同 run_id 重跑列集合一致 / 可中斷邊界 list↔list / **transaction 範圍未定 → open question（見 §十一 OQ-F100-T1）** |
| UPGR（F067 計分升級差異報告 + 業務驗收 gate，§9）| 4 | PG Integration + 人工 | **是** | 中（報告自動、驗收人工）| 差異報告產生 / score 分佈 / 等級分佈 / 分派變化；業務知會驗收為上線硬性前置 |
| RG（回歸基準 + 型別 gate）| 3 | Unit | 否 | 高 | v1/v2 flag 不破壞 / `tsc` gate / 既有 v2 spec 升級為手算 oracle |
| **合計** | **52** | — | **40 案例需 Postgres** | — | EQ 8 + SCORE 7 + CJOIN 4 + LEVTIER 5 + CR 5 + EXCH 8 + UPGR 3（自動部分）= 40 強制需 PG（IDEM 3 + RUNEST/NOLOAD 之 PG 子案另計，見彙整） |

---

## 一、Golden Oracle 建立法：手算預期矩陣（P3 核心）

> **為何手算而非跑 JS**：P3 把計分由 v1 簡化版升級為 v2 真實版。v1 對 customer_core 欄位回 `''` → 不計分；v2 補上。若以「跑 v1 JS」當 oracle，凡有 customer_core 計分欄位之案件，v1 oracle 會少算該欄權重 → SQL 正確補上反被判 fail。**正解：用確定性 seed 把計分卡規則寫死，依規則手算每筆案件的預期 score/level/tier，寫死於本文件，由人複核後當 oracle。**

### 計分規則（測試 seed 固定設定，所有 EQ/SCORE 案例共用此卡）

**card_type = `T1`，active version = 1。** active columns 與 score 設定：

| column_name | 型別 | 來源 | 規則（score row）|
|---|---|---|---|
| `LIST_MONTH` | 區間型 | `ob_pool_data.month_cnt` | `[0,5]`→10 分；`[6,12]`→30 分 |
| `PROJECT_TP` | 類別型 | `ob_pool_data.spec_tp`（缺值 fallback `'01'`）| `'01'`→5 分；`'02'`→15 分 |
| `CUS_SEX` | 類別型 | **`customer_core.cus_sex`（LEFT JOIN，P3 新增）** | `'M'`→20 分；`'F'`→8 分 |
| `AGE` | 區間型 | **`customer_core.age`（LEFT JOIN，P3 新增）** | `[0,39]`→0 分；`[40,100]`→12 分 |

> ⚠️ **`CUS_SEX`/`AGE` 之精確 `customer_core` 欄位映射由 tdd 對齊 architecture-spec.md §3.10 計分欄位對照表（A-1）。** 上表欄位名與分數為**測試 seed 之確定性設定**（非生產真值），目的是讓預期可手算；tdd 只要保證「凡 `resolveColumnValue` default 分支標 customer_core 之欄位，P3 以 LEFT JOIN 補齊計分」。若實際對照表欄位名不同，tdd 同步調整 seed 與本矩陣的欄位名，**分數與預期數字邏輯不變**。

**card_level 門檻（`ob_levelcard_level`，card_type=T1 v1）：** `[0,20]`→`C`；`[21,40]`→`B`；`[41,100]`→`A`。
**tier 對應（`ob_tier`，card_type=T1）：** `C`→`T3`；`B`→`T2`；`A`→`T1`；**`card_level IS NULL`（fallback 列）→`T3`**。

### 手算預期矩陣（每筆案件 = 一列；oracle 寫死數字）

| 案件 | month_cnt | spec_tp | customer_core | 手算 score | card_level | tier_level | 屬 (a) 升級差異 / (b) 下推等價 |
|---|---|---|---|---|---|---|---|
| **P-01** | 2 | （缺，fallback `'01'`）| **無 match（LEFT JOIN 缺）** | 10（LIST_MONTH）+5（PROJECT_TP '01'）+0（CUS_SEX NULL 不匹配）+0（AGE NULL 不匹配）= **15** | C | **T3** | (b) 純 ob_pool_data + customer_core NULL → v1=15、v2=15，**相同**；守下推等價 |
| **P-02** | 10 | `'02'` | 無 match | 30+15+0+0 = **45** | A | **T1** | (b) v1=45、v2=45 相同；守下推等價 |
| **P-03** | 2 | `'01'` | match：cus_sex=`'M'`, age=`30` | 10+5+**20**+0 = **35** | B | **T2** | **(a) 升級差異**：v1=15（不算 CUS_SEX）、v2=35（補 +20）→ 差異可解釋（F067 知會）|
| **P-04** | 10 | `'02'` | match：cus_sex=`'F'`, age=`55` | 30+15+**8**+**12** = **65** | A | **T1** | **(a) 升級差異**：v1=45、v2=65（補 +8 +12）|
| **P-05** | 2 | `'01'` | match：cus_sex=`' M '`（**含前後空白**）, age=`40`（**區間下界**）| 10+5+**20**（trim 後 'M'）+**12**（40∈[40,100]）= **47** | A | **T1** | **(a)** + **trim 邊界**：CUS_SEX 含空白須 trim 後相等；AGE=40 命中 [40,100] 下界 |
| **P-06** | 2 | `'01'` | match：cus_sex=`'X'`（**無對應 score row**）, age=`39`（**區間上界 [0,39]**）| 10+5+**0**（'X' 不匹配任何 level1）+**0**（39∈[0,39]→0 分）= **15** | C | T3 | **(a)** 部分：CUS_SEX 'X' 無 match 不取分（驗證「類別無對應 → 0」）；AGE=39 命中 0 分區間 |

> **複核要點（人工）**：P-01/P-02 為 **(b) 下推等價**——customer_core LEFT JOIN 無 match 時，屬性欄位以 NULL 參與、不匹配任何 score row（與 v1 default `''` 不匹配行為一致），故 v1≡v2，可同時對 JS v1 比對守 regression。P-03~P-06 為 **(a) 升級差異**——僅這些「有 customer_core match」之案件 v2 > v1，差異須 F067 知會（§七 UPGR）。

---

## 二、SCORE — Stage 2 `SUM(CASE…)` 區間/類別計分（AC-1，PG 真庫）

> **設計依據**：F100 AC-1；AD-E07-28 §5 P3。**oracle = §一手算矩陣**（非跑 JS）。

| 案例 | Given（seed）| When | Then（手算預期）| 需 PG |
|---|---|---|---|---|
| **TS-F100-SCORE-001** | card T1 v1 active，`LIST_MONTH` 區間 `[0,5]`→10/`[6,12]`→30 | 案件 month_cnt=2 / =10 | score 含 10 / 30（區間命中）| 是 |
| **TS-F100-SCORE-002** | 同上 | month_cnt=5（**上界**）/ =6（**跨界**）/ =13（**界外無 match**）| 5→10（命中 [0,5] 上界）；6→30（命中 [6,12] 下界）；13→0（無區間匹配）| 是 |
| **TS-F100-SCORE-003** | `PROJECT_TP` 類別型 `'01'`→5 ；案件 spec_tp=`'01'` / =`' 01 '`（**含空白**）/ =`'99'`（無對應）| 計分 | 5（相等）；5（trim 後相等）；0（無對應 level1）| 是 |
| **TS-F100-SCORE-004** | 多維度（LIST_MONTH + PROJECT_TP）| month_cnt=2 + spec_tp='01' | `SUM(CASE…)` 累加 = 10+5 = **15**（驗證多 CASE 累加正確，非取單一最大）| 是 |
| **TS-F100-SCORE-005** | `PROJECT_TP` column `status='disabled'`（非 active）| 計分 | disabled 維度不參與 `JOIN ob_levelcard_column WHERE status='active'`（對齊既有 v2 spec「disabled 維度不計分」）；只計 active 維度 | 是 |
| **TS-F100-SCORE-006** | card_type 無 active version（不 seed version）| 計分 | score = **NULL**（不查 column；對齊 AC-3 / JS L466~468）；案件仍寫入 | 是 |
| **TS-F100-SCORE-007** | active version 但案件所有維度皆不命中任何 score row | 計分 | score = **0**（與 score NULL 區分：有 active 但無命中 → 0；無 active → NULL，AC-3）| 是 |

> **關鍵設計**：SCORE-006（NULL）vs SCORE-007（0）必須分為獨立案例——「無 active version → score NULL」與「有 active 但 0 命中 → score 0」是不同邊界，下推 SQL 之 `CASE WHEN no active THEN NULL ELSE SUM(...) END` 易誤把 0 寫成 NULL 或反之。

---

## 三、CJOIN — `LEFT JOIN customer_core` 補計分（AC-1，PG 真庫）

> **設計依據**：F100 AC-1（customer_core 補完）；§8 錯誤情境「LEFT JOIN 無 match → NULL 參與計分」。**這是 P3「升級」的核心，oracle = §一矩陣 P-03~P-06。**

| 案例 | Given | Then（手算預期）| 屬 | 需 PG |
|---|---|---|---|---|
| **TS-F100-CJOIN-001** | `CUS_SEX` 類別型 `'M'`→20；案件對應 customer_core.cus_sex=`'M'` | score 含 +20（屬性命中取分）= P-03 邏輯 | (a) | 是 |
| **TS-F100-CJOIN-002** | 案件之 custo_no 在 customer_core **無對應列**（LEFT JOIN NULL）| CUS_SEX 以 NULL 參與 → 不匹配任何 level1 → +0（與 v1 default `''` 不匹配一致）= P-01 邏輯 | (b) | 是 |
| **TS-F100-CJOIN-003** | 純 `ob_pool_data` 欄位卡（無 customer_core 維度）+ 案件有/無 customer_core 列 | score 完全不受 customer_core 有無影響（LEFT JOIN 不誤增/減分）；v1≡v2 逐列相等 | (b) | 是 |
| **TS-F100-CJOIN-004** | 混合維度（LIST_MONTH + CUS_SEX + AGE）+ customer_core match cus_sex='F' age=55 | score = 30+15+8+12（P-04）；驗證 ob_pool_data 欄位與 customer_core 欄位在同一 `SUM(CASE…)` 正確並存 | (a) | 是 |

> **RISK 連動**：CJOIN-002（LEFT JOIN 無 match）是「**升級不引入退化**」的關鍵守門——若 SQL 誤用 `INNER JOIN customer_core`，無對應客戶之案件會整列消失（漏案）；必須 LEFT JOIN 且 NULL 屬性不取分（見 §十一 RISK-F100-002）。

---

## 四、LEVTIER — score→card_level→tier_level LEFT JOIN（AC-2 / AC-3，PG 真庫）

> **設計依據**：F100 AC-2 / AC-3；JS L469~484 等價語意。oracle = §一矩陣 card_level / tier_level 欄。

| 案例 | Given | Then | 需 PG |
|---|---|---|---|
| **TS-F100-LEVTIER-001** | level `[0,20]`→C/`[21,40]`→B/`[41,100]`→A；score=15 / 45 | `score BETWEEN score_s AND score_e` → C / A | 是 |
| **TS-F100-LEVTIER-002** | score=20（**區間上界**）/ =21（**跨界**）/ =41（**A 下界**）| 20→C；21→B；41→A（BETWEEN 含端點）| 是 |
| **TS-F100-LEVTIER-003** | score=200（**所有 level 區間外**）| `LEFT JOIN ob_levelcard_level` 無 match → card_level = **NULL**；接 `ob_tier` `card_level IS NULL` fallback 列 → tier_level = **T3**（AC-2「card_level NULL fallback」與 JS L481~483 等價）| 是 |
| **TS-F100-LEVTIER-004** | score = NULL（SCORE-006 無 active version）| **不查 level**（AC-3「score NULL → 不查 level」）→ card_level NULL、tier_level NULL（**注意：此處 tier 亦 NULL，與 LEVTIER-003 之「score 有值但 level 落空 → 走 NULL fallback tier=T3」不同**）| 是 |
| **TS-F100-LEVTIER-005** | card_type 在 `ob_tier` 無 `card_level IS NULL` fallback 列；score=200 → card_level NULL | tier_level = NULL（無 fallback 列時不強塞 T3）| 是 |

> **關鍵設計**：LEVTIER-003 vs LEVTIER-004 是 P3 最易錯的 NULL 語意分歧——
> - **score 有值但落在所有 level 區間外**（如 200）：card_level=NULL，但**仍查 ob_tier 的 `card_level IS NULL` fallback** → tier=T3（JS `cardLevel === null ? allTiers.find(card_level === null)` L481~483）。
> - **score=NULL（無 active version）**：根本不查 level，card_level=NULL，tier 也應 NULL（不走 fallback）。
> SQL 下推若把這兩種 NULL 混為一談（都走 fallback 或都不走），即為 bug。LEVTIER-004 與 LEVTIER-003 的 tier 預期值不同（NULL vs T3），正是攔截此 bug 的設計。⚠️ **此 NULL 分歧 spec 未逐字明列「score=NULL 時 tier 是否走 fallback」，本案以 JS 現況推導（L469 `score !== null` 才查 level；score NULL → lvl=null → cardLevel=null → 走 `cardLevel===null` fallback **會**命中 T3）。見 §十一 OQ-F100-T2，建議 tdd 與 spec 確認。**

---

## 五、CR — Stage 3 `EXISTS` 動態回分（AC-4，PG 真庫）

> **設計依據**：F100 AC-4；JS `collectCrCandidates` L628~660 + `crApplPerList.has(...)` L518~519。
>
> **⚠️ A-2 提醒（CR 來源表）**：spec A-2 載明 CR 候選來源「短期讀歷史 snapshot（`monthly_run_snapshot` type=result）vs 中長期改查 `ob_monthly_run_result`」之選擇由 tdd 對齊**當時 `collectCrCandidates` 之實際來源**。本測試以「現行 JS `collectCrCandidates` 之等價結果」為 oracle，**不綁定 EXISTS 子查詢對 snapshot 或對 result 表**——只要 SQL `EXISTS` 與 JS 蒐集之 `{orgno}:{appl_no}` 未成交集合等價即通過。若 tdd 切換來源表，調整 seed 的歷史資料落點，預期不變。**「未成交」判定 = `result_status='PENDING'` 或無 status（JS L653：undefined/null/PENDING 皆算未成交）。**

| 案例 | Given | Then | 需 PG |
|---|---|---|---|
| **TS-F100-CR-001** | 名單 `cr_enabled=true`；歷史有同 `(orgno, appl_no)` 未成交（PENDING）案件 | `EXISTS` 命中 → `is_cr='Y'` | 是 |
| **TS-F100-CR-002** | `cr_enabled=true`；歷史**無**該案件，或該案件歷史 status 為「已成交」（非 PENDING/非空）| `EXISTS` 未命中 → `is_cr='N'` | 是 |
| **TS-F100-CR-003** | 名單 `cr_enabled=false`；歷史**有**該案件未成交 | 一律 `is_cr='N'`（不查歷史，AC-4「cr_enabled=false → 不查」）| 是 |
| **TS-F100-CR-004** | `cr_enabled=true`；歷史同案件有「已成交」+ 另案件「未成交」 | 已成交案件不算 CR；未成交案件 is_cr='Y'（驗證「未成交」過濾正確，非「曾出現過即 CR」）| 是 |
| **TS-F100-CR-005** | 與 JS `collectCrCandidates(ym)` 同輸入（歷史 completed run < ym 之 snapshot）| SQL `EXISTS` 標記之 Y/N 集合與 JS `crApplPerList` 逐案件相等 | 是 |

> **關鍵設計**：CR-001 vs CR-003 把「cr_enabled 開/關」分為獨立案例（同一筆歷史資料，僅 cr_enabled 旗標不同 → 結果 Y vs N），精確攔截「cr_enabled=false 仍誤查歷史」之 bug。CR-004 驗證「未成交」語意（PENDING/空算未成交、已成交不算），對齊 JS L653。

---

## 六、EQ — SQL 版逐列 == 升級後手算預期（P3 Definition of Done，AC-8，PG 真庫）

> **設計依據**：F100 AC-8（P3 DoD）；AD-E07-28 §6.2。
>
> **共用測試骨架（給 tdd-implementation）**：對每張代表性名單 `L`，在同一 postgres-test 容器、同一份確定性 seed 上：
> 1. 跑新 SQL 下推（Stage 2~4），讀 `ob_monthly_run_result` 取每筆 PK `(run_id, list_no, orgno, appl_no)` 之 `{ score, card_level, tier_level, is_cr, dept_id, emplid, emplid_deptid }`。
> 2. **逐列斷言 == §一手算預期矩陣寫死之值**（`expect(actual).toEqual(expectedHandComputed)`）——**非跑 v1 JS 取值**。
> 3. 對標記 **(b) 下推等價**之案件（無 customer_core 計分欄位、或 customer_core 無 match），**額外**跑 v1 JS（`ASSIGNMENT_PIPELINE_V2` 簡化版）取值並斷言 SQL == v1 JS（守「下推未引入 regression」旁證）。
> 4. 對標記 **(a) 升級差異**之案件，斷言 SQL == 手算 v2 預期 **且** SQL ≠ v1 JS（證明 customer_core 確實被補上、差異如預期，非 0 變更）。
>
> **覆蓋要求（spec §4 AC-8 明列）**：(a) 每個計分型別（區間 / 類別 / customer_core join）≥1 樣本；(b) score / level / tier NULL 邊界各一；(c) CR 開 / 關各一；(d) st4_exchange 有 / 無 T3、剛好觸發保底 1、10% 取整邊界各一；(e) 逐列精確相等。

| 案例 | 名單 | 覆蓋的計分型別 / 邊界 | 含 (a) 升級 / (b) 等價 案件 |
|---|---|---|---|
| **EQ-001** | 純 ob_pool_data 卡（LIST_MONTH 區間 + PROJECT_TP 類別）| **區間 + 類別計分**（無 customer_core）| 全 (b)：P-01/P-02；SQL 須 == 手算 == v1 JS（三方相等）|
| **EQ-002** | 含 customer_core 卡（+CUS_SEX 類別 +AGE 區間）有 match | **customer_core join 計分**（升級核心）| (a)：P-03/P-04；SQL == 手算 v2 ≠ v1 |
| **EQ-003** | 含 customer_core 卡 + 部分案件 customer_core **無 match** | **LEFT JOIN NULL 邊界** | 混合：有 match 案件 (a)、無 match 案件 (b)（P-01 邏輯）|
| **EQ-004** | trim 邊界卡（CUS_SEX `' M '`、spec_tp `' 01 '`、AGE 區間下界 40）| **trim 相等 + 區間邊界** | (a)：P-05 |
| **EQ-005** | **score / level / tier NULL 邊界**（無 active version 名單 + score 落 level 區間外名單）| score NULL（SCORE-006）/ card_level NULL+tier fallback（LEVTIER-003）/ tier NULL（LEVTIER-004/005）| 邊界混合 |
| **EQ-006** | **CR 開**名單（cr_enabled=true，歷史命中/未命中）| is_cr Y / N | CR-001/002 |
| **EQ-007** | **CR 關**名單（cr_enabled=false，歷史有該案件）| is_cr 一律 N | CR-003 |
| **EQ-008** | **st4_exchange** 名單（有 T3 + 觸發 10% 交換）| dept_id / emplid（交換集 senior、其餘 default）| EXCH 矩陣 |

> **EQ 群組驗收門檻**：8 案例全綠為 SQL 版上線之硬性 DoD（F100 §8「JS↔SQL 計分等價測試未通過 → 阻擋上線」）。任一案例 `actual ≠ 手算預期` 即為阻擋級缺陷。**EQ-001（全 (b) 三方相等）特別重要**：它證明「純機制下推未引入 regression」；EQ-002（全 (a)）證明「升級確實生效」。

---

## 七、EXCH — Stage 4 st4_exchange 視窗函式（AC-5 / AC-6 / OQ-06，PG 真庫）

> **設計依據**：F100 AC-5 / AC-6 / §5 OQ-06；JS st4_exchange L488~542。
>
> **OQ-06 / OQ-F100-01 已裁定 = 對齊現行 JS 簡化版**：`PARTITION BY list_no`（全名單一池，非 SP 的 per-主管）+ deterministic `ORDER BY orgno, appl_no`（SP 為隨機 `NEWID()`，業務等價）+ 交換對象一律 `seniorEmpls[0]`（單一 senior）+ 其餘 `defaultEmpl = newEmpls[0] ?? listEmpls[0]`。**SP 之 `PARTITION BY OB_DEPT, OB_EMPLID` 主管↔專員等量配對交換 out-of-scope、不測。**
>
> **⚠️ CEIL vs ROUND 關鍵差異（測試設計重點）**：legacy SP 用 `ROUND(TOTAL_COUNT*0.1, 0)`（四捨五入）；**現行 JS / spec AC-5 用 `Math.ceil(... * 0.1)`（向上取整）+ 保底 1**（`Math.max(1, Math.ceil(exchangeableIdx.length * 0.1))`，JS L508~510）。OQ-F100-01 裁定對齊 **JS**，故 oracle = **CEIL**，**不是 SP 的 ROUND**。下推 SQL 必須用 `CEIL(count * 0.1)` 而非 `ROUND`——10 件時 CEIL(1.0)=1、ROUND(1.0)=1 相同，但 **15 件時 CEIL(1.5)=2、ROUND(1.5)=2 相同；5 件時 CEIL(0.5)=1、ROUND(0.5)=1（或 0，視 banker's rounding）**——EXCH-004 專測此分歧。

### st4_exchange 邊界矩陣（oracle = JS `Math.max(1, Math.ceil(n*0.1))`）

| 案例 | 可交換 T1/T2 案件數 n | 有 T3 senior? | 預期交換數 `exchangeCount` | 被交換之案件（deterministic）| 驗證點 | 需 PG |
|---|---|---|---|---|---|---|
| **TS-F100-EXCH-001** | 0（無 T1/T2 案件，全 T3）| 是 | **0** | 無 | T3 案件不可被交換（exchangeableIdx 僅含 T1/T2）| 是 |
| **TS-F100-EXCH-002** | 20 | **否（無 T3）** | **0** | 無 | 無 senior → 不交換（`seniorEmpls.length > 0` gate，JS L509）；全案件 emplid = defaultEmpl | 是 |
| **TS-F100-EXCH-003** | 20 | 是 | CEIL(20×0.1)=**2** | 前 2 件（ORDER BY orgno, appl_no）| 正常 10% + deterministic 選案可精確比對「哪 2 件」| 是 |
| **TS-F100-EXCH-004** | 5 | 是 | **保底 1**（CEIL(0.5)=1，但即使 0 也保底 1，`Math.max(1, ...)`）| 第 1 件 | **保底 1 邊界 + CEIL 取整**（n<10 仍交換 1 件）| 是 |
| **TS-F100-EXCH-005** | 10 | 是 | CEIL(10×0.1)=**1**（整除）| 第 1 件 | 10% 整除邊界（CEIL(1.0)=1）| 是 |
| **TS-F100-EXCH-006** | 11 | 是 | CEIL(11×0.1)=CEIL(1.1)=**2** | 前 2 件 | **取整邊界（1.1→2）**：攔截「誤用 FLOOR/ROUND 得 1」之 bug | 是 |
| **TS-F100-EXCH-007** | 3 | 是（多個 T3）| 保底 1 = **1** | 第 1 件（orgno,appl_no 最小）| 交換對象指向**單一** `seniorEmpls[0]`（即使有多個 senior，AC-6 簡化版）；其餘指向 defaultEmpl | 是 |
| **TS-F100-EXCH-008** | 20（**跨 2 名單**，各 10 件 T1/T2）| 各有 T3 | **每名單各 CEIL(10×0.1)=1**（`PARTITION BY list_no`）| 每名單各第 1 件 | **partition by list_no 驗證**：交換數 per-list 計（非全 run 一池）；list_A 1 件 + list_B 1 件，非全部 20 取 2 | 是 |

> **關鍵設計**：
> - EXCH-006（11 件→2）是 CEIL 正確性的核心攔截案：`Math.ceil(1.1)=2`；若 SQL 誤用 `ROUND(1.1)=1` 或 `FLOOR(1.1)=1` 即現破綻。
> - EXCH-004（5 件→保底 1）測 `Math.max(1, ...)` 保底：即使 `Math.ceil(5*0.1)=Math.ceil(0.5)=1`，邏輯上也由保底守住（n≥1 且有 senior 必交換 ≥1）。
> - EXCH-008 是 `PARTITION BY list_no` 的決定性驗證——若 SQL 漏 partition、把全 run 案件當一池取 10%，跨名單時交換數會錯。
> - **deterministic 選案（ORDER BY orgno, appl_no）使「哪些被交換」可精確 `toEqual` 比對**——EXCH-003/006/008 須斷言「被交換之案件 PK 集合 == 預期前 N 件（按 orgno, appl_no 排序）」，非僅斷言「交換了 N 件」。

---

## 八、RUNEST / NOLOAD — 不變式延續（AC-7，I-RUN-EST-01 / I-NOLOAD-01）

> **設計依據**：F100 AC-7 / A-4；不變式 I-RUN-EST-01（F099 延續）+ I-NOLOAD-01。

### TS-F100-RUNEST-001：estimate 路徑不含 Stage 2~4 計分 join（A-4）
- **Related Requirement**: F100 AC-7 / A-4；I-RUN-EST-01
- **Test Type**: Regression | **Level**: Unit + PG | **需 Postgres**: 部分（PG 子斷言）
- **Given**: 同一 list；estimate（Stage 0 試算）路徑
- **Then**: estimate 僅跑 Stage 1 `SELECT COUNT(*)`（`buildStage1Sql` core），**不含** Stage 2~4 之 `SUM(CASE…)` / `LEFT JOIN customer_core` / `EXISTS` / 視窗函式（A-4：estimate 只估 Stage 1 分派案件數）
- **And**: 若 P3 重構為「單一大 `INSERT…SELECT` 含 Stage 1~4 全 join」，estimate 路徑仍只取 Stage 1 core（不因 P3 合併而把計分 join 帶進 estimate）

### TS-F100-NOLOAD-001：Stage 2~4 不把案件讀回 heap 計分（靜態 guard）
- **Related Requirement**: F100 §1 / 點名表 I-NOLOAD-01（P3 消 Stage 2~4 read-back）
- **Test Type**: Regression | **Level**: Unit（原始碼靜態分析）| **需 Postgres**: 否
- **Given**: P3 Stage 2~4 下推實作檔
- **Then**: 下推路徑**不存在**「Stage 1 寫表後 re-hydrate 全 pool 回 heap 再 `pool.map(p => computeScore(...))` 計分」——計分/CR/交換以 SQL set-based 完成；無 `scoredPool = pool.map(...)` 全物化（現行 `executeV2` L465 之 `pool.map` 在 P3 應被移除或不再於下推路徑呼叫）
- **And**: 確認 `computeScore` / `resolveColumnValue` / `collectCrCandidates` 之 JS 全載邏輯不再被下推路徑呼叫（可保留供等價 oracle / v1 fallback，但 production P3 路徑不依賴）

### TS-F100-NOLOAD-002（可選）【PG】：大 pool 下 Stage 2~4 不 heap 暴增
- **Related Requirement**: I-NOLOAD-01（行為佐證）
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是（可選 / nightly）**
- **Then**: 以 query log / spy 斷言 Stage 2~4 僅執行 `UPDATE…FROM` / `INSERT…SELECT`（含 join），無「SELECT all pool → map → save」往返

---

## 九、IDEM — 冪等 / transaction 邊界（AC-7）

> **設計依據**：F100 AC-7（可中斷邊界 / 冪等延續 F099 AC-9 I-IDEM-01）。

| 案例 | Given / When / Then | Level | 需 PG |
|---|---|---|---|
| **TS-F100-IDEM-001【PG】** | 同 run_id 第二次跑 P3 前先清理（`DELETE WHERE run_id` 或 `UPDATE` 覆寫）→ 重跑後 score/level/tier/is_cr/emplid 列集合與第一次**完全一致**（不重複、不殘留半寫值）| PG Integration | 是 |
| **TS-F100-IDEM-002【PG】** | 可中斷邊界仍為 list↔list / Stage↔Stage（AD §9.3）；單一 list 之大查詢一旦開始即跑完該 list（不在 list 中途留半寫計分）| PG Integration | 是 |
| **TS-F100-IDEM-003【PG】**（**待 spec 定義**）| **若** P3 把 Stage 1~4 收進單一 transaction：失敗即 rollback、不殘留半寫列（任一 stage 失敗 → 該 run 0 列或全列回到前狀態）。**若 spec 未定義 transaction 範圍 → 本案標 blocked，列 open question OQ-F100-T1** | PG Integration | 是 |

> **⚠️ transaction 範圍 spec 未明（OQ-F100-T1）**：F100 AC-7 只說「可中斷邊界為 list↔list / Stage↔Stage」「冪等延續 F099」，**未明確定義 P3 是否把 Stage 1~4 包進單一 transaction**（失敗即全回滾 vs 各 stage 獨立提交）。AD §9.3 載「單一 `INSERT…SELECT` 為原子大查詢」「I-IDEM-01：pipeline 開始實質寫入前先清理」。本測試設計**不臆造** transaction 語意——IDEM-003 之「全 run rollback」斷言**待 spec/AD 確認後啟用**；現階段以 IDEM-001（冪等清理）+ IDEM-002（list 邊界）為基準。見 §十一 OQ-F100-T1。

---

## 十、UPGR — F067 計分升級差異報告 + 業務驗收 gate（§9 / NFR-005，上線硬性前置）

> **設計依據**：F100 §9 Production 計分升級差異知會；§10 點名「Production 計分差異報告 → test-designer + 業務（F067 比對）」。**此為 P3 上線之硬性前置，與 AC-8 DoD 並列。**
>
> **與 EQ 的分工**：EQ（§六）驗證「SQL 版 == 升級後手算預期」（技術正確性）；**UPGR 驗證「升級後 prod 結果 vs 升級前（v1 簡化版）prod 結果之差異，已量化並經業務知會驗收」**（業務可接受性）。兩者都是上線門檻：EQ 證明「補對了」，UPGR 證明「業務知道並接受補上後的結果變化」。

| 案例 | Given | Then | 需 PG / 人工 |
|---|---|---|---|
| **TS-F100-UPGR-001** | 一組代表性 prod 名單（含有 customer_core 計分欄位者）| 對同名單分別跑「v1 簡化版（`ASSIGNMENT_PIPELINE_V2` 舊計分）」與「v2 真實版（P3 下推）」→ 產生差異報告（沿用 F067 比對工具）| PG（報告自動）|
| **TS-F100-UPGR-002** | 差異報告 | 量化 **score 分佈變化**（各名單 score min/max/avg/分位 v1 vs v2）| PG |
| **TS-F100-UPGR-003** | 差異報告 | 量化 **等級分佈變化**（card_level / tier_level 各級案件數 v1 vs v2）+ **分派變化**（emplid 改派案件數、st4_exchange 交換案件變化）| PG |
| **TS-F100-UPGR-004**（**人工 gate**）| UPGR-001~003 報告 | **業務知會並驗收差異**——簽核「升級造成的結果變化在預期/可接受範圍」。**未經業務驗收 → 阻擋上線**（與 AC-8 DoD 並列為硬性前置）| 人工 |

> **gate 設計要點**：UPGR 不是「斷言 v1==v2」（升級本就會改變結果，斷言相等會永遠 fail）。UPGR 的驗收條件是「**差異已被完整量化 + 業務簽核接受**」。tdd 產生 UPGR-001~003 之差異報告（可自動化），UPGR-004 之業務簽核為人工 gate（記錄於上線 checklist）。**EQ 全綠（技術正確）+ UPGR-004 業務簽核（業務接受）= P3 完整上線前置。**

---

## 十一、回歸基準清單（P3 升級計分，以下既有測試須維持 / 升級）

| 既有 spec / 測試 | 為何是基準 | P3 後預期 |
|---|---|---|
| `assignment-run-pipeline-v2.service.spec.ts`（TC-V2-STAGE2/3/4，JS 簡化版）| 既有 JS v2 計分 / CR / st4_exchange 行為基準 | **升級**：其手算預期（如 score=15→C→T3）對「無 customer_core 欄位」案件**維持**（屬 (b)，SQL==JS）；但若該 spec 之卡含 customer_core 欄位，預期值須改為 v2 補完後（屬 (a)）。tdd 須逐案判定該 spec 各案屬 (a)/(b) 並更新 |
| `executeV2`（JS 簡化版）| **(b) 案件之 regression 旁證 oracle**（純 ob_pool_data 欄位 v1≡v2）| 保留為 oracle / v1 fallback；下推路徑改 SQL，但 JS 版不刪（EQ 骨架步驟 3 需要它對 (b) 案件比對）|
| `computeScore` / `resolveColumnValue`（JS）| customer_core default 分支回 `''` 之 v1 行為 | 保留供 (b) 比對；P3 下推路徑不依賴（NOLOAD-001）|
| F099 `buildStage1Sql` / Stage 1 等價測試 | P3 在 P2 結果上補計分 | Stage 1 行為不變；P3 不改 Stage 1 WHERE/JOIN core（I-RUN-EST-01 延續，RUNEST-001）|
| F094 `ob_monthly_run_result` 寫入 / PK / FK CASCADE | 下推目標表 | Stage 2~4 改以 `UPDATE…FROM` 或重構 `INSERT…SELECT` 填 score/level/tier/is_cr/emplid；PK 不變；冪等由 IDEM 守 |
| F061 邊緣 CARD_TYPE skip（HB/SEB/SEC）| AC-3「skip 語意 P3 不改」| 沿用 `report_payload.skippedCases`，月跑仍 completed；P3 不改此語意 |

### 風險與待決（彙整至 risks-and-gaps.md）

| ID | 風險 / 待決 | 等級 | 處置 |
|---|---|---|---|
| RISK-F100-001 | **以「跑 v1 JS」當 oracle → 把升級補上的正確分判為 fail**（v1 不算 customer_core）| 高 | **oracle = §一手算預期矩陣**（寫死數字、人複核）；EQ 骨架明令禁用「跑 v1 當 (a) 案件 oracle」；(b) 案件才可對 v1 比對 |
| RISK-F100-002 | customer_core 用 `INNER JOIN` 而非 `LEFT JOIN` → 無對應客戶之案件整列消失（漏案）| 高 | CJOIN-002 / EQ-003（LEFT JOIN NULL 邊界）；斷言無 match 案件仍在、屬性 NULL 不取分 |
| RISK-F100-003 | st4_exchange 誤用 `ROUND`/`FLOOR` 取代 `CEIL`（SP 是 ROUND、JS 是 CEIL，OQ-F100-01 對齊 JS）| 高 | EXCH-006（11→2）/ EXCH-004（保底 1）；oracle=`Math.max(1, Math.ceil(n*0.1))`，非 SP ROUND |
| RISK-F100-004 | st4_exchange 漏 `PARTITION BY list_no` → 跨名單把全 run 當一池取 10% | 高 | EXCH-008（跨 2 名單各 1 件）|
| RISK-F100-005 | score=NULL（無 active）vs card_level=NULL（落 level 區間外）之 tier fallback 語意混淆 | 高 | LEVTIER-003 vs LEVTIER-004（tier 預期 T3 vs NULL）；⚠️ 連動 OQ-F100-T2 |
| RISK-F100-006 | score=0（有 active 0 命中）誤寫成 NULL，或 NULL 誤寫成 0 | 中 | SCORE-006 vs SCORE-007 分案 |
| RISK-F100-007 | 等價測試誤用 better-sqlite3 → 視窗函式 / `SUM(CASE…)` / regexp 在 SQLite 不具代表性、假綠 | 高 | 全 EQ/SCORE/CJOIN/LEVTIER/CR/EXCH 強制 PG（沿用 F099 I-PORT-01 教訓）|
| RISK-F100-008 | 升級後 prod 計分變化未經業務知會即上線（合規/信任風險）| 高 | UPGR-004 人工 gate（F067 差異報告 + 業務簽核）為上線硬性前置（§9 / NFR-005）|
| RISK-F100-009 | vitest 不檢型別 → 下推 SQL builder 型別錯誤潛伏至 prod build（US-144 500 教訓）| 中 | 實作後強制 `tsc --noEmit -p tsconfig.build.json` |
| RISK-F100-010 | `ob_empl_set.prod_type='TIER:T*'` slice(5) 解析；seed 若用其他格式（如 `'T3'` 無前綴）→ tier 全空、st4_exchange 不交換假綠 | 中 | seed 須用真實 contract `'TIER:T3'`（feedback_mock_real_system_contract）；EXCH-002（無 T3）與有 T3 對照守住 |
| **OQ-F100-T1** | **P3 是否把 Stage 1~4 收進單一 transaction**（失敗即全回滾 vs 各 stage 獨立提交）spec/AD 未明確定義 | — | **待 spec/AD 確認**。現階段 IDEM-003「全 run rollback」斷言 blocked；以 IDEM-001（冪等清理）+ IDEM-002（list 邊界）為基準。呼應 P2 follow-up F-1 |
| **OQ-F100-T2** | **score=NULL（無 active version）時 tier_level 是否走 `card_level IS NULL` fallback（T3）或為 NULL** spec 未逐字明列 | — | 本文件 LEVTIER-004 以**現行 JS 推導**為基準（score NULL → lvl=null → cardLevel=null → 走 `cardLevel===null` fallback → tier=T3）；建議 tdd 與 spec 確認後鎖定。**注意**：JS L469 `score !== null` 才查 level，但 L481~483 之 fallback 對「cardLevel===null」一律命中（不分 score 來源），故 JS 現況 score=NULL 之 tier **會**走 fallback 得 T3——若 spec 期望 NULL，須改 SQL 邏輯。此分歧須在實作前釐清 |
| **OQ-F100-T3** | `customer_core` entity 在 `apps/api/src/database/entities/` **尚未存在**（僅 data-model.md / F036 定義目標表）；P3 LEFT JOIN 需要它 | — | **待 tdd 確認**：P3 LEFT JOIN customer_core 前須先有對應 entity / 表。若 F036 ETL 尚未產出 customer_core 表於月跑庫，CJOIN 群組無從 join。tdd 須先確認 customer_core 表在月跑 PG 庫存在且可 join；缺則為 P3 前置 blocker |
| **OQ-F100-T4** | CUS_SEX / AGE 等 customer_core 計分欄位之**精確欄位映射**（architecture-spec.md §3.10 對照表）test-designer 無法獨立確定（A-1 載「由 tdd 對齊」）| — | §一矩陣之 customer_core 欄位名/分數為**測試確定性 seed**（非生產真值）；tdd 對齊 §3.10 表後同步調整 seed 欄位名，預期數字邏輯不變。**列為 tdd 交接項，非 blocker** |

---

## 自動化就緒度

| 群組 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|
| EQ-001~008（升級後逐列等價）| 高（**強制 PG**）| PG Integration | postgres-test 容器；oracle=手算矩陣；(a)/(b) 分流斷言 |
| SCORE-001~007 | 高（**強制 PG**）| PG Integration | `SUM(CASE…)` 區間/類別/邊界/disabled/NULL vs 0 |
| CJOIN-001~004 | 高（**強制 PG**）| PG Integration | LEFT JOIN match/NULL；INNER JOIN 漏案攔截 |
| LEVTIER-001~005 | 高（**強制 PG**）| PG Integration | score→level→tier NULL fallback 分歧 |
| CR-001~005 | 高（**強制 PG**）| PG Integration | EXISTS cr_enabled 開/關；未成交語意 |
| EXCH-001~008 | 高（**強制 PG**）| PG Integration | 視窗函式 CEIL/保底 1/partition/deterministic 選案 |
| RUNEST-001 | 高（部分 PG）| Unit + PG | estimate 不含計分 join |
| NOLOAD-001 | 高 | Unit（靜態 grep）| Stage 2~4 無 read-back heap |
| NOLOAD-002 | 中（可選 PG）| PG Integration | 行為佐證；CI 吃緊可 nightly |
| IDEM-001~002 | 高（強制 PG）| PG Integration | 冪等清理 / list 邊界 |
| IDEM-003 | blocked（待 OQ-F100-T1）| PG Integration | transaction rollback；spec 定義後啟用 |
| UPGR-001~003 | 高（強制 PG，報告自動）| PG Integration | F067 差異報告 / 分佈 / 分派變化 |
| UPGR-004 | 人工 gate | 人工 | 業務簽核；上線 checklist |
| RG-001~003 | 高 | Unit | v1/v2 flag 不破壞 / tsc gate / 既有 v2 spec 升級 |

### 需 Postgres 案例彙整（CI 決策連動）

**強制需 Postgres（40 案例）**：EQ-001~008（8）、SCORE-001~007（7）、CJOIN-001~004（4）、LEVTIER-001~005（5）、CR-001~005（5）、EXCH-001~008（8）、IDEM-001~002（2）、UPGR-001~003（3）＝合計 **42**；扣除 IDEM-003（blocked）後**約 40 案例**強制需 PG（NOLOAD-002 可選 PG、RUNEST-001 部分 PG 另計）。

> **CI 落實要求**：沿用 `docker-compose.test.yml` 之 `postgres-test`（postgres:16-alpine，5433:5432，`cdmp_test`）服務 + F038/F075/M01/F098/F099 既有 Test Container 慣例。CI 必須能起 Postgres，否則 EQ / SCORE / CJOIN / LEVTIER / CR / EXCH（≈37 案例）無法執行 = **P3 DoD（AC-8）無法驗收**。better-sqlite3 不可替代（視窗函式 `ROW_NUMBER()`/`CEIL`、`SUM(CASE…)`、`LEFT JOIN`、`EXISTS` 子查詢在 SQLite 行為不具代表性）。

---

## tdd-implementation 注意事項（交接）

1. **EQ 群組是 P3 驗收紅線（AC-8）**：8 案例（PG 真庫、逐列 `toEqual`）全綠才可上線。**oracle = §一手算預期矩陣（寫死數字、人複核）**，**禁止用「跑 v1 JS 簡化版」當 (a) 升級差異案件之 oracle**（v1 不算 customer_core，會把正確補分判 fail）。
2. **(a) 升級差異 vs (b) 下推等價 必須分流**：(b) 案件（無 customer_core 欄位 / 無 match）SQL 須 == 手算 == v1 JS（三方相等，守 regression）；(a) 案件 SQL == 手算 v2 **且** ≠ v1 JS（證明補完生效）。EQ 矩陣每案已標 (a)/(b)。
3. **customer_core 用 `LEFT JOIN`，非 `INNER JOIN`**（RISK-F100-002）：無對應客戶之案件不可消失；屬性 NULL 參與計分、不匹配任何 score row → +0（與 v1 default `''` 不匹配一致）。
4. **st4_exchange oracle = `Math.max(1, Math.ceil(n*0.1))`（CEIL + 保底 1），非 SP 的 `ROUND`**（OQ-F100-01 對齊 JS）：下推 SQL 用 `CEIL(count*0.1)`；EXCH-006（11→2）/ EXCH-004（保底 1）守此。`PARTITION BY list_no`（非 SP 的 per-主管）+ deterministic `ORDER BY orgno, appl_no`；交換對象單一 `seniorEmpls[0]`。**SP 主管↔專員配對交換 out-of-scope、不實作、不測。**
5. **score NULL vs card_level NULL 之 tier fallback 分歧（OQ-F100-T2）**：實作前與 spec 確認「score=NULL（無 active version）時 tier 走 fallback T3 或 NULL」。LEVTIER-003（score 有值落 level 外 → card_level NULL → tier fallback T3）與 LEVTIER-004（score NULL → tier NULL？）預期不同，須鎖定。
6. **score NULL（無 active）vs score 0（有 active 0 命中）分案**（SCORE-006/007）：下推 `CASE WHEN no active THEN NULL ELSE SUM(...)` 易誤把 0↔NULL 互換。
7. **CR `EXISTS` 來源表對齊現行 `collectCrCandidates`（A-2）**：oracle = JS `collectCrCandidates` 之未成交集合等價，不綁定子查詢對 snapshot 或對 result 表；「未成交」= `result_status='PENDING'` 或無 status（JS L653）。
8. **I-NOLOAD-01：Stage 2~4 下推路徑禁 `pool.map(computeScore)` 全物化 heap**（NOLOAD-001）；現行 `executeV2` L465 `scoredPool = pool.map(...)` 須移出下推路徑。
9. **I-RUN-EST-01 延續（A-4）**：estimate 只跑 Stage 1 COUNT，**不**含 Stage 2~4 計分 join；P3 合併 SQL 不可把計分 join 帶進 estimate 路徑。
10. **transaction 範圍（OQ-F100-T1）**：實作前與 spec/AD 確認 P3 是否單一 transaction（失敗全回滾）。未定義前 IDEM-003 blocked；以 IDEM-001（冪等清理）+ IDEM-002（list 邊界）為基準。
11. **customer_core 表前置（OQ-F100-T3）**：P3 LEFT JOIN 前須確認 `customer_core` entity / 表在月跑 PG 庫存在且可 join（目前 entities 目錄無此 entity）。缺則為 P3 前置 blocker，須先補。
12. **計分欄位映射（OQ-F100-T4）**：CUS_SEX/AGE 等 customer_core 欄位對齊 architecture-spec.md §3.10 對照表（A-1）；§一矩陣欄位名為測試 seed，tdd 對齊後同步調整。
13. **F067 升級差異報告 + 業務驗收（UPGR）為上線硬性前置**：EQ 全綠（技術正確）+ UPGR-004 業務簽核（業務接受升級結果變化）並列 P3 上線門檻（§9 / NFR-005）。
14. **全等價/計分/視窗群組強制 PG，禁 better-sqlite3**（RISK-F100-007）：視窗函式 / `SUM(CASE…)` / `LEFT JOIN` / `EXISTS` 在 SQLite 不具代表性。沿用 postgres-test 容器（F099 既有 harness `stage1-sql-pushdown.pg.spec.ts` 之連線/skip-with-reason 模式可複用）。
15. **seed 模擬真實 contract**（feedback_mock_real_system_contract）：計分卡 active 版本 + column status='active' + `ob_levelcard_score` 區間（varchar trim 數值）/ 類別（varchar trim 相等）+ `ob_empl_set.prod_type='TIER:T3'`（slice(5) 取 T*）+ `ob_tier` card_level NULL fallback 列 + customer_core 屬性格式對齊 F036。
16. **SP 為 UTF-16LE**（feedback_sp_utf16le_decode）：`node ... toString('utf16le')` 解碼 `SP_INFOT_ASSIGNEXPORTNAMELIST_st4_exchange.sql`（中文版 Stage4 mojibake 不採信）；spec §5 已據此完成 OQ-06 推導，tdd 沿用結論即可。
17. **實作後跑 `tsc --noEmit -p tsconfig.build.json`**（vitest 不檢型別，feedback_vitest_no_typecheck）。
