---
spec-id: F104
title: Stage 2 計分引擎 AD-E07-10-L 全欄對齊 legacy SP（借新還舊關鍵字 + CUS_SEX 分流 + 縣市名 LEFT 3 碼 + per-card default + SALES_STS 關鍵字修正）
feature-id: F104
source-story: US-159 / US-160 / US-161 / US-162 / US-163
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-06-24
status: Draft
blocked-by: F103
related: F100, F101, F102, F103, F064, F067
---

# F104: Stage 2 計分引擎 AD-E07-10-L 全欄對齊 legacy SP

Priority: P0-MVP | Status: Draft | Last Updated: 2026-06-24

> ⚠️ **PRODUCTION 分派結果變更警告（必讀）**：本 feature 修正 Stage 2 計分引擎之欄位映射規則，使其對齊 legacy SP（`SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`）的真實計分語意。F103 已對齊 AD-E07-10-L，但**深度稽核 legacy SP 後發現 AD-E07-10-L 本身有多欄語意偏差**——F103 等於對齊了一份有錯誤的 AD。本輪修正 `PROJECT_TP` 關鍵字、`SALES_STS` 關鍵字、`CUS_SEX` range 比對、五欄 `CUS_SEX` 分流（CAREA_NO1/CAREA_NO2/CELLULAR/AGE/EDUCAT_BACK）、三縣市欄改讀縣市名並 `LEFT 3 碼` 比對、以及多欄 per-card default。修正後 score / card_level / tier_level 分佈將改變，對下游 [F101](F101-stage3-4-proportional-assignment.md)（依 tier 分組）與 [F064](F064-export-assignment-result.md)（匯出）皆有實質影響。上線前須 dev 重跑 202606 驗收（§4 US-163）+ [F067](F067-compare-run-results.md) 差異報告 + 業務知會（§9 / NFR-005）。
>
> **v1.0（2026-06-24）**：依 5 個已核可 user story 落地（US-159 AD 全欄修正 / US-160 CUS_SEX 分流引擎 / US-161 `customer_core` 新欄 contract / US-162 縣市欄 / US-163 202606 重跑驗收）。兩條引擎路徑（PG 下推 `resolveColumnSource`/`buildStage2ScoreExpr` + JS oracle `resolveColumnValue`/`computeScore`）須對齊 §5 legacy 真語意表，並維持 JS↔SQL 等價（EQ DoD）。
>
> **legacy ground truth（已 UTF-16LE 解碼驗證，2026-06-24）**：本 feature 之唯一權威映射來源為 `reference/SP/SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`（**非** AD-E07-10-L 現況表，後者經本輪稽核確認有偏差）。§5 表逐欄附上對應 SP 行號出處。
>
> **刻意未動（邊界，交 system-architect）**：本 feature **不修改** `architecture-spec.md` 之 AD-E07-10-L 映射表——AD 全欄修正（US-159 AC-9）由 system-architect 依本 spec §5 + §10 架構師 OQ 落地；本 feature 僅產出規格（§5 legacy 真語意表 + §6 業務規則 + §11 測試覆蓋）。亦不撰寫 code / test / migration（tdd-implementation / test-designer 範疇）；`resolveColumnSource` / `resolveColumnValue` 之 signature 變更（加 `cardType`）為架構決策，列 §10 架構師 OQ。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| System Architect | 本文件 §5（legacy 真語意表）+ §6 BR + §10 架構師 OQ（**4 項待裁：signature 加 cardType / SALES_STS 關鍵字修正 / 法人分支保證人複刻 / PROJECT_TP 複合條件**）+ AD-E07-10-L（`architecture-spec.md` §4063–4093，**input 唯讀**，本輪需依本 spec 修正） |
| TDD Developer | 本文件 §5 + §6 BR + §7 計分流程 + [F103](F103-stage2-score-column-source-fix.md)（前一版引擎修正）+ `apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts`（`resolveColumnSource` / `buildStage2ScoreExpr`）+ `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`（`resolveColumnValue` ~L1137 / `computeScore` ~L1086 / `prefetchScoringSources` ~L1229 / `CustomerCoreRow` interface ~L61）|
| Test Designer | 本文件 §4 AC + §8 EQ 場景矩陣 + §11 測試覆蓋點名 |
| QA / Tester | 本文件 §4 US-163 AC + §9 驗收門檻 |
| ETL（使用者） | 本文件 §3 前置條件（cc 新欄 contract，已由使用者 ETL 完成）+ §13 已查證事實 |

---

## 1. 功能摘要

Stage 2 計分引擎有兩條平行路徑（[F103](F103-stage2-score-column-source-fix.md) §1）：PG 下推 SQL（`resolveColumnSource` / `buildStage2ScoreExpr`，正式月名單分派 `DB_TYPE='postgres'`）與 JS oracle（`resolveColumnValue` / `computeScore`，單元測試 / 非 PG）。F103 已把兩路徑對齊 AD-E07-10-L，但 AD-E07-10-L 本身與 legacy SP 真語意有偏差。本 feature 修正兩路徑使其對齊 **legacy SP**，涵蓋下列七類修正：

1. **PROJECT_TP 關鍵字修正（US-159 AC-1）**：`spec_name LIKE '%專案%'` → `'%借新還舊%'`（legacy `SP_OBLEVELCARD_H.sql` L101）。
2. **SALES_STS 關鍵字修正（US-159 OQ-159-01，本 spec 稽核後確認須修）**：legacy CASE 之 UCD 對應 key 為 `'中古車商'`（`SP_OBLEVELCARD_H.sql` L41），現行兩路徑誤用 `'經銷商'`。
3. **CUS_SEX 改 range 比對（US-159 AC-2）**：由 category（字串相等）改為 range（`COALESCE(cc.cus_sex::int, 3) BETWEEN level2_s/level2_e`，legacy L97）。
4. **五欄 CUS_SEX 分流（US-160）**：`CAREA_NO1`/`CAREA_NO2`/`CELLULAR`/`AGE`/`EDUCAT_BACK` 依 `CUS_SEX IN (1,2)`（個人）/ 否（法人）分流；個人取自身屬性、法人取 0/default（保證人停用複刻，BR-F104-06）。
5. **AGE 加 >100 排除 + 法人 0（US-159 AC-5 / US-160 AC-5）**：個人 → 年齡，且 `>100 OR <0 → 0`（legacy `SP_OBLEVELCARD_S.sql` L89）；法人 → 0。
6. **EDUCAT_BACK 補零 + per-card default（US-159 AC-6）**：個人 → `RIGHT('0'||code, 2)`，缺值 per-card default（E/S→`'02'`、**S5→`'08'`**，legacy）；法人 → 同 default。
7. **三縣市欄改讀縣市名 + LEFT 3 碼 + per-card default（US-162）**：`HPOST_NUM_NM`/`CPOST_NUM_NM`/`CO_NUM_NM` 由郵遞號改讀 `cc.hpost_city`/`cpost_city`/`co_city`，且須 `LEFT(value, 3)` 取縣市（cc 欄為「縣市+區」，legacy 與 score row 皆縣市-only），per-card default 見 §5。
   並含 **LIST_MONTH / LOAN_RATE per-card default**（US-159 AC-7/AC-8）。

