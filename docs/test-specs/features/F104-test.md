---
type: test-design-feature
feature_id: F104
feature_name: Stage 2 計分引擎 AD-E07-10-L 全欄對齊 legacy SP（借新還舊關鍵字 + CUS_SEX range 與分流 + 縣市名 LEFT3 + per-card default + SALES_STS 關鍵字）
priority: P0-MVP
related_spec: /docs/specs/features/F104-stage2-ad-e07-10-l-full-legacy-alignment.md
source_ad: /docs/specs/architecture-spec.md（AD-E07-10-L v4.0 §4063–4162 + AD-E07-32/33/34）
source_stories: [US-159, US-160, US-161, US-162, US-163]
spec_version: "1.0"
last_updated: 2026-06-24
blocked_by: [F103]
related: [F100, F101, F102, F064, F067]
---

# F104：Stage 2 計分引擎 AD-E07-10-L 全欄對齊 legacy SP — 測試設計

> ⚠️ **範圍**：本文件為測試設計（test design），是 tdd-implementation 的**可執行真值來源**。**不含** production code、測試實作碼（`.spec.ts`）、migration、entity 定義 — 由下一棒 tdd-implementation 落地。本棒採「test design 文件」模式（非直接寫 red 測試骨架），與既有 [F103-test.md](F103-test.md) 慣例一致。
>
> **驗收紅線（Definition of Done）**：
> 1. **EQ 群組**（BR-F104-15 / I-SCORE-EQ-01 延伸）：JS `computeScore` ↔ PG `buildStage2ScoreExpr` 生成 SQL，相同輸入下 score 完全相等（誤差 = 0）= 必須全綠，未過不得上線。§8 場景矩陣全覆蓋。
> 2. **cus_sex NULL-safe cast**（BR-F104-13）：髒值 `'C'`/`'D'` 不得讓計分 SQL 拋例外（裸 `::int` 會掛掉整支月跑）= **高嚴重度行為紅線**。
> 3. **兩 default 分離**（BR-F104-13a）：計分欄 default=`3` 與分流 gating default=`'1'` 兩路徑一致、不混用 = EQ 子項必測。
> 4. **per-card default 逐格**（AD-E07-33 矩陣）：每個 (column, cardType) 格子 + 「不啟用」格 = 覆蓋紅線。
> 5. **`pnpm test` 全綠 + `tsc --noEmit -p tsconfig.build.json` 零錯誤**（AC-17）= 回歸門檻（vitest 不做型別檢查，必跑）。
> 6. **F103 既有測試在新語意下通過或已更新**（AC-17）= 回歸保護（§十四更新清單）。
>
> **前置斷言（architect 交辦驗證點，已由 test-designer 連 DB 查證 RESOLVED）**：
> - **EDUCAT_BACK score row 型別 = level2（range）✅**：dev `SELECT column_name, COUNT(*) FILTER (WHERE level1 IS NOT NULL AND level1<>'') AS cat_rows, COUNT(*) FILTER (WHERE level2_s IS NOT NULL) AS range_rows FROM ob_levelcard_score GROUP BY column_name` → EDUCAT_BACK = **0 category / 29 range**。level1 全空、level2_s/level2_e 為 `'01'..'08'`/`'99'` 補零字串。**kind = range（字串 BETWEEN）確立**，不需改 category。`'08' BETWEEN '07' AND '99'` 等以字串 lexical 比較。
> - **三縣市欄 = category ✅**：HPOST_NUM_NM=47 cat/0 range、CPOST_NUM_NM=24 cat/0 range、CO_NUM_NM=71 cat/0 range → 全 category，比對 `LEFT(value,3) = level1`（縣市-only 3 字）。
> - **CUS_SEX = range ✅**：0 cat / 6 range（驗證 F104 category→range 修正方向正確）。
> - **new cc 欄存在 ✅**：dev `information_schema.columns` 確認 `cus_sex`/`carea_no1`/`carea_no2`/`cellular`/`hpost_city`/`cpost_city`/`co_city`/`date_of_birth`/`education_code` 皆存在（m301 已套）。
> - **cus_sex 髒值分佈 ✅**：dev `GROUP BY cus_sex` → `'1'`(184萬)/`'2'`(166萬)/`'3'`(8萬)/空(3.7萬)/`'8'`(6)/`'C'`(5)/`'9'`(4)/`'D'`(4)/`'4'`/`'A'`/`'B'`(各1)。**裸 `::int` 對 `'C'` 必拋例外 → BR-F104-13 NULL-safe cast 為硬性要求（已實證）**。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F104 spec](../../specs/features/F104-stage2-ad-e07-10-l-full-legacy-alignment.md)（§4 AC-1~17 / §5 legacy 真語意表 / §6 BR-F104-01~16 / §8 EQ 矩陣）+ architecture-spec.md AD-E07-10-L v4.0（§4063–4162）+ AD-E07-32/33/34 + [F103-test.md](F103-test.md)（沿用 harness）+ `stage2to4-sql-builder.ts`（`resolveColumnSource`/`buildStage2ScoreExpr`）+ `assignment-run-pipeline.service.ts`（`resolveColumnValue` ~L1137 / `computeScore` ~L1086 / `calcAgeYears` ~L87 / `CustomerCoreRow` ~L61）|
| QA / Tester | 本文件（§二 EQ DoD + §四 cus_sex 分流 + §五 NULL-safe cast + §六 per-card default 矩陣 + §十二 202606 驗收 + §十三 回歸）|
| CI/CD Owner | 本文件「自動化就緒度」；F104 pg.spec 需與 F098/F099/F100/F101/F102/F103 序列執行（共用 cdmp_test DB） |
| Product Analyst / 業務 | §十二 UPGRADE — 202606 重跑 tier spread 定性驗收 + F067 差異報告（AC-13/14/15/16） |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| **驗收紅線** | ① JS↔SQL EQ 逐列等價（PG 真庫）② cus_sex NULL-safe cast（髒值不拋例外）③ 兩 default 分離 ④ per-card default 逐格 ⑤ tsc gate ⑥ F103 不退化 |
| **主要測試層** | ① **PG Integration（強制 Postgres）**：EQ 逐列等價、cus_sex 髒值 SQL 不拋例外、五欄分流、縣市 LEFT3 命中/未命中/default、per-card default 各 card、AGE >100、SALES_STS/PROJECT_TP 關鍵字。② **Unit（純函式 / 靜態）**：JS `resolveColumnValue` 各欄分支、`isCorporate` helper、`calcAgeYears` >100 守門、`resolveColumnSource` 生成 SQL 字串靜態斷言（含 `'借新還舊'`/`'中古車商'`/`LEFT(...,3)`/safe-cast pattern）。③ **Integration（SQLite + JS oracle）**：cc=null 各欄 default。 |
| **等價基準（Oracle）** | **EQ DoD**：相同 pool + cc + arCap fixture，JS `computeScore` 與 PG `buildStage2ScoreExpr` 生成 SQL 之 score 整數值完全相等（差異=0）。Oracle 為**手算**（fixture 約束兩邊可獨立驗算），禁止「用 PG 跑完當 JS oracle」（同錯假綠）。 |
| **簽章變更（AD-E07-32）** | `resolveColumnSource(columnName, cardType)` + `resolveColumnValue(pool, columnName, cc, arCap, cardType)`；`computeScore` 已有 cardType 直接傳入。測試須以新簽章呼叫；舊呼叫端漏補由 tsc gate（REG）攔截。 |
| **CustomerCoreRow 介面變更（US-161 contract）** | 欄名由 F103 之 `gender`/`home_phone`/`contact_phone`/`mobile_phone`/`residential_zip`/`mailing_zip`/`company_zip` 改為 F104 之 `cus_sex`/`carea_no1`/`carea_no2`/`cellular`/`hpost_city`/`cpost_city`/`co_city`（`date_of_birth`/`education_code` 不變）。所有 cc fixture + prefetch SELECT 欄位 + PG 建表 DDL 須同步改名 → tsc gate 攔截漏改。 |
| **Mock / Seed 注意** | 單元測試直接傳 cc/arCap fixture（`CustomerCoreRow | null`），無需建 customer_core 表。PG EQ 測試走真庫（PG-only gate，與 F100~F103 pattern 一致，`pgPortReachable()` + `ensurePg(ctx)`）。AGE 測試固定 `today` 基準（PG `CAST('YYYY-MM-DD' AS DATE)` 替換 `CURRENT_DATE` 或同一 today 注入 calcAgeYears）。 |
| **CI 序列執行** | F104 pg.spec 與 F098/F099/F100/F101/F102/F103 共用 cdmp_test DB，**必須序列執行**，禁並行。 |
| **型別 gate** | 實作後必跑 `tsc --noEmit -p tsconfig.build.json`（feedback_vitest_no_typecheck 教訓；CustomerCoreRow 改名 + 簽章加 cardType 是高漏改風險點）。 |

### 案例群組與自動化就緒度

