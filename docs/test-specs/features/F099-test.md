---
type: test-design-feature
feature_id: F099
feature_name: Stage 1 SQL 下推（set-based INSERT…SELECT + estimate≡run 共用 buildStage1Sql）
priority: P0-MVP
related_spec: /docs/specs/features/F099-stage1-sql-pushdown.md
spec_version: "1.0"
covers:
  - F099
source_ad: /docs/specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md
last_updated: 2026-06-02
---

# F099：Stage 1 SQL 下推（AD-E07-28 P2）— 測試設計

> ⚠️ **範圍限定 P2（F099）**。P1（F098 worker 抽離，已完成）與 P3（F100 Stage 2~4 下推）**不在本文件範圍**。本文件不寫 production / 最終測試實作碼，僅產出測試策略與案例清單，由 tdd-implementation 承接。
>
> **核心驗收哲學**：F099 是「**改機制、結果須可證等價**」之變更。將 `executeStage1Chain` 的「全載 `ob_pool_data`（`getMany()`）+ 應用層 `.filter` + 全載近 3 月 DISTINCT custo_no Set」改寫為單一 set-based SQL `buildStage1Sql(list, workdt)`（回傳 WHERE/JOIN/params core），run（`INSERT…SELECT`）與 estimate（`SELECT COUNT(*)`）**共用同一 core**。**唯一硬性 Definition of Done = JS↔SQL 逐 list 結果集精確等價（PG 真庫，逐列 PK 比對）**。
>
> **已拍板決策（測試據此驗收）**：
> - **OQ-AD28-03 = 選項 A**：四條特例規則（fraud / motorcycle / xiaozi / **year-above**）**全 SQL 下推、無任何應用層 filter**。year-above 之 `year_produ` 數值化用 PG 可移植寫法，**PG 真庫驗收，禁止只靠 SQLite**（I-PORT-01）。
> - **OQ-F099-01 = CI 必起 Postgres**：等價測試與 portability 測試一律對真 Postgres 跑，沿用 `docker-compose.test.yml` postgres-test 容器（F038 / F075 / M01 / F098 慣例）。
> - **既有 `RGv2-005`（grep JS 原始碼保留 `includes('小資')`/`includes('白牌')`）與整套 `SDv2-*`（pin JS 特例 DELETE 實作）作廢**，由本等價測試 + `special-rules.ts` 既有單元測試（trigger 仍 JS）取代（AD-E07-28 §6.2 測試移轉表）。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F099 spec](../../specs/features/F099-stage1-sql-pushdown.md)（§4 AC-1~AC-9 / §8）+ [AD-E07-28 §5 P2 / §6.1 / §6.2 / §6.3](../../specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)（**權威**）+ `stage1-filter-chain.ts`（等價基準）+ `stage1-query-composer.ts` + `special-rules.ts` + [F091-test.md](F091-test.md)（被取代的 SDv2/RGv2 群組）+ [F094-test.md](F094-test.md)（寫入目標表）|
| QA / Tester | 本文件（特別 §一 EQ 等價矩陣 + §二 I-RUN-EST-01 + §六 guard 移轉）|
| Architect | 本文件 §九 風險與待決 + [AD-E07-28 §10](../../specs/implementation-log/AD-E07-v3.1-monthly-run-execution-model.md)|
| CI/CD Owner | 本文件「自動化就緒度」+「需 Postgres 案例彙整」|

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| **驗收紅線** | **EQ 群組（JS↔SQL 逐 list 結果集精確等價，PG 真庫）= P2 Definition of Done**。未全綠 → 阻擋 SQL 版上線。 |
| 主要測試層 | ① **PG Integration（強制 Postgres）**：EQ 等價矩陣、I-PORT-01 year-above 數值化、I-RUN-EST-01 列數==COUNT、I-IDEM-01 冪等清理 ；② **Unit（純函式 / 靜態）**：`buildStage1Sql` SQL core 結構斷言、I-NOLOAD-01 靜態 guard、SQL 注入防禦沿用、`matchesSpecialRule` 既有單元測試（trigger 仍 JS）|
| 等價基準（Oracle） | 現行 JS `executeStage1Chain`（`stage1-filter-chain.ts`）為 golden oracle。SQL 版輸出列集合須與其逐列 PK 相等。**禁止以「SQL 自我斷言預期值」取代與 JS 的逐 list 比對**（否則 SQL 與 JS 同錯則假綠）。 |
| Mock / Seed 注意 | seed 須模擬真實 contract（記憶 feedback_mock_real_system_contract）：`list_nm` 觸發字為**真實繁體中文**（期中 / 機車 / 年以上 / 小資 / 白牌）；`year_produ` 為 `varchar(4)`（含 `null` / 空字串 `''` / 純非數字 `'N/A'` / **前導數字 `'1980abc'`**）；`deal_num` / `break_pct` 等 NUMERIC 欄位 entity 型別為 `string｜null`。`ob_monthly_run_result.assignday` 期望值恆 NULL（OQ-F099-03 ✅ RESOLVED，`ob_pool_data` 無此欄，現行 JS pipeline 亦不寫，下推 SELECT 直接寫 NULL）。 |
| 型別 gate | 實作後必須跑 `tsc --noEmit -p tsconfig.build.json`（vitest 不檢型別；US-144 登入 500 教訓 / 記憶 feedback_vitest_no_typecheck）。 |
| 既有整合測試現況 | `stage1-filter-chain.integration.spec.ts` 目前以 **better-sqlite3 in-memory** 跑（非真 PG）。F099 之 EQ / PORT / RUN-EST / IDEM 群組**不可**沿用 better-sqlite3——year-above 的 PG `CAST`/`regexp` 在 SQLite 無代表性（I-PORT-01）。須改走 postgres-test 容器。 |

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | 說明 |
|---|---|---|---|---|---|
| EQ（JS↔SQL 逐 list 結果集精確等價）| 14 | PG Integration | **是** | 高 | **P2 DoD**；逐列 PK 集合比對；代表性名單矩陣見 §一 |
| RUNEST（I-RUN-EST-01 estimate≡run 不分叉）| 4 | Unit + PG Integration | 部分（RUNEST-002/003） | 高 | run 列數 == estimate COUNT；SQL core 同源結構斷言 |
| PORT（I-PORT-01 year-above 數值化 PG 可移植）| 7 | PG Integration | **是** | 高 | 前導數字 `'1980abc'`→1980 / 空字串→保留 / null→排除 / 對齊 JS；禁 SQLite |
| NOLOAD（I-NOLOAD-01 不全載 heap）| 3 | Unit（靜態 + 行為）| 否（NOLOAD-003 可選 PG）| 高 | 下推路徑無 `getMany()`/`find()` 全載；含 year-above 無例外 |
| IDEM（I-IDEM-01 重觸發前清理）| 3 | PG Integration | **是** | 高 | 同 run_id 重跑列集合一致；FK CASCADE / DELETE 前置 |
| SQLG（既有 SQL 安全 / 結構沿用）| 4 | Unit | 否 | 高 | `buildStage1WhereConditions` / `buildMonthCntFragment` 沿用；columnName allowlist 注入防禦沿用 |
| GMT（guard 移轉：作廢 RGv2-005 / SDv2-*）| 3 | Unit（靜態）| 否 | 高 | 確認舊 grep-原始碼 guard 移除；trigger 改由 special-rules 單元測試守 |
| **合計** | **38** | — | **26 案例需 Postgres** | — | EQ 14 + PORT 7 + IDEM 3 + RUNEST(PG) 2 ＝ 26 強制需 PG |