**純後端**：本 feature 為月名單分派 pipeline 內計分邏輯修正，**無新前端頁、無新錯誤碼**。

## 2. 使用者故事

**As a** 業務主管（Sales Director）
**I want** 月名單分派 Stage 2 計分引擎之欄位映射規則完整對齊 legacy SP 真語意（借新還舊關鍵字、SALES_STS 關鍵字、CUS_SEX range 與分流、縣市名 LEFT 3 碼、per-card default）
**So that** 計分結果不因 AD 本身的欄位語意錯誤而系統性偏差，重跑 202606 後 H/S 名單之 tier spread 更貼近 legacy

## 3. 前置條件

- [F103](F103-stage2-score-column-source-fix.md)（PG 下推 / JS oracle 兩路徑對齊 AD-E07-10-L、補齊 customer_core 欄、ADD_UN_CAPITAL JOIN、通用 fallback）已交付。本 feature 在其上覆蓋 legacy 真語意修正。
- **`customer_core` 新欄 ETL 已完成（US-161，使用者負責，已查證 §13）**：customer_core 已新增並填充以下欄位（migration `m301`，dev DB 已套用）。引擎以下列**確切欄名/型別**為 binding contract，**不可漂移**：

| cc 欄名（確切）| 型別 | 來源 / 語意 | 填充率 |
|---|---|---|---|
| `cus_sex` | `varchar(2)` | raw `CUS_SEX` 文字 `'1'`(男)/`'2'`(女)/`'3'`(法人)；引擎內以 NULL-safe 方式 cast int（見 BR-F104-13，**禁直接 `::int`**——dev 實測含 `'C'`/`'D'`/`'8'`/空字串等非數值髒值會 cast 失敗）| 99% |
| `carea_no1` | `varchar(10)` | raw `CAREA_NO1` 戶籍電話區碼；presence = `IS NOT NULL AND <>''` → 1 else 0 | 93% |
| `carea_no2` | `varchar(10)` | raw `CAREA_NO2` 聯絡電話區碼；presence 同上 | 93% |
| `cellular` | `varchar(20)` | raw `CELLULAR` 行動電話；presence → 1/0 | 95% |
| `date_of_birth` | (既有欄) | = raw `BITBE_DATE`，AGE 沿用此欄、無需改名 | — |
| `hpost_city` | `varchar(20)` | raw `HPOST_NUM` 經郵遞號→`POSTAL_ADD` lookup，值為「**縣市+區**」（如 `'臺北市中正區'`）| 99% |
| `cpost_city` | `varchar(20)` | raw `CPOST_NUM` 同上 | 99% |
| `co_city` | `varchar(20)` | raw `CO_NUM` 同上 | 99% |

- `customer_core` 依 AD-E06-1 **不建 TypeORM entity**，PG 路徑以 raw SQL LEFT JOIN（JOIN key `o.custo_no = customer_core.source_customer_no`）；JS oracle 由呼叫端 `prefetchScoringSources` batch 取回（[F103](F103-stage2-score-column-source-fix.md) §6.2）。
- 兩條路徑須 JS↔SQL 等價（EQ DoD，`stage2to4-sql-builder.spec.ts`）。

## 4. Acceptance Criteria

> 以下依來源 Story 分組。引擎表達式之**權威**為 §5 legacy 真語意表；本節 AC 為驗收條件。

### US-159：AD-E07-10-L 全欄修正

#### AC-1（PROJECT_TP 關鍵字 → 借新還舊）
- **Given** legacy `SP_OBLEVELCARD_H.sql` L101 衍生條件為 `SPEC_NAME LIKE '%借新還舊%' THEN 'A' ELSE ''`
- **When** 修正兩路徑 PROJECT_TP 表達式
- **Then** PG `CASE WHEN o.spec_name LIKE '%借新還舊%' THEN 'A' ELSE COALESCE(o.spec_tp, '01') END`；JS 等價（`spec_name?.includes('借新還舊')`）；F103 之 `'%專案%'` / `'專案'` 全面替換；EQ DoD 覆蓋

#### AC-2（SALES_STS 關鍵字 → 中古車商）
- **Given** legacy `SP_OBLEVELCARD_H.sql` L40–43 之 CASE 為 `WHEN 'AGENT' THEN 'AGENT' WHEN '中古車商' THEN 'UCD' WHEN '和潤' THEN 'HFC' ELSE 'HFC'`
- **When** 稽核現行兩路徑（誤用 `'經銷商' THEN 'UCD'`）
- **Then** 兩路徑 UCD 分支 key 由 `'經銷商'` 修正為 `'中古車商'`；`'和潤'→'HFC'` 與 `ELSE 'HFC'` 等價（保留 ELSE 即可，新增 `'和潤'` case 非必要）；EQ DoD 覆蓋。**此修正推翻 OQ-159-01「兩者可能等價」假設——本 spec 稽核 `SP_GET_CUSTATTRIB_OB.sql` 確認其與 SALES_STS 無關（§13），SALES_STS 之 CASE 在 OBLEVELCARD SP 內就地完成、關鍵字確為 `'中古車商'`**