| 群組 | 案例數 | 測試層 | 需 Postgres | 自動化適合度 | 說明 |
|------|--------|--------|-------------|--------------|------|
| KW（關鍵字修正：PROJECT_TP 借新還舊 + SALES_STS 中古車商，AC-1/AC-2） | 6 | Unit（靜態）+ PG Integration | 部分 | 高 | SQL 含 `'%借新還舊%'`/`'中古車商'`；舊 `'%專案%'`/`'經銷商'` 全清；JS 對稱 |
| SEX（CUS_SEX range 比對，AC-3） | 4 | Unit + PG Integration | 部分 | 高 | category→range；safe-cast；計分 default=3；'1'/'2'/'3'/空各落區間 |
| BRANCH（五欄 isCorp 分流，US-160 / AC-6/7/8） | 10 | Unit + PG Integration | 部分 | 高 | 個人(1/2)取自身屬性、法人(3)取 0/default、空/NULL→個人；presence 1/0 |
| SAFE（cus_sex NULL-safe cast，BR-F104-13，**高嚴重度**） | 6 | PG Integration + Unit | **是** | 高 | 髒值 'C'/'D'/'8'/空 計分+分流 SQL 不拋例外；兩 default 分離兩路徑一致 |
| AGE100（AGE >100 排除 + 法人 0，AC-9） | 5 | Unit + PG Integration | 部分 | 高 | age=100(取值)/101(0)/−1(0)/date NULL(0)/法人(0) |
| EDU（EDUCAT_BACK 補零 + range 字串 BETWEEN + per-card default，AC-10） | 7 | Unit + PG Integration | 部分 | 高 | RIGHT('0'||code,2)；個人/法人；S→'02'/S5→'08'/E/E5→'02'；range 字串比對 |
| CITY（三縣市欄 LEFT3 + per-card default，US-162 / AC-11/12） | 10 | Unit + PG Integration | 部分 | 高 | 縣市+區 6 字→LEFT3 命中 3 字 level1；未命中；缺值 per-card default 逐格 |
| PCD（LIST_MONTH / LOAN_RATE per-card default，AC-4/AC-5） | 8 | Unit + PG Integration | 部分 | 高 | LIST_MONTH H/S→25,E/E5→12,M/HM 不啟用；LOAN_RATE S5→77,E/E5→12,其他→0 |
| EQ（JS↔SQL 逐列等價 DoD，BR-F104-15 / §8 矩陣） | 12 | PG Integration | **是** | 高 | **DoD 門檻**；§8 全場景；含個人/法人/空/髒值/>100/per-card/縣市/兩 default 一致 |
| SIG（簽章 + 介面變更，AD-E07-32 / US-161） | 4 | Unit（靜態）+ 型別 | 否 | 高 | resolveColumnSource/Value 加 cardType；CustomerCoreRow 新欄名；MAPPED 集合 |
| UPGRADE（202606 重跑驗收，AC-13/14/15/16） | 5 | PG Integration + 人工 | **是** | 中（查詢自動、驗收定性） | card_level ≥3 種；tier 含 T1/T2；個人分流欄 10 筆抽樣手算；異常根因 |
| REG（回歸保護，AC-17） | 5 | PG Integration + Unit | **是** | 高 | F103/F100/F101/F102 不退化；F103 既有測試更新；tsc gate |
| **合計** | **82** | — | **約 48 案例需 Postgres** | — | KW6 + SEX4 + BRANCH10 + SAFE6 + AGE100/5 + EDU7 + CITY10 + PCD8 + EQ12 + SIG4 + UPGRADE5 + REG5 |

---

## 一、KW — 關鍵字修正（AC-1 / AC-2，BR-F104-01 / BR-F104-02）

> **設計依據**：F104 spec §4 AC-1/AC-2；BR-F104-01/02；§13 OQ-159-01 RESOLVED（SALES_STS CASE 在 OBLEVELCARD SP 就地完成、key=`'中古車商'`）。AD-E07-10-L v4.0 line 4084/4087。
> **現況缺陷（被測 contract）**：`stage2to4-sql-builder.ts` L87 仍 `'%專案%'`；L126 仍 `'經銷商' THEN 'UCD'`；`resolveColumnValue` L1150 仍 `includes('專案')`、L1161 仍 `'經銷商'`。F104 須全面替換。

### TS-F104-KW-001：PG — `resolveColumnSource('PROJECT_TP', cardType)` 生成 SQL 含 `'%借新還舊%'`，不含 `'%專案%'`
- **Related Requirement**：AC-1 / BR-F104-01
- **Test Type**：Positive / Unit（靜態）
- **Preconditions**：`resolveColumnSource` 已加 cardType 簽章。
- **Steps**：
  1. 呼叫 `resolveColumnSource('PROJECT_TP', 'H')`
  2. 斷言 `expr` 含 `"o.spec_name LIKE '%借新還舊%'"`、`"THEN 'A'"`、`"COALESCE(o.spec_tp, '01')"`
  3. 斷言 `expr` **不含** `'%專案%'`
- **Expected Result**：表達式為 `CASE WHEN o.spec_name LIKE '%借新還舊%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END`（或等效）；舊關鍵字全清

### TS-F104-KW-002：JS — `resolveColumnValue` PROJECT_TP 以 `spec_name.includes('借新還舊')` 判斷
- **Related Requirement**：AC-1 / BR-F104-01
- **Test Type**：Positive / Unit
- **Steps**：
  1. `resolveColumnValue({...pool, spec_name:'借新還舊專案'}, 'PROJECT_TP', null, null, 'H')` → 回 `'A'`
  2. `resolveColumnValue({...pool, spec_name:'汽車貸款專案', spec_tp:'02'}, 'PROJECT_TP', null, null, 'H')` → 回 `'02'`（含「專案」但不含「借新還舊」→ 不再命中）
  3. 靜態掃描：`resolveColumnValue` 原始碼不含 `includes('專案')`
- **Expected Result**：僅「借新還舊」命中 'A'；「專案」不再特殊處理；舊邏輯清除

### TS-F104-KW-003：PG — `resolveColumnSource('SALES_STS', cardType)` CASE 含 `'中古車商' THEN 'UCD'`，不含 `'經銷商'`
- **Related Requirement**：AC-2 / BR-F104-02
- **Test Type**：Positive / Unit（靜態）
- **Steps**：
  1. 呼叫 `resolveColumnSource('SALES_STS', 'H')`
  2. 斷言 `expr` 含 `"WHEN '中古車商' THEN 'UCD'"`、`"WHEN 'AGENT' THEN 'AGENT'"`、`"ELSE 'HFC'"`
  3. 斷言 `expr` **不含** `'經銷商'`
- **Expected Result**：UCD 分支 key 為 `'中古車商'`；ELSE 為 `'HFC'`（涵蓋 `'和潤'`）；舊 `'經銷商'` 全清

### TS-F104-KW-004：JS — `resolveColumnValue` SALES_STS `sales_sts_na='中古車商'` → 'UCD'
- **Related Requirement**：AC-2 / BR-F104-02
- **Test Type**：Positive / Unit
- **Steps**：
  1. `sales_sts_na='AGENT'` → 'AGENT'；`='中古車商'` → 'UCD'；`='和潤'` → 'HFC'；`='DIRECT'` → 'HFC'
  2. 靜態掃描：`resolveColumnValue` 原始碼不含 `'經銷商'`
- **Expected Result**：四值對應正確；舊 `'經銷商'` 字串清除

### TS-F104-KW-005：EQ — PROJECT_TP `spec_name='借新還舊'` 命中 'A'，JS=PG
- **Related Requirement**：AC-1 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：H 卡；PROJECT_TP score row level1='A' 有分；level1='01'/'02' 各有分。
- **Steps**：seed pool spec_name='借新還舊專案案'；PG pushdown 取 pgScore；JS computeScore 取 jsScore；斷言相等且 PROJECT_TP 貢獻 = 'A' 列之分
- **Expected Result**：兩路徑 PROJECT_TP 取 'A'，score 相等

### TS-F104-KW-006：EQ — SALES_STS `sales_sts_na='中古車商'`（UCD）三值，JS=PG
- **Related Requirement**：AC-2 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：H 卡；SALES_STS score row level1='AGENT'/'UCD'/'HFC' 各有分。
- **Steps**：三 pool fixture（sales_sts_na='AGENT'/'中古車商'/'DIRECT'）；各斷言 jsScore===pgScore，且 '中古車商' 案件計入 'UCD' 列之分
- **Expected Result**：三案件兩路徑 score 相等；'中古車商'→UCD 計分正確

---

## 二、SEX — CUS_SEX range 比對（AC-3，BR-F104-03）

> **設計依據**：F104 spec §4 AC-3；BR-F104-03；§13（CUS_SEX = 6 range rows 已查證）；AD line 4081。
> **現況缺陷**：`resolveColumnSource` L100 為 `{ kind:'category', expr:"COALESCE(cc.gender,'3')" }`；`resolveColumnValue` L1174 為 `cc?.gender ?? '3'`。F104 改 range + safe-cast + 計分 default=3 + 欄名 cus_sex。

### TS-F104-SEX-001：PG — `resolveColumnSource('CUS_SEX', cardType)` 回 `kind='range'` + safe-cast + COALESCE(...,3)
- **Related Requirement**：AC-3 / BR-F104-03 / BR-F104-13
- **Test Type**：Positive / Unit（靜態）
- **Steps**：
  1. 呼叫 `resolveColumnSource('CUS_SEX', 'H')`
  2. 斷言 `kind === 'range'`
  3. 斷言 `expr` 含 NULL-safe cast pattern（如 `cc.cus_sex ~ '^[0-9]+$'` 或等效）且 `COALESCE(..., 3)`（計分 default=3）
  4. 斷言 `expr` **不含** 裸 `cc.cus_sex::int`、不含 `cc.gender`
- **Expected Result**：CUS_SEX kind 為 range；safe-cast；計分 default 3；不用裸 cast、不用 gender

### TS-F104-SEX-002：JS — `resolveColumnValue` CUS_SEX safe-cast，空/髒值/null → 3
- **Related Requirement**：AC-3 / BR-F104-13 / BR-F104-13a
- **Test Type**：Boundary / Unit
- **Steps**：
  1. cc.cus_sex='1' → 回 `1`（number，range 比對用）
  2. cc.cus_sex='' → 回 `3`；cc.cus_sex='C' → 回 `3`；cc=null → 回 `3`
- **Expected Result**：合法數值取值；空/非數值/null 一律 → 計分 default 3（`Number.isInteger` 守門後 `?? 3`）

### TS-F104-SEX-003：PG EQ — cus_sex='1'/'2'/'3' 落不同 range 區間，JS=PG
- **Related Requirement**：AC-3 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：H 卡；CUS_SEX range score rows（如 `[1,1]→分A`、`[2,2]→分B`、`[3,3]→分C`）。
- **Steps**：三 cc fixture cus_sex='1'/'2'/'3'；各斷言 jsScore===pgScore，命中對應區間
- **Expected Result**：三值各落對應 range 區間取分，兩路徑相等