---

## 一、EQ — JS↔SQL 逐 list 結果集精確等價（P2 Definition of Done，PG 真庫）

> **設計依據**：F099 AC-7（P2 DoD）；AD-E07-28 §6.2。
>
> **共用測試骨架（給 tdd-implementation）**：對每張代表性名單 `L`，在同一 postgres-test 容器、同一份 seed 資料上：
> 1. 跑現行 JS `executeStage1Chain(L, workdt, poolRepo, pdlRepo, { dryRun:false })` → 取 `cases` 之 PK 集合 `S_js = { (orgno, appl_no) }`。
> 2. 跑新 SQL 路徑（`buildStage1Sql(L, workdt)` 包成 `INSERT…SELECT` 寫入 `ob_monthly_run_result`）→ 查 `ob_monthly_run_result` 取 PK 集合 `S_sql = { (orgno, appl_no) }`。
> 3. **斷言 `S_js` 與 `S_sql` 為完全相同集合（逐列 PK 比對，非僅 `count` 相等）**——`expect(sort(S_sql)).toEqual(sort(S_js))`。
> 4. **断言 `ob_monthly_run_result.assignday` 恆為 NULL**（OQ-F099-03 ✅ RESOLVED：`ob_pool_data` 無 assignday 欄，現行 JS pipeline 從不寫 assignday，下推 SELECT 直接寫 NULL；兩側 JS 與 SQL 均 NULL，無等價差異）——`expect(rows.every(r => r.assignday === null)).toBe(true)`。
>
> **覆蓋要求（spec 明列）**：(a) 每條特例規則 ≥1 觸發樣本；(b) 去重視窗上下界邊界各一樣本；(c) NULL custo_no 樣本；(d) 列集合精確相等。
>
> **代表性名單矩陣（哪張名單測哪條規則 / 邊界）**：