#### AC-3（CUS_SEX 改 range 比對）
- **Given** legacy L97 `ISNULL(D.CUS_SEX,3) BETWEEN LEVEL2_S AND LEVEL2_E`（range，缺值 3）
- **When** 修正兩路徑 CUS_SEX
- **Then** `CUS_SEX` 欄 kind 由 category 改為 range；PG 表達式 `COALESCE(<safe-cast-int>(cc.cus_sex), 3)`（NULL-safe cast，BR-F104-13）；缺值 default `3`；JS `Number.isInteger` 守門後 `?? 3`；既有測試不退化

#### AC-4（LIST_MONTH per-card default）
- **Given** legacy `LIST_MONTH` 缺值 default 依 card：H/S→25（L102）；E/E5→12（`SP_OBLEVELCARD_E.sql` L110）
- **When** 修正兩路徑
- **Then** `month_cnt` 為 NULL 時依 card_type 套對應 default（H/S→25；E/E5→12；其他見 §5）；PG/JS 等價；EQ DoD 含各 card default

#### AC-5（LOAN_RATE per-card default）
- **Given** legacy `LOAN_RATE` 缺值 default：E/E5→12（`SP_OBLEVELCARD_E.sql` L111）；S5→77（`SP_OBLEVELCARD_S5.sql` L83）；其他→0
- **When** 修正兩路徑
- **Then** `loan_rate` 為 NULL 時依 card_type 套對應 default；PG/JS 等價；EQ DoD 含各 card default

### US-160：CUS_SEX 分流引擎

#### AC-6（CAREA_NO1/NO2 個人分支取區碼欄有無）
- **Given** 個人客戶（`cus_sex IN (1,2)`），cc 已有 `carea_no1`/`carea_no2` 欄
- **When** 計分引擎計算
- **Then** PG（個人）：`CASE WHEN cc.carea_no1 IS NOT NULL AND cc.carea_no1 <> '' THEN 1 ELSE 0 END`；JS 等價；legacy L103–104 語意對齊

#### AC-7（CELLULAR 個人分支取 cellular 欄有無）
- **Given** 個人客戶，cc 已有 `cellular` 欄
- **When** 計分引擎計算
- **Then** 個人 → `cc.cellular IS NOT NULL AND <>''` → 1/0（非 `mobile_phone IS NOT NULL`，legacy `SP_OBLEVELCARD_E5.sql` L114）

#### AC-8（法人分支五欄恆 0/default，保證人停用複刻）
- **Given** 法人客戶（gating：`<safe_int>(COALESCE(NULLIF(cc.cus_sex,''),'1')) NOT IN (1,2)`，即 cus_sex 為 `'3'` 或其他非 1/2 之**有值**者；**空/NULL → 個人，不入此分支**，BR-F104-04 / BR-F104-13a）
- **When** 計算 CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK
- **Then** CAREA_NO1/NO2/CELLULAR → 0；AGE → 0；EDUCAT_BACK → per-card default（E/S→`'02'`、S5→`'08'`）；不查保證人任何欄（CDMP 無保證人表，BR-F104-06）

#### AC-9（AGE 個人分支 >100 排除）
- **Given** 個人客戶，`cc.date_of_birth` 不為 NULL
- **When** 計算年齡
- **Then** 依 `EXTRACT(YEAR FROM age(cc.date_of_birth))`；結果 `>100 OR <0 → 0`（legacy L89）；`date_of_birth` 為 NULL → 0；JS `calcAgeYears`（[F103](F103-stage2-score-column-source-fix.md) 既有）加 >100 守門

#### AC-10（EDUCAT_BACK 個人補零 + per-card default）
- **Given** 個人客戶，`cc.education_code` 有值（1 碼或 2 碼）
- **When** 計算
- **Then** PG `RIGHT('0'||cc.education_code, 2)`；JS 等價；缺值 → per-card default（E/S→`'02'`、S5→`'08'`，legacy `SP_OBLEVELCARD_S5.sql` L82）

### US-162：縣市欄修正

#### AC-11（三縣市欄改讀縣市名 + LEFT 3 碼）
- **Given** cc 之 `hpost_city`/`cpost_city`/`co_city` 為「縣市+區」（如 `'臺北市中正區'`），但 `ob_levelcard_score.level1` 為縣市-only 3 字（dev 實測全 25 個皆 3 字，§13）
- **When** 計分引擎計算 HPOST_NUM_NM/CPOST_NUM_NM/CO_NUM_NM
- **Then** PG 取 `LEFT(COALESCE(NULLIF(cc.hpost_city,''), <card_default>), 3)`；JS 取 `(cc.hpost_city || <card_default>).slice(0,3)`；不再使用 `residential_zip`/`mailing_zip`/`company_zip`；legacy `SP_OBLEVELCARD_M.sql` L42–44 `LEFT(POST.POSTAL_ADD,3)` 對齊

#### AC-12（縣市欄 per-card default）
- **Given** cc 縣市欄為 NULL/空 或 cc 整列為 NULL
- **When** 計算三縣市欄
- **Then** 套用 §5 per-card default（legacy 出處）：`HPOST_NUM_NM` S5→`'花蓮縣'`、M/HM→`'臺北市'`；`CPOST_NUM_NM` M/HM→`'臺南市'`；`CO_NUM_NM` S5/E5→`'金門縣'`、M/HM→`'高雄市'`；**未在某 card 計分之縣市欄不需 default**（H/S/E 不計分縣市欄，§5）

### US-163：202606 重跑驗收

#### AC-13（dev 重跑無錯誤 + card_level ≥ 3 種值）
- **Given** US-159/160/162 引擎修正已 commit 到 dev、US-161 cc 新欄已載入
- **When** 觸發 dev 202606 月名單分派並查 `ob_monthly_run_result GROUP BY card_level`（card_type H/S）
- **Then** 月名單分派無錯誤；card_level 出現 ≥ 3 種值（不全為 D）；若 ≤ 2 種啟動 AC-15 根因分析

#### AC-14（tier spread 含 T1/T2，定性）
- **Given** F104 修正後 H/S 名單計分
- **When** 查 `GROUP BY tier_level`（card_type H/S）
- **Then** 含 T1 與 T2；T3 佔比相較 F103 前明顯改善（定性，不設精確百分比門檻，OQ-158-01）；方向與 legacy 一致