### TS-F104-SEX-004：PG EQ — cus_sex 缺值（cc=null）→ 計分 default 3 落區間，JS=PG
- **Related Requirement**：AC-3 / BR-F104-13a
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：CUS_SEX range score row `[3,3]→分C`；pool custo_no 無對應 cc。
- **Steps**：PG（cc LEFT JOIN 無命中→safe-cast NULL→COALESCE 3）；JS（cc=null→3）；斷言相等且命中 `[3,3]` 分
- **Expected Result**：兩路徑 cus_sex 計分值=3、命中 `[3,3]`，score 相等

---

## 三、BRANCH — 五欄 isCorp 分流（US-160，AC-6/7/8，BR-F104-04/05/06）

> **設計依據**：F104 spec §4 AC-6/7/8；BR-F104-04/05/06；§13（空→個人 RESOLVED）；AD line 4088–4091/4100–4103；legacy SP（test-designer 已 UTF-16LE 查證 `CUS_SEX NOT IN ('1','2')` 純字串 gating）。
> **建議**：抽 `isCorporate(cc)` helper（PG `<safe_int>(COALESCE(NULLIF(cc.cus_sex,''),'1')) NOT IN (1,2)`，三值邏輯須 `COALESCE(...,法人)`，見 RISK-F104-02；JS `const g=Number(cc?.cus_sex ?? ''); return !(Number.isInteger(g) && (g===1||g===2))`，空/NaN→法人 except 空字串特例→個人，須與 PG 對齊）。
> **⚠️ 分流 gating default='1'（個人，僅針對「空/NULL」），與 CUS_SEX 計分 default=3 分離（BR-F104-13a）— 本群組必證兩 default 不混用。髒值非空（'C'）→ 法人（OQ-TDS-F104-01）。**
>
> **⚠️ per-card 啟用差異（legacy SP 已查證，§十五逐 card 表）**：五欄並非每張卡全啟用。關鍵差異 — **E5 僅啟用 CAREA_NO2（無 CAREA_NO1），且唯一啟用 CELLULAR**；H 無 AGE/EDUCAT_BACK；M/HM 無 CAREA presence 以外的 LIST_MONTH/LOAN_RATE。BRANCH/EQ 案例選卡時須對齊 §十五啟用集（如 CELLULAR 僅能在 E5 卡測 EQ）。

### TS-F104-BRANCH-001：個人（cus_sex='1'）CAREA_NO1 有區碼 → 1
- **Related Requirement**：AC-6 / BR-F104-05
- **Test Type**：Positive / Unit
- **Steps**：`resolveColumnValue(pool, 'CAREA_NO1', { cus_sex:'1', carea_no1:'02', ...null }, null, 'H')`
- **Expected Result**：回 `1`（個人 + carea_no1 非空）

### TS-F104-BRANCH-002：個人（cus_sex='2'）CAREA_NO1 區碼空字串 → 0
- **Related Requirement**：AC-6 / BR-F104-05
- **Test Type**：Boundary / Unit
- **Steps**：cc={ cus_sex:'2', carea_no1:'' } → CAREA_NO1
- **Expected Result**：回 `0`（presence = `IS NOT NULL AND <>''`，空字串 → 0）

### TS-F104-BRANCH-003：個人 CAREA_NO2 / CELLULAR presence 1/0
- **Related Requirement**：AC-6 / AC-7 / BR-F104-05
- **Test Type**：Positive/Boundary / Unit
- **Steps**：cc={ cus_sex:'1', carea_no2:'02', cellular:'0912' } → CAREA_NO2=1、CELLULAR=1；carea_no2=null/cellular='' → 0
- **Expected Result**：有值→1；null/空→0；CELLULAR 讀 `cc.cellular`（非舊 `mobile_phone`）

### TS-F104-BRANCH-004：法人（cus_sex='3'）CAREA_NO1/NO2/CELLULAR → 0
- **Related Requirement**：AC-8 / BR-F104-06
- **Test Type**：Negative / Unit
- **Steps**：cc={ cus_sex:'3', carea_no1:'02', carea_no2:'02', cellular:'0912' }（即使有值）→ 三欄
- **Expected Result**：三欄全 `0`（法人分支恆 0，不查保證人，不讀自身屬性）

### TS-F104-BRANCH-005：法人（cus_sex='3')AGE → 0、EDUCAT_BACK → per-card default
- **Related Requirement**：AC-8 / BR-F104-06/07/08
- **Test Type**：Negative / Unit
- **Steps**：cc={ cus_sex:'3', date_of_birth:'1990-01-01', education_code:'5' }；卡='S' → AGE / EDUCAT_BACK
- **Expected Result**：AGE → `0`（法人）；EDUCAT_BACK → `'02'`（S 卡 per-card default，不取自身 education_code）

### TS-F104-BRANCH-006：空 cus_sex（'') → 個人分支，取自身屬性（gating default='1'）
- **Related Requirement**：AC-8 / BR-F104-04/06 / §13 RESOLVED
- **Test Type**：Boundary / Unit
- **Steps**：cc={ cus_sex:'', carea_no1:'02', date_of_birth:<age 36>, education_code:'5' }；卡='S'
- **Expected Result**：CAREA_NO1 → `1`（個人取自身）；AGE → 36（個人）；EDUCAT_BACK → `'05'`（個人補零，非 default）；**證明空→個人，非法人取 0**

### TS-F104-BRANCH-007：NULL cus_sex（cc=null 整列）→ 個人分支
- **Related Requirement**：AC-8 / BR-F104-04
- **Test Type**：Boundary / Unit
- **Steps**：cc=null → 五欄
- **Expected Result**：gating 視為個人（'1'），但 cc=null 故自身屬性皆缺 → CAREA/CELLULAR=0、AGE=0、EDUCAT=per-card default（注意：個人分支但無資料 → presence 0 / age 0 / educat 缺值 default；與「法人取 0」殊途同 0，但 gating 走向不同，需以「空字串 cc.cus_sex（BRANCH-006）」案例區分兩 default）

### TS-F104-BRANCH-008：髒值 cus_sex（'C'）gating → 法人分支（legacy `NOT IN ('1','2')`，SP 已查證）
- **Related Requirement**：AC-8 / BR-F104-13a / legacy H L103（SP 查證 RESOLVED）
- **Test Type**：Boundary / Unit
- **Steps**：cc={ cus_sex:'C', carea_no1:'02' }；卡='H' → CAREA_NO1
- **Expected Result**：回 `0`（**法人分支**）。**OQ-TDS-F104-01 RESOLVED（test-designer SP 查證）**：legacy `#CASE_CUS` 先 `ISNULL(CUS_SEX,'')` 把 NULL→''，再 `''→'1'`；非空髒值（'C'）保留 'C' → 分流判斷式 `CUS_SEX NOT IN ('1','2')`（**字串 IN 比對，非 int cast**）→ 'C' NOT IN('1','2')=TRUE → **法人**。CDMP 引擎以 `<safe_int>(COALESCE(NULLIF('C',''),'1'))`=safe_int('C')=NULL → `NULL NOT IN(1,2)` 在 PG 為 UNKNOWN（非 TRUE）→ **須以 `COALESCE(<safe_int>(...) NOT IN(1,2), TRUE)` 或等效，使髒值落法人**，與 legacy 一致。⚠️ tdd 落地須確認 PG NULL 三值邏輯：`NULL NOT IN (1,2)` → NULL（非 TRUE），故法人判斷式須 `IS DISTINCT FROM` 或顯式 `COALESCE(...,法人)`；JS 對稱：`Number.isInteger(g) && (g===1||g===2)` 為個人，否則（含 NaN/null）法人。**此為 EQ 硬約束：PG 與 JS 對 'C' 皆須判法人**（SAFE-006 驗等價）。

### TS-F104-BRANCH-009：PG EQ — 個人客戶五欄全有值，JS=PG
- **Related Requirement**：US-160 / BR-F104-15 / §8 矩陣第 1 列
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：S 卡（含 AGE/EDUCAT_BACK/CAREA_NO1/CAREA_NO2）；cc cus_sex='1'、carea_no1='02'、carea_no2='03'、date_of_birth(age 36)、education_code='5'。
- **Steps**：PG pushdown / JS computeScore；斷言相等；presence=1、age=36、educat='05' 補零各命中
- **Expected Result**：五欄取自身屬性，兩路徑 score 相等

### TS-F104-BRANCH-010：PG EQ — 法人客戶五欄，JS=PG（§8 矩陣第 2 列）
- **Related Requirement**：AC-8 / BR-F104-15
- **Test Type**：Negative / PG Integration（EQ DoD）
- **Preconditions**：S 卡；cc cus_sex='3'，五欄即使有值。
- **Steps**：PG / JS；斷言相等；CAREA/AGE=0、EDUCAT=per-card default '02'
- **Expected Result**：法人五欄全 0/default，兩路徑相等；不查保證人

---

## 四、SAFE — cus_sex NULL-safe cast（BR-F104-13，**高嚴重度**）

> **設計依據**：F104 spec §6 BR-F104-13/13a；§13（dev 髒值已查證 'C'/'D'/'8'/'9'/空）；AD-E07-34；§11 測試覆蓋 (c)/(d)。
> **核心**：裸 `cc.cus_sex::int` 對 'C' 拋 `invalid input syntax for type integer` → **整支月跑 SQL 失敗**。本群組為「不拋例外」行為紅線。

### TS-F104-SAFE-001：PG — cus_sex='C' 計分 SQL 不拋例外（CUS_SEX range 計分）
- **Related Requirement**：BR-F104-13 / **高嚴重度**
- **Test Type**：Boundary / PG Integration
- **Preconditions**：H 卡含 CUS_SEX（range）；seed cc cus_sex='C'。
- **Steps**：
  1. `await expect(pushdown(L)).resolves.not.toThrow()`
  2. 查 score：safe-cast 'C'→NULL→COALESCE 3 → 命中 `[3,3]` 區間（若有）
- **Expected Result**：**SQL 不拋例外**；'C' 計分值=3；月跑繼續