| 案例 | 名單 `list_nm`（觸發字）| condition_payload / 期別 | 覆蓋的規則 / 邊界 | seed 關鍵案件（會 / 不會被排除）|
|---|---|---|---|---|
| **EQ-001** | `一般催收名單`（無特例觸發）| 單一 categorical（prod_kind IN）| 基準：純欄位篩選，無特例、無去重 | 命中 / 未命中欄位條件各數筆；驗證最基本 WHERE 等價 |
| **EQ-002** | `一般催收名單` | 期別 list_period 1~6 interval 1 → month_cnt IN(1..6) | month_cnt 期別過濾（`buildMonthCntFragment` 沿用）| month_cnt=3（入）、month_cnt=9（排）、month_cnt=NULL（排）|
| **EQ-003** | `一般催收名單` | interval=2 → month_cnt IN(1,3,5) | month_cnt 步進邊界 | month_cnt=1/3/5（入）、=2/4/6（排）|
| **EQ-004** | `（任意）`，list_period 缺值 | start/end/interval 任一為 null | **month_cnt skip 邊界**（缺值 → 不加 fragment，全留）| 多筆不同 month_cnt 全保留（warning 不阻擋）|
| **EQ-005** | `（任意）`，interval=0 | interval ≤ 0 | **month_cnt skip 邊界**（防 infinite loop → 不加 fragment）| 同 EQ-004：全保留 |
| **EQ-006** | `詐騙白牌專案`（白牌規則無條件）| 任意 | **R-FRAUD-WHITEBOARD**（`list_type='01' AND spec_name LIKE '%白牌%'`）| `{list_type:'01', spec_name:'詐騙白牌方案'}`（排）/`{list_type:'02', spec_name:'白牌'}`（留，type 不符）/`{list_type:'01', spec_name:'一般'}`（留）|
| **EQ-007** | `機車期中催收名單`（含「期中」+「機車」）| 任意 | **R-PERIOD-MOTORCYCLE**（`payt_term >= deal_num-3` OR `appl_no` 以 T/Y 開頭）+ 邊界 | `payt_term=21,deal_num='24'`（排，21≥21）/`payt_term=20,deal_num='24'`（留，20<21）/`appl_no='T003'`（排）/`appl_no='Y004'`（排）/`appl_no='A002'`（留）|
| **EQ-008** | `期中催收名單`（含「期中」，不含「機車」）| 任意 | **R-PERIOD-XIAOZI**（`payt_num > deal_num-8 AND spec_name LIKE '%小資%'`）+ 邊界 | `payt_num=17,deal_num='24',spec_name:'小資'`（排，17>16）/`payt_num=16,…小資`（留，16=16 非「>」）/`payt_num=17,…一般`（留，無小資）|
| **EQ-009** | `5年以上車主催收名單`（含「年以上」）| 任意 | **R-YEAR-ABOVE**（`year_produ` 數值 < workdt 年-15）正常值 | workdt=2026-06 → cutoff=2011；`year_produ='2010'`（排）/`='2011'`（留，2011 非 <2011）/`='2020'`（留）|
| **EQ-010** | `年以上機車名單`（含「年以上」）| 任意 | **R-YEAR-ABOVE 退化 / 非數字 / 前導數字邊界**（對齊 JS `parseInt(year_produ ?? '1900')`）| `year_produ=null`（排，退化 1900<2011）/`=''`（**留**，JS `parseInt('')=NaN`，`NaN<2011=false`）/`='N/A'`（**留**，NaN）/`='200'`（排，200<2011）/**`='1980abc'`（排，`parseInt('1980abc')=1980`，前導數字解析，1980<2011 → 排除；⚠️ `^[0-9]+$` strict 正則對此回 NULL 保留，PG 寫法必須用前導數字解析才等價）**|
| **EQ-011** | `機車期中小資5年以上催收名單`（全部觸發）| 任意 | **規則疊加（BR-1 不合併）**：fraud + motorcycle + xiaozi + year-above 依序套用 | 設計 4 筆，各只命中一條規則之排除條件 → 全排；1 筆全不命中 → 留。驗證疊加後結果與 JS 逐條套用相同 |
| **EQ-012** | `一般催收名單` | 任意 | **近 3 月去重 — 上界 / NULL custo_no**（`custo_no NOT IN`/`NOT EXISTS`）| ob_pool_data_list 在視窗 [workdt−3月, MIN(MAX(assignday),workdt−1)] 內有 custo_no=C001 → C001 案件排除；C002 在視窗外 → 留；**pool 中 custo_no=NULL 案件 → 不被去重誤排（留）**；歷史表中 custo_no=NULL 不可導致全部 NOT IN 失效 |
| **EQ-013** | `一般催收名單` | 任意 | **去重上界邊界**（MAX(assignday) 異常未來日 → 封頂 workdt−1；MAX=NULL → 退化 workdt−1）| 兩子樣本：歷史最大 assignday=`'20261231'`（未來）→ 該 custo_no 不去重；歷史表全空 → 去重集合空、不過濾 |
| **EQ-014** | `（condition_payload conditions=[]）`| EMPTY_CONDITIONS | **整 list skip**（`skipReason='EMPTY_CONDITIONS'` → 0 列；SQL 路徑亦不撈）| JS 回 count=0 / cases=[]；SQL 路徑須一致回 0 列、不執行 `INSERT…SELECT` |

> **EQ 群組驗收門檻**：14 案例全綠為 SQL 版上線之硬性 DoD（F099 §7「JS↔SQL 等價測試未通過 → 阻擋上線」）。任一案例 `S_js ≠ S_sql` 即為阻擋級缺陷。

---

## 二、RUNEST — estimate≡run 不分叉（I-RUN-EST-01，F049 老坑）

> **設計依據**：F099 AC-1（不變式 I-RUN-EST-01）；AD-E07-28 §6.1；F049 原 bug 根因。

### TS-F099-RUNEST-001：run 與 estimate 共用同一份 SQL core（結構斷言）
- **Related Requirement**: F099 AC-1 / I-RUN-EST-01
- **Test Type**: Positive | **Level**: Unit | **需 Postgres**: 否
- **Given**: 同一 `list` 與 `workdt`
- **When**: 取 `buildStage1Sql(list, workdt)` 之輸出（WHERE / JOIN / params core），分別交給 run 包裝（`INSERT…SELECT`）與 estimate 包裝（`SELECT COUNT(*)`）
- **Then**: 兩路徑的 `<core>`（WHERE 子句字串 + params + FROM/JOIN 片段）**逐字相等**；分叉僅在最外層 `INSERT INTO … SELECT` vs `SELECT COUNT(*)`
- **And**: 不得存在「run 一份 WHERE、estimate 另一份 WHERE」（直接斷言只有單一 `buildStage1Sql` 被呼叫，或兩包裝引用同一 core 物件 / 字串）
- **設計說明**: 此為防 fork 的結構性護欄；即使下游忘了跑 PG，本案先在 unit 層攔住「分叉」這一類錯誤

### TS-F099-RUNEST-002【PG】：同一 list，run 列數 == estimate COUNT
- **Related Requirement**: F099 AC-1（驗收門檻替代式：列數 === COUNT）
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是**
- **Given**: postgres-test 容器 + 一張觸發特例 + 去重的名單 seed
- **When**: ① run 路徑 `INSERT…SELECT` 寫入 `ob_monthly_run_result` → 查該 run_id 列數；② estimate 路徑 `SELECT COUNT(*)`
- **Then**: `run 列數 === estimate COUNT`（同一份 core 自然保證）
- **And**: 對含 year-above 的名單也成立（year-above 已 SQL 化納入 core，無「只在 run 套、estimate 漏」之 fork）

### TS-F099-RUNEST-003【PG】：year-above 名單 estimate 不漏套（回歸 §7 註記）
- **Related Requirement**: F099 AC-8 / §7 註；I-RUN-EST-01
- **Test Type**: Regression | **Level**: PG Integration | **需 Postgres**: **是**
- **Given**: `list_nm='年以上'` 名單，pool 含應被 year-above 排除的車齡案件
- **When**: 跑 estimate（COUNT）與 run（列數）
- **Then**: 兩者皆已扣除 year-above 排除的案件且相等（證明 year-above 在 estimate 路徑同樣生效，非 run-only）

### TS-F099-RUNEST-004：保留並加強既有 estimate≡run 共用測試
- **Related Requirement**: AD-E07-28 §6.2 測試移轉表「estimate≡run 共用測試：保留並加強」
- **Test Type**: Regression | **Level**: Unit | **需 Postgres**: 否
- **Given**: F092 既有「dry-run ≡ run 同 fixture 回相同 count」測試（如 `stage1-filter-chain.integration.spec.ts` CH-004）
- **Then**: 升級為斷言「兩路徑共用 `buildStage1Sql` 之 SQL core」（新增 I-RUN-EST-01 斷言），不僅 count 相等
- **註**: 既有 CH-004 以 better-sqlite3 跑；本案的 PG 版列數==COUNT 由 RUNEST-002 覆蓋，本案守 unit 層共用結構

---

## 三、PORT — year-above 數值化 PG 可移植（I-PORT-01，禁 SQLite）

> **設計依據**：F099 AC-8 / 不變式 I-PORT-01；AD-E07-28 §6.3 OQ-AD28-03 RESOLVED=選項 A；**OQ-F099-02 ✅ RESOLVED（裁定 oracle = 現行 JS）**。
>
> **JS golden 語意（須對齊，OQ-F099-02 裁定以此為準）**：`parseInt(c.year_produ ?? '1900', 10) < (workdt.getFullYear() - 15)`。`parseInt` 行為：`'2010'`→2010、`null`→`?? '1900'`→1900、`''`→NaN、`'N/A'`→NaN、**`'1980abc'`→1980（前導數字解析，取前綴合法整數部分）**。`NaN < cutoff` 在 JS 為 **false**（保留）。
>
> **⚠️ AD 建議的 `NULLIF(REGEXP_REPLACE(year_produ,'[^0-9]','','g'),'')` 存在三個陷阱，tdd 禁止直接照搬**：
> - 陷阱①（空字串/非數字誤排）：`REGEXP_REPLACE` 移除所有非數字後，`''`/`'N/A'` 變空字串 → `NULLIF(…,'')` → NULL → 退化 1900 → 排除；但 JS `parseInt('')=NaN` → **保留**，語意不符。
> - 陷阱②（前導數字截斷）：`REGEXP_REPLACE('[^0-9]','','g')` 對 `'1980abc'` 會取出 `'1980'`，再 CAST → 1980 → 排除，此結果**恰好與 JS 相符**（`parseInt('1980abc')=1980`），但若 tdd 誤用 `'^[0-9]+$'` strict 正則匹配，`'1980abc'` 不 match → 視為非數字 → NULL → 退化 1900 → 排除；巧合正確但語意模糊，**PORT-007 必須能抓出 `'^[0-9]+$'` strict 對前導數字的等價陷阱**（若改成 `ELSE NULL`，`'1980abc'`→NULL→退化 1900→排除，與 JS 排除一致，但理由不同；若有一欄 `'1980abc'` 的 cutoff 是 1981 則 JS 排除、strict NULL→1900>1981 即保留，等價會錯）。
> - **正確 PG 寫法（對齊 JS 前導數字解析）**：`NULLIF(REGEXP_REPLACE(year_produ, '^[^0-9]*([0-9]+).*$', '\1', 'g'), '')::int`（擷取首段連續數字）；或等效：先 `SUBSTRING(year_produ FROM '^[0-9]+')`（取前導數字串）再 `CAST(NULLIF(…,'') AS int)`——具體寫法由 tdd 定，等價性由 PORT-007 守。NULL 輸入須特判退化 1900。
>
> **⚠️ 全群組強制 PG，禁止以 SQLite 替代**（SQLite `CAST('N/A' AS INTEGER)`=0、無 POSIX regexp，對此規則不具代表性，I-PORT-01）。

| 案例 | year_produ 輸入 | JS golden 結果（workdt=2026-06 → cutoff=2011）| SQL 須等價 | 說明 |
|---|---|---|---|---|
| **TS-F099-PORT-001【PG】** | `'2010'` | 2010 < 2011 = true → **排除** | 排除 | 正常值 |
| **TS-F099-PORT-002【PG】** | `'2011'` | 2011 < 2011 = false → **保留**（cutoff 邊界）| 保留 | 邊界：等於 cutoff 不排除 |
| **TS-F099-PORT-003【PG】** | `null` | `?? '1900'` → 1900 < 2011 = true → **排除**（缺值退化）| 排除 | NULL 退化 1900 |
| **TS-F099-PORT-004【PG】** | `''`（空字串）| `parseInt('')=NaN` → false → **保留** | **保留** | ⚠️ 陷阱①：`NULLIF(REGEXP_REPLACE,'')` 誤排；正解保留 |
| **TS-F099-PORT-005【PG】** | `'N/A'`（純非數字）| `parseInt('N/A')=NaN` → false → **保留** | **保留** | ⚠️ 陷阱①同上 |
| **TS-F099-PORT-006【PG】** | `'200'`（3 碼短整數）| 200 < 2011 = true → **排除** | 排除 | 合法短整數 |
| **TS-F099-PORT-007【PG】** | `'1980abc'`（**前導數字**）| `parseInt('1980abc')=1980` → 1980 < 2011 = true → **排除** | **排除** | ⚠️ 陷阱②：`'^[0-9]+$'` strict 正則不 match，若實作走 ELSE NULL→退化 1900，結果雖同但語意有誤；須以前導數字解析守住（若 cutoff 不同即可現出破綻） |

> **OQ-F099-02 ✅ RESOLVED（2026-06-02 裁定 oracle = 現行 JS）**：PORT-001~007 全部以 `parseInt(year_produ ?? '1900', 10)` 為期望值基準。PORT-004/005/007 的期望值為「保留、保留、排除」，tdd 的 PG SQL 必須通過這三個案例才算等價。

---

## 四、NOLOAD — 不全載 heap（I-NOLOAD-01）

> **設計依據**：F099 AC-3 / 不變式 I-NOLOAD-01；記憶 feedback：大表 bare `find()` 必爆。

### TS-F099-NOLOAD-001：下推路徑無 `ob_pool_data` 全載（靜態 guard）
- **Related Requirement**: F099 AC-3 / I-NOLOAD-01
- **Test Type**: Regression | **Level**: Unit（原始碼靜態分析）| **需 Postgres**: 否
- **Given**: Stage 1 SQL 下推實作檔（`buildStage1Sql` 所在檔 + run/estimate 包裝呼叫處）
- **Then**: 下推路徑**不存在** `poolRepo.getMany()` / `poolRepo.find()` / `qb.getMany()`（對 `ob_pool_data` 全結果集載入 heap）；亦不存在 `queryRecentAssignedCustoNos` 式「全載 DISTINCT custo_no Set 進 heap」
- **And**: 去重改為 SQL anti-join（`NOT EXISTS` / `NOT IN` 子查詢），custo_no Set 不進 heap
- **設計說明**: grep 須限定下推路徑；現行 `stage1-filter-chain.ts` 之 `getMany()`（L408）在 P2 應被移除或不再被下推路徑呼叫

### TS-F099-NOLOAD-002：year-above 無應用層 filter 回退（無例外）
- **Related Requirement**: F099 AC-3 / AC-8（四規則全 SQL，year-above 無例外）
- **Test Type**: Regression | **Level**: Unit（靜態）| **需 Postgres**: 否
- **Given**: 下推實作檔
- **Then**: year-above 規則**不存在** `pool.filter(c => parseInt(c.year_produ ...))` 之應用層 filter；其數值化純以 SQL 表達（納入 `buildStage1Sql` core）
- **And**: 確認 `applyListNmSpecialDeletes` / `applyFraudWhiteboardDelete` 等應用層 filter 不再被下推路徑呼叫（可保留檔案供 JS oracle 測試用，但 production 下推路徑不依賴）

### TS-F099-NOLOAD-003（可選）【PG】：行為斷言 — 大 pool 不致 heap 暴增
- **Related Requirement**: F099 AC-3（行為佐證）
- **Test Type**: Positive | **Level**: PG Integration | **需 Postgres**: **是（可選）**
- **Given**: postgres-test 中 seed 較大量 `ob_pool_data`（如數萬筆）
- **When**: 跑 SQL 下推 run
- **Then**: 不透過 `getMany()` 全物化（以 spy / query log 斷言僅執行 `INSERT…SELECT`，無 SELECT-all-then-map）
- **註**: 行為斷言為輔；主護欄為 NOLOAD-001 靜態 guard。若 CI 資源吃緊，本案可標 optional / nightly

---

## 五、SQLG — 既有 SQL fragment 沿用與安全（AC-2）

> **設計依據**：F099 AC-2（欄位篩選 + month_cnt 沿用既有 SQL fragment，不重新實作）。

### TS-F099-SQLG-001：欄位篩選沿用 `buildStage1WhereConditions`（不重寫）
- **Related Requirement**: F099 AC-2 ①
- **Test Type**: Regression | **Level**: Unit | **需 Postgres**: 否
- **Then**: `buildStage1Sql` 之欄位篩選段呼叫既有 `buildStage1WhereConditions(list)`，path A（condition_payload）/ path B（legacy 5 欄）/ EMPTY_CONDITIONS skip 語意不變；不另寫一份欄位 WHERE（避免與 F050/F075/F091 drift）

### TS-F099-SQLG-002：month_cnt 沿用 `buildMonthCntFragment`（不重寫）
- **Related Requirement**: F099 AC-2 ②
- **Test Type**: Regression | **Level**: Unit | **需 Postgres**: 否
- **Then**: month_cnt 期別過濾呼叫既有 `buildMonthCntFragment(list)`；缺值 / interval≤0 / 空集合 → skip + warning 語意不變（對齊 EQ-004 / EQ-005 行為等價）

### TS-F099-SQLG-003：columnName allowlist 注入防禦沿用
- **Related Requirement**: F099（沿用 composer `SAFE_COLUMN_NAME_RE`）；NFR 安全
- **Test Type**: Negative | **Level**: Unit | **需 Postgres**: 否
- **Given**: condition_payload 含惡意 columnName（如 `"x; DROP TABLE"`）
- **Then**: 沿用 composer 既有 allowlist `^[a-z][a-z0-9_]{0,63}$` → skip + `INVALID_COLUMN_NAME` warning；下推 SQL 不含未參數化的使用者字串
- **And**: 去重 / 特例 `WHERE NOT(...)` 之所有使用者輸入（cutoffYear、assignday 視窗界）均以 params 綁定，非字串拼接

### TS-F099-SQLG-004：詐騙白牌 / 機車期中 / 期中小資 `WHERE NOT (...)` 觸發 / 不觸發兩態
- **Related Requirement**: F099 AC-4 / AC-6
- **Test Type**: Positive + Negative | **Level**: Unit（SQL 片段組裝）| **需 Postgres**: 否
- **Given**: list 觸發 / 不觸發各規則（`matchesSpecialRule` 仍 JS 回布林）
- **Then**: 觸發 → core 含對應 `WHERE NOT (...)` 子句；不觸發 → core **不含**該子句（trigger 為 JS 布林，SQL 只接收結果，C-1）
- **And**: 子句結構：fraud=`NOT (list_type='01' AND spec_name LIKE '%白牌%')`；motorcycle / xiaozi 數值比較用 `CAST(... AS numeric)`（結果等價由 §一 EQ-007/008 之 PG 真庫守）

---

## 六、GMT — guard 移轉（作廢 RGv2-005 / SDv2-*）

> **設計依據**：F099 AC-7；AD-E07-28 §6.2 測試移轉表。**關鍵：不可留「假綠」缺口**——移除 JS-pin guard 的同時，保護目標必須由等價測試 + special-rules 單元測試完整承接。

### TS-F099-GMT-001：作廢 `RGv2-005`（grep JS 原始碼保留 `includes('小資')`/`includes('白牌')`）
- **Related Requirement**: F099 AC-7；AD-E07-28 §6.2
- **Test Type**: Regression（測試移轉）| **Level**: Unit（靜態）| **需 Postgres**: 否
- **動作**: 移除 F091-test 之 `TS-F091-RGv2-005`（grep `stage1-filter-chain.ts` 含 `'小資'`/`'白牌'` 作為排除字串）。SQL 化後排除字串移至 SQL `LIKE '%白牌%'` / `LIKE '%小資%'`，原 grep 失去意義
- **替代保護**: ① §一 EQ-006/008（PG 真庫白牌 / 小資排除結果等價）；② `special-rules.spec.ts` 既有 `matchesSpecialRule` 單元測試（trigger 仍 JS，未 SQL 化）
- **防假綠**: 移除前須先確認 EQ-006 / EQ-008 已存在且綠燈，否則保護目標出現空窗

### TS-F099-GMT-002：作廢整套 `SDv2-*`（pin JS 特例 DELETE 實作）
- **Related Requirement**: F099 AC-7；AD-E07-28 §6.2「SDv2-*：改寫為 PG integration」
- **Test Type**: Regression（測試移轉）| **Level**: Unit/Integration | **需 Postgres**: 否（移轉動作本身）
- **動作**: F091-test 之 `TS-F091-SDv2-001~009`（pin JS `applyListNmSpecialDeletes` array filter 行為）之保護目標，改由 §一 EQ-006~011（PG 真庫 SQL 結果等價）承接。`applyListNmSpecialDeletes` 純函式若仍保留為 JS oracle，其既有單元測試可續存（作為 oracle 自我驗證），但**不再是月跑下推路徑的驗收依據**
- **映射表**（SDv2 → EQ）：

| 原 SDv2 案例（F091）| 保護目標 | F099 替代 |
|---|---|---|
| SDv2-001（詐騙白牌）| 白牌無條件排除 | EQ-006 |
| SDv2-002/003（機車期中 + 邊界）| motorcycle 排除 + 邊界 | EQ-007 |
| SDv2-004/005（期中小資 + 邊界）| xiaozi 排除 + 邊界 | EQ-008 |
| SDv2-006/007（年以上 + 非數字）| year-above + NaN/缺值 | EQ-009 / EQ-010 / §三 PORT |
| SDv2-008（期中機車雙重套用）| BR-1 不合併 | EQ-011 |
| SDv2-009（非觸發名單）| trigger 精確 | EQ-001 + special-rules.spec.ts |

### TS-F099-GMT-003：special-rules 既有單元測試續存（trigger 仍 JS，未 SQL 化）
- **Related Requirement**: F099 §5 C-1（trigger 判斷不 SQL 化）；AD-E07-28 §6.2
- **Test Type**: Regression | **Level**: Unit | **需 Postgres**: 否
- **Then**: `special-rules.spec.ts`（`matchesSpecialRule` / `deriveAppliedSpecialRules`）**維持綠燈**，不因 P2 移除或改動。理由：SQL 只接收「此 list 觸發哪些規則」的 JS 布林結果，trigger 關鍵字正確性（期中 / 機車 / 年以上 / 小資 / 白牌；禁 v1.0 mojibake 中結 / 強案 / 年資 / 滿）仍由此守
- **And**: F091-test 之 `TS-F091-RGv2-001`（grep 原始碼不含 v1.0 誤判字）若 pin 的是 `special-rules.ts`（trigger 仍 JS）→ **保留**；若 pin 的是 `stage1-filter-chain.ts` 之 SQL 化段落 → 隨 SQL 化調整

---

## 回歸基準清單（P2 改機制，以下既有測試須維持等價 / 更新）

| 既有 spec / 測試 | 為何是基準 | P2 後預期 |
|---|---|---|
| 現行 `stage1-filter-chain.ts` `executeStage1Chain`（JS 版）| **EQ 群組的 golden oracle**，本身語意不可動 | 保留為 oracle；下推路徑改呼叫 `buildStage1Sql`，但 JS 版續存供等價比對 |
| `stage1-filter-chain.integration.spec.ts`（better-sqlite3 DD/CH 群組）| 既有 Stage 1 chain 行為基準 | DD/CH 對「JS chain 自身」之斷言維持；**新增** PG 版 EQ 群組（不可沿用 better-sqlite3 跑 year-above / 數值 CAST）|
| `special-rules.spec.ts`（`matchesSpecialRule` / `deriveAppliedSpecialRules`）| trigger 仍 JS（C-1）| 全綠不變（GMT-003）|
| `stage1-query-composer.spec.ts`（欄位篩選 / allowlist）| `buildStage1WhereConditions` 沿用（AC-2）| 全綠不變（SQLG-001/003）|
| F091-test `SDv2-*` / `RGv2-005` | 被本 spec 明文作廢 | **移除**，保護目標移轉至 EQ + special-rules（GMT-001/002）|
| F092 dry-run≡run 一致性（CH-004 等）| estimate≡run 老坑 | 升級為 I-RUN-EST-01 共用 core 斷言（RUNEST-004）|
| F094 `ob_monthly_run_result` 寫入 / PK / FK CASCADE | 下推目標表 | 寫入方式由 JS `save()` → `INSERT…SELECT`；PK `(run_id,list_no,orgno,appl_no)` / 列內容不變（IDEM 群組守冪等）|

### IDEM — 冪等清理（I-IDEM-01，AC-9）

| 案例 | Given / When / Then | Level | 需 Postgres |
|---|---|---|---|
| **TS-F099-IDEM-001【PG】** | 同一 run_id 第二次下推前先 `DELETE FROM ob_monthly_run_result WHERE run_id=:runId` → 重跑後列集合與第一次**完全一致**（不重複、不殘留）| PG Integration | **是** |
| **TS-F099-IDEM-002【PG】** | run_id 對應 assignment_run 刪除 → FK ON DELETE CASCADE 自動清 result 列（驗證 0 殘留）| PG Integration | **是** |
| **TS-F099-IDEM-003【PG】** | 重觸發時 snapshot 同理清除（對齊 I-IDEM-01「snapshot 同理」）| PG Integration | **是** |

---

## 自動化就緒度

| 群組 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|
| EQ-001~014（JS↔SQL 等價）| 高（**強制 PG**）| PG Integration | postgres-test 容器；JS oracle vs SQL 路徑同庫同 seed，逐列 PK `toEqual` |
| RUNEST-001/004 | 高 | Unit | SQL core 同源結構斷言 |
| RUNEST-002/003 | 高（強制 PG）| PG Integration | 列數 == COUNT |
| PORT-001~007 | 高（**強制 PG，禁 SQLite**）| PG Integration | year-above 前導數字/空字串/非數字/null/cutoff 邊界；PORT-004/005/007 守三個 PG 實作陷阱 |
| NOLOAD-001/002 | 高 | Unit（靜態 grep）| 下推路徑無 `getMany()`/`find()`；year-above 無應用層 filter |
| NOLOAD-003 | 中（可選 PG）| PG Integration | 行為佐證；CI 吃緊可 nightly |
| IDEM-001~003 | 高（強制 PG）| PG Integration | 冪等 / CASCADE / snapshot |
| SQLG-001~004 | 高 | Unit | fragment 沿用 + 注入防禦 + WHERE NOT 兩態 |
| GMT-001~003 | 高 | Unit（靜態 / 移轉）| guard 作廢 + 移轉映射 |

### 需 Postgres 案例彙整（CI 決策連動）

**強制需 Postgres（26 案例）**：EQ-001~014（14）、PORT-001~007（7）、RUNEST-002/003（2）、IDEM-001~003（3）＝合計 **26**（其中 NOLOAD-003 可選 PG）。

> **CI 落實要求**：沿用 `docker-compose.test.yml` 之 `postgres-test`（postgres:16-alpine，5433:5432，`cdmp_test`）服務 + F038/F075/M01/F098 既有 Test Container 慣例。CI 必須能起 Postgres（OQ-F099-01 ✅ RESOLVED），否則 EQ / PORT / RUNEST(PG) / IDEM 群組（26 案例）無法執行，等於 **P2 DoD 無法驗收**。

---

## 九、風險與待決（彙整至 risks-and-gaps.md）

| ID | 風險 / 待決 | 等級 | 處置 |
|---|---|---|---|
| RISK-F099-001 | SQL 版與 JS 版結果不等價（特例 DELETE / 去重 NULL / year-above CAST）→ prod silent 漏案或誤排 | 高 | EQ 群組（14 案例，PG 真庫，逐列 PK 比對）為 P2 DoD；未全綠阻擋上線 |
| RISK-F099-002 | `NOT IN` 含 NULL 子查詢「全部不 match」陷阱 → 去重失效、全名單意外保留 | 高 | EQ-012 NULL custo_no 樣本攔截；tdd 優先用 `NOT EXISTS`/anti-join（A-1）|
| RISK-F099-003 | year-above 空字串 / 非數字 / 前導數字之 PG 寫法易錯：(1) `NULLIF(REGEXP_REPLACE,'')` 把 `''`/`'N/A'` 誤排（JS 應保留）；(2) `'^[0-9]+$'` strict 正則使前導數字 `'1980abc'` 變 NULL，若 cutoff 不同即錯（JS `parseInt('1980abc')=1980`）| 高 | **OQ-F099-02 ✅ RESOLVED（oracle=JS）**；PORT-004/005/007 守三個陷阱；正解使用前導數字解析（`SUBSTRING FROM '^[0-9]+'`），NULL 特判退化 1900 |
| RISK-F099-004 | 移除 RGv2-005 / SDv2-* 後出現「假綠」空窗（保護目標無人接手）| 中 | GMT-001/002 規定「移除前先確認 EQ 對應案例已綠」；移轉映射表明列 SDv2→EQ |
| RISK-F099-005 | 等價測試誤用 better-sqlite3（沿用既有 integration harness）→ year-above / CAST 在 SQLite 不具代表性、假綠 | 高 | I-PORT-01 強制 PG；本文件明示 EQ/PORT/IDEM/RUNEST(PG) 禁 SQLite |
| RISK-F099-006 | estimate≡run 在 SQL 化過程再度分叉（F049 老坑重演）| 高 | RUNEST-001 結構斷言 + RUNEST-002/003 列數==COUNT |
| RISK-F099-007 | vitest 不檢型別 → `buildStage1Sql` 型別錯誤潛伏至 prod build（US-144 500 教訓）| 中 | 實作後強制 `tsc --noEmit -p tsconfig.build.json` |
| RISK-F099-008 | ~~INSERT 欄位 `o.assignday`：`ob_pool_data` 無此欄，來源不明~~ | ~~中~~ | **OQ-F099-03 ✅ RESOLVED（2026-06-02）**：`ob_pool_data` 確無 assignday；現行 JS pipeline 從不寫 assignday → `ob_monthly_run_result.assignday` 恆 NULL；下推 SELECT 直接寫 NULL（不 join pdl）。測試須斷言 `assignday IS NULL`（EQ 共用骨架步驟 4）。|
| OQ-F099-01 | CI 是否起 Postgres | ✅ **RESOLVED（已決）** | 必起；沿用 postgres-test 容器 |
| OQ-F099-02 | year-above 缺值 / 空字串 / 非數字 / 前導數字之 golden 取「現行 JS」或「SP」| ✅ **RESOLVED（2026-06-02）** | **裁定 oracle = 現行 JS**（`parseInt(year_produ ?? '1900', 10)`）：`null`→排除（1900）、`''`/`'N/A'`→保留（NaN）、`'1980abc'`→排除（1980）。PORT-001~007 期望值固定，不再以 SP 調整。|
| OQ-F099-03 | 下推 `INSERT…SELECT` 之 `assignday` 來源欄位（ob_pool_data 無此欄）| ✅ **RESOLVED（2026-06-02）** | **裁定：assignday 恆寫 NULL**（ob_pool_data 無此欄，JS pipeline 亦不寫）；EQ 共用骨架步驟 4 斷言 `assignday IS NULL`。|

---

## tdd-implementation 注意事項（交接）

1. **EQ 群組是 P2 驗收紅線**：14 案例（PG 真庫、逐列 PK `toEqual`）全綠才可上線。**以現行 JS `executeStage1Chain` 為唯一 oracle**，禁止用「SQL 自我斷言預期值」取代與 JS 的逐 list 比對（SQL 與 JS 同錯則假綠）。
2. **JS 版必須保留為 oracle**：P2 改下推路徑呼叫 `buildStage1Sql`，但 `executeStage1Chain` JS 版**不可刪除**——EQ 群組需要它當 golden。可標註「僅供等價測試 / 不再是月跑路徑」。
3. **year-above 對齊現行 JS（OQ-F099-02 ✅ RESOLVED，oracle=JS）**：`null`→排除（退化 1900）、`''`/`'N/A'`→**保留**（NaN）、**`'1980abc'`→1980→排除（前導數字解析）**。三個陷阱：(1) 勿用 `NULLIF(REGEXP_REPLACE(…,'[^0-9]','','g'),'')::int` — 把 `''`/`'N/A'` 誤排為排除；(2) 勿用 `'^[0-9]+$'` strict 正則 — `'1980abc'` 不 match 走 ELSE NULL，若退化 1900 則排除巧合對，但 cutoff 不同時可現出破綻（PORT-007 即是此陷阱的偵測案）；(3) 正解：`NULLIF(SUBSTRING(year_produ FROM '^[0-9]+'), '')::int`（前導數字解析）+ NULL 特判退化 1900（`CASE WHEN year_produ IS NULL THEN 1900 ELSE NULLIF(SUBSTRING(year_produ FROM '^[0-9]+'), '')::int END < :cutoff`）。**PORT-004/005/007 三案是具體驗證此三個陷阱的測試，全綠才算實作正確**。
4. **去重用 `NOT EXISTS`/anti-join，不要 `NOT IN`**（含 NULL 子查詢陷阱，A-1）；去重視窗上界 `MIN(MAX(assignday), workdt−1)` 語意不變（C-2），只是計算移入 SQL；custo_no=NULL 不被去重誤排（EQ-012）。
5. **I-RUN-EST-01：單一 `buildStage1Sql`，run / estimate 只差最外層包裝**；勿為 run / estimate 各寫一份 WHERE（F049 老坑）。
6. **I-NOLOAD-01：下推路徑禁 `getMany()`/`find()` 全載**（含 year-above 無例外）；現行 `stage1-filter-chain.ts` L408 `qb.getMany()` 須移出下推路徑。
7. **等價測試禁 better-sqlite3**：EQ / PORT / RUNEST(PG) / IDEM 一律 postgres-test 容器（I-PORT-01）；既有 `stage1-filter-chain.integration.spec.ts` 的 better-sqlite3 harness 不適用於 year-above / 數值 CAST。
8. **作廢 RGv2-005 / SDv2-* 前先確認 EQ 對應案例綠燈**（GMT-001/002），避免保護目標空窗。`special-rules.spec.ts` 維持綠燈（trigger 仍 JS，C-1）。
9. **冪等：下推實質寫入前先 `DELETE FROM ob_monthly_run_result WHERE run_id=:runId`**（I-IDEM-01）；FK CASCADE 為輔。
10. **所有使用者 / 動態輸入以 params 綁定**（cutoffYear、assignday 界、columnName 沿用 allowlist），SQL 不字串拼接（SQLG-003）。
11. **assignday 恆寫 NULL（OQ-F099-03 ✅ RESOLVED）**：`ob_pool_data` 無 assignday 欄，現行 JS pipeline 亦不寫；下推 `INSERT…SELECT` 直接在 SELECT 清單寫 `NULL AS assignday`（或省略該欄讓 default 生效）。EQ 共用骨架步驟 4 必須斷言 `assignday IS NULL`。
12. **實作後跑 `tsc --noEmit -p tsconfig.build.json`**（vitest 不檢型別）。
13. **seed 模擬真實 contract**：`list_nm` 真實繁體中文觸發字、`year_produ` 含 null/空/非數字、`assignday` yyyyMMdd 8 碼、NUMERIC 欄位 `string｜null`（記憶 feedback_mock_real_system_contract）。