#### AC-15（仍異常時本輪根因，不推延）
- **Given** AC-13/AC-14 未達標
- **When** 根因分析
- **Then** 本輪內判定根因（引擎映射仍有落差 → 回 §5 補漏；cc 新欄 NULL 率過高 → ETL 範疇、記錄於 implementation-log；score rows 閾值）；記錄根因及行動，不推延至 F105

#### AC-16（個人客戶分流欄抽樣驗證）
- **Given** dev cc 已含 cus_sex/carea_no1/carea_no2/cellular
- **When** 抽 10 筆個人客戶（cus_sex IN 1,2）在 H 名單之月名單分派結果，手算 CAREA_NO1/NO2/CELLULAR 計分
- **Then** 手算值與 `ob_monthly_run_result.score` 一致（±0）；確認 cus_sex=1/2 不再使三欄取 0

#### AC-17（F103 EQ DoD 不退化 + tsc）
- **Given** US-156/157/158（F103）全部測試
- **When** `pnpm test` + `tsc --noEmit -p tsconfig.build.json`
- **Then** F103 測試仍通過（或已更新反映 F104 新語意）；無新型別錯誤；F104 新增 EQ 場景全通過

## 5. legacy 真語意映射表（引擎對齊權威）

> **此表取代 AD-E07-10-L 現況**（system-architect 依此修正 AD，US-159 AC-9）。出處 = `reference/SP/SP_OBLEVELCARD_<card>.sql` 之行號（已 UTF-16LE 解碼驗證）。「per-card 啟用」欄 = 該欄在哪些 card 的 `OR (C.COLUNM='...'` 區塊出現。
>
> 引擎表達式以 alias `o`（ob_pool_data）/ `cc`（customer_core LEFT JOIN）；`<safe_int(x)>` = NULL-safe int cast（BR-F104-13）。
> **⚠️ cus_sex 兩處 default 分離（BR-F104-13a）**：(i) CUS_SEX **計分欄** default = `3`（`COALESCE(<safe_int>(cc.cus_sex),3)`）；(ii) 五欄**分流 gating** default = `'1'`（個人）→ `isCorp` = `<safe_int>(COALESCE(NULLIF(cc.cus_sex,''),'1')) NOT IN (1,2)`（**空/NULL→個人，非法人**）。

| column_name | kind | per-card 啟用（出處）| 個人分支（CUS_SEX∈1,2）| 法人分支 / 缺值 default | F103→F104 變更 |
|-------------|------|----------------------|----------------------|----------------------|----------------|
| `CUS_SEX` | range | 全（H L97）| — | `COALESCE(<safe_int>(cc.cus_sex), 3)` BETWEEN level2 | category→range；`gender`→`cus_sex` cast |
| `CAR_YEAR` | range | H/S/S5/E/E5（H L98）| — | 當年 − year_produ，缺值 0 | 不動（F103 既有）|
| `ADD_UN_CAPITAL` | range | H/E/E5（H L99）| — | `COALESCE(ar.add_un_capital,0)` | 不動（F103 既有）|
| `PROJECT_TP` | category | H/S/E/E5（H L100–101）| — | `spec_name LIKE '%借新還舊%'→'A'` else `COALESCE(spec_tp,'01')` | `'專案'`→`'借新還舊'` |
| `LIST_MONTH` | range | H/S/E/E5（H L102）| — | `COALESCE(o.month_cnt, <H/S:25; E/E5:12>)` | 固定 25 → per-card |
| `LOAN_RATE` | range | S5/E/E5（E L111）| — | `COALESCE(o.loan_rate, <S5:77; E/E5:12; 其他:0>)` | 固定 0 → per-card |
| `SALES_STS` | category | H/S/E（H L105）| — | `CASE sales_sts_na WHEN 'AGENT'→'AGENT' WHEN '中古車商'→'UCD' ELSE 'HFC'` 比對 level1 | `'經銷商'`→`'中古車商'` |
| `CAREA_NO1` | range | H/S/S5/E/M/HM（H L103）| `cc.carea_no1 IS NOT NULL AND <>'' → 1 else 0` | 法人→0 | `home_phone`→`carea_no1` + 分流 |
| `CAREA_NO2` | range | H/S/S5/E/E5/M/HM（H L104）| `cc.carea_no2 …→1/0` | 法人→0 | `contact_phone`→`carea_no2` + 分流 |
| `CELLULAR` | range | E5（E5 L114）| `cc.cellular IS NOT NULL AND <>'' →1/0` | 法人→0 | `mobile_phone`→`cellular` + 分流 |
| `AGE` | range | S/S5/E/E5/M/HM（S L89）| `age(cc.date_of_birth)`；`>100 OR <0 → 0` | 法人→0 | 加分流 + >100 排除 |
| `EDUCAT_BACK` | range | S/S5/E/E5（S L95）| `RIGHT('0'||cc.education_code,2)`；缺值 per-card default | 法人→per-card default | category→range；補零；缺值 `''`→`'02'`/S5`'08'` + 分流 |
| `HPOST_NUM_NM` | category | S5/M/HM（M L83）| — | `LEFT(COALESCE(NULLIF(cc.hpost_city,''), <S5:花蓮縣; M/HM:臺北市>), 3)` 比對 level1 | `residential_zip`→`hpost_city` + LEFT3 + per-card default |
| `CPOST_NUM_NM` | category | M/HM（M L84）| — | `LEFT(COALESCE(NULLIF(cc.cpost_city,''), '臺南市'), 3)` 比對 level1 | `mailing_zip`→`cpost_city` + LEFT3 + default |
| `CO_NUM_NM` | category | S5/E5/M/HM（S5 L84）| — | `LEFT(COALESCE(NULLIF(cc.co_city,''), <S5/E5:金門縣; M/HM:高雄市>), 3)` 比對 level1 | `company_zip`→`co_city` + LEFT3 + per-card default |