### TS-F104-SAFE-002：PG — cus_sex='C' 五欄分流 SQL 不拋例外（gating）
- **Related Requirement**：BR-F104-13 / BR-F104-13a
- **Test Type**：Boundary / PG Integration
- **Preconditions**：S 卡含 CAREA_NO1/AGE/EDUCAT_BACK；seed cc cus_sex='C'、carea_no1='02'。
- **Steps**：`await expect(pushdown(L)).resolves.not.toThrow()`；查 score
- **Expected Result**：分流 gating SQL（`COALESCE(NULLIF(cc.cus_sex,''),'1')` + safe-cast）不拋例外；月跑繼續（取值依釘定語意，見 BRANCH-008）

### TS-F104-SAFE-003：PG — 混合髒值批次（'C'/'D'/'8'/'9'/空/'1'/'3'）整批計分不拋例外
- **Related Requirement**：BR-F104-13
- **Test Type**：Boundary / PG Integration
- **Preconditions**：seed 7 個 case，cc cus_sex 分別為 'C'/'D'/'8'/'9'/''/'1'/'3'。
- **Steps**：單次 pushdown 全 7 案；`resolves.not.toThrow()`；7 案件全出現於結果（不掉列）
- **Expected Result**：整批不拋例外；7 案件全在結果集；髒值案件 score 走 default 路徑

### TS-F104-SAFE-004：Unit — JS isCorporate / safe-cast 對髒值不回 NaN 污染
- **Related Requirement**：BR-F104-13
- **Test Type**：Boundary / Unit
- **Steps**：JS safe-cast helper（或內聯）對 'C'/'D'/'8'/'9'/'' 各回 null/守門後值；CUS_SEX 計分對髒值回 3
- **Expected Result**：`Number.isInteger(Number('C'))`=false → null → 計分 3；不產生 NaN 進 range 比對（NaN 比較恆 false 會誤判）

### TS-F104-SAFE-005：EQ — cus_sex='C' 計分 default=3 兩路徑一致（§8 矩陣第 4 列）
- **Related Requirement**：BR-F104-13 / BR-F104-13a / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：CUS_SEX range `[3,3]→分C`；cc cus_sex='C'。
- **Steps**：PG（safe-cast 'C'→NULL→3）/ JS（'C'→3）；斷言 jsScore===pgScore
- **Expected Result**：兩路徑 CUS_SEX 計分值=3、命中 `[3,3]`，score 相等

### TS-F104-SAFE-006：EQ — cus_sex='C' 分流 gating 兩路徑走向一致
- **Related Requirement**：BR-F104-13a / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S 卡含 CAREA_NO1；cc cus_sex='C'、carea_no1='02'。
- **Steps**：PG / JS 各計 CAREA_NO1 貢獻；斷言 jsScore===pgScore
- **Expected Result**：兩路徑對 'C' 之分流走向（個人 vs 法人）**完全一致**（無論釘定為何，PG=JS 是硬性 DoD）；CAREA_NO1 取值兩路徑相同

---

## 五、AGE100 — AGE >100 排除 + 法人 0（AC-9，BR-F104-07）

> **設計依據**：F104 spec §4 AC-9；BR-F104-07；legacy S L89（>100→0）；AD line 4091。
> **現況缺陷**：`calcAgeYears`（L87）僅 `Math.max(0, age)`，**無 >100 守門**；`resolveColumnValue` AGE（L1176）無 isCorp 分流。F104 須加 >100→0 + 分流。

### TS-F104-AGE100-001：calcAgeYears age=100 → 100（邊界內，取值）
- **Related Requirement**：AC-9 / BR-F104-07
- **Test Type**：Boundary / Unit
- **Steps**：`calcAgeYears(<date_of_birth 使 age=100>, today)`
- **Expected Result**：回 `100`（100 不排除；`>100` 才排除）

### TS-F104-AGE100-002：AGE age=101 → 0（>100 排除）
- **Related Requirement**：AC-9 / BR-F104-07
- **Test Type**：Boundary / Unit
- **Steps**：個人 cc（cus_sex='1'，date_of_birth 使 age=101）→ `resolveColumnValue(pool,'AGE',cc,null,'S')`
- **Expected Result**：回 `0`（age 101 > 100 → 0）。**注意守門落點**：若 `calcAgeYears` 加 >100→0，則 calcAgeYears(101歲)→0；若守門在 resolveColumnValue，則 calcAgeYears→101 後 resolveColumnValue 判 >100→0。tdd 落地擇一，EQ 須與 PG `>100 OR <0 → 0` 一致。

### TS-F104-AGE100-003：AGE age<0（date_of_birth 未來日）→ 0
- **Related Requirement**：AC-9 / BR-F104-07
- **Test Type**：Boundary / Unit
- **Steps**：個人 cc，date_of_birth=未來日（如 today+1 年）
- **Expected Result**：回 `0`（age<0 → 0；現行 `Math.max(0,age)` 已保此，但須與 PG `<0→0` EQ）

### TS-F104-AGE100-004：AGE date_of_birth NULL → 0；法人（cus_sex='3'）→ 0
- **Related Requirement**：AC-9 / BR-F104-06/07
- **Test Type**：Boundary / Unit
- **Steps**：(a) cc={cus_sex:'1', date_of_birth:null} → 0；(b) cc={cus_sex:'3', date_of_birth:<age 50>} → 0
- **Expected Result**：兩者皆 `0`（NULL 生日 / 法人）

### TS-F104-AGE100-005：PG EQ — age=100/101/−1 三邊界，JS=PG（§8 矩陣 AGE 列）
- **Related Requirement**：AC-9 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S 卡含 AGE；AGE range score row 涵蓋 100（如 `[90,120]→分`）；個人 cc。固定 today 基準。
- **Steps**：三 cc fixture（date_of_birth 使 age=100/101/−1）；PG（`EXTRACT(YEAR FROM age())` + >100/<0 守門）/ JS（calcAgeYears + >100 守門）；斷言各相等
- **Expected Result**：age=100→取值命中區間、age=101→0、age=−1→0，三邊界兩路徑相等

---

## 六、EDU — EDUCAT_BACK 補零 + range 字串 BETWEEN + per-card default（AC-10，BR-F104-08）

> **設計依據**：F104 spec §4 AC-10；BR-F104-08；§13（S5 default='08'）；AD line 4092。
> **✅ 前置斷言 RESOLVED（test-designer 連 DB）**：EDUCAT_BACK = **0 category / 29 range** → kind=range（字串 BETWEEN）。impl 不需改 category；比對端走 range 分支但值為補零字串 `'02'`/`'08'`，PG range 比對須以**字串** lexical（非數值）— 詳見 §risks RISK-F104-01（PG range 分支現以 `Number(level2_s)` 轉數值，補零字串 '08' Number→8 仍可數值比對，但 lexical vs 數值在 '01'..'08' 範圍恰好等價，須測 '99' 上界確認）。
> **現況缺陷**：`resolveColumnSource` EDUCAT_BACK（L109）為 `{kind:'category', expr:"COALESCE(cc.education_code,'')"}`；無補零、無 per-card default、無分流。

### TS-F104-EDU-001：個人 education_code='5' → RIGHT('0'||'5',2)='05'
- **Related Requirement**：AC-10 / BR-F104-08
- **Test Type**：Positive / Unit
- **Steps**：cc={cus_sex:'1', education_code:'5'} → `resolveColumnValue(pool,'EDUCAT_BACK',cc,null,'S')`
- **Expected Result**：回 `'05'`（單碼補零）

### TS-F104-EDU-002：個人 education_code='12' → '12'（兩碼不補）
- **Related Requirement**：AC-10 / BR-F104-08
- **Test Type**：Positive / Unit
- **Steps**：cc={cus_sex:'1', education_code:'12'} → EDUCAT_BACK
- **Expected Result**：回 `'12'`（RIGHT('0'||'12',2)='12'）

### TS-F104-EDU-003：個人 education_code 缺值 → per-card default（S→'02'）
- **Related Requirement**：AC-10 / BR-F104-08
- **Test Type**：Boundary / Unit
- **Steps**：cc={cus_sex:'1', education_code:null}；卡='S' → EDUCAT_BACK
- **Expected Result**：回 `'02'`（S 卡個人缺值 default）

### TS-F104-EDU-004：per-card default 逐格 — S→'02'、S5→'08'、E→'02'、E5→'02'
- **Related Requirement**：AC-10 / BR-F104-08 / AD-E07-33
- **Test Type**：Boundary / Unit
- **Steps**：cc={cus_sex:'1', education_code:null}，分別以 cardType='S'/'S5'/'E'/'E5' 呼叫
- **Expected Result**：'02'/'08'/'02'/'02'（**S5='08' 為關鍵，legacy S5 L82；L81 '07' 為廢除版**）

### TS-F104-EDU-005：法人（cus_sex='3'）→ per-card default（不取自身 education_code）
- **Related Requirement**：AC-8 / AC-10 / BR-F104-06/08
- **Test Type**：Negative / Unit
- **Steps**：cc={cus_sex:'3', education_code:'12'}；卡='S5' → EDUCAT_BACK
- **Expected Result**：回 `'08'`（S5 法人 default，忽略 education_code='12'）

### TS-F104-EDU-006：PG EQ — 個人 educat 補零命中 range 字串區間，JS=PG
- **Related Requirement**：AC-10 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：S 卡含 EDUCAT_BACK；EDUCAT_BACK range score row（如 `level2_s='05', level2_e='05'→分` 與 `level2_s='08', level2_e='99'→分`）；cc education_code='5'。
- **Steps**：PG（`RIGHT('0'||cc.education_code,2)`='05' 落 `['05','05']`）/ JS（'05' 落同區間）；斷言相等
- **Expected Result**：'05' 命中 `['05','05']` 列，兩路徑 score 相等

### TS-F104-EDU-007：PG EQ — S5 缺值 default '08' 命中 range 上界區間（'08' BETWEEN '08' AND '99'）
- **Related Requirement**：AC-10 / BR-F104-08 / BR-F104-15 / §13（'07'→'99' 與 '08'→'99' range row 已查證存在）
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S5 卡；EDUCAT_BACK range score row `level2_s='08', level2_e='99'→分X`；cc cus_sex='1'、education_code=null。
- **Steps**：PG（default '08' 落 `['08','99']`）/ JS（default '08' 落同區間）；斷言相等
- **Expected Result**：default '08' 命中 `['08','99']` 取分X，兩路徑相等；**驗證 lexical vs 數值 range 在補零字串下一致**（'08'/'99' Number→8/99 與字串 '08'/'99' 比較同結果）