> **kind 說明**：`EDUCAT_BACK` legacy 用 `BETWEEN LEVEL2_S AND LEVEL2_E`（L95），但值為 `'02'`/`'08'` 等補零字串——legacy score row 之 level2_s/level2_e 對 EDUCAT_BACK 是「字串範圍」。引擎現行 range 分支以數值比較；**EDUCAT_BACK 是否應以字串比較（lexical）或數值比較須由 §10 OQ-4 / tdd 依實際 score rows 確認**。本表暫標 range（對齊 legacy `BETWEEN`），但取值為補零字串——交 tdd 落地時驗 score row 型別。
>
> **PROJECT_TP 複合條件（legacy L100–101）**：legacy 實為「`spec_tp BETWEEN level2_s/level2_e` **AND** `(spec_name衍生)= level1`」之複合條件。F103/本 spec 之 category 單欄模型為簡化版。是否需完整複刻複合語意列 §10 OQ-4。本輪 AC-1 範圍僅關鍵字修正。

## 6. 業務規則（Business Rules）

- **BR-F104-01（PROJECT_TP 關鍵字）**：兩路徑 `spec_name LIKE '%借新還舊%'`（取代 `'%專案%'`）。出處 legacy H L101。

- **BR-F104-02（SALES_STS 關鍵字）**：兩路徑 UCD 分支 key = `'中古車商'`（取代 `'經銷商'`）。出處 legacy H L41。ELSE 一律 `'HFC'`（涵蓋 `'和潤'`）。

- **BR-F104-03（CUS_SEX range 比對）**：`CUS_SEX` kind = range；值 = `COALESCE(<safe_int>(cc.cus_sex), 3)`，與 level2_s/level2_e 比對。出處 legacy H L97。

- **BR-F104-04（CUS_SEX 分流總則 — 分流 default 與計分 default 分離）**：`CAREA_NO1`/`CAREA_NO2`/`CELLULAR`/`AGE`/`EDUCAT_BACK` 五欄依 `cus_sex` **分流（gating）**：個人取自身屬性、法人取 0/per-card default。
  - **⚠️ 分流(gating) default = `'1'`（個人），與 CUS_SEX 計分欄 default = `3` 不同（BR-F104-13a）。** legacy `#CASE_CUS` 之 `ISNULL(CUS.CUS_SEX,'')='' THEN '1'`（空/NULL→個人 '1'）決定 `NOT IN ('1','2')` 之分流走向；`ISNULL(CUS_SEX,3)`（→3）僅用於 CUS_SEX **欄本身的 range 計分**。兩者來源同一 raw 欄但 default 不同，**下游 impl 不可混用同一個 default**。
  - **分流判斷式**：個人 = `COALESCE(NULLIF(cc.cus_sex,''),'1')` 之 safe_int `IN (1,2)`（空/NULL→`'1'`→個人）；否則（`'3'` 或其他非 1/2 值）→ 法人。建議抽 `isCorporate(cc)` helper：PG `<safe_int>(COALESCE(NULLIF(cc.cus_sex,''),'1')) NOT IN (1,2)`；JS `const g = (cc?.cus_sex ?? '') === '' ? 1 : Number(cc.cus_sex); return !(g === 1 || g === 2)`（非數值→非 1/2→法人）。

- **BR-F104-05（CAREA/CELLULAR presence 語意）**：個人分支「有無」= `IS NOT NULL AND <> ''` → 1，否則 0。出處 legacy H L103–104（`ISNULL(D.CAREA_NO1,'')='' THEN 0 ELSE 1`）。

- **BR-F104-06（法人分支保證人停用複刻）**：legacy 法人分支讀保證人欄（`*_GUARD`，如 `CAREA_NO1_GUARD`）。**CDMP 無保證人表（ETL 未引入），且保證人資料現為 0 筆/停用**，故法人分支複刻為「直接取 0/default」，不查保證人、不 JOIN。此為對 legacy 之**明示簡化**（legacy 若保證人有資料會取其值）；與 stories US-159/US-160 前提一致。
  - **空/NULL cus_sex 之分流走向 = 個人（對齊 legacy，2026-06-24 RESOLVED）**：legacy `#CASE_CUS` `ISNULL(CUS.CUS_SEX,'')='' THEN '1'`（空→個人 '1'），故空/NULL cus_sex 案件**走個人分支、用自身屬性**（非法人分支取 0）。本 spec 採此 legacy 語意（gating default `'1'`，見 BR-F104-04）。**注意**：此與 CUS_SEX 計分欄 default（3，BR-F104-13a）刻意分離，兩 default 各司其職、不可混用。

- **BR-F104-07（AGE >100 排除 + 法人 0）**：個人 → `EXTRACT(YEAR FROM age(cc.date_of_birth))`，若 `> 100 OR < 0 → 0`；`date_of_birth` NULL → 0；法人 → 0。出處 legacy S L89。JS 沿用 [F103](F103-stage2-score-column-source-fix.md) `calcAgeYears` 並加 >100 守門。

- **BR-F104-08（EDUCAT_BACK 補零 + per-card default）**：個人 → `RIGHT('0'||cc.education_code, 2)`；缺值 / 法人 → per-card default。default 值：E/S→`'02'`、**S5→`'08'`**（legacy S5 L82；L81 之 `'07'` 為 20230323 註解廢除版，採 L82 `'08'`）。其他 card 若未列見 §10 OQ-2。

- **BR-F104-09（縣市欄改讀縣市名）**：`HPOST_NUM_NM`/`CPOST_NUM_NM`/`CO_NUM_NM` 取值來源由郵遞號欄改為 `cc.hpost_city`/`cpost_city`/`co_city`；`residential_zip`/`mailing_zip`/`company_zip` 不再作計分來源（cc 保留欄，計分路徑不引用）。

- **BR-F104-10（縣市 LEFT 3 碼比對）**：cc 縣市欄為「縣市+區」（如 `'臺北市中正區'`），legacy 與 score row level1 皆縣市-only 3 字（dev 實測 25 個皆 3 字，§13）。引擎須取 `LEFT(value, 3)`（PG）/ `value.slice(0,3)`（JS）再與 level1 比對。出處 legacy M L42 `LEFT(POST.POSTAL_ADD,3)`。台灣縣市名皆 3 字，slice(0,3) 安全。

- **BR-F104-11（縣市 per-card default）**：三縣市欄缺值 / cc NULL 時依 card_type 套 default（§5 表）。default 在 `LEFT(...,3)` **之前**注入（default 本身已是縣市-only 3 字，LEFT3 不影響）。出處：`HPOST_NUM_NM` S5 L85（花蓮縣）/ M L83（臺北市）；`CPOST_NUM_NM` M L84（臺南市）；`CO_NUM_NM` S5 L84（金門縣）/ M L82（高雄市）。

- **BR-F104-12（LIST_MONTH / LOAN_RATE per-card default）**：`LIST_MONTH` 缺值 default：H/S→25、E/E5→12；`LOAN_RATE` 缺值 default：S5→77、E/E5→12、其他→0。出處 legacy H L102 / E L110–111 / S5 L83。

- **BR-F104-13（cus_sex NULL-safe cast，防月名單分派中斷）**：`cc.cus_sex` 為 `varchar`，dev 實測含非數值髒值（`'C'`/`'D'`/`'8'`/`'9'`/空字串）。PG **禁用裸 `cc.cus_sex::int`**（對 `'C'` 拋 invalid input syntax → 整支月名單分派 SQL 失敗）。`<safe_int>(x)` 定義 = PG `CASE WHEN x ~ '^[0-9]+$' THEN x::int ELSE NULL END`（或等效）；JS `Number.isInteger(Number(x)) ? Number(x) : null`。**所有用到 cus_sex 之處（CUS_SEX 計分 + 五欄分流 gating）皆須走 `<safe_int>`，非數值/空 → NULL → 再各自 COALESCE 至對應 default**。

- **BR-F104-13a（CUS_SEX 兩處 default 分離，務必區分）**：cus_sex 同一 raw 欄在引擎有**兩個彼此獨立的 default**，下游 impl 不可混用：
  - **(i) CUS_SEX 計分欄（range 計分用）default = `3`**：`COALESCE(<safe_int>(cc.cus_sex), 3) BETWEEN level2_s/level2_e`。出處 legacy `ISNULL(CUS_SEX,3)`（H L97）。空/NULL/非數值 → 3。
  - **(ii) 五欄分流 gating default = `'1'`（個人）**：決定 CAREA_NO1/CAREA_NO2/CELLULAR/AGE/EDUCAT_BACK 讀自身屬性 vs 法人(0/default) 時，空/NULL → `'1'` → 個人分支。出處 legacy `#CASE_CUS` `ISNULL(CUS.CUS_SEX,'')='' THEN '1'`（H L36）。
  - PG gating：`<safe_int>(COALESCE(NULLIF(cc.cus_sex,''),'1')) IN (1,2)`；計分：`COALESCE(<safe_int>(cc.cus_sex),3)`。**兩路徑（PG/JS）對「非數值/空 cus_sex」須一致：計分→3、gating→個人，確保 EQ**。

- **BR-F104-14（per-card default 需 cardType 傳入引擎）**：`resolveColumnSource` 現行 signature 不收 `cardType`，但 per-card default + CUS_SEX 分流之 default 需要 cardType。本 spec 提出 signature 改為 `resolveColumnSource(columnName, cardType)`（呼叫端 `buildStage2ScoreExpr` 已有 cardType）；JS `resolveColumnValue` 對稱加 cardType（`computeScore` 已有）。具體 signature 設計交 §10 OQ-1。

- **BR-F104-15（JS↔SQL EQ 等價，DoD 門檻）**：兩路徑修正後計分結果須等價。EQ 群組測試（含 §8 場景矩陣）為硬性 DoD，未通過不得上線。

- **BR-F104-16（未知 card_type fallback，OQ-159-02）**：若月名單分派遇 legacy dump 未列之 card_type，per-card default 套 H/S 基準（LIST_MONTH=25、LOAN_RATE=0、縣市欄不計分故無 default），並 `logger.warn`（含 card_type），不阻擋月名單分派。

## 7. 計分流程（F104 修正後，與 F103 §7 差異標註）

```
（每名單 card_type 之 active version）
  ├─ 對每個 active column：
  │    ├─ resolveColumnSource(column_name, cardType) / resolveColumnValue(pool, column_name, cc, arCap, cardType)
  │    │    ├─ CUS_SEX → range，COALESCE(safe_int(cc.cus_sex),3)            ★F104 category→range（計分 default=3）
  │    │    ├─ CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK → isCorporate 分流     ★F104 新增分流
  │    │    │     gating default='1'（個人）：空/NULL cus_sex → 個人分支     ★與計分 default=3 分離（BR-13a）
  │    │    │     ├─ 個人(1/2/空/NULL) → 自身屬性（presence / age>100排除 / RIGHT補零）
  │    │    │     └─ 法人(3 或其他有值非1/2) → 0 / per-card default（保證人停用複刻）
  │    │    ├─ HPOST/CPOST/CO_NUM_NM → LEFT(COALESCE(cc.*_city, card_default),3)  ★F104 縣市名+LEFT3
  │    │    ├─ PROJECT_TP → spec_name '%借新還舊%'→'A'                       ★F104 關鍵字
  │    │    ├─ SALES_STS → CASE …'中古車商'→'UCD'…                          ★F104 關鍵字
  │    │    ├─ LIST_MONTH / LOAN_RATE → per-card default                    ★F104 per-card
  │    │    └─ default → 通用 fallback（F103 既有，不變）
  │    └─ 取得值 → 比對 ob_levelcard_score（range BETWEEN / category TRIM 相等）→ 命中取分（break）
  ├─ SUM → score → card_level → tier_level
```

## 8. EQ 場景矩陣（交 test-designer，BR-F104-15 DoD）

每欄修正須有 PG↔JS EQ 測試。最低場景：