---

## 七、CITY — 三縣市欄 LEFT3 + per-card default（US-162，AC-11/12，BR-F104-09/10/11）

> **設計依據**：F104 spec §4 AC-11/12；BR-F104-09/10/11；§13（city level1 全縣市-only 3 字、cc 為「縣市+區」6 字、三縣市欄=category 已查證）；AD line 4093–4095/4098。
> **現況缺陷**：`resolveColumnSource` HPOST/CPOST/CO_NUM_NM（L116–121）讀 `cc.residential_zip`/`mailing_zip`/`company_zip`、無 LEFT3、無 per-card default。F104 改讀 `cc.hpost_city`/`cpost_city`/`co_city` + `LEFT(...,3)` + per-card default。
> **⚠️ per-card 啟用（§13 RESOLVED）**：H/S/E 不計分任何縣市欄；HPOST=S5/M/HM；CPOST=M/HM；CO_NUM=S5/E5/M/HM。「不啟用」card 不需 default、引擎不查。

### TS-F104-CITY-001：HPOST 縣市+區 6 字 → LEFT3 取縣市
- **Related Requirement**：AC-11 / BR-F104-10
- **Test Type**：Positive / Unit
- **Steps**：cc={hpost_city:'臺北市中正區'}；卡='M' → `resolveColumnValue(pool,'HPOST_NUM_NM',cc,null,'M')`
- **Expected Result**：回 `'臺北市'`（slice(0,3)）

### TS-F104-CITY-002：HPOST 命中 — '臺北市中正區' LEFT3 = level1 '臺北市'（PG EQ）
- **Related Requirement**：AC-11 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：M 卡含 HPOST_NUM_NM（category）；HPOST score row level1='臺北市'→分；cc hpost_city='臺北市中正區'。
- **Steps**：PG（`LEFT(COALESCE(NULLIF(cc.hpost_city,''),'臺北市'),3)`='臺北市'）/ JS（slice(0,3)='臺北市'）；斷言相等命中 level1
- **Expected Result**：LEFT3 命中 '臺北市'，兩路徑取分相等

### TS-F104-CITY-003：HPOST 未命中 — '南投縣中寮鄉' LEFT3='南投縣'，無對應 level1 → 0
- **Related Requirement**：AC-11 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：HPOST score row 僅 level1='臺北市'；cc hpost_city='南投縣中寮鄉'。
- **Steps**：PG / JS 各取 '南投縣'，無對應 score row → +0；斷言相等
- **Expected Result**：'南投縣' 不命中，兩路徑 HPOST 貢獻 0，score 相等

### TS-F104-CITY-004：HPOST 缺值 per-card default — S5→'花蓮縣'、M/HM→'臺北市'
- **Related Requirement**：AC-12 / BR-F104-11 / AD-E07-33
- **Test Type**：Boundary / Unit
- **Steps**：cc={hpost_city:null}，cardType='S5'/'M'/'HM' 各呼叫 HPOST_NUM_NM
- **Expected Result**：'花蓮縣'/'臺北市'/'臺北市'（LEFT3 後仍 3 字，default 本身即 3 字）

### TS-F104-CITY-005：CPOST 缺值 per-card default — M/HM→'臺南市'
- **Related Requirement**：AC-12 / BR-F104-11
- **Test Type**：Boundary / Unit
- **Steps**：cc={cpost_city:null}，cardType='M'/'HM' → CPOST_NUM_NM
- **Expected Result**：'臺南市'（M/HM 唯一 default）

### TS-F104-CITY-006：CO_NUM 缺值 per-card default — S5/E5→'金門縣'、M/HM→'高雄市'
- **Related Requirement**：AC-12 / BR-F104-11 / AD-E07-33
- **Test Type**：Boundary / Unit
- **Steps**：cc={co_city:null}，cardType='S5'/'E5'/'M'/'HM' → CO_NUM_NM
- **Expected Result**：'金門縣'/'金門縣'/'高雄市'/'高雄市'

### TS-F104-CITY-007：cc 整列 NULL（無對應客戶）→ 縣市欄走 per-card default
- **Related Requirement**：AC-12 / BR-F104-11
- **Test Type**：Boundary / Unit
- **Steps**：cc=null，cardType='M' → HPOST/CPOST/CO_NUM
- **Expected Result**：'臺北市'/'臺南市'/'高雄市'（cc=null 等同缺值，套 default）

### TS-F104-CITY-008：PG — `resolveColumnSource('HPOST_NUM_NM','M')` expr 含 `LEFT(...,3)` + 'cc.hpost_city' + default '臺北市'
- **Related Requirement**：AC-11/12 / BR-F104-09/10/11
- **Test Type**：Positive / Unit（靜態）
- **Steps**：
  1. 呼叫 `resolveColumnSource('HPOST_NUM_NM','M')`
  2. 斷言 `expr` 含 `LEFT(`、`cc.hpost_city`、`'臺北市'`
  3. 斷言 `expr` **不含** `residential_zip`
- **Expected Result**：表達式 `LEFT(COALESCE(NULLIF(cc.hpost_city,''),'臺北市'),3)`（或等效）；舊 zip 欄清除

### TS-F104-CITY-009：PG EQ — M 卡三縣市欄全有值各命中，JS=PG
- **Related Requirement**：US-162 / BR-F104-15 / §8 矩陣縣市命中列
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：M 卡含三縣市欄；各 score row level1='臺北市'/'臺南市'/'高雄市'→分；cc hpost_city='臺北市X區'、cpost_city='臺南市Y區'、co_city='高雄市Z區'。
- **Steps**：PG / JS；斷言相等，三欄各 LEFT3 命中
- **Expected Result**：三欄 LEFT3 命中對應 level1，兩路徑 score 相等

### TS-F104-CITY-010：PG EQ — M 卡三縣市欄全缺值走 default，JS=PG
- **Related Requirement**：AC-12 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：M 卡；cc 三縣市欄全 null；score row level1='臺北市'/'臺南市'/'高雄市'→分。
- **Steps**：PG / JS 各走 default '臺北市'/'臺南市'/'高雄市'；斷言相等命中
- **Expected Result**：三欄 default 命中對應 level1，兩路徑 score 相等

---

## 八、PCD — LIST_MONTH / LOAN_RATE per-card default（AC-4/AC-5，BR-F104-12）

> **設計依據**：F104 spec §4 AC-4/AC-5；BR-F104-12；AD-E07-33（LIST_MONTH H/S→25,E/E5→12,M/HM 不啟用；LOAN_RATE S5→77,E/E5→12,其他→0,M/HM 不啟用）；AD line 4085/4086。
> **現況缺陷**：`resolveColumnSource` LIST_MONTH（L82）固定 `COALESCE(o.month_cnt, 25)`；LOAN_RATE（L129）固定 `COALESCE(...,0)`。F104 改 per-card default（需 cardType）。

### TS-F104-PCD-001：LIST_MONTH 缺值 default — H→25、S→25
- **Related Requirement**：AC-4 / BR-F104-12
- **Test Type**：Boundary / Unit
- **Steps**：pool month_cnt=null，cardType='H'/'S' → LIST_MONTH
- **Expected Result**：25 / 25

### TS-F104-PCD-002：LIST_MONTH 缺值 default — E→12、E5→12
- **Related Requirement**：AC-4 / BR-F104-12
- **Test Type**：Boundary / Unit
- **Steps**：pool month_cnt=null，cardType='E'/'E5' → LIST_MONTH
- **Expected Result**：12 / 12

### TS-F104-PCD-003：LIST_MONTH 有值 → 取值（不套 default）
- **Related Requirement**：AC-4
- **Test Type**：Positive / Unit
- **Steps**：pool month_cnt=6，cardType='E' → LIST_MONTH
- **Expected Result**：6（有值優先）

### TS-F104-PCD-004：LOAN_RATE 缺值 default — S5→77
- **Related Requirement**：AC-5 / BR-F104-12
- **Test Type**：Boundary / Unit
- **Steps**：pool loan_rate=null，cardType='S5' → LOAN_RATE
- **Expected Result**：77

### TS-F104-PCD-005：LOAN_RATE 缺值 default — E→12、E5→12
- **Related Requirement**：AC-5 / BR-F104-12
- **Test Type**：Boundary / Unit
- **Steps**：pool loan_rate=null，cardType='E'/'E5' → LOAN_RATE
- **Expected Result**：12 / 12

### TS-F104-PCD-006：LOAN_RATE 缺值 default — 其他 card（如 H）→ 0
- **Related Requirement**：AC-5 / BR-F104-12
- **Test Type**：Boundary / Unit
- **Steps**：pool loan_rate=null，cardType='H' → LOAN_RATE
- **Expected Result**：0（其他 card default 0）

### TS-F104-PCD-007：PG EQ — LIST_MONTH 各 card default，JS=PG
- **Related Requirement**：AC-4 / BR-F104-15 / §8 矩陣 LIST_MONTH 列
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：H 卡與 E 卡各 LIST_MONTH range score row 涵蓋 25 與 12；pool month_cnt=null。
- **Steps**：H 卡（default 25）/ E 卡（default 12）各 PG/JS；斷言相等命中對應區間
- **Expected Result**：H→25、E→12 各落區間，兩路徑相等

### TS-F104-PCD-008：PG EQ — LOAN_RATE S5→77 / E→12 default，JS=PG
- **Related Requirement**：AC-5 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S5 卡（LOAN_RATE range 涵蓋 77）/ E 卡（涵蓋 12）；pool loan_rate=null。
- **Steps**：PG/JS 各取 default 77/12；斷言相等
- **Expected Result**：S5→77、E→12 各落區間，兩路徑相等

---

## 九、EQ — JS↔SQL 逐列等價 DoD（BR-F104-15 / §8 矩陣，綜合場景）