| 場景 | 涵蓋欄 | 關鍵斷言 |
|------|--------|---------|
| 個人客戶（cus_sex=1）有區碼/行動電話/生日 | CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK | 取自身屬性、presence=1、age 正確、補零 |
| 法人客戶（cus_sex=3）| 同上五欄 | 全 0 / EDUCAT per-card default、不查保證人 |
| **空/NULL cus_sex → 走個人分支、用自身屬性**（gating default='1'）| CAREA_NO1/NO2/CELLULAR/AGE/EDUCAT_BACK | 五欄取自身屬性（非 0）；與「cus_sex=3 法人取 0」對照；CUS_SEX 計分欄 default=3（區間計分）兩路徑一致（BR-13a） |
| cus_sex 非數值髒值（'C' / 'D'）| CUS_SEX 計分 + 分流 | 計分→safe_int NULL→3；分流→`<safe_int>(COALESCE(NULLIF(...),''))`：'C'/'D' 非空且非 1/2 → 法人分支；SQL 不拋例外（BR-13）；兩路徑一致 |
| AGE = 101 / −1 邊界 | AGE | 取 0 |
| EDUCAT_BACK 缺值 各 card | EDUCAT_BACK | E/S→'02'、S5→'08' |
| 縣市命中（hpost_city='臺北市中正區'，score row '臺北市'）| HPOST_NUM_NM | LEFT3 命中、取對應分 |
| 縣市缺值 各 card default | HPOST/CPOST/CO_NUM_NM | M→'臺北市'/'臺南市'/'高雄市'、S5→'花蓮縣'/'金門縣' |
| PROJECT_TP spec_name 含「借新還舊」| PROJECT_TP | 取 'A' |
| SALES_STS sales_sts_na='中古車商' | SALES_STS | 取 'UCD' |
| LIST_MONTH / LOAN_RATE 缺值 各 card | LIST_MONTH/LOAN_RATE | H/S=25、E/E5=12 / S5=77、E/E5=12 |

## 9. 與下游 / NFR 關係

- **下游影響**：Stage 2 tier_level 修正後，[F101](F101-stage3-4-proportional-assignment.md) Stage 3/4 分組與 [F064](F064-export-assignment-result.md) 匯出結果改變。
- **NFR-003（Stage 2 < 10 分鐘）**：本輪不新增 JOIN（cc LEFT JOIN 為 F103 既有）；`LEFT(...,3)` / NULL-safe cast 為純量運算，不顯著升高耗時。
- **NFR-005（分派結果變更須業務知會）**：上線前 F067 差異報告 + 業務知會。

## 10. 架構師 OQ（交 system-architect，附建議）

- **架構師 OQ-1（resolveColumnSource / resolveColumnValue signature 加 cardType）**：per-card default + 分流之 default 需 cardType。
  **建議**：`resolveColumnSource(columnName: string, cardType: string)` + `resolveColumnValue(pool, columnName, cc, arCap, cardType)`。呼叫端 `buildStage2ScoreExpr`（已有 cardType）/ `computeScore`（已有 cardType）直接傳入。`MAPPED_SCORING_COLUMNS` / `CUSTOMER_CORE_COLUMNS` 等公開集合不受影響。

- **架構師 OQ-2（per-card default 完整 card 清單）**：§5 default 來自 legacy dump 列出之 card（H/S/S5/E/E5/M/HM）。某些 card 未啟用某欄（如 H/S 不計分縣市欄）故無 default。若 dev 出現 dump 未列之 custom card_type，套 BR-F104-16 fallback。**建議**：建常數映射表 `CARD_DEFAULTS[(column, cardType)]`，未命中 → H/S 基準 + warn。

- **架構師 OQ-3（AD-E07-10-L 修正落地）**：本 spec §5 為 legacy 真語意，與現行 AD-E07-10-L（`architecture-spec.md` §4063–4093）多欄偏差。**建議**：system-architect 依 §5 改寫 AD-E07-10-L 映射表（含 per-card default 欄、CUS_SEX 分流欄、kind 修正），標 F104 修正版本/日期，保留 F103 補述並標「部分已被 F104 覆蓋」（US-159 AC-9）。

- **架構師 OQ-4（PROJECT_TP 複合條件 + EDUCAT_BACK 比較型別 + 縣市 category 之 LEFT3 在 SQL builder 落點）**：
  - PROJECT_TP legacy 為複合條件（spec_tp range AND spec_name 衍生 = level1）。本輪 AC-1 僅修關鍵字。是否完整複刻複合語意？**建議**：維持 F103 category 單欄模型 + 關鍵字修正（業務影響極小，spec_tp 多為 '01'）；若 F067 差異顯示 PROJECT_TP 計分偏差再另立 story。
  - EDUCAT_BACK legacy 用 `BETWEEN`（range）但值為 `'02'`/`'08'` 補零字串。需 tdd 驗 `ob_levelcard_score` 之 EDUCAT_BACK score row 是 level1（category）或 level2（range）。**建議**：tdd 落地前查 score row 型別，依實際型別決定 kind；若為 category 則改字串相等比對（與本表 range 標記不同，以實際 score row 為準）。
  - 縣市欄 `LEFT(...,3)` 須套在 `src.expr`（取值表達式）內，使 `buildStage2ScoreExpr` 之 category TRIM 相等比對正確。**建議**：在 `resolveColumnSource` 之縣市 case 直接回傳含 `LEFT(...,3)` 的 expr，category 比對端不需改。

## 11. 測試覆蓋點名（交 test-designer）

- **PG 下推（`stage2to4-sql-builder.spec.ts` / `.pg.spec.ts`）**：(a) PROJECT_TP 生成 SQL 含 `'%借新還舊%'`；(b) SALES_STS 含 `'中古車商'`；(c) CUS_SEX 計分為 range BETWEEN + NULL-safe cast（計分 default 3；不含裸 `::int`）；(d) 五欄分流 SQL 含 `CASE WHEN <isCorp> THEN 0/default ELSE <自身屬性>`，且 gating default `'1'`（`COALESCE(NULLIF(cc.cus_sex,''),'1')`，空/NULL→個人）；(e) 縣市欄含 `LEFT(...,3)` + per-card default 常數；(f) AGE 含 `>100` 守門；(g) EDUCAT_BACK per-card default（S5→'08'）。
- **JS oracle（pipeline service spec）**：對稱 (a)–(g)；cus_sex 計分髒值/空→3、gating 空/NULL→個人；calcAgeYears >100→0。
- **EQ DoD（PG 真庫，JS↔SQL 逐列等價）**：§8 場景矩陣全覆蓋，含 cus_sex 兩 default 分離（計分 3 / gating 個人）兩路徑一致。
- **型別**：`tsc --noEmit -p tsconfig.build.json` 零錯誤（vitest 不做型別檢查，必跑）。
- **回歸**：`pnpm test` 全綠；F103 既有測試在新語意下通過或已更新。
- **驗收（US-163）**：dev 重跑 202606，`GROUP BY card_level/tier_level`。

## 12. 假設（Assumptions）

- **[A-F104-1]** cc 新欄（cus_sex/carea_no1/carea_no2/cellular/hpost_city/cpost_city/co_city）已由使用者 ETL（m301）載入 dev DB，欄名/型別如 §3 表（已查證 §13）。
- **[A-F104-2]** 法人分支保證人資料現為 0 筆/停用（使用者裁定），故法人分支取 0/default 為對 legacy 之有效複刻。CDMP 無保證人表。
- **[A-F104-3]** `ob_levelcard_score` 之三縣市欄 level1 全為縣市-only 3 字（dev 實測 25 個 distinct、max_len=3，§13）；台灣縣市名皆 3 字，`LEFT(...,3)` / `slice(0,3)` 安全。
- **[A-F104-4]** legacy dump（H/S/S5/E/E5/M/HM）涵蓋全部 production card_type；未列之 custom card 走 BR-F104-16。

## 13. 已查證事實（直接採用，不重新驗證）

- **OQ-159-01 RESOLVED**：稽核 `reference/SP/SP_GET_CUSTATTRIB_OB.sql`（UTF-16LE 解碼）確認其為「客戶特質 OBOUT 資格查詢」（查 `LLCUSTATTRIBMF`，輸出 CUSTID/CNTRNO/ATTRIBCD），**與 SALES_STS 無關**。SALES_STS 之 CASE 轉換在 `SP_OBLEVELCARD_*.sql` **就地完成**（H L40–43），key 為 `'中古車商'→'UCD'`、`'和潤'→'HFC'`、`ELSE 'HFC'`。現行引擎誤用 `'經銷商'`→**SALES_STS 須修**（AC-2，推翻 OQ「可能等價」）。
- **縣市比對粒度 RESOLVED**：dev `SELECT … FROM ob_levelcard_score WHERE column_name IN ('HPOST_NUM_NM','CPOST_NUM_NM','CO_NUM_NM')` → level1 共 25 distinct、`MAX(char_length)=MIN=3`（全縣市-only 3 字）。cc.hpost_city/cpost_city/co_city 為「縣市+區」（如 `'南投縣中寮鄉'`，6 字）。→ 引擎必須 `LEFT(value,3)` 比對（BR-F104-10）。legacy 自身亦 `LEFT(POSTAL_ADD,3)`（M L42）。
- **cus_sex 髒值**：dev `customer_core.cus_sex` 分佈 `'1'`(184萬)/`'2'`(166萬)/`'3'`(8萬)/空(3.7萬)/`'8'`/`'9'`/`'A'`/`'B'`/`'C'`/`'D'` 等。裸 `::int` 對 `'C'` 拋例外 → BR-F104-13 NULL-safe cast 為硬性要求。
- **cus_sex 空/NULL 分流走向 RESOLVED（2026-06-24，依 legacy = 個人）**：legacy `#CASE_CUS` `ISNULL(CUS.CUS_SEX,'')='' THEN '1'`（H L36），空/NULL cus_sex 之**分流(gating)視為個人 '1'**、用自身屬性；但 CUS_SEX **計分欄** 仍 `ISNULL(CUS_SEX,3)`（H L97）→ 缺值 3。**兩 default 刻意分離**（gating='1' 個人、score=3），BR-F104-04 / BR-F104-13a 已明載；下游 impl 不可混用。（先前版本誤採「CDMP 空→法人」，本輪修正為 legacy 語意。）
- **per-card 啟用矩陣（legacy 解碼）**：H={CUS_SEX,CAR_YEAR,ADD_UN_CAPITAL,PROJECT_TP,LIST_MONTH,CAREA_NO1,CAREA_NO2,SALES_STS}；S 另含 AGE/EDUCAT_BACK；S5={AGE,CAREA_NO1,CAREA_NO2,CAR_YEAR,EDUCAT_BACK,LOAN_RATE,CO_NUM_NM,HPOST_NUM_NM}；E={AGE,CAREA_NO1,CAREA_NO2,CAR_YEAR,EDUCAT_BACK,LIST_MONTH,LOAN_RATE,PROJECT_TP,SALES_STS}；E5={AGE,CAREA_NO2,CO_NUM_NM,EDUCAT_BACK,LIST_MONTH,LOAN_RATE,PROJECT_TP,CELLULAR}；M/HM={AGE,CAREA_NO1,CAREA_NO2,CO_NUM_NM,HPOST_NUM_NM,CPOST_NUM_NM}。**H/S 不計分縣市欄**（OQ-F104-02 RESOLVED 2026-06-24＝依 legacy：縣市欄/default 屬 S5/E5/M/HM；stories 中 HPOST H/S→'臺北市'、CO_NUM H→'金門縣'/S→'高雄市' 之 default 假設**有誤**，已於 §5 修正為 S5/E5/M/HM）。
- **EDUCAT_BACK S5 default = '08'**（L82；L81 之 '07' 為 20230323 註解廢除版）。

## 14. Related

- **legacy ground truth**：`reference/SP/SP_OBLEVELCARD_{H,S,S5,E,E5,M,HM}.sql`（UTF-16LE）、`reference/SP/SP_GET_CUSTATTRIB_OB.sql`（SALES_STS 無關，已查證）
- **AD（input 唯讀，本輪由 architect 修正）**：[AD-E07-10-L](../architecture-spec.md)（`architecture-spec.md` §4063–4093）
- **上游 feature**：[F103](F103-stage2-score-column-source-fix.md)（兩路徑對齊 AD、補 customer_core/ADD_UN_CAPITAL、通用 fallback、AGE 統一演算法 calcAgeYears）
- **下游 feature**：[F101](F101-stage3-4-proportional-assignment.md)（依 tier 分組）、[F064](F064-export-assignment-result.md)（匯出）、[F067](F067-compare-run-results.md)（差異報告）
- **來源 Story**：US-159 / US-160 / US-161 / US-162 / US-163（`docs/stories/epics/E07-app-customer-list-assignment/`）
- **引擎檔案**：`apps/api/src/modules/assignment/stage1/stage2to4-sql-builder.ts`、`apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts`
- **NFRs**：NFR-003、NFR-005
- **圖表**：[../diagrams/F104-cus-sex-branching-flow.mmd](../diagrams/F104-cus-sex-branching-flow.mmd)