> **設計依據**：F104 spec §8 EQ 場景矩陣（11 列）；BR-F104-15；沿用 F103 pg.spec 之 `assertEq(applNo,listNo,cc,arCap)` harness（PG pushdown vs JS computeScore，斷言整數相等）。
> **Oracle**：手算（fixture 約束）。本群組為「綜合多欄」EQ 大場景；單欄 EQ 已散落於 §一~八各群組對應 EQ 案例，本群組補「跨欄交互 + §8 矩陣完整對位」。

### TS-F104-EQ-001：個人客戶 cus_sex='1' 全屬性有值（§8 矩陣第 1 列）
- **Related Requirement**：§8 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：S 卡含 CUS_SEX/AGE/CAREA_NO1/CAREA_NO2/EDUCAT_BACK + LIST_MONTH；cc cus_sex='1'、carea_no1/no2 有值、date_of_birth(age 36)、education_code='5'。
- **Steps**：PG/JS；斷言 jsScore===pgScore
- **Expected Result**：取自身屬性（presence=1、age=36、educat='05'）、CUS_SEX 計分=1，兩路徑相等

### TS-F104-EQ-002：法人客戶 cus_sex='3'（§8 矩陣第 2 列）
- **Related Requirement**：§8 / BR-F104-15
- **Test Type**：Negative / PG Integration（EQ DoD）
- **Preconditions**：同 EQ-001 卡；cc cus_sex='3'，五欄即使有值。
- **Steps**：PG/JS；斷言相等
- **Expected Result**：五欄 0/default、CUS_SEX 計分=3，兩路徑相等

### TS-F104-EQ-003：空/NULL cus_sex → 個人分支（§8 矩陣第 3 列，兩 default 分離）
- **Related Requirement**：§8 / BR-F104-13a / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S 卡；cc cus_sex=''、carea_no1='02'、date_of_birth(age 36)、education_code='5'。
- **Steps**：PG/JS；斷言相等
- **Expected Result**：五欄取自身屬性（**非 0**，證 gating default='1' 個人）；CUS_SEX 計分欄 default=3（區間計分）；兩路徑一致

### TS-F104-EQ-004：髒值 cus_sex='C'（§8 矩陣第 4 列，計分+分流兩路徑一致）
- **Related Requirement**：§8 / BR-F104-13/13a / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S 卡含 CUS_SEX + CAREA_NO1；cc cus_sex='C'、carea_no1='02'。
- **Steps**：PG/JS；斷言相等且 SQL 不拋例外
- **Expected Result**：計分→3、分流→釘定走向（PG=JS）；不拋例外；兩路徑 score 完全相等

### TS-F104-EQ-005：AGE=101 邊界（§8 矩陣 AGE 列）
- **Related Requirement**：§8 / AC-9 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S 卡 AGE range 涵蓋 90-120；個人 cc age=101。
- **Steps**：PG（>100→0）/ JS（>100→0）；斷言相等
- **Expected Result**：age 101→0（不命中 90-120），兩路徑相等

### TS-F104-EQ-006：EDUCAT_BACK 缺值各 card（§8 矩陣 EDUCAT 列）
- **Related Requirement**：§8 / AC-10 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：S 卡（default '02'）與 S5 卡（default '08'）各 EDUCAT range；個人 cc education_code=null。
- **Steps**：S 卡（'02'）/ S5 卡（'08'）各 PG/JS；斷言相等
- **Expected Result**：S→'02'、S5→'08' 各命中，兩路徑相等

### TS-F104-EQ-007：縣市命中（§8 矩陣縣市命中列）
- **Related Requirement**：§8 / AC-11 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：M 卡 HPOST level1='臺北市'；cc hpost_city='臺北市中正區'。
- **Steps**：PG/JS LEFT3 命中；斷言相等
- **Expected Result**：'臺北市' 命中，兩路徑相等

### TS-F104-EQ-008：縣市缺值各 card default（§8 矩陣縣市 default 列）
- **Related Requirement**：§8 / AC-12 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Preconditions**：M 卡三縣市欄；cc 全 null；level1 涵蓋 '臺北市'/'臺南市'/'高雄市'。
- **Steps**：PG/JS 各 default；斷言相等
- **Expected Result**：M→'臺北市'/'臺南市'/'高雄市' 命中，兩路徑相等

### TS-F104-EQ-009：PROJECT_TP 含「借新還舊」（§8 矩陣 PROJECT_TP 列）
- **Related Requirement**：§8 / AC-1 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Steps**：見 KW-005（本列為 §8 對位編號）；H 卡 spec_name='借新還舊'；斷言相等取 'A'
- **Expected Result**：兩路徑 PROJECT_TP='A'，score 相等

### TS-F104-EQ-010：SALES_STS='中古車商'（§8 矩陣 SALES_STS 列）
- **Related Requirement**：§8 / AC-2 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Steps**：見 KW-006；斷言相等取 'UCD'
- **Expected Result**：兩路徑 SALES_STS='UCD'，score 相等

### TS-F104-EQ-011：LIST_MONTH / LOAN_RATE 缺值各 card（§8 矩陣末列）
- **Related Requirement**：§8 / AC-4/5 / BR-F104-15
- **Test Type**：Boundary / PG Integration（EQ DoD）
- **Steps**：見 PCD-007/PCD-008；H/S=25、E/E5=12 / S5=77、E/E5=12 各 PG/JS 斷言相等
- **Expected Result**：各 card default 命中，兩路徑相等

### TS-F104-EQ-012：綜合大場景 — S5 卡全欄交互（cus_sex/age/educat/loan_rate/co_num/hpost）
- **Related Requirement**：§8 全列交互 / BR-F104-15
- **Test Type**：Positive / PG Integration（EQ DoD）
- **Preconditions**：S5 卡 active 欄含 AGE/CAREA_NO1/CAREA_NO2/CAR_YEAR/EDUCAT_BACK/LOAN_RATE/CO_NUM_NM/HPOST_NUM_NM（§13 S5 啟用集）；個人 cc 全屬性有值；各欄 score row 設手算目標分。
- **Steps**：PG pushdown / JS computeScore；斷言 jsScore===pgScore
- **Expected Result**：S5 卡多欄交互（含 per-card default 'S5' 的 educat '08'、co_num '金門縣'、loan_rate 77、hpost '花蓮縣' 等於 default 與有值混合），兩路徑 score 完全相等（DoD 核心大場景）

---

## 十、SIG — 簽章 + 介面變更（AD-E07-32 / US-161）

> **設計依據**：F104 spec §6 BR-F104-14；§10 OQ-1；AD-E07-32（signature 加 cardType）；§3 cc 新欄 contract。

### TS-F104-SIG-001：`resolveColumnSource(columnName, cardType)` 雙參數簽章
- **Related Requirement**：BR-F104-14 / AD-E07-32
- **Test Type**：Positive / Unit（型別 + 行為）
- **Steps**：以 `resolveColumnSource('LIST_MONTH', 'E')` 呼叫不報型別錯；回傳 default 反映 cardType（E→12 區別於 H→25）
- **Expected Result**：簽章接受 cardType；per-card default 依 cardType 不同

### TS-F104-SIG-002：`resolveColumnValue(pool, columnName, cc, arCap, cardType)` 五參數簽章
- **Related Requirement**：BR-F104-14 / AD-E07-32
- **Test Type**：Positive / Unit（型別 + 行為）
- **Steps**：以新簽章呼叫；EDUCAT_BACK 缺值依 cardType 回不同 default
- **Expected Result**：簽章接受 cardType；行為依 cardType 分歧

### TS-F104-SIG-003：CustomerCoreRow 介面新欄名（cus_sex/carea_no1/carea_no2/cellular/hpost_city/cpost_city/co_city）
- **Related Requirement**：US-161 / §3 contract
- **Test Type**：Positive / Unit（型別靜態）
- **Steps**：建構 cc fixture 使用新欄名；`tsc` 不報錯；舊欄名（gender/home_phone/...）不再存在於介面
- **Expected Result**：CustomerCoreRow 含 7 新欄 + date_of_birth + education_code；舊 7 欄名移除（prefetch SELECT 同步改）

### TS-F104-SIG-004：MAPPED_SCORING_COLUMNS / CUSTOMER_CORE_COLUMNS 集合不變（15 + 9 欄）
- **Related Requirement**：BR-F104-14（公開集合不受影響）
- **Test Type**：Positive / Unit（靜態）
- **Steps**：斷言 MAPPED_SCORING_COLUMNS 仍含 15 欄（含 ADD_UN_CAPITAL，不含 COMMISSION）；CUSTOMER_CORE_COLUMNS 仍 9 欄
- **Expected Result**：欄位集合穩定（F104 改取值邏輯非集合成員）

---

## 十一、（保留）

---

## 十二、UPGRADE — 202606 重跑驗收（AC-13/14/15/16）

> **設計依據**：F104 spec §4 US-163（AC-13~16）；§9 NFR-005；§11 驗收。
> **執行前置條件**：dev 環境，US-159/160/162 引擎修正已 commit、US-161 cc 新欄已載入（m301）、TEST_* 污染欄已清。

### TS-F104-UPGR-001：202606 重跑無錯誤 + card_level ≥ 3 種值（AC-13）
- **Related Requirement**：AC-13
- **Test Type**：Positive / PG Integration（人工驗收）
- **Steps**：
  1. 觸發 dev 202606 月跑（含 F104 修正）；確認無錯誤完成
  2. `SELECT card_level, COUNT(*) FROM ob_monthly_run_result WHERE run_id='<202606>' AND ... GROUP BY card_level`（card_type H/S）
- **Expected Result**：月跑無錯誤；card_level distinct ≥ 3（不全為 D）；若 ≤2 啟動 AC-15

### TS-F104-UPGR-002：tier spread 含 T1/T2（AC-14，定性）
- **Related Requirement**：AC-14 / OQ-158-01
- **Test Type**：Positive / PG Integration（定性）
- **Steps**：`GROUP BY tier_level`（H/S）；確認含 T1 與 T2；T3 佔比相較 F103 前改善
- **Expected Result**：含 T1/T2；方向與 legacy 一致；不設精確百分比門檻

### TS-F104-UPGR-003：個人客戶分流欄 10 筆抽樣手算（AC-16）
- **Related Requirement**：AC-16
- **Test Type**：Positive / PG Integration（人工抽樣）
- **Steps**：
  1. 抽 10 筆個人客戶（cus_sex IN ('1','2')）在 H 名單之月跑結果
  2. 手算 CAREA_NO1/NO2/CELLULAR 計分（presence 1/0）
  3. 比對 `ob_monthly_run_result.score` 對應貢獻
- **Expected Result**：手算值與 DB score 一致（±0）；確認 cus_sex=1/2 不再使三欄取 0（推翻舊 default 行為）

### TS-F104-UPGR-004：cus_sex 髒值案件月跑不中斷（BR-F104-13 prod 驗證）
- **Related Requirement**：AC-13 / BR-F104-13
- **Test Type**：Boundary / PG Integration（人工）
- **Steps**：確認 dev 202606 pool 含 cus_sex 髒值客戶（'C'/'D'/'8' 等）；月跑完成無 `invalid input syntax for type integer` 錯誤
- **Expected Result**：含髒值客戶之名單照常計分；無 cast 例外中斷

### TS-F104-UPGR-005：仍異常時本輪根因（AC-15，不推延）
- **Related Requirement**：AC-15
- **Test Type**：Boundary / PG Integration（異常時執行）
- **Steps**：若 AC-13/14 未達標 → 量測 cc 新欄 NULL 率（cus_sex/carea_no1/hpost_city）+ 比對 §5 映射；判定根因（引擎映射 vs ETL NULL 率 vs score row 閾值）
- **Expected Result**：本輪內判定根因 + 行動，記錄於 implementation-log，不推延至 F105

---

## 十三、REG — 回歸保護（AC-17）

> **設計依據**：F104 spec §4 AC-17；§11 回歸；F103/F100/F101/F102 test spec。

### TS-F104-REG-001：F103 既有測試在新語意下通過或已更新（見 §十四清單）
- **Related Requirement**：AC-17
- **Test Type**：Regression / PG Integration + Unit
- **Steps**：執行 F103 spec（`stage2to4-score-source-f103.spec.ts` + `.pg.spec.ts`）；確認須更新者已更新、其餘通過
- **Expected Result**：§十四「須更新」案例已改；「須保通過」案例綠燈

### TS-F104-REG-002：F100/F101/F102 計分相關測試不退化
- **Related Requirement**：AC-17
- **Test Type**：Regression / PG Integration
- **Steps**：執行 F100（52 案）/ F101（50 案）/ F102（55 案）套件
- **Expected Result**：全綠；F104 改 score 取值但 tier 分組邏輯不破壞（F101/F102 seed 固定 tier 不受計分取值改變影響）

### TS-F104-REG-003：簽章變更 + CustomerCoreRow 改名後 tsc 零錯誤
- **Related Requirement**：AC-17 / BR-F104-14
- **Test Type**：Regression / Unit（型別）
- **Steps**：`tsc --noEmit -p tsconfig.build.json`
- **Expected Result**：零型別錯誤；`resolveColumnSource`/`resolveColumnValue` 加 cardType 後所有呼叫端更新；CustomerCoreRow 改名後所有 fixture/prefetch 更新（高漏改風險，必跑）

### TS-F104-REG-004：`pnpm test` 全套通過（含 F098~F104 序列）
- **Related Requirement**：AC-17
- **Test Type**：Regression / 全套
- **Steps**：`pnpm test`（pg.spec 系列序列執行）
- **Expected Result**：全綠；F098/F099/F100/F101/F102/F103/F104 pg.spec 序列完成

### TS-F104-REG-005：static 掃描 — 舊關鍵字/欄名全清
- **Related Requirement**：AC-1/AC-2 / BR-F104-09
- **Test Type**：Regression / Unit（靜態，fs + regex，非僅 Grep）
- **Steps**：以 fs 讀 `stage2to4-sql-builder.ts` + `assignment-run-pipeline.service.ts` 原始碼；regex 斷言計分路徑不含 `'%專案%'`、`'經銷商'`、`cc.gender`、`residential_zip`/`mailing_zip`/`company_zip`、`home_phone`/`contact_phone`/`mobile_phone`（feedback_grep_negative_lookahead 教訓：用 fs+regex regression guard，非僅 Grep tool）
- **Expected Result**：計分相關原始碼舊關鍵字/舊欄名全清；CustomerCoreRow 介面亦無舊欄

---

## 十四、F103 既有測試更新清單（AC-17 必處理）

> tdd-implementation 落地時，以下 F103 既有 `.spec.ts` 案例**因 F104 新語意必須更新**；其餘須**保持通過**。

### 須更新（語意已變）

| F103 案例 | 檔案 | 變更原因 | 更新方向 |
|----------|------|---------|---------|
| **CustomerCoreRow fixture（全 EQ/CC 案例）** | both .spec | 介面欄名改（gender→cus_sex 等 7 欄） | 所有 cc fixture 改新欄名；prefetch SELECT 與 PG 建表 DDL 同步改 |
| **`computeScore(...)` / `resolveColumnValue(...)` 呼叫** | both .spec | 簽章加 cardType | 全呼叫端補 cardType 引數（harness `assertEq`/`resolver`/`makeComputeScore` 型別同步） |
| EQ-004 / EQ-005 / PJTP-001~004 | both | PROJECT_TP `'專案'`→`'借新還舊'` | fixture spec_name 改「借新還舊」；靜態斷言改 `'%借新還舊%'`；'專案' 不再命中 |
| EQ-006 / SALES_STS 案例 | both | `'經銷商'`→`'中古車商'` | sales_sts_na fixture 改「中古車商」；靜態斷言改 `'中古車商'` |
| CC-001（CUS_SEX cc=null→'3'）| f103.spec | category→range；取值改 number | 改驗 range（safe-cast，'1'→1、空/null→3）；kind 改 range |
| CC-002/003/004（CAREA/CELLULAR 取值）| f103.spec | 加 isCorp 分流 + 欄名改 | 加 cus_sex gating；個人取自身、法人 0；欄名 carea_no1/cellular |
| CC-005（AGE）| f103.spec | 加 >100 排除 + 分流 | 加 age=101→0、法人→0 |
| CC-006（EDUCAT_BACK 取值→'D'/''）| f103.spec | 補零 + per-card default + range | 改 RIGHT 補零；缺值 per-card default（非 ''）；kind range |
| CC-007/008/009（HPOST/CPOST/CO_NUM 取 zip）| f103.spec | 改讀 *_city + LEFT3 + per-card default | 改驗 LEFT3 縣市名 + per-card default（非 zip、非 ''） |
| CC-010（LOAN_RATE→0）| f103.spec | per-card default | 缺值改 per-card（S5→77、E/E5→12、其他 0） |
| AUDIT-002/003（CAREA `(home_phone IS NOT NULL)::int`）| both | 欄名 + presence 語意（加 `<>''`）+ 分流 | 改 `(cc.carea_no1 IS NOT NULL AND cc.carea_no1<>'')::int` 個人分支 |
| EQ-007（AGE 三邊界）| both | 加 >100 守門 | 保三邊界 + 補 age=101→0（calcAgeYears 守門落點確認） |

### 須保持通過（F104 不影響）

| F103 案例 | 不受影響原因 |
|----------|-------------|
| AR-001~005（ADD_UN_CAPITAL JOIN/取分）| F104 不動 ADD_UN_CAPITAL（AD line 4083 標「不動」）|
| CAR_YEAR 相關 | F104 不動 CAR_YEAR（AD line 4082 標「不動」）|
| FALLBACK-001~005 / GHOST-001~004 | 通用 fallback 不變（F103 既有，F104 不涉及）|
| COMMISSION-001~004 | COMMISSION 死碼移除 F103 已完成，F104 不回退 |
| PREFETCH-001~003 | batch pre-fetch 機制不變（SELECT 欄名雖改但 IN 查詢結構不變，計次斷言不受影響）|
| AUDIT-001/004/005 | MAPPED_SCORING_COLUMNS 集合 + ADD_UN_CAPITAL + default 不回 undefined 不變 |
| REG-001~004 | 回歸機制本身 |

---

## 十五、per-card 啟用矩陣（legacy SP 查證，選卡依據）

> **來源**：test-designer 已 UTF-16LE 解碼 `SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`，逐 card `#PRE_FINAL` WHERE block 之 `C.COLUNM=...` 分支。EQ/BRANCH/CITY/PCD/EDU 案例選卡須對齊本表（測某欄 EQ 須選「該欄啟用」之卡，否則該欄無 active column → 不參與計分 → 測不到）。

| column | H | S | S5 | E | E5 | M | HM |
|--------|---|---|----|---|----|---|----|
| CUS_SEX | ✓ | ✓ | — | — | — | — | — |
| CAR_YEAR | ✓ | ✓ | ✓ | ✓ | — | — | — |
| ADD_UN_CAPITAL | ✓ | — | — | (E 視 SP) | — | — | — |
| PROJECT_TP | ✓ | ✓ | — | ✓ | ✓ | — | — |
| SALES_STS | ✓ | — | — | ✓ | — | — | — |
| LIST_MONTH | ✓ | ✓ | — | ✓ | ✓ | — | — |
| LOAN_RATE | — | — | ✓ | ✓ | ✓ | — | — |
| AGE | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CAREA_NO1 | ✓ | ✓ | ✓ | ✓ | **✗（E5 無）** | ✓ | ✓ |
| CAREA_NO2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CELLULAR | — | — | — | — | **✓（僅 E5）** | — | — |
| EDUCAT_BACK | — | ✓ | ✓ | ✓ | ✓ | — | — |
| HPOST_NUM_NM | — | — | ✓ | — | — | ✓ | ✓ |
| CPOST_NUM_NM | — | — | — | — | — | ✓ | ✓ |
| CO_NUM_NM | — | — | ✓ | — | ✓ | ✓ | ✓ |

> **關鍵選卡含意（影響本 test design 案例）**：
> - **CELLULAR EQ 只能在 E5 卡測**（AC-7 / BRANCH-003 之 CELLULAR EQ 必選 E5）。
> - **E5 無 CAREA_NO1**（只有 CAREA_NO2）— BRANCH/EQ 在 E5 卡勿 seed CAREA_NO1 active column。
> - **H 無 AGE / EDUCAT_BACK**（AGE100/EDU EQ 須選 S 或其他，勿選 H）。
> - **縣市欄只在 S5/E5/M/HM**（CITY EQ 用 M 卡最完整：三欄齊）；S5 有 HPOST+CO_NUM、E5 有 CO_NUM。
> - **LIST_MONTH/LOAN_RATE 在 M/HM 不啟用**（PCD 勿在 M/HM 測 default）。
> - **HM 複用 M 設定**（SP `CARD_TYPE='M'` filter）— HM per-card default 同 M（臺北市/臺南市/高雄市）。

> **tdd 落地注意（legacy literal 細節，非 PG 等價阻礙）**：
> - legacy 補零為 SQL Server `RIGHT('0'+code,2)`（`+` 串接）；PG 等價為 `RIGHT('0'||code,2)`（`||`），語意相同，**勿因 legacy 寫 `+` 而困惑**。
> - legacy AGE 欄 `BITBE_DATE` 為「已推算之年齡整數」（`DATEDIFF(YEAR,...)` 預存），非生日；CDMP 由 `cc.date_of_birth` 即時推算 `EXTRACT(YEAR FROM age())`，故 >100/<0 守門對應 legacy 對 `BITBE_DATE` 之 `>100 OR <0 → 0`。語意對齊，來源欄不同。
> - legacy SALES_STS 另有顯式 `WHEN '和潤' THEN 'HFC'` 分支（與 `ELSE 'HFC'` 同效）；CDMP 僅保 ELSE 即可（KW-003/004 不需單獨測 '和潤'，但可選測確認落 HFC）。

---

## 風險與缺口

### 已識別風險

| 風險 ID | 描述 | 嚴重度 | 緩解措施 |
|---------|------|--------|---------|
| RISK-F104-01 | EDUCAT_BACK 為 range（字串 BETWEEN，已查證）但補零值 '02'/'08'/'99'；PG range 分支現以 `Number(level2_s)` 轉數值比較（builder L266），補零字串 Number('08')=8 在 '01'..'99' 範圍內**數值比較與 lexical 比較恰好等價**（因皆 0 補零兩碼），但若未來出現非數字 educat code 或 level2 含字母則破裂 | 中 | EDU-007 明測 '08' BETWEEN '08' AND '99' 上界；EQ 須 PG=JS（JS String 比 vs PG numeric 比若不一致會被 EQ 抓到）；tdd 落地確認 PG range 對 educat 走數值或字串（建議與 JS 對齊單一型別） |
| RISK-F104-02 | **髒值 cus_sex（'C'）分流走向 — AD 內部矛盾（算式 vs 散文）**：AD line 4102 **判斷式** `<safe_int>(COALESCE(NULLIF('C',''),'1')) IN(1,2)`：`NULLIF('C','')='C'`（'C'≠空）→ `COALESCE('C','1')='C'` → `safe_int('C')=NULL` → `NULL IN(1,2)`=UNKNOWN → **法人**（與 legacy SP `CUS_SEX NOT IN('1','2')`→法人、test-designer 已 SP 查證一致）。但 AD line 4103 **散文**宣稱同輸入→個人——其推導 `COALESCE(NULLIF('C',''),'1')='1'` **算錯**（誤把 'C' 當空字串）。算式與 legacy 皆指向法人，僅散文（含算術錯誤）指向個人 | **高** | **建議釘「法人」**（算式 line 4102 + legacy SP 雙重佐證，line 4103 散文為筆誤）；請 architect 修 AD line 4103 散文 + 確認後固化 BRANCH-008/SAFE-006/EQ-004 oracle；無論釘為何，PG=JS（SAFE-006）為硬 DoD |
| RISK-F104-03 | AGE >100 守門落點（calcAgeYears 內 vs resolveColumnValue 內）影響 JS 與 PG EQ；PG 為 `EXTRACT(...)>100 OR <0 → 0` | 中 | AGE100-002 註記擇一落點；EQ-005 以 PG=JS 強制一致；建議守門在 calcAgeYears（單一真值來源）|
| RISK-F104-04 | CustomerCoreRow 改名（7 欄）+ 簽章加 cardType 為大範圍漏改風險；vitest 不攔型別 | **高** | REG-003 強制 tsc gate；REG-005 fs+regex 靜態掃描舊欄名/關鍵字（feedback_grep_negative_lookahead / feedback_vitest_no_typecheck 教訓）|
| RISK-F104-05 | per-card default 需 `CARD_DEFAULTS[(column,cardType)]` 映射表；未列 card_type（dump 未列）走 BR-F104-16 H/S 基準 + warn | 低 | SIG-001/002 驗 cardType 影響 default；BR-F104-16 fallback 未在本輪測試逐格（建議補 1 案：未知 card_type → H/S 基準 + logger.warn，列為 tdd 補充）|
| RISK-F104-06 | 縣市 LEFT3：台灣縣市名皆 3 字（A-F104-3），但 default 注入須在 LEFT3 **之前**（default 本身 3 字、LEFT3 不影響）；若 impl 把 LEFT3 套在 default 外層則正確，套內層 COALESCE 順序錯會截斷 | 低 | CITY-008 靜態斷言 `LEFT(COALESCE(NULLIF(...),default),3)` 順序；CITY-004~007 行為驗 default 經 LEFT3 仍 3 字 |

### 需使用者/architect 拍板的殘留

| OQ ID | 問題 | 影響 | 建議 |
|-------|------|------|------|
| **OQ-TDS-F104-01（高，BLOCKER for BRANCH-008/SAFE-006/EQ-004 oracle）** | 髒值 cus_sex（'C'/'D' 等非數值非空）分流走向 = 個人 or 法人？**AD 自相矛盾**：line 4102 算式 → 法人（與 legacy SP `NOT IN('1','2')` 一致，test-designer 已 SP 查證）；line 4103 散文 → 個人（但其推導把 'C' 誤當空字串，**算術錯誤**）。`NULLIF('C','')='C'`（非 '1'），故算式正解為法人 | BRANCH-008/SAFE-006/EQ-004 之 expected；prod 髒值客戶（'C'5/'D'4/'8'6/'9'4/'A'/'B' 共約 21 筆，dev 已查證）分流結果 | **強烈建議釘「法人」**（legacy SP + AD 算式雙重佐證；line 4103 散文為筆誤）。請 architect 修正 AD line 4103 散文；本 test design oracle 已暫採「法人」（BRANCH-008/EQ-004）。**注意**：legacy 為純字串 `NOT IN('1','2')`，CDMP safe-cast 後須以 PG 三值邏輯處理（`NULL NOT IN(1,2)`=UNKNOWN，須 `COALESCE(...,法人)` 或 `IS DISTINCT FROM` 顯式落法人），JS 對稱 `Number.isInteger(g)&&(g===1||g===2)` 否則法人 |
| OQ-TDS-F104-02（低） | EDUCAT_BACK PG range 比對走數值 or 字串 lexical？現行 builder L266 走 `Number()` 數值；補零字串恰等價，但語意不精確 | EDU-007 / RISK-F104-01；未來非數字 educat 破裂 | 建議 tdd 落地時 PG 與 JS 對齊單一型別（補零後字串比較最貼 legacy `BETWEEN '08' AND '99'`）；本輪數值等價可接受，記錄為技術債 |
| OQ-TDS-F104-03（低） | BR-F104-16 未知 card_type fallback（H/S 基準 + warn）本輪是否需測試案例？ | 邊緣 card_type 月跑行為 | 建議補 1 unit 案例（未知 card → LIST_MONTH=25/LOAN_RATE=0/縣市不計分 + logger.warn）；非 DoD 紅線，列 tdd 補充 |

### 架構師 OQ 衍生（已於 spec §10 處理，此處僅追蹤）

| OQ ID | 狀態 |
|-------|------|
| 架構師 OQ-1（signature 加 cardType）| AD-E07-32 已落地（input 唯讀）；SIG-001/002 驗 |
| 架構師 OQ-2（per-card default 完整 card 清單）| AD-E07-33 矩陣已定；EDU-004/CITY-004~006/PCD 逐格驗 |
| 架構師 OQ-3（AD-E07-10-L 修正落地）| AD v4.0 已落地（§4063–4162）|
| 架構師 OQ-4（PROJECT_TP 複合 / EDUCAT 型別 / 縣市 LEFT3 落點）| EDUCAT 型別 = range（test-designer 已查證 RESOLVED）；PROJECT_TP 維持 category 單欄（AC-1 僅關鍵字）；縣市 LEFT3 在 expr 層（CITY-008 驗）|

---

## 自動化就緒度

| 項目 | 評估 |
|------|------|
| **適合自動化** | KW/SEX/BRANCH/SAFE/AGE100/EDU/CITY/PCD/EQ/SIG/REG 全部（unit + PG integration）。EQ DoD、cus_sex NULL-safe、per-card 逐格皆可自動斷言。 |
| **半自動（查詢自動 + 人工判讀）** | UPGRADE 群組（202606 重跑 card_level/tier 分佈、10 筆抽樣手算）——SQL 查詢自動，達標判定定性人工。 |
| **決定性考量** | AGE 測試固定 today（PG `CAST('YYYY-MM-DD' AS DATE)` 或 calcAgeYears 注入 now）；EQ 手算 oracle（禁 SQL 自我斷言）。 |
| **環境依賴** | PG integration（約 48 案）需 cdmp_test Postgres（5433），與 F098~F103 pg.spec **序列執行**（共用 DB）；unit 案無 DB 依賴。 |
| **型別 gate** | `tsc --noEmit -p tsconfig.build.json` 為強制門檻（CustomerCoreRow 改名 + 簽章加 cardType 高漏改）。 |
